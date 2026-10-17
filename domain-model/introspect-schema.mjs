#!/usr/bin/env node
/**
 * introspect-schema.mjs: generate the domain model (CO-02) from a LIVE, migrated PostgreSQL database.
 *
 * It reads only the catalog (pg_class, pg_attribute, pg_constraint, pg_index, pg_policy, pg_trigger,
 * pg_proc, information_schema privileges) plus two platform tables that are themselves catalog data:
 * phi_table_registry and schema_migrations. It never reads a row of any other table.
 *
 * Usage:
 *   node introspect-schema.mjs --database-url postgres://... --pg-from <dir with node_modules/pg> \
 *        --out domain-model.generated.md [--json domain-model.generated.json] [--commit <sha>] [--branch <name>]
 *
 * Output: Markdown (and optionally JSON for diffing). Everything is ordered by name, so two runs over
 * the same schema produce the same bytes apart from the generated-at line.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    'database-url': { type: 'string' },
    'pg-from': { type: 'string' },
    out: { type: 'string' },
    json: { type: 'string' },
    commit: { type: 'string' },
    branch: { type: 'string' },
    append: { type: 'string', multiple: true },
    stable: { type: 'boolean', default: false },
    'app-role': { type: 'string', default: 'tp_app' },
    'operator-role': { type: 'string', default: 'tp_operator' },
    'billing-role': { type: 'string', default: 'tp_billing' },
    'owner-role': { type: 'string', default: 'tp_owner' },
  },
  strict: true,
});
if (!args['database-url'] || !args['pg-from'] || !args.out) {
  process.stderr.write('usage: node introspect-schema.mjs --database-url URL --pg-from DIR --out FILE.md [--json FILE.json] [--commit SHA] [--branch NAME]\n');
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(args['pg-from']), 'package.json'));
const pg = require('pg');

const ROLES = { app: args['app-role'], operator: args['operator-role'], billing: args['billing-role'], owner: args['owner-role'] };
const TENANT_EXPR = (col) => `(${col} = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`;

const client = new pg.Client({ connectionString: args['database-url'] });
await client.connect();
await client.query('SET search_path = public');
const q = async (text, values) => (await client.query(text, values)).rows;

// ---------------------------------------------------------------------------------------------
// Catalog reads
// ---------------------------------------------------------------------------------------------
const meta = (
  await q(`SELECT current_database() AS db, version() AS version, now() AS at,
                  (SELECT count(*)::int FROM schema_migrations) AS migrations,
                  (SELECT max(filename) FROM schema_migrations) AS head`)
)[0];

const relations = await q(`
  SELECT c.oid::int AS oid, c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
         pg_get_userbyid(c.relowner) AS owner, obj_description(c.oid, 'pg_class') AS comment,
         c.reloptions AS options
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
   ORDER BY c.relname`);

const columns = await q(`
  SELECT c.relname AS table_name, a.attnum AS num, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
         a.attnotnull AS not_null, CASE WHEN a.attgenerated = '' THEN pg_get_expr(d.adbin, d.adrelid) END AS default_expr,
         CASE WHEN a.attidentity <> '' THEN a.attidentity::text END AS identity,
         CASE WHEN a.attgenerated <> '' THEN pg_get_expr(d.adbin, d.adrelid) END AS generated,
         col_description(c.oid, a.attnum) AS comment
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY c.relname, a.attnum`);

const constraints = await q(`
  SELECT c.relname AS table_name, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid, true) AS def,
         ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS cols,
         fc.relname AS ref_table,
         ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS ref_cols,
         con.confdeltype AS on_delete, con.condeferrable AS deferrable
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_class fc ON fc.oid = con.confrelid
   WHERE n.nspname = 'public'
   ORDER BY c.relname, con.contype, con.conname`);

const indexes = await q(`
  SELECT t.relname AS table_name, i.relname AS name, pg_get_indexdef(x.indexrelid) AS def,
         x.indisprimary AS is_primary, x.indisunique AS is_unique,
         EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = x.indexrelid) AS backs_constraint
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
   ORDER BY t.relname, i.relname`);

const policies = await q(`
  SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS cmd, pol.polpermissive AS permissive,
         ARRAY(SELECT CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(pol.polroles) r ORDER BY 1)::text[] AS roles,
         pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
         pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
    FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
   ORDER BY c.relname, pol.polname`);

const triggers = await q(`
  SELECT c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid, true) AS def,
         p.proname AS function_name, p.prosrc AS function_src, t.tgenabled::text AS enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
   ORDER BY c.relname, t.tgname`);

const functions = await q(`
  SELECT p.oid::regprocedure::text AS signature, p.proname AS name, l.lanname AS language, p.prosecdef AS security_definer,
         p.provolatile::text AS volatility, coalesce(p.proconfig, '{}')::text[] AS config,
         pg_get_function_result(p.oid) AS returns,
         ARRAY(SELECT pg_get_userbyid(g.grantee) FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
                WHERE g.privilege_type = 'EXECUTE' AND g.grantee <> 0 AND g.grantee <> p.proowner ORDER BY 1)::text[] AS execute_roles,
         EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g WHERE g.privilege_type = 'EXECUTE' AND g.grantee = 0) AS execute_public,
         p.prosrc AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
   ORDER BY 1`);

const privileges = await q(`
  SELECT c.relname AS table_name, r.rolname AS role,
         has_table_privilege(r.oid, c.oid, 'SELECT') AS sel,
         has_table_privilege(r.oid, c.oid, 'INSERT') AS ins,
         has_table_privilege(r.oid, c.oid, 'UPDATE') AS upd,
         has_table_privilege(r.oid, c.oid, 'DELETE') AS del,
         has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS trunc,
         has_any_column_privilege(r.oid, c.oid, 'INSERT') AS col_ins,
         has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS col_upd,
         has_any_column_privilege(r.oid, c.oid, 'SELECT') AS col_sel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles r
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND r.rolname = ANY ($1::text[])
   ORDER BY c.relname, r.rolname`, [[ROLES.app, ROLES.operator, ROLES.billing]]);

const columnPrivileges = await q(`
  SELECT table_name, grantee AS role, privilege_type AS priv, array_agg(column_name::text ORDER BY column_name)::text[] AS cols
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND grantee = ANY ($1::text[]) AND privilege_type IN ('INSERT','UPDATE')
   GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, [[ROLES.app, ROLES.operator, ROLES.billing]]);

const enumTypes = await q(`
  SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`);

const viewDefs = await q(`
  SELECT c.relname AS name, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY 1`);

const registry = (await q(`SELECT to_regclass('public.phi_table_registry') IS NOT NULL AS present`))[0].present
  ? await q(`SELECT table_name, policy_name, registered_by FROM phi_table_registry ORDER BY table_name`)
  : [];

await client.end();

// ---------------------------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------------------------
const by = (list, key) => {
  const map = new Map();
  for (const item of list) {
    const k = item[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};
const colsBy = by(columns, 'table_name');
const consBy = by(constraints, 'table_name');
const idxBy = by(indexes, 'table_name');
const polBy = by(policies, 'table_name');
const trgBy = by(triggers, 'table_name');
const privBy = by(privileges, 'table_name');
const colPrivBy = by(columnPrivileges, 'table_name');
const regBy = new Map(registry.map((r) => [r.table_name, r]));
const viewBy = new Map(viewDefs.map((v) => [v.name, v.def]));

/** Values a CHECK admits for one column, when the CHECK is an enumeration: col = ANY (ARRAY['a', ...]) or col IN (...). */
function enumerationOf(def) {
  const out = [];
  const anyRe = /\(?\(?([a-z_][a-z0-9_]*)\)?(?:::text)?\s*=\s*ANY\s*\(\s*(?:\(\s*)?ARRAY\[([^\]]*)\]/gi;
  let m;
  while ((m = anyRe.exec(def)) !== null) {
    const values = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((v) => v[1].replace(/''/g, "'"));
    if (values.length > 0) out.push({ column: m[1], values });
  }
  return out;
}

const ENC_RE = /([a-z_][a-z0-9_]*)\s*~\s*'\^enc:v1:/g;
function encryptedColumnsOf(def) {
  return [...def.matchAll(ENC_RE)].map((m) => m[1]);
}

/** RAISE EXCEPTION messages and ERRCODE hints in a plpgsql body: the invariant in its own words. */
function raisesOf(src) {
  if (!src) return [];
  const msgs = [];
  for (const m of src.matchAll(/RAISE\s+EXCEPTION\s+'((?:[^']|'')*)'/gi)) msgs.push(m[1].replace(/''/g, "'"));
  return [...new Set(msgs)];
}

const ON_DELETE = { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null', d: 'set default' };
const CMD = { '*': 'ALL', r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };
const KIND = { r: 'table', p: 'partitioned table', v: 'view', m: 'materialized view' };

const model = relations.map((rel) => {
  const cols = colsBy.get(rel.name) ?? [];
  const cons = consBy.get(rel.name) ?? [];
  const pk = cons.find((c) => c.type === 'p');
  const uniques = cons.filter((c) => c.type === 'u');
  const fks = cons.filter((c) => c.type === 'f');
  const checks = cons.filter((c) => c.type === 'c');
  const exclusions = cons.filter((c) => c.type === 'x');
  const pcol = cols.find((c) => c.name === 'practice_id');
  const enc = new Set(checks.flatMap((c) => encryptedColumnsOf(c.def)));
  const enums = {};
  for (const c of checks) for (const e of enumerationOf(c.def)) enums[e.column] = [...new Set([...(enums[e.column] ?? []), ...e.values])];
  const pols = polBy.get(rel.name) ?? [];
  const reg = regBy.get(rel.name);
  const tenantCol = rel.name === 'practice' ? 'id' : 'practice_id';
  let classification;
  if (rel.kind === 'v' || rel.kind === 'm') classification = 'view';
  else if (reg) classification = 'PHI (registered)';
  else if (pcol) classification = pcol.not_null ? 'tenant, NOT registered' : 'tenant (nullable practice_id), not PHI';
  else if (rel.rls) classification = 'RLS, no practice_id (organization- or user-scoped)';
  else classification = 'global (no practice_id, no RLS)';
  const privs = Object.fromEntries((privBy.get(rel.name) ?? []).map((p) => [p.role, p]));
  const colPrivs = colPrivBy.get(rel.name) ?? [];
  return {
    name: rel.name,
    kind: KIND[rel.kind] ?? rel.kind,
    owner: rel.owner,
    comment: rel.comment,
    options: rel.options,
    rls: rel.rls,
    forced: rel.forced,
    classification,
    practiceId: rel.name === 'practice' ? 'id (the tenant key)' : pcol ? (pcol.not_null ? 'uuid NOT NULL' : 'uuid NULL') : null,
    registry: reg ? { policy: reg.policy_name, registeredBy: reg.registered_by } : null,
    tenantPolicyOk: reg ? pols.some((p) => p.name === reg.policy_name && p.cmd === '*' && p.permissive && p.using_expr === TENANT_EXPR(tenantCol) && p.check_expr === TENANT_EXPR(tenantCol)) : null,
    columns: cols.map((c) => ({
      name: c.name,
      type: c.type,
      notNull: c.not_null,
      default: c.default_expr,
      identity: c.identity,
      generated: c.generated,
      encrypted: enc.has(c.name),
      enumeration: enums[c.name] ?? null,
      fk: fks.filter((f) => f.cols.length === 1 && f.cols[0] === c.name).map((f) => `${f.ref_table}(${f.ref_cols.join(', ')})`),
      comment: c.comment,
    })),
    primaryKey: pk ? pk.cols : null,
    uniques: uniques.map((u) => ({ name: u.name, cols: u.cols, def: u.def })),
    foreignKeys: fks.map((f) => ({ name: f.name, cols: f.cols, refTable: f.ref_table, refCols: f.ref_cols, onDelete: ON_DELETE[f.on_delete] ?? f.on_delete, deferrable: f.deferrable })),
    checks: checks.map((c) => ({ name: c.name, def: c.def })),
    exclusions: exclusions.map((c) => ({ name: c.name, def: c.def })),
    indexes: (idxBy.get(rel.name) ?? []).map((i) => ({ name: i.name, def: i.def, primary: i.is_primary, unique: i.is_unique, backsConstraint: i.backs_constraint })),
    policies: pols.map((p) => ({ name: p.name, command: CMD[p.cmd] ?? p.cmd, permissive: p.permissive, roles: p.roles, using: p.using_expr, withCheck: p.check_expr })),
    triggers: (trgBy.get(rel.name) ?? []).map((t) => ({ name: t.name, def: t.def, function: t.function_name, enabled: t.enabled, raises: raisesOf(t.function_src) })),
    privileges: Object.fromEntries(
      Object.values(ROLES).filter((r) => r !== ROLES.owner).map((role) => {
        const p = privs[role];
        if (!p) return [role, null];
        const parts = [];
        if (p.sel) parts.push('SELECT'); else if (p.col_sel) parts.push('SELECT(cols)');
        if (p.ins) parts.push('INSERT'); else if (p.col_ins) parts.push('INSERT(cols)');
        if (p.upd) parts.push('UPDATE'); else if (p.col_upd) parts.push('UPDATE(cols)');
        if (p.del) parts.push('DELETE');
        if (p.trunc) parts.push('TRUNCATE');
        return [role, parts];
      }),
    ),
    columnGrants: colPrivs.filter((cp) => !(privs[cp.role] && ((cp.priv === 'INSERT' && privs[cp.role].ins) || (cp.priv === 'UPDATE' && privs[cp.role].upd)))).map((cp) => ({ role: cp.role, priv: cp.priv, cols: cp.cols })),
    view: viewBy.get(rel.name) ?? null,
  };
});

const fnModel = functions.map((f) => ({
  signature: f.signature,
  name: f.name,
  language: f.language,
  securityDefiner: f.security_definer,
  volatility: { i: 'immutable', s: 'stable', v: 'volatile' }[f.volatility] ?? f.volatility,
  config: f.config,
  returns: f.returns,
  executeRoles: f.execute_roles,
  executePublic: f.execute_public,
  raises: raisesOf(f.src),
  setsScope: /set_config\s*\(\s*'app\.practice_ids'/i.test(f.src ?? '') || f.config.some((c) => c.startsWith('app.practice_ids=')),
}));

// ---------------------------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------------------------
const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '));
const code = (s) => (s === null || s === undefined || s === '' ? '' : '`' + esc(s).replace(/`/g, "'") + '`');
const lines = [];
const out = (s = '') => lines.push(s);

const tables = model.filter((t) => t.kind !== 'view' && t.kind !== 'materialized view');
const views = model.filter((t) => t.kind === 'view' || t.kind === 'materialized view');
const phi = tables.filter((t) => t.registry);
const tenantNotReg = tables.filter((t) => !t.registry && t.practiceId);
const globals = tables.filter((t) => !t.practiceId && !t.registry && !t.rls);
const scoped = tables.filter((t) => !t.practiceId && !t.registry && t.rls);

out('# Domain model (generated from the live schema)');
out();
out('> GENERATED FILE. Produced by `introspect-schema.mjs` reading the PostgreSQL catalog of a database migrated with `pnpm db:migrate`; do not edit by hand, regenerate it.');
out();
out(`- Source: branch \`${args.branch ?? 'unknown'}\`, commit \`${args.commit ?? 'unknown'}\``);
out(`- Migrations applied: ${meta.migrations}; head \`${meta.head}\``);
if (!args.stable) {
  out(`- Database: \`${meta.db}\`; ${String(meta.version).split(',')[0]}`);
  out(`- Generated at: ${new Date(meta.at).toISOString()}`);
} else {
  out(`- ${String(meta.version).split(' ').slice(0, 2).join(' ')} (stable output: no database name or timestamp, so a CI job can diff it)`);
}
out(`- Relations in schema public: ${tables.length} tables, ${views.length} view(s); PostgreSQL enum types: ${enumTypes.length} (every enumeration is a CHECK constraint)`);
out(`- phi_table_registry: ${registry.length} tables; tenant tables with practice_id not in the registry: ${tenantNotReg.length}; organization- or user-scoped RLS tables: ${scoped.length}; global tables: ${globals.length}`);
out(`- Functions in public: ${fnModel.length} (${fnModel.filter((f) => f.securityDefiner).length} SECURITY DEFINER); non-internal triggers: ${triggers.length}`);
out();
out('Approval: _pending founder approval (CO-02). Approved by: ____________ Date: _____________');
out();
out('## Contents');
out();
out('1. [Table index](#table-index)');
out('2. [PHI table registry](#phi-table-registry)');
out('3. [Tenant tables outside the registry](#tenant-tables-outside-the-registry)');
out('4. [Global tables](#global-tables) and [organization- or user-scoped tables](#organization--or-user-scoped-tables)');
out('5. [Enumerations (CHECK constraints)](#enumerations-check-constraints)');
out('6. [Encrypted columns](#encrypted-columns)');
out('7. [Invariant triggers](#invariant-triggers)');
out('8. [Functions](#functions)');
out('9. [Tables](#tables) (one section each)');
out('10. [Views](#views)');
out();

out('## Table index');
out();
out(`| Table | Class | practice_id | RLS | FORCE | Policies | Triggers | ${ROLES.app} | ${ROLES.operator} | ${ROLES.billing} |`);
out('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const t of model) {
  const pr = (r) => (t.privileges[r] && t.privileges[r].length ? t.privileges[r].join(', ') : '-');
  out(`| [\`${t.name}\`](#table-${t.name.replace(/_/g, '-')}) | ${t.classification} | ${t.practiceId ?? '-'} | ${t.rls ? 'yes' : 'no'} | ${t.forced ? 'yes' : 'no'} | ${t.policies.length} | ${t.triggers.length} | ${pr(ROLES.app)} | ${pr(ROLES.operator)} | ${pr(ROLES.billing)} |`);
}
out();

out('## PHI table registry');
out();
out('Rows of `phi_table_registry`, and whether the registered policy is PERMISSIVE, FOR ALL, TO PUBLIC with USING and WITH CHECK exactly `practice_id = ANY (current_setting(\'app.practice_ids\', true)::uuid[])` (`id` for `practice`).');
out();
out('| Table | Registered policy | Registered by migration | Policy qualifies |');
out('| --- | --- | --- | --- |');
for (const t of phi) out(`| \`${t.name}\` | \`${t.registry.policy}\` | \`${t.registry.registeredBy}\` | ${t.tenantPolicyOk ? 'yes' : '**NO**'} |`);
out();

out('## Tenant tables outside the registry');
out();
out('Tables with a `practice_id` column that are not in `phi_table_registry`. The catalog test allows this only for a nullable practice_id listed in `NULLABLE_PRACTICE_ID_TABLES` (packages/db/src/catalog.ts).');
out();
out('| Table | practice_id | RLS / FORCE | Policies (name: command, roles) |');
out('| --- | --- | --- | --- |');
for (const t of tenantNotReg) out(`| \`${t.name}\` | ${t.practiceId} | ${t.rls ? 'yes' : 'no'} / ${t.forced ? 'yes' : 'no'} | ${t.policies.map((p) => `${p.name}: ${p.command} ${p.permissive ? '' : '(restrictive) '}${p.roles.join(',')}`).join('<br>')} |`);
out();

out('## Global tables');
out();
out('Tables with no `practice_id` and no registry row. The data dictionary convention: no practice_id, and the application role may not INSERT, UPDATE or DELETE.');
out();
out(`| Table | RLS / FORCE | Policies | ${ROLES.app} | ${ROLES.operator} | ${ROLES.billing} | Column grants |`);
out('| --- | --- | --- | --- | --- | --- | --- |');
for (const t of globals) {
  const pr = (r) => (t.privileges[r] && t.privileges[r].length ? t.privileges[r].join(', ') : '-');
  out(`| \`${t.name}\` | ${t.rls ? 'yes' : 'no'} / ${t.forced ? 'yes' : 'no'} | ${t.policies.length} | ${pr(ROLES.app)} | ${pr(ROLES.operator)} | ${pr(ROLES.billing)} | ${t.columnGrants.map((g) => `${g.role} ${g.priv}(${g.cols.join(', ')})`).join('<br>')} |`);
}
out();

out('## Organization- or user-scoped tables');
out();
out('Tables with no `practice_id` that ENABLE and FORCE row-level security on another key (organization, user, or the platform).');
out();
out(`| Table | Policies (name: command, roles) | ${ROLES.app} | ${ROLES.billing} |`);
out('| --- | --- | --- | --- |');
for (const t of scoped) {
  const pr = (r) => (t.privileges[r] && t.privileges[r].length ? t.privileges[r].join(', ') : '-');
  out(`| \`${t.name}\` | ${t.policies.map((p) => `${p.name}: ${p.permissive ? '' : 'restrictive '}${p.command} ${p.roles.join(',')}`).join('<br>')} | ${pr(ROLES.app)} | ${pr(ROLES.billing)} |`);
}
out();

out('## Enumerations (CHECK constraints)');
out();
if (enumTypes.length) {
  out('PostgreSQL enum types:');
  for (const e of enumTypes) out(`- \`${e.name}\`: ${e.labels.map(code).join(', ')}`);
  out();
}
out('Columns whose CHECK constraint admits a closed list of values.');
out();
out('| Table.column | Values |');
out('| --- | --- |');
for (const t of model) for (const c of t.columns) if (c.enumeration) out(`| \`${t.name}.${c.name}\` | ${c.enumeration.map(code).join(', ')} |`);
out();

out('## Encrypted columns');
out();
out('Columns whose CHECK admits only `enc:v1:` ciphertext (application-layer encryption with the practice data key).');
out();
out('| Table | Columns |');
out('| --- | --- |');
for (const t of model) {
  const enc = t.columns.filter((c) => c.encrypted).map((c) => code(c.name));
  if (enc.length) out(`| \`${t.name}\` | ${enc.join(', ')} |`);
}
out();

out('## Invariant triggers');
out();
out('Every non-internal trigger, its function, and the exceptions its function raises (the invariant in its own words). Triggers that only maintain `updated_at` are listed in each table section, not here.');
out();
out('| Table | Trigger | Definition | Raises |');
out('| --- | --- | --- | --- |');
for (const t of model) for (const tr of t.triggers) {
  if (tr.function === 'set_updated_at') continue;
  out(`| \`${t.name}\` | \`${tr.name}\` | ${code(tr.def.replace(/^CREATE (CONSTRAINT )?TRIGGER \S+ /, ''))} | ${tr.raises.map(esc).join('<br>')} |`);
}
out();

out('## Functions');
out();
out('| Function | Returns | Lang | Security | Volatility | search_path / config | EXECUTE granted to | Sets app.practice_ids |');
out('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const f of fnModel) out(`| ${code(f.signature)} | ${code(f.returns)} | ${f.language} | ${f.securityDefiner ? 'DEFINER' : 'invoker'} | ${f.volatility} | ${f.config.map(code).join('<br>')} | ${f.executePublic ? 'PUBLIC' : ''}${f.executePublic && f.executeRoles.length ? ', ' : ''}${f.executeRoles.join(', ')} | ${f.setsScope ? 'yes' : ''} |`);
out();

out('## Tables');
out();
for (const t of tables) {
  out(`### Table \`${t.name}\``);
  out();
  out(`<a id="table-${t.name.replace(/_/g, '-')}"></a>`);
  out();
  out(`- Class: ${t.classification}; owner \`${t.owner}\`; RLS ${t.rls ? 'ENABLED' : 'disabled'}${t.forced ? ' and FORCED' : ''}`);
  if (t.registry) out(`- phi_table_registry: policy \`${t.registry.policy}\`, registered by \`${t.registry.registeredBy}\`; policy qualifies: ${t.tenantPolicyOk ? 'yes' : '**NO**'}`);
  out(`- Primary key: ${t.primaryKey ? t.primaryKey.map(code).join(', ') : '**none**'}`);
  for (const r of [ROLES.app, ROLES.operator, ROLES.billing]) out(`- \`${r}\`: ${t.privileges[r] && t.privileges[r].length ? t.privileges[r].join(', ') : 'no privilege'}`);
  for (const g of t.columnGrants) out(`- Column grant: \`${g.role}\` ${g.priv} (${g.cols.map(code).join(', ')})`);
  if (t.comment) out(`- Comment: ${esc(t.comment)}`);
  out();
  out('| # | Column | Type | Null | Default | References | Notes |');
  out('| --- | --- | --- | --- | --- | --- | --- |');
  t.columns.forEach((c, i) => {
    const notes = [];
    if (c.encrypted) notes.push('enc:v1');
    if (c.enumeration) notes.push('one of ' + c.enumeration.join(', '));
    if (c.identity) notes.push('identity ' + c.identity);
    if (c.generated) notes.push('generated always as ' + code(c.generated) + ' stored');
    if (c.comment) notes.push(esc(c.comment));
    out(`| ${i + 1} | \`${c.name}\` | ${code(c.type)} | ${c.notNull ? 'NOT NULL' : 'null'} | ${code(c.default)} | ${c.fk.map(code).join('<br>')} | ${notes.join('; ')} |`);
  });
  out();
  if (t.uniques.length) {
    out('Unique constraints:');
    for (const u of t.uniques) out(`- \`${u.name}\`: ${code(u.def)}`);
    out();
  }
  if (t.foreignKeys.length) {
    out('Foreign keys:');
    for (const f of t.foreignKeys) out(`- \`${f.name}\`: (${f.cols.join(', ')}) -> \`${f.refTable}\`(${f.refCols.join(', ')}) on delete ${f.onDelete}${f.deferrable ? ', deferrable' : ''}`);
    out();
  }
  if (t.checks.length) {
    out('Check constraints:');
    for (const c of t.checks) out(`- \`${c.name}\`: ${code(c.def)}`);
    out();
  }
  if (t.exclusions.length) {
    out('Exclusion constraints:');
    for (const c of t.exclusions) out(`- \`${c.name}\`: ${code(c.def)}`);
    out();
  }
  if (t.indexes.length) {
    out('Indexes:');
    for (const i of t.indexes) out(`- \`${i.name}\`${i.primary ? ' (primary)' : i.backsConstraint ? ' (constraint)' : ''}: ${code(i.def.replace(/ ON public\.\S+ USING /, ' USING ').replace(/^CREATE (UNIQUE )?INDEX \S+/, (m, u) => (u ? 'UNIQUE' : '')).trim())}`);
    out();
  }
  out(`Policies (${t.policies.length}):`);
  if (!t.policies.length) out('- none');
  for (const p of t.policies) {
    out(`- \`${p.name}\`: ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} FOR ${p.command} TO ${p.roles.join(', ')}`);
    if (p.using) out(`  - USING ${code(p.using)}`);
    if (p.withCheck) out(`  - WITH CHECK ${code(p.withCheck)}`);
  }
  out();
  if (t.triggers.length) {
    out('Triggers:');
    for (const tr of t.triggers) out(`- \`${tr.name}\`: ${code(tr.def.replace(/^CREATE (CONSTRAINT )?TRIGGER \S+ /, ''))}${tr.raises.length ? ' raises: ' + tr.raises.map((r) => '"' + esc(r) + '"').join('; ') : ''}`);
    out();
  }
}

out('## Views');
out();
for (const v of views) {
  out(`### View \`${v.name}\``);
  out();
  out(`- Owner \`${v.owner}\`; options ${code((v.options ?? []).join(', ')) || 'none'}`);
  for (const r of [ROLES.app, ROLES.operator, ROLES.billing]) out(`- \`${r}\`: ${v.privileges[r] && v.privileges[r].length ? v.privileges[r].join(', ') : 'no privilege'}`);
  out();
  out('| # | Column | Type |');
  out('| --- | --- | --- |');
  v.columns.forEach((c, i) => out(`| ${i + 1} | \`${c.name}\` | ${code(c.type)} |`));
  out();
  out('```sql');
  out(v.view.trim());
  out('```');
  out();
}

for (const extra of args.append ?? []) {
  out('## Cross-checks');
  out();
  out('```text');
  out(readFileSync(extra, 'utf8').trim());
  out('```');
  out();
}

writeFileSync(args.out, lines.join('\n') + '\n');
if (args.json) {
  writeFileSync(args.json, JSON.stringify({ meta: { ...meta, commit: args.commit ?? null, branch: args.branch ?? null }, registry, enumTypes, tables: model, functions: fnModel }, null, 2) + '\n');
}
process.stdout.write(`wrote ${args.out}: ${tables.length} tables, ${views.length} views, ${registry.length} registered, ${tenantNotReg.length} tenant not registered, ${scoped.length} scoped, ${globals.length} global\n`);
