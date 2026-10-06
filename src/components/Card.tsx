import { useMemo, type KeyboardEventHandler } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Board, Card as CardModel, CardType } from "../models/types";
import { LabelPill } from "./fields/LabelPill";
import { sanitizeRichHtml } from "./fields/sanitize";
import { CARD_TYPE_META, getMeta, displayLabel } from "../models/cardTypeMeta";
import { useProgress, isCardInDoneColumn } from "../models/progress";
import { TypeChip } from "./TypeChip";
import { CardChips } from "./CardChips";

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

  // Children summary (only for epics & stories).
  // Counts by type so we can show "3 stories, 12 tasks" in one line.
  const childCounts = useMemo(() => {
    if (!meta.canHaveChildren) return null;
    let stories = 0;
    let tasks = 0;
    for (const c of Object.values(board.cards)) {
      if (!c.parentIds.includes(card.id)) continue;
      if (c.type === "story") stories++;
      else if (c.type === "task") tasks++;
    }
    return { stories, tasks };
  }, [board, card.id, meta.canHaveChildren]);

  // Progress (only for epics & stories)
  const progress = useProgress(card, board);
  // True when the card lives in a done/final column → hide overdue flag.
  const done = useMemo(() => isCardInDoneColumn(board, card.id), [board, card.id]);

  const safeHtml = useMemo(() => sanitizeRichHtml(card.descriptionHtml), [card.descriptionHtml]);
  const preview = useMemo(() => descriptionPreview(safeHtml), [safeHtml]);

  // Use a <div role="button"> with tabIndex so the card is keyboard-focusable
  // and announces as a button to screen readers. A native <button> would
  // swallow pointer events that dnd-kit needs.
  //
  // dnd-kit's attributes and listeners are spread onto THIS element rather
  // than a wrapper div. They were previously on a wrapper, which dnd-kit
  // renders with its own `role="button"` — producing a button inside a
  // button. axe-core's `nested-interactive` rule caught it (Sprint 4.1), and
  // it was not merely theoretical: a screen reader announcing two nested
  // buttons, and Tab reaching an extra stop per card.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // Our own key handling must COMPOSE with dnd-kit's activator, not replace
  // it. `listeners.onKeyDown` is the KeyboardSensor activator: on Space it
  // calls preventDefault() and lifts the card into a keyboard drag.
  //
  // Bug #18: this handler used to be declared inline AFTER `{...listeners}`,
  // so React received a single `onKeyDown` prop that belonged to us, and
  // dnd-kit's activator was silently overwritten. Space therefore opened the
  // card editor instead of picking the card up, the sensor never started, and
  // a keyboard-only user had no way to reorder a card at all — the editor's
  // Column selector changes columns but never reorders within one.
  //
  // The fix is to call both, dnd-kit's first, and only fall through to
  // "open the editor" when the sensor did not claim the key. We rely on the
  // sensor calling `preventDefault()` when it activates; checking that is
  // more robust than key-sniffing, because KanbanDndContext configures the
  // KeyboardSensor to start on Space only (see `keyboardCodes` there), so the
  // set of "drag keys" is not hard-coded here. Enter deliberately stays an
  // open-the-editor key: dnd-kit's default also binds Enter to start a drag,
  // which would make one press do both things.
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    listeners?.onKeyDown?.(e);
    // A drag is already in flight: dnd-kit owns every key from here on
    // (arrows move, Space drops, Escape cancels). Opening the editor
    // mid-drag would both break the drag and hide the card.
    if (isDragging) return;
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpen(card);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className="kanban-card"
      data-card-id={card.id}
      data-card-type={card.type}
      {...attributes}
      {...listeners}
      // After the dnd spread on purpose: `attributes` also supplies
      // role="button" and tabIndex={0}, and we want OUR explicit values to
      // win (TS would otherwise reject the duplicate props outright).
      role="button"
      tabIndex={0}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderLeft: `3px solid ${meta.color}`,
      }}
      onClick={(e) => {
        // dnd-kit's PointerSensor sets defaultPrevented on the originating
        // event when a drag has started. If we just finished a drag, skip
        // the click-to-open to avoid the card opening after a successful drop.
        if ((e as unknown as { defaultPrevented: boolean }).defaultPrevented) return;
        onOpen(card);
      }}
      onKeyDown={handleKeyDown}
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

      {childCounts &&
        (childCounts.stories > 0 || childCounts.tasks > 0) && (
          <div
            className="kanban-card__children"
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
              marginTop: 2,
              marginBottom: 2,
              lineHeight: 1.3,
            }}
          >
            contains:{" "}
            {childCounts.stories > 0 && (
              <span>
                {childCounts.stories} {childCounts.stories === 1 ? "story" : "stories"}
              </span>
            )}
            {childCounts.stories > 0 && childCounts.tasks > 0 && " • "}
            {childCounts.tasks > 0 && (
              <span>
                {childCounts.tasks} {childCounts.tasks === 1 ? "task" : "tasks"}
              </span>
            )}
          </div>
        )}

      {preview && (
        <div className="kanban-card__description" title={preview}>
          {preview}
        </div>
      )}

      <CardChips
        card={card}
        board={board}
        fieldEntries={fieldEntries}
        typeFieldEntries={typeFieldEntries}
        showProgress={meta.showProgress}
        progress={progress}
        done={done}
        renderExtra={() => <ChecklistChip card={card} />}
      />
    </div>
  );
}

/**
 * Card-face chip showing checklist progress, e.g. "1/4 ✓".
 * Only renders when the card has at least one checklist with at
 * least one item. Multiple checklists: we surface the first one
 * (Trello has a similar affordance).
 */
function ChecklistChip({ card }: { card: CardModel }) {
  const first = card.checklists?.find(
    (cl) => cl?.items && cl.items.length > 0,
  );
  if (!first || !first.items) return null;
  const done = first.items.filter((i) => i.done).length;
  const total = first.items.length;
  return (
    <span
      className="kanban-card__checklist"
      data-testid="checklist-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        color: "var(--color-text-muted)",
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        alignSelf: "flex-start",
      }}
    >
      <span aria-hidden="true">☑</span>
      <span>
        {done}/{total}
      </span>
    </span>
  );
}

export { CARD_TYPE_META };
