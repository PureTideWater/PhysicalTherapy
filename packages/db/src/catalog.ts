import { APP_ROLE, OWNER_ROLE } from './roles';

/**
 * The catalog test (PRD 8 Invariants; PRD 16 Tenant isolation; test matrix SEC-01), as a function so
 * the database tests and the restore drill (SEC-13) run the same checks. It reads PostgreSQL's
 * catalog and returns every problem it finds; an empty list means the database holds the invariants:
 *
 * - Every table with a practice_id column forces row-level security, has at least one policy, at
 *   least one of which reads app.practice_ids, and leads an index with practice_id.
 * - Every table with a NOT NULL practice_id (and the practice table, on id) is in phi_table_registry;
 *   a nullable practice_id is allowed only for the tables NULLABLE_PRACTICE_ID_TABLES names.
 * - Every registered table exists and qualifies: its tenant column is a NOT NULL uuid, it forces
 *   row-level security, and its registered policy is permissive, for every command and every role,
 *   with USING and WITH CHECK both exactly practice_id = ANY (current_setting('app.practice_ids',
 *   true)::uuid[]).
 * - No table forces nothing halfway: row-level security enabled means forced. A table without it is
 *   global, and the application role may only read it.
 * - The application role owns nothing; no column is real, double precision, float or money; money
 *   columns (_cents) are bigint; rate columns (rate, *_rate) are numeric(14,6).
 */

export const TENANT_TABLE = 'practice';
export const TENANT_SETTING = 'app.practice_ids';
export const REGISTRY_TABLE = 'phi_table_registry';

/** The registered policy's expression, exactly as PostgreSQL prints it, for a tenant column. */
export function tenantPolicyExpression(column: string): string {
  return `(${column} = ANY ((current_setting('${TENANT_SETTING}'::text, true))::uuid[]))`;
}

/**
 * Tables whose practice_id may be null, each with the data dictionary's reason. They are not PHI
 * tables, but they still force row-level security with a policy on app.practice_ids. Adding a table
 * here is a reviewed change; a PHI table never belongs here.
 */
export const NULLABLE_PRACTICE_ID_TABLES: Readonly<Record<string, string>> = {
  agreement: 'an agreement with an organization as a whole (terms, a firm’s own BAA) names no practice',
  audit_event: 'events outside any practice (sign-ins, administration) have no practice; no PHI by design',
};

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

async function rows<T>(client: Queryable, text: string, values?: unknown[]): Promise<T[]> {
  return (await client.query(text, values)).rows as T[];
}

interface TableRow {
  readonly name: string;
  readonly rls: boolean;
  readonly forced: boolean;
  readonly owner: string;
  readonly practice_id_type: string | null;
  readonly practice_id_not_null: boolean | null;
  readonly id_type: string | null;
  readonly id_not_null: boolean | null;
  readonly policies: number;
  readonly tenant_policies: number;
  readonly practice_id_indexed: boolean;
  readonly app_writes: boolean;
}

const TABLES = `
  SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
         pg_get_userbyid(c.relowner) AS owner,
         format_type(p.atttypid, p.atttypmod) AS practice_id_type, p.attnotnull AS practice_id_not_null,
         format_type(i.atttypid, i.atttypmod) AS id_type, i.attnotnull AS id_not_null,
         (SELECT count(*)::int FROM pg_policy pol WHERE pol.polrelid = c.oid) AS policies,
         (SELECT count(*)::int FROM pg_policy pol WHERE pol.polrelid = c.oid
            AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
                LIKE '%current_setting(''${TENANT_SETTING}''::text, true)%') AS tenant_policies,
         EXISTS (SELECT 1 FROM pg_index x WHERE x.indrelid = c.oid AND x.indkey[0] = p.attnum) AS practice_id_indexed,
         (to_regrole($1) IS NOT NULL AND (has_table_privilege($1, c.oid, 'INSERT') OR has_table_privilege($1, c.oid, 'UPDATE')
            OR has_table_privilege($1, c.oid, 'DELETE') OR has_table_privilege($1, c.oid, 'TRUNCATE')
            OR has_any_column_privilege($1, c.oid, 'INSERT') OR has_any_column_privilege($1, c.oid, 'UPDATE'))) AS app_writes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attribute p ON p.attrelid = c.oid AND p.attname = 'practice_id' AND p.attnum > 0 AND NOT p.attisdropped
    LEFT JOIN pg_attribute i ON i.attrelid = c.oid AND i.attname = 'id' AND i.attnum > 0 AND NOT i.attisdropped
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
   ORDER BY c.relname`;

