#!/usr/bin/env node
/**
 * generate-domain-model.mjs: write docs/product/domain-model.md (Change Order 001, CO-02) from a LIVE database
 * migrated with `pnpm db:migrate`, organized by area, with the divergences from the Data dictionary tab.
 *
 * It reads only the PostgreSQL catalog (pg_class, pg_attribute, pg_constraint, pg_index, pg_policy, pg_trigger,
 * pg_proc, privileges) plus two tables that are themselves catalog data: phi_table_registry and schema_migrations.
 * It never reads a row of any other table. It also reads, as text: the migration files (to say which migration
 * created each table and added each column, and which ADRs each migration's header cites), the Data dictionary
 * (docs/product/data-dictionary.md), an area map (areas.json) and the reviewed explanations of each divergence
 * (divergence-explanations.json).
 *
 * Usage:
 *   node generate-domain-model.mjs --database-url URL --pg-from <dir whose node_modules has pg> \
 *     --migrations <packages/db/migrations> --dictionary <docs/product/data-dictionary.md> \
 *     --areas areas.json --explanations divergence-explanations.json \
 *     [--out domain-model.md] [--check domain-model.md] [--json model.json] \
 *     [--commit SHA] [--branch NAME] [--append crosscheck.txt ...] [--strict] [--require-approval]
 *
 *   --out    writes the document.
 *   --check  regenerates and compares with an existing document, ignoring the "Approved by:" line a person
 *            fills in and the "Generated at commit" provenance line (so a commit that changes no schema still
 *            passes); exits 1 and prints the first differing lines when they differ (the CI gate: a migration
 *            merged without regenerating the document fails).
 *   --require-approval  with --check: also exits 1 unless the "Approved by:" line names a person, gives a date
 *            (YYYY-MM-DD) and carries the document SHA-256 of exactly this text, so an approval given to an
 *            earlier version of the document never carries over to a new one.
 *   --out    keeps the existing file's "Approved by:" line when the regenerated text is identical to it.
 *   --strict exits 1 when a divergence that is not informational has no reviewed explanation, or when an
 *            explanation names a divergence or a policy that no longer exists (explanations cannot go stale).
 *
 * The output is deterministic: no database name, no timestamp; everything is ordered by name or by the area map.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    'database-url': { type: 'string' },
    'pg-from': { type: 'string' },
    migrations: { type: 'string' },
    dictionary: { type: 'string' },
    areas: { type: 'string' },
    explanations: { type: 'string' },
    out: { type: 'string' },
    check: { type: 'string' },
    json: { type: 'string' },
    commit: { type: 'string' },
    branch: { type: 'string' },
    append: { type: 'string', multiple: true },
    strict: { type: 'boolean', default: false },
    'require-approval': { type: 'boolean', default: false },
    'owner-role': { type: 'string', default: 'tp_owner' },
    'app-role': { type: 'string', default: 'tp_app' },
  },
  strict: true,
});
for (const k of ['database-url', 'pg-from', 'migrations', 'dictionary', 'areas', 'explanations']) {
  if (!args[k]) die(`missing --${k}`);
}
if (!args.out && !args.check) die('give --out FILE to write, or --check FILE to compare');
if (args['require-approval'] && !args.check) die('--require-approval needs --check FILE');

function die(msg) {
  process.stderr.write(`generate-domain-model: ${msg}\n`);
  process.exit(2);
}

const requireFrom = createRequire(path.join(path.resolve(args['pg-from']), 'package.json'));
const pg = requireFrom('pg');
const OWNER = args['owner-role'];
const APP = args['app-role'];
const TENANT_EXPR = (col) => `(${col} = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))`;

// =============================================================================================
// 1. Catalog reads
// =============================================================================================
const client = new pg.Client({ connectionString: args['database-url'] });
await client.connect();
await client.query('SET search_path = public');
const q = async (text, values) => (await client.query(text, values)).rows;

const meta = (
  await q(`SELECT current_setting('server_version') AS version,
                  (SELECT count(*)::int FROM schema_migrations) AS migrations,
                  (SELECT max(filename) FROM schema_migrations) AS head`)
)[0];
const appliedMigrations = (await q('SELECT filename FROM schema_migrations ORDER BY filename')).map((r) => r.filename);

const roles = (
  await q(`SELECT rolname AS name, rolcanlogin AS login, rolbypassrls AS bypass, rolsuper AS super
             FROM pg_roles WHERE rolname LIKE 'tp\\_%' ORDER BY rolname`)
);
const groupRoles = roles.filter((r) => !r.login && r.name !== OWNER).map((r) => r.name);

const relations = await q(`
  SELECT c.oid::int AS oid, c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
         pg_get_userbyid(c.relowner) AS owner, c.reloptions AS options
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
   ORDER BY c.relname`);

const columns = await q(`
  SELECT c.relname AS table_name, a.attnum AS num, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
         a.attnotnull AS not_null, CASE WHEN a.attgenerated = '' THEN pg_get_expr(d.adbin, d.adrelid) END AS default_expr,
         CASE WHEN a.attidentity <> '' THEN a.attidentity::text END AS identity,
         CASE WHEN a.attgenerated <> '' THEN pg_get_expr(d.adbin, d.adrelid) END AS generated
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
         p.proname AS function_name, p.prosrc AS function_src
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
   ORDER BY c.relname, r.rolname`, [groupRoles]);

const columnPrivileges = await q(`
  SELECT table_name, grantee AS role, privilege_type AS priv, array_agg(column_name::text ORDER BY column_name)::text[] AS cols
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND grantee = ANY ($1::text[]) AND privilege_type IN ('SELECT','INSERT','UPDATE')
   GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, [groupRoles]);

const enumTypes = await q(`
  SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`);

const viewDefs = await q(`
  SELECT c.relname AS name, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY 1`);

const registry = (await q(`SELECT to_regclass('public.phi_table_registry') IS NOT NULL AS present`))[0].present
  ? await q('SELECT table_name, policy_name, registered_by FROM phi_table_registry ORDER BY table_name')
  : [];

const otherSchemas = await q(`
  SELECT n.nspname AS schema, count(c.oid)::int AS tables, pg_get_userbyid(n.nspowner) AS owner
    FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind IN ('r','p')
   WHERE n.nspname NOT IN ('public','pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg\\_%'
   GROUP BY 1, 3 ORDER BY 1`);

await client.end();

// =============================================================================================
// 2. Migrations as text: which migration created each table, added each column, and which ADRs it cites
// =============================================================================================
const migrationFiles = readdirSync(args.migrations).filter((f) => f.endsWith('.sql')).sort();
const notApplied = migrationFiles.filter((f) => !appliedMigrations.includes(f));
const appliedNotOnDisk = appliedMigrations.filter((f) => !migrationFiles.includes(f));
const migrationAdrs = new Map(); // file -> ['0013', ...]
const tableCreatedBy = new Map(); // table -> file
const columnAddedBy = new Map(); // `${table}.${col}` -> file
const tableTouchedBy = new Map(); // table -> Set(file)
const functionDefinedBy = new Map(); // function name -> Set(file) that CREATE (OR REPLACE) it
const unquote = (s) => s.replace(/^"|"$/g, '');
const touch = (t, f) => {
  if (!tableTouchedBy.has(t)) tableTouchedBy.set(t, new Set());
  tableTouchedBy.get(t).add(f);
};

/** Split SQL into statements on ';' outside single quotes, dollar quotes and comments; comments removed. */
function statementsOf(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let dollar = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (dollar) {
      if (sql.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; }
      cur += ch; i++; continue;
    }
    if (ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } if (sql[j] === "'") break; j++; }
      cur += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { dollar = m[0]; cur += dollar; i += dollar.length; continue; }
    }
    if (ch === ';') { out.push(cur.trim()); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Top-level comma-separated items of a parenthesized body. */
function topItems(body) {
  const items = [];
  let depth = 0, cur = '', quote = false;
  for (const ch of body) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === ',') { items.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

const NAME = '("[^"]+"|[a-z_][a-z0-9_]*)';
for (const file of migrationFiles) {
  const sql = readFileSync(path.join(args.migrations, file), 'utf8');
  // The header: the leading run of comment lines (and blank lines) before the first statement.
  const headerLines = [];
  for (const line of sql.split('\n')) {
    if (/^\s*--/.test(line) || /^\s*$/.test(line)) headerLines.push(line);
    else break;
  }
  const header = headerLines.join('\n');
  const adrs = new Set();
  for (const m of header.matchAll(/(?:adr\/|ADR )(\d{4})((?:(?:,| and) \d{4})*)/g)) {
    adrs.add(m[1]);
    for (const extra of (m[2] ?? '').matchAll(/\d{4}/g)) adrs.add(extra[0]);
  }
  migrationAdrs.set(file, [...adrs].sort());
  for (const st of statementsOf(sql)) {
    let m;
    if ((m = new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${NAME}\\s*\\(`, 'i').exec(st))) {
      const t = unquote(m[1]);
      if (!tableCreatedBy.has(t)) tableCreatedBy.set(t, file);
      touch(t, file);
      const body = st.slice(st.indexOf('(') + 1, st.lastIndexOf(')'));
      for (const item of topItems(body)) {
        const cm = new RegExp(`^${NAME}\\s`, 'i').exec(item);
        if (!cm) continue;
        const col = unquote(cm[1]);
        if (/^(constraint|primary|unique|check|foreign|exclude|like)$/i.test(col)) continue;
        if (!columnAddedBy.has(`${t}.${col}`)) columnAddedBy.set(`${t}.${col}`, file);
      }
      continue;
    }
    if ((m = new RegExp(`^CREATE (?:OR REPLACE )?(?:MATERIALIZED )?VIEW ${NAME}`, 'i').exec(st))) {
      const t = unquote(m[1]);
      if (!tableCreatedBy.has(t)) tableCreatedBy.set(t, file);
      touch(t, file);
      continue;
    }
    if ((m = new RegExp(`^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:public\\.)?${NAME}`, 'i').exec(st))) {
      const t = unquote(m[1]);
      touch(t, file);
      for (const am of st.matchAll(new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?${NAME}`, 'gi'))) {
        const col = unquote(am[1]);
        if (!columnAddedBy.has(`${t}.${col}`)) columnAddedBy.set(`${t}.${col}`, file);
      }
      continue;
    }
    if ((m = new RegExp(`^CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?${NAME}\\s*\\(`, 'i').exec(st))) {
      const fn = unquote(m[1]);
      if (!functionDefinedBy.has(fn)) functionDefinedBy.set(fn, new Set());
      functionDefinedBy.get(fn).add(file);
      continue;
    }
    if ((m = new RegExp(`^CREATE (?:CONSTRAINT )?TRIGGER \\S+ [\\s\\S]*? ON (?:public\\.)?${NAME}`, 'i').exec(st))) { touch(unquote(m[1]), file); continue; }
    if ((m = new RegExp(`^CREATE POLICY \\S+ ON (?:public\\.)?${NAME}`, 'i').exec(st))) { touch(unquote(m[1]), file); continue; }
    if ((m = new RegExp(`^(?:DROP POLICY|ALTER POLICY) (?:IF EXISTS )?\\S+ ON (?:public\\.)?${NAME}`, 'i').exec(st))) { touch(unquote(m[1]), file); continue; }
  }
}
const short = (file) => file.replace(/\.sql$/, '');
const adrList = (file) => (migrationAdrs.get(file) ?? []).map((a) => `ADR ${a}`).join(', ');
const migRef = (file) => (file ? `\`${short(file)}\`${adrList(file) ? ` (${adrList(file)})` : ''}` : 'not found in the migration files');

