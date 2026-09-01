import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react()],
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
