import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CENTS_FIGURE_COLUMNS,
  NULLABLE_PRACTICE_ID_TABLES,
  PLATFORM_DIRECTORY_TABLES,
  REVIEWED_PLATFORM_POLICIES,
  REVIEWED_SCOPE_FUNCTIONS,
  TENANT_SETTING,
  catalogProblems,
  tenantPolicyExpression,
  tenantTables,
} from './catalog';
import { readDatabaseUrl } from './config';
import { APP_ROLE, OPERATOR_ROLE, OWNER_ROLE } from './roles';
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
      { table_name: 'adjustment', policy_name: 'adjustment_tenant' },
      { table_name: 'anomaly', policy_name: 'anomaly_tenant' },
      { table_name: 'audit_report', policy_name: 'audit_report_tenant' },
      { table_name: 'audit_report_download', policy_name: 'audit_report_download_tenant' },
      { table_name: 'case', policy_name: 'case_tenant' },
      { table_name: 'case_line', policy_name: 'case_line_tenant' },
      { table_name: 'claim', policy_name: 'claim_tenant' },
      { table_name: 'contract', policy_name: 'contract_tenant' },
      { table_name: 'contract_calendar_event', policy_name: 'contract_calendar_event_tenant' },
      { table_name: 'contract_question', policy_name: 'contract_question_tenant' },
      { table_name: 'contract_version', policy_name: 'contract_version_tenant' },
      { table_name: 'digest', policy_name: 'digest_tenant' },
      { table_name: 'grant', policy_name: 'grant_tenant' },
      { table_name: 'job_run', policy_name: 'job_run_tenant' },
      { table_name: 'line_note', policy_name: 'line_note_tenant' },
      { table_name: 'line_status', policy_name: 'line_status_tenant' },
      { table_name: 'notification', policy_name: 'notification_tenant' },
      { table_name: 'parse_report', policy_name: 'parse_report_tenant' },
      { table_name: 'patient_ref', policy_name: 'patient_ref_tenant' },
      { table_name: 'payer', policy_name: 'payer_tenant' },
      { table_name: 'payer_plan_mapping', policy_name: 'payer_plan_mapping_tenant' },
      { table_name: 'plan', policy_name: 'plan_tenant' },
      { table_name: 'practice', policy_name: 'practice_tenant' },
      { table_name: 'priced_line', policy_name: 'priced_line_tenant' },
      { table_name: 'pricing_run', policy_name: 'pricing_run_tenant' },
      { table_name: 'provider_adjustment', policy_name: 'provider_adjustment_tenant' },
      { table_name: 'rate_record', policy_name: 'rate_record_tenant' },
      { table_name: 'remittance', policy_name: 'remittance_tenant' },
      { table_name: 'service_line', policy_name: 'service_line_tenant' },
      { table_name: 'source_document', policy_name: 'source_document_tenant' },
      { table_name: 'support_grant', policy_name: 'support_grant_tenant' },
    ]);
    expect(Object.keys(NULLABLE_PRACTICE_ID_TABLES).sort()).toEqual(['agreement', 'audit_event']);
    expect(await tenantTables(client)).toEqual([
      { table: 'adjustment', tenantColumn: 'practice_id' },
      { table: 'agreement', tenantColumn: 'practice_id' },
      { table: 'anomaly', tenantColumn: 'practice_id' },
      { table: 'audit_event', tenantColumn: 'practice_id' },
      { table: 'audit_report', tenantColumn: 'practice_id' },
      { table: 'audit_report_download', tenantColumn: 'practice_id' },
      { table: 'case', tenantColumn: 'practice_id' },
      { table: 'case_line', tenantColumn: 'practice_id' },
      { table: 'claim', tenantColumn: 'practice_id' },
      { table: 'contract', tenantColumn: 'practice_id' },
      { table: 'contract_calendar_event', tenantColumn: 'practice_id' },
      { table: 'contract_question', tenantColumn: 'practice_id' },
      { table: 'contract_version', tenantColumn: 'practice_id' },
      { table: 'digest', tenantColumn: 'practice_id' },
      { table: 'grant', tenantColumn: 'practice_id' },
      { table: 'job_run', tenantColumn: 'practice_id' },
      { table: 'line_note', tenantColumn: 'practice_id' },
      { table: 'line_status', tenantColumn: 'practice_id' },
      { table: 'notification', tenantColumn: 'practice_id' },
      { table: 'parse_report', tenantColumn: 'practice_id' },
      { table: 'patient_ref', tenantColumn: 'practice_id' },
      { table: 'payer', tenantColumn: 'practice_id' },
      { table: 'payer_plan_mapping', tenantColumn: 'practice_id' },
      { table: 'plan', tenantColumn: 'practice_id' },
      { table: 'practice', tenantColumn: 'id' },
      { table: 'priced_line', tenantColumn: 'practice_id' },
      { table: 'pricing_run', tenantColumn: 'practice_id' },
      { table: 'provider_adjustment', tenantColumn: 'practice_id' },
      { table: 'rate_record', tenantColumn: 'practice_id' },
      { table: 'remittance', tenantColumn: 'practice_id' },
      { table: 'service_line', tenantColumn: 'practice_id' },
      { table: 'source_document', tenantColumn: 'practice_id' },
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

  it('fails when a second permissive policy on a PHI table ignores app.practice_ids, whatever its role', async () => {
    // The leak the review proved: the registered policy is exact, but permissive policies add up.
    expect(await problemsAfter(`${COMPLETE} CREATE POLICY throwaway_leak ON throwaway_phi FOR SELECT TO ${APP_ROLE} USING (app_actor_id() IS NOT NULL);`)).toEqual([
      `registered table throwaway_phi: permissive policy throwaway_leak for ${APP_ROLE} ignores app.practice_ids; permissive policies add up, so it admits rows of every practice`,
    ]);
    expect(await problemsAfter(`${COMPLETE} CREATE POLICY throwaway_platform ON throwaway_phi USING ((SELECT app_actor_is_platform_admin()));`)).toEqual([
      'registered table throwaway_phi: permissive policy throwaway_platform for public ignores app.practice_ids; permissive policies add up, so it admits rows of every practice',
    ]);
    expect(await problemsAfter(`${COMPLETE} CREATE POLICY throwaway_operator ON throwaway_phi FOR INSERT TO ${OPERATOR_ROLE} WITH CHECK (true);`)).toEqual([
      `registered table throwaway_phi: permissive policy throwaway_operator for ${OPERATOR_ROLE} ignores app.practice_ids; permissive policies add up, so it admits rows of every practice`,
    ]);
  });

  it('accepts other permissive policies that keep the tenant expression, restrictive ones, and the owner’s', async () => {
    expect(
      await problemsAfter(`${COMPLETE}
        CREATE POLICY throwaway_narrower ON throwaway_phi FOR SELECT TO ${APP_ROLE} USING (${TENANT} AND note <> '');
        CREATE POLICY throwaway_restrictive ON throwaway_phi AS RESTRICTIVE FOR SELECT TO ${APP_ROLE} USING (note <> '');
        CREATE POLICY throwaway_resolver ON throwaway_phi FOR SELECT TO ${OWNER_ROLE} USING (true);`),
    ).toEqual([]);
  });

  it('knows the reviewed platform policies, admits nothing else through them, and fails when one goes stale', async () => {
    expect(REVIEWED_PLATFORM_POLICIES.map((item) => `${item.table}.${item.policy}:${item.command}`)).toEqual([
      'practice.practice_platform_admin_insert:a',
      'support_grant.support_grant_platform_administrators_read:r',
      'support_grant.support_grant_platform_administrators_insert:a',
    ]);
    expect(REVIEWED_PLATFORM_POLICIES.every((item) => item.admits === 'platform_admin' && item.reason.length > 20)).toBe(true);
    expect(Object.keys(PLATFORM_DIRECTORY_TABLES).sort()).toEqual(['agreement', 'support_grant']);
    expect(await problemsAfter('DROP POLICY support_grant_platform_administrators_read ON support_grant;')).toEqual([
      'reviewed policy support_grant.support_grant_platform_administrators_read does not exist as a permissive policy for that command; update REVIEWED_PLATFORM_POLICIES',
    ]);
    // A reviewed name widened to every command is a new policy, not the reviewed one.
    const widened = await problemsAfter(
      'DROP POLICY support_grant_platform_administrators_read ON support_grant; CREATE POLICY support_grant_platform_administrators_read ON support_grant TO tp_app USING ((SELECT app_actor_is_platform_admin()));',
    );
    expect(widened).toEqual(expect.arrayContaining([expect.stringMatching(/permissive policy support_grant_platform_administrators_read for tp_app ignores app.practice_ids/)]));
  });

  it('fails on a SECURITY DEFINER function that does not search pg_temp last, and on anything the operator role owns', async () => {
    expect(await problemsAfter('CREATE FUNCTION throwaway_definer() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ SELECT 1 $$;')).toEqual([
      'function throwaway_definer() is SECURITY DEFINER without pg_temp last in its search_path',
    ]);
    expect(await problemsAfter('CREATE FUNCTION throwaway_definer() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;')).toEqual([
      'function throwaway_definer() is SECURITY DEFINER without pg_temp last in its search_path',
    ]);
    expect(await problemsAfter('CREATE FUNCTION throwaway_definer() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ SELECT 1 $$;')).toEqual([]);
    const owned = await problemsAfter(`CREATE TABLE throwaway_owned (id uuid PRIMARY KEY); RESET ROLE; ALTER TABLE throwaway_owned OWNER TO ${OPERATOR_ROLE};`);
    expect(owned).toEqual(expect.arrayContaining([`the operator role ${OPERATOR_ROLE} owns relation throwaway_owned`]));
  });

  it('fails on a SECURITY DEFINER function that sets app.practice_ids unless it is reviewed, and on a reviewed one that is gone', async () => {
    const widening = (body: string) =>
      problemsAfter(`CREATE FUNCTION throwaway_scope() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $f$ BEGIN ${body} END; $f$;`);
    const problem = `function throwaway_scope() is SECURITY DEFINER and sets ${TENANT_SETTING}; review it into REVIEWED_SCOPE_FUNCTIONS or keep the caller's scope`;
    expect(await widening("PERFORM set_config('app.practice_ids', (SELECT '{' || string_agg(id::text, ',') || '}' FROM practice), true);")).toEqual([problem]);
    expect(await widening("SET LOCAL app.practice_ids = '{}';")).toEqual([problem]);
    // Reading the caller's scope is not setting it; an invoker function runs under the caller's own rights.
    expect(await widening("PERFORM current_setting('app.practice_ids', true);")).toEqual([]);
    expect(await problemsAfter("CREATE FUNCTION throwaway_scope() RETURNS void LANGUAGE plpgsql AS $f$ BEGIN PERFORM set_config('app.practice_ids', '{}', true); END; $f$;")).toEqual([]);
    expect(REVIEWED_SCOPE_FUNCTIONS.map((item) => [item.function, item.scope])).toEqual([
      ['end_support_grant(uuid)', 'narrows'],
      ['console_contract_queue()', 'counts'],
      ['console_release_runs()', 'counts'],
    ]);
    expect(await problemsAfter('DROP FUNCTION console_contract_queue();')).toEqual([
      `reviewed scope function console_contract_queue() is not a SECURITY DEFINER function that sets ${TENANT_SETTING}; update REVIEWED_SCOPE_FUNCTIONS`,
    ]);
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

  it('admits a jsonb totals column only where it is reviewed and its CHECK admits integer cents alone', async () => {
    expect(Object.keys(CENTS_FIGURE_COLUMNS).sort()).toEqual(['digest.totals_cents', 'notification.totals_cents']);
    expect(await problemsAfter('ALTER TABLE digest DROP CONSTRAINT digest_totals_only;')).toEqual([
      'column digest.totals_cents is jsonb; a reviewed totals column is jsonb with a CHECK of figures_are_cents(totals_cents)',
    ]);
    expect(await problemsAfter('CREATE TABLE throwaway_figures (id uuid PRIMARY KEY, totals_cents jsonb CHECK (figures_are_cents(totals_cents)));')).toEqual([
      'column throwaway_figures.totals_cents is jsonb; money columns (_cents) are bigint',
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
