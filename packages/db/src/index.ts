/**
 * @tp/db: the Drizzle schema, hand-written forward-only SQL migrations, the database roles, RLS
 * policies, the PHI table registry and the catalog test, the practice-scoped transaction API and
 * the audit wrapper (src/authz, under the 100% branch coverage gate), and application-layer
 * encryption with per-practice data keys (src/crypto).
 */
export * from './runtime';
export { type SeedOrganization, type SeedPerson, type SeedResult, SeedError, seedSyntheticTenancy } from './seed';
export { MIGRATIONS_DIR, type MigrateOptions, type MigrateResult, type Migration, MigrationError, historyProblems, migrate, readMigrations } from './migrate';
export {
  APP_DEV_LOGIN,
  APP_ROLE,
  OPERATOR_ROLE,
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
