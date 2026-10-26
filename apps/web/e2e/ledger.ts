import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect } from '@playwright/test';

import { withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, queue, signedOffSchedule, until } from './journeys';

export { chainFrom, chainPricedMonths, newestDocument } from './journeys';

/**
 * The recovery journey's setup on the e2e database (synthetic data only): a practice of its own in the
 * other group (so no other spec's counts move), with its BAA, a deposit proof level and a single 30.00
 * line making a case; and, once its SYNTHETIC LED-06 original payment is loaded through the Uploads
 * screen, the case it opens: the payer's 50.00-per-unit 97110 schedule abstracted by the contract
 * specialist (under a support grant) and signed off by the billing manager through @tp/contracts, the
 * plan mapped, March priced and triaged by the worker's own jobs (e2e/journeys.ts). The browser does the
 * rest.
 */

export const LEDGER_PRACTICE = 'SYNTHETIC OTHER PRACTICE LEDGER';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000', proof_level: 'deposited' };

/** The journey's practice (created once per database): its ID. */
export function ledgerPractice(): Promise<string> {
  return journeyPractice({ name: LEDGER_PRACTICE, settings: SETTINGS });
}

/**
 * The case of the journey: the schedule signed off, the plan mapped, March priced and triaged by the
 * worker (which the caller keeps running). Returns the case's ID.
 */
export async function openLedgerCase(practiceId: string): Promise<string> {
  await signedOffSchedule({ practiceId, managerKey: 'ledger-manager', planKey: 'CE:SYNPLAN-FIX-LED' });
  await pricedAndTriaged({ practiceId, managerKey: 'ledger-manager', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
  let caseId = '';
  await until(async () => {
    caseId = await withDatabase(async (client) => (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id ?? '');
    return caseId !== '';
  }, 'the triage job');
  return caseId;
}

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');

/** A SYNTHETIC ledger fixture's bytes (fixtures/synthetic/<case>/<file>). */
export function ledgerFixture(caseId: string, file: string): Buffer {
  return readFileSync(path.join(FIXTURES, caseId, file));
}

/**
 * A practice of its own for a ledger case of the payment-terms journey (docs/adr/0067; e2e/ledger-patient-share.spec.ts),
 * in the other group, its posting template the synthetic system's: created afresh for each attempt (its name carries
 * the attempt's own suffix), so a retry starts from nothing. Its 835s reach the ledger through the parse and a reconcile
 * the spec queues, its exports through intake's own reconcile; the monitoring chain acts for the recovery journey's
 * practice only (e2e/worker.ts).
 */
export function patientSharePractice(caseId: string): Promise<string> {
  return journeyPractice({
    name: `${LEDGER_PRACTICE} ${caseId} ${randomUUID().slice(0, 8)}`,
    settings: { ...SETTINGS, posting_export_template: { template: 'synthetic_pm_export_v1' } },
  });
}

/** An 835 of the ledger case uploaded through the Uploads screen, once the worker has loaded it (the worker running). */
export async function uploadLedger835(page: Page, practiceId: string, caseId: string, file: string): Promise<void> {
  await page.goto(`/p/${practiceId}/uploads`);
  await page.getByLabel('Choose files to upload').setInputFiles([{ name: file, mimeType: 'application/octet-stream', buffer: ledgerFixture(caseId, file) }]);
  await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: file })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
}

/** An export of the ledger case uploaded through the Reconciliation screen's own uploader, once intake has taken it in (the worker running). */
export async function uploadLedgerExport(page: Page, practiceId: string, caseId: string, kind: 'posting_export' | 'eft_export', file: string): Promise<void> {
  await page.goto(`/p/${practiceId}/reconciliation`);
  const uploads = page.getByRole('region', { name: 'Upload exports' });
  await uploads.getByLabel('Kind of document').selectOption(kind);
  await uploads.getByLabel('Choose files to upload').setInputFiles([{ name: file, mimeType: 'text/csv', buffer: ledgerFixture(caseId, file) }]);
  await expect(uploads.getByRole('region', { name: 'This batch' }).getByRole('status')).toContainText('1 of 1 sent; 1 of 1 taken in', { timeout: 90_000 });
}

/** Queues the practice's reconcile, as the chain's last step does (the worker running). */
export async function reconcileNow(practiceId: string): Promise<void> {
  await queue('reconcile', { practice_id: practiceId, day: new Date().toISOString().slice(0, 10) });
}

/** A ledger figure on the Reconciliation screen (or a case's ledger, `?case=`), once the worker has written it. */
export async function expectLedgerFigure(page: Page, url: string, figure: string, text: string): Promise<void> {
  await expect(async () => {
    await page.goto(url);
    await expect(page.locator(`[data-figure="${figure}"]`)).toContainText(text, { timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
}
