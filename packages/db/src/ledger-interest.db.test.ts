import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';
import { MIGRATIONS_DIR } from './migrate';
import { OWNER_ROLE } from './roles';
import { type MigratedDatabase, type TenantWorld, createMigratedDatabase, createTenantWorld } from './testing';

/**
 * The interest fix's deploy window (migration 20261110090000; docs/adr/0084; review INT-REL-3): the migration takes
 * ledger_entry's and ledger_match's ACCESS EXCLUSIVE locks together, with NOWAIT, once a second, so it never waits in a
 * lock queue. A plain ALTER of ledger_match, then of ledger_entry, waited for ledger_entry behind a reconcile that had
 * read it and not yet ledger_match, and the reconcile's next read then deadlocked against it (40P01); it also queued
 * every later reader of either table behind it. Coordination between connections waits on pg_stat_activity, never on a
 * sleep. Synthetic data only.
 */

const MIGRATION = '20261110090000_ledger_interest_once.sql';

let database: MigratedDatabase;
let owner: pg.Client;
let world: TenantWorld;
const clients: pg.Client[] = [];

/** What a statement came to, settled at once so a refusal never surfaces as an unhandled rejection. */
function settle(attempt: Promise<unknown>): Promise<'accepted' | { readonly code: string; readonly message: string }> {
  return attempt.then(
    () => 'accepted' as const,
    (error: unknown) => {
      const { code, message } = error as { code?: string; message?: string };
      return { code: code ?? 'error', message: message ?? '' };
    },
  );
}

/** Each connection's backend, read when it opens: a query on a connection waits behind its blocked statement. */
const pids = new WeakMap<pg.Client, number>();

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  client.on('error', () => undefined);
  await client.connect();
  clients.push(client);
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  pids.set(client, rows[0]?.pid ?? 0);
  return client;
}

/** A job's transaction in the world's practice, on the worker's login, as the reconcile step opens one. */
async function job(): Promise<pg.Client> {
  const client = await connect(database.workerUrl);
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [randomUUID(), `{${world.practiceId}}`]);
  return client;
}

async function close(client: pg.Client): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  await client.end().catch(() => undefined);
}

/** Resolves once backend `pid` waits on what `waits` names. */
async function waitFor(pid: number, waits: { readonly type: string; readonly event?: string }): Promise<void> {
  for (let tries = 0; tries < 1500; tries += 1) {
    const { rows } = await owner.query<{ type: string | null; event: string | null }>('SELECT wait_event_type AS type, wait_event AS event FROM pg_stat_activity WHERE pid = $1', [pid]);
    if (rows[0]?.type === waits.type && (waits.event === undefined || rows[0].event === waits.event)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`backend ${String(pid)} never waited on ${waits.type}`);
}

/** The migration's lock loop, as it stands in the file: the DO block that takes ledger_entry's and ledger_match's locks. */
function lockLoop(): string {
  const text = readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const block = text
    .split(/^DO \$\$$/m)
    .slice(1)
    .map((rest) => `DO $$${rest.slice(0, rest.indexOf('\n$$;') + 4)}`)
    .find((candidate) => candidate.includes('NOWAIT'));
  if (block === undefined) {
    throw new Error(`${MIGRATION} has no NOWAIT lock loop`);
  }
  return block;
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  world = await createTenantWorld(owner, 'interest deploy window');
}, 120_000);

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  await owner.end();
  await database.drop();
});

describe('the interest fix in the deploy window (migration 20261110090000; review INT-REL-3)', () => {
  it('takes both ledger tables’ locks without a queue or a deadlock: retries while a reconcile reads ledger_entry then ledger_match, and takes them once it commits', async () => {
    const loop = lockLoop();
    expect(loop).toContain("'ledger_entry or ledger_match stayed in use for five minutes; run the deploy again (docs/adr/0084)'");
    const reconcile = await job();
    const migration = await connect(database.url);
    try {
      // The reconcile's pass reads ledger_entry first (its lines' ledgers), and ledger_match only later.
      await reconcile.query('SELECT count(*) FROM ledger_entry');
      // The migration's transaction, as tp_owner, running the loop: it sleeps between tries, never in a lock queue.
      await migration.query('BEGIN');
      await migration.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
      const migrationPid = pids.get(migration) ?? 0;
      const done = settle(migration.query(loop));
      await waitFor(migrationPid, { type: 'Timeout', event: 'PgSleep' });
      // The reconcile reads on, unqueued: no deadlock (40P01) and no wait.
      expect(await settle(reconcile.query('SELECT count(*) FROM ledger_match'))).toBe('accepted');
      // A page reads the other way round, matches first, beside it.
      const page = await job();
      expect(await settle(page.query('SELECT count(*) FROM ledger_match').then(() => page.query('SELECT count(*) FROM ledger_entry')).then(() => page.query('COMMIT')))).toBe('accepted');
      await waitFor(migrationPid, { type: 'Timeout', event: 'PgSleep' });
      const queued = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [migrationPid]);
      expect(queued.rows[0]?.n).toBe(0);
      expect(await settle(reconcile.query('COMMIT'))).toBe('accepted');
      expect(await done).toBe('accepted');
      const locks = await owner.query<{ relation: string; mode: string }>(
        "SELECT relation::regclass::text AS relation, mode FROM pg_locks WHERE pid = $1 AND locktype = 'relation' AND relation IN ('ledger_entry'::regclass, 'ledger_match'::regclass) AND granted ORDER BY 1",
        [migrationPid],
      );
      expect(locks.rows).toEqual([
        { relation: 'ledger_entry', mode: 'AccessExclusiveLock' },
        { relation: 'ledger_match', mode: 'AccessExclusiveLock' },
      ]);
    } finally {
      await close(reconcile);
      await close(migration);
    }
  }, 120_000);
});
