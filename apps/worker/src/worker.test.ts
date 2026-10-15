import { createLogger } from '@tp/observability';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JobHandlers } from './jobs/handlers';
import { placeholderHandlers } from './jobs/handlers';
import { PLATFORM_JOB_TYPES, PLATFORM_SCHEDULES, type PlatformHandlers } from './jobs/platform';
import { JOB_TYPES, QUEUE_OPTIONS, queueOptions } from './jobs/registry';
import type { JobRunRecorder } from './jobs/runs';
import { CrossPracticeJobError, JOB_FAILED_MESSAGE, JobPayloadError, type QueueClient, startWorker } from './worker';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

type Handler = (jobs: { id: string; data: unknown; retryCount?: number }[]) => Promise<unknown>;

function fakeBoss() {
  const handlers = new Map<string, Handler>();
  const calls: string[] = [];
  const boss = {
    start: vi.fn(() => {
      calls.push('start');
      return Promise.resolve(boss);
    }),
    stop: vi.fn(() => {
      calls.push('stop');
      return Promise.resolve();
    }),
    createQueue: vi.fn((name: string) => {
      calls.push(`createQueue:${name}`);
      return Promise.resolve();
    }),
    work: vi.fn((name: string, _options: unknown, handler: Handler) => {
      calls.push(`work:${name}`);
      handlers.set(name, handler);
      return Promise.resolve(`worker-${name}`);
    }),
    schedule: vi.fn((name: string) => {
      calls.push(`schedule:${name}`);
      return Promise.resolve();
    }),
    send: vi.fn((name: string, _data: unknown, options: { singletonKey: string }) => {
      calls.push(`send:${name}:${options.singletonKey}`);
      return Promise.resolve(`sent-${name}`);
    }),
  };
  return { boss, handlers, calls, client: boss as unknown as QueueClient };
}

/** A pool whose one connection records what it is sent. */
function fakePool() {
  const queries: { text: string; values?: unknown[] }[] = [];
  const pool = {
    connect: () =>
      Promise.resolve({
        query: (text: string, values?: unknown[]) => {
          queries.push({ text, values });
          return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
        },
        release: () => undefined,
      }),
  };
  return { queries, pool };
}

const { pool } = fakePool();

