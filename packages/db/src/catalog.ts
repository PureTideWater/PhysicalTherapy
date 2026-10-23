import { ENCRYPTED_COLUMNS } from './crypto/cipher';
import { APP_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, OPERATOR_ROLE, OWNER_ROLE, SCREENING_ROLE } from './roles';

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
 * - On a registered table, every other permissive policy for a role other than the owner keeps the
 *   tenant expression (alone, or first in a conjunction), because permissive policies add up: one
 *   that ignores app.practice_ids would let its role read or write every practice's rows. The only
 *   other permissive policies are REVIEWED_PLATFORM_POLICIES, each with its reason; restrictive
 *   policies only narrow, and the owner's resolver policies serve SECURITY DEFINER functions.
 * - No table forces nothing halfway: row-level security enabled means forced. A table without it is
 *   global, and the application role may only read it.
 * - Every SECURITY DEFINER function sets its search_path with pg_temp last, and one that sets
 *   app.practice_ids (it runs as the owner, so a scope it widens reads across practices for whoever may
 *   call it) is one of REVIEWED_SCOPE_FUNCTIONS, each with its reason.
 * - The application, operator, billing, e-signature, job and screening roles own nothing, and the application role
 *   may SET ROLE to none of billing, e-signature, operator, owner and screening; no column is real, double
 *   precision, float or money; money columns (_cents) are bigint; rate columns (rate, *_rate) are numeric(14,6).
 * - Every column the application encrypts with the practice's key (ENCRYPTED_COLUMNS) exists and has a
 *   CHECK that admits enc:v1 ciphertext alone, so a code path that skipped the cipher stores nothing in
 *   clear (docs/adr/0047).
 *
 * The two lists below are not exemptions from the PHI-table rules (.claude/rules/privacy-and-tenant.md:
 * "The catalog test lists exceptions; there are none"): no PHI table is exempt from practice_id NOT
 * NULL, the registry or a forced tenant policy. They classify what the data dictionary itself defines
 * (non-PHI tables whose practice_id is nullable; the platform administrators' directory reads).
 * docs/adr/0013 records the reading for the owner to confirm, and docs/adr/0048 the model gateway's two.
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
  eval_example: 'Data dictionary, eval_example: "practice_id (nullable)"; a synthetic example names no practice (PHI references only)',
  model_call: 'Data dictionary, model_call: "practice_id (nullable for synthetic evaluation)"; hashes, counts and codes only, never text',
};

/**
 * jsonb columns of integer-cent totals by code, each with the data dictionary's reason: the one kind of
 * _cents column that is not a bigint. Each must be jsonb with a CHECK calling figures_are_cents() on
 * it, which admits only integer cents as text keyed by codes or opaque IDs (never a float, never text),
 * so a money column stays exact and nothing but a total fits (migration 20261020090000).
 */
export const CENTS_FIGURE_COLUMNS: Readonly<Record<string, string>> = {
  'digest.totals_cents': 'Data dictionary, Operations: digest "counts jsonb, totals_cents jsonb"; PRD 8: counts and totals only',
  'notification.totals_cents': 'Data dictionary, Operations: notification "counts jsonb, totals_cents jsonb"; PRD 8: counts and totals only',
};

/**
 * Permissive policies on registered tables that do not carry the tenant expression, each reviewed with
 * the data dictionary's or the plan's reason. Every one admits platform administrators only, and only
 * to directory records; a stale entry (a policy that no longer exists) is a problem too.
 */
export interface ReviewedPolicy {
  readonly table: string;
  readonly policy: string;
  /** Who the policy admits beyond the practice's scope. */
  readonly admits: 'platform_admin';
  /** The commands it admits: r SELECT, a INSERT. */
  readonly command: 'r' | 'a';
  readonly reason: string;
}

