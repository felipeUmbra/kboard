import type { Page } from "@playwright/test";
import { testProfile, type TestProfile } from "./testProfile";

/**
 * Stubs Google Identity Services (GIS) so the test never opens a real popup
 * to accounts.google.com.
 *
 * Two layers of defense:
 *   1. `page.route` intercepts the GIS script itself and returns an empty body.
 *      This prevents the real script from ever loading.
 *   2. `addInitScript` defines `window.google.accounts.oauth2` BEFORE any app
 *      code runs, with the same shape the app uses (initTokenClient + revoke).
 *
 * The app's startup gate (getClientId) checks for the placeholder
 * "your-client-id-here.apps.googleusercontent.com". The Playwright config sets
 * VITE_GOOGLE_CLIENT_ID to a syntactically-valid fake so the gate passes.
 */
export async function installFakeAuth(
  page: Page,
  opts: { profile?: TestProfile; forceConsentOnce?: boolean } = {},
) {
  const profile = opts.profile ?? testProfile;

  // Block the real GIS script with a tiny stub. The app never reads its
  // contents — addInitScript below pre-installs window.google.*.
  await page.route("https://accounts.google.com/gsi/client", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "/* faked by tests/fixtures/fakeAuth.ts */",
    });
  });

  // Stub /oauth2/v3/userinfo so useAuth.login() can fetch the profile.
  await page.route("**/www.googleapis.com/oauth2/v3/userinfo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sub: profile.id,
        name: profile.name,
        email: profile.email,
        picture: profile.picture,
      }),
    });
  });

  // Install a fake window.google.accounts.oauth2 BEFORE app code runs.
  await page.addInitScript((p: TestProfile) => {
    type TokenResponse = Partial<{
      access_token: string;
      expires_in: number;
      scope: string;
      token_type: string;
      error: string;
      error_description: string;
    }>;

    type TokenClient = {
      requestAccessToken: (overrides?: { prompt?: string }) => void;
    };

    let consentDelay = 0;
    let nextResponseError: { error: string; error_description?: string } | null = null;

    const fakeClient: TokenClient = {
      requestAccessToken(overrides) {
        const prompt = overrides?.prompt ?? "";
        const cb = (window as unknown as {
          __kboardLastTokenCb?: (r: TokenResponse) => void;
        }).__kboardLastTokenCb;
        if (!cb) return;
        const reply = () => {
          // If the test set an error response, deliver it once.
          if (nextResponseError) {
            const err: TokenResponse = nextResponseError;
            nextResponseError = null;
            cb(err);
            return;
          }
          cb({
            access_token: `fake-token-${Date.now()}`,
            expires_in: 3600,
            scope: "openid email profile https://www.googleapis.com/auth/drive.appdata",
            token_type: "Bearer",
          });
        };
        if (prompt === "consent" || consentDelay > 0) {
          const ms = consentDelay > 0 ? consentDelay : 80;
          consentDelay = 0;
          window.setTimeout(reply, ms);
        } else {
          Promise.resolve().then(reply);
        }
      },
    };

    const oauth2 = {
      initTokenClient(_config: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (err: unknown) => void;
      }): TokenClient {
        (window as unknown as { __kboardLastTokenCb?: (r: TokenResponse) => void }).__kboardLastTokenCb =
          _config.callback;
        return fakeClient;
      },
      revoke(_token: string, done?: () => void) {
        done?.();
      },
    };

    (window as unknown as { google?: unknown }).google = {
      accounts: { oauth2 },
    };

    // Test helpers exposed on window:
    (window as unknown as { __kboardSetConsentDelay?: (ms: number) => void }).__kboardSetConsentDelay =
      (ms: number) => {
        consentDelay = ms;
      };
    (window as unknown as { __kboardSetNextError?: (e: { error: string; error_description?: string } | null) => void }).__kboardSetNextError =
      (e) => {
        nextResponseError = e;
      };
    (window as unknown as { __kboardProfile?: TestProfile }).__kboardProfile = p;
  }, profile);
}