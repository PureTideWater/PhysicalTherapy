import type pg from 'pg';

import { RULE_TABLES } from './check';

/**
 * The migrated catalog of the rule tables (reconciliation-001: "No DDL touches rule_release, rule_record or
 * rule_release_withdrawal"), as rule-tables.db.test.ts holds it to tools/engine-freeze/rule-tables.catalog.json: what
 * check.ts reads in a migration's text, read instead from what the migrations made. Each table's kind, owner, row
 * security, storage options and comment; its columns (type, nullability, default, identity, generation, comment and
 * column grants); its constraints, and every foreign key elsewhere that references it; its indexes; its triggers, each
 * with the function it executes (that function's source by hash, settings, security, volatility and owner); its
 * policies; its grants to every role; its inheritance; its rewrite rules; and every view that reads it and that a role
 * other than the owner may write (an updatable view writes through). The tables' owner is written as "(owner)", so the
 * snapshot does not depend on the login that migrated the database.
 */
export interface RuleTableCatalog {
  readonly [table: string]: unknown;
}

const OWNER = '(owner)';

/** The queries, each over one table named by $1 (a regclass). Rows come back as JSON, sorted. */
const QUERIES: Readonly<Record<string, string>> = {
  table: `
    SELECT c.relkind::text AS kind, c.relpersistence::text AS persistence, c.relrowsecurity AS row_security,
           c.relforcerowsecurity AS force_row_security, c.relreplident::text AS replica_identity, c.relispartition AS partition,
           coalesce(c.reloptions, '{}') AS options, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c WHERE c.oid = $1::regclass`,
  columns: `
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default, a.attidentity::text AS identity, a.attgenerated::text AS generated,
           col_description(a.attrelid, a.attnum) AS comment,
           (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('grantee', CASE WHEN x.grantee = 0 THEN 'PUBLIC' WHEN x.grantee = c.relowner THEN '${OWNER}' ELSE pg_get_userbyid(x.grantee) END,
                                                                  'privilege', x.privilege_type, 'grantable', x.is_grantable)), '[]')
              FROM aclexplode(a.attacl) x) AS grants
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
  constraints: `
    SELECT conname AS name, contype::text AS kind, pg_get_constraintdef(oid) AS definition, condeferrable AS deferrable, condeferred AS deferred
      FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY conname`,
  referenced_by: `
    SELECT conrelid::regclass::text AS from_table, conname AS name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE confrelid = $1::regclass AND conrelid <> $1::regclass ORDER BY 1, 2`,
  indexes: `
    SELECT i.indexrelid::regclass::text AS name, pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_index i WHERE i.indrelid = $1::regclass ORDER BY 1`,
  triggers: `
    SELECT t.tgname AS name, pg_get_triggerdef(t.oid) AS definition, t.tgenabled::text AS enabled,
           p.oid::regprocedure::text AS function, md5(p.prosrc) AS function_source_md5, coalesce(p.proconfig, '{}') AS function_settings,
           p.prosecdef AS function_security_definer, p.provolatile::text AS function_volatility,
           CASE WHEN p.proowner = c.relowner THEN '${OWNER}' ELSE pg_get_userbyid(p.proowner) END AS function_owner
      FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_class c ON c.oid = t.tgrelid
     WHERE t.tgrelid = $1::regclass AND NOT t.tgisinternal ORDER BY t.tgname`,
  policies: `
    SELECT polname AS name, polcmd::text AS command, polpermissive AS permissive,
           (SELECT coalesce(jsonb_agg(DISTINCT CASE WHEN r = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END), '[]') FROM unnest(polroles) r) AS roles,
           pg_get_expr(polqual, polrelid) AS using, pg_get_expr(polwithcheck, polrelid) AS with_check
      FROM pg_policy WHERE polrelid = $1::regclass ORDER BY polname`,
  grants: `
    SELECT CASE WHEN x.grantor = c.relowner THEN '${OWNER}' ELSE pg_get_userbyid(x.grantor) END AS grantor,
           CASE WHEN x.grantee = 0 THEN 'PUBLIC' WHEN x.grantee = c.relowner THEN '${OWNER}' ELSE pg_get_userbyid(x.grantee) END AS grantee,
           x.privilege_type AS privilege, x.is_grantable AS grantable
      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
     WHERE c.oid = $1::regclass ORDER BY 2, 3, 1`,
  inherits: `
    SELECT inhparent::regclass::text AS parent, inhrelid::regclass::text AS child
      FROM pg_inherits WHERE inhrelid = $1::regclass OR inhparent = $1::regclass ORDER BY 1, 2`,
  rules: `
    SELECT r.rulename AS name, pg_get_ruledef(r.oid) AS definition
      FROM pg_rewrite r WHERE r.ev_class = $1::regclass ORDER BY 1`,
  writable_views: `
    SELECT v.oid::regclass::text AS view, v.relkind::text AS kind, pg_relation_is_updatable(v.oid, false) AS updatable_events,
           (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('grantee', CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END, 'privilege', x.privilege_type)), '[]')
              FROM aclexplode(coalesce(v.relacl, acldefault('r', v.relowner))) x
             WHERE x.grantee <> v.relowner AND x.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) AS write_grants,
           EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = v.oid AND NOT t.tgisinternal) AS has_triggers
      FROM (SELECT DISTINCT r.ev_class FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
             WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass AND d.refobjid = $1::regclass AND r.ev_class <> $1::regclass) dependent
      JOIN pg_class v ON v.oid = dependent.ev_class
     WHERE EXISTS (SELECT 1 FROM aclexplode(coalesce(v.relacl, acldefault('r', v.relowner))) x
                    WHERE x.grantee <> v.relowner AND x.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
        OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = v.oid AND NOT t.tgisinternal)
     ORDER BY 1`,
};

/** Reads the rule tables' catalog from a migrated database, every list sorted, so equal schemas give equal text. */
export async function ruleTableCatalog(client: pg.Client): Promise<RuleTableCatalog> {
  const catalog: Record<string, Record<string, unknown>> = {};
  for (const table of RULE_TABLES) {
    const entry: Record<string, unknown> = {};
    for (const [part, sql] of Object.entries(QUERIES)) {
      const { rows } = await client.query(sql, [`public.${table}`]);
      entry[part] = part === 'table' ? (rows[0] ?? null) : rows;
    }
    catalog[table] = entry;
  }
  return catalog;
}
