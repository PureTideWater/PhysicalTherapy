import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TRUTH_FIELDS, type TruthField } from '@tp/synth';

import { type Baseline, type BaselineEntry, type ContractBaseline, type ContractVariant, type NarrativeBaseline, BASELINE_FORMAT, parseBaseline } from '../src/baseline-format';
import { type PermittedReport, earlierPermittedReportSchema, permittedRegressions, permittedReportSchema } from '../src/permitted';
import { PROMPTS } from '../src/prompts';
import type { ProviderKind } from '../src/provider';
import { type FieldTally, asCounts, wrongVerified } from '../src/tally';
import { FLOORS, type FloorKind, type Floors, belowFloors, unsetFloors } from './floors';
import type { ContractReport, EvaluationReport } from './harness';
import { below, precision, recall } from './score';
import { contractSetCaseIds, narrativeSetCaseIds } from './sets';

/**
 * The committed baseline and the gate (PRD 14: "the gate for a prompt or model change is field-level
 * precision and recall on that set with no regression ... Narrative drafting has a zero-tolerance
 * gate: any verifier failure on the 300-case synthetic set blocks the change"; docs/adr/0051 and 0070).
 *
 * baseline.json (format tp-model-eval-baseline/3, src/baseline-format.ts) holds one entry per purpose,
 * prompt version, provider, model and (for contracts) variant, with the tallies it scored, the hash of
 * the set it scored them on, and the SHA-256 of the report it was recorded from (eval/reports/<sha256>.json,
 * committed beside it, from which a golden test recomputes every entry).
 *
 * A contract report is held to the entry for its provider and variant (never another variant's: the
 * larger model for contracts marked ambiguous is a model of its own): the same prompt version and model
 * when there is one; otherwise the same model under an earlier prompt, so a prompt change is held to the
 * prompt it replaces; otherwise the variant's latest entry, so a model change is held to the model it
 * replaces. Counts recorded on another set are never compared (set_changed). Against a held entry on
 * the same set, neither overall nor any field's precision or recall may fall, and no field's wrong but
 * verified (src/tally.ts) may rise. Whatever the baseline, every report is also held to rules that do
 * not compare: zero wrong but verified on a case whose page text is faithful; on an unfaithful case, no
 * more wrong but verified per field than the local reference (a faithful copier of the text as read)
 * scores there in the same run; every expected conflict pair proposed and flagged both ways; every
 * injected twin's answer and review equal to its clean twin's, both calls answered, and no output string
 * holding the injection's canary; for a real provider, every recall and precision floor set
 * (eval/floors.json) and met; every quote on its page. A narrative report fails on any case with a
 * critical error.
 *
 * A report is gated only when it covers its set exactly (incomplete_report: the gate computes nothing
 * else). A spliced report (eval/harness.ts spliceReport) is gated in tests and never recorded.
 *
 * Recording (recordBaseline) is a person's act, with ./cli.ts --record, from a run where the provider can
 * be called: it records only a report with no blocking problem, writes the report file, and replaces an
 * entry only of the same purpose, prompt version, provider, model and variant. A set change and a prompt
 * or model change never land in one record (the two-step re-baseline, review B2): --new-set accepts a
 * changed set only when the report's prompt version, prompt hash, provider, model and variant are the
 * held entry's, so the held model is first recorded on the new set and the new prompt or model is then
 * gated against that entry with every rule in force.
 *
 * A real provider's contract entry is recorded with `permitted: 'pending'` (session ruling 9, F5 (a);
 * docs/adr/0070, Part 2): production does not serve it (src/evaluated.ts, `permitted_pending`), and only
 * the permitted run's own job may call the model for it, until the in-boundary run on the practices'
 * permitted examples (apps/worker evaluate-permitted) shows no regression and recordPermitted writes that
 * run's report hashes into the entry (./cli.ts record-permitted). That commit serves the key.
 */

export { BASELINE_FORMAT, parseBaseline, type Baseline, type ContractBaseline, type NarrativeBaseline };

export const BASELINE_PATH = path.resolve(import.meta.dirname, 'baseline.json');
/** Where each recorded report is kept, named by its SHA-256. */
export const REPORTS_DIR = path.resolve(import.meta.dirname, 'reports');

