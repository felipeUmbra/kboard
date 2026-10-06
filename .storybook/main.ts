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
    // Filter out VitePWA plugin without overwriting Storybook's own builder plugins
    const filteredPlugins = (config.plugins || []).filter((plugin: any) => {
      const name = Array.isArray(plugin) ? plugin[0]?.name : plugin?.name;
      return !(typeof name === 'string' && (name.includes('pwa') || name.includes('workbox')));
    });

    return {
      ...config,
      plugins: filteredPlugins,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          'virtual:pwa-register': '/src/mocks/pwa-register.ts',
        },
      },
    };
  }
};
export default config;