import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Only the pure logic layers are instrumented. Components are covered
      // through the Playwright suite instead — a jsdom render of a card
      // proves little that a real browser does not, and the E2E matrix is
      // already the regression net for UI behaviour.
      include: ["src/models/**/*.ts", "src/state/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Sprint 4.6. These are a floor to catch untested NEW logic, not a
      // target to chase — they are set just below the measured values so a
      // regression fails but normal fluctuation does not.
      //
      // The current shape is lopsided and deliberately so. `src/models/*` is
      // pure logic and is well covered (90%+). `src/state/*actions.ts` is
      // React context wiring with zero unit coverage: those files bind pure
      // action creators to the reducer but are exercised end-to-end instead,
      // which is why lines sit near 50 while branches sit above 75. Closing
      // that gap means testing the wiring, not more model tests.
      //
      // Raising these should be a deliberate, separate change with the
      // state-action gap addressed first.
      thresholds: {
        lines: 50,
        statements: 50,
        functions: 60,
        branches: 70,
      },
    },
  },
});