export function readBaseline(file: string = BASELINE_PATH): Baseline {
  return parseBaseline(JSON.parse(readFileSync(file, 'utf8')));
}

export type GateProblem =
  | { readonly code: 'incomplete_report'; readonly purpose: string; readonly missing: readonly string[]; readonly unexpected: readonly string[] }
  | { readonly code: 'spliced_report' }
  | { readonly code: 'no_baseline'; readonly purpose: string; readonly provider: ProviderKind; readonly variant: ContractVariant }
  | { readonly code: 'prompt_changed'; readonly purpose: string; readonly promptVersion: string }
  | { readonly code: 'set_changed'; readonly purpose: string }
  | { readonly code: 'new_set_with_change'; readonly purpose: string; readonly changed: readonly string[] }
  | { readonly code: 'precision_regressed' | 'recall_regressed'; readonly field: TruthField | 'all' }
  | { readonly code: 'wrong_verified_rose'; readonly field: TruthField | 'all'; readonly was: number; readonly now: number }
  | { readonly code: 'wrong_verified_on_faithful'; readonly field: TruthField; readonly count: number }
  | { readonly code: 'reference_missing'; readonly cases: readonly string[] }
  | { readonly code: 'wrong_verified_above_reference'; readonly case: string; readonly field: TruthField; readonly was: number; readonly now: number }
  | { readonly code: 'conflict_unflagged'; readonly count: number; readonly cases: readonly string[] }
  | { readonly code: 'pair_term_extra'; readonly case: string; readonly field: TruthField; readonly faithful: boolean }
  | { readonly code: 'twin_incomplete' | 'twin_differs' | 'twin_canary'; readonly cases: readonly string[] }
  | { readonly code: 'floor_unset'; readonly field: TruthField; readonly kind: FloorKind }
  | { readonly code: 'recall_below_floor' | 'precision_below_floor'; readonly field: TruthField }
  | { readonly code: 'quotes_off_page'; readonly count: number }
  | { readonly code: 'narrative_failures'; readonly count: number; readonly cases: readonly string[] };

export type GateCode = GateProblem['code'];

export interface GateResult {
  readonly passed: boolean;
  readonly problems: readonly GateProblem[];
  /** The contract baseline entry the report was held to, if any. */
  readonly heldTo: ContractBaseline | null;
}

export interface GateOptions {
  /** The person says the set changed on purpose (./cli.ts --new-set): see the two-step re-baseline above. */
  readonly newSet?: boolean;
  /** The recall and precision floors a real provider is held to (the committed eval/floors.json by default). */
  readonly floors?: Floors;
  /**
   * The local reference's contract report from the same run, covering at least every unfaithful case
   * (./reference.ts on the local provider; the CLI computes it before gating). Without it, a report with
   * an unfaithful case fails (reference_missing): the cap is never skipped.
   */
  readonly reference?: ContractReport | null;
  /** The case IDs a complete report covers (the committed sets' by default). */
  readonly caseIds?: { readonly contracts?: readonly string[]; readonly narratives?: readonly string[] };
}

let committed: { readonly contracts: readonly string[]; readonly narratives: readonly string[] } | undefined;

/** The committed sets' case IDs, read once (the manifests and parts only, no document). */
function committedCaseIds(): { readonly contracts: readonly string[]; readonly narratives: readonly string[] } {
  committed ??= { contracts: contractSetCaseIds(), narratives: narrativeSetCaseIds() };
  return committed;
}

/** The contract entry a report is held to (see above), or null when the provider has none for the variant. */
export function contractBaselineFor(
  baseline: Baseline,
  report: { readonly provider: ProviderKind; readonly variant: ContractVariant; readonly promptVersion: string; readonly modelId: string },
): ContractBaseline | null {
  const entries = baseline.entries.filter((entry): entry is ContractBaseline => entry.purpose === 'proposeContractTerms' && entry.provider === report.provider && entry.variant === report.variant);
  return (
    entries.find((entry) => entry.prompt_version === report.promptVersion && entry.model_id === report.modelId) ??
    entries.filter((entry) => entry.model_id === report.modelId).at(-1) ??
    entries.at(-1) ??
    null
  );
}

