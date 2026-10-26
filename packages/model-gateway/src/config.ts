import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

import { GatewayConfigError } from './errors';
import { COMMITTED_SERVING, type Serving, type ServingDecision, type ServingInputs, servedSet, servingDecisions } from './evaluated';
import { PROMPTS } from './prompts';
import { PROVIDER_KINDS, type ModelProvider, type ProviderKind } from './provider';
import { AnthropicProvider, anthropicClient } from './providers/anthropic';
import { BedrockProvider } from './providers/bedrock';
import { LocalDeterministicProvider } from './providers/local';
import { ALL_SERVED, type ServedSet } from './purposes';

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
 * TP_ALLOW_LOCAL_PROVIDERS=e2e, as for the other local implementations). A real provider in production
 * serves each model feature, and each contract variant, only once it has passed its own evaluation for
 * the model its prompt pins, with that model's price confirmed in config/models.json (./evaluated.ts;
 * docs/adr/0070, Part 2): the configuration carries those decisions, and the keys served and evaluable,
 * and is refused outright only when no key is served at all (or, for the permitted run's read, none is
 * evaluable), so the web's unavailable path and the worker's exit 2 hold for that case as before. The
 * gateway decides what it serves from the same committed files itself; the sets here are for the screens'
 * feature list and the log line. Outside production a real provider may be configured for synthetic
 * evaluation calls only, and serves every key: the gateway refuses to send any practice's material to it
 * (PhiBoundaryError; PRD 14: "No PHI is ever sent to a model from a development environment, a test, or a
 * CI job").
 */

/** What every configuration carries of serving: every key, the decisions empty, unless production on a real provider decides them. */
interface ServingConfig {
  readonly production: boolean;
  /** The keys the gateway serves (ALL_SERVED but in production on a real provider). */
  readonly served: ServedSet;
  /** The keys the permitted run may call: those served, and those waiting only on the permitted run. */
  readonly evaluable: ServedSet;
  /** Each pinned key's decision, with its reasons; empty unless production on a real provider. */
  readonly decisions: readonly ServingDecision[];
}

export type GatewayConfig =
  | (ServingConfig & { readonly provider: 'bedrock'; readonly region: string; readonly endpoint: string | undefined })
  | (ServingConfig & { readonly provider: 'anthropic'; readonly apiKey: string })
  | (ServingConfig & { readonly provider: 'local'; readonly fixturesDir: string | undefined });

/** What readGatewayConfig decides serving on (the committed files by default), and which set must hold a key. */
export interface ServingOptions extends Partial<ServingInputs> {
  /** 'evaluable' for the permitted run's own read (apps/worker/src/models/permitted-cli.ts); 'served' otherwise. */
  readonly serving?: Serving;
}

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

const EVERY_KEY = { served: ALL_SERVED, evaluable: ALL_SERVED, decisions: [] } as const;

/**
 * Serving for a real provider in production: the decisions on the given (by default the committed) files,
 * refused when the set asked for holds no key. The message names the reasons as codes only.
 */
function productionServingConfig(provider: ProviderKind, options: ServingOptions): Pick<ServingConfig, 'served' | 'evaluable' | 'decisions'> {
  const decisions = servingDecisions(provider, {
    baseline: options.baseline ?? COMMITTED_SERVING.baseline,
    floors: options.floors ?? COMMITTED_SERVING.floors,
    prices: options.prices ?? COMMITTED_SERVING.prices,
  });
  const served = servedSet(decisions, 'served');
  const evaluable = servedSet(decisions, 'evaluable');
  if ((options.serving === 'evaluable' ? evaluable : served).keys.size === 0) {
    const reasons = [...new Set(decisions.flatMap((decision) => decision.reasons))].sort();
    throw new GatewayConfigError(
      `${provider} is refused when NODE_ENV is production: no model feature has passed its evaluation for ${provider} (${reasons.join(', ')}; eval/baseline.json, eval/floors.json and config/models.json, docs/runbooks/model-evaluation.md)`,
    );
  }
  return { served, evaluable, decisions };
}

export function readGatewayConfig(env: Env = process.env, options: ServingOptions = {}): GatewayConfig {
  const production = value(env, 'NODE_ENV') === 'production';
  const provider = value(env, 'MODEL_PROVIDER') ?? (production ? 'bedrock' : 'local');
  if (!(PROVIDER_KINDS as readonly string[]).includes(provider)) {
    throw new GatewayConfigError('MODEL_PROVIDER is bedrock, anthropic or local');
  }
  if (provider === 'local') {
    if (production && value(env, 'TP_ALLOW_LOCAL_PROVIDERS') !== 'e2e') {
      throw new GatewayConfigError('MODEL_PROVIDER=local is refused when NODE_ENV is production (it selects a local implementation)');
    }
    return { production, provider, fixturesDir: value(env, 'MODEL_LOCAL_FIXTURES_DIR'), ...EVERY_KEY };
  }
  const serving = production ? productionServingConfig(provider as ProviderKind, options) : EVERY_KEY;
  if (provider === 'anthropic') {
    return { production, provider, apiKey: required(env, 'ANTHROPIC_API_KEY', 'when MODEL_PROVIDER is anthropic'), ...serving };
  }
  const endpoint = value(env, 'BEDROCK_ENDPOINT');
  if (endpoint !== undefined && !endpoint.startsWith('https://')) {
    throw new GatewayConfigError('BEDROCK_ENDPOINT is an https URL');
  }
  return { production, provider: 'bedrock', region: value(env, 'BEDROCK_REGION') ?? required(env, 'AWS_REGION', '(or BEDROCK_REGION) when MODEL_PROVIDER is bedrock'), endpoint, ...serving };
}

/** How many pinned keys the configuration does not serve (the count the web and the worker log once; 0 but in production on a real provider). */
export function unservedCount(config: Pick<ServingConfig, 'decisions'>, which: Serving = 'served'): number {
  return config.decisions.filter((decision) => !(which === 'served' ? decision.served : decision.evaluable)).length;
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
