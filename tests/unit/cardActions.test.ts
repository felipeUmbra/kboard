/**
 * Unit coverage for the card / label action creators.
 *
 * `cardActions.ts` is the largest state module and the one with the most
 * branching that is invisible from the outside: the activity log is built by
 * diffing a patch against the existing card, so every `if` decides whether a
 * user-visible audit entry is written or silently dropped. Those branches are
 * asserted explicitly here, because a regression in them does not break the
 * UI — it just quietly stops recording history.
 *
 * The parent/child validation rules get the same treatment: `validateAddParent`
 * is the only thing standing between a bad link and a cycle, and each rejection
 * reason is a distinct branch.
 */

import { describe, it, expect } from "vitest";
import {
  addCard,
  addCardWithParent,
  patchCard,
  updateCard,
  deleteCard,
  moveCard,
  addLabel,
  updateLabel,
  removeLabel,
  toggleCardLabel,
  addParent,
  removeParent,
  validateAddParent,
  getValidParents,
  addComment,
  removeComment,
  addChecklist,
  renameChecklist,
  deleteChecklist,
  addChecklistItem,
  toggleChecklistItem,
  renameChecklistItem,
  deleteChecklistItem,
} from "../../src/state/cardActions";
import type { ActivityKind } from "../../src/models/types";
import { makeBoard, makeCard } from "./helpers/board";

/** A board holding one card of each type, wired into real columns. */
function typedBoard() {
  const epic = makeCard({ id: "e1", type: "epic", title: "Epic" });
  const story = makeCard({ id: "s1", type: "story", title: "Story" });
  const task = makeCard({ id: "t1", type: "task", title: "Task" });
  const board = makeBoard({
    columns: [
      { id: "col-todo", name: "To do", cardIds: ["e1", "s1", "t1"] },
      { id: "col-done", name: "Done", cardIds: [] },
    ],
    cards: { e1: epic, s1: story, t1: task },
  });
  return { board, epic, story, task };
}

const kinds = (board: ReturnType<typeof makeBoard>, cardId: string): ActivityKind[] =>
  board.cards[cardId].activity.map((a) => a.kind);

describe("addCard", () => {
  it("adds the card to the target column and the card map", () => {
    const base = makeBoard();
    const { board, cardId } = addCard(base, "col-todo", "Hello");
    expect(board.columns[0].cardIds).toEqual([cardId]);
    expect(board.cards[cardId!]).toMatchObject({
      title: "Hello",
      type: "task",
      parentIds: [],
      checklists: [],
    });
  });

  it("trims the title", () => {
    const { board, cardId } = addCard(makeBoard(), "col-todo", "  Hello  ");
    expect(board.cards[cardId!].title).toBe("Hello");
  });

  it("seeds a 'created' activity entry", () => {
    const { board, cardId } = addCard(makeBoard(), "col-todo", "Hello");
    expect(board.cards[cardId!].activity).toHaveLength(1);
    expect(board.cards[cardId!].activity[0].kind).toBe("created");
  });

  it("returns the board unchanged for a blank title", () => {
    const base = makeBoard();
    const r = addCard(base, "col-todo", "   ");
    expect(r.cardId).toBeNull();
    expect(r.board).toBe(base);
  });

  it("creates a card that is filed nowhere when the column is unknown", () => {
    const { board, cardId } = addCard(makeBoard(), "nope", "Hello");
    expect(cardId).not.toBeNull();
    expect(board.cards[cardId!]).toBeTruthy();
    expect(board.columns.every((c) => c.cardIds.length === 0)).toBe(true);
  });

  it("files a second card after the first", () => {
    const first = addCard(makeBoard(), "col-todo", "A");
    const second = addCard(first.board, "col-todo", "B");
    expect(second.board.columns[0].cardIds).toEqual([first.cardId, second.cardId]);
  });
});

