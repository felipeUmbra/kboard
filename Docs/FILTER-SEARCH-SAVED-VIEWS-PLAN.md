# Kboard — Search, Filtering & Saved Views

Development and design plan. **No code is written by this document** — it is a
specification to be implemented against.

Scope: three connected features on the board view.

| # | Feature | Summary |
|---|---|---|
| 1 | **Search bar** | Type-to-narrow. Matches card type, tag, description, title. |
| 2 | **Filter view** | Structured filters: type, tag, priority, dates, presets. |
| 3 | **Saved filters** | Name, persist, rename, re-apply, update-in-place. |

> **Decisions locked with the user.**
>
> | Question | Decision |
> |---|---|
> | Drag-and-drop while filtered? | **Enabled** — index mapping, not disabling. §5.3 |
> | Saved-view scope? | **Per board. No global views.** §3.2 |
> | Priority filter source? | **A `preset_list` custom field.** No schema change. §5.2 |
> | Search scope? | **Current board only.** |
> | Card added while hidden by a filter? | **Create it, then toast that it's hidden.** §5.7 |
> | Sort order in a saved view? | **Out of scope.** |

---

## 1. Baseline research (what already exists)

Verified against the tree, not assumed.

| Fact | Evidence |
|---|---|
| No search, filter, or saved-view code exists today. Only two local, component-scoped filters: `ActivityLog` filter pills and `ParentPicker` title search. | `grep` over `src/**` |
| Domain types live in one file; `Board` has no view/filter field. | `src/models/types.ts` |
| Data is **one JSON file per board** in Drive `appDataFolder`. No backend, no SQL. | `Docs/DATA-MODEL.md` §1–2 |
| Every read passes through `normalizeBoard(raw): Board`, which coerces *any* malformed input into a valid board. | `src/models/migrations.ts` |
| **Derived data is computed on read, never persisted** (progress, column index, done-ness, counts). | `Docs/DATA-MODEL.md` §8 |
| Card order lives on the **column** (`column.cardIds`), not the card. | `Docs/DATA-MODEL.md` §4.2 |
| `Column.tsx` renders `column.cardIds` directly; the board header/toolbar is inline in `BoardView.tsx`. | `src/components/Column.tsx`, `BoardView.tsx` |
| Sidebar already has a collapsible-section pattern and a mobile icon rail. | `src/components/Sidebar.tsx` |
| **There is no `priority` field.** `Card` has `type`, `title`, `descriptionHtml`, `labelIds`, `parentIds`, `startDate`, `dueDate`, field-value maps. | `src/models/types.ts`, grep `priority` |
| Tag == `Label` (`labelIds`, `lbl-*`). "Tag" in the request maps to this. | `src/models/types.ts` |
| Rich text is sanitized HTML (DOMPurify) stored in `descriptionHtml`. | `src/components/fields/sanitize.ts` |
| Board writes are debounced 600 ms, whole-file PATCH, ETag-guarded. | `BoardContext.tsx` |
| Coverage gate: **100% lines/branches/functions on `src/models/` and `src/state/`**. | `Docs/IMPLEMENTATION-PLAN.md` §1 |
| A11y gate: contrast lint, zero colour literals, axe-core clean, both themes, WCAG AA. | `npm run a11y`, `tests/e2e/a11y-axe.spec.ts` |

### Consequences that shape the whole plan

1. **Filter/search state must not be persisted into the board data.** It is
   derived, ephemeral view state — consistent with §8. Only *saved views* are
   persisted, and they are small, schema-validated records.
2. **`priority` has no home in the model.** It must not be hardcoded. See §5.2.
3. **New model/state code must ship with 100% branch coverage** or the existing
   gate fails. This is a real cost, budgeted per-phase.
4. **Description is HTML.** Matching must strip tags first, or a card matches
   on `<p>`.

---

## 2. Design

### 2.1 Information architecture

Two independent mechanisms, one combined result:

```
        ┌─ searchQuery: string ──────────┐
input ──┤                                 ├──▶ visibleCardIds: Set<CardId> ──▶ render
        └─ filter: FilterState ──────────┘
```

