import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { APP_ROLE, OWNER_ROLE, bootstrapRoles } from './roles';

/**
 * The forward-only migration runner (`pnpm db:migrate`). Migrations are hand-written SQL files in
 * packages/db/migrations named <YYYYMMDDHHMMSS>_<name>.sql, applied in name order, each in its own
 * transaction as the owner role. schema_migrations records each applied file with the SHA-256 of
 * its bytes. The runner refuses to apply anything when an applied file changed or disappeared, or
 * when a new file sorts before one already applied: an applied migration is never edited; a change
 * is a new migration (the new-migration skill). Every file in the directory must be a migration by
 * that name, so a misnamed file is refused rather than skipped.
 *
 * Each migration's transaction sets the owner role itself (SET LOCAL ROLE), then checks after the
 * SQL that the role is still the owner and that every object in schema public belongs to it and
 * none to the application role; a migration that switches role or leaves an object owned by anyone
 * else is rolled back.
 *
 * `--dry-run` applies the pending migrations in one transaction, runs the same checks, and rolls
 * everything back: the database is left exactly at its previous head (docs/adr/0009).
 */
export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');

const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/;

/** Serializes migrators on one database (advisory locks are per database). */
const MIGRATION_LOCK = 0x4d494752;

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

export interface Migration {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export function readMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return entries.map((entry) => {
    const { name } = entry;
    if (!entry.isFile() || !MIGRATION_NAME.test(name)) {
      throw new MigrationError(`${name}: everything in the migrations directory is a migration file named <YYYYMMDDHHMMSS>_<lowercase_name>.sql`);
    }
    const bytes = readFileSync(path.join(dir, name));
    return { name, sql: bytes.toString('utf8'), checksum: createHash('sha256').update(bytes).digest('hex') };
  });
}

/** What would go wrong applying `migrations` over `applied`; empty when the history is intact. */
export function historyProblems(migrations: readonly Migration[], applied: readonly { filename: string; checksum: string }[]): string[] {
  const problems: string[] = [];
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  for (const row of applied) {
    const file = byName.get(row.filename);
    if (file === undefined) {
      problems.push(`${row.filename} was applied but its file is missing`);
    } else if (file.checksum !== row.checksum) {
      problems.push(`${row.filename} changed after it was applied; migrations are forward-only, so write a new one`);
    }
  }
  const lastApplied = applied.map((row) => row.filename).sort().at(-1);
  const appliedNames = new Set(applied.map((row) => row.filename));
  for (const migration of migrations) {
    if (lastApplied !== undefined && !appliedNames.has(migration.name) && migration.name < lastApplied) {
      problems.push(`${migration.name} sorts before ${lastApplied}, which is already applied; give it a later timestamp`);
    }
  }
  return problems;
}

export interface MigrateOptions {
  /** A connection that can create roles and SET ROLE to the owner (a superuser in dev and test). */
  readonly databaseUrl: string;
  readonly migrationsDir?: string;
  /** Also create the dev and test login for the application role. */
  readonly devLogin?: boolean;
  /** Apply the pending migrations in one transaction and roll it back: nothing changes. */
  readonly dryRun?: boolean;
}

export interface MigrateResult {
  /** Applied, or for a dry run, applied and rolled back. */
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
  readonly dryRun: boolean;
}

/** Objects in schema public that the owner role does not own, and anything the application role owns. */
const OWNERSHIP_PROBLEMS = `
  SELECT kind || ' ' || name || ' is owned by ' || owner AS problem FROM (
    SELECT 'relation' AS kind, c.relname::text AS name, pg_get_userbyid(c.relowner)::text AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'function', p.proname::text, pg_get_userbyid(p.proowner)::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'type', t.typname::text, pg_get_userbyid(t.typowner)::text
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'
  ) objects
  WHERE owner <> $1
  UNION ALL
  SELECT 'the application role ' || $2 || ' owns ' || count(*) || ' object(s)' FROM (
    SELECT 1 FROM pg_class WHERE relowner = $2::regrole
    UNION ALL SELECT 1 FROM pg_proc WHERE proowner = $2::regrole
    UNION ALL SELECT 1 FROM pg_namespace WHERE nspowner = $2::regrole
    UNION ALL SELECT 1 FROM pg_type WHERE typowner = $2::regrole
  ) owned HAVING count(*) > 0
  ORDER BY 1`;

