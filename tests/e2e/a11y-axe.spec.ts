import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";
import { sel } from "../helpers/selectors";
import {
  expectNoAxeViolations,
  summariseAxeResults,
  KNOWN_VIOLATIONS,
  AXE_TAGS,
} from "../helpers/axe";

/**
 * Sprint 4.1 — axe-core scans across every representative surface.
 *
 * This is the automated floor under the accessibility work from Sprints 1–3.
 * The existing a11y-contrast.spec.ts proves the *palette*; this proves the
 * *semantics* — names, roles, landmarks, heading order, form labels — which
 * is where most real WCAG failures live.
 *
 * Scans run in the desktop project only (see the `testIgnore` in
 * playwright.config.ts). The mobile/tablet projects reuse the same DOM — the
 * app renders the same React tree and only changes layout via CSS — so extra
 * scans would cost minutes per run to re-detect identical semantics.
 * axe-core is not viewport-sensitive. Layout-dependent checks (touch
 * targets, mobile focus visibility) stay in a11y-sprint2-3.spec.ts and
 * responsive-a11y.spec.ts, which run in every project.
 */

/**
 * A per-test, per-attempt unique suffix.
 *
 * Board names are unique-constrained in the app: `BoardListView` disables
 * Create on a case-insensitive duplicate and `createNewBoard` throws. So a
 * hardcoded name makes a RETRY fail for a reason unrelated to what the first
 * attempt was testing. Each call is evaluated once per test run, giving every
 * attempt its own namespace.
 */
const uniqueId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