function regressions(current: FieldTally, held: FieldTally, field: TruthField | 'all'): GateProblem[] {
  const problems: GateProblem[] = [];
  if (below(precision(asCounts(current)), precision(asCounts(held)))) {
    problems.push({ code: 'precision_regressed', field });
  }
  if (below(recall(asCounts(current)), recall(asCounts(held)))) {
    problems.push({ code: 'recall_regressed', field });
  }
  return problems;
}

/**
 * A prompt version recorded under another content hash than the one it records now: released versions never
 * change (prompts/<name>/CHANGELOG.md), so one edited in place is held as a changed prompt, never as the one
 * the baseline scored.
 */
function promptChanged(baseline: Baseline, provider: ProviderKind, result: { readonly purpose: string; readonly promptVersion: string; readonly promptSha256: string }): GateProblem[] {
  const changed = baseline.entries.some((entry) => entry.purpose === result.purpose && entry.provider === provider && entry.prompt_version === result.promptVersion && entry.prompt_sha256 !== result.promptSha256);
  return changed ? [{ code: 'prompt_changed', purpose: result.purpose, promptVersion: result.promptVersion }] : [];
}

/** The case IDs a report part is missing and those it should not hold, against the set's; both empty when complete. */
function coverage(part: { readonly caseIds: readonly string[]; readonly cases: number }, ids: readonly string[], results: readonly string[]): { readonly missing: string[]; readonly unexpected: string[] } {
  const want = new Set(ids);
  // The part's own list, its results and its count must agree, or its totals are not over the cases it names.
  const said = new Set([...part.caseIds, ...results]);
  const missing = [...want].filter((id) => !said.has(id) || !part.caseIds.includes(id) || !results.includes(id)).sort();
  const unexpected = [...said].filter((id) => !want.has(id)).sort();
  if (missing.length === 0 && unexpected.length === 0 && (part.cases !== want.size || part.caseIds.length !== want.size || results.length !== want.size)) {
    return { missing: [], unexpected: ['(duplicate)'] };
  }
  return { missing, unexpected };
}

/** The fields among prompt version, prompt hash, model and variant where the report is not the held entry. */
function changedFrom(entry: ContractBaseline, contracts: ContractReport): string[] {
  const pairs: [string, string, string][] = [
    ['prompt_version', entry.prompt_version, contracts.promptVersion],
    ['prompt_sha256', entry.prompt_sha256, contracts.promptSha256],
    ['model_id', entry.model_id, contracts.modelId],
    ['variant', entry.variant, contracts.variant],
  ];
  return pairs.filter(([, held, now]) => held !== now).map(([name]) => name);
}

