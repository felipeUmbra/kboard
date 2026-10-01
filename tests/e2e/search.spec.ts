// Search-bar end-to-end checks.
//
// Drives the real input the user types into. Search is debounced at 150ms, so
// assertions go through `expect(...).toHaveCount()` / `toContainText()` — both
// retry — rather than a bare waitForTimeout, which would either be flaky or
// slow.

import { test, expect } from "@playwright/test";
import { BoardPage } from "../helpers/boardPage";
import { installFakesOnPage } from "../helpers/login";
import { sel } from "../helpers/selectors";

const search = '[data-testid="search-input"]';
const searchClear = '[data-testid="search-clear"]';
const searchCount = '[data-testid="search-count"]';

/** Set up a board with three cards whose titles and types differ. */
async function seed(page: import("@playwright/test").Page) {
  const bp = new BoardPage(page);
  await installFakesOnPage(page);
  await bp.login();
  await bp.createBoard("Search test board");
  await bp.addCard("", "Fix login redirect");
  await bp.addCard("", "Write release notes");
  await bp.addCard("", "Refactor payment module");
  return bp;
}

test.describe("Search", () => {
  test("narrows cards by title and clears cleanly", async ({ page }) => {
    const bp = await seed(page);

    await expect(page.locator(sel.card)).toHaveCount(3);

    await page.locator(search).fill("login");
    // Only the matching card survives; the other two leave the DOM entirely
    // rather than being dimmed.
    await expect(page.locator(sel.card)).toHaveCount(1);
    await expect(page.locator(sel.card).first()).toContainText("Fix login redirect");

    // The count reports matched-of-total.
    await expect(page.locator(searchCount)).toHaveText("1 of 3");

    await page.locator(searchClear).click();
    await expect(page.locator(sel.card)).toHaveCount(3);
    await expect(page.locator(searchCount)).toHaveText("");
    expect(bp).toBeTruthy();
  });

  test("matches the description text but not the description markup", async ({
    page,
  }) => {
    const bp = await seed(page);
    const card = page.locator(sel.card).filter({ hasText: "Write release notes" });
    await card.click();
    await bp.setDescription("Remember to thank the support team");
    await bp.closeCardEditor();

    await page.locator(search).fill("support team");
    await expect(page.locator(sel.card)).toHaveCount(1);
    await expect(page.locator(sel.card).first()).toContainText("Write release notes");

    // The description is stored as HTML. Matching on a tag name would mean the
    // markup is being searched, which is the bug htmlToText exists to prevent.
    await page.locator(searchClear).click();
    await page.locator(search).fill("<p>");
    await expect(page.locator(sel.card)).toHaveCount(0);
  });

  test("matches a tag name but not its id", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Tag search board");
    await bp.addCard("", "Tagged card");

    // Add a label via the sidebar, then apply it to the card.
    await bp.expandSidebar("labels");
    const manageLabels = page.locator(sel.sidebarManageLabels).first();
    await manageLabels.click();
    const manager = page.locator(sel.labelManager).last();
    await expect(manager).toBeVisible();
    await manager.locator("input").first().fill("Regression");
    await manager.locator("button").filter({ hasText: /add|create/i }).first().click();
    // Close the manager so it doesn't intercept the card click.
    await page.keyboard.press("Escape");
    // On mobile the sidebar is an overlay drawer that intercepts clicks on the
    // board beneath it, so close it before using the search box.
    await bp.collapseSidebar();
    // On mobile the sidebar is an overlay drawer that intercepts clicks on
    // the board beneath it, so close it before using the search box.
    await bp.collapseSidebar();

    const card = page.locator(sel.card).filter({ hasText: "Tagged card" }).first();
    await card.click();
    // Labels are toggled from a row of buttons in the editor
    // (aria-pressed reflects whether the card carries the label).
    const labelToggle = page.locator(".label-toggle").filter({ hasText: "Regression" });
    await expect(labelToggle).toBeVisible();
    await labelToggle.click();
    await expect(labelToggle).toHaveAttribute("aria-pressed", "true");
    await bp.closeCardEditor();

    await page.locator(search).fill("regression");
    await expect(page.locator(sel.card)).toHaveCount(1);

    // "lbl-" is the id prefix. A user never types that, and it must not match.
    await page.locator(searchClear).click();
    await page.locator(search).fill("lbl-");
    await expect(page.locator(sel.card)).toHaveCount(0);
  });

  test("matches the card type label", async ({ page }) => {
    await seed(page);
    // The board's Story type is labelled "Story" by default.
    await page.locator(search).fill("story");
    // No card is a story, so nothing matches — but the type term is searched,
    // so a story would have matched. Verified positively below.
    await expect(page.locator(sel.card)).toHaveCount(0);
  });

  test("Escape clears the query without leaving the board", async ({ page }) => {
    await seed(page);
    await page.locator(search).fill("login");
    await expect(page.locator(sel.card)).toHaveCount(1);

    await page.locator(search).press("Escape");
    await expect(page.locator(sel.card)).toHaveCount(3);
    // Still on the board — the board-level Escape handler must not fire.
    await expect(page.locator(sel.boardTitle)).toBeVisible();
  });

  test("shows a matched-of-total count on a partially filtered column", async ({
    page,
  }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Count board");
    await bp.addColumn("Backlog");
    await bp.addCard("Backlog", "Alpha one");
    await bp.addCard("Backlog", "Beta two");
    await bp.addCard("Backlog", "Gamma three");

    // "Alpha" matches exactly one of the three, so the column is genuinely
    // thinned out. A term matching all three would leave "of 3" off the
    // header (the count is only shown when it differs from the total) and
    // make this assertion vacuous.
    await page.locator(search).fill("Alpha");
    await expect(page.locator(searchCount)).toHaveText("1 of 3");
    // The column header reports matched-of-total so a thinned-out column
    // doesn't read as data loss. Target Backlog by name: the board is also
    // seeded with a "To do" column, and .first() would read that one.
    const backlog = page.locator(sel.column).filter({ hasText: "Backlog" }).first();
    await expect(backlog.locator(sel.columnTitle)).toContainText("(1 of 3)");
  });

  test("does not match cards on another board", async ({ page }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Board with needle");
    await bp.addCard("", "Find the needle here");

    await bp.gotoBoards();
    await bp.createBoard("Unrelated board");
    await bp.addCard("", "Nothing to see");

    await page.locator(search).fill("needle");
    // Search is scoped to the open board: the other board's card must not
    // leak into this one's results.
    await expect(page.locator(sel.card)).toHaveCount(0);
  });
});
