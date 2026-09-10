import { describe, it, expect } from "vitest";
import type { Board, Card } from "./types";
import { computeProgress, isCardInDoneColumn, countByType } from "./progress";

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

describe("isCardInDoneColumn", () => {
  it("returns false when card is not in a done column", () => {
    const board = makeBoard({
      columns: [{ id: "col-1", name: "To Do", cardIds: ["c1"] }],
      doneColumnIds: ["col-2"],
    });
    expect(isCardInDoneColumn(board, "c1")).toBe(false);
  });

  it("returns true when card is in a done column", () => {
    const board = makeBoard({
      columns: [{ id: "col-1", name: "Done", cardIds: ["c1"] }],
      doneColumnIds: ["col-1"],
    });
    expect(isCardInDoneColumn(board, "c1")).toBe(true);
  });

  it("returns false for non-existent card", () => {
    const board = makeBoard({ doneColumnIds: ["col-1"] });
    expect(isCardInDoneColumn(board, "no-such-card")).toBe(false);
  });
});

describe("computeProgress", () => {
  it("returns null percent for tasks (no children)", () => {
    const card = makeCard({ id: "t1", type: "task" });
    const board = makeBoard({
      columns: [{ id: "col-1", name: "To Do", cardIds: ["t1"] }],
      cards: { t1: card },
    });
    expect(computeProgress(card, board)).toEqual({
      total: 0,
      done: 0,
      percent: null,
    });
  });

  it("computes progress for a story with child tasks", () => {
    const story = makeCard({ id: "s1", type: "story" });
    const task1 = makeCard({ id: "t1", type: "task", parentIds: ["s1"] });
    const task2 = makeCard({ id: "t2", type: "task", parentIds: ["s1"] });
    const task3 = makeCard({ id: "t3", type: "task", parentIds: ["s1"] });

    const board = makeBoard({
      columns: [
        { id: "col-todo", name: "To Do", cardIds: ["s1", "t1"] },
        { id: "col-done", name: "Done", cardIds: ["t2", "t3"] },
      ],
      doneColumnIds: ["col-done"],
      cards: { s1: story, t1: task1, t2: task2, t3: task3 },
    });

    const result = computeProgress(story, board);
    expect(result.total).toBe(3);
    expect(result.done).toBe(2);
    expect(result.percent).toBe(67); // Math.round(2/3 * 100)
  });

  it("computes progress for an epic with child stories and their tasks", () => {
    const epic = makeCard({ id: "e1", type: "epic" });
    const story1 = makeCard({ id: "s1", type: "story", parentIds: ["e1"] });
    const story2 = makeCard({ id: "s2", type: "story", parentIds: ["e1"] });
    const task1 = makeCard({ id: "t1", type: "task", parentIds: ["s1"] });
    const task2 = makeCard({ id: "t2", type: "task", parentIds: ["s2"] });

    const board = makeBoard({
      columns: [
        { id: "col-todo", name: "To Do", cardIds: ["e1", "s1", "t1"] },
        { id: "col-done", name: "Done", cardIds: ["s2", "t2"] },
      ],
      doneColumnIds: ["col-done"],
      cards: { e1: epic, s1: story1, s2: story2, t1: task1, t2: task2 },
    });

    const result = computeProgress(epic, board);
    // 2 stories + 2 tasks = 4 total; s2 and t2 are done = 2 done
    expect(result.total).toBe(4);
    expect(result.done).toBe(2);
    expect(result.percent).toBe(50);
  });

  it("returns null percent when epic has no children", () => {
    const epic = makeCard({ id: "e1", type: "epic" });
    const board = makeBoard({
      columns: [{ id: "col-1", name: "To Do", cardIds: ["e1"] }],
      cards: { e1: epic },
    });
    expect(computeProgress(epic, board)).toEqual({
      total: 0,
      done: 0,
      percent: null,
    });
  });

  it("returns 100% when all children are done", () => {
    const story = makeCard({ id: "s1", type: "story" });
    const task1 = makeCard({ id: "t1", type: "task", parentIds: ["s1"] });

    const board = makeBoard({
      columns: [{ id: "done", name: "Done", cardIds: ["s1", "t1"] }],
      doneColumnIds: ["done"],
      cards: { s1: story, t1: task1 },
    });

    expect(computeProgress(story, board).percent).toBe(100);
  });
});

describe("countByType", () => {
  it("counts cards of each type", () => {
    const board = makeBoard({
      cards: {
        e1: makeCard({ id: "e1", type: "epic" }),
        e2: makeCard({ id: "e2", type: "epic" }),
        s1: makeCard({ id: "s1", type: "story" }),
        t1: makeCard({ id: "t1", type: "task" }),
        t2: makeCard({ id: "t2", type: "task" }),
        t3: makeCard({ id: "t3", type: "task" }),
      },
    });
    expect(countByType(board, "epic")).toBe(2);
    expect(countByType(board, "story")).toBe(1);
    expect(countByType(board, "task")).toBe(3);
  });

  it("returns 0 when no cards of the type exist", () => {
    const board = makeBoard({ cards: {} });
    expect(countByType(board, "epic")).toBe(0);
  });
});
