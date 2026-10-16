import { randomUUID } from 'node:crypto';

import { type Logger, createLogger } from '@tp/observability';
import type { ContractLayout } from '@tp/synth';

import { GatewayError, ModelCallFailedError, ModelFeatureOffError } from '../src/errors';
import { type ContractTermsOutput, contractTermsOutput } from '../src/functions/contract-terms';
import { ModelGateway } from '../src/gateway';
import { PROMPTS, modelFor } from '../src/prompts';
import type { ModelProvider, ModelRequest, ModelResponse, CompleteOptions, ProviderKind } from '../src/provider';
import { MemoryModelCallStore, type ModelCallStore } from '../src/store';
import { type ContractScore, type Counts, type FieldCounts, type NarrativeProblem, ZERO, add, checkNarrative, emptyFieldCounts, missedContract, scoreContract, total } from './score';
import type { LoadedContractSet, LoadedNarrativeSet } from './sets';
import { TRUTH_FIELDS } from '@tp/synth';

/**
 * The evaluation harness (PRD 14, Logging and evaluation; PRD 18, Layers: Model; docs/adr/0051):
 * runs one provider over the synthetic sets through the gateway itself, as synthetic evaluation calls
 * (no practice; an evaluation actor), and reports field-level precision and recall for contract
 * extraction and every narrative's verifier result and required facts. The report holds counts, codes
 * and case IDs only, never a document's or a narrative's text. ./baseline.ts compares it with the
 * committed baseline; ./cli.ts runs it against a real provider where there are credentials.
 */

export const REPORT_FORMAT = 'tp-model-eval-report/1';

export interface ContractCaseResult {
  readonly id: string;
  readonly layout: ContractLayout;
  readonly fields: FieldCounts;
  readonly quotesOffPage: number;
  /** Why the case produced no proposal (call_failed:<code>, refused:<code>, invalid_output), or null. */
  readonly problem: string | null;
}

export interface ContractReport {
  readonly purpose: 'proposeContractTerms';
  readonly promptVersion: string;
  readonly modelId: string;
  readonly setSha256: string;
  readonly cases: number;
  readonly fields: FieldCounts;
  readonly total: Counts;
  readonly byLayout: Readonly<Record<ContractLayout, Counts>>;
  readonly quotesOffPage: number;
  readonly results: readonly ContractCaseResult[];
}

export interface NarrativeCaseResult {
  readonly id: string;
  readonly problems: readonly NarrativeProblem[];
  readonly mismatches: readonly string[];
  /** What each missing required fact is (shortfall, expected, ...), never its value. */
  readonly missing: readonly string[];
  readonly detail: string | null;
}

export interface NarrativeReport {
  readonly purpose: 'draftPacketNarrative';
  readonly promptVersion: string;
  readonly modelId: string;
  readonly setSha256: string;
  readonly cases: number;
  readonly passed: number;
  /** Every case with a critical error: a failed call, an answer off the schema, a verifier failure, a required fact missing. */
  readonly failures: readonly NarrativeCaseResult[];
}

export interface EvaluationReport {
  readonly format: typeof REPORT_FORMAT;
  readonly synthetic: true;
  readonly provider: ProviderKind;
  readonly contracts: ContractReport | null;
  readonly narratives: NarrativeReport | null;
}

export interface EvaluationOptions {
  readonly provider: ModelProvider;
  readonly contracts?: LoadedContractSet | null;
  readonly narratives?: LoadedNarrativeSet | null;
  /** Where the evaluation calls are logged: memory by default, or the operator's store (model_call rows with no practice). */
  readonly store?: ModelCallStore;
  /** Distinguishes this run's calls from another's (the gateway never repeats a completed call under one key). */
  readonly runId?: string;
  readonly logger?: Logger;
  readonly timeoutMs?: number;
}

/** Passes calls through and keeps the last answer's text, so the harness can score what the model said as well as what the verifier kept. */
class Recorder implements ModelProvider {
  last: string | null = null;
  constructor(private readonly inner: ModelProvider) {}

  get kind(): ProviderKind {
    return this.inner.kind;
  }

  async complete(request: ModelRequest, options: CompleteOptions): Promise<ModelResponse> {
    this.last = null;
    const response = await this.inner.complete(request, options);
    this.last = response.text;
    return response;
  }
}

