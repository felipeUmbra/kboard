// Card / label action creators.

import { cryptoRandomId } from "../models/migrations";
import { CARD_TYPE_META, getMeta } from "../models/cardTypeMeta";
import type {
  ActivityEntry,
  ActivityKind,
  Board,
  Card,
  CardType,
  Column,
  CommentEntry,
  CustomFieldValues,
  Label,
} from "../models/types";

// ─── Helpers ───────────────────────────────────────────────────────

/** Build a new activity entry with a fresh id and current timestamp. */
function makeActivity(kind: ActivityKind, text: string): ActivityEntry {
  return { id: cryptoRandomId(), kind, text, at: Date.now() };
}

export interface AddCardResult { board: Board; cardId: string | null }

export function addCard(
  b: Board,
  columnId: string,
  title: string,
  type: CardType = "task",
): AddCardResult {
  const trimmed = title.trim();
  if (!trimmed) return { board: b, cardId: null };
  const newId = cryptoRandomId();
  const now = Date.now();
  const card: Card = {
    id: newId,
    type,
    title: trimmed,
    descriptionHtml: "",
    labelIds: [],
    parentIds: [],
    startDate: null,
    dueDate: null,
    activity: [makeActivity("created", "Card created")],
    comments: [],
    boardFieldValues: {},
    typeFieldValues: {},
    createdAt: now,
    updatedAt: now,
  };
  return {
    cardId: newId,
    board: {
      ...b,
      cards: { ...b.cards, [newId]: card },
      columns: b.columns.map((c) =>
        c.id === columnId ? { ...c, cardIds: [...c.cardIds, newId] } : c,
      ),
    },
  };
}

/**
 * Direction for addCardWithParent:
 *   - "as_child": the new card becomes a child of `originCardId`. The new
 *     card's type is `getMeta(originCardId.type).childType` (e.g. opening
 *     "+ Add child" on an Epic creates a Story). The origin is unchanged
 *     (we just set the new card's parentIds).
 *   - "as_parent": the new card becomes a parent of `originCardId`. The
 *     new card's type is `getMeta(originCardId.type).parentType` (e.g.
 *     opening "+ Add parent" on a Task creates a Story). We then link
 *     the origin to the new card via addParent so the relationship is
 *     set on both sides in a single mutation.
 */
export type AddCardDirection = "as_parent" | "as_child";

export function addCardWithParent(
  b: Board,
  columnId: string,
  originCardId: string,
  direction: AddCardDirection,
): AddCardResult {
  const origin = b.cards[originCardId];
  if (!origin) return { board: b, cardId: null };

  const meta = getMeta(origin.type);
  let newType: CardType;
  let newParentIds: string[] = [];
  let linkToOrigin = false;

  if (direction === "as_child") {
    if (!meta.childType) return { board: b, cardId: null };
    newType = meta.childType;
    newParentIds = [originCardId];
  } else {
    if (!meta.parentType) return { board: b, cardId: null };
    newType = meta.parentType;
    linkToOrigin = true;
  }

  const targetColumn =
    columnId && b.columns.some((c) => c.id === columnId)
      ? columnId
      : b.columns[0]?.id;
  if (!targetColumn) return { board: b, cardId: null };

  const newId = cryptoRandomId();
  const now = Date.now();
  const card: Card = {
    id: newId,
    type: newType,
    // "Untitled" satisfies addCard's trim gate so the card is materialised
    // on the board immediately. The UI gates Save until the user types a
    // real name and the rollback path deletes the card on cancel.
    title: "Untitled",
    descriptionHtml: "",
    labelIds: [],
    parentIds: newParentIds,
    startDate: null,
    dueDate: null,
    activity: [
      makeActivity(
        "created",
        direction === "as_child"
          ? `Card created (linked as child of ${origin.type} "${origin.title}")`
          : `Card created (linked as parent of ${origin.type} "${origin.title}")`,
      ),
    ],
    comments: [],
    boardFieldValues: {},
    typeFieldValues: {},
    createdAt: now,
    updatedAt: now,
  };

  let next: Board = {
    ...b,
    cards: { ...b.cards, [newId]: card },
    columns: b.columns.map((c) =>
      c.id === targetColumn ? { ...c, cardIds: [...c.cardIds, newId] } : c,
    ),
  };

  if (linkToOrigin) {
    next = addParent(next, originCardId, newId);
  }

  return { cardId: newId, board: next };
}

/**
 * Apply a patch to a card and record the right activity entries.
 * Granular diffing: only emits entries for fields that actually
 * changed. No-op if the card doesn't exist.
 */
