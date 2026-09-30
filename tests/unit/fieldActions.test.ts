/**
 * Unit coverage for the generic custom-field / preset-option action creators.
 *
 * `fieldActions.ts` is the single implementation behind both board-level and
 * per-card-type fields. The two scopes branch on nearly every line (which
 * values bag a card carries, which field list is rewritten, which
 * `customFields` array survives), so the tests below are written per scope
 * rather than per function — a board-only suite would leave half the
 * conditionals unexercised.
 */

import { describe, it, expect } from "vitest";
import {
  addCustomField,
  updateCustomField,
  removeCustomField,
  setCardFieldValue,
  addPresetOption,
  updatePresetOption,
  removePresetOption,
  type FieldScope,
} from "../../src/state/fieldActions";
import { makeBoard, makeCard, presetField, withTypeField } from "./helpers/board";

const SCOPES: FieldScope[] = ["board", "task"];

describe("addCustomField", () => {
  it.each(SCOPES)("appends to the %s-scoped field list and trims the name", (scope) => {
    const base = scope === "board"
      ? makeBoard()
      : makeBoard(withTypeField("task", presetField("existing", [])));
    const before = fieldCount(base, scope);

    const { board, fieldId } = addCustomField(base, scope, {
      name: "  Effort  ",
      type: "number",
    });

    expect(fieldId).toEqual(expect.any(String));
    expect(fieldId).not.toBe("");
    expect(fieldCount(board, scope)).toBe(before + 1);
    expect(getField(board, scope, fieldId!)).toMatchObject({ name: "Effort" });
  });

  it.each(SCOPES)("rejects a %s-scoped field with a blank name", (scope) => {
    const base = makeBoard();
    const result = addCustomField(base, scope, { name: "   ", type: "short_text" });
    expect(result.fieldId).toBeNull();
    // Identity, not just equality — a no-op must not churn object identity.
    expect(result.board).toBe(base);
  });

  it("adds a field to a type that has no config row without throwing", () => {
    const base = makeBoard({
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [] },
      ],
    });
    const { board, fieldId } = addCustomField(base, "story", {
      name: "Risk",
      type: "short_text",
    });
    expect(fieldId).not.toBeNull();
    // The scope matches no config, so nothing is written — but no crash.
    expect(board.cardTypes).toEqual(base.cardTypes);
  });

  it("preserves the untouched sibling field lists", () => {
    const base = makeBoard({
      customFields: [{ id: "keep", name: "Keep", type: "short_text" }],
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [
          { id: "epic-keep", name: "Epic keep", type: "short_text" },
        ] },
        { type: "task", enabled: true, label: "Task", customFields: [] },
      ],
    });
    const { board } = addCustomField(base, "task", { name: "New", type: "short_text" });
    expect(board.customFields.map((f) => f.id)).toEqual(["keep"]);
    expect(board.cardTypes[0].customFields.map((f) => f.id)).toEqual(["epic-keep"]);
  });
});

describe("updateCustomField", () => {
  it.each(SCOPES)("patches the matching %s-scoped field and keeps its id", (scope) => {
    const base = withField(scope, "f1", "Original");
    const board = updateCustomField(base, scope, "f1", { name: "Renamed" });
    expect(getField(board, scope, "f1")).toMatchObject({ id: "f1", name: "Renamed" });
  });

  it.each(SCOPES)("ignores a patch that tries to rewrite the %s-scoped id", (scope) => {
    const base = withField(scope, "f1", "Original");
    const board = updateCustomField(base, scope, "f1", {
      id: "hijacked",
      name: "Renamed",
    } as never);
    expect(getField(board, scope, "f1")!.id).toBe("f1");
    expect(getField(board, scope, "hijacked")).toBeUndefined();
  });

  it.each(SCOPES)("is a structural no-op for an unknown %s-scoped field id", (scope) => {
    const base = withField(scope, "f1", "Original");
    const board = updateCustomField(base, scope, "nope", { name: "X" });
    expect(getFields(board, scope)).toEqual(getFields(base, scope));
  });

  it.each(SCOPES)("patches a %s-scoped field that does not exist in the list", (scope) => {
    const base = makeBoard();
    const board = updateCustomField(base, scope, "ghost", { name: "X" });
    expect(getFields(board, scope)).toEqual([]);
  });

  it("removes a type-scoped field from a type that has no config row", () => {
    const base = makeBoard({ cardTypes: [] });
    expect(() => removeCustomField(base, "task", "f1")).not.toThrow();
  });
});

