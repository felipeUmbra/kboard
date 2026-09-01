import { GOOGLE_SCOPES, loadGis, type TokenClient, type TokenResponse } from "./gis-loader";

let client: TokenClient | null = null;
let currentToken: string | null = null;
let tokenExpiresAt = 0;
let refreshTimer: number | null = null;

// Serialize concurrent token requests so they don't race each other.
// Without this, the second call's popup invalidates the first call's
// callback, and the first call's Promise never resolves.
let inFlight: Promise<string> | null = null;

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
 *
 * Concurrent callers share a single in-flight Promise so we don't open
 * two OAuth popups at once.
 */
export async function requestAccessToken(prompt: "" | "consent" = ""): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Reuse the cached token if it's still valid.
      const cached = getCurrentToken();
      if (cached && prompt === "") return cached;

      await initTokenClient();
      return await new Promise<string>((resolve, reject) => {
        if (typeof window === "undefined" || !window.google?.accounts?.oauth2) {
          reject(new Error("Google Identity Services unavailable"));
          return;
        }
        // Use a per-request client so we can capture THIS request's
        // response with its own callback/error_callback. (GIS doesn't
        // support per-request callbacks on a shared client.)
        const requestClient = window.google.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope: GOOGLE_SCOPES,
          callback: (response: TokenResponse) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            currentToken = response.access_token;
            tokenExpiresAt = Date.now() + response.expires_in * 1000;
            scheduleRefresh();
            resolve(response.access_token);
          },
          error_callback: (err) => reject(err),
        });
        requestClient.requestAccessToken({ prompt });
        // Keep `client` pointing at the latest instance for the refresh path.
        client = requestClient;
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
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
  inFlight = null;
}
