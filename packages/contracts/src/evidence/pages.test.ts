import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { syntheticPdf } from '../testing/synthetic-pdf';
import { READER_FRAME, READER_REQUEST_HEADER_MAX_BYTES, type ReaderRequest, readerRequestHeader } from './page-reader';
import { PAGE_READ_LIMITS, PageReadError, READER_FRAME_TYPES, READER_SEMI_SPACE_MB, readDocumentPages, readInChild, readerArgv, readerEntry } from './pages';
import { deflateBombPdf, syntheticLine } from './test-support/documents';

/**
 * The page reader in a process of its own (docs/adr/0033; infra/lib/heap.ts and docs/adr/0071). Every document here
 * is SYNTHETIC, built in the test. Linux only: the reader's processes are found through /proc, as the memory bound
 * reads them.
 */

const MIB = 1024 * 1024;
const REPO = path.resolve(import.meta.dirname, '../../../..');
const PROBE = path.join(import.meta.dirname, 'test-support/reader-heap.ts');
const STUB = new URL('./test-support/stub-reader.ts', import.meta.url);
const SILENT = new URL('./test-support/stub-silent.ts', import.meta.url);
const PDF = 'application/pdf';

/** V8's heap_size_limit for a process run with these flags. */
function heapLimitWith(flags: readonly string[]): number {
  return Number.parseInt(execFileSync(process.execPath, [...flags, '-p', 'require("node:v8").getHeapStatistics().heap_size_limit'], { encoding: 'utf8', env: {} }), 10);
}

/** The page-reader processes this process has running now: its children run with the reader's heap flags. */
function readerProcesses(): number[] {
  const found: number[] = [];
  for (const task of readdirSync(`/proc/${String(process.pid)}/task`)) {
    let children: string;
    try {
      children = readFileSync(`/proc/${String(process.pid)}/task/${task}/children`, 'utf8');
    } catch {
      continue;
    }
    for (const pid of children.split(' ').filter((word) => word !== '').map(Number)) {
      try {
        if (readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\u0000').includes('--max-semi-space-size=16')) {
          found.push(pid);
        }
      } catch {
        // It exited between the two reads.
      }
    }
  }
  return found;
}

/** Runs a read while watching for reader processes: every one seen, and the most seen at once. */
async function watched<T>(read: () => Promise<T>): Promise<{ readonly result: T; readonly seen: readonly number[]; readonly most: number }> {
  const seen = new Set<number>();
  let most = 0;
  const look = (): void => {
    const now = readerProcesses();
    most = Math.max(most, now.length);
    for (const pid of now) {
      seen.add(pid);
    }
  };
  const timer = setInterval(look, 2);
  try {
    const result = await read();
    return { result, seen: [...seen], most };
  } finally {
    clearInterval(timer);
  }
}

function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/** A read happened in at least one process of its own, and every such process is gone. */
function inItsOwnProcess(seen: readonly number[]): void {
  expect(seen.length, 'the document was read in a process of its own').toBeGreaterThanOrEqual(1);
  for (const pid of seen) {
    expect(gone(pid), `reader process ${String(pid)} is gone`).toBe(true);
  }
}

function pdfOf(pageCount: number, lines: number): Uint8Array {
  return syntheticPdf(Array.from({ length: pageCount }, (_, page) => Array.from({ length: lines }, (_, line) => syntheticLine(page, line))));
}

/** A request for the stand-in reader: its text names what it does. */
function stubRequest(behaviour: string): ReaderRequest {
  return { format: 'csv', bytes: new TextEncoder().encode(behaviour), maxPages: 10, maxTextCharacters: 100_000, maxInflatedBytes: 1024 };
}

