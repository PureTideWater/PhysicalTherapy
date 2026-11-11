import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR, MigrationError, type MigrationLockWait, migrate, readMigrations } from './migrate';
import { withScratchDatabase } from './testing';

/**
 * A migration never waits for a lock without limit (docs/adr/0009, the amendment of 2026-11-11). Each test holds a
 * table the way a long job does (an open transaction that read it), runs a migration that changes that table, and
 * watches what a reader arriving behind the migration meets.
 */
const adminUrl = readDatabaseUrl();

const PROBE = '29991231235959_lock_wait_probe.sql';
const PROBE_SQL = 'ALTER TABLE rule_release ADD COLUMN lock_wait_probe text;';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'migrations-lock-'));
  for (const migration of readMigrations(MIGRATIONS_DIR)) {
    copyFileSync(path.join(MIGRATIONS_DIR, migration.name), path.join(dir, migration.name));
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** An open transaction that has read rule_release: what a long job or report holds. */
async function holdTable(url: string): Promise<pg.Client> {
  const holder = await connect(url);
  await holder.query('BEGIN');
  await holder.query('SELECT count(*) FROM rule_release');
  return holder;
}

async function probeColumn(client: pg.Client): Promise<number> {
  const { rows } = await client.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'rule_release' AND column_name = 'lock_wait_probe'");
  return rows.length;
}

async function probeRecorded(client: pg.Client): Promise<number> {
  return (await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [PROBE])).rows.length;
}

/** Lock requests on rule_release that are waiting right now. */
async function waiting(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE relation = 'rule_release'::regclass AND NOT granted");
  return rows[0]?.n ?? 0;
}

function lockWait(overrides: Partial<MigrationLockWait> & { paused?: number[] }): MigrationLockWait {
  return {
    timeoutMs: 250,
    attempts: 3,
    budgetMs: 60_000,
    pause: (failed) => {
      overrides.paused?.push(failed);
      return new Promise((resolve) => setTimeout(resolve, 150));
    },
    ...overrides,
  };
}

describe('a migration whose table a long transaction holds', () => {
  it('gives up after its tries, in words that name the migration, changes nothing, and never keeps a reader queued behind it', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const holder = await holdTable(url);
      const watcher = await connect(url);
      const reader = await connect(url);
      // The reader waits far longer than the migration does: if the migration's request stayed in the queue, the
      // reader would stay behind it until this ran out.
      await reader.query("SET lock_timeout = '4s'");
      const paused: number[] = [];
      const outcome = migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ paused }) }).then(
        () => 'applied' as const,
        (error: unknown) => error,
      );
      try {
        // Once the migration's request for the table is seen waiting, a reader arrives behind it.
        let sawWaiting = false;
        const settled = outcome.then(() => true);
        while (!sawWaiting && !(await Promise.race([settled, new Promise<false>((resolve) => setTimeout(() => resolve(false), 10))]))) {
          sawWaiting = (await waiting(watcher)) > 0;
        }
        expect(sawWaiting).toBe(true);
        // Let through when the try it met gave up, well inside its own four seconds.
        await expect(reader.query('SELECT count(*) FROM rule_release')).resolves.toBeDefined();

        const error = await outcome;
        expect(error).toBeInstanceOf(MigrationError);
        const message = (error as MigrationError).message;
        expect(message).toContain(`${PROBE} failed: a lock it needs stayed held (tried 3 times, waiting 250 ms for each lock)`);
        expect(message).toContain('it changed nothing; run the deploy again');
        expect(paused).toEqual([1, 2]);
        expect(await waiting(watcher)).toBe(0);
        expect(await probeColumn(watcher)).toBe(0);
        expect(await probeRecorded(watcher)).toBe(0);
      } finally {
        await holder.query('ROLLBACK');
        await outcome;
        await Promise.all([holder.end(), watcher.end(), reader.end()]);
      }
      // The migrators' lock was given back, and the same run applies once the table is free.
      const again = await migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({}) });
      expect(again.applied).toEqual([PROBE]);
    });
  });

  it('applies on a later try once the holder is gone, with one record', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const holder = await holdTable(url);
      const paused: number[] = [];
      try {
        const result = await migrate({
          databaseUrl: url,
          migrationsDir: dir,
          lockWait: lockWait({
            pause: async (failed) => {
              paused.push(failed);
              if (failed === 2) {
                await holder.query('ROLLBACK');
              }
            },
          }),
        });
        expect(result.applied).toEqual([PROBE]);
        expect(paused).toEqual([1, 2]);
        expect(await probeColumn(holder)).toBe(1);
        expect(await probeRecorded(holder)).toBe(1);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });

  it('tries each migration afresh: what a timed-out try did before its wait is rolled back', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), `CREATE TABLE lock_wait_before (id integer PRIMARY KEY);\n${PROBE_SQL}`);
      const holder = await holdTable(url);
      try {
        await expect(migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ attempts: 2 }) })).rejects.toThrow(/tried 2 times/);
        expect((await holder.query("SELECT 1 FROM pg_tables WHERE tablename = 'lock_wait_before'")).rows).toEqual([]);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });

  it('fails a dry run at once, tried once, and leaves nothing', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const holder = await holdTable(url);
      const paused: number[] = [];
      try {
        await expect(migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true, lockWait: lockWait({ paused }) })).rejects.toThrow(
          `${PROBE} failed: a lock it needs stayed held (tried once, waiting 250 ms for each lock)`,
        );
        expect(paused).toEqual([]);
        expect(await waiting(holder)).toBe(0);
        expect(await probeColumn(holder)).toBe(0);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });
});

