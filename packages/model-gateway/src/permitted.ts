import { addDays } from '@tp/contracts';
import { canonicalNumber } from '@tp/packets';
import { z } from 'zod';

import { normalized, readAmount, readDate, readPercent, readYear } from './figures';
import type { CandidateReview, ContractTermsProposal } from './functions/contract-terms';
import { PROMPTS } from './prompts';
import type { ProviderKind } from './provider';

/**
 * The evaluation on permitted real examples, inside the PHI boundary (PRD 14, Logging and evaluation:
 * "The evaluation set starts with 40 synthetic contracts ... and grows with permitted real ones; the
 * gate for a prompt or model change is field-level precision and recall on that set with no regression,
 * run in CI on the synthetic subset and in the PHI boundary on the rest"; docs/adr/0054).
 *
 * A permitted example (eval_example, source permitted) is a specialist's correction of a contract
 * proposal, kept under the practice's signed data-rights agreement: the document the call read, and the
 * version's final rate records as the specialist approved them (format tp-eval-correction/1). The run
 * (the worker's evaluate-permitted task, in production, in each practice's own scope) proposes the
 * document's terms again with the current prompt and model and scores the proposal against the final
 * records, field by field, as the synthetic gate scores a document against its truth: a field the
 * proposal states is right when the gateway's verifier passed it and the value code reads from it is the
 * final record's; a wrong one is a false positive and the final field a false negative; a final field
 * left out is a false negative. Each final record pairs with the candidate that gets most of its fields
 * right.
 *
 * Scored fields are the ones a contract writes and the specialist's record keeps as written: the method,
 * codes, modifiers, places of service, amount, percentage, fee-schedule year, the lesser-of schedule and
 * the effective dates. Flags and rounding are left out: a final record holds them whether the contract
 * stated them or the specialist confirmed a default, so they cannot be told apart. Reports hold counts,
 * codes and example IDs only, never a document's text or a figure.
 */

export const CORRECTION_FORMAT = 'tp-eval-correction/1';

export const PERMITTED_FIELDS = ['method', 'codes', 'modifiers', 'places_of_service', 'amount', 'percentage', 'fee_schedule_year', 'lesser_of_schedule', 'effective_from', 'effective_to'] as const;
export type PermittedField = (typeof PERMITTED_FIELDS)[number];

export interface FieldCounts {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
}

const ZERO: FieldCounts = { tp: 0, fp: 0, fn: 0 };

const record = z.object({ scope: z.record(z.string(), z.unknown()), method: z.string(), parameters: z.record(z.string(), z.unknown()) });

/** The correction a permitted example's expected holds (contract proposals' review writes it). */
export const correctionSchema = z.object({ format: z.literal(CORRECTION_FORMAT), document_id: z.uuid(), records: z.array(record) });
export type Correction = z.output<typeof correctionSchema>;

type Keys = Partial<Record<PermittedField, string>>;

