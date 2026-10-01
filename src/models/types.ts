// Core domain types for Kboard.
// All data is JSON-serializable and persisted to Google Drive.

/** Curated color palette used for labels and preset-list options.
 *
 *  Every entry is verified to reach >= 4.5:1 against at least one of the
 *  two foregrounds LabelPill picks between (#172b4d / #ffffff). Mid-tone
 *  colours that pass with neither were re-pitched — e.g. "red" was #eb5a46,
 *  which tops out at 4.09:1 and is now #d03a3a.
 *
 *  Re-verify with: npm run a11y:contrast  */
export const COLOR_PALETTE = [
  { id: "green",  value: "#61bd4f" },
  { id: "yellow", value: "#f2d600" },
  { id: "orange", value: "#ff9f1f" },
  { id: "red",    value: "#d03a3a" },
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

// ─── Card types (Epic / Story / Task) ────────────────────────────────

/** Card kind. */
export type CardType = "epic" | "story" | "task";

/** Configuration of a card type on a given board. */
export interface CardTypeConfig {
  type: CardType;
  enabled: boolean;
  label: string;          // user-overridable display label
  customFields: CustomField[]; // per-type fields (separate from board-level)
}

// ─── Filtering and saved views ─────────────────────────────────────

/** Which side(s) of a date to bound, for the relative date presets. */
export type DatePreset =
  | "overdue"
  | "today"
  | "tomorrow"
  | "this-week"
  | "next-week"
  | "next-30-days"
  | "no-date"
  | "before"
  | "after";

/**
 * A date filter. Exactly one of the two shapes is meaningful:
 * - `preset`  — a relative window ("overdue", "this week", …).
 * - `from`/`to` — explicit ISO YYYY-MM-DD bounds. Either may be omitted for
 *   an open-ended range; both present is a closed range.
 *
 * An absent DateFilter means "do not filter on this date". An *empty*
 * DateFilter is normalized away to absent so "no filter" has one
 * representation, not two.
 */
export interface DateFilter {
  preset?: DatePreset;
  from?: string;
  to?: string;
}

/**
 * A filter on one custom field. Which properties are meaningful depends on
 * the field's `type`:
 * - `preset_list` → `optionIds` (OR within)
 * - `boolean`     → `bool`
 * - `number` / `percentage` → `num` ({ min?, max? })
 * - `date`        → `date` ({ from?, to? })
 * - text types    → not filterable; a text field filter is ignored.
 */
export interface FieldFilter {
  /** The CustomField.id this filters on. */
  fieldId: string;
  optionIds?: string[];
  bool?: boolean;
  num?: { min?: number; max?: number };
  date?: { from?: string; to?: string };
}

/** Whether the filter targets done or not-done cards. */
export type DoneFilter = "done" | "not-done";

/**
 * A structured, persistable board filter.
 *
 * Every property is optional and every array defaults to empty, so an EMPTY
 * FilterState means "no filtering". That invariant is what makes `isFilterEmpty`
 * total and "Clear all" a single assignment.
 *
 * Predicates are AND-ed across properties; values within one property are
 * OR-ed. `cardTypes: [epic, story]` means "epic OR story"; combined with
 * `labelIds: [bug]` it means "(epic OR story) AND has label bug".
 *
 * Deliberately absent: title, description, comments. Those are searchable but
 * not filterable, and omitting the keys makes that structurally impossible
 * rather than a rule someone has to remember.
 */
export interface FilterState {
  cardTypes?: CardType[];
  labelIds?: string[];
  columnIds?: string[];
  fieldFilters?: FieldFilter[];
  startDate?: DateFilter;
  dueDate?: DateFilter;
  done?: DoneFilter;
}

/**
 * A named, persisted filter preset, scoped to ONE board.
 *
 * Views are board-scoped by design (no global views), so every id inside
 * `filter` — labelIds, columnIds, fieldId, optionIds — refers to an entity
 * owned by that same board. Nothing here needs cross-board id resolution.
 *
 * Note there is no `searchQuery`: a view stores a filter only. Persisting a
 * search term would make a recalled view silently hide most of the board.
 */
export interface SavedView {
  id: string;
  /** Unique per board, compared case-insensitively after trimming. */
  name: string;
  filter: FilterState;
  createdAt: number;
  updatedAt: number;
}

// ─── Activity log ───────────────────────────────────────────────────

/** The kind of change recorded in a card's activity log. */
export type ActivityKind =
  | "created"
  | "title_changed"
  | "description_changed"
  | "type_changed"
  | "labels_changed"
  | "parents_changed"
  | "start_date_changed"
  | "due_date_changed"
  | "moved"
  | "comment_added"
  | "checklist_added"
  | "checklist_renamed"
  | "checklist_deleted"
  | "checklist_item_added"
  | "checklist_item_renamed"
  | "checklist_item_toggled"
  | "checklist_item_deleted";

/** A single entry in a card's activity log. Append-only, system-generated. */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Human-readable summary, e.g. "Moved to 'In progress'". */
  text: string;
  /** Epoch milliseconds. */
  at: number;
}

/** A user-typed comment on a card. Ordered oldest-first in the data. */
export interface CommentEntry {
  id: string;
  author: string;
  authorPicture?: string;
  body: string;
  /** Epoch milliseconds. */
  at: number;
}

// ─── Checklists ───────────────────────────────────────────────────

/** A single line item inside a checklist. */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * A named list of items attached to a card. v1 supports exactly one
 * level of nesting: a checklist contains items, items don't have
 * sub-items. Multiple checklists per card are allowed (e.g. "Frontend
 * tasks" + "Backend tasks") but the chip on the card face surfaces
 * the first one.
 */
export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface Card {
  id: string;
  type: CardType;          // defaults to "task" via migration
  title: string;
  /** Sanitized HTML produced by Tiptap. */
  descriptionHtml: string;
  labelIds: string[];
  /** Multi-parent. Empty array = top-level. Each id must satisfy type constraints. */
  parentIds: string[];
  /** ISO date string (YYYY-MM-DD), or null if not set. */
  startDate: string | null;
  /** ISO date string (YYYY-MM-DD), or null if not set. */
  dueDate: string | null;
  /** Auto-generated audit log. Ordered oldest-first. */
  activity: ActivityEntry[];
  /** User-typed comments. Ordered oldest-first. */
  comments: CommentEntry[];
  /** Checklists attached to this card. v1: flat (no nested items). */
  checklists: Checklist[];
  /** Board-level field values (fields on the board's `customFields`). */
  boardFieldValues: CustomFieldValues;
  /** Per-type field values (fields on the type's `cardTypes[i].customFields`). */
  typeFieldValues: CustomFieldValues;
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
  /** Board-level fields shared by all card types. */
  customFields: CustomField[];
  /** Per-type configurations (epic / story / task). */
  cardTypes: CardTypeConfig[];
  // IDs of columns that count as "done" for progress calculation.
  doneColumnIds: string[];
  /**
   * Named filter presets. Optional so board files written before saved views
   * existed need no rewrite; `normalizeBoard` defaults it to `[]`.
   *
   * Ordering is creation order. Drag-reordering views is an explicit non-goal.
   */
  savedViews?: SavedView[];
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
