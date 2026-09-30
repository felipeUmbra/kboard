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
    await bp.createBoard("Axe board A");
    await bp.gotoBoards();
    await bp.createBoard("Axe board B");
    await bp.gotoBoards();
    await page.locator(sel.syncButton).click();
    await expect(page.locator(sel.boardCard)).toHaveCount(2, { timeout: 10_000 });

    const results = await expectNoAxeViolations(page, { label: "boards list" });
    test.info().annotations.push({ type: "axe", description: summariseAxeResults(results) });
  });

  test("board view has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Axe board view");
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

  test("card editor modal has no violations", async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Axe modal board");
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
    await bp.createBoard("Axe planner board");
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
    await bp.createBoard("Axe dark board");
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
