/**
 * Unit coverage for `buildActions` — the wiring layer between the pure action
 * creators and React state.
 *
 * `boardActions.ts` has no logic of its own worth stating; what it does have is
 * a lot of *plumbing* that can silently regress without any component test
 * noticing. The three things worth pinning down are:
 *
 *   1. Id plumbing. `addCard`, `addLabel` and `addCustomField` return an id
 *      that the caller uses to focus the row they just created. That id is
 *      produced inside the `mutate` callback, so the wiring has to capture it
 *      *and* return the new board — a `mutate` that only captures the id
 *      would still pass a naive assertion while dropping the change.
 *   2. The repository boundary. `createNewBoard` and `deleteBoard` are the only
 *      actions that talk to Drive, and both have failure paths that must set
 *      `lastError` rather than throw.
 *   3. Scope routing. Every `*ForType` action must reach the type-scoped
 *      implementation, and the plain variants must use `"board"`.
 *
 * The Drive module is mocked so no test touches the network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildActions, type ActionDeps } from "../../src/state/boardActions";
import { makeBoard, makeCard } from "./helpers/board";
import { ALL_CARD_TYPES, CARD_TYPE_META } from "../../src/models/cardTypeMeta";
import type { Board } from "../../src/models/types";

const repo = vi.hoisted(() => ({
  createBoard: vi.fn(),
  removeBoard: vi.fn(),
}));

vi.mock("../../src/drive/boardRepository", () => ({
  createBoard: repo.createBoard,
  removeBoard: repo.removeBoard,
}));

type Harness = {
  actions: ReturnType<typeof buildActions>;
  deps: ActionDeps;
  /** The board every `mutate` will be applied to. */
  current: () => Board;
  lastError: () => string | null;
  boards: () => Board[];
  setBoard: () => Board | null;
  deleted: () => Board[];
};

function harness(initial: Board = makeBoard()): Harness {
  let board: Board | null = initial;
  let boards: Board[] = [initial];
  let lastError: string | null = null;
  let activeBoard: Board | null = initial;
  const deleted: Board[] = [];

  const deps: ActionDeps = {
    mutate: (updater) => {
      if (board) board = updater(board);
    },
    setBoard: (updater) => {
      activeBoard =
        typeof updater === "function"
          ? (updater as (p: Board | null) => Board | null)(activeBoard)
          : updater;
    },
    setBoards: (updater) => {
      boards =
        typeof updater === "function"
          ? (updater as (p: Board[]) => Board[])(boards)
          : updater;
    },
    setLastError: (updater) => {
      lastError =
        typeof updater === "function"
          ? (updater as (p: string | null) => string | null)(lastError)
          : updater;
    },
    getBoards: () => boards,
    withToken: async (op) => op(),
    reauthenticate: async () => true,
    onBoardDeleted: (b) => deleted.push(b),
  };

  return {
    actions: buildActions(deps),
    deps,
    current: () => board!,
    lastError: () => lastError,
    boards: () => boards,
    setBoard: () => activeBoard,
    deleted: () => deleted,
  };
}

beforeEach(() => {
  repo.createBoard.mockReset();
  repo.removeBoard.mockReset();
});

