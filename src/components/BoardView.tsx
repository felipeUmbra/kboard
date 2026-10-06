import { useCallback, useEffect, useMemo, useState } from "react";
import { useBoard } from "../state/BoardContext";
import { ViewStateProvider, useViewState, isHiddenByView } from "../state/viewState";
import { Column } from "./Column";
import { CardEditor } from "./CardEditor";
import { KanbanDndProvider } from "./KanbanDndContext";
import { MobileColumnTargets } from "./MobileColumnTargets";
import { useViewport } from "../hooks/useViewport";
import { SearchBar } from "./SearchBar";
import { FilterBar } from "./FilterBar";
import { SavedViewsMenu } from "./SavedViewsMenu";
import { Toast, useToast } from "./Toast";
import { visibleCardIds as computeVisible } from "../models/filters";
import type { AddCardDirection } from "../state/cardActions";
import type { Card } from "../models/types";
import { DndKeyboardHelp, DND_HELP_ID } from "./DndKeyboardHelp";

export function BoardView({ onBackToList }: { onBackToList: () => void }) {
  const board = useBoard();
  // The provider keys off the board id so switching boards clears the query
  // and the filter — a saved view's ids mean nothing on another board.
  return (
    <ViewStateProvider boardId={board.activeBoard?.id ?? null}>
      <BoardViewInner onBackToList={onBackToList} />
    </ViewStateProvider>
  );
}

