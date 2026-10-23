import type { ScopeClient, ScopePool } from '@tp/db';
import { createLogger } from '@tp/observability';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JobHandlers } from './jobs/handlers';
import { placeholderHandlers } from './jobs/handlers';
import { PLATFORM_JOB_TYPES, PLATFORM_SCHEDULES, type PlatformHandlers } from './jobs/platform';
import { JOB_TYPES, PARSE_CONCURRENCY, QUEUE_OPTIONS, SCREENING_QUEUE_OPTIONS, queueOptions, workOptions } from './jobs/registry';
import { SCREENING_JOB_TYPES, type ScreeningHandlers, type ScreeningJobs } from './jobs/screening';
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
    updateQueue: vi.fn((name: string) => {
      calls.push(`updateQueue:${name}`);
      return Promise.resolve();
    }),
    unschedule: vi.fn((name: string) => {
      calls.push(`unschedule:${name}`);
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
    // pg-boss's workers, as work() spawns them: one per unit of local concurrency (1 when none is given).
    getWipData: vi.fn((): { id: string; name: string }[] =>
      [...handlers.keys()].flatMap((name) => {
        const options = boss.work.mock.calls.find(([called]) => called === name)?.[1] as { localConcurrency?: number } | undefined;
        return Array.from({ length: options?.localConcurrency ?? 1 }, (_, index) => ({ id: `${name}-${String(index)}`, name }));
      }),
    ),
    notifyWorker: vi.fn((id: string) => {
      calls.push(`notifyWorker:${id}`);
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
      // Every worker creates the platform and screening queues, so a producer's send never meets a missing queue (docs/adr/0062).
      ...PLATFORM_JOB_TYPES.map((type) => `createQueue:${type}`),
      ...SCREENING_JOB_TYPES.map((type) => `createQueue:${type}`),
      ...JOB_TYPES.map((type) => `work:${type}`),
    ]);
    for (const type of SCREENING_JOB_TYPES) {
      expect(boss.createQueue).toHaveBeenCalledWith(type, SCREENING_QUEUE_OPTIONS);
    }
    for (const type of JOB_TYPES) {
      expect(boss.createQueue).toHaveBeenCalledWith(type, queueOptions(type));
      expect(boss.work).toHaveBeenCalledWith(type, workOptions(type), expect.any(Function));
    }
    // A zip's parse jobs drain several at a time, polled at pg-boss's minimum; every other queue one at a time.
    expect(workOptions('parse_835')).toEqual({ batchSize: 1, pollingIntervalSeconds: 0.5, localConcurrency: PARSE_CONCURRENCY });
    for (const type of JOB_TYPES.filter((other) => other !== 'parse_835')) {
      expect(workOptions(type)).toEqual({ batchSize: 1 });
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
    // A digest starts new work, so its practice's standing is asked first, in the same job scope (docs/adr/0050).
    // Each job scope asks whether its job ID names a person before the job runs (docs/adr/0061).
    const scoped = expect.stringContaining("set_config('app.practice_ids', ARRAY[$2::uuid]::text, true)");
    const notAPerson = 'SELECT app_actor_is_person() AS person';
    expect(recorder.queries.map((query) => query.text)).toEqual(['BEGIN', scoped, notAPerson, 'SELECT practice_run_refusal($1) AS reason', 'COMMIT', 'BEGIN', scoped, notAPerson, 'COMMIT']);
    expect(recorder.queries[1]?.values).toEqual([jobId, PRACTICE]);
    expect(recorder.queries[6]?.values).toEqual([jobId, PRACTICE]);
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
      platform: {
        audit_copy: failing,
        restore_drill: failing,
        support_grant_notices: failing,
        monitoring_schedule: failing,
        billing_dunning: failing,
        usage_snapshot: failing,
        support_mail: failing,
        screening_expiry: failing,
        mail_events: failing,
        mail_expiry: failing,
        dunning_notices: failing,
      },
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
    const jobId = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382703';
    await handlers.get('digest')?.([{ id: jobId, data: { practice_id: PRACTICE, period: '2026-10' } }]);
    expect(lines.some((line) => line.job_type === 'digest' && line.job_id === jobId)).toBe(true);
    await worker.stop();
  });

  it('refuses a run-starting job of a suspended organization: nothing runs, the run is recorded refused, no retry and no alert', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const queries: string[] = [];
    const suspended = {
      connect: () =>
        Promise.resolve({
          query: (text: string) => {
            queries.push(text);
            const rows: unknown[] = text.startsWith('SELECT practice_run_refusal') ? [{ reason: 'the organization is suspended for nonpayment' }] : [];
            return Promise.resolve({ rows, rowCount: rows.length, command: '', oid: 0, fields: [] });
          },
          release: () => undefined,
        }),
    } as unknown as ScopePool<ScopeClient>;
    const ends: unknown[] = [];
    const runs: JobRunRecorder = { started: () => Promise.resolve(), finished: (end) => Promise.resolve(void ends.push(end)) };
    const monitor = vi.fn(() => Promise.resolve());
    const parse = vi.fn(() => Promise.resolve());
    const worker = await startWorker({ boss: client, pool: suspended, logger, runs, handlers: { ...placeholderHandlers, monitor, parse_835: parse }, heartbeatMs: 60_000 });
    const jobId = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382704';
    await handlers.get('monitor')?.([{ id: jobId, retryCount: QUEUE_OPTIONS.retryLimit, data: { practice_id: PRACTICE, day: '2026-10-16' } }]);
    expect(monitor).not.toHaveBeenCalled();
    expect(ends).toEqual([{ jobId, practiceId: PRACTICE, outcome: 'refused', errorCode: 'ORGANIZATION_SUSPENDED' }]);
    expect(lines.find((line) => line.msg === 'job refused: the organization may not start new runs')).toMatchObject({ job_id: jobId, job_type: 'monitor', error_code: 'ORGANIZATION_SUSPENDED' });
    expect(lines.some((line) => line.msg === JOB_FAILED_MESSAGE)).toBe(false);
    // Work started before the suspension (an upload's parse) is not asked and finishes.
    queries.length = 0;
    await handlers.get('parse_835')?.([{ id: '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382705', data: { practice_id: PRACTICE, document_id: DOCUMENT } }]);
    expect(parse).toHaveBeenCalled();
    expect(queries.some((text) => text.includes('practice_run_refusal'))).toBe(false);
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

  it('runs no platform job unless it is given the platform handlers, but creates their queues', async () => {
    const { boss, calls, client } = fakeBoss();
    const worker = await startWorker({ boss: client, pool, logger: capture().logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    expect(boss.schedule).not.toHaveBeenCalled();
    expect(calls.filter((call) => PLATFORM_JOB_TYPES.some((type) => call.endsWith(`:${type}`)))).toEqual(PLATFORM_JOB_TYPES.map((type) => `createQueue:${type}`));
    for (const type of PLATFORM_JOB_TYPES) {
      expect(boss.createQueue).toHaveBeenCalledWith(type, QUEUE_OPTIONS);
    }
    await worker.stop();
  });

  it('creates, schedules (UTC, one at a time) and works the platform queues when given their handlers', async () => {
    const { boss, calls, handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const auditCopy = vi.fn<PlatformHandlers['audit_copy']>((_payload, context) => {
      context.logger.info('copying');
      return Promise.resolve();
    });
    const platform: PlatformHandlers = {
      audit_copy: auditCopy,
      restore_drill: () => Promise.resolve(),
      support_grant_notices: () => Promise.resolve(),
      monitoring_schedule: () => Promise.resolve(),
      billing_dunning: () => Promise.resolve(),
      usage_snapshot: () => Promise.resolve(),
      support_mail: () => Promise.resolve(),
      screening_expiry: () => Promise.resolve(),
      mail_events: () => Promise.resolve(),
      mail_expiry: () => Promise.resolve(),
      dunning_notices: () => Promise.resolve(),
    };
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

  it('works the platform queues alone without practice handlers, creating the practice queues it queues into (WORKER_JOBS=platform)', async () => {
    const { boss, calls, client } = fakeBoss();
    const platform: PlatformHandlers = {
      audit_copy: () => Promise.resolve(),
      restore_drill: () => Promise.resolve(),
      support_grant_notices: () => Promise.resolve(),
      monitoring_schedule: () => Promise.resolve(),
      billing_dunning: () => Promise.resolve(),
      usage_snapshot: () => Promise.resolve(),
      support_mail: () => Promise.resolve(),
      screening_expiry: () => Promise.resolve(),
      mail_events: () => Promise.resolve(),
      mail_expiry: () => Promise.resolve(),
      dunning_notices: () => Promise.resolve(),
    };
    const worker = await startWorker({ boss: client, logger: capture().logger, platform, heartbeatMs: 60_000 });
    for (const type of JOB_TYPES) {
      expect(boss.createQueue).toHaveBeenCalledWith(type, queueOptions(type));
      expect(calls).not.toContain(`work:${type}`);
    }
    for (const type of PLATFORM_JOB_TYPES) {
      expect(calls).toContain(`work:${type}`);
    }
    await worker.stop();
  });

  it('refuses to start with neither kind of job, or with practice handlers but no pool', async () => {
    const { boss, client } = fakeBoss();
    await expect(startWorker({ boss: client, logger: capture().logger, heartbeatMs: 60_000 })).rejects.toThrow(/practice jobs, the platform jobs, the screening jobs or more than one/);
    await expect(startWorker({ boss: client, logger: capture().logger, handlers: placeholderHandlers, heartbeatMs: 60_000 })).rejects.toThrow(
      /both their handlers and the application login pool/,
    );
    await expect(startWorker({ boss: client, logger: capture().logger, pool, heartbeatMs: 60_000 })).rejects.toThrow(/both their handlers and the application login pool/);
    expect(boss.start).not.toHaveBeenCalled();
  });

  it('works the screening queues alone (WORKER_JOBS=screening): the heartbeat set on queues that exist, the platform’s old schedule gone, the sweep each minute, three runs at once', async () => {
    const { boss, calls, handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const priced: string[] = [];
    const waited: string[] = [];
    const swept: string[] = [];
    const closed: string[] = [];
    const screening: ScreeningJobs = {
      concurrency: 3,
      handlers: {
        screening_price: (payload, context) => {
          if (payload.screening_run_id === undefined) {
            swept.push(context.jobId);
          } else {
            priced.push(payload.screening_run_id);
          }
          return Promise.resolve();
        },
        screening_price_waiting: (payload) => {
          waited.push(payload.screening_run_id);
          return Promise.resolve();
        },
        screening_sweep: (_payload, context) => {
          swept.push(context.jobId);
          return Promise.resolve();
        },
      } satisfies ScreeningHandlers,
      close: () => {
        closed.push('closed');
        return Promise.resolve();
      },
    };
    const worker = await startWorker({ boss: client, logger, screening, heartbeatMs: 60_000, shutdownTimeoutMs: 110_000 });
    // The practice and platform queues exist for their producers, and none of them is worked here.
    for (const type of [...JOB_TYPES, ...PLATFORM_JOB_TYPES]) {
      expect(calls).toContain(`createQueue:${type}`);
      expect(calls).not.toContain(`work:${type}`);
    }
    expect(boss.schedule).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => !call.startsWith('createQueue:'))).toEqual([
      'start',
      'updateQueue:screening_price',
      'updateQueue:screening_price_waiting',
      'updateQueue:screening_sweep',
      'unschedule:screening_price',
      'schedule:screening_sweep',
      'work:screening_price',
      'work:screening_price_waiting',
      'work:screening_sweep',
    ]);
    for (const type of SCREENING_JOB_TYPES) {
      // The heartbeat, and a NOTIFY with each send, on queues created before either.
      expect(boss.updateQueue).toHaveBeenCalledWith(type, { heartbeatSeconds: 60, notify: true });
    }
    expect(boss.schedule).toHaveBeenCalledWith('screening_sweep', '* * * * *', {}, { tz: 'UTC', singletonKey: 'screening_sweep' });
    // pg-boss's 2-s poll kept beside the NOTIFY, never relaxed to its 30 s.
    const poll = { batchSize: 1, pollingIntervalSeconds: 2, notifyPollingIntervalSeconds: 2 };
    expect(boss.work).toHaveBeenCalledWith('screening_price', { ...poll, localConcurrency: 3 }, expect.any(Function));
    // The waiting tier one thread fewer: never every thread (Q7).
    expect(boss.work).toHaveBeenCalledWith('screening_price_waiting', { ...poll, localConcurrency: 2 }, expect.any(Function));
    expect(boss.work).toHaveBeenCalledWith('screening_sweep', poll, expect.any(Function));
    await handlers.get('screening_price')?.([{ id: 'job-run', data: { screening_run_id: DOCUMENT } }]);
    // The platform's schedule fired before the consumer removed it: an empty screening_price is the sweep.
    await handlers.get('screening_price')?.([{ id: 'job-old-schedule', data: null }]);
    await handlers.get('screening_sweep')?.([{ id: 'job-sweep', data: {} }]);
    await handlers.get('screening_price_waiting')?.([{ id: 'job-waiting', data: { screening_run_id: DOCUMENT } }]);
    expect(priced).toEqual([DOCUMENT]);
    expect(waited).toEqual([DOCUMENT]);
    expect(swept).toEqual(['job-old-schedule', 'job-sweep']);
    // A waiting-tier job always names its run: an empty one is refused, not taken for the sweep.
    await expect(handlers.get('screening_price_waiting')?.([{ id: 'job-empty', data: {} }])).rejects.toThrow(JobPayloadError);
    // A payload with anything but the run's ID is refused, by code, and never echoed.
    await expect(handlers.get('screening_price')?.([{ id: 'job-bad', data: { screening_run_id: DOCUMENT, contact_email: 'someone@synthetic.test' } }])).rejects.toThrow(JobPayloadError);
    expect(lines.find((line) => line.job_id === 'job-bad')).toMatchObject({ error_code: 'JOB_PAYLOAD_INVALID', job_type: 'screening_price' });
    expect(JSON.stringify(lines)).not.toContain('someone@synthetic.test');
    // Stopping waits for pg-boss's runs in hand, up to 110 seconds, then ends the threads.
    await worker.stop();
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 110_000 });
    expect(closed).toEqual(['closed']);
  });

  it('logs a screening job’s failure on its last attempt for the operator alarm, as every job’s', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const screening: ScreeningJobs = {
      concurrency: 1,
      handlers: {
        screening_price: () => Promise.reject(new Error('the screening run failed in its thread')),
        screening_price_waiting: () => Promise.resolve(),
        screening_sweep: () => Promise.resolve(),
      },
      close: () => Promise.resolve(),
    };
    const worker = await startWorker({ boss: client, logger, screening, heartbeatMs: 60_000 });
    await expect(handlers.get('screening_price')?.([{ id: 'job-0', retryCount: 0, data: { screening_run_id: DOCUMENT } }])).rejects.toThrow();
    expect(lines.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([]);
    await expect(handlers.get('screening_price')?.([{ id: 'job-2', retryCount: QUEUE_OPTIONS.retryLimit, data: { screening_run_id: DOCUMENT } }])).rejects.toThrow();
    expect(lines.filter((line) => line.msg === JOB_FAILED_MESSAGE)).toEqual([expect.objectContaining({ job_id: 'job-2', job_type: 'screening_price', error_code: 'JOB_FAILED' })]);
    await worker.stop();
  });

  it('wakes every pricing worker once a pricing job ends with its run priced, its thread free, and not after a failure or a sweep', async () => {
    const { boss, handlers, client } = fakeBoss();
    const wokenWhilePricing: number[] = [];
    let failing = false;
    const screening: ScreeningJobs = {
      concurrency: 3,
      handlers: {
        screening_price: () => {
          wokenWhilePricing.push(boss.notifyWorker.mock.calls.length);
          return failing ? Promise.reject(new Error('the screening threads could not be replaced')) : Promise.resolve();
        },
        screening_price_waiting: () => Promise.resolve(),
        screening_sweep: () => Promise.resolve(),
      },
      close: () => Promise.resolve(),
    };
    const worker = await startWorker({ boss: client, logger: capture().logger, screening, heartbeatMs: 60_000 });
    const woken = () => boss.notifyWorker.mock.calls.map(([id]) => id);
    // The three normal workers and the waiting tier's two; the sweep's worker is never woken by a run's end.
    const pricing = ['screening_price-0', 'screening_price-1', 'screening_price-2', 'screening_price_waiting-0', 'screening_price_waiting-1'];
    await handlers.get('screening_sweep')?.([{ id: 'job-sweep', data: {} }]);
    expect(woken()).toEqual([]);
    await handlers.get('screening_price')?.([{ id: 'job-run', data: { screening_run_id: DOCUMENT } }]);
    // After the run, not while it held its thread.
    expect(wokenWhilePricing).toEqual([0]);
    expect(woken()).toEqual(pricing);
    boss.notifyWorker.mockClear();
    await handlers.get('screening_price_waiting')?.([{ id: 'job-waiting', data: { screening_run_id: DOCUMENT } }]);
    expect(woken()).toEqual(pricing);
    boss.notifyWorker.mockClear();
    // A failed attempt wakes nothing: threads that cannot price fail queued jobs one poll at a time, never in a burst.
    failing = true;
    await expect(handlers.get('screening_price')?.([{ id: 'job-failed', data: { screening_run_id: DOCUMENT } }])).rejects.toThrow();
    await expect(handlers.get('screening_price_waiting')?.([{ id: 'job-bad', data: {} }])).rejects.toThrow(JobPayloadError);
    expect(woken()).toEqual([]);
    await worker.stop();
  });
});
