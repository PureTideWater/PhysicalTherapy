import { createHash } from 'node:crypto';

import { tenantPolicyExpression } from '../catalog';
import { type Catalog } from './catalog-reads';
import { type MigrationText } from './migration-text';
import { type AreaFile, type Area } from './sources';

/**
 * The domain model (CO-02) built from the catalog reads and the migration text: one entry per table
 * and view in schema public, with its PHI class, keys, invariants, policies and privileges.
 */
export interface ColumnModel {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly default: string | null;
  readonly identity: string | null;
  readonly generated: string | null;
  readonly encrypted: boolean;
  /**
   * The closed list the column's own CHECK admits (a CHECK whose whole expression is
   * `column = ANY (ARRAY[...])`), in that CHECK's order. When no such CHECK exists, the values its
   * conditional CHECKs name, merged in constraint-name order, with `enumerationMerged` set: those are
   * not a closed list.
   */
  readonly enumeration: readonly string[] | null;
  readonly enumerationMerged: boolean;
  readonly fk: readonly string[];
  readonly addedBy: string | null;
}

export interface IndexModel {
  readonly name: string;
  readonly def: string;
  readonly primary: boolean;
  readonly unique: boolean;
  readonly backsConstraint: boolean;
}

export interface PolicyModel {
  readonly name: string;
  readonly command: string;
  readonly permissive: boolean;
  readonly roles: readonly string[];
  readonly using: string | null;
  readonly withCheck: string | null;
}

export interface TriggerModel {
  readonly name: string;
  readonly def: string;
  readonly function: string;
  readonly raises: readonly string[];
  /** Whether it fires in an ordinary session (session_replication_role origin): enabled or enabled always. */
  readonly enforced: boolean;
  /** Its pg_trigger.tgenabled state in words. */
  readonly state: string;
}

export interface RuleModel {
  readonly name: string;
  readonly def: string;
}

export interface TableModel {
  readonly name: string;
  readonly isView: boolean;
  readonly owner: string;
  readonly options: readonly string[] | null;
  readonly rls: boolean;
  readonly forced: boolean;
  readonly classification: string;
  readonly practiceId: string | null;
  readonly registry: { readonly policy: string; readonly registeredBy: string } | null;
  readonly tenantPolicyOk: boolean | null;
  readonly createdBy: string | null;
  readonly createdOutside: string | null;
  readonly touchedBy: readonly string[];
  readonly columns: readonly ColumnModel[];
  readonly primaryKey: readonly string[] | null;
  readonly uniques: readonly { readonly name: string; readonly cols: readonly string[]; readonly def: string }[];
  readonly foreignKeys: readonly {
    readonly name: string;
    readonly cols: readonly string[];
    readonly refTable: string | null;
    readonly refCols: readonly string[];
    readonly onDelete: string;
    readonly deferrable: boolean;
  }[];
  readonly checks: readonly { readonly name: string; readonly def: string }[];
  readonly exclusions: readonly { readonly name: string; readonly def: string }[];
  readonly indexes: readonly IndexModel[];
  readonly policies: readonly PolicyModel[];
  readonly triggers: readonly TriggerModel[];
  readonly rules: readonly RuleModel[];
  readonly privileges: Readonly<Record<string, readonly string[]>>;
  readonly columnGrants: readonly { readonly role: string; readonly priv: string; readonly cols: readonly string[] }[];
  readonly view: string | null;
}

export interface FunctionModel {
  readonly signature: string;
  readonly name: string;
  readonly language: string;
  readonly securityDefiner: boolean;
  readonly volatility: string;
  readonly config: readonly string[];
  readonly returns: string;
  readonly executeRoles: readonly string[];
  readonly executePublic: boolean;
  readonly setsScope: boolean;
  /** The SHA-256 of the function's body, so a changed body changes the document. */
  readonly bodySha256: string;
}

/** Groups `list` by `key`, keeping order. */
export function groupBy<T, K>(list: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = key(item);
    const group = map.get(k);
    if (group === undefined) map.set(k, [item]);
    else group.push(item);
  }
  return map;
}

