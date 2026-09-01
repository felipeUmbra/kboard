interface BannerAction {
  label: string;
  onClick: () => void;
}

interface BannerProps {
  kind?: "error" | "success" | "info";
  message: string;
  onDismiss?: () => void;
  action?: BannerAction;
}

export function Banner({ kind = "info", message, onDismiss, action }: BannerProps) {
  return (
    <div
      className={`banner ${kind === "error" ? "banner--error" : ""} ${
        kind === "success" ? "banner--success" : ""
      }`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {action && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={action.onClick}
          style={{ fontWeight: 600, textDecoration: "underline" }}
        >
          {action.label}
        </button>
      )}
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
