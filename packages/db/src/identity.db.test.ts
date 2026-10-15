import { createHash, randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MEMBERSHIP_ROLES, PERMISSION_NAMES, PERSONAS, STRUCTURAL_RULES, type StructuralRule, matrixRows, rolesPermit, withActor, withPracticeScope } from './index';
import { readDatabaseUrl } from './config';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from './testing';

/**
 * Migration 20261015170000 (docs/adr/0016 and 0017): the permission matrix in the database, the
 * database's check for role-specific actions, the structural "must not" rules, and the sign-in,
 * session, device and request-key state with its functions.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let world: TenantWorld;
let other: TenantWorld;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  world = await createTenantWorld(owner, 'A');
  other = await createTenantWorld(owner, 'B');
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function internalUser(role: 'platform_admin' | 'support' | 'contract_specialist' | 'reviewer'): Promise<string> {
  const internal = await createOrganization(owner, 'internal');
  const person = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, person, role);
  return person;
}

async function memberOf(organizationId: string, role: (typeof MEMBERSHIP_ROLES)[number]): Promise<string> {
  const person = await createUser(owner);
  await addMembership(owner, organizationId, person, role);
  return person;
}

async function firmGrant(roles: readonly string[], window = "now(), now() + interval '30 days'"): Promise<{ firmId: string; grantId: string }> {
  const firmId = await createOrganization(owner, 'firm', 'firm');
  const agreementId = randomUUID();
  const grantId = randomUUID();
  await asOwner(owner, [world.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [agreementId, firmId, world.practiceId, randomBytes(32).toString('hex')],
    );
    const [starts, ends] = window.split(', ');
    await owner.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, starts_at, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, $4, ${starts ?? 'now()'}, ${ends ?? 'now()'}, $5, $6)`,
      [grantId, firmId, world.practiceId, JSON.stringify({ roles }), world.adminUserId, agreementId],
    );
  });
  return { firmId, grantId };
}

const permitted = (actorId: string, practiceId: string, permission: string) =>
  withActor(app, actorId, async (scope) => (await scope.client.query<{ ok: boolean }>('SELECT app_actor_permitted($1, $2) AS ok', [practiceId, permission])).rows[0]?.ok);

const platformPermitted = (actorId: string, permission: string) =>
  withActor(app, actorId, async (scope) => (await scope.client.query<{ ok: boolean }>('SELECT app_actor_platform_permitted($1) AS ok', [permission])).rows[0]?.ok);

describe('the permission matrix in the database', () => {
  it('is exactly the matrix in packages/db/src/authz/permissions.ts', async () => {
    const { rows } = await owner.query<{ role: string; action: string; effect: string }>('SELECT role, action, effect FROM role_permission ORDER BY role, action');
    expect(rows).toEqual(matrixRows());
  });

  it('answers every role and permission as the TypeScript matrix does, pairs of roles included', async () => {
    const pairs: string[][] = [...MEMBERSHIP_ROLES.map((role) => [role]), ['billing_manager', 'viewer'], ['analyst', 'firm_principal'], []];
    const { rows } = await owner.query<{ roles: string[]; action: string; ok: boolean }>(
      'SELECT r.roles, a.action, roles_permit(r.roles, a.action) AS ok FROM unnest($1::text[]) AS a (action) CROSS JOIN (SELECT string_to_array(x, \',\') AS roles FROM unnest($2::text[]) AS x) r',
      [PERMISSION_NAMES, pairs.map((pair) => pair.join(','))],
    );
    expect(rows.length).toBe(PERMISSION_NAMES.length * pairs.length);
    for (const row of rows) {
      const roles = row.roles.filter((role) => role !== '');
      expect(row.ok, `${roles.join('+')} ${row.action}`).toBe(rolesPermit(roles, row.action as (typeof PERMISSION_NAMES)[number]));
    }
  });

  it('is read-only to the application role', async () => {
    await expect(withActor(app, world.adminUserId, (scope) => scope.client.query("INSERT INTO role_permission (role, action, effect) VALUES ('viewer', 'phi.export', 'allow')"))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(withActor(app, world.adminUserId, (scope) => scope.client.query("UPDATE role_permission SET effect = 'allow'"))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('app_actor_permitted: the database check for role-specific actions', () => {
  it('uses the roles the actor holds on the practice right now', async () => {
    expect(await permitted(world.adminUserId, world.practiceId, 'grant.approve')).toBe(true);
    expect(await permitted(world.adminUserId, other.practiceId, 'grant.approve')).toBe(false);
    const analyst = await memberOf(world.organizationId, 'analyst');
    expect(await permitted(analyst, world.practiceId, 'case.work')).toBe(true);
    expect(await permitted(analyst, world.practiceId, 'grant.approve')).toBe(false);
    expect(await permitted(analyst, world.practiceId, 'packet.approve')).toBe(false);
  });

  it('intersects a firm membership with the grant’s scope', async () => {
    const { firmId } = await firmGrant(['viewer']);
    const principal = await memberOf(firmId, 'firm_principal');
    const viewer = await memberOf(firmId, 'viewer');
    expect(await permitted(principal, world.practiceId, 'practice.open')).toBe(false);
    expect(await permitted(viewer, world.practiceId, 'report.read')).toBe(true);
    expect(await permitted(viewer, world.practiceId, 'phi.export')).toBe(false);
  });

  it('answers organization and platform permissions from current memberships', async () => {
    const admin = await internalUser('platform_admin');
    expect(await platformPermitted(admin, 'support_grant.create')).toBe(true);
    expect(await platformPermitted(admin, 'phi.read')).toBe(false);
    expect(await platformPermitted(world.adminUserId, 'organization.manage')).toBe(false);
    const ok = await withActor(app, world.adminUserId, async (scope) =>
      (await scope.client.query<{ a: boolean; b: boolean }>('SELECT app_actor_organization_permitted($1, $2) AS a, app_actor_organization_permitted($3, $2) AS b', [world.organizationId, 'user.invite', other.organizationId])).rows[0],
    );
    expect(ok).toEqual({ a: true, b: false });
  });

  it('decides grant changes: only a role holding grant.approve approves, and grant.revoke revokes', async () => {
    const analyst = await memberOf(world.organizationId, 'analyst');
    const firmId = await createOrganization(owner, 'firm', 'firm');
    const agreementId = randomUUID();
    await asOwner(owner, [world.practiceId], () =>
      owner.query(
        `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
         VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/e', $4)`,
        [agreementId, firmId, world.practiceId, randomBytes(32).toString('hex')],
      ),
    );
    const approve = (actorId: string) =>
      withPracticeScope(app, { actorId, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query(
          `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, '{"roles":["viewer"]}', now() + interval '1 day', $3, $4) RETURNING id`,
          [firmId, world.practiceId, actorId, agreementId],
        ),
      );
    // Refused by the grant rules' trigger (the approver must be a practice administrator) and by the
    // policy, which asks the matrix.
    await expect(approve(analyst)).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|23514)$/) });
    const policies = await owner.query<{ policyname: string; qual: string | null; with_check: string | null }>(
      "SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'grant' AND policyname IN ('grant_approved_by_practice_administrator', 'grant_revoked_by_practice_administrator') ORDER BY 1",
    );
    expect(policies.rows.map((row) => `${row.policyname}: ${row.with_check ?? ''}`)).toEqual([
      expect.stringContaining("app_actor_permitted(practice_id, 'grant.approve'::text)"),
      expect.stringContaining("app_actor_permitted(practice_id, 'grant.revoke'::text)"),
    ]);
    const created = await approve(world.adminUserId);
    const grantId = (created.rows[0] as { id: string }).id;
    const revoke = (actorId: string) =>
      withPracticeScope(app, { actorId, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $1 WHERE id = $2', [actorId, grantId]),
      );
    await expect(revoke(analyst)).resolves.toMatchObject({ rowCount: 0 });
    await expect(revoke(world.adminUserId)).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe('the structural "must not" rules', () => {
  const checks: Record<StructuralRule, () => Promise<void>> = {
    grant_in_force: async () => {
      const { firmId } = await firmGrant(['firm_principal'], "now() - interval '2 days', now() - interval '1 day'");
      const principal = await memberOf(firmId, 'firm_principal');
      expect(await permitted(principal, world.practiceId, 'practice.open')).toBe(false);
      expect(await withActor(app, principal, (scope) => scope.allowedPracticeIds())).toEqual([]);
    },
    support_grant_required: async () => {
      const admin = await internalUser('platform_admin');
      expect(await withActor(app, admin, (scope) => scope.allowedPracticeIds())).toEqual([]);
      expect(await permitted(admin, world.practiceId, 'practice.open')).toBe(false);
    },
    support_grant_expiry: async () => {
      const engineer = await internalUser('support');
      await asOwner(owner, [world.practiceId], () =>
        owner.query(
          `INSERT INTO support_grant (practice_id, user_id, ticket, reason, created_at, expires_at)
           VALUES ($1, $2, 'T-9', 'SYNTHETIC', now() - interval '4 hours', now())`,
          [world.practiceId, engineer],
        ),
      );
      expect(await permitted(engineer, world.practiceId, 'phi.read')).toBe(false);
    },
    two_person_approval: async () => {
      const { rows } = await owner.query("SELECT role FROM role_permission WHERE action = 'packet.approve_own_draft' AND effect = 'allow'");
      expect(rows).toEqual([]);
    },
  };

  it('has a check for every structural rule the matrix names', () => {
    const named = new Set(MEMBERSHIP_ROLES.flatMap((role) => PERSONAS[role].mustNot.flatMap((entry) => (entry.structural === undefined ? [] : [entry.structural]))));
    expect([...named].sort()).toEqual(Object.keys(STRUCTURAL_RULES).sort());
  });

  it.each(Object.keys(STRUCTURAL_RULES) as StructuralRule[])('holds %s', async (rule) => {
    await checks[rule]();
  });
});

describe('sign-in state', () => {
  const failed = (userId: string, stage: string) =>
    withActor(app, userId, async (scope) => (await scope.client.query<{ failures: number; locked: boolean; newly_locked: boolean; burst: boolean }>('SELECT * FROM sign_in_failed($1, $2, $3)', [userId, stage, 'req-1'])).rows[0]);

  it('finds an account by email or subject, with whether a hardware key is required', async () => {
    const support = await internalUser('support');
    const { rows } = await app.query('SELECT * FROM sign_in_account($1, NULL)', [`${world.adminUserId.toUpperCase()}@SYNTHETIC.TEST`]);
    expect(rows).toEqual([expect.objectContaining({ user_id: world.adminUserId, status: 'active', locked: false, hardware_key_required: false, mfa_enrolled: true })]);
    expect((await app.query('SELECT * FROM sign_in_account(NULL, $1)', [`synthetic-${support}`])).rows).toEqual([expect.objectContaining({ user_id: support, hardware_key_required: true })]);
    expect((await app.query('SELECT * FROM sign_in_account($1, NULL)', ['nobody@synthetic.test'])).rows).toEqual([]);
  });

  it('counts failures, raises a failed-MFA burst at the third second-factor failure, and locks at ten', async () => {
    const person = await createUser(owner);
    expect(await failed(person, 'password')).toEqual({ failures: 1, locked: false, newly_locked: false, burst: false });
    expect(await failed(person, 'mfa')).toMatchObject({ failures: 2, burst: false });
    expect(await failed(person, 'mfa')).toMatchObject({ failures: 3, burst: false });
    expect(await failed(person, 'hardware_key')).toMatchObject({ failures: 4, burst: true });
    expect(await failed(person, 'mfa')).toMatchObject({ failures: 5, burst: false });
    for (let attempt = 6; attempt < 10; attempt += 1) {
      expect(await failed(person, 'password')).toMatchObject({ failures: attempt, locked: false });
    }
    expect(await failed(person, 'password')).toEqual({ failures: 10, locked: true, newly_locked: true, burst: false });
    expect(await failed(person, 'password')).toEqual({ failures: 11, locked: true, newly_locked: false, burst: false });
    const events = await owner.query<{ action: string; purpose: string; actor_kind: string }>(
      "SELECT action, purpose, actor_kind FROM audit_event WHERE object_id = $1 AND action = 'security_event' ORDER BY at, purpose",
      [person],
    );
    expect(events.rows).toEqual([
      { action: 'security_event', purpose: 'failed_mfa_burst', actor_kind: 'system' },
      { action: 'security_event', purpose: 'account_locked', actor_kind: 'system' },
    ]);
    const failures = await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE object_id = $1 AND action = 'sign_in_failed'", [person]);
    expect(failures.rows).toEqual([{ n: 11 }]);
    expect((await app.query('SELECT locked FROM sign_in_account(NULL, $1)', [`synthetic-${person}`])).rows).toEqual([{ locked: true }]);
  });

  it('refuses an unknown stage and ignores an unknown user', async () => {
    const person = await createUser(owner);
    await expect(failed(person, 'guess')).rejects.toMatchObject({ code: '23514' });
    expect(await failed(randomUUID(), 'password')).toBeUndefined();
  });

  it('clears the count on success, and only a platform administrator unlocks', async () => {
    const person = await createUser(owner);
    await failed(person, 'password');
    await app.query('SELECT sign_in_succeeded($1)', [person]);
    expect((await owner.query('SELECT failed_sign_ins FROM "user" WHERE id = $1', [person])).rows).toEqual([{ failed_sign_ins: 0 }]);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await failed(person, 'password');
    }
    await app.query('SELECT sign_in_succeeded($1)', [person]);
    expect((await owner.query('SELECT failed_sign_ins, locked_at IS NOT NULL AS locked FROM "user" WHERE id = $1', [person])).rows).toEqual([{ failed_sign_ins: 10, locked: true }]);
    const unlock = (actorId: string) => withActor(app, actorId, async (scope) => (await scope.client.query<{ ok: boolean }>('SELECT unlock_user($1) AS ok', [person])).rows[0]?.ok);
    await expect(unlock(world.adminUserId)).rejects.toMatchObject({ code: '42501' });
    const admin = await internalUser('platform_admin');
    expect(await unlock(admin)).toBe(true);
    expect(await unlock(admin)).toBe(false);
    expect((await owner.query('SELECT failed_sign_ins, locked_at FROM "user" WHERE id = $1', [person])).rows).toEqual([{ failed_sign_ins: 0, locked_at: null }]);
  });

  it('keeps the application role from resetting a counter or lock itself', async () => {
    await expect(withActor(app, world.adminUserId, (scope) => scope.client.query('UPDATE "user" SET failed_sign_ins = 0 WHERE id = $1', [world.adminUserId]))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(withActor(app, world.adminUserId, (scope) => scope.client.query('UPDATE "user" SET locked_at = NULL WHERE id = $1', [world.adminUserId]))).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('sessions, devices and request keys', () => {
  async function openSession(userId: string, deviceToken = randomBytes(16).toString('hex')): Promise<{ token: string; sessionId: string; deviceId: string }> {
    const token = randomBytes(16).toString('hex');
    return withActor(app, userId, async (scope) => {
      const device = await scope.client.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux') RETURNING id", [userId, sha(deviceToken)]);
      const deviceId = device.rows[0]?.id ?? '';
      const session = await scope.client.query<{ id: string }>("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id", [
        userId,
        deviceId,
        sha(token),
      ]);
      return { token, sessionId: session.rows[0]?.id ?? '', deviceId };
    });
  }

  const resolve = async (token: string) => (await app.query<{ outcome: string; ended_now: boolean; user_id: string | null }>('SELECT * FROM resolve_session($1)', [sha(token)])).rows[0];

  it('resolves an active session, restarting its idle clock', async () => {
    const person = await createUser(owner);
    const session = await openSession(person);
    await owner.query("UPDATE user_session SET last_seen_at = now() - interval '29 minutes' WHERE id = $1", [session.sessionId]);
    expect(await resolve(session.token)).toMatchObject({ outcome: 'active', ended_now: false, user_id: person, mfa_method: 'totp', user_status: 'active', mfa_enrolled: true, hardware_key_required: false });
    const { rows } = await owner.query<{ idle: boolean }>("SELECT last_seen_at > now() - interval '1 minute' AS idle FROM user_session WHERE id = $1", [session.sessionId]);
    expect(rows).toEqual([{ idle: true }]);
  });

  it('ends a session idle past 30 minutes (SEC-15), past 12 hours, on a revoked device or for a disabled user; then says ended', async () => {
    const person = await createUser(owner);
    const idle = await openSession(person);
    await owner.query("UPDATE user_session SET last_seen_at = now() - interval '30 minutes 1 second' WHERE id = $1", [idle.sessionId]);
    expect(await resolve(idle.token)).toMatchObject({ outcome: 'idle', ended_now: true });
    expect(await resolve(idle.token)).toMatchObject({ outcome: 'ended', ended_now: false });

    const old = await openSession(person);
    await owner.query("UPDATE user_session SET started_at = now() - interval '12 hours', expires_at = now() WHERE id = $1", [old.sessionId]);
    expect(await resolve(old.token)).toMatchObject({ outcome: 'expired', ended_now: true });

    const revoked = await openSession(person);
    await withActor(app, person, (scope) => scope.client.query('UPDATE user_device SET revoked_at = now() WHERE id = $1', [revoked.deviceId]));
    expect(await resolve(revoked.token)).toMatchObject({ outcome: 'device_revoked', ended_now: true });

    const disabled = await createUser(owner);
    const session = await openSession(disabled);
    await asOwner(owner, [], () => owner.query("UPDATE \"user\" SET status = 'disabled' WHERE id = $1", [disabled]));
    expect(await resolve(session.token)).toMatchObject({ outcome: 'user_disabled', ended_now: true });
    expect(await resolve('never issued')).toMatchObject({ outcome: 'unknown', user_id: null });
  });

  it('caps a session at 12 hours from sign-in', async () => {
    const person = await createUser(owner);
    const session = await openSession(person);
    await expect(owner.query("UPDATE user_session SET expires_at = started_at + interval '12 hours 1 second' WHERE id = $1", [session.sessionId])).rejects.toMatchObject({ code: '23514' });
    const { rows } = await owner.query<{ hours: string }>('SELECT extract(epoch FROM expires_at - started_at)::bigint::text AS hours FROM user_session WHERE id = $1', [session.sessionId]);
    expect(rows).toEqual([{ hours: '43200' }]);
  });

  it('shows users their own devices and sessions only, and keeps the clocks out of their reach', async () => {
    const person = await createUser(owner);
    const stranger = await createUser(owner);
    const session = await openSession(person);
    const seen = (actorId: string) =>
      withActor(app, actorId, async (scope) => ({
        devices: (await scope.client.query('SELECT id FROM user_device')).rowCount,
        sessions: (await scope.client.query('SELECT id FROM user_session')).rowCount,
      }));
    expect(await seen(person)).toEqual({ devices: 1, sessions: 1 });
    expect(await seen(stranger)).toEqual({ devices: 0, sessions: 0 });
    await expect(withActor(app, stranger, (scope) => scope.client.query("UPDATE user_session SET ended_at = now(), end_reason = 'signed_out' WHERE id = $1", [session.sessionId]))).resolves.toMatchObject({
      rowCount: 0,
    });
    await expect(withActor(app, person, (scope) => scope.client.query("UPDATE user_session SET last_seen_at = now() + interval '1 day'"))).rejects.toMatchObject({ code: '42501' });
    await expect(withActor(app, person, (scope) => scope.client.query("UPDATE user_session SET expires_at = now() + interval '1 day'"))).rejects.toMatchObject({ code: '42501' });
    await expect(withActor(app, person, (scope) => scope.client.query('DELETE FROM user_session'))).rejects.toMatchObject({ code: '42501' });
    await expect(
      withActor(app, stranger, (scope) => scope.client.query("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux')", [person, sha('x')])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('revokes a user’s sessions for the user, a platform administrator or an administrator of the user’s organization', async () => {
    const person = await memberOf(world.organizationId, 'viewer');
    const revoke = (actorId: string) => withActor(app, actorId, async (scope) => (await scope.client.query<{ n: number }>('SELECT revoke_user_sessions($1) AS n', [person])).rows[0]?.n);
    await openSession(person);
    await openSession(person);
    await expect(revoke(other.adminUserId)).rejects.toMatchObject({ code: '42501' });
    expect(await revoke(world.adminUserId)).toBe(2);
    await openSession(person);
    expect(await revoke(await internalUser('platform_admin'))).toBe(1);
    await openSession(person);
    expect(await revoke(person)).toBe(1);
    const { rows } = await owner.query("SELECT DISTINCT end_reason FROM user_session WHERE user_id = $1", [person]);
    expect(rows).toEqual([{ end_reason: 'revoked' }]);
  });

  it('records a request key once per user', async () => {
    const person = await createUser(owner);
    const key = randomUUID();
    const record = (actorId: string) =>
      withActor(app, actorId, (scope) => scope.client.query("INSERT INTO mutation_request (user_id, request_key, route_id) VALUES ($1, $2, 'console.create_organization')", [actorId, key]));
    await expect(record(person)).resolves.toMatchObject({ rowCount: 1 });
    await expect(record(person)).rejects.toMatchObject({ code: '23505' });
    await expect(record(await createUser(owner))).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe('directory functions', () => {
  it('lists the practices the actor reaches right now, by name', async () => {
    const { rows } = await withActor(app, world.adminUserId, (scope) => scope.client.query('SELECT * FROM app_actor_practice_directory()'));
    expect(rows).toEqual([{ practice_id: world.practiceId, name: 'SYNTHETIC PRACTICE A', organization_id: world.organizationId }]);
    const platform = await internalUser('platform_admin');
    expect((await withActor(app, platform, (scope) => scope.client.query('SELECT * FROM app_actor_practice_directory()'))).rows).toEqual([]);
  });

  it('gives the internal console directory records for platform administrators only', async () => {
    await firmGrant(['viewer']);
    const platform = await internalUser('platform_admin');
    const engineer = await internalUser('support');
    await asOwner(owner, [world.practiceId], async () => {
      const id = randomUUID();
      await owner.query("INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'T-7', 'SYNTHETIC', now() + interval '1 hour')", [id, world.practiceId, engineer]);
      await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, 'user', 'read', 'practice', $2, $2, $3, 'support')", [
        engineer,
        world.practiceId,
        id,
      ]);
    });
    const look = (actorId: string) =>
      withActor(app, actorId, async (scope) => ({
        practices: (await scope.client.query('SELECT * FROM console_practices(NULL)')).rowCount,
        ofA: (await scope.client.query<{ name: string }>('SELECT name FROM console_practices($1)', [world.organizationId])).rows.map((row) => row.name),
        grants: (await scope.client.query('SELECT * FROM console_grants($1)', [world.organizationId])).rowCount,
        support: (await scope.client.query<{ ticket: string; reads: string }>('SELECT ticket, reads FROM console_support_grants()')).rows,
      }));
    const seen = await look(platform);
    expect(seen.practices).toBeGreaterThanOrEqual(2);
    expect(seen.ofA).toEqual(['SYNTHETIC PRACTICE A']);
    expect(seen.grants).toBeGreaterThanOrEqual(1);
    expect(seen.support).toContainEqual({ ticket: 'T-7', reads: '1' });
    expect(await look(world.adminUserId)).toEqual({ practices: 0, ofA: [], grants: 0, support: [] });
    expect(await look(engineer)).toEqual({ practices: 0, ofA: [], grants: 0, support: [] });
  });
});
