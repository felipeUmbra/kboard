import { useEffect, useState } from "react";
import { useBoard } from "../state/BoardContext";
import { Column } from "./Column";
import { CardEditor } from "./CardEditor";
import { KanbanDndProvider } from "./KanbanDndContext";
import { useViewport } from "../hooks/useViewport";
import type { AddCardDirection } from "../state/cardActions";
import type { Card } from "../models/types";

export function BoardView({ onBackToList }: { onBackToList: () => void }) {
  const board = useBoard();
  const viewport = useViewport();
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

  const columnsToShow =
    viewport.isMobile ? [b.columns[mobileColumnIndex]].filter(Boolean) : b.columns;

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
      </div>

      {viewport.isMobile && (
        <div
          className="kanban-tabs"
          role="tablist"
          aria-label="Columns"
        >
          {b.columns.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === mobileColumnIndex}
              className="kanban-tab"
              data-active={i === mobileColumnIndex ? "true" : "false"}
              onClick={() => setMobileColumnIndex(i)}
            >
              {c.name}
              <span className="kanban-tab__count">{c.cardIds.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="kanban-scroll">
        <KanbanDndProvider>
          <div className="kanban">
            {columnsToShow.map((col) => (
              <Column
                key={col.id}
                column={col}
                board={b}
                onOpenCard={openCard}
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
              onClick={() => {
                const name = prompt("Column name");
                if (name && name.trim()) board.addColumn(name);
              }}
            >
              + Add column
            </button>
          </div>
        </KanbanDndProvider>
      </div>

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
          onAddChild={handleAddChild}
          onAddParent={handleAddParent}
        />
      )}
    </div>
  );
}
