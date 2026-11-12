import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recordAuditEvent, withActor } from './authz';
import { readDatabaseUrl } from './config';
import { APP_ROLE, OPERATOR_ROLE } from './roles';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from './testing';

/**
 * The provider sign-out's outbox and the mark at a membership's end, in the database (LANES.md Queues item 37;
 * docs/adr/0095; test matrix JOB-06, JOB-07 and SGN-19's database rows). What the database proves: one row for each
 * ended membership and each recorded reset, in the cause's own transaction and never for a rolled-back one; ending a
 * membership moves the account's mark and ends its sessions whoever ends it; the claim hands out one due row with the
 * subject, counts the try, leases it and sends it to the back of the order; an answer counts only for the claim it
 * names; the sweep alone decides late and given up, never gives up a row that was not tried, and returns each line
 * until it is acknowledged; each audit row is written once.
 * Synthetic data only: every address is @synthetic.test and every subject is "synthetic-<id>".
 */

let database: MigratedDatabase;
let owner: pg.Client;
/** The superuser's pool, each transaction SET LOCAL ROLE to the role under test. */
let admin: pg.Pool;
let app: pg.Pool;
let north: TenantWorld;

const request = () => `test-${randomUUID()}`;
const code = (attempt: Promise<unknown>) => attempt.then(() => 'accepted', (error: unknown) => (error as { code?: string }).code ?? 'error');

/** One statement as the platform job (tp_operator, no actor, no practice), committed. */
async function operator<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values: unknown[] = [], role: string = OPERATOR_ROLE): Promise<T[]> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.actor_id', '', true), set_config('app.practice_ids', '{}', true)");
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

/** Changes outbox rows as the superuser with triggers off: the test's clock (a past queue time, a lapsed lease). */
async function rewind(set: string, id: string): Promise<void> {
  await owner.query('BEGIN');
  await owner.query("SET LOCAL session_replication_role = 'replica'");
  await owner.query(`UPDATE provider_sign_out SET ${set} WHERE id = $1`, [id]);
  await owner.query('COMMIT');
}

interface Row {
  readonly id: string;
  readonly attempts: number;
  readonly leased: boolean;
  readonly done: boolean;
  readonly late: boolean;
  readonly gave_up: boolean;
  readonly code: string | null;
  readonly wait_minutes: number;
}

async function row(id: string): Promise<Row | undefined> {
  return (
    await owner.query<Row>(
      `SELECT id, attempts::int, leased_until IS NOT NULL AS leased, done_at IS NOT NULL AS done, late_at IS NOT NULL AS late, gave_up_at IS NOT NULL AS gave_up,
              last_error_code AS code, round(extract(epoch FROM next_attempt_at - now()) / 60)::int AS wait_minutes
         FROM provider_sign_out WHERE id = $1`,
      [id],
    )
  ).rows[0];
}

const count = async (sql: string, values: unknown[] = []): Promise<number> => (await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, values)).rows[0]?.n ?? -1;

/** A recorded reset of a new account: its outbox row's ID and the account. Every other row is put out of the claim's reach first. */
async function queued(): Promise<{ id: string; user: string }> {
  await owner.query("UPDATE provider_sign_out SET next_attempt_at = now() + interval '1 day' WHERE done_at IS NULL AND gave_up_at IS NULL").catch(() => undefined);
  const user = await createUser(owner);
  await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId: request() }));
  const id = (await owner.query<{ id: string }>('SELECT id FROM provider_sign_out WHERE user_id = $1', [user])).rows[0]?.id ?? '';
  return { id, user };
}

interface Claimed {
  readonly sign_out_id: string;
  readonly account_id: string;
  readonly subject: string;
  readonly try: number;
}
const claim = () => operator<Claimed>('SELECT sign_out_id, account_id, subject, try::int AS try FROM operator_provider_sign_out_claim()');
const failed = (id: string, attempt: number, name = 'TooManyRequestsException') => operator('SELECT operator_provider_sign_out_failed($1, $2::smallint, $3, $4)', [id, attempt, name, request()]);
const done = (id: string, attempt: number, outcome = 'signed_out') =>
  operator<{ recorded: boolean }>('SELECT operator_provider_sign_out_done($1, $2::smallint, $3, $4) AS recorded', [id, attempt, outcome, request()]);
