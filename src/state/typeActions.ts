// Per-card-type configuration actions (epic / story / task).
// And board-level "done column" toggles for progress calculation.

import { cryptoRandomId } from "../models/migrations";
import type { Board, CardType, CardTypeConfig, CustomField } from "../models/types";
import {
  addCustomField as addCustomFieldAction,
  updateCustomField as updateCustomFieldAction,
  removeCustomField as removeCustomFieldAction,
  setCardFieldValue as setCardFieldValueAction,
  addPresetOption as addPresetOptionAction,
  updatePresetOption as updatePresetOptionAction,
  removePresetOption as removePresetOptionAction,
  type FieldScope,
} from "./fieldActions";

export function setCardTypeEnabled(b: Board, type: CardType, enabled: boolean): Board {
  return {
    ...b,
    cardTypes: b.cardTypes.map((c) => (c.type === type ? { ...c, enabled } : c)),
  };
}

export function setCardTypeLabel(b: Board, type: CardType, label: string): Board {
  return {
    ...b,
    cardTypes: b.cardTypes.map((c) => (c.type === type ? { ...c, label } : c)),
  };
}

export function getCardTypeConfig(b: Board, type: CardType): CardTypeConfig | undefined {
  return b.cardTypes.find((c) => c.type === type);
}

// ─── Done columns ─────────────────────────────────────────────────

export function setDoneColumn(b: Board, columnId: string, isDone: boolean): Board {
  const has = b.doneColumnIds.includes(columnId);
  if (isDone && has) return b;
  if (!isDone && !has) return b;
  return {
    ...b,
    doneColumnIds: isDone
      ? [...b.doneColumnIds, columnId]
      : b.doneColumnIds.filter((id) => id !== columnId),
  };
}

// ─── Per-type field re-exported wrappers ──────────────────────────
// These call the generic field actions with the right scope.

export function addCustomFieldForType(
  b: Board,
  type: CardType,
  field: Omit<CustomField, "id">,
) {
  return addCustomFieldAction(b, type, field);
}

export function updateCustomFieldForType(
  b: Board,
  type: CardType,
  fieldId: string,
  patch: Partial<CustomField>,
): Board {
  return updateCustomFieldAction(b, type, fieldId, patch);
}

export function removeCustomFieldForType(
  b: Board,
  type: CardType,
  fieldId: string,
): Board {
  return removeCustomFieldAction(b, type, fieldId);
}

export function setCardTypeFieldValue(
  b: Board,
  cardId: string,
  type: CardType,
  fieldId: string,
  value: string | number | boolean,
): Board {
  return setCardFieldValueAction(b, cardId, type, fieldId, value);
}

export function addPresetOptionForType(
  b: Board,
  type: CardType,
  fieldId: string,
  name: string,
  color: string,
): Board {
  return addPresetOptionAction(b, type, fieldId, name, color);
}

export function updatePresetOptionForType(
  b: Board,
  type: CardType,
  fieldId: string,
  optionId: string,
  patch: { name?: string; color?: string },
): Board {
  return updatePresetOptionAction(b, type, fieldId, optionId, patch);
}

export function removePresetOptionForType(
  b: Board,
  type: CardType,
  fieldId: string,
  optionId: string,
): Board {
  return removePresetOptionAction(b, type, fieldId, optionId);
}

export type { FieldScope };

// Re-export cryptoRandomId for convenience.
export { cryptoRandomId };
