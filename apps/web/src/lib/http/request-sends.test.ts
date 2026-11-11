import { CommitOutcomeUnknownError, TransactionNotCommittedError } from '@tp/db/runtime';
import { createLogger } from '@tp/observability';
import type { JobPayload, JobType } from '@tp/worker/jobs';
import { describe, expect, it } from 'vitest';

import type { HeldSends, JobQueue, PendingSend } from '../uploads/queue';
import { MemoryQueue } from '../uploads/queue';
import { RequestSends } from './request-sends';

/**
 * A request's jobs are committed in step with the request (Queues item 25 (a)): no send survives a rollback and none
 * is lost after a commit, by the order the routes' wrapper drives. The database tests hold the same against PostgreSQL
 * and a real queue (transaction-scope.db.test.ts).
 */

const PRACTICE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const RUN = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382701';
const DAILY = { practice_id: PRACTICE, day: '2026-11-11' } as const;

/** A queue that records what it is asked, and fails where the test says. */
function recordingQueue(fail: { hold?: boolean; commit?: boolean; direct?: number } = {}) {
  const steps: string[] = [];
  let directFailures = fail.direct ?? 0;
  const queue: JobQueue = {
    enqueue: <T extends JobType>(type: T, _payload: JobPayload<T>) => {
      if (directFailures > 0) {
        directFailures -= 1;
        steps.push(`direct ${type} failed`);
        return Promise.reject(new Error('SYNTHETIC queue down'));
      }
      steps.push(`direct ${type}`);
      return Promise.resolve('synthetic-job');
    },
    enqueueScreeningRun: () => Promise.resolve(null),
    hold: (sends: readonly PendingSend[]): Promise<HeldSends> => {
      if (fail.hold === true) {
        steps.push('hold failed');
        return Promise.reject(new Error('SYNTHETIC queue down'));
      }
      steps.push(`hold ${sends.map((send) => send.type).join(',')}`);
      return Promise.resolve({
        commit: () => {
          steps.push(fail.commit === true ? 'commit failed' : 'commit');
          return fail.commit === true ? Promise.reject(new Error('SYNTHETIC connection lost')) : Promise.resolve();
        },
        rollback: () => {
          steps.push('rollback');
          return Promise.resolve();
        },
      });
    },
  };
  return { queue, steps };
}

function logged() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