- **Search** is free text, transient, never persisted.
- **Filter** is structured, and is what a *saved view* persists.
- Both are `useState` in `BoardView` / lifted to a new context. Neither writes
  to `Board`.
- Search and filter **AND** together. Search is not a filter and is not stored
  in a saved view (see §5.4 for why, and the alternative).

### 2.2 UI placement

```
┌──────────────────────────────────────────────────────────────┐
│ TopBar:  ☰  Kboard / Q3 Roadmap              [user]           │
├────────┬─────────────────────────────────────────────────────┤
│        │ Board header (existing)                              │
│ Side   │ ┌─────────────────────────────────────────────────┐ │
│ bar    │ │ 🔍 Search cards…   │ [Filter ▾] 3 │ [Views ▾]      │ │  ← NEW toolbar
│        │ └─────────────────────────────────────────────────┘ │
│  Views │  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  ├ All │  │ To do (2)│ │ Doing(1) │ │ Done (5) │              │
│  ├ Bug │  └──────────┘ └──────────┘ └──────────┘              │
│  └ +   │                                                      │
└────────┴─────────────────────────────────────────────────────┘
```

- **Toolbar row** in `BoardView.tsx` header, under the board title, above the
  columns. Full-width, wraps on mobile.
- **Views menu** in the `Sidebar` as a new collapsible section `"views"`,
  with a `+` item. Rationale: the sidebar already owns board-level
  configuration (labels, types, fields) and already has a mobile rail — so the
  rail gets a views button for free and it stays consistent.

### 2.3 Search behaviour

- **Scope: the currently open board only.** Not cross-board. This matches the
  requested "remove cards from view" behaviour and keeps saved views
  board-scoped.
- Matches, case-insensitively, substring, across:
  - `title`
  - `descriptionHtml` → tag-stripped text
  - **tag/label names** (not ids — matching `lbl-bug` is useless to a user)
  - **card type label** (`cardTypes[i].label`, user-overridable — not the raw
    `"epic"` enum)
- Non-matching cards are **hidden from view** (per the request): removed from
  the column's rendered list, not greyed out.
- Empty query → no filtering.
- Debounce: **150 ms** (typing feel). Not persisted. Cleared on board switch.
- `Escape` in the field clears it; `Escape` elsewhere does not close the board.
- Match state announced: column headers show `matched/total`, e.g. `To do (2/7)`.
- A board-wide result count + "Clear" affordance when active.

### 2.4 Filter behaviour

A filter is a set of **predicates**. All predicates are AND-ed; within one
predicate the selected values are OR-ed. E.g. `type ∈ {epic, story}` AND
`labels ⊇ {bug}` AND `dueDate < today`.

**Valid filter dimensions** (explicitly per the request):

| Dimension | Source of truth | Widget |
|---|---|---|
| Card type | `cardTypes` | checkbox group of enabled types |
| Tag / Label | `board.labels` | multi-select chips w/ colours |
| Priority | *derived* — see §5.2 | preset_list multi-select |
| Start date | `card.startDate` | range + relative presets |
| Due date | `card.dueDate` | range + relative presets |
| Column | `board.columns` | multi-select |
| Done | `board.doneColumnIds` | toggle: done / not done |
| Custom field | `board.customFields` + per-type | per field-type widget |

**Explicitly NOT valid filters:** title, description, comments. Excluded at the
type level so it cannot be added by accident (see §6.1).

Relative date presets (each side of a date filter): `Overdue`, `Today`,
`Tomorrow`, `This week`, `Next week`, `Next 30 days`, `No date`, `Before…`,
`After…`. Reuse `date-fns` (already a dependency) and `formatIso` / `parseIso`
from `src/models/dateValidation.ts`.

Active filter chips render under the toolbar, each individually removable, with
a "Clear all".

### 2.5 Saved views

- A saved view = `{ id, name, filter, createdAt, updatedAt }`, stored **per
  board** in Drive so it syncs across devices. See §5.
- **Board-scoped only** (confirmed). There are no global/cross-board views. A
  view's `labelIds` / `columnIds` / `fieldId` all reference board-local
  entities, and because a view never leaves its own board there is no
  cross-board id-resolution problem. Global views would require a migration
  plus remapping every stored filter's ids.
