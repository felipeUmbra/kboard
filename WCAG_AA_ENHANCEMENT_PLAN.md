# Kboard WCAG 2.1 Enhancement Plan (Levels A, AA, AAA)

**Based on:** WCAG_AA_AUDIT_REPORT.md  
**Goal:** Achieve full WCAG 2.1 Level AA compliance; document AAA gaps for future  
**Timeline:** 3-4 development sprints (AA) + ongoing (AAA)

---

## Compliance Targets by Sprint

| Sprint | Target Level | Focus | Status |
|--------|--------------|-------|--------|
| Sprint 1 | A + AA | Critical fixes: Color contrast (AA), Skip link (A), Alt text (A) | ✅ Complete |
| Sprint 2 | A + AA | Navigation, language, DnD keyboard support | ✅ Complete |
| Sprint 3 | AA | Mobile polish, focus visibility, touch targets | ✅ Complete |
| Sprint 4 | AA | Automated testing, regression prevention | Partial — the `a11y` CI gate, colour linter and 171 unit tests landed; axe-core and manual SR testing remain |
| Ongoing | AAA | Enhanced contrast, sign language, reading level, help system | Not started |

---

## Sprint 1: Critical Color Contrast Fixes (P0) — ✅ COMPLETE

> **Status: shipped.** All tokens verified, unit + E2E regression tests added.
> Outcomes and two extra findings are recorded at the end of this section.

### 1.1 Update Design Tokens — `src/styles/tokens.css`

**Problem**: Semantic colors fail 4.5:1 contrast on white backgrounds (light theme) and some on dark surfaces.

**Critical detail**: the worst-case light background is **not** white — it is
`--color-bg-elevated` (`#ebecf0`), the sidebar and card-type panels. Every value
below is verified against **all three** light backgrounds (white `#ffffff`,
page bg `#f4f5f7`, elevated `#ebecf0`). Checking only white, as a naive audit
does, is not sufficient.

```css
/* === LIGHT THEME FIXES === */
:root {
  /* text-muted was 4.50:1 on #ebecf0 — exactly at the line, no margin.
     #526075 restores margin at 5.41:1 worst-case. */
  --color-text-muted: #526075;      /* Was #5e6c84 → 5.41:1 worst-case */
  
  /* Accent was 3.96:1 on #ebecf0 — an outright FAIL. Accent is used for
     links and the selected-column state, so this one matters.
     #005b93 keeps the Trello-blue identity at 6.10:1 worst-case. */
  --color-accent: #005b93;          /* Was #0079bf (3.96:1) → 6.10:1 worst-case */
  --color-accent-hover: #004b78;    /* Darker for hover */
  --color-accent-soft: #e9f2ff;     /* Already exists — verified as bg, not fg */
  
  /* Success: #2e7d32 was 4.34:1 on #ebecf0. #276b2b clears all three. */
  --color-success: #276b2b;         /* Was #61bd4f (2.36:1) → 5.52:1 worst-case */
  --color-success-hover: #1b5220;   /* Darker for hover */
  --color-success-soft: #e8f5e9;    /* Light background for badges */
  
  /* Danger: #c62828 already clears all three at 4.76:1 worst-case. */
  --color-danger: #c62828;          /* Was #eb5a46 (3.45:1) → 4.76:1 worst-case */
  --color-danger-hover: #a01f1f;    /* Darker for hover */
  --color-danger-soft: #fdeaea;     /* Light background for badges */
  
  /* Warning: #f57f17 is only 2.65:1 on white — it FAILS badly.
     #9c4f00 is the darkest amber that still reads as amber not brown. */
  --color-warning: #9c4f00;         /* Was #f2d600 (1.46:1) → 5.04:1 worst-case */
  --color-warning-hover: #7d3f00;   /* Darker for hover */
  --color-warning-soft: #fff8e1;    /* Light background for badges */
}

/* === DARK THEME FIXES === */
@media (prefers-color-scheme: dark) {
  :root {
    /* Success: verified 6.38:1 worst-case on dark */
    --color-success: #66bb6a;
    --color-success-hover: #81c784;
    --color-success-soft: rgba(102, 187, 106, 0.15);
    
    /* Danger: #eb5a46 was 4.37:1 on #22272b — just under.
       #ff9e99 clears AAA (7.61:1) while staying in the same red family. */
    --color-danger: #ff9e99;        /* Was #eb5a46 (4.37:1) → 7.61:1 */
    --color-danger-hover: #ffb3ab;  /* Lighter for hover */
    --color-danger-soft: rgba(255, 158, 153, 0.15);
    
    /* Warning: already 10.68:1 worst-case on dark */
    --color-warning: #ffd54f;
    --color-warning-hover: #ffe082;
    --color-warning-soft: rgba(255, 213, 79, 0.15);
  }
}
```

