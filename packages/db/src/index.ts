/**
 * @tp/db: the Drizzle schema, hand-written forward-only SQL migrations, the database roles, RLS
 * policies, the PHI table registry and the catalog test, the practice-scoped transaction API and
 * the audit wrapper (src/authz, under the 100% branch coverage gate), and application-layer
 * encryption with per-practice data keys (src/crypto).
 */
export * from './authz';
export {
  type CatalogOptions,
  NULLABLE_PRACTICE_ID_TABLES,
  REGISTRY_TABLE,
  TENANT_SETTING,
  TENANT_TABLE,
  catalogProblems,
  tenantPolicyExpression,
  tenantTables,
} from './catalog';
export { readDatabaseUrl } from './config';
export * from './crypto';
export { MIGRATIONS_DIR, type MigrateOptions, type MigrateResult, type Migration, MigrationError, historyProblems, migrate, readMigrations } from './migrate';
export {
  APP_DEV_LOGIN,
  APP_ROLE,
  OWNER_ROLE,
  type RoleAttributes,
  RoleBootstrapError,
  WANTED_ROLES,
  appDevLoginUrl,
  bootstrapRoles,
  createRoleStatement,
  grantStatements,
  managedRoles,
  roleAlteration,
} from './roles';
export * from './schema';
export { RETENTION_CLASSES, type RetentionClass, RetentionError, type RetentionStart, retainUntil } from './retention';
export { type DatabaseClient, type DatabasePool, type DatabasePoolClient, databaseClient, openPool } from './connect';
