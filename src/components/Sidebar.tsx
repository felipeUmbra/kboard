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
  onExpand,
  onToggle,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onExpand?: () => void;
  onToggle?: () => void;
}) {
  const board = useBoard();
  const [showLabels, setShowLabels] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [typeManagerFor, setTypeManagerFor] = useState<CardType | null>(null);
  const viewport = useViewport();

  // Desktop/tablet collapsed rail: render a thin empty aside (existing
  // behavior). The responsive CSS hides the title/body at this width.
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

  // Mobile collapsed rail: a narrow vertical rail that shows only icons.
  // Tapping an icon expands the full menu (which also scrolls to that
  // section before expanding).
  if (collapsed && viewport.isMobile) {
    const expandAndScroll = (section: string | null) => {
      if (section) {
        // Remember where to scroll; the expanded body renders after state
        // flips, so defer the scroll to a microtask after the re-render.
        window.requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `.sidebar__section[data-section="${section}"]`,
          );
          el?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      }
      onExpand?.();
    };
    return (
      <aside
        className="sidebar sidebar--rail"
        data-open="true"
        data-collapsed="true"
      >
        <div className="sidebar__rail" role="toolbar" aria-label="Menu">
          <button
            type="button"
            className="sidebar__rail-btn"
            onClick={() => expandAndScroll("boards")}
            aria-label="Boards"
            title="Boards"
            data-section="boards"
          >
            📋
          </button>
          {board.activeBoard && (
            <>
              <button
                type="button"
                className="sidebar__rail-btn"
                onClick={() => expandAndScroll("labels")}
                aria-label="Labels"
                title="Labels"
                data-section="labels"
              >
                🏷️
              </button>
              <button
                type="button"
                className="sidebar__rail-btn"
                onClick={() => expandAndScroll("types")}
                aria-label="Card types"
                title="Card types"
                data-section="types"
              >
                <PostitStackIcon />
              </button>
              <button
                type="button"
                className="sidebar__rail-btn"
                onClick={() => expandAndScroll("fields")}
                aria-label="Board fields"
                title="Board fields"
                data-section="fields"
              >
                🧩
              </button>
              <button
                type="button"
                className="sidebar__rail-btn"
                onClick={() => expandAndScroll("done")}
                aria-label="Done columns"
                title="Done columns"
                data-section="done"
              >
                ✔️
              </button>
            </>
          )}
        </div>
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
        <div className="sidebar__section" data-section="boards">
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
            <div className="sidebar__section" data-section="labels">
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

            <div className="sidebar__section" data-section="types">
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

            <div className="sidebar__section" data-section="fields">
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
        <div className="sidebar__section" data-section="done">
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

/** A stack of colorful sticky notes — used for the "Card types" rail icon.
 *  Matches the visual idea of the `Evidence/post.png` reference (three
 *  fanned post-its): each note has its own post-it color and a slight
 *  rotation/offset so the stack reads at a glance. */
function PostitStackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      {/* Back note (peeking top-right) — lilac */}
      <path
        d="M15.2 4.4 19 7.1l-1.2 5.1-4.4-1.1z"
        fill="#c5a3ff"
      />
      {/* Middle note (rotated left) — pink */}
      <path
        d="M9.5 6.5 15.7 8.4l-1.4 7.1-6.2-1.4z"
        fill="#ffa8c5"
      />
      {/* Front note (straight) — yellow */}
      <rect x="4.6" y="5.2" width="11" height="13" rx="1.5" fill="#ffe95e" />
      {/* Folded corner of the front note (darker yellow) */}
      <path
        d="M13.5 18.2v-2.2a1.5 1.5 0 0 1 1.5-1.5h1.6"
        fill="none"
        stroke="#d9c13b"
        strokeWidth="1.4"
      />
    </svg>
  );
}
