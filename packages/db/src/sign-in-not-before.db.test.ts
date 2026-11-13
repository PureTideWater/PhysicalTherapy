import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recordAuditEvent, withActor } from './authz';
import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR } from './migrate';
import { APP_DEV_LOGIN, APP_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, OPERATOR_ROLE, OWNER_ROLE, SCREENING_ROLE, WORKER_DEV_LOGIN } from './roles';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from './testing';

/**
 * SGN-17 and SGN-18's database rows (migration 20261112090000; docs/adr/0093): a sign-in step begun before a password
 * reset is refused after it. What the database proves: the account's own recorded reset (completed, or its outcome
 * unknown) moves the account's mark on the database's clock, never back, and ends every open session, in the reset's
 * transaction, under the password notice's guard, and only at READ COMMITTED; a session that carries its attempt's start
 * is refused at or before the mark and ahead of the clock, under the account's row lock, so a sign-in racing a reset is
 * either ended or refused in either order; a row with no start (the previous image's) is neither checked nor locked;
 * the account's row first closes the lock cycle the insert trigger and the sweep would otherwise add;
 * sign_in_step_refused() judges and records in one call (the reason; one row for an account, a step and a mark) and counts
 * no failure; sign_in_lock_key_across_reset() locks an account only on the record of a key registered across its reset;
 * who owns and may call each function;
 * the migration's lock loop queues nobody; and its preflight.
 * Synthetic data only: every address is @synthetic.test.
 */

const MIGRATION = '20261112090000_sign_in_not_before.sql';
const DEFINER_PATH = ['search_path=pg_catalog, public, pg_temp'];
const INVOKER_PATH = ['search_path=pg_catalog, pg_temp'];
const REFUSED = { code: '23514', constraint: 'user_session_sign_in_not_before' } as const;
const STEPS = ['new_password', 'mfa_setup', 'mfa', 'key', 'register_key', 'key_registered'] as const;
const ROLES = [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, SCREENING_ROLE, APP_DEV_LOGIN, WORKER_DEV_LOGIN] as const;
/** The first key of the advisory locks the lock-loop test paces the loop with; the second is the pause's number. */
const LOOP_PAUSES = 20261112;
const WITH_START = "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', $4::timestamptz) RETURNING id";
/** The previous image's insert (apps/web/src/lib/auth/sessions.ts before this change): no start. */
const WITHOUT_START = "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id";

let database: MigratedDatabase;
/** The superuser on the scratch database: seeds and reads past every policy. */
let owner: pg.Client;
/** The application's dev login (tp_app_dev), as the web's requests use it. */
let app: pg.Pool;
const clients: pg.Client[] = [];

interface Failure {
  readonly code: string;
  readonly constraint: string | undefined;
}

const code = (attempt: Promise<unknown>) => attempt.then(() => 'accepted', (error: unknown) => (error as { code?: string }).code ?? 'error');
const failure = (attempt: Promise<unknown>): Promise<'accepted' | Failure> =>
  attempt.then(
    () => 'accepted' as const,
    (error: unknown) => {
      const { code: given, constraint } = error as { code?: string; constraint?: string };
      return { code: given ?? 'error', constraint };
    },
  );
