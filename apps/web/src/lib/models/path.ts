import {
  CallLimiter,
  DuplicateModelCallError,
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
  type ServedSet,
  createProvider,
  featuresIn,
  gatewayServing,
  offeredPurposes,
  readGatewayConfig,
  unservedCount,
} from '@tp/model-gateway';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';

import { type ModelProblem } from './notices';

export { MODEL_PROBLEMS, MODEL_PROBLEM_TEXT, type ModelProblem } from './notices';

/**
 * The model gateway as the web app uses it (PRD 14; docs/adr/0048 and 0052). The model path is the
 * gateway's configuration (MODEL_PROVIDER and its settings): Bedrock or Anthropic's API in production,
 * the local deterministic provider elsewhere. When the configuration is refused (production with a
 * provider for which no model feature has passed its evaluation, a missing region or key), every model
 * feature is off and the screens offer hand entry, exactly as with the kill switch: the product never
 * depends on a model. In production on a real provider each feature, and each contract variant, is served
 * only once it has passed its own evaluation (@tp/model-gateway evaluated.ts; docs/adr/0070, Part 2): the
 * path carries what is served, so the screens offer only that, and the gateway works out the same set
 * itself, so a call of anything else is refused as `not_evaluated` with hand entry as the next step.
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
  | {
      readonly kind: 'available';
      readonly production: boolean;
      readonly provider: () => ModelProvider;
      /**
       * What the configuration serves (readGatewayConfig's `served`). A path a test gives without it serves
       * what a gateway on its provider serves (gatewayServing): every key but in production on a real provider.
       */
      readonly served?: ServedSet;
    }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** The path tests and development use when none is given: the local provider with nothing registered, which refuses every call. */
export const UNREGISTERED_LOCAL_MODELS: ModelPath = { kind: 'available', production: false, provider: () => new LocalDeterministicProvider() };

/** What an available path serves: the configuration's set, or the one its gateway would work out. */
function servedOf(models: Extract<ModelPath, { kind: 'available' }>): ServedSet {
  return models.served ?? gatewayServing(models.production, models.provider().kind);
}

/**
 * The model path the environment configures. A local provider with a directory of fixed outputs reads
 * the directory on each call, so the e2e suite can add an output while the server runs.
 */
export function modelPathFromEnv(env: Readonly<Record<string, string | undefined>>, logger: Logger): ModelPath {
  try {
    const config = readGatewayConfig(env);
    const unserved = unservedCount(config);
    if (unserved > 0) {
      logger.warn('some model features are off: they have not passed their evaluation for the configured model', { error_code: 'MODEL_FEATURES_NOT_EVALUATED', record_count: unserved });
    }
    if (config.provider === 'local' && config.fixturesDir !== undefined) {
      const dir = config.fixturesDir;
      return { kind: 'available', production: config.production, provider: () => LocalDeterministicProvider.fromDirectory(dir), served: config.served };
    }
    const provider = createProvider(config);
    return { kind: 'available', production: config.production, provider: () => provider, served: config.served };
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
 * Which model features a screen may offer the practice now (test matrix MOD-06; docs/adr/0070, Part 2):
 * none when the path is unavailable or the kill switch reaches the practice, none the path does not
 * serve, and the denial-letter reader only when its own flag turns it on; the gateway's own rule
 * (offeredPurposes). Read in the request's transaction.
 */
export async function modelFeatures(scope: PracticeScope<ScopeClient>, services: ModelServices, practiceId: string): Promise<ModelFeatures> {
  const models = modelPathOf(services);
  if (models.kind === 'unavailable') {
    return OFF;
  }
  return offeredPurposes(await featuresIn(scope.client, practiceId), servedOf(models));
}

/**
 * The contract refusals with words of their own, by the code the gateway refuses with, each to the problem whose words
 * give its case the next step it can take (notices.ts). The contract's length (`too_long`, contractTermsSpec.prepare's
 * cap on the request's bytes; docs/adr/0070, Part 3, P11): the person reads that the document is too long to send, not
 * that the input cannot be sent as it is, since a second try meets the same cap and hand entry is the way on. The
 * contract screen's refusals (docs/adr/0070, Part 3): the document holds an identifier from the practice's patient
 * records (`names_patient`); it could not be checked, above the identifier bound (`screen_unavailable`: hand entry,
 * since a second try meets the same bound); or the check's own read failed (`screen_failed`: try again, since the next
 * click reads again). A check the gateway did not issue (`screen_invalid`) is the code's mistake, not the document's,
 * so the person is never told the input is at fault (the generic `refused`): the document was not checked, and a second
 * try meets the same mistake, so it reads as `screen_unavailable`; the operator's log names it apart
 * (MODEL_INPUT_SCREEN_INVALID). Mapped before the generic `refused`, so the screen says which.
 */
const CONTRACT_PROBLEMS: Readonly<Record<string, ModelProblem>> = {
  too_long: 'too_long',
  names_patient: 'names_patient',
  screen_unavailable: 'screen_unavailable',
  screen_failed: 'screen_failed',
  screen_invalid: 'screen_unavailable',
};

/** The problem a gateway error is, or null for an error that is not the model's (rethrown by the caller). */
export function modelProblem(error: unknown): ModelProblem | null {
  if (error instanceof ModelFeatureOffError) {
    return error.reason === 'not_evaluated' ? 'not_evaluated' : 'off';
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
  if (error instanceof InputRefusedError && Object.hasOwn(CONTRACT_PROBLEMS, error.code)) {
    return CONTRACT_PROBLEMS[error.code] ?? 'refused';
  }
  if (error instanceof InputRefusedError || error instanceof PhiBoundaryError) {
    return 'refused';
  }
  return null;
}
