import { CommitOutcomeUnknownError } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { type JobPayload, type JobType, parsePayload } from '@tp/worker/jobs';

import type { HeldSends, JobQueue, PendingSend, RequestQueue } from '../uploads/queue';

/** How often a job whose held send was lost at the queue's own commit is sent again, directly, before it is given up. */
const DIRECT_ATTEMPTS = 3;

/**
 * The jobs one signed-in request queues, committed in step with the request (Queues item 25 (a); docs/adr/0092's
 * follow-ups). A handler's `services.queue` is this one's door(). Until now a handler's send committed by itself on the queue's
 * connection while the request's transaction was open: a worker could take the job before the request committed and
 * find nothing, and a request that rolled back left its job behind.
 *
 * The order, which the routes' wrapper drives (invoke.ts):
 * 1. While the handler runs, enqueue() keeps each job, its payload validated then (a bad one fails in the handler).
 * 2. hold(): the last step before the request's COMMIT. The queue inserts the jobs in one transaction of its own and
 *    leaves it open. A job that cannot be queued rejects here, and the request rolls back: nothing saved, nothing queued.
 * 3. The request commits. settle(undefined) then commits the queue's transaction: the jobs are visible to workers only
 *    now, after the records they read.
 * 4. The request did not commit. settle(error) rolls the queue's transaction back: no worker ever sees the jobs.
 *
 * Two commits are not one, and what that leaves is said here. If the queue's commit fails after the request's, the
 * jobs are sent again directly, each tried three times; one still unsent is logged as an error by its code, its type
 * and the request's ID, and the request still answers as saved, which it is. If the process dies between the two
 * commits the job is lost without a line: only an outbox table written in the request's own transaction closes that
 * (a migration; recorded for the schema lane). And where the request's commit ended without an answer
 * (CommitOutcomeUnknownError), the queue's transaction is committed: a job that finds nothing committed does nothing,
 * and a job lost for a saved record is the worse error.
 */
export class RequestSends {
  private state: 'open' | 'held' | 'committed' | 'ended' = 'open';
  private readonly pending: PendingSend[] = [];
  private held: HeldSends | undefined;

  constructor(
    private readonly queue: JobQueue,
    private readonly logger: Logger,
    private readonly requestId: string,
  ) {}

  async enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<void> {
    if (this.state === 'committed') {
      // Work a handler left for after its commit (AfterCommit): the records are saved, so the send goes by itself.
      await this.queue.enqueue(type, payload);
      return;
    }
    if (this.state !== 'open') {
      throw new Error('the request has ended: nothing more is queued with it');
    }
    this.pending.push({ type, payload: parsePayload(type, payload) } as PendingSend);
  }

  /**
   * What a handler is given as its queue: enqueue and nothing else, on a frozen object of its own, so code in a
   * handler cannot hold or settle the request's jobs, by type or at run time.
   */
  door(): RequestQueue {
    return Object.freeze({ enqueue: <T extends JobType>(type: T, payload: JobPayload<T>) => this.enqueue(type, payload) });
  }

  /** Step 2: called once, inside the request's transaction, when everything else in it is done. */
  async hold(): Promise<void> {
    if (this.state !== 'open') {
      throw new Error('a request’s jobs are held once, before its commit');
    }
    this.state = 'held';
    if (this.pending.length > 0) {
      this.held = await this.queue.hold(this.pending);
    }
  }

  /**
   * Steps 3 and 4: called once the request's transaction has ended, with what it threw, or undefined when it
   * committed. Never rejects: the request's answer is already decided by its own transaction.
   */
  async settle(failure: unknown): Promise<void> {
    const held = this.held;
    this.held = undefined;
    if (failure !== undefined && !(failure instanceof CommitOutcomeUnknownError)) {
      this.state = 'ended';
      await held?.rollback();
      return;
    }
    // Committed, or not known to be rolled back: the jobs go out. Only a committed request may queue more.
    this.state = failure === undefined ? 'committed' : 'ended';
    if (held === undefined) {
      return;
    }
    try {
      await held.commit();
    } catch {
      this.logger.warn('the queue’s commit failed after the request’s; its jobs are sent again directly', { error_code: 'QUEUE_COMMIT_FAILED', request_id: this.requestId });
      await this.sendDirectly();
    }
  }

  /** The held jobs again, one by one on the queue's own connection: the singleton key makes one already queued a no-op. */
  private async sendDirectly(): Promise<void> {
    for (const send of this.pending) {
      let sent = false;
      for (let attempt = 0; attempt < DIRECT_ATTEMPTS && !sent; attempt += 1) {
        sent = await this.queue.enqueue(send.type, send.payload).then(
          () => true,
          () => false,
        );
      }
      if (!sent) {
        this.logger.error('a job was not queued after its request committed', { error_code: 'JOB_NOT_QUEUED_AFTER_COMMIT', job_type: send.type, request_id: this.requestId });
      }
    }
  }
}
