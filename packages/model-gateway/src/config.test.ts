import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertPricesConfirmed, createProvider, pinnedModels, readGatewayConfig } from './config';
import { GatewayConfigError } from './errors';
import { EVALUATED_PURPOSES, RECORDED_EVALUATIONS, type RecordedEvaluation, assertEvaluated, unevaluatedModels } from './evaluated';
import { PROMPTS } from './prompts';
import { type ModelPrice, PRICES } from './prices';
import { AnthropicProvider } from './providers/anthropic';
import { BedrockProvider } from './providers/bedrock';
import { LocalDeterministicProvider } from './providers/local';

/** The model path is configuration (PRD 14 and 20; docs/adr/0048). */

const confirmed: readonly ModelPrice[] = PRICES.map((price) => ({ ...price, confirmed: true }));

/** What eval --record would write for every current prompt version and pinned model of a provider (SYNTHETIC: no run made). */
function recordedFor(provider: 'bedrock' | 'anthropic'): RecordedEvaluation[] {
  return EVALUATED_PURPOSES.flatMap((purpose) =>
    [...new Set(Object.values(PROMPTS[purpose].models[provider]))].map((modelId) => ({ purpose, prompt_version: PROMPTS[purpose].id, prompt_sha256: PROMPTS[purpose].sha256, provider, model_id: modelId })),
  );
}
const evaluated = [...recordedFor('bedrock'), ...recordedFor('anthropic')];

describe('readGatewayConfig', () => {
  it('uses the local deterministic provider outside production, and Bedrock by default in production', () => {
    expect(readGatewayConfig({})).toEqual({ production: false, provider: 'local', fixturesDir: undefined });
    expect(readGatewayConfig({ MODEL_LOCAL_FIXTURES_DIR: '/tmp/x' })).toMatchObject({ fixturesDir: '/tmp/x' });
    expect(readGatewayConfig({ NODE_ENV: 'production', AWS_REGION: 'us-east-1' }, confirmed, evaluated)).toEqual({ production: true, provider: 'bedrock', region: 'us-east-1', endpoint: undefined });
  });

  it('reads Bedrock’s region and optional VPC endpoint', () => {
    expect(readGatewayConfig({ MODEL_PROVIDER: 'bedrock', BEDROCK_REGION: 'us-west-2', AWS_REGION: 'us-east-1', BEDROCK_ENDPOINT: 'https://vpce.synthetic.example' })).toEqual({
      production: false,
      provider: 'bedrock',
      region: 'us-west-2',
      endpoint: 'https://vpce.synthetic.example',
    });
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'bedrock' })).toThrow(/AWS_REGION/);
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'bedrock', AWS_REGION: 'us-east-1', BEDROCK_ENDPOINT: 'http://plain' })).toThrow(/https/);
  });

  it('needs the API key for Anthropic’s API', () => {
    expect(readGatewayConfig({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: ' sk-synthetic ' })).toEqual({ production: false, provider: 'anthropic', apiKey: 'sk-synthetic' });
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '  ' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('refuses an unknown provider', () => {
    expect(() => readGatewayConfig({ MODEL_PROVIDER: 'other' })).toThrow(GatewayConfigError);
  });

  it('refuses the local provider in production, except for the e2e suite’s build', () => {
    expect(() => readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'local' })).toThrow(/refused/);
    expect(readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'local', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' })).toMatchObject({ production: true, provider: 'local' });
  });

  it('refuses a real provider in production until its pinned models’ prices are confirmed', () => {
    // As the repository ships: the list prices are not confirmed against the providers’ price lists.
    expect(() => readGatewayConfig({ NODE_ENV: 'production', AWS_REGION: 'us-east-1' })).toThrow(/confirms the price/);
    expect(() => readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toThrow(/confirms the price/);
    expect(readGatewayConfig({ NODE_ENV: 'production', MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }, confirmed, evaluated)).toMatchObject({ provider: 'anthropic' });
    expect(() => assertPricesConfirmed('bedrock', [])).toThrow(GatewayConfigError);
    expect(() => assertPricesConfirmed('local')).not.toThrow();
  });

  it('refuses a real provider in production until the evaluation gate has recorded every current prompt version and pinned model', () => {
    // Prices confirmed, but no evaluation recorded for the provider: refused, the model features off.
    expect(() => readGatewayConfig({ NODE_ENV: 'production', AWS_REGION: 'us-east-1' }, confirmed, recordedFor('anthropic'))).toThrow(/records the evaluation gate/);
    // The contract prompt's larger model, for contracts marked ambiguous, needs its own evaluation.
    const withoutAmbiguous = recordedFor('bedrock').filter((entry) => entry.model_id !== PROMPTS.proposeContractTerms.models.bedrock.ambiguous);
    expect(unevaluatedModels('bedrock', withoutAmbiguous)).toEqual([{ purpose: 'proposeContractTerms', promptVersion: PROMPTS.proposeContractTerms.id, modelId: PROMPTS.proposeContractTerms.models.bedrock.ambiguous }]);
    // A prompt version edited in place (another content hash) is not the one evaluated.
    const edited = recordedFor('bedrock').map((entry) => (entry.purpose === 'draftPacketNarrative' ? { ...entry, prompt_sha256: '0'.repeat(64) } : entry));
    expect(() => assertEvaluated('bedrock', edited)).toThrow(GatewayConfigError);
    expect(() => assertEvaluated('bedrock', recordedFor('bedrock'))).not.toThrow();
    // Outside production nothing is asked: a synthetic evaluation run is how the first entry is recorded.
    expect(readGatewayConfig({ MODEL_PROVIDER: 'bedrock', AWS_REGION: 'us-east-1' }, PRICES, [])).toMatchObject({ provider: 'bedrock' });
    // As the repository ships: the baseline records the local provider only, so production refuses both real providers.
    expect(RECORDED_EVALUATIONS.every((entry) => entry.provider === 'local')).toBe(true);
    expect(() => assertEvaluated('bedrock')).toThrow(GatewayConfigError);
    expect(() => assertEvaluated('anthropic')).toThrow(GatewayConfigError);
    expect(() => assertEvaluated('local')).not.toThrow();
  });

  it('lists the models the prompts pin for a provider', () => {
    expect(pinnedModels('local')).toEqual(['local-deterministic']);
    expect(pinnedModels('bedrock').length).toBeGreaterThanOrEqual(1);
  });
});

describe('createProvider', () => {
  it('builds the provider the configuration names', () => {
    expect(createProvider({ production: false, provider: 'bedrock', region: 'us-east-1', endpoint: undefined })).toBeInstanceOf(BedrockProvider);
    expect(createProvider({ production: false, provider: 'anthropic', apiKey: 'sk-synthetic' })).toBeInstanceOf(AnthropicProvider);
    expect(createProvider({ production: false, provider: 'local', fixturesDir: undefined })).toBeInstanceOf(LocalDeterministicProvider);
    const dir = mkdtempSync(path.join(tmpdir(), 'tp-local-model-'));
    try {
      expect(createProvider({ production: false, provider: 'local', fixturesDir: dir })).toBeInstanceOf(LocalDeterministicProvider);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
