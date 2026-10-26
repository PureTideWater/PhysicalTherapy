import { defineConfig, devices } from '@playwright/test';

/**
 * The screen tour's runner (outside the repository). Two projects, run one at a time:
 * - populate: a handful of the repository's own e2e journeys, unchanged, run against this tour's server, so the
 *   practices they create hold the synthetic records the journeys build through the product (uploads of the
 *   SYNTHETIC fixtures, the worker's own jobs, the browser's own steps);
 * - capture: the tour itself (capture/tour.spec.ts), which signs in as each role and saves full-page PNGs of every
 *   reachable page, its dark tokens, and the states and interactions the route map names. Its tests run in order in
 *   one worker (a serial describe); each sets its own timeout. Its browser rasterizes text as the repository's e2e
 *   browser does (apps/web/playwright.config.ts, docs/adr/0058: no hinting, grayscale antialiasing, e2e/fonts.conf), so
 *   the tour's pixels match the brand baselines' rendering.
 * The server is started separately (the standalone build, as the e2e webServer starts it). Synthetic data only.
 */
const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? '3297'}`;

/** The runner's environment, which the browser keeps beside FONTCONFIG_FILE (as the repository's config does). */
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
      // The route map's populate specs (designs/lane-b-ux-review/route-map.json), unchanged and whole. reports.spec.ts is
      // the only source of an audit report, its reviewer checklist and deterministically printed report documents.
      // uploads.spec.ts and remittances.spec.ts stay out: they write NORTH and SOUTH, which every empty state uses.
      testMatch: ['layout-1280.spec.ts', 'packets.spec.ts', 'reconciliation.spec.ts', 'monitoring.spec.ts', 'billing.spec.ts', 'contracts.spec.ts', 'reports.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capture',
      testDir: `${import.meta.dirname}/capture`,
      use: {
        ...devices['Desktop Chrome'],
        // Bounded steps: an action or a navigation that cannot happen fails its shot with a reason instead of hanging
        // the run until the test's timeout (the first whole-app run hung on one click).
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
