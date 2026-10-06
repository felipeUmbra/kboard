import { test, expect, type Locator } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/**
 * Sprint 2 (bypass blocks, alt text, language) and Sprint 3 (keyboard drag
 * instructions, focus visibility, touch target size).
 *
 * Sprint 2 shipped no new user flow, so there is nothing here to regress
 * beyond the skip link's own behaviour. Sprint 3 added a visible disclosure
 * and changed tap-target metrics, both of which are user-facing.
 *
 * `measureContrast` is duplicated from a11y-contrast.spec.ts rather than
 * shared: each spec is self-contained, and a shared helper that grew a
 * second concern would blur that separation.
 */

const TAP_TARGET = 44;
const NON_TEXT = 3;

/** Measures the rendered contrast of a Locator, walking translucent ancestors. */
async function measureContrast(target: Locator) {
  await target.first().waitFor({ state: "visible", timeout: 5_000 });
  return target.first().evaluate((el) => {
    const toRgb = (str: string): [number, number, number, number] => {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const p = m[1].split(",").map((s) => parseFloat(s));
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const lum = (c: [number, number, number]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };

    let acc: [number, number, number, number] = [0, 0, 0, 0];
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      const c = toRgb(getComputedStyle(node).backgroundColor);
      const a = c[3];
      if (a > 0) {
        acc = [
          (c[0] * a + acc[0] * acc[3] * (1 - a)) / (a + acc[3] * (1 - a)),
          (c[1] * a + acc[1] * acc[3] * (1 - a)) / (a + acc[3] * (1 - a)),
          (c[2] * a + acc[2] * acc[3] * (1 - a)) / (a + acc[3] * (1 - a)),
          a + acc[3] * (1 - a),
        ];
      }
      if (acc[3] >= 0.999) break;
      node = node.parentElement;
    }
    if (acc[3] < 0.999) acc = [255, 255, 255, 1];

    const cs = getComputedStyle(el as HTMLElement);
    const fg = toRgb(cs.color);
    const l1 = lum([fg[0], fg[1], fg[2]]);
    const l2 = lum([acc[0], acc[1], acc[2]]);
    return {
      fg: cs.color,
      bg: `rgb(${acc[0].toFixed(0)}, ${acc[1].toFixed(0)}, ${acc[2].toFixed(0)})`,
      ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
      fontSize: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
    };
  });
}

async function expectAAContrast(target: Locator, label: string) {
  const m = await measureContrast(target);
  const isLarge = m.fontSize >= 24 || (m.fontSize >= 18.66 && m.fontWeight >= 700);
  const threshold = isLarge ? NON_TEXT : 4.5;
  expect(
    m.ratio,
    `${label}: ${m.fg} on ${m.bg} = ${m.ratio.toFixed(2)}:1 (needs ${threshold}:1)`,
  ).toBeGreaterThanOrEqual(threshold);
}

test.describe("Sprint 2 — bypass blocks (WCAG 2.4.1)", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Skip Link Board");
  });

  test("the skip link is the first focusable element", async ({ page }) => {
    // Asserted structurally rather than by pressing Tab. createBoard() leaves
    // focus mid-document, and blur() does not reset Chromium's sequential
    // focus navigation starting point, so a Tab here would continue from
    // wherever the helper left it and the result would say nothing about
    // the app. DOM order is the property that actually determines where a
    // user landing on the page starts.
    const order = await page.evaluate(() => {
      const sel =
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
      const all = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      const first = all[0];
      return {
        firstTag: first?.tagName,
        firstClass: first?.className ?? "",
        firstText: first?.textContent?.trim() ?? "",
        index: all.findIndex((e) => e.classList.contains("skip-link")),
        total: all.length,
      };
    });
    expect(order.index, "skip link should be focusable").toBe(0);
    expect(order.firstTag).toBe("A");
    expect(order.firstClass).toContain("skip-link");
    expect(order.firstText).toBe("Skip to main content");
    expect(order.total).toBeGreaterThan(1);
  });

  test("a keyboard user reaches the skip link with Tab on a fresh load", async ({ page }) => {
    // Complements the structural test above with real key input. Done on a
    // fresh page load so focus genuinely starts at the document root.
    await page.goto(page.url());
    await page.waitForSelector(".app-shell", { timeout: 15_000 });
    await page.keyboard.press("Tab");
    const cls = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(cls, "first Tab did not land on the skip link").toContain("skip-link");
  });

  test("the skip link is visually hidden until focused, then visible", async ({ page }) => {
    const link = page.locator(".skip-link");
    await expect(link).toHaveCount(1);

    // Clipped to 1x1, not display:none — it must stay in the tab order and
    // in the accessibility tree. (A negative transform would hide it from
    // sequential focus navigation entirely; see the CSS comment.)
    const hidden = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        clipPath: cs.clipPath,
        display: cs.display,
        visibility: cs.visibility,
      };
    });
    expect(hidden.display).not.toBe("none");
    expect(hidden.visibility).not.toBe("hidden");
    expect(Math.max(hidden.w, hidden.h)).toBeLessThanOrEqual(2);

    await link.focus();
    const shown = await link.boundingBox();
    expect(shown, "focused skip link should have a real box").not.toBeNull();
    expect(shown!.width).toBeGreaterThan(40);
    expect(shown!.height).toBeGreaterThanOrEqual(TAP_TARGET - 1);
    await expect(link).toBeInViewport();
    await expectAAContrast(link, "skip link (focused)");
  });

  test("activating the skip link moves focus to the main region", async ({ page }) => {
    // Real key input: focus the link, then press Enter like a user would.
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    expect(id, "focus should land on the main landmark").toBe("main-content");
  });

  test("the main region is a focusable landmark", async ({ page }) => {
    const main = page.locator("main#main-content");
    await expect(main).toHaveCount(1);
    // tabIndex=-1 is what lets the skip link move focus here.
    const tabIndex = await main.getAttribute("tabindex");
    expect(tabIndex).toBe("-1");
  });
});

