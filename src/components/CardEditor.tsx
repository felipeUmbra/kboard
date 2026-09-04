import { useEffect, useRef, useState } from "react";
import type { Board, Card as CardModel, CardType } from "../models/types";
import { Modal } from "./Modal";
import { RichTextEditor } from "./fields/RichTextEditor";
import { LabelPill } from "./fields/LabelPill";
import { sanitizeRichHtml } from "./fields/sanitize";
import { useBoard } from "../state/BoardContext";
import { useAuth } from "../auth/useAuth";
import { FieldValueInput } from "./fields/FieldValueInput";
import { ParentPicker } from "./ParentPicker";
import { ChildrenList } from "./ChildrenList";
import { CARD_TYPE_META, getMeta } from "../models/cardTypeMeta";
import { TypeChip } from "./TypeChip";
import { DateField } from "./DateField";
import { ActivityLog } from "./ActivityLog";
import { CommentThread } from "./CommentThread";
import { cardDrafts, draftDiffersFromCard } from "../state/cardDrafts";

/** How often (ms) we mirror the local title/description drafts into
 *  localStorage. Short enough to survive an accidental reload; long
 *  enough to avoid hammering storage on every keystroke. */
const DRAFT_PERSIST_DEBOUNCE_MS = 500;

export function CardEditor({
  cardId,
  board,
  onClose,
  onOpenCard,
  isNewCard = false,
  newCardOrigin,
  onSaved,
  onAddChild,
  onAddParent,
}: {
  cardId: string;
  board: Board;
  onClose: () => void;
  onOpenCard: (childId: string) => void;
  /** True when this card was just created by "+ Add child/parent" and the
   *  user hasn't yet named it. Gates Save and forces a confirm-on-discard. */
  isNewCard?: boolean;
  /** Required when isNewCard, so the rollback on cancel can undo the
   *  parent-side link created by addParentCard. */
  newCardOrigin?: { originCardId: string; direction: "as_parent" | "as_child" };
  /** Called after a successful Save so the host can clear its
   *  newlyCreatedCardId flag. */
  onSaved?: () => void;
  /** Host provides the create+link actions so the editor doesn't reach
   *  back into the board context for navigation. */
  onAddChild?: (originCardId: string) => void;
  onAddParent?: (originCardId: string) => void;
}) {
  const ctx = useBoard();
  const auth = useAuth();

  // Resolve the card from the active board. If it was deleted while
  // the editor was open, show a graceful empty state.
  const card = board.cards[cardId];

  // Initial state pulls from the persisted draft if any, falling back to
  // the board's current value. Restoring the draft means reloading the
  // page (or coming back via the back-to-boards → re-open flow) keeps
  // the user's in-progress edits.
  const [title, setTitle] = useState(() => {
    const draft = card ? cardDrafts.get(card.id) : null;
    if (draft) return draft.title;
    return card?.title ?? "";
  });
  const [descriptionHtml, setDescriptionHtml] = useState(() => {
    const draft = card ? cardDrafts.get(card.id) : null;
    if (draft) return draft.descriptionHtml;
    return card?.descriptionHtml ?? "";
  });
  const [activityOpen, setActivityOpen] = useState(true);

  // Refs that mirror the latest local edits so the cardId-change effect
  // can read the most recent values without re-firing on every keystroke.
  const titleRef = useRef(title);
  titleRef.current = title;
  const descriptionHtmlRef = useRef(descriptionHtml);
  descriptionHtmlRef.current = descriptionHtml;
  const lastPersistedRef = useRef<{ title: string; descriptionHtml: string } | null>(null);

  // Persist drafts to localStorage on a debounce. We do this on every
  // edit (not just navigation) so a reload restores the latest text.
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(() => {
      const t = titleRef.current;
      const d = descriptionHtmlRef.current;
      const last = lastPersistedRef.current;
      if (last && last.title === t && last.descriptionHtml === d) return;
      cardDrafts.set(card.id, { title: t, descriptionHtml: d, updatedAt: Date.now() });
      lastPersistedRef.current = { title: t, descriptionHtml: d };
    }, DRAFT_PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [title, descriptionHtml, card]);

  // Track the previous cardId so the navigation effect can flush the
  // outgoing card's drafts before swapping state.
  const previousCardIdRef = useRef(cardId);

  // Reset local state when the user navigates to a different card. Also
  // auto-saves the outgoing card's local drafts (the navigation is the
  // implicit "done for now" signal). patchCard's diffing ensures no
  // spurious activity entries when the title/description are unchanged.
  useEffect(() => {
    if (previousCardIdRef.current === cardId) return;
    const prevId = previousCardIdRef.current;
    if (prevId && board.cards[prevId]) {
      const t = titleRef.current.trim();
      const d = descriptionHtmlRef.current;
      if (t || d) {
        ctx.updateCard(prevId, {
          title: t || "Untitled",
          descriptionHtml: sanitizeRichHtml(d),
        });
      }
      // The board now holds the latest text, so the persisted draft
      // (which mirrors the same text) is no longer needed.
      cardDrafts.delete(prevId);
    }
    const c = board.cards[cardId];
    if (c) {
      const draft = cardDrafts.get(cardId);
      setTitle(draft?.title ?? c.title);
      setDescriptionHtml(draft?.descriptionHtml ?? c.descriptionHtml);
    }
    setActivityOpen(true);
    previousCardIdRef.current = cardId;
    lastPersistedRef.current = null; // allow re-persist on the new card
  }, [cardId, board, ctx]);

  // Graceful empty state if the card no longer exists.
  if (!card) {
    return (
      <Modal title="Card" onClose={onClose} size="md">
        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "var(--text-sm)",
          }}
        >
          This card no longer exists.
        </p>
      </Modal>
    );
  }

  // Keep the original variable name `card` available to the rest of the
  // body (we just narrowed above). For type safety, re-bind to a
  // non-nullable local.
  const safeCard: CardModel = card;
  const trimmedTitle = title.trim();
  // A new card is considered "untitled" if the user hasn't replaced the
  // seeded "Untitled" placeholder. This catches both the truly empty
  // input and the case where the user opens the editor and walks away
  // without ever touching the title field.
  const isTitleEmpty =
    trimmedTitle.length === 0 ||
    (isNewCard && trimmedTitle === "Untitled" && safeCard.title === "Untitled");
  // "Save" is only gated for new cards: an existing card can fall back
  // to "Untitled" so a clear-back edit still saves. A new card with an
  // empty title would otherwise leak as an orphan.
  const saveDisabled = isNewCard && isTitleEmpty;

  const commitEdits = (): boolean => {
    if (isNewCard && isTitleEmpty) return false;
    const t = trimmedTitle || "Untitled";
    ctx.updateCard(safeCard.id, {
      title: t,
      descriptionHtml: sanitizeRichHtml(descriptionHtml),
    });
    cardDrafts.delete(safeCard.id);
    return true;
  };

  const saveAndClose = () => {
    if (!commitEdits()) return;
    onSaved?.();
    onClose();
  };

  const remove = () => {
    if (!confirm(`Delete card "${safeCard.title}"?`)) return;
    cardDrafts.delete(safeCard.id);
    ctx.deleteCard(safeCard.id);
    onClose();
  };

  // Centralised close path used by the modal's X / ESC / backdrop and by
  // the explicit "Close" button. For new cards we always confirm because
  // the card exists only in the user's local board and would otherwise
  // leak as an "Untitled" orphan. For existing cards we only confirm
  // when there's a real draft (otherwise the user did nothing and we'd
  // be nagging).
  //
  // Note: we intentionally do NOT delete the draft on cancel — the draft
  // is the user's last-resort copy. If they reload the page or come
  // back to the editor later, the draft is still there. Drafts are
  // only deleted on successful commit, card deletion, or board
  // deletion (see commitEdits, remove, and BoardContext.handleBoardDeleted).
  const handleCancel = () => {
    if (isNewCard) {
      const ok = confirm("Descartar este card sem nome?");
      if (!ok) return;
      // If this was a "+ Add parent" creation, we linked the origin to
      // this card via addParent. Undo that so the activity log on the
      // origin doesn't carry a stale parents_changed entry.
      if (
        newCardOrigin?.direction === "as_parent" &&
        board.cards[newCardOrigin.originCardId]
      ) {
        ctx.removeParent(newCardOrigin.originCardId, safeCard.id);
      }
      cardDrafts.delete(safeCard.id);
      ctx.deleteCard(safeCard.id);
      onSaved?.();
      onClose();
      return;
    }
    const draft = cardDrafts.get(safeCard.id);
    if (draftDiffersFromCard(draft, safeCard)) {
      if (!confirm("Descartar edições não salvas?")) return;
      // User explicitly chose to discard. Mark the draft as discarded
      // so it stops being offered, but keep the tombstone in localStorage
      // so a fresh session can rehydrate "intentionally empty" state
      // without resurrecting an old draft.
      cardDrafts.discard(safeCard.id);
    }
    onClose();
  };

  return (
    <Modal
      title="Card"
      onClose={handleCancel}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--danger" onClick={remove}>
            Delete
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={handleCancel}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={saveAndClose}
            disabled={saveDisabled}
          >
            Save
          </button>
        </>
      }
    >
      <div className="field-row">
        <input
          className="input card-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isNewCard ? "Card title (required)" : "Card title"}
          aria-label="Card title"
          autoFocus={isNewCard}
        />
      </div>

      <div style={{ marginBottom: "var(--space-5)" }}>
        <label className="label">Type</label>
        <div
          style={{ display: "flex", gap: "var(--space-1)" }}
          role="radiogroup"
          aria-label="Card type"
        >
          {board.cardTypes
            .filter((c) => c.enabled)
            .map((cfg) => {
              const meta = CARD_TYPE_META[cfg.type];
              const active = safeCard.type === cfg.type;
              return (
                <button
                  key={cfg.type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => ctx.updateCard(safeCard.id, { type: cfg.type })}
                  className="btn"
                  style={{
                    flex: 1,
                    background: active ? meta.softColor : "transparent",
                    color: active ? meta.color : "var(--color-text-muted)",
                    borderColor: active ? meta.color : "var(--color-border)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <span aria-hidden="true">{meta.icon}</span> {cfg.label}
                </button>
              );
            })}
        </div>
      </div>

      <ParentPicker
        board={board}
        card={safeCard}
        onAdd={(parentId) => ctx.addParent(safeCard.id, parentId)}
        onRemove={(parentId) => ctx.removeParent(safeCard.id, parentId)}
        onOpenCard={onOpenCard}
        onCreateParent={onAddParent}
        isNewCard={isNewCard}
      />

      {getMeta(safeCard.type).canHaveChildren && (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-2)",
              marginBottom: "var(--space-2)",
            }}
          >
            <label className="label" style={{ margin: 0 }}>Children</label>
            {onAddChild && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onAddChild(safeCard.id)}
                disabled={isNewCard}
                title={
                  isNewCard
                    ? "Name this card first"
                    : "Add a child card pre-linked to this one"
                }
              >
                + Add child
              </button>
            )}
          </div>
          <ChildrenList
            board={board}
            parentId={safeCard.id}
            onOpenCard={onOpenCard}
          />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--space-3)",
          marginBottom: "var(--space-5)",
        }}
      >
        <DateField
          label="Start date"
          value={safeCard.startDate}
          onChange={(iso) => ctx.setCardStartDate(safeCard.id, iso)}
          partnerValue={safeCard.dueDate}
        />
        <DateField
          label="Due date"
          value={safeCard.dueDate}
          onChange={(iso) => ctx.setCardDueDate(safeCard.id, iso)}
          partnerValue={safeCard.startDate}
        />
      </div>

      <div style={{ marginBottom: "var(--space-5)" }}>
        <label className="label">Description</label>
        <RichTextEditor
          value={descriptionHtml}
          onChange={setDescriptionHtml}
          placeholder="Add a more detailed description…"
        />
      </div>

      {board.labels.length > 0 && (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label className="label">Labels</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {board.labels.map((l) => {
              const active = safeCard.labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => ctx.toggleCardLabel(safeCard.id, l.id)}
                  aria-pressed={active}
                  className="label-toggle"
                  data-active={active ? "true" : "false"}
                  style={{
                    background: active ? l.color : "transparent",
                    color: active ? pickForeground(l.color) : "var(--color-text)",
                    borderColor: l.color,
                  }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
          {safeCard.labelIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
              {safeCard.labelIds
                .map((id) => board.labels.find((l) => l.id === id))
                .filter((l): l is NonNullable<typeof l> => !!l)
                .map((l) => (
                  <LabelPill key={l.id} label={l} />
                ))}
            </div>
          )}
        </div>
      )}

      {board.customFields.length > 0 && (
        <div>
          <label className="label">Board fields</label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {board.customFields.map((f) => (
              <FieldValueInput
                key={f.id}
                field={f}
                value={safeCard.boardFieldValues[f.id]}
                onChange={(v) => ctx.setCardFieldValue(safeCard.id, f.id, v)}
              />
            ))}
          </div>
        </div>
      )}

      {(() => {
        const typeConfig = board.cardTypes.find((c) => c.type === safeCard.type);
        if (!typeConfig || typeConfig.customFields.length === 0) return null;
        const meta = getMeta(safeCard.type);
        return (
          <div style={{ marginTop: "var(--space-5)" }}>
            <label className="label">
              <TypeChip type={safeCard.type} customLabel={typeConfig.label} size="xs" />{" "}
              fields
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {typeConfig.customFields.map((f) => (
                <FieldValueInput
                  key={f.id}
                  field={f}
                  value={safeCard.typeFieldValues[f.id]}
                  onChange={(v) =>
                    ctx.setCardTypeFieldValue(safeCard.id, safeCard.type, f.id, v)
                  }
                />
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: "var(--space-6)" }}>
        <button
          type="button"
          onClick={() => setActivityOpen((o) => !o)}
          className="btn btn--ghost"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
            color: "var(--color-text)",
            padding: 0,
          }}
          aria-expanded={activityOpen}
        >
          <span>{activityOpen ? "▾" : "▸"}</span>
          <span>Activity</span>
          <span
            style={{
              color: "var(--color-text-muted)",
              fontWeight: 400,
              fontSize: "var(--text-xs)",
            }}
          >
            ({safeCard.activity.length})
          </span>
        </button>
        {activityOpen && (
          <div style={{ marginTop: 8 }}>
            <ActivityLog activity={safeCard.activity} />
          </div>
        )}
      </div>

      <div style={{ marginTop: "var(--space-6)" }}>
        <label className="label">
          Comments
          <span
            style={{
              marginLeft: 8,
              color: "var(--color-text-muted)",
              fontWeight: 400,
              fontSize: "var(--text-xs)",
            }}
          >
            ({safeCard.comments.length})
          </span>
        </label>
        {auth.profile ? (
          <CommentThread
            comments={safeCard.comments}
            currentUser={auth.profile}
            onAdd={(c) => ctx.addComment(safeCard.id, c)}
            onDelete={(commentId) => ctx.removeComment(safeCard.id, commentId)}
          />
        ) : null}
      </div>
    </Modal>
  );
}

function pickForeground(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#172b4d";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#172b4d" : "#ffffff";
}
