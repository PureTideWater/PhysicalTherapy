import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor } from './authz';
import { readDatabaseUrl } from './config';
import { APP_ROLE, OPERATOR_ROLE, OWNER_ROLE } from './roles';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from './testing';

/**
 * The hardware-key registry and its two-person removal, in the database (LANES.md Queues item 37; docs/adr/0095;
 * test matrix SEC-25 to SEC-27, SGN-20, SGN-22 to SGN-25 and SGN-27's database rows). What the database proves: the
 * four tables are closed to both runtime roles and to every tenant; every function is owned, pathed and granted as
 * designed; a key session opens only for a live key of its account, and a code session never for an account whose
 * registration is closed; a removal needs two platform administrators seven days in the role, each in a fresh session
 * of a registered key, neither the account, inside 24 hours, and removes every key, moves the mark, ends the sessions
 * and queues its notice and its provider sign-out in one transaction; registration after a removal stays closed until
 * an administrator opens it with a one-time code.
 * Synthetic data only: every address is @synthetic.test, every key is random bytes.
 */

const DEFINER_PATH = ['search_path=pg_catalog, public, pg_temp'];
const TABLES = ['hardware_key', 'hardware_key_removal', 'hardware_key_notice', 'provider_sign_out'] as const;

let database: MigratedDatabase;
/** The superuser on the scratch database: seeds and reads past every policy. */
let owner: pg.Client;
/** The superuser's pool, each transaction SET LOCAL ROLE to the role under test. */
let admin: pg.Pool;
/** The application's dev login (tp_app_dev), as the web's requests use it. */
let app: pg.Pool;
let north: TenantWorld;
let south: TenantWorld;
let internal: string;

interface Failure {
  readonly code: string;
  readonly constraint: string | undefined;
}

const failure = (attempt: Promise<unknown>): Promise<'accepted' | Failure> =>
  attempt.then(
    () => 'accepted' as const,
    (error: unknown) => {
      const { code: given, constraint } = error as { code?: string; constraint?: string };
      return { code: given ?? 'error', constraint };
    },
  );
const code = (attempt: Promise<unknown>) => failure(attempt).then((result) => (result === 'accepted' ? result : result.code));
const refusedBy = (constraint: string): Failure => ({ code: '23514', constraint });
const request = () => `test-${randomUUID()}`;
const digest = () => randomBytes(32);
const sha256 = (text: string) => createHash('sha256').update(text).digest();
const tokenHash = () => createHash('sha256').update(randomUUID()).digest('hex');

/** One statement as the application role acting as `user`, committed. */
async function asUser<T extends pg.QueryResultRow = pg.QueryResultRow>(user: string, sql: string, values: unknown[] = []): Promise<T[]> {
  return withActor(app, user, async (scope) => (await scope.client.query<T>(sql, values)).rows);
}

/** One statement as `role` with no actor (the platform job's scope), committed. */
async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(role: string, sql: string, values: unknown[] = []): Promise<T[]> {
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

/** Seeds as the superuser with every trigger off (session_replication_role): a past created_at, a past registered_at. */
async function seeded(sql: string, values: unknown[] = []): Promise<void> {
  await owner.query('BEGIN');
  try {
    await owner.query("SET LOCAL session_replication_role = 'replica'");
    await owner.query(sql, values);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
}

async function began(): Promise<string> {
  return (await app.query<{ at: string }>('SELECT sign_in_step_began()::text AS at')).rows[0]?.at ?? '';
}

async function device(user: string): Promise<string> {
  return (await asUser<{ id: string }>(user, "INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Test browser') RETURNING id", [user, tokenHash()]))[0]?.id ?? '';
}

/** The account records its own new key, as the flow does after the provider registered it. */
function recordKey(user: string, credential: Buffer = digest(), codeDigest: Buffer | null = null): Promise<{ key_id: string; first_after_removal: boolean }[]> {
  return began().then((at) => asUser(user, 'SELECT * FROM hardware_key_record($1, $2, $3, $4::timestamptz, $5)', [credential, randomBytes(77), codeDigest, at, request()]));
}

/** A session insert as the flow writes it: `credential` undefined is a code session, null the previous image's key session. */
async function openSession(user: string, credential?: Buffer | null): Promise<string> {
  const at = await began();
  const on = await device(user);
  const rows =
    credential === undefined
      ? await asUser<{ id: string }>(user, "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at) VALUES ($1, $2, $3, 'totp', $4::timestamptz) RETURNING id", [user, on, tokenHash(), at])
      : await asUser<{ id: string }>(
          user,
          "INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at, key_credential_sha256) VALUES ($1, $2, $3, 'webauthn', $4::timestamptz, $5) RETURNING id",
          [user, on, tokenHash(), at, credential],
        );
  return rows[0]?.id ?? '';
}

interface Administrator {
  readonly id: string;
  readonly membership: string;
  readonly credential: Buffer;
  /** A key session opened just now with the registered key. */
  session(): Promise<string>;
}

/** A platform administrator `days` in the role (no role_escalation younger than that), with a registered key. */
async function administrator(days = 8): Promise<Administrator> {
  const id = await createUser(owner, { hardwareKeyRequired: true });
  const membership = randomUUID();
  await seeded(`INSERT INTO membership (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'platform_admin', now() - make_interval(days => $4))`, [membership, internal, id, days]);
  const credential = digest();
  await recordKey(id, credential);
  return { id, membership, credential, session: () => openSession(id, credential) };
}

/** A member with a registered key and one open key session. */
async function member(): Promise<{ id: string; credential: Buffer; session: string }> {
  const id = await createUser(owner, { hardwareKeyRequired: true });
  const credential = digest();
  await recordKey(id, credential);
  return { id, credential, session: await openSession(id, credential) };
}

const requestRemoval = async (by: Administrator, target: string): Promise<string> =>
  (await asUser<{ id: string }>(by.id, 'SELECT hardware_key_removal_request($1, $2, $3) AS id', [target, await by.session(), request()]))[0]?.id ?? '';
const confirmRemoval = async (by: Administrator, removal: string) =>
  asUser<{ keys_removed: number; sessions_ended: number }>(by.id, 'SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [removal, await by.session(), request()]);

/** A confirmed removal of the member's keys by two fresh administrators. */
async function removed(target: string): Promise<{ removal: string; requester: Administrator; confirmer: Administrator }> {
  const [requester, confirmer] = [await administrator(), await administrator()];
  const removal = await requestRemoval(requester, target);
  await confirmRemoval(confirmer, removal);
  return { removal, requester, confirmer };
}

const count = async (sql: string, values: unknown[] = []): Promise<number> => (await owner.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, values)).rows[0]?.n ?? -1;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  admin = new pg.Pool({ connectionString: database.url, max: 4 });
  app = new pg.Pool({ connectionString: database.appUrl, max: 6 });
  north = await createTenantWorld(owner, 'north');
  south = await createTenantWorld(owner, 'south');
  internal = await createOrganization(owner, 'internal');
}, 120_000);

