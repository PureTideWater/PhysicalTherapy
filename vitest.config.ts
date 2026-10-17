import { configDefaults, defineConfig } from 'vitest/config';

/** The docker-compose Postgres, used when DATABASE_URL is not set. Synthetic data only. */
const LOCAL_DATABASE_URL = 'postgres://postgres:test@localhost:5432/postgres';

const WORKSPACES = '{apps,packages,infra,tools}';
const ignored = [...configDefaults.exclude, '**/.next/**', '**/cdk.out/**', '**/.stryker-tmp/**', 'apps/web/e2e/**'];

/**
 * 100% branch coverage on the pricing engine, the ledger, the parser and the authorization helpers
 * (PRD section 18), each measured on its own. Authorization helpers live in packages/db/src/authz.
 */
export const BRANCH_GATED = [
  'packages/pricing/src/**',
  'packages/ledger/src/**',
  'packages/edi835/src/**',
  'packages/db/src/authz/**',
];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [`${WORKSPACES}/**/*.test.{ts,tsx}`],
          exclude: [...ignored, '**/*.db.test.ts', '**/*.golden.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: [`${WORKSPACES}/**/*.db.test.ts`],
          exclude: ignored,
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
