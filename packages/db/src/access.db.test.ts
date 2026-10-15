import { randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withPracticeScope } from './authz';
import { tenantTables } from './catalog';
import { readDatabaseUrl } from './config';
import {
  type MigratedDatabase,
  type TenantWorld,
  addMembership,
  asOwner,
  createMigratedDatabase,
  createOrganization,
  createTenantWorld,
  createUser,
} from './testing';

/**
 * The effective-permission function and the grant rules (PRD 3; PRD 16 Grants; test matrix SEC-03,
 * SEC-04, SEC-05): memberships intersected with grants in force, ownership without a grant, support
 * grants of four hours at most, no standing access for internal roles, and a practice that always
 * keeps an administrator.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let world: TenantWorld;
let tables: { table: string; tenantColumn: string }[];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  world = await createTenantWorld(owner, 'A');
  tables = await tenantTables(owner);
  // A support grant and an audit event in practice A, so every tenant table has a row to hide.
  // A support engineer (the database refuses a support grant to anyone else).
  const support = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, await createOrganization(owner, 'internal', 'support'), support, 'support');
  await asOwner(owner, [world.practiceId], async () => {
    await owner.query("INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'T-1', 'SYNTHETIC TICKET', now() + interval '1 hour')", [
      world.practiceId,
      support,
    ]);
    await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, practice_id) VALUES ($1, 'user', 'grant_created', 'grant', $2)", [
      world.adminUserId,
      world.practiceId,
    ]);
  });
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

interface FirmOptions {
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly roles?: readonly string[];
  readonly role?: 'firm_principal' | 'firm_analyst' | 'billing_manager' | 'analyst' | 'viewer';
}

/** A firm with one user and a grant from practice A's administrator. */
async function firmWithGrant(options: FirmOptions = {}): Promise<{ firmId: string; userId: string; grantId: string }> {
  const firmId = await createOrganization(owner, 'firm', 'firm');
  const userId = await createUser(owner);
  await addMembership(owner, firmId, userId, options.role ?? 'firm_analyst');
  const agreementId = randomUUID();
  const grantId = randomUUID();
  await asOwner(owner, [world.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [agreementId, firmId, world.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, starts_at, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, $4, coalesce($5::timestamptz, now()), coalesce($6::timestamptz, now() + interval '30 days'), $7, $8)`,
      [grantId, firmId, world.practiceId, JSON.stringify({ roles: options.roles ?? ['firm_analyst', 'firm_principal'] }), options.startsAt ?? null, options.endsAt ?? null, world.adminUserId, agreementId],
    );
  });
  return { firmId, userId, grantId };
}

/**
 * How many of practice A's rows `actorId` sees in each tenant table, asking for practice A. An
 * agreement the actor's own organization signed stays visible to it as a party (the engagement letter
 * outlives the grant), so it is not counted as practice A's.
 */
async function visibleRows(actorId: string): Promise<Record<string, number>> {
  return withPracticeScope(app, { actorId, practiceIds: [world.practiceId] }, async (scope) => {
    const counts: Record<string, number> = {};
    for (const { table, tenantColumn } of tables) {
      const notOwnAgreement = table === 'agreement' ? ' AND NOT (organization_id = ANY (app_actor_organization_ids()))' : '';
      const { rows } = await scope.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}" WHERE ${tenantColumn} = $1${notOwnAgreement}`, [world.practiceId]);
      counts[table] = rows[0]?.n ?? -1;
    }
    return counts;
  });
}

const allowed = (actorId: string) => withActor(app, actorId, (scope) => scope.allowedPracticeIds());
const nothing = () => Object.fromEntries(tables.map(({ table }) => [table, 0]));

