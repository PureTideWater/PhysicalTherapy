import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Locator, type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';
import { cents, formatUsd } from '@tp/money';

import { expectAccessible } from './a11y';
import { signInWithTotp, withDatabase } from './helpers';
import { journeyPractice, newestDocument } from './journeys';
import { startLocalWorker } from './worker';

/**
 * EMR ERA exports as intake (Change Order 001, CO-03; docs/adr/0060), in the browser: a billing manager chooses
 * "ERA export" and the system it came from on the Uploads screen and drops the SYNTHETIC export of each of the four
 * formats (fixtures/synthetic/emr/<format>/era-export.csv); the worker reads it with its format's layout into the
 * same remittances, claims and lines an 835 makes, and the Claims and lines screen shows each line as the format's
 * manifest says, to the cent. The Coverage screen flags the lines of an unconfirmed format with its name and why.
 * The same payment sent as an 835 and as an export loads once either way (D13): the export after the 835 loads
 * nothing of it and its receipt names the 835 it repeats; the 835 after the export is held for review. Each journey
 * works in practices of its own, named for its attempt, so a retry starts clean. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

interface ManifestRow {
  readonly trace: string;
  readonly payerName: string;
  readonly patientControlNumber: string;
  readonly payerClaimNumber: string;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string;
}

interface Manifest {
  readonly format: string;
  readonly vendor: string;
  readonly status: string;
  readonly checks: readonly { readonly trace: string }[];
  readonly rows: readonly ManifestRow[];
}

const FORMATS = ['webpt_billing_era_v0', 'prompt_era_v0', 'spry_era_v0', 'raintree_era_v0'] as const;

function manifest(format: string): Manifest {
  return JSON.parse(readFileSync(path.join(FIXTURES, 'emr', format, 'manifest.json'), 'utf8')) as Manifest;
}

function exportFile(format: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name: `${format}.csv`, mimeType: 'text/csv', buffer: readFileSync(path.join(FIXTURES, 'emr', format, 'era-export.csv')) };
}

function usd(value: string | bigint): string {
  return formatUsd(cents(BigInt(value)));
}

/** Units as the manifest writes them: numeric(9,3) shows "2.000", the manifest "2". */
function units(value: string | undefined): string {
  return value === undefined || !value.includes('.') ? (value ?? '') : value.replace(/0+$/, '').replace(/\.$/, '');
}

/** A practice of the journey's own for this attempt (a retry starts in a new one). */
function practiceFor(journey: string): Promise<string> {
  return journeyPractice({ name: `SYNTHETIC OTHER PRACTICE ERA ${journey} ${String(test.info().retry)}`, settings: {} });
}

/** Chooses ERA export and the system on the Uploads screen, then the files. */
async function uploadExport(page: Page, vendor: string, files: readonly { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
  await page.getByLabel('Kind of document').selectOption('era_export');
  await page.getByLabel('Which system’s export').selectOption({ label: `${vendor} ERA export` });
  await page.getByLabel('Choose files to upload').setInputFiles([...files]);
}

/** The batch's line for a file, once its receipt has settled. */
function batchLine(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: name });
}

async function remittancesWithTrace(practiceId: string, trace: string): Promise<{ provenance: string }[]> {
  return withDatabase(async (client) => (await client.query<{ provenance: string }>('SELECT provenance FROM remittance WHERE practice_id = $1 AND trn02 = $2', [practiceId, trace])).rows);
}

