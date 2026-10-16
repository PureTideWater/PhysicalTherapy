import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

import { E2E_BILLING_DIR, E2E_DEV_AUTH_DIR, E2E_DOCUMENTS_DIR, E2E_MODEL_OUTPUTS_DIR, E2E_ORIGIN, E2E_PORT, e2eAdminUrl, e2eDatabaseUrl } from './e2e/env';
import { developmentMasterKey } from './src/lib/server/config';

/**
 * Playwright's own Chromium is used where it is installed (PLAYWRIGHT_BROWSERS_PATH). Where it is
 * not, such as a hosted CI runner, the system Google Chrome is used instead of downloading one.
 */
const bundledChromium = existsSync(chromium.executablePath());

/** The application role's dev login on the e2e database (packages/db/src/roles.ts, tp_app_dev). */
function appLoginUrl(): string {
  const url = new URL(e2eDatabaseUrl());
  url.username = 'tp_app_dev';
  url.password = 'tp_app_dev';
  return url.toString();
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(bundledChromium ? {} : { channel: 'chrome' }) },
    },
  ],
  // The production build, as the container runs it, against a database prepared and seeded for this
  // run (e2e/prepare.ts) and the local identity provider. Synthetic data only.
  webServer: {
    command: `../../node_modules/.bin/tsx e2e/prepare.ts && pnpm run build && PORT=${String(E2E_PORT)} bash scripts/start-standalone.sh`,
    url: `http://127.0.0.1:${String(E2E_PORT)}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      E2E_ADMIN_URL: e2eAdminUrl(),
      DATABASE_URL: appLoginUrl(),
      APP_ORIGIN: E2E_ORIGIN,
      // The production build with the local providers, which only the e2e suite may ask for.
      TP_ALLOW_LOCAL_PROVIDERS: 'e2e',
      TP_AUTH_PROVIDER: 'dev',
      TP_DEV_AUTH_DIR: E2E_DEV_AUTH_DIR,
      TP_KEY_PROVIDER: 'local',
      // The development master key the seed wrapped the practices' data keys with (src/lib/server/config.ts).
      TP_LOCAL_MASTER_KEY: developmentMasterKey().toString('base64'),
      AUTH_COOKIE_SECRET: randomBytes(32).toString('base64'),
      // Billing on the local Stripe test-mode simulator, its state in this run's own directory (docs/adr/0050).
      BILLING_PROVIDER: 'local',
      BILLING_LOCAL_DIR: E2E_BILLING_DIR,
      // Uploads land in a local directory (the e2e suite's worker reads it) and queue on pg-boss's login.
      DOCUMENTS_DIR: E2E_DOCUMENTS_DIR,
      QUEUE_DATABASE_URL: e2eDatabaseUrl(),
      // The model gateway on the local deterministic provider: it answers only the outputs a journey
      // wrote for its exact requests (e2e/models.ts) and proposes nothing otherwise (docs/adr/0052).
      MODEL_PROVIDER: 'local',
      MODEL_LOCAL_FIXTURES_DIR: E2E_MODEL_OUTPUTS_DIR,
    },
  },
});
