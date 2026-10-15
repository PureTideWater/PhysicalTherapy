import { type DocumentSource, EvidenceResolver } from '@tp/contracts';
import { type PracticeCipher, type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type DocumentStore, collect } from '@tp/worker/documents';

/**
 * The cited pages of a practice's contract documents, for the Rate record review screen and the
 * workflow's evidence checks (PRD 6, Contract repository: "every rate record resolves to a page"; PRD
 * 7, Rate record review; docs/adr/0028). A document's original bytes are opened from its sealed object
 * with the practice's cipher in this request (ADR 0018), after the row is read under the practice's
 * policies and audited. Only contract, exhibit and payer-letter documents are read. A document larger
 * than MAX_EVIDENCE_BYTES is not read into memory: it cites as an unsupported document. Text PDFs are
 * read with pdf.js; scanned pages need the Textract reader, which the web server does not run yet.
 */

/** The largest document read whole to cite a page (64 MiB). */
export const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;

interface DocumentRow {
  readonly id: string;
  readonly practice_id: string;
  readonly s3_key: string;
  readonly content_type: string;
  readonly size_bytes: string;
}

export class ContractDocumentMissingError extends Error {
  override readonly name = 'ContractDocumentMissingError';
}

/** The practice's contract documents as evidence reads them. */
export function contractDocuments(scope: PracticeScope<ScopeClient>, store: DocumentStore, cipher: PracticeCipher, practiceId: string, requestId: string): DocumentSource {
  return {
    read: async (documentId) => {
      const [row] = await readWithAudit(
        scope,
        { objectType: 'source_document', purpose: 'contract_evidence', requestId },
        async (client) =>
          (
            await client.query<DocumentRow>(
              `SELECT id, practice_id, s3_key, content_type, size_bytes::text AS size_bytes FROM source_document
                WHERE id = $1 AND practice_id = $2 AND kind IN ('contract', 'exhibit', 'payer_letter') AND scan_status = 'clean'`,
              [documentId, practiceId],
            )
          ).rows,
        (found) => ({ objectId: found.id, practiceId: found.practice_id }),
      );
      if (row === undefined) {
        throw new ContractDocumentMissingError('no clean contract document of this practice has that ID');
      }
      if (BigInt(row.size_bytes) > BigInt(MAX_EVIDENCE_BYTES)) {
        return { bytes: new Uint8Array(0), contentType: 'application/octet-stream' };
      }
      return { bytes: await collect(store.read(cipher, row.s3_key)), contentType: row.content_type };
    },
  };
}

/** An evidence resolver over the practice's contract documents, for one request. */
export function evidenceFor(scope: PracticeScope<ScopeClient>, store: DocumentStore, cipher: PracticeCipher, practiceId: string, requestId: string): EvidenceResolver {
  return new EvidenceResolver({ documents: contractDocuments(scope, store, cipher, practiceId, requestId) });
}