/** Runs one migration's SQL as the owner inside the open transaction, then checks role and ownership. */
async function applyMigration(client: pg.Client, migration: Migration): Promise<void> {
  await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
  await client.query(migration.sql);
  const role = await client.query<{ role: string }>('SELECT current_user AS role');
  if (role.rows[0]?.role !== OWNER_ROLE) {
    throw new Error(`it left the session as ${role.rows[0]?.role ?? 'an unknown role'}; migrations run as ${OWNER_ROLE} and never change role`);
  }
  const ownership = await client.query<{ problem: string }>(OWNERSHIP_PROBLEMS, [OWNER_ROLE, APP_ROLE]);
  if (ownership.rows.length > 0) {
    throw new Error(`every object belongs to ${OWNER_ROLE} and none to ${APP_ROLE}, but ${ownership.rows.map((row) => row.problem).join('; ')}`);
  }
  await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
}

const SCHEMA_MIGRATIONS = `CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY CHECK (filename ~ '^[0-9]{14}_[a-z0-9_]+[.]sql$'),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

async function pendingMigrations(client: pg.Client, migrations: readonly Migration[]): Promise<{ pending: Migration[]; done: string[] }> {
  await client.query(SCHEMA_MIGRATIONS);
  await client.query('REVOKE ALL ON schema_migrations FROM PUBLIC');
  const { rows } = await client.query<{ filename: string; checksum: string }>('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
  const problems = historyProblems(migrations, rows);
  if (problems.length > 0) {
    throw new MigrationError(['refusing to migrate:', ...problems.map((problem) => `  ${problem}`)].join('\n'));
  }
  const done = new Set(rows.map((row) => row.filename));
  return { pending: migrations.filter((candidate) => !done.has(candidate.name)), done: [...done] };
}

function failure(migration: Migration, error: unknown): MigrationError {
  return new MigrationError(`${migration.name} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
}

/**
 * The dry run: one transaction holding the role bootstrap, every pending migration and its checks,
 * always rolled back. Statements that cannot run in a transaction block fail here as they would in
 * the real run, which also uses a transaction per migration.
 */
async function dryRun(client: pg.Client, migrations: readonly Migration[], devLogin: boolean): Promise<MigrateResult> {
  await client.query('BEGIN');
  try {
    await bootstrapRoles(client, { devLogin, retry: false });
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    const { pending, done } = await pendingMigrations(client, migrations);
    const applied: string[] = [];
    for (const migration of pending) {
      try {
        await applyMigration(client, migration);
      } catch (error) {
        throw failure(migration, error);
      }
      applied.push(migration.name);
    }
    return { applied, alreadyApplied: done, dryRun: true };
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const migrations = readMigrations(options.migrationsDir);
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    if (options.dryRun === true) {
      return await dryRun(client, migrations, options.devLogin === true);
    }
    await bootstrapRoles(client, { devLogin: options.devLogin === true });
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      await client.query(`SET ROLE ${OWNER_ROLE}`);
      const { pending, done } = await pendingMigrations(client, migrations);
      const applied: string[] = [];
      for (const migration of pending) {
        await client.query('BEGIN');
        try {
          await applyMigration(client, migration);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw failure(migration, error);
        }
        applied.push(migration.name);
      }
      return { applied, alreadyApplied: done, dryRun: false };
    } finally {
      await client.query('RESET ROLE');
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    }
  } finally {
    await client.end();
  }
}