// =============================================================================================
// 3. Model
// =============================================================================================
const by = (list, key) => {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item);
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
const areaFile = JSON.parse(readFileSync(args.areas, 'utf8'));
const createdOutside = areaFile.createdOutsideMigrations ?? {};

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
const encryptedColumnsOf = (def) => [...def.matchAll(/([a-z_][a-z0-9_]*)\s*~\s*'\^enc:v1:/g)].map((m) => m[1]);
function raisesOf(src) {
  if (!src) return [];
  const msgs = [];
  for (const m of src.matchAll(/RAISE\s+EXCEPTION\s+'((?:[^']|'')*)'/gi)) msgs.push(m[1].replace(/''/g, "'"));
  return [...new Set(msgs)];
}
const ON_DELETE = { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null', d: 'set default' };
const CMD = { '*': 'ALL', r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };

const model = relations.map((rel) => {
  const isView = rel.kind === 'v' || rel.kind === 'm';
  const cols = colsBy.get(rel.name) ?? [];
  const cons = consBy.get(rel.name) ?? [];
  const pk = cons.find((c) => c.type === 'p');
  const checks = cons.filter((c) => c.type === 'c');
  const fks = cons.filter((c) => c.type === 'f');
  const pcol = cols.find((c) => c.name === 'practice_id');
  const enc = new Set(checks.flatMap((c) => encryptedColumnsOf(c.def)));
  const enums = {};
  for (const c of checks) for (const e of enumerationOf(c.def)) enums[e.column] = [...new Set([...(enums[e.column] ?? []), ...e.values])];
  const pols = polBy.get(rel.name) ?? [];
  const reg = regBy.get(rel.name);
  const tenantCol = rel.name === 'practice' ? 'id' : 'practice_id';
  let classification;
  if (isView) classification = 'view';
  else if (reg) classification = 'PHI (registered)';
  else if (pcol) classification = pcol.not_null ? 'tenant, NOT registered' : 'tenant (nullable practice_id), not registered';
  else if (rel.rls) classification = 'organization- or user-scoped (RLS, no practice_id)';
  else classification = 'global (no practice_id, no RLS)';
  const privs = Object.fromEntries((privBy.get(rel.name) ?? []).map((p) => [p.role, p]));
  const privilegeList = (role) => {
    const p = privs[role];
    if (!p) return [];
    const parts = [];
    if (p.sel) parts.push('SELECT'); else if (p.col_sel) parts.push('SELECT(cols)');
    if (p.ins) parts.push('INSERT'); else if (p.col_ins) parts.push('INSERT(cols)');
    if (p.upd) parts.push('UPDATE'); else if (p.col_upd) parts.push('UPDATE(cols)');
    if (p.del) parts.push('DELETE');
    if (p.trunc) parts.push('TRUNCATE');
    return parts;
  };
  return {
    name: rel.name,
    isView,
    owner: rel.owner,
    options: rel.options,
    rls: rel.rls,
    forced: rel.forced,
    classification,
    practiceId: rel.name === 'practice' ? 'id (the tenant key)' : pcol ? (pcol.not_null ? 'uuid NOT NULL' : 'uuid NULL') : null,
    registry: reg ? { policy: reg.policy_name, registeredBy: reg.registered_by } : null,
    tenantPolicyOk: reg ? pols.some((p) => p.name === reg.policy_name && p.cmd === '*' && p.permissive && p.using_expr === TENANT_EXPR(tenantCol) && p.check_expr === TENANT_EXPR(tenantCol)) : null,
    createdBy: tableCreatedBy.get(rel.name) ?? null,
    createdOutside: createdOutside[rel.name] ?? null,
    touchedBy: [...new Set([...(tableTouchedBy.get(rel.name) ?? []), ...(trgBy.get(rel.name) ?? []).flatMap((t) => [...(functionDefinedBy.get(t.function_name) ?? [])].filter((f) => !tableCreatedBy.get(rel.name) || f > tableCreatedBy.get(rel.name)))])].sort(),
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
      addedBy: columnAddedBy.get(`${rel.name}.${c.name}`) ?? null,
    })),
    primaryKey: pk ? pk.cols : null,
    uniques: cons.filter((c) => c.type === 'u').map((u) => ({ name: u.name, cols: u.cols, def: u.def })),
    foreignKeys: fks.map((f) => ({ name: f.name, cols: f.cols, refTable: f.ref_table, refCols: f.ref_cols, onDelete: ON_DELETE[f.on_delete] ?? f.on_delete, deferrable: f.deferrable })),
    checks: checks.map((c) => ({ name: c.name, def: c.def })),
    exclusions: cons.filter((c) => c.type === 'x').map((c) => ({ name: c.name, def: c.def })),
    indexes: (idxBy.get(rel.name) ?? []).map((i) => ({ name: i.name, def: i.def, primary: i.is_primary, unique: i.is_unique, backsConstraint: i.backs_constraint })),
    policies: pols.map((p) => ({ name: p.name, command: CMD[p.cmd] ?? p.cmd, permissive: p.permissive, roles: p.roles, using: p.using_expr, withCheck: p.check_expr })),
    triggers: (trgBy.get(rel.name) ?? []).map((t) => ({ name: t.name, def: t.def, function: t.function_name, raises: raisesOf(t.function_src) })),
    privileges: Object.fromEntries(groupRoles.map((r) => [r, privilegeList(r)])),
    columnGrants: (colPrivBy.get(rel.name) ?? [])
      .filter((cp) => !(privs[cp.role] && ((cp.priv === 'INSERT' && privs[cp.role].ins) || (cp.priv === 'UPDATE' && privs[cp.role].upd) || (cp.priv === 'SELECT' && privs[cp.role].sel))))
      .map((cp) => ({ role: cp.role, priv: cp.priv, cols: cp.cols })),
    view: viewBy.get(rel.name) ?? null,
  };
});
const byName = new Map(model.map((t) => [t.name, t]));
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
  setsScope: /set_config\s*\(\s*'app\.practice_ids'/i.test(f.src ?? '') || f.config.some((c) => c.startsWith('app.practice_ids=')),
}));
const rolesWithTablePrivileges = groupRoles.filter((r) => model.some((t) => t.privileges[r].length > 0));

