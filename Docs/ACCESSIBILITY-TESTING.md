# Accessibility testing protocol

How kboard's accessibility is verified, and what a human still has to check.

This document covers Sprint 4 of `IMPLEMENTATION-PLAN.md`: the automated
gates (4.1 axe-core, plus the Sprints 1–3 checks that predate it) and the
manual screen-reader walkthrough (4.2), which cannot be automated.

---

## The three layers

Accessibility conformance is not one test. kboard checks it at three
levels, and a failure at any one of them is a real failure.

| Layer | Tool | Catches | Runs in |
|---|---|---|---|
| Palette | `npm run a11y:contrast` | Token contrast ratios, per theme | ~1s, no browser |
| Source | `npm run lint:colors` | Hardcoded colour literals bypassing tokens | ~1s, no browser |
| Semantics | `npm run test:e2e:axe` (axe-core) | Missing names, roles, labels, landmarks, heading order | ~60s, Chromium |
| Behaviour | Manual screen reader | Announcement quality, reading order, focus recovery | Human, ~45 min |

**The automated layers are necessary and not sufficient.** axe-core
explicitly documents that it catches roughly a third of real accessibility
problems. It cannot tell you that a control announces the wrong thing, that
the reading order is illogical, that a label is technically present but
meaningless, or that focus lands somewhere confusing after a modal closes.
The walkthrough below is where those are found.

---

## Running the automated gates

```bash
npm run a11y          # palette + source (no browser; runs in the CI a11y job)
npm run test:unit     # includes the axe policy and contrast unit tests
npm run test:e2e      # full matrix, including the axe-core scans
```

The axe-core scans live in `tests/e2e/a11y-axe.spec.ts` and run in the
`chromium-desktop` project only. axe-core is not viewport-sensitive, and the
tablet/mobile projects render the same DOM, so scanning there would cost
minutes per run to re-detect the same semantics. Viewport-dependent
checks — touch targets, mobile focus visibility, contrast against the mobile
background — stay in `a11y-sprint2-3.spec.ts` and `responsive-a11y.spec.ts`,
which do run in every project.

### What the axe scans cover

| Surface | Notes |
|---|---|
| Login screen | Pre-auth, so `AppShell` is not mounted |
| Boards list | Populated (two boards) — the empty state has different structure |
| Board view | Two columns, two cards, one with a description |
| Card editor modal | Scoped to the dialog; the page behind it is inert |
| Planner view | Includes the week grid and empty day cells |
| Board view, dark | `prefers-color-scheme: dark` via `emulateMedia` |

The dark-theme scan matters: five of the six defects Sprint 4.1 found were
invisible in the light theme, because the offending colours were light-theme
values that happened to work there.

### The accepted-violation list

`KNOWN_VIOLATIONS` in `tests/helpers/axe.ts` is the complete list of failures
we choose to accept. It is currently **empty** — every issue axe-core found in
Sprint 4.1 was fixed rather than allowlisted.

If an entry is ever added it must carry a written `reason`. An entry without
one is treated as a bug by `tests/unit/a11y-axe-policy.test.ts`, which also
asserts the list stays duplicate-free. Adding an entry to silence a failure
you have not understood defeats the purpose of the gate; fix the markup.

### What the tags cover

WCAG 2.0 A + AA, WCAG 2.1 A + AA, WCAG 2.2 AA, plus `best-practice`. AAA is
excluded on purpose: Sprint 5 treats it as an opt-in tier, and running it
here would fail the build on a non-goal. A test asserts the tag set so
neither widening nor narrowing happens silently.

---

## Manual screen-reader walkthrough (Sprint 4.2)

This part cannot be automated. It requires a real screen reader and a real
browser, and it is the only way to verify that what a user actually *hears*
is correct.

### Status: NOT YET EXECUTED

> **This protocol has not been run.** No NVDA, JAWS, VoiceOver or TalkBack
> session has been recorded against kboard as of the Sprint 4.1 commit. The
> results table below is empty by design, not by omission.
>
> Do not mark this section complete, and do not claim in a release note that
> kboard is screen-reader tested, until a session has been run and the
> results recorded here. A test written but not executed is a hypothesis.

