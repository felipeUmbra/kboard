# Kboard — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Kboard |
| **Version** | 0.1.0 |
| **Status** | Shipped (v1 feature-complete) |
| **Repository** | `github.com/felipeUmbra/kboard` |
| **Branch** | `Dev` |
| **Last updated** | 2026-09-29 |

---

## 1. Summary

Kboard is a Trello-inspired Kanban board that runs entirely in the browser. It
signs the user in with Google, stores every board as a JSON file inside that
user's own Google Drive `appDataFolder`, and has **no backend of any kind**.

The product thesis is deliberately narrow: most Kanban tools ask a user to
create an account and then hold their data hostage. Kboard removes both
frictions. The user brings their Google identity, their data lives in a Drive
space Google already backs up, and the entire application is a static bundle
that can be hosted anywhere.

---

## 2. Problem statement

| Problem | Who it affects | Current friction |
|---|---|---|
| Kanban tools require a separate account | Everyone | Another password to remember, another vendor to trust |
| Cloud Kanban vendors hold the only copy of your data | Teams, privacy-conscious users | Vendor shutdown = total data loss; no export path that keeps formatting |
| Most Kanban apps are desktop-web-first and unusable on a phone | Mobile users (~60% of web time) | Wide three-column layouts, 8px drag handles, hover-only affordances |
| Rich card metadata usually requires a paid tier | Teams | Custom fields, checklists and comments locked behind billing |
| Offline means "read-only, in a modal error state" | Mobile users on transit | Nothing loads without a network round-trip |

---

## 3. Goals and non-goals

### 3.1 Goals

1. **Zero-friction identity.** Sign in with Google; no Kboard account exists.
2. **User-owned data.** A user can locate, read, back up or delete every byte
   from the Drive UI without Kboard's involvement.
3. **Genuinely usable on a phone** as a first-class target, not a squeezed
   desktop layout.
4. **Offline-first.** The app shell and the last-seen board content load with
   no network; writes reconcile when connectivity returns.
5. **Structured work.** Epics → Stories → Tasks with progress rollup, so
   planning lives next to execution rather than in a separate tool.
6. **WCAG 2.1 AA conformance** with automated gates, not aspiration.

### 3.2 Non-goals

