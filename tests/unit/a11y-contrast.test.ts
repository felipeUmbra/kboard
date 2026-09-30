/**
 * Unit tests for the WCAG contrast work introduced in Sprint 1.
 *
 * Three things are covered:
 *   1. The contrast maths itself, against known reference values.
 *   2. Every design token in tokens.css, checked against the worst-case
 *      background for its theme (this is the regression guard — an edit to
 *      a token that breaks contrast must fail here).
 *   3. pickForeground(), which decides label text colour and previously
 *      existed as three divergent copies, two of which chose unreadable
 *      foregrounds on mid-tone backgrounds.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pickForeground } from "../../src/models/colorContrast";
import { CARD_TYPE_META } from "../../src/models/cardTypeMeta";
import { COLOR_PALETTE } from "../../src/models/types";
import { contrastRatio, worstCase, compositeOver } from "./helpers/contrast";

const AA = 4.5;

const LIGHT_BGS = ["#ffffff", "#f4f5f7", "#ebecf0"];
// #2c333a is --color-bg-elevated, the .kanban-column surface. It belongs here:
// it is the *lightest* dark surface and therefore the binding constraint for
// muted foregrounds. Leaving it out let --color-text-muted ship at 4.5024:1
// against it and fail WCAG 1.4.3 on the composited column (CI run 36717935031).
const DARK_BGS = ["#22272b", "#1d2125", "#2c333a"];
const DARK_FG = "#172b4d";
const WHITE_FG = "#ffffff";

/**
 * Parse the real tokens.css so these tests track actual source, not a copy.
 *
 * Captures both hex (`#rrggbb`) and `rgba(...)` values — the dark-theme
 * `-soft` tokens are 15% alpha tints, not hex, and a hex-only regex would
 * silently drop them.
 */
function readTokens() {
  const path = join(__dirname, "..", "..", "src", "styles", "tokens.css");
  const css = readFileSync(path, "utf8");
  const lightStart = css.indexOf(":root");
  const darkStart = css.indexOf("prefers-color-scheme: dark");
  const collect = (slice: string) => {
    const out: Record<string, string> = {};
    const re =
      /--color-([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice)) !== null) out[m[1]] = m[2];
    return out;
  };
  return {
    light: collect(css.slice(lightStart, darkStart)),
    dark: collect(css.slice(darkStart)),
  };
}

describe("contrast maths", () => {
  it("matches WCAG reference values", () => {
    // Canonical examples from the WCAG 2.x definition.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#c62828", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#c62828"),
      10,
    );
  });

  it("worstCase reports the minimum across backgrounds", () => {
    // #ebecf0 is darker than #ffffff, so it must be the binding constraint.
    expect(worstCase("#c62828", LIGHT_BGS)).toBeCloseTo(
      contrastRatio("#c62828", "#ebecf0"),
      10,
    );
  });
});

