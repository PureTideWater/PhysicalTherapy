import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recordAuditEvent, withActor, withJobScope } from './authz';
import { catalogProblems } from './catalog';
import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, MigrationError, migrate, readMigrations } from './migrate';
import { APP_DEV_LOGIN, APP_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, OPERATOR_ROLE, OWNER_ROLE, SCREENING_ROLE, WORKER_DEV_LOGIN } from './roles';
import { MAIL_KINDS, MAIL_STREAMS, MAIL_STREAM_KINDS, PASSWORD_NOTICE_CUTOFF_HOURS, PASSWORD_NOTICE_RETRY_MINUTES, PASSWORD_NOTICE_STALE_CODE, PASSWORD_NOTICE_STATES } from './schema';
import { type MigratedDatabase, type ScratchDatabase, type TenantWorld, asOwner, createMigratedDatabase, createScratchDatabase, createTenantWorld, createUser, endPool } from './testing';

/**
 * SGN-16's database rows (Schema PR 1; migration 20261111090000; docs/adr/0091): the password-changed notice's outbox.
 * What the database proves: the outbox is the owner's alone and no role reaches it but through the definer functions;
 * the database writes one pending notice in the reset's own transaction, only for the account's own
 * password_reset_completed (the guard: a person, acting on themselves); the address is read only by the claim of a
 * pending, due notice inside the 24-hour cutoff, checked again under the claim's lock, which also says whether the
 * account has a second factor enrolled; a notice is sent once, retried after 1, 5, 15 and 60 minutes, failed at the
 * fifth try, at once on a permanent error, or as stale past the cutoff; a bounce, a suppression or a rejection makes
 * it undelivered and reports it exactly once through the one helper's four callers, a complaint changes nothing, and
 * the end state is F of the final mail record in any order of the send and its events, concurrent ones included (the
 * message-ID lock, each side's position pinned), read from a password_changed message's record alone; the record
 * function's seventh column; the kind on the transactional stream; the expiry; the migration's lock loop, each refused
 * try giving back all it took; and, on a database at the previous head, each of the preflight's refusals, what it
 * compares whole, and that the whole file holds no table lock beyond the loop's three.
 * Synthetic data only: every address is @synthetic.test.
 */

const MIGRATION = '20261111090000_password_changed_notice.sql';
const MAIL_STREAMS_MIGRATION = '20261107090000_mail_streams.sql';
const SEARCH_PATH = ['search_path=pg_catalog, public, pg_temp'];
const RECORD_SIGNATURE = 'operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text)';
const OPERATOR_FUNCTIONS = [
  'operator_password_notices_stale(integer,text)',
  'operator_password_notices_due(integer)',
  'operator_password_notice_claim(uuid)',
  'operator_password_notice_sent(uuid,text,text)',
  'operator_password_notice_failed(uuid,text,boolean,text)',
] as const;
const ROLES = [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, SCREENING_ROLE, APP_DEV_LOGIN, WORKER_DEV_LOGIN] as const;
/** The record function's result, the seventh column last. */
const RECORDED_COLUMNS = ['recorded', 'state', 'notice_undelivered', 'invoice_undelivered', 'invitation_undelivered', 'stream_paused', 'password_notice_undelivered'] as const;
const RECORD = 'SELECT * FROM operator_record_mail_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)';
/** The previous platform image's call (apps/worker/src/platform/mail-events.ts before this change): its six columns by name. */
const PREVIOUS_RECORD = `SELECT recorded, state, notice_undelivered, invoice_undelivered, invitation_undelivered, stream_paused
         FROM operator_record_mail_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`;
/** The first key of the advisory locks the lock-loop test paces the loop with; the second is the pause's number. */
const LOOP_PAUSES = 20261111;
/** PostgreSQL's table lock modes as pg_locks names them, in its own order, weakest first. */
const TABLE_LOCK_MODES = ['AccessShareLock', 'RowShareLock', 'RowExclusiveLock', 'ShareUpdateExclusiveLock', 'ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock'];

