/**
 * The catalog reads behind the domain model (CO-02). Every query reads the PostgreSQL catalog
 * (pg_class, pg_attribute, pg_constraint, pg_index, pg_policy, pg_trigger with each trigger's enabled
 * state, pg_proc with each function's body, definition, owner, ACL and comment, the policies (pg_depend) and event
 * triggers (pg_event_trigger) that call each function, the functions outside public, pg_rules, pg_default_acl,
 * privileges) or the two tables
 * that are themselves catalog data, phi_table_registry and schema_migrations (each applied file's name
 * and SHA-256); none reads a row of any other table. The generator runs them in one READ ONLY
 * transaction.
 *
 * Every ORDER BY on text names COLLATE "C", so the order (and so the document) does not depend on the
 * database's collation: a database created under en_US.UTF-8 sorts `app_actor_admin_practice_ids()`
 * apart from one created under C.UTF-8, and glibc's locale data differs between releases.
 */

/** What runs a query: a pg Client or Pool. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface MetaRow {
  /** The server's major version (server_version_num / 10000). */
  readonly major: number;
  readonly migrations: number;
  readonly head: string | null;
}
export interface RoleRow {
  readonly name: string;
  readonly login: boolean;
  readonly bypass: boolean;
  readonly super: boolean;
}
export interface RelationRow {
  readonly oid: number;
  readonly name: string;
  readonly kind: string;
  readonly rls: boolean;
  readonly forced: boolean;
  readonly owner: string;
  readonly options: string[] | null;
}
export interface ColumnRow {
  readonly table_name: string;
  readonly num: number;
  readonly name: string;
  readonly type: string;
  readonly not_null: boolean;
  readonly default_expr: string | null;
  readonly identity: string | null;
  readonly generated: string | null;
}
export interface ConstraintRow {
  readonly table_name: string;
  readonly name: string;
  readonly type: string;
  readonly def: string;
  readonly cols: string[];
  readonly ref_table: string | null;
  readonly ref_cols: string[];
  readonly on_delete: string;
  readonly deferrable: boolean;
}
export interface IndexRow {
  readonly table_name: string;
  readonly name: string;
  readonly def: string;
  readonly is_primary: boolean;
  readonly is_unique: boolean;
  readonly backs_constraint: boolean;
}
export interface PolicyRow {
  readonly table_name: string;
  readonly name: string;
  readonly cmd: string;
  readonly permissive: boolean;
  readonly roles: string[];
  readonly using_expr: string | null;
  readonly check_expr: string | null;
}
export interface TriggerRow {
  readonly table_name: string;
  readonly name: string;
  readonly def: string;
  /** pg_trigger.tgenabled: O fires (origin and local), A always, R only under replica, D never. */
  readonly enabled: string;
  readonly function_name: string;
  /** The trigger function's signature as Appendix C prints it, so its function file can name the trigger. */
  readonly function_signature: string;
  readonly function_src: string | null;
}
export interface FunctionRow {
  readonly signature: string;
  readonly name: string;
  readonly language: string;
  readonly security_definer: boolean;
  readonly volatility: string;
  readonly config: string[];
  readonly returns: string;
  readonly execute_roles: string[];
  readonly execute_public: boolean;
  /** The body: prosrc, or the SQL-standard body (BEGIN ATOMIC) as PostgreSQL prints it. */
  readonly src: string | null;
  /** pg_proc.prokind: f a function, p a procedure, w a window function, a an aggregate. */
  readonly kind: string;
  /**
   * The whole CREATE OR REPLACE statement as pg_get_functiondef prints it (header, every SET and the body), for
   * kinds f, p and w; null for an aggregate, on which pg_get_functiondef raises. The function files print it
   * (functions.ts); the document does not.
   */
  readonly definition: string | null;
  /** The owner's name, and the same name quoted as an identifier (quote_ident) for the statements the files print. */
  readonly owner: string;
  readonly owner_ident: string;
  /** Every EXECUTE entry of the function's ACL, the default ACL when proacl is null, the owner's own entry among them. */
  readonly acl: readonly FunctionAclRow[];
  /** COMMENT ON FUNCTION, or null. */
  readonly comment: string | null;
  /** A member of an extension (pg_depend deptype 'e'): its definition belongs to the extension's version. */
  readonly extension_member: boolean;
  /**
   * Whether the body is SQL-standard (prosqlbody: RETURN ... or BEGIN ATOMIC ... END), which pg_get_functiondef prints
   * without dollar quotes, rather than prosrc between them; the function files label the body-hash line for which.
   */
  readonly sql_standard_body: boolean;
}
/** A policy whose USING or WITH CHECK expression calls a function in public directly (pg_depend from pg_policy). */
export interface FunctionPolicyRow {
  /** The function's signature as Appendix C prints it. */
  readonly function_signature: string;
  readonly table_name: string;
  readonly policy_name: string;
}
/** An event trigger and the function in public it runs (pg_event_trigger). */
export interface EventTriggerRow {
  readonly function_signature: string;
  readonly name: string;
  /** pg_event_trigger.evtevent: ddl_command_start, ddl_command_end, sql_drop, table_rewrite or login. */
  readonly event: string;
}
/** One entry of a function's ACL (aclexplode), EXECUTE being the only privilege a function has. */
export interface FunctionAclRow {
  /** The grantee's name, or null for PUBLIC (grantee 0). */
  readonly grantee: string | null;
  /** The grantee quoted as an identifier, or PUBLIC. */
  readonly grantee_ident: string;
  readonly grantor: string;
  readonly grantor_ident: string;
  readonly grantable: boolean;
}
export interface PrivilegeRow {
  readonly table_name: string;
  readonly role: string;
  readonly sel: boolean;
  readonly ins: boolean;
  readonly upd: boolean;
  readonly del: boolean;
  readonly trunc: boolean;
  readonly col_ins: boolean;
  readonly col_upd: boolean;
  readonly col_sel: boolean;
}
export interface ColumnPrivilegeRow {
  readonly table_name: string;
  readonly role: string;
  readonly priv: string;
  readonly cols: string[];
}
export interface EnumTypeRow {
  readonly name: string;
  readonly labels: string[];
}
export interface ViewRow {
  readonly name: string;
  readonly def: string;
}
export interface RegistryRow {
  readonly table_name: string;
  readonly policy_name: string;
  readonly registered_by: string;
}
export interface MigrationRow {
  readonly filename: string;
  /** The SHA-256 of the file's bytes as applied (packages/db/src/migrate.ts). */
  readonly checksum: string;
}
export interface RuleRow {
  readonly table_name: string;
  readonly name: string;
  readonly def: string;
}
export interface DefaultPrivilegeRow {
  readonly role: string;
  /** The schema, or null for every schema. */
  readonly schema: string | null;
  /** pg_default_acl.defaclobjtype: r tables, S sequences, f functions, T types, n schemas, L large objects. */
  readonly objtype: string;
  readonly acl: string[];
}
export interface SchemaRow {
  readonly schema: string;
  readonly tables: number;
  readonly owner: string;
}

