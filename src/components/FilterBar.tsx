import { useEffect, useRef, useState } from "react";
import { useViewState } from "../state/viewState";
import { filterSummary } from "../models/filters";
import type { Board } from "../models/types";
import { FilterMenu } from "./FilterMenu";

/**
 * The filter toolbar: a trigger, the active-filter chips, and clear-all.
 *
 * Sits under the board title, above the columns. The menu itself is
 * FilterMenu; this component owns the chip row and the trigger's open/close
 * and focus-return behaviour.
 */
export function FilterBar({ board }: { board: Board }) {
  const { filter, setFilter, clearFilter, searchQuery } = useViewState();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const chips = filterSummary(board, filter);
  const activeCount = chips.length;

  // Escape closes the menu and returns focus to the trigger. Focus must never
  // be lost: without this, closing via keyboard drops the user at the top of
  // the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <div className="filter-bar">
      <div className="filter-bar__controls">
        <button
          type="button"
          ref={triggerRef}
          className="btn btn--ghost"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="filter-trigger"
        >
          <span aria-hidden="true">⚙</span> Filter
          {activeCount > 0 && (
            <span className="filter-bar__badge" data-testid="filter-badge">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clearFilter}
            data-testid="filter-clear-all"
          >
            Clear all
          </button>
        )}
      </div>

      {open && (
        <>
          {/* Click-outside dismiss. A transparent backdrop rather than a
              document listener, so it also covers the case where focus is
              inside the menu and a plain outside-click listener would miss. */}
          <div
            className="filter-bar__backdrop"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            data-testid="filter-backdrop"
          />
          <FilterMenu
            board={board}
            filter={filter}
            onChange={setFilter}
            onClose={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            anchorRef={triggerRef}
          />
        </>
      )}

      {chips.length > 0 && (
        <ul className="filter-bar__chips" data-testid="filter-chips">
          {chips.map((chip) => (
            <li key={chip} className="filter-bar__chip">
              {chip}
            </li>
          ))}
        </ul>
      )}

      {searchQuery && chips.length > 0 && (
        <span className="filter-bar__note">
          Combined with the search text.
        </span>
      )}
    </div>
  );
}
