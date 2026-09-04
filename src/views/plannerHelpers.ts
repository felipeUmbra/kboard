// Pure date helpers for the Planner view (and re-used by Inbox).
// No React, no DOM. Keep this small and testable.

import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { formatIso, parseIso, todayIso } from "../models/dateValidation";
import type { Board, Card } from "../models/types";

/**
 * One day's worth of cards for the planner.
 * `dayIso` is a YYYY-MM-DD string in the user's local TZ.
 */
export interface PlannerDayBucket {
  dayIso: string;
  date: Date;
  cards: Array<{ card: Card; board: Board }>;
}

/** Week starts on Monday in the planner (matches the Trello screenshot). */
export const WEEK_STARTS_ON: 1 = 1;

/** Return the 7 days of the week that contains `anchor`, Monday-first. */
export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Format a YYYY-MM-DD string into a human label, e.g. "Hoje", "Seg 7". */
export function dayLabel(dayIso: string): string {
  const d = parseIso(dayIso);
  if (!d) return dayIso;
  const today = parseIso(todayIso());
  if (today && isSameDay(d, today)) return "Hoje";
  return format(d, "EEE d");
}

/** True if the day is today. */
export function isToday(dayIso: string): boolean {
  return dayIso === todayIso();
}

/** True if the day is a Saturday or Sunday. */
export function isWeekend(dayIso: string): boolean {
  const d = parseIso(dayIso);
  if (!d) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Build the per-day buckets for `week` from the supplied boards.
 * A card with both a `startDate` and `dueDate` shows under `dueDate`
 * (with a "starts" chip rendered by the row when `startDate !== dueDate`).
 * A card with only `startDate` shows under `startDate`.
 * Cards with neither date are skipped — they belong in the "Sem data"
 * group (handled separately by the view).
 */
export function buildPlannerBuckets(
  week: Date[],
  boards: Board[],
): PlannerDayBucket[] {
  const buckets: PlannerDayBucket[] = week.map((date) => {
    const dayIso = formatIso(date);
    return { dayIso, date, cards: [] };
  });
  const byKey = new Map(buckets.map((b) => [b.dayIso, b]));

  for (const board of boards) {
    for (const card of Object.values(board.cards)) {
      const targetIso = card.dueDate ?? card.startDate;
      if (!targetIso) continue;
      const bucket = byKey.get(targetIso);
      if (!bucket) continue; // outside this week
      bucket.cards.push({ card, board });
    }
  }

  // Within a day, sort by startDate so dateless-of-its-day cards
  // (rare) fall below dated ones. Then by title for stable order.
  for (const b of buckets) {
    b.cards.sort((a, c) => {
      const aStart = a.card.startDate ?? "";
      const cStart = c.card.startDate ?? "";
      if (aStart !== cStart) return aStart < cStart ? -1 : 1;
      return a.card.title.localeCompare(c.card.title);
    });
  }

  return buckets;
}

/** Dateless cards across `boards` — used by the "Sem data" group. */
export function datelessCards(
  boards: Board[],
): Array<{ card: Card; board: Board }> {
  const out: Array<{ card: Card; board: Board }> = [];
  for (const board of boards) {
    for (const card of Object.values(board.cards)) {
      if (!card.dueDate && !card.startDate) out.push({ card, board });
    }
  }
  out.sort((a, b) => a.card.title.localeCompare(b.card.title));
  return out;
}

/** Shift a week by `n` weeks (positive = forward, negative = back). */
export function shiftWeek(anchor: Date, n: number): Date {
  return addDays(anchor, n * 7);
}
