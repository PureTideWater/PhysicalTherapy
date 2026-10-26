import baselineFile from '../eval/baseline.json' with { type: 'json' };
import floorsFile from '../eval/floors.json' with { type: 'json' };
import { type Baseline, type BaselineEntry, parseBaseline } from './baseline-format';
import { GatewayConfigError } from './errors';
import { type Floors, belowFloors, parseFloors, unsetFloors } from './floors-format';
import { type ModelPrice, PRICES } from './prices';
import { PROMPTS, type PromptVersion } from './prompts';
import type { ProviderKind } from './provider';
import { ALL_SERVED, MODEL_PURPOSES, type ModelPurpose, type ServedKey, type ServedSet, servedKey } from './purposes';

/**
 * Who decides which model features a real provider serves in production (PRD 14, Logging and
 * evaluation: "the gate for a prompt or model change is field-level precision and recall on that set with
 * no regression"; "any verifier failure on the 300-case synthetic set blocks the change"; docs/adr/0051,
 * 0054 and 0070, Part 2).
 *
 * Serving is decided per purpose and per variant its current prompt pins for the provider (a key such as
 * `proposeContractTerms/ambiguous`), never for the provider as a whole: one feature's missing evaluation
 * turns that feature off, through the feature-off path the kill switch uses (ModelFeatureOffError
 * `not_evaluated`, hand entry), and leaves the others as they are. A key is served only when all of these
 * hold, and each that does not is a reason recorded in its decision:
 *
 * - its purpose has a synthetic set its baseline entries are recorded on (SERVING_RULES; `no_set`):
 *   evidence requests and the denial-letter reader have none, so no real provider serves them;
 * - the committed baseline (eval/baseline.json) holds an entry for that purpose, provider, prompt version
 *   and content hash, model and (contracts) variant (`no_entry`). The baseline is parsed by its own strict
 *   schema (./baseline-format.ts), whose literals refuse an entry with a wrong-but-verified value on a
 *   faithful case, an unflagged conflict, a differing twin or a narrative failure: an entry the gate never
 *   writes, typed by hand, fails the parse and serves nothing;
 * - for contracts on a real provider, every field's recall and precision floor in eval/floors.json is set
 *   (`floor_unset`) and the entry's counts meet it (`below_floor`), worked out here at run time, so a floor
 *   raised after an entry was recorded switches the feature off until it is met (the local provider is held
 *   to no floor, as in the gate);
 * - the model the variant pins has a price confirmed in config/models.json (`price_unconfirmed`), so a
 *   budget is never enforced on a guess;
 * - for contracts on a real provider, the in-boundary permitted run has been recorded on the entry
 *   (`permitted_pending`; session ruling 9, F5 (a)): eval --record writes the entry with `permitted:
 *   'pending'`, and `eval record-permitted` writes the run's report hashes once it shows no regression. An
 *   entry with no `permitted` at all is pending too, so deleting the field by hand serves nothing.
 *
 * A key is `served` with no reason, and `evaluable` when its only reason is `permitted_pending`: the
 * permitted run's own gateway (a job, apps/worker/src/models/permitted.ts) may call the model for an
 * evaluable key, so the run a key waits on can be made, and nothing else may.
 *
 * The gateway works out its own served set from the files committed with the package (productionServing,
 * through gatewayServing); no caller hands it a set, so no caller can widen it (the design review's B1).
 * readGatewayConfig (./config.ts) reads the same files for the web's feature list and the log line.
 */

export type NotServedReason = 'no_set' | 'no_entry' | 'floor_unset' | 'below_floor' | 'price_unconfirmed' | 'permitted_pending';

export interface ServingDecision {
  readonly key: ServedKey;
  readonly served: boolean;
  readonly evaluable: boolean;
  /** Why the key is not served, in the order above; empty when it is. */
  readonly reasons: readonly NotServedReason[];
}

/** What serving is decided on: the baseline, the floors and the prices, as committed with the package. */
export interface ServingInputs {
  readonly baseline: Baseline;
  readonly floors: Floors;
  readonly prices: readonly ModelPrice[];
}

/** Which set a gateway serves: what has passed (every caller), or what the permitted run may call (its job only). */
export type Serving = 'served' | 'evaluable';

/** Which purpose has a synthetic set its baseline entries are recorded on (no set: never served by a real provider). */
export const SERVING_RULES: Readonly<Record<ModelPurpose, 'contract_gate' | 'narrative_gate' | 'no_set'>> = {
  proposeContractTerms: 'contract_gate',
  draftPacketNarrative: 'narrative_gate',
  suggestEvidenceRequests: 'no_set',
  readDenialLetter: 'no_set',
};

