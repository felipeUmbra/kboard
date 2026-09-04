// Action builder for BoardContext. Pure wiring of state mutators to action creators.

import { cryptoRandomId } from "../models/migrations";
import type {
  Board,
  Card,
  CardType,
  CustomField,
  Label,
  PresetOption,
} from "../models/types";
import {
  addCard as addCardAction,
  addCardWithParent,
  addColumn,
  addCustomField as addCustomFieldAction,
  addLabel as addLabelAction,
  addParent as addParentAction,
  addPresetOption as addPresetOptionAction,
  deleteCard,
  moveCard,
  moveColumn,
  removeColumn,
  removeCustomField as removeCustomFieldAction,
  removeLabel,
  removeParent as removeParentAction,
  removePresetOption as removePresetOptionAction,
  renameBoard,
  renameColumn,
  setCardFieldValue as setCardFieldValueAction,
  setDoneColumn as setDoneColumnAction,
  setCardTypeEnabled as setCardTypeEnabledAction,
  setCardTypeLabel as setCardTypeLabelAction,
  addCustomFieldForType,
  updateCustomFieldForType,
  removeCustomFieldForType,
  setCardTypeFieldValue,
  addPresetOptionForType,
  updatePresetOptionForType,
  removePresetOptionForType,
  toggleCardLabel,
  updateCard,
  setCardStartDate,
  setCardDueDate,
  addComment,
  removeComment,
  updateCustomField as updateCustomFieldAction,
  updateLabel,
  updatePresetOption as updatePresetOptionAction,
  type FieldScope,
} from "./actionsIndex";
import { ALL_CARD_TYPES, CARD_TYPE_META } from "../models/cardTypeMeta";
import {
  createBoard as repoCreate,
  removeBoard as repoRemove,
} from "../drive/boardRepository";

export interface ActionDeps {
  mutate: (updater: (b: Board) => Board) => void;
  setBoard: React.Dispatch<React.SetStateAction<Board | null>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setLastError: React.Dispatch<React.SetStateAction<string | null>>;
  /**
   * Returns a function that runs `op` with a valid Drive token,
   * retrying once with a fresh consent grant on 401/403.
   */
  withToken: <T>(op: () => Promise<T>) => Promise<T | null>;
  /** Force a fresh interactive consent grant. */
  reauthenticate: () => Promise<boolean>;
  /** Called after a board is removed locally. Receives the deleted board
   *  so the host can clean up per-card side state (cache meta, drafts). */
  onBoardDeleted?: (board: Board) => void;
}