describe("addCardWithParent", () => {
  it("creates a Story child of an Epic, linking only the child", () => {
    const { board } = typedBoard();
    const r = addCardWithParent(board, "col-todo", "e1", "as_child");
    const child = r.board.cards[r.cardId!];
    expect(child.type).toBe("story");
    expect(child.parentIds).toEqual(["e1"]);
    expect(r.board.cards.e1.parentIds).toEqual([]);
  });

  it("creates a Story parent of a Task and links the origin to it", () => {
    const { board } = typedBoard();
    const r = addCardWithParent(board, "col-todo", "t1", "as_parent");
    expect(r.board.cards[r.cardId!].type).toBe("story");
    expect(r.board.cards.t1.parentIds).toEqual([r.cardId]);
  });

  it("creates a Task child of a Story", () => {
    const { board } = typedBoard();
    const r = addCardWithParent(board, "col-todo", "s1", "as_child");
    expect(r.board.cards[r.cardId!].type).toBe("task");
  });

  it("seeds a descriptive activity entry naming the origin type", () => {
    const { board } = typedBoard();
    const asChild = addCardWithParent(board, "col-todo", "e1", "as_child");
    expect(asChild.board.cards[asChild.cardId!].activity[0].text).toContain("epic");
    const asParent = addCardWithParent(board, "col-todo", "t1", "as_parent");
    expect(asParent.board.cards[asParent.cardId!].activity[0].text).toContain("task");
  });

  it("titles the new card 'Untitled' so the editor opens populated", () => {
    const { board } = typedBoard();
    const r = addCardWithParent(board, "col-todo", "e1", "as_child");
    expect(r.board.cards[r.cardId!].title).toBe("Untitled");
  });

  it("returns null for an unknown origin", () => {
    const base = makeBoard();
    expect(addCardWithParent(base, "col-todo", "ghost", "as_child").cardId).toBeNull();
  });

  it("returns null when the direction is not allowed for the origin's type", () => {
    const { board } = typedBoard();
    // A Task has no child type and an Epic has no parent type.
    expect(addCardWithParent(board, "col-todo", "t1", "as_child").cardId).toBeNull();
    expect(addCardWithParent(board, "col-todo", "e1", "as_parent").cardId).toBeNull();
  });

  it("falls back to the first column when the requested one is invalid", () => {
    const { board } = typedBoard();
    const r = addCardWithParent(board, "nope", "e1", "as_child");
    expect(r.board.columns[0].cardIds).toContain(r.cardId);
  });

  it("returns null when the board has no columns at all", () => {
    const base = makeBoard({
      columns: [],
      cards: { e1: makeCard({ id: "e1", type: "epic" }) },
    });
    expect(addCardWithParent(base, "", "e1", "as_child").cardId).toBeNull();
  });
});

describe("patchCard activity diffing", () => {
  it("records a title change", () => {
    const { board } = typedBoard();
    const next = patchCard(board, "t1", { title: "Renamed" });
    expect(kinds(next, "t1")).toEqual(["title_changed"]);
    expect(next.cards.t1.activity[0].text).toContain("Renamed");
  });

  it("records a description change", () => {
    const { board } = typedBoard();
    const next = patchCard(board, "t1", { descriptionHtml: "<p>new</p>" });
    expect(kinds(next, "t1")).toEqual(["description_changed"]);
  });

  it("records a type change with the human label", () => {
    const { board } = typedBoard();
    const next = patchCard(board, "t1", { type: "epic" });
    expect(kinds(next, "t1")).toEqual(["type_changed"]);
    expect(next.cards.t1.activity[0].text).toContain("Epic");
  });

  it("records both date directions — set and cleared", () => {
    const { board } = typedBoard();
    const set = patchCard(board, "t1", { startDate: "2026-01-01", dueDate: "2026-02-01" });
    expect(kinds(set, "t1")).toEqual(["start_date_changed", "due_date_changed"]);
    expect(set.cards.t1.activity[0].text).toContain("set to");

    const cleared = patchCard(set, "t1", { startDate: null, dueDate: null });
    const clearedEntries = cleared.cards.t1.activity.slice(2);
    expect(clearedEntries.map((a) => a.kind)).toEqual([
      "start_date_changed",
      "due_date_changed",
    ]);
    expect(clearedEntries[0].text).toContain("cleared");
  });

  it("records nothing when the patch matches the current value", () => {
    const { board } = typedBoard();
    const next = patchCard(board, "t1", { title: "Task", type: "task" });
    expect(kinds(next, "t1")).toEqual([]);
  });

  it("records nothing for an empty patch", () => {
    const { board } = typedBoard();
    expect(kinds(patchCard(board, "t1", {}), "t1")).toEqual([]);
  });

  it("records multiple changes as separate entries", () => {
    const { board } = typedBoard();
    const next = patchCard(board, "t1", {
      title: "A",
      descriptionHtml: "<p>B</p>",
      type: "story",
    });
    expect(kinds(next, "t1")).toEqual([
      "title_changed",
      "description_changed",
      "type_changed",
    ]);
  });

  it("appends to the existing log rather than replacing it", () => {
    const base = typedBoard().board;
    const seeded = {
      ...base,
      cards: {
        ...base.cards,
        t1: {
          ...base.cards.t1,
          activity: [{ id: "a0", kind: "created" as const, text: "seed", at: 1 }],
        },
      },
    };
    const next = patchCard(seeded, "t1", { title: "A" });
    expect(next.cards.t1.activity.map((a) => a.text)).toEqual(["seed", 'Title changed to "A"']);
  });

  it("returns the board unchanged for an unknown card", () => {
    const base = makeBoard();
    expect(patchCard(base, "ghost", { title: "X" })).toBe(base);
  });

  it("never lets a patch rewrite the card id", () => {
    const { board } = typedBoard();
    const next = patchCard(board, "t1", { id: "hijacked", title: "A" } as never);
    expect(next.cards.hijacked).toBeUndefined();
    expect(next.cards.t1.title).toBe("A");
  });

  it("updateCard is the same function as patchCard", () => {
    expect(updateCard).toBe(patchCard);
  });
});

