import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { syntheticPdf } from '@tp/contracts/testing';
import { assertNoPhi } from '@tp/observability';

import { expectAccessible } from './a11y';
import { attemptEvents, reopenLine, shownVersionId, writeOffFirstLine } from './export-attempts';
import { registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';
import { queue } from './journeys';
import { citedAmendmentCase, deadlinePractice, openPacketCase, packetPractice, uncitedWindowCase } from './packets';
import { startLocalWorker } from './worker';

/**
 * The packet builder and the submission log in the browser (PRD 5, J9; PRD 7, Packet builder and
 * Submissions and responses; PRD 12; test matrix CAS-08, CAS-09, CAS-12; the milestone 8 done check): in
 * a practice of its own, a billing manager uploads the SYNTHETIC CAS-08 remittance, whose case the
 * worker prices and triages (the payer's schedule abstracted and signed off beside the browser,
 * e2e/packets.ts). The drafter writes the first version from the code-built draft, adds a sentence with
 * a figure that is in no input record, sees the live check flag it and, once saved, approval blocked;
 * writes a passing version again and finds the Approve button disabled as its drafter, with the reason, next
 * to Request approval (the best-option audit's item #61); a second billing manager approves it and asks for
 * the export while no worker runs, and the builder shows it in progress; a line written off before the worker
 * takes the job is refused at once with its fix, and the job's own refusal is shown with its reason and fix
 * and recorded as a coded event (item #26); the line reopened, the export is asked again, the builder's status
 * follows the worker by itself, and the worker prints the PDF and CSV with the identifiers inserted, each line's
 * deadline verified from the contract's cited window (CO-05, D17); the reimbursement
 * reviewer, under a support grant, finds the attest button disabled until they have downloaded both of the
 * export's files from the review, then attests over their SHA-256 (D16; the owner's addition of 2026-10-18); and the
 * submission logged carries the export's SHA-256. Identifiers stay placeholders on screen. The payer's answer (PRD 5, J10: "logs the payer's response"; LED-01) follows: a SYNTHETIC
 * payer letter is uploaded on the Contracts screen and recorded as a partial acceptance of 60.00, which
 * moves no money by itself; the next reconcile (queued as the daily schedule queues it) approves it in
 * the recovery ledger, and the dashboard shows it as payer approved, never as recovered. The adjusted
 * remittance, posting, deposit, recovered and recoupment steps of J10 are e2e/reconciliation.spec.ts.
 * Synthetic data only.
 */

const REMITTANCE = readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/synthetic/CAS-08/remit.835'));
/** May's SYNTHETIC remittance of the same payer and plan: three 97110 lines each 20.00 short (CAS-04). */
const MAY_REMITTANCE = readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/synthetic/CAS-04/remit.835'));
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
  test.setTimeout(600_000);
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
    await expectAccessible(page, 'Packet builder, before its first version');
    await page.getByRole('button', { name: 'Write the first version' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 1');
    await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
    // Each line's deadline, verified from the contract's own window cited on its page (CO-05, D17), shown with its label.
    const deadline = page.getByRole('region', { name: 'Deadline' });
    await expect(deadline.locator('[data-deadline-summary="verified"]')).toBeVisible();
    await expect(deadline).toContainText('Deadline verified');
    await expect(deadline.getByRole('list', { name: 'Deadline evidence' })).toContainText('Disputes are raised within 3650 days of the remittance.');
    await expect(page.getByRole('table', { name: 'Line schedule' }).locator('[data-deadline="verified"]')).toHaveCount(3);
    await expect(page.getByRole('table', { name: 'Calculations' }).locator('[data-calculation-row]')).toHaveCount(3);
    // Identifiers are placeholders on screen; the export inserts them.
    await expectNoIdentifiers(page);
    // One form writes a version: its fields once, each with an ID of its own (item #61).
    await expect(page.getByRole('form', { name: 'Write a version' })).toHaveCount(1);
    await expect(page.locator('#prompt-pay-state')).toHaveCount(1);
    await expect(page.locator('#narrative')).toHaveCount(1);
    await expectAccessible(page, 'Packet builder, its first version');
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

  await test.step('the drafter writes a passing version again and finds the Approve button disabled, with the reason, beside Request approval (CAS-09; item #61)', async () => {
    await page.getByRole('button', { name: 'Write a new version from the code-built draft' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 3');
    await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
    const approval = page.getByRole('region', { name: 'Approval' });
    await expect(approval.locator('[data-approval="drafter"]')).toBeVisible();
    // No working Approve button for the drafter: it is disabled, saying who approves, beside Request approval (item #61).
    const approve = approval.getByRole('button', { name: 'Approve this version' });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription('A second person who approves packets approves it; ask with Request approval.');
    await expect(approval.getByRole('button', { name: 'Request approval' })).toBeEnabled();
    await expect(approval.locator('form')).toHaveCount(1);
    await expectAccessible(page, 'Packet builder, the drafter’s approval panel');
    await page.getByRole('button', { name: 'Request approval' }).click();
    await expect(page.locator('[data-notice="requested"]')).toBeVisible();
    await expect(page.locator('[data-approval-request="yes"]')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Versions' }).locator('[data-version="3"]')).toContainText('Passed');
    await expect(page.getByRole('table', { name: 'Versions' }).locator('[data-version="2"]')).toContainText('Failed');
  });

  // A context of its own, so the accessibility check runs on the approver's page too.
  const approverContext = await browser.newContext();
  const approver = await approverContext.newPage();
  try {
    await signInWithTotp(approver, 'packet-approver');
    await test.step('a second billing manager approves it and asks for the export while no worker runs: the builder shows it in progress (CAS-11; item #26)', async () => {
      await approver.goto(`${casePath}/packet`);
      const approval = approver.getByRole('region', { name: 'Approval' });
      await expect(approval.locator('[data-approval="ready"]')).toBeVisible();
      await approval.getByRole('button', { name: 'Approve this version' }).click();
      await expect(approver.locator('[data-notice="approved"]')).toBeVisible();
      await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
      await approver.getByRole('button', { name: 'Export PDF and CSV' }).click();
      await expect(approver.locator('[data-notice="export_requested"]')).toBeVisible();
      await expect(approver.locator('[data-notice="export_requested"]')).not.toContainText('Reload');
      const status = approver.getByRole('region', { name: 'Export', exact: true }).getByRole('status');
      await expect(status).toHaveAttribute('data-export-attempt', 'in_progress');
      await expect(status).toContainText('the worker is checking the version again and printing its PDF and CSV');
      await expect(status.getByRole('link', { name: 'Check again' })).toBeVisible();
      // Asked for already: no second Export button while it is in progress.
      await expect(approver.getByRole('button', { name: 'Export PDF and CSV' })).toHaveCount(0);
      await expectAccessible(approver, 'Packet builder, its export in progress');
    });

    const versionId = await shownVersionId(approver);
    const writtenOff = await test.step('a line written off before the worker takes the job: the builder says why at once, and the job refuses it with its reason and fix, recorded as a coded event (item #26)', async () => {
      const line = await writeOffFirstLine(approver, casePath);
      await approver.goto(`${casePath}/packet`);
      const exported = approver.getByRole('region', { name: 'Export', exact: true });
      await expect(exported.locator('[data-export="blocked"][data-reason="case_changed"]')).toContainText('The case changed since this version was written');
      await expect(exported.getByRole('button', { name: 'Export PDF and CSV' })).toHaveCount(0);
      await withWorker(async () => {
        await expect(async () => {
          await approver.goto(`${casePath}/packet`);
          await expect(approver.locator('[data-export-attempt="refused"][data-code="case_changed"]')).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 90_000 });
      });
      await expect(approver.locator('[data-export-attempt="refused"]')).toContainText('The export job refused this version');
      await expect(approver.locator('[data-export-attempt="refused"]')).toContainText('Write a new version of the packet and approve it');
      expect((await attemptEvents(practiceId, versionId, KNOWN)).map((event) => [event.actor_kind, event.action, event.object_type, event.purpose])).toEqual([
        ['service', 'packet_export_refused', 'packet_version', 'case_changed'],
      ]);
      await expectAccessible(approver, 'Packet builder, its export refused');
      return line;
    });

    const pdfSha256 = await test.step('the line reopened, the export is asked again; the builder follows the worker by itself until it prints the PDF and CSV and records their SHA-256 (CAS-11)', async () => {
      await reopenLine(approver, casePath, writtenOff);
      await approver.goto(`${casePath}/packet`);
      return withWorker(async () => {
        await approver.getByRole('button', { name: 'Export PDF and CSV' }).click();
        await expect(approver.locator('[data-notice="export_requested"]')).toBeVisible();
        // No reload: the status region asks the server again every few seconds.
        await expect(approver.locator('[data-export="done"]')).toBeVisible({ timeout: 90_000 });
        await expectNoIdentifiers(approver);
        return (await approver.getByLabel('PDF SHA-256', { exact: true }).getAttribute('data-sha256')) ?? '';
      });
    });
    expect(pdfSha256).toMatch(/^[0-9a-f]{64}$/);

    await test.step('the PDF downloads with that SHA-256, with the identifiers the screen never showed, and the CSV with its own', async () => {
      const response = await approver.request.get(`${casePath}/packet/${await currentVersionId(approver)}/pdf`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect(response.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(pdfSha256);
      const csvSha256 = (await approver.getByLabel('CSV SHA-256', { exact: true }).getAttribute('data-sha256')) ?? '';
      const csv = await approver.request.get(`${casePath}/packet/${await currentVersionId(approver)}/csv`);
      expect(csv.status()).toBe(200);
      expect(createHash('sha256').update(await csv.body()).digest('hex')).toBe(csvSha256);
      expect(await csv.text()).toContain('SYNCCNCAS080001');
      // The submission waits for the reviewer's attestation.
      await expect(approver.locator('[data-attestation="waiting"]')).toBeVisible();
    });

    await test.step('the reimbursement reviewer, under a support grant, downloads both of the export’s files and then attests over their SHA-256 (D16; the owner’s addition of 2026-10-18)', async () => {
      const context = await browser.newContext({ acceptDownloads: true });
      const reviewer = await context.newPage();
      try {
        await registerKeyAndSignIn(reviewer, 'packet-reviewer');
        await reviewer.goto(`/p/${practiceId}/packet-reviews`);
        await reviewer.getByRole('table', { name: 'Exports waiting' }).getByRole('link').first().click();
        await expect(reviewer).toHaveURL(new RegExp(`${casePath}/packet/[0-9a-f-]{36}/review$`));
        await expect(reviewer.getByRole('region', { name: 'Deadline' }).locator('[data-deadline-summary="verified"]')).toBeVisible();
        const exportFiles = reviewer.getByRole('region', { name: 'Export', exact: true });
        const attestation = reviewer.getByRole('region', { name: 'Attestation' });
        // The billing manager's downloads are not the reviewer's: the attest button is disabled and says why.
        const blocked = async (missing: string) => {
          await expect(attestation.locator('[data-attestation="needs_downloads"]')).toBeVisible();
          await expect(attestation.getByRole('button', { name: 'Attest the export' })).toBeDisabled();
          await expect(attestation.locator('#attest-blocked')).toHaveText(new RegExp(`^Download ${missing} under Exported files first`));
        };
        await blocked('the PDF and the CSV schedule');
        /** Clicks a file's link on the review, and returns the SHA-256 of what the browser saved. */
        const download = async (name: string): Promise<string> => {
          const [saved] = await Promise.all([reviewer.waitForEvent('download'), exportFiles.getByRole('link', { name, exact: true }).click()]);
          const file = await saved.path();
          return createHash('sha256').update(readFileSync(file)).digest('hex');
        };
        expect(await download('PDF')).toBe(pdfSha256);
        await reviewer.reload();
        await expect(exportFiles.locator('[data-download="pdf"]')).toHaveAttribute('data-downloaded', 'true');
        await expect(exportFiles.locator('[data-download="csv"]')).toHaveAttribute('data-downloaded', 'false');
        await blocked('the CSV schedule');
        const csvSha256 = (await exportFiles.getByLabel('CSV SHA-256', { exact: true }).getAttribute('data-sha256')) ?? '';
        expect(await download('CSV schedule')).toBe(csvSha256);
        await reviewer.reload();
        await expect(exportFiles.locator('[data-download="csv"]')).toHaveAttribute('data-downloaded', 'true');
        await expect(attestation.locator('[data-attestation="needs_downloads"]')).toHaveCount(0);
        for (const box of await attestation.getByRole('checkbox').all()) {
          await box.check();
        }
        await attestation.getByRole('button', { name: 'Attest the export' }).click();
        await expect(reviewer.locator('[data-notice="attested"]')).toBeVisible();
        await expect(reviewer.locator('[data-attestation="attested"]')).toBeVisible();
        assertNoPhi('url', reviewer.url(), { known: KNOWN });
      } finally {
        await context.close();
      }
      await approver.goto(`${casePath}/packet`);
      await expect(approver.locator('[data-attestation="attested"]')).toBeVisible();
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

    await test.step('the payer’s letter is recorded as a partial acceptance; recording moves no money, and the next reconcile approves it (J10, LED-01)', async () => {
      await withWorker(async () => {
        await approver.goto(`/p/${practiceId}/contracts`);
        await approver.getByLabel('Kind of document').selectOption('payer_letter');
        const letter = Buffer.from(syntheticPdf([['SYNTHETIC PAYER LETTER - INVENTED TEXT', 'On reconsideration the payer accepts 60.00 of the amount disputed.']]));
        await approver.getByLabel('Choose files to upload').setInputFiles([{ name: 'letter.pdf', mimeType: 'application/pdf', buffer: letter }]);
        await expect(approver.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'letter.pdf' })).toContainText('Stored', { timeout: 90_000 });
      });
      await approver.goto(`${casePath}/submissions`);
      const form = approver.getByRole('region', { name: 'Log a payer response' });
      await form.getByLabel('Response', { exact: true }).selectOption('partial');
      await form.getByLabel('Amount accepted (accepted or partial only, dollars)').fill('60.00');
      await form.getByRole('button', { name: 'Record the response' }).click();
      await expect(approver.locator('[data-notice="recorded"]')).toBeVisible();
      await expect(approver.getByRole('region', { name: 'Submission log' }).locator('[data-response="partial"]')).toContainText('$60.00 accepted');
      await expect(approver.getByRole('region', { name: 'Submission log' }).locator('[data-response="partial"]')).toContainText('(with its document)');
      // Recording the response writes no ledger entry (LED-01): nothing is approved until the reconcile.
      await approver.goto(`/p/${practiceId}/reconciliation`);
      await expect(approver.locator('[data-figure="approved"]')).toContainText('$0.00');
      await withWorker(async () => {
        await queue('reconcile', { practice_id: practiceId, day: new Date().toISOString().slice(0, 10) });
        await expect(async () => {
          await approver.goto(`/p/${practiceId}/reconciliation`);
          await expect(approver.locator('[data-figure="approved"]')).toContainText('$60.00', { timeout: 1_000 });
        }).toPass({ timeout: 90_000 });
      });
      await expect(approver.locator('[data-figure="recovered"]')).toContainText('$0.00');
      await approver.goto(`/p/${practiceId}`);
      await expect(approver.locator('[data-figure="payer-approved"]')).toContainText('$60.00');
      await expect(approver.locator('[data-figure="recovered-total"]')).toContainText('$0.00');
      assertNoPhi('url', approver.url(), { known: KNOWN });
    });
  } finally {
    await approverContext.close();
  }
});

test('an unverified deadline blocks the export with its reason; once the window’s evidence is signed off, the lines priced under it export (CO-05, D17)', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const practiceId = await deadlinePractice();
  await signInWithTotp(page, 'packet-deadline-drafter');

  const first = await test.step('March loads; its schedule’s window is cited on no page, so its lines wait; the case the previous image opened for them stands', () =>
    withWorker(async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: REMITTANCE }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      return uncitedWindowCase(practiceId);
    }),
  );
  const casePath = `/p/${practiceId}/cases/${first.caseId}`;

  await test.step('one set of fields for every button: the interest line chosen is the version’s, whichever button writes it (item #61)', async () => {
    await page.goto(`${casePath}/packet`);
    const promptPay = page.getByLabel('Prompt-pay state (interest, its own line)');
    const state = (await promptPay.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).find((value) => value !== '') ?? '';
    expect(state).toMatch(/^[A-Z]{2}$/);
    await promptPay.selectOption(state);
    await page.getByRole('button', { name: 'Write the first version' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    const interest = page.getByRole('region', { name: 'Interest' });
    await expect(interest).toContainText(`${state} prompt-pay rule`);
    // The code-built draft's button, with no state chosen now, writes a version without the interest line.
    await page.getByLabel('Prompt-pay state (interest, its own line)').selectOption('');
    await page.getByRole('button', { name: 'Write a new version from the code-built draft' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 2');
    await expect(interest).toContainText('No prompt-pay state named');
    // Chosen again in the same field, the same button writes it with the interest line: the field every button sends.
    await page.getByLabel('Prompt-pay state (interest, its own line)').selectOption(state);
    await page.getByRole('button', { name: 'Write a new version from the code-built draft' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version' })).toContainText('Version 3');
    await expect(interest).toContainText(`${state} prompt-pay rule`);
    await expect(page.getByLabel('Prompt-pay state (interest, its own line)')).toHaveValue(state);
  });

  await test.step('the packet states each line’s deadline as not verified, and why, in words a billing manager can act on', async () => {
    await page.goto(`${casePath}/packet`);
    const deadline = page.getByRole('region', { name: 'Deadline' });
    await expect(deadline.locator('[data-deadline-summary="unverified"]')).toBeVisible();
    await expect(deadline).toContainText('Deadline not verified');
    await expect(deadline.locator('[data-cause="CONTRACT_WINDOW_UNCITED"]')).toContainText('Ask the contract specialist to cite and verify the window');
    await expect(page.getByRole('table', { name: 'Line schedule' }).locator('[data-deadline="unverified"]')).toHaveCount(3);
    await expect(page.getByRole('table', { name: 'Line schedule' }).locator('[data-deadline-cause="CONTRACT_WINDOW_UNCITED"]')).toHaveCount(3);
    // Before approval the builder already says what the export waits for, each with its fix.
    const exported = page.getByRole('region', { name: 'Export', exact: true });
    await expect(exported.locator('[data-export="not_yet"][data-reason="not_approved"]')).toBeVisible();
    await expect(exported.locator('[data-refusal="deadline_unverified"]')).toContainText('this version’s deadline is not verified');
    await expectAccessible(page, 'Packet builder, its deadline not verified');
  });

  // A context of its own, so the accessibility check runs on the approver's page too.
  const approverContext = await browser.newContext();
  const approver = await approverContext.newPage();
  try {
    await signInWithTotp(approver, 'packet-deadline-approver');
    await test.step('a second billing manager approves it, and the export is blocked with the reason; nothing is printed', async () => {
      await approver.goto(`${casePath}/packet`);
      await approver.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Approve this version' }).click();
      await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
      const exported = approver.getByRole('region', { name: 'Export', exact: true });
      await expect(exported.locator('[data-export="blocked"][data-reason="deadline_unverified"]')).toBeVisible();
      await expect(exported).toContainText('this version’s deadline is not verified');
      await expect(exported.locator('[data-blocked-cause="CONTRACT_WINDOW_UNCITED"]')).toContainText('Ask the contract specialist to cite and verify the window on an amended or corrected version');
      await expect(exported.getByRole('button', { name: 'Export PDF and CSV' })).toHaveCount(0);
      await expectAccessible(approver, 'Packet builder, its export blocked');
      const { rows } = await withDatabase((client) => client.query<{ exported: number }>('SELECT count(*)::int AS exported FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE p.case_id = $1 AND v.exported_at IS NOT NULL', [first.caseId]));
      expect(rows[0]?.exported).toBe(0);
    });

    await test.step('the window is cited and verified on an amendment a billing manager signs off; May’s lines priced under it open a case whose deadline is verified, and it exports', async () => {
      const mayCaseId = await withWorker(async () => {
        await page.goto(`/p/${practiceId}/uploads`);
        await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'may.835', mimeType: 'application/octet-stream', buffer: MAY_REMITTANCE }]);
        await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'may.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
        return citedAmendmentCase(practiceId, first.versionId, [first.caseId]);
      });
      const mayPath = `/p/${practiceId}/cases/${mayCaseId}`;
      await page.goto(`${mayPath}/packet`);
      await page.getByRole('button', { name: 'Write the first version' }).click();
      await expect(page.locator('[data-notice="written"]')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Deadline' }).locator('[data-deadline-summary="verified"]')).toBeVisible();
      await expect(page.getByRole('table', { name: 'Line schedule' }).locator('[data-deadline="verified"]')).toHaveCount(3);
      await withWorker(async () => {
        await approver.goto(`${mayPath}/packet`);
        await approver.getByRole('region', { name: 'Approval' }).getByRole('button', { name: 'Approve this version' }).click();
        await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
        await approver.getByRole('button', { name: 'Export PDF and CSV' }).click();
        await expect(approver.locator('[data-notice="export_requested"]')).toBeVisible();
        await expect(async () => {
          await approver.goto(`${mayPath}/packet`);
          await expect(approver.locator('[data-export="done"]')).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 90_000 });
      });
      // March's case is still not exported: its lines were priced under the version that cites no window.
      await approver.goto(`${casePath}/packet`);
      await expect(approver.locator('[data-export="blocked"]')).toBeVisible();
      assertNoPhi('url', approver.url(), { known: KNOWN });
    });
  } finally {
    await approverContext.close();
  }
});

/** The packet's current version, from the builder's version table. */
async function currentVersionId(page: Page): Promise<string> {
  const href = (await page.getByRole('table', { name: 'Versions' }).getByRole('link', { name: 'Version 3' }).getAttribute('href')) ?? '';
  return new URL(href, 'http://localhost').searchParams.get('version') ?? '';
}
