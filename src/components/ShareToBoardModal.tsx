// Modal shown when the app is opened via the PWA share_target flow.
//
// Android posts the shared text/url/title to /share-capture.html, which
// stores them in IndexedDB and redirects to /?share=<id>. App.tsx
// reads the payload via shareInbox.take(id) and pre-fills this modal
// with the shared content. The user picks a board name (or accepts the
// suggested one) and creates the board; the description field carries
// the shared text/url so it shows up in the first card they add.

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { SharedPayload } from "../share/shareInbox";

interface ShareToBoardModalProps {
  payload: SharedPayload;
  /** Returns a Promise so we can show a "Creating..." state. */
  onCreate: (input: { name: string; description: string }) => Promise<void>;
  onClose: () => void;
}

function suggestedBoardName(p: SharedPayload): string {
  if (p.title && p.title.trim()) return p.title.trim();
  if (p.text && p.text.trim()) {
    // First non-empty line, capped so it fits a board name field.
    const first = p.text.split(/\r?\n/, 1)[0].trim();
    return first.length > 60 ? first.slice(0, 57) + "..." : first;
  }
  if (p.url) {
    try {
      return new URL(p.url).hostname;
    } catch {
      return p.url.slice(0, 60);
    }
  }
  return "Shared to Kboard";
}

function suggestedDescription(p: SharedPayload): string {
  const parts: string[] = [];
  if (p.text) parts.push(p.text);
  if (p.url) parts.push(p.url);
  return parts.join("\n\n");
}

export function ShareToBoardModal({
  payload,
  onCreate,
  onClose,
}: ShareToBoardModalProps) {
  const [name, setName] = useState(() => suggestedBoardName(payload));
  const [description, setDescription] = useState(() =>
    suggestedDescription(payload),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Autofocus the name field on open and select its text so the user
  // can immediately type over the suggestion.
  useEffect(() => {
    const el = document.getElementById("share-board-name") as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  return (
    <Modal
      title="Create board from share"
      onClose={() => {
        if (!busy) onClose();
      }}
      size="sm"
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onCreate({ name: name.trim(), description });
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Create failed");
                setBusy(false);
              }
            }}
            data-testid="share-create-button"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <div className="field-row">
        <label className="label" htmlFor="share-board-name">
          Board name
        </label>
        <input
          id="share-board-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Shared links"
          data-testid="share-board-name"
        />
      </div>
      <div className="field-row" style={{ marginTop: "var(--space-3)" }}>
        <label className="label" htmlFor="share-board-desc">
          Description
        </label>
        <textarea
          id="share-board-desc"
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          data-testid="share-board-desc"
        />
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          We'll add this as the first card's description so you have
          the share content right where you need it.
        </p>
      </div>
      {err && (
        <p
          style={{
            color: "var(--color-danger)",
            fontSize: "var(--text-sm)",
            marginTop: "var(--space-3)",
          }}
        >
          {err}
        </p>
      )}
    </Modal>
  );
}