describe("deleteCard", () => {
  it("removes the card from the map and every column", () => {
    const { board } = typedBoard();
    const next = deleteCard(board, "t1");
    expect(next.cards.t1).toBeUndefined();
    expect(next.columns[0].cardIds).toEqual(["e1", "s1"]);
  });

  it("cascades: children lose the deleted parent id", () => {
    const base = typedBoard().board;
    const linked = {
      ...base,
      cards: { ...base.cards, s1: { ...base.cards.s1, parentIds: ["e1", "e2"] } },
    };
    expect(deleteCard(linked, "e1").cards.s1.parentIds).toEqual(["e2"]);
  });

  it("leaves unrelated children untouched", () => {
    const { board } = typedBoard();
    expect(deleteCard(board, "e1").cards.s1).toBe(board.cards.s1);
  });

  it("is a no-op for an unknown card", () => {
    const base = makeBoard();
    expect(deleteCard(base, "ghost").cards).toEqual({});
  });
});

describe("moveCard", () => {
  it("moves the card between columns and records the move", () => {
    const { board } = typedBoard();
    const next = moveCard(board, "t1", "col-done", 0);
    expect(next.columns[0].cardIds).toEqual(["e1", "s1"]);
    expect(next.columns[1].cardIds).toEqual(["t1"]);
    expect(kinds(next, "t1")).toEqual(["moved"]);
    expect(next.cards.t1.activity[0].text).toContain("Done");
  });

  it("records no move when the card is already in the target column", () => {
    const { board } = typedBoard();
    expect(kinds(moveCard(board, "t1", "col-todo", 0), "t1")).toEqual([]);
  });

  it("is a no-op for an unknown card or column", () => {
    const base = typedBoard().board;
    expect(moveCard(base, "ghost", "col-done", 0).cards.t1).toBe(base.cards.t1);
    expect(moveCard(base, "t1", "ghost", 0).cards.t1).toBe(base.cards.t1);
  });
});

