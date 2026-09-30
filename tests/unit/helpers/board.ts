// Shared board fixtures for the pure state-action unit tests.
//
// The action creators under test are pure `(board) => board` transforms, so
// the only thing that matters is that the fixture exercises the shapes the
// production code branches on: board-level vs per-card-type fields, cards that
// do and don't carry values, and a mix of done columns.

import type {
  Board,
  Card,
  CardType,
  Checklist,
  CustomField,
  Label,
  PresetOption,
} from "../../../src/models/types";
import { ALL_CARD_TYPES } from "../../../src/models/cardTypeMeta";

export function makeCard(overrides: Partial<Card> = {}): Card {
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
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

export function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: "board-1",
    name: "Board",
    labels: [] as Label[],
    customFields: [] as CustomField[],
    cardTypes: ALL_CARD_TYPES.map((type) => ({
      type,
      enabled: true,
      label: type,
      customFields: [] as CustomField[],
    })),
    doneColumnIds: ["col-done"],
    columns: [
      { id: "col-todo", name: "To do", cardIds: [] },
      { id: "col-done", name: "Done", cardIds: [] },
    ],
    cards: {} as Record<string, Card>,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

/** Give a card-type config some fields so per-type scopes have something to hit. */
export function withTypeField(
  type: CardType,
  field: CustomField,
): Partial<Board> {
  return {
    cardTypes: ALL_CARD_TYPES.map((t) => ({
      type: t,
      enabled: true,
      label: t,
      customFields: t === type ? [field] : [],
    })),
  };
}

export function presetField(id: string, options: PresetOption[]): CustomField {
  return { id, name: id, type: "preset_list", options };
}