const request = () => `test-${randomUUID()}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const tokenHash = () => createHash('sha256').update(randomUUID()).digest('hex');
/** Whether the promise settles within `ms`. */
const settles = (work: Promise<unknown>, ms: number): Promise<boolean> =>
  Promise.race([work.then(() => true, () => true), pause(ms).then(() => false)]);

interface Session {
  readonly client: pg.Client;
  /** Its backend, read before the transaction opens: a query on a connection waits behind its blocked statement. */
  readonly pid: number;
}

async function connect(url: string): Promise<Session> {
  const client = new pg.Client({ connectionString: url });
  client.on('error', () => undefined);
  await client.connect();
  clients.push(client);
  const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0;
  return { client, pid };
}

/** A connection of its own as the application's login, in an open transaction acting as `user`, as withActor opens one. */
async function actorTransaction(user: string, isolation = 'READ COMMITTED'): Promise<Session> {
  const session = await connect(database.appUrl);
  await session.client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
  await session.client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
  return session;
}

async function close(client: pg.Client): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end().catch(() => undefined);
}

/** True once backend `pid` waits for a lock it has not been granted; false after 5 s. */
async function waits(pid: number): Promise<boolean> {
  for (let tries = 0; tries < 500; tries += 1) {
    const { rows } = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND NOT granted', [pid]);
    if ((rows[0]?.n ?? 0) > 0) {
      return true;
    }
    await pause(10);
  }
  return false;
}

/** The attempt's start as the flow reads it, kept as the database's text so no digit is lost. */
async function began(): Promise<string> {
  return (await app.query<{ at: string }>('SELECT sign_in_step_began()::text AS at')).rows[0]?.at ?? '';
}

/** A start read now and already past: the next clock reading is in a later millisecond. */
async function beganAndPassed(): Promise<string> {
  const at = await began();
  await owner.query('SELECT pg_sleep(0.003)');
  return at;
}

async function markOf(user: string): Promise<string | null> {
  return (await owner.query<{ mark: string | null }>('SELECT sign_in_not_before::text AS mark FROM "user" WHERE id = $1', [user])).rows[0]?.mark ?? null;
}

async function setMark(user: string, expression: string): Promise<string> {
  return (await owner.query<{ mark: string }>(`UPDATE "user" SET sign_in_not_before = ${expression} WHERE id = $1 RETURNING sign_in_not_before::text AS mark`, [user])).rows[0]?.mark ?? '';
}

async function newDevice(user: string): Promise<string> {
  return withActor(app, user, async (scope) => {
    const { rows } = await scope.client.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Test browser') RETURNING id", [user, tokenHash()]);
    return rows[0]?.id ?? '';
  });
}

/** A session opened as the user in one committed transaction: with the start given, or with none (the previous image's insert). */
async function openSession(user: string, device: string, start: string | undefined, token: string = tokenHash()): Promise<string> {
  return withActor(app, user, async (scope) => {
    const { rows } = await scope.client.query<{ id: string }>(start === undefined ? WITHOUT_START : WITH_START, start === undefined ? [user, device, token] : [user, device, token, start]);
    return rows[0]?.id ?? '';
  });
}

interface SessionEnd {
  readonly ended: boolean;
  readonly end_reason: string | null;
}

async function sessionEnd(id: string): Promise<SessionEnd | undefined> {
  return (await owner.query<SessionEnd>('SELECT ended_at IS NOT NULL AS ended, end_reason FROM user_session WHERE id = $1', [id])).rows[0];
}

/** The account's own recorded reset, as the web records it: as the user, naming the user. */
async function recordReset(user: string, action: 'password_reset_completed' | 'password_reset_outcome_unknown' = 'password_reset_completed', requestId: string = request()): Promise<void> {
  await withActor(app, user, (scope) =>
    recordAuditEvent(scope, { action, objectType: 'user', objectId: user, purpose: action === 'password_reset_completed' ? 'email_code' : 'unverified_code', requestId }),
  );
}

const RESET_EVENT = "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code')";

interface EventRow {
  readonly actor_kind: string;
  readonly actor_id: string | null;
  readonly action: string;
  readonly object_type: string;
  readonly object_id: string;
  readonly purpose: string | null;
  readonly request_id: string | null;
}

async function securityEvents(user: string): Promise<EventRow[]> {
  return (
    await owner.query<EventRow>(
      "SELECT actor_kind, actor_id, action, object_type, object_id, purpose, request_id FROM audit_event WHERE object_type = 'user' AND object_id = $1 AND action = 'security_event' ORDER BY at, id",
      [user],
    )
  ).rows;
}

/** Why the step is refused (`no_account`, `no_start`, `ahead_of_clock`, `before_reset`), or null when it is not. */
async function stepRefused(user: string, start: string | null, step: string | null, requestId: string = request()): Promise<string | null | undefined> {
  return (await app.query<{ refused: string | null }>('SELECT sign_in_step_refused($1, $2::timestamptz, $3, $4) AS refused', [user, start, step, requestId])).rows[0]?.refused;
}

/** One of the migration's DO blocks, as it stands in the file: the first that holds `marker`. */
function doBlock(marker: string): string {
  const text = readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const block = text
    .split(/^DO \$\$$/m)
    .slice(1)
    .map((rest) => `DO $$${rest.slice(0, rest.indexOf('\n$$;') + 4)}`)
    .find((candidate) => candidate.includes(marker));
  if (block === undefined) {
    throw new Error(`${MIGRATION} has no DO block holding ${marker}`);
  }
  return block;
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
}, 120_000);

afterAll(async () => {
  for (const client of clients) {
    await close(client);
  }
  await endPool(app);
  await owner.end();
  await database.drop();
});

describe('the two columns (SGN-17; docs/adr/0093 D1, D4)', () => {
  it('are nullable timestamps with no default; the application role inserts a session’s start and writes neither the start afterwards nor the mark', async () => {
    const { rows } = await owner.query<{ relation: string; name: string; type: string; not_null: boolean; has_default: boolean }>(
      `SELECT a.attrelid::regclass::text AS relation, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null, a.atthasdef AS has_default
         FROM pg_attribute a
        WHERE (a.attrelid, a.attname) IN (('"user"'::regclass, 'sign_in_not_before'), ('user_session'::regclass, 'sign_in_began_at')) ORDER BY 1`,
    );
    expect(rows).toEqual([
      { relation: '"user"', name: 'sign_in_not_before', type: 'timestamp with time zone', not_null: false, has_default: false },
      { relation: 'user_session', name: 'sign_in_began_at', type: 'timestamp with time zone', not_null: false, has_default: false },
    ]);
    for (const role of ROLES) {
      const { rows: may } = await owner.query<{ start_insert: boolean; start_update: boolean; mark_insert: boolean; mark_update: boolean }>(
        `SELECT has_column_privilege($1, 'user_session', 'sign_in_began_at', 'INSERT') AS start_insert, has_column_privilege($1, 'user_session', 'sign_in_began_at', 'UPDATE') AS start_update,
                has_column_privilege($1, '"user"', 'sign_in_not_before', 'INSERT') AS mark_insert, has_column_privilege($1, '"user"', 'sign_in_not_before', 'UPDATE') AS mark_update`,
        [role],
      );
      const holdsApp = (await owner.query<{ member: boolean }>("SELECT pg_has_role($1, $2, 'USAGE') AS member", [role, APP_ROLE])).rows[0]?.member === true;
      expect(may[0], role).toEqual({ start_insert: holdsApp, start_update: false, mark_insert: false, mark_update: false });
    }
    const user = await createUser(owner);
    const device = await newDevice(user);
    const session = await openSession(user, device, await began());
    expect(await code(withActor(app, user, (scope) => scope.client.query('UPDATE "user" SET sign_in_not_before = NULL WHERE id = $1', [user])))).toBe('42501');
    expect(await code(withActor(app, user, (scope) => scope.client.query("UPDATE \"user\" SET sign_in_not_before = now() - interval '1 day' WHERE id = $1", [user])))).toBe('42501');
    expect(await code(withActor(app, user, (scope) => scope.client.query('UPDATE user_session SET sign_in_began_at = now() WHERE id = $1', [session])))).toBe('42501');
  });

  it('reads the attempt’s start from the database’s clock in whole milliseconds, never ahead of it', async () => {
    const { rows } = await app.query<{ micros: number; behind: boolean; close: boolean }>(
      `SELECT (extract(microseconds FROM b.at)::bigint % 1000)::int AS micros, b.at <= clock_timestamp() AS behind, b.at > clock_timestamp() - interval '5 seconds' AS close
         FROM (SELECT sign_in_step_began() AS at FROM generate_series(1, 200)) b`,
    );
    expect(rows).toHaveLength(200);
    expect(rows.every((row) => row.micros === 0 && row.behind && row.close)).toBe(true);
  });
});

describe('what moves the mark (SGN-17, SGN-18; docs/adr/0093 D1, D9)', () => {
  it('moves it to the database’s clock in the reset’s own transaction, for a completed reset and for one whose outcome is unknown, and a second reset moves it on', async () => {
    for (const action of ['password_reset_completed', 'password_reset_outcome_unknown'] as const) {
      const user = await createUser(owner);
      expect(await markOf(user), action).toBeNull();
      const before = (await owner.query<{ at: string }>('SELECT clock_timestamp()::text AS at')).rows[0]?.at;
      await recordReset(user, action);
      const first = await markOf(user);
      expect(first, action).not.toBeNull();
      const { rows } = await owner.query<{ inside: boolean }>('SELECT $1::timestamptz <= $2::timestamptz AND $2::timestamptz <= clock_timestamp() AS inside', [before, first]);
      expect(rows[0]?.inside, action).toBe(true);
      await recordReset(user, action);
      const moved = await owner.query<{ later: boolean }>('SELECT sign_in_not_before > $2::timestamptz AS later FROM "user" WHERE id = $1', [user, first]);
      expect(moved.rows[0]?.later, action).toBe(true);
      // The notice is the completed reset's alone: an unknown outcome claims no change (docs/adr/0093 D9).
      const notices = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM password_notice WHERE user_id = $1', [user]);
      expect(notices.rows[0]?.n, action).toBe(action === 'password_reset_completed' ? 2 : 0);
    }
  });

  it('is rolled back with the reset’s transaction', async () => {
    const user = await createUser(owner);
    const reset = await actorTransaction(user);
    await reset.client.query(RESET_EVENT, [user]);
    expect((await reset.client.query<{ set: boolean }>('SELECT sign_in_not_before IS NOT NULL AS set FROM "user" WHERE id = $1', [user])).rows[0]?.set).toBe(true);
    await reset.client.query('ROLLBACK');
    expect(await markOf(user)).toBeNull();
  });

  it('never moves it back: a mark ahead of the clock stays', async () => {
    const user = await createUser(owner);
    const ahead = await setMark(user, "clock_timestamp() + interval '1 hour'");
    await recordReset(user);
    expect(await markOf(user)).toBe(ahead);
  });

  it('moves it only under the notice’s guard: not for another account’s event naming this one, a system or service actor’s, another object type, or any other action', async () => {
    const user = await createUser(owner);
    const other = await createUser(owner);
    const device = await newDevice(user);
    const session = await openSession(user, device, await began());
    // Another account names this one: recorded, and neither account's mark moves.
    await withActor(app, other, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId: request() }));
    await withActor(app, other, (scope) => recordAuditEvent(scope, { action: 'password_reset_outcome_unknown', objectType: 'user', objectId: user, purpose: 'unverified_code', requestId: request() }));
    // The object is not a user, though its ID is the actor's.
    await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user_session', objectId: user, purpose: 'email_code', requestId: request() }));
    // Other actions of the account itself.
    for (const action of ['password_reset_requested', 'password_changed', 'sign_in']) {
      await withActor(app, user, (scope) => recordAuditEvent(scope, { action, objectType: 'user', objectId: user, requestId: request() }));
    }
    // A system's and a service's event, written by the owner past the application's policy.
    for (const kind of ['system', 'service']) {
      for (const action of ['password_reset_completed', 'password_reset_outcome_unknown']) {
        await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, $2, $3, 'user', $1)", [kind === 'system' ? null : user, kind, action]).catch(async () => {
          // A kind that takes no actor ID, or needs one: the other form.
          await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, $2, $3, 'user', $4)", [kind === 'system' ? user : null, kind, action, user]);
        });
      }
    }
    expect(await markOf(user)).toBeNull();
    expect(await markOf(other)).toBeNull();
    expect(await sessionEnd(session)).toEqual({ ended: false, end_reason: null });
  });

  it('has the notice trigger’s guard, word for word, with its two actions (docs/adr/0091 D3)', async () => {
    const { rows } = await owner.query<{ name: string; definition: string }>(
      "SELECT t.tgname AS name, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t WHERE t.tgrelid = 'audit_event'::regclass AND t.tgname IN ('audit_event_password_notice', 'audit_event_sign_in_not_before') ORDER BY 1",
    );
    const [notice, mark] = rows.map((row) => row.definition);
    const NOTICE_ACTION = "(new.action = 'password_reset_completed'::text)";
    const MARK_ACTIONS = "(new.action = ANY (ARRAY['password_reset_completed'::text, 'password_reset_outcome_unknown'::text]))";
    expect(notice).toContain(`WHEN ((${NOTICE_ACTION} AND `);
    expect(mark).toContain(`WHEN ((${MARK_ACTIONS} AND `);
    expect(mark?.replace(MARK_ACTIONS, NOTICE_ACTION).replaceAll('audit_event_sign_in_not_before', 'audit_event_password_notice')).toBe(notice);
    expect(mark).toContain('AFTER INSERT ON public.audit_event FOR EACH ROW');
  });

  it('refuses to run above READ COMMITTED, where the sweep would read an old snapshot: the event is not recorded and nothing moves', async () => {
    for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
      for (const action of ['password_reset_completed', 'password_reset_outcome_unknown']) {
        const user = await createUser(owner);
        const reset = await actorTransaction(user, isolation);
        expect(await code(reset.client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, 'user', $2, 'user', $1)", [user, action])), `${isolation} ${action}`).toBe('0A000');
        await close(reset.client);
        expect(await markOf(user), isolation).toBeNull();
        const recorded = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_event WHERE actor_id = $1 AND action = $2', [user, action]);
        expect(recorded.rows[0]?.n, isolation).toBe(0);
      }
    }
  });
});

describe('the sweep (docs/adr/0093 D1)', () => {
  it('ends every open session of the account as revoked whatever the caller did first, leaving an ended one as it ended and another account’s open', async () => {
    for (const action of ['password_reset_completed', 'password_reset_outcome_unknown'] as const) {
      const user = await createUser(owner);
      const other = await createUser(owner);
      const device = await newDevice(user);
      const withStart = await openSession(user, device, await began());
      const withoutStart = await openSession(user, device, undefined);
      const signedOut = await openSession(user, device, await began());
      await withActor(app, user, (scope) => scope.client.query("UPDATE user_session SET ended_at = now(), end_reason = 'signed_out' WHERE id = $1", [signedOut]));
      const others = await openSession(other, await newDevice(other), await began());
      // No revoke_user_sessions() first: the event alone ends them.
      await recordReset(user, action);
      expect(await sessionEnd(withStart), action).toEqual({ ended: true, end_reason: 'revoked' });
      expect(await sessionEnd(withoutStart), action).toEqual({ ended: true, end_reason: 'revoked' });
      expect(await sessionEnd(signedOut), action).toEqual({ ended: true, end_reason: 'signed_out' });
      expect(await sessionEnd(others), action).toEqual({ ended: false, end_reason: null });
    }
  });
});

describe('the database refuses a stale session (SGN-17; docs/adr/0093 D4)', () => {
  it('takes a start after the mark, and any past start on an account never reset; refuses one at the mark, before it, and ahead of the clock, by the constraint’s name', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    const early = await beganAndPassed();
    // Never reset: any start not ahead of the clock.
    expect(await failure(openSession(user, device, early))).not.toEqual(REFUSED);
    expect(await failure(openSession(user, device, '2000-01-01T00:00:00Z'))).not.toEqual(REFUSED);
    expect(await failure(openSession(user, device, '-infinity'))).not.toEqual(REFUSED);
    // Ahead of the clock, with no mark at all.
    expect(await failure(openSession(user, device, 'infinity'))).toEqual(REFUSED);
    const minuteAhead = (await owner.query<{ at: string }>("SELECT (clock_timestamp() + interval '1 minute')::text AS at")).rows[0]?.at;
    expect(await failure(openSession(user, device, minuteAhead))).toEqual(REFUSED);

    const before = await beganAndPassed();
    await recordReset(user);
    await owner.query('SELECT pg_sleep(0.003)');
    const after = await began();
    expect(await failure(openSession(user, device, before))).toEqual(REFUSED);
    expect(await failure(openSession(user, device, early))).toEqual(REFUSED);
    expect(await failure(openSession(user, device, '-infinity'))).toEqual(REFUSED);
    expect(await failure(openSession(user, device, 'infinity'))).toEqual(REFUSED);
    const opened = await openSession(user, device, after);
    expect(await sessionEnd(opened)).toEqual({ ended: false, end_reason: null });
    const stored = await owner.query<{ same: boolean }>('SELECT sign_in_began_at = $2::timestamptz AS same FROM user_session WHERE id = $1', [opened, after]);
    expect(stored.rows[0]?.same).toBe(true);

    // At the mark exactly, and one millisecond either side of it.
    const mark = await setMark(user, "date_trunc('milliseconds', clock_timestamp() - interval '1 second')");
    const around = await owner.query<{ at: string; under: string; over: string }>(
      "SELECT $1::timestamptz::text AS at, ($1::timestamptz - interval '1 millisecond')::text AS under, ($1::timestamptz + interval '1 millisecond')::text AS over",
      [mark],
    );
    expect(await failure(openSession(user, device, around.rows[0]?.at))).toEqual(REFUSED);
    expect(await failure(openSession(user, device, around.rows[0]?.under))).toEqual(REFUSED);
    expect(await failure(openSession(user, device, around.rows[0]?.over))).toBe('accepted');
  });

  it('refuses nothing of another account: the mark judged is the session’s own account’s', async () => {
    const reset = await createUser(owner);
    const other = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(reset);
    expect(await failure(openSession(other, await newDevice(other), start))).toBe('accepted');
    expect(await failure(openSession(reset, await newDevice(reset), start))).toEqual(REFUSED);
  });

  it('does not check a row with no start (the previous image’s insert): it passes after a reset; and since the key registry it takes the account’s row as every session insert does, FOR NO KEY UPDATE, until its transaction ends (docs/adr/0095, amending D4)', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    await recordReset(user);
    const previous = await openSession(user, device, undefined);
    expect(await sessionEnd(previous)).toEqual({ ended: false, end_reason: null });
    expect((await owner.query<{ none: boolean }>('SELECT sign_in_began_at IS NULL AS none FROM user_session WHERE id = $1', [previous])).rows[0]?.none).toBe(true);

    await owner.query('SELECT pg_sleep(0.003)');
    const start = await began();
    const holder = await actorTransaction(user);
    await holder.client.query('SELECT sign_in_lock_account()');
    // No start: user_session_hardware_key (migration 20261116090000) takes the account's row for every insert, so a
    // removal's confirmation, which holds that row while it removes the keys and ends the sessions, is either before
    // this insert (which then reads the removal) or after it (and ends it). It waits, and goes on when the holder ends.
    const bare = await actorTransaction(user);
    const noStart = failure(bare.client.query(WITHOUT_START, [user, device, tokenHash()]));
    expect(await waits(bare.pid)).toBe(true);
    await holder.client.query('COMMIT');
    expect(await noStart).toBe('accepted');
    // A start: it waits for the same row, now held by the insert with none.
    const waiter = await actorTransaction(user);
    const insert = failure(waiter.client.query(WITH_START, [user, device, tokenHash(), start]));
    expect(await waits(waiter.pid)).toBe(true);
    // What the no-start insert holds until its transaction ends, read by what it lets through and what it refuses:
    // FOR NO KEY UPDATE, the mode every taker of the account's row uses. It refuses a second taker (so it serialises
    // against a confirmation, End membership and a reset) and lets a key-share lock through, the lock a foreign-key
    // check of a row that names the user takes; FOR UPDATE would refuse that too and add nothing here.
    const probe = async (mode: string) => {
      const session = await connect(database.url);
      try {
        await session.client.query('BEGIN');
        return await failure(session.client.query(`SELECT 1 FROM "user" WHERE id = $1 FOR ${mode} NOWAIT`, [user]));
      } finally {
        await close(session.client);
      }
    };
    expect(await probe('KEY SHARE')).toBe('accepted');
    expect(await probe('NO KEY UPDATE')).toMatchObject({ code: '55P03' });
    await bare.client.query('COMMIT');
    // Released at the transaction's end: the insert with a start, next in line, goes on and commits.
    expect(await insert).toBe('accepted');
    await waiter.client.query('COMMIT');
    expect(await probe('NO KEY UPDATE')).toBe('accepted');
  });
});

describe('a sign-in racing the reset is ended or refused, in either order (docs/adr/0093 D4)', () => {
  it('the session first: the reset waits for its commit, then ends it', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    const start = await beganAndPassed();
    const signIn = await actorTransaction(user);
    const inserted = await signIn.client.query<{ id: string }>(WITH_START, [user, device, tokenHash(), start]);
    const session = inserted.rows[0]?.id ?? '';
    const reset = await actorTransaction(user);
    const recorded = code(reset.client.query(RESET_EVENT, [user]));
    expect(await waits(reset.pid)).toBe(true);
    await signIn.client.query('COMMIT');
    expect(await recorded).toBe('accepted');
    await reset.client.query('COMMIT');
    expect(await sessionEnd(session)).toEqual({ ended: true, end_reason: 'revoked' });
  });

  it('the session first, with the caller’s own revoke before the event (the web’s reset): the same', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    const start = await beganAndPassed();
    const signIn = await actorTransaction(user);
    await signIn.client.query('SELECT sign_in_lock_account()');
    const inserted = await signIn.client.query<{ id: string }>(WITH_START, [user, device, tokenHash(), start]);
    const session = inserted.rows[0]?.id ?? '';
    const reset = await actorTransaction(user);
    const locked = code(reset.client.query('SELECT sign_in_lock_account()'));
    expect(await waits(reset.pid)).toBe(true);
    await signIn.client.query('COMMIT');
    expect(await locked).toBe('accepted');
    await reset.client.query('SELECT revoke_user_sessions($1)', [user]);
    await reset.client.query(RESET_EVENT, [user]);
    await reset.client.query('COMMIT');
    expect(await sessionEnd(session)).toEqual({ ended: true, end_reason: 'revoked' });
  });

  it('the reset first: the insert waits for its commit, reads the moved mark and is refused; had the reset rolled back, it is taken', async () => {
    for (const end of ['COMMIT', 'ROLLBACK'] as const) {
      const user = await createUser(owner);
      const device = await newDevice(user);
      const start = await beganAndPassed();
      const reset = await actorTransaction(user);
      await reset.client.query(RESET_EVENT, [user]);
      const signIn = await actorTransaction(user);
      const inserted = failure(signIn.client.query(WITH_START, [user, device, tokenHash(), start]));
      expect(await waits(signIn.pid), end).toBe(true);
      await reset.client.query(end);
      expect(await inserted, end).toEqual(end === 'COMMIT' ? REFUSED : 'accepted');
      await signIn.client.query(end === 'COMMIT' ? 'ROLLBACK' : 'COMMIT');
      const open = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM user_session WHERE user_id = $1 AND ended_at IS NULL', [user]);
      expect(open.rows[0]?.n, end).toBe(end === 'COMMIT' ? 0 : 1);
    }
  });
});

describe('a session insert above READ COMMITTED (docs/adr/0093 D4; the build review’s DB-N3)', () => {
  it('that waits on the account’s row behind a reset ends in a serialization failure, never in a session: it cannot read the moved mark, so PostgreSQL refuses it', async () => {
    for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
      const user = await createUser(owner);
      const device = await newDevice(user);
      const start = await beganAndPassed();
      // Its snapshot is taken before the reset (actorTransaction's first statement).
      const signIn = await actorTransaction(user, isolation);
      const reset = await actorTransaction(user);
      await reset.client.query(RESET_EVENT, [user]);
      const inserted = code(signIn.client.query(WITH_START, [user, device, tokenHash(), start]));
      expect(await waits(signIn.pid), isolation).toBe(true);
      await reset.client.query('COMMIT');
      expect(await inserted, isolation).toBe('40001');
      await signIn.client.query('ROLLBACK');
      const open = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM user_session WHERE user_id = $1', [user]);
      expect(open.rows[0]?.n, isolation).toBe(0);
    }
  });
});

describe('one lock order: the account’s row first (docs/adr/0093 D2; the design review’s DB-D1)', () => {
  /** The six steps of the review's scenario: one account, one browser, a reset, two sign-ins and a request. */
  it('without the two calls the insert trigger and the sweep close a cycle with resolve_session() and PostgreSQL ends one of the three (the red run)', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    const start = await beganAndPassed();
    // 1. The reset's transaction begins and revokes.
    const reset = await actorTransaction(user);
    await reset.client.query('SELECT revoke_user_sessions($1)', [user]);
    // 2. A sign-in commits meanwhile: session S on device D.
    const token = tokenHash();
    const sessionS = await openSession(user, device, start, token);
    // 3. A second sign-in on that browser holds D's row.
    const second = await actorTransaction(user);
    await second.client.query('UPDATE user_device SET last_seen_at = now() WHERE id = $1', [device]);
    // 4. A request with S's cookie: resolve_session() locks S, then waits for D's row.
    const resolver = await connect(database.appUrl);
    const resolved = code(resolver.client.query('SELECT * FROM resolve_session($1)', [token]));
    expect(await waits(resolver.pid)).toBe(true);
    // 5. The reset records its event: the stamp takes the account's row; the sweep waits for S.
    // Each transaction ends as soon as its statement is answered, so whichever PostgreSQL ends, the others go on.
    const recorded = code(reset.client.query(RESET_EVENT, [user])).finally(() => reset.client.query('ROLLBACK').catch(() => undefined));
    expect(await waits(reset.pid)).toBe(true);
    // 6. The second sign-in inserts its session: the insert trigger waits for the account's row.
    const inserted = code(second.client.query(WITH_START, [user, device, tokenHash(), start])).finally(() => second.client.query('ROLLBACK').catch(() => undefined));
    const outcomes = await Promise.all([resolved, recorded, inserted]);
    expect(outcomes.filter((outcome) => outcome === '40P01')).toHaveLength(1);
    expect(sessionS).not.toBe('');
  }, 30_000);

  it('with sign_in_lock_account() first in both, the same steps wait in line and all complete: no deadlock, the sessions ended or refused', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    const start = await beganAndPassed();
    // A session of the account from before, for the request to resolve.
    const token = tokenHash();
    const sessionS = await openSession(user, device, start, token);
    // 1. The reset: the account's row first, then its revoke.
    const reset = await actorTransaction(user);
    await reset.client.query('SELECT sign_in_lock_account()');
    await reset.client.query('SELECT revoke_user_sessions($1)', [user]);
    // 2 and 3. Two sign-ins: each asks for the account's row before any device statement, and waits holding nothing.
    const first = await actorTransaction(user);
    const second = await actorTransaction(user);
    const firstLocked = code(first.client.query('SELECT sign_in_lock_account()'));
    expect(await waits(first.pid)).toBe(true);
    const secondLocked = code(second.client.query('SELECT sign_in_lock_account()'));
    expect(await waits(second.pid)).toBe(true);
    // 4. The request: it waits for S, which the revoke holds, and holds nothing itself.
    const resolver = await connect(database.appUrl);
    const resolved = resolver.client.query<{ outcome: string }>('SELECT outcome FROM resolve_session($1)', [token]);
    expect(await waits(resolver.pid)).toBe(true);
    // 5. The reset records its event, with no one in its way, and commits.
    expect(await code(reset.client.query(RESET_EVENT, [user]))).toBe('accepted');
    await reset.client.query('COMMIT');
    expect((await resolved).rows[0]?.outcome).toBe('ended');
    // 6. The sign-ins go on, one after the other: each device statement, then the insert, refused by the moved mark.
    const signIns = [
      { session: first, locked: firstLocked },
      { session: second, locked: secondLocked },
    ];
    const order = (await settles(firstLocked, 3000)) ? signIns : [...signIns].reverse();
    for (const { session, locked } of order) {
      expect(await locked).toBe('accepted');
      await session.client.query('UPDATE user_device SET last_seen_at = now() WHERE id = $1', [device]);
      expect(await failure(session.client.query(WITH_START, [user, device, tokenHash(), start]))).toEqual(REFUSED);
      await session.client.query('ROLLBACK');
    }
    expect(await sessionEnd(sessionS)).toEqual({ ended: true, end_reason: 'revoked' });
    const open = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM user_session WHERE user_id = $1 AND ended_at IS NULL', [user]);
    expect(open.rows[0]?.n).toBe(0);
  }, 30_000);
});

describe('sign_in_lock_account() (docs/adr/0093 D2)', () => {
  it('locks the acting account’s own row FOR NO KEY UPDATE and no other: a second locker waits, a foreign-key check does not, and another account’s row is free', async () => {
    const user = await createUser(owner);
    const other = await createUser(owner);
    const holder = await actorTransaction(user);
    await holder.client.query('SELECT sign_in_lock_account()');
    const locks = await owner.query<{ modes: string[] }>(
      `SELECT array_agg(DISTINCT l.mode ORDER BY l.mode) AS modes FROM pg_locks l WHERE l.pid = $1 AND l.locktype = 'relation' AND l.relation = '"user"'::regclass`,
      [holder.pid],
    );
    expect(locks.rows[0]?.modes).toContain('RowShareLock');
    expect(await code(owner.query('SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE NOWAIT', [user]))).toBe('55P03');
    expect(await code(owner.query('SELECT 1 FROM "user" WHERE id = $1 FOR UPDATE NOWAIT', [user]))).toBe('55P03');
    expect(await code(owner.query('SELECT 1 FROM "user" WHERE id = $1 FOR KEY SHARE NOWAIT', [user]))).toBe('accepted');
    expect(await code(owner.query('SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE NOWAIT', [other]))).toBe('accepted');
    // A foreign-key check against the locked row goes on: a device of the account.
    expect(await settles(newDevice(user), 3000)).toBe(true);
    // The same transaction updates the row afterwards, as sign_in_succeeded() does.
    expect(await code(holder.client.query('SELECT sign_in_succeeded($1)', [user]))).toBe('accepted');
    await holder.client.query('COMMIT');
    expect(await code(owner.query('SELECT 1 FROM "user" WHERE id = $1 FOR NO KEY UPDATE NOWAIT', [user]))).toBe('accepted');
  });

  it('is refused with no actor, and for an actor that names no account', async () => {
    expect(await code(app.query('SELECT sign_in_lock_account()'))).toBe('42501');
    expect(await code(withActor(app, randomUUID(), (scope) => scope.client.query('SELECT sign_in_lock_account()')))).toBe('42501');
  });
});

describe('sign_in_step_refused(): judged and recorded in one call (SGN-17; docs/adr/0093 D5, D6)', () => {
  it('answers the reason and records nothing for an account that does not exist, a step with no start, and a start ahead of the clock; answers nothing for a past start on an account never reset', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    expect(await stepRefused(randomUUID(), start, 'mfa')).toBe('no_account');
    expect(await stepRefused(randomUUID(), null, 'mfa')).toBe('no_account');
    expect(await stepRefused(user, null, 'mfa')).toBe('no_start');
    expect(await stepRefused(user, 'infinity', 'mfa')).toBe('ahead_of_clock');
    const ahead = (await owner.query<{ at: string }>("SELECT (clock_timestamp() + interval '1 minute')::text AS at")).rows[0]?.at ?? null;
    expect(await stepRefused(user, ahead, 'mfa')).toBe('ahead_of_clock');
    expect(await stepRefused(user, start, 'mfa')).toBeNull();
    expect(await stepRefused(user, '-infinity', 'mfa')).toBeNull();
    // The same three with a mark set: still refused, still unrecorded (none is evidence of a step around the reset).
    await recordReset(user);
    expect(await stepRefused(user, null, 'mfa')).toBe('no_start');
    expect(await stepRefused(user, 'infinity', 'mfa')).toBe('ahead_of_clock');
    expect(await stepRefused(user, ahead, 'mfa')).toBe('ahead_of_clock');
    expect(await securityEvents(user)).toEqual([]);
  });

  it('answers before_reset at the mark and before it and nothing after it, and records one security_event of the system for the account, a step and a mark, with the step in the purpose and the first request’s ID', async () => {
    const user = await createUser(owner);
    const mark = await setMark(user, "date_trunc('milliseconds', clock_timestamp() - interval '1 second')");
    const around = await owner.query<{ at: string; under: string; over: string }>(
      "SELECT $1::timestamptz::text AS at, ($1::timestamptz - interval '1 millisecond')::text AS under, ($1::timestamptz + interval '1 millisecond')::text AS over",
      [mark],
    );
    const { at, under, over } = around.rows[0] ?? { at: null, under: null, over: null };
    expect(await stepRefused(user, over, 'mfa')).toBeNull();
    expect(await securityEvents(user)).toEqual([]);
    const requests: string[] = [];
    for (const step of STEPS) {
      const requestId = request();
      requests.push(requestId);
      expect(await stepRefused(user, at, step, requestId), step).toBe('before_reset');
      // A repeat of the step, the same start or an older one, under another request: refused, and no second row.
      expect(await stepRefused(user, at, step), step).toBe('before_reset');
      expect(await stepRefused(user, under, step), step).toBe('before_reset');
      expect(await stepRefused(user, over, step), step).toBeNull();
    }
    const purposes = STEPS.map((step) => (step === 'key_registered' ? 'key_registered_across_reset' : `step_before_reset_${step}`));
    const once = purposes.map((purpose, index) => ({ actor_kind: 'system', actor_id: null, action: 'security_event', object_type: 'user', object_id: user, purpose, request_id: requests[index] }));
    expect(await securityEvents(user)).toEqual(once);
    // A second reset moves the mark: the same stale step is evidence against the new reset, recorded once again.
    await owner.query('SELECT pg_sleep(0.003)');
    await recordReset(user);
    const again = request();
    expect(await stepRefused(user, at, 'mfa', again)).toBe('before_reset');
    expect(await stepRefused(user, under, 'mfa')).toBe('before_reset');
    expect(await securityEvents(user)).toEqual([...once, { ...once[STEPS.indexOf('mfa')], request_id: again }]);
  });

  it('writes at most one row for an account, a step and a mark however old the start: the application role with no actor, calling with -infinity, a start years old and an old start', async () => {
    const user = await createUser(owner);
    const old = await beganAndPassed();
    await recordReset(user);
    for (const start of ['-infinity', '2000-01-01T00:00:00Z', old, '-infinity', old]) {
      expect(await stepRefused(user, start, 'mfa'), start).toBe('before_reset');
    }
    expect((await securityEvents(user)).map((event) => event.purpose)).toEqual(['step_before_reset_mfa']);
  });

  it('counts no failure and locks nothing: a stale step answered any number of times leaves the account’s count and lock as they were', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(user);
    for (let tries = 0; tries < 12; tries += 1) {
      expect(await stepRefused(user, start, 'mfa')).toBe('before_reset');
    }
    const account = await owner.query<{ failed_sign_ins: number; locked: boolean }>('SELECT failed_sign_ins, locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [user]);
    expect(account.rows[0]).toEqual({ failed_sign_ins: 0, locked: false });
    const failed = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE object_id = $1 AND action = 'sign_in_failed'", [user]);
    expect(failed.rows[0]?.n).toBe(0);
    expect(await securityEvents(user)).toHaveLength(1);
  });

  it('refuses a step outside its closed list, and none at all, whoever the account', async () => {
    const user = await createUser(owner);
    const start = await began();
    for (const step of ['reset', 'totp', 'KEY', '', 'step_before_reset_mfa', null]) {
      expect(await code(app.query('SELECT sign_in_step_refused($1, $2::timestamptz, $3, $4)', [user, start, step, request()])), String(step)).toBe('23514');
      expect(await code(app.query('SELECT sign_in_step_refused($1, $2::timestamptz, $3, $4)', [randomUUID(), start, step, request()])), String(step)).toBe('23514');
    }
  });

  it('refuses to judge above READ COMMITTED', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(user);
    for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
      const judge = await actorTransaction(user, isolation);
      expect(await code(judge.client.query('SELECT sign_in_step_refused($1, $2::timestamptz, $3, $4)', [user, start, 'mfa', request()])), isolation).toBe('0A000');
      await close(judge.client);
    }
    expect(await securityEvents(user)).toEqual([]);
  });

  it('reads the committed mark without a lock: it answers while another transaction holds the account’s row', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    const reset = await actorTransaction(user);
    await reset.client.query('SELECT sign_in_lock_account()');
    await reset.client.query(RESET_EVENT, [user]);
    // The reset is not committed: the step is not yet refused, and the call does not wait.
    const judged = stepRefused(user, start, 'mfa');
    expect(await settles(judged, 3000)).toBe(true);
    expect(await judged).toBeNull();
    await reset.client.query('COMMIT');
    expect(await stepRefused(user, start, 'mfa')).toBe('before_reset');
  });
});

describe('sign_in_lock_key_across_reset(): a key registered across a reset and not removed locks the account (SGN-17; docs/adr/0093 D6)', () => {
  const lock = (user: string, requestId: string = request()) =>
    app.query<{ locked: boolean }>('SELECT sign_in_lock_key_across_reset($1, $2) AS locked', [user, requestId]).then((result) => result.rows[0]?.locked);
  const lockState = async (user: string) =>
    (await owner.query<{ failed_sign_ins: number; locked: boolean }>('SELECT failed_sign_ins, locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [user])).rows[0];

  it('refuses unless that registration is on record since the account’s mark: an unknown account, one never reset, one reset with no such record, and one whose record is of an earlier reset', async () => {
    expect(await code(lock(randomUUID()))).toBe('42501');
    const user = await createUser(owner);
    const start = await beganAndPassed();
    expect(await code(lock(user))).toBe('42501');
    await recordReset(user);
    expect(await code(lock(user))).toBe('42501');
    // Another stale step's record is not the key's.
    expect(await stepRefused(user, start, 'register_key')).toBe('before_reset');
    expect(await code(lock(user))).toBe('42501');
    // The key's record, then a later reset: the record is of the earlier mark.
    expect(await stepRefused(user, start, 'key_registered')).toBe('before_reset');
    await owner.query('SELECT pg_sleep(0.003)');
    await recordReset(user);
    expect(await code(lock(user))).toBe('42501');
    expect(await lockState(user)).toEqual({ failed_sign_ins: 0, locked: false });
    expect((await securityEvents(user)).map((event) => event.purpose)).toEqual(['step_before_reset_register_key', 'key_registered_across_reset']);
  });

  it('locks the account once, records it as a security_event of the system with the request’s ID, counts no failure, and answers false for an account already locked', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(user);
    expect(await stepRefused(user, start, 'key_registered')).toBe('before_reset');
    const requestId = request();
    expect(await lock(user, requestId)).toBe(true);
    expect(await lockState(user)).toEqual({ failed_sign_ins: 0, locked: true });
    const lockedAt = (await owner.query<{ at: string }>('SELECT locked_at::text AS at FROM "user" WHERE id = $1', [user])).rows[0]?.at;
    const again = request();
    expect(await lock(user, again)).toBe(false);
    expect((await owner.query<{ at: string }>('SELECT locked_at::text AS at FROM "user" WHERE id = $1', [user])).rows[0]?.at).toBe(lockedAt);
    // Each call records the lock, the second too: that record is what holds unlock_user() until the key is cleared.
    expect((await securityEvents(user)).slice(1)).toEqual([
      { actor_kind: 'system', actor_id: null, action: 'security_event', object_type: 'user', object_id: user, purpose: 'account_locked_key_across_reset', request_id: requestId },
      { actor_kind: 'system', actor_id: null, action: 'security_event', object_type: 'user', object_id: user, purpose: 'account_locked_key_across_reset', request_id: again },
    ]);
    // The sign-in path reads the lock as it reads the lock of ten failures.
    const read = await owner.query<{ locked: boolean }>('SELECT a.locked FROM "user" u, sign_in_account(u.email, NULL) a WHERE u.id = $1', [user]);
    expect(read.rows[0]?.locked).toBe(true);
  });

  it('an account already locked by ten failures keeps its lock time and answers false, and the lock for the key is still recorded, so its audit trail says what holds it', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(user);
    expect(await stepRefused(user, start, 'key_registered')).toBe('before_reset');
    await owner.query('UPDATE "user" SET locked_at = now(), failed_sign_ins = 10 WHERE id = $1', [user]);
    expect(await lock(user)).toBe(false);
    expect(await lockState(user)).toEqual({ failed_sign_ins: 10, locked: true });
    expect((await securityEvents(user)).map((event) => event.purpose)).toEqual(['key_registered_across_reset', 'account_locked_key_across_reset']);
  });

  it('writes its records at the clock’s time, not the transaction’s start: a judgement in a transaction begun before the mark moved is recorded once and is the evidence the lock then finds', async () => {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    // The judging transaction begins (its now() is fixed here), then the reset moves the mark and commits.
    const judge = await connect(database.url);
    await judge.client.query(`SET ROLE ${APP_ROLE}`);
    await judge.client.query('BEGIN');
    await judge.client.query('SELECT now()');
    await owner.query('SELECT pg_sleep(0.003)');
    await recordReset(user);
    const refused = (requestId: string) =>
      judge.client.query<{ refused: string | null }>("SELECT sign_in_step_refused($1, $2::timestamptz, 'key_registered', $3) AS refused", [user, start, requestId]).then((result) => result.rows[0]?.refused);
    expect(await refused(request())).toBe('before_reset');
    expect(await refused(request())).toBe('before_reset');
    const locked = await judge.client.query<{ locked: boolean }>('SELECT sign_in_lock_key_across_reset($1, $2) AS locked', [user, request()]);
    expect(locked.rows[0]?.locked).toBe(true);
    await judge.client.query('COMMIT');
    await close(judge.client);
    expect((await securityEvents(user)).map((event) => event.purpose)).toEqual(['key_registered_across_reset', 'account_locked_key_across_reset']);
    const times = await owner.query<{ since: boolean }>(
      `SELECT bool_and(e.at >= u.sign_in_not_before) AS since FROM audit_event e JOIN "user" u ON u.id = e.object_id WHERE e.object_id = $1 AND e.action = 'security_event'`,
      [user],
    );
    expect(times.rows[0]?.since).toBe(true);
  });
});

describe('unlock_user(): an account locked for a key registered across its reset stays locked until the key is cleared (SGN-17; docs/adr/0093 D6)', () => {
  const HOLD = { code: '23514', constraint: 'user_key_across_reset_hold' } as const;
  const CLEARED = "INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose) VALUES (clock_timestamp(), 'system', 'security_event', 'user', $1, 'key_across_reset_cleared')";
  const lock = (user: string) => app.query<{ locked: boolean }>('SELECT sign_in_lock_key_across_reset($1, $2) AS locked', [user, request()]).then((result) => result.rows[0]?.locked);
  const locked = async (user: string) => (await owner.query<{ locked: boolean }>('SELECT locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [user])).rows[0]?.locked;
  let admin: string;
  const unlock = (user: string, actor: string = admin) => withActor(app, actor, async (scope) => (await scope.client.query<{ ok: boolean }>('SELECT unlock_user($1) AS ok', [user])).rows[0]?.ok);
  /** An account reset, its key registered across the reset on record, and locked for it. */
  async function held(): Promise<string> {
    const user = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(user);
    expect(await stepRefused(user, start, 'key_registered')).toBe('before_reset');
    expect(await lock(user)).toBe(true);
    return user;
  }

  beforeAll(async () => {
    const internal = await createOrganization(owner, 'internal');
    admin = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, admin, 'platform_admin');
  });

  it('refuses a platform administrator by the constraint’s name while the lock for the key has no later clear, and the account stays locked; anyone else is refused as before', async () => {
    const user = await held();
    expect(await failure(unlock(user))).toEqual(HOLD);
    expect(await locked(user)).toBe(true);
    expect(await code(unlock(user, user))).toBe('42501');
  });

  it('waits for a lock for the key that is still in its transaction, then refuses: an account locked already is not unlocked beside the hold', async () => {
    // Locked already, as ten failed sign-ins lock it; the key's registration across the reset is on record.
    const user = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(user);
    expect(await stepRefused(user, start, 'key_registered')).toBe('before_reset');
    await owner.query('UPDATE "user" SET locked_at = now(), failed_sign_ins = 10 WHERE id = $1', [user]);
    const locking = await connect(database.appUrl);
    await locking.client.query('BEGIN');
    expect((await locking.client.query<{ locked: boolean }>('SELECT sign_in_lock_key_across_reset($1, $2) AS locked', [user, request()])).rows[0]?.locked).toBe(false);
    const unlocking = await actorTransaction(admin);
    const answer = failure(unlocking.client.query('SELECT unlock_user($1)', [user]));
    expect(await waits(unlocking.pid)).toBe(true);
    await locking.client.query('COMMIT');
    expect(await answer).toEqual(HOLD);
    await close(unlocking.client);
    await close(locking.client);
    expect(await locked(user)).toBe(true);
  });

  it('unlocks once the owner has recorded the key cleared after the lock; a clear recorded before the lock clears nothing; a second lock after a clear holds again', async () => {
    const early = await createUser(owner);
    await owner.query(CLEARED, [early]);
    await owner.query('SELECT pg_sleep(0.003)');
    const start = await beganAndPassed();
    await recordReset(early);
    expect(await stepRefused(early, start, 'key_registered')).toBe('before_reset');
    expect(await lock(early)).toBe(true);
    expect(await failure(unlock(early))).toEqual(HOLD);

    const user = await held();
    await owner.query(CLEARED, [user]);
    expect(await unlock(user)).toBe(true);
    expect(await locked(user)).toBe(false);
    expect(await unlock(user)).toBe(false);
    // Locked for the key again (the same record of the registration, the mark unmoved): held again.
    await owner.query('SELECT pg_sleep(0.003)');
    expect(await lock(user)).toBe(true);
    expect(await failure(unlock(user))).toEqual(HOLD);
    await owner.query(CLEARED, [user]);
    expect(await unlock(user)).toBe(true);
  });

  it('holds an account that ten failures had locked before the key’s lock was recorded, and leaves an account locked by ten failures alone unlocking as before', async () => {
    const both = await createUser(owner);
    const start = await beganAndPassed();
    await recordReset(both);
    expect(await stepRefused(both, start, 'key_registered')).toBe('before_reset');
    await owner.query('UPDATE "user" SET locked_at = now(), failed_sign_ins = 10 WHERE id = $1', [both]);
    expect(await lock(both)).toBe(false);
    expect(await failure(unlock(both))).toEqual(HOLD);

    const plain = await createUser(owner);
    await owner.query('UPDATE "user" SET locked_at = now(), failed_sign_ins = 10 WHERE id = $1', [plain]);
    expect(await unlock(plain)).toBe(true);
    expect((await owner.query('SELECT failed_sign_ins, locked_at FROM "user" WHERE id = $1', [plain])).rows).toEqual([{ failed_sign_ins: 0, locked_at: null }]);
  });

  it('keeps the clear from the application role: it cannot write a security_event, as itself, as the account or as a platform administrator', async () => {
    const user = await held();
    await expect(app.query(CLEARED, [user])).rejects.toMatchObject({ code: '42501' });
    for (const actor of [user, admin]) {
      await expect(withActor(app, actor, (scope) => scope.client.query(CLEARED, [user]))).rejects.toMatchObject({ code: '42501' });
      await expect(
        withActor(app, actor, (scope) => recordAuditEvent(scope, { action: 'security_event', objectType: 'user', objectId: user, purpose: 'key_across_reset_cleared', requestId: request() })),
      ).rejects.toMatchObject({ code: '42501' });
    }
    expect(await failure(unlock(user))).toEqual(HOLD);
  });
});

describe('the functions’ owners and grants (docs/adr/0093)', () => {
  it('makes the two trigger functions definers granted to no one, the lock and the check definers granted to tp_app alone, and the start an invoker’s granted to tp_app alone, each owned by tp_owner with its search_path pinned and nothing for PUBLIC', async () => {
    const expected: Readonly<Record<string, { readonly definer: boolean; readonly grantees: readonly string[]; readonly config: readonly string[] }>> = {
      'audit_event_sign_in_not_before()': { definer: true, grantees: [], config: DEFINER_PATH },
      'user_session_sign_in_not_before()': { definer: true, grantees: [], config: DEFINER_PATH },
      'sign_in_lock_account()': { definer: true, grantees: [APP_ROLE], config: DEFINER_PATH },
      'sign_in_step_refused(uuid,timestamp with time zone,text,text)': { definer: true, grantees: [APP_ROLE], config: DEFINER_PATH },
      'sign_in_lock_key_across_reset(uuid,text)': { definer: true, grantees: [APP_ROLE], config: DEFINER_PATH },
      // Replaced by this migration: its owner, its definer's rights, its pinned search_path and its one grant are as before.
      'unlock_user(uuid)': { definer: true, grantees: [APP_ROLE], config: DEFINER_PATH },
      'sign_in_step_began()': { definer: false, grantees: [APP_ROLE], config: INVOKER_PATH },
    };
    const { rows } = await owner.query<{ name: string; definer: boolean; config: string[] | null; owner: string; grantees: string[]; public: boolean; volatility: string }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer, p.proconfig AS config, pg_get_userbyid(p.proowner) AS owner, p.provolatile AS volatility,
              ARRAY(SELECT DISTINCT pg_get_userbyid(x.grantee)::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                     WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> 0 AND x.grantee <> p.proowner ORDER BY 1) AS grantees,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND (p.oid::regprocedure::text = ANY ($1) OR p.proname LIKE '%sign_in_not_before%' OR p.proname LIKE 'sign_in_step%' OR p.proname LIKE 'sign_in_lock%') ORDER BY 1`,
      [Object.keys(expected)],
    );
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(expected).sort());
    for (const row of rows) {
      const wanted = expected[row.name];
      expect({ definer: row.definer, owner: row.owner, grantees: row.grantees, public: row.public, config: row.config, volatility: row.volatility }, row.name).toEqual({
        definer: wanted?.definer,
        owner: OWNER_ROLE,
        grantees: [...(wanted?.grantees ?? [])],
        public: false,
        config: wanted?.config,
        volatility: 'v',
      });
    }
    for (const role of ROLES) {
      const triggers = await owner.query<{ may: boolean }>(
        "SELECT has_function_privilege($1, 'audit_event_sign_in_not_before()', 'EXECUTE') OR has_function_privilege($1, 'user_session_sign_in_not_before()', 'EXECUTE') AS may",
        [role],
      );
      expect(triggers.rows[0]?.may, role).toBe(false);
    }
    for (const role of [OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, SCREENING_ROLE]) {
      const calls = await owner.query<{ may: boolean }>(
        `SELECT has_function_privilege($1, 'sign_in_lock_account()', 'EXECUTE') OR has_function_privilege($1, 'sign_in_step_began()', 'EXECUTE')
             OR has_function_privilege($1, 'sign_in_step_refused(uuid, timestamptz, text, text)', 'EXECUTE')
             OR has_function_privilege($1, 'sign_in_lock_key_across_reset(uuid, text)', 'EXECUTE') AS may`,
        [role],
      );
      expect(calls.rows[0]?.may, role).toBe(false);
    }
    // The application calls neither trigger function directly.
    expect(await code(app.query('SELECT audit_event_sign_in_not_before()'))).toBe('42501');
    expect(await code(app.query('SELECT user_session_sign_in_not_before()'))).toBe('42501');
  });

  it('has its two triggers where the design puts them: after the event’s insert, and before the insert of a session that carries a start', async () => {
    const { rows } = await owner.query<{ definition: string }>(
      "SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t WHERE t.tgname IN ('audit_event_sign_in_not_before', 'user_session_sign_in_not_before') AND NOT t.tgisinternal ORDER BY t.tgname",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]?.definition).toBe(
      'CREATE TRIGGER user_session_sign_in_not_before BEFORE INSERT ON public.user_session FOR EACH ROW WHEN ((new.sign_in_began_at IS NOT NULL)) EXECUTE FUNCTION user_session_sign_in_not_before()',
    );
    expect(rows[0]?.definition).toContain('AFTER INSERT ON public.audit_event FOR EACH ROW');
  });
});

