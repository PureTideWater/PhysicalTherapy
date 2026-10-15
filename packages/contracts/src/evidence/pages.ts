import { Worker } from 'node:worker_threads';

import type { DocumentFormat, ThreadReply, ThreadRequest } from './page-thread';
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
 * - a PDF, a workbook or a CSV is read in its own worker thread (page-thread.ts) under a heap limit,
 *   a cap on the thread's heap and buffers together (polled from this thread, which stays free), a
 *   deadline, and caps on the pages, the page text and a workbook's inflated parts. A document past
 *   any of them is unsupported_document, never read in part; one the reader cannot parse is
 *   document_unreadable;
 * - an image, and the pages of a PDF with no text layer, go to the scan reader (Textract) when one is
 *   configured.
 *
 * This entry imports pdf.js nowhere but in the thread, and the web app never imports this entry.
 */

export interface PageReadLimits {
  /** The largest document read at all (64 MiB). */
  readonly maxBytes: number;
  readonly maxPages: number;
  /** Characters of page text in all. */
  readonly maxTextCharacters: number;
  /** Bytes a workbook's parts may inflate to in all. */
  readonly maxInflatedBytes: number;
  /** The reading thread's heap and buffers together; past it the thread is stopped. */
  readonly maxMemoryBytes: number;
  /** The reading thread's old-generation heap, in MiB (a hard V8 limit). */
  readonly maxHeapMb: number;
  /** How long a document may take to read. */
  readonly timeoutMs: number;
  /** How often the thread's memory is checked. */
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

/** The reading thread failed for a reason of its own (it could not start, or it stopped); not the document's. */
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

/** The thread's module beside this one: TypeScript in the source tree, the bundle's own file in the worker image. */
const THREAD = new URL(import.meta.url.endsWith('.ts') ? './page-thread.ts' : './page-thread.js', import.meta.url);

const REFUSED: ThreadReply = { kind: 'refused', problem: 'unsupported_document' };

/** Reads one document in its own thread, stopping the thread at the first limit it passes. */
export function readInThread(request: ThreadRequest, limits: PageReadLimits): Promise<ThreadReply> {
  return new Promise((resolve, reject) => {
    // No inherited loader flags: Node runs the thread's module itself. Its output is drained, never
    // logged: pdf.js's warnings can carry text from the document.
    const worker = new Worker(THREAD, { execArgv: [], stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: limits.maxHeapMb, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 } });
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(poll);
      clearTimeout(deadline);
      settle();
      void worker.terminate();
    };
    const deadline = setTimeout(() => {
      finish(() => {
        resolve(REFUSED);
      });
    }, limits.timeoutMs);
    const poll = setInterval(() => {
      worker.getHeapStatistics().then(
        (statistics) => {
          if (statistics.used_heap_size + statistics.external_memory > limits.maxMemoryBytes) {
            finish(() => {
              resolve(REFUSED);
            });
          }
        },
        () => undefined,
      );
    }, limits.pollMs);
    worker.once('message', (reply: ThreadReply) => {
      finish(() => {
        resolve(reply);
      });
    });
    worker.once('error', (error: Error & { code?: string }) => {
      finish(() => {
        if (error.code === 'ERR_WORKER_OUT_OF_MEMORY') {
          resolve(REFUSED);
        } else {
          reject(new PageReadError(`the page reader failed: ${error.name}`));
        }
      });
    });
    worker.once('exit', (code) => {
      finish(() => {
        reject(new PageReadError(`the page reader stopped with exit code ${String(code)}`));
      });
    });
    worker.postMessage(request);
  });
}

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
  const reply = await readInThread(
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