const overdue = () => operator<{ sign_out_id: string; account_id: string; code: string }>('SELECT sign_out_id, account_id, code FROM operator_provider_sign_outs_overdue($1)', [request()]);
const linesFor = async (id: string) => (await overdue()).filter((line) => line.sign_out_id === id).map((line) => line.code).sort();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  admin = new pg.Pool({ connectionString: database.url, max: 4 });
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  north = await createTenantWorld(owner, 'north');
}, 120_000);

afterAll(async () => {
  await owner?.end();
  if (admin !== undefined) await endPool(admin);
  if (app !== undefined) await endPool(app);
  await database?.drop();
});

describe('JOB-06: what queues a provider sign-out', () => {
  it('writes one row for a recorded reset and for one whose outcome is unknown, under the notice’s guard, and none for a rolled-back cause', async () => {
    const { id, user } = await queued();
    const { rows } = await owner.query(
      `SELECT p.reason, p.attempts::int AS attempts, p.next_attempt_at = p.queued_at AS due, p.queued_at = e.at AS at_event, e.action, p.request_id = e.request_id AS traced
         FROM provider_sign_out p JOIN audit_event e ON e.id = p.source_event_id WHERE p.id = $1`,
      [id],
    );
    expect(rows).toEqual([{ reason: 'password_reset_completed', attempts: 0, due: true, at_event: true, action: 'password_reset_completed', traced: true }]);
    await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_outcome_unknown', objectType: 'user', objectId: user, purpose: 'unverified_code', requestId: request() }));
    expect(await count("provider_sign_out WHERE user_id = $1 AND reason = 'password_reset_outcome_unknown'", [user])).toBe(1);
    // The guard: a reset recorded about another account is skipped, never raised.
    const other = await createUser(owner);
    await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: other, purpose: 'email_code', requestId: request() }));
    expect(await count('provider_sign_out WHERE user_id = $1', [other])).toBe(0);
    // A cause that rolls back leaves no row.
    const undone = await createUser(owner);
    await withActor(app, undone, async (scope) => {
      await recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: undone, purpose: 'email_code', requestId: request() });
      throw new Error('rolled back');
    }).catch(() => undefined);
    expect(await count('provider_sign_out WHERE user_id = $1', [undone])).toBe(0);
  });

  it('SGN-19: ending a membership moves the account’s mark and ends its sessions, whoever ends it, and queues the sign-out with its audit row', async () => {
    const person = await createUser(owner);
    const membership = await addMembership(owner, north.organizationId, person, 'viewer');
    const session = (
      await withActor(app, person, async (scope) => {
        const device = await scope.client.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Test browser') RETURNING id", [person, randomUUID().replaceAll('-', '').padEnd(64, '0')]);
        return scope.client.query<{ id: string }>("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id", [
          person,
          device.rows[0]?.id,
          randomUUID().replaceAll('-', '').padEnd(64, '1'),
        ]);
      })
    ).rows[0]?.id;
    const before = (await app.query<{ at: string }>('SELECT sign_in_step_began()::text AS at')).rows[0]?.at;
    // A future end fires nothing; the end itself does, with no audit row needed for the mark.
    await owner.query("UPDATE membership SET ends_at = now() + interval '1 day' WHERE id = $1", [membership]);
    expect(await count('"user" WHERE id = $1 AND sign_in_not_before IS NULL', [person])).toBe(1);
    await withActor(app, north.adminUserId, async (scope) => {
      await scope.client.query('UPDATE membership SET ends_at = now() WHERE id = $1', [membership]);
      await recordAuditEvent(scope, { action: 'membership_ended', objectType: 'membership', objectId: membership, requestId: request() });
    });
    expect(await count('"user" WHERE id = $1 AND sign_in_not_before > $2::timestamptz', [person, before])).toBe(1);
    expect(await count("user_session WHERE id = $1 AND ended_at IS NOT NULL AND end_reason = 'revoked'", [session])).toBe(1);
    expect(await count("provider_sign_out WHERE user_id = $1 AND reason = 'membership_ended'", [person])).toBe(1);
    // A step begun before the end is refused as SGN-17 states, with its record.
    const why = await app.query<{ why: string | null }>("SELECT sign_in_step_refused($1, $2::timestamptz, 'mfa', $3) AS why", [person, before, request()]);
    expect(why.rows).toEqual([{ why: 'before_reset' }]);
    // The end refuses to run where its sweep would read an old snapshot.
    const second = await addMembership(owner, north.organizationId, person, 'viewer');
    const client = await app.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [north.adminUserId]);
      expect(await code(client.query('UPDATE membership SET ends_at = now() WHERE id = $1', [second]))).toBe('0A000');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('claims one due row a call with the subject, counts the try, leases it and sends it to the back; the application role claims nothing', async () => {
    const first = await queued();
    expect(await code(operator('SELECT * FROM operator_provider_sign_out_claim()', [], APP_ROLE))).toBe('42501');
    expect(await claim()).toEqual([{ sign_out_id: first.id, account_id: first.user, subject: `synthetic-${first.user}`, try: 1 }]);
    // Leased: not claimed again, by this call or another connection's.
    expect(await Promise.all([claim(), claim()])).toEqual([[], []]);
    expect(await row(first.id)).toMatchObject({ attempts: 1, leased: true, wait_minutes: 2 });
    // A lapsed lease is claimed again (the worker died): the try is counted at the claim.
    await rewind("leased_until = now() - interval '1 second', next_attempt_at = now() - interval '1 second'", first.id);
    expect((await claim())[0]).toMatchObject({ sign_out_id: first.id, try: 2 });
    // Not due: not claimed.
    await rewind("leased_until = NULL, next_attempt_at = now() + interval '1 minute'", first.id);
    expect(await claim()).toEqual([]);
    // At 30 tries the claim leaves the row alone: the counter never passes its CHECK.
    await rewind('attempts = 30, leased_until = NULL, next_attempt_at = now()', first.id);
    expect(await claim()).toEqual([]);
    expect(await code(owner.query('UPDATE provider_sign_out SET attempts = 31 WHERE id = $1', [first.id]))).toBe('23514');
  });
});