test('each of the four ERA export formats uploads through Uploads, is read with its format, and its claim lines are its manifest’s to the cent (CO-03)', async ({ page }) => {
  test.setTimeout(420_000);
  await signInWithTotp(page, 'era-manager');
  const local = await startLocalWorker();
  try {
    for (const format of FORMATS) {
      const expected = manifest(format);
      await test.step(`${expected.vendor}: upload, read and load`, async () => {
        const practiceId = await practiceFor(expected.vendor.toUpperCase());
        await page.goto(`/p/${practiceId}/uploads`);
        // The system's format is chosen before the files; an unconfirmed one says so.
        await page.getByLabel('Kind of document').selectOption('era_export');
        await page.getByLabel('Choose files to upload').setInputFiles([exportFile(format)]);
        await expect(page.getByText('Choose which system’s ERA export the files are, then choose the files again.')).toBeVisible();
        await page.getByLabel('Which system’s export').selectOption({ label: `${expected.vendor} ERA export` });
        await expect(page.getByRole('note', { name: 'Format unconfirmed' })).toContainText('placeholder layout');
        await page.getByLabel('Choose files to upload').setInputFiles([exportFile(format)]);
        await expect(batchLine(page, `${format}.csv`)).toContainText(new RegExp(`Loaded ${String(expected.checks.length)} remittances, \\d+ claims and ${String(expected.rows.length)} lines`), { timeout: 120_000 });

        // The receipt names the format and what each payment became; nothing the export holds is in the URL.
        const documentId = await newestDocument(practiceId, 'era_export');
        await page.goto(`/p/${practiceId}/uploads/${documentId}`);
        expect(() => {
          assertNoPhi('url', page.url(), { known: expected.rows.flatMap((row) => [row.patientControlNumber, row.payerClaimNumber]) });
        }).not.toThrow();
        await expect(page.getByText(`${expected.vendor} ERA export`, { exact: true })).toBeVisible();
        await expect(page.getByRole('table', { name: 'Payments' }).getByRole('row')).toHaveCount(expected.checks.length + 1);
        await expect(page.getByRole('table', { name: 'Payments' }).locator('[data-outcome="loaded"]')).toHaveCount(expected.checks.length);

        // The claim lines, every one as the manifest says: identifiers, date, code and modifiers, units, charge,
        // observed allowed (paid plus patient responsibility), paid and patient share.
        await page.goto(`/p/${practiceId}/claims?view=all`);
        const table = page.getByRole('table', { name: 'Claims and lines' });
        const rows = table.locator('tbody tr');
        await expect(rows).toHaveCount(expected.rows.length);
        const shown = await rows.evaluateAll((elements) => elements.map((element) => [...element.querySelectorAll('td')].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())));
        const fromScreen = shown.map((cells) => [cells[1], cells[2], cells[3]?.replace(/(Reversal|Reversed|Superseded)/g, '').trim(), units(cells[4]), cells[5], cells[7], cells[9], cells[10]].join(' | ')).sort();
        const fromManifest = expected.rows
          .map((row) =>
            [
              `${row.patientControlNumber}${row.payerClaimNumber}`,
              row.serviceDate,
              [row.procedureCode, ...row.modifiers].join(' '),
              row.units,
              usd(row.chargeCents),
              usd(BigInt(row.paidCents) + BigInt(row.patientResponsibilityCents)),
              usd(row.paidCents),
              usd(row.patientResponsibilityCents),
            ].join(' | '),
          )
          .sort();
        expect(fromScreen, expected.format).toEqual(fromManifest);
      });
    }
  } finally {
    await local.close();
  }
});

test('the Coverage screen flags the lines of an unconfirmed format with its name, its counts and why, never by color alone (CO-03)', async ({ page }) => {
  test.setTimeout(240_000);
  const format = 'raintree_era_v0';
  const expected = manifest(format);
  const practiceId = await practiceFor('COVERAGE');
  await signInWithTotp(page, 'era-coverage-manager');
  // Before any export, nothing is flagged.
  await page.goto(`/p/${practiceId}/coverage`);
  await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unconfirmed export formats' })).toHaveCount(0);
  const local = await startLocalWorker();
  try {
    await page.goto(`/p/${practiceId}/uploads`);
    await uploadExport(page, expected.vendor, [exportFile(format)]);
    await expect(batchLine(page, `${format}.csv`)).toContainText(/Loaded \d+ remittances/, { timeout: 120_000 });
  } finally {
    await local.close();
  }
  await page.goto(`/p/${practiceId}/coverage`);
  const flagged = page.getByRole('region', { name: 'Unconfirmed export formats' });
  await expect(flagged.getByRole('heading', { level: 2, name: 'Lines read from an unconfirmed export format' })).toBeVisible();
  await expect(flagged.getByRole('region')).toHaveCount(1);
  const source = flagged.getByRole('region', { name: 'Raintree ERA export' });
  await expect(source).toHaveAttribute('data-format', format);
  // A text badge, the format's name and a plain explanation: not color alone.
  await expect(source.locator('[data-flag="format-unconfirmed"]')).toHaveText('Format unconfirmed');
  await expect(source).toContainText('PaidWhole reads the Raintree ERA export with a placeholder layout, because no description of the format has been received from its vendor.');
  await expect(source).toContainText('Check these lines against the export before relying on their amounts. The flag clears when the format is confirmed.');
  const billed = expected.rows.reduce((sum, row) => sum + BigInt(row.chargeCents), 0n);
  await expect(source).toContainText(`${String(expected.checks.length)} remittances, ${String(expected.rows.length)} lines, ${usd(billed)} billed`);
  for (const payer of new Set(expected.rows.map((row) => row.payerName))) {
    await expect(source).toContainText(payer);
  }
  await expectAccessible(page, 'Coverage with an unconfirmed format');
});

