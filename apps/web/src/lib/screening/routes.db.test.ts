import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { tagline } from '@paidwhole/brand';
import { loadRelease, withdrawRelease } from '@tp/rules/loader';
import { SCREENING_REJECTION_CODES, screeningTokenHash } from '@tp/worker/screening';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RATE_LIMITS } from '../http/rate-limit';
import type { MutationResult, Outcome } from '../http/route';
import { screeningConvert, screeningPage, screeningReasonMessage, screeningResult, screeningSubmit } from './routes';
import { ScreeningWorld, SCREENING_HEADERS, SAMPLE_ROWS, screeningRow, submitInput } from './test-support/screening-world';

/**
 * The free screening's routes against a scratch database (Change Order 001, CO-04; docs/adr/0062):
 *
 * - SCR-01, the rejection: an upload whose header holds a member-ID or date-of-service column is refused with the
 *   column named by position and kind, and nothing of it is stored but its hash, its row count and the reasons.
 * - SCR-04, the rate limit: per business email domain, per free-mail mailbox however its address is spelled, and per
 *   client address.
 * - SCR-06, the conversion event: converting a screening to an audit request is an audit event.
 * - SCR-05, the wording, on the server's side: no result, message or email says owed, underpaid or recovered, and
 *   the prospect's email carries no tagline.
 *
 * And around them: closed until a split is approved, recording nothing while closed; a ZIP whose locality needs its
 * ZIP+4 refused (the pricing cannot use one; the owner's ruling of 2026-10-18 keeps that until release 1's real
 * locality map loads); an address the mail service can send to; the result read by its link alone, with both figures
 * for a code in the reduction across codes and the database's standings, and not found once expired; a result
 * under a release since withdrawn keeping its notice and still converting (the owner's ruling of 2026-10-18).
 * Synthetic data only.
 */

const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;

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
  it('refuses a member-ID column and a date-of-service column by position and kind, storing the hash, count and reasons alone', async () => {
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
    const { rows } = await world.owner.query<{ status: string; row_count: number; file_sha256: string; rejection_reasons: unknown; contact_email: string }>(
      `SELECT u.status, u.row_count, u.file_sha256, u.rejection_reasons, p.contact_email FROM screening_upload u JOIN screening_prospect p ON p.id = u.prospect_id WHERE p.contact_email = $1`,
      [email],
    );
    expect(rows).toEqual([
      {
        status: 'rejected',
        row_count: 1,
        file_sha256: input.fileSha256,
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
      submitInput({ contactEmail: email, rows: ['SMITH\tGP\t1\t11\tmedicare_ffs\t2026-Q1\t100\t1', 'MARIA\t\t1\t11\tcommercial\t2026-Q1\t100\t1', '97110\tGP\t1\t11\tmedicare_ffs\t2026-Q1\t12345678900\t24'].join('\n') }),
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
    const tampered = await submitted(submitInput({ rows: '97110\tGP\t2\t11\tmedicare_ffs\t2026-01-15\t100\t1' }));
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
    const page = await world.call(screeningPage);
    expect(page).toMatchObject({ status: 'ok', data: { open: true, releaseNo: 900001, sent: false } });
    const outcome = await submitted(submitInput({ contactEmail: email }));
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
    expect(summary).toMatchObject({ practiceName: 'Synthetic Therapy Group', state: 'MN', zip: '00011', releaseNo: 900001, rows: 7, claimLines: 38 });
    expect(summary.contractRequired).toEqual({ rows: 2, claimLines: 23, observedCents: 175_000n });
    expect(summary.notScreened).toEqual({ rows: 2, claimLines: 2, observedCents: 3_700n });
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
    // The sample's 97110 GP x2 at ZIP 00011, ten claims allowed $400.00 in Q1: $36.84 a line before the reduction across
    // codes and $31.45 fully reduced (SYNTHETIC release 900001, before sequestration); $40.00 a line is above both.
    expect(rows.find((row) => row.procedureCode === '97110' && row.payerProduct === 'medicare_ffs')).toMatchObject({
      expectedLineCents: 3_684n,
      reducedLineCents: 3_145n,
      expectedCents: 36_840n,
      reducedCents: 31_450n,
      observedCents: 40_000n,
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
      for (const table of ['screening_prospect', 'screening_upload', 'screening_run']) {
        expect((await closed.owner.query(`SELECT count(*)::int AS n FROM ${table}`)).rows, table).toEqual([{ n: 0 }]);
      }
      expect((await closed.owner.query("SELECT count(*)::int AS n FROM audit_event WHERE action LIKE 'screening_%'")).rows).toEqual([{ n: 0 }]);
      // The definer function refuses it too, whoever calls it.
      await expect(
        closed.owner.query("SELECT reject_screening_upload('SYNTHETIC', 'MN', '00011', 'closed.probe@clinic-closed.synthetic.test', $1, 1, '[{\"code\":\"no_rows\"}]', 'test')", ['e'.repeat(64)]),
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
