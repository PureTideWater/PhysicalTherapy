/**
 * @tp/db for running applications (the web app's server, the worker): the Drizzle schema, the
 * practice-scoped transaction API and authorization helpers (src/authz), the catalog functions,
 * application-layer encryption and connections, without the migration runner and the role bootstrap,
 * which read the migrations directory from disk and belong to deploy-time tools. The package's main
 * entry adds those.
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
export * from './schema';
export { RETENTION_CLASSES, type RetentionClass, RetentionError, type RetentionStart, retainUntil } from './retention';
export { type DatabaseClient, type DatabasePool, type DatabasePoolClient, databaseClient, openPool } from './connect';
