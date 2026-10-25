import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';

/**
 * The contract version the contracts journey (e2e/contracts.spec.ts) abstracted by hand from its SYNTHETIC agreement
 * PDF, uploaded on screen: its rate record with the cited page's text and the quote marked. Read by a billing manager
 * of the group (era-manager, whom no journey signed in, so no authenticator code is shared).
 */
const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR to the tour working directory (README, Set-up).');

test('the contract version with its citation', async ({ browser }) => {
  const { practice, version } = await withDatabase(async (client) => {
    const practiceId = (await client.query<{ id: string }>("SELECT id FROM practice WHERE name = 'SYNTHETIC OTHER PRACTICE'")).rows[0]?.id ?? '';
    const versionId =
      (await client.query<{ id: string }>("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off' ORDER BY created_at LIMIT 1", [practiceId])).rows[0]?.id ?? '';
    return { practice: practiceId, version: versionId };
  });
  expect(version).not.toBe('');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await signInWithTotp(page, 'era-manager');
  await page.goto(`/p/${practice}/contracts/versions/${version}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-page-text] mark').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/png/07-contract-version.png`, fullPage: true, animations: 'disabled' });
  writeFileSync(`${OUT}/contract-shot.json`, JSON.stringify({ path: `/p/${practice}/contracts/versions/${version}`, role: 'billing manager (era-manager)' }));
  await context.close();
});
