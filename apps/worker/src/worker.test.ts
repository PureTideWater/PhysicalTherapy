import { createLogger } from '@tp/observability';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JobHandlers } from './jobs/handlers';
import { placeholderHandlers } from './jobs/handlers';
import { JOB_TYPES, QUEUE_OPTIONS } from './jobs/registry';
import { JobPayloadError, type QueueClient, startWorker } from './worker';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

type Handler = (jobs: { id: string; data: unknown }[]) => Promise<unknown>;

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
  };
  return { boss, handlers, calls, client: boss as unknown as QueueClient };
}

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
    const worker = await startWorker({ boss: client, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    expect(calls).toEqual([
      'start',
      ...JOB_TYPES.map((type) => `createQueue:${type}`),
      ...JOB_TYPES.map((type) => `work:${type}`),
    ]);
    for (const type of JOB_TYPES) {
      expect(boss.createQueue).toHaveBeenCalledWith(type, QUEUE_OPTIONS);
      expect(boss.work).toHaveBeenCalledWith(type, { batchSize: 1 }, expect.any(Function));
    }
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

  it('fails a job whose payload is invalid without echoing the payload', async () => {
    const { handlers, client } = fakeBoss();
    const { lines, logger } = capture();
    const worker = await startWorker({ boss: client, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
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
    const worker = await startWorker({ boss: client, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
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
    const worker = await startWorker({ boss: client, logger, handlers: placeholderHandlers, heartbeatMs: 60_000 });
    await worker.stop();
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 30_000 });
  });
});
