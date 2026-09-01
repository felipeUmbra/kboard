// Multi-select parent picker with type constraints.

import { useMemo, useState } from "react";
import type { Board, Card, CardType } from "../models/types";
import { CARD_TYPE_META, getMeta } from "../models/cardTypeMeta";
import { validateAddParent } from "../state/cardActions";
import { TypeChip } from "./TypeChip";

export function ParentPicker({
  board,
  card,
  onAdd,
  onRemove,
}: {
  board: Board;
  card: Card;
  onAdd: (parentId: string) => void;
  onRemove: (parentId: string) => void;
}) {
  const meta = getMeta(card.type);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (!meta.canHaveParent || !meta.parentType) {
    return null;
  }

  const parentType = meta.parentType as CardType;

  const candidates = useMemo(() => {
    return Object.values(board.cards)
      .filter((c) => c.type === parentType && c.id !== card.id)
      .filter((c) => !card.parentIds.includes(c.id))
      .filter((c) =>
        search.trim() ? c.title.toLowerCase().includes(search.toLowerCase()) : true,
      );
  }, [board.cards, parentType, card.id, card.parentIds, search]);

  const currentParents = card.parentIds
    .map((id) => board.cards[id])
    .filter((c): c is Card => !!c);

  return (
    <div style={{ marginBottom: "var(--space-5)" }}>
      <label className="label">Parents ({currentParents.length})</label>

      {currentParents.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-1)",
            marginBottom: "var(--space-2)",
          }}
        >
          {currentParents.map((p) => (
            <span
              key={p.id}
              className="parent-chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text)",
              }}
            >
              <TypeChip type={p.type} size="xs" />
              <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.title}
              </span>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove parent ${p.title}`}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn btn--ghost"
          style={{ width: "100%", justifyContent: "flex-start" }}
          aria-expanded={open}
        >
          + Add {CARD_TYPE_META[parentType].defaultLabel.toLowerCase()} parent
        </button>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              zIndex: 10,
              maxHeight: 280,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <input
              type="text"
              className="input"
              placeholder={`Search ${CARD_TYPE_META[parentType].defaultLabel.toLowerCase()}s…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{ margin: 6, width: "auto" }}
            />
            <div style={{ overflowY: "auto", flex: 1 }}>
              {candidates.length === 0 ? (
                <p
                  style={{
                    padding: "var(--space-3)",
                    color: "var(--color-text-muted)",
                    fontSize: "var(--text-sm)",
                    margin: 0,
                  }}
                >
                  {search.trim()
                    ? "No matches"
                    : `No ${CARD_TYPE_META[parentType].defaultLabel.toLowerCase()}s yet`}
                </p>
              ) : (
                candidates.map((c) => {
                  const err = validateAddParent(board, card.id, c.id);
                  const disabled = err === "cycle" || err === "self_parent";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onAdd(c.id);
                        setSearch("");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        textAlign: "left",
                        padding: "var(--space-2) var(--space-3)",
                        background: "transparent",
                        border: "none",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.4 : 1,
                        borderTop: "1px solid var(--color-border)",
                        color: "var(--color-text)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <TypeChip type={c.type} size="xs" />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title}
                      </span>
                      {disabled && (
                        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                          cycle
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSearch("");
              }}
              className="btn btn--ghost"
              style={{ borderTop: "1px solid var(--color-border)", borderRadius: 0 }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}