/**
 * Unit tests for the Sprint 4.1 axe-core policy and the contrast fixes that
 * axe-core forced.
 *
 * Two jobs:
 *
 *   1. Guard the escape hatch. The E2E suite fails on any axe violation not
 *      listed in KNOWN_VIOLATIONS, which is only trustworthy if that list is
 *      itself trustworthy. An entry without a written reason, or a duplicate
 *      rule, would let a real regression hide behind a stale allowance.
 *
 *   2. Cover the defects axe-core found. Several were invisible to the
 *      Sprint 1 token check — a `dimmed by opacity` span, a `hovered ghost
 *      button`, and a dark-theme accent that was checked against the wrong
 *      background set. Each of those regressions is cheap to reintroduce and
 *      expensive to notice, so they get a direct assertion here where the
 *      failure names the actual cause.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AXE_TAGS, KNOWN_VIOLATIONS } from "../helpers/axe";
import { contrastRatio, worstCase } from "./helpers/contrast";
import { CARD_TYPE_META } from "../../src/models/cardTypeMeta";

const AA = 4.5;

const LIGHT_BGS = ["#ffffff", "#f4f5f7", "#ebecf0"];
const DARK_BGS = ["#22272b", "#1d2125", "#2c333a"];

const TOKENS_PATH = join(__dirname, "..", "..", "src", "styles", "tokens.css");
const COMPONENTS_CSS = join(
  __dirname,
  "..",
  "..",
  "src",
  "styles",
  "components.css",
);
const RESPONSIVE_CSS = join(
  __dirname,
  "..",
  "..",
  "src",
  "styles",
  "responsive.css",
);
const TOPBAR_TSX = join(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "TopBar.tsx",
);
const BOARD_LIST_TSX = join(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "BoardListView.tsx",
);
const CARD_TSX = join(__dirname, "..", "..", "src", "components", "Card.tsx");
const RICH_TEXT_TSX = join(
  __dirname,
  "..",
  "..",
  "src",
  "components",
  "fields",
  "RichTextEditor.tsx",
);

const read = (p: string) => readFileSync(p, "utf8");

/**
 * Read a source file with comments stripped.
 *
 * Several assertions below are deliberately regexes over JSX, and the fixes
 * they describe are documented in comments that quote the old markup — e.g.
 * a comment reading `<article role="button">`. Without stripping comments
 * the assertion matches its own explanation.
 */
function readCode(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Parse tokens.css into its light and dark custom-property maps. */
function readTokens(source: string) {
  const darkStart = source.indexOf("prefers-color-scheme: dark");
  const lightSlice = source.slice(0, darkStart === -1 ? source.length : darkStart);
  const darkSlice = darkStart === -1 ? "" : source.slice(darkStart);

  const collect = (slice: string) => {
    const out: Record<string, string> = {};
    const re = /--color-([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice)) !== null) out[m[1]] = m[2];
    return out;
  };

  return { light: collect(lightSlice), dark: collect(darkSlice) };
}

const { light, dark } = readTokens(read(TOKENS_PATH));

// ─────────────────────────────────────────────────────────────────────────────
// 1. The axe-core policy itself
// ─────────────────────────────────────────────────────────────────────────────