function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) });
  return { lines, logger };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('startWorker', () => {
  it('starts pg-boss, creates every queue with the shared options, then subscribes to each', async () => {
    const { boss, calls, client } = fakeBoss();
    const { logger } = capture();
    const worker = await startWorker({ boss: client, pool, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    expect(calls).toEqual([
      'start',
      ...JOB_TYPES.map((type) => `createQueue:${type}`),
      ...JOB_TYPES.map((type) => `work:${type}`),
    ]);
    for (const type of JOB_TYPES) {
      expect(boss.createQueue).toHaveBeenCalledWith(type, queueOptions(type));
      expect(boss.work).toHaveBeenCalledWith(type, { batchSize: 1 }, expect.any(Function));
    }
    await worker.stop();
  });

  it('lets a job queue follow-up work for its own practice only, and tells it which attempt is its last', async () => {
    const { calls, handlers, client } = fakeBoss();
    const seen: { sent: string | null; last: boolean }[] = [];
    const worker = await startWorker({
      boss: client,
      pool,
      logger: capture().logger,
      handlers: {
        ...placeholderHandlers,
        intake: async (payload, context) => {
          seen.push({ sent: await context.enqueue('parse_835', { practice_id: payload.practice_id, document_id: payload.document_id }), last: context.lastAttempt });
          await expect(context.enqueue('parse_835', { practice_id: DOCUMENT, document_id: payload.document_id })).rejects.toThrow(CrossPracticeJobError);
        },
      },
      heartbeatMs: 60_000,
    });
    await handlers.get('intake')?.([{ id: 'job-1', data: { practice_id: PRACTICE, document_id: DOCUMENT } }]);
    await handlers.get('intake')?.([{ id: 'job-1', retryCount: QUEUE_OPTIONS.retryLimit, data: { practice_id: PRACTICE, document_id: DOCUMENT } }]);
    expect(seen).toEqual([
      { sent: 'sent-parse_835', last: false },
      { sent: 'sent-parse_835', last: true },
    ]);
    expect(calls.filter((call) => call.startsWith('send:'))).toEqual([`send:parse_835:parse_835:${PRACTICE}:${DOCUMENT}`, `send:parse_835:parse_835:${PRACTICE}:${DOCUMENT}`]);
    await worker.stop();
  });

  it('hands a valid job to its handler with a logger scoped to the job', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const parse = vi.fn<JobHandlers['parse_835']>((_payload, context) => {
      context.logger.info('parsing');
      return Promise.resolve();
    });
    const worker = await startWorker({
      boss: client,
      pool,
      logger,
      handlers: { ...placeholderHandlers, parse_835: parse },
      heartbeatMs: 60_000,
    });
    await handlers.get('parse_835')?.([{ id: 'job-1', data: { practice_id: PRACTICE, document_id: DOCUMENT } }]);
    expect(parse).toHaveBeenCalledWith({ practice_id: PRACTICE, document_id: DOCUMENT }, expect.objectContaining({ jobId: 'job-1' }));
    expect(lines.find((line) => line.msg === 'parsing')).toMatchObject({
      job_id: 'job-1',
      job_type: 'parse_835',
      practice_id: PRACTICE,
    });
    await worker.stop();
  });

  it('opens every database transaction of a practice job in the scope of exactly its practice, as the job', async () => {
    const { handlers, client } = fakeBoss();
    const recorder = fakePool();
    const jobId = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';
    const worker = await startWorker({
      boss: client,
      pool: recorder.pool,
      logger: capture().logger,
      handlers: {
        ...placeholderHandlers,
        digest: async (_payload, context) => {
          const seen = await context.transaction((scope) => Promise.resolve({ kind: scope.kind, practices: scope.practiceIds, actor: scope.actorId, actorKind: scope.actorKind }));
          expect(seen).toEqual({ kind: 'job', practices: [PRACTICE], actor: jobId, actorKind: 'service' });
        },
      },
      heartbeatMs: 60_000,
    });
    await handlers.get('digest')?.([{ id: jobId, data: { practice_id: PRACTICE, period: '2026-10' } }]);
    expect(recorder.queries.map((query) => query.text)).toEqual(['BEGIN', expect.stringContaining("set_config('app.practice_ids', ARRAY[$2::uuid]::text, true)"), 'COMMIT']);
    expect(recorder.queries[1]?.values).toEqual([jobId, PRACTICE]);
    await worker.stop();
  });

  it('logs the final failure of a job for the operator alarm, and only on its third attempt', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const failing = () => Promise.reject(new Error('synthetic failure'));
    const worker = await startWorker({
      boss: client,
      pool,
      logger,
      handlers: { ...placeholderHandlers, price: failing },
      platform: { audit_copy: failing, restore_drill: failing, support_grant_notices: failing },
      heartbeatMs: 60_000,
    });
    const job = (retryCount: number) => ({ id: `job-${String(retryCount)}`, retryCount, data: { practice_id: PRACTICE, pricing_run_id: DOCUMENT } });
    for (const retryCount of [0, 1]) {
      await expect(handlers.get('price')?.([job(retryCount)])).rejects.toThrow('synthetic failure');
    }
    expect(lines.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([]);
    await expect(handlers.get('price')?.([job(QUEUE_OPTIONS.retryLimit)])).rejects.toThrow('synthetic failure');
    await expect(handlers.get('restore_drill')?.([{ id: 'job-drill', retryCount: QUEUE_OPTIONS.retryLimit, data: {} }])).rejects.toThrow('synthetic failure');
    expect(lines.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([
      expect.objectContaining({ level: 'error', job_id: 'job-2', job_type: 'price', error_code: 'JOB_FAILED' }),
      expect.objectContaining({ level: 'error', job_id: 'job-drill', job_type: 'restore_drill', error_code: 'JOB_FAILED' }),
    ]);
    expect(QUEUE_OPTIONS.retryLimit + 1).toBe(3);
    await worker.stop();
  });

  it('records each attempt of a practice job: running, then retrying, failed on the last, or succeeded (JOB-02)', async () => {
    const { handlers, client } = fakeBoss();
    const events: unknown[] = [];
    const runs: JobRunRecorder = {
      started: (run) => {
        events.push({ started: run });
        return Promise.resolve();
      },
      finished: (run) => {
        events.push({ finished: run });
        return Promise.resolve();
      },
    };
    const worker = await startWorker({
      boss: client,
      pool,
      logger: capture().logger,
      runs,
      handlers: { ...placeholderHandlers, price: () => Promise.reject(new Error('synthetic failure')) },
      heartbeatMs: 60_000,
    });
    const job = (retryCount: number) => ({ id: 'job-9', retryCount, data: { practice_id: PRACTICE, pricing_run_id: DOCUMENT } });
    for (const retryCount of [0, 1, 2]) {
      await expect(handlers.get('price')?.([job(retryCount)])).rejects.toThrow('synthetic failure');
    }
    await handlers.get('parse_835')?.([{ id: 'job-10', data: { practice_id: PRACTICE, document_id: DOCUMENT } }]);
    const started = (attempt: number, type: string, id: string) => ({ started: { jobId: id, practiceId: PRACTICE, type, singletonKey: `${type}:${PRACTICE}:${DOCUMENT}`, subject: DOCUMENT, attempt } });
    expect(events).toEqual([
      started(1, 'price', 'job-9'),
      { finished: { jobId: 'job-9', practiceId: PRACTICE, outcome: 'retrying', errorCode: 'JOB_FAILED' } },
      started(2, 'price', 'job-9'),
      { finished: { jobId: 'job-9', practiceId: PRACTICE, outcome: 'retrying', errorCode: 'JOB_FAILED' } },
      started(3, 'price', 'job-9'),
      { finished: { jobId: 'job-9', practiceId: PRACTICE, outcome: 'failed', errorCode: 'JOB_FAILED' } },
      started(1, 'parse_835', 'job-10'),
      { finished: { jobId: 'job-10', practiceId: PRACTICE, outcome: 'succeeded', errorCode: null } },
    ]);
    await worker.stop();
  });

  it('logs a run it cannot record and keeps the job’s own outcome', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const runs: JobRunRecorder = { started: () => Promise.resolve(), finished: () => Promise.reject(new Error('database down')) };
    const worker = await startWorker({ boss: client, pool, logger, runs, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    await handlers.get('parse_835')?.([{ id: 'job-11', data: { practice_id: PRACTICE, document_id: DOCUMENT } }]);
    expect(lines.find((line) => line.msg === 'job run not recorded')).toMatchObject({ job_id: 'job-11', error_code: 'JOB_RUN_NOT_RECORDED' });
    await worker.stop();
  });

  it('fails a job whose payload is invalid without echoing the payload', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const worker = await startWorker({ boss: client, pool, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    const job = { id: 'job-2', data: { practice_id: PRACTICE, document_id: DOCUMENT, member_id: 'SYN000000001' } };
    const run = handlers.get('parse_835')?.([job]);
    await expect(run).rejects.toThrow(JobPayloadError);
    await expect(run).rejects.not.toThrow(/SYN000000001/);
    const rejected = lines.find((line) => line.msg === 'job payload rejected');
    expect(rejected).toMatchObject({ job_id: 'job-2', job_type: 'parse_835', error_code: 'JOB_PAYLOAD_INVALID' });
    expect(JSON.stringify(lines)).not.toContain('SYN000000001');
    await worker.stop();
  });

  it('runs the placeholder handlers to completion', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const worker = await startWorker({ boss: client, pool, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    await handlers.get('digest')?.([{ id: 'job-3', data: { practice_id: PRACTICE, period: '2026-10' } }]);
    expect(lines.some((line) => line.job_type === 'digest' && line.job_id === 'job-3')).toBe(true);
    await worker.stop();
  });

  it('beats while running and stops gracefully exactly once', async () => {
    vi.useFakeTimers();
    const { boss, client } = fakeBoss();
    const { lines, logger } = capture();
    const worker = await startWorker({
      boss: client,
      pool,
      logger,
      handlers: placeholderHandlers,
      heartbeatMs: 1_000,
      shutdownTimeoutMs: 5_000,
    });
    vi.advanceTimersByTime(3_000);
    const beats = () => lines.filter((line) => line.msg === 'worker heartbeat').length;
    expect(beats()).toBe(4);
    await Promise.all([worker.stop(), worker.stop()]);
    expect(boss.stop).toHaveBeenCalledTimes(1);
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 5_000 });
    vi.advanceTimersByTime(10_000);
    expect(beats()).toBe(4);
    expect(lines.at(-1)).toMatchObject({ msg: 'worker stopped' });
  });

  it('waits thirty seconds for active jobs by default', async () => {
    const { boss, client } = fakeBoss();
    const { logger } = capture();
    const worker = await startWorker({ boss: client, pool, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    await worker.stop();
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 30_000 });
  });

  it('runs no platform job unless it is given the platform handlers', async () => {
    const { boss, calls, client } = fakeBoss();
    const worker = await startWorker({ boss: client, pool, logger: capture().logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    expect(boss.schedule).not.toHaveBeenCalled();
    expect(calls.filter((call) => PLATFORM_JOB_TYPES.some((type) => call.endsWith(`:${type}`)))).toEqual([]);
    await worker.stop();
  });

  it('creates, schedules (UTC, one at a time) and works the platform queues when given their handlers', async () => {
    const { boss, calls, handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const auditCopy = vi.fn<PlatformHandlers['audit_copy']>((_payload, context) => {
      context.logger.info('copying');
      return Promise.resolve();
    });
    const platform: PlatformHandlers = { audit_copy: auditCopy, restore_drill: () => Promise.resolve(), support_grant_notices: () => Promise.resolve() };
    const worker = await startWorker({ boss: client, pool, logger, handlers: placeholderHandlers, platform, heartbeatMs: 60_000 });
    for (const type of PLATFORM_JOB_TYPES) {
      expect(calls).toEqual(expect.arrayContaining([`createQueue:${type}`, `schedule:${type}`, `work:${type}`]));
      expect(boss.createQueue).toHaveBeenCalledWith(type, QUEUE_OPTIONS);
      expect(boss.schedule).toHaveBeenCalledWith(type, PLATFORM_SCHEDULES[type], {}, { tz: 'UTC', singletonKey: type });
    }
    await handlers.get('audit_copy')?.([{ id: 'job-9', data: { day: '2026-10-14' } }]);
    expect(auditCopy).toHaveBeenCalledWith({ day: '2026-10-14' }, expect.objectContaining({ jobId: 'job-9' }));
    expect(lines.find((line) => line.msg === 'copying')).toMatchObject({ job_id: 'job-9', job_type: 'audit_copy' });
    const refused = handlers.get('restore_drill')?.([{ id: 'job-10', data: { practice_id: PRACTICE } }]);
    await expect(refused).rejects.toThrow(JobPayloadError);
    expect(lines.find((line) => line.job_id === 'job-10')).toMatchObject({ error_code: 'JOB_PAYLOAD_INVALID', job_type: 'restore_drill' });
    await worker.stop();
  });
});
