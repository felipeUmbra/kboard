import { describe, it, expect } from "vitest";
import {
  filterSummary,
  isFilterEmpty,
  matchesFilter,
  matchesSearch,
  visibleCardIds,
} from "./filters";
import type { Board, Card, CustomField } from "./types";

/** Fixed "today" so date presets are clock-independent. */
const TODAY = () => "2026-10-01";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    type: "task",
    title: "Test Card",
    descriptionHtml: "",
    labelIds: [],
    parentIds: [],
    startDate: null,
    dueDate: null,
    activity: [],
    comments: [],
    checklists: [],
    boardFieldValues: {},
    typeFieldValues: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: "board-1",
    name: "Test Board",
    labels: [],
    customFields: [],
    cardTypes: [
      { type: "epic", enabled: true, label: "Epic", customFields: [] },
      { type: "story", enabled: true, label: "Story", customFields: [] },
      { type: "task", enabled: true, label: "Task", customFields: [] },
    ],
    doneColumnIds: [],
    columns: [],
    cards: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** A board with three columns: todo, doing, done (done flagged). */
function boardWithColumns(overrides: Partial<Board> = {}): Board {
  return makeBoard({
    columns: [
      { id: "col-todo", name: "To Do", cardIds: ["c1", "c2"] },
      { id: "col-doing", name: "Doing", cardIds: ["c3"] },
      { id: "col-done", name: "Done", cardIds: [] },
    ],
    doneColumnIds: ["col-done"],
    ...overrides,
  });
}

const presetField: CustomField = {
  id: "fld-priority",
  name: "Priority",
  type: "preset_list",
  options: [
    { id: "opt-high", name: "High", color: "#d03a3a" },
    { id: "opt-low", name: "Low", color: "#61bd4f" },
  ],
};

describe("isFilterEmpty", () => {
  it("is true for a completely empty filter", () => {
    expect(isFilterEmpty({})).toBe(true);
  });

  it("is true when every array is empty", () => {
    expect(
      isFilterEmpty({ cardTypes: [], labelIds: [], columnIds: [], fieldFilters: [] }),
    ).toBe(true);
  });

  it("is true for an empty DateFilter object", () => {
    expect(isFilterEmpty({ startDate: {}, dueDate: {} })).toBe(true);
  });

  it("is false when any dimension is populated", () => {
    expect(isFilterEmpty({ cardTypes: ["task"] })).toBe(false);
    expect(isFilterEmpty({ labelIds: ["l1"] })).toBe(false);
    expect(isFilterEmpty({ columnIds: ["c1"] })).toBe(false);
    expect(isFilterEmpty({ fieldFilters: [{ fieldId: "f1" }] })).toBe(false);
    expect(isFilterEmpty({ done: "done" })).toBe(false);
  });

  it("is false for a date filter with any bound", () => {
    expect(isFilterEmpty({ startDate: { preset: "today" } })).toBe(false);
    expect(isFilterEmpty({ dueDate: { from: "2026-01-01" } })).toBe(false);
    expect(isFilterEmpty({ dueDate: { to: "2026-01-01" } })).toBe(false);
  });
});

