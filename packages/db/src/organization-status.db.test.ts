import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { BILLING_ROLE } from './roles';
import { REINSTATEMENT_REASONS, SUSPENSION_REASONS } from './schema';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from './testing';

/**
 * BIL-08, Postgres's part (migration 20261108090000; docs/adr/0080): PaidWhole's suspension is set only through
 * console_set_organization_status, with a reason from a closed list, an internal note and the time, checked in
 * Postgres as well as in the handler; organization_status_rules holds the previous image's direct write to active and
 * suspended, never closed and never the internal organization; the history is PaidWhole's to read; and the two audit
 * actions the setter writes are reserved. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let billing: pg.Pool;
let world: TenantWorld;
let firm: string;
let firmPrincipal: string;
let internal: string;
let platformAdmin: string;
let secondAdmin: string;
let engineer: string;

interface Failure {
  readonly code: string;
  readonly constraint?: string;
  readonly message: string;
}

async function outcome<T>(attempt: Promise<T>): Promise<T | Failure> {
  try {
    return await attempt;
  } catch (error) {
    const { code, constraint, message } = error as { code?: string; constraint?: string; message?: string };
    return { code: code ?? 'error', message: message ?? '', ...(constraint === undefined ? {} : { constraint }) };
  }
}

function setStatus(actorId: string, organizationId: string, from: string, to: string, reason: string | null, note: string | null = null): Promise<boolean> {
  return withActor(app, actorId, async (scope) => {
    const { rows } = await scope.client.query<{ changed: boolean }>('SELECT console_set_organization_status($1, $2, $3, $4, $5) AS changed', [organizationId, from, to, reason, note]);
    return rows[0]?.changed === true;
  });
}

/** Runs `sql` as the application role for `actorId` (no practice in scope), committed. */
function asApp(actorId: string, sql: string, values: unknown[] = []): Promise<pg.QueryResult> {
  return withActor(app, actorId, (scope) => scope.client.query(sql, values));
}

async function organizationRow(id: string): Promise<{ status: string; status_reason: string | null; status_since: Date | null }> {
  const { rows } = await owner.query<{ status: string; status_reason: string | null; status_since: Date | null }>('SELECT status, status_reason, status_since FROM organization WHERE id = $1', [id]);
  const row = rows[0];
  if (row === undefined) {
    throw new Error('no such organization');
  }
  return row;
}

interface Change {
  readonly from_status: string;
  readonly to_status: string;
  readonly reason: string;
  readonly note: string | null;
  readonly changed_by: string;
  readonly at: Date;
}

async function history(id: string): Promise<Change[]> {
  return (
    await owner.query<Change>('SELECT from_status, to_status, reason, note, changed_by, at FROM organization_status_change WHERE organization_id = $1 ORDER BY at, id', [id])
  ).rows;
}

async function reservedActions(id: string): Promise<{ action: string; purpose: string | null; actor_id: string; actor_kind: string }[]> {
  return (
    await owner.query<{ action: string; purpose: string | null; actor_id: string; actor_kind: string }>(
      "SELECT action, purpose, actor_id, actor_kind FROM audit_event WHERE object_type = 'organization' AND object_id = $1 AND action IN ('organization_suspended', 'organization_reinstated') ORDER BY at, id",
      [id],
    )
  ).rows;
}

/** The quoted values of a CHECK constraint's definition, in order. */
async function checkValues(table: string, constraint: string): Promise<string[]> {
  const { rows } = await owner.query<{ definition: string }>('SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2', [table, constraint]);
  return [...(rows[0]?.definition ?? '').matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1] ?? '');
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  billing = new pg.Pool({ connectionString: database.billingUrl, max: 2 });
  world = await createTenantWorld(owner, 'status');
  firm = await createOrganization(owner, 'firm', 'status firm');
  firmPrincipal = await createUser(owner);
  await addMembership(owner, firm, firmPrincipal, 'firm_principal');
  internal = await createOrganization(owner, 'internal');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
  secondAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, secondAdmin, 'platform_admin');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
});

afterAll(async () => {
  await endPool(app);
  await endPool(billing);
  await owner.end();
  await database.drop();
});

describe('the reason lists', () => {
  it('are the database’s CHECKs, and nonpayment is not one of them (D9)', async () => {
    expect(await checkValues('organization', 'organization_status_reason')).toEqual([...SUSPENSION_REASONS]);
    expect(SUSPENSION_REASONS).toEqual(['customer_request', 'security_hold', 'agreement_ended']);
    expect(REINSTATEMENT_REASONS).toEqual(['resolved', 'in_error']);
    const change = await checkValues('organization_status_change', 'organization_status_change_reason');
    expect(change).toEqual(['suspended', ...SUSPENSION_REASONS, 'active', ...REINSTATEMENT_REASONS]);
  });
});

