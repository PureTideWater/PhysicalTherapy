import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { refusal, signInWithTotp } from './helpers';
import { openPacketCase, packetPractice } from './packets';
import { startLocalWorker } from './worker';

/**
 * The packet builder and the submission log in the browser (PRD 5, J9; PRD 7, Packet builder and
 * Submissions and responses; PRD 12; test matrix CAS-08, CAS-09, CAS-12; the milestone 8 done check): in
 * a practice of its own, a billing manager uploads the SYNTHETIC CAS-08 remittance, whose case the
 * worker prices and triages (the payer's schedule abstracted and signed off beside the browser,
 * e2e/packets.ts). The drafter writes the first version from the code-built draft, adds a sentence with
 * a figure that is in no input record, sees the live check flag it and, once saved, approval blocked;
 * writes a passing version again and is refused approval as its drafter, with the reason; a second
 * billing manager approves it and exports it, the worker printing the PDF and CSV with the identifiers
 * inserted; and the submission logged carries the export's SHA-256. Identifiers stay placeholders on
 * screen. Synthetic data only.
 */

const REMITTANCE = readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/synthetic/CAS-08/remit.835'));
/** The CAS-08 fixture's identifiers, which only the export's files carry. */
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003'];
const UNSOURCED = ' The payer also withheld 1234.56 on these claims [1].';

async function withWorker<T>(run: () => Promise<T>): Promise<T> {
  const local = await startLocalWorker();
  try {
    return await run();
  } finally {
    await local.close();
  }
}

async function expectNoIdentifiers(page: Page): Promise<void> {
  const text = await page.locator('main').innerText();
  for (const identifier of KNOWN) {
    expect(text).not.toContain(identifier);
  }
}