describe("createNewBoard", () => {
  it("creates a board with the default three columns and all card types enabled", async () => {
    repo.createBoard.mockImplementation(async (b: Board) => ({ ...b, driveFileId: "f1" }));
    const h = harness();
    const created = await h.actions.createNewBoard("Roadmap");

    expect(created.name).toBe("Roadmap");
    expect(created.columns.map((c) => c.name)).toEqual([
      "To do",
      "In progress",
      "Done",
    ]);
    expect(created.cardTypes).toHaveLength(ALL_CARD_TYPES.length);
    for (const t of ALL_CARD_TYPES) {
      expect(created.cardTypes.find((c) => c.type === t)).toMatchObject({
        enabled: true,
        label: CARD_TYPE_META[t].defaultLabel,
      });
    }
    // The last column is the done column by default.
    expect(created.doneColumnIds).toEqual([created.columns[2].id]);
    expect(repo.createBoard).toHaveBeenCalledTimes(1);
  });

  it("trims the name and falls back to a default for a blank one", async () => {
    repo.createBoard.mockImplementation(async (b: Board) => b);
    const h = harness();
    expect((await h.actions.createNewBoard("  Roadmap  ")).name).toBe("Roadmap");
    expect((await h.actions.createNewBoard("   ")).name).toBe("Untitled board");
  });

  it("runs the create through withToken so a 401 can trigger reauth", async () => {
    repo.createBoard.mockImplementation(async (b: Board) => b);
    const h = harness();
    const withToken = vi.fn(async <T,>(op: () => Promise<T>) => op());
    h.deps.withToken = withToken as ActionDeps["withToken"];
    h.actions = buildActions(h.deps);
    await h.actions.createNewBoard("Roadmap");
    expect(withToken).toHaveBeenCalledTimes(1);
  });

  it("prepends the new board to the boards list and activates it", async () => {
    repo.createBoard.mockImplementation(async (b: Board) => ({ ...b, driveFileId: "f1" }));
    const h = harness();
    const created = await h.actions.createNewBoard("Second");
    expect(h.boards().map((b) => b.name)).toEqual(["Second", "Board"]);
    expect(h.setBoard()).toBe(created);
  });

  it("rejects a duplicate name, case-insensitively and after trimming", async () => {
    const h = harness(makeBoard({ name: "Roadmap" }));
    await expect(h.actions.createNewBoard("  roadmap ")).rejects.toThrow(
      /already exists/i,
    );
    expect(repo.createBoard).not.toHaveBeenCalled();
    expect(h.lastError()).toMatch(/already exists/i);
  });

  it("enforces the duplicate guard across every board, not just the active one", async () => {
    const h = harness(makeBoard({ id: "board-1", name: "Current" }));
    h.deps.getBoards = () => [
      makeBoard({ id: "board-2", name: "Roadmap" }),
      h.current(),
    ];
    h.actions = buildActions(h.deps);
    await expect(h.actions.createNewBoard("Roadmap")).rejects.toThrow(
      /already exists/i,
    );
  });

  it("sets an actionable message when the repository reports failure", async () => {
    repo.createBoard.mockImplementation(async () => null);
    const h = harness();
    await h.actions.createNewBoard("Roadmap");
    expect(h.lastError()).toMatch(/reconnect to drive/i);
    expect(h.boards().map((b) => b.name)).toEqual(["Board"]);
    expect(h.setBoard()).toBe(initialBoardOf(h));
  });
});

function initialBoardOf(h: Harness) {
  return h.setBoard();
}

