// Search and filter predicates.
//
// Pure, DOM-free, React-free. Given a board and a card, decide whether it is
// visible. Both the search box and the filter menu funnel through here, and so
// do the saved-view and drag-and-drop code paths — one implementation, so a
// card can never be "visible" to one consumer and "hidden" to another.
//
// Central rule: an empty query and an empty FilterState match EVERY card.
// That makes these functions total — no caller needs a special case for "no
// filtering", which is what makes "Clear all" a single assignment.
//
// Unknown ids are INERT, not fatal. Labels get deleted, fields get removed; a
// filter referencing them must not throw or silently exclude everything. Such
// a predicate simply matches nothing (see the per-dimension notes).

import { htmlToText } from "./htmlText";
import { isCardInDoneColumn } from "./progress";
import type {
  Board,
  Card,
  CardType,
  CustomField,
  DateFilter,
  FieldFilter,
  FilterState,
} from "./types";

/** Field types whose values can be filtered on. Text is excluded by design. */
const FILTERABLE_TEXT_TYPES = new Set(["short_text", "long_text"]);

/** True when `filter` has no active predicate and therefore matches everything. */
export function isFilterEmpty(filter: FilterState): boolean {
  return (
    !filter.cardTypes?.length &&
    !filter.labelIds?.length &&
    !filter.columnIds?.length &&
    !filter.fieldFilters?.length &&
    !isDateFilterActive(filter.startDate) &&
    !isDateFilterActive(filter.dueDate) &&
    !filter.done
  );
}

function isDateFilterActive(df: DateFilter | undefined): boolean {
  return Boolean(df && (df.preset || df.from || df.to));
}

// ─── Search ─────────────────────────────────────────────────────────

/** The lowercase haystack for a card: title + description + label + type. */
function searchHaystack(card: Card, board: Board): string {
  // No nullish guards on title/labelIds: normalizeCard guarantees a string
  // title and a string[] labelIds on every card that reaches the UI, so a
  // `?? ""` here would be a branch no test could ever exercise honestly.
  const parts: string[] = [card.title];

  // Description is HTML; strip tags or every card matches on "<p>".
  const desc = htmlToText(card.descriptionHtml);
  if (desc) parts.push(desc);

  // Match label NAMES, not ids — nobody searches for "lbl-bug".
  for (const id of card.labelIds) {
    const label = board.labels.find((l) => l.id === id);
    if (label) parts.push(label.name);
  }

  // Match the type's user-overridable LABEL, not the raw "epic" enum, so a
  // board that renamed Story → "User Story" matches on what the user sees.
  const cfg = board.cardTypes.find((c) => c.type === card.type);
  const typeLabel = cfg?.label?.trim();
  // `cfg` may be absent (type not configured on this board), and `label` may
  // be blank — both fall back to the raw enum so the type is always
  // searchable. Without the trim check a blank label would contribute an
  // empty string and the card would silently lose its type term.
  parts.push(typeLabel ? typeLabel : card.type);

  return parts.join(" ").toLowerCase();
}

/**
 * Case-insensitive substring match across title, description text, tag names
 * and the card type label. An empty/whitespace query matches everything.
 */
export function matchesSearch(card: Card, board: Board, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return searchHaystack(card, board).includes(q);
}

// ─── Date helpers ───────────────────────────────────────────────────

/** Today as YYYY-MM-DD, injected so tests are not clock-dependent. */
export type TodayFn = () => string;

function defaultToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** True when `iso` is a syntactically valid YYYY-MM-DD date. */
function isIsoDate(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject impossible days like 2026-02-30 by round-tripping.
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Add whole days to an ISO date, returning ISO. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Day of week for an ISO date; 0 = Sunday. */
function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Monday-anchored start of the week containing `iso`. */
function startOfWeekIso(iso: string): string {
  const dow = dayOfWeek(iso);
  // getDay(): Sun=0. Convert so Monday=0, then subtract.
  const sinceMonday = (dow + 6) % 7;
  return addDays(iso, -sinceMonday);
}

/**
 * Resolve a date preset to an inclusive `[from, to]` ISO range.
 *
 * Returns `{}` for "before"/"after" (the bound lives in from/to) — callers
 * must apply their own explicit bounds in that case, which
 * `matchesDateFilter` does.
 */
function resolvePreset(
  preset: Exclude<NonNullable<DateFilter["preset"]>, "no-date">,
  today: string,
): { from?: string; to?: string } {
  switch (preset) {
    case "overdue":
      // Everything strictly before today. Upper bound handled by the caller.
      return { to: addDays(today, -1) };
    case "today":
      return { from: today, to: today };
    case "tomorrow": {
      const t = addDays(today, 1);
      return { from: t, to: t };
    }
    case "this-week": {
      const from = startOfWeekIso(today);
      return { from, to: addDays(from, 6) };
    }
    case "next-week": {
      const from = addDays(startOfWeekIso(today), 7);
      return { from, to: addDays(from, 6) };
    }
    case "next-30-days":
      return { from: today, to: addDays(today, 30) };
    case "before":
    case "after":
      // Neither carries a range of its own — the bound lives in from/to, and
      // the caller applies it. "no-date" never reaches here: the caller
      // returns early for it, since it tests for a null date rather than a
      // range. DatePreset is a closed union, so there is no default arm to
      // fall through to.
      return {};
  }
}

/**
 * Does `iso` satisfy `df`?
 *
 * `iso` may be null (card has no date). The "no-date" preset matches a null
 * date; every other predicate requires a real date. An absent or empty filter
 * matches everything, including null dates — "no date filter" must not exclude
 * undated cards.
 */
function matchesDateFilter(
  iso: string | null,
  df: DateFilter | undefined,
  today: string,
): boolean {
  if (!isDateFilterActive(df)) return true;
  const f = df as DateFilter;

  if (f.preset) {
    // "no-date" is a null-date test, not a range, so it short-circuits here
    // and never reaches resolvePreset (hence its narrower parameter type).
    if (f.preset === "no-date") return iso === null;
    // An invalid stored date can never match a range.
    if (!isIsoDate(iso)) return false;
    const range = resolvePreset(f.preset, today);
    if (!range.from && !range.to) return true;
    if (range.from && iso < range.from) return false;
    if (range.to && iso > range.to) return false;
    return true;
  }

  // Explicit bounds, no preset.
  if (iso === null) return false;
  if (!isIsoDate(iso)) return false;
  // The bounds are validated too, not just compared as raw strings. A
  // malformed bound from a hand-edited board or a corrupt saved view would
  // otherwise be compared lexicographically — "2026-10-01" < "2026-01-32" is
  // true, so a nonsensical bound could silently widen or invert the range.
  // Refusing to match is the predictable failure: the user sees no results and
  // investigates, rather than an arbitrary subset appearing.
  if (f.from !== undefined && !isIsoDate(f.from)) return false;
  if (f.to !== undefined && !isIsoDate(f.to)) return false;
  if (f.from && iso < f.from) return false;
  if (f.to && iso > f.to) return false;
  return true;
}

// ─── Custom field values ────────────────────────────────────────────

/** Find a CustomField by id across board-level and per-type fields. */
function findField(board: Board, fieldId: string): CustomField | undefined {
  const boardField = board.customFields.find((f) => f.id === fieldId);
  if (boardField) return boardField;
  for (const cfg of board.cardTypes) {
    const typeField = cfg.customFields.find((f) => f.id === fieldId);
    if (typeField) return typeField;
  }
  return undefined;
}

/** The card's value for a field id, from whichever map owns it. */
function fieldValue(card: Card, fieldId: string): string | number | boolean | undefined {
  return card.boardFieldValues?.[fieldId] ?? card.typeFieldValues?.[fieldId];
}

/**
 * Does the card satisfy one FieldFilter?
 *
 * An unknown fieldId is INERT — it matches, so a filter referencing a deleted
 * field cannot hide the entire board. Text fields are not filterable and are
 * likewise treated as inert.
 */
function matchesFieldFilter(card: Card, board: Board, ff: FieldFilter): boolean {
  const field = findField(board, ff.fieldId);
  // Unknown or non-filterable field → don't constrain this card.
  if (!field) return true;
  if (FILTERABLE_TEXT_TYPES.has(field.type)) return true;

  const value = fieldValue(card, ff.fieldId);

  switch (field.type) {
    case "preset_list": {
      if (!ff.optionIds?.length) return true;
      const v = typeof value === "string" ? value : "";
      return ff.optionIds.includes(v);
    }
    case "boolean": {
      if (typeof ff.bool !== "boolean") return true;
      return (typeof value === "boolean" ? value : false) === ff.bool;
    }
    case "number":
    case "percentage": {
      if (!ff.num) return true;
      const n = typeof value === "number" ? value : null;
      // A card with no numeric value cannot satisfy a numeric range, but an
      // absent bound is not a range — so an all-open range matches everything.
      if (n === null) return ff.num.min === undefined && ff.num.max === undefined;
      if (ff.num.min !== undefined && n < ff.num.min) return false;
      if (ff.num.max !== undefined && n > ff.num.max) return false;
      return true;
    }
    case "date": {
      const df: DateFilter = ff.date ?? {};
      return matchesDateFilter(
        typeof value === "string" ? value : null,
        df,
        defaultToday(),
      );
    }
    default:
      // Live code, not a dead arm. `normalizeBoard` only checks that a
      // CustomField has an id and a truthy `type`; it does not validate that
      // `type` is one of the seven FieldType values. A hand-edited or
      // partially-synced board can therefore carry a field whose type we
      // don't recognise. Treating it as inert is the safe reading — we cannot
      // know how to compare its value, so we don't constrain on it.
      return true;
  }
}

// ─── The filter predicate ───────────────────────────────────────────

/**
 * Does `card` satisfy `filter`? All predicates AND together; values within one
 * dimension OR together.
 *
 * `columnIds` is evaluated against the card's owning column rather than being
 * folded into the search haystack, because a card belongs to exactly one
 * column and that column is authoritative for its position.
 */
export function matchesFilter(
  card: Card,
  board: Board,
  filter: FilterState,
  today: TodayFn = defaultToday,
): boolean {
  if (isFilterEmpty(filter)) return true;

  if (filter.cardTypes?.length && !filter.cardTypes.includes(card.type)) {
    return false;
  }

  // AND semantics: the card must carry EVERY selected label, not any of them.
  // (Multiple label chips are an intersection: "bug AND urgent".)
  if (filter.labelIds?.length) {
    const owned = new Set(card.labelIds);
    for (const wanted of filter.labelIds) {
      if (!owned.has(wanted)) return false;
    }
  }

  if (filter.columnIds?.length) {
    const col = board.columns.find((c) => c.cardIds.includes(card.id));
    if (!col || !filter.columnIds.includes(col.id)) return false;
  }

  if (filter.fieldFilters?.length) {
    for (const ff of filter.fieldFilters) {
      if (!matchesFieldFilter(card, board, ff)) return false;
    }
  }

  const todayIso = today();
  if (!matchesDateFilter(card.startDate, filter.startDate, todayIso)) return false;
  if (!matchesDateFilter(card.dueDate, filter.dueDate, todayIso)) return false;

  if (filter.done) {
    const isDone = isCardInDoneColumn(board, card.id);
    // DoneFilter is a closed union of exactly these two values, so a single
    // equality test against "done" decides both branches. Written as two
    // separate conditions it reads as though a third value were possible.
    if ((filter.done === "done") !== isDone) return false;
  }

  return true;
}

/**
 * The set of card ids that survive both the search query and the filter.
 *
 * Returns null when nothing is being filtered, which callers use as a fast
 * path: rendering every card and skipping the per-column Set lookup is cheaper
 * than filtering 2000 cards on every keystroke for no reason.
 *
 * One pass over the board's cards, O(cards), not O(cards × columns).
 */
export function visibleCardIds(
  board: Board,
  query: string,
  filter: FilterState,
  today: TodayFn = defaultToday,
): Set<string> | null {
  const filtering = Boolean(query.trim()) || !isFilterEmpty(filter);
  if (!filtering) return null;

  const out = new Set<string>();
  const todayIso = today();
  for (const card of Object.values(board.cards)) {
    if (!matchesSearch(card, board, query)) continue;
    if (!matchesFilter(card, board, filter, () => todayIso)) continue;
    out.add(card.id);
  }
  return out;
}

/**
 * A short human summary of a filter, for the "active filters" chips and the
 * saved-view menu. Returns [] for an empty filter.
 */
export function filterSummary(board: Board, filter: FilterState): string[] {
  const parts: string[] = [];

  if (filter.cardTypes?.length) {
    const labels = filter.cardTypes.map(
      (t) => board.cardTypes.find((c) => c.type === t)?.label ?? t,
    );
    parts.push(`Type: ${labels.join(", ")}`);
  }

  if (filter.labelIds?.length) {
    const names = filter.labelIds.map(
      (id) => board.labels.find((l) => l.id === id)?.name ?? id,
    );
    parts.push(`Labels: ${names.join(", ")}`);
  }

  if (filter.columnIds?.length) {
    const names = filter.columnIds.map(
      (id) => board.columns.find((c) => c.id === id)?.name ?? id,
    );
    parts.push(`Columns: ${names.join(", ")}`);
  }

  if (filter.fieldFilters?.length) {
    for (const ff of filter.fieldFilters) {
      const field = findField(board, ff.fieldId);
      if (!field) continue;
      if (ff.optionIds?.length) {
        const names = ff.optionIds.map(
          (id) => field.options?.find((o) => o.id === id)?.name ?? id,
        );
        parts.push(`${field.name}: ${names.join(", ")}`);
      } else if (typeof ff.bool === "boolean") {
        parts.push(`${field.name}: ${ff.bool ? "Yes" : "No"}`);
      } else if (ff.num) {
        const { min, max } = ff.num;
        const range =
          min !== undefined && max !== undefined
            ? `${min}–${max}`
            : min !== undefined
              ? `≥ ${min}`
              : max !== undefined
                ? `≤ ${max}`
                : "";
        parts.push(`${field.name}: ${range}`);
      } else if (ff.date) {
        const { from, to } = ff.date;
        const range =
          from && to ? `${from} → ${to}` : from ? `from ${from}` : to ? `until ${to}` : "";
        parts.push(`${field.name}: ${range}`);
      }
    }
  }

  if (isDateFilterActive(filter.startDate)) {
    parts.push(`Start: ${describeDateFilter(filter.startDate)}`);
  }
  if (isDateFilterActive(filter.dueDate)) {
    parts.push(`Due: ${describeDateFilter(filter.dueDate)}`);
  }
  if (filter.done) {
    parts.push(filter.done === "done" ? "Done" : "Not done");
  }

  return parts;
}

/**
 * Human-readable text for a date filter. Only called when
 * `isDateFilterActive` was true, which guarantees a preset or a from/to
 * bound.
 */
function describeDateFilter(filter: DateFilter | undefined): string {
  const df = filter as DateFilter;
  if (df.preset) return df.preset.replace(/-/g, " ");
  if (df.from && df.to) return `${df.from} → ${df.to}`;
  if (df.from) return `from ${df.from}`;
  // The only remaining active shape is an upper bound.
  return `until ${df.to as string}`;
}