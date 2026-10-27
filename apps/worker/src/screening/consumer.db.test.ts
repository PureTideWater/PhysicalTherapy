import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';

import { createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { enqueueScreeningRun } from '../jobs/enqueue';
import { QUEUE_OPTIONS } from '../jobs/registry';
import { type ScreeningJobs, createScreeningHandlers } from '../jobs/screening';
import { startWorker } from '../worker';
import { startScreeningConsumer } from './consumer';
import { SMALL, localMail, timedRun, timedRuns, until, screeningDatabaseForThisFile } from './test-support/consumer';

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
 * - at most one copy of a release's shared types per thread.
 *
 * SCR-19 (a consumer killed mid-run, its run claimed again by another) is consumer-lease.db.test.ts's, a file of its
 * own so its wait for the lease runs beside these in CI's database shards (docs/adr/0066).
 */

/** "At once": well under pg-boss's 2-s poll, which a job sent to sleeping workers waited out before (CI's S5 on 7abb99c). */
const AT_ONCE_MS = 750;

const screening = screeningDatabaseForThisFile();

describe('the screening consumer in one process', () => {
  it('sets the heartbeat on a queue that existed without one, prices in its threads as tp_screening, and keeps one copy of a release per thread', { timeout: 120_000 }, async () => {
    // PR 6's queue, as every worker of the previous image created it, and the platform's minute schedule of it.
    const previous = new PgBoss(screening.database.url);
    previous.on('error', () => undefined);
    await previous.start();
    await previous.createQueue('screening_price', QUEUE_OPTIONS);
    await previous.schedule('screening_price', '* * * * *', {}, { tz: 'UTC', singletonKey: 'screening_price' });
    await previous.stop({ graceful: false });
    expect((await screening.owner.query("SELECT heartbeat_seconds, notify FROM pgboss.queue WHERE name = 'screening_price'")).rows).toEqual([{ heartbeat_seconds: null, notify: false }]);

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
    const boss = screening.consumerBoss();
    const consumer = await startScreeningConsumer(
      { databaseUrl: screening.database.screeningUrl, concurrency: 2, notifications: localMail(screening.outbox) },
      boss,
      logger,
      { workerId: randomUUID() },
    );
    const worker = await startWorker({ boss, logger, screening: consumer, heartbeatMs: 60_000, shutdownTimeoutMs: 30_000 });
    try {
      // The heartbeat and the send's NOTIFY, on PR 6's queue too.
      const queues = await screening.owner.query<{ name: string; heartbeat_seconds: number; notify: boolean }>(
        "SELECT name, heartbeat_seconds, notify FROM pgboss.queue WHERE name IN ('screening_price', 'screening_price_waiting', 'screening_sweep') ORDER BY name",
      );
      expect(queues.rows).toEqual([
        { name: 'screening_price', heartbeat_seconds: 60, notify: true },
        { name: 'screening_price_waiting', heartbeat_seconds: 60, notify: true },
        { name: 'screening_sweep', heartbeat_seconds: 60, notify: true },
      ]);
      expect((await screening.owner.query("SELECT name FROM pgboss.schedule WHERE name IN ('screening_price', 'screening_sweep') ORDER BY name")).rows).toEqual([{ name: 'screening_sweep' }]);

      // Four runs, sent as the web sends them, priced two at a time.
      const runs = [await screening.submit(SMALL), await screening.submit(SMALL), await screening.submit(SMALL), await screening.submit(SMALL)];
      for (const runId of runs) {
        expect(await enqueueScreeningRun(boss, runId, { priority: 0 })).not.toBeNull();
      }
      const jobs = await screening.owner.query<{ heartbeat_seconds: number; priority: number }>("SELECT heartbeat_seconds, priority FROM pgboss.job WHERE name = 'screening_price' AND singleton_key = ANY ($1)", [
        runs.map((runId) => `screening_price:${runId}`),
      ]);
      expect(jobs.rows).toEqual(runs.map(() => ({ heartbeat_seconds: 60, priority: 0 })));
      for (const runId of runs) {
        expect((await until(() => screening.runOf(runId), (run) => run.status === 'complete', 60_000, 100)).status).toBe('complete');
        expect(screening.emailsTo(await screening.contactOf(runId)).map((message) => message.subject)).toEqual([expect.stringContaining('Your screening is ready') as string]);
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
    const boss = screening.consumerBoss();
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
      const jobs = await screening.owner.query<{ name: string; priority: number }>('SELECT name, priority FROM pgboss.job WHERE singleton_key = ANY ($1) ORDER BY priority DESC', [
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

describe('SCR-08: a free thread takes the next normal run at once (CI’s S5 on 7abb99c: two of three practice uploads queued as the first was emailed waited for a poll)', () => {
  it('starts three normal runs queued within a second on three threads at once', { timeout: 60_000 }, async () => {
    const { dir, boss, worker } = await screening.timedConsumer();
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
      const jobs = await screening.owner.query<{ waited_ms: number }>("SELECT (extract(epoch FROM started_on - created_on) * 1000)::int AS waited_ms FROM pgboss.job WHERE name = 'screening_price' AND singleton_key = ANY ($1)", [
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
    const { dir, boss, worker } = await screening.timedConsumer();
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
