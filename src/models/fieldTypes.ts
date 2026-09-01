import type { CustomField, FieldType } from "./types";

/** Display metadata for each field type. */
export const FIELD_TYPE_META: Record<
  FieldType,
  { label: string; icon: string; description: string; defaultValue: string | number | boolean }
> = {
  short_text: {
    label: "Short text",
    icon: "Abc",
    description: "A single line of text (max 120 characters).",
    defaultValue: "",
  },
  long_text: {
    label: "Long text",
    icon: "¶",
    description: "Multiple lines of text (max 2000 characters).",
    defaultValue: "",
  },
  number: {
    label: "Number",
    icon: "123",
    description: "A numeric value (e.g. 42, -3.14).",
    defaultValue: 0,
  },
  percentage: {
    label: "Percentage",
    icon: "%",
    description: "A percentage value (0–100).",
    defaultValue: 0,
  },
  boolean: {
    label: "Checkbox",
    icon: "☑",
    description: "A true/false toggle.",
    defaultValue: false,
  },
  date: {
    label: "Date",
    icon: "📅",
    description: "A calendar date.",
    defaultValue: "",
  },
  preset_list: {
    label: "Preset list",
    icon: "≡",
    description: "Pick from a custom list of options.",
    defaultValue: "",
  },
};

export const FIELD_TYPE_ORDER: FieldType[] = [
  "short_text",
  "long_text",
  "number",
  "percentage",
  "boolean",
  "date",
  "preset_list",
];

/** Returns the empty/default value for a field type. */
export function defaultValueForType(type: FieldType): string | number | boolean {
  return FIELD_TYPE_META[type].defaultValue;
}

/** Coerce a stored value into the right runtime shape for a field type. */
export function coerceFieldValue(
  field: CustomField,
  raw: unknown,
): string | number | boolean {
  switch (field.type) {
    case "short_text":
    case "long_text":
      return typeof raw === "string" ? raw : "";
    case "number":
    case "percentage": {
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    }
    case "boolean":
      return raw === true;
    case "date":
      return typeof raw === "string" ? raw : "";
    case "preset_list":
      return typeof raw === "string" ? raw : "";
  }
}

/** Format a field value for display on a card chip. */
export function formatFieldValue(
  field: CustomField,
  raw: string | number | boolean | undefined,
): string {
  if (raw === undefined || raw === "" || raw === null) return "";
  const value = coerceFieldValue(field, raw);

  switch (field.type) {
    case "short_text":
    case "long_text":
      return String(value).slice(0, 60);
    case "number": {
      const decimals = field.decimals ?? 0;
      const formatted = Number(value).toFixed(decimals);
      return field.unit ? `${formatted}${field.unit}` : formatted;
    }
    case "percentage": {
      const decimals = field.decimals ?? 0;
      return `${Number(value).toFixed(decimals)}%`;
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      // YYYY-MM-DD → human-readable
      try {
        const d = new Date(String(value) + "T00:00:00");
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch {
        return String(value);
      }
    case "preset_list": {
      const opt = field.options?.find((o) => o.id === value);
      return opt?.name ?? String(value);
    }
  }
}
