import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DocumentFormat, ReadRefusal, ReaderRequest } from './page-reader';
import type { DocumentSource, PageSource, Pages } from './resolve';
import type { ScannedPageReader } from './scan';
import { normalizePageText } from './page-text';

/**
 * Reading an untrusted document's pages, bounded (`@tp/contracts/pages`; PRD 16, Upload safety; PRD
 * 6, Intake and documents: "size and count limits"; docs/adr/0033). The worker reads each clean
 * contract, exhibit and payer letter once at intake and stores the page text sealed; the web app
 * only ever reads that stored text (it never parses a document). Here:
 *
 * - the format comes from the bytes (a PDF's header, a zip's signature for a workbook) and, for a
 *   CSV, the declared type; anything else, an .xls workbook among them, is unsupported_document;
 * - a PDF, a workbook or a CSV is read in a child process of its own (page-reader.ts) under its own
 *   heap flags, a cap on the process's memory growth (polled from this process, which stays free), a
 *   deadline, and caps on the pages, the page text and a workbook's inflated parts, which this process
 *   applies again to the reply. The child gets an empty environment, an argv of its flags and entry
 *   only, the document's bytes on stdin, and Node's permission model (it reads its own code and writes,
 *   spawns and loads nothing). A document past any limit is unsupported_document, never read in part;
 *   one the reader cannot parse is document_unreadable; the reader's own failure is PageReadError;
 * - an image, and the pages of a PDF with no text layer, go to the scan reader (Textract) when one is
 *   configured.
 *
 * This entry imports pdf.js nowhere (only the child does), and the web app never imports this entry.
 */

export interface PageReadLimits {
  /** The largest document read at all (64 MiB). */
  readonly maxBytes: number;
  readonly maxPages: number;
  /** Characters of page text in all. */
  readonly maxTextCharacters: number;
  /** Bytes a workbook's parts may inflate to in all. */
  readonly maxInflatedBytes: number;
  /** What reading may add to the reader's memory (its resident set over its idle baseline); past it the reader is killed. */
  readonly maxMemoryBytes: number;
  /** The reader's old-generation heap, in MiB (a hard V8 limit, its own process's flag). */
  readonly maxHeapMb: number;
  /** How long a document may take to read. */
  readonly timeoutMs: number;
  /** How often the reader's memory is checked (at least every 100 ms where it is read with ps). */
  readonly pollMs: number;
}

const MIB = 1024 * 1024;

export const PAGE_READ_LIMITS: PageReadLimits = Object.freeze({
  maxBytes: 64 * MIB,
  maxPages: 2_000,
  maxTextCharacters: 16 * MIB,
  maxInflatedBytes: 64 * MIB,
  maxMemoryBytes: 256 * MIB,
  maxHeapMb: 192,
  timeoutMs: 60_000,
  pollMs: 25,
});

