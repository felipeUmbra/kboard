#!/usr/bin/env node
/**
 * scripts/check-contrast.js
 *
 * Verifies that every semantic color token in src/styles/tokens.css meets
 * its WCAG contrast threshold against EVERY background it can appear on.
 *
 * Key correctness point: the binding constraint in the light theme is
 * `--color-bg-elevated` (#ebecf0) — the sidebar / card-type panel background —
 * NOT white. #ebecf0 is darker than white, so ratios against it are lower and
 * it fails first. Checking white alone produces false passes.
 *
 * Usage:  node scripts/check-contrast.js
 * Exit:   0 = all AA checks pass, 1 = at least one AA check failed.
 *         AAA results are informational and never affect the exit code.
 */

function getLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const a = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(fg, bg) {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Minimum ratio across every background the foreground can sit on. */
const worstCase = (fg, backgrounds) =>
  Math.min(...backgrounds.map((bg) => contrastRatio(fg, bg)));

// Backgrounds each foreground may appear against, per theme.
const LIGHT_BGS = ["#ffffff", "#f4f5f7", "#ebecf0"]; // surface, bg, bg-elevated
const DARK_BGS = ["#22272b", "#1d2125"]; // surface, bg

// ---------------------------------------------------------------------------
// TARGET palette — these are the values Sprint 1 (AA) and Sprint 5 (AAA)
// propose. Update this file in the same commit that edits tokens.css.
// ---------------------------------------------------------------------------
const AA = 4.5;

const lightTheme = {
  "text": ["#172b4d", LIGHT_BGS],
  "text-muted": ["#526075", LIGHT_BGS],
  "accent": ["#005b93", LIGHT_BGS],
  "success": ["#276b2b", LIGHT_BGS],
  "danger": ["#c62828", LIGHT_BGS],
  "warning": ["#9c4f00", LIGHT_BGS],
};

const darkTheme = {
  "text": ["#b6c2cf", DARK_BGS],
  "text-muted": ["#8c9bab", DARK_BGS],
  "accent": ["#4c9aff", DARK_BGS],
  "success": ["#66bb6a", DARK_BGS],
  "danger": ["#ff9e99", DARK_BGS],
  "warning": ["#ffd54f", DARK_BGS],
};

const aaaTheme = {
  "success (AAA)": ["#144a17", LIGHT_BGS],
  "danger (AAA)": ["#8e0000", LIGHT_BGS],
  "warning (AAA)": ["#743a00", LIGHT_BGS],
};

function report(title, table, threshold, fatal) {
  console.log(`\n=== ${title} ===`);
  let ok = true;
  for (const [name, [fg, bgs]] of Object.entries(table)) {
    const ratio = worstCase(fg, bgs);
    const pass = ratio >= threshold;
    if (fatal) ok = ok && pass;
    const mark = pass ? "PASS" : fatal ? "FAIL" : "BELOW (non-fatal)";
    console.log(
      `  ${name.padEnd(18)} ${fg}  worst ${ratio.toFixed(2)}:1  ${mark}`,
    );
  }
  return ok;
}

const aaOk =
  report(`LIGHT THEME (AA, worst of ${LIGHT_BGS.length} backgrounds)`, lightTheme, AA, true) &
  report(`DARK THEME (AA, worst of ${DARK_BGS.length} backgrounds)`, darkTheme, AA, true)
    ? 1
    : 0;

report("AAA TIER (Sprint 5, optional - non-fatal)", aaaTheme, 7, false);

console.log(
  aaOk
    ? "\nAll AA contrast checks passed."
    : "\nSome AA checks FAILED - fix before shipping.",
);
process.exit(aaOk ? 0 : 1);
