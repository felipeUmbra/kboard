// Update-available toast.
//
// Shown when the service worker detects a new version is ready. We
// deliberately do NOT auto-apply the update: the user could be in the
// middle of editing a card, and a forced reload would interrupt the
// draft-recovery flow (see state/cardDrafts.ts). The user clicks
// "Reload" to apply, which triggers a one-time skipWaiting() in the
// service worker and reloads the page.
//
// Dismissed toasts stay dismissed for the rest of the session —
// sessionStorage remembers the choice so a navigation doesn't
// immediately re-show it. A *new* SW install (a different build) shows
// it again because we key the session flag on the registration's
// `installing` state via a custom event timestamp.

import { useCallback, useEffect, useState } from "react";

interface UpdateToastProps {
  /** Called when the user clicks "Reload". Should trigger skipWaiting + reload. */
  onReload: () => void;
}

const DISMISSED_KEY = "kboard:pwa-update-dismissed-at";
// Don't re-show the same "update available" notice for 6 hours after
// the user dismisses it. Six hours is a reasonable balance between
// "respect the dismiss" and "tell them about a follow-up deploy".
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000;

export function UpdateToast({ onReload }: UpdateToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onUpdateAvailable() {
      // Respect a recent dismissal in this session.
      try {
        const last = Number(sessionStorage.getItem(DISMISSED_KEY) ?? 0);
        if (last && Date.now() - last < DISMISS_TTL_MS) return;
      } catch {
        // sessionStorage unavailable (private mode, etc.) — show anyway.
      }
      setVisible(true);
    }
    window.addEventListener("kboard:update-available", onUpdateAvailable);
    return () =>
      window.removeEventListener(
        "kboard:update-available",
        onUpdateAvailable,
      );
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      className="update-toast"
      role="status"
      aria-live="polite"
      data-testid="pwa-update-toast"
    >
      <span style={{ flex: 1 }}>A new version of Kboard is ready.</span>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onReload}
        style={{ fontWeight: 600, textDecoration: "underline" }}
      >
        Reload
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={dismiss}
        aria-label="Dismiss update notification"
      >
        ✕
      </button>
    </div>
  );
}
