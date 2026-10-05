# Kboard — Implementation Plan

Delivery roadmap, current status, and the work that remains. Written to be
actionable: every item names its files and its verification.

---

## 1. Current state

| | |
|---|---|
| **Version** | 0.1.0 |
| **Status** | v1 feature-complete and verified |
| **Commits** | 80 |
| **Tracked files** | 186 |
| **Unit/integration tests** | 762 passing, 25 files |
| **E2E tests** | 356 collected, 4 Chromium projects (+94 cross-browser smoke); 1 quarantined |
| **Type errors** | 0 |
| **Contrast failures** | 0 (all tokens, both themes) |
| **Hardcoded colour literals** | 0 |
| **axe-core violations** | 0 (8 surfaces, light + dark) |
| **Coverage** | 100% lines / statements / branches / functions (`src/models/`, `src/state/`) |

---

## 2. Delivered

### Phase 1 — Foundation

| Item | Files | Status |
|---|---|---|
| Vite + React + TS scaffold | `vite.config.ts`, `tsconfig.json` | ✅ |
| Google OAuth via GIS | `src/auth/gis-loader.ts`, `tokenClient.ts`, `useAuth.tsx` | ✅ |
| Drive REST client | `src/drive/driveClient.ts` | ✅ |
| Board repository | `src/drive/boardRepository.ts` | ✅ |
| Domain types | `src/models/types.ts` | ✅ |
| Lenient normalization | `src/models/migrations.ts` | ✅ |
| Board state + debounced sync | `src/state/BoardContext.tsx`, `boardActions.ts` | ✅ |
| ETag conflict detection | `src/state/BoardContext.tsx` | ✅ |

### Phase 2 — Core board

| Item | Files | Status |
|---|---|---|
| Columns and cards CRUD | `src/components/Column.tsx`, `Card.tsx` | ✅ |
| Card editor modal | `src/components/CardEditor.tsx`, `Modal.tsx` | ✅ |
| Drag-and-drop (pointer/touch/keyboard) | `src/components/KanbanDndContext.tsx` | ✅ |
| Labels | `src/components/fields/LabelPill.tsx`, `LabelManager.tsx` | ✅ |
| Rich text | `src/components/fields/RichTextEditor.tsx`, `sanitize.ts` | ✅ |
| Custom fields (7 types) | `src/components/fields/Field*.tsx`, `src/models/fieldTypes.ts` | ✅ |
| Checklists | `src/components/fields/ChecklistEditor.tsx` | ✅ |
| Comments | `src/components/CommentThread.tsx` | ✅ |
| Activity log | `src/components/ActivityLog.tsx` | ✅ |

### Phase 3 — Structure and planning

| Item | Files | Status |
|---|---|---|
| Epic/Story/Task hierarchy | `src/models/relations.ts`, `cardTypeMeta.ts` | ✅ |
| Progress rollup | `src/models/progress.ts` | ✅ |
| Parent/child navigation | `src/components/ParentPicker.tsx`, `ChildrenList.tsx` | ✅ |
| Planner view | `src/views/PlannerView.tsx`, `plannerHelpers.ts` | ✅ |
| Editor column picker | `src/components/CardEditor.tsx` | ✅ |
| Draft persistence | `src/state/cardDrafts.ts` | ✅ |

### Phase 4 — Mobile

| Item | Files | Status |
|---|---|---|
| Collapsible icon rail sidebar | `src/components/Sidebar.tsx`, `styles/responsive.css` | ✅ |
| Vertical column rail (one column at a time) | `src/components/BoardView.tsx` | ✅ |
| Mobile cross-column drag overlay | `src/components/MobileColumnTargets.tsx` | ✅ |
| Bottom-sheet modals | `src/styles/responsive.css` | ✅ |
| Safe-area insets, no layout gaps | `src/styles/responsive.css` | ✅ |
| Collapsible sidebar sections | `src/components/Sidebar.tsx` | ✅ |

### Phase 5 — PWA and platform

| Item | Files | Status |
|---|---|---|
| Manifest + service worker | `vite.config.ts`, `src/pwa.ts` | ✅ |
| Offline app shell (Workbox) | `vite.config.ts` | ✅ |
| Update prompt (not forced) | `src/components/UpdateToast.tsx` | ✅ |
| Install prompt | `src/components/InstallPrompt.tsx` | ✅ |
| Web Share Target | `public/share-capture.html`, `src/share/shareInbox.ts` | ✅ |
| GitHub Pages subpath build | `vite.config.ts`, `.github/workflows/deploy.yml` | ✅ |
| Dark mode | `src/styles/tokens.css` | ✅ |

