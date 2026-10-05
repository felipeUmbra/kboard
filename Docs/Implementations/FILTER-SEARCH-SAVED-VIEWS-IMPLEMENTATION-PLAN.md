# Kboard — Search, Filtering & Saved Views: Implementation Plan

Development and design plan for three connected features on the board view.
Companion to `Docs/FILTER-SEARCH-SAVED-VIEWS-PLAN.md` (the design spec), which
defines the behaviour this plan schedules.

| # | Feature | Summary |
|---|---|---|
| 1 | **Search bar** | Type-to-narrow. Matches card type, tag, description, title. |
| 2 | **Filter view** | Structured filters: type, tag, priority, start/due date, presets. |
| 3 | **Saved filters** | Board-scoped, uniquely named, renameable, update-in-place. |

> **No code is written by this document.** It is the build schedule, file-level
> task breakdown, and verification plan to implement against.

---

## 0. Decisions locked (confirmed by the user)

| Question | Decision | Consequences for this plan |
|---|---|---|
| Drag-and-drop while filtered? | **Enabled.** | Index mapping is mandatory, not optional. Own phase, own test budget. §5.3, Phase 4 |
| Saved-view scope? | **Per board. No global views.** | `Board.savedViews[]`. Lives and dies with the board. No cross-board lookups, no user-level index. §3.2 |
| Toolbar layout? | **Toolbar beside the filter button**, not a separate bar. | Chip row lives inside `.filter-bar` on its own line; `.board-toolbar` stays `flex-wrap: nowrap`. §5.2 |
| `filteredOrder.ts`? | **Dropped.** | `moveCard` already matches `arrayMove` across every filtered gesture, so the dedicated index-mapping module was redundant. Phase 4 shrank to "prove it". |
| View cap? | **50 per board.** Names ≤ 60 chars, unique per board. | `MAX_SAVED_VIEWS` in `src/models/savedViews.ts`; `saveView` checks the cap **before** the name, so the user is told the real blocker. |
| Mobile filter UX (§9.1)? | **Full set, in a bottom sheet.** | Confirmed as shipped. |
| Sorting in a view (§9.2)? | **Out of scope.** | Confirmed excluded; a saved view stores a filter only, never an ordering. |

> **Phase 4 was re-scoped during implementation.** The original Phase 4 assumed
> a dedicated filtered-order index map would be required. Probing `moveCard`
> against `arrayMove` showed it already matches for mouse, touch, keyboard and
> mobile-column-target paths, so the phase became verification rather than new
> machinery. See `Docs/IMPLEMENTATION-PLAN.md` "Phase 7 — Find".

Two facts from the codebase drive the rest of the plan:

1. **`moveCard` removes the card from every column *before* it clamps and
   splices** (`src/state/cardActions.ts:241`). So `toIndex` is interpreted
   against the *post-removal* array. Any filtered-index mapping must be
   computed the same way, or cards land one slot off — permanently.
2. **`data-testid` is the live convention.** There are 36 testids across 11
   source files, concentrated in the most recent features (ChecklistEditor 14,
   Planner 8). `tests/helpers/selectors.ts:4` claims the app ships no testids —
   **that comment is stale** and describes an older state of the repo. New UI
   should follow the actual convention (`data-testid`) and update the stale
   comment rather than treat it as binding.

---

## 1. Scope & sequencing

Six phases. Each is independently shippable and ends green on typecheck, unit
tests, a11y, and E2E. No phase begins until the prior one is green.

| Phase | Deliverable | Depends on |
|---|---|---|
| 0 | Pure logic: text extraction, filter predicates, saved-view ops | — |
| 1 | Search bar (vertical slice) | 0 |
| 2 | Filter view | 1 |
| 3 | Saved filters (board-scoped) | 2 |
| 4 | Drag-and-drop under a filter | 1, 2 |
| 5 | Hardening, perf, a11y sweep, docs | all |

**Phase 4 is the risk item.** It is scheduled *after* the value features
deliver, so a DnD defect can never block search or filters reaching users.

---

## 2. File-level task breakdown

### Phase 0 — Foundations (pure logic, no UI, no React)

