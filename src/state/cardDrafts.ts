// Client-side draft store for in-progress card edits.
//
// Two problems this solves:
//   1. Navigating between cards (parent chip, child row, "+ Add …") would
//      otherwise discard the user's unsaved title/description edits because
//      the CardEditor keeps those fields as local React state.
//   2. Reloading the page while the editor is open would lose the same edits.
//
// Drafts are keyed by cardId and persisted to localStorage so they survive
// reload. They're best-effort: the source of truth is still the board (which
// gets mutated via ctx.updateCard on explicit Save or on navigation). A draft
// is just a "remember this for later" hint, deleted the moment the board
// catches up.
//
// Schema forward-compat: the localStorage key is new; old clients have no
// entry and loadFromStorage returns {}. Existing boards/cards are unaffected.

import type { Card } from "../models/types";

export interface CardDraft {
  title: string;
  descriptionHtml: string;
  /** Epoch ms of the last edit; used for diagnostics/cleanup. */
  updatedAt: number;
  /** When true, the draft is tombstoned: future `get` calls return
   *  null (the user explicitly discarded these edits) but the entry
   *  stays in storage so a future `clear` can wipe it. */
  discarded?: boolean;
}

const STORAGE_KEY = "kboard:card-drafts";

type DraftsMap = Record<string, CardDraft>;

function loadFromStorage(): DraftsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as DraftsMap;
  } catch {
    // Private mode / quota / SecurityError — best-effort, fall through.
    return {};
  }
}

function saveToStorage(map: DraftsMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled — silently drop. The in-memory
    // copy on this tab is still consistent until reload.
  }
}

export const cardDrafts = {
  /** Get a draft for a card. Returns null if none, or if the draft was
   *  explicitly discarded by the user (in which case a "tombstone"
   *  entry is recorded so we don't resurrect it). */
  get(cardId: string): CardDraft | null {
    const map = loadFromStorage();
    const entry = map[cardId];
    if (!entry) return null;
    if (entry.discarded) return null;
    return entry;
  },

  /** Set/update a draft for a card. */
  set(cardId: string, draft: CardDraft): void {
    const map = loadFromStorage();
    map[cardId] = { ...draft, updatedAt: Date.now() };
    saveToStorage(map);
  },

  /** Mark a draft as discarded. Future calls to `get` return null. The
   *  underlying entry is left in place so a same-session reopen doesn't
   *  surprise the user with a suddenly-empty field — but since
   *  `get` filters tombstones, it acts as if the draft was deleted. */
  discard(cardId: string): void {
    const map = loadFromStorage();
    if (!(cardId in map)) return;
    map[cardId] = {
      ...map[cardId],
      discarded: true,
      updatedAt: Date.now(),
    };
    saveToStorage(map);
  },

  /** Permanently remove a draft (e.g. on commit or card deletion). */
  delete(cardId: string): void {
    const map = loadFromStorage();
    if (!(cardId in map)) return;
    delete map[cardId];
    saveToStorage(map);
  },

  /** Wipe all drafts (e.g. on logout). */
  clear(): void {
    saveToStorage({});
  },
};

/**
 * Returns true if the given draft differs from the canonical card, meaning
 * the user has unsaved local edits. Both fields must match for the draft
 * to be considered "consumed".
 */
export function draftDiffersFromCard(
  draft: CardDraft | null,
  card: Pick<Card, "title" | "descriptionHtml">,
): boolean {
  if (!draft) return false;
  return draft.title !== card.title || draft.descriptionHtml !== card.descriptionHtml;
}
