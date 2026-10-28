import { type WorkflowContext, attachDocument, createContract, createDraftVersion } from '@tp/contracts';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { z } from 'zod';

import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { opaqueId, optionalText } from '../routes/schemas';
import { NOT_A_RESPONSE_LETTER } from './contract-queries';
import { exclusiveEnd } from './display';

/**
 * Tagging an uploaded contract, exhibit or payer letter to its payer (PRD 5, J5: "uploads a contract
 * PDF or a fee-schedule exhibit ... and tags it to a payer. The document enters the specialist
 * queue"), for the customer (file.upload) and the contract specialist (rate_record.edit) alike:
 *
 * - a new contract with the payer: the contract and its first draft version, from the start the
 *   contract states, naming the document;
 * - an existing contract of the payer whose version is being abstracted (a draft or a proposal): the
 *   document joins that version;
 * - an existing contract with no version being abstracted: a new draft version from the start given,
 *   naming the document. Versions of one contract never overlap (CON-01): a window that overlaps a
 *   signed-off version is refused with the rule; an amendment of the version in force is the
 *   specialist's (it stays in the specialist's queue until then).
 *
 * A payer's answer to a dispute is never tagged (docs/adr/0085, D4): a letter a payer response names is its case's
 * evidence, so this refuses it, as the specialist's amendment and correction do (refuseResponseLetter).
 */

const date = z.iso.date('a date (YYYY-MM-DD)');

export const tagInput = z.object({
  documentId: opaqueId,
  payerId: opaqueId,
  /** An existing contract of the payer; absent for a new contract. */
  contractId: optionalText(opaqueId),
  title: optionalText(z.string().max(200)),
  effectiveFrom: optionalText(date),
  /** The last day the version covers; blank while open-ended. */
  lastDay: optionalText(date),
});
export type TagInput = z.output<typeof tagInput>;

/**
 * The document's transaction lock, taken first by every handler that makes a document a contract's source or a
 * response's evidence (here, and responseDocumentChoosable in lib/packets/submissions.ts, under the same key), before
 * its check: the check after it sees the other's commit, so a tag and a response of the same letter cannot both pass.
 * The contracts service's own lock comes after it, and the response takes no other, so the order is the same on both.
 */
const DOCUMENT_USE_LOCK = "SELECT pg_advisory_xact_lock(hashtextextended('document_use:' || $1::text, 0))";

/** Why a payer's answer is not taken as a contract's document, and what to choose instead. */
export const RESPONSE_LETTER_NOT_A_SOURCE = 'a payer’s answer to a dispute stays with its case’s response and is not a contract’s document; choose the contract, exhibit or payer’s terms letter instead';

/**
 * Refuses, on documentId, a document a payer response names (NOT_A_RESPONSE_LETTER): it is that case's evidence,
 * never a contract's source (docs/adr/0085, D4). Every handler that makes a document a contract's source calls it in
 * the transaction that writes, before anything else it locks. A document of another practice, or none, is left to
 * the handler's own check and the database's.
 */
export async function refuseResponseLetter(scope: PracticeScope<ScopeClient>, practiceId: string, documentId: string): Promise<void> {
  await scope.client.query(DOCUMENT_USE_LOCK, [documentId]);
  const named = await scope.client.query(`SELECT 1 FROM source_document d WHERE d.id = $1 AND d.practice_id = $2 AND NOT ${NOT_A_RESPONSE_LETTER}`, [documentId, practiceId]);
  if (named.rowCount !== 0) {
    throw new InputError([{ field: 'documentId', message: RESPONSE_LETTER_NOT_A_SOURCE }]);
  }
}

/** Tags the document; returns the version it now belongs to and where its review is. */
export async function tagDocument(context: WorkflowContext, practiceId: string, input: TagInput, reviewPath: (versionId: string) => string): Promise<MutationResult> {
  const { scope } = context;
  const document = await scope.client.query(
    "SELECT 1 FROM source_document WHERE id = $1 AND practice_id = $2 AND kind IN ('contract', 'exhibit', 'payer_letter') AND scan_status = 'clean' AND status = 'stored'",
    [input.documentId, practiceId],
  );
  if (document.rowCount === 0) {
    throw new NotFoundError();
  }
  await refuseResponseLetter(scope, practiceId, input.documentId);
  const payer = await scope.client.query('SELECT 1 FROM payer WHERE id = $1 AND practice_id = $2', [input.payerId, practiceId]);
  if (payer.rowCount === 0) {
    throw new InputError([{ field: 'payerId', message: 'a payer of this practice' }]);
  }
  if (input.lastDay !== undefined && input.effectiveFrom !== undefined && input.lastDay < input.effectiveFrom) {
    throw new InputError([{ field: 'lastDay', message: 'on or after the date the version starts' }]);
  }
  const window = () => {
    if (input.effectiveFrom === undefined) {
      throw new InputError([{ field: 'effectiveFrom', message: 'the date the contract, amendment or exhibit takes effect' }]);
    }
    return { effectiveFrom: input.effectiveFrom, effectiveTo: exclusiveEnd(input.lastDay) };
  };
  let contractId = input.contractId;
  if (contractId === undefined) {
    if (input.title === undefined) {
      throw new InputError([{ field: 'title', message: 'the contract’s title, or choose one of the payer’s contracts' }]);
    }
    const dates = window();
    contractId = (await createContract(context, { practiceId, payerId: input.payerId, title: input.title })).contractId;
    const { versionId } = await createDraftVersion(context, { practiceId, contractId, ...dates, sourceDocumentIds: [input.documentId] });
    return { objectId: input.documentId, redirect: reviewPath(versionId) };
  }
  const contract = await scope.client.query<{ payer_id: string }>('SELECT payer_id FROM contract WHERE id = $1 AND practice_id = $2', [contractId, practiceId]);
  const found = contract.rows[0];
  if (found === undefined) {
    throw new NotFoundError();
  }
  if (found.payer_id !== input.payerId) {
    throw new InputError([{ field: 'contractId', message: 'a contract with the payer chosen' }]);
  }
  const open = await scope.client.query<{ id: string }>(
    "SELECT id FROM contract_version WHERE contract_id = $1 AND practice_id = $2 AND status IN ('draft', 'proposed') ORDER BY version_no DESC LIMIT 1",
    [contractId, practiceId],
  );
  const openVersion = open.rows[0];
  if (openVersion !== undefined) {
    await attachDocument(context, { practiceId, versionId: openVersion.id, documentId: input.documentId });
    return { objectId: input.documentId, redirect: reviewPath(openVersion.id) };
  }
  const { versionId } = await createDraftVersion(context, { practiceId, contractId, ...window(), sourceDocumentIds: [input.documentId] });
  return { objectId: input.documentId, redirect: reviewPath(versionId) };
}
