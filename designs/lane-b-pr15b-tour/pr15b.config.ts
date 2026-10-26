import { defineConfig, devices } from '@playwright/test';

/**
 * PR 15b's before/after tour runner (designs/lane-b-pr15b-tour), copied into $TOUR_DIR beside the tour's own files:
 * - populate: the route map's seven populate specs, as tools/lane-b-screen-tour/screens.config.ts runs them;
 * - ledger: ledger-tour.spec.ts (LED-14, LED-15, LED-18 through the product, populate only);
 * - capture: capture.spec.ts, with the repository's e2e text rendering (ADR 0058).
 * Synthetic data only.
 */
const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? '3297'}`;

function definedEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export default defineConfig({
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  outputDir: `${import.meta.dirname}/test-results`,
  use: { baseURL: ORIGIN, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    {
      name: 'populate',
      testDir: '/home/user/screens/apps/web/e2e',
      testMatch: ['layout-1280.spec.ts', 'packets.spec.ts', 'reconciliation.spec.ts', 'monitoring.spec.ts', 'billing.spec.ts', 'contracts.spec.ts', 'reports.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ledger',
      testDir: `${import.meta.dirname}/pr15b`,
      testMatch: ['ledger-tour.spec.ts'],
      use: { ...devices['Desktop Chrome'], actionTimeout: 30_000, navigationTimeout: 60_000 },
    },
    {
      name: 'capture',
      testDir: `${import.meta.dirname}/pr15b`,
      testMatch: ['capture.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 15_000,
        navigationTimeout: 45_000,
        launchOptions: {
          args: ['--font-render-hinting=none', '--disable-lcd-text'],
          env: { ...definedEnvironment(), FONTCONFIG_FILE: '/home/user/screens/apps/web/e2e/fonts.conf' },
        },
      },
    },
  ],
});