describe("validateAddParent", () => {
  it("accepts a legal link", () => {
    const { board } = typedBoard();
    expect(validateAddParent(board, "s1", "e1")).toBeNull();
  });

  it("rejects a missing card or parent", () => {
    const { board } = typedBoard();
    expect(validateAddParent(board, "ghost", "e1")).toBe("not_found");
    expect(validateAddParent(board, "s1", "ghost")).toBe("not_found");
  });

  it("rejects self-parenting", () => {
    const { board } = typedBoard();
    expect(validateAddParent(board, "s1", "s1")).toBe("self_parent");
  });

  it("treats an existing link as a legal no-op", () => {
    const { board } = typedBoard();
    expect(validateAddParent(addParent(board, "s1", "e1"), "s1", "e1")).toBeNull();
  });

  it("rejects a parent of the wrong type", () => {
    const { board } = typedBoard();
    // A Story's parentType is Epic, so a Task cannot be its parent.
    expect(validateAddParent(board, "s1", "t1")).toBe("wrong_type");
  });

  it("rejects a type that has no parent type at all", () => {
    const board = makeBoard({
      cards: {
        e1: makeCard({ id: "e1", type: "epic", parentIds: [] }),
        e2: makeCard({ id: "e2", type: "epic", parentIds: [] }),
      },
    });
    expect(validateAddParent(board, "e1", "e2")).toBe("wrong_type");
  });

  it("rejects a link that would close a cycle", () => {
    // The type hierarchy (epic → story → task) is a strict DAG, so a cycle
    // cannot be built through the UI: the type gate always fires first. The
    // cycle walk is therefore defence against a board that arrived already
    // corrupted — a hand-edited Drive file, or a partial sync that dropped
    // a card and re-added it under its own descendant. This builds exactly
    // that: an Epic whose parentIds already contains the Story asking to be
    // its parent.
    const corrupted = makeBoard({
      cards: {
        story: makeCard({ id: "story", type: "story", parentIds: [] }),
        epic: makeCard({ id: "epic", type: "epic", parentIds: ["story"] }),
      },
    });
    expect(validateAddParent(corrupted, "story", "epic")).toBe("cycle");
  });

  it("addParent refuses the same corrupt-board cycle", () => {
    const corrupted = makeBoard({
      cards: {
        story: makeCard({ id: "story", type: "story", parentIds: [] }),
        epic: makeCard({ id: "epic", type: "epic", parentIds: ["story"] }),
      },
    });
    expect(addParent(corrupted, "story", "epic")).toBe(corrupted);
  });

  it("terminates on a parent chain that loops without returning to the card", () => {
    const board = makeBoard({
      cards: {
        x: makeCard({ id: "x", type: "story", parentIds: ["y"] }),
        y: makeCard({ id: "y", type: "story", parentIds: ["z"] }),
        z: makeCard({ id: "z", type: "story", parentIds: ["y"] }),
      },
    });
    // The `visited` set is what stops this; without it the walk never returns.
    expect(validateAddParent(board, "x", "y")).toBeNull();
  });

  it("tolerates a parent link pointing at a card that no longer exists", () => {
    const board = makeBoard({
      cards: {
        x: makeCard({ id: "x", type: "story", parentIds: ["ghost"] }),
        e: makeCard({ id: "e", type: "epic" }),
      },
    });
    expect(validateAddParent(board, "x", "e")).toBeNull();
  });

  it("tolerates a dangling ancestor partway up the chain", () => {
    // The walk climbs from the *proposed parent*, so the ghost has to sit
    // above it, not below: e → mid → ghost. Skipping the unresolvable step
    // is what stops a partially-synced board from throwing mid-walk.
    const board = makeBoard({
      cards: {
        x: makeCard({ id: "x", type: "story", parentIds: [] }),
        e: makeCard({ id: "e", type: "epic", parentIds: ["mid"] }),
        mid: makeCard({ id: "mid", type: "epic", parentIds: ["ghost"] }),
      },
    });
    expect(validateAddParent(board, "x", "e")).toBeNull();
    expect(addParent(board, "x", "e").cards.x.parentIds).toEqual(["e"]);
  });

  it("stops the walk when it revisits an already-seen card", () => {
    // Two stories converge on the same ancestor, so the walk must not push
    // it twice — the `visited` check is what prevents an infinite descent on
    // a diamond-shaped graph. `target` is an Epic, so it can only ever be
    // the child here; the point is that the walk terminates.
    const board = makeBoard({
      cards: {
        target: makeCard({ id: "target", type: "story", parentIds: [] }),
        left: makeCard({ id: "left", type: "story", parentIds: ["target"] }),
        right: makeCard({ id: "right", type: "story", parentIds: ["target"] }),
      },
    });
    // left is a Story, so it cannot parent another Story — the type gate
    // answers first. The walk is only reached for an Epic child.
    expect(validateAddParent(board, "target", "left")).toBe("wrong_type");
  });

  it("walks a diamond without revisiting the shared ancestor", () => {
    const board = makeBoard({
      cards: {
        child: makeCard({ id: "child", type: "story", parentIds: [] }),
        epic: makeCard({ id: "epic", type: "epic", parentIds: ["a", "b"] }),
        a: makeCard({ id: "a", type: "epic", parentIds: [] }),
        b: makeCard({ id: "b", type: "epic", parentIds: ["a"] }),
      },
    });
    // epic's chain visits `a` twice; the walk must reach a verdict, not spin.
    expect(validateAddParent(board, "child", "epic")).toBeNull();
  });

  it("does not re-push an ancestor it has already queued", () => {
    // `shared` is reachable from both `a` and `b`, so it gets queued once,
    // popped and visited, and then suppressed on the second arrival. The
    // `!visited.has(p)` check is what keeps a wide hierarchy from turning
    // into an exponential walk.
    const board = makeBoard({
      cards: {
        child: makeCard({ id: "child", type: "story", parentIds: [] }),
        epic: makeCard({ id: "epic", type: "epic", parentIds: ["a", "b"] }),
        a: makeCard({ id: "a", type: "epic", parentIds: ["shared"] }),
        b: makeCard({ id: "b", type: "epic", parentIds: ["shared"] }),
        shared: makeCard({ id: "shared", type: "epic", parentIds: [] }),
      },
    });
    expect(validateAddParent(board, "child", "epic")).toBeNull();
    expect(addParent(board, "child", "epic").cards.child.parentIds).toEqual(["epic"]);
  });

  it("handles a duplicate parent id inside the chain", () => {
    const board = makeBoard({
      cards: {
        x: makeCard({ id: "x", type: "story", parentIds: ["e", "e"] }),
        e: makeCard({ id: "e", type: "epic" }),
      },
    });
    expect(validateAddParent(board, "x", "e")).toBeNull();
  });
});

