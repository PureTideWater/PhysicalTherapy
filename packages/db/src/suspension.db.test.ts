import { randomBytes, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withJobScope, withPracticeScope } from './authz';
import { readDatabaseUrl } from './config';
import { OWNER_ROLE } from './roles';
import {
  type MigratedDatabase,
  type Row,
  RowFactory,
  type TenantWorld,
  addMembership,
  asOwner,
  createMigratedDatabase,
  createOrganization,
  createPracticeWithLocation,
  createTenantWorld,
  createUser,
  endPool,
  placeholderDataKeyRef,
} from './testing';

/**
 * BIL-07, the database's part (migration 20261108090000; docs/adr/0080): a suspended or closed organization's people
 * start no new work through its grants. The hold is per permission over the person's unheld roles, decided once in
 * practice_work_hold and asked by the route (practice_run_refusal_for, with the route's permission), the page
 * (practice_run_hold) and the trigger (refuse_new_work_while_suspended, with the permission of the table it guards).
 * Jobs, the practice's own staff and every other grantee carry on; the owner's hold still stops everyone, and someone
 * outside the owning organization learns that new work is on hold, never why (D6). Synthetic data only.
 *
 * The people at practice P (owned by group G), with F suspended by PaidWhole for a security hold:
 * fp, F's principal alone; X, G's practice administrator and F's principal; Y, F's principal and a viewer in F2,
 * whose grant gives viewers only; Z, G's analyst and F's principal; W, G's analyst and F's analyst; staff, G's
 * billing manager. A job's actor is never a person.
 */

const R1 = 'PaidWhole has suspended your organization, so no new work starts at this practice until PaidWhole reinstates your organization; everything here stays readable';
const R2 = "the practice's organization is closed, so no new work starts here; everything here stays readable";
const R3 = 'an invoice of your organization has been unpaid for 30 days since its payment failed, so no new work starts at this practice until it is paid; everything here stays readable';
const R4 =
  "PaidWhole has suspended your organization, so you start no new work here through its grant until PaidWhole reinstates your organization; you can still read this practice's records";
const R5 = 'your organization is closed, so you start no new work here through its grant';
const R6 = "the PaidWhole account of the practice's organization is on hold, so no new work starts here; everything here stays readable";

const RUN_STARTING = ['mapping.edit', 'case.work', 'posting.reconcile', 'phi.export', 'file.upload'] as const;
type Permission = (typeof RUN_STARTING)[number];

/** D17: the permission each guarded table's writer needs (digest: none, which means any stopped permission). */
const TABLE_PERMISSION: Readonly<Record<string, Permission | null>> = {
  pricing_run: 'mapping.edit',
  audit_report: 'case.work',
  report_document: 'case.work',
  roi_statement: 'posting.reconcile',
  source_document: 'file.upload',
  packet_version: 'phi.export',
  digest: null,
};

/** The trigger tables a person writes, each built once by the house row factory while nothing is held. */
const PERSON_TABLES = ['source_document', 'pricing_run', 'audit_report', 'report_document', 'roi_statement'] as const;

let database: MigratedDatabase;
let owner: pg.Client;
let app: pg.Pool;
let worker: pg.Pool;
let factory: RowFactory;
let world: TenantWorld;
let firm: string;
let viewerFirm: string;
let platformAdmin: string;
const people: Record<'fp' | 'X' | 'Y' | 'Z' | 'W' | 'staff' | 'viewer', string> = { fp: '', X: '', Y: '', Z: '', W: '', staff: '', viewer: '' };
const probes = new Map<string, { values: Row; actorId: string }>();

interface Failure {
  readonly code: string;
  readonly message: string;
}

async function outcome(attempt: Promise<unknown>): Promise<'accepted' | Failure> {
  try {
    await attempt;
    return 'accepted';
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    return { code: code ?? 'error', message: message ?? '' };
  }
}

