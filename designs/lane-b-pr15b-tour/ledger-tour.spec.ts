import { writeFileSync } from 'node:fs';

import { type Browser, type Page, expect, test } from '@playwright/test';
import { syntheticPdf } from '@tp/contracts/testing';

import { registerKeyAndSignIn, signInWithTotp, withDatabase } from '/home/user/screens/apps/web/e2e/helpers';
import { journeyPractice } from '/home/user/screens/apps/web/e2e/journeys';
import { LEDGER_PRACTICE, openLedgerCase, patientSharePractice, reconcileNow, uploadLedger835, uploadLedgerExport } from '/home/user/screens/apps/web/e2e/ledger';
import { startLocalWorker } from '/home/user/screens/apps/web/e2e/worker';

/**
 * PR 15b's before/after screen tour, populate only (designs/lane-b-pr15b-tour; design 5.1): the same SYNTHETIC LED-14,
 * LED-15 and LED-18 fixtures (the head's fixtures/synthetic, copied into the base worktree for the before run) loaded
 * through the product on either build, with no assertion on the figures either build shows. Each case gets a practice
 * of its own, and its ids are written to $TOUR_DIR/led-<case>.json for capture.spec.ts.
 * - LED-14 and LED-15 follow apps/web/e2e/ledger-patient-share.spec.ts's uploads and reconciles (original, adjusted,
 *   reconcile; LED-14's 24.00 deposit), without its head-only assertions.
 * - LED-18 (no e2e spec at the head) is done in the browser: the packet written by the ledger manager, approved and
 *   exported by a second billing manager, attested by the reimbursement reviewer under a support grant, its submission
 *   logged, the payer's letter uploaded and an acceptance of 24.00 recorded; the reconcile; then the adjusted 835 and
 *   the 24.00 deposit.
 * - LED-15's mixed variant (the UX re-check of UX-1), in the LED-15 test after its case: a practice of its own with
 *   original.835 then mixed-adjusted.835 and the reconcile; its ids in led-15mixed.json (no statement or report).
 * - Then, for each: an ROI statement for 2026 generated on the ROI screen and an audit report from the Reports screen,
 *   both printed by the worker.
 * Each test signs in a billing manager of its own (LED-14 the ledger manager, LED-15 the triage manager, LED-18 the
 * unattested journey's manager and approver), since a TOTP code is accepted once and specs run in parallel.
 * Synthetic data only.
 */

const OUT = process.env.TOUR_DIR ?? '';
if (OUT === '') throw new Error('Set TOUR_DIR');

async function withWorker<T>(run: () => Promise<T>): Promise<T> {
  const local = await startLocalWorker();
  try {
    return await run();
  } finally {
    await local.close();
  }
}

