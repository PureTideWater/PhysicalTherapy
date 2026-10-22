import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SCREENING_MAIN_HEAP_FLAG,
  SCREENING_MAIN_HEAP_MB,
  SCREENING_THREAD_HEAP_MB,
  SCREENING_THREADS,
  ScreeningThreadError,
  ScreeningThreadPool,
  screeningHeapMib,
  screeningThreadScript,
} from './threads';

/**
 * The screening consumer's thread pool (threads.ts; docs/adr/0062), with stand-in threads that price nothing: a run is
 * handed to an idle thread, three at once and the fourth when one frees; a thread that throws, stops or runs out of
 * memory fails only the run it held and is replaced; close() waits for the runs in hand; a thread that never starts
 * fails the pool's start. The real thread prices against PostgreSQL in consumer.db.test.ts.
 */

let dir = '';
let script: URL;
let broken: URL;

/** A stand-in thread: `wait:<ms>` replies after that long, `throw` replies failed, `die` stops, `oom` fills its heap. */
const STAND_IN = `
import { parentPort, threadId } from 'node:worker_threads';
parentPort.on('message', async (request) => {
  const [kind, value] = request.runId.split(':');
  if (kind === 'die') { process.exit(3); }
  if (kind === 'oom') { const held = []; for (;;) { held.push(new Array(1e6).fill(threadId)); } }
  if (kind === 'throw') { parentPort.postMessage({ kind: 'failed' }); return; }
  await new Promise((resolve) => setTimeout(resolve, Number(value ?? '0')));
  parentPort.postMessage({ kind: 'priced', outcome: request.jobId === 'not-claimed' ? 'not_claimed' : 'complete' });
});
parentPort.postMessage({ kind: 'ready' });
`;

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

function pool(options: { readonly size?: number; readonly heapMb?: number; readonly script?: URL } = {}) {
  const { lines, logger } = capture();
  return { lines, pool: new ScreeningThreadPool({ size: options.size ?? 3, script: options.script ?? script, execArgv: [], workerData: null, heapMb: options.heapMb ?? 64, logger, readyTimeoutMs: 10_000 }) };
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'screening-threads-'));
  writeFileSync(path.join(dir, 'stand-in.mjs'), STAND_IN);
  writeFileSync(path.join(dir, 'broken.mjs'), "throw new Error('a module that cannot load');\n");
  script = pathToFileURL(path.join(dir, 'stand-in.mjs'));
  broken = pathToFileURL(path.join(dir, 'broken.mjs'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the screening threads’ sizes (Q1 (a); #31’s explicit heap limit)', () => {
  it('prices three at once, each thread under 1,024 MiB and the main thread under 512, together under 90% of the 4,096 MiB task', () => {
    expect(SCREENING_THREADS).toBe(3);
    expect(SCREENING_THREAD_HEAP_MB).toBe(1024);
    expect(SCREENING_MAIN_HEAP_MB).toBe(512);
    expect(SCREENING_MAIN_HEAP_FLAG).toBe('--max-old-space-size=512');
    expect(screeningHeapMib()).toBe(3584);
    expect(screeningHeapMib()).toBeLessThan(0.9 * 4096);
  });

  it('runs the thread from TypeScript under tsx’s loader in the source tree', () => {
    const thread = screeningThreadScript();
    expect(thread.script.pathname).toMatch(/\/apps\/worker\/src\/screening\/thread\.ts$/);
    expect(thread.execArgv).toEqual(['--import', expect.stringMatching(/^file:\/\/.*\/tsx\/dist\/loader\.mjs$/) as string]);
  });
});

describe('ScreeningThreadPool', () => {
  it('hands each run to an idle thread, three at once, and the fourth when one frees', async () => {
    const { pool: threads } = pool();
    await threads.start();
    const started = Date.now();
    const runs = ['wait:400', 'wait:400', 'wait:400', 'wait:400'].map((runId, index) => threads.price({ runId, jobId: index === 3 ? 'not-claimed' : `job-${String(index)}` }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(threads.active).toBe(3);
    expect(await Promise.all(runs)).toEqual(['complete', 'complete', 'complete', 'not_claimed']);
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(750);
    expect(took).toBeLessThan(3_000);
    expect(threads.active).toBe(0);
    await threads.close();
  });

  it('fails only the run whose thread failed it, stopped or ran out of memory, replaces that thread and goes on', async () => {
    const { pool: threads, lines } = pool({ heapMb: 32 });
    await threads.start();
    const beside = threads.price({ runId: 'wait:600', jobId: 'beside' });
    await expect(threads.price({ runId: 'throw', jobId: 'a' })).rejects.toThrow(ScreeningThreadError);
    await expect(threads.price({ runId: 'die', jobId: 'b' })).rejects.toThrow('the screening thread stopped while it priced the run');
    await expect(threads.price({ runId: 'oom', jobId: 'c' })).rejects.toThrow(ScreeningThreadError);
    expect(await beside).toBe('complete');
    // Replaced: three runs at once again.
    expect(await Promise.all([1, 2, 3].map((index) => threads.price({ runId: 'wait:50', jobId: `after-${String(index)}` })))).toEqual(['complete', 'complete', 'complete']);
    expect(lines.filter((line) => line.level !== 'info').map((line) => line.error_code)).toEqual(
      expect.arrayContaining(['SCREENING_THREAD_REPLACED', 'SCREENING_THREAD_OUT_OF_MEMORY']),
    );
    // Codes only: no error's text reaches a line.
    expect(lines.every((line) => Object.keys(line).every((key) => ['time', 'level', 'msg', 'error_code'].includes(key)))).toBe(true);
    await threads.close();
  });

  it('waits for the runs in hand when it closes, refuses new ones, and ends every thread', async () => {
    const { pool: threads } = pool({ size: 2 });
    await threads.start();
    const inHand = threads.price({ runId: 'wait:300', jobId: 'in-hand' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closing = threads.close();
    await expect(threads.price({ runId: 'wait:0', jobId: 'late' })).rejects.toThrow('the screening threads are stopping');
    expect(await inHand).toBe('complete');
    await closing;
    expect(threads.active).toBe(0);
  });

  it('fails to start when a thread cannot load, and gives up after replacements that never start', async () => {
    const { pool: threads, lines } = pool({ size: 1, script: broken });
    await expect(threads.start()).rejects.toThrow(ScreeningThreadError);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await expect(threads.price({ runId: 'wait:0', jobId: 'never' })).rejects.toThrow('the screening threads could not be replaced');
    expect(lines.map((line) => line.error_code)).toContain('SCREENING_THREADS_BROKEN');
    await threads.close();
  });
});
