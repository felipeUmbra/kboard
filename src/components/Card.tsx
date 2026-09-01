import type { Board, Card as CardModel } from "../models/types";
import { LabelPill } from "./fields/LabelPill";
import { FieldChip } from "./fields/FieldChip";

export function Card({
  card,
  board,
  onOpen,
}: {
  card: CardModel;
  board: Board;
  onOpen: (c: CardModel) => void;
}) {
  const labels = card.labelIds
    .map((id) => board.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l);

  const fieldEntries = board.customFields
    .map((f) => {
      const v = card.customFieldValues[f.id];
      if (v === undefined || v === "" || v === false) return null;
      return { field: f, value: v };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <button
      type="button"
      className="kanban-card"
      onClick={(e) => {
        // Avoid opening when user just finished a drag
        if ((e as React.MouseEvent).defaultPrevented) return;
        onOpen(card);
      }}
    >
      {labels.length > 0 && (
        <div className="kanban-card__labels">
          {labels.slice(0, 3).map((l) => (
            <LabelPill key={l.id} label={l} />
          ))}
          {labels.length > 3 && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              +{labels.length - 3}
            </span>
          )}
        </div>
      )}
      <div className="kanban-card__title">{card.title}</div>
      {fieldEntries.length > 0 && (
        <div className="kanban-card__fields">
          {fieldEntries.slice(0, 3).map(({ field, value }) => (
            <FieldChip key={field.id} field={field} value={value} />
          ))}
          {fieldEntries.length > 3 && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              +{fieldEntries.length - 3}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
