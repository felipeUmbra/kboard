import { describe, it, expect } from "vitest";
import type { CustomField } from "./types";
import { defaultValueForType, coerceFieldValue, formatFieldValue } from "./fieldTypes";

describe("defaultValueForType", () => {
  it("returns empty string for text types", () => {
    expect(defaultValueForType("short_text")).toBe("");
    expect(defaultValueForType("long_text")).toBe("");
  });

  it("returns 0 for numeric types", () => {
    expect(defaultValueForType("number")).toBe(0);
    expect(defaultValueForType("percentage")).toBe(0);
  });

  it("returns false for boolean", () => {
    expect(defaultValueForType("boolean")).toBe(false);
  });

  it("returns empty string for date and preset_list", () => {
    expect(defaultValueForType("date")).toBe("");
    expect(defaultValueForType("preset_list")).toBe("");
  });
});

describe("coerceFieldValue", () => {
  const shortText: CustomField = { id: "f1", name: "Name", type: "short_text" };
  const numberField: CustomField = { id: "f2", name: "Count", type: "number" };
  const percentageField: CustomField = { id: "f3", name: "Pct", type: "percentage" };
  const booleanField: CustomField = { id: "f4", name: "Flag", type: "boolean" };

  it("coerces string inputs for text fields", () => {
    expect(coerceFieldValue(shortText, "hello")).toBe("hello");
    expect(coerceFieldValue(shortText, 123)).toBe("");
  });

  it("coerces numeric inputs", () => {
    expect(coerceFieldValue(numberField, 42)).toBe(42);
    expect(coerceFieldValue(numberField, "7")).toBe(7);
    expect(coerceFieldValue(numberField, "not a number")).toBe(0);
    expect(coerceFieldValue(numberField, "")).toBe(0);
    expect(coerceFieldValue(numberField, NaN)).toBe(0);
    expect(coerceFieldValue(numberField, Infinity)).toBe(0);
  });

  it("coerces boolean inputs", () => {
    expect(coerceFieldValue(booleanField, true)).toBe(true);
    expect(coerceFieldValue(booleanField, false)).toBe(false);
    expect(coerceFieldValue(booleanField, "truthy")).toBe(false);
  });

  it("coerces a date to a string, or empty for anything else", () => {
    const dateField: CustomField = { id: "f5", name: "Date", type: "date" };
    expect(coerceFieldValue(dateField, "2026-03-04")).toBe("2026-03-04");
    expect(coerceFieldValue(dateField, 20260304)).toBe("");
  });

  it("coerces a preset selection to a string, or empty for anything else", () => {
    const preset: CustomField = { id: "f6", name: "Status", type: "preset_list" };
    expect(coerceFieldValue(preset, "opt-1")).toBe("opt-1");
    expect(coerceFieldValue(preset, 1)).toBe("");
  });

  it("coerces a long_text value the same as short_text", () => {
    const longText: CustomField = { id: "f7", name: "Body", type: "long_text" };
    expect(coerceFieldValue(longText, "hello")).toBe("hello");
    expect(coerceFieldValue(longText, 123)).toBe("");
  });
});

describe("formatFieldValue", () => {
  const shortText: CustomField = { id: "f1", name: "Name", type: "short_text" };
  const numberField: CustomField = { id: "f2", name: "Count", type: "number" };
  const pctField: CustomField = { id: "f3", name: "Pct", type: "percentage", decimals: 1 };
  const boolField: CustomField = { id: "f4", name: "Flag", type: "boolean" };
  const dateField: CustomField = { id: "f5", name: "Date", type: "date" };
  const presetField: CustomField = {
    id: "f6",
    name: "Status",
    type: "preset_list",
    options: [
      { id: "opt-1", name: "Active", color: "#00ff00" },
    ],
  };

  it("returns empty for undefined/null/empty values", () => {
    expect(formatFieldValue(shortText, undefined)).toBe("");
    expect(formatFieldValue(shortText, "")).toBe("");
  });

  it("truncates long text to 60 chars", () => {
    const long = "a".repeat(100);
    expect(formatFieldValue(shortText, long).length).toBe(60);
  });

  it("formats number with optional unit and decimals", () => {
    const fieldWithUnit: CustomField = {
      id: "f2",
      name: "Hours",
      type: "number",
      unit: "h",
      decimals: 1,
    };
    expect(formatFieldValue(fieldWithUnit, 3.5)).toBe("3.5h");
  });

  it("formats percentage with decimals", () => {
    expect(formatFieldValue(pctField, 75.55)).toBe("75.5%");
  });

  it("formats boolean as Yes/No", () => {
    expect(formatFieldValue(boolField, true)).toBe("Yes");
    expect(formatFieldValue(boolField, false)).toBe("No");
  });

  it("formats preset list options by name", () => {
    expect(formatFieldValue(presetField, "opt-1")).toBe("Active");
    expect(formatFieldValue(presetField, "unknown")).toBe("unknown");
  });

  it("falls back to the raw id when the field has no options at all", () => {
    const bare: CustomField = { id: "f7", name: "Status", type: "preset_list" };
    expect(formatFieldValue(bare, "opt-1")).toBe("opt-1");
  });

  it("formats a date as a human-readable day", () => {
    const out = formatFieldValue(dateField, "2026-03-04");
    expect(out).toMatch(/2026/);
    expect(out).not.toBe("2026-03-04");
  });

  it("returns an unparseable date string verbatim", () => {
    // The value is coerced to "" for a non-string, so a non-empty result
    // here means Date could not read it — the chip must show the raw text
    // rather than "Invalid Date".
    expect(formatFieldValue(dateField, "not-a-date")).toBe("not-a-date");
  });

  it("formats a long_text value the same as short_text", () => {
    const longText: CustomField = { id: "f10", name: "Body", type: "long_text" };
    expect(formatFieldValue(longText, "hello")).toBe("hello");
  });

  it("defaults decimals to 0 for number and percentage", () => {
    const noDecimals: CustomField = { id: "f8", name: "N", type: "number" };
    expect(formatFieldValue(noDecimals, 3.7)).toBe("4");
    const pctNoDecimals: CustomField = { id: "f9", name: "P", type: "percentage" };
    expect(formatFieldValue(pctNoDecimals, 42.4)).toBe("42%");
  });

  it("omits the unit when the field has none", () => {
    expect(formatFieldValue(numberField, 3.5)).toBe("4");
  });

  it("treats a null value as empty", () => {
    expect(formatFieldValue(shortText, null as never)).toBe("");
  });
});
