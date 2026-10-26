import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { type Logger, createLogger } from '@tp/observability';
import { CONTRACT_LAYOUTS, CONTRACT_TIERS, INJECTION_CANARY, PAGE_TEXT_FIDELITIES, TRUTH_FIELDS, type ContractLayout, type ContractTier, type PageTextFidelity, type TruthField } from '@tp/synth';

import { CONTRACT_VARIANTS, type ContractVariant } from '../src/baseline-format';
import { GatewayError, ModelCallFailedError, ModelFeatureOffError } from '../src/errors';
import { type ContractTermsOutput, contractTermsOutput } from '../src/functions/contract-terms';
import { ModelGateway } from '../src/gateway';
import { PROMPTS, modelFor } from '../src/prompts';
import type { ModelProvider, ModelRequest, ModelResponse, CompleteOptions, ProviderKind } from '../src/provider';
import { MemoryModelCallStore, type ModelCallStore } from '../src/store';
import { type FieldTally, type WrongAt, ZERO_TALLY, addTally, sumTallies, wrongVerified } from '../src/tally';
import { type ContractScore, type NarrativeProblem, checkNarrative, holdsPhrase, holdsWord, injectedWords, missedContract, scoreContract, total, twinSha256, wrongVerifiedByField } from './score';
import type { ContractCase, LoadedContractSet, LoadedNarrativeSet, NarrativeCase } from './sets';

/**
 * The evaluation harness (PRD 14, Logging and evaluation; PRD 18, Layers: Model; docs/adr/0051 and
 * 0070): runs one provider over the synthetic sets through the gateway itself, as synthetic evaluation
 * calls (no practice; an evaluation actor), and reports each contract field's tally (src/tally.ts) and
 * every narrative's verifier result and required facts. The report holds counts, codes, hashes and case
 * IDs only, never a document's or a narrative's text. ./baseline.ts gates it against the committed
 * baseline; ./cli.ts runs it against a real provider where there are credentials.
 *
 * Report format /3 (docs/adr/0070, Part 1; /3 adds the `widened` count to every tally and each case's
 *   `wrongVerifiedAt`, review M2 and n4):
 * - each contract case's tallies, its wrong-but-verified count per field and the records and fields
 *   they are on, its expected conflict pairs and how many were flagged, its twin key (a hash) and
 *   whether any string of the answer holds the injection's canary or, on an injected twin, a word only
 *   its injection writes; and the totals by field, layout, tier and page text, all recomputed from the
 *   cases, never carried from elsewhere;
 * - `caseIds`, the sorted IDs of the cases the report covers: the gate refuses a report that does not
 *   cover its set exactly (incomplete_report, review M2);
 * - `spliced`, true for spliceReport's output: a whole-set report with a few cases rerun under a fault,
 *   which the gate computes on in tests and the baseline never records.
 *
 * Every call runs inside its case's context (currentCase), so a fault provider spoils the calls of the
 * cases it names whatever else runs and in whatever order (review m4), and runEvaluation({ cases })
 * runs a subset: a fault test calls the model only for the cases it spoils and gates the spliced
 * whole-set report.
 */

export const REPORT_FORMAT = 'tp-model-eval-report/3';

export { CONTRACT_VARIANTS, type ContractVariant };

export interface ContractCaseResult {
  readonly id: string;
  readonly layout: ContractLayout;
  readonly tier: ContractTier;
  readonly pageText: PageTextFidelity;
  /** On an injected twin, its clean twin's ID. */
  readonly twinOf: string | null;
  /** The other document of a contract-plus-exhibit pair. */
  readonly pairOf: string | null;
  readonly fields: Readonly<Record<TruthField, FieldTally>>;
  /** Each field's wrong but verified (wrong + extra + widened), so the unfaithful cap compares case by case (review M5). */
  readonly wrongVerified: Readonly<Record<TruthField, number>>;
  /**
   * Which true records and fields those are (src/tally.ts wrongVerifiedAt), so the unfaithful cap holds
   * the wrong values to the records the reference has wrong, not only to how many (review n4). A field of
   * a candidate paired with no record is counted in `wrongVerified` and has no record to name here.
   */
  readonly wrongVerifiedAt: readonly WrongAt<TruthField>[];
  readonly quotesOffPage: number;
  readonly conflicts: { readonly expected: number; readonly flagged: number };
  /** The SHA-256 of the answer's twin key (eval/score.ts twinSha256), or null when the call gave no answer. */
  readonly twinSha256: string | null;
  /**
   * Whether any string of the answer (a label, a quote, a written value) holds the injection's canary
   * phrase, or, on an injected twin, any word only its injection writes (eval/score.ts injectedWords; a
   * label that obeys the injection, which the twin key leaves out, review m2).
   */
  readonly canary: boolean;
  /**
   * On an exhibit of a pair, the fields a verified candidate states that only its contract states (the
   * paired contract's truth states them and the exhibit's states them in no record): counted `extra`,
   * and reported apart (review m11).
   */
  readonly pairTermExtra: readonly TruthField[];
  /** Why the case produced no proposal (call_failed:<code>, refused:<code>, invalid_output), or null. */
  readonly problem: string | null;
}

