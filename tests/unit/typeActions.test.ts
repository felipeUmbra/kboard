/**
 * Unit coverage for the per-card-type action wrappers and the done-column
 * toggles.
 *
 * Most of this module is thin delegation to `fieldActions`; the value of the
 * tests is two-fold. First, `setDoneColumn` is the only place that decides
 * whether a column counts toward progress, and its two no-op guards are what
 * keep repeated toggles from duplicating ids. Second, the wrappers are the
 * seam the board settings UI calls, so an argument-order regression (cardId
 * and type swapped, say) would be invisible to the model tests.
 */

import { describe, it, expect } from "vitest";
import {
  setCardTypeEnabled,
  setCardTypeLabel,
  getCardTypeConfig,
  setDoneColumn,
  addCustomFieldForType,
  updateCustomFieldForType,
  removeCustomFieldForType,
  setCardTypeFieldValue,
  addPresetOptionForType,
  updatePresetOptionForType,
  removePresetOptionForType,
  cryptoRandomId,
} from "../../src/state/typeActions";
import { makeBoard, makeCard, withTypeField } from "./helpers/board";

const TYPES = ["epic", "story", "task"] as const;

describe("setCardTypeEnabled", () => {
  it.each(TYPES)("disables %s and leaves the other types alone", (type) => {
    const base = makeBoard();
    const board = setCardTypeEnabled(base, type, false);
    for (const t of TYPES) {
      expect(getCardTypeConfig(board, t)!.enabled).toBe(t === type ? false : true);
    }
  });

  it("re-enables a type", () => {
    const base = setCardTypeEnabled(makeBoard(), "story", false);
    expect(getCardTypeConfig(setCardTypeEnabled(base, "story", true), "story")!.enabled).toBe(true);
  });

  it("is a no-op for a type the board has no config row for", () => {
    const base = makeBoard({ cardTypes: [] });
    const board = setCardTypeEnabled(base, "task", false);
    expect(board.cardTypes).toEqual([]);
  });

  it("preserves the rest of the config", () => {
    const base = makeBoard(withTypeField("task", { id: "f", name: "F", type: "short_text" }));
    const board = setCardTypeEnabled(base, "task", false);
    expect(getCardTypeConfig(board, "task")!.customFields).toHaveLength(1);
  });
});

describe("setCardTypeLabel", () => {
  it("renames the matching type's display label", () => {
    const board = setCardTypeLabel(makeBoard(), "epic", "Initiative");
    expect(getCardTypeConfig(board, "epic")!.label).toBe("Initiative");
  });

  it("stores an empty label verbatim rather than rejecting it", () => {
    const board = setCardTypeLabel(makeBoard(), "epic", "");
    expect(getCardTypeConfig(board, "epic")!.label).toBe("");
  });

  it("does not change the enabled flag", () => {
    const base = setCardTypeEnabled(makeBoard(), "epic", false);
    const board = setCardTypeLabel(base, "epic", "Initiative");
    expect(getCardTypeConfig(board, "epic")!.enabled).toBe(false);
  });
});

describe("getCardTypeConfig", () => {
  it("returns the config for a known type", () => {
    const config = getCardTypeConfig(makeBoard(), "story");
    expect(config).toMatchObject({ type: "story", enabled: true });
  });

  it("returns undefined for an unknown type", () => {
    expect(getCardTypeConfig(makeBoard(), "sprint" as never)).toBeUndefined();
  });
});

describe("setDoneColumn", () => {
  it("adds a column to the done set", () => {
    const board = setDoneColumn(makeBoard(), "col-todo", true);
    expect(board.doneColumnIds).toEqual(["col-done", "col-todo"]);
  });

  it("removes a column from the done set", () => {
    const board = setDoneColumn(makeBoard(), "col-done", false);
    expect(board.doneColumnIds).toEqual([]);
  });

  it("returns the same board when adding a column that is already done", () => {
    const base = makeBoard();
    expect(setDoneColumn(base, "col-done", true)).toBe(base);
  });

  it("returns the same board when removing a column that is not done", () => {
    const base = makeBoard();
    expect(setDoneColumn(base, "col-todo", false)).toBe(base);
  });

  it("round-trips: add then remove restores the original list", () => {
    const base = makeBoard();
    const added = setDoneColumn(base, "col-todo", true);
    const removed = setDoneColumn(added, "col-todo", false);
    expect(removed.doneColumnIds).toEqual(base.doneColumnIds);
  });
});

