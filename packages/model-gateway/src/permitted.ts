import { addDays } from '@tp/contracts';
import { canonicalNumber } from '@tp/packets';
import { z } from 'zod';

import { CONTRACT_VARIANTS, type ContractVariant, tallySchema } from './baseline-format';
import { normalized, readAmount, readDate, readPercent, readYear } from './figures';
import type { CandidateReview, ContractTermsProposal } from './functions/contract-terms';
import { PROMPTS } from './prompts';
import type { ProviderKind } from './provider';
import { type DerivedCounts, type FieldTally, type Stated, asCounts, sumTallies, tallyFields, totalTally, wrongVerified, zeroTallies } from './tally';

/**
 * The evaluation on permitted real examples, inside the PHI boundary (PRD 14, Logging and evaluation:
 * "The evaluation set starts with 40 synthetic contracts ... and grows with permitted real ones; the
 * gate for a prompt or model change is field-level precision and recall on that set with no regression,
 * run in CI on the synthetic subset and in the PHI boundary on the rest"; docs/adr/0054 and 0070).
 *
 * A permitted example (eval_example, source permitted) is a specialist's correction of a contract
 * proposal, kept under the practice's signed data-rights agreement: the document the call read, and the
 * version's final rate records as the specialist approved them. The run (the worker's evaluate-permitted
 * task, in production, in each practice's own scope) proposes the document's terms again with the current
 * prompt and model and tallies the proposal against the final records field by field, with the tally the
 * synthetic gate uses (./tally.ts): each final record pairs with the candidate that gets most of its
 * fields right, and each field is right (tp), wrong but verified (wrong, extra), rejected by the verifier
 * (rejected, rejected_extra) or missed. The tp, fp and fn of format /1 are derived from these, so
 * precision and recall mean what they meant; wrong but verified is now counted on its own, and the gate
 * refuses a run in which it rose.
 *
 * Two correction formats are read. tp-eval-correction/2 (written from docs/adr/0070 on) records the
 * reviewer's decision and each final record's citation with its document, and holds only the finals cited
 * from the example's own document: a contract-plus-exhibit version's exhibit records are not the
 * contract's expectation. The scorer filters to the example's document again, whatever the writer did,
 * and leaves out a final with no citation (it was entered with no evidence, so belongs to no document's
 * expectation; the writer counts those as uncited_finals). A tp-eval-correction/1 example cannot be
 * filtered, since its citations name no document, so all its finals are scored, and the report counts it
 * as legacy and unfiltered.
 *
 * Scored fields are the ones a contract writes and the specialist's record keeps as written: the method,
 * codes, modifiers, places of service, amount, percentage, fee-schedule year, the lesser-of schedule and
 * the effective dates. Flags and rounding are left out: a final record holds them whether the contract
 * stated them or the specialist confirmed a default, so they cannot be told apart. An example whose call
 * the gateway refused (a document of another kind, or one PR C's screen refuses for naming a patient) is
 * counted as refused, apart from the tally: a refusal is not a miss of the model's. Reports hold counts,
 * codes and example IDs only, never a document's text or a figure.
 */

export const CORRECTION_FORMAT_V1 = 'tp-eval-correction/1';
export const CORRECTION_FORMAT_V2 = 'tp-eval-correction/2';
/** The correction formats the run reads, oldest first. */
export const CORRECTION_FORMATS = [CORRECTION_FORMAT_V1, CORRECTION_FORMAT_V2] as const;
/** The format a correction is written in. */
export const CORRECTION_FORMAT = CORRECTION_FORMAT_V2;

/** The reviewer's decisions on a proposal (model_call reviewer_decision). */
export const CORRECTION_DECISIONS = ['accepted', 'accepted_with_changes', 'rejected'] as const;

export const PERMITTED_FIELDS = ['method', 'codes', 'modifiers', 'places_of_service', 'amount', 'percentage', 'fee_schedule_year', 'lesser_of_schedule', 'effective_from', 'effective_to'] as const;
export type PermittedField = (typeof PERMITTED_FIELDS)[number];

const record = z.object({ scope: z.record(z.string(), z.unknown()), method: z.string(), parameters: z.record(z.string(), z.unknown()) });
const citation = z.object({ document_id: z.uuid(), page: z.number().int().min(1), quote: z.string(), hash: z.string() });