async function engagementGrant(firmId: string, target: TenantWorld | { practiceId: string; adminUserId: string }, roles: readonly string[]): Promise<string> {
  const agreementId = randomUUID();
  const grantId = randomUUID();
  await asOwner(owner, [target.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [agreementId, firmId, target.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, $4, now() + interval '30 days', $5, $6)`,
      [grantId, firmId, target.practiceId, JSON.stringify({ roles }), target.adminUserId, agreementId],
    );
  });
  return grantId;
}

async function member(organizationId: string, role: Parameters<typeof addMembership>[3], userId?: string): Promise<string> {
  const id = userId ?? (await createUser(owner));
  await addMembership(owner, organizationId, id, role);
  return id;
}

function asPerson<T>(actorId: string, practiceId: string, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withPracticeScope(app, { actorId, practiceIds: [practiceId] }, (scope) => run(scope.client));
}

function asJob<T>(practiceId: string, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withJobScope(worker, { jobId: randomUUID(), practiceId }, (scope) => run(scope.client));
}

async function refusal(client: pg.PoolClient, practiceId: string, wanted?: string): Promise<string | null> {
  const { rows } =
    wanted === undefined
      ? await client.query<{ reason: string | null }>('SELECT practice_run_refusal($1) AS reason', [practiceId])
      : await client.query<{ reason: string | null }>('SELECT practice_run_refusal_for($1, $2) AS reason', [practiceId, wanted]);
  return rows[0]?.reason ?? null;
}

interface Hold {
  readonly source: string;
  readonly organization_id: string;
  readonly organization_kind: string;
  readonly cause: string;
  readonly reason: string | null;
  readonly since: Date | null;
  readonly stopped: string[] | null;
}

async function hold(client: pg.PoolClient, practiceId: string): Promise<Hold[]> {
  return (await client.query<Hold>('SELECT * FROM practice_run_hold($1)', [practiceId])).rows;
}

async function setStatus(actorId: string, organizationId: string, from: string, to: string, reason: string, note: string | null = null): Promise<boolean> {
  return withActor(app, actorId, async (scope) => {
    const { rows } = await scope.client.query<{ changed: boolean }>('SELECT console_set_organization_status($1, $2, $3, $4, $5) AS changed', [organizationId, from, to, reason, note]);
    return rows[0]?.changed === true;
  });
}

async function statusSince(organizationId: string): Promise<Date | null> {
  const { rows } = await owner.query<{ since: Date | null }>('SELECT status_since AS since FROM organization WHERE id = $1', [organizationId]);
  return rows[0]?.since ?? null;
}

/** Inserts the row factory's probe of `table` as `actorId` (a person or a job's ID) in P's scope, rolled back: what the trigger decides. */
async function insertAs(table: string, actorId: string, practiceId = world.practiceId): Promise<'accepted' | Failure> {
  const probe = probes.get(table);
  if (probe === undefined) {
    throw new Error(`no probe of ${table}`);
  }
  // The row names its writer as the one who writes it (the tables' own rules check it after the hold's trigger).
  const values = Object.fromEntries(Object.entries(probe.values).map(([column, value]) => [column, value === probe.actorId ? actorId : value]));
  const columns = Object.keys(values);
  await owner.query('BEGIN');
  try {
    await owner.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await owner.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${practiceId}}`, actorId]);
    return await outcome(
      owner.query(
        `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`,
        Object.values(values),
      ),
    );
  } finally {
    await owner.query('ROLLBACK');
  }
}

/** A top-level upload as the application role, in the person's own request scope (the upload route's insert, uploads.ts). */
async function uploadAs(actorId: string, practiceId = world.practiceId): Promise<'accepted' | Failure> {
  return outcome(
    asPerson(actorId, practiceId, (client) =>
      client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', 100, 'text/plain', app_actor_id())", [
        randomUUID(),
        practiceId,
      ]),
    ),
  );
}

const refused = (sentence: string) => ({ code: '55000', message: sentence });

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  worker = new pg.Pool({ connectionString: database.workerUrl, max: 2 });
  factory = await RowFactory.load(owner);
  world = await createTenantWorld(owner, 'held');
  firm = await createOrganization(owner, 'firm', 'held firm');
  viewerFirm = await createOrganization(owner, 'firm', 'viewer firm');
  await engagementGrant(firm, world, ['firm_principal', 'firm_analyst']);
  await engagementGrant(viewerFirm, world, ['viewer']);
  people.fp = await member(firm, 'firm_principal');
  people.X = await member(world.organizationId, 'practice_admin');
  await member(firm, 'firm_principal', people.X);
  people.Y = await member(firm, 'firm_principal');
  await member(viewerFirm, 'viewer', people.Y);
  people.Z = await member(world.organizationId, 'analyst');
  await member(firm, 'firm_principal', people.Z);
  people.W = await member(world.organizationId, 'analyst');
  await member(firm, 'firm_analyst', people.W);
  people.staff = await member(world.organizationId, 'billing_manager');
  people.viewer = await member(world.organizationId, 'viewer');
  await member(firm, 'firm_principal', people.viewer);
  const internal = await createOrganization(owner, 'internal');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
  // The pricing run last: the other probes' own pricing runs publish rule releases, and a run pins the newest.
  for (const table of ['source_document', 'audit_report', 'report_document', 'roi_statement', 'digest', 'pricing_run']) {
    const built = await factory.build(owner, table, world);
    probes.set(table, { values: built.values, actorId: built.actorId });
  }
});

