import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page, type Request, expect, test } from '@playwright/test';
import { asOwner } from '@tp/db/testing';
import { assertNoPhi } from '@tp/observability';

import { atPhoneWidth, expectAccessible } from './a11y';
import { E2E_ORIGIN } from './env';
import { signInWithTotp, withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, untilLoaded, uploadedEarlier } from './journeys';
import { startLocalWorker } from './worker';

/**
 * A refused download comes back to its page, never a JSON page (docs/adr/0079; test matrix DLR-04; the UX baseline
 * review's UX-010). In a practice of its own, a billing manager uploads the SYNTHETIC CAS-08 remittance (its payer's
 * schedule signed off beside the browser, e2e/journeys.ts) and asks Coverage for the request-to-payer letter: a code the
 * browser's pattern would stop, sent past it, comes back to Coverage with the entries kept, the field marked, described
 * by its message and focused, and the page passes the accessibility check at 1280 and 390 px; a contract that is not
 * the payer's and a payer that is not the practice's come back marked on their own controls; the pattern stops the bad
 * code before the round trip and takes good ones; and a good letter downloads while the page stays. Then a viewer who
 * opens the audit report's line CSV as a page lands on the report with the refusal said and focused, while a script's
 * request keeps the JSON refusal. Synthetic data only.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003'];
const REFUSALS_PRACTICE = 'SYNTHETIC OTHER PRACTICE DOWNLOAD REFUSALS';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };
/** The CAS-08 remittance's payer, whose schedule is signed off, and a second payer of the practice with no contract. */
const PAYER_Q = 'SYNTHETIC PAYER Q';
const PAYER_NONE = 'SYNTHETIC PAYER DLR';
/** An opaque ID that names no payer of the practice. */
const NO_PAYER = '00000000-0000-4000-8000-00000000d1e0';

/** The page's URL holds no identifier (the PHI guard's shapes and the remittance's own values). */
function expectNoPhiIn(page: Page): void {
  expect(() => {
    assertNoPhi('url', page.url(), { known: KNOWN });
  }).not.toThrow();
}

/** Reloads the page until the worker has generated the report. */
async function generated(page: Page): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.locator('[data-status="ready"]').first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
}

