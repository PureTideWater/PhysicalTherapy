import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { tagline } from '@paidwhole/brand/tokens';
import { type Page, expect, test } from '@playwright/test';
import { cents, formatUsd } from '@tp/money';

import { ATTRIBUTION_COOKIE } from '../src/lib/http/attribution';
import { MEDICARE_FIGURE_LABEL, REDUCED_FIGURE_LABEL, WITHIN_REDUCTION_RANGE } from '../src/lib/screening/labels';
import { KEPT_SUMMARY, REQUEST_AUDIT_KEPT, SENT_KEPT, convertKept } from '../src/lib/screening/retention';
import { expectAccessible } from './a11y';
import { personaEmail } from '../scripts/synthetic-personas';
import { registerKeyAndSignIn, withDatabase } from './helpers';
import { outboxFor } from './outbox';
import { PREPARED_SPLIT } from './split';
import {
  CLEAN_ROWS,
  OUTSIDE_LEFT_OUT,
  OUTSIDE_ROWS,
  SCREENING_HEADER,
  SCREENING_ZIP,
  SCREENING_ZIP_PLUS_FOUR,
  SMALL_LEFT_OUT,
  SMALL_ROWS,
  dateOfServiceCsv,
  expireScreeningsOnce,
  memberIdCsv,
  priceScreeningsOnce,
  resultLinkIn,
  screeningRowsCsv,
} from './screening';

/**
 * The free screening in the browser (Change Order 001, CO-04; reconciliation-001, D11 and D18 to D21; test matrix
 * SCR-01, SCR-02, SCR-03 and SCR-05 to SCR-07, the screens' side). A contract specialist approves the
 * place-of-service split in the console. A prospect, with no account, fills the form; a file with a Member ID
 * column, and one with a date-of-service column, are refused in the browser with the column named, and nothing is
 * sent. The page states the template's rules (each row at least 11 claim lines, and denied lines left out of every
 * total and claim count), and the template it downloads carries them as note lines above its header, in plain ASCII.
 * That template, filled with SYNTHETIC totals and its notes kept, with two rows of fewer than 11 claim lines
 * (SCR-07): the browser leaves those two out and says how many rows, claim lines and dollars it left out, and sends
 * the rest as its rows (nothing of the two in the request, and no hash of the file, which holds them); the database
 * keeps the SHA-256 of the rows it stored; the worker's sweep prices it (an operator pool
 * on the e2e database) and emails the link to the local outbox. The link opens the result: the Medicare figures
 * under D19's label and the fully reduced ones under theirs (the owner's rulings of 2026-10-18), the anomalies with
 * the database's standings (G01's 97110 within the range of the reduction across codes, 97140 an anomaly), the
 * coverage and the dollars that cannot be priced without a contract, the rows left out before sending as the browser
 * counted them, the database's own sums to the cent, with no owed, underpaid or recovered and no tagline,
 * accessible, and with no sideways scroll at 390 and 1280 px. Converting it records an audit request and the
 * screening_converted event; once the screening is past its 30 days the link opens nothing, the expiry job deletes
 * it, and the conversion's event remains. Synthetic data only.
 *
 * PR 6b (docs/adr/0064; SCR-15, SCR-16): the split the specialist approves is the one prepare.ts approved before any
 * spec (every practice's default for a place it has not set); a Medicare row in a quarter outside the loaded content
 * is left out in the browser and counted, with the loaded quarters named, and the result says so; and a ZIP that
 * needs its ZIP+4 is asked for it, while one whose ZIP+4 list is not loaded is told so, never to check the digits.
 *
 * Audit #57 (the founder's rulings of 2026-10-20; SCR-10 to SCR-13, the screens' side): the prospect lands with
 * campaign codes and a paid click in the URL, and the proxy sets the first-party attribution cookie (the codes and the
 * kind of click, never the click ID); the form asks how they heard of us and the referring firm; the database keeps
 * them with the screening and writes its counts-only outcome; the email and every page say what is kept; the result's
 * GET records no open, a person's use after two visible seconds does; the conversion carries the attribution and
 * from_screening, keeps the screening's summary with the request and shows the converted wording; the outcome and the
 * summary outlive the expiry; the audit request form keeps the same attribution; and the console declines a request
 * with its reason.
 */

const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;
const PRACTICE = 'SYNTHETIC SCREENING CLINIC';

/** The prospect's address: one per run, so the outbox and the rate limit's account are this run's. */
const CONTACT = `screening-${randomBytes(4).toString('hex')}@clinic-e2e.synthetic.test`;
const FIRM = 'SYNTHETIC BILLING PARTNERS';
/** The landing URL: campaign codes as a newsletter's link carries them, and a SYNTHETIC search click ID. */
const LANDING = '/screening?utm_source=Newsletter&utm_medium=email&utm_campaign=Fall+Launch&gclid=SYNTHETICCLICK123';
const CAMPAIGN = 'fall-launch';
/** A campaign code no one listed: a SYNTHETIC person's name typed into a link, which has a code's shape once normalised. */
const UNLISTED_LANDING = '/request-audit?utm_source=Newsletter&utm_medium=email&utm_campaign=Jane+Doe+Follow+Up';
const UNLISTED = 'jane-doe-follow-up';

/**
 * Lists a campaign as the console's action will (PR 7 builds its screen): console_register_marketing_campaign, as the
 * application role, by the journey's platform administrator (the screening-admin persona the seed creates). Once: a
 * retried run finds it listed.
 */