afterAll(async () => {
  await endPool(app);
  await endPool(worker);
  await owner.end();
  await database.drop();
});

describe('the run-starting permissions', () => {
  it('are the five of the run-starting routes, in the order the words list them, and only the owner may call the list', async () => {
    const { rows } = await owner.query<{ list: string[] }>('SELECT run_starting_permissions() AS list');
    expect(rows[0]?.list).toEqual([...RUN_STARTING]);
  });
});

describe('a grantee suspended by PaidWhole (BIL-07)', () => {
  const STOPPED: Readonly<Record<'fp' | 'X' | 'Y' | 'Z' | 'W' | 'staff', readonly Permission[]>> = {
    fp: RUN_STARTING,
    X: RUN_STARTING,
    // phi.export: the viewer role denies it, so it was never allowed and is not stopped.
    Y: ['mapping.edit', 'case.work', 'posting.reconcile', 'file.upload'],
    // case.work and file.upload: the group's analyst role allows them.
    Z: ['mapping.edit', 'posting.reconcile', 'phi.export'],
    W: [],
    staff: [],
  };

  it('refuses nobody before the suspension (P1: today a suspended firm is not refused either)', async () => {
    for (const person of ['fp', 'X', 'Y', 'Z', 'W', 'staff'] as const) {
      expect(await asPerson(people[person], world.practiceId, (client) => refusal(client, world.practiceId)), person).toBeNull();
    }
  });

  it('stops, for each person, exactly the run-starting work their unheld roles do not allow (Q1 to Q6)', async () => {
    expect(await setStatus(platformAdmin, firm, 'active', 'suspended', 'security_hold')).toBe(true);
    const since = await statusSince(firm);
    expect(since).toBeInstanceOf(Date);
    for (const [person, stopped] of Object.entries(STOPPED) as [keyof typeof STOPPED, readonly Permission[]][]) {
      await asPerson(people[person], world.practiceId, async (client) => {
        expect(await refusal(client, world.practiceId), person).toBe(stopped.length > 0 ? R4 : null);
        for (const wanted of RUN_STARTING) {
          expect(await refusal(client, world.practiceId, wanted), `${person} ${wanted}`).toBe(stopped.includes(wanted) ? R4 : null);
        }
        expect(await hold(client, world.practiceId), person).toEqual(
          stopped.length > 0
            ? [{ source: 'grantee', organization_id: firm, organization_kind: 'firm', cause: 'suspended', reason: 'security_hold', since, stopped: [...stopped] }]
            : [],
        );
      });
    }
  });

  it('refuses a permission outside the run-starting list as a parameter error (V1)', async () => {
    for (const wanted of ['grant.approve', 'organization.manage', null]) {
      expect(await outcome(asPerson(people.fp, world.practiceId, (client) => client.query('SELECT practice_run_refusal_for($1, $2)', [world.practiceId, wanted]))), String(wanted)).toMatchObject({
        code: '22023',
      });
    }
  });

  it('holds nothing in a job’s scope: a job is the practice’s work, never the grantee’s (J1)', async () => {
    await asJob(world.practiceId, async (client) => {
      expect(await refusal(client, world.practiceId)).toBeNull();
      for (const wanted of RUN_STARTING) {
        expect(await refusal(client, world.practiceId, wanted)).toBeNull();
      }
      expect(await hold(client, world.practiceId)).toEqual([]);
    });
  });

  it('refuses, at each trigger table a person writes, exactly the held people whose unheld roles lack its permission', async () => {
    for (const table of PERSON_TABLES) {
      const wanted = TABLE_PERMISSION[table] as Permission;
      for (const person of ['fp', 'X', 'Y', 'Z', 'W', 'staff'] as const) {
        const result = await insertAs(table, people[person]);
        if (STOPPED[person].includes(wanted)) {
          expect(result, `${person} ${table}`).toEqual(refused(R4));
        } else if (person === 'W' && !['case.work', 'file.upload'].includes(wanted)) {
          // W's roles never allowed it: the hold takes nothing away, and the table's own rules and policies decide it as before.
          expect(result, `${person} ${table}`).not.toMatchObject({ code: '55000' });
        } else {
          expect(result, `${person} ${table}`).toBe('accepted');
        }
      }
      // A job passes the hold; whether it may write a person's table at all is that table's own rule.
      expect(await insertAs(table, randomUUID()), `a job ${table}`).not.toMatchObject({ code: '55000' });
    }
    expect(await insertAs('digest', randomUUID()), 'a job’s digest').toBe('accepted');
  });

  it('refuses a held person’s upload through the application role, before its policies, and records the others’ (P2, Q4)', async () => {
    expect(await uploadAs(people.fp)).toEqual(refused(R4));
    expect(await uploadAs(people.X)).toEqual(refused(R4));
    expect(await uploadAs(people.Z)).toBe('accepted');
    expect(await uploadAs(people.staff)).toBe('accepted');
  });

  it('takes the permission from the table it guards, and raises on a table it names no permission for (D17)', async () => {
    // A viewer of G and F's principal: the unheld viewer role is given exactly one run-starting permission at a time, in a
    // transaction rolled back, so each table name is refused unless its permission is that one (digest: refused while
    // anything is stopped). The tables are scratch tables of the same names, so no row of the real ones is needed.
    await owner.query('BEGIN');
    try {
      for (const name of Object.keys(TABLE_PERMISSION)) {
        await owner.query(`CREATE TEMP TABLE ${name} (practice_id uuid NOT NULL) ON COMMIT DROP`);
        await owner.query(`CREATE TRIGGER ${name}_probe BEFORE INSERT ON pg_temp.${name} FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()`);
      }
      await owner.query('CREATE TEMP TABLE scratch_unnamed (practice_id uuid NOT NULL) ON COMMIT DROP');
      await owner.query('CREATE TRIGGER scratch_unnamed_probe BEFORE INSERT ON pg_temp.scratch_unnamed FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended()');
      await owner.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [people.viewer, `{${world.practiceId}}`]);
      const attempt = async (name: string): Promise<'accepted' | Failure> => {
        await owner.query('SAVEPOINT probe');
        const result = await outcome(owner.query(`INSERT INTO pg_temp.${name} (practice_id) VALUES ($1)`, [world.practiceId]));
        await owner.query('ROLLBACK TO SAVEPOINT probe');
        return result;
      };
      // The viewer role's own deny of phi.export goes too, so that the union of roles allows every one.
      await owner.query("DELETE FROM role_permission WHERE role = 'viewer' AND action = ANY ($1::text[])", [[...RUN_STARTING]]);
      for (const given of RUN_STARTING) {
        await owner.query('SAVEPOINT permission');
        await owner.query("INSERT INTO role_permission (role, action, effect) VALUES ('viewer', $1, 'allow')", [given]);
        for (const [name, wanted] of Object.entries(TABLE_PERMISSION)) {
          expect(await attempt(name), `${given} ${name}`).toEqual(wanted === given ? 'accepted' : refused(R4));
        }
        expect(await attempt('scratch_unnamed'), given).toMatchObject({ code: 'XX000', message: 'refuse_new_work_while_suspended names no permission for scratch_unnamed' });
        await owner.query('ROLLBACK TO SAVEPOINT permission');
      }
    } finally {
      await owner.query('ROLLBACK');
    }
  });

  it('lists the grantee’s status, never its reason, on the practice’s grants', async () => {
    const grants = await asPerson(world.adminUserId, world.practiceId, async (client) => (await client.query<{ grantee_kind: string; grantee_status: string }>('SELECT * FROM practice_grants($1)', [world.practiceId])).rows);
    expect(grants.map((grant) => grant.grantee_status).sort()).toEqual(['active', 'suspended']);
    expect(Object.keys(grants[0] ?? {}).at(-1)).toBe('grantee_status');
    expect(Object.keys(grants[0] ?? {})).not.toContain('status_reason');
  });
});

