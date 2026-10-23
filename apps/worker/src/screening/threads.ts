// Aliased: the worker's bundle declares createRequire itself in its banner (build.ts).
import { createRequire as moduleRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { Logger } from '@tp/observability';

/**
 * The screening consumer's worker threads (docs/adr/0062; PR 6b-3, the founder's Q1 (a) of 2026-10-21: one task of
 * 2 vCPU and 4 GiB pricing three screenings at once). One screening's pricing is synchronous JavaScript on one core
 * (job.ts), so three at once in one process need three threads: two runs on one event loop only take turns (the design's
 * run 3). The main thread holds pg-boss, the jobs' heartbeats, the worker's heartbeat and the sweep, and prices nothing,
 * so a busy thread never delays a heartbeat.
 *
 * Each thread is long-lived and prices one run at a time with priceScreeningRun(), unchanged, through its own
 * connections (two, on the screening login), mail sender, logger and release cache: one copy of each release's shared
 * types per thread (#31's "one copy per release" becomes three small copies, 2,184 records each in the scale release;
 * docs/adr/0062). Each runs under a V8 heap limit (a worst-shape screening's thread peaked at 308 MiB before a
 * collection, measured on the scale release), so a thread out of memory fails alone: its job fails, it is replaced, and
 * its run is claimed again (the job's retry, or the sweep once its progress is 2 minutes old).
 *
 * One limit serves every isolate of the process: the container runs node with --max-old-space-size=SCREENING_HEAP_MB
 * (#31's explicit heap limit), and Node gives a worker thread its process's --max-old-space-size whatever
 * resourceLimits asks (measured on Node 24: a thread asking 1,024 MiB under the flag at 512 got 512), so the main
 * thread and each pricing thread hold at most SCREENING_HEAP_MB; resourceLimits asks the same, which holds where no
 * flag is given (the tests, an in-process consumer). The four together stay under 90% of the task's 4,096 MiB
 * (screeningHeapMib()).
 */

/** Screenings priced at once by one consumer task, one thread each: compute.screening.concurrency (Q1 (a)). */
export const SCREENING_THREADS = 3;
/**
 * The old-generation heap of every isolate in the consumer's process, in MiB: the main thread's and each pricing
 * thread's. 4 x 896 = 3,584 MiB, the design's budget (three threads of 1,024 and a main thread of 512), under 90% of the
 * 4,096 MiB task, now that Node gives every thread the process's flag.
 */
export const SCREENING_HEAP_MB = 896;
/** Each pricing thread's old-generation heap, in MiB (resourceLimits.maxOldGenerationSizeMb): the process's own. */
export const SCREENING_THREAD_HEAP_MB = SCREENING_HEAP_MB;
/** The main thread's old-generation heap, in MiB: the process's own. */
export const SCREENING_MAIN_HEAP_MB = SCREENING_HEAP_MB;
/** The node flag that sets it, for the container's command and the capacity harness's process runtime. */
export const SCREENING_MAIN_HEAP_FLAG = `--max-old-space-size=${String(SCREENING_HEAP_MB)}`;

/** The heap one task may hold at most with `threads` threads and its main thread: 4 x 896 = 3,584 MiB at three, under 90% of 4,096. */
export function screeningHeapMib(threads: number = SCREENING_THREADS): number {
  return threads * SCREENING_THREAD_HEAP_MB + SCREENING_MAIN_HEAP_MB;
}

/** What the pool asks a thread: one run, by its opaque ID, under the job that holds it. */
export interface ScreeningThreadRequest {
  readonly runId: string;
  readonly jobId: string;
}

/**
 * What a thread says: it is ready (once, after it has loaded), or how the run it was handed ended. A run whose pricing
 * threw is `failed`, with no message: an error's text can carry SQL or an address, and the job's own failure is enough.
 */
export type ScreeningThreadReply =
  | { readonly kind: 'ready' }
  | { readonly kind: 'priced'; readonly outcome: 'complete' | 'already_complete' | 'not_claimed' | 'failed' }
  | { readonly kind: 'failed' };

/** A thread failed the run it was handed: its pricing threw, it ran out of memory, or it stopped. Fixed text only. */
export class ScreeningThreadError extends Error {
  override readonly name = 'ScreeningThreadError';
}

export interface ScreeningThreadPoolOptions {
  /** How many threads, each pricing one run at a time. */
  readonly size: number;
  /** The thread's module (thread.ts, or the bundle's screening-thread.js). */
  readonly script: URL;
  /** Its settings, as it reads them from workerData. */
  readonly workerData: unknown;
  /** Node options for the thread: none in the bundle; the TypeScript loader in the source tree. */
  readonly execArgv: readonly string[];
  /** Each thread's old-generation heap, in MiB. */
  readonly heapMb?: number;
  readonly logger: Logger;
  /** How long a new thread may take to say it is ready. */
  readonly readyTimeoutMs?: number;
  /** How many replacements in a row may fail to start before the pool gives up. */
  readonly maxRestarts?: number;
}

/** The thread's module and its options: TypeScript beside this file under tsx's loader, or the bundle's own file beside main.js. */
export function screeningThreadScript(): { readonly script: URL; readonly execArgv: readonly string[] } {
  if (import.meta.url.endsWith('.ts')) {
    const loader = pathToFileURL(moduleRequire(import.meta.url).resolve('tsx')).href;
    return { script: new URL('./thread.ts', import.meta.url), execArgv: ['--import', loader] };
  }
  return { script: new URL('./screening-thread.js', import.meta.url), execArgv: [] };
}

/** How a run is handed to the pool: in the waiting tier (Q7: past its account's share or the day's cap) or not. */
export interface ScreeningPriceOptions {
  readonly waiting?: boolean;
}

interface Pending {
  readonly request: ScreeningThreadRequest;
  /** A waiting-tier run, which never takes the last idle thread. */
  readonly waiting: boolean;
  readonly resolve: (outcome: Extract<ScreeningThreadReply, { kind: 'priced' }>['outcome']) => void;
  readonly reject: (error: Error) => void;
}

interface Slot {
  worker: Worker;
  ready: boolean;
  busy: Pending | null;
}

/**
 * A fixed pool of pricing threads. price() hands a run to an idle ready thread or waits for one (pg-boss's local
 * concurrency equals the size, so it rarely waits); a thread that throws or exits fails only the run it held and is
 * replaced. close() stops taking runs, waits for the ones in hand, then ends every thread.
 *
 * The normal tier keeps a thread (Q7; the review of 2026-10-22): a waiting-tier run, an upload past its account's share
 * or the day's cap, is handed a thread only while another ready thread stays idle, so a normal upload that arrives
 * while the waiting tier is being priced starts at once instead of waiting a whole screening (pg-boss never preempts);
 * and a normal run waiting for a thread goes before a waiting-tier one. A pool of one thread keeps none.
 */
export class ScreeningThreadPool {
  private readonly slots: Slot[] = [];
  private readonly queued: Pending[] = [];
  private closing = false;
  private broken: ScreeningThreadError | null = null;
  private restarts = 0;
  private readonly drained: (() => void)[] = [];

  constructor(private readonly options: ScreeningThreadPoolOptions) {}

  /** Starts the threads and resolves once every one is ready; rejects when one cannot start. */
  async start(): Promise<void> {
    const started = Array.from({ length: this.options.size }, () => this.spawn());
    await Promise.all(started.map((slot) => this.whenReady(slot)));
  }

  /** How many threads hold a run now (tests and the gauge). */
  get active(): number {
    return this.slots.filter((slot) => slot.busy !== null).length;
  }

  /** Prices one run in a thread: how it ended, or a ScreeningThreadError when its thread failed it. */
  price(request: ScreeningThreadRequest, options: ScreeningPriceOptions = {}): Promise<Extract<ScreeningThreadReply, { kind: 'priced' }>['outcome']> {
    if (this.closing) {
      return Promise.reject(new ScreeningThreadError('the screening threads are stopping'));
    }
    if (this.broken !== null) {
      return Promise.reject(this.broken);
    }
    return new Promise((resolve, reject) => {
      this.queued.push({ request, waiting: options.waiting === true, resolve, reject });
      this.dispatch();
    });
  }

  /** Stops taking runs, waits for those in hand, then ends every thread. */
  async close(): Promise<void> {
    this.closing = true;
    for (const pending of this.queued.splice(0)) {
      pending.reject(new ScreeningThreadError('the screening threads are stopping'));
    }
    if (this.active > 0) {
      await new Promise<void>((resolve) => {
        this.drained.push(resolve);
      });
    }
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
  }

  private spawn(): Slot {
    const worker = new Worker(this.options.script, {
      workerData: this.options.workerData,
      execArgv: [...this.options.execArgv],
      resourceLimits: { maxOldGenerationSizeMb: this.options.heapMb ?? SCREENING_THREAD_HEAP_MB },
    });
    const slot: Slot = { worker, ready: false, busy: null };
    this.slots.push(slot);
    worker.on('message', (reply: ScreeningThreadReply) => {
      this.onReply(slot, reply);
    });
    worker.on('error', (error: Error & { code?: string }) => {
      // The thread's own error (an uncaught one, or ERR_WORKER_OUT_OF_MEMORY): its code alone, never its text.
      this.options.logger.error('screening thread failed', { error_code: error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'SCREENING_THREAD_OUT_OF_MEMORY' : 'SCREENING_THREAD_FAILED' });
      this.fail(slot);
    });
    worker.on('exit', () => {
      this.fail(slot);
      this.replace(slot);
    });
    return slot;
  }

  private whenReady(slot: Slot): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ScreeningThreadError('a screening thread did not start in time'));
      }, this.options.readyTimeoutMs ?? 30_000);
      const ready = (reply: ScreeningThreadReply) => {
        if (reply.kind === 'ready') {
          clearTimeout(timeout);
          slot.worker.off('exit', exited);
          resolve();
        }
      };
      const exited = () => {
        clearTimeout(timeout);
        slot.worker.off('message', ready);
        reject(new ScreeningThreadError('a screening thread stopped before it was ready'));
      };
      slot.worker.on('message', ready);
      slot.worker.once('exit', exited);
    });
  }

  private onReply(slot: Slot, reply: ScreeningThreadReply): void {
    if (reply.kind === 'ready') {
      slot.ready = true;
      this.restarts = 0;
      this.dispatch();
      return;
    }
    const pending = slot.busy;
    slot.busy = null;
    if (pending !== null) {
      if (reply.kind === 'priced') {
        pending.resolve(reply.outcome);
      } else {
        pending.reject(new ScreeningThreadError('the screening run failed in its thread'));
      }
    }
    this.settle();
  }

  /** Fails the run a thread held, if any. */
  private fail(slot: Slot): void {
    const pending = slot.busy;
    slot.busy = null;
    slot.ready = false;
    pending?.reject(new ScreeningThreadError('the screening thread stopped while it priced the run'));
    this.settle();
  }

  /** Replaces a thread that exited, unless the pool is closing; gives up after too many that never start. */
  private replace(slot: Slot): void {
    const index = this.slots.indexOf(slot);
    if (index >= 0) {
      this.slots.splice(index, 1);
    }
    if (this.closing || this.broken !== null) {
      return;
    }
    this.restarts += 1;
    if (this.restarts > (this.options.maxRestarts ?? 3)) {
      this.broken = new ScreeningThreadError('the screening threads could not be replaced');
      this.options.logger.error('screening threads could not be replaced', { error_code: 'SCREENING_THREADS_BROKEN' });
      for (const pending of this.queued.splice(0)) {
        pending.reject(this.broken);
      }
      return;
    }
    this.options.logger.warn('screening thread replaced', { error_code: 'SCREENING_THREAD_REPLACED' });
    this.spawn();
  }

  /**
   * Hands queued runs to idle ready threads: the normal tier first, in arrival order; a waiting-tier run only while
   * another ready thread would stay idle (in a pool of more than one).
   */
  private dispatch(): void {
    for (;;) {
      const idle = this.slots.filter((slot) => slot.ready && slot.busy === null);
      const slot = idle[0];
      if (slot === undefined || this.queued.length === 0) {
        return;
      }
      let next = this.queued.findIndex((pending) => !pending.waiting);
      if (next < 0) {
        if (this.options.size > 1 && idle.length < 2) {
          return;
        }
        next = 0;
      }
      const [pending] = this.queued.splice(next, 1);
      if (pending === undefined) {
        return;
      }
      slot.busy = pending;
      slot.worker.postMessage(pending.request);
    }
  }

  /** After a run ends: the next waiting run, or, closing with none in hand, the drain. */
  private settle(): void {
    if (this.closing && this.active === 0) {
      for (const resolve of this.drained.splice(0)) {
        resolve();
      }
      return;
    }
    this.dispatch();
  }
}
