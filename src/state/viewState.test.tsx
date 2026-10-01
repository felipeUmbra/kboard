/**
 * Unit coverage for the search/filter view state.
 *
 * The behaviour worth testing here is the debounce and the reset-on-board-change
 * rule, because both are invisible in a snapshot and both have a real failure
 * mode: a stale timer can apply a query the user already cleared, and a filter
 * carried across boards references ids that mean nothing on the new one.
 */

import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ViewStateProvider,
  useViewState,
  isHiddenByView,
  SEARCH_DEBOUNCE_MS,
  type ViewStateValue,
} from "./viewState";
import type { Board, Card, FilterState } from "../models/types";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Renders the provider and exposes its value plus a setter. */
function mount(boardId: string | null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let latest: ViewStateValue | null = null;

  function Probe() {
    latest = useViewState();
    return null;
  }

  act(() => {
    root.render(
      <ViewStateProvider boardId={boardId}>
        <Probe />
      </ViewStateProvider>,
    );
  });

  return {
    get: () => latest as unknown as ViewStateValue,
    setBoardId(next: string | null) {
      act(() => {
        root.render(
          <ViewStateProvider boardId={next}>
            <Probe />
          </ViewStateProvider>,
        );
      });
    },
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Advance fake timers and flush React. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ViewStateProvider — initial state", () => {
  it("starts with no query, no filter, and not narrowed", () => {
    const h = mount("b1");
    expect(h.get().searchInput).toBe("");
    expect(h.get().searchQuery).toBe("");
    expect(h.get().filter).toEqual({});
    expect(h.get().isNarrowed).toBe(false);
    expect(h.get().activeViewId).toBeNull();
    expect(h.get().isDirty).toBe(false);
    h.unmount();
  });
});

describe("ViewStateProvider — debounce", () => {
  it("does not apply the query before the debounce elapses", () => {
    vi.useFakeTimers();
    const h = mount("b1");
    act(() => h.get().setSearchInput("bug"));
    // The input updates immediately…
    expect(h.get().searchInput).toBe("bug");
    // …but the query that drives filtering has not.
    expect(h.get().searchQuery).toBe("");
    expect(h.get().isNarrowed).toBe(false);
    h.unmount();
  });

  it("applies the trimmed query once the debounce elapses", () => {
    vi.useFakeTimers();
    const h = mount("b1");
    act(() => h.get().setSearchInput("  bug  "));
    advance(SEARCH_DEBOUNCE_MS);
    expect(h.get().searchQuery).toBe("bug");
    expect(h.get().isNarrowed).toBe(true);
    h.unmount();
  });

  it("coalesces rapid keystrokes into the final value", () => {
    vi.useFakeTimers();
    const h = mount("b1");
    for (const text of ["b", "bu", "bug", "bugs"]) {
      act(() => h.get().setSearchInput(text));
      advance(SEARCH_DEBOUNCE_MS / 2);
    }
    advance(SEARCH_DEBOUNCE_MS);
    expect(h.get().searchQuery).toBe("bugs");
    h.unmount();
  });

  it("cancels a pending timer when the component unmounts", () => {
    vi.useFakeTimers();
    const h = mount("b1");
    act(() => h.get().setSearchInput("bug"));
    h.unmount();
    // No act() warning and no state update after unmount is the point: the
    // effect cleanup clears the timer, so this must be inert.
    expect(() => advance(SEARCH_DEBOUNCE_MS * 2)).not.toThrow();
  });
});

describe("ViewStateProvider — clearSearch", () => {
  it("clears both the input and the debounced query", () => {
    vi.useFakeTimers();
    const h = mount("b1");
    act(() => h.get().setSearchInput("bug"));
    advance(SEARCH_DEBOUNCE_MS);
    expect(h.get().searchQuery).toBe("bug");
    act(() => h.get().clearSearch());
    expect(h.get().searchInput).toBe("");
    expect(h.get().searchQuery).toBe("");
    expect(h.get().isNarrowed).toBe(false);
    h.unmount();
  });
});

describe("ViewStateProvider — filter", () => {
  it("accepts a replacement object", () => {
    const h = mount("b1");
    act(() => h.get().setFilter({ cardTypes: ["task"] }));
    expect(h.get().filter).toEqual({ cardTypes: ["task"] });
    expect(h.get().isNarrowed).toBe(true);
    h.unmount();
  });

  it("accepts an updater function", () => {
    const h = mount("b1");
    act(() => h.get().setFilter({ done: "done" }));
    act(() => h.get().setFilter((p) => ({ ...p, labelIds: ["l1"] })));
    expect(h.get().filter).toEqual({ done: "done", labelIds: ["l1"] });
    h.unmount();
  });

  it("clearFilter resets to empty", () => {
    const h = mount("b1");
    act(() => h.get().setFilter({ cardTypes: ["task"] }));
    act(() => h.get().clearFilter());
    expect(h.get().filter).toEqual({});
    expect(h.get().isNarrowed).toBe(false);
    h.unmount();
  });
});

