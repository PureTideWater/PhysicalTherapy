import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { atPhoneWidth, expectAccessible } from './a11y';
import { registerKeyAndSignIn, signInWithTotp } from './helpers';
import { userId } from './journeys';
import { staleExport, unattestedEvents, unattestedPractice } from './unattested';
import { startLocalWorker } from './worker';

/**
 * A submission sent without sign-off in the browser (the founder's ruling of 2026-10-20; docs/adr/0061; migration
 * 20261103090000): in a practice of its own, a billing manager uploads the SYNTHETIC CAS-08 remittance, whose case the
 * worker prices and triages; its packet is written, approved and exported, and then March is priced again and the
 * re-run accepted, so the export's pricing went stale after it was made and before any attestation (e2e/unattested.ts).
 * The reimbursement reviewer, under a support grant, finds the attestation refused for good, with why and what to do
 * instead (re-price, a new version, a new export) and how an export already sent is logged. The builder tells the
 * billing manager the export is never attested, rather than waiting for the reviewer, and the submissions page says the export is never attested, not to send it if it has not gone, and logs it, once the manager
 * confirms it went without sign-off, recorded unattested with its reason and flagged with the cause, the database
 * recording it once in the manager's name. The log, Reconciliation (the practice's and the case's) and the review then
 * show it plainly as sent without sign-off, and it leaves the reviewer's list of exports waiting. Synthetic data only.
 */

const REMITTANCE = readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/synthetic/CAS-08/remit.835'));
/** The CAS-08 fixture's identifiers, which no screen or URL here shows. */
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003'];
const WORDS = 'Sent without sign-off: pricing went stale after export';

