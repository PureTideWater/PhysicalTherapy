import { CONNECTION_TIMEOUT_MS, committed } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { type JobPayload, type JobSender, type JobType, SCREENING_PRICE_PAYLOAD, SCREENING_PRIORITY, type ScreeningRunJobOptions, enqueue, enqueueScreeningRun, parsePayload } from '@tp/worker/jobs';
import { type ConstructorOptions, PgBoss } from 'pg-boss';

import { lockTimeoutParameter } from '../server/lock-timeout';
import { WEB_POOL_CONNECTIONS } from '../server/pools';

/**
 * How the web app queues work for the worker (PRD 10, Pipeline step 1: "the server records
 * source_document ... then queues"; docs/adr/0004 and 0026): through the worker's own job contract
 * (@tp/worker/jobs), so the queue, the payload's shape and the singleton key are the worker's. The
 * payload is opaque IDs only.
 */
export interface JobQueue {
  /** Queues the job; null when one with the same singleton key is already queued or active. */
  enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null>;
  /**
   * Queues a free screening's pricing for the screening consumer (docs/adr/0062) at the run's queue priority (0, or below
   * for an upload over its account's share or the day's cap); null when that run's job is already queued or active.
   */
  enqueueScreeningRun(runId: string, options?: ScreeningRunJobOptions): Promise<string | null>;
  /**
   * Queues a signed-in request's jobs in one transaction of the queue's own and leaves it open (HeldSends): the
   * routes' wrapper calls it as the last step before the request's COMMIT, and commits or rolls back the queue's
   * transaction by what the request's did (http/request-sends.ts). A job that cannot be queued rejects here, with
   * nothing held, so the request rolls back as it always has when its send failed.
   */
  hold(sends: readonly PendingSend[]): Promise<HeldSends>;
}

/** One job a request asked for, its payload already validated against the worker's contract. */
export type PendingSend = { readonly [T in JobType]: { readonly type: T; readonly payload: JobPayload<T> } }[JobType];

/**
 * A request's jobs, inserted in a transaction of the queue's own that is still open: no worker sees them until
 * commit(), and none ever does after rollback(). A process that dies holding it rolls it back by ending its connection.
 */
export interface HeldSends {
  /** Commits the queue's transaction and reads the answer; rejects, the connection released, unless the server answered COMMIT. */
  commit(): Promise<void>;
  /** Rolls the queue's transaction back and releases its connection. Never rejects; safe to call twice or after commit(). */
  rollback(): Promise<void>;
}

/**
 * What a signed-in route's handler queues through (SignedInServices): the job is queued with the request. It is held
 * until the request's own COMMIT and committed right after it, so a job is never visible to a worker before the
 * records it reads are, and a request that rolls back queues nothing. A job that cannot be queued fails the request
 * before its commit. In work a handler left for after the commit (AfterCommit) it sends at once, on the queue's own
 * connection, since the request's records are saved by then.
 */
export interface RequestQueue {
  enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<void>;
}

/**
 * pg-boss's options as the web's producer: it supervises, schedules and migrates nothing (the worker does). Its pool
 * carries the web's lock_timeout (server/lock-timeout.ts; docs/adr/0092, the amendment of 2026-11-11): a handler
 * queues while its request's transaction is open ("Queued in the request"), on pg-boss's own connection, so a send
 * that waited on a lock (the queue's own schema change as a worker starts, a send of the same singleton key in
 * flight) would hold the request's application connection for as long. A signed-in request's sends are inserted in
 * one transaction on a connection of this pool, held for the request's COMMIT (hold; http/request-sends.ts): one that
 * gives up leaves nothing written and makes its request roll back, and none outlives a request that rolls back. A send
 * made by itself (after a commit, or the public screening's) is one statement that commits by itself, and its caller
 * takes its failure (invoke.ts, runCommitted; the screening's sweep). Given as pg's own parameter, which pg-boss hands to its pool with the rest of its options;
 * lock-timeout.db.test.ts reads it back from a connection pg-boss opens.
 */
export function producerOptions(connectionString: string): ConstructorOptions {
  return {
    connectionString,
    supervise: false,
    schedule: false,
    migrate: false,
    max: WEB_POOL_CONNECTIONS.queue,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ...lockTimeoutParameter(connectionString),
  };
}

/** pg-boss as a producer only (producerOptions); it starts on first use. */
export class PgBossQueue implements JobQueue {
  private started: Promise<PgBoss> | undefined;
  /** Read as the queue is made, so a URL the producer refuses stops the server's start, not a person's request. */
  private readonly options: ConstructorOptions;

  constructor(
    connectionString: string,
    private readonly logger: Logger,
  ) {
    this.options = producerOptions(connectionString);
  }

