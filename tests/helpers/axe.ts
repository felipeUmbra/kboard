import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AxeResults } from "axe-core";

/**
 * Sprint 4.1 — axe-core integration.
 *
 * Why this exists
 * ---------------
 * The `a11y` CI job (contrast tokens + colour linter) proves our *palette*
 * is correct. It says nothing about the semantics of what we render: a
 * button with no accessible name, an input with no label, a heading level
 * skipped from h1 to h3, a landmark with no name. Those are the majority
 * of real WCAG failures and none of them are visible to a colour check.
 *
 * axe-core catches roughly a third of real accessibility problems, which
 * makes it a floor rather than a guarantee. `Docs/ACCESSIBILITY-TESTING.md`
 * records the manual screen-reader walkthrough (Sprint 4.2) that covers what
 * automation structurally cannot.
 *
 * Tag policy
 * ----------
 * We run WCAG 2.0/2.1/2.2 A + AA, plus the `best-practice` ruleset. AAA is
 * deliberately excluded: `Docs/IMPLEMENTATION-PLAN.md` (Sprint 5) treats
 * AAA as an opt-in tier, and running it here would fail the build on a
 * non-goal rather than on a defect.
 *
 * Violation policy
 * ----------------
 * `KNOWN_VIOLATIONS` is the complete list of accepted failures. Every entry
 * needs a `reason` explaining why the rule cannot be satisfied here; an entry
 * without one is a bug in this file, not an allowance. The list is guarded by
 * tests/unit/a11y-axe-policy.test.ts, which also fails if it stops being
 * empty — so adding an entry is always a visible, deliberate act.
 *
 * A *new* violation fails the test. Removing an entry from this list, or
 * weakening the tags above, is a behaviour change that must show up in
 * review.
 *
 * Timing
 * ------
 * axe-core's rule evaluation runs synchronously inside the page, so
 * `analyze()` cannot be interrupted and has no deadline of its own — it is
 * bounded only by the test timeout. The 30s default is not enough for this
 * suite in Firefox or WebKit, where every scan was failing on "Test timeout
 * exceeded" rather than on a violation. playwright.config.ts therefore
 * gives the two slow projects a 90s timeout, which raises the bound where it
 * belongs instead of loosening the Chromium matrix.
 */

export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
] as const;

export interface KnownViolation {
  /** axe rule id, e.g. "aria-hidden-focus". */
  rule: string;
  /** Why the product accepts this failure. Required. */
  reason: string;
  /**
   * Optional scope limit. Violations of `rule` are only tolerated when their
   * target nodes match this string. Use it when a rule is acceptable in one
   * surface but not another.
   */
  target?: string;
}

/**
 * Accepted deviations, each with a written justification.
 *
 * Currently EMPTY, and that is the result of work rather than a starting
 * point: axe-core reported nine rules across the scanned surfaces in
 * Sprint 4.1 and every one was fixed in the product rather than listed
 * here. The fixes are enumerated in Docs/IMPLEMENTATION-PLAN.md.
 *
 * Do NOT add an entry to silence a failure you have not understood. If a
 * rule genuinely cannot be satisfied — a third-party widget we do not
 * control, a pattern axe misreads — record it with the specific reason.
 * tests/unit/a11y-axe-policy.test.ts fails on an entry without one, and
 * fails if the list ever stops being empty, so any addition is deliberate.
 */
export const KNOWN_VIOLATIONS: KnownViolation[] = [];

/** Compact, human-readable rendering of violations for assertion messages. */
export function formatViolations(
  violations: AxeResults["violations"],
): string {
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 4)
        .map((n) => {
          const summary = n.failureSummary
            ? `\n          ${n.failureSummary.split("\n").slice(1).join("\n          ").trim()}`
            : "";
          const html = n.html
            ? `\n          html: ${n.html.slice(0, 180)}`
            : "";
          return `\n      - ${n.target.join(" ")}${summary}${html}`;
        })
        .join("");
      const more =
        v.nodes.length > 4 ? `\n      …and ${v.nodes.length - 4} more node(s)` : "";
      return `  [${v.impact ?? "unknown"}] ${v.id}: ${v.help}` + targets + more;
    })
    .join("\n");
}

export interface AxeOptions {
  /**
   * Restrict the scan to a sub-tree. Accepts any Playwright selector.
   * Defaults to the whole document.
   */
  include?: string;
  /** Human label used in failure output, e.g. "board view". */
  label?: string;
  /** Force light or dark rendering for the scan. */
  colorScheme?: "light" | "dark";
}

/**
 * Runs axe-core against `page` and fails the test on any violation that is
 * not in KNOWN_VIOLATIONS.
 *
 * Returns the raw results so a caller can assert on specifics (for example
 * that a landmark count grew) without paying for a second scan.
 */
export async function expectNoAxeViolations(page: Page, opts: AxeOptions = {}) {
  const { label = "page", include, colorScheme } = opts;

  if (colorScheme) {
    // The app has no in-app theme toggle; dark mode is driven purely by the
    // OS setting (`@media (prefers-color-scheme: dark)` in tokens.css), so
    // emulating the media feature is the only way to scan the dark palette.
    await page.emulateMedia({ colorScheme });
  }

  const builder = new AxeBuilder({ page }).withTags([...AXE_TAGS]);
  if (include) builder.include(include);

  const results = await builder.analyze();

  const unexpected = results.violations.filter((v) =>
    !KNOWN_VIOLATIONS.some(
      (kv) =>
        kv.rule === v.id &&
        (!kv.target ||
          v.nodes.some((n) => n.target.join(" ").includes(kv.target!))),
    ),
  );

  // Assert on the COUNT, not the array. Playwright's expect() prints a full
  // structural diff for array mismatches, and an axe Result object is several
  // hundred lines of nested `all`/`any`/`none` checks — the summary below is
  // what a human actually needs.
  expect(
    unexpected.length,
    `axe-core found ${unexpected.length} unexpected violation(s) on ${label}` +
      (unexpected.length ? `:\n${formatViolations(unexpected)}` : ""),
  ).toBe(0);

  return results;
}

/**
 * Formats a scan result for on-screen reporting without failing. Used by the
 * summary test that records which surfaces are covered.
 */
export function summariseAxeResults(results: AxeResults): string {
  return [
    `violations: ${results.violations.length}`,
    `passes: ${results.passes.length}`,
    `needs review: ${results.incomplete.length}`,
    ...(results.incomplete.length
      ? [`  incomplete: ${results.incomplete.map((i) => i.id).join(", ")}`]
      : []),
  ].join("\n");
}
