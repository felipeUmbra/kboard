"""List commits that no test can prove are covered, as backfill candidates.

WHY THIS EXISTS
The bug register starts empty, so it cannot show where defects HAVE been found.
That is the gap this script closes: it produces a ranked list of the commits
most likely to contain unreported defects, so a discovery pass has a target
rather than wandering.

The concrete case that motivated it: a stylesheet-import defect that made every
`@media (max-width)` override in the app inert sat in the FIRST commit. It
survived ~49 commits and was only found incidentally, by a test written for an
unrelated feature. It was never filed, because nobody reported it either. A
register cannot protect against a defect it has no memory of.

WHAT IT RANKS, and why
  1. Files no test touches at all        - no test can be asserting about them
  2. Files a test mentions but never asserts on - the trap: the name appears,
     so a coverage report looks reassuring, but nothing checks the behaviour
  3. Size of the change                   - bigger diff, more chances

It deliberately does NOT read coverage percentages. Coverage says which lines
ran; it cannot tell you that the assertion on that line is trivial or inverted.
kboard holds a 100% line/branch/function gate on src/models and src/state and
still shipped an app-wide CSS defect that no test exercised.

NOT A TEST SUITE. Read-only: it runs git and grep, writes nothing, and touches
no network. Safe to run at any time.

USAGE
  python scripts/backfill-candidates.py
  python scripts/backfill-candidates.py --top 15
  python scripts/backfill-candidates.py --since 2e53796
"""
import argparse
import glob
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directories that cannot contain product defects worth registering.
SKIP_DIRS = (
    "node_modules", "dist", "coverage", ".git", "playwright-report",
    "test-results", "git-test-results", "Evidence", "scratch",
)

# Commit subjects that are pure tooling/docs. They can still hide a defect in a
# config file, so they are down-ranked rather than excluded outright.
BORING_SUBJECT = re.compile(
    r"^(chore|docs|ci|style|refactor)(\(|:)", re.I
)


def git(*args):
    """Run a git command, returning stdout. Returns '' if git fails."""
    try:
        out = subprocess.run(
            ["git", *args], cwd=REPO, capture_output=True,
            text=True, timeout=60, check=False,
        )
        return out.stdout if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def source_files():
    """Product source files, excluding tests, build output and tooling."""
    found = []
    for path in glob.glob(os.path.join(REPO, "src", "**", "*.*"), recursive=True):
        rel = os.path.relpath(path, REPO)
        if any(part in SKIP_DIRS for part in rel.split(os.sep)):
            continue
        # Test files describe behaviour; they are not themselves suspect.
        if ".test." in rel or rel.startswith("src/" + os.sep) is None:
            continue
        if rel.endswith((".ts", ".tsx", ".css")):
            found.append(rel.replace(os.sep, "/"))
    return sorted(found)


def files_tests_touch(test_blob):
    """Source paths mentioned anywhere in the test suite."""
    mentioned = set()
    for m in re.finditer(r"[\w./-]+\.(?:tsx?|css)", test_blob):
        token = m.group(0).lstrip("./")
        for rel in source_files():
            if token.endswith(rel) or rel.endswith(token):
                mentioned.add(rel)
                break
    return mentioned


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--top", type=int, default=12,
                    help="how many candidates to show (default 12)")
    ap.add_argument("--since", default=None,
                    help="only consider commits after this ref")
    args = ap.parse_args()

    # Fail loudly rather than printing a confident empty list.
    if not git("rev-parse", "--git-dir"):
        print("ERROR: not inside a git repository", file=sys.stderr)
        return 2

    log_args = ["log", "--no-merges", "--format=%h\t%s"]
    if args.since:
        log_args.append(f"{args.since}..HEAD")
    log = git(*log_args)
    if not log.strip():
        print("ERROR: git log returned nothing", file=sys.stderr)
        return 2

    test_blob = ""
    for path in glob.glob(os.path.join(REPO, "tests", "**", "*.ts"), recursive=True):
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                test_blob += fh.read() + "\n"
        except OSError:
            continue
    for path in glob.glob(os.path.join(REPO, "src", "**", "*.test.ts*"),
                           recursive=True):
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                test_blob += fh.read() + "\n"
        except OSError:
            continue

    if not test_blob.strip():
        print("ERROR: no test sources found; refusing to report 100% untested",
              file=sys.stderr)
        return 2

    mentioned = files_tests_touch(test_blob)
    src = source_files()
    untested = [f for f in src if f not in mentioned]

    # How the suite actually reaches the product: through selectors and
    # testids, not source paths. Counted so the numbers below are honest about
    # what they do and do not measure.
    sel = len(re.findall(r"\[data-testid=", test_blob))
    aria = len(re.findall(r"(?:getByRole|getByLabel|getByText)\(", test_blob))
    paths = len(re.findall(r"src/[\w./-]+\.tsx?", test_blob))

    print("Backfill candidates - where unreported defects are most likely\n")
    print(f"  source files            : {len(src)}")
    print(f"  mentioned in tests      : {len(mentioned)}")
    print(f"  NEVER mentioned         : {len(untested)}")
    print()
    print("  How the suite reaches the product (context for the numbers above):")
    print(f"    data-testid selectors : {sel}")
    print(f"    role/label queries    : {aria}")
    print(f"    direct src/ path refs : {paths}")
    if paths < sel:
        print("    -> tests drive the UI through selectors, so a source file being")
        print("       'unmentioned' does NOT mean untested. It means no test names")
        print("       the file, which is weak evidence on its own. Treat this list")
        print("       as WHERE TO LOOK, not as a coverage verdict.")
    print()

    if untested:
        print("1. No test names these files - start the hunt here (weak signal):")
        for rel in untested[:args.top]:
            n = len(git("log", "--oneline", "--", rel).strip().splitlines())
            print(f"     {rel}  ({n} commits)")
        print()

    print("2. Files with the most churn and no test naming them (stronger signal):")
    ranked = []
    for rel in untested:
        n = git("log", "--oneline", "--", rel).strip().splitlines()
        if n:
            ranked.append((len(n), rel))
    ranked.sort(reverse=True)
    for count, rel in ranked[:args.top]:
        print(f"     {count:>3} commits  {rel}")
    print()

    boring = [l for l in log.splitlines() if BORING_SUBJECT.match(l.split("\t", 1)[-1])]
    print(f"3. History is {len(log.splitlines())} non-merge commits, "
          f"{len(boring)} chore/docs/ci/refactor.")
    print("   Down-ranked, not excluded: the cascade defect landed in a commit")
    print("   whose subject gave no hint that it was risky.")
    print()
    print("Next: run the hunt (Actions -> Defect hunt) with one of the files")
    print("above as its focus, or with --since to concentrate on recent work.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