### Environments

The minimum bar is **NVDA + Firefox or Chrome on Windows** and **VoiceOver +
Safari on macOS or iOS**. Testing only one browser is a common gap: VoiceOver
handles `aria-roledescription` and live regions differently from NVDA, and
iOS Safari is the only place the bottom-sheet modal's focus trap is
experienced the way a touch user gets it.

| Field | Value |
|---|---|
| Screen reader + browser | _(to be filled)_ |
| OS | _(to be filled)_ |
| Application version / commit | _(to be filled)_ |
| Tester | _(to be filled)_ |
| Date | _(to be filled)_ |

### Setup

1. `npm run dev`, open the app, sign in with a real Google account (the
   fakes used by the E2E suite do not exercise the real Drive flow).
2. Seed a board with at least: two columns, three cards, one card with a
   description and a due date, one epic with a child story, and a label.
3. Turn on the screen reader's element inspector if it has one
   (NVDA: `Ctrl+F7`; VoiceOver: `Ctrl+Option+F3`). It makes wrong-role bugs
   obvious rather than requiring you to infer them from speech.

### Walkthrough

Work through these in order with **keyboard only** — do not use the mouse,
because mouse operation hides focus-management defects entirely.

#### 1. Login and first navigation

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 1.1 | Load the page | "Kboard" heading; page language is English | ☐ |
| 1.2 | Press `Tab` once | "Skip to main content, link" — as the *first* focusable element | ☐ |
| 1.3 | Press `Enter` on it | Focus moves into the main region; the region is announced | ☐ |
| 1.4 | Tab to the sign-in button | "Sign in with Google, button"; not a bare "button" | ☐ |

*Why 1.2 matters:* the skip link is visually hidden until focused. If it is
positioned off-screen rather than clipped, Chromium removes it from the
focus order entirely and the shortcut silently stops existing — which is what
happened before Sprint 2.

#### 2. Boards list

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 2.1 | Land on the list | "Your boards" level-1 heading | ☐ |
| 2.2 | Navigate by heading | Card titles are level-2, in DOM order | ☐ |
| 2.3 | Tab to a card | "`<name>`, link" — the title anchor, not a bare button | ☐ |
| 2.4 | Press `Enter` | Board opens; focus lands on the board, not back at the top of the document | ☐ |
| 2.5 | Tab to a card's delete button | "Delete board `<name>`, button", reachable by keyboard even though it is visually hidden until hover/focus-within | ☐ |

*Why 2.3 matters:* the card is a stretched link, so the whole card is the hit
area but the accessible name comes from the link text. If the accessible
name is the article's whole text content, the announcement is a paragraph of
metadata instead of a board name.

#### 3. Board view landmarks and structure

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 3.1 | Enter the board | Banner, complementary (sidebar), main — three landmarks | ☐ |
| 3.2 | Navigate by landmark | "main" is reachable and contains the board | ☐ |
| 3.3 | Navigate by heading | One level-1 heading, column titles at level 2, no skipped levels | ☐ |
| 3.4 | Read a column | Its card count is announced with the column, not as orphaned text | ☐ |

#### 4. Card content and opening

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 4.1 | Tab to a card | "`<title>`, button" plus the drag hint (see 4.2) | ☐ |
| 4.2 | Focus a card | The keyboard-shortcut description is associated with the card and is discoverable | ☐ |
| 4.3 | Press `Enter` | Card editor opens; focus moves **into** the dialog | ☐ |
| 4.4 | Inside the editor | Title field, type selector, description, comments — reachable in a sensible order | ☐ |
| 4.5 | Press `Escape` | Dialog closes; focus returns to the card that opened it | ☐ |
| 4.6 | Press `Tab` from the last control in the dialog | Focus does not escape to the page behind (focus trap) | ☐ |

*Why 4.5 matters:* focus loss on modal close is the single most common defect
this walkthrough finds, and it is invisible to axe-core.

#### 5. Keyboard drag and drop

