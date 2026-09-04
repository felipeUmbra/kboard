// Planner view — a 7-day week view of every card with a date,
// across all boards. Drag a card between days to reschedule.
//
// The view is wrapped in PlannerDndProvider so any nested component
// (PlannerCardRow, PlannerColumn) can call useDraggable / useDroppable
// without re-creating the context per column.

import { useMemo, useState } from "react";
import { useBoard } from "../state/BoardContext";
import { PlannerDndProvider } from "../components/planner/PlannerDndContext";
import { PlannerColumn } from "../components/planner/PlannerColumn";
import {
  buildPlannerBuckets,
  datelessCards,
  shiftWeek,
  weekDays,
} from "./plannerHelpers";
import { todayIso, formatIso, parseIso } from "../models/dateValidation";
import { format, isSameMonth } from "date-fns";

export function PlannerView() {
  const ctx = useBoard();
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const buckets = useMemo(
    () => buildPlannerBuckets(days, ctx.boards),
    [days, ctx.boards],
  );
  const dateless = useMemo(() => datelessCards(ctx.boards), [ctx.boards]);

  const weekLabel = (() => {
    const first = days[0];
    const last = days[6];
    if (!first || !last) return "";
    if (isSameMonth(first, last)) {
      // "set." (Portuguese for "September"), matching the screenshot.
      return format(first, "MMM").replace(".", "") + ".";
    }
    return `${format(first, "MMM")} – ${format(last, "MMM")}`.replace(/\./g, "");
  })();

  const isCurrentWeek = (() => {
    const today = todayIso();
    return days.some((d) => formatIso(d) === today);
  })();

  return (
    <PlannerDndProvider>
      <div className="planner">
        <header className="planner__header">
          <div className="planner__nav">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setAnchor((a) => shiftWeek(a, -1))}
              aria-label="Previous week"
              data-testid="planner-prev"
            >
              ‹
            </button>
            <span className="planner__month" data-testid="planner-month">
              {weekLabel}
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setAnchor((a) => shiftWeek(a, 1))}
              aria-label="Next week"
              data-testid="planner-next"
            >
              ›
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setAnchor(new Date())}
              disabled={isCurrentWeek}
              data-testid="planner-today"
            >
              Hoje
            </button>
          </div>
        </header>
        <div className="planner__week" data-testid="planner-week">
          {buckets.map((b) => (
            <PlannerColumn key={b.dayIso} bucket={b} />
          ))}
        </div>
        {dateless.length > 0 && (
          <details className="planner__dateless" data-testid="planner-dateless">
            <summary>
              Sem data <span>({dateless.length})</span>
            </summary>
            <ul className="planner-day__list">
              {dateless.map(({ card, board }) => (
                <li
                  key={card.id}
                  className="planner-card"
                  data-testid="planner-dateless-row"
                  data-card-id={card.id}
                >
                  <div className="planner-card__title">{card.title}</div>
                  <div className="planner-card__meta">
                    <span className="planner-card__board" title={board.name}>
                      {board.name}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </PlannerDndProvider>
  );
}

// Re-export the helper so callers (tests) can import day math
// alongside the view itself.
export { parseIso };