let database: MigratedDatabase;
/** The superuser on the scratch database: seeds and reads past every policy. */
let owner: pg.Client;
/** The superuser's pool, each transaction SET LOCAL ROLE to the role under test. */
let admin: pg.Pool;
/** The application's dev login (tp_app_dev), as the web's requests use it. */
let app: pg.Pool;
let world: TenantWorld;
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
/** A message ID in SES's shape. */
const messageId = () => `0100019a${randomUUID().replace(/-/g, '')}-000000`;
const request = () => `test-${randomUUID()}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One transaction as `role`, no actor and no practice in scope (as the platform job's asOperator(client, null, ...)), committed, or rolled back on error. */
async function inTransaction<T>(role: string, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.actor_id', '', true), set_config('app.practice_ids', '{}', true)");
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(role: string, sql: string, values: unknown[] = []): Promise<T[]> {
  return inTransaction(role, async (client) => (await client.query<T>(sql, values)).rows);
}

interface Session {
  readonly client: pg.Client;
  /** Its backend, read before the transaction opens: a query on a connection waits behind its blocked statement. */
  readonly pid: number;
}

/** A connection of its own with an open transaction as `role` (tp_operator unless named), as the platform job opens one. */
async function openSession(role: string = OPERATOR_ROLE): Promise<Session> {
  const client = new pg.Client({ connectionString: database.url });
  client.on('error', () => undefined);
  await client.connect();
  clients.push(client);
  const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0;
  await client.query('BEGIN');
  await client.query(`SET LOCAL ROLE ${role}`);
  await client.query("SELECT set_config('app.actor_id', '', true), set_config('app.practice_ids', '{}', true)");
  return { client, pid };
}

async function close(client: pg.Client): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end().catch(() => undefined);
}

/** True once backend `pid` waits on an advisory lock it has not been granted; false after 5 s. */
async function waitsOnAdvisoryLock(pid: number): Promise<boolean> {
  for (let tries = 0; tries < 500; tries += 1) {
    const { rows } = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted", [pid]);
    if ((rows[0]?.n ?? 0) > 0) {
      return true;
    }
    await pause(10);
  }
  return false;
}

interface NoticeRow {
  readonly id: string;
  readonly user_id: string;
  readonly audit_event_id: string;
  readonly changed_at: Date;
  readonly state: string;
  readonly attempts: number;
  readonly next_attempt_at: Date;
  readonly ses_message_id: string | null;
  readonly error_code: string | null;
  readonly sent_at: Date | null;
  readonly undelivered_reported_at: Date | null;
  readonly expires_at: Date;
}

async function noticesOf(user: string): Promise<NoticeRow[]> {
  return (await owner.query<NoticeRow>('SELECT * FROM password_notice WHERE user_id = $1 ORDER BY changed_at, id', [user])).rows;
}

async function noticeRow(id: string): Promise<NoticeRow | undefined> {
  return (await owner.query<NoticeRow>('SELECT * FROM password_notice WHERE id = $1', [id])).rows[0];
}

/** The web's completed reset (apps/web/src/lib/auth/sign-in.ts): as the user, password_reset_completed naming the user. */
async function completeReset(user: string, requestId: string = request()): Promise<{ readonly eventId: string; readonly at: Date }> {
  await withActor(app, user, (scope) => recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId }));
  const { rows } = await owner.query<{ id: string; at: Date }>("SELECT id, at FROM audit_event WHERE action = 'password_reset_completed' AND actor_id = $1 AND request_id = $2", [user, requestId]);
  const event = rows[0];
  if (event === undefined) {
    throw new Error('the reset recorded no event');
  }
  return { eventId: event.id, at: event.at };
}

/** A new account and its completed reset's notice, pending and due. */
async function pendingNotice(): Promise<{ readonly user: string; readonly notice: string }> {
  const user = await createUser(owner);
  await completeReset(user);
  const [row] = await noticesOf(user);
  if (row === undefined) {
    throw new Error('the reset queued no notice');
  }
  return { user, notice: row.id };
}

/** Moves a notice's change (and its expiry with it, inside password_notice_expiry_window) into the past. */
async function age(notice: string, by: string): Promise<void> {
  await owner.query('UPDATE password_notice SET changed_at = changed_at - $2::interval, expires_at = expires_at - $2::interval WHERE id = $1', [notice, by]);
}

async function dueIds(among: readonly string[]): Promise<string[]> {
  const rows = await as<{ notice_id: string }>(OPERATOR_ROLE, 'SELECT notice_id FROM operator_password_notices_due($1) WHERE notice_id = ANY ($2::uuid[])', [10_000, [...among]]);
  return rows.map((row) => row.notice_id);
}

/** The claim's row, its four columns in the function's order: the account, its address, the change's time and whether a second factor is enrolled. */
interface Claimed {
  readonly user_id: string;
  readonly email: string;
  readonly changed_at: Date;
  readonly mfa_enrolled: boolean;
}

/** The claim as the platform's password_notices job reads it: its four columns by name. */
const CLAIM = 'SELECT user_id, email, changed_at, mfa_enrolled FROM operator_password_notice_claim($1)';

async function claim(notice: string): Promise<Claimed[]> {
  return as<Claimed & pg.QueryResultRow>(OPERATOR_ROLE, CLAIM, [notice]);
}

/** The job's step for one due notice: the claim and the record of the message SES accepted, in one transaction. */
async function send(notice: string, message: string, requestId: string = request()): Promise<{ readonly claimed: Claimed | undefined; readonly undelivered: boolean }> {
  return inTransaction(OPERATOR_ROLE, async (client) => {
    const claimed = (await client.query<Claimed>(CLAIM, [notice])).rows[0];
    const sent = (await client.query<{ undelivered: boolean }>('SELECT operator_password_notice_sent($1, $2, $3) AS undelivered', [notice, message, requestId])).rows[0];
    return { claimed, undelivered: sent?.undelivered ?? false };
  });
}

async function failed(notice: string, errorName: string | null, permanent: boolean): Promise<boolean | undefined> {
  const [row] = await as<{ undelivered: boolean }>(OPERATOR_ROLE, 'SELECT operator_password_notice_failed($1, $2, $3, $4) AS undelivered', [notice, errorName, permanent, request()]);
  return row?.undelivered;
}

async function staleAmong(among: readonly string[]): Promise<{ notice_id: string; user_id: string }[]> {
  const rows = await as<{ notice_id: string; user_id: string }>(OPERATOR_ROLE, 'SELECT notice_id, user_id FROM operator_password_notices_stale($1, $2)', [10_000, request()]);
  return rows.filter((row) => among.includes(row.notice_id)).sort((a, b) => a.notice_id.localeCompare(b.notice_id));
}

interface Recorded {
  readonly recorded: boolean;
  readonly state: string;
  readonly notice_undelivered: string | null;
  readonly invoice_undelivered: string | null;
  readonly invitation_undelivered: string | null;
  readonly stream_paused: string | null;
  readonly password_notice_undelivered: string | null;
}

/** SES's events of a password-changed message, as the mail_events job reads them (apps/worker/src/mail/events.ts). */
const PASSWORD_EVENTS = ['delivery', 'delivery_delay', 'bounce', 'suppression', 'rejection', 'complaint'] as const;
type PasswordEvent = (typeof PASSWORD_EVENTS)[number];

function eventValues(message: string, notice: string, user: string, event: PasswordEvent, stream = 'transactional'): unknown[] {
  const ses = { delivery: 'delivery', delivery_delay: 'delivery_delay', bounce: 'bounce', suppression: 'bounce', rejection: 'reject', complaint: 'complaint' }[event];
  const subtype = event === 'bounce' ? 'general' : event === 'suppression' ? 'on_account_suppression_list' : null;
  return [message, stream, ses, new Date(), new Date(), null, 'password_changed', notice, user, null, subtype === null ? null : 'permanent', subtype, event === 'complaint' ? 'abuse' : null, request()];
}

/** One SES event of a password-changed message, recorded by the platform's mail_events job (tp_operator, no practice). */
async function record(message: string, notice: string, user: string, event: PasswordEvent): Promise<Recorded> {
  const [row] = await as<Recorded & pg.QueryResultRow>(OPERATOR_ROLE, RECORD, eventValues(message, notice, user, event));
  if (row === undefined) {
    throw new Error('operator_record_mail_event returned no row');
  }
  return row;
}

async function auditCount(action: string, objectId: string): Promise<number> {
  const { rows } = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE action = $1 AND object_type = 'user' AND object_id = $2", [action, objectId]);
  return rows[0]?.n ?? -1;
}

async function constraintLiterals(table: string, name: string): Promise<string[]> {
  const { rows } = await owner.query<{ definition: string }>('SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid = $1::regclass AND c.conname = $2', [table, name]);
  return [...(rows[0]?.definition ?? '').matchAll(/'((?:[^']|'')*)'::text/g)].map((match) => (match[1] ?? '').replace(/''/g, "'"));
}

async function functionDefinition(signature: string): Promise<string> {
  const { rows } = await owner.query<{ definition: string }>('SELECT pg_get_functiondef($1::regprocedure) AS definition', [signature]);
  return rows[0]?.definition ?? '';
}

/** F (docs/adr/0091, D8): the notice's state as its message's final mail record makes it. */
function stateOf(mail: { readonly state: string; readonly delivered: boolean }): string {
  if (['bounced', 'suppressed', 'rejected'].includes(mail.state)) {
    return 'undelivered';
  }
  return mail.delivered ? 'delivered' : 'sent';
}

/** A migration's one CREATE FUNCTION statement of `name`, header to its closing `$$;`. */
function statementIn(file: string, name: string): string {
  const text = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const start = text.indexOf(`CREATE FUNCTION ${name}(`);
  expect(start, file).toBeGreaterThan(0);
  expect(text.indexOf(`CREATE FUNCTION ${name}(`, start + 1), file).toBe(-1);
  return text.slice(start, text.indexOf('\n$$;', start) + 4);
}

/** The migration's one lock loop, as it stands in the file: the DO block that takes the three tables' locks. */
function lockLoop(): string {
  const text = readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const block = text
    .split(/^DO \$\$$/m)
    .slice(1)
    .map((rest) => `DO $$${rest.slice(0, rest.indexOf('\n$$;') + 4)}`)
    .find((candidate) => candidate.includes('NOWAIT'));
  if (block === undefined) {
    throw new Error(`${MIGRATION} has no NOWAIT lock loop`);
  }
  return block;
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  admin = new pg.Pool({ connectionString: database.url, max: 10 });
  app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
  world = await createTenantWorld(owner, 'password notice');
}, 120_000);

afterAll(async () => {
  for (const client of clients) {
    await close(client);
  }
  await endPool(app);
  await endPool(admin);
  await owner.end();
  await database.drop();
});

describe('the outbox (SGN-16; docs/adr/0091 D4)', () => {
  it('is the owner’s alone: forced row-level security, the owner’s policy, its five indexes and its trigger, no registry row, and no other role’s privilege', async () => {
    const { rows } = await owner.query<{ rls: boolean; forced: boolean; owner: string; acl: string[] | null }>(
      "SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, pg_get_userbyid(c.relowner) AS owner, c.relacl::text[] AS acl FROM pg_class c WHERE c.oid = 'password_notice'::regclass",
    );
    expect(rows[0]).toMatchObject({ rls: true, forced: true, owner: OWNER_ROLE });
    expect((rows[0]?.acl ?? []).filter((entry) => !entry.startsWith(`${OWNER_ROLE}=`))).toEqual([]);
    const policies = await owner.query(
      `SELECT pol.polname AS name, pol.polcmd::text AS command, pol.polpermissive AS permissive, ARRAY(SELECT pg_get_userbyid(r)::text FROM unnest(pol.polroles) r) AS roles,
              pg_get_expr(pol.polqual, pol.polrelid) AS using_expression, pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
         FROM pg_policy pol WHERE pol.polrelid = 'password_notice'::regclass ORDER BY 1`,
    );
    expect(policies.rows).toEqual([{ name: 'password_notice_owner', command: '*', permissive: true, roles: [OWNER_ROLE], using_expression: 'true', check_expression: 'true' }]);
    expect((await owner.query("SELECT table_name FROM phi_table_registry WHERE table_name = 'password_notice'")).rows).toEqual([]);
    const indexes = await owner.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE tablename = 'password_notice' ORDER BY indexname");
    expect(indexes.rows.map((row) => row.indexdef)).toEqual([
      'CREATE INDEX password_notice_by_expiry ON public.password_notice USING btree (expires_at)',
      'CREATE UNIQUE INDEX password_notice_once ON public.password_notice USING btree (audit_event_id)',
      "CREATE INDEX password_notice_pending ON public.password_notice USING btree (next_attempt_at) WHERE (state = 'pending'::text)",
      'CREATE UNIQUE INDEX password_notice_pkey ON public.password_notice USING btree (id)',
      'CREATE UNIQUE INDEX password_notice_ses_message_id_key ON public.password_notice USING btree (ses_message_id)',
    ]);
    const triggers = await owner.query("SELECT tgname AS name, tgfoid::regproc::text AS fn FROM pg_trigger WHERE tgrelid = 'password_notice'::regclass AND NOT tgisinternal ORDER BY tgname");
    expect(triggers.rows).toEqual([{ name: 'password_notice_updated_at', fn: 'set_updated_at' }]);
    for (const role of ROLES) {
      const held = await owner.query<{ any: boolean }>(
        "SELECT has_table_privilege($1, 'password_notice', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1, 'password_notice', 'SELECT,INSERT,UPDATE,REFERENCES') AS any",
        [role],
      );
      expect(held.rows[0]?.any, role).toBe(false);
    }
    // The application's login and the operator read and write it only through the definer functions.
    expect(await code(app.query('SELECT count(*) FROM password_notice'))).toBe('42501');
    expect(await code(as(OPERATOR_ROLE, 'SELECT count(*) FROM password_notice'))).toBe('42501');
    expect(await code(as(APP_ROLE, "UPDATE password_notice SET state = 'sent'"))).toBe('42501');
    expect(await catalogProblems(owner)).toEqual([]);
  });

  it('holds its closed lists and rules in its CHECKs, the states equal to PASSWORD_NOTICE_STATES', async () => {
    expect(await constraintLiterals('password_notice', 'password_notice_state')).toEqual([...PASSWORD_NOTICE_STATES]);
    const user = await createUser(owner);
    const insert = (columns: string, values: string) =>
      failure(owner.query(`INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at${columns}) VALUES ($1, gen_random_uuid(), now(), now() + interval '90 days'${values})`, [user]));
    expect(await insert('', '')).toBe('accepted');
    expect(await insert(', state', ", 'sent'")).toMatchObject({ code: '23514', constraint: 'password_notice_sent' });
    expect(await insert(', state, ses_message_id, sent_at', ", 'pending', '0100019a0000000000000000000000000000-000000', now()")).toMatchObject({ code: '23514', constraint: 'password_notice_sent' });
    expect(await insert(', state', ", 'failed'")).toMatchObject({ code: '23514', constraint: 'password_notice_failed' });
    expect(await insert(', error_code', ", 'Throttling'")).toMatchObject({ code: '23514', constraint: 'password_notice_failed' });
    expect(await insert(', state, error_code', ", 'failed', 'Not a name'")).toMatchObject({ code: '23514', constraint: 'password_notice_error_code' });
    expect(await insert(', undelivered_reported_at', ', now()')).toMatchObject({ code: '23514', constraint: 'password_notice_reported' });
    expect(await insert(', attempts', ', 6')).toMatchObject({ code: '23514', constraint: 'password_notice_attempts' });
    expect(await insert(', state, ses_message_id, sent_at', ", 'opened', '0100019a1111111111111111111111111111-000000', now()")).toMatchObject({ code: '23514', constraint: 'password_notice_state' });
    expect(
      await failure(owner.query("INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at) VALUES ($1, gen_random_uuid(), now(), now() + interval '92 days')", [user])),
    ).toMatchObject({ code: '23514', constraint: 'password_notice_expiry_window' });
    expect(await failure(owner.query("INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at) VALUES (gen_random_uuid(), gen_random_uuid(), now(), now() + interval '90 days')"))).toMatchObject({
      code: '23503',
    });
  });
});

describe('what queues a notice (docs/adr/0091 D1 to D3)', () => {
  it('queues one pending notice for a completed reset, written by the database in the reset’s own transaction', async () => {
    const user = await createUser(owner);
    const { eventId, at } = await completeReset(user);
    const rows = await noticesOf(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: user,
      audit_event_id: eventId,
      state: 'pending',
      attempts: 0,
      ses_message_id: null,
      error_code: null,
      sent_at: null,
      undelivered_reported_at: null,
    });
    expect(rows[0]?.changed_at).toEqual(at);
    const spans = await owner.query("SELECT expires_at = changed_at + interval '90 days' AS ninety_days, next_attempt_at <= now() AS due FROM password_notice WHERE id = $1", [rows[0]?.id]);
    expect(spans.rows).toEqual([{ ninety_days: true, due: true }]);
    // The trigger: AFTER INSERT, for each row, guarded, its function the owner's definer.
    const trigger = await owner.query<{ definition: string; fn: string; definer: boolean; owner: string; config: string[]; acl: string }>(
      `SELECT pg_get_triggerdef(t.oid) AS definition, t.tgfoid::regprocedure::text AS fn, p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS owner, p.proconfig AS config, p.proacl::text AS acl
         FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid = 'audit_event'::regclass AND t.tgname = 'audit_event_password_notice'`,
    );
    expect(trigger.rows).toEqual([
      {
        definition:
          "CREATE TRIGGER audit_event_password_notice AFTER INSERT ON public.audit_event FOR EACH ROW WHEN (((new.action = 'password_reset_completed'::text) AND (new.actor_kind = 'user'::text) AND (new.object_type = 'user'::text) AND (new.object_id = new.actor_id))) EXECUTE FUNCTION audit_event_password_notice()",
        fn: 'audit_event_password_notice()',
        definer: true,
        owner: OWNER_ROLE,
        config: SEARCH_PATH,
        acl: `{${OWNER_ROLE}=X/${OWNER_ROLE}}`,
      },
    ]);
  });

  it('queues none when the reset’s transaction rolls back', async () => {
    const user = await createUser(owner);
    await expect(
      withActor(app, user, async (scope) => {
        await recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: user, purpose: 'email_code', requestId: request() });
        throw new Error('the reset transaction failed');
      }),
    ).rejects.toThrow('the reset transaction failed');
    expect(await noticesOf(user)).toEqual([]);
    expect(await auditCount('password_reset_completed', user)).toBe(0);
  });

  it('queues none for any other action of the same shape: the invitation’s first password, a reset request, a sign-in, a membership', async () => {
    const user = await createUser(owner);
    for (const action of ['password_changed', 'password_reset_requested', 'sign_in', 'membership_created']) {
      await withActor(app, user, (scope) => recordAuditEvent(scope, { action, objectType: 'user', objectId: user, purpose: 'email_code', requestId: request() }));
      expect(await auditCount(action, user), action).toBe(1);
    }
    expect(await noticesOf(user)).toEqual([]);
  });

  it('queues none unless a person records it about themselves (the guard): another user as the object, no object, another type, a service or a job, the database', async () => {
    const user = await createUser(owner);
    const other = await createUser(owner);
    const reset = (objectType: string, objectId?: string) =>
      withActor(app, user, (scope) =>
        recordAuditEvent(scope, { action: 'password_reset_completed', objectType, ...(objectId === undefined ? {} : { objectId }), purpose: 'email_code', requestId: request() }),
      );
    // Each is recorded, and queues nothing: no address is mailed for another's event.
    await reset('user', other);
    await reset('user');
    await reset('membership', user);
    await withActor(app, user, (scope) =>
      scope.client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'service', 'password_reset_completed', 'user', $1, 'email_code')", [user]),
    );
    const jobId = randomUUID();
    await withJobScope(app, { jobId, practiceId: world.practiceId }, (scope) =>
      recordAuditEvent(scope, { action: 'password_reset_completed', objectType: 'user', objectId: jobId, purpose: 'email_code', requestId: request() }),
    );
    await asOwner(owner, [], () =>
      owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'system', 'password_reset_completed', 'user', $1, 'email_code')", [user]),
    );
    const recorded = await owner.query<{ actor_kind: string; object_type: string; object_id: string | null }>(
      "SELECT actor_kind, object_type, object_id FROM audit_event WHERE action = 'password_reset_completed' AND actor_id = ANY ($1::uuid[]) ORDER BY at, id",
      [[user, jobId]],
    );
    expect(recorded.rows).toEqual([
      { actor_kind: 'user', object_type: 'user', object_id: other },
      { actor_kind: 'user', object_type: 'user', object_id: null },
      { actor_kind: 'user', object_type: 'membership', object_id: user },
      { actor_kind: 'service', object_type: 'user', object_id: user },
      { actor_kind: 'service', object_type: 'user', object_id: jobId },
      { actor_kind: 'system', object_type: 'user', object_id: user },
    ]);
    expect(await noticesOf(user)).toEqual([]);
    expect(await noticesOf(other)).toEqual([]);
  });

  it('queues one notice an event, however often the event is seen (password_notice_once), and one for each reset', async () => {
    const user = await createUser(owner);
    const eventId = randomUUID();
    await asOwner(owner, [], async () => {
      await owner.query("INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at) VALUES ($1, $2, now(), now() + interval '90 days')", [user, eventId]);
      await owner.query("INSERT INTO audit_event (id, actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($2, $1, 'user', 'password_reset_completed', 'user', $1, 'email_code')", [user, eventId]);
    });
    expect((await noticesOf(user)).map((row) => row.audit_event_id)).toEqual([eventId]);
    await completeReset(user);
    expect(await noticesOf(user)).toHaveLength(2);
  });

  it('reserves the two actions the outbox writes: the application role writes neither, as a user or a service', async () => {
    const user = await createUser(owner);
    for (const reserved of ['password_notice_sent', 'password_notice_undelivered']) {
      for (const kind of ['user', 'service']) {
        expect(
          await code(
            withActor(app, user, (scope) =>
              scope.client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, $2, $3, 'user', $1, 'password_changed')", [user, kind, reserved]),
            ),
          ),
          `${reserved} as ${kind}`,
        ).toBe('42501');
      }
    }
    // The reset itself stays the web's to record.
    await completeReset(user);
    expect(await auditCount('password_reset_completed', user)).toBe(1);
  });
});

describe('the functions’ grants (docs/adr/0091 D4)', () => {
  it('makes the five operator functions, the record and the expiry definers granted to tp_operator alone, and the helper and the trigger function granted to no one', async () => {
    const expected: Readonly<Record<string, { readonly definer: boolean; readonly grantees: readonly string[] }>> = {
      'password_notice_report_undelivered(uuid,text)': { definer: false, grantees: [] },
      'audit_event_password_notice()': { definer: true, grantees: [] },
      ...Object.fromEntries(OPERATOR_FUNCTIONS.map((name) => [name, { definer: true, grantees: [OPERATOR_ROLE] }])),
      [RECORD_SIGNATURE]: { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_mail_expire(integer)': { definer: true, grantees: [OPERATOR_ROLE] },
    };
    const { rows } = await owner.query<{ name: string; definer: boolean; config: string[] | null; owner: string; grantees: string[]; public: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer, p.proconfig AS config, pg_get_userbyid(p.proowner) AS owner,
              ARRAY(SELECT DISTINCT pg_get_userbyid(x.grantee)::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                     WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> 0 AND x.grantee <> p.proowner ORDER BY 1) AS grantees,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND (p.oid::regprocedure::text = ANY ($1) OR p.proname LIKE '%password_notice%') ORDER BY 1`,
      [Object.keys(expected)],
    );
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(expected).sort());
    for (const row of rows) {
      const wanted = expected[row.name];
      expect({ definer: row.definer, owner: row.owner, grantees: row.grantees, public: row.public, config: row.config }, row.name).toEqual({
        definer: wanted?.definer,
        owner: OWNER_ROLE,
        grantees: [...(wanted?.grantees ?? [])],
        public: false,
        config: SEARCH_PATH,
      });
    }
    // The application role calls none of them; the operator not the helper.
    const calls: readonly (readonly [string, unknown[]])[] = [
      ['SELECT * FROM operator_password_notices_stale($1, $2)', [1, request()]],
      ['SELECT * FROM operator_password_notices_due($1)', [1]],
      ['SELECT * FROM operator_password_notice_claim($1)', [randomUUID()]],
      ['SELECT operator_password_notice_sent($1, $2, $3)', [randomUUID(), messageId(), request()]],
      ['SELECT operator_password_notice_failed($1, $2, $3, $4)', [randomUUID(), 'Throttling', false, request()]],
      ['SELECT operator_mail_expire($1)', [1]],
      [RECORD, [messageId(), 'transactional', 'delivery', new Date(), new Date(), null, 'digest', randomUUID(), null, null, null, null, null, request()]],
      ['SELECT password_notice_report_undelivered($1, $2)', [randomUUID(), request()]],
    ];
    for (const [sql, values] of calls) {
      expect(await code(as(APP_ROLE, sql, values)), sql).toBe('42501');
      expect(await code(app.query(sql, values)), sql).toBe('42501');
    }
    expect(await code(as(OPERATOR_ROLE, 'SELECT password_notice_report_undelivered($1, $2)', [randomUUID(), request()]))).toBe('42501');
    for (const role of ROLES) {
      const may = await owner.query<{ may: boolean }>(
        "SELECT has_function_privilege($1, 'password_notice_report_undelivered(uuid, text)', 'EXECUTE') OR has_function_privilege($1, 'audit_event_password_notice()', 'EXECUTE') AS may",
        [role],
      );
      expect(may.rows[0]?.may, role).toBe(false);
    }
  });
});

