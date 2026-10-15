import type { Citation } from '../terms';
import { normalizePageText, pageTextHash, quoteOnPage } from './page-text';

/**
 * Evidence resolution (PRD 6, Contract repository: "every rate record resolves to a page"; PRD 7,
 * Rate record review; test matrix CON-04, CON-05): a citation resolves when its document is one of its
 * version's, the document has the page, the quote is on that page's text, and the page text's hash is
 * the one the citation stores. The page text comes from a PageSource: in the web app, the text intake
 * read once and stored sealed (docs/adr/0033); in the worker and in tests, `documentPages` from
 * `@tp/contracts/pages`, which reads a document's bytes in a bounded thread. A PDF's pages, a
 * workbook's sheets and a CSV's row blocks are its pages. A failure names its problem, which the
 * specialist sees beside the field (CON-05), and approval is refused until it resolves.
 */

export const EVIDENCE_PROBLEMS = [
  'not_cited',
  'document_not_in_version',
  'document_unreadable',
  'unsupported_document',
  'not_read_yet',
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

/** A document's page texts, in page order (index 0 is page 1), or why it has none. */
export type Pages = { readonly ok: true; readonly pages: readonly string[] } | { readonly ok: false; readonly problem: EvidenceProblem };

/** Where a resolver finds a document's page texts. */
export interface PageSource {
  pages(documentId: string): Promise<Pages>;
}

export interface EvidenceResolverOptions {
  readonly pages: PageSource;
}

/** Resolves citations against one practice's documents; pages are read once per document per resolver. */
export class EvidenceResolver {
  private readonly cache = new Map<string, Promise<Pages>>();

  constructor(private readonly options: EvidenceResolverOptions) {}

  /** Each page's text of a document, or the problem reading it. */
  pages(documentId: string): Promise<Pages> {
    let pages = this.cache.get(documentId);
    if (pages === undefined) {
      pages = this.options.pages.pages(documentId);
      this.cache.set(documentId, pages);
    }
    return pages;
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
