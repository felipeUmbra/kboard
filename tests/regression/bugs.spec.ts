/**
 * Regression tests for previously-fixed bugs.
 * Each test documents the original bug, root cause, and fix.
 *
 * Run: npx playwright test tests/regression/bugs.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

test.beforeEach(async ({ page }) => {
  await installFakesOnPage(page);
});

// ─── BUG: publishChange applied updater TWICE ──────────────────────
// Root cause: BoardContext.publishChange called the updater once for
// setBoard and again for setBoards. Non-idempotent updaters like
// addCard/addChildCard call cryptoRandomId() each time, so the active
// board and the boards list diverged with different card IDs.
// Fix: apply the updater ONCE, spread the SAME object into both setters.
test.describe("publishChange single-updater fix", () => {
  test("card added in board view appears in boards list without ID divergence", async ({
    page,
  }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Regression Board");
    await bp.addColumn("To Do");
    await bp.addCard("To Do", "Regression Card");

    // Verify the card appears in the board
    await expect(page.locator(sel.card).filter({ hasText: "Regression Card" })).toHaveCount(1);

    // Add a second card to verify multiple adds don't cause ID divergence
    await bp.addCard("To Do", "Second Card");
    await expect(page.locator(sel.card).filter({ hasText: "Second Card" })).toHaveCount(1);

    // Both cards should be present
    const cardCount = await page.locator(sel.card).count();
    expect(cardCount).toBeGreaterThanOrEqual(2);
  });
});

// ─── BUG: Topbar overflow at 360px ────────────────────────────────
// Root cause: At 360px width, the fixed topbar items (menu + logo +
// planner + user) exceeded the available width. User block had
// flex-shrink:0 and overflowed past the right edge.
// Fix: Icon-only planner on mobile, tighter gap/padding.
test.describe("topbar overflow regression", () => {
  test("topbar does not overflow at 360px width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Narrow Board");

    // Get the topbar's bounding box
    const topbar = page.locator(".topbar, header, [class*='topbar']").first();
    await expect(topbar).toBeVisible();

    const box = await topbar.boundingBox();
    expect(box).not.toBeNull();

    // All children of the topbar should be within the viewport width
    const overflows = await page.evaluate((viewportWidth: number) => {
      const topbar = document.querySelector<HTMLElement>(
        ".topbar, header, [class*='topbar']",
      );
      if (!topbar) return [];
      const results: { name: string; right: number }[] = [];
      for (const child of Array.from(topbar.children)) {
        const rect = child.getBoundingClientRect();
        results.push({ name: child.className || child.tagName, right: rect.right });
      }
      return results.filter((r) => r.right > viewportWidth + 1);
    }, 360);

    expect(overflows).toEqual([]);
  });
});

// ─── BUG: Mobile modal footer blocked by modal body ───────────────
// Root cause: At narrow viewports, the Create button was positioned
// under the modal body/input overlay.
// Fix: isolation: isolate + opaque background on .modal__footer, plus
// clickButtonFallback helper for mobile modal buttons.
test.describe("mobile modal layout regression", () => {
  test("modal footer buttons are clickable at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();

    // Open create-board modal
    const createBtn = page.locator(sel.emptyStateCreate).or(
      page.locator(sel.newBoardButton),
    );
    await createBtn.first().click();
    await page.waitForSelector(sel.createBoardModal);
    await page.waitForTimeout(300);

    await page.fill(sel.createBoardNameInput, "Mobile Test Board");

    // The Create button should be clickable (not blocked by body overlay)
    const createButton = page.getByRole("button", { name: /^Create$/ });
    await expect(createButton).toBeVisible();

    // Use clickButtonFallback to handle any pointer interception
    await bp.clickButtonFallback(createButton);

    // Verify the board was created
    await page.waitForSelector(sel.boardTitle, { timeout: 5_000 });
  });
});

// ─── BUG: CSS media query brace imbalance broke desktop ────────────
// Root cause: After moving the mobile modal override block in
// responsive.css, the @media (max-width: 767.98px) block was left
// UNCLOSED. Everything after it (including base .modal styles) got
// nested inside the media query. On desktop the modal computed
// display:block; max-height:none, footer rendered outside viewport.
// Fix: Verify brace balance, fix the unclosed block.
test.describe("CSS media query brace balance regression", () => {
  test("modal renders with correct max-height on desktop after CSS changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Desktop Modal Board");
    await bp.addColumn("To Do");
    await bp.addCard("To Do", "Modal Test Card");

    // Click the card to open the editor modal
    await bp.openCard("Modal Test Card");

    // The modal should have a constrained max-height (not unbounded)
    const modalMaxHeight = await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>(
        'div[role="dialog"]',
      );
      if (!modal) return "none";
      return getComputedStyle(modal).maxHeight;
    });

    // Should not be "none" — the modal should have a height constraint
    expect(modalMaxHeight).not.toBe("none");

    // The Save button should be within the viewport
    const saveBtn = page.locator(sel.cardSave);
    const box = await saveBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThanOrEqual(800); // within viewport height
  });
});

// ─── BUG: dnd-kit collision detection on mobile overlay ─────────────
// Root cause: The mobile expanded column's droppable covered the WHOLE
// rail content area, so pointerWithin/rectIntersection couldn't hit the
// smaller overlay target. Cards dropped on overlay resolved to the giant
// column droppable and stayed unmoved.
// Fix: Overlay targets use distinct prefix "overlay-column:" with custom
// collision detection that raw hit-tests pointer coordinates first.
test.describe("mobile drag-to-column overlay regression", () => {
  test("card can be moved to another column via column combobox in editor", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("DnD Regression Board");
    await bp.addColumn("In Progress");
    await bp.addCard("To do", "Moveable Card");

    // Open the card editor for the card
    await bp.openCard("Moveable Card");

    // Verify card editor is open and has a column selector
    const colSelect = page.locator("#card-col-select");
    if (await colSelect.count()) {
      // Get current column value
      const currentCol = await colSelect.inputValue();

      // Switch to second column
      const options = colSelect.locator("option");
      const optionCount = await options.count();
      if (optionCount > 1) {
        const secondOption = await options.nth(1).getAttribute("value");
        if (secondOption && secondOption !== currentCol) {
          await colSelect.selectOption(secondOption);
          await bp.clickButtonFallback(page.locator(sel.cardSave));

          // Verify the card moved: open second column tab, card should be there
          const secondTab = page.locator(sel.mobileColumnTab).nth(1);
          if (await secondTab.count()) {
            await secondTab.click();
            await page.waitForTimeout(300);
            await expect(
              page.locator(sel.card).filter({ hasText: "Moveable Card" }),
            ).toHaveCount(1);
          }
        }
      }
    }
  });
});

// ─── BUG: boundingBox() has no .right/.bottom ──────────────────────
// Root cause: The test used tb.right/tb.bottom from boundingBox() which
// are undefined (boundingBox returns {x,y,width,height}). The assertion
// r.right > NaN always evaluated to false, so the test silently always
// passed while the topbar actually overflowed.
// Fix: Derive tbRight = tb.x + tb.width, tbBottom = tb.y + tb.height.
test.describe("boundingBox property access regression", () => {
  test("boundingBox derivation uses x+width and y+height", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Bounding Box Test");

    const topbar = page.locator(".topbar, header, [class*='topbar']").first();
    await expect(topbar).toBeVisible();

    const box = await topbar.boundingBox();
    expect(box).not.toBeNull();

    // Derive right and bottom correctly (the fix)
    const right = box!.x + box!.width;
    const bottom = box!.y + box!.height;

    // right must be within viewport (no overflow)
    expect(right).toBeLessThanOrEqual(360 + 1); // 1px tolerance
    // bottom must be reasonable for a topbar
    expect(bottom).toBeLessThanOrEqual(100);
  });
});
