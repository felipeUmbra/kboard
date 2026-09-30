"""Assert every pull_request-triggered workflow gates Dev-targeted PRs.

GitHub's `pull_request.branches` filters on the PR's BASE branch, not the
head. This repo opens PRs Dev -> main, so a filter of `branches: [main]`
alone leaves every one of them with zero status checks. PR #9 hit exactly
that: statusChecks came back empty and nothing ran.

Run: python scripts/check-pr-triggers.py
"""
import glob
import sys

import yaml

DEV = "Dev"

failures = []
rows = []

for path in sorted(glob.glob(".github/workflows/*.yml") + glob.glob(".github/workflows/*.yaml")):
    with open(path, encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)

    name = path.replace("\\", "/").split("/")[-1]
    # YAML 1.1 parses a bare `on` key as boolean True.
    triggers = doc.get("on", doc.get(True)) or {}

    pr = triggers.get("pull_request")
    push = triggers.get("push")

    if not pr:
        rows.append((name, "-", push.get("branches") if push else "-"))
        continue

    bases = pr.get("branches")
    if bases is None:
        # No filter means every base branch is gated.
        rows.append((name, "ALL (no filter)", "-"))
        continue

    rows.append((name, ", ".join(bases), push.get("branches") if push else "-"))
    if DEV not in bases:
        failures.append(
            f"{name}: pull_request.branches is {bases}, which omits '{DEV}'. "
            f"PRs targeting {DEV} would run no checks at all."
        )

width = max(len(r[0]) for r in rows)
print(f"{'workflow'.ljust(width)}  pull_request base      push base")
for name, base, push_base in rows:
    print(f"{name.ljust(width)}  {base:<20}  {push_base}")

print()
if failures:
    for f in failures:
        print(f"FAIL {f}")
    print("\nRESULT: FAIL")
    sys.exit(1)

print(f"OK every pull_request workflow gates '{DEV}'-targeted PRs")
print("\nRESULT: PASS")