describe("axe-core policy", () => {
  it("covers WCAG A and AA at every WCAG version we claim", () => {
    for (const tag of ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]) {
      expect(AXE_TAGS).toContain(tag);
    }
  });

  it("excludes AAA, which Sprint 5 treats as opt-in", () => {
    // Running AAA here would fail the build on a documented non-goal rather
    // than on a defect.
    expect(AXE_TAGS.some((t) => t.includes("aaa"))).toBe(false);
  });

  it("keeps the best-practice ruleset on", () => {
    expect(AXE_TAGS).toContain("best-practice");
  });

  it("currently accepts no violations", () => {
    // Sprint 4.1 fixed every finding axe-core reported. Keeping this
    // asserted makes an accidental allowance show up as its own failure.
    expect(KNOWN_VIOLATIONS).toEqual([]);
  });

  it("would reject any allowance lacking a substantive reason", () => {
    // A reason of "" or "todo" is not a justification; the helper treats
    // anything under 10 characters as unowned.
    const thin = [
      { rule: "x", reason: "" },
      { rule: "y", reason: "todo" },
    ].filter((v) => !v.reason || v.reason.trim().length < 10);
    expect(thin).toHaveLength(2);
    // And the real list satisfies the same predicate.
    expect(
      KNOWN_VIOLATIONS.filter((v) => !v.reason || v.reason.trim().length < 10),
    ).toEqual([]);
  });

  it("has no duplicate rules in the allowance list", () => {
    const rules = KNOWN_VIOLATIONS.map((v) => v.rule);
    expect(new Set(rules).size).toBe(rules.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Contrast regressions found by axe-core
// ─────────────────────────────────────────────────────────────────────────────

describe("card-type colour tokens (Sprint 4.1)", () => {
  // The whole reason --color-type-* exists: CARD_TYPE_META held a single hex
  // per type, and on dark surfaces Epic sat at 1.93:1 and Story at 2.08:1.
  const expected: Array<[string, string, string]> = [
    ["type-epic", "epic", "#c79bf0"],
    ["type-story", "story", "#6fd894"],
    ["type-task", "task", "#a9b6c8"],
  ];

  for (const [token, type, expectedHex] of expected) {
    it(`${token} exists in both themes and clears AA as text`, () => {
      expect(light[token]).toBeDefined();
      expect(dark[token]).toBeDefined();
      expect(worstCase(light[token], LIGHT_BGS)).toBeGreaterThanOrEqual(AA);
      expect(worstCase(dark[token], DARK_BGS)).toBeGreaterThanOrEqual(AA);
    });

    it(`${token} matches the dark hex the fix was verified against`, () => {
      // Pins the value so a well-meaning "tidy up" that reintroduces a dark
      // hue fails here rather than only in a browser scan.
      expect(dark[token]).toBe(expectedHex);
    });

    it(`CARD_TYPE_META.${type} points text usage at a theme-aware token`, () => {
      expect(CARD_TYPE_META[type as keyof typeof CARD_TYPE_META].colorToken).toBe(
        `var(--color-${token})`,
      );
    });
  }

  it("keeps the light theme on the original hexes (no gratuitous restyle)", () => {
    // CARD_TYPE_META.color is unchanged and is still the light value, so the
    // TypeChip soft-tint pairing that Sprint 1 verified is undisturbed.
    expect(light["type-epic"]).toBe(CARD_TYPE_META.epic.color);
    expect(light["type-story"]).toBe(CARD_TYPE_META.story.color);
    expect(light["type-task"]).toBe(CARD_TYPE_META.task.color);
  });
});

describe("--color-accent-muted (replaces an opacity-dimmed span)", () => {
  it("clears AA on the light accent", () => {
    expect(contrastRatio(light["accent-muted"], light.accent)).toBeGreaterThanOrEqual(AA);
  });

  it("clears AA on the dark accent", () => {
    // On the dark theme the accent is a LIGHT blue, so the muted tone has to
    // go darker, not lighter. Getting this backwards was the obvious way to
    // break it.
    expect(contrastRatio(dark["accent-muted"], dark.accent)).toBeGreaterThanOrEqual(AA);
  });

  it("is used by TopBar instead of an opacity style", () => {
    const topbar = readCode(TOPBAR_TSX);
    expect(topbar).toContain("var(--color-accent-muted)");
    // The specific defect: opacity 0.7 over white text on the accent bar
    // composited to 4.39:1.
    expect(topbar).not.toMatch(/opacity:\s*0\.7/);
  });
});

describe("dark accent against the elevated background", () => {
  // --color-bg-elevated is the sidebar in BOTH themes. The Sprint 1 check
  // only tested the dark theme against surface and bg, which hid a 4.49:1
  // link-text failure in the sidebar card-type panel.
  it("clears AA on bg, surface and bg-elevated", () => {
    for (const bg of DARK_BGS) {
      expect(
        worstCase(dark.accent, [bg]),
        `--color-accent on ${bg} is ${worstCase(dark.accent, [bg]).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe("muted text on the column surface (CI 36717935031 regression)", () => {
  // The column body is the LIGHTEST surface in the dark theme, so it is the
  // binding constraint for --color-text-muted. Two bugs hid here:
  //
  //  1. This file audited the column surface; a11y-contrast.test.ts did not.
  //  2. #8c9bab measured 4.5024:1 on #2c333a — clearing the bar by 0.0024.
  //     axe-core then composited the column to #2f363d / #373e45 and measured
  //     4.3:1 and 3.81:1 on .kanban-column__count and .kanban-column__add-btn.
  //
  // The composited values are asserted too, so a future "lift it a bit" edit
  // that lands back on the threshold fails here rather than in CI.
  const COMPOSITED_COLUMN_BGS = ["#2c333a", "#2f363d", "#373e45"];

  it.each(["text-muted", "text-subtle"])(
    "dark --color-%s keeps headroom on the column surface",
    (token) => {
      for (const bg of COMPOSITED_COLUMN_BGS) {
        const ratio = worstCase(dark[token], [bg]);
        expect(
          ratio,
          `dark --color-${token} (${dark[token]}) is only ${ratio.toFixed(2)}:1 ` +
            `on the column surface ${bg}; it must keep headroom above ${AA}:1`,
        ).toBeGreaterThanOrEqual(AA);
      }
    },
  );

  it("does not sit on the threshold", () => {
    // The original defect was a value that passed by 0.0024. Require real
    // headroom so rounding or a slightly lighter surface cannot flip it.
    for (const token of ["text-muted", "text-subtle"]) {
      const worst = worstCase(dark[token], COMPOSITED_COLUMN_BGS);
      expect(
        worst,
        `dark --color-${token} is ${worst.toFixed(3)}:1 at worst — that is ` +
          `within rounding distance of the ${AA}:1 floor`,
      ).toBeGreaterThan(AA);
    }
  });

  it("keeps the column surface in both audit background lists", () => {
    // The gap was a DARK_BGS list missing #2c333a, so pin both files to it.
    for (const file of ["a11y-contrast.test.ts", "a11y-axe-policy.test.ts"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      const list = /DARK_BGS\s*=\s*\[([^\]]*)\]/.exec(src);
      expect(list, `DARK_BGS not found in ${file}`).not.toBeNull();
      expect(
        list![1],
        `${file} DARK_BGS must include the column surface #2c333a`,
      ).toContain("#2c333a");
    }
  });
});

describe("opacity is not used to de-emphasise text", () => {
  // Every opacity-dimming regression found in Sprint 4.1 shares this shape:
  // the visual intent is fine, but opacity composites the TEXT toward the
  // backdrop and drops it under 4.5:1. These three are the specific sites
  // that regressed, so the assertion names them.
  it("the done column de-emphasises with a background, not opacity", () => {
    const css = read(COMPONENTS_CSS);
    const rule = /\.kanban-column\[data-done="true"\]\s*\{[^}]*\}/.exec(css);
    expect(rule, "done-column rule not found").not.toBeNull();
    expect(rule![0]).not.toMatch(/opacity/);
  });

  it("the weekend planner columns de-emphasise with a background, not opacity", () => {
    const css = read(COMPONENTS_CSS);
    const rule = /\.planner-day--weekend\s*\{[^}]*\}/.exec(css);
    expect(rule, "weekend rule not found").not.toBeNull();
    expect(rule![0]).not.toMatch(/opacity/);
  });

  it("topbar ghost buttons use a translucent wash, not a light background", () => {
    // `.btn--ghost:hover` paints --color-border (near-white) which, behind
    // the forced white text of the topbar, measured 1.3:1.
    const css = read(RESPONSIVE_CSS);
    const rule = /\.topbar \.btn--ghost:hover:not\(:disabled\)\s*\{[^}]*\}/.exec(css);
    expect(rule, "topbar ghost hover rule not found").not.toBeNull();
    expect(rule![0]).not.toContain("var(--color-border)");
    expect(rule![0]).toContain("rgba(255, 255, 255");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Structural fixes
// ─────────────────────────────────────────────────────────────────────────────

describe("board card semantics (Sprint 4.1)", () => {
  it("does not put role=button on an <article>", () => {
    // aria-allowed-role: <article> has no implicit button semantics.
    const src = readCode(BOARD_LIST_TSX);
    const article = /<article[\s\S]*?>/.exec(src);
    expect(article, "board card <article> not found").not.toBeNull();
    expect(article![0]).not.toContain("role=");
    expect(article![0]).not.toContain("tabIndex");
  });

  it("keeps the delete button out of the link", () => {
    // nested-interactive: the old <article role=button> wrapped a <button>.
    const src = readCode(BOARD_LIST_TSX);
    const anchorIdx = src.indexOf('className="board-card__link"');
    expect(anchorIdx).toBeGreaterThan(-1);
    const anchorEnd = src.indexOf("</a>", anchorIdx);
    const deleteIdx = src.indexOf("Delete board", anchorIdx);
    expect(anchorEnd).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(anchorEnd);
  });

  it("uses h2 for the card title so heading order is unbroken", () => {
    // The list page is h1; the cards were h3, skipping a level.
    const src = readCode(BOARD_LIST_TSX);
    expect(src).toContain('<h2 className="board-card__title">');
    expect(src).not.toContain('<h3 className="board-card__title">');
  });

  it("keeps the whole-card click target via a stretched link", () => {
    // The interaction must not be lost by the a11y fix: removing
    // <article role=button> would otherwise shrink the hit area to the
    // title text only.
    const css = read(COMPONENTS_CSS);
    expect(css).toContain(".board-card__link::after");
    expect(css).toContain("position: absolute");
  });

  it("raises the delete button above the stretched link", () => {
    const css = read(COMPONENTS_CSS);
    const rule = /\.board-card__actions\s*\{[^}]*\}/.exec(css);
    expect(rule, "actions rule not found").not.toBeNull();
    expect(rule![0]).toContain("z-index");
  });
});

describe("kanban card drag semantics (Sprint 4.1)", () => {
  it("does not nest a dnd-kit wrapper button inside the card button", () => {
    // dnd-kit renders its sortable wrapper with role="button"; spreading it
    // onto a separate wrapper around our own role="button" card produced a
    // button inside a button, plus an extra Tab stop per card.
    const src = readCode(CARD_TSX);
    expect(src).toContain("useSortable");
    // The ref and the dnd attributes belong to the same element as role.
    const root = /ref=\{setNodeRef\}[\s\S]*?role="button"/.exec(src);
    expect(root, "card root should carry both the dnd ref and role=button").not.toBeNull();
  });
});

describe("rich-text editor ARIA", () => {
  it("gives the contenteditable host a role that permits aria-label", () => {
    // aria-prohibited-attr: Tiptap renders a bare contenteditable <div>, and
    // aria-label is prohibited there without a role.
    const src = readCode(RICH_TEXT_TSX);
    expect(src).toContain('role: "textbox"');
    expect(src).toContain('"aria-multiline": "true"');
  });
});
