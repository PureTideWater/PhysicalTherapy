import { randomBytes, randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readWithAudit, recordAuditEvent, rowTarget, withActor, withJobScope, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { OWNER_ROLE } from './roles';
import { practice, supportGrant } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from './testing';

/**
 * The audit log (PRD 6 Audit log; PRD 16; test matrix SEC-10): append-only for every role, PHI reads
 * recorded through readWithAudit(), and the practice's access log readable by its administrators.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let world: TenantWorld;
let other: TenantWorld;
let firmUser: string;
let grantId: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  world = await createTenantWorld(owner, 'A');
  other = await createTenantWorld(owner, 'B');
  const firm = await createOrganization(owner, 'firm');
  firmUser = await createUser(owner);
  await addMembership(owner, firm, firmUser, 'firm_analyst');
  grantId = randomUUID();
  const agreementId = randomUUID();
  await asOwner(owner, [world.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/e', $4)`,
      [agreementId, firm, world.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, '{"roles": ["firm_analyst"]}', now() + interval '1 day', $4, $5)`,
      [grantId, firm, world.practiceId, world.adminUserId, agreementId],
    );
  });
});

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

/** Reads practice A's own row through readWithAudit as `actorId`, under request `requestId`. */
function auditedPracticeRead(actorId: string, requestId: string) {
  return withPracticeScope(app, { actorId, practiceIds: [world.practiceId] }, (scope) =>
    readWithAudit(
      scope,
      { objectType: 'practice', purpose: 'settings_review', requestId },
      (client) => drizzle(client).select({ id: practice.id, practiceId: practice.id }).from(practice).where(eq(practice.id, world.practiceId)),
      rowTarget,
    ),
  );
}

async function eventsFor(requestId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await owner.query<Record<string, unknown>>('SELECT actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id FROM audit_event WHERE request_id = $1 ORDER BY at, id', [
    requestId,
  ]);
  return rows;
}

describe('readWithAudit', () => {
  it('records the actor, action, object, practice, grant, purpose and request ID of every PHI read', async () => {
    await expect(auditedPracticeRead(world.adminUserId, 'req-owner')).resolves.toEqual([{ id: world.practiceId, practiceId: world.practiceId }]);
    expect(await eventsFor('req-owner')).toEqual([
      {
        actor_id: world.adminUserId,
        actor_kind: 'user',
        action: 'read',
        object_type: 'practice',
        object_id: world.practiceId,
        practice_id: world.practiceId,
        grant_id: null,
        purpose: 'settings_review',
        request_id: 'req-owner',
      },
    ]);
    await auditedPracticeRead(firmUser, 'req-firm');
    expect(await eventsFor('req-firm')).toEqual([expect.objectContaining({ actor_id: firmUser, grant_id: grantId, practice_id: world.practiceId })]);
  });

  it('records a job’s reads as the service actor, and nothing for a read that found nothing', async () => {
    const jobId = randomUUID();
    const rows = await withJobScope(app, { jobId, practiceId: world.practiceId }, (scope) =>
      readWithAudit(scope, { objectType: 'support_grant', purpose: 'expiry_notice', requestId: jobId }, (client) => drizzle(client).select().from(supportGrant), rowTarget),
    );
    expect(rows).toEqual([]);
    expect(await eventsFor(jobId)).toEqual([]);
  });

  it('lets a job record its reads under the policies, as the service actor of its one practice', async () => {
    const jobId = randomUUID();
    await withJobScope(app, { jobId, practiceId: world.practiceId }, (scope) =>
      readWithAudit(
        scope,
        { objectType: 'practice', purpose: 'digest', requestId: jobId },
        (client) => drizzle(client).select({ id: practice.id, practiceId: practice.id }).from(practice),
        rowTarget,
      ),
    );
    expect(await eventsFor(jobId)).toEqual([
      { actor_id: jobId, actor_kind: 'service', action: 'read', object_type: 'practice', object_id: world.practiceId, practice_id: world.practiceId, grant_id: null, purpose: 'digest', request_id: jobId },
    ]);
  });

  it('answers "which users read this object" in one query', async () => {
    await auditedPracticeRead(world.adminUserId, 'req-who-1');
    await auditedPracticeRead(firmUser, 'req-who-2');
    const { rows } = await owner.query<{ actor_id: string }>(
      "SELECT DISTINCT actor_id FROM audit_event WHERE object_type = 'practice' AND object_id = $1 AND action = 'read' AND actor_kind = 'user' ORDER BY actor_id",
      [world.practiceId],
    );
    expect(rows.map((row) => row.actor_id)).toEqual([world.adminUserId, firmUser].sort());
  });
});

describe('the access log', () => {
  it('is readable by the practice’s administrators, inside its scope, and by no one else', async () => {
    await auditedPracticeRead(firmUser, 'req-log');
    const log = (actorId: string, practiceId: string) =>
      withPracticeScope(app, { actorId, practiceIds: [practiceId] }, async (scope) => (await scope.client.query<{ request_id: string }>('SELECT request_id FROM audit_event')).rows);
    expect((await log(world.adminUserId, world.practiceId)).map((row) => row.request_id)).toContain('req-log');
    expect(await log(firmUser, world.practiceId)).toEqual([]);
    expect(await log(other.adminUserId, other.practiceId)).toEqual([]);
    expect(await log(other.adminUserId, world.practiceId)).toEqual([]);
  });

  it('accepts events only for the transaction’s own actor and practices in its scope', async () => {
    const attempt = (actorId: string, practiceId: string | null) =>
      withActor(app, world.adminUserId, (scope) =>
        scope.client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, practice_id, request_id) VALUES ($1, 'user', 'export', 'practice', $2, 'r')", [actorId, practiceId]),
      );
    await expect(attempt(world.adminUserId, null)).resolves.toMatchObject({ rowCount: 1 });
    await expect(attempt(firmUser, null)).rejects.toMatchObject({ code: '42501' });
    await expect(attempt(world.adminUserId, world.practiceId)).rejects.toMatchObject({ code: '42501' });
    await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) =>
      recordAuditEvent(scope, { action: 'settings_changed', objectType: 'practice', objectId: world.practiceId, practiceId: world.practiceId, requestId: 'req-mutation' }),
    );
    expect(await eventsFor('req-mutation')).toEqual([expect.objectContaining({ action: 'settings_changed', grant_id: null })]);
  });

  it('refuses free text in an event', async () => {
    await expect(
      withActor(app, world.adminUserId, (scope) =>
        scope.client.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, purpose) VALUES ($1, 'user', 'read', 'claim', 'reviewing SYNTHETIC TWIN')", [world.adminUserId]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('audit_event is append-only (SEC-10)', () => {
  beforeAll(async () => {
    await auditedPracticeRead(world.adminUserId, 'req-immutable');
  });

  it('refuses UPDATE, DELETE and TRUNCATE by the application role', async () => {
    for (const sql of ["UPDATE audit_event SET purpose = 'changed'", 'DELETE FROM audit_event', 'TRUNCATE audit_event']) {
      await expect(
        withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) => scope.client.query(sql)),
        sql,
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  async function asRole<T>(role: string | null, run: () => Promise<T>): Promise<T> {
    await owner.query('BEGIN');
    try {
      if (role !== null) {
        await owner.query(`SET LOCAL ROLE ${role}`);
      }
      return await run();
    } finally {
      await owner.query('ROLLBACK');
    }
  }

  it('gives the owner no row to update or delete (it has no such policy), and its TRUNCATE hits the trigger', async () => {
    await asRole(OWNER_ROLE, async () => {
      expect((await owner.query("UPDATE audit_event SET purpose = 'changed'")).rowCount).toBe(0);
      expect((await owner.query('DELETE FROM audit_event')).rowCount).toBe(0);
    });
    await asRole(OWNER_ROLE, () => expect(owner.query('TRUNCATE audit_event')).rejects.toThrow(/audit_event is append-only: TRUNCATE is refused/));
  });

  it('refuses UPDATE, DELETE and TRUNCATE by a superuser, whom row-level security does not filter, through the triggers', async () => {
    for (const sql of ["UPDATE audit_event SET purpose = 'changed'", 'DELETE FROM audit_event', 'TRUNCATE audit_event']) {
      await asRole(null, () => expect(owner.query(sql), sql).rejects.toThrow(/audit_event is append-only/));
    }
    expect(await eventsFor('req-immutable')).toHaveLength(1);
  });
});
