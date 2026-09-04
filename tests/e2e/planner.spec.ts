// Planner view end-to-end checks.

import { test, expect, type Page } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";

/** Compute today/yesterday/tomorrow/+2 in the page's local TZ. */
async function isoDates(page: Page) {
  return page.evaluate(() => {
    function fmt(d: Date) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    const t = new Date();
    const tom = new Date(t);
    tom.setDate(t.getDate() + 1);
    const yes = new Date(t);
    yes.setDate(t.getDate() - 1);
    const p2 = new Date(t);
    p2.setDate(t.getDate() + 2);
    return { today: fmt(t), tomorrow: fmt(tom), yesterday: fmt(yes), plus2: fmt(p2) };
  });
}

/**
 * Bring up the app, sign in, create a board with 5 cards, and use
 * the test-only window hook to seed dates on them.
 */
async function bootWithCards(page: Page) {
  await installFakesOnPage(page);
  await page.goto("/");
  await page.getByRole("button", { name: /sign in with google/i }).click();
  await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible({
    timeout: 15_000,
  });

  // Create a board — mirrors BoardPage.createBoard() from helpers.
  const newBoardBtn = page
    .locator('button.btn--primary:has-text("New board")')
    .or(page.locator(".empty-state button.btn--primary"));
  await newBoardBtn.first().click();
  await page.waitForSelector('div[role="dialog"]', { timeout: 5_000 });
  await page.fill('input#b-name', "Planner test board");
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForSelector('h1[title="Click to rename"]', { timeout: 10_000 });

  // Add 5 cards to the first column.
  for (const title of [
    "Card today",
    "Card tomorrow",
    "Card yesterday",
    "Card start only",
    "Card no dates",
  ]) {
    await page.locator(".kanban-column__add-btn").first().click();
    const titleInput = page.getByRole("textbox").last();
    await titleInput.fill(title);
    await titleInput.press("Enter");
  }

  const dates = await isoDates(page);

  // Set each card's start/due date via the test-only window hook.
  // Read each card's id from the rendered DOM since ids are crypto-random.
  const cardIds = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".kanban-card"),
    );
    return cards.map((c) => ({
      id: c.getAttribute("data-card-id") || "",
      title: (c.querySelector(".kanban-card__title")?.textContent || "").trim(),
    }));
  });
  function idFor(title: string): string {
    const c = cardIds.find((x) => x.title === title);
    if (!c) throw new Error(`card "${title}" not found in DOM`);
    return c.id;
  }
  async function setDates(
    title: string,
    opts: { startDate?: string; dueDate?: string },
  ) {
    const cardId = idFor(title);
    await page.evaluate(
      (args: {
        cardId: string;
        startDate: string | null;
        dueDate: string | null;
      }) => {
        const w = window as unknown as {
          __kboard_setCardDates?: (
            id: string,
            d: { startDate?: string | null; dueDate?: string | null },
          ) => void;
        };
        if (!w.__kboard_setCardDates) {
          throw new Error("__kboard_setCardDates not on window");
        }
        w.__kboard_setCardDates(args.cardId, {
          startDate: args.startDate,
          dueDate: args.dueDate,
        });
      },
      {
        cardId,
        startDate: opts.startDate ?? null,
        dueDate: opts.dueDate ?? null,
      },
    );
  }

  await setDates("Card today", { dueDate: dates.today });
  await setDates("Card tomorrow", { dueDate: dates.tomorrow });
  await setDates("Card yesterday", { dueDate: dates.yesterday });
  await setDates("Card start only", { startDate: dates.plus2 });

  // Wait for React to commit the boards update before the test
  // navigates to the planner. The setDates hook calls setBoards()
  // which is async (React batches); without this the planner can
  // mount and read the pre-date boards on the same frame.
  await page.waitForTimeout(200);
}

test.describe("Planner", () => {
  test("renders 7 day columns for the current week and highlights today", async ({
    page,
  }) => {
    await bootWithCards(page);
    await page.getByTestId("topbar-planner").click();
    const week = page.getByTestId("planner-week");
    await expect(week).toBeVisible();

    const days = page.getByTestId("planner-day");
    await expect(days).toHaveCount(7);

    // .planner-day--today is a class on the section itself.
    const todayDays = page.locator(
      '[data-testid="planner-day"].planner-day--today',
    );
    await expect(todayDays).toHaveCount(1);
  });

  test("cards with dueDate land in the correct day column; overdue gets the overdue chip", async ({
    page,
  }) => {
    await bootWithCards(page);
    await page.getByTestId("topbar-planner").click();
    const dates = await isoDates(page);
    const todayCol = page.locator(
      '[data-testid="planner-day"][data-day-iso="' + dates.today + '"]',
    );
    await expect(todayCol.getByText("Card today")).toBeVisible();
    const yesterdayCol = page.locator(
      '[data-testid="planner-day"][data-day-iso="' + dates.yesterday + '"]',
    );
    await expect(yesterdayCol.getByText("Card yesterday")).toBeVisible();
    await expect(
      yesterdayCol.locator(".planner-card__due--overdue"),
    ).toBeVisible();
  });

  test("start-only cards land under their startDate", async ({ page }) => {
    await bootWithCards(page);
    await page.getByTestId("topbar-planner").click();
    const dates = await isoDates(page);
    const col = page.locator(
      '[data-testid="planner-day"][data-day-iso="' + dates.plus2 + '"]',
    );
    await expect(col.getByText("Card start only")).toBeVisible();
  });

  test("dateless cards appear in the Sem data disclosure", async ({
    page,
  }) => {
    await bootWithCards(page);
    await page.getByTestId("topbar-planner").click();
    const dateless = page.getByTestId("planner-dateless");
    await expect(dateless).toBeVisible();
    await expect(
      dateless.getByTestId("planner-dateless-row"),
    ).toHaveCount(1);
    await expect(dateless.getByText("Card no dates")).toBeVisible();
  });

  test("� Hoje � navigator shifts the week and Hoje returns to current", async ({
    page,
  }) => {
    await bootWithCards(page);
    await page.getByTestId("topbar-planner").click();

    const firstColIsoBefore = await page
      .getByTestId("planner-day")
      .first()
      .getAttribute("data-day-iso");

    await page.getByTestId("planner-next").click();
    const firstColIsoAfter = await page
      .getByTestId("planner-day")
      .first()
      .getAttribute("data-day-iso");
    expect(firstColIsoAfter).not.toBe(firstColIsoBefore);

    await page.getByTestId("planner-today").click();
    const firstColIsoReset = await page
      .getByTestId("planner-day")
      .first()
      .getAttribute("data-day-iso");
    expect(firstColIsoReset).toBe(firstColIsoBefore);
    await expect(page.getByTestId("planner-today")).toBeDisabled();
  });

  test("clicking a card row opens the board and the card is in the DOM", async ({
    page,
  }) => {
    await bootWithCards(page);
    await page.getByTestId("topbar-planner").click();
    const dates = await isoDates(page);
    const todayCol = page.locator(
      '[data-testid="planner-day"][data-day-iso="' + dates.today + '"]',
    );
    await todayCol.getByText("Card today").click();
    await expect(
      page.getByRole("heading", { name: "Planner test board" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page
        .locator("[data-card-id]")
        .filter({ hasText: "Card today" })
        .first(),
    ).toBeVisible();
  });
});
