import type { Label } from "../../models/types";
import { pickForeground } from "../../models/colorContrast";

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

