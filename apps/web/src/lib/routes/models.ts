import { z } from 'zod';

import { underPacketRules } from '../cases/refusals';
import { practiceRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { ProposalRefusedError, proposeTerms, rejectProposal } from '../models/contract-proposals';
import { ChecklistRefusedError, reviewChecklist, suggestChecklist } from '../models/evidence-checklist';
import { draftNarrativeWithModel } from '../models/narrative-drafts';
import { type ModelNotice } from '../models/notices';
import { opaqueId, optionalText } from './schemas';

/**
 * The model features' own steps (PRD 14; PRD 5, J5 in v1 and J9; PRD 7, Rate record review,
 * Specialist queue, Packet builder and Coverage; docs/adr/0052), each behind the kill switch and the
 * practice's daily budget, which the gateway checks before anything is sent (MOD-05, MOD-06):
 *
 * - the contract specialist asks for a proposal of a draft version's terms, or discards one (the
 *   version's approval records the decision on the rest: src/lib/routes/abstraction.ts);
 * - a person who drafts packets asks for the narrative of the packet's next version (sending it for
 *   approval, or approving it, records the decision: src/lib/routes/packets.ts);
 * - a person who works cases asks for the coverage gaps' checklist, and keeps or dismisses it.
 *
 * A call that proposes nothing (the kill switch on, the budget spent, a timeout, an answer off its
 * schema, no model configured) is not an error of the request: nothing is written but the call's log,
 * and the screen says why and offers hand entry. Each step records an audit event and is made once.
 */

export { MODEL_NOTICES, type ModelNotice } from '../models/notices';

const versionPath = (practiceId: string, versionId: string, notice: ModelNotice) => `/p/${practiceId}/abstraction/versions/${versionId}?model=${notice}`;

function proposalRefusal(error: unknown): never {
  if (error instanceof ProposalRefusedError) {
    if (error.reason === 'not_found') {
      throw new NotFoundError();
    }
    throw new InputError([{ field: 'refused', message: error.message }]);
  }
  throw error;
}

export const proposeTermsAction = practiceRoute({
  id: 'practice.abstraction.propose',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/proposals/propose',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId, documentId: opaqueId, requestKey: z.uuid() }),
  audit: { action: 'model_proposal_requested', objectType: 'contract_version' },
  handle: async ({ scope, practiceId, input, request, services, actor }): Promise<MutationResult> => {
    const outcome = await proposeTerms(scope, services, {
      practiceId,
      versionId: input.versionId,
      documentId: input.documentId,
      userId: actor.userId,
      requestKey: `propose:${input.requestKey}`,
      requestId: request.requestId,
    }).catch(proposalRefusal);
    return { objectId: input.versionId, redirect: versionPath(practiceId, input.versionId, outcome.kind === 'proposed' ? 'proposed' : outcome.problem) };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.draftVersionId, documentId: refs.contractDocumentId }) },
});

export const rejectProposalAction = practiceRoute({
  id: 'practice.abstraction.reject_proposal',
  kind: 'action',
  path: '/p/[practiceId]/abstraction/proposals/reject',
  phi: true,
  permission: 'rate_record.edit',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ versionId: opaqueId, proposalId: opaqueId }),
  audit: { action: 'model_proposal_rejected', objectType: 'model_proposal' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    try {
      await rejectProposal(scope, { practiceId, versionId: input.versionId, proposalId: input.proposalId, requestId: request.requestId });
    } catch (error) {
      if (error instanceof ProposalRefusedError && error.reason === 'already_reviewed') {
        return { objectId: input.proposalId, redirect: versionPath(practiceId, input.versionId, 'reviewed_already') };
      }
      proposalRefusal(error);
    }
    return { objectId: input.proposalId, redirect: versionPath(practiceId, input.versionId, 'rejected') };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ versionId: refs.draftVersionId, proposalId: refs.contractProposalId }) },
});

const STATE_CODE = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'a two-letter state code');

/** The documents a version attaches, as the builder's form sends them: one field `attach:<document>` per checked box. */
function withAttachments(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return raw;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  const attachments = entries.filter(([key, value]) => key.startsWith('attach:') && value === 'on').map(([key]) => key.slice('attach:'.length));
  return { ...Object.fromEntries(entries.filter(([key]) => !key.startsWith('attach:'))), attachments };
}