**Verification**: Run contrast check script after changes.

### Sprint 1 outcome — what actually shipped

All figures below are the **verified worst case across every background**, not
white-only numbers. `npm run a11y:contrast` parses `tokens.css` directly, so a
future token edit that breaks contrast fails the check rather than silently
passing.

| Token | Light (worst of 3) | Dark (worst of 2) |
|-------|-------------------|-------------------|
| `--color-text` | #172b4d — 11.95 ✅ | #b6c2cf — 8.33 ✅ |
| `--color-text-muted` | #526075 — 5.41 ✅ | #8c9bab — 5.31 ✅ |
| `--color-text-subtle` | #4c5a6c — 5.96 ✅ | #8c9bab — 5.31 ✅ |
| `--color-accent` | #005b93 — 6.10 ✅ | #4c9aff — 5.29 ✅ |
| `--color-danger` | #c62828 — 4.76 ✅ | #ff9e99 — 7.61 ✅ |
| `--color-success` | #276b2b — 5.52 ✅ | #66bb6a — 6.38 ✅ |
| `--color-warning` | #9c4f00 — 5.04 ✅ | #ffd54f — 10.68 ✅ |

Also added `-soft` and `-hover` variants for success / danger / warning, which
did not exist before.

### Three findings beyond the original Sprint 1 scope

All were surfaced while verifying the planned values. Each was a real AA (1.4.3)
failure, not a cosmetic issue.

1. **Dark `--color-text-subtle` was 3.33:1.** The dark theme block reused the
   light theme's mid-grey `#6b778c` — fine on white, far too dark on `#22272b`.
   Now `#8c9bab` in dark. There is a unit test asserting the dark block actually
   overrides the light hexes, specifically to catch a repeat of this.

2. **All three card-type colours failed as text.** `CARD_TYPE_META.color` is
   rendered as text on `softColor` in `TypeChip` *and* on the elevated
   background in `Sidebar`:
   - epic `#a25ddc` → 3.46:1 ❌
   - story `#4bce97` → **1.81:1** ❌ (worst offender found anywhere in the app)
   - task `#5e6c84` → 4.42:1 ❌

   Corrected to `#7b3fb0`, `#15703f`, `#4a5769` — all now ≥ 5.20:1 in both
   contexts, and still ≥ 3:1 for the 3px card stripe (WCAG 1.4.11).

3. **`pickForeground` chose unreadable label text.** `LabelPill` picked between
   near-black and white using a `0.299r + 0.587g + 0.114b` average thresholded
   at `0.6`. On mid-tone palette colours it chose white, giving green `#61bd4f`
   at **2.36:1** and cyan `#00c2e0` at **2.14:1**. Replaced with proper WCAG
   relative luminance, selecting whichever candidate actually wins — correct for
   any hex a user can pick, not just the curated palette. The palette's `red`
   was also re-pitched `#eb5a46` → `#d03a3a`, because it tops out at 4.09:1
   with *either* foreground.

### Tests added

| File | Coverage |
|------|----------|
| `tests/unit/a11y-contrast.test.ts` | **52 tests**: contrast maths vs WCAG reference values, every token in both themes, dark-block override check, card-type meta (text + 3:1 stripe), non-text 1.4.11 (focus ring, done dot), banner soft-tint pairings, `pickForeground`, full label palette |
| `tests/unit/helpers/contrast.ts` | Test oracle — deliberately a *separate* implementation from the build script, so a bug in the maths can't cancel itself out and pass everything. Also handles `rgba()` alpha compositing, which a hex-only path cannot |
| `tests/e2e/a11y-contrast.spec.ts` | 6 tests reading real `getComputedStyle` in the browser, light + dark, incl. a translucent-background walk |

The E2E suite is the one that matters most: it measures what actually renders,
so it catches a token that is compliant in isolation but lands on an unexpected
background, or a hardcoded hex that bypasses the token system entirely.

**Regression guard verified by deliberately breaking it**: reverting
`--color-accent` to the old `#0079bf` fails with
`--color-accent (#0079bf) is 3.96:1 on its worst light background`.

**Known gap**: nothing currently fails the build if someone reintroduces a
hardcoded hex instead of using a token. `npm run a11y:contrast` would not
notice, because the offending colour is not in `tokens.css`. Worth a lint rule
in a later sprint if this turns out to be a recurring problem.