export interface Catalog {
  readonly meta: MetaRow;
  readonly appliedMigrations: readonly string[];
  /** Each applied migration with the SHA-256 it was applied with, in name order. */
  readonly migrationChecksums: readonly MigrationRow[];
  readonly roles: readonly RoleRow[];
  /** The group roles whose privileges are listed: the managed roles that cannot log in, the owner aside. */
  readonly groupRoles: readonly string[];
  readonly relations: readonly RelationRow[];
  readonly columns: readonly ColumnRow[];
  readonly constraints: readonly ConstraintRow[];
  readonly indexes: readonly IndexRow[];
  readonly policies: readonly PolicyRow[];
  readonly triggers: readonly TriggerRow[];
  readonly functions: readonly FunctionRow[];
  /** The policies that call each function, for the function files (functions.ts); the document does not print them. */
  readonly functionPolicies: readonly FunctionPolicyRow[];
  /** The event triggers, for the function files; the document does not print them. */
  readonly eventTriggers: readonly EventTriggerRow[];
  /**
   * Every function, procedure or aggregate in a schema other than public, pg_catalog, information_schema and the
   * pg_toast and pg_temp schemas, extension members aside, as `schema.signature` (regprocedure under the pinned
   * search_path, public, qualifies every other schema's name): the function files refuse to be
   * written while one exists (functions.ts), since it would have no file and no diff. None exists today.
   */
  readonly otherSchemaFunctions: readonly string[];
  readonly privileges: readonly PrivilegeRow[];
  readonly columnPrivileges: readonly ColumnPrivilegeRow[];
  readonly enumTypes: readonly EnumTypeRow[];
  readonly viewDefs: readonly ViewRow[];
  /** Rewrite rules on relations in public (pg_rules leaves out each view's _RETURN rule). */
  readonly rules: readonly RuleRow[];
  /** ALTER DEFAULT PRIVILEGES entries, in this database. */
  readonly defaultPrivileges: readonly DefaultPrivilegeRow[];
  readonly registry: readonly RegistryRow[];
  readonly otherSchemas: readonly SchemaRow[];
}