describe("deleteBoard", () => {
  it("removes the board locally and notifies the host", async () => {
    repo.removeBoard.mockResolvedValue(undefined);
    const h = harness();
    const board = h.current();
    await h.actions.deleteBoard(board);
    expect(repo.removeBoard).not.toHaveBeenCalled(); // no driveFileId
    expect(h.deleted()).toEqual([]);
    expect(h.boards()).toHaveLength(1);
  });

  it("deletes the Drive file when the board has one", async () => {
    repo.removeBoard.mockResolvedValue(undefined);
    const board = { ...makeBoard(), driveFileId: "file-1" };
    const h = harness(board);
    await h.actions.deleteBoard(board);
    expect(repo.removeBoard).toHaveBeenCalledWith("file-1");
    expect(h.boards()).toEqual([]);
    expect(h.setBoard()).toBeNull();
    expect(h.deleted()).toEqual([board]);
  });

  it("keeps the active board when a different board is deleted", async () => {
    repo.removeBoard.mockResolvedValue(undefined);
    const active = { ...makeBoard(), id: "board-1", driveFileId: "f1" };
    const other = { ...makeBoard(), id: "board-2", driveFileId: "f2" };
    const h = harness(active);
    await h.actions.deleteBoard(other);
    expect(h.boards().map((b) => b.id)).toEqual(["board-1"]);
    expect(h.setBoard()).toBe(active);
  });

  it("surfaces a repository failure as an error rather than throwing", async () => {
    repo.removeBoard.mockRejectedValue(new Error("Drive is unhappy"));
    const board = { ...makeBoard(), driveFileId: "file-1" };
    const h = harness(board);
    await expect(h.actions.deleteBoard(board)).resolves.toBeUndefined();
    expect(h.lastError()).toBe("Drive is unhappy");
    expect(h.boards()).toHaveLength(1);
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    repo.removeBoard.mockRejectedValue("nope");
    const board = { ...makeBoard(), driveFileId: "file-1" };
    const h = harness(board);
    await h.actions.deleteBoard(board);
    expect(h.lastError()).toBe("Delete failed");
  });

  it("works when no onBoardDeleted callback was supplied", async () => {
    repo.removeBoard.mockResolvedValue(undefined);
    const board = { ...makeBoard(), driveFileId: "file-1" };
    let board_: Board | null = board;
    let lastError: string | null = null;
    const actions = buildActions({
      mutate: () => {},
      setBoard: () => {},
      setBoards: () => {},
      setLastError: (u) => {
        lastError = typeof u === "function" ? u(lastError) : u;
      },
      getBoards: () => [board],
      withToken: async (op) => op(),
      reauthenticate: async () => true,
    });
    void board_;
    await expect(actions.deleteBoard(board)).resolves.toBeUndefined();
    expect(lastError).toBeNull();
  });
});

