# Kboard — Technical Requirements Document (TRD)

| | |
|---|---|
| **Product** | Kboard |
| **Stack** | React 18 + TypeScript 5.5 + Vite 5 |
| **Backend** | None — Google Drive REST API v3 via OAuth 2.0 |
| **Status** | Implemented and verified |
| **Last updated** | 2026-09-29 |

This document describes **what is actually built**, verified against the
source in `src/`. Where a design was considered and rejected, the reason is
recorded so the decision is not silently reversed later.

---

## 1. Architecture

### 1.1 Shape

Kboard is a **static single-page application with no backend**. The build
output in `dist/` is a folder of files that can be served by any static host.

```
┌──────────────────────────────────────────────────────────┐
│  Browser                                                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  React app                                         │  │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────────────┐│  │
│  │  │  views/  │→ │ components│→ │  state/           ││  │
│  │  │          │  │           │  │  BoardContext     ││  │
│  │  └──────────┘  └───────────┘  │  (in-memory +     ││  │
│  │                               │   debounced sync) ││  │
│  │                               └────────┬──────────┘│  │
│  │                                        │           │  │
│  │                              ┌─────────▼─────────┐ │  │
│  │                              │  drive/           │ │  │
│  │                              │  boardRepository  │ │  │
│  │                              └────────┬──────────┘ │  │
│  └───────────────────────────────────────┼────────────┘  │
│                                          │               │
│  ┌───────────────┐  ┌──────────────────┐ │               │
│  │ localStorage  │  │ IndexedDB        │ │               │
│  │ caches/drafts │  │ share inbox      │ │               │
│  └───────────────┘  └──────────────────┘ │               │
└──────────────────────────────────────────┼───────────────┘
                                           │ HTTPS + Bearer
                                    ┌──────▼───────┐
                                    │ Google Drive │
                                    │ API v3       │
                                    │ appDataFolder│
                                    └──────────────┘
```

### 1.2 Layer responsibilities

| Layer | Directory | Rule |
|---|---|---|
| Domain | `src/models/` | Pure functions and types. No React, no I/O. |
| State | `src/state/` | The only place that mutates domain data. Owns sync. |
| Remote | `src/drive/` | The only place that talks to Drive. |
| Auth | `src/auth/` | The only place that touches Google Identity Services. |
| View | `src/components/`, `src/views/` | Read state, dispatch actions. No Drive calls. |
| Shell | `src/App.tsx`, `src/components/AppShell.tsx` | View routing and layout. |

The **no-I/O-in-views** rule is what makes the e2e suite possible: views can be
driven against a fake Drive without stubbing the domain layer.

---

## 2. Tech stack

### 2.1 Runtime dependencies

