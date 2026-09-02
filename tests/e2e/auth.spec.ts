import { test, expect } from "@playwright/test";
import { installFakes, installFakesOnPage, clearAuthState } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

test.describe("Authentication", () => {
  test.beforeEach(async ({ context, page }) => {
    await installFakes(context);
    await installFakesOnPage(page);
    await clearAuthState(page);
  });

  test("shows login screen when no profile is cached", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(sel.loginCard)).toBeVisible();
    await expect(page.locator(sel.loginButton)).toBeVisible();
  });

  test("Sign-in persists profile and token to localStorage", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    const profile = await page.evaluate(() => localStorage.getItem("kboard:profile"));
    const token = await page.evaluate(() => localStorage.getItem("kboard:google-token"));
    expect(profile).toBeTruthy();
    expect(token).toBeTruthy();
    const parsedToken = JSON.parse(token!);
    expect(parsedToken.accessToken).toMatch(/^fake-token-/);
    expect(parsedToken.expiresAt).toBeGreaterThan(Date.now());
  });

  test("Hard reload preserves session (no popup)", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    // Track popup attempts: any page.on("popup") would fire.
    let popupCount = 0;
    page.on("popup", () => popupCount++);
    await page.reload();
    // After reload, we should land on the board list, NOT the login screen.
    await expect(page.locator(sel.loginButton)).toHaveCount(0);
    expect(popupCount).toBe(0);
  });

  test("Logout clears profile and token", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.logout();
    const profile = await page.evaluate(() => localStorage.getItem("kboard:profile"));
    const token = await page.evaluate(() => localStorage.getItem("kboard:google-token"));
    expect(profile).toBeNull();
    expect(token).toBeNull();
    await expect(page.locator(sel.loginButton)).toBeVisible();
  });

  test("Reconnect-to-Drive banner appears on persistent 401", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    // The Drive stub is one-shot per flag. We install a persistent interceptor
    // that always returns 401 for any Drive call.
    await page.route("**/www.googleapis.com/drive/v3/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 401, message: "Persistent 401 for test" } }),
      }),
    );
    await page.route("**/www.googleapis.com/upload/drive/v3/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 401, message: "Persistent 401 for test" } }),
      }),
    );
    // The create-board POST will fail and the retry will also fail → banner.
    await page.locator(sel.newBoardButton).click();
    await page.fill(sel.createBoardNameInput, "Doomed Auth");
    await page.getByRole("button", { name: /^Create$/ }).click();
    const banner = page.locator(sel.banner);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/reconnect|sign in|401|403/i);
  });

  test("Token cache is rehydrated across reloads (localStorage hydration)", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    // Manually expire the token to test the eviction-on-read path.
    await page.evaluate(() => {
      const raw = localStorage.getItem("kboard:google-token");
      if (!raw) return;
      const t = JSON.parse(raw);
      t.expiresAt = Date.now() - 1000;
      localStorage.setItem("kboard:google-token", JSON.stringify(t));
    });
    // After reload, the expired token should be evicted; profile stays.
    await page.reload();
    const tokenAfter = await page.evaluate(() => localStorage.getItem("kboard:google-token"));
    expect(tokenAfter).toBeNull();
    // Profile should still be present (we don't auto-sign-out on token expiry).
    const profile = await page.evaluate(() => localStorage.getItem("kboard:profile"));
    expect(profile).toBeTruthy();
  });

  test("Sign-in error is surfaced when GIS returns error response", async ({ page }) => {
    // Tell the fakeGIS stub to deliver an error on the NEXT token request.
    await page.goto("/");
    await page.evaluate(() => {
      (window as unknown as { __kboardSetNextError?: (e: { error: string; error_description?: string } | null) => void })
        .__kboardSetNextError?.({
          error: "access_denied",
          error_description: "User denied access",
        });
    });
    await page.locator(sel.loginButton).click();
    await expect(page.locator(sel.loginError)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(sel.loginError)).toContainText(/denied|sign-in failed/i);
  });
});