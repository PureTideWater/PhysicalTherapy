import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll } from 'vitest';

import type { NotificationConfig } from '../../config';
import { SCREENING_BOSS_OPTIONS } from '../../jobs/screening';
import { startWorker } from '../../worker';
import { startScreeningConsumer } from '../consumer';

/**
 * Test support for the screening consumer's database tests (consumer.db.test.ts; SCR-19's in consumer-lease.db.test.ts):
 * a migrated database with SYNTHETIC release 900001 loaded and the split a contract specialist approved, the runs a
 * prospect submits, and the consumer as the screening service starts it. The consumer's notification settings are
 * written once, here (localMail), for every consumer these tests start. Synthetic data only.
 */

const RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/rules/release-synth-900001');
const SPLIT = { '11': 'non_facility', '22': 'facility' } as const;
export const ORIGIN = 'https://app.synthetic.test';

export type Row = readonly [code: string, modifiers: string, units: number, place: string, product: string, band: string, allowedCents: bigint, claims: number];

export const SMALL: readonly Row[] = [
  ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 11],
  ['97140', 'GP', 1, '22', 'ma_noncontracted', '2026-Q3', 900_000n, 300],
];

/** As many distinct Medicare rows as asked (each row's key once), for a run that takes a while to price. */
export function manyRows(count: number): Row[] {
  const rows: Row[] = [];
  const codes = ['97110', '97112', '97116', '97140', '97530', '97161'];
  for (let index = 0; rows.length < count; index += 1) {
    const code = codes[index % codes.length] ?? '97110';
    const rest = Math.floor(index / codes.length);
    const units = 1 + (rest % 999);
    const variant = Math.floor(rest / 999);
    // Sixteen variants of band, place and product for each code and unit count: 95,904 distinct rows at most.
    const place = Math.floor(variant / 4) % 2 === 0 ? '11' : '22';
    const product = Math.floor(variant / 8) % 2 === 0 ? 'medicare_ffs' : 'ma_noncontracted';
    rows.push([code, 'GP', units, place, product, `2026-Q${String(1 + (variant % 4))}`, 4_000n * BigInt(units), 11]);
  }
  return rows;
}

export async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number, pollMs = 25): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** The consumer's notifications in these tests: email to a local outbox directory, links to the synthetic origin. */
export function localMail(dir: string): NotificationConfig {
  return { mail: { kind: 'local', dir }, appOrigin: ORIGIN, staticAssetOrigin: null };
}

const letters = () =>
  randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));

/**
 * A stand-in pricing thread for the consumer's own pool (threads.ts): it prices nothing, holds each run timedRun() made
 * for the milliseconds its ID ends with, and any other run (the Q7 test's leftover waiting-tier job, whose random UUID
 * can end in twelve digits or read as a number such as 1e10) not at all, and writes when it took and ended each run, on
 * which thread, to `<mail dir>/runs.log`.
 */
const TIMED_THREAD = `
import { appendFileSync } from 'node:fs';
import { parentPort, threadId, workerData } from 'node:worker_threads';
const log = workerData.notifications.mail.dir + '/runs.log';
parentPort.on('message', async (request) => {
  appendFileSync(log, 'start ' + request.runId + ' ' + String(threadId) + ' ' + String(Date.now()) + '\\n');
  const timed = /-0000-4000-8000-([0-9]{12})$/.exec(request.runId);
  await new Promise((resolve) => setTimeout(resolve, timed === null ? 0 : Number(timed[1])));
  appendFileSync(log, 'end ' + request.runId + ' ' + String(threadId) + ' ' + String(Date.now()) + '\\n');
  parentPort.postMessage({ kind: 'priced', outcome: 'complete' });
});
parentPort.postMessage({ kind: 'ready' });
`;

/** A run's ID that the stand-in thread holds for `ms` milliseconds. */
export function timedRun(ms: number): string {
  return `${randomUUID().slice(0, 8)}-0000-4000-8000-${String(ms).padStart(12, '0')}`;
}

/** The stand-in threads' log: when each run started and ended, and on which thread. */
export function timedRuns(dir: string): Map<string, { thread: string; start: number; end: number | null }> {
  const runs = new Map<string, { thread: string; start: number; end: number | null }>();
  let text: string;
  try {
    text = readFileSync(path.join(dir, 'runs.log'), 'utf8');
  } catch {
    return runs;
  }
  for (const line of text.split('\n').filter((entry) => entry !== '')) {
    const [what, runId = '', thread = '', at = '0'] = line.split(' ');
    if (what === 'start') {
      runs.set(runId, { thread, start: Number(at), end: null });
    } else {
      const run = runs.get(runId);
      if (run !== undefined) {
        run.end = Number(at);
      }
    }
  }
  return runs;
}

interface Opened {
  readonly database: MigratedDatabase;
  readonly owner: DatabaseClient;
  readonly admin: DatabasePool;
  readonly outbox: string;
}

/** One test file's screening database and outbox (screeningDatabaseForThisFile() opens it before the file's tests and drops it after). */
export class ScreeningDatabase {
  private state: Opened | undefined;

  private get opened(): Opened {
    if (this.state === undefined) {
      throw new Error('the screening database is used before its beforeAll opened it');
    }
    return this.state;
  }

  get database(): MigratedDatabase {
    return this.opened.database;
  }

  /** Where the consumers these tests start email (localMail): this file's own directory, removed by close(). */
  get outbox(): string {
    return this.opened.outbox;
  }

  /** The database's owner connection, for reading what the consumer wrote. */
  get owner(): DatabaseClient {
    return this.opened.owner;
  }