describe('console_set_organization_status (BIL-08)', () => {
  it('suspends with a reason and a note, stamping the time, the history and the reserved action in one now()', async () => {
    expect(await setStatus(platformAdmin, firm, 'active', 'suspended', 'security_hold', '  SYNTHETIC NOTE  ')).toBe(true);
    const row = await organizationRow(firm);
    expect(row).toMatchObject({ status: 'suspended', status_reason: 'security_hold' });
    expect(row.status_since).toBeInstanceOf(Date);
    expect(await history(firm)).toEqual([{ from_status: 'active', to_status: 'suspended', reason: 'security_hold', note: 'SYNTHETIC NOTE', changed_by: platformAdmin, at: row.status_since }]);
    expect(await reservedActions(firm)).toEqual([{ action: 'organization_suspended', purpose: 'security_hold', actor_id: platformAdmin, actor_kind: 'user' }]);
  });

  it('changes nothing for the same reason again without a note', async () => {
    expect(await setStatus(platformAdmin, firm, 'suspended', 'suspended', 'security_hold')).toBe(false);
    expect(await setStatus(platformAdmin, firm, 'suspended', 'suspended', 'security_hold', '   ')).toBe(false);
    expect(await history(firm)).toHaveLength(1);
    expect(await reservedActions(firm)).toHaveLength(1);
  });

  it('records a change of reason by a second administrator and keeps when the suspension began (C3)', async () => {
    const before = await organizationRow(firm);
    expect(await setStatus(secondAdmin, firm, 'suspended', 'suspended', 'agreement_ended')).toBe(true);
    const after = await organizationRow(firm);
    expect(after).toEqual({ status: 'suspended', status_reason: 'agreement_ended', status_since: before.status_since });
    const changes = await history(firm);
    expect(changes.find((change) => change.from_status === 'active' && change.at.getTime() === after.status_since?.getTime())?.changed_by).toBe(platformAdmin);
    expect(changes.at(-1)).toMatchObject({ from_status: 'suspended', to_status: 'suspended', reason: 'agreement_ended', note: null, changed_by: secondAdmin });
    // The same reason with a note is a note added.
    expect(await setStatus(secondAdmin, firm, 'suspended', 'suspended', 'agreement_ended', 'SYNTHETIC SECOND NOTE')).toBe(true);
    expect((await history(firm)).at(-1)).toMatchObject({ reason: 'agreement_ended', note: 'SYNTHETIC SECOND NOTE' });
    expect((await reservedActions(firm)).map((event) => event.action)).toEqual(['organization_suspended', 'organization_suspended', 'organization_suspended']);
  });

  it('refuses a stale status: a suspension never silently replaces another administrator’s (X6)', async () => {
    expect(await outcome(setStatus(platformAdmin, firm, 'active', 'suspended', 'customer_request'))).toMatchObject({ code: '23514', constraint: 'organization_status_changed_meanwhile' });
    expect((await organizationRow(firm)).status_reason).toBe('agreement_ended');
  });

  it('refuses a reason from the wrong list, nonpayment included, and an impossible move (S0)', async () => {
    for (const [from, to, reason] of [
      ['suspended', 'suspended', 'unpaid_invoice'],
      ['suspended', 'suspended', 'resolved'],
      ['suspended', 'active', 'security_hold'],
      ['suspended', 'active', null],
      ['suspended', 'suspended', null],
    ] as const) {
      expect(await outcome(setStatus(platformAdmin, firm, from, to, reason)), `${from} ${to} ${String(reason)}`).toMatchObject({ code: '23514', constraint: 'organization_status_change_reason' });
    }
    const group = world.organizationId;
    for (const [from, to, reason] of [
      ['active', 'suspended', 'unpaid_invoice'],
      ['active', 'suspended', 'in_error'],
      ['active', 'active', 'resolved'],
    ] as const) {
      expect(await outcome(setStatus(platformAdmin, group, from, to, reason)), `${from} ${to} ${reason}`).toMatchObject({ code: '23514', constraint: 'organization_status_change_reason' });
    }
    expect(await outcome(setStatus(platformAdmin, firm, 'suspended', 'suspended', 'security_hold', 'x'.repeat(501)))).toMatchObject({ code: '23514', constraint: 'organization_status_change_note' });
    expect(await outcome(setStatus(platformAdmin, firm, 'suspended', 'suspended', 'security_hold', 'SYNTHETIC\nLINE'))).toMatchObject({ code: '23514', constraint: 'organization_status_change_note' });
    expect((await organizationRow(firm)).status_reason).toBe('agreement_ended');
  });

  it('reinstates with a reinstatement reason, clears the reason and records organization_reinstated; reinstating an active one is a no-op', async () => {
    expect(await setStatus(platformAdmin, firm, 'suspended', 'active', 'resolved')).toBe(true);
    const row = await organizationRow(firm);
    expect(row).toMatchObject({ status: 'active', status_reason: null });
    expect((await history(firm)).at(-1)).toEqual({ from_status: 'suspended', to_status: 'active', reason: 'resolved', note: null, changed_by: platformAdmin, at: row.status_since });
    expect((await reservedActions(firm)).at(-1)).toEqual({ action: 'organization_reinstated', purpose: 'resolved', actor_id: platformAdmin, actor_kind: 'user' });
    const changes = (await history(firm)).length;
    expect(await setStatus(platformAdmin, firm, 'suspended', 'active', 'in_error')).toBe(false);
    expect(await history(firm)).toHaveLength(changes);
  });

  it('refuses anyone but a platform administrator in person: a job’s actor, a customer administrator, a support engineer', async () => {
    for (const actor of [randomUUID(), world.adminUserId, firmPrincipal, engineer]) {
      expect(await outcome(setStatus(actor, firm, 'active', 'suspended', 'customer_request'))).toMatchObject({
        code: '42501',
        message: 'only a platform administrator suspends or reinstates an organization',
      });
    }
    expect((await organizationRow(firm)).status).toBe('active');
  });

  it('refuses a closed organization, the internal one and a missing one', async () => {
    const closed = await createOrganization(owner, 'group', 'closed');
    await owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [closed]);
    for (const [from, to, reason] of [
      ['active', 'suspended', 'customer_request'],
      ['suspended', 'active', 'resolved'],
      ['closed', 'active', 'resolved'],
    ] as const) {
      expect(await outcome(setStatus(platformAdmin, closed, from, to, reason))).toMatchObject({ code: '23514', constraint: 'organization_closed_by_closure_only' });
    }
    expect(await outcome(setStatus(platformAdmin, internal, 'active', 'suspended', 'security_hold'))).toMatchObject({ code: 'P0002' });
    expect(await outcome(setStatus(platformAdmin, randomUUID(), 'active', 'suspended', 'security_hold'))).toMatchObject({ code: 'P0002' });
  });
});

