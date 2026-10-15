import { existsSync } from 'node:fs';

import { chromium, defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Playwright's own Chromium is used where it is installed (PLAYWRIGHT_BROWSERS_PATH). Where it is
 * not, such as a hosted CI runner, the system Google Chrome is used instead of downloading one.
 */
const bundledChromium = existsSync(chromium.executablePath());

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(bundledChromium ? {} : { channel: 'chrome' }) },
    },
  ],
  // The smoke test runs against a production build, so it sees the headers production sends.
  webServer: {
    command: `pnpm run build && PORT=${String(port)} bash scripts/start-standalone.sh`,
    url: `${baseURL}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