describe('what is not tried again', () => {
  it('a migration’s own refusal with lock_not_available fails at once in its own words', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(
        path.join(dir, PROBE),
        "DO $$ BEGIN RAISE EXCEPTION 'the probe stayed in use for five minutes; run the deploy again' USING ERRCODE = 'lock_not_available'; END $$;",
      );
      const paused: number[] = [];
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ paused }) })).rejects.toThrow(
        `${PROBE} failed: the probe stayed in use for five minutes; run the deploy again`,
      );
      expect(paused).toEqual([]);
    });
  });

  it('NOWAIT’s refusal fails at once', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), 'LOCK TABLE rule_release IN ACCESS EXCLUSIVE MODE NOWAIT;');
      const holder = await holdTable(url);
      const paused: number[] = [];
      try {
        await expect(migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ paused }) })).rejects.toThrow(`${PROBE} failed: could not obtain lock`);
        expect(paused).toEqual([]);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });

  it('any other failure, as before', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), 'SELECT no_such_function();');
      const paused: number[] = [];
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ paused }) })).rejects.toThrow(MigrationError);
      expect(paused).toEqual([]);
    });
  });
});

describe('the timeout is each transaction’s own', () => {
  it('is set for every migration’s transaction and gone after it, whatever the one before it set', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      // The first changes the session's own timeout (a migration should not, but one could); the second records what
      // it runs under.
      writeFileSync(path.join(dir, '29991231235958_lock_wait_unset.sql'), "SET lock_timeout = '7s';");
      writeFileSync(path.join(dir, PROBE), "CREATE TABLE lock_wait_seen AS SELECT current_setting('lock_timeout') AS seen;");
      await migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({}) });
      const client = await connect(url);
      try {
        expect((await client.query('SELECT seen FROM lock_wait_seen')).rows).toEqual([{ seen: '250ms' }]);
      } finally {
        await client.end();
      }
    });
  });
});

describe('the run’s budget of time', () => {
  it('starts no new try once it is spent, whatever tries are left', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const holder = await holdTable(url);
      const paused: number[] = [];
      try {
        await expect(migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ paused, attempts: 20, budgetMs: 0 }) })).rejects.toThrow(
          `${PROBE} failed: a lock it needs stayed held (tried once, waiting 250 ms for each lock)`,
        );
        expect(paused).toEqual([]);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });
});

