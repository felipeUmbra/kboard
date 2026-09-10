// PWA install banner.
//
// Shown when the browser fires `beforeinstallprompt` (Chrome / Edge /
// Android) or on iOS Safari where the user must manually share → Add
// to Home Screen. Dismissible; remembered for the session via
// sessionStorage (same pattern as UpdateToast).
//
// Once the app is already installed / running in standalone mode, the
// banner never renders (CSS display-mode: standalone + runtime matchMedia).

import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "kboard:install-dismissed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isIOS(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  );
}

function isStandalone(): boolean {
  if ("matchMedia" in window) {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallPrompt() {
  const [showChrome, setShowChrome] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    try {
      const last = Number(sessionStorage.getItem(DISMISSED_KEY) ?? 0);
      if (last && Date.now() - last < DISMISS_TTL_MS) return;
    } catch {
      // sessionStorage unavailable — show anyway.
    }

    if (isIOS()) {
      setShowIOS(true);
      return;
    }

    function onInstallable() {
      if (
        !(window as Window & { __kboard_installPrompt?: unknown })
          .__kboard_installPrompt
      )
        return;
      setShowChrome(true);
    }
    window.addEventListener("kboard:installable", onInstallable);

    if (
      (window as Window & { __kboard_installPrompt?: unknown })
        .__kboard_installPrompt
    ) {
      setShowChrome(true);
    }

    return () =>
      window.removeEventListener("kboard:installable", onInstallable);
  }, []);

  const dismiss = useCallback(() => {
    setShowChrome(false);
    setShowIOS(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }, []);

  const handleInstall = useCallback(async () => {
    const api = (
      window as Window & {
        __kboard_installPrompt?: {
          prompt: () => Promise<"accepted" | "dismissed">;
        } | null;
      }
    ).__kboard_installPrompt;
    if (!api) return;
    try {
      await api.prompt();
    } catch {
      // prompt() can reject — ignore.
    }
    setShowChrome(false);
  }, []);

  if (!showChrome && !showIOS) return null;

  if (showChrome) {
    return (
      <div
        className="install-toast"
        role="status"
        aria-live="polite"
        data-testid="pwa-install-toast"
      >
        <span style={{ flex: 1 }}>Install Kboard as an app</span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleInstall}
          style={{ fontWeight: 600 }}
        >
          Install
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ fontWeight: 600 }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      className="install-toast install-toast--ios"
      role="status"
      aria-live="polite"
      data-testid="pwa-install-ios-hint"
    >
      <span style={{ flex: 1 }}>
        Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to
        install Kboard.
      </span>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ fontWeight: 600 }}
      >
        ✕
      </button>
    </div>
  );
}
