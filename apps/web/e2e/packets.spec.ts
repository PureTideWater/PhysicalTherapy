import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { syntheticPdf } from '@tp/contracts/testing';
import { assertNoPhi } from '@tp/observability';
import { PACKET_REFERENCE_PATTERN, SYNTHETIC_CORRESPONDENCE_CONTACT, correspondenceText } from '@tp/packets';
import { holdsLoosely, printedPdfText } from '@tp/worker/testing/payer-copy';

import { atPhoneWidth, expectAccessible } from './a11y';
import { attemptEvents, reopenLine, shownVersionId, writeOffFirstLine } from './export-attempts';
import { registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';
import { JOURNEY_PRACTICE_ADMIN, queue } from './journeys';
import { PACKET_PRACTICE, citedAmendmentCase, deadlinePractice, openPacketCase, packetPractice, uncitedWindowCase } from './packets';
import { personaEmail } from '../scripts/synthetic-personas';
import { holdExports, startLocalWorker } from './worker';

/**
 * The packet builder and the submission log in the browser (PRD 5, J9; PRD 7, Packet builder and
 * Submissions and responses; PRD 12; test matrix CAS-08, CAS-09, CAS-12; the milestone 8 done check): in
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
 * and on Cases the reference typed in lower case finds the packet (E5). The payer's answer (PRD 5, J10: "logs the payer's response"; LED-01) follows: a SYNTHETIC
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
    await expect(deadline.getByRole('list', { name: 'Deadline evidence' })).toContainText('Disputes are raised within 3650 days of the payment date.');
    await expect(page.getByRole('table', { name: 'Line schedule' }).locator('[data-deadline="verified"]')).toHaveCount(3);
    await expect(page.getByRole('table', { name: 'Calculations' }).locator('[data-calculation-row]')).toHaveCount(3);
    // Identifiers are placeholders on screen; the export inserts them.
    await expectNoIdentifiers(page);
    // One form writes a version: its fields once, each with an ID of its own (item #61).
    await expect(page.getByRole('form', { name: 'Write a version' })).toHaveCount(1);
    await expect(page.locator('#prompt-pay-state')).toHaveCount(1);
    await expect(page.locator('#narrative')).toHaveCount(1);
    await expectAccessible(page, 'Packet builder, its first version');
    // At a phone's width the page does not scroll sideways, and each wide table scrolls in a region a keyboard reaches (item #61).
    await atPhoneWidth(page, 'Packet builder, its first version');
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
      reference = (await approver.getByRole('region', { name: 'Version' }).locator('[data-reference]').getAttribute('data-reference')) ?? '';
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
      expect(holdsLoosely(printed, shownVersion)).toBe(false);
      expect(holdsLoosely(printed, pdfSha256.slice(0, 16))).toBe(false);
      const csvSha256 = (await approver.getByLabel('CSV SHA-256', { exact: true }).getAttribute('data-sha256')) ?? '';
      const csv = await approver.request.get(`${casePath}/packet/${shownVersion}/csv`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()['content-disposition']).toBe(`attachment; filename="payment-dispute-${reference}-schedule.csv"`);
      expect(createHash('sha256').update(await csv.body()).digest('hex')).toBe(csvSha256);
      expect(await csv.text()).toContain('SYNCCNCAS080001');
      expect((await csv.text()).split('\r\n')[0]).not.toMatch(/trace|sha256|patient_control_number/);
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
        // E4: what the payer's copy no longer prints is here, and what it carries beside it.
        const record = reviewer.getByRole('region', { name: 'Internal record' });
        await expect(record.locator('[data-internal="written_by"]')).toHaveText(personaEmail('packet-drafter'));
        await expect(record.locator('[data-internal="approved_by"]')).toContainText(personaEmail('packet-approver'));
        await expect(record.getByLabel('Version SHA-256')).toHaveAttribute('data-sha256', /^[0-9a-f]{64}$/);
        await expect(record.getByRole('list', { name: 'Evidence list' })).toBeVisible();
        await expect(reviewer.getByRole('region', { name: 'Payer’s copy' }).locator('[data-reference]')).toHaveAttribute('data-reference', reference);
        await expect(reviewer.getByRole('region', { name: 'Payer’s copy' }).locator('[data-contact="set"]')).toContainText(correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT));
        await expectAccessible(reviewer, 'Packet review, internal record and payer’s copy');
        await atPhoneWidth(reviewer, 'Packet review');
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

    await test.step('on Cases, the reference a payer quotes, typed in lower case without its hyphen, finds the packet and opens it (E5; CAS-28)', async () => {
      await page.goto(`/p/${practiceId}/cases`);
      await page.getByLabel('Find a packet by its reference').fill(reference.toLowerCase().replace('-', ''));
      await page.getByRole('button', { name: 'Find', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/p/${practiceId}/cases/by-reference\\?reference=`));
      const matches = page.getByRole('list', { name: 'Matching packet versions' });
      await expect(matches.getByRole('listitem')).toHaveCount(1);
      await expect(page.getByRole('region', { name: 'Packets with this reference' })).toContainText(reference);
      await expectAccessible(page, 'Packet by reference');
      await matches.getByRole('link', { name: /^Open the packet, version \d+$/ }).click();
      await expect(page).toHaveURL(new RegExp(`${casePath}/packet\\?version=[0-9a-f-]{36}$`));
      await expect(page.getByRole('region', { name: 'Version' }).locator('[data-reference]')).toHaveAttribute('data-reference', reference);
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
