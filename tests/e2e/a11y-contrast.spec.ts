import { test, expect, type Locator } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";

/**
 * Sprint 1 — WCAG AA contrast regression guard.
 *
 * The unit tests and `npm run a11y:contrast` verify the *token values*.
 * This suite verifies what actually reaches the screen: it reads
 * `getComputedStyle` from the live DOM and computes the real rendered
 * contrast. That catches things static token checks cannot, e.g. a token
 * that is fine in isolation but rendered on an unexpected background, or a
 * hardcoded hex that bypassed the token system.
 *
 * Targets are passed as Playwright Locators (not CSS strings) so Playwright's
 * selector engine can resolve them — `document.querySelector` does not
 * understand Playwright-only syntax like `:has-text()`.
 *
 * Colour maths is injected into the page because it must run against the
 * browser's own resolved colours.
 */

const AA = 4.5;
const NON_TEXT = 3;

interface Measured {
  fg: string;
  bg: string;
  ratio: number;
  fontSize: number;
  fontWeight: number;
}

/** Computes the rendered contrast of a Locator's element. */
async function measureContrast(target: Locator): Promise<Measured> {
  await target.first().waitFor({ state: "visible", timeout: 5_000 });
  return target.first().evaluate((el) => {
    const toRgb = (str: string): [number, number, number, number] => {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    // Walk up compositing translucent backgrounds until we hit an opaque one.
    let node: HTMLElement | null = el as HTMLElement;
    let acc: [number, number, number, number] = [0, 0, 0, 0];
    while (node) {
      const c = toRgb(getComputedStyle(node).backgroundColor);
      const a = c[3] + acc[3] * (1 - c[3]);
      if (a > 0) {
        acc = [
          (c[0] * c[3] + acc[0] * acc[3] * (1 - c[3])) / a,
          (c[1] * c[3] + acc[1] * acc[3] * (1 - c[3])) / a,
          (c[2] * c[3] + acc[2] * acc[3] * (1 - c[3])) / a,
          a,
        ];
      }
      if (a >= 0.999) break;
      node = node.parentElement;
    }
    if (acc[3] < 0.999) {
      acc = [255, 255, 255, 1]; // fall back to the page canvas
    }

    const cs = getComputedStyle(el as HTMLElement);
    const fg = toRgb(cs.color);
    const l1 = lum([fg[0], fg[1], fg[2]]);
    const l2 = lum([acc[0], acc[1], acc[2]]);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return {
      fg: cs.color,
      bg: `rgb(${acc[0].toFixed(0)}, ${acc[1].toFixed(0)}, ${acc[2].toFixed(0)})`,
      ratio,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
    };
  });
}

/** Asserts a Locator's rendered text clears the AA threshold. */
async function expectAAContrast(target: Locator, label: string) {
  const m = await measureContrast(target);
  // WCAG allows 3:1 for large text (>=24px, or >=18.66px when bold).
  const isLarge = m.fontSize >= 24 || (m.fontSize >= 18.66 && m.fontWeight >= 700);
  const threshold = isLarge ? NON_TEXT : AA;
  expect(
    m.ratio,
    `${label}: ${m.fg} on ${m.bg} = ${m.ratio.toFixed(2)}:1 ` +
      `(${m.fontSize}px/${m.fontWeight}${isLarge ? ", large" : ""}, needs ${threshold}:1)`,
  ).toBeGreaterThanOrEqual(threshold);
}

test.describe("WCAG AA contrast (computed styles)", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Contrast Board");
    await bp.addCard("To do", "Contrast card");
  });

  test("board header text clears AA", async ({ page }) => {
    await expectAAContrast(page.locator(sel.boardTitle), "board title (h1)");
    await expectAAContrast(page.locator(sel.columnTitle), "column title (h2)");
    await expectAAContrast(page.locator(".kanban-card__title"), "card title");
  });

  test("card editor text clears AA", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Contrast card");
    await expect(page.locator(sel.cardTitleInput)).toBeVisible();
    await expectAAContrast(
      page.locator(sel.cardTitleInput),
      "card title input",
    );
    await expectAAContrast(page.locator(".modal__title"), "modal title");
    await bp.closeCardEditor();
  });

  test("type chip text clears AA against its own tinted background", async ({ page }) => {
    // TypeChip renders CARD_TYPE_META[type].color on .softColor.
    await expectAAContrast(page.locator(".type-chip"), "type chip");
  });

  test("destructive action text clears AA", async ({ page }) => {
    // Delete buttons were the main user of --color-danger as text.
    await expectAAContrast(
      page.locator(sel.deleteBoardButton),
      "delete board button",
    );
  });
});

test.describe("WCAG AA contrast (dark theme)", () => {
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Dark Contrast Board");
    await bp.addCard("To do", "Dark contrast card");
  });

  test("board text clears AA in dark mode", async ({ page }) => {
    await expectAAContrast(page.locator(sel.boardTitle), "board title (dark)");
    await expectAAContrast(page.locator(sel.columnTitle), "column title (dark)");
    await expectAAContrast(
      page.locator(".kanban-card__title"),
      "card title (dark)",
    );
  });

  test("delete action clears AA in dark mode", async ({ page }) => {
    // --color-danger was #eb5a46 in dark: 4.37:1, just under the threshold.
    await expectAAContrast(
      page.locator(sel.deleteBoardButton),
      "delete board button (dark)",
    );
  });
});