export const draftNarrativeAction = practiceRoute({
  id: 'practice.cases.packet.draft_narrative',
  kind: 'action',
  path: '/p/[practiceId]/cases/packet/draft-narrative',
  phi: true,
  permission: 'packet.draft',
  params: z.object({ practiceId: opaqueId }),
  input: z.preprocess(
    withAttachments,
    z.object({
      caseId: opaqueId,
      basedOnVersionId: optionalText(opaqueId),
      promptPayState: optionalText(STATE_CODE),
      attachments: z.array(opaqueId).max(20, 'at most 20 attached documents'),
      requestKey: z.uuid(),
    }),
  ),
  audit: { action: 'packet_narrative_drafted', objectType: 'packet_version' },
  handle: async ({ scope, practiceId, input, request, services, actor }): Promise<MutationResult> => {
    const outcome = await underPacketRules(() =>
      draftNarrativeWithModel(scope, services, {
        practiceId,
        caseId: input.caseId,
        basedOnVersionId: input.basedOnVersionId ?? null,
        promptPayState: input.promptPayState ?? null,
        attachedDocumentIds: input.attachments,
        userId: actor.userId,
        requestKey: `narrative:${input.requestKey}`,
        requestId: request.requestId,
      }),
    );
    if (outcome.kind === 'drafted') {
      return { objectId: outcome.versionId, redirect: `/p/${practiceId}/cases/${input.caseId}/packet?model=drafted` };
    }
    return { redirect: `/p/${practiceId}/cases/${input.caseId}/packet?model=${outcome.problem}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ caseId: refs.caseId, basedOnVersionId: refs.packetVersionId }) },
});

export const suggestEvidenceAction = practiceRoute({
  id: 'practice.coverage.suggest_evidence',
  kind: 'action',
  path: '/p/[practiceId]/coverage/evidence/suggest',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({ requestKey: z.uuid() }),
  audit: { action: 'evidence_checklist_requested', objectType: 'practice' },
  handle: async ({ scope, practiceId, input, request, services, actor }): Promise<MutationResult> => {
    const outcome = await suggestChecklist(scope, services, { practiceId, userId: actor.userId, requestKey: `evidence:${input.requestKey}`, requestId: request.requestId });
    return outcome.kind === 'suggested' ? { objectId: outcome.proposalId, redirect: `/p/${practiceId}/coverage?model=suggested` } : { objectId: practiceId, redirect: `/p/${practiceId}/coverage?model=${outcome.problem}` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** The items a form keeps: one field `keep:<index>` per checked box. */
function withKept(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return raw;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  const kept = entries.filter(([key, value]) => key.startsWith('keep:') && value === 'on').map(([key]) => key.slice('keep:'.length));
  return { ...Object.fromEntries(entries.filter(([key]) => !key.startsWith('keep:'))), kept };
}

export const reviewEvidenceAction = practiceRoute({
  id: 'practice.coverage.review_evidence',
  kind: 'action',
  path: '/p/[practiceId]/coverage/evidence/review',
  phi: true,
  permission: 'case.work',
  params: z.object({ practiceId: opaqueId }),
  input: z.preprocess(
    withKept,
    z.object({
      proposalId: opaqueId,
      kept: z.array(z.coerce.number().int().min(0).max(99)).max(100),
      dismiss: optionalText(z.literal('on')),
    }),
  ),
  audit: { action: 'evidence_checklist_reviewed', objectType: 'model_proposal' },
  handle: async ({ scope, practiceId, input, request }): Promise<MutationResult> => {
    try {
      const decision = await reviewChecklist(scope, { practiceId, proposalId: input.proposalId, kept: input.kept, dismiss: input.dismiss === 'on', requestId: request.requestId });
      return { objectId: input.proposalId, redirect: `/p/${practiceId}/coverage?model=${decision === 'rejected' ? 'dismissed' : 'kept'}` };
    } catch (error) {
      if (error instanceof ChecklistRefusedError) {
        if (error.reason === 'reviewed_already') {
          return { objectId: input.proposalId, redirect: `/p/${practiceId}/coverage?model=reviewed_already` };
        }
        throw new NotFoundError();
      }
      throw error;
    }
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: (refs) => ({ proposalId: refs.checklistProposalId, 'keep:0': 'on' }) },
});

export const MODEL_ROUTES = [proposeTermsAction, rejectProposalAction, draftNarrativeAction, suggestEvidenceAction, reviewEvidenceAction] as const;
