import type { Citation } from '../terms';
import { normalizePageText, pageTextHash, quoteOnPage } from './page-text';
import { DocumentUnreadableError, looksLikePdf, pdfPageTexts } from './pdf';
import type { ScannedPageReader } from './scan';

/**
 * Evidence resolution (PRD 6, Contract repository: "every rate record resolves to a page"; PRD 7,
 * Rate record review; test matrix CON-04, CON-05): a citation resolves when its document is one of its
 * version's, the document has the page, the quote is on that page's text, and the page text's hash is
 * the one the citation stores. Text PDFs are read with pdf.js; pages without a text layer are read by
 * the scan reader (Textract) when one is configured. A failure names its problem, which the
 * specialist sees beside the field (CON-05), and approval is refused until it resolves.
 */

export const EVIDENCE_PROBLEMS = [
  'not_cited',
  'document_not_in_version',
  'document_unreadable',
  'unsupported_document',
  'no_text',
  'page_missing',
  'quote_not_on_page',
  'hash_mismatch',
] as const;
export type EvidenceProblem = (typeof EVIDENCE_PROBLEMS)[number];

export type EvidenceResolution =
  | { readonly resolved: true; readonly page: number; readonly pageCount: number; readonly hash: string }
  | { readonly resolved: false; readonly problem: EvidenceProblem; readonly pageCount?: number };

/** The original bytes of one of the practice's documents (opened from its sealed object by the caller). */
export interface DocumentSource {
  read(documentId: string): Promise<{ readonly bytes: Uint8Array; readonly contentType: string }>;
}

export interface EvidenceResolverOptions {
  readonly documents: DocumentSource;
  /** Reads scanned pages; without one, a page with no text layer cannot be evidence (`no_text`). */
  readonly scans?: ScannedPageReader;
}

type Pages = { readonly ok: true; readonly pages: readonly string[] } | { readonly ok: false; readonly problem: EvidenceProblem };

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/tiff']);

/** Resolves citations against one practice's documents; pages are read once per document per resolver. */
export class EvidenceResolver {
  private readonly cache = new Map<string, Promise<Pages>>();

  constructor(private readonly options: EvidenceResolverOptions) {}

  /** Each page's text of a document, or the problem reading it. */
  pages(documentId: string): Promise<Pages> {
    let pages = this.cache.get(documentId);
    if (pages === undefined) {
      pages = this.read(documentId);
      this.cache.set(documentId, pages);
    }
    return pages;
  }

  private async read(documentId: string): Promise<Pages> {
    const document = await this.options.documents.read(documentId);
    if (!looksLikePdf(document.bytes)) {
      if (IMAGE_TYPES.has(document.contentType) && this.options.scans !== undefined) {
        return { ok: true, pages: await this.options.scans.pageTexts(document) };
      }
      return { ok: false, problem: 'unsupported_document' };
    }
    let texts: string[];
    try {
      texts = await pdfPageTexts(document.bytes);
    } catch (error) {
      if (error instanceof DocumentUnreadableError) {
        return { ok: false, problem: 'document_unreadable' };
      }
      throw error;
    }
    if (texts.some((text) => normalizePageText(text) === '') && this.options.scans !== undefined) {
      // A scanned page (or a whole scanned document): Textract reads every page, and its text stands
      // in only where pdf.js found none.
      const scanned = await this.options.scans.pageTexts(document);
      texts = texts.map((text, index) => (normalizePageText(text) === '' ? (scanned[index] ?? '') : text));
    }
    return { ok: true, pages: texts };
  }

  /** The citation for a quote on a page, with the page's hash; or why it cannot be one. */
  async cite(documentId: string, page: number, quote: string, versionDocuments: readonly string[]): Promise<{ readonly cited: true; readonly citation: Citation } | { readonly cited: false; readonly problem: EvidenceProblem }> {
    const text = await this.pageText(documentId, page, versionDocuments);
    if (!text.ok) {
      return { cited: false, problem: text.problem };
    }
    if (!quoteOnPage(quote, text.text)) {
      return { cited: false, problem: 'quote_not_on_page' };
    }
    return { cited: true, citation: { document_id: documentId, page, quote, hash: pageTextHash(text.text) } };
  }

  /** Whether a stored citation still resolves to its page. */
  async resolve(citation: Citation | null, versionDocuments: readonly string[]): Promise<EvidenceResolution> {
    if (citation === null) {
      return { resolved: false, problem: 'not_cited' };
    }
    const text = await this.pageText(citation.document_id, citation.page, versionDocuments);
    if (!text.ok) {
      return text.pageCount === undefined ? { resolved: false, problem: text.problem } : { resolved: false, problem: text.problem, pageCount: text.pageCount };
    }
    if (!quoteOnPage(citation.quote, text.text)) {
      return { resolved: false, problem: 'quote_not_on_page', pageCount: text.pageCount };
    }
    const hash = pageTextHash(text.text);
    if (hash !== citation.hash) {
      return { resolved: false, problem: 'hash_mismatch', pageCount: text.pageCount };
    }
    return { resolved: true, page: citation.page, pageCount: text.pageCount, hash };
  }

  private async pageText(
    documentId: string,
    page: number,
    versionDocuments: readonly string[],
  ): Promise<{ readonly ok: true; readonly text: string; readonly pageCount: number } | { readonly ok: false; readonly problem: EvidenceProblem; readonly pageCount?: number }> {
    if (!versionDocuments.includes(documentId)) {
      return { ok: false, problem: 'document_not_in_version' };
    }
    const pages = await this.pages(documentId);
    if (!pages.ok) {
      return pages;
    }
    const text = Number.isInteger(page) && page >= 1 ? pages.pages[page - 1] : undefined;
    if (text === undefined) {
      return { ok: false, problem: 'page_missing', pageCount: pages.pages.length };
    }
    if (normalizePageText(text) === '') {
      return { ok: false, problem: 'no_text', pageCount: pages.pages.length };
    }
    return { ok: true, text, pageCount: pages.pages.length };
  }
}
