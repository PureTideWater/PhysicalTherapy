import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { practiceId, signInWithTotp } from './helpers';
import { startLocalWorker } from './worker';

/**
 * Payer and plan mapping and Coverage in the browser (PRD 5, J6; PRD 7; test matrix MAP-01): a billing
 * manager uploads a SYNTHETIC remittance from a plan no mapping covers (fixture MAP-01), Coverage shows
 * its dollars waiting on mapping and refuses pricing, the manager maps the plan as no agreement, and
 * the plan's dollars leave Coverage's waiting list. In the other group's practice, whose rows no other
 * spec counts. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNTHLASTVBDXXF', 'SYNPCNMAP01001', 'SYNCCNMAP010001', 'SYNMBR55008544'];

test('a billing manager maps an unmapped plan, and its dollars leave the coverage waiting on mappings (J6, MAP-01)', async ({ page }) => {
  test.setTimeout(180_000);
  await signInWithTotp(page, 'mapping-manager');
  const other = await practiceId('other');

  await test.step('the remittance loads', async () => {
    await page.goto(`/p/${other}/uploads`);
    const local = await startLocalWorker();
    try {
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'unmapped.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'MAP-01', 'remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'unmapped.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
    } finally {
      await local.close();
    }
  });

  const waitingRow = () => page.getByRole('table', { name: 'Plans waiting on mapping' }).getByRole('row').filter({ hasText: 'SYNPLAN-UNMAPPED-01' });

  await test.step('Coverage shows the plan’s dollars waiting and refuses pricing', async () => {
    const response = await page.goto(`/p/${other}/coverage`);
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
    await expect(waitingRow()).toContainText('$448.00');
    await expect(waitingRow()).toContainText('$229.17');
    await expect(page.getByText('Pricing is refused until every plan is mapped')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Unpriced reasons and their remedies' }).getByRole('row').filter({ hasText: 'NO_MAPPING' })).toContainText('Map the plan');
  });

  await test.step('the plan is mapped as no agreement from a date', async () => {
    await page.goto(`/p/${other}/mapping`);
    await expect(page.getByRole('region', { name: 'Dollars waiting on mapping' })).toBeVisible();
    const row = page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-UNMAPPED-01' });
    await expect(row).toContainText('Unmapped');
    await expect(row).toContainText('SYNTHETIC PAYER M');
    await row.getByRole('link', { name: 'CE:SYNPLAN-UNMAPPED-01' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SYNTHETIC PAYER M');
    await expect(page.getByRole('table', { name: 'Agreement resolution' })).toContainText('NO_MAPPING');
    await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'No agreement (out of network)' });
    await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
    await page.getByRole('button', { name: 'Save the mapping' }).click();
    await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Agreement resolution' })).toContainText('NO_AGREEMENT');
    await expect(page.getByRole('table', { name: 'Mappings' })).toContainText('No agreement (out of network)');
    expect(() => {
      assertNoPhi('url', page.url(), { known: KNOWN });
    }).not.toThrow();
  });

  await test.step('Coverage no longer counts the plan’s dollars as waiting', async () => {
    await page.goto(`/p/${other}/coverage`);
    await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
    await expect(waitingRow()).toHaveCount(0);
    for (const value of KNOWN) {
      await expect(page.locator('main')).not.toContainText(value);
    }
  });
});
