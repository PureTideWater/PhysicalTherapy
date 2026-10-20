import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { tagline } from '@paidwhole/brand';
import { loadRelease, withdrawRelease } from '@tp/rules/loader';
import { SCREENING_REJECTION_CODES, encodeScreeningRows, screeningTokenHash } from '@tp/worker/screening';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RATE_LIMITS } from '../http/rate-limit';
import type { MutationResult, Outcome } from '../http/route';
import { screeningConvert, screeningPage, screeningReasonMessage, screeningResult, screeningSubmit } from './routes';
import { parseScreeningBytes } from './parse';
import { ScreeningWorld, SCREENING_HEADERS, SAMPLE_ROWS, practiceName, screeningRow, submitInput } from './test-support/screening-world';

/**
 * The free screening's routes against a scratch database (Change Order 001, CO-04; docs/adr/0062):
 *
 * - SCR-01, the rejection: an upload whose header holds a member-ID or date-of-service column is refused with the
 *   column named by position and kind, and nothing of it is stored but its row count and the reasons: no hash.
 * - SCR-04, the rate limit: per business email domain, per free-mail mailbox however its address is spelled, and per
 *   client address.
 * - SCR-06, the conversion event: converting a screening to an audit request is an audit event.
 * - SCR-05, the wording, on the server's side: no result, message or email says owed, underpaid or recovered, and
 *   the prospect's email carries no tagline.
 * - SCR-07, the claim-line floor on the server's side: a row of fewer than 11 claim lines posted around the browser is
 *   refused with its row number, storing nothing of it but the coded reason, and no hash; 11 is taken; what the browser
 *   left out is stored as three numbers and the result says so; the hash kept is the database's, of the rows it
 *   accepted, so two files differing only in a row left out store the same one, and a hash a request sends is never
 *   kept; and a later screening of the same practice replaces the earlier one, whose link stops opening it.
 *
 * And around them: closed until a split is approved, recording nothing while closed; a ZIP whose locality needs its
 * ZIP+4 refused (the pricing cannot use one; the refusal stays until PR 6b, which takes a ZIP+4 before launch by the
 * founder's ruling of 2026-10-18, superseding ruling 3); an address the mail service can send to; the result read by
 * its link alone, with both figures for a code in the reduction across codes and the database's standings, and not
 * found once expired; a result under a release since withdrawn keeping its notice and still converting (the owner's
 * ruling of 2026-10-18).
 * Synthetic data only.
 */

const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;

const sha256 = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

let world: ScreeningWorld;

beforeAll(async () => {
  world = await ScreeningWorld.create();
}, 60_000);

afterAll(async () => {
  await world.close();
});

/** Every text column of the screening tables, the audit log and the rate limiter, joined: what the database holds. */
async function storedText(): Promise<string> {
  const { rows } = await world.owner.query<{ text: string }>(
    `SELECT coalesce(string_agg(t::text, '|'), '') AS text FROM (
       SELECT p::text AS t FROM screening_prospect p UNION ALL SELECT u::text FROM screening_upload u UNION ALL SELECT r::text FROM screening_run r
       UNION ALL SELECT s::text FROM screening_result s UNION ALL SELECT a::text FROM audit_event a UNION ALL SELECT c::text FROM rate_limit_counter c) x`,
  );
  return rows[0]?.text ?? '';
}

function issuesOf(outcome: Outcome<unknown>): { field: string; message: string }[] {
  return outcome.status === 'invalid' ? [...outcome.issues] : [];
}

async function submitted(input: Record<string, string>): Promise<Outcome<MutationResult>> {
  return world.call(screeningSubmit, { input });
}