describe("matchesSearch", () => {
  it("matches everything for an empty or whitespace query", () => {
    const card = makeCard();
    const b = makeBoard();
    expect(matchesSearch(card, b, "")).toBe(true);
    expect(matchesSearch(card, b, "   ")).toBe(true);
  });

  it("matches on the title, case-insensitively", () => {
    const card = makeCard({ title: "Fix Login Redirect" });
    expect(matchesSearch(card, makeBoard(), "login")).toBe(true);
    expect(matchesSearch(card, makeBoard(), "LOGIN")).toBe(true);
  });

  it("matches on description text, ignoring markup", () => {
    const card = makeCard({
      descriptionHtml: "<p>The <strong>session</strong> param is dropped.</p>",
    });
    expect(matchesSearch(card, makeBoard(), "session")).toBe(true);
  });

  it("does not match on the description's markup", () => {
    // The bug htmlToText exists to prevent.
    const card = makeCard({ descriptionHtml: "<p>text</p>" });
    expect(matchesSearch(card, makeBoard(), "<p>")).toBe(false);
    expect(matchesSearch(card, makeBoard(), "href")).toBe(false);
  });

  it("matches on a label NAME, not its id", () => {
    const b = makeBoard({ labels: [{ id: "lbl-bug", name: "Regression", color: "#d03a3a" }] });
    const card = makeCard({ labelIds: ["lbl-bug"] });
    expect(matchesSearch(card, b, "regression")).toBe(true);
    expect(matchesSearch(card, b, "lbl-")).toBe(false);
  });

  it("ignores a label id that no longer exists", () => {
    const b = makeBoard();
    const card = makeCard({ labelIds: ["deleted-label"] });
    expect(matchesSearch(card, b, "anything")).toBe(false);
  });

  it("matches on the card type label", () => {
    const card = makeCard({ type: "story" });
    expect(matchesSearch(card, makeBoard(), "story")).toBe(true);
  });

  it("matches on a user-overridable type label, not the enum", () => {
    const b = makeBoard({
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [] },
        { type: "story", enabled: true, label: "User Story", customFields: [] },
        { type: "task", enabled: true, label: "Task", customFields: [] },
      ],
    });
    const card = makeCard({ type: "story" });
    expect(matchesSearch(card, b, "user story")).toBe(true);
  });

  it("falls back to the raw type when no config exists", () => {
    const b = makeBoard({ cardTypes: [] });
    const card = makeCard({ type: "epic" });
    expect(matchesSearch(card, b, "epic")).toBe(true);
  });

  it("falls back to the raw type when the config label is blank", () => {
    // A blank label must not erase the card's type term from the haystack.
    const b = makeBoard({
      cardTypes: [
        { type: "epic", enabled: true, label: "   ", customFields: [] },
        { type: "story", enabled: true, label: "Story", customFields: [] },
        { type: "task", enabled: true, label: "Task", customFields: [] },
      ],
    });
    const card = makeCard({ type: "epic" });
    expect(matchesSearch(card, b, "epic")).toBe(true);
  });

  it("matches text spanning two fields via the joined haystack", () => {
    const b = makeBoard({ labels: [{ id: "l1", name: "Urgent", color: "#d03a3a" }] });
    const card = makeCard({ title: "Fix", labelIds: ["l1"] });
    expect(matchesSearch(card, b, "fix urgent")).toBe(true);
  });

  it("returns false for a non-matching query", () => {
    expect(matchesSearch(makeCard({ title: "Alpha" }), makeBoard(), "zeta")).toBe(false);
  });

  it("handles a card with an empty description", () => {
    const card = makeCard({ descriptionHtml: "" });
    expect(matchesSearch(card, makeBoard(), "test")).toBe(true);
  });
});

describe("matchesFilter — empty filter", () => {
  it("matches every card when the filter is empty", () => {
    expect(matchesFilter(makeCard(), makeBoard(), {})).toBe(true);
  });
});

describe("matchesFilter — card type", () => {
  it("matches a card whose type is selected", () => {
    const card = makeCard({ type: "epic" });
    expect(matchesFilter(card, makeBoard(), { cardTypes: ["epic"] })).toBe(true);
  });

  it("excludes a card whose type is not selected", () => {
    const card = makeCard({ type: "epic" });
    expect(matchesFilter(card, makeBoard(), { cardTypes: ["task"] })).toBe(false);
  });

  it("ORs the selected types", () => {
    const card = makeCard({ type: "story" });
    expect(matchesFilter(card, makeBoard(), { cardTypes: ["epic", "story"] })).toBe(true);
  });
});

