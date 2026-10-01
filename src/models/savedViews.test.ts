import { describe, it, expect } from "vitest";
import {
  addSavedView,
  deleteSavedView,
  findSavedView,
  normalizeSavedView,
  normalizeSavedViews,
  renameSavedView,
  updateSavedView,
  validateViewName,
} from "./savedViews";
import type { SavedView } from "./types";

function makeView(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: "view-1",
    name: "My view",
    filter: { cardTypes: ["task"] },
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("validateViewName", () => {
  it("accepts a fresh unique name", () => {
    expect(validateViewName("Bugs", [])).toBeNull();
  });

  it("rejects a blank name", () => {
    expect(validateViewName("", [])).toMatch(/enter a name/i);
    expect(validateViewName("   ", [])).toMatch(/enter a name/i);
  });

  it("rejects a duplicate name case-insensitively", () => {
    const views = [makeView({ name: "Bugs" })];
    expect(validateViewName("bugs", views)).toMatch(/already exists/i);
    expect(validateViewName("BUGS", views)).toMatch(/already exists/i);
  });

  it("rejects a duplicate that differs only by surrounding whitespace", () => {
    const views = [makeView({ name: "Bugs" })];
    expect(validateViewName("  Bugs  ", views)).toMatch(/already exists/i);
  });

  it("allows a view to keep its own name when renaming", () => {
    const views = [makeView({ id: "v1", name: "Bugs" })];
    expect(validateViewName("Bugs", views, "v1")).toBeNull();
  });

  it("still rejects a rename onto a different view's name", () => {
    const views = [
      makeView({ id: "v1", name: "Bugs" }),
      makeView({ id: "v2", name: "Urgent" }),
    ];
    expect(validateViewName("Urgent", views, "v1")).toMatch(/already exists/i);
  });

  it("accepts distinct names", () => {
    const views = [makeView({ name: "Bugs" })];
    expect(validateViewName("Urgent", views)).toBeNull();
  });

  it("rejects a name longer than the limit", () => {
    expect(validateViewName("x".repeat(61), [])).toMatch(/60 characters/i);
    expect(validateViewName("x".repeat(60), [])).toBeNull();
  });

  it("measures the limit after trimming", () => {
    expect(validateViewName(`  ${"x".repeat(60)}  `, [])).toBeNull();
  });
});

describe("normalizeSavedView", () => {
  it("returns a valid view unchanged", () => {
    const v = makeView();
    expect(normalizeSavedView(v)).toEqual(v);
  });

  it("preserves the stored name verbatim including interior spacing", () => {
    // Trimming on read would silently rename the user's view.
    expect(normalizeSavedView(makeView({ name: " My  view " }))?.name).toBe(
      " My  view ",
    );
  });

  it("returns null for non-object input", () => {
    expect(normalizeSavedView(null)).toBeNull();
    expect(normalizeSavedView(undefined)).toBeNull();
    expect(normalizeSavedView("a string")).toBeNull();
    expect(normalizeSavedView(42)).toBeNull();
  });

  it("returns null when the id is missing or not a string", () => {
    expect(normalizeSavedView({ ...makeView(), id: undefined })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), id: 5 })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), id: "" })).toBeNull();
  });

  it("returns null when the name is missing, blank or not a string", () => {
    expect(normalizeSavedView({ ...makeView(), name: undefined })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), name: "" })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), name: "   " })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), name: 7 })).toBeNull();
  });

  it("returns null when the filter is missing or not an object", () => {
    expect(normalizeSavedView({ ...makeView(), filter: undefined })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), filter: null })).toBeNull();
    expect(normalizeSavedView({ ...makeView(), filter: "none" })).toBeNull();
  });

  it("rejects an array filter", () => {
    expect(normalizeSavedView({ ...makeView(), filter: [] })).toBeNull();
  });

  it("defaults missing timestamps to now", () => {
    const before = Date.now();
    const v = normalizeSavedView({
      id: "v",
      name: "n",
      filter: {},
    });
    expect(v?.createdAt).toBeGreaterThanOrEqual(before);
    expect(v?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("keeps supplied timestamps", () => {
    expect(
      normalizeSavedView({ id: "v", name: "n", filter: {}, createdAt: 7, updatedAt: 9 }),
    ).toMatchObject({ createdAt: 7, updatedAt: 9 });
  });
});

describe("normalizeSavedViews", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeSavedViews(undefined)).toEqual([]);
    expect(normalizeSavedViews(null)).toEqual([]);
    expect(normalizeSavedViews({})).toEqual([]);
    expect(normalizeSavedViews("nope")).toEqual([]);
  });

  it("keeps valid entries in order", () => {
    const a = makeView({ id: "a", name: "A" });
    const b = makeView({ id: "b", name: "B" });
    expect(normalizeSavedViews([a, b])).toEqual([a, b]);
  });

  it("drops malformed entries but keeps the good ones", () => {
    const good = makeView({ id: "a", name: "A" });
    const out = normalizeSavedViews([good, null, { id: "x" }, makeView({ name: "" })]);
    expect(out).toEqual([good]);
  });

  it("resolves duplicate names first-wins", () => {
    const first = makeView({ id: "a", name: "Bugs" });
    const dup = makeView({ id: "b", name: "bugs" });
    expect(normalizeSavedViews([first, dup])).toEqual([first]);
  });

  it("drops duplicate ids", () => {
    // React keys would collide and update-in-place would be ambiguous.
    const first = makeView({ id: "same", name: "A" });
    const dup = makeView({ id: "same", name: "B" });
    expect(normalizeSavedViews([first, dup])).toEqual([first]);
  });
});

