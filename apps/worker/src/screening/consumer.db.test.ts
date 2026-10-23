import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { enqueueScreeningRun } from '../jobs/enqueue';
import { QUEUE_OPTIONS } from '../jobs/registry';
import { SCREENING_BOSS_OPTIONS, type ScreeningJobs, createScreeningHandlers } from '../jobs/screening';
import { startWorker } from '../worker';
import { startScreeningConsumer } from './consumer';

/**
 * The screening consumer against PostgreSQL (docs/adr/0062; PR 6b-3), with SYNTHETIC release 900001 loaded and a split
 * a contract specialist approved:
 *
 * - the job heartbeat and notify reach a queue that already existed without them (PR 6's screening_price), through
 *   updateQueue, and every job the web sends carries the heartbeat; the platform's old minute schedule is gone and the
 *   sweep's is there;
 * - SCR-08: a free thread takes the next normal run at once, whether it was sent while the threads were idle (the send's
 *   NOTIFY) or queued behind busy ones (a run's end wakes the workers), never a poll later (CI's S5 on 7abb99c);
 * - the consumer prices a run in one of its threads as tp_screening, through its own login, and emails the link;
 * - at most one copy of a release's shared types per thread;
 * - SCR-19: a consumer killed mid-run (after a recorded batch) leaves the run to another, which claims it again at
 *   attempt 2 and emails it within 4 minutes of the kill, the batches recorded before the kill kept.
 */

const RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/rules/release-synth-900001');
const MAIN = path.resolve(import.meta.dirname, '../main.ts');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const SPLIT = { '11': 'non_facility', '22': 'facility' } as const;
const ORIGIN = 'https://app.synthetic.test';
/** "At once": well under pg-boss's 2-s poll, which a job sent to sleeping workers waited out before (CI's S5 on 7abb99c). */
const AT_ONCE_MS = 750;

/** pg-boss as the consumer's process starts it (main.ts): listening, so a send wakes its workers. */
function consumerBoss(): PgBoss {
  const boss = new PgBoss({ connectionString: database.url, ...SCREENING_BOSS_OPTIONS });
  boss.on('error', () => undefined);
  return boss;
}

type Row = readonly [code: string, modifiers: string, units: number, place: string, product: string, band: string, allowedCents: bigint, claims: number];

let database: MigratedDatabase;
let owner: DatabaseClient;
let admin: DatabasePool;
let outbox = '';

async function asApp<T extends Record<string, unknown>>(sql: string, values: unknown[] = [], actorId: string | null = null): Promise<T[]> {
  const client = await admin.connect();
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

const letters = () =>
  randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));

async function submit(rows: readonly Row[]): Promise<string> {
  const [created] = await asApp<{ id: string }>(
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

const SMALL: readonly Row[] = [
  ['97110', 'GP', 2, '11', 'medicare_ffs', '2026-Q1', 10_000n, 11],
  ['97140', 'GP', 1, '22', 'ma_noncontracted', '2026-Q3', 900_000n, 300],
];

/** As many distinct Medicare rows as asked (each row's key once), for a run that takes a while to price. */
function manyRows(count: number): Row[] {
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

async function runOf(runId: string): Promise<{ status: string; attempts: number; recorded: number; pending: number }> {
  const { rows } = await owner.query<{ status: string; attempts: number; recorded: number; pending: number }>(
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

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number, pollMs = 25): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** The emails in the outbox addressed to `to`. */
function emailsTo(to: string): { to: string[]; subject: string }[] {
  return readdirSync(outbox)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(outbox, name), 'utf8')) as { to: string[]; subject: string })
    .filter((message) => message.to.includes(to));
}

async function contactOf(runId: string): Promise<string> {
  const { rows } = await owner.query<{ contact_email: string }>(
    'SELECT p.contact_email FROM screening_run r JOIN screening_upload u ON u.id = r.upload_id JOIN screening_prospect p ON p.id = u.prospect_id WHERE r.id = $1',
    [runId],
  );
  return rows[0]?.contact_email ?? '';
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRelease(owner, RELEASE_DIR, { release: 900001, allowSyntheticFixtureForTests: true });
  admin = openPool(database.url, 4);
  const internal = await createOrganization(owner, 'internal');
  const specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  await asApp('SELECT console_approve_place_of_service_split($1)', [JSON.stringify(SPLIT)], specialist);
  outbox = mkdtempSync(path.join(tmpdir(), 'screening-consumer-outbox-'));
}, 60_000);

