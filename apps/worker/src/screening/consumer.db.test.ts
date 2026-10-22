import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
import { startWorker } from '../worker';
import { startScreeningConsumer } from './consumer';

/**
 * The screening consumer against PostgreSQL (docs/adr/0062; PR 6b-3), with SYNTHETIC release 900001 loaded and a split
 * a contract specialist approved:
 *
 * - the job heartbeat reaches a queue that already existed without one (PR 6's screening_price), through updateQueue,
 *   and every job the web sends carries it; the platform's old minute schedule is gone and the sweep's is there;
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
    expect((await owner.query("SELECT heartbeat_seconds FROM pgboss.queue WHERE name = 'screening_price'")).rows).toEqual([{ heartbeat_seconds: null }]);

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
    const boss = new PgBoss(database.url);
    boss.on('error', () => undefined);
    const consumer = await startScreeningConsumer(
      { databaseUrl: database.screeningUrl, concurrency: 2, notifications: { mail: { kind: 'local', dir: outbox }, appOrigin: ORIGIN, staticAssetOrigin: null } },
      boss,
      logger,
      { workerId: randomUUID() },
    );
    const worker = await startWorker({ boss, logger, screening: consumer, heartbeatMs: 60_000, shutdownTimeoutMs: 30_000 });
    try {
      const queues = await owner.query<{ name: string; heartbeat_seconds: number }>(
        "SELECT name, heartbeat_seconds FROM pgboss.queue WHERE name IN ('screening_price', 'screening_sweep') ORDER BY name",
      );
      expect(queues.rows).toEqual([
        { name: 'screening_price', heartbeat_seconds: 60 },
        { name: 'screening_sweep', heartbeat_seconds: 60 },
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
