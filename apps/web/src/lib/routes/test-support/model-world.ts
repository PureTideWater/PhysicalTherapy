import { randomUUID } from 'node:crypto';

import { type DatabasePool, type KeyProvider, withPracticeScope } from '@tp/db';
import { ModelGateway, type ModelProvider, PostgresModelCallStore } from '@tp/model-gateway';
import { createLogger } from '@tp/observability';
import type { DocumentStore } from '@tp/worker/documents';

import { proposeTerms } from '../../models/contract-proposals';
import { CHECKLIST_FORMAT } from '../../models/evidence-checklist';
import { type ModelServices, assignModelPath } from '../../models/path';

/**
 * Test support: a route-test world's model proposals (docs/adr/0052), each made through the gateway
 * with a provider that answers one fixed, synthetic output, and logged in model_call as the person who
 * asked:
 *
 * - a contract proposal of the draft version's document by the contract specialist, whose one
 *   candidate cites a quote the page does not hold, so it becomes no rate record and the version stays
 *   a draft (the reject route discards it);
 * - an evidence checklist by the billing manager, of one coverage gap (the review route keeps it).
 *
 * The services given to the proposals are the seeder's own: the world's services keep the model path
 * of the environment, so the routes under test call no fixed output.
 */

export interface ModelWorldOptions {
  readonly app: DatabasePool;
  readonly keys: KeyProvider;
  readonly documents: DocumentStore;
  readonly practiceId: string;
  readonly specialistId: string;
  readonly managerId: string;
  readonly draftVersionId: string;
  readonly contractDocumentId: string;
}

export interface ModelWorldRefs {
  readonly contractProposalId: string;
  readonly checklistProposalId: string;
}

/** A provider that answers every request with the same output. */
function answering(output: unknown): ModelProvider {
  return { kind: 'local', complete: () => Promise.resolve({ text: JSON.stringify(output), tokensIn: 120, tokensOut: 40, stopReason: 'end' }) };
}

const UNVERIFIABLE_CANDIDATE = {
  label: 'SYNTHETIC candidate whose quote is not on the page',
  method: { value: 'FIXED_SCHEDULE', page: 1, quote: 'SYNTHETIC words this page does not hold' },
  codes: null,
  modifiers: null,
  places_of_service: null,
  amount: null,
  percentage: null,
  fee_schedule_year: null,
  lesser_of_schedule: null,
  flags: null,
  rounding: null,
  effective_from: null,
  effective_to: null,
};

const CHECKLIST_ITEM = { reason: 'NO_RATE_FOR_CODE', document: 'SYNTHETIC: the fee schedule exhibit that lists the codes', why: 'SYNTHETIC: lines of these codes have no rate in the contract on file.' };

export async function seedModelProposals(options: ModelWorldOptions): Promise<ModelWorldRefs> {
  const logger = createLogger({ sink: () => undefined });
  const services = (output: unknown): ModelServices & { readonly keys: KeyProvider; readonly documents: DocumentStore } => {
    const own = { pool: options.app, logger, now: () => new Date(), keys: options.keys, documents: options.documents };
    assignModelPath(own, { kind: 'available', production: false, provider: () => answering(output) });
    return own;
  };
  const contract = await withPracticeScope(options.app, { actorId: options.specialistId, practiceIds: [options.practiceId] }, (scope) =>
    proposeTerms(scope, services({ candidates: [UNVERIFIABLE_CANDIDATE] }), {
      practiceId: options.practiceId,
      versionId: options.draftVersionId,
      documentId: options.contractDocumentId,
      ambiguous: false,
      userId: options.specialistId,
      requestKey: `seed:${randomUUID()}`,
      requestId: `seed-${randomUUID()}`,
    }),
  );
  if (contract.kind !== 'proposed' || contract.proposed !== 0) {
    throw new Error('the seeded contract proposal was not recorded as one held candidate');
  }
  const gateway = new ModelGateway({ provider: answering({ items: [CHECKLIST_ITEM] }), store: new PostgresModelCallStore(options.app, { kind: 'user', userId: options.managerId }), logger, production: false });
  const result = await gateway.suggestEvidenceRequests({ practiceId: options.practiceId, requestKey: `seed:${randomUUID()}` }, { gaps: [{ reason: 'NO_RATE_FOR_CODE', count: 3, payer: null, codes: ['97110'] }] });
  if (result.proposal === null || result.proposal.items.length !== 1) {
    throw new Error('the seeded checklist was not proposed');
  }
  const proposal = result.proposal;
  const checklistProposalId = await withPracticeScope(options.app, { actorId: options.managerId, practiceIds: [options.practiceId] }, async (scope) => {
    const { rows } = await scope.client.query<{ id: string }>(
      `INSERT INTO model_proposal (practice_id, model_call_id, purpose, proposal, verifier_passed, proposed_by)
       VALUES ($1, $2, 'suggestEvidenceRequests', $3::jsonb, $4, app_actor_id()) RETURNING id`,
      [options.practiceId, result.modelCallId, JSON.stringify({ format: CHECKLIST_FORMAT, items: proposal.items, rejected: 0 }), result.passed],
    );
    return (rows[0] as { id: string }).id;
  });
  return { contractProposalId: contract.proposalId, checklistProposalId };
}
