import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Locator, type Page, type Request, expect, test } from '@playwright/test';
import { syntheticPdf } from '@tp/contracts/testing';
import { assertNoPhi } from '@tp/observability';
import { PACKET_REFERENCE_PATTERN, SYNTHETIC_CORRESPONDENCE_CONTACT, correspondenceText } from '@tp/packets';
import { QUALIFIED_IDENTIFIER, holdsLoosely, printedPdfText } from '@tp/worker/testing/payer-copy';

import { atPhoneWidth, expectAccessible } from './a11y';
import { attemptEvents, reopenLine, shownVersionId, writeOffFirstLine } from './export-attempts';
import { registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';
import { JOURNEY_PRACTICE_ADMIN, queue } from './journeys';
import { PACKET_PRACTICE, citedAmendmentCase, deadlinePractice, openPacketCase, packetPractice, uncitedWindowCase } from './packets';
import { personaEmail } from '../scripts/synthetic-personas';
import { holdExports, startLocalWorker } from './worker';

/**
 * The packet builder and the submission log in the browser (PRD 5, J9; PRD 7, Packet builder and
 * Submissions and responses; PRD 12; test matrix CAS-08, CAS-09, CAS-12, FRM-01; the milestone 8 done check): in
 * a practice of its own, a billing manager uploads the SYNTHETIC CAS-08 remittance, whose case the
 * worker prices and triages (the payer's schedule abstracted and signed off beside the browser,
 * e2e/packets.ts). The drafter writes the first version from the code-built draft, adds a sentence with
 * a figure that is in no input record, sees the live check flag it and, once saved, approval blocked;
 * writes a passing version again and finds the Approve button disabled as its drafter, with the reason, next
 * to Request approval (the best-option audit's item #61); a second billing manager approves it and asks for
 * the export while the practice's exports are held, and the builder shows it in progress; a line written off before the worker
 * takes the job is refused at once with its fix, and the job's own refusal is shown with its reason and fix
 * and recorded as a coded event (item #26); the line reopened, the export is asked again, the builder's status
 * follows the worker by itself, and the worker prints the PDF and CSV with the identifiers inserted, each line's
 * deadline verified from the contract's cited window (CO-05, D17); the reimbursement
 * reviewer, under a support grant, finds the attest button disabled until they have downloaded both of the
 * export's files from the review, then attests over their SHA-256 (D16; the owner's addition of 2026-10-18); and the
 * submission logged carries the export's SHA-256. Identifiers stay placeholders on screen. The export is the payer's
 * copy (audit item #37 part 1; the founder's rulings of 2026-10-20): with no correspondence contact the approver's
 * Export button is disabled, saying where it is set (E1); the practice administrator sets it on Settings,
 * Correspondence (E2); the PDF downloads named by the packet's reference and prints the approval line with it and the
 * contact, and no login or SHA-256 (E3); the reviewer's page shows the internal record and the seven-item checklist (E4);
 * and on Cases the reference typed in lower case finds the packet (E5). The submission's channel, the payer's answer
 * and the payer's letter start unchosen (CAS-46). The payer's answer (PRD 5, J10: "logs the payer's response"; LED-01)
 * follows: with no letter on file the response form shows anyway; the answer chosen and a note typed, a SYNTHETIC
 * payer letter is uploaded inside "Log a payer response", scanned while what was typed stays, and chosen by the form
 * once stored (CAS-47); no request carries the file's name, and no upload request the form's request key; a partial
 * acceptance with no amount is refused, keeping the response and the letter chosen and naming the amount (FRM-01);
 * recorded as a partial acceptance of 60.00, the log links its letter's receipt, and the letter leaves the contract
 * documents to tag (CAS-48); it moves no money by itself; the next reconcile (queued as the daily schedule queues it)
 * approves it in the recovery ledger, and the dashboard shows it as payer approved, never as recovered. The adjusted
 * remittance, posting, deposit, recovered and recoupment steps of J10 are e2e/reconciliation.spec.ts. At a phone's
 * width (FRM-08), Cases and Coverage's letter form show a choice their select cuts short whole under it, and neither
 * they nor the refused response form scroll sideways. Synthetic data only.
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
    await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 1');
    await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
    // Each line's deadline, verified from the contract's own window cited on its page (CO-05, D17), shown with its label.
    const deadline = page.getByRole('region', { name: 'Deadline' });
    await expect(deadline.locator('[data-deadline-summary="verified"]')).toBeVisible();
    await expect(deadline).toContainText('Deadline verified');
    await expect(deadline.getByRole('list', { name: 'Deadline evidence' })).toContainText('Disputes are raised within 3650 days of the payment date.');
    await expect(page.getByRole('table', { name: 'Line schedule' }).locator('[data-deadline="verified"]')).toHaveCount(3);
    // Each line's calculation in the payer's words (combined audit #38): one block per row, each with its summary sentence.
    const calculations = page.getByRole('region', { name: 'Calculations' }).locator('[data-calculation-row]');
    await expect(calculations).toHaveCount(3);
    for (const block of await calculations.all()) {
      await expect(block).toContainText('rounded once');
    }
    // Identifiers are placeholders on screen; the export inserts them.
    await expectNoIdentifiers(page);
    // One form writes a version: its fields once, each with an ID of its own (item #61).
    await expect(page.getByRole('form', { name: 'Write a version' })).toHaveCount(1);
    await expect(page.locator('#prompt-pay-state')).toHaveCount(1);
    await expect(page.locator('#narrative')).toHaveCount(1);
    await expectAccessible(page, 'Packet builder, its first version');
    // At a phone's width the page does not scroll sideways, and each wide table scrolls in a region a keyboard reaches (item #61).
    await atPhoneWidth(page, 'Packet builder, its first version', { tables: ['Line schedule', 'Versions'] });
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
    await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 2');
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
    await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 3');
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
    // Asked: the form is gone, and the disabled button's reason says the request stands rather than pointing to it.
    await expect(approval.getByRole('button', { name: 'Request approval' })).toHaveCount(0);
    await expect(approval.getByRole('button', { name: 'Approve this version' })).toHaveAccessibleDescription('Approval is requested; a second person who approves packets approves it here.');
    await expect(page.getByRole('table', { name: 'Versions' }).locator('[data-version="3"]')).toContainText('Passed');
    await expect(page.getByRole('table', { name: 'Versions' }).locator('[data-version="2"]')).toContainText('Failed');
  });

  // A context of its own, so the accessibility check runs on the approver's page too.
  const approverContext = await browser.newContext();
  const approver = await approverContext.newPage();
  // Another spec's worker may be running, and every worker takes any practice's export: the practice's exports are held
  // until the line is written off, so the job finds the case changed whichever worker takes it.
  const held = await holdExports(practiceId);
  try {
    await signInWithTotp(approver, 'packet-approver');
    await test.step('a second billing manager approves it; with no correspondence contact the Export button is disabled, saying where it is set (audit item #37 part 1, E1)', async () => {
      await approver.goto(`${casePath}/packet`);
      const approval = approver.getByRole('region', { name: 'Approval' });
      await expect(approval.locator('[data-approval="ready"]')).toBeVisible();
      await approval.getByRole('button', { name: 'Approve this version' }).click();
      await expect(approver.locator('[data-notice="approved"]')).toBeVisible();
      await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
      const exportCard = approver.getByRole('region', { name: 'Export', exact: true });
      await expect(exportCard.locator('[data-export][data-reason="contact_missing"] [data-refusal="contact_missing"]')).toContainText('Settings, Correspondence');
      const button = exportCard.getByRole('button', { name: 'Export PDF and CSV' });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(/Settings, Correspondence/);
      await expect(exportCard.locator('[data-payer-copy="missing"]')).toBeVisible();
      await expectAccessible(approver, 'Packet builder, no correspondence contact');
    });

    await test.step('the practice administrator sets the correspondence contact on Settings, Correspondence (E2)', async () => {
      const adminContext = await browser.newContext();
      const admin = await adminContext.newPage();
      try {
        await signInWithTotp(admin, JOURNEY_PRACTICE_ADMIN);
        await admin.goto(`/p/${practiceId}/settings`);
        await expect(admin.locator('[data-step="correspondence"]')).toHaveAttribute('data-done', 'no');
        await admin.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: /^Correspondence/ }).click();
        await expect(admin).toHaveURL(new RegExp(`/p/${practiceId}/settings/correspondence$`));
        await expect(admin.locator('[data-contact="missing"]')).toBeVisible();
        await expectAccessible(admin, 'Settings, Correspondence');
        const form = admin.getByRole('region', { name: 'Correspondence contact' });
        const { address } = SYNTHETIC_CORRESPONDENCE_CONTACT;
        await form.getByLabel('Name or office').fill(SYNTHETIC_CORRESPONDENCE_CONTACT.name);
        await form.getByLabel('Phone', { exact: true }).fill('(919) 555-0100');
        await form.getByLabel('Extension (optional)').fill(SYNTHETIC_CORRESPONDENCE_CONTACT.phone_extension ?? '');
        await form.getByLabel('Email (optional)').fill(SYNTHETIC_CORRESPONDENCE_CONTACT.email ?? '');
        await form.getByLabel('Street').fill(address?.line1 ?? '');
        await form.getByLabel('Suite or floor (optional)').fill(address?.line2 ?? '');
        await form.getByLabel('City').fill(address?.city ?? '');
        await form.getByLabel('State').selectOption(address?.state ?? '');
        await form.getByLabel('ZIP').fill(address?.zip ?? '');
        await form.getByRole('button', { name: 'Save the contact' }).click();
        await expect(admin.locator('[data-notice="saved"]')).toBeVisible();
        await expect(admin.locator('[data-preview]')).toHaveText(`Correspondence about this dispute: ${correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)}.`);
        await expectAccessible(admin, 'Settings, Correspondence, saved');
        await atPhoneWidth(admin, 'Settings, Correspondence, saved');
        assertNoPhi('url', admin.url(), { known: KNOWN });
      } finally {
        await adminContext.close();
      }
    });

    await test.step('the approver asks for the export while it is held: the builder shows it in progress (CAS-11; item #26)', async () => {
      await approver.goto(`${casePath}/packet`);
      await expect(approver.getByRole('region', { name: 'Export', exact: true }).locator('[data-contact="set"]')).toContainText(correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT));
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
      await held.release();
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
      // The refusal's reason no longer holds: it is told as the earlier request's, beside the Export button, with no fix to follow.
      const earlier = approver.locator('[data-export-attempt="refused"][data-code="case_changed"]');
      await expect(earlier).toContainText('An earlier request was refused');
      await expect(earlier).toContainText('That no longer holds, so this version can be exported: export it again.');
      await expect(earlier).not.toContainText('Write a new version');
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

    let reference = '';
    await test.step('the PDF downloads with that SHA-256, named by the packet’s reference, the payer’s copy with the identifiers the screen never showed, and the CSV with its own (E3)', async () => {
      const shownVersion = await currentVersionId(approver);
      reference = (await approver.getByRole('region', { name: 'Version', exact: true }).locator('[data-reference]').getAttribute('data-reference')) ?? '';
      expect(reference).toMatch(PACKET_REFERENCE_PATTERN);
      const response = await approver.request.get(`${casePath}/packet/${shownVersion}/pdf`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect(response.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      expect(response.headers()['content-disposition']).toBe(`attachment; filename="payment-dispute-${reference}.pdf"`);
      expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(pdfSha256);
      // The payer's copy: the approval line with the reference and the contact; no sign-in email, SHA-256 or record ID.
      const { text, metadata } = await printedPdfText(new Uint8Array(await response.body()));
      const printed = `${text}\n${Object.values(metadata).join('\n')}`;
      expect(holdsLoosely(text, `Approved for submission by ${PACKET_PRACTICE} on`)).toBe(true);
      expect(holdsLoosely(text, `reference ${reference}.`)).toBe(true);
      expect(holdsLoosely(text, `Correspondence about this dispute: ${correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)}.`)).toBe(true);
      for (const login of [personaEmail('packet-drafter'), personaEmail('packet-approver'), personaEmail('packet-reviewer')]) {
        expect(holdsLoosely(printed, login)).toBe(false);
      }
      expect(printed).not.toContain('SHA-256');
      // The payer by its ID in words and the plan by its identifier, never in their remittance-key form (2U:, CE:), which
      // the internal record keeps (the verification of 2026-10-21).
      expect(holdsLoosely(text, 'To: SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE')).toBe(true);
      expect(printed.match(QUALIFIED_IDENTIFIER)).toBeNull();
      for (const key of ['2U:SYNPAYERQ', 'CE:SYNPLAN-FIX-ONE']) {
        expect(holdsLoosely(printed, key)).toBe(false);
      }
      expect(holdsLoosely(printed, shownVersion)).toBe(false);
      expect(holdsLoosely(printed, pdfSha256.slice(0, 16))).toBe(false);
      const csvSha256 = (await approver.getByLabel('CSV SHA-256', { exact: true }).getAttribute('data-sha256')) ?? '';
      const csv = await approver.request.get(`${casePath}/packet/${shownVersion}/csv`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()['content-disposition']).toBe(`attachment; filename="payment-dispute-${reference}-schedule.csv"`);
      expect(createHash('sha256').update(await csv.body()).digest('hex')).toBe(csvSha256);
      expect(await csv.text()).toContain('SYNCCNCAS080001');
      expect((await csv.text()).match(QUALIFIED_IDENTIFIER)).toBeNull();
      const [header, ...schedule] = (await csv.text()).split('\r\n').filter((row) => row !== '');
      expect(header).not.toMatch(/trace|sha256|patient_control_number/);
      // Every row of the schedule leads with the reference the PDF prints (the founder's ruling of 2026-10-21).
      expect(header?.split(',')[0]).toBe('packet_reference');
      expect(schedule.length).toBeGreaterThan(0);
      for (const row of schedule) {
        expect(row.startsWith(`${reference},`)).toBe(true);
      }
      // The submission waits for the reviewer's attestation.
      await expect(approver.locator('[data-attestation="waiting"]')).toBeVisible();
    });

    await test.step('the reimbursement reviewer, under a support grant, downloads both of the export’s files and then attests over their SHA-256 (D16; the owner’s addition of 2026-10-18)', async () => {
      const context = await browser.newContext({ acceptDownloads: true });
      const reviewer = await context.newPage();
      try {
        await registerKeyAndSignIn(reviewer, 'packet-reviewer');
        await reviewer.goto(`/p/${practiceId}/packet-reviews`);
        await atPhoneWidth(reviewer, 'Packet reviews, an export waiting', { tables: ['Exports waiting'] });
        await reviewer.getByRole('table', { name: 'Exports waiting' }).getByRole('link').first().click();
        await expect(reviewer).toHaveURL(new RegExp(`${casePath}/packet/[0-9a-f-]{36}/review$`));
        await expect(reviewer.getByRole('region', { name: 'Deadline' }).locator('[data-deadline-summary="verified"]')).toBeVisible();
        // E4: what the payer's copy no longer prints is here, and what it carries beside it.
        const record = reviewer.getByRole('region', { name: 'Internal record' });
        await expect(record.locator('[data-internal="written_by"]')).toHaveText(personaEmail('packet-drafter'));
        await expect(record.locator('[data-internal="approved_by"]')).toContainText(personaEmail('packet-approver'));
        await expect(record.getByLabel('Version SHA-256')).toHaveAttribute('data-sha256', /^[0-9a-f]{64}$/);
        await expect(record.getByRole('list', { name: 'Evidence list' })).toBeVisible();
        // The calculation in the words the PDF prints (combined audit #38), each trace's SHA-256 in the internal record, and no line-trace link the reviewer's role cannot open.
        await expect(reviewer.getByRole('region', { name: 'Line table' }).getByRole('heading', { level: 3, name: 'Calculation per line' })).toBeVisible();
        const reviewed = reviewer.getByRole('region', { name: 'Calculations' }).locator('[data-calculation-row]');
        await expect(reviewed).toHaveCount(3);
        for (const block of await reviewed.all()) {
          await expect(block).toContainText('rounded once');
        }
        await expect(record.getByRole('list', { name: 'Trace SHA-256 of each row' }).getByRole('listitem')).toHaveCount(3);
        await expect(reviewer.getByRole('table', { name: 'Line schedule' }).getByRole('link', { name: 'Line trace' })).toHaveCount(0);
        await expect(reviewer.getByRole('region', { name: 'Payer’s copy' }).locator('[data-reference]')).toHaveAttribute('data-reference', reference);
        await expect(reviewer.getByRole('region', { name: 'Payer’s copy' }).locator('[data-contact="set"]')).toContainText(correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT));
        await expectAccessible(reviewer, 'Packet review, internal record and payer’s copy');
        await atPhoneWidth(reviewer, 'Packet review', { tables: ['Line schedule'] });
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
        // The founder's seven items (Q5 (a)), the payer's copy among them.
        await expect(attestation.getByRole('checkbox')).toHaveCount(7);
        await expect(attestation).toContainText('The PDF and the CSV are fit to send to the payer');
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

    await test.step('the submission is logged with the channel the manager chose, and the log carries the export’s SHA-256 (CAS-12, CAS-46)', async () => {
      await approver.getByRole('link', { name: 'Log its submission' }).click();
      await expect(approver).toHaveURL(new RegExp(`${casePath}/submissions$`));
      await expect(approver.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(approver.getByLabel('Export SHA-256')).toHaveAttribute('data-sha256', pdfSha256);
      await approver.getByLabel('Payer’s reference (a portal confirmation, a fax receipt)').fill('SYNTHETIC-PORTAL-REF-E2E');
      // The channel is recorded for good, so it starts unchosen: no press logs a channel nobody chose.
      const channel = approver.getByRole('region', { name: 'Log a submission' }).getByLabel('Channel', { exact: true });
      await expect(channel).toHaveValue('');
      await expect(channel.locator('option:checked')).toHaveText('Choose the channel');
      await channel.selectOption('payer_portal');
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

    await test.step('on Cases, the reference a payer quotes, typed in lower case without its hyphen, finds the packet and opens it (E5; CAS-28)', async () => {
      await page.goto(`/p/${practiceId}/cases`);
      await page.getByLabel('Find a packet by its reference').fill(reference.toLowerCase().replace('-', ''));
      await page.getByRole('button', { name: 'Find', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/cases/by-reference\\?reference=`));
      const matches = page.getByRole('list', { name: 'Matching packet versions' });
      await expect(matches.getByRole('listitem')).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'Packets with this reference' })).toContainText(reference);
      await expectAccessible(page, 'Packet by reference');
      await atPhoneWidth(page, 'Packet by reference');
      await matches.getByRole('link', { name: /^Open the packet, version \d+$/ }).click();
      await expect(page).toHaveURL(new RegExp(`${casePath}/packet\\?version=[0-9a-f-]{36}$`));
      await expect(page.getByRole('region', { name: 'Version', exact: true }).locator('[data-reference]')).toHaveAttribute('data-reference', reference);
    });

    await test.step('at 390 px a select that cuts its choice short shows it whole under it and follows a new choice, and neither Cases nor Coverage’s letter form scrolls sideways (FRM-08)', async () => {
      await page.goto(`/p/${practiceId}/cases`);
      const triage = page.getByRole('region', { name: 'Triage a run' });
      const shown = triage.locator('[data-slot="chosen-text"]');
      // At a desktop's width the run's name fits its select, so no line repeats it.
      await expect(shown).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        const run = (await triage.getByLabel('Pricing run', { exact: true }).locator('option:checked').textContent()) ?? '';
        // The release is what tells two runs of one period apart, and 16 px cuts it off the select.
        expect(run).toMatch(/ \(release \d+\)$/);
        await expect(shown).toHaveText(run);
        // Back at a desktop's width, now that the page is live (the line proves it), the line goes: the count of 0 above
        // could have been read before the page hydrated.
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect(shown).toHaveCount(0);
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(shown).toHaveText(run);
        await atPhoneWidth(page, 'Cases');
        await page.goto(`/p/${practiceId}/coverage`);
        const letter = page.getByRole('form', { name: 'Letter' });
        const contract = letter.getByLabel('The payer’s contract (optional)', { exact: true });
        const chosen = letter.locator('[data-slot="chosen-text"]');
        await expect(chosen).toHaveCount(0);
        await contract.selectOption({ label: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
        await expect(chosen).toHaveText('SYNTHETIC FIXED SCHEDULE AGREEMENT');
        await contract.selectOption({ label: 'None named' });
        await expect(chosen).toHaveCount(0);
        await atPhoneWidth(page, 'Coverage, its letter form');
      } finally {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });

    await test.step('the payer’s letter is uploaded inside “Log a payer response” and chosen once stored, while what was typed stays (CAS-46, CAS-47); a partial acceptance with no amount is refused and keeps its response and letter (FRM-01); recorded, the log links the letter’s receipt and the letter leaves the contract documents (CAS-48); recording moves no money, and the next reconcile approves it (J10, LED-01)', async () => {
      // Everything the page sends while the letter is uploaded and the response recorded: no request carries the file's
      // name, and no upload request carries the form's request key, which would turn the response's save into a replay.
      const sent: { readonly url: string; readonly body: string }[] = [];
      const collect = (request: Request) => {
        sent.push({ url: request.url(), body: request.postData() ?? '' });
      };
      approver.on('request', collect);
      const formKeys = new Set<string>();
      const SENTINEL = 'SYNTHETIC-NAME-SENTINEL';
      try {
        await approver.goto(`${casePath}/submissions`);
        const form = approver.getByRole('region', { name: 'Log a payer response' });
        const letter = form.getByLabel('Payer’s letter', { exact: true });
        const status = form.locator('#response-letter-status');
        const response = form.getByLabel('Response', { exact: true });
        const receivedOn = form.getByLabel('Received on', { exact: true });
        const amount = form.getByLabel('Additional amount the payer will pay (accepted or partial only, dollars)');
        const notes = form.getByLabel('Notes (kept encrypted)');
        const formKey = async () => formKeys.add(await form.locator('input[name="requestKey"]').inputValue());
        // No letter is on file, and the form shows anyway: the letter starts unchosen, with nothing else to choose, and its
        // hint says to upload it here; the payer's answer starts unchosen too, its words saying what a response records.
        await expect(letter).toHaveValue('');
        await expect(letter.locator('option')).toHaveText(['Choose the payer’s letter']);
        await expect(letter).toHaveAccessibleDescription(/^Upload the payer’s letter here; it is chosen once it is scanned clean\./);
        await expect(status).toHaveText('');
        await expect(response).toHaveValue('');
        await expect(response.locator('option:checked')).toHaveText('Choose the payer’s answer');
        await expect(response).toHaveAccessibleDescription(/Every response is recorded for good\..*Nothing is recovered until it is posted or deposited\./);
        // The letter's part sits under the uploader's level-3 heading, below the card's level 2, and the rest of the form
        // under its own, which Response follows.
        await expect(form.getByRole('heading', { level: 2 })).toHaveText(['Log a payer response']);
        await expect(form.getByRole('heading', { level: 3 })).toHaveText(['Upload the payer’s letter', 'What the letter says']);
        expect(
          await response.evaluate((select) => {
            const heading = [...document.querySelectorAll('h3')].find((element) => element.textContent === 'What the letter says');
            return heading !== undefined && (heading.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
          }),
        ).toBe(true);
        // What the letter says is typed first; the letter, uploaded after, is scanned while it stays.
        await response.selectOption('partial');
        await notes.fill('SYNTHETIC: the payer accepts part');
        const received = await receivedOn.inputValue();
        await formKey();
        const pdf = Buffer.from(syntheticPdf([['SYNTHETIC PAYER LETTER - INVENTED TEXT', 'On reconsideration the payer accepts 60.00 of the amount disputed.']]));
        await withWorker(async () => {
          await form.getByLabel('Choose a file to upload').setInputFiles([{ name: `${SENTINEL}-letter.pdf`, mimeType: 'application/pdf', buffer: pdf }]);
          await expect(form.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: `${SENTINEL}-letter.pdf` })).toContainText('Stored', { timeout: 90_000 });
          await expect(status).toHaveAttribute('data-letter-status', 'chosen', { timeout: 30_000 });
        });
        await expect(status).toHaveText('The letter you uploaded is chosen.');
        await expect(response).toHaveValue('partial');
        await expect(notes).toHaveValue('SYNTHETIC: the payer accepts part');
        await expect(receivedOn).toHaveValue(received);
        const letterId = await letter.inputValue();
        expect(letterId).toMatch(/^[0-9a-f-]{36}$/);
        // The letter the form uploaded is listed among the letters no response names yet, and marked.
        await expect(letter.locator(`optgroup[label="Letters no response names yet"] > option[value="${letterId}"]`)).toHaveText(/, SHA-256 [0-9a-f]{12}… \(uploaded here\)$/);
        await formKey();
        await expectAccessible(approver, 'Submissions, the payer’s letter uploaded in the response form');
        await form.getByRole('button', { name: 'Record the response' }).click();
        // Refused, the form keeps the response and the letter chosen: a reset would put back the empty choices, which the
        // browser refuses, so a second press never records a payer response nobody chose (narrow-practice-1-07). The
        // amount is named by its label, marked and focused.
        const summary = form.locator('[data-slot="refusal-summary"]');
        await expect(summary).toContainText('Not done');
        await expect(summary).toContainText('Additional amount the payer will pay: what the payer accepted, in dollars and cents');
        await expect(response).toHaveValue('partial');
        await expect(letter).toHaveValue(letterId);
        await expect(amount).toHaveAttribute('aria-invalid', 'true');
        await expect(amount).toBeFocused();
        await expect(approver.locator('[data-notice="recorded"]')).toHaveCount(0);
        await formKey();
        // At a phone's width the refused column form stays inside the page: the Payer’s letter select, whose choice holds
        // a date and a SHA-256, and the uploader's batch shrink to the form instead of widening it (FRM-08).
        await atPhoneWidth(approver, 'Log a payer response, refused');
        // At a phone's width the line under the Payer’s letter select says its choice whole, and sets the SHA-256's prefix
        // in the face this page sets every SHA-256 in (Plex Mono), not the line's own (FRM-08; the UX re-check's polish).
        const wide = approver.viewportSize();
        await approver.setViewportSize({ width: 390, height: 844 });
        try {
          const chosen = form.locator('[data-slot="chosen-text"]');
          const prefix = chosen.locator('span');
          const choice = (await letter.locator('option:checked').textContent()) ?? '';
          expect(choice).toMatch(/, SHA-256 [0-9a-f]{12}… \(uploaded here\)$/);
          await expect(chosen).toHaveText(choice);
          await expect(prefix).toHaveText(/^[0-9a-f]{12}…$/);
          const face = (element: Locator) => element.evaluate((node) => getComputedStyle(node).fontFamily);
          expect(await face(prefix)).toBe(await face(approver.locator('[data-sha256]').first()));
          expect(await face(prefix)).not.toBe(await face(chosen));
        } finally {
          if (wide !== null) {
            await approver.setViewportSize(wide);
          }
        }
        // Until a response names it, the letter is a payer letter like any other, listed among the documents to tag (the
        // residual docs/adr/0085 records, until Lane A's upload-time link): the control for the check after the record.
        const contracts = await approverContext.newPage();
        try {
          await contracts.goto(`/p/${practiceId}/contracts`);
          await expect(contracts.getByRole('region', { name: 'Documents to tag' }).locator(`[data-document="${letterId}"]`)).toHaveCount(1);
        } finally {
          await contracts.close();
        }
        await amount.fill('60.00');
        await form.getByRole('button', { name: 'Record the response' }).click();
        await expect(approver.locator('[data-notice="recorded"]')).toBeVisible();
        const recorded = approver.getByRole('region', { name: 'Submission log' }).locator('[data-response="partial"]');
        await expect(recorded).toContainText('$60.00 the payer will pay');
        // The log names the response's letter: a link whose words say it opens the letter's receipt, and its SHA-256.
        const receipt = recorded.locator(`[data-response-letter="${letterId}"]`);
        await expect(receipt).toHaveText(/^the receipt of the payer letter uploaded \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
        await expect(recorded).toContainText(/\(with its document: the receipt of the payer letter uploaded .+ UTC, SHA-256 [0-9a-f]{64}\)$/);
        await receipt.click();
        await expect(approver).toHaveURL(new RegExp(`/p/${practiceId}/uploads/${letterId}$`));
        await expect(approver.getByRole('heading', { level: 1 })).toHaveText(`Receipt ${letterId.slice(0, 8)}`);
        // A letter a response names is a case's evidence, not a contract's document: it leaves the documents to tag, and
        // the Contracts panel names its payer letter kind for terms and says where a payer's answer goes (CAS-48).
        await approver.goto(`/p/${practiceId}/contracts`);
        await expect(approver.getByRole('region', { name: 'Documents to tag' })).toBeVisible();
        await expect(approver.getByRole('region', { name: 'Documents to tag' }).locator(`[data-document="${letterId}"]`)).toHaveCount(0);
        const panel = approver.getByRole('region', { name: 'Upload a contract or exhibit' });
        await expect(panel.getByLabel('Kind of document').locator('option[value="payer_letter"]')).toHaveText('Payer’s terms or policy letter');
        await expect(panel).toContainText('A payer’s answer to a dispute goes with its response instead, on the case’s Submissions and responses page.');
      } finally {
        approver.off('request', collect);
      }
      for (const request of sent) {
        expect(request.url, 'no request URL carries the file’s name').not.toContain(SENTINEL);
        expect(request.body, `no request body carries the file’s name (${new URL(request.url).pathname})`).not.toContain(SENTINEL);
      }
      // The server action posted one of the form's keys; every upload request made its own.
      const uploads = sent.filter((request) => /\/uploads\/(request|complete|retry)$/.test(new URL(request.url).pathname));
      expect(uploads.length).toBeGreaterThan(0);
      for (const request of uploads) {
        const key: unknown = (JSON.parse(request.body) as { requestKey?: unknown }).requestKey;
        expect(typeof key).toBe('string');
        expect(formKeys.has(String(key)), 'an upload request carries the response form’s request key').toBe(false);
      }
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
    await held.release();
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
    await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 2');
    await expect(interest).toContainText('No prompt-pay state named');
    // Chosen again in the same field, the same button writes it with the interest line: the field every button sends.
    await page.getByLabel('Prompt-pay state (interest, its own line)').selectOption(state);
    await page.getByRole('button', { name: 'Write a new version from the code-built draft' }).click();
    await expect(page.locator('[data-notice="written"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 3');
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
