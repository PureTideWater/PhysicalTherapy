import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type PracticeScope, withJobScope, withPracticeScope } from './authz';
import { PLATFORM_DIRECTORY_TABLES, REVIEWED_PLATFORM_POLICIES, tenantTables } from './catalog';
import { readDatabaseUrl } from './config';
import { APP_ROLE } from './roles';
import { type MigratedDatabase, type Row, RowFactory, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from './testing';

/**
 * Cross-tenant negative tests generated from the schema (test matrix SEC-02; .claude/rules:
 * "add a table, get a test"). The tables come from the catalog: phi_table_registry plus every table
 * with a practice_id column. For each, the catalog-driven row factory writes rows for practice A and
 * practice B through the owner role; then the application role, scoped to practice B, must see zero
 * of A's rows, update and delete zero of them, and be refused an INSERT of a new row for A. Each
 * check runs three ways: a request's scope (withPracticeScope asking for A and B), a job's scope
 * (withJobScope for B), and app.practice_ids set by hand, which tests the policies alone.
 *
 * The INSERT probe differs from an accepted row in its practice only: its actor and approver columns
 * name the acting user, the identical row is accepted with its own practice in scope (the control),
 * and refused with only practice B in scope. And the people who reach no practice at all (a platform
 * administrator, a contract specialist, a support engineer without a support grant, a firm user
 * without a grant) read, change and delete none of A's rows either, except the directory reads the
 * catalog names for platform administrators (PLATFORM_DIRECTORY_TABLES).
 */

const database: MigratedDatabase = await createMigratedDatabase(readDatabaseUrl());
const owner = new pg.Client({ connectionString: database.url });
await owner.connect();
const TABLES = await tenantTables(owner);

let factory: RowFactory;
let worldA: TenantWorld;
let worldB: TenantWorld;
let app: pg.Pool;

/** People who reach no practice: each must see nothing of practice A. */
type Outsider = 'platform_admin' | 'contract_specialist' | 'support' | 'firm_principal';
const OUTSIDERS: readonly Outsider[] = ['platform_admin', 'contract_specialist', 'support', 'firm_principal'];
const outsiders = new Map<Outsider, string>();

beforeAll(async () => {
  factory = await RowFactory.load(owner);
  worldA = await createTenantWorld(owner, 'A');
  worldB = await createTenantWorld(owner, 'B');
  app = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  const internal = await createOrganization(owner, 'internal', 'cross-tenant');
  const firm = await createOrganization(owner, 'firm', 'cross-tenant');
  for (const role of OUTSIDERS) {
    const person = await createUser(owner, { hardwareKeyRequired: role !== 'firm_principal' });
    await addMembership(owner, role === 'firm_principal' ? firm : internal, person, role);
    outsiders.set(role, person);
  }
});

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
});

type Mode = 'request' | 'job' | 'policy';
const MODES: readonly Mode[] = ['request', 'job', 'policy'];

