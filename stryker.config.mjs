// @ts-check
/**
 * Mutation testing on the money paths (PRD section 18): the pricing engine, the ledger and the
 * packet verifier. Gate: a mutation score above 85% before Monitoring v1. .github/workflows/mutation.yml runs
 * `pnpm stryker run` on pull requests labelled "money" (a label added after a push starts it) and weekly, after the
 * canary (tools/stryker/canary). The vitest runner selects a mutant's covering tests by name, as Vitest 5 names them
 * through patches/@stryker-mutator__vitest-runner@10.0.0.patch (docs/adr/0064).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  testRunner: 'vitest',
  // pnpm keeps plugins out of @stryker-mutator/core's own node_modules, so name the runner explicitly.
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.stryker.config.ts' },
  mutate: [
    'packages/pricing/src/**/*.ts',
    'packages/ledger/src/**/*.ts',
    // The packet verifier: its check, and the reading of a narrative it rests on (what the text shows,
    // the figures it holds, the inputs they are checked against, the placeholders).
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
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 90, low: 85, break: 85 },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
