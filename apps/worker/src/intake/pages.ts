import { Readable } from 'node:stream';

import { serializePageText } from '@tp/contracts';
import { PAGE_READ_LIMITS, type ReadPagesOptions, readDocumentPages } from '@tp/contracts/pages';
import type { Logger } from '@tp/observability';
import { type DocumentKind, type PageTextStatus, type PracticeCipher, type PracticeScope, type ScopeClient, documentPagesKey } from '@tp/db/runtime';

import { type DocumentStore, collect } from '../storage/documents';

/**
 * Intake reads the page text of every clean contract, exhibit and payer letter once, so the web app
 * never parses an uploaded document (PRD 16, Upload safety; docs/adr/0033). The document is read in a
 * child process of its own with its own heap limit (@tp/contracts/pages); its page texts are sealed
 * with the practice's key beside the original (documentPagesKey) before the row says they are ready.
 * A document of no supported kind, or past a limit, is recorded as unsupported_document, one the
 * reader cannot parse as document_unreadable: decisions, not job failures. A reader that fails for its
 * own reasons throws (PageReadError), and the job retries.
 *
 * The text is stored exactly as extracted. A C1 character in it (U+0080 to U+009F) is counted in the log when the
 * pages are stored, and is read as a line break by the letter reader and shown as its Windows-1252 character in the
 * document view, each at its own time: nothing mended is ever stored (Queues item 41; docs/adr/0054).
 */

/** The kinds whose pages a rate record cites. */
export const PAGE_TEXT_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>(['contract', 'exhibit', 'payer_letter']);

export interface PageTextOutcome {
  readonly status: PageTextStatus;
  readonly pageCount: number | null;
}

export interface StoredDocument {
  readonly practiceId: string;
  readonly documentId: string;
  /** The sealed original's object key. */
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

/** Each C1 character (U+0080 to U+009F) of a document's pages and how often it stands there, in code point order. */
export function c1Occurrences(pages: readonly string[]): { readonly codePoint: string; readonly occurrences: number }[] {
  const counts = new Map<number, number>();
  for (const page of pages) {
    for (const [character] of page.matchAll(/[\u0080-\u009f]/g)) {
      const code = character.charCodeAt(0);
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  // The code point is written from its number alone ("U+0085"): no character of the page is in what this returns.
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([code, occurrences]) => ({ codePoint: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`, occurrences }));
}

/** Reads the document's pages and seals them beside it (once: a page text already written is kept). */
export async function readAndStorePages(documents: DocumentStore, cipher: PracticeCipher, document: StoredDocument, options: ReadPagesOptions = {}, logger?: Pick<Logger, 'info'>): Promise<PageTextOutcome> {
  const limit = options.limits?.maxBytes ?? PAGE_READ_LIMITS.maxBytes;
  if (document.sizeBytes > limit) {
    return { status: 'unsupported_document', pageCount: null };
  }
  const bytes = await collect(documents.read(cipher, document.key));
  const pages = await readDocumentPages({ bytes, contentType: document.contentType }, options);
  if (!pages.ok) {
    return { status: pages.problem === 'document_unreadable' ? 'document_unreadable' : 'unsupported_document', pageCount: null };
  }
  const key = documentPagesKey(document.practiceId, document.documentId);
  if (!(await documents.exists(key))) {
    const text = serializePageText(pages.pages);
    await documents.write(cipher, key, Readable.from([text]));
    // What a Windows-1252 byte read as Latin-1 left in the stored text (Queues item 41; MOD-27): the practice, the
    // document, the code point and how often. IDs, a code and a count; never a character of the text or its context.
    for (const { codePoint, occurrences } of c1Occurrences(pages.pages)) {
      logger?.info('page text holds a C1 character', { practice_id: document.practiceId, document_id: document.documentId, control_character_code: codePoint, occurrence_count: occurrences });
    }
  }
  return { status: 'ready', pageCount: pages.pages.length };
}

/** Records how the reading went, in the caller's transaction. */
export async function recordPageText(scope: PracticeScope<ScopeClient>, documentId: string, outcome: PageTextOutcome): Promise<void> {
  await scope.client.query('UPDATE source_document SET page_text_status = $2, page_count = $3 WHERE id = $1', [documentId, outcome.status, outcome.pageCount]);
}
