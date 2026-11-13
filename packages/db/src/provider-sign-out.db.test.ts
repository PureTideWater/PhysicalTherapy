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

  it('gives up at 30 tries, and at 24 hours only a row that had a try; records it once; a late success is still recorded', async () => {
    // Never tried, queued 25 hours ago (the worker was down): late by its age and paged, never given up untried, and claimed.
    const untried = await queued();
    await rewind("queued_at = now() - interval '25 hours', next_attempt_at = now() - interval '25 hours'", untried.id);
    expect(await linesFor(untried.id)).toEqual(['LATE']);
    expect(await row(untried.id)).toMatchObject({ late: true, gave_up: false });
    expect((await claim())[0]).toMatchObject({ sign_out_id: untried.id, try: 1 });
    // Four tries the provider failed and 24 hours old: late and given up, one line each.
    const old = await queued();
    await rewind("attempts = 4, last_error_code = 'TooManyRequestsException', queued_at = now() - interval '25 hours', next_attempt_at = now() + interval '1 hour'", old.id);
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

describe('SGN-28: a reset whose own transaction was never recorded still queues the provider sign-out', () => {
  const rowsOf = async (user: string) =>
    (
      await owner.query<{ reason: string; actor_kind: string; actor_id: string | null; action: string; traced: boolean }>(
        `SELECT p.reason, e.actor_kind, e.actor_id, e.action, p.request_id = e.request_id AS traced
           FROM provider_sign_out p JOIN audit_event e ON e.id = p.source_event_id WHERE p.user_id = $1 ORDER BY p.queued_at`,
        [user],
      )
    ).rows;
  const unrecorded = (user: string) => withActor(app, user, async (scope) => (await scope.client.query<{ queued: boolean }>('SELECT provider_sign_out_unrecorded_reset($1) AS queued', [request()])).rows[0]?.queued);

  it('queues one sign-out for the acting account alone, from its own audit row, with no lock on the account and no session ended', async () => {
    const [user, other] = [await createUser(owner), await createUser(owner)];
    // Another transaction holds the account's row as the reset's own tries do (FOR NO KEY UPDATE, docs/adr/0093 D2): the
    // call does not wait on it.
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE', [user]);
      expect(await code(unrecorded(user))).toBe('accepted');
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    expect(await rowsOf(user)).toEqual([{ reason: 'password_reset_unrecorded', actor_kind: 'user', actor_id: user, action: 'password_reset_unrecorded', traced: true }]);
    expect(await rowsOf(other)).toEqual([]);
    // The trigger's row is due from the moment it was queued, as the operator's is (review W65 N4).
    expect(await count('provider_sign_out WHERE user_id = $1 AND attempts = 0 AND next_attempt_at = queued_at', [user])).toBe(1);
    // It moves no mark: the reset's own record does that, and this is not it.
    expect((await owner.query<{ mark: Date | null }>('SELECT sign_in_not_before AS mark FROM "user" WHERE id = $1', [user])).rows[0]?.mark).toBeNull();
  });

  it('writes nothing more while one waits with no try in flight, and queues again once that one is claimed or done', async () => {
    const user = await createUser(owner);
    expect(await unrecorded(user)).toBe(true);
    expect(await unrecorded(user)).toBe(false);
    expect((await rowsOf(user)).length).toBe(1);
    // A try in flight may already have asked the provider, before this reset: it does not cover it.
    await owner.query("UPDATE provider_sign_out SET leased_until = now() + interval '2 minutes' WHERE user_id = $1", [user]);
    expect(await unrecorded(user)).toBe(true);
    expect((await rowsOf(user)).length).toBe(2);
    // Nor does a row whose try failed (review W65 S1): its lease is cleared and its next try is up to an hour away, so
    // it must not hold back the sign-out of a later reset. Only a row never yet tried, due at once, covers a new call.
    await owner.query("UPDATE provider_sign_out SET attempts = 1, leased_until = NULL, last_error_code = 'TooManyRequestsException', next_attempt_at = now() + interval '60 minutes' WHERE user_id = $1", [user]);
    expect(await unrecorded(user)).toBe(true);
    expect((await rowsOf(user)).length).toBe(3);
    expect(await unrecorded(user)).toBe(false);
  });

  it('is never lost to its trace ID: a request ID the outbox would refuse is stored as none, by the account’s door and by the operator’s (review W65 N2)', async () => {
    const traces = async (user: string) =>
      (await owner.query<{ outbox: string | null; event: string | null }>('SELECT p.request_id AS outbox, e.request_id AS event FROM provider_sign_out p JOIN audit_event e ON e.id = p.source_event_id WHERE p.user_id = $1', [user])).rows;
    for (const unfit of ['x'.repeat(129), 'a forwarded header, with spaces', '']) {
      const [own, named] = [await createUser(owner), await createUser(owner)];
      expect(await code(withActor(app, own, (scope) => scope.client.query('SELECT provider_sign_out_unrecorded_reset($1)', [unfit])))).toBe('accepted');
      expect(await traces(own)).toEqual([{ outbox: null, event: null }]);
      expect(await code(operator('SELECT operator_provider_sign_out_request($1, $2)', [named, unfit]))).toBe('accepted');
      expect(await traces(named)).toEqual([{ outbox: null, event: null }]);
    }
    // A fitting one is kept, and no ID at all is no error.
    const [kept, none] = [await createUser(owner), await createUser(owner)];
    const fitting = request();
    await withActor(app, kept, (scope) => scope.client.query('SELECT provider_sign_out_unrecorded_reset($1)', [fitting]));
    expect(await traces(kept)).toEqual([{ outbox: fitting, event: fitting }]);
    expect(await code(operator('SELECT operator_provider_sign_out_request($1, $2)', [none, null]))).toBe('accepted');
    expect(await traces(none)).toEqual([{ outbox: null, event: null }]);
  });

  it('is the account’s own act only: no actor is refused, the application role cannot write the action itself, and the operator role cannot call it', async () => {
    const user = await createUser(owner);
    expect(await code(operator('SELECT provider_sign_out_unrecorded_reset($1)', [request()], APP_ROLE))).toBe('42501');
    expect(await code(operator('SELECT provider_sign_out_unrecorded_reset($1)', [request()]))).toBe('42501');
    expect(await code(withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_unrecorded', objectType: 'user', objectId: user, requestId: request() })))).toBe('42501');
    expect(await rowsOf(user)).toEqual([]);
  });

  it('lets the operator queue it for a named account where the database was unreachable, once while one waits, and no one else', async () => {
    const user = await createUser(owner);
    const first = await operator<{ id: string | null }>('SELECT operator_provider_sign_out_request($1, $2) AS id', [user, request()]);
    expect(first[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await rowsOf(user)).toEqual([{ reason: 'password_reset_unrecorded', actor_kind: 'system', actor_id: null, action: 'password_reset_unrecorded', traced: true }]);
    expect((await operator<{ id: string | null }>('SELECT operator_provider_sign_out_request($1, $2) AS id', [user, request()]))[0]?.id).toBeNull();
    expect(await code(operator('SELECT operator_provider_sign_out_request($1, $2)', [randomUUID(), request()]))).toBe('P0002');
    expect(await code(withActor(app, user, (scope) => scope.client.query('SELECT operator_provider_sign_out_request($1, $2)', [user, request()])))).toBe('42501');
    // Due from the moment it was queued, as the oldest-first order of the claim needs (review W65 N4).
    expect(await count('provider_sign_out WHERE user_id = $1 AND attempts = 0 AND next_attempt_at = queued_at', [user])).toBe(1);
    // The job claims it like any other row.
    await owner.query("UPDATE provider_sign_out SET next_attempt_at = now() + interval '1 day' WHERE done_at IS NULL AND gave_up_at IS NULL AND user_id <> $1", [user]);
    expect((await claim())[0]).toMatchObject({ sign_out_id: first[0]?.id, account_id: user, try: 1 });
    // Once it has been tried it covers no later call: the operator may queue another (review W65 S1).
    await owner.query('UPDATE provider_sign_out SET leased_until = NULL WHERE user_id = $1', [user]);
    expect((await operator<{ id: string | null }>('SELECT operator_provider_sign_out_request($1, $2) AS id', [user, request()]))[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('JOB-09: the sweep judges late by the row’s age whatever its tries, and gives up by age only a row whose try was answered', () => {
  it('marks a row late 15 minutes after it was queued, tried or not, leased or not; and not a minute sooner', async () => {
    const [untried, leased, young] = [await queued(), await queued(), await queued()];
    await rewind("queued_at = now() - interval '16 minutes'", untried.id);
    await rewind("queued_at = now() - interval '16 minutes', attempts = 1, leased_until = now() + interval '1 minute'", leased.id);
    await rewind("queued_at = now() - interval '14 minutes'", young.id);
    expect(await linesFor(young.id)).toEqual([]);
    expect(await linesFor(untried.id)).toEqual(['LATE']);
    expect(await linesFor(leased.id)).toEqual(['LATE']);
    expect(await row(untried.id)).toMatchObject({ late: true, gave_up: false });
    // Late is not given up: the row is still claimed.
    await owner.query("UPDATE provider_sign_out SET next_attempt_at = now() + interval '1 day' WHERE id <> $1 AND done_at IS NULL", [untried.id]);
    await rewind('next_attempt_at = now()', untried.id);
    expect((await claim())[0]).toMatchObject({ sign_out_id: untried.id, try: 1 });
  });

  it('gives a row up 24 hours after it was queued once one try has been answered as failed, once, never under a running lease, never a done row, never a row not yet tried, and never one only claimed', async () => {
    const [untried, inFlight, finished, tried] = [await queued(), await queued(), await queued(), await queued()];
    await rewind("queued_at = now() - interval '25 hours'", untried.id);
    await rewind("queued_at = now() - interval '25 hours', attempts = 1, leased_until = now() + interval '1 minute'", inFlight.id);
    await rewind("queued_at = now() - interval '25 hours', done_at = now() - interval '24 hours'", finished.id);
    await rewind("queued_at = now() - interval '25 hours', attempts = 1, last_error_code = 'TooManyRequestsException'", tried.id);
    // One answered try and no running lease: given up, one audit row, however often the sweep runs.
    expect(await linesFor(tried.id)).toEqual(['GAVE_UP', 'LATE']);
    await linesFor(tried.id);
    expect(await count("audit_event WHERE action = 'provider_sign_out_undelivered' AND actor_kind = 'system' AND object_type = 'user' AND object_id = $1", [tried.user])).toBe(1);
    expect(await linesFor(finished.id)).toEqual([]);
    // Its one try still running: late, not given up. Its lease over with no answer (the worker was stopped between
    // the claim and the call: nothing may have been sent, review W65 S2): still not given up, and claimed again.
    expect(await linesFor(inFlight.id)).toEqual(['LATE']);
    expect(await row(inFlight.id)).toMatchObject({ late: true, gave_up: false });
    await rewind("leased_until = now() - interval '1 second', next_attempt_at = now()", inFlight.id);
    expect(await linesFor(inFlight.id)).toEqual(['LATE']);
    expect(await row(inFlight.id)).toMatchObject({ gave_up: false });
    expect((await claim())[0]).toMatchObject({ sign_out_id: inFlight.id, try: 2 });
    // That try answered as failed: now its age gives it up.
    await failed(inFlight.id, 2);
    expect(await linesFor(inFlight.id)).toEqual(['GAVE_UP', 'LATE']);
    // Never tried: late and paged on every sweep, never given up, whatever its age, and no audit row says it was.
    await rewind("queued_at = now() - interval '30 days'", untried.id);
    expect(await linesFor(untried.id)).toEqual(['LATE']);
    expect(await linesFor(untried.id)).toEqual(['LATE']);
    expect(await row(untried.id)).toMatchObject({ attempts: 0, late: true, gave_up: false });
    expect(await count("audit_event WHERE action = 'provider_sign_out_undelivered' AND object_id = $1", [untried.user])).toBe(0);
  });

  it('pages a row still waiting again a day after its LATE line was acknowledged, so one no run reaches is never paged once and then silent', async () => {
    const waiting = await queued();
    // Due from the moment it was queued, as the oldest-first order of the claim needs (review W65 N4).
    expect(await count('provider_sign_out WHERE id = $1 AND attempts = 0 AND next_attempt_at = queued_at', [waiting.id])).toBe(1);
    await rewind("queued_at = now() - interval '16 minutes'", waiting.id);
    expect(await linesFor(waiting.id)).toEqual(['LATE']);
    await operator('SELECT operator_provider_sign_out_reported($1, $2)', [waiting.id, 'LATE']);
    expect(await linesFor(waiting.id)).toEqual([]);
    await rewind("late_reported_at = now() - interval '23 hours'", waiting.id);
    expect(await linesFor(waiting.id)).toEqual([]);
    await rewind("late_reported_at = now() - interval '25 hours'", waiting.id);
    expect(await linesFor(waiting.id)).toEqual(['LATE']);
    expect(await linesFor(waiting.id)).toEqual(['LATE']);
    await operator('SELECT operator_provider_sign_out_reported($1, $2)', [waiting.id, 'LATE']);
    expect(await linesFor(waiting.id)).toEqual([]);
    // A done row and a given-up row owe no second line, however old the acknowledgement.
    const [finished, given] = [await queued(), await queued()];
    await rewind("done_at = now(), late_at = now() - interval '2 days', late_reported_at = now() - interval '2 days'", finished.id);
    await rewind("gave_up_at = now() - interval '2 days', gave_up_reported_at = now() - interval '2 days', late_at = now() - interval '2 days', late_reported_at = now() - interval '2 days'", given.id);
    expect(await linesFor(finished.id)).toEqual([]);
    expect(await linesFor(given.id)).toEqual([]);
  });

  it('after an outage tries the oldest rows first; a row a run does not reach stays late and is tried by a later run, and is given up only after its own try', async () => {
    const [newest, oldest, middle] = [await queued(), await queued(), await queued()];
    await rewind("queued_at = now() - interval '25 hours', next_attempt_at = now() - interval '25 hours'", newest.id);
    await rewind("queued_at = now() - interval '27 hours', next_attempt_at = now() - interval '27 hours'", oldest.id);
    await rewind("queued_at = now() - interval '26 hours', next_attempt_at = now() - interval '26 hours'", middle.id);
    // The first run reaches one row, the oldest, and then sweeps: the two it did not reach are late, not given up.
    expect((await claim())[0]).toMatchObject({ sign_out_id: oldest.id, try: 1 });
    const lines = await overdue();
    for (const waiting of [middle, newest]) {
      expect(lines.filter((line) => line.sign_out_id === waiting.id).map((line) => line.code)).toEqual(['LATE']);
      expect(await row(waiting.id)).toMatchObject({ attempts: 0, gave_up: false });
    }
    // The one it tried failed: it had its try, and at its age the sweep gives it up.
    await failed(oldest.id, 1);
    expect(await linesFor(oldest.id)).toEqual(['GAVE_UP', 'LATE']);
    // Later runs reach the others in the order they were queued, each at its first try.
    expect((await claim())[0]).toMatchObject({ sign_out_id: middle.id, try: 1 });
    expect((await claim())[0]).toMatchObject({ sign_out_id: newest.id, try: 1 });
    expect(await claim()).toEqual([]);
  });
});

describe('JOB-07: the claim names the cause', () => {
  it('returns the request ID of the event that queued the row', async () => {
    const { id } = await queued();
    const cause = (await owner.query<{ request_id: string }>('SELECT request_id FROM provider_sign_out WHERE id = $1', [id])).rows[0]?.request_id;
    const claimed = await operator<{ sign_out_id: string; cause_request_id?: string }>('SELECT * FROM operator_provider_sign_out_claim()');
    expect(claimed[0]).toMatchObject({ sign_out_id: id, cause_request_id: cause });
  });
});