function BoardViewInner({ onBackToList }: { onBackToList: () => void }) {
  const board = useBoard();
  const viewport = useViewport();
  const { searchQuery, filter, clearFilter, clearSearch, isNarrowed } = useViewState();
  const { toast, notify, dismiss } = useToast();
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  // Track cards created via "+ Add child/parent" so the editor can gate
  // Save and require a name before letting the user close.
  const [newlyCreatedCardId, setNewlyCreatedCardId] = useState<string | null>(null);
  // Origin info for rollback when the user discards a freshly created card.
  const [newCardOrigin, setNewCardOrigin] = useState<
    { originCardId: string; direction: AddCardDirection } | null
  >(null);
  const [mobileColumnIndex, setMobileColumnIndex] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    if (!board.activeBoard) return;
    setDraftName(board.activeBoard.name);
  }, [board.activeBoard?.id]);

  // Keep the expanded mobile column index within bounds — columns can be
  // deleted/reconciled while one is selected.
  useEffect(() => {
    if (!board.activeBoard) return;
    if (mobileColumnIndex >= board.activeBoard.columns.length) {
      setMobileColumnIndex(0);
    }
  }, [board.activeBoard?.columns.length, mobileColumnIndex]);

  // Focus-card routing: when Planner / Inbox opens a board with a
  // focusCardId, scroll that card into view and clear the hint so a
  // subsequent openBoard(boardId) (no card id) doesn't re-trigger.
  // We watch focusCardId + activeBoard.id so a card that arrives via
  // a Drive reconcile (no second openBoard call) still gets focused.
  useEffect(() => {
    const id = board.focusCardId;
    if (!id || !board.activeBoard) return;
    // The Column component renders a `<li data-card-id="…">` wrapper
    // for each card. We use that to find the DOM node and scroll.
    // Defer to a microtask so the column has rendered the card.
    const handle = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-card-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      // Clear the hint regardless of whether the card was found,
      // so we don't keep retrying on every render.
      board.clearFocusCard();
    }, 50);
    return () => window.clearTimeout(handle);
  }, [board.focusCardId, board.activeBoard?.id, board.clearFocusCard]);

  if (!board.activeBoard) {
    return (
      <div className="empty-state">
        <p>Loading board…</p>
      </div>
    );
  }
  const b = board.activeBoard;

  const openCard = (card: Card) => setEditingCardId(card.id);

  const startRename = () => {
    setDraftName(b.name);
    setEditingName(true);
  };

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed) board.renameBoard(trimmed);
    setEditingName(false);
  };

  const handleAddChild = (originCardId: string) => {
    const newId = board.addChildCard(originCardId);
    if (!newId) return;
    setNewlyCreatedCardId(newId);
    setNewCardOrigin({ originCardId, direction: "as_child" });
    setEditingCardId(newId);
  };

  const handleAddParent = (originCardId: string) => {
    const newId = board.addParentCard(originCardId);
    if (!newId) return;
    setNewlyCreatedCardId(newId);
    setNewCardOrigin({ originCardId, direction: "as_parent" });
    setEditingCardId(newId);
  };

  const handleCardSaved = () => {
    setNewlyCreatedCardId(null);
    setNewCardOrigin(null);
  };

  // One pass over the board's cards per query/filter change, not one per
  // column. `computeVisible` returns null when nothing is narrowed, and the
  // Column treats null as "render everything" — so the common case costs
  // nothing at all.
  const visible = useMemo(
    () => (b ? computeVisible(b, searchQuery, filter) : null),
    [b, searchQuery, filter],
  );
  const matchCount = visible ? visible.size : Object.keys(b?.cards ?? {}).length;
  const totalCount = Object.keys(b?.cards ?? {}).length;

  /**
   * A card created under an active filter that hides it is still created —
   * the work is never lost — but we say so, because an invisible new card
   * looks exactly like a failed create.
   */
  const warnIfHidden = useCallback(
    (card: Card) => {
      if (isHiddenByView(b, filter, card)) {
        notify("Card saved — hidden by the current filters.", {
          label: "Clear filters",
          onAction: clearFilter,
        });
      }
    },
    [b, filter, notify, clearFilter],
  );

  const columnsToShow =
    viewport.isMobile ? [b.columns[mobileColumnIndex]].filter(Boolean) : b.columns;

  /**
   * Clear BOTH the search text and the structured filter.
   *
   * The empty state has one action, and a user who reached it by typing in the
   * search box would not expect to have to find the filter's own "Clear all"
   * as well — leaving the search text behind would keep the board empty and
   * read as "the button did nothing".
   *
   * Leaving a saved view active is deliberate: the view is a named filter, not
   * the narrowing itself, and the user may want to leave it and filter afresh.
   * The active-view badge makes that state visible.
   */
  const clearFilters = useCallback(() => {
    clearSearch();
    clearFilter();
  }, [clearSearch, clearFilter]);

  const handleAddColumn = () => {
    const name = prompt("Column name");
    if (name && name.trim()) board.addColumn(name);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        {viewport.isMobile && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onBackToList}
            aria-label="Back to boards"
          >
            ←
          </button>
        )}
        {editingName ? (
          <input
            className="input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingName(false);
            }}
            autoFocus
            style={{ maxWidth: 320 }}
          />
        ) : (
          <h1
            onClick={startRename}
            style={{ fontSize: "var(--text-xl)", fontWeight: 600, cursor: "pointer" }}
            title="Click to rename"
          >
            {b.name}
          </h1>
        )}
        <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          {Object.keys(b.cards).length} cards · {b.columns.length} columns
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (confirm(`Delete board "${b.name}"?`)) {
              void board.deleteBoard(b);
            }
          }}
        >
          Delete board
        </button>
        <DndKeyboardHelp id={DND_HELP_ID} />
      </div>

      {/* Search + filter + saved views toolbar. Sits between the board header
          and the columns, full width. It does NOT wrap: wrapping pushed the
          filter bar onto a second line on tablet, which dragged the anchored
          menu down and made its options unclickable. The search box is the
          only shrinkable child (see .board-toolbar in components.css). */}
      <div className="board-toolbar">
        <SearchBar matchCount={matchCount} totalCount={totalCount} />
        <FilterBar board={b} />
        <SavedViewsMenu />
      </div>

      {/* Board-wide "nothing matched" state.
          Shown only when the board HAS cards and narrowing is active but
          matched none. Without it the user sees an empty board and has no way
          to tell that apart from an empty board, or from a filter that ate
          everything — the columns still render (showing 0) so the board's
          shape is not lost, but nothing explains why. */}
      {isNarrowed && matchCount === 0 && (
        <div
          className="empty-state"
          role="status"
          data-testid="board-no-matches"
        >
          <p className="empty-state__title">No cards match</p>
          <p className="empty-state__msg">
            {searchQuery
              ? "Nothing matches the current search and filters."
              : "Nothing matches the current filters."}
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={clearFilters}
            data-testid="board-no-matches-clear"
          >
            Clear search and filters
          </button>
        </div>
      )}


      {viewport.isMobile ? (
        <div className="kanban-mobile">
          {/* Collapsible column rail — each column is a vertical strip; the
              name reads vertically and the card count "(xx)" sits at the
              bottom in normal (horizontal) orientation. Tapping a strip
              expands that column into the content area. */}
          <div className="kanban-rail" role="tablist" aria-label="Columns">
            {b.columns.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={i === mobileColumnIndex}
                className="kanban-rail__strip"
                data-active={i === mobileColumnIndex ? "true" : "false"}
                data-done={b.doneColumnIds.includes(c.id) ? "true" : "false"}
                onClick={() => setMobileColumnIndex(i)}
              >
                <span className="kanban-rail__name">{c.name}</span>
                <span className="kanban-rail__count">({c.cardIds.length})</span>
              </button>
            ))}
            <button
              type="button"
              className="kanban-rail__add"
              onClick={handleAddColumn}
              aria-label="Add column"
              title="Add column"
            >
              +
            </button>
          </div>
          <div className="kanban-rail__content">
            <KanbanDndProvider>
              <div className="kanban">
                {columnsToShow.map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    board={b}
                    onOpenCard={openCard}
                    visibleCardIds={visible}
                  />
                ))}
              </div>
              {/**
               * Mobile cross-column moves: the rail shows one column at a
               * time, so this overlay lists every column as a drop target
               * while a card is being dragged. Must live inside the
               * KanbanDndProvider so it shares the DndContext's droppable
               * registration and collision detection.
               */}
              <MobileColumnTargets
                board={b}
                currentColumnId={b.columns[mobileColumnIndex]?.id}
                visibleCardIds={visible}
              />
            </KanbanDndProvider>
          </div>
        </div>
      ) : (
        <div className="kanban-scroll">
          <KanbanDndProvider>
            <div className="kanban">
              {columnsToShow.map((col) => (
                <Column
                  key={col.id}
                  column={col}
                  board={b}
                  onOpenCard={openCard}
                  visibleCardIds={visible}
                />
              ))}
              <button
                type="button"
                className="btn"
                style={{
                  minWidth: "var(--column-w)",
                  alignSelf: "flex-start",
                  justifyContent: "flex-start",
                }}
                onClick={handleAddColumn}
              >
                + Add column
              </button>
            </div>
          </KanbanDndProvider>
        </div>
      )}

      {editingCardId && (
        <CardEditor
          cardId={editingCardId}
          board={b}
          onClose={() => {
            setEditingCardId(null);
            // Clear the "new" flag so the editor doesn't reopen as a draft
            // next time the user opens this same card. (The card itself
            // is still in the board unless the editor deleted it.)
            setNewlyCreatedCardId(null);
            setNewCardOrigin(null);
          }}
          onOpenCard={(childId) => setEditingCardId(childId)}
          isNewCard={editingCardId === newlyCreatedCardId}
          newCardOrigin={newCardOrigin ?? undefined}
          onSaved={handleCardSaved}
          onSavedCard={warnIfHidden}
          onAddChild={handleAddChild}
          onAddParent={handleAddParent}
        />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
