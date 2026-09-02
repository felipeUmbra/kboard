import { expect, type Page, type Locator } from "@playwright/test";
import { loginAs } from "./login";
import { sel } from "./selectors";

/**
 * High-level page object for kboard. Specs call these instead of raw
 * selectors so tests read like user stories.
 */
export class BoardPage {
  constructor(public readonly page: Page) {}

  // ── Auth ──────────────────────────────────────────────────────────
  async login() {
    await this.page.goto("/");
    await loginAs(this.page);
    await this.page.waitForSelector(sel.boardCard + "," + sel.emptyState, { timeout: 10_000 });
  }

  async logout() {
    const logoutBtn = this.page.getByRole("button", { name: /log out|sign out/i });
    if (await logoutBtn.count()) {
      await logoutBtn.first().click();
    } else {
      await this.page.evaluate(() => {
        localStorage.removeItem("kboard:profile");
        localStorage.removeItem("kboard:google-token");
      });
      await this.page.reload();
    }
    await this.page.waitForSelector(sel.loginButton, { timeout: 5_000 });
  }

  // ── Boards list ───────────────────────────────────────────────────
  async gotoBoards() {
    if (!this.page.url().endsWith("/")) {
      const back = this.page.getByRole("button", { name: /back to boards/i });
      if (await back.count()) await back.first().click();
    } else {
      await this.page.goto("/");
    }
    await this.page.waitForSelector(sel.boardCard + "," + sel.emptyState, { timeout: 5_000 });
  }

  async createBoard(name: string) {
    await this.gotoBoards();
    const btn = this.page.locator(sel.newBoardButton).or(this.page.locator(sel.emptyStateCreate));
    await btn.first().click();
    await this.page.waitForSelector(sel.createBoardModal);
    await this.page.fill(sel.createBoardNameInput, name);
    await this.page.getByRole("button", { name: /^Create$/ }).click();
    await this.page.waitForSelector(sel.boardTitle, { timeout: 5_000 });
  }

  async openBoard(name: string) {
    await this.gotoBoards();
    const card = this.page.locator(sel.boardCard).filter({ hasText: name }).first();
    await card.click();
    await this.page.waitForSelector(sel.boardTitle, { timeout: 5_000 });
  }

  async deleteBoardFromList(name: string) {
    await this.gotoBoards();
    this.page.once("dialog", (d) => d.accept());
    const card = this.page.locator(sel.boardCard).filter({ hasText: name }).first();
    await card.locator(sel.boardCardDelete).click();
    // Wait for the card to disappear from the DOM (DELETE round-trip).
    await expect(card).toHaveCount(0, { timeout: 5_000 });
  }

  // ── Board view ────────────────────────────────────────────────────
  async renameBoard(newName: string) {
    await this.page.click(sel.boardTitle);
    await this.page.keyboard.press("Control+A");
    await this.page.keyboard.type(newName);
    await this.page.keyboard.press("Enter");
  }

  async addColumn(name: string) {
    // The app uses window.prompt("Column name").
    this.page.once("dialog", (d) => {
      if (d.type() === "prompt") d.accept(name);
      else d.accept();
    });
    await this.page.click(sel.addColumnButton);
    await this.page.waitForSelector(`.kanban-column:has-text("${name}")`, { timeout: 5_000 });
  }

  async getColumn(name: string): Promise<Locator> {
    // Case-insensitive column match — innerText/CSS may uppercase names.
    return this.page
      .locator(sel.column)
      .filter({ hasText: new RegExp(name, "i") })
      .first();
  }

  async toggleDoneColumn(name: string) {
    const col = await this.getColumn(name);
    await col.locator(sel.columnOptions).click();
    await this.page.getByRole("button", { name: /mark as (done|not done)/i }).click();
  }