export function patchCard(b: Board, cardId: string, patch: Partial<Card>): Board {
  const existing = b.cards[cardId];
  if (!existing) return b;
  const merged: Card = { ...existing, ...patch, id: existing.id };
  const entries: ActivityEntry[] = [];

  if (patch.title !== undefined && patch.title !== existing.title) {
    entries.push(makeActivity("title_changed", `Title changed to "${merged.title}"`));
  }
  if (
    patch.descriptionHtml !== undefined &&
    patch.descriptionHtml !== existing.descriptionHtml
  ) {
    entries.push(makeActivity("description_changed", "Description edited"));
  }
  if (patch.type !== undefined && patch.type !== existing.type) {
    entries.push(
      makeActivity(
        "type_changed",
        `Type changed to ${CARD_TYPE_META[merged.type].defaultLabel}`,
      ),
    );
  }
  if (patch.startDate !== undefined && patch.startDate !== existing.startDate) {
    entries.push(
      makeActivity(
        "start_date_changed",
        merged.startDate ? `Start date set to ${merged.startDate}` : "Start date cleared",
      ),
    );
  }
  if (patch.dueDate !== undefined && patch.dueDate !== existing.dueDate) {
    entries.push(
      makeActivity(
        "due_date_changed",
        merged.dueDate ? `Due date set to ${merged.dueDate}` : "Due date cleared",
      ),
    );
  }

  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...merged,
        activity: [...existing.activity, ...entries],
        updatedAt: Date.now(),
      },
    },
  };
}

/** Backwards-compat alias — old code still calls `updateCard`. */
export const updateCard = patchCard;

export function deleteCard(b: Board, cardId: string): Board {
  const cards = { ...b.cards };
  delete cards[cardId];
  // Cascade: remove this id from any child's parentIds.
  for (const [id, c] of Object.entries(cards)) {
    if (c.parentIds.includes(cardId)) {
      cards[id] = { ...c, parentIds: c.parentIds.filter((p) => p !== cardId) };
    }
  }
  return {
    ...b,
    cards,
    columns: b.columns.map((c) => ({
      ...c,
      cardIds: c.cardIds.filter((id) => id !== cardId),
    })),
  };
}

export function moveCard(b: Board, cardId: string, toColumnId: string, toIndex: number): Board {
  const existing = b.cards[cardId];
  if (!existing) return b;
  const fromCol = b.columns.find((c) => c.cardIds.includes(cardId));
  const toCol = b.columns.find((c) => c.id === toColumnId);
  const columns = b.columns.map((c) => ({
    ...c,
    cardIds: c.cardIds.filter((id) => id !== cardId),
  })) as Column[];
  const target = columns.find((c) => c.id === toColumnId);
  if (!target) return b;
  const idx = Math.max(0, Math.min(toIndex, target.cardIds.length));
  target.cardIds.splice(idx, 0, cardId);

  if (fromCol && toCol && fromCol.id !== toCol.id) {
    return {
      ...b,
      columns,
      cards: {
        ...b.cards,
        [cardId]: {
          ...existing,
          activity: [
            ...existing.activity,
            makeActivity("moved", `Moved to "${toCol.name}"`),
          ],
          updatedAt: Date.now(),
        },
      },
    };
  }
  return { ...b, columns };
}

// ─── Multi-parent actions ──────────────────────────────────────────

export type ParentValidationError =
  | "self_parent"
  | "wrong_type"
  | "cycle"
  | "not_found";

/**
 * Validate whether `parentId` can be added as a parent of `cardId`.
 * - parentId must reference an existing card
 * - parent.type must match the meta's parentType
 * - cardId cannot be its own parent
 * - adding must not create a cycle
 */
export function validateAddParent(
  b: Board,
  cardId: string,
  parentId: string,
): ParentValidationError | null {
  const card = b.cards[cardId];
  const parent = b.cards[parentId];
  if (!card || !parent) return "not_found";
  if (cardId === parentId) return "self_parent";
  if (card.parentIds.includes(parentId)) return null; // duplicate is OK
  const meta = getMeta(card.type);
  if (!meta.parentType || meta.parentType !== parent.type) return "wrong_type";
  // cycle check: walking up parent's ancestors, see if we hit cardId
  const visited = new Set<string>([cardId]);
  const stack = [parentId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const c = b.cards[cur];
    if (!c) continue;
    for (const p of c.parentIds) {
      if (p === cardId) return "cycle";
      if (!visited.has(p)) stack.push(p);
    }
  }
  return null;
}