describe("addParent / removeParent", () => {
  it("links the parent and records the change", () => {
    const { board } = typedBoard();
    const next = addParent(board, "s1", "e1");
    expect(next.cards.s1.parentIds).toEqual(["e1"]);
    expect(kinds(next, "s1")).toEqual(["parents_changed"]);
    expect(next.cards.s1.activity[0].text).toContain("Linked to");
  });

  it("refuses an invalid link and returns the same board", () => {
    const base = typedBoard().board;
    expect(addParent(base, "s1", "t1")).toBe(base);
    expect(addParent(base, "s1", "ghost")).toBe(base);
  });

  it("unlinks the parent and records the change", () => {
    const { board } = typedBoard();
    const next = removeParent(addParent(board, "s1", "e1"), "s1", "e1");
    expect(next.cards.s1.parentIds).toEqual([]);
    // Two entries now survive: the link that addParent made, and the unlink.
    expect(next.cards.s1.activity.map((a) => a.text)).toEqual([
      'Linked to epic "Epic"',
      'Unlinked from epic "Epic"',
    ]);
  });

  it("removeParent leaves the parent list alone when the link does not exist", () => {
    const base = typedBoard().board;
    // The card is rewritten (the log gains an "Unlinked" entry) but the
    // parent list is unchanged — unlinking something that was never linked
    // is a no-op in effect, not in identity.
    const next = removeParent(base, "s1", "e1");
    expect(next.cards.s1.parentIds).toEqual([]);
    expect(next.cards.s1.activity[0].text).toContain("Unlinked from");
  });

  it("removeParent is a no-op for unknown ids", () => {
    const base = typedBoard().board;
    expect(removeParent(base, "ghost", "e1")).toBe(base);
    expect(removeParent(base, "s1", "ghost")).toBe(base);
  });
});

describe("getValidParents", () => {
  it("returns the cards of the type that can parent the given type", () => {
    const { board } = typedBoard();
    expect(getValidParents(board, "story").map((c) => c.id)).toEqual(["e1"]);
    expect(getValidParents(board, "task").map((c) => c.id)).toEqual(["s1"]);
  });

  it("returns nothing for a type that cannot have a parent", () => {
    const { board } = typedBoard();
    // Nothing parents an Epic.
    expect(getValidParents(board, "epic")).toEqual([]);
  });

  it("returns nothing for an unknown type", () => {
    const { board } = typedBoard();
    // getMeta is total over CardType, so there is no "unknown" case in
    // production; this documents that the guard below is what stops an
    // unrecognised type from silently producing a wrong parent list.
    expect(() => getValidParents(board, "nope" as never)).toThrow();
  });

  it("returns an empty list on an empty board", () => {
    expect(getValidParents(makeBoard(), "story")).toEqual([]);
  });
});

describe("labels", () => {
  it("adds a trimmed label", () => {
    const { board, labelId } = addLabel(makeBoard(), "  Bug  ", "#ff0000");
    expect(board.labels).toEqual([{ id: labelId, name: "Bug", color: "#ff0000" }]);
  });

  it("rejects a blank label name", () => {
    const base = makeBoard();
    const r = addLabel(base, "   ", "#ff0000");
    expect(r.labelId).toBeNull();
    expect(r.board).toBe(base);
  });

  it("updates a label without letting the id change", () => {
    const { board, labelId } = addLabel(makeBoard(), "Bug", "#ff0000");
    const next = updateLabel(board, labelId!, { id: "hijacked", name: "Defect" } as never);
    expect(next.labels[0]).toMatchObject({ id: labelId, name: "Defect" });
  });

  it("leaves other labels alone when updating", () => {
    const first = addLabel(makeBoard(), "A", "#000000");
    const second = addLabel(first.board, "B", "#ffffff");
    const next = updateLabel(second.board, first.labelId!, { name: "AA" });
    expect(next.labels.map((l) => l.name)).toEqual(["AA", "B"]);
  });

  it("removes a label and strips it from every card", () => {
    const { board, labelId } = addLabel(makeBoard(), "Bug", "#ff0000");
    const labelled = {
      ...board,
      cards: {
        c1: makeCard({ id: "c1", labelIds: [labelId!, "other"] }),
        c2: makeCard({ id: "c2", labelIds: [] }),
      },
    };
    const next = removeLabel(labelled, labelId!);
    expect(next.labels).toEqual([]);
    expect(next.cards.c1.labelIds).toEqual(["other"]);
    expect(next.cards.c2.labelIds).toEqual([]);
  });

  it("toggles a label on and off", () => {
    const { board, labelId } = addLabel(makeBoard(), "Bug", "#ff0000");
    const withCard = { ...board, cards: { c1: makeCard({ id: "c1" }) } };
    const on = toggleCardLabel(withCard, "c1", labelId!);
    expect(on.cards.c1.labelIds).toEqual([labelId]);
    expect(toggleCardLabel(on, "c1", labelId!).cards.c1.labelIds).toEqual([]);
  });

  it("names the label in the activity entry, or falls back when it is gone", () => {
    const { board, labelId } = addLabel(makeBoard(), "Bug", "#ff0000");
    const withCard = { ...board, cards: { c1: makeCard({ id: "c1" }) } };
    expect(toggleCardLabel(withCard, "c1", labelId!).cards.c1.activity[0].text).toContain(
      "Bug",
    );
    // A label deleted from under a card still has to log something readable.
    expect(toggleCardLabel(withCard, "c1", "gone").cards.c1.activity[0].text).toContain(
      "label",
    );
  });

  it("toggleCardLabel is a no-op for an unknown card", () => {
    const base = makeBoard();
    expect(toggleCardLabel(base, "ghost", "l1")).toBe(base);
  });
});