const correctionV1 = z.object({ format: z.literal(CORRECTION_FORMAT_V1), document_id: z.uuid(), records: z.array(record) });
const correctionV2 = z.object({
  format: z.literal(CORRECTION_FORMAT_V2),
  document_id: z.uuid(),
  contract_version_id: z.uuid(),
  decision: z.enum(CORRECTION_DECISIONS),
  changed_fields: z.array(z.string()),
  /** The version's finals entered with no citation, which no document's expectation holds. */
  uncited_finals: z.number().int().min(0),
  records: z.array(record.extend({ citation: citation.nullable() })),
});

/** The correction a permitted example's expected holds (contract proposals' review writes it), in either format. */
export const correctionSchema = z.discriminatedUnion('format', [correctionV1, correctionV2]);
export type Correction = z.output<typeof correctionSchema>;
export type FinalRecord = Correction['records'][number];

/** Whether a correction's finals cannot be filtered to its own document (format /1: its citations name none). */
export function isLegacyCorrection(correction: Correction): boolean {
  return correction.format === CORRECTION_FORMAT_V1;
}

/** The finals an example is scored against: a /2 correction's cited from its own document, every final of a /1 one. */
export function scoredFinals(correction: Correction): readonly FinalRecord[] {
  if (correction.format === CORRECTION_FORMAT_V1) {
    return correction.records;
  }
  return correction.records.filter((final) => final.citation !== null && final.citation.document_id === correction.document_id);
}

type Keys = Partial<Record<PermittedField, string>>;

const setKey = (items: readonly string[]) => [...new Set(items.map((item) => normalized(item).toUpperCase()))].sort().join(' ');
const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const object = (value: unknown): Readonly<Record<string, unknown>> | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** A final record's fields as comparable keys: the terms as the specialist approved them. */
export function finalKeys(final: FinalRecord): Keys {
  const keys: Keys = { method: final.method };
  const { scope, parameters } = final;
  const schedule = object(parameters.schedule);
  const codes = strings(scope.codes);
  const modifiers = strings((scope.modifier_sets as unknown[] | undefined)?.[0]);
  const places = strings(scope.places_of_service);
  if (codes !== null) {
    keys.codes = setKey(codes);
  }
  if (modifiers !== null) {
    keys.modifiers = setKey(modifiers);
  }
  if (places !== null) {
    keys.places_of_service = setKey(places);
  }
  const amount = text(parameters.amount_cents) ?? text(schedule?.amount_cents);
  if (amount !== null) {
    keys.amount = amount;
  }
  const percentage = text(parameters.percentage) ?? text(schedule?.percentage);
  if (percentage !== null) {
    keys.percentage = canonicalNumber(percentage);
  }
  const year = /^LOCKED:(\d{4})$/.exec(text(parameters.year_basis) ?? text(schedule?.year_basis) ?? '')?.[1];
  if (year !== undefined) {
    keys.fee_schedule_year = year;
  }
  if (final.method === 'LESSER_OF') {
    const method = text(schedule?.method);
    if (method !== null) {
      keys.lesser_of_schedule = method;
    }
  }
  const from = text(scope.effective_from);
  const to = text(scope.effective_to);
  if (from !== null) {
    keys.effective_from = from;
  }
  if (to !== null) {
    // A scope's window ends the day after the last day the contract covers, which is what a contract writes.
    keys.effective_to = addDays(to, -1);
  }
  return keys;
}

/** What a reviewed candidate states, field by field, as code reads it, which of its fields verified, and whether it became a rate record. */
export function statedKeys(candidate: CandidateReview): Stated<PermittedField> {
  const keys: Partial<Record<PermittedField, string | null>> = { method: candidate.method };
  const verified = new Set<PermittedField>();
  for (const field of candidate.fields) {
    if (field.field === 'flags' || field.field === 'rounding') {
      continue;
    }
    const written = field.written;
    if (field.field === 'method') {
      // The method's value is the candidate's; its quote is what verified.
    } else if (Array.isArray(written)) {
      keys[field.field] = setKey(written);
    } else if (typeof written === 'string') {
      const read = { amount: () => readAmount(written)?.toString() ?? null, percentage: () => {
        const percent = readPercent(written);
        return percent === null ? null : canonicalNumber(percent);
      }, fee_schedule_year: () => {
        const year = readYear(written);
        return year === null ? null : String(year);
      } } as Partial<Record<PermittedField, () => string | null>>;
      keys[field.field] = (read[field.field] ?? (() => readDate(written)))();
    }
    if (field.verified) {
      verified.add(field.field);
    }
  }
  // The lesser-of schedule is not cited; it is stated when the candidate became a rate record.
  const schedule = object(candidate.rateRecord?.parameters.schedule);
  if (candidate.method === 'LESSER_OF' && schedule !== null && typeof schedule.method === 'string') {
    keys.lesser_of_schedule = schedule.method;
    verified.add('lesser_of_schedule');
  }
  // Whether the candidate became a rate record, so that a scope field it leaves out is counted widened,
  // wrong but verified, rather than missed (src/tally.ts; the PR review's M2), as eval/score.ts counts it.
  return { keys, verified, rateRecord: candidate.rateRecord !== null };
}