describe('a migration that undoes the runner’s bound', () => {
  it('is refused and rolled back when it leaves lock_timeout off', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), `SET LOCAL lock_timeout = 0;\n${PROBE_SQL}`);
      await expect(migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({}) })).rejects.toThrow(`${PROBE} failed: it left lock_timeout off`);
      const client = await connect(url);
      try {
        expect(await probeColumn(client)).toBe(0);
        expect(await probeRecorded(client)).toBe(0);
      } finally {
        await client.end();
      }
    });
  });

  it('is refused when it commits and begins a transaction of its own, and says that part of it is committed', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), 'CREATE TABLE lock_wait_committed (id integer PRIMARY KEY);\nCOMMIT;\nBEGIN;\nCREATE TABLE lock_wait_after (id integer PRIMARY KEY);');
      const error: unknown = await migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({}) }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MigrationError);
      expect((error as MigrationError).message).toContain(`${PROBE} failed after committing part of itself`);
      expect((error as MigrationError).message).not.toContain('changed nothing');
      const client = await connect(url);
      try {
        expect((await client.query("SELECT tablename FROM pg_tables WHERE tablename LIKE 'lock_wait_%' ORDER BY 1")).rows).toEqual([{ tablename: 'lock_wait_committed' }]);
        expect(await probeRecorded(client)).toBe(0);
      } finally {
        await client.end();
      }
    });
  });

  it('is never tried again when a wait is cancelled after its own commit: the half-applied file runs once', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      // Outside the runner's transaction its timeout is gone; the migration's own stands in for a login's default.
      writeFileSync(path.join(dir, PROBE), `CREATE TABLE lock_wait_committed (id integer PRIMARY KEY);\nCOMMIT;\nSET lock_timeout = '250ms';\n${PROBE_SQL}`);
      const holder = await holdTable(url);
      const paused: number[] = [];
      try {
        const error: unknown = await migrate({ databaseUrl: url, migrationsDir: dir, lockWait: lockWait({ paused }) }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(MigrationError);
        expect((error as MigrationError).message).toContain(`${PROBE} failed after committing part of itself`);
        expect(paused).toEqual([]);
        expect((await holder.query("SELECT 1 FROM pg_tables WHERE tablename = 'lock_wait_committed'")).rows.length).toBe(1);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });
});

describe('a dry run beside another migrator', () => {
  it('waits its turn for the migrators’ lock past the timeout, which bounds only what comes after', async () => {
    await withScratchDatabase(adminUrl, async (url) => {
      await migrate({ databaseUrl: url });
      writeFileSync(path.join(dir, PROBE), PROBE_SQL);
      const other = await connect(url);
      try {
        await other.query('SELECT pg_advisory_lock($1)', [0x4d494752]);
        const run = migrate({ databaseUrl: url, migrationsDir: dir, dryRun: true, lockWait: lockWait({}) });
        // Three of the dry run's timeouts pass while the other migrator holds the lock.
        await new Promise((resolve) => setTimeout(resolve, 750));
        await other.query('SELECT pg_advisory_unlock($1)', [0x4d494752]);
        expect((await run).applied).toEqual([PROBE]);
      } finally {
        await other.end();
      }
    });
  });
});

describe('a lock wait that is no wait', () => {
  it.each([
    ['a timeout of zero, which PostgreSQL reads as no limit', { timeoutMs: 0 }],
    ['a timeout that is not a whole number', { timeoutMs: 1.5 }],
    ['a timeout past PostgreSQL’s integer', { timeoutMs: 2_147_483_648 }],
    ['no tries', { attempts: 0 }],
    ['tries that are not a whole number', { attempts: 2.5 }],
    ['a budget below zero', { budgetMs: -1 }],
    ['a budget that is no number', { budgetMs: Number.NaN }],
  ])('refuses %s before it connects', async (_name, overrides) => {
    // A URL nothing listens on: reaching it would fail with a connection error, not a MigrationError.
    await expect(migrate({ databaseUrl: 'postgres://nobody@127.0.0.1:1/none', migrationsDir: dir, lockWait: lockWait(overrides) })).rejects.toThrow(MigrationError);
  });
});
