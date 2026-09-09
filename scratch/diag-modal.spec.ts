import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../tests/helpers/login";
import { BoardPage } from "../tests/helpers/boardPage";

/**
 * Temporary diagnostic — inspect the create-board modal geometry on mobile.
 */
test("DIAG modal geometry", async ({ page }) => {
  await installFakesOnPage(page);
  const bp = new BoardPage(page);
  await bp.login();
  await page.locator('button.btn--primary:has-text("New board")')
    .or(page.locator(".empty-state button.btn--primary"))
    .first()
    .click();
  await page.waitForSelector('div[role="dialog"]', { timeout: 5_000 });
  await page.waitForTimeout(500);

  const geo = await page.evaluate(() => {
    const g = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = (el as HTMLElement).getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom };
    };
    return {
      inner: { w: window.innerWidth, h: window.innerHeight },
      modal: g(".modal"),
      body: g(".modal__body"),
      footer: g(".modal__footer"),
      createBtn: g('button:has-text("Create")'),
      backdrop: g(".modal-backdrop"),
      bodyOverflow: getComputedStyle(document.querySelector(".modal__body")!).overflowY,
    };
  });
  console.log("GEO", JSON.stringify(geo, null, 2));

  // Hit-test at the create button center
  const hit = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Create",
    );
    if (!btn) return "no-create-btn";
    const r = btn.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const el = document.elementFromPoint(x, y);
    const chain: string[] = [];
    let cur: Element | null = el;
    while (cur) {
      chain.push(`${cur.tagName}.${(cur as HTMLElement).className}`);
      cur = cur.parentElement;
    }
    return { x, y, chain };
  });
  console.log("HIT", JSON.stringify(hit, null, 2));
  expect(true).toBe(true);
});