describe('SCR-01: an upload holding patient information is refused with its column named, and nothing of it is stored', () => {
  it('refuses a member-ID column and a date-of-service column by position and kind, storing the count and reasons alone, no hash', async () => {
    const email = 'prospect.refused@clinic-refused.synthetic.test';
    const headers = [...SCREENING_HEADERS.slice(0, 3), 'Subscriber ID', ...SCREENING_HEADERS.slice(3), 'DOS'];
    const input = submitInput({ contactEmail: email, headers, rows: 'SYNTHETIC-CELL-9137\t1\t2\t3' });
    const outcome = await submitted(input);
    expect(outcome.status).toBe('invalid');
    expect(issuesOf(outcome)).toEqual([
      { field: 'upload', message: 'Column 4 holds member IDs; remove it and upload again' },
      { field: 'upload', message: 'Column 10 holds dates of service; remove it and upload again' },
    ]);
    // The messages never echo a header or a cell.
    expect(JSON.stringify(outcome)).not.toMatch(/Subscriber|DOS\b|SYNTHETIC-CELL/);
    const { rows } = await world.owner.query<{ status: string; row_count: number; rows_sha256: string | null; rejection_reasons: unknown; contact_email: string }>(
      `SELECT u.status, u.row_count, u.rows_sha256, u.rejection_reasons, p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`,
      [email],
    );
    expect(rows).toEqual([
      {
        status: 'rejected',
        row_count: 1,
        rows_sha256: null,
        rejection_reasons: [
          { code: 'phi_column', column: 4, phi: 'member_id' },
          { code: 'phi_column', column: 10, phi: 'date_of_service' },
        ],
        contact_email: email,
      },
    ]);
    const stored = await storedText();
    expect(stored).not.toContain('Subscriber');
    expect(stored).not.toContain('SYNTHETIC-CELL-9137');
    expect((await world.owner.query("SELECT count(*)::int AS n FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id WHERE u.status = 'rejected'")).rows).toEqual([{ n: 0 }]);
    const audit = await world.owner.query("SELECT actor_kind, object_type, purpose FROM audit_event WHERE action = 'screening_rejected'");
    expect(audit.rows).toContainEqual({ actor_kind: 'system', object_type: 'screening_upload', purpose: 'screening' });
  });

  it('names patient information first however many other columns come before it, and stores its kind by position', async () => {
    const email = 'prospect.wide@clinic-wide.synthetic.test';
    const headers = [...Array.from({ length: 24 }, (_, index) => `Export Field ${String(index + 1)}`), 'Date of Service', 'MRN #', ...SCREENING_HEADERS];
    const outcome = await submitted(submitInput({ contactEmail: email, headers }));
    const issues = issuesOf(outcome);
    expect(issues).toHaveLength(20);
    expect(issues.slice(0, 2)).toEqual([
      { field: 'upload', message: 'Column 25 holds dates of service; remove it and upload again' },
      { field: 'upload', message: 'Column 26 holds member IDs; remove it and upload again' },
    ]);
    expect(issues.at(-1)).toEqual({ field: 'upload', message: 'And 7 more problems like these' });
    expect(issues.find((issue) => /rename/.test(issue.message))).toBeUndefined();
    const { rows } = await world.owner.query<{ rejection_reasons: { code: string }[] }>(
      'SELECT u.rejection_reasons FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1',
      [email],
    );
    expect(rows[0]?.rejection_reasons.slice(0, 2)).toEqual([
      { code: 'phi_column', column: 25, phi: 'date_of_service' },
      { code: 'phi_column', column: 26, phi: 'member_id' },
    ]);
  });

  it('refuses a name in the code column and an identifier under the allowed total, and stores no row of them', async () => {
    const email = 'prospect.shapes@clinic-shapes.synthetic.test';
    const outcome = await submitted(
      submitInput({ contactEmail: email, rows: ['SMITH\tGP\t1\t11\tmedicare_ffs\t2026-Q1\t100\t11', 'MARIA\t\t1\t11\tcommercial\t2026-Q1\t100\t11', '97110\tGP\t1\t11\tmedicare_ffs\t2026-Q1\t12345678900\t24'].join('\n') }),
    );
    expect(issuesOf(outcome)).toEqual([
      { field: 'upload', message: 'Row 1: the procedure code is not in the screening’s format' },
      { field: 'upload', message: 'Row 2: the procedure code is not in the screening’s format' },
      { field: 'upload', message: 'Row 3: the allowed total is not in the screening’s format' },
    ]);
    const stored = await storedText();
    expect(stored).not.toContain('SMITH');
    expect(stored).not.toContain('MARIA');
    expect(stored).not.toContain('12345678900');
  });

  it('checks every row again on the server, whatever the browser said, and refuses a row count that does not match', async () => {
    const tampered = await submitted(submitInput({ rows: '97110\tGP\t2\t11\tmedicare_ffs\t2026-01-15\t100\t11' }));
    expect(issuesOf(tampered)).toEqual([{ field: 'upload', message: 'Row 1: the service band is not in the screening’s format' }]);
    const short = await submitted(submitInput({ rowCount: '99' }));
    expect(issuesOf(short)).toEqual([{ field: 'upload', message: 'The rows sent do not match the file; choose the file again' }]);
    const repeated = await submitted(submitInput({ rows: [SAMPLE_ROWS[0] ?? screeningRow('97110', 'medicare_ffs'), SAMPLE_ROWS[0] ?? screeningRow('97110', 'medicare_ffs')] }));
    expect(issuesOf(repeated)).toEqual([{ field: 'upload', message: 'Row 2 repeats row 1; add the two into one row' }]);
    const future = await submitted(submitInput({ rows: [screeningRow('97110', 'medicare_ffs', { band: '2099-Q1' })] }));
    expect(issuesOf(future)).toEqual([{ field: 'upload', message: 'Row 1: the service band’s quarter has not started yet' }]);
    const unreadable = await submitted({ ...submitInput(), headers: 'not json' });
    expect(issuesOf(unreadable)).toEqual([{ field: 'upload', message: 'the file could not be read here; choose it again' }]);
  });

  it('refuses the form’s own fields before any record, and a practice name shaped like patient information', async () => {
    const before = await world.owner.query('SELECT count(*)::int AS n FROM screening_prospect');
    const outcome = await submitted(submitInput({ practiceName: 'Jane Synthetic 03/04/1985', state: 'ZZ', zip: '1234', contactEmail: 'not an address' }));
    expect(issuesOf(outcome).map((issue) => issue.field)).toEqual(['practiceName', 'state', 'zip', 'contactEmail']);
    // Only an address the mail service can send to: plain ASCII, a dot-atom before the @, a dotted domain after it.
    for (const contactEmail of [
      'pois,on@clinic-poison.synthetic.test',
      'prospect@localhost',
      'prospect@clinic.synthetic.test.',
      'prospéct@clinic.synthetic.test',
      '.prospect@clinic.synthetic.test',
      'pro..spect@clinic.synthetic.test',
      'prospect@-clinic.synthetic.test',
      'pro spect@clinic.synthetic.test',
    ]) {
      expect(issuesOf(await submitted(submitInput({ contactEmail }))), contactEmail).toEqual([{ field: 'contactEmail', message: 'an email address: the result’s link is sent there' }]);
    }
    expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_prospect')).rows).toEqual(before.rows);
    expect(await storedText()).not.toContain('Jane Synthetic');
  });

  it('words every reason by its code, position and kind, never anything else', () => {
    for (const code of SCREENING_REJECTION_CODES) {
      const message = screeningReasonMessage({ code, column: 3, row: 12, first_row: 2, field: 'units', phi: 'name' });
      expect(message, code).not.toMatch(FORBIDDEN);
      expect(message.length, code).toBeGreaterThan(10);
    }
  });
});