// =============================================================================================
// 4. Areas
// =============================================================================================
const areaMap = areaFile.areas;
const areaOf = new Map();
const areaProblems = [];
for (const a of areaMap) for (const t of a.tables) {
  if (areaOf.has(t)) areaProblems.push(`${t} is in two areas (${areaOf.get(t).id}, ${a.id})`);
  areaOf.set(t, a);
  if (!byName.has(t)) areaProblems.push(`${t} is in area ${a.id} but not in the database`);
}
for (const t of model) if (!areaOf.has(t.name)) areaProblems.push(`${t.name} is in no area: add it to areas.json`);
if (areaProblems.length) die(`the area map does not match the schema:\n  ${areaProblems.join('\n  ')}`);

// =============================================================================================
// 5. The Data dictionary, and the divergences from it
// =============================================================================================
const dictMd = readFileSync(args.dictionary, 'utf8');
function splitTop(s) {
  const parts = [];
  let depth = 0, tick = false, cur = '';
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (!tick && ch === '(') depth++;
    if (!tick && ch === ')') depth--;
    if (!tick && depth === 0 && (ch === ',' || ch === ';')) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
function parseField(item) {
  const m = /^(unique\s+)?`([^`]+)`\s*(?:\(([^)]*(?:\([^)]*\)[^)]*)*)\))?\s*(.*)$/.exec(item);
  if (!m) return { raw: item };
  const [, uniq, tok, paren] = m;
  if (uniq || tok.startsWith('(')) return { unique: tok.replace(/[()]/g, '').split(',').map((x) => x.trim()) };
  const [name, ...typeParts] = tok.split(/\s+/);
  const f = { name, type: typeParts.join(' ') || null, paren: paren ?? null };
  if (paren) {
    const p = paren.trim();
    if (/^enc$/i.test(p)) f.enc = true;
    else if (/^nullable/i.test(p) || /or null$/i.test(p)) f.nullable = true;
    else if (/^jsonb:/i.test(p)) f.type = 'jsonb';
    else if (/^bool$/i.test(p)) f.type = 'boolean';
    else if (/^[a-z0-9_]+(\s*,\s*[a-z0-9_]+)+$/i.test(p)) f.enumeration = p.split(',').map((x) => x.trim());
  }
  return f;
}
const dictEntries = [];
{
  let section = null;
  for (const line of dictMd.split('\n')) {
    const h = /^## (.*)$/.exec(line);
    if (h) { section = h[1].trim(); continue; }
    if (!line.startsWith('| `')) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    const tables = [...cells[0].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    const purpose = cells[1];
    let keyFields = cells[2] ?? '';
    const policy = cells[3] ?? null;
    const notes = [];
    const perTable = {};
    if (tables.includes('usage_snapshot')) {
      const idx = keyFields.indexOf('`usage_snapshot` rows:');
      perTable.usage_snapshot = keyFields.slice(idx + '`usage_snapshot` rows:'.length);
      notes.push(keyFields.slice(0, idx).trim());
      keyFields = '';
    }
    if (/^pg-boss tables plus/.test(keyFields)) keyFields = keyFields.replace(/^pg-boss tables plus\s*/, '');
    for (const t of tables) {
      const fields = [], uniques = [], extra = [];
      for (const item of splitTop(perTable[t] ?? keyFields)) {
        if (!item) continue;
        if (!item.includes('`')) { extra.push(item); continue; }
        const f = parseField(item);
        if (f.unique) uniques.push(f.unique); else if (f.name) fields.push(f); else extra.push(item);
      }
      dictEntries.push({ table: t, section, purpose, policy, fields, uniques, notes: [...notes, ...extra] });
    }
  }
}
const dictByTable = new Map(dictEntries.map((e) => [e.table, e]));
const idxSection = dictMd.split('## Indexes that matter')[1] ?? '';
const wantedIndexes = [...idxSection.matchAll(/`([a-z_]+) \(([^)]*)\)([^`]*)`([^,`]*)/g)].map((m) => ({ table: m[1], cols: m[2].split(',').map((c) => c.trim()), predicate: m[3].trim() || null, raw: m[0].trim() }));

