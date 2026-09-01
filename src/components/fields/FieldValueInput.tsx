import type { CustomField } from "../../models/types";
import { coerceFieldValue, FIELD_TYPE_META } from "../../models/fieldTypes";

export function FieldValueInput({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  const coerced = coerceFieldValue(field, value);

  return (
    <div className="field-row">
      <label className="label" style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
        {field.name}
        <span style={{ fontWeight: 400, textTransform: "none", color: "var(--color-text-subtle)" }}>
          ({FIELD_TYPE_META[field.type].label})
        </span>
      </label>
      {renderInput(field, coerced, onChange)}
    </div>
  );
}

function renderInput(
  field: CustomField,
  value: string | number | boolean,
  onChange: (v: string | number | boolean) => void,
) {
  switch (field.type) {
    case "short_text":
      return (
        <input
          className="input"
          value={String(value)}
          maxLength={120}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "long_text":
      return (
        <textarea
          className="textarea"
          value={String(value)}
          maxLength={2000}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );
    case "number": {
      const decimals = field.decimals ?? 0;
      return (
        <input
          className="input"
          type="number"
          step={decimals > 0 ? Math.pow(10, -decimals) : 1}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      );
    }
    case "percentage": {
      const decimals = field.decimals ?? 0;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            step={decimals > 0 ? Math.pow(10, -decimals) : 1}
            value={Number(value)}
            onChange={(e) => {
              const raw = Number(e.target.value) || 0;
              onChange(Math.max(0, Math.min(100, raw)));
            }}
          />
          <span>%</span>
        </div>
      );
    }
    case "boolean":
      return (
        <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{value ? "Yes" : "No"}</span>
        </label>
      );
    case "date":
      return (
        <input
          className="input"
          type="date"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "preset_list":
      return (
        <select
          className="select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
  }
}