test.describe("Sprint 2 — language and alt text (WCAG 3.1.1 / 1.1.1)", () => {
  test("the document declares a language", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBeTruthy();
    expect(lang).toMatch(/^[a-z]{2}(-[A-Za-z0-9]+)*$/);
  });

  test("every image has an alt attribute", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Alt Text Board");
    await bp.addCard("To do", "Alt card");
    await bp.openCard("Alt card");

    const missing = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => img.getAttribute("alt") === null)
        .map((img) => img.getAttribute("src") ?? "(no src)"),
    );
    expect(missing, `images without alt: ${missing.join(", ")}`).toEqual([]);
  });
});

test.describe("Sprint 3.1 — drag-and-drop keyboard instructions", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const width = page.viewportSize()?.width ?? 1280;
    if (width < 1024 && testInfo.title !== "a card can be moved with the keyboard alone") {
      test.skip(
        true,
        "DnD keyboard shortcuts disclosure is hidden on touch/mobile/tablet viewports (< 1024px)",
      );
    }
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("DnD Help Board");
    await bp.addCard("To do", "Draggable card");
  });

  test("the shortcut disclosure exists and is collapsed by default", async ({ page }) => {
    const help = page.locator(".dnd-help");
    await expect(help).toHaveCount(1);
    await expect(help).not.toHaveAttribute("open", /.*/);
  });

  test("the summary is keyboard operable and toggles the list", async ({ page }) => {
    const help = page.locator(".dnd-help");
    const summary = page.locator(".dnd-help__summary");
    await expect(summary).toBeVisible();

    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(help).toHaveAttribute("open", "");

    await page.keyboard.press("Enter");
    await expect(help).not.toHaveAttribute("open", /.*/);
  });

  test("the instructions name the keys dnd-kit actually binds", async ({ page }) => {
    await page.locator(".dnd-help__summary").click();
    const text = await page.locator(".dnd-help").innerText();
    for (const key of ["Space", "Arrow keys", "Escape"]) {
      expect(text, `missing "${key}" in the shortcut list`).toContain(key);
    }
  });

  test("the instructions are readable when expanded", async ({ page }) => {
    await page.locator(".dnd-help__summary").click();
    await expectAAContrast(
      page.locator(".dnd-help__action").first(),
      "dnd help action",
    );
    await expectAAContrast(page.locator(".dnd-help kbd").first(), "dnd help kbd");
  });

  test("a card can be moved with the keyboard alone", async ({ page, isMobile }) => {
    // 2.1.1: the feature the instructions describe must actually work.
    //
    // Bug #18 made this assertion vacuous. It pressed Space, pressed Arrow
    // Right, pressed Space again, then only checked the card count was still
    // 1 — which also holds when Space opened the editor and nothing was ever
    // dragged, because the card never left the board. It proved the keyboard
    // did not crash, not that the card moved.
    //
    // These assertions check the three things that actually matter: Space
    // lifts the card, the live region announces it, and the card ends up
    // somewhere the user did not leave it.
    //
    // Two layout facts shape the last assertion (both measured, see the
    // probe in this file's history):
    //   - The move is asserted as "a DIFFERENT column", not "column index 1".
    //     `.kanban-column` has no data-column-id, and sortableKeyboardCoordinates
    //     moves to the nearest droppable, so an index assumption is wrong.
    //   - On MOBILE the board renders exactly ONE column at a time (the rail
    //     expands a single column), so there is no second column for ArrowRight
    //     to reach and a cross-column move is impossible by construction.
    //     Tablet renders all three and the move works there. Skipping mobile
    //     here is honest about that limitation; the MOBILE keyboard-drag path
    //     is still covered by the pickup assertions below, which run
    //     everywhere and are what bug #18 actually broke.
    const card = page.locator(".kanban-card").first();

    // Which column holds the card before we start? Resolve by the column
    // that CONTAINS the card, then read its title.
    const titleOfColumnContaining = async (locator: Locator) =>
      (
        await page
          .locator(sel.column)
          .filter({ has: locator })
          .locator(sel.columnTitle)
          .innerText()
      )
        .replace(/\s*\(\d+\)\s*$/, "")
        .trim();

    const originTitle = await titleOfColumnContaining(card);
    await card.focus();

    // Pick up. The card must report the drag state rather than opening the
    // editor — the defect was Space falling through to onOpen().
    await page.keyboard.press("Space");
    await expect(page.locator(sel.cardTitleInput)).toHaveCount(0);
    await expect(card).toHaveAttribute("aria-pressed", "true");
    // KanbanDndContext's own live region announces the pickup. Target it by
    // class, not by `[aria-live]` positionally — several polite regions exist
    // (search, toasts, install prompt) and `.first()` lands on an empty one.
    await expect(page.locator(".sr-only[aria-live='polite']").first()).toContainText(
      /picked up/i,
    );

    // Steer right, then drop.
    //
    // dnd-kit's KeyboardSensor scrolls the board with `behavior: 'smooth'`
    // when the destination lies outside the visible area (see
    // `KeyboardSensor.handleKeyDown` -> `scrollContainer.scrollTo`). On
    // tablet the board is ~1252px wide inside a 488px viewport, so pressing
    // ArrowRight starts a 300px smooth scroll; dropping while that animation
    // is still in flight resolves the collision against the pre-scroll
    // layout and the card lands back where it started. Desktop's board fits
    // its viewport, so it never scrolls — which is why the same single press
    // worked on desktop and appeared "systematic" on tablet.
    //
    // Wait for the scroll position to settle instead of guessing a delay, so
    // the test is correct on any viewport rather than tuned to today's one.
    //
    // `.kanban-scroll` exists only on the desktop/tablet board; the mobile
    // layout renders `.kanban-mobile` with no horizontal scroller, so there is
    // nothing to wait for (and nothing to scroll into view either).
    const scroller = page.locator(".kanban-scroll");
    if (await scroller.count()) {
      const settled = () =>
        scroller.evaluate(async (el) => {
          // Two consecutive identical scrollLeft values => animation finished.
          const first = el.scrollLeft;
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
          return el.scrollLeft === first;
        });
      await expect.poll(settled, { timeout: 5_000 }).toBe(true);
      await page.keyboard.press("ArrowRight");
      await expect.poll(settled, { timeout: 5_000 }).toBe(true);
    } else {
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("Space");

    // Dropped: the drag state is released and the card survived.
    await expect(page.locator(".kanban-card")).toHaveCount(1);
    await expect(page.locator(".kanban-card").first()).not.toHaveAttribute(
      "aria-pressed",
      /.*/,
    );

    // Cross-column movement is only meaningful where a second column exists.
    // Tablet and desktop render all columns; mobile renders one.
    if (isMobile) return;

    // The card must now sit in a DIFFERENT column.
    const destinationTitle = await titleOfColumnContaining(
      page.locator(".kanban-card").first(),
    );
    expect(
      destinationTitle,
      `the card stayed in "${originTitle}"`,
    ).not.toBe(originTitle);
  });
});

