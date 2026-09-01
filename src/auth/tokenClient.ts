import { GOOGLE_SCOPES, loadGis, type TokenClient, type TokenResponse } from "./gis-loader";

let client: TokenClient | null = null;
let currentToken: string | null = null;
let tokenExpiresAt = 0;
let refreshTimer: number | null = null;

const REFRESH_MARGIN_MS = 60_000; // refresh 1 min before expiry

export function getClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!id || id === "your-client-id-here.apps.googleusercontent.com") {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID is missing. Copy .env.example to .env and set your Google OAuth client ID.",
    );
  }
  return id;
}

/** Initialize the GIS token client. Idempotent. */
export async function initTokenClient(): Promise<TokenClient> {
  await loadGis();
  if (client) return client;
  if (typeof window === "undefined" || !window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services unavailable");
  }
  client = window.google.accounts.oauth2.initTokenClient({
    client_id: getClientId(),
    scope: GOOGLE_SCOPES,
    callback: () => {
      // No-op default; overridden per-request below.
    },
  });
  return client;
}

/**
 * Request an access token, prompting the user only if needed.
 * `prompt = ''` performs a silent token grant if the user has already
 * granted the scope; `prompt = 'consent'` forces the consent screen.
 */
export async function requestAccessToken(prompt: "" | "consent" = ""): Promise<string> {
  const c = await initTokenClient();
  return new Promise<string>((resolve, reject) => {
    // Wrap client so we can capture this specific response.
    const wrap: TokenClient = {
      requestAccessToken: (overrides) =>
        c.requestAccessToken({ ...overrides, prompt }),
    };
    const originalCallback = (response: TokenResponse) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      currentToken = response.access_token;
      tokenExpiresAt = Date.now() + response.expires_in * 1000;
      scheduleRefresh();
      resolve(response.access_token);
    };
    // GIS does not let us pass a per-request callback easily, so we
    // re-init the client with a fresh callback each time.
    if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: getClientId(),
        scope: GOOGLE_SCOPES,
        callback: originalCallback,
        error_callback: (err) => reject(err),
      });
    }
    if (!client) {
      reject(new Error("Token client unavailable"));
      return;
    }
    client.requestAccessToken({ prompt });
    // suppress unused warning
    void wrap;
  });
}

function scheduleRefresh() {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  const delay = Math.max(tokenExpiresAt - Date.now() - REFRESH_MARGIN_MS, 5_000);
  refreshTimer = window.setTimeout(() => {
    requestAccessToken("").catch(() => {
      // Silent failure on background refresh; UI will request again on next use.
    });
  }, delay);
}

export function getCurrentToken(): string | null {
  if (!currentToken) return null;
  if (Date.now() >= tokenExpiresAt) return null;
  return currentToken;
}

export function clearToken() {
  if (currentToken && typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(currentToken, () => undefined);
  }
  currentToken = null;
  tokenExpiresAt = 0;
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