const STANDARD = new Set(['id', 'created_at', 'updated_at']);
const INFORMATIONAL = new Set(['extra column', 'extra table', 'type note']);
const divergences = [];
const matches = { fields: 0, typed: 0, enumerations: [], uniques: [], indexes: [], encrypted: [], immutable: [] };
const add = (table, field, kind, dictionary, schema) => divergences.push({ key: `${table}|${field}|${kind}`, table, field, kind, dictionary, schema });
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const indexCols = (def) => { const m = /\(([^)]*)\)/.exec(def.replace(/^.*USING \w+ /, '')); return m ? m[1].split(',').map((x) => x.trim().replace(/ (DESC|ASC)$/i, '')) : []; };
const indexShort = (def) => def.replace(/^CREATE (UNIQUE )?INDEX (\S+) ON public\.\S+ USING \w+ /, '$2 ');
const norm = (s) => s.replace(/\s+/g, '').toLowerCase().replace('timestamptz', 'timestampwithtimezone');
const tokens = (n) => n.split('_').filter(Boolean);
function similar(name, cols) {
  const t = new Set(tokens(name));
  return cols.map((c) => ({ c, s: tokens(c.name).filter((x) => t.has(x)).length / Math.max(t.size, tokens(c.name).length) }))
    .filter((x) => x.s >= 0.5 && x.c.name !== name).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.c.name);
}

for (const e of dictEntries) {
  const t = byName.get(e.table);
  if (!t) { add(e.table, '', 'missing table', `${e.section}: ${e.purpose}`, 'absent from schema public'); continue; }
  const colBy = new Map(t.columns.map((c) => [c.name, c]));
  for (const f of e.fields) {
    const c = colBy.get(f.name);
    if (!c) {
      const sim = similar(f.name, t.columns);
      add(e.table, f.name, sim.length ? 'renamed' : 'missing column', f.name + (f.type ? ' ' + f.type : ''), sim.length ? `absent; nearest columns: ${sim.join(', ')}` : 'absent');
      continue;
    }
    matches.fields++;
    let typeOk = true;
    if (f.type && !norm(f.type).startsWith('jsonb') && norm(f.type) !== norm(c.type)) { add(e.table, f.name, 'retyped', f.type, c.type); typeOk = false; }
    if (!f.type && /_cents$/.test(f.name) && c.type !== 'bigint') { add(e.table, f.name, 'retyped', 'bigint (the _cents convention)', c.type); typeOk = false; }
    if (!f.type && /_at$/.test(f.name) && c.type !== 'timestamp with time zone') { add(e.table, f.name, 'retyped', 'timestamptz (the _at convention)', c.type); typeOk = false; }
    if (!f.type && /(_on|_date)$/.test(f.name) && c.type !== 'date') { add(e.table, f.name, 'retyped', 'date (calendar date convention)', c.type); typeOk = false; }
    if (!f.type && /_id$/.test(f.name) && c.type !== 'uuid') add(e.table, f.name, 'type note', 'uuid (read from the _id suffix)', `${c.type}: an identifier read from the source file, not a key`);
    if (f.type === 'jsonb' && c.type !== 'jsonb') { add(e.table, f.name, 'retyped', 'jsonb', c.type); typeOk = false; }
    if (typeOk) matches.typed++;
    if (f.enumeration) {
      if (!c.enumeration) add(e.table, f.name, 'enumeration not enforced', f.enumeration.join(', '), `${c.type} with no CHECK list`);
      else {
        const missing = f.enumeration.filter((v) => !c.enumeration.includes(v));
        const extra = c.enumeration.filter((v) => !f.enumeration.includes(v));
        if (missing.length || extra.length) add(e.table, f.name, 'enumeration differs', f.enumeration.join(', '), `${c.enumeration.join(', ')}${extra.length ? ` (schema adds ${extra.join(', ')})` : ''}${missing.length ? ` (schema lacks ${missing.join(', ')})` : ''}`);
        else matches.enumerations.push(`${e.table}.${f.name} (${c.enumeration.length})`);
      }
    }
    if (f.enc && !c.encrypted) add(e.table, f.name, 'encryption', 'marked (enc)', 'no enc:v1 CHECK');
    if (f.enc && c.encrypted) matches.encrypted.push(`${e.table}.${f.name}`);
    if (!f.enc && c.encrypted) add(e.table, f.name, 'encryption', 'listed, not marked (enc)', 'encrypted: enc:v1 CHECK');
    if (f.nullable && c.notNull) add(e.table, f.name, 'nullability', 'nullable', 'NOT NULL');
  }
  for (const c of t.columns) if (c.encrypted && !e.fields.some((f) => f.name === c.name)) add(e.table, c.name, 'encryption', 'not listed', 'encrypted: enc:v1 CHECK');
  for (const u of e.uniques) {
    const has = t.uniques.some((x) => sameSet(x.cols, u)) || t.indexes.some((i) => i.unique && sameSet(indexCols(i.def), u));
    if (has) matches.uniques.push(`${e.table} (${u.join(', ')})`);
    else add(e.table, `unique (${u.join(', ')})`, 'unique differs', `unique (${u.join(', ')})`, t.uniques.map((x) => `${x.name} (${x.cols.join(', ')})`).join('; ') || 'no unique constraint');
  }
  const extra = t.columns.filter((c) => !STANDARD.has(c.name) && !e.fields.some((f) => f.name === c.name));
  for (const c of extra) add(e.table, c.name, 'extra column', '-', `${c.type}${c.notNull ? ' NOT NULL' : ''}`);
  if (!t.isView && !t.columns.some((c) => c.name === 'created_at') && !e.fields.some((f) => /(^|_)(at|on)$/.test(f.name) && /created|^at$/.test(f.name))) add(e.table, 'created_at', 'convention', 'created_at timestamptz (dictionary convention)', 'absent');
  if (!t.isView && !t.columns.some((c) => c.name === 'updated_at')) add(e.table, 'updated_at', 'convention', 'updated_at timestamptz (dictionary convention)', 'absent');
  if (e.notes.some((n) => /triggers reject update and delete/.test(n))) {
    const ok = t.triggers.some((x) => /UPDATE/.test(x.def)) && t.triggers.some((x) => /DELETE/.test(x.def));
    if (!ok) add(e.table, '', 'invariant missing', 'triggers reject update and delete', t.triggers.map((x) => x.name).join(', '));
    else matches.immutable.push(e.table);
  }
  const phiSection = /\(PHI\)|PHI references|PHI-adjacent; confidential/.test(e.section ?? '');
  const noPhiSection = /no PHI by design/.test(e.section ?? '');
  if (/\(PHI\)/.test(e.section ?? '') && !t.registry && !t.practiceId?.includes('NULL')) add(e.table, '', 'classification', `${e.section}: a PHI table with a registry row`, t.classification);
  if (noPhiSection && t.registry) add(e.table, '', 'classification', `${e.section}`, `${t.classification}: practice_id NOT NULL and a phi_table_registry row`);
  if (!phiSection && !noPhiSection && t.registry === null && t.practiceId === 'uuid NOT NULL') add(e.table, '', 'classification', e.section, t.classification);
}
for (const t of model) {
  if (t.classification.startsWith('global')) {
    const app = t.privileges[APP] ?? [];
    if (app.some((p) => /INSERT|UPDATE|DELETE/.test(p))) add(t.name, '', 'global privileges', `${APP} may not INSERT, UPDATE or DELETE a global table`, app.join(', '));
  }
  if (t.registry && t.name !== 'practice' && !t.indexes.some((i) => indexCols(i.def)[0] === 'practice_id')) add(t.name, 'practice_id', 'convention', 'practice_id indexed (PHI convention)', 'no index leads with practice_id');
}
for (const w of wantedIndexes) {
  const t = byName.get(w.table);
  if (!t) { add(w.table, `index (${w.cols.join(', ')})`, 'index', w.raw, 'table absent'); continue; }
  const want = w.cols.map((c) => c.replace(/ (desc|asc)$/i, ''));
  const match = t.indexes.find((i) => want.every((c, k) => indexCols(i.def)[k] === c));
  if (!match) {
    const lead = t.indexes.filter((i) => indexCols(i.def)[0] === want[0]).map((i) => indexShort(i.def));
    add(w.table, `index (${w.cols.join(', ')})`, 'index', w.raw, lead.join('; ') || 'no index with that leading column');
  } else {
    const issues = [];
    if (/desc/i.test(w.cols.join(' ')) && !/DESC/.test(match.def)) issues.push('not DESC');
    if (w.predicate && !/WHERE/.test(match.def)) issues.push('no partial predicate');
    if (issues.length) add(w.table, `index (${w.cols.join(', ')})`, 'index', w.raw, `${indexShort(match.def)} (${issues.join(', ')})`);
    else matches.indexes.push(indexShort(match.def));
  }
}
for (const t of model) if (!dictByTable.has(t.name)) add(t.name, '', 'extra table', 'not in the Data dictionary', t.classification);

