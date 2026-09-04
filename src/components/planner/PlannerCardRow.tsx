// A single card row in the Planner view.
//
// Renders compact: title, due-date chip, label pills, parent chip,
// and a "starts" badge when startDate != dueDate. Uses @dnd-kit's
// useDraggable (not sortable) — there's no intra-day ordering in v1.
//
// Click navigates to the card in its board. We pass a `focusCardId`
// hint through openBoard so the BoardView can scroll/focus the card.

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { LabelPill } from "../fields/LabelPill";
import { useBoard } from "../../state/BoardContext";
import type { Board, Card } from "../../models/types";
import { todayIso } from "../../models/dateValidation";

export function PlannerCardRow({
  card,
  board,
}: {
  card: Card;
  board: Board;
}) {
  const ctx = useBoard();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: "grab",
  };

  const isOverdue =
    card.dueDate != null && card.dueDate < todayIso();

  const onActivate = () => {
    void ctx.openBoard(board.id, card.id);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="planner-card"
      data-testid="planner-card"
      data-card-id={card.id}
      data-board-id={board.id}
      onClick={(e) => {
        // Suppress click after a drag end (dnd-kit fires click even
        // when a drag occurred; the small move during drop counts).
        if (isDragging) {
          e.preventDefault();
          return;
        }
        // Distinguish click from drag-start: only navigate on a
        // "clean" click (no movement). dnd-kit's listeners block
        // this naturally for pointer, but keyboard Enter bypasses
        // the activation distance.
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open card ${card.title}`}
    >
      <div className="planner-card__title">{card.title}</div>
      <div className="planner-card__meta">
        {card.dueDate && (
          <span
            className={
              "planner-card__due" +
              (isOverdue ? " planner-card__due--overdue" : "")
            }
            title={isOverdue ? "Overdue" : "Due"}
          >
            📅 {card.dueDate}
          </span>
        )}
        {card.startDate && card.startDate !== card.dueDate && (
          <span className="planner-card__starts" title="Starts">
            ▶ {card.startDate}
          </span>
        )}
        {card.labelIds.length > 0 && (
          <span className="planner-card__labels">
            {card.labelIds
              .slice(0, 3)
              .map((id) => board.labels.find((l) => l.id === id))
              .filter((l): l is NonNullable<typeof l> => Boolean(l))
              .map((l) => (
                <LabelPill key={l.id} label={l} compact />
              ))}
          </span>
        )}
        <span className="planner-card__board" title={board.name}>
          {board.name}
        </span>
      </div>
    </li>
  );
}
