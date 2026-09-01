// Central metadata registry for card types (Epic / Story / Task).
// Used by all components to ensure consistent visuals and rules.

import type { CardType } from "./types";

export interface CardTypeMeta {
  type: CardType;
  defaultLabel: string;
  color: string;            // accent hex
  /** Soft tinted background for stripes/badges. */
  softColor: string;
  icon: string;             // unicode glyph
  canHaveParent: boolean;
  parentType: CardType | null;
  canHaveChildren: boolean;
  childType: CardType | null;
  showProgress: boolean;    // epics & stories do; tasks don't
}

export const CARD_TYPE_META: Record<CardType, CardTypeMeta> = {
  epic: {
    type: "epic",
    defaultLabel: "Epic",
    color: "#a25ddc",
    softColor: "#f3e8fd",
    icon: "◆",
    canHaveParent: false,
    parentType: null,
    canHaveChildren: true,
    childType: "story",
    showProgress: true,
  },
  story: {
    type: "story",
    defaultLabel: "Story",
    color: "#4bce97",
    softColor: "#dffbe8",
    icon: "★",
    canHaveParent: true,
    parentType: "epic",
    canHaveChildren: true,
    childType: "task",
    showProgress: true,
  },
  task: {
    type: "task",
    defaultLabel: "Task",
    color: "#5e6c84",
    softColor: "#e9eaee",
    icon: "•",
    canHaveParent: true,
    parentType: "story",
    canHaveChildren: false,
    childType: null,
    showProgress: false,
  },
};

export const ALL_CARD_TYPES: CardType[] = ["epic", "story", "task"];

export function getMeta(type: CardType): CardTypeMeta {
  return CARD_TYPE_META[type];
}

/** Display label: user override if provided, else default. */
export function displayLabel(
  type: CardType,
  customLabel?: string,
): string {
  if (customLabel && customLabel.trim()) return customLabel;
  return CARD_TYPE_META[type].defaultLabel;
}