describe('JOB-07: the answers and the sweep', () => {
  it('steps a failed try by 1, 5, 15, 60 and 60 minutes, stores only a class-like name, and lets only the latest claim answer', async () => {
    const { id } = await queued();
    for (const [attempt, minutes] of [[1, 1], [2, 5], [3, 15], [4, 60], [5, 60]] as const) {
      await rewind('leased_until = NULL, next_attempt_at = now()', id);
      expect((await claim())[0]?.try).toBe(attempt);
      await failed(id, attempt, attempt === 2 ? 'an error with words in it' : 'TooManyRequestsException');
      expect(await row(id), `try ${attempt}`).toMatchObject({ attempts: attempt, leased: false, wait_minutes: minutes, code: attempt === 2 ? 'unknown' : 'TooManyRequestsException' });
    }
    // A stale worker (try 3 of 5) changes nothing, with either answer.
    await failed(id, 3);
    expect(await done(id, 3)).toEqual([{ recorded: false }]);
    expect(await row(id)).toMatchObject({ attempts: 5, done: false, wait_minutes: 60 });
    expect(await code(done(id, 5, 'anything else'))).not.toBe('accepted');
    expect(await done(id, 5, 'no_such_user')).toEqual([{ recorded: true }]);
    expect(await done(id, 5)).toEqual([{ recorded: false }]);
    expect(await count("audit_event e JOIN provider_sign_out p ON p.user_id = e.object_id WHERE p.id = $1 AND e.action = 'provider_signed_out' AND e.actor_kind = 'system' AND e.purpose = p.reason", [id])).toBe(1);
  });

  it('pages LATE at the fourth try once its lease is over and at the fifth whatever its lease, each line until acknowledged and once after', async () => {
    const { id, user } = await queued();
    await rewind('attempts = 3, next_attempt_at = now()', id);
    expect((await claim())[0]?.try).toBe(4);
    // Four tries, the lease running: not late yet (the worker may still answer).
    expect(await linesFor(id)).toEqual([]);
    // The worker died on every try: the fifth claim is late whatever the lease, with the sweep running after the claim.
    await rewind("leased_until = now() - interval '1 second', next_attempt_at = now()", id);
    expect((await claim())[0]?.try).toBe(5);
    expect(await overdue()).toContainEqual({ sign_out_id: id, account_id: user, code: 'LATE' });
    // Returned on every run until the job acknowledges that it wrote the line; then never again.
    expect(await linesFor(id)).toEqual(['LATE']);
    await operator('SELECT operator_provider_sign_out_reported($1, $2)', [id, 'LATE']);
    expect(await linesFor(id)).toEqual([]);
    expect(await row(id)).toMatchObject({ late: true, gave_up: false });
    // And for a row that fails normally: late at the fourth failed try.
    const normal = await queued();
    await rewind('attempts = 3, next_attempt_at = now()', normal.id);
    await claim();
    await failed(normal.id, 4);
    expect(await linesFor(normal.id)).toEqual(['LATE']);
  });

  it('gives up at 30 tries, and at 24 hours only a row that had its four tries; records it once; a late success is still recorded', async () => {
    // Never tried, queued 25 hours ago (the worker was down): claimed, not given up.
    const untried = await queued();
    await rewind("queued_at = now() - interval '25 hours', next_attempt_at = now() - interval '25 hours'", untried.id);
    expect(await linesFor(untried.id)).toEqual([]);
    expect(await row(untried.id)).toMatchObject({ gave_up: false });
    expect((await claim())[0]).toMatchObject({ sign_out_id: untried.id, try: 1 });
    // Four tries and 24 hours old: late and given up, one line each.
    const old = await queued();
    await rewind("attempts = 4, queued_at = now() - interval '25 hours', next_attempt_at = now() + interval '1 hour'", old.id);
    expect(await linesFor(old.id)).toEqual(['GAVE_UP', 'LATE']);
    await linesFor(old.id);
    expect(await count("audit_event WHERE action = 'provider_sign_out_undelivered' AND actor_kind = 'system' AND object_type = 'user' AND object_id = $1", [old.user])).toBe(1);
    // Given up: never claimed, a failure changes nothing, and the answer of its last claim is still recorded.
    await rewind('next_attempt_at = now()', old.id);
    expect(await claim()).toEqual([]);
    await failed(old.id, 4);
    expect(await row(old.id)).toMatchObject({ gave_up: true, wait_minutes: 0 });
    expect(await done(old.id, 4)).toEqual([{ recorded: true }]);
    expect(await count("audit_event WHERE action = 'provider_signed_out' AND object_id = $1", [old.user])).toBe(1);
    // Thirty tries, the last lease over: given up by the sweep alone, no worker having answered.
    const dying = await queued();
    await rewind("attempts = 30, late_at = now(), late_reported_at = now(), leased_until = now() - interval '1 second'", dying.id);
    expect(await linesFor(dying.id)).toEqual(['GAVE_UP']);
    await operator('SELECT operator_provider_sign_out_reported($1, $2)', [dying.id, 'GAVE_UP']);
    expect(await linesFor(dying.id)).toEqual([]);
  });

  it('expires rows done 90 days ago and given-up rows 90 days after their line, and never an undone row', async () => {
    const [finished, abandoned, waiting] = [await queued(), await queued(), await queued()];
    await rewind("attempts = 1, done_at = now() - interval '91 days'", finished.id);
    await rewind("attempts = 4, late_at = now(), gave_up_at = now() - interval '91 days', gave_up_reported_at = now() - interval '91 days'", abandoned.id);
    await rewind("queued_at = now() - interval '200 days'", waiting.id);
    await operator('SELECT operator_provider_sign_outs_expire($1)', [100]);
    expect([await row(finished.id), await row(abandoned.id)]).toEqual([undefined, undefined]);
    expect(await row(waiting.id)).toMatchObject({ done: false });
  });
});
