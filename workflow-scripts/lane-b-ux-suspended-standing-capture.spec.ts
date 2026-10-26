import { writeFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';

import { signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';
import { SYNTHETIC_PRACTICES } from '/home/user/screens/apps/web/scripts/synthetic-personas';

/**
 * The ux-suspended-standing PR's before and after shots (designs/lane-b-ux-suspended-standing.md, Reviews): the
 * organization billing page as its administrator (practice-admin), in three states: good standing; suspended by a
 * platform administrator while billing is in good standing (the record's status set through the e2e database, as the
 * e2e helpers read and write it); closed. Each at 1280 px and 390 px, light and dark (data-theme="dark"). The record is
 * restored to active at the end. Run against the PR's base, then its head. Needs only the seed. Synthetic data only.
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

async function setStatus(organizationId: string, status: 'active' | 'suspended' | 'closed'): Promise<void> {
  await withDatabase(async (client) => {
    await client.query('UPDATE organization SET status = $2 WHERE id = $1', [organizationId, status]);
  });
}

test('the organization billing page: good, suspended by PaidWhole, closed', async ({ browser }) => {
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
  try {
    await four(page, 'good', path);
    await setStatus(group, 'suspended');
    await four(page, 'suspended', path);
    await setStatus(group, 'closed');
    await four(page, 'closed', path);
  } finally {
    await setStatus(group, 'active');
    await context.close();
  }
  writeFileSync(`${OUT}/shots-${TAG}.json`, JSON.stringify(shots, null, 2));
});
