import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { expectAccessible } from './a11y';
import { practiceId, registerKeyAndSignIn, signInWithTotp } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule } from './journeys';
import { startLocalWorker } from './worker';

/**
 * The triage and report screens in the browser (PRD 7: Anomalies, Cases, Reports; milestone 6): they
 * open from the practice rail, are sent private and never cached, and show their stage labels and
 * empty states; a viewer reads them without the controls that triage, generate or export. The audit
 * itself, end to end through the routes and the worker's jobs, is
 * src/lib/routes/audit-e2e.db.test.ts.
 *
 * The reporting journey (PRD 5, J12; PRD 7, Reports; PRD 6, Reports and exports; milestones 6, 7 and
 * 9): in a practice of its own, a billing manager uploads the SYNTHETIC CAS-08 remittance, whose payer's
 * schedule is signed off beside the browser and whose March the worker prices and triages
 * (e2e/journeys.ts). The manager generates the audit report, which cannot be released until a
 * reimbursement reviewer (under a support grant) signs its checklist over the files' SHA-256; once
 * signed, the manager releases it and downloads its PDF and line CSV. The monthly summary and the
 * coverage report are generated as PDFs printed by the worker, each with its CSV; the ROI statements
 * open from the screen; every download is in the export history, the line-level ones marked; and every
 * screen of the journey passes the accessibility check. A viewer reads the reports and downloads their
 * PDFs, but is refused the line CSV. Synthetic data only.
 */

const SCREENS = [
  { path: 'anomalies', heading: /^Anomalies/, rail: 'Anomalies' },
  { path: 'cases', heading: /^Cases$/, rail: 'Cases' },
  { path: 'reports', heading: /^Reports$/, rail: 'Reports' },
] as const;

