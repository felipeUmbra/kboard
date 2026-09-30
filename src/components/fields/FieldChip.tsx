import type { CustomField } from "../../models/types";
import { formatFieldValue } from "../../models/fieldTypes";
import { pickForeground } from "../../models/colorContrast";

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
          color: value ? "var(--color-on-success)" : "var(--color-text-muted)",
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

