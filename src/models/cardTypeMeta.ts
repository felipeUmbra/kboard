// Central metadata registry for card types (Epic / Story / Task).
// Used by all components to ensure consistent visuals and rules.

import type { CardType } from "./types";

export interface CardTypeMeta {
  type: CardType;
  defaultLabel: string;
  /** Fixed hex. Used ONLY for the TypeChip soft-tinted background (text on a
   *  known light tint) and the 3px card stripe, where a theme-independent
   *  value is correct.
   *
   *  Do NOT use this for the type name on a themed surface: it is a dark
   *  colour and fails badly on dark backgrounds (Epic 1.93:1, Story 2.08:1 —
   *  found by axe-core in Sprint 4.1). Use `colorToken` there. */
  color: string;
  /** Theme-aware CSS custom property, e.g. "var(--color-type-epic)".
   *  Set on the dark surfaces where the fixed hex is unreadable. */
  colorToken: string;
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
//   TypeChip text-on-softColor, card stripe on --color-surface, and — via
//   `colorToken` — the type name on --color-surface / --color-bg /
//   --color-bg-elevated in BOTH themes. Run `npm run a11y:contrast` after
//   changing any of these, and the axe-core scans in
//   tests/e2e/a11y-axe.spec.ts cover the dark theme.
export const CARD_TYPE_META: Record<CardType, CardTypeMeta> = {
  epic: {
    type: "epic",
    defaultLabel: "Epic",
    // Was #a25ddc — 3.46:1 on its own softColor, a text-contrast failure.
    color: "#7b3fb0",
    colorToken: "var(--color-type-epic)",
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
    colorToken: "var(--color-type-story)",
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
    colorToken: "var(--color-type-task)",
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
