import { defineConfig, devices } from "@playwright/test";

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
  testDir: "tests/e2e",
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "chromium-tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    // In CI, serve the pre-built production bundle via `vite preview` —
    // it handles 4 concurrent workers without the cold-compile latency
    // that `vite dev` suffers on first request. Locally, `vite dev` is
    // used for faster iteration (no build step needed).
    command: process.env.CI ? "npm run preview -- --port 5172 --strictPort" : "npm run dev",
    url: "http://localhost:5172",
    reuseExistingServer: !process.env.CI,
    // The preview server is pre-built and starts almost instantly. The dev
    // server needs ~60 s on a cold cache. Give both a generous budget.
    timeout: 120_000,
    env: {
      // A syntactically-valid client ID so the app's startup gate doesn't throw.
      // Tests don't contact real Google — they intercept via tests/fixtures/fakeAuth.ts.
      VITE_GOOGLE_CLIENT_ID: "fake-client-id.apps.googleusercontent.com",
      // The dev server uses BASE_PATH "/" (default). preview serves the
      // pre-built bundle, also at "/". CI builds without BASE_PATH so the
      // local preview matches what tests expect.
      BASE_PATH: "/",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});