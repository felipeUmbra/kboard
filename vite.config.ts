import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the app at https://<owner>.github.io/<repo>/.
// In every other environment (local dev, Vercel, Netlify, a custom
// domain) we want the assets rooted at "/" so the app loads from the
// domain root.
//
// The `BASE_PATH` env var lets you override the GitHub-Pages subpath
// (e.g. when you fork the project or rename the repo). Set it to
// "/<your-repo-name>/" in the GitHub Actions workflow, or leave it
// unset for root deployments.
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // We register from main.tsx ourselves so we can dispatch custom
      // events into the React tree. injectRegister:false makes the
      // plugin skip the auto-injected registration snippet.
      injectRegister: false,
      // Prompt, not auto-update: the user must click "Reload" in the
      // UpdateToast. skipWaiting:false is required for that to work;
      // the toast calls the updateSW(true) we expose on window to
      // force the new SW to activate on the user's terms.
      registerType: "prompt",
      // Use Workbox's `generateSW` mode: a tested, batteries-included
      // runtime that precaches globPatterns and handles navigation
      // fallbacks. We do NOT use injectManifest because we have no
      // need for hand-written Workbox code.
      strategies: "generateSW",
      workbox: {
        // Precache the SPA shell + every Vite-hashed asset + icons +
        // manifest + the share-capture helper. The plugin will replace
        // this glob with a concrete file list at build time.
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,webmanifest,woff2}",
        ],
        cleanupOutdatedCaches: true,
        // Drive API and Google Identity Services must NEVER be cached:
        // tokens are short-lived, the OAuth popup flow must not be
        // intercepted, and we never want to replay a stale board.
        navigateFallbackDenylist: [
          /^https:\/\/accounts\.google\.com\//,
          /^https:\/\/googleapis\.com\//,
          /^https:\/\/[a-z0-9.-]+\.googleapis\.com\//,
        ],
        // SPA navigation fallback: any unknown same-origin URL is
        // served index.html so the React router takes over (and the
        // page works offline). The share-capture.html path is
        // excluded by being a real file Workbox precaches.
        navigateFallback: "/index.html",
        // Users on an old SW must explicitly opt in to a new version.
        skipWaiting: false,
        clientsClaim: false,
      },
      manifest: {
        name: "Kboard",
        short_name: "Kboard",
        description:
          "A Trello-inspired Kanban board backed by your Google Drive.",
        // start_url is relative to the manifest URL. On GitHub Pages
        // the manifest lives at <BASE_PATH>/manifest.webmanifest, and
        // "/" resolves to the same scope, so a single value works
        // for both root and subpath deployments.
        start_url: "/",
        scope: "/",
        id: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#f4f5f7",
        theme_color: "#0079bf",
        categories: ["productivity", "utilities"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        // Web Share Target API: Android "Share to Kboard" lands here.
        // We use a real HTML file as the action URL so GitHub Pages
        // (and any static host) can serve a 200 with a real body, and
        // the share-capture page persists the payload to IndexedDB
        // and redirects to /?share=<id> as a normal GET.
        share_target: {
          action: "/share-capture.html",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
          },
        },
      },
      // No SW in dev — keeps Vite HMR fast and avoids fighting the
      // existing dev-only SW-unregister script in index.html. The SW
      // exists in `npm run build` / `npm run preview` only.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5172,
    strictPort: true,
    host: true,
    // Cross-Origin-Opener-Policy headers. Without `same-origin-allow-popups`
    // modern Chrome (>= 83) breaks Google Identity Services: the OAuth
    // popup cannot report back via window.closed, so the token callback
    // never fires and the user is stuck on the login screen. This header
    // tells the browser "it's fine if a popup we open doesn't share our
    // origin, let it talk back to us" — which is exactly what GIS needs.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
    },
  },
  preview: {
    port: 5172,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "unsafe-none",
    },
  },
});