- **Unique name**, enforced per board, case-insensitively, after trimming.
- **Rename** inline, same uniqueness rule.
- **Update in place:** when a saved view is active and the user edits the
  filter, the save action targets *that* view. The button reads **"Update view
  — <name>"**, never "Save as new". This is the behaviour explicitly requested.
- Selecting a view applies its filter. Selecting again / "Clear" returns to the
  unfiltered board. A dirty view is badged (`•`) so the user knows unsaved
  changes exist.
- View menu also offers: **Save as new…**, **Rename**, **Delete** (confirm),
  and **All cards** (the reset item, always first, never deletable).
- Views are ordered as created; drag-reorder is a **non-goal for v1**.

### 2.6 Accessibility (non-negotiable)

The existing gates are strict and the new UI must pass all of them.

- Search: real `<input type="search">` with `<label>` (visually hidden if the
  design wants an icon-only affordance). `role="searchbox"` is implicit.
- Filters + views menus: keyboard-navigable popover pattern — `Escape` closes
  and **returns focus to the trigger**; `Tab` cycles within; click-outside
  closes. Focus must never be trapped or lost.
- Checkboxes are real `<input type="checkbox">`, not styled divs.
- Result-count changes are announced via a polite live region.
- Every new colour is a token in `tokens.css`. **Zero raw hex literals** —
  `npm run lint:colors` fails otherwise. Reuse the existing 12-colour
  `COLOR_PALETTE` for label swatches.
- Contrast: any new foreground/background pair must be verified in **both**
  themes, worst-case against `--color-bg-elevated`. Extend
  `scripts/check-contrast.js`.
- Mobile: popovers become bottom sheets (existing pattern). Tap targets ≥
  `--tap-target` (44 px).
- `axe-core` must stay at 0 violations on the new surfaces, light + dark.

---

## 3. Data model

### 3.1 New types (`src/models/types.ts`)

```ts
export interface SavedView {
  id: string;
  name: string;
  filter: FilterState;
  createdAt: number;
  updatedAt: number;
}

export interface FilterState {
  cardTypes?: CardType[];          // OR within
  labelIds?: string[];             // OR within
  columnIds?: string[];            // OR within
  fieldFilters?: FieldFilter[];    // OR within, AND across
  startDate?: DateFilter;          // AND with dueDate
  dueDate?: DateFilter;
  done?: "done" | "not-done" | "any";  // default "any"
}

export interface FieldFilter {
  fieldId: string;
  /** Present only for preset_list. */
  optionIds?: string[];
  /** present only for boolean. */
  bool?: boolean;
  /** present only for number / percentage. */
  num?: { min?: number; max?: number };
  /** present only for date custom fields. */
  date?: { from?: string; to?: string };
}
```

All fields optional and all arrays default-empty ⇒ an empty `FilterState` means
"no filtering". This is what makes "Clear all" a one-line operation.

### 3.2 `Board` change

```diff
  export interface Board {
    id: string;
    name: string;
    labels: Label[];
    customFields: CustomField[];
    cardTypes: CardTypeConfig[];
    doneColumnIds: string[];
+   /** Named, persisted filter presets. v1 order = creation order. */
+   savedViews?: SavedView[];
    columns: Column[];
    cards: Record<string, Card>;
    …
  }
```

Optional (`?`) so existing board files need no rewrite, and so the normalizer
can default it to `[]`.

### 3.3 Normalization (`src/models/migrations.ts`)

`normalizeBoard` gets `savedViews` handling consistent with its existing
"degrade, never crash" philosophy:

| Input | Output |
|---|---|
| missing / not an array | `[]` |
| entry missing `id` or `name` | dropped |
| `name` blank after trim | entry dropped |
| entry missing `filter` | entry dropped |
| malformed entry otherwise | dropped |
| duplicate names (case-insensitive) | first wins, rest dropped |
| `doneColumnIds`-style id guards | filter to `typeof === "string"` |

Uniqueness must **also** be enforced at write time (`boardActions`), not only
in the normalizer — the normalizer is the last line of defence against a
hand-edited Drive file, not the primary validation.

---

## 4. Module layout

New files are pure logic where possible (matching the `src/models/` +
100%-coverage convention); React files stay thin.