test('a billing manager opens Anomalies, Cases and Reports from the rail, private and never cached', async ({ page }) => {
  await signInWithTotp(page, 'billing-manager');
  const north = await practiceId('north');
  for (const screen of SCREENS) {
    const response = await page.goto(`/p/${north}/${screen.path}`);
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: screen.rail, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto(`/p/${north}/anomalies`);
  await expect(page.locator('[data-label="investigatory"]').first()).toBeVisible();
  await page.goto(`/p/${north}/cases`);
  await expect(page.getByRole('region', { name: 'Triage a run' })).toBeVisible();
  await page.goto(`/p/${north}/reports`);
  await expect(page.getByRole('region', { name: 'Generate an audit report' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Export history' })).toBeVisible();
});

test('a viewer reads Cases and Reports without the controls that triage, generate or export', async ({ page }) => {
  await signInWithTotp(page, 'viewer');
  const north = await practiceId('north');
  await page.goto(`/p/${north}/cases`);
  await expect(page.getByRole('heading', { level: 1, name: 'Cases' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Triage a run' })).toHaveCount(0);
  await page.goto(`/p/${north}/reports`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Generate an audit report' })).toHaveCount(0);
  await expect(page.getByText('Download the line CSV')).toHaveCount(0);
});

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003'];
const REPORTS_PRACTICE = 'SYNTHETIC OTHER PRACTICE REPORTS';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };

/** Reloads the page until the worker has printed its PDF. */
async function printed(page: Page, selector: string): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
}

async function expectPdf(page: Page, href: string): Promise<void> {
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect(response.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
  expect((await response.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

test('an audit report is released only once the reviewer signs; the monthly summary and the coverage report print to PDF and CSV; every download is in the export history; a viewer is refused the line CSV (J12)', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const practice = await journeyPractice({ name: REPORTS_PRACTICE, settings: SETTINGS, supportFor: ['reports-reviewer'] });
  const reports = `/p/${practice}/reports`;
  await signInWithTotp(page, 'reports-manager');
  const local = await startLocalWorker();
  try {
    await test.step('the remittance loads, its schedule is signed off, and March is priced and triaged', async () => {
      await page.goto(`/p/${practice}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      await signedOffSchedule({ practiceId: practice, managerKey: 'reports-manager', planKey: 'CE:SYNPLAN-FIX-ONE' });
      await pricedAndTriaged({ practiceId: practice, managerKey: 'reports-manager', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
    });

    const reportPath = await test.step('the manager generates the audit report; unsigned, it cannot be released', async () => {
      await page.goto(reports);
      await expectAccessible(page, 'Reports, before any report');
      const generate = page.getByRole('region', { name: 'Generate an audit report' });
      await generate.getByLabel('Pricing run').selectOption({ label: '2026-03-01 to 2026-03-31 (release 900001)' });
      await generate.getByRole('button', { name: 'Generate the report' }).click();
      await expect(page).toHaveURL(new RegExp(`${reports}/[0-9a-f-]{36}$`));
      await printed(page, '[data-status="ready"]');
      await expect(page.locator('[data-release="unsigned"]')).toBeVisible();
      await expect(page.locator('[data-state="release-refused"]')).toContainText('Release waits for the reviewer’s attestation.');
      await expect(page.getByRole('button', { name: 'Release the report' })).toHaveCount(0);
      await expectAccessible(page, 'An audit report');
      return new URL(page.url()).pathname;
    });

    await test.step('the reimbursement reviewer reads the line CSV and signs the checklist over the files', async () => {
      const context = await browser.newContext();
      const reviewer = await context.newPage();
      try {
        await registerKeyAndSignIn(reviewer, 'reports-reviewer');
        await reviewer.goto(`${reportPath}/review`);
        const csv = await reviewer.request.get(`${reportPath}/review/csv`);
        expect(csv.status()).toBe(200);
        expect(await csv.text()).toContain('SYNCCNCAS080001');
        const checklist = reviewer.getByRole('region', { name: 'Checklist' });
        await expect(checklist.getByRole('checkbox')).toHaveCount(6);
        for (const box of await checklist.getByRole('checkbox').all()) {
          await box.check();
        }
        await expectAccessible(reviewer, 'The reviewer checklist');
        await checklist.getByRole('button', { name: 'Sign the attestation' }).click();
        await expect(reviewer).toHaveURL(new RegExp(`${reportPath}$`));
        await expect(reviewer.locator('[data-release="attested"]')).toBeVisible();
        await expect(reviewer.getByRole('region', { name: 'Attestation and release' })).toContainText(`Attested`);
      } finally {
        await context.close();
      }
    });

    await test.step('signed, the manager releases it and downloads its PDF and line CSV', async () => {
      await page.goto(reportPath);
      await expect(page.locator('[data-release="attested"]')).toBeVisible();
      await page.getByRole('button', { name: 'Release the report' }).click();
      await expect(page.locator('[data-release="released"]')).toBeVisible();
      await expectPdf(page, `${reportPath}/pdf`);
      const csv = await page.request.get(`${reportPath}/csv`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      expect(await csv.text()).toContain('SYNCCNCAS080001');
      await expect(page.getByRole('region', { name: 'Files' }).getByLabel('Link to share within the organization')).toHaveValue(new RegExp(`${reportPath}$`));
      for (const value of KNOWN) {
        await expect(page.locator('main')).not.toContainText(value);
      }
    });

    await test.step('the monthly summary prints to PDF with its CSV, its stages kept apart', async () => {
      await page.goto(`${reports}/monthly?month=2026-03`);
      await expect(page.locator('[data-stage="actionable"]')).toContainText('$90.00');
      await expectAccessible(page, 'The monthly summary');
      await page.getByRole('button', { name: 'Generate the month’s PDF' }).click();
      await expect(page).toHaveURL(new RegExp(`${reports}/documents/[0-9a-f-]{36}$`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Monthly variance summary, 2026-03');
      await printed(page, '[data-document-status="ready"]');
      const documentPath = new URL(page.url()).pathname;
      await expectPdf(page, `${documentPath}/pdf`);
      const csv = await (await page.request.get(`${documentPath}/csv`)).text();
      expect(csv).toContain('2026-03');
      for (const value of KNOWN) {
        expect(csv).not.toContain(value);
      }
      await expectAccessible(page, 'A monthly summary’s document');
    });

    await test.step('the coverage report prints the Coverage screen to PDF and CSV', async () => {
      await page.goto(`/p/${practice}/coverage`);
      await expectAccessible(page, 'Coverage');
      await page.getByRole('region', { name: 'Coverage report' }).getByRole('button', { name: 'Generate the coverage report' }).click();
      await expect(page).toHaveURL(new RegExp(`${reports}/documents/[0-9a-f-]{36}$`));
      await expect(page.locator('[data-figure="priced-share"]')).toContainText('Priced: 3 of 3 lines (100.0%)');
      await printed(page, '[data-document-status="ready"]');
      const documentPath = new URL(page.url()).pathname;
      await expectPdf(page, `${documentPath}/pdf`);
      const csv = await (await page.request.get(`${documentPath}/csv`)).text();
      expect(csv.split('\r\n')[0]).toBe('section,item,name,lines,claims,billed,paid,share');
      for (const value of KNOWN) {
        expect(csv).not.toContain(value);
      }
      expect(() => {
        assertNoPhi('url', page.url(), { known: KNOWN });
      }).not.toThrow();
    });

    await test.step('the Reports screen lists the documents, every download in the export history with the line-level ones marked, and the ROI statements', async () => {
      await page.goto(reports);
      await expect(page.getByRole('table', { name: 'Generated reports' }).locator('[data-document]')).toHaveCount(2);
      const exports = page.getByRole('table', { name: 'Exports' });
      await expect(exports.locator('[data-line-level="yes"]')).toHaveCount(2);
      await expect(exports.locator('[data-line-level="yes"]').first()).toContainText('Line-level PHI');
      await expect(exports.locator('[data-export="audit_report"]')).toHaveCount(3);
      await expect(exports.locator('[data-export="report_document"]')).toHaveCount(4);
      // Each download in words, its record named with its own article (the screen tour's C1: "PDF of a audit report").
      await expect(exports).toContainText('PDF of an audit report');
      expect(await exports.locator('tbody').innerText()).not.toMatch(/\ba [aeiou]/i);
      await expect(page.locator(`[data-headline]`).getByRole('link').first()).toHaveAttribute('href', `${reportPath}#stage-actionable`);
      await expect(page.getByRole('region', { name: 'Share' }).getByLabel('Link to share within the organization')).toHaveValue(new RegExp(`${reports}$`));
      await expectAccessible(page, 'Reports');
      await page.getByRole('link', { name: 'Open the ROI statements' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'ROI statements' })).toBeVisible();
    });

    await test.step('a viewer reads the reports and downloads their PDFs, and is refused the line CSV', async () => {
      const context = await browser.newContext();
      const viewer = await context.newPage();
      try {
        await signInWithTotp(viewer, 'reports-viewer');
        await viewer.goto(reports);
        await expect(viewer.locator('[data-state="permission"]')).toContainText('you cannot export line-level PHI');
        await expect(viewer.getByRole('region', { name: 'Generate an audit report' })).toHaveCount(0);
        await expect(viewer.getByRole('link', { name: 'Download the line CSV' })).toHaveCount(0);
        await expect(viewer.getByRole('link', { name: 'Download the PDF' })).toHaveCount(1);
        await expectAccessible(viewer, 'Reports, for a viewer');
        await expectPdf(viewer, `${reportPath}/pdf`);
        const refused = await viewer.request.get(`${reportPath}/csv`);
        expect(refused.status()).toBe(403);
        expect(await refused.text()).not.toContain('SYNCCNCAS080001');
        await viewer.goto(reportPath);
        await expect(viewer.getByRole('region', { name: 'Files' }).getByRole('link', { name: 'Line CSV' })).toHaveCount(0);
        await viewer.goto(reports);
        // The refusal exported nothing: the line-level exports are still the reviewer's and the manager's.
        await expect(viewer.getByRole('table', { name: 'Exports' }).locator('[data-line-level="yes"]')).toHaveCount(2);
      } finally {
        await context.close();
      }
    });
  } finally {
    await local.close();
  }
});
