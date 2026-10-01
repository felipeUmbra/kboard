// Ephemeral view state for search + filtering on the board view.
//
// Deliberately NOT persisted and NOT part of the Board domain type. The board
// file is the source of truth for cards; where the user happens to be looking
// is session state. This matches the rule in Docs/DATA-MODEL.md §8 — derived
// data is computed, never stored — with the one deliberate exception of
// *saved views*, which are an explicit user-authored artifact and live on the
// board (see `Board.savedViews`).
//
// Search and filter are combined with AND: both must pass for a card to show.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isFilterEmpty, matchesFilter, type TodayFn } from "../models/filters";
import type { Board, Card, FilterState } from "../models/types";

/** Debounce for the search box, in ms. Long enough to coalesce typing, short
 *  enough that the board visibly narrows while the user is still typing. */
export const SEARCH_DEBOUNCE_MS = 150;

export interface ViewStateValue {
  /** The raw text in the input. Updates on every keystroke. */
  searchInput: string;
  /** The debounced, trimmed query actually used for filtering. */
  searchQuery: string;
  setSearchInput: (value: string) => void;
  clearSearch: () => void;

  /** The active structured filter. */
  filter: FilterState;
  setFilter: (updater: FilterState | ((prev: FilterState) => FilterState)) => void;
  clearFilter: () => void;

  /** True when neither a search nor a filter is narrowing the board. */
  isNarrowed: boolean;

  /**
   * True when a saved view is active AND the current filter differs from the
   * one that view was saved with — i.e. there are unsaved edits.
   */
  isDirty: boolean;
  /** The filter the active saved view was saved with, for dirty comparison. */
  baseFilter: FilterState | null;
  setBaseFilter: (filter: FilterState | null) => void;
  /** Id of the saved view currently applied, if any. Phase 3. */
  activeViewId: string | null;
  setActiveViewId: (id: string | null) => void;
}

const ViewStateContext = createContext<ViewStateValue | null>(null);

/** Stable empty filter identity, so "no filter" has one reference. */
const EMPTY_FILTER: FilterState = {};

export function ViewStateProvider({
  children,
  boardId,
}: {
  children: ReactNode;
  /** Changing this resets search and filter — switching boards must not carry
   *  a query that means something different on the next board. */
  boardId: string | null;
}) {
  const [searchInput, setSearchInputRaw] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilterRaw] = useState<FilterState>(EMPTY_FILTER);
  const [baseFilter, setBaseFilter] = useState<FilterState | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Debounce the query. A ref holds the timer so we can cancel it if the
  // component unmounts or the board changes mid-flight.
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [searchInput]);

  // Switching boards clears everything: a query and a filter reference ids
  // (label/column/field) that belong to the board they were built against.
  // Carrying them over would silently filter by ids that no longer exist.
  useEffect(() => {
    setSearchInputRaw("");
    setSearchQuery("");
    setFilterRaw(EMPTY_FILTER);
    setBaseFilter(null);
    setActiveViewId(null);
  }, [boardId]);

  const setSearchInput = useCallback((value: string) => {
    setSearchInputRaw(value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInputRaw("");
    setSearchQuery("");
  }, []);

  const setFilter = useCallback(
    (updater: FilterState | ((prev: FilterState) => FilterState)) => {
      setFilterRaw((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      );
    },
    [],
  );

  const clearFilter = useCallback(() => {
    setFilterRaw(EMPTY_FILTER);
  }, []);

  const isDirty = useMemo(() => {
    if (activeViewId === null) return false;
    if (baseFilter === null) return false;
    return JSON.stringify(filter) !== JSON.stringify(baseFilter);
  }, [activeViewId, baseFilter, filter]);

  const value = useMemo<ViewStateValue>(
    () => ({
      searchInput,
      searchQuery,
      setSearchInput,
      clearSearch,
      filter,
      setFilter,
      clearFilter,
      isNarrowed: Boolean(searchQuery) || !isFilterEmpty(filter),
      isDirty,
      baseFilter,
      setBaseFilter,
      activeViewId,
      setActiveViewId,
    }),
    [
      searchInput,
      searchQuery,
      setSearchInput,
      clearSearch,
      filter,
      setFilter,
      clearFilter,
      isDirty,
      baseFilter,
      activeViewId,
    ],
  );

  return (
    <ViewStateContext.Provider value={value}>{children}</ViewStateContext.Provider>
  );
}

export function useViewState(): ViewStateValue {
  const ctx = useContext(ViewStateContext);
  if (!ctx) {
    throw new Error("useViewState must be used inside a ViewStateProvider");
  }
  return ctx;
}

/**
 * Would a newly created card be invisible under the current narrowing?
 *
 * The single place where filtering is not purely a render-time concern: a card
 * created under an active filter that hides it is still created, but the user
 * is told, so it does not look like the create silently failed. Reused by both
 * the column's inline "add card" form and the card editor's save.
 */
export function isHiddenByView(
  board: Board,
  filter: FilterState,
  card: Pick<Card, "type" | "labelIds" | "startDate" | "dueDate" | "boardFieldValues" | "typeFieldValues" | "id">,
  today?: TodayFn,
): boolean {
  // Search is intentionally not consulted: a card you just typed a title for
  // will match your own query, and a hidden-by-search card is not confusing.
  // Only the structured filter can surprise the user this way.
  //
  // matchesFilter only reads the fields above, so a Pick is enough to answer
  // the question without requiring a fully-built Card (which does not exist
  // yet at the moment of creation).
  return !matchesFilter(card as Card, board, filter, today);
}
