import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createProvider, pinnedModels, readGatewayConfig, unservedCount } from './config';
import { GatewayConfigError } from './errors';
import { BASELINE_FORMAT, type Baseline, type BaselineEntry, type ContractBaseline, parseBaseline } from './baseline-format';
import { COMMITTED_BASELINE, COMMITTED_FLOORS, COMMITTED_SERVING, SERVING_RULES, type ServingDecision, type ServingInputs, servedSet, servingDecisions } from './evaluated';
import type { Floors } from './floors-format';
import { PROMPTS } from './prompts';
import { type ModelPrice, PRICES } from './prices';
import { AnthropicProvider } from './providers/anthropic';
import { BedrockProvider } from './providers/bedrock';
import { LocalDeterministicProvider } from './providers/local';
import { ALL_SERVED, MODEL_PURPOSES, PURPOSE_VARIANTS, type ServedSet, offeredPurposes, servedKey } from './purposes';

/** The model path is configuration (PRD 14 and 20; docs/adr/0048), and so is what a real provider serves (docs/adr/0070, Part 2). */

const confirmed: readonly ModelPrice[] = PRICES.map((price) => ({ ...price, confirmed: true }));
const PRODUCTION = { NODE_ENV: 'production', AWS_REGION: 'us-east-1' };
const keys = (set: ServedSet) => [...set.keys].sort();

const committedContract = COMMITTED_BASELINE.entries.find((entry): entry is ContractBaseline => entry.purpose === 'proposeContractTerms' && entry.variant === 'default');
const committedNarrative = COMMITTED_BASELINE.entries.find((entry) => entry.purpose === 'draftPacketNarrative');
if (committedContract === undefined || committedNarrative === undefined) {
  throw new Error('the committed baseline holds the local contract and narrative entries');
}

/**
 * A real provider's entries as eval --record would write them (SYNTHETIC: the local entry's counts under
 * the provider's pinned model; no run made), with the permitted run recorded unless said otherwise.
 */
function contractEntry(provider: 'bedrock' | 'anthropic', variant: 'default' | 'ambiguous', permitted: ContractBaseline['permitted'] | 'absent' = RECORDED_PERMITTED): ContractBaseline {
  const { permitted: _local, ...entry } = committedContract as ContractBaseline;
  const modelId = PROMPTS.proposeContractTerms.models[provider][variant];
  if (modelId === undefined) {
    throw new Error('the contract prompt pins both variants for a real provider');
  }
  return { ...entry, provider, model_id: modelId, variant, ...(permitted === 'absent' ? {} : { permitted }) };
}
const RECORDED_PERMITTED = { examples: 0, report_sha256: 'b'.repeat(64), against_sha256: null, recorded_on: '2026-10-26' } as const;

function narrativeEntry(provider: 'bedrock' | 'anthropic'): BaselineEntry {
  return { ...(committedNarrative as BaselineEntry), provider, model_id: PROMPTS.draftPacketNarrative.models[provider].default ?? '' };
}

const baselineOf = (entries: readonly BaselineEntry[]): Baseline => parseBaseline({ ...COMMITTED_BASELINE, entries: [...COMMITTED_BASELINE.entries, ...entries] });

/** Every floor set to the text given (SYNTHETIC: the founder's and the specialist's values are not chosen here). */
function floorsAt(text: string): Floors {
  const all = Object.fromEntries(Object.keys(COMMITTED_FLOORS.proposeContractTerms.recall).map((field) => [field, text]));
  return { ...COMMITTED_FLOORS, proposeContractTerms: { recall: { ...all } as Floors['proposeContractTerms']['recall'], precision: { ...all } as Floors['proposeContractTerms']['precision'] } };
}

const inputs = (entries: readonly BaselineEntry[], overrides: Partial<ServingInputs> = {}): ServingInputs => ({ baseline: baselineOf(entries), floors: floorsAt('0.9'), prices: confirmed, ...overrides });
const reasonsOf = (decisions: readonly ServingDecision[]) => Object.fromEntries(decisions.map((decision) => [decision.key, decision.reasons]));