| File | Kind | Responsibility |
|---|---|---|
| `src/models/filters.ts` | **new, pure** | `matchesFilter`, `matchesSearch`, `isFilterEmpty`, `visibleCardIds`, `filterSummary` |
| `src/models/filters.test.ts` | **new** | exhaustive unit coverage |
| `src/models/htmlText.ts` | **new, pure** | `htmlToText(html)` — tag-strip, entity-decode, collapse whitespace |
| `src/models/htmlText.test.ts` | **new** | unit coverage |
| `src/models/savedViews.ts` | **new, pure** | `normalizeSavedViews`, `validateViewName`, `upsertSavedView`, `renameSavedView`, `deleteSavedView` |
| `src/models/savedViews.test.ts` | **new** | unit coverage |
| `src/state/viewState.tsx` | **new** | `ViewStateProvider` — holds `searchQuery` + `filter` + `activeViewId`; survives view switches; **not** persisted |
| `src/state/viewState.test.ts` | **new** | coverage |
| `src/state/savedViewActions.ts` | **new** | board mutations: save/update/rename/delete view (wired into `boardActions.ts`) |
| `src/components/SearchBar.tsx` | **new** | input + clear + result count |
| `src/components/FilterBar.tsx` | **new** | toolbar row: filter button, active chips, clear-all |
| `src/components/FilterMenu.tsx` | **new** | popover with all dimensions |
| `src/components/SavedViewsMenu.tsx` | **new** | popover: apply / save / update / rename / delete |
| `src/components/Column.tsx` | **edit** | accept `visibleCardIds`; filter render + count |
| `src/components/BoardView.tsx` | **edit** | mount toolbar, compute `visibleCardIds` once, pass down |
| `src/components/Sidebar.tsx` | **edit** | new `"views"` collapsible section + rail button |
| `src/styles/components.css` / `responsive.css` | **edit** | new classes, mobile bottom-sheet variant |
| `src/styles/tokens.css` | **edit** | any new tokens |

### Data flow

```
BoardView
  ├─ useViewState()  → { searchQuery, filter, setFilter, activeViewId, … }
  ├─ useMemo(() => visibleCardIds(board, searchQuery, filter), [board, searchQuery, filter])
  └─ <Column visibleCardIds={set} />  → filters column.cardIds for render only
```

`Column` filters at render time. **The underlying `column.cardIds` array is
never mutated** — ordering, DnD, and persistence stay authoritative.

---

## 5. Key decisions & risks

### 5.1 Derived, not persisted (search/filter)
Consistent with `Docs/DATA-MODEL.md` §8. A stale filter baked into the board
file would be a bug class of its own. Only the *preset* is persisted.

### 5.2 "Priority" — the one genuine gap ✅ *(confirmed)*

**There is no priority in the data model.** The request lists it as a filter
dimension. Options:

| Option | Verdict |
|---|---|
| **A. Priority = any `preset_list` custom field** *(recommended)* | Filter UI offers one section per `preset_list` field. Zero schema change. A board whose "Priority" preset-list is High/Medium/Low gets priority filtering for free — and so does every other dropdown field. |
| B. Add a first-class `priority` to `Card` | Breaks the model, duplicates fields, forces every board to be migrated. **Reject.** |
| C. Detect a field literally named "Priority" | Brittle, locale-dependent. **Reject.** |

**Confirmed: Option A.** The UI labels the section "Priority" when the field is
named that, otherwise by field name. This satisfies the request without a schema
change, and it is the honest reading of "or any other preset selectors".

### 5.3 Drag-and-drop while filtered — **ENABLED** ✅ *(confirmed)*

`column.cardIds` holds absolute indices. Under a filter, visible index 3 is
*not* absolute index 3. Passing the raw visible index to `moveCard` would
corrupt card order silently and permanently, because it is persisted to Drive.

**Decision: keep drag-and-drop enabled, and map the index.**

| Option | Verdict |
|---|---|
| **A. Index mapping** — resolve the drop against the *rendered* list, then convert to the absolute index of the next visible card; append when there is none. | ✅ **Chosen** — filtering is a triage tool, and disabling drag makes triage the one moment you cannot reorganise. |
| B. Disable DnD while filtered. | ❌ Rejected — costs the exact capability the feature exists to support. |

