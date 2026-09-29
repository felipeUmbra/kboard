import type { Label } from "../../models/types";

export function LabelPill({
  label,
  compact = false,
}: {
  label: Label;
  /** Smaller pill used in compact rows (planner, inbox). */
  compact?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: compact ? "1px 6px" : "2px var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: label.color,
        color: pickForeground(label.color),
        fontSize: compact ? "10px" : "var(--text-xs)",
        fontWeight: 600,
        lineHeight: 1.4,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={label.name}
    >
      {label.name}
    </span>
  );
}

/**
 * Pick the foreground (text) colour for a given background hex.
 *
 * Uses the WCAG relative-luminance formula and then chooses whichever of
 * near-black / white actually yields the higher contrast ratio, rather than
 * thresholding a rough perceptual average.
 *
 * The previous implementation used a `0.299r + 0.587g + 0.114b` average cut
 * off at 0.6, which chose white on mid-tone colours and produced unreadable
 * labels: green #61bd4f resolved to 2.36:1 and cyan #00c2e0 to 2.14:1.
 * Comparing both candidates guarantees we never do worse than the better of
 * the two, for any colour a user can pick.
 *
 * Exported for unit testing — see tests/unit/labelPill.test.ts.
 */
export function pickForeground(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#172b4d";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return "#172b4d";

  const relativeLuminance = (cr: number, cg: number, cb: number) => {
    const [lr, lg, lb] = [cr, cg, cb].map((v) => {
      const ch = v / 255;
      return ch <= 0.03928 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };

  const ratio = (l1: number, l2: number) =>
    (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  const bgLum = relativeLuminance(r, g, b);
  const darkLum = relativeLuminance(0x17, 0x2b, 0x4d); // #172b4d
  const lightLum = 1; // #ffffff

  return ratio(bgLum, darkLum) >= ratio(bgLum, lightLum)
    ? "#172b4d"
    : "#ffffff";
}