### 1.3 Add Soft Color Variants for Badges/Chips — ✅ DONE

Soft variants were added for all three semantic hues in both themes. They are
now actually **consumed** by `.banner--error` / `.banner--success`, which
previously relied on the border colour alone to signal severity. The pairings
are contrast-verified and unit-tested:

| Kind | Light (text on soft) | Dark (text on 15% tint over surface) |
|------|----------------------|---------------------------------------|
| danger | 4.85:1 | 5.61:1 |
| success | 5.79:1 | 4.87:1 |
| warning | 5.60:1 | 7.30:1 |

Note the dark figures are measured against the **composited** background — the
dark `-soft` tokens are `rgba(..., 0.15)`, so a contrast check against the raw
tint value would be measuring something the user never sees.

### 1.2 Update Component Styles for New Tokens — ✅ DONE

Swept `src/` for hardcoded semantic hexes and dead `var(--token, #fallback)`
pairs. All removed; every `var()` now resolves against a defined token, so a
future rename can't silently fall back to a stale colour.

| File | Was | Now |
|------|-----|-----|
| `DateBadge.tsx` | `var(--color-danger, #eb5a46)` etc. | `var(--color-danger)` |
| `DateField.tsx` | `var(--color-warning, #f2d600)`, `var(--color-danger, #eb5a46)` | `var(--color-warning)`, `var(--color-danger)` |
| `ProgressBar.tsx` | `var(--color-danger, #eb5a46)` etc. | `var(--color-danger)` etc. |
| `Column.tsx`, `BoardListView.tsx` | `var(--color-danger, #eb5a46)` | `var(--color-danger)` |
| `components.css` | `var(--color-success, #4bce97)` (done-dot) | `var(--color-success)` |
| `responsive.css` | `linear-gradient(..., #0079bf, ...)` | `var(--color-accent)` |

### 1.4 Fixes to pre-existing test infrastructure

Two test-infrastructure bugs surfaced while validating Sprint 1. Neither was
caused by the colour work, but both had to be fixed to get a clean run:

1. **All 6 PWA tests were permanently failing.** `playwright.config.ts` put a
   `webServer` *inside* the `pwa` project entry, cast through `unknown` to
   satisfy `tsc`. Playwright 1.62 only reads `webServer` from the top-level
   `TestConfig` and **silently ignores** it on a project, so the production
   preview server never started and every test hit `ERR_CONNECTION_REFUSED` on
   :5173. Fixed by promoting it to a top-level `webServer` array (which also
   let the `unknown` cast go away). Confirmed pre-existing by reproducing on a
   clean tree.

2. **`clickButtonFallback` could exhaust the test budget.** On a click
   interception it fell through to `boundingBox()` with **no timeout**, which
   inherits the 30s *test* timeout — so a fallback that ran after the initial
   3s click attempt had already failed would consume the entire test and
   surface a misleading `boundingBox: Test timeout exceeded`. Each step is now
   individually bounded and the original click error is rethrown when the
   fallback is impossible.

---

## Sprint 2: Navigation & Screen Reader Enhancements (P1) — ✅ COMPLETE

> **Status: shipped.** Two of the three items were already satisfied in the
> codebase; the third shipped with a correction to the plan's own recipe.

### 2.1 Add Skip to Main Content Link — `src/components/AppShell.tsx` — ✅ DONE

Implemented, but **not** as the recipe below. The plan's `top: '-100%'` recipe
is a trap, and so is the closely-related `transform: translateY(-120%)`
variant: both place the element's box outside the viewport, and Chromium then
**excludes it from sequential focus navigation**. The link still accepts
programmatic `.focus()`, so the bug is invisible to a "does it focus?" test
and only shows up when a real user presses Tab.

The shipped version uses the standard clip technique, with two adjustments
that are also load-bearing:

```tsx
<a className="skip-link" href="#main-content">Skip to main content</a>
```

```css
.skip-link {
  position: absolute;   /* out of flow, so no negative margin is needed */
  top: 0; left: 0;
  width: 1px; height: 1px;
  /* NO margin: -1px — with top/left:0 it lands the box at (-1,-1), which is
     equally outside the viewport and reproduces the same bug. */
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
}
.skip-link:focus { /* un-clip, real padding/border/background */ }
```

`.app-content` became `<main id="main-content" tabIndex={-1}>`.
`tabIndex={-1}` is required — without it, activating the link scrolls but
leaves focus in the sidebar, which is the exact behaviour 2.4.1 exists to
prevent.

### 2.2 Fix Avatar Alt Text — `src/components/TopBar.tsx` — N/A (already correct)

