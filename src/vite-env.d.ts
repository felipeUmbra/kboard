/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Provided by vite-plugin-pwa. We import { registerSW } from it in
// main.tsx to wire the service worker into the React app without
// auto-applying updates.
declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }
  /**
   * Returns a function that, when called with `true`, asks the
   * waiting service worker to skip waiting and activate immediately.
   * Returns the same registration regardless of the argument.
   */
  export function registerSW(
    options?: RegisterSWOptions,
  ): (reloadPage?: boolean) => Promise<void>;
}

