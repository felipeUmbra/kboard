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

  test("A11y: Enter opens the card editor, Space starts a drag", async ({ page }) => {
    // Bug #18: these used to be two tests asserting the OPPOSITE for Space.
    // One claimed Space opens the editor, the other claimed Space picks the
    // card up for a keyboard drag — and the editor assertion won, which is
    // exactly how keyboard users lost the ability to reorder a card. One key
    // press cannot do both, so the split is now explicit:
    //
    //   Enter → open the card (the card's primary action)
    //   Space → pick up / drop, per the "Keyboard shortcuts" help and WCAG 2.1.1
    //
    // Space must NOT open the editor; that assertion is the regression guard.
    //
    // CI flaked this test twice (chromium-desktop + chromium-mobile, "2 flaky",
    // green only because `retries: 2` is set). The cause was a race in THIS
    // test, not the product: `closeCardEditor()` waits for the title input to
    // detach and then a fixed 100ms, but the board re-render — which re-mounts
    // the card and re-registers it with dnd-kit — lands after that. Pressing
    // Space inside that window started a drag against a node the sensor then
    // released, leaving `aria-pressed` stuck at "true" for the whole 5s
    // expect timeout. Verified with a probe that the product itself always
    // clears `aria-pressed` within ~100ms of Escape.
    //
    // Fix: wait for a condition that is actually true only once the board has
    // settled — focus must LAND on the card — instead of assuming a delay.
    const bp = new BoardPage(page);
    await bp.addCard("To do", "Keyboard card");
    const card = page.locator(sel.card).filter({ hasText: "Keyboard card" }).first();

    // Enter opens the editor.
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(sel.cardTitleInput)).toBeVisible({ timeout: 5_000 });
    await bp.closeCardEditor();

    // Space starts a keyboard drag instead, and announces pickup.
    // Re-focus and require focus to have landed, so the drag begins against a
    // settled card rather than one that is still being re-mounted.
    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator(sel.cardTitleInput)).toHaveCount(0);
    await expect(card).toHaveAttribute("aria-pressed", "true");

    // Escape returns the card without moving it. Assert on the live region too:
    // it clears on drag end, so it independently proves the drag really ended
    // rather than the attribute lagging a render behind.
    await page.keyboard.press("Escape");
    await expect(card).not.toHaveAttribute("aria-pressed", /.*/);
    await expect(page.locator(".sr-only[aria-live='polite']").first()).toHaveText("");
    await expect(page.locator(sel.card)).toHaveCount(1);
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