afterAll(async () => {
  await endPool(admin);
  await owner.end();
  await database.drop();
  rmSync(outbox, { recursive: true, force: true });
});

describe('the screening consumer in one process', () => {
  it('sets the heartbeat on a queue that existed without one, prices in its threads as tp_screening, and keeps one copy of a release per thread', { timeout: 120_000 }, async () => {
    // PR 6's queue, as every worker of the previous image created it, and the platform's minute schedule of it.
    const previous = new PgBoss(database.url);
    previous.on('error', () => undefined);
    await previous.start();
    await previous.createQueue('screening_price', QUEUE_OPTIONS);
    await previous.schedule('screening_price', '* * * * *', {}, { tz: 'UTC', singletonKey: 'screening_price' });
    await previous.stop({ graceful: false });
    expect((await owner.query("SELECT heartbeat_seconds, notify FROM pgboss.queue WHERE name = 'screening_price'")).rows).toEqual([{ heartbeat_seconds: null, notify: false }]);

    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) });
    // The threads log to the process's standard output; the lines are read from it here.
    const threadLines: Record<string, unknown>[] = [];
    const write = process.stdout.write.bind(process.stdout);
    let partial = '';
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      partial += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      const complete = partial.split('\n');
      partial = complete.pop() ?? '';
      for (const line of complete) {
        try {
          const parsed: unknown = JSON.parse(line);
          if (typeof parsed === 'object' && parsed !== null && 'msg' in parsed) {
            threadLines.push(parsed);
          }
        } catch {
          // Not a log line.
        }
      }
      return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
    });
    const boss = consumerBoss();
    const consumer = await startScreeningConsumer(
      { databaseUrl: database.screeningUrl, concurrency: 2, notifications: { mail: { kind: 'local', dir: outbox, eventsDir: null, streamPrefix: 'tp-dev' }, appOrigin: ORIGIN, staticAssetOrigin: null } },
      boss,
      logger,
      { workerId: randomUUID() },
    );
    const worker = await startWorker({ boss, logger, screening: consumer, heartbeatMs: 60_000, shutdownTimeoutMs: 30_000 });
    try {
      // The heartbeat and the send's NOTIFY, on PR 6's queue too.
      const queues = await owner.query<{ name: string; heartbeat_seconds: number; notify: boolean }>(
        "SELECT name, heartbeat_seconds, notify FROM pgboss.queue WHERE name IN ('screening_price', 'screening_price_waiting', 'screening_sweep') ORDER BY name",
      );
      expect(queues.rows).toEqual([
        { name: 'screening_price', heartbeat_seconds: 60, notify: true },
        { name: 'screening_price_waiting', heartbeat_seconds: 60, notify: true },
        { name: 'screening_sweep', heartbeat_seconds: 60, notify: true },
      ]);
      expect((await owner.query("SELECT name FROM pgboss.schedule WHERE name IN ('screening_price', 'screening_sweep') ORDER BY name")).rows).toEqual([{ name: 'screening_sweep' }]);

      // Four runs, sent as the web sends them, priced two at a time.
      const runs = [await submit(SMALL), await submit(SMALL), await submit(SMALL), await submit(SMALL)];
      for (const runId of runs) {
        expect(await enqueueScreeningRun(boss, runId, { priority: 0 })).not.toBeNull();
      }
      const jobs = await owner.query<{ heartbeat_seconds: number; priority: number }>("SELECT heartbeat_seconds, priority FROM pgboss.job WHERE name = 'screening_price' AND singleton_key = ANY ($1)", [
        runs.map((runId) => `screening_price:${runId}`),
      ]);
      expect(jobs.rows).toEqual(runs.map(() => ({ heartbeat_seconds: 60, priority: 0 })));
      for (const runId of runs) {
        expect((await until(() => runOf(runId), (run) => run.status === 'complete', 60_000, 100)).status).toBe('complete');
        expect(emailsTo(await contactOf(runId)).map((message) => message.subject)).toEqual([expect.stringContaining('Your screening is ready') as string]);
      }
      // Each run's lines: priced by a thread, its time to email logged; the shared types read at most once a thread.
      await until(() => Promise.resolve(threadLines.filter((line) => line.msg === 'screening result emailed').length), (count) => count >= runs.length, 5_000);
      expect(threadLines.filter((line) => line.msg === 'screening result emailed').map((line) => line.screening_run_id).sort()).toEqual([...runs].sort());
      const reads = threadLines.filter((line) => line.msg === 'screening release shared types read' && runs.includes(String(line.screening_run_id))).length;
      const held = threadLines.filter((line) => line.msg === 'screening release shared types held from an earlier run' && runs.includes(String(line.screening_run_id))).length;
      expect(reads).toBeGreaterThanOrEqual(1);
      expect(reads).toBeLessThanOrEqual(2);
      expect(reads + held).toBe(runs.length);
      // Every line names IDs and numbers only.
      expect(JSON.stringify(threadLines)).not.toContain('@consumer.synthetic.test');
    } finally {
      process.stdout.write = write;
      await worker.stop();
    }
    expect(lines.at(-1)).toMatchObject({ msg: 'worker stopped' });
  });
});

