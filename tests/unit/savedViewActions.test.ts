import { describe, expect, it } from "vitest";
import {
  deleteView,
  findView,
  renameView,
  saveView,
  updateView,
} from "../../src/state/savedViewActions";
import { MAX_SAVED_VIEWS } from "../../src/models/savedViews";
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

describe("saveView at the cap", () => {
  const full = (n: number) =>
    boardWith(
      Array.from({ length: n }, (_, i) => view(`v${i}`, `View ${i}`)),
    );

  it("refuses to add beyond MAX_SAVED_VIEWS and leaves the board untouched", () => {
    const base = full(MAX_SAVED_VIEWS);
    const r = saveView(base, "One more", {}, 1);

    expect(r.viewId).toBeNull();
    expect(r.error).toContain(String(MAX_SAVED_VIEWS));
    expect(r.board).toBe(base);
    expect(r.board.savedViews).toHaveLength(MAX_SAVED_VIEWS);
  });

  it("still allows saving on the last free slot", () => {
    const r = saveView(full(MAX_SAVED_VIEWS - 1), "Last one", {}, 1);
    expect(r.error).toBeNull();
    expect(r.viewId).not.toBeNull();
    expect(r.board.savedViews).toHaveLength(MAX_SAVED_VIEWS);
  });

  it("reports the cap before the name, so a bad name at the limit is unambiguous", () => {
    // Both are refusals; the cap must win so the user is told the actionable
    // thing (delete a view) rather than a name they could simply change.
    const r = saveView(full(MAX_SAVED_VIEWS), "   ", {}, 1);
    expect(r.error).toContain(String(MAX_SAVED_VIEWS));
  });

  it("frees a slot on delete so the board is usable again", () => {
    const base = full(MAX_SAVED_VIEWS);
    const afterDelete = deleteView(base, "v0");
    expect(saveView(afterDelete, "Fresh", {}, 1).viewId).not.toBeNull();
  });

  it("does not cap update or rename — neither adds a view", () => {
    const base = full(MAX_SAVED_VIEWS);
    expect(updateView(base, "v0", { done: "done" }).savedViews![0].filter).toEqual({
      done: "done",
    });
    expect(renameView(base, "v1", "Renamed").error).toBeNull();
  });
});