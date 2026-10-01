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

  it("falls back to a timestamp-based id when randomUUID is unavailable", () => {
    // Older Safari and any non-secure context lack randomUUID. The fallback
    // has to still produce a unique, non-empty id.
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
    });
    try {
      const id = cryptoRandomId();
      expect(id).toMatch(/^id-[a-z0-9]+$/);
      expect(new Set(Array.from({ length: 100 }, () => cryptoRandomId())).size).toBe(100);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: original,
        configurable: true,
      });
    }
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

  // The cases below are the ones a real Drive payload hits but a hand-written
  // fixture never does: boards written by an older build, boards hand-edited
  // in the Drive UI, and boards truncated by a partial sync. Every one of them
  // has to degrade to a usable board rather than throwing on load.
  describe("resilience to partial or hostile input", () => {
    it("accepts a completely empty object", () => {
      const board = normalizeBoard({});
      expect(board.columns).toEqual([]);
      expect(board.cards).toEqual({});
      expect(board.cardTypes).toHaveLength(3);
    });

    it("falls back to a generated id and name for non-string values", () => {
      const board = normalizeBoard({ id: 42, name: 99 });
      expect(typeof board.id).toBe("string");
      expect(board.id.length).toBeGreaterThan(0);
      expect(board.name).toBe("Untitled board");
    });

    it("keeps the drive metadata when present and drops it otherwise", () => {
      expect(
        normalizeBoard({ driveFileId: "f1", driveVersion: "v1" }),
      ).toMatchObject({ driveFileId: "f1", driveVersion: "v1" });
      const bare = normalizeBoard({});
      expect(bare.driveFileId).toBeUndefined();
      expect(bare.driveVersion).toBeUndefined();
    });

    it("stamps createdAt/updatedAt only when they are numbers", () => {
      expect(normalizeBoard({ createdAt: "yesterday" }).createdAt).toBeGreaterThan(0);
      expect(normalizeBoard({ createdAt: 1234, updatedAt: 5678 })).toMatchObject({
        createdAt: 1234,
        updatedAt: 5678,
      });
    });

    it("gives a column with no cardIds an empty list", () => {
      const board = normalizeBoard({ columns: [{ id: "c1", name: "To do" }] });
      expect(board.columns[0].cardIds).toEqual([]);
    });

    it("filters non-string entries out of doneColumnIds", () => {
      const board = normalizeBoard({ doneColumnIds: ["c1", 5, null, "c2"] });
      expect(board.doneColumnIds).toEqual(["c1", "c2"]);
    });

    // ─── savedViews ───────────────────────────────────────────────
    // Per-entry validation lives in `normalizeSavedViews`; these cases assert
    // that `normalizeBoard` wires it in and degrades rather than throwing.

    it("defaults savedViews to an empty array when absent", () => {
      expect(normalizeBoard({}).savedViews).toEqual([]);
    });

    it("defaults savedViews to an empty array when not an array", () => {
      expect(normalizeBoard({ savedViews: "nope" }).savedViews).toEqual([]);
      expect(normalizeBoard({ savedViews: { a: 1 } }).savedViews).toEqual([]);
    });

    it("keeps valid savedViews in order", () => {
      const board = normalizeBoard({
        savedViews: [
          { id: "v1", name: "Bugs", filter: { cardTypes: ["task"] } },
          { id: "v2", name: "Urgent", filter: { done: "done" } },
        ],
      });
      expect(board.savedViews?.map((v) => v.name)).toEqual(["Bugs", "Urgent"]);
    });

    it("drops malformed savedViews entries but keeps the good ones", () => {
      const board = normalizeBoard({
        savedViews: [
          { id: "v1", name: "Keep", filter: {} },
          null,
          { name: "No id" },
          { id: "v2", filter: {} },
          { id: "v3", name: "  ", filter: {} },
          { id: "v4", name: "No filter" },
        ],
      });
      expect(board.savedViews?.map((v) => v.name)).toEqual(["Keep"]);
    });

    it("resolves duplicate savedView names first-wins", () => {
      const board = normalizeBoard({
        savedViews: [
          { id: "v1", name: "Bugs", filter: {} },
          { id: "v2", name: "bugs", filter: {} },
        ],
      });
      expect(board.savedViews?.map((v) => v.id)).toEqual(["v1"]);
    });

    it("drops duplicate savedView ids", () => {
      const board = normalizeBoard({
        savedViews: [
          { id: "same", name: "A", filter: {} },
          { id: "same", name: "B", filter: {} },
        ],
      });
      expect(board.savedViews?.map((v) => v.name)).toEqual(["A"]);
    });

    it("stamps missing savedView timestamps", () => {
      const board = normalizeBoard({ savedViews: [{ id: "v", name: "A", filter: {} }] });
      expect(board.savedViews?.[0].createdAt).toBeGreaterThan(0);
      expect(board.savedViews?.[0].updatedAt).toBeGreaterThan(0);
    });

    it("does not throw on a wholly malformed board that only has savedViews", () => {
      expect(() =>
        normalizeBoard({ savedViews: [undefined, 0, "", [], { id: 1 }] }),
      ).not.toThrow();
    });

    it("detects a done column regardless of case or padding", () => {
      const board = normalizeBoard({
        columns: [
          { id: "c1", name: "  done  ", cardIds: [] },
          { id: "c2", name: "DONE", cardIds: [] },
          { id: "c3", name: "To do", cardIds: [] },
        ],
      });
      expect(board.doneColumnIds).toEqual(["c1", "c2"]);
    });

    it("falls back to the default card-type configs when none are supplied", () => {
      const board = normalizeBoard({ cardTypes: "nope" });
      expect(board.cardTypes.map((c) => c.type)).toEqual(["epic", "story", "task"]);
      expect(board.cardTypes.every((c) => c.enabled)).toBe(true);
    });

    it("ignores card-type entries with an unknown type", () => {
      const board = normalizeBoard({
        cardTypes: [
          { type: "sprint", enabled: true, label: "Sprint", customFields: [] },
          { type: "story", enabled: false, label: "Story", customFields: [] },
        ],
      });
      expect(board.cardTypes.map((c) => c.type)).toEqual(["epic", "story", "task"]);
      expect(board.cardTypes.find((c) => c.type === "story")).toMatchObject({
        enabled: false,
        label: "Story",
      });
    });

    it("ignores card-type entries that are null or have no string type", () => {
      const board = normalizeBoard({
        cardTypes: [null, { enabled: true, label: "No type", customFields: [] }, { type: 42 }],
      });
      expect(board.cardTypes.map((c) => c.type)).toEqual(["epic", "story", "task"]);
      // All three fall back to their default label rather than "No type".
      expect(board.cardTypes.map((c) => c.label)).toEqual(["Epic", "Story", "Task"]);
    });

    it("ignores a card-type entry that is not an object", () => {
      const board = normalizeBoard({ cardTypes: ["story", 7, true] });
      expect(board.cardTypes.map((c) => c.type)).toEqual(["epic", "story", "task"]);
    });

    it("drops a card-type entry with a customFields value that is not an array", () => {
      const board = normalizeBoard({
        cardTypes: [{ type: "task", enabled: true, label: "Task", customFields: "nope" }],
      });
      expect(board.cardTypes.find((c) => c.type === "task")!.customFields).toEqual([]);
    });

    it("lets a later entry win over an earlier one for the same type", () => {
      const board = normalizeBoard({
        cardTypes: [
          { type: "story", enabled: true, label: "First", customFields: [] },
          { type: "story", enabled: false, label: "Second", customFields: [] },
        ],
      });
      expect(board.cardTypes.find((c) => c.type === "story")).toMatchObject({
        enabled: false,
        label: "Second",
      });
    });

    it("treats enabled as true for anything other than an explicit false", () => {
      const board = normalizeBoard({
        cardTypes: [
          { type: "epic", enabled: 0, customFields: [] },
          { type: "task", enabled: undefined, customFields: [] },
        ],
      });
      expect(board.cardTypes.find((c) => c.type === "epic")!.enabled).toBe(true);
      expect(board.cardTypes.find((c) => c.type === "task")!.enabled).toBe(true);
    });

    it("repairs a card-type entry with a blank or missing label", () => {
      const board = normalizeBoard({
        cardTypes: [
          { type: "epic", enabled: true, label: "   ", customFields: [] },
          { type: "story", enabled: true, customFields: [] },
        ],
      });
      expect(board.cardTypes.find((c) => c.type === "epic")!.label).toBe("Epic");
      expect(board.cardTypes.find((c) => c.type === "story")!.label).toBe("Story");
    });

    it("repairs a card-type entry with malformed customFields", () => {
      const board = normalizeBoard({
        cardTypes: [
          {
            type: "task",
            enabled: true,
            label: "Task",
            customFields: [{ id: "f1", type: "short_text" }, null, { type: "nope" }],
          },
        ],
      });
      expect(board.cardTypes.find((c) => c.type === "task")!.customFields).toEqual([
        { id: "f1", type: "short_text" },
      ]);
    });

    it("treats a non-object cards map as empty", () => {
      expect(normalizeBoard({ cards: "nope" }).cards).toEqual({});
      expect(normalizeBoard({ cards: 5 }).cards).toEqual({});
    });

    it("normalizes a null card entry rather than dropping the key", () => {
      const board = normalizeBoard({ cards: { c1: null } });
      expect(board.cards.c1).toMatchObject({
        id: "c1",
        type: "task",
        title: "Untitled",
      });
    });

    it("normalizes a string or number card entry to defaults", () => {
      const board = normalizeBoard({ cards: { c1: "junk", c2: 7 } });
      expect(board.cards.c1.title).toBe("Untitled");
      expect(board.cards.c2.type).toBe("task");
    });

    it("skips a done column whose name is not a string", () => {
      const board = normalizeBoard({
        columns: [
          { id: "c1", name: 42, cardIds: [] },
          { id: "c2", name: "Done", cardIds: [] },
        ],
      });
      expect(board.doneColumnIds).toEqual(["c2"]);
    });

    it("skips a null column when detecting the done set", () => {
      const board = normalizeBoard({
        columns: [null, { id: "c2", name: "Done", cardIds: [] }],
      });
      expect(board.doneColumnIds).toEqual(["c2"]);
    });

    it("drops a column with no string id", () => {
      const board = normalizeBoard({
        columns: [{ name: "Done" }, "junk", { id: "c2", name: "Done", cardIds: [] }],
      });
      expect(board.columns.map((c) => c.id)).toEqual(["c2"]);
      expect(board.doneColumnIds).toEqual(["c2"]);
    });
  });

  describe("normalizeCard field repair", () => {
    const card = (raw: unknown) => normalizeBoard({ cards: { c1: raw } }).cards.c1;

    it("defaults an unknown type to task", () => {
      expect(card({ type: "sprint" }).type).toBe("task");
      expect(card({ type: 42 }).type).toBe("task");
    });

    it("keeps a valid type", () => {
      expect(card({ type: "epic" }).type).toBe("epic");
    });

    it("rejects dates that are not ISO YYYY-MM-DD", () => {
      expect(card({ startDate: "2026-1-1" }).startDate).toBeNull();
      expect(card({ dueDate: "01/01/2026" }).dueDate).toBeNull();
      expect(card({ startDate: 20260101 }).startDate).toBeNull();
      expect(card({ startDate: "2026-01-01" }).startDate).toBe("2026-01-01");
      expect(card({ dueDate: "2026-12-31" }).dueDate).toBe("2026-12-31");
    });

    it("filters non-string entries out of labelIds and parentIds", () => {
      const c = card({ labelIds: ["l1", 5, null], parentIds: ["p1", {}, "p2"] });
      expect(c.labelIds).toEqual(["l1"]);
      expect(c.parentIds).toEqual(["p1", "p2"]);
    });

    it("ignores a legacy parentId that is not a usable string", () => {
      expect(card({ parentId: "" }).parentIds).toEqual([]);
      expect(card({ parentId: 5 }).parentIds).toEqual([]);
    });

    it("prefers parentIds over the legacy parentId when both are present", () => {
      expect(card({ parentIds: ["new"], parentId: "old" }).parentIds).toEqual(["new"]);
    });

    it("escapes HTML in a legacy description", () => {
      const html = card({ description: '<script>alert("x")</script>' }).descriptionHtml;
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&quot;x&quot;");
    });

    it("escapes every character in the HTML escape table", () => {
      // & < > " ' are the five entities escapeHtml handles.
      const html = card({ description: "&<>\"'" }).descriptionHtml;
      expect(html).toBe("<p>&amp;&lt;&gt;&quot;&#39;</p>");
    });

    it("prefers descriptionHtml over the legacy description", () => {
      expect(card({ descriptionHtml: "<p>rich</p>", description: "plain" }).descriptionHtml).toBe(
        "<p>rich</p>",
      );
    });

    it("keeps a non-object customFieldValues bag out of the result", () => {
      expect(card({ boardFieldValues: "nope" }).boardFieldValues).toEqual({});
      expect(card({ typeFieldValues: 5 }).typeFieldValues).toEqual({});
    });

    it("falls back to the legacy bag when the modern key is not an object", () => {
      expect(card({ boardFieldValues: 5, customFieldValues: { f1: "v" } }).boardFieldValues)
        .toEqual({ f1: "v" });
      expect(card({ boardFieldValues: "nope", customFieldValues: { f1: "v" } }).boardFieldValues)
        .toEqual({ f1: "v" });
      // With neither key usable, the bag is empty.
      expect(card({ boardFieldValues: 5 }).boardFieldValues).toEqual({});
    });

    it("keeps a typeFieldValues bag of the wrong type out of the result", () => {
      // The type bag has no legacy counterpart, so there is nothing to fall
      // back to — it just empties.
      expect(card({ typeFieldValues: "nope" }).typeFieldValues).toEqual({});
      expect(card({ typeFieldValues: null }).typeFieldValues).toEqual({});
    });

    it("keeps a usable boardFieldValues bag and ignores the legacy key", () => {
      expect(
        card({ boardFieldValues: { f1: "v" }, customFieldValues: { f1: "old" } })
          .boardFieldValues,
      ).toEqual({ f1: "v" });
    });

    it("keeps a usable typeFieldValues bag", () => {
      expect(card({ typeFieldValues: { f1: 3 } }).typeFieldValues).toEqual({ f1: 3 });
    });

    it("migrates the legacy customFieldValues bag to boardFieldValues", () => {
      expect(card({ customFieldValues: { f1: "v" } }).boardFieldValues).toEqual({ f1: "v" });
      // And the modern key wins when both are present.
      expect(
        card({ boardFieldValues: { f1: "new" }, customFieldValues: { f1: "old" } })
          .boardFieldValues,
      ).toEqual({ f1: "new" });
    });

    it("filters malformed activity entries", () => {
      const c = card({
        activity: [
          { id: "a1", kind: "created", text: "ok", at: 1 },
          { id: "a2", kind: "created" },
          null,
          "nope",
        ],
      });
      expect(c.activity).toEqual([{ id: "a1", kind: "created", text: "ok", at: 1 }]);
    });

    it("defaults a non-array activity log to empty", () => {
      expect(card({ activity: "nope" }).activity).toEqual([]);
    });

    it("filters malformed comments", () => {
      const c = card({
        comments: [
          { id: "c1", author: "Ada", body: "hi", at: 1 },
          { id: "c2", author: "Ada", at: 1 },
          undefined,
        ],
      });
      expect(c.comments).toEqual([{ id: "c1", author: "Ada", body: "hi", at: 1 }]);
    });

    it("defaults a non-array comments list to empty", () => {
      expect(card({ comments: {} }).comments).toEqual([]);
    });

    it("filters a comment whose body or author is not a string", () => {
      const c = card({
        comments: [
          { id: "c1", author: "Ada", body: "hi", at: 1 },
          { id: "c2", author: 42, body: "hi", at: 1 },
          { id: "c3", author: "Ada", body: null, at: 1 },
        ],
      });
      expect(c.comments).toHaveLength(1);
    });

    it("filters an activity entry whose at is not a number", () => {
      const c = card({
        activity: [{ id: "a1", kind: "created", text: "ok", at: "now" }],
      });
      expect(c.activity).toEqual([]);
    });

    it("drops a checklist that is missing its shape", () => {
      const c = card({
        checklists: [
          { id: "cl1", title: "Steps", items: [] },
          { id: "cl2", title: "No items" },
          { title: "No id", items: [] },
          null,
        ],
      });
      expect(c.checklists).toEqual([{ id: "cl1", title: "Steps", items: [] }]);
    });

    it("filters malformed checklist items but keeps the checklist", () => {
      const c = card({
        checklists: [
          {
            id: "cl1",
            title: "Steps",
            items: [
              { id: "i1", text: "first", done: false },
              { id: "i2", text: "no done" },
              { id: "i3", text: "x", done: "yes" },
              null,
            ],
          },
        ],
      });
      expect(c.checklists[0].items).toEqual([{ id: "i1", text: "first", done: false }]);
    });

    it("defaults a non-array checklists value to empty", () => {
      expect(card({ checklists: "nope" }).checklists).toEqual([]);
    });

    it("keeps valid timestamps and substitutes now for the rest", () => {
      const c = card({ createdAt: 10, updatedAt: 20 });
      expect(c).toMatchObject({ createdAt: 10, updatedAt: 20 });
      const bad = card({ createdAt: "10", updatedAt: "20" });
      expect(bad.createdAt).toBeGreaterThan(0);
      expect(bad.updatedAt).toBeGreaterThan(0);
    });
  });
});