test('a figure not in the input blocks approval, the drafter cannot approve, a second person approves, and the export’s hash is in the submission log (milestone 8)', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const practiceId = await packetPractice();
  await signInWithTotp(page, 'packet-drafter');

  const caseId = await test.step('the remittance loads, and the worker opens its case', () =>
    withWorker(async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: REMITTANCE }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      return openPacketCase(practiceId);
    }),
  );
  const casePath = `/p/${practiceId}/cases/${caseId}`;

  await test.step('the case opens its packet builder, private and never cached', async () => {
    await page.goto(casePath);
    await expect(page.locator('[data-packet="none"]')).toBeVisible();
    await page.getByRole('link', { name: 'Build the packet' }).click();
    await expect(page).toHaveURL(new RegExp(`${casePath}/packet$`));
    const response = await page.reload();
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await expect(page.getByRole('heading', { level: 1, name: /^Packet:/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'First version' })).toBeVisible();
    await page.getByRole('button', { name: 'Write the first version' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 1');
    await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
    // Identifiers are placeholders on screen; the export inserts them.
    await expectNoIdentifiers(page);
  });

  await test.step('a sentence with a figure in no input record is flagged as it is typed, and its version cannot be approved (CAS-08)', async () => {
    const editor = page.getByRole('textbox', { name: 'Narrative', exact: true });
    await editor.fill(`${await editor.inputValue()}${UNSOURCED}`);
    const live = page.locator('[data-live-check]');
    await expect(live).toHaveAttribute('data-live-check', 'fails');
    await expect(page.getByRole('list', { name: 'Live mismatches' }).getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('list', { name: 'Live mismatches' })).toContainText('1234.56');
    await page.getByRole('button', { name: 'Save as a new version' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 2');
    await expect(page.locator('[data-verifier="failed"]')).toBeVisible();
    await expect(page.getByLabel('Stored narrative').locator('mark')).toHaveText(['1234.56']);
    const approval = page.getByRole('region', { name: 'Approval' });
    await expect(approval.locator('[data-approval="blocked"][data-reason="verifier"]')).toBeVisible();
    await expect(approval.getByRole('button', { name: 'Approve this version' })).toBeDisabled();
    await expect(approval.getByRole('button', { name: 'Request approval' })).toHaveCount(0);
  });

  await test.step('the drafter writes a passing version again and is refused its approval, with the reason (CAS-09)', async () => {
    await page.getByRole('button', { name: 'Write a new version from the code-built draft' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 3');
    await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
    const approval = page.getByRole('region', { name: 'Approval' });
    await expect(approval.locator('[data-approval="drafter"]')).toBeVisible();
    await approval.getByRole('button', { name: 'Approve this version' }).click();
    await expect(refusal(page).filter({ hasText: 'the person who drafted or last edited a packet cannot approve it' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Request approval' }).click();
    await expect(page.locator('[data-notice="requested"]')).toBeVisible();
    await expect(page.locator('[data-approval-request="yes"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Versions' }).locator('[data-version="3"]')).toContainText('Passed');
    await expect(page.getByRole('table', { name: 'Versions' }).locator('[data-version="2"]')).toContainText('Failed');
  });

  const approver = await browser.newPage();
  try {
    await signInWithTotp(approver, 'packet-approver');
    const pdfSha256 = await test.step('a second billing manager approves it and exports it; the worker prints the PDF and CSV and records their SHA-256 (CAS-11)', () =>
      withWorker(async () => {
        await approver.goto(`${casePath}/packet`);
        const approval = approver.getByRole('region', { name: 'Approval' });
        await expect(approval.locator('[data-approval="ready"]')).toBeVisible();
        await approval.getByRole('button', { name: 'Approve this version' }).click();
        await expect(approver.locator('[data-notice="approved"]')).toBeVisible();
        await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
        await approver.getByRole('button', { name: 'Export PDF and CSV' }).click();
        await expect(approver.locator('[data-notice="export_requested"]')).toBeVisible();
        await expect(async () => {
          await approver.goto(`${casePath}/packet`);
          await expect(approver.locator('[data-export="done"]')).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 90_000 });
        await expectNoIdentifiers(approver);
        return (await approver.getByLabel('PDF SHA-256', { exact: true }).getAttribute('data-sha256')) ?? '';
      }),
    );
    expect(pdfSha256).toMatch(/^[0-9a-f]{64}$/);

    await test.step('the PDF downloads with that SHA-256, with the identifiers the screen never showed', async () => {
      const response = await approver.request.get(`${casePath}/packet/${await currentVersionId(approver)}/pdf`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect(response.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(pdfSha256);
      const csv = await approver.request.get(`${casePath}/packet/${await currentVersionId(approver)}/csv`);
      expect(csv.status()).toBe(200);
      expect(await csv.text()).toContain('SYNCCNCAS080001');
    });

    await test.step('the submission is logged, and the log carries the export’s SHA-256 (CAS-12)', async () => {
      await approver.getByRole('link', { name: 'Log its submission' }).click();
      await expect(approver).toHaveURL(new RegExp(`${casePath}/submissions$`));
      await expect(approver.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(approver.getByLabel('Export SHA-256')).toHaveAttribute('data-sha256', pdfSha256);
      await approver.getByLabel('Payer’s reference (a portal confirmation, a fax receipt)').fill('SYNTHETIC-PORTAL-REF-E2E');
      await approver.getByRole('button', { name: 'Log the submission' }).click();
      await expect(approver.locator('[data-notice="logged"]')).toBeVisible();
      const log = approver.getByRole('region', { name: 'Submission log' });
      await expect(log.locator(`[data-export-hash="${pdfSha256}"]`)).toBeVisible();
      await expect(log.locator('[data-follow-up]')).toHaveCount(1);
      assertNoPhi('url', approver.url(), { known: KNOWN });
    });

    await test.step('the drafter sees the case submitted, its packet approved and exported', async () => {
      await page.goto(casePath);
      await expect(page.locator('[data-packet="approved"]')).toContainText('approved; exported');
      await expect(page.getByRole('heading', { level: 1 }).locator('[data-state="submitted"]')).toBeVisible();
      assertNoPhi('url', page.url(), { known: KNOWN });
    });
  } finally {
    await approver.close();
  }
});

/** The packet's current version, from the builder's version table. */
async function currentVersionId(page: Page): Promise<string> {
  const href = (await page.getByRole('table', { name: 'Versions' }).getByRole('link', { name: 'Version 3' }).getAttribute('href')) ?? '';
  return new URL(href, 'http://localhost').searchParams.get('version') ?? '';
}
