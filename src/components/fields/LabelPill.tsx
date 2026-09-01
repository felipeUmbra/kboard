import type { Label } from "../../models/types";

export function LabelPill({ label }: { label: Label }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: label.color,
        color: pickForeground(label.color),
        fontSize: "var(--text-xs)",
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

/** Pick black or white foreground for a given hex background (WCAG-ish). */
function pickForeground(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#172b4d";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#172b4d" : "#ffffff";
}