describe('the job’s reads: due, and the claim, the address’s only reader (docs/adr/0091 D4, D7)', () => {
  it('lists a pending, due notice under 24 hours, and claims only it: never a sent, failed, not-yet-due or day-old one, nor one another run holds', async () => {
    const due = await pendingNotice();
    const sent = await pendingNotice();
    await send(sent.notice, messageId());
    const gaveUp = await pendingNotice();
    expect(await failed(gaveUp.notice, 'MessageRejected', true)).toBe(true);
    const later = await pendingNotice();
    await owner.query("UPDATE password_notice SET next_attempt_at = now() + interval '1 hour' WHERE id = $1", [later.notice]);
    const old = await pendingNotice();
    await age(old.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS)} hours 1 minute`);
    const ids = [due, sent, gaveUp, later, old].map((made) => made.notice);
    const listed = await as<{ notice_id: string; user_id: string }>(OPERATOR_ROLE, 'SELECT notice_id, user_id FROM operator_password_notices_due($1) WHERE notice_id = ANY ($2::uuid[])', [10_000, ids]);
    expect(listed).toEqual([{ notice_id: due.notice, user_id: due.user }]);
    for (const other of [sent, gaveUp, later, old]) {
      expect(await claim(other.notice)).toEqual([]);
    }
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_password_notices_due(0)')).toEqual([]);
    // A second run cannot claim the notice the first holds.
    const first = await openSession();
    try {
      const held = await first.client.query<Claimed>(CLAIM, [due.notice]);
      expect(held.rows).toEqual([{ user_id: due.user, email: `${due.user}@synthetic.test`, changed_at: (await noticeRow(due.notice))?.changed_at, mfa_enrolled: true }]);
      expect(await claim(due.notice)).toEqual([]);
    } finally {
      await close(first.client);
    }
    expect(await claim(due.notice)).toHaveLength(1);
    // The operator reads no account but through the claim.
    expect(await code(as(OPERATOR_ROLE, 'SELECT email FROM "user" LIMIT 1'))).toBe('42501');
    expect(await code(as(OPERATOR_ROLE, 'SELECT count(*) FROM "user"'))).toBe('42501');
  });

  it('checks the cutoff again under the claim’s lock: one listed due and then past 24 hours is refused; 23 h 59 min is claimed, 24 h 01 min is stale', async () => {
    const listed = await pendingNotice();
    expect(await dueIds([listed.notice])).toEqual([listed.notice]);
    await age(listed.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS)} hours 1 minute`);
    expect(await claim(listed.notice)).toEqual([]);
    const inside = await pendingNotice();
    await age(inside.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS - 1)} hours 59 minutes`);
    expect(await dueIds([inside.notice])).toEqual([inside.notice]);
    expect(await claim(inside.notice)).toHaveLength(1);
    const outside = await pendingNotice();
    await age(outside.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS)} hours 1 minute`);
    expect(await dueIds([outside.notice])).toEqual([]);
    expect(await claim(outside.notice)).toEqual([]);
    expect(await staleAmong([listed.notice, inside.notice, outside.notice])).toEqual(
      [listed, outside].map((made) => ({ notice_id: made.notice, user_id: made.user })).sort((a, b) => a.notice_id.localeCompare(b.notice_id)),
    );
    expect((await noticeRow(inside.notice))?.state).toBe('pending');
  });

  it('returns with the address whether the account has a second factor enrolled, from the account’s own row as the claim finds it, fourth and last (docs/adr/0091 D10; the review of 2026-11-11, SEC-03)', async () => {
    // The email's second line says a second factor guards the account only when this is true.
    const columns = await owner.query<{ name: string; type: string }>(
      `SELECT a.name, format_type(a.type, NULL) AS type FROM pg_proc p, unnest(p.proargnames, p.proargmodes, p.proallargtypes) WITH ORDINALITY AS a (name, mode, type, n)
        WHERE p.oid = 'operator_password_notice_claim(uuid)'::regprocedure AND a.mode = 't' ORDER BY a.n`,
    );
    expect(columns.rows).toEqual([
      { name: 'user_id', type: 'uuid' },
      { name: 'email', type: 'text' },
      { name: 'changed_at', type: 'timestamp with time zone' },
      { name: 'mfa_enrolled', type: 'boolean' },
    ]);
    const enrolled = await pendingNotice();
    expect(await claim(enrolled.notice)).toEqual([
      { user_id: enrolled.user, email: `${enrolled.user}@synthetic.test`, changed_at: (await noticeRow(enrolled.notice))?.changed_at, mfa_enrolled: true },
    ]);
    // An account with no second factor (an invitee who chose a password and stopped before the authenticator), its
    // password reset all the same: the claim says so, and the job sends the second line without its second sentence.
    const bare = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    await completeReset(bare);
    const [notice] = await noticesOf(bare);
    expect(notice).toMatchObject({ state: 'pending' });
    const read = async () => (await as<Claimed & pg.QueryResultRow>(OPERATOR_ROLE, 'SELECT * FROM operator_password_notice_claim($1)', [notice?.id])).map((row) => Object.entries(row));
    expect(await read()).toEqual([
      [
        ['user_id', bare],
        ['email', `${bare}@synthetic.test`],
        ['changed_at', notice?.changed_at],
        ['mfa_enrolled', false],
      ],
    ]);
    // Kept as it was at the reset, by the trigger, not read when the notice is claimed (docs/adr/0091 D10, case (d);
    // migration 20261112090000): a factor enrolled between the reset and the send, by whoever completed the reset, does
    // not make the email say a second factor guards the account.
    expect((await owner.query<{ kept: boolean | null }>('SELECT mfa_enrolled_at_reset AS kept FROM password_notice WHERE id = $1', [notice?.id])).rows).toEqual([{ kept: false }]);
    await asOwner(owner, [], () => owner.query('UPDATE "user" SET mfa_enrolled = true WHERE id = $1', [bare]));
    expect((await read()).map((row) => row[3])).toEqual([['mfa_enrolled', false]]);
    // And the other way: an account enrolled at the reset is still told so if the factor is cleared before the send.
    expect((await owner.query<{ kept: boolean | null }>('SELECT mfa_enrolled_at_reset AS kept FROM password_notice WHERE id = $1', [enrolled.notice])).rows).toEqual([{ kept: true }]);
    await asOwner(owner, [], () => owner.query('UPDATE "user" SET mfa_enrolled = false WHERE id = $1', [enrolled.user]));
    expect((await claim(enrolled.notice)).map((row) => row.mfa_enrolled)).toEqual([true]);
    // A notice queued before the column existed keeps no fact: the claim answers false, the side that claims less.
    await asOwner(owner, [], () => owner.query('UPDATE "user" SET mfa_enrolled = true WHERE id = $1', [enrolled.user]));
    await owner.query('UPDATE password_notice SET mfa_enrolled_at_reset = NULL WHERE id = $1', [enrolled.notice]);
    expect((await claim(enrolled.notice)).map((row) => row.mfa_enrolled)).toEqual([false]);
  });
});