| # | File | Action | Task |
|---|---|---|---|
| 0.1 | `src/models/htmlText.ts` | **new** | `htmlToText(html)`. Strip tags, decode entities, collapse whitespace, drop `<script>`/`<style>` content. **Must be DOM-free** so it unit-tests in `node` without `jsdom`. |
| 0.2 | `src/models/htmlText.test.ts` | **new** | Cases in §6.1. |
| 0.3 | `src/models/types.ts` | **edit** | Add `FilterState`, `FieldFilter`, `DateFilter`, `SavedView`; add `savedViews?: SavedView[]` to `Board`. All optional — existing board files need no rewrite. |
| 0.4 | `src/models/savedViews.ts` | **new** | `normalizeSavedViews`, `validateViewName`, `upsertSavedView`, `renameSavedView`, `deleteSavedView`. Uniqueness is **case-insensitive, post-trim**. |
| 0.5 | `src/models/savedViews.test.ts` | **new** | §6.2. |
| 0.6 | `src/models/migrations.ts` | **edit** | `savedViews` normalization in `normalizeBoard`, matching the file's degrade-never-crash style. Table in spec §3.3. |
| 0.7 | `src/models/migrations.test.ts` | **edit** | One case per normalization row. |
| 0.8 | `src/models/filters.ts` | **new** | `htmlToText` wired into `matchesSearch`. `matchesFilter`, `matchesSearch`, `isFilterEmpty`, `visibleCardIds`, `filterSummary`. |
| 0.9 | `src/models/filters.test.ts` | **new** | Exhaustive; **100% branch** is the gate (§6.1). |

**Exit criteria:** `npm run typecheck` 0 errors; `npm run test:unit` green;
new `src/models/` files at 100% coverage. No UI exists yet, so E2E is
untouched.

---

### Phase 1 — Search bar

| # | File | Action | Task |
|---|---|---|---|
| 1.1 | `src/state/viewState.tsx` | **new** | `ViewStateProvider` holding `searchQuery`, `filter`, `activeViewId`, `isDirty`. 150 ms debounce. Reset on board switch. **Never persisted.** |
| 1.2 | `src/state/viewState.test.ts` | **new** | Debounce coalescing, reset-on-change, dirty tracking. |
| 1.3 | `src/components/SearchBar.tsx` | **new** | `<input type="search">` + clear button + result count. Polite live region. `Escape` clears. |
| 1.4 | `src/components/BoardView.tsx` | **edit** | Mount `SearchBar` in the header row, under the title. One `useMemo` → `visibleCardIds`. |
| 1.5 | `src/components/Column.tsx` | **edit** | Accept `visibleCardIds: Set<string> \| null`; filter `sortableItems` for **render only**. Count renders `matched/total`. |
| 1.6 | `src/styles/components.css` | **edit** | `.search-bar`, `.search-bar__input`, `.search-bar__count`. |
| 1.7 | `src/components/SearchBar.tsx` | **edit** | Add `data-testid`s (`search-input`, `search-clear`, `search-count`) on the new elements. |
| 1.8 | `tests/e2e/search.spec.ts` | **new** | §6.3. Desktop + mobile projects. |

**Critical constraint:** `column.cardIds` is **never mutated** by filtering.
It stays authoritative for order and persistence. `Column` filters at render
time only.

**Exit criteria:** typing narrows across title/description/type/tag; `matched/total`
correct; a11y clean; `search.spec.ts` green on chromium-desktop and
chromium-mobile.

---

### Phase 2 — Filter view

| # | File | Action | Task |
|---|---|---|---|
| 2.1 | `src/components/FilterBar.tsx` | **new** | Toolbar row: filter trigger, active-filter chips, clear-all. |
| 2.2 | `src/components/FilterMenu.tsx` | **new** | Popover. Dimensions per spec §2.4. Priority via §5.2 option A. |
| 2.3 | `src/models/dateValidation.ts` | **edit if needed** | Reuse `formatIso` / `parseIso` / `todayIso` for date presets. |
| 2.4 | `src/components/BoardView.tsx` | **edit** | Combine `searchQuery` + `filter` into the memo. |
| 2.5 | `src/styles/components.css`, `responsive.css` | **edit** | Popover classes + mobile bottom-sheet variant. |
| 2.6 | `src/components/FilterBar.tsx`, `FilterMenu.tsx` | **edit** | `data-testid`s on the trigger, menu, each dimension group, and the active chips. |
| 2.7 | `src/components/Toast.tsx` | **new/reuse** | "Card added — hidden by current filters." Reuse the existing toast pattern (`UpdateToast.tsx`, `.install-toast`); do not build new infrastructure. Triggered from `Column.tsx` add-card and from `CardEditor` save when the new card fails `matchesFilter`. |
| 2.8 | `tests/e2e/filters.spec.ts` | **new** | §6.4. |

