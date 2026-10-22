import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR } from './migrate';
import { APP_ROLE, OPERATOR_ROLE, SCREENING_ROLE } from './roles';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from './testing';

/**
 * The screening's own consumer in the database (migration 20261106090000; PR 6b-3; docs/adr/0062), on a database of its
 * own, since the queue's tier sums every run of the day:
 *
 * - SCR-17, the queue's order (the founder's Q7 of 2026-10-21): an account's upload past its share of 100,000 rows this
 *   UTC day waits at -k, its k-th such upload, another account's first does not wait, and once the day's normal rows
 *   pass 1,000,000 the next normal upload waits at -1; the cap counts the normal tier alone; operator_screening_due(),
 *   screening_wait() and operator_screening_queue() read the queue in pg-boss's order;
 * - the run keeps its receipt, its account and its place in the queue; staleness is 2 minutes without progress, the
 *   claim and each recorded batch moving the progress forward;
 * - the receipt is clamped into the ten minutes before the run's creation; complete returns it and the wait;
 * - D2's refusal order for what exists now (closed, the ZIP, the rows, the content span, then what the insert checks);
 * - D7: submit_screening()'s body is migration 20261105090000's but for the two new parameters and the run's four new
 *   values;
 * - the release read probes rule_record_by_type: the six keyed types left out, and no sequential scan of rule_record.
 *
 * Synthetic data only.
 */

const CONSUMER_MIGRATION = '20261106090000_screening_consumer.sql';
const LOCATION_MIGRATION = '20261105090000_pricing_location_and_zip_plus_four.sql';
const RELEASE = 900_101;
/** An earlier release, published too: its records are in rule_record beside the one in force. */
const OTHER_RELEASE = 900_100;
const SPLIT = { '11': 'non_facility', '22': 'facility' };
/** The founder's numbers (Q7): an account's share of a UTC day's rows, and the day's cap of normal rows. */
const SHARE = 100_000;
const CAP = 1_000_000;

const hex = (character: string) => character.repeat(64);
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** A keyed subject of an account of its own (the shape of the rate limiter's HMAC: 64 hex characters). */
const account = () => sha256(`account:${randomUUID()}`);
const letters = () =>
  randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));

type Row = readonly [string, string, number, string, string, string, bigint, number];
const ROW: Row = ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 11];

let database: MigratedDatabase;
let admin: pg.Pool;
let specialist: string;

/** One transaction as `role`; committed, or rolled back on error. */
async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(role: string, sql: string, values: unknown[] = [], actorId: string | null = null): Promise<T[]> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [actorId ?? '']);
    const { rows } = await client.query<T>(sql, values);
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** As the superuser with the run's rules off for the transaction: what a test cannot wait for, or make otherwise. */
async function rewind(sql: string, values: unknown[]): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(sql, values);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface Submission {
  readonly subject?: string | null;
  readonly received?: Date | null;
  readonly zip?: string;
  readonly rows?: readonly Row[];
}

const SUBMIT = `SELECT submit_screening(${Array.from({ length: 30 }, (_, index) => `$${String(index + 1)}`).join(', ')}) AS run_id`;

function submitValues(submission: Submission = {}): unknown[] {
  const rows = submission.rows ?? [ROW];
  return [
    `Synthetic Therapy Group ${letters()}`,
    'MN',
    submission.zip ?? '00011',
    null,
    `prospect.${letters()}@synthetic.test`,
    rows.map((row) => row[0]),
    rows.map((row) => row[1]),
    rows.map((row) => row[2]),
    rows.map((row) => row[3]),
    rows.map((row) => row[4]),
    rows.map((row) => row[5]),
    rows.map((row) => row[6].toString()),
    rows.map((row) => row[7]),
    0,
    0,
    '0',
    0,
    '0',
    '0',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    submission.received ?? null,
    submission.subject === undefined ? account() : submission.subject,
    `test-${randomUUID()}`,
  ];
}