- **Real-time multi-user collaboration.** Two people can edit the same board,
  but there is no live cursor, presence or CRDT. Last-write-wins with
  conflict detection (see [6.2](#62-concurrency-model)).
- **A server.** No accounts database, no sync service, no telemetry.
- **Board-per-team sharing.** Sharing is Android Web Share Target inbound
  only; there is no hosted public board view.
- **Sub-task nesting beyond one level.** Checklists are flat by design
  (v1); item-level sub-items are explicitly out of scope.
- **Native apps.** PWA only.

---

## 4. Personas

**Priya — solo product owner.** Plans a quarter of work. Uses Kboard on her
phone during commutes and on a laptop otherwise. Cares that her data survives
without thinking about it. *Needs:* hierarchy, custom fields, offline.

**Marco — small-team tech lead.** Runs a 6-person team. Wants a shared board
with consistent card structure. *Needs:* labels, checklists, comments,
activity history, fast card entry.

**Sam — privacy-conscious developer.** Will not put proprietary work in a SaaS
vendor. *Needs:* to open the JSON in Drive directly, self-host, no analytics.

---

## 5. Functional requirements

Status: **All v1 requirements shipped.** Priorities: P0 = must, P1 = should.

### 5.1 Identity and storage

| ID | Requirement | Pri | Status |
|---|---|---|---|
| F-1.1 | Sign in via Google Identity Services OAuth 2.0 | P0 | ✅ |
| F-1.2 | Store each board as one JSON file in `appDataFolder` | P0 | ✅ |
| F-1.3 | List, create, rename, delete boards | P0 | ✅ |
| F-1.4 | Optimistic-concurrency writes via ETag; surface conflicts | P0 | ✅ |
| F-1.5 | Debounce Drive writes (600 ms) to avoid API spam | P0 | ✅ |
| F-1.6 | Background revalidation on board open (60 s per-board TTL) | P1 | ✅ |
| F-1.7 | Sign out wipes all local caches | P0 | ✅ |
| F-1.8 | Re-consent flow when required scopes are missing | P1 | ✅ |

### 5.2 Board structure

| ID | Requirement | Pri | Status |
|---|---|---|---|
| F-2.1 | Columns with an explicit ordering (`cardIds[]`) | P0 | ✅ |
| F-2.2 | Mark columns as "done" for progress rollup | P1 | ✅ |
| F-2.3 | Three-level hierarchy: Epic → Story → Task | P0 | ✅ |
| F-2.4 | Cycle prevention in parent links | P0 | ✅ |
| F-2.5 | Per-type enable/disable and user-overridable labels | P1 | ✅ |
| F-2.6 | Card types carry their own custom-field set | P1 | ✅ |

### 5.3 Cards

| ID | Requirement | Pri | Status |
|---|---|---|---|
| F-3.1 | Title, rich-text description, start/due dates | P0 | ✅ |
| F-3.2 | Labels from a curated 12-colour palette | P0 | ✅ |
| F-3.3 | 7 custom-field types (text, long text, number, percentage, checkbox, date, preset list) | P1 | ✅ |
| F-3.4 | Flat checklists, multiple per card | P1 | ✅ |
| F-3.5 | Threaded comments with author + avatar | P1 | ✅ |
| F-3.6 | Auto-generated activity log (16 event kinds) | P1 | ✅ |
| F-3.7 | Cross-card navigation via parent/child chips | P1 | ✅ |
| F-3.8 | In-editor "+ Add child / parent" with undo-on-discard | P1 | ✅ |
| F-3.9 | Column picker in the editor moves the card on save | P1 | ✅ |

### 5.4 Interaction

| ID | Requirement | Pri | Status |
|---|---|---|---|
| F-4.1 | Mouse drag-and-drop (5 px activation) | P0 | ✅ |
| F-4.2 | Touch drag-and-drop (250 ms long-press) | P0 | ✅ |
| F-4.3 | Keyboard drag-and-drop (Space + arrows) | P0 | ✅ |
| F-4.4 | Mobile cross-column drag via a pinned column-target overlay | P0 | ✅ |
| F-4.5 | Mobile collapsible column rail (one column at a time) | P0 | ✅ |
| F-4.6 | Draft preservation across navigation and reload | P1 | ✅ |
| F-4.7 | Week planner view across all boards | P1 | ✅ |
| F-4.8 | In-app keyboard-shortcut panel | P2 | ✅ |

### 5.6 Find

Delivered as Phase 3–5 of the filter/search/saved-views effort.

| ID | Requirement | Pri | Status |
|---|---|---|---|
| F-6.1 | Free-text search over card title, description, labels and parent/child titles | P1 | ✅ |
| F-6.2 | Filter by card type (all / epic / story / task) | P1 | ✅ |
| F-6.3 | Multi-select label filter | P1 | ✅ |
| F-6.4 | Date-range filter (overdue / today / week / no date) | P1 | ✅ |
| F-6.5 | Done / undone filter | P1 | ✅ |
| F-6.6 | Filters AND-combine, with an active-filter chip row and a count badge on the trigger | P1 | ✅ |
| F-6.7 | Saved views: capture a named filter, recall it, update it in place, delete it | P1 | ✅ |
| F-6.8 | Saved views persisted per board in Drive; ≤ 50 per board, names ≤ 60 chars and unique per board | P1 | ✅ |
| F-6.9 | Dedicated empty state with a one-click "clear search and filters" when nothing matches | P1 | ✅ |
| F-6.10 | Search and filter state is session-only and never persisted | P2 | ✅ |
| F-6.11 | Filtering composes with drag-and-drop without disturbing hidden cards | P1 | ✅ |

### 5.7 Platform

| ID | Requirement | Pri | Status |
|---|---|---|---|
| F-5.1 | Installable PWA (manifest + service worker) | P1 | ✅ |
| F-5.2 | Offline app shell via Workbox precache | P1 | ✅ |
| F-5.3 | Prompt-not-forced update flow | P1 | ✅ |
| F-5.4 | Web Share Target (Android inbound) | P2 | ✅ |
| F-5.5 | Deployable under a subpath (GitHub Pages) | P1 | ✅ |
| F-5.6 | Dark mode via `prefers-color-scheme` | P1 | ✅ |
| F-5.7 | WCAG 2.1 AA with automated gates | P0 | ✅ |
| F-5.8 | Popovers become full-bleed bottom sheets on narrow viewports | P1 | ✅ |

---

## 6. Key design decisions

### 6.1 Why `appDataFolder`

`drive.appdata` grants access to a per-user **hidden, app-scoped** space. It is
invisible in the Drive UI, cannot be shared by accident, and cannot be
collided with by other apps. The trade-off is that a user cannot see the files
without going through Drive's *Settings → Hidden app data* management page, so
**the onboarding copy must tell users their data is safe and where to find
it** — this is why that section is prominent in the README.

`drive.file` was explicitly rejected: it only covers files the app creates in
the user's *visible* Drive, not the `appDataFolder` space.

### 6.2 Concurrency model

There is no real-time sync. The model is:

1. Local state is authoritative for the session.
2. Writes are debounced 600 ms, then `PATCH`ed.
3. The returned ETag is stored on the board as `driveVersion`.
4. If Drive returns `412 Precondition Failed`, the app re-reads the winner's
   version and shows a banner with a recovery action rather than silently
   clobbering the other editor.

This is honest about its limits: two people editing the same card in the same
minute will lose one edit. The alternative — a CRDT or a sync server — is
explicitly out of scope.

### 6.3 Whole-board-as-one-file

The simplest possible storage model: one file per board, full-document
replacement on write. This makes conflict semantics trivial and the JSON
human-readable in Drive, at the cost of write amplification on very large
boards. Accepted because a board of a few hundred cards is a few hundred KB —
comfortably within Drive's limits and instant to replace.

### 6.4 Accessibility as a build gate

Contrast and hardcoded-colour rules are enforced by `npm run a11y` in CI, not
by convention. A colour that would fail WCAG AA **cannot be merged**. This was
a deliberate trade of a small amount of developer friction for a guarantee
that the UI stays conformant as it evolves.

---

## 7. Success metrics

| Metric | Target | Status |
|---|---|---|
| E2E tests passing | 100% | ✅ 325/325 |
| Unit tests passing | 100% | ✅ 155/155 |
| Contrast checks passing | 100% of tokens, both themes | ✅ |
| Hardcoded colour literals in `src/` | 0 | ✅ |
| Type errors | 0 | ✅ |
| Lighthouse a11y score | ≥ 95 | Not yet measured (Sprint 4) |
| Manual screen-reader walkthrough | All core flows | Pending (Sprint 4) |

---

## 8. Known limitations

1. **No real-time collaboration.** See [6.2](#62-concurrency-model).
2. **No board sharing UI.** Two people can open the same Drive file, but
   Kboard offers no way to invite them.
3. **One level of checklist nesting only.**
4. **AAA (enhanced contrast 7:1) is opt-in, not the default.** Forcing 7:1 on
   every token forces hues such as `#743a00` that read as brown rather than
   amber; the AAA tier is documented per-item for teams that need it.
5. **Google-only.** The storage and identity model is deeply tied to Drive.
6. **Unmeasured with real assistive technology.** Automated checks catch
   roughly a third of real accessibility problems; no screen-reader testing
   has been performed yet.
7. **Search and filter state is not persisted.** A saved view is, but the live
   query is session-only by design (F-6.10), so a reload returns to an
   unfiltered board. Persisting it would put transient view state into the
   Drive file and make it a conflict surface for no user benefit.

---

## 9. Roadmap

| Phase | Scope | Status |
|---|---|---|
| v1 | Everything in [5](#5-functional-requirements) | Shipped |
| v1.1 | Manual screen-reader audit; axe-core integration | Pending (Sprint 4) |
| v1.2 | Optional AAA contrast tier behind a user setting | Pending (Sprint 5) |
| v2 | Board sharing + multi-select operations | Not started |
| v2 | Recurring cards, board templates | Not started |
| v3 | Optional self-hosted sync backend for real-time collab | Explored, not committed |

---

## 10. Related documents

- [Technical Requirements](./TRD.md) — architecture, data model, sync
- [App Flow](./APP-FLOW.md) — screens, states, navigation
- [UX/UI Design](./UX-UI-DESIGN.md) — design system, responsive rules
- [Data Model](./DATA-MODEL.md) — storage schema and Drive mapping
- [Implementation Plan](./IMPLEMENTATION-PLAN.md) — delivery roadmap