describe('SCR-07: a row of fewer than 11 claim lines, which can be one patient’s service line', () => {
  const FLOOR_MESSAGE = (row: number) => ({
    field: 'upload',
    message: `Row ${String(row)} sums fewer than 11 claim lines; a screening takes a row of at least 11 claim lines, because a row of fewer can describe one patient’s care: leave it out`,
  });

  it('refuses a direct POST around the browser with a row of one claim line, by its row number, and stores nothing of the row, nor any hash', async () => {
    const email = 'prospect.smallcell@clinic-smallcell.synthetic.test';
    // SYNTHETIC values found nowhere else in this file, so the database and the logs can be searched for them.
    const small = screeningRow('G0283', 'ma_noncontracted', { modifiers: ['GP'], band: '2025-Q3', place: '22', allowedCents: 4_517n, claims: 1 });
    const sent = submitInput({ practiceName: 'Synthetic Therapy Group', contactEmail: email, rows: [screeningRow('97110', 'medicare_ffs', { modifiers: ['GP'], allowedCents: 39_600n }), small] });
    // A hash of the rows, the small one among them, sent as an older page sent the file's: never stored.
    const clientHash = sha256(sent.rows ?? '');
    const input = { ...sent, fileSha256: clientHash };
    const before = await world.owner.query<{ n: number }>("SELECT count(*)::int AS n FROM screening_result WHERE procedure_code = 'G0283'");
    const outcome = await submitted(input);
    expect(issuesOf(outcome)).toEqual([FLOOR_MESSAGE(2)]);
    expect(JSON.stringify(outcome)).not.toMatch(/G0283|45\.17|2025-Q3/);
    const { rows } = await world.owner.query<{ upload: Record<string, unknown>; prospect: Record<string, unknown>; runs: number }>(
      `SELECT to_jsonb(u) - 'id' - 'prospect_id' - 'created_at' - 'expires_at' AS upload, to_jsonb(p) - 'id' - 'created_at' - 'expires_at' AS prospect,
              (SELECT count(*)::int FROM screening_run r WHERE r.upload_id = u.id) AS runs
         FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`,
      [email],
    );
    // Only the row count and the coded reason (its row and field): no code, count, quarter or dollars of it, and no hash.
    expect(rows).toEqual([
      {
        upload: {
          rows_sha256: null,
          row_count: 2,
          status: 'rejected',
          rejection_reasons: [{ code: 'too_few_claim_lines', row: 2, field: 'claim_count' }],
          left_out_rows: 0,
          left_out_claim_lines: 0,
          left_out_allowed_cents: 0,
        },
        prospect: {
          practice_name: 'Synthetic Therapy Group',
          state: 'MN',
          zip: '00011',
          contact_email: email,
          // No attribution, consent or terms in this request.
          source: null,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          paid_click: null,
          referring_firm: null,
          followup_consent_sha256: null,
          screening_terms_sha256: null,
        },
        runs: 0,
      },
    ]);
    expect((await world.owner.query("SELECT count(*)::int AS n FROM screening_result WHERE procedure_code = 'G0283'")).rows).toEqual(before.rows);
    // The code and the quarter are searched for everywhere (hex and UUIDs cannot hold them); the dollars were held to the
    // upload's exact columns above, and no result row holds them.
    const stored = await storedText();
    for (const value of ['G0283', '2025-Q3', clientHash]) {
      expect(stored, value).not.toContain(value);
    }
    expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_result WHERE observed_allowed_cents = 4517')).rows).toEqual([{ n: 0 }]);
    expect(JSON.stringify(world.logLines)).not.toMatch(/G0283|2025-Q3/);
    const audit = await world.owner.query(
      "SELECT e.object_type, e.purpose FROM audit_event e JOIN screening_upload u ON u.id = e.object_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE e.action = 'screening_rejected' AND p.contact_email = $1",
      [email],
    );
    expect(audit.rows).toEqual([{ object_type: 'screening_upload', purpose: 'screening' }]);
  });

  it('refuses a row of 10 claim lines and takes the same row at 11, naming every small row however many there are', async () => {
    const at = (claims: number, code = '97110') => screeningRow(code, 'medicare_ffs', { modifiers: ['GP'], allowedCents: BigInt(claims) * 3_600n, claims });
    expect(issuesOf(await submitted(submitInput({ rows: [at(10)] })))).toEqual([FLOOR_MESSAGE(1)]);
    expect(await submitted(submitInput({ contactEmail: 'prospect.eleven@clinic-eleven.synthetic.test', rows: [at(11)] }))).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    const run = await world.owner.query<{ claim_count: number }>(
      'SELECT s.claim_count FROM screening_result s JOIN screening_run r ON r.id = s.run_id JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1',
      ['prospect.eleven@clinic-eleven.synthetic.test'],
    );
    expect(run.rows).toEqual([{ claim_count: 11 }]);
    // Named with the patient information: ahead of every other problem, and each small row by its number.
    const crowded = submitInput({ rows: [...Array.from({ length: 22 }, () => 'x'), encodeScreeningRows([at(3, '97140')]), encodeScreeningRows([at(10, '97530')])].join('\n') });
    const issues = issuesOf(await submitted(crowded));
    expect(issues.slice(0, 2)).toEqual([FLOOR_MESSAGE(23), FLOOR_MESSAGE(24)]);
    expect(issues.at(-1)).toEqual({ field: 'upload', message: 'And 5 more problems like these' });
  });

  it('stores what the browser left out as three numbers, and the result says so apart from every figure', async () => {
    const email = 'prospect.leftout@clinic-leftout.synthetic.test';
    expect(await submitted(submitInput({ contactEmail: email, leftOut: { rows: 3, claimLines: 16, allowedCents: 111_233n } }))).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    const upload = await world.owner.query(
      'SELECT u.row_count, u.left_out_rows, u.left_out_claim_lines, u.left_out_allowed_cents::text AS left_out_allowed_cents FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1',
      [email],
    );
    expect(upload.rows).toEqual([{ row_count: 7, left_out_rows: 3, left_out_claim_lines: 16, left_out_allowed_cents: '111233' }]);
    await world.price();
    const result = await world.call(screeningResult, { params: { resultId: world.tokenFor(email) } });
    expect(result).toMatchObject({ status: 'ok', data: { summary: { rows: 7, claimLines: 79, leftOut: { rows: 3, claimLines: 16, observedCents: 111_233n } } } });
  });

  it('takes only left-out numbers the browser could have counted, and records nothing otherwise', async () => {
    const email = 'prospect.leftout.bad@clinic-leftout-bad.synthetic.test';
    for (const leftOut of [
      { rows: '1', claimLines: '11', allowedCents: '0' },
      { rows: '0', claimLines: '1', allowedCents: '0' },
      { rows: '1', claimLines: '1', allowedCents: '2500001' },
      { rows: '49999', claimLines: '49999', allowedCents: '0' },
      { rows: 'x', claimLines: '0', allowedCents: '0' },
      { rows: '1', claimLines: '-1', allowedCents: '0' },
      { rows: '1', claimLines: '1', allowedCents: '4.5' },
    ]) {
      expect(issuesOf(await submitted(submitInput({ contactEmail: email, leftOut }))), JSON.stringify(leftOut)).toEqual([{ field: 'upload', message: 'the file could not be read here; choose it again' }]);
    }
    expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([{ n: 0 }]);
    // A request built without the page names nothing left out: blank is none.
    const blank = { ...submitInput({ contactEmail: 'prospect.leftout.blank@clinic-leftout-blank.synthetic.test' }), leftOutRows: '', leftOutClaimLines: '', leftOutAllowedCents: '' };
    expect(await submitted(blank)).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
  });

  it('keeps the hash of the rows it accepted, never of the file: two files differing only in a row left out store the same hash, and a hash the request sends is not kept', async () => {
    const now = new Date();
    const quarter = `${String(now.getUTCFullYear() - 1)}-Q2`;
    const header = SCREENING_HEADERS.join(',');
    const kept = `97110,GP,2,11,ma_noncontracted,${quarter},440.00,11`;
    // SYNTHETIC files: the same kept row, and a different small row (3 claim lines, then 7) that the browser leaves out.
    const files = [`${header}\r\n${kept}\r\nG0283,GP,1,22,ma_noncontracted,${quarter},136.84,3\r\n`, `${header}\r\n${kept}\r\n97140,GP,1,11,medicare_ffs,${quarter},210.00,7\r\n`];
    const hashes: string[] = [];
    for (const [index, file] of files.entries()) {
      const bytes = new TextEncoder().encode(file);
      const parsed = parseScreeningBytes({ name: 'totals.csv', type: 'text/csv', size: bytes.length }, bytes, now);
      expect(parsed.ok, `file ${String(index)}`).toBe(true);
      if (!parsed.ok) {
        return;
      }
      expect(parsed.rowCount).toBe(1);
      const email = `prospect.hash.${String(index)}@clinic-hash-${String(index)}.synthetic.test`;
      const input = {
        ...submitInput({ contactEmail: email, rows: parsed.rows, leftOut: parsed.leftOut }),
        // What an older page sent: the hash of the whole file, small row and all.
        fileSha256: sha256(bytes),
      };
      expect(await submitted(input)).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
      const stored = await world.owner.query<{ rows_sha256: string }>('SELECT u.rows_sha256 FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1', [email]);
      // The SHA-256 of the canonical rows sent, which the database holds row by row anyway.
      expect(stored.rows).toEqual([{ rows_sha256: sha256(parsed.rows) }]);
      expect(await storedText()).not.toContain(sha256(bytes));
      hashes.push(stored.rows[0]?.rows_sha256 ?? '');
    }
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[0]).toBe(sha256(encodeScreeningRows([screeningRow('97110', 'ma_noncontracted', { modifiers: ['GP'], units: 2, band: quarter, allowedCents: 44_000n, claims: 11 })])));
  });

  it('replaces an earlier screening of the same practice, so a row of 12 claim lines and the same row at 11 are never held together; the earlier link stops opening it', async () => {
    const name = practiceName();
    const row = (allowedCents: bigint, claims: number) => [screeningRow('97530', 'ma_noncontracted', { modifiers: ['GP'], units: 2, band: '2026-Q2', allowedCents, claims })];
    const firstEmail = `prospect.diff.first.${randomUUID().slice(0, 6)}@clinic-diff.synthetic.test`;
    expect(await submitted(submitInput({ practiceName: name, contactEmail: firstEmail, rows: row(60_000n, 12) }))).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    await world.price();
    const firstToken = world.tokenFor(firstEmail);
    expect((await world.call(screeningResult, { params: { resultId: firstToken } })).status).toBe('ok');
    // The same practice, its name typed in another case, from a colleague's address: the earlier screening goes.
    const secondEmail = `prospect.diff.second.${randomUUID().slice(0, 6)}@clinic-diff.synthetic.test`;
    expect(await submitted(submitInput({ practiceName: name.toLowerCase(), contactEmail: secondEmail, rows: row(54_517n, 11) }))).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    expect((await world.call(screeningResult, { params: { resultId: firstToken } })).status).toBe('not_found');
    const held = await world.owner.query<{ claim_count: number }>(
      `SELECT s.claim_count FROM screening_result s JOIN screening_run r ON r.id = s.run_id JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
        WHERE screening_practice_key(p.practice_name) = screening_practice_key($1)`,
      [name],
    );
    expect(held.rows).toEqual([{ claim_count: 11 }]);
    await world.price();
    expect((await world.call(screeningResult, { params: { resultId: world.tokenFor(secondEmail) } })).status).toBe('ok');
  });
});