describe('organization_status_rules, without the handler (BIL-08, D11)', () => {
  it('lets the previous image’s direct suspend and reinstate through, stamping the time and no reason', async () => {
    const target = await createOrganization(owner, 'group', 'direct');
    await asApp(platformAdmin, "UPDATE organization SET status = 'suspended' WHERE id = $1", [target]);
    const suspended = await organizationRow(target);
    expect(suspended).toMatchObject({ status: 'suspended', status_reason: null });
    expect(suspended.status_since).toBeInstanceOf(Date);
    expect(await history(target)).toEqual([]);
    await asApp(platformAdmin, "UPDATE organization SET status = 'active' WHERE id = $1", [target]);
    const active = await organizationRow(target);
    expect(active.status).toBe('active');
    expect(active.status_since?.getTime()).toBeGreaterThanOrEqual(suspended.status_since?.getTime() ?? 0);
  });

  it('refuses closing, reopening and suspending the internal organization as the application role', async () => {
    const target = await createOrganization(owner, 'group', 'never closed');
    expect(await outcome(asApp(platformAdmin, "UPDATE organization SET status = 'closed' WHERE id = $1", [target]))).toMatchObject({
      code: '23514',
      constraint: 'organization_closed_by_closure_only',
      message: 'a closed organization stays closed, and only its closure closes one',
    });
    const closed = await createOrganization(owner, 'group', 'reopened');
    await owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [closed]);
    expect(await outcome(asApp(platformAdmin, "UPDATE organization SET status = 'active' WHERE id = $1", [closed]))).toMatchObject({ code: '23514', constraint: 'organization_closed_by_closure_only' });
    expect(await outcome(asApp(platformAdmin, "UPDATE organization SET status = 'suspended' WHERE id = $1", [internal]))).toMatchObject({ code: '23514', constraint: 'organization_internal_active' });
    // Not even the owner suspends the internal organization.
    expect(await outcome(owner.query("UPDATE organization SET status = 'suspended' WHERE id = $1", [internal]))).toMatchObject({ code: '23514', constraint: 'organization_internal_active' });
  });

  it('gives the application role no write of the reason or the time', async () => {
    for (const sql of ["UPDATE organization SET status_reason = 'security_hold' WHERE id = $1", 'UPDATE organization SET status_since = now() WHERE id = $1']) {
      expect(await outcome(asApp(platformAdmin, sql, [firm])), sql).toMatchObject({ code: '42501' });
    }
  });

  it('lets the application role create only active organizations, and the owner a suspended one with its time', async () => {
    expect(await outcome(asApp(platformAdmin, "INSERT INTO organization (id, kind, name, status) VALUES ($1, 'group', 'SYNTHETIC HELD AT BIRTH', 'suspended')", [randomUUID()]))).toMatchObject({
      code: '23514',
      constraint: 'organization_created_active',
    });
    const created = randomUUID();
    await asApp(platformAdmin, "INSERT INTO organization (id, kind, name) VALUES ($1, 'group', 'SYNTHETIC CREATED')", [created]);
    expect(await organizationRow(created)).toEqual({ status: 'active', status_reason: null, status_since: null });
    const seeded = randomUUID();
    await owner.query("INSERT INTO organization (id, kind, name, status, status_reason) VALUES ($1, 'group', 'SYNTHETIC SEEDED', 'suspended', 'customer_request')", [seeded]);
    const row = await organizationRow(seeded);
    expect(row).toMatchObject({ status: 'suspended', status_reason: 'customer_request' });
    expect(row.status_since).toBeInstanceOf(Date);
    // A reason belongs to a suspension alone.
    await owner.query("UPDATE organization SET status = 'active' WHERE id = $1", [seeded]);
    expect((await organizationRow(seeded)).status_reason).toBeNull();
  });

  it('refuses the setter’s reserved actions to the application role (organization_suspended, organization_reinstated)', async () => {
    for (const action of ['organization_suspended', 'organization_reinstated']) {
      for (const kind of ['user', 'service']) {
        expect(
          await outcome(asApp(platformAdmin, "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, $2, $3, 'organization', $4, 'resolved')", [platformAdmin, kind, action, firm])),
          `${kind} ${action}`,
        ).toMatchObject({ code: '42501' });
      }
    }
  });
});