test.describe("Sprint 3.2 / 3.3 — focus visibility and touch targets", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Targets Board");
    await bp.addCard("To do", "Target card");
  });

  test("focused buttons render a visible focus indicator", async ({ page }) => {
    const btn = page.locator(sel.deleteBoardButton);
    await btn.focus();
    const ring = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    });
    const hasOutline = ring.outlineWidth !== "0px";
    const hasShadow = ring.boxShadow !== "none" && ring.boxShadow !== "";
    expect(
      hasOutline || hasShadow,
      `no focus indicator: ${JSON.stringify(ring)}`,
    ).toBe(true);
  });

  test("primary controls meet the 44px touch target", async ({ page, isMobile }) => {
    // The Sprint 3.3 fixes are scoped to `@media (pointer: coarse)`, which
    // only touch devices match. Asserting 44px on a mouse-driven desktop run
    // would fail by design — the dense desktop layout is intentional there.
    test.skip(!isMobile, "44px targets only apply to touch pointers");

    const controls = [
      [".dnd-help__summary", "keyboard help disclosure"],
      [sel.deleteBoardButton, "delete board"],
      [".btn--primary", "primary button"],
    ] as const;

    for (const [selector, label] of controls) {
      const loc = page.locator(selector).first();
      if ((await loc.count()) === 0) continue;
      const box = await loc.boundingBox();
      if (!box) continue;
      expect(
        Math.min(box.width, box.height),
        `${label} (${selector}) is ${box.width}x${box.height}, ` +
          `under the ${TAP_TARGET}px target`,
      ).toBeGreaterThanOrEqual(TAP_TARGET - 1);
    }
  });

  test("the card editor close button is large enough to tap", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "44px targets only apply to touch pointers");
    const bp = new BoardPage(page);
    await bp.openCard("Target card");
    const close = page.locator('button[aria-label="Close"]');
    await expect(close).toBeVisible();
    const box = await close.boundingBox();
    expect(box).not.toBeNull();
    expect(
      Math.min(box!.width, box!.height),
      `modal close is ${box!.width}x${box!.height}`,
    ).toBeGreaterThanOrEqual(TAP_TARGET - 1);
  });
});
