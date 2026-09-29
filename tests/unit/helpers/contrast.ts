/**
 * tests/unit/helpers/contrast.ts
 *
 * WCAG 2.x relative-luminance + contrast-ratio maths, shared by the unit
 * tests. Kept independent of scripts/check-contrast.js on purpose: that
 * script is a build-time gate, this is the test oracle. If both were the
 * same code, a bug in the maths would cancel itself out and every test
 * would pass.
 */

export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a 6-digit hex colour: "${hex}"`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG 2.x relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 .. 21. */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Lowest ratio across every background — the value that actually has to pass. */
export function worstCase(fg: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((bg) => contrastRatio(fg, bg)));
}

/** Splits `rgba(r, g, b, a)` into its channels. */
export function parseRgba(value: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) throw new Error(`not an rgb(a) colour: "${value}"`);
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

/**
 * Composites a possibly-translucent `fg` over an opaque `bg` and returns the
 * resulting opaque hex. Alpha tokens (the dark `-soft` tints) are only ever
 * seen through whatever sits beneath them, so contrast has to be measured
 * against the composite, not the raw rgba value.
 */
export function compositeOver(fg: string, bg: string): string {
  const back = parseHex(bg);
  let front: [number, number, number];
  let alpha: number;

  if (fg.trim().startsWith("#")) {
    front = parseHex(fg);
    alpha = 1;
  } else {
    const { r, g, b, a } = parseRgba(fg);
    front = [r, g, b];
    alpha = a;
  }

  const mix = front.map((c, i) =>
    Math.round(c * alpha + back[i] * (1 - alpha))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${mix.join("")}`;
}