/** One example's field tallies: the proposal (null when the call proposed nothing) against the finals it is scored on (scoredFinals). */
export function scorePermitted(correction: Correction, proposal: ContractTermsProposal | null): Record<PermittedField, FieldTally> {
  const truths = scoredFinals(correction).map(finalKeys);
  return tallyFields(PERMITTED_FIELDS, truths, (proposal?.candidates ?? []).map(statedKeys)).tallies;
}

/** A refusal's problem code: the gateway refused the input before any call (InputRefusedError, PhiBoundaryError, ModelFeatureOffError). */
const isRefusal = (problem: string | null) => problem !== null && problem.startsWith('refused:');

/**
 * What an example's outcome says of the model, by its problem code, as an allowlist (the PR review's S1):
 *
 * - `measured`: the model was called and answered (no problem, or `invalid_output`, an answer that did not
 *   follow the schema). Only these measure the model the entry would serve.
 * - `outside_model`: nothing reached the model, for a reason of the example's own that a rerun meets
 *   again, so it is counted and kept: the document is no longer readable as a clean contract with its
 *   pages (`document_unavailable`), the expectation does not parse (`expected_invalid`), or the gateway
 *   refused the input on its own merits (a document of another kind, one with no page text or too many
 *   pages, or, from docs/adr/0070 Part 3, one that names a patient of the practice).
 * - `unmeasured`: every other code. The call failed (`call_failed:<code>`), or was refused for the run's
 *   own setting rather than the input (the kill switch, a flag, a feature or variant not evaluable, the PHI
 *   boundary of a run outside production, the patient screen unavailable, the budget, the server busy, a
 *   request the run built wrong), or the code is one this list does not know. Such a run measured
 *   nothing for that example and is refused whole by record-permitted: a new code is unmeasured until it is
 *   put on this list.
 */
export type PermittedOutcome = 'measured' | 'outside_model' | 'unmeasured';

/** The problem codes (beside none) of a call the model answered. */
export const MEASURED_PROBLEMS: readonly string[] = ['invalid_output'];
/** The problem codes of an example nothing of which reached the model, for a reason of its own. */
export const OUTSIDE_MODEL_PROBLEMS: readonly string[] = ['document_unavailable', 'expected_invalid', 'refused:document_kind', 'refused:no_text', 'refused:too_many_pages', 'refused:names_patient'];

export function permittedOutcome(problem: string | null): PermittedOutcome {
  if (problem === null || MEASURED_PROBLEMS.includes(problem)) {
    return 'measured';
  }
  return OUTSIDE_MODEL_PROBLEMS.includes(problem) ? 'outside_model' : 'unmeasured';
}

/** One example's outcome: its tallies, the problem code when the call proposed nothing, whether its correction was /1, and the variant it asked for. */
export interface PermittedResult {
  readonly exampleId: string;
  readonly counts: Readonly<Record<PermittedField, FieldTally>>;
  readonly problem: string | null;
  /** Scored against every final of a /1 correction, unfiltered (isLegacyCorrection). */
  readonly legacy: boolean;
  /** The correction's finals with no citation, left out of its expectation (0 for /1, which cannot tell). */
  readonly uncitedFinals: number;
  /**
   * The variant the example's call asks for: `ambiguous` when the specialist had marked the contract
   * ambiguous (the larger model reads it), else `default`. Each variant is a model of its own, tallied,
   * compared and recorded on its own (the PR review's M3).
   */
  readonly variant: ContractVariant;
}

/**
 * One example's result from its correction (null when its expected did not parse), what the call
 * returned, and the variant the call asked for. A refused call is tallied as nothing (it is counted apart,
 * as refused); a call that failed or proposed nothing is tallied as proposing nothing, so every final is
 * missed and the gate cannot pass it silently.
 */
