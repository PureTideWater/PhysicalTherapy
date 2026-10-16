import { type PracticeScope, type ScopeClient } from '@tp/db/runtime';
import { type EvidenceGap, type EvidenceRequest, KNOWN_REASON_CODES, recordReviewerDecisionIn } from '@tp/model-gateway';

import { OBTAIN_TOPICS } from '../contracts/display';
import { latestRunInEffect } from '../pricing/queries';
import { type ModelProblem, type ModelServices, gatewayFor, modelProblem } from './path';

/**
 * The coverage screen's evidence checklist (PRD 7, Coverage: "what to obtain to raise coverage"; PRD
 * 14, suggestEvidenceRequests: "Unpriced reasons and coverage gaps" in, "a checklist of documents to
 * obtain, phrased for the customer" out, "items must map to a known reason code"; docs/adr/0052).
 *
 * The gaps are counts and codes only: each unpriced reason of the pricing run in effect with its line
 * count and the procedure codes it holds most, and each open question of the specialist's that asks the
 * practice to obtain a document (contract_<topic>). No patient, claim or line identifier is an input.
 * The gateway keeps only items whose reason is a known code the gaps named. The person keeps the items
 * that apply (accepted, or accepted with the dropped items named) or dismisses the checklist
 * (rejected); the screen shows the kept items as the checklist. Without a model (the kill switch, no
 * model path) the screen shows the closed list's remedies by hand, as before.
 */

export const CHECKLIST_FORMAT = 'tp-evidence-checklist/1';

/** Codes a gap names at most. */
const CODES_PER_GAP = 10;

/** The practice's coverage gaps now, as the gateway is given them. */
export async function coverageGaps(scope: PracticeScope<ScopeClient>, practiceId: string, requestId: string): Promise<EvidenceGap[]> {
  const gaps: EvidenceGap[] = [];
  const run = await latestRunInEffect(scope, practiceId, requestId);
  if (run !== undefined) {
    const { rows } = await scope.client.query<{ reason: string; code: string; lines: string }>(
      `SELECT pl.unpriced_reason AS reason, sl.procedure_code AS code, count(*)::text AS lines
         FROM priced_line pl JOIN service_line sl ON sl.id = pl.service_line_id AND sl.practice_id = pl.practice_id
        WHERE pl.practice_id = $1 AND pl.pricing_run_id = $2 AND pl.unpriced_reason IS NOT NULL
        GROUP BY 1, 2 ORDER BY 1, count(*) DESC, 2`,
      [practiceId, run.id],
    );
    const byReason = new Map<string, { count: number; codes: string[] }>();
    for (const row of rows) {
      const entry = byReason.get(row.reason) ?? { count: 0, codes: [] };
      entry.count += Number.parseInt(row.lines, 10);
      if (entry.codes.length < CODES_PER_GAP && /^[0-9A-Z]{5}$/.test(row.code)) {
        entry.codes.push(row.code);
      }
      byReason.set(row.reason, entry);
    }
    for (const [reason, entry] of byReason) {
      gaps.push({ reason, count: entry.count, payer: null, codes: entry.codes });
    }
  }
  const { rows: questions } = await scope.client.query<{ topic: string; open: string }>(
    "SELECT topic, count(*)::text AS open FROM contract_question WHERE practice_id = $1 AND status = 'open' AND topic = ANY ($2::text[]) GROUP BY 1 ORDER BY 1",
    [practiceId, [...OBTAIN_TOPICS]],
  );
  for (const question of questions) {
    gaps.push({ reason: `contract_${question.topic}`, count: Number.parseInt(question.open, 10), payer: null, codes: [] });
  }
  return gaps.filter((gap) => KNOWN_REASON_CODES.includes(gap.reason));
}

export type SuggestOutcome = { readonly kind: 'suggested'; readonly proposalId: string; readonly items: number } | { readonly kind: 'not_suggested'; readonly problem: ModelProblem | 'no_gaps' };

