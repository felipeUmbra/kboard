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
  retries: process.env.CI ? 2 : 0,
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
    command: "npm run dev",
    url: "http://localhost:5172",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // A syntactically-valid client ID so the app's startup gate doesn't throw.
      // Tests don't contact real Google — they intercept via tests/fixtures/fakeAuth.ts.
      VITE_GOOGLE_CLIENT_ID: "fake-client-id.apps.googleusercontent.com",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});