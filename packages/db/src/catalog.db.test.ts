import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NULLABLE_PRACTICE_ID_TABLES, catalogProblems, tenantPolicyExpression, tenantTables } from './catalog';
import { readDatabaseUrl } from './config';
import { APP_ROLE, OWNER_ROLE } from './roles';
import { type MigratedDatabase, createMigratedDatabase } from './testing';

/**
 * The catalog test (test matrix SEC-01): the migrated schema holds every invariant, and a new PHI
 * table that lacks a forced policy, a registry row, an index or a sound column type makes it fail.
 * Each bad table is created as the owner inside a transaction that is rolled back.
 */

let database: MigratedDatabase;
let client: pg.Client;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  client = new pg.Client({ connectionString: database.url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await database.drop();
});

/** Runs `sql` as the owner, returns the catalog problems it causes, and rolls it back. */
async function problemsAfter(sql: string): Promise<string[]> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query(sql);
    await client.query('RESET ROLE');
    return await catalogProblems(client);
  } finally {
    await client.query('ROLLBACK');
  }
}

const THROWAWAY = 'CREATE TABLE throwaway_phi (id uuid PRIMARY KEY, practice_id uuid NOT NULL, note text NOT NULL);';
const TENANT = tenantPolicyExpression('practice_id').slice(1, -1);
const REGISTER = "INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES ('throwaway_phi', '29991231235959_throwaway', 'throwaway_phi_tenant');";
const COMPLETE = `${THROWAWAY}
  CREATE INDEX throwaway_phi_by_practice ON throwaway_phi (practice_id);
  ALTER TABLE throwaway_phi ENABLE ROW LEVEL SECURITY;
  ALTER TABLE throwaway_phi FORCE ROW LEVEL SECURITY;
  CREATE POLICY throwaway_phi_tenant ON throwaway_phi USING (${TENANT}) WITH CHECK (${TENANT});
  ${REGISTER}`;

