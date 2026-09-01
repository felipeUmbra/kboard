// Action builder for BoardContext. Pure wiring of state mutators to action creators.

import { cryptoRandomId } from "../models/migrations";
import type { Board, Card, CustomField, Label, PresetOption } from "../models/types";
import {
  addCard as addCardAction,
  addColumn,
  addCustomField as addCustomFieldAction,
  addLabel as addLabelAction,
  addPresetOption as addPresetOptionAction,
  deleteCard,
  moveCard,
  moveColumn,
  removeColumn,
  removeCustomField as removeCustomFieldAction,
  removeLabel,
  removePresetOption as removePresetOptionAction,
  renameBoard,
  renameColumn,
  setCardFieldValue as setCardFieldValueAction,
  toggleCardLabel,
  updateCard,
  updateCustomField as updateCustomFieldAction,
  updateLabel,
  updatePresetOption as updatePresetOptionAction,
} from "./actionsIndex";
import {
  createBoard as repoCreate,
  removeBoard as repoRemove,
} from "../drive/boardRepository";

export interface ActionDeps {
  mutate: (updater: (b: Board) => Board) => void;
  setBoard: React.Dispatch<React.SetStateAction<Board | null>>;
  setBoards: React.Dispatch<React.SetStateAction<Board[]>>;
  setLastError: React.Dispatch<React.SetStateAction<string | null>>;
}

export type BoardActions = {
  createNewBoard: (name: string) => Promise<Board>;
  deleteBoard: (b: Board) => Promise<void>;
  renameBoard: (name: string) => void;
  addColumn: (name: string) => void;
  renameColumn: (columnId: string, name: string) => void;
  removeColumn: (columnId: string) => void;
  moveColumn: (columnId: string, toIndex: number) => void;
  addCard: (columnId: string, title: string) => string | null;
  updateCard: (cardId: string, patch: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  moveCard: (cardId: string, toColumnId: string, toIndex: number) => void;
  addLabel: (name: string, color: string) => string | null;
  updateLabel: (labelId: string, patch: Partial<Label>) => void;
  removeLabel: (labelId: string) => void;
  toggleCardLabel: (cardId: string, labelId: string) => void;
  addCustomField: (field: Omit<CustomField, "id">) => string | null;
  updateCustomField: (fieldId: string, patch: Partial<CustomField>) => void;
  removeCustomField: (fieldId: string) => void;
  setCardFieldValue: (
    cardId: string,
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
};

export function buildActions({
  mutate,
  setBoard,
  setBoards,
  setLastError,
}: ActionDeps): BoardActions {
  return {
    createNewBoard: async (name: string) => {
      const trimmed = name.trim() || "Untitled board";
      const now = Date.now();
      const id = cryptoRandomId();
      const draft: Board = {
        id,
        name: trimmed,
        labels: [],
        customFields: [],
        columns: [
          { id: cryptoRandomId(), name: "To do", cardIds: [] },
          { id: cryptoRandomId(), name: "In progress", cardIds: [] },
          { id: cryptoRandomId(), name: "Done", cardIds: [] },
        ],
        cards: {},
        createdAt: now,
        updatedAt: now,
      };
      const saved = await repoCreate(draft);
      setBoards((prev) => [saved, ...prev]);
      setBoard(saved);
      return saved;
    },
    deleteBoard: async (b: Board) => {
      if (!b.driveFileId) return;
      try {
        await repoRemove(b.driveFileId);
        setBoards((prev) => prev.filter((x) => x.id !== b.id));
        setBoard((cur) => (cur?.id === b.id ? null : cur));
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    renameBoard: (name) => mutate((b) => renameBoard(b, name)),
    addColumn: (name) => mutate((b) => addColumn(b, name)),
    renameColumn: (columnId, name) => mutate((b) => renameColumn(b, columnId, name)),
    removeColumn: (columnId) => mutate((b) => removeColumn(b, columnId)),
    moveColumn: (columnId, toIndex) => mutate((b) => moveColumn(b, columnId, toIndex)),
    addCard: (columnId, title) => {
      let newId: string | null = null;
      mutate((b) => {
        const r = addCardAction(b, columnId, title);
        newId = r.cardId;
        return r.board;
      });
      return newId;
    },
    updateCard: (cardId, patch) => mutate((b) => updateCard(b, cardId, patch)),
    deleteCard: (cardId) => mutate((b) => deleteCard(b, cardId)),
    moveCard: (cardId, toColumnId, toIndex) =>
      mutate((b) => moveCard(b, cardId, toColumnId, toIndex)),
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
    addCustomField: (field) => {
      let id: string | null = null;
      mutate((b) => {
        const r = addCustomFieldAction(b, field);
        id = r.fieldId;
        return r.board;
      });
      return id;
    },
    updateCustomField: (fieldId, patch) =>
      mutate((b) => updateCustomFieldAction(b, fieldId, patch)),
    removeCustomField: (fieldId) => mutate((b) => removeCustomFieldAction(b, fieldId)),
    setCardFieldValue: (cardId, fieldId, value) =>
      mutate((b) => setCardFieldValueAction(b, cardId, fieldId, value)),
    addPresetOption: (fieldId, name, color) =>
      mutate((b) => addPresetOptionAction(b, fieldId, name, color)),
    updatePresetOption: (fieldId, optionId, patch) =>
      mutate((b) => updatePresetOptionAction(b, fieldId, optionId, patch)),
    removePresetOption: (fieldId, optionId) =>
      mutate((b) => removePresetOptionAction(b, fieldId, optionId)),
  };
}