describe('a clean upload: a ZIP the pricing can use, stored, queued, priced, read by its link alone', () => {
  it('refuses a ZIP whose Medicare locality needs its ZIP+4, which the pricing cannot use, and never asks for or keeps a ZIP+4', async () => {
    const email = 'prospect.plusfour@clinic-plusfour.synthetic.test';
    const needs = await submitted(submitInput({ zip: '00012', contactEmail: email }));
    expect(issuesOf(needs)).toEqual([
      {
        field: 'zip',
        message: 'this ZIP code spans two Medicare localities, and a free screening cannot price one yet: its rows would need the ZIP+4, which the pricing does not take',
      },
    ]);
    // A ZIP+4 sent anyway is not a field the route takes, and nothing is kept for the refused ZIP.
    expect(issuesOf(await submitted({ ...submitInput({ zip: '00012', contactEmail: email }), zipPlusFour: '0001' })).map((issue) => issue.field)).toEqual(['zip']);
    expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([{ n: 0 }]);
    const columns = await world.owner.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'screening_prospect' AND column_name LIKE '%plus%'");
    expect(columns.rows).toEqual([]);
    expect(issuesOf(await submitted(submitInput({ zip: '00099' })))).toEqual([{ field: 'zip', message: 'this ZIP code is not in the Medicare locality map in force; check it' }]);
  });

  it('stores a clean upload, queues its pricing and says to check the email; the link opens the result, computed in SQL', async () => {
    const email = 'prospect.clean@clinic-clean.synthetic.test';
    const before = Date.now();
    const page = await world.call(screeningPage);
    expect(page).toMatchObject({ status: 'ok', data: { open: true, releaseNo: 900001, sent: false, limits: { minClaimLines: 11 } } });
    // The page carries the server's clock, by which the browser dates the file's quarters (never the computer's own).
    const serverTime = page.status === 'ok' ? page.data.serverTime : '';
    expect(serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(serverTime)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(serverTime)).toBeLessThanOrEqual(Date.now());
    const outcome = await submitted(submitInput({ practiceName: 'Synthetic Therapy Group', contactEmail: email }));
    expect(outcome).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    const run = (await world.owner.query<{ id: string }>('SELECT r.id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1', [email])).rows[0];
    expect(world.queue.screeningRuns).toContain(run?.id);
    await world.price();
    const token = world.tokenFor(email);
    const result = await world.call(screeningResult, { params: { resultId: token } });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      return;
    }
    const { summary, groups, coverage, rows } = result.data;
    expect(summary).toMatchObject({ practiceName: 'Synthetic Therapy Group', state: 'MN', zip: '00011', releaseNo: 900001, rows: 7, claimLines: 79 });
    expect(summary.contractRequired).toEqual({ rows: 2, claimLines: 23, observedCents: 175_000n });
    expect(summary.notScreened).toEqual({ rows: 2, claimLines: 22, observedCents: 40_700n });
    expect(summary.leftOut).toEqual({ rows: 0, claimLines: 0, observedCents: 0n });
    expect(summary.priced.rows + summary.couldNotPrice.rows).toBe(3);
    expect(summary.priced.differenceCents).toBe(summary.priced.expectedCents - summary.priced.observedCents);
    expect(groups.reduce((total, group) => total + group.expectedCents, 0n)).toBe(summary.priced.expectedCents);
    expect(coverage.reduce((total, item) => total + item.rows, 0)).toBe(7);
    expect(rows.length).toBe(summary.priced.rows);
    for (const row of rows) {
      expect(row.expectedCents).toBe(row.expectedLineCents * BigInt(row.claimCount));
      // A code in the reduction across codes has its fully reduced figure beside it; any other code has one figure.
      expect(row.reducedCents).toBe(row.inReductionPool ? (row.reducedLineCents ?? -1n) * BigInt(row.claimCount) : null);
    }
    // The sample's 97110 GP x2 at ZIP 00011, eleven claims allowed $440.00 in Q1: $36.84 a line before the reduction
    // across codes and $31.45 fully reduced (SYNTHETIC release 900001, before sequestration); $40.00 a line is above both.
    expect(rows.find((row) => row.procedureCode === '97110' && row.payerProduct === 'medicare_ffs')).toMatchObject({
      expectedLineCents: 3_684n,
      reducedLineCents: 3_145n,
      expectedCents: 40_524n,
      reducedCents: 34_595n,
      observedCents: 44_000n,
      standing: 'at_or_above',
    });
    expect(summary.priced.pooledRows).toBe(rows.filter((row) => row.inReductionPool).length);
    expect(summary.priced.reducedCents).toBe(rows.reduce((total, row) => total + (row.reducedCents ?? row.expectedCents), 0n));
    for (const group of groups) {
      expect(group.anomaly).toBe(group.anomalyRows > 0);
      expect(group.reducedCents === null).toBe(!group.inReductionPool);
    }
    // A link that is not a token, or no screening's, is not found; so is an expired one (below).
    expect((await world.call(screeningResult, { params: { resultId: 'abc' } })).status).toBe('not_found');
    expect((await world.call(screeningResult, { params: { resultId: 'a'.repeat(32) } })).status).toBe('not_found');
  });

  it('stores the upload even when the job cannot be sent, and the sweep prices it', async () => {
    const failing = await ScreeningWorld.create({ queue: { enqueue: () => Promise.reject(new Error('no queue')), enqueueScreeningRun: () => Promise.reject(new Error('no queue')) } });
    try {
      const email = 'prospect.unsent@clinic-unsent.synthetic.test';
      expect(await failing.call(screeningSubmit, { input: submitInput({ contactEmail: email }) })).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
      expect(failing.logLines.filter((line) => line.error_code === 'SCREENING_NOT_QUEUED').map((line) => Object.keys(line).sort())).toEqual([['error_code', 'level', 'msg', 'screening_run_id', 'time']]);
      expect(await failing.price()).toEqual({ complete: 1, failed: 0, skipped: 0 });
      expect(failing.tokenFor(email)).toMatch(/^[a-z]{32}$/);
    } finally {
      await failing.close();
    }
  });

  it('stays closed until a contract specialist approves a split, and records nothing of a prospect while closed', async () => {
    const closed = await ScreeningWorld.create({ open: false });
    try {
      expect(await closed.call(screeningPage)).toMatchObject({ status: 'ok', data: { open: false, releaseNo: null } });
      expect(issuesOf(await closed.call(screeningSubmit, { input: submitInput() }))).toEqual([{ field: 'input', message: 'screening is not open yet; try again later' }]);
      // Not even a refusal: an upload with a member-ID column, posted directly while the page hides the form.
      const refused = submitInput({ contactEmail: 'closed.probe@clinic-closed.synthetic.test', headers: ['Member ID', ...SCREENING_HEADERS] });
      expect(issuesOf(await closed.call(screeningSubmit, { input: refused }))).toEqual([{ field: 'input', message: 'screening is not open yet; try again later' }]);
      for (const table of ['screening_prospect', 'screening_upload', 'screening_run', 'screening_outcome']) {
        expect((await closed.owner.query(`SELECT count(*)::int AS n FROM ${table}`)).rows, table).toEqual([{ n: 0 }]);
      }
      expect((await closed.owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action LIKE 'screening_%'")).rows).toEqual([{ n: 0 }]);
      // The definer function refuses it too, whoever calls it.
      await expect(
        closed.owner.query(
          "SELECT reject_screening_upload('SYNTHETIC', 'MN', '00011', 'closed.probe@clinic-closed.synthetic.test', 1, '[{\"code\":\"no_rows\"}]', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'test')",
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    } finally {
      await closed.close();
    }
  });
});

describe('SCR-04: rate limits per business domain, per free-mail address and per client address', () => {
  // Each attempt fails a field check after the limit has counted it, so nothing is stored while the counts climb.
  const attempt = (contactEmail: string, address: string | null = null) => world.call(screeningSubmit, { input: submitInput({ contactEmail, zip: 'x' }), address });
  const accountLimit = RATE_LIMITS.screening.account?.hits ?? 0;
  const addressLimit = RATE_LIMITS.screening.address?.hits ?? 0;

  it('counts a business domain as one account, whoever at it writes', async () => {
    expect(accountLimit).toBe(20);
    const statuses: string[] = [];
    for (let index = 0; index <= accountLimit; index += 1) {
      statuses.push((await attempt(`person${String(index)}@one-practice.synthetic.test`)).status);
    }
    expect(statuses.slice(0, accountLimit).every((status) => status === 'invalid')).toBe(true);
    expect(statuses.at(-1)).toBe('rate_limited');
    // Another domain has its own count.
    expect((await attempt('person0@another-practice.synthetic.test')).status).toBe('invalid');
  });

  it('counts a listed free-mail domain by the whole address, so its prospects do not share one count', async () => {
    const statuses: string[] = [];
    for (let index = 0; index <= accountLimit; index += 1) {
      statuses.push((await attempt('synthetic.prospect@gmail.com')).status);
    }
    expect(statuses.at(-2)).toBe('invalid');
    expect(statuses.at(-1)).toBe('rate_limited');
    expect((await attempt('another.synthetic.prospect@gmail.com')).status).toBe('invalid');
  });

  it('counts a free-mail mailbox once however its address is spelled: plus tags, Gmail dots, googlemail.com, a trailing dot, any case', async () => {
    const spelled = async (spellings: readonly string[]) => {
      const statuses: string[] = [];
      for (const spelling of spellings) {
        statuses.push((await attempt(spelling)).status);
      }
      return statuses;
    };
    const limited = (statuses: readonly string[]) => statuses.slice(0, accountLimit).every((status) => status === 'invalid') && statuses.at(-1) === 'rate_limited';
    expect(limited(await spelled(Array.from({ length: accountLimit + 1 }, (_, index) => `plus.synthetic+${String(index)}@gmail.com`)))).toBe(true);
    // Every way to place dots in a Gmail address reaches the one inbox.
    const dotted = Array.from({ length: accountLimit + 1 }, (_, index) => {
      const letters = 'dotsynthetic'.split('');
      return `${letters.map((letter, at) => (at > 0 && ((index + 1) >> (at - 1)) % 2 === 1 ? `.${letter}` : letter)).join('')}@gmail.com`;
    });
    expect(new Set(dotted).size).toBe(accountLimit + 1);
    expect(limited(await spelled(dotted))).toBe(true);
    const mixed = await spelled([
      ...Array.from({ length: accountLimit }, () => 'alias.synthetic@gmail.com'),
      'alias.synthetic@googlemail.com',
      'alias.synthetic@gmail.com.',
      'ALIAS.SYNTHETIC@GMAIL.COM',
      'a.l.i.a.s.synthetic+x@googlemail.com',
    ]);
    expect(mixed.slice(accountLimit)).toEqual(['rate_limited', 'rate_limited', 'rate_limited', 'rate_limited']);
    // A free-mail provider's regional subdomain counts by mailbox as the provider does.
    expect(limited(await spelled(Array.from({ length: accountLimit + 1 }, (_, index) => `person${String(index)}@nc.rr.com`)))).toBe(false);
  });

  it('counts the mail of the large internet providers by mailbox, so one address cannot use up a domain for everyone', async () => {
    for (const domain of ['bellsouth.net', 'charter.net', 'earthlink.net', 'optonline.net', 'yahoo.co.uk']) {
      for (let index = 0; index <= accountLimit; index += 1) {
        await attempt(`exhausting.synthetic@${domain}`);
      }
      expect((await attempt(`exhausting.synthetic@${domain}`)).status, domain).toBe('rate_limited');
      expect((await attempt(`someone.else.synthetic@${domain}`)).status, domain).toBe('invalid');
    }
  });

  it('counts each client address, whatever accounts it names', async () => {
    expect(addressLimit).toBe(10);
    const statuses: string[] = [];
    for (let index = 0; index <= addressLimit; index += 1) {
      statuses.push((await attempt(`someone@practice-${String(index)}.synthetic.test`, '203.0.113.50')).status);
    }
    expect(statuses.slice(0, addressLimit).every((status) => status === 'invalid')).toBe(true);
    expect(statuses.at(-1)).toBe('rate_limited');
    expect((await attempt('someone@practice-0.synthetic.test', '203.0.113.51')).status).toBe('invalid');
    // Subjects are kept only as keyed hashes: no domain, address or IP in clear.
    const { rows } = await world.owner.query<{ subject: string }>("SELECT subject FROM rate_limit_counter WHERE bucket = 'screening'");
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.subject))).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/gmail|synthetic|203\.0\.113/);
  });
});