describe('the page reader in its own process (ADR 0033)', () => {
  it("keeps today's heap limit under the worker task's planned heap flag (infra/lib/heap.ts)", () => {
    // The task's planned command: node --max-old-space-size=560 --enable-source-maps dist/main.js (heapFlag('worker')).
    const probe = spawnSync(process.execPath, ['--max-old-space-size=560', '--enable-source-maps', '--import', 'tsx', PROBE], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
    expect(probe.status, probe.stderr).toBe(0);
    const measured = JSON.parse(probe.stdout) as { parent: number; reader: number | null; read: boolean };
    expect(measured.read).toBe(true);
    expect(measured.parent).toBe(heapLimitWith(['--max-old-space-size=560']));
    // Today's thread asks old 192 and young 32 (240 MiB); a process-wide flag overrides it (608 MiB measured). The
    // reader's own process gets the same 240 MiB from its own flags, whatever its parent runs with.
    expect(measured.reader).toBe(heapLimitWith([`--max-old-space-size=${String(PAGE_READ_LIMITS.maxHeapMb)}`, '--max-semi-space-size=16']));
    expect(measured.reader).toBeLessThan((PAGE_READ_LIMITS.maxHeapMb + 64) * MIB);
  }, 120_000);

  it('reads each document in a process of its own, gone when the read ends', async () => {
    const { result, seen } = await watched(() => readDocumentPages({ bytes: syntheticPdf([['SYNTHETIC PROVIDER AGREEMENT'], ['SYNTHETIC EXHIBIT A']]), contentType: PDF }));
    expect(result).toEqual({ ok: true, pages: ['SYNTHETIC PROVIDER AGREEMENT', 'SYNTHETIC EXHIBIT A'] });
    inItsOwnProcess(seen);
  }, 60_000);

  it('kills the reader when a decompression bomb passes the memory cap, and this process is untouched', async () => {
    const bomb = await deflateBombPdf(160);
    const before = process.memoryUsage().heapUsed;
    const { result, seen } = await watched(() => readDocumentPages({ bytes: bomb, contentType: PDF }, { limits: { maxMemoryBytes: 64 * MIB } }));
    expect(result).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(64 * MIB);
    inItsOwnProcess(seen);
  }, 60_000);

  it('refuses a 1 GiB bomb under the default limits well within the deadline', async () => {
    const bomb = await deflateBombPdf(1024);
    const started = Date.now();
    const { result, seen } = await watched(() => readDocumentPages({ bytes: bomb, contentType: PDF }));
    expect(result).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(Date.now() - started).toBeLessThan(PAGE_READ_LIMITS.timeoutMs / 4);
    inItsOwnProcess(seen);
  }, 120_000);

  it('kills the reader at the deadline, counted from its start', async () => {
    const pdf = pdfOf(200, 40);
    const { result, seen } = await watched(() => readDocumentPages({ bytes: pdf, contentType: PDF }, { limits: { timeoutMs: 150 } }));
    expect(result).toEqual({ ok: false, problem: 'unsupported_document' });
    inItsOwnProcess(seen);
    expect(await readDocumentPages({ bytes: pdf, contentType: PDF }, { limits: { timeoutMs: 0 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    // A reader that never says it is ready is stopped by the same deadline.
    const silent = await watched(() => readInChild(stubRequest('never read'), { ...PAGE_READ_LIMITS, timeoutMs: 500 }, SILENT));
    expect(silent.result).toEqual({ kind: 'refused', problem: 'unsupported_document' });
    inItsOwnProcess(silent.seen);
  }, 60_000);

  it("names only the code or signal when the reader itself fails: an exit, a crash, a malformed frame", async () => {
    const read = readInChild;
    await expect(read(stubRequest('exit-3'), PAGE_READ_LIMITS, STUB)).rejects.toThrow(new PageReadError('the page reader stopped with exit code 3'));
    await expect(read(stubRequest('segv'), PAGE_READ_LIMITS, STUB)).rejects.toThrow(new PageReadError('the page reader stopped with signal SIGSEGV'));
    const malformed = await read(stubRequest('malformed'), PAGE_READ_LIMITS, STUB).then(
      () => null,
      (error: unknown) => error,
    );
    expect(malformed).toBeInstanceOf(PageReadError);
    expect((malformed as Error).message).toMatch(/^the page reader (sent a malformed reply|stopped with (exit code \d+|signal SIG[A-Z0-9]+))$/);
  }, 60_000);

  it('refuses a document whose reading exhausts the heap, or floods past the reply bound, and stops the reader', async () => {
    const read = readInChild;
    const oom = await watched(() => read(stubRequest('oom'), PAGE_READ_LIMITS, STUB));
    expect(oom.result).toEqual({ kind: 'refused', problem: 'unsupported_document' });
    inItsOwnProcess(oom.seen);
    const flood = await watched(() => read({ ...stubRequest('flood'), maxPages: 5, maxTextCharacters: 3_000 }, PAGE_READ_LIMITS, STUB));
    expect(flood.result).toEqual({ kind: 'refused', problem: 'unsupported_document' });
    inItsOwnProcess(flood.seen);
  }, 60_000);

  it('gives the reader no environment, no argument but its entry, and no file, process, thread or addon', async () => {
    const read = readInChild;
    const saved = { ...process.env };
    // SYNTHETIC values: what the worker task holds and the reader must never see.
    Object.assign(process.env, { AWS_ACCESS_KEY_ID: 'AKIASYNTHETIC000000', AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: '/v2/synthetic', DATABASE_URL: 'postgres://synthetic@localhost/synthetic', NODE_OPTIONS: '--max-old-space-size=560' });
    try {
      const reply = await read(stubRequest('inspect'), PAGE_READ_LIMITS, STUB);
      expect(reply.kind).toBe('pages');
      const seen = JSON.parse(reply.kind === 'pages' ? (reply.pages[0] ?? '') : '{}') as Record<string, unknown>;
      expect(seen.env).toEqual([]);
      expect(seen.argv).toEqual([process.execPath, decodeURIComponent(STUB.pathname)]);
      expect(seen.execArgv).toEqual(readerArgv(PAGE_READ_LIMITS, STUB));
      expect(seen).toMatchObject({ write: 'ERR_ACCESS_DENIED', environ: 'ERR_ACCESS_DENIED', etc: 'ERR_ACCESS_DENIED', spawn: 'ERR_ACCESS_DENIED', worker: 'ERR_ACCESS_DENIED', addon: 'ERR_DLOPEN_DISABLED' });
    } finally {
      for (const name of Object.keys(process.env)) {
        if (!(name in saved)) {
          Reflect.deleteProperty(process.env, name);
        }
      }
      Object.assign(process.env, saved);
    }
  }, 60_000);

  it('runs one reader at a time in this process, each read giving what it gives alone', async () => {
    const documents = [pdfOf(30, 40), pdfOf(10, 40), pdfOf(20, 40)];
    const alone = [];
    for (const bytes of documents) {
      alone.push(await readDocumentPages({ bytes, contentType: PDF }));
    }
    const { result, seen, most } = await watched(() => Promise.all(documents.map((bytes) => readDocumentPages({ bytes, contentType: PDF }))));
    expect(result).toEqual(alone);
    expect(seen).toHaveLength(3);
    expect(most).toBe(1);
    inItsOwnProcess(seen);
  }, 60_000);
});

describe("the reader's command and frames", () => {
  it('starts the reader with its own heap, stack and permissions, and nothing inherited', () => {
    const entry = new URL('file:///app/dist/page-reader.js');
    expect(readerArgv(PAGE_READ_LIMITS, entry)).toEqual([
      '--max-old-space-size=192',
      `--max-semi-space-size=${String(READER_SEMI_SPACE_MB)}`,
      '--stack-size=3920',
      '--permission',
      '--allow-fs-read=/app/dist/page-reader.js',
      '--disallow-code-generation-from-strings',
    ]);
    // In the source tree the reader reads the workspace, through which pdf.js and yauzl resolve.
    expect(readerArgv(PAGE_READ_LIMITS)).toContain(`--allow-fs-read=${REPO}`);
    expect(readerEntry('file:///app/dist/main.js').href).toBe('file:///app/dist/page-reader.js');
    expect(readerEntry(new URL('./pages.ts', import.meta.url)).pathname).toMatch(/\/packages\/contracts\/src\/evidence\/page-reader\.ts$/);
  });

  it('reads the frames page-reader.ts writes', () => {
    // pages.ts keeps its own copy (it never imports pdf.js); the two stay equal.
    expect(READER_FRAME_TYPES).toEqual(READER_FRAME);
  });

  it('is the format and the caps, numbers and an enum only, within its bound', () => {
    const header = { format: 'pdf', byteLength: 10, maxBytes: 64 * MIB, maxPages: 2_000, maxTextCharacters: 16 * MIB, maxInflatedBytes: 64 * MIB, deadlineMs: 60_000 };
    expect(readerRequestHeader(JSON.stringify(header))).toEqual(header);
    expect(JSON.stringify(header).length).toBeLessThan(READER_REQUEST_HEADER_MAX_BYTES);
    expect(readerRequestHeader(JSON.stringify({ ...header, format: 'xls' }))).toBeNull();
    expect(readerRequestHeader(JSON.stringify({ ...header, byteLength: 64 * MIB + 1 }))).toBeNull();
    expect(readerRequestHeader(JSON.stringify({ ...header, maxPages: -1 }))).toBeNull();
    expect(readerRequestHeader(JSON.stringify({ ...header, deadlineMs: '60000' }))).toBeNull();
    expect(readerRequestHeader(JSON.stringify({ ...header, maxTextCharacters: Math.SQRT2 }))).toBeNull();
    expect(readerRequestHeader('not json')).toBeNull();
    expect(readerRequestHeader('null')).toBeNull();
  });
});
