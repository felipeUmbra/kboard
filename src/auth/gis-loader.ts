// Dynamically injects Google's Identity Services (GIS) script.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (err: unknown) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
let loaderPromise: Promise<void> | null = null;

export function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load GIS")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load GIS"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");