describe("id-returning actions", () => {
  it("addCard returns the new id and the card is on the board", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Write docs");
    expect(id).not.toBeNull();
    expect(h.current().cards[id!].title).toBe("Write docs");
    expect(h.current().columns[0].cardIds).toEqual([id]);
  });

  it("addCard returns null for a blank title and changes nothing", () => {
    const h = harness();
    const before = h.current();
    expect(h.actions.addCard("col-todo", "   ")).toBeNull();
    expect(h.current()).toBe(before);
  });

  it("addCard defaults to a task and accepts an explicit type", () => {
    const h = harness();
    const taskId = h.actions.addCard("col-todo", "A")!;
    const epicId = h.actions.addCard("col-todo", "B", "epic")!;
    expect(h.current().cards[taskId].type).toBe("task");
    expect(h.current().cards[epicId].type).toBe("epic");
  });

  it("addChildCard creates a Story pre-linked to the Epic", () => {
    const h = harness();
    const origin = h.actions.addCard("col-todo", "Epic", "epic")!;
    const child = h.actions.addChildCard(origin)!;
    expect(child).not.toBeNull();
    expect(h.current().cards[child].type).toBe("story");
    expect(h.current().cards[child].parentIds).toEqual([origin]);
    // The origin is not mutated — the link lives only on the child.
    expect(h.current().cards[origin].parentIds).toEqual([]);
    expect(h.current().columns[0].cardIds).toContain(child);
  });

  it("addChildCard returns null when the origin cannot have children", () => {
    const h = harness();
    const task = h.actions.addCard("col-todo", "Task")!;
    expect(h.actions.addChildCard(task)).toBeNull();
  });

  it("addParentCard links the origin to the new parent both ways", () => {
    const h = harness();
    const origin = h.actions.addCard("col-todo", "Task")!;
    const parent = h.actions.addParentCard(origin)!;
    expect(parent).not.toBeNull();
    expect(h.current().cards[parent].type).toBe("story");
    expect(h.current().cards[origin].parentIds).toEqual([parent]);
  });

  it("addParentCard returns null when the origin cannot have a parent", () => {
    const h = harness();
    const epic = h.actions.addCard("col-todo", "Epic", "epic")!;
    expect(h.actions.addParentCard(epic)).toBeNull();
  });

  it("addParentCard returns null for an unknown origin", () => {
    expect(harness().actions.addParentCard("ghost")).toBeNull();
  });

  it("addParentCard returns null on a board with no columns", () => {
    const h = harness(
      makeBoard({
        columns: [],
        cards: { c1: makeCard({ id: "c1", type: "task" }) },
      }),
    );
    expect(h.actions.addParentCard("c1")).toBeNull();
  });

  it("addChildCard on a board with no columns does not throw", () => {
    const h = harness(
      makeBoard({
        columns: [],
        cards: { c1: makeCard({ id: "c1", type: "epic" }) },
      }),
    );
    expect(h.actions.addChildCard("c1")).toBeNull();
  });

  it("addLabel returns the new id and stores the label", () => {
    const h = harness();
    const id = h.actions.addLabel("Bug", "#ff0000");
    expect(id).not.toBeNull();
    expect(h.current().labels).toEqual([{ id: id!, name: "Bug", color: "#ff0000" }]);
  });

  it("addLabel returns null for a blank name", () => {
    const h = harness();
    expect(h.actions.addLabel("  ", "#ff0000")).toBeNull();
  });

  it("addCustomField returns the new id in the board scope", () => {
    const h = harness();
    const id = h.actions.addCustomField({ name: "Effort", type: "number" });
    expect(id).not.toBeNull();
    expect(h.current().customFields.map((f) => f.id)).toEqual([id]);
  });

  it("addCustomField returns null for a blank name", () => {
    const h = harness();
    expect(h.actions.addCustomField({ name: "", type: "number" })).toBeNull();
  });

  it("addCustomFieldForType returns the new id in the type scope", () => {
    const h = harness();
    const id = h.actions.addCustomFieldForType("task", {
      name: "Risk",
      type: "short_text",
    });
    expect(id).not.toBeNull();
    expect(h.current().customFields).toEqual([]);
    expect(
      h.current().cardTypes.find((c) => c.type === "task")!.customFields.map((f) => f.id),
    ).toEqual([id]);
  });

  it("addCustomFieldForType returns null for a blank name", () => {
    expect(
      harness().actions.addCustomFieldForType("task", { name: " ", type: "short_text" }),
    ).toBeNull();
  });
});

