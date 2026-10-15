/**
 * @tp/model-gateway: the only code in the repository that calls a model (PRD section 14, milestone
 * 10). ESLint forbids importing a provider SDK anywhere else. Models propose; code verifies; people
 * approve.
 */

/** The purpose-typed functions the gateway exposes (PRD section 14). */
export const MODEL_PURPOSES = [
  'proposeContractTerms',
  'readDenialLetter',
  'draftPacketNarrative',
  'suggestEvidenceRequests',
] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];
