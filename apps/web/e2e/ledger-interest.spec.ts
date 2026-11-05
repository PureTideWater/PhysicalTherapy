import { type Page, expect, test } from '@playwright/test';

import { atPhoneWidth, expectAccessible } from './a11y';
import { signInWithTotp } from './helpers';
import { expectLedgerFigure, openLedgerCase, patientSharePractice, reconcileNow, uploadLedger835 } from './ledger';
import { startLocalWorker } from './worker';

/**
 * Interest in the browser, once, from the money in the check (designs/ledger-interest-once.md 6.3 and 7; test matrix
 * LED-23; docs/adr/0084): in practices of their own, a billing manager uploads LED-23's SYNTHETIC two-line original
 * payment, whose case the worker prices and triages (e2e/ledger.ts), then the payer's correction. When the correction's
 * claim reports 5.40 of interest (AMT I) and the check pays it in a PLB L6 (paired.835), each line reads the interest
 * paid in this check, its entries are 2.40 and 3.00, the claim's reported 5.40 is shown once beside them as reported, and
 * the totals tile's Interest is 5.40, never 10.80; the period's ROI statement says its interest is net of what the payer
 * took back. When the claim reports interest the check does not pay (reported-only.835), nothing is counted: the line
 * says "No interest paid." and shows the reported 5.40 as reported. Each page passes axe, and at a phone's width does not
 * scroll sideways. Synthetic data only.
 */

async function withWorker(run: () => Promise<void>): Promise<void> {
  const local = await startLocalWorker();
  try {
    await run();
  } finally {
    await local.close();
  }
}

/** A practice of its own with LED-23's case open from its original payment, the billing manager signed in. */
async function interestCase(page: Page): Promise<string> {
  const practiceId = await patientSharePractice('LED-23');
  await signInWithTotp(page, 'ledger-manager');
  await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-23', 'original.835');
    await openLedgerCase(practiceId);
  });
  return practiceId;
}

const COUNTED_NOTE = 'Interest is counted only as a check pays it or takes it back (PLB L6), in the Interest list above.';

/** The reported rows' own list, named as its visible label is, apart from the Interest list. */
const REPORTED = 'Reported on the claim (AMT I), not counted';

test('interest a claim reports and its check pays in a PLB L6 is counted once, from the PLB L6, beside the claim’s reported AMT I (LED-23 paired.835)', async ({ page }) => {
  test.setTimeout(360_000);
  const practiceId = await interestCase(page);
  const reconciliation = `/p/${practiceId}/reconciliation`;

  await test.step('each line reads the interest paid in this check, its entries 2.40 and 3.00, and the reported 5.40 once', async () => {
    await withWorker(async () => {
      await uploadLedger835(page, practiceId, 'LED-23', 'paired.835');
      await reconcileNow(practiceId);
      await expectLedgerFigure(page, reconciliation, 'interest', '$5.40');
    });
    const interest = page.locator('[data-figure="interest"]');
    await expect(interest).toContainText('$5.40');
    await expect(interest).toContainText('paid by the payer, net of any it took back, apart from principal');
    const lines = page.getByRole('list', { name: 'Case lines' }).locator('[data-line]');
    await expect(lines).toHaveCount(2);
    for (const line of await lines.all()) {
      const matches = line.getByRole('list', { name: 'Interest' }).getByRole('listitem');
      await expect(matches).toHaveCount(1);
      await expect(matches.first()).toContainText('Remittance SYNEFTLED23002, SYNTHETIC PAYER L, paid 2026-06-08: interest paid in this check (PLB L6); matched by the reconcile job');
      await expect(line.getByText(REPORTED, { exact: true })).toBeVisible();
      await expect(line.getByRole('list', { name: REPORTED, exact: true }).getByRole('listitem')).toHaveText(['Remittance SYNEFTLED23002, SYNTHETIC PAYER L, paid 2026-06-08: the claim reports $5.40 of interest (AMT I).']);
      await expect(line.locator('[data-reported-note]')).toHaveText(COUNTED_NOTE);
      await expect(line.locator('[data-stage="interest"]')).toHaveCount(1);
    }
    const entries = page.locator('[data-line] [data-stage="interest"]');
    await expect(entries.filter({ hasText: '$2.40' })).toHaveCount(1);
    await expect(entries.filter({ hasText: '$3.00' })).toHaveCount(1);
    await expect(entries.filter({ hasText: '(allocated pro rata)' })).toHaveCount(2);
    await expectAccessible(page, 'Reconciliation with interest paid in a PLB L6');
    await atPhoneWidth(page, 'Reconciliation with interest paid in a PLB L6');
  });

  await test.step('the period’s ROI statement says its interest is net of what the payer took back', async () => {
    await page.goto(`/p/${practiceId}/reports/roi`);
    await page.getByLabel('First day').fill('2026-06-01');
    await page.getByLabel('Last day').fill('2026-06-30');
    await page.getByRole('button', { name: 'Generate the statement' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ROI statement, 2026-06-01 to 2026-06-30');
    const interest = page.getByRole('region', { name: 'Interest, net', exact: true });
    await expect(interest).toContainText('$5.40');
    await expect(interest).toContainText('Interest the payer paid in the period, less any it took back, shown apart from principal.');
    await expectAccessible(page, 'An ROI statement with interest');
    await atPhoneWidth(page, 'An ROI statement with interest');
  });
});

test('interest a claim reports with no PLB L6 in its check is shown as reported and counted nowhere (LED-23 reported-only.835)', async ({ page }) => {
  test.setTimeout(300_000);
  const practiceId = await interestCase(page);
  const reconciliation = `/p/${practiceId}/reconciliation`;
  await withWorker(async () => {
    await uploadLedger835(page, practiceId, 'LED-23', 'reported-only.835');
    await reconcileNow(practiceId);
    await expectLedgerFigure(page, reconciliation, 'approved', '$54.00');
  });
  await expect(page.locator('[data-figure="interest"]')).toContainText('$0.00');
  const lines = page.getByRole('list', { name: 'Case lines' }).locator('[data-line]');
  await expect(lines).toHaveCount(2);
  for (const line of await lines.all()) {
    await expect(line.getByText('No interest paid.')).toBeVisible();
    await expect(line.getByText(REPORTED, { exact: true })).toBeVisible();
    await expect(line.getByRole('list', { name: REPORTED, exact: true }).getByRole('listitem')).toHaveText(['Remittance SYNEFTLED23006, SYNTHETIC PAYER L, paid 2026-06-08: the claim reports $5.40 of interest (AMT I).']);
    await expect(line.locator('[data-reported-note]')).toHaveText(COUNTED_NOTE);
    await expect(line.locator('[data-stage="interest"]')).toHaveCount(0);
  }
  await expectAccessible(page, 'Reconciliation with interest reported only');
  await atPhoneWidth(page, 'Reconciliation with interest reported only');
});
