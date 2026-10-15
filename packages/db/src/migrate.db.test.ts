import { copyFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, MigrationError, migrate, readMigrations } from './migrate';
import { APP_DEV_LOGIN, APP_ROLE, OWNER_ROLE, appDevLoginUrl } from './roles';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';
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

/**
 * Everything a migration can change, as sorted text: relations and their owners, columns, functions,
 * triggers, schemas, grants on public tables, and the applied migrations. Two equal snapshots mean
 * the database is where it was.
 */
async function catalogSnapshot(url: string): Promise<string[]> {
  const rows = await query<{ line: string }>(
    url,
    `SELECT line FROM (
       SELECT 'relation ' || n.nspname || '.' || c.relname || ' ' || c.relkind::text || ' ' || pg_get_userbyid(c.relowner) || ' ' || coalesce(array_to_string(c.relacl, ','), '') AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
       UNION ALL
       SELECT 'column ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
       UNION ALL
       SELECT 'function ' || p.proname || ' ' || pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
       UNION ALL
       SELECT 'trigger ' || t.tgname || ' on ' || t.tgrelid::regclass::text FROM pg_trigger t WHERE NOT t.tgisinternal
       UNION ALL
       SELECT 'schema ' || nspname || ' ' || pg_get_userbyid(nspowner) || ' ' || coalesce(array_to_string(nspacl, ','), '') FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
       UNION ALL
       SELECT 'migration ' || filename || ' ' || checksum FROM schema_migrations WHERE to_regclass('public.schema_migrations') IS NOT NULL
     ) snapshot ORDER BY line`,
  ).catch(async (error: unknown) => {
    // Before the first migration there is no schema_migrations table to read.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') {
      return query<{ line: string }>(
        url,
        "SELECT 'relation ' || relname AS line FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY 1",
      );
    }
    throw error;
  });
  return rows.map((row) => row.line);
}

const PROBE = '29991231235959_dry_run_probe.sql';
const PROBE_SQL = `CREATE TABLE dry_run_probe (id integer PRIMARY KEY, note text NOT NULL DEFAULT '');
CREATE FUNCTION dry_run_probe_count() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM dry_run_probe $$;
ALTER TABLE rule_release ADD COLUMN dry_run_probe text;`;

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
      expect(first).toEqual({ applied: readMigrations(dir).map((migration) => migration.name), alreadyApplied: [], dryRun: false });
      const second = await migrate({ databaseUrl: url, migrationsDir: dir });
      expect(second).toEqual({ applied: [], alreadyApplied: first.applied, dryRun: false });

      const rows = await query<{ filename: string; checksum: string }>(url, 'SELECT filename, checksum FROM schema_migrations');
      expect(rows).toEqual(readMigrations(dir).map((migration) => ({ filename: migration.name, checksum: migration.checksum })));
      const owners = await query<{ relname: string; owner: string }>(
        url,
        "SELECT c.relname, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1",
      );
      expect(owners).toEqual(
        [
          'agreement',
          'audit_event',
          'grant',
          'membership',
          'mutation_request',
          'organization',
          'phi_table_registry',
          'practice',
          'restore_drill',
          'role_permission',
          'rule_record',
          'rule_release',
          'schema_migrations',
          'support_grant',
          'user',
          'user_device',
          'user_session',
        ].map((relname) => ({ relname, owner: OWNER_ROLE })),
      );
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
        const count = readMigrations(MIGRATIONS_DIR).length;
        expect(results.map((result) => result.applied.length)).toEqual([count, count]);
      }),
    );
  });
});

describe('migrate --dry-run', () => {
  it('applies the pending migrations to a database at the previous head, then leaves it exactly there', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const before = await catalogSnapshot(url);
      expect(before).toEqual(expect.arrayContaining([expect.stringMatching(/^relation public.rule_release r tp_owner/)]));

      const result = await migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true });
      expect(result).toEqual({ applied: [PROBE], alreadyApplied: readMigrations(MIGRATIONS_DIR).map((migration) => migration.name), dryRun: true });
      expect(await catalogSnapshot(url)).toEqual(before);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'dry_run_probe'")).toEqual([]);

      // Forward for real, after the dry run said it would work.
      expect((await migrate({ databaseUrl: url, migrationsDir: dir })).applied).toEqual([PROBE]);
      expect(await catalogSnapshot(url)).not.toEqual(before);
      expect(await query(url, 'SELECT dry_run_probe_count()::int AS n')).toEqual([{ n: 0 }]);
    });
  });

  it('leaves an empty database empty', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      const before = await catalogSnapshot(url);
      const result = await migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true, devLogin: true });
      expect(result.applied).toEqual(readMigrations(dir).map((migration) => migration.name));
      expect(await catalogSnapshot(url)).toEqual(before);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE schemaname = 'public'")).toEqual([]);
    });
  });

  it('reports a migration that would fail, and changes nothing', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), `${PROBE_SQL}\nSELECT no_such_function();`);
      const before = await catalogSnapshot(url);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true })).rejects.toThrow(`${PROBE} failed`);
      expect(await catalogSnapshot(url)).toEqual(before);
    });
  });

  it('refuses a broken history before applying anything', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, '20000101000000_too_early.sql'), 'SELECT 1;');
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true })).rejects.toThrow(/sorts before/);
    });
  });
});

