# Kboard

A Trello-inspired Kanban board that signs you in with Google and stores your boards as JSON files in your own Google Drive (in the hidden `appDataFolder`, so they don't clutter your Drive UI).

## Features

- ✅ **Google OAuth 2.0** sign-in via Google Identity Services
- ✅ **Google Drive storage** — every board is one JSON file in your `appDataFolder`
- ✅ **Boards, columns, cards** with full CRUD
- ✅ **Drag-and-drop** with `@dnd-kit` — works on touch (long-press) and mouse
- ✅ **Three-level card hierarchy** — Epics contain Stories, Stories contain Tasks, with type-safe parent linking, cycle prevention, and progress rollup
- ✅ **Activity log** — every change is auto-recorded (create, title/description/type/label/parent/date changes, moves, comments) with filterable pills and a collapsible timeline
- ✅ **Comments** — per-card threaded comments with author, avatar, and timestamp; current user can delete their own
- ✅ **Rich text descriptions** powered by Tiptap + DOMPurify (bold, italic, headings, lists, quotes, code)
- ✅ **Personalized labels** with a curated 12-color palette
- ✅ **Personalized custom fields** with 7 types:
  - Short text, long text, number (with optional unit + decimals), percentage, checkbox, date, preset list (with custom options and colors)
- ✅ **Per-type fields** — each card type (Epic/Story/Task) can have its own set of custom fields
- ✅ **In-editor "+ Add child / parent"** — create a new card pre-linked to the current one without leaving the editor; the new card opens with focus on the title and an undo on discard
- ✅ **Cross-card navigation** — click a parent or child chip in the editor to jump to that card; the previous card's in-progress edits are auto-saved
- ✅ **In-memory drafts with localStorage recovery** — unsaved title/description edits survive page reloads and navigation; explicit discard marks the draft as a tombstone
- ✅ **Background Drive reconciliation** — opening a board re-checks Drive in the background (60 s TTL per board); newer versions replace the cache without disrupting the user
- ✅ **Offline-first cache** — boards and revalidation metadata are persisted to `localStorage` so the boards list and the last seen board content load instantly, even with no network
- ✅ **Mobile-first responsive design** — drawer sidebar, bottom-sheet modals, column tabs, sticky touch targets
- ✅ **Tablet and desktop** — collapsible rail, multi-column side-by-side, full sidebar
- ✅ **Dark mode** via `prefers-color-scheme`
- ✅ **Accessibility** — keyboard navigation, focus rings, screen-reader announcements, reduced-motion support
- ✅ **End-to-end tested** with Playwright across 3 viewports (desktop, tablet, mobile) against a fake Drive + fake Google Identity Services
- ✅ **Zero backend** — pure static SPA, deploy anywhere
- ✅ **Installable Progressive Web App** — manifest + service worker; "Add to Home Screen" on iOS / Android gives you a standalone app icon, splash screen, and full-screen launch
- ✅ **Offline app shell** — Workbox precaches the SPA shell, manifest, and icons so the boards list loads even with no network. Drive writes are deferred via the existing in-memory + localStorage draft path until you're back online
- ✅ **Web Share Target** — "Share to Kboard" from any Android app lands as a new board with the shared text and URL pre-filled in the first card

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Set up Google OAuth credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. **Enable the Google Drive API** for the project:
   - APIs & Services → Library → search "Google Drive API" → Enable
4. **Configure the OAuth consent screen**:
   - APIs & Services → OAuth consent screen
   - User type: **External** (or Internal for Workspace)
   - Add scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.appdata`
   - Add your email as a test user (while in Testing mode)
5. **Create an OAuth client ID**:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5172` (for development)
     - Your production origin (when deploying)
   - Copy the **Client ID**

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and replace `your-client-id-here.apps.googleusercontent.com` with your actual client ID:

```
VITE_GOOGLE_CLIENT_ID=123456789-abc...xyz.apps.googleusercontent.com
```

### 4. Run the dev server

```bash
npm run dev
```

Open <http://localhost:5172/> and click **Sign in with Google**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR at <http://localhost:5172> |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run test:e2e` | Run the full Playwright end-to-end suite (spins up Vite + fake Drive) |
| `npm run test:e2e:chromium` | Run the e2e suite against the desktop Chromium project only (faster local loop) |
| `npm run test:e2e:ui` | Open the Playwright UI mode for interactive debugging |
| `npm run test:e2e:headed` | Run the e2e suite with a visible browser window |
| `npm run test:e2e:debug` | Run the e2e suite with the Playwright inspector attached |
| `npm run test:e2e:report` | Open the last HTML report from a Playwright run |

## Where your data lives

Boards are stored as JSON files in your Google Drive's **app data folder** (hidden, app-scoped, per-user). You can inspect them with:

1. Open <https://drive.google.com/drive/u/0/settings>
2. Under **General → Folder location → Hidden app data**, click **Manage hidden app data**
3. Or query via Drive API: `appProperties.kind = "kboard.board.v1"`

Each file is named `board-<uuid>.json` and contains the entire board (columns, cards, labels, custom fields, parent links, comments, activity log entries).

### Client-side caches and drafts

In addition to the Drive-backed JSON, the app keeps three small structures in `localStorage` for offline-first behavior and crash recovery:

| Key | What it stores | Lifecycle |
|---|---|---|
| `kboard:boards-cache` | The boards list and the last saved version of each board (so the boards list and last-seen content load instantly, even offline). | Wiped on `logout`. |
| `kboard:boards-cache-meta` | A per-board `lastCheckedAt` timestamp driving the background Drive revalidation TTL (60 s per board). | Wiped on `logout`. |
| `kboard:card-drafts` | Unsaved title/description edits per card. The app auto-saves drafts when you navigate between cards, and persists them across page reloads. Discarding a draft via the confirm dialog marks it as a tombstone so the editor opens clean on the next open. | Wiped on `logout`. |

Writes to Drive are debounced (600 ms) and use optimistic concurrency via the file's `version` (ETag) returned by the API. If the same file is edited in two tabs, the loser of the race re-reads the winner's version and surfaces a banner with a recovery action.

## Project structure

```
src/
├── auth/              # Google Identity Services wrapper + auth hook
├── components/        # React UI components
│   ├── fields/        # Custom field subcomponents (chip, editor, manager)
│   ├── ActivityLog.tsx, ChildrenList.tsx, CommentThread.tsx, …
├── drive/             # Google Drive REST client + board repository
├── hooks/             # Custom React hooks (useViewport)
├── models/            # Domain types, validators, migrations, progress rollup
├── state/             # React context for board state + debounced sync
│   ├── cardDrafts.ts  # localStorage-backed in-progress card edits
│   └── BoardContext.tsx, boardActions.ts, cardActions.ts, …
├── styles/            # Design tokens, global CSS, responsive rules
├── App.tsx
├── main.tsx
└── vite-env.d.ts
tests/
├── e2e/               # Playwright end-to-end specs (board, sync, hierarchy, …)
├── fixtures/          # fakeDrive, fakeAuth (intercept Google APIs in tests)
└── helpers/           # BoardPage, selectors, login helpers
```

## Tech stack

- **React 18** + **TypeScript** + **Vite**
- **@dnd-kit** for accessible drag-and-drop
- **Tiptap** + **DOMPurify** for sanitized rich text
- **react-day-picker** for start/due date pickers
- **date-fns** for relative timestamps in the activity log and comments
- **Playwright** for end-to-end tests (with a fake Drive and fake Google Identity Services so the suite runs offline)
- **Google Identity Services** for OAuth
- **Google Drive REST API v3** for storage
- Zero backend — pure client-side SPA

## Deploying

`npm run build` produces a static `dist/` folder. Deploy it to any static host:

- **Vercel / Netlify**: connect the repo, framework preset: Vite. Add `VITE_GOOGLE_CLIENT_ID` to env vars.
- **GitHub Pages**: see [Deployment to GitHub Pages](#deployment-to-github-pages) below — a workflow file is already included.
- **Cloudflare Pages**: build command `npm run build`, output `dist`.

After deploying, add your production URL to the **Authorized JavaScript origins** in the Google Cloud Console.

## Deployment to GitHub Pages

A workflow is provided at `.github/workflows/deploy.yml`. It builds and deploys `dist/` to GitHub Pages on every push to `main` (and can also be triggered manually from the Actions tab).

**One-time setup:**

1. **Enable GitHub Pages** in your repo settings → *Pages* → *Source* → **GitHub Actions**.
2. **(Recommended) Add your OAuth Client ID as a secret:** go to *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: the Client ID from Google Cloud Console (the one that ends in `.apps.googleusercontent.com`)
3. **Add the production origin** to your Google OAuth client: in Google Cloud Console → *APIs & Services* → *Credentials* → click your Web client → *Authorized JavaScript origins* → add:
   - `https://<your-github-username>.github.io` (if deploying to a user/org root)
   - `https://<your-github-username>.github.io/<repo-name>` (if deploying to a project page, which is the default for this workflow)

That's it. Push to `main` and the workflow will:

1. Install Node 20 + dependencies
2. Run `npm run typecheck` (fail the build on type errors)
3. Build with `BASE_PATH=/<repo-name>/` so asset URLs resolve under the project-page subpath
4. Upload the artifact and deploy via the official `actions/deploy-pages` action

After the first successful run, your app is live at `https://<your-github-username>.github.io/<repo-name>/`.

**Custom domain?** Add a `CNAME` file inside `public/` (Vite copies it into `dist/` automatically) and set `BASE_PATH: "/"` in the workflow.

**Troubleshooting:**

- *Blank page after deploy:* open DevTools → Console. If you see 404s for `assets/...`, your `BASE_PATH` is wrong. Update the workflow to match your repo name.
- *"Missing required parameter: client_id"* on the login screen: the placeholder Client ID was used. Set the `VITE_GOOGLE_CLIENT_ID` secret and re-run the workflow.
- *Google OAuth popup blocked:* add the production URL to **Authorized JavaScript origins** in Google Cloud Console.

## Browser support

Tested on:
- iOS Safari 16.4+ (full PWA: manifest-driven install + service worker)
- iOS Safari 16.0–16.3 (PWA install via explicit Apple meta tags; no push)
- Android Chrome 110+
- Samsung Internet 22+
- Desktop Chrome, Edge, Firefox, Safari (latest 2 versions)

The PWA install prompt is offered by Chrome / Edge / Samsung on Android and desktop. iOS uses **Share → Add to Home Screen** instead; the result is the same — a standalone app with the Kboard icon and theme color.

## License

MIT
