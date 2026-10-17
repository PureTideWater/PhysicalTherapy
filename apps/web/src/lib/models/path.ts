import {
  CallLimiter,
  DuplicateModelCallError,
  FLAGGED_PURPOSES,
  GatewayConfigError,
  InputRefusedError,
  LocalDeterministicProvider,
  MODEL_PURPOSES,
  ModelBudgetExceededError,
  ModelBusyError,
  ModelCallFailedError,
  ModelFeatureOffError,
  ModelGateway,
  type ModelProvider,
  type ModelPurpose,
  PhiBoundaryError,
  PostgresModelCallStore,
  createProvider,
  featuresIn,
  readGatewayConfig,
} from '@tp/model-gateway';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';

import { type ModelProblem } from './notices';

export { MODEL_PROBLEMS, MODEL_PROBLEM_TEXT, type ModelProblem } from './notices';

/**
 * The model gateway as the web app uses it (PRD 14; docs/adr/0048 and 0052). The model path is the
 * gateway's configuration (MODEL_PROVIDER and its settings): Bedrock or Anthropic's API in production,
 * the local deterministic provider elsewhere. When the configuration is refused (production with a
 * provider whose prices are unconfirmed, a missing region or key), every model feature is off and the
 * screens offer hand entry, exactly as with the kill switch: the product never depends on a model.
 *
 * A gateway is built per request for the person acting: its calls are logged in model_call in that
 * person's name, in the practice's scope (PostgresModelCallStore), and its flags and budget are read the
 * same way. Screens ask modelFeatures() what to offer, in the request's own transaction.
 *
 * The gateway's own reads and writes (the flags, the budget's hold, the model_call row) go through the
 * services' model pool, never the request's (docs/adr/0055): the request's transaction holds a connection of
 * its pool while the model answers, and a second connection from the same pool for the gateway would let
 * enough calls at once take every connection and wait forever for one more. The process also caps the calls
 * in flight (CallLimiter: four at once, two per practice), so model calls hold at most four of the request
 * pool's connections and the model pool always has one for each.
 */

export type ModelPath =
  | { readonly kind: 'available'; readonly production: boolean; readonly provider: () => ModelProvider }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The path tests and development use when none is given: the local provider with nothing registered, which refuses every call. */
export const UNREGISTERED_LOCAL_MODELS: ModelPath = { kind: 'available', production: false, provider: () => new LocalDeterministicProvider() };

/**
 * The model path the environment configures. A local provider with a directory of fixed outputs reads
 * the directory on each call, so the e2e suite can add an output while the server runs.
 */
export function modelPathFromEnv(env: Readonly<Record<string, string | undefined>>, logger: Logger): ModelPath {
  try {
    const config = readGatewayConfig(env);
    if (config.provider === 'local' && config.fixturesDir !== undefined) {
      const dir = config.fixturesDir;
      return { kind: 'available', production: config.production, provider: () => LocalDeterministicProvider.fromDirectory(dir) };
    }
    const provider = createProvider(config);
    return { kind: 'available', production: config.production, provider: () => provider };
  } catch (error) {
    if (error instanceof GatewayConfigError) {
      logger.warn('model features are off: the model path is not configured', { error_code: 'MODEL_PATH_UNAVAILABLE' });
      return { kind: 'unavailable', reason: error.message };
    }
    throw error;
  }
}

/** What a gateway needs of the request's services. */
export interface ModelServices {
  /** The gateway's own pool (the application's login), apart from the one the request's transaction holds. */
  readonly modelPool: ConstructorParameters<typeof PostgresModelCallStore>[0];
  readonly logger: Logger;
  readonly now: () => Date;
}

const limiters = new WeakMap<object, CallLimiter>();

/** The process's cap on model calls in flight, one per set of services (a server builds one). */
export function modelLimiterOf(services: ModelServices): CallLimiter {
  let limiter = limiters.get(services);
  if (limiter === undefined) {
    limiter = new CallLimiter();
    limiters.set(services, limiter);
  }
  return limiter;
}

const injected = new WeakMap<object, ModelPath>();
let configured: ModelPath | undefined;

/**
 * The model path of the services a request runs with: the one a test gave them, or the process's
 * configuration (read once, from the environment).
 */
export function modelPathOf(services: ModelServices): ModelPath {
  return injected.get(services) ?? (configured ??= modelPathFromEnv(process.env, services.logger));
}

/** Gives a set of services its own model path (tests, with a local provider whose outputs they register). */
export function assignModelPath(services: ModelServices, path: ModelPath): void {
  injected.set(services, path);
}

/** A gateway for the person acting, or null when the model path is unavailable. */
export function gatewayFor(services: ModelServices, userId: string): ModelGateway | null {
  const models = modelPathOf(services);
  if (models.kind === 'unavailable') {
    return null;
  }
  return new ModelGateway({
    provider: models.provider(),
    store: new PostgresModelCallStore(services.modelPool, { kind: 'user', userId }),
    logger: services.logger,
    production: models.production,
    now: services.now,
    limiter: modelLimiterOf(services),
  });
}

export type ModelFeatures = Readonly<Record<ModelPurpose, boolean>>;

const OFF: ModelFeatures = Object.fromEntries(MODEL_PURPOSES.map((purpose) => [purpose, false])) as Record<ModelPurpose, boolean>;

/**
 * Which model features a screen may offer the practice now (test matrix MOD-06): none when the path is
 * unavailable or the kill switch reaches the practice, and the denial-letter reader only when its own
 * flag turns it on. Read in the request's transaction.
 */
export async function modelFeatures(scope: PracticeScope<ScopeClient>, services: ModelServices, practiceId: string): Promise<ModelFeatures> {
  if (modelPathOf(services).kind === 'unavailable') {
    return OFF;
  }
  const features = await featuresIn(scope.client, practiceId);
  return Object.fromEntries(MODEL_PURPOSES.map((purpose) => [purpose, !features.killSwitch && (!FLAGGED_PURPOSES.has(purpose) || features.readDenialLetter)])) as Record<ModelPurpose, boolean>;
}

/** The problem a gateway error is, or null for an error that is not the model's (rethrown by the caller). */
export function modelProblem(error: unknown): ModelProblem | null {
  if (error instanceof ModelFeatureOffError) {
    return 'off';
  }
  if (error instanceof ModelBudgetExceededError) {
    return 'budget';
  }
  if (error instanceof ModelBusyError) {
    return 'busy';
  }
  if (error instanceof ModelCallFailedError || error instanceof DuplicateModelCallError) {
    return 'failed';
  }
  if (error instanceof InputRefusedError || error instanceof PhiBoundaryError) {
    return 'refused';
  }
  return null;
}
