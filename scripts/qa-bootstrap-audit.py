"""Audit a repo's existing quality flow before bootstrapping anything.

WHY THIS EXISTS
Bootstrapping a repo that already has half a flow is a common and expensive
mistake: you scaffold a second runner, a second selector layer, or a CI job
that duplicates an existing one, and the repo now has two sources of truth.
The fix is to look before scaffolding.

This is READ-ONLY. It runs no tests, hits no network, and writes nothing. It is
safe to run on any repo at any time, including one you have never seen.

It also reports the gap that matters most and is easiest to miss: quality rules
written into an agent file that NOTHING EVER INVOKES. An agent is only
invoked by a human or a workflow, so a documented filing rule is inert until
something calls it. That failure is invisible in every other check here - all
the files can be present and the process still dead.

USAGE
  python scripts/qa-bootstrap-audit.py
  python scripts/qa-bootstrap-audit.py --json
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

REPO = os.getcwd()

# Directories that hold generated output, not source.
SKIP_DIRS = {"node_modules", "dist", "build", "coverage", ".git",
             "playwright-report", "test-results", "htmlcov"}

# layer -> (human name, globs that mean "this layer exists")
LAYERS = [
    ("unit", "Unit / integration", [
        "vitest.config.*", "jest.config.*", "vitest.workspace.*",
        "karma.conf.*", "**/*.test.js", "**/*.test.ts", "**/*.test.tsx",
        "**/*.spec.js", "**/*.spec.ts",
    ]),
    ("e2e", "E2E", [
        "playwright.config.*", "cypress.config.*", "cypress.json",
        "wdio.conf.*", "test/e2e/**", "tests/e2e/**", "e2e/**",
        "playwright/**",
    ]),
    ("a11y", "Accessibility scanning", [
        "**/axe*.{js,ts,mjs,cjs}", "**/*a11y*.{js,ts,mjs,cjs,spec.ts}",
        "**/*contrast*.{js,ts,mjs,cjs}", ".pa11y*",
        "**/lighthou*.{js,json,yml,yaml}",
    ]),
    ("ci", "CI workflows", [".github/workflows/*.yml", ".github/workflows/*.yaml"]),
]

# Layer -> the gate that proves it actually gates something.
GATE_EVIDENCE = {
    "unit": ["coverage", "threshold", "test:unit", "test"],
    "e2e": ["test:e2e", "playwright", "cypress"],
    "a11y": ["a11y", "contrast", "axe", "lighthouse"],
    "ci": ["run:", "npm run", "npx "],
}

AGENT_GLOBS = [
    ".github/agents/*.md",
    ".claude/agents/*.md",
    ".cursor/agents/*.md",
    "**/.github/agents/*.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
    ".windsurfrules",
]


def read(path, limit=None):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            data = fh.read()
        return data[:limit] if limit else data
    except OSError:
        return ""


def expand_braces(pattern):
    """Expand `{a,b}` alternatives.

    Python's glob does NOT support brace expansion - `**/*.{js,ts}` silently
    matches nothing. Since a silent zero-match looks exactly like "this layer
    does not exist", that failure mode would report a healthy repo as having no
    accessibility scanning at all. Hence the explicit expansion.
    """
    m = re.search(r"\{([^{}]*)\}", pattern)
    if not m:
        return [pattern]
    out = []
    for alt in m.group(1).split(","):
        out.extend(expand_braces(pattern[:m.start()] + alt.strip()
                                 + pattern[m.end():]))
    return out


def find_all(patterns):
    """Expand globs to a set of repo-relative paths, ignoring build output."""
    found = set()
    for pat in patterns:
        for expanded in expand_braces(pat):
            for p in glob.glob(os.path.join(REPO, expanded), recursive=True):
                rel = os.path.relpath(p, REPO).replace(os.sep, "/")
                if any(part in SKIP_DIRS for part in rel.split("/")):
                    continue
                found.add(rel)
    return found


def has(*paths):
    return any(os.path.exists(os.path.join(REPO, p)) for p in paths)


def pkg_scripts():
    raw = read("package.json")
    if not raw:
        return {}, {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}, {}
    return data.get("scripts", {}) or {}, data.get("devDependencies", {}) or {}


def stack():
    """Detect the stack, so the recommendation is grounded rather than generic."""
    deps = pkg_scripts()[1]
    all_deps = {**deps}
    pj = read("package.json")
    for name in re.findall(r'"([a-z@][\w@/.-]*)"\s*:\s*"', pj):
        all_deps.setdefault(name, "")
    marks = []
    for label, needle in [
        ("TypeScript", "typescript"), ("React", "react"),
        ("Vue", "vue"), ("Svelte", "svelte"), ("Angular", "@angular/core"),
        ("Next.js", "next"), ("Vite", "vite"), ("Express", "express"),
        ("Fastify", "fastify"), ("Django", "django"), ("Flask", "flask"),
    ]:
        if any(needle in d for d in all_deps):
            marks.append(label)
    for label, f in [("Python", "requirements.txt"), ("Python", "pyproject.toml"),
                     ("Go", "go.mod"), ("Rust", "Cargo.toml"),
                     ("Ruby", "Gemfile"), (".NET", "*.csproj")]:
        if glob.glob(os.path.join(REPO, f)):
            marks.append(label)
            break
    return marks or ["unknown"]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    report = {"stack": stack(), "layers": {}, "gaps": [], "warnings": []}

    # ---- layers -------------------------------------------------------
    for key, name, patterns in LAYERS:
        hits = find_all(patterns)
        report["layers"][key] = {"name": name, "present": bool(hits),
                                 "count": len(hits)}

    scripts, _ = pkg_scripts()

    # ---- gates, per layer ---------------------------------------------
    ci_files = sorted(find_all([".github/workflows/*.yml",
                                ".github/workflows/*.yaml"]))
    ci_blob = "".join(read(f) for f in ci_files)
    pkg_blob = json.dumps(scripts) if scripts else ""

    for key, _name, _pats in LAYERS:
        if key == "ci":
            continue
        needles = GATE_EVIDENCE[key]
        wired = any(n in ci_blob for n in needles) or any(
            n in pkg_blob for n in needles
        )
        report["layers"][key]["wired"] = wired

    # ---- agent file ---------------------------------------------------
    agents = find_all(AGENT_GLOBS)
    report["layers"]["agent"] = {"name": "Project agent file",
                                 "present": bool(agents), "count": len(agents)}
    agent_blob = "".join(read(f) for f in sorted(agents))

    rules_written = bool(
        re.search(r"file.{0,40}(issue|bug)|issue.{0,30}file", agent_blob, re.I)
    )
    invoked = bool(
        re.search(r"--agent\b|subagent|runSubagent|agents/qa|workflow_run"
                  r"|runSubagent", ci_blob, re.I)
    )
    report["layers"]["agent"]["filing_rules_written"] = rules_written
    report["layers"]["agent"]["invoked_by_ci"] = invoked

    # ---- the finding that matters -------------------------------------
    if rules_written and not invoked:
        report["warnings"].append({
            "id": "agent-never-invoked",
            "severity": "high",
            "message": "Agent file documents bug-filing rules, but NO workflow "
                       "invokes the agent. An uninvoked rule is a comment that "
                       "reads like a guarantee. The register will stay empty.",
        })
    if rules_written and not re.search(
            r"retest|re-?run the reproduction|only qa closes", agent_blob, re.I
    ):
        report["warnings"].append({
            "id": "no-retest-before-close",
            "severity": "medium",
            "message": "No retest-before-close policy. Issues will be closed by "
                       "'fixed' rather than by evidence the fix holds.",
        })

    for key, info in report["layers"].items():
        if info["present"] and key != "agent" and not info.get("wired", True):
            report["gaps"].append(
                f"{info['name']} exists ({info['count']} files) but is NOT "
                f"referenced by any npm script or CI job - it cannot gate."
            )

    if not any(v["present"] for v in report["layers"].values()):
        report["gaps"].append("No quality flow at all - full bootstrap needed.")

    # ---- output -------------------------------------------------------
    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("QA bootstrap audit\n")
    print(f"  stack: {', '.join(report['stack'])}\n")
    print("  layer                    present   wired")
    for key, info in report["layers"].items():
        mark = "yes" if info["present"] else "NO"
        wired = info.get("wired")
        w = ("yes" if wired else "NO") if wired is not None else "-"
        count = f" ({info['count']})" if info.get("count") else ""
        print(f"  {info['name']:<24} {mark:<8} {w}{count}")

    if report["warnings"]:
        print("\n  WARNINGS")
        for w in report["warnings"]:
            print(f"  [{w['severity'].upper()}] {w['id']}: {w['message']}")

    if report["gaps"]:
        print("\n  GAPS")
        for g in report["gaps"]:
            print(f"  - {g}")

    print("\n  Next: agree the frameworks with the user BEFORE scaffolding. "
          "Do not assume.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