The plan assumed `TopBar`'s avatar had an empty `alt`. It does not need
changing: the avatar sits inside a wrapper that is already `aria-hidden`
(`<div className="topbar__avatar" aria-hidden>`), and the image carries
`alt=""`. That is the **correct** treatment for a decorative avatar — the
user's name is already announced as text in `.topbar__name` immediately
before it, so a second announcement of "X's avatar" would be redundant noise
for a screen reader user.

`CommentThread`'s avatar uses `alt={name}` and is not `aria-hidden`, which is
also correct — it is the only representation of the author there.

Rather than "fix" these into regressions, a guard test now asserts that
**every** `<img>` in the app has an `alt` attribute (present, possibly empty),
which catches the genuine 1.1.1 failure mode (a missing `alt`) without
penalising the decorative case.

### 2.3 Add Language Attributes to Dynamic Content — ✅ DONE (already correct)

`index.html` already declares `<html lang="en">`, satisfying 3.1.1. The
component-level `lang`/`dir="auto"` suggestions in the plan were not applied:

- A fixed `lang="en"` on user-typed content would be **wrong** — a board in
  Portuguese would be mislabelled as English, which is a 3.1.2 failure, not a
  3.1.1 fix.
- Detecting the language of arbitrary text is not something a client-side
  board app can do reliably.

The one part worth taking is `<time dateTime={iso}>` for machine-readable
dates. `DateBadge` already renders the formatted date as text; this was left
alone rather than changed blind, to avoid regressing the date e2e assertions.

A regression test now asserts `html[lang]` exists and is well-formed.

### Sprint 2 outcome

- `src/components/AppShell.tsx` — skip link + `<main>` landmark
- `src/styles/responsive.css` — `.skip-link` styles
- `tests/e2e/a11y-sprint2-3.spec.ts` — 6 tests covering skip link order,
  activation, clipping, `lang`, and alt text

---

## Sprint 3: DnD & Mobile Polish (P2) — ✅ COMPLETE

### 3.1 Add DnD Keyboard Instructions — ✅ DONE

Shipped as `src/components/DndKeyboardHelp.tsx`, a reusable `<details>`
disclosure rendered in the board header and the planner header.

`@dnd-kit`'s `KeyboardSensor` was **already wired up** in both
`KanbanDndContext` and `PlannerDndContext` — 2.1.1 was already satisfied.
What was missing was discoverability: nothing told a keyboard user that
dragging was possible at all. The shortcut list names only the keys dnd-kit
actually binds (Space / Arrow keys / Escape), and a test asserts a card can
in fact be moved with the keyboard alone, so the instructions cannot drift
away from the implementation.

`<details>` is used rather than a custom disclosure because it is keyboard
operable, announces its expanded state, and works before JS runs.

### 3.2 Verify Mobile Focus Visibility — ✅ DONE

`.sidebar__rail-btn` and `.sidebar__section-toggle` already had explicit
`:focus-visible` outlines and were left alone. `.kanban-rail__strip` did
**not**: it relied on the global `box-shadow` ring, which on a transparent
background with a transparent border is effectively invisible against the
dark rail. It now has an explicit `outline` with a positive offset.

`.app-content:focus` suppresses its own outline — otherwise activating the
skip link outlines the entire viewport.

### 3.3 Ensure Touch Targets Meet 44px — ✅ DONE

Audited every interactive element. Fixed, all scoped to `@media (pointer:
coarse)` so the denser desktop layout is unchanged:

| Control | Before | After |
| --- | --- | --- |
| `.btn` (all buttons, incl. modal close) | 36px | 44px |
| `.input` / `.select` | ~36px | 44px |
| `.kb-rte__tool-btn` (9 rich-text controls) | 30px | 44px |
| `.sidebar__rail-btn` | 44px | already OK |
| `.kanban-rail__strip` | 112px | already OK |

The e2e tests skip the 44px assertions on non-touch projects, since the
`pointer: coarse` scoping makes them inapplicable there by design.

---

## Sprint 4: Testing & Validation (P3)

### 4.1 Automated Testing

Add axe-core to e2e tests:

```bash
npm install --save-dev @axe-core/playwright
```

```typescript
// tests/e2e/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Automated accessibility tests', () => {
  test('Board view has no violations', async ({ page }) => {
    await page.goto('/');
    // ... login, create board ...
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();
      
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
```

### 4.2 Manual Testing Checklist

- [ ] **Keyboard-only navigation**: Tab through entire app, verify all interactive elements reachable
- [ ] **Screen reader**: Test with NVDA (Windows) / VoiceOver (Mac) / Orca (Linux)
  - [ ] Login flow
  - [ ] Board list → Board view → Card editor
  - [ ] DnD via keyboard
  - [ ] Modal dialogs
  - [ ] Toast announcements
