import { writeFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';

import { signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';
import { SYNTHETIC_PRACTICES } from '/home/user/screens/apps/web/scripts/synthetic-personas';

/**
 * The bank-account-first PR's before and after shots (#135; designs/lane-b-bank-account-first.md, Reviews): the
 * organization billing page as its administrator (practice-admin), on the local billing simulator, in three states
 * (nothing on file, a test card on file, a test bank account on file), each at 1280 px and 390 px, light and dark
 * (data-theme="dark", the semantic tokens). Run against the same build twice: TOUR_REF the PR's base, then its head.
 * Copied into $TOUR_DIR/capture by hand; needs only the seed (no populate). Synthetic data only.
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
      const file = `${PNG}/billing-${state}-${String(width)}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      shots.push({ file, state, width, theme });
    }
  }
}

test('the organization billing page in three states', async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const group = await withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT o.id FROM practice p JOIN organization o ON o.id = p.organization_id WHERE p.name = $1', [SYNTHETIC_PRACTICES.north]);
    return rows[0]?.id ?? '';
  });
  expect(group).not.toBe('');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await signInWithTotp(page, 'practice-admin');
  const path = `/settings/billing/${group}`;

  await four(page, 'none', path);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(path);
  await page.getByRole('button', { name: 'Add test card' }).click();
  await expect(page.locator('[data-payment-method]')).toHaveAttribute('data-payment-method', 'card');
  await four(page, 'card', path);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(path);
  await page.getByRole('button', { name: 'Add test bank account (ACH)' }).click();
  await expect(page.locator('[data-payment-method]')).toHaveAttribute('data-payment-method', 'us_bank_account');
  await four(page, 'bank', path);

  await context.close();
  writeFileSync(`${OUT}/shots-${TAG}.json`, JSON.stringify(shots, null, 2));
});