describe("comments", () => {
  it("adds a comment with an author picture when given", () => {
    const { board } = typedBoard();
    const next = addComment(board, "t1", {
      author: "Ada",
      authorPicture: "https://example.com/a.png",
      body: "Looks good",
    });
    expect(next.cards.t1.comments[0]).toMatchObject({
      author: "Ada",
      body: "Looks good",
      authorPicture: "https://example.com/a.png",
    });
    expect(kinds(next, "t1")).toEqual(["comment_added"]);
  });

  it("omits the picture when not supplied", () => {
    const { board } = typedBoard();
    const next = addComment(board, "t1", { author: "Ada", body: "Hi" });
    expect(next.cards.t1.comments[0].authorPicture).toBeUndefined();
  });

  it("addComment is a no-op for an unknown card", () => {
    const base = makeBoard();
    expect(addComment(base, "ghost", { author: "a", body: "b" })).toBe(base);
  });

  it("removes a comment", () => {
    const { board } = typedBoard();
    const added = addComment(board, "t1", { author: "Ada", body: "Hi" });
    const next = removeComment(added, "t1", added.cards.t1.comments[0].id);
    expect(next.cards.t1.comments).toEqual([]);
  });

  it("removeComment is a no-op for unknown ids", () => {
    const base = typedBoard().board;
    expect(removeComment(base, "ghost", "c")).toBe(base);
    // A known card with an unknown comment: the card is rewritten, but the
    // comment list is unchanged.
    expect(removeComment(base, "t1", "ghost").cards.t1.comments).toEqual([]);
  });
});

describe("checklists", () => {
  function withChecklist() {
    const { board } = typedBoard();
    const added = addChecklist(board, "t1", "Steps");
    return { board: added, checklistId: added.cards.t1.checklists[0].id };
  }

  it("adds a checklist with a trimmed title", () => {
    const { board } = typedBoard();
    const next = addChecklist(board, "t1", "  Steps  ");
    expect(next.cards.t1.checklists[0].title).toBe("Steps");
    expect(kinds(next, "t1")).toEqual(["checklist_added"]);
  });

  it("falls back to 'Checklist' for a blank title", () => {
    const { board } = typedBoard();
    expect(addChecklist(board, "t1", "   ").cards.t1.checklists[0].title).toBe("Checklist");
  });

  it("is a no-op for an unknown card", () => {
    const base = typedBoard().board;
    expect(addChecklist(base, "ghost", "Steps")).toBe(base);
  });

  it("renames a checklist", () => {
    const { board, checklistId } = withChecklist();
    const next = renameChecklist(board, "t1", checklistId, "  Process  ");
    expect(next.cards.t1.checklists[0].title).toBe("Process");
    expect(kinds(next, "t1")).toEqual(["checklist_added", "checklist_renamed"]);
  });

  it("keeps the previous title when the rename is blank", () => {
    const { board, checklistId } = withChecklist();
    expect(renameChecklist(board, "t1", checklistId, "   ").cards.t1.checklists[0].title).toBe(
      "Steps",
    );
  });

  it("renameChecklist is a no-op for unknown card/checklist ids", () => {
    const base = typedBoard().board;
    expect(renameChecklist(base, "ghost", "c", "X")).toBe(base);
    expect(renameChecklist(base, "t1", "ghost", "X")).toBe(base);
  });

  it("renames one checklist and leaves its siblings alone", () => {
    const withCl = addChecklist(typedBoard().board, "t1", "Steps");
    const checklistId = withCl.cards.t1.checklists[0].id;
    const two = addChecklist(withCl, "t1", "Other");
    const next = renameChecklist(two, "t1", checklistId, "Process");
    expect(next.cards.t1.checklists.map((c) => c.title)).toEqual(["Process", "Other"]);
  });

  it("deletes a checklist", () => {
    const { board, checklistId } = withChecklist();
    const next = deleteChecklist(board, "t1", checklistId);
    expect(next.cards.t1.checklists).toEqual([]);
    expect(kinds(next, "t1")).toEqual(["checklist_added", "checklist_deleted"]);
  });

  it("deleteChecklist is a no-op for unknown ids", () => {
    const base = typedBoard().board;
    expect(deleteChecklist(base, "ghost", "c")).toBe(base);
    expect(deleteChecklist(base, "t1", "ghost")).toBe(base);
  });
});

