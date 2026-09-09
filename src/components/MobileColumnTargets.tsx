// Mobile-only drop targets for moving a card to a different column.
//
// On mobile the board renders exactly ONE column at a time (the rail
// expands a single column into the content area), so dragging a card
// onto another column's body is impossible. This component fixes that
// with the same technique as every other axis in the app:
//
//   - It renders a fixed overlay pinned to the left edge of the screen
//     (where the column rail lives) that lists every column by name.
//   - Each item is a `useDroppable` with a DISTINCT id scheme
//     (`overlay-column:{id}`) so the collision detector can prefer it
//     over the giant expanded-column droppable that covers the whole
//     content area. KanbanDndContext resolves these ids to a
//     "move to the end of that column" — no data-model changes.
//   - The overlay only exists while a drag is active (tracked with
//     `useDndMonitor`), so it never intercepts taps on the rail.
//
// The component must be rendered INSIDE <KanbanDndProvider> (it shares
// the same DndContext / collision detection), which is why BoardView
// places it next to the mobile column.

import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import type { Board } from "../models/types";

/** Shared with KanbanDndContext — keep in sync if the prefix changes. */
export const OVERLAY_COLUMN_PREFIX = "overlay-column:";

function ColumnTarget({
  columnId,
  name,
  cardCount,
  isCurrent,
}: {
  columnId: string;
  name: string;
  cardCount: number;
  /** True when this is the currently-expanded column (drop = reorder at end). */
  isCurrent: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: OVERLAY_COLUMN_PREFIX + columnId,
  });
  return (
    <li
      ref={setNodeRef}
      role="button"
      tabIndex={-1}
      className="mobile-move-target"
      data-column-target-id={columnId}
      data-current={isCurrent ? "true" : "false"}
      data-over={isOver ? "true" : "false"}
      aria-hidden="true"
    >
      <span className="mobile-move-target__name">{name}</span>
      <span className="mobile-move-target__count">({cardCount})</span>
    </li>
  );
}

export function MobileColumnTargets({
  board,
  currentColumnId,
}: {
  board: Board;
  /** The currently-expanded mobile column — dimmed in the overlay. */
  currentColumnId: string | undefined;
}) {
  // Track the drag lifecycle locally so the overlay only appears while
  // a card is being dragged. useDndMonitor is scoped to the enclosing
  // DndContext (the Kanban provider), so this stays in sync with the
  // card moves that context handles on drop.
  const [dragging, setDragging] = useState(false);

  useDndMonitor({
    onDragStart: () => setDragging(true),
    onDragEnd: () => setDragging(false),
    onDragCancel: () => setDragging(false),
  });

  if (!dragging) return null;

  return (
    <div className="mobile-move-targets" role="list" aria-label="Move card to column">
      <div className="mobile-move-targets__title">Move to column</div>
      {board.columns.map((col) => (
        <ColumnTarget
          key={col.id}
          columnId={col.id}
          name={col.name}
          cardCount={col.cardIds.length}
          isCurrent={col.id === currentColumnId}
        />
      ))}
    </div>
  );
}