describe('Q7: the waiting tier keeps a thread for the normal tier', () => {
  it('works at most two waiting-tier runs of three threads at once, and starts a normal run that arrives meanwhile at once', { timeout: 90_000 }, async () => {
    const boss = consumerBoss();
    const started = new Map<string, number>();
    const ended = new Map<string, number>();
    // Stand-in pricing: each run takes 8 s, a worst-shape file's share of a thread, so nothing ends during the test.
    const consumer: ScreeningJobs = {
      concurrency: 3,
      handlers: createScreeningHandlers({
        price: async (runId) => {
          started.set(runId, Date.now());
          await new Promise((resolve) => setTimeout(resolve, 8_000));
          ended.set(runId, Date.now());
        },
        sweep: () => Promise.resolve(),
      }),
      close: () => Promise.resolve(),
    };
    const worker = await startWorker({ boss, logger: createLogger({ sink: () => undefined }), screening: consumer, heartbeatMs: 60_000, shutdownTimeoutMs: 30_000 });
    try {
      // Three uploads past their accounts' shares, sent with nothing normal queued (the review's probe).
      const waiting = [randomUUID(), randomUUID(), randomUUID()];
      for (const [index, runId] of waiting.entries()) {
        expect(await enqueueScreeningRun(boss, runId, { priority: -(index + 1) })).not.toBeNull();
      }
      await until(() => Promise.resolve(started.size), (count) => count >= 2, 15_000, 50);
      // A poll later the third still waits: the third thread is the normal tier's.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      expect(started.size).toBe(2);
      // A normal upload then starts at once on the kept thread, not after a waiting-tier run's 8 s nor a poll.
      const normal = randomUUID();
      const sentAt = Date.now();
      expect(await enqueueScreeningRun(boss, normal, { priority: 0 })).not.toBeNull();
      await until(() => Promise.resolve(started.has(normal)), (has) => has, 15_000, 20);
      expect((started.get(normal) ?? Number.POSITIVE_INFINITY) - sentAt).toBeLessThan(AT_ONCE_MS);
      expect(ended.size).toBe(0);
      // The waiting-tier jobs went to their own queue, at their priorities; the normal one to the normal queue.
      const jobs = await owner.query<{ name: string; priority: number }>('SELECT name, priority FROM pgboss.job WHERE singleton_key = ANY ($1) ORDER BY priority DESC', [
        [...waiting, normal].map((runId) => `screening_price:${runId}`),
      ]);
      expect(jobs.rows).toEqual([
        { name: 'screening_price', priority: 0 },
        { name: 'screening_price_waiting', priority: -1 },
        { name: 'screening_price_waiting', priority: -2 },
        { name: 'screening_price_waiting', priority: -3 },
      ]);
    } finally {
      await worker.stop();
    }
  });
});

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
function timedRun(ms: number): string {
  return `${randomUUID().slice(0, 8)}-0000-4000-8000-${String(ms).padStart(12, '0')}`;
}