async function listCampaign(code: string, label: string): Promise<void> {
  await withDatabase(async (client) => {
    if ((await client.query('SELECT 1 FROM marketing_campaign WHERE code = $1', [code])).rows.length > 0) {
      return;
    }
    const administrator = (await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [personaEmail('screening-admin')])).rows[0]?.id;
    expect(administrator, 'the seeded platform administrator').toBeDefined();
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE tp_app');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [administrator]);
      await client.query('SELECT console_register_marketing_campaign($1, $2)', [code, label]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    const registered = await client.query("SELECT e.actor_id FROM audit_event e JOIN marketing_campaign c ON c.id = e.object_id WHERE e.action = 'marketing_campaign_registered' AND c.code = $1", [code]);
    expect(registered.rows).toEqual([{ actor_id: administrator }]);
  });
}

async function fillProspect(page: Page): Promise<void> {
  await page.getByLabel('Practice name').fill(PRACTICE);
  await page.getByLabel('State').selectOption('MN');
  await page.getByLabel('ZIP code', { exact: true }).fill(SCREENING_ZIP);
  await page.getByLabel('Work email').fill(CONTACT);
  await page.getByLabel('How did you hear about us?').selectOption('billing_firm');
  await page.getByLabel('Referring billing firm').fill(FIRM);
}

/** The screening's run, by the prospect's address (kept while the screening is). */
const RUN_OF_CONTACT = 'SELECT r.* FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1';

async function noSidewaysScroll(page: Page, width: number, what: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll, `${what} at ${String(width)} px scrolls sideways`).toBeLessThanOrEqual(inner);
}

