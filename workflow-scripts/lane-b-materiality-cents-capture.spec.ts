import { writeFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';

import { signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';
import { SYNTHETIC_PRACTICES } from '/home/user/screens/apps/web/scripts/synthetic-personas';

/**
 * The materiality-cents PR's before and after shots (designs/lane-b-materiality-cents.md, Reviews): Settings →
 * Defaults as the group's billing manager, in two states (the seeded thresholds with no pursuit cost; then a pursuit
 * cost of $45.00 an hour, 30 and 15 minutes entered through the form), each at 1280 px and 390 px, light and dark
 * (data-theme="dark", the semantic tokens). Run against the PR's base, then its head. Needs only the seed. Synthetic
 * data only.
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR to the tour working directory.');
const TAG = process.env.SHOT_TAG ?? 'shot';
const PNG = `${OUT}/png-${TAG}`;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(400);
}

const shots: { file: string; state: string; width: number; theme: string }[] = [];

async function four(page: Page, state: string, path: string): Promise<void> {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    for (const theme of ['light', 'dark']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (theme === 'dark') {
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      }
      await settle(page);
      const file = `${PNG}/defaults-${state}-${String(width)}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      shots.push({ file, state, width, theme });
    }
  }
}

test('Settings, Defaults in two states', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const practice = await withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM practice WHERE name = $1', [SYNTHETIC_PRACTICES.north])).rows[0]?.id ?? '');
  expect(practice).not.toBe('');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await signInWithTotp(page, 'billing-manager');
  const path = `/p/${practice}/settings/defaults`;

  await four(page, 'seeded', path);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(path);
  await page.getByLabel('Staff rate per hour (dollars)').fill('45.00');
  await page.getByLabel('Minutes per packet').fill('30');
  await page.getByLabel('Minutes per follow-up').fill('15');
  await page.getByRole('button', { name: 'Save pursuit cost' }).click();
  await expect(page.getByText('The pursuit cost applies from the next triage.')).toBeVisible();
  await four(page, 'pursuit', path);

  await context.close();
  writeFileSync(`${OUT}/shots-${TAG}.json`, JSON.stringify(shots, null, 2));
});
