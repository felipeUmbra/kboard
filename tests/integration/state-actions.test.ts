import { describe, it, expect } from "vitest";
import type { Board, Card } from "../../src/models/types";
import { normalizeBoard } from "../../src/models/migrations";
import {
  addCard,
  addCardWithParent,
  updateCard,
  patchCard,
  deleteCard,
  moveCard,
  addParent,
  removeParent,
} from "../../src/state/cardActions";
import {
  renameBoard,
  addColumn,
  renameColumn,
  removeColumn,
  moveColumn,
} from "../../src/state/actions";

function makeBoard(): Board {
  return normalizeBoard({
    id: "b1",
    name: "Test Board",
    columns: [
      { id: "col-1", name: "To Do", cardIds: [] },
      { id: "col-2", name: "In Progress", cardIds: [] },
      { id: "col-3", name: "Done", cardIds: [] },
    ],
    doneColumnIds: ["col-3"],
  });
}

// ─── Board & Column Actions ────────────────────────────────────────

describe("renameBoard", () => {
  it("renames the board", () => {
    const board = makeBoard();
    expect(renameBoard(board, "New Name").name).toBe("New Name");
  });

  it("falls back to 'Untitled board' for empty name", () => {
    const board = makeBoard();
    expect(renameBoard(board, "").name).toBe("Untitled board");
    expect(renameBoard(board, "   ").name).toBe("Untitled board");
  });
});

describe("addColumn", () => {
  it("adds a column with the given name", () => {
    const board = makeBoard();
    const next = addColumn(board, "Review");
    expect(next.columns).toHaveLength(4);
    expect(next.columns[3].name).toBe("Review");
    expect(next.columns[3].cardIds).toEqual([]);
  });

  it("ignores empty name", () => {
    const board = makeBoard();
    expect(addColumn(board, "").columns).toHaveLength(3);
    expect(addColumn(board, "  ").columns).toHaveLength(3);
  });
});

describe("renameColumn", () => {
  it("renames the specified column", () => {
    const board = makeBoard();
    const next = renameColumn(board, "col-1", "Backlog");
    expect(next.columns[0].name).toBe("Backlog");
  });

  it("does nothing for empty name", () => {
    const board = makeBoard();
    expect(renameColumn(board, "col-1", "").columns[0].name).toBe("To Do");
  });
});

describe("removeColumn", () => {
  it("removes the column and its cards", () => {
    let board = makeBoard();
    let result = addCard(board, "col-1", "Card 1");
    board = result.board;
    result = addCard(board, "col-1", "Card 2");
    board = result.board;
    const cardCount = Object.keys(board.cards).length;

    const next = removeColumn(board, "col-1");
    expect(next.columns).toHaveLength(2);
    expect(Object.keys(next.cards).length).toBe(cardCount - 2);
  });
});

describe("moveColumn", () => {
  it("moves a column to a new index", () => {
    const board = makeBoard();
    const next = moveColumn(board, "col-3", 0);
    expect(next.columns[0].id).toBe("col-3");
    expect(next.columns[1].id).toBe("col-1");
    expect(next.columns[2].id).toBe("col-2");
  });

  it("clamps to bounds", () => {
    const board = makeBoard();
    const next = moveColumn(board, "col-1", 999);
    expect(next.columns[2].id).toBe("col-1");
  });
});

// ─── Card Actions ──────────────────────────────────────────────────

describe("addCard", () => {
  it("adds a card to the specified column", () => {
    const board = makeBoard();
    const { board: next, cardId } = addCard(board, "col-1", "My Card");
    expect(cardId).toBeTruthy();
    expect(next.columns[0].cardIds).toContain(cardId);
    expect(next.cards[cardId!].title).toBe("My Card");
    expect(next.cards[cardId!].type).toBe("task");
  });

  it("returns null cardId for empty title", () => {
    const board = makeBoard();
    const { board: next, cardId } = addCard(board, "col-1", "");
    expect(cardId).toBeNull();
    // Board should be unchanged
    expect(Object.keys(next.cards).length).toBe(0);
  });

  it("trims whitespace from title", () => {
    const board = makeBoard();
    const { board: next, cardId } = addCard(board, "col-1", "  Trimmed  ");
    expect(next.cards[cardId!].title).toBe("Trimmed");
  });

  it("creates activity entry", () => {
    const board = makeBoard();
    const { board: next, cardId } = addCard(board, "col-1", "Card");
    expect(next.cards[cardId!].activity).toHaveLength(1);
    expect(next.cards[cardId!].activity[0].kind).toBe("created");
  });
});

