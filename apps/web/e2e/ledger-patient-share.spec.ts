import { type Page, expect, test } from '@playwright/test';

import { signInWithTotp } from './helpers';
import { expectLedgerFigure, openLedgerCase, patientSharePractice, reconcileNow, uploadLedger835, uploadLedgerExport } from './ledger';
import { startLocalWorker } from './worker';

/**
 * The ledger in payment terms in the browser (PRD 13, Matching step 1; docs/adr/0067; test matrix LED-14 and LED-15):
 * in practices of their own, a billing manager uploads a SYNTHETIC line's original payment with a patient's share,
 * whose case the worker prices and triages (the payer's schedule signed off beside the browser, e2e/ledger.ts), then
 * the payer's correction. On a coinsurance line (LED-14) the ledger approves what the payer pays more, never the
 * allowed increase, and the patient's coinsurance is shown beside it as billable to the patient, on Reconciliation,
 * the case's ledger and the case page, and counted in no figure: the dashboard's three headline numbers never hold it.
 * A correction a deductible took whole (LED-15) writes nothing and says so: "Payer corrected; balance is the
 * patient's", beside the case's state, which stays as derived. A viewer sees the amounts, never the share's reasons.
 * Synthetic data only.
 */

async function withWorker(run: () => Promise<void>): Promise<void> {
  const local = await startLocalWorker();
  try {
    await run();
  } finally {
    await local.close();
  }
}

/** The case of the LED fixture's original payment, opened by the worker. */
async function openedCase(page: Page, practiceId: string, caseId: string): Promise<string> {
  let opened = '';
  await withWorker(async () => {
    await uploadLedger835(page, practiceId, caseId, 'original.835');
    opened = await openLedgerCase(practiceId);
  });
  return opened;
}

