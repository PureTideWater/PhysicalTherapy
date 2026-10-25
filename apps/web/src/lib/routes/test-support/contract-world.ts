import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  EvidenceResolver,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  approveRateRecordField,
  approveVersion,
  citeDisputeWindow,
  createContract,
  createDraftVersion,
  serializePageText,
  signOffVersion,
  verifyDisputeWindow,
} from '@tp/contracts';
import { readDocumentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { type DatabaseClient, type DatabasePool, type PracticeCipher, documentObjectKey, documentPagesKey, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import type { DocumentStore } from '@tp/worker/documents';

/**
 * Test support: a practice's contract records as the people of the plan make them (a contract
 * specialist under a support grant abstracts, cites and verifies the dispute window, and approves; the
 * practice administrator signs off; the signed-off version's lines' deadlines are verified, D17 a),
 * through packages/contracts' own services, over SYNTHETIC documents sealed with the practice's key in
 * the document store the web app reads. Used by the route tests; synthetic data only.
 */

type PageRead = Awaited<ReturnType<typeof readDocumentPages>>;

/** Each distinct document's page read, by the SHA-256 of its bytes and its type: this module's one per test file. */
const pageReads = new Map<string, Promise<PageRead>>();

/**
 * A synthetic document's pages, read by the bounded reader the first time its bytes are seen in this test file and
 * remembered after (frozen, so no caller can change what the next one gets). syntheticPdf() is deterministic, so every
 * world's agreement and exhibit are the same bytes, and the reader's worker thread, which was most of a world's time,
 * starts once per distinct document per file instead of three times per world (audit item 109; docs/adr/0066). The
 * first world of each file still reads for real; the bounded reader itself is evidence.test.ts's and
 * contracts.db.test.ts's.
 */
function readPagesOnce(bytes: Uint8Array, contentType = 'application/pdf'): Promise<PageRead> {
  const key = `${contentType} ${createHash('sha256').update(bytes).digest('hex')}`;
  let read = pageReads.get(key);
  if (read === undefined) {
    read = readDocumentPages({ bytes, contentType }).then((pages) => Object.freeze(pages.ok ? { ...pages, pages: Object.freeze([...pages.pages]) } : pages));
    pageReads.set(key, read);
  }
  return read;
}

/** Where the synthetic agreement states its dispute window (page 1), which the specialist cites and verifies (D17 a). */
export const WINDOW_QUOTE = 'Disputes are raised within 3650 days of the payment date.';
export const WINDOW_DAYS = 3650;
/** The rule WINDOW_QUOTE states (best-option audit #5): calendar days after the payment date (BPR16), the rule the product computes. */
export const WINDOW_RULE = { unit: 'calendar_days', measuredFrom: 'payment_date' } as const;

/** The synthetic agreement's pages: the first states its notice and dispute window, the second holds its fee schedule. */
export const CONTRACT_PAGES: readonly (readonly string[])[] = [
  ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Effective January 1, 2026. Compensation is set out in Exhibit A.', 'Either party gives 90 days notice before an anniversary.', WINDOW_QUOTE],
  ['SYNTHETIC EXHIBIT A FEE SCHEDULE', '97110 Therapeutic exercise $32.00 per unit', '97140 Manual therapy $30.50 per unit', '97530 Therapeutic activities at 110% of the Medicare fee schedule'],
];

export const QUOTE_97110 = '97110 Therapeutic exercise $32.00 per unit';
// Each unit of each code counts on its own ("per unit"), so the world's 97110 lines are priced at an
// expected amount (an UNKNOWN units rule would leave them unpriced, UNITS_RULE_UNKNOWN).
export const FIXED_97110 = { scope: { codes: ['97110'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' }, flags: { timed_units_rule: 'PER_CODE' } };

export interface ContractWorld {
  readonly contractDocumentId: string;
  readonly untaggedDocumentId: string;
  readonly signedOffContractId: string;
  readonly signedOffVersionId: string;
  readonly approvedVersionId: string;
  readonly readyVersionId: string;
  readonly draftVersionId: string;
  readonly draftRateRecordId: string;
  readonly questionId: string;
  readonly withdrawableQuestionId: string;
}

export interface ContractWorldOptions {
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  readonly documents: DocumentStore;
  readonly cipher: PracticeCipher;
  readonly practiceId: string;
  readonly payerId: string;
  /** Uploads the documents and signs off (the practice administrator). */
  readonly customerId: string;
  /** A contract specialist with a support grant on the practice. */
  readonly specialistId: string;
}

/**
 * A clean, stored contract document of the practice, as intake leaves one: its bytes sealed in the
 * document store and its page text, read by the bounded reader, sealed beside them (docs/adr/0033).
 */
export async function storeContractDocument(options: ContractWorldOptions, pages: readonly (readonly string[])[] = CONTRACT_PAGES, kind: 'contract' | 'exhibit' | 'payer_letter' = 'contract'): Promise<string> {
  const id = randomUUID();
  const bytes = syntheticPdf(pages);
  await options.documents.write(options.cipher, documentObjectKey(options.practiceId, id), Readable.from([bytes]));
  const read = await readPagesOnce(bytes);
  if (!read.ok) {
    throw new Error(`the synthetic contract does not read: ${read.problem}`);
  }
  await options.documents.write(options.cipher, documentPagesKey(options.practiceId, id), Readable.from([serializePageText(read.pages)]));
  await asOwner(options.owner, [options.practiceId], () =>
    options.owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status, page_text_status, page_count)
       VALUES ($1, $2, $7, $3, $4, 'application/pdf', $5, 'clean', now(), 'stored', 'ready', $6)`,
      [id, options.practiceId, createHash('sha256').update(bytes).digest('hex'), bytes.length, options.customerId, read.pages.length, kind],
    ),
  );
  return id;
}

/** One practice's contracts at every state the screens show. */
export async function seedContractWorld(options: ContractWorldOptions): Promise<ContractWorld> {
  const { app, practiceId, payerId } = options;
  const contractDocumentId = await storeContractDocument(options);
  const untaggedDocumentId = await storeContractDocument(options, [['SYNTHETIC EXHIBIT B - INVENTED TERMS', '97112 Neuromuscular reeducation $33.00 per unit']]);
  const bytes = syntheticPdf(CONTRACT_PAGES);
  // Every citation of the world's agreement resolves against CONTRACT_PAGES, read once per test file.
  const evidence = new EvidenceResolver({ pages: { pages: () => readPagesOnce(bytes) } });
  const as = <T>(actorId: string, run: (context: WorkflowContext) => Promise<T>) =>
    withPracticeScope(app, { actorId, practiceIds: [practiceId] }, (scope) => run({ scope, requestId: `seed-${randomUUID()}`, evidence }));
  const specialist = <T>(run: (context: WorkflowContext) => Promise<T>) => as(options.specialistId, run);

  /**
   * A contract with one draft version naming the document, its 3650-day dispute window cited on page 1 (D17 a), and
   * one rate record citing its page.
   */
  const draft = (title: string) =>
    specialist(async (context) => {
      const { contractId } = await createContract(context, { practiceId, payerId, title });
      const { versionId } = await createDraftVersion(context, {
        practiceId,
        contractId,
        effectiveFrom: '2026-01-01',
        sourceDocumentIds: [contractDocumentId],
        timelyFilingDays: 180,
        disputeWindowDays: WINDOW_DAYS,
        noticeDays: 90,
      });
      await citeDisputeWindow(context, { practiceId, versionId, citation: { documentId: contractDocumentId, page: 1, quote: WINDOW_QUOTE }, rule: WINDOW_RULE });
      const { rateRecordId } = await addRateRecord(context, { practiceId, versionId, terms: FIXED_97110, citation: { documentId: contractDocumentId, page: 2, quote: QUOTE_97110 } });
      return { contractId, versionId, rateRecordId };
    });
  /** The specialist approves each field of the record, and verifies the version's window against its page. */
  const verify = (versionId: string, rateRecordId: string) =>
    specialist(async (context) => {
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId, rateRecordId, field });
      }
      await verifyDisputeWindow(context, { practiceId, versionId });
    });
  const approve = (versionId: string) => specialist((context) => approveVersion(context, { practiceId, versionId }));

  const signed = await draft('SYNTHETIC SIGNED-OFF AGREEMENT');
  await verify(signed.versionId, signed.rateRecordId);
  await approve(signed.versionId);
  await as(options.customerId, (context) => signOffVersion(context, { practiceId, versionId: signed.versionId }));

  const approved = await draft('SYNTHETIC APPROVED AGREEMENT');
  await verify(approved.versionId, approved.rateRecordId);
  await approve(approved.versionId);

  const ready = await draft('SYNTHETIC VERIFIED AGREEMENT');
  await verify(ready.versionId, ready.rateRecordId);

  // In abstraction: its window cited, not yet verified (the window routes' samples cite and verify it).
  const inProgress = await draft('SYNTHETIC AGREEMENT IN ABSTRACTION');

  const ask = (question: string) =>
    specialist(async ({ scope }) => {
      const { rows } = await scope.client.query<{ id: string }>(
        "INSERT INTO contract_question (practice_id, contract_id, topic, question, asked_by) VALUES ($1, $2, 'missing_schedule', $3, app_actor_id()) RETURNING id",
        [practiceId, signed.contractId, options.cipher.encrypt('contract_question.question', question)],
      );
      return rows[0]?.id ?? '';
    });

  return {
    contractDocumentId,
    untaggedDocumentId,
    signedOffContractId: signed.contractId,
    signedOffVersionId: signed.versionId,
    approvedVersionId: approved.versionId,
    readyVersionId: ready.versionId,
    draftVersionId: inProgress.versionId,
    draftRateRecordId: inProgress.rateRecordId,
    questionId: await ask('SYNTHETIC QUESTION: the exhibit B fee schedule is missing'),
    withdrawableQuestionId: await ask('SYNTHETIC QUESTION: which page states the dispute window'),
  };
}
