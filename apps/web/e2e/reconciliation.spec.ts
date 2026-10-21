import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { signInWithTotp } from './helpers';
import { chainFrom, chainPricedMonths, ledgerPractice, newestDocument, openLedgerCase } from './ledger';
import { startLocalWorker } from './worker';

/**
 * Recovery in the browser (PRD 5, J10 and J12; PRD 7, Reconciliation and Reports; PRD 13; the milestone
 * 9 done check): in a practice of its own, a billing manager uploads the SYNTHETIC LED-06 original
 * payment, whose case the worker prices and triages (the payer's schedule abstracted and signed off
 * beside the browser, e2e/ledger.ts), maps the practice's posting template on a sample in the browser,
 * and then, with the worker beside the server: the adjusted remittance creates a payer-approved amount;
 * the posting export moves it to posted; the EFT export to deposited, recovered; the PLB recoupment
 * reduces recovered by its amount; an ROI statement generated on demand recomputes from its entries, its
 * PDF printed by the worker and its CSV listing them; a posting match reversed with its reason nets the
 * posted figure to zero and changes nothing recovered (the practice proves by deposit). A viewer reads
 * the ledger without the controls or the PHI columns. Every 835 reaches the ledger through the
 * monitoring chain, as in production: the e2e worker runs its monitor step for this practice
 * (e2e/worker.ts), which plans the month, price and triage follow, and triage queues the reconcile (the
 * original payment, whose plan waits on its mapping, is reconciled after its parse with nothing
 * priced). The spec only starts the monitor job the parse queued without its batch wait
 * (e2e/journeys.ts, chainFrom). Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const fixture = (file: string) => readFileSync(path.join(FIXTURES, 'LED-06', file));
const KNOWN = ['SYNPCNLED06001', 'SYNCCNLED060001', 'SYNCCNLED060002', 'SYNMBR69719872'];

async function withWorker(run: () => Promise<void>): Promise<void> {
  const local = await startLocalWorker();
  try {
    await run();
  } finally {
    await local.close();
  }
}

async function upload835(page: Page, practiceId: string, file: string): Promise<void> {
  await page.goto(`/p/${practiceId}/uploads`);
  await page.getByLabel('Choose files to upload').setInputFiles([{ name: file, mimeType: 'application/octet-stream', buffer: fixture(file) }]);
  await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: file })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
}

/** The 835 just uploaded, through the monitoring chain to the ledger. */
async function throughTheChain(practiceId: string): Promise<void> {
  await chainFrom(practiceId, await newestDocument(practiceId, 'x12_835'));
}

/** An export uploaded through the Reconciliation screen's own uploader, once intake has taken it in. */
async function uploadExport(page: Page, kind: 'posting_export' | 'eft_export', file: string, mimeType: string): Promise<void> {
  const uploads = page.getByRole('region', { name: 'Upload exports' });
  await uploads.getByLabel('Kind of document').selectOption(kind);
  await uploads.getByLabel('Choose files to upload').setInputFiles([{ name: file, mimeType, buffer: fixture(file) }]);
  await expect(uploads.getByRole('region', { name: 'This batch' }).getByRole('status')).toContainText('1 of 1 sent; 1 of 1 taken in', { timeout: 90_000 });
}

/**
 * The ledger's figure on the Reconciliation screen, once the worker has written it. The reconcile writes the figure,
 * the matches and the lines' stages in one transaction, and the screen reads them all in one snapshot, so the
 * assertions that follow on the same render (a line's stage, its evidence, the entries) hold as soon as the figure
 * does; read statement by statement, a render could show the new figure beside the line's old stage.
 */
