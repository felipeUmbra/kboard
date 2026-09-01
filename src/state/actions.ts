// Board / column action creators.

import { cryptoRandomId } from "../models/migrations";
import type { Board, Column } from "../models/types";

export function renameBoard(b: Board, name: string): Board {
  return { ...b, name: name.trim() || "Untitled board" };
}

export function addColumn(b: Board, name: string): Board {
  const trimmed = name.trim();
  if (!trimmed) return b;
  const col: Column = { id: cryptoRandomId(), name: trimmed, cardIds: [] };
  return { ...b, columns: [...b.columns, col] };
}

export function renameColumn(b: Board, columnId: string, name: string): Board {
  const trimmed = name.trim();
  if (!trimmed) return b;
  return {
    ...b,
    columns: b.columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c)),
  };
}

export function removeColumn(b: Board, columnId: string): Board {
  const col = b.columns.find((c) => c.id === columnId);
  const cardIds = col?.cardIds ?? [];
  const cards = { ...b.cards };
  for (const id of cardIds) delete cards[id];
  return {
    ...b,
    columns: b.columns.filter((c) => c.id !== columnId),
    cards,
  };
}

export function moveColumn(b: Board, columnId: string, toIndex: number): Board {
  const from = b.columns.findIndex((c) => c.id === columnId);
  if (from === -1) return b;
  const cols = [...b.columns];
  const [moved] = cols.splice(from, 1);
  cols.splice(Math.max(0, Math.min(toIndex, cols.length)), 0, moved);
  return { ...b, columns: cols };
}
