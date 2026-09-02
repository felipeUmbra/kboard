// User comment thread on a card.

import { useState } from "react";
import type { CommentEntry, UserProfile } from "../models/types";

export function CommentThread({
  comments,
  currentUser,
  onAdd,
  onDelete,
}: {
  comments: CommentEntry[];
  currentUser: UserProfile;
  onAdd: (c: { author: string; authorPicture?: string; body: string }) => void;
  onDelete: (commentId: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd({
      author: currentUser.name,
      authorPicture: currentUser.picture,
      body,
    });
    setDraft("");
  };

  return (
    <div className="comment-thread">
      <ul
        className="comment-thread__list"
        style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}
      >
        {comments.length === 0 ? (
          <li
            style={{
              color: "var(--color-text-muted)",
              fontSize: "var(--text-sm)",
            }}
          >
            No comments yet.
          </li>
        ) : (
          comments.map((c) => (
            <li
              key={c.id}
              className="comment-thread__item"
              style={{
                display: "flex",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <Avatar
                name={c.author}
                picture={c.authorPicture}
                size={28}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <strong style={{ fontSize: "var(--text-sm)" }}>
                    {c.author}
                  </strong>
                  <span
                    style={{
                      color: "var(--color-text-muted)",
                      fontSize: "var(--text-xs)",
                    }}
                    title={new Date(c.at).toLocaleString()}
                  >
                    {formatRelative(c.at)}
                  </span>
                  {c.author === currentUser.name && (
                    <button
                      type="button"
                      onClick={() => onDelete(c.id)}
                      className="btn btn--ghost"
                      style={{
                        marginLeft: "auto",
                        padding: "0 6px",
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-muted)",
                      }}
                      aria-label={`Delete comment by ${c.author}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "var(--text-sm)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {c.body}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>

      <div
        className="comment-thread__composer"
        style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
      >
        <Avatar
          name={currentUser.name}
          picture={currentUser.picture}
          size={28}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            className="textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 6,
            }}
          >
            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: "var(--text-xs)",
              }}
            >
              Ctrl+Enter to post
            </span>
            <button
              type="button"
              className="btn btn--primary"
              onClick={submit}
              disabled={!draft.trim()}
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({
  name,
  picture,
  size,
}: {
  name: string;
  picture?: string;
  size: number;
}) {
  const dim = `${size}px`;
  if (picture) {
    return (
      <img
        src={picture}
        alt={name}
        style={{
          width: dim,
          height: dim,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div
      aria-hidden
      style={{
        width: dim,
        height: dim,
        borderRadius: "50%",
        background: "var(--color-accent)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function formatRelative(at: number): string {
  const now = Date.now();
  const diff = now - at;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(at).toLocaleDateString();
}