describe("matchesFilter — labels", () => {
  it("requires every selected label (AND semantics)", () => {
    const card = makeCard({ labelIds: ["l1"] });
    const b = makeBoard({
      labels: [
        { id: "l1", name: "Bug", color: "#d03a3a" },
        { id: "l2", name: "Urgent", color: "#ff9f1f" },
      ],
    });
    expect(matchesFilter(card, b, { labelIds: ["l1"] })).toBe(true);
    expect(matchesFilter(card, b, { labelIds: ["l1", "l2"] })).toBe(false);
  });

  it("matches a card carrying all selected labels", () => {
    const card = makeCard({ labelIds: ["l1", "l2"] });
    const b = makeBoard({ labels: [{ id: "l1", name: "Bug", color: "#d03a3a" }] });
    expect(matchesFilter(card, b, { labelIds: ["l1", "l2"] })).toBe(true);
  });
});

describe("matchesFilter — columns", () => {
  it("matches a card in a selected column", () => {
    expect(
      matchesFilter(makeCard({ id: "c1" }), boardWithColumns(), { columnIds: ["col-todo"] }),
    ).toBe(true);
  });

  it("excludes a card in a non-selected column", () => {
    expect(
      matchesFilter(makeCard({ id: "c1" }), boardWithColumns(), { columnIds: ["col-doing"] }),
    ).toBe(false);
  });

  it("excludes a card that belongs to no column", () => {
    expect(
      matchesFilter(makeCard({ id: "orphan" }), boardWithColumns(), { columnIds: ["col-todo"] }),
    ).toBe(false);
  });
});

describe("matchesFilter — done state", () => {
  it("matches a done card with done=done", () => {
    const b = boardWithColumns();
    b.columns[2].cardIds = ["c4"];
    expect(matchesFilter(makeCard({ id: "c4" }), b, { done: "done" })).toBe(true);
  });

  it("excludes a not-done card with done=done", () => {
    expect(
      matchesFilter(makeCard({ id: "c1" }), boardWithColumns(), { done: "done" }),
    ).toBe(false);
  });

  it("matches a not-done card with done=not-done", () => {
    expect(
      matchesFilter(makeCard({ id: "c1" }), boardWithColumns(), { done: "not-done" }),
    ).toBe(true);
  });

  it("excludes a done card with done=not-done", () => {
    const b = boardWithColumns();
    b.columns[2].cardIds = ["c4"];
    expect(matchesFilter(makeCard({ id: "c4" }), b, { done: "not-done" })).toBe(false);
  });
});

describe("matchesFilter — preset_list field (priority)", () => {
  const b = () => makeBoard({ customFields: [presetField] });

  it("matches when the card holds a selected option", () => {
    const card = makeCard({ boardFieldValues: { "fld-priority": "opt-high" } });
    const board = b();
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toBe(true);
  });

  it("excludes when the card holds a different option", () => {
    const card = makeCard({ boardFieldValues: { "fld-priority": "opt-low" } });
    const board = b();
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toBe(false);
  });

  it("ORs selected options", () => {
    const card = makeCard({ boardFieldValues: { "fld-priority": "opt-low" } });
    const board = b();
    expect(
      matchesFilter(card, board, {
        fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high", "opt-low"] }],
      }),
    ).toBe(true);
  });

  it("excludes a card with no value", () => {
    const board = b();
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toBe(false);
  });

  it("ignores a non-string value", () => {
    const card = makeCard({ boardFieldValues: { "fld-priority": 5 as never } });
    const board = b();
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toBe(false);
  });

  it("is inert when no options are selected", () => {
    const card = makeCard({ boardFieldValues: { "fld-priority": "opt-low" } });
    expect(
      matchesFilter(card, b(), { fieldFilters: [{ fieldId: "fld-priority" }] }),
    ).toBe(true);
  });

  it("reads a per-type field value too", () => {
    const board = makeBoard({
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [] },
        { type: "story", enabled: true, label: "Story", customFields: [presetField] },
        { type: "task", enabled: true, label: "Task", customFields: [] },
      ],
    });
    const card = makeCard({ typeFieldValues: { "fld-priority": "opt-high" } });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toBe(true);
  });

  it("prefers a board-level value over a type-level one", () => {
    const board = makeBoard({
      customFields: [presetField],
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [] },
        { type: "story", enabled: true, label: "Story", customFields: [presetField] },
        { type: "task", enabled: true, label: "Task", customFields: [] },
      ],
    });
    const card = makeCard({
      boardFieldValues: { "fld-priority": "opt-high" },
      typeFieldValues: { "fld-priority": "opt-low" },
    });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toBe(true);
  });
});

