import type { Logger } from '@tp/observability';

import { CALL_TIMEOUT_MS } from './config';
import { type Serving, gatewayServing } from './evaluated';
import { DuplicateModelCallError, GatewayError, InputRefusedError, ModelBudgetExceededError, ModelBusyError, ModelCallFailedError, ModelFeatureOffError, PhiBoundaryError } from './errors';
import type { ContractPagesInput, ContractTermsProposal } from './functions/contract-terms';
import type { DenialLetterInput, DenialLetterProposal } from './functions/denial-letter';
import type { EvidenceRequestsInput, EvidenceRequestsProposal } from './functions/evidence-requests';
import type { NarrativeInput, NarrativeProposal } from './functions/narrative';
import { jsonSha256, sha256Hex } from './hash';
import type { CallLimiter } from './limiter';
import { type ModelPrice, PRICES, callCost, priceOf } from './prices';
import { modelFor } from './prompts';
import { type ModelProvider, type ModelRequest, type ModelResponse, ProviderFailure } from './provider';
import { FLAGGED_PURPOSES, type ModelPurpose, type ServedSet, offeredPurposes, purposeServed, servedKey } from './purposes';
import type { PreparedCall, PurposeSpec } from './spec';
import { PURPOSE_SPECS } from './specs';
import { type ModelCallRecord, type ModelCallStore, actorColumns } from './store';

/**
 * The gateway: the only code that calls a model (PRD 14; CLAUDE.md, Never: "Call a model outside
 * packages/model-gateway"). Each of the four purpose-typed functions goes through one path, in order:
 *
 * 0. The process's cap on calls in flight, when it has one (limiter.ts): a call over it is refused at once,
 *    before anything else is read, so calls waiting on a model never hold all of a task's connections.
 * 1. Serving (./evaluated.ts; docs/adr/0070, Part 2): in production on a real provider, a purpose none of
 *    whose variants has passed its evaluation for the pinned model is refused before anything else is
 *    read, as `not_evaluated`, and the screens fall back to hand entry. A gateway built for the permitted
 *    run (serving 'evaluable') refuses, before that, any call but the run's own (`serving_invalid`).
 * 2. The kill switch, and a v1.5 purpose's own flag (test matrix MOD-06): with either off, nothing is
 *    sent and the caller falls back to hand entry.
 * 3. The PHI boundary: outside production only the local provider, or a synthetic evaluation call with
 *    no practice, may run.
 * 4. The purpose's preparation, which refuses an input that breaks a minimization rule (more than one
 *    patient, an identifier in a narrative's inputs), frames the input as data and names the model
 *    variant (the larger model for a contract marked ambiguous); and the variant served, or the call is
 *    refused as `not_evaluated`.
 * 5. The idempotency key: the SHA-256 of the purpose, prompt version, practice, the caller's request key
 *    and the input hashes. A completed call under the key is never made again (a replay of a job).
 * 6. The practice's daily budget, read (test matrix MOD-05): a practice whose logged spend today has reached
 *    its budget is refused here, with the operator's alert, before anything of its records is read. The read
 *    counts no call in flight, so it never refuses a call the hold (step 9) would make.
 * 7. The caller's own step before a screen (CallContext.beforeScreen), when the purpose has one and the caller
 *    gives one: the web takes the contract screen's limits and records the person's contract_screen_requested
 *    event there, so the event is written exactly when a screen is about to read. Its throw refuses the call.
 * 8. Only then the purpose's screen against records outside the input (a letter naming another patient of the
 *    practice; a contract naming any patient of the practice, through the records check the gateway issued
 *    for the call's practice, ./patient-records.ts): every refusal the gateway can make without it comes
 *    first, so no audited read of a practice's records runs for a call that is refused anyway, and the screen
 *    is the last step that can refuse a call before it is made (combined audit item 120's review, S1). A
 *    screen's refusal is logged with the practice's ID and its code only.
 * 9. The budget's hold: a call is refused once the day's spend, with the holds of the calls in flight, reaches
 *    the budget, with the same alert; crossing it raises another. A call that is made first holds the most it
 *    can cost (its token limit and an upper bound of its input), under the practice's lock, until its row is
 *    written: calls made at once are held to the budget as calls made in turn.
 * 10. The call: no tools, a pinned model and prompt version, 60 seconds per attempt, and one retry under
 *    the same idempotency key when the failure is one a retry can cure.
 * 11. The answer must follow the prompt version's schema; then the purpose's verifier checks it against
 *    the input. Whatever it finds, the result is a proposal a person approves (PRD 14, Untrusted input).
 * 12. One model_call row per call, in the product's own database, with hashes, counts and codes only.
 */

