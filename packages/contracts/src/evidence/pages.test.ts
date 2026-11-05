import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { syntheticPdf } from '../testing/synthetic-pdf';
import { READER_FRAME, READER_REQUEST_HEADER_MAX_BYTES, type ReaderRequest, readerRequestHeader } from './page-reader';
import { PAGE_READ_LIMITS, PageReadError, READER_FRAME_TYPES, READER_SEMI_SPACE_MB, readDocumentPages, readInChild, readerArgv, readerCommand, readerEntry } from './pages';
import { deflateBombPdf, syntheticLine } from './test-support/documents';

/**
 * The page reader in a process of its own (docs/adr/0033; infra/lib/heap.ts and docs/adr/0071). Every document here
 * is SYNTHETIC, built in the test. Linux only: the reader's processes are found through /proc, as the memory bound
 * reads them.
 */

const MIB = 1024 * 1024;
const REPO = path.resolve(import.meta.dirname, '../../../..');
const PROBE = path.join(import.meta.dirname, 'test-support/reader-heap.ts');
const CORE_PROBE = path.join(import.meta.dirname, 'test-support/core-probe.ts');
const STUB = new URL('./test-support/stub-reader.ts', import.meta.url);
const SILENT = new URL('./test-support/stub-silent.ts', import.meta.url);
const FAT = new URL('./test-support/stub-fat.ts', import.meta.url);
const FAT_UNREADY = new URL('./test-support/stub-fat-unready.ts', import.meta.url);
const EXIT_PROBE = path.join(import.meta.dirname, 'test-support/exit-probe.ts');
const READER = new URL('./page-reader.ts', import.meta.url);
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
/** A process's peak resident set so far (VmHWM), or undefined once it is gone. */
function peakBytes(pid: number): number | undefined {
  try {
    const found = /^VmHWM:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'));
    return found === null ? undefined : Number.parseInt(found[1] ?? '', 10) * 1024;
  } catch {
    return undefined;
  }
}