/** Asks the gateway for a checklist of the practice's gaps, and keeps what it proposed for the person to review. */
export async function suggestChecklist(
  scope: PracticeScope<ScopeClient>,
  services: ModelServices,
  input: { readonly practiceId: string; readonly userId: string; readonly requestKey: string; readonly requestId: string },
): Promise<SuggestOutcome> {
  const gaps = await coverageGaps(scope, input.practiceId, input.requestId);
  if (gaps.length === 0) {
    return { kind: 'not_suggested', problem: 'no_gaps' };
  }
  const gateway = gatewayFor(services, input.userId);
  if (gateway === null) {
    return { kind: 'not_suggested', problem: 'unavailable' };
  }
  let result;
  try {
    result = await gateway.suggestEvidenceRequests({ practiceId: input.practiceId, requestKey: input.requestKey }, { gaps });
  } catch (error) {
    const problem = modelProblem(error);
    if (problem === null) {
      throw error;
    }
    return { kind: 'not_suggested', problem };
  }
  if (result.proposal === null) {
    return { kind: 'not_suggested', problem: 'invalid_output' };
  }
  const { rows } = await scope.client.query<{ id: string }>(
    `INSERT INTO model_proposal (practice_id, model_call_id, purpose, proposal, verifier_passed, proposed_by)
     VALUES ($1, $2, 'suggestEvidenceRequests', $3::jsonb, $4, app_actor_id()) RETURNING id`,
    [input.practiceId, result.modelCallId, JSON.stringify({ format: CHECKLIST_FORMAT, items: result.proposal.items, rejected: result.proposal.rejected.length }), result.passed],
  );
  return { kind: 'suggested', proposalId: (rows[0] as { id: string }).id, items: result.proposal.items.length };
}

export interface ChecklistView {
  readonly id: string;
  readonly createdAt: string;
  readonly items: readonly (EvidenceRequest & { readonly kept: boolean })[];
  /** Items the verifier left out (a reason no gap named). */
  readonly rejected: number;
  readonly decision: 'accepted' | 'accepted_with_changes' | 'rejected' | null;
}

const ITEM_PATH = /^items\[(\d{1,3})\]$/;

/** The practice's latest checklist not dismissed: awaiting its review, or kept (with the items kept). */
export async function latestChecklist(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<ChecklistView | null> {
  const { rows } = await scope.client.query<{ id: string; created_at: Date; proposal: { items: EvidenceRequest[]; rejected: number }; reviewer_decision: ChecklistView['decision']; reviewer_changed_fields: string[] | null }>(
    `SELECT m.id, m.created_at, m.proposal, c.reviewer_decision, c.reviewer_changed_fields
       FROM model_proposal m JOIN model_call c ON c.id = m.model_call_id
      WHERE m.practice_id = $1 AND m.purpose = 'suggestEvidenceRequests' AND c.reviewer_decision IS DISTINCT FROM 'rejected'
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1`,
    [practiceId],
  );
  const [row] = rows;
  if (row === undefined) {
    return null;
  }
  const dropped = new Set((row.reviewer_changed_fields ?? []).map((path) => ITEM_PATH.exec(path)?.[1]).filter((index): index is string => index !== undefined));
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    items: row.proposal.items.map((item, index) => ({ ...item, kept: !dropped.has(String(index)) })),
    rejected: row.proposal.rejected,
    decision: row.reviewer_decision,
  };
}

export class ChecklistRefusedError extends Error {
  override readonly name = 'ChecklistRefusedError';
  constructor(
    readonly reason: 'not_found' | 'reviewed_already',
    message: string,
  ) {
    super(message);
  }
}

/**
 * The person's decision on a checklist: keep the items checked (accepted when all are; rejected when
 * none are or the person dismisses it), recorded on the call with the dropped items named.
 */
export async function reviewChecklist(
  scope: PracticeScope<ScopeClient>,
  input: { readonly practiceId: string; readonly proposalId: string; readonly kept: readonly number[]; readonly dismiss: boolean; readonly requestId: string },
): Promise<'accepted' | 'accepted_with_changes' | 'rejected'> {
  const { rows } = await scope.client.query<{ model_call_id: string; reviewed_at: Date | null; proposal: { items: unknown[] } }>(
    "SELECT model_call_id, reviewed_at, proposal FROM model_proposal WHERE id = $1 AND practice_id = $2 AND purpose = 'suggestEvidenceRequests'",
    [input.proposalId, input.practiceId],
  );
  const [row] = rows;
  if (row === undefined) {
    throw new ChecklistRefusedError('not_found', 'no such checklist in this practice');
  }
  if (row.reviewed_at !== null) {
    throw new ChecklistRefusedError('reviewed_already', 'the checklist was reviewed already');
  }
  const count = row.proposal.items.length;
  const kept = new Set(input.kept.filter((index) => Number.isInteger(index) && index >= 0 && index < count));
  const dropped = Array.from({ length: count }, (_, index) => index).filter((index) => !kept.has(index));
  const decision = input.dismiss || kept.size === 0 ? 'rejected' : dropped.length === 0 ? 'accepted' : 'accepted_with_changes';
  await recordReviewerDecisionIn(scope, {
    practiceId: input.practiceId,
    modelCallId: row.model_call_id,
    decision,
    changedFields: decision === 'accepted_with_changes' ? dropped.map((index) => `items[${String(index)}]`) : [],
    requestId: input.requestId,
  });
  await scope.client.query('UPDATE model_proposal SET reviewed_at = now() WHERE id = $1 AND practice_id = $2', [input.proposalId, input.practiceId]);
  return decision;
}
