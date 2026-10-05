import type { StorybookConfig } from '@storybook/react-vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
    "msw-storybook-addon"
  ],
  "framework": "@storybook/react-vite",
  "staticDirs": ["../public"],
  async viteFinal(config) {
    // Create a fresh Vite config without PWA plugin
    return defineConfig({
      ...config,
      plugins: [
        react(),
        // Explicitly NOT including VitePWA
      ],
      // Externalize the PWA virtual module
      build: {
        ...config.build,
        rollupOptions: {
          ...config.build?.rollupOptions,
          external: [...(config.build?.rollupOptions?.external || []), 'virtual:pwa-register'],
        },
        manifest: false,
      },
      // Also define the module for development
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          'virtual:pwa-register': '/src/mocks/pwa-register.ts',
        },
      },
    });
  }
};
export default config;