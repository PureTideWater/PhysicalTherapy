import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { practiceId, signInWithTotp } from './helpers';
import { startLocalWorker } from './worker';

/**
 * The Remittances and Claims and lines screens in the browser (PRD 7; PRD 6: "reversal followed by
 * correction nets to one adjudicated claim in the view"): a billing manager uploads a SYNTHETIC
 * payment and, later, its reversal and correction (PAR-08); the worker loads them; the remittances
 * list both, the reversal linked to its original; the claims table nets them to the corrected claim;
 * a payer claim control number is found without it ever reaching a URL; a note goes on a line; and a
 * viewer sees the same tables without the PHI columns. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNCCNPAR080001', 'SYNCCNPAR080002', 'SYNPCNPAR08001', 'SYNTHLAST7ZFBQB', 'SYNTHFIRSTSX4'];

test('a billing manager follows a payment, its reversal and its correction from upload to the line; a viewer sees no PHI', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signInWithTotp(page, 'billing-manager');
  const south = await practiceId('south');
  await page.goto(`/p/${south}/uploads`);
  const local = await startLocalWorker();
  try {
    for (const file of ['original.835', 'correction.835']) {
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: file, mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'PAR-08', file)) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: file })).toContainText('Loaded 1 remittance', { timeout: 60_000 });
    }
  } finally {
    await local.close();
  }

  // The remittances: both payments, newest first, the reversal counted and linked to its original.
  const response = await page.goto(`/p/${south}/remittances`);
  expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  const remittances = page.getByRole('table', { name: 'Remittances' });
  await expect(remittances.getByRole('row')).toHaveCount(3);
  await expect(remittances.getByRole('row').nth(1)).toContainText('1 reversal');
  await expect(remittances.getByRole('row').nth(1)).toContainText('SYNEFTPAR08002');
  await remittances.getByRole('row').nth(1).getByRole('link', { name: 'SYNTHETIC PAYER A' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('SYNTHETIC PAYER A, paid 2026-06-08');
  await expect(page.getByRole('link', { name: 'Reverses a claim of an earlier remittance' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Claims' })).toContainText('SYNTHLAST7ZFBQB, SYNTHFIRSTSX4');
  expect(() => {
    assertNoPhi('url', page.url(), { known: KNOWN });
  }).not.toThrow();

  // The claims and lines: the net view shows the corrected claim's two lines alone.
  await page.goto(`/p/${south}/claims`);
  const table = page.getByRole('table', { name: 'Claims and lines' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table).toContainText('SYNCCNPAR080002');
  await expect(table).not.toContainText('SYNCCNPAR080001');
  await expect(table).toContainText('Not priced yet');

  // A claim control number is posted and answered with the claim's opaque ID.
  await page.getByLabel('Payer claim control number').fill('SYNCCNPAR080001');
  await page.getByRole('button', { name: 'Find the claim' }).click();
  await expect(page).toHaveURL(/\/claims\?view=all&claim=[0-9a-f-]{36}$/);
  expect(() => {
    assertNoPhi('url', page.url(), { known: KNOWN });
  }).not.toThrow();
  await expect(table.getByText('Reversed').first()).toBeVisible();
  await expect(table.getByText('Superseded').first()).toBeVisible();

  // The line trace, and a note on the line.
  await table.getByRole('link', { name: 'Line trace' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/^Line \d: 97/);
  await page.getByLabel('Note').fill('SYNTHETIC NOTE: superseded by the correction of June');
  await page.getByRole('button', { name: 'Add the note' }).click();
  await expect(page.getByRole('list', { name: 'Notes' })).toContainText('SYNTHETIC NOTE: superseded by the correction of June');

  // A viewer reads the same tables without patient references, claim numbers or service dates.
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  try {
    await signInWithTotp(viewer, 'viewer', true);
    await viewer.goto(`/p/${south}/claims`);
    await expect(viewer.getByText(/hidden for your role \(Viewer\)/)).toBeVisible();
    const viewed = viewer.getByRole('table', { name: 'Claims and lines' });
    await expect(viewed.getByRole('row')).toHaveCount(3);
    for (const value of KNOWN) {
      await expect(viewer.locator('main')).not.toContainText(value);
    }
    await expect(viewer.getByLabel('Payer claim control number')).toHaveCount(0);
  } finally {
    await viewerContext.close();
  }
});