/** The rules every contract report is held to whatever the baseline (see the module comment). */
function absoluteProblems(provider: ProviderKind, contracts: ContractReport, options: GateOptions): GateProblem[] {
  const problems: GateProblem[] = [];
  for (const field of TRUTH_FIELDS) {
    const count = contracts.faithfulWrongVerified[field];
    if (count > 0) {
      problems.push({ code: 'wrong_verified_on_faithful', field, count });
    }
  }
  const unfaithful = contracts.results.filter((result) => result.pageText === 'unfaithful');
  const reference = options.reference ?? null;
  const referenceOf = new Map(
    (reference !== null && reference.setSha256 === contracts.setSha256 && reference.promptVersion === contracts.promptVersion ? reference.results : []).filter((result) => result.problem === null).map((result) => [result.id, result]),
  );
  const missing = unfaithful.filter((result) => !referenceOf.has(result.id)).map((result) => result.id);
  if (missing.length > 0) {
    problems.push({ code: 'reference_missing', cases: missing });
  }
  for (const result of unfaithful) {
    const held = referenceOf.get(result.id);
    for (const field of held === undefined ? [] : TRUTH_FIELDS) {
      const was = held?.wrongVerified[field] ?? 0;
      const now = result.wrongVerified[field];
      if (now > was) {
        problems.push({ code: 'wrong_verified_above_reference', case: result.id, field, was, now });
      }
    }
  }
  if (contracts.conflicts.unflagged.length > 0) {
    const count = contracts.results.reduce((sum, result) => sum + result.conflicts.expected - result.conflicts.flagged, 0);
    problems.push({ code: 'conflict_unflagged', count, cases: contracts.conflicts.unflagged });
  }
  const faithful = new Set(contracts.results.filter((result) => result.pageText === 'faithful').map((result) => result.id));
  for (const extra of contracts.pairTermExtra) {
    problems.push({ code: 'pair_term_extra', case: extra.case, field: extra.field, faithful: faithful.has(extra.case) });
  }
  const { twins } = contracts;
  if (twins.incomplete.length > 0) {
    problems.push({ code: 'twin_incomplete', cases: twins.incomplete });
  }
  if (twins.differing.length > 0) {
    problems.push({ code: 'twin_differs', cases: twins.differing });
  }
  if (twins.canary.length > 0) {
    problems.push({ code: 'twin_canary', cases: twins.canary });
  }
  if (provider !== 'local') {
    // The local provider answers with the reference answers and is never held to floors; every other provider is.
    const floors = options.floors ?? FLOORS;
    problems.push(...unsetFloors(floors).map(({ field, kind }): GateProblem => ({ code: 'floor_unset', field, kind })));
    problems.push(...belowFloors(floors, contracts.fields).map(({ field, kind }): GateProblem => ({ code: kind === 'recall' ? 'recall_below_floor' : 'precision_below_floor', field })));
  }
  if (contracts.quotesOffPage > 0) {
    problems.push({ code: 'quotes_off_page', count: contracts.quotesOffPage });
  }
  return problems;
}

export function gate(report: EvaluationReport, baseline: Baseline, options: GateOptions = {}): GateResult {
  const { contracts, narratives } = report;
  const problems: GateProblem[] = [];
  const ids = { contracts: options.caseIds?.contracts ?? committedCaseIds().contracts, narratives: options.caseIds?.narratives ?? committedCaseIds().narratives };
  if (contracts !== null) {
    const { missing, unexpected } = coverage(contracts, ids.contracts, contracts.results.map((result) => result.id));
    if (missing.length > 0 || unexpected.length > 0) {
      problems.push({ code: 'incomplete_report', purpose: contracts.purpose, missing, unexpected });
    }
  }
  if (narratives !== null) {
    const { missing, unexpected } = coverage(narratives, ids.narratives, narratives.caseIds);
    if (missing.length > 0 || unexpected.length > 0) {
      problems.push({ code: 'incomplete_report', purpose: narratives.purpose, missing, unexpected });
    }
  }
  if (problems.length > 0) {
    // A report that does not cover its set has totals over other cases than the baseline's: nothing else is computed (review M2).
    return { passed: false, problems, heldTo: null };
  }
  if (report.spliced) {
    problems.push({ code: 'spliced_report' });
  }
  let heldTo: ContractBaseline | null = null;
  if (contracts !== null) {
    heldTo = contractBaselineFor(baseline, { provider: report.provider, variant: contracts.variant, promptVersion: contracts.promptVersion, modelId: contracts.modelId });
    if (heldTo === null) {
      problems.push({ code: 'no_baseline', purpose: contracts.purpose, provider: report.provider, variant: contracts.variant });
    }
  }
  for (const result of [contracts, narratives]) {
    if (result !== null) {
      problems.push(...promptChanged(baseline, report.provider, result));
    }
  }
  if (contracts !== null) {
    if (heldTo !== null) {
      const sameSet = heldTo.set_sha256 === contracts.setSha256;
      if (!sameSet) {
        // Counts on another set say nothing about this one: no regression is computed (the two-step re-baseline).
        problems.push({ code: 'set_changed', purpose: contracts.purpose });
      }
      const changed = changedFrom(heldTo, contracts);
      if (options.newSet === true && changed.length > 0) {
        problems.push({ code: 'new_set_with_change', purpose: contracts.purpose, changed });
      }
      if (sameSet) {
        problems.push(...regressions(contracts.total, heldTo.total, 'all'));
        for (const field of TRUTH_FIELDS) {
          problems.push(...regressions(contracts.fields[field], heldTo.fields[field], field));
        }
        const rose = (field: TruthField | 'all', now: FieldTally, held: FieldTally): GateProblem[] =>
          wrongVerified(now) > wrongVerified(held) ? [{ code: 'wrong_verified_rose', field, was: wrongVerified(held), now: wrongVerified(now) }] : [];
        problems.push(...rose('all', contracts.total, heldTo.total));
        for (const field of TRUTH_FIELDS) {
          problems.push(...rose(field, contracts.fields[field], heldTo.fields[field]));
        }
      }
    }
    problems.push(...absoluteProblems(report.provider, contracts, options));
  }
  if (narratives !== null && narratives.failures.length > 0) {
    problems.push({ code: 'narrative_failures', count: narratives.failures.length, cases: narratives.failures.map((failure) => failure.id) });
  }
  return { passed: problems.length === 0, problems, heldTo };
}