async function submit(submission: Submission = {}): Promise<string> {
  const [row] = await as<{ run_id: string }>(APP_ROLE, SUBMIT, submitValues(submission));
  return row?.run_id ?? '';
}

/** The run's place in the queue, as submit_screening() set it. */
async function placeOf(runId: string): Promise<{ wait_reason: string | null; queue_priority: number }> {
  const { rows } = await admin.query<{ wait_reason: string | null; queue_priority: number }>('SELECT wait_reason, queue_priority FROM screening_run WHERE id = $1', [runId]);
  return rows[0] ?? { wait_reason: 'missing', queue_priority: 1 };
}

/** Sets a run's row count as the superuser (a 50,000-row upload costs seconds to send; the tier sums row counts). */
async function sized(runId: string, rowCount: number): Promise<void> {
  await rewind('UPDATE screening_run SET row_count = $2 WHERE id = $1', [runId, rowCount]);
}

/** The normal tier's rows today, as the tier sums them. */
async function normalRowsToday(): Promise<number> {
  const { rows } = await admin.query<{ rows: number }>(
    "SELECT coalesce(sum(row_count), 0)::integer AS rows FROM screening_run WHERE wait_reason IS NULL AND created_at >= date_trunc('day', now(), 'UTC')",
  );
  return rows[0]?.rows ?? 0;
}

/** Claims a run as the consumer; its attempt, or undefined when there was nothing to claim. */
async function claim(runId: string): Promise<number | undefined> {
  return (await as<{ attempt: number }>(SCREENING_ROLE, 'SELECT attempt FROM operator_screening_claim($1)', [runId]))[0]?.attempt;
}

/** Records the run's pending rows as priced, by an attempt, as the consumer. */
async function record(runId: string, attempt: number): Promise<number> {
  const pending = await as<{ row_no: number; claim_count: number; observed_allowed_cents: string }>(SCREENING_ROLE, 'SELECT * FROM operator_screening_rows($1, 0, 5000, $2)', [runId, attempt]);
  const [recorded] = await as<{ n: number }>(
    SCREENING_ROLE,
    'SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) AS n',
    [
      runId,
      pending.map((row) => row.row_no),
      pending.map(() => 'priced'),
      pending.map(() => '5000'),
      pending.map(() => '5000.25'),
      pending.map((row) => String(5_000 * row.claim_count)),
      pending.map((row) => String(5_000 * row.claim_count - Number(row.observed_allowed_cents))),
      pending.map(() => false),
      pending.map(() => null),
      pending.map(() => null),
      pending.map(() => null),
      pending.map(() => null),
      pending.map(() => null),
      pending.map(() => null),
      pending.map(() => null),
      pending.map(() => hex('f')),
      attempt,
    ],
  );
  return recorded?.n ?? 0;
}

