import { assertNoPhi, createLogger } from '@tp/observability';
import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { PLATFORM_JOB_TYPES } from './platform';
import {
  SCREENING_BOSS_OPTIONS,
  SCREENING_JOB_TYPES,
  SCREENING_POLL_SECONDS,
  SCREENING_PRICING_JOB_TYPES,
  SCREENING_SCHEDULES,
  SCREENING_SWEEP_JOB,
  createScreeningHandlers,
  parseScreeningPayload,
  screeningWaitingConcurrency,
  screeningWorkOptions,
} from './screening';

const RUN = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';

/**
 * The screening consumer's three jobs (jobs/screening.ts; docs/adr/0062, PR 6b-3): screening_price under its old name, so
 * jobs queued before a deploy move to the consumer, the waiting tier's own queue (Q7), and the minute's sweep; payloads
 * of opaque IDs or nothing.
 */
describe('the screening jobs', () => {
  it('are the consumer’s three, none of them the platform’s', () => {
    expect(SCREENING_JOB_TYPES).toEqual(['screening_price', 'screening_price_waiting', 'screening_sweep']);
    expect(SCREENING_SWEEP_JOB).toBe('screening_sweep');
    for (const type of SCREENING_JOB_TYPES) {
      expect(PLATFORM_JOB_TYPES as readonly string[]).not.toContain(type);
    }
  });

  it('carry a run by its opaque ID, or nothing, and refuse anything else', () => {
    assertNoPhi('job_payload', parseScreeningPayload('screening_price', { screening_run_id: RUN }));
    assertNoPhi('job_payload', parseScreeningPayload('screening_sweep', {}));
    expect(parseScreeningPayload('screening_price', {})).toEqual({});
    expect(parseScreeningPayload('screening_price', null)).toEqual({});
    expect(parseScreeningPayload('screening_sweep', undefined)).toEqual({});
    expect(() => parseScreeningPayload('screening_price', { screening_run_id: 'abcdefghijklmnopqrstuvwxyzabcdef' })).toThrow(ZodError);
    expect(() => parseScreeningPayload('screening_price', { screening_run_id: RUN, token: 'abcdefghijklmnopqrstuvwxyzabcdef' })).toThrow(ZodError);
    expect(() => parseScreeningPayload('screening_price', { screening_run_id: RUN, contact_email: 'someone@synthetic.test' })).toThrow(ZodError);
    expect(() => parseScreeningPayload('screening_sweep', { screening_run_id: RUN })).toThrow(ZodError);
    // A waiting-tier job always names its run.
    assertNoPhi('job_payload', parseScreeningPayload('screening_price_waiting', { screening_run_id: RUN }));
    expect(() => parseScreeningPayload('screening_price_waiting', {})).toThrow(ZodError);
    expect(() => parseScreeningPayload('screening_price_waiting', { screening_run_id: RUN, contact_email: 'someone@synthetic.test' })).toThrow(ZodError);
  });

  it('work the waiting tier one thread fewer than the consumer has, so it never holds every thread', () => {
    expect([1, 2, 3, 8].map(screeningWaitingConcurrency)).toEqual([1, 1, 2, 7]);
  });

  it('are fetched at once on a send (LISTEN/NOTIFY), with pg-boss’s 2-s poll kept as the fallback, never relaxed to its 30 s', () => {
    expect(SCREENING_BOSS_OPTIONS).toEqual({ useListenNotify: true });
    expect(SCREENING_POLL_SECONDS).toBe(2);
    const poll = { batchSize: 1, pollingIntervalSeconds: 2, notifyPollingIntervalSeconds: 2 };
    expect(screeningWorkOptions('screening_price', 3)).toEqual({ ...poll, localConcurrency: 3 });
    expect(screeningWorkOptions('screening_price_waiting', 3)).toEqual({ ...poll, localConcurrency: 2 });
    expect(screeningWorkOptions('screening_sweep', 3)).toEqual(poll);
    // The jobs that hold a thread, whose end wakes the workers that fetch them (worker.ts).
    expect(SCREENING_PRICING_JOB_TYPES).toEqual(['screening_price', 'screening_price_waiting']);
    // pg-boss takes the instance's options as they are.
    expect(() => new PgBoss({ connectionString: 'postgres://nobody@localhost:1/none', ...SCREENING_BOSS_OPTIONS })).not.toThrow();
  });

  it('sweep every minute, in UTC', () => {
    const boss = new PgBoss('postgres://nobody@localhost:1/none');
    const from = new Date('2026-10-15T00:00:30Z');
    expect(boss.previewSchedule(SCREENING_SCHEDULES.screening_sweep, { from, count: 2, tz: 'UTC' })).toEqual([new Date('2026-10-15T00:01:00Z'), new Date('2026-10-15T00:02:00Z')]);
  });

  it('price a named run in a thread, and sweep on a sweep or an empty screening_price (the platform’s old schedule)', async () => {
    const calls: string[] = [];
    const handlers = createScreeningHandlers({
      price: (runId, context, options) => {
        calls.push(`price:${runId}:${context.jobId}${options?.waiting === true ? ':waiting' : ''}`);
        return Promise.resolve();
      },
      sweep: (context) => {
        calls.push(`sweep:${context.jobId}`);
        return Promise.resolve();
      },
    });
    const logger = createLogger({ sink: () => undefined });
    await handlers.screening_price({ screening_run_id: RUN }, { jobId: 'job-1', logger });
    await handlers.screening_price({}, { jobId: 'job-2', logger });
    await handlers.screening_sweep({}, { jobId: 'job-3', logger });
    await handlers.screening_price_waiting({ screening_run_id: RUN }, { jobId: 'job-4', logger });
    expect(calls).toEqual([`price:${RUN}:job-1`, 'sweep:job-2', 'sweep:job-3', `price:${RUN}:job-4:waiting`]);
  });
});
