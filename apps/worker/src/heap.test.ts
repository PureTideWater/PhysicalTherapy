import { type PerformanceEntry, PerformanceObserver, constants } from 'node:perf_hooks';
import { getHeapStatistics, setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Heap from './heap';


const MIB = 1024 * 1024;
const collection = (kind: number) => ({ entryType: 'gc', detail: { kind } }) as unknown as PerformanceEntry;
const MAJOR = collection(constants.NODE_PERFORMANCE_GC_MAJOR);
const MINOR = collection(constants.NODE_PERFORMANCE_GC_MINOR);

/** The module's state is process-wide, so each test takes a fresh copy. */
let heap: typeof Heap;
beforeEach(async () => {
  vi.resetModules();
  heap = await import('./heap');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('jobHeap', () => {
  it('gives the largest live heap after a major collection while the job ran, in whole MiB, and the V8 limit', () => {
    heap.onCollections([MAJOR], () => 100 * MIB);
    const job = heap.jobHeap();
    heap.onCollections([MAJOR], () => 300 * MIB + 1);
    heap.onCollections([MAJOR], () => 200 * MIB);
    expect(job.end()).toEqual({ heapLivePeakMib: 301, heapLimitMib: Math.floor(getHeapStatistics().heap_size_limit / MIB) });
  });

  it('ignores minor collections, which leave garbage in the old generation', () => {
    heap.onCollections([MAJOR], () => 100 * MIB);
    const job = heap.jobHeap();
    heap.onCollections([MINOR], () => 500 * MIB);
    expect(job.end().heapLivePeakMib).toBe(100);
  });

  it('gives a job with no major collection the latest value from before it began', () => {
    heap.onCollections([MAJOR], () => 250 * MIB);
    heap.onCollections([MAJOR], () => 120 * MIB);
    expect(heap.jobHeap().end().heapLivePeakMib).toBe(120);
  });

  it('shows concurrent jobs the whole process heap, each from its own start, and a closed job nothing later', () => {
    heap.onCollections([MAJOR], () => 50 * MIB);
    const first = heap.jobHeap();
    heap.onCollections([MAJOR], () => 400 * MIB);
    heap.onCollections([MAJOR], () => 80 * MIB);
    const second = heap.jobHeap();
    heap.onCollections([MAJOR], () => 150 * MIB);
    expect(first.end().heapLivePeakMib).toBe(400);
    heap.onCollections([MAJOR], () => 450 * MIB);
    expect(second.end().heapLivePeakMib).toBe(450);
    expect(heap.jobHeap().end().heapLivePeakMib).toBe(450);
  });

  it('starts, before any collection, from the heap in use, never from zero', () => {
    const { heapLivePeakMib, heapLimitMib } = heap.jobHeap().end();
    expect(heapLivePeakMib).toBeGreaterThan(0);
    expect(heapLivePeakMib).toBeLessThanOrEqual(heapLimitMib);
  });
});

describe('startHeapWatch', () => {
  it('registers one observer of collections for the process however many start it, ended by the last stop', () => {
    const observe = vi.spyOn(PerformanceObserver.prototype, 'observe');
    const disconnect = vi.spyOn(PerformanceObserver.prototype, 'disconnect');
    const stopFirst = heap.startHeapWatch();
    const stopSecond = heap.startHeapWatch();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith({ entryTypes: ['gc'] });
    stopFirst();
    stopFirst();
    expect(disconnect).not.toHaveBeenCalled();
    stopSecond();
    expect(disconnect).toHaveBeenCalledTimes(1);
    heap.startHeapWatch()();
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('records the live heap after a real major collection, so a job holding memory sees it', async () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const stop = heap.startHeapWatch();
    try {
      gc();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const before = heap.jobHeap().end().heapLivePeakMib;
      const job = heap.jobHeap();
      // About 64 MiB of doubles in the V8 heap (a typed array's bytes would sit outside it), held across the collection.
      const held = Array.from({ length: 64 }, () => new Array<number>(MIB / 8).fill(1.5));
      gc();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const { heapLivePeakMib } = job.end();
      expect(held).toHaveLength(64);
      expect(heapLivePeakMib).toBeGreaterThanOrEqual(before + 60);
    } finally {
      stop();
    }
  });
});
