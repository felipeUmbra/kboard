// Card / label action creators.

import { cryptoRandomId } from "../models/migrations";
import { CARD_TYPE_META, getMeta } from "../models/cardTypeMeta";
import type {
  Board,
  Card,
  CardType,
  Column,
  CustomFieldValues,
  Label,
} from "../models/types";

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

export function updateCard(b: Board, cardId: string, patch: Partial<Card>): Board {
  const existing = b.cards[cardId];
  if (!existing) return b;
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: { ...existing, ...patch, id: existing.id, updatedAt: Date.now() },
    },
  };
}

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
  const columns = b.columns.map((c) => ({
    ...c,
    cardIds: c.cardIds.filter((id) => id !== cardId),
  })) as Column[];
  const target = columns.find((c) => c.id === toColumnId);
  if (!target) return b;
  const idx = Math.max(0, Math.min(toIndex, target.cardIds.length));
  target.cardIds.splice(idx, 0, cardId);
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
  return updateCard(b, cardId, {
    parentIds: [...b.cards[cardId].parentIds, parentId],
  });
}

export function removeParent(b: Board, cardId: string, parentId: string): Board {
  const card = b.cards[cardId];
  if (!card) return b;
  return updateCard(b, cardId, {
    parentIds: card.parentIds.filter((p) => p !== parentId),
  });
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
  const card = b.cards[cardId];
  if (!card) return b;
  const has = card.labelIds.includes(labelId);
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...card,
        labelIds: has
          ? card.labelIds.filter((id) => id !== labelId)
          : [...card.labelIds, labelId],
        updatedAt: Date.now(),
      },
    },
  };
}

// Re-export the meta for convenience.
export { CARD_TYPE_META };