/**
 * The committed baseline as production reads it: parsed as strictly as the gate writes it, or a
 * GatewayConfigError that names the file (review m4). It is parsed once, when the module is imported, on
 * purpose: eval/baseline.json is a file of the build, not input, and every CI run parses it the same way
 * (the unit, golden and config tests), so a file that does not parse fails CI before it can merge, and a
 * build that carries one anyway fails at startup, loudly and closed, rather than starting with every
 * model feature quietly off (which would hide a broken build; production already refuses to start with
 * nothing served, ./config.ts). Nothing is served from a file that does not parse.
 */
export function committedBaseline(value: unknown): Baseline {
  try {
    return parseBaseline(value);
  } catch (error) {
    throw new GatewayConfigError('eval/baseline.json does not parse as the gate writes it (src/baseline-format.ts): no model feature can be decided, and the gateway does not start; re-record it with eval --record', { cause: error });
  }
}

/** The committed baseline, parsed as strictly as the gate writes it (the golden test holds the gate's reader to the same file). */
export const COMMITTED_BASELINE: Baseline = committedBaseline(baselineFile);
/** The committed floors (eval/floors.json). */
export const COMMITTED_FLOORS: Floors = parseFloors(floorsFile);
/** The baseline, floors and prices production serves on. */
export const COMMITTED_SERVING: ServingInputs = { baseline: COMMITTED_BASELINE, floors: COMMITTED_FLOORS, prices: PRICES };

/** The entry recorded for exactly this purpose, provider, prompt version and content, model and (contracts) variant. */
export function entryFor(
  baseline: Baseline,
  wanted: { readonly purpose: ModelPurpose; readonly provider: ProviderKind; readonly prompt: PromptVersion; readonly modelId: string; readonly variant: string },
): BaselineEntry | undefined {
  return baseline.entries.find(
    (entry) =>
      entry.purpose === wanted.purpose &&
      entry.provider === wanted.provider &&
      entry.prompt_version === wanted.prompt.id &&
      entry.prompt_sha256 === wanted.prompt.sha256 &&
      entry.model_id === wanted.modelId &&
      (entry.purpose !== 'proposeContractTerms' || entry.variant === wanted.variant),
  );
}

function priceConfirmed(prices: readonly ModelPrice[], provider: ProviderKind, modelId: string): boolean {
  return prices.find((price) => price.provider === provider && price.modelId === modelId)?.confirmed === true;
}

/** Each purpose and each variant its current prompt pins for the provider, decided as above, in purpose order. */
export function servingDecisions(provider: ProviderKind, inputs: ServingInputs = COMMITTED_SERVING): ServingDecision[] {
  const { baseline, floors, prices } = inputs;
  const real = provider !== 'local';
  return MODEL_PURPOSES.flatMap((purpose) =>
    Object.entries(PROMPTS[purpose].models[provider]).map(([variant, modelId]): ServingDecision => {
      const key = servedKey(purpose, variant);
      if (SERVING_RULES[purpose] === 'no_set') {
        return { key, served: false, evaluable: false, reasons: ['no_set'] };
      }
      const reasons: NotServedReason[] = [];
      const entry = entryFor(baseline, { purpose, provider, prompt: PROMPTS[purpose], modelId, variant });
      if (entry === undefined) {
        reasons.push('no_entry');
      }
      const contract = entry?.purpose === 'proposeContractTerms' && real ? entry : null;
      if (contract !== null && unsetFloors(floors).length > 0) {
        reasons.push('floor_unset');
      }
      if (contract !== null && belowFloors(floors, contract.fields).length > 0) {
        reasons.push('below_floor');
      }
      if (!priceConfirmed(prices, provider, modelId)) {
        reasons.push('price_unconfirmed');
      }
      if (contract !== null && (contract.permitted === undefined || contract.permitted === 'pending')) {
        reasons.push('permitted_pending');
      }
      return { key, served: reasons.length === 0, evaluable: reasons.every((reason) => reason === 'permitted_pending'), reasons };
    }),
  );
}

/** The keys served, or evaluable (the served ones among them), of a provider's decisions. */
export function servedSet(decisions: readonly ServingDecision[], which: Serving): ServedSet {
  return { keys: new Set(decisions.filter((decision) => (which === 'served' ? decision.served : decision.evaluable)).map((decision) => decision.key)) };
}

/** What a real provider serves in production, on the committed baseline, floors and prices. */
export function productionServing(provider: ProviderKind, serving: Serving = 'served'): ServedSet {
  return servedSet(servingDecisions(provider, COMMITTED_SERVING), serving);
}

/**
 * What a gateway on the provider serves: in production on a real provider, what has passed on the
 * committed files (productionServing); with the local provider (the e2e suite's production build
 * included), or any provider outside production, where only synthetic material may reach it, every key.
 */
export function gatewayServing(production: boolean, provider: ProviderKind, serving: Serving = 'served'): ServedSet {
  return production && provider !== 'local' ? productionServing(provider, serving) : ALL_SERVED;
}