describe("mutate-only actions delegate to the pure creators", () => {
  it("renames the board and a column", () => {
    const h = harness();
    h.actions.renameBoard("Renamed");
    h.actions.renameColumn("col-todo", "Backlog");
    expect(h.current().name).toBe("Renamed");
    expect(h.current().columns[0].name).toBe("Backlog");
  });

  it("adds, moves and removes a column", () => {
    const h = harness();
    h.actions.addColumn("Blocked");
    const added = h.current().columns[2];
    expect(added.name).toBe("Blocked");
    h.actions.moveColumn(added.id, 0);
    expect(h.current().columns.map((c) => c.name)).toEqual([
      "Blocked",
      "To do",
      "Done",
    ]);
    h.actions.removeColumn(added.id);
    expect(h.current().columns.map((c) => c.name)).toEqual(["To do", "Done"]);
  });

  it("deletes the cards that lived in a removed column", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.removeColumn("col-todo");
    expect(h.current().columns.map((c) => c.id)).toEqual(["col-done"]);
    expect(h.current().cards[id]).toBeUndefined();
  });

  it("is a no-op for an unknown column id", () => {
    const h = harness();
    expect(h.actions.removeColumn("nope")).toBeUndefined();
    expect(h.current().columns).toHaveLength(2);
  });

  it("updates, moves and deletes a card", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.updateCard(id, { title: "Renamed" });
    expect(h.current().cards[id].title).toBe("Renamed");

    h.actions.moveCard(id, "col-done", 0);
    expect(h.current().cards[id].id).toBe(id);
    expect(h.current().columns[1].cardIds).toEqual([id]);
    expect(h.current().columns[0].cardIds).toEqual([]);

    h.actions.deleteCard(id);
    expect(h.current().cards[id]).toBeUndefined();
  });

  it("adds and removes parents explicitly", () => {
    const h = harness();
    const epic = h.actions.addCard("col-todo", "Epic", "epic")!;
    const story = h.actions.addCard("col-todo", "Story", "story")!;
    h.actions.addParent(story, epic);
    expect(h.current().cards[story].parentIds).toEqual([epic]);
    h.actions.removeParent(story, epic);
    expect(h.current().cards[story].parentIds).toEqual([]);
  });

  it("rejects a parent link that would create a cycle", () => {
    const h = harness();
    const epic = h.actions.addCard("col-todo", "Epic", "epic")!;
    const story = h.actions.addCard("col-todo", "Story", "story")!;
    h.actions.addParent(story, epic);
    // epic -> story would close the loop.
    h.actions.addParent(epic, story);
    expect(h.current().cards[epic].parentIds).toEqual([]);
  });

  it("labels a card and toggles the label off again", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    const label = h.actions.addLabel("Bug", "#ff0000")!;
    h.actions.toggleCardLabel(id, label);
    expect(h.current().cards[id].labelIds).toEqual([label]);
    h.actions.toggleCardLabel(id, label);
    expect(h.current().cards[id].labelIds).toEqual([]);
  });

  it("updates and removes a label", () => {
    const h = harness();
    const label = h.actions.addLabel("Bug", "#ff0000")!;
    h.actions.updateLabel(label, { name: "Defect" });
    expect(h.current().labels[0].name).toBe("Defect");
    h.actions.removeLabel(label);
    expect(h.current().labels).toEqual([]);
  });

  it("sets and clears the start and due dates", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.setCardStartDate(id, "2026-01-01");
    h.actions.setCardDueDate(id, "2026-02-01");
    expect(h.current().cards[id].startDate).toBe("2026-01-01");
    expect(h.current().cards[id].dueDate).toBe("2026-02-01");
    h.actions.setCardStartDate(id, null);
    h.actions.setCardDueDate(id, null);
    expect(h.current().cards[id].startDate).toBeNull();
    expect(h.current().cards[id].dueDate).toBeNull();
  });

  it("records a due date in the card's activity log", () => {
    // Ordering is enforced in the UI (DateField → validateDates), not here:
    // the action layer is the single place both orderings are persisted.
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.setCardStartDate(id, "2026-02-01");
    h.actions.setCardDueDate(id, "2026-01-01");
    expect(h.current().cards[id].dueDate).toBe("2026-01-01");
    const kinds = h.current().cards[id].activity.map((a) => a.kind);
    expect(kinds).toContain("start_date_changed");
    expect(kinds).toContain("due_date_changed");
  });

  it("adds and removes a comment", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.addComment(id, { author: "Ada", body: "Looks good" });
    expect(h.current().cards[id].comments).toHaveLength(1);
    const commentId = h.current().cards[id].comments[0].id;
    h.actions.removeComment(id, commentId);
    expect(h.current().cards[id].comments).toEqual([]);
  });

  it("adds, renames and deletes a checklist", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.addChecklist(id, "Steps");
    const checklist = h.current().cards[id].checklists[0];
    expect(checklist.title).toBe("Steps");
    h.actions.renameChecklist(id, checklist.id, "Process");
    expect(h.current().cards[id].checklists[0].title).toBe("Process");
    h.actions.deleteChecklist(id, checklist.id);
    expect(h.current().cards[id].checklists).toEqual([]);
  });

  it("adds, renames, toggles and deletes a checklist item", () => {
    const h = harness();
    const id = h.actions.addCard("col-todo", "Task")!;
    h.actions.addChecklist(id, "Steps");
    const checklistId = h.current().cards[id].checklists[0].id;
    h.actions.addChecklistItem(id, checklistId, "First");
    const itemId = h.current().cards[id].checklists[0].items[0].id;

    h.actions.renameChecklistItem(id, checklistId, itemId, "Renamed");
    expect(h.current().cards[id].checklists[0].items[0].text).toBe("Renamed");
    h.actions.toggleChecklistItem(id, checklistId, itemId);
    expect(h.current().cards[id].checklists[0].items[0].done).toBe(true);
    h.actions.deleteChecklistItem(id, checklistId, itemId);
    expect(h.current().cards[id].checklists[0].items).toEqual([]);
  });

  it("handles checklist operations on an unknown card", () => {
    const h = harness();
    expect(() => {
      h.actions.addChecklist("ghost", "Steps");
      h.actions.renameChecklist("ghost", "c", "X");
      h.actions.deleteChecklist("ghost", "c");
      h.actions.addChecklistItem("ghost", "c", "t");
      h.actions.toggleChecklistItem("ghost", "c", "i");
      h.actions.renameChecklistItem("ghost", "c", "i", "t");
      h.actions.deleteChecklistItem("ghost", "c", "i");
      h.actions.addComment("ghost", { author: "a", body: "b" });
      h.actions.removeComment("ghost", "c");
      h.actions.updateCard("ghost", { title: "x" });
      h.actions.deleteCard("ghost");
      h.actions.moveCard("ghost", "col-todo", 0);
      h.actions.addParent("ghost", "x");
      h.actions.removeParent("ghost", "x");
      h.actions.toggleCardLabel("ghost", "l");
      h.actions.setCardStartDate("ghost", null);
      h.actions.setCardDueDate("ghost", null);
    }).not.toThrow();
  });
});