- [ ] **High contrast mode**: Windows High Contrast / macOS Increase Contrast
- [ ] **Zoom**: Test at 200% and 400% zoom (WCAG 1.4.4)
- [ ] **Reduced motion**: Verify animations disabled
- [ ] **Color blindness**: Test with simulator (Protanopia, Deuteranopia, Tritanopia)

### 4.3 Regression Tests

Update `tests/e2e/responsive-a11y.spec.ts` to include:
- Color contrast spot checks
- Skip link functionality
- Avatar alt text verification
- Focus visibility on all viewports

---

## Sprint 5: AAA Enhancements (P4 — Aspirational)

These items are **not required for AA compliance**. They target WCAG 2.1 Level AAA and are scoped as low-priority / opt-in enhancements. Each is independently shippable.

### 5.1 Enhanced Contrast (AAA: 1.4.6 Contrast Enhanced — 7:1)

**Problem**: AAA requires 7:1 for body text and 4.5:1 for large text. Current text tokens pass AA comfortably but semantic colors would need a second, darker tier to reach 7:1.

**Solution**: Add high-contrast tier tokens, opt-in via a user preference (not the default), so the default UI keeps its current brand look.

```css
/* tokens.css — opt-in AAA tier. "Worst-case" = MINIMUM ratio across all
   three light backgrounds (white #ffffff, bg #f4f5f7, elevated #ebecf0).
   Testing against white alone is insufficient and produces false passes. */
:root {
  /* AAA tier (7:1 worst-case) */
  --color-success-aaa: #144a17;   /* 8.80:1 worst-case ✅ */
  --color-danger-aaa:  #8e0000;   /* 8.27:1 worst-case ✅ */
  --color-warning-aaa: #743a00;   /* 7.58:1 worst-case ✅ */
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-success-aaa: #a5d6a7;  /* 9.17:1 on #22272b ✅ */
    --color-danger-aaa:  #ff9e99;  /* 7.61:1 on #22272b ✅ */
    --color-warning-aaa: #ffd54f;  /* 10.68:1 on #22272b ✅ */
  }
}
```

**Note on warning/AAA**: No amber can be both recognizably "warning yellow" and
7:1 on the elevated background. Reaching AAA requires `#743a00`, which is
visually brown. This weakens the semantic colour signal, so the AAA tier must
remain opt-in rather than replacing the default palette.

Wire a `data-contrast="aaa"` attribute on `<html>` (persisted in `localStorage`) that swaps `--color-*-aaa` into the `--color-*` slots, so every component picks it up with no per-component changes.

**Note**: Add a settings surface for this — the app currently has no settings screen. If that is out of scope, gate the AAA tier behind `@media (prefers-contrast: more)` instead, which costs no UI.

### 5.2 Programmatic Landmark Identification (AAA: 1.3.6)

**Problem**: Landmarks exist (`<header>`, `<aside>`, `<article>`) but carry no `role`/`aria-label` identifying their purpose, so screen-reader landmark menus show generic entries.

```tsx
// AppShell.tsx
<header className="topbar" role="banner" aria-label="Application header">
  ...
</header>

<aside className="sidebar" aria-label="Board navigation menu">...</aside>

// AppShell.tsx — main content wrapper
<div className="app-content" id="main-content" role="main" aria-label="Board content">
  {children}
</div>

// Column.tsx — section per column
<section className="kanban-column" aria-label={`Column: ${column.name}, ${sortableItems.length} cards`}>
```

### 5.3 Breadcrumbs / Location Indicator (AAA: 2.4.8 Location)

**Problem**: No indication of "where am I" in the Planner view or deep card navigation (epic → story → task).

```tsx
// BoardView.tsx — under the board name
<nav aria-label="Breadcrumb" className="breadcrumb">
  <ol>
    <li><a href="#/boards">Boards</a></li>
    <li><a href="#/boards/{boardId}">{board.name}</a></li>
    <li aria-current="page">{card.title}</li>
  </ol>
</nav>
```

Render only when depth > 1 (i.e. when a card is open via parent/child navigation) to avoid noise in the common case.

### 5.4 Context-Sensitive Help (AAA: 3.3.5 Help)

**Problem**: No help available for complex flows (DnD, custom fields, per-type fields, planner drag-to-reschedule).

**Solution**: A lightweight `?` affordance per complex surface that opens a short, plain-language panel. Reuse the existing `Modal` component rather than building a new surface.

