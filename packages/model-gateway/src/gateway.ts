import type { Logger } from '@tp/observability';

import { CALL_TIMEOUT_MS } from './config';
import { DuplicateModelCallError, GatewayError, ModelBudgetExceededError, ModelCallFailedError, ModelFeatureOffError, PhiBoundaryError } from './errors';
import type { ContractPagesInput, ContractTermsProposal } from './functions/contract-terms';
import type { DenialLetterInput, DenialLetterProposal } from './functions/denial-letter';
import type { EvidenceRequestsInput, EvidenceRequestsProposal } from './functions/evidence-requests';
import type { NarrativeInput, NarrativeProposal } from './functions/narrative';
import { jsonSha256, sha256Hex } from './hash';
import { type ModelPrice, PRICES, callCost, priceOf } from './prices';
import { modelFor } from './prompts';
import { type ModelProvider, type ModelRequest, type ModelResponse, ProviderFailure } from './provider';
import { FLAGGED_PURPOSES, MODEL_PURPOSES, type ModelPurpose } from './purposes';
import type { PurposeSpec } from './spec';
import { PURPOSE_SPECS } from './specs';
import { type ModelCallRecord, type ModelCallStore, actorColumns } from './store';

/**
 * The gateway: the only code that calls a model (PRD 14; CLAUDE.md, Never: "Call a model outside
 * packages/model-gateway"). Each of the four purpose-typed functions goes through one path, in order:
 *
 * 1. The kill switch, and a v1.5 purpose's own flag (test matrix MOD-06): with either off, nothing is
 *    sent and the caller falls back to hand entry.
 * 2. The PHI boundary: outside production only the local provider, or a synthetic evaluation call with
 *    no practice, may run.
 * 3. The purpose's preparation, which refuses an input that breaks a minimization rule (more than one
 *    patient, an identifier in a narrative's inputs) and frames the input as data.
 * 4. The idempotency key: the SHA-256 of the purpose, prompt version, practice, the caller's request key
 *    and the input hashes. A completed call under the key is never made again (a replay of a job).
 * 5. The practice's daily budget (test matrix MOD-05): a call is refused once the day's spend reaches
 *    it, with an alert for the operator; crossing it raises another.
 * 6. The call: no tools, a pinned model and prompt version, 60 seconds per attempt, and one retry under
 *    the same idempotency key when the failure is one a retry can cure.
 * 7. The answer must follow the prompt version's schema; then the purpose's verifier checks it against
 *    the input. Whatever it finds, the result is a proposal a person approves (PRD 14, Untrusted input).
 * 8. One model_call row per call, in the product's own database, with hashes, counts and codes only.
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
}

export interface CallContext {
  /** The practice whose material the call reads; null only for a synthetic evaluation call. */
  readonly practiceId: string | null;
  /**
   * The caller's own key for this call (a mutation's request key, or a job's ID and step): the same
   * key is the same call, so a retry or a replay never pays twice.
   */
  readonly requestKey: string;
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
const MICRO = 1_000_000n;

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

  constructor(private readonly options: GatewayOptions) {
    this.timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS;
    this.prices = options.prices ?? PRICES;
    this.now = options.now ?? (() => new Date());
  }

  /** Which purposes may run for the practice now: none with the kill switch on. Screens offer hand entry for the rest. */
  async features(practiceId: string | null): Promise<Readonly<Record<ModelPurpose, boolean>>> {
    const features = await this.options.store.features(practiceId);
    return Object.fromEntries(MODEL_PURPOSES.map((purpose) => [purpose, !features.killSwitch && (!FLAGGED_PURPOSES.has(purpose) || features.readDenialLetter)])) as Record<ModelPurpose, boolean>;
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

  private async run<I, O, P, C>(spec: PurposeSpec<I, O, P, C>, context: CallContext, input: I): Promise<GatewayResult<P>> {
    const { provider, store, logger } = this.options;
    this.checkContext(context);
    const { practiceId } = context;

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
    const { prompt } = spec;
    const modelId = modelFor(prompt, provider.kind, prepared.variant);
    const price = priceOf(provider.kind, modelId, this.prices);
    const idempotencyKey = jsonSha256({ purpose: spec.purpose, prompt: prompt.id, practice: practiceId, request: context.requestKey, inputs: prepared.inputHashes });
    const existing = await store.completedCall(practiceId, idempotencyKey);
    if (existing !== null) {
      throw new DuplicateModelCallError(existing);
    }

    const budgetMicro = features.dailyBudgetCents * MICRO;
    const spent = practiceId === null ? 0n : await store.spentSince(practiceId, utcDayStart(this.now()));
    if (practiceId !== null && spent >= budgetMicro) {
      logger.error('a model call was refused: the practice has spent its daily model budget', { practice_id: practiceId, error_code: 'MODEL_BUDGET_EXCEEDED' });
      throw new ModelBudgetExceededError();
    }

    const request: ModelRequest = {
      modelId,
      promptVersion: prompt.id,
      system: prompt.system,
      user: prepared.user,
      outputSchema: prompt.schema,
      maxTokens: prompt.maxTokens,
      effort: prompt.effort,
    };
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
      const id = await store.record({ ...base, ...row, tokensIn, tokensOut, costCents: cost.cents, costMicroCents: cost.microCents });
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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
