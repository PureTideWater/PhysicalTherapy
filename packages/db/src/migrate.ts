import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { OWNER_ROLE, bootstrapRoles } from './roles';

/**
 * The forward-only migration runner (`pnpm db:migrate`). Migrations are hand-written SQL files in
 * packages/db/migrations named <YYYYMMDDHHMMSS>_<name>.sql, applied in name order, each in its own
 * transaction as the owner role. schema_migrations records each applied file with the SHA-256 of
 * its bytes. The runner refuses to apply anything when an applied file changed or disappeared, or
 * when a new file sorts before one already applied: an applied migration is never edited; a change
 * is a new migration (the new-migration skill).
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
  const names = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return names.map((name) => {
    if (!MIGRATION_NAME.test(name)) {
      throw new MigrationError(`${name}: migration files are named <YYYYMMDDHHMMSS>_<lowercase_name>.sql`);
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
}

export interface MigrateResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const migrations = readMigrations(options.migrationsDir);
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await bootstrapRoles(client, { devLogin: options.devLogin === true });
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      await client.query(`SET ROLE ${OWNER_ROLE}`);
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY CHECK (filename ~ '^[0-9]{14}_[a-z0-9_]+[.]sql$'),
        checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query('REVOKE ALL ON schema_migrations FROM PUBLIC');
      const { rows } = await client.query<{ filename: string; checksum: string }>('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
      const problems = historyProblems(migrations, rows);
      if (problems.length > 0) {
        throw new MigrationError(['refusing to migrate:', ...problems.map((problem) => `  ${problem}`)].join('\n'));
      }
      const done = new Set(rows.map((row) => row.filename));
      const applied: string[] = [];
      for (const migration of migrations.filter((candidate) => !done.has(candidate.name))) {
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw new MigrationError(`${migration.name} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        applied.push(migration.name);
      }
      return { applied, alreadyApplied: [...done] };
    } finally {
      await client.query('RESET ROLE');
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    }
  } finally {
    await client.end();
  }
}
