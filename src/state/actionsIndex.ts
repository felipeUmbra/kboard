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
} from "./cardActions";

export {
  addCustomField,
  updateCustomField,
  removeCustomField,
  setCardFieldValue,
  addPresetOption,
  updatePresetOption,
  removePresetOption,
} from "./fieldActions";

/** Placeholder to keep import path stable; not used. */
export function closeBoardActions(): void {
  /* no-op */
}