describe('sent, failed and stale (docs/adr/0091 D6 to D8)', () => {
  it('records the message SES accepted once, while pending, with one password_notice_sent', async () => {
    const { user, notice } = await pendingNotice();
    const message = messageId();
    const requestId = request();
    const result = await send(notice, message, requestId);
    expect(result.claimed).toMatchObject({ user_id: user, email: `${user}@synthetic.test` });
    expect(result.undelivered).toBe(false);
    expect(await noticeRow(notice)).toMatchObject({ state: 'sent', ses_message_id: message, error_code: null, attempts: 0, undelivered_reported_at: null });
    expect((await noticeRow(notice))?.sent_at).toBeInstanceOf(Date);
    const events = await owner.query(
      "SELECT actor_id, actor_kind, object_type, object_id, practice_id, grant_id, purpose, request_id FROM audit_event WHERE action = 'password_notice_sent' AND object_id = $1",
      [user],
    );
    expect(events.rows).toEqual([{ actor_id: null, actor_kind: 'system', object_type: 'user', object_id: user, practice_id: null, grant_id: null, purpose: 'password_changed', request_id: requestId }]);
    // A second record is refused, and writes no second event.
    expect(await failure(as(OPERATOR_ROLE, 'SELECT operator_password_notice_sent($1, $2, $3)', [notice, messageId(), request()]))).toEqual({ code: '23514', constraint: 'password_notice_sent' });
    expect(await auditCount('password_notice_sent', user)).toBe(1);
    // A message ID not in SES's shape is refused before anything is read.
    const other = await pendingNotice();
    for (const given of [null, 'short', `${'a'.repeat(30)} ${'b'.repeat(30)}`, `${'a'.repeat(101)}`]) {
      expect(await failure(as(OPERATOR_ROLE, 'SELECT operator_password_notice_sent($1, $2, $3)', [other.notice, given, request()])), String(given)).toEqual({
        code: '23514',
        constraint: 'password_notice_message_id',
      });
    }
    expect(await noticeRow(other.notice)).toMatchObject({ state: 'pending', ses_message_id: null });
  });

  it('retries a send that threw after 1, 5, 15 and 60 minutes, fails it at the fifth try or at once on a permanent error, and reports it once', async () => {
    const { user, notice } = await pendingNotice();
    const retry = async () =>
      (
        await owner.query<{ attempts: number; state: string; error_code: string | null; wait: number }>(
          'SELECT attempts, state, error_code, round(extract(epoch FROM next_attempt_at - now()) / 60)::int AS wait FROM password_notice WHERE id = $1',
          [notice],
        )
      ).rows[0];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await failed(notice, 'Throttling', false)).toBe(false);
      expect(await retry()).toEqual({ attempts: attempt, state: 'pending', error_code: null, wait: PASSWORD_NOTICE_RETRY_MINUTES[attempt - 1] });
      // Not due again until then.
      expect(await dueIds([notice])).toEqual([]);
      expect(await claim(notice)).toEqual([]);
    }
    expect(await auditCount('password_notice_undelivered', user)).toBe(0);
    expect(await failed(notice, 'Throttling', false)).toBe(true);
    expect(await noticeRow(notice)).toMatchObject({ state: 'failed', attempts: 5, error_code: 'Throttling', ses_message_id: null, sent_at: null });
    expect((await noticeRow(notice))?.undelivered_reported_at).toBeInstanceOf(Date);
    expect(await auditCount('password_notice_undelivered', user)).toBe(1);
    // A notice no longer pending is unchanged.
    expect(await failed(notice, 'Throttling', true)).toBe(false);
    expect(await noticeRow(notice)).toMatchObject({ state: 'failed', attempts: 5, error_code: 'Throttling' });
    expect(await auditCount('password_notice_undelivered', user)).toBe(1);
    // A permanent error fails the first try.
    const permanent = await pendingNotice();
    expect(await failed(permanent.notice, 'MessageRejected', true)).toBe(true);
    expect(await noticeRow(permanent.notice)).toMatchObject({ state: 'failed', attempts: 1, error_code: 'MessageRejected' });
    expect(await auditCount('password_notice_undelivered', permanent.user)).toBe(1);
    const events = await owner.query(
      "SELECT actor_id, actor_kind, object_type, practice_id, purpose FROM audit_event WHERE action = 'password_notice_undelivered' AND object_id = $1",
      [permanent.user],
    );
    expect(events.rows).toEqual([{ actor_id: null, actor_kind: 'system', object_type: 'user', practice_id: null, purpose: 'password_changed' }]);
    // A name that is not SES's (a digit, a space, nothing) is stored as Unrecognized: a code, never a message.
    for (const name of ['Throttling2', 'Message Rejected', '', null]) {
      const made = await pendingNotice();
      expect(await failed(made.notice, name, true), String(name)).toBe(true);
      expect((await noticeRow(made.notice))?.error_code, String(name)).toBe('Unrecognized');
    }
    // A sent notice is never failed.
    const sent = await pendingNotice();
    await send(sent.notice, messageId());
    expect(await failed(sent.notice, 'Throttling', true)).toBe(false);
    expect(await noticeRow(sent.notice)).toMatchObject({ state: 'sent', attempts: 0, error_code: null });
  });

  it('fails a pending notice 24 hours old as NoticeStale and reports it once, leaving a sent one, a younger one and one a claim holds', async () => {
    const old = await pendingNotice();
    await age(old.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS)} hours`);
    const sentOld = await pendingNotice();
    await send(sentOld.notice, messageId());
    await age(sentOld.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS + 1)} hours`);
    const young = await pendingNotice();
    await age(young.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS - 1)} hours`);
    // One a run claimed just inside the cutoff and still holds as it passes: ten seconds inside, so that a stall between
    // the statement that ages it and the claim leaves it inside; the wait below then lasts those ten seconds.
    const held = await pendingNotice();
    await age(held.notice, `${String(PASSWORD_NOTICE_CUTOFF_HOURS - 1)} hours 59 minutes 50 seconds`);
    const holder = await openSession();
    const ids = [old.notice, sentOld.notice, young.notice, held.notice];
    try {
      expect((await holder.client.query('SELECT user_id FROM operator_password_notice_claim($1)', [held.notice])).rows).toEqual([{ user_id: held.user }]);
      let passed = false;
      for (let tries = 0; tries < 2000 && !passed; tries += 1) {
        const { rows } = await owner.query<{ passed: boolean }>("SELECT clock_timestamp() > changed_at + make_interval(hours => $2) + interval '50 milliseconds' AS passed FROM password_notice WHERE id = $1", [
          held.notice,
          PASSWORD_NOTICE_CUTOFF_HOURS,
        ]);
        passed = rows[0]?.passed === true;
        if (!passed) {
          await pause(20);
        }
      }
      // The claimed notice is past the cutoff now, by the database's clock, and the sweep still leaves it to its claim.
      expect(passed).toBe(true);
      expect(await staleAmong(ids)).toEqual([{ notice_id: old.notice, user_id: old.user }]);
      expect(await noticeRow(old.notice)).toMatchObject({ state: 'failed', error_code: PASSWORD_NOTICE_STALE_CODE, attempts: 0, ses_message_id: null });
      expect((await noticeRow(old.notice))?.undelivered_reported_at).toBeInstanceOf(Date);
      expect(await auditCount('password_notice_undelivered', old.user)).toBe(1);
      // Once only.
      expect(await staleAmong(ids)).toEqual([]);
      expect(await auditCount('password_notice_undelivered', old.user)).toBe(1);
      expect(await noticeRow(held.notice)).toMatchObject({ state: 'pending' });
    } finally {
      await close(holder.client);
    }
    expect(await noticeRow(sentOld.notice)).toMatchObject({ state: 'sent', error_code: null });
    expect(await noticeRow(young.notice)).toMatchObject({ state: 'pending' });
    // Released, the held one is past the cutoff: never sent, failed and reported.
    expect(await claim(held.notice)).toEqual([]);
    expect(await staleAmong(ids)).toEqual([{ notice_id: held.notice, user_id: held.user }]);
    expect(await auditCount('password_notice_undelivered', held.user)).toBe(1);
    expect(await as(OPERATOR_ROLE, 'SELECT * FROM operator_password_notices_stale(0, $1)', [request()])).toEqual([]);
  }, 120_000);
});

describe('undelivered, once, in any order (docs/adr/0091 D8; the message-ID lock, A-3)', () => {
  it('reads an undelivered state that arrived before the send was recorded (the fourth caller), and a delivery as delivered', async () => {
    const cases: readonly (readonly [readonly PasswordEvent[], string])[] = [
      [['bounce'], 'undelivered'],
      [['suppression'], 'undelivered'],
      [['rejection'], 'undelivered'],
      [['delivery'], 'delivered'],
      [['delivery', 'complaint'], 'delivered'],
      [['delivery_delay'], 'sent'],
      [['complaint'], 'sent'],
    ];
    for (const [events, state] of cases) {
      const { user, notice } = await pendingNotice();
      const message = messageId();
      for (const event of events) {
        expect(await record(message, notice, user, event), `${events.join(',')}: ${event}`).toMatchObject({ recorded: true, password_notice_undelivered: null });
      }
      expect(await noticeRow(notice), events.join(',')).toMatchObject({ state: 'pending' });
      expect((await send(notice, message)).undelivered, events.join(',')).toBe(state === 'undelivered');
      expect(await noticeRow(notice), events.join(',')).toMatchObject({ state, ses_message_id: message });
      expect(await auditCount('password_notice_sent', user), events.join(',')).toBe(1);
      expect(await auditCount('password_notice_undelivered', user), events.join(',')).toBe(state === 'undelivered' ? 1 : 0);
    }
  });

  it('reads only a password_changed message’s record for the send: a notice recorded with the ID of another kind’s message, bounced, rejected or delivered, is sent, and reports nothing (the review of 2026-11-11, SEC-08)', async () => {
    // Another kind's message on the same stream, as the mail_events job recorded it: a probe that bounced, a digest SES
    // rejected, a digest delivered. None is the notice's message, whatever ID the send's record is given.
    const others = [
      { kind: 'probe', event: 'bounce', state: 'bounced' },
      { kind: 'digest', event: 'reject', state: 'rejected' },
      { kind: 'digest', event: 'delivery', state: 'delivered' },
    ] as const;
    for (const other of others) {
      const label = `${other.kind} ${other.state}`;
      const { user, notice } = await pendingNotice();
      const message = messageId();
      const event = (ses: string) => [
        message,
        'transactional',
        ses,
        new Date(),
        new Date(),
        null,
        other.kind,
        other.kind === 'probe' ? null : randomUUID(),
        null,
        null,
        ses === 'bounce' ? 'permanent' : null,
        ses === 'bounce' ? 'general' : null,
        null,
        request(),
      ];
      expect(await as<Recorded & pg.QueryResultRow>(OPERATOR_ROLE, RECORD, event(other.event)), label).toMatchObject([{ recorded: true, state: other.state, password_notice_undelivered: null }]);
      expect((await send(notice, message)).undelivered, label).toBe(false);
      expect(await noticeRow(notice), label).toMatchObject({ state: 'sent', ses_message_id: message, error_code: null, undelivered_reported_at: null });
      expect(await auditCount('password_notice_sent', user), label).toBe(1);
      expect(await auditCount('password_notice_undelivered', user), label).toBe(0);
      // Nor does a later event of that message move the notice: the mirror reads the record's kind as well.
      if (other.state === 'delivered') {
        expect(await as<Recorded & pg.QueryResultRow>(OPERATOR_ROLE, RECORD, event('bounce')), label).toMatchObject([{ recorded: true, state: 'bounced', password_notice_undelivered: null }]);
        expect(await noticeRow(notice), label).toMatchObject({ state: 'sent', undelivered_reported_at: null });
        expect(await auditCount('password_notice_undelivered', user), label).toBe(0);
      }
    }
  });

  it('mirrors each event after the send: a delivery, an undelivered state reported once, a complaint that changes nothing, and nothing for a message no notice holds', async () => {
    const sentNotice = async () => {
      const made = await pendingNotice();
      const message = messageId();
      await send(made.notice, message);
      return { ...made, message };
    };
    // Sent, then delivered: no report.
    const delivered = await sentNotice();
    expect(await record(delivered.message, delivered.notice, delivered.user, 'delivery_delay')).toMatchObject({ recorded: true, state: 'delayed', password_notice_undelivered: null });
    expect((await noticeRow(delivered.notice))?.state).toBe('sent');
    expect(await record(delivered.message, delivered.notice, delivered.user, 'delivery')).toMatchObject({ recorded: true, state: 'delivered', password_notice_undelivered: null });
    expect((await noticeRow(delivered.notice))?.state).toBe('delivered');
    // Delivered, then a complaint: unchanged, no report.
    expect(await record(delivered.message, delivered.notice, delivered.user, 'complaint')).toMatchObject({ recorded: true, state: 'complained', password_notice_undelivered: null });
    expect((await noticeRow(delivered.notice))?.state).toBe('delivered');
    expect(await auditCount('password_notice_undelivered', delivered.user)).toBe(0);
    // Sent, then each undelivered state: reported once, the OUT column naming the notice; a replay records nothing more.
    for (const event of ['bounce', 'suppression', 'rejection'] as const) {
      const made = await sentNotice();
      expect(await record(made.message, made.notice, made.user, event), event).toMatchObject({ recorded: true, password_notice_undelivered: made.notice });
      expect(await noticeRow(made.notice), event).toMatchObject({ state: 'undelivered' });
      expect(await record(made.message, made.notice, made.user, event), event).toMatchObject({ recorded: false, password_notice_undelivered: null });
      expect(await record(made.message, made.notice, made.user, 'delivery'), event).toMatchObject({ recorded: false, password_notice_undelivered: null });
      expect(await auditCount('password_notice_undelivered', made.user), event).toBe(1);
      expect((await noticeRow(made.notice))?.state, event).toBe('undelivered');
    }
    // Delivered, then bounced: undelivered, reported.
    const late = await sentNotice();
    await record(late.message, late.notice, late.user, 'delivery');
    expect(await record(late.message, late.notice, late.user, 'bounce')).toMatchObject({ recorded: true, state: 'bounced', password_notice_undelivered: late.notice });
    expect(await noticeRow(late.notice)).toMatchObject({ state: 'undelivered' });
    expect(await auditCount('password_notice_undelivered', late.user)).toBe(1);
    // Sent, then a complaint before any delivery: unchanged.
    const complained = await sentNotice();
    expect(await record(complained.message, complained.notice, complained.user, 'complaint')).toMatchObject({ recorded: true, password_notice_undelivered: null });
    expect((await noticeRow(complained.notice))?.state).toBe('sent');
    // A pending and a failed notice are never touched by any event, nor is any notice by a message it does not hold.
    const pending = await pendingNotice();
    const gaveUp = await pendingNotice();
    await failed(gaveUp.notice, 'MessageRejected', true);
    for (const target of [pending, gaveUp, delivered]) {
      for (const event of PASSWORD_EVENTS) {
        expect(await record(messageId(), target.notice, target.user, event)).toMatchObject({ password_notice_undelivered: null });
      }
    }
    expect(await noticeRow(pending.notice)).toMatchObject({ state: 'pending', ses_message_id: null, undelivered_reported_at: null });
    expect(await noticeRow(gaveUp.notice)).toMatchObject({ state: 'failed', ses_message_id: null });
    expect((await noticeRow(delivered.notice))?.state).toBe('delivered');
    expect(await auditCount('password_notice_undelivered', pending.user)).toBe(0);
    expect(await auditCount('password_notice_undelivered', gaveUp.user)).toBe(1);
  });

  it('makes an event wait for an open send of its message (the mirror’s lock, taken before it writes the mail record)', async () => {
    const { user, notice } = await pendingNotice();
    const message = messageId();
    const first = await openSession();
    const second = await openSession();
    try {
      expect((await first.client.query('SELECT user_id FROM operator_password_notice_claim($1)', [notice])).rows).toEqual([{ user_id: user }]);
      expect((await first.client.query('SELECT operator_password_notice_sent($1, $2, $3) AS undelivered', [notice, message, request()])).rows).toEqual([{ undelivered: false }]);
      let settled = false;
      const bounce = second.client.query<Recorded>(RECORD, eventValues(message, notice, user, 'bounce')).then((result) => {
        settled = true;
        return result.rows[0];
      });
      bounce.catch(() => undefined);
      expect(await waitsOnAdvisoryLock(second.pid)).toBe(true);
      expect(settled).toBe(false);
      await first.client.query('COMMIT');
      expect(await bounce).toMatchObject({ recorded: true, state: 'bounced', password_notice_undelivered: notice });
      await second.client.query('COMMIT');
    } finally {
      await close(first.client);
      await close(second.client);
    }
    expect(await noticeRow(notice)).toMatchObject({ state: 'undelivered', ses_message_id: message });
    expect(await auditCount('password_notice_sent', user)).toBe(1);
    expect(await auditCount('password_notice_undelivered', user)).toBe(1);
  });

  it('makes the send wait for an open event of its message before it reads the mail record, then applies it (the send’s lock, PWN-R1-02)', async () => {
    const cases = [
      ['bounce', true, 'undelivered'],
      ['delivery', false, 'delivered'],
    ] as const;
    for (const [event, undelivered, state] of cases) {
      const { user, notice } = await pendingNotice();
      const message = messageId();
      const sender = await openSession();
      const recorder = await openSession();
      try {
        expect((await sender.client.query('SELECT user_id FROM operator_password_notice_claim($1)', [notice])).rows, event).toEqual([{ user_id: user }]);
        // SES's event, recorded and not yet committed: it does not wait on the claimed row (no notice holds the message yet).
        const early = (await recorder.client.query<Recorded>(RECORD, eventValues(message, notice, user, event))).rows[0];
        expect(early, event).toMatchObject({ recorded: true, password_notice_undelivered: null });
        let settled = false;
        const sent = sender.client.query<{ undelivered: boolean }>('SELECT operator_password_notice_sent($1, $2, $3) AS undelivered', [notice, message, request()]).then((result) => {
          settled = true;
          return result.rows[0]?.undelivered;
        });
        sent.catch(() => undefined);
        expect(await waitsOnAdvisoryLock(sender.pid), event).toBe(true);
        expect(settled, event).toBe(false);
        await recorder.client.query('COMMIT');
        expect(await sent, event).toBe(undelivered);
        await sender.client.query('COMMIT');
      } finally {
        await close(sender.client);
        await close(recorder.client);
      }
      expect(await noticeRow(notice), event).toMatchObject({ state, ses_message_id: message });
      expect(await auditCount('password_notice_sent', user), event).toBe(1);
      expect(await auditCount('password_notice_undelivered', user), event).toBe(undelivered ? 1 : 0);
    }
  });

  it('ends in F of the final mail record for every sequence of up to three events and every place of the send among them, reporting exactly when undelivered', async () => {
    const sequences: PasswordEvent[][] = [];
    for (const a of PASSWORD_EVENTS) {
      sequences.push([a]);
      for (const b of PASSWORD_EVENTS) {
        sequences.push([a, b]);
        for (const c of PASSWORD_EVENTS) {
          sequences.push([a, b, c]);
        }
      }
    }
    const runs = sequences.flatMap((events, sequence) => Array.from({ length: events.length + 1 }, (_, position) => ({ sequence, events, position })));
    expect(runs).toHaveLength(6 * 2 + 36 * 3 + 216 * 4);
    // One account and one completed reset a run, queued in bulk by the trigger.
    const users = await asOwner(owner, [], async () => {
      const made = await owner.query<{ id: string }>(
        `INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status)
         SELECT g.id, 'synthetic-' || g.id, g.id || '@synthetic.test', true, false, 'active' FROM (SELECT gen_random_uuid() AS id FROM generate_series(1, $1::integer)) g RETURNING id`,
        [runs.length],
      );
      const ids = made.rows.map((row) => row.id);
      await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) SELECT u, 'user', 'password_reset_completed', 'user', u, 'email_code' FROM unnest($1::uuid[]) u", [ids]);
      return ids;
    });
    const notices = new Map((await owner.query<{ id: string; user_id: string }>('SELECT id, user_id FROM password_notice WHERE user_id = ANY ($1::uuid[])', [users])).rows.map((row) => [row.user_id, row.id]));
    expect(notices.size).toBe(runs.length);
    const played = runs.map((run, index) => ({ ...run, user: users[index] ?? '', notice: notices.get(users[index] ?? '') ?? '', message: messageId() }));
    const queue = [...played];
    const play = async () => {
      for (let run = queue.shift(); run !== undefined; run = queue.shift()) {
        for (let step = 0; step <= run.events.length; step += 1) {
          if (step === run.position) {
            await send(run.notice, run.message);
          }
          const event = run.events[step];
          if (event !== undefined) {
            await record(run.message, run.notice, run.user, event);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, play));
    const { rows } = await owner.query<{ id: string; state: string; mail_state: string; delivered: boolean; undelivered: number; sent: number }>(
      `SELECT p.id, p.state, m.state AS mail_state, m.delivered_at IS NOT NULL AS delivered,
              (SELECT count(*)::int FROM audit_event e WHERE e.action = 'password_notice_undelivered' AND e.object_type = 'user' AND e.object_id = p.user_id) AS undelivered,
              (SELECT count(*)::int FROM audit_event e WHERE e.action = 'password_notice_sent' AND e.object_type = 'user' AND e.object_id = p.user_id) AS sent
         FROM password_notice p JOIN mail_send m ON m.ses_message_id = p.ses_message_id WHERE p.id = ANY ($1::uuid[])`,
      [played.map((run) => run.notice)],
    );
    const found = new Map(rows.map((row) => [row.id, row]));
    const wrong: string[] = [];
    const ends = new Map<number, Set<string>>();
    for (const run of played) {
      const row = found.get(run.notice);
      const label = `${run.events.join(',')} with the send at ${String(run.position)}`;
      if (row === undefined) {
        wrong.push(`${label}: no notice with its message`);
        continue;
      }
      const wanted = stateOf({ state: row.mail_state, delivered: row.delivered });
      if (row.state !== wanted || row.undelivered !== (wanted === 'undelivered' ? 1 : 0) || row.sent !== 1) {
        wrong.push(`${label}: ${row.state} (${String(row.undelivered)} reports) over ${row.mail_state}, F is ${wanted}`);
      }
      ends.set(run.sequence, (ends.get(run.sequence) ?? new Set()).add(row.state));
    }
    expect(wrong).toEqual([]);
    expect([...ends.entries()].filter(([, states]) => states.size !== 1).map(([sequence]) => sequences[sequence]?.join(','))).toEqual([]);
  }, 300_000);
});

describe('the record function’s seventh column (docs/adr/0091; DROP and CREATE)', () => {
  it('returns the seven columns in order, still answers the previous image’s six by name, and is migration 20261107090000’s body with exactly the notice’s additions', async () => {
    const { rows } = await owner.query<{ name: string }>(
      "SELECT a.name FROM pg_proc p, unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a (name, mode, n) WHERE p.oid = $1::regprocedure AND a.mode = 't' ORDER BY a.n",
      [RECORD_SIGNATURE],
    );
    expect(rows.map((row) => row.name)).toEqual([...RECORDED_COLUMNS]);
    const values = [messageId(), 'transactional', 'delivery', new Date(), new Date(), null, 'digest', randomUUID(), null, null, null, null, null, request()];
    const [previous] = await as(OPERATOR_ROLE, PREVIOUS_RECORD, values);
    expect(previous).toEqual({ recorded: true, state: 'delivered', notice_undelivered: null, invoice_undelivered: null, invitation_undelivered: null, stream_paused: null });
    const [now] = await as(OPERATOR_ROLE, RECORD, [messageId(), ...values.slice(1)]);
    expect(Object.keys(now ?? {})).toEqual([...RECORDED_COLUMNS]);
    const before = statementIn(MAIL_STREAMS_MIGRATION, 'operator_record_mail_event');
    const after = statementIn(MIGRATION, 'operator_record_mail_event');
    const changes: readonly (readonly [string, string])[] = [
      [
        'RETURNS TABLE (recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text)\n',
        'RETURNS TABLE (recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text,\n  password_notice_undelivered uuid)\n',
      ],
      ['  touched_stage text;\n', '  touched_stage text;\n  touched_password_notice uuid;\n'],
      ['  stream_paused := NULL;\n', '  stream_paused := NULL;\n  password_notice_undelivered := NULL;\n'],
      [
        "  IF practice IS NOT NULL OR kind IN ('support_grant_opened', 'support_grant_closed') THEN\n",
        "  IF kind = 'password_changed' THEN\n" +
          "    PERFORM pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0));\n" +
          '  END IF;\n' +
          "  IF practice IS NOT NULL OR kind IN ('support_grant_opened', 'support_grant_closed') THEN\n",
      ],
      [
        '  -- An invitation whose Cognito message did not arrive',
        "  IF held.stream = 'transactional' AND held.kind = 'password_changed' AND held.state IN ('delivered', 'bounced', 'suppressed', 'rejected') THEN\n" +
          "    UPDATE password_notice p SET state = CASE WHEN held.state = 'delivered' THEN 'delivered' ELSE 'undelivered' END\n" +
          '     WHERE p.ses_message_id = message_id\n' +
          "       AND (p.state = 'sent' OR (p.state = 'delivered' AND held.state IN ('bounced', 'suppressed', 'rejected')))\n" +
          '    RETURNING p.id INTO touched_password_notice;\n' +
          "    IF touched_password_notice IS NOT NULL AND held.state <> 'delivered' AND password_notice_report_undelivered(touched_password_notice, request) THEN\n" +
          '      password_notice_undelivered := touched_password_notice;\n' +
          '    END IF;\n' +
          '  END IF;\n' +
          '\n' +
          '  -- An invitation whose Cognito message did not arrive',
      ],
    ];
    for (const [old] of changes) {
      expect(before.split(old).length, old).toBe(2);
    }
    expect(after).toBe(changes.reduce((text, [old, next]) => text.replace(old, next), before));
    const live = (await owner.query<{ body: string }>('SELECT prosrc AS body FROM pg_proc WHERE oid = $1::regprocedure', [RECORD_SIGNATURE])).rows;
    expect(live).toHaveLength(1);
    // Since migration 20261116090000 (docs/adr/0095) the live body is this migration's with exactly the key notice's
    // additions: one declaration, one lock, one branch. Its arguments and its seven columns are unchanged.
    const keyNotice: readonly (readonly [string, string])[] = [
      ['  touched_password_notice uuid;\n', '  touched_password_notice uuid;\n  touched_key_notice uuid;\n'],
      [
        "    PERFORM pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0));\n  END IF;\n",
        "    PERFORM pg_advisory_xact_lock(hashtextextended('password_notice:' || message_id, 0));\n" +
          "  ELSIF kind = 'hardware_keys_removed' THEN\n" +
          "    PERFORM pg_advisory_xact_lock(hashtextextended('hardware_key_notice:' || message_id, 0));\n" +
          '  END IF;\n',
      ],
      [
        '  -- An invitation whose Cognito message did not arrive',
        "  IF held.stream = 'transactional' AND held.kind = 'hardware_keys_removed' AND held.state IN ('delivered', 'bounced', 'suppressed', 'rejected') THEN\n" +
          "    UPDATE hardware_key_notice n SET state = CASE WHEN held.state = 'delivered' THEN 'delivered' ELSE 'undelivered' END\n" +
          '     WHERE n.ses_message_id = message_id\n' +
          "       AND (n.state = 'sent' OR (n.state = 'delivered' AND held.state IN ('bounced', 'suppressed', 'rejected')))\n" +
          '    RETURNING n.id INTO touched_key_notice;\n' +
          "    IF touched_key_notice IS NOT NULL AND held.state <> 'delivered' THEN\n" +
          '      PERFORM hardware_key_notice_report_undelivered(touched_key_notice, request);\n' +
          '    END IF;\n' +
          '  END IF;\n' +
          '\n' +
          '  -- An invitation whose Cognito message did not arrive',
      ],
    ];
    const body = after.slice(after.indexOf('AS $$') + 'AS $$'.length, after.lastIndexOf('$$'));
    for (const [old] of keyNotice) {
      expect(body.split(old).length, old).toBe(2);
    }
    expect(keyNotice.reduce((text, [old, next]) => text.replace(old, next), body)).toBe(live[0]?.body);
    expect((await owner.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'operator_record_mail_event'")).rows).toEqual([{ n: 1 }]);
  });
});

describe('the kind and the stream (docs/adr/0091 D5)', () => {
  it('takes a password_changed message on the transactional stream with its subject, and refuses it elsewhere or without one', async () => {
    const insert = (stream: string, subject: string | null) =>
      failure(
        owner.query("INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, sent_at) VALUES ($1, $2, 'password_changed', $3, 'sent', now())", [messageId(), stream, subject]),
      );
    expect(await insert('transactional', randomUUID())).toBe('accepted');
    expect(await insert('notices', randomUUID())).toMatchObject({ code: '23514', constraint: 'mail_send_stream_kind' });
    expect(await insert('screening', randomUUID())).toMatchObject({ code: '23514' });
    expect(await insert('transactional', null)).toMatchObject({ code: '23514', constraint: 'mail_send_subject' });
    const { user, notice } = await pendingNotice();
    expect(await failure(as(OPERATOR_ROLE, RECORD, eventValues(messageId(), notice, user, 'delivery', 'notices')))).toMatchObject({ code: '23514', constraint: 'mail_send_stream_kind' });
    expect(await constraintLiterals('mail_send', 'mail_send_kind')).toEqual([...MAIL_KINDS]);
    expect(await constraintLiterals('mail_send', 'mail_send_stream_kind')).toEqual(MAIL_STREAMS.flatMap((stream) => [stream, ...MAIL_STREAM_KINDS[stream]]));
    expect(MAIL_STREAM_KINDS.transactional).toContain('password_changed');
  });
});

describe('expiry (docs/adr/0091 D14, A-4)', () => {
  it('deletes notices past their expiry that are not pending, keeps a pending one and every unexpired one, and counts them', async () => {
    const expire = async (state: 'pending' | 'sent' | 'delivered' | 'undelivered' | 'failed') => {
      const made = await pendingNotice();
      if (state === 'failed') {
        await failed(made.notice, 'MessageRejected', true);
      } else if (state !== 'pending') {
        await send(made.notice, messageId());
        await owner.query('UPDATE password_notice SET state = $2 WHERE id = $1', [made.notice, state]);
      }
      await owner.query("UPDATE password_notice SET changed_at = now() - interval '91 days', expires_at = now() - interval '1 day' WHERE id = $1", [made.notice]);
      return made.notice;
    };
    const gone = [await expire('sent'), await expire('delivered'), await expire('undelivered'), await expire('failed')];
    const kept = [await expire('pending'), (await pendingNotice()).notice];
    const sentKept = await pendingNotice();
    await send(sentKept.notice, messageId());
    kept.push(sentKept.notice);
    const expected = (
      await owner.query<{ n: number }>(
        `SELECT ((SELECT count(*) FROM screening_bounce_mark WHERE expires_at <= now()) + (SELECT count(*) FROM mail_send WHERE expires_at <= now())
                + (SELECT count(*) FROM screening_mail_refusal WHERE expires_at <= now()) + (SELECT count(*) FROM password_notice WHERE expires_at <= now() AND state <> 'pending'))::int AS n`,
      )
    ).rows[0]?.n;
    expect(expected).toBeGreaterThanOrEqual(gone.length);
    const [removed] = await as<{ removed: number }>(OPERATOR_ROLE, 'SELECT operator_mail_expire(1000) AS removed');
    expect(removed?.removed).toBe(expected);
    const left = await owner.query<{ id: string }>('SELECT id FROM password_notice WHERE id = ANY ($1::uuid[]) ORDER BY id', [[...gone, ...kept]]);
    expect(left.rows.map((row) => row.id)).toEqual([...kept].sort());
    expect((await owner.query("SELECT count(*)::int AS n FROM password_notice WHERE expires_at <= now() AND state <> 'pending'")).rows).toEqual([{ n: 0 }]);
  });
});

describe('the migration’s lock loop (docs/adr/0091 D11; docs/adr/0083’s pattern)', () => {
  it('takes "user", audit_event and mail_send together without queueing: each try made while a write of "user", a sign-in’s insert or a write of mail_send is open gives back all it took, so a sign-in goes on, and the try after the last of them ends takes all three', async () => {
    const loop = lockLoop();
    expect(loop).toContain('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain('LOCK TABLE audit_event IN ACCESS EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain('LOCK TABLE mail_send IN ACCESS EXCLUSIVE MODE NOWAIT;');
    expect(loop).toContain(`'"user", audit_event or mail_send stayed in use for five minutes; run the deploy again (docs/adr/0091)'`);
    // Between tries it sleeps a second. A refused try leaves nothing to see from outside (that is its point), and a
    // second's sleep seen twice proves a new try only by the clock. So the loop runs here as it stands in the file but
    // for that one statement: each sleep is a wait this test ends, its n-th on an advisory key the test holds. A try
    // then happens exactly when the test lets it, and the loop stands still where it would sleep, to be looked at.
    expect(loop).toContain('PERFORM pg_sleep(1);');
    const paced = loop.replaceAll('PERFORM pg_sleep(1);', 'PERFORM lock_loop_test.pause();');
    const user = await createUser(owner);
    const userHolder = new pg.Client({ connectionString: database.url });
    const signInHolder = new pg.Client({ connectionString: database.appUrl });
    const mailHolder = new pg.Client({ connectionString: database.url });
    const pacer = new pg.Client({ connectionString: database.url });
    const migration = new pg.Client({ connectionString: database.url });
    for (const client of [userHolder, signInHolder, mailHolder, pacer, migration]) {
      client.on('error', () => undefined);
      await client.connect();
      clients.push(client);
    }
    const signIn = async () => {
      const writer = new pg.Client({ connectionString: database.appUrl });
      writer.on('error', () => undefined);
      await writer.connect();
      clients.push(writer);
      try {
        await writer.query('BEGIN');
        await writer.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
        await writer.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, 'user', 'sign_in', 'user', $1)", [user]);
        await writer.query('COMMIT');
        return 'accepted';
      } finally {
        await close(writer);
      }
    };
    const migrationPid = (await migration.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0;
    let finished = false;
    let done: Promise<string> = Promise.resolve('not started');
    /** Resolves once the loop's backend stands in its n-th pause; throws if it waits for a table instead, ends, or never gets there. */
    const pausedAt = async (n: number): Promise<void> => {
      for (let tries = 0; tries < 1500; tries += 1) {
        const { rows } = await owner.query<{ paused: boolean; queued: boolean }>(
          `SELECT coalesce(bool_or(locktype = 'advisory' AND classid = $2::oid AND objid = $3::oid AND objsubid = 2), false) AS paused,
                  coalesce(bool_or(locktype = 'relation'), false) AS queued
             FROM pg_locks WHERE pid = $1 AND NOT granted`,
          [migrationPid, LOOP_PAUSES, n],
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
            WHERE pid = $1 AND locktype = 'relation' AND relation IN ('"user"'::regclass, 'audit_event'::regclass, 'mail_send'::regclass) ORDER BY 1, 2`,
          [migrationPid],
        )
      ).rows;
    try {
      // Three open transactions, in the order the loop takes its locks: a write of "user", a sign-in's open insert of
      // audit_event (its ROW EXCLUSIVE) and a write of mail_send. As each ends, the next try gets one lock further
      // before it is refused: none, then "user", then "user" and audit_event.
      await userHolder.query('BEGIN');
      await userHolder.query('LOCK TABLE "user" IN ROW EXCLUSIVE MODE');
      await signInHolder.query('BEGIN');
      await signInHolder.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [user]);
      await signInHolder.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, 'user', 'sign_in', 'user', $1)", [user]);
      await mailHolder.query('BEGIN');
      await mailHolder.query("INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, sent_at) VALUES ($1, 'transactional', 'digest', gen_random_uuid(), 'sent', now())", [messageId()]);
      await pacer.query('SELECT pg_advisory_lock($1::integer, n) FROM generate_series(1, 8) AS n', [LOOP_PAUSES]);
      // The migration's transaction, as tp_owner, running the loop. The pause is made in that transaction and gone with it.
      await migration.query('BEGIN');
      await migration.query(
        `CREATE SCHEMA lock_loop_test;
         CREATE SEQUENCE lock_loop_test.pauses;
         CREATE FUNCTION lock_loop_test.pause() RETURNS void LANGUAGE sql AS 'SELECT pg_advisory_xact_lock(${String(LOOP_PAUSES)}, nextval(''lock_loop_test.pauses'')::integer)';
         GRANT USAGE ON SCHEMA lock_loop_test TO ${OWNER_ROLE};
         GRANT USAGE ON SEQUENCE lock_loop_test.pauses TO ${OWNER_ROLE};
         GRANT EXECUTE ON FUNCTION lock_loop_test.pause() TO ${OWNER_ROLE};`,
      );
      await migration.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      done = migration.query(paced).then(
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
        { name: 'the write of "user"', client: userHolder, end: 'COMMIT' },
        { name: 'the sign-in’s insert', client: signInHolder, end: 'COMMIT' },
        { name: 'the write of mail_send', client: mailHolder, end: 'ROLLBACK' },
      ];
      for (const [index, holder] of holders.entries()) {
        // A try made after the holder before this one ended (the first, with all three open) was refused, and the loop
        // stands where it sleeps: it holds none of the three tables and waits for none. Only then the sign-in, which
        // would wait behind a lock the try had kept; it never waits, so it goes on.
        await pausedAt(index + 1);
        expect(await tableLocks(), `refused while ${holder.name} is open`).toEqual([]);
        expect(await signIn(), `while ${holder.name} is open`).toBe('accepted');
        expect(finished, `while ${holder.name} is open`).toBe(false);
        await holder.client.query(holder.end);
        // The next try, after this holder ended.
        expect((await pacer.query<{ released: boolean }>('SELECT pg_advisory_unlock($1::integer, $2::integer) AS released', [LOOP_PAUSES, index + 1])).rows).toEqual([{ released: true }]);
      }
      expect(await done).toBe('accepted');
      expect((await tableLocks()).sort((a, b) => (a.relation < b.relation ? -1 : 1))).toEqual([
        { relation: '"user"', mode: 'ShareRowExclusiveLock', granted: true },
        { relation: 'audit_event', mode: 'AccessExclusiveLock', granted: true },
        { relation: 'mail_send', mode: 'AccessExclusiveLock', granted: true },
      ]);
    } finally {
      // The holders and the pacer first: with nothing left to refuse a try or hold a pause, the loop ends.
      for (const client of [userHolder, signInHolder, mailHolder, pacer]) {
        await close(client);
      }
      await done;
      await close(migration);
    }
  }, 120_000);
});