describe('SCR-06: the conversion from screening to an audit request is an audit event', () => {
  it('records the audit request in the screening’s name and address, as an event, once', async () => {
    const email = 'prospect.convert@clinic-convert.synthetic.test';
    expect((await submitted(submitInput({ contactEmail: email, practiceName: 'Synthetic Convert Clinic' }))).status).toBe('ok');
    await world.price();
    const token = world.tokenFor(email);
    const input = { resultId: token, contactName: 'SYNTHETIC CONTACT', locations: '2', payers: 'SYNTHETIC PAYER ONE, SYNTHETIC PAYER TWO', billingArrangement: 'billing_firm' };
    const converted = await world.call(screeningConvert, { input });
    expect(converted).toEqual({ status: 'ok', data: { redirect: `/screening/results/${token}?requested=1` } });
    const request = (
      await world.owner.query<{ id: string; organization_name: string; contact_email: string; contact_name: string; locations: number; payers: string[]; billing_arrangement: string; status: string }>(
        'SELECT id, organization_name, contact_email, contact_name, locations, payers, billing_arrangement, status FROM prospect_request WHERE contact_email = $1',
        [email],
      )
    ).rows;
    expect(request).toEqual([
      {
        id: expect.any(String) as string,
        organization_name: 'Synthetic Convert Clinic',
        contact_email: email,
        contact_name: 'SYNTHETIC CONTACT',
        locations: 2,
        payers: ['SYNTHETIC PAYER ONE', 'SYNTHETIC PAYER TWO'],
        billing_arrangement: 'billing_firm',
        status: 'new',
      },
    ]);
    const events = await world.owner.query("SELECT actor_kind, object_type, purpose FROM audit_event WHERE action = 'screening_converted' AND object_id = $1", [request[0]?.id]);
    expect(events.rows).toEqual([{ actor_kind: 'system', object_type: 'prospect_request', purpose: 'screening' }]);
    const page = await world.call(screeningResult, { params: { resultId: token, requested: '1' } });
    expect(page).toMatchObject({ status: 'ok', data: { requested: true, converted: true } });
    expect(issuesOf(await world.call(screeningConvert, { input }))).toEqual([{ field: 'input', message: 'an audit was already requested from this screening' }]);
    expect((await world.call(screeningConvert, { input: { ...input, resultId: 'b'.repeat(32) } })).status).toBe('not_found');
    expect((await world.call(screeningConvert, { input: { ...input, resultId: 'not-a-token' } })).status).toBe('not_found');
    expect(issuesOf(await world.call(screeningConvert, { input: { ...input, contactName: '', payers: '', locations: '0', billingArrangement: 'x' } })).map((issue) => issue.field)).toEqual([
      'contactName',
      'locations',
      'payers',
      'billingArrangement',
    ]);
    // The token is the link's alone: only its hash is stored.
    expect(await storedText()).not.toContain(token);
    expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_run WHERE result_token_sha256 = $1', [screeningTokenHash(token)])).rows).toEqual([{ n: 1 }]);
  });
});