describe("addSavedView", () => {
  it("appends a new view", () => {
    const out = addSavedView([], "Bugs", { cardTypes: ["task"] }, 123);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Bugs", createdAt: 123, updatedAt: 123 });
    expect(out[0].id).toBeTruthy();
  });

  it("trims the stored name", () => {
    expect(addSavedView([], "  Bugs  ", {}, 1)[0].name).toBe("Bugs");
  });

  it("generates a unique id", () => {
    const a = addSavedView([], "A", {}, 1);
    const b = addSavedView(a, "B", {}, 1);
    expect(a[0].id).not.toBe(b[1].id);
  });

  it("is a no-op for a duplicate name", () => {
    const first = addSavedView([], "Bugs", {}, 1);
    const out = addSavedView(first, "bugs", {}, 2);
    expect(out).toBe(first);
    expect(out).toHaveLength(1);
  });

  it("is a no-op for a blank name", () => {
    expect(addSavedView([], "   ", {}, 1)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const views = [makeView()];
    addSavedView(views, "New", {}, 1);
    expect(views).toHaveLength(1);
  });
});

describe("updateSavedView", () => {
  it("replaces the filter and bumps updatedAt", () => {
    const views = [makeView()];
    const out = updateSavedView(views, "view-1", { labelIds: ["l1"] }, 555);
    expect(out[0].filter).toEqual({ labelIds: ["l1"] });
    expect(out[0].updatedAt).toBe(555);
  });

  it("preserves id, name and createdAt", () => {
    const out = updateSavedView([makeView()], "view-1", {}, 555);
    expect(out[0]).toMatchObject({
      id: "view-1",
      name: "My view",
      createdAt: 1000,
    });
  });

  it("leaves other views untouched", () => {
    const views = [makeView({ id: "a" }), makeView({ id: "b", name: "B" })];
    const out = updateSavedView(views, "a", { done: "done" }, 5);
    expect(out[1].filter).toEqual({ cardTypes: ["task"] });
  });

  it("is a no-op for an unknown id", () => {
    const views = [makeView()];
    expect(updateSavedView(views, "nope", {}, 5)).toBe(views);
  });

  it("leaves a view whose id matches but which is not the target untouched", () => {
    // Covers the false arm of the `v.id === id` ternary inside the map.
    const views = [makeView({ id: "a" }), makeView({ id: "b", name: "B" })];
    const out = updateSavedView(views, "b", { done: "done" }, 5);
    expect(out[0].filter).toEqual({ cardTypes: ["task"] });
    expect(out[0].updatedAt).toBe(1000);
  });

  it("updates in place rather than duplicating", () => {
    const out = updateSavedView([makeView()], "view-1", { done: "done" }, 5);
    expect(out).toHaveLength(1);
  });
});

describe("renameSavedView", () => {
  it("renames and bumps updatedAt", () => {
    const out = renameSavedView([makeView()], "view-1", "Renamed", 777);
    expect(out[0].name).toBe("Renamed");
    expect(out[0].updatedAt).toBe(777);
  });

  it("trims the name", () => {
    expect(renameSavedView([makeView()], "view-1", "  x  ", 1)[0].name).toBe("x");
  });

  it("is a no-op for an unknown id", () => {
    const views = [makeView()];
    expect(renameSavedView(views, "nope", "x", 1)).toBe(views);
  });

  it("leaves other views untouched", () => {
    // Covers the false arm of the `v.id === id` ternary inside the map.
    const views = [makeView({ id: "a" }), makeView({ id: "b", name: "B" })];
    const out = renameSavedView(views, "b", "Renamed", 5);
    expect(out[0].name).toBe("My view");
    expect(out[0].updatedAt).toBe(1000);
  });
});

describe("deleteSavedView", () => {
  it("removes the matching view", () => {
    const views = [makeView({ id: "a" }), makeView({ id: "b" })];
    expect(deleteSavedView(views, "a").map((v) => v.id)).toEqual(["b"]);
  });

  it("is a no-op for an unknown id", () => {
    expect(deleteSavedView([makeView()], "nope")).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const views = [makeView()];
    deleteSavedView(views, "view-1");
    expect(views).toHaveLength(1);
  });
});

describe("findSavedView", () => {
  it("finds by id", () => {
    const v = makeView();
    expect(findSavedView([v], "view-1")).toBe(v);
  });

  it("returns undefined for a null id", () => {
    expect(findSavedView([makeView()], null)).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(findSavedView([makeView()], "nope")).toBeUndefined();
  });
});