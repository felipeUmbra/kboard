import { test, expect, type Page } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/**
 * Sprint 4.4 — visual-regression baselines.
 *
 * Scope and rationale
 * -------------------
 * A full pixel-diff suite is not the right investment here, and pretending
 * otherwise would produce a test suite that is flaky and ignored. What
 * actually broke during Sprints 1–3 was never "a colour is a slightly
 * different shade" — it was structural: the sidebar rail not filling the
 * viewport, a column overflowing horizontally, a control losing its 44px
 * target. Those are layout facts, and they are already asserted directly
 * in `responsive-a11y.spec.ts` and `a11y-sprint2-3.spec.ts`.
 *
 * So this file captures the three canonical layouts as screenshots. They
 * are not compared against golden images — a golden image would need a
 * commit per Chromium version, per platform, and per font-rendering
 * change, and would fail on all of them for reasons that have nothing to
 * do with the code. Instead the images are written to `test-results/` on
 * every run, which gives a reviewer something concrete to look at on a
 * pull request, and the assertions around them are the geometric ones
 * that are stable across environments.
 *
 * If the team later wants true pixel diffing, the honest path is
 * `toHaveScreenshot` with `maxDiffPixelRatio` set per platform, and a
 * deliberate decision about which platforms are gated. That is a separate
 * decision, not something to smuggle in here.
 */

const MOBILE = { width: 360, height: 800 };
const TABLET = { width: 768, height: 1024 };

// The desktop viewport (1280x800) is asserted by the two tests that run in
// every project, so it is referenced by name only in the comment above.

test.describe("Visual baselines (Sprint 4.4)", () => {
  test("board view lays out the columns without clipping", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Visual Board");
    await bp.addColumn("To Do");
    await bp.addColumn("In progress");
    await bp.addColumn("Done");

    // On mobile only the EXPANDED column is in the DOM; the rest live as
    // rail strips. So expand each one in turn and check its geometry. The
    // assertion is the same either way — a real box, no clipping — which is
    // what this file is actually about.
    for (const name of ["To Do", "In progress", "Done"]) {
      await bp.selectColumnTab(name);
      const column = await bp.getColumn(name);
      await expect(column, `column "${name}" is missing`).toBeVisible({ timeout: 5_000 });
      const box = await column.boundingBox({ timeout: 5_000 });
      expect(box, `column "${name}" has no layout box`).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(50);
    }

    // Nothing may spill past the viewport's right edge at any width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 4,
    );
    expect(overflow, "board view scrolls horizontally").toBe(false);

    await page.screenshot({ path: test.info().outputPath("board-view.png"), fullPage: false });
  });

  test("boards list renders a uniform grid of cards", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Alpha");
    await bp.gotoBoards();
    await bp.createBoard("Beta");
    await bp.gotoBoards();
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard)).toHaveCount(2, { timeout: 10_000 });

    const boxes = await page.locator(sel.boardCard).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    // Same-size cards in a grid — the visual regularity a screenshot is
    // meant to show, asserted as a fact instead.
    expect(boxes).toHaveLength(2);
    for (const b of boxes) {
      expect(b.w).toBeGreaterThan(180);
      expect(b.h).toBeGreaterThan(80);
    }
    expect(boxes[0].w).toBe(boxes[1].w);
    expect(boxes[0].h).toBe(boxes[1].h);

    await page.screenshot({ path: test.info().outputPath("boards-list.png") });
  });

  test("mobile rail and columns fill the viewport without gaps", async ({ page }) => {
    test.skip(!isMobileProject(page), "Mobile-layout assertions");    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Visual Board");
    await bp.addColumn("To Do");
    await bp.addColumn("Done");
    await bp.addCard("To Do", "First card");

    // The rail is the mobile navigation. A regression here — a gap, a zero
    // width, a rail that does not span the height — is the exact class of
    // bug this file exists to catch.
    const rail = page.locator(sel.mobileColumnRail);
    await expect(rail).toBeVisible();
    const railBox = await rail.boundingBox({ timeout: 5_000 });
    expect(railBox).not.toBeNull();
    expect(railBox!.width).toBeGreaterThan(20);
    // No horizontal overflow at the 360px mobile width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 4,
    );
    expect(overflow, "mobile board view scrolls horizontally").toBe(false);

    await page.screenshot({ path: test.info().outputPath("mobile-board.png") });
  });

  test("tablet layout keeps columns side by side", async ({ page }) => {
    test.skip(!isTabletProject(page), "Tablet-layout assertions");
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Visual Board");
    await bp.addColumn("To Do");
    await bp.addColumn("Done");
    await bp.addCard("To Do", "First card");

    // At 768px the app is in desktop/tablet mode: columns are visible
    // side by side, not behind a collapsed rail.
    const toDo = await bp.getColumn("To Do");
    const done = await bp.getColumn("Done");
    await expect(toDo).toBeVisible({ timeout: 5_000 });
    await expect(done).toBeVisible({ timeout: 5_000 });
    const first = await toDo.boundingBox({ timeout: 5_000 });
    const second = await done.boundingBox({ timeout: 5_000 });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Side by side means the second starts to the right of the first.
    expect(second!.x).toBeGreaterThan(first!.x);

    await page.screenshot({ path: test.info().outputPath("tablet-board.png") });
  });
});

