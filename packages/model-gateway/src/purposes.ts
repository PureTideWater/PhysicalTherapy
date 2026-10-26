import type { GatewayFeatures } from './flags';

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

/**
 * The model variants each purpose's preparation can ask for (./spec.ts PreparedCall.variant): the
 * default model, and for contracts the larger model the specialist asks for on a contract marked
 * ambiguous. A prompt pins a model per provider for some of them (prompts/<name>/v1/prompt.json
 * `models`); a unit test holds every pinned and every prepared variant to this list.
 */
export const PURPOSE_VARIANTS: Readonly<Record<ModelPurpose, readonly string[]>> = {
  proposeContractTerms: ['default', 'ambiguous'],
  readDenialLetter: ['default'],
  draftPacketNarrative: ['default'],
  suggestEvidenceRequests: ['default'],
};

/** A purpose and one of its variants, as serving names it ('proposeContractTerms/ambiguous'). */
export type ServedKey = `${ModelPurpose}/${string}`;

export function servedKey(purpose: ModelPurpose, variant: string): ServedKey {
  return `${purpose}/${variant}`;
}

/**
 * The purposes and variants a gateway serves (docs/adr/0070, Part 2). In production on a real provider
 * the gateway works it out itself from the committed evaluation (./evaluated.ts productionServing); no
 * caller hands one in. Everywhere else it is ALL_SERVED.
 */
export interface ServedSet {
  readonly keys: ReadonlySet<ServedKey>;
}

/**
 * Every purpose, every variant: the local provider (the e2e suite's production build included), and any
 * provider outside production, where only synthetic material may reach it (./gateway.ts, the PHI boundary).
 */
export const ALL_SERVED: ServedSet = { keys: new Set(MODEL_PURPOSES.flatMap((purpose) => PURPOSE_VARIANTS[purpose].map((variant) => servedKey(purpose, variant)))) };

/** Whether any variant of the purpose is served: a screen offers the feature, and the gateway reads its flags, only then. */
export function purposeServed(served: ServedSet, purpose: ModelPurpose): boolean {
  return PURPOSE_VARIANTS[purpose].some((variant) => served.keys.has(servedKey(purpose, variant)));
}

/**
 * Which purposes a screen may offer the practice now (test matrix MOD-06; docs/adr/0070, Part 2): none
 * with the kill switch on; a purpose only when some variant of it is served; and the denial-letter reader
 * only when its own flag turns it on. The one rule both the gateway's features() and the web's
 * modelFeatures() return.
 */
export function offeredPurposes(features: Pick<GatewayFeatures, 'killSwitch' | 'readDenialLetter'>, served: ServedSet): Readonly<Record<ModelPurpose, boolean>> {
  return Object.fromEntries(MODEL_PURPOSES.map((purpose) => [purpose, !features.killSwitch && purposeServed(served, purpose) && (!FLAGGED_PURPOSES.has(purpose) || features.readDenialLetter)])) as Record<ModelPurpose, boolean>;
}
