import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  todayIso,
  formatIso,
  parseIso,
  validateDates,
} from "./dateValidation";

describe("todayIso", () => {
  it("returns today in YYYY-MM-DD format", () => {
    const result = todayIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = result.split("-").map(Number);
    const now = new Date();
    expect(y).toBe(now.getFullYear());
    expect(m).toBe(now.getMonth() + 1);
    expect(d).toBe(now.getDate());
  });
});

describe("formatIso", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(formatIso(new Date(2025, 0, 15))).toBe("2025-01-15");
    expect(formatIso(new Date(2024, 11, 31))).toBe("2024-12-31");
  });

  it("zero-pads month and day", () => {
    expect(formatIso(new Date(2025, 0, 5))).toBe("2025-01-05");
    expect(formatIso(new Date(2025, 2, 9))).toBe("2025-03-09");
  });
});

describe("parseIso", () => {
  it("parses valid ISO date strings", () => {
    const d = parseIso("2025-06-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5); // June = 5
    expect(d!.getDate()).toBe(15);
  });

  it("returns null for invalid formats", () => {
    expect(parseIso("")).toBeNull();
    expect(parseIso("2025/06/15")).toBeNull();
    expect(parseIso("not-a-date")).toBeNull();
    expect(parseIso("2025-6-15")).toBeNull(); // not zero-padded
  });
});

describe("validateDates", () => {
  // Use vi.useFakeTimers to control "today"
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15)); // June 15, 2025
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns no issues when both dates are null", () => {
    const result = validateDates(null, null);
    expect(result.startIssue).toBeNull();
    expect(result.dueIssue).toBeNull();
  });

  it("warns when due date is in the past", () => {
    const result = validateDates(null, "2025-06-10");
    expect(result.startIssue).toBeNull();
    expect(result.dueIssue).toEqual({
      level: "warning",
      message: "Due date is in the past",
    });
  });

  it("warns when due date is in the past AND before start date", () => {
    // When due date is both past and before start, "in the past" fires first
    const result = validateDates("2025-06-20", "2025-06-10");
    expect(result.startIssue).toBeNull();
    expect(result.dueIssue).toEqual({
      level: "warning",
      message: "Due date is in the past",
    });
  });

  it("warns when due date is before start date (future dates)", () => {
    const result = validateDates("2025-06-25", "2025-06-20");
    expect(result.startIssue).toBeNull();
    expect(result.dueIssue).toEqual({
      level: "warning",
      message: "Due date is before the start date",
    });
  });

  it("returns no issues for valid future dates", () => {
    const result = validateDates("2025-06-20", "2025-06-25");
    expect(result.startIssue).toBeNull();
    expect(result.dueIssue).toBeNull();
  });

  it("info-level for past start date on new cards", () => {
    const result = validateDates("2025-06-10", null, { isNewCard: true });
    expect(result.startIssue).toEqual({
      level: "info",
      message: "Start date is in the past",
    });
  });

  it("no start issue for past start date on existing cards", () => {
    const result = validateDates("2025-06-10", null, { isNewCard: false });
    expect(result.startIssue).toBeNull();
  });
});