async function expectFigure(page: Page, practiceId: string, figure: string, text: string): Promise<void> {
  await expect(async () => {
    await page.goto(`/p/${practiceId}/reconciliation`);
    await expect(page.locator(`[data-figure="${figure}"]`)).toContainText(text, { timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
}

test('an adjusted remittance, a posting export, an EFT export and a recoupment move the ledger, and the ROI statement recomputes from its entries (J10, milestone 9)', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const practiceId = await ledgerPractice();
  await signInWithTotp(page, 'ledger-manager');

  await test.step('the original payment loads, and the worker opens its case', async () => {
    await withWorker(async () => {
      await upload835(page, practiceId, 'original.835');
      // The chain prices nothing yet (the plan waits on its mapping) and reconciles the document.
      await throughTheChain(practiceId);
      expect(await chainPricedMonths(practiceId)).toEqual([]);
      await openLedgerCase(practiceId);
    });
    const response = await page.goto(`/p/${practiceId}/reconciliation`);
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reconciliation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Reconciliation', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-figure="recovered"]')).toContainText('$0.00');
    await expect(page.getByText('No case line has a ledger entry or a match yet')).toBeVisible();
  });

  await test.step('the posting template is mapped once, previewed on a sample that never leaves the browser', async () => {
    await page.getByRole('link', { name: 'Map the posting template' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Posting template' })).toBeVisible();
    await page.getByLabel('Our own practice-management system’s export').check();
    await page.getByLabel(/A sample export, for the preview/).setInputFiles([{ name: 'sample.csv', mimeType: 'text/csv', buffer: fixture('posting-export.csv') }]);
    await page.getByLabel('Practice-management system', { exact: true }).fill('SYNTHETIC PM SYSTEM');
    await page.getByLabel('Posting date (required)').selectOption('Post Date');
    await page.getByLabel('Check or EFT trace number (required)').selectOption('Check/EFT #');
    await page.getByLabel('Amount posted (required)').selectOption('Paid Amount');
    await page.getByLabel('Batch', { exact: true }).selectOption('Batch');
    const preview = page.getByRole('region', { name: 'Preview' });
    await expect(preview.locator('[data-state="preview"]')).toContainText('1 row reads; 0 rows are left out');
    await expect(preview.getByRole('table', { name: 'Preview rows' })).toContainText('SYNEFTLED06002');
    await expect(preview.getByRole('table', { name: 'Preview rows' })).toContainText('$30.00');
    await page.getByRole('button', { name: 'Save the template' }).click();
    await expect(page.locator('[data-notice="saved"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current template' })).toContainText('SYNTHETIC PM SYSTEM');
  });

  await test.step('an adjusted remittance creates a payer-approved amount, through the monitoring chain', async () => {
    await withWorker(async () => {
      await upload835(page, practiceId, 'adjusted.835');
      // The chain prices March again with the reprocessed claim, triages it and reconciles the run.
      await throughTheChain(practiceId);
      expect(await chainPricedMonths(practiceId)).toEqual(['2026-03-01']);
      await expectFigure(page, practiceId, 'approved', '$30.00');
    });
    await expect(page.locator('[data-figure="recovered"]')).toContainText('$0.00');
    const line = page.getByRole('list', { name: 'Case lines' }).getByRole('listitem').first();
    await expect(line.getByRole('list', { name: 'ERA: the remittance that reprocessed it' })).toContainText('SYNEFTLED06002');
    await expect(line.getByRole('list', { name: 'ERA: the remittance that reprocessed it' })).toContainText('higher allowed: approved');
    await expect(line.locator('[data-line-stage]')).toHaveText('Payer approved');
    await expect(page.getByRole('table', { name: 'Ledger entries' })).toContainText('Payer approved');
  });

  await test.step('a posting export moves it to posted', async () => {
    await withWorker(async () => {
      await uploadExport(page, 'posting_export', 'posting-export.csv', 'text/csv');
      await expectFigure(page, practiceId, 'posted', '$30.00');
    });
    await expect(page.getByRole('table', { name: 'Exports' })).toContainText('Read into rows and reconciled');
    await expect(page.getByRole('list', { name: 'Case lines' }).getByRole('list', { name: 'Posting' })).toContainText('Posting row SYNEFTLED06002, 2026-06-10, $30.00');
    // The practice proves recovery by deposit: posted is its own stage.
    await expect(page.locator('[data-figure="recovered"]')).toContainText('$0.00');
  });

  await test.step('an EFT export moves it to deposited: recovered', async () => {
    await withWorker(async () => {
      await uploadExport(page, 'eft_export', 'eft-export.csv', 'text/csv');
      await expectFigure(page, practiceId, 'deposited', '$30.00');
    });
    await expect(page.locator('[data-figure="recovered"]')).toContainText('$30.00');
    await expect(page.locator('[data-figure="recovered"]')).toContainText('Recovered (deposited)');
    await expect(page.locator('[data-figure="recovered"]')).toContainText('stage five: cash deposited, proved by the bank export');
    await expect(page.getByRole('list', { name: 'Case lines' }).getByRole('listitem').first().locator('[data-line-stage]')).toHaveText('Recovered (posted or deposited)');
  });

  await test.step('a PLB recoupment reduces recovered by exactly its amount and reopens the line', async () => {
    await withWorker(async () => {
      await upload835(page, practiceId, 'recoupment.835');
      // The recoupment's own claim is in July: the chain prices and triages July, and the reconcile after it takes the money back.
      await throughTheChain(practiceId);
      expect(await chainPricedMonths(practiceId)).toEqual(['2026-03-01', '2026-07-01']);
      await expectFigure(page, practiceId, 'recovered', '$12.00');
    });
    await expect(page.locator('[data-figure="recouped"]')).toContainText('-$18.00');
    const line = page.getByRole('list', { name: 'Case lines' }).getByRole('listitem').first();
    await expect(line.getByRole('list', { name: 'Recoupments' })).toContainText('PLB WO take-back');
    await expect(line.locator('[data-line-stage]')).toHaveText('Actionable');
    for (const value of KNOWN) {
      await expect(page.locator('main')).not.toContainText(value);
    }
  });

  await test.step('the ROI statement recomputes from its entries, its PDF printed by the worker and its CSV listing them', async () => {
    await page.goto(`/p/${practiceId}/reports`);
    await page.getByRole('link', { name: 'Open the ROI statements' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'ROI statements' })).toBeVisible();
    await withWorker(async () => {
      await page.getByLabel('First day').fill('2026-04-01');
      await page.getByLabel('Last day').fill('2026-09-30');
      await page.getByRole('button', { name: 'Generate the statement' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('ROI statement, 2026-04-01 to 2026-09-30');
      await expect(async () => {
        await page.reload();
        await expect(page.locator('[data-print="printed"]')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
    });
    await expect(page.locator('[data-state="recomputed"]')).toBeVisible();
    // The region is named with its proof level, as the figure is labelled: never "recovered" alone.
    const recovered = page.getByRole('region', { name: 'Recovered principal, net (deposited)', exact: true });
    await expect(recovered).toContainText('$12.00');
    await expect(recovered.locator('[data-recomputed="recovered"]')).toHaveText('Recomputed from its 2 linked entries: $12.00, the figure stored.');
    await expect(recovered.getByRole('table')).toContainText('Deposited');
    await expect(recovered.getByRole('table')).toContainText('-$18.00');
    await expect(page.locator('[data-proof-level="deposited"]')).toBeVisible();
    // Recovered is labelled by the cash that proves it, everywhere on the statement (CO-11).
    await expect(page.getByText('Recovered (deposited) is cash deposited, proved by the bank export.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Fees paid' }).locator('[data-ratio="none"]')).toHaveText('Billing records no fees paid in the period, so no ratio to the fees is given.');
    const pdf = await page.request.get(`${new URL(page.url()).pathname}/pdf`);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect(pdf.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const csv = await (await page.request.get(`${new URL(page.url()).pathname}/csv`)).text();
    expect(csv).toContain('recovered,total,12.00,usd,,,,,');
    expect(csv.split('\r\n').filter((row) => row.startsWith('recovered,entry,'))).toHaveLength(2);
    expect(csv).toContain('proof_level,total,deposited,stage,,,,,');
    for (const value of KNOWN) {
      expect(csv).not.toContain(value);
    }
    expect(() => {
      assertNoPhi('url', page.url(), { known: KNOWN });
    }).not.toThrow();
  });

  await test.step('a posting match reversed with its reason, once confirmed, nets posted to zero and leaves recovered as the deposits prove it', async () => {
    await page.goto(`/p/${practiceId}/reconciliation`);
    const posting = page.getByRole('list', { name: 'Case lines' }).getByRole('list', { name: 'Posting' }).getByRole('listitem').first();
    await posting.getByText('Reverse this match').click();
    await posting.getByLabel('Why it is reversed').fill('SYNTHETIC posted to the wrong account');
    await posting.getByRole('checkbox').check();
    await posting.getByRole('button', { name: 'Reverse the match' }).click();
    await expect(page.locator('[data-notice="reversed"]')).toBeVisible();
    await expect(page.locator('[data-figure="posted"]')).toContainText('$0.00');
    await expect(page.locator('[data-figure="recovered"]')).toContainText('$12.00');
    await expect(page.getByRole('region', { name: 'Unmatched postings' })).toContainText('a person reversed its earlier match');
    await expect(page.getByRole('table', { name: 'Ledger entries' })).toContainText('SYNTHETIC posted to the wrong account');
  });

  await test.step('a viewer reads the ledger without the controls or the PHI columns', async () => {
    const context = await browser.newContext();
    const viewer = await context.newPage();
    try {
      await signInWithTotp(viewer, 'ledger-viewer');
      await viewer.goto(`/p/${practiceId}/reconciliation`);
      await expect(viewer.locator('[data-figure="recovered"]')).toContainText('$12.00');
      await expect(viewer.getByText('Reverse this match')).toHaveCount(0);
      await expect(viewer.getByRole('button', { name: 'Match to this remittance' })).toHaveCount(0);
      await expect(viewer.getByText('97110 on 2026-03-09')).toHaveCount(0);
      await expect(viewer.getByRole('table', { name: 'Ledger entries' })).not.toContainText('SYNTHETIC posted to the wrong account');
      await viewer.goto(`/p/${practiceId}/reports/roi`);
      await expect(viewer.getByRole('region', { name: 'Generate a statement' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
