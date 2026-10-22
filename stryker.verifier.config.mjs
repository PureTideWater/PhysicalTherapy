// @ts-check
/**
 * Mutation testing of the packet verifier alone (PRD section 18; docs/adr/0047): its check and the
 * reading of a narrative it rests on. `pnpm stryker run stryker.verifier.config.mjs`.
 *
 * Under Vitest 5 the vitest runner of stryker.config.mjs reported most of these mutants as survived
 * without running a test (a reported survivor applied by hand fails the tests), so this configuration
 * uses Stryker's command runner: every mutant runs the whole packets unit suite, stopping at the
 * first failure. The cause was the runner's test names, which selected no test under Vitest 5; the
 * runner is patched for it (patches/@stryker-mutator__vitest-runner@10.0.0.patch, docs/adr/0064), and
 * this configuration keeps the command runner its 2026-10-16 score was measured with.
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
    // The payer and plan as the payer's copy names them, which the facts quote (a plan known only by its claim filing
    // indicator by the table of its words), and the pattern the scanner reads a remittance key by.
    'packages/packets/src/payer.ts',
    // The package's surface, which exports that table to the payer's copy (re-exports only, so no mutant of its own).
    'packages/packets/src/index.ts',
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
