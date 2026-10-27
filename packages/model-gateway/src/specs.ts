import { type ContractPages, type ContractPagesInput, type ContractTermsOutput, type ContractTermsProposal, contractTermsSpec } from './functions/contract-terms';
import { type DenialLetterInput, type DenialLetterOutput, type DenialLetterProposal, denialLetterSpec } from './functions/denial-letter';
import { type EvidenceRequestsInput, type EvidenceRequestsOutput, type EvidenceRequestsProposal, evidenceRequestsSpec } from './functions/evidence-requests';
import { type NarrativeInput, type NarrativeOutput, type NarrativeProposal, narrativeSpec } from './functions/narrative';
import { modelFor } from './prompts';
import type { ModelRequest, ProviderKind } from './provider';
import type { ModelPurpose } from './purposes';
import type { PurposeSpec } from './spec';

/**
 * The four purposes' specifications, by purpose. Each spec is frozen where it is defined (./functions/*), so even a
 * module loaded before this one cannot change it, and again here with the map; PurposeSpec's members are readonly
 * (./spec.ts), and the gateway's own prototype and instances are frozen (./gateway.ts). So no code in the process can
 * remove or replace a purpose's screen, preparation or verifier, swap a spec, or swap the gateway's step that runs the
 * screen: an assignment or a delete is a compile error and, at run time, a TypeError (combined audit item 120's
 * review, F6). The map is the gateway's own and is not exported from the package's entry (./index.ts); requestFor and
 * the gateway's methods are the surface. Code in the process that rewrites a built-in is outside what any module can
 * stop (docs/adr/0070, Part 3).
 */
export const PURPOSE_SPECS = Object.freeze({
  proposeContractTerms: Object.freeze(contractTermsSpec),
  readDenialLetter: Object.freeze(denialLetterSpec),
  draftPacketNarrative: Object.freeze(narrativeSpec),
  suggestEvidenceRequests: Object.freeze(evidenceRequestsSpec),
} as const);

export interface PurposeInputs {
  readonly proposeContractTerms: ContractPagesInput;
  readonly readDenialLetter: DenialLetterInput;
  readonly draftPacketNarrative: NarrativeInput;
  readonly suggestEvidenceRequests: EvidenceRequestsInput;
}

/**
 * What a request is framed from, by purpose: the gateway's input, but for a contract the document alone, since its
 * records check (ContractPagesInput.patientRecords) is asked before the call and frames nothing.
 */
export type RequestInputs = Omit<PurposeInputs, 'proposeContractTerms'> & { readonly proposeContractTerms: ContractPages };

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
export function requestFor<K extends ModelPurpose>(purpose: K, input: RequestInputs[K], provider: ProviderKind = 'local'): ModelRequest {
  const spec = PURPOSE_SPECS[purpose] as unknown as PurposeSpec<RequestInputs[K], unknown, unknown, unknown>;
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