describe('a request’s jobs are committed in step with the request', () => {
  it('sends nothing while the handler runs, inserts at the hold, and commits only once the request has', async () => {
    const { queue, steps } = recordingQueue();
    const sends = new RequestSends(queue, logged().logger, 'req-1');
    await sends.enqueue('reconcile', DAILY);
    await sends.enqueue('price', { practice_id: PRACTICE, pricing_run_id: RUN });
    expect(steps).toEqual([]);
    await sends.hold();
    expect(steps).toEqual(['hold price,reconcile']);
    await sends.settle(undefined);
    expect(steps).toEqual(['hold price,reconcile', 'commit']);
  });

  it('inserts in one order whatever order the handler sent in, so two requests never wait on each other’s keys', async () => {
    const orders: string[] = [];
    for (const sent of [
      ['price', 'reconcile'],
      ['reconcile', 'price'],
    ] as const) {
      const { queue, steps } = recordingQueue();
      const sends = new RequestSends(queue, logged().logger, 'req-order');
      for (const type of sent) {
        await (type === 'price' ? sends.enqueue('price', { practice_id: PRACTICE, pricing_run_id: RUN }) : sends.enqueue('reconcile', DAILY));
      }
      await sends.hold();
      orders.push(steps.join());
    }
    expect(orders).toEqual(['hold price,reconcile', 'hold price,reconcile']);
  });

  it('rolls the jobs back with a request that did not commit: thrown from the handler, or rolled back at its COMMIT', async () => {
    for (const failure of [new Error('SYNTHETIC handler failed'), new TransactionNotCommittedError(), Object.assign(new Error('SYNTHETIC lock'), { code: '55P03' })]) {
      const { queue, steps } = recordingQueue();
      const sends = new RequestSends(queue, logged().logger, 'req-2');
      await sends.enqueue('reconcile', DAILY);
      await sends.hold();
      await sends.settle(failure);
      expect(steps).toEqual(['hold reconcile', 'rollback']);
      // Nothing more is queued with a request that has ended, and nothing was sent by itself.
      await expect(sends.enqueue('reconcile', DAILY)).rejects.toThrow('the request has ended');
      expect(steps).toEqual(['hold reconcile', 'rollback']);
    }
  });

  it('queues nothing for a request that failed before its jobs were held', async () => {
    const { queue, steps } = recordingQueue();
    const sends = new RequestSends(queue, logged().logger, 'req-3');
    await sends.enqueue('reconcile', DAILY);
    await sends.settle(new Error('SYNTHETIC handler failed'));
    expect(steps).toEqual([]);
  });

  it('fails the request when a job cannot be held, before its commit', async () => {
    const { queue, steps } = recordingQueue({ hold: true });
    const sends = new RequestSends(queue, logged().logger, 'req-4');
    await sends.enqueue('reconcile', DAILY);
    const failure = await sends.hold().catch((error: unknown) => error);
    expect(failure).toEqual(new Error('SYNTHETIC queue down'));
    await sends.settle(failure);
    expect(steps).toEqual(['hold failed']);
  });

  it('refuses a payload the worker’s contract refuses as the handler sends it, not at the commit', async () => {
    const { queue, steps } = recordingQueue();
    const sends = new RequestSends(queue, logged().logger, 'req-5');
    await expect(sends.enqueue('reconcile', { practice_id: 'not-an-id', day: '2026-11-11' })).rejects.toThrow();
    await sends.hold();
    expect(steps).toEqual([]);
  });

  it('opens no queue transaction for a request that queued nothing', async () => {
    const { queue, steps } = recordingQueue();
    const sends = new RequestSends(queue, logged().logger, 'req-6');
    await sends.hold();
    await sends.settle(undefined);
    expect(steps).toEqual([]);
    await expect(sends.hold()).rejects.toThrow('held once');
  });

  it('loses no job when the queue’s own commit fails after the request’s: each is sent again directly', async () => {
    const { queue, steps } = recordingQueue({ commit: true, direct: 2 });
    const { lines, logger } = logged();
    const sends = new RequestSends(queue, logger, 'req-7');
    await sends.enqueue('reconcile', DAILY);
    await sends.enqueue('price', { practice_id: PRACTICE, pricing_run_id: RUN });
    await sends.hold();
    await sends.settle(undefined);
    expect(steps).toEqual(['hold price,reconcile', 'commit failed', 'direct price failed', 'direct price failed', 'direct price', 'direct reconcile']);
    expect(lines.map((line) => [line.level, line.error_code, line.request_id])).toEqual([['warn', 'QUEUE_COMMIT_FAILED', 'req-7']]);
  });

  it('says so, by code, type and request, when a job still cannot be queued after its request committed, and goes on to the next', async () => {
    const { queue, steps } = recordingQueue({ commit: true, direct: 3 });
    const { lines, logger } = logged();
    const sends = new RequestSends(queue, logger, 'req-8');
    await sends.enqueue('reconcile', DAILY);
    await sends.enqueue('price', { practice_id: PRACTICE, pricing_run_id: RUN });
    await sends.hold();
    await expect(sends.settle(undefined)).resolves.toBeUndefined();
    expect(steps.slice(2)).toEqual(['direct price failed', 'direct price failed', 'direct price failed', 'direct reconcile']);
    expect(lines.map((line) => [line.level, line.error_code, line.job_type, line.request_id])).toEqual([
      ['warn', 'QUEUE_COMMIT_FAILED', undefined, 'req-8'],
      ['error', 'JOB_NOT_QUEUED_AFTER_COMMIT', 'price', 'req-8'],
    ]);
    // No line holds a payload: IDs of the request and the job's type alone.
    expect(JSON.stringify(lines)).not.toContain(PRACTICE);
  });

  it('commits the jobs when the request’s own commit ended without an answer: a job that finds nothing does nothing, a job lost for a saved record is worse', async () => {
    const { queue, steps } = recordingQueue();
    const sends = new RequestSends(queue, logged().logger, 'req-9');
    await sends.enqueue('reconcile', DAILY);
    await sends.hold();
    await sends.settle(new CommitOutcomeUnknownError(new Error('SYNTHETIC connection lost')));
    expect(steps).toEqual(['hold reconcile', 'commit']);
    await expect(sends.enqueue('reconcile', DAILY)).rejects.toThrow('the request has ended');
  });

  it('sends at once in work left for after the commit, when the records are saved', async () => {
    const { queue, steps } = recordingQueue();
    const sends = new RequestSends(queue, logged().logger, 'req-10');
    await sends.hold();
    await sends.settle(undefined);
    await sends.enqueue('monitor', { practice_id: PRACTICE, request_id: 'req-10' });
    expect(steps).toEqual(['direct monitor']);
  });
});

describe('the tests’ queue holds as the real one does', () => {
  it('shows a held job only once it is committed, never after a rollback, and counts what is left open', async () => {
    const queue = new MemoryQueue();
    const first = await queue.hold([{ type: 'reconcile', payload: DAILY }]);
    const second = await queue.hold([{ type: 'price', payload: { practice_id: PRACTICE, pricing_run_id: RUN } }]);
    expect([queue.jobs, queue.open]).toEqual([[], 2]);
    await second.rollback();
    await first.commit();
    await first.commit();
    await first.rollback();
    expect(queue.jobs).toEqual([{ type: 'reconcile', payload: DAILY }]);
    expect(queue.open).toBe(0);
    expect(() => queue.hold([{ type: 'reconcile', payload: { practice_id: 'not-an-id', day: '2026-11-11' } }])).toThrow();
  });
});