describe('the owner’s hold, over a grantee’s (BIL-07, D6)', () => {
  it('stops everyone for PaidWhole’s suspension of the group, and tells only the group’s members why (O2, E3)', async () => {
    expect(await setStatus(platformAdmin, world.organizationId, 'active', 'suspended', 'customer_request')).toBe(true);
    const since = await statusSince(world.organizationId);
    for (const person of ['staff', 'Z', 'X'] as const) {
      await asPerson(people[person], world.practiceId, async (client) => {
        expect(await hold(client, world.practiceId), person).toEqual([
          { source: 'owner', organization_id: world.organizationId, organization_kind: 'group', cause: 'suspended', reason: 'customer_request', since, stopped: null },
        ]);
        expect(await refusal(client, world.practiceId), person).toBe(R1);
        expect(await refusal(client, world.practiceId, 'file.upload'), person).toBe(R1);
      });
    }
    // F's principal is held by F too: the owner's hold wins, with no reason.
    await asPerson(people.fp, world.practiceId, async (client) => {
      expect(await hold(client, world.practiceId)).toEqual([{ source: 'owner', organization_id: world.organizationId, organization_kind: 'group', cause: 'on_hold', reason: null, since, stopped: null }]);
      expect(await refusal(client, world.practiceId, 'mapping.edit')).toBe(R6);
    });
    await asJob(world.practiceId, async (client) => {
      expect(await hold(client, world.practiceId)).toEqual([{ source: 'owner', organization_id: world.organizationId, organization_kind: 'group', cause: 'on_hold', reason: null, since, stopped: null }]);
      expect(await refusal(client, world.practiceId)).toBe(R6);
    });
    for (const table of PERSON_TABLES) {
      expect(await insertAs(table, people.staff), table).toEqual(refused(R1));
      expect(await insertAs(table, people.fp), table).toEqual(refused(R6));
      expect(await insertAs(table, randomUUID()), table).toEqual(refused(R6));
    }
    expect(await insertAs('digest', randomUUID())).toEqual(refused(R6));
  });

  it('lifts at once when PaidWhole reinstates the group, and the grantee’s hold applies again', async () => {
    expect(await setStatus(platformAdmin, world.organizationId, 'suspended', 'active', 'resolved')).toBe(true);
    await asPerson(people.staff, world.practiceId, async (client) => {
      expect(await refusal(client, world.practiceId)).toBeNull();
    });
    await asPerson(people.fp, world.practiceId, async (client) => {
      expect(await refusal(client, world.practiceId)).toBe(R4);
    });
    expect(await insertAs('digest', randomUUID())).toBe('accepted');
  });

  it('says closed to everyone, members and others alike (R2)', async () => {
    const closed = await createTenantWorld(owner, 'closed owner');
    const outsiderFirm = await createOrganization(owner, 'firm', 'closed owner firm');
    const outsider = await member(outsiderFirm, 'firm_principal');
    await engagementGrant(outsiderFirm, closed, ['firm_principal']);
    await owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [closed.organizationId]);
    const since = await statusSince(closed.organizationId);
    for (const person of [closed.adminUserId, outsider]) {
      await asPerson(person, closed.practiceId, async (client) => {
        expect(await hold(client, closed.practiceId)).toEqual([{ source: 'owner', organization_id: closed.organizationId, organization_kind: 'group', cause: 'closed', reason: null, since, stopped: null }]);
        expect(await refusal(client, closed.practiceId, 'file.upload')).toBe(R2);
      });
    }
  });

  it('tells a member of a group held for nonpayment that an invoice is unpaid, and anyone else only that the account is on hold (O4, O5)', async () => {
    const arrears = await createTenantWorld(owner, 'arrears');
    const activeFirm = await createOrganization(owner, 'firm', 'arrears firm');
    const outsider = await member(activeFirm, 'firm_principal');
    await engagementGrant(activeFirm, arrears, ['firm_principal']);
    const ref = `cus_hold${randomBytes(6).toString('hex')}`;
    await owner.query('UPDATE organization SET billing_customer_ref = $2 WHERE id = $1', [arrears.organizationId, ref]);
    await owner.query(
      `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents,
         attempt_count, first_failed_at, last_failure_code, stripe_event_at)
       VALUES ($1, $2, $3, 'audit', 'open', 'usd', 250000, 0, 250000, 1, now() - interval '31 days', 'insufficient_funds', now() - interval '31 days')`,
      [arrears.organizationId, `in_hold${randomBytes(6).toString('hex')}`, ref],
    );
    const { rows } = await owner.query<{ since: Date }>('SELECT suspended_since AS since FROM billing_standing WHERE organization_id = $1', [arrears.organizationId]);
    const since = rows[0]?.since ?? null;
    await asPerson(arrears.adminUserId, arrears.practiceId, async (client) => {
      expect(await hold(client, arrears.practiceId)).toEqual([{ source: 'owner', organization_id: arrears.organizationId, organization_kind: 'group', cause: 'nonpayment', reason: null, since, stopped: null }]);
      expect(await refusal(client, arrears.practiceId)).toBe(R3);
    });
    await asPerson(outsider, arrears.practiceId, async (client) => {
      expect(await hold(client, arrears.practiceId)).toEqual([{ source: 'owner', organization_id: arrears.organizationId, organization_kind: 'group', cause: 'on_hold', reason: null, since, stopped: null }]);
      expect(await refusal(client, arrears.practiceId, 'mapping.edit')).toBe(R6);
    });
    await asJob(arrears.practiceId, async (client) => {
      expect(await refusal(client, arrears.practiceId)).toBe(R6);
    });
    expect(await uploadAs(arrears.adminUserId, arrears.practiceId)).toMatchObject({ code: '55000' });
    expect(await uploadAs(outsider, arrears.practiceId)).toEqual(refused(R6));
  });
});

