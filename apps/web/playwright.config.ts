import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { chromium, defineConfig, devices } from '@playwright/test';

import {
  E2E_AGREEMENTS_DIR,
  E2E_BILLING_DIR,
  E2E_COMPLIANCE_DIR,
  E2E_DEV_AUTH_DIR,
  E2E_DOCUMENTS_DIR,
  E2E_ESIGN_DIR,
  E2E_ESIGN_SECRET,
  E2E_MODEL_OUTPUTS_DIR,
  E2E_ORIGIN,
  E2E_PORT,
  e2eAdminUrl,
  e2eDatabaseUrl,
} from './e2e/env';
import { developmentMasterKey } from './src/lib/server/config';

/**
 * Playwright's own Chromium is used where it is installed (PLAYWRIGHT_BROWSERS_PATH, or Playwright's
 * cache). CI installs it before the e2e step (ci.yml: playwright install --with-deps chromium), so the
 * brand journey's pixel baselines, made with this build, are compared under the same one (docs/adr/0058).
 * Where it is not installed, the system Google Chrome is used instead of downloading one; the other
 * journeys run there as they are, and the pixel comparisons may differ.
 */
const bundledChromium = existsSync(chromium.executablePath());

/**
 * How the e2e browser rasterizes text: fixed here, not taken from the host (docs/adr/0058). Chromium on Linux takes
 * its text rendering from the host's fontconfig, the self-hosted brand faces included, so one build drew the baselines'
 * text differently on a runner with fontconfig's stock hinting than on the machine that made them. These switches set
 * the parameters instead: no hinting, and grayscale antialiasing rather than LCD text (Chromium 141 honours both). The
 * fontconfig the browser reads is e2e/fonts.conf, which takes the host's font directories and assigns the same
 * properties over whatever the host sets (the one the switches leave to fontconfig is whether text is antialiased).
 */
const textRendering = {
  args: ['--font-render-hinting=none', '--disable-lcd-text'],
  env: { ...definedEnvironment(), FONTCONFIG_FILE: path.join(import.meta.dirname, 'e2e/fonts.conf') },
};

/** The runner's environment, which the browser keeps beside FONTCONFIG_FILE. */
function definedEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

/** A dev login on the e2e database (packages/db/src/roles.ts: tp_app_dev, tp_billing_dev, tp_esign_dev; each password is its name). */
function devLoginUrl(login: 'tp_app_dev' | 'tp_billing_dev' | 'tp_esign_dev'): string {
  const url = new URL(e2eDatabaseUrl());
  url.username = login;
  url.password = login;
  return url.toString();
}

/** This repository's tsx, from apps/web, where the web server's command runs. */
const TSX = '../../node_modules/.bin/tsx';

/**
 * The build the journeys run (docs/adr/0066). By default this run builds it. With E2E_PREBUILT=1 (CI's e2e shards,
 * which download the one build CI's build job made) it runs the build that is there, once scripts/build-stamp.ts has
 * proved the build's stamp (apps/web/.next/BUILD_COMMIT) names the commit under test: a build of another commit, or
 * an unstamped one, is refused, never served (test matrix CI-06).
 */
function buildStep(prebuilt: string | undefined): string {
  if (prebuilt === undefined || prebuilt === '' || prebuilt === '0') {
    return 'pnpm run build';
  }
  if (prebuilt === '1') {
    return `${TSX} scripts/build-stamp.ts --expect "$(git rev-parse HEAD)"`;
  }
  throw new Error('E2E_PREBUILT is 1 (run the stamped build that is there) or unset (build here)');
}

/**
 * Where the snapshot assertions read and write their baselines. Unset: beside each spec, as committed. CI's baseline
 * step (ci.yml's e2e job) sets E2E_BASELINES_DIR to an empty directory outside the repository and regenerates every
 * brand baseline there with --update-snapshots=all, so each is written from nothing while the working tree stays as
 * committed, which E2E_PREBUILT's build stamp requires (docs/adr/0058; docs/adr/0066, Part 3).
 */
function snapshotPathTemplate(dir: string | undefined): { snapshotPathTemplate?: string } {
  if (dir === undefined || dir === '') return {};
  if (!path.isAbsolute(dir)) throw new Error(`E2E_BASELINES_DIR is an absolute directory, not ${JSON.stringify(dir)}`);
  return { snapshotPathTemplate: `${dir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}` };
}

export default defineConfig({
  testDir: './e2e',
  ...snapshotPathTemplate(process.env.E2E_BASELINES_DIR),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One retry on CI, so a test that fails and then passes is reported as flaky, with its first attempt's trace; and
  // on CI a flaky test fails the run (test matrix CI-07), so nondeterminism is fixed, never re-run to green.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(bundledChromium ? {} : { channel: 'chrome' }), launchOptions: textRendering },
    },
  ],
  // The production build, as the container runs it, against a database prepared and seeded for this
  // run (e2e/prepare.ts) and the local identity provider. Synthetic data only.
  webServer: {
    command: `${TSX} e2e/prepare.ts && ${buildStep(process.env.E2E_PREBUILT)} && PORT=${String(E2E_PORT)} bash scripts/start-standalone.sh`,
    url: `http://127.0.0.1:${String(E2E_PORT)}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      E2E_ADMIN_URL: e2eAdminUrl(),
      DATABASE_URL: devLoginUrl('tp_app_dev'),
      // Billing's and the e-signature webhook's own logins: the application's may not switch to their roles (docs/adr/0055).
      BILLING_DATABASE_URL: devLoginUrl('tp_billing_dev'),
      ESIGN_DATABASE_URL: devLoginUrl('tp_esign_dev'),
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
      // No proxy is trusted here (Next names the socket's own address when no proxy does, which every test shares):
      // the sign-in limits hold per account; the per-address limits are rate-limit.db.test.ts's (docs/adr/0053).
      // Agreements: the local e-signature stand-in's webhook, and uploads kept in this run's directory.
      ESIGN_PROVIDER: 'local',
      ESIGN_LOCAL_SECRET: E2E_ESIGN_SECRET,
      ESIGN_LOCAL_DIR: E2E_ESIGN_DIR,
      AGREEMENTS_DIR: E2E_AGREEMENTS_DIR,
      COMPLIANCE_EXPORT_DIR: E2E_COMPLIANCE_DIR,
    },
  },
});