**Explicitly not filterable** — title, description, comments. Excluded at the
type level (`FilterState` has no key for them) so it is structurally impossible
to add by accident.

**Exit criteria:** every dimension filters independently and combined; AND
across predicates, OR within one; keyboard-only operation verified; axe clean.

---

### Phase 3 — Saved filters (board-scoped)

| # | File | Action | Task |
|---|---|---|---|
| 3.1 | `src/state/savedViewActions.ts` | **new** | `saveView`, `updateView`, `renameView`, `deleteView` as pure board reducers. |
| 3.2 | `src/state/boardActions.ts` | **edit** | Wire the four above into `BoardActions` + the `mutate` pipeline. Mirror the existing `renameBoard` / `addColumn` shape. |
| 3.3 | `src/state/actionsIndex.ts` | **edit** | Re-export, keeping the single-import-path convention. |
| 3.4 | `src/models/migrations.ts` | **edit** | If Phase 0 added normalization only, confirm `savedViews` survives the Drive round-trip. |
| 3.5 | `src/components/SavedViewsMenu.tsx` | **new** | Apply / **Save as new…** / **Update view — `<name>`** / Rename / Delete / All cards. |
| 3.6 | `src/components/Sidebar.tsx` | **new** section** | `sidebar__section[data-section="views"]`, matching the existing collapsible pattern (`labels` / `types` / `fields`). Add the matching rail button. |
| 3.7 | `src/components/BoardView.tsx` | **edit** | Compose toolbar: SearchBar + FilterBar + views trigger. |
| 3.8 | `src/styles/tokens.css` | **edit** | Any new tokens — **zero raw hex**. |
| 3.9 | `tests/unit/savedViewActions.test.ts` | **new** | Reducer coverage. |
| 3.10 | `tests/integration/state-actions.test.ts` | **edit** | Persistence + uniqueness + rename-collision cases. |
| 3.11 | `tests/e2e/saved-views.spec.ts` | **new** | §6.5. |

**Behaviour already specified:** unique name (case-insensitive, trimmed); rename
with the same rule; when a view is active and the filter is edited, the save
action targets *that* view and the button reads **"Update view — `<name>`"** —
never "Save as new".

**Exit criteria:** save → reload → survives; rename works; editing + saving
while in a view updates that view; duplicate names rejected with a visible,
announced message; views appear in the sidebar section *and* the mobile rail.

---

### Phase 4 — Drag-and-drop under a filter ⚠️ *risk item*

The user confirmed **DnD stays enabled while filtering**. `column.cardIds` holds
absolute indices, so a visible index is meaningless once cards are hidden.
Directly passing the drop index to `moveCard` would corrupt order — silently and
permanently, since it is persisted to Drive.

**Chosen approach — index mapping.** Insert relative to the **next visible
card's absolute index**:

- Resolve the drop against the **rendered (visible)** list only.
- Compute the absolute target index as *the absolute index of the next visible
  card below the drop point*.
- If there is no next visible card, append to the end of the column.
- If the dragged card itself is the only visible card in the column, the drop is
  a no-op for ordering.
- Compute the index against the **post-removal** array, because `moveCard`
  strips the card out before it splices.

| # | File | Action | Task |
|---|---|---|---|
| 4.1 | `src/models/filteredOrder.ts` | **new** | Pure functions: `visibleIds(column)`, `absoluteIndexFor(visibleDropIdx, cardIds, visibleIds)`. 100% branch coverage. |
| 4.2 | `src/models/filteredOrder.test.ts` | **new** | §6.6 — the edge-case matrix. |
| 4.3 | `src/components/Column.tsx` | **edit** | Render only visible ids, and register `SortableContext items` as the **visible** list. |
| 4.4 | `src/components/KanbanDndContext.tsx` | **edit** | Translate the drop into an absolute index via `filteredOrder` before calling `ctx.moveCard`. All three branches must be filtered-aware: the `overlay-column:` mobile target, the `column:` body, and the dropped-onto-card branch. |
| 4.5 | `src/components/MobileColumnTargets.tsx` | **edit** | `cardCount={col.cardIds.length}` (`line 91`) shows the **unfiltered** count. Show the filtered count when a filter is active so the target label matches what lands there. |
| 4.6 | `tests/e2e/filters.spec.ts` | **edit** | Add the DnD-under-filter cases. |

