/**
 * Centralized selector catalog for kboard.
 *
 * kboard uses TWO selector strategies, both in active use:
 *
 *   1. `sel.*` (this file) — semantic selectors derived from role, aria-label
 *      and BEM class names. ~125 call sites across 12 spec files.
 *   2. `data-testid` — used by the newer surfaces: ChecklistEditor,
 *      Planner, ShareToBoardModal, ParentPicker, the PWA toasts and the
 *      topbar planner button. ~52 call sites across 4 spec files.
 *
 * Which to use for NEW code:
 *   - Prefer `data-testid` in the component. It is decoupled from copy and
 *     from CSS class names, so a copy edit or a rename does not break tests.
 *   - Strongly prefer it for dynamically-rendered UI (popovers, filter menus,
 *     anything with computed or conditional text), where a `:has-text()`
 *     selector becomes brittle or impossible.
 *   - `sel.*` remains correct and supported for the existing selectors here.
 *     Do NOT migrate working call sites just for consistency; the diff would
 *     be large, risky, and buy nothing.
 *
 * This catalog is NOT exhaustive — some testids are referenced as literals in
 * the specs rather than registered here. When you add a selector that is used
 * in more than one spec, register it below so a refactor has one place to fix.
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
  // The title anchor inside a board card — the card's actual click target
  // (a stretched link). See BoardListView.tsx.
  boardCardLink: ".board-card__link",
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

  // Search + filter toolbar (Phases 1–2). These use data-testid rather than
  // this catalog because the menu renders conditionally and its checkbox
  // labels are computed, so a class-based selector would be brittle.
  searchInput: '[data-testid="search-input"]',
  searchClear: '[data-testid="search-clear"]',
  searchCount: '[data-testid="search-count"]',
  filterTrigger: '[data-testid="filter-trigger"]',
  filterMenu: '[data-testid="filter-menu"]',
  filterBadge: '[data-testid="filter-badge"]',
  filterChips: '[data-testid="filter-chips"]',
  filterClearAll: '[data-testid="filter-clear-all"]',
  filterMenuDone: '[data-testid="filter-menu-done"]',
  columnOptions: 'button[aria-label="Column options"]',
  columnAddBtn: ".kanban-column__add-btn",
  columnDoneDot: ".kanban-column__done-dot",
  // Mobile: collapsible column rail. Each strip is a vertical label; the
  // count "(n)" sits at the bottom. data-active marks the expanded column.
  mobileColumnTab: ".kanban-rail__strip",
  mobileColumnRail: ".kanban-rail",
  mobileColumnRailAdd: 'button[aria-label="Add column"]',

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
  sidebarManageFields: 'button[aria-label="Manage board fields"]',
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
  // Mobile collapsible sidebar rail — icon toolbar when collapsed.
  sidebarRail: ".sidebar__rail",
  sidebarRailExpand: 'button[aria-label="Expand menu"]',
  sidebarRailSection: (label: string) =>
    `.sidebar__rail-btn[aria-label="${label}"]`,
} as const;