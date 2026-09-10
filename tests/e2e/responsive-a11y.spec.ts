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

  test("Mobile: topbar row and sidebar rail fill the viewport with no gaps", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Desktop/tablet don't use the mobile rail or compact topbar.");
    const bp = new BoardPage(page);
    await bp.addCard("To do", "Scroll card");

    // 1) The collapsed sidebar rail spans the full height under the topbar:
    //    its bottom edge must reach the viewport bottom (no gap on scroll).
    const rail = page.locator(sel.sidebarRail);
    await rail.waitFor({ state: "visible", timeout: 3_000 });
    const railBox = await rail.boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    expect(railBox).not.toBeNull();
    expect(railBox!.y).toBeGreaterThanOrEqual(0);
    expect(railBox!.y + railBox!.height).toBeGreaterThanOrEqual(vh - 1);

    // 2) Every topbar child is fully inside the topbar's painted box —
    //    none extend past its bottom or right edge (the "Sign out clips
    //    out of the blue bar" bug).
    const topbarBox = await page.locator("header.topbar").boundingBox();
    expect(topbarBox).not.toBeNull();
    const oob = await page.evaluate((tb) => {
      // boundingBox() only exposes x/y/width/height — derive the edges.
      const tbRight = tb.x + tb.width;
      const tbBottom = tb.y + tb.height;
      const children = Array.from(document.querySelectorAll("header.topbar *"));
      return children.filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        return r.right > tbRight + 1 || r.bottom > tbBottom + 1;
      }).length;
    }, topbarBox!);
    expect(oob).toBe(0);
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