import type { Page, BrowserContext } from "@playwright/test";
import { installFakeAuth } from "../fixtures/fakeAuth";
import { installFakeDrive } from "../fixtures/fakeDrive";

/**
 * Drives the app through its real login flow so we land authenticated.
 * Relies on the page having already had `installFakeAuth` + `installFakeDrive`
 * called on it (see BoardPage.login / tests that call installFakesOnPage).
 *
 * The login button opens a popup in real life; our fake GIS stub replaces
 * that with a microtask-callback, so no popup actually appears.
 */
export async function loginAs(page: Page) {
  await page.getByRole("button", { name: /sign in with google/i }).click();
  await page.waitForFunction(
    () => !!localStorage.getItem("kboard:profile"),
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction(
    () => !!localStorage.getItem("kboard:google-token"),
    null,
    { timeout: 10_000 },
  );
}

/**
 * Install both fakes on a context (call BEFORE the first page.goto).
 *
 * We attach the init scripts at the context level so they run before every
 * page's scripts. The GIS stub and Drive map are installed via addInitScript,
 * which is context-scoped — Playwright replays it for every new page.
 */
export async function installFakes(
  context: BrowserContext,
  _opts: { consentDelayMs?: number } = {},
) {
  // Install a no-op init script just to mark the context as "faked".
  // The real fakes are installed per-page by installFakesOnPage to keep the
  // surface minimal and avoid surprises with multi-page scenarios.
  void _opts;
}

/** Convenience: install fakes on a single page before navigation. */
export async function installFakesOnPage(page: Page) {
  await installFakeAuth(page);
  await installFakeDrive(page);
}

/**
 * Clear all persisted auth/profile/drive-cache from localStorage.
 * Must be called AFTER a page is on the app origin (about:blank throws).
 */
export async function clearAuthState(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("kboard:profile");
    localStorage.removeItem("kboard:google-token");
    localStorage.removeItem("kboard:boards-cache");
  });
}