| Package | Version | Used for |
|---|---|---|
| `react` / `react-dom` | ^18.3.1 | UI |
| `@dnd-kit/core` | ^6.1.0 | Drag-and-drop primitives, sensors |
| `@dnd-kit/sortable` | ^8.0.0 | Sortable lists, keyboard coordinate getter |
| `@dnd-kit/utilities` | ^3.2.2 | Transform helpers |
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` | ^2.6.6 | Rich-text editor |
| `dompurify` | ^3.1.6 | Sanitizes Tiptap HTML before persistence |
| `date-fns` | ^3.6.0 | Date maths, relative timestamps |
| `react-day-picker` | ^9.14.0 | Start/due date pickers |
| `vite-plugin-pwa` | ^0.20.5 | Manifest + service worker generation |
| `workbox-window` | ^7.4.1 | Service-worker lifecycle control |

### 2.2 Development dependencies

`@playwright/test` ^1.62.1 · `vitest` ^1.6.1 · `jsdom` ^29.1.1 ·
`typescript` ^5.5.4 · `vite` ^5.4.2 · `@vitejs/plugin-react` ^4.3.1 ·
`@testing-library/react` ^16.3.3 · `sharp` ^0.33.5 (icon generation)

### 2.3 Deliberate omissions

- **No state-management library.** `BoardContext` + a reducer-style action
  builder covers it. Redux/Zustand would add a dependency without solving a
  problem the app has.
- **No CSS framework.** Tokens plus two hand-written stylesheets.
- **No date library beyond `date-fns`.**
- **No runtime router.** A single `view` state enum. See
  [TRD §7](#7-routing).

---

## 3. Authentication

### 3.1 Flow

1. `src/auth/gis-loader.ts` injects the Google Identity Services
   (`accounts.google.com/gsi/client`) script on demand and resolves a promise
   when ready.
2. `src/auth/tokenClient.ts` calls `google.accounts.oauth2.initTokenClient`
   with the scopes below.
3. On success the access token is held in memory **and** written to
   `localStorage` with an absolute expiry derived from Google's `expires_in`.
4. `useAuth` fetches the user profile from the `userinfo` endpoint and caches
   it under `kboard:google-profile`.

### 3.2 Scopes

```
openid
email
profile
https://www.googleapis.com/auth/drive.appdata
```

`drive.appdata` is required and **`drive.file` is not a substitute** — it only
covers files the app creates in the user's visible Drive, not the
`appDataFolder` space.

### 3.3 Token handling

| Behaviour | Implementation |
|---|---|
| Expiry | `getCurrentToken()` returns `null` once `Date.now() >= tokenExpiresAt` and clears storage |
| Proactive refresh | A scheduled refresh runs with a safety margin before expiry |
| Concurrent requests | Serialized through a promise chain so they cannot race |
| Mid-call `401` | `driveClient` refreshes once and retries, then throws |
| Missing scope | `reauthenticate()` forces `prompt: "consent"` |
| Sign out | `revoke()` on the token, then wipe all local state |

The token is persisted deliberately: SPAs receive no refresh token, so
persisting lets the app reuse the access token until its natural expiry and
avoids re-prompting on every reload.

### 3.4 Storage keys

| Key | Contents | Cleared on logout |
|---|---|---|
| `kboard:google-token` | `{ accessToken, expiresAt }` | ✅ |
| `kboard:google-profile` | `{ id, name, email, picture }` | ✅ |
| `kboard:boards-cache` | Boards list + last saved board content | ✅ |
| `kboard:boards-cache-meta` | `{ [boardId]: { lastCheckedAt } }` | ✅ |
| `kboard:card-drafts` | In-progress card edits | ✅ |
| `kboard:install-dismissed` | Install-banner dismissal (TTL 7 days) | ❌ by design |

---

## 4. Data layer

### 4.1 Google Drive API usage

Base URLs:
`https://www.googleapis.com/drive/v3` (metadata) and
`https://www.googleapis.com/upload/drive/v3` (uploads).

| Operation | Method | Endpoint | Purpose |
|---|---|---|---|
| List boards | GET | `/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,version,appProperties)&pageSize=200` | Boards list |
| Get metadata | GET | `/files/{id}?fields=...` | Single file metadata |
| Read content | GET | `/files/{id}?alt=media` | Board JSON |
| Create | POST | `/upload/drive/v3/files?uploadType=multipart` | `multipart/related` metadata + body |
| Update | PATCH | `/upload/drive/v3/files/{id}?uploadType=media` | Full content replacement |
| Delete | DELETE | `/files/{id}` | Board removal |

All requests carry `Authorization: Bearer <token>`.

### 4.2 File identity

| Property | Value | Purpose |
|---|---|---|
| File name | `board-<uuid>.json` | Human-recognisable in Drive |
| `parents` | `["appDataFolder"]` | Places it in the hidden app space |
| `mimeType` | `application/json` | Correct preview |
| `appProperties.kind` | `kboard.board.v1` | **The filter** — the type marker |

The boards list filters on `appProperties.kind === "kboard.board.v1"`. This is
why the suffix is a *versioned marker* rather than a bare string: it leaves
room to add `kboard.board.v2` later without ambiguity.

`appProperties.boardId` and `appProperties.boardName` are denormalised copies
so the boards list renders **without downloading every board's content**.

### 4.3 Optimistic concurrency

1. `board.driveVersion` holds the last ETag seen.
2. `saveBoard` PATCHes and stores the returned ETag.
3. A `412 Precondition Failed` means another editor won.
4. The app re-reads the winner's version and shows a banner with a recovery
   action, rather than overwriting.

### 4.4 Sync behaviour

| Constant | Value | Location |
|---|---|---|
| `DEBOUNCE_MS` | `600` | `state/BoardContext.tsx` |
| `REVALIDATE_TTL_MS` | `60_000` | `state/BoardContext.tsx` |

- Every local mutation schedules a debounced Drive save.
- Opening a board triggers a background re-read **unless** that board was
  checked within the last 60 s. The TTL is stamped up-front so concurrent
  opens coalesce instead of each firing a request.
- Newer Drive content replaces the cache without disturbing the user mid-edit.

### 4.5 Schema versioning

`src/models/migrations.ts` exposes `normalizeBoard(raw: unknown): Board`. There
is **no explicit version field**; instead the function coerces any historical
or malformed shape into a valid `Board`:

