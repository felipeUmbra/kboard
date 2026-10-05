import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "src/**/*.stories.tsx",
    ],
    setupFiles: [".storybook/test-setup.ts"],
  },
});