/** The closed lists a CHECK definition admits, as `column = ANY (ARRAY[...])`. */
export function enumerationOf(def: string): { column: string; values: string[] }[] {
  const out: { column: string; values: string[] }[] = [];
  const anyRe = /\(?\(?([a-z_][a-z0-9_]*)\)?(?:::text)?\s*=\s*ANY\s*\(\s*(?:\(\s*)?ARRAY\[([^\]]*)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = anyRe.exec(def)) !== null) {
    const values = [...(m[2] ?? '').matchAll(/'((?:[^']|'')*)'/g)].map((v) => (v[1] ?? '').replace(/''/g, "'"));
    if (values.length > 0) out.push({ column: m[1] ?? '', values });
  }
  return out;
}

/**
 * The closed list a CHECK admits when its whole expression is `column = ANY (ARRAY[...])`, in its
 * order; null for any other CHECK (a conditional one names values without admitting only them).
 */
export function wholeEnumerationOf(def: string): { column: string; values: string[] } | null {
  const m = /^CHECK \(\(?([a-z_][a-z0-9_]*)\)?(?:::text)?\s*=\s*ANY\s*\(\s*\(?\s*ARRAY\[((?:'(?:[^']|'')*'::[a-z][a-z ]*(?:,\s*)?)+)\](?:\)::text\[\])?\s*\)\)$/.exec(def.trim());
  if (!m) return null;
  const values = [...(m[2] ?? '').matchAll(/'((?:[^']|'')*)'/g)].map((v) => (v[1] ?? '').replace(/''/g, "'"));
  return { column: m[1] ?? '', values };
}

/** The columns a CHECK definition holds to `enc:v1:` ciphertext. */
export const encryptedColumnsOf = (def: string): string[] => [...def.matchAll(/([a-z_][a-z0-9_]*)\s*~\s*'\^enc:v1:/g)].map((m) => m[1] ?? '');

/** The messages a trigger function raises, each once. */
export function raisesOf(src: string | null): string[] {
  if (!src) return [];
  const msgs: string[] = [];
  for (const m of src.matchAll(/RAISE\s+EXCEPTION\s+'((?:[^']|'')*)'/gi)) msgs.push((m[1] ?? '').replace(/''/g, "'"));
  return [...new Set(msgs)];
}

const ON_DELETE: Readonly<Record<string, string>> = { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null', d: 'set default' };
const CMD: Readonly<Record<string, string>> = { '*': 'ALL', r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };
const VOLATILITY: Readonly<Record<string, string>> = { i: 'immutable', s: 'stable', v: 'volatile' };
const TRIGGER_STATE: Readonly<Record<string, string>> = {
  O: 'enabled',
  A: 'enabled always (also under session_replication_role replica)',
  R: 'fires only under session_replication_role replica: not enforced',
  D: 'disabled: not enforced',
};

export interface Model {
  readonly tables: readonly TableModel[];
  readonly byName: ReadonlyMap<string, TableModel>;
  readonly functions: readonly FunctionModel[];
  /** The group roles that hold a privilege on some relation: one column each in the PHI table. */
  readonly rolesWithTablePrivileges: readonly string[];
}

export function buildModel(catalog: Catalog, migrations: MigrationText, areas: AreaFile): Model {
  const colsBy = groupBy(catalog.columns, (c) => c.table_name);
  const consBy = groupBy(catalog.constraints, (c) => c.table_name);
  const idxBy = groupBy(catalog.indexes, (c) => c.table_name);
  const polBy = groupBy(catalog.policies, (c) => c.table_name);
  const trgBy = groupBy(catalog.triggers, (c) => c.table_name);
  const ruleBy = groupBy(catalog.rules, (c) => c.table_name);
  const privBy = groupBy(catalog.privileges, (c) => c.table_name);
  const colPrivBy = groupBy(catalog.columnPrivileges, (c) => c.table_name);
  const regBy = new Map(catalog.registry.map((r) => [r.table_name, r]));
  const viewBy = new Map(catalog.viewDefs.map((v) => [v.name, v.def]));
  const createdOutside = areas.createdOutsideMigrations;

  const tables = catalog.relations.map((rel): TableModel => {
    const isView = rel.kind === 'v' || rel.kind === 'm';
    const cols = colsBy.get(rel.name) ?? [];
    const cons = consBy.get(rel.name) ?? [];
    const pk = cons.find((c) => c.type === 'p');
    const checks = cons.filter((c) => c.type === 'c');
    const fks = cons.filter((c) => c.type === 'f');
    const pcol = cols.find((c) => c.name === 'practice_id');
    const enc = new Set(checks.flatMap((c) => encryptedColumnsOf(c.def)));
    const own = new Map<string, string[]>();
    for (const c of checks) {
      const e = wholeEnumerationOf(c.def);
      if (e === null) continue;
      const earlier = own.get(e.column);
      // Two such CHECKs on one column admit only the values both list.
      own.set(e.column, earlier === undefined ? e.values : earlier.filter((v) => e.values.includes(v)));
    }
    const merged = new Map<string, string[]>();
    for (const c of checks) for (const e of enumerationOf(c.def)) merged.set(e.column, [...new Set([...(merged.get(e.column) ?? []), ...e.values])]);
    const pols = polBy.get(rel.name) ?? [];
    const reg = regBy.get(rel.name);
    const tenantCol = rel.name === 'practice' ? 'id' : 'practice_id';
    let classification: string;
    if (isView) classification = 'view';
    else if (reg) classification = 'PHI (registered)';
    else if (pcol) classification = pcol.not_null ? 'tenant, NOT registered' : 'tenant (nullable practice_id), not registered';
    else if (rel.rls) classification = 'organization- or user-scoped (RLS, no practice_id)';
    else classification = 'global (no practice_id, no RLS)';
    const privs = new Map((privBy.get(rel.name) ?? []).map((p) => [p.role, p]));
    const privilegeList = (role: string): string[] => {
      const p = privs.get(role);
      if (!p) return [];
      const parts: string[] = [];
      if (p.sel) parts.push('SELECT');
      else if (p.col_sel) parts.push('SELECT(cols)');
      if (p.ins) parts.push('INSERT');
      else if (p.col_ins) parts.push('INSERT(cols)');
      if (p.upd) parts.push('UPDATE');
      else if (p.col_upd) parts.push('UPDATE(cols)');
      if (p.del) parts.push('DELETE');
      if (p.trunc) parts.push('TRUNCATE');
      return parts;
    };
    const createdBy = migrations.tableCreatedBy.get(rel.name) ?? null;
    const laterTriggerFunctions = (trgBy.get(rel.name) ?? []).flatMap((t) =>
      [...(migrations.functionDefinedBy.get(t.function_name) ?? [])].filter((f) => !createdBy || f > createdBy),
    );
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
      tenantPolicyOk: reg
        ? pols.some(
            (p) => p.name === reg.policy_name && p.cmd === '*' && p.permissive && p.using_expr === tenantPolicyExpression(tenantCol) && p.check_expr === tenantPolicyExpression(tenantCol),
          )
        : null,
      createdBy,
      createdOutside: createdOutside[rel.name] ?? null,
      touchedBy: [...new Set([...(migrations.tableTouchedBy.get(rel.name) ?? []), ...laterTriggerFunctions])].sort(),
      columns: cols.map((c) => ({
        name: c.name,
        type: c.type,
        notNull: c.not_null,
        default: c.default_expr,
        identity: c.identity,
        generated: c.generated,
        encrypted: enc.has(c.name),
        enumeration: own.get(c.name) ?? merged.get(c.name) ?? null,
        enumerationMerged: !own.has(c.name) && merged.has(c.name),
        fk: fks.filter((f) => f.cols.length === 1 && f.cols[0] === c.name).map((f) => `${String(f.ref_table)}(${f.ref_cols.join(', ')})`),
        addedBy: migrations.columnAddedBy.get(`${rel.name}.${c.name}`) ?? null,
      })),
      primaryKey: pk ? pk.cols : null,
      uniques: cons.filter((c) => c.type === 'u').map((u) => ({ name: u.name, cols: u.cols, def: u.def })),
      foreignKeys: fks.map((f) => ({
        name: f.name,
        cols: f.cols,
        refTable: f.ref_table,
        refCols: f.ref_cols,
        onDelete: ON_DELETE[f.on_delete] ?? f.on_delete,
        deferrable: f.deferrable,
      })),
      checks: checks.map((c) => ({ name: c.name, def: c.def })),
      exclusions: cons.filter((c) => c.type === 'x').map((c) => ({ name: c.name, def: c.def })),
      indexes: (idxBy.get(rel.name) ?? []).map((i) => ({ name: i.name, def: i.def, primary: i.is_primary, unique: i.is_unique, backsConstraint: i.backs_constraint })),
      policies: pols.map((p) => ({ name: p.name, command: CMD[p.cmd] ?? p.cmd, permissive: p.permissive, roles: p.roles, using: p.using_expr, withCheck: p.check_expr })),
      triggers: (trgBy.get(rel.name) ?? []).map((t) => ({
        name: t.name,
        def: t.def,
        function: t.function_name,
        raises: raisesOf(t.function_src),
        enforced: t.enabled === 'O' || t.enabled === 'A',
        state: TRIGGER_STATE[t.enabled] ?? `tgenabled ${t.enabled}`,
      })),
      rules: (ruleBy.get(rel.name) ?? []).map((r) => ({ name: r.name, def: r.def })),
      privileges: Object.fromEntries(catalog.groupRoles.map((r) => [r, privilegeList(r)])),
      columnGrants: (colPrivBy.get(rel.name) ?? [])
        .filter((cp) => {
          const p = privs.get(cp.role);
          return !(p && ((cp.priv === 'INSERT' && p.ins) || (cp.priv === 'UPDATE' && p.upd) || (cp.priv === 'SELECT' && p.sel)));
        })
        .map((cp) => ({ role: cp.role, priv: cp.priv, cols: cp.cols })),
      view: viewBy.get(rel.name) ?? null,
    };
  });

  const functions = catalog.functions.map(
    (f): FunctionModel => ({
      signature: f.signature,
      name: f.name,
      language: f.language,
      securityDefiner: f.security_definer,
      volatility: VOLATILITY[f.volatility] ?? f.volatility,
      config: f.config,
      returns: f.returns,
      executeRoles: f.execute_roles,
      executePublic: f.execute_public,
      setsScope: /set_config\s*\(\s*'app\.practice_ids'/i.test(f.src ?? '') || f.config.some((c) => c.startsWith('app.practice_ids=')),
      bodySha256: createHash('sha256')
        .update(f.src ?? '')
        .digest('hex'),
    }),
  );

  return {
    tables,
    byName: new Map(tables.map((t) => [t.name, t])),
    functions,
    rolesWithTablePrivileges: catalog.groupRoles.filter((r) => tables.some((t) => (t.privileges[r] ?? []).length > 0)),
  };
}

/** Every relation in exactly one area, and every area entry a relation: otherwise the problems. */
export function areaProblems(areas: readonly Area[], model: Model): { areaOf: Map<string, Area>; problems: string[] } {
  const areaOf = new Map<string, Area>();
  const problems: string[] = [];
  for (const a of areas) {
    for (const t of a.tables) {
      const earlier = areaOf.get(t);
      if (earlier) problems.push(`${t} is in two areas (${earlier.id}, ${a.id})`);
      areaOf.set(t, a);
      if (!model.byName.has(t)) problems.push(`${t} is in area ${a.id} but not in the database`);
    }
  }
  for (const t of model.tables) if (!areaOf.has(t.name)) problems.push(`${t.name} is in no area: add it to packages/db/domain-model/areas.json`);
  return { areaOf, problems };
}