test('a refused letter comes back to Coverage marked, focused and kept; a good one downloads; a viewer’s refused CSV lands on its report (DLR-04)', async ({ page, browser }) => {
  test.setTimeout(360_000);
  const practice = await journeyPractice({ name: REFUSALS_PRACTICE, settings: SETTINGS });
  const coverage = `/p/${practice}/coverage`;
  await signInWithTotp(page, 'refusals-manager');
  const local = await startLocalWorker();
  try {
    await test.step('the remittance loads, its payer’s schedule is signed off, and a second payer has no contract', async () => {
      const files = [{ name: 'remit.835', mimeType: 'application/octet-stream', buffer: readFileSync(path.join(FIXTURES, 'CAS-08/remit.835')) }];
      // A retry finds the attempt before's upload: it is waited for, not uploaded again (it would be a duplicate of itself).
      const earlier = await uploadedEarlier(practice, files);
      if (earlier.size === 0) {
        await page.goto(`/p/${practice}/uploads`);
        await page.getByLabel('Choose files to upload').setInputFiles(files);
        await expect(page.getByRole('region', { name: 'This batch' }).getByRole('listitem').filter({ hasText: 'remit.835' })).toContainText('Loaded 1 remittance', { timeout: 90_000 });
      }
      for (const documentId of earlier.values()) {
        await untilLoaded(documentId);
      }
      await signedOffSchedule({ practiceId: practice, managerKey: 'refusals-manager', planKey: 'CE:SYNPLAN-FIX-ONE' });
      // After the schedule, which takes the practice's first payer. Kept by its raw ID, so a retry adds none.
      await withDatabase((client) =>
        asOwner(client, [practice], () => client.query("INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, 'SYNPAYERDLR', $2) ON CONFLICT DO NOTHING", [practice, PAYER_NONE])),
      );
    });

    const form = page.getByRole('form', { name: 'Letter' });
    const payer = form.getByLabel('Payer', { exact: true });
    const contract = form.getByLabel('The payer’s contract (optional)');
    const codes = form.getByLabel('Procedure codes (optional)');
    const submit = form.getByRole('button', { name: 'Download the letter' });

    await test.step('a code past the browser’s pattern comes back to Coverage, kept, marked, described and focused, and the page is accessible', async () => {
      await page.goto(coverage);
      await expect(payer.locator('option')).toHaveText([PAYER_NONE, PAYER_Q]);
      await payer.selectOption({ label: PAYER_Q });
      await contract.selectOption({ label: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
      const payerId = await payer.inputValue();
      const contractId = await contract.inputValue();
      await codes.fill('ABC');
      // Past the pattern, as a browser without it (or a typed URL) would send it.
      await form.evaluate((element: HTMLFormElement) => {
        element.noValidate = true;
      });
      const letter = page.waitForRequest((request) => new URL(request.url()).pathname === `${coverage}/letter`);
      await submit.click();
      await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}?refused=invalid&fields=codes&payer=${payerId}&contract=${contractId}&codes=ABC`);
      // The route answered the navigation with 303 back to its page, private and never cached, never a JSON body.
      const refused = await (await letter).response();
      expect(refused?.status()).toBe(303);
      expect(refused?.headers()['cache-control']).toMatch(/private.*no-store|no-store.*private/);
      expect(refused?.headers()['location']).toMatch(new RegExp(`^${coverage}\\?refused=invalid`));
      await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
      await expect(codes).toHaveValue('ABC');
      await expect(codes).toHaveAttribute('aria-invalid', 'true');
      await expect(codes).toHaveAttribute('aria-describedby', 'letter-codes-error letter-codes-hint');
      await expect(codes).toHaveAccessibleDescription(
        'Error: Procedure codes: enter five-character codes separated by commas, such as 97110, 97530, or leave the field blank. Five-character codes separated by commas, such as 97110, 97530. Leave blank to ask for the whole schedule.',
      );
      await expect(codes).toBeFocused();
      await expect(payer).toHaveValue(payerId);
      await expect(contract).toHaveValue(contractId);
      await expect(payer).not.toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('[data-download-refusal]')).toHaveCount(0);
      expectNoPhiIn(page);
      await expectAccessible(page, 'Coverage, a letter refused for its codes');
      await atPhoneWidth(page, 'Coverage, a letter refused for its codes');
    });

    await test.step('a contract that is not the payer’s, and a payer that is not the practice’s, come back marked on their own controls', async () => {
      await page.goto(coverage);
      await payer.selectOption({ label: PAYER_NONE });
      await contract.selectOption({ label: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
      await codes.fill('97110');
      await submit.click();
      await expect(page).toHaveURL(new RegExp(`${coverage}\\?refused=invalid&fields=contract&`));
      await expect(contract).toHaveAttribute('aria-invalid', 'true');
      await expect(contract).toHaveAccessibleDescription('Error: The payer’s contract: choose one of this payer’s contracts, or None named.');
      await expect(contract).toBeFocused();
      await expect(payer.locator('option:checked')).toHaveText(PAYER_NONE);
      await expect(codes).toHaveValue('97110');
      await expect(codes).not.toHaveAttribute('aria-invalid', 'true');
      await expectAccessible(page, 'Coverage, a letter refused for its contract');

      // A link to the letter for an ID the practice has no payer of: the page, never the ID, says which control.
      await page.goto(`${coverage}/letter?payer=${NO_PAYER}&codes=97110`);
      await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}?refused=not_found&payer=${NO_PAYER}&codes=97110`);
      await expect(payer).toHaveAttribute('aria-invalid', 'true');
      await expect(payer).toHaveAccessibleDescription('Error: Payer: choose one of the payers listed.');
      await expect(payer).toBeFocused();
      await expect(payer.locator('option:checked')).toHaveText(PAYER_NONE);
      await expect(page.locator('main')).not.toContainText(NO_PAYER);
    });

    await test.step('the pattern stops a bad code before the round trip and takes good ones', async () => {
      await page.goto(coverage);
      await codes.fill('ABC');
      expect(await codes.evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(true);
      const sent: string[] = [];
      const letters = (request: Request) => {
        if (new URL(request.url()).pathname === `${coverage}/letter`) {
          sent.push(request.url());
        }
      };
      page.on('request', letters);
      try {
        await submit.click();
        // The browser's own check refused it and moved the focus to the field; nothing was sent.
        await expect(codes).toBeFocused();
        expect(sent).toEqual([]);
        await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}`);
      } finally {
        page.off('request', letters);
      }
      await codes.fill('97110, 97530');
      expect(await codes.evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(false);
      expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(true);
    });

    await test.step('a good letter downloads, and the page stays', async () => {
      await payer.selectOption({ label: PAYER_Q });
      const [download] = await Promise.all([page.waitForEvent('download'), submit.click()]);
      expect(download.suggestedFilename()).toMatch(/^request-to-payer-[0-9a-f-]{36}\.txt$/);
      const body = readFileSync(await download.path(), 'utf8');
      expect(body).toContain('97110');
      expect(body).toContain('97530');
      await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
      await expect(codes).toHaveValue('97110, 97530');
    });

    const reportPath = await test.step('March is priced and triaged, and the manager generates its audit report', async () => {
      await pricedAndTriaged({ practiceId: practice, managerKey: 'refusals-manager', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
      await page.goto(`/p/${practice}/reports`);
      const generate = page.getByRole('region', { name: 'Generate an audit report' });
      await generate.getByLabel('Pricing run').selectOption({ label: '2026-03-01 to 2026-03-31 (release 900001)' });
      await generate.getByRole('button', { name: 'Generate the report' }).click();
      await expect(page).toHaveURL(new RegExp(`/p/${practice}/reports/[0-9a-f-]{36}$`));
      await generated(page);
      return new URL(page.url()).pathname;
    });

    await test.step('a viewer who opens the line CSV as a page lands on the report with the refusal said and focused; a script keeps the JSON refusal', async () => {
      const context = await browser.newContext();
      const viewer = await context.newPage();
      try {
        await signInWithTotp(viewer, 'refusals-viewer');
        const sent = viewer.waitForResponse((response) => new URL(response.url()).pathname === `${reportPath}/csv`);
        await viewer.goto(`${reportPath}/csv`);
        expect((await sent).headers()['location']).toBe(`${reportPath}?refused=forbidden`);
        const notice = viewer.locator('[data-download-refusal="forbidden"]');
        // Once shown, the refusal leaves the address bar, so a reload shows the report as it is now; the notice stays.
        await expect(viewer).toHaveURL(`${E2E_ORIGIN}${reportPath}`);
        await expect(notice).toHaveAttribute('role', 'alert');
        await expect(notice).toContainText('Not available to your role');
        await expect(notice).toContainText('Your role cannot download this file. Users and roles are managed by your organization’s administrator.');
        await expect(notice).toBeFocused();
        expectNoPhiIn(viewer);
        await expectAccessible(viewer, 'An audit report, its line CSV refused to a viewer');
        await viewer.reload();
        await expect(viewer.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(notice).toHaveCount(0);
        // A script's request (no Fetch Metadata, Accept */*) is answered as before: 403 and the JSON outcome.
        const script = await viewer.request.get(`${reportPath}/csv`);
        expect(script.status()).toBe(403);
        expect(script.headers()['content-type']).toContain('application/json');
        expect(await script.json()).toMatchObject({ status: 'forbidden' });
      } finally {
        await context.close();
      }
    });
  } finally {
    await local.close();
  }
});
