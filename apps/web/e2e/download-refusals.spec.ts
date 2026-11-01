import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Locator, type Page, type Request, expect, test } from '@playwright/test';
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
 * the payer's is stopped in the browser in the product's words and, sent past it, comes back marked on its control, and
 * once corrected the letter downloads with its marks cleared and the refusal out of the address bar, so a reload shows
 * the plain form; a payer that is not the practice's comes back marked and unanswered, its mark cleared as a payer is
 * chosen; a refusal the form cannot mark is said in its place and takes the letter's entries out of the address bar
 * with it; the pattern stops the bad code before the round trip and takes good ones; and a good letter downloads while
 * the page stays. A refused file of the Reports list comes back beside that list, and the list leaves the address bar
 * with the refusal. Then a viewer who opens the audit report's line CSV as a page lands on the report with the refusal
 * said and focused, and still there after a router refresh that never writes the refusal back, while a script's
 * request keeps the JSON refusal. On Uploads, a receipt's report downloads in place, its fetch said while it runs,
 * and its refusal is said above the receipts, focused, while the page stays (a batch still being sent would stay with
 * it); and a viewer who opens a packet's PDF lands on the packet's permission state, told who downloads its files, with
 * the refusal out of the address bar. Synthetic data only.
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
/** An opaque ID that names no generated report of the practice. */
const NO_DOCUMENT = '00000000-0000-4000-8000-00000000d1e1';
/** Opaque IDs of a case and a packet version: a role refused the export is refused before either is read. */
const NO_CASE = '00000000-0000-4000-8000-00000000d1e2';
const NO_VERSION = '00000000-0000-4000-8000-00000000d1e3';

/**
 * A refused control's mark as the browser draws it, against the danger token's colour: ADR 0077 D3's 2 px border, from
 * the stylesheet's one rule for every aria-invalid control, beside the words of its "Error:" line.
 */
async function expectDangerMark(control: Locator): Promise<void> {
  const mark = await control.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--destructive)';
    document.body.append(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(element);
    return { width: style.borderTopWidth, color: style.borderTopColor, danger };
  });
  expect(mark.width).toBe('2px');
  expect(mark.color).toBe(mark.danger);
}

