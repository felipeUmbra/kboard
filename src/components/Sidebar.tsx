import { useState } from "react";
import { useBoard } from "../state/BoardContext";
import { LabelPill } from "./fields/LabelPill";
import { FieldChip } from "./fields/FieldChip";
import { LabelManager } from "./fields/LabelManager";
import { FieldManager } from "./fields/FieldManager";
import { useViewport } from "../hooks/useViewport";
import { CARD_TYPE_META } from "../models/cardTypeMeta";
import type { CardType } from "../models/types";

export function Sidebar({
  open,
  collapsed,
  onClose,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
}) {
  const board = useBoard();
  const [showLabels, setShowLabels] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [typeManagerFor, setTypeManagerFor] = useState<CardType | null>(null);
  const viewport = useViewport();

  if (collapsed && !viewport.isMobile) {
    return (
      <aside className="sidebar" data-open="true" data-collapsed="true">
        <div className="sidebar__header">
          <span className="sidebar__title" style={{ display: "none" }}>Menu</span>
        </div>
        <div className="sidebar__body" style={{ display: "none" }} />
      </aside>
    );
  }

  return (
    <aside className="sidebar" data-open={open ? "true" : "false"} data-collapsed="false">
      <div className="sidebar__header">
        <span className="sidebar__title">Menu</span>
        {viewport.isMobile && (
          <button
            type="button"
            className="sidebar__close btn btn--ghost"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      <div className="sidebar__body">
        <div className="sidebar__section">
          <h3 className="sidebar__section-title">
            Boards
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              {board.boards.length}
            </span>
          </h3>
          {board.boards.length === 0 ? (
            <p style={{ padding: "0 var(--space-3)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              No boards yet. Create one to get started.
            </p>
          ) : (
            <ul style={{ listStyle: "none" }}>
              {board.boards.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void board.openBoard(b.id);
                      if (viewport.isMobile) onClose();
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      background:
                        board.activeBoard?.id === b.id ? "var(--color-accent-soft)" : "transparent",
                      color: "var(--color-text)",
                      fontSize: "var(--text-sm)",
                      fontWeight: board.activeBoard?.id === b.id ? 600 : 500,
                    }}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {board.activeBoard && (
          <>
            <div className="sidebar__section">
              <h3 className="sidebar__section-title">
                Labels
                <button
                  type="button"
                  onClick={() => setShowLabels(true)}
                  aria-label="Manage labels"
                  title="Manage labels"
                >
                  +
                </button>
              </h3>
              {board.activeBoard.labels.length === 0 ? (
                <p style={{ padding: "0 var(--space-3)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                  No labels yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", padding: "0 var(--space-2)" }}>
                  {board.activeBoard.labels.map((l) => (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <LabelPill label={l} />
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                        {Object.values(board.activeBoard!.cards).reduce(
                          (n, c) => n + (c.labelIds.includes(l.id) ? 1 : 0),
                          0,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sidebar__section">
              <h3 className="sidebar__section-title">Card types</h3>
              {board.activeBoard.cardTypes.map((cfg) => {
                const meta = CARD_TYPE_META[cfg.type];
                const count = Object.values(board.activeBoard!.cards).filter(
                  (c) => c.type === cfg.type,
                ).length;
                return (
                  <div
                    key={cfg.type}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderLeft: `3px solid ${meta.color}`,
                      marginBottom: 4,
                      background: "var(--color-bg-elevated)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <span aria-hidden="true">{meta.icon}</span>
                      <strong style={{ color: meta.color }}>{cfg.label}</strong>
                      <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>
                        ({count})
                      </span>
                      <label
                        style={{
                          marginLeft: "auto",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: "var(--text-xs)",
                          color: "var(--color-text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={cfg.enabled}
                          onChange={(e) =>
                            board.setCardTypeEnabled(cfg.type, e.target.checked)
                          }
                        />
                        enabled
                      </label>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {cfg.customFields.length} field{cfg.customFields.length === 1 ? "" : "s"}
                      <button
                        type="button"
                        onClick={() => setTypeManagerFor(cfg.type)}
                        style={{
                          marginLeft: "auto",
                          background: "transparent",
                          border: "none",
                          color: "var(--color-accent)",
                          cursor: "pointer",
                          fontSize: "var(--text-xs)",
                          padding: 0,
                        }}
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sidebar__section">
              <h3 className="sidebar__section-title">
                Board fields
                <button
                  type="button"
                  onClick={() => setShowFields(true)}
                  aria-label="Manage board fields"
                  title="Manage board fields"
                >
                  +
                </button>
              </h3>
              {board.activeBoard.customFields.length === 0 ? (
                <p style={{ padding: "0 var(--space-3)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
                  No board-level fields.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: "0 var(--space-2)" }}>
                  {board.activeBoard.customFields.map((f) => {
                    const usedCount = Object.values(board.activeBoard!.cards).filter(
                      (c) =>
                        c.boardFieldValues[f.id] !== undefined &&
                        c.boardFieldValues[f.id] !== "" &&
                        c.boardFieldValues[f.id] !== false,
                    ).length;
                    const sample = Object.values(board.activeBoard!.cards)
                      .map((c) => c.boardFieldValues[f.id])
                      .find((v) => v !== undefined && v !== "" && v !== false);
                    return (
                      <li
                        key={f.id}
                        style={{
                          padding: "var(--space-1) var(--space-2)",
                          fontSize: "var(--text-sm)",
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                        }}
                      >
                        <span style={{ color: "var(--color-text-muted)" }}>{f.name}</span>
                        {sample !== undefined && (
                          <FieldChip field={f} value={sample} />
                        )}
                        <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>
                          {usedCount}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {showLabels && board.activeBoard && (
        <LabelManager
          labels={board.activeBoard.labels}
          cards={board.activeBoard.cards}
          onClose={() => setShowLabels(false)}
          onAdd={board.addLabel}
          onUpdate={board.updateLabel}
          onRemove={board.removeLabel}
        />
      )}

      {showFields && board.activeBoard && (
        <FieldManager
          fields={board.activeBoard.customFields}
          onClose={() => setShowFields(false)}
          onAdd={board.addCustomField}
          onUpdate={board.updateCustomField}
          onRemove={board.removeCustomField}
          onAddOption={board.addPresetOption}
          onUpdateOption={board.updatePresetOption}
          onRemoveOption={board.removePresetOption}
        />
      )}

      {typeManagerFor && board.activeBoard && (
        <FieldManager
          fields={
            board.activeBoard.cardTypes.find((c) => c.type === typeManagerFor)
              ?.customFields ?? []
          }
          onClose={() => setTypeManagerFor(null)}
          onAdd={(f) => board.addCustomFieldForType(typeManagerFor, f)}
          onUpdate={(id, patch) =>
            board.updateCustomFieldForType(typeManagerFor, id, patch)
          }
          onRemove={(id) => board.removeCustomFieldForType(typeManagerFor, id)}
          onAddOption={(id, name, color) =>
            board.addPresetOptionForType(typeManagerFor, id, name, color)
          }
          onUpdateOption={(id, oid, patch) =>
            board.updatePresetOptionForType(typeManagerFor, id, oid, patch)
          }
          onRemoveOption={(id, oid) =>
            board.removePresetOptionForType(typeManagerFor, id, oid)
          }
        />
      )}

      {board.activeBoard && (
        <div className="sidebar__section">
          <h3 className="sidebar__section-title">Done columns</h3>
          <p
            style={{
              padding: "0 var(--space-3)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-muted)",
            }}
          >
            Cards in these columns count as "done" for progress.
          </p>
          <ul style={{ listStyle: "none", padding: "0 var(--space-2)" }}>
            {board.activeBoard.columns.map((c) => {
              const isDone = board.activeBoard!.doneColumnIds.includes(c.id);
              return (
                <li
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "var(--space-1) var(--space-2)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={(e) => board.setDoneColumn(c.id, e.target.checked)}
                  />
                  <span>{c.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