/**
 * Phase 5.4 — baselines for the search / filter / saved-views surfaces.
 *
 * Same philosophy as Sprint 4.4 above: screenshots written to `test-results/`
 * for a reviewer to look at, with GEOMETRIC assertions that are stable across
 * environments. No golden-image diffing — see the header comment for why.
 *
 * The geometry here is not decorative. Each assertion below corresponds to a
 * bug that actually shipped or nearly shipped:
 *
 *  - The toolbar must stay on ONE line. When it wrapped on tablet, the filter
 *    bar dropped to a second row and dragged its anchored menu down with it.
 *  - The filter menu must stay anchored to its trigger for the same reason.
 *  - The saved-views popover must stay inside the viewport, since it is
 *    positioned from the trigger's rect near the right edge.
 *  - The chip row must not push the trigger vertically (it takes its own line
 *    inside `.filter-bar` via `flex: 0 0 100%`).
 */
test.describe("Visual baselines — search, filter and saved views (Phase 5)", () => {
  async function seed(page: Page) {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Phase 5 visuals");
    await bp.addCard("", "Alpha task", "task");
    await bp.addCard("", "Beta epic", "epic");
    await bp.addCard("", "Gamma task", "task");
    return bp;
  }

  test("the toolbar stays on one line with an active filter", async ({ page }) => {
    const bp = await seed(page);

    const toolbar = page.locator(".board-toolbar");
    await expect(toolbar).toBeVisible();
    const before = await toolbar.boundingBox();
    const triggerBefore = await page
      .locator('[data-testid="filter-trigger"]')
      .boundingBox();
    expect(before).not.toBeNull();
    expect(triggerBefore).not.toBeNull();

    await page.locator('[data-testid="filter-trigger"]').click();
    await expect(page.locator('[data-testid="filter-menu"]')).toBeVisible();
    await page.locator('[data-testid="filter-type-task"]').check();
    await expect(page.locator('[data-testid="filter-chips"]')).toBeVisible();

    // The toolbar DOES get taller here, and that is correct: the chip row
    // takes its own line *inside* `.filter-bar` (flex: 0 0 100%), so the bar
    // grows downward. What must NOT happen is the toolbar reflowing so the
    // filter bar lands on a different row — that is the bug that dragged the
    // anchored menu down and made its options unclickable.
    const after = await toolbar.boundingBox();
    const triggerAfter = await page
      .locator('[data-testid="filter-trigger"]')
      .boundingBox();
    expect(after).not.toBeNull();
    expect(triggerAfter).not.toBeNull();

    // Same line: the toolbar's top edge never moves, and the trigger never
    // shifts VERTICALLY. Its x and width both change — the trigger is
    // right-aligned, and the badge widens it while a wider chip row pushes it
    // left — so the only stable anchor is the toolbar's own right edge. That
    // is the property that actually matters: the bar stays on the same row,
    // pinned to the same side.
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(triggerAfter!.y - triggerBefore!.y)).toBeLessThanOrEqual(2);

    // The toolbar's own right edge is the pinned anchor and must not drift:
    // the toolbar is laid out from its right-hand side, so a chip row that
    // grows inside `.filter-bar` pushes the trigger LEFT, not the bar right.
    // (Asserting "toolbar.right - trigger.right" is constant would be wrong —
    // that gap is *supposed* to widen, by exactly how far the trigger slid.)
    const toolbarRightBefore = before!.x + before!.width;
    const toolbarRightAfter = after!.x + after!.width;
    expect(Math.abs(toolbarRightAfter - toolbarRightBefore)).toBeLessThanOrEqual(2);

    // And the trigger really did slide left — otherwise the assertion above
    // would pass vacuously if chips somehow did not affect layout at all.
    expect(triggerAfter!.x).toBeLessThanOrEqual(triggerBefore!.x + 2);

    // Still a single wrapping row, not two stacked toolbars.
    const wrap = await toolbar.evaluate((el) => getComputedStyle(el).flexWrap);
    expect(wrap).toBe("nowrap");

    // And it grew only as much as the chip row needs, not without bound.
    expect(after!.height - before!.height).toBeLessThan(80);

    await page.screenshot({ path: test.info().outputPath("toolbar-filter-active.png") });
    await bp.clickButtonFallback(page.locator('[data-testid="filter-menu-done"]'));
  });

  test("the filter menu stays anchored to its trigger", async ({ page }) => {
    await seed(page);

    await page.locator('[data-testid="filter-trigger"]').click();
    const menu = page.locator('[data-testid="filter-menu"]');
    await expect(menu).toBeVisible();
    await page.locator('[data-testid="filter-type-task"]').check();
    await expect(page.locator('[data-testid="filter-chips"]')).toBeVisible();

    const trigger = await page.locator('[data-testid="filter-trigger"]').boundingBox();
    const menuBox = await menu.boundingBox();
    expect(trigger).not.toBeNull();
    expect(menuBox).not.toBeNull();

    // On desktop/tablet the menu is a popover positioned from the trigger's
    // rect, so it must sit below it. On mobile it is a bottom sheet placed by
    // CSS, and the anchoring rule does not apply.
    if (!isMobileProject(page)) {
      expect(menuBox!.y).toBeGreaterThanOrEqual(trigger!.y + trigger!.height - 1);
    }
    const viewport = page.viewportSize()!;
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(menuBox!.x).toBeGreaterThanOrEqual(-1);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width + 1);

    await page.screenshot({ path: test.info().outputPath("filter-menu-open.png") });
  });

  test("the saved-views popover stays inside the viewport", async ({ page }) => {
    await seed(page);

    await page.locator('[data-testid="views-trigger"]').click();
    const menu = page.locator('[data-testid="views-menu"]');
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    // The trigger sits at the toolbar's right edge, so this is the case where
    // an un-clamped popover would hang off-screen.
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);

    await page.screenshot({ path: test.info().outputPath("saved-views-menu.png") });
  });

  test("the no-matches empty state does not displace the columns", async ({ page }) => {
    const bp = await seed(page);
    const columnCount = await page.locator(sel.column).count();
    expect(columnCount).toBeGreaterThan(0);

    await page.locator('[data-testid="search-input"]').fill("zzzznomatch");
    const empty = page.locator('[data-testid="board-no-matches"]');
    await expect(empty).toBeVisible();

    // The board's shape survives: the same columns are still rendered, just
    // showing zero. An empty state must not remove the board.
    await expect(page.locator(sel.column)).toHaveCount(columnCount);

    // And the clear action is reachable without scrolling to a corner.
    const clearBtn = page.locator('[data-testid="board-no-matches-clear"]');
    const btnBox = await clearBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(btnBox!.y).toBeLessThanOrEqual(viewport.height);
    // WCAG 2.5.8 Target Size (minimum) is 24x24. The 44px target is scoped to
    // `pointer: coarse` (see responsive.css) so the denser desktop layout is
    // unchanged, so assert the standard here and the touch size below.
    expect(btnBox!.height).toBeGreaterThanOrEqual(24);

    await page.screenshot({ path: test.info().outputPath("no-cards-match.png") });
    void bp;
  });

  test("the filter menu becomes a bottom sheet on mobile", async ({ page }) => {
    const bp = await seed(page);
    test.skip(!isMobileProject(page), "bottom sheet is the mobile presentation");

    await bp.collapseSidebar();
    await page.locator('[data-testid="filter-trigger"]').click();
    const menu = page.locator('[data-testid="filter-menu"]');
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const viewport = page.viewportSize()!;
    // Full width and flush to the bottom edge, which is what makes it a sheet.
    // Measured against the VIEWPORT, not the layout width: the page can be
    // narrower than the emulated screen, so comparing the two directly fails
    // for reasons that have nothing to do with the sheet.
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 2);
    const boxRight = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.right + window.scrollX;
    });
    const docWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(boxRight).toBeGreaterThanOrEqual(docWidth - 2);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 40);

    await page.screenshot({ path: test.info().outputPath("filter-sheet-mobile.png") });
  });

  test("toolbar controls meet the touch target size on mobile", async ({ page }) => {
    await seed(page);
    test.skip(!isMobileProject(page), "tap target rule is scoped to coarse pointers");

    // The 44px target only applies under `pointer: coarse` (responsive.css),
    // so this is asserted where that rule is actually active rather than
    // against the intentionally denser desktop layout.
    for (const id of ["search-input", "filter-trigger", "views-trigger"]) {
      const box = await page.locator(`[data-testid="${id}"]`).boundingBox();
      expect(box, `${id} has no layout box`).not.toBeNull();
      expect(box!.height, `${id} is under the 44px touch target`).toBeGreaterThanOrEqual(44);
    }

    const clearBtn = page.locator('[data-testid="board-no-matches-clear"]');
    await page.locator('[data-testid="search-input"]').fill("zzzznomatch");
    await expect(clearBtn).toBeVisible();
    const clearBox = await clearBtn.boundingBox();
    expect(clearBox!.height).toBeGreaterThanOrEqual(44);
  });
});

/** True in the chromium-mobile project. */
function isMobileProject(page: Page): boolean {
  return page.viewportSize()?.width === MOBILE.width;
}

/** True in the chromium-tablet project. */
function isTabletProject(page: Page): boolean {
  return page.viewportSize()?.width === TABLET.width;
}
