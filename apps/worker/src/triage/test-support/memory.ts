import type { PracticeScope, ScopeClient } from '@tp/db';

/**
 * For the tests (CAS-41.2, SUITE-CAP-1a; docs/adr/0083): what a reader holds on the heap while it runs and once it has
 * answered, measured as intake.large.db.test.ts measures the zip's path: in the test file's own worker process (the db
 * project's forks run one file each, so no other file's work shares the heap), after two full collections (the db
 * project runs with --expose-gc, vitest.config.ts), sampled every SAMPLE_MS from the end of the last sample. Only the
 * heap is counted here (`heapUsed`); the buffers outside it (`arrayBuffers`, the report's CSV arena) are checked apart.
 */

/** Between one memory sample's end and the next one's start. */
export const SAMPLE_MS = 250;

/** The heap in use now and the buffers outside it, after two full collections: garbage V8 has yet to collect is not held. */
export function held(): { readonly heap: number; readonly buffers: number } {
  const collect = globalThis.gc;
  if (collect === undefined) {
    throw new Error('this test measures memory after full collections: the db project runs with --expose-gc (vitest.config.ts)');
  }
  collect();
  collect();
  const memory = process.memoryUsage();
  return { heap: memory.heapUsed, buffers: memory.arrayBuffers };
}

export interface Measured<S> {
  /** What `summarize` kept of the answer. */
  readonly summary: S;
  /** The largest growth of the heap over the baseline, sampled while the reader ran and once after it answered. */
  readonly peakBytes: number;
  /** The heap's growth once the reader answered, the answer held. */
  readonly answeredBytes: number;
  /** The buffers' growth outside the heap then. */
  readonly answeredBuffers: number;
}

/** A scope whose every query samples the heap as it is sent and as it answers (see measure). */
export type Watch = (scope: PracticeScope<ScopeClient>) => PracticeScope<ScopeClient>;

const bound = <T extends object>(target: T, key: string | symbol): unknown => {
  const value: unknown = Reflect.get(target, key, target);
  return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
};

/**
 * Runs `read` and measures it against the baseline taken just before it: the heap sampled every SAMPLE_MS while it runs,
 * at every query a watched scope sends and answers (the points between a reader's steps, where a batch's rows are in
 * hand, whatever the timer's phase), and once more after it answers, with the answer still held (for the report, the
 * point before its CSV is written). Only `summarize`'s summary of the answer leaves this function, so no answer is still
 * held when the next measurement takes its baseline (a caller's frame that kept one would count it against the next).
 */
export async function measure<T, S>(read: (watch: Watch) => Promise<T>, summarize: (answer: T) => S | Promise<S>): Promise<Measured<S>> {
  const baseline = held();
  let peak = 0;
  const sample = () => {
    peak = Math.max(peak, held().heap - baseline.heap);
  };
  const watch: Watch = (scope) => {
    const client = new Proxy(scope.client, {
      get(target, key) {
        if (key !== 'query') {
          return bound(target, key);
        }
        return async (...args: unknown[]) => {
          sample();
          const answer: unknown = await (target.query as (...query: unknown[]) => Promise<unknown>).apply(target, args);
          sample();
          return answer;
        };
      },
    });
    return new Proxy(scope, { get: (target, key) => (key === 'client' ? client : bound(target, key)) });
  };
  let sampler = setTimeout(function tick() {
    sample();
    sampler = setTimeout(tick, SAMPLE_MS);
  }, SAMPLE_MS);
  let answer: T;
  try {
    answer = await read(watch);
  } finally {
    clearTimeout(sampler);
  }
  const answered = held();
  return {
    summary: await summarize(answer),
    peakBytes: Math.max(peak, answered.heap - baseline.heap),
    answeredBytes: answered.heap - baseline.heap,
    answeredBuffers: answered.buffers - baseline.buffers,
  };
}

/** Bytes per added unit between two sizes, rounded to a byte: the growth the bounds hold. */
export const perAdded = (small: { readonly units: number; readonly bytes: number }, large: { readonly units: number; readonly bytes: number }): number =>
  Math.round((large.bytes - small.bytes) / (large.units - small.units));