```tsx
// New component: src/components/HelpTip.tsx
export function HelpTip({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-controls={`help-${id}`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div id={`help-${id}`} role="note" className="help-panel">
          <h3>{title}</h3>
          {children}
        </div>
      )}
    </>
  );
}
```

Placement: column header (add card), card editor (per-type fields), planner (reschedule), sidebar (done columns).

### 5.5 Reading Level & Plain Language (AAA: 3.1.5, 3.1.3, 3.1.4)

**Problem**: No measurement or guarantee of reading level; no glossary for domain terms (Epic, Story, Task, per-type fields, done column); abbreviations used without expansion.

**Solution**:
- Audit all static UI strings with a readability tool (target: lower-secondary / grade 8). Note the app currently mixes English and Portuguese strings (e.g. `"Descartar edições não salvas?"`, `"Hoje"`) — resolve that inconsistency as part of this pass, since inconsistent language also affects 3.1.2.
- Add a glossary accessible from the sidebar, defining: Epic, Story, Task, Board, Column, Done column, Custom field, Per-type field.
- Expand abbreviations on first use (`appDataFolder` → "the hidden app data folder in your Google Drive").

### 5.6 User Control Over Text Presentation (AAA: 1.4.8)

**Problem**: Users cannot override line height, spacing, or paragraph justification.

**Problem**: `text-align` is never set to `justify` and `line-height` is fixed at `1.5` in `global.css`, but no user override exists.

