import { configDefaults, defineConfig } from 'vitest/config';

/** The packets unit tests, which Stryker runs against each mutant of the verifier (stryker.verifier.config.mjs). */
export default defineConfig({
  test: {
    include: ['packages/packets/src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
  },
});
