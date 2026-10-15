import { type DocumentStatus, type KeyProvider, type PracticeCipher, type PracticeScope, type ScopeClient, documentObjectKey, loadPracticeCipher } from '@tp/db/runtime';
import { type CodeListProvider, type ParseReport, isLoadable, parse835Stream } from '@tp/edi835';

import type { JobContext, JobHandler } from '../jobs/handlers';
import { queueMonitoring } from '../monitor/trigger';
import type { DocumentStore } from '../storage/documents';
import { publishedCodeLists } from './code-lists';
import { loadTransaction } from './loader';
import { type ParseReportRow, type TransactionResult, documentStatus, parseReportRow, positionKey, resultOf } from './report';

/**
 * The parse_835 job (PRD 10, Pipeline steps 3 to 10; PRD 5, J4; test matrix PAR-06 to PAR-30, JOB-01
 * and JOB-02; docs/adr/0027). Queued by intake for each clean 835, keyed by its document (one job per
 * practice and document is queued or active at a time). For the job's one practice:
 *
 * 1. The document is read under the job's policies, from its own key under the practice's prefix (the
 *    database generates it; the job refuses anything else) and opened with the practice's key, so a
 *    job never reads another practice's file. A document already reported, not waiting for parse, or
 *    without a clean malware scan, is left as it is: a replayed job has no further effect (JOB-01).
 * 2. A first pass parses the whole document as a stream for the parser's final report (an envelope
 *    error after a transaction set can still hold it), and checks the bytes are the ones intake
 *    hashed.
 * 3. A second pass, in one database transaction under the practice's policy (PRD 10, step 9), loads
 *    each transaction set the report leaves loadable as the stream reaches it, one set in memory at a
 *    time whatever the file's size, and writes the parse report and the document's receipt status
 *    last. A held set is never loaded and never blocks the others or another document; the document's
 *    remittances appear together with its report, or not at all.
 *
 * A failed attempt leaves nothing behind, so the next one starts over. A failure on the last of the
 * three attempts marks the document failed (the worker logs the operator alert line and records the
 * run failed, JOB-02), and the Uploads screen offers a retry.
 *
 * Once the document is done (loaded, a duplicate, held, or failed on its last attempt) the job queues
 * the monitoring chain's next step for its practice (monitor, keyed by the document, after a short wait
 * for the rest of its batch; docs/adr/0039). A failure to queue it is logged and never fails the parse:
 * the daily schedule plans the practice again.
 */

type Scope = PracticeScope<ScopeClient>;

export interface ParseServices {
  readonly documents: DocumentStore;
  readonly keys: KeyProvider;
}

/** The statuses a document waits for its parse in (parse_queued: queued by the earlier placeholder). */
const WAITING: readonly DocumentStatus[] = ['scanned', 'parse_queued'];

interface DocumentRow {
  readonly id: string;
  readonly kind: string;
  readonly s3_key: string;
  readonly sha256: string | null;
  readonly scan_status: string;
  readonly status: DocumentStatus;
  readonly reported: boolean;
}

/** The document's bytes are not the ones intake recorded: nothing loads from them. */
export class DocumentIntegrityError extends Error {
  override readonly name = 'DocumentIntegrityError';
}

interface Opened {
  readonly row: DocumentRow;
  readonly cipher: PracticeCipher;
  readonly codeLists: CodeListProvider;
}

class DocumentParse {
  constructor(
    private readonly services: ParseServices,
    private readonly context: JobContext,
    private readonly practiceId: string,
    private readonly opened: Opened,
  ) {}

  private chunks(): AsyncIterable<Uint8Array> {
    return this.services.documents.read(this.opened.cipher, this.opened.row.s3_key);
  }

  /** Pass one: the parser's final report, events discarded. */
  private async report(): Promise<ParseReport> {
    for await (const item of parse835Stream(this.chunks(), { codeLists: this.opened.codeLists })) {
      if (item.type === 'report') {
        return item.report;
      }
    }
    // parse835Stream always ends with its report.
    throw new Error('the parser ended without its report');
  }

  /** Pass two, inside the document's transaction: each loadable transaction set as the stream reaches it. */
  private async load(scope: Scope, report: ParseReport): Promise<Map<string, TransactionResult>> {
    const results = new Map<string, TransactionResult>();
    const loadable = new Set(report.transactions.filter((outcome) => outcome.loadable).map((outcome) => positionKey(outcome.position)));
    if (loadable.size === 0) {
      return results;
    }
    for await (const item of parse835Stream(this.chunks(), { codeLists: this.opened.codeLists })) {
      if (item.type !== 'transaction') {
        continue;
      }
      const remittance = item.transaction;
      const key = positionKey(remittance.position);
      if (!loadable.has(key) || !isLoadable(remittance)) {
        continue;
      }
      const load = await loadTransaction({ scope, cipher: this.opened.cipher, practiceId: this.practiceId, documentId: this.opened.row.id }, remittance);
      results.set(key, resultOf(load));
    }
    return results;
  }

