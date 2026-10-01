// Pure operations on a board's saved views.
//
// Board-scoped by design: a `SavedView` belongs to exactly one board and is
// stored in that board's `savedViews` array. There are no global views, so
// nothing here needs to resolve ids across boards.
//
// Every function is total and returns a new array — nothing mutates in place,
// and nothing throws on malformed input. The board-shaped wrapper that applies
// these to `Board.savedViews` lives in `src/state/savedViewActions.ts`.

import { cryptoRandomId } from "./migrations";
import type { FilterState, SavedView } from "./types";

/** Case-insensitive comparison key for a view name. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Validate a proposed view name.
 *
 * Returns `null` when the name is acceptable, otherwise a message suitable for
 * display next to the input. `existing` should exclude the view being renamed,
 * so renaming a view to its own current name is not a collision.
 */
export function validateViewName(
  name: string,
  existing: SavedView[],
  excludeId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name for this view.";
  const key = nameKey(trimmed);
  const clash = existing.some(
    (v) => v.id !== excludeId && nameKey(v.name) === key,
  );
  if (clash) return `A view named “${trimmed}” already exists.`;
  // A practical ceiling rather than a technical one: names appear in a menu
  // and are rendered into a <select>-style list, so they need a sane bound.
  if (trimmed.length > 60) return "View names are limited to 60 characters.";
  return null;
}

/** Coerce unknown input into a valid SavedView, or null if it can't be. */
export function normalizeSavedView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  if (!r.filter || typeof r.filter !== "object" || Array.isArray(r.filter)) {
    return null;
  }
  const now = Date.now();
  return {
    id: r.id,
    // Preserve the stored name verbatim (including interior spacing); only the
    // validity check trims. Renaming is the user's call, not ours.
    name: r.name,
    filter: r.filter as FilterState,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
}

/**
 * Normalize a board's saved views, dropping anything malformed.
 *
 * Degrade-never-crash, matching `normalizeBoard`: a hand-edited or partially
 * synced Drive file must still open. Entries that are individually broken are
 * dropped rather than repaired, because a view with no name or no filter is
 * not something we can render meaningfully.
 *
 * Duplicate names are resolved first-wins, which keeps the stored order
 * meaningful and prevents two menu items rendering identically.
 */
export function normalizeSavedViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const out: SavedView[] = [];
  for (const entry of raw) {
    const view = normalizeSavedView(entry);
    if (!view) continue;
    // A duplicate id would make React keys collide and update-in-place
    // ambiguous, so it is dropped like any other malformed entry.
    if (seenIds.has(view.id)) continue;
    const key = nameKey(view.name);
    if (seenNames.has(key)) continue;
    seenIds.add(view.id);
    seenNames.add(key);
    out.push(view);
  }
  return out;
}

/**
 * Add a new view. Returns the board's views with `view` appended.
 *
 * No-op if a view with the same name (case-insensitive, trimmed) already
 * exists — validate first and surface the message, this is the last guard.
 */
export function addSavedView(
  views: SavedView[],
  name: string,
  filter: FilterState,
  now: number = Date.now(),
): SavedView[] {
  const trimmed = name.trim();
  if (validateViewName(trimmed, views) !== null) return views;
  const view: SavedView = {
    id: cryptoRandomId(),
    name: trimmed,
    filter,
    createdAt: now,
    updatedAt: now,
  };
  return [...views, view];
}

/**
 * Replace a view's filter, preserving id, name and `createdAt`.
 *
 * This is the "user edited a saved view and saved again" path — it updates in
 * place rather than creating a duplicate. Returns the input unchanged if the
 * id is unknown, so a stale menu reference can't corrupt the list.
 */
export function updateSavedView(
  views: SavedView[],
  id: string,
  filter: FilterState,
  now: number = Date.now(),
): SavedView[] {
  if (!views.some((v) => v.id === id)) return views;
  return views.map((v) =>
    v.id === id ? { ...v, filter, updatedAt: now } : v,
  );
}

/** Rename a view. `name` must already have passed `validateViewName`. */
export function renameSavedView(
  views: SavedView[],
  id: string,
  name: string,
  now: number = Date.now(),
): SavedView[] {
  if (!views.some((v) => v.id === id)) return views;
  return views.map((v) =>
    v.id === id ? { ...v, name: name.trim(), updatedAt: now } : v,
  );
}

/** Remove a view. Unknown ids are a no-op. */
export function deleteSavedView(views: SavedView[], id: string): SavedView[] {
  return views.filter((v) => v.id !== id);
}

/** Find a view by id, or undefined. */
export function findSavedView(
  views: SavedView[],
  id: string | null,
): SavedView | undefined {
  if (!id) return undefined;
  return views.find((v) => v.id === id);
}