// Reviewed explanations
const expl = JSON.parse(readFileSync(args.explanations, 'utf8'));
const strictProblems = [];
const explained = new Map(Object.entries(expl.rows ?? {}));
for (const k of explained.keys()) if (!divergences.some((d) => d.key === k)) strictProblems.push(`explanation for a divergence that no longer exists: ${k}`);
for (const d of divergences) {
  const ex = explained.get(d.key);
  d.by = ex?.by ?? null;
  d.status = ex?.status ?? null;
  d.text = ex?.text ?? null;
  if (!ex && !INFORMATIONAL.has(d.kind)) strictProblems.push(`no reviewed explanation for ${d.key}`);
}
for (const p of expl.policies ?? []) {
  const t = byName.get(p.table);
  if (!t) { strictProblems.push(`policy note names table ${p.table}, which does not exist`); continue; }
  for (const name of p.policies) if (!t.policies.some((x) => x.name === name)) strictProblems.push(`policy note for ${p.table} names policy ${name}, which does not exist`);
}
if (args.strict && strictProblems.length) die(`--strict:\n  ${strictProblems.join('\n  ')}`);

// =============================================================================================
// 6. Markdown
// =============================================================================================
const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '));
const code = (s) => (s === null || s === undefined || s === '' ? '' : '`' + esc(s).replace(/`/g, "'") + '`');
const anchor = (t) => `table-${t.replace(/_/g, '-')}`;
const link = (t) => `[\`${t}\`](#${anchor(t)})`;
const priv = (t, r) => (t.privileges[r]?.length ? t.privileges[r].join(', ') : '-');
const L = [];
const out = (s = '') => L.push(s);

const tables = model.filter((t) => !t.isView);
const views = model.filter((t) => t.isView);
const phi = tables.filter((t) => t.registry);
const tenantNotReg = tables.filter((t) => !t.registry && t.practiceId);
const scoped = tables.filter((t) => !t.practiceId && t.rls);
const globals = tables.filter((t) => !t.practiceId && !t.rls);

const PROVENANCE_PREFIX = '- Generated at commit ';
out('# Domain model');
out();
out('> Generated from the live schema by `generate-domain-model.mjs` (CO-02). It reads the PostgreSQL catalog of a database migrated with `pnpm db:migrate`, the migration files, the Data dictionary tab (`docs/product/data-dictionary.md`), the area map and the reviewed explanations of each divergence. Do not edit it by hand: regenerate it. A person fills in only the name and the date on the "Approved by" line at the end, and leaves its document hash as it is.');
out();
out(`${PROVENANCE_PREFIX}\`${args.commit || 'unknown'}\` on branch \`${args.branch || 'unknown'}\` (provenance only: \`--check\` ignores this line, so a commit that changes no schema keeps the document valid)`);
out(`- Migrations applied: ${meta.migrations}; head \`${meta.head}\`${notApplied.length ? `; on disk but NOT applied: ${notApplied.map(code).join(', ')}` : ''}${appliedNotOnDisk.length ? `; applied but not on disk: ${appliedNotOnDisk.map(code).join(', ')}` : ''}`);
out(`- PostgreSQL ${meta.version.split(' ')[0]}; schema \`public\`: ${tables.length} tables (including \`schema_migrations\`), ${views.length} view(s); PostgreSQL enum types: ${enumTypes.length}${enumTypes.length ? '' : ' (every enumeration is a CHECK constraint)'}`);
out(`- PHI flag: ${phi.length} tables in \`phi_table_registry\`; ${tenantNotReg.length} tenant tables with a nullable \`practice_id\` outside it; ${scoped.length} organization- or user-scoped tables with RLS forced; ${globals.length} global tables`);
out(`- RLS: ${tables.filter((t) => t.rls && t.forced).length} tables ENABLE and FORCE row-level security; ${tables.filter((t) => t.rls && !t.forced).length} enable without forcing; ${tables.filter((t) => !t.rls).length} have none (the global tables); ${policies.length} policies`);
out(`- Functions in \`public\`: ${fnModel.length} (${fnModel.filter((f) => f.securityDefiner).length} SECURITY DEFINER); triggers: ${triggers.length}`);
out(`- Roles (group roles; login roles are per environment and not listed): ${roles.filter((r) => !r.login).map((r) => `\`${r.name}\`${r.bypass ? ' BYPASSRLS' : ''}${r.super ? ' SUPERUSER' : ''}`).join(', ')}; every relation is owned by \`${OWNER}\`${model.every((t) => t.owner === OWNER) ? '' : ' EXCEPT ' + model.filter((t) => t.owner !== OWNER).map((t) => t.name).join(', ')}`);
if (otherSchemas.length) out(`- Other schemas: ${otherSchemas.map((s) => `\`${s.schema}\` (${s.tables} tables, owner \`${s.owner}\`)`).join(', ')}; not described here`);
out(`- Divergences from the Data dictionary: ${divergences.filter((d) => !INFORMATIONAL.has(d.kind)).length} to approve, ${divergences.filter((d) => d.kind === 'extra table').length} tables and ${divergences.filter((d) => d.kind === 'extra column').length} columns not in it (informational); see [Divergences from the Data dictionary](#divergences-from-the-data-dictionary)`);
out();
out('## Contents');
out();
out('1. [How to read this document](#how-to-read-this-document)');
out('2. [Areas](#areas)');
out('3. [PHI flag and row-level security by table](#phi-flag-and-row-level-security-by-table)');
areaMap.forEach((a, i) => out(`${i + 4}. [${a.title}](#area-${a.id})`));
let n = areaMap.length + 4;
out(`${n++}. [Divergences from the Data dictionary](#divergences-from-the-data-dictionary)`);
out(`${n++}. [Appendix A: enumerations](#appendix-a-enumerations)`);
out(`${n++}. [Appendix B: encrypted columns](#appendix-b-encrypted-columns)`);
out(`${n++}. [Appendix C: functions](#appendix-c-functions)`);
if (args.append?.length) out(`${n++}. [Cross-checks](#cross-checks)`);
out(`${n++}. [Approval](#approval)`);
out();

out('## How to read this document');
out();
out('- **Class** (the PHI flag): `PHI (registered)` means `practice_id uuid NOT NULL`, a row in `phi_table_registry`, ENABLE and FORCE ROW LEVEL SECURITY, and the registered tenant policy, PERMISSIVE FOR ALL with USING and WITH CHECK exactly `practice_id = ANY (current_setting(\'app.practice_ids\', true)::uuid[])` (`id` for `practice`). `tenant (nullable practice_id), not registered` is a table the catalog test allows with a nullable `practice_id` (`NULLABLE_PRACTICE_ID_TABLES` in `packages/db/src/catalog.ts`). `organization- or user-scoped` has no `practice_id` and forces RLS on another key. `global` has no `practice_id` and no RLS; the application role may only read it.');
out(`- **Roles**: \`${OWNER}\` owns every relation and runs migrations; \`${APP}\` is the application role (owns nothing, cannot bypass RLS); the other group roles appear where they hold a privilege. Privileges are listed as SELECT, INSERT, UPDATE, DELETE; \`(cols)\` means a column-level grant, listed under the table.`);
out('- **Since**: the migration that created the table or added the column, read from the migration files. The ADRs a migration cites in its header are shown beside it.');
out('- **Invariants** are what the database enforces: CHECK, UNIQUE, foreign key and exclusion constraints, and triggers, each trigger with the exceptions its function raises (the invariant in its own words). Policies are the row-level security policies.');
out('- **Dictionary**: the section and purpose the Data dictionary tab gives the table, or "not in the Data dictionary".');
out();

out('## Areas');
out();
out('| # | Area | Data dictionary section | Tables | PHI (registered) | About |');
out('| --- | --- | --- | --- | --- | --- |');
areaMap.forEach((a, i) => out(`| ${i + 4} | [${a.title}](#area-${a.id}) | ${esc(a.dictionary)} | ${a.tables.length} | ${a.tables.filter((t) => byName.get(t).registry).length} | ${esc(a.about)} |`));
out();

out('## PHI flag and row-level security by table');
out();
out(`| Table | Area | Class | practice_id | RLS | FORCE | Policies | Triggers | ${rolesWithTablePrivileges.join(' | ')} |`);
out(`| --- | --- | --- | --- | --- | --- | --- | --- | ${rolesWithTablePrivileges.map(() => '---').join(' | ')} |`);
for (const t of model) out(`| ${link(t.name)} | ${areaOf.get(t.name).title} | ${t.classification} | ${t.practiceId ?? '-'} | ${t.rls ? 'yes' : 'no'} | ${t.forced ? 'yes' : 'no'} | ${t.policies.length} | ${t.triggers.length} | ${rolesWithTablePrivileges.map((r) => priv(t, r)).join(' | ')} |`);
out();
out(`Registered tables whose registered policy does not qualify: ${phi.filter((t) => !t.tenantPolicyOk).map((t) => code(t.name)).join(', ') || 'none'}. Tenant tables with practice_id NOT NULL outside the registry: ${tables.filter((t) => t.classification === 'tenant, NOT registered').map((t) => code(t.name)).join(', ') || 'none'}. Tables with RLS enabled but not forced: ${tables.filter((t) => t.rls && !t.forced).map((t) => code(t.name)).join(', ') || 'none'}.`);
out();

const sinceCell = (file) => (file ? `\`${file.slice(0, 14)}\`` : '?');
areaMap.forEach((a, ai) => {
  out(`## ${ai + 4}. ${a.title}`);
  out();
  out(`<a id="area-${a.id}"></a>`);
  out();
  out(esc(a.about));
  out();
  out(`| Table | Class | RLS / FORCE | Policies | ${APP} | Created by | Dictionary |`);
  out('| --- | --- | --- | --- | --- | --- | --- |');
  for (const name of a.tables) {
    const t = byName.get(name);
    const d = dictByTable.get(name);
    out(`| ${link(name)} | ${t.classification} | ${t.rls ? 'yes' : 'no'} / ${t.forced ? 'yes' : 'no'} | ${t.policies.length} | ${priv(t, APP)} | ${t.createdBy ? code(short(t.createdBy)) : t.createdOutside ? esc(t.createdOutside) : '?'} | ${d ? esc(d.purpose) : 'not in the Data dictionary'} |`);
  }
  out();
  for (const name of a.tables) {
    const t = byName.get(name);
    const d = dictByTable.get(name);
    out(`### ${t.isView ? 'View' : 'Table'} \`${t.name}\``);
    out();
    out(`<a id="${anchor(t.name)}"></a>`);
    out();
    out(`- Class: ${t.classification}${t.registry ? `; registry policy \`${t.registry.policy}\`, registered by \`${t.registry.registeredBy}\`, qualifies: ${t.tenantPolicyOk ? 'yes' : '**NO**'}` : ''}`);
    out(`- Row-level security: ${t.rls ? 'enabled' : 'not enabled'}${t.forced ? ', forced' : ''}; ${t.policies.length} ${t.policies.length === 1 ? 'policy' : 'policies'}; owner \`${t.owner}\``);
    out(`- Dictionary: ${d ? `${esc(d.section)}: ${esc(d.purpose)}${d.policy ? `; policy "${esc(d.policy)}"` : ''}` : 'not in the Data dictionary'}`);
    const later = t.touchedBy.filter((f) => f !== t.createdBy);
    out(`- Created by ${t.createdOutside ? esc(t.createdOutside) : migRef(t.createdBy)}${later.length ? `; its DDL, policies or trigger functions changed by ${later.map((f) => code(short(f))).join(', ')}` : ''}`);
    if (!t.isView) out(`- Primary key: ${t.primaryKey ? t.primaryKey.map(code).join(', ') : '**none**'}`);
    out(`- Privileges: ${groupRoles.filter((r) => t.privileges[r].length).map((r) => `\`${r}\` ${t.privileges[r].join(', ')}`).join('; ') || 'none for any group role'}`);
    for (const g of t.columnGrants) out(`- Column grant: \`${g.role}\` ${g.priv} (${g.cols.map(code).join(', ')})`);
    out();
    out('| # | Column | Type | Null | Default | References | Since | Notes |');
    out('| --- | --- | --- | --- | --- | --- | --- | --- |');
    t.columns.forEach((c, i) => {
      const notes = [];
      if (c.encrypted) notes.push('encrypted (enc:v1)');
      if (c.enumeration) notes.push('one of ' + c.enumeration.join(', '));
      if (c.identity) notes.push('identity ' + c.identity);
      if (c.generated) notes.push('generated from ' + code(c.generated));
      if (d && !STANDARD.has(c.name) && !d.fields.some((f) => f.name === c.name)) notes.push('not in the dictionary');
      out(`| ${i + 1} | \`${c.name}\` | ${code(c.type)} | ${c.notNull ? 'NOT NULL' : 'null'} | ${code(c.default)} | ${c.fk.map(code).join('<br>')} | ${t.isView ? '' : t.createdOutside ? 'runner' : sinceCell(c.addedBy)} | ${notes.join('; ')} |`);
    });
    out();
    if (t.isView) {
      out(`View options: ${code((t.options ?? []).join(', ')) || 'none'}.`);
      out();
      out('```sql');
      out(t.view.trim());
      out('```');
      out();
      continue;
    }
    out('Keys:');
    out(`- Primary: ${t.primaryKey ? '(' + t.primaryKey.join(', ') + ')' : 'none'}`);
    for (const u of t.uniques) out(`- Unique \`${u.name}\`: ${code(u.def)}`);
    for (const i of t.indexes.filter((x) => x.unique && !x.primary && !x.backsConstraint)) out(`- Unique index \`${i.name}\`: ${code(i.def.replace(/^CREATE UNIQUE INDEX \S+ ON public\.\S+ /, ''))}`);
    for (const f of t.foreignKeys) out(`- Foreign \`${f.name}\`: (${f.cols.join(', ')}) -> \`${f.refTable}\`(${f.refCols.join(', ')}), on delete ${f.onDelete}${f.deferrable ? ', deferrable' : ''}`);
    out();
    const nonUniqueIdx = t.indexes.filter((x) => !x.unique);
    if (nonUniqueIdx.length) {
      out('Indexes:');
      for (const i of nonUniqueIdx) out(`- \`${i.name}\`: ${code(i.def.replace(/^CREATE INDEX \S+ ON public\.\S+ /, ''))}`);
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
    if (t.checks.length || t.exclusions.length) {
      out('Invariants enforced by constraints:');
      for (const c of t.checks) out(`- \`${c.name}\`: ${code(c.def)}`);
      for (const c of t.exclusions) out(`- \`${c.name}\` (exclusion): ${code(c.def)}`);
      out();
    }
    const invariantTriggers = t.triggers.filter((x) => x.function !== 'set_updated_at');
    const housekeeping = t.triggers.filter((x) => x.function === 'set_updated_at');
    if (invariantTriggers.length) {
      out('Invariants enforced by triggers:');
      for (const tr of invariantTriggers) {
        out(`- \`${tr.name}\`: ${code(tr.def.replace(/^CREATE (CONSTRAINT )?TRIGGER \S+ /, ''))}`);
        for (const r of tr.raises) out(`  - "${esc(r)}"`);
      }
      out();
    }
    if (housekeeping.length) {
      out(`Maintains \`updated_at\`: ${housekeeping.map((x) => code(x.name)).join(', ')}.`);
      out();
    }
  }
});

