import { createHash, randomBytes } from 'node:crypto';

import { tagline } from '@paidwhole/brand/tokens';
import { type Page, expect, test } from '@playwright/test';
import { cents, formatUsd } from '@tp/money';

import { MEDICARE_FIGURE_LABEL, REDUCED_FIGURE_LABEL, WITHIN_REDUCTION_RANGE } from '../src/lib/screening/labels';
import { expectAccessible } from './a11y';
import { registerKeyAndSignIn, withDatabase } from './helpers';
import { CLEAN_ROWS, SCREENING_ZIP, SMALL_LEFT_OUT, SMALL_ROWS, dateOfServiceCsv, expireScreeningsOnce, memberIdCsv, outboxFor, priceScreeningsOnce, resultLinkIn, screeningCsv } from './screening';

/**
 * The free screening in the browser (Change Order 001, CO-04; reconciliation-001, D11 and D18 to D21; test matrix
 * SCR-01, SCR-02, SCR-03, SCR-05 and SCR-06, the screens' side). A contract specialist approves the place-of-service
 * split in the console. A prospect, with no account, fills the form; a file with a Member ID column, and one with a
 * date-of-service column, are refused in the browser with the column named, and nothing is sent. The page states the
 * template's rules: each row at least 11 claim lines, and denied lines left out of every total. A SYNTHETIC file of
 * totals, built in memory, with two rows of fewer than 11 claim lines (SCR-07): the browser leaves those two out and
 * says how many rows, claim lines and dollars it left out, and sends the rest as its hash and rows (nothing of the two
 * in the request); the worker's sweep prices it (an operator pool on the
 * e2e database) and emails the link to the local outbox. The link opens the result: the Medicare figures under D19's
 * label and the fully reduced ones under theirs (the owner's rulings of 2026-10-18), the anomalies with the database's
 * standings (G01's 97110 within the range of the reduction across codes, 97140 an anomaly), the coverage and the
 * dollars that cannot be priced without a contract, the rows left out before sending as the browser counted them, the
 * database's own sums to the cent, with no owed, underpaid or
 * recovered and no tagline, accessible, and with no sideways scroll at 390 and 1280 px. Converting it records an audit request and the screening_converted event; once the screening is past its 30
 * days the link opens nothing, the expiry job deletes it, and the conversion's event remains. Synthetic data only.
 */

const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;
const PRACTICE = 'SYNTHETIC SCREENING CLINIC';

/** The prospect's address: one per run, so the outbox and the rate limit's account are this run's. */
const CONTACT = `screening-${randomBytes(4).toString('hex')}@clinic-e2e.synthetic.test`;

async function fillProspect(page: Page): Promise<void> {
  await page.getByLabel('Practice name').fill(PRACTICE);
  await page.getByLabel('State').selectOption('MN');
  await page.getByLabel('ZIP code', { exact: true }).fill(SCREENING_ZIP);
  await page.getByLabel('Work email').fill(CONTACT);
}

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
      await expect(specialist.getByRole('heading', { level: 1, name: 'Screening place of service' })).toBeVisible();
      await expect(specialist.getByRole('navigation', { name: 'Internal console' }).getByRole('link', { name: 'Screening place of service' })).toHaveAttribute('aria-current', 'page');
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
    await expect(page.locator('[data-slot="template-hint"]')).toContainText('Each row sums at least 11 claim lines, and denied lines are left out of every total');
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

  const clean = screeningCsv([...CLEAN_ROWS, ...SMALL_ROWS]);
  await test.step('a SYNTHETIC file is sent as its hash and rows of totals, its rows of fewer than 11 claim lines left out and counted, and the page says to check the email (SCR-07)', async () => {
    await page.getByLabel('File to screen').setInputFiles({ name: 'totals.csv', mimeType: 'text/csv', buffer: clean });
    await expect(page.locator('[data-state="file-ready"]')).toContainText(`${String(CLEAN_ROWS.length)} rows of totals`);
    const leftOut = page.locator('[data-state="left-out"]');
    await expect(leftOut).toContainText(
      `Left out: ${String(SMALL_LEFT_OUT.rows)} rows of fewer than 11 claim lines each, ${String(SMALL_LEFT_OUT.claimLines)} claim lines and ${SMALL_LEFT_OUT.allowed} allowed in your file.`,
    );
    await expect(leftOut).toContainText('They are not sent, and no figure includes them');
    await page.getByRole('button', { name: 'Screen the file' }).click();
    await expect(page).toHaveURL(/\/screening\?sent=1$/);
    await expect(page.locator('[data-state="sent"]')).toContainText('Check your email');
    expect(await page.locator('body').innerText()).not.toMatch(/\/screening\/results\//);
    // The request carried nothing of the rows left out: neither their code nor their quarter, only the three numbers.
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    for (const body of bodies) {
      expect(body).not.toContain('97164');
      expect(body).not.toContain('2026-Q3');
    }
    const upload = await withDatabase(
      async (client) =>
        (
          await client.query<{ file_sha256: string; row_count: number; status: string; left_out: string[] }>(
            `SELECT u.file_sha256, u.row_count, u.status, ARRAY[u.left_out_rows::text, u.left_out_claim_lines::text, u.left_out_allowed_cents::text] AS left_out
               FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`,
            [CONTACT],
          )
        ).rows,
    );
    expect(upload).toEqual([
      {
        file_sha256: createHash('sha256').update(clean).digest('hex'),
        row_count: CLEAN_ROWS.length,
        status: 'accepted',
        left_out: [String(SMALL_LEFT_OUT.rows), String(SMALL_LEFT_OUT.claimLines), SMALL_LEFT_OUT.allowedCents.toString()],
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
      "SELECT procedure_code || ':' || payer_product AS grp, standing FROM screening_result_groups($1)",
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
  });

  await test.step('converting it records an audit request and the screening_converted event (SCR-06)', async () => {
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
    await page.reload();
    await expect(page.locator('[data-state="requested"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request an audit' })).toHaveCount(0);
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
  });

  await context.close();
});