export interface GatewayOptions {
  readonly provider: ModelProvider;
  readonly store: ModelCallStore;
  readonly logger: Logger;
  /** NODE_ENV=production: practices' material may reach a real provider only here. */
  readonly production: boolean;
  readonly timeoutMs?: number;
  readonly prices?: readonly ModelPrice[];
  readonly now?: () => Date;
  /** The process's cap on calls in flight, shared by every gateway the process builds (the web app's: one per server). */
  readonly limiter?: CallLimiter;
  /**
   * Which set the gateway serves; never the set itself, which the gateway works out (./evaluated.ts
   * gatewayServing), so no caller can widen it (the design review's B1). 'served' (the default) is what
   * has passed. 'evaluable' adds the keys waiting only on the in-boundary permitted run, for that run's own
   * gateway (apps/worker/src/models/permitted.ts): it is accepted only when the store acts for a job whose
   * ID is a UUID (the run's ID), so no request path can ask for it, and such a gateway then makes the
   * permitted run's calls and no other (the PR review's N1): a contract proposal whose request key is
   * permittedRequestKey(the job's ID, an example's ID). Any other call through it, a narrative or a
   * contract under another key (another job's work, or this job's under another name), is refused with
   * `serving_invalid` before anything is read, so the wider set is held to the run in code, not by
   * convention.
   */
  readonly serving?: Serving;
}

export interface CallContext {
  /** The practice whose material the call reads; null only for a synthetic evaluation call. */
  readonly practiceId: string | null;
  /**
   * The caller's own key for this call (a mutation's request key, or a job's ID and step): the same
   * key is the same call, so a retry or a replay never pays twice.
   */
  readonly requestKey: string;
  /**
   * The caller's step before the purpose's screen reads (step 7): run once the gateway has refused everything
   * it can without the screen, and only when the purpose screens, so it runs exactly when a screen is about to
   * read and never for a call refused before one. The web's contract proposal takes the screen's limits and
   * records the person's contract_screen_requested event here (docs/adr/0070, Part 3). A throw refuses the call
   * with the caller's own error: nothing is screened, held or sent, and the gateway logs nothing of it (the
   * caller says why). It cannot skip, change or answer the screen, which runs after it on the prepared request.
   */
  readonly beforeScreen?: () => Promise<void>;
}

export interface GatewayResult<P> {
  readonly modelCallId: string;
  /** Whether the verifier found nothing to reject. */
  readonly passed: boolean;
  /** The proposal for a person to review, or null when the answer did not follow the schema. */
  readonly proposal: P | null;
  readonly problems: readonly 'invalid_output'[];
}

const REQUEST_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_TEXT = UUID.source.slice(1, -1);
const PERMITTED_REQUEST_KEY = new RegExp(`^eval:(${UUID_TEXT}):${UUID_TEXT}$`);

/**
 * The request key of one permitted-run call: the run's ID (its job's) and the example's (eval_example row
 * ID), so each example is called once per run. The only key an evaluable gateway accepts (the PR review's N1).
 */
export function permittedRequestKey(runId: string, exampleId: string): string {
  return `eval:${runId}:${exampleId}`;
}
const MICRO = 1_000_000n;