/** The reader failed for a reason of its own (it could not start, stopped or broke its protocol); not the document's. Its message names only a code or a signal. */
export class PageReadError extends Error {
  override readonly name = 'PageReadError';
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TEXT_TYPES = new Set(['text/csv', 'text/plain']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/tiff']);

/** Whether the bytes start like a PDF. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * What a document is read as. A zip is read as a workbook when it is declared one or arrives
 * undeclared from a zip upload (application/octet-stream); text is a CSV when it is declared CSV or
 * text, or arrives undeclared and holds no NUL byte.
 */
export function documentFormat(bytes: Uint8Array, contentType: string): DocumentFormat | 'image' | null {
  const undeclared = contentType === 'application/octet-stream';
  if (looksLikePdf(bytes)) {
    return 'pdf';
  }
  if (looksLikeZip(bytes)) {
    return contentType === XLSX_TYPE || undeclared ? 'xlsx' : null;
  }
  if (IMAGE_TYPES.has(contentType)) {
    return 'image';
  }
  if ((TEXT_TYPES.has(contentType) || undeclared) && !bytes.includes(0)) {
    return 'csv';
  }
  return null;
}

/**
 * Where an untrusted document is read: in a process of its own, whose heap its own flags set. infra/test/heap.test.ts
 * refuses a V8 heap flag on any container of the worker image unless this is 'process': a process-wide heap flag
 * overrides a worker thread's resourceLimits on Node 24 (docs/adr/0071).
 */
export const PAGE_READER_ISOLATION = 'process' as const;

/** The reader's reply as this process takes it: the pages and the heap limit the reader ran under, or its refusal. */
export type ChildReply = { readonly kind: 'pages'; readonly pages: string[]; readonly heapSizeLimit: number } | { readonly kind: 'refused'; readonly problem: ReadRefusal };

/** The reader's young generation: 16 MiB semi-spaces, so its heap_size_limit is old + 48 MiB (240 at 192) on any host. */
export const READER_SEMI_SPACE_MB = 16;
/** The reader's stack in KiB: the thread's 4 MiB, less V8's guard (a deeply nested document reads as it did). */
export const READER_STACK_KIB = 3920;
/** The most the reader may hold before it reads a byte (139 to 146 MiB measured, the reader imported); more is its own failure. */
export const READER_BASELINE_MAX_BYTES = 224 * MIB;
/** V8's fixed line on a heap out of memory, looked for in the last READER_STDERR_TAIL_BYTES of the reader's stderr. */
const V8_OUT_OF_MEMORY = 'JavaScript heap out of memory';
const READER_STDERR_TAIL_BYTES = 1024;
/**
 * How long a reader may take to close once it has sent its last frame (it exits as soon as the frame is flushed: a few
 * milliseconds). Past it the reader is killed and its read fails as its own (PageReadError); the deadline and the
 * memory bound stay armed until it has closed, so a reader a document compromised can neither linger nor grow.
 */
export const READER_EXIT_GRACE_MS = 1_000;
/** Where /proc is missing (a developer's Mac), the reader's memory is read with ps at most this often. */
const PS_POLL_MS = 100;

// The frames, as page-reader.ts writes them (its READER_FRAME; pages.test.ts holds the two equal). Not imported:
// page-reader.ts loads pdf.js, which this module never does.
export const READER_FRAME_TYPES = { ready: 0, page: 1, done: 2, refused: 3 } as const;
const FRAME = READER_FRAME_TYPES;
const FRAME_HEADER_BYTES = 5;

/** The reader's entry beside a module: TypeScript in the source tree, the bundle's own file in the worker image. */
export function readerEntry(moduleUrl: string | URL): URL {
  const url = new URL(moduleUrl);
  return new URL(url.pathname.endsWith('.ts') ? './page-reader.ts' : './page-reader.js', url);
}

const READER = readerEntry(import.meta.url);

/**
 * What the reader may read: in the image, its one bundled file; in the source tree (a TypeScript entry), the
 * workspace, through which its pdf.js and yauzl resolve.
 */
function readablePath(entry: URL): string {
  return entry.pathname.endsWith('.ts') ? path.resolve(fileURLToPath(import.meta.url), '../../../../..') : fileURLToPath(entry);
}

/**
 * The reader's node flags, exactly (the infra guard and the tests read this): its own heap (old maxHeapMb, young from
 * 16 MiB semi-spaces), the thread's stack, Node's permission model reading only its code, and no code from strings.
 * Nothing inherited: no NODE_OPTIONS (the environment is empty), no loader, no source maps.
 */
export function readerArgv(limits: PageReadLimits, entry: URL = READER): string[] {
  return [
    `--max-old-space-size=${String(limits.maxHeapMb)}`,
    `--max-semi-space-size=${String(READER_SEMI_SPACE_MB)}`,
    `--stack-size=${String(READER_STACK_KIB)}`,
    '--permission',
    `--allow-fs-read=${readablePath(entry)}`,
    '--disallow-code-generation-from-strings',
  ];
}

const REFUSED: ChildReply = { kind: 'refused', problem: 'unsupported_document' };

/** A process's resident set in bytes, or undefined once it is gone: /proc where there is one, else ps. */
function residentBytes(pid: number): Promise<number | undefined> {
  if (PROC) {
    try {
      const found = /^VmRSS:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${String(pid)}/status`, 'utf8'));
      return Promise.resolve(found === null ? undefined : Number.parseInt(found[1] ?? '', 10) * 1024);
    } catch {
      return Promise.resolve(undefined);
    }
  }
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], { env: NO_ENVIRONMENT }, (error, stdout) => {
      const kib = Number.parseInt(stdout.trim(), 10);
      resolve(error === null && Number.isSafeInteger(kib) ? kib * 1024 : undefined);
    });
  });
}

const PROC = existsSync('/proc/self/status');

/** No variable at all. Typed as an environment because apps/web's Next.js types make NODE_ENV a required one. */
const NO_ENVIRONMENT = {} as NodeJS.ProcessEnv;

/** Reads the reader's frames from its stdout, each body copied once into a buffer of its own length. */
class FrameReader {
  private readonly header = Buffer.alloc(FRAME_HEADER_BYTES);
  private headerFilled = 0;
  private body: Buffer | null = null;
  private bodyFilled = 0;
  private consumed = 0;
  private readonly bound: number;
  private readonly onFrame: (type: number, body: Buffer) => void;
  private readonly onMalformed: () => void;

  constructor(bound: number, onFrame: (type: number, body: Buffer) => void, onMalformed: () => void) {
    this.bound = bound;
    this.onFrame = onFrame;
    this.onMalformed = onMalformed;
  }

  /** False once the reply has passed its bound or broken the framing: nothing more is read. */
  push(chunk: Buffer): boolean {
    let at = 0;
    while (at < chunk.length) {
      if (this.body === null) {
        const take = Math.min(FRAME_HEADER_BYTES - this.headerFilled, chunk.length - at);
        chunk.copy(this.header, this.headerFilled, at, at + take);
        this.headerFilled += take;
        at += take;
        if (this.headerFilled < FRAME_HEADER_BYTES) {
          return true;
        }
        this.consumed += FRAME_HEADER_BYTES;
        const length = this.header.readUInt32BE(1);
        if (length > this.bound - this.consumed) {
          this.onMalformed();
          return false;
        }
        this.body = Buffer.allocUnsafe(length);
        this.bodyFilled = 0;
      }
      const take = Math.min(this.body.length - this.bodyFilled, chunk.length - at);
      chunk.copy(this.body, this.bodyFilled, at, at + take);
      this.bodyFilled += take;
      at += take;
      if (this.bodyFilled === this.body.length) {
        const body = this.body;
        this.consumed += body.length;
        this.body = null;
        this.headerFilled = 0;
        this.onFrame(this.header.readUInt8(0), body);
      }
    }
    return true;
  }
}

/**
 * At most this many readers run at once in a worker process (intake reads one document at a time; the queue makes it a
 * property of the reader, so another caller waits rather than doubling the task's worst case). One child per document,
 * never reused: a reader a document compromised never sees the next one.
 */
export const MAX_READERS = 1;
let running = 0;
const waiting: (() => void)[] = [];

function acquireReader(): Promise<void> {
  if (running < MAX_READERS) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(resolve);
  });
}

function releaseReader(): void {
  const next = waiting.shift();
  if (next === undefined) {
    running -= 1;
  } else {
    next();
  }
}

/**
 * Reads one document in a child process of its own, stopping it at the first limit it passes; one at a time
 * (MAX_READERS), its slot freed only once the child has closed. The deadline counts from the child's start, not while
 * it waits. `entry` is the reader's file (tests start stand-ins from test-support/).
 */
export async function readInChild(request: ReaderRequest, limits: PageReadLimits, entry: URL = READER): Promise<ChildReply> {
  await acquireReader();
  try {
    return await runReader(request, limits, entry);
  } finally {
    releaseReader();
  }
}

/**
 * One child, start to close. Resolves only once the child has closed (exited, every pipe drained: on `exit` the last
 * frames can still be unread), never on the decision. The deadline and the memory bound hold until then, the reply in
 * or not, and a child that has sent its last frame has READER_EXIT_GRACE_MS to close.
 */
function runReader(request: ReaderRequest, limits: PageReadLimits, entry: URL): Promise<ChildReply> {
  if (request.bytes.byteLength > limits.maxBytes) {
    return Promise.resolve(REFUSED);
  }
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      // An empty environment and an argv of flags and the entry only: nothing of the document, the practice or the task.
      child = spawn(process.execPath, [...readerArgv(limits, entry), fileURLToPath(entry)], { cwd: fileURLToPath(new URL('.', entry)), env: NO_ENVIRONMENT, stdio: 'pipe', shell: false, windowsHide: true });
    } catch {
      reject(new PageReadError('the page reader could not start'));
      return;
    }
    LIVE.add(child);
    let verdict: { readonly refused: true } | { readonly refused: false; readonly message: string } | undefined;
    let reply: ChildReply | undefined;
    let baseline: number | undefined;
    let measuring = false;
    let stderrTail = Buffer.alloc(0);
    const pages: string[] = [];
    let characters = 0;
    let settled = false;

    let exitGrace: NodeJS.Timeout | undefined;
    const stop = (): void => {
      clearInterval(poll);
      clearTimeout(deadline);
      clearTimeout(exitGrace);
    };
    /** The first decision stands: the child is killed, and the result given once it has closed. */
    const decide = (decision: NonNullable<typeof verdict>): void => {
      if (verdict !== undefined) {
        return;
      }
      verdict = decision;
      stop();
      child.kill('SIGKILL');
    };
    const refuse = (): void => {
      decide({ refused: true });
    };
    const fail = (message: string): void => {
      decide({ refused: false, message });
    };
    const settle = (outcome: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      stop();
      LIVE.delete(child);
      outcome();
    };

    const deadline = setTimeout(refuse, limits.timeoutMs);
    const poll = setInterval(
      () => {
        // Measured until the child has closed, its reply sent or not.
        if (measuring || verdict !== undefined || child.pid === undefined) {
          return;
        }
        measuring = true;
        void residentBytes(child.pid).then((bytes) => {
          measuring = false;
          if (bytes === undefined) {
            return;
          }
          if (baseline === undefined) {
            if (bytes > READER_BASELINE_MAX_BYTES) {
              fail('the page reader started too large');
            }
          } else if (bytes - baseline > limits.maxMemoryBytes) {
            refuse();
          }
        });
      },
      PROC ? limits.pollMs : Math.max(limits.pollMs, PS_POLL_MS),
    );

    // The last frame is in: the reader has READER_EXIT_GRACE_MS to close, and the deadline and the poll stay armed.
    const awaitExit = (): void => {
      exitGrace = setTimeout(() => {
        fail('the page reader did not exit after its reply');
      }, READER_EXIT_GRACE_MS);
    };

    const send = (): void => {
      const header = Buffer.from(
        JSON.stringify({
          format: request.format,
          byteLength: request.bytes.byteLength,
          maxBytes: limits.maxBytes,
          maxPages: request.maxPages,
          maxTextCharacters: request.maxTextCharacters,
          maxInflatedBytes: request.maxInflatedBytes,
          deadlineMs: limits.timeoutMs,
        }),
        'utf8',
      );
      const length = Buffer.alloc(4);
      length.writeUInt32BE(header.length, 0);
      child.stdin.write(length);
      child.stdin.write(header);
      // The caller's bytes as they are: no copy here.
      child.stdin.end(Buffer.from(request.bytes.buffer, request.bytes.byteOffset, request.bytes.byteLength));
    };

    const onFrame = (type: number, body: Buffer): void => {
      if (verdict !== undefined) {
        return;
      }
      if (reply !== undefined) {
        fail('the page reader sent a malformed reply');
      } else if (baseline === undefined) {
        if (type !== FRAME.ready || body.length > 0 || child.pid === undefined) {
          fail('the page reader sent a malformed reply');
          return;
        }
        measuring = true;
        void residentBytes(child.pid).then((bytes) => {
          measuring = false;
          if (verdict !== undefined) {
            return;
          }
          if (bytes === undefined || bytes > READER_BASELINE_MAX_BYTES) {
            fail(bytes === undefined ? 'the page reader could not be measured' : 'the page reader started too large');
            return;
          }
          baseline = bytes;
          send();
        });
      } else if (type === FRAME.page) {
        const text = body.toString('utf8');
        pages.push(text);
        characters += text.length;
        if (pages.length > request.maxPages || characters > request.maxTextCharacters) {
          refuse();
        }
      } else if (type === FRAME.done && /^\d{1,16}$/.test(body.toString('latin1'))) {
        reply = { kind: 'pages', pages, heapSizeLimit: Number.parseInt(body.toString('latin1'), 10) };
        awaitExit();
      } else if (type === FRAME.refused && (body.toString('latin1') === 'unsupported_document' || body.toString('latin1') === 'document_unreadable')) {
        reply = { kind: 'refused', problem: body.toString('latin1') as ReadRefusal };
        awaitExit();
      } else {
        fail('the page reader sent a malformed reply');
      }
    };

    // The reply's bound: every character at four UTF-8 bytes, each page's frame header, the done frame.
    const bound = request.maxTextCharacters * 4 + (request.maxPages + 2) * FRAME_HEADER_BYTES + 64;
    let received = 0;
    const frames = new FrameReader(bound, onFrame, () => {
      fail('the page reader sent a malformed reply');
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (verdict !== undefined) {
        return;
      }
      received += chunk.length;
      if (received > bound) {
        refuse();
        return;
      }
      frames.push(chunk);
    });
    // Never logged: only V8's fixed out-of-memory line is looked for in its tail.
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = Buffer.from(Buffer.concat([stderrTail, chunk]).subarray(-READER_STDERR_TAIL_BYTES));
    });
    // A child that dies before it reads its request: the write fails with EPIPE, and its exit decides.
    child.stdin.on('error', () => undefined);

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (child.pid === undefined) {
        settle(() => {
          reject(new PageReadError(`the page reader could not start: ${error.code ?? 'error'}`));
        });
      }
    });
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        if (verdict?.refused === true) {
          resolve(REFUSED);
        } else if (verdict !== undefined) {
          reject(new PageReadError(verdict.message));
        } else if (reply !== undefined && code === 0) {
          resolve(reply);
        } else if ((signal === 'SIGABRT' || code === 134) && stderrTail.toString('latin1').includes(V8_OUT_OF_MEMORY)) {
          resolve(REFUSED);
        } else {
          reject(new PageReadError(`the page reader stopped with ${signal === null ? `exit code ${String(code)}` : `signal ${signal}`}`));
        }
      });
    });
  });
}

/** Every reader still running; a worker stopping mid-read leaves none behind. */
const LIVE = new Set<ChildProcessWithoutNullStreams>();
process.once('exit', () => {
  for (const child of LIVE) {
    child.kill('SIGKILL');
  }
});

export interface ReadPagesOptions {
  /** Reads scanned pages; without one, a page with no text layer stays empty (`no_text` when cited). */
  readonly scans?: ScannedPageReader;
  readonly limits?: Partial<PageReadLimits>;
}

/** Each page's text of a document (index 0 is page 1), or why it has none. */
export async function readDocumentPages(document: { readonly bytes: Uint8Array; readonly contentType: string }, options: ReadPagesOptions = {}): Promise<Pages> {
  const limits: PageReadLimits = { ...PAGE_READ_LIMITS, ...options.limits };
  if (document.bytes.length > limits.maxBytes) {
    return { ok: false, problem: 'unsupported_document' };
  }
  const format = documentFormat(document.bytes, document.contentType);
  if (format === null) {
    return { ok: false, problem: 'unsupported_document' };
  }
  if (format === 'image') {
    return options.scans === undefined ? { ok: false, problem: 'unsupported_document' } : { ok: true, pages: await options.scans.pageTexts(document) };
  }
  const reply = await readInChild(
    { format, bytes: document.bytes, maxPages: limits.maxPages, maxTextCharacters: limits.maxTextCharacters, maxInflatedBytes: limits.maxInflatedBytes },
    limits,
  );
  if (reply.kind === 'refused') {
    return { ok: false, problem: reply.problem };
  }
  let texts = reply.pages;
  if (format === 'pdf' && options.scans !== undefined && texts.some((text) => normalizePageText(text) === '')) {
    // A scanned page (or a whole scanned document): Textract reads every page, and its text stands in
    // only where pdf.js found none.
    const scanned = await options.scans.pageTexts(document);
    texts = texts.map((text, index) => (normalizePageText(text) === '' ? (scanned[index] ?? '') : text));
  }
  return { ok: true, pages: texts };
}

/** Pages read from documents' bytes, once per document: what intake runs, and what tests cite against. */
export function documentPages(documents: DocumentSource, options: ReadPagesOptions = {}): PageSource {
  const cache = new Map<string, Promise<Pages>>();
  return {
    pages: (documentId) => {
      let pages = cache.get(documentId);
      if (pages === undefined) {
        pages = documents.read(documentId).then((document) => readDocumentPages(document, options));
        cache.set(documentId, pages);
      }
      return pages;
    },
  };
}
