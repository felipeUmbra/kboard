#!/usr/bin/env node
/**
 * scripts/lint-color-literals.js
 *
 * Enforces the "no hardcoded colours" rule that Sprint 1's cleanup created.
 *
 * Background: `npm run a11y:contrast` verifies the tokens in
 * src/styles/tokens.css, but it is blind to colour literals written anywhere
 * else. A `#eb5a46` dropped into a component would sail past the contrast
 * check and silently ship an unreadable UI. This script is the missing guard.
 *
 * Rules:
 *   1. No hex colour literals in src/ (CSS, TSX, TS) — use a design token.
 *   2. No `var(--token, #fallback)` — a fallback silently hides a broken or
 *      renamed token, and is how the stale Sprint 1 values survived.
 *
 * Documented exceptions (allowlist, with the reason):
 *   - src/styles/tokens.css      — this is where the tokens are DEFINED.
 *   - src/models/types.ts        — COLOR_PALETTE is user-facing label colour
 *                                 data, deliberately arbitrary per-user values
 *                                 that cannot be tokens.
 *   - src/models/cardTypeMeta.ts — per-type brand accents (epic/story/task),
 *                                 a fixed 3-entry data table.
 *   - src/models/colorContrast.ts— the near-black/#ffffff pair that
 *                                 pickForeground() compares against. It must
 *                                 match --color-text and the white it tests
 *                                 against, so it cannot read the token at
 *                                 runtime (it runs before CSS is resolved).
 *   - src/components/LoginScreen.tsx — the Google "G" mark. Those four
 *                                 colours are Google's brand specification
 *                                 for the logo, not our palette; retheming
 *                                 them would break brand compliance.
 *   - src/components/Sidebar.tsx — inline SVG icon fills. These are
 *                                 multi-colour glyphs (planner, inbox) where
 *                                 each path is a distinct hue, not a themed
 *                                 surface colour.
 *   - any *.test.ts / *.test.tsx    — test fixtures. Deliberately saturated
 *                                 sentinels that should never be swapped for
 *                                 a token; a real token here would weaken
 *                                 the assertion.
 *
 * Usage:  node scripts/lint-color-literals.js
 * Exit:   0 = clean, 1 = violations found.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

/** Path (repo-relative, forward slashes) -> why literals are allowed here. */
const ALLOWLIST = {
  "src/styles/tokens.css": "design tokens are defined here",
  "src/models/types.ts": "COLOR_PALETTE is per-user label colour data",
  "src/models/cardTypeMeta.ts": "fixed per-type brand accent data",
  "src/models/colorContrast.ts":
    "pickForeground() must match its two literal foregrounds",
  "src/components/LoginScreen.tsx": "Google logo brand specification",
  "src/components/Sidebar.tsx": "inline SVG icon glyph fills",
};

/** Predicate form, for entries that are a shape rather than a single path. */
const ALLOWLIST_PREDICATES = [
  {
    matches: (p) => p.endsWith(".test.ts") || p.endsWith(".test.tsx"),
    reason: "test fixture sentinel values",
  },
];

function allowReasonFor(relPath) {
  if (ALLOWLIST[relPath]) return ALLOWLIST[relPath];
  for (const { matches, reason } of ALLOWLIST_PREDICATES) {
    if (matches(relPath)) return reason;
  }
  return undefined;
}

const SCANNED_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

/** 3, 4, 6 or 8 digit hex colours. */
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
/** Matches `var(--x, #abc)` — the fallback form we forbid. */
const VAR_FALLBACK = /var\(\s*--[a-zA-Z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (SCANNED_EXTENSIONS.has(extname(full))) {
      yield full;
    }
  }
}

const violations = [];

/**
 * True when `index` is inside a /* ... *\/ block comment (or a // line comment).
 *
 * Tracking this as state rather than testing the line prefix matters: a
 * wrapped block comment like
 *
 *     /* Tinted background: danger #c62828 on #fdeaea = 4.85:1, ...
 *        warning #9c4f00 on #fff8e1 ... *\/
 *
 * has continuation lines that do not begin with `*`, so a prefix check flags
 * the very hex values the author was documenting on purpose.
 */