async function poll(what: string, check: () => Promise<boolean>, timeoutMs = 120_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function count(sql: string, values: unknown[]): Promise<number> {
  return withDatabase(async (client) => Number((await client.query<{ n: string }>(sql, values)).rows[0]?.n ?? '0'));
}

const matches = (practiceId: string) => count('SELECT count(*)::text AS n FROM ledger_match WHERE practice_id = $1', [practiceId]);
const entries = (practiceId: string, stage: string) => count('SELECT count(*)::text AS n FROM ledger_entry WHERE practice_id = $1 AND stage = $2', [practiceId, stage]);

/** An ROI statement for 2026 and an audit report of the March run, generated on screen and printed by the worker. */
async function statementAndReport(page: Page, practiceId: string): Promise<{ statementId: string; reportId: string }> {
  return withWorker(async () => {
    await page.goto(`/p/${practiceId}/reports/roi`);
    const form = page.getByRole('region', { name: 'Generate a statement' });
    await form.getByLabel('First day').fill('2026-01-01');
    await form.getByLabel('Last day').fill('2026-12-31');
    await form.getByRole('button', { name: 'Generate the statement' }).click();
    await poll('the ROI statement printed', async () => (await count('SELECT count(*)::text AS n FROM roi_statement WHERE practice_id = $1 AND document_key IS NOT NULL', [practiceId])) > 0);
    const statementId = await withDatabase(async (client) => (await client.query<{ id: string }>('SELECT id FROM roi_statement WHERE practice_id = $1 ORDER BY created_at DESC LIMIT 1', [practiceId])).rows[0]?.id ?? '');

    await page.goto(`/p/${practiceId}/reports`);
    const generate = page.getByRole('region', { name: 'Generate an audit report' });
    await generate.getByLabel('Pricing run').selectOption({ index: 0 });
    await generate.getByRole('button', { name: 'Generate the report' }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/reports/[0-9a-f-]{36}$`));
    const reportId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    await poll('the audit report ready', async () => (await count("SELECT count(*)::text AS n FROM audit_report WHERE id = $1 AND status = 'ready'", [reportId])) > 0);
    return { statementId, reportId };
  });
}

function save(caseKey: string, ids: Record<string, string>): void {
  writeFileSync(`${OUT}/led-${caseKey}.json`, JSON.stringify(ids, null, 2));
}

test('LED-14: coinsurance correction, then its 24.00 deposit', async ({ page }) => {
  test.setTimeout(480_000);
  const practiceId = await patientSharePractice('LED-14');
  await signInWithTotp(page, 'ledger-manager');
  const caseId = await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-14', 'original.835');
    return openLedgerCase(practiceId);
  });
  save('14', { practiceId, caseId });
  await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-14', 'adjusted.835');
    await reconcileNow(practiceId);
    await poll('the adjusted remittance matched', async () => (await matches(practiceId)) > 0);
  });
  await withWorker(async () => {
    await uploadLedgerExport(page, practiceId, 'LED-14', 'eft_export', 'eft-export.csv');
    await poll('the deposit entry', async () => (await entries(practiceId, 'deposited')) > 0);
  });
  save('14', { practiceId, caseId, ...(await statementAndReport(page, practiceId)) });
});

test('LED-15: a correction the deductible took whole, then its mixed variant', async ({ page }) => {
  test.setTimeout(720_000);
  const practiceId = await patientSharePractice('LED-15');
  await signInWithTotp(page, 'triage-manager');
  const caseId = await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-15', 'original.835');
    return openLedgerCase(practiceId);
  });
  save('15', { practiceId, caseId });
  await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-15', 'adjusted.835');
    await reconcileNow(practiceId);
    await poll('the adjusted remittance matched', async () => (await matches(practiceId)) > 0);
    // A few seconds more for the reconcile's line stages and any entries to settle.
    await page.waitForTimeout(5_000);
  });
  save('15', { practiceId, caseId, ...(await statementAndReport(page, practiceId)) });
  // The UX re-check (UX-1): LED-15's mixed variant in a practice of its own, as the synth case says: original.835,
  // then mixed-adjusted.835 (allowed +30.00, PR-1 +20.00, CO-253 10.00, paid nothing more). Same page and persona,
  // after the case above, so no second TOTP sign-in. Its ids go to led-15mixed.json.
  const mixedPractice = await patientSharePractice('LED-15');
  const mixedCase = await withWorker(async () => {
    await uploadLedger835(page, mixedPractice, 'LED-15', 'original.835');
    return openLedgerCase(mixedPractice);
  });
  await withWorker(async () => {
    await uploadLedger835(page, mixedPractice, 'LED-15', 'mixed-adjusted.835');
    await reconcileNow(mixedPractice);
    await poll('the mixed correction matched', async () => (await matches(mixedPractice)) > 0);
    await page.waitForTimeout(5_000);
  });
  save('15mixed', { practiceId: mixedPractice, caseId: mixedCase });
});

/** The reimbursement reviewer who attests LED-18's export (one hardware key per database). */
const REVIEWER = process.env.TOUR_LED18_REVIEWER ?? 'unattested-reviewer';

const LED18_SETTINGS = {
  place_of_service_settings: { '11': 'non_facility', '22': 'facility' },
  default_rounding: 'HALF_UP_CENT',
  case_materiality_cents: '1000',
  proof_level: 'deposited',
  posting_export_template: { template: 'synthetic_pm_export_v1' },
  correspondence_contact: { name: 'SYNTHETIC BILLING OFFICE', phone: '9195550100' },
};

async function signedIn(browser: Browser, persona: string, internal = false): Promise<Page> {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  if (internal) await registerKeyAndSignIn(page, persona);
  else await signInWithTotp(page, persona);
  return page;
}

test('LED-18: a payer response accepted before the remittance pays it', async ({ page, browser }) => {
  test.setTimeout(600_000);
  const practiceId = await journeyPractice({ name: `${LEDGER_PRACTICE} LED-18 ${Date.now().toString(36)}`, settings: LED18_SETTINGS, supportFor: [REVIEWER] });
  await signInWithTotp(page, 'unattested-manager');
  const caseId = await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-18', 'original.835');
    return openLedgerCase(practiceId);
  });
  save('18', { practiceId, caseId });
  const casePath = `/p/${practiceId}/cases/${caseId}`;

  await test.step('the ledger manager writes the packet', async () => {
    await page.goto(`${casePath}/packet`);
    await page.getByRole('button', { name: 'Write the first version' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
  });

  const approver = await signedIn(browser, 'unattested-approver');
  await test.step('a second billing manager approves it and the worker exports it', async () => {
    await approver.goto(`${casePath}/packet`);
    const approval = approver.getByRole('region', { name: 'Approval' });
    await approval.getByRole('button', { name: 'Approve this version' }).click();
    await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
    await withWorker(async () => {
      await approver.getByRole('button', { name: 'Export PDF and CSV' }).click();
      await expect(approver.locator('[data-export="done"]')).toBeVisible({ timeout: 120_000 });
    });
  });

  await test.step('the reimbursement reviewer downloads both files and attests', async () => {
    const reviewer = await signedIn(browser, REVIEWER, true);
    await reviewer.goto(`/p/${practiceId}/packet-reviews`);
    await reviewer.getByRole('table', { name: 'Exports waiting' }).getByRole('link').first().click();
    await expect(reviewer).toHaveURL(/\/review$/);
    const files = reviewer.getByRole('region', { name: 'Export', exact: true });
    for (const name of ['PDF', 'CSV schedule']) {
      const [saved] = await Promise.all([reviewer.waitForEvent('download'), files.getByRole('link', { name, exact: true }).click()]);
      await saved.path();
      await reviewer.reload();
    }
    const attestation = reviewer.getByRole('region', { name: 'Attestation' });
    const attest = attestation.getByRole('button', { name: 'Attest the export' });
    await expect(attest).toBeEnabled();
    await reviewer.waitForLoadState('networkidle');
    const boxes = attestation.getByRole('checkbox');
    const total = await boxes.count();
    for (let index = 0; index < total; index += 1) {
      await boxes.nth(index).check();
      await expect(boxes.nth(index)).toBeChecked();
    }
    writeFileSync(`${OUT}/led-18-attest-boxes.txt`, `${String(total)} boxes checked\n`);
    await attest.click();
    try {
      await expect(reviewer.locator('[data-notice="attested"]')).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      writeFileSync(`${OUT}/led-18-attest-debug.txt`, `${reviewer.url()}\n${await reviewer.locator('main').innerText()}`);
      await reviewer.screenshot({ path: `${OUT}/led-18-attest-debug.png`, fullPage: true });
      throw error;
    }
    await reviewer.context().close();
  });

  await test.step('the submission is logged, the letter uploaded and the acceptance of 24.00 recorded', async () => {
    await approver.goto(`${casePath}/submissions`);
    await approver.getByLabel('Payer’s reference (a portal confirmation, a fax receipt)').fill('SYNTHETIC-PORTAL-REF-LED18');
    await approver.getByRole('button', { name: 'Log the submission' }).click();
    await expect(approver.locator('[data-notice="logged"]')).toBeVisible();
    await withWorker(async () => {
      await approver.goto(`/p/${practiceId}/contracts`);
      await approver.getByLabel('Kind of document').selectOption('payer_letter');
      const letter = Buffer.from(syntheticPdf([['SYNTHETIC PAYER LETTER - INVENTED TEXT', 'On reconsideration the payer will pay 24.00 more on the line.']]));
      await approver.getByLabel('Choose files to upload').setInputFiles([{ name: 'letter.pdf', mimeType: 'application/pdf', buffer: letter }]);
      await expect(approver.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'letter.pdf' })).toContainText('Stored', { timeout: 90_000 });
    });
    await approver.goto(`${casePath}/submissions`);
    const form = approver.getByRole('region', { name: 'Log a payer response' });
    await form.getByLabel('Response', { exact: true }).selectOption('accepted');
    // The base labels it "Amount accepted (...)", the head "Amount the payer will pay (...)": the field by its id.
    await form.locator('#amount').fill('24.00');
    await form.getByRole('button', { name: 'Record the response' }).click();
    await expect(approver.locator('[data-notice="recorded"]')).toBeVisible();
    await approver.context().close();
  });

  await withWorker(async () => {
    await reconcileNow(practiceId);
    await poll('the acceptance approved', async () => (await entries(practiceId, 'approved')) > 0);
  });
  await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-18', 'adjusted.835');
    await reconcileNow(practiceId);
    await poll('the adjusted remittance matched', async () => (await matches(practiceId)) > 0);
  });
  await withWorker(async () => {
    await uploadLedgerExport(page, practiceId, 'LED-18', 'eft_export', 'eft-export.csv');
    await poll('the deposit entry', async () => (await entries(practiceId, 'deposited')) > 0);
  });
  save('18', { practiceId, caseId, ...(await statementAndReport(page, practiceId)) });
});
