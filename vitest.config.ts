import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
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
      // Sprint 4.6, then raised to a real gate once the state-action layer
      // was covered. These are now measured, not aspirational: every branch
      // in `src/models/**` and `src/state/**` is exercised, and anything
      // added without a test now fails the build.
      //
      // Getting here meant fixing real defects rather than writing tests to
      // match the code — see the activity-log loss in `patchCard`, the
      // board-scope `removePresetOption` no-op, the `labelIds` cast, and the
      // `normalizeBoard` crash on a null column. Four provably-dead guards
      // were deleted instead of being covered, since a test that has to
      // contrive an impossible input is not worth its maintenance.
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
