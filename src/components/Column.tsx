import { useState } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Board, Card as CardModel, Column as ColumnModel } from "../models/types";
import { Card } from "./Card";
import { useBoard } from "../state/BoardContext";

interface Props {
  column: ColumnModel;
  board: Board;
  onOpenCard: (card: CardModel) => void;
}

export function Column({ column, board, onOpenCard }: Props) {
  const ctx = useBoard();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);

  const sortableItems = column.cardIds;
  const isEmpty = sortableItems.length === 0;

  // The column itself is droppable so empty columns can accept drops.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });

  return (
    <div
      ref={setNodeRef}
      className="kanban-column"
      data-over={isOver ? "true" : "false"}
    >
      <div className="kanban-column__header">
        {editingName ? (
          <input
            className="input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim()) ctx.renameColumn(column.id, nameDraft);
              else setNameDraft(column.name);
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setNameDraft(column.name);
                setEditingName(false);
              }
            }}
            autoFocus
          />
        ) : (
          <h2
            className="kanban-column__title"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {column.name}
            <span className="kanban-column__count">{sortableItems.length}</span>
          </h2>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => {
            if (confirm(`Delete column "${column.name}" and all its cards?`)) {
              ctx.removeColumn(column.id);
            }
          }}
          aria-label="Delete column"
          title="Delete column"
        >
          ✕
        </button>
      </div>

      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        <div className="kanban-column__cards" data-empty={isEmpty ? "true" : "false"}>
          {sortableItems.map((id) => {
            const card = board.cards[id];
            if (!card) return null;
            return <CardItem key={id} card={card} board={board} onOpen={onOpenCard} />;
          })}
        </div>
      </SortableContext>

      {adding ? (
        <div className="kanban-column__add">
          <textarea
            className="textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Card title"
            autoFocus
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) {
                  ctx.addCard(column.id, draft);
                  setDraft("");
                }
              }
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
          />
          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (draft.trim()) {
                  ctx.addCard(column.id, draft);
                  setDraft("");
                }
              }}
            >
              Add card
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="kanban-column__add-btn"
          onClick={() => setAdding(true)}
        >
          + Add card
        </button>
      )}
    </div>
  );
}

function CardItem({
  card,
  board,
  onOpen,
}: {
  card: CardModel;
  board: Board;
  onOpen: (c: CardModel) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card card={card} board={board} onOpen={onOpen} />
    </div>
  );
}