describe("matchesFilter — inert field cases", () => {
  it("is inert for an unknown fieldId", () => {
    // A deleted field must not hide the whole board.
    expect(
      matchesFilter(makeCard(), makeBoard(), { fieldFilters: [{ fieldId: "gone", optionIds: ["x"] }] }),
    ).toBe(true);
  });

  it("is inert for an unrecognized field TYPE", () => {
    // normalizeBoard only checks that a CustomField has an id and a truthy
    // type — a hand-edited board can carry a type we don't know. We can't know
    // how to compare its value, so we don't constrain on it.
    const board = makeBoard({
      customFields: [{ id: "fld-weird", name: "Weird", type: "color" as never }],
    });
    expect(
      matchesFilter(makeCard({ boardFieldValues: { "fld-weird": "red" } }), board, {
        fieldFilters: [{ fieldId: "fld-weird", optionIds: ["x"] }],
      }),
    ).toBe(true);
  });

  it("is inert for a text field, which is not filterable", () => {
    const board = makeBoard({
      customFields: [{ id: "fld-text", name: "Notes", type: "short_text" }],
    });
    expect(
      matchesFilter(makeCard({ boardFieldValues: { "fld-text": "hello" } }), board, {
        fieldFilters: [{ fieldId: "fld-text", optionIds: ["x"] }],
      }),
    ).toBe(true);
  });

  it("ANDs multiple field filters", () => {
    const board = makeBoard({ customFields: [presetField] });
    const card = makeCard({ boardFieldValues: { "fld-priority": "opt-high" } });
    expect(
      matchesFilter(card, board, {
        fieldFilters: [
          { fieldId: "fld-priority", optionIds: ["opt-high"] },
          { fieldId: "missing", optionIds: ["y"] },
        ],
      }),
    ).toBe(true);
    expect(
      matchesFilter(card, board, {
        fieldFilters: [
          { fieldId: "fld-priority", optionIds: ["opt-low"] },
          { fieldId: "missing", optionIds: ["y"] },
        ],
      }),
    ).toBe(false);
  });
});

