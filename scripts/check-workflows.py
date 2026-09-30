"""Validate the GitHub Actions workflows.

Parses each workflow and asserts the Playwright browser cache wiring is
correct. Added after CI failed 90 of 94 cross-browser tests: all three
browser caches shared one key derived only from package-lock.json, so the
first job to save populated the cache and every other job saw
cache-hit=true, skipped `playwright install`, and failed at launch with
"Executable doesn't exist". The cause was CI wiring, so no test could have
caught it.

Not part of any test suite - a guard on the workflows themselves.
"""
import sys
import glob
import yaml

# Which cache-key browser scopes each workflow must contain.
EXPECTED_KEY_PARTS = {
    "playwright.yml": {"chromium", "ff-wk"},
    "deploy.yml": {"chromium"},
}

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
