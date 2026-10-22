import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { tagline } from '@paidwhole/brand';
import { loadRelease, withdrawRelease } from '@tp/rules/loader';
import { SCREENING_REJECTION_CODES, encodeScreeningRows, screeningTokenHash } from '@tp/worker/screening';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ATTRIBUTION_COOKIE } from '../http/attribution';
import { RATE_LIMITS } from '../http/rate-limit';
import type { MutationResult, Outcome } from '../http/route';
import { contentQuarters, quarterRowsLayBefore } from './content-span';
import { SCREENING_LABELS_VERSION } from './labels';
import { NO_PATIENT_INFORMATION, SCREENING_ZIP_MESSAGES, screeningConvert, screeningOpened, screeningPage, screeningReasonMessage, screeningResult, screeningSubmit } from './routes';
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
 * - SCR-15, a ZIP split across localities (PR 6b; the founder's ruling of 2026-10-18, 11:47 UTC, superseding ruling 3):
 *   the ZIP code field takes five digits or ZIP+4; a ZIP that needs its ZIP+4 is refused until it is given ("enter the
 *   ZIP+4"), one the ZIP+4 list does not hold is refused, and one whose ZIP+4 list is not loaded is refused as not
 *   loaded, with or without a ZIP+4, before any ZIP+4 is asked for; the ZIP+4 is kept only for a ZIP that needs it, and
 *   the result names it.
 * - SCR-16, a Medicare row in a quarter outside the release's loaded content (the founder's answer of 2026-10-21 to
 *   Q6 (a)): the browser leaves it out and counts it, a request that sends one anyway is refused by its row, and the
 *   result says how many rows were not screened and that PaidWhole has not loaded the content for them.
 *
 * And around them: closed until a split is approved, recording nothing while closed; an address the mail service can send to; the result read by
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

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
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
          outside_content_rows: 0,
          outside_content_claim_lines: 0,
          outside_content_allowed_cents: 0,
        },
        prospect: {
          practice_name: 'Synthetic Therapy Group',
          state: 'MN',
          zip: '00011',
          zip_plus_four: null,
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
    // A quarter inside release 900001's loaded content (2026), so the Medicare row is kept (SCR-16).
    const quarter = '2026-Q2';
    const quarters = await contentQuarters(world.owner, 900001, now);
    const header = SCREENING_HEADERS.join(',');
    const kept = `97110,GP,2,11,ma_noncontracted,${quarter},440.00,11`;
    // SYNTHETIC files: the same kept row, and a different small row (3 claim lines, then 7) that the browser leaves out.
    const files = [`${header}\r\n${kept}\r\nG0283,GP,1,22,ma_noncontracted,${quarter},136.84,3\r\n`, `${header}\r\n${kept}\r\n97140,GP,1,11,medicare_ffs,${quarter},210.00,7\r\n`];
    const hashes: string[] = [];
    for (const [index, file] of files.entries()) {
      const bytes = new TextEncoder().encode(file);
      const parsed = parseScreeningBytes({ name: 'totals.csv', type: 'text/csv', size: bytes.length }, bytes, now, quarters);
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

describe('SCR-15: a ZIP split across Medicare localities (PR 6b)', () => {
  const kept = async (email: string) =>
    (await world.owner.query<{ zip: string; zip_plus_four: string | null }>('SELECT zip, zip_plus_four FROM screening_prospect WHERE contact_email = $1', [email])).rows;

  it('says the ZIP+4 list is not loaded under a release without one, before asking for a ZIP+4 it could not use, and never "check the digits"', async () => {
    const email = 'prospect.plusfour@clinic-plusfour.synthetic.test';
    // 900001 flags 00012 and has no ZIP+4 list: PaidWhole has not loaded it, so the prospect is not sent to look up a
    // ZIP+4 first (review of PR 6b-2, finding 22); a ZIP+4 given changes nothing.
    expect(issuesOf(await submitted(submitInput({ zip: '00012', contactEmail: email })))).toEqual([
      { field: 'zip', message: 'PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP code yet, so a screening cannot price it. Try again later.' },
    ]);
    expect(issuesOf(await submitted(submitInput({ zip: '00012-0001', contactEmail: email })))).toEqual([
      { field: 'zip', message: 'PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP code yet, so a screening cannot price it. Try again later.' },
    ]);
    expect(SCREENING_ZIP_MESSAGES.screening_locality_not_loaded).toBe('PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP code yet, so a screening cannot price it. Try again later.');
    // A field the route does not read is ignored; nothing is kept of a refused ZIP.
    expect(issuesOf(await submitted({ ...submitInput({ zip: '00012', contactEmail: email }), zipPlusFour: '0001' })).map((issue) => issue.field)).toEqual(['zip']);
    expect(await kept(email)).toEqual([]);
    expect(issuesOf(await submitted(submitInput({ zip: '00099' })))).toEqual([{ field: 'zip', message: 'this ZIP code is not in the Medicare locality map in force; check it' }]);
    // Not a ZIP code at all: the form's own field.
    for (const zip of ['0001', '00011-12', '00011 1234']) {
      expect(issuesOf(await submitted(submitInput({ zip }))), zip).toEqual([{ field: 'zip', message: 'the practice’s ZIP code: five digits, or ZIP+4 such as 27601-1234' }]);
    }
  });

  it('takes a ZIP+4 with or without its hyphen, and keeps none for a ZIP that does not need one', async () => {
    for (const [zip, email] of [
      ['00011-1234', 'prospect.zip9.hyphen@clinic-zip9.synthetic.test'],
      ['000111234', 'prospect.zip9.digits@clinic-zip9.synthetic.test'],
    ] as const) {
      expect(await submitted(submitInput({ zip, contactEmail: email })), zip).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
      expect(await kept(email)).toEqual([{ zip: '00011', zip_plus_four: null }]);
    }
  });

  it('under a release with the ZIP+4 list, keeps the ZIP+4 a ZIP needs and refuses one the list does not hold', async () => {
    const split = await ScreeningWorld.create({ releases: [900006] });
    try {
      const send = (zip: string, contactEmail: string) => split.call(screeningSubmit, { input: submitInput({ zip, contactEmail }) });
      const email = 'prospect.zip9.split@clinic-zip9-split.synthetic.test';
      expect(await send('00012-5000', email)).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
      expect((await split.owner.query('SELECT zip, zip_plus_four FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([{ zip: '00012', zip_plus_four: '5000' }]);
      // The result names the ZIP+4 that chose the locality (review of PR 6b-2, finding 21).
      await split.price();
      const result = ok(await split.call(screeningResult, { params: { resultId: split.tokenFor(email) } }));
      expect(result.summary).toMatchObject({ zip: '00012', zipPlusFour: '5000' });
      // The gap between the list's ranges: the digits may be right (Q37 is open), so never "check the four digits".
      expect(issuesOf(await send('00012-9100', 'prospect.zip9.gap@clinic-zip9-gap.synthetic.test'))).toEqual([
        { field: 'zip', message: 'Medicare’s ZIP+4 list in force does not list this ZIP+4. If the four digits after the hyphen are right, a screening cannot price this ZIP+4 yet.' },
      ]);
      expect(issuesOf(await send('00012', 'prospect.zip9.none@clinic-zip9-none.synthetic.test'))).toEqual([{ field: 'zip', message: SCREENING_ZIP_MESSAGES.screening_zip_plus_four }]);
    } finally {
      await split.close();
    }
  }, 120_000);
});

describe('SCR-16: a Medicare row in a quarter outside the loaded content (Q6 (a))', () => {
  it('names the quarters loaded on the page, refuses a Medicare row sent around the browser by its row, and takes another product’s row of that quarter', async () => {
    const page = ok(await world.call(screeningPage));
    // 900001's MUE and per-code MPPR content is 2026's: its quarters up to the current one.
    expect(page.contentQuarters).toEqual(await contentQuarters(world.owner, 900001, new Date()));
    expect(page.contentQuarters[0]?.from).toBe('2026-Q1');
    const email = 'prospect.outside@clinic-outside.synthetic.test';
    const rows = [screeningRow('97110', 'medicare_ffs', { modifiers: ['GP'] }), screeningRow('97140', 'ma_noncontracted', { band: '2025-Q4', claims: 20 })];
    expect(issuesOf(await submitted(submitInput({ contactEmail: email, rows })))).toEqual([
      { field: 'upload', message: 'Row 2: the service band’s quarter is outside the Medicare content PaidWhole has loaded, so a Medicare row in it cannot be screened; leave it out' },
    ]);
    const refused = await world.owner.query('SELECT u.status, u.rejection_reasons FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1', [email]);
    // The code, row and field, never the quarter.
    expect(refused.rows).toEqual([{ status: 'rejected', rejection_reasons: [{ code: 'band_outside_content', row: 2, field: 'service_band' }] }]);
    const commercial = [screeningRow('97110', 'medicare_ffs', { modifiers: ['GP'] }), screeningRow('97140', 'commercial', { band: '2025-Q4', claims: 20 })];
    expect(await submitted(submitInput({ contactEmail: 'prospect.outside.commercial@clinic-outside.synthetic.test', rows: commercial }))).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
  });

  it('stores what the browser left out for its quarter as three numbers, and the result says how many rows were not screened', async () => {
    const email = 'prospect.outside.counted@clinic-outside-counted.synthetic.test';
    const outsideContent = { rows: 12, claimLines: 380, allowedCents: 4_120_000n };
    expect(await submitted(submitInput({ contactEmail: email, outsideContent, leftOut: { rows: 1, claimLines: 3, allowedCents: 900n } }))).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    const upload = await world.owner.query(
      `SELECT u.row_count, u.left_out_rows, u.outside_content_rows, u.outside_content_claim_lines::int AS claim_lines, u.outside_content_allowed_cents::text AS allowed
         FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`,
      [email],
    );
    expect(upload.rows).toEqual([{ row_count: 7, left_out_rows: 1, outside_content_rows: 12, claim_lines: 380, allowed: '4120000' }]);
    await world.price();
    const result = ok(await world.call(screeningResult, { params: { resultId: world.tokenFor(email) } }));
    expect(result.summary.outsideContent).toEqual({ rows: 12, claimLines: 380, observedCents: 4_120_000n });
    // Where the rows left out lay is the run's own quarter's inference (quarterRowsLayBefore, pinned at fixed dates in
    // content-span.test.ts) over the release's content as of the run.
    expect(result.summary.outsideContentBefore).toBe(quarterRowsLayBefore(await contentQuarters(world.owner, 900001, result.summary.createdAt), result.summary.createdAt));
    // And pinned here at a fixed time: a screening made after 900001's content ends (2027-Q2; its link opens until 30
    // days later, so the run's time is never in the past) cannot say where its rows lay. Set as the test's superuser,
    // its triggers off.
    const run = (await world.owner.query<{ id: string }>('SELECT r.id FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1', [email])).rows[0]?.id;
    const after = new Date(Math.max(Date.now(), Date.parse('2027-05-15T12:00:00Z')));
    await world.owner.query('BEGIN');
    await world.owner.query("SET LOCAL session_replication_role = 'replica'");
    await world.owner.query("UPDATE screening_run SET created_at = $2, expires_at = $2::timestamptz + interval '30 days' WHERE id = $1", [run, after]);
    await world.owner.query('COMMIT');
    expect(ok(await world.call(screeningResult, { params: { resultId: world.tokenFor(email) } })).summary.outsideContentBefore).toBeNull();
    // Counted apart from every figure: the file's own totals are the rows sent.
    expect(result.summary).toMatchObject({ rows: 7, claimLines: 79 });
  });

  it('takes only outside-content numbers the browser could have counted, and records nothing otherwise', async () => {
    const email = 'prospect.outside.bad@clinic-outside-bad.synthetic.test';
    for (const outsideContent of [
      { rows: '1', claimLines: '10', allowedCents: '0' },
      { rows: '0', claimLines: '11', allowedCents: '0' },
      { rows: '1', claimLines: '100001', allowedCents: '0' },
      { rows: '1', claimLines: '11', allowedCents: '27500001' },
      { rows: '49994', claimLines: '549934', allowedCents: '0' },
      { rows: 'x', claimLines: '0', allowedCents: '0' },
      { rows: '1', claimLines: '11', allowedCents: '4.5' },
    ]) {
      expect(issuesOf(await submitted(submitInput({ contactEmail: email, outsideContent }))), JSON.stringify(outsideContent)).toEqual([
        { field: 'upload', message: 'the file could not be read here; choose it again' },
      ]);
    }
    expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([{ n: 0 }]);
  });
});

describe('a clean upload: a ZIP the pricing can use, stored, queued, priced, read by its link alone', () => {

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
    expect(summary.outsideContent).toEqual({ rows: 0, claimLines: 0, observedCents: 0n });
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

describe('SCR-10 to SCR-13: attribution, the counts-only outcome and the opened signal through the routes (audit #57)', () => {
  /** A link's codes with a campaign the founder lists (beforeAll), so every row keeps it. */
  const COOKIE = { [ATTRIBUTION_COOKIE]: 's=linkedin&m=paid-social&c=fall-launch&k=paid_social' };
  /** The same with a code of a code's shape that no one listed: a person's name typed into a link. */
  const NAMED = 'jane-doe-follow-up';
  const UNLISTED_COOKIE = { [ATTRIBUTION_COOKIE]: `s=linkedin&m=paid-social&c=${NAMED}&k=paid_social` };
  const convertInput = (resultId: string) => ({ resultId, contactName: 'SYNTHETIC CONTACT', locations: '2', payers: 'SYNTHETIC PAYER', billingArrangement: 'in_house' });

  beforeAll(async () => {
    await world.owner.query("INSERT INTO marketing_campaign (code, label, added_by) VALUES ('fall-launch', 'SYNTHETIC fall launch', $1)", [world.specialistId]);
  });

  it('keeps how the prospect heard of us, the cookie’s codes and kind of click and the referring firm, with an outcome the database writes', async () => {
    const email = `attributed.${randomUUID().slice(0, 8)}@clinic-attributed.synthetic.test`;
    const outcome = await world.call(screeningSubmit, { input: { ...submitInput({ contactEmail: email }), heardFrom: 'social', referringFirm: '  Synthetic   Billing Partners ' }, cookies: COOKIE });
    expect(outcome).toEqual({ status: 'ok', data: { redirect: '/screening?sent=1' } });
    const { rows } = await world.owner.query(
      `SELECT p.source, p.utm_source, p.utm_medium, p.utm_campaign, p.paid_click, p.referring_firm, p.followup_consent_sha256, p.screening_terms_sha256, o.stage, o.channel, o.campaign, o.source AS outcome_source
         FROM screening_prospect p JOIN screening_upload u ON u.prospect_id = p.id JOIN screening_outcome o ON o.upload_id = u.id WHERE p.contact_email = $1`,
      [email],
    );
    expect(rows).toEqual([
      {
        source: 'social',
        utm_source: 'linkedin',
        utm_medium: 'paid-social',
        utm_campaign: 'fall-launch',
        paid_click: 'paid_social',
        referring_firm: 'Synthetic Billing Partners',
        followup_consent_sha256: null,
        screening_terms_sha256: null,
        stage: 'accepted',
        // paid-social is no medium the list knows: the paid click names the channel; the code is listed, so kept.
        channel: 'paid_social',
        campaign: 'fall-launch',
        outcome_source: 'social',
      },
    ]);
  });

  it('refuses a source off the list and a firm’s name that holds an identifier or runs too long, recording nothing; a cookie that is not codes is dropped', async () => {
    for (const [extra, issue] of [
      [{ heardFrom: 'friend' }, { field: 'heardFrom', message: 'choose one of the listed answers, or leave it blank' }],
      [{ referringFirm: 'Synthetic Billing 555-201-3344' }, { field: 'referringFirm', message: NO_PATIENT_INFORMATION }],
      [{ referringFirm: 'x'.repeat(201) }, { field: 'referringFirm', message: 'the firm’s name, at most 200 characters' }],
    ] as const) {
      const email = `refused.field.${randomUUID().slice(0, 8)}@clinic-fields.synthetic.test`;
      const outcome = await world.call(screeningSubmit, { input: { ...submitInput({ contactEmail: email }), ...extra } });
      expect(issuesOf(outcome), JSON.stringify(extra)).toEqual([issue]);
      expect((await world.owner.query('SELECT count(*)::int AS n FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([{ n: 0 }]);
    }
    const email = `forged.${randomUUID().slice(0, 8)}@clinic-forged.synthetic.test`;
    await world.call(screeningSubmit, { input: submitInput({ contactEmail: email }), cookies: { [ATTRIBUTION_COOKIE]: 's=Jane%20Doe&m=email&c=a%40b&k=gclid' } });
    expect((await world.owner.query('SELECT source, utm_source, utm_medium, utm_campaign, paid_click FROM screening_prospect WHERE contact_email = $1', [email])).rows).toEqual([
      { source: null, utm_source: null, utm_medium: 'email', utm_campaign: null, paid_click: null },
    ]);
  });

  it('keeps a refused upload’s attribution and its refused outcome, codes only', async () => {
    const email = `refused.attributed.${randomUUID().slice(0, 8)}@clinic-refused-attr.synthetic.test`;
    const headers = [...SCREENING_HEADERS, 'Member ID'];
    await world.call(screeningSubmit, { input: { ...submitInput({ contactEmail: email, headers }), heardFrom: 'event' }, cookies: COOKIE });
    expect(
      (
        await world.owner.query(
          `SELECT p.source, p.utm_campaign, o.stage, o.refusal_codes, o.row_band, o.channel FROM screening_prospect p JOIN screening_upload u ON u.prospect_id = p.id
             JOIN screening_outcome o ON o.upload_id = u.id WHERE p.contact_email = $1`,
          [email],
        )
      ).rows,
    ).toEqual([{ source: 'event', utm_campaign: 'fall-launch', stage: 'refused', refusal_codes: ['phi_column'], row_band: '1_100', channel: 'paid_social' }]);
  });

  it('records a person’s first open from the signal alone, once, answering alike for any link; converting carries the attribution, keeps the summary and marks the outcome', async () => {
    const email = `opened.${randomUUID().slice(0, 8)}@clinic-opened.synthetic.test`;
    await world.call(screeningSubmit, { input: { ...submitInput({ contactEmail: email }), heardFrom: 'search', referringFirm: 'Synthetic Billing Partners' }, cookies: COOKIE });
    await world.price();
    const token = world.tokenFor(email);
    const run = async () =>
      (
        await world.owner.query<{ id: string; first_opened_at: Date | null; band: string | null }>(
          `SELECT r.id, r.first_opened_at, o.first_open_band AS band FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id
             JOIN screening_outcome o ON o.upload_id = u.id WHERE p.contact_email = $1`,
          [email],
        )
      ).rows[0];
    // The page's GET records nothing.
    expect((await world.call(screeningResult, { params: { resultId: token } })).status).toBe('ok');
    expect(await run()).toMatchObject({ first_opened_at: null, band: null });
    // The signal: alike for a malformed, an unknown and a real link; the real one records the first open, once.
    for (const resultId of ['not-a-token', 'abcdefghijklmnopqrstuvwxyzabcdef', token, token]) {
      expect(await world.call(screeningOpened, { input: { resultId } }), resultId).toEqual({ status: 'ok', data: null });
    }
    const opened = await run();
    expect(opened?.first_opened_at).toBeInstanceOf(Date);
    expect(opened?.band).toBe('same_day');
    expect((await world.owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'screening_result_opened' AND object_id = $1", [opened?.id])).rows).toEqual([{ n: 1 }]);
    // A cross-site POST is refused before anything is read.
    expect(await screeningOpened.invoke({ cookies: { get: () => undefined, set: () => undefined, delete: () => undefined }, params: {}, input: { resultId: token }, requestId: 'x', userAgent: null, origin: 'https://elsewhere.example', fetchSite: 'cross-site' }, world.services)).toEqual({ status: 'csrf_refused' });
    expect(ok(await world.call(screeningConvert, { input: convertInput(token) }))).toEqual({ redirect: `/screening/results/${token}?requested=1` });
    const request = (
      await world.owner.query(
        `SELECT q.from_screening, q.source, q.utm_source, q.utm_medium, q.utm_campaign, q.paid_click, q.referring_firm, l.result_first_opened_at = r.first_opened_at AS lead_opened, o.converted
           FROM screening_run r JOIN prospect_request q ON q.id = r.converted_prospect_request_id JOIN screening_lead l ON l.prospect_request_id = q.id
           JOIN screening_outcome o ON o.upload_id = r.upload_id WHERE r.id = $1`,
        [opened?.id],
      )
    ).rows;
    expect(request).toEqual([
      { from_screening: true, source: 'search', utm_source: 'linkedin', utm_medium: 'paid-social', utm_campaign: 'fall-launch', paid_click: 'paid_social', referring_firm: 'Synthetic Billing Partners', lead_opened: true, converted: true },
    ]);
    expect(ok(await world.call(screeningResult, { params: { resultId: token } })).converted).toBe(true);
  });

  it('keeps an unlisted campaign code as other in every row, and puts the code given in no log line, job, email, audit event or refusal (the founder’s ruling of 2026-10-21)', async () => {
    const email = `unlisted.${randomUUID().slice(0, 8)}@clinic-unlisted.synthetic.test`;
    // A refusal the database makes (a ZIP the locality map does not price) says nothing of the code.
    const refused = await world.call(screeningSubmit, { input: submitInput({ contactEmail: `unlisted.zip.${randomUUID().slice(0, 8)}@clinic-unlisted.synthetic.test`, zip: '00099' }), cookies: UNLISTED_COOKIE });
    expect(refused.status).toBe('invalid');
    expect(JSON.stringify(refused)).not.toContain(NAMED);
    await world.call(screeningSubmit, { input: { ...submitInput({ contactEmail: email }), heardFrom: 'search' }, cookies: UNLISTED_COOKIE });
    await world.call(screeningSubmit, { input: { ...submitInput({ contactEmail: `unlisted.refused.${randomUUID().slice(0, 8)}@clinic-unlisted.synthetic.test`, headers: [...SCREENING_HEADERS, 'Member ID'] }) }, cookies: UNLISTED_COOKIE });
    await world.price();
    const token = world.tokenFor(email);
    expect((await world.call(screeningOpened, { input: { resultId: token } })).status).toBe('ok');
    expect(ok(await world.call(screeningConvert, { input: convertInput(token) }))).toEqual({ redirect: `/screening/results/${token}?requested=1` });
    const kept = (
      await world.owner.query(
        `SELECT p.utm_campaign AS prospect, o.campaign AS outcome, l.utm_campaign AS lead, q.utm_campaign AS request
           FROM screening_prospect p JOIN screening_upload u ON u.prospect_id = p.id JOIN screening_run r ON r.upload_id = u.id JOIN screening_outcome o ON o.upload_id = u.id
           JOIN prospect_request q ON q.id = r.converted_prospect_request_id JOIN screening_lead l ON l.prospect_request_id = q.id
          WHERE p.contact_email = $1`,
        [email],
      )
    ).rows;
    expect(kept).toEqual([{ prospect: 'other', outcome: 'other', lead: 'other', request: 'other' }]);
    const held = await world.owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT utm_campaign AS code FROM screening_prospect UNION ALL SELECT utm_campaign FROM screening_lead
         UNION ALL SELECT utm_campaign FROM prospect_request UNION ALL SELECT campaign FROM screening_outcome
         UNION ALL SELECT e::text FROM audit_event e) t
        WHERE strpos(t.code, $1) > 0`,
      [NAMED],
    );
    expect(held.rows).toEqual([{ n: 0 }]);
    // The services' log lines (the web routes' and the worker's sweep), the jobs queued and the emails sent.
    expect(world.logLines.length).toBeGreaterThan(0);
    for (const [what, value] of [
      ['log lines', world.logLines],
      ['jobs', [world.queue.jobs, world.queue.screeningRuns]],
      ['emails', world.mail.sent],
    ] as const) {
      expect(JSON.stringify(value), what).not.toContain(NAMED);
    }
  });

  it('offers the source list on the page, and names the labels’ version the database names', async () => {
    const page = ok(await world.call(screeningPage));
    expect(page.sources[0]).toEqual({ value: '', label: 'Choose one (optional)' });
    expect(page.sources.map((option) => option.value).slice(1)).toEqual(['search', 'billing_firm', 'colleague', 'association', 'event', 'social', 'paidwhole_email', 'article', 'other']);
    expect((await world.owner.query<{ v: string }>('SELECT screening_labels_version() AS v')).rows[0]?.v).toBe(SCREENING_LABELS_VERSION);
  });
});
