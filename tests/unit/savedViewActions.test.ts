import { describe, expect, it } from "vitest";
import {
  deleteView,
  findView,
  renameView,
  saveView,
  updateView,
} from "../../src/state/savedViewActions";
import type { Board, FilterState, SavedView } from "../../src/models/types";

function boardWith(views?: SavedView[]): Board {
  const board = { id: "b1", name: "Board", columns: [], cards: {} } as unknown as Board;
  return views ? { ...board, savedViews: views } : board;
}

function view(id: string, name: string, filter: FilterState = {}): SavedView {
  return { id, name, filter, createdAt: 1, updatedAt: 1 };
}

describe("saveView", () => {
  it("appends a trimmed view and returns its id", () => {
    const r = saveView(boardWith(), "  Bugs  ", { cardTypes: ["task"] }, 42);
    expect(r.error).toBeNull();
    expect(r.viewId).not.toBeNull();
    expect(r.board.savedViews).toHaveLength(1);
    expect(r.board.savedViews![0]).toMatchObject({
      name: "Bugs",
      filter: { cardTypes: ["task"] },
      createdAt: 42,
      updatedAt: 42,
    });
  });

  it("returns a new board and does not mutate the input", () => {
    const before = boardWith();
    const r = saveView(before, "Bugs", {}, 1);
    expect(r.board).not.toBe(before);
    expect(before.savedViews).toBeUndefined();
  });

  it("refuses a duplicate name case-insensitively", () => {
    const base = boardWith([view("v1", "Bugs")]);
    const r = saveView(base, "bugs", {}, 2);
    expect(r.viewId).toBeNull();
    expect(r.error).toMatch(/already exists/i);
    expect(r.board).toBe(base);
  });

  it("refuses an empty or whitespace-only name", () => {
    expect(saveView(boardWith(), "   ", {}).error).toMatch(/enter a name/i);
  });

  it("refuses a name over the length limit", () => {
    expect(saveView(boardWith(), "x".repeat(61), {}).error).toMatch(/60 characters/i);
  });

  it("allows an empty filter — All cards is a legitimate view", () => {
    expect(saveView(boardWith(), "Everything", {}).error).toBeNull();
  });

  it("adds to a board that predates the savedViews field", () => {
    const r = saveView(boardWith(), "New", {}, 1);
    expect(r.board.savedViews).toHaveLength(1);
  });
});

describe("updateView", () => {
  it("replaces the filter and bumps updatedAt while keeping id/name/createdAt", () => {
    const base = boardWith([view("v1", "Bugs", { done: "done" })]);
    base.savedViews![0].createdAt = 10;
    const next = updateView(base, "v1", { cardTypes: ["epic"] }, 99);
    expect(next.savedViews![0]).toMatchObject({
      id: "v1",
      name: "Bugs",
      createdAt: 10,
      updatedAt: 99,
      filter: { cardTypes: ["epic"] },
    });
  });

  it("leaves other views untouched", () => {
    const base = boardWith([view("v1", "A"), view("v2", "B")]);
    const next = updateView(base, "v1", { done: "done" }, 5);
    expect(next.savedViews![1]).toEqual(view("v2", "B"));
  });

  it("is a no-op for an unknown id", () => {
    const base = boardWith([view("v1", "A")]);
    expect(updateView(base, "ghost", {}, 5)).toBe(base);
  });
});

describe("renameView", () => {
  it("renames and bumps updatedAt", () => {
    const base = boardWith([view("v1", "Old")]);
    const r = renameView(base, "v1", "  New  ", 77);
    expect(r.error).toBeNull();
    expect(r.board.savedViews![0]).toMatchObject({
      name: "New",
      updatedAt: 77,
    });
  });

  it("allows renaming to its own current name", () => {
    const base = boardWith([view("v1", "Same")]);
    expect(renameView(base, "v1", "same").error).toBeNull();
  });

  it("refuses a clash with a different view", () => {
    const base = boardWith([view("v1", "A"), view("v2", "B")]);
    const r = renameView(base, "v1", "b");
    expect(r.error).toMatch(/already exists/i);
    expect(r.board).toBe(base);
  });

  it("reports an unknown id", () => {
    const base = boardWith([view("v1", "A")]);
    const r = renameView(base, "ghost", "X");
    expect(r.error).toMatch(/no longer exists/i);
    expect(r.board).toBe(base);
  });
});

describe("deleteView", () => {
  it("removes only the target view", () => {
    const base = boardWith([view("v1", "A"), view("v2", "B")]);
    const next = deleteView(base, "v1");
    expect(next.savedViews!.map((v) => v.id)).toEqual(["v2"]);
  });

  it("is a no-op for an unknown id", () => {
    const base = boardWith([view("v1", "A")]);
    expect(deleteView(base, "ghost")).toBe(base);
  });
});

describe("findView", () => {
  it("finds by id and returns null for null/unknown", () => {
    const base = boardWith([view("v1", "A")]);
    expect(findView(base, "v1")?.name).toBe("A");
    expect(findView(base, null)).toBeNull();
    expect(findView(base, "ghost")).toBeNull();
  });
});