describe('ownership', () => {
  it('lets the members of the practice’s own group reach it without a grant', async () => {
    expect(await allowed(world.adminUserId)).toEqual([world.practiceId]);
    const viewer = await createUser(owner);
    await addMembership(owner, world.organizationId, viewer, 'viewer');
    expect(await allowed(viewer)).toEqual([world.practiceId]);
    await withPracticeScope(app, { actorId: viewer, practiceIds: [world.practiceId] }, (scope) => {
      expect(scope.access(world.practiceId)).toEqual({ practiceId: world.practiceId, via: 'ownership', grantId: null, roles: ['viewer'] });
      return Promise.resolve();
    });
  });

  it('gives nothing to a member without MFA, an invited or disabled user, or an ended membership', async () => {
    for (const options of [{ mfaEnrolled: false }, { status: 'invited' as const }, { status: 'disabled' as const }]) {
      const person = await createUser(owner, options);
      await addMembership(owner, world.organizationId, person, 'billing_manager');
      expect(await allowed(person)).toEqual([]);
      expect(await visibleRows(person)).toEqual(nothing());
    }
    const left = await createUser(owner);
    await addMembership(owner, world.organizationId, left, 'analyst', new Date(Date.now() - 60_000).toISOString());
    expect(await allowed(left)).toEqual([]);
  });
});

describe('grants (SEC-03, SEC-04)', () => {
  it('lets a firm user reach the practice while the grant is in force, through that grant', async () => {
    const { userId, grantId } = await firmWithGrant();
    expect(await allowed(userId)).toEqual([world.practiceId]);
    await withPracticeScope(app, { actorId: userId, practiceIds: [world.practiceId] }, (scope) => {
      expect(scope.access(world.practiceId)).toEqual({ practiceId: world.practiceId, via: 'grant', grantId, roles: ['firm_analyst'] });
      return Promise.resolve();
    });
    const seen = await visibleRows(userId);
    expect(seen.practice).toBe(1);
    expect(seen.grant).toBe(1);
  });

  it('yields zero rows in every tenant table once the grant has expired', async () => {
    const { userId } = await firmWithGrant({ startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-02-01T00:00:00Z' });
    expect(await allowed(userId)).toEqual([]);
    expect(await visibleRows(userId)).toEqual(nothing());
  });

  it('yields nothing before the grant starts', async () => {
    const { userId } = await firmWithGrant({ startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    expect(await allowed(userId)).toEqual([]);
  });

  it('denies on the very next transaction after the practice administrator revokes it', async () => {
    const { userId, grantId } = await firmWithGrant();
    expect((await visibleRows(userId)).practice).toBe(1);
    await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) => {
      const revoked = await scope.client.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $2, reason = $3 WHERE id = $1', [grantId, world.adminUserId, 'SYNTHETIC REASON']);
      expect(revoked.rowCount).toBe(1);
    });
    expect(await allowed(userId)).toEqual([]);
    expect(await visibleRows(userId)).toEqual(nothing());
  });

  it('admits only the membership roles in the grant’s scope', async () => {
    const { userId } = await firmWithGrant({ roles: ['firm_principal'], role: 'firm_analyst' });
    expect(await allowed(userId)).toEqual([]);
    const empty = await firmWithGrant({ roles: [], role: 'firm_principal' });
    expect(await allowed(empty.userId)).toEqual([]);
  });

  it('lets only a practice administrator of the practice revoke a grant, once', async () => {
    const { userId, grantId } = await firmWithGrant({ role: 'firm_principal' });
    await withPracticeScope(app, { actorId: userId, practiceIds: [world.practiceId] }, async (scope) => {
      const attempt = await scope.client.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [grantId, userId]);
      expect(attempt.rowCount).toBe(0);
    });
    await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) => {
      await scope.client.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [grantId, world.adminUserId]);
    });
    await expect(
      withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query('UPDATE "grant" SET revoked_at = NULL, revoked_by = NULL WHERE id = $1', [grantId]),
      ),
    ).rejects.toThrow(/revoked once/);
  });

  it('refuses a grant that is not approved by a current practice administrator, or that goes to the internal organization', async () => {
    const firmId = await createOrganization(owner, 'firm');
    const internal = await createOrganization(owner, 'internal');
    const stranger = await createUser(owner);
    const insert = (organizationId: string, approver: string) =>
      asOwner(owner, [world.practiceId], () =>
        owner.query(
          `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, '{}', now() + interval '1 day', $3, $4)`,
          [organizationId, world.practiceId, approver, world.agreementId],
        ),
      );
    await expect(insert(firmId, stranger)).rejects.toThrow(/approved by a current practice administrator/);
    await expect(insert(internal, world.adminUserId)).rejects.toThrow(/internal access is a support grant/);
  });

  it('never changes a grant after approval', async () => {
    const { grantId } = await firmWithGrant();
    await expect(
      asOwner(owner, [world.practiceId], () => owner.query("UPDATE \"grant\" SET ends_at = ends_at + interval '1 year' WHERE id = $1", [grantId])),
    ).rejects.toThrow(/never changes after approval/);
  });

  it('lets a practice administrator approve a grant through the application role, for their own practice only', async () => {
    const firmId = await createOrganization(owner, 'firm');
    const agreementId = randomUUID();
    await asOwner(owner, [world.practiceId], () =>
      owner.query(
        `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
         VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/e', $4)`,
        [agreementId, firmId, world.practiceId, randomBytes(32).toString('hex')],
      ),
    );
    const approve = (actorId: string, approver: string) =>
      withPracticeScope(app, { actorId, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query(
          `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, '{"roles": ["viewer"]}', now() + interval '1 day', $3, $4)`,
          [firmId, world.practiceId, approver, agreementId],
        ),
      );
    await expect(approve(world.adminUserId, world.adminUserId)).resolves.toMatchObject({ rowCount: 1 });
    const manager = await createUser(owner);
    await addMembership(owner, world.organizationId, manager, 'billing_manager');
    // Claiming the administrator's approval is refused by the policy; approving it oneself by the trigger.
    await expect(approve(manager, world.adminUserId)).rejects.toMatchObject({ code: '42501' });
    await expect(approve(manager, manager)).rejects.toThrow(/approved by a current practice administrator/);
  });
});

