import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests for the agent only. Run with `yarn test:agent` (or `yarn test:agent:watch`).
export default defineConfig({
  // Keep Vitest's cache in the repo's top-level node_modules (already gitignored),
  // not in src/agent/node_modules.
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite', import.meta.url)),
  resolve: {
    // Same `@/` alias as tsconfig.json, so tests import exactly like the app does.
    alias: { '@': fileURLToPath(new URL('../', import.meta.url)) },
  },
  test: {
    root: fileURLToPath(new URL('./', import.meta.url)),
    include: ['**/*.test.ts'],
    environment: 'node',
  },
});