  // ── Cards ─────────────────────────────────────────────────────────
  async addCard(columnName: string, title: string, type: "task" | "story" | "epic" = "task") {
    const col =
      columnName && columnName.length > 0
        ? await this.getColumn(columnName)
        : this.page.locator(sel.column).first();
    // The primary add button text is "+ Add <defaultLabel>" (lowercase).
    // If the requested type matches the primary add button's type, just click it.
    // Otherwise click the dropdown caret to open the picker.
    const primaryAddBtn = col.locator(sel.columnAddBtn).first();
    const primaryText = (await primaryAddBtn.innerText()).toLowerCase();
    const typeMatch = primaryText.includes(type);
    if (typeMatch) {
      await primaryAddBtn.click();
    } else {
      // Open the dropdown caret (its accessible name is "Choose card type").
      const pickerBtn = col.locator('button[aria-label="Choose card type"]');
      await pickerBtn.click();
      // Pick the type from the dropdown — match by trailing label text.
      const opt = this.page.locator(`.dropdown-menu button:has-text("${type}")`);
      await opt.first().click();
    }
    // The draft input is a TEXTAREA with className="textarea".
    const draftInput = col.locator('textarea.textarea').last();
    await draftInput.waitFor({ state: "visible", timeout: 5_000 });
    await draftInput.fill(title);
    await draftInput.press("Enter");
    await this.page.waitForSelector(`${sel.card}:has-text("${title}")`, { timeout: 5_000 });
  }

  async openCard(title: string) {
    await this.page.locator(sel.card).filter({ hasText: title }).first().click();
    await this.page.waitForSelector(sel.cardTitleInput, { timeout: 5_000 });
  }

  async closeCardEditor() {
    await this.page.locator(sel.cardSave).click();
    await this.page.waitForSelector(sel.cardTitleInput, { state: "detached", timeout: 5_000 });
  }

  async setCardTitle(newTitle: string) {
    await this.page.fill(sel.cardTitleInput, newTitle);
  }

  async setCardType(type: "task" | "story" | "epic") {
    await this.page.getByRole("radio", { name: new RegExp(type, "i") }).first().click();
    // Wait for the radio to register the change before continuing.
    await this.page
      .getByRole("radio", { name: new RegExp(type, "i") })
      .first()
      .waitFor({ state: "visible" });
  }

  async setDescription(text: string) {
    const editor = this.page.locator(sel.tiptap).first();
    await editor.click();
    await this.page.keyboard.press("Control+A");
    await this.page.keyboard.press("Delete");
    await this.page.keyboard.type(text);
  }

  async deleteCard() {
    this.page.once("dialog", (d) => d.accept());
    await this.page.locator(sel.cardDelete).click();
  }

  // ── Drag & drop ───────────────────────────────────────────────────
  async dragCardToColumn(cardTitle: string, toColumnName: string) {
    const card = this.page.locator(sel.card).filter({ hasText: cardTitle }).first();
    const target = await this.getColumn(toColumnName);
    const cardBox = await card.boundingBox();
    const targetBox = await target.boundingBox();
    if (!cardBox || !targetBox) throw new Error("Could not find card or target bounding box");
    // dnd-kit PointerSensor activates at 5px of movement. Drag in small
    // intermediate steps so the sensor activates and collision detection
    // fires properly.
    await this.page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await this.page.mouse.down();
    // First nudge to trigger activation
    await this.page.mouse.move(cardBox.x + cardBox.width / 2 + 10, cardBox.y + cardBox.height / 2 + 10, { steps: 5 });
    // Move to the target column header area (more reliable than column center)
    await this.page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + 30, // header area
      { steps: 20 },
    );
    // Small wiggle to ensure collision detection sees the drop target
    await this.page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + 60,
      { steps: 5 },
    );
    await this.page.mouse.up();
  }

  // ── Drive introspection ───────────────────────────────────────────
  async listDriveFiles() {
    return this.page.evaluate(() => window.__kboardDrive!.list());
  }

  async setDriveForce401Once() {
    await this.page.evaluate(() => window.__kboardDrive!.setForce401Once());
  }

  async setDriveForceNetworkError() {
    await this.page.evaluate(() => window.__kboardDrive!.setForceNetworkError());
  }

  async resetDrive() {
    await this.page.evaluate(() => window.__kboardDrive!.reset());
  }
}