async function progressOf(runId: string): Promise<{ started_at: Date; progress_at: Date; attempts: number; status: string }> {
  const { rows } = await admin.query<{ started_at: Date; progress_at: Date; attempts: number; status: string }>(
    'SELECT started_at, progress_at, attempts, status FROM screening_run WHERE id = $1',
    [runId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error('no such run');
  }
  return row;
}

/** Moves a run's claim and progress back by `seconds`, as the superuser (a stale run cannot be waited for). */
async function idle(runId: string, seconds: number): Promise<void> {
  await rewind('UPDATE screening_run SET started_at = started_at - make_interval(secs => $2), progress_at = progress_at - make_interval(secs => $2) WHERE id = $1', [runId, seconds]);
}

/**
 * Release RELEASE, SYNTHETIC: the localities of 00011 (no ZIP+4) and 00012, the content a Medicare row of 2026 reads,
 * 97110's keyed records, and enough keyed and shared records of RELEASE and of OTHER_RELEASE that the planner reads
 * rule_record by its index wherever it can (12,000 fee schedule records a release; carc, rarc, pfs_gpci and a conversion
 * factor as the shared types). Values are placeholders: nothing here prices a row through the engine.
 */
async function publishReleases(): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO rule_release (release_no, manifest_sha256) VALUES ($1, $2), ($3, $4)', [RELEASE, hex('a'), OTHER_RELEASE, hex('b')]);
    await client.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256) VALUES
         ($1, 'locality_map', '{"zip":"00011"}', '{"state":"ZZ","carrier":"99999","locality":"01","rural_indicator":"","plus_four_required":false}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $2),
         ($1, 'ncci_mue', '{"hcpcs":"97110"}', '{"synthetic":true}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $3),
         ($1, 'mppr_rate', '{"hcpcs":"97110","modifier":""}', '{"synthetic":true}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $4),
         ($1, 'mppr_rate', '{"component":"practice_expense"}', '{"synthetic":true}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $5),
         ($1, 'ncci_ptp', '{"column1":"97110","column2":"97110"}', '{"synthetic":true}', '2026-01-01', '2026-12-31', '{"synthetic":true}', 'L1', $6)`,
      [RELEASE, hex('1'), hex('2'), hex('3'), hex('4'), hex('5')],
    );
    await client.query(
      `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256)
       SELECT r.release_no, t.type, jsonb_build_object('code', lpad(g::text, 6, '0')), '{"synthetic":true}', d.effective_from, d.effective_to, '{"synthetic":true}', 'L1',
              encode(sha256(convert_to(r.release_no::text || t.type || g::text || d.effective_from::text, 'UTF8')), 'hex')
         FROM (VALUES ($1::integer), ($2::integer)) r (release_no),
              (VALUES ('pfs_rvu', 12000), ('ncci_ptp', 4000), ('carc', 40), ('rarc', 60), ('pfs_gpci', 12), ('conversion_factor', 1)) t (type, n),
              generate_series(1, t.n) g,
              (VALUES ('2026-01-01'::date, '2026-06-30'::date), ('2026-07-01'::date, '2026-12-31'::date)) d (effective_from, effective_to)`,
      [RELEASE, OTHER_RELEASE],
    );
    await client.query('UPDATE rule_release SET published_at = now() WHERE release_no IN ($1, $2)', [RELEASE, OTHER_RELEASE]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await admin.query('ANALYZE rule_record');
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  admin = new pg.Pool({ connectionString: database.url, max: 4 });
  const owner = await admin.connect();
  try {
    const internal = await createOrganization(owner, 'internal');
    specialist = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, specialist, 'contract_specialist');
  } finally {
    owner.release();
  }
}, 60_000);

afterAll(async () => {
  await endPool(admin);
  await database.drop();
});

describe('D2: the refusals before anything is recorded, in their order (for what exists before 6b-4)', () => {
  it('refuses closed first, then the ZIP, then the content span, and only then what the run itself checks: the account’s subject', async () => {
    const recorded = async () => (await admin.query<{ n: number }>('SELECT count(*)::integer AS n FROM screening_prospect')).rows[0]?.n;
    const outside: Row = ['97110', 'GP', 1, '11', 'medicare_ffs', '2025-Q1', 4_000n, 11];
    // No release and no split: closed, whatever else is wrong.
    await expect(submit({ zip: '00099', rows: [outside], subject: 'not a subject' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_closed' });
    await publishReleases();
    await as(APP_ROLE, 'SELECT console_approve_place_of_service_split($1)', [JSON.stringify(SPLIT)], specialist);
    // The ZIP before the rows' quarter and the subject.
    await expect(submit({ zip: '00099', rows: [outside], subject: 'not a subject' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_zip_unknown' });
    // The rows before the quarter.
    await expect(submit({ rows: [], subject: 'not a subject' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_rows' });
    // The quarter before the subject.
    await expect(submit({ rows: [outside], subject: 'not a subject' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_band_outside_content' });
    // The subject last: the run's CHECK (64 hex characters, never the account itself), or its NOT NULL.
    await expect(submit({ subject: 'prospect@synthetic.test' })).rejects.toMatchObject({ code: '23514', constraint: 'screening_run_rate_subject' });
    await expect(submit({ subject: hex('A') })).rejects.toMatchObject({ code: '23514', constraint: 'screening_run_rate_subject' });
    await expect(submit({ subject: null })).rejects.toMatchObject({ code: '23502' });
    expect(await recorded()).toBe(0);
    expect(await submit()).toMatch(/^[0-9a-f-]{36}$/);
    expect(await recorded()).toBe(1);
  });
});

describe('SCR-17: the queue’s order, by the account’s share and the day’s cap (Q7)', () => {
  it('reads the founder’s numbers from one place, which no role may call', async () => {
    expect((await admin.query('SELECT * FROM screening_wait_limits()')).rows).toEqual([{ account_rows: SHARE, daily_rows: CAP }]);
    for (const role of [APP_ROLE, OPERATOR_ROLE, SCREENING_ROLE]) {
      await expect(as(role, 'SELECT * FROM screening_wait_limits()'), role).rejects.toMatchObject({ code: '42501' });
      await expect(as(role, 'SELECT * FROM screening_queue_tier($1, 1)', [account()]), role).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('puts an account’s uploads past its share at -1, -2 and on, another account’s first at 0, and past the day’s cap the normal tier at -1', async () => {
    const heavy = account();
    // Two uploads of 50,000 and 49,999 rows: the account's 99,999 rows today.
    const first = await submit({ subject: heavy });
    await sized(first, 50_000);
    const second = await submit({ subject: heavy });
    await sized(second, 49_999);
    // Its third, of one row, brings it to exactly its share: still normal.
    const third = await submit({ subject: heavy });
    expect(await placeOf(third)).toEqual({ wait_reason: null, queue_priority: 0 });
    // Past its share: its first such upload at -1, its second at -2.
    const fourth = await submit({ subject: heavy });
    expect(await placeOf(fourth)).toEqual({ wait_reason: 'account_share', queue_priority: -1 });
    const fifth = await submit({ subject: heavy });
    expect(await placeOf(fifth)).toEqual({ wait_reason: 'account_share', queue_priority: -2 });
    // Another account's first goes first.
    const other = await submit();
    expect(await placeOf(other)).toEqual({ wait_reason: null, queue_priority: 0 });
    // A run of another day is not today's: moved to yesterday, the heavy account's first leaves its sum.
    await rewind(
      `UPDATE screening_run SET created_at = created_at - interval '1 day', expires_at = expires_at - interval '1 day', received_at = received_at - interval '1 day'
        WHERE id = $1`,
      [first],
    );
    expect(await placeOf(await submit({ subject: heavy }))).toEqual({ wait_reason: null, queue_priority: 0 });
    await rewind(
      `UPDATE screening_run SET created_at = created_at + interval '1 day', expires_at = expires_at + interval '1 day', received_at = received_at + interval '1 day'
        WHERE id = $1`,
      [first],
    );
    expect(await placeOf(await submit({ subject: heavy }))).toEqual({ wait_reason: 'account_share', queue_priority: -3 });

    // The cap counts the normal tier alone: the heavy account's waiting runs, made as large as runs go, count for nothing.
    await sized(fourth, 50_000);
    await sized(fifth, 50_000);
    // Other accounts' normal uploads bring the day to one row short of the cap.
    for (let rows = await normalRowsToday(); rows < CAP - 1; rows = await normalRowsToday()) {
      // Its one row counted at submission, then its size set so the day stays within the cap.
      await sized(await submit(), Math.min(50_000, CAP - 1 - rows));
    }
    expect(await normalRowsToday()).toBe(CAP - 1);
    const atTheCap = await submit();
    expect(await placeOf(atTheCap)).toEqual({ wait_reason: null, queue_priority: 0 });
    const pastTheCap = await submit();
    expect(await placeOf(pastTheCap)).toEqual({ wait_reason: 'daily_cap', queue_priority: -1 });
    expect(await placeOf(await submit())).toEqual({ wait_reason: 'daily_cap', queue_priority: -1 });
    // An account past its share is past it whatever the cap: its turn comes after the others' at -1 and -2.
    expect(await placeOf(await submit({ subject: heavy }))).toEqual({ wait_reason: 'account_share', queue_priority: -4 });
    // The CHECK holds the two together, and the turn at -20 at most.
    await expect(rewind("UPDATE screening_run SET wait_reason = NULL WHERE id = $1", [pastTheCap])).rejects.toMatchObject({ code: '23514', constraint: 'screening_run_priority' });
    await expect(rewind('UPDATE screening_run SET queue_priority = -21 WHERE id = $1', [fifth])).rejects.toMatchObject({ code: '23514', constraint: 'screening_run_priority' });
  });

  it('gives due runs, the queue’s gauge and a run’s wait in pg-boss’s order: the higher priority first, then the older', async () => {
    const queued = (
      await admin.query<{ id: string; queue_priority: number; received_at: Date }>(
        "SELECT id, queue_priority, received_at FROM screening_run WHERE status = 'queued' ORDER BY queue_priority DESC, created_at, id",
      )
    ).rows;
    expect(queued.length).toBeGreaterThan(20);
    expect(queued.length).toBeLessThanOrEqual(100);
    const due = await as<{ run_id: string; status: string; attempts: number; queue_priority: number }>(SCREENING_ROLE, 'SELECT * FROM operator_screening_due(0, 100)');
    expect(due.map((row) => [row.run_id, row.queue_priority])).toEqual(queued.map((row) => [row.id, row.queue_priority]));
    // Queued for less than the age asked: left to their own job.
    expect(await as(SCREENING_ROLE, 'SELECT * FROM operator_screening_due(3600, 100)')).toEqual([]);

    // A run's wait: its own two values, the runs being priced, and the queued runs taken before it.
    for (const [index, run] of [0, 7, queued.length - 1].map((at) => [at, queued[at]] as const)) {
      const [wait] = await as<{ queue_priority: number; wait_reason: string | null; pricing: number; queued_ahead: number }>(APP_ROLE, 'SELECT * FROM screening_wait($1)', [run?.id]);
      expect(wait, String(index)).toMatchObject({ queue_priority: run?.queue_priority, pricing: 0, queued_ahead: index });
    }
    expect(await as(APP_ROLE, 'SELECT * FROM screening_wait($1)', [randomUUID()])).toEqual([]);

    // The gauge: counts only, the oldest normal run's wait since the web received it.
    const before = Date.now();
    const [gauge] = await as<{ queued: number; queued_waiting: number; pricing: number; oldest_queued_ms: string }>(SCREENING_ROLE, 'SELECT * FROM operator_screening_queue()');
    const normal = queued.filter((row) => row.queue_priority === 0);
    expect(gauge).toMatchObject({ queued: normal.length, queued_waiting: queued.length - normal.length, pricing: 0 });
    const oldest = Math.min(...normal.map((row) => row.received_at.getTime()));
    expect(Number(gauge?.oldest_queued_ms)).toBeGreaterThanOrEqual(before - oldest - 1_000);
    expect(Number(gauge?.oldest_queued_ms)).toBeLessThanOrEqual(Date.now() - oldest + 1_000);
    // The application and the operator read no gauge; the consumer no wait.
    await expect(as(APP_ROLE, 'SELECT * FROM operator_screening_queue()')).rejects.toMatchObject({ code: '42501' });
    await expect(as(OPERATOR_ROLE, 'SELECT * FROM operator_screening_queue()')).rejects.toMatchObject({ code: '42501' });
    await expect(as(SCREENING_ROLE, 'SELECT * FROM screening_wait($1)', [normal[0]?.id])).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps a run’s receipt, account and place in the queue for good', async () => {
    const runId = await submit();
    for (const change of ["received_at = received_at - interval '1 second'", `rate_subject = '${hex('c')}'`, "wait_reason = 'daily_cap', queue_priority = -1"]) {
      await expect(admin.query(`UPDATE screening_run SET ${change} WHERE id = $1`, [runId]), change).rejects.toMatchObject({ code: '23514' });
    }
  });
});

describe('the receipt, and what completion returns', () => {
  it('clamps the receipt into the ten minutes before the run’s creation, so a clock never refuses a prospect', async () => {
    const receivedOf = async (runId: string) =>
      (await admin.query<{ before_ms: number }>('SELECT (extract(epoch FROM created_at - received_at) * 1000)::integer AS before_ms FROM screening_run WHERE id = $1', [runId])).rows[0]
        ?.before_ms;
    expect(await receivedOf(await submit({ received: new Date(Date.now() - 3_600_000) }))).toBe(600_000);
    expect(await receivedOf(await submit({ received: new Date(Date.now() + 3_600_000) }))).toBe(0);
    expect(await receivedOf(await submit({ received: null }))).toBe(0);
    const fiveMinutes = await receivedOf(await submit({ received: new Date(Date.now() - 300_000) }));
    expect(fiveMinutes).toBeGreaterThanOrEqual(295_000);
    expect(fiveMinutes).toBeLessThanOrEqual(305_000);
    const runId = await submit();
    await expect(rewind("UPDATE screening_run SET received_at = created_at - interval '11 minutes' WHERE id = $1", [runId])).rejects.toMatchObject({
      code: '23514',
      constraint: 'screening_run_received',
    });
    await expect(rewind("UPDATE screening_run SET received_at = created_at + interval '1 second' WHERE id = $1", [runId])).rejects.toMatchObject({
      constraint: 'screening_run_received',
    });
  });

  it('returns the receipt and the wait with the address, for the time to email (D3: no pause column)', async () => {
    const heavy = account();
    for (const rows of [SHARE / 2, SHARE / 2]) {
      await sized(await submit({ subject: heavy }), rows);
    }
    const waiting = await submit({ subject: heavy, received: new Date(Date.now() - 120_000) });
    expect((await placeOf(waiting)).wait_reason).toBe('account_share');
    const attempt = await claim(waiting);
    expect(attempt).toBe(1);
    expect(await record(waiting, attempt ?? 0)).toBe(1);
    const [done] = await as<Record<string, unknown>>(SCREENING_ROLE, 'SELECT * FROM operator_screening_complete($1, $2, NULL, $3, $4, $5)', [
      waiting,
      sha256(randomUUID()),
      'phase-two/1',
      `test-${randomUUID()}`,
      attempt,
    ]);
    const stored = (await admin.query<{ received_at: Date }>('SELECT received_at FROM screening_run WHERE id = $1', [waiting])).rows[0]?.received_at;
    expect(done).toEqual({ contact_email: expect.stringMatching(/@synthetic\.test$/) as string, row_count: 1, kept_with: 'none', received_at: stored, wait_reason: 'account_share' });
    expect(Object.keys(done ?? {})).toEqual(['contact_email', 'row_count', 'kept_with', 'received_at', 'wait_reason']);
  });
});

describe('staleness: 2 minutes without progress, the claim and each recorded batch moving it forward', () => {
  it('claims a run again only once nothing has moved it for 2 minutes, and refuses the attempt it overtook', async () => {
    const runId = await submit({ rows: [ROW, ['97110', '', 1, '11', 'ma_noncontracted', '2026-Q2', 2_000n, 11]] });
    expect(await claim(runId)).toBe(1);
    const claimed = await progressOf(runId);
    expect(claimed.progress_at).toEqual(claimed.started_at);
    const dueNow = async () => (await as<{ run_id: string }>(SCREENING_ROLE, 'SELECT run_id FROM operator_screening_due(0, 100)')).some((row) => row.run_id === runId);
    expect(await claim(runId)).toBeUndefined();
    expect(await dueNow()).toBe(false);
    // 119 seconds without progress: not yet.
    await idle(runId, 119);
    expect(await claim(runId)).toBeUndefined();
    expect(await dueNow()).toBe(false);
    // A recorded batch is progress: the slow attempt stays its own.
    const before = await progressOf(runId);
    expect(await record(runId, 1)).toBe(2);
    const after = await progressOf(runId);
    expect(after.progress_at.getTime()).toBeGreaterThan(before.progress_at.getTime());
    expect(after.started_at).toEqual(before.started_at);
    // Past 2 minutes without any: due, and claimed again at attempt 2, which moves its progress.
    await idle(runId, 121);
    expect(await dueNow()).toBe(true);
    expect(await claim(runId)).toBe(2);
    expect((await progressOf(runId)).attempts).toBe(2);
    // The attempt it overtook records nothing more.
    await expect(record(runId, 1)).rejects.toMatchObject({ code: '23514', constraint: 'screening_run_attempt' });
    // The 2 minutes are the same everywhere: the claim's and due's (the worker holds SCREENING_STALE_SECONDS to them).
    const bodies = (await admin.query<{ body: string }>("SELECT prosrc AS body FROM pg_proc WHERE proname IN ('operator_screening_claim', 'operator_screening_due')")).rows;
    expect(bodies).toHaveLength(2);
    for (const { body } of bodies) {
      expect(body.match(/interval '[^']*'/g)).toEqual(["interval '2 minutes'"]);
    }
  });

  it('lets the attempt that claimed a run move its progress forward and nothing else, and no one move it back', async () => {
    const runId = await submit();
    expect(await claim(runId)).toBe(1);
    await expect(admin.query("UPDATE screening_run SET progress_at = progress_at - interval '1 second' WHERE id = $1", [runId])).rejects.toMatchObject({ code: '23514' });
    await expect(admin.query("UPDATE screening_run SET started_at = started_at + interval '1 second', progress_at = progress_at + interval '1 second' WHERE id = $1", [runId])).rejects.toMatchObject({
      code: '23514',
    });
    await admin.query("UPDATE screening_run SET progress_at = progress_at + interval '1 second' WHERE id = $1", [runId]);
    // A queued run has no progress; one being priced always has.
    const queued = await submit();
    await expect(rewind('UPDATE screening_run SET progress_at = now() WHERE id = $1', [queued])).rejects.toMatchObject({ constraint: 'screening_run_progress' });
    await expect(rewind('UPDATE screening_run SET progress_at = NULL WHERE id = $1', [runId])).rejects.toMatchObject({ constraint: 'screening_run_progress' });
    // Ended, it keeps the progress it had.
    await expect(as(SCREENING_ROLE, 'SELECT * FROM operator_screening_fail($1, $2, $3, 1)', [runId, 'PRICING_FAILED', 'x'])).resolves.toHaveLength(1);
    expect((await progressOf(runId)).progress_at).not.toBeNull();
  });
});

describe('the release read: by the record-type index, the six keyed types left out', () => {
  it('returns every record of the shared types in order and none of the keyed, with no sequential scan of rule_record', async () => {
    const runId = await submit();
    expect(await claim(runId)).toBe(1);
    const read = await as<{ record_type: string; effective_from: string }>(SCREENING_ROLE, 'SELECT record_type, effective_from FROM operator_screening_release($1)', [runId]);
    const expected = (
      await admin.query<{ record_type: string; effective_from: string }>(
        `SELECT record_type, effective_from::text FROM rule_record
          WHERE release_no = $1 AND record_type NOT IN ('pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map', 'locality_map_plus_four')
          ORDER BY record_type, effective_from, id`,
        [RELEASE],
      )
    ).rows;
    expect(read).toEqual(expected);
    expect([...new Set(read.map((row) => row.record_type))]).toEqual(['carc', 'conversion_factor', 'pfs_gpci', 'rarc']);
    // Every statement it runs, as auto_explain plans it in this session.
    const client = await admin.connect();
    const plans: string[] = [];
    const listen = (notice: { message?: string }) => {
      plans.push(notice.message ?? '');
    };
    client.on('notice', listen);
    try {
      await client.query("LOAD 'auto_explain'");
      await client.query('SET auto_explain.log_min_duration = 0');
      await client.query('SET auto_explain.log_nested_statements = on');
      await client.query("SET auto_explain.log_level = 'notice'");
      await client.query("SET auto_explain.log_format = 'json'");
      await client.query('SET client_min_messages = notice');
      await client.query('SELECT count(*) FROM operator_screening_release($1)', [runId]);
    } finally {
      client.off('notice', listen);
      await client.query('RESET ALL');
      client.release(true);
    }
    const nested = plans.filter((plan) => plan.includes('rule_record'));
    expect(nested.length).toBeGreaterThanOrEqual(2);
    for (const plan of nested) {
      expect(plan).not.toMatch(/"Node Type": "Seq Scan",[^{}]*"Relation Name": "rule_record"/);
    }
    expect(nested.join('\n')).toMatch(/rule_record_by_type/);
    // A run not being priced reads nothing.
    expect(await as(SCREENING_ROLE, 'SELECT * FROM operator_screening_release($1)', [await submit()])).toEqual([]);
  });
});

describe('D7: submit_screening() is migration 20261105090000’s but for the receipt, the account and the tier', () => {
  /** The CREATE FUNCTION submit_screening(...) statement a migration file holds. */
  function submitStatement(file: string): string {
    const text = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const start = text.indexOf('CREATE FUNCTION submit_screening(');
    const end = text.indexOf('\n$$;', start);
    expect(start, file).toBeGreaterThan(0);
    expect(text.indexOf('CREATE FUNCTION submit_screening(', start + 1), file).toBe(-1);
    return text.slice(start, end + 4);
  }

  it('differs from it in the two parameters before request and the run’s four new values alone, and is the body the database holds', async () => {
    const before = submitStatement(LOCATION_MIGRATION);
    const after = submitStatement(CONSUMER_MIGRATION);
    const signature = ['terms_sha256 text, request text) RETURNS uuid', 'terms_sha256 text, received timestamptz,\n  rate_account_subject text, request text) RETURNS uuid'] as const;
    const run = [
      `    INSERT INTO screening_run (upload_id, release_no, release_manifest_sha256, place_of_service_split_id, row_count)
    SELECT upload.id, in_force, manifest, split, n FROM upload`,
      `    INSERT INTO screening_run (upload_id, release_no, release_manifest_sha256, place_of_service_split_id, row_count, received_at, rate_subject,
                               wait_reason, queue_priority)
    SELECT upload.id, in_force, manifest, split, n, least(greatest(coalesce(received, now()), now() - interval '10 minutes'), now()), rate_account_subject,
           tier.wait_reason, tier.queue_priority
      FROM upload, screening_queue_tier(rate_account_subject, n) tier`,
    ] as const;
    for (const [old] of [signature, run]) {
      expect(before.split(old).length, old).toBe(2);
    }
    expect(after).toBe(before.replace(signature[0], signature[1]).replace(run[0], run[1]));
    // The database holds exactly that body.
    const live = (await admin.query<{ body: string }>("SELECT prosrc AS body FROM pg_proc WHERE proname = 'submit_screening'")).rows;
    expect(live).toHaveLength(1);
    expect(after.slice(after.indexOf('AS $$') + 'AS $$'.length, after.lastIndexOf('$$'))).toBe(live[0]?.body);
  });
});