// Divergences
out('## Divergences from the Data dictionary');
out();
out('The Data dictionary tab (`docs/product/data-dictionary.md`, imported verbatim from the planning document as of 2026-10-14) lists every table with its **key fields**, not every column. This section compares it with the live schema above. Rows in A and B, and the rows of C that describe the live schema, are what the founder approves. The rows of C marked "proposed" are Change Order 001 items that are not in the schema yet; they are decided in reconciliation-001, not by approving this document, and are listed so that the documents stay consistent. D and E are informational (what the build added, each with the migration and ADR that added it). Each row names the ADR that explains it, or says that a founder ruling is needed.');
out();
const toApprove = divergences.filter((d) => !INFORMATIONAL.has(d.kind));
out(`Checked and matching: ${matches.fields} dictionary key fields exist (${matches.typed} with the dictionary's type or convention); ${matches.enumerations.length} enumerations equal their CHECK (${matches.enumerations.map(code).join(', ')}); ${matches.uniques.length} unique keys (${matches.uniques.map(code).join(', ')}); ${matches.indexes.length} of the ${wantedIndexes.length} "Indexes that matter" exactly; ${matches.encrypted.length} columns marked (enc) are encrypted; append-only triggers on ${matches.immutable.map(code).join(', ') || 'none'}.`);
out();
out('### A. Schema divergences to approve');
out();
out('| # | Table | Field | Kind | Data dictionary | Live schema | Explained by | Status |');
out('| --- | --- | --- | --- | --- | --- | --- | --- |');
toApprove.forEach((d, i) => out(`| A${i + 1} | ${byName.has(d.table) ? link(d.table) : code(d.table)} | ${d.field ? code(d.field) : ''} | ${d.kind} | ${esc(d.dictionary)} | ${esc(d.schema)} | ${esc(d.by ?? '**no reviewed explanation**')} | ${esc(d.status ?? 'needs review')} |`));
out();
const withText = toApprove.filter((d) => d.text);
if (withText.length) {
  out('Notes:');
  toApprove.forEach((d, i) => { if (d.text) out(`- A${i + 1} (\`${d.table}${d.field ? '.' + d.field : ''}\`): ${esc(d.text)}`); });
  out();
}
out('### B. Policy divergences to approve');
out();
out('The dictionary gives each tenancy table a one-phrase policy. The live policies, reviewed against it:');
out();
out('| # | Table | Data dictionary | Live policies | Explained by | Status | Note |');
out('| --- | --- | --- | --- | --- | --- | --- |');
(expl.policies ?? []).forEach((p, i) => out(`| B${i + 1} | ${link(p.table)} | ${esc(dictByTable.get(p.table)?.policy ?? '-')} | ${p.policies.map(code).join(', ')} | ${esc(p.by)} | ${esc(p.status)} | ${esc(p.text)} |`));
out();
out('### C. Disagreements inside the plan documents');
out();
out('| # | Subject | Where | What each says | Live schema | Status |');
out('| --- | --- | --- | --- | --- | --- |');
(expl.plan ?? []).forEach((p, i) => out(`| C${i + 1} | ${esc(p.subject)} | ${esc(p.where)} | ${esc(p.says)} | ${esc(p.schema)} | ${esc(p.status)} |`));
out();
out('### D. Tables not in the Data dictionary (informational)');
out();
out('| # | Table | Area | Class | Created by | Explained by |');
out('| --- | --- | --- | --- | --- | --- |');
divergences.filter((d) => d.kind === 'extra table').forEach((d, i) => {
  const t = byName.get(d.table);
  out(`| D${i + 1} | ${link(d.table)} | ${areaOf.get(d.table).title} | ${t.classification} | ${t.createdBy ? code(short(t.createdBy)) : esc(t.createdOutside ?? '?')} | ${esc(d.by ?? (t.createdBy ? adrList(t.createdBy) || 'its migration header cites no ADR' : '-'))} |`);
});
out();
out('### E. Columns not in the Data dictionary (informational)');
out();
out('Per dictionary table, the columns the build added beyond the key fields the dictionary lists (`id`, `created_at` and `updated_at` aside), grouped by the migration that added them.');
out();
out('| Table | Columns, by the migration that added them |');
out('| --- | --- |');
{
  const extraCols = divergences.filter((d) => d.kind === 'extra column');
  const tablesWithExtra = [...new Set(extraCols.map((d) => d.table))];
  for (const tn of tablesWithExtra) {
    const t = byName.get(tn);
    const groups = new Map();
    for (const d of extraCols.filter((x) => x.table === tn)) {
      const f = t.columns.find((c) => c.name === d.field)?.addedBy ?? null;
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(d.field);
    }
    out(`| ${link(tn)} | ${[...groups].map(([f, cols]) => `${cols.map(code).join(', ')} (${migRef(f)})`).join('<br>')} |`);
  }
}
out();
const notes = divergences.filter((d) => d.kind === 'type note');
if (notes.length) {
  out(`Type notes: ${notes.map((d) => `\`${d.table}.${d.field}\` is ${esc(d.schema.split(':')[0])}`).join('; ')}. The dictionary does not give their type; each is an identifier read from the source file (an 835 envelope or a model ID), not a key, so text is right.`);
  out();
}

// Appendices
out('## Appendix A: enumerations');
out();
if (enumTypes.length) { for (const e of enumTypes) out(`- \`${e.name}\`: ${e.labels.map(code).join(', ')}`); out(); }
out('Columns whose CHECK constraint admits a closed list of values.');
out();
out('| Table.column | Values |');
out('| --- | --- |');
for (const a of areaMap) for (const tn of a.tables) for (const c of byName.get(tn).columns) if (c.enumeration) out(`| \`${tn}.${c.name}\` | ${c.enumeration.map(code).join(', ')} |`);
out();
out('## Appendix B: encrypted columns');
out();
out('Columns whose CHECK admits only `enc:v1:` ciphertext (application-layer encryption with the practice data key).');
out();
out('| Table | Columns |');
out('| --- | --- |');
for (const a of areaMap) for (const tn of a.tables) {
  const enc = byName.get(tn).columns.filter((c) => c.encrypted).map((c) => code(c.name));
  if (enc.length) out(`| ${link(tn)} | ${enc.join(', ')} |`);
}
out();
out('## Appendix C: functions');
out();
out('Every function in schema `public`. SECURITY DEFINER functions run as their owner; "Sets app.practice_ids" marks a function that sets the tenant scope itself.');
out();
out('| Function | Returns | Lang | Security | Volatility | Config | EXECUTE granted to | Sets app.practice_ids |');
out('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const f of fnModel) out(`| ${code(f.signature)} | ${code(f.returns)} | ${f.language} | ${f.securityDefiner ? 'DEFINER' : 'invoker'} | ${f.volatility} | ${f.config.map(code).join('<br>')} | ${[f.executePublic ? 'PUBLIC' : null, ...f.executeRoles].filter(Boolean).join(', ')} | ${f.setsScope ? 'yes' : ''} |`);
out();
if (args.append?.length) {
  out('## Cross-checks');
  out();
  out('Run against the same migrated database by `check-drizzle-and-catalog.mts`: the Drizzle schema (packages/db/src/schema) against the live columns, as packages/db/src/migrate.db.test.ts does, and the repository\'s own catalog test function, catalogProblems() in packages/db/src/catalog.ts.');
  out();
  for (const extra of args.append) {
    out('```text');
    out(readFileSync(extra, 'utf8').trim());
    out('```');
    out();
  }
}
out('## Approval');
out();
const planRows = (expl.plan ?? []).map((p, i) => ({ id: `C${i + 1}`, proposed: /^proposed\b/i.test(p.status ?? '') }));
const liveC = planRows.filter((r) => !r.proposed).map((r) => r.id);
const proposedC = planRows.filter((r) => r.proposed).map((r) => r.id);
const listIds = (ids) => (ids.length <= 1 ? ids.join('') : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`);
out(`This document describes the schema at migration head \`${meta.head}\` (${meta.migrations} migrations). Approving it approves the schema as described, every divergence in sections A and B${liveC.length ? `, and the ruling asked for in ${listIds(liveC)}` : ''}.${proposedC.length ? ` It does not decide ${listIds(proposedC)}, which are proposals for schema that does not exist yet (reconciliation-001).` : ''} Under CO-02, no further schema change merges until it is approved; each later migration regenerates this document in the same pull request and is approved again. The approval line carries the SHA-256 of the document as approved (every line but the approval line and the provenance line); \`--check --require-approval\` refuses a line whose hash is not this text's.`);
out();
const APPROVAL_PREFIX = 'Approved by:';
const comparable = (s) => s.split('\n').filter((l) => !l.startsWith(APPROVAL_PREFIX) && !l.startsWith(PROVENANCE_PREFIX)).join('\n');
const documentSha = (s) => createHash('sha256').update(comparable(s)).digest('hex');
const blankApproval = (sha) => `${APPROVAL_PREFIX} ________  Date: ________  Document SHA-256: \`${sha}\``;
out(APPROVAL_PREFIX + ' PLACEHOLDER');
let text = L.join('\n') + '\n';
const sha = documentSha(text);
text = text.replace(`${APPROVAL_PREFIX} PLACEHOLDER`, blankApproval(sha));
const approvalLine = (s) => s.split('\n').find((l) => l.startsWith(APPROVAL_PREFIX)) ?? null;
/** Problems with an approval line: a person, a real date and this document's hash. */
function approvalProblems(line, wantSha) {
  if (line === null) return ['there is no "Approved by:" line'];
  const m = line.match(/^Approved by: (.+?)  Date: (\S+)  Document SHA-256: `([0-9a-f]{64})`$/);
  if (!m) return ['the "Approved by:" line is not "Approved by: <name>  Date: <YYYY-MM-DD>  Document SHA-256: `<hash>`"'];
  const problems = [];
  if (/^_+$/.test(m[1].trim()) || m[1].trim() === '') problems.push('the approval names no person');
  const d = m[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) problems.push('the approval date is not a date (YYYY-MM-DD)');
  if (m[3] !== wantSha) problems.push(`the approval is for document ${m[3].slice(0, 12)}, not this one (${wantSha.slice(0, 12)}): the document changed after it was approved`);
  return problems;
}

// =============================================================================================
// 7. Write or check
// =============================================================================================
if (args.check) {
  const existing = readFileSync(args.check, 'utf8');
  if (comparable(existing) !== comparable(text)) {
    const a = comparable(existing).split('\n');
    const b = comparable(text).split('\n');
    let i = 0;
    while (i < Math.max(a.length, b.length) && a[i] === b[i]) i++;
    process.stderr.write(`${args.check} does not match the schema; regenerate it. First difference at line ${i + 1}:\n- ${a[i] ?? '(end of file)'}\n+ ${b[i] ?? '(end of file)'}\n`);
    process.exit(1);
  }
  process.stdout.write(`${args.check} matches the schema at ${meta.head}\n`);
  if (args['require-approval']) {
    const problems = approvalProblems(approvalLine(existing), sha);
    if (problems.length) {
      process.stderr.write(`${args.check} is not approved: ${problems.join('; ')}\n`);
      process.exit(1);
    }
    process.stdout.write(`${args.check} carries an approval for this text\n`);
  }
}
if (args.out) {
  // Regenerating identical text keeps the person's approval; any change leaves the line blank for a new one.
  let written = text;
  if (existsSync(args.out)) {
    const previous = readFileSync(args.out, 'utf8');
    const line = approvalLine(previous);
    if (comparable(previous) === comparable(text) && line !== null && approvalProblems(line, sha).length === 0) {
      written = text.replace(approvalLine(text), line);
    }
  }
  writeFileSync(args.out, written);
}
if (args.json) writeFileSync(args.json, JSON.stringify({ meta: { ...meta, commit: args.commit ?? null, branch: args.branch ?? null }, registry, roles, tables: model, functions: fnModel, divergences, matches }, null, 2) + '\n');
process.stdout.write(`${args.out ? `wrote ${args.out}: ` : ''}${tables.length} tables, ${views.length} views, ${phi.length} registered, ${divergences.length} divergence rows (${toApprove.length} to approve), ${strictProblems.length} explanation problem(s)\n`);
for (const p of strictProblems) process.stdout.write(`  ${p}\n`);
