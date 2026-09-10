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
});