describe('the migration on the previous head: its preflight, and what the whole file holds (docs/adr/0091 D11)', () => {
  const RECORD_ARGUMENTS = 'text, text, text, timestamptz, timestamptz, text, text, uuid, uuid, uuid, text, text, text, text';
  const RECORD_REFUSED = 'operator_record_mail_event() is not the body of migration 20261107090000 that migration 20261111090000 replaces; rebase this migration on its latest body';
  const EXPIRY_REFUSED = 'operator_mail_expire(integer) is not the body of migration 20261107090000 that migration 20261111090000 replaces; rebase this migration on its latest body';
  const POLICY_REFUSED = 'audit_event_record is not the policy of migration 20261108090000 that migration 20261111090000 replaces; rebase this migration on its latest text';
  /** Every migration before this one, in a directory of their own. */
  let previousDir = '';
  /** A database the runner migrated to them: the previous head, where the deploy applies this file. */
  let previous: ScratchDatabase;
  let head: pg.Client;

  beforeAll(async () => {
    previousDir = mkdtempSync(path.join(tmpdir(), 'password-notice-previous-head-'));
    for (const earlier of readMigrations(MIGRATIONS_DIR).filter((candidate) => candidate.name < MIGRATION)) {
      copyFileSync(path.join(MIGRATIONS_DIR, earlier.name), path.join(previousDir, earlier.name));
    }
    previous = await createScratchDatabase(readDatabaseUrl());
    await migrate({ databaseUrl: previous.url, migrationsDir: previousDir, devLogin: true });
    head = new pg.Client({ connectionString: previous.url });
    head.on('error', () => undefined);
    await head.connect();
  }, 120_000);

  afterAll(async () => {
    await head.end().catch(() => undefined);
    await previous.drop();
    rmSync(previousDir, { recursive: true, force: true });
  });

  const file = () => readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');

  /** One transaction on the previous head as the runner opens it for a file (as tp_owner), rolled back: the head stays where it was. */
  async function onPreviousHead<T>(run: () => Promise<T>): Promise<T> {
    await head.query('BEGIN');
    try {
      await head.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      return await run();
    } finally {
      await head.query('ROLLBACK');
    }
  }

  /** What the whole file answers on the previous head after `change`, the work of some migration before it: applied, or its refusal. */
  const appliedAfter = (change: () => Promise<unknown>) =>
    onPreviousHead(async () => {
      await change();
      return head.query(file()).then(
        () => 'applied' as const,
        (error: unknown) => ({ code: (error as { code?: string }).code, message: (error as Error).message }),
      );
    });

  /** A function's definition as the catalog prints it, with `find`, which is in it once, replaced by `put`. */
  const redefined = async (signature: string, find: string, put: string): Promise<string> => {
    const definition = (await head.query<{ definition: string }>('SELECT pg_get_functiondef($1::regprocedure) AS definition', [signature])).rows[0]?.definition ?? '';
    expect(definition.split(find), signature).toHaveLength(2);
    return definition.replace(find, put);
  };

  /** The expiry with one more statement in its body, as a migration before this one might leave it. */
  const expiryWithOneMoreStatement = () => redefined('operator_mail_expire(integer)', 'BEGIN\n  IF at_most IS NULL', 'BEGIN\n  PERFORM 1;\n  IF at_most IS NULL');

  const refusals: readonly { readonly when: string; readonly change: () => Promise<unknown>; readonly message: string }[] = [
    {
      when: 'password_notice exists',
      change: () => head.query('CREATE TABLE password_notice (id uuid PRIMARY KEY)'),
      message: 'password_notice already exists; migration 20261111090000 creates it',
    },
    {
      when: 'the trigger function exists',
      change: () => head.query('CREATE FUNCTION audit_event_password_notice() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL; END; $f$'),
      message: 'audit_event_password_notice() already exists; migration 20261111090000 creates it',
    },
    {
      when: 'the record function is gone',
      change: () => head.query(`DROP FUNCTION operator_record_mail_event(${RECORD_ARGUMENTS})`),
      message: 'operator_record_mail_event() of migration 20261107090000 does not exist; migration 20261111090000 recreates it',
    },
    {
      when: 'the record function returns a seventh column, its body the same',
      change: async () => {
        const definition = await redefined(RECORD_SIGNATURE, 'stream_paused text)', 'stream_paused text, one_more uuid)');
        await head.query(`DROP FUNCTION operator_record_mail_event(${RECORD_ARGUMENTS})`);
        await head.query(definition);
      },
      message: RECORD_REFUSED,
    },
    {
      when: 'the record function’s body has one more statement, its six columns the same',
      change: async () => head.query(await redefined(RECORD_SIGNATURE, '  recorded := false;\n', '  recorded := false;\n  PERFORM 1;\n')),
      message: RECORD_REFUSED,
    },
    {
      when: 'the expiry’s body has one more statement',
      change: async () => head.query(await expiryWithOneMoreStatement()),
      message: EXPIRY_REFUSED,
    },
    {
      when: 'the expiry is gone',
      change: () => head.query('DROP FUNCTION operator_mail_expire(integer)'),
      message: EXPIRY_REFUSED,
    },
    {
      when: 'the policy reserves one more action',
      change: async () => {
        const reserved = "'organization_reinstated'::text]";
        const { rows } = await head.query<{ expression: string }>(
          "SELECT with_check AS expression FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_event' AND policyname = 'audit_event_record'",
        );
        const expression = rows[0]?.expression ?? '';
        expect(expression.split(reserved)).toHaveLength(2);
        await head.query('DROP POLICY audit_event_record ON audit_event');
        await head.query(
          `CREATE POLICY audit_event_record ON audit_event FOR INSERT TO ${APP_ROLE} WITH CHECK (${expression.replace(reserved, "'organization_reinstated'::text, 'one_more_reserved'::text]")})`,
        );
      },
      message: POLICY_REFUSED,
    },
    {
      when: 'the policy is gone',
      change: () => head.query('DROP POLICY audit_event_record ON audit_event'),
      message: POLICY_REFUSED,
    },
    {
      when: 'mail_send_kind already admits password_changed',
      change: () => head.query(`ALTER TABLE mail_send DROP CONSTRAINT mail_send_kind, ADD CONSTRAINT mail_send_kind CHECK (kind IN (${MAIL_KINDS.map((kind) => `'${kind}'`).join(', ')}))`),
      message: 'mail_send_kind already admits password_changed; migration 20261111090000 adds it',
    },
  ];

  it.each(refusals)('refuses in its own words when $when', async ({ change, message }) => {
    expect(await appliedAfter(change)).toEqual({ code: '55000', message });
    // Rolled back with the change: the next case starts from the previous head too.
    expect((await head.query("SELECT to_regclass('public.password_notice')::text AS made")).rows).toEqual([{ made: null }]);
  });

  it('compares what it replaces whole: its three values are the SHA-256 of the previous head’s two stored bodies, which are migration 20261107090000’s, and of its policy’s WITH CHECK', async () => {
    const pinned = [...file().matchAll(/IS DISTINCT FROM '([0-9a-f]{64})'/g)].map((match) => match[1]);
    const { rows } = await head.query<{ record: string; expiry: string; policy: string }>(
      `SELECT (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = $1::regprocedure) AS record,
              (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = 'operator_mail_expire(integer)'::regprocedure) AS expiry,
              (SELECT encode(sha256(convert_to(with_check, 'UTF8')), 'hex') FROM pg_policies
                WHERE schemaname = 'public' AND tablename = 'audit_event' AND policyname = 'audit_event_record') AS policy`,
      [RECORD_SIGNATURE],
    );
    expect(pinned).toEqual([rows[0]?.record, rows[0]?.expiry, rows[0]?.policy]);
    // The bodies as migration 20261107090000 wrote them, hashed here from its own text.
    const written = (name: string) => {
      const statement = statementIn(MAIL_STREAMS_MIGRATION, name);
      return createHash('sha256')
        .update(statement.slice(statement.indexOf('AS $$') + 'AS $$'.length, statement.lastIndexOf('$$')), 'utf8')
        .digest('hex');
    };
    expect(pinned.slice(0, 2)).toEqual([written('operator_record_mail_event'), written('operator_mail_expire')]);
  });

  it('holds at its end, of the relations that existed before it, the loop’s three tables in the loop’s modes and nothing stronger, and no other relation but an index of theirs in the weakest mode: no statement after the loop can wait in a lock queue', async () => {
    // The loop's own statements, as pg_locks names their modes.
    const taken = [...lockLoop().matchAll(/LOCK TABLE (\S+) IN ([A-Z ]+) MODE NOWAIT;/g)].map((match) => [
      match[1] ?? '',
      `${(match[2] ?? '')
        .split(' ')
        .map((word) => `${word.slice(0, 1)}${word.slice(1).toLowerCase()}`)
        .join('')}Lock`,
    ]);
    expect(taken).toEqual([
      ['"user"', 'ShareRowExclusiveLock'],
      ['audit_event', 'AccessExclusiveLock'],
      ['mail_send', 'AccessExclusiveLock'],
    ]);
    // The whole file in one transaction, as the runner applies it, and what that transaction holds before it ends.
    const held = await onPreviousHead(async () => {
      const existed = (await head.query<{ oid: string }>("SELECT oid::text AS oid FROM pg_class WHERE relnamespace = 'public'::regnamespace")).rows.map((row) => row.oid);
      await head.query(file());
      return (
        await head.query<{ relation: string; mode: string; granted: boolean; index_of: string | null }>(
          `SELECT l.relation::regclass::text AS relation, l.mode, l.granted, i.indrelid::regclass::text AS index_of
             FROM pg_locks l LEFT JOIN pg_index i ON i.indexrelid = l.relation
            WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation' AND l.relation = ANY ($1::oid[]) ORDER BY 1, 2`,
          [existed],
        )
      ).rows;
    });
    expect(held.filter((lock) => !lock.granted)).toEqual([]);
    // An index of one of the three, in the weakest mode, is PostgreSQL's own bookkeeping and cannot wait either: 18.6
    // holds it on "user"'s primary key from adding the foreign key, where 18.4 holds none (CI's db shard of 2026-11-11).
    // ACCESS SHARE conflicts only with ACCESS EXCLUSIVE on that index, a rebuild or a drop, and each of those first
    // takes a lock on the index's table that the loop's own lock on it refuses. Any other index, and any stronger mode
    // on one of these, fails here.
    const indexes = held.filter((lock) => lock.index_of !== null);
    expect(indexes.filter((lock) => lock.mode !== 'AccessShareLock' || !taken.some(([table]) => table === lock.index_of))).toEqual([]);
    // A later statement's weaker lock on one of the three never waits: what could refuse it, the loop's lock already
    // shut out. A stronger one, or any lock on another relation, could wait behind a transaction the loop never met.
    const strongest = new Map<string, string>();
    for (const lock of held.filter((each) => each.index_of === null)) {
      const now = strongest.get(lock.relation);
      if (now === undefined || TABLE_LOCK_MODES.indexOf(lock.mode) > TABLE_LOCK_MODES.indexOf(now)) {
        strongest.set(lock.relation, lock.mode);
      }
    }
    expect(Object.fromEntries(strongest)).toEqual(Object.fromEntries(taken));
  });

  // The last case here: it moves the head.
  it('fails the deploy’s run under its name and in its words, recording nothing, and applies once what it replaces is the previous head’s again', async () => {
    const applied = () => head.query<{ filename: string }>('SELECT filename FROM schema_migrations WHERE filename >= $1 ORDER BY 1', [MIGRATION]);
    const base = (await head.query<{ definition: string }>("SELECT pg_get_functiondef('operator_mail_expire(integer)'::regprocedure) AS definition")).rows[0]?.definition ?? '';
    // Committed this time, as a migration before it would have left the expiry.
    await head.query(await expiryWithOneMoreStatement());
    const run = migrate({ databaseUrl: previous.url });
    await expect(run).rejects.toThrow(MigrationError);
    await expect(run).rejects.toThrow(`${MIGRATION} failed: ${EXPIRY_REFUSED}`);
    expect((await applied()).rows).toEqual([]);
    expect((await head.query("SELECT to_regclass('public.password_notice')::text AS made")).rows).toEqual([{ made: null }]);
    // The previous head as it was: the run applies the file (and whatever follows it).
    await head.query(base);
    const following = readMigrations(MIGRATIONS_DIR)
      .filter((candidate) => candidate.name >= MIGRATION)
      .map((candidate) => candidate.name);
    expect((await migrate({ databaseUrl: previous.url })).applied).toEqual(following);
    expect((await applied()).rows.map((row) => row.filename)).toEqual(following);
    expect((await head.query("SELECT to_regclass('public.password_notice')::text AS made")).rows).toEqual([{ made: 'password_notice' }]);
  });
});

