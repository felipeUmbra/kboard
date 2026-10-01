// Board-level reducers for saved views.
//
// The pure array operations live in `src/models/savedViews.ts`
// (addSavedView / updateSavedView / renameSavedView / deleteSavedView).
// This module is the board-shaped wrapper: it locates `Board.savedViews`,
// applies one of those operations, and returns a NEW board. Nothing here
// touches storage — persistence is the `mutate` pipeline's job in
// `boardActions.ts`.
//
// `savedViews` is optional on `Board` (boards written before saved views
// existed have no such key), so every read goes through `?? []` and every
// write re-establishes the array. normalizeBoard guarantees a real array on
// the way in, but these reducers must not assume the caller normalized.

import {
  addSavedView,
  deleteSavedView,
  renameSavedView,
  updateSavedView,
  validateViewName,
} from "../models/savedViews";
import type { Board, FilterState, SavedView } from "../models/types";

/** The board's views, tolerating a board that predates the field. */
function viewsOf(board: Board): SavedView[] {
  return board.savedViews ?? [];
}

/** Replace `board.savedViews`, always producing an array (never undefined) so
 *  the persisted document keeps the key and round-trips predictably. */
function withViews(board: Board, views: SavedView[]): Board {
  return { ...board, savedViews: views };
}

export interface SaveViewResult {
  board: Board;
  /** The id of the affected view, or null when the name was rejected. */
  viewId: string | null;
  /** A user-facing reason the save was refused, or null on success. */
  error: string | null;
}

/**
 * Create a NEW view. Refuses a duplicate (case-insensitive, trimmed) name and
 * returns the message from `validateViewName` so the caller can show it
 * next to the input and announce it.
 *
 * An empty `filter` is allowed. "All cards" with no narrowing is a legitimate
 * (if not very useful) saved view, and refusing it would be a surprise.
 */
export function saveView(
  board: Board,
  name: string,
  filter: FilterState,
  now: number = Date.now(),
): SaveViewResult {
  const existing = viewsOf(board);
  const error = validateViewName(name, existing);
  if (error) return { board, viewId: null, error };
  // No `next === existing` guard: addSavedView re-runs the same
  // validateViewName we just passed, so it cannot decline here. A guard for an
  // impossible outcome is dead code — see the vitest.config.ts note on why
  // those get deleted rather than covered.
  const next = addSavedView(existing, name, filter, now);
  return { board: withViews(board, next), viewId: next[next.length - 1].id, error: null };
}

/**
 * Overwrite an existing view's filter — the "Update view" path. Keeps the id,
 * the name, and `createdAt`; bumps `updatedAt`.
 *
 * Returns an unchanged board (not an error) for an unknown id: the view may
 * have been deleted in another tab, and a stale menu click should be a no-op
 * rather than a thrown error.
 */
export function updateView(
  board: Board,
  viewId: string,
  filter: FilterState,
  now: number = Date.now(),
): Board {
  const existing = viewsOf(board);
  const next = updateSavedView(existing, viewId, filter, now);
  if (next === existing) return board;
  return withViews(board, next);
}

/**
 * Rename a view, enforcing the same uniqueness rule as `saveView`. An unknown
 * id, or a name that clashes with a DIFFERENT view, is refused.
 */
export function renameView(
  board: Board,
  viewId: string,
  name: string,
  now: number = Date.now(),
): { board: Board; error: string | null } {
  const existing = viewsOf(board);
  if (!existing.some((v) => v.id === viewId)) {
    return { board, error: "That view no longer exists." };
  }
  // Exclude the view being renamed so saving an unchanged name is not a clash.
  const error = validateViewName(name, existing, viewId);
  if (error) return { board, error };
  // No `next === existing` guard: renameSavedView only declines on an unknown
  // id, which the check above already rejected.
  return { board: withViews(board, renameSavedView(existing, viewId, name, now)), error: null };
}

/** Delete a view. An unknown id leaves the board untouched. */
export function deleteView(board: Board, viewId: string): Board {
  const existing = viewsOf(board);
  if (!existing.some((v) => v.id === viewId)) return board;
  return withViews(board, deleteSavedView(existing, viewId));
}

/** Look up a single view, or null. */
export function findView(board: Board, viewId: string | null): SavedView | null {
  if (!viewId) return null;
  return viewsOf(board).find((v) => v.id === viewId) ?? null;
}