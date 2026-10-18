// @ts-check
/**
 * Mutation testing of the packet verifier alone (PRD section 18; docs/adr/0047): its check and the
 * reading of a narrative it rests on. `pnpm stryker run stryker.verifier.config.mjs`.
 *
 * Under Vitest 5 the vitest runner of stryker.config.mjs reports most of these mutants as survived
 * without running a test (a reported survivor applied by hand fails the tests), so this configuration
 * uses Stryker's command runner: every mutant runs the whole packets unit suite, stopping at the
 * first failure.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'command',
  commandRunner: { command: 'node node_modules/vitest/vitest.mjs run --config vitest.stryker.packets.config.ts --bail 1' },
  coverageAnalysis: 'off',
  mutate: [
    'packages/packets/src/verifier/**/*.ts',
    'packages/packets/src/readable.ts',
    'packages/packets/src/scan.ts',
    'packages/packets/src/facts.ts',
    'packages/packets/src/placeholders.ts',
    '!**/*.test.ts',
  ],
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/verifier.html' },
  jsonReporter: { fileName: 'reports/mutation/verifier.json' },
  thresholds: { high: 90, low: 85, break: 85 },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