describe("removeCustomField", () => {
  it.each(SCOPES)("drops the %s-scoped field and strips it from card values", (scope) => {
    const base = withField(scope, "f1", "Effort");
    const withCards = {
      ...base,
      cards: {
        c1: makeCard({
          id: "c1",
          boardFieldValues: { f1: 3, other: "keep" },
          typeFieldValues: { f1: 3, other: "keep" },
        }),
        c2: makeCard({ id: "c2" }),
      },
    };
    const board = removeCustomField(withCards, scope, "f1");
    expect(getFields(board, scope)).toEqual([]);
    const valueKey = scope === "board" ? "boardFieldValues" : "typeFieldValues";
    expect(board.cards.c1[valueKey]).toEqual({ other: "keep" });
    // The *other* scope's values are untouched.
    const otherKey = scope === "board" ? "typeFieldValues" : "boardFieldValues";
    expect(board.cards.c1[otherKey]).toEqual({ f1: 3, other: "keep" });
    // Cards without a value for the field pass through by reference.
    expect(board.cards.c2).toBe(withCards.cards.c2);
  });

  it("leaves the board-level list intact when removing a type-scoped field", () => {
    const base = makeBoard({
      customFields: [{ id: "boardf", name: "Board", type: "short_text" }],
      ...withTypeField("task", { id: "typef", name: "Type", type: "short_text" }),
    });
    const board = removeCustomField(base, "task", "typef");
    expect(board.customFields.map((f) => f.id)).toEqual(["boardf"]);
    expect(
      board.cardTypes.find((c) => c.type === "task")!.customFields,
    ).toEqual([]);
  });

  it("handles a card whose value bag is missing entirely", () => {
    const base = withField("board", "f1", "Effort");
    const bare = { ...base, cards: { c1: makeCard({ id: "c1" }) } };
    const board = removeCustomField(bare, "board", "f1");
    expect(board.cards.c1).toBe(bare.cards.c1);
  });
});