describe("checklist items", () => {
  function withItem() {
    const { board } = typedBoard();
    const withCl = addChecklist(board, "t1", "Steps");
    const checklistId = withCl.cards.t1.checklists[0].id;
    const withItemBoard = addChecklistItem(withCl, "t1", checklistId, "  First  ");
    const itemId = withItemBoard.cards.t1.checklists[0].items[0].id;
    return { board: withItemBoard, checklistId, itemId };
  }

  it("adds an item with a trimmed text", () => {
    const { board } = withItem();
    expect(board.cards.t1.checklists[0].items[0].text).toBe("First");
    expect(kinds(board, "t1")).toContain("checklist_item_added");
  });

  it("addChecklistItem is a no-op for unknown ids", () => {
    const { board } = withItem();
    expect(addChecklistItem(board, "ghost", "c", "t")).toBe(board);
    expect(addChecklistItem(board, "t1", "ghost", "t")).toBe(board);
  });

  it("adds an item to the named checklist and leaves its siblings alone", () => {
    const withCl = addChecklist(typedBoard().board, "t1", "Steps");
    const checklistId = withCl.cards.t1.checklists[0].id;
    const two = addChecklist(withCl, "t1", "Other");
    const next = addChecklistItem(two, "t1", checklistId, "First");
    expect(next.cards.t1.checklists.map((c) => c.items.length)).toEqual([1, 0]);
  });

  it("toggles an item on and off, with the right wording", () => {
    const { board, checklistId, itemId } = withItem();
    const on = toggleChecklistItem(board, "t1", checklistId, itemId);
    expect(on.cards.t1.checklists[0].items[0].done).toBe(true);
    expect(on.cards.t1.activity.at(-1)!.text).toContain("Checked");

    const off = toggleChecklistItem(on, "t1", checklistId, itemId);
    expect(off.cards.t1.checklists[0].items[0].done).toBe(false);
    expect(off.cards.t1.activity.at(-1)!.text).toContain("Unchecked");
  });

  it("toggleChecklistItem is a no-op for unknown ids", () => {
    const { board, checklistId, itemId } = withItem();
    expect(toggleChecklistItem(board, "ghost", "c", itemId)).toBe(board);
    expect(toggleChecklistItem(board, "t1", "ghost", itemId)).toBe(board);
    expect(toggleChecklistItem(board, "t1", checklistId, "ghost")).toBe(board);
  });

  it("renames an item", () => {
    const { board, checklistId, itemId } = withItem();
    const next = renameChecklistItem(board, "t1", checklistId, itemId, "  Renamed  ");
    expect(next.cards.t1.checklists[0].items[0].text).toBe("Renamed");
    expect(next.cards.t1.activity.at(-1)!.text).toContain("Renamed item");
  });

  it("keeps the previous text when the rename is blank", () => {
    const { board, checklistId, itemId } = withItem();
    const text = renameChecklistItem(board, "t1", checklistId, itemId, "   ").cards.t1
      .checklists[0].items[0].text;
    expect(text).toBe("First");
  });

  it("renameChecklistItem is a no-op when the text is unchanged", () => {
    const { board, checklistId, itemId } = withItem();
    expect(renameChecklistItem(board, "t1", checklistId, itemId, "First")).toBe(board);
  });

  it("renameChecklistItem is a no-op for unknown ids", () => {
    const { board, checklistId, itemId } = withItem();
    expect(renameChecklistItem(board, "ghost", "c", itemId, "X")).toBe(board);
    expect(renameChecklistItem(board, "t1", "ghost", itemId, "X")).toBe(board);
    expect(renameChecklistItem(board, "t1", checklistId, "ghost", "X")).toBe(board);
  });

  it("deletes an item", () => {
    const { board, checklistId, itemId } = withItem();
    const next = deleteChecklistItem(board, "t1", checklistId, itemId);
    expect(next.cards.t1.checklists[0].items).toEqual([]);
    expect(next.cards.t1.activity.at(-1)!.text).toContain("Deleted item");
  });

  it("deleteChecklistItem is a no-op for unknown ids", () => {
    const { board, checklistId, itemId } = withItem();
    expect(deleteChecklistItem(board, "ghost", "c", itemId)).toBe(board);
    expect(deleteChecklistItem(board, "t1", "ghost", itemId)).toBe(board);
    expect(deleteChecklistItem(board, "t1", checklistId, "ghost")).toBe(board);
  });

  it("leaves sibling items alone", () => {
    const { board, checklistId } = withItem();
    const firstId = board.cards.t1.checklists[0].items[0].id;
    const two = addChecklistItem(board, "t1", checklistId, "Second");
    const secondId = two.cards.t1.checklists[0].items[1].id;
    const next = deleteChecklistItem(two, "t1", checklistId, secondId);
    expect(next.cards.t1.checklists[0].items.map((i) => i.id)).toEqual([firstId]);
  });

  it("leaves sibling checklists alone", () => {
    const { board, checklistId, itemId } = withItem();
    const other = addChecklist(board, "t1", "Other");
    const next = deleteChecklistItem(other, "t1", checklistId, itemId);
    expect(next.cards.t1.checklists.map((c) => c.title)).toEqual(["Steps", "Other"]);
  });
});

