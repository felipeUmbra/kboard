import { describe, it, expect } from "vitest";
import type { Board, Card } from "./types";
import { getChildren, getGroupedChildren } from "./relations";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    type: "task",
    title: "Test",
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

function makeBoard(cards: Record<string, Card>): Board {
  return {
    id: "board-1",
    name: "Test",
    labels: [],
    customFields: [],
    cardTypes: [],
    doneColumnIds: [],
    columns: [],
    cards,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("getChildren", () => {
  it("returns all children of a parent", () => {
    const parent = makeCard({ id: "parent", type: "epic" });
    const child1 = makeCard({ id: "c1", type: "story", parentIds: ["parent"] });
    const child2 = makeCard({ id: "c2", type: "story", parentIds: ["parent"] });
    const unrelated = makeCard({ id: "u1", type: "task", parentIds: [] });

    const board = makeBoard({ parent, child1: child1, child2: child2, u1: unrelated });
    const children = getChildren(board, "parent");
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id)).toContain("c1");
    expect(children.map((c) => c.id)).toContain("c2");
  });

  it("filters by type when types are specified", () => {
    const epic = makeCard({ id: "epic", type: "epic" });
    const story = makeCard({ id: "s1", type: "story", parentIds: ["epic"] });
    const task = makeCard({ id: "t1", type: "task", parentIds: ["epic"] });

    const board = makeBoard({ epic, s1: story, t1: task });
    expect(getChildren(board, "epic", ["story"])).toHaveLength(1);
    expect(getChildren(board, "epic", ["task"])).toHaveLength(1);
    expect(getChildren(board, "epic", ["story", "task"])).toHaveLength(2);
  });

  it("returns empty array when parent has no children", () => {
    const board = makeBoard({
      orphan: makeCard({ id: "orphan", type: "story" }),
    });
    expect(getChildren(board, "orphan")).toHaveLength(0);
  });
});

describe("getGroupedChildren", () => {
  it("separates stories and tasks", () => {
    const epic = makeCard({ id: "epic", type: "epic" });
    const story = makeCard({ id: "s1", type: "story", parentIds: ["epic"] });
    const task = makeCard({ id: "t1", type: "task", parentIds: ["epic"] });

    const board = makeBoard({ epic, s1: story, t1: task });
    const result = getGroupedChildren(board, "epic");
    expect(result.stories).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.stories[0].id).toBe("s1");
    expect(result.tasks[0].id).toBe("t1");
  });
});