describe("matchesFilter — boolean field", () => {
  const boolField: CustomField = { id: "fld-flag", name: "Flag", type: "boolean" };

  it("matches true against true", () => {
    const board = makeBoard({ customFields: [boolField] });
    const card = makeCard({ boardFieldValues: { "fld-flag": true } });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-flag", bool: true }] }),
    ).toBe(true);
  });

  it("matches a missing value against false", () => {
    // Absence is falsy, so filtering "No" should include an unset flag.
    const board = makeBoard({ customFields: [boolField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-flag", bool: false }] }),
    ).toBe(true);
  });

  it("excludes a missing value against true", () => {
    const board = makeBoard({ customFields: [boolField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-flag", bool: true }] }),
    ).toBe(false);
  });

  it("is inert when bool is absent", () => {
    const board = makeBoard({ customFields: [boolField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-flag" }] }),
    ).toBe(true);
  });
});

describe("matchesFilter — number field", () => {
  const numField: CustomField = { id: "fld-points", name: "Points", type: "number" };

  it("matches within a closed range", () => {
    const board = makeBoard({ customFields: [numField] });
    const card = makeCard({ boardFieldValues: { "fld-points": 5 } });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-points", num: { min: 1, max: 8 } }] }),
    ).toBe(true);
  });

  it("excludes below the minimum", () => {
    const board = makeBoard({ customFields: [numField] });
    const card = makeCard({ boardFieldValues: { "fld-points": 0 } });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-points", num: { min: 1 } }] }),
    ).toBe(false);
  });

  it("excludes above the maximum", () => {
    const board = makeBoard({ customFields: [numField] });
    const card = makeCard({ boardFieldValues: { "fld-points": 13 } });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-points", num: { max: 8 } }] }),
    ).toBe(false);
  });

  it("matches a missing value when the range is fully open", () => {
    const board = makeBoard({ customFields: [numField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-points", num: {} }] }),
    ).toBe(true);
  });

  it("excludes a missing value when a bound is present", () => {
    const board = makeBoard({ customFields: [numField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-points", num: { min: 1 } }] }),
    ).toBe(false);
  });

  it("is inert when num is absent", () => {
    const board = makeBoard({ customFields: [numField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-points" }] }),
    ).toBe(true);
  });

  it("treats a percentage field the same way", () => {
    const board = makeBoard({
      customFields: [{ id: "fld-pct", name: "Done", type: "percentage" }],
    });
    const card = makeCard({ boardFieldValues: { "fld-pct": 50 } });
    expect(
      matchesFilter(card, board, { fieldFilters: [{ fieldId: "fld-pct", num: { min: 100 } }] }),
    ).toBe(false);
  });
});

describe("matchesFilter — date custom field", () => {
  const dateField: CustomField = { id: "fld-date", name: "Kickoff", type: "date" };

  it("matches within an explicit range", () => {
    const board = makeBoard({ customFields: [dateField] });
    const card = makeCard({ boardFieldValues: { "fld-date": "2026-10-05" } });
    expect(
      matchesFilter(card, board, {
        fieldFilters: [{ fieldId: "fld-date", date: { from: "2026-10-01", to: "2026-10-31" } }],
      }),
    ).toBe(true);
  });

  it("is inert when the field date filter is empty", () => {
    const board = makeBoard({ customFields: [dateField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-date", date: {} }] }),
    ).toBe(true);
  });

  it("is inert when a date field filter omits the date object entirely", () => {
    // A half-built filter with only a fieldId must not constrain the card.
    const board = makeBoard({ customFields: [dateField] });
    expect(
      matchesFilter(makeCard(), board, { fieldFilters: [{ fieldId: "fld-date" }] }),
    ).toBe(true);
  });
});

describe("matchesFilter — start/due date presets", () => {
  it("matches today", () => {
    const card = makeCard({ dueDate: "2026-10-01" });
    expect(matchesFilter(card, makeBoard(), { dueDate: { preset: "today" } }, TODAY)).toBe(true);
  });

  it("excludes a different day from today", () => {
    const card = makeCard({ dueDate: "2026-10-02" });
    expect(matchesFilter(card, makeBoard(), { dueDate: { preset: "today" } }, TODAY)).toBe(false);
  });

  it("matches tomorrow", () => {
    const card = makeCard({ startDate: "2026-10-02" });
    expect(matchesFilter(card, makeBoard(), { startDate: { preset: "tomorrow" } }, TODAY)).toBe(true);
  });

  it("matches overdue as anything before today", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "2026-09-30" }), makeBoard(), { dueDate: { preset: "overdue" } }, TODAY),
    ).toBe(true);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { preset: "overdue" } }, TODAY),
    ).toBe(false);
  });

  it("matches this week", () => {
    // 2026-10-01 is a Thursday; the Monday-anchored week is 09-28..10-04.
    expect(
      matchesFilter(makeCard({ dueDate: "2026-09-29" }), makeBoard(), { dueDate: { preset: "this-week" } }, TODAY),
    ).toBe(true);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-10" }), makeBoard(), { dueDate: { preset: "this-week" } }, TODAY),
    ).toBe(false);
  });

  it("matches next week", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-08" }), makeBoard(), { dueDate: { preset: "next-week" } }, TODAY),
    ).toBe(true);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { preset: "next-week" } }, TODAY),
    ).toBe(false);
  });

  it("matches next 30 days", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-20" }), makeBoard(), { dueDate: { preset: "next-30-days" } }, TODAY),
    ).toBe(true);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-12-01" }), makeBoard(), { dueDate: { preset: "next-30-days" } }, TODAY),
    ).toBe(false);
  });

  it("matches a null date only for the no-date preset", () => {
    expect(matchesFilter(makeCard(), makeBoard(), { dueDate: { preset: "no-date" } }, TODAY)).toBe(true);
    expect(matchesFilter(makeCard(), makeBoard(), { dueDate: { preset: "today" } }, TODAY)).toBe(false);
  });

  it("treats before/after with no bound as inert", () => {
    // The bound lives in from/to; without one there is nothing to apply.
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { preset: "before" } }, TODAY),
    ).toBe(true);
  });

  it("applies before/after alongside explicit bounds", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-20" }), makeBoard(), { dueDate: { from: "2026-10-10" } }, TODAY),
    ).toBe(true);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-05" }), makeBoard(), { dueDate: { from: "2026-10-10" } }, TODAY),
    ).toBe(false);
  });

  it("excludes a card whose start date falls outside the filter", () => {
    // The start-date predicate must be able to reject, not only accept —
    // otherwise a "starts today" filter would silently show everything.
    expect(
      matchesFilter(makeCard({ startDate: "2026-10-05" }), makeBoard(), { startDate: { preset: "today" } }, TODAY),
    ).toBe(false);
  });

  it("applies an upper bound", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-05" }), makeBoard(), { dueDate: { to: "2026-10-10" } }, TODAY),
    ).toBe(true);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-20" }), makeBoard(), { dueDate: { to: "2026-10-10" } }, TODAY),
    ).toBe(false);
  });

  it("excludes a null date when an explicit bound is set", () => {
    expect(
      matchesFilter(makeCard(), makeBoard(), { dueDate: { from: "2026-10-01" } }, TODAY),
    ).toBe(false);
  });

  it("includes a null date when no date filter is active", () => {
    expect(matchesFilter(makeCard(), makeBoard(), { cardTypes: ["task"] }, TODAY)).toBe(true);
  });

  it("excludes a syntactically invalid stored date", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "not-a-date" }), makeBoard(), { dueDate: { preset: "today" } }, TODAY),
    ).toBe(false);
  });

  it("excludes an impossible calendar date", () => {
    // 2026-02-30 parses as a shape but is not a real day.
    expect(
      matchesFilter(makeCard({ dueDate: "2026-02-30" }), makeBoard(), { dueDate: { preset: "today" } }, TODAY),
    ).toBe(false);
  });

  it("refuses to match against a malformed bound rather than comparing strings", () => {
    // Lexicographic comparison would make "2026-10-01" < "2026-01-32" true and
    // silently widen the range. An invalid bound matches nothing instead.
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { from: "2026-13-01" } }, TODAY),
    ).toBe(false);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { from: "2026-01-32" } }, TODAY),
    ).toBe(false);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { to: "not-a-date" } }, TODAY),
    ).toBe(false);
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { to: "2026-02-30" } }, TODAY),
    ).toBe(false);
  });

  it("still matches a valid bound against an otherwise valid card", () => {
    // Guards the guard: the bounds check must not reject good input.
    expect(
      matchesFilter(makeCard({ dueDate: "2026-10-01" }), makeBoard(), { dueDate: { from: "2026-09-01" } }, TODAY),
    ).toBe(true);
  });

  it("excludes a non-string stored date", () => {
    const card = makeCard({ dueDate: 12345 as never });
    expect(matchesFilter(card, makeBoard(), { dueDate: { preset: "today" } }, TODAY)).toBe(false);
  });

  it("excludes an invalid stored date for explicit bounds too", () => {
    expect(
      matchesFilter(makeCard({ dueDate: "bad" }), makeBoard(), { dueDate: { from: "2026-01-01" } }, TODAY),
    ).toBe(false);
  });

  it("handles a preset list wrapped around a year boundary", () => {
    // 2026-12-31 is a Thursday; "this week" must roll into January 2027.
    const ny = () => "2026-12-31";
    expect(
      matchesFilter(makeCard({ dueDate: "2027-01-02" }), makeBoard(), { dueDate: { preset: "this-week" } }, ny),
    ).toBe(true);
  });

  it("handles a Sunday, where the week starts on the preceding Monday", () => {
    const sunday = () => "2026-10-04";
    expect(
      matchesFilter(makeCard({ dueDate: "2026-09-29" }), makeBoard(), { dueDate: { preset: "this-week" } }, sunday),
    ).toBe(true);
  });
});

