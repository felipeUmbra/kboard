// Thin progress bar with color based on completion.

import type { CardProgress } from "../models/progress";

export function ProgressBar({
  progress,
  size = "sm",
  showLabel = true,
}: {
  progress: CardProgress;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const h = size === "xs" ? 3 : size === "md" ? 8 : 5;
  const color =
    progress.percent === null
      ? "var(--color-border)"
      : progress.percent < 33
        ? "var(--color-danger, #eb5a46)"
        : progress.percent < 66
          ? "var(--color-warning, #f2d600)"
          : "var(--color-success, #4bce97)";

  return (
    <div
      className="progress-bar"
      style={{ display: "flex", alignItems: "center", gap: 6 }}
      aria-label={
        progress.percent === null
          ? "No children"
          : `${progress.done} of ${progress.total} complete (${progress.percent}%)`
      }
    >
      <div
        style={{
          flex: 1,
          height: h,
          background: "var(--color-border)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width:
              progress.percent === null ? "0%" : `${progress.percent}%`,
            height: "100%",
            background: color,
            transition: "width 200ms ease, background-color 200ms ease",
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            minWidth: 28,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {progress.percent === null ? "—" : `${progress.percent}%`}
        </span>
      )}
    </div>
  );
}
