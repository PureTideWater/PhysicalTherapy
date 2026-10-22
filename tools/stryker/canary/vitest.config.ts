import { defineConfig } from 'vitest/config';

/** The mutation canary's one test file (tools/stryker/canary/stryker.config.mjs). */
export default defineConfig({
  test: {
    include: ['tools/stryker/canary/canary.test.ts'],
  },
});
