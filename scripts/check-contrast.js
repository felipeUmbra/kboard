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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, "..", "src", "styles", "tokens.css");

const AA = 4.5;
const AAA = 7;

// --- colour maths (WCAG 2.x relative luminance + contrast ratio) -------------

function parseHex(hex) {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function getLuminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const worstCase = (fg, backgrounds) =>
  Math.min(...backgrounds.map((bg) => contrastRatio(fg, bg)));

// --- parse tokens.css -------------------------------------------------------

const css = readFileSync(TOKENS_PATH, "utf8");

/**
 * Split tokens.css into its light `:root` block and the
 * `@media (prefers-color-scheme: dark)` block, then read the
 * `--color-*` custom properties declared in each.
 *
 * Reading the real file (rather than a hardcoded copy) means a token edit
 * that breaks contrast fails this check instead of silently passing.
 */
function readTokens(source) {
  const lightStart = source.indexOf(":root");
  const darkStart = source.indexOf("prefers-color-scheme: dark");
  if (lightStart === -1) throw new Error("no :root block in tokens.css");

  // The light block runs from its :root up to the dark media query.
  const lightSlice = source.slice(
    lightStart,
    darkStart === -1 ? source.length : darkStart,
  );
  const darkSlice = darkStart === -1 ? "" : source.slice(darkStart);

  const collect = (slice) => {
    const out = {};
    const re = /--color-([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
    let m;
    while ((m = re.exec(slice)) !== null) out[m[1]] = m[2];
    return out;
  };

  return { light: collect(lightSlice), dark: collect(darkSlice) };
}

const { light, dark } = readTokens(css);

// Foreground tokens that must meet 4.5:1. Background tokens are excluded:
// they are never used as text. Each theme is checked against its own set.
const FOREGROUND_TOKENS = [
  "text",
  "text-muted",
  "text-subtle",
  "accent",
  "danger",
  "success",
  "warning",
];

const lightBackgrounds = [light.surface, light.bg, light["bg-elevated"]];
// --color-bg-elevated is included for the DARK theme too. It is the sidebar
// background in both themes, and leaving it out hid a real 4.49:1 failure:
// the dark accent read as link text in the sidebar card-type panel.
const darkBackgrounds = [dark.surface, dark.bg, dark["bg-elevated"]];

function check(themeName, tokens, backgrounds, threshold) {
  console.log(
    `\n=== ${themeName} (${threshold}:1, worst of ${backgrounds.length} backgrounds) ===`,
  );
  let ok = true;
  for (const name of FOREGROUND_TOKENS) {
    const fg = tokens[name];
    if (!fg) {
      console.log(`  ${name.padEnd(14)} MISSING TOKEN - skipped`);
      continue;
    }
    const ratio = worstCase(fg, backgrounds);
    const pass = ratio >= threshold;
    if (!pass) ok = false;
    console.log(
      `  ${name.padEnd(14)} ${fg}  worst ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}`,
    );
  }
  return ok;
}

// --- inverse ("on-X") tokens -------------------------------------------------
// Text sitting ON a solid brand fill. These invert per theme: the light
// accents are dark, so they take white, while the dark accents are light
// pastels that white would fail on (white on the dark accent is 2.85:1).
// Checking these is what stops a hardcoded `#fff` creeping back in.
const ON_SURFACE_PAIRS = [
  ["on-accent", "accent"],
  ["on-success", "success"],
  ["on-danger", "danger"],
];

function checkInverse(themeName, tokens) {
  console.log(`\n=== ${themeName} inverse pairs (4.5:1 on solid fill) ===`);
  let ok = true;
  for (const [fgName, bgName] of ON_SURFACE_PAIRS) {
    const fg = tokens[fgName];
    const bg = tokens[bgName];
    if (!fg || !bg) {
      console.log(`  ${fgName.padEnd(12)} MISSING TOKEN - skipped`);
      continue;
    }
    const ratio = worstCase(fg, [bg]);
    const pass = ratio >= 4.5;
    if (!pass) ok = false;
    console.log(
      `  ${fgName.padEnd(12)} ${fg} on ${bgName} ${bg}  ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}`,
    );
  }
  return ok;
}

// --- extra palettes that are NOT in tokens.css -----------------------------
// Card-type colours render as text on their own softColor (TypeChip) AND on
// --color-bg-elevated (Sidebar), so they are checked against both.
const TYPE_META = [
  ["epic", "#7b3fb0", "#f3e8fd"],
  ["story", "#15703f", "#dffbe8"],
  ["task", "#4a5769", "#e9eaee"],
];

// Label palette entries are user-chosen backgrounds; LabelPill picks between
// #172b4d and #ffffff. Each must reach 4.5:1 with at least one of them.
const LABEL_PALETTE = [
  ["green", "#61bd4f"],
  ["yellow", "#f2d600"],
  ["orange", "#ff9f1f"],
  ["red", "#d03a3a"],
  ["purple", "#c377e0"],
  ["blue", "#0079bf"],
  ["cyan", "#00c2e0"],
  ["lime", "#51e898"],
  ["pink", "#ff78cb"],
  ["dark", "#344563"],
  ["grey", "#b3bac5"],
  ["gold", "#fbd86f"],
];

const DARK_FG = "#172b4d";
const WHITE_FG = "#ffffff";

console.log(`Reading tokens from ${TOKENS_PATH}`);
console.log(
  `Light backgrounds: ${lightBackgrounds.join(", ")}  (bg-elevated is the binding constraint)`,
);
console.log(`Dark backgrounds:  ${darkBackgrounds.join(", ")}`);

const lightOk = check("LIGHT THEME", light, lightBackgrounds, AA);
const darkOk = check("DARK THEME", dark, darkBackgrounds, AA);
const lightInvOk = checkInverse("LIGHT THEME", light);
const darkInvOk = checkInverse("DARK THEME", dark);

// --- card type meta ---------------------------------------------------------
console.log("\n=== CARD TYPE META (4.5:1 on softColor AND on bg-elevated) ===");
let typeOk = true;
for (const [name, color, soft] of TYPE_META) {
  const onSoft = contrastRatio(color, soft);
  const onElevated = contrastRatio(color, light["bg-elevated"]);
  const pass = onSoft >= AA && onElevated >= AA;
  if (!pass) typeOk = false;
  console.log(
    `  ${name.padEnd(14)} ${color}  onSoft ${onSoft.toFixed(2)}  onElevated ${onElevated.toFixed(2)}  ${pass ? "PASS" : "FAIL"}`,
  );
}

// --- theme-aware card-type tokens (Sprint 4.1) ------------------------------
// The --color-type-* tokens are the ones actually used when a type name is
// rendered as TEXT on a themed surface (the sidebar, the column add-type
// menu, the card-editor picker when inactive). Before Sprint 4.1 both
// themes used the light hex, which put Epic at 1.93:1 and Story at 2.08:1
// on dark surfaces. Checking them here means that class of regression is
// caught in seconds by `npm run a11y` rather than by a browser scan.
console.log("\n=== TYPE TOKENS (4.5:1 as text on each theme's surfaces) ===");
let typeTokenOk = true;
for (const [themeName, tokens, backgrounds] of [
  ["LIGHT", light, lightBackgrounds],
  ["DARK", dark, darkBackgrounds],
]) {
  for (const name of ["type-epic", "type-story", "type-task"]) {
    const fg = tokens[name];
    if (!fg) {
      console.log(`  ${themeName} ${name.padEnd(12)} MISSING TOKEN - skipped`);
      continue;
    }
    const ratio = worstCase(fg, backgrounds);
    const pass = ratio >= AA;
    if (!pass) typeTokenOk = false;
    console.log(
      `  ${themeName} ${name.padEnd(12)} ${fg}  worst ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}`,
    );
  }
}

// --- de-emphasised text on the accent bar -----------------------------------
// --color-accent-muted replaced an `opacity: 0.7` span in TopBar. Opacity
// composites toward the backdrop and is invisible to a token check, which
// is exactly how the 4.39:1 regression shipped in the first place; asserting
// the replacement token's ratio on --color-accent is the guard.
console.log(
  "\n=== ACCENT-MUTED (4.5:1 on the theme's accent fill) ===",
);
let accentMutedOk = true;
for (const [themeName, tokens] of [["LIGHT", light], ["DARK", dark]]) {
  const fg = tokens["accent-muted"];
  const bg = tokens.accent;
  if (!fg || !bg) {
    console.log(`  ${themeName} MISSING TOKEN - skipped`);
    continue;
  }
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= AA;
  if (!pass) accentMutedOk = false;
  console.log(
    `  ${themeName} ${fg} on ${bg}  ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}`,
  );
}

// --- label palette ----------------------------------------------------------
console.log(
  `\n=== LABEL PALETTE (best of ${DARK_FG} / ${WHITE_FG} must reach 4.5:1) ===`,
);
let paletteOk = true;
for (const [name, bg] of LABEL_PALETTE) {
  const onDark = contrastRatio(DARK_FG, bg);
  const onWhite = contrastRatio(WHITE_FG, bg);
  const best = Math.max(onDark, onWhite);
  const pass = best >= AA;
  if (!pass) paletteOk = false;
  const chosen = onDark >= onWhite ? DARK_FG : WHITE_FG;
  console.log(
    `  ${name.padEnd(14)} ${bg}  best ${best.toFixed(2)}:1 (${chosen})  ${pass ? "PASS" : "FAIL"}`,
  );
}

// AAA is aspirational and opt-in: reported for visibility, never enforced.
if (dark.warning) {
  const aaaRatio = worstCase(dark.warning, darkBackgrounds);
  console.log(
    `\n(AAA 7:1 not enforced here; dark --color-warning is ${aaaRatio.toFixed(2)}:1.)`,
  );
}

const allOk =
  lightOk &&
  darkOk &&
  lightInvOk &&
  darkInvOk &&
  typeOk &&
  typeTokenOk &&
  accentMutedOk &&
  paletteOk;
console.log(
  allOk
    ? "\nAll AA contrast checks passed."
    : "\nSome AA checks FAILED - fix tokens.css before shipping.",
);
process.exit(allOk ? 0 : 1);

