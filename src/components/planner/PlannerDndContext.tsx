// Drag-and-drop context for the Planner view.
//
// Difference vs. KanbanDndContext:
//   - Day columns are `useDroppable` with ids "day:YYYY-MM-DD".
//   - Card rows are `useDraggable` (not sortable) — there's no
//     intra-day ordering in v1.
//   - On drop we call `board.updateCard(cardId, { dueDate: day })` —
//     the existing action that triggers the 600ms debounced Drive
//     sync. The local optimistic update is what makes the drop
//     feel instant; Drive catches up a moment later.
//
// Activation constraints match the kanban DnD: 5px on mouse, 250ms
// long-press on touch, full keyboard support.

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { useBoard } from "../../state/BoardContext";

const DAY_DROPPABLE_PREFIX = "day:";

export function PlannerDndProvider({ children }: { children: ReactNode }) {
  const ctx = useBoard();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith(DAY_DROPPABLE_PREFIX)) return;
    const dayIso = overId.slice(DAY_DROPPABLE_PREFIX.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return;

    const cardId = String(active.id);
    // Defensive: find the card across all boards so we don't rely on
    // activeBoard being set (it may not be in the planner).
    let found = false;
    for (const board of ctx.boards) {
      if (board.cards[cardId]) {
        found = true;
        break;
      }
    }
    if (!found) return;

    ctx.updateCard(cardId, { dueDate: dayIso });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {children}
      <span className="sr-only" aria-live="polite">
        {activeId ? "Card picked up — drop on a day to reschedule" : ""}
      </span>
    </DndContext>
  );
}