describe("design tokens meet WCAG AA", () => {
  const { light, dark } = readTokens();

  const FOREGROUND_TOKENS = [
    "text",
    "text-muted",
    "text-subtle",
    "accent",
    "danger",
    "success",
    "warning",
  ];

  it.each(FOREGROUND_TOKENS)(
    "light --color-%s clears 4.5:1 on every light background",
    (token) => {
      const fg = light[token];
      expect(fg, `--color-${token} must be defined`).toBeTruthy();
      const ratio = worstCase(fg, LIGHT_BGS);
      expect(
        ratio,
        `--color-${token} (${fg}) is ${ratio.toFixed(2)}:1 on its worst light background`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(FOREGROUND_TOKENS)(
    "dark --color-%s clears 4.5:1 on every dark background",
    (token) => {
      const fg = dark[token];
      expect(fg, `dark --color-${token} must be defined`).toBeTruthy();
      const ratio = worstCase(fg, DARK_BGS);
      expect(
        ratio,
        `dark --color-${token} (${fg}) is ${ratio.toFixed(2)}:1 on its worst dark background`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it("defines every foreground token in both themes", () => {
    for (const token of FOREGROUND_TOKENS) {
      expect(light[token], `light --color-${token}`).toBeTruthy();
      expect(dark[token], `dark --color-${token}`).toBeTruthy();
    }
  });

  it("dark theme actually overrides the light values it should", () => {
    // Guards against a copy-paste that leaves the dark block referencing
    // light-theme hexes (which is how --color-text-subtle was 3.33:1).
    const changed = ["text", "text-muted", "accent", "danger", "success", "warning"];
    for (const token of changed) {
      expect(dark[token], `dark --color-${token} should differ from light`).not.toBe(
        light[token],
      );
    }
  });
});

describe("card type meta colours", () => {
  const { light } = readTokens();

  it.each(Object.keys(CARD_TYPE_META) as (keyof typeof CARD_TYPE_META)[])(
    "%s clears 4.5:1 as text on its own softColor",
    (type) => {
      const meta = CARD_TYPE_META[type];
      const ratio = contrastRatio(meta.color, meta.softColor);
      expect(
        ratio,
        `${type} colour ${meta.color} on ${meta.softColor} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(Object.keys(CARD_TYPE_META) as (keyof typeof CARD_TYPE_META)[])(
    "%s clears 4.5:1 as text on the elevated sidebar background",
    (type) => {
      const meta = CARD_TYPE_META[type];
      const ratio = contrastRatio(meta.color, light["bg-elevated"]);
      expect(
        ratio,
        `${type} colour ${meta.color} on the sidebar is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(Object.keys(CARD_TYPE_META) as (keyof typeof CARD_TYPE_META)[])(
    "%s stripe clears the 3:1 non-text minimum on a card surface",
    (type) => {
      const meta = CARD_TYPE_META[type];
      // The 3px left stripe is a UI component boundary (WCAG 1.4.11), so it
      // only needs 3:1, not 4.5:1.
      expect(contrastRatio(meta.color, light.surface)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("non-text contrast (WCAG 1.4.11)", () => {
  const { light, dark } = readTokens();
  const NON_TEXT = 3;

  it("the focus ring is visible against every light surface", () => {
    // :focus-visible draws a 4px accent ring. If it blends into the surface
    // a keyboard user cannot see where focus is (WCAG 2.4.7 + 1.4.11).
    const ratio = worstCase(light.accent, LIGHT_BGS);
    expect(
      ratio,
      `focus ring ${light.accent} is ${ratio.toFixed(2)}:1 on its worst light background`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it("the focus ring is visible against every dark surface", () => {
    const ratio = worstCase(dark.accent, DARK_BGS);
    expect(
      ratio,
      `dark focus ring ${dark.accent} is ${ratio.toFixed(2)}:1 on its worst dark background`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it("the done-column dot is distinguishable from the card surface", () => {
    // .kanban-column__done-dot carries meaning, so it is a UI component
    // rather than decoration and needs 3:1.
    expect(contrastRatio(light.success, light.surface)).toBeGreaterThanOrEqual(
      NON_TEXT,
    );
    expect(contrastRatio(dark.success, dark.surface)).toBeGreaterThanOrEqual(
      NON_TEXT,
    );
  });
});

describe("banner soft-tint pairings (WCAG 1.4.3)", () => {
  const { light, dark } = readTokens();
  const KINDS = ["danger", "success", "warning"] as const;

  it.each(KINDS)(
    "light banner: %s text on its own soft tint clears 4.5:1",
    (kind) => {
      const ratio = contrastRatio(light[kind], light[`${kind}-soft`]);
      expect(
        ratio,
        `light banner ${kind}: ${light[kind]} on ${light[`${kind}-soft`]} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(KINDS)(
    "dark banner: %s text on its 15% tint over the surface clears 4.5:1",
    (kind) => {
      // In dark mode the soft tokens are rgba(...,0.15): a translucent tint
      // that is only ever seen through the banner's own surface, so the
      // contrast must be measured against the composite.
      const soft = dark[`${kind}-soft`];
      const effectiveBg = compositeOver(soft, dark.surface);
      const ratio = contrastRatio(dark[kind], effectiveBg);
      expect(
        ratio,
        `dark banner ${kind}: ${dark[kind]} on ${effectiveBg} (${soft} over ${dark.surface}) is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );
});

describe("pickForeground", () => {
  it("picks the higher-contrast of near-black and white", () => {
    // Near-white background -> dark text.
    expect(pickForeground("#ffffff")).toBe(DARK_FG);
    // Near-black background -> light text.
    expect(pickForeground("#000000")).toBe(WHITE_FG);
  });

  it("chooses dark text on mid-tone colours instead of white", () => {
    // These are the regressions: the old 0.299/0.587/0.114 heuristic with a
    // 0.6 cutoff chose WHITE here, giving 2.36:1 and 2.14:1.
    expect(pickForeground("#61bd4f")).toBe(DARK_FG);
    expect(pickForeground("#00c2e0")).toBe(DARK_FG);
  });

  it("returns dark text for malformed input rather than throwing", () => {
    expect(pickForeground("")).toBe(DARK_FG);
    expect(pickForeground("not-a-colour")).toBe(DARK_FG);
    expect(pickForeground("#fff")).toBe(DARK_FG); // 3-digit, len !== 6
  });

  it.each(COLOR_PALETTE.map((c) => [c.id, c.value] as const))(
    "palette %s is readable with its chosen foreground",
    (_id, bg) => {
      const fg = pickForeground(bg);
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `palette ${_id} (${bg}) with ${fg} is only ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );
});