test('a correction on a coinsurance line approves what the payer pays more, the patient’s share beside it and in no figure (LED-14)', async ({ page, browser }) => {
  test.setTimeout(360_000);
  const practiceId = await patientSharePractice('LED-14');
  const reconciliation = `/p/${practiceId}/reconciliation`;
  await signInWithTotp(page, 'ledger-manager');
  const caseId = await openedCase(page, practiceId, 'LED-14');

  await test.step('the adjusted remittance approves the payer’s 24.00, with the patient’s 6.00 beside it', async () => {
    await withWorker(async () => {
      await uploadLedger835(page, practiceId, 'LED-14', 'adjusted.835');
      await reconcileNow(practiceId);
      await expectLedgerFigure(page, reconciliation, 'approved', '$24.00');
    });
    const line = page.getByRole('list', { name: 'Case lines' }).getByRole('listitem').first();
    await expect(line.getByRole('list', { name: 'ERA: the remittance that reprocessed it' })).toContainText('higher allowed: approved; the payer pays $24.00 more');
    await expect(line.locator('[data-billable="600"]')).toHaveText(
      'Billable to the patient: $6.00 (coinsurance +$6.00). The payer raised the allowed amount by $30.00 and pays $24.00 of it; the rest is the patient’s share, counted in no total.',
    );
    await expect(page.locator('[data-figure="approved"]')).toContainText('what payers have agreed to pay on the lines they corrected, never the patient’s share');
  });

  await test.step('the 24.00 deposit recovers the line', async () => {
    await withWorker(async () => {
      await uploadLedgerExport(page, practiceId, 'LED-14', 'eft_export', 'eft-export.csv');
      await expectLedgerFigure(page, reconciliation, 'recovered', '$24.00');
    });
    await expect(page.locator('[data-figure="deposited"]')).toContainText('$24.00');
    await expect(page.getByRole('list', { name: 'Case lines' }).getByRole('listitem').first().locator('[data-line-stage]')).toHaveText('Recovered (posted or deposited)');
  });

  await test.step('the case’s ledger and the case page show the share beside, counted in no total', async () => {
    await page.goto(`${reconciliation}?case=${caseId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Case ledger' })).toBeVisible();
    await expect(page.locator('[data-billable="600"]')).toContainText('Billable to the patient: $6.00 (coinsurance +$6.00).');
    await page.goto(`/p/${practiceId}/cases/${caseId}`);
    await expect(page.locator('[data-figure="payer-approved"]')).toHaveText('$24.00');
    await expect(page.locator('[data-figure="recovered"]')).toHaveText('$24.00');
    await expect(page.locator('[data-figure="billable"]')).toHaveText('$6.00');
    await expect(page.getByText('(the patient’s share of the payer’s corrections; counted in no total)')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Case lines' }).locator('[data-billable="600"]')).toContainText('coinsurance +$6.00');
    await expect(page.locator('[data-patient-balance]')).toHaveCount(0);
  });

  await test.step('the dashboard’s three headline numbers never hold the patient’s share', async () => {
    await page.goto(`/p/${practiceId}`);
    await expect(page.locator('[data-figure="payer-approved"]')).toContainText('$24.00');
    await expect(page.locator('[data-figure="payer-approved"]')).toContainText('what payers have agreed to pay on the lines they corrected, from the recovery ledger; not cash until it posts');
    await expect(page.locator('[data-figure="recovered-total"]')).toContainText('$24.00');
    for (const figure of ['actionable', 'payer-approved', 'recovered-total']) {
      await expect(page.locator(`[data-figure="${figure}"]`)).not.toContainText('$6.00');
    }
  });

  await test.step('a viewer sees the amounts, never the share’s reasons', async () => {
    const context = await browser.newContext();
    const viewer = await context.newPage();
    await signInWithTotp(viewer, 'ledger-viewer');
    await viewer.goto(reconciliation);
    const billable = viewer.locator('[data-billable="600"]');
    await expect(billable).toContainText('Billable to the patient: $6.00 (the patient’s share).');
    await expect(billable).not.toContainText('coinsurance');
    await context.close();
  });
});

test('a correction the deductible took whole writes nothing and shows the balance as the patient’s, never recovered and never no change (LED-15)', async ({ page }) => {
  test.setTimeout(300_000);
  const practiceId = await patientSharePractice('LED-15');
  const reconciliation = `/p/${practiceId}/reconciliation`;
  await signInWithTotp(page, 'ledger-manager');
  const caseId = await openedCase(page, practiceId, 'LED-15');

  await test.step('the adjusted remittance is matched with no entry, and the line says whose the balance is', async () => {
    await withWorker(async () => {
      await uploadLedger835(page, practiceId, 'LED-15', 'adjusted.835');
      await reconcileNow(practiceId);
      await expect(async () => {
        await page.goto(reconciliation);
        await expect(page.locator('[data-correction="patient_balance"]')).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
    });
    const line = page.getByRole('list', { name: 'Case lines' }).getByRole('listitem').first();
    await expect(line.locator('[data-correction="patient_balance"]')).toHaveText(
      'Payer corrected; balance is the patient’s. The payer raised the allowed amount by $30.00 and pays nothing more: the patient’s deductible took all of it. No ledger entry is written; counted in no total.',
    );
    await expect(line.getByRole('list', { name: 'ERA: the remittance that reprocessed it' })).toContainText('higher allowed: payer corrected; balance is the patient’s');
    await expect(line.getByRole('list', { name: 'ERA: the remittance that reprocessed it' })).not.toContainText('no change');
    await expect(line.locator('[data-line-stage]')).toHaveText('Actionable');
    await expect(page.locator('[data-figure="approved"]')).toContainText('$0.00');
    await expect(page.locator('[data-figure="recovered"]')).toContainText('$0.00');
    await expect(page.getByText('No entry yet')).toBeVisible();
  });

  await test.step('the case page says it beside the state the case keeps', async () => {
    await page.goto(`/p/${practiceId}/cases/${caseId}`);
    await expect(page.locator('[data-patient-balance="yes"]')).toHaveText('Payer corrected; balance is the patient’s');
    await expect(page.locator('[data-figure="billable"]')).toHaveText('$30.00');
    await expect(page.locator('[data-figure="payer-approved"]')).toHaveText('$0.00');
    await expect(page.getByRole('list', { name: 'Case lines' }).locator('[data-correction="patient_balance"]')).toContainText('the patient’s deductible took all of it');
  });
});
