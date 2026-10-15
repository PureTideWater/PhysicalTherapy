import { Readable } from 'node:stream';

import { serializePageText } from '@tp/contracts';
import { PAGE_READ_LIMITS, type ReadPagesOptions, readDocumentPages } from '@tp/contracts/pages';
import { type DocumentKind, type PageTextStatus, type PracticeCipher, type PracticeScope, type ScopeClient, documentPagesKey } from '@tp/db/runtime';

import { type DocumentStore, collect } from '../storage/documents';

/**
 * Intake reads the page text of every clean contract, exhibit and payer letter once, so the web app
 * never parses an uploaded document (PRD 16, Upload safety; docs/adr/0033). The document is read in a
 * bounded thread (@tp/contracts/pages); its page texts are sealed with the practice's key beside the
 * original (documentPagesKey) before the row says they are ready. A document of no supported kind, or
 * past a limit, is recorded as unsupported_document, one the reader cannot parse as
 * document_unreadable: decisions, not job failures. A thread that fails for its own reasons throws,
 * and the job retries.
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

/** Reads the document's pages and seals them beside it (once: a page text already written is kept). */
export async function readAndStorePages(documents: DocumentStore, cipher: PracticeCipher, document: StoredDocument, options: ReadPagesOptions = {}): Promise<PageTextOutcome> {
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
  }
  return { status: 'ready', pageCount: pages.pages.length };
}

/** Records how the reading went, in the caller's transaction. */
export async function recordPageText(scope: PracticeScope<ScopeClient>, documentId: string, outcome: PageTextOutcome): Promise<void> {
  await scope.client.query('UPDATE source_document SET page_text_status = $2, page_count = $3 WHERE id = $1', [documentId, outcome.status, outcome.pageCount]);
}
