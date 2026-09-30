import { defineConfig, devices } from "@playwright/test";

/**
 * Sprint 4.5 — the specs the Firefox and WebKit smoke projects run.
 *
 * Chosen to cover the engine differences that actually matter for this app,
 * rather than breadth:
 *   - `a11y-axe`    — axe-core injects differently per engine; a violation
 *                     that only appears in one engine is a real one.
 *   - `auth`        — popup/token plumbing and the initial render.
 *   - `boards`      — the core CRUD path everything else depends on.
 *   - `board`       — drag and drop, which has the most engine-specific
 *                     pointer behaviour of anything in the app.
 *   - `planner`     — a second, differently-structured view.
 *
 * Deliberately excluded: the PWA projects (service-worker and manifest
 * behaviour is Chromium-specific enough that a WebKit result would be
 * noise), the subpath deployment checks, and the axe contrast spec, which
 * duplicates checks the a11y spec already covers here.
 */
const CROSS_BROWSER_SPECS = [
  "**/a11y-axe.spec.ts",
  "**/auth.spec.ts",
  "**/boards.spec.ts",
  "**/board.spec.ts",
  "**/planner.spec.ts",
];

/**
 * Playwright config for kboard E2E suite.
 *
 * Strategy:
 *   - Spin up the real Vite dev server (port 5172, strictPort=true in vite.config.ts).
 *   - Replace Google Identity Services + Google Drive with in-test fakes.
 *     (See tests/fixtures/fakeAuth.ts and tests/fixtures/fakeDrive.ts.)
 *   - Use a fake (but valid-looking) VITE_GOOGLE_CLIENT_ID so the app's
 *     startup gate (tokenClient.ts -> getClientId) doesn't throw.
 *
 * Run:    npm run test:e2e
 * UI:     npm run test:e2e:ui
 * Debug:  npm run test:e2e:debug
 */
