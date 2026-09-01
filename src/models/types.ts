// Core domain types for Kboard.
// All data is JSON-serializable and persisted to Google Drive.

/** Curated color palette used for labels and preset-list options. */
export const COLOR_PALETTE = [
  { id: "green",  value: "#61bd4f" },
  { id: "yellow", value: "#f2d600" },
  { id: "orange", value: "#ff9f1f" },
  { id: "red",    value: "#eb5a46" },
  { id: "purple", value: "#c377e0" },
  { id: "blue",   value: "#0079bf" },
  { id: "cyan",   value: "#00c2e0" },
  { id: "lime",   value: "#51e898" },
  { id: "pink",   value: "#ff78cb" },
  { id: "dark",   value: "#344563" },
  { id: "grey",   value: "#b3bac5" },
  { id: "gold",   value: "#fbd86f" },
] as const;

export type ColorId = (typeof COLOR_PALETTE)[number]["id"];

export interface Label {
  id: string;
  name: string;
  color: string; // hex
}

/** All supported custom-field types. */
export type FieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "percentage"
  | "boolean"
  | "date"
  | "preset_list";

export interface PresetOption {
  id: string;
  name: string;
  color: string; // hex
}

export interface CustomField {
  id: string;
  name: string;
  type: FieldType;
  /** For preset_list: list of options. Card stores option.id. */
  options?: PresetOption[];
  /** For number: display unit suffix (e.g. "h", "$"). */
  unit?: string;
  /** For number / percentage: decimal places to display. */
  decimals?: number;
}

/**
 * Custom field values keyed by field.id.
 * - short_text, long_text: string
 * - number, percentage: number
 * - boolean: boolean
 * - date: string (ISO YYYY-MM-DD)
 * - preset_list: string (option.id)
 */
export type CustomFieldValues = Record<string, string | number | boolean>;

export interface Card {
  id: string;
  title: string;
  /** Sanitized HTML produced by Tiptap. */
  descriptionHtml: string;
  labelIds: string[];
  customFieldValues: CustomFieldValues;
  createdAt: number;
  updatedAt: number;
}

export interface Column {
  id: string;
  name: string;
  cardIds: string[]; // ordered, references Card.id
}

export interface Board {
  id: string;
  name: string;
  labels: Label[];
  customFields: CustomField[];
  columns: Column[];
  cards: Record<string, Card>;
  createdAt: number;
  updatedAt: number;
  /** Drive file id, set after first save. */
  driveFileId?: string;
  /** ETag for optimistic concurrency. */
  driveVersion?: string;
}

export interface BoardSummary {
  id: string;
  name: string;
  updatedAt: number;
  driveFileId: string;
}

/** Profile information returned by Google. */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  picture?: string;
}