**The mobile overlay branch is easy to miss and must be covered.** It
currently sets `toIndex = col.cardIds.length` — an absolute end-of-column
index. That is still correct under a filter (append), so it is left as-is
deliberately, but the *count* it displays needs fixing (4.5).

**Exit criteria:** no card-ordering corruption under any filter state, verified
by **reload** (not just DOM order); covered on mobile cross-column drag.

---

### Phase 5 — Hardening

| # | File | Action | Task |
|---|---|---|---|
| 5.1 | — | perf | `visibleCardIds` is one O(cards) memo per query change, not per column. `htmlToText` memoized by HTML string. Measure against a 2 000-card board. |
| 5.2 | — | a11y | axe on every new surface, light **and** dark. Contrast both themes worst-case against `--color-bg-elevated`. `npm run lint:colors`. |
| 5.3 | `src/components/BoardView.tsx` | **edit** | Empty states: board-wide "No cards match" + clear-filters action. A column with all cards filtered out still renders, showing `0`. |
| 5.4 | `tests/e2e/visual-baselines.spec.ts` | **edit** | New baselines for the toolbar, menus, and filtered states. |
| 5.5 | Docs | **edit** | §8 below. |

---

## 3. Data model

Full definitions are in the design spec §3.1. Implementation notes that matter:

- **Every field in `FilterState` is optional**, and empty arrays default to
  empty ⇒ an empty `FilterState` means "no filtering". That makes `isFilterEmpty`
  and "Clear all" trivial and total.
- **`Board.savedViews` is optional (`?`)** so no existing board file needs
  rewriting and the normalizer defaults it to `[]`.
- **Board-scoped only.** A view's ids reference board-local entities (`labelIds`,
  `columnIds`, `fieldId`). Because views never leave the board that owns them,
  there is no cross-board id remapping problem — which is exactly what the
  "no global views" decision buys. If global views were ever added, this
  becomes a migration with real id-resolution work.

---

## 4. Data flow

```
BoardView
  ├─ useViewState() → { searchQuery, filter, activeViewId, isDirty, … }
  ├─ useMemo(() => visibleCardIds(board, searchQuery, filter),
  │           [board, searchQuery, filter])          ← single O(cards) pass
  └─ <Column visibleCardIds={set} />                ← render-time filter only
         └─ <SortableContext items={visibleIds}>    ← Phase 4
```

`column.cardIds` is never mutated. Ordering, DnD, and persistence all keep
reading it.

---

## 5. Risks & mitigations

### 5.1 Persisting derived state
Search and filter stay in React state — never written to `Board`. Consistent
with `Docs/DATA-MODEL.md` §8. A stale filter baked into the board file would be
a bug class of its own.

### 5.2 "Priority" has no home in the model ⚠️ — *confirmed*
`Card` has no priority field. **Confirmed: priority = any `preset_list` custom
field.** No schema change; a board whose "Priority" preset-list is High/Medium/
Low gets priority filtering for free, as does every other dropdown field. Adding
a first-class `priority` would force a board migration and duplicate what fields
already model. This is the reading of "or any other preset selectors".

### 5.7 Cards created while a filter hides them
Confirmed behaviour: **create the card, then toast that it's hidden.** The work
is never lost; the user clears filters to reveal it. Implementation note — this
is the one place where filtering must *not* be purely a render-time concern, so
the check is explicit: after a create, test the new card against `matchesFilter`
and surface the toast if it fails. Adding it is never blocked.

### 5.3 DnD index corruption ⚠️ *highest risk*
Covered above and in Phase 4. Mitigations: a pure, exhaustively-tested mapping
function; the `moveCard` post-removal semantics honoured explicitly; and
reload-verified E2E rather than DOM-order assertions.

### 5.4 Descriptions are HTML
`descriptionHtml` must be stripped **before** matching, or `<p>` and `href`
produce false positives.

### 5.5 Search is not stored in a saved view
A saved view stores only `filter`. Including `searchQuery` would make a recalled
view silently hide most of the board.

### 5.6 Write amplification
Saving a view writes the whole board file (`PATCH`). Acceptable — the debounce
is 600 ms and views change rarely.

---

## 6. Test plan

The project gate is **100% lines/branches/functions on `src/models/` and
`src/state/`**. That is a hard requirement, not a target.

