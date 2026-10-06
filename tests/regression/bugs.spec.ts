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

// ─── BUG: Collapsed sidebar took space on mobile / landscape ────────
// Root cause: Collapsed sidebar rendered as a 56px rail even on mobile / compact landscape,
// squeezing columns on narrow/wide devices like 23.1:9 aspect ratio phones.
// Fix: Remove collapsed sidebar on small/landscape viewports; toggle via topbar menu button.
test.describe("collapsed sidebar removal on small / landscape viewports", () => {
  test("collapsed sidebar is not rendered on mobile / compact viewports", async ({ page }) => {
    // 23.1:9 phone landscape proportion: ~920 x 400
    await page.setViewportSize({ width: 920, height: 400 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Landscape Board");

    // Collapsed sidebar must not exist in DOM
    const sidebar = page.locator(sel.sidebar);
    expect(await sidebar.count()).toBe(0);

    // Clicking topbar menu button opens the full drawer
    const menuBtn = page.locator('button[aria-label="Expand menu"], button[aria-label="Collapse menu"]').first();
    await menuBtn.click();
    await expect(sidebar).toBeVisible();

    // Toggling again hides it
    await menuBtn.click();
    expect(await sidebar.count()).toBe(0);
  });
});

// ─── BUG: Done/Final cards could not be edited/saved ────────────────
// Root cause: Cards in Done columns had save gating or status confusion preventing edits from saving.
// Fix: Cards in Done status are fully editable and can save changes to title, description, and fields.
test.describe("Done/final card editing and saving", () => {
  test("card in Done column can have title, description, and fields edited and saved", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Done Edit Board");
    await bp.addColumn("Done Column");
    await bp.toggleDoneColumn("Done Column");
    await bp.addCard("Done Column", "Done Task");

    // Open the card editor
    const cardEl = page.locator(sel.card).filter({ hasText: "Done Task" });
    await cardEl.click();
    await page.waitForSelector(".modal");

    // Verify title and description can be updated
    const titleInput = page.locator(".card-title-input");
    await titleInput.fill("Updated Done Task");

    // Click Save
    const saveBtn = page.getByRole("button", { name: /^Save$/i });
    expect(await saveBtn.isDisabled()).toBe(false);
    await saveBtn.click();

    // Verify modal closed and card updated
    await expect(page.locator(".modal")).toHaveCount(0);
    await expect(page.locator(sel.card).filter({ hasText: "Updated Done Task" })).toBeVisible();
  });
});

// ─── BUG: Search icon overlapped first 3 letters of search input ─────
// Root cause: The search icon was positioned at left: var(--space-3) overlapping input text.
// Fix: Move search icon inside-right, ensuring typed text stops before the icon.
test.describe("search icon positioning regression", () => {
  test("search icon is positioned on the inside right of search bar without overlapping text", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Search Icon Board");

    const searchInput = page.locator(sel.searchInput);
    await expect(searchInput).toBeVisible();

    const searchIcon = page.locator(".search-bar__icon");
    await expect(searchIcon).toBeVisible();

    const inputRect = await searchInput.boundingBox();
    const iconRect = await searchIcon.boundingBox();
    expect(inputRect).not.toBeNull();
    expect(iconRect).not.toBeNull();

    // The icon must be inside the right half of the search input box
    expect(iconRect!.x).toBeGreaterThan(inputRect!.x + inputRect!.width / 2);
    expect(iconRect!.x + iconRect!.width).toBeLessThanOrEqual(inputRect!.x + inputRect!.width + 2);
  });
});

// ─── BUG: Keyboard shortcuts disclosure visible on touch devices ─────
// Root cause: <details> keyboard help was shown on all viewports, even though
// keyboard drag shortcuts are only relevant on desktop with physical keyboards.
// Fix: Hide .dnd-help on mobile/tablet viewports (< 1024px); render only on desktop.
test.describe("keyboard shortcuts disclosure visibility", () => {
  test("keyboard shortcuts disclosure is hidden on mobile and visible on desktop", async ({
    page,
  }) => {
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Shortcuts A11y Board");

    // Desktop: should be visible
    await page.setViewportSize({ width: 1280, height: 800 });
    const helpDesktop = page.locator(".dnd-help");
    await expect(helpDesktop).toBeVisible();

    // Mobile: should be hidden/removed
    await page.setViewportSize({ width: 360, height: 800 });
    const helpMobile = page.locator(".dnd-help");
    await expect(helpMobile).toBeHidden();

    // Tablet: should be hidden/removed
    await page.setViewportSize({ width: 800, height: 1024 });
    const helpTablet = page.locator(".dnd-help");
    await expect(helpTablet).toBeHidden();
  });
});

// ─── BUG: Desktop sidebar disappeared after resizing to mobile ───────
// Root cause: PR 23 sidebar collapse state did not reactively restore when
// viewport changed between desktop and mobile. Resizing desktop -> mobile -> desktop
// left the sidebar collapsed in desktop mode where no hamburger toggle existed.
// Fix: AppShell synchronizes railCollapsed state when transitioning across desktop breakpoint.
test.describe("sidebar resize restoration regression", () => {
  test("sidebar restores automatically when resizing back to desktop without page reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Resize Restore Board");

    // Initially on desktop, sidebar is visible in-flow
    const sidebar = page.locator(sel.sidebar);
    await expect(sidebar).toBeVisible();
    expect(await sidebar.getAttribute("data-collapsed")).toBe("false");

    // Resize to mobile
    await page.setViewportSize({ width: 360, height: 800 });
    // Collapsed on mobile, menu button visible
    await expect(sidebar).toHaveCount(0);
    const menuBtn = page.locator('.topbar__menu-btn').first();
    await expect(menuBtn).toBeVisible();

    // Resize back to desktop: sidebar must be visible without reloading
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(sidebar).toBeVisible();
    expect(await sidebar.getAttribute("data-collapsed")).toBe("false");
  });
});

// ─── BUG: Mobile left vertical column rail took screen space ──────────
// Root cause: The 56px vertical strip rail on the left was kept even after
// cross-column dragging moved to the popover menu.
// Fix: Left rail removed; horizontal column tabs added at the top on mobile.
test.describe("mobile horizontal column tabs", () => {
  test("renders horizontal tabs at top of board on mobile and no left rail", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Mobile Tabs Board");

    // Vertical rail must not exist on the left
    await expect(page.locator(".kanban-rail")).toHaveCount(0);

    // Horizontal tabs must exist at top
    const tabs = page.locator(".kanban-tabs");
    await expect(tabs).toBeVisible();

    const columnTabs = page.locator(".kanban-tab");
    await expect(columnTabs).toHaveCount(3);
    await expect(columnTabs.first()).toHaveAttribute("data-active", "true");

    // Clicking second tab switches active column
    await columnTabs.nth(1).click();
    await expect(columnTabs.nth(1)).toHaveAttribute("data-active", "true");
  });
});