describe("addCardWithParent", () => {
  it("creates a child card linked to origin", () => {
    let board = makeBoard();
    ({ board } = addCard(board, "col-1", "Epic 1", "epic"));
    const epicId = Object.keys(board.cards)[0];

    const { board: next, cardId } = addCardWithParent(board, "col-1", epicId, "as_child");
    expect(cardId).toBeTruthy();
    expect(next.cards[cardId!].type).toBe("story"); // epic → child = story
    expect(next.cards[cardId!].parentIds).toContain(epicId);
  });

  it("creates a parent card and links origin to it", () => {
    let board = makeBoard();
    ({ board } = addCard(board, "col-1", "Task 1", "task"));
    const taskId = Object.keys(board.cards)[0];

    const { board: next, cardId } = addCardWithParent(board, "col-1", taskId, "as_parent");
    expect(cardId).toBeTruthy();
    expect(next.cards[cardId!].type).toBe("story"); // task → parent = story
    expect(next.cards[taskId].parentIds).toContain(cardId);
  });

  it("returns null for non-existent origin", () => {
    const board = makeBoard();
    const { cardId } = addCardWithParent(board, "col-1", "no-such", "as_child");
    expect(cardId).toBeNull();
  });
});

describe("patchCard", () => {
  it("patches title and records activity", () => {
    let board = makeBoard();
    ({ board } = addCard(board, "col-1", "Original"));
    const cardId = Object.keys(board.cards)[0];

    const next = patchCard(board, cardId, { title: "Updated" });
    expect(next.cards[cardId].title).toBe("Updated");
    const titleChange = next.cards[cardId].activity.find((e) => e.kind === "title_changed");
    expect(titleChange).toBeDefined();
  });

  it("does nothing for non-existent card", () => {
    const board = makeBoard();
    expect(patchCard(board, "no-such", { title: "X" })).toBe(board);
  });
});

describe("deleteCard", () => {
  it("removes card from column and cards map", () => {
    let board = makeBoard();
    ({ board } = addCard(board, "col-1", "Delete Me"));
    const cardId = Object.keys(board.cards)[0];

    const next = deleteCard(board, cardId);
    expect(Object.keys(next.cards)).toHaveLength(0);
    expect(next.columns[0].cardIds).toHaveLength(0);
  });
});

describe("moveCard", () => {
  it("moves a card between columns", () => {
    let board = makeBoard();
    ({ board } = addCard(board, "col-1", "Move Me"));
    const cardId = Object.keys(board.cards)[0];

    const next = moveCard(board, cardId, "col-2", 0);
    expect(next.columns[0].cardIds).toHaveLength(0);
    expect(next.columns[1].cardIds).toContain(cardId);
  });

  it("moves a card within the same column to a different index", () => {
    let board = makeBoard();
    ({ board } = addCard(board, "col-1", "A"));
    ({ board } = addCard(board, "col-1", "B"));
    ({ board } = addCard(board, "col-1", "C"));
    const ids = board.columns[0].cardIds;

    const next = moveCard(board, ids[0], "col-1", 2);
    expect(next.columns[0].cardIds[2]).toBe(ids[0]);
  });
});

describe("addParent / removeParent", () => {
  it("adds a parent and removes it", () => {
    let board = makeBoard();
    // story is the valid parent type for a task
    ({ board } = addCard(board, "col-1", "Parent Story", "story"));
    ({ board } = addCard(board, "col-1", "Child Task", "task"));
    const parentId = Object.keys(board.cards)[0];
    const childId = Object.keys(board.cards)[1];

    let next = addParent(board, childId, parentId);
    expect(next.cards[childId].parentIds).toContain(parentId);

    next = removeParent(next, childId, parentId);
    expect(next.cards[childId].parentIds).not.toContain(parentId);
  });
});
