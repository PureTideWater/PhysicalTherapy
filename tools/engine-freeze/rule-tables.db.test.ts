import { readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase } from '@tp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RULE_TABLE_CATALOG } from './check';
import { ruleTableCatalog } from './rule-tables';

/**
 * "No DDL touches rule_release, rule_record or rule_release_withdrawal" (reconciliation-001), held on what the
 * migrations make rather than on their text: the three tables' migrated catalog (tools/engine-freeze/rule-tables.ts)
 * equals tools/engine-freeze/rule-tables.catalog.json. A migration that changes a table, a column, a constraint, a
 * foreign key to them, an index, a trigger or the function it executes, a policy, a grant to any role, a comment, the
 * inheritance, a rule, or a view through which a role may write them, changes the catalog, whatever its text says, and
 * fails here. The snapshot changes only with the founder's exception: tools/engine-freeze/check.ts refuses a pull
 * request that changes it unless the exception it names lists rule_table_ddl, and CODEOWNERS sends the file to the
 * founder. Regenerated with `pnpm test:db -u tools/engine-freeze/rule-tables.db.test.ts`; CI never writes it.
 */
let database: MigratedDatabase;
let client: pg.Client;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  client = new pg.Client({ connectionString: database.url });
  await client.connect();
}, 120_000);

afterAll(async () => {
  await client.end();
  await database.drop();
});

describe('the rule tables, as migrated', () => {
  it('hold exactly the catalog of tools/engine-freeze/rule-tables.catalog.json', async () => {
    const catalog = await ruleTableCatalog(client);
    await expect(`${JSON.stringify(catalog, null, 2)}\n`).toMatchFileSnapshot(`../../${RULE_TABLE_CATALOG}`);
  });

  /** The catalog after `sql`, run as the superuser that migrated the database, inside a transaction rolled back. */
  async function catalogAfter(sql: string): Promise<unknown> {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      return await ruleTableCatalog(client);
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('changes with each way a migration can change them without naming them as the text check looks for it', async () => {
    const before = await ruleTableCatalog(client);
    for (const sql of [
      // A published release made editable through its trigger's function.
      'CREATE OR REPLACE FUNCTION rule_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$',
      // The lock PR 5's trigger on the withdrawals executes, given another body.
      "CREATE OR REPLACE FUNCTION pricing_current_change_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtext('x')); RETURN NEW; END $$",
      // The no-truncate triggers dropped with their function.
      'DROP FUNCTION rule_content_no_truncate() CASCADE',
      // A write granted to another role, on every table of the schema.
      'GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tp_job',
      // A column added under a Unicode-escaped name, and by SQL built at run time.
      'ALTER TABLE U&"rule\\005frecord" ADD COLUMN probe int',
      "DO $$ BEGIN EXECUTE 'ALTER TABLE ' || reverse('drocer_elur') || ' ADD COLUMN probe int'; END $$",
      // A view over rule_record that another role may write through.
      'CREATE VIEW rule_record_probe AS SELECT * FROM rule_record; GRANT INSERT ON rule_record_probe TO tp_job',
      // A comment, a policy and a function setting.
      "COMMENT ON TABLE rule_release IS 'probe'",
      'CREATE POLICY probe ON rule_record USING (true)',
      'ALTER FUNCTION rule_release_immutable() SET search_path = public',
    ]) {
      expect(await catalogAfter(sql), sql).not.toEqual(before);
    }
    // A view that only reads them, as a reporting query may, is not their change.
    expect(await catalogAfter('CREATE VIEW rule_record_count AS SELECT count(*) FROM rule_record; GRANT SELECT ON rule_record_count TO tp_app')).toEqual(before);
  });
});
