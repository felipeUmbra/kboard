import type { CustomField } from "../../models/types";
import { formatFieldValue } from "../../models/fieldTypes";

export function FieldChip({
  field,
  value,
}: {
  field: CustomField;
  value: string | number | boolean;
}) {
  const display = formatFieldValue(field, value);
  if (!display) return null;

  // For preset_list we render a colored pill
  if (field.type === "preset_list") {
    const opt = field.options?.find((o) => o.id === value);
    if (!opt) {
      return <span className="field-chip">{display}</span>;
    }
    return (
      <span
        className="field-chip"
        style={{
          background: opt.color,
          color: pickForeground(opt.color),
          border: "none",
        }}
      >
        {opt.name}
      </span>
    );
  }

  // For boolean
  if (field.type === "boolean") {
    return (
      <span
        className="field-chip"
        style={{
          background: value ? "var(--color-success)" : "var(--color-bg-elevated)",
          color: value ? "#fff" : "var(--color-text-muted)",
          border: value ? "none" : "1px solid var(--color-border)",
        }}
      >
        {value ? "✓ Yes" : "No"}
      </span>
    );
  }

  return (
    <span className="field-chip" title={`${field.name}: ${display}`}>
      {display}
    </span>
  );
}

function pickForeground(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#172b4d";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#172b4d" : "#ffffff";
}
