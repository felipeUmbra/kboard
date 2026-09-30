/**
 * Unit coverage for the actions barrel and the board/column action creators.
 *
 * `actionsIndex.ts` exists only to give `BoardContext` one import path, and
 * `actions.ts` is small. Both are cheap to pin down, and both are places
 * where a rename in one module and not the other would surface as a
 * `buildActions` import failure at runtime rather than at compile time.
 *
 * The barrel test is deliberately an explicit export manifest rather than a
 * `typeof import(...)` check: the point is that removing an export breaks
 * `boardActions.ts`, so a renamed action should fail here first, with a
 * readable message.
 */

import { describe, it, expect } from "vitest";
import * as actionsIndex from "../../src/state/actionsIndex";
import * as cardActions from "../../src/state/cardActions";
import * as typeActions from "../../src/state/typeActions";
import * as fieldActions from "../../src/state/fieldActions";
import * as boardColumnActions from "../../src/state/actions";
import { makeBoard } from "./helpers/board";
import { normalizeBoard } from "../../src/models/migrations";

describe("actionsIndex barrel", () => {
  const EXPECTED = [
    // actions.ts
    "renameBoard",
    "addColumn",
    "renameColumn",
    "removeColumn",
    "moveColumn",
    // cardActions.ts
    "addCard",
    "addCardWithParent",
    "updateCard",
    "patchCard",
    "deleteCard",
    "moveCard",
    "addLabel",
    "updateLabel",
    "removeLabel",
    "toggleCardLabel",
    "addParent",
    "removeParent",
    "validateAddParent",
    "getValidParents",
    "setCardStartDate",
    "setCardDueDate",
    "addComment",
    "removeComment",
    "addChecklist",
    "renameChecklist",
    "deleteChecklist",
    "addChecklistItem",
    "toggleChecklistItem",
    "renameChecklistItem",
    "deleteChecklistItem",
    // fieldActions.ts
    "addCustomField",
    "updateCustomField",
    "removeCustomField",
    "setCardFieldValue",
    "addPresetOption",
    "updatePresetOption",
    "removePresetOption",
    // typeActions.ts
    "setCardTypeEnabled",
    "setCardTypeLabel",
    "getCardTypeConfig",
    "setDoneColumn",
    "addCustomFieldForType",
    "updateCustomFieldForType",
    "removeCustomFieldForType",
    "setCardTypeFieldValue",
    "addPresetOptionForType",
    "updatePresetOptionForType",
    "removePresetOptionForType",
    // local
    "closeBoardActions",
  ] as const;

  it("exports exactly the expected action surface", () => {
    expect(Object.keys(actionsIndex).sort()).toEqual([...EXPECTED].sort());
  });

  it("exports every action as a callable", () => {
    for (const name of EXPECTED) {
      expect(typeof (actionsIndex as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("re-exports the same function instances as the defining modules", () => {
    // A barrel that re-wraps rather than re-exports would double-apply the
    // identity checks `useCallback` deps rely on in BoardContext.
    for (const name of EXPECTED) {
      if (name === "closeBoardActions") continue;
      const origin =
        (boardColumnActions as Record<string, unknown>)[name] ??
        (cardActions as Record<string, unknown>)[name] ??
        (fieldActions as Record<string, unknown>)[name] ??
        (typeActions as Record<string, unknown>)[name];
      expect(origin, `${name} is not exported by any defining module`).toBeDefined();
      expect(
        (actionsIndex as Record<string, unknown>)[name],
        `${name} is not a re-export of the original function`,
      ).toBe(origin);
    }
  });

  it("closeBoardActions is a documented no-op", () => {
    expect(actionsIndex.closeBoardActions()).toBeUndefined();
  });
});

describe("renameColumn", () => {
  it("renames the matching column", () => {
    const b = makeBoard();
    expect(actionsIndex.renameColumn(b, "col-todo", "Backlog").columns[0].name).toBe(
      "Backlog",
    );
  });

  it("rejects a blank name", () => {
    const b = makeBoard();
    expect(actionsIndex.renameColumn(b, "col-todo", "   ")).toBe(b);
  });

  it("is a no-op for an unknown column id", () => {
    const b = makeBoard();
    expect(actionsIndex.renameColumn(b, "nope", "X").columns[0].name).toBe("To do");
  });
});

describe("addColumn", () => {
  it("appends a trimmed column", () => {
    const b = actionsIndex.addColumn(makeBoard(), "  Blocked  ");
    expect(b.columns.map((c) => c.name)).toEqual(["To do", "Done", "Blocked"]);
  });

  it("rejects a blank name", () => {
    const b = makeBoard();
    expect(actionsIndex.addColumn(b, "  ")).toBe(b);
  });

  it("generates a unique id per column", () => {
    const b = makeBoard();
    const a = actionsIndex.addColumn(b, "A");
    const c = actionsIndex.addColumn(a, "B");
    const ids = c.columns.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("moveColumn clamping", () => {
  const three = () => makeBoard({
    columns: [
      { id: "a", name: "A", cardIds: [] },
      { id: "b", name: "B", cardIds: [] },
      { id: "c", name: "C", cardIds: [] },
    ],
  });

  it("moves a column to the requested index", () => {
    const b = three();
    expect(actionsIndex.moveColumn(b, "c", 0).columns.map((x) => x.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("clamps a negative index to the front", () => {
    const b = three();
    expect(actionsIndex.moveColumn(b, "c", -5).columns.map((x) => x.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("clamps an index past the end to the back", () => {
    const b = three();
    expect(actionsIndex.moveColumn(b, "a", 99).columns.map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("is a no-op for an unknown column id", () => {
    const b = three();
    expect(actionsIndex.moveColumn(b, "nope", 0)).toBe(b);
  });
});

describe("removeColumn", () => {
  it("removes the column and the cards inside it", () => {
    const b = normalizeBoard({
      id: "b1",
      name: "B",
      columns: [
        { id: "c1", name: "To do", cardIds: ["k1", "k2"] },
        { id: "c2", name: "Done", cardIds: [] },
      ],
      cards: {
        k1: { id: "k1", title: "One" },
        k2: { id: "k2", title: "Two" },
        k3: { id: "k3", title: "Orphan" },
      },
    });
    const next = actionsIndex.removeColumn(b, "c1");
    expect(next.columns.map((c) => c.id)).toEqual(["c2"]);
    expect(next.cards.k1).toBeUndefined();
    expect(next.cards.k2).toBeUndefined();
    // A card not referenced by any column is left alone.
    expect(next.cards.k3).toBeTruthy();
  });

  it("leaves other columns' cardIds untouched", () => {
    const b = normalizeBoard({
      columns: [
        { id: "c1", name: "To do", cardIds: [] },
        { id: "c2", name: "Done", cardIds: ["k1"] },
      ],
      cards: { k1: { id: "k1", title: "Kept" } },
    });
    const next = actionsIndex.removeColumn(b, "c1");
    expect(next.columns[0].cardIds).toEqual(["k1"]);
    expect(next.cards.k1).toBeTruthy();
  });
});
