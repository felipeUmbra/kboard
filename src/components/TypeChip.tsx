// Small colored badge showing a card's type (Epic / Story / Task).

import type { CSSProperties } from "react";
import type { CardType } from "../models/types";
import { CARD_TYPE_META } from "../models/cardTypeMeta";

export function TypeChip({
  type,
  customLabel,
  size = "sm",
  showLabel = false,
  style,
}: {
  type: CardType;
  customLabel?: string;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  style?: CSSProperties;
}) {
  const meta = CARD_TYPE_META[type];
  const label = customLabel && customLabel.trim() ? customLabel : meta.defaultLabel;
  const px = size === "xs" ? 4 : size === "md" ? 8 : 6;
  const py = size === "xs" ? 1 : size === "md" ? 3 : 2;
  const fontSize = size === "xs" ? 10 : size === "md" ? 13 : 11;
  return (
    <span
      className="type-chip"
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `${py}px ${px}px`,
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        color: meta.color,
        background: meta.softColor,
        borderRadius: 999,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {showLabel && <span>{label}</span>}
    </span>
  );
}
