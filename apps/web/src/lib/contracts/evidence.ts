import { EvidenceResolver, type PageSource, type Pages, parsePageText } from '@tp/contracts';
import { type PageTextStatus, type PracticeCipher, type PracticeScope, type ScopeClient, documentPagesKey, readWithAudit } from '@tp/db/runtime';
import { type DocumentStore, collect } from '@tp/worker/documents';

/**
 * The cited pages of a practice's contract documents, for the Rate record review screen and the
 * workflow's evidence checks (PRD 6, Contract repository: "every rate record resolves to a page"; PRD
 * 7, Rate record review; docs/adr/0028 and 0033). The web app never parses an uploaded document: the
 * worker read each clean contract, exhibit and payer letter once at intake, in a bounded thread, and
 * sealed its page texts with the practice's key beside the original. Here the row is read under the
 * practice's policies and audited, and the stored page text is opened with the practice's cipher in
 * this request (ADR 0018). A document intake has not read yet cites as not_read_yet; one it refused
 * keeps the reason it recorded (unsupported_document, document_unreadable).
 */

interface DocumentRow {
  readonly id: string;
  readonly practice_id: string;
  readonly page_text_status: PageTextStatus | null;
  readonly page_count: number | null;
}

export class ContractDocumentMissingError extends Error {
  override readonly name = 'ContractDocumentMissingError';
}

/** The stored page text did not match its row: a store or database fault, never evidence. */
export class StoredPageTextError extends Error {
  override readonly name = 'StoredPageTextError';
}

/** The page texts intake stored for the practice's contract documents. */
export function storedPages(scope: PracticeScope<ScopeClient>, store: DocumentStore, cipher: PracticeCipher, practiceId: string, requestId: string): PageSource {
  return {
    pages: async (documentId): Promise<Pages> => {
      const [row] = await readWithAudit(
        scope,
        { objectType: 'source_document', purpose: 'contract_evidence', requestId },
        async (client) =>
          (
            await client.query<DocumentRow>(
              `SELECT id, practice_id, page_text_status, page_count FROM source_document
                WHERE id = $1 AND practice_id = $2 AND kind IN ('contract', 'exhibit', 'payer_letter') AND scan_status = 'clean'`,
              [documentId, practiceId],
            )
          ).rows,
        (found) => ({ objectId: found.id, practiceId: found.practice_id }),
      );
      if (row === undefined) {
        throw new ContractDocumentMissingError('no clean contract document of this practice has that ID');
      }
      if (row.page_text_status === null) {
        return { ok: false, problem: 'not_read_yet' };
      }
      if (row.page_text_status !== 'ready') {
        return { ok: false, problem: row.page_text_status };
      }
      const pages = parsePageText(await collect(store.read(cipher, documentPagesKey(practiceId, documentId))));
      if (pages.length !== row.page_count) {
        throw new StoredPageTextError('the stored page text does not have the pages its document records');
      }
      return { ok: true, pages };
    },
  };
}

/** An evidence resolver over the practice's contract documents, for one request. */
export function evidenceFor(scope: PracticeScope<ScopeClient>, store: DocumentStore, cipher: PracticeCipher, practiceId: string, requestId: string): EvidenceResolver {
  return new EvidenceResolver({ pages: storedPages(scope, store, cipher, practiceId, requestId) });
}