const setKey = (items: readonly string[]) => [...new Set(items.map((item) => normalized(item).toUpperCase()))].sort().join(' ');
const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const object = (value: unknown): Readonly<Record<string, unknown>> | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** A final record's fields as comparable keys: the terms as the specialist approved them. */
export function finalKeys(final: Correction['records'][number]): Keys {
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

interface Stated {
  readonly keys: Partial<Record<PermittedField, string | null>>;
  readonly verified: ReadonlySet<PermittedField>;
}

/** What a reviewed candidate states, field by field, as code reads it, and which of its fields verified. */
export function statedKeys(candidate: CandidateReview): Stated {
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
  return { keys, verified };
}

const right = (stated: Stated, field: PermittedField, value: string) => stated.verified.has(field) && stated.keys[field] === value;

/** One example's field counts: the proposal (null when the call proposed nothing) against the final records. */
export function scorePermitted(correction: Correction, proposal: ContractTermsProposal | null): Record<PermittedField, FieldCounts> {
  const counts = Object.fromEntries(PERMITTED_FIELDS.map((field) => [field, ZERO])) as Record<PermittedField, FieldCounts>;
  const bump = (field: PermittedField, key: keyof FieldCounts) => {
    counts[field] = { ...counts[field], [key]: counts[field][key] + 1 };
  };
  const stated = (proposal?.candidates ?? []).map(statedKeys);
  const unmatched = new Set(stated.keys());
  for (const final of correction.records) {
    const truth = finalKeys(final);
    let best: number | null = null;
    let bestAgreement = 0;
    for (const index of unmatched) {
      const candidate = stated[index] as Stated;
      const agreed = PERMITTED_FIELDS.filter((field) => truth[field] !== undefined && right(candidate, field, truth[field] ?? '')).length;
      if (agreed > bestAgreement) {
        best = index;
        bestAgreement = agreed;
      }
    }
    const pair = best === null ? undefined : stated[best];
    if (best !== null) {
      unmatched.delete(best);
    }
    for (const field of PERMITTED_FIELDS) {
      const value = truth[field];
      const says = pair !== undefined && field in pair.keys;
      if (value === undefined) {
        if (says) {
          bump(field, 'fp');
        }
      } else if (pair !== undefined && right(pair, field, value)) {
        bump(field, 'tp');
      } else {
        bump(field, 'fn');
        if (says) {
          bump(field, 'fp');
        }
      }
    }
  }
  for (const index of unmatched) {
    for (const field of Object.keys((stated[index] as Stated).keys) as PermittedField[]) {
      bump(field, 'fp');
    }
  }
  return counts;
}

export const PERMITTED_REPORT_FORMAT = 'tp-model-eval-permitted/1';

/** A run's report: counts, codes and example IDs only. */
export interface PermittedReport {
  readonly format: typeof PERMITTED_REPORT_FORMAT;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly provider: string;
  /** The models the prompt version pins for the provider (an ambiguous contract's is the larger). */
  readonly modelIds: readonly string[];
  readonly practices: number;
  readonly examples: number;
  readonly fields: Readonly<Record<PermittedField, FieldCounts>>;
  readonly total: FieldCounts;
  /** Examples that proposed nothing, and why, as codes (scored as proposing nothing, so the gate cannot pass them silently). */
  readonly problems: readonly { readonly exampleId: string; readonly problem: string }[];
}

export function addCounts(a: FieldCounts, b: FieldCounts): FieldCounts {
  return { tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn };
}

/** One example's outcome: its counts, and the problem code when the call proposed nothing. */
export interface PermittedResult {
  readonly exampleId: string;
  readonly counts: Readonly<Record<PermittedField, FieldCounts>>;
  readonly problem: string | null;
}

/** The run's report from its examples' results, for the current prompt version and the provider's pinned models. */
export function permittedReport(provider: ProviderKind, practices: number, results: readonly PermittedResult[]): PermittedReport {
  const prompt = PROMPTS.proposeContractTerms;
  const fields = Object.fromEntries(PERMITTED_FIELDS.map((field) => [field, results.reduce((sum, result) => addCounts(sum, result.counts[field]), ZERO)])) as Record<PermittedField, FieldCounts>;
  return {
    format: PERMITTED_REPORT_FORMAT,
    promptVersion: prompt.id,
    promptSha256: prompt.sha256,
    provider,
    modelIds: [...new Set(Object.values(prompt.models[provider]))].sort(),
    practices,
    examples: results.length,
    fields,
    total: PERMITTED_FIELDS.reduce((sum, field) => addCounts(sum, fields[field]), ZERO),
    problems: results.flatMap((result) => (result.problem === null ? [] : [{ exampleId: result.exampleId, problem: result.problem }])),
  };
}

const counts = z.strictObject({ tp: z.number().int().nonnegative(), fp: z.number().int().nonnegative(), fn: z.number().int().nonnegative() });

/** A report as a run wrote it (the earlier run a gate compares against). */
export const permittedReportSchema = z.strictObject({
  format: z.literal(PERMITTED_REPORT_FORMAT),
  promptVersion: z.string(),
  promptSha256: z.string(),
  provider: z.string(),
  modelIds: z.array(z.string()),
  practices: z.number().int().nonnegative(),
  examples: z.number().int().nonnegative(),
  fields: z.strictObject(Object.fromEntries(PERMITTED_FIELDS.map((field) => [field, counts])) as Record<PermittedField, typeof counts>),
  total: counts,
  problems: z.array(z.strictObject({ exampleId: z.string(), problem: z.string() })),
});

/** Whether fraction a/b is below c/d, compared exactly (an empty fraction is 1). */
function below(a: FieldCounts, b: FieldCounts, of: (counts: FieldCounts) => number): boolean {
  const ratio = (counts: FieldCounts) => {
    const denominator = counts.tp + of(counts);
    return denominator === 0 ? ([1n, 1n] as const) : ([BigInt(counts.tp), BigInt(denominator)] as const);
  };
  const [an, ad] = ratio(a);
  const [bn, bd] = ratio(b);
  return an * bd < bn * ad;
}

/**
 * The gate inside the PHI boundary: the fields (and the total) whose precision or recall is lower in
 * the current run than in the earlier one, on the same examples. Empty when there is no regression.
 */
export function permittedRegressions(current: PermittedReport, earlier: PermittedReport): string[] {
  const problems: string[] = [];
  if (current.examples !== earlier.examples) {
    problems.push('examples_changed');
  }
  const compare = (name: string, now: FieldCounts, then: FieldCounts) => {
    if (below(now, then, (counts) => counts.fp)) {
      problems.push(`precision_regressed:${name}`);
    }
    if (below(now, then, (counts) => counts.fn)) {
      problems.push(`recall_regressed:${name}`);
    }
  };
  compare('all', current.total, earlier.total);
  for (const field of PERMITTED_FIELDS) {
    compare(field, current.fields[field], earlier.fields[field]);
  }
  return problems;
}