export function addParent(b: Board, cardId: string, parentId: string): Board {
  if (validateAddParent(b, cardId, parentId) !== null) return b;
  const existing = b.cards[cardId];
  const parent = b.cards[parentId];
  if (!existing || !parent) return b;
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...existing,
        parentIds: [...existing.parentIds, parentId],
        activity: [
          ...existing.activity,
          makeActivity("parents_changed", `Linked to ${parent.type} "${parent.title}"`),
        ],
        updatedAt: Date.now(),
      },
    },
  };
}

export function removeParent(b: Board, cardId: string, parentId: string): Board {
  const existing = b.cards[cardId];
  const parent = b.cards[parentId];
  if (!existing || !parent) return b;
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...existing,
        parentIds: existing.parentIds.filter((p) => p !== parentId),
        activity: [
          ...existing.activity,
          makeActivity("parents_changed", `Unlinked from ${parent.type} "${parent.title}"`),
        ],
        updatedAt: Date.now(),
      },
    },
  };
}

/** All valid parent candidates for a card of the given type. */
export function getValidParents(b: Board, type: CardType): Card[] {
  const meta = getMeta(type);
  if (!meta.parentType) return [];
  const out: Card[] = [];
  for (const c of Object.values(b.cards)) {
    if (c.type === meta.parentType) out.push(c);
  }
  return out;
}

// ─── Dates ─────────────────────────────────────────────────────────

/** Set a card's start date. Pass `null` to clear. Records activity. */
export function setCardStartDate(
  b: Board,
  cardId: string,
  iso: string | null,
): Board {
  return patchCard(b, cardId, { startDate: iso });
}

/** Set a card's due date. Pass `null` to clear. Records activity. */
export function setCardDueDate(
  b: Board,
  cardId: string,
  iso: string | null,
): Board {
  return patchCard(b, cardId, { dueDate: iso });
}

// ─── Comments ──────────────────────────────────────────────────────

/** Add a user-typed comment to a card. Also records a `comment_added` activity. */
export function addComment(
  b: Board,
  cardId: string,
  comment: { author: string; authorPicture?: string; body: string },
): Board {
  const existing = b.cards[cardId];
  if (!existing) return b;
  const trimmed = comment.body.trim();
  if (!trimmed) return b;
  const c: CommentEntry = {
    id: cryptoRandomId(),
    author: comment.author,
    authorPicture: comment.authorPicture,
    body: trimmed,
    at: Date.now(),
  };
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...existing,
        comments: [...existing.comments, c],
        activity: [
          ...existing.activity,
          makeActivity("comment_added", `Comment by ${comment.author}`),
        ],
        updatedAt: Date.now(),
      },
    },
  };
}

export function removeComment(b: Board, cardId: string, commentId: string): Board {
  const existing = b.cards[cardId];
  if (!existing) return b;
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...existing,
        comments: existing.comments.filter((c) => c.id !== commentId),
        updatedAt: Date.now(),
      },
    },
  };
}

// ─── Labels ────────────────────────────────────────────────────────

export interface AddLabelResult { board: Board; labelId: string | null }

export function addLabel(b: Board, name: string, color: string): AddLabelResult {
  const trimmed = name.trim();
  if (!trimmed) return { board: b, labelId: null };
  const id = cryptoRandomId();
  return {
    labelId: id,
    board: { ...b, labels: [...b.labels, { id, name: trimmed, color }] },
  };
}

export function updateLabel(b: Board, labelId: string, patch: Partial<Label>): Board {
  return {
    ...b,
    labels: b.labels.map((l) => (l.id === labelId ? { ...l, ...patch, id: l.id } : l)),
  };
}

export function removeLabel(b: Board, labelId: string): Board {
  return {
    ...b,
    labels: b.labels.filter((l) => l.id !== labelId),
    cards: Object.fromEntries(
      Object.entries(b.cards).map(([id, c]) => [
        id,
        { ...c, labelIds: c.labelIds.filter((lid) => lid !== labelId) },
      ]),
    ),
  };
}

export function toggleCardLabel(b: Board, cardId: string, labelId: string): Board {
  const existing = b.cards[cardId];
  if (!existing) return b;
  const has = existing.labelIds.includes(labelId);
  const label = b.labels.find((l) => l.id === labelId);
  const labelName = label?.name ?? "label";
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...existing,
        labelIds: has
          ? existing.labelIds.filter((id) => id !== labelId)
          : [...existing.labelIds, labelId],
        activity: [
          ...existing.activity,
          makeActivity(
            "labels_changed",
            has ? `Removed "${labelName}" label` : `Added "${labelName}" label`,
          ),
        ],
        updatedAt: Date.now(),
      },
    },
  };
}

// Re-export the meta for convenience.
export { CARD_TYPE_META };