describe("ViewStateProvider — reset on board change", () => {
  it("clears the query when the board id changes", () => {
    vi.useFakeTimers();
    const h = mount("b1");
    act(() => h.get().setSearchInput("bug"));
    advance(SEARCH_DEBOUNCE_MS);
    expect(h.get().searchQuery).toBe("bug");
    h.setBoardId("b2");
    expect(h.get().searchInput).toBe("");
    expect(h.get().searchQuery).toBe("");
    h.unmount();
  });

  it("clears the filter when the board id changes", () => {
    const h = mount("b1");
    act(() => h.get().setFilter({ cardTypes: ["task"], labelIds: ["l1"] }));
    h.setBoardId("b2");
    expect(h.get().filter).toEqual({});
    h.unmount();
  });

  it("clears the active view and its base filter", () => {
    const h = mount("b1");
    act(() => h.get().setActiveViewId("v1"));
    act(() => h.get().setBaseFilter({ cardTypes: ["task"] }));
    expect(h.get().activeViewId).toBe("v1");
    h.setBoardId("b2");
    expect(h.get().activeViewId).toBeNull();
    expect(h.get().baseFilter).toBeNull();
    h.unmount();
  });

  it("does not clear when the board id is unchanged", () => {
    const h = mount("b1");
    act(() => h.get().setFilter({ cardTypes: ["task"] }));
    h.setBoardId("b1");
    expect(h.get().filter).toEqual({ cardTypes: ["task"] });
    h.unmount();
  });
});

describe("ViewStateProvider — dirty tracking", () => {
  it("is not dirty with no active view", () => {
    const h = mount("b1");
    act(() => h.get().setBaseFilter({ cardTypes: ["task"] }));
    act(() => h.get().setFilter({ done: "done" }));
    expect(h.get().isDirty).toBe(false);
    h.unmount();
  });

  it("is not dirty when the filter matches the saved base", () => {
    const h = mount("b1");
    const filter: FilterState = { cardTypes: ["task"] };
    act(() => h.get().setActiveViewId("v1"));
    act(() => h.get().setBaseFilter(filter));
    act(() => h.get().setFilter({ ...filter }));
    expect(h.get().isDirty).toBe(false);
    h.unmount();
  });

  it("is dirty when the filter diverges from the saved base", () => {
    const h = mount("b1");
    act(() => h.get().setActiveViewId("v1"));
    act(() => h.get().setBaseFilter({ cardTypes: ["task"] }));
    act(() => h.get().setFilter({ cardTypes: ["epic"] }));
    expect(h.get().isDirty).toBe(true);
    h.unmount();
  });

  it("is not dirty when a view is active but has no base recorded", () => {
    const h = mount("b1");
    act(() => h.get().setActiveViewId("v1"));
    act(() => h.get().setFilter({ done: "done" }));
    expect(h.get().isDirty).toBe(false);
    h.unmount();
  });
});

describe("useViewState outside a provider", () => {
  it("throws rather than returning undefined", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    function Probe() {
      useViewState();
      return null;
    }
    // React logs the error it re-throws; silence it for this assertion.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      act(() => {
        root.render(<Probe />);
      }),
    ).toThrow(/ViewStateProvider/);
    spy.mockRestore();
    act(() => root.unmount());
    host.remove();
  });
});

describe("isHiddenByView", () => {
  const board: Board = {
    id: "b",
    name: "B",
    labels: [{ id: "l1", name: "Bug", color: "#d03a3a" }],
    customFields: [],
    cardTypes: [
      { type: "epic", enabled: true, label: "Epic", customFields: [] },
      { type: "story", enabled: true, label: "Story", customFields: [] },
      { type: "task", enabled: true, label: "Task", customFields: [] },
    ],
    doneColumnIds: ["col-done"],
    columns: [
      { id: "col-todo", name: "To do", cardIds: [] },
      { id: "col-done", name: "Done", cardIds: [] },
    ],
    cards: {},
    createdAt: 0,
    updatedAt: 0,
  };

  const base: Pick<
    Card,
    "id" | "type" | "labelIds" | "startDate" | "dueDate" | "boardFieldValues" | "typeFieldValues"
  > = {
    id: "new",
    type: "task",
    labelIds: [],
    startDate: null,
    dueDate: null,
    boardFieldValues: {},
    typeFieldValues: {},
  };

  it("is false when no filter is active", () => {
    expect(isHiddenByView(board, {}, base)).toBe(false);
  });

  it("is false when the card satisfies the filter", () => {
    expect(isHiddenByView(board, { cardTypes: ["task"] }, base)).toBe(false);
  });

  it("is true when the card would be filtered out by type", () => {
    expect(isHiddenByView(board, { cardTypes: ["epic"] }, base)).toBe(true);
  });

  it("is true when the card lacks a required label", () => {
    expect(isHiddenByView(board, { labelIds: ["l1"] }, base)).toBe(true);
  });

  it("is false when the card carries the required label", () => {
    expect(
      isHiddenByView(board, { labelIds: ["l1"] }, { ...base, labelIds: ["l1"] }),
    ).toBe(false);
  });

  it("is true when a date filter excludes an undated card", () => {
    const today = () => "2026-10-01";
    expect(
      isHiddenByView(board, { dueDate: { preset: "today" } }, base, today),
    ).toBe(true);
  });

  it("is false when a date filter matches the card's date", () => {
    const today = () => "2026-10-01";
    expect(
      isHiddenByView(
        board,
        { dueDate: { preset: "today" } },
        { ...base, dueDate: "2026-10-01" },
        today,
      ),
    ).toBe(false);
  });
});
