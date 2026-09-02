/**
 * Centralized selector catalog for kboard.
 *
 * The app does not ship `data-testid` attributes — we derive stable selectors
 * from semantic HTML (role + aria-label) and BEM class names. All selectors
 * live here so a future refactor only requires updating one file.
 *
 * Conventions:
 *   - getByRole(...)       → preferred for interactive elements
 *   - getByLabel(...)      → for inputs with aria-label
 *   - .locator('.bclass')  → for non-interactive containers
 */
export const sel = {
  // Login
  loginCard: ".login__card",
  loginButton: "button.login__btn",
  loginError: ".login__error",

  // Boards list
  boardsHeading: "h1",
  emptyState: ".empty-state",
  emptyStateTitle: ".empty-state__title",
  emptyStateCreate: ".empty-state button.btn--primary",
  newBoardButton: 'button.btn--primary:has-text("New board")',
  syncButton: 'button:has-text("Sync")',
  boardCard: "article.board-card",
  boardCardTitle: ".board-card__title",
  boardCardDelete: 'button[aria-label^="Delete board "]',

  // Create-board modal
  createBoardModal: 'div[role="dialog"]',
  createBoardNameInput: 'input#b-name',

  // Board view
  boardTitle: 'h1[title="Click to rename"]',
  deleteBoardButton: 'button:has-text("Delete board")',
  addColumnButton: 'button:has-text("Add column")',
  column: ".kanban-column",
  columnTitle: ".kanban-column__title",
  columnOptions: 'button[aria-label="Column options"]',
  columnAddBtn: ".kanban-column__add-btn",
  columnDoneDot: ".kanban-column__done-dot",
  mobileColumnTab: ".kanban-tab",

  // Card
  card: ".kanban-card",
  cardType: (type: string) => `.kanban-card[data-card-type="${type}"]`,
  cardTitle: ".kanban-card__title",
  cardParents: ".kanban-card__parents",
  cardChildren: ".kanban-card__children",
  cardDescription: ".kanban-card__description",
  cardFields: ".kanban-card__fields",
  cardLabels: ".kanban-card__labels",
  cardProgress: ".progress-bar",

  // Card editor modal
  cardEditor: 'div[role="dialog"]',
  cardTitleInput: 'input.card-title-input',
  cardTypeRadio: (type: string) => `button[role="radio"][aria-checked]`, // filtered by text
  cardSave: 'button:has-text("Save")',
  cardClose: 'button:has-text("Close")',
  cardDelete: 'button.btn--danger:has-text("Delete")',

  // Tiptap rich-text editor
  tiptap: ".tiptap",
  tiptapToolbar: '[role="toolbar"], .tiptap-toolbar',

  // Date field
  dateBadge: ".kanban-card",
  dateFieldButton: 'button[aria-label*="date" i], button:has-text("Set date")',

  // Sidebar
  sidebar: "aside.sidebar",
  sidebarBoardsList: ".sidebar__section ul",
  sidebarManageLabels: 'button[aria-label="Manage labels"]',
  sidebarManageFields: 'button[aria-label="Manage fields"]',
  sidebarDoneColumn: (columnName: string) =>
    `.sidebar__section li:has-text("${columnName}") input[type="checkbox"]`,

  // LabelManager
  labelManager: 'div[role="dialog"]',
  labelInput: 'input[placeholder*="label" i], input#label-name',
  colorSwatch: (colorId: string) =>
    `button[aria-label*="${colorId}" i], [data-color-id="${colorId}"]`,

  // FieldManager
  fieldManager: 'div[role="dialog"]',
  fieldTypeSelect: 'select, button:has-text("Type")',
  fieldAddButton: 'button:has-text("Add field"), button:has-text("+ Add")',

  // Comments
  commentThread: ".comment-thread, [class*='CommentThread']",
  commentInput: 'textarea[aria-label*="comment" i], textarea',
  commentSubmit: 'button[aria-label*="submit" i], button:has-text("Post"), button:has-text("Send")',

  // Activity log
  activityLog: ".activity-log, [class*='ActivityLog']",
  activityFilterPill: (label: string) => `button:has-text("${label}")`,

  // Banner (error)
  banner: "[role='alert'], .banner",
  bannerAction: ".banner button, [role='alert'] button",

  // Mobile menu / drawer
  mobileMenuButton: 'button[aria-label="Open menu"]',
  backToListButton: 'button[aria-label="Back to boards"]',
} as const;