describe('a grantee’s hold, at its edges (BIL-07)', () => {
  it('gives R5 for a closed grantee, with no reason', async () => {
    const closedFirm = await createOrganization(owner, 'firm', 'closed firm');
    const principal = await member(closedFirm, 'firm_principal');
    await engagementGrant(closedFirm, world, ['firm_principal']);
    await owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [closedFirm]);
    const since = await statusSince(closedFirm);
    await asPerson(principal, world.practiceId, async (client) => {
      expect(await hold(client, world.practiceId)).toEqual([{ source: 'grantee', organization_id: closedFirm, organization_kind: 'firm', cause: 'closed', reason: null, since, stopped: [...RUN_STARTING] }]);
      expect(await refusal(client, world.practiceId, 'phi.export')).toBe(R5);
    });
  });

  it('reads the grantee’s status alone: a firm whose invoice is unpaid for 30 days holds nothing where it is granted', async () => {
    const owingFirm = await createOrganization(owner, 'firm', 'owing firm');
    const principal = await member(owingFirm, 'firm_principal');
    await engagementGrant(owingFirm, world, ['firm_principal']);
    const ref = `cus_firm${randomBytes(6).toString('hex')}`;
    await owner.query('UPDATE organization SET billing_customer_ref = $2 WHERE id = $1', [owingFirm, ref]);
    await owner.query(
      `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents,
         attempt_count, first_failed_at, last_failure_code, stripe_event_at)
       VALUES ($1, $2, $3, 'audit', 'open', 'usd', 250000, 0, 250000, 1, now() - interval '40 days', 'insufficient_funds', now() - interval '40 days')`,
      [owingFirm, `in_firm${randomBytes(6).toString('hex')}`, ref],
    );
    await asPerson(principal, world.practiceId, async (client) => {
      expect(await hold(client, world.practiceId)).toEqual([]);
      expect(await refusal(client, world.practiceId, 'mapping.edit')).toBeNull();
    });
  });

  it('takes the practice out of the person’s scope once the grant is revoked (insufficient_privilege)', async () => {
    const revokedFirm = await createOrganization(owner, 'firm', 'revoked firm');
    const principal = await member(revokedFirm, 'firm_principal');
    const grantId = await engagementGrant(revokedFirm, world, ['firm_principal']);
    expect(await setStatus(platformAdmin, revokedFirm, 'active', 'suspended', 'agreement_ended')).toBe(true);
    await asPerson(world.adminUserId, world.practiceId, (client) => client.query('UPDATE "grant" SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [grantId, world.adminUserId]));
    for (const sql of ['SELECT practice_run_refusal($1)', "SELECT practice_run_refusal_for($1, 'file.upload')", 'SELECT * FROM practice_run_hold($1)']) {
      expect(await outcome(asPerson(principal, world.practiceId, (client) => client.query(sql, [world.practiceId]))), sql).toMatchObject({ code: '42501' });
    }
  });

  it('answers a firm principal granted 2,000 practices within 100 ms (capacity)', async () => {
    const group = await createOrganization(owner, 'group', 'capacity');
    const admin = await member(group, 'practice_admin');
    const wideFirm = await createOrganization(owner, 'firm', 'capacity firm');
    const principal = await member(wideFirm, 'firm_principal');
    const ids = Array.from({ length: 2000 }, () => randomUUID());
    await asOwner(owner, ids, async () => {
      for (const id of ids) {
        await createPracticeWithLocation(owner, { id, organizationId: group, name: 'SYNTHETIC CAPACITY PRACTICE', dataKeyRef: placeholderDataKeyRef() });
      }
      await owner.query(
        `WITH a AS (
           INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           SELECT $1, p, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', md5(p::text) || md5(p::text) FROM unnest($2::uuid[]) p
           RETURNING id, practice_id)
         INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
         SELECT $1, a.practice_id, '{"roles":["firm_principal"]}', now() + interval '30 days', $3, a.id FROM a`,
        [wideFirm, ids, admin],
      );
    });
    expect(await setStatus(platformAdmin, wideFirm, 'active', 'suspended', 'security_hold')).toBe(true);
    const target = ids[1234] ?? '';
    const timings: number[] = [];
    await asPerson(principal, target, async (client) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const started = performance.now();
        expect(await refusal(client, target, 'mapping.edit')).toBe(R4);
        timings.push(performance.now() - started);
      }
    });
    expect(Math.min(...timings)).toBeLessThan(100);
  }, 120_000);
});