interface PolicyRow {
  readonly table_name: string;
  readonly name: string;
  readonly command: string;
  readonly permissive: boolean;
  readonly every_role: boolean;
  readonly using_expression: string | null;
  readonly check_expression: string | null;
}

const POLICIES = `
  SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS command, pol.polpermissive AS permissive,
         pol.polroles = '{0}'::oid[] AS every_role,
         pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
         pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'`;

interface ColumnRow {
  readonly table_name: string;
  readonly column_name: string;
  readonly type: string;
  readonly base_type: string;
}

const COLUMNS = `
  SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type,
         CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) ELSE format_type(a.atttypid, a.atttypmod) END AS base_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY 1, 2`;

const OWNED_BY_APP = `
  SELECT kind || ' ' || name AS object FROM (
    SELECT 'relation' AS kind, relname::text AS name FROM pg_class WHERE relowner = $1::regrole
    UNION ALL SELECT 'function', proname::text FROM pg_proc WHERE proowner = $1::regrole
    UNION ALL SELECT 'schema', nspname::text FROM pg_namespace WHERE nspowner = $1::regrole
    UNION ALL SELECT 'type', typname::text FROM pg_type WHERE typowner = $1::regrole
  ) owned ORDER BY 1`;

const FLOAT_TYPES = /^(real|double precision|float\d*|money)(\[\])*$/;

export interface CatalogOptions {
  readonly appRole?: string;
  readonly ownerRole?: string;
}

