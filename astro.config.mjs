import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  output: 'static',
  integrations: [react()],
  vite: {
    build: { assetsInlineLimit: 0 },
    plugins: [{
      name: 'separate-vite-mode-caches',
      // Astro check/sync must not replace the live dev server's React JSX runtime.
      config: (_, { mode }) => ({
        cacheDir: fileURLToPath(new URL(`./node_modules/.vite-${mode}/`, import.meta.url)),
      }),
    }],
  },
  devToolbar: { enabled: false },
});
