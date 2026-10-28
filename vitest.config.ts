import path from 'node:path';

import { configDefaults, defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/** The docker-compose Postgres, used when DATABASE_URL is not set. Synthetic data only. */
const LOCAL_DATABASE_URL = 'postgres://postgres:test@localhost:5432/postgres';

const WORKSPACES = '{apps,packages,infra,tools}';
const ignored = [...configDefaults.exclude, '**/.next/**', '**/cdk.out/**', '**/.stryker-tmp/**', 'apps/web/e2e/**'];

/**
 * 100% branch coverage on the money helpers, the pricing engine, the ledger, the parser and the authorization helpers
 * (PRD section 18; the money helpers since docs/adr/0066, Part 4), each measured on its own. Authorization helpers live
 * in packages/db/src/authz.
 */
export const BRANCH_GATED = [
  'packages/money/src/**',
  'packages/pricing/src/**',
  'packages/ledger/src/**',
  'packages/edi835/src/**',
  'packages/db/src/authz/**',
];

/**
 * Fails a CI run that lacks Playwright's Chromium instead of skipping the tests that print (test matrix CI-05;
 * docs/adr/0066): the unit and db projects' global setup.
 */
const CHROMIUM_ON_CI = ['tools/test/ci-chromium.ts'];

/**
 * Database files whose run is long and whose source is short, root-relative: the generated route tests (two lines
 * each), SCR-19's lease wait (about 190 s on CI) and CAS-41's bounded readers (triage's and the report's, each building
 * months of 10,000 and 20,000 generated lines and measuring their readers on both: 5.5 and 8 minutes locally;
 * SUITE-CAP-1a, docs/adr/0083). Each shard starts its slowest files first, by the durations in the results cache
 * (node_modules/.vite/vitest, which CI restores per shard); a file with no recorded duration falls back to its size,
 * which would start these last. So, without a recorded duration, these start first.
 */
export const SLOW_FIRST: readonly RegExp[] = [
  /^apps\/web\/src\/lib\/routes\/route-tests\/route-tests\.\d+\.db\.test\.ts$/,
  /^apps\/worker\/src\/screening\/consumer-lease\.db\.test\.ts$/,
  /^apps\/worker\/src\/triage\/batched\.db\.test\.ts$/,
  /^apps\/worker\/src\/report\/streamed\.db\.test\.ts$/,
];

/**
 * Vitest's own order (a project's files failed first, then longest first by the results cache, then largest first),
 * with SLOW_FIRST's files that have no recorded duration moved to the front of their project. Which files a shard
 * runs is BaseSequencer's shard(), unchanged: by the hash of each file's path (tools/test/db-shards.test.ts, CI-04).
 */
export class SlowFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    const unrecorded = (spec: TestSpecification) =>
      this.ctx.cache.getTestSpecificationResult(spec) === undefined && SLOW_FIRST.some((pattern) => pattern.test(path.relative(this.ctx.config.root, spec.moduleId).split(path.sep).join('/')));
    // super.sort() keeps each project's files together; each run of them is reordered on its own.
    const runs: TestSpecification[][] = [];
    for (const spec of sorted) {
      const run = runs.at(-1);
      if (run?.[0]?.project === spec.project) {
        run.push(spec);
      } else {
        runs.push([spec]);
      }
    }
    return runs.flatMap((run) => [...run.filter(unrecorded), ...run.filter((spec) => !unrecorded(spec))]);
  }
}

export default defineConfig({
  // Vite's default, named because CI caches the results cache under it (node_modules/.vite/vitest; docs/adr/0066).
  cacheDir: 'node_modules/.vite',
  test: {
    sequence: { sequencer: SlowFirstSequencer },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [`${WORKSPACES}/**/*.test.{ts,tsx}`],
          exclude: [...ignored, '**/*.db.test.ts', '**/*.golden.test.ts'],
          globalSetup: CHROMIUM_ON_CI,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: [`${WORKSPACES}/**/*.db.test.ts`],
          exclude: ignored,
          globalSetup: CHROMIUM_ON_CI,
          env: { DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL },
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // global.gc, so a memory bound counts what a path holds after full collections rather than
          // the garbage V8 has yet to collect (apps/worker/src/intake/intake.large.db.test.ts).
          execArgv: ['--expose-gc'],
        },
      },
      {
        extends: true,
        test: {
          name: 'golden',
          include: [`${WORKSPACES}/**/*.golden.test.ts`],
          exclude: ignored,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/worker/src/**/*.ts', 'apps/web/src/lib/**/*.ts', 'tools/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/cli.ts', '**/cli/**', 'apps/worker/src/main.ts', 'tools/**/index.ts', 'tools/dev.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      thresholds: Object.fromEntries(BRANCH_GATED.map((glob) => [glob, { branches: 100 }])),
    },
  },
});
