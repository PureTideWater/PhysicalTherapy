import { type KeyProvider, type PracticeScope, type ScopeClient } from '@tp/db/runtime';
import { recordReviewerDecisionIn } from '@tp/model-gateway';
import { packetDraftInputs, packetVersionOf } from '@tp/worker/packets';

import { writeVersionOnce } from '../packets/queries';
import { type ModelProblem, type ModelServices, gatewayFor, modelProblem } from './path';

/**
 * The packet builder's "draft the narrative" (PRD 5, J9: "the pattern narrative (model-drafted in v1
 * from the approved records, verified field by field by code)"; PRD 12, The packet; PRD 14,
 * draftPacketNarrative; docs/adr/0052).
 *
 * The person asks; the gateway is given the pattern statement's inputs only (the content the case's
 * next version would hold, its identifiers placeholders) and the schedule rows' own identifiers to
 * check against, never to send. Its narrative is written as a new version exactly as a person's would
 * be (writeVersionOnce: assembled again by code, verified by the packets verifier, a failing one stored
 * and unapprovable, CAS-08), in the person's name: the approval rules do not change (CAS-09, CAS-10).
 * The person edits it as any version; a model_proposal row ties the call to the version it wrote.
 *
 * The reviewer's decision is recorded when the person is done with the draft: when a version is sent
 * for approval, or approved, each unreviewed draft of the packet is accepted when that version's
 * narrative is the model's word for word, and accepted with "narrative" changed otherwise. A person's
 * edited narrative is never copied into an evaluation example: it can hold a detail the verifier does
 * not know as an identifier.
 */

export const NARRATIVE_DRAFT_FORMAT = 'tp-narrative-draft/1';

export interface DraftInput {
  readonly practiceId: string;
  readonly caseId: string;
  readonly basedOnVersionId: string | null;
  readonly promptPayState: string | null;
  readonly attachedDocumentIds: readonly string[];
  readonly userId: string;
  readonly requestKey: string;
  readonly requestId: string;
}

export type DraftOutcome =
  | { readonly kind: 'drafted'; readonly versionId: string; readonly written: boolean; readonly passed: boolean }
  | { readonly kind: 'not_drafted'; readonly problem: ModelProblem };

interface DraftServices extends ModelServices {
  readonly keys: KeyProvider;
}

/** Asks the gateway for the case's narrative and writes it as the packet's next version. */
export async function draftNarrativeWithModel(scope: PracticeScope<ScopeClient>, services: DraftServices, input: DraftInput): Promise<DraftOutcome> {
  const gateway = gatewayFor(services, input.userId);
  if (gateway === null) {
    return { kind: 'not_drafted', problem: 'unavailable' };
  }
  const draft = await packetDraftInputs(scope, services.keys, {
    practiceId: input.practiceId,
    caseId: input.caseId,
    promptPayState: input.promptPayState,
    attachedDocumentIds: input.attachedDocumentIds,
    requestId: input.requestId,
  });
  let result;
  try {
    result = await gateway.draftPacketNarrative({ practiceId: input.practiceId, requestKey: input.requestKey }, { content: draft.content, identifiers: draft.identifiers });
  } catch (error) {
    const problem = modelProblem(error);
    if (problem === null) {
      throw error;
    }
    return { kind: 'not_drafted', problem };
  }
  if (result.proposal === null) {
    return { kind: 'not_drafted', problem: 'invalid_output' };
  }
  const written = await writeVersionOnce(scope, services, {
    practiceId: input.practiceId,
    caseId: input.caseId,
    basedOnVersionId: input.basedOnVersionId,
    narrative: result.proposal.narrative,
    promptPayState: input.promptPayState,
    attachedDocumentIds: input.attachedDocumentIds,
    requestId: input.requestId,
  });
  await scope.client.query(
    `INSERT INTO model_proposal (practice_id, model_call_id, purpose, packet_version_id, proposal, verifier_passed, proposed_by)
     VALUES ($1, $2, 'draftPacketNarrative', $3, $4::jsonb, $5, app_actor_id())`,
    [
      input.practiceId,
      result.modelCallId,
      written.versionId,
      JSON.stringify({ format: NARRATIVE_DRAFT_FORMAT, mismatches: [...new Set(result.proposal.report.mismatches.map((mismatch) => mismatch.code))].sort() }),
      result.passed,
    ],
  );
  return { kind: 'drafted', versionId: written.versionId, written: written.written, passed: result.passed };
}

export interface DraftView {
  readonly versionId: string;
  readonly passed: boolean;
  readonly decision: string | null;
}

/** The model drafts of a case's packet, by the version each wrote. */
export async function packetDrafts(scope: PracticeScope<ScopeClient>, practiceId: string, caseId: string): Promise<DraftView[]> {
  const { rows } = await scope.client.query<{ packet_version_id: string; verifier_passed: boolean; reviewer_decision: string | null }>(
    `SELECT m.packet_version_id, m.verifier_passed, c.reviewer_decision
       FROM model_proposal m JOIN packet_version v ON v.id = m.packet_version_id JOIN packet p ON p.id = v.packet_id JOIN model_call c ON c.id = m.model_call_id
      WHERE m.practice_id = $1 AND p.case_id = $2 AND m.purpose = 'draftPacketNarrative'
      ORDER BY m.created_at, m.id`,
    [practiceId, caseId],
  );
  return rows.map((row) => ({ versionId: row.packet_version_id, passed: row.verifier_passed, decision: row.reviewer_decision }));
}

/**
 * Records the decision on each unreviewed model draft of the version's packet, against the version the
 * person sent for approval or approved (in that step's transaction).
 */
export async function reviewNarrativeDrafts(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: { readonly practiceId: string; readonly versionId: string; readonly requestId: string }): Promise<number> {
  const { rows } = await scope.client.query<{ id: string; model_call_id: string; packet_version_id: string }>(
    `SELECT m.id, m.model_call_id, m.packet_version_id
       FROM model_proposal m JOIN packet_version drafted ON drafted.id = m.packet_version_id JOIN packet_version sent ON sent.packet_id = drafted.packet_id
      WHERE m.practice_id = $1 AND sent.id = $2 AND m.purpose = 'draftPacketNarrative' AND m.reviewed_at IS NULL AND drafted.version_no <= sent.version_no
      ORDER BY m.created_at, m.id`,
    [input.practiceId, input.versionId],
  );
  if (rows.length === 0) {
    return 0;
  }
  const read = (versionId: string) => packetVersionOf(scope, keys, { practiceId: input.practiceId, versionId, requestId: input.requestId, purpose: 'narrative_review' });
  const sent = await read(input.versionId);
  for (const row of rows) {
    const drafted = row.packet_version_id === input.versionId ? sent : await read(row.packet_version_id);
    const same = drafted !== undefined && sent !== undefined && drafted.narrative === sent.narrative;
    await recordReviewerDecisionIn(scope, {
      practiceId: input.practiceId,
      modelCallId: row.model_call_id,
      decision: same ? 'accepted' : 'accepted_with_changes',
      changedFields: same ? [] : ['narrative'],
      requestId: input.requestId,
    });
    await scope.client.query('UPDATE model_proposal SET reviewed_at = now() WHERE id = $1 AND practice_id = $2', [row.id, input.practiceId]);
  }
  return rows.length;
}