test('the same payment as an 835 and as an export loads once, in either order, and the receipts say why (D13)', async ({ page }) => {
  test.setTimeout(300_000);
  const format = 'webpt_billing_era_v0';
  const expected = manifest(format);
  const remit = { name: 'par-01.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'PAR-01/remit.835')) };
  const trace = 'SYNEFTPAR01001';
  expect(expected.checks.map((check) => check.trace)).toContain(trace);
  await signInWithTotp(page, 'era-duplicates-manager');
  const local = await startLocalWorker();
  try {
    await test.step('the export after the 835 loads nothing of that payment, and its receipt names and links the 835', async () => {
      const practiceId = await practiceFor('DUPLICATE');
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([remit]);
      await expect(batchLine(page, remit.name)).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      const x12 = await newestDocument(practiceId, 'x12_835');
      await uploadExport(page, expected.vendor, [exportFile(format)]);
      await expect(batchLine(page, `${format}.csv`)).toContainText(`1 payment already loaded from 835 file ${x12.slice(0, 8)}, so nothing of it loads again`, { timeout: 120_000 });
      expect(await remittancesWithTrace(practiceId, trace)).toEqual([{ provenance: 'x12_835' }]);
      await page.goto(`/p/${practiceId}/uploads/${await newestDocument(practiceId, 'era_export')}`);
      const repeated = page.getByRole('table', { name: 'Payments' }).locator('[data-outcome="duplicate_remittance"]');
      await expect(repeated).toHaveCount(1);
      await expect(repeated).toContainText('Already loaded, so nothing of it loads again');
      await expect(repeated).toContainText(`from 835 file ${x12.slice(0, 8)}`);
      await repeated.getByRole('link', { name: x12.slice(0, 8) }).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`Receipt ${x12.slice(0, 8)}`);
    });

    await test.step('the 835 after the export is held for review, never loaded beside it', async () => {
      const practiceId = await practiceFor('REVIEW');
      await page.goto(`/p/${practiceId}/uploads`);
      await uploadExport(page, expected.vendor, [exportFile(format)]);
      await expect(batchLine(page, `${format}.csv`)).toContainText(`Loaded ${String(expected.checks.length)} remittances`, { timeout: 120_000 });
      const era = await newestDocument(practiceId, 'era_export');
      await page.getByLabel('Kind of document').selectOption('x12_835');
      await page.getByLabel('Choose files to upload').setInputFiles([remit]);
      const held = batchLine(page, remit.name);
      await expect(held).toContainText(`Held for review: a payment in it was already loaded from ERA export file ${era.slice(0, 8)}.`, { timeout: 90_000 });
      await expect(held).toContainText('lines already loaded are never replaced');
      expect(await remittancesWithTrace(practiceId, trace)).toEqual([{ provenance: 'era_export' }]);
      await page.goto(`/p/${practiceId}/uploads/${await newestDocument(practiceId, 'x12_835')}`);
      const review = page.getByRole('table', { name: 'Transaction sets' }).locator('[data-outcome="held_for_review"]');
      await expect(review).toContainText('Held for review');
      await expect(review).toContainText(`from ERA export file ${era.slice(0, 8)}`);
    });
  } finally {
    await local.close();
  }
});
