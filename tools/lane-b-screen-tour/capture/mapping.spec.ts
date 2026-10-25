import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { signInWithTotp } from '/home/user/screens/apps/web/e2e/helpers';

/** The payer and plan mapping, its "All plans" view chosen in its filter (the default shows only plans waiting on one). */
const OUT = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/screens';

test('mapping, all plans', async ({ browser }) => {
  const { layout } = JSON.parse(readFileSync(`${OUT}/ids.json`, 'utf8')) as { layout: string };
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await signInWithTotp(page, 'pricing-manager', true);
  await page.goto(`/p/${layout}/mapping`);
  await page.getByRole('form', { name: 'Filter plans' }).locator('select[name="view"]').selectOption('all');
  await page.getByRole('form', { name: 'Filter plans' }).getByRole('button').first().click();
  await expect(page.getByRole('table', { name: 'Payers and plans' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({ path: `${OUT}/png/08-mapping.png`, fullPage: true, animations: 'disabled' });
  console.log(`SHOT ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
  await context.close();
});