describe("visibleCardIds", () => {
  it("returns null when nothing is filtered, as a fast path", () => {
    const b = makeBoard({ cards: { a: makeCard({ id: "a" }) } });
    expect(visibleCardIds(b, "", {})).toBeNull();
  });

  it("returns null for a whitespace-only query", () => {
    const b = makeBoard({ cards: { a: makeCard({ id: "a" }) } });
    expect(visibleCardIds(b, "   ", {})).toBeNull();
  });

  it("returns a set of every card when only a filter is set and all match", () => {
    const b = makeBoard({ cards: { a: makeCard({ id: "a", type: "task" }) } });
    const out = visibleCardIds(b, "", { cardTypes: ["task"] });
    expect(out).toBeInstanceOf(Set);
    expect([...(out ?? [])]).toEqual(["a"]);
  });

  it("filters by search", () => {
    const b = makeBoard({
      cards: {
        a: makeCard({ id: "a", title: "Alpha" }),
        b: makeCard({ id: "b", title: "Beta" }),
      },
    });
    expect([...(visibleCardIds(b, "alpha", {}) ?? [])]).toEqual(["a"]);
  });

  it("ANDs search and filter together", () => {
    const b = makeBoard({
      cards: {
        a: makeCard({ id: "a", title: "Alpha", type: "task" }),
        b: makeCard({ id: "b", title: "Alpha", type: "epic" }),
      },
    });
    expect([...(visibleCardIds(b, "alpha", { cardTypes: ["task"] }) ?? [])]).toEqual(["a"]);
  });

  it("returns an empty set when nothing matches", () => {
    const b = makeBoard({ cards: { a: makeCard({ id: "a", title: "Alpha" }) } });
    expect(visibleCardIds(b, "zzz", {})?.size).toBe(0);
  });

  it("returns an empty set for an empty board", () => {
    expect(visibleCardIds(makeBoard(), "x", {})?.size).toBe(0);
  });

  it("uses the injected today for date presets", () => {
    const b = makeBoard({ cards: { a: makeCard({ id: "a", dueDate: "2026-10-01" }) } });
    expect(visibleCardIds(b, "", { dueDate: { preset: "today" } }, TODAY)?.size).toBe(1);
    expect(visibleCardIds(b, "", { dueDate: { preset: "today" } }, () => "2026-11-01")?.size).toBe(0);
  });
});

