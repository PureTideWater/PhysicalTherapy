import { randomUUID } from 'node:crypto';

import { QUEUE_OPTIONS } from '../../jobs/registry';
import type { QueueClient } from '../../worker';

/**
 * Test support: a queue in memory with pg-boss's behavior where the monitoring chain depends on it,
 * for driving the real worker loop (startWorker: payload checks, one-practice scopes, job_run, the
 * last-attempt alert) through a chain of jobs without polling. A job's singleton key is refused while
 * a job with that key is queued or active (the exclusive policy); a failed attempt is retried until
 * the third (retryLimit), as pg-boss retries it; startAfter is recorded, not waited for.
 */

type WorkHandler = (jobs: { id: string; data: unknown; retryCount?: number }[]) => Promise<unknown>;

export interface QueuedJob {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
  readonly singletonKey: string | undefined;
  readonly startAfter: unknown;
  retryCount: number;
}

export interface JobOutcome {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
  readonly attempt: number;
  readonly outcome: 'succeeded' | 'retrying' | 'failed';
}

export class MemoryQueue {
  private readonly handlers = new Map<string, WorkHandler>();
  readonly queued: QueuedJob[] = [];
  private active: QueuedJob | undefined;
  /** Every send, the refused ones included (job null). */
  readonly sent: { readonly name: string; readonly data: unknown; readonly job: string | null; readonly startAfter: unknown }[] = [];
  readonly outcomes: JobOutcome[] = [];

  readonly client: QueueClient = {
    start: () => Promise.resolve(this.client as never),
    stop: () => Promise.resolve(),
    createQueue: () => Promise.resolve(),
    schedule: () => Promise.resolve(),
    work: ((name: string, _options: unknown, handler: WorkHandler) => {
      this.handlers.set(name, handler);
      return Promise.resolve(name);
    }) as QueueClient['work'],
    send: ((name: string, data: object | null, options?: { singletonKey?: string; startAfter?: unknown }) => this.send(name, data, options)) as QueueClient['send'],
  };

  send(name: string, data: unknown, options: { singletonKey?: string; startAfter?: unknown } = {}): Promise<string | null> {
    const key = options.singletonKey;
    const busy = key !== undefined && (this.queued.some((job) => job.name === name && job.singletonKey === key) || (this.active?.name === name && this.active.singletonKey === key));
    const id = busy ? null : randomUUID();
    this.sent.push({ name, data, job: id, startAfter: options.startAfter });
    if (id !== null) {
      this.queued.push({ id, name, data, singletonKey: key, startAfter: options.startAfter, retryCount: 0 });
    }
    return Promise.resolve(id);
  }

  /** Works the queue, oldest first, until it is empty (or `limit` attempts), retrying failures up to three attempts. */
  async drain(limit = 200): Promise<JobOutcome[]> {
    const done: JobOutcome[] = [];
    for (let n = 0; n < limit; n += 1) {
      const job = this.queued.shift();
      if (job === undefined) {
        return done;
      }
      const handler = this.handlers.get(job.name);
      if (handler === undefined) {
        throw new Error(`no handler for the ${job.name} queue`);
      }
      this.active = job;
      let outcome: JobOutcome['outcome'] = 'succeeded';
      try {
        await handler([{ id: job.id, data: job.data, retryCount: job.retryCount }]);
      } catch {
        outcome = job.retryCount >= QUEUE_OPTIONS.retryLimit ? 'failed' : 'retrying';
      } finally {
        this.active = undefined;
      }
      const record = { id: job.id, name: job.name, data: job.data, attempt: job.retryCount + 1, outcome };
      done.push(record);
      this.outcomes.push(record);
      if (outcome === 'retrying') {
        job.retryCount += 1;
        this.queued.push(job);
      }
    }
    throw new Error('the queue did not drain');
  }
}