export const REVIEWED_PLATFORM_POLICIES: readonly ReviewedPolicy[] = [
  {
    table: 'practice',
    policy: 'practice_platform_admin_insert',
    admits: 'platform_admin',
    command: 'a',
    reason: 'PRD 5, J1: the platform administrator creates the practice (insert only; no practice row is read through it)',
  },
  {
    table: 'support_grant',
    policy: 'support_grant_platform_administrators_read',
    admits: 'platform_admin',
    command: 'r',
    reason: 'Data dictionary, support_grant: "Platform administrators; practice sees its own" (ticket, reason, dates; no PHI)',
  },
  {
    table: 'support_grant',
    policy: 'support_grant_platform_administrators_insert',
    admits: 'platform_admin',
    command: 'a',
    reason: 'PRD 3 and PRD 5, J15: a platform administrator opens the break-glass grant from a ticket',
  },
];

/**
 * Tenant tables a platform administrator reads without any practice in scope, by design: the
 * directory records the console manages (Data dictionary: agreements are read by their parties, and
 * platform administrators record them; support grants are the platform administrators'). Never a PHI
 * record; the generated cross-tenant tests expect these reads and no other.
 */
export const PLATFORM_DIRECTORY_TABLES: Readonly<Record<string, string>> = {
  agreement: 'platform administrators record and read agreements (PRD 3, Personas; ADR 0013)',
  support_grant: 'Data dictionary, support_grant: "Platform administrators; practice sees its own"',
};

/**
 * SECURITY DEFINER functions that set app.practice_ids, each reviewed with what it reads and for whom.
 * Not exemptions from the PHI-table rules: every row they touch is read or written through its tenant
 * policy. A new such function, or a reviewed one that is gone, is a catalog problem, so no definer
 * function can widen a transaction's scope unnoticed (docs/adr/0013, 0030 and 0032).
 */
export interface ReviewedScopeFunction {
  /** As regprocedure prints it. */
  readonly function: string;
  /** narrows: one practice, for a write the function checks itself; counts: every active practice, counts only. */
  readonly scope: 'narrows' | 'counts';
  readonly reason: string;
}

export const REVIEWED_SCOPE_FUNCTIONS: readonly ReviewedScopeFunction[] = [
  {
    function: 'end_support_grant(uuid)',
    scope: 'narrows',
    reason: 'PRD 3: a support grant ends when the ticket closes; the update runs in the grant\u2019s one practice and the caller\u2019s scope is restored',
  },
  {
    function: 'console_contract_queue()',
    scope: 'counts',
    reason:
      'PRD 7, Internal console, Specialist queue: per active practice, counts of documents awaiting abstraction, drafts, proposals, sign-offs and open questions, for contract specialists and platform administrators only; it names no document, contract or question (ADR 0030)',
  },
  {
    function: 'console_set_practice_settings(uuid,text,jsonb)',
    scope: 'narrows',
    reason:
      'PRD 5, J8 and PRD 11, Inputs: a platform administrator sets a practice\u2019s billing ZIP and its pricing and triage settings from the console (organization.manage, checked inside); the update runs in that one practice and the caller\u2019s scope is restored (ADR 0040). Since migration 20261105090000 a ZIP it is given sets the practice\u2019s location (practice_site), never practice.zip (ADR 0064)',
  },
  {
    function: 'console_set_practice_location(uuid,text,text)',
    scope: 'narrows',
    reason:
      'Audit #33 and #16 (PR 6b; ADR 0064): the platform administrator sets a practice\u2019s location (its billing ZIP and ZIP+4, practice_site) at its creation and from the console (organization.manage, checked inside); one practice, and the caller\u2019s scope is restored',
  },
  {
    function: 'console_release_runs()',
    scope: 'counts',
    reason:
      'PRD 7, Internal console, Rule releases: per release and active practice, counts of complete runs, runs in effect, re-runs, accepted re-runs and the lines re-runs priced differently, for platform administrators only; it names no run, line or claim (ADR 0037)',
  },
  {
    function: 'console_model_spend(date)',
    scope: 'counts',
    reason:
      'PRD 19, Monitoring: model-call cost per practice against budget; per active practice, the day’s model calls counted and their cost in millionths of a cent, for platform administrators who manage feature flags only; it names no call, input or output (ADR 0055)',
  },
];

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
  /** The roles it applies to; 'public' for every role. */
  readonly roles: readonly string[];
  readonly using_expression: string | null;
  readonly check_expression: string | null;
}

