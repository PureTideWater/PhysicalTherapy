import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SCREENING_MAIN_HEAP_FLAG as WORKER_MAIN_HEAP_FLAG,
  SCREENING_MAIN_HEAP_MB as WORKER_MAIN_HEAP_MB,
  SCREENING_THREAD_HEAP_MB,
  SCREENING_THREADS,
  screeningHeapMib as workerHeapMib,
} from '../../apps/worker/src/screening/threads';
import { COMMANDS } from '../lib/constructs/compute';
import { ENVIRONMENTS, environmentSettings } from '../lib/environments';
import { SCREENING_HEAP_SHARE, SCREENING_MAIN_HEAP_FLAG, SCREENING_MAIN_HEAP_MB, SCREENING_STOP_TIMEOUT_SECONDS, screeningHeapMib, screeningSlots } from '../lib/screening';

/**
 * The screening consumer's size against the worker that runs in it (docs/adr/0062; PR 6b-3; the plan's G3): its threads'
 * heap limits and the main thread's, read from the worker's own constants, stay under 90% of the task's memory, so a
 * thread that runs out of memory fails alone and the task is never killed for it; and the task runs as many threads as
 * the worker starts.
 */
describe.each(ENVIRONMENTS)('%s: the screening consumer\'s size', (environment) => {
  const screening = environmentSettings(environment).compute.screening;

  it('runs as many screenings at once as the worker has threads, and the web counts that many slots', () => {
    expect(screening.concurrency).toBe(SCREENING_THREADS);
    expect(screeningSlots(screening)).toBe(screening.desiredCount * SCREENING_THREADS);
  });

  it('holds three threads and the main thread, 896 MiB each, under 90% of the task\'s 4,096 MiB (3,584 of 3,686.4)', () => {
    const heaps = screeningHeapMib(screening, SCREENING_THREAD_HEAP_MB);
    expect(heaps).toBe(workerHeapMib(screening.concurrency));
    // Node gives each thread the process's own flag, so a thread's limit is the main thread's.
    expect(SCREENING_THREAD_HEAP_MB).toBe(SCREENING_MAIN_HEAP_MB);
    expect(heaps).toBe(4 * 896);
    expect(heaps).toBeLessThan(SCREENING_HEAP_SHARE * screening.memoryMiB);
    expect(SCREENING_HEAP_SHARE * screening.memoryMiB).toBeCloseTo(3686.4, 5);
  });
});

describe('the screening consumer\'s command against the worker', () => {
  it('gives the main thread the worker\'s own heap limit', () => {
    expect(SCREENING_MAIN_HEAP_MB).toBe(WORKER_MAIN_HEAP_MB);
    expect(SCREENING_MAIN_HEAP_FLAG).toBe(WORKER_MAIN_HEAP_FLAG);
    expect(COMMANDS.screening).toContain(WORKER_MAIN_HEAP_FLAG);
  });

  it('waits for the worker\'s graceful stop: it drains 110 s and exits by itself at 115 s, inside the task\'s 120 s', () => {
    const main = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/main.ts'), 'utf8');
    const drain = /SCREENING_SHUTDOWN_MS = (\d[\d_]*)/.exec(main)?.[1];
    const exit = /SCREENING_FORCE_EXIT_MS = (\d[\d_]*)/.exec(main)?.[1];
    expect(drain, 'the consumer\'s drain in main.ts').toBeDefined();
    expect(exit, 'the consumer\'s forced exit in main.ts').toBeDefined();
    expect(Number((drain ?? '').replaceAll('_', ''))).toBeLessThan(Number((exit ?? '').replaceAll('_', '')));
    expect(Number((exit ?? '').replaceAll('_', ''))).toBeLessThan(SCREENING_STOP_TIMEOUT_SECONDS * 1000);
    expect(SCREENING_STOP_TIMEOUT_SECONDS).toBe(120);
  });
});