describe('readGatewayConfig', () => {
  it('uses the local deterministic provider outside production, and Bedrock by default in production', () => {
    expect(readGatewayConfig({})).toMatchObject({ production: false, provider: 'local', fixturesDir: undefined });
    expect(readGatewayConfig({ MODEL_LOCAL_FIXTURES_DIR: '/tmp/x' })).toMatchObject({ fixturesDir: '/tmp/x' });
    expect(readGatewayConfig({})).toMatchObject({ served: ALL_SERVED, evaluable: ALL_SERVED, decisions: [] });
    expect(readGatewayConfig(PRODUCTION, inputs([contractEntry('bedrock', 'default')]))).toMatchObject({ production: true, provider: 'bedrock', region: 'us-east-1', endpoint: undefined });
  });

  it('reads Bedrock’s region and optional VPC endpoint', () => {
    expect(readGatewayConfig({ MODEL_PROVIDER: 'bedrock', BEDROCK_REGION: 'us-west-2', AWS_REGION: 'us-east-1', BEDROCK_ENDPOINT: 'https://vpce.synthetic.example' })).toMatchObject({
      production: false,
      provider: 'bedrock',
      region: 'us-west-2',
      endpoint: 'https://vpce.synthetic.example',
    });
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'bedrock' })).toThrow(/AWS_REGION/);
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'bedrock', AWS_REGION: 'us-east-1', BEDROCK_ENDPOINT: 'http://plain' })).toThrow(/https/);
  });

  it('needs the API key for Anthropic’s API', () => {
    expect(readGatewayConfig({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: ' sk-synthetic ' })).toMatchObject({ production: false, provider: 'anthropic', apiKey: 'sk-synthetic' });
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '  ' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('refuses an unknown provider', () => {
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'other' })).toThrow(GatewayConfigError);
  });

  it('refuses the local provider in production, except for the e2e suite’s build', () => {
    expect(() => readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'local' })).toThrow(/refused/);
    expect(readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'local', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' })).toMatchObject({ production: true, provider: 'local' });
  });

  it('refuses a real provider in production as the repository ships: no real-provider entry, no confirmed price, every floor unset', () => {
    for (const env of [PRODUCTION, { NODE_ENV: 'production', MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }]) {
      expect(() => readGatewayConfig(env), env.NODE_ENV).toThrow(GatewayConfigError);
      expect(() => readGatewayConfig(env)).toThrow(/no model feature has passed its evaluation/);
      expect(() => readGatewayConfig(env, { serving: 'evaluable' })).toThrow(/no model feature has passed its evaluation/);
    }
    // The message names the reasons as codes, and nothing else.
    expect(() => readGatewayConfig(PRODUCTION)).toThrow('(no_entry, no_set, price_unconfirmed; ');
    for (const provider of ['bedrock', 'anthropic'] as const) {
      expect(servingDecisions(provider).every((decision) => !decision.served && !decision.evaluable), provider).toBe(true);
    }
    // Outside production nothing is asked: a synthetic evaluation run is how the first entry is recorded.
    expect(readGatewayConfig({ MODEL_PROVIDER: 'bedrock', AWS_REGION: 'us-east-1' })).toMatchObject({ provider: 'bedrock', served: ALL_SERVED, evaluable: ALL_SERVED, decisions: [] });
    // The e2e suite's production build runs the local provider, which serves every key.
    expect(readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'local', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' })).toMatchObject({ provider: 'local', served: ALL_SERVED });
  });

  it('serves a contract entry alone as proposeContractTerms/default and nothing else', () => {
    const config = readGatewayConfig(PRODUCTION, inputs([contractEntry('bedrock', 'default')]));
    expect(keys(config.served)).toEqual(['proposeContractTerms/default']);
    expect(keys(config.evaluable)).toEqual(['proposeContractTerms/default']);
    expect(reasonsOf(config.decisions)).toEqual({
      'proposeContractTerms/default': [],
      'proposeContractTerms/ambiguous': ['no_entry'],
      'readDenialLetter/default': ['no_set'],
      'draftPacketNarrative/default': ['no_entry'],
      'suggestEvidenceRequests/default': ['no_set'],
    });
    expect(unservedCount(config)).toBe(4);
    // With the larger model and narratives recorded too, all three are served; the two purposes with no set never are.
    const all = readGatewayConfig(PRODUCTION, inputs([contractEntry('bedrock', 'default'), contractEntry('bedrock', 'ambiguous'), narrativeEntry('bedrock')]));
    expect(keys(all.served)).toEqual(['draftPacketNarrative/default', 'proposeContractTerms/ambiguous', 'proposeContractTerms/default']);
    expect(unservedCount(all)).toBe(2);
    // Anthropic's entries serve nothing on Bedrock.
    expect(() => readGatewayConfig(PRODUCTION, inputs([contractEntry('anthropic', 'default'), narrativeEntry('anthropic')]))).toThrow(GatewayConfigError);
  });

  it('serves no key whose floors are unset or unmet, whose price is unconfirmed, or whose entry is not exactly its prompt, model and variant', () => {
    const entries = [contractEntry('bedrock', 'default'), contractEntry('bedrock', 'ambiguous')];
    // Every floor unset, as floors.json ships (and one unset is enough).
    expect(servingDecisions('bedrock', inputs(entries, { floors: COMMITTED_FLOORS })).filter((decision) => decision.key.startsWith('proposeContractTerms')).map((decision) => decision.reasons)).toEqual([['floor_unset'], ['floor_unset']]);
    const oneUnset = floorsAt('0.9');
    const withNull = { ...oneUnset, proposeContractTerms: { ...oneUnset.proposeContractTerms, precision: { ...oneUnset.proposeContractTerms.precision, rounding: null } } };
    expect(reasonsOf(servingDecisions('bedrock', inputs(entries, { floors: withNull })))['proposeContractTerms/default']).toEqual(['floor_unset']);
    // A floor raised above what the entry scored (the local reference's 5 wrong amounts on unfaithful cases): off until met.
    expect(reasonsOf(servingDecisions('bedrock', inputs(entries, { floors: floorsAt('1') })))['proposeContractTerms/default']).toEqual(['below_floor']);
    expect(() => readGatewayConfig(PRODUCTION, inputs(entries, { floors: floorsAt('1') }))).toThrow(/below_floor/);
    // The larger model's price unconfirmed: only the ambiguous variant is off.
    const ambiguousModel = PROMPTS.proposeContractTerms.models.bedrock.ambiguous;
    const unconfirmedLarger = confirmed.map((price) => (price.provider === 'bedrock' && price.modelId === ambiguousModel ? { ...price, confirmed: false } : price));
    expect(reasonsOf(servingDecisions('bedrock', inputs(entries, { prices: unconfirmedLarger })))).toMatchObject({ 'proposeContractTerms/default': [], 'proposeContractTerms/ambiguous': ['price_unconfirmed'] });
    // A prompt version edited in place (another content hash), another model, another variant: no entry.
    const edited = { ...contractEntry('bedrock', 'default'), prompt_sha256: '0'.repeat(64) };
    const otherModel = { ...contractEntry('bedrock', 'default'), model_id: 'synthetic-other-model' };
    const otherVariant = { ...contractEntry('bedrock', 'ambiguous'), model_id: contractEntry('bedrock', 'default').model_id };
    for (const entry of [edited, otherModel, otherVariant]) {
      expect(reasonsOf(servingDecisions('bedrock', inputs([entry])))['proposeContractTerms/default'], entry.model_id).toEqual(['no_entry']);
    }
  });

  it('makes a contract entry whose permitted run is pending, or missing, evaluable only (F5 (a))', () => {
    for (const permitted of ['pending', 'absent'] as const) {
      const entries = [contractEntry('bedrock', 'default', permitted)];
      const decisions = servingDecisions('bedrock', inputs(entries));
      expect(decisions.find((decision) => decision.key === 'proposeContractTerms/default'), permitted).toEqual({ key: 'proposeContractTerms/default', served: false, evaluable: true, reasons: ['permitted_pending'] });
      expect(keys(servedSet(decisions, 'served'))).toEqual([]);
      expect(keys(servedSet(decisions, 'evaluable'))).toEqual(['proposeContractTerms/default']);
      // Nothing served: the web's and the request paths' read is refused; the permitted run's read is not.
      expect(() => readGatewayConfig(PRODUCTION, inputs(entries))).toThrow(/permitted_pending/);
      const forRun = readGatewayConfig(PRODUCTION, { ...inputs(entries), serving: 'evaluable' });
      expect({ served: keys(forRun.served), evaluable: keys(forRun.evaluable), unevaluable: unservedCount(forRun, 'evaluable') }).toEqual({ served: [], evaluable: ['proposeContractTerms/default'], unevaluable: 4 });
    }
    // Pending beside another reason is neither served nor evaluable.
    expect(servingDecisions('bedrock', inputs([contractEntry('bedrock', 'default', 'pending')], { floors: COMMITTED_FLOORS }))[0]).toMatchObject({ served: false, evaluable: false, reasons: ['floor_unset', 'permitted_pending'] });
  });

  it('serves nothing on an entry typed by hand with a count the gate never records, or for a purpose without a set (review M3)', () => {
    const file = (entries: readonly unknown[]) => ({ format: BASELINE_FORMAT, synthetic: true, note: 'SYNTHETIC', entries });
    expect(parseBaseline(file([contractEntry('bedrock', 'default')])).entries).toHaveLength(1);
    expect(() => parseBaseline(file([{ ...contractEntry('bedrock', 'default'), faithful_wrong_verified: 1 }]))).toThrow();
    expect(() => parseBaseline(file([{ ...contractEntry('bedrock', 'default'), conflicts: { expected: 9, unflagged: 1 } }]))).toThrow();
    expect(() => parseBaseline(file([{ ...contractEntry('bedrock', 'default'), twins: { pairs: 3, differing: 1 } }]))).toThrow();
    expect(() => parseBaseline(file([{ ...contractEntry('bedrock', 'default'), permitted: 'recorded' }]))).toThrow();
    const narrative = narrativeEntry('bedrock');
    expect(() => parseBaseline(file([{ ...narrative, failures: 1 }]))).toThrow();
    expect(() => parseBaseline(file([{ ...narrative, purpose: 'suggestEvidenceRequests' }]))).toThrow();
    expect(() => parseBaseline(file([{ ...narrative, extra: true }]))).toThrow();
    expect(() => parseBaseline({ ...file([narrative]), format: 'tp-model-eval-baseline/2' })).toThrow();
    // The two purposes with no set are never served, whatever else holds.
    expect(Object.entries(SERVING_RULES).filter(([, rule]) => rule === 'no_set').map(([purpose]) => purpose).sort()).toEqual(['readDenialLetter', 'suggestEvidenceRequests']);
    for (const provider of ['bedrock', 'anthropic'] as const) {
      const decisions = servingDecisions(provider, inputs([contractEntry(provider, 'default'), contractEntry(provider, 'ambiguous'), narrativeEntry(provider)]));
      expect(decisions.filter((decision) => !decision.served).map((decision) => [decision.key, decision.reasons]), provider).toEqual([
        ['readDenialLetter/default', ['no_set']],
        ['suggestEvidenceRequests/default', ['no_set']],
      ]);
    }
  });

  it('decides on the committed baseline, floors and prices by default', () => {
    expect(COMMITTED_SERVING).toEqual({ baseline: COMMITTED_BASELINE, floors: COMMITTED_FLOORS, prices: PRICES });
    expect(servingDecisions('bedrock')).toEqual(servingDecisions('bedrock', COMMITTED_SERVING));
    // The local entries the gate recorded serve the local provider's two purposes with a set under the same rules (no floor, no permitted run).
    expect(keys(servedSet(servingDecisions('local'), 'served'))).toEqual(['draftPacketNarrative/default', 'proposeContractTerms/default']);
  });

  it('names every variant a prompt pins or a preparation asks for, and offers a purpose only when some variant of it is served', () => {
    for (const purpose of MODEL_PURPOSES) {
      for (const provider of ['bedrock', 'anthropic', 'local'] as const) {
        for (const variant of Object.keys(PROMPTS[purpose].models[provider])) {
          expect(PURPOSE_VARIANTS[purpose], `${purpose} ${provider}`).toContain(variant);
          expect(ALL_SERVED.keys.has(servedKey(purpose, variant))).toBe(true);
        }
      }
    }
    expect(keys(ALL_SERVED)).toEqual(['draftPacketNarrative/default', 'proposeContractTerms/ambiguous', 'proposeContractTerms/default', 'readDenialLetter/default', 'suggestEvidenceRequests/default']);
    const on = { killSwitch: false, readDenialLetter: true };
    expect(offeredPurposes(on, ALL_SERVED)).toEqual({ proposeContractTerms: true, readDenialLetter: true, draftPacketNarrative: true, suggestEvidenceRequests: true });
    expect(offeredPurposes({ ...on, readDenialLetter: false }, ALL_SERVED)).toMatchObject({ readDenialLetter: false, proposeContractTerms: true });
    expect(Object.values(offeredPurposes({ ...on, killSwitch: true }, ALL_SERVED))).toEqual([false, false, false, false]);
    // The ambiguous variant alone still offers contracts (the default call is then refused on its own).
    expect(offeredPurposes(on, { keys: new Set(['proposeContractTerms/ambiguous'] as const) })).toEqual({ proposeContractTerms: true, readDenialLetter: false, draftPacketNarrative: false, suggestEvidenceRequests: false });
    expect(Object.values(offeredPurposes(on, { keys: new Set() }))).toEqual([false, false, false, false]);
  });

  it('lists the models the prompts pin for a provider', () => {
    expect(pinnedModels('local')).toEqual(['local-deterministic']);
    expect(pinnedModels('bedrock').length).toBeGreaterThanOrEqual(1);
  });
});

describe('createProvider', () => {
  const every = { served: ALL_SERVED, evaluable: ALL_SERVED, decisions: [] };

  it('builds the provider the configuration names', () => {
    expect(createProvider({ production: false, provider: 'bedrock', region: 'us-east-1', endpoint: undefined, ...every })).toBeInstanceOf(BedrockProvider);
    expect(createProvider({ production: false, provider: 'anthropic', apiKey: 'sk-synthetic', ...every })).toBeInstanceOf(AnthropicProvider);
    expect(createProvider({ production: false, provider: 'local', fixturesDir: undefined, ...every })).toBeInstanceOf(LocalDeterministicProvider);
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-local-model-'));
    try {
      expect(createProvider({ production: false, provider: 'local', fixturesDir: dir, ...every })).toBeInstanceOf(LocalDeterministicProvider);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
