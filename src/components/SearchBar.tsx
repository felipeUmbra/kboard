import { useEffect, useRef } from "react";
import { useViewState } from "../state/viewState";

/**
 * Type-to-narrow search over the open board.
 *
 * A real <input type="search"> with a real <label>, not a div with a
 * placeholder — the placeholder is not an accessible name, and this control
 * is keyboard-reachable by definition. Escape clears; the result count is
 * announced politely so a screen-reader user learns that the board narrowed
 * without having to go looking for it.
 */
export function SearchBar({
  matchCount,
  totalCount,
}: {
  matchCount: number;
  totalCount: number;
}) {
  const { searchInput, setSearchInput, clearSearch, isNarrowed } = useViewState();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // "/" focuses the search box, the near-universal convention for search in a
  // dense tool. Ignored while another field has focus so typing a "/" into a
  // card title does not steal the caret.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typingElsewhere =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typingElsewhere) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="search-bar">
      <label className="sr-only" htmlFor="kboard-search">
        Search cards
      </label>
      <span className="search-bar__icon" aria-hidden="true">
        🔍
      </span>
      <input
        id="kboard-search"
        ref={inputRef}
        type="search"
        className="input search-bar__input"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && searchInput) {
            // Stop the event reaching the board-level Escape handler, which
            // would otherwise try to close the view.
            e.stopPropagation();
            clearSearch();
          }
        }}
        placeholder="Search cards…  ( / )"
        autoComplete="off"
        data-testid="search-input"
      />
      {searchInput && (
        <button
          type="button"
          className="btn btn--ghost btn--icon search-bar__clear"
          onClick={() => {
            clearSearch();
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          title="Clear search"
          data-testid="search-clear"
        >
          ✕
        </button>
      )}
      <span
        className="search-bar__count"
        data-testid="search-count"
        // Polite, not assertive: narrowing the board is not an error, and an
        // assertive announcement would interrupt whatever the user is doing.
        aria-live="polite"
        role="status"
      >
        {isNarrowed ? `${matchCount} of ${totalCount}` : ""}
      </span>
    </div>
  );
}
