interface BannerProps {
  kind?: "error" | "success" | "info";
  message: string;
  onDismiss?: () => void;
}

export function Banner({ kind = "info", message, onDismiss }: BannerProps) {
  return (
    <div
      className={`banner ${kind === "error" ? "banner--error" : ""} ${
        kind === "success" ? "banner--success" : ""
      }`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
