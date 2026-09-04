import { useState } from "react";
import { useBoard } from "../state/BoardContext";
import { Modal } from "./Modal";

export function BoardListView({
  onNavigatePlanner,
}: {
  /** Optional callback to switch to the Planner view. Wired by App. */
  onNavigatePlanner?: () => void;
}) {
  const board = useBoard();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  return (
    <div style={{ padding: "var(--space-5)", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          marginBottom: "var(--space-5)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>Your boards</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
            Boards live in your Google Drive. Only you can access them.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void board.refreshList()}
            disabled={board.loadingList}
            title="Re-fetch the list of boards from Google Drive"
          >
            {board.loadingList ? "Syncing…" : "↻ Sync"}
          </button>
          {onNavigatePlanner && (
            <button
              type="button"
              className="btn"
              onClick={onNavigatePlanner}
              data-testid="open-planner"
            >
              📅 Planner
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => setCreating(true)}
          >
            + New board
          </button>
        </div>
      </div>

      {board.loadingList ? (
        <p>Loading…</p>
      ) : board.boards.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>📋</div>
          <h2 className="empty-state__title">No boards yet</h2>
          <p className="empty-state__msg">Create your first board to get started.</p>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => setCreating(true)}
          >
            + Create board
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "var(--space-4)",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {board.boards.map((b) => (
            <article
              key={b.id}
              className="board-card"
              onClick={() => void board.openBoard(b.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void board.openBoard(b.id);
                }
              }}
            >
              <h3 className="board-card__title">{b.name}</h3>
              <p className="board-card__meta">
                {b.columns.length} columns ·{" "}
                {Object.keys(b.cards).length} cards
              </p>
              <p className="board-card__meta">
                Updated {new Date(b.updatedAt).toLocaleDateString()}
              </p>
              <div className="board-card__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete board "${b.name}"? This cannot be undone.`)) {
                      void board.deleteBoard(b);
                    }
                  }}
                  aria-label={`Delete board ${b.name}`}
                >
                  🗑
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <Modal
          title="Create a new board"
          onClose={() => {
            setCreating(false);
            setName("");
          }}
          size="sm"
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCreating(false);
                  setName("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!name.trim()}
                onClick={async () => {
                  await board.createNewBoard(name);
                  setCreating(false);
                  setName("");
                }}
              >
                Create
              </button>
            </>
          }
        >
          <div className="field-row">
            <label className="label" htmlFor="b-name">Board name</label>
            <input
              id="b-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Personal tasks, Product roadmap"
              autoFocus
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
