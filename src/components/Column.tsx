import { useState } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type {
  Board,
  Card as CardModel,
  CardType,
  Column as ColumnModel,
} from "../models/types";
import { Card } from "./Card";
import { useBoard } from "../state/BoardContext";
import { ALL_CARD_TYPES, CARD_TYPE_META } from "../models/cardTypeMeta";

interface Props {
  column: ColumnModel;
  board: Board;
  onOpenCard: (card: CardModel) => void;
}

export function Column({ column, board, onOpenCard }: Props) {
  const ctx = useBoard();
  const [adding, setAdding] = useState<CardType | null>(null);
  const [draft, setDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const sortableItems = column.cardIds;
  const isEmpty = sortableItems.length === 0;
  const isDone = board.doneColumnIds.includes(column.id);

  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });

  const enabledTypes = board.cardTypes.filter((c) => c.enabled);

  const submit = (type: CardType) => {
    if (!draft.trim()) return;
    ctx.addCard(column.id, draft, type);
    setDraft("");
  };

  return (
    <div
      ref={setNodeRef}
      className="kanban-column"
      data-over={isOver ? "true" : "false"}
      data-done={isDone ? "true" : "false"}
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
            {isDone && <span className="kanban-column__done-dot" title="Done column" />}
            {column.name}
            <span className="kanban-column__count">{" (" + sortableItems.length + ")"}</span>
          </h2>
        )}
        <div style={{ display: "flex", gap: 4, position: "relative" }}>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => setColMenuOpen((o) => !o)}
            aria-label="Column options"
            title="Column options"
          >
            ⋯
          </button>
          {colMenuOpen && (
            <div
              className="dropdown-menu"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                zIndex: 10,
                minWidth: 180,
                padding: 4,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  ctx.setDoneColumn(column.id, !isDone);
                  setColMenuOpen(false);
                }}
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "flex-start" }}
              >
                {isDone ? "✓ Mark as not done" : "Mark as done column"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete column "${column.name}" and all its cards?`)) {
                    ctx.removeColumn(column.id);
                  }
                  setColMenuOpen(false);
                }}
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "flex-start", color: "var(--color-danger, #eb5a46)" }}
              >
                Delete column
              </button>
            </div>
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
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
              marginBottom: 4,
            }}
          >
            Adding:{" "}
            <strong style={{ color: CARD_TYPE_META[adding].color }}>
              {CARD_TYPE_META[adding].icon} {CARD_TYPE_META[adding].defaultLabel}
            </strong>
          </div>
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
                  submit(adding);
                  setAdding(null);
                }
              }
              if (e.key === "Escape") {
                setAdding(null);
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
                  submit(adding);
                  setAdding(null);
                }
              }}
            >
              Add {CARD_TYPE_META[adding].defaultLabel.toLowerCase()}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setAdding(null);
                setDraft("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : enabledTypes.length > 0 ? (
        <div style={{ display: "flex", position: "relative" }}>
          <button
            type="button"
            className="kanban-column__add-btn"
            onClick={() => setAdding(enabledTypes[0].type)}
            style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          >
            + Add {CARD_TYPE_META[enabledTypes[0].type].defaultLabel.toLowerCase()}
          </button>
          {enabledTypes.length > 1 && (
            <>
              <button
                type="button"
                className="kanban-column__add-btn"
                onClick={() => setTypeMenuOpen((o) => !o)}
                aria-label="Choose card type"
                title="Choose card type"
                style={{
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  borderLeft: "1px solid var(--color-border)",
                  padding: "0 8px",
                }}
              >
                ▾
              </button>
              {typeMenuOpen && (
                <div
                  className="dropdown-menu"
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    marginBottom: 4,
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    zIndex: 10,
                    minWidth: 160,
                    padding: 4,
                  }}
                >
                  {enabledTypes.map((cfg) => (
                    <button
                      key={cfg.type}
                      type="button"
                      onClick={() => {
                        setAdding(cfg.type);
                        setTypeMenuOpen(false);
                      }}
                      className="btn btn--ghost"
                      style={{
                        width: "100%",
                        justifyContent: "flex-start",
                        color: CARD_TYPE_META[cfg.type].color,
                      }}
                    >
                      <span aria-hidden="true">{CARD_TYPE_META[cfg.type].icon}</span>{" "}
                      {cfg.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
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