function buildCommentMask(source) {
  const inBlock = new Array(source.length).fill(false);
  let inComment = false;
  for (let i = 0; i < source.length; i++) {
    if (inComment) {
      inBlock[i] = true;
      if (source[i] === "*" && source[i + 1] === "/") {
        inBlock[i + 1] = true;
        i++;
        inComment = false;
      }
    } else if (source[i] === "/" && source[i + 1] === "*") {
      inBlock[i] = true;
      inBlock[i + 1] = true;
      i++;
      inComment = true;
    } else if (source[i] === "/" && source[i + 1] === "/") {
      // Mask to the end of THIS line only. Masking to end-of-file here would
      // silently swallow every real literal in any file whose first line is a
      // `//` comment — which is most of src/models/.
      while (i < source.length && source[i] !== "\n") inBlock[i++] = true;
      i--; // The loop's own increment resumes at the newline.
    }
  }
  return inBlock;
}

for (const file of walk(SRC)) {
  const relPath = relative(ROOT, file).split("\\").join("/");
  const allowReason = allowReasonFor(relPath);
  const source = readFileSync(file, "utf8");
  // Comment state is tracked across the whole file so a multi-line comment
  // masks every line it covers, not just the ones starting with a delimiter.
  const commentMask = buildCommentMask(source);
  // Line start offsets are located by scanning the ORIGINAL string rather
  // than by accumulating `line.length + 1`. Splitting on /\r?\n/ removes the
  // \r from the returned lines, so the accumulate approach drifts by one
  // character per line on CRLF files — which silently mis-masks content.
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }

  lineStarts.forEach((start, i) => {
    const end = i + 1 < lineStarts.length ? lineStarts[i + 1] : source.length;
    const line = source.slice(start, end);

    // Ignore comment lines — documenting "was #eb5a46" is useful history,
    // and several token files do exactly that.
    if (commentMask[start]) return;

    const varFallbacks = line.match(VAR_FALLBACK);
    if (varFallbacks) {
      violations.push({
        file: relPath,
        line: i + 1,
        text: line.trim(),
        message:
          "var() with a hex fallback hides a broken or renamed token — drop the fallback",
        allowReason,
      });
    }

    const hexes = line.match(HEX_COLOR);
    if (hexes) {
      violations.push({
        file: relPath,
        line: i + 1,
        text: line.trim(),
        message: `hardcoded colour ${hexes.join(", ")} — use a design token`,
        allowReason,
      });
    }
  });
}

const blocking = violations.filter((v) => !v.allowReason);
const excused = violations.filter((v) => v.allowReason);

for (const v of blocking) {
  console.error(`\n${v.file}:${v.line}`);
  console.error(`  ${v.message}`);
  console.error(`  > ${v.text}`);
}

if (excused.length > 0) {
  console.log("\nAllowlisted occurrences (informational, not failing):");
  const byFile = new Map();
  for (const v of excused) {
    if (!byFile.has(v.file)) byFile.set(v.file, v.allowReason);
  }
  for (const [file, reason] of byFile) {
    const count = excused.filter((v) => v.file === file).length;
    console.log(`  ${file} (${count}x) — ${reason}`);
  }
}

// The exit status keys off BLOCKING violations only. Keying it off the total
// meant a fully allowlisted repo still exited 1, which would have made the
// rule unshippable in CI from day one.
if (blocking.length === 0) {
  console.log(
    `\nNo hardcoded colour literals in src/. Clean` +
      (excused.length > 0 ? ` (${excused.length} allowlisted).` : "."),
  );
  process.exit(0);
}

console.error(
  `\n${blocking.length} blocking violation(s). ` +
    `Use a --color-* token, or add an allowlist entry if a literal is genuinely required.`,
);
process.exit(1);
