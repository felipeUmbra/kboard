// Saved-view end-to-end checks.
//
// Drives the real toolbar menu. The behaviour under test is the one the plan
// locked: a view is board-scoped, names are unique (case-insensitive), and
// editing a filter while a view is active must UPDATE that view rather than
// silently creating a duplicate.

import { test, expect, type Page } from "@playwright/test";
import { BoardPage } from "../helpers/boardPage";
import { installFakesOnPage } from "../helpers/login";
import { sel } from "../helpers/selectors";

const viewsTrigger = '[data-testid="views-trigger"]';
const viewsMenu = '[data-testid="views-menu"]';
const saveBtn = '[data-testid="views-save"]';
const nameInput = '[data-testid="views-name-input"]';
const submit = '[data-testid="views-submit"]';
const error = '[data-testid="views-error"]';

async function openViews(page: Page) {
  await page.locator(viewsTrigger).click();
  await expect(page.locator(viewsMenu)).toBeVisible();
}

/** Filter to a single card type so there is something worth saving. */
async function filterToTask(page: Page) {
  await page.locator('[data-testid="filter-trigger"]').click();
  await expect(page.locator('[data-testid="filter-menu"]')).toBeVisible();
  await page.locator('[data-testid="filter-type-task"]').check();
  await page.locator('[data-testid="filter-menu-done"]').click();
  await expect(page.locator('[data-testid="filter-menu"]')).toHaveCount(0);
}

test.describe("Saved views", () => {
  test("saves the current filter as a named view and applies it back", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Saved views");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");
    await bp.addCard("", "An epic card", "epic");

    await filterToTask(page);
    await expect(page.locator(sel.card)).toHaveCount(1);

    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Only tasks");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // The saved view is now the active one.
    await openViews(page);
    await expect(page.locator('[data-testid="views-list"]')).toContainText("Only tasks");
    await expect(page.locator('[data-testid="views-active-name"]')).toContainText(
      "Only tasks",
    );
  });

  test("clearing the filter then re-applying the view restores it", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Reapply view");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Tasks only");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Wipe the filter entirely.
    await page.locator('[data-testid="filter-clear-all"]').click();
    await expect(page.locator(sel.card)).toHaveCount(2);

    // Applying the view brings the filter back.
    await openViews(page);
    await page
      .locator('[data-testid="views-list"] button.saved-views__item')
      .filter({ hasText: "Tasks only" })
      .click();
    await expect(page.locator('[data-testid="filter-badge"]')).toHaveText("1");
    await expect(page.locator(sel.card)).toHaveCount(1);
  });

  test("rejects a duplicate name case-insensitively", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Duplicate names");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Bugs");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Same name, different case — must be refused with a visible message.
    await page.locator('[data-testid="filter-clear-all"]').click();
    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("bugs");
    await page.locator(submit).click();

    await expect(page.locator(error)).toBeVisible();
    await expect(page.locator(error)).toContainText(/already exists/i);
    // The menu stays open so the user can correct the name.
    await expect(page.locator(viewsMenu)).toBeVisible();
  });

  test("rejects an empty name", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Empty name");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(submit).click();

    await expect(page.locator(error)).toContainText(/enter a name/i);
  });

  test("editing a view in place updates it instead of duplicating", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Update in place");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");
    await bp.addCard("", "An epic card", "epic");

    // Save "Tasks".
    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Tasks");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Add a card type to the SAME view. The save action must now offer to
    // update "Tasks", never to create a second view.
    await page.locator('[data-testid="filter-trigger"]').click();
    await expect(page.locator('[data-testid="filter-menu"]')).toBeVisible();
    await page.locator('[data-testid="filter-type-story"]').check();
    await page.locator('[data-testid="filter-menu-done"]').click();

    await openViews(page);
    await expect(page.locator(saveBtn)).toContainText("Update view — Tasks");
    await page.locator(saveBtn).click();
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Exactly one view, and it now matches the edited filter.
    await openViews(page);
    await expect(page.locator('[data-testid="views-list"] > li')).toHaveCount(1);
    await expect(page.locator('[data-testid="views-list"]')).toContainText("Tasks");
  });

  test("renames a view", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Rename view");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Old name");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    await openViews(page);
    await page.locator('[data-testid="views-list"] button.saved-views__rename').first().click();
    await page.locator(nameInput).fill("New name");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    await openViews(page);
    await expect(page.locator('[data-testid="views-list"]')).toContainText("New name");
    await expect(page.locator('[data-testid="views-list"]')).not.toContainText("Old name");
  });

  test("deletes a view", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Delete view");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Temporary");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    await openViews(page);
    await expect(page.locator('[data-testid="views-list"]')).toContainText("Temporary");
    await page.locator('[data-testid="views-list"] button.saved-views__delete').first().click();

    // Deleting the last view unmounts the list, so the element the negative
    // assertion targets no longer exists — assert on the menu's empty state
    // instead of on a removed <ul>.
    await expect(page.locator('[data-testid="views-menu"]')).toContainText("No saved views yet");
  });

  test("a saved view survives a reload", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Persist view");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Survivor");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Board saves are DEBOUNCED (600ms, BoardContext). Leaving the board
    // before the timer fires would navigate away and read back a document
    // that never received the view. Wait past the debounce so the assertion
    // below actually tests persistence rather than timing.
    await page.waitForTimeout(1_500);

    // Re-open the board the way a new session would, rather than a bare
    // reload: reload() drops the in-memory board and lands on the board
    // list, which would test navigation rather than persistence. Sync so the
    // list is rebuilt from Drive, then open the board.
    await bp.gotoBoards();
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard).filter({ hasText: "Persist view" })).toBeVisible();
    await bp.openBoard("Persist view");
    await expect(page.locator(sel.card).first()).toBeVisible();

    await openViews(page);
    await expect(page.locator('[data-testid="views-list"]')).toContainText("Survivor");
  });

  test("views are scoped to their own board", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Board one");
    await bp.addCard("", "A task card", "task");
    await bp.addCard("", "A story card", "story");

    await filterToTask(page);
    await openViews(page);
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Only on board one");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Let the debounced save land before navigating to the other board,
    // otherwise this would assert against a document that never got the view.
    await page.waitForTimeout(1_500);

    // A second board must not see the first board's view.
    await bp.gotoBoards();
    await bp.createBoard("Board two");
    await bp.addCard("", "Two task", "task");
    await bp.addCard("", "Two story", "story");
    await expect(page.locator(sel.card)).toHaveCount(2);

    // Guard against a vacuous pass: if the menu could not open at all, the
    // negative assertion below would pass for the wrong reason. Confirm the
    // menu really renders and that saving works on THIS board first.
    await filterToTask(page);
    await openViews(page);
    await expect(page.locator('[data-testid="views-menu"]')).not.toContainText(
      "Only on board one",
    );
    await page.locator(saveBtn).click();
    await page.locator(nameInput).fill("Board two view");
    await page.locator(submit).click();
    await expect(page.locator(viewsMenu)).toHaveCount(0);

    // Board one's view is absent; board two's own view is present.
    await openViews(page);
    await expect(page.locator('[data-testid="views-list"]')).toContainText("Board two view");
    await expect(page.locator('[data-testid="views-list"]')).not.toContainText(
      "Only on board one",
    );
  });
});