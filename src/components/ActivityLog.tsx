// Activity log: renders a card's auto-generated change history.

import { useMemo, useState } from "react";
import type { ActivityEntry, ActivityKind } from "../models/types";

const KIND_LABEL: Record<ActivityKind, string> = {
  created: "Created",
  title_changed: "Title",
  description_changed: "Description",
  type_changed: "Type",
  labels_changed: "Labels",
  parents_changed: "Parents",
  start_date_changed: "Start date",
  due_date_changed: "Due date",
  moved: "Move",
  comment_added: "Comment",
};

const KIND_ICON: Record<ActivityKind, string> = {
  created: "✨",
  title_changed: "✏️",
  description_changed: "📝",
  type_changed: "🏷",
  labels_changed: "🎨",
  parents_changed: "🔗",
  start_date_changed: "📅",
  due_date_changed: "⏰",
  moved: "↔",
  comment_added: "💬",
};

const ALL_KINDS: ActivityKind[] = [
  "created",
  "title_changed",
  "description_changed",
  "type_changed",
  "labels_changed",
  "parents_changed",
  "start_date_changed",
  "due_date_changed",
  "moved",
  "comment_added",
];

export function ActivityLog({ activity }: { activity: ActivityEntry[] }) {
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () => [...activity].sort((a, b) => b.at - a.at),
    [activity],
  );

  const filtered = useMemo(
    () =>
      filter === "all" ? sorted : sorted.filter((e) => e.kind === filter),
    [sorted, filter],
  );

  const visible = showAll ? filtered : filtered.slice(0, 3);

  if (activity.length === 0) {
    return (
      <div className="activity-log">
        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "var(--text-sm)",
            margin: 0,
          }}
        >
          No activity yet.
        </p>
      </div>
    );
  }

  return (
    <div className="activity-log">
      <div
        className="activity-log__filters"
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`All (${sorted.length})`}
        />
        {ALL_KINDS.map((k) => {
          const count = sorted.filter((e) => e.kind === k).length;
          if (count === 0) return null;
          return (
            <FilterPill
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
              label={`${KIND_LABEL[k]} (${count})`}
            />
          );
        })}
      </div>
      <ul
        className="activity-log__list"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {visible.map((e) => (
          <li
            key={e.id}
            className="activity-log__item"
            style={{
              display: "flex",
              gap: 8,
              padding: "6px 0",
              borderBottom: "1px solid var(--color-border)",
              fontSize: "var(--text-sm)",
            }}
          >
            <span aria-hidden="true" style={{ width: 18 }}>
              {KIND_ICON[e.kind]}
            </span>
            <span style={{ flex: 1 }}>{e.text}</span>
            <span
              style={{
                color: "var(--color-text-muted)",
                fontSize: "var(--text-xs)",
                whiteSpace: "nowrap",
              }}
              title={new Date(e.at).toLocaleString()}
            >
              {formatRelative(e.at)}
            </span>
          </li>
        ))}
      </ul>
      {filtered.length > 3 && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setShowAll((s) => !s)}
          style={{ marginTop: 8, fontSize: "var(--text-xs)" }}
        >
          {showAll ? "Show less" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="activity-log__filter"
      style={{
        padding: "3px 8px",
        fontSize: "var(--text-xs)",
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        background: active ? "var(--color-accent)" : "var(--color-surface)",
        color: active ? "#fff" : "var(--color-text)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
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
