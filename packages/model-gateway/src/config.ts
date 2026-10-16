import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

import { GatewayConfigError } from './errors';
import { PRICES, type ModelPrice } from './prices';
import { PROMPTS } from './prompts';
import { PROVIDER_KINDS, type ModelProvider, type ProviderKind } from './provider';
import { AnthropicProvider, anthropicClient } from './providers/anthropic';
import { BedrockProvider } from './providers/bedrock';
import { LocalDeterministicProvider } from './providers/local';

/**
 * The model path is configuration (PRD 14, Provider and data path; PRD 20; docs/adr/0048):
 *
 * - MODEL_PROVIDER: bedrock (the default in production), anthropic (the HIPAA-ready alternative) or
 *   local (the default elsewhere: the deterministic provider, which is not a model).
 * - bedrock: BEDROCK_REGION (or AWS_REGION); BEDROCK_ENDPOINT optionally names the VPC endpoint's
 *   https URL (with private DNS on the endpoint, the regional name already resolves to it). Credentials
 *   come from the task role.
 * - anthropic: ANTHROPIC_API_KEY, from the environment's secret.
 * - local: MODEL_LOCAL_FIXTURES_DIR optionally names a directory of fixed outputs.
 *
 * With NODE_ENV=production the local provider is refused (except for the e2e suite's production build,
 * TP_ALLOW_LOCAL_PROVIDERS=e2e, as for the other local implementations), and so is a real provider
 * whose pinned models' prices are not confirmed in config/models.json. Outside production a real
 * provider may be configured for synthetic evaluation calls only: the gateway refuses to send any
 * practice's material to it (PhiBoundaryError; PRD 14: "No PHI is ever sent to a model from a
 * development environment, a test, or a CI job").
 */

export type GatewayConfig =
  | { readonly production: boolean; readonly provider: 'bedrock'; readonly region: string; readonly endpoint: string | undefined }
  | { readonly production: boolean; readonly provider: 'anthropic'; readonly apiKey: string }
  | { readonly production: boolean; readonly provider: 'local'; readonly fixturesDir: string | undefined };

type Env = Readonly<Record<string, string | undefined>>;

function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw === undefined || raw === '' ? undefined : raw;
}

function required(env: Env, name: string, why: string): string {
  const found = value(env, name);
  if (found === undefined) {
    throw new GatewayConfigError(`${name} is required ${why}`);
  }
  return found;
}

/** The models every current prompt version pins for a provider. */
export function pinnedModels(provider: ProviderKind): string[] {
  return [...new Set(Object.values(PROMPTS).flatMap((prompt) => Object.values(prompt.models[provider])))].sort();
}

/** Refuses a provider whose pinned models have no confirmed price. */
export function assertPricesConfirmed(provider: ProviderKind, prices: readonly ModelPrice[] = PRICES): void {
  for (const modelId of pinnedModels(provider)) {
    const price = prices.find((entry) => entry.provider === provider && entry.modelId === modelId);
    if (price?.confirmed !== true) {
      throw new GatewayConfigError(`${provider} is refused when NODE_ENV is production until config/models.json confirms the price of every model the prompts pin`);
    }
  }
}

export function readGatewayConfig(env: Env = process.env, prices: readonly ModelPrice[] = PRICES): GatewayConfig {
  const production = value(env, 'NODE_ENV') === 'production';
  const provider = value(env, 'MODEL_PROVIDER') ?? (production ? 'bedrock' : 'local');
  if (!(PROVIDER_KINDS as readonly string[]).includes(provider)) {
    throw new GatewayConfigError('MODEL_PROVIDER is bedrock, anthropic or local');
  }
  if (provider === 'local') {
    if (production && value(env, 'TP_ALLOW_LOCAL_PROVIDERS') !== 'e2e') {
      throw new GatewayConfigError('MODEL_PROVIDER=local is refused when NODE_ENV is production (it selects a local implementation)');
    }
    return { production, provider, fixturesDir: value(env, 'MODEL_LOCAL_FIXTURES_DIR') };
  }
  if (production) {
    assertPricesConfirmed(provider as ProviderKind, prices);
  }
  if (provider === 'anthropic') {
    return { production, provider, apiKey: required(env, 'ANTHROPIC_API_KEY', 'when MODEL_PROVIDER is anthropic') };
  }
  const endpoint = value(env, 'BEDROCK_ENDPOINT');
  if (endpoint !== undefined && !endpoint.startsWith('https://')) {
    throw new GatewayConfigError('BEDROCK_ENDPOINT is an https URL');
  }
  return { production, provider: 'bedrock', region: value(env, 'BEDROCK_REGION') ?? required(env, 'AWS_REGION', '(or BEDROCK_REGION) when MODEL_PROVIDER is bedrock'), endpoint };
}

/** Each attempt's limit (PRD 14, Operational limits: 60 seconds per call, one retry). */
export const CALL_TIMEOUT_MS = 60_000;

/** The provider the configuration names, with its SDK client built for one attempt per call. */
export function createProvider(config: GatewayConfig): ModelProvider {
  switch (config.provider) {
    case 'bedrock':
      return new BedrockProvider({ client: new BedrockRuntimeClient({ region: config.region, endpoint: config.endpoint, maxAttempts: 1 }) });
    case 'anthropic':
      return new AnthropicProvider({ client: anthropicClient(config.apiKey, CALL_TIMEOUT_MS), timeoutMs: CALL_TIMEOUT_MS });
    case 'local':
      return config.fixturesDir === undefined ? new LocalDeterministicProvider() : LocalDeterministicProvider.fromDirectory(config.fixturesDir);
  }
}