/**
 * The problems that stop a record: every one but a first record's `no_baseline`, a `set_changed` the
 * person accepted with --new-set (and no `new_set_with_change`), and a `pair_term_extra` on an
 * unfaithful case (on a faithful one it is wrong but verified, and blocks).
 */
export function blockingProblems(problems: readonly GateProblem[], newSet: boolean): GateProblem[] {
  const acceptedSet = newSet && !problems.some((problem) => problem.code === 'new_set_with_change');
  return problems.filter((problem) => {
    if (problem.code === 'no_baseline') {
      return false;
    }
    if (problem.code === 'set_changed') {
      return !acceptedSet;
    }
    return problem.code !== 'pair_term_extra' || problem.faithful;
  });
}

/** A report as it is recorded: pretty JSON with a closing newline, named by the SHA-256 of exactly that text. */
export function reportText(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export const reportSha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The recorded report a baseline entry names, read from eval/reports and checked against its name. */
export function readReport(sha256: string, dir: string = REPORTS_DIR): EvaluationReport {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('a report is named by its SHA-256');
  }
  const text = readFileSync(path.join(dir, `${sha256}.json`), 'utf8');
  if (reportSha256(text) !== sha256) {
    throw new Error(`eval/reports/${sha256}.json does not hash to its name`);
  }
  return JSON.parse(text) as EvaluationReport;
}

/** The entries a report records (one per purpose it holds), as recordBaseline writes them and the golden test recomputes them. */
export function entriesFromReport(report: EvaluationReport, sha256: string, recordedOn: string): BaselineEntry[] {
  const entries: BaselineEntry[] = [];
  const { contracts, narratives } = report;
  if (contracts !== null) {
    const faithful = TRUTH_FIELDS.reduce((sum, field) => sum + contracts.faithfulWrongVerified[field], 0);
    if (faithful !== 0 || contracts.conflicts.unflagged.length !== 0 || contracts.twins.differing.length !== 0) {
      throw new Error('a contract report with wrong-but-verified fields on a faithful case, an unflagged conflict or a differing twin is never recorded');
    }
    entries.push({
      purpose: 'proposeContractTerms',
      prompt_version: contracts.promptVersion,
      prompt_sha256: contracts.promptSha256,
      provider: report.provider,
      model_id: contracts.modelId,
      variant: contracts.variant,
      set_sha256: contracts.setSha256,
      cases: contracts.cases,
      fields: Object.fromEntries(TRUTH_FIELDS.map((field) => [field, { ...contracts.fields[field] }])) as ContractBaseline['fields'],
      total: { ...contracts.total },
      faithful_wrong_verified: 0,
      conflicts: { expected: contracts.conflicts.expected, unflagged: 0 },
      twins: { pairs: contracts.twins.pairs, differing: 0 },
      // A real provider's entry is served only once the permitted run is recorded on it (recordPermitted).
      ...(report.provider === 'local' ? {} : { permitted: 'pending' as const }),
      report_sha256: sha256,
      recorded_on: recordedOn,
    });
  }
  if (narratives !== null) {
    if (narratives.failures.length !== 0) {
      throw new Error('a narrative report with a failure is never recorded');
    }
    entries.push({
      purpose: 'draftPacketNarrative',
      prompt_version: narratives.promptVersion,
      prompt_sha256: narratives.promptSha256,
      provider: report.provider,
      model_id: narratives.modelId,
      set_sha256: narratives.setSha256,
      cases: narratives.cases,
      failures: 0,
      report_sha256: sha256,
      recorded_on: recordedOn,
    });
  }
  return entries;
}

