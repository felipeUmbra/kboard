// Barrel re-export so BoardContext has a single import path for actions.

export {
  renameBoard,
  addColumn,
  renameColumn,
  removeColumn,
  moveColumn,
} from "./actions";

export {
  addCard,
  updateCard,
  deleteCard,
  moveCard,
  addLabel,
  updateLabel,
  removeLabel,
  toggleCardLabel,
  addParent,
  removeParent,
  validateAddParent,
  getValidParents,
} from "./cardActions";

export {
  addCustomField,
  updateCustomField,
  removeCustomField,
  setCardFieldValue,
  addPresetOption,
  updatePresetOption,
  removePresetOption,
  type FieldScope,
} from "./fieldActions";

export {
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
} from "./typeActions";

/** Placeholder to keep import path stable; not used. */
export function closeBoardActions(): void {
  /* no-op */
}
