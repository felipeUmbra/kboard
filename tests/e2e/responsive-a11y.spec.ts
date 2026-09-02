import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/**
 * Responsive + a11y smoke tests run on all configured viewports.
 * Each test is intentionally lightweight — we just exercise the major layout
 * pivots so any viewport regression shows up immediately.
 */
test.describe("Responsive + A11y (all viewports)", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Viewport Board");
  });

  test("Board renders without horizontal overflow", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 4,
    );
    expect(overflow).toBe(false);
  });

  test("A11y: cards are keyboard-activatable with Enter", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.addCard("To do", "A11y card");
    const card = page.locator(sel.card).filter({ hasText: "A11y card" }).first();
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(sel.cardTitleInput)).toBeVisible({ timeout: 5_000 });
    await bp.closeCardEditor();
  });

  test("A11y: cards are keyboard-activatable with Space", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.addCard("To do", "Space card");
    const card = page.locator(sel.card).filter({ hasText: "Space card" }).first();
    await card.focus();
    await page.keyboard.press("Space");
    await expect(page.locator(sel.cardTitleInput)).toBeVisible({ timeout: 5_000 });
    await bp.closeCardEditor();
  });

  test("A11y: all icon-only buttons expose aria-label", async ({ page }) => {
    const unlabeled = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons
        .filter((b) => (b.textContent || "").trim() === "" && !b.getAttribute("aria-label"))
        .map((b) => b.outerHTML.slice(0, 80));
    });
    expect(unlabeled).toEqual([]);
  });
});