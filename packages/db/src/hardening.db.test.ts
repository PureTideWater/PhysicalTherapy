import { randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from './testing';

/**
 * The rules migration 20261015180000 adds after the milestone 1 review, each against the application
 * role (PRD 3 Personas and Authorization in code; PRD 5 J15 and J16; PRD 16; sessions.md; Data
 * dictionary, Tenancy and access): memberships nobody can grant themselves or hand a stranger,
 * sessions identified and final, MFA recorded only by sign-in, grants on their own agreement chain,
 * agreements and support grants read by their parties, support grants to support engineers and
 * ended early, a practice with an administrator from its creation, the security events, and
 * SECURITY DEFINER functions that a temporary table cannot fool.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let north: TenantWorld;
let other: TenantWorld;
let internal: string;
let platformAdmin: string;
let engineer: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  north = await createTenantWorld(owner, 'north');
  other = await createTenantWorld(owner, 'other');
  internal = await createOrganization(owner, 'internal');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

/** Runs `sql` as the application role for `actorId` with `practiceIds` in scope, in a transaction rolled back. */
async function asApp(actorId: string | null, practiceIds: readonly string[], sql: string, values: unknown[] = []): Promise<pg.QueryResult> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId ?? '', `{${practiceIds.join(',')}}`]);
    return await client.query(sql, values);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const code = (attempt: Promise<unknown>) => attempt.then(() => 'accepted', (error: unknown) => (error as { code?: string }).code ?? 'error');

