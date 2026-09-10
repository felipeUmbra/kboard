// PWA runtime registration + install prompt plumbing.
//
// We register the service worker from main.tsx (not the plugin's
// auto-injected script) so we can:
//   - dispatch a `kboard:update-available` CustomEvent when a new SW
//     is waiting, and
//   - expose `__kboard_updateSW(true)` on the window so the
//     UpdateToast can trigger a skipWaiting + reload on user demand.
//
// Why we don't auto-apply: the user could be mid-edit on a card.
// cardDrafts.ts keeps unsaved edits in localStorage so they survive a
// reload, but auto-reload still feels surprising. The toast pattern
// matches Linear / Figma / Notion and puts the user in control.
//
// Install prompt: Chrome/Edge/Android fire `beforeinstallprompt` when
// the app meets installability criteria. We capture the event and
// expose `__kboard_installPrompt` so the InstallPrompt banner can
// call `prompt()` on demand. iOS Safari never fires this event — the
// banner shows an iOS-specific "Share → Add to Home Screen" hint
// instead (gated by user-agent + navigator.standalone).
//
// `import.meta.env.DEV` is the build-time gate. In dev the plugin is
// disabled (vite.config.ts -> devOptions.enabled: false) and there is
// no sw.js to register, so this is a no-op.

import { registerSW } from "virtual:pwa-register";

export function registerPwa(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  // Capture updateSW so the UpdateToast can call it later. We don't
  // await: registration is fire-and-forget; failures are logged but
  // never break the app — the SW is an enhancement, not a dependency.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent("kboard:update-available"));
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent("kboard:offline-ready"));
    },
    onRegisterError(err) {
      // eslint-disable-next-line no-console
      console.warn("Kboard: service worker registration failed", err);
    },
  });

  // Exposed for the UpdateToast. We keep this in one place so it's
  // easy to find and easy to type-check in UpdateToast.tsx.
  type KboardWindow = Window & {
    __kboard_updateSW?: (reloadPage?: boolean) => Promise<void>;
  };
  (window as KboardWindow).__kboard_updateSW = updateSW;

  // --- Install prompt plumbing ---
  let storedPrompt: BeforeInstallPromptEvent | null = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    storedPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent("kboard:installable"));
  });

  window.addEventListener("appinstalled", () => {
    storedPrompt = null;
    window.dispatchEvent(new CustomEvent("kboard:install-dismissed"));
  });

  type KboardInstallWindow = Window & {
    __kboard_installPrompt?: {
      prompt: () => Promise<"accepted" | "dismissed">;
    } | null;
  };

  Object.defineProperty(
    (window as KboardInstallWindow),
    "__kboard_installPrompt",
    {
      get: () =>
        storedPrompt
          ? {
              async prompt() {
                await storedPrompt!.prompt();
                const result = storedPrompt!.userChoice;
                storedPrompt = null;
                return result;
              },
            }
          : null,
      configurable: true,
    },
  );
}

/**
 * Triggered by the UpdateToast. Asks the waiting service worker to
 * activate immediately and reloads the page. Idempotent.
 */
export async function applyPwaUpdate(): Promise<void> {
  if (typeof window === "undefined") return;
  type KboardWindow = Window & {
    __kboard_updateSW?: (reloadPage?: boolean) => Promise<void>;
  };
  const fn = (window as KboardWindow).__kboard_updateSW;
  if (!fn) return;
  await fn(true);
  window.location.reload();
}