  private boss(): Promise<PgBoss> {
    this.started ??= (async () => {
      const boss = new PgBoss(this.options);
      boss.on('error', () => {
        // pg-boss errors are logged by code only; their text can carry SQL and connection details.
        this.logger.error('queue error', { error_code: 'QUEUE_ERROR' });
      });
      await boss.start();
      return boss;
    })().catch((error: unknown) => {
      this.started = undefined;
      throw error;
    });
    return this.started;
  }

  async enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null> {
    return enqueue(await this.boss(), type, payload);
  }

  async enqueueScreeningRun(runId: string, options: ScreeningRunJobOptions = {}): Promise<string | null> {
    return enqueueScreeningRun(await this.boss(), runId, options);
  }

  /**
   * The jobs inserted in one transaction on a connection of the producer's own pool (pg-boss's transaction handle, and
   * its `db` option on each send), so the pool's lock_timeout holds for every insert and no connection is added to the
   * budget (server/pools.ts). The connection is held from here to commit() or rollback(): the request's COMMIT and no
   * more, since the wrapper holds as its last step.
   */
  async hold(sends: readonly PendingSend[]): Promise<HeldSends> {
    const boss = await this.boss();
    const transaction = await beginTransaction(boss.getDb());
    // The worker's own contract (the payload's shape, the singleton key), each send made in the open transaction.
    const sender = { send: (name: string, data: object, options: object) => boss.send(name, data, { ...options, db: transaction.db }) } as JobSender;
    try {
      for (const send of sends) {
        await enqueue(sender, send.type, send.payload);
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    return {
      commit: async () => {
        try {
          // The answer is read, as the request's own is (pg-boss's commit() takes any answer for a commit).
          await committed({ query: (text) => transaction.db.executeSql(text) });
        } finally {
          // Releases the connection: after a commit it changes nothing, and after a failed one it is the rollback.
          await transaction.rollback();
        }
      },
      rollback: () => transaction.rollback(),
    };
  }

  /** Closes the producer's pool, if it was opened (a server shutting down; tests). The queue starts again on its next use. */
  async stop(): Promise<void> {
    const started = this.started;
    this.started = undefined;
    await (await started?.catch(() => undefined))?.stop();
  }
}

/** A statement runner of pg-boss's: its pool, or one open transaction. */
type QueueDb = ReturnType<PgBoss['getDb']>;

/** pg-boss's handle on a transaction it opened on one connection of its pool (its Db's beginTransaction). */
interface QueueTransaction {
  /** Runs statements in the transaction: the `db` option of a send. */
  readonly db: QueueDb;
  /** Rolls back and releases the connection; never rejects, and may be called again. */
  rollback(): Promise<void>;
}

/** pg-boss's built-in database adapter, which opens a transaction on a connection of its pool; a stand-in may not. */
function beginTransaction(db: QueueDb): Promise<QueueTransaction> {
  const begin = (db as { beginTransaction?: () => Promise<QueueTransaction> }).beginTransaction;
  if (typeof begin !== 'function') {
    return Promise.reject(new Error('the queue’s database adapter opens no transaction, so a request’s jobs cannot be held for its commit'));
  }
  return begin.call(db);
}

/** Tests and the e2e build's checks: the jobs queued, in order. */
export class MemoryQueue implements JobQueue {
  readonly jobs: { readonly type: JobType; readonly payload: unknown }[] = [];

  /** The screening runs queued for pricing, in order. */
  readonly screeningRuns: string[] = [];
  /** Each one's queue priority, in the same order. */
  readonly screeningPriorities: number[] = [];

  enqueue<T extends JobType>(type: T, payload: JobPayload<T>): Promise<string | null> {
    this.jobs.push({ type, payload: parsePayload(type, payload) });
    return Promise.resolve(`memory-${String(this.jobs.length)}`);
  }

  enqueueScreeningRun(runId: string, options: ScreeningRunJobOptions = {}): Promise<string | null> {
    this.screeningRuns.push(SCREENING_PRICE_PAYLOAD.parse({ screening_run_id: runId }).screening_run_id ?? '');
    this.screeningPriorities.push(SCREENING_PRIORITY.parse(options.priority ?? 0));
    return Promise.resolve(`memory-screening-${String(this.screeningRuns.length)}`);
  }

  /** How many holds are open (neither committed nor rolled back): tests read that the wrapper leaves none. */
  open = 0;

  /** Validates as a send does; the jobs join `jobs` at commit() and never after rollback(). */
  hold(sends: readonly PendingSend[]): Promise<HeldSends> {
    const held = sends.map((send) => ({ type: send.type, payload: parsePayload(send.type, send.payload) as unknown }));
    let settled = false;
    const settle = () => {
      const first = !settled;
      settled = true;
      this.open -= first ? 1 : 0;
      return first;
    };
    this.open += 1;
    return Promise.resolve({
      commit: () => {
        if (settle()) {
          this.jobs.push(...held);
        }
        return Promise.resolve();
      },
      rollback: () => {
        settle();
        return Promise.resolve();
      },
    });
  }
}