describe("field routing", () => {
  it("routes the board-scoped field actions to the board scope", () => {
    const h = harness();
    const field = h.actions.addCustomField({ name: "Size", type: "preset_list" })!;
    h.actions.addPresetOption(field, "Large", "#ffffff");
    expect(h.current().customFields[0].options).toHaveLength(1);

    const optionId = h.current().customFields[0].options![0].id;
    h.actions.updatePresetOption(field, optionId, { name: "XL" });
    expect(h.current().customFields[0].options![0].name).toBe("XL");

    h.actions.setCardFieldValue("c1", field, "Large");
    h.actions.removePresetOption(field, optionId);
    expect(h.current().customFields[0].options).toEqual([]);

    h.actions.updateCustomField(field, { name: "Renamed" });
    expect(h.current().customFields[0].name).toBe("Renamed");

    h.actions.removeCustomField(field);
    expect(h.current().customFields).toEqual([]);
  });

  it("routes the per-type field actions to the card-type scope", () => {
    const h = harness();
    const field = h.actions.addCustomFieldForType("task", {
      name: "Size",
      type: "preset_list",
    })!;
    h.actions.addPresetOptionForType("task", field, "Large", "#ffffff");
    const optionId =
      h.current().cardTypes.find((c) => c.type === "task")!.customFields[0].options![0].id;

    h.actions.updatePresetOptionForType("task", field, optionId, { name: "XL" });
    expect(
      h.current().cardTypes.find((c) => c.type === "task")!.customFields[0].options![0].name,
    ).toBe("XL");

    h.actions.setCardTypeFieldValue("c1", "task", field, "Large");
    h.actions.removePresetOptionForType("task", field, optionId);

    h.actions.updateCustomFieldForType("task", field, { name: "Renamed" });
    expect(
      h.current().cardTypes.find((c) => c.type === "task")!.customFields[0].name,
    ).toBe("Renamed");

    h.actions.removeCustomFieldForType("task", field);
    expect(
      h.current().cardTypes.find((c) => c.type === "task")!.customFields,
    ).toEqual([]);
  });

  it("never lets a type-scoped action touch the board-scoped field list", () => {
    const h = harness();
    const boardField = h.actions.addCustomField({ name: "Board", type: "short_text" })!;
    h.actions.addCustomFieldForType("task", { name: "Type", type: "short_text" });
    h.actions.updateCustomFieldForType("task", boardField, { name: "Nope" });
    h.actions.removeCustomFieldForType("task", boardField);
    expect(h.current().customFields.map((f) => f.name)).toEqual(["Board"]);
  });
});

