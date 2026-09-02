// Read-only list of a card's direct children, grouped by type.
// Clicking a row navigates into that child via the parent editor.

import { useMemo, useState } from "react";
import type { Board, Card, CardType } from "../models/types";
import { CARD_TYPE_META, getMeta } from "../models/cardTypeMeta";
import { TypeChip } from "./TypeChip";
import { getGroupedChildren } from "../models/relations";

export function ChildrenList({
  board,
  parentId,
  onOpenCard,
  limit = 5,
}: {
  board: Board;
  parentId: string;
  onOpenCard: (childId: string) => void;
  limit?: number;
}) {
  const { stories, tasks } = useMemo(
    () => getGroupedChildren(board, parentId),
    [board, parentId],
  );
  const total = stories.length + tasks.length;

  if (total === 0) {
    return (
      <p
        style={{
          color: "var(--color-text-muted)",
          fontSize: "var(--text-sm)",
          margin: 0,
        }}
      >
        No children yet.
      </p>
    );
  }

  return (
    <div className="children-list">
      {stories.length > 0 && (
        <ChildGroup
          title={`Stories (${stories.length})`}
          cards={stories}
          limit={limit}
          onOpenCard={onOpenCard}
        />
      )}
      {tasks.length > 0 && (
        <ChildGroup
          title={`Tasks (${tasks.length})`}
          cards={tasks}
          limit={limit}
          onOpenCard={onOpenCard}
        />
      )}
    </div>
  );
}

function ChildGroup({
  title,
  cards,
  limit,
  onOpenCard,
}: {
  title: string;
  cards: Card[];
  limit: number;
  onOpenCard: (childId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cards : cards.slice(0, limit);
  const overflow = cards.length - visible.length;

  return (
    <div className="children-group">
      <div className="children-group__title">{title}</div>
      {visible.map((c) => (
        <button
          key={c.id}
          type="button"
          className="children-group__row"
          onClick={() => onOpenCard(c.id)}
          aria-label={`Open ${getMeta(c.type).defaultLabel.toLowerCase()} "${c.title}"`}
        >
          <TypeChip type={c.type} size="xs" />
          <span className="children-group__title-text">{c.title}</span>
        </button>
      ))}
      {overflow > 0 && (
        <button
          type="button"
          className="children-group__view-all"
          onClick={() => setExpanded(true)}
        >
          View all {cards.length} →
        </button>
      )}
      {expanded && overflow > 0 && (
        <button
          type="button"
          className="children-group__view-all"
          onClick={() => setExpanded(false)}
          style={{ marginTop: 2 }}
        >
          Show less
        </button>
      )}
    </div>
  );
}