- Missing arrays default to `[]`, missing scalars to sensible values.
- `Card.type` defaults to `"task"`.
- A column named `done` (case-insensitive) is auto-marked as a done column.
- Malformed JSON degrades to an empty board rather than throwing.

This is deliberately **lenient**: a board must never fail to open because a
field is missing. A future breaking change adds a version marker and branches
in `normalizeBoard`.

---

## 5. Presentation

### 5.1 Views

| View | Component | Purpose |
|---|---|---|
| Login | `components/LoginScreen.tsx` | Google sign-in |
| Board list | `components/BoardListView.tsx` | All boards, create/delete |
| Board | `components/BoardView.tsx` | Kanban; mobile and desktop layouts |
| Planner | `views/PlannerView.tsx` | 7-day view across all boards |

`App.tsx` holds a `view` state enum (`"list" | "board" | "planner"`), kept in
sync with `board.activeBoard`.

### 5.2 Drag-and-drop

Two independent `DndContext` providers, because the droppable semantics differ:

| | `KanbanDndContext` | `PlannerDndContext` |
|---|---|---|
| Droppables | Columns | Days (`day:YYYY-MM-DD`) |
| Draggables | Sortable cards | Draggable card rows |
| Collision | Custom: pointer-first, then corners | `closestCenter` |
| Keyboard | `sortableKeyboardCoordinates` | default |

**Sensors** (identical in both):

| Sensor | Constraint | Reason |
|---|---|---|
| `PointerSensor` | `distance: 5` | Below 5 px the card's click handler wins, so the card opens instead of dragging |
| `TouchSensor` | `delay: 250, tolerance: 8` | A tap must still open the card; long-press commits to a drag |
| `KeyboardSensor` | — | WCAG 2.1.1 |

The Kanban context needs a custom `CollisionDetection` because mobile
cross-column targets are narrow overlay elements: `pointerWithin` requires the
droppable to *contain* the dragged rect (never true for a wide card), and
`rectIntersection` ranks the full-width expanded column highest. The custom
function hit-tests raw pointer coordinates against overlay targets first.

### 5.3 Rich text

Tiptap with StarterKit. Output is **sanitized with DOMPurify before it is
persisted**, not just before render — an untrusted board file should never be
able to inject markup into the editor.

### 5.4 Drafts

`state/cardDrafts.ts` keeps `{ title, descriptionHtml, updatedAt, discarded }`
per card in `localStorage`. Discarded drafts are tombstoned so a later `clear`
can wipe them while `get` keeps returning `null`. This solves both
cross-card navigation and page-reload data loss without changing the board.

---

## 6. PWA

### 6.1 Build configuration

`vite-plugin-pwa` in `generateSW` mode (not `injectManifest` — no hand-written
Workbox code is needed):

| Option | Value | Reason |
|---|---|---|
| `injectRegister` | `false` | Registration happens in `main.tsx` so update events can reach React |
| `registerType` | `"prompt"` | The user clicks "Reload"; no surprise reloads |
| `skipWaiting` | `false` | Required for the prompt flow |
| `clientsClaim` | `false` | Same |
| `cleanupOutdatedCaches` | `true` | Stale caches are purged |
| `navigateFallback` | `"/index.html"` | SPA routing and offline shell |
| `globPatterns` | `**/*.{js,css,html,svg,png,ico,webmanifest,woff2}` | Everything needed for the shell |
| `base` | `process.env.BASE_PATH \|\| "/"` | GitHub Pages subpath support |

### 6.2 Never cache

```js
navigateFallbackDenylist: [
  /^https:\/\/accounts\.google\.com\//,
  /^https:\/\/googleapis\.com\//,
  /^https:\/\/[a-z0-9.-]+\.googleapis\.com\//,
]
```

Caching OAuth or Drive traffic would replay stale tokens or stale boards, and
could break the consent popup.

### 6.3 Share Target

`share/shareInbox.ts` uses **IndexedDB** (`kboard-share`, store `pending`),
keyed by a random id. Android's share sheet opens `share-capture.html`, which
writes the payload and redirects to `/?share=<id>`; the app takes (and deletes)
the record once. IndexedDB rather than `localStorage` because a share payload
arrives before any origin-scoped state is guaranteed and must survive a
redirect.

---

## 7. Routing

There is **no router library**. A `view` state enum in `App.tsx` selects the
screen. The only URL parameter read is `?share=<id>`.

Justification: there are three screens with no dynamic path segments. A router
would add a dependency and a failure mode without buying deep-linking, which is
deliberately absent (boards are private to a Drive account).