async function rows<T>(client: Queryable, text: string, values?: unknown[]): Promise<T[]> {
  return (await client.query(text, values)).rows as T[];
}

/**
 * Reads the catalog. `managedRoles` are the roles `pnpm db:migrate` creates (roles.ts): roles belong
 * to the whole cluster, and a role some other process made (the worker's queue role, a test's login)
 * is not part of the schema the migrations build.
 */
export async function readCatalog(client: Queryable, options: { readonly managedRoles: readonly string[]; readonly ownerRole: string }): Promise<Catalog> {
  const [meta] = await rows<MetaRow>(
    client,
    `SELECT current_setting('server_version_num')::int / 10000 AS major,
            (SELECT count(*)::int FROM schema_migrations) AS migrations,
            (SELECT max(filename COLLATE "C") FROM schema_migrations) AS head`,
  );
  if (meta === undefined) throw new Error('the catalog returned no server version');
  const migrationChecksums = await rows<MigrationRow>(client, 'SELECT filename, checksum FROM schema_migrations ORDER BY filename COLLATE "C"');
  const appliedMigrations = migrationChecksums.map((r) => r.filename);

  const roles = await rows<RoleRow>(
    client,
    `SELECT rolname AS name, rolcanlogin AS login, rolbypassrls AS bypass, rolsuper AS super
       FROM pg_roles WHERE rolname = ANY ($1::text[]) ORDER BY rolname COLLATE "C"`,
    [options.managedRoles],
  );
  const groupRoles = roles.filter((r) => !r.login && r.name !== options.ownerRole).map((r) => r.name);

  const relations = await rows<RelationRow>(
    client,
    `SELECT c.oid::int AS oid, c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
            pg_get_userbyid(c.relowner) AS owner, c.reloptions AS options
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
      ORDER BY c.relname COLLATE "C"`,
  );

  const columns = await rows<ColumnRow>(
    client,
    `SELECT c.relname AS table_name, a.attnum AS num, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS not_null, CASE WHEN a.attgenerated = '' THEN pg_get_expr(d.adbin, d.adrelid) END AS default_expr,
            CASE WHEN a.attidentity <> '' THEN a.attidentity::text END AS identity,
            CASE WHEN a.attgenerated <> '' THEN pg_get_expr(d.adbin, d.adrelid) END AS generated
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname COLLATE "C", a.attnum`,
  );

  const constraints = await rows<ConstraintRow>(
    client,
    `SELECT c.relname AS table_name, con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid, true) AS def,
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
      ORDER BY c.relname COLLATE "C", con.contype, con.conname COLLATE "C"`,
  );

  const indexes = await rows<IndexRow>(
    client,
    `SELECT t.relname AS table_name, i.relname AS name, pg_get_indexdef(x.indexrelid) AS def,
            x.indisprimary AS is_primary, x.indisunique AS is_unique,
            EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = x.indexrelid) AS backs_constraint
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.relname COLLATE "C", i.relname COLLATE "C"`,
  );

  const policies = await rows<PolicyRow>(
    client,
    `SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS cmd, pol.polpermissive AS permissive,
            ARRAY(SELECT CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(pol.polroles) r
                    ORDER BY (CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r)::text END) COLLATE "C")::text[] AS roles,
            pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
            pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
       FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY c.relname COLLATE "C", pol.polname COLLATE "C"`,
  );

  const triggers = await rows<TriggerRow>(
    client,
    `SELECT c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid, true) AS def, t.tgenabled::text AS enabled,
            p.proname AS function_name, p.oid::regprocedure::text AS function_signature, p.prosrc AS function_src
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY c.relname COLLATE "C", t.tgname COLLATE "C"`,
  );

  const functions = await rows<FunctionRow>(
    client,
    `SELECT p.oid::regprocedure::text AS signature, p.proname AS name, l.lanname AS language, p.prosecdef AS security_definer,
            p.provolatile::text AS volatility, coalesce(p.proconfig, '{}')::text[] AS config,
            pg_get_function_result(p.oid) AS returns,
            ARRAY(SELECT pg_get_userbyid(g.grantee)::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
                   WHERE g.privilege_type = 'EXECUTE' AND g.grantee <> 0 AND g.grantee <> p.proowner
                   ORDER BY pg_get_userbyid(g.grantee)::text COLLATE "C")::text[] AS execute_roles,
            EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g WHERE g.privilege_type = 'EXECUTE' AND g.grantee = 0) AS execute_public,
            CASE WHEN p.prosqlbody IS NULL THEN p.prosrc ELSE pg_get_function_sqlbody(p.oid) END AS src,
            p.prokind::text AS kind,
            CASE WHEN p.prokind IN ('f','p','w') THEN pg_get_functiondef(p.oid) END AS definition,
            pg_get_userbyid(p.proowner)::text AS owner, quote_ident(pg_get_userbyid(p.proowner)) AS owner_ident,
            coalesce((SELECT json_agg(json_build_object(
                         'grantee', CASE WHEN g.grantee = 0 THEN NULL ELSE pg_get_userbyid(g.grantee)::text END,
                         'grantee_ident', CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END,
                         'grantor', pg_get_userbyid(g.grantor)::text,
                         'grantor_ident', quote_ident(pg_get_userbyid(g.grantor)),
                         'grantable', g.is_grantable)
                       ORDER BY g.grantee <> 0, pg_get_userbyid(g.grantee)::text COLLATE "C", pg_get_userbyid(g.grantor)::text COLLATE "C")
                        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g WHERE g.privilege_type = 'EXECUTE'), '[]'::json) AS acl,
            obj_description(p.oid, 'pg_proc') AS comment,
            EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') AS extension_member,
            p.prosqlbody IS NOT NULL AS sql_standard_body
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public'
      ORDER BY p.oid::regprocedure::text COLLATE "C"`,
  );

  const functionPolicies = await rows<FunctionPolicyRow>(
    client,
    `SELECT function_signature, table_name, policy_name FROM (
       SELECT DISTINCT p.oid::regprocedure::text AS function_signature, c.relname::text AS table_name, pol.polname::text AS policy_name
         FROM pg_depend d
         JOIN pg_policy pol ON pol.oid = d.objid
         JOIN pg_class c ON c.oid = pol.polrelid
         JOIN pg_proc p ON p.oid = d.refobjid
         JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE d.classid = 'pg_policy'::regclass AND d.refclassid = 'pg_proc'::regclass AND pn.nspname = 'public') called
      ORDER BY function_signature COLLATE "C", table_name COLLATE "C", policy_name COLLATE "C"`,
  );

  const eventTriggers = await rows<EventTriggerRow>(
    client,
    `SELECT p.oid::regprocedure::text AS function_signature, e.evtname AS name, e.evtevent AS event
       FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE pn.nspname = 'public'
      ORDER BY p.oid::regprocedure::text COLLATE "C", e.evtname COLLATE "C"`,
  );

  const otherSchemaFunctions = (
    await rows<{ signature: string }>(
      client,
      `SELECT p.oid::regprocedure::text AS signature
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname NOT IN ('public', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
        ORDER BY p.oid::regprocedure::text COLLATE "C"`,
    )
  ).map((r) => r.signature);

  const privileges = await rows<PrivilegeRow>(
    client,
    `SELECT c.relname AS table_name, r.rolname AS role,
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
      ORDER BY c.relname COLLATE "C", r.rolname COLLATE "C"`,
    [groupRoles],
  );

  const columnPrivileges = await rows<ColumnPrivilegeRow>(
    client,
    `SELECT table_name::text AS table_name, grantee::text AS role, privilege_type::text AS priv,
            array_agg(column_name::text ORDER BY column_name::text COLLATE "C")::text[] AS cols
       FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND grantee = ANY ($1::text[]) AND privilege_type IN ('SELECT','INSERT','UPDATE')
      GROUP BY table_name, grantee, privilege_type
      ORDER BY table_name::text COLLATE "C", grantee::text COLLATE "C", privilege_type::text COLLATE "C"`,
    [groupRoles],
  );

  const enumTypes = await rows<EnumTypeRow>(
    client,
    `SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname COLLATE "C"`,
  );

  const viewDefs = await rows<ViewRow>(
    client,
    `SELECT c.relname AS name, pg_get_viewdef(c.oid, true) AS def
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY c.relname COLLATE "C"`,
  );

  const rules = await rows<RuleRow>(
    client,
    `SELECT tablename::text AS table_name, rulename::text AS name, definition AS def
       FROM pg_rules WHERE schemaname = 'public' ORDER BY tablename::text COLLATE "C", rulename::text COLLATE "C"`,
  );

  const defaultPrivileges = await rows<DefaultPrivilegeRow>(
    client,
    `SELECT pg_get_userbyid(d.defaclrole)::text AS role, n.nspname::text AS schema, d.defaclobjtype::text AS objtype,
            ARRAY(SELECT a::text FROM unnest(d.defaclacl) a ORDER BY a::text COLLATE "C")::text[] AS acl
       FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      ORDER BY pg_get_userbyid(d.defaclrole)::text COLLATE "C", n.nspname::text COLLATE "C" NULLS FIRST, d.defaclobjtype::text COLLATE "C"`,
  );

  const [registryPresent] = await rows<{ present: boolean }>(client, `SELECT to_regclass('public.phi_table_registry') IS NOT NULL AS present`);
  const registry =
    registryPresent?.present === true
      ? await rows<RegistryRow>(client, 'SELECT table_name, policy_name, registered_by FROM phi_table_registry ORDER BY table_name COLLATE "C"')
      : [];

  const otherSchemas = await rows<SchemaRow>(
    client,
    `SELECT n.nspname AS schema, count(c.oid)::int AS tables, pg_get_userbyid(n.nspowner) AS owner
       FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind IN ('r','p')
      WHERE n.nspname NOT IN ('public','pg_catalog','information_schema','pg_toast') AND n.nspname NOT LIKE 'pg\\_%'
      GROUP BY n.nspname, n.nspowner ORDER BY n.nspname COLLATE "C"`,
  );

  return {
    meta,
    appliedMigrations,
    migrationChecksums,
    roles,
    groupRoles,
    relations,
    columns,
    constraints,
    indexes,
    policies,
    triggers,
    functions,
    functionPolicies,
    eventTriggers,
    otherSchemaFunctions,
    privileges,
    columnPrivileges,
    enumTypes,
    viewDefs,
    rules,
    defaultPrivileges,
    registry,
    otherSchemas,
  };
}
