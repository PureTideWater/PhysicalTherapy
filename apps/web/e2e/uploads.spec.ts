import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { appDevLoginUrl, developmentMasterKey, openPool } from '@tp/db';
import { assertNoPhi, createLogger } from '@tp/observability';
import { type RunningWorker, intakeHandler, intakeServices, parseQueuedHandler, placeholderHandlers, startWorker } from '@tp/worker/runtime';
import { PgBoss } from 'pg-boss';

import { personaEmail } from '../scripts/synthetic-personas';
import { E2E_DOCUMENTS_DIR, e2eDatabaseUrl } from './env';
import { practiceId, signInWithTotp, withDatabase } from './helpers';

/**
 * The Uploads screen in the browser (PRD 5, J1 and J4; PRD 7, Uploads; PRD 10, Pipeline steps 1 and
 * 2): a billing manager drops a synthetic 835 and a zip, the browser PUTs them to the local receiver,
 * the worker (run here beside the server, on the same database and document directory) takes them
 * in, and the receipts show them scanned and queued for parse; a viewer sees the permission state; a
 * practice without its BAA shows uploads disabled with the reason. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

/** The worker, as main.ts wires it in development, for the length of a test. */
async function startLocalWorker(): Promise<{ worker: RunningWorker; close: () => Promise<void> }> {
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  const boss = new PgBoss(e2eDatabaseUrl());
  boss.on('error', () => undefined);
  const services = intakeServices({ documents: { kind: 'local', dir: E2E_DOCUMENTS_DIR }, keys: { kind: 'local', masterKey: developmentMasterKey() }, scanWaitMs: 10_000 });
  const worker = await startWorker({
    boss,
    pool,
    logger: createLogger({ sink: () => undefined }),
    handlers: { ...placeholderHandlers, intake: intakeHandler(services), parse_835: parseQueuedHandler },
    heartbeatMs: 60_000,
    shutdownTimeoutMs: 5_000,
  });
  return {
    worker,
    close: async () => {
      await worker.stop();
      await pool.end();
    },
  };
}

test('a billing manager uploads an 835 and a zip; the worker takes them in and the receipts follow (J4)', async ({ page }) => {
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
    await expect(batch.getByRole('status')).toContainText('2 of 2 taken in', { timeout: 60_000 });
    await expect(batch.getByText('The malware scan is clean; queued for parse.')).toBeVisible();
    await expect(batch.getByText(/Each file in the zip has its own receipt: 500 files, 500 queued for parse, 0 held/)).toBeVisible();
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
      { status: 'parse_queued', uploaded_by: personaEmail('billing-manager') },
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
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO practice (organization_id, name, data_key_ref)
       SELECT organization_id, 'SYNTHETIC PHYSICAL THERAPY EAST', data_key_ref FROM practice WHERE name = 'SYNTHETIC PHYSICAL THERAPY NORTH' RETURNING id`,
    );
    return rows[0]?.id ?? '';
  });
  await signInWithTotp(page, 'analyst');
  await page.goto(`/p/${east}/uploads`);
  await expect(page.getByText('Uploads are not open yet')).toBeVisible();
  await expect(page.getByText('business associate agreement is on file')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Drop zone' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No files uploaded yet' })).toBeVisible();
});
