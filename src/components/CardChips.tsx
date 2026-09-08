// Card chips — the row of badges and indicators that appear under a
// card's title (dates, field chips, progress, etc.).
//
// This component exists so that adding a new chip type (checklist
// progress in 3a, assignee avatars in 3b) doesn't require editing
// Card.tsx. New chips are added to the `extraChips` slot via the
// `renderExtra` prop, or to the chip-rendering order below if
// they're so universal that they belong with the rest.
//
// The chip order is intentional:
//   1. Field chips (board-level + per-type) — these are the most
//      semantically dense and the user explicitly configured them.
//   2. Date badge — at-a-glance scheduling info.
//   3. Progress bar — only for cards that have children (epics/stories).
//
// The `extraChips` slot is rendered between the date badge and the
// progress bar, so it visually reads as "metadata → scheduling →
// state".
//
// Visual diff vs. the pre-refactor inline version: zero. The rendered
// DOM is identical; only the location of the JSX changed.

import type { ReactNode } from "react";
import { FieldChip } from "./fields/FieldChip";
import { DateBadge } from "./DateBadge";
import { ProgressBar } from "./ProgressBar";
import type { Board, Card as CardModel, CustomField } from "../models/types";
import type { CardProgress } from "../models/progress";

interface FieldEntry {
  field: CustomField;
  value: string | number | boolean;
}

export function CardChips({
  card,
  board,
  fieldEntries,
  typeFieldEntries,
  showProgress,
  progress,
  /** Slot for chips that don't fit the standard pattern. Renders
   *  between the date badge and the progress bar. */
  renderExtra,
  /** When true the card lives in a done/final column → the date
   *  badge won't show the overdue flag. */
  done = false,
}: {
  card: CardModel;
  board: Board;
  fieldEntries: FieldEntry[];
  typeFieldEntries: FieldEntry[];
  /** Whether the card type supports progress (epics, stories). */
  showProgress: boolean;
  /** Full progress object. The component derives the percent
   *  internally; null percent (no children) renders "—" instead
   *  of "0%". */
  progress: CardProgress;
  /** Optional slot for future chips. Kept as a render prop so the
   *  chip row stays in the order declared here even when the
   *  caller adds new chip types. */
  renderExtra?: () => ReactNode;
  done?: boolean;
}) {
  return (
    <>
      {fieldEntries.length > 0 && (
        <div className="kanban-card__fields">
          {fieldEntries.slice(0, 3).map(({ field, value }) => (
            <FieldChip key={field.id} field={field} value={value} />
          ))}
          {fieldEntries.length > 3 && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
              }}
            >
              +{fieldEntries.length - 3}
            </span>
          )}
        </div>
      )}

      {typeFieldEntries.length > 0 && (
        <div className="kanban-card__fields">
          {typeFieldEntries.slice(0, 2).map(({ field, value }) => (
            <FieldChip key={field.id} field={field} value={value} />
          ))}
          {typeFieldEntries.length > 2 && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
              }}
            >
              +{typeFieldEntries.length - 2}
            </span>
          )}
        </div>
      )}

      {(card.startDate || card.dueDate) && (
        <DateBadge startDate={card.startDate} dueDate={card.dueDate} done={done} />
      )}

      {renderExtra?.()}

      {showProgress && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <ProgressBar progress={progress} size="xs" showLabel />
        </div>
      )}
    </>
  );
}