Implementation rules:

- `SortableContext items` must register the **visible** ids, not `column.cardIds`.
- Compute the absolute index **after removing the dragged card**, because
  `moveCard` (`src/state/cardActions.ts:241`) strips the card from every column
  *before* it clamps and splices. Getting this wrong produces a persistent
  off-by-one.
- The mobile `overlay-column:` branch already appends (`toIndex =
  col.cardIds.length`), which stays correct; but its **displayed count** must be
  filtered-aware so the label matches where the card lands.

Requires dedicated E2E coverage in Phase 4. A silent index corruption here would
corrupt real user data.

### 5.4 Search is not saved in a view
A saved view stores only `filter`. Including `searchQuery` would make a saved
view silently hide most of the board on recall. Revisit only if asked.

### 5.5 Performance
- `visibleCardIds` is **one** `useMemo` over `Object.values(board.cards)`, not
  a per-column filter — O(cards) once per query change, not O(cards × columns).
- `htmlToText` results are memoized in a `WeakMap`/`Map` keyed by the HTML
  string so a 150 ms debounce doesn't re-strip the same strings repeatedly.
- Debounce 150 ms; measured against a 2 000-card synthetic board.

### 5.6 HTML in search
`descriptionHtml` must be stripped **before** matching, or `<p>`/`href` produce
false positives. `htmlToText` is a pure function — DOM-free, so it is unit
testable in `node` and does not need `jsdom`.

### 5.7 Cards created while a filter hides them ✅ *(confirmed)*
A card added under an active filter that hides it is **still created**, followed
by a toast: *"Card added — hidden by current filters."* The work is never lost
and creation is never blocked; the user clears filters to reveal it.

This is the single place where filtering is **not** purely a render-time
concern, so it must be explicit: after a create, test the new card against
`matchesFilter` and surface the toast if it fails.

---

## 6. Phases

Each phase is independently shippable and ends green on typecheck + unit + a11y.

### Phase 0 — Foundations (pure, no UI)
1. `htmlText.ts` + tests.
2. `types.ts` — `FilterState`, `FieldFilter`, `DateFilter`, `SavedView`;
   `Board.savedViews?`.
3. `migrations.ts` — `savedViews` normalization + tests.
4. `filters.ts` — `matchesFilter` / `matchesSearch` / `isFilterEmpty` /
   `visibleCardIds` + **exhaustive tests (100% branch)**.
5. `savedViews.ts` — name validation, upsert/rename/delete + tests.

*Exit:* `npm run typecheck && npm run test:unit` green; coverage on the new
`src/models/` files is 100%.

### Phase 1 — Search bar (vertical slice)
6. `viewState.tsx` — context, query + debounce + reset-on-board-change.
7. `SearchBar.tsx`; toolbar row in `BoardView.tsx`.
8. `Column.tsx` accepts `visibleCardIds`; `matched/total` counts.

*Exit:* typing narrows across title/description/type/tag; a11y checks pass;
`tests/e2e/search.spec.ts` green on desktop + mobile.

### Phase 2 — Filters
9. `FilterBar.tsx` + `FilterMenu.tsx` — all dimensions from §2.4, priority via
   §5.2 option A.
10. Active-filter chips + clear-all.
11. Date presets via `date-fns`.
12. `tests/e2e/filters.spec.ts`; add dimension coverage to unit tests.

*Exit:* every dimension filters correctly and independently; keyboard-only
operation verified.

### Phase 3 — Saved views
13. `savedViewActions.ts` wired into `boardActions.ts`; `Board.savedViews` persisted
    through the existing debounced Drive write.
14. `SavedViewsMenu.tsx` + `Sidebar` `"views"` section + mobile rail button.
15. Rename, delete (confirm), **update-in-place** when a view is active.
16. `tests/e2e/saved-views.spec.ts`; unique-name + persistence cases in
    `tests/integration/state-actions.test.ts`.

*Exit:* save → reload → view survives; rename works; editing + saving while in a
view updates that view; duplicate names rejected with a visible message.

### Phase 4 — Drag-and-drop under a filter *(do not merge before this)*
17. Index mapping (§5.3) in `KanbanDndContext` / `Column`.
18. E2E: move a card under an active filter, reload, assert order in Drive.