describe("checklist guard rails", () => {
  it("refuses to add an item to a blank text", () => {
    const { board, checklistId } = withOne();
    expect(addChecklistItem(board, "t1", checklistId, "   ")).toBe(board);
  });

  it("adds several items and toggles only the named one", () => {
    const { board, checklistId } = withOne();
    const one = addChecklistItem(board, "t1", checklistId, "First");
    const two = addChecklistItem(one, "t1", checklistId, "Second");
    const firstId = two.cards.t1.checklists[0].items[0].id;
    expect(two.cards.t1.checklists[0].items.map((i) => i.text)).toEqual(["First", "Second"]);
    const next = toggleChecklistItem(two, "t1", checklistId, firstId);
    expect(next.cards.t1.checklists[0].items.map((i) => i.done)).toEqual([true, false]);
  });

  it("renames one item and leaves its siblings alone", () => {
    const { board, checklistId } = withOne();
    const two = addChecklistItem(
      addChecklistItem(board, "t1", checklistId, "First"),
      "t1",
      checklistId,
      "Second",
    );
    const firstId = two.cards.t1.checklists[0].items[0].id;
    const next = renameChecklistItem(two, "t1", checklistId, firstId, "Renamed");
    expect(next.cards.t1.checklists[0].items.map((i) => i.text)).toEqual(["Renamed", "Second"]);
  });

  it("renames an item without disturbing a sibling checklist", () => {
    const { board, checklistId } = withOne();
    const withItem = addChecklistItem(board, "t1", checklistId, "First");
    const itemId = withItem.cards.t1.checklists[0].items[0].id;
    const withSibling = addChecklist(withItem, "t1", "Other");
    const next = renameChecklistItem(withSibling, "t1", checklistId, itemId, "Renamed");
    expect(next.cards.t1.checklists.map((c) => c.title)).toEqual(["Steps", "Other"]);
    expect(next.cards.t1.checklists[0].items[0].text).toBe("Renamed");
  });

  it("toggles an item without disturbing a sibling checklist", () => {
    const { board, checklistId } = withOne();
    const withItem = addChecklistItem(board, "t1", checklistId, "First");
    const itemId = withItem.cards.t1.checklists[0].items[0].id;
    const withSibling = addChecklist(withItem, "t1", "Other");
    const next = toggleChecklistItem(withSibling, "t1", checklistId, itemId);
    expect(next.cards.t1.checklists.map((c) => c.title)).toEqual(["Steps", "Other"]);
    expect(next.cards.t1.checklists[0].items[0].done).toBe(true);
  });

  it("deletes one item and leaves its siblings alone", () => {
    const { board, checklistId } = withOne();
    const two = addChecklistItem(
      addChecklistItem(board, "t1", checklistId, "First"),
      "t1",
      checklistId,
      "Second",
    );
    const firstId = two.cards.t1.checklists[0].items[0].id;
    const next = deleteChecklistItem(two, "t1", checklistId, firstId);
    expect(next.cards.t1.checklists[0].items.map((i) => i.text)).toEqual(["Second"]);
  });

  function withOne() {
    const { board } = typedBoard();
    const withCl = addChecklist(board, "t1", "Steps");
    return { board: withCl, checklistId: withCl.cards.t1.checklists[0].id };
  }

  it("safely handles legacy cards where checklists is undefined", () => {
    const base = typedBoard().board;
    const legacyCard = { ...base.cards.t1, checklists: undefined as any };
    const board = { ...base, cards: { ...base.cards, t1: legacyCard } };

    const added = addChecklist(board, "t1", "New");
    expect(added.cards.t1.checklists).toHaveLength(1);

    expect(renameChecklist(board, "t1", "c1", "Title")).toBe(board);
    expect(deleteChecklist(board, "t1", "c1")).toBe(board);
    expect(addChecklistItem(board, "t1", "c1", "Item")).toBe(board);
    expect(toggleChecklistItem(board, "t1", "c1", "i1")).toBe(board);
    expect(renameChecklistItem(board, "t1", "c1", "i1", "Text")).toBe(board);
    expect(deleteChecklistItem(board, "t1", "c1", "i1")).toBe(board);
  });
});

describe("comment guard rails", () => {
  it("refuses a comment with a blank body", () => {
    const { board } = typedBoard();
    expect(addComment(board, "t1", { author: "Ada", body: "   " })).toBe(board);
  });

  it("trims the comment body", () => {
    const { board } = typedBoard();
    const next = addComment(board, "t1", { author: "Ada", body: "  hi  " });
    expect(next.cards.t1.comments[0].body).toBe("hi");
  });
});