export function permittedResult(
  exampleId: string,
  correction: Correction | null,
  outcome: { readonly proposal: ContractTermsProposal | null; readonly problem: string | null },
  variant: ContractVariant,
): PermittedResult {
  if (correction === null || isRefusal(outcome.problem)) {
    return { exampleId, counts: zeroTallies(PERMITTED_FIELDS), problem: outcome.problem, legacy: correction !== null && isLegacyCorrection(correction), uncitedFinals: 0, variant };
  }
  return {
    exampleId,
    counts: scorePermitted(correction, outcome.proposal),
    problem: outcome.problem,
    legacy: isLegacyCorrection(correction),
    uncitedFinals: correction.format === CORRECTION_FORMAT_V2 ? correction.uncited_finals : 0,
    variant,
  };
}

export const PERMITTED_REPORT_FORMAT_V1 = 'tp-model-eval-permitted/1';
export const PERMITTED_REPORT_FORMAT = 'tp-model-eval-permitted/2';

/** One variant's part of a run: its model, its examples and their tallies. */
export interface PermittedVariantReport {
  /** The model the prompt version pins for the variant on the provider; null when it pins none (each such call is refused, not_evaluated). */
  readonly modelId: string | null;
  readonly examples: number;
  /** The variant's examples, sorted. */
  readonly exampleIds: readonly string[];
  /** The variant's examples the model answered (permittedOutcome `measured`). */
  readonly measured: number;
  readonly fields: Readonly<Record<PermittedField, FieldTally>>;
  readonly total: FieldTally;
  readonly refused: number;
}

/** Which run a report is: its ID and where it ran. */
export interface PermittedRunIdentity {
  /** The run's ID: the job actor its reads and calls are recorded under (model_call actor_id), a random UUID. */
  readonly runId: string;
  /** NODE_ENV=production: only there does a practice's material reach a real provider. */
  readonly production: boolean;
}

/** A run's report: counts, codes and example IDs only. */
export interface PermittedReport extends PermittedRunIdentity {
  readonly format: typeof PERMITTED_REPORT_FORMAT;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly provider: string;
  readonly practices: number;
  readonly examples: number;
  /** The examples run, sorted (eval_example row IDs, not PHI): the gate compares runs on the same examples, not the same number. */
  readonly exampleIds: readonly string[];
  /** The examples the model answered (permittedOutcome `measured`), every variant's. */
  readonly measured: number;
  /** Every variant's tallies summed: read alone it can hide one model's regression behind the other's gain, so the gate compares `variants`. */
  readonly fields: Readonly<Record<PermittedField, FieldTally>>;
  readonly total: FieldTally;
  /** Examples whose call the gateway refused before it was made: counted here, apart from the tally. */
  readonly refused: number;
  /** Each variant of the contract prompt, its model and its examples apart (the PR review's M3). */
  readonly variants: Readonly<Record<ContractVariant, PermittedVariantReport>>;
  /** Examples scored against every final of a /1 correction, unfiltered. */
  readonly legacyUnfiltered: number;
  /** Finals the examples' corrections left out for having no citation. */
  readonly uncitedFinals: number;
  /** Examples that proposed nothing, and why, as codes (refused:<code> among them). */
  readonly problems: readonly { readonly exampleId: string; readonly problem: string }[];
}

const sortedIds = (results: readonly PermittedResult[]) => results.map((result) => result.exampleId).sort();

function variantReport(modelId: string | null, results: readonly PermittedResult[]): PermittedVariantReport {
  const tallied = results.filter((result) => !isRefusal(result.problem));
  const fields = sumTallies(PERMITTED_FIELDS, tallied.map((result) => result.counts));
  return {
    modelId,
    examples: results.length,
    exampleIds: sortedIds(results),
    measured: results.filter((result) => permittedOutcome(result.problem) === 'measured').length,
    fields,
    total: totalTally(PERMITTED_FIELDS, fields),
    refused: results.length - tallied.length,
  };
}