describe('the previous image (docs/adr/0093 D4, D10; docs/adr/0009, 0049)', () => {
  it('still opens a session (no start, no lock call) and still resets (its revoke, then the event, no lock call): the mark moves and every session ends', async () => {
    const user = await createUser(owner);
    const device = await newDevice(user);
    const first = await openSession(user, device, undefined);
    const second = await openSession(user, device, undefined);
    // The previous image's reset transaction (apps/web/src/lib/auth/sign-in.ts before this change).
    await withActor(app, user, async (scope) => {
      await scope.client.query('SELECT revoke_user_sessions($1)', [user]);
      await recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId: request() });
    });
    expect(await markOf(user)).not.toBeNull();
    expect(await sessionEnd(first)).toEqual({ ended: true, end_reason: 'revoked' });
    expect(await sessionEnd(second)).toEqual({ ended: true, end_reason: 'revoked' });
    // And its next sign-in, unchecked: the gap this schema leaves open for that image alone.
    const next = await openSession(user, device, undefined);
    expect(await sessionEnd(next)).toEqual({ ended: false, end_reason: null });
  });
});

describe('the migration’s lock loop (docs/adr/0093 D10; docs/adr/0083’s pattern)', () => {
  it('takes "user", user_session and audit_event together without queueing: a try made while a reader of "user", a reader of user_session or a writer of audit_event is open gives back all it took, so a request goes on, and the try after the last of them ends takes all three', async () => {
    const loop = doBlock('NOWAIT');
    expect(loop).toContain('LOCK TABLE "user" IN ACCESS EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain('LOCK TABLE user_session IN ACCESS EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain('LOCK TABLE audit_event IN SHARE ROW EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain('LOCK TABLE password_notice IN ACCESS EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain(`'"user", user_session, audit_event or password_notice stayed in use for five minutes; run the deploy again (docs/adr/0093)'`);
    expect(loop).toContain('FOR attempt IN 1..300 LOOP');
    // The loop runs as it stands in the file but for its sleep: each sleep is a wait this test ends, its n-th on an
    // advisory key the test holds, so a try happens exactly when the test lets it and the loop stands still between.
    expect(loop).toContain('PERFORM pg_sleep(1);');
    const paced = loop.replaceAll('PERFORM pg_sleep(1);', 'PERFORM lock_loop_test.pause();');
    const user = await createUser(owner);
    const device = await newDevice(user);
    const userReader = await connect(database.appUrl);
    const sessionReader = await connect(database.appUrl);
    const eventWriter = await connect(database.appUrl);
    const noticeReader = await connect(database.url);
    const pacer = await connect(database.url);
    const migration = await connect(database.url);
    /** A request that reads "user" and user_session and writes audit_event, as every signed-in request does. */
    const goesOn = async () => {
      const work = withActor(app, user, async (scope) => {
        await scope.client.query('SELECT status FROM "user" WHERE id = $1', [user]);
        await scope.client.query('SELECT count(*) FROM user_session WHERE device_id = $1', [device]);
        await recordAuditEvent(scope, { action: 'sign_in', objectType: 'user', objectId: user, requestId: request() });
      });
      return (await settles(work, 3000)) ? code(work) : 'waited';
    };
    let finished = false;
    let done: Promise<string> = Promise.resolve('not started');
    /** Resolves once the loop's backend stands in its n-th pause; throws if it waits for a table instead, ends, or never gets there. */
    const pausedAt = async (n: number): Promise<void> => {
      for (let tries = 0; tries < 1500; tries += 1) {
        const { rows } = await owner.query<{ paused: boolean; queued: boolean }>(
          `SELECT coalesce(bool_or(locktype = 'advisory' AND classid = $2::oid AND objid = $3::oid AND objsubid = 2), false) AS paused,
                  coalesce(bool_or(locktype = 'relation'), false) AS queued
             FROM pg_locks WHERE pid = $1 AND NOT granted`,
          [migration.pid, LOOP_PAUSES, n],
        );
        if (rows[0]?.queued === true) {
          throw new Error('the loop waits in a table’s lock queue');
        }
        if (rows[0]?.paused === true) {
          return;
        }
        if (finished) {
          throw new Error(`the loop ended before its pause ${String(n)}`);
        }
        await pause(10);
      }
      throw new Error(`the loop never reached its pause ${String(n)}`);
    };
    /** What the loop's backend holds or waits for on the three tables. */
    const tableLocks = async () =>
      (
        await owner.query<{ relation: string; mode: string; granted: boolean }>(
          `SELECT relation::regclass::text AS relation, mode, granted FROM pg_locks
            WHERE pid = $1 AND locktype = 'relation' AND relation IN ('"user"'::regclass, 'user_session'::regclass, 'audit_event'::regclass, 'password_notice'::regclass) ORDER BY 1, 2`,
          [migration.pid],
        )
      ).rows;
    try {
      // Three open transactions, in the order the loop takes its locks: a read of "user" (what the notice's migration
      // did not refuse and this one does), a read of user_session, and a write of audit_event. As each ends, the next
      // try gets one lock further before it is refused.
      await userReader.client.query('BEGIN');
      await userReader.client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
      await userReader.client.query('SELECT status FROM "user" WHERE id = $1', [user]);
      await sessionReader.client.query('BEGIN');
      await sessionReader.client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
      await sessionReader.client.query('SELECT count(*) FROM user_session');
      await eventWriter.client.query('BEGIN');
      await eventWriter.client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
      await eventWriter.client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, 'user', 'sign_in', 'user', $1)", [user]);
      await noticeReader.client.query('BEGIN');
      await noticeReader.client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      await noticeReader.client.query('SELECT count(*) FROM password_notice');
      await pacer.client.query('SELECT pg_advisory_lock($1::integer, n) FROM generate_series(1, 8) AS n', [LOOP_PAUSES]);
      // The migration's transaction, as tp_owner, running the loop. The pause is made in that transaction and gone with it.
      await migration.client.query('BEGIN');
      await migration.client.query(
        `CREATE SCHEMA lock_loop_test;
         CREATE SEQUENCE lock_loop_test.pauses;
         CREATE FUNCTION lock_loop_test.pause() RETURNS void LANGUAGE sql AS 'SELECT pg_advisory_xact_lock(${String(LOOP_PAUSES)}, nextval(''lock_loop_test.pauses'')::integer)';
         GRANT USAGE ON SCHEMA lock_loop_test TO ${OWNER_ROLE};
         GRANT USAGE ON SEQUENCE lock_loop_test.pauses TO ${OWNER_ROLE};
         GRANT EXECUTE ON FUNCTION lock_loop_test.pause() TO ${OWNER_ROLE};`,
      );
      await migration.client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      done = migration.client.query(paced).then(
        () => {
          finished = true;
          return 'accepted';
        },
        (error: unknown) => {
          finished = true;
          return (error as { code?: string }).code ?? 'error';
        },
      );
      const holders = [
        { name: 'the read of "user"', client: userReader.client },
        { name: 'the read of user_session', client: sessionReader.client },
        { name: 'the write of audit_event', client: eventWriter.client },
        // The owner's read of password_notice alone (the job's claim would hold "user" too and be refused there).
        { name: 'the read of password_notice', client: noticeReader.client },
      ];
      for (const [index, holder] of holders.entries()) {
        // A try made with this holder open was refused, and the loop stands where it sleeps: it holds none of the
        // three tables and waits for none, so a request that would wait behind a lock the try had kept goes on.
        await pausedAt(index + 1);
        expect(await tableLocks(), `refused while ${holder.name} is open`).toEqual([]);
        expect(await goesOn(), `while ${holder.name} is open`).toBe('accepted');
        expect(finished, `while ${holder.name} is open`).toBe(false);
        await holder.client.query('COMMIT');
        expect((await pacer.client.query<{ released: boolean }>('SELECT pg_advisory_unlock($1::integer, $2::integer) AS released', [LOOP_PAUSES, index + 1])).rows).toEqual([{ released: true }]);
      }
      expect(await done).toBe('accepted');
      expect((await tableLocks()).sort((a, b) => (a.relation < b.relation ? -1 : 1))).toEqual([
        { relation: '"user"', mode: 'AccessExclusiveLock', granted: true },
        { relation: 'audit_event', mode: 'ShareRowExclusiveLock', granted: true },
        { relation: 'password_notice', mode: 'AccessExclusiveLock', granted: true },
        { relation: 'user_session', mode: 'AccessExclusiveLock', granted: true },
      ]);
    } finally {
      // The holders and the pacer first: with nothing left to refuse a try or hold a pause, the loop ends.
      for (const client of [userReader.client, sessionReader.client, eventWriter.client, noticeReader.client, pacer.client]) {
        await close(client);
      }
      await done;
      await close(migration.client);
    }
  }, 120_000);
});

describe('the migration’s preflight (docs/adr/0093 D10)', () => {
  const preflight = () => doBlock('object_not_in_prerequisite_state');
  /** unlock_user() as migration 20261015170000 created it: the body this migration's preflight compares, to the byte. */
  const UNLOCK_BEFORE = `CREATE OR REPLACE FUNCTION unlock_user(target_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator unlocks an account' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "user" SET failed_sign_ins = 0, locked_at = NULL WHERE id = target_user AND locked_at IS NOT NULL;
  RETURN FOUND;
END;
$$;`;
  /** A function of migration 20261111090000 as that file creates it, as a replacement: the bodies this migration's preflight compares, to the byte. */
  const before = (name: string): string => {
    const text = readFileSync(path.join(MIGRATIONS_DIR, '20261111090000_password_changed_notice.sql'), 'utf8');
    const start = text.indexOf(`CREATE FUNCTION ${name}(`);
    const end = text.indexOf('\n$$;\n', start);
    if (start < 0 || end < 0) {
      throw new Error(`20261111090000_password_changed_notice.sql does not create ${name}()`);
    }
    return text.slice(start, end + 5).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
  };
  const NOTICE_BEFORE = `${before('audit_event_password_notice')}\n${before('operator_password_notice_claim')}`;
  const UNDO = `
    ALTER TABLE password_notice DROP COLUMN mfa_enrolled_at_reset;
    ${NOTICE_BEFORE}
    DROP TRIGGER audit_event_sign_in_not_before ON audit_event;
    DROP TRIGGER user_session_sign_in_not_before ON user_session;
    DROP FUNCTION audit_event_sign_in_not_before(), user_session_sign_in_not_before(), sign_in_step_began(), sign_in_lock_account(), sign_in_step_refused(uuid, timestamptz, text, text),
      sign_in_lock_key_across_reset(uuid, text);
    ALTER TABLE "user" DROP COLUMN sign_in_not_before;
    ALTER TABLE user_session DROP COLUMN sign_in_began_at;
    ${UNLOCK_BEFORE}`;

  /** Runs the preflight as tp_owner in a transaction of the superuser's that `prepare` changed first, rolled back whatever happens. */
  async function preflightAfter(prepare: string): Promise<{ readonly code: string; readonly message: string } | 'accepted'> {
    const session = await connect(database.url);
    try {
      await session.client.query('BEGIN');
      await session.client.query(prepare);
      await session.client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      await session.client.query(preflight());
      return 'accepted';
    } catch (error) {
      const { code: given, message } = error as { code?: string; message?: string };
      return { code: given ?? 'error', message: message ?? '' };
    } finally {
      await close(session.client);
    }
  }

  it('passes on the head before it, and refuses each thing it creates that already exists, in words that name it', async () => {
    expect(await preflightAfter(UNDO)).toBe('accepted');
    expect(await preflightAfter('SELECT 1')).toEqual({ code: '55000', message: '"user".sign_in_not_before already exists; migration 20261112090000 creates it' });
    expect(await preflightAfter(`${UNDO} ALTER TABLE "user" ADD COLUMN sign_in_not_before timestamptz;`)).toEqual({
      code: '55000',
      message: '"user".sign_in_not_before already exists; migration 20261112090000 creates it',
    });
    expect(await preflightAfter(`${UNDO} ALTER TABLE user_session ADD COLUMN sign_in_began_at timestamptz;`)).toEqual({
      code: '55000',
      message: 'user_session.sign_in_began_at already exists; migration 20261112090000 creates it',
    });
    for (const signature of ['audit_event_sign_in_not_before()', 'user_session_sign_in_not_before()', 'sign_in_step_began()', 'sign_in_lock_account()', 'sign_in_step_refused(uuid, timestamptz, text, text)', 'sign_in_lock_key_across_reset(uuid, text)']) {
      const returns = signature.startsWith('sign_in') ? 'void' : 'trigger';
      const body = returns === 'void' ? 'BEGIN END' : 'BEGIN RETURN NULL; END';
      expect(await preflightAfter(`${UNDO} CREATE FUNCTION ${signature.replace('uuid, timestamptz, text, text', 'a uuid, b timestamptz, c text, d text')} RETURNS ${returns} LANGUAGE plpgsql AS '${body}';`), signature).toEqual({
        code: '55000',
        message: 'a function of migration 20261112090000 already exists; it creates them',
      });
    }
  });

  it('refuses when the notice’s trigger function or its claim is not the body of migration 20261111090000 that this migration replaces, and when the notice’s kept fact already exists', async () => {
    const REBASE =
      'audit_event_password_notice() or operator_password_notice_claim(uuid) is not the body of migration 20261111090000 that migration 20261112090000 replaces; rebase this migration on its latest body';
    // The head itself holds this migration's own replacements of the two, so only the undo makes the preflight pass.
    expect(await preflightAfter(`${UNDO} ${before('audit_event_password_notice').replace('RETURN NULL;', 'RETURN NEW;')}`)).toEqual({ code: '55000', message: REBASE });
    expect(await preflightAfter(`${UNDO} ${before('operator_password_notice_claim').replace("interval '24 hours'", "interval '25 hours'")}`)).toEqual({ code: '55000', message: REBASE });
    expect(await preflightAfter(`${UNDO} ALTER TABLE password_notice ADD COLUMN mfa_enrolled_at_reset boolean;`)).toEqual({
      code: '55000',
      message: 'password_notice.mfa_enrolled_at_reset already exists; migration 20261112090000 creates it',
    });
  });

  it('refuses when the notice’s trigger is gone or its guard is no longer the one this migration shares', async () => {
    const REBASE = 'audit_event_password_notice is not the trigger of migration 20261111090000 whose guard migration 20261112090000 shares; rebase this migration on its latest guard';
    expect(await preflightAfter(`${UNDO} DROP TRIGGER audit_event_password_notice ON audit_event;`)).toEqual({ code: '55000', message: REBASE });
    expect(
      await preflightAfter(
        `${UNDO} DROP TRIGGER audit_event_password_notice ON audit_event;
         CREATE TRIGGER audit_event_password_notice AFTER INSERT ON audit_event FOR EACH ROW
           WHEN (NEW.action = 'password_reset_completed' AND NEW.actor_kind = 'user' AND NEW.object_type = 'user')
           EXECUTE FUNCTION audit_event_password_notice();`,
      ),
    ).toEqual({ code: '55000', message: REBASE });
    expect(
      await preflightAfter(
        `${UNDO} DROP TRIGGER audit_event_password_notice ON audit_event;
         CREATE TRIGGER audit_event_password_notice AFTER INSERT ON audit_event FOR EACH ROW
           WHEN (NEW.action = 'password_reset_completed' AND NEW.actor_kind = 'user' AND NEW.object_type = 'user' AND NEW.object_id = NEW.actor_id)
           EXECUTE FUNCTION audit_event_password_notice();`,
      ),
    ).toBe('accepted');
  });

  it('refuses when unlock_user() is not the body of migration 20261015170000 that this migration replaces, or is gone', async () => {
    const REBASE = 'unlock_user(uuid) is not the body of migration 20261015170000 that migration 20261112090000 replaces; rebase this migration on its latest body';
    // The head itself: unlock_user() is this migration's own replacement, so only the undo makes the preflight pass.
    expect(await preflightAfter(UNDO.replace(UNLOCK_BEFORE, ''))).toEqual({ code: '55000', message: REBASE });
    // A replacer function: a replacement string would read the body's dollar quotes as its own escapes.
    expect(await preflightAfter(UNDO.replace(UNLOCK_BEFORE, () => UNLOCK_BEFORE.replace('RETURN FOUND;', 'RETURN  FOUND;')))).toEqual({ code: '55000', message: REBASE });
    expect(await preflightAfter(`${UNDO} DROP FUNCTION unlock_user(uuid);`)).toEqual({ code: '55000', message: REBASE });
  });

  it('reads the notice’s trigger the same with public off the search path, where the catalog prints the function’s schema (the build review’s DB-N1)', async () => {
    expect(await preflightAfter(`${UNDO} SET LOCAL search_path = pg_catalog;`)).toBe('accepted');
    expect(await preflightAfter(`${UNDO} DROP TRIGGER audit_event_password_notice ON audit_event; SET LOCAL search_path = pg_catalog;`)).toMatchObject({ code: '55000' });
  });
});