test('a specialist approves the split; a file with patient information is refused in the browser; a clean file, its small rows left out, is priced, emailed, opened, converted and expires (SCR-01 to SCR-07)', async ({ browser }) => {
  test.setTimeout(240_000);

  await test.step('a contract specialist approves the screening’s place-of-service split in the console', async () => {
    const context = await browser.newContext();
    const specialist = await context.newPage();
    try {
      await registerKeyAndSignIn(specialist, 'screening-specialist');
      await specialist.goto('/console/screening');
      await expect(specialist.getByRole('heading', { level: 1, name: 'Place-of-service split' })).toBeVisible();
      await expect(specialist.getByRole('navigation', { name: 'Internal console' }).getByRole('link', { name: 'Place-of-service split' })).toHaveAttribute('aria-current', 'page');
      // Every practice's default too, since PR 6b: the page says what approving changes.
      await expect(specialist.locator('[data-split-warning]')).toHaveText('Approving changes every place a practice has not set, from each practice’s next run, and the free screening’s split.');
      await specialist.getByLabel('Facility places of service', { exact: true }).fill('21, 22, 23');
      await specialist.getByLabel('Non-facility places of service', { exact: true }).fill('11 12');
      await specialist.getByRole('button', { name: 'Approve this split' }).click();
      await expect(specialist).toHaveURL(/\/console\/screening\?approved=1$/);
      await expect(specialist.locator('[data-state="approved"]')).toContainText('Split approved');
      const current = specialist.getByRole('table', { name: 'Approved splits' }).locator('[data-split="in-force"]');
      await expect(current).toContainText('21 22 23');
      await expect(current).toContainText('11 12');
      await expectAccessible(specialist, 'the screening split');
      const recorded = await withDatabase(async (client) => (await client.query<{ approved: string }>("SELECT count(*)::text AS approved FROM audit_event WHERE action = 'screening_split_approved' AND object_type = 'screening_place_of_service_split'")).rows[0]?.approved);
      expect(Number(recorded)).toBeGreaterThanOrEqual(1);
      // The split in force is the one prepare.ts approved before any spec ran, setting for setting: approving it again
      // changes no place another spec's run fills.
      const splits = await withDatabase(async (client) => (await client.query<{ settings: unknown }>('SELECT settings FROM place_of_service_split ORDER BY approved_at, id')).rows.map((row) => row.settings));
      expect(splits.length).toBeGreaterThanOrEqual(2);
      expect(splits.at(-1)).toEqual(PREPARED_SPLIT);
      expect(splits[0]).toEqual(PREPARED_SPLIT);
    } finally {
      await context.close();
    }
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const posted: string[] = [];
  const bodies: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') {
      posted.push(new URL(request.url()).pathname);
      bodies.push(request.postData() ?? '');
    }
  });

  let template = Buffer.alloc(0);
  await test.step('landing with campaign codes and a paid click sets the first-party cookie once: the codes and the kind of click, never the click ID (SCR-12)', async () => {
    // The founder lists the campaign, so every row may keep it (a code no one listed is kept as other; the
    // founder's ruling of 2026-10-21).
    await listCampaign(CAMPAIGN, 'SYNTHETIC fall launch');
    await page.goto(LANDING);
    const cookie = (await context.cookies()).find((item) => item.name === ATTRIBUTION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(decodeURIComponent(cookie?.value ?? '')).toBe(`s=newsletter&m=email&c=${CAMPAIGN}&k=paid_search`);
    expect(cookie?.value).not.toContain('SYNTHETICCLICK123');
    expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(29 * 86_400);
    // A later landing with other codes changes nothing: the first visit wins.
    await page.goto('/screening?utm_source=search&utm_medium=cpc');
    expect((await context.cookies()).find((item) => item.name === ATTRIBUTION_COOKIE)?.value).toBe(cookie?.value);
  });

  await test.step('a Member ID column, and a date-of-service column, are refused in the browser with the column named; nothing is sent (SCR-01)', async () => {
    await page.goto('/screening');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A free screening of your allowed amounts');
    await expect(page.locator('[data-slot="public-header"] [data-slot="lockup"]')).toBeVisible();
    // The template's rules, in plain words: the claim-line floor and denied lines left out (the founder's rulings of 2026-10-18).
    const rules = page.getByRole('list', { name: 'The template’s rules' });
    await expect(rules.locator('[data-rule="claim-floor"]')).toContainText('Each row sums at least 11 claim lines.');
    await expect(rules.locator('[data-rule="claim-floor"]')).toContainText('tells you how many rows, claim lines and dollars it left out');
    await expect(rules.locator('[data-rule="denied-lines"]')).toContainText('Leave denied lines out of every total');
    await expect(rules.locator('[data-rule="denied-lines"]')).toContainText('A denial is not a rate variance');
    await expect(page.locator('[data-slot="template-hint"]')).toContainText(
      'The template’s first lines state its rules: each row sums at least 11 claim lines, and denied lines are left out of every total and claim count.',
    );
    // The template file states them too, as note lines above its header, in plain ASCII so a spreadsheet shows them as written.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the column template' }).click();
    const downloaded = await download;
    expect(downloaded.suggestedFilename()).toBe('paidwhole-screening-template.csv');
    template = await readFile(await downloaded.path());
    const templateText = template.toString('utf8');
    expect(templateText).toMatch(/^[\x20-\x7e\r\n]*$/);
    expect(templateText).toContain('Each row sums at least 11 claim lines.');
    expect(templateText).toContain('tells you how many rows, claim lines and dollars it left out');
    expect(templateText).toContain('Leave denied lines out of every total and claim count');
    expect(templateText).toContain('A denial is not a rate variance');
    const lines = templateText.split('\r\n');
    expect(lines.at(-2)).toBe(SCREENING_HEADER.join(','));
    expect(lines.slice(0, -2).every((line) => line.startsWith('"# '))).toBe(true);
    await expectAccessible(page, 'the screening page');
    await fillProspect(page);
    // The file input has no name: no form submission carries the file.
    await expect(page.getByLabel('File to screen')).not.toHaveAttribute('name', /.*/);
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: memberIdCsv() });
    const refused = page.locator('[data-state="file-refused"]');
    await expect(refused).toContainText('Column 4 (“Member ID”) holds member IDs; remove it and upload again.');
    await expect(refused).not.toContainText('SYNTHMBR');
    await page.getByRole('button', { name: 'Screen the file' }).click();
    await expect(refused).toContainText('Nothing was sent.');
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: dateOfServiceCsv() });
    await expect(refused).toContainText('Column 6 (“DOS”) holds dates of service; remove it and upload again.');
    await page.getByRole('button', { name: 'Screen the file' }).click();
    await expect(refused).toBeVisible();
    expect(posted, 'a refused file sends nothing').toEqual([]);
    const uploads = await withDatabase(async (client) => (await client.query<{ uploads: string }>('SELECT count(*)::text AS uploads FROM screening_prospect WHERE contact_email = $1', [CONTACT])).rows[0]?.uploads);
    expect(uploads).toBe('0');
  });

  // The downloaded template, its notes kept, filled with SYNTHETIC totals.
  const clean = Buffer.concat([template, screeningRowsCsv([...CLEAN_ROWS, ...SMALL_ROWS, ...OUTSIDE_ROWS])]);
  await test.step('the template, filled and its notes kept, is sent as its rows of totals, no hash of the file, its rows of fewer than 11 claim lines left out and counted, and the page says to check the email (SCR-07)', async () => {
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: clean });
    await expect(page.locator('[data-state="file-ready"]')).toContainText(`${String(CLEAN_ROWS.length)} rows of totals`);
    const leftOut = page.locator('[data-state="left-out"]');
    await expect(leftOut).toContainText(
      `Left out: ${String(SMALL_LEFT_OUT.rows)} rows of fewer than 11 claim lines each, ${String(SMALL_LEFT_OUT.claimLines)} claim lines and ${SMALL_LEFT_OUT.allowed} allowed in your file.`,
    );
    await expect(leftOut).toContainText('They are not sent, and no figure includes them');
    // The Medicare row of 2025, outside 900001's loaded content: left out and counted, with the quarters loaded named (SCR-16).
    const outside = page.locator('[data-state="outside-content"]');
    await expect(outside).toHaveText('1 row (12 claim lines, $412.00) in a quarter before 2026-Q1 was left out: PaidWhole has the Medicare content for 2026-Q1 to 2026-Q4 loaded.');
    await expect(outside).toHaveAttribute('data-rows', String(OUTSIDE_LEFT_OUT.rows));
    await page.getByRole('button', { name: 'Screen the file' }).click();
    await expect(page).toHaveURL(/\/screening\?sent=1$/);
    await expect(page.locator('[data-state="sent"]')).toContainText('Check your email');
    await expect(page.locator('[data-state="sent"] [data-copy="kept"]')).toHaveText(SENT_KEPT);
    expect(await page.locator('body').innerText()).not.toMatch(/\/screening\/results\//);
    // The request carried nothing of the rows left out: neither their code nor their quarter, only the three numbers.
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    // Nor a hash of the file, which covers the rows left out.
    const fileHash = createHash('sha256').update(clean).digest('hex');
    for (const body of bodies) {
      expect(body).not.toContain('97164');
      expect(body).not.toContain('2026-Q3');
      expect(body).not.toContain('97035');
      expect(body).not.toContain('2025-Q4');
      expect(body).not.toContain(fileHash);
      expect(body).not.toContain('fileSha256');
    }
    const upload = await withDatabase(
      async (client) =>
        (
          await client.query<{ rows_sha256: string; again: string; row_count: number; status: string; left_out: string[]; outside: string[] }>(
            `SELECT u.rows_sha256, u.row_count, u.status, ARRAY[u.left_out_rows::text, u.left_out_claim_lines::text, u.left_out_allowed_cents::text] AS left_out,
                    ARRAY[u.outside_content_rows::text, u.outside_content_claim_lines::text, u.outside_content_allowed_cents::text] AS outside,
                    (SELECT encode(sha256(convert_to(string_agg(concat_ws(E'\\t', s.procedure_code, array_to_string(s.modifiers, ' '), s.units, s.place_of_service, s.payer_product,
                                                                          s.service_band, s.observed_allowed_cents, s.claim_count), E'\\n' ORDER BY s.row_no), 'UTF8')), 'hex')
                       FROM screening_run r JOIN screening_result s ON s.run_id = r.id WHERE r.upload_id = u.id) AS again
               FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`,
            [CONTACT],
          )
        ).rows,
    );
    // The hash kept is the database's own, of the rows it stored (their canonical form), never the file's.
    expect(upload[0]?.rows_sha256).toBe(upload[0]?.again);
    expect(upload[0]?.rows_sha256).not.toBe(fileHash);
    expect(upload.map(({ again: _again, rows_sha256: _hash, ...rest }) => rest)).toEqual([
      {
        row_count: CLEAN_ROWS.length,
        status: 'accepted',
        left_out: [String(SMALL_LEFT_OUT.rows), String(SMALL_LEFT_OUT.claimLines), SMALL_LEFT_OUT.allowedCents.toString()],
        outside: [String(OUTSIDE_LEFT_OUT.rows), String(OUTSIDE_LEFT_OUT.claimLines), OUTSIDE_LEFT_OUT.allowedCents.toString()],
      },
    ]);
    const small = await withDatabase(
      async (client) =>
        (
          await client.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM screening_result s JOIN screening_run r ON r.id = s.run_id JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
              WHERE p.contact_email = $1 AND (s.procedure_code = '97164' OR s.service_band = '2026-Q3' OR s.claim_count < 11)`,
            [CONTACT],
          )
        ).rows[0]?.n,
    );
    expect(small).toBe('0');
    // The prospect keeps how they heard of us, the cookie's codes and kind of click, and the firm; the outcome keeps
    // bands, the channel the database computed, the listed campaign and the release, never a name, email or ZIP (SCR-10, SCR-12).
    const kept = await withDatabase(
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT p.source, p.utm_source, p.utm_medium, p.utm_campaign, p.paid_click, p.referring_firm, o.stage, o.channel, o.campaign, o.row_band, o.left_out_band,
                    o.release_no IS NOT NULL AS pinned, o.screened_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM') AS this_month, (to_jsonb(o) - 'id' - 'upload_id')::text AS outcome
               FROM screening_prospect p JOIN screening_upload u ON u.prospect_id = p.id JOIN screening_outcome o ON o.upload_id = u.id WHERE p.contact_email = $1`,
            [CONTACT],
          )
        ).rows,
    );
    expect(kept).toEqual([
      expect.objectContaining({
        source: 'billing_firm',
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: CAMPAIGN,
        paid_click: 'paid_search',
        referring_firm: FIRM,
        stage: 'accepted',
        channel: 'email',
        campaign: CAMPAIGN,
        row_band: '1_100',
        left_out_band: '1_100',
        pinned: true,
        this_month: true,
      }),
    ]);
    for (const value of [CONTACT, PRACTICE, SCREENING_ZIP, FIRM]) {
      expect(String(kept[0]?.outcome), value).not.toContain(value);
    }
  });

  let link = '';
  await test.step('the worker prices it and emails the link alone, under the lockup without the tagline (SCR-02)', async () => {
    const swept = await priceScreeningsOnce();
    expect(swept.complete).toBeGreaterThanOrEqual(1);
    const [message, ...more] = outboxFor(CONTACT);
    expect(more).toEqual([]);
    expect(message?.subject).toBe('Your screening is ready | PaidWhole');
    link = resultLinkIn(message as NonNullable<typeof message>);
    expect(message?.body).not.toMatch(/\$|\d{4}-\d{2}-\d{2}/);
    // What is kept once the link closes, in the plain list (decision 7).
    expect(message?.body.replace(/\s+/g, ' ')).toContain('Then we delete the result and the details you gave, unless an audit is requested from it');
    expect(message?.body.replace(/\s+/g, ' ')).toContain('We keep a record of counts that names no one');
    expect(message?.html).not.toContain('tagline');
    expect(`${message?.body ?? ''} ${message?.html ?? ''}`).not.toMatch(FORBIDDEN);
    // The token's hash alone is stored.
    const token = link.slice(link.lastIndexOf('/') + 1);
    const stored = await withDatabase(async (client) => (await client.query<{ hash: string | null }>('SELECT r.result_token_sha256 AS hash FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1', [CONTACT])).rows[0]?.hash);
    expect(stored).toBe(createHash('sha256').update(token).digest('hex'));
  });

  await test.step('the link opens the result: the database’s sums under D19’s label, with no owed, underpaid or recovered and no tagline (SCR-05)', async () => {
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Your free screening' })).toBeVisible();
    // The link's GET records no open, nor do two visible seconds with no one using the page: a mail scanner opens links too (SCR-13).
    const opened = () => withDatabase(async (client) => (await client.query<{ first_opened_at: Date | null }>(`SELECT first_opened_at FROM (${RUN_OF_CONTACT}) r`, [CONTACT])).rows[0]?.first_opened_at ?? null);
    expect(await opened()).toBeNull();
    await page.waitForTimeout(2500);
    expect(await opened()).toBeNull();
    await expect(page.locator('[data-copy="kept"]')).toContainText('Then we delete the result: its rows and figures, and the practice name, ZIP code and email address you gave.');
    await expect(page.locator('[data-copy="kept"]')).toContainText('We keep a record of counts that names no one');
    // Nothing of this screening is kept with a request yet (the database's kept_with).
    await expect(page.locator('[data-copy="kept"]')).toHaveAttribute('data-kept-with', 'none');
    const sums = await withDatabase(async (client) => {
      const { rows } = await client.query<{ disposition: string; expected: string | null; observed: string }>(
        `SELECT s.disposition, sum(s.expected_cents)::text AS expected, sum(s.observed_allowed_cents)::text AS observed
           FROM screening_result s JOIN screening_run r ON r.id = s.run_id JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
          WHERE p.contact_email = $1 GROUP BY s.disposition`,
        [CONTACT],
      );
      return new Map(rows.map((row) => [row.disposition, row]));
    });
    const usd = (text: string | null | undefined) => formatUsd(cents(BigInt(text ?? '0')));
    const observed = (...dispositions: string[]) => usd(String(dispositions.reduce((sum, disposition) => sum + BigInt(sums.get(disposition)?.observed ?? '0'), 0n)));
    expect(sums.has('priced')).toBe(true);
    expect(sums.has('contract_required')).toBe(true);
    await expect(page.locator('[data-figure="priced-expected"] dt')).toHaveText(MEDICARE_FIGURE_LABEL);
    await expect(page.locator('[data-figure="priced-expected"] dd')).toHaveText(usd(sums.get('priced')?.expected));
    await expect(page.locator('[data-figure="priced-allowed"] dd')).toHaveText(observed('priced'));
    await expect(page.locator('[data-figure="file-allowed"] dd')).toHaveText(observed(...sums.keys()));
    // The dollars that cannot be priced without a contract: MA under contract and commercial, $3,000.00 and $4,321.09.
    await expect(page.locator('[data-figure="contract-required-allowed"] dd')).toHaveText('$7,321.09');
    expect(observed('contract_required')).toBe('$7,321.09');
    await expect(page.locator('[data-figure="not-screened-allowed"] dd')).toHaveText('$150.00');
    // The rows left out before sending, as the browser counted them, apart from every figure (SCR-07).
    await expect(page.locator('[data-section="left-out"]')).toContainText('Left out before sending');
    await expect(page.locator('[data-figure="left-out-rows"] dd')).toHaveText(String(SMALL_LEFT_OUT.rows));
    await expect(page.locator('[data-figure="left-out-claim-lines"] dd')).toHaveText(String(SMALL_LEFT_OUT.claimLines));
    await expect(page.locator('[data-figure="left-out-allowed"] dd')).toHaveText(SMALL_LEFT_OUT.allowed);
    // The Medicare row outside the loaded content, not screened, as the browser counted it (SCR-16). Its quarter lies
    // before 2026-Q1 while 900001's content runs to the screening's quarter; the result says "outside" otherwise.
    const notScreened = page.locator('[data-section="outside-content"]');
    await expect(notScreened).toContainText('Not screened: quarters outside the loaded content');
    await expect(notScreened.locator('[data-copy="outside-content"]')).toHaveText(
      /^1 row \(\$412\.00\) in a quarter (?:before 2026-Q1|outside the loaded content) was not screened: PaidWhole has not loaded the Medicare content for it\.$/,
    );
    await expect(page.locator('[data-figure="outside-content-claim-lines"] dd')).toHaveText(String(OUTSIDE_LEFT_OUT.claimLines));
    await expect(page.locator('[data-figure="outside-content-allowed"] dd')).toHaveText(OUTSIDE_LEFT_OUT.allowed);
    await expect(page.locator('[data-figure="could-not-price-allowed"] dd')).toHaveText(observed('unpriced', 'rates_change_in_band'));
    // The row whose place of service the split leaves out is unpriced for that reason.
    await expect(page.locator('[data-coverage="medicare_ffs:unpriced"][data-reason="ENGINE_ERROR"]')).toContainText('The place of service is not in the approved place-of-service split');
    const groups = await withDatabase(async (client) => (await client.query<{ n: string }>(
      `SELECT count(DISTINCT (s.payer_product, s.procedure_code))::text AS n
         FROM screening_result s JOIN screening_run r ON r.id = s.run_id JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
        WHERE p.contact_email = $1 AND s.disposition = 'priced'`,
      [CONTACT],
    )).rows[0]?.n);
    await expect(page.getByRole('table', { name: 'Anomalies by code and payer product' }).locator('tbody tr')).toHaveCount(Number(groups));
    await expect(page.locator('[data-section="anomalies"] [data-slot="status-chip"]').first()).toBeVisible();
    // The fully reduced total under its label: each priced row's lowest figure, summed by the database.
    const lowest = await withDatabase(async (client) => (await client.query<{ lowest: string }>(
      `SELECT sum(coalesce(s.reduced_cents, s.expected_cents))::text AS lowest
         FROM screening_result s JOIN screening_run r ON r.id = s.run_id JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
        WHERE p.contact_email = $1 AND s.disposition = 'priced'`,
      [CONTACT],
    )).rows[0]?.lowest);
    await expect(page.locator('[data-figure="priced-reduced"] dt')).toHaveText(REDUCED_FIGURE_LABEL);
    await expect(page.locator('[data-figure="priced-reduced"] dd')).toContainText(usd(lowest));
    // Each group's status is the database's standing; G01's 97110 lies between its two figures, and 97140 is more than
    // $5 a claim line below its fully reduced figure.
    const token = link.slice(link.lastIndexOf('/') + 1);
    const standings = await withDatabase(async (client) => (await client.query<{ grp: string; standing: string }>(
      "SELECT procedure_code || ':' || payer_product AS grp, standing FROM screening_result_groups($1, 1, 100)",
      [createHash('sha256').update(token).digest('hex')],
    )).rows);
    expect(standings).toEqual(expect.arrayContaining([{ grp: '97110:ma_noncontracted', standing: 'within_reduction_range' }, { grp: '97140:ma_noncontracted', standing: 'anomaly' }]));
    for (const { grp, standing } of standings) {
      await expect(page.locator(`[data-group="${grp}"] [data-slot="status-chip"]`)).toHaveAttribute('data-standing', standing);
    }
    await expect(page.locator('[data-group="97110:ma_noncontracted"] [data-slot="status-chip"]')).toHaveText(WITHIN_REDUCTION_RANGE);
    await expect(page.locator('[data-group="97140:ma_noncontracted"] [data-slot="status-chip"]')).toHaveText('Anomaly: more than $5 a claim line below the fully reduced figure');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toContain(tagline);
    expect(await page.content()).not.toContain(tagline);
    await expectAccessible(page, 'the screening result');
    await noSidewaysScroll(page, 390, 'the screening result');
    await noSidewaysScroll(page, 1280, 'the screening result');
    // A person using the visible page records the first open, once: the run, the outcome's band and an audit event.
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 400);
    await expect.poll(opened, { timeout: 10_000 }).not.toBeNull();
    const first = await withDatabase(
      async (client) =>
        (
          await client.query<{ band: string | null; events: string }>(
            `SELECT o.first_open_band AS band, (SELECT count(*)::text FROM audit_event e WHERE e.action = 'screening_result_opened' AND e.object_id = r.id) AS events
               FROM (${RUN_OF_CONTACT}) r JOIN screening_outcome o ON o.upload_id = r.upload_id`,
            [CONTACT],
          )
        ).rows[0],
    );
    expect(first).toEqual({ band: 'same_day', events: '1' });
  });

  await test.step('converting it records an audit request with its attribution, keeps the screening’s summary with it, and says so (SCR-06, SCR-11)', async () => {
    await expect(page.locator('[data-copy="convert-kept"]')).toHaveText(convertKept('none'));
    await page.getByLabel('Your name').fill('SYNTHETIC CONTACT');
    await page.getByLabel('Locations').fill('2');
    await page.getByLabel('Payers you bill').fill('SYNTHETIC PAYER A\nSYNTHETIC PAYER B');
    await page.getByRole('button', { name: 'Request an audit' }).click();
    await expect(page).toHaveURL(/\/screening\/results\/[a-z]{32}\?requested=1$/);
    await expect(page.locator('[data-state="requested"]')).toContainText('Audit request received');
    const converted = await withDatabase(
      async (client) =>
        (
          await client.query<{ organization_name: string; contact_email: string; events: string }>(
            `SELECT q.organization_name, q.contact_email,
                    (SELECT count(*)::text FROM audit_event e WHERE e.action = 'screening_converted' AND e.object_type = 'prospect_request' AND e.object_id = q.id AND e.actor_kind = 'system') AS events
               FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
               JOIN prospect_request q ON q.id = r.converted_prospect_request_id
              WHERE p.contact_email = $1`,
            [CONTACT],
          )
        ).rows,
    );
    expect(converted).toEqual([{ organization_name: PRACTICE, contact_email: CONTACT, events: '1' }]);
    // The request carries the screening's attribution and from_screening; the summary is kept with it for 12 months;
    // the outcome records the conversion.
    const carried = await withDatabase(
      async (client) =>
        (
          await client.query<Record<string, unknown>>(
            `SELECT q.from_screening, q.source, q.utm_source, q.utm_medium, q.utm_campaign, q.paid_click, q.referring_firm,
                    l.practice_name AS lead_practice, l.expires_at = l.screened_at + interval '12 months' AS twelve_months, l.left_out_claim_lines, o.converted
               FROM (${RUN_OF_CONTACT}) r JOIN prospect_request q ON q.id = r.converted_prospect_request_id
               JOIN screening_lead l ON l.prospect_request_id = q.id JOIN screening_outcome o ON o.upload_id = r.upload_id`,
            [CONTACT],
          )
        ).rows,
    );
    expect(carried).toEqual([
      {
        from_screening: true,
        source: 'billing_firm',
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: CAMPAIGN,
        paid_click: 'paid_search',
        referring_firm: FIRM,
        lead_practice: PRACTICE,
        twelve_months: true,
        left_out_claim_lines: SMALL_LEFT_OUT.claimLines,
        converted: true,
      },
    ]);
    await page.reload();
    await expect(page.locator('[data-state="requested"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request an audit' })).toHaveCount(0);
    await expect(page.locator('[data-copy="kept-converted"]')).toContainText(`Because you requested an audit, we keep ${KEPT_SUMMARY}`);
    await expect(page.locator('[data-copy="kept-converted"]')).toHaveAttribute('data-kept-with', 'own_request');
    await expect(page.locator('[data-copy="kept-converted"]')).toContainText('while we keep your request, yours can be matched to it');
  });

  await test.step('past its 30 days the link opens nothing, the expiry job deletes it, and the conversion’s event remains (SCR-03)', async () => {
    await withDatabase(async (client) => {
      await client.query('BEGIN');
      // The pins never change (screening_run_rules); the test moves the clock past them, as the monitoring journey does.
      await client.query('SET LOCAL session_replication_role = replica');
      const shift = "created_at = created_at - interval '31 days', expires_at = expires_at - interval '31 days'";
      const uploads = 'SELECT u.id FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1';
      await client.query(`UPDATE screening_run SET ${shift} WHERE upload_id IN (${uploads})`, [CONTACT]);
      await client.query(`UPDATE screening_upload SET ${shift} WHERE id IN (${uploads})`, [CONTACT]);
      await client.query(`UPDATE screening_prospect SET ${shift} WHERE contact_email = $1`, [CONTACT]);
      await client.query('COMMIT');
    });
    const response = await page.goto(link);
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-state="screening-not-found"]')).toContainText('This screening link is not open');
    expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN);
    expect((await expireScreeningsOnce()).prospects).toBeGreaterThanOrEqual(1);
    const left = await withDatabase(async (client) => {
      const prospects = (await client.query<{ n: string }>('SELECT count(*)::text AS n FROM screening_prospect WHERE contact_email = $1', [CONTACT])).rows[0]?.n;
      const converted = (await client.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_event e JOIN prospect_request q ON q.id = e.object_id WHERE e.action = 'screening_converted' AND q.contact_email = $1", [CONTACT])).rows[0]?.n;
      return { prospects, converted };
    });
    expect(left).toEqual({ prospects: '0', converted: '1' });
    // The outcome stays, unlinked, and the summary stays with its request (the founder's rulings of 2026-10-20, Q4 and Q6).
    const outlived = await withDatabase(
      async (client) =>
        (
          await client.query<{ lead: string | null; outcome_linked: boolean | null }>(
            `SELECT l.upload_id::text AS lead, (SELECT bool_or(o.upload_id IS NOT NULL) FROM screening_outcome o WHERE o.converted AND o.campaign = $2) AS outcome_linked
               FROM prospect_request q JOIN screening_lead l ON l.prospect_request_id = q.id WHERE q.contact_email = $1`,
            [CONTACT, CAMPAIGN],
          )
        ).rows,
    );
    expect(outlived).toEqual([{ lead: null, outcome_linked: false }]);
  });

  await test.step('the audit request form keeps the same attribution, and the console declines a request with its reason (SCR-12)', async () => {
    const organization = `SYNTHETIC DECLINED CLINIC ${randomBytes(3).toString('hex').toUpperCase()}`;
    await page.goto('/request-audit');
    await expect(page.locator('[data-copy="kept"]')).toHaveText(REQUEST_AUDIT_KEPT);
    await page.getByLabel('Your name').fill('SYNTHETIC REQUESTER');
    await page.getByLabel('Work email').fill(`declined-${CONTACT}`);
    await page.getByLabel('Organization').fill(organization);
    await page.getByLabel('Locations').fill('1');
    await page.getByLabel('Payers you bill').fill('SYNTHETIC PAYER C');
    await page.getByLabel('How you bill').selectOption('billing_firm');
    await page.getByLabel('How did you hear about us?').selectOption('association');
    await page.getByLabel('Referring billing firm').fill(FIRM);
    await expectAccessible(page, 'Request an audit, with attribution');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('Request received')).toBeVisible();
    const query = 'SELECT source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm, from_screening, status, declined_reason FROM prospect_request WHERE organization_name = $1';
    const requested = await withDatabase(async (client) => (await client.query<Record<string, unknown>>(query, [organization])).rows);
    expect(requested).toEqual([
      { source: 'association', utm_source: 'newsletter', utm_medium: 'email', utm_campaign: CAMPAIGN, paid_click: 'paid_search', referring_firm: FIRM, from_screening: false, status: 'new', declined_reason: null },
    ]);
    const admin = await browser.newContext();
    const console_ = await admin.newPage();
    try {
      await registerKeyAndSignIn(console_, 'screening-admin');
      await console_.goto('/console/prospects');
      const row = console_.getByRole('row').filter({ hasText: organization });
      await row.getByLabel('Why declined').selectOption('not_now');
      await row.getByRole('button', { name: 'Decline' }).click();
      // The action redirects to the same list, of new requests, so the declined row leaving it says the action is done.
      await expect(row).toHaveCount(0);
      await expect(console_).toHaveURL(/\/console\/prospects$/);
      const declined = await withDatabase(async (client) => (await client.query<Record<string, unknown>>(query, [organization])).rows[0]);
      expect(declined).toMatchObject({ status: 'declined', declined_reason: 'not_now' });
      await console_.goto('/console/prospects?status=declined');
      await expect(console_.getByRole('row').filter({ hasText: organization }).locator('[data-declined-reason="not_now"]')).toHaveText('Not now');
      await expectAccessible(console_, 'Declined audit requests');
    } finally {
      await admin.close();
    }
  });

  await test.step('a campaign code no one listed is kept as other, the visitor’s own cookie aside, and listing it later changes nothing (the founder’s ruling of 2026-10-21)', async () => {
    const visitor = await browser.newContext();
    const landed = await visitor.newPage();
    const organization = `SYNTHETIC UNLISTED CLINIC ${randomBytes(3).toString('hex').toUpperCase()}`;
    try {
      await landed.goto(UNLISTED_LANDING);
      // The visitor's own first-touch cookie holds the code as the link carried it, in their browser alone.
      const cookie = (await visitor.cookies()).find((item) => item.name === ATTRIBUTION_COOKIE);
      expect(decodeURIComponent(cookie?.value ?? '')).toBe(`s=newsletter&m=email&c=${UNLISTED}`);
      await landed.getByLabel('Your name').fill('SYNTHETIC REQUESTER');
      await landed.getByLabel('Work email').fill(`unlisted-${CONTACT}`);
      await landed.getByLabel('Organization').fill(organization);
      await landed.getByLabel('Locations').fill('1');
      await landed.getByLabel('Payers you bill').fill('SYNTHETIC PAYER D');
      await landed.getByLabel('How you bill').selectOption('in_house');
      await landed.getByRole('button', { name: 'Send request' }).click();
      await expect(landed.getByText('Request received')).toBeVisible();
    } finally {
      await visitor.close();
    }
    const kept = 'SELECT utm_source, utm_medium, utm_campaign FROM prospect_request WHERE organization_name = $1';
    // Every table that keeps a campaign code, and the audit trail, searched for the code as given.
    const holding = `SELECT count(*)::int AS n FROM (
        SELECT utm_campaign AS code FROM screening_prospect UNION ALL SELECT utm_campaign FROM screening_lead
        UNION ALL SELECT utm_campaign FROM prospect_request UNION ALL SELECT campaign FROM screening_outcome
        UNION ALL SELECT e::text FROM audit_event e) t WHERE strpos(t.code, $1) > 0`;
    const stored = await withDatabase(async (client) => ({
      request: (await client.query<Record<string, unknown>>(kept, [organization])).rows,
      holding: (await client.query<{ n: number }>(holding, [UNLISTED])).rows,
    }));
    expect(stored).toEqual({ request: [{ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'other' }], holding: [{ n: 0 }] });
    await listCampaign(UNLISTED, 'SYNTHETIC listed after the request');
    expect(await withDatabase(async (client) => (await client.query<Record<string, unknown>>(kept, [organization])).rows)).toEqual([{ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'other' }]);
  });

  await context.close();
});

