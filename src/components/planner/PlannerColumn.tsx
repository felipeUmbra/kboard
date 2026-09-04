// A single day column in the Planner week view.
//
// Day columns are useDroppable targets; the droppable id is
// "day:YYYY-MM-DD". Cards inside are PlannerCardRow (useDraggable).
//
// Visual states:
//   - today: highlighted with the accent-soft background
//   - weekend: subtle de-emphasis (lower opacity)
//   - empty: "Nada planejado" placeholder

import { useDroppable } from "@dnd-kit/core";
import { PlannerCardRow } from "./PlannerCardRow";
import {
  dayLabel,
  isToday,
  isWeekend,
  type PlannerDayBucket,
} from "../../views/plannerHelpers";

export function PlannerColumn({ bucket }: { bucket: PlannerDayBucket }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${bucket.dayIso}`,
  });

  const today = isToday(bucket.dayIso);
  const weekend = isWeekend(bucket.dayIso);

  return (
    <section
      ref={setNodeRef}
      className={
        "planner-day" +
        (today ? " planner-day--today" : "") +
        (weekend ? " planner-day--weekend" : "") +
        (isOver ? " planner-day--over" : "")
      }
      data-testid="planner-day"
      data-day-iso={bucket.dayIso}
      aria-label={`Day ${dayLabel(bucket.dayIso)}, ${bucket.cards.length} cards`}
    >
      <header className="planner-day__header">
        <span className="planner-day__label">
          {dayLabel(bucket.dayIso)}
        </span>
        <span className="planner-day__count">{bucket.cards.length}</span>
      </header>
      {bucket.cards.length === 0 ? (
        <p className="planner-day__empty">Nada planejado</p>
      ) : (
        <ul className="planner-day__list">
          {bucket.cards.map(({ card, board }) => (
            <PlannerCardRow key={card.id} card={card} board={board} />
          ))}
        </ul>
      )}
    </section>
  );
}
