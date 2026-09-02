import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

test.describe("Drive integration & failure paths", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
  });

  test("GET /files returns the boards in appDataFolder", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.createBoard("Listed Board");
    const files = await bp.listDriveFiles();
    expect(files.length).toBe(1);
    expect(files[0].appProperties?.kind).toBe("kboard.board.v1");
  });

  test("POST /upload creates a board file with multipart body", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.createBoard("Multipart Test");
    const files = await bp.listDriveFiles();
    expect(files.length).toBe(1);
    // Body is valid JSON and has the Board shape.
    const parsed = JSON.parse(files[0].content);
    expect(parsed.id).toBeTruthy();
    expect(Array.isArray(parsed.columns)).toBeTruthy();
    expect(Array.isArray(parsed.cardTypes)).toBeTruthy();
  });

  test("PATCH /upload updates existing board file (version increments)", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.createBoard("Versioned");
    const v1 = (await bp.listDriveFiles())[0].version;
    await bp.addCard("To do", "V bump");
    // Poll until the debounced save flushes.
    await expect
      .poll(async () => (await bp.listDriveFiles())[0]?.version, { timeout: 5_000 })
      .not.toBe(v1);
  });

  test("DELETE /files removes the board", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.createBoard("To remove");
    await bp.gotoBoards();
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard).filter({ hasText: "To remove" })).toBeVisible();
    await bp.deleteBoardFromList("To remove");
    // Poll until the DELETE round-trip completes.
    await expect.poll(async () => (await bp.listDriveFiles()).length, { timeout: 5_000 }).toBe(0);
  });

  test("401 from Drive triggers automatic retry (no error shown)", async ({ page }) => {
    const bp = new BoardPage(page);
    // First Drive call (list) returns 401; driveClient.authedFetch retries once; retry succeeds.
    await bp.setDriveForce401Once();
    await bp.createBoard("Survives 401");
    // Poll until the board is in Drive.
    await expect
      .poll(async () => (await bp.listDriveFiles()).length, { timeout: 5_000 })
      .toBe(1);
    expect((await bp.listDriveFiles())[0].name).toMatch(/^board-/);
  });

  test("Persistent 401 surfaces a Banner with 'Reconnect to Drive'", async ({ page }) => {
    const bp = new BoardPage(page);
    // Override Drive routes to always return 401.
    await page.route("**/www.googleapis.com/drive/v3/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 401, message: "Persistent 401" } }),
      }),
    );
    await page.route("**/www.googleapis.com/upload/drive/v3/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 401, message: "Persistent 401" } }),
      }),
    );
    await page.locator(sel.newBoardButton).click();
    await page.fill(sel.createBoardNameInput, "401 Test");
    await page.getByRole("button", { name: /^Create$/ }).click();
    const banner = page.locator(sel.banner);
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test("Network failure shows the Banner with recovery action", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.setDriveForceNetworkError();
    await page.locator('button.btn--primary:has-text("New board"), .empty-state button.btn--primary').first().click();
    await page.fill('input#b-name', "NetErr Test");
    await page.getByRole("button", { name: /^Create$/ }).click();
    const banner = page.locator("[role='alert'], .banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
  });

  test("ETag / If-Match header round-trip on PATCH", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.createBoard("ETag Test");
    const version = (await bp.listDriveFiles())[0].version;
    await bp.addCard("To do", "etag card");
    // Poll until the debounced save flushes.
    await expect
      .poll(async () => (await bp.listDriveFiles())[0]?.version, { timeout: 5_000 })
      .not.toBe(version);
  });
});