/** Runs `run` as the application role, scoped to practice B the way `mode` says. */
async function asPracticeB<T>(mode: Mode, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  if (mode === 'request') {
    // The request asks for both practices; the database admits only the one the actor reaches.
    return withPracticeScope(app, { actorId: worldB.adminUserId, practiceIds: [worldA.practiceId, worldB.practiceId] }, (scope: PracticeScope<pg.PoolClient>) => {
      expect(scope.practiceIds).toEqual([worldB.practiceId]);
      return run(scope.client);
    });
  }
  if (mode === 'job') {
    return withJobScope(app, { jobId: randomUUID(), practiceId: worldB.practiceId }, (scope) => run(scope.client));
  }
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${worldB.practiceId}}`, worldB.adminUserId]);
    return await run(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function privileged(table: string, privilege: 'UPDATE' | 'INSERT'): Promise<string[]> {
  const { rows } = await owner.query<{ name: string }>(
    `SELECT a.attname AS name FROM pg_attribute a
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND has_column_privilege($2, a.attrelid, a.attnum, $3)
      ORDER BY a.attnum`,
    [`"${table}"`, APP_ROLE, privilege],
  );
  return rows.map((row) => row.name);
}

async function hasDelete(table: string): Promise<boolean> {
  const { rows } = await owner.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2::regclass, $3) AS ok', [APP_ROLE, `"${table}"`, 'DELETE']);
  return rows[0]?.ok === true;
}

/** Expects a refusal: PostgreSQL's insufficient_privilege, raised by a policy or by a missing privilege. */
async function refused(attempt: Promise<unknown>, policy: boolean): Promise<void> {
  const error = await attempt.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, 'the statement should have been refused').toBeDefined();
  expect(error).toMatchObject({ code: '42501' });
  if (policy) {
    expect((error as Error).message).toMatch(/row-level security/);
  }
}

it('covers every tenant table the catalog knows', () => {
  expect(TABLES.map((entry) => entry.table)).toEqual(expect.arrayContaining(['practice', 'grant', 'support_grant', 'agreement', 'audit_event']));
});

describe.each(TABLES)('$table', ({ table, tenantColumn }) => {
  const quoted = `"${table}"`;
  let key: string;
  let rowsA: Row[];
  let rowB: Row;

  beforeAll(async () => {
    key = factory.primaryKey(table);
    rowsA = [await factory.create(owner, table, worldA)];
    if (table !== 'practice') {
      rowsA.push(await factory.create(owner, table, worldA));
    }
    rowB = await factory.create(owner, table, worldB);
  });

  const idsA = () => rowsA.map((row) => row[key]);

  it.each(MODES)('practice B (%s) reads none of practice A’s rows', async (mode) => {
    await asPracticeB(mode, async (client) => {
      expect((await client.query(`SELECT ${key} FROM ${quoted} WHERE ${key} = ANY ($1)`, [idsA()])).rows).toEqual([]);
      expect((await client.query(`SELECT ${key} FROM ${quoted} WHERE ${tenantColumn} = $1`, [worldA.practiceId])).rows).toEqual([]);
      const all = await client.query<Row>(`SELECT ${tenantColumn} AS tenant FROM ${quoted}`);
      expect(all.rows.filter((row) => row.tenant !== worldB.practiceId)).toEqual([]);
    });
  });

  it('practice B’s administrator reads practice B’s own row (the control: the scope is not merely empty)', async () => {
    await asPracticeB('request', async (client) => {
      const { rows } = await client.query<Row>(`SELECT ${key} AS id FROM ${quoted} WHERE ${key} = $1`, [rowB[key]]);
      expect(rows).toEqual([{ id: rowB[key] }]);
    });
  });

  it.each(MODES)('practice B (%s) updates none of practice A’s rows', async (mode) => {
    const [column] = await privileged(table, 'UPDATE');
    await asPracticeB(mode, async (client) => {
      if (column === undefined) {
        await refused(client.query(`UPDATE ${quoted} SET ${key} = ${key} WHERE ${key} = ANY ($1)`, [idsA()]), false);
        return;
      }
      await client.query('SAVEPOINT probe');
      const byKey = await client.query(`UPDATE ${quoted} SET ${column} = ${column} WHERE ${key} = ANY ($1)`, [idsA()]);
      const byTenant = await client.query(`UPDATE ${quoted} SET ${column} = ${column} WHERE ${tenantColumn} = $1`, [worldA.practiceId]);
      expect([byKey.rowCount, byTenant.rowCount]).toEqual([0, 0]);
      await client.query('ROLLBACK TO SAVEPOINT probe');
    });
  });

  it.each(MODES)('practice B (%s) deletes none of practice A’s rows', async (mode) => {
    const deletable = await hasDelete(table);
    await asPracticeB(mode, async (client) => {
      const attempt = client.query(`DELETE FROM ${quoted} WHERE ${key} = ANY ($1)`, [idsA()]);
      if (deletable) {
        expect((await attempt).rowCount).toBe(0);
      } else {
        await refused(attempt, false);
      }
    });
  });

  it.each(MODES)('practice B (%s) is refused an INSERT of a new row for practice A', async (mode) => {
    const probe = await factory.build(owner, table, worldA);
    const columns = Object.keys(probe.values);
    const insertable = await privileged(table, 'INSERT');
    const byPolicy = columns.every((column) => insertable.includes(column));
    await asPracticeB(mode, async (client) => {
      const sql = `INSERT INTO ${quoted} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`;
      await refused(client.query(sql, Object.values(probe.values)), byPolicy);
    });
  });

  it('accepts the probe row with its own practice in scope, and refuses the identical row with only practice B in scope', async () => {
    // The probe's actor and approver columns name practice A's administrator, who acts here: only the
    // scope differs between the two attempts, so the refusal is the tenant policy's.
    const probe = await factory.build(owner, table, worldA);
    const columns = Object.keys(probe.values);
    const sql = `INSERT INTO ${quoted} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')})`;
    const attempt = async (actorId: string, practiceIds: readonly unknown[]) => {
      const client = await app.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${practiceIds.join(',')}}`, actorId]);
        return await client.query(sql, Object.values(probe.values));
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    };
    const own = [probe.values[tenantColumn]];
    // Rows only platform administrators create (the reviewed insert policies): the control is theirs.
    const platformOnly = REVIEWED_PLATFORM_POLICIES.some((item) => item.table === table && item.command === 'a' && table !== 'practice');
    if (platformOnly) {
      await refused(attempt(probe.actorId, own), true);
      await expect(attempt(outsiders.get('platform_admin') ?? '', own)).resolves.toMatchObject({ rowCount: 1 });
      return;
    }
    // The actor is practice A's administrator, or the role holder a role-bound table needs (a case
    // worker's stage event and report request, a mapper's run).
    await expect(attempt(probe.actorId, own)).resolves.toMatchObject({ rowCount: 1 });
    await refused(attempt(probe.actorId, [worldB.practiceId]), true);
  });

  describe.each(OUTSIDERS)('as a %s, who reaches no practice', (role) => {
    const actor = () => outsiders.get(role) ?? '';
    const directory = role === 'platform_admin' && PLATFORM_DIRECTORY_TABLES[table] !== undefined;

    it(directory ? 'reads A’s directory rows by design, and nothing else of A' : 'reads none of A’s rows', async () => {
      await withPracticeScope(app, { actorId: actor(), practiceIds: [worldA.practiceId, worldB.practiceId] }, async (scope) => {
        expect(scope.practiceIds).toEqual([]);
        const seen = (await scope.client.query<Row>(`SELECT ${key} AS id FROM ${quoted} WHERE ${key} = ANY ($1)`, [idsA()])).rows.map((row) => row.id);
        expect(seen.sort()).toEqual(directory ? idsA().map(String).sort() : []);
      });
    });

    it('updates and deletes none of A’s rows', async () => {
      const [column] = await privileged(table, 'UPDATE');
      const deletable = await hasDelete(table);
      await withPracticeScope(app, { actorId: actor(), practiceIds: [worldA.practiceId] }, async (scope) => {
        // Each probe in its own savepoint, so a refusal does not end the transaction for the next.
        await scope.client.query('SAVEPOINT probe');
        if (column === undefined) {
          await refused(scope.client.query(`UPDATE ${quoted} SET ${key} = ${key} WHERE ${key} = ANY ($1)`, [idsA()]), false);
        } else {
          expect((await scope.client.query(`UPDATE ${quoted} SET ${column} = ${column} WHERE ${key} = ANY ($1)`, [idsA()])).rowCount).toBe(0);
        }
        await scope.client.query('ROLLBACK TO SAVEPOINT probe');
        const removal = scope.client.query(`DELETE FROM ${quoted} WHERE ${key} = ANY ($1)`, [idsA()]);
        if (deletable) {
          expect((await removal).rowCount).toBe(0);
        } else {
          await refused(removal, false);
        }
        await scope.client.query('ROLLBACK TO SAVEPOINT probe');
      });
    });
  });

  it('leaves practice A’s rows exactly as they were', async () => {
    // The admin connection is a superuser, which row-level security does not filter.
    const { rows } = await owner.query<Row>(`SELECT * FROM ${quoted} WHERE ${key} = ANY ($1) ORDER BY ${key}`, [idsA()]);
    const sorted = [...rowsA].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    expect(rows).toEqual(sorted);
  });
});
