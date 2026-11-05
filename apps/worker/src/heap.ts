import { type PerformanceEntry, PerformanceObserver, constants } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';

/**
 * The worker's live heap (docs/adr/0083, D19). The quantity that crashes the worker
 * is V8's heap, and a sampled `heapUsed` counts garbage not yet collected, so the worker keeps the heap in use just after
 * each major (full) collection: the live heap of the whole process. One observer serves the process, so jobs that run
 * at once each see the whole heap, which is what decides whether any of them crashes.
 *
 * The limit is read from V8 (`heap_size_limit`), never from infra/lib/heap.ts: this file is reached from worker.ts,
 * which the screening-capacity closure watches, and no closure file imports infra/lib/heap.ts.
 */

const MIB = 1024 * 1024;

/** One open job's view: the largest live heap seen since it began. */
export interface JobHeap {
  /** Closes the handle and gives the job's peak and the heap limit, both in MiB. */
  end(): { readonly heapLivePeakMib: number; readonly heapLimitMib: number };
}

interface OpenHandle {
  peakBytes: number;
}

let observer: PerformanceObserver | undefined;
let watchers = 0;
let latestLiveBytes: number | undefined;
const open = new Set<OpenHandle>();

function liveBytesNow(): number {
  return getHeapStatistics().used_heap_size;
}

function recordLive(bytes: number): void {
  latestLiveBytes = bytes;
  for (const handle of open) {
    if (bytes > handle.peakBytes) {
      handle.peakBytes = bytes;
    }
  }
}

function isMajor(entry: PerformanceEntry): boolean {
  const detail = (entry as PerformanceEntry & { detail?: { kind?: number } }).detail;
  return detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR;
}

/** Handles the entries of a batch of collections: a major one records the heap in use after it. */
export function onCollections(entries: readonly PerformanceEntry[], readLive: () => number = liveBytesNow): void {
  if (entries.some(isMajor)) {
    recordLive(readLive());
  }
}

/**
 * Starts the process-wide observer of major collections, once however many workers start it, and returns its stop:
 * the observer ends with the last stop. Until the first major collection, the latest value is the heap in use when the
 * watch began (garbage included, so never below the live heap).
 */
export function startHeapWatch(): () => void {
  watchers += 1;
  if (observer === undefined) {
    latestLiveBytes ??= liveBytesNow();
    observer = new PerformanceObserver((list) => {
      onCollections(list.getEntries());
    });
    observer.observe({ entryTypes: ['gc'] });
  }
  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    watchers -= 1;
    if (watchers === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

/**
 * Opens a job's handle. A job with no major collection while it ran gives the latest value from before it began; with
 * no watch ever started, the heap in use when it began.
 */
export function jobHeap(): JobHeap {
  latestLiveBytes ??= liveBytesNow();
  const handle: OpenHandle = { peakBytes: latestLiveBytes };
  open.add(handle);
  return {
    end: () => {
      open.delete(handle);
      return {
        // Rounded up, so a peak just over a line never reads under it; the limit is rounded down for the same reason.
        heapLivePeakMib: Math.ceil(handle.peakBytes / MIB),
        heapLimitMib: Math.floor(getHeapStatistics().heap_size_limit / MIB),
      };
    },
  };
}
