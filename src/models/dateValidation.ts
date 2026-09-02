// Pure date validation for card start/due dates.
// No React, no DOM — easy to test, easy to reuse.

export type ValidationLevel = "ok" | "info" | "warning";

export interface DateIssue {
  level: ValidationLevel;
  message: string;
}

export interface DateValidation {
  startIssue: DateIssue | null;
  dueIssue: DateIssue | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns today's date in the user's local time zone as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return formatIso(d);
}

/** Format a Date as YYYY-MM-DD in local time. */
export function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a Date in local time (start of day). */
export function parseIso(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function validateDates(
  startDate: string | null,
  dueDate: string | null,
  options: { isNewCard?: boolean } = {},
): DateValidation {
  const startIssue: DateIssue | null =
    startDate && options.isNewCard && isPast(startDate)
      ? { level: "info", message: "Start date is in the past" }
      : null;

  let dueIssue: DateIssue | null = null;
  if (dueDate) {
    if (isPast(dueDate)) {
      dueIssue = { level: "warning", message: "Due date is in the past" };
    } else if (startDate && compareIso(dueDate, startDate) < 0) {
      dueIssue = {
        level: "warning",
        message: "Due date is before the start date",
      };
    }
  }

  return { startIssue, dueIssue };
}

function isPast(iso: string): boolean {
  const today = todayIso();
  return compareIso(iso, today) < 0;
}

/** Compare two YYYY-MM-DD strings. Negative if a < b. */
function compareIso(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
