// Transient toast for board-level notices.
//
// Deliberately separate from UpdateToast (a service-worker concern) and the
// install prompt (a PWA concern). This one is raised by board interactions —
// today, only "the card you just created is hidden by the current filters".
//
// The pattern follows the existing toasts: absolutely positioned, polite live
// region, auto-dismiss, with a manual dismiss for anyone who needs longer.

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a toast stays up before dismissing itself. */
export const TOAST_MS = 6000;

export interface ToastMessage {
  id: number;
  text: string;
  /** Optional label + handler, e.g. "Clear filters". */
  action?: { label: string; onAction: () => void };
}

let nextId = 1;

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
}) {
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    if (!toast) return;
    timer.current = window.setTimeout(onDismiss, TOAST_MS);
    return clearTimer;
  }, [toast, onDismiss, clearTimer]);

  if (!toast) return null;

  return (
    <div
      className="toast"
      // role=status + polite: a notice should not interrupt. If the user is
      // mid-sentence elsewhere, the toast waits rather than cutting them off.
      role="status"
      aria-live="polite"
      data-testid="board-toast"
    >
      <span className="toast__text">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="btn btn--ghost toast__action"
          onClick={() => {
            toast.action?.onAction();
            onDismiss();
          }}
          data-testid="board-toast-action"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="btn btn--ghost btn--icon toast__close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        data-testid="board-toast-close"
      >
        ✕
      </button>
    </div>
  );
}

/** Convenience hook: a single toast slot plus a `notify` function. */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback(
    (text: string, action?: ToastMessage["action"]) => {
      setToast({ id: nextId++, text, action });
    },
    [],
  );

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, notify, dismiss };
}
