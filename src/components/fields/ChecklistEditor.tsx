// Per-card checklist editor. Renders the full list of checklists
// attached to a card with inline add/rename/toggle/delete UI.
//
// Each action (toggle, rename, add, delete) flows through
// BoardContext, so it picks up the publishChange debounce and the
// boards-list mirror. The activity log records every change.

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type {
  Board,
  Card as CardModel,
  Checklist,
  ChecklistItem,
} from "../../models/types";
import { useBoard } from "../../state/BoardContext";

export function ChecklistEditor({
  card,
}: {
  card: CardModel;
  board: Board;
}) {
  const ctx = useBoard();
  const checklists = card.checklists;

  if (checklists.length === 0) {
    return (
      <div
        className="checklist-editor"
        style={{ marginTop: "var(--space-3)" }}
        data-testid="checklist-editor"
      >
        <ChecklistAddRow
          placeholder="+ Add checklist"
          buttonLabel="Add"
          kind="checklist"
          onSubmit={(title) => ctx.addChecklist(card.id, title)}
        />
      </div>
    );
  }

  return (
    <div
      className="checklist-editor"
      style={{ marginTop: "var(--space-3)" }}
      data-testid="checklist-editor"
    >
      {checklists.map((cl) => (
        <ChecklistBlock
          key={cl.id}
          checklist={cl}
          onRename={(title) => ctx.renameChecklist(card.id, cl.id, title)}
          onDelete={() => ctx.deleteChecklist(card.id, cl.id)}
          onAddItem={(text) => ctx.addChecklistItem(card.id, cl.id, text)}
          onToggleItem={(itemId) =>
            ctx.toggleChecklistItem(card.id, cl.id, itemId)
          }
          onRenameItem={(itemId, text) =>
            ctx.renameChecklistItem(card.id, cl.id, itemId, text)
          }
          onDeleteItem={(itemId) =>
            ctx.deleteChecklistItem(card.id, cl.id, itemId)
          }
        />
      ))}
      <ChecklistAddRow
        placeholder="+ Add another checklist"
        buttonLabel="Add"
        kind="checklist"
        onSubmit={(title) => ctx.addChecklist(card.id, title)}
      />
    </div>
  );
}

function ChecklistBlock({
  checklist,
  onRename,
  onDelete,
  onAddItem,
  onToggleItem,
  onRenameItem,
  onDeleteItem,
}: {

  checklist: Checklist;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAddItem: (text: string) => void;
  onToggleItem: (itemId: string) => void;
  onRenameItem: (itemId: string, text: string) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checklist.title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== checklist.title) onRename(trimmed);
    setEditingTitle(false);
    setTitleDraft(checklist.title);
  };

  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : null;

  return (
    <section
      className="checklist"
      data-testid="checklist"
      data-checklist-id={checklist.id}
      style={{
        marginBottom: "var(--space-3)",
        padding: "var(--space-2)",
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              else if (e.key === "Escape") {
                setTitleDraft(checklist.title);
                setEditingTitle(false);
              }
            }}
            style={{ flex: 1, fontSize: "var(--text-sm)", fontWeight: 600 }}
            data-testid="checklist-title-input"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            title="Click to rename"
            data-testid="checklist-title"
            style={{
              flex: 1,
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            {checklist.title}
            {pct !== null && (
              <span
                style={{
                  marginLeft: 8,
                  color: "var(--color-text-muted)",
                  fontWeight: 500,
                }}
                data-testid="checklist-progress"
              >
                {done}/{total} ({pct}%)
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="btn btn--ghost"
          aria-label={`Delete checklist ${checklist.title}`}
          data-testid="checklist-delete"
          style={{ padding: "2px 6px", fontSize: "var(--text-xs)" }}
        >
          ??
        </button>
      </header>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {checklist.items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            onToggle={() => onToggleItem(item.id)}
            onRename={(text) => onRenameItem(item.id, text)}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
      </ul>
      <ChecklistAddRow
        placeholder="+ Add item"
        buttonLabel="Add"
        kind="item"
        onSubmit={onAddItem}
      />
    </section>
  );
}

function ChecklistItemRow({
  item,
  onToggle,
  onRename,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.text) onRename(trimmed);
    setEditing(false);
    setDraft(item.text);
  };

  return (
    <li
      className="checklist-item"
      data-testid="checklist-item"
      data-item-id={item.id}
      data-done={item.done ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 0",
      }}
    >
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggle}
        aria-label={item.done ? `Uncheck ${item.text}` : `Check ${item.text}`}
        data-testid="checklist-item-toggle"
      />
      {editing ? (
        <input
          ref={inputRef}
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(item.text);
              setEditing(false);
            }
          }}
          style={{ flex: 1, fontSize: "var(--text-sm)" }}
          data-testid="checklist-item-input"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to edit"
          data-testid="checklist-item-text"
          style={{
            flex: 1,
            textAlign: "left",
            background: "transparent",
            border: "none",
            padding: 0,
            fontSize: "var(--text-sm)",
            color: item.done ? "var(--color-text-muted)" : "var(--color-text)",
            textDecoration: item.done ? "line-through" : "none",
            cursor: "pointer",
          }}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="btn btn--ghost"
        aria-label={`Delete ${item.text}`}
        data-testid="checklist-item-delete"
        style={{ padding: "0 4px", fontSize: "var(--text-xs)", opacity: 0.5 }}
      >
        ?
      </button>
    </li>
  );
}

function ChecklistAddRow({
  placeholder,
  buttonLabel,
  onSubmit,
  kind,
}: {
  placeholder: string;
  buttonLabel: string;
  onSubmit: (text: string) => void;
  /**
   * "checklist" → adds a new checklist to the card.
   * "item" → adds a new item to a specific checklist.
   * Used to disambiguate `data-testid` for the test suite.
   */
  kind: "checklist" | "item";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    setValue("");
    setOpen(false);
  };

  const testIdSuffix = kind;

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen(true)}
        data-testid={`checklist-add-${testIdSuffix}-toggle`}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "4px 6px",
          color: "var(--color-text-muted)",
          fontSize: "var(--text-sm)",
        }}
      >
        {placeholder}
      </button>
    );
  }

  return (
    <div
      style={{ display: "flex", gap: 4, marginTop: 4 }}
      data-testid={`checklist-add-${testIdSuffix}-row`}
    >
      <input
        ref={inputRef}
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        placeholder={placeholder.replace(/^\+ /, "")}
        data-testid={`checklist-add-${testIdSuffix}-input`}
        style={{ flex: 1, fontSize: "var(--text-sm)" }}
      />
      <button
        type="button"
        className="btn btn--primary"
        onClick={submit}
        disabled={!value.trim()}
        data-testid={`checklist-add-${testIdSuffix}-submit`}
        style={{ fontSize: "var(--text-sm)" }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