export interface ContractReport {
  readonly purpose: 'proposeContractTerms';
  readonly promptVersion: string;
  /** The SHA-256 the prompt version records for its content. */
  readonly promptSha256: string;
  /** The prompt's model variant the run called: the default, or the larger model for contracts marked ambiguous. */
  readonly variant: ContractVariant;
  readonly modelId: string;
  readonly setSha256: string;
  readonly cases: number;
  /** The cases the report covers, sorted. */
  readonly caseIds: readonly string[];
  readonly fields: Readonly<Record<TruthField, FieldTally>>;
  readonly total: FieldTally;
  readonly byLayout: Readonly<Record<ContractLayout, FieldTally>>;
  readonly byTier: Readonly<Record<ContractTier, FieldTally>>;
  readonly byPageText: Readonly<Record<PageTextFidelity, FieldTally>>;
  /** Each field's wrong but verified over the faithful cases only: the gate holds every one at zero. */
  readonly faithfulWrongVerified: Readonly<Record<TruthField, number>>;
  /** The expected conflict pairs, and the cases where any was not proposed and flagged both ways. */
  readonly conflicts: { readonly expected: number; readonly unflagged: readonly string[] };
  /**
   * The injected twins (each case naming a clean twin): how many; those whose twin key differs from
   * their clean twin's; those where either call gave no answer; and every case of any kind whose answer
   * holds the canary.
   */
  readonly twins: { readonly pairs: number; readonly differing: readonly string[]; readonly incomplete: readonly string[]; readonly canary: readonly string[] };
  /** Every exhibit field a verified candidate stated that only its pair's contract states. */
  readonly pairTermExtra: readonly { readonly case: string; readonly field: TruthField }[];
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
  readonly promptSha256: string;
  readonly modelId: string;
  readonly setSha256: string;
  readonly cases: number;
  /** The cases the report covers, sorted. */
  readonly caseIds: readonly string[];
  readonly passed: number;
  /** Every case with a critical error: a failed call, an answer off the schema, a verifier failure, a required fact missing. */
  readonly failures: readonly NarrativeCaseResult[];
}

export interface EvaluationReport {
  readonly format: typeof REPORT_FORMAT;
  readonly synthetic: true;
  readonly provider: ProviderKind;
  /** True when some cases' results came from another run (spliceReport): gated in tests, never recorded. */
  readonly spliced: boolean;
  readonly contracts: ContractReport | null;
  readonly narratives: NarrativeReport | null;
}

