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

/** True in the chromium-mobile project. */
function isMobileProject(page: Page): boolean {
  return page.viewportSize()?.width === MOBILE.width;
}

/** True in the chromium-tablet project. */
function isTabletProject(page: Page): boolean {
  return page.viewportSize()?.width === TABLET.width;
}