### 6.1 `htmlText.test.ts` + `filters.test.ts`
| Case | Why it matters |
|---|---|
| plain text, no tags | baseline |
| tags stripped; nested tags; entities decoded | no false positives from markup |
| `<script>` / `<style>` content removed | not matchable, not rendered |
| whitespace collapsed; empty / null / undefined | boundary |
| empty filter matches **all** cards | total function, not a special case |
| each dimension alone; combined AND; OR-within | predicate correctness |
| unknown / deleted `labelId` or `fieldId` is **inert** | data drifts; must not throw |
| missing dates; invalid ISO dates | malformed input |
| `done` tri-state including `"any"` | explicit default |
| `preset_list`, `number` min/max bounds, boolean, date fields | per field-type |
| empty board → empty set | boundary |

### 6.2 `savedViews.test.ts`
Unique name (case-insensitive, trimmed); empty/blank rejected; rename collision
rejected; upsert preserves `createdAt` and bumps `updatedAt`; delete; malformed
input dropped; duplicate names → first wins.

### 6.3 `search.spec.ts` (Playwright)
Matches on title; on description text; on tag **name** (not `lbl-` id); on card
type **label** (not the `epic` enum); non-matching cards absent from the DOM;
`matched/total` counts; clear restores everything; `Escape` clears; **does not
match cards on other boards** (search is current-board only).

### 6.4 `filters.spec.ts`
Each dimension independently; combined; clear-all; empty state; **keyboard-only**
operation of the menu; `Escape` returns focus to the trigger.

### 6.5 `saved-views.spec.ts`
Save with a unique name; duplicate name rejected visibly; reload → survives;
rename; rename to a collision rejected; **edit-while-in-view → "Update view"**
updates rather than duplicates; delete with confirm; view appears in sidebar and
mobile rail.

### 6.6 DnD-under-filter matrix (`filteredOrder.test.ts` + E2E)
| Scenario | Expected |
|---|---|
| Move down within one column, filter hides a middle card | lands immediately after the intended visible neighbour — **never** at the raw visible index |
| Drop on the last visible card | appends after it, **before** any hidden trailing cards |
| Drop with no next visible card | appends to column end |
| Dropped card is the only visible card | ordering no-op |
| Cross-column under a filter | lands in the correct column at the mapped index |
| Mobile `overlay-column:` target | appends; **displayed count matches** |
| Same-column drag past the removed position | **off-by-one** check — the most likely bug |

Every E2E case asserts order **after reload**, so a persistence-layer bug cannot
hide behind a correct-looking DOM.

---

## 7. Verification per phase

```bash
npm run typecheck    # 0 errors
npm run test:unit    # green; new src/models + src/state files at 100%
npm run a11y         # contrast + colour-literal lint
npm run lint:colors  # 0 raw hex
npm run test:e2e -- --project=chromium-desktop --project=chromium-mobile
npm run test:regression
npm run build
```

Baseline to hold: **0 type errors · 0 contrast failures · 0 hardcoded colours ·
0 axe violations · 100% coverage on `src/models/` + `src/state/`**.

---

## 8. Documentation to update (same PR, not later)

| File | Change |
|---|---|
| `Docs/DATA-MODEL.md` | `Board.savedViews` in §4.1; a `SavedView` subsection; `savedViews` row in the §6.1 normalization table; note that search/filter is **not** persisted (§8) |
| `Docs/FILTER-SEARCH-SAVED-VIEWS-PLAN.md` | mark decisions locked in §0 |
| `Docs/UX-UI-DESIGN.md` | toolbar layout; search / filter / views components; popover + bottom-sheet patterns; new tokens |
| `Docs/APP-FLOW.md` | filter → save → recall → update flow |
| `Docs/IMPLEMENTATION-PLAN.md` | new phase rows + refreshed §1 counts |
| `Docs/PRD.md` | the three features as delivered capability |
| `README.md` | user-facing section |

---

## 9. Remaining open questions

Design-level questions are settled by the spec. Still worth a decision before
Phase 2:

1. **Mobile filter UX** — full filter sheet, or a reduced mobile set? Plan
   assumes the full set in a bottom sheet.
2. **Sorting in a view** — should a saved view also define an ordering (e.g.
   due-date ascending)? Not requested, excluded from both documents. Confirm it
   stays out of scope.
3. **View limits** — cap saved views per board (e.g. 50)? No cap proposed.
