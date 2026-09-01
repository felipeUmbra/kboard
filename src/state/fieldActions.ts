// Custom field / preset option action creators.
// Supports both board-level fields and per-card-type fields.

import { cryptoRandomId } from "../models/migrations";
import type {
  Board,
  Card,
  CardType,
  CustomField,
  CustomFieldValues,
  PresetOption,
} from "../models/types";

/** Where a field is stored. */
export type FieldScope = "board" | CardType;

export interface AddFieldResult { board: Board; fieldId: string | null }

function getFields(b: Board, scope: FieldScope): CustomField[] {
  if (scope === "board") return b.customFields;
  const cfg = b.cardTypes.find((c) => c.type === scope);
  return cfg?.customFields ?? [];
}

function setFields(
  b: Board,
  scope: FieldScope,
  updater: (fields: CustomField[]) => CustomField[],
): Board {
  if (scope === "board") {
    return { ...b, customFields: updater(b.customFields) };
  }
  return {
    ...b,
    cardTypes: b.cardTypes.map((c) =>
      c.type === scope ? { ...c, customFields: updater(c.customFields) } : c,
    ),
  };
}

export function addCustomField(
  b: Board,
  scope: FieldScope,
  field: Omit<CustomField, "id">,
): AddFieldResult {
  const trimmed = field.name.trim();
  if (!trimmed) return { board: b, fieldId: null };
  const id = cryptoRandomId();
  return {
    fieldId: id,
    board: setFields(b, scope, (fields) => [
      ...fields,
      { ...field, id, name: trimmed },
    ]),
  };
}

export function updateCustomField(
  b: Board,
  scope: FieldScope,
  fieldId: string,
  patch: Partial<CustomField>,
): Board {
  return setFields(b, scope, (fields) =>
    fields.map((f) => (f.id === fieldId ? { ...f, ...patch, id: f.id } : f)),
  );
}

export function removeCustomField(b: Board, scope: FieldScope, fieldId: string): Board {
  const valueKey = scope === "board" ? "boardFieldValues" : "typeFieldValues";
  const cards: Record<string, Card> = {};
  for (const [id, c] of Object.entries(b.cards)) {
    const values = c[valueKey] as CustomFieldValues | undefined;
    if (values && fieldId in values) {
      const { [fieldId]: _omit, ...rest } = values;
      void _omit;
      cards[id] = { ...c, [valueKey]: rest } as Card;
    } else {
      cards[id] = c;
    }
  }
  return {
    ...b,
    customFields:
      scope === "board"
        ? b.customFields.filter((f) => f.id !== fieldId)
        : b.customFields,
    cardTypes: b.cardTypes.map((c) =>
      c.type === scope
        ? { ...c, customFields: c.customFields.filter((f) => f.id !== fieldId) }
        : c,
    ),
    cards,
  };
}

export function setCardFieldValue(
  b: Board,
  cardId: string,
  scope: FieldScope,
  fieldId: string,
  value: string | number | boolean,
): Board {
  const card = b.cards[cardId];
  if (!card) return b;
  if (scope === "board") {
    return {
      ...b,
      cards: {
        ...b.cards,
        [cardId]: {
          ...card,
          boardFieldValues: { ...card.boardFieldValues, [fieldId]: value },
          updatedAt: Date.now(),
        },
      },
    };
  }
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...card,
        typeFieldValues: { ...card.typeFieldValues, [fieldId]: value },
        updatedAt: Date.now(),
      },
    },
  };
}

export function addPresetOption(
  b: Board,
  scope: FieldScope,
  fieldId: string,
  name: string,
  color: string,
): Board {
  const trimmed = name.trim();
  if (!trimmed) return b;
  return setFields(b, scope, (fields) =>
    fields.map((f) =>
      f.id === fieldId
        ? { ...f, options: [...(f.options ?? []), { id: cryptoRandomId(), name: trimmed, color }] }
        : f,
    ),
  );
}

export function updatePresetOption(
  b: Board,
  scope: FieldScope,
  fieldId: string,
  optionId: string,
  patch: Partial<PresetOption>,
): Board {
  return setFields(b, scope, (fields) =>
    fields.map((f) =>
      f.id === fieldId
        ? {
            ...f,
            options: (f.options ?? []).map((o) =>
              o.id === optionId ? { ...o, ...patch, id: o.id } : o,
            ),
          }
        : f,
    ),
  );
}

export function removePresetOption(
  b: Board,
  scope: FieldScope,
  fieldId: string,
  optionId: string,
): Board {
  const valueKey = scope === "board" ? "boardFieldValues" : "typeFieldValues";
  const cards: Record<string, Card> = {};
  for (const [id, c] of Object.entries(b.cards)) {
    const values = c[valueKey] as CustomFieldValues | undefined;
    if (values && values[fieldId] === optionId) {
      const { [fieldId]: _omit, ...rest } = values;
      void _omit;
      cards[id] = { ...c, [valueKey]: rest } as Card;
    } else {
      cards[id] = c;
    }
  }
  return {
    ...b,
    cards,
    customFields: b.customFields,
    cardTypes: b.cardTypes.map((c) =>
      c.type === scope
        ? {
            ...c,
            customFields: c.customFields.map((f) =>
              f.id === fieldId
                ? { ...f, options: (f.options ?? []).filter((o) => o.id !== optionId) }
                : f,
            ),
          }
        : c,
    ),
  };
}
