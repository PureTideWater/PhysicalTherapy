/**
 * @tp/db: the Drizzle schema, hand-written forward-only SQL migrations, the database roles, RLS
 * policies, the PHI table registry and the catalog test (milestone 1). Authorization helpers live in
 * src/authz and carry the 100% branch coverage gate.
 */
export { readDatabaseUrl } from './config';
export { MIGRATIONS_DIR, type MigrateOptions, type MigrateResult, type Migration, MigrationError, historyProblems, migrate, readMigrations } from './migrate';
export { APP_DEV_LOGIN, APP_ROLE, OWNER_ROLE, appDevLoginUrl, bootstrapRoles, bootstrapStatements } from './roles';
export * from './schema';
