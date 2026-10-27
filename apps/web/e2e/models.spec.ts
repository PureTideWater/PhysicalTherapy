import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Browser, type Page, expect, test } from '@playwright/test';

import { atPhoneWidth, expectAccessible } from './a11y';
import { registerKeyAndSignIn, signInWithTotp, withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, until } from './journeys';
import { MODELS_PRACTICE, Q97110, Q97140, draftContract, expectModelOutput, expectNarrative, fixedCandidate, modelCalls } from './models';
import { startLocalWorker } from './worker';

/**
 * The model features in the browser, on the local deterministic provider (PRD 14; PRD 5, J5 in v1 and
 * J9; test matrix MOD-01, MOD-03, MOD-06; the milestone 10 done check; docs/adr/0052). In a practice of
 * its own, whose SYNTHETIC CAS-08 remittance a billing manager uploads and whose case the worker
 * prices and triages:
 *
 * - the contract specialist has the model propose a draft version's terms, sees each field checked
 *   against its cited page, verifies the record field by field on the page and approves the version;
 *   the call records the decision, accepted;
 * - a billing manager drafts the packet's first version with the model, sees the verifier pass, and is
 *   refused its approval as its drafter; a second billing manager approves it;
 * - a platform administrator turns the kill switch on for the practice on the console's model
 *   features screen, which then shows the practice switched off beside its spend today;
 * - with the kill switch on, the same journeys are done by hand: the specialist is offered no proposal
 *   and enters the record, the drafter is offered no draft and edits the narrative, a second person
 *   approves, the coverage screen offers its remedies, and no call reaches the model.
 *
 * Synthetic data only.
 */

const REMITTANCE = readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/synthetic/CAS-08/remit.835'));
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };

async function withWorker<T>(run: () => Promise<T>): Promise<T> {
  const local = await startLocalWorker();
  try {
    return await run();
  } finally {
    await local.close();
  }
}

/** Approves each field of the version's one unverified record against its cited page, then the version. */
async function verifyAndApprove(specialist: Page): Promise<void> {
  await specialist.getByRole('link', { name: 'Show the cited page' }).click();
  await expect(specialist.locator('[data-state="blocked"]')).toBeVisible();
  for (const field of ['scope', 'method', 'parameters', 'flags', 'rounding']) {
    const button = specialist.getByRole('button', { name: `Approve ${field}` });
    await button.click();
    await expect(button).toHaveCount(0);
  }
  await expect(specialist.locator('[data-state="blocked"]')).toHaveCount(0);
  await specialist.getByRole('button', { name: 'Approve the version' }).click();
  await expect(specialist.locator('[data-state="approved"]')).toBeVisible();
}

/** A platform administrator turns the kill switch on for the practice from the console's model features screen (MOD-06). */
async function killSwitchFromConsole(browser: Browser, practiceId: string): Promise<void> {
  const context = await browser.newContext();
  const admin = await context.newPage();
  try {
    await registerKeyAndSignIn(admin, 'models-admin');
    await admin.goto('/console/models');
    const spend = admin.locator(`[data-practice-spend="${practiceId}"]`);
    await expect(spend).toBeVisible();
    await expect(spend).not.toContainText('Switched off');
    await admin.getByLabel('Flag', { exact: true }).selectOption('model.kill_switch');
    await admin.getByLabel('Applies to', { exact: true }).selectOption(`practice:${practiceId}`);
    await admin.getByLabel('Value', { exact: true }).fill('on');
    await admin.getByRole('button', { name: 'Set the flag' }).click();
    await expect(admin.locator('[data-notice="flag_set"]')).toBeVisible();
    await expect(admin.getByRole('table', { name: 'Model flags' })).toContainText(MODELS_PRACTICE);
    await expect(spend).toContainText('Switched off');
    await expectAccessible(admin, 'Model features');
  } finally {
    await context.close();
  }
}

