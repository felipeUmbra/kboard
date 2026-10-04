/**
 * Bug #20 — offline board edits disappear after a failed Drive save.
 *
 * Data-integrity issue, high impact: an edit made while offline renders in
 * the open board but is written neither to `localStorage` nor to Drive, so it
 * vanishes on reload with no error and no retry.
 *
 * Reported chain:
 *   `BoardContext.scheduleSave` -> `withToken` returns `null` on ANY throw
 *   (not just an auth failure), and the local cache write only happens inside
 *   the `if (saved)` branch. So a failed save persists nothing anywhere, and
 *   nothing ever retries it.
 *
 * The docs already promise the opposite ("Drive writes are deferred via the
 * in-memory + localStorage draft path until you're back online",
 * README.md:54), so this is a broken promise as well as lost data.
 *
 * These tests use the fake Drive's PERSISTENT offline flag rather than browser
 * offline emulation: emulated offline can still fulfil Playwright-routed
 * requests, so the save would appear to succeed.
 */

import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/** The debounce is 600ms; wait well past it plus the save round-trip. */
const AFTER_DEBOUNCE_MS = 2_000;

test.describe("Bug #20 — offline edits must not be lost (all viewports)", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Offline board");
    await bp.addCard("To do", "Baseline card", "task");
    // Let the seeded card reach Drive so "online" is genuinely online.
    await expect.poll(async () => (await bp.driveBoardTitles()).length).toBeGreaterThan(0);
  });

  test("an offline edit survives a reload", async ({ page }) => {
    const bp = new BoardPage(page);

    await bp.setDriveOffline(true);
    await bp.addCard("To do", "Offline card", "task");
    await page.waitForTimeout(AFTER_DEBOUNCE_MS);

    // The edit is visible in the open board...
    await expect(
      page.locator(sel.card).filter({ hasText: "Offline card" }),
    ).toBeVisible();

    // ...and the user is told, rather than the failure being silent. Scoped
    // to the unsaved indicator: the board is literally named "Offline board",
    // so any assertion matching /offline/i against a wider region would pass
    // on the board NAME and prove nothing.
    await expect(page.getByTestId("unsaved-indicator")).toBeVisible();

    // Reload and reopen: the local cache is the only thing that can have
    // preserved it, because Drive never received it.
    await page.reload();
    await loginIfNeeded(page);
    await bp.openBoard("Offline board");
    await expect(
      page.locator(sel.card).filter({ hasText: "Offline card" }),
    ).toBeVisible({ timeout: 10_000 });
    // The pre-existing card must still be there too.
    await expect(
      page.locator(sel.card).filter({ hasText: "Baseline card" }),
    ).toBeVisible();
  });

  test("an offline edit is retried to Drive once the network returns", async ({
    page,
  }) => {
    const bp = new BoardPage(page);

    await bp.setDriveOffline(true);
    await bp.addCard("To do", "Deferred card", "task");
    await page.waitForTimeout(AFTER_DEBOUNCE_MS);
    // It never reached Drive while offline.
    expect(await bp.driveBoardTitles()).not.toContain("Deferred card");

    // Network returns. The user does NOTHING else: no further edit, no
    // reopening the board, no navigating. The docs promise the write is
    // deferred until you're back online, so coming back online is on its
    // own sufficient.
    //
    // Adding another card here would carry "Deferred card" along with it
    // (the board is saved as a whole), which would make this test pass even
    // with no retry logic at all — so the deliberate absence of any
    // follow-up action IS the assertion.
    await bp.setDriveOffline(false);

    await expect
      .poll(async () => bp.driveBoardTitles(), { timeout: 20_000 })
      .toContain("Deferred card");
  });

  test("an edit stranded by an offline reload reaches Drive on its own", async ({
    page,
  }) => {
    // The case a reload actually strands. While the page is offline there is
    // no retry timer left to fire and no board is open, so the edit has
    // literally no in-memory path to Drive. It can only be recovered if the
    // dirty flag is durable AND the app retries it on startup — otherwise it
    // sits in the local cache forever, silently out of sync.
    const bp = new BoardPage(page);

    await bp.setDriveOffline(true);
    await bp.addCard("To do", "Stranded card", "task");
    await page.waitForTimeout(AFTER_DEBOUNCE_MS);

    // Reload while STILL offline: this is what destroys the in-memory retry.
    await page.reload();
    await loginIfNeeded(page);

    // No board is opened. The app comes back on its own.
    await bp.setDriveOffline(false);

    // The stranded edit must arrive at Drive with no user action at all.
    await expect
      .poll(async () => bp.driveBoardTitles(), { timeout: 20_000 })
      .toContain("Stranded card");
  });

  test("going offline then online does not report a false success", async ({
    page,
  }) => {
    // Regression guard for the specific failure mode reported: a save that
    // silently no-ops must not leave the UI claiming everything is in sync.
    // Scoped to a dedicated test hook so unrelated copy elsewhere on the
    // page can't satisfy (or break) the assertion.
    const bp = new BoardPage(page);
    const unsaved = page.getByTestId("unsaved-indicator");

    await bp.setDriveOffline(true);
    await bp.addCard("To do", "Unsaved card", "task");
    await page.waitForTimeout(AFTER_DEBOUNCE_MS);

    // The pending state must be visible while unsaved.
    await expect(unsaved).toBeVisible();

    // After it syncs, the pending state must clear.
    await bp.setDriveOffline(false);
    await bp.addCard("To do", "Trigger retry", "task");
    await expect
      .poll(async () => bp.driveBoardTitles(), { timeout: 15_000 })
      .toContain("Unsaved card");
    await expect(unsaved).toBeHidden();
  });
});

/** After a reload the fake-auth session may need restoring before the UI shows. */
async function loginIfNeeded(page: import("@playwright/test").Page) {
  const signIn = page.getByRole("button", { name: /sign in/i }).first();
  if (await signIn.count()) {
    const { loginAs } = await import("../helpers/login");
    await loginAs(page);
  }
}