/** Runs a read while watching for reader processes: every one seen, the most seen at once, and the highest peak resident set any reached. */
async function watched<T>(read: () => Promise<T>): Promise<{ readonly result: T; readonly seen: readonly number[]; readonly most: number; readonly peak: number }> {
  const seen = new Set<number>();
  let most = 0;
  let peak = 0;
  const look = (): void => {
    const now = readerProcesses();
    most = Math.max(most, now.length);
    for (const pid of now) {
      seen.add(pid);
      peak = Math.max(peak, peakBytes(pid) ?? 0);
    }
  };
  const timer = setInterval(look, 2);
  try {
    const result = await read();
    return { result, seen: [...seen], most, peak };
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

/** A process that has exited (a zombie no one has reaped yet counts: it runs nothing). */
function dead(pid: number): boolean {
  try {
    return /^State:\s+Z/m.test(readFileSync(`/proc/${String(pid)}/status`, 'utf8'));
  } catch {
    return true;
  }
}

async function until(condition: () => boolean, ms: number): Promise<boolean> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

/** The real reader started by hand with readerArgv: its frames, its stderr and its exit, for what pages.ts never shows. */
function readDirectly(bytes: Uint8Array): Promise<{ readonly frames: { type: number; body: string }[]; readonly stderr: string; readonly code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...readerArgv(PAGE_READ_LIMITS), decodeURIComponent(READER.pathname)], { env: {}, stdio: 'pipe' });
    let out = Buffer.alloc(0);
    let stderr = '';
    let sent = false;
    child.stdout.on('data', (chunk: Buffer) => {
      out = Buffer.concat([out, chunk]);
      if (!sent && out.length >= 5) {
        sent = true;
        const header = Buffer.from(JSON.stringify({ format: 'pdf', byteLength: bytes.length, maxBytes: PAGE_READ_LIMITS.maxBytes, maxPages: 100, maxTextCharacters: 100_000, maxInflatedBytes: MIB, deadlineMs: 30_000 }));
        const length = Buffer.alloc(4);
        length.writeUInt32BE(header.length, 0);
        child.stdin.end(Buffer.concat([length, header, bytes]));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('close', (code) => {
      const frames: { type: number; body: string }[] = [];
      for (let at = 0; at + 5 <= out.length; ) {
        const length = out.readUInt32BE(at + 1);
        frames.push({ type: out.readUInt8(at), body: out.subarray(at + 5, at + 5 + length).toString('utf8') });
        at += 5 + length;
      }
      resolve({ frames, stderr, code });
    });
  });
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

describe('the page reader in its own process (ADR 0033; test matrix SEC-24)', () => {
  it("keeps today's heap limit under the worker task's planned heap flag (infra/lib/heap.ts)", () => {
    // The task's planned command: node --max-old-space-size=560 --enable-source-maps dist/main.js (heapFlag('worker')).
    const probe = spawnSync(process.execPath, ['--max-old-space-size=560', '--enable-source-maps', '--import', 'tsx', PROBE], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
    expect(probe.status, probe.stderr).toBe(0);
    const measured = JSON.parse(probe.stdout) as { parent: number; reader: number | null; read: boolean };
    expect(measured.read).toBe(true);
    expect(measured.parent).toBe(heapLimitWith(['--max-old-space-size=560']));
    // The old worker thread asked old 192 and young 32 (240 MiB); a process-wide flag overrode it (608 MiB measured). The
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

  it('refuses a 1 GiB bomb under the default limits well within the deadline, its growth held to the cap', async () => {
    // The reader's peak reading a small SYNTHETIC PDF: about its ready footprint.
    const small = await watched(() => readDocumentPages({ bytes: syntheticPdf([['SYNTHETIC PROVIDER AGREEMENT']]), contentType: PDF }));
    expect(small.peak).toBeGreaterThan(0);
    const bomb = await deflateBombPdf(1024);
    const started = Date.now();
    const { result, seen, peak } = await watched(() => readDocumentPages({ bytes: bomb, contentType: PDF }));
    expect(result).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(Date.now() - started).toBeLessThan(PAGE_READ_LIMITS.timeoutMs / 4);
    inItsOwnProcess(seen);
    // Killed within one poll of passing the cap: its growth over that footprint stays under the cap plus what one poll
    // can add, and the small read's peak sits up to about 36 MiB under the ready baseline the cap counts from (370 MiB
    // over 109 measured; 96 allowed). A child with no cap took the same bomb to 2,357 MiB.
    expect(peak - small.peak, `peak ${String(Math.round(peak / MIB))} MiB over ${String(Math.round(small.peak / MIB))}`).toBeLessThan(PAGE_READ_LIMITS.maxMemoryBytes + 96 * MIB);
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

  it("applies the page and character caps again to the reply, whatever the reader's own caps did", async () => {
    // The stand-in ignores the request's caps, as a reader a document compromised would; each of its pages is about 1,017
    // characters, so these replies stay far under the reply's byte bound and only the parent's own count can refuse them.
    const read = readInChild;
    expect(await read(stubRequest('many 10'), PAGE_READ_LIMITS, STUB)).toMatchObject({ kind: 'pages', pages: { length: 10 } });
    const pages = await watched(() => read(stubRequest('many 11'), PAGE_READ_LIMITS, STUB));
    expect(pages.result, 'one page past maxPages').toEqual({ kind: 'refused', problem: 'unsupported_document' });
    inItsOwnProcess(pages.seen);
    const characters = await watched(() => read({ ...stubRequest('many 5'), maxTextCharacters: 5_000 }, PAGE_READ_LIMITS, STUB));
    expect(characters.result, 'past maxTextCharacters').toEqual({ kind: 'refused', problem: 'unsupported_document' });
    inItsOwnProcess(characters.seen);
    expect(await read({ ...stubRequest('many 4'), maxTextCharacters: 5_000 }, PAGE_READ_LIMITS, STUB)).toMatchObject({ kind: 'pages', pages: { length: 4 } });
  }, 60_000);

  it("refuses a reply frame past the reply's bound before reading its body, and this process is untouched", async () => {
    const read = readInChild;
    const request = stubRequest('');
    // pages.ts's bound: every character at four UTF-8 bytes, each page's frame header, the done frame; less what came
    // before this frame (the ready frame and this frame's own header).
    const room = request.maxTextCharacters * 4 + (request.maxPages + 2) * 5 + 64 - 10;
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown): void => {
      uncaught.push(error);
    };
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUncaught);
    try {
      for (const length of [room + 1, 1024 * MIB, 0xffff_ffff]) {
        const before = process.memoryUsage().rss;
        const started = Date.now();
        const past = await watched(() =>
          read(stubRequest(`header ${String(length)}`), PAGE_READ_LIMITS, STUB).then(
            (reply) => reply,
            (error: unknown) => error,
          ),
        );
        expect(past.result, `a frame of ${String(length)} bytes`).toBeInstanceOf(PageReadError);
        expect((past.result as Error).message).toBe('the page reader sent a malformed reply');
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(process.memoryUsage().rss - before, 'no body buffer was taken').toBeLessThan(64 * MIB);
        inItsOwnProcess(past.seen);
      }
      // A frame of exactly the room left is read, and its text is past the character cap: refused, never in part.
      const atBound = await watched(() => read(stubRequest(`header ${String(room)}`), PAGE_READ_LIMITS, STUB));
      expect(atBound.result).toEqual({ kind: 'refused', problem: 'unsupported_document' });
      inItsOwnProcess(atBound.seen);
    } finally {
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onUncaught);
    }
    expect(uncaught).toEqual([]);
  }, 60_000);

  it('keeps the reader bounded after its last frame: one that does not exit, or grows, is stopped and frees its slot', async () => {
    const read = readInChild;
    for (const [behaviour, expected] of [
      ['done-hang', new PageReadError('the page reader did not exit after its reply')],
      ['refused-hang', new PageReadError('the page reader did not exit after its reply')],
      ['done-grow', { kind: 'refused', problem: 'unsupported_document' }],
    ] as const) {
      const started = Date.now();
      const hung = watched(() =>
        read(stubRequest(behaviour), PAGE_READ_LIMITS, STUB).then(
          (reply) => reply,
          (error: unknown) => error,
        ),
      );
      // A SYNTHETIC CSV queued behind it (one reader at a time) must still be read.
      const queued = readDocumentPages({ bytes: new TextEncoder().encode('SYNTHETIC,QUEUED\n'), contentType: 'text/csv' });
      const { result, seen } = await hung;
      if (expected instanceof PageReadError) {
        expect(result, behaviour).toBeInstanceOf(PageReadError);
        expect((result as Error).message, behaviour).toBe(expected.message);
      } else {
        expect(result, behaviour).toEqual(expected);
      }
      expect(Date.now() - started, `${behaviour} settles far inside the deadline`).toBeLessThan(10_000);
      inItsOwnProcess(seen);
      expect(await queued, behaviour).toEqual({ ok: true, pages: ['SYNTHETIC\tQUEUED'] });
    }
  }, 60_000);

  it('gives the pages of a reader that exited at once while this process was held past the exit grace', async () => {
    // The worker's loop held 1.2 s at a time (past READER_EXIT_GRACE_MS) from the check phase, right after the poll that
    // took the reader's frames: its exit and its end of stdout are then still waiting when the grace timer is due.
    for (let run = 0; run < 6; run += 1) {
      let holding = true;
      const hold = (): void => {
        if (!holding) {
          return;
        }
        const until = Date.now() + 1_200;
        while (Date.now() < until) {
          // Held.
        }
        setTimeout(() => setImmediate(hold), 5);
      };
      setImmediate(hold);
      const reply = await readInChild({ ...stubRequest('many 20'), maxPages: 100, maxTextCharacters: MIB }, PAGE_READ_LIMITS, STUB)
        .then(
          (result) => (result.kind === 'pages' ? result.pages.length : result),
          (error: unknown) => (error as Error).message,
        )
        .finally(() => {
          holding = false;
        });
      expect(reply, `run ${String(run)}`).toBe(20);
    }
  }, 60_000);

  it('lets a crashed reader write no core file, whatever core limit its parent has', (context) => {
    // A core of the reader holds the document's bytes and text. The kernel writes one where core_pattern says, and a
    // relative pattern ('core' here) lands in the crashed process's working directory.
    const pattern = readFileSync('/proc/sys/kernel/core_pattern', 'utf8').trim();
    const isCore = (name: string): boolean => /^core(\.\d+)?$/.test(name);
    const scratch = mkdtempSync(path.join(tmpdir(), 'tp-core-'));
    try {
      // The control: a plain node crashing under the same raised limit does dump here, so a missing core below is the
      // reader's guard and not the host's.
      spawnSync('/bin/sh', ['-c', 'ulimit -c unlimited && exec "$@"', 'control', process.execPath, '-e', 'process.kill(process.pid, "SIGSEGV")'], { cwd: scratch, env: {} });
      if (!readdirSync(scratch).some(isCore)) {
        context.skip(`this host writes no core file here (core_pattern ${pattern.startsWith('|') ? 'pipes to a program' : 'is not relative'}), so there is nothing to look for`);
      }
      const places = [scratch, path.join(import.meta.dirname, 'test-support'), import.meta.dirname, REPO, '/'];
      const coresNow = (): string[] =>
        places.flatMap((place) => {
          try {
            return readdirSync(place, { withFileTypes: true })
              .filter((entry) => entry.isFile() && isCore(entry.name))
              .map((entry) => path.join(place, entry.name));
          } catch {
            return [];
          }
        });
      for (const file of readdirSync(scratch)) {
        rmSync(path.join(scratch, file), { force: true });
      }
      const before = new Set(coresNow());
      const probe = spawnSync('/bin/sh', ['-c', 'ulimit -c unlimited && exec "$@"', 'probe', process.execPath, '--import', 'tsx', CORE_PROBE], { cwd: REPO, encoding: 'utf8', timeout: 60_000 });
      expect(probe.status, probe.stderr).toBe(0);
      expect(JSON.parse(probe.stdout)).toEqual({ segv: 'the page reader stopped with signal SIGSEGV', abort: 'the page reader stopped with signal SIGABRT', oom: 'refused' });
      const written = coresNow().filter((file) => !before.has(file));
      for (const file of written) {
        rmSync(file, { force: true });
      }
      expect(written, 'core files the crashed readers wrote (deleted)').toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 120_000);

  it('starts every reader unable to write a core file on any host: a core limit of 0, soft and hard, and its directory /', async () => {
    // The crash test above runs only where the host writes cores as files; these are the guard itself, read from /proc
    // while a stand-in reader waits.
    const read = readInChild(stubRequest('silent'), { ...PAGE_READ_LIMITS, timeoutMs: 20_000 }, STUB).then(
      (reply) => reply,
      (error: unknown) => error,
    );
    let pid: number | undefined;
    const isNode = (candidate: number): boolean => {
      try {
        // After the shell's exec: the reader's own node, not the shell that started it.
        return readFileSync(`/proc/${String(candidate)}/cmdline`, 'utf8').split('\u0000')[0] === process.execPath;
      } catch {
        return false;
      }
    };
    expect(await until(() => (pid = readerProcesses().find(isNode)) !== undefined, 15_000), 'the reader is running').toBe(true);
    const reader = pid ?? 0;
    try {
      const limit = /^Max core file size\s+(\S+)\s+(\S+)\s+bytes\s*$/m.exec(readFileSync(`/proc/${String(reader)}/limits`, 'utf8'));
      expect(limit?.slice(1), 'the core limit, soft and hard').toEqual(['0', '0']);
      expect(readlinkSync(`/proc/${String(reader)}/cwd`), 'the working directory').toBe('/');
    } finally {
      process.kill(reader, 'SIGKILL');
    }
    expect(await read).toEqual(new PageReadError('the page reader stopped with signal SIGKILL'));
  }, 60_000);

  it("fails the read as the reader's own when it exits non-zero after its reply, sends a frame after it, or aborts", async () => {
    const read = readInChild;
    await expect(read(stubRequest('done-exit-1'), PAGE_READ_LIMITS, STUB)).rejects.toThrow(new PageReadError('the page reader stopped with exit code 1'));
    await expect(read(stubRequest('page-done-extra'), PAGE_READ_LIMITS, STUB)).rejects.toThrow(new PageReadError('the page reader sent a malformed reply'));
    // SIGABRT without V8's out-of-memory line is a crash of the reader's own, not a document past its heap.
    await expect(read(stubRequest('abort'), PAGE_READ_LIMITS, STUB)).rejects.toThrow(new PageReadError('the page reader stopped with signal SIGABRT'));
  }, 60_000);

  it('fails a reader that starts too large as its own, never widening its bound', async () => {
    const fat = await watched(() =>
      readInChild(stubRequest('never read'), { ...PAGE_READ_LIMITS, timeoutMs: 5_000 }, FAT).then(
        (reply) => reply,
        (error: unknown) => error,
      ),
    );
    expect(fat.result).toEqual(new PageReadError('the page reader started too large'));
    inItsOwnProcess(fat.seen);
    // Each of the two checks alone. With no poll before the deadline, the ready frame's own measure fails it at once.
    const started = Date.now();
    const atReady = await watched(() =>
      readInChild(stubRequest('never read'), { ...PAGE_READ_LIMITS, pollMs: 30_000, timeoutMs: 10_000 }, FAT).then(
        (reply) => reply,
        (error: unknown) => error,
      ),
    );
    expect(atReady.result, 'measured at its ready frame').toEqual(new PageReadError('the page reader started too large'));
    expect(Date.now() - started, 'well before the deadline').toBeLessThan(5_000);
    inItsOwnProcess(atReady.seen);
    // One that never says it is ready is failed by the poll, before the deadline would refuse it.
    const unready = await watched(() =>
      readInChild(stubRequest('never read'), { ...PAGE_READ_LIMITS, timeoutMs: 10_000 }, FAT_UNREADY).then(
        (reply) => reply,
        (error: unknown) => error,
      ),
    );
    expect(unready.result, 'measured by the poll before any ready frame').toEqual(new PageReadError('the page reader started too large'));
    inItsOwnProcess(unready.seen);
  }, 60_000);

  it('gives every frame a reader wrote before it exited: the result waits for close, not exit', async () => {
    // About 4 MiB of frames written at once, then an exit: the pipe still holds the last of them when the process has
    // exited. Run a few times, since which event comes first is the loop's choice.
    for (let run = 0; run < 10; run += 1) {
      // This process's loop held up now and then, so the child's exit and its last bytes are ready at the same turn.
      const busy = setInterval(() => {
        const until = Date.now() + 30;
        while (Date.now() < until) {
          // Held.
        }
      }, 37);
      const reply = await readInChild({ ...stubRequest('many 4000'), maxPages: 4_000, maxTextCharacters: 8 * MIB }, PAGE_READ_LIMITS, STUB).finally(() => {
        clearInterval(busy);
      });
      expect(reply.kind === 'pages' ? reply.pages.length : reply, `run ${String(run)}`).toBe(4_000);
    }
  }, 60_000);

  it('kills a running reader when the worker exits mid-read', async () => {
    const probe = spawnSync(process.execPath, ['--import', 'tsx', EXIT_PROBE], { cwd: REPO, encoding: 'utf8', timeout: 30_000 });
    expect(probe.status, probe.stderr).toBe(0);
    const pid = Number.parseInt(probe.stdout.trim(), 10);
    expect(Number.isSafeInteger(pid), probe.stdout).toBe(true);
    try {
      // The stand-in has no orphan check of its own: only the exit handler stops it, before the worker is gone.
      expect(await until(() => dead(pid), 500), `reader ${String(pid)} is gone with its worker`).toBe(true);
    } finally {
      if (!dead(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    }
  }, 60_000);

  it('stops a reader whose parent has gone, on its own, when its loop is free', async () => {
    // The reader under a shell that is then killed: its stdin is a pipe from a sleep that outlives the shell, so it
    // waits for a request that never comes until its orphan check sees its parent change.
    const shell = spawn('/bin/sh', ['-c', 'sleep 20 | "$@" & echo $! >&2; exec sleep 60', 'orphan', process.execPath, ...readerArgv(PAGE_READ_LIMITS), decodeURIComponent(READER.pathname)], { env: {}, stdio: 'pipe' });
    let stderr = '';
    shell.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    let ready = false;
    shell.stdout.on('data', () => {
      ready = true;
    });
    expect(await until(() => ready && /^\d+\n/.test(stderr), 20_000), 'the reader said it was ready').toBe(true);
    const pid = Number.parseInt(/^(\d+)\n/.exec(stderr)?.[1] ?? '', 10);
    try {
      expect(dead(pid)).toBe(false);
      shell.kill('SIGKILL');
      expect(await until(() => dead(pid), 5_000), `orphaned reader ${String(pid)} stopped itself`).toBe(true);
    } finally {
      if (!dead(pid)) {
        process.kill(pid, 'SIGKILL');
      }
      shell.stdin.destroy();
    }
  }, 60_000);

  it("writes nothing of a damaged document to its stderr or among its frames, whatever pdf.js makes of it", async () => {
    // SYNTHETIC: an unknown operator named in the content and a broken cross-reference, both of which pdf.js reports
    // with the document's own words when it is allowed to speak.
    const damaged = Buffer.from(syntheticPdf([['SYNTHETIC PROVIDER AGREEMENT']]))
      .toString('latin1')
      .replace('Tj', 'SYNTHETICOPERATOR Tj')
      .replace(/startxref\n\d+/, 'startxref\n12');
    const bytes = new Uint8Array(Buffer.from(damaged, 'latin1'));
    const direct = await readDirectly(bytes);
    expect(direct.code).toBe(0);
    expect(direct.frames.map((entry) => entry.type)).toEqual([READER_FRAME.ready, READER_FRAME.page, READER_FRAME.done]);
    expect(direct.stderr).not.toMatch(/SYNTHETIC/);
    // Only the runtime's and pdf.js's fixed lines as it loads, before the reader reads a byte.
    expect(direct.stderr.split('\n').filter((line) => line !== '' && !/^Warning: Cannot (load|polyfill) /.test(line))).toEqual([]);
    expect(await readDocumentPages({ bytes, contentType: PDF })).toEqual({ ok: true, pages: [direct.frames[1]?.body] });
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
    // Through the shell that pins its core limit at 0 and then execs node in its place, with nothing else.
    expect(readerCommand(PAGE_READ_LIMITS, entry)).toEqual({ file: '/bin/sh', args: ['-c', 'ulimit -c 0 && unset PWD && exec "$@"', 'page-reader', process.execPath, ...readerArgv(PAGE_READ_LIMITS, entry), '/app/dist/page-reader.js'] });
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
