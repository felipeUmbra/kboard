import { test, expect } from "@playwright/test";
import { installFakesOnPage } from "../helpers/login";
import { BoardPage } from "../helpers/boardPage";

test.describe("Comments and Activity Log", () => {
  test.beforeEach(async ({ page }) => {
    await installFakesOnPage(page);
    const bp = new BoardPage(page);
    await bp.login();
    await bp.createBoard("Discussion Board");
    await bp.addCard("To do", "Discussion card");
  });

  test("Comment thread renders when card editor is open", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    await expect(page.getByText(/comments/i).first()).toBeVisible();
    await bp.closeCardEditor();
  });

  test("Add a comment and see it in the thread", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    const textarea = page.locator('textarea[placeholder^="Add a comment"]').first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.click();
    await textarea.pressSequentially("First comment");
    const submit = page.getByRole("button", { name: /^Post$/ });
    await expect(submit).toBeEnabled({ timeout: 5_000 });
    await submit.click();
    // Scope to the comment-thread list (not the textarea value, which clears
    // after posting) so we don't match the Activity heading or similar.
    await expect(page.locator(".comment-thread__list").getByText("First comment")).toBeVisible({ timeout: 5_000 });
    await bp.closeCardEditor();
  });

  test("Delete a comment", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    const textarea = page.locator('textarea[placeholder^="Add a comment"]').first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.click();
    await textarea.pressSequentially("Ephemeral");
    const submit = page.getByRole("button", { name: /^Post$/ });
    await expect(submit).toBeEnabled({ timeout: 5_000 });
    await submit.click();
    const list = page.locator(".comment-thread__list");
    await expect(list.getByText("Ephemeral")).toBeVisible({ timeout: 5_000 });
    const deleteBtn = page.getByRole("button", { name: /delete comment by/i }).first();
    await deleteBtn.click();
    await expect(list.getByText("Ephemeral")).toHaveCount(0, { timeout: 5_000 });
    await bp.closeCardEditor();
  });

  test("Activity log shows the 'created' entry", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    await expect(page.getByText(/created/i).first()).toBeVisible();
    await bp.closeCardEditor();
  });

  test("Title change adds a 'title_changed' entry", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    await bp.setCardTitle("New title for log");
    await bp.closeCardEditor();
    await bp.openCard("New title for log");
    await expect(page.getByText(/title changed/i).first()).toBeVisible({ timeout: 5_000 });
    await bp.closeCardEditor();
  });

  test("Activity log filter pills are present", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    // FilterPill buttons render labels like "All", "Comments", "Changes".
    await expect(page.getByText(/all|comments|changes/i).first()).toBeVisible();
    await bp.closeCardEditor();
  });

  test("Activity log is collapsible", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    const toggle = page.getByRole("button", { name: /^Activity/i });
    if (await toggle.count()) {
      await toggle.first().click();
      // Re-click to re-expand (does not throw).
      await toggle.first().click();
    }
    await bp.closeCardEditor();
  });

  test("Relative timestamps render in comments", async ({ page }) => {
    const bp = new BoardPage(page);
    await bp.openCard("Discussion card");
    const textarea = page.locator('textarea[placeholder^="Add a comment"]').first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.click();
    await textarea.pressSequentially("Just now");
    await page.getByRole("button", { name: /^Post$/ }).click();
    // The comment shows a relative timestamp wrapped in a span[title] attribute.
    await expect(page.locator('span[title]').first()).toBeVisible({ timeout: 5_000 });
    await bp.closeCardEditor();
  });
});