describe("per-type field wrappers", () => {
  const withF = () =>
    makeBoard(withTypeField("task", { id: "f1", name: "Effort", type: "short_text" }));

  it("addCustomFieldForType appends to the type's list and returns the new id", () => {
    const { board, fieldId } = addCustomFieldForType(withF(), "task", {
      name: "Risk",
      type: "short_text",
    });
    expect(fieldId).not.toBeNull();
    expect(
      getCardTypeConfig(board, "task")!.customFields.map((f) => f.id),
    ).toEqual(["f1", fieldId]);
  });

  it("addCustomFieldForType rejects a blank name and returns the board unchanged", () => {
    const base = withF();
    const r = addCustomFieldForType(base, "task", { name: " ", type: "short_text" });
    expect(r.fieldId).toBeNull();
    expect(r.board).toBe(base);
  });

  it("updateCustomFieldForType patches only the target type's field", () => {
    const board = updateCustomFieldForType(withF(), "task", "f1", { name: "Points" });
    expect(getCardTypeConfig(board, "task")!.customFields[0].name).toBe("Points");
  });

  it("removeCustomFieldForType drops the field and its card values", () => {
    const base = {
      ...withF(),
      cards: { c1: makeCard({ id: "c1", typeFieldValues: { f1: 5, other: "k" } }) },
    };
    const board = removeCustomFieldForType(base, "task", "f1");
    expect(getCardTypeConfig(board, "task")!.customFields).toEqual([]);
    expect(board.cards.c1.typeFieldValues).toEqual({ other: "k" });
  });

  it("setCardTypeFieldValue writes into the type-scoped bag, not the board bag", () => {
    const base = { ...withF(), cards: { c1: makeCard({ id: "c1" }) } };
    const board = setCardTypeFieldValue(base, "c1", "task", "f1", 7);
    expect(board.cards.c1.typeFieldValues).toEqual({ f1: 7 });
    expect(board.cards.c1.boardFieldValues).toEqual({});
  });

  it("setCardTypeFieldValue is a no-op for an unknown card", () => {
    const base = { ...withF(), cards: {} };
    expect(setCardTypeFieldValue(base, "ghost", "task", "f1", 7)).toBe(base);
  });
});

describe("per-type preset option wrappers", () => {
  const withPreset = () =>
    makeBoard(
      withTypeField("task", {
        id: "f1",
        name: "Size",
        type: "preset_list",
        options: [{ id: "o1", name: "S", color: "#000000" }],
      }),
    );

  const options = (b: ReturnType<typeof makeBoard>) =>
    getCardTypeConfig(b, "task")!.customFields[0].options!;

  it("addPresetOptionForType appends a trimmed option", () => {
    const board = addPresetOptionForType(withPreset(), "task", "f1", "  L ", "#ffffff");
    expect(options(board).map((o) => o.name)).toEqual(["S", "L"]);
  });

  it("addPresetOptionForType no-ops on a blank name", () => {
    const base = withPreset();
    expect(addPresetOptionForType(base, "task", "f1", "  ", "#fff")).toBe(base);
  });

  it("updatePresetOptionForType patches the named option", () => {
    const board = updatePresetOptionForType(withPreset(), "task", "f1", "o1", {
      name: "Small",
    });
    expect(options(board)[0]).toMatchObject({ id: "o1", name: "Small" });
  });

  it("removePresetOptionForType drops the option and clears card values", () => {
    const base = {
      ...withPreset(),
      cards: { c1: makeCard({ id: "c1", typeFieldValues: { f1: "o1" } }) },
    };
    const board = removePresetOptionForType(base, "task", "f1", "o1");
    expect(options(board)).toEqual([]);
    expect(board.cards.c1.typeFieldValues).toEqual({});
  });

  it("leaves board-level preset fields alone", () => {
    const base = makeBoard({
      customFields: [
        {
          id: "bf",
          name: "BoardSize",
          type: "preset_list",
          options: [{ id: "bo", name: "B", color: "#000000" }],
        },
      ],
      ...withTypeField("task", {
        id: "f1",
        name: "Size",
        type: "preset_list",
        options: [{ id: "o1", name: "S", color: "#000000" }],
      }),
    });
    const board = removePresetOptionForType(base, "task", "f1", "o1");
    expect(board.customFields[0].options!.map((o) => o.id)).toEqual(["bo"]);
  });
});

describe("cryptoRandomId re-export", () => {
  it("produces unique non-empty ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => cryptoRandomId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).not.toBe("");
  });
});