/**
 * The caller's context, read once and frozen: every step of the call, the screen's practice check above all, sees the
 * values the gateway checked, whatever the caller's object does afterwards (a getter, or the caller's own step before
 * the screen changing it), so the screen holds its check to the practice the budget, the hold and the model_call row
 * are for (combined audit item 120's review).
 */
function callContext(context: CallContext): CallContext {
  const { practiceId, requestKey, beforeScreen } = context;
  return Object.freeze(beforeScreen === undefined ? { practiceId, requestKey } : { practiceId, requestKey, beforeScreen });
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

interface Attempted {
  readonly response: ModelResponse | null;
  readonly failure: ProviderFailure | null;
  readonly attempts: 1 | 2;
  readonly latencyMs: number;
}

/** A stop that is not the end of a finished answer, as model_call's error code. */
const STOP_CODES = { max_tokens: 'truncated', refusal: 'refused', other: 'stopped' } as const;

export class ModelGateway {
  private readonly timeoutMs: number;
  private readonly prices: readonly ModelPrice[];
  private readonly now: () => Date;
  /** What this gateway serves: worked out here from the provider and production, never taken from the caller. */
  private readonly served: ServedSet;
  /** The permitted run this gateway was built for (serving 'evaluable'), whose calls alone it makes; null for every other gateway. */
  private readonly permittedRun: string | null;

  constructor(private readonly options: GatewayOptions) {
    this.timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS;
    this.prices = options.prices ?? PRICES;
    this.now = options.now ?? (() => new Date());
    const serving = options.serving ?? 'served';
    const { actor } = options.store;
    if (serving === 'evaluable' && (actor.kind !== 'job' || !UUID.test(actor.jobId))) {
      throw new GatewayError('serving_invalid', 'the evaluable set is served only to the permitted run’s job');
    }
    this.permittedRun = serving === 'evaluable' && actor.kind === 'job' ? actor.jobId : null;
    this.served = gatewayServing(options.production, options.provider.kind, serving);
    // Neither a method nor a setting can be shadowed on the instance after construction (the prototype is frozen
    // below): the screen step and the call path are the class's own (combined audit item 120's review, F6).
    Object.freeze(this);
  }

  /**
   * Which purposes may run for the practice now (./purposes.ts offeredPurposes): none with the kill switch
   * on, none that this gateway does not serve, and the denial-letter reader only with its flag. Screens
   * offer hand entry for the rest.
   */
  async features(practiceId: string | null): Promise<Readonly<Record<ModelPurpose, boolean>>> {
    return offeredPurposes(await this.options.store.features(practiceId), this.served);
  }

  proposeContractTerms(context: CallContext, input: ContractPagesInput): Promise<GatewayResult<ContractTermsProposal>> {
    return this.run(PURPOSE_SPECS.proposeContractTerms, context, input);
  }

  readDenialLetter(context: CallContext, input: DenialLetterInput): Promise<GatewayResult<DenialLetterProposal>> {
    return this.run(PURPOSE_SPECS.readDenialLetter, context, input);
  }

  draftPacketNarrative(context: CallContext, input: NarrativeInput): Promise<GatewayResult<NarrativeProposal>> {
    return this.run(PURPOSE_SPECS.draftPacketNarrative, context, input);
  }

  suggestEvidenceRequests(context: CallContext, input: EvidenceRequestsInput): Promise<GatewayResult<EvidenceRequestsProposal>> {
    return this.run(PURPOSE_SPECS.suggestEvidenceRequests, context, input);
  }

  private checkContext(context: CallContext): void {
    const evaluation = this.options.store.actor.kind === 'evaluation';
    if (!REQUEST_KEY.test(context.requestKey)) {
      throw new GatewayError('request_key_invalid', 'a call carries the caller’s opaque request key');
    }
    if (evaluation !== (context.practiceId === null) || (context.practiceId !== null && !UUID.test(context.practiceId))) {
      throw new GatewayError('context_invalid', 'a call reads one practice’s material, or none for a synthetic evaluation run');
    }
  }

  private async run<I, O, P, C>(spec: PurposeSpec<I, O, P, C>, given: CallContext, input: I): Promise<GatewayResult<P>> {
    const context = callContext(given);
    this.checkContext(context);
    if (this.permittedRun !== null && (spec.purpose !== 'proposeContractTerms' || PERMITTED_REQUEST_KEY.exec(context.requestKey)?.[1] !== this.permittedRun)) {
      throw new GatewayError('serving_invalid', 'a gateway built for the permitted run makes that run’s contract calls only');
    }
    const release = this.options.limiter?.tryAcquire(context.practiceId);
    if (release === null) {
      this.options.logger.warn('a model call was refused: the server has as many calls in flight as it may', { error_code: 'MODEL_CALLS_BUSY' });
      throw new ModelBusyError();
    }
    try {
      return await this.limited(spec, context, input);
    } finally {
      release?.();
    }
  }

  private async limited<I, O, P, C>(spec: PurposeSpec<I, O, P, C>, context: CallContext, input: I): Promise<GatewayResult<P>> {
    const { provider, store } = this.options;
    const { practiceId } = context;

    if (!purposeServed(this.served, spec.purpose)) {
      throw new ModelFeatureOffError('not_evaluated');
    }
    const features = await store.features(practiceId);
    if (features.killSwitch) {
      throw new ModelFeatureOffError('kill_switch');
    }
    if (FLAGGED_PURPOSES.has(spec.purpose) && !features.readDenialLetter) {
      throw new ModelFeatureOffError('feature_off');
    }
    if (!this.options.production && provider.kind !== 'local' && practiceId !== null) {
      throw new PhiBoundaryError();
    }

    const prepared = spec.prepare(input);
    if (!this.served.keys.has(servedKey(spec.purpose, prepared.variant))) {
      throw new ModelFeatureOffError('not_evaluated');
    }
    const { prompt } = spec;
    const modelId = modelFor(prompt, provider.kind, prepared.variant);
    const price = priceOf(provider.kind, modelId, this.prices);
    const idempotencyKey = jsonSha256({ purpose: spec.purpose, prompt: prompt.id, practice: practiceId, request: context.requestKey, inputs: prepared.inputHashes });
    const existing = await store.completedCall(practiceId, idempotencyKey);
    if (existing !== null) {
      throw new DuplicateModelCallError(existing);
    }
    const budgetMicro = features.dailyBudgetCents * MICRO;
    const since = utcDayStart(this.now());
    // Read only: a practice whose logged spend has reached its budget is refused before its records are screened.
    // The hold below adds the calls in flight to the same spend, so this never refuses a call the hold would make.
    if (practiceId !== null && (await store.spentSince(practiceId, since)) >= budgetMicro) {
      this.refuseOverBudget(practiceId);
    }
    await this.screen(spec, input, prepared, context);

    const request: ModelRequest = {
      modelId,
      promptVersion: prompt.id,
      system: prompt.system,
      user: prepared.user,
      outputSchema: prompt.schema,
      maxTokens: prompt.maxTokens,
      effort: prompt.effort,
    };
    let spent = 0n;
    let holdId: string | null = null;
    if (practiceId !== null) {
      // The call's most is held before it is made, so calls made at once cannot all pass a check of the logged spend.
      const held = await store.hold(practiceId, { since, amountMicro: mostCost(price, request), budgetMicro, holdMs: 2 * this.timeoutMs + HOLD_MARGIN_MS });
      if (held.holdId === null) {
        this.refuseOverBudget(practiceId);
      }
      ({ spent, holdId } = held);
    }
    let recorded = false;
    try {
      return await this.callAndRecord(spec, context, input, { prepared, request, price, idempotencyKey, modelId, spent, budgetMicro, holdId }, () => {
        recorded = true;
      });
    } finally {
      if (!recorded && holdId !== null && practiceId !== null) {
        await store.release(practiceId, holdId);
      }
    }
  }

  /** A call refused by the practice's daily budget (steps 6 and 9): the operator's alert, then the refusal. */
  private refuseOverBudget(practiceId: string): never {
    this.options.logger.error('a model call was refused: the practice has spent its daily model budget', { practice_id: practiceId, error_code: 'MODEL_BUDGET_EXCEEDED' });
    throw new ModelBudgetExceededError();
  }

  /**
   * The caller's step before the screen (step 7), then the purpose's screen against records outside the input
   * (step 8). A screen's refusal is logged with the practice's ID and a code only (docs/adr/0070, Part 3; never
   * which identifier, its kind, how many or any text) and rethrown, so nothing is sent, no budget is held and no
   * model_call row is written. The step's own throw is rethrown as it is, unlogged: the caller says why.
   */
  private async screen<I, O, P, C>(spec: PurposeSpec<I, O, P, C>, input: I, prepared: PreparedCall<C>, context: CallContext): Promise<void> {
    if (spec.screen === undefined) {
      return;
    }
    await context.beforeScreen?.();
    try {
      await spec.screen(input, prepared, context);
    } catch (error) {
      this.logScreenRefusal(error instanceof InputRefusedError ? error.code : null, context.practiceId);
      throw error;
    }
  }

  /** One line per screen refusal: a fixed sentence, the practice's ID and a code (the design's 5.6); a screen's own message is never logged. */
  private logScreenRefusal(code: string | null, practiceId: string | null): void {
    const { logger } = this.options;
    switch (code) {
      case 'names_patient':
        logger.warn('a model call was refused before it was sent: its input names a patient of the practice', { practice_id: practiceId, error_code: 'MODEL_INPUT_NAMES_PATIENT' });
        return;
      case 'more_than_one_patient':
        logger.warn('a model call was refused before it was sent: its input names more than one patient', { practice_id: practiceId, error_code: 'MODEL_INPUT_MORE_THAN_ONE_PATIENT' });
        return;
      case 'screen_unavailable':
        logger.warn('a model call was refused before it was sent: the practice holds more identifiers than the screen reads', { practice_id: practiceId, error_code: 'MODEL_INPUT_SCREEN_UNAVAILABLE' });
        return;
      case 'screen_invalid':
        logger.warn('a model call was refused before it was sent: it carried no records check the gateway issued for its practice', { practice_id: practiceId, error_code: 'MODEL_INPUT_SCREEN_INVALID' });
        return;
      case null:
      default:
        // screen_failed, or a screen that failed some other way: the call is refused all the same.
        logger.warn('a model call was refused before it was sent: its screen could not read the practice records', { practice_id: practiceId, error_code: 'MODEL_INPUT_SCREEN_FAILED' });
    }
  }

  /** The call, its schema and its verifier, and its one model_call row (which releases the call's budget hold). */
  private async callAndRecord<I, O, P, C>(
    spec: PurposeSpec<I, O, P, C>,
    context: CallContext,
    input: I,
    call: { readonly prepared: PreparedCall<C>; readonly request: ModelRequest; readonly price: ModelPrice; readonly idempotencyKey: string; readonly modelId: string; readonly spent: bigint; readonly budgetMicro: bigint; readonly holdId: string | null },
    onRecorded: () => void,
  ): Promise<GatewayResult<P>> {
    const { provider, store, logger } = this.options;
    const { practiceId } = context;
    const { prepared, request, price, idempotencyKey, modelId, spent, budgetMicro, holdId } = call;
    const { prompt } = spec;
    const attempted = await this.call(request);
    const base = {
      practiceId,
      ...actorColumns(store.actor),
      purpose: spec.purpose,
      provider: provider.kind,
      modelId,
      promptVersion: prompt.id,
      idempotencyKey,
      inputHashes: prepared.inputHashes,
      attempts: attempted.attempts,
      latencyMs: attempted.latencyMs,
    };
    const record = async (row: Omit<ModelCallRecord, keyof typeof base | 'costCents' | 'costMicroCents' | 'tokensIn' | 'tokensOut'>, tokensIn: number, tokensOut: number) => {
      const cost = callCost(price, tokensIn, tokensOut);
      const id = await store.record({ ...base, ...row, tokensIn, tokensOut, costCents: cost.cents, costMicroCents: cost.microCents }, holdId);
      onRecorded();
      if (practiceId !== null && spent < budgetMicro && spent + cost.microCents >= budgetMicro) {
        logger.warn('the practice reached its daily model budget; further calls today are refused', { practice_id: practiceId, error_code: 'MODEL_BUDGET_REACHED' });
      }
      return id;
    };

    const { response, failure } = attempted;
    if (response === null) {
      const code = failure?.code ?? 'rejected';
      const id = await record({ outputSha256: null, citations: [], verifierPassed: null, outcome: code === 'timeout' ? 'timed_out' : 'failed', errorCode: code }, 0, 0);
      throw new ModelCallFailedError(code, id);
    }
    if (response.stopReason !== 'end') {
      const code = STOP_CODES[response.stopReason];
      const id = await record({ outputSha256: null, citations: [], verifierPassed: null, outcome: 'failed', errorCode: code }, response.tokensIn, response.tokensOut);
      throw new ModelCallFailedError(code, id);
    }

    const outputSha256 = sha256Hex(response.text);
    const parsed = spec.output.safeParse(parseJson(response.text));
    if (!parsed.success) {
      const id = await record({ outputSha256, citations: [], verifierPassed: false, outcome: 'completed', errorCode: null }, response.tokensIn, response.tokensOut);
      return { modelCallId: id, passed: false, proposal: null, problems: ['invalid_output'] };
    }
    const verified = spec.verify(input, parsed.data, prepared.context);
    const id = await record({ outputSha256, citations: verified.citations, verifierPassed: verified.passed, outcome: 'completed', errorCode: null }, response.tokensIn, response.tokensOut);
    return { modelCallId: id, passed: verified.passed, proposal: verified.proposal, problems: [] };
  }

  /** One attempt, and one retry under the same idempotency key when the failure is one a retry can cure. */
  private async call(request: ModelRequest): Promise<Attempted> {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    let attempts: 1 | 2 = 1;
    for (;;) {
      try {
        return { response: await this.attempt(request), failure: null, attempts, latencyMs: elapsed() };
      } catch (error) {
        const failure = error instanceof ProviderFailure ? error : new ProviderFailure('rejected');
        if (!failure.retryable || attempts === 2) {
          return { response: null, failure, attempts, latencyMs: elapsed() };
        }
        attempts = 2;
      }
    }
  }

  /** One attempt, ended at the timeout whether or not the provider honors its signal. */
  private async attempt(request: ModelRequest): Promise<ModelResponse> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderFailure('timeout'));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.options.provider.complete(request, { signal: controller.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The gateway's methods cannot be replaced or removed once this module has loaded, so no code in the process can
 * swap ModelGateway.prototype's screen step or call path for one that skips the purpose's screen (combined audit item
 * 120's review, F6: the specs are frozen too, ./specs.ts). Code that rewrites a built-in is still outside what any
 * module can stop (docs/adr/0070, Part 3).
 */
Object.freeze(ModelGateway.prototype);

/** How long past the longest call (two attempts at the timeout) a hold stands if its process dies. */
const HOLD_MARGIN_MS = 60_000;

/** Tokens the request's framing may add beyond its text (the roles, the schema's wrapping). */
const FRAMING_TOKENS = 1_000;

/**
 * The most a request can cost: its token limit out, and in, no more tokens than the bytes it sends (a token is
 * at least one byte of UTF-8) plus the framing, at the model's price, in millionths of a cent.
 */
export function mostCost(price: ModelPrice, request: ModelRequest): bigint {
  const bytes = Buffer.byteLength(request.system, 'utf8') + Buffer.byteLength(request.user, 'utf8') + Buffer.byteLength(JSON.stringify(request.outputSchema), 'utf8');
  return callCost(price, bytes + FRAMING_TOKENS, request.maxTokens).microCents;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
