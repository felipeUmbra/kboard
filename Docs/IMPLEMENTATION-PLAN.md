# Kboard — Implementation Plan

Delivery roadmap, current status, and the work that remains. Written to be
actionable: every item names its files and its verification.

---

## 1. Current state

| | |
|---|---|
| **Version** | 0.1.0 |
| **Status** | v1 feature-complete and verified |
| **Commits** | 56 |
| **Tracked files** | 140 |
| **Unit/integration tests** | 155 passing, 11 files |
| **E2E tests** | 325 passing, 4 projects |
| **Type errors** | 0 |
| **Contrast failures** | 0 (all tokens, both themes) |
| **Hardcoded colour literals** | 0 |

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

### Sprint 4 — Testing and validation (P3) · **partially done**

| ID | Item | Effort | Priority |
|---|---|---|---|
| 4.1 | axe-core integration into the E2E suite | M | P1 |
| 4.2 | Manual screen-reader walkthrough (NVDA + VoiceOver) | M | P1 |
| 4.3 | Lighthouse CI budget for the accessibility score | S | P2 |
| 4.4 | Visual-regression baselines for the three layouts | M | P2 |
| 4.5 | Cross-browser run (Firefox, WebKit) | M | P2 |
| 4.6 | Coverage thresholds in CI | S | P3 |

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
| Filters and saved views | Scales past ~500 cards |

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