/** The run's report from its examples' results, for the current prompt version and the models it pins for the provider, each variant apart. */
export function permittedReport(provider: ProviderKind, practices: number, results: readonly PermittedResult[], run: PermittedRunIdentity): PermittedReport {
  const prompt = PROMPTS.proposeContractTerms;
  const tallied = results.filter((result) => !isRefusal(result.problem));
  const fields = sumTallies(PERMITTED_FIELDS, tallied.map((result) => result.counts));
  return {
    format: PERMITTED_REPORT_FORMAT,
    runId: run.runId,
    production: run.production,
    promptVersion: prompt.id,
    promptSha256: prompt.sha256,
    provider,
    practices,
    examples: results.length,
    exampleIds: sortedIds(results),
    measured: results.filter((result) => permittedOutcome(result.problem) === 'measured').length,
    fields,
    total: totalTally(PERMITTED_FIELDS, fields),
    refused: results.length - tallied.length,
    variants: Object.fromEntries(
      CONTRACT_VARIANTS.map((variant) => [variant, variantReport(prompt.models[provider][variant] ?? null, results.filter((result) => result.variant === variant))]),
    ) as Record<ContractVariant, PermittedVariantReport>,
    legacyUnfiltered: results.filter((result) => result.legacy).length,
    uncitedFinals: results.reduce((sum, result) => sum + result.uncitedFinals, 0),
    problems: results.flatMap((result) => (result.problem === null ? [] : [{ exampleId: result.exampleId, problem: result.problem }])),
  };
}

const count = z.number().int().nonnegative();
const fieldsSchema = z.strictObject(Object.fromEntries(PERMITTED_FIELDS.map((field) => [field, tallySchema])) as Record<PermittedField, typeof tallySchema>);
const variantSchema = z.strictObject({ modelId: z.string().nullable(), examples: count, exampleIds: z.array(z.string()), measured: count, fields: fieldsSchema, total: tallySchema, refused: count });

/** A report as a run wrote it (the earlier run a gate compares against): every key, and nothing else. */
export const permittedReportSchema = z.strictObject({
  format: z.literal(PERMITTED_REPORT_FORMAT),
  runId: z.uuid(),
  production: z.boolean(),
  promptVersion: z.string(),
  promptSha256: z.string(),
  provider: z.string(),
  practices: count,
  examples: count,
  exampleIds: z.array(z.string()),
  measured: count,
  fields: fieldsSchema,
  total: tallySchema,
  refused: count,
  variants: z.strictObject(Object.fromEntries(CONTRACT_VARIANTS.map((variant) => [variant, variantSchema])) as Record<ContractVariant, typeof variantSchema>),
  legacyUnfiltered: count,
  uncitedFinals: count,
  problems: z.array(z.strictObject({ exampleId: z.string(), problem: z.string() })),
});

/**
 * An earlier report as the gate reads it: a /2 report, or a /1 report, which is read only to be refused
 * (`earlier_report_format`: its counts cannot tell a rejection from a wrong value, so the earlier side is
 * run again on the current code).
 */
export const earlierPermittedReportSchema = z.union([permittedReportSchema, z.looseObject({ format: z.literal(PERMITTED_REPORT_FORMAT_V1) })]);
export type EarlierPermittedReport = PermittedReport | { readonly format: typeof PERMITTED_REPORT_FORMAT_V1 };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether a report's counts are what permittedReport writes from some set of results (the PR review's N3):
 * the strict schema refuses a key the run does not write, and this refuses a report edited, or spliced from
 * two runs, whose parts no longer add up. Each example ID once, sorted, and counted; the variants' examples
 * the run's, each in one variant; each variant's total its fields', and the run's fields every variant's;
 * the refused and measured counts those its problems give; each problem an example's, once. Empty when it
 * holds; `report_inconsistent` otherwise.
 */
export function permittedReportProblems(report: PermittedReport): string[] {
  const ids = report.exampleIds;
  const problemOf = new Map(report.problems.map((entry) => [entry.exampleId, entry.problem]));
  const parts = CONTRACT_VARIANTS.map((variant) => report.variants[variant]);
  const sortedUnique = (list: readonly string[]) => same(list, [...new Set(list)].sort());
  const held = [
    sortedUnique(ids) && ids.length === report.examples,
    same([...parts.flatMap((part) => part.exampleIds)].sort(), ids),
    problemOf.size === report.problems.length && report.problems.every((entry) => ids.includes(entry.exampleId)),
    same(report.fields, sumTallies(PERMITTED_FIELDS, parts.map((part) => part.fields))) && same(report.total, totalTally(PERMITTED_FIELDS, report.fields)),
    report.refused === parts.reduce((sum, part) => sum + part.refused, 0) && report.measured === parts.reduce((sum, part) => sum + part.measured, 0),
    report.legacyUnfiltered <= report.examples,
    ...parts.map(
      (part) =>
        sortedUnique(part.exampleIds) &&
        part.exampleIds.length === part.examples &&
        same(part.total, totalTally(PERMITTED_FIELDS, part.fields)) &&
        part.refused === part.exampleIds.filter((id) => isRefusal(problemOf.get(id) ?? null)).length &&
        part.measured === part.exampleIds.filter((id) => permittedOutcome(problemOf.get(id) ?? null) === 'measured').length,
    ),
  ];
  return held.every(Boolean) ? [] : ['report_inconsistent'];
}

