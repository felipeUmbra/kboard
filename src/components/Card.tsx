import { useMemo } from "react";
import type { Board, Card as CardModel } from "../models/types";
import { LabelPill } from "./fields/LabelPill";
import { FieldChip } from "./fields/FieldChip";
import { sanitizeRichHtml } from "./fields/sanitize";
import { CARD_TYPE_META, getMeta } from "../models/cardTypeMeta";
import { useProgress } from "../models/progress";
import { TypeChip } from "./TypeChip";
import { ProgressBar } from "./ProgressBar";

/** Strip HTML to plain text for the card-front preview, with a max length. */
function descriptionPreview(html: string, maxLen = 180): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

export function Card({
  card,
  board,
  onOpen,
}: {
  card: CardModel;
  board: Board;
  onOpen: (c: CardModel) => void;
}) {
  const meta = getMeta(card.type);
  const typeConfig = board.cardTypes.find((c) => c.type === card.type);

  const labels = card.labelIds
    .map((id) => board.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l);

  const fieldEntries = board.customFields
    .map((f) => {
      const v = card.boardFieldValues[f.id];
      if (v === undefined || v === "" || v === false) return null;
      return { field: f, value: v };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Per-type field entries
  const typeFieldEntries = typeConfig
    ? typeConfig.customFields
        .map((f) => {
          const v = card.typeFieldValues[f.id];
          if (v === undefined || v === "" || v === false) return null;
          return { field: f, value: v };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  // Parent summary (only for cards that can have parents)
  const parentNames = card.parentIds
    .map((id) => board.cards[id]?.title)
    .filter((t): t is string => !!t);

  // Progress (only for epics & stories)
  const progress = useProgress(card, board);

  const safeHtml = useMemo(() => sanitizeRichHtml(card.descriptionHtml), [card.descriptionHtml]);
  const preview = useMemo(() => descriptionPreview(safeHtml), [safeHtml]);

  // Use a <div role="button"> with tabIndex so the card is keyboard-focusable
  // and announces as a button to screen readers. A native <button> would
  // swallow pointer events that dnd-kit needs.
  return (
    <div
      role="button"
      tabIndex={0}
      className="kanban-card"
      data-card-type={card.type}
      onClick={(e) => {
        // dnd-kit's PointerSensor sets defaultPrevented on the originating
        // event when a drag has started. If we just finished a drag, skip
        // the click-to-open to avoid the card opening after a successful drop.
        if ((e as unknown as { defaultPrevented: boolean }).defaultPrevented) return;
        onOpen(card);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card);
        }
      }}
      style={{
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <div className="kanban-card__top">
        <TypeChip
          type={card.type}
          customLabel={typeConfig?.label}
          showLabel
          size="xs"
        />
      </div>

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

      {parentNames.length > 0 && (
        <div
          className="kanban-card__parents"
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
            marginTop: 2,
            marginBottom: 2,
            lineHeight: 1.3,
          }}
        >
          in: {parentNames.slice(0, 2).join(" • ")}
          {parentNames.length > 2 && ` +${parentNames.length - 2} more`}
        </div>
      )}

      {preview && (
        <div className="kanban-card__description" title={preview}>
          {preview}
        </div>
      )}

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

      {typeFieldEntries.length > 0 && (
        <div className="kanban-card__fields">
          {typeFieldEntries.slice(0, 2).map(({ field, value }) => (
            <FieldChip key={field.id} field={field} value={value} />
          ))}
          {typeFieldEntries.length > 2 && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              +{typeFieldEntries.length - 2}
            </span>
          )}
        </div>
      )}

      {meta.showProgress && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <ProgressBar progress={progress} size="xs" showLabel />
        </div>
      )}
    </div>
  );
}

export { CARD_TYPE_META };