describe('the catalog test', () => {
  it('passes on the migrated schema', async () => {
    expect(await catalogProblems(client)).toEqual([]);
  });

  it('covers the tenancy tables, the registry and the nullable exceptions the data dictionary names', async () => {
    const registered = await client.query<{ table_name: string; policy_name: string }>('SELECT table_name, policy_name FROM phi_table_registry ORDER BY 1');
    expect(registered.rows).toEqual([
      { table_name: 'grant', policy_name: 'grant_tenant' },
      { table_name: 'practice', policy_name: 'practice_tenant' },
      { table_name: 'support_grant', policy_name: 'support_grant_tenant' },
    ]);
    expect(Object.keys(NULLABLE_PRACTICE_ID_TABLES).sort()).toEqual(['agreement', 'audit_event']);
    expect(await tenantTables(client)).toEqual([
      { table: 'agreement', tenantColumn: 'practice_id' },
      { table: 'audit_event', tenantColumn: 'practice_id' },
      { table: 'grant', tenantColumn: 'practice_id' },
      { table: 'practice', tenantColumn: 'id' },
      { table: 'support_grant', tenantColumn: 'practice_id' },
    ]);
  });

  it('forces row-level security on every tenancy and operations table that can hold tenant data', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY ($1) ORDER BY relname`,
      [['organization', 'user', 'membership', 'practice', 'agreement', 'grant', 'support_grant', 'audit_event']],
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it('accepts a new PHI table done right (the control for the failures below)', async () => {
    expect(await problemsAfter(COMPLETE)).toEqual([]);
  });

  it('fails when a new PHI table has no row-level security, no policy, no index and no registry row', async () => {
    expect(await problemsAfter(THROWAWAY)).toEqual([
      'table throwaway_phi has practice_id but does not ENABLE and FORCE ROW LEVEL SECURITY',
      'table throwaway_phi has practice_id but no policy',
      'table throwaway_phi: practice_id is not the leading column of any index',
      'table throwaway_phi has a NOT NULL practice_id but is not in phi_table_registry',
    ]);
  });

  it('fails when the policy exists but row-level security is enabled and not forced', async () => {
    const problems = await problemsAfter(COMPLETE.replace('ALTER TABLE throwaway_phi FORCE ROW LEVEL SECURITY;', ''));
    expect(problems).toEqual([
      'table throwaway_phi enables row-level security without forcing it',
      'table throwaway_phi has practice_id but does not ENABLE and FORCE ROW LEVEL SECURITY',
      'registered table throwaway_phi does not ENABLE and FORCE ROW LEVEL SECURITY',
    ]);
  });

  it('fails when row-level security is forced but no policy exists', async () => {
    const problems = await problemsAfter(COMPLETE.replace(/CREATE POLICY[^;]*;/, ''));
    expect(problems).toEqual([
      'table throwaway_phi has practice_id but no policy',
      'registered table throwaway_phi: its policy throwaway_phi_tenant does not exist',
    ]);
  });

  it('fails when the registered policy does not read app.practice_ids exactly', async () => {
    const problems = await problemsAfter(COMPLETE.replace(`USING (${TENANT}) WITH CHECK (${TENANT})`, 'USING (true)'));
    expect(problems).toEqual([
      'table throwaway_phi has practice_id but no policy reads app.practice_ids',
      `registered table throwaway_phi: policy throwaway_phi_tenant must be PERMISSIVE, FOR ALL, TO PUBLIC, USING and WITH CHECK ${tenantPolicyExpression('practice_id')}`,
    ]);
    const narrowed = await problemsAfter(COMPLETE.replace('ON throwaway_phi USING', `ON throwaway_phi TO ${APP_ROLE} USING`));
    expect(narrowed).toEqual([expect.stringMatching(/policy throwaway_phi_tenant must be PERMISSIVE, FOR ALL, TO PUBLIC/)]);
  });

  it('fails when a registered table is missing or does not qualify', async () => {
    expect(await problemsAfter(REGISTER)).toEqual(['registered table throwaway_phi does not exist']);
    const nullable = await problemsAfter(COMPLETE.replace('practice_id uuid NOT NULL', 'practice_id uuid'));
    expect(nullable).toEqual([
      'table throwaway_phi: practice_id is nullable; a PHI table needs practice_id uuid NOT NULL',
      'registered table throwaway_phi does not qualify: practice_id must be uuid NOT NULL',
    ]);
    const textual = await problemsAfter(COMPLETE.replace('practice_id uuid NOT NULL', 'practice_id text NOT NULL').replaceAll('::uuid[]', '::text[]'));
    expect(textual).toEqual(expect.arrayContaining(['table throwaway_phi: practice_id is text, not uuid']));
  });

  it('fails when the tenant table leaves the registry', async () => {
    expect(await problemsAfter("DELETE FROM phi_table_registry WHERE table_name = 'practice';")).toEqual(['table practice (the tenant) is not in phi_table_registry']);
  });

  it('fails on a float anywhere, a money column that is not bigint, and a rate that is not numeric(14,6)', async () => {
    const problems = await problemsAfter(`
      CREATE TABLE throwaway_global (id uuid PRIMARY KEY, score double precision, ratio real[], paid_cents integer,
        allowed_cents bigint, conversion_rate numeric(12,4), rate numeric(14,6), cash money);`);
    expect(problems).toEqual([
      'column throwaway_global.cash is money; amounts are bigint cents and rates numeric(14,6), never a float',
      'column throwaway_global.conversion_rate is numeric(12,4); rate columns are numeric(14,6)',
      'column throwaway_global.paid_cents is integer; money columns (_cents) are bigint',
      'column throwaway_global.ratio is real[]; amounts are bigint cents and rates numeric(14,6), never a float',
      'column throwaway_global.score is double precision; amounts are bigint cents and rates numeric(14,6), never a float',
    ]);
  });

  it('fails when a global table is writable by the application role', async () => {
    expect(await problemsAfter(`GRANT INSERT ON phi_table_registry TO ${APP_ROLE};`)).toEqual([
      'table phi_table_registry has no row-level security, so it is global, but the application role can write it',
    ]);
    expect(await problemsAfter(`GRANT UPDATE (notes) ON rule_release TO ${APP_ROLE};`)).toEqual([
      'table rule_release has no row-level security, so it is global, but the application role can write it',
    ]);
  });

  it('fails when the application role owns anything', async () => {
    const problems = await problemsAfter(`CREATE TABLE throwaway_owned (id uuid PRIMARY KEY); RESET ROLE; ALTER TABLE throwaway_owned OWNER TO ${APP_ROLE};`);
    expect(problems).toEqual(
      expect.arrayContaining([
        `table throwaway_owned is owned by the application role ${APP_ROLE}`,
        `the application role ${APP_ROLE} owns relation throwaway_owned`,
      ]),
    );
  });
});
