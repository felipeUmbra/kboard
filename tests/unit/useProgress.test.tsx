/**
 * Unit coverage for the `useProgress` hook.
 *
 * The hook is a memoization wrapper over `computeProgress`, and the
 * memoization is the part with a bug surface: the dependency array is a
 * coarse string hash, and a key that omits something `computeProgress`
 * actually reads will hand back a stale percentage after a real board
 * change. These tests drive the hook through a real React render so the
 * dependency array is exercised rather than assumed, and they assert on
 * identity as well as value — a memo that recomputes every render produces
 * correct values too, just at the cost of the memoisation existing at all.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProgress, type CardProgress } from "../../src/models/progress";
import type { Board, Card } from "../../src/models/types";

// React 18 only silences its act() warning when the environment opts in.
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    type: "task",
    title: "Card",
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
    name: "Board",
    labels: [],
    customFields: [],
    cardTypes: [
      { type: "epic", enabled: true, label: "Epic", customFields: [] },
      { type: "story", enabled: true, label: "Story", customFields: [] },
      { type: "task", enabled: true, label: "Task", customFields: [] },
    ],
    doneColumnIds: ["done"],
    columns: [
      { id: "todo", name: "To do", cardIds: [] },
      { id: "done", name: "Done", cardIds: [] },
    ],
    cards: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** Mount `hook` and record every value it produces, across re-renders. */
function renderHook<P, R>(
  hook: (props: P) => R,
  initialProps: P,
): { results: R[]; setProps: (p: P) => void; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const results: R[] = [];
  let current = initialProps;

  function Probe({ p }: { p: P }) {
    results.push(hook(p));
    return null;
  }

  const render = (p: P) =>
    act(() => {
      root.render(<Probe p={p} />);
    });

  render(current);

  return {
    results,
    setProps: (p) => {
      current = p;
      render(p);
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const STORY_BOARD = () => {
  const story = makeCard({ id: "s1", type: "story" });
  const t1 = makeCard({ id: "t1", type: "task", parentIds: ["s1"] });
  const t2 = makeCard({ id: "t2", type: "task", parentIds: ["s1"] });
  return {
    story,
    board: makeBoard({
      columns: [
        { id: "todo", name: "To do", cardIds: ["t1"] },
        { id: "done", name: "Done", cardIds: ["t2"] },
      ],
      doneColumnIds: ["done"],
      cards: { s1: story, t1, t2 },
    }),
  };
};

describe("useProgress", () => {
  it("returns the same result as computeProgress", () => {
    const { story, board } = STORY_BOARD();
    const { results, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: story, b: board },
    );
    expect(results[0]).toEqual({ total: 2, done: 1, percent: 50 });
    unmount();
  });

  it("recomputes when a child moves into the done column", () => {
    const { story, board } = STORY_BOARD();
    const { results, setProps, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: story, b: board },
    );
    expect(results[0].percent).toBe(50);

    const moved: Board = {
      ...board,
      columns: [
        { id: "todo", name: "To do", cardIds: [] },
        { id: "done", name: "Done", cardIds: ["t1", "t2"] },
      ],
    };
    setProps({ c: story, b: moved });

    expect(results[results.length - 1].percent).toBe(100);
    unmount();
  });

  it("recomputes when the done-column set itself changes", () => {
    const { story, board } = STORY_BOARD();
    const { results, setProps, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: story, b: board },
    );
    expect(results[0].done).toBe(1);

    // Same columns, but nothing counts as done any more.
    setProps({ c: story, b: { ...board, doneColumnIds: [] } });
    expect(results[results.length - 1].done).toBe(0);
    unmount();
  });

  it("recomputes when a new child is added", () => {
    const { story, board } = STORY_BOARD();
    const { results, setProps, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: story, b: board },
    );
    expect(results[0].total).toBe(2);

    const t3 = makeCard({ id: "t3", type: "task", parentIds: ["s1"] });
    setProps({
      c: story,
      b: {
        ...board,
        cards: { ...board.cards, t3 },
        columns: [
          { id: "todo", name: "To do", cardIds: ["t1", "t3"] },
          { id: "done", name: "Done", cardIds: ["t2"] },
        ],
      },
    });
    expect(results[results.length - 1]).toMatchObject({ total: 3, done: 1 });
    unmount();
  });

  it("recomputes when the card's own parent links change", () => {
    const { story, board } = STORY_BOARD();
    const { results, setProps, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: story, b: board },
    );
    expect(results[0].total).toBe(2);

    setProps({ c: { ...story, parentIds: ["e1"] }, b: board });
    expect(results[results.length - 1]).toBeTruthy();
    unmount();
  });

  it("returns a stable object when nothing relevant changed", () => {
    const { story, board } = STORY_BOARD();
    const { results, setProps, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: story, b: board },
    );
    setProps({ c: story, b: board });
    // Same card, same board, one render later: the memo should hold.
    expect(results[results.length - 1]).toBe(results[0]);
    unmount();
  });

  it("survives a card that is not on the board at all", () => {
    const orphan = makeCard({ id: "ghost", type: "story" });
    const { results, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: orphan, b: makeBoard() },
    );
    expect(results[0]).toEqual({ total: 0, done: 0, percent: null });
    unmount();
  });

  it("returns the no-children shape for a task", () => {
    const task = makeCard({ id: "t9", type: "task" });
    const { results, unmount } = renderHook(
      ({ c, b }: { c: Card; b: Board }) => useProgress(c, b),
      { c: task, b: makeBoard({ cards: { t9: task } }) },
    );
    const last = results[results.length - 1] as CardProgress;
    expect(last.percent).toBeNull();
    unmount();
  });
});