async function approveAsSecondPerson(approver: Page, packetPath: string, versionNo: number): Promise<void> {
  await approver.goto(packetPath);
  await expect(approver.getByRole('region', { name: 'Version', exact: true })).toContainText(`Version ${String(versionNo)}`);
  const approval = approver.getByRole('region', { name: 'Approval' });
  await expect(approval.locator('[data-approval="ready"]')).toBeVisible();
  await approval.getByRole('button', { name: 'Approve this version' }).click();
  await expect(approver.locator('[data-notice="approved"]')).toBeVisible();
  await expect(approver.locator('[data-approval="approved"]')).toBeVisible();
}

test('the specialist verifies and approves the model’s proposal, a second person approves the model’s narrative, and with the kill switch on both are done by hand (milestone 10)', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const practiceId = await journeyPractice({ name: MODELS_PRACTICE, settings: SETTINGS, supportFor: ['models-specialist'] });
  await signInWithTotp(page, 'models-drafter');

  const caseId = await test.step('the remittance loads, and the worker opens its case', () =>
    withWorker(async () => {
      await page.goto(`/p/${practiceId}/uploads`);
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: REMITTANCE }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      await signedOffSchedule({ practiceId, managerKey: 'models-approver', planKey: 'CE:SYNPLAN-FIX-ONE' });
      await pricedAndTriaged({ practiceId, managerKey: 'models-approver', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
      let found = '';
      await until(async () => {
        found = await withDatabase(async (client) => (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id ?? '');
        return found !== '';
      }, 'the triage job');
      return found;
    }),
  );
  const packetPath = `/p/${practiceId}/cases/${caseId}/packet`;

  const specialistContext = await browser.newContext();
  const specialist = await specialistContext.newPage();
  const approver = await browser.newPage();
  try {
    await registerKeyAndSignIn(specialist, 'models-specialist');
    await signInWithTotp(approver, 'models-approver');

    await test.step('the model proposes a draft version’s terms; the specialist verifies each field against the cited page and approves the version (MOD-01)', async () => {
      const contract = await draftContract(practiceId, 'models-approver', 'SYNTHETIC MODEL-PROPOSED AGREEMENT');
      expectModelOutput('proposeContractTerms', contract.input, { candidates: [fixedCandidate('97110', Q97110, '$32.00')] });
      await specialist.goto(`/p/${practiceId}/abstraction/versions/${contract.versionId}`);
      const propose = specialist.getByRole('region', { name: 'Propose the terms' });
      await propose.getByRole('button', { name: 'Propose the terms' }).click();
      await expect(specialist.locator('[data-model-notice="proposed"]')).toBeVisible();
      const proposal = specialist.getByRole('region', { name: 'Model proposal', exact: true });
      await expect(proposal).toHaveAttribute('data-decision', 'awaiting');
      await expect(proposal.locator('[data-candidate="0"]')).toHaveAttribute('data-verified', 'yes');
      await expect(proposal.locator('[data-check="passed"]')).toHaveCount(3);
      await expect(proposal.locator('[data-check="failed"]')).toHaveCount(0);
      // The proposed record waits for the specialist: nothing is verified, and the version cannot be approved yet.
      const record = specialist.getByRole('region', { name: 'Rate record 1', exact: true });
      await expect(record).toContainText('Proposed by the model');
      await expect(record).toContainText('Not checked');
      await expectAccessible(specialist, 'Rate record review with a model proposal');
      // At a phone's width the proposed fields scroll in a region of their own, the record's three wrapping columns fit, and the cited page scrolls in its box (TBL-03).
      await atPhoneWidth(specialist, 'Rate record review with a model proposal', { tables: ['Proposed fields of proposal 1, candidate 1'] });
      await verifyAndApprove(specialist);
      await expect(specialist.locator('[data-page-text] mark')).toHaveText(Q97110);
      await expect(specialist.getByRole('region', { name: 'Model proposal', exact: true })).toHaveAttribute('data-decision', 'accepted');
    });

    await test.step('the model drafts the packet’s narrative; the verifier passes it; its drafter cannot approve it and a second person does (MOD-03, CAS-09)', async () => {
      const narrative = await expectNarrative(practiceId, caseId, 'models-drafter');
      await page.goto(packetPath);
      await expect(page.getByRole('region', { name: 'First version' })).toBeVisible();
      await page.getByRole('button', { name: 'Draft the first version with the model' }).click();
      await expect(page.locator('[data-model-notice="drafted"]')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 1');
      await expect(page.locator('[data-model-draft="passed"]')).toBeVisible();
      await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Narrative', exact: true })).toHaveValue(narrative);
      const approval = page.getByRole('region', { name: 'Approval' });
      await expect(approval.locator('[data-approval="drafter"]')).toBeVisible();
      await page.getByRole('button', { name: 'Request approval' }).click();
      await expect(page.locator('[data-notice="requested"]')).toBeVisible();
      await approveAsSecondPerson(approver, packetPath, 1);
      expect(await modelCalls(practiceId)).toEqual([
        { purpose: 'proposeContractTerms', reviewer_decision: 'accepted' },
        { purpose: 'draftPacketNarrative', reviewer_decision: 'accepted' },
      ]);
    });

    await test.step('a platform administrator turns the kill switch on for the practice from the console (MOD-06)', async () => {
      await killSwitchFromConsole(browser, practiceId);
    });

    await test.step('with the kill switch on, the specialist abstracts a version by hand (MOD-06)', async () => {
      const contract = await draftContract(practiceId, 'models-approver', 'SYNTHETIC HAND-ABSTRACTED AGREEMENT');
      expectModelOutput('proposeContractTerms', contract.input, { candidates: [fixedCandidate('97140', Q97140, '$30.50')] });
      await specialist.goto(`/p/${practiceId}/abstraction/versions/${contract.versionId}`);
      await expect(specialist.getByRole('region', { name: 'Propose the terms' }).locator('[data-state="model-off"]')).toBeVisible();
      await expect(specialist.getByRole('button', { name: 'Propose the terms' })).toHaveCount(0);
      const form = specialist.getByRole('region', { name: 'Enter a rate record' });
      await form.getByLabel('Procedure codes').fill('97140');
      await form.getByLabel('Method').selectOption('FIXED_SCHEDULE');
      await form.getByLabel('Amount').fill('30.50');
      await form.getByLabel('Page').fill('2');
      await form.getByLabel('Quote').fill(Q97140);
      await form.getByRole('button', { name: 'Add the rate record' }).click();
      await expect(specialist.locator('[data-page-text] mark')).toHaveText(Q97140);
      await expect(specialist.getByRole('region', { name: 'Rate record 1', exact: true })).not.toContainText('Proposed by the model');
      await verifyAndApprove(specialist);
    });

    await test.step('with the kill switch on, the drafter writes the narrative by hand and a second person approves it; coverage offers its remedies by hand (MOD-06)', async () => {
      await page.goto(packetPath);
      const offered = page.getByRole('group', { name: 'Draft with the model' });
      await expect(offered.locator('[data-state="model-off"]')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Draft the narrative with the model' })).toHaveCount(0);
      const editor = page.getByRole('textbox', { name: 'Narrative', exact: true });
      await editor.fill(`${await editor.inputValue()} This version was written by hand [1].`);
      await page.getByRole('button', { name: 'Save as a new version' }).click();
      await expect(page.locator('[data-notice="written"]')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Version', exact: true })).toContainText('Version 2');
      await expect(page.locator('[data-verifier="passed"]')).toBeVisible();
      await expect(page.locator('[data-model-draft]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Request approval' }).click();
      await expect(page.locator('[data-notice="requested"]')).toBeVisible();
      await approveAsSecondPerson(approver, packetPath, 2);

      await page.goto(`/p/${practiceId}/coverage`);
      await expect(page.locator('[data-state="model-off"]')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Suggest what to obtain with the model' })).toHaveCount(0);
      await expectAccessible(page, 'Coverage with the kill switch on');
      // Nothing reached the model once the switch was on.
      expect(await modelCalls(practiceId)).toHaveLength(2);
    });
  } finally {
    await approver.close();
    await specialistContext.close();
  }
});
