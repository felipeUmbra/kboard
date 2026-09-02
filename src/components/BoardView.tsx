import { useEffect, useState } from "react";
import { useBoard } from "../state/BoardContext";
import { Column } from "./Column";
import { CardEditor } from "./CardEditor";
import { KanbanDndProvider } from "./KanbanDndContext";
import { useViewport } from "../hooks/useViewport";
import type { Card } from "../models/types";

export function BoardView({ onBackToList }: { onBackToList: () => void }) {
  const board = useBoard();
  const viewport = useViewport();
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [mobileColumnIndex, setMobileColumnIndex] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    if (!board.activeBoard) return;
    setDraftName(board.activeBoard.name);
  }, [board.activeBoard?.id]);

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
          onClose={() => setEditingCardId(null)}
          onOpenCard={(childId) => setEditingCardId(childId)}
        />
      )}
    </div>
  );
}
