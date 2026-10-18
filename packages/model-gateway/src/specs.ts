import { type ContractPagesInput, type ContractTermsOutput, type ContractTermsProposal, contractTermsSpec } from './functions/contract-terms';
import { type DenialLetterInput, type DenialLetterOutput, type DenialLetterProposal, denialLetterSpec } from './functions/denial-letter';
import { type EvidenceRequestsInput, type EvidenceRequestsOutput, type EvidenceRequestsProposal, evidenceRequestsSpec } from './functions/evidence-requests';
import { type NarrativeInput, type NarrativeOutput, type NarrativeProposal, narrativeSpec } from './functions/narrative';
import { modelFor } from './prompts';
import type { ModelRequest, ProviderKind } from './provider';
import type { ModelPurpose } from './purposes';
import type { PurposeSpec } from './spec';

/** The four purposes' specifications, by purpose. */
export const PURPOSE_SPECS = {
  proposeContractTerms: contractTermsSpec,
  readDenialLetter: denialLetterSpec,
  draftPacketNarrative: narrativeSpec,
  suggestEvidenceRequests: evidenceRequestsSpec,
} as const;

export interface PurposeInputs {
  readonly proposeContractTerms: ContractPagesInput;
  readonly readDenialLetter: DenialLetterInput;
  readonly draftPacketNarrative: NarrativeInput;
  readonly suggestEvidenceRequests: EvidenceRequestsInput;
}

export interface PurposeOutputs {
  readonly proposeContractTerms: ContractTermsOutput;
  readonly readDenialLetter: DenialLetterOutput;
  readonly draftPacketNarrative: NarrativeOutput;
  readonly suggestEvidenceRequests: EvidenceRequestsOutput;
}

export interface PurposeProposals {
  readonly proposeContractTerms: ContractTermsProposal;
  readonly readDenialLetter: DenialLetterProposal;
  readonly draftPacketNarrative: NarrativeProposal;
  readonly suggestEvidenceRequests: EvidenceRequestsProposal;
}

/**
 * The request the gateway sends for an input (what a provider receives), without sending it: for the
 * local provider's fixed outputs and for tests that check what leaves the gateway.
 */
export function requestFor<K extends ModelPurpose>(purpose: K, input: PurposeInputs[K], provider: ProviderKind = 'local'): ModelRequest {
  const spec = PURPOSE_SPECS[purpose] as unknown as PurposeSpec<PurposeInputs[K], unknown, unknown, unknown>;
  const prepared = spec.prepare(input);
  return {
    modelId: modelFor(spec.prompt, provider, prepared.variant),
    promptVersion: spec.prompt.id,
    system: spec.prompt.system,
    user: prepared.user,
    outputSchema: spec.prompt.schema,
    maxTokens: spec.prompt.maxTokens,
    effort: spec.prompt.effort,
  };
}
