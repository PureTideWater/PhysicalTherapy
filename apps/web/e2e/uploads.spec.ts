import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { asOwner, createPracticeWithLocation } from '@tp/db/testing';
import { assertNoPhi } from '@tp/observability';

import { personaEmail } from '../scripts/synthetic-personas';
import { practiceId, signInWithTotp, withDatabase } from './helpers';
import { startLocalWorker } from './worker';

/**
 * The Uploads screen in the browser (PRD 5, J1 and J4; PRD 7, Uploads; PRD 10, Pipeline steps 1 to
 * 10): a billing manager drops a synthetic 835 and a zip, the browser PUTs them to the local receiver,
 * the worker (run here beside the server, on the same database and document directory) takes them
 * in, parses and loads them, and the receipts show them loaded, the zip's bad file held with its
 * segment and position; a viewer sees the permission state; a practice without its BAA shows uploads
 * disabled with the reason. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

test('a billing manager uploads an 835 and a zip; the worker takes them in and loads them, and the receipts follow (J4)', async ({ page }) => {
  test.setTimeout(240_000);
  await signInWithTotp(page, 'billing-manager');
  const north = await practiceId('north');
  const response = await page.goto(`/p/${north}/uploads`);
  expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  expect(() => {
    assertNoPhi('url', page.url());
  }).not.toThrow();
  await expect(page.getByRole('heading', { level: 1, name: 'Uploads' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Drop zone' })).toBeVisible();
  const local = await startLocalWorker();
  try {
    await page.getByLabel('Choose files to upload').setInputFiles([
      { name: 'remit.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'PAR-01/remit.835')) },
      { name: 'batch.zip', mimeType: 'application/zip', buffer: readFileSync(path.join(FIXTURES, 'PAR-27/batch.zip')) },
    ]);
    const batch = page.getByRole('region', { name: 'This batch' });
    await expect(batch.getByText('remit.835')).toBeVisible();
    await expect(batch.getByRole('status')).toContainText('2 of 2 sent', { timeout: 30_000 });
    await expect(batch.getByRole('status')).toContainText('2 of 2 taken in', { timeout: 180_000 });
    // The receipt counts what loaded; a code the loaded rule release does not know would follow, flagged.
    await expect(batch.getByText(/^Loaded 1 remittance, 1 claim and 1 line[.;]/)).toBeVisible();
    await expect(batch.getByText(/Each file in the zip has its own receipt: 500 files, 499 loaded, 1 held/)).toBeVisible();
  } finally {
    await local.close();
  }
  // The receipts come from the server: they survive a reload, and no file name was ever sent.
  await page.reload();
  const receipts = page.getByRole('region', { name: 'Receipts' });
  await expect(receipts.getByText('Expanded')).toBeVisible();
  await expect(page.getByText('remit.835')).toHaveCount(0);
  const stored = await withDatabase(async (client) =>
    (await client.query<{ status: string; uploaded_by: string }>(
      `SELECT d.status, u.email AS uploaded_by FROM source_document d JOIN "user" u ON u.id = d.uploaded_by WHERE d.practice_id = $1 AND d.parent_document_id IS NULL ORDER BY d.created_at`,
      [north],
    )).rows,
  );
  expect(stored).toHaveLength(2);
  expect(stored).toEqual(
    expect.arrayContaining([
      { status: 'loaded', uploaded_by: personaEmail('billing-manager') },
      { status: 'expanded', uploaded_by: personaEmail('billing-manager') },
    ]),
  );
  // The zip's batch receipt lists its files, and its report downloads under an opaque name.
  await receipts.getByRole('row').filter({ hasText: 'Expanded' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 2, name: 'Files in this zip' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Receipt pages' })).toContainText('Page 1 of 20 (500 files)');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download the report (CSV)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^receipt-[0-9a-f-]{36}\.csv$/);
  // The held file shows its segment and position (milestone 3): page through the zip's files to it.
  const held = page.getByRole('row').filter({ hasText: 'Held' });
  const pager = page.getByRole('navigation', { name: 'Receipt pages' });
  for (let turn = 0; turn < 20 && (await held.count()) === 0; turn += 1) {
    const shown = (await pager.textContent()) ?? '';
    await pager.getByRole('button', { name: 'Older' }).click();
    await expect(pager).not.toHaveText(shown);
  }
  await held.first().getByRole('link').first().click();
  await expect(page.getByRole('table', { name: 'Errors' })).toContainText(/EDI_SYNTAX.*segment \d+ \([A-Z0-9]+\), element \d+/);
});

test('a viewer reads the receipts but cannot upload: the permission state says who can', async ({ page }) => {
  await signInWithTotp(page, 'viewer');
  const north = await practiceId('north');
  await page.goto(`/p/${north}/uploads`);
  await expect(page.getByText('As Viewer, you cannot upload files.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Drop zone' })).toHaveCount(0);
});

test('uploads stay disabled, with the reason, until the practice’s BAA is on file (J1)', async ({ page }) => {
  // A new practice of the same group, with no agreement on file yet.
  const east = await withDatabase(async (client) => {
    const north = (await client.query<{ organization_id: string; data_key_ref: string }>("SELECT organization_id, data_key_ref FROM practice WHERE name = 'SYNTHETIC PHYSICAL THERAPY NORTH'")).rows[0];
    const id = randomUUID();
    // Created with its pricing location, as every practice is (practice_has_site, PR 6b).
    await asOwner(client, [id], () => createPracticeWithLocation(client, { id, organizationId: north?.organization_id ?? '', name: 'SYNTHETIC PHYSICAL THERAPY EAST', dataKeyRef: north?.data_key_ref ?? '' }));
    return id;
  });
  await signInWithTotp(page, 'analyst');
  await page.goto(`/p/${east}/uploads`);
  await expect(page.getByText('Uploads are not open yet')).toBeVisible();
  await expect(page.getByText('business associate agreement is on file')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Drop zone' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No files uploaded yet' })).toBeVisible();
});
