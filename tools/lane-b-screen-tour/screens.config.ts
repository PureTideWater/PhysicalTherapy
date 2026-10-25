import { defineConfig, devices } from '@playwright/test';

/**
 * The screen tour's runner (outside the repository). Two projects, run one at a time:
 * - populate: a handful of the repository's own e2e journeys, unchanged, run against this tour's server, so the
 *   practices they create hold the synthetic records the journeys build through the product (uploads of the
 *   SYNTHETIC fixtures, the worker's own jobs, the browser's own steps);
 * - capture: the tour itself (capture/tour.spec.ts), which signs in as each role and saves full-page PNGs.
 * The server is started separately (the standalone build, as the e2e webServer starts it). Synthetic data only.
 */
const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? '3297'}`;

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
      testMatch: ['layout-1280.spec.ts', 'packets.spec.ts', 'reconciliation.spec.ts', 'monitoring.spec.ts', 'billing.spec.ts', 'contracts.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capture',
      testDir: `${import.meta.dirname}/capture`,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