/** Does what is asked of the letter's form and holds that the browser sent no letter for it (its own checks stopped it). */
async function sendsNoLetter(page: Page, coverage: string, act: () => Promise<void>): Promise<void> {
  const sent: string[] = [];
  const letters = (request: Request) => {
    if (new URL(request.url()).pathname === `${coverage}/letter`) {
      sent.push(request.url());
    }
  };
  page.on('request', letters);
  try {
    await act();
    expect(sent).toEqual([]);
    await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}`);
  } finally {
    page.off('request', letters);
  }
}

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

    const payerQ = await test.step('a code past the browser’s pattern comes back to Coverage, kept, marked, described and focused, and the page is accessible', async () => {
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
      // The message says what is wrong, then the hint gives the format. The line under the field is FieldError's, as
      // under every field (ADR 0077 D3): its "Error:" is shown but aria-hidden, so the description is the message alone.
      await expect(codes).toHaveAccessibleDescription(
        'Each code must be five letters or digits. Five-character codes separated by commas, such as 97110, 97530. Leave blank to ask for the whole schedule.',
      );
      await expect(form.locator('[data-field-error]:has(#letter-codes-error)')).toContainText('Error:');
      await expectDangerMark(codes);
      await expect(codes).toBeFocused();
      await expect(payer).toHaveValue(payerId);
      await expect(contract).toHaveValue(contractId);
      await expect(payer).not.toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('[data-download-refusal]')).toHaveCount(0);
      expectNoPhiIn(page);
      await expectAccessible(page, 'Coverage, a letter refused for its codes');
      await atPhoneWidth(page, 'Coverage, a letter refused for its codes');
      return payerId;
    });

    /** Whether the contract select is held to the payer chosen (LetterContractCheck's custom validity). */
    const contractHeld = () => contract.evaluate((select: HTMLSelectElement) => select.validity.customError);

    await test.step('a contract that is not the payer’s is stopped in the browser, and sent past it comes back marked on its control', async () => {
      await page.goto(coverage);
      await payer.selectOption({ label: PAYER_NONE });
      await contract.selectOption({ label: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
      await codes.fill('97110');
      // Held to the payer chosen, in the words its refusal would be marked with; the browser sends nothing and moves the focus there.
      await expect.poll(contractHeld).toBe(true);
      expect(await contract.evaluate((select: HTMLSelectElement) => select.validationMessage)).toBe('Choose one of this payer’s contracts, or None named.');
      await sendsNoLetter(page, coverage, async () => {
        await submit.click();
        await expect(contract).toBeFocused();
      });
      // The contract's own payer frees it, and another holds it again.
      await payer.selectOption({ label: PAYER_Q });
      expect(await contractHeld()).toBe(false);
      await payer.selectOption({ label: PAYER_NONE });
      expect(await contractHeld()).toBe(true);
      // Past the browser, as one without script would send it, the route refuses the pair and the page marks the contract.
      await form.evaluate((element: HTMLFormElement) => {
        element.noValidate = true;
      });
      await submit.click();
      await expect(page).toHaveURL(new RegExp(`${coverage}\\?refused=invalid&fields=contract&`));
      await expect(contract).toHaveAttribute('aria-invalid', 'true');
      await expect(contract).toHaveAccessibleDescription('Choose one of this payer’s contracts, or None named.');
      // The shared SelectField's select takes the same mark as every refused control.
      await expectDangerMark(contract);
      await expect(contract).toBeFocused();
      await expect(payer.locator('option:checked')).toHaveText(PAYER_NONE);
      await expect(codes).toHaveValue('97110');
      await expect(codes).not.toHaveAttribute('aria-invalid', 'true');
      // The kept pair is held in the browser at once, so the same letter is not sent again.
      await expect.poll(contractHeld).toBe(true);
      await expectAccessible(page, 'Coverage, a letter refused for its contract');
    });

    await test.step('once corrected, the letter downloads with its marks cleared and the refusal out of the address bar, and a reload shows the plain form', async () => {
      // A refusal of the pair, answered by changing the payer: once the pair holds, the contract's mark clears before
      // anything is sent (LetterMarks reads the validity LetterContractCheck has just set; UX-DLR-17).
      await payer.selectOption({ label: PAYER_Q });
      expect(await contractHeld()).toBe(false);
      await expect(contract).not.toHaveAttribute('aria-invalid');
      // FieldError's whole line goes, its icon and "Error:" with the message.
      await expect(page.locator('[data-field-error]:has(#letter-contract-error)')).toBeHidden();
      await expect(contract).toHaveAccessibleDescription('');
      const [download] = await Promise.all([page.waitForEvent('download'), submit.click()]);
      expect(download.suggestedFilename()).toMatch(/^request-to-payer-[0-9a-f-]{36}\.txt$/);
      await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}`);
      await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
      await expect(form.locator('[data-field-error]:visible')).toHaveCount(0);
      await expect(contract).not.toHaveAttribute('aria-describedby');
      await expect(contract).toHaveAccessibleDescription('');
      await expect(codes).toHaveValue('97110');
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
      await expect(page.locator('[aria-invalid="true"], [data-field-error], [data-download-refusal]')).toHaveCount(0);
      await expect(payer.locator('option:checked')).toHaveText(PAYER_NONE);
      await expect(contract).toHaveValue('');
      await expect(codes).toHaveValue('');
    });

    await test.step('a payer that is not the practice’s comes back marked and unanswered, and choosing one clears the mark', async () => {
      // A link to the letter for an ID the practice has no payer of: the page, never the ID, says which control.
      await page.goto(`${coverage}/letter?payer=${NO_PAYER}&codes=97110`);
      await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}?refused=not_found&payer=${NO_PAYER}&codes=97110`);
      await expect(payer).toHaveAttribute('aria-invalid', 'true');
      await expect(payer).toHaveAccessibleDescription('Choose one of the payers listed.');
      await expect(payer).toBeFocused();
      // Never a listed payer under the mark: the choice is unanswered, and the browser holds the letter until it is made.
      await expect(payer.locator('option:checked')).toHaveText('Choose a payer');
      expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false);
      await expect(page.locator('main')).not.toContainText(NO_PAYER);
      // The mark clears as the person chooses, before anything is sent (chosen again until the page's script has hydrated).
      await expect(async () => {
        await payer.selectOption({ label: PAYER_Q });
        await expect(payer).not.toHaveAttribute('aria-invalid', { timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      // FieldError's whole line goes, its icon and "Error:" with the message.
      await expect(page.locator('[data-field-error]:has(#letter-payer-error)')).toBeHidden();
      await expect(payer).toHaveAccessibleDescription('');
      await expect(codes).toHaveValue('97110');
    });

    await test.step('a refusal the form cannot mark is said in its place, and the letter’s entries leave the address bar with it', async () => {
      await page.goto(`${coverage}?refused=rate_limited&retry=3&payer=${payerQ}&codes=97110`);
      const notice = page.locator('[data-download-refusal="rate_limited"]');
      await expect(notice).toBeFocused();
      await expect(notice).toContainText('Not downloaded');
      await expect(notice).toContainText('Too many downloads in a short time. Wait 3 minutes and try again.');
      await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
      // Once shown, the refusal and the entries kept beside it leave the address bar; the notice and the entries stay on screen.
      await expect(page).toHaveURL(`${E2E_ORIGIN}${coverage}`);
      await expect(notice).toBeVisible();
      await expect(payer).toHaveValue(payerQ);
      await expect(codes).toHaveValue('97110');
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Coverage' })).toBeVisible();
      await expect(page.locator('[data-download-refusal]')).toHaveCount(0);
      await expect(payer.locator('option:checked')).toHaveText(PAYER_NONE);
      await expect(codes).toHaveValue('');
    });

    await test.step('the pattern stops a bad code before the round trip and takes good ones', async () => {
      await page.goto(coverage);
      await codes.fill('ABC');
      expect(await codes.evaluate((input: HTMLInputElement) => input.validity.patternMismatch)).toBe(true);
      await sendsNoLetter(page, coverage, async () => {
        await submit.click();
        // The browser's own check refused it and moved the focus to the field.
        await expect(codes).toBeFocused();
      });
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

    await test.step('a refused file of the Reports list comes back beside that list, and the list leaves the address bar with the refusal', async () => {
      const reports = `/p/${practice}/reports`;
      await page.goto(`${reports}/documents/${NO_DOCUMENT}/pdf?from=list`);
      const notice = page.getByRole('region', { name: 'Generated reports', exact: true }).locator('[data-download-refusal="not_found"]');
      await expect(notice).toBeFocused();
      await expect(notice).toContainText('Not downloaded');
      await expect(page.locator('[data-download-refusal]')).toHaveCount(1);
      await expect(page).toHaveURL(`${E2E_ORIGIN}${reports}`);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
      await expect(page.locator('[data-download-refusal]')).toHaveCount(0);
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
        await expect(notice).toContainText('Not downloaded');
        await expect(notice).toContainText('Your role cannot download this file. Ask your organization’s administrator, who manages users and roles.');
        await expect(notice).toBeFocused();
        expectNoPhiIn(viewer);
        await expectAccessible(viewer, 'An audit report, its line CSV refused to a viewer');
        // A router refresh (a live export's poll, a settled upload batch) asks for the page as it is now, never the
        // refusal, and leaves the address bar clean; the notice stays on screen, focused, while the viewer is on the page.
        const refreshed = viewer.waitForRequest((request) => request.headers()['rsc'] === '1' && new URL(request.url()).pathname === reportPath);
        await viewer.evaluate(() => {
          (window as unknown as { next: { router: { refresh(): void } } }).next.router.refresh();
        });
        expect(new URL((await refreshed).url()).searchParams.has('refused')).toBe(false);
        await viewer.waitForLoadState('networkidle');
        await expect(viewer).toHaveURL(`${E2E_ORIGIN}${reportPath}`);
        await expect(notice).toBeVisible();
        await expect(notice).toBeFocused();
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

    await test.step('a receipt’s report downloads in place on Uploads, its fetch said while it runs, and its refusal is said above the receipts, focused, while the page stays', async () => {
      const uploads = `/p/${practice}/uploads`;
      await page.goto(uploads);
      const report = page.getByRole('region', { name: 'Receipts', exact: true }).getByRole('row').filter({ hasText: '835 remittance' }).getByRole('link', { name: 'Report' }).first();
      // A navigation would load another document and drop this mark, as it would cut off a batch still being sent.
      await page.evaluate(() => {
        (window as unknown as { stayed?: boolean }).stayed = true;
      });
      const stayed = () => page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed === true);
      const [saved] = await Promise.all([page.waitForEvent('download'), report.click()]);
      expect(saved.suggestedFilename()).toMatch(/^receipt-[0-9a-f-]{36}\.csv$/);
      await expect(page).toHaveURL(`${E2E_ORIGIN}${uploads}`);
      expect(await stayed()).toBe(true);
      // The route's answer to a script once the export limit is spent (outcomeResponse: 429, Retry-After and the
      // outcome), stood in for here so the limit every download of this run shares stays whole, and held until the
      // fetch still running has been read on screen.
      const report429 = (url: URL) => url.pathname.endsWith('/report');
      let answer = () => {};
      const answered = new Promise<void>((resolve) => {
        answer = () => {
          resolve();
        };
      });
      await page.route(report429, async (route) => {
        await answered;
        await route.fulfill({ status: 429, headers: { 'retry-after': '125' }, contentType: 'application/json', body: JSON.stringify({ status: 'rate_limited', retryAfterSeconds: 125 }) });
      });
      await report.click();
      // While the file is fetched, the place above the receipts says so and the link is busy (UX-DLR-16).
      const fetching = page.getByRole('status').filter({ hasText: 'Downloading the file…' });
      await expect(fetching).toBeVisible();
      await expect(report).toHaveAttribute('aria-busy', 'true');
      answer();
      const notice = page.locator('[data-download-refusal="rate_limited"]');
      await expect(notice).toBeFocused();
      // The refusal takes the place, and the status says nothing beside it.
      await expect(page.getByText('Downloading the file…')).toHaveCount(0);
      await expect(report).not.toHaveAttribute('aria-busy');
      await expect(notice).toHaveAttribute('role', 'alert');
      await expect(notice).toContainText('Not downloaded');
      await expect(notice).toContainText('Too many downloads in a short time. Wait 3 minutes and try again.');
      await expect(page).toHaveURL(`${E2E_ORIGIN}${uploads}`);
      expect(await stayed()).toBe(true);
      await expectAccessible(page, 'Uploads, a receipt’s report refused in place');
      // On a phone the receipts scroll in their own region (docs/adr/0078), and Safari focuses a clicked link's nearest
      // focusable ancestor, that region, not the link. Chromium focuses the link, so the test puts the focus where
      // Safari puts it and clicks the link without moving it: the refusal still takes the focus, above the scroller.
      const wide = page.viewportSize();
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        const scroller = page.getByRole('region', { name: 'Receipts, scrolls sideways', exact: true });
        await scroller.focus();
        await report.dispatchEvent('click');
        await expect(notice).toBeFocused();
        await expect(scroller.locator('[data-download-refusal]')).toHaveCount(0);
        await expect(page).toHaveURL(`${E2E_ORIGIN}${uploads}`);
        expect(await stayed()).toBe(true);
      } finally {
        if (wide !== null) {
          await page.setViewportSize(wide);
        }
      }
      // The next file saved takes the notice away.
      await page.unroute(report429);
      await Promise.all([page.waitForEvent('download'), report.click()]);
      await expect(page.locator('[data-download-refusal]')).toHaveCount(0);
      expect(await stayed()).toBe(true);
    });

    await test.step('a viewer who opens a packet’s PDF lands on the packet’s permission state, told who downloads its files, and the refusal leaves the address bar', async () => {
      const context = await browser.newContext();
      const viewer = await context.newPage();
      try {
        await signInWithTotp(viewer, 'refusals-viewer');
        const packet = `/p/${practice}/cases/${NO_CASE}/packet`;
        await viewer.goto(`${packet}/${NO_VERSION}/pdf`);
        const state = viewer.locator('[data-state="permission"]');
        await expect(state).toContainText('The packet’s PDF and CSV hold line-level PHI, which your role cannot download: a billing manager or a firm principal downloads them.');
        await expect(state).not.toContainText('an analyst');
        await expect(viewer).toHaveURL(`${E2E_ORIGIN}${packet}`);
        await expect(viewer.locator('[data-download-refusal]')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  } finally {
    await local.close();
  }
});
