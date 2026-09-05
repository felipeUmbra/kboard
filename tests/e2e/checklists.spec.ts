// Checklists end-to-end checks.
//
// Drives the ChecklistEditor UI directly: clicking the placeholder,
// typing into the input, pressing Enter, toggling items, etc. This is
// the strongest test for the feature because it exercises the same
// surface the user touches.

import { test, expect, type Page } from "@playwright/test";
import { BoardPage } from "../helpers/boardPage";
import { installFakesOnPage } from "../helpers/login";
import { sel } from "../helpers/selectors";

async function openCardEditor(page: Page, cardTitle: string) {
  // Defensive: close any leftover dialog from a previous step.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  await page
    .locator(sel.card)
    .filter({ hasText: cardTitle })
    .first()
    .click();
  // The card editor is identified by the ChecklistEditor it contains
  // (no other dialog in the app has that testid). Anchoring on a
  // specific testid makes the selector robust against leftover dialogs
  // from prior steps (e.g. the create-board modal).
  const editor = page.locator(
    '[role="dialog"]:has([data-testid="checklist-editor"])',
  );
  await expect(editor).toBeVisible({ timeout: 5_000 });
  return editor;
}

test.describe("Checklists", () => {
  test("add a checklist, add items, toggle; chip + activity log update", async ({
    page,
  }) => {
    const bp = new BoardPage(page);
    await installFakesOnPage(page);
    await bp.login();
    await bp.createBoard("Checklist test board");
    // Create a single card using the existing helper.
    await bp.addCard("", "Card with checklist");

    // Open the editor. The checklist section should be empty: no
    // "checklist" element rendered, only the "+ Add checklist" toggle.
    const editor = await openCardEditor(page, "Card with checklist");
    await expect(editor.getByTestId("checklist-add-checklist-toggle")).toBeVisible();
    await expect(editor.getByTestId("checklist")).toHaveCount(0);

    // 1) Add a checklist.
    await editor.getByTestId("checklist-add-checklist-toggle").click();
    await editor.getByTestId("checklist-add-checklist-input").fill("Tasks");
    await editor.getByTestId("checklist-add-checklist-submit").click();

    // Now we have one checklist, no items yet.
    await expect(editor.getByTestId("checklist")).toHaveCount(1);
    await expect(editor.getByTestId("checklist-item")).toHaveCount(0);
    await expect(editor.getByTestId("checklist-progress")).toHaveCount(0);

    // 2) Add three items via the per-checklist "Add item" input.
    const addItemInput = editor.getByTestId("checklist-add-item-input");
    const addItemSubmit = editor.getByTestId("checklist-add-item-submit");
    for (const text of ["Wire it up", "Test it", "Ship it"]) {
      await addItemInput.fill(text);
      await addItemSubmit.click();
    }
    await expect(editor.getByTestId("checklist-item")).toHaveCount(3);

    // Title bar shows "0/3 (0%)".
    await expect(editor.getByTestId("checklist-progress")).toHaveText(
      "0/3 (0%)",
    );

    // 3) Toggle the first item.
    const firstItem = editor.getByTestId("checklist-item").first();
    await firstItem.getByTestId("checklist-item-toggle").check();
    await expect(firstItem).toHaveAttribute("data-done", "true");
    await expect(editor.getByTestId("checklist-progress")).toHaveText(
      "1/3 (33%)",
    );

    // 4) Close the editor and confirm the card-face chip.
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();
    await expect(page.getByTestId("checklist-chip").first()).toHaveText("1/3");

    // 5) Activity log records the changes.
    await openCardEditor(page, "Card with checklist");
    await expect(
      editor.locator(".activity-log__item", {
        hasText: /Added checklist "Tasks"/,
      }),
    ).toBeVisible();
    await expect(
      editor.locator(".activity-log__item", {
        hasText: /Checked "Wire it up"/,
      }),
    ).toBeVisible();
  });
});
test("checklist chip is hidden when no items exist", async ({ page }) => {
  const bp = new BoardPage(page);
  await installFakesOnPage(page);
  await bp.login();
  await bp.createBoard("Empty checklist board");
  await bp.addCard("", "Card");



  // Add a checklist but no items.
  const editor = await openCardEditor(page, "Card");
  await editor.getByTestId("checklist-add-checklist-toggle").click();
  await editor.getByTestId("checklist-add-checklist-input").fill("Empty");
  await editor.getByTestId("checklist-add-checklist-submit").click();

  // Close the editor and confirm no chip on the card face.
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(page.getByTestId("checklist-chip")).toHaveCount(0);
});

test("delete a checklist removes it from the editor and the chip", async ({
  page,
}) => {
  const bp = new BoardPage(page);
  await installFakesOnPage(page);
  await bp.login();
  await bp.createBoard("Delete test");
  await bp.addCard("", "Card");



  const editor = await openCardEditor(page, "Card");
  await editor.getByTestId("checklist-add-checklist-toggle").click();
  await editor.getByTestId("checklist-add-checklist-input").fill("To delete");
  await editor.getByTestId("checklist-add-checklist-submit").click();
  const itemInput = editor.getByTestId("checklist-add-item-input").last();
  const itemSubmit = editor.getByTestId("checklist-add-item-submit").last();
  await itemInput.fill("Item");
  await itemSubmit.click();

  await editor.getByTestId("checklist-delete").click();
  await expect(editor.getByTestId("checklist")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("checklist-chip")).toHaveCount(0);
});
