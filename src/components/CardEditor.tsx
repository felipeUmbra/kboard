import { useState } from "react";
import type { Board, Card as CardModel } from "../models/types";
import { Modal } from "./Modal";
import { RichTextEditor } from "./fields/RichTextEditor";
import { LabelPill } from "./fields/LabelPill";
import { sanitizeRichHtml } from "./fields/sanitize";
import { useBoard } from "../state/BoardContext";
import { FieldValueInput } from "./fields/FieldValueInput";

export function CardEditor({
  card,
  board,
  onClose,
}: {
  card: CardModel;
  board: Board;
  onClose: () => void;
}) {
  const ctx = useBoard();
  const [title, setTitle] = useState(card.title);
  const [descriptionHtml, setDescriptionHtml] = useState(card.descriptionHtml);

  const saveAndClose = () => {
    const t = title.trim() || "Untitled";
    ctx.updateCard(card.id, {
      title: t,
      descriptionHtml: sanitizeRichHtml(descriptionHtml),
    });
    onClose();
  };

  const remove = () => {
    if (!confirm(`Delete card "${card.title}"?`)) return;
    ctx.deleteCard(card.id);
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
              const active = card.labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => ctx.toggleCardLabel(card.id, l.id)}
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
          {card.labelIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
              {card.labelIds
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
          <label className="label">Custom fields</label>
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
                value={card.customFieldValues[f.id]}
                onChange={(v) => ctx.setCardFieldValue(card.id, f.id, v)}
              />
            ))}
          </div>
        </div>
      )}
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
