import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  EvidenceResolver,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  approveRateRecordField,
  approveVersion,
  createContract,
  createDraftVersion,
  signOffVersion,
} from '@tp/contracts';
import { syntheticPdf } from '@tp/contracts/testing';
import { type DatabaseClient, type DatabasePool, type PracticeCipher, documentObjectKey, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import type { DocumentStore } from '@tp/worker/documents';

/**
 * Test support: a practice's contract records as the people of the plan make them (a contract
 * specialist under a support grant abstracts and approves, the practice administrator signs off),
 * through packages/contracts' own services, over SYNTHETIC documents sealed with the practice's key in
 * the document store the web app reads. Used by the route tests; synthetic data only.
 */

/** The synthetic agreement's pages: the second holds its fee schedule. */
export const CONTRACT_PAGES: readonly (readonly string[])[] = [
  ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Effective January 1, 2026. Compensation is set out in Exhibit A.', 'Either party gives 90 days notice before an anniversary.'],
  ['SYNTHETIC EXHIBIT A FEE SCHEDULE', '97110 Therapeutic exercise $32.00 per unit', '97140 Manual therapy $30.50 per unit', '97530 Therapeutic activities at 110% of the Medicare fee schedule'],
];

export const QUOTE_97110 = '97110 Therapeutic exercise $32.00 per unit';
export const FIXED_97110 = { scope: { codes: ['97110'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '3200' } };

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

/** A clean, stored contract document of the practice, its bytes sealed in the document store. */
export async function storeContractDocument(options: ContractWorldOptions, pages: readonly (readonly string[])[] = CONTRACT_PAGES): Promise<string> {
  const id = randomUUID();
  const bytes = syntheticPdf(pages);
  await options.documents.write(options.cipher, documentObjectKey(options.practiceId, id), Readable.from([bytes]));
  await asOwner(options.owner, [options.practiceId], () =>
    options.owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
       VALUES ($1, $2, 'contract', $3, $4, 'application/pdf', $5, 'clean', now(), 'stored')`,
      [id, options.practiceId, createHash('sha256').update(bytes).digest('hex'), bytes.length, options.customerId],
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
  const evidence = new EvidenceResolver({ documents: { read: () => Promise.resolve({ bytes, contentType: 'application/pdf' }) } });
  const as = <T>(actorId: string, run: (context: WorkflowContext) => Promise<T>) =>
    withPracticeScope(app, { actorId, practiceIds: [practiceId] }, (scope) => run({ scope, requestId: `seed-${randomUUID()}`, evidence }));
  const specialist = <T>(run: (context: WorkflowContext) => Promise<T>) => as(options.specialistId, run);

  /** A contract with one draft version naming the document, and one rate record citing its page. */
  const draft = (title: string) =>
    specialist(async (context) => {
      const { contractId } = await createContract(context, { practiceId, payerId, title });
      const { versionId } = await createDraftVersion(context, { practiceId, contractId, effectiveFrom: '2026-01-01', sourceDocumentIds: [contractDocumentId], timelyFilingDays: 180, noticeDays: 90 });
      const { rateRecordId } = await addRateRecord(context, { practiceId, versionId, terms: FIXED_97110, citation: { documentId: contractDocumentId, page: 2, quote: QUOTE_97110 } });
      return { contractId, versionId, rateRecordId };
    });
  const verify = (rateRecordId: string) =>
    specialist(async (context) => {
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId, rateRecordId, field });
      }
    });
  const approve = (versionId: string) => specialist((context) => approveVersion(context, { practiceId, versionId }));

  const signed = await draft('SYNTHETIC SIGNED-OFF AGREEMENT');
  await verify(signed.rateRecordId);
  await approve(signed.versionId);
  await as(options.customerId, (context) => signOffVersion(context, { practiceId, versionId: signed.versionId }));

  const approved = await draft('SYNTHETIC APPROVED AGREEMENT');
  await verify(approved.rateRecordId);
  await approve(approved.versionId);

  const ready = await draft('SYNTHETIC VERIFIED AGREEMENT');
  await verify(ready.rateRecordId);

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
