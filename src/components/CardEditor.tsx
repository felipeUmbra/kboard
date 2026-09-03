import { useEffect, useState } from "react";
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

export function CardEditor({
  cardId,
  board,
  onClose,
  onOpenCard,
}: {
  cardId: string;
  board: Board;
  onClose: () => void;
  onOpenCard: (childId: string) => void;
}) {
  const ctx = useBoard();
  const auth = useAuth();

  // Resolve the card from the active board. If it was deleted while
  // the editor was open, show a graceful empty state.
  const card = board.cards[cardId];

  const [title, setTitle] = useState(card?.title ?? "");
  const [descriptionHtml, setDescriptionHtml] = useState(card?.descriptionHtml ?? "");
  const [activityOpen, setActivityOpen] = useState(true);

  // Reset local state when the user navigates to a different card. Board
  // syncs can replace the board object while this editor has unsaved input.
  useEffect(() => {
    const c = board.cards[cardId];
    if (!c) return;
    setTitle(c.title);
    setDescriptionHtml(c.descriptionHtml);
    setActivityOpen(true);
  }, [cardId]);

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

  const saveAndClose = () => {
    const t = title.trim() || "Untitled";
    ctx.updateCard(safeCard.id, {
      title: t,
      descriptionHtml: sanitizeRichHtml(descriptionHtml),
    });
    onClose();
  };

  const remove = () => {
    if (!confirm(`Delete card "${safeCard.title}"?`)) return;
    ctx.deleteCard(safeCard.id);
    onClose();
  };

  return (
    <Modal
      title="Card"
      onClose={saveAndClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--danger" onClick={remove}>
            Delete
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn--primary" onClick={saveAndClose}>
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
          placeholder="Card title"
          aria-label="Card title"
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
      />

      {getMeta(safeCard.type).canHaveChildren && (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label className="label">Children</label>
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
