import { useState } from "react";
import { Modal } from "../Modal";
import { LabelPill } from "./LabelPill";
import { COLOR_PALETTE } from "../../models/types";
import type { Card, Label } from "../../models/types";

interface Props {
  labels: Label[];
  cards: Record<string, Card>;
  onClose: () => void;
  onAdd: (name: string, color: string) => string | null;
  onUpdate: (labelId: string, patch: Partial<Label>) => void;
  onRemove: (labelId: string) => void;
}

export function LabelManager({ labels, cards, onClose, onAdd, onUpdate, onRemove }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_PALETTE[0].value);

  const usageCount = (labelId: string) =>
    Object.values(cards).reduce((n, c) => n + (c.labelIds.includes(labelId) ? 1 : 0), 0);

  return (
    <Modal title="Labels" onClose={onClose} size="sm">
      <div className="field-row">
        <label className="label" htmlFor="lbl-name">Create label</label>
        <input
          id="lbl-name"
          className="input"
          placeholder="Label name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginTop: "var(--space-2)" }}>
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.value)}
              aria-label={c.id}
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-md)",
                background: c.value,
                border: color === c.value ? "3px solid var(--color-accent)" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          style={{ marginTop: "var(--space-3)", alignSelf: "flex-start" }}
          onClick={() => {
            if (onAdd(name, color)) setName("");
          }}
          disabled={!name.trim()}
        >
          Add label
        </button>
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        <label className="label">Existing labels</label>
        {labels.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
            No labels yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {labels.map((l) => (
              <li
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <input
                  className="input"
                  value={l.name}
                  onChange={(e) => onUpdate(l.id, { name: e.target.value })}
                  style={{ flex: 1 }}
                />
                <input
                  type="color"
                  value={l.color}
                  onChange={(e) => onUpdate(l.id, { color: e.target.value })}
                  aria-label="Color"
                  style={{ width: 32, height: 32, padding: 0, border: "none", background: "transparent" }}
                />
                <LabelPill label={l} />
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  {usageCount(l.id)}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    if (usageCount(l.id) > 0) {
                      if (!confirm(`Delete "${l.name}"? It is on ${usageCount(l.id)} card(s).`)) return;
                    }
                    onRemove(l.id);
                  }}
                  aria-label="Delete label"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