  async open(): Promise<void> {
    const database = await createMigratedDatabase(readDatabaseUrl());
    const owner = databaseClient(database.url);
    let admin: DatabasePool | undefined;
    let outbox: string | undefined;
    try {
      await owner.connect();
      await loadRelease(owner, RELEASE_DIR, { release: 900001, allowSyntheticFixtureForTests: true });
      admin = openPool(database.url, 4);
      outbox = mkdtempSync(path.join(tmpdir(), 'screening-consumer-outbox-'));
      this.state = { database, owner, admin, outbox };
      const internal = await createOrganization(owner, 'internal');
      const specialist = await createUser(owner, { hardwareKeyRequired: true });
      await addMembership(owner, internal, specialist, 'contract_specialist');
      await this.asApp('SELECT console_approve_place_of_service_split($1)', [JSON.stringify(SPLIT)], specialist);
    } catch (error) {
      this.state = undefined;
      if (admin !== undefined) {
        await endPool(admin);
      }
      await owner.end().catch(() => undefined);
      await database.drop();
      if (outbox !== undefined) {
        rmSync(outbox, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    const opened = this.state;
    this.state = undefined;
    if (opened !== undefined) {
      await endPool(opened.admin);
      await opened.owner.end();
      await opened.database.drop();
      rmSync(opened.outbox, { recursive: true, force: true });
    }
  }

  /** A statement as the web app's role (tp_app), with the actor set. */
  async asApp<T extends Record<string, unknown>>(sql: string, values: unknown[] = [], actorId: string | null = null): Promise<T[]> {
    const client = await this.opened.admin.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE tp_app');
      await client.query("SELECT set_config('app.actor_id', $1, true)", [actorId ?? '']);
      const { rows } = await client.query<T>(sql, values);
      await client.query('COMMIT');
      return rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** A prospect's screening of `rows`, submitted as the web submits it: the new run's ID. */
  async submit(rows: readonly Row[]): Promise<string> {
    const [created] = await this.asApp<{ id: string }>(
      `SELECT submit_screening(${Array.from({ length: 30 }, (_, index) => `$${String(index + 1)}`).join(', ')}) AS id`,
      [
        `Synthetic Consumer Therapy ${letters()}`,
        'MN',
        '00011',
        null,
        `prospect.${letters()}@consumer.synthetic.test`,
        rows.map((row) => row[0]),
        rows.map((row) => row[1]),
        rows.map((row) => row[2]),
        rows.map((row) => row[3]),
        rows.map((row) => row[4]),
        rows.map((row) => row[5]),
        rows.map((row) => row[6].toString()),
        rows.map((row) => row[7]),
        0,
        0,
        '0',
        0,
        '0',
        '0',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        createHash('sha256').update(`account:${randomUUID()}`).digest('hex'),
        `test-${randomUUID()}`,
      ],
    );
    return created?.id ?? '';
  }

  async runOf(runId: string): Promise<{ status: string; attempts: number; recorded: number; pending: number }> {
    const { rows } = await this.opened.owner.query<{ status: string; attempts: number; recorded: number; pending: number }>(
      `SELECT r.status, r.attempts,
              (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.disposition NOT IN ('pending', 'contract_required', 'not_screened')) AS recorded,
              (SELECT count(*)::int FROM screening_result s WHERE s.run_id = r.id AND s.disposition = 'pending') AS pending
         FROM screening_run r WHERE r.id = $1`,
      [runId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error('no such run');
    }
    return row;
  }

  /** The emails in the outbox addressed to `to`. */
  emailsTo(to: string): { to: string[]; subject: string }[] {
    const { outbox } = this.opened;
    return readdirSync(outbox)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(readFileSync(path.join(outbox, name), 'utf8')) as { to: string[]; subject: string })
      .filter((message) => message.to.includes(to));
  }

  async contactOf(runId: string): Promise<string> {
    const { rows } = await this.opened.owner.query<{ contact_email: string }>(
      'SELECT p.contact_email FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = $1',
      [runId],
    );
    return rows[0]?.contact_email ?? '';
  }

  /** pg-boss as the consumer's process starts it (main.ts): listening, so a send wakes its workers. */
  consumerBoss(): PgBoss {
    const boss = new PgBoss({ connectionString: this.database.url, ...SCREENING_BOSS_OPTIONS });
    boss.on('error', () => undefined);
    return boss;
  }

  /** The consumer as the screening service starts it (its own pool of three threads, pg-boss's work), with stand-in threads. */
  async timedConsumer(): Promise<{ readonly dir: string; readonly boss: PgBoss; readonly worker: Awaited<ReturnType<typeof startWorker>> }> {
    const dir = mkdtempSync(path.join(tmpdir(), 'screening-timed-'));
    writeFileSync(path.join(dir, 'thread.mjs'), TIMED_THREAD);
    const boss = this.consumerBoss();
    const logger = createLogger({ sink: () => undefined });
    const consumer = await startScreeningConsumer({ databaseUrl: this.database.screeningUrl, concurrency: 3, notifications: localMail(dir) }, boss, logger, {
      workerId: randomUUID(),
      thread: { script: pathToFileURL(path.join(dir, 'thread.mjs')), execArgv: [] },
    });
    const worker = await startWorker({ boss, logger, screening: consumer, heartbeatMs: 60_000, shutdownTimeoutMs: 30_000 });
    // Settled into its idle polling, as S5's fresh consumer was by the time the pages had loaded.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    return { dir, boss, worker };
  }
}

/** The file's screening database: migrated, loaded and its split approved before its tests, dropped after. */
export function screeningDatabaseForThisFile(): ScreeningDatabase {
  const screening = new ScreeningDatabase();
  beforeAll(() => screening.open(), 60_000);
  afterAll(() => screening.close());
  return screening;
}
