import type { Board, Card, CustomFieldValues, Label } from "./types";

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
  const customFieldValues: CustomFieldValues =
    r.customFieldValues && typeof r.customFieldValues === "object"
      ? (r.customFieldValues as CustomFieldValues)
      : {};

  // Backwards-compat: if legacy `description` (string) exists, wrap in <p>.
  let descriptionHtml = typeof r.descriptionHtml === "string" ? r.descriptionHtml : "";
  if (!descriptionHtml && typeof (r as Record<string, unknown>).description === "string") {
    const legacy = (r as Record<string, unknown>).description as string;
    descriptionHtml = `<p>${escapeHtml(legacy)}</p>`;
  }

  return {
    id,
    title: typeof r.title === "string" ? r.title : "Untitled",
    descriptionHtml,
    labelIds,
    customFieldValues,
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