describe("filterSummary", () => {
  it("returns an empty array for an empty filter", () => {
    expect(filterSummary(makeBoard(), {})).toEqual([]);
  });

  it("summarizes card types by their display label", () => {
    expect(filterSummary(makeBoard(), { cardTypes: ["epic"] })).toEqual(["Type: Epic"]);
  });

  it("falls back to the raw type when the config is missing", () => {
    expect(filterSummary(makeBoard({ cardTypes: [] }), { cardTypes: ["epic"] })).toEqual([
      "Type: epic",
    ]);
  });

  it("summarizes labels by name", () => {
    const b = makeBoard({ labels: [{ id: "l1", name: "Bug", color: "#d03a3a" }] });
    expect(filterSummary(b, { labelIds: ["l1"] })).toEqual(["Labels: Bug"]);
  });

  it("falls back to the id for an unknown label", () => {
    expect(filterSummary(makeBoard(), { labelIds: ["gone"] })).toEqual(["Labels: gone"]);
  });

  it("summarizes columns by name", () => {
    const b = boardWithColumns();
    expect(filterSummary(b, { columnIds: ["col-todo"] })).toEqual(["Columns: To Do"]);
  });

  it("falls back to the id for an unknown column", () => {
    expect(filterSummary(makeBoard(), { columnIds: ["gone"] })).toEqual(["Columns: gone"]);
  });

  it("summarizes a preset_list field by option name", () => {
    const b = makeBoard({ customFields: [presetField] });
    expect(
      filterSummary(b, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["opt-high"] }] }),
    ).toEqual(["Priority: High"]);
  });

  it("falls back to the option id when unknown", () => {
    const b = makeBoard({ customFields: [presetField] });
    expect(
      filterSummary(b, { fieldFilters: [{ fieldId: "fld-priority", optionIds: ["ghost"] }] }),
    ).toEqual(["Priority: ghost"]);
  });

  it("skips a field filter whose field no longer exists", () => {
    expect(
      filterSummary(makeBoard(), { fieldFilters: [{ fieldId: "gone", optionIds: ["x"] }] }),
    ).toEqual([]);
  });

  it("summarizes a boolean field", () => {
    const b = makeBoard({ customFields: [{ id: "f", name: "Flag", type: "boolean" }] });
    expect(filterSummary(b, { fieldFilters: [{ fieldId: "f", bool: true }] })).toEqual([
      "Flag: Yes",
    ]);
    expect(filterSummary(b, { fieldFilters: [{ fieldId: "f", bool: false }] })).toEqual([
      "Flag: No",
    ]);
  });

  it("summarizes numeric ranges", () => {
    const b = makeBoard({ customFields: [{ id: "n", name: "Points", type: "number" }] });
    const sum = (num: { min?: number; max?: number }) =>
      filterSummary(b, { fieldFilters: [{ fieldId: "n", num }] })[0];
    expect(sum({ min: 1, max: 8 })).toBe("Points: 1–8");
    expect(sum({ min: 1 })).toBe("Points: ≥ 1");
    expect(sum({ max: 8 })).toBe("Points: ≤ 8");
    expect(sum({})).toBe("Points: ");
  });

  it("summarizes date field ranges", () => {
    const b = makeBoard({ customFields: [{ id: "d", name: "Kickoff", type: "date" }] });
    const sum = (date: { from?: string; to?: string }) =>
      filterSummary(b, { fieldFilters: [{ fieldId: "d", date }] })[0];
    expect(sum({ from: "2026-01-01", to: "2026-02-01" })).toBe("Kickoff: 2026-01-01 → 2026-02-01");
    expect(sum({ from: "2026-01-01" })).toBe("Kickoff: from 2026-01-01");
    expect(sum({ to: "2026-02-01" })).toBe("Kickoff: until 2026-02-01");
    expect(sum({})).toBe("Kickoff: ");
  });

  it("summarizes a start date preset", () => {
    expect(filterSummary(makeBoard(), { startDate: { preset: "this-week" } })).toEqual([
      "Start: this week",
    ]);
  });

  it("summarizes an explicit due range", () => {
    expect(
      filterSummary(makeBoard(), { dueDate: { from: "2026-01-01", to: "2026-02-01" } }),
    ).toEqual(["Due: 2026-01-01 → 2026-02-01"]);
  });

  it("summarizes an open due range from only", () => {
    expect(filterSummary(makeBoard(), { dueDate: { from: "2026-01-01" } })).toEqual([
      "Due: from 2026-01-01",
    ]);
  });

  it("summarizes an open due range to only", () => {
    expect(filterSummary(makeBoard(), { dueDate: { to: "2026-02-01" } })).toEqual([
      "Due: until 2026-02-01",
    ]);
  });

  it("summarizes the done state", () => {
    expect(filterSummary(makeBoard(), { done: "done" })).toEqual(["Done"]);
    expect(filterSummary(makeBoard(), { done: "not-done" })).toEqual(["Not done"]);
  });
});