/** The stand-in threads' log: when each run started and ended, and on which thread. */
function timedRuns(dir: string): Map<string, { thread: string; start: number; end: number | null }> {
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

/** The consumer as the screening service starts it (its own pool of three threads, pg-boss's work), with stand-in threads. */
async function timedConsumer(): Promise<{ readonly dir: string; readonly boss: PgBoss; readonly worker: Awaited<ReturnType<typeof startWorker>> }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'screening-timed-'));
  writeFileSync(path.join(dir, 'thread.mjs'), TIMED_THREAD);
  const boss = consumerBoss();
  const logger = createLogger({ sink: () => undefined });
  const consumer = await startScreeningConsumer(
    { databaseUrl: database.screeningUrl, concurrency: 3, notifications: { mail: { kind: 'local', dir, eventsDir: null, streamPrefix: 'tp-dev' }, appOrigin: ORIGIN, staticAssetOrigin: null } },
    boss,
    logger,
    { workerId: randomUUID(), thread: { script: pathToFileURL(path.join(dir, 'thread.mjs')), execArgv: [] } },
  );
  const worker = await startWorker({ boss, logger, screening: consumer, heartbeatMs: 60_000, shutdownTimeoutMs: 30_000 });
  // Settled into its idle polling, as S5's fresh consumer was by the time the pages had loaded.
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  return { dir, boss, worker };
}

