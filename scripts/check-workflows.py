"""Validate the GitHub Actions workflows.

Parses each workflow and asserts two things:

1. The Playwright browser cache wiring is correct. Added after CI failed 90 of
   94 cross-browser tests: all three browser caches shared one key derived only
   from package-lock.json, so the first job to save populated the cache and
   every other job saw cache-hit=true, skipped `playwright install`, and failed
   at launch with "Executable doesn't exist". The cause was CI wiring, so no
   test could have caught it.

2. Anything invoking the Copilot CLI has a token it can actually authenticate
   with, and skips itself loudly when that token is absent. Added after the
   scheduled defect hunt failed: it passed secrets.GITHUB_TOKEN to the CLI,
   which refuses installation tokens, so the job died with "Error:
   Authentication failed" after 34 seconds of building. Neither the agent nor
   the repo's test suite could see this - it was only ever going to fail on a
   schedule, at 03:17, to nobody.

Not part of any test suite - a guard on the workflows themselves.
"""
import sys
import glob
import re
import yaml

# Which cache-key browser scopes each workflow must contain.
EXPECTED_KEY_PARTS = {
    "playwright.yml": {"chromium", "ff-wk"},
    "deploy.yml": {"chromium"},
}

# The Copilot CLI rejects the automatic GITHUB_TOKEN: it accepts a
# fine-grained PAT with "Copilot Requests", a Copilot CLI OAuth token, or a
# GitHub CLI OAuth token. An installation token is none of those.
COPILOT_TOKEN_ENV = "COPILOT_GITHUB_TOKEN"

ok = True


def fail(msg):
    global ok
    ok = False
    print(f"FAIL {msg}")


def path_is_browser_cache(step):
    with_ = step.get("with", {}) or {}
    return step.get("uses", "").startswith("actions/cache") and (
        "ms-playwright" in str(with_.get("path", ""))
    )


def step_runs_copilot_cli(step):
    """True for a step that shells out to the Copilot CLI."""
    return bool(re.search(r"@github/copilot|\bcopilot\b\s+-p\b", str(step.get("run", ""))))


def check_copilot_auth(path, doc):
    """The agent must have a usable token, and must skip when it has none.

    Two distinct failures are checked, because they need different fixes:

    - no Copilot token anywhere  -> the agent can never authenticate
    - a step that runs the CLI with no condition guarding it -> guaranteed
      red build until someone reads a 03:17 log
    """
    for job_name, job in doc.get("jobs", {}).items():
        env = job.get("env", {}) or {}
        token_set = COPILOT_TOKEN_ENV in env
        cli_steps = [s for s in job.get("steps", []) if step_runs_copilot_cli(s)]

        if not cli_steps:
            continue

        if not token_set:
            fail(
                f"{path}:{job_name}: runs the Copilot CLI but does not pass "
                f"{COPILOT_TOKEN_ENV}; GITHUB_TOKEN cannot authenticate it"
            )
            continue
        for step in cli_steps:
            # An unconditional CLI step fails the job every time the token is
            # absent. The check must be inverted: run only when the token IS
            # set, so a missing optional secret is a skip with a notice.
            cond = str(step.get("if", ""))
            if not cond:
                fail(
                    f"{path}:{job_name}: '{step.get('name', 'copilot step')}' "
                    f"runs the Copilot CLI unconditionally; it will fail the "
                    f"job whenever {COPILOT_TOKEN_ENV} is absent"
                )
            elif f"{COPILOT_TOKEN_ENV} != ''" not in cond:
                fail(
                    f"{path}:{job_name}: '{step.get('name', 'copilot step')}' "
                    f"is gated on {cond!r}, which does not test whether "
                    f"{COPILOT_TOKEN_ENV} is set"
                )
            else:
                print(
                    f"OK   {path}:{job_name}: CLI step gated on "
                    f"{COPILOT_TOKEN_ENV} being set"
                )

        # There must be a visible notice somewhere, or a skip is silent and
        # reads as "the hunt ran and found nothing".
        names = " ".join(str(s.get("name", "")) + str(s.get("run", "")) for s in job.get("steps", []))
        if "notice" not in names.lower():
            fail(
                f"{path}:{job_name}: no step emits a ::notice:: explaining the "
                f"skip, so a skipped hunt is indistinguishable from a clean one"
            )
        else:
            print(f"OK   {path}:{job_name}: skip is announced with a notice")


paths = sorted(
    glob.glob(".github/workflows/*.yml") + glob.glob(".github/workflows/*.yaml")
)
if not paths:
    # A typo'd glob would otherwise let this check pass vacuously.
    fail("no workflow files found under .github/workflows/")
    paths = []

for path in paths:
    with open(path, encoding="utf-8") as fh:
        try:
            doc = yaml.safe_load(fh)
        except Exception as exc:  # noqa: BLE001
            fail(f"{path}: YAML parse error: {exc}")
            continue

    print(f"OK   {path} parses; jobs: {', '.join(doc.get('jobs', {}))}")

    name = path.replace("\\", "/").split("/")[-1]

    check_copilot_auth(path, doc)

    want = EXPECTED_KEY_PARTS.get(name)
    if not want:
        continue

    keys = []
    for job_name, job in doc.get("jobs", {}).items():
        for step in job.get("steps", []):
            if path_is_browser_cache(step):
                keys.append(step["with"]["key"])
            # A cache-hit guard is what turns a stale cache into a permanent
            # failure: it disables the step that would repair it.
            if "playwright install" in str(step.get("run", "")):
                if step.get("if"):
                    fail(
                        f"{path}:{job_name}: 'playwright install' is guarded by "
                        f"a condition ({step['if']}) - a cache hit must never "
                        f"skip the install"
                    )
                else:
                    print(f"OK   {path}:{job_name}: install is unconditional")

    tags = {part for part in ("chromium", "ff-wk") for key in keys if part in key}
    missing = want - tags
    if missing:
        fail(f"{path}: cache keys missing browser scope {sorted(missing)}")
    else:
        print(f"OK   {path}: cache keys are browser-scoped -> {sorted(keys)}")

print("\nRESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