function problemOf(error: unknown): string {
  if (error instanceof ModelFeatureOffError) {
    // The kill switch is on where the run's flags are read: nothing was sent, and nothing can be evaluated.
    throw error;
  }
  if (error instanceof ModelCallFailedError) {
    return `call_failed:${error.code}`;
  }
  if (error instanceof GatewayError) {
    return `refused:${error.code}`;
  }
  throw error;
}

function parsedOutput(text: string | null): ContractTermsOutput | null {
  if (text === null) {
    return null;
  }
  try {
    const parsed = contractTermsOutput.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function evaluateContracts(gateway: ModelGateway, recorder: Recorder, set: LoadedContractSet, runId: string): Promise<ContractReport> {
  const results: ContractCaseResult[] = [];
  for (const item of set.cases) {
    let score: ContractScore;
    let problem: string | null = null;
    try {
      const result = await gateway.proposeContractTerms({ practiceId: null, requestKey: `eval:${runId}:${item.id}` }, item.input);
      const output = parsedOutput(recorder.last);
      if (result.proposal === null || output === null) {
        problem = 'invalid_output';
        score = missedContract(item.truth);
      } else {
        score = scoreContract(item.truth, output, result.proposal);
      }
    } catch (error) {
      problem = problemOf(error);
      score = missedContract(item.truth);
    }
    results.push({ id: item.id, layout: item.layout, fields: score.fields, quotesOffPage: score.quotesOffPage, problem });
  }
  const fields = emptyFieldCounts();
  for (const result of results) {
    for (const field of TRUTH_FIELDS) {
      fields[field] = add(fields[field], result.fields[field]);
    }
  }
  const byLayout = { table: ZERO, prose: ZERO, scanned: ZERO };
  for (const result of results) {
    byLayout[result.layout] = add(byLayout[result.layout], total(result.fields));
  }
  return {
    purpose: 'proposeContractTerms',
    promptVersion: PROMPTS.proposeContractTerms.id,
    modelId: modelFor(PROMPTS.proposeContractTerms, recorder.kind),
    setSha256: set.sha256,
    cases: results.length,
    fields,
    total: total(fields),
    byLayout,
    quotesOffPage: results.reduce((sum, result) => sum + result.quotesOffPage, 0),
    results,
  };
}

async function evaluateNarratives(gateway: ModelGateway, recorder: Recorder, set: LoadedNarrativeSet, runId: string): Promise<NarrativeReport> {
  const failures: NarrativeCaseResult[] = [];
  for (const item of set.cases) {
    let check;
    let detail: string | null = null;
    try {
      const result = await gateway.draftPacketNarrative({ practiceId: null, requestKey: `eval:${runId}:${item.id}` }, item.input);
      check = checkNarrative(item.required, result.proposal, result.proposal === null ? 'invalid_output' : null);
    } catch (error) {
      detail = problemOf(error);
      check = checkNarrative(item.required, null, 'call_failed');
    }
    if (check.problems.length > 0) {
      failures.push({ id: item.id, problems: check.problems, mismatches: check.mismatches, missing: check.missing.map((fact) => fact.what), detail });
    }
  }
  return {
    purpose: 'draftPacketNarrative',
    promptVersion: PROMPTS.draftPacketNarrative.id,
    modelId: modelFor(PROMPTS.draftPacketNarrative, recorder.kind),
    setSha256: set.sha256,
    cases: set.cases.length,
    passed: set.cases.length - failures.length,
    failures,
  };
}

/** Runs the provider over the sets given and reports what it scored. */
export async function runEvaluation(options: EvaluationOptions): Promise<EvaluationReport> {
  const recorder = new Recorder(options.provider);
  const gateway = new ModelGateway({
    provider: recorder,
    store: options.store ?? new MemoryModelCallStore({ actor: { kind: 'evaluation' } }),
    logger: options.logger ?? createLogger({ level: 'warn' }),
    production: false,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const runId = options.runId ?? randomUUID();
  return {
    format: REPORT_FORMAT,
    synthetic: true,
    provider: options.provider.kind,
    contracts: options.contracts === undefined || options.contracts === null ? null : await evaluateContracts(gateway, recorder, options.contracts, runId),
    narratives: options.narratives === undefined || options.narratives === null ? null : await evaluateNarratives(gateway, recorder, options.narratives, runId),
  };
}