afterAll(async () => {
  await owner?.end();
  if (admin !== undefined) await endPool(admin);
  if (app !== undefined) await endPool(app);
  await database?.drop();
});

describe('SEC-25: the catalog', () => {
  it('closes the four tables to both runtime roles: row-level security forced, one policy for the owner, no privilege', async () => {
    const { rows } = await owner.query<{ name: string; enabled: boolean; forced: boolean; policies: string[]; granted: string[]; practice: boolean }>(
      `SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
              ARRAY(SELECT p.polname || ':' || pg_get_userbyid(p.polroles[1]) || ':' || array_length(p.polroles, 1) FROM pg_policy p WHERE p.polrelid = c.oid ORDER BY 1) AS policies,
              ARRAY(SELECT DISTINCT g.grantee::text FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee <> $2 ORDER BY 1) AS granted,
              EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'practice_id' AND NOT a.attisdropped) AS practice
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1) ORDER BY 1`,
      [[...TABLES], OWNER_ROLE],
    );
    expect(rows).toEqual([...TABLES].sort().map((name) => ({ name, enabled: true, forced: true, policies: [`${name}_owner:${OWNER_ROLE}:1`], granted: [], practice: false })));
    const columns = await owner.query<{ grantee: string }>(
      "SELECT DISTINCT grantee::text FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = ANY ($1) AND grantee <> $2",
      [[...TABLES], OWNER_ROLE],
    );
    expect(columns.rows).toEqual([]);
  });

  it('owns, paths and grants every function exactly as designed', async () => {
    const forApp = { definer: true, grantees: [APP_ROLE] };
    const forOperator = { definer: true, grantees: [OPERATOR_ROLE] };
    const forNone = { definer: true, grantees: [] as string[] };
    const expected: Readonly<Record<string, { readonly definer: boolean; readonly grantees: readonly string[] }>> = {
      'hardware_key_record(bytea,bytea,bytea,timestamp with time zone,text)': forApp,
      'sign_in_hardware_keys(uuid)': forApp,
      'sign_in_key_refused(uuid,text,text)': forApp,
      'hardware_key_removal_request(uuid,uuid,text)': forApp,
      'hardware_key_removal_confirm(uuid,uuid,text)': forApp,
      'hardware_key_removal_cancel(uuid,uuid,text)': forApp,
      'hardware_key_removals()': forApp,
      'hardware_key_registration_open(uuid,uuid,bytea,text)': forApp,
      'hardware_key_registration_judge(bytea,timestamp with time zone,text)': forApp,
      'operator_provider_sign_out_claim()': forOperator,
      'operator_provider_sign_out_done(uuid,smallint,text,text)': forOperator,
      'operator_provider_sign_out_failed(uuid,smallint,text,text)': forOperator,
      'operator_provider_sign_outs_overdue(text)': forOperator,
      'operator_provider_sign_out_reported(uuid,text)': forOperator,
      'operator_provider_sign_outs_expire(integer)': forOperator,
      'operator_key_removals_expire(integer,text)': forOperator,
      'operator_key_notices_due(integer)': forOperator,
      'operator_key_notice_claim(uuid)': forOperator,
      'operator_key_notice_sent(uuid,text,text)': forOperator,
      'operator_key_notice_failed(uuid,text,boolean,text)': forOperator,
      'operator_key_notices_stale(integer,text)': forOperator,
      'account_removes_keys(uuid)': forNone,
      'actor_key_session(uuid)': forNone,
      'account_key_registration_closed(uuid)': forNone,
      'user_session_hardware_key()': forNone,
      'membership_end_marks_account()': forNone,
      'membership_removal_target_holds()': forNone,
      'audit_event_provider_sign_out()': forNone,
      'hardware_key_is_final()': forNone,
      'hardware_key_removal_is_final()': forNone,
    };
    const { rows } = await owner.query<{ name: string; definer: boolean; owner: string; config: string[] | null; grantees: string[]; public: boolean; leakproof: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer, pg_get_userbyid(p.proowner)::text AS owner, p.proconfig AS config, p.proleakproof AS leakproof,
              ARRAY(SELECT DISTINCT pg_get_userbyid(x.grantee)::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                     WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> 0 AND x.grantee <> p.proowner ORDER BY 1) AS grantees,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.oid::regprocedure::text = ANY ($1) ORDER BY 1`,
      [Object.keys(expected)],
    );
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(expected).sort());
    for (const row of rows) {
      expect({ definer: row.definer, grantees: row.grantees, public: row.public, config: row.config, owner: row.owner, leakproof: row.leakproof }, row.name).toEqual({
        definer: expected[row.name]?.definer,
        grantees: [...(expected[row.name]?.grantees ?? [])],
        public: false,
        config: DEFINER_PATH,
        owner: OWNER_ROLE,
        leakproof: false,
      });
    }
  });

  it('puts the triggers where the design says', async () => {
    const { rows } = await owner.query<{ on: string; name: string; definition: string }>(
      `SELECT t.tgrelid::regclass::text AS on, t.tgname AS name, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
        WHERE NOT t.tgisinternal AND t.tgname = ANY ($1) ORDER BY 1, 2`,
      [['user_session_hardware_key', 'membership_end_marks_account', 'membership_removal_target_holds', 'audit_event_provider_sign_out', 'hardware_key_is_final', 'hardware_key_removal_is_final']],
    );
    expect(rows.map((row) => `${row.on}:${row.name}`)).toEqual([
      'audit_event:audit_event_provider_sign_out',
      'hardware_key:hardware_key_is_final',
      'hardware_key_removal:hardware_key_removal_is_final',
      'membership:membership_end_marks_account',
      'membership:membership_removal_target_holds',
      'user_session:user_session_hardware_key',
    ]);
    const session = rows.find((row) => row.name === 'user_session_hardware_key')?.definition ?? '';
    // Every insert, with no WHEN clause: a code session of a closed account is refused here too (the note, 16.3).
    expect(session).toContain('BEFORE INSERT ON public.user_session FOR EACH ROW EXECUTE FUNCTION');
    expect(rows.find((row) => row.name === 'membership_end_marks_account')?.definition).toContain('AFTER UPDATE OF ends_at ON public.membership');
  });
});

describe('SEC-26: no tenant, no administrator and no job reads or writes the tables', () => {
  it('shows every runtime actor zero rows and refuses every write, with rows of both practices present', async () => {
    const a = await member();
    const b = await member();
    await addMembership(owner, north.organizationId, a.id, 'viewer');
    await addMembership(owner, south.organizationId, b.id, 'viewer');
    await removed(b.id);
    const platform = await administrator();
    for (const table of TABLES) {
      expect(await count(table), table).toBeGreaterThan(0);
      for (const actor of [north.adminUserId, south.adminUserId, a.id, platform.id]) {
        expect(await code(asUser(actor, `SELECT 1 FROM ${table}`)), `${table} read`).toBe('42501');
        expect(await code(asUser(actor, `DELETE FROM ${table}`)), `${table} delete`).toBe('42501');
        expect(await code(asUser(actor, `UPDATE ${table} SET user_id = user_id`)), `${table} update`).toBe('42501');
        expect(await code(asUser(actor, `INSERT INTO ${table} (user_id) VALUES ($1)`, [actor])), `${table} insert`).toBe('42501');
      }
      for (const statement of [`SELECT 1 FROM ${table}`, `DELETE FROM ${table}`, `UPDATE ${table} SET user_id = user_id`]) {
        expect(await code(as(OPERATOR_ROLE, statement)), `${table} operator`).toBe('42501');
      }
    }
  });

  it('answers a sign-in with the named account’s keys only, lists removals to a platform administrator alone, and records a key for the actor alone', async () => {
    const a = await member();
    const b = await member();
    const keys = await asUser<{ credential_sha256: Buffer; removed: boolean }>(north.adminUserId, 'SELECT credential_sha256, removed FROM sign_in_hardware_keys($1)', [a.id]);
    expect(keys.map((key) => ({ digest: key.credential_sha256.toString('hex'), removed: key.removed }))).toEqual([{ digest: a.credential.toString('hex'), removed: false }]);
    const { removal } = await removed(b.id);
    const platform = await administrator();
    expect((await asUser<{ removal_id: string }>(platform.id, 'SELECT removal_id FROM hardware_key_removals()')).map((row) => row.removal_id)).toContain(removal);
    for (const actor of [north.adminUserId, a.id]) {
      expect(await code(asUser(actor, 'SELECT removal_id FROM hardware_key_removals()'))).toBe('42501');
    }
    // hardware_key_record takes no account: the row is the actor's, whoever calls.
    const stranger = await createUser(owner);
    await recordKey(stranger);
    expect(await count('hardware_key WHERE user_id = $1', [stranger])).toBe(1);
    expect(await count('hardware_key WHERE user_id = $1', [a.id])).toBe(1);
  });
});

describe('SEC-27: the reserved audit actions', () => {
  it('lets the application role write none of the registry’s actions', async () => {
    const insert = (action: string) =>
      code(asUser(north.adminUserId, "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, 'user', $2, 'user', $1)", [north.adminUserId, action]));
    for (const reserved of [
      'hardware_key_removal_requested',
      'hardware_key_removal_confirmed',
      'hardware_key_removal_cancelled',
      'hardware_key_removal_expired',
      'hardware_key_registration_opened',
      'hardware_key_notice_sent',
      'hardware_key_notice_undelivered',
      'provider_signed_out',
      'provider_sign_out_undelivered',
    ]) {
      expect(await insert(reserved), reserved).toBe('42501');
    }
    // Not yet reserved: the previous image writes it during the deploy (the contract migration reserves it).
    expect(await insert('hardware_key_registered')).toBe('accepted');
  });

  it('records membership_ended only for a membership this transaction ended and did not create', async () => {
    const person = await createUser(owner);
    const live = await addMembership(owner, north.organizationId, person, 'viewer');
    const event = "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id) VALUES ($1, 'user', 'membership_ended', 'membership', $2)";
    const NOT_ENDED = refusedBy('membership_ended_is_recorded_by_the_end');
    expect(await failure(asUser(north.adminUserId, event, [north.adminUserId, live]))).toEqual(NOT_ENDED);
    expect(await failure(asUser(north.adminUserId, event, [north.adminUserId, randomUUID()]))).toEqual(NOT_ENDED);
    // Inserted already ended in the same transaction: it moved no mark, so it is no end.
    const born = randomUUID();
    expect(
      await failure(
        withActor(app, north.adminUserId, async (scope) => {
          await scope.client.query("INSERT INTO membership (id, organization_id, user_id, role, ends_at) VALUES ($1, $2, $3, 'viewer', now())", [born, north.organizationId, await createUser(owner)]);
          await scope.client.query(event, [north.adminUserId, born]);
        }),
      ),
    ).toEqual(NOT_ENDED);
    await withActor(app, north.adminUserId, async (scope) => {
      await scope.client.query('UPDATE membership SET ends_at = now() WHERE id = $1', [live]);
      await scope.client.query(event, [north.adminUserId, live]);
    });
    expect(await count("provider_sign_out WHERE user_id = $1 AND reason = 'membership_ended'", [person])).toBe(1);
  });
});

describe('SGN-20: a session opens only for a live key, and never by code for a closed account', () => {
  it('opens for a live key and refuses no row, another account’s digest, a removed key and a malformed digest, each by name', async () => {
    const a = await member();
    const b = await member();
    const LIVE = refusedBy('user_session_hardware_key_live');
    expect(await failure(openSession(a.id, a.credential))).not.toMatchObject({ code: expect.any(String) });
    expect(await failure(openSession(a.id, digest()))).toEqual(LIVE);
    expect(await failure(openSession(a.id, b.credential))).toEqual(LIVE);
    expect(await failure(openSession(a.id, randomBytes(31)))).toEqual(refusedBy('user_session_key_digest'));
    await removed(a.id);
    expect(await failure(openSession(a.id, a.credential))).toEqual(LIVE);
  });

  it('lets the previous image’s key session through only for an account the registry never touched', async () => {
    const untouched = await createUser(owner);
    expect(await failure(openSession(untouched, null))).not.toMatchObject({ code: expect.any(String) });
    const registered = await member();
    expect(await failure(openSession(registered.id, null))).toEqual(refusedBy('user_session_hardware_key_live'));
    const bare = await createUser(owner);
    await removed(bare);
    expect(await failure(openSession(bare, null))).toEqual(refusedBy('user_session_hardware_key_live'));
  });

  it('refuses a code session for an account whose registration is closed, whatever its hardware-key rule, and for no other', async () => {
    const never = await createUser(owner);
    expect(await failure(openSession(never))).not.toMatchObject({ code: expect.any(String) });
    const a = await member();
    await removed(a.id);
    const CLOSED = refusedBy('user_session_key_registration_closed');
    expect(await failure(openSession(a.id))).toEqual(CLOSED);
    await owner.query('UPDATE "user" SET hardware_key_required = false WHERE id = $1', [a.id]);
    expect(await failure(openSession(a.id))).toEqual(CLOSED);
  });
});

describe('SGN-23: who may request a removal', () => {
  it('refuses everyone but a platform administrator seven days in the role, in a fresh session of a registered key, who is not the account', async () => {
    const target = await member();
    const DENIED = { code: '42501', constraint: undefined };
    const ask = (actor: string, session: string, about: string = target.id) => failure(asUser(actor, 'SELECT hardware_key_removal_request($1, $2, $3)', [about, session, request()]));
    // A practice administrator, a support member, an internal non-administrator: each with a key session of their own.
    const practiceAdmin = await member();
    await addMembership(owner, north.organizationId, practiceAdmin.id, 'practice_admin');
    const support = await member();
    await addMembership(owner, internal, support.id, 'support');
    for (const other of [practiceAdmin, support]) {
      expect(await ask(other.id, other.session)).toEqual(DENIED);
    }
    expect(await failure(as(APP_ROLE, 'SELECT hardware_key_removal_request($1, $2, $3)', [target.id, randomUUID(), request()]))).toEqual(DENIED);
    const good = await administrator();
    // The account itself.
    expect(await ask(good.id, await good.session(), good.id)).toEqual(refusedBy('hardware_key_removal_not_own_account'));
    // Six days in the role; and an old membership promoted in place today.
    const young = await administrator(6);
    expect(await ask(young.id, await young.session())).toEqual(DENIED);
    const promoted = await administrator(30);
    await owner.query("UPDATE membership SET role = 'support' WHERE id = $1", [promoted.membership]);
    await owner.query("UPDATE membership SET role = 'platform_admin' WHERE id = $1", [promoted.membership]);
    expect(await ask(promoted.id, await promoted.session())).toEqual(DENIED);
    // The session: a code session, the previous image's key session (no digest), another account's, one 16 minutes old,
    // and an older live session of the same account while a fresh one stands elsewhere.
    const stale = await good.session();
    // The session's twelve hours move with its start (user_session_twelve_hours holds for a seeded row too).
    await seeded("UPDATE user_session SET started_at = started_at - interval '16 minutes', expires_at = expires_at - interval '16 minutes' WHERE id = $1", [stale]);
    await good.session();
    expect(await ask(good.id, stale)).toEqual(DENIED);
    expect(await ask(good.id, target.session)).toEqual(DENIED);
    const bareAdmin = await createUser(owner, { hardwareKeyRequired: true });
    await seeded("INSERT INTO membership (organization_id, user_id, role, created_at) VALUES ($1, $2, 'platform_admin', now() - interval '8 days')", [internal, bareAdmin]);
    expect(await ask(bareAdmin, await openSession(bareAdmin, null))).toEqual(DENIED);
    expect(await ask(bareAdmin, await openSession(bareAdmin))).toEqual(DENIED);
    // The one that passes: one row, one audit row, nothing else changed.
    const removal = await requestRemoval(good, target.id);
    expect(await count("hardware_key_removal WHERE id = $1 AND state = 'requested' AND requested_by = $2 AND expires_at = requested_at + interval '24 hours'", [removal, good.id])).toBe(1);
    expect(await count("audit_event WHERE action = 'hardware_key_removal_requested' AND actor_id = $1 AND object_type = 'user' AND object_id = $2", [good.id, target.id])).toBe(1);
    expect(await count('hardware_key WHERE user_id = $1 AND removed_at IS NULL', [target.id])).toBe(1);
    expect(await count('user_session WHERE id = $1 AND ended_at IS NULL', [target.session])).toBe(1);
    // A second open request for the account.
    const second = await administrator();
    expect(await ask(second.id, await second.session())).toMatchObject({ code: '23505', constraint: 'hardware_key_removal_open_once' });
  });

  it('refuses an administrator whose own key was registered within 24 hours of a removal of their keys', async () => {
    const admin1 = await administrator();
    const { removal } = await removed(admin1.id);
    const opener = await administrator();
    const secret = sha256('SYNTHETIC-CODE-1');
    await asUser(opener.id, 'SELECT hardware_key_registration_open($1, $2, $3, $4)', [removal, await opener.session(), secret, request()]);
    const fresh = digest();
    await recordKey(admin1.id, fresh, secret);
    const target = await member();
    const ask = async () => failure(asUser(admin1.id, 'SELECT hardware_key_removal_request($1, $2, $3)', [target.id, await openSession(admin1.id, fresh), request()]));
    expect(await ask()).toEqual({ code: '42501', constraint: undefined });
    await seeded("UPDATE hardware_key SET registered_at = now() - interval '25 hours' WHERE user_id = $1 AND removed_at IS NULL", [admin1.id]);
    expect(await ask()).toBe('accepted');
  });
});

describe('SGN-24: the confirmation', () => {
  it('refuses the requester, the account, a late confirmer, a decided removal and a requester who left; and the table holds each rule itself', async () => {
    const adminTarget = await administrator();
    const [requester, confirmer] = [await administrator(), await administrator()];
    const removal = await requestRemoval(requester, adminTarget.id);
    const confirm = async (by: Administrator, which = removal) => failure(confirmRemoval(by, which));
    expect(await confirm(requester)).toEqual(refusedBy('hardware_key_removal_two_people'));
    expect(await confirm(adminTarget)).toEqual(refusedBy('hardware_key_removal_not_own_account'));
    const practiceAdmin = await member();
    expect(await failure(asUser(practiceAdmin.id, 'SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [removal, practiceAdmin.session, request()]))).toEqual({ code: '42501', constraint: undefined });
    // The owner's own UPDATE meets the CHECKs: the drafter, the account, and a decision at the expiry.
    const direct = (set: string, values: unknown[]) => failure(owner.query(`UPDATE hardware_key_removal SET state = 'confirmed', ${set} WHERE id = $1`, [removal, ...values]));
    expect(await direct('decided_by = requested_by, decided_at = requested_at', [])).toMatchObject({ code: '23514', constraint: 'hardware_key_removal_two_people' });
    expect(await direct('decided_by = user_id, decided_at = requested_at', [])).toMatchObject({ code: '23514' });
    expect(await direct('decided_by = $2, decided_at = expires_at', [confirmer.id])).toMatchObject({ code: '23514', constraint: 'hardware_key_removal_in_time' });
    // The target of an open request changes no internal membership (it cannot end or demote the requester).
    const HOLDS = refusedBy('hardware_key_removal_target_acts');
    expect(await failure(asUser(adminTarget.id, 'UPDATE membership SET ends_at = now() WHERE id = $1', [requester.membership]))).toEqual(HOLDS);
    expect(await failure(asUser(adminTarget.id, "UPDATE membership SET role = 'support' WHERE id = $1", [confirmer.membership]))).toEqual(HOLDS);
    // A requester who has since been disabled voids the request.
    await owner.query(`UPDATE "user" SET status = 'disabled' WHERE id = $1`, [requester.id]);
    expect(await confirm(confirmer)).toEqual(refusedBy('hardware_key_removal_requester_left'));
    await owner.query(`UPDATE "user" SET status = 'active' WHERE id = $1`, [requester.id]);
    // At 24 hours exactly, and after.
    await seeded("UPDATE hardware_key_removal SET requested_at = requested_at - interval '24 hours', expires_at = expires_at - interval '24 hours' WHERE id = $1", [removal]);
    expect(await confirm(confirmer)).toEqual(refusedBy('hardware_key_removal_in_time'));
    expect(await count('hardware_key WHERE user_id = $1 AND removed_at IS NULL', [adminTarget.id])).toBe(1);
  });

  it('removes every key, moves the mark, ends the sessions, clears a hold, and queues one notice, one sign-out and one audit row, together or not at all', async () => {
    const target = await member();
    // ADR 0093 D6's hold stands on the account.
    await owner.query(`UPDATE "user" SET locked_at = now() WHERE id = $1`, [target.id]);
    await owner.query("INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose) VALUES ('system', 'security_event', 'user', $1, 'account_locked_key_across_reset')", [target.id]);
    const [requester, confirmer, unlocker] = [await administrator(), await administrator(), await administrator()];
    expect(await failure(asUser(unlocker.id, 'SELECT unlock_user($1)', [target.id]))).toEqual(refusedBy('user_key_across_reset_hold'));
    const removal = await requestRemoval(requester, target.id);
    // A failure of any part leaves none: the confirmation inside a transaction that then rolls back.
    await failure(
      withActor(app, confirmer.id, async (scope) => {
        await scope.client.query('SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [removal, await confirmer.session(), request()]);
        throw new Error('rolled back');
      }),
    );
    expect(await count('hardware_key WHERE user_id = $1 AND removed_at IS NULL', [target.id])).toBe(1);
    expect(await count('provider_sign_out WHERE user_id = $1', [target.id])).toBe(0);
    expect(await confirmRemoval(confirmer, removal)).toEqual([{ keys_removed: 1, sessions_ended: 1 }]);
    const { rows } = await owner.query(
      `SELECT r.state, r.decided_by, r.keys_removed, r.sessions_ended,
              (SELECT count(*)::int FROM hardware_key k WHERE k.user_id = r.user_id AND k.removed_at IS NULL) AS live,
              (SELECT bool_and(k.removed_at = r.decided_at AND k.removal_id = r.id) FROM hardware_key k WHERE k.user_id = r.user_id) AS stamped,
              (SELECT u.sign_in_not_before = r.decided_at FROM "user" u WHERE u.id = r.user_id) AS marked,
              (SELECT u.locked_at IS NOT NULL FROM "user" u WHERE u.id = r.user_id) AS still_locked,
              (SELECT count(*)::int FROM user_session s WHERE s.user_id = r.user_id AND s.ended_at IS NULL) AS open_sessions,
              (SELECT count(*)::int FROM hardware_key_notice n WHERE n.removal_id = r.id AND n.kind = 'removed' AND n.state = 'pending') AS notices,
              (SELECT count(*)::int FROM provider_sign_out p JOIN audit_event e ON e.id = p.source_event_id
                WHERE p.user_id = r.user_id AND p.reason = 'hardware_keys_removed' AND e.action = 'hardware_key_removal_confirmed' AND e.actor_id = r.decided_by) AS sign_outs,
              (SELECT count(*)::int FROM audit_event e WHERE e.object_id = r.user_id AND e.action = 'security_event' AND e.purpose = 'key_across_reset_cleared') AS cleared
         FROM hardware_key_removal r WHERE r.id = $1`,
      [removal],
    );
    expect(rows).toEqual([
      { state: 'confirmed', decided_by: confirmer.id, keys_removed: 1, sessions_ended: 1, live: 0, stamped: true, marked: true, still_locked: true, open_sessions: 0, notices: 1, sign_outs: 1, cleared: 1 },
    ]);
    expect(await asUser(unlocker.id, 'SELECT unlock_user($1) AS unlocked', [target.id])).toEqual([{ unlocked: true }]);
    // Decided once: a second confirmation, and a cancel, find it decided; the row changes no more.
    const again = await administrator();
    expect(await failure(confirmRemoval(again, removal))).not.toBe('accepted');
    expect(await code(owner.query('DELETE FROM hardware_key_removal WHERE id = $1', [removal]))).not.toBe('accepted');
    expect(await code(owner.query('DELETE FROM hardware_key WHERE user_id = $1', [target.id]))).not.toBe('accepted');
    expect(await code(owner.query('UPDATE hardware_key SET removed_at = NULL, removal_id = NULL WHERE user_id = $1', [target.id]))).not.toBe('accepted');
  });
});

describe('SGN-25: cancel and expiry', () => {
  it('lets any eligible administrator but the account cancel, once, on the audit log', async () => {
    const adminTarget = await administrator();
    const [requester, other] = [await administrator(), await administrator()];
    const removal = await requestRemoval(requester, adminTarget.id);
    const cancel = async (by: Administrator) => failure(asUser(by.id, 'SELECT hardware_key_removal_cancel($1, $2, $3)', [removal, await by.session(), request()]));
    expect(await cancel(adminTarget)).toEqual(refusedBy('hardware_key_removal_not_own_account'));
    expect(await cancel(requester)).toBe('accepted');
    expect(await count("hardware_key_removal WHERE id = $1 AND state = 'cancelled' AND decided_by = $2", [removal, requester.id])).toBe(1);
    expect(await count("audit_event WHERE action = 'hardware_key_removal_cancelled' AND actor_id = $1 AND object_id = $2", [requester.id, adminTarget.id])).toBe(1);
    expect(await failure(confirmRemoval(other, removal))).not.toBe('accepted');
  });

  it('expires a request past 24 hours once, by the job, and an expired request confirms nothing', async () => {
    const target = await member();
    const [requester, confirmer] = [await administrator(), await administrator()];
    const removal = await requestRemoval(requester, target.id);
    await seeded("UPDATE hardware_key_removal SET requested_at = requested_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE id = $1", [removal]);
    const expire = () => as<{ removal_id: string }>(OPERATOR_ROLE, 'SELECT removal_id FROM operator_key_removals_expire($1, $2)', [100, request()]);
    expect((await expire()).map((row) => row.removal_id)).toContain(removal);
    expect((await expire()).map((row) => row.removal_id)).not.toContain(removal);
    expect(await count("audit_event WHERE action = 'hardware_key_removal_expired' AND actor_kind = 'system' AND object_id = $1", [target.id])).toBe(1);
    expect(await failure(confirmRemoval(confirmer, removal))).not.toBe('accepted');
    expect(await count('hardware_key WHERE user_id = $1 AND removed_at IS NULL', [target.id])).toBe(1);
    // A new request is open to the account again.
    expect(await requestRemoval(requester, target.id)).not.toBe('');
  });
});

describe('SGN-27: registration, and registration after a removal', () => {
  it('records the row and its audit row together, one live key an account, never a known digest, never a start at or before the mark', async () => {
    const user = await createUser(owner, { hardwareKeyRequired: true });
    const credential = digest();
    expect(await recordKey(user, credential)).toEqual([{ key_id: expect.any(String), first_after_removal: false }]);
    expect(await count("audit_event WHERE action = 'hardware_key_registered' AND actor_id = $1 AND object_id = $1", [user])).toBe(1);
    expect(await failure(recordKey(user))).toEqual(refusedBy('hardware_key_one_live'));
    expect(await failure(recordKey(await createUser(owner), credential))).toMatchObject({ code: '23505', constraint: 'hardware_key_credential_once' });
    const marked = await createUser(owner);
    const at = await began();
    await owner.query('UPDATE "user" SET sign_in_not_before = $2::timestamptz WHERE id = $1', [marked, at]);
    const record = (start: string) => failure(asUser(marked, 'SELECT * FROM hardware_key_record($1, $2, NULL, $3::timestamptz, $4)', [digest(), randomBytes(77), start, request()]));
    expect(await record(at)).toEqual(refusedBy('hardware_key_sign_in_not_before'));
    expect(await record('infinity')).toEqual(refusedBy('hardware_key_sign_in_not_before'));
    expect(await count('hardware_key WHERE user_id = $1', [marked])).toBe(0);
    expect(await count("audit_event WHERE action = 'hardware_key_registered' AND actor_id = $1", [marked])).toBe(0);
  });

  it('keeps registration closed after a removal until an administrator opens it, and registers only with the one-time code', async () => {
    const target = await member();
    const { removal, requester } = await removed(target.id);
    const CLOSED = refusedBy('hardware_key_registration_closed');
    const secret = sha256('SYNTHETIC-CODE-2');
    const judge = async (given: Buffer) => (await asUser<{ answer: string }>(target.id, 'SELECT hardware_key_registration_judge($1, $2::timestamptz, $3) AS answer', [given, await began(), request()]))[0]?.answer;
    // Closed, no opening: a password and a code alone register nothing, and a code is answered as a wrong one.
    expect(await failure(recordKey(target.id))).toEqual(CLOSED);
    expect(await judge(secret)).toBe('refused');
    expect(await count("audit_event WHERE object_id = $1 AND action = 'security_event' AND purpose = 'key_registration_refused'", [target.id])).toBe(1);
    // Who may open: not the account, not for an account that is not closed, not without the fresh key session.
    const open = async (by: Administrator, which: string, given: Buffer = secret) => failure(asUser(by.id, 'SELECT hardware_key_registration_open($1, $2, $3, $4)', [which, await by.session(), given, request()]));
    const practiceAdmin = await member();
    expect(await failure(asUser(practiceAdmin.id, 'SELECT hardware_key_registration_open($1, $2, $3, $4)', [removal, practiceAdmin.session, secret, request()]))).toEqual({ code: '42501', constraint: undefined });
    expect(await open(requester, removal)).toBe('accepted');
    expect(await open(requester, removal, sha256('SYNTHETIC-CODE-3'))).toEqual(refusedBy('hardware_key_registration_open_once'));
    expect(await count("audit_event WHERE action = 'hardware_key_registration_opened' AND actor_id = $1 AND object_id = $2", [requester.id, target.id])).toBe(1);
    expect(await count("hardware_key_notice WHERE removal_id = $1 AND kind = 'registration_opened'", [removal])).toBe(1);
    expect(await count("hardware_key_removal WHERE id = $1 AND registration_open_until = registration_opened_at + interval '1 hour' AND registration_code_sha256 = $2", [removal, secret])).toBe(1);
    // A wrong code counts and registers nothing; the right one registers, consumes, and tells the member.
    expect(await judge(sha256('WRONG'))).toBe('refused');
    expect(await failure(recordKey(target.id, digest(), sha256('WRONG')))).toEqual(CLOSED);
    expect(await count('hardware_key_removal WHERE id = $1 AND registration_code_tries = 1', [removal])).toBe(1);
    expect(await judge(secret)).toBe('open');
    const fresh = digest();
    expect(await recordKey(target.id, fresh, secret)).toEqual([{ key_id: expect.any(String), first_after_removal: true }]);
    expect(await count("audit_event WHERE object_id = $1 AND action = 'security_event' AND purpose = 'key_registered_after_removal'", [target.id])).toBe(1);
    expect(await count("hardware_key_notice WHERE removal_id = $1 AND kind = 'registered_after_removal'", [removal])).toBe(1);
    expect(await failure(recordKey(target.id, digest(), secret))).toEqual(refusedBy('hardware_key_one_live'));
    expect(await judge(secret)).toBe('not_closed');
    expect(await failure(openSession(target.id, fresh))).not.toMatchObject({ code: expect.any(String) });
    expect(await open(requester, removal)).toEqual(refusedBy('hardware_key_registration_not_closed'));
  });

  it('spends an opening at the fifth wrong code, and kills one when the mark moves', async () => {
    const target = await member();
    const { removal, requester, confirmer } = await removed(target.id);
    const secret = sha256('SYNTHETIC-CODE-4');
    const open = async (by: Administrator) => asUser(by.id, 'SELECT hardware_key_registration_open($1, $2, $3, $4)', [removal, await by.session(), secret, request()]);
    await open(requester);
    for (let tries = 0; tries < 5; tries += 1) {
      await asUser(target.id, 'SELECT hardware_key_registration_judge($1, $2::timestamptz, $3)', [sha256(`WRONG-${tries}`), await began(), request()]);
    }
    const CLOSED = refusedBy('hardware_key_registration_closed');
    expect(await failure(recordKey(target.id, digest(), secret))).toEqual(CLOSED);
    // A spent opening may be replaced; a reset recorded after the new opening closes it again.
    await open(confirmer);
    await asUser(target.id, "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code')", [target.id]);
    expect(await failure(recordKey(target.id, digest(), secret))).toEqual(CLOSED);
    // The account cannot open its own registration, whatever its role.
    const adminTarget = await administrator();
    const own = await removed(adminTarget.id);
    expect(await failure(asUser(adminTarget.id, 'SELECT hardware_key_registration_open($1, $2, $3, $4)', [own.removal, randomUUID(), secret, request()]))).not.toBe('accepted');
    expect(await count('hardware_key_removal WHERE id = $1 AND registration_opened_at IS NOT NULL', [own.removal])).toBe(0);
  });
});

/**
 * SGN-22, the invariant itself (docs/adr/0095; the design's section 5): a session never needs its key looked up again
 * because nothing that removes a key or moves the mark can pass a session's insert without one of the two waiting on
 * the account's row. Each case runs two transactions on two connections of the application's role: the first does its
 * work and holds the account's lock uncommitted, the second is seen WAITING on a lock, the first commits, the second
 * ends as the database decides. Then, by the owner's read of what is committed: no live session of the account whose
 * digest is not a live key of it, and none begun at or before the account's mark.
 */
describe('SGN-22: no live session without a live key, and none begun at or before the mark, in each order of the account’s lock', () => {
  type Step = (client: pg.PoolClient) => Promise<unknown>;
  interface Actor {
    readonly as: string;
    readonly step: Step;
  }
  type Mover = 'confirmation' | 'end membership' | 'reset';
  const MOVERS: readonly Mover[] = ['confirmation', 'end membership', 'reset'];

  /** A member with one live key, one open key session, a device, and a membership an administrator can end. */
  async function account() {
    const made = await member();
    const membership = randomUUID();
    await seeded(`INSERT INTO membership (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'support', now() - interval '30 days')`, [membership, internal, made.id]);
    return { ...made, membership, device: await device(made.id) };
  }
  type Account = Awaited<ReturnType<typeof account>>;

  /** The session's insert as the flow writes it, for a step that began at `at`. */
  const signIn = (target: Account, at: string): Actor => ({
    as: target.id,
    step: (client) =>
      client.query("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method, sign_in_began_at, key_credential_sha256) VALUES ($1, $2, $3, 'webauthn', $4::timestamptz, $5)", [
        target.id,
        target.device,
        tokenHash(),
        at,
        target.credential,
      ]),
  });

  /** What removes the keys or moves the mark, each as its route runs it; everything it needs is made before the race. */
  async function mover(kind: Mover, target: Account): Promise<Actor> {
    if (kind === 'confirmation') {
      const [requester, confirmer] = [await administrator(), await administrator()];
      const removal = await requestRemoval(requester, target.id);
      const acting = await confirmer.session();
      return { as: confirmer.id, step: (client) => client.query('SELECT * FROM hardware_key_removal_confirm($1, $2, $3)', [removal, acting, request()]) };
    }
    if (kind === 'end membership') {
      const by = await administrator();
      return { as: by.id, step: (client) => client.query('UPDATE membership SET ends_at = now() WHERE id = $1', [target.membership]) };
    }
    // The web's completed reset (endedByReset): the account's lock, the sweep, the event that moves the mark.
    return {
      as: target.id,
      step: async (client) => {
        await client.query('SELECT sign_in_lock_account()');
        await client.query('SELECT revoke_user_sessions($1)', [target.id]);
        await client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'user', 'password_reset_completed', 'user', $1, 'email_code')", [target.id]);
      },
    };
  }

  async function begin(actor: Actor): Promise<{ client: pg.PoolClient; pid: number }> {
    const client = await app.connect();
    await client.query('BEGIN');
    const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid, set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [actor.as]);
    return { client, pid: rows[0]?.pid ?? 0 };
  }

  /** Whether the backend comes to wait on a lock (it is polled for five seconds: a step that never waits is a finding). */
  async function waitsOnALock(pid: number): Promise<boolean> {
    for (let tries = 0; tries < 250; tries += 1) {
      if ((await count("pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [pid])) === 1) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }

  /** The invariant, over what is committed for the account. */
  async function standing(target: Account) {
    const { rows } = await owner.query<{ live: number; without_a_live_key: number; at_or_before_the_mark: number }>(
      `SELECT count(*)::int AS live,
              (count(*) FILTER (WHERE s.mfa_method = 'webauthn' AND NOT EXISTS (
                 SELECT 1 FROM hardware_key k WHERE k.user_id = s.user_id AND k.credential_sha256 = s.key_credential_sha256 AND k.removed_at IS NULL)))::int AS without_a_live_key,
              (count(*) FILTER (WHERE u.sign_in_not_before IS NOT NULL AND s.sign_in_began_at <= u.sign_in_not_before))::int AS at_or_before_the_mark
         FROM user_session s JOIN "user" u ON u.id = s.user_id
        WHERE s.user_id = $1 AND s.ended_at IS NULL`,
      [target.id],
    );
    return rows[0];
  }
  const HOLDS = { without_a_live_key: 0, at_or_before_the_mark: 0 };

  /**
   * `first` runs and holds its locks; `between` runs while it is uncommitted and names the second actor; the second is
   * started and must be seen waiting; `first` commits; the second ends, committed or refused. The invariant is read
   * once both have ended.
   */
  async function race(target: Account, first: Actor, between: () => Promise<Actor>): Promise<{ waited: boolean; second: 'accepted' | Failure; afterSecond: unknown }> {
    const one = await begin(first);
    let two: Awaited<ReturnType<typeof begin>> | undefined;
    try {
      await first.step(one.client);
      const second = await between();
      two = await begin(second);
      const outcome = failure(second.step(two.client));
      const waited = await waitsOnALock(two.pid);
      await one.client.query('COMMIT');
      const result = await outcome;
      await two.client.query(result === 'accepted' ? 'COMMIT' : 'ROLLBACK');
      return { waited, second: result, afterSecond: await standing(target) };
    } catch (error) {
      await one.client.query('ROLLBACK').catch(() => undefined);
      await two?.client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      one.client.release();
      two?.client.release();
    }
  }

  it.each(MOVERS)('a sign-in that holds the lock first is ended by the %s that waited for it', async (kind) => {
    const target = await account();
    // Made before the race: a removal's request takes the account's row too.
    const moves = await mover(kind, target);
    const result = await race(target, signIn(target, await began()), () => Promise.resolve(moves));
    expect(result).toMatchObject({ waited: true, second: 'accepted', afterSecond: { live: 0, ...HOLDS } });
  });

  it.each(MOVERS)('a sign-in begun before the %s and waiting on it is refused once it commits', async (kind) => {
    const target = await account();
    const at = await began();
    const result = await race(target, await mover(kind, target), () => Promise.resolve(signIn(target, at)));
    expect(result).toMatchObject({
      waited: true,
      second: refusedBy(kind === 'confirmation' ? 'user_session_hardware_key_live' : 'user_session_sign_in_not_before'),
      afterSecond: { live: 0, ...HOLDS },
    });
  });

  // The step begins after the mover's clock was read and before its commit: the mark alone would let it through, since
  // it began after the mark. After a confirmation the registry refuses it under the lock (the key is gone); after End
  // membership or a reset the key is still live, and a sign-in begun after the mark is one the design lets open.
  it.each(MOVERS)('a sign-in begun after the %s’s clock and before its commit opens only on a live key', async (kind) => {
    const target = await account();
    // A step's start is cut to the millisecond (sign_in_step_began), so one read in the mark's own millisecond is at or
    // before it and refused; the case is the step that begins clearly after.
    const result = await race(target, await mover(kind, target), async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return signIn(target, await began());
    });
    expect(result).toMatchObject(
      kind === 'confirmation'
        ? { waited: true, second: refusedBy('user_session_hardware_key_live'), afterSecond: { live: 0, ...HOLDS } }
        : { waited: true, second: 'accepted', afterSecond: { live: 1, ...HOLDS } },
    );
  });

  const PAIRS = MOVERS.flatMap((first) => MOVERS.filter((second) => second !== first).map((second) => [first, second] as const));
  it.each(PAIRS)('the %s and then the %s, the second waiting for the first: no session is left, and a step begun before either opens none', async (first, second) => {
    const target = await account();
    const at = await began();
    const later = await mover(second, target);
    const result = await race(target, await mover(first, target), () => Promise.resolve(later));
    expect(result).toMatchObject({ waited: true, second: 'accepted', afterSecond: { live: 0, ...HOLDS } });
    const after = await failure(withActor(app, target.id, (scope) => signIn(target, at).step(scope.client)));
    expect(after).toMatchObject({ code: '23514' });
    expect(await standing(target)).toMatchObject({ live: 0, ...HOLDS });
  });

  it('adds nothing to the request path in the database: the registry’s migrations do not name resolve_session', () => {
    const migrations = new URL('../migrations/', import.meta.url);
    const registry = readdirSync(migrations).filter((name) => name.startsWith('20261115'));
    expect(registry).toHaveLength(2);
    for (const name of registry) {
      expect(readFileSync(new URL(name, migrations), 'utf8')).not.toMatch(/resolve_session/);
    }
  });
});
