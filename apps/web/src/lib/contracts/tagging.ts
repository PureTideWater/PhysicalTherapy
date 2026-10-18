import { type WorkflowContext, attachDocument, createContract, createDraftVersion } from '@tp/contracts';
import { z } from 'zod';

import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { opaqueId, optionalText } from '../routes/schemas';
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
