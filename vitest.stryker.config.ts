import { configDefaults, defineConfig } from 'vitest/config';

/** The unit and golden tests of the packages Stryker mutates (stryker.config.mjs). */
export default defineConfig({
  test: {
    include: ['packages/{pricing,ledger,packets}/src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
  },
});
