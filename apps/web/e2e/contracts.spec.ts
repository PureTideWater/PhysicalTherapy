import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';
import { assertNoPhi } from '@tp/observability';

import { SYNTHETIC_PRACTICES, personaEmail } from '../scripts/synthetic-personas';
import { practiceId, refusal, registerKeyAndSignIn, signInWithTotp } from './helpers';
import { startLocalWorker } from './worker';

/**
 * Contracts in the browser (PRD 5, J5; PRD 7, Contracts, Rate record review and Specialist queue; test
 * matrix CON-01, CON-04): a billing manager uploads a SYNTHETIC remittance and the SYNTHETIC agreement
 * of its payer (fixtures CON-07 and CON-01) and tags the agreement to the payer; a platform
 * administrator opens a support grant for a contract specialist; the specialist abstracts the
 * agreement by hand (a quote not on the page is refused, the right one is marked on the cited page),
 * approves it field by field, cites the agreement's dispute window on its page and verifies it (D17 a),
 * and approves the version; the billing manager signs it off and maps the
 * payer's plan to it, whose lines then resolve to the contract's rate record; and a second version
 * whose window overlaps the first is refused with the rule shown. In the other group's practice, whose
 * rows no other spec counts. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const QUOTE = '110% of the Medicare Physician Fee Schedule in effect on the date of service';
const KNOWN = ['SYNPCNCON07001', 'SYNCCNCON070001'];

async function uploadWithWorker(page: Page, run: () => Promise<void>): Promise<void> {
  const local = await startLocalWorker();
  try {
    await run();
  } finally {
    await local.close();
  }
}

async function uploadContract(page: Page, file: string): Promise<void> {
  await uploadWithWorker(page, async () => {
    await page.getByLabel('Kind of document').selectOption('contract');
    await page.getByLabel('Choose files to upload').setInputFiles([{ name: file, mimeType: 'application/pdf', buffer: readFileSync(path.join(FIXTURES, 'CON-01', file)) }]);
    await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: file })).toContainText('Stored', { timeout: 90_000 });
  });
}

async function enterRecord(page: Page, quote: string): Promise<void> {
  const form = page.getByRole('region', { name: 'Enter a rate record' });
  await form.getByLabel('Procedure codes').fill('97110, 97140, 97530');
  await form.getByLabel('Method').selectOption('PERCENT_OF_MEDICARE');
  await form.getByLabel('Percentage of Medicare').fill('110');
  await form.getByLabel('Page').fill('2');
  await form.getByLabel('Quote').fill(quote);
  await form.getByRole('button', { name: 'Add the rate record' }).click();
}

test('a contract abstracted by hand, approved and signed off becomes the version pricing uses; an overlapping version is refused (J5, CON-01)', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const other = await practiceId('other');
  await signInWithTotp(page, 'contracts-manager');

  await test.step('the payer’s remittance loads', async () => {
    await page.goto(`/p/${other}/uploads`);
    await uploadWithWorker(page, async () => {
      await page.getByLabel('Choose files to upload').setInputFiles([{ name: 'payer-c.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CON-07', 'remit.835')) }]);
      await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'payer-c.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
    });
  });

  await test.step('the billing manager uploads the agreement and tags it to its payer', async () => {
    const response = await page.goto(`/p/${other}/contracts`);
    expect(response?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
    await uploadContract(page, 'version-1.pdf');
    const untagged = page.getByRole('list', { name: 'Untagged documents' }).getByRole('listitem');
    await expect(untagged).toHaveCount(1, { timeout: 30_000 });
    await untagged.getByLabel('Payer').selectOption({ label: 'SYNTHETIC PAYER C' });
    await untagged.getByLabel('Title of a new contract').fill('SYNTHETIC PAYER C AGREEMENT');
    await untagged.getByLabel('Effective from').fill('2026-01-01');
    await untagged.getByLabel('Last day (optional)').fill('2026-12-31');
    await untagged.getByRole('button', { name: 'Tag to the payer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Version 1: rate record review');
    await expect(page.locator('[data-state="abstraction"]')).toBeVisible();
  });
  const versionUrl = page.url();

  await test.step('a platform administrator opens a support grant for the contract specialist', async () => {
    const context = await browser.newContext();
    const admin = await context.newPage();
    try {
      await registerKeyAndSignIn(admin, 'contracts-admin');
      await admin.goto('/console/support');
      await admin.getByLabel('Practice').selectOption({ label: SYNTHETIC_PRACTICES.other });
      await admin.getByLabel('Support engineer or contract specialist').selectOption({ label: `${personaEmail('contracts-specialist')} (Contract specialist)` });
      await admin.getByLabel('Ticket').fill('SYN-CON-E2E');
      await admin.getByLabel('Reason').fill('SYNTHETIC ABSTRACTION OF A NEW AGREEMENT');
      await admin.getByRole('button', { name: 'Create support grant' }).click();
      await expect(admin.getByRole('table', { name: 'Support grants' }).getByRole('row').filter({ hasText: 'SYN-CON-E2E' })).toContainText('Contract specialist');
    } finally {
      await context.close();
    }
  });

  await test.step('the contract specialist abstracts the agreement by hand and approves it field by field', async () => {
    const context = await browser.newContext();
    const specialist = await context.newPage();
    try {
      await registerKeyAndSignIn(specialist, 'contracts-specialist');
      await expect(specialist.getByRole('heading', { level: 1, name: 'Specialist queue' })).toBeVisible();
      const row = specialist.getByRole('table', { name: 'Practices' }).getByRole('row').filter({ hasText: SYNTHETIC_PRACTICES.other });
      await row.getByRole('link', { name: 'Open the practice’s abstraction' }).click();
      await expect(specialist.getByRole('heading', { level: 1, name: 'Contract abstraction' })).toBeVisible();
      await specialist.getByRole('list', { name: 'Awaiting abstraction' }).getByRole('link', { name: 'SYNTHETIC PAYER C AGREEMENT, version 1' }).click();
      // A quote that is not on the cited page is refused (CON-04, CON-05).
      await enterRecord(specialist, '120% of the Medicare Physician Fee Schedule');
      await expect(refusal(specialist).filter({ hasText: 'Not done' })).toContainText('The quote is not on the cited page');
      await enterRecord(specialist, QUOTE);
      await expect(specialist.locator('[data-page-text] mark')).toHaveText(QUOTE);
      await expect(specialist.locator('[data-state="blocked"]')).toBeVisible();
      for (const field of ['scope', 'method', 'parameters', 'flags', 'rounding']) {
        const button = specialist.getByRole('button', { name: `Approve ${field}` });
        await button.click();
        await expect(button).toHaveCount(0);
      }
      await expect(specialist.locator('[data-state="blocked"]')).toHaveCount(0);
      // The agreement's dispute window, as page 1 states it: entered, cited in its own words and verified against
      // the page, so the lines it prices have a verified deadline (D17 a).
      const dates = specialist.getByRole('region', { name: "The version's window" });
      await dates.getByLabel('Last day (optional)').fill('2026-12-31');
      await dates.getByLabel('Dispute window (days)').fill('120');
      await dates.getByRole('button', { name: "Save the version's dates" }).click();
      await expect(specialist.locator('[data-window="uncited"]')).toBeVisible();
      const window = specialist.getByRole('region', { name: "The contract's dispute window" });
      await window.getByLabel('Page').fill('1');
      await window.getByLabel('Quote').fill('Provider may dispute a payment within 365 days of the remittance date.');
      await window.getByRole('button', { name: 'Cite the window' }).click();
      await expect(refusal(specialist).filter({ hasText: 'Not done' })).toContainText('The quote is not on the cited page');
      // The refused form is reset, as the rate record's is: the page and the quote are entered again.
      await window.getByLabel('Page').fill('1');
      await window.getByLabel('Quote').fill('Provider may dispute a payment within 120 days of the remittance date.');
      await window.getByRole('button', { name: 'Cite the window' }).click();
      await expect(specialist.locator('[data-window="unverified"]')).toBeVisible();
      await expect(specialist.getByRole('region', { name: 'Approve the version' })).toContainText('the dispute window is cited but not verified');
      await specialist.getByRole('button', { name: 'Verify the window against its page' }).click();
      await expect(specialist.locator('[data-window="verified"]')).toBeVisible();
      await specialist.getByRole('button', { name: 'Approve the version' }).click();
      await expect(specialist.locator('[data-state="approved"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  await test.step('the billing manager signs it off, and it is the version pricing uses', async () => {
    await page.goto(versionUrl);
    await page.getByRole('button', { name: 'Sign off this version' }).click();
    await expect(page.locator('[data-notice="signed_off"]')).toBeVisible();
    await expect(page.locator('[data-state="pricing"]')).toContainText('2026-01-01 through 2026-12-31');
    await expect(page.locator('[data-window="verified"]')).toContainText('Provider may dispute a payment within 120 days of the remittance date.');
    await page.goto(`/p/${other}/mapping`);
    const plan = page.getByRole('table', { name: 'Payers and plans' }).getByRole('row').filter({ hasText: 'SYNPLAN-COMM-C' });
    await plan.getByRole('link', { name: 'CE:SYNPLAN-COMM-C' }).click();
    await page.getByLabel('Agreement', { exact: true }).selectOption({ label: 'Contract version' });
    await page.getByLabel('Contract version (for a contract mapping)').selectOption({ label: 'SYNTHETIC PAYER C AGREEMENT, version 1 (2026-01-01 through 2026-12-31)' });
    await page.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
    await page.getByRole('button', { name: 'Save the mapping' }).click();
    await expect(page.locator('[data-notice="mapped"]')).toBeVisible();
    const resolution = page.getByRole('table', { name: 'Agreement resolution' }).getByRole('row').filter({ hasText: 'Priced from the contract’s rate record' });
    await expect(resolution).toContainText('SYNTHETIC PAYER C AGREEMENT, version 1');
    await expect(resolution).toContainText('Signed off');
    expect(() => {
      assertNoPhi('url', page.url(), { known: KNOWN });
    }).not.toThrow();
  });

  await test.step('a second version whose window overlaps the signed-off one is refused, with the rule shown (CON-01)', async () => {
    await page.goto(`/p/${other}/contracts`);
    await uploadContract(page, 'version-2.pdf');
    const untagged = page.getByRole('list', { name: 'Untagged documents' }).getByRole('listitem');
    await expect(untagged).toHaveCount(1, { timeout: 30_000 });
    await untagged.getByLabel('Payer').selectOption({ label: 'SYNTHETIC PAYER C' });
    await untagged.getByLabel('Contract', { exact: true }).selectOption({ label: 'SYNTHETIC PAYER C AGREEMENT (SYNTHETIC PAYER C)' });
    await untagged.getByLabel('Effective from').fill('2026-07-01');
    await untagged.getByLabel('Last day (optional)').fill('2027-06-30');
    await untagged.getByRole('button', { name: 'Tag to the payer' }).click();
    await expect(refusal(page).filter({ hasText: 'Not done' })).toContainText('versions of one contract never overlap: amend the version in force, or supersede it');
    await page.goto(`/p/${other}/contracts`);
    const contract = page.getByRole('table', { name: 'Contracts' }).getByRole('row').filter({ hasText: 'SYNTHETIC PAYER C AGREEMENT' });
    await expect(contract).toContainText('Version 1 (in force)');
    await expect(contract).toContainText('Signed off');
  });
});
