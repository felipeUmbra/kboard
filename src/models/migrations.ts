import type {
  ActivityEntry,
  Board,
  Card,
  CardType,
  CardTypeConfig,
  CommentEntry,
  CustomFieldValues,
  Label,
} from "./types";
import { ALL_CARD_TYPES, CARD_TYPE_META } from "./cardTypeMeta";

/** Build a fresh per-type config block. */
function defaultCardTypes(): CardTypeConfig[] {
  return ALL_CARD_TYPES.map((t) => ({
    type: t,
    enabled: true,
    label: CARD_TYPE_META[t].defaultLabel,
    customFields: [],
  }));
}

function defaultDoneColumnIds(board: Partial<Board>): string[] {
  if (!Array.isArray(board.columns)) return [];
  const out: string[] = [];
  for (const c of board.columns) {
    if (c && typeof c.name === "string" && /^done$/i.test(c.name.trim())) {
      out.push(c.id);
    }
  }
  return out;
}

/** Migration: produce a normalized Board regardless of input shape. */
export function normalizeBoard(raw: unknown): Board {
  const now = Date.now();
  const r = (raw ?? {}) as Partial<Board> & Record<string, unknown>;

  const labels: Label[] = Array.isArray(r.labels)
    ? (r.labels as Label[]).filter(isLabel)
    : [];

  const customFields = Array.isArray(r.customFields)
    ? (r.customFields as Board["customFields"]).filter((f) => f && f.id && f.type)
    : [];

  // cardTypes: preserve existing if present and valid, else default.
  let cardTypes: CardTypeConfig[] = defaultCardTypes();
  if (Array.isArray(r.cardTypes)) {
    const provided = r.cardTypes as CardTypeConfig[];
    for (const cfg of provided) {
      if (!cfg || typeof cfg.type !== "string") continue;
      if (!ALL_CARD_TYPES.includes(cfg.type as CardType)) continue;
      const idx = cardTypes.findIndex((c) => c.type === cfg.type);
      if (idx >= 0) {
        cardTypes[idx] = {
          type: cfg.type as CardType,
          enabled: cfg.enabled !== false,
          label:
            typeof cfg.label === "string" && cfg.label.trim()
              ? cfg.label
              : CARD_TYPE_META[cfg.type as CardType].defaultLabel,
          customFields: Array.isArray(cfg.customFields)
            ? (cfg.customFields as Board["customFields"]).filter(
                (f) => f && f.id && f.type,
              )
            : [],
        };
      }
    }
  }

  const doneColumnIds = Array.isArray(r.doneColumnIds)
    ? (r.doneColumnIds as unknown[]).filter((x): x is string => typeof x === "string")
    : defaultDoneColumnIds(r);

  const columns = Array.isArray(r.columns)
    ? (r.columns as Board["columns"]).map((c) => ({
        id: c.id,
        name: c.name,
        cardIds: Array.isArray(c.cardIds) ? c.cardIds : [],
      }))
    : [];

  const cards: Record<string, Card> = {};
  if (r.cards && typeof r.cards === "object") {
    for (const [id, raw] of Object.entries(r.cards as Record<string, unknown>)) {
      cards[id] = normalizeCard(id, raw);
    }
  }

  return {
    id: typeof r.id === "string" ? r.id : cryptoRandomId(),
    name: typeof r.name === "string" ? r.name : "Untitled board",
    labels,
    customFields,
    cardTypes,
    doneColumnIds,
    columns,
    cards,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
    driveFileId: typeof r.driveFileId === "string" ? r.driveFileId : undefined,
    driveVersion: typeof r.driveVersion === "string" ? r.driveVersion : undefined,
  };
}

function normalizeCard(id: string, raw: unknown): Card {
  const r = (raw ?? {}) as Partial<Card> & Record<string, unknown>;
  const now = Date.now();
  const labelIds = Array.isArray(r.labelIds) ? (r.labelIds as string[]) : [];

  let boardFieldValues: CustomFieldValues = {};
  if (r.boardFieldValues && typeof r.boardFieldValues === "object") {
    boardFieldValues = r.boardFieldValues as CustomFieldValues;
  } else if (r.customFieldValues && typeof r.customFieldValues === "object") {
    boardFieldValues = r.customFieldValues as CustomFieldValues;
  }
  const typeFieldValues: CustomFieldValues =
    r.typeFieldValues && typeof r.typeFieldValues === "object"
      ? (r.typeFieldValues as CustomFieldValues)
      : {};

  const type: CardType =
    r.type === "epic" || r.type === "story" || r.type === "task" ? r.type : "task";

  let parentIds: string[] = [];
  if (Array.isArray(r.parentIds)) {
    parentIds = (r.parentIds as unknown[]).filter(
      (x): x is string => typeof x === "string",
    );
  } else if (typeof (r as Record<string, unknown>).parentId === "string") {
    const legacy = (r as Record<string, unknown>).parentId as string;
    if (legacy) parentIds = [legacy];
  }

  let descriptionHtml = typeof r.descriptionHtml === "string" ? r.descriptionHtml : "";
  if (!descriptionHtml && typeof (r as Record<string, unknown>).description === "string") {
    const legacy = (r as Record<string, unknown>).description as string;
    descriptionHtml = `<p>${escapeHtml(legacy)}</p>`;
  }

  return {
    id,
    type,
    title: typeof r.title === "string" ? r.title : "Untitled",
    descriptionHtml,
    labelIds,
    parentIds,
    startDate:
      typeof r.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate)
        ? r.startDate
        : null,
    dueDate:
      typeof r.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)
        ? r.dueDate
        : null,
    activity: Array.isArray(r.activity)
      ? (r.activity as unknown[]).filter(
          (e): e is ActivityEntry =>
            !!e &&
            typeof (e as { id?: unknown }).id === "string" &&
            typeof (e as { kind?: unknown }).kind === "string" &&
            typeof (e as { text?: unknown }).text === "string" &&
            typeof (e as { at?: unknown }).at === "number",
        )
      : [],
    comments: Array.isArray(r.comments)
      ? (r.comments as unknown[]).filter(
          (c): c is CommentEntry =>
            !!c &&
            typeof (c as { id?: unknown }).id === "string" &&
            typeof (c as { author?: unknown }).author === "string" &&
            typeof (c as { body?: unknown }).body === "string" &&
            typeof (c as { at?: unknown }).at === "number",
        )
      : [],
    boardFieldValues,
    typeFieldValues,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
}

function isLabel(x: unknown): x is Label {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as Label).id === "string" &&
    typeof (x as Label).name === "string" &&
    typeof (x as Label).color === "string"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Cryptographically-random id, URL-safe. */
export function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