describe('the TypeScript constants (docs/adr/0091)', () => {
  it('equal what the functions do: the states, the 24-hour cutoff, the retries and the stale code', async () => {
    expect(await constraintLiterals('password_notice', 'password_notice_state')).toEqual([...PASSWORD_NOTICE_STATES]);
    const cutoff = `interval '${String(PASSWORD_NOTICE_CUTOFF_HOURS)} hours'`;
    for (const signature of ['operator_password_notices_stale(integer,text)', 'operator_password_notices_due(integer)', 'operator_password_notice_claim(uuid)']) {
      expect(await functionDefinition(signature), signature).toContain(cutoff);
    }
    expect(await functionDefinition('operator_password_notice_failed(uuid,text,boolean,text)')).toContain(`ARRAY[${PASSWORD_NOTICE_RETRY_MINUTES.join(', ')}]`);
    expect(await functionDefinition('operator_password_notice_failed(uuid,text,boolean,text)')).toContain(`>= ${String(PASSWORD_NOTICE_RETRY_MINUTES.length + 1)}`);
    expect(await functionDefinition('operator_password_notices_stale(integer,text)')).toContain(`'${PASSWORD_NOTICE_STALE_CODE}'`);
    expect(PASSWORD_NOTICE_STATES).toEqual(['pending', 'sent', 'delivered', 'undelivered', 'failed']);
  });
});