test('a ZIP that spans two Medicare payment areas is asked for its ZIP+4, and one whose ZIP+4 list is not loaded is told so, never to check the digits; the file stays chosen (SCR-15)', async ({ page }) => {
  const contact = `screening-zip4-${randomBytes(4).toString('hex')}@clinic-zip4.synthetic.test`;
  await page.goto('/screening');
  await page.getByLabel('Practice name').fill('SYNTHETIC SPLIT ZIP CLINIC');
  await page.getByLabel('State').selectOption('MN');
  const zip = page.getByLabel('ZIP code', { exact: true });
  await expect(zip).toHaveAttribute('maxlength', '10');
  await expect(page.locator('#field-zip-hint')).toHaveText('Five digits, or ZIP+4 if you know it. A few ZIP codes span two Medicare payment areas; for those we ask for the ZIP+4.');
  await zip.fill(SCREENING_ZIP_PLUS_FOUR);
  await page.getByLabel('Work email').fill(contact);
  await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: screeningRowsCsv([SCREENING_HEADER, ...CLEAN_ROWS]) });
  await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Screen the file' }).click();
  const error = page.locator('[data-state="error"]');
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(error).toContainText('ZIP code: Medicare splits this ZIP code between two payment areas. Enter the full ZIP+4, such as 27601-1234, so the screening uses the right one.');
  // The file is still chosen: the ZIP+4 is all that changes. Under release 900001 its ZIP+4 list is not loaded.
  await expect(page.locator('[data-state="file-ready"]')).toBeVisible();
  await zip.fill(`${SCREENING_ZIP_PLUS_FOUR}-0001`);
  await page.getByRole('button', { name: 'Screen the file' }).click();
  await expect(error).toContainText('ZIP code: PaidWhole has not loaded Medicare’s locality list for this ZIP code yet, so a screening cannot price it. Try again later.');
  await expect(error).not.toContainText('Check the four digits');
  await expectAccessible(page, 'the screening page with a ZIP refused');
  await noSidewaysScroll(page, 390, 'the screening page with a ZIP refused');
  // Nothing of a refused ZIP is kept.
  const kept = await withDatabase(async (client) => (await client.query<{ n: string }>('SELECT count(*)::text AS n FROM screening_prospect WHERE contact_email = $1', [contact])).rows[0]?.n);
  expect(kept).toBe('0');
});