export default defineConfig({
  testDir: "tests",
  testMatch: ["e2e/**/*.spec.ts", "regression/**/*.spec.ts"],
  // Each spec file should be independent — fully parallel is fine.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Two retries make the CI suite robust against the occasional flaky DnD
  // gesture or Vite preview race without masking real regressions.
  retries: process.env.CI ? 2 : 0,
  // CI uses the prebuilt preview server. Even though it's fast, the dnd-kit
  // drag gestures occasionally race under heavy concurrency, so we run with
  // 1 worker in CI for reliability. Locally we let Playwright parallelize.
  workers: process.env.CI ? 1 : undefined,
  // Test timeout bumped a bit because Tiptap + Drive fakes add a small overhead.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: "http://localhost:5172",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // No `actionTimeout` override — defaults are fine.
  },
  projects: [
    {
      name: "chromium-desktop",
      // PWA specs run only in dedicated `pwa`/`pwa-subpath` projects
      // (which spin up their own production preview servers). The
      // desktop/tablet/mobile projects serve the dev server (no SW,
      // root base), so PWA specs would fail there.
      testIgnore: "**/pwa*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "chromium-tablet",
      // Sprint 4.1: the axe-core scans are desktop-only. axe-core is not
      // viewport-sensitive and the tablet/mobile projects render the same
      // DOM, so re-scanning there costs minutes per run to re-detect the
      // same semantics. Layout-dependent checks stay in the specs that do
      // run everywhere (a11y-sprint2-3, responsive-a11y).
      testIgnore: ["**/pwa*.spec.ts", "**/a11y-axe.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "pwa",
      // Only the existing pwa.spec.ts runs here. The subpath spec
      // runs via `npm run test:e2e:subpath` / --project=pwa-subpath.
      testMatch: "**/pwa.spec.ts",
      testIgnore: "**/pwa-subpath.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:5173",
      },
      // NOTE: the production preview server this project needs lives in the
      // top-level `webServer` array, not here. Playwright ignores a
      // project-level `webServer`, which is why this used to be cast through
      // `unknown` and silently did nothing.
    },
    {
      name: "chromium-mobile",
      testIgnore: ["**/pwa*.spec.ts", "**/a11y-axe.spec.ts"],
      use: {
        // A real mobile device descriptor gives consistent emulation
        // (viewport, deviceScaleFactor, isMobile, hasTouch, userAgent).
        // Mixing `Desktop Chrome` with `isMobile: true` produced a scaled
        // layout viewport (404×717) that broke Playwright's hit testing.
        ...devices["Pixel 5"],
        // Pixel 5 is 393x851 ≈ 20:9. Force an exact 20:9 (360x800) layout
        // viewport so the mobile UI is exercised at that aspect ratio; the
        // device descriptor still supplies mobile touch + high-DPI emulation.
        viewport: { width: 360, height: 800 },
      },
    },
    // Subpath deployment: verifies all manifest URLs resolve under /kboard/.
    // Requires an external preview server (npm run test:e2e:subpath starts it).
    // Excluded from `npm run test:e2e` by default — run via
    // `npm run test:e2e:subpath` or explicitly: --project=pwa-subpath.
    {
      name: "pwa-subpath",
      testMatch: "**/pwa-subpath.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: "http://localhost:5174",
      },
    },

    // ── Cross-browser (Sprint 4.5) ─────────────────────────────────────
    // These two exist to catch engine differences, not to re-run the
    // Chromium matrix. They therefore run a deliberately small smoke set —
    // see CROSS_BROWSER_SPECS below — rather than all 333 tests, which
    // would multiply CI time for very little extra signal.
    //
    // Both are excluded from `npm run test:e2e` and run via
    // `npm run test:e2e:crossbrowser` and the dedicated CI job, so the
    // fast-feedback PR gate stays Chromium-only.
    {
      name: "firefox-smoke",
      testMatch: CROSS_BROWSER_SPECS,
      // Firefox and WebKit are markedly slower than Chromium here, and the
      // axe-core scan is the single slowest step in the suite. A project-level
      // timeout gives them room without loosening the bound for the
      // fast-feedback Chromium matrix, where a 30s timeout is a genuine
      // signal that something has hung.
      timeout: 90_000,
      expect: { timeout: 15_000 },
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "webkit-smoke",
      testMatch: CROSS_BROWSER_SPECS,
      timeout: 90_000,
      expect: { timeout: 15_000 },
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      // Main web server for dev/preview — used by chromium-desktop,
      // chromium-tablet and chromium-mobile.
      // In CI: serves the pre-built production bundle via `vite preview`.
      // Locally: uses `vite dev` for fast iteration (no build step).
      command: process.env.CI
        ? "npm run preview -- --port 5172 --strictPort"
        : "npm run dev",
      url: "http://localhost:5172",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_GOOGLE_CLIENT_ID: "fake-client-id.apps.googleusercontent.com",
        BASE_PATH: "/",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // PWA project needs a *production* preview of the built bundle (the
      // service worker and manifest only exist there — vite dev never emits
      // them, since devOptions.enabled is false).
      //
      // This used to live as a `webServer` key inside the `pwa` project entry,
      // cast through `unknown` to satisfy tsc. That was wrong: Playwright
      // 1.62 only reads `webServer` from the TOP-LEVEL TestConfig, and
      // silently ignores it on a project. The preview server therefore never
      // started and all six pwa.spec.ts tests failed with
      // ERR_CONNECTION_REFUSED on :5173.
      //
      // As an array, every entry boots regardless of which project is
      // selected, so the preview build now actually runs. Playwright requires
      // baseURL to be set explicitly when webServer is an array — the `pwa`
      // project already sets its own baseURL, so the top-level one only
      // applies to the other projects.
      command: process.env.CI
        ? "npm run preview -- --port 5173 --strictPort"
        : "npm run build && npm run preview -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        VITE_GOOGLE_CLIENT_ID: "fake-client-id.apps.googleusercontent.com",
        BASE_PATH: "/",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});