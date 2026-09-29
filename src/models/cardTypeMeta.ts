// Central metadata registry for card types (Epic / Story / Task).
// Used by all components to ensure consistent visuals and rules.

import type { CardType } from "./types";

export interface CardTypeMeta {
  type: CardType;
  defaultLabel: string;
  /** Foreground hex. Rendered as text on `softColor` (TypeChip) and on
   *  --color-bg-elevated (Sidebar), so it must clear 4.5:1 against BOTH.
   *  Also used as the 3px card stripe, where only 3:1 is required. */
  color: string;
  /** Soft tinted background for stripes/badges. */
  softColor: string;
  icon: string;             // unicode glyph
  canHaveParent: boolean;
  parentType: CardType | null;
  canHaveChildren: boolean;
  childType: CardType | null;
  showProgress: boolean;    // epics & stories do; tasks don't
}

// Contrast-verified against every background each colour is rendered on:
//   TypeChip text-on-softColor, Sidebar text-on-bg-elevated, card stripe on
//   --color-surface. Run `npm run a11y:contrast` after changing any of these.
export const CARD_TYPE_META: Record<CardType, CardTypeMeta> = {
  epic: {
    type: "epic",
    defaultLabel: "Epic",
    // Was #a25ddc — 3.46:1 on its own softColor, a text-contrast failure.
    color: "#7b3fb0",
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
    // Was #4bce97 — 1.81:1 on its own softColor, the worst offender found.
    color: "#15703f",
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
    color: "#4a5769",
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
