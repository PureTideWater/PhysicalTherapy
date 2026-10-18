/**
 * The four purpose-typed functions of PRD 14, each the only way its kind of model call is made. A call
 * of one purpose reads one prompt version, answers in that version's JSON schema, and is checked by
 * that purpose's verifier before anyone sees it.
 */
export const MODEL_PURPOSES = ['proposeContractTerms', 'readDenialLetter', 'draftPacketNarrative', 'suggestEvidenceRequests'] as const;
export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

/**
 * Where each purpose ships (PRD 14): readDenialLetter is v1.5, so it is built behind a feature flag that
 * is off unless a platform administrator turns it on, on top of the kill switch every purpose obeys.
 */
export const FLAGGED_PURPOSES: ReadonlySet<ModelPurpose> = new Set(['readDenialLetter']);
