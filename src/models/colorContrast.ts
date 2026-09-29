/**
 * Foreground-colour selection for user-chosen backgrounds.
 *
 * Labels and preset-list options let a user pick an arbitrary colour, which
 * then becomes the chip's background. WCAG 1.4.3 still applies: the text on top
 * has to clear 4.5:1. We resolve it by choosing whichever of the two
 * foregrounds (the app's near-black or white) actually yields the higher
 * ratio against that background.
 *
 * This lives in one place on purpose. Three components previously carried
 * their own copy of this function, and two of those copies used a naive
 * `0.299r + 0.587g + 0.114b` average thresholded at 0.6 — which chose white
 * on mid-tone colours and produced label text at 2.14:1 and 2.36:1. Three
 * copies of a subtle algorithm is three chances to reintroduce that bug.
 */

/** The app's near-black, matching `--color-text`. */
const DARK_FG = "#172b4d";
const LIGHT_FG = "#ffffff";

function relativeLuminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Return the more legible of near-black / white for the given background hex.
 * Falls back to the dark foreground for anything unparseable.
 */
export function pickForeground(hex: string): string {
  const c = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return DARK_FG;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return DARK_FG;

  const bg = relativeLuminance(r, g, b);
  const dark = relativeLuminance(0x17, 0x2b, 0x4d);
  return ratio(bg, dark) >= ratio(bg, 1) ? DARK_FG : LIGHT_FG;
}