describe('what every migration is checked for', () => {
  it('refuses a migration that switches role, and rolls it back', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), 'RESET ROLE;\nCREATE TABLE owned_by_superuser (id integer);');
      for (const dryRun of [true, false]) {
        await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun })).rejects.toThrow(/left the session as postgres; migrations run as tp_owner and never change role/);
      }
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename = 'owned_by_superuser'")).toEqual([]);
      expect(await query(url, 'SELECT filename FROM schema_migrations WHERE filename = $1', [PROBE])).toEqual([]);
    });
  });

  it('refuses a migration that leaves an object owned by another role, even after switching back', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url, migrationsDir: dir });
      writeFileSync(path.join(dir, PROBE), `RESET ROLE;\nCREATE TABLE owned_by_superuser (id integer);\nSET LOCAL ROLE ${OWNER_ROLE};`);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/relation owned_by_superuser is owned by postgres/);
      writeFileSync(path.join(dir, PROBE), `CREATE TABLE given_away (id integer);\nRESET ROLE;\nALTER TABLE given_away OWNER TO ${APP_ROLE};\nSET LOCAL ROLE ${OWNER_ROLE};`);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir })).rejects.toThrow(/relation given_away is owned by tp_app; the application role tp_app owns 3 object\(s\)/);
      expect(await query(url, "SELECT 1 FROM pg_tables WHERE tablename IN ('owned_by_superuser', 'given_away')")).toEqual([]);
    });
  });
});

describe('a deploy login that is not a superuser', () => {
  it('bootstraps and migrates a fresh database it owns, as the RDS master user would', async () => {
    const login = `tp_test_deployer_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const password = randomUUID();
    // Roles are cluster-wide and other tests share tp_owner and tp_app, so the login is given what it
    // would hold after creating them itself on its first deploy: membership with ADMIN OPTION.
    await query(adminUrl, `CREATE ROLE ${login} LOGIN CREATEROLE NOSUPERUSER PASSWORD '${password}'`);
    try {
      await query(adminUrl, `GRANT ${OWNER_ROLE}, ${APP_ROLE} TO ${login} WITH ADMIN OPTION, SET FALSE`);
      await withScratchDatabase(adminUrl, async (url) => {
        const name = new URL(url).pathname.slice(1);
        await query(adminUrl, `ALTER DATABASE ${name} OWNER TO ${login}`);
        const deployer = new URL(url);
        deployer.username = login;
        deployer.password = password;
        const result = await migrate({ databaseUrl: deployer.toString() });
        expect(result.applied).toEqual(readMigrations(MIGRATIONS_DIR).map((migration) => migration.name));
        expect(await query(deployer.toString(), `SELECT pg_has_role(current_user, '${OWNER_ROLE}', 'SET') AS can_set`)).toEqual([{ can_set: true }]);
        const owners = await query<{ owner: string }>(
          url,
          "SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'",
        );
        expect(owners).toEqual([{ owner: OWNER_ROLE }]);
        expect((await migrate({ databaseUrl: deployer.toString(), dryRun: true })).applied).toEqual([]);
      });
    } finally {
      await query(adminUrl, `DROP ROLE IF EXISTS ${login}`);
    }
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
    PgBoolean: 'boolean',
    PgBigInt64: 'bigint',
  };
  const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));

  it('defines every migrated table', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      const migrated = await query<{ tablename: string }>(url, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY 1");
      expect(tables.map((table) => getTableConfig(table).name).sort()).toEqual(migrated.map((row) => row.tablename));
    });
  });

  it('matches the migrated columns, types and nullability', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      for (const table of tables) {
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