  private async record(scope: Scope, row: ParseReportRow): Promise<void> {
    const documentId = this.opened.row.id;
    await scope.client.query(
      `INSERT INTO parse_report (practice_id, source_document_id, outcome, transactions, claims, lines, reversals, held, plb_total_cents, loaded_transactions,
         loaded_claims, loaded_lines, duplicate_transactions, unknown_codes, errors, transaction_outcomes, code_list_release)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (source_document_id) DO NOTHING`,
      [
        this.practiceId,
        documentId,
        row.outcome,
        row.transactions,
        row.claims,
        row.lines,
        row.reversals,
        row.held,
        row.plbTotalCents,
        row.loadedTransactions,
        row.loadedClaims,
        row.loadedLines,
        row.duplicateTransactions,
        row.unknownCodes,
        JSON.stringify(row.errors),
        JSON.stringify(row.transactionOutcomes),
        row.codeListRelease,
      ],
    );
    await scope.client.query('UPDATE source_document SET status = $2 WHERE id = $1 AND status = ANY ($3::text[])', [documentId, documentStatus(row.outcome), WAITING]);
  }

  async run(): Promise<ParseReportRow> {
    const report = await this.report();
    if (report.documentSha256 !== this.opened.row.sha256) {
      throw new DocumentIntegrityError('the stored document is not the bytes intake hashed; nothing loads from it');
    }
    // One transaction for every set the document loads and its report (PRD 10, step 9).
    return this.context.transaction(async (scope) => {
      const row = parseReportRow(report, await this.load(scope, report));
      await this.record(scope, row);
      return row;
    });
  }
}

async function open(context: JobContext, keys: KeyProvider, practiceId: string, documentId: string): Promise<Opened | undefined> {
  return context.transaction(async (scope) => {
    const row = (
      await scope.client.query<DocumentRow>(
        `SELECT d.id, d.kind, d.s3_key, d.sha256, d.scan_status, d.status, EXISTS (SELECT 1 FROM parse_report p WHERE p.source_document_id = d.id) AS reported
           FROM source_document d WHERE d.id = $1`,
        [documentId],
      )
    ).rows[0];
    if (row === undefined) {
      return undefined;
    }
    return { row, cipher: await loadPracticeCipher(scope, keys, practiceId), codeLists: await publishedCodeLists(scope) };
  });
}

/** The parse_835 job's handler. */
export function parseHandler(services: ParseServices): JobHandler<'parse_835'> {
  return async (payload, context) => {
    const practiceId = payload.practice_id;
    const opened = await open(context, services.keys, practiceId, payload.document_id);
    if (opened === undefined) {
      context.logger.warn('parse found no such document', { document_id: payload.document_id, error_code: 'DOCUMENT_NOT_FOUND' });
      return;
    }
    const { row } = opened;
    if (row.kind !== 'x12_835' || row.reported || !WAITING.includes(row.status)) {
      context.logger.info('document was not waiting for parse', { document_id: row.id });
      return;
    }
    if (row.scan_status !== 'clean') {
      // PRD 10, step 2: the malware scan's result must be clean. The database holds the same rule.
      context.logger.warn('parse refused a document without a clean malware scan', { document_id: row.id, error_code: 'SCAN_NOT_CLEAN' });
      return;
    }
    if (row.s3_key !== documentObjectKey(practiceId, row.id)) {
      // The database generates the key from the practice and the document; anything else is refused.
      throw new DocumentIntegrityError('a document is read only from its own key under its practice’s prefix');
    }
    try {
      const reported = await new DocumentParse(services, context, practiceId, opened).run();
      const release = opened.codeLists.release;
      if (reported.outcome === 'loaded') {
        context.logger.info('document parsed and loaded', { document_id: row.id, release_no: release });
      } else if (reported.outcome === 'duplicate') {
        context.logger.info('document parsed: every remittance in it was already loaded', { document_id: row.id, release_no: release });
      } else {
        context.logger.info('document parsed: held, see its parse report', { document_id: row.id, release_no: release });
      }
    } catch (error) {
      if (context.lastAttempt) {
        await context.transaction((scope) => scope.client.query("UPDATE source_document SET status = 'failed' WHERE id = $1 AND status = ANY ($2::text[])", [row.id, WAITING]));
        // No longer on its way: the rest of its batch is planned without it.
        await queueMonitoring(context, practiceId, row.id);
      }
      throw error;
    }
    await queueMonitoring(context, practiceId, row.id);
  };
}