describe('a result priced under a rule release since withdrawn (the owner’s ruling of 2026-10-18)', () => {
  it('keeps its notice and may still be converted to an audit request, which prices nothing from the screening', async () => {
    const withdrawn = await ScreeningWorld.create();
    try {
      // SYNTHETIC release 900004 (900001 with one value changed) is put in force over 900001, and the screening pins it.
      await loadRelease(withdrawn.owner, path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/rules/release-synth-900004'), { release: 900004, allowSyntheticFixtureForTests: true });
      const email = 'prospect.withdrawn@clinic-withdrawn.synthetic.test';
      expect((await withdrawn.call(screeningSubmit, { input: submitInput({ contactEmail: email }) })).status).toBe('ok');
      await withdrawn.price();
      const token = withdrawn.tokenFor(email);
      expect(await withdrawn.call(screeningResult, { params: { resultId: token } })).toMatchObject({ status: 'ok', data: { summary: { releaseWithdrawn: false } } });
      await withdrawRelease(withdrawn.owner, { release: 900004, reason: 'SYNTHETIC: withdrawn under a screening result in a test' });
      const page = await withdrawn.call(screeningResult, { params: { resultId: token } });
      expect(page).toMatchObject({ status: 'ok', data: { summary: { releaseNo: 900004, releaseWithdrawn: true }, converted: false } });
      const input = { resultId: token, contactName: 'SYNTHETIC CONTACT', locations: '1', payers: 'SYNTHETIC PAYER', billingArrangement: 'in_house' };
      expect(await withdrawn.call(screeningConvert, { input })).toEqual({ status: 'ok', data: { redirect: `/screening/results/${token}?requested=1` } });
      const events = await withdrawn.owner.query(
        "SELECT e.object_type FROM audit_event e JOIN prospect_request q ON q.id = e.object_id WHERE e.action = 'screening_converted' AND q.contact_email = $1",
        [email],
      );
      expect(events.rows).toEqual([{ object_type: 'prospect_request' }]);
      // The notice stays above the figures after the conversion.
      expect(await withdrawn.call(screeningResult, { params: { resultId: token, requested: '1' } })).toMatchObject({ status: 'ok', data: { summary: { releaseWithdrawn: true }, converted: true } });
    } finally {
      await withdrawn.close();
    }
  });
});

describe('SCR-05, on the server: no screening output says owed, underpaid or recovered, and its email carries no tagline', () => {
  it('holds the result, the refusals and the emails to the screening’s words', async () => {
    const email = 'prospect.words@clinic-words.synthetic.test';
    expect((await submitted(submitInput({ contactEmail: email }))).status).toBe('ok');
    await world.price();
    const result = await world.call(screeningResult, { params: { resultId: world.tokenFor(email) } });
    expect(result.status).toBe('ok');
    const text = JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
    expect(text).not.toMatch(FORBIDDEN);
    const refused = await submitted(submitInput({ headers: ['Patient Name', ...SCREENING_HEADERS], rows: 'x' }));
    expect(JSON.stringify(refused)).not.toMatch(FORBIDDEN);
    expect(world.mail.sent.length).toBeGreaterThan(0);
    for (const message of world.mail.sent) {
      expect(message.variant).toBe('prospect');
      expect(`${message.subject} ${message.body} ${message.html}`).not.toMatch(FORBIDDEN);
      expect(message.html).not.toContain(tagline);
      expect(message.html.replace(/&#39;|&#x27;|&rsquo;/g, "'")).not.toContain(tagline);
    }
  });
});

describe('an expired screening', () => {
  it('is not found at its link, and cannot be converted', async () => {
    const email = `prospect.expired.${randomUUID().slice(0, 6)}@clinic-expired.synthetic.test`;
    expect((await submitted(submitInput({ contactEmail: email }))).status).toBe('ok');
    await world.price();
    const token = world.tokenFor(email);
    expect((await world.call(screeningResult, { params: { resultId: token } })).status).toBe('ok');
    await world.age(30);
    expect((await world.call(screeningResult, { params: { resultId: token } })).status).toBe('not_found');
    expect(
      (await world.call(screeningConvert, { input: { resultId: token, contactName: 'SYNTHETIC CONTACT', locations: '1', payers: 'SYNTHETIC PAYER', billingArrangement: 'in_house' } })).status,
    ).toBe('not_found');
  });
});