const POLICIES = `
  SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS command, pol.polpermissive AS permissive,
         pol.polroles = '{0}'::oid[] AS every_role,
         ARRAY(SELECT CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(pol.polroles) r ORDER BY 1) AS roles,
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
  /** Whether a CHECK constraint of the table calls figures_are_cents() on exactly this column. */
  readonly cents_figures: boolean;
}

const COLUMNS = `
  SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type,
         CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) ELSE format_type(a.atttypid, a.atttypmod) END AS base_type,
         EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'c' AND con.conkey = ARRAY[a.attnum]
                    AND pg_get_constraintdef(con.oid) = 'CHECK (figures_are_cents(' || quote_ident(a.attname) || '))') AS cents_figures
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY 1, 2`;

/** Each encrypted column, and whether a CHECK of its table holds it to enc:v1 ciphertext, as PostgreSQL prints the CHECK. */
const ENCRYPTED = `
  SELECT c.relname AS table_name, a.attname AS column_name,
         EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'c' AND a.attnum = ANY (con.conkey)
                    AND strpos(pg_get_constraintdef(con.oid), '(' || quote_ident(a.attname) || ' ~ ''^enc:v1:[A-Za-z0-9_-]+$''::text)') > 0) AS sealed
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
     AND (c.relname || '.' || a.attname) = ANY ($1::text[])
   ORDER BY 1, 2`;

const OWNED_BY_APP = `
  SELECT kind || ' ' || name AS object FROM (
    SELECT 'relation' AS kind, relname::text AS name FROM pg_class WHERE relowner = $1::regrole
    UNION ALL SELECT 'function', proname::text FROM pg_proc WHERE proowner = $1::regrole
    UNION ALL SELECT 'schema', nspname::text FROM pg_namespace WHERE nspowner = $1::regrole
    UNION ALL SELECT 'type', typname::text FROM pg_type WHERE typowner = $1::regrole
  ) owned ORDER BY 1`;

/** SECURITY DEFINER functions in schema public, their settings and whether they set app.practice_ids. */
const DEFINER_FUNCTIONS = `
  SELECT p.oid::regprocedure::text AS name, coalesce(p.proconfig, '{}') AS config,
         (p.prosrc ~* $$set_config\\s*\\(\\s*'${TENANT_SETTING.replace('.', '\\.')}'$$ OR p.prosrc ~* $$set\\s+(local\\s+|session\\s+)?${TENANT_SETTING.replace('.', '\\.')}$$
           OR EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) setting WHERE setting LIKE '${TENANT_SETTING}=%')) AS sets_scope
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
   ORDER BY 1`;

/** Whether an expression keeps the tenant expression: exactly, or as the first term of a conjunction. */
function keepsTenant(expression: string | null, expected: string): boolean {
  return expression !== null && (expression === expected || expression.startsWith(`(${expected} AND `));
}

/** Whether a policy's expressions (those its command uses) all keep the tenant expression. */
function policyKeepsTenant(policy: PolicyRow, expected: string): boolean {
  const reads = policy.command === 'a' ? true : keepsTenant(policy.using_expression, expected);
  const writes = policy.command === 'r' || policy.command === 'd' ? true : policy.check_expression === null ? policy.command !== 'a' && reads : keepsTenant(policy.check_expression, expected);
  return reads && writes;
}

const FLOAT_TYPES = /^(real|double precision|float\d*|money)(\[\])*$/;

/**
 * Definer functions only a role other than the application's may call (docs/adr/0055): the application role,
 * which every request's login holds, must hold no EXECUTE on them.
 */
export const NOT_FOR_THE_APPLICATION: readonly { readonly function: string; readonly role: string; readonly reason: string }[] = [
  {
    function: 'record_esigned_agreement(text,text,uuid,uuid,text,text,timestamp with time zone,text,text,text)',
    role: ESIGN_ROLE,
    reason: 'it records a BAA or a data-rights agreement for any customer from a webhook whose signature only the e-signature webhook route checks',
  },
];

export interface CatalogOptions {
  readonly appRole?: string;
  readonly ownerRole?: string;
  readonly operatorRole?: string;
  readonly billingRole?: string;
}

/** Every way the database breaks the invariants above, as sentences naming tables and columns only. */
export async function catalogProblems(client: Queryable, options: CatalogOptions = {}): Promise<string[]> {
  const appRole = options.appRole ?? APP_ROLE;
  const ownerRole = options.ownerRole ?? OWNER_ROLE;
  const operatorRole = options.operatorRole ?? OPERATOR_ROLE;
  const billingRole = options.billingRole ?? BILLING_ROLE;
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
    for (const other of policies.filter((candidate) => candidate.table_name === entry.table_name && candidate.permissive && candidate.name !== entry.policy_name)) {
      const ownerOnly = other.roles.length === 1 && other.roles[0] === ownerRole;
      const reviewed = REVIEWED_PLATFORM_POLICIES.some((item) => item.table === entry.table_name && item.policy === other.name && item.command === other.command);
      if (!ownerOnly && !reviewed && !policyKeepsTenant(other, expected)) {
        problems.push(`${where}: permissive policy ${other.name} for ${other.roles.join(', ')} ignores ${TENANT_SETTING}; permissive policies add up, so it admits rows of every practice`);
      }
    }
  }

  for (const item of REVIEWED_PLATFORM_POLICIES) {
    if (!policies.some((candidate) => candidate.table_name === item.table && candidate.name === item.policy && candidate.permissive && candidate.command === item.command)) {
      problems.push(`reviewed policy ${item.table}.${item.policy} does not exist as a permissive policy for that command; update REVIEWED_PLATFORM_POLICIES`);
    }
  }

  const definers = await rows<{ name: string; config: string[]; sets_scope: boolean }>(client, DEFINER_FUNCTIONS);
  for (const definer of definers) {
    const searchPath = definer.config.find((setting) => setting.startsWith('search_path='));
    if (searchPath === undefined || !/(^|[ ,=])pg_temp$/.test(searchPath)) {
      problems.push(`function ${definer.name} is SECURITY DEFINER without pg_temp last in its search_path`);
    }
    if (definer.sets_scope && !REVIEWED_SCOPE_FUNCTIONS.some((item) => item.function === definer.name)) {
      problems.push(`function ${definer.name} is SECURITY DEFINER and sets ${TENANT_SETTING}; review it into REVIEWED_SCOPE_FUNCTIONS or keep the caller's scope`);
    }
  }
  for (const item of REVIEWED_SCOPE_FUNCTIONS) {
    if (!definers.some((definer) => definer.name === item.function && definer.sets_scope)) {
      problems.push(`reviewed scope function ${item.function} is not a SECURITY DEFINER function that sets ${TENANT_SETTING}; update REVIEWED_SCOPE_FUNCTIONS`);
    }
  }

  for (const column of await rows<ColumnRow>(client, COLUMNS)) {
    const where = `column ${column.table_name}.${column.column_name}`;
    if (FLOAT_TYPES.test(column.type) || FLOAT_TYPES.test(column.base_type)) {
      problems.push(`${where} is ${column.type}; amounts are bigint cents and rates numeric(14,6), never a float`);
    }
    const figures = CENTS_FIGURE_COLUMNS[`${column.table_name}.${column.column_name}`] !== undefined;
    if (column.column_name.endsWith('_cents') && column.base_type !== 'bigint' && !(figures && column.base_type === 'jsonb' && column.cents_figures)) {
      problems.push(
        figures
          ? `${where} is ${column.type}; a reviewed totals column is jsonb with a CHECK of figures_are_cents(${column.column_name})`
          : `${where} is ${column.type}; money columns (_cents) are bigint`,
      );
    }
    if ((column.column_name === 'rate' || column.column_name.endsWith('_rate')) && column.base_type !== 'numeric(14,6)') {
      problems.push(`${where} is ${column.type}; rate columns are numeric(14,6)`);
    }
  }

  const encrypted = new Map(
    (await rows<{ table_name: string; column_name: string; sealed: boolean }>(client, ENCRYPTED, [[...ENCRYPTED_COLUMNS]])).map((row) => [`${row.table_name}.${row.column_name}`, row.sealed]),
  );
  for (const column of ENCRYPTED_COLUMNS) {
    const sealed = encrypted.get(column);
    if (sealed === undefined) {
      problems.push(`encrypted column ${column} does not exist`);
    } else if (!sealed) {
      problems.push(`column ${column} is encrypted with the practice's key but no CHECK admits enc:v1 ciphertext alone`);
    }
  }

  // The application role switches to no other role: not billing's (an invoice rewritten from any request), not the
  // e-signature webhook's, not the operator's or the owner's (docs/adr/0050, 0055), and not the screening consumer's
  // (a request that could claim, record and complete a prospect's screening; migration 20261106090000).
  for (const role of [billingRole, ESIGN_ROLE, operatorRole, ownerRole, SCREENING_ROLE]) {
    const switches = await rows<{ switches: boolean }>(client, "SELECT to_regrole($2) IS NOT NULL AND pg_has_role($1, $2, 'SET') AS switches", [appRole, role]);
    if (switches[0]?.switches === true) {
      problems.push(`the application role ${appRole} may SET ROLE ${role}`);
    }
  }
  // The application role is never marked as a job's (docs/adr/0061): only the worker's own login is, so a person's
  // request on the web's login records their downloads and attests, and a job's connection does neither.
  const marked = await rows<{ marked: boolean }>(client, "SELECT to_regrole($2) IS NOT NULL AND pg_has_role($1, $2, 'MEMBER') AS marked", [appRole, JOB_ROLE]);
  if (marked[0]?.marked === true) {
    problems.push(`the application role ${appRole} is a member of the job role ${JOB_ROLE}`);
  }
  for (const item of NOT_FOR_THE_APPLICATION) {
    const found = await rows<{ app: boolean; role: boolean }>(
      client,
      "SELECT has_function_privilege($1, p.oid, 'EXECUTE') AS app, has_function_privilege($2, p.oid, 'EXECUTE') AS role FROM pg_proc p WHERE p.oid = to_regprocedure($3)",
      [appRole, item.role, item.function],
    );
    const privileges = found[0];
    if (privileges === undefined) {
      problems.push(`function ${item.function} does not exist; update NOT_FOR_THE_APPLICATION`);
    } else if (privileges.app) {
      problems.push(`the application role ${appRole} may call ${item.function}, which only ${item.role} may: ${item.reason}`);
    } else if (!privileges.role) {
      problems.push(`${item.role} may not call ${item.function}`);
    }
  }

  for (const [label, role] of [
    ['application', appRole],
    ['operator', operatorRole],
    ['billing', billingRole],
    ['e-signature', ESIGN_ROLE],
    ['job', JOB_ROLE],
    ['screening', SCREENING_ROLE],
  ] as const) {
    const roleExists = await rows<{ exists: boolean }>(client, 'SELECT to_regrole($1) IS NOT NULL AS exists', [role]);
    if (roleExists[0]?.exists === true) {
      for (const owned of await rows<{ object: string }>(client, OWNED_BY_APP, [role])) {
        problems.push(`the ${label} role ${role} owns ${owned.object}`);
      }
    } else {
      problems.push(`the ${label} role ${role} does not exist`);
    }
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
