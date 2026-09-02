// Tree-walking helpers for the multi-parent card hierarchy.
// Pure functions — no React, no I/O. Safe to call from anywhere.

import type { Board, Card, CardType } from "./types";

/** All direct children of `parentId` of any of the given `types`. */
export function getChildren(
  board: Board,
  parentId: string,
  types?: CardType[],
): Card[] {
  const out: Card[] = [];
  for (const c of Object.values(board.cards)) {
    if (c.parentIds.includes(parentId) && (!types || types.includes(c.type))) {
      out.push(c);
    }
  }
  return out;
}

export interface GroupedChildren {
  stories: Card[];
  tasks: Card[];
}

/** Convenience: separate stories vs tasks under a parent. */
export function getGroupedChildren(
  board: Board,
  parentId: string,
): GroupedChildren {
  return {
    stories: getChildren(board, parentId, ["story"]),
    tasks: getChildren(board, parentId, ["task"]),
  };
}
