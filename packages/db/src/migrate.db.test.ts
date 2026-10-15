import { copyFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, MigrationError, migrate, readMigrations } from './migrate';
import { APP_DEV_LOGIN, APP_ROLE, OWNER_ROLE, appDevLoginUrl } from './roles';
import { ruleRecord, ruleRelease } from './schema';
import { withScratchDatabase } from './testing';

const adminUrl = readDatabaseUrl();

async function query<T extends pg.QueryResultRow>(url: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'migrations-db-'));
  for (const migration of readMigrations(MIGRATIONS_DIR)) {
    copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies every migration to an empty database, as the owner, once', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      const first = await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(first).toEqual({ applied: readMigrations(dir).map((migration) => migration.name), alreadyApplied: [] });
      const second = await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(second).toEqual({ applied: [], alreadyApplied: first.applied });

      const rows = await query<{ filename: string; checksum: string }>(url, 'SELECT filename, checksum FROM schema_migrations');
      expect(rows).toEqual(readMigrations(dir).map((migration) => ({ filename: migration.name, checksum: migration.checksum })));
      const owners = await query<{ relname: string; owner: string }>(
        url,
        "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1",
      );
      expect(owners).toEqual([
        { relname: 'rule_record', owner: OWNER_ROLE },
        { relname: 'rule_release', owner: OWNER_ROLE },
        { relname: 'schema_migrations', owner: OWNER_ROLE },
      ]);
    });
  });

  it('refuses to run when an applied migration changed, and applies nothing new', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      const [applied] = readMigrations(dir);
      writeFileSync(path.join(dir, applied?.name ?? ''), `${applied?.sql ?? ''}\n-- an edit\n`);
      writeFileSync(path.join(dir, '29991231235959_later.sql'), 'CREATE TABLE later (id integer);');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/changed after it was applied/);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'later'")).toEqual([]);
    });
  });

  it('refuses to run when an applied migration is missing or a new one sorts before it', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, '20000101000000_too_early.sql'), 'SELECT 1;');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/sorts before/);
      unlinkSync(path.join(dir, '20000101000000_too_early.sql'));
      const [applied] = readMigrations(dir);
      unlinkSync(path.join(dir, applied?.name ?? ''));
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/was applied but its file is missing/);
    });
  });

  it('rolls back a migration that fails, recording nothing', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      writeFileSync(path.join(dir, '29991231235959_broken.sql'), 'CREATE TABLE half_done (id integer);\nSELECT no_such_function();');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(MigrationError);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'half_done'")).toEqual([]);
      expect(await query(url, "SELECT 1 FROM schema_migrations WHERE filename = '29991231235959_broken.sql'")).toEqual([]);
    });
  });

  it('migrates two databases at once (the roles are shared by the cluster)', async () => {
    await withScratchDatabase(adminUrl, (a) =>
      withScratchDatabase(adminUrl, async (b) => {
        const results = await Promise.all([migrate({ databaseUrl: a, devLogin: true }), migrate({ databaseUrl: b, devLogin: true })]);
        expect(results.map((result) => result.applied.length)).toEqual([1, 1]);
      }),
    );
  });
});

describe('roles', () => {
  it('gives the application role no superuser, no bypass, no login and no ownership', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, devLogin: true });
      const roles = await query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
        url,
        'SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname',
        [[APP_ROLE, APP_DEV_LOGIN, OWNER_ROLE]],
      );
      expect(roles).toEqual([
        { rolname: APP_ROLE, rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreatedb: false, rolcreaterole: false },
        { rolname: APP_DEV_LOGIN, rolsuper: false, rolbypassrls: false, rolcanlogin: true, rolcreatedb: false, rolcreaterole: false },
        { rolname: OWNER_ROLE, rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolcreatedb: false, rolcreaterole: false },
      ]);
      const owned = await query<{ count: string }>(
        url,
        `SELECT (SELECT count(*) FROM pg_class WHERE relowner = $1::regrole)
              + (SELECT count(*) FROM pg_proc WHERE proowner = $1::regrole)
              + (SELECT count(*) FROM pg_namespace WHERE nspowner = $1::regrole)
              + (SELECT count(*) FROM pg_type WHERE typowner = $1::regrole) AS count`,
        [APP_ROLE],
      );
      expect(owned).toEqual([{ count: '0' }]);
    });
  });

  it('lets the dev login read rule content as the application role, and nothing more', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, devLogin: true });
      const appUrl = appDevLoginUrl(url);
      expect(await query(appUrl, 'SELECT count(*)::int AS n FROM rule_record')).toEqual([{ n: 0 }]);
      expect(await query(appUrl, `SELECT pg_has_role(current_user, '${APP_ROLE}', 'MEMBER') AS member`)).toEqual([{ member: true }]);
      await expect(query(appUrl, 'CREATE TABLE mine (id integer)')).rejects.toMatchObject({ code: '42501' });
      await expect(query(appUrl, 'SELECT * FROM schema_migrations')).rejects.toMatchObject({ code: '42501' });
      await expect(query(appUrl, `SET ROLE ${OWNER_ROLE}`)).rejects.toMatchObject({ code: '42501' });
    });
  });
});

describe('the Drizzle schema', () => {
  const POSTGRES_TYPES: Record<string, string> = {
    PgUUID: 'uuid',
    PgInteger: 'integer',
    PgText: 'text',
    PgTimestamp: 'timestamp with time zone',
    PgJsonb: 'jsonb',
    PgDateString: 'date',
  };

  it('matches the migrated columns, types and nullability', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      for (const table of [ruleRelease, ruleRecord]) {
        const config = getTableConfig(table);
        const columns = await query<{ column_name: string; data_type: string; is_nullable: string }>(
          url,
          "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
          [config.name],
        );
        expect(
          config.columns.map((column) => ({ column_name: column.name, data_type: POSTGRES_TYPES[column.columnType] ?? column.columnType, is_nullable: column.notNull ? 'NO' : 'YES' })),
          config.name,
        ).toEqual(columns);
      }
    });
  });
});
