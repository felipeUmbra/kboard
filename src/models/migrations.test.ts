import { describe, it, expect } from "vitest";
import { normalizeBoard, cryptoRandomId } from "./migrations";
import type { Board, Card } from "./types";

describe("cryptoRandomId", () => {
  it("returns a non-empty string", () => {
    expect(typeof cryptoRandomId()).toBe("string");
    expect(cryptoRandomId().length).toBeGreaterThan(0);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => cryptoRandomId()));
    expect(ids.size).toBe(100);
  });
});

describe("normalizeBoard", () => {
  it("produces a valid board from empty input", () => {
    const board = normalizeBoard(null);
    expect(board.id).toBeDefined();
    expect(board.name).toBe("Untitled board");
    expect(board.columns).toEqual([]);
    expect(board.cards).toEqual({});
    expect(board.labels).toEqual([]);
    expect(board.doneColumnIds).toEqual([]);
  });

  it("preserves valid board data", () => {
    const raw = {
      id: "b1",
      name: "My Board",
      columns: [{ id: "col-1", name: "To Do", cardIds: ["c1"] }],
      cards: {
        c1: {
          id: "c1",
          type: "story",
          title: "A Story",
          descriptionHtml: "<p>Hello</p>",
        },
      },
      labels: [{ id: "l1", name: "Bug", color: "#ff0000" }],
      doneColumnIds: ["col-done"],
    };
    const board = normalizeBoard(raw);
    expect(board.id).toBe("b1");
    expect(board.name).toBe("My Board");
    expect(board.columns).toHaveLength(1);
    expect(board.columns[0].cardIds).toEqual(["c1"]);
    expect(board.cards["c1"].type).toBe("story");
    expect(board.labels).toHaveLength(1);
  });

  it("auto-detects done columns when doneColumnIds is absent", () => {
    const raw = {
      columns: [
        { id: "c1", name: "To Do", cardIds: [] },
        { id: "c2", name: "Done", cardIds: [] },
      ],
      // doneColumnIds omitted — triggers defaultDoneColumnIds fallback
    };
    const board = normalizeBoard(raw);
    expect(board.doneColumnIds).toEqual(["c2"]);
  });

  it("preserves explicit empty doneColumnIds array", () => {
    const raw = {
      columns: [
        { id: "c1", name: "Done", cardIds: [] },
      ],
      doneColumnIds: [],
    };
    const board = normalizeBoard(raw);
    expect(board.doneColumnIds).toEqual([]);
  });

  it("normalizes cards with missing fields", () => {
    const raw = {
      cards: {
        c1: {
          // Missing most fields — should get defaults
          title: "Partial Card",
        },
      },
    };
    const board = normalizeBoard(raw);
    const card = board.cards["c1"];
    expect(card.title).toBe("Partial Card");
    expect(card.type).toBe("task"); // default type
    expect(card.labelIds).toEqual([]);
    expect(card.parentIds).toEqual([]);
    expect(card.startDate).toBeNull();
    expect(card.dueDate).toBeNull();
    expect(card.descriptionHtml).toBe("");
  });

  it("handles legacy parentId migration to parentIds array", () => {
    const raw = {
      cards: {
        child: {
          id: "child",
          title: "Child",
          parentId: "parent-id",
        },
      },
    };
    const board = normalizeBoard(raw);
    expect(board.cards["child"].parentIds).toEqual(["parent-id"]);
  });

  it("handles legacy description to descriptionHtml migration", () => {
    const raw = {
      cards: {
        c1: {
          id: "c1",
          title: "Card",
          description: "Plain text",
        },
      },
    };
    const board = normalizeBoard(raw);
    expect(board.cards["c1"].descriptionHtml).toContain("Plain text");
    expect(board.cards["c1"].descriptionHtml).toContain("<p>");
  });

  it("filters invalid labels and fields", () => {
    const raw = {
      labels: [
        { id: "l1", name: "Good", color: "#ff0000" },
        null,
        { id: "l2" }, // missing name
        42,
      ],
      customFields: [
        { id: "f1", name: "Good", type: "short_text" },
        null,
        "bad",
      ],
    };
    const board = normalizeBoard(raw as any);
    expect(board.labels).toHaveLength(1);
    expect(board.labels[0].id).toBe("l1");
    expect(board.customFields).toHaveLength(1);
  });
});