describe("setCardFieldValue", () => {
  it.each(SCOPES)("writes a %s-scoped value and bumps updatedAt", (scope) => {
    const card = makeCard({ id: "c1" });
    const base = { ...makeBoard(), cards: { c1: card } };
    const before = card.updatedAt;
    const board = setCardFieldValue(base, "c1", scope, "f1", 42);
    const valueKey = scope === "board" ? "boardFieldValues" : "typeFieldValues";
    expect(board.cards.c1[valueKey]).toEqual({ f1: 42 });
    expect(board.cards.c1.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("accepts string and boolean values too", () => {
    const base = { ...makeBoard(), cards: { c1: makeCard({ id: "c1" }) } };
    const s = setCardFieldValue(base, "c1", "board", "f1", "hello");
    expect(s.cards.c1.boardFieldValues.f1).toBe("hello");
    const b = setCardFieldValue(s, "c1", "board", "f2", true);
    expect(b.cards.c1.boardFieldValues.f2).toBe(true);
  });

  it("returns the same board for an unknown card", () => {
    const base = { ...makeBoard(), cards: { c1: makeCard({ id: "c1" }) } };
    expect(setCardFieldValue(base, "ghost", "board", "f1", 1)).toBe(base);
  });
});

describe("preset options", () => {
  it.each(SCOPES)("appends a trimmed option to a %s-scoped preset field", (scope) => {
    const base = withField(scope, "f1", "Size", "preset_list", []);
    const board = addPresetOption(base, scope, "f1", "  Large  ", "#ff0000");
    const opts = getField(board, scope, "f1")!.options!;
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ name: "Large", color: "#ff0000" });
  });

  it.each(SCOPES)("no-ops on a blank %s-scoped option name", (scope) => {
    const base = withField(scope, "f1", "Size", "preset_list", []);
    expect(addPresetOption(base, scope, "f1", "   ", "#ff0000")).toBe(base);
  });

  it("creates the options array when the field had none", () => {
    const base = withField("board", "f1", "Size", "preset_list", undefined);
    const board = addPresetOption(base, "board", "f1", "S", "#000000");
    expect(getField(board, "board", "f1")!.options).toHaveLength(1);
  });

  it("no-ops when the field id is not in the scoped list", () => {
    const base = withField("board", "f1", "Size", "preset_list", []);
    const board = addPresetOption(base, "board", "ghost", "S", "#000000");
    expect(getField(board, "board", "f1")!.options).toEqual([]);
  });

  it("no-ops when the scope has no field list at all", () => {
    const base = makeBoard({ cardTypes: [] });
    const board = addPresetOption(base, "task", "f1", "S", "#000000");
    expect(board.cardTypes).toEqual([]);
  });

  it("keeps a preset field's other options when the target is absent", () => {
    const base = withField("board", "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
    ]);
    const board = addPresetOption(base, "board", "other", "L", "#ffffff");
    expect(getField(board, "board", "f1")!.options!.map((o) => o.id)).toEqual(["o1"]);
  });

  it.each(SCOPES)("patches a %s-scoped field that has no options array", (scope) => {
    const base = withField(scope, "f1", "Size", "preset_list", undefined);
    const board = addPresetOption(base, scope, "f1", "S", "#000000");
    const opts = getField(board, scope, "f1")!.options!;
    const patched = updatePresetOption(board, scope, "f1", opts[0].id, { color: "#123456" });
    expect(getField(patched, scope, "f1")!.options![0].color).toBe("#123456");
  });

  it.each(SCOPES)("leaves a %s-scoped field's other option untouched when patching", (scope) => {
    const base = withField(scope, "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
      { id: "o2", name: "L", color: "#ffffff" },
    ]);
    const board = updatePresetOption(base, scope, "f1", "o1", { name: "Small" });
    expect(getField(board, scope, "f1")!.options!.map((o) => o.name)).toEqual(["Small", "L"]);
  });

  it.each(SCOPES)("patches a %s-scoped field whose sibling has no options", (scope) => {
    // The map runs over every field in the scope, so a sibling without an
    // options key exercises the `?? []` guard on the untouched branch.
    const base =
      scope === "board"
        ? makeBoard({
            customFields: [
              { id: "sibling", name: "Text", type: "short_text" },
              { id: "f1", name: "Size", type: "preset_list", options: [
                { id: "o1", name: "S", color: "#000000" },
              ] },
            ],
          })
        : makeBoard({
            cardTypes: [
              { type: "epic", enabled: true, label: "Epic", customFields: [] },
              { type: "task", enabled: true, label: "Task", customFields: [
                { id: "sibling", name: "Text", type: "short_text" },
                { id: "f1", name: "Size", type: "preset_list", options: [
                  { id: "o1", name: "S", color: "#000000" },
                ] },
              ] },
            ],
          });
    const board = updatePresetOption(base, scope, "f1", "o1", { name: "Small" });
    expect(getField(board, scope, "f1")!.options![0].name).toBe("Small");
    expect(getField(board, scope, "sibling")!.options).toBeUndefined();
  });

  it.each(SCOPES)("patches a %s-scoped option without letting the id change", (scope) => {
    const base = withField(scope, "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
    ]);
    const board = updatePresetOption(base, scope, "f1", "o1", {
      name: "Small",
      id: "hijacked",
    } as never);
    const opts = getField(board, scope, "f1")!.options!;
    expect(opts[0]).toMatchObject({ id: "o1", name: "Small" });
  });

  it("tolerates a preset field with no options array when patching", () => {
    const base = withField("board", "f1", "Size", "preset_list", undefined);
    const board = updatePresetOption(base, "board", "f1", "o1", { name: "X" });
    expect(getField(board, "board", "f1")!.options).toEqual([]);
  });

  it("removes the option and clears it from matching card values", () => {
    const base = withField("board", "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
      { id: "o2", name: "L", color: "#ffffff" },
    ]);
    const withCards = {
      ...base,
      cards: {
        c1: makeCard({ id: "c1", boardFieldValues: { f1: "o1", other: "keep" } }),
        c2: makeCard({ id: "c2", boardFieldValues: { f1: "o2" } }),
        c3: makeCard({ id: "c3" }),
      },
    };
    const board = removePresetOption(withCards, "board", "f1", "o1");
    expect(getField(board, "board", "f1")!.options!.map((o) => o.id)).toEqual(["o2"]);
    expect(board.cards.c1.boardFieldValues).toEqual({ other: "keep" });
    // Value pointed at a surviving option: kept.
    expect(board.cards.c2.boardFieldValues).toEqual({ f1: "o2" });
    expect(board.cards.c3).toBe(withCards.cards.c3);
  });

  it("strips the type-scoped value bag, not the board-scoped one", () => {
    const base = withField("task", "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
    ]);
    const withCards = {
      ...base,
      cards: {
        c1: makeCard({
          id: "c1",
          boardFieldValues: { f1: "o1" },
          typeFieldValues: { f1: "o1" },
        }),
      },
    };
    const board = removePresetOption(withCards, "task", "f1", "o1");
    expect(board.cards.c1.typeFieldValues).toEqual({});
    expect(board.cards.c1.boardFieldValues).toEqual({ f1: "o1" });
  });

  it("removes an option from a field that has no options array", () => {
    const base = withField("board", "f1", "Size", "preset_list", undefined);
    const board = removePresetOption(base, "board", "f1", "o1");
    expect(getField(board, "board", "f1")!.options).toEqual([]);
  });

  it("is a no-op for an option id that is not there", () => {
    const base = withField("board", "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
    ]);
    const board = removePresetOption(base, "board", "f1", "nope");
    expect(getField(board, "board", "f1")!.options!.map((o) => o.id)).toEqual(["o1"]);
  });

  it("gives a sibling field in the same scope an empty options list", () => {
    const base = makeBoard({
      customFields: [
        { id: "target", name: "Size", type: "preset_list", options: [
          { id: "o1", name: "S", color: "#000000" },
        ] },
        { id: "sibling", name: "Other", type: "short_text" },
      ],
    });
    const board = removePresetOption(base, "board", "target", "o1");
    // The sibling has no options key at all, so the ?? [] guard is what
    // keeps this from rewriting it to undefined.
    expect(getField(board, "board", "sibling")!.options).toBeUndefined();
    expect(getField(board, "board", "target")!.options).toEqual([]);
  });

  it("removes an option from a type-scoped field alongside a plain sibling", () => {
    const base = makeBoard({
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [] },
        { type: "task", enabled: true, label: "Task", customFields: [
          { id: "sibling", name: "Text", type: "short_text" },
          { id: "f1", name: "Size", type: "preset_list", options: [
            { id: "o1", name: "S", color: "#000000" },
          ] },
        ] },
      ],
    });
    const board = removePresetOption(base, "task", "f1", "o1");
    expect(getField(board, "task", "f1")!.options).toEqual([]);
    expect(getField(board, "task", "sibling")!.options).toBeUndefined();
  });

  it("gives an options-less field in the scope an empty list", () => {
    const base = makeBoard({
      cardTypes: [
        { type: "epic", enabled: true, label: "Epic", customFields: [] },
        { type: "task", enabled: true, label: "Task", customFields: [
          { id: "f1", name: "Size", type: "preset_list" },
        ] },
      ],
    });
    const board = removePresetOption(base, "task", "f1", "o1");
    expect(getField(board, "task", "f1")!.options).toEqual([]);
  });

  it("is a no-op for a field id that is not there", () => {
    const base = withField("board", "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
    ]);
    const board = removePresetOption(base, "board", "ghost", "o1");
    expect(getField(board, "board", "f1")!.options!.map((o) => o.id)).toEqual(["o1"]);
  });

  it("leaves every card alone when none references the option", () => {
    const base = withField("board", "f1", "Size", "preset_list", [
      { id: "o1", name: "S", color: "#000000" },
      { id: "o2", name: "L", color: "#ffffff" },
    ]);
    const withCards = {
      ...base,
      cards: { c1: makeCard({ id: "c1", boardFieldValues: { other: "x" } }) },
    };
    const board = removePresetOption(withCards, "board", "f1", "o1");
    expect(board.cards.c1).toBe(withCards.cards.c1);
  });
});

// ─── helpers ───────────────────────────────────────────────────────

function getFields(board: ReturnType<typeof makeBoard>, scope: FieldScope) {
  return scope === "board"
    ? board.customFields
    : board.cardTypes.find((c) => c.type === scope)?.customFields ?? [];
}

function getField(
  board: ReturnType<typeof makeBoard>,
  scope: FieldScope,
  id: string,
) {
  return getFields(board, scope).find((f) => f.id === id);
}

function fieldCount(board: ReturnType<typeof makeBoard>, scope: FieldScope) {
  return getFields(board, scope).length;
}

function withField(
  scope: FieldScope,
  id: string,
  name: string,
  type: "short_text" | "preset_list" = "short_text",
  options?: { id: string; name: string; color: string }[],
) {
  const field = {
    id,
    name,
    type,
    ...(options ? { options } : {}),
  } as never;
  return scope === "board"
    ? makeBoard({ customFields: [field] })
    : makeBoard(withTypeField(scope, field));
}