The shortcut disclosure is a native `<details>` labelled "Keyboard
shortcuts", and dnd-kit binds `Space` / arrows / `Space` / `Escape`.

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 5.1 | Find the shortcuts disclosure | Reachable by keyboard, announces collapsed then expanded state | ☐ |
| 5.2 | Read it aloud | "Space — pick up the focused card", and so on | ☐ |
| 5.3 | Focus a card, press `Space` | Card is picked up; state change is announced | ☐ |
| 5.4 | Press arrow keys | Card moves; the new position is announced each time | ☐ |
| 5.5 | Press `Space` | Card is dropped; state change announced | ☐ |
| 5.6 | Repeat 5.3–5.4, press `Escape` | Move cancelled; card returns to its original position | ☐ |
| 5.7 | Do the same in the planner | Identical behaviour | ☐ |

#### 6. Forms and dynamic content

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 6.1 | Focus the rich-text description | "Description, text field, multi-line" — the correct role, not a bare editable | ☐ |
| 6.2 | Focus a sidebar "done column" checkbox | "Treat the `<name>` column as done, checkbox" | ☐ |
| 6.3 | Focus a card-type "enabled" checkbox | "Enable the `<name>` card type, checkbox" | ☐ |
| 6.4 | Trigger a save error | Error is announced without focus being stolen | ☐ |
| 6.5 | Trigger the sync state | "· syncing…" changes are not announced intrusively | ☐ |
| 6.6 | Delete a card and confirm | Confirmation is announced; focus lands somewhere sensible afterwards | ☐ |

#### 7. Mobile (VoiceOver on iOS, or Chrome with a touch screen)

| # | Action | Expected announcement | Result |
|---|---|---|---|
| 7.1 | Swipe through the top bar | Menu, logo, board name, Planner, user, sign out — each once | ☐ |
| 7.2 | Open the bottom-sheet modal | Focus moves into the sheet; the page behind is not reachable by swipe | ☐ |
| 7.3 | Dismiss the sheet | Focus returns to the control that opened it | ☐ |
| 7.4 | Move between columns | The collapsed rail exposes each column as a tab; selection state announced | ☐ |

### Recording results

Fill in the results column, and for any failure record:

- the step number,
- what was announced, verbatim,
- what you expected,
- the browser and screen reader,
- a screenshot or a short screen-recording clip if it is visual.

Keep failures as issues with the step number in the title so they can be
traced back to this document.

### What to do when a check fails

1. Decide whether it is a real defect or a screen-reader quirk. Cross-check
   the other screen reader before filing.
2. If real, fix the markup. Do not add a note to this document saying it is
   known-broken without a linked issue and a reason.
3. Add an automated check where one is possible. Most of what this
   walkthrough catches *should* also fail an axe rule — if it does not, that
   is a gap in our axe configuration worth closing, not just a test to run
   again.

---

## Known limits

- **Automation is a floor, not a ceiling.** axe-core's own documentation puts
  its coverage at roughly a third of real issues.
- **Two screen readers is a floor, not a ceiling.** NVDA and VoiceOver differ
  substantially. JAWS and TalkBack have their own quirks and are not covered
  by the protocol above.
- **Automated contrast is computed, not perceived.** `a11y:contrast` proves
  the ratio. It cannot tell you a colour is unpleasant, or that a state is
  distinguishable without relying on colour alone.
- **Touch targets are measured, not used.** A 44px target passes a bounding
  box check and can still be awkward or overlapping in practice.
- **The manual walkthrough is unexecuted.** Everything above the status note
  is a protocol, not a result. Treat conformance as *automated-verified* until
  a session has been run.

---

## Related documents

- `IMPLEMENTATION-PLAN.md` — the sprint roadmap this protocol implements.
- `UX-UI-DESIGN.md` — the accessibility section describing the intended
  behaviour these tests check.
- `tests/e2e/a11y-axe.spec.ts` — the axe-core scans.
- `tests/helpers/axe.ts` — scan helper and the accepted-violation list.
- `tests/unit/a11y-axe-policy.test.ts` — guards on the axe policy itself.
- `scripts/check-contrast.js` — the token contrast gate.
