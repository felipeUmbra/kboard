import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/**
 * Sprint 4.6 — card titles must never be vertically clipped.
 *
 * REGRESSION. `.kanban-column__cards` is a column flex container, so its
 * children defaulted to `flex-shrink: 1`. `.kanban-column` is
 * `max-height: 100%` of a fixed-height board area, so once a column held
 * more cards than fit, the browser COMPRESSED the cards to their
 * `min-height` (var(--tap-target), 44px) instead of overflowing.
 *
 * Because a card's children are laid out top-down (type chip, labels,
 * title, ...), a 44px card pushed the title below its own box. Measured
 * with 9 cards of 38-char titles: cardH 44, title at topOff 31 needing
 * 21px — 52px of content in a 44px box, entirely outside the visible
 * area. `scrollHeight === clientHeight` on the list, so it compressed
 * rather than scrolled, which is why nothing looked like it overflowed.
 *
 * The fix is `flex-shrink: 0` on the cards, so the list scrolls instead
 * of compressing. These tests assert the geometry directly rather than
 * a screenshot, so a regression names the failing card.
 */
test.describe("Card title visibility (vertical squash regression)", () => {
  const uniqueId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  /** Geometry of every card's title relative to the card's own box. */
  async function cardGeometry(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(".kanban-card"),
      );
      return cards.map((c) => {
        const t = c.querySelector<HTMLElement>(".kanban-card__title");
        const cardBox = c.getBoundingClientRect();
        const tBox = t?.getBoundingClientRect();
        return {
          title: t?.textContent ?? "",
          cardH: Math.round(cardBox.height),
          titleTop: tBox ? Math.round(tBox.top - cardBox.top) : null,
          titleBottom: tBox ? Math.round(tBox.bottom - cardBox.top) : null,
          // A title taller than its own box is being clipped/overflowing.
          titleScrollH: t?.scrollHeight ?? null,
          titleClientH: t?.clientHeight ?? null,
        };
      });
    });
  }

  test("9 cards of 50-char titles in one column keep every title fully visible", async ({
    page,
  }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Squash ${uniqueId()}`);
    await bp.addColumn("To Do");

    // More cards than fit in the column, each with the longest title the
    // product guarantees visible (50 chars).
    const titles: string[] = [];
    for (let i = 0; i < 9; i++) {
      const base = `Card ${i} `;
      const title = (base + "x".repeat(50 - base.length)).slice(0, 50);
      titles.push(title);
      await bp.addCard("To Do", title);
    }

    const geo = await cardGeometry(page);
    expect(geo).toHaveLength(9);

    for (const g of geo) {
      // The whole title must sit INSIDE the card's own box.
      expect(
        g.titleBottom,
        `title "${g.title}" overflows its ${g.cardH}px card`,
      ).toBeLessThanOrEqual(g.cardH);
      // And must not be internally clipped (no hidden overflow).
      expect(
        g.titleScrollH,
        `title "${g.title}" is internally clipped`,
      ).toBeLessThanOrEqual((g.titleClientH ?? 0) + 1);
      // A card must be taller than the 44px tap-target floor, otherwise
      // it is being compressed by the flex container again.
      expect(g.cardH, `card "${g.title}" squashed to ${g.cardH}px`).toBeGreaterThan(44);
    }

    // The list must SCROLL, not compress.
    const overflow = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".kanban-column__cards");
      return el ? el.scrollHeight > el.clientHeight : false;
    });
    expect(overflow, "column list should scroll rather than compress cards").toBe(
      true,
    );
  });

  test("a single 50-char title is fully visible", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Squash one ${uniqueId()}`);
    await bp.addColumn("To Do");

    const title = "y".repeat(50);
    await bp.addCard("To Do", title);

    const geo = await cardGeometry(page);
    expect(geo).toHaveLength(1);
    expect(geo[0].titleBottom).toBeLessThanOrEqual(geo[0].cardH);
    expect(geo[0].cardH).toBeGreaterThan(44);
  });

  test("card title element is present and carries the full text", async ({
    page,
  }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Squash text ${uniqueId()}`);
    await bp.addColumn("To Do");

    const title = "z".repeat(50);
    await bp.addCard("To Do", title);

    const el = page.locator(sel.cardTitle).filter({ hasText: title });
    await expect(el).toHaveCount(1);
    await expect(el).toHaveText(title);
  });
});
