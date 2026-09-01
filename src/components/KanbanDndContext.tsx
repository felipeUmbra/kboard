import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";
import { useBoard } from "../state/BoardContext";

export function KanbanDndProvider({ children }: { children: ReactNode }) {
  const ctx = useBoard();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sensors tuned for both mouse and touch (long-press to pick up on touch).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Custom collision detection prefers pointer (in-viewport) over corners.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    const intersections = rectIntersection(args);
    if (intersections.length > 0) return intersections;
    return closestCorners(args);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || !ctx.activeBoard) return;
    const cardId = String(active.id);

    // Resolve target column + index
    const overId = String(over.id);
    let toColumnId: string | null = null;
    let toIndex = 0;

    if (overId.startsWith("column:")) {
      // Dropped on the column body (empty column or background)
      toColumnId = overId.slice("column:".length);
      const col = ctx.activeBoard.columns.find((c) => c.id === toColumnId);
      toIndex = col ? col.cardIds.length : 0;
    } else {
      // Dropped on another card — insert into that card's column at its index
      for (const col of ctx.activeBoard.columns) {
        const idx = col.cardIds.indexOf(overId);
        if (idx >= 0) {
          toColumnId = col.id;
          toIndex = idx;
          break;
        }
      }
    }

    if (!toColumnId) return;
    ctx.moveCard(cardId, toColumnId, toIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {children}
      {/* a11y live region for screen readers */}
      <span className="sr-only" aria-live="polite">
        {activeId ? "Card picked up" : ""}
      </span>
    </DndContext>
  );
}
