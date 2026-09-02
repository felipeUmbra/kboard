import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

test.describe("Boards list", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
  });

  test("Empty state renders for new users", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await expect(page.locator(sel.emptyStateTitle)).toBeVisible();
    await expect(page.locator(sel.emptyStateTitle)).toHaveText(/no boards/i);
    await expect(page.locator(sel.emptyStateCreate)).toBeVisible();
  });

  test("Create board → modal → form → lands in BoardView", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("My Roadmap");
    await expect(page.locator(sel.boardTitle)).toHaveText(/My Roadmap/i);
    // Default card columns & types should be present.
    await expect(page.locator(sel.column).first()).toBeVisible();
  });

  test("Created board is persisted to fake Drive with correct metadata", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Persisted Board");
    const files = await bp.listDriveFiles();
    expect(files.length).toBe(1);
    expect(files[0].name).toMatch(/^board-.+\.json$/);
    expect(files[0].appProperties?.kind).toBe("kboard.board.v1");
    // Content is a JSON-encoded Board shape.
    const parsed = JSON.parse(files[0].content);
    expect(parsed.name).toBe("Persisted Board");
    expect(parsed.columns.length).toBeGreaterThan(0);
    expect(parsed.cardTypes.length).toBeGreaterThan(0);
  });

  test("Open existing board from list", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("First");
    await bp.gotoBoards();
    // BoardContext seeds from cache only; trigger Sync to fetch the new board.
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard).filter({ hasText: "First" })).toBeVisible();
    await bp.openBoard("First");
    await expect(page.locator(sel.boardTitle)).toHaveText(/First/i);
  });

  test("Delete board removes it from list and from Drive", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Doomed");
    await bp.gotoBoards();
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard).filter({ hasText: "Doomed" })).toBeVisible();
    await bp.deleteBoardFromList("Doomed");
    const files = await bp.listDriveFiles();
    expect(files.length).toBe(0);
  });

  test("Reload preserves boards list (cached in Drive + boards-cache)", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Persistent");
    await bp.gotoBoards();
    // Trigger Sync once so the boards cache (localStorage) gets populated.
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard).filter({ hasText: "Persistent" })).toBeVisible();
    // Now reload — the cache should rehydrate the boards list immediately.
    await page.reload();
    await expect(page.locator(sel.boardCard).filter({ hasText: "Persistent" })).toBeVisible();
  });

  test("Sync button re-fetches the list", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Sync Test");
    await bp.gotoBoards();
    await page.locator(sel.syncButton).click();
    // No assertion needed beyond no-error; list should re-render with the same board.
    await expect(page.locator(sel.boardCard).first()).toBeVisible();
  });

  test("Cancel button on create-board modal closes it without creating", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await page.locator(sel.newBoardButton).click();
    await page.fill(sel.createBoardNameInput, "Will be cancelled");
    await page.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(page.locator(sel.createBoardModal)).toHaveCount(0);
    const files = await bp.listDriveFiles();
    expect(files.length).toBe(0);
  });

  test("Create button is disabled with empty name", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await page.locator(sel.newBoardButton).click();
    const createBtn = page.getByRole("button", { name: /^Create$/ });
    await expect(createBtn).toBeDisabled();
    await page.fill(sel.createBoardNameInput, "Now Valid");
    await expect(createBtn).toBeEnabled();
  });
});