export type BoardActions = {
  createNewBoard: (name: string) => Promise<Board>;
  deleteBoard: (b: Board) => Promise<void>;
  renameBoard: (name: string) => void;
  addColumn: (name: string) => void;
  renameColumn: (columnId: string, name: string) => void;
  removeColumn: (columnId: string) => void;
  moveColumn: (columnId: string, toIndex: number) => void;
  addCard: (columnId: string, title: string, type?: CardType) => string | null;
  /** Create a child card pre-linked to the given origin. Returns the new
   *  card's id, or null if the origin can't have children. */
  addChildCard: (originCardId: string) => string | null;
  /** Create a parent card pre-linked to the given origin (and link the
   *  origin to the new parent in the same mutation). Returns the new
   *  card's id, or null if the origin can't have parents. */
  addParentCard: (originCardId: string) => string | null;
  updateCard: (cardId: string, patch: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  moveCard: (cardId: string, toColumnId: string, toIndex: number) => void;
  addParent: (cardId: string, parentId: string) => void;
  removeParent: (cardId: string, parentId: string) => void;
  addLabel: (name: string, color: string) => string | null;
  updateLabel: (labelId: string, patch: Partial<Label>) => void;
  removeLabel: (labelId: string) => void;
  toggleCardLabel: (cardId: string, labelId: string) => void;
  setCardStartDate: (cardId: string, iso: string | null) => void;
  setCardDueDate: (cardId: string, iso: string | null) => void;
  addComment: (
    cardId: string,
    comment: { author: string; authorPicture?: string; body: string },
  ) => void;
  removeComment: (cardId: string, commentId: string) => void;
  addCustomField: (field: Omit<CustomField, "id">) => string | null;
  updateCustomField: (fieldId: string, patch: Partial<CustomField>) => void;
  removeCustomField: (fieldId: string) => void;
  setCardFieldValue: (
    cardId: string,
    fieldId: string,
    value: string | number | boolean,
  ) => void;
  addCustomFieldForType: (
    type: CardType,
    field: Omit<CustomField, "id">,
  ) => string | null;
  updateCustomFieldForType: (
    type: CardType,
    fieldId: string,
    patch: Partial<CustomField>,
  ) => void;
  removeCustomFieldForType: (type: CardType, fieldId: string) => void;
  setCardTypeFieldValue: (
    cardId: string,
    type: CardType,
    fieldId: string,
    value: string | number | boolean,
  ) => void;
  addPresetOption: (fieldId: string, name: string, color: string) => void;
  updatePresetOption: (
    fieldId: string,
    optionId: string,
    patch: Partial<PresetOption>,
  ) => void;
  removePresetOption: (fieldId: string, optionId: string) => void;
  addPresetOptionForType: (
    type: CardType,
    fieldId: string,
    name: string,
    color: string,
  ) => void;
  updatePresetOptionForType: (
    type: CardType,
    fieldId: string,
    optionId: string,
    patch: Partial<PresetOption>,
  ) => void;
  removePresetOptionForType: (
    type: CardType,
    fieldId: string,
    optionId: string,
  ) => void;
  setCardTypeEnabled: (type: CardType, enabled: boolean) => void;
  setCardTypeLabel: (type: CardType, label: string) => void;
  setDoneColumn: (columnId: string, isDone: boolean) => void;
};

export function buildActions(deps: ActionDeps): BoardActions {
  const {
    mutate,
    setBoard,
    setBoards,
    setLastError,
  } = deps;
  return {
    createNewBoard: async (name: string) => {
      const trimmed = name.trim() || "Untitled board";
      const now = Date.now();
      const id = cryptoRandomId();
      const todoId = cryptoRandomId();
      const progressId = cryptoRandomId();
      const doneId = cryptoRandomId();
      const draft: Board = {
        id,
        name: trimmed,
        labels: [],
        customFields: [],
        cardTypes: ALL_CARD_TYPES.map((t) => ({
          type: t,
          enabled: true,
          label: CARD_TYPE_META[t].defaultLabel,
          customFields: [],
        })),
        doneColumnIds: [doneId],
        columns: [
          { id: todoId, name: "To do", cardIds: [] },
          { id: progressId, name: "In progress", cardIds: [] },
          { id: doneId, name: "Done", cardIds: [] },
        ],
        cards: {},
        createdAt: now,
        updatedAt: now,
      };
      // Use withToken so a 401/403 triggers a fresh consent grant
      // and one automatic retry. The error from inside withToken is
      // already caught — it returns null on failure and surfaces the
      // error via the lastError state.
      const saved = await deps.withToken(() => repoCreate(draft));
      if (saved) {
        setBoards((prev) => [saved, ...prev]);
        setBoard(saved);
        return saved;
      }
      // The error is already in lastError; if the silent retry
      // succeeded but the user just needs to manually re-grant, set
      // a clearer message.
      setLastError(
        "Couldn't create the board. Click \"Reconnect to Drive\" below to grant the required permissions.",
      );
      return null as unknown as Board;
    },
    deleteBoard: async (b: Board) => {
      if (!b.driveFileId) return;
      try {
        await repoRemove(b.driveFileId);
        setBoards((prev) => prev.filter((x) => x.id !== b.id));
        setBoard((cur) => (cur?.id === b.id ? null : cur));
        deps.onBoardDeleted?.(b);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    renameBoard: (name) => mutate((b) => renameBoard(b, name)),
    addColumn: (name) => mutate((b) => addColumn(b, name)),
    renameColumn: (columnId, name) => mutate((b) => renameColumn(b, columnId, name)),
    removeColumn: (columnId) => mutate((b) => removeColumn(b, columnId)),
    moveColumn: (columnId, toIndex) => mutate((b) => moveColumn(b, columnId, toIndex)),
    addCard: (columnId, title, type) => {
      let newId: string | null = null;
      mutate((b) => {
        const r = addCardAction(b, columnId, title, type);
        newId = r.cardId;
        return r.board;
      });
      return newId;
    },
    addChildCard: (originCardId) => {
      let newId: string | null = null;
      mutate((b) => {
        const r = addCardWithParent(b, b.columns[0]?.id ?? "", originCardId, "as_child");
        newId = r.cardId;
        return r.board;
      });
      return newId;
    },
    addParentCard: (originCardId) => {
      let newId: string | null = null;
      mutate((b) => {
        const r = addCardWithParent(b, b.columns[0]?.id ?? "", originCardId, "as_parent");
        newId = r.cardId;
        return r.board;
      });
      return newId;
    },
    updateCard: (cardId, patch) => mutate((b) => updateCard(b, cardId, patch)),
    deleteCard: (cardId) => mutate((b) => deleteCard(b, cardId)),
    moveCard: (cardId, toColumnId, toIndex) =>
      mutate((b) => moveCard(b, cardId, toColumnId, toIndex)),
    addParent: (cardId, parentId) =>
      mutate((b) => addParentAction(b, cardId, parentId)),
    removeParent: (cardId, parentId) =>
      mutate((b) => removeParentAction(b, cardId, parentId)),
    addLabel: (name, color) => {
      let id: string | null = null;
      mutate((b) => {
        const r = addLabelAction(b, name, color);
        id = r.labelId;
        return r.board;
      });
      return id;
    },
    updateLabel: (labelId, patch) => mutate((b) => updateLabel(b, labelId, patch)),
    removeLabel: (labelId) => mutate((b) => removeLabel(b, labelId)),
    toggleCardLabel: (cardId, labelId) =>
      mutate((b) => toggleCardLabel(b, cardId, labelId)),
    setCardStartDate: (cardId, iso) =>
      mutate((b) => setCardStartDate(b, cardId, iso)),
    setCardDueDate: (cardId, iso) =>
      mutate((b) => setCardDueDate(b, cardId, iso)),
    addComment: (cardId, comment) =>
      mutate((b) => addComment(b, cardId, comment)),
    removeComment: (cardId, commentId) =>
      mutate((b) => removeComment(b, cardId, commentId)),
    addCustomField: (field) => {
      let id: string | null = null;
      mutate((b) => {
        const r = addCustomFieldAction(b, "board", field);
        id = r.fieldId;
        return r.board;
      });
      return id;
    },
    updateCustomField: (fieldId, patch) =>
      mutate((b) => updateCustomFieldAction(b, "board", fieldId, patch)),
    removeCustomField: (fieldId) =>
      mutate((b) => removeCustomFieldAction(b, "board", fieldId)),
    setCardFieldValue: (cardId, fieldId, value) =>
      mutate((b) => setCardFieldValueAction(b, cardId, "board", fieldId, value)),
    addCustomFieldForType: (type, field) => {
      let id: string | null = null;
      mutate((b) => {
        const r = addCustomFieldForType(b, type, field);
        id = r.fieldId;
        return r.board;
      });
      return id;
    },
    updateCustomFieldForType: (type, fieldId, patch) =>
      mutate((b) => updateCustomFieldForType(b, type, fieldId, patch)),
    removeCustomFieldForType: (type, fieldId) =>
      mutate((b) => removeCustomFieldForType(b, type, fieldId)),
    setCardTypeFieldValue: (cardId, type, fieldId, value) =>
      mutate((b) => setCardTypeFieldValue(b, cardId, type, fieldId, value)),
    addPresetOption: (fieldId, name, color) =>
      mutate((b) => addPresetOptionAction(b, "board", fieldId, name, color)),
    updatePresetOption: (fieldId, optionId, patch) =>
      mutate((b) => updatePresetOptionAction(b, "board", fieldId, optionId, patch)),
    removePresetOption: (fieldId, optionId) =>
      mutate((b) => removePresetOptionAction(b, "board", fieldId, optionId)),
    addPresetOptionForType: (type, fieldId, name, color) =>
      mutate((b) => addPresetOptionForType(b, type, fieldId, name, color)),
    updatePresetOptionForType: (type, fieldId, optionId, patch) =>
      mutate((b) => updatePresetOptionForType(b, type, fieldId, optionId, patch)),
    removePresetOptionForType: (type, fieldId, optionId) =>
      mutate((b) => removePresetOptionForType(b, type, fieldId, optionId)),
    setCardTypeEnabled: (type, enabled) =>
      mutate((b) => setCardTypeEnabledAction(b, type, enabled)),
    setCardTypeLabel: (type, label) =>
      mutate((b) => setCardTypeLabelAction(b, type, label)),
    setDoneColumn: (columnId, isDone) =>
      mutate((b) => setDoneColumnAction(b, columnId, isDone)),
  };
}

