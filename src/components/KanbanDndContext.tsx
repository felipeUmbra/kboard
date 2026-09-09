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
  type Collision,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";
import { useBoard } from "../state/BoardContext";
import { OVERLAY_COLUMN_PREFIX } from "./MobileColumnTargets";

export function KanbanDndProvider({ children }: { children: ReactNode }) {
  const ctx = useBoard();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sensors tuned for both mouse and touch.
  // - Mouse / pen: activate on 5px of movement (instant, no delay). Otherwise
  //   users can't drag because the click handler on the card fires first.
  // - Touch: require a 250ms long-press so taps still open the card.
  // - Keyboard: full a11y support.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Custom collision detection prefers pointer (in-viewport) over corners.
  //
  // Mobile cross-column drop targets (overlay-column:*) are SMALL
  // (~240px wide) relative to the active card's translated rect, so
  // dnd-kit's pointerWithin (which requires the droppable rect to
  // CONTAIN the card rect) can never match them, and rectIntersection
  // sorts by intersection/union ratio where the giant expanded-column
  // droppable (covering the whole content area) wins. To make the
  // overlay targets reliable we first hit-test the RAW pointer
  // coordinates against the overlay targets and return a hit if any.
  // Otherwise fall back to the standard chain.
  const collisionDetection: CollisionDetection = (args) => {
    const { pointerCoordinates, droppableContainers } = args;
    if (pointerCoordinates) {
      const overlayHits: Collision[] = [];
      for (const container of droppableContainers) {
        const id = String(container.id);
        if (!id.startsWith(OVERLAY_COLUMN_PREFIX)) continue;
        const rect = container.rect.current;
        if (!rect) continue;
        const { x, y } = pointerCoordinates;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          overlayHits.push({ id: container.id });
        }
      }
      if (overlayHits.length > 0) return overlayHits;
    }
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

    if (overId.startsWith(OVERLAY_COLUMN_PREFIX)) {
      // Dropped on a mobile cross-column target (overlay-column:*) —
      // move to the END of that column. We read the live cardIds so
      // the card lands after the column's current contents.
      toColumnId = overId.slice(OVERLAY_COLUMN_PREFIX.length);
      const col = ctx.activeBoard.columns.find((c) => c.id === toColumnId);
      toIndex = col ? col.cardIds.length : 0;
    } else if (overId.startsWith("column:")) {
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