describe('internal roles and support grants (SEC-05)', () => {
  async function internalUser(role: 'platform_admin' | 'support' | 'contract_specialist' | 'reviewer'): Promise<string> {
    const internal = await createOrganization(owner, 'internal');
    const person = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, person, role);
    return person;
  }

  async function supportGrant(userId: string, createdAt: string | null): Promise<string> {
    const id = randomUUID();
    await asOwner(owner, [world.practiceId], () =>
      owner.query(
        `INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at)
         VALUES ($1, $2, $3, 'T-2', 'SYNTHETIC TICKET', coalesce($4::timestamptz, now()), coalesce($4::timestamptz, now()) + interval '4 hours')`,
        [id, world.practiceId, userId, createdAt],
      ),
    );
    return id;
  }

  it('gives internal roles no standing access to any practice', async () => {
    for (const role of ['support', 'contract_specialist', 'reviewer'] as const) {
      const person = await internalUser(role);
      expect(await allowed(person)).toEqual([]);
      expect(await visibleRows(person)).toEqual(nothing());
    }
    // A platform administrator sees the agreements and support grants it administers (the data
    // dictionary's Policy column), and nothing of the practice itself, its grants or its access log.
    const admin = await internalUser('platform_admin');
    expect(await allowed(admin)).toEqual([]);
    const seen = await visibleRows(admin);
    expect({ practice: seen.practice, grant: seen.grant, audit_event: seen.audit_event }).toEqual({ practice: 0, grant: 0, audit_event: 0 });
    expect(seen.support_grant).toBeGreaterThan(0);
  });

  it('lets a support engineer reach the practice under an unexpired support grant', async () => {
    const engineer = await internalUser('support');
    const id = await supportGrant(engineer, null);
    expect(await allowed(engineer)).toEqual([world.practiceId]);
    await withPracticeScope(app, { actorId: engineer, practiceIds: [world.practiceId] }, (scope) => {
      expect(scope.access(world.practiceId)).toEqual({ practiceId: world.practiceId, via: 'support', grantId: id, roles: ['support'] });
      return Promise.resolve();
    });
  });

  it('yields nothing once a support grant is past four hours', async () => {
    const engineer = await internalUser('support');
    await supportGrant(engineer, new Date(Date.now() - 5 * 3_600_000).toISOString());
    expect(await allowed(engineer)).toEqual([]);
    expect(await visibleRows(engineer)).toEqual(nothing());
  });

  it('lets a contract specialist reach the practice under a support grant, holding the contract specialist role there (ADR 0028)', async () => {
    const specialist = await internalUser('contract_specialist');
    const id = await supportGrant(specialist, null);
    expect(await allowed(specialist)).toEqual([world.practiceId]);
    await withPracticeScope(app, { actorId: specialist, practiceIds: [world.practiceId] }, (scope) => {
      expect(scope.access(world.practiceId)).toEqual({ practiceId: world.practiceId, via: 'support', grantId: id, roles: ['contract_specialist'] });
      return Promise.resolve();
    });
  });

  it('lets a reimbursement reviewer reach the practice under a support grant, holding the reviewer role there (ADR 0038)', async () => {
    const reviewer = await internalUser('reviewer');
    const id = await supportGrant(reviewer, null);
    expect(await allowed(reviewer)).toEqual([world.practiceId]);
    await withPracticeScope(app, { actorId: reviewer, practiceIds: [world.practiceId] }, (scope) => {
      expect(scope.access(world.practiceId)).toEqual({ practiceId: world.practiceId, via: 'support', grantId: id, roles: ['reviewer'] });
      return Promise.resolve();
    });
  });

  it('refuses a support grant longer than four hours, and a support grant for someone without the support, contract specialist or reviewer role', async () => {
    const engineer = await internalUser('support');
    await expect(
      asOwner(owner, [world.practiceId], () =>
        owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'T-3', 'SYNTHETIC', now() + interval '4 hours 1 second')`, [
          world.practiceId,
          engineer,
        ]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const platformAdmin = await internalUser('platform_admin');
    await expect(supportGrant(platformAdmin, null)).rejects.toMatchObject({ code: '23514' });
    expect(await allowed(platformAdmin)).toEqual([]);
  });

  it('lets only a platform administrator create a support grant through the application role', async () => {
    const admin = await internalUser('platform_admin');
    const engineer = await internalUser('support');
    const create = (actorId: string) =>
      withActor(app, actorId, (scope) =>
        scope.client.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'T-4', 'SYNTHETIC', now() + interval '1 hour')`, [
          world.practiceId,
          engineer,
        ]),
      );
    await expect(create(admin)).resolves.toMatchObject({ rowCount: 1 });
    await expect(create(engineer)).rejects.toMatchObject({ code: '42501' });
    await expect(create(world.adminUserId)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('a practice always keeps a practice administrator', () => {
  it('refuses ending, demoting or disabling the last administrator, and allows handing the role over', async () => {
    const local = await createTenantWorld(owner, 'keep');
    const membership = await owner.query<{ id: string }>('SELECT id FROM membership WHERE user_id = $1', [local.adminUserId]);
    const id = membership.rows[0]?.id ?? '';
    await expect(asOwner(owner, [], () => owner.query('UPDATE membership SET ends_at = now() WHERE id = $1', [id]))).rejects.toThrow(/at least one practice administrator/);
    await expect(asOwner(owner, [], () => owner.query("UPDATE membership SET role = 'viewer' WHERE id = $1", [id]))).rejects.toThrow(/at least one practice administrator/);
    await expect(asOwner(owner, [], () => owner.query('DELETE FROM membership WHERE id = $1', [id]))).rejects.toThrow(/at least one practice administrator/);
    await expect(asOwner(owner, [], () => owner.query("UPDATE \"user\" SET status = 'disabled' WHERE id = $1", [local.adminUserId]))).rejects.toThrow(
      /at least one practice administrator/,
    );
    // Handing over in one transaction: the check runs at commit.
    const successor = await createUser(owner);
    await asOwner(owner, [], async () => {
      await owner.query("UPDATE membership SET ends_at = now() WHERE id = $1", [id]);
      await owner.query("INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'practice_admin')", [local.organizationId, successor]);
    });
    expect(await allowed(successor)).toEqual([local.practiceId]);
  });

  it('has an administrator from its creation: the group’s administrator is invited first (J1), and invited counts', async () => {
    const group = await createOrganization(owner, 'group');
    const practiceId = randomUUID();
    const create = () =>
      asOwner(owner, [practiceId], () =>
        owner.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC NEW PRACTICE', 'local:v1:AAAA')", [practiceId, group]),
      );
    await expect(create()).rejects.toThrow(/a practice always has an administrator/);
    const invited = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    await addMembership(owner, group, invited, 'practice_admin');
    await create();
    // Invited is not yet signed in with MFA: the practice is not reachable until then.
    expect(await allowed(invited)).toEqual([]);
  });

  it('refuses moving a practice to a group without an administrator', async () => {
    const local = await createTenantWorld(owner, 'move');
    const empty = await createOrganization(owner, 'group');
    await expect(asOwner(owner, [local.practiceId], () => owner.query('UPDATE practice SET organization_id = $2 WHERE id = $1', [local.practiceId, empty]))).rejects.toThrow(
      /a practice always has an administrator|at least one practice administrator/,
    );
  });
});

describe('organizations and roles', () => {
  it('refuses a role that does not belong in the organization’s kind', async () => {
    const firm = await createOrganization(owner, 'firm');
    const group = await createOrganization(owner, 'group');
    const person = await createUser(owner);
    await expect(addMembership(owner, firm, person, 'practice_admin')).rejects.toThrow(/does not belong in a firm organization/);
    await expect(addMembership(owner, group, person, 'platform_admin')).rejects.toThrow(/does not belong in a group organization/);
    await expect(addMembership(owner, group, person, 'firm_principal')).rejects.toThrow(/does not belong/);
  });

  it('refuses a practice owned by anything but a practice group, and an organization changing kind', async () => {
    const firm = await createOrganization(owner, 'firm');
    const practiceId = randomUUID();
    await expect(
      asOwner(owner, [practiceId], () => owner.query("INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, 'SYNTHETIC', 'local:v1:AAAA')", [practiceId, firm])),
    ).rejects.toThrow(/owned by a practice group/);
    await expect(asOwner(owner, [], () => owner.query("UPDATE organization SET kind = 'internal' WHERE id = $1", [firm]))).rejects.toThrow(/fixed at creation/);
  });

  it('shows members their organizations only, and lets administrators manage memberships of their own organization', async () => {
    const other = await createTenantWorld(owner, 'other');
    await withActor(app, world.adminUserId, async (scope) => {
      const organizations = await scope.client.query<{ id: string }>('SELECT id FROM organization');
      expect(organizations.rows.map((row) => row.id)).toEqual([world.organizationId]);
      const people = await scope.client.query<{ id: string }>('SELECT id FROM "user" WHERE id = $1', [other.adminUserId]);
      expect(people.rows).toEqual([]);
      const theirs = await scope.client.query('SELECT 1 FROM membership WHERE organization_id = $1', [other.organizationId]);
      expect(theirs.rows).toEqual([]);
    });
    const invitee = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    const join = (organizationId: string) =>
      withActor(app, world.adminUserId, (scope) => scope.client.query("INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, 'viewer')", [organizationId, invitee]));
    await expect(join(world.organizationId)).resolves.toMatchObject({ rowCount: 1 });
    await expect(join(other.organizationId)).rejects.toMatchObject({ code: '42501' });
  });

  it('lets a user accept their own invitation but not change their status otherwise, nor record their own MFA', async () => {
    const person = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    const update = (sql: string) => withActor(app, person, (scope) => scope.client.query(sql, [person]));
    // MFA enrollment is recorded only by the sign-in that opened a session (record_sign_in_with_mfa()).
    await expect(update('UPDATE "user" SET mfa_enrolled = true WHERE id = $1')).rejects.toMatchObject({ code: '42501' });
    await expect(update("UPDATE \"user\" SET status = 'active' WHERE id = $1")).resolves.toMatchObject({ rowCount: 1 });
    await expect(update("UPDATE \"user\" SET status = 'invited' WHERE id = $1")).rejects.toThrow(/only a platform administrator/);
    await expect(update('UPDATE "user" SET hardware_key_required = true WHERE id = $1')).rejects.toThrow(/only a platform administrator/);
  });

  it('keeps the application role out of the data key and every DELETE', async () => {
    await expect(
      withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query('UPDATE practice SET data_key_ref = NULL WHERE id = $1', [world.practiceId]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const table of ['organization', 'user', 'membership', 'practice', 'agreement', 'grant', 'support_grant', 'phi_table_registry']) {
      await expect(withActor(app, world.adminUserId, (scope) => scope.client.query(`DELETE FROM "${table}"`)), table).rejects.toMatchObject({ code: '42501' });
    }
  });
});
