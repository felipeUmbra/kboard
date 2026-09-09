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

  /**
   * Playwright's actionability check occasionally reports
   * "modal__body intercepts pointer events" for bottom-sheet footer buttons
   * in mobile emulation — even though the footer renders ABOVE the body
   * (z-index: 1) and a raw protocol-level click at the same coordinates
   * succeeds. This helper tries the normal click first and falls back to a
   * real mouse click at the element's center when that false positive
   * occurs, so tests aren't blocked by a phantom interception.
   */
  async clickButtonFallback(locator: Locator): Promise<void> {
    try {
      await locator.click({ timeout: 3_000 });
    } catch {
      const box = await locator.boundingBox();
      if (!box) throw new Error("clickButtonFallback: no bounding box");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await this.page.mouse.click(x, y);
    }
  }

  async createBoard(name: string) {
    await this.gotoBoards();
    const btn = this.page.locator(sel.newBoardButton).or(this.page.locator(sel.emptyStateCreate));
    await btn.first().click();
    await this.page.waitForSelector(sel.createBoardModal);
    // The bottom-sheet modal animates in (`sheet-up` keyframe, 200ms) on
    // mobile. Wait for it to settle before interacting so the input and
    // footer buttons are at their final positions.
    await this.page.waitForTimeout(300);
    await this.page.fill(sel.createBoardNameInput, name);
    await this.clickButtonFallback(
      this.page.getByRole("button", { name: /^Create$/ }),
    );
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
    // Mobile uses the rail "+" button (the desktop "+ Add column" button
    // isn't rendered on mobile). Desktop/tablet use the inline button.
    if (await this.isMobileView()) {
      await this.addColumnMobile(name);
      return;
    }
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

  /**
   * True if the app is rendering in mobile mode (width < 768), where columns
   * live in a collapsible rail and only one column is expanded at a time.
   */
  async isMobileView(): Promise<boolean> {
    return this.page.evaluate(() => window.innerWidth < 768);
  }

  /**
   * Mobile: expand the column rail strip matching `name` (case-insensitive).
   * The strip's accessible name is the vertical column name followed by the
   * "(count)". No-op on desktop/tablet where all columns are visible.
   */
  async selectColumnTab(name: string): Promise<void> {
    if (!(await this.isMobileView())) return;
    // Ensure the sidebar drawer isn't overlaying the board rail.
    await this.collapseSidebar();
    const strip = this.page
      .getByRole("tab", { name: new RegExp(`^${name}\\b`, "i") })
      .first();
    await strip.click();
    await expect(strip).toHaveAttribute("aria-selected", "true", { timeout: 3_000 });
  }

  /**
   * Mobile: collapse the sidebar drawer back to its icon rail if it's open.
   * No-op on desktop/tablet or when the rail is already collapsed.
   */
  async collapseSidebar(): Promise<void> {
    if (!(await this.isMobileView())) return;
    const closeBtn = this.page.getByRole("button", { name: /close menu/i }).first();
    if (await closeBtn.count()) {
      // The expanded drawer has a ✕ "Close menu" button in its header.
      await closeBtn.click().catch(() => {});
      await this.page.waitForSelector(sel.sidebarRail, {
        state: "visible",
        timeout: 2_000,
      }).catch(() => {});
    }
  }

  /**
   * Mobile: add a column via the rail's "+" button (uses window.prompt).
   * No-op on desktop/tablet (they use the inline "+ Add column" button).
   */
  async addColumnMobile(name: string): Promise<void> {
    if (!(await this.isMobileView())) return;
    this.page.once("dialog", (d) => {
      if (d.type() === "prompt") d.accept(name);
      else d.accept();
    });
    await this.page.locator(sel.mobileColumnRailAdd).click();
    // The new column should appear as a strip in the rail.
    await this.page.waitForSelector(
      `${sel.mobileColumnTab}:has-text("${name}")`,
      { timeout: 5_000 },
    );
  }

  /**
   * Mobile: expand the sidebar (collapsed icon rail → full menu drawer).
   * `section` optionally targets a rail icon (labels/fields/types/done) so
   * the drawer opens scrolled to that section. No-op on desktop/tablet.
   */
  async expandSidebar(section?: string): Promise<void> {
    if (!(await this.isMobileView())) return;
    const btn =
      section && section !== "boards"
        ? this.page
            .locator(sel.sidebarRail)
            .getByRole("button", { name: new RegExp(section, "i") })
        : this.page.locator(sel.sidebarRailExpand);
    await btn.first().click();
    // The full menu drawer renders with the Manage buttons.
    await this.page
      .waitForSelector(sel.sidebar, { state: "visible", timeout: 3_000 })
      .catch(() => {});
  }

  async toggleDoneColumn(name: string) {
    // Only the expanded column is in the DOM on mobile — select it first.
    if (await this.isMobileView()) {
      if (!(await this.isColumnExpanded(name))) {
        await this.selectColumnTab(name);
      }
    }
    const col = await this.getColumn(name);
    await col.locator(sel.columnOptions).click();
    await this.page.getByRole("button", { name: /mark as (done|not done)/i }).click();
  }

  /** True when `name` is the currently expanded mobile column. */
  private async isColumnExpanded(name: string): Promise<boolean> {
    if (!(await this.isMobileView())) return true;
    const cols = await this.page
      .locator(sel.column)
      .filter({ hasText: new RegExp(name, "i") })
      .count();
    return cols > 0;
  }

  // ── Cards ─────────────────────────────────────────────────────────
  async addCard(columnName: string, title: string, type: "task" | "story" | "epic" = "task") {
    // On mobile, only the expanded (active) column is rendered. Expand the
    // target column's rail strip first so its DOM exists.
    if (columnName && columnName.length > 0) {
      await this.selectColumnTab(columnName);
    }
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
    const cardLocator = this.page.locator(sel.card).filter({ hasText: title }).first();
    await cardLocator.waitFor({ state: "visible", timeout: 5_000 });
    await cardLocator.click();
    await this.page.waitForSelector(sel.cardTitleInput, { timeout: 5_000 });
  }

  async closeCardEditor() {
    const saveBtn = this.page.locator(sel.cardSave);
    await this.clickButtonFallback(saveBtn);
    // Wait for the editor modal to be removed from the DOM.
    await this.page.waitForSelector(sel.cardTitleInput, { state: "detached", timeout: 5_000 });
    // A small wait lets React flush the state update to the card before
    // the next assertion looks at it.
    await this.page.waitForTimeout(100);
  }

  async setCardTitle(newTitle: string) {
    // Drive the React-controlled input with Playwright's `fill`, which is
    // designed to work with React's synthetic onChange. It focuses the
    // input, clears it, then types each character — firing native
    // `input` events that React's delegated event listener picks up.
    //
    // The previous implementation used a native value setter + a manually
    // dispatched `input` event. That sets the DOM value correctly, but
    // the React state update is scheduled asynchronously; if the caller
    // immediately invokes `closeCardEditor()`, the Save click can run
    // before React processes the state update, so the closure captured
    // by `saveAndClose` still sees the old title and re-persists it.
    // `fill` avoids that race because it types character-by-character and
    // Playwright's auto-waiting gives the React microtask queue a chance
    // to flush before the call returns.
    const input = this.page.locator(sel.cardTitleInput);
    await input.waitFor({ state: "visible", timeout: 5_000 });
    await input.fill(newTitle);
    // Sanity check: the DOM value should now reflect the new title.
    await expect(input).toHaveValue(newTitle, { timeout: 3_000 });
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
    await this.clickButtonFallback(this.page.locator(sel.cardDelete));
  }

  // ── Drag & drop ───────────────────────────────────────────────────
  async dragCardToColumn(cardTitle: string, toColumnName: string) {
    const card = this.page.locator(sel.card).filter({ hasText: cardTitle }).first();
    // Wait for the card to be stable before dragging — after a previous
    // drag, the React re-render can leave the DOM briefly detached.
    await card.waitFor({ state: "visible", timeout: 10_000 });
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
    // Wait for the move to settle before the next assertion / drag.
    await this.page.waitForTimeout(100);
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