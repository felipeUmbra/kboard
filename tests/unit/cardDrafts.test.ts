/**
 * Unit coverage for the card-draft store.
 *
 * The store is the safety net behind unsaved card edits, and its whole value
 * is in the edges: a discarded tombstone must not be resurrected by a
 * rehydrate, malformed localStorage must not crash the app on boot, and
 * `get` must never surface another card's draft. `cardDrafts` reads
 * localStorage on every operation rather than caching, so each test here
 * drives the real serialisation path — no store stubbing, because stubbing
 * would skip exactly the parse/serialise code that is the risk.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cardDrafts } from "../../src/state/cardDrafts";

const KEY = "kboard:card-drafts";

const read = () => localStorage.getItem(KEY);
const write = (v: unknown) => localStorage.setItem(KEY, JSON.stringify(v));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("cardDrafts.set / get", () => {
  it("round-trips a draft", () => {
    cardDrafts.set("c1", { title: "Edited", descriptionHtml: "<p>x</p>", updatedAt: 0 });
    expect(cardDrafts.get("c1")).toEqual({
      title: "Edited",
      descriptionHtml: "<p>x</p>",
      // The store owns updatedAt, so the caller's value is replaced.
      updatedAt: Date.now(),
    });
  });

  it("stamps updatedAt on every write", () => {
    cardDrafts.set("c1", { title: "A", descriptionHtml: "", updatedAt: 0 });
    const first = cardDrafts.get("c1")!.updatedAt;
    vi.setSystemTime(new Date("2026-03-02T00:00:00Z"));
    cardDrafts.set("c1", { title: "B", descriptionHtml: "", updatedAt: 0 });
    expect(cardDrafts.get("c1")!.updatedAt).toBeGreaterThan(first);
    expect(cardDrafts.get("c1")!.title).toBe("B");
  });

  it("returns null for an unknown card", () => {
    expect(cardDrafts.get("ghost")).toBeNull();
  });

  it("keeps drafts for different cards isolated", () => {
    cardDrafts.set("c1", { title: "One", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.set("c2", { title: "Two", descriptionHtml: "", updatedAt: 0 });
    expect(cardDrafts.get("c1")!.title).toBe("One");
    expect(cardDrafts.get("c2")!.title).toBe("Two");
  });

  it("returns null once a draft is discarded", () => {
    cardDrafts.set("c1", { title: "Edited", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.discard("c1");
    expect(cardDrafts.get("c1")).toBeNull();
  });

  it("keeps the tombstone in storage so a later delete is well defined", () => {
    cardDrafts.set("c1", { title: "Edited", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.discard("c1");
    expect(JSON.parse(read()!)).toMatchObject({
      c1: { title: "Edited", discarded: true },
    });
  });

  it("discarding an unknown card is a no-op and writes nothing", () => {
    cardDrafts.discard("ghost");
    expect(read()).toBeNull();
  });

  it("a set after a discard clears the tombstone", () => {
    cardDrafts.set("c1", { title: "Edited", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.discard("c1");
    cardDrafts.set("c1", { title: "Edited again", descriptionHtml: "", updatedAt: 0 });
    expect(cardDrafts.get("c1")).toMatchObject({ title: "Edited again" });
  });
});

describe("cardDrafts.delete", () => {
  it("removes the entry entirely", () => {
    cardDrafts.set("c1", { title: "Edited", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.delete("c1");
    expect(cardDrafts.get("c1")).toBeNull();
    expect(JSON.parse(read()!)).toEqual({});
  });

  it("deleting an unknown card leaves the others alone", () => {
    cardDrafts.set("c1", { title: "One", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.delete("ghost");
    expect(cardDrafts.get("c1")).toBeTruthy();
  });
});

describe("cardDrafts.clear", () => {
  it("wipes every draft", () => {
    cardDrafts.set("c1", { title: "One", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.set("c2", { title: "Two", descriptionHtml: "", updatedAt: 0 });
    cardDrafts.clear();
    expect(cardDrafts.get("c1")).toBeNull();
    expect(cardDrafts.get("c2")).toBeNull();
  });
});

describe("malformed storage", () => {
  it("treats a JSON array as empty rather than indexing into it", () => {
    write(["not", "a", "map"]);
    expect(cardDrafts.get("c1")).toBeNull();
    // And a subsequent write replaces the junk.
    cardDrafts.set("c1", { title: "Ok", descriptionHtml: "", updatedAt: 0 });
    expect(cardDrafts.get("c1")!.title).toBe("Ok");
  });

  it("treats a JSON scalar as empty", () => {
    write("just a string");
    expect(cardDrafts.get("c1")).toBeNull();
  });

  it("treats a JSON null as empty", () => {
    localStorage.setItem(KEY, "null");
    expect(cardDrafts.get("c1")).toBeNull();
  });

  it("survives unparseable JSON", () => {
    localStorage.setItem(KEY, "{ not json");
    expect(cardDrafts.get("c1")).toBeNull();
    expect(() =>
      cardDrafts.set("c1", { title: "Ok", descriptionHtml: "", updatedAt: 0 }),
    ).not.toThrow();
  });

  it("treats an empty string as empty", () => {
    localStorage.setItem(KEY, "");
    expect(cardDrafts.get("c1")).toBeNull();
  });

  it("survives a storage quota failure on write", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });
    // The in-memory path is best-effort: a throw here must not reach the UI.
    expect(() =>
      cardDrafts.set("c1", { title: "Ok", descriptionHtml: "", updatedAt: 0 }),
    ).not.toThrow();
    setItem.mockRestore();
  });

  it("survives a storage read failure", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("SecurityError");
      });
    expect(cardDrafts.get("c1")).toBeNull();
    expect(() => cardDrafts.discard("c1")).not.toThrow();
    expect(() => cardDrafts.delete("c1")).not.toThrow();
    getItem.mockRestore();
  });
});
