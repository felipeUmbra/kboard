/**
 * Bug #17 — mobile TOUCH drag is cancelled when moving a card to another column.
 *
 * The QA agent reported that a real touch drag toward the "Done" target in the
 * mobile "Move to column" overlay emitted `pointercancel:touch`, leaving the
 * card in "To do" and "Done" empty — and noted that "the existing mobile E2E
 * drag checks use mouse input and pass, so they do not cover this real touch
 * path."
 *
 * That note is the whole point of this file. `dragCardToMobileColumn` in the
 * page object drives `page.mouse`, which dispatches MOUSE events even on a
 * `hasTouch` device. dnd-kit selects the TouchSensor on a real touch point and
 * behaves completely differently, so those green tests could never have
 * caught this. Every gesture below goes through CDP's
 * `Input.dispatchTouchEvent`, so the page receives genuine `TouchEvent`s and
 * the same code path a phone exercises is the one under test.
 *
 * Two reproduction conditions both had to be present, and both are load
 * bearing (verified by re-running with each one removed):
 *
 *   1. The card list must be SCROLLABLE. With a single card there is
 *      nothing to pan, the browser never claims the gesture, and the drag
 *      passes even against the buggy `touch-action: pan-y`.
 *   2. The gesture must begin with a vertical/diagonal component. Chrome
 *      resolves the permitted scroll axis from the FIRST touchmove, so a
 *      purely horizontal opening move survives even with `pan-y`, while an
 *      up-left diagonal or a straight-up move is cancelled. Moving to the
 *      overlay requires moving up and left, so this is the natural gesture.
 *
 * chromium-mobile only: needs `hasTouch` emulation.
 */

import { test, expect, type Page } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/** Enough cards that the column's card list genuinely overflows. */
const CARD_COUNT = 12;

test.describe("Bug #17 — touch drag to another column (mobile)", () => {
  test.skip(
    ({ isMobile }) => !isMobile,
    "requires touch emulation; runs on chromium-mobile only",
  );

  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Touch DnD");
    // A scrollable list is required to reproduce the bug (see header note).
    for (let i = 0; i < CARD_COUNT; i++) {
      await bp.addCard("To do", `Card ${i}`, "task");
    }
  });

  /**
   * A real touch drag via CDP. Starts with a DIAGONAL up-left move, which
   * is what a user does to reach the left-edge column overlay and is the
   * shape that reproduced the reported `pointercancel`.
   *
   * Records every `pointercancel` the page sees so the test can assert the
   * browser never steals the gesture.
   */
  async function touchDragToMobileColumn(
    page: Page,
    cardTitle: string,
    toColumnName: string,
  ) {
    await page.evaluate(() => {
      (window as unknown as { __cancels: string[] }).__cancels = [];
      window.addEventListener("pointercancel", (e) => {
        (window as unknown as { __cancels: string[] }).__cancels.push(
          (e as PointerEvent).pointerType || "unknown",
        );
      });
    });

    const list = page.locator(".kanban-column__cards").first();
    await list.evaluate((el) => (el.scrollTop = 0));

    const card = page.locator(sel.card).filter({ hasText: cardTitle }).first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error("Could not find card bounding box");

    const cdp = await page.context().newCDPSession(page);
    const sx = Math.round(box.x + box.width / 2);
    const sy = Math.round(box.y + box.height / 2);

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: sx, y: sy, id: 1 }],
    });

    // Hold past dnd-kit's TouchSensor activation constraint (delay: 250ms)
    // so the drag lifts and the column overlay mounts.
    await page.waitForTimeout(400);

    // Opening move: up and to the left, in small steps. The vertical
    // component is the part that used to be claimed as a scroll.
    let x = sx;
    let y = sy;
    for (let i = 1; i <= 6; i++) {
      x -= 5;
      y -= 7;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y, id: 1 }],
      });
      await page.waitForTimeout(16);
    }

    const overlay = page.locator(".mobile-move-targets");
    await overlay.waitFor({ state: "visible", timeout: 3_000 });
    await page.waitForTimeout(250); // let the opacity animation settle

    const target = overlay
      .locator(".mobile-move-target")
      .filter({ hasText: new RegExp(toColumnName, "i") })
      .first();
    const targetBox = await target.boundingBox();
    if (!targetBox) throw new Error("Could not find mobile move target bounding box");
    const destX = Math.round(targetBox.x + targetBox.width / 2);
    const destY = Math.round(targetBox.y + targetBox.height / 2);

    // Glide onto the target. Many small steps keeps this a realistic drag
    // rather than an instantaneous teleport.
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: Math.round(x + (destX - x) * t),
            y: Math.round(y + (destY - y) * t),
            id: 1,
          },
        ],
      });
      await page.waitForTimeout(16);
      if ((await target.getAttribute("data-over")) === "true") break;
    }

    // Collision detection must actually resolve to the intended target
    // before we release, otherwise the drop would be a silent no-op.
    await expect
      .poll(async () => await target.getAttribute("data-over"), {
        timeout: 3_000,
      })
      .toBe("true");

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(200);

    return page.evaluate(
      () => (window as unknown as { __cancels: string[] }).__cancels,
    );
  }

  test("a touch drag moves the card to the target column", async ({ page }) => {
    const bp = new BoardPage(page);
    const moved = "Card 11";

    const cancels = await touchDragToMobileColumn(page, moved, "Done");

    expect(
      cancels,
      "the browser cancelled the touch gesture (the #17 defect)",
    ).toEqual([]);

    // The card must have left "To do"…
    await bp.selectColumnTab("To do");
    await expect(
      page.locator(sel.column).filter({ hasText: "To do" }).locator(sel.card).filter({
        hasText: moved,
      }),
    ).toHaveCount(0);

    // …and arrived in "Done".
    await bp.selectColumnTab("Done");
    await expect(
      page
        .locator(sel.column)
        .filter({ hasText: "Done" })
        .locator(sel.card)
        .filter({ hasText: moved }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("a card must not advertise that the browser may pan it", async ({ page }) => {
    // The root cause. `touch-action: pan-y` told the browser it could treat
    // a vertical/diagonal touch as a scroll, which cancels the drag. Assert
    // the contract directly so a future "make cards scrollable again"
    // change cannot silently reintroduce the bug.
    const card = page.locator(sel.card).first();
    await expect(card).toBeVisible();

    const touchAction = await card.evaluate(
      (el) => getComputedStyle(el).touchAction,
    );
    expect(touchAction).not.toBe("pan-y");
    expect(["none", "manipulation"]).toContain(touchAction);
  });
});