describe('SCR-08: a free thread takes the next normal run at once (CI’s S5 on 7abb99c: two of three practice uploads queued as the first was emailed waited for a poll)', () => {
  it('starts three normal runs queued within a second on three threads at once', { timeout: 60_000 }, async () => {
    const { dir, boss, worker } = await timedConsumer();
    try {
      // Three practice-shaped uploads, as a web slowed by three at once queues them: 400 ms apart.
      const sent = new Map<string, number>();
      for (const runId of [timedRun(6_000), timedRun(6_000), timedRun(6_000)]) {
        expect(await enqueueScreeningRun(boss, runId, { priority: 0 })).not.toBeNull();
        sent.set(runId, Date.now());
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      // (Its own runs only: the Q7 test leaves its third waiting-tier job queued, which this consumer works too.)
      const runs = await until(() => Promise.resolve(timedRuns(dir)), (seen) => [...sent.keys()].every((runId) => seen.has(runId)), 15_000, 20);
      const own = [...sent.keys()].map((runId) => runs.get(runId));
      const waits = [...sent].map(([runId, at]) => (runs.get(runId)?.start ?? Number.POSITIVE_INFINITY) - at);
      expect(waits.every((wait) => wait < AT_ONCE_MS), `each run's wait from its send to its thread: ${waits.join(', ')} ms`).toBe(true);
      // On three threads, all three priced together: none ended before the last began.
      expect(new Set(own.map((run) => run?.thread)).size).toBe(3);
      expect(own.every((run) => run !== undefined && run.end === null)).toBe(true);
      // And as the capacity report reads it, from pg-boss's own times.
      const jobs = await owner.query<{ waited_ms: number }>("SELECT (extract(epoch FROM started_on - created_on) * 1000)::int AS waited_ms FROM pgboss.job WHERE name = 'screening_price' AND singleton_key = ANY ($1)", [
        [...sent.keys()].map((runId) => `screening_price:${runId}`),
      ]);
      expect(jobs.rows).toHaveLength(3);
      expect(jobs.rows.every((row) => row.waited_ms < AT_ONCE_MS), `pg-boss's waits: ${jobs.rows.map((row) => String(row.waited_ms)).join(', ')} ms`).toBe(true);
    } finally {
      await worker.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('starts a normal run queued behind busy threads as soon as a thread frees, even after a run shorter than the poll', { timeout: 60_000 }, async () => {
    const { dir, boss, worker } = await timedConsumer();
    try {
      // Every thread busy: one for 1.5 s, two for 10 s.
      const first = timedRun(1_500);
      const busy = [first, timedRun(10_000), timedRun(10_000)];
      for (const runId of busy) {
        expect(await enqueueScreeningRun(boss, runId, { priority: 0 })).not.toBeNull();
      }
      await until(() => Promise.resolve(timedRuns(dir)), (seen) => busy.every((runId) => seen.has(runId)), 15_000, 20);
      // Two small uploads queued meanwhile: the first takes the freed thread and ends inside pg-boss's poll.
      const small = timedRun(300);
      const next = timedRun(300);
      expect(await enqueueScreeningRun(boss, small, { priority: 0 })).not.toBeNull();
      expect(await enqueueScreeningRun(boss, next, { priority: 0 })).not.toBeNull();
      const runs = await until(() => Promise.resolve(timedRuns(dir)), (seen) => typeof seen.get(next)?.end === 'number', 20_000, 20);
      const freed = runs.get(first)?.end ?? Number.POSITIVE_INFINITY;
      const smallRun = runs.get(small);
      const nextRun = runs.get(next);
      expect((smallRun?.start ?? Number.POSITIVE_INFINITY) - freed, 'the first small run, from the first thread freed').toBeLessThan(AT_ONCE_MS);
      expect((nextRun?.start ?? Number.POSITIVE_INFINITY) - (smallRun?.end ?? Number.POSITIVE_INFINITY), 'the next, from the small run’s thread freed').toBeLessThan(AT_ONCE_MS);
      expect(nextRun?.thread).toBe(smallRun?.thread);
    } finally {
      await worker.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** A consumer process, as the screening service runs it: WORKER_JOBS=screening, its two logins, its output collected. */
function consumerProcess(): { readonly child: ChildProcess; readonly lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const child = spawn(process.execPath, ['--import', TSX, MAIN], {
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'test',
      WORKER_JOBS: 'screening',
      SCREENING_DATABASE_URL: database.screeningUrl,
      QUEUE_DATABASE_URL: database.url,
      MAIL_OUTBOX_DIR: outbox,
      APP_ORIGIN: ORIGIN,
      SCREENING_CONCURRENCY: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let pending = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const complete = pending.split('\n');
    pending = complete.pop() ?? '';
    for (const line of complete) {
      try {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Not a log line.
      }
    }
  });
  child.stderr?.resume();
  return { child, lines };
}

describe('SCR-19: a run whose consumer died is priced again within minutes, nothing lost', () => {
  it('claims a killed consumer’s run again at attempt 2, keeps the batches it recorded, and emails it within 4 minutes of the kill', { timeout: 420_000 }, async () => {
    const first = consumerProcess();
    let second: ReturnType<typeof consumerProcess> | undefined;
    try {
      await until(() => Promise.resolve(first.lines.some((line) => line.msg === 'worker started')), (started) => started, 60_000, 100);
      expect(first.lines.some((line) => line.msg === 'worker started')).toBe(true);
      const runId = await submit(manyRows(50_000));
      const boss = new PgBoss(database.url);
      boss.on('error', () => undefined);
      await boss.start();
      try {
        expect(await enqueueScreeningRun(boss, runId)).not.toBeNull();
      } finally {
        await boss.stop({ graceful: false });
      }
      // Killed once its first batch is recorded and before the run completes.
      const midway = await until(() => runOf(runId), (run) => run.recorded > 0, 120_000, 20);
      first.child.kill('SIGKILL');
      const killedAt = Date.now();
      expect(midway.recorded).toBeGreaterThan(0);
      const kept = (await owner.query<{ row_no: number; trace_sha256: string }>("SELECT row_no, trace_sha256 FROM screening_result WHERE run_id = $1 AND disposition <> 'pending' AND trace_sha256 IS NOT NULL ORDER BY row_no", [runId])).rows;
      const atKill = await runOf(runId);
      expect(atKill).toMatchObject({ status: 'pricing', attempts: 1 });
      expect(atKill.pending).toBeGreaterThan(0);

      // The task ECS starts in its place.
      second = consumerProcess();
      const done = await until(() => runOf(runId), (run) => run.status === 'complete', 300_000, 1_000);
      const recoveredIn = Date.now() - killedAt;
      expect(done).toMatchObject({ status: 'complete', attempts: 2, pending: 0 });
      expect(recoveredIn).toBeLessThan(240_000);
      expect(emailsTo(await contactOf(runId)).map((message) => message.subject)).toEqual([expect.stringContaining('Your screening is ready') as string]);
      // What the killed attempt recorded is kept as it recorded it.
      const after = (await owner.query<{ row_no: number; trace_sha256: string }>('SELECT row_no, trace_sha256 FROM screening_result WHERE run_id = $1 AND row_no = ANY ($2) ORDER BY row_no', [
        runId,
        kept.map((row) => row.row_no),
      ])).rows;
      expect(after).toEqual(kept);
      expect(second.lines.filter((line) => line.msg === 'screening result emailed' && line.screening_run_id === runId)).toHaveLength(1);
    } finally {
      first.child.kill('SIGKILL');
      if (second !== undefined) {
        second.child.kill('SIGTERM');
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 20_000);
          second?.child.once('exit', () => {
            clearTimeout(timer);
            resolve(undefined);
          });
        });
      }
    }
  });
});