describe('the functions’ privileges (BIL-07 catalog)', () => {
  const NEW_DEFINERS = ['practice_work_hold(uuid)', 'practice_work_refusal(uuid,text)', 'practice_run_refusal_for(uuid,text)', 'practice_run_hold(uuid)', 'console_set_organization_status(uuid,text,text,text,text)'];

  it('keeps the decision to the owner: the application calls only the route’s, the page’s and the setter’s', async () => {
    const roles = ['tp_app', 'tp_billing', 'tp_operator', 'tp_screening', 'tp_esign', 'tp_job'];
    const expected: Readonly<Record<string, readonly string[]>> = {
      'run_starting_permissions()': [],
      'practice_work_hold(uuid)': [],
      'practice_work_refusal(uuid,text)': [],
      'practice_run_refusal(uuid)': ['tp_app'],
      'practice_run_refusal_for(uuid,text)': ['tp_app'],
      'practice_run_hold(uuid)': ['tp_app'],
      'console_set_organization_status(uuid,text,text,text,text)': ['tp_app'],
      'practice_grants(uuid)': ['tp_app'],
      'packet_export_refusal_codes()': ['tp_app'],
      'refuse_new_work_while_suspended()': [],
      'organization_status_rules()': [],
    };
    for (const [signature, callers] of Object.entries(expected)) {
      const { rows } = await owner.query<{ role: string; may: boolean; public: boolean }>(
        `SELECT r AS role, has_function_privilege(r, to_regprocedure($1), 'EXECUTE') AS may,
                EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = to_regprocedure($1) AND a.grantee = 0) AS public
           FROM unnest($2::text[]) r`,
        [signature, roles],
      );
      expect(rows.filter((row) => row.may).map((row) => row.role), signature).toEqual(callers);
      expect(rows[0]?.public, signature).toBe(false);
    }
  });

  it('makes every new definer set its search_path with pg_catalog first and pg_temp last, owned by the owner', async () => {
    for (const signature of NEW_DEFINERS) {
      const { rows } = await owner.query<{ definer: boolean; config: string[] | null; owner: string }>(
        'SELECT prosecdef AS definer, proconfig AS config, pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid = to_regprocedure($1)',
        [signature],
      );
      expect(rows[0], signature).toEqual({ definer: true, config: ['search_path=pg_catalog, public, pg_temp'], owner: OWNER_ROLE });
    }
  });

  it('drops organization_run_refusal, whose only callers were the two recreated on the shared decision', async () => {
    const { rows } = await owner.query<{ found: string | null }>("SELECT to_regprocedure('organization_run_refusal(uuid)')::text AS found");
    expect(rows[0]?.found).toBeNull();
  });

  it('appends the worker gate’s organization_suspended last to the packet export’s refusal codes', async () => {
    const { rows } = await owner.query<{ codes: string[] }>('SELECT packet_export_refusal_codes() AS codes');
    expect(rows[0]?.codes).toHaveLength(13);
    expect(rows[0]?.codes.slice(-2)).toEqual(['verifier_failed', 'organization_suspended']);
  });
});