async function agreement(organizationId: string, practiceId: string | null, kind: string): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, practiceId === null ? [] : [practiceId], () =>
    owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, $4, '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic', $5)`,
      [id, organizationId, practiceId, kind, randomBytes(32).toString('hex')],
    ),
  );
  return id;
}

async function securityEvents(objectId: string): Promise<string[]> {
  const { rows } = await owner.query<{ purpose: string; actor_kind: string }>(
    "SELECT purpose, actor_kind FROM audit_event WHERE action = 'security_event' AND object_id = $1 ORDER BY at, purpose",
    [objectId],
  );
  return rows.map((row) => `${row.actor_kind}:${row.purpose}`);
}

describe('memberships', () => {
  it('lets nobody grant themselves a membership or change their own role', async () => {
    const firm = await createOrganization(owner, 'firm', 'self');
    // A platform administrator, into a customer organization or the internal one.
    expect(await code(asApp(platformAdmin, [], "INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'firm_principal')", [firm, platformAdmin]))).toBe('42501');
    expect(await code(asApp(platformAdmin, [], "INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'support')", [internal, platformAdmin]))).toMatch(/42501|23505/);
    // A group's administrator changing their own role.
    expect(await code(asApp(north.adminUserId, [], "UPDATE membership SET role = 'viewer' WHERE user_id = $1 AND organization_id = $2", [north.adminUserId, north.organizationId]))).toBe('42501');
  });

  it('lets an organization administrator add only users no other organization knows; the platform path adds the others', async () => {
    const stranger = await createUser(owner);
    await addMembership(owner, other.organizationId, stranger, 'viewer');
    const fresh = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    const insert = "INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'viewer')";
    expect(await code(asApp(north.adminUserId, [], insert, [north.organizationId, stranger]))).toBe('42501');
    expect(await code(asApp(north.adminUserId, [], insert, [north.organizationId, fresh]))).toBe('accepted');
    expect(await code(asApp(platformAdmin, [], insert, [north.organizationId, stranger]))).toBe('accepted');
    // The stranger's account stays unreadable to the group's administrator, and their sessions out of reach.
    expect((await asApp(north.adminUserId, [], 'SELECT id FROM "user" WHERE id = $1', [stranger])).rows).toEqual([]);
    expect(await code(asApp(north.adminUserId, [], 'SELECT revoke_user_sessions($1)', [stranger]))).toBe('42501');
  });

  it('never changes an ended membership, so an ended one cannot be revived', async () => {
    const person = await createUser(owner);
    const membership = await addMembership(owner, north.organizationId, person, 'analyst', new Date(Date.now() - 60_000).toISOString());
    expect(await code(asApp(platformAdmin, [], 'UPDATE membership SET ends_at = NULL WHERE id = $1', [membership]))).toBe('23514');
    expect(await code(asOwner(owner, [], () => owner.query("UPDATE membership SET role = 'viewer' WHERE id = $1", [membership])))).toBe('23514');
  });

  it('lets a platform administrator create customer organizations only, never a second internal one', async () => {
    const insert = 'INSERT INTO organization (kind, name) VALUES ($1, $2)';
    expect(await code(asApp(platformAdmin, [], insert, ['firm', 'SYNTHETIC FIRM']))).toBe('accepted');
    expect(await code(asApp(platformAdmin, [], insert, ['internal', 'SYNTHETIC SECOND INTERNAL']))).toBe('42501');
  });

  it('raises a security event for every administrator or internal role given, and none for other roles', async () => {
    const person = await createUser(owner);
    const viewer = await addMembership(owner, north.organizationId, person, 'viewer');
    expect(await securityEvents(viewer)).toEqual([]);
    await withActor(app, platformAdmin, (scope) => scope.client.query("UPDATE membership SET role = 'practice_admin' WHERE id = $1", [viewer]));
    expect(await securityEvents(viewer)).toEqual(['system:role_escalation']);
    const staff = await createUser(owner, { hardwareKeyRequired: true });
    const support = await addMembership(owner, internal, staff, 'support');
    expect(await securityEvents(support)).toEqual(['system:role_escalation']);
    const { rows } = await owner.query<{ actor_id: string | null }>("SELECT actor_id FROM audit_event WHERE action = 'security_event' AND object_id = $1", [viewer]);
    expect(rows).toEqual([{ actor_id: platformAdmin }]);
  });
});

describe('sessions, devices and MFA', () => {
  async function session(userId: string): Promise<{ sessionId: string; deviceId: string }> {
    const device = await owner.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux') RETURNING id", [userId, randomBytes(32).toString('hex')]);
    const deviceId = device.rows[0]?.id ?? '';
    const opened = await owner.query<{ id: string }>("INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, 'totp') RETURNING id", [
      userId,
      deviceId,
      randomBytes(32).toString('hex'),
    ]);
    return { sessionId: opened.rows[0]?.id ?? '', deviceId };
  }

  it('revokes sessions only for an identified actor', async () => {
    const person = await createUser(owner);
    await addMembership(owner, north.organizationId, person, 'viewer');
    await session(person);
    expect(await code(asApp(null, [], 'SELECT revoke_user_sessions($1)', [person]))).toBe('42501');
    expect((await asApp(north.adminUserId, [], 'SELECT revoke_user_sessions($1) AS ended', [person])).rows).toEqual([{ ended: 1 }]);
  });

  it('keeps an ended session ended and a revoked device revoked, for the user and for everyone', async () => {
    const person = await createUser(owner);
    const { sessionId, deviceId } = await session(person);
    await owner.query("UPDATE user_session SET ended_at = now(), end_reason = 'revoked' WHERE id = $1", [sessionId]);
    await owner.query('UPDATE user_device SET revoked_at = now() WHERE id = $1', [deviceId]);
    expect(await code(asApp(person, [], 'UPDATE user_session SET ended_at = NULL, end_reason = NULL WHERE id = $1', [sessionId]))).toBe('23514');
    expect(await code(asApp(person, [], 'UPDATE user_device SET revoked_at = NULL WHERE id = $1', [deviceId]))).toBe('23514');
    expect(await code(owner.query("UPDATE user_session SET end_reason = 'idle' WHERE id = $1", [sessionId]))).toBe('23514');
  });

  it('records MFA enrollment only through the sign-in that opened a session in the same transaction', async () => {
    const person = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    expect(await code(asApp(person, [], 'UPDATE "user" SET mfa_enrolled = true WHERE id = $1', [person]))).toBe('42501');
    expect(await code(asApp(person, [], 'SELECT record_sign_in_with_mfa()'))).toBe('42501');
    await session(person);
    // A session opened in an earlier transaction does not count either.
    expect(await code(asApp(person, [], 'SELECT record_sign_in_with_mfa()'))).toBe('42501');
  });

  it('raises a security event for a sign-in from a new device, not for a first device', async () => {
    const person = await createUser(owner);
    const first = await session(person);
    const second = await session(person);
    expect(await securityEvents(first.deviceId)).toEqual([]);
    expect(await securityEvents(second.deviceId)).toEqual(['system:new_device_sign_in']);
  });
});

describe('grants and their agreements', () => {
  const insertGrant = (organizationId: string, agreementId: string) =>
    withPracticeScope(app, { actorId: north.adminUserId, practiceIds: [north.practiceId] }, (scope) =>
      scope.client.query<{ id: string }>(
        `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
         VALUES ($1, $2, '{"roles":["firm_analyst"]}', now() + interval '30 days', $3, $4) RETURNING id`,
        [organizationId, north.practiceId, north.adminUserId, agreementId],
      ),
    );

  it('rests a grant only on a BAA or engagement letter of its own chain', async () => {
    const firmOne = await createOrganization(owner, 'firm', 'one');
    const firmTwo = await createOrganization(owner, 'firm', 'two');
    const firmOneEngagement = await agreement(firmOne, north.practiceId, 'engagement');
    const otherGroupBaa = other.agreementId;
    const groupTerms = await agreement(north.organizationId, null, 'terms');
    const groupBaaForAll = await agreement(north.organizationId, null, 'baa');
    const firmTwoBaa = await agreement(firmTwo, null, 'baa');
    for (const foreign of [firmOneEngagement, otherGroupBaa, groupTerms, groupBaaForAll]) {
      expect(await code(insertGrant(firmTwo, foreign)), foreign).toBe('23514');
    }
    // The grantee's own BAA, and the practice's group's BAA naming the practice, are its chain.
    expect(await code(insertGrant(firmTwo, firmTwoBaa))).toBe('accepted');
    expect(await code(insertGrant(firmTwo, north.agreementId))).toBe('accepted');
  });

  it('raises a security event when a grant is approved and when it is revoked, visible to the practice', async () => {
    const firm = await createOrganization(owner, 'firm', 'events');
    const engagement = await agreement(firm, north.practiceId, 'engagement');
    const grantId = (await insertGrant(firm, engagement)).rows[0]?.id ?? '';
    await withPracticeScope(app, { actorId: north.adminUserId, practiceIds: [north.practiceId] }, (scope) =>
      scope.client.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $1 WHERE id = $2', [north.adminUserId, grantId]),
    );
    expect(await securityEvents(grantId)).toEqual(['system:grant_change', 'system:grant_change']);
    const { rows } = await owner.query<{ practice_id: string }>("SELECT DISTINCT practice_id FROM audit_event WHERE action = 'security_event' AND object_id = $1", [grantId]);
    expect(rows).toEqual([{ practice_id: north.practiceId }]);
  });
});

describe('agreements and support grants are read by their parties', () => {
  it('shows a firm only its own agreements with a practice it is granted, and none of the practice’s support grants', async () => {
    const firmOne = await createOrganization(owner, 'firm', 'party one');
    const firmTwo = await createOrganization(owner, 'firm', 'party two');
    const oneEngagement = await agreement(firmOne, north.practiceId, 'engagement');
    const twoEngagement = await agreement(firmTwo, north.practiceId, 'engagement');
    await asOwner(owner, [north.practiceId], () =>
      owner.query(
        `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, '{"roles":["firm_principal"]}', now() + interval '30 days', $3, $4)`,
        [firmTwo, north.practiceId, north.adminUserId, twoEngagement],
      ),
    );
    await asOwner(owner, [north.practiceId], () =>
      owner.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'T-1', 'SYNTHETIC', now() + interval '1 hour')", [north.practiceId, engineer]),
    );
    const principal = await createUser(owner);
    await addMembership(owner, firmTwo, principal, 'firm_principal');
    const seen = await withPracticeScope(app, { actorId: principal, practiceIds: [north.practiceId] }, async (scope) => ({
      practices: scope.practiceIds,
      agreements: (await scope.client.query<{ id: string }>('SELECT id FROM agreement WHERE practice_id = $1 ORDER BY id', [north.practiceId])).rows.map((row) => row.id),
      supportGrants: (await scope.client.query('SELECT id FROM support_grant')).rows,
    }));
    expect(seen).toEqual({ practices: [north.practiceId], agreements: [twoEngagement], supportGrants: [] });
    expect(seen.agreements).not.toContain(oneEngagement);
    // The practice's own group sees every agreement naming it and its support grants.
    const group = await withPracticeScope(app, { actorId: north.adminUserId, practiceIds: [north.practiceId] }, async (scope) => ({
      agreements: (await scope.client.query('SELECT id FROM agreement WHERE practice_id = $1', [north.practiceId])).rowCount,
      supportGrants: (await scope.client.query('SELECT id FROM support_grant')).rowCount,
    }));
    expect(group.agreements).toBeGreaterThanOrEqual(3);
    expect(group.supportGrants).toBeGreaterThanOrEqual(1);
  });

  it('lets only those who sign agreements record them: a practice administrator for the group, a platform administrator', async () => {
    const firm = await createOrganization(owner, 'firm', 'records');
    const principal = await createUser(owner);
    await addMembership(owner, firm, principal, 'firm_principal');
    const record = (actor: string, organizationId: string, practiceId: string | null) =>
      code(
        asApp(
          actor,
          practiceId === null ? [] : [practiceId],
          `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           VALUES ($1, $2, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'esign:x', $3)`,
          [organizationId, practiceId, 'c'.repeat(64)],
        ),
      );
    expect(await record(principal, firm, north.practiceId)).toBe('42501');
    expect(await record(principal, firm, null)).toBe('42501');
    expect(await record(north.adminUserId, north.organizationId, north.practiceId)).toBe('accepted');
    expect(await record(north.adminUserId, north.organizationId, other.practiceId)).toBe('42501');
    expect(await record(platformAdmin, firm, north.practiceId)).toBe('accepted');
  });
});

describe('support grants', () => {
  const create = (actor: string, userId: string) =>
    code(
      asApp(actor, [], "INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'T-2', 'SYNTHETIC', now() + interval '4 hours')", [
        north.practiceId,
        userId,
      ]),
    );

  it('go to a support engineer only, and never to the person creating them', async () => {
    expect(await create(platformAdmin, engineer)).toBe('accepted');
    expect(await create(platformAdmin, north.adminUserId)).toBe('23514');
    expect(await create(platformAdmin, platformAdmin)).toBe('42501');
    expect(await create(north.adminUserId, engineer)).toBe('42501');
  });

  it('are never updated by the application role, and end early only through end_support_grant, once, with a security event', async () => {
    const id = randomUUID();
    await asOwner(owner, [north.practiceId], () =>
      owner.query("INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at) VALUES ($1, $2, $3, 'T-3', 'SYNTHETIC', now() - interval '1 hour', now() + interval '3 hours')", [
        id,
        north.practiceId,
        engineer,
      ]),
    );
    for (const actor of [platformAdmin, engineer, north.adminUserId]) {
      expect(await code(asApp(actor, [north.practiceId], 'UPDATE support_grant SET expires_at = now() WHERE id = $1', [id]))).toBe('42501');
    }
    expect(await code(asApp(north.adminUserId, [north.practiceId], 'SELECT end_support_grant($1)', [id]))).toBe('42501');
    const end = (actor: string) => withActor(app, actor, async (scope) => (await scope.client.query<{ ended: boolean; scope: string }>("SELECT end_support_grant($1) AS ended, current_setting('app.practice_ids') AS scope", [id])).rows[0]);
    // The caller's scope comes back as it was.
    expect(await end(engineer)).toEqual({ ended: true, scope: '{}' });
    expect(await end(platformAdmin)).toEqual({ ended: false, scope: '{}' });
    expect(await securityEvents(id)).toEqual(['system:support_grant_opened', 'system:grant_change']);
    expect((await withActor(app, engineer, (scope) => scope.client.query('SELECT 1 FROM effective_practice_access() WHERE grant_id = $1', [id]))).rows).toEqual([]);
    // The closing notice is now due.
    const { rows } = await owner.query("SELECT notice FROM operator_due_support_notices(100) WHERE support_grant_id = $1 ORDER BY notice", [id]);
    expect(rows).toEqual([{ notice: 'support_grant_closed' }, { notice: 'support_grant_opened' }]);
  });
});

describe('practices', () => {
  it('have an owning group with an administrator from their creation (invited counts), until deleted', async () => {
    const insert = (organizationId: string | null) =>
      code(
        (async () => {
          const id = randomUUID();
          await asOwner(owner, [id], () => owner.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC', 'local:v1:AAAA')", [id, organizationId]));
        })(),
      );
    const empty = await createOrganization(owner, 'group', 'empty');
    expect(await insert(null)).toBe('23514');
    expect(await insert(empty)).toBe('23514');
    const invited = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    await addMembership(owner, empty, invited, 'practice_admin');
    expect(await insert(empty)).toBe('accepted');
  });
});

describe('the audit log', () => {
  it('takes only user and service events from the application role, and none of the database’s own', async () => {
    const insert = (kind: string, action: string) =>
      code(asApp(north.adminUserId, [], "INSERT INTO audit_event (actor_id, actor_kind, action, object_type) VALUES ($1, $2, $3, 'user')", [north.adminUserId, kind, action]));
    expect(await insert('user', 'membership_created')).toBe('accepted');
    expect(await insert('system', 'membership_created')).toBe('42501');
    for (const reserved of ['notice_sent', 'security_event', 'sign_in_failed', 'data_key_destroyed']) {
      expect(await insert('user', reserved)).toBe('42501');
    }
  });
});

describe('SECURITY DEFINER functions', () => {
  it('give the application role no temporary tables, and cannot be fooled by one (pg_temp is searched last)', async () => {
    expect(await code(asApp(north.adminUserId, [], 'CREATE TEMP TABLE "grant" (id uuid)'))).toBe('42501');
    // Even a temporary "grant" in the session (made here by the superuser) does not stand in for the real one.
    const firm = await createOrganization(owner, 'firm', 'temp');
    const analyst = await createUser(owner);
    await addMembership(owner, firm, analyst, 'firm_analyst');
    await owner.query('BEGIN');
    try {
      await owner.query(
        'CREATE TEMP TABLE "grant" (id uuid, organization_id uuid, practice_id uuid, scope jsonb, starts_at timestamptz, ends_at timestamptz, revoked_at timestamptz) ON COMMIT DROP',
      );
      await owner.query(`INSERT INTO pg_temp."grant" VALUES ($1, $2, $3, '{"roles":["firm_analyst"]}', now() - interval '1 day', now() + interval '1 day', NULL)`, [randomUUID(), firm, north.practiceId]);
      await owner.query("SELECT set_config('app.actor_id', $1, true)", [analyst]);
      const { rows } = await owner.query<{ ids: string[] }>('SELECT allowed_practice_ids() AS ids');
      expect(rows).toEqual([{ ids: [] }]);
    } finally {
      await owner.query('ROLLBACK');
    }
  });
});