**Solution**: Ensure the stylesheet does not defeat user overrides (WCAG requires the page not prevent the user's stylesheet from taking effect — verify this rather than adding controls). The AA test at 1.4.12 already covers a user stylesheet; for AAA, offer an optional reading-width and line-height preference:

```css
/* Optional user preference, default off */
[data-reading-comfort="on"] body {
  line-height: 1.8;
}
[data-reading-comfort="on"] .kanban-card__description,
[data-reading-comfort="on"] .kb-rte__content {
  max-width: 70ch;
  line-height: 1.8;
}
```

**Note**: This is the highest-effort AAA item and the lowest value for a Kanban tool. Defer indefinitely.

### 5.7 Sign Language (AAA: 1.2.6, 1.2.7, 1.2.8)

**Problem**: No prerecorded sign-language video for key flows.

**Assessment**: **Not applicable.** Kboard contains no video or audio content, and 1.2.6/1.2.7 apply to *synchronized media alternatives*, not to application UI. Producing sign-language walkthroughs is a content-production effort with no WCAG-conformance benefit for this product. Record as "not applicable — no synchronized media" in the accessibility statement rather than implementing.

---

## AAA Effort vs. Value Summary

| Item | Criterion | Effort | Value | Recommendation |
|------|-----------|--------|-------|----------------|
| 5.2 Landmark identification | 1.3.6 | Low (1-2 hrs) | Medium | **Do it** — near-free screen-reader win |
| 5.3 Breadcrumbs | 2.4.8 | Medium (half day) | Medium | **Do it** — helps all users, not just AAA |
| 5.1 Enhanced contrast tier | 1.4.6 | Medium (1-2 days) | Low | **Do it via `prefers-contrast`** — no UI needed |
| 5.4 Context-sensitive help | 3.3.5 | High (1-2 weeks) | High | **Do it** — improves AA comprehension too |
| 5.5 Reading level / glossary | 3.1.5, 3.1.3, 3.1.4 | Medium (2-3 days) | Medium | **Do it** — also fixes the i18n inconsistency |
| 5.6 Text presentation controls | 1.4.8 | High | Low | Defer — verify 1.4.12 passes instead |
| 5.7 Sign language | 1.2.6-1.2.8 | Very high | None | **N/A** — no synchronized media |

**Realistic AAA target**: Sprints 1-4 deliver full AA. Items 5.1-5.5 are achievable and worth doing. Full AAA conformance is not a realistic goal for this product — WCAG explicitly states AAA is not required for general site conformance, and 5.6/5.7 are disproportionate to a Kanban board.

---

## Code Change Summary

### Files to Modify

| File | Changes | Priority | Level |
|------|---------|----------|-------|
| `src/styles/tokens.css` | Update semantic colors, add soft variants | P0 | AA |
| `src/styles/components.css` | Replace hardcoded semantic colors with tokens | P0 | AA |
| `src/components/AppShell.tsx` | Add skip link, landmark roles, `role="main"` | P1 | A/AAA |
| `src/components/TopBar.tsx` | Fix avatar alt text, `role="banner"` | P1 | A/AAA |
| `src/styles/global.css` | Add skip link styles | P1 | A |
| `src/components/Column.tsx` | Add DnD keyboard hints, column `aria-label` | P2 | A/AAA |
| `src/components/BoardView.tsx` | Add breadcrumb nav | P4 | AAA |
| `src/components/Column.tsx` | Add help affordance | P4 | AAA |
| `src/components/HelpTip.tsx` | New: reusable help panel | P4 | AAA |
| `src/styles/responsive.css` | Mobile focus styles, `prefers-contrast` tier | P2/P4 | AA/AAA |
| `src/components/*` (strings) | Resolve EN/PT mix, glossary, readability pass | P4 | AAA |
| `tests/e2e/a11y.spec.ts` | New automated a11y tests | P3 | AA |
| `package.json` | Add @axe-core/playwright | P3 | AA |

### New Tokens to Add

```css
/* Light theme additions — every "worst-case" figure is the MINIMUM ratio
   across all three light backgrounds (white #ffffff, bg #f4f5f7, elevated #ebecf0).
   The elevated background is the binding constraint, not white. */
--color-text-muted: #526075;      /* 5.41:1 worst-case */
--color-accent: #005b93;          /* 6.10:1 worst-case */
--color-accent-hover: #004b78;
--color-success: #276b2b;         /* 5.52:1 worst-case */
--color-success-hover: #1b5220;
--color-success-soft: #e8f5e9;
--color-danger: #c62828;          /* 4.76:1 worst-case */
--color-danger-hover: #a01f1f;
--color-danger-soft: #fdeaea;
--color-warning: #9c4f00;         /* 5.04:1 worst-case */
--color-warning-hover: #7d3f00;
--color-warning-soft: #fff8e1;

/* Dark theme additions (in media query) */
--color-success: #66bb6a;         /* 6.38:1 worst-case */
--color-success-hover: #81c784;
--color-success-soft: rgba(102, 187, 106, 0.15);
--color-danger: #ff9e99;          /* 7.61:1 worst-case */
--color-danger-hover: #ffb3ab;
--color-danger-soft: rgba(255, 158, 153, 0.15);
--color-warning: #ffd54f;         /* 10.68:1 worst-case */
--color-warning-hover: #ffe082;
--color-warning-soft: rgba(255, 213, 79, 0.15);

/* AAA tier (Sprint 5, opt-in via prefers-contrast or data-contrast="aaa") */
--color-success-aaa: #144a17;     /* 8.80:1 worst-case ✅ */
--color-danger-aaa:  #8e0000;     /* 8.27:1 worst-case ✅ */
--color-warning-aaa: #743a00;     /* 7.58:1 worst-case ✅ */
```

---

## Verification Script

Run after each sprint:

```bash
# 1. Color contrast verification
node scripts/check-contrast.js

# 2. TypeScript compile
npm run typecheck

# 3. Build
npm run build

# 4. E2E tests
npm run test:e2e

# 5. Accessibility tests (after Sprint 4)
npm run test:e2e -- tests/e2e/a11y.spec.ts
```

---

## Contrast Verification Script

Create `scripts/check-contrast.js`:

```javascript
// scripts/check-contrast.js
function getLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(fg, bg) {
  const L1 = getLuminance(fg);
  const L2 = getLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// IMPORTANT: check every color against ALL backgrounds it can appear on.
// The binding constraint in the light theme is --color-bg-elevated (#ebecf0),
// NOT white. Checking white alone yields false passes.
const LIGHT_BGS = ['#ffffff', '#f4f5f7', '#ebecf0'];
const DARK_BGS  = ['#22272b', '#1d2125'];

const lightTheme = {
  'text on light bg':        ['#172b4d', LIGHT_BGS],
  'text-muted on light bg':  ['#526075', LIGHT_BGS],   // UPDATED
  'accent on light bg':      ['#005b93', LIGHT_BGS],   // UPDATED
  'success on light bg':     ['#276b2b', LIGHT_BGS],   // UPDATED
  'danger on light bg':      ['#c62828', LIGHT_BGS],   // UPDATED
  'warning on light bg':     ['#9c4f00', LIGHT_BGS],   // UPDATED
};

const darkTheme = {
  'text on dark bg':        ['#b6c2cf', DARK_BGS],
  'text-muted on dark bg':  ['#8c9bab', DARK_BGS],
  'accent on dark bg':      ['#4c9aff', DARK_BGS],
  'success on dark bg':     ['#66bb6a', DARK_BGS],     // UPDATED
  'danger on dark bg':      ['#ff9e99', DARK_BGS],     // UPDATED
  'warning on dark bg':     ['#ffd54f', DARK_BGS],     // UPDATED
};

// AAA tier (7:1 — WCAG 1.4.6) — informational only, never gates the AA build.
const aaaTheme = {
  'success (AAA) on light bg': ['#144a17', LIGHT_BGS],
  'danger (AAA) on light bg':  ['#8e0000', LIGHT_BGS],
  'warning (AAA) on light bg': ['#743a00', LIGHT_BGS],
};

const worstCase = (fg, bgs) =>
  Math.min(...bgs.map((bg) => contrastRatio(fg, bg)));

function report(title, table, threshold, fatal) {
  console.log(`\n=== ${title} ===`);
  let ok = true;
  for (const [name, [fg, bgs]] of Object.entries(table)) {
    const ratio = worstCase(fg, bgs);
    const pass = ratio >= threshold;
    if (fatal) ok = ok && pass;
    const mark = pass ? '✅ PASS' : (fatal ? '❌ FAIL' : '⚠️  BELOW');
    console.log(`  ${name.padEnd(26)} ${fg}  worst ${ratio.toFixed(2)}:1  ${mark}`);
  }
  return ok;
}

const aaOk =
  report('LIGHT THEME (AA — worst of 3 backgrounds)', lightTheme, 4.5, true) &&
  report('DARK THEME (AA — worst of 2 backgrounds)', darkTheme, 4.5, true);

report('AAA TIER (Sprint 5, optional — non-fatal)', aaaTheme, 7, false);

console.log(
  aaOk
    ? '\n✅ ALL AA CONTRAST CHECKS PASSED'
    : '\n❌ SOME AA CHECKS FAILED — fix before shipping',
);
process.exit(aaOk ? 0 : 1);   // exit code reflects AA only, never AAA
```

---

## Definition of Done

### Level A (Sprint 1-2)
- [ ] Skip link present and functional
- [ ] All images have appropriate alt text
- [ ] Language of page set on `<html lang>`, dynamic content marked
- [ ] DnD has visible keyboard instructions
- [ ] All functionality keyboard accessible (2.1.1, 2.1.3)

### Level AA (Sprint 1-4)
- [ ] All color contrast ratios ≥ 4.5:1 (normal) / 3:1 (large) in both themes
- [ ] Non-text contrast (icons, borders, focus rings) ≥ 3:1
- [ ] Focus visible on all viewports including mobile
- [ ] Automated axe-core tests pass with zero WCAG 2.1 AA violations
- [ ] Manual screen reader testing passes (NVDA / VoiceOver / Orca)
- [ ] High contrast mode works
- [ ] 200% zoom works without horizontal scrolling
- [ ] Reduced motion respected

### Level AAA (Sprint 5 — aspirational)
- [ ] Enhanced contrast tier (7:1) available via `prefers-contrast: more`
- [ ] Landmarks programmatically identified with `role` + `aria-label`
- [ ] Breadcrumbs in deep navigation contexts
- [ ] Context-sensitive help on complex surfaces
- [ ] Static strings at target reading level; glossary for domain terms
- [ ] 1.4.12 (user text stylesheet) verified passing
- [x] 1.2.6-1.2.8 documented as not applicable (no synchronized media)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Color changes break brand consistency | Medium | Low | Use hue-preserving adjustments; stakeholder review |
| Token changes affect unrelated components | Medium | Medium | Search for hardcoded hex; use CSS variables everywhere |
| DnD keyboard instructions clutter UI | Low | Low | Collapsible help panel, not inline |
| Mobile focus rings conflict with native | Low | Medium | Test on real devices; use :focus-visible only |
| AAA scope creep delays AA ship | Medium | High | Sprints 1-4 are the AA gate; AAA is strictly opt-in per item |
| `prefers-contrast` support varies by browser | Medium | Low | Acceptable — progressive enhancement over AA baseline |
| EN/PT string cleanup touches many files | High | Medium | Isolate to a single pass with a defined string list; test board flows |

---

## Success Metrics

### Level AA (the actual target)
- **Automated**: 0 WCAG 2.1 AA violations in axe-core scan across all 3 viewports
- **Manual**: Screen reader user can complete all core flows unaided
- **Compliance**: WCAG 2.1 Level AA checklist 100% pass
- **Regression**: No a11y regressions in CI for 30 days

### Level AAA (partial, honest)
- **Automated**: 0 violations under `wcag2aaa` tags for the criteria in scope
- **Coverage**: 5 of 7 AAA items shipped; 1 deferred with rationale; 1 N/A
- **Stated publicly**: Accessibility statement documents AA conformance, the AAA
  items shipped, and the two not pursued — with reasons