// Card / label action creators.

import { cryptoRandomId } from "../models/migrations";
import type { Board, Card, Column, Label } from "../models/types";

export interface AddCardResult { board: Board; cardId: string | null }

export function addCard(b: Board, columnId: string, title: string): AddCardResult {
  const trimmed = title.trim();
  if (!trimmed) return { board: b, cardId: null };
  const newId = cryptoRandomId();
  const now = Date.now();
  const card: Card = {
    id: newId,
    title: trimmed,
    descriptionHtml: "",
    labelIds: [],
    customFieldValues: {},
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