/** Every way the database breaks the invariants above, as sentences naming tables and columns only. */
export async function catalogProblems(client: Queryable, options: CatalogOptions = {}): Promise<string[]> {
  const appRole = options.appRole ?? APP_ROLE;
  const ownerRole = options.ownerRole ?? OWNER_ROLE;
  const problems: string[] = [];
  const tables = await rows<TableRow>(client, TABLES, [appRole]);
  const byName = new Map(tables.map((table) => [table.name, table]));

  const registryExists = byName.has(REGISTRY_TABLE);
  const registered = registryExists ? await rows<{ table_name: string; policy_name: string }>(client, `SELECT table_name, policy_name FROM ${REGISTRY_TABLE} ORDER BY table_name`) : [];
  if (!registryExists) {
    problems.push(`${REGISTRY_TABLE} does not exist`);
  }
  const registeredNames = new Set(registered.map((row) => row.table_name));
  const policies = await rows<PolicyRow>(client, POLICIES);

  for (const table of tables) {
    const where = `table ${table.name}`;
    if (table.owner === appRole) {
      problems.push(`${where} is owned by the application role ${appRole}`);
    } else if (table.owner !== ownerRole) {
      problems.push(`${where} is owned by ${table.owner}, not ${ownerRole}`);
    }
    if (table.rls && !table.forced) {
      problems.push(`${where} enables row-level security without forcing it`);
    }
    if (!table.rls && table.app_writes) {
      problems.push(`${where} has no row-level security, so it is global, but the application role can write it`);
    }
    if (table.practice_id_type === null) {
      continue;
    }
    if (table.practice_id_type !== 'uuid') {
      problems.push(`${where}: practice_id is ${table.practice_id_type}, not uuid`);
    }
    if (!table.rls || !table.forced) {
      problems.push(`${where} has practice_id but does not ENABLE and FORCE ROW LEVEL SECURITY`);
    }
    if (table.policies === 0) {
      problems.push(`${where} has practice_id but no policy`);
    } else if (table.tenant_policies === 0) {
      problems.push(`${where} has practice_id but no policy reads ${TENANT_SETTING}`);
    }
    if (!table.practice_id_indexed) {
      problems.push(`${where}: practice_id is not the leading column of any index`);
    }
    if (table.practice_id_not_null === true) {
      if (!registeredNames.has(table.name)) {
        problems.push(`${where} has a NOT NULL practice_id but is not in ${REGISTRY_TABLE}`);
      }
    } else if (NULLABLE_PRACTICE_ID_TABLES[table.name] === undefined) {
      problems.push(`${where}: practice_id is nullable; a PHI table needs practice_id uuid NOT NULL`);
    }
  }

  if (registryExists && !registeredNames.has(TENANT_TABLE) && byName.has(TENANT_TABLE)) {
    problems.push(`table ${TENANT_TABLE} (the tenant) is not in ${REGISTRY_TABLE}`);
  }

  for (const entry of registered) {
    const where = `registered table ${entry.table_name}`;
    const table = byName.get(entry.table_name);
    if (table === undefined) {
      problems.push(`${where} does not exist`);
      continue;
    }
    const column = entry.table_name === TENANT_TABLE ? 'id' : 'practice_id';
    const type = column === 'id' ? table.id_type : table.practice_id_type;
    const notNull = column === 'id' ? table.id_not_null : table.practice_id_not_null;
    if (type !== 'uuid' || notNull !== true) {
      problems.push(`${where} does not qualify: ${column} must be uuid NOT NULL`);
    }
    if (!table.rls || !table.forced) {
      problems.push(`${where} does not ENABLE and FORCE ROW LEVEL SECURITY`);
    }
    const policy = policies.find((candidate) => candidate.table_name === entry.table_name && candidate.name === entry.policy_name);
    if (policy === undefined) {
      problems.push(`${where}: its policy ${entry.policy_name} does not exist`);
      continue;
    }
    const expected = tenantPolicyExpression(column);
    if (!policy.permissive || policy.command !== '*' || !policy.every_role || policy.using_expression !== expected || policy.check_expression !== expected) {
      problems.push(`${where}: policy ${entry.policy_name} must be PERMISSIVE, FOR ALL, TO PUBLIC, USING and WITH CHECK ${expected}`);
    }
  }

  for (const column of await rows<ColumnRow>(client, COLUMNS)) {
    const where = `column ${column.table_name}.${column.column_name}`;
    if (FLOAT_TYPES.test(column.type) || FLOAT_TYPES.test(column.base_type)) {
      problems.push(`${where} is ${column.type}; amounts are bigint cents and rates numeric(14,6), never a float`);
    }
    if (column.column_name.endsWith('_cents') && column.base_type !== 'bigint') {
      problems.push(`${where} is ${column.type}; money columns (_cents) are bigint`);
    }
    if ((column.column_name === 'rate' || column.column_name.endsWith('_rate')) && column.base_type !== 'numeric(14,6)') {
      problems.push(`${where} is ${column.type}; rate columns are numeric(14,6)`);
    }
  }

  const roleExists = await rows<{ exists: boolean }>(client, 'SELECT to_regrole($1) IS NOT NULL AS exists', [appRole]);
  if (roleExists[0]?.exists === true) {
    for (const owned of await rows<{ object: string }>(client, OWNED_BY_APP, [appRole])) {
      problems.push(`the application role ${appRole} owns ${owned.object}`);
    }
  } else {
    problems.push(`the application role ${appRole} does not exist`);
  }
  return problems;
}

/** The tables the generated cross-tenant tests cover: the registry and every table with a practice_id. */
export async function tenantTables(client: Queryable): Promise<{ table: string; tenantColumn: string }[]> {
  const found = await rows<{ table_name: string }>(
    client,
    `SELECT table_name FROM ${REGISTRY_TABLE}
     UNION
     SELECT c.relname FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attname = 'practice_id' AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY 1`,
  );
  return found.map((row) => ({ table: row.table_name, tenantColumn: row.table_name === TENANT_TABLE ? 'id' : 'practice_id' }));
}