*Exit:* no card ordering corruption under any filter state; verified by reload.

### Phase 5 — Hardening
19. Performance pass against a 2 000-card board.
20. `a11y` full run — axe on new surfaces, contrast both themes, colour lint.
21. Empty states: "No cards match" with a clear-filters action; a column whose
    cards are all filtered out still renders, showing `0`.
22. Visual regression baselines (`tests/e2e/visual-baselines.spec.ts`).

---

## 7. Test plan

### Unit (Vitest) — must be 100% branch
| File | Cases |
|---|---|
| `filters.test.ts` | empty filter matches all; each dimension alone; combined AND; OR-within; unknown/removed label id is inert; missing dates; invalid ISO dates; `done` tri-state; custom field per field-type; preset_list OR; number min/max bounds; `any` boundary cases; `visibleCardIds` on an empty board |
| `htmlText.test.ts` | plain text; tags stripped; entities decoded; nested tags; whitespace collapsed; empty/null; script content removed |
| `savedViews.test.ts` | unique name; case-insensitive; whitespace trim; rename collision; upsert preserves `createdAt`, bumps `updatedAt`; delete; malformed input dropped |
| `migrations.test.ts` | the §3.3 table |
| `viewState.test.ts` | debounce; reset on board change; dirty tracking |

### E2E (Playwright) — chromium-desktop + chromium-mobile
`search.spec.ts`, `filters.spec.ts`, `saved-views.spec.ts`, plus additions to
`a11y-axe.spec.ts` for the new surfaces.

Selectors go in `tests/helpers/selectors.ts` (existing convention). Prefer
`data-testid` over CSS. Match card identity via the existing
`[data-card-id="…"]` hook that `BoardView` already relies on for focus-scrolling.

### Accessibility
- Keyboard-only: open filter menu, change every dimension, close, apply.
- `Escape` returns focus to the trigger.
- axe-core on: search bar, filter menu open, saved-views menu open, filtered
  empty state — light **and** dark.
- Live region announces result counts.

---

## 8. Documentation to update (same PR, not later)

| File | Change |
|---|---|
| `Docs/DATA-MODEL.md` | `Board.savedViews` in §4.1; a `SavedView` subsection; `savedViews` normalization row in §6.1; note that search/filter is **not** persisted, per §8 |
| `Docs/UX-UI-DESIGN.md` | toolbar layout, search + filter + views components, popover/bottom-sheet patterns, any new tokens |
| `Docs/APP-FLOW.md` | filter → save → recall → update flow |
| `Docs/IMPLEMENTATION-PLAN.md` | new phase rows + updated §1 counts |
| `Docs/PRD.md` | the three features as delivered capability |
| `README.md` | user-facing section |

---

## 9. Verification per phase

```bash
npm run typecheck        # 0 errors
npm run test:unit        # all green, new files at 100%
npm run a11y             # contrast + colour-literal lint
npm run lint:colors
npm run test:e2e -- --project=chromium-desktop --project=chromium-mobile
npm run test:regression
npm run build
```

Baseline to hold: **0 type errors · 0 contrast failures · 0 hardcoded colours ·
0 axe violations · 100% coverage on `src/models/` + `src/state/`**.

---

## 10. Open questions

**All design decisions resolved with the user:**

| Question | Decision |
|---|---|
| Drag-and-drop while filtered? | **Enabled** — index mapping. §5.3 |
| Priority source — preset-list or first-class field? | **Preset-list custom field.** §5.2 |
| Saved-view scope — per board or global? | **Per board. No global views.** §3.2 |
| Search scope — one board or all? | **Current board only.** §2.3 |
| Card added while hidden by a filter? | **Create it, then toast.** §5.7 |
| Sort order in a saved view? | **Out of scope.** `SavedView` is filter-only. |
| Visibility / sharing? | **Out of scope** — single-user Drive file today. |

**Remaining, non-blocking** (defaults assumed, change later if it matters):

1. **Mobile filter UX** — full filter sheet, or a reduced mobile set? Assumed:
   full set in a bottom sheet.
2. **View limits** — cap saved views per board? No cap proposed.