export interface RecordOptions extends GateOptions {
  readonly newSet?: boolean;
}

export interface Recorded {
  /** The baseline with this report's entries in place of those they supersede. */
  readonly baseline: Baseline;
  /** The report file to commit beside it: eval/reports/<sha256>.json holding exactly `text`. */
  readonly report: { readonly sha256: string; readonly text: string };
}

/**
 * The baseline with this report's results recorded, and the report file that goes with it. Refuses a
 * spliced report, and any report the gate finds a blocking problem in (blockingProblems); replaces an
 * entry only of the same purpose, prompt version, provider, model and (for contracts) variant (review m1).
 */
export function recordBaseline(baseline: Baseline, report: EvaluationReport, recordedOn: string, options: RecordOptions = {}): Recorded {
  const newSet = options.newSet === true;
  const blocking = blockingProblems(gate(report, baseline, options).problems, newSet);
  if (blocking.length > 0) {
    throw new Error(`the report fails the gate; nothing is recorded (${[...new Set(blocking.map((problem) => problem.code))].join(', ')})`);
  }
  const text = reportText(report);
  const sha256 = reportSha256(text);
  const entries = entriesFromReport(report, sha256, recordedOn);
  const same = (a: BaselineEntry, b: BaselineEntry) =>
    a.purpose === b.purpose &&
    a.prompt_version === b.prompt_version &&
    a.provider === b.provider &&
    a.model_id === b.model_id &&
    (a.purpose !== 'proposeContractTerms' || b.purpose !== 'proposeContractTerms' || a.variant === b.variant);
  return {
    baseline: parseBaseline({ ...baseline, entries: [...baseline.entries.filter((entry) => !entries.some((added) => same(entry, added))), ...entries] }),
    report: { sha256, text },
  };
}

/** Writes a record: the baseline file and the report file it names. */
export function writeRecorded(recorded: Recorded, files: { readonly baseline?: string; readonly reports?: string } = {}): { readonly baseline: string; readonly report: string } {
  const baselineFile = files.baseline ?? BASELINE_PATH;
  const reportsDir = files.reports ?? REPORTS_DIR;
  mkdirSync(reportsDir, { recursive: true });
  const reportFile = path.join(reportsDir, `${recorded.report.sha256}.json`);
  writeFileSync(reportFile, recorded.report.text);
  writeFileSync(baselineFile, `${JSON.stringify(recorded.baseline, null, 2)}\n`);
  return { baseline: baselineFile, report: reportFile };
}

/** A permitted run recorded on the contract entries it covers: the baseline with them updated, and which were. */
export interface PermittedRecorded {
  readonly baseline: Baseline;
  /** The entries' variants the run was recorded on. */
  readonly variants: readonly ContractVariant[];
}

/**
 * Records an in-boundary permitted run (apps/worker evaluate-permitted, report tp-model-eval-permitted/2)
 * on the real provider's contract entries it covers (F5 (a); docs/adr/0070, Part 2): every entry of that
 * provider, the current contract prompt version and content, and a model the report names. Refuses, and
 * records nothing, unless:
 *
 * - the report parses as /2, strictly (a /1 report, or one with any field the run does not write, such
 *   as a splice mark, is refused);
 * - it names a real provider, the current contract prompt version and its content hash, and exactly the
 *   models that prompt pins for the provider, and some entry is recorded for them;
 * - when any contract entry of the provider already rests on a recorded permitted run (a change from
 *   something served), an earlier report is given (`against`), and permittedRegressions finds nothing
 *   worse in this run than in that one: the same examples, no precision or recall lower, no more
 *   wrong-but-verified values, no more refusals. Before anything of the provider was served, `against` may
 *   be left out (the first run, with no examples before the first practice); when it is given it is
 *   always compared;
 * - no example's call failed (`call_failed:<code>`) and none was refused because the feature, or the
 *   variant the example asks for, was off for the run (`refused:kill_switch`, `refused:feature_off`,
 *   `refused:not_evaluated`): such a run did not measure the model the entries would serve, and a first
 *   run (no `against`) is compared with nothing, so a run in which nothing reached the model would
 *   otherwise serve it. An input the gateway refuses on its own merits (a document of another kind) and
 *   an example that could not be read stay what they were, counted, since a rerun would refuse them again.
 *
 * Writes `permitted: { examples, report_sha256, against_sha256, recorded_on }`, the SHA-256 of each file's
 * text exactly as given. Nothing of the report but its example count is kept: the reports stay in the
 * PHI boundary's own storage, and they hold counts, codes and example IDs only.
 */