test.describe("axe-core (Sprint 4.1)", () => {
  test("login screen has no violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible({
      timeout: 10_000,
    });
    const results = await expectNoAxeViolations(page, { label: "login screen" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("boards list has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    // Seed two boards so the populated list is scanned, not only the empty
    // state — the two have different structure and both must be clean.
    //
    // Two details the board list needs, neither obvious from the page
    // object: createBoard() leaves us INSIDE the new board, and BoardContext
    // seeds from its local cache rather than Drive, so a freshly created
    // board does not appear in the list until Sync is pressed. See the
    // "Open existing board from list" test in boards.spec.ts.
    //
    // Names are unique per attempt on purpose. The app refuses duplicate
    // board names (BoardListView disables Create, createNewBoard throws), so
    // a fixed name would make the RETRY fail for a reason unrelated to
    // whatever the first attempt was actually testing.
    const uid = uniqueId();
    const boardA = `Axe A ${uid}`;
    const boardB = `Axe B ${uid}`;
    await bp.createBoard(boardA);
    await bp.gotoBoards();
    await bp.createBoard(boardB);
    await bp.gotoBoards();
    // The Sync button is `disabled={board.loadingList}`, and gotoBoards() has
    // only just re-entered the list, so a refresh can still be in flight.
    // Clicking a disabled button is a silent no-op, which leaves the test
    // waiting on a list that will never repopulate. Assert the actionable
    // state before clicking.
    const sync = page.locator(sel.syncButton);
    await expect(sync).toBeEnabled();
    await sync.click();
    // Assert on THIS test's two boards rather than a bare count. A count
    // assertion is the one that breaks the moment any other board is
    // present — including one left by a previous attempt — and it reports
    // "expected 2, received 0" without saying what was actually missing.
    // No explicit `{ timeout }`: omitting it lets the assertion use the
    // project's `expect.timeout` (15s on the smoke projects, 5s on Chromium).
    await expect(page.locator(sel.boardCard).filter({ hasText: boardA })).toHaveCount(1);
    await expect(page.locator(sel.boardCard).filter({ hasText: boardB })).toHaveCount(1);

    const results = await expectNoAxeViolations(page, { label: "boards list" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("board view has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe board view ${uniqueId()}`);
    await bp.addColumn("To Do");
    await bp.addColumn("Done");
    await bp.addCard("To Do", "Axe card one");
    await bp.addCard("To Do", "Axe card two");
    // Rich content exercises the description region, which an empty board
    // never renders.
    await bp.openCard("Axe card one");
    const desc = page.locator("textarea").first();
    if (await desc.count()) {
      await desc.fill("Axe description text.");
    }
    await bp.closeCardEditor();

    const results = await expectNoAxeViolations(page, { label: "board view" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("search and filter toolbar has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe toolbar ${uniqueId()}`);
    await bp.addCard("", "Axe searchable card", "task");

    // The search input, the trigger, and an active chip all present at once —
    // the three states that differ visually and for assistive tech.
    await page.locator('[data-testid="search-input"]').fill("searchable");
    await page.locator('[data-testid="filter-trigger"]').click();
    const menu = page.locator('[data-testid="filter-menu"]');
    await expect(menu).toBeVisible();
    // Tick a control so the menu is exercised with an active filter, which
    // renders the chips row and the badge.
    await page.locator('[data-testid="filter-type-task"]').check();
    await expect(page.locator('[data-testid="filter-chips"]')).toBeVisible();

    const results = await expectNoAxeViolations(page, { label: "search/filter toolbar" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("saved views menu has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe views ${uniqueId()}`);
    await bp.addCard("", "Axe task card", "task");
    await bp.addCard("", "Axe story card", "story");

    // Save one view so the menu is scanned with a list, a summary line, the
    // active marker, and the footer actions all present — not just the empty
    // state, which exercises a different subset.
    await page.locator('[data-testid="filter-trigger"]').click();
    await expect(page.locator('[data-testid="filter-menu"]')).toBeVisible();
    await page.locator('[data-testid="filter-type-task"]').check();
    await page.locator('[data-testid="filter-menu-done"]').click();

    await page.locator('[data-testid="views-trigger"]').click();
    await expect(page.locator('[data-testid="views-menu"]')).toBeVisible();
    await page.locator('[data-testid="views-save"]').click();
    await page.locator('[data-testid="views-name-input"]').fill(`Axe view ${uniqueId()}`);
    await page.locator('[data-testid="views-submit"]').click();
    await expect(page.locator('[data-testid="views-menu"]')).toHaveCount(0);

    // Reopen and scan the populated menu.
    await page.locator('[data-testid="views-trigger"]').click();
    await expect(page.locator('[data-testid="views-list"]')).toBeVisible();

    const results = await expectNoAxeViolations(page, { label: "saved views menu" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("the no-cards-match empty state has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe empty ${uniqueId()}`);
    await bp.addCard("", "Axe task card", "task");

    // The empty state renders alongside the columns, so it must not displace
    // them from the accessibility tree or announce anything incorrectly.
    await page.locator('[data-testid="search-input"]').fill("zzzznomatchaxe");
    await expect(page.locator('[data-testid="board-no-matches"]')).toBeVisible();

    const results = await expectNoAxeViolations(page, { label: "no-cards-match empty state" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("card editor modal has no violations", async ({ page }) => {
    // axe-core scans are CPU-heavy; under parallel load the 30s default
    // can flake. Give this scan room without loosening the bound for the
    // fast-feedback Chromium matrix.
    test.setTimeout(60_000);
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe modal board ${uniqueId()}`);
    await bp.addColumn("To Do");
    await bp.addCard("To Do", "Axe modal card");
    await bp.openCard("Axe modal card");
    await expect(page.locator(sel.cardTitleInput)).toBeVisible({ timeout: 5_000 });

    // Scoped to the dialog: the inert page behind it was already covered by
    // the board-view scan.
    const results = await expectNoAxeViolations(page, {
      label: "card editor modal",
      include: sel.cardEditor,
    });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("planner view has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe planner board ${uniqueId()}`);
    await bp.addColumn("To Do");
    await bp.addCard("To Do", "Axe planned card");
    const plannerToggle = page.getByTestId("topbar-planner");
    await expect(plannerToggle).toBeVisible({ timeout: 5_000 });
    await plannerToggle.click();
    await expect(page.getByTestId("planner-week")).toBeVisible({ timeout: 5_000 });

    const results = await expectNoAxeViolations(page, { label: "planner view" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("board view passes in the dark colour scheme", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard(`Axe dark board ${uniqueId()}`);
    await bp.addColumn("To Do");
    await bp.addCard("To Do", "Axe dark card");

    // The dark palette lives behind `prefers-color-scheme`, so emulateMedia
    // is what puts tokens.css into its dark branch.
    const results = await expectNoAxeViolations(page, {
      label: "board view (dark)",
      colorScheme: "dark",
    });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("the accepted-violation list has no unjustified entries", async () => {
    // Guards the escape hatch itself. An allowance without a written reason
    // is an unowned decision, and an empty list is the state worth asserting.
    const unjustified = KNOWN_VIOLATIONS.filter((v) => !v.reason || v.reason.trim().length < 10);
    expect(
      unjustified.map((v) => v.rule),
      "Every KNOWN_VIOLATIONS entry needs a substantive reason",
    ).toEqual([]);
  });

  test("the tag set covers WCAG A and AA but not AAA", async () => {
    // A regression guard on the policy: widening AXE_TAGS to include
    // wcag2aaa would fail the build on a non-goal, and narrowing it to
    // best-practice only would silently stop testing conformance.
    const tags = [...AXE_TAGS];
    for (const required of ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]) {
      expect(tags, `missing required tag ${required}`).toContain(required);
    }
    expect(tags.some((t) => t.includes("aaa")), "AAA must stay opt-in").toBe(false);
  });
});