describe('organization_status_change (BIL-08)', () => {
  it('is read by platform administrators alone, never by a customer or billing, and written by nobody through the application role', async () => {
    const read = (actorId: string) =>
      withPracticeScope(app, { actorId, practiceIds: [world.practiceId] }, async (scope) => (await scope.client.query('SELECT * FROM organization_status_change')).rowCount);
    expect(await read(world.adminUserId)).toBe(0);
    expect(await read(firmPrincipal)).toBe(0);
    expect(await withActor(app, engineer, async (scope) => (await scope.client.query('SELECT * FROM organization_status_change')).rowCount)).toBe(0);
    const total = Number((await owner.query<{ n: string }>('SELECT count(*) AS n FROM organization_status_change')).rows[0]?.n);
    expect(total).toBeGreaterThan(0);
    expect(await withActor(app, platformAdmin, async (scope) => (await scope.client.query('SELECT * FROM organization_status_change')).rowCount)).toBe(total);
    expect(
      await outcome(
        asApp(platformAdmin, "INSERT INTO organization_status_change (organization_id, from_status, to_status, reason, changed_by) VALUES ($1, 'active', 'suspended', 'security_hold', $2)", [
          firm,
          platformAdmin,
        ]),
      ),
    ).toMatchObject({ code: '42501' });
    const client = await billing.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${BILLING_ROLE}`);
      expect((await client.query('SELECT status_reason, status_since FROM organization WHERE id = $1', [firm])).rows).toHaveLength(1);
      await client.query('SAVEPOINT history');
      expect(await outcome(client.query('SELECT * FROM organization_status_change'))).toMatchObject({ code: '42501' });
      await client.query('ROLLBACK TO SAVEPOINT history');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('is append-only, even for the owner', async () => {
    expect(await outcome(owner.query("UPDATE organization_status_change SET note = 'SYNTHETIC' WHERE organization_id = $1", [firm]))).toMatchObject({ code: 'P0001' });
    expect(await outcome(owner.query('DELETE FROM organization_status_change WHERE organization_id = $1', [firm]))).toMatchObject({ code: 'P0001' });
    expect(await outcome(owner.query('TRUNCATE organization_status_change'))).toMatchObject({ code: 'P0001' });
  });
});
