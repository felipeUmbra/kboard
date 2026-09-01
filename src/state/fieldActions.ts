// Custom field / preset option action creators.

import { cryptoRandomId } from "../models/migrations";
import type {
  Board,
  Card,
  CustomField,
  CustomFieldValues,
  PresetOption,
} from "../models/types";

export interface AddFieldResult { board: Board; fieldId: string | null }

export function addCustomField(b: Board, field: Omit<CustomField, "id">): AddFieldResult {
  const trimmed = field.name.trim();
  if (!trimmed) return { board: b, fieldId: null };
  const id = cryptoRandomId();
  return {
    fieldId: id,
    board: {
      ...b,
      customFields: [...b.customFields, { ...field, id, name: trimmed }],
    },
  };
}

export function updateCustomField(
  b: Board,
  fieldId: string,
  patch: Partial<CustomField>,
): Board {
  return {
    ...b,
    customFields: b.customFields.map((f) =>
      f.id === fieldId ? { ...f, ...patch, id: f.id } : f,
    ),
  };
}

export function removeCustomField(b: Board, fieldId: string): Board {
  const cards: Record<string, Card> = {};
  for (const [id, c] of Object.entries(b.cards)) {
    const { [fieldId]: _omit, ...rest } = c.customFieldValues;
    void _omit;
    cards[id] = { ...c, customFieldValues: rest as CustomFieldValues };
  }
  return {
    ...b,
    customFields: b.customFields.filter((f) => f.id !== fieldId),
    cards,
  };
}

export function setCardFieldValue(
  b: Board,
  cardId: string,
  fieldId: string,
  value: string | number | boolean,
): Board {
  const card = b.cards[cardId];
  if (!card) return b;
  return {
    ...b,
    cards: {
      ...b.cards,
      [cardId]: {
        ...card,
        customFieldValues: { ...card.customFieldValues, [fieldId]: value },
        updatedAt: Date.now(),
      },
    },
  };
}

export function addPresetOption(b: Board, fieldId: string, name: string, color: string): Board {
  const trimmed = name.trim();
  if (!trimmed) return b;
  return {
    ...b,
    customFields: b.customFields.map((f) =>
      f.id === fieldId
        ? { ...f, options: [...(f.options ?? []), { id: cryptoRandomId(), name: trimmed, color }] }
        : f,
    ),
  };
}

export function updatePresetOption(
  b: Board,
  fieldId: string,
  optionId: string,
  patch: Partial<PresetOption>,
): Board {
  return {
    ...b,
    customFields: b.customFields.map((f) =>
      f.id === fieldId
        ? {
            ...f,
            options: (f.options ?? []).map((o) =>
              o.id === optionId ? { ...o, ...patch, id: o.id } : o,
            ),
          }
        : f,
    ),
  };
}

export function removePresetOption(b: Board, fieldId: string, optionId: string): Board {
  const cards: Record<string, Card> = {};
  for (const [id, c] of Object.entries(b.cards)) {
    if (c.customFieldValues[fieldId] === optionId) {
      const { [fieldId]: _omit, ...rest } = c.customFieldValues;
      void _omit;
      cards[id] = { ...c, customFieldValues: rest as CustomFieldValues };
    } else {
      cards[id] = c;
    }
  }
  return {
    ...b,
    cards,
    customFields: b.customFields.map((f) =>
      f.id === fieldId
        ? { ...f, options: (f.options ?? []).filter((o) => o.id !== optionId) }
        : f,
    ),
  };
}