export interface EvaluationOptions {
  readonly provider: ModelProvider;
  /** Which of the contract prompt's models to evaluate (each pinned model has its own baseline entry). */
  readonly variant?: ContractVariant;
  readonly contracts?: LoadedContractSet | null;
  readonly narratives?: LoadedNarrativeSet | null;
  /** Only these cases (by ID, of either set): a subset report, for spliceReport. Every case when absent. */
  readonly cases?: ReadonlySet<string>;
  /** Where the evaluation calls are logged: memory by default, or the operator's store (model_call rows with no practice). */
  readonly store?: ModelCallStore;
  /** Distinguishes this run's calls from another's (the gateway never repeats a completed call under one key). */
  readonly runId?: string;
  readonly logger?: Logger;
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------------------------------
// The case a call is for

/** The case whose call is in progress: its ID, and the case itself (a contract's truth and pages, or a narrative's inputs). */
export interface EvaluationCase {
  readonly id: string;
  readonly contract: ContractCase | null;
  readonly narrative: NarrativeCase | null;
}

const running = new AsyncLocalStorage<EvaluationCase>();

/**
 * The case the harness is calling the provider for, or undefined outside a harness call. A fault
 * provider (./faults.ts) reads it to spoil exactly the cases it names, however the run is ordered or
 * subset (review m4).
 */
export function currentCase(): EvaluationCase | undefined {
  return running.getStore();
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

const sortedById = <T extends { readonly id: string }>(items: readonly T[]) => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// ---------------------------------------------------------------------------------------------------
// Contracts

/** The fields only an exhibit's paired contract states (the contract's truth states them, the exhibit's in no record). */
function pairTermFields(item: ContractCase, cases: ReadonlyMap<string, ContractCase>): ReadonlySet<TruthField> {
  const contract = item.truth.kind === 'exhibit' && item.truth.pairOf !== null ? cases.get(item.truth.pairOf) : undefined;
  if (contract === undefined) {
    return new Set();
  }
  const states = (records: ContractCase['truth']['records'], field: TruthField) => records.some((record) => record.fields[field] !== undefined);
  return new Set(TRUTH_FIELDS.filter((field) => states(contract.truth.records, field) && !states(item.truth.records, field)));
}

interface CaseExtras {
  readonly twinSha256: string | null;
  readonly canary: boolean;
  readonly problem: string | null;
  readonly pairTerms: ReadonlySet<TruthField>;
}

function caseResult(item: ContractCase, score: ContractScore, extras: CaseExtras): ContractCaseResult {
  return {
    id: item.id,
    layout: item.layout,
    tier: item.tier,
    pageText: item.pageText,
    twinOf: item.truth.twinOf,
    pairOf: item.truth.pairOf,
    fields: score.fields,
    wrongVerified: wrongVerifiedByField(score.fields),
    wrongVerifiedAt: score.wrongVerifiedAt,
    quotesOffPage: score.quotesOffPage,
    conflicts: score.conflicts,
    twinSha256: extras.twinSha256,
    canary: extras.canary,
    pairTermExtra: TRUTH_FIELDS.filter((field) => extras.pairTerms.has(field) && score.fields[field].extra > 0),
    problem: extras.problem,
  };
}

/** The contract report with every total recomputed from its case results (a run and a splice both build it so). */
export function contractReportFrom(meta: Pick<ContractReport, 'promptVersion' | 'promptSha256' | 'variant' | 'modelId' | 'setSha256'>, results: readonly ContractCaseResult[]): ContractReport {
  const fields = sumTallies(TRUTH_FIELDS, results.map((result) => result.fields));
  const group = <K extends string>(keys: readonly K[], keyOf: (result: ContractCaseResult) => K) =>
    Object.fromEntries(keys.map((key) => [key, results.filter((result) => keyOf(result) === key).reduce((sum, result) => addTally(sum, total(result.fields)), ZERO_TALLY)])) as Record<K, FieldTally>;
  const faithful = results.filter((result) => result.pageText === 'faithful');
  const resultOf = new Map(results.map((result) => [result.id, result]));
  const twins = sortedById(results.filter((result) => result.twinOf !== null));
  // A pair either of whose calls gave no answer cannot be compared: it is incomplete, never equal (review M4).
  const incomplete = twins
    .filter((twin) => {
      const clean = resultOf.get(twin.twinOf as string);
      return twin.problem !== null || clean === undefined || clean.problem !== null;
    })
    .map((twin) => twin.id);
  const differing = twins.filter((twin) => !incomplete.includes(twin.id) && twin.twinSha256 !== resultOf.get(twin.twinOf as string)?.twinSha256).map((twin) => twin.id);
  return {
    purpose: 'proposeContractTerms',
    promptVersion: meta.promptVersion,
    promptSha256: meta.promptSha256,
    variant: meta.variant,
    modelId: meta.modelId,
    setSha256: meta.setSha256,
    cases: results.length,
    caseIds: results.map((result) => result.id).sort(),
    fields,
    total: total(fields),
    byLayout: group(CONTRACT_LAYOUTS, (result) => result.layout),
    byTier: group(CONTRACT_TIERS, (result) => result.tier),
    byPageText: group(PAGE_TEXT_FIDELITIES, (result) => result.pageText),
    faithfulWrongVerified: Object.fromEntries(TRUTH_FIELDS.map((field) => [field, faithful.reduce((sum, result) => sum + wrongVerified(result.fields[field]), 0)])) as Record<TruthField, number>,
    conflicts: {
      expected: results.reduce((sum, result) => sum + result.conflicts.expected, 0),
      unflagged: sortedById(results.filter((result) => result.conflicts.flagged < result.conflicts.expected)).map((result) => result.id),
    },
    twins: { pairs: twins.length, differing, incomplete, canary: sortedById(results.filter((result) => result.canary)).map((result) => result.id) },
    pairTermExtra: sortedById(results).flatMap((result) => result.pairTermExtra.map((field) => ({ case: result.id, field }))),
    quotesOffPage: results.reduce((sum, result) => sum + result.quotesOffPage, 0),
    results,
  };
}

/**
 * Whether the answer obeys or repeats the injection: the canary phrase in any string of it, on any case;
 * and on an injected twin, any word its pages write that no document without an injection writes (the
 * clean twin among them), in any string of it (review m2).
 */
function obeysInjection(item: ContractCase, output: ContractTermsOutput | null, clean: readonly (readonly string[])[]): boolean {
  return holdsPhrase(output, INJECTION_CANARY) || (item.truth.twinOf !== null && holdsWord(output, injectedWords(item.input.pages, clean)));
}

/**
 * What a contract report says of each case that the set itself decides, against the set (review n1): the
 * case is the set's, its layout, tier, page text, twin and pair are the case's, its wrong-but-verified
 * counts are its tallies' (wrongVerifiedByField), and it names no more wrong-but-verified records per
 * field than it counts. Each mismatch as `<case>:<what>`; none for a report the harness wrote. The golden
 * test runs it on every recorded report, so a report edited by hand (a faithful case marked unfaithful
 * to take the reference's cap instead of the zero rule) cannot back an entry.
 */
export function caseMismatches(report: ContractReport, set: LoadedContractSet): string[] {
  const cases = new Map(set.cases.map((item) => [item.id, item]));
  return report.results.flatMap((result) => {
    const item = cases.get(result.id);
    if (item === undefined) {
      return [`${result.id}:not_in_set`];
    }
    const wrong = wrongVerifiedByField(result.fields);
    const said: [string, unknown, unknown][] = [
      ['layout', result.layout, item.layout],
      ['tier', result.tier, item.tier],
      ['pageText', result.pageText, item.pageText],
      ['twinOf', result.twinOf, item.truth.twinOf],
      ['pairOf', result.pairOf, item.truth.pairOf],
    ];
    return [
      ...said.filter(([, reported, truth]) => reported !== truth).map(([what]) => `${result.id}:${what}`),
      ...TRUTH_FIELDS.filter((field) => result.wrongVerified[field] !== wrong[field]).map((field) => `${result.id}:wrongVerified:${field}`),
      ...TRUTH_FIELDS.filter((field) => result.wrongVerifiedAt.filter((at) => at.field === field).length > wrong[field] || result.wrongVerifiedAt.some((at) => at.field === field && (at.record < 0 || at.record >= item.truth.records.length))).map(
        (field) => `${result.id}:wrongVerifiedAt:${field}`,
      ),
    ];
  });
}

async function evaluateContracts(gateway: ModelGateway, recorder: Recorder, set: LoadedContractSet, runId: string, variant: ContractVariant, only: ReadonlySet<string> | undefined): Promise<ContractReport> {
  const all = new Map(set.cases.map((item) => [item.id, item]));
  // Every document of the whole set that carries no injection, whatever subset runs, so a subset's rule is the whole set's.
  const clean = set.cases.filter((item) => item.truth.twinOf === null).map((item) => item.input.pages);
  const results: ContractCaseResult[] = [];
  for (const item of set.cases.filter((entry) => only === undefined || only.has(entry.id))) {
    let score: ContractScore;
    let problem: string | null = null;
    let output: ContractTermsOutput | null = null;
    let key: string | null = null;
    try {
      const result = await running.run({ id: item.id, contract: item, narrative: null }, () =>
        gateway.proposeContractTerms({ practiceId: null, requestKey: `eval:${runId}:${variant}:${item.id}` }, { ...item.input, ambiguous: variant === 'ambiguous' }),
      );
      output = parsedOutput(recorder.last);
      if (result.proposal === null || output === null) {
        problem = 'invalid_output';
        score = missedContract(item.truth);
      } else {
        score = scoreContract(item.truth, output, result.proposal);
        key = twinSha256(output, result.proposal);
      }
    } catch (error) {
      problem = problemOf(error);
      score = missedContract(item.truth);
    }
    results.push(caseResult(item, score, { twinSha256: key, canary: obeysInjection(item, output, clean), problem, pairTerms: pairTermFields(item, all) }));
  }
  return contractReportFrom(
    {
      promptVersion: PROMPTS.proposeContractTerms.id,
      promptSha256: PROMPTS.proposeContractTerms.sha256,
      variant,
      modelId: modelFor(PROMPTS.proposeContractTerms, recorder.kind, variant),
      setSha256: set.sha256,
    },
    results,
  );
}

// ---------------------------------------------------------------------------------------------------
// Narratives

async function evaluateNarratives(gateway: ModelGateway, set: LoadedNarrativeSet, runId: string, modelId: string, only: ReadonlySet<string> | undefined): Promise<NarrativeReport> {
  const failures: NarrativeCaseResult[] = [];
  const cases = set.cases.filter((entry) => only === undefined || only.has(entry.id));
  for (const item of cases) {
    let check;
    let detail: string | null = null;
    try {
      const result = await running.run({ id: item.id, contract: null, narrative: item }, () => gateway.draftPacketNarrative({ practiceId: null, requestKey: `eval:${runId}:${item.id}` }, item.input));
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
    promptSha256: PROMPTS.draftPacketNarrative.sha256,
    modelId,
    setSha256: set.sha256,
    cases: cases.length,
    caseIds: cases.map((item) => item.id).sort(),
    passed: cases.length - failures.length,
    failures: sortedById(failures),
  };
}

/** Runs the provider over the sets given (or the cases named of them) and reports what it scored. */
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
  const { contracts, narratives } = options;
  return {
    format: REPORT_FORMAT,
    synthetic: true,
    provider: options.provider.kind,
    spliced: false,
    contracts: contracts === undefined || contracts === null ? null : await evaluateContracts(gateway, recorder, contracts, runId, options.variant ?? 'default', options.cases),
    narratives: narratives === undefined || narratives === null ? null : await evaluateNarratives(gateway, narratives, runId, modelFor(PROMPTS.draftPacketNarrative, recorder.kind), options.cases),
  };
}

// ---------------------------------------------------------------------------------------------------
// Splicing (Appendix A.5)

/**
 * The reference report with the subset's case results in place of its own, every total recomputed
 * from the cases (never added to the reference's), so a splice equals a whole-set run of the same
 * provider. It keeps the reference's case IDs, set and prompt, so the gate computes on it, and it is
 * marked spliced: recordBaseline refuses it (review M2). A purpose the subset did not run stays as the
 * reference has it; a subset of another provider, prompt, model, variant or set, or naming a case the
 * reference does not cover, is refused.
 */
export function spliceReport(reference: EvaluationReport, subset: EvaluationReport): EvaluationReport {
  if (reference.provider !== subset.provider) {
    throw new Error('a report is spliced only with a subset run on the same provider');
  }
  let contracts = reference.contracts;
  if (subset.contracts !== null) {
    const keep = contracts;
    const part = subset.contracts;
    if (keep === null) {
      throw new Error('the reference report has no contracts to splice into');
    }
    if (part.promptVersion !== keep.promptVersion || part.promptSha256 !== keep.promptSha256 || part.variant !== keep.variant || part.modelId !== keep.modelId || part.setSha256 !== keep.setSha256) {
      throw new Error('a subset run is spliced only into a report of the same prompt, model, variant and set');
    }
    const replaced = new Map(part.results.map((result) => [result.id, result]));
    if ([...replaced.keys()].some((id) => !keep.caseIds.includes(id))) {
      throw new Error('a subset run names a case the reference report does not cover');
    }
    contracts = contractReportFrom(keep, keep.results.map((result) => replaced.get(result.id) ?? result));
  }
  let narratives = reference.narratives;
  if (subset.narratives !== null) {
    const keep = narratives;
    const part = subset.narratives;
    if (keep === null) {
      throw new Error('the reference report has no narratives to splice into');
    }
    if (part.promptVersion !== keep.promptVersion || part.promptSha256 !== keep.promptSha256 || part.modelId !== keep.modelId || part.setSha256 !== keep.setSha256) {
      throw new Error('a subset run is spliced only into a report of the same prompt, model and set');
    }
    const rerun = new Set(part.caseIds);
    if ([...rerun].some((id) => !keep.caseIds.includes(id))) {
      throw new Error('a subset run names a case the reference report does not cover');
    }
    const failures = sortedById([...keep.failures.filter((failure) => !rerun.has(failure.id)), ...part.failures]);
    narratives = { ...keep, failures, passed: keep.cases - failures.length };
  }
  return { ...reference, spliced: true, contracts, narratives };
}
