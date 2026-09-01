# Kboard

A Trello-inspired Kanban board that signs you in with Google and stores your boards as JSON files in your own Google Drive (in the hidden `appDataFolder`, so they don't clutter your Drive UI).

## Features

- ✅ **Google OAuth 2.0** sign-in via Google Identity Services
- ✅ **Google Drive storage** — every board is one JSON file in your `appDataFolder`
- ✅ **Boards, columns, cards** with full CRUD
- ✅ **Drag-and-drop** with `@dnd-kit` — works on touch (long-press) and mouse
- ✅ **Rich text descriptions** powered by Tiptap + DOMPurify (bold, italic, headings, lists, quotes, code)
- ✅ **Personalized labels** with a curated 12-color palette
- ✅ **Personalized custom fields** with 7 types:
  - Short text, long text, number (with optional unit + decimals), percentage, checkbox, date, preset list (with custom options and colors)
- ✅ **Mobile-first responsive design** — drawer sidebar, bottom-sheet modals, column tabs, sticky touch targets
- ✅ **Tablet and desktop** — collapsible rail, multi-column side-by-side, full sidebar
- ✅ **Dark mode** via `prefers-color-scheme`
- ✅ **Accessibility** — keyboard navigation, focus rings, screen-reader announcements, reduced-motion support
- ✅ **Zero backend** — pure static SPA, deploy anywhere

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

## Where your data lives

Boards are stored as JSON files in your Google Drive's **app data folder** (hidden, app-scoped, per-user). You can inspect them with:

1. Open <https://drive.google.com/drive/u/0/settings>
2. Under **General → Folder location → Hidden app data**, click **Manage hidden app data**
3. Or query via Drive API: `appProperties.kind = "kboard.board.v1"`

Each file is named `board-<uuid>.json` and contains the entire board (columns, cards, labels, custom fields).

## Project structure

```
src/
├── auth/          # Google Identity Services wrapper + auth hook
├── components/    # React UI components
│   └── fields/    # Field-related subcomponents (chip, editor, manager)
├── drive/         # Google Drive REST client + board repository
├── hooks/         # Custom React hooks (useViewport)
├── models/        # Domain types, validators, migrations
├── state/         # React context for board state + debounced sync
├── styles/        # Design tokens, global CSS, responsive rules
├── App.tsx
├── main.tsx
└── vite-env.d.ts
```

## Tech stack

- **React 18** + **TypeScript** + **Vite**
- **@dnd-kit** for accessible drag-and-drop
- **Tiptap** + **DOMPurify** for sanitized rich text
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
- iOS Safari 16+
- Android Chrome 110+
- Samsung Internet 22+
- Desktop Chrome, Edge, Firefox, Safari (latest 2 versions)

## License

MIT