/** The variant's examples whose outcome is unmeasured (permittedOutcome), by problem code. */
export function unmeasuredProblems(report: PermittedReport, variants: readonly ContractVariant[] = CONTRACT_VARIANTS): string[] {
  const ids = new Set(variants.flatMap((variant) => report.variants[variant].exampleIds));
  return [...new Set(report.problems.filter((entry) => ids.has(entry.exampleId) && permittedOutcome(entry.problem) === 'unmeasured').map((entry) => entry.problem))].sort();
}

/** Whether fraction a/b is below c/d, compared exactly (an empty fraction is 1). */
function below(a: DerivedCounts, b: DerivedCounts, of: (counts: DerivedCounts) => number): boolean {
  const ratio = (counts: DerivedCounts) => {
    const denominator = counts.tp + of(counts);
    return denominator === 0 ? ([1n, 1n] as const) : ([BigInt(counts.tp), BigInt(denominator)] as const);
  };
  const [an, ad] = ratio(a);
  const [bn, bd] = ratio(b);
  return an * bd < bn * ad;
}

/**
 * The gate inside the PHI boundary: what is worse in the current run than in the earlier one, variant by
 * variant (the PR review's M3: the default and the ambiguous variant are two models, and a sum of both
 * would let one's gain hide the other's regression). Empty when nothing is. The runs must be on the same
 * examples (`examples_changed` otherwise: the same number of other examples is not the same run), and each
 * variant on the same examples (`examples_changed:<variant>`). For each variant compared, in total and per
 * field: precision or recall lower (`precision_regressed:<variant>:<field|all>`,
 * `recall_regressed:<variant>:<field|all>`), more values wrong but verified
 * (`wrong_verified_rose:<variant>:<field|all>`), more refused calls (`refused_rose:<variant>`); and an
 * earlier variant that did not measure its model (`earlier_unmeasured:<variant>`: a failed call or a call
 * refused for the run's setting, permittedOutcome), which is no run of that model to be compared with. An
 * earlier /1 report is refused whole (`earlier_report_format`). `variants` names the variants compared
 * (every variant by default).
 */
export function permittedRegressions(current: PermittedReport, earlier: EarlierPermittedReport, variants: readonly ContractVariant[] = CONTRACT_VARIANTS): string[] {
  if (earlier.format !== PERMITTED_REPORT_FORMAT) {
    return ['earlier_report_format'];
  }
  const problems: string[] = [];
  const ids = (list: readonly string[]) => JSON.stringify([...list].sort());
  if (ids(current.exampleIds) !== ids(earlier.exampleIds)) {
    problems.push('examples_changed');
  }
  for (const variant of variants) {
    const [now, then] = [current.variants[variant], earlier.variants[variant]];
    if (ids(now.exampleIds) !== ids(then.exampleIds)) {
      problems.push(`examples_changed:${variant}`);
    }
    if (unmeasuredProblems(earlier, [variant]).length > 0) {
      problems.push(`earlier_unmeasured:${variant}`);
    }
    const compare = (name: string, a: FieldTally, b: FieldTally) => {
      const [nowCounts, thenCounts] = [asCounts(a), asCounts(b)];
      if (below(nowCounts, thenCounts, (counts) => counts.fp)) {
        problems.push(`precision_regressed:${variant}:${name}`);
      }
      if (below(nowCounts, thenCounts, (counts) => counts.fn)) {
        problems.push(`recall_regressed:${variant}:${name}`);
      }
      if (wrongVerified(a) > wrongVerified(b)) {
        problems.push(`wrong_verified_rose:${variant}:${name}`);
      }
    };
    compare('all', now.total, then.total);
    for (const field of PERMITTED_FIELDS) {
      compare(field, now.fields[field], then.fields[field]);
    }
    if (now.refused > then.refused) {
      problems.push(`refused_rose:${variant}`);
    }
  }
  return problems;
}