export function recordPermitted(baseline: Baseline, report: { readonly text: string }, against: { readonly text: string } | null, recordedOn: string): PermittedRecorded {
  const parsed = permittedReportSchema.safeParse(parseJson(report.text));
  if (!parsed.success) {
    throw new Error('record-permitted takes a tp-model-eval-permitted/2 report as evaluate-permitted wrote it; nothing is recorded');
  }
  const run: PermittedReport = parsed.data;
  const prompt = PROMPTS.proposeContractTerms;
  if (run.provider === 'local' || !Object.hasOwn(prompt.models, run.provider)) {
    throw new Error('record-permitted records a run on a real provider only; nothing is recorded');
  }
  const provider = run.provider as ProviderKind;
  const pinned = [...new Set(Object.values(prompt.models[provider]))].sort();
  if (run.promptVersion !== prompt.id || run.promptSha256 !== prompt.sha256 || JSON.stringify([...run.modelIds].sort()) !== JSON.stringify(pinned)) {
    throw new Error('the permitted run is not of the current contract prompt version and the models it pins for the provider; nothing is recorded');
  }
  const covered = (entry: BaselineEntry): entry is ContractBaseline =>
    entry.purpose === 'proposeContractTerms' && entry.provider === provider && entry.prompt_version === prompt.id && entry.prompt_sha256 === prompt.sha256 && pinned.includes(entry.model_id);
  const targets = baseline.entries.filter(covered);
  if (targets.length === 0) {
    throw new Error('no contract entry is recorded for the run’s provider, prompt version and models; record the synthetic run first (eval --record)');
  }
  const unmeasured = [...new Set(run.problems.map((entry) => entry.problem).filter(isUnmeasured))].sort();
  if (unmeasured.length > 0) {
    throw new Error(`the permitted run did not reach the model for every example; run it again with the feature on and evaluable; nothing is recorded (${unmeasured.join(', ')})`);
  }
  const servedBefore = baseline.entries.some((entry) => entry.purpose === 'proposeContractTerms' && entry.provider === provider && typeof entry.permitted === 'object');
  if (against === null && servedBefore) {
    throw new Error('the provider already serves contracts on a recorded permitted run: give --against, the run of what is served now on the same examples; nothing is recorded');
  }
  if (against !== null) {
    const earlier = earlierPermittedReportSchema.safeParse(parseJson(against.text));
    const regressions = earlier.success ? permittedRegressions(run, earlier.data) : ['earlier_report_invalid'];
    if (regressions.length > 0) {
      throw new Error(`the permitted run regressed against the earlier one; nothing is recorded (${regressions.join(', ')})`);
    }
  }
  const permitted = { examples: run.examples, report_sha256: reportSha256(report.text), against_sha256: against === null ? null : reportSha256(against.text), recorded_on: recordedOn };
  return {
    baseline: parseBaseline({ ...baseline, entries: baseline.entries.map((entry) => (covered(entry) ? { ...entry, permitted } : entry)) }),
    variants: targets.map((entry) => entry.variant),
  };
}

/** A permitted example's problem that means the run did not measure the model: a failed call, or the feature or variant off for the run. */
const UNMEASURED_REFUSALS: readonly string[] = ['refused:kill_switch', 'refused:feature_off', 'refused:not_evaluated'];
const isUnmeasured = (problem: string) => problem.startsWith('call_failed:') || UNMEASURED_REFUSALS.includes(problem);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Writes a baseline file (record-permitted's: no report file goes with it). */
export function writeBaseline(baseline: Baseline, file: string = BASELINE_PATH): string {
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
  return file;
}