// The saved-view actions are the one place where `mutate` has to BOTH capture a
// return value and commit the new board. A `mutate` that only captured the id
// would look correct to the caller and silently drop the change, so these
// assert on the resulting board as well as the return value.
describe("saved view actions", () => {
  it("saveView commits the view and returns its id", () => {
    const h = harness();
    const result = h.actions.saveView("Bugs", { cardTypes: ["task"] });

    expect(result.error).toBeNull();
    expect(result.viewId).not.toBeNull();
    expect(h.current().savedViews).toHaveLength(1);
    expect(h.current().savedViews![0]).toMatchObject({
      id: result.viewId,
      name: "Bugs",
      filter: { cardTypes: ["task"] },
    });
  });

  it("saveView reports a duplicate name and leaves the board unchanged", () => {
    const h = harness();
    h.actions.saveView("Bugs", {});
    const before = h.current().savedViews!.length;
    const result = h.actions.saveView("bugs", {});

    expect(result.viewId).toBeNull();
    expect(result.error).toMatch(/already exists/i);
    expect(h.current().savedViews).toHaveLength(before);
  });

  it("updateView rewrites the filter in place", () => {
    const h = harness();
    const { viewId } = h.actions.saveView("Bugs", { cardTypes: ["task"] });

    h.actions.updateView(viewId!, { done: "done" });
    expect(h.current().savedViews).toHaveLength(1);
    expect(h.current().savedViews![0]).toMatchObject({
      id: viewId,
      name: "Bugs",
      filter: { done: "done" },
    });
  });

  it("renameView renames and returns null on success", () => {
    const h = harness();
    const { viewId } = h.actions.saveView("Old", {});

    expect(h.actions.renameView(viewId!, "New")).toBeNull();
    expect(h.current().savedViews![0].name).toBe("New");
  });

  it("renameView reports a clash and keeps the old name", () => {
    const h = harness();
    const first = h.actions.saveView("A", {}).viewId!;
    h.actions.saveView("B", {});

    expect(h.actions.renameView(first, "b")).toMatch(/already exists/i);
    expect(h.current().savedViews!.map((v) => v.name)).toEqual(["A", "B"]);
  });

  it("deleteView removes the view", () => {
    const h = harness();
    const keep = h.actions.saveView("Keep", {}).viewId!;
    const drop = h.actions.saveView("Drop", {}).viewId!;

    h.actions.deleteView(drop);
    expect(h.current().savedViews!.map((v) => v.id)).toEqual([keep]);
  });

  it("is a no-op for unknown view ids", () => {
    const h = harness();
    expect(() => {
      h.actions.updateView("ghost", {});
      h.actions.deleteView("ghost");
    }).not.toThrow();
    expect(h.actions.renameView("ghost", "X")).toMatch(/no longer exists/i);
  });
});

describe("card type and done column settings", () => {
  it("toggles a card type's enabled flag", () => {
    const h = harness();
    h.actions.setCardTypeEnabled("story", false);
    expect(h.current().cardTypes.find((c) => c.type === "story")!.enabled).toBe(false);
  });

  it("renames a card type", () => {
    const h = harness();
    h.actions.setCardTypeLabel("story", "User Story");
    expect(h.current().cardTypes.find((c) => c.type === "story")!.label).toBe("User Story");
  });

  it("marks and unmarks a done column", () => {
    const h = harness();
    h.actions.setDoneColumn("col-todo", true);
    expect(h.current().doneColumnIds).toEqual(["col-done", "col-todo"]);
    h.actions.setDoneColumn("col-todo", false);
    expect(h.current().doneColumnIds).toEqual(["col-done"]);
  });
});