test('an export whose pricing went stale after it was made is never attested, and is logged sent without sign-off, plainly, once it went (the founder’s ruling of 2026-10-20)', async ({ page, browser }) => {
  test.setTimeout(600_000);
  const practiceId = await unattestedPractice();
  await signInWithTotp(page, 'unattested-manager');

  const local = await startLocalWorker();
  let stale: Awaited<ReturnType<typeof staleExport>>;
  try {
    stale = await test.step('the remittance loads, its case is priced and triaged, its packet exported, and the period priced again and accepted', async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: REMITTANCE }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      return staleExport(practiceId);
    });
  } finally {
    await local.close();
  }
  const casePath = `/p/${practiceId}/cases/${stale.caseId}`;
  const reviewPath = `${casePath}/packet/${stale.versionId}/review`;

  const context = await browser.newContext();
  const reviewer = await context.newPage();
  try {
    await registerKeyAndSignIn(reviewer, 'unattested-reviewer');

    await test.step('the reviewer finds the attestation refused for good, with why, the three steps instead and how an export already sent is logged', async () => {
      await reviewer.goto(`/p/${practiceId}/packet-reviews`);
      await reviewer.getByRole('table', { name: 'Exports waiting' }).getByRole('link').first().click();
      await expect(reviewer).toHaveURL(new RegExp(`${reviewPath}$`));
      const attestation = reviewer.getByRole('region', { name: 'Attestation' });
      await expect(attestation.locator('[data-attestation="blocked"][data-reason="pricing_not_current"]')).toBeVisible();
      const why = attestation.locator('[data-stale-export="PRICING_NOT_IN_EFFECT"]');
      await expect(why).toHaveAttribute('data-sent', 'no');
      await expect(why).toContainText('Not attested: this export’s pricing went stale after the export');
      await expect(why).toContainText('Priced again since it joined the case');
      await expect(why).toContainText('so this export is never attested');
      const steps = why.getByRole('list', { name: 'What to do instead' }).getByRole('listitem');
      await expect(steps).toHaveCount(3);
      await expect(steps.nth(0)).toContainText('Re-price: done already.');
      await expect(steps.nth(1)).toContainText('A new version:');
      await expect(steps.nth(2)).toContainText('A new export:');
      await expect(why.locator('[data-if-sent="without_sign_off"]')).toContainText('sent without sign-off: pricing went stale after export');
      const attest = attestation.getByRole('button', { name: 'Attest the export' });
      await expect(attest).toBeDisabled();
      await expect(attest).toHaveAccessibleDescription(/never attested/);
      await expectAccessible(reviewer, 'Packet review, an export whose pricing went stale after it was made');
      await atPhoneWidth(reviewer, 'Packet review, an export whose pricing went stale after it was made');
      assertNoPhi('url', reviewer.url(), { known: KNOWN });
    });

    await test.step('the builder says the export is never attested, and the submissions page logs it, once the manager confirms it went without sign-off', async () => {
      await page.goto(`${casePath}/packet`);
      const exported = page.getByRole('region', { name: 'Export', exact: true });
      await expect(exported.locator('[data-attestation="waiting"]')).toHaveCount(0);
      await expect(exported.locator('[data-attestation="never"]')).toContainText('Never attested: this export’s pricing went stale after the export.');
      await exported.locator('[data-attestation="never"]').getByRole('link', { name: 'Submissions' }).click();
      await expect(page).toHaveURL(new RegExp(`${casePath}/submissions$`));
      const form = page.getByRole('region', { name: 'Log a submission' });
      const notice = form.locator('[data-attestation="never"][data-unattested-reason="pricing_stale_after_export"]');
      await expect(notice).toContainText('This export is never attested: its pricing went stale after the export');
      await expect(notice).toContainText('If it has not gone to the payer, do not send it');
      await expect(notice).toContainText('It is recorded as sent without sign-off: pricing went stale after export');
      await expect(form.locator('[data-attestation="waiting"]')).toHaveCount(0);
      const confirm = form.getByRole('checkbox', { name: /went to the payer without the reimbursement reviewer’s sign-off/ });
      await expect(confirm).toHaveAttribute('required', '');
      await expectAccessible(page, 'Submissions, an export never attested');
      await form.getByLabel('Payer’s reference (a portal confirmation, a fax receipt)').fill('SYNTHETIC-PORTAL-REF-UNATTESTED');
      await confirm.check();
      await form.getByRole('button', { name: 'Log the submission sent without sign-off' }).click();
      await expect(page.locator('[data-notice="logged_unattested"]')).toContainText('The submission is logged as sent without sign-off: pricing went stale after export.');
      const log = page.getByRole('region', { name: 'Submission log' });
      await expect(log.locator('[data-submission-sent="unattested"]')).toContainText(WORDS);
      await expect(log.locator('[data-submission-pricing="PRICING_NOT_IN_EFFECT"]')).toBeVisible();
      await expect(log.locator('[data-follow-up]')).toHaveCount(1);
      // The database recorded it once, in the manager's name, with its reason.
      expect(await unattestedEvents(practiceId)).toEqual([{ actor_id: await userId('unattested-manager'), actor_kind: 'user', purpose: 'pricing_stale_after_export' }]);
      await expectAccessible(page, 'Submissions, logged sent without sign-off');
      assertNoPhi('url', page.url(), { known: KNOWN });
    });

    await test.step('Reconciliation lists it plainly, the practice’s and the case’s, with the payer’s answer still to come', async () => {
      for (const target of [`/p/${practiceId}/reconciliation`, `/p/${practiceId}/reconciliation?case=${stale.caseId}`]) {
        await page.goto(target);
        const listed = page.getByRole('region', { name: 'Submissions sent without sign-off' });
        await expect(listed).toHaveAttribute('data-unattested-total', '1');
        await expect(listed.locator('[data-unattested-reason="pricing_stale_after_export"]')).toContainText(WORDS);
        await expect(listed.locator('[data-latest-response="none"]')).toContainText('The payer has not answered it yet.');
      }
      await expectAccessible(page, 'Case ledger, a submission sent without sign-off');
    });

    await test.step('the review says it was logged sent without sign-off, and it leaves the reviewer’s list of exports waiting', async () => {
      await reviewer.goto(reviewPath);
      const why = reviewer.getByRole('region', { name: 'Attestation' }).locator('[data-stale-export]');
      await expect(why).toHaveAttribute('data-sent', 'without_sign_off');
      await expect(why).toContainText('as sent without sign-off: pricing went stale after export. This version is never attested');
      await expect(why.locator('[data-if-sent]')).toHaveCount(0);
      await expect(reviewer.getByRole('region', { name: 'Attestation' }).getByRole('button', { name: 'Attest the export' })).toBeDisabled();
      await reviewer.goto(`/p/${practiceId}/packet-reviews`);
      await expect(reviewer.getByRole('region', { name: 'Exports waiting' })).toContainText('No export is waiting');
    });
  } finally {
    await context.close();
  }
});