### Phase 6 — Quality and accessibility

| Item | Files | Status |
|---|---|---|
| E2E suite across 4 projects | `tests/e2e/`, `playwright.config.ts` | ✅ |
| Unit + integration suites | `src/**/*.test.ts`, `tests/unit/`, `tests/integration/` | ✅ |
| Fake Drive + fake GIS | `tests/fixtures/fakeDrive.ts`, `fakeAuth.ts` | ✅ |
| CI: typecheck, a11y, E2E | `.github/workflows/playwright.yml` | ✅ |
| **WCAG Sprint 1** — contrast tokens | `src/styles/tokens.css`, `scripts/check-contrast.js` | ✅ |
| **WCAG Sprint 2** — skip link, alt, lang | `src/components/AppShell.tsx` | ✅ |
| **WCAG Sprint 3** — DnD help, focus, targets | `DndKeyboardHelp.tsx`, `styles/` | ✅ |
| Colour literal linter | `scripts/lint-color-literals.js` | ✅ |

### Phase 7 — Find: search, filter and saved views

Shipped after Phases 1–6. Full design in
[`FILTER-SEARCH-SAVED-VIEWS-PLAN.md`](./FILTER-SEARCH-SAVED-VIEWS-PLAN.md);
flows in [APP-FLOW §11](./APP-FLOW.md#11-filter-search-and-saved-views).

| Item | Files | Status |
|---|---|---|
| Free-text search over title, description, labels, parent/child titles | `src/models/filters.ts` | ✅ |
| Type / label / date-range / done filters, AND-combined | `src/models/filters.ts` | ✅ |
| Search + filter toolbar, chip row, match-count badge | `src/components/FilterBar.tsx` | ✅ |
| Filter popover (desktop) and bottom sheet (mobile) | `src/components/FilterMenu.tsx` | ✅ |
| Saved views: capture, recall, update, delete | `src/models/savedViews.ts`, `src/state/savedViewActions.ts`, `src/components/SavedViewsMenu.tsx` | ✅ |
| View limits — ≤ 50 per board, names ≤ 60 chars, unique | `src/models/savedViews.ts` | ✅ |
| `Board.savedViews` persistence + migration | `src/models/migrations.ts` | ✅ |
| "Nothing matches" empty state with clear-all | `src/views/BoardView.tsx` | ✅ |
| Toolbar reflow fix (tablet) | `src/styles/components.css` | ✅ |
| CSS cascade fix — `components.css` before `responsive.css` | `src/main.tsx` | ✅ |

**Two defects found while building this, both worth recording.**

1. *Toolbar reflow.* `flex-wrap: wrap` let an active chip row push the filter bar
   onto its own row. The popover is anchored to that bar, so it was dragged away
   from the pointer mid-interaction — and because the transparent backdrop covers
   the viewport, the checkbox being reached for landed under the backdrop and
   became unclickable. Applying one filter silently blocked the next.
2. *Stylesheet cascade.* `src/main.tsx` imported `responsive.css` **before**
   `components.css`. Their selectors have equal specificity, so source order
   decided — and `components.css` won, making every `max-width` override in
   `responsive.css` dead on arrival. Symptom: the mobile filter sheet declared
   `width: 100%` yet measured 328 px on a 360 px viewport. The `min()` base rule
   was emitted after the media rule. Fixed by ordering the imports, with a
   comment at the import site explaining why the order is load-bearing.

**Measured performance** (`tests/perf/filter-perf.test.ts`, 2000-card board,
asserted against order-of-magnitude ceilings, not golden values):

| Operation | Cost |
|---|---|
| `visibleCardIds`, 2000 cards → 111 matches | 16.1 ms |
| `matchesSearch`, per card | 0.0079 ms |
| Type filter vs free-text, 2000 cards | 1.8 ms vs 13.4 ms |
| `htmlToText`, 700 cards | 12.7 ms |

The type filter is ~7× cheaper than free-text because it compares a string
field; free-text runs `htmlToText` over every rich-text description first.
That is why the label/type filters stay on the hot path and free-text is
debounced.

---

## 3. Verification strategy

Four gates, all automated. Nothing ships on "it looked right in the browser".

| Gate | Command | Catches |
|---|---|---|
| **Types** | `npm run typecheck` | Type errors |
| **Unit** | `npm run test:unit` | Domain logic, contrast maths, linter behaviour |
| **Accessibility** | `npm run a11y` | Contrast regressions; hardcoded colours |
| **E2E** | `npm run test:e2e` | User flows across 4 viewports |
| **Build** | `npm run build` | Production bundle, PWA artifact generation |

### 3.1 Accessibility is a gate, not a review item

`npm run a11y` runs two checks in CI:

- **`a11y:contrast`** — re-parses `tokens.css` and verifies every foreground
  against the worst-case background of its theme, plus the inverse "on-X"
  pairs and both non-token palettes.
- **`lint:colors`** — fails on any hex literal in `src/` outside a documented
  allowlist.

The second exists because the first is blind to colours written outside the
token file. It immediately found real defects — a duplicated `pickForeground`
with wrong maths in two components, and a hardcoded `#fff` on accent that
measured **2.85:1 in dark theme**.

### 3.2 Deliberate duplication in the test suite

`tests/unit/helpers/contrast.ts` is a **second, independent** implementation of
the contrast maths, separate from `scripts/check-contrast.js`. If both shared
one implementation, a bug in that implementation would cancel itself out and
both the build gate and the test suite would pass while the UI was unreadable.

---

## 4. Roadmap

### Sprint 4 — Testing and validation (P3) · **done, except 4.2 execution and 4.5 stability**

| ID | Item | Effort | Priority | Status |
|---|---|---|---|---|
| 4.1 | axe-core integration into the E2E suite | M | P1 | ✅ done |
| 4.2 | Manual screen-reader walkthrough (NVDA + VoiceOver) | M | P1 | ◐ protocol written, **not yet executed** |
| 4.3 | Lighthouse CI budget for the accessibility score | S | P2 | ✅ done |
| 4.4 | Visual-regression baselines for the three layouts | M | P2 | ✅ done (geometry assertions + capture) |
| 4.5 | Cross-browser run (Firefox, WebKit) | M | P2 | ◐ advisory in CI; Firefox green, WebKit green serially, flaky in parallel |
| 4.6 | Coverage thresholds in CI | S | P3 | ✅ done — raised from 50/70/60 to a 100% gate |

**4.1 — what axe-core found.** The scans (`tests/e2e/a11y-axe.spec.ts`)
cover the login screen, boards list, board view, card editor, planner, and
the board view in the dark colour scheme. The accepted-violation list is
**empty**; all nine rules it reported were fixed rather than allowlisted:

| Rule | Defect | Fix |
|---|---|---|
| `landmark-one-main`, `region` | Login screen had no `<main>` | `LoginScreen.tsx` now renders one |
| `label` (critical) | 5 sidebar checkboxes unlabelled | `aria-label` on each |
| `aria-prohibited-attr` | `aria-label` on a bare contenteditable div | `role="textbox"` + `aria-multiline` |
| `nested-interactive` | dnd-kit wrapper button inside the card button | DnD wiring moved onto the card root |
| `nested-interactive`, `aria-allowed-role`, `heading-order` | `<article role="button">` wrapping a delete button, with an `h3` after the page `h1` | Plain `<article>`, `h2` + stretched link, sibling delete button |
| `page-has-heading-one` | Planner view had no `h1` | Visually-hidden `h1` |
| `color-contrast` (×7) | Card-type colours unreadable in dark mode | New `--color-type-*` tokens, theme-aware |
| `color-contrast` (×3) | `opacity` dimming text below 4.5:1 | Background-based de-emphasis instead |

**4.2 — honestly incomplete.** The protocol exists in
`ACCESSIBILITY-TESTING.md` with per-step expected announcements, but no
screen-reader session has been run. The document says so explicitly and the
results table is empty by design. Automated verification is the only claim
kboard can currently make.

**4.4 — a deliberate scope decision.** Rather than golden-image diffing,
which needs a baseline commit per browser version and fails on font and
platform changes for reasons unrelated to the code, the spec asserts
*geometry* (real box dimensions, no horizontal overflow, side-by-side
columns) and writes screenshots to `test-results/` for human review.

**4.5 — engine findings, still open.** Firefox and WebKit surfaced no
*product* defects. The failures are environmental, and one of them is not yet
solved:

- axe-core's in-page analysis is synchronous and cannot be given its own
  deadline, so the 30s test timeout killed every Firefox scan with a
  *timeout* error rather than a violation. **Fixed** with a per-project
  `timeout: 90_000` on the two slow projects; the Chromium matrix keeps its
  tighter bound.
- WebKit's headless compositor crashes (`RenderCompositorSWGL failed mapping
  default framebuffer`) when run alongside Firefox on the shared CI runner.
  **Reproduced and now correctly attributed.** The signature was re-created
  exactly with `--workers=6 --retries=0` across both engines: 3 failures, 4
  compositor errors, all of them resource starvation (two Firefox tests hit
  `browserContext.close: Test timeout exceeded`; one WebKit poll timed out).
  There is no product defect here.

  What this note previously got wrong, and has been corrected: it described
  the failure as something that happens "in parallel", but **CI already runs
  this job serially.** `playwright.config.ts` sets
  `workers: process.env.CI ? 1 : undefined`, `CI` is always set on a GitHub
  runner, and the job passes no `--workers` flag. Parallelism only appears if
  someone passes it locally. See the corrected comment in
  `.github/workflows/playwright.yml` and §4.5c.

  Note this was, for a long time, *believed* to be a WebKit instability. It
  was not the whole story — see 4.5b below, where the same job was found to
  have been failing for a completely different reason, one that had nothing to
  do with the compositor.

**4.5b — the cross-browser job was failing for a non-product reason.** A CI
report showed **90 of 94 tests failing** (45 Firefox, 45 WebKit). Every one
carried the same error:

```
browserType.launch: Executable doesn't exist at
  /home/runner/.cache/ms-playwright/firefox-1538/firefox/firefox
```

Not a single test had run. The cause was in the workflow, not the suite: all
three Playwright browser caches across `playwright.yml` and `deploy.yml` used
**one key** derived only from `package-lock.json`.

```yaml
key: ${{ runner.os }}-playwright-${{ hashFiles('package-lock.json') }}
```

Whichever job saved first populated the cache with *its* browser set. Every
other job then saw `cache-hit=true`, **skipped `playwright install`**, and
tried to launch a browser it had never downloaded. The Chromium job saved a
Chromium-only cache; the cross-browser job restored it and looked for Firefox.

The `if: cache-hit != 'true'` guard is what turns a stale cache into a
permanent failure — it disables the one step that would have repaired it.

**Fixed** two ways, because either alone is incomplete:

1. The browser set is now part of the cache key
   (`-playwright-chromium-` vs `-playwright-ff-wk-`), so a cache hit can only
   ever satisfy a job that wants the same browsers.
2. `npx playwright install` is now **unconditional**. It is a no-op when the
   browsers are already present, and it self-heals a cache that is truncated,
   partially restored, or from a different Playwright version — none of which a
   cache-hit guard can do.

The failure was invisible to the test suite by construction: the cause was CI
wiring, so no test could have caught it. `scripts/check-workflows.py` now parses
the workflows and fails the build if a browser install is ever re-guarded by a
cache-hit condition or if the cache keys lose their browser scope. It runs in
the new `ci-wiring` job. Verified against the pre-fix file: it flags both
original conditional installs.

**Verified locally after the fix:** `npm run test:e2e:crossbrowser
-- --workers=1` is **94/94 passed** in 12.1 minutes. The cross-browser specs
were never broken; they had simply never launched a browser in CI. The
advisory status remains (see the WebKit compositor note above), but the job now
produces a real signal instead of 90 launch failures.

**4.5c — run 36717935031: two defects, one of them not where it looked.**
With the browsers actually launching, the cross-browser job reported **28
failed / 65 passed**. Both causes turned out to be *in the tests*, not the
product — with one partial exception that is worth reading.

*The contrast "failure" was a measurement race, not a palette defect.* axe
reported the column background as #2f363d and #373e45. Neither hex exists in
the source. Both are exact points on the `#ebecf0 → #2c333a` interpolation
(t=0.985 and t=0.940) — i.e. the page was **mid-transition** when it was
scanned. `expectNoAxeViolations` calls `page.emulateMedia({ colorScheme })`
on an *already-loaded* page, and `.kanban-column` carries
`transition: background var(--motion-fast)` (120ms), so switching the media
feature repaints every themed surface through its transition. A scan landing
inside that 120ms window measures a colour belonging to neither palette.

The original `--color-text-muted: #8c9bab` was **not** the culprit, but it
was a real latent risk: it measured 4.5024:1 on `#2c333a`, clearing the bar by
0.0024, so any compositing would drop it under 4.5:1. It is now `#9dabba`
(4.63:1 worst case) and `#2c333a` is in both audit lists, so the token has
genuine headroom rather than passing by a rounding artefact. The helper now
waits for the transition to settle before scanning; verified 24/24 axe tests
green across Chromium, Firefox and WebKit. `.planner-day` has the same
transition and the same exposure.

*A harness defect, not a product one.* The other 27 failures all died on one
line: `boardPage.createBoard()` hardcoded `{ timeout: 5_000 }`. A per-call
timeout **overrides** the project setting, so it silently cancelled the 15s
that firefox-smoke and webkit-smoke deliberately grant; WebKit board specs took
~24s each on the loaded runner. All 15 literals in the page object were removed
so each helper inherits its project's budget. Recorded in the NOTE ON WAIT
TIMEOUTS comment in `tests/helpers/boardPage.ts`: a per-call timeout in a
shared page object defeats project-level timeout configuration.

**4.5d — fixing 4.5c made the job exceed its own timeout.** Run 36725258569
reported the cross-browser job **cancelled at 25m22s** — `timeout-minutes: 25`
exactly. Not a test failure and not a regression: it is the direct consequence
of the 4.5c fix, and the arithmetic closes exactly.

The 25m ceiling had been calibrated against a suite that was *artificially
fast*. In run 36717935031, 28 tests were aborting 5 seconds in on the
hardcoded `waitForSelector` timeout, so the job finished in **14m57s** having
skipped most of its own work. Removing those literals made every one of those
tests run to completion for the first time. CI measured the affected WebKit
board specs at ~24s each, so ~28 of them added roughly **11 minutes** of real
runtime:

```
13.6m (old test phase, mostly fast-failing) + 11.2m = ~24.8m  ->  25m22s, cancelled
```

A harness fix that makes tests actually run is *supposed* to increase runtime;
the timeout was the thing that was wrong. `timeout-minutes` is now **40**,
covering the 12.9m serial test phase plus ~5m of setup, with headroom for
slower GitHub runners.

The general trap, worth keeping: **a timeout budget that has been observed to
"fit" is only meaningful if the job was doing its full work while it fit.**
This one fit comfortably against a run that was quietly skipping 28 tests, so
it was calibrated to a lie.

**4.6 — raised from a floor to a 100% gate.** The original thresholds
(lines 50, branches 70, functions 60) were a deliberate floor chosen to sit
just under measured values while `src/state/*actions.ts` had no unit coverage
at all. That gap is now closed: `fieldActions`, `typeActions`, `cardActions`,
`boardActions`, `actionsIndex` and `cardDrafts` are all at 100%, and the
thresholds are 100 across statements, branches, functions and lines. 518 unit
tests.

Closing it surfaced five real defects that no amount of E2E had caught, because
each one is invisible from the outside — the UI updates correctly while the
data is wrong:

| Defect | Impact |
|---|---|
| `patchCard` rebuilt the activity log from `existing.activity`, discarding the `activity` passed in the patch | Every checklist, comment and label change applied to the card but left **no audit entry** |
| `removePresetOption` passed `customFields` through untouched | Deleting a preset option from a **board-level** field left the option visible in the picker while every card had silently lost its value |
| `normalizeCard` cast `labelIds` without filtering, while `parentIds` was filtered | A hand-edited Drive file could put a non-string in `labelIds` and crash the card face |
| `normalizeBoard` mapped `columns` without a null check | A `null` column entry threw a `TypeError` during render, not at load |
| `defaultDoneColumnIds` pushed `undefined` for an id-less "Done" column | `doneColumnIds` could contain `undefined` |

Four provably-dead guards were also **deleted** rather than covered — a test
that has to contrive an impossible input (a `new Date(string)` that throws, a
`parseInt` of a regex-validated hex, an SSR `typeof window` check in a
browser-only bundle) is a maintenance liability, not coverage. See
`vitest.config.ts` for the reasoning and the scope decision.

**E2E quarantine.** One test is marked `test.fixme`:
`Adding a parent from a Task creates a Story card pre-linked (bidirectional)`
in `tests/e2e/hierarchy-progress.spec.ts`. It was flaky on `chromium-mobile`
only, passing in isolation and failing under load — the assertions race a
debounced save roundtrip against an editor re-mount. The underlying behaviour
is covered by unit tests on `addCardWithParent` in both directions, so this is
a test-harness problem, not a product one. The original implementation is kept
commented next to the marker for the eventual timing-robust rewrite.

**Landing already complete from earlier work:** the `a11y` CI job, the colour
linter, 155 unit tests including a dedicated contrast suite, and E2E
assertions for keyboard DnD, focus visibility, alt text and touch targets.

**Why axe-core is P1:** automated checks catch roughly a third of real
accessibility problems. It will not find a confusing label, a bad reading
order, or a control that announces the wrong thing — which is why 4.2 is
equally prioritised.

### Sprint 5 — AAA enhancements (P4, aspirational) · not started

Each item is **opt-in per team** rather than default. Forcing 7:1 on every
token requires hues such as `#743a00` that read as brown, so AAA is a choice,
not a default.

| ID | Item | Criterion | Status |
|---|---|---|---|
| 5.1 | Enhanced contrast tier | 1.4.6 (7:1) | 🔲 Opt-in palette behind a setting |
| 5.2 | Identify input purpose | 1.3.5 | 🔲 `autocomplete` tokens on identity fields |
| 5.3 | Identify purpose programmatically | 1.3.6 | 🔲 Landmark labelling |
| 5.4 | Breadcrumbs / location | 2.4.8 | 🔲 |
| 5.5 | Context-sensitive help | 3.3.5 | 🔲 The shortcut panel partially covers this |
| 5.6 | Reading level | 3.1.5 | 🔲 |
| 5.7 | User control of text presentation | 1.4.8 | 🔲 Deferred — the real requirement is 1.4.12 |
| 5.8 | Sign language | 1.2.6–1.2.8 | ⛔ **Not applicable** — no synchronized media in the product |

### v2 — Product features · not started

| Item | Rationale |
|---|---|
| Board sharing and invitations | Currently two people can only collide on the same Drive file |
| Multi-select and bulk operations | The main missing ergonomic feature |
| Recurring cards | Common planning need |
| Board templates | Onboarding friction |

### v3 — Exploratory · not committed

| Item | Note |
|---|---|
| Optional self-hosted sync backend | Would enable real-time collaboration. Deliberately avoided so far: it reintroduces the server the product exists without. |
| CRDT-based offline merge | Removes the last-write-wins limitation without a backend |

---

## 5. Technical debt

| Item | Impact | Plan |
|---|---|---|
| Bundle ~750 kB (230 kB gzipped) | First load | Code-split Tiptap; it dominates |
| Whole-file writes | Amplification on very large boards | Revisit past ~2000 cards |
| No cross-tab sync | Two tabs can diverge | Drive revalidation reconciles; `BroadcastChannel` is the cheap fix |
| Legacy field key `customFieldValues` | Handled in `normalizeBoard` | Remove once no live board uses it |
| Test selectors in `BoardPage` prompt-based | Brittle | Low priority |
| AAA not implemented | Fails 1.4.6 for teams needing it | Sprint 5 |

---

## 6. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Google changes Drive API behaviour | Low | Thin client isolates the blast radius |
| `appDataFolder` becomes unusable | Very low | Files are plain JSON; a migration path exists |
| Board too large for a single file | Low | Drive handles MB-scale files comfortably |
| Silent edit loss in concurrent editing | **Medium** | Detected via ETag and surfaced; not prevented |
| Accessibility regressions from new UI | Medium | Now blocked by CI rather than by convention |
| Token expiry mid-session | Low | Proactive refresh + single `401` retry |

---

## 7. Definition of done

A change is complete when:

1. `npm run typecheck` passes.
2. `npm run test:unit` passes.
3. `npm run a11y` passes.
4. `npm run test:e2e` passes on all four projects — or, if a project is
   legitimately skipped, the skip is asserted **in the test**, not assumed.
5. `npm run build` succeeds and PWA artifacts are generated.
6. New user flows have E2E coverage; new functions have unit tests.
7. No new accessibility barrier is introduced — and if one is, it is
   documented with its justification.

---

## 8. Related documents

- [PRD](./PRD.md) — scope and success metrics
- [TRD](./TRD.md) — architecture
- [App Flow](./APP-FLOW.md) — screens
- [UX/UI Design](./UX-UI-DESIGN.md) — design system
- [Data Model](./DATA-MODEL.md) — schema
- `WCAG_AA_AUDIT_REPORT.md` and `WCAG_AA_ENHANCEMENT_PLAN.md` (repo root) —
  the detailed accessibility audit and sprint breakdown