---

## 8. Testing

### 8.1 Unit and integration — Vitest

```
include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"]
```

**155 tests across 11 files**, jsdom environment. Notable suites:

| Suite | Why it exists |
|---|---|
| `tests/unit/a11y-contrast.test.ts` (52) | Parses `tokens.css` and re-verifies every token; the regression guard for the palette |
| `tests/unit/helpers/contrast.ts` | A **second, independent** contrast implementation so a bug cannot self-cancel against the build script |
| `tests/unit/lintColorLiterals.test.ts` (16) | Tests the linter itself, including its comment-masking edge cases |
| `tests/unit/colorContrast.test.ts` (5) | Asserts `pickForeground` stays in one module and returns the better of the two candidates |
| `tests/integration/state-actions.test.ts` (22) | Board reducer behaviour |

### 8.2 End-to-end — Playwright

`fullyParallel: true`; `retries: 2` in CI; `workers: 1` in CI because dnd-kit
gestures race under concurrency; 30 s test timeout.

| Project | Viewport | Base URL | Server |
|---|---|---|---|
| `chromium-desktop` | 1280×800 | `:5172` | dev (local) / preview (CI) |
| `chromium-tablet` | 768×1024 | `:5172` | same |
| `chromium-mobile` | 360×800 (Pixel 5 descriptor forced to 20:9) | `:5172` | same |
| `pwa` | 1280×800 | `:5173` | production preview |
| `pwa-subpath` | 1280×800 | `:5174` | preview with `BASE_PATH` — excluded from the default run |

**325 tests pass.** Google Identity Services and Drive are replaced by
in-test fakes (`tests/fixtures/fakeAuth.ts`, `fakeDrive.ts`) that intercept the
network, so the suite runs offline and deterministically.

> **Configuration note.** `webServer` must be a **top-level array**. Playwright
> only reads `TestConfig.webServer`; a project-level entry is silently ignored.
> This was previously cast through `unknown` to satisfy `tsc`, which hid a
> genuine no-op that broke all six PWA tests.

### 8.3 Accessibility gates

| Command | Enforces |
|---|---|
| `npm run a11y:contrast` | Every token ≥ 4.5:1 (3:1 for non-text) against the worst-case background of its theme, plus the inverse "on-X" pairs and the two non-token palettes |
| `npm run lint:colors` | No hex literals in `src/` outside a documented allowlist |
| `npm run a11y` | Both |

Both run in CI as a dedicated **Accessibility gates** job, alongside the
existing Type-check job. `npm run test:unit` runs in the same job.

---

## 9. Deployment

### 9.1 GitHub Pages

`BASE_PATH=/<repo>/` is set by the workflow, which Vite uses as `base`. Asset
URLs then resolve under the project-page subpath. A `CNAME` file in `public/`
is copied into `dist/` automatically for custom domains.

### 9.2 Other hosts

Vercel / Netlify / Cloudflare Pages: build `npm run build`, output `dist`, set
`VITE_GOOGLE_CLIENT_ID`. The production origin must be added to
**Authorized JavaScript origins** in the Google Cloud Console.

### 9.3 CI

| Workflow | Trigger | Jobs |
|---|---|---|
| `playwright.yml` | PRs to `main` | Type-check · Accessibility gates · E2E (4 projects) |
| `deploy.yml` | Push to `main` | E2E + subpath tests · Build · Verify PWA artifacts · Deploy |

---

## 10. Known technical debt

| Item | Impact | Plan |
|---|---|---|
| `boundingBox()` fallback in `boardPage.ts` needed an explicit timeout | Flaky mobile tests | Fixed |
| Whole-file writes | Write amplification on very large boards | Accepted; revisit past ~2000 cards |
| No cross-tab `BroadcastChannel` sync | Two open tabs can diverge | Acceptable; Drive revalidation reconciles |
| Bundle is ~750 kB (230 kB gzipped) | First load | Code-split Tiptap, which dominates |
| AAA contrast not implemented | Fails 1.4.6 for teams that require it | Sprint 5, opt-in |
| No automated axe-core scan | Misses a class of a11y bugs | Sprint 4 |

---

## 11. Related documents

- [PRD](./PRD.md) — requirements and product decisions
- [App Flow](./APP-FLOW.md) — screens and navigation
- [UX/UI Design](./UX-UI-DESIGN.md) — design system
- [Data Model](./DATA-MODEL.md) — full schema
- [Implementation Plan](./IMPLEMENTATION-PLAN.md)
