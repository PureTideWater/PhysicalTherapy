import { centsToString, decimal } from '@tp/money';
import { readableText, scanText } from '@tp/packets';
import { TRUTH_FIELDS, type ContractTruth, type RequiredFact, type TruthField, type TruthFieldValue, type TruthRecord } from '@tp/synth';

import { normalized, readAmount, readDate, readPercent, readYear } from '../src/figures';
import type { ContractTermsCandidate, ContractTermsOutput, ContractTermsProposal } from '../src/functions/contract-terms';
import type { NarrativeProposal } from '../src/functions/narrative';

/**
 * Scoring the gateway's answers on the synthetic sets (PRD 14: "the gate for a prompt or model change
 * is field-level precision and recall on that set with no regression"; "any verifier failure on the
 * 300-case synthetic set blocks the change"; docs/adr/0050). Counts only, and whole numbers: a
 * precision is compared as the fraction it is, never as a float.
 *
 * Contracts, field by field. A field the answer states is right (a true positive) when the gateway's
 * verifier passed it (its quote is on its cited page and its written value is in the quote, readable
 * by code) and the value code reads from it is the true value. A stated field that is not right is a
 * false positive, and the true field it should have been is also a false negative; a true field the
 * answer leaves out is a false negative; a stated field no true record has is a false positive. Each
 * true record is paired with the proposed candidate that gets most of its fields right (a record no
 * candidate gets any field of right is missed whole, and a candidate paired with no record is wrong
 * whole). Values are compared as code reads them: cents, plain decimals, ISO dates, and codes,
 * modifiers and places as sets.
 */

export interface Counts {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
}

export type FieldCounts = Readonly<Record<TruthField, Counts>>;

export const ZERO: Counts = { tp: 0, fp: 0, fn: 0 };

export function add(a: Counts, b: Counts): Counts {
  return { tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn };
}

export function emptyFieldCounts(): Record<TruthField, Counts> {
  return Object.fromEntries(TRUTH_FIELDS.map((field) => [field, ZERO])) as Record<TruthField, Counts>;
}

export function total(fields: FieldCounts): Counts {
  return TRUTH_FIELDS.reduce((sum, field) => add(sum, fields[field]), ZERO);
}

/** Precision as a fraction [numerator, denominator]; an answer that states nothing has nothing wrong (1/1). */
export function precision(counts: Counts): readonly [number, number] {
  return counts.tp + counts.fp === 0 ? [1, 1] : [counts.tp, counts.tp + counts.fp];
}

/** Recall as a fraction; a set with nothing to find has found it all (1/1). */
export function recall(counts: Counts): readonly [number, number] {
  return counts.tp + counts.fn === 0 ? [1, 1] : [counts.tp, counts.tp + counts.fn];
}

/** Whether fraction a is below fraction b, compared exactly. */
export function below(a: readonly [number, number], b: readonly [number, number]): boolean {
  return BigInt(a[0]) * BigInt(b[1]) < BigInt(b[0]) * BigInt(a[1]);
}

/** A fraction as six-decimal text for a report, by integer division (never a float). */
export function ratioText(fraction: readonly [number, number]): string {
  const [numerator, denominator] = fraction;
  const scaled = (BigInt(numerator) * 1_000_000n + BigInt(denominator) / 2n) / BigInt(denominator);
  return `${String(scaled / 1_000_000n)}.${String(scaled % 1_000_000n).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------------------------------
// Contracts

const setKey = (items: readonly string[]) => [...new Set(items.map((item) => normalized(item).toUpperCase()))].sort().join(' ');
const canonicalPercent = (text: string | null) => (text === null ? null : decimal(text).toString());

/** A true field's value as one comparable string. */
export function truthKey(field: TruthField, value: TruthFieldValue): string {
  const raw = value.value;
  if (field === 'codes' || field === 'modifiers' || field === 'places_of_service') {
    return setKey(raw as readonly string[]);
  }
  if (field === 'percentage') {
    return canonicalPercent(raw as string) ?? '';
  }
  if (field === 'flags') {
    const flags = raw as unknown as Readonly<Record<string, unknown>>;
    return JSON.stringify(['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci', 'timed_units_rule'].map((key) => flags[key]));
  }
  return raw as string;
}

/** What a proposed candidate states, field by field, as code reads it (null where code cannot read it). */
export function proposedKeys(candidate: ContractTermsCandidate): Partial<Record<TruthField, string | null>> {
  const keys: Partial<Record<TruthField, string | null>> = { method: candidate.method.value };
  const lists = ['codes', 'modifiers', 'places_of_service'] as const;
  for (const field of lists) {
    const value = candidate[field];
    if (value !== null) {
      keys[field] = setKey(value.written);
    }
  }
  if (candidate.amount !== null) {
    const amount = readAmount(candidate.amount.written);
    keys.amount = amount === null ? null : centsToString(amount);
  }
  if (candidate.percentage !== null) {
    keys.percentage = canonicalPercent(readPercent(candidate.percentage.written));
  }
  if (candidate.fee_schedule_year !== null) {
    const year = readYear(candidate.fee_schedule_year.written);
    keys.fee_schedule_year = year === null ? null : String(year);
  }
  if (candidate.lesser_of_schedule !== null) {
    keys.lesser_of_schedule = candidate.lesser_of_schedule;
  }
  if (candidate.flags !== null) {
    const { flags } = candidate;
    keys.flags = JSON.stringify([flags.apply_mppr, flags.apply_assistant_reduction, flags.apply_sequestration, flags.apply_ncci, flags.timed_units_rule]);
  }
  if (candidate.rounding !== null) {
    keys.rounding = candidate.rounding.value;
  }
  if (candidate.effective_from !== null) {
    keys.effective_from = readDate(candidate.effective_from.written);
  }
  if (candidate.effective_to !== null) {
    keys.effective_to = readDate(candidate.effective_to.written);
  }
  return keys;
}

/** The fields of a candidate the verifier passed (the uncited lesser-of schedule has nothing to verify). */
function verifiedFields(review: ContractTermsProposal['candidates'][number] | undefined): ReadonlySet<TruthField> {
  const fields = new Set<TruthField>(['lesser_of_schedule']);
  for (const field of review?.fields ?? []) {
    if (field.verified) {
      fields.add(field.field);
    }
  }
  return fields;
}

interface Stated {
  readonly keys: Partial<Record<TruthField, string | null>>;
  readonly verified: ReadonlySet<TruthField>;
}

function right(stated: Stated, field: TruthField, truth: string): boolean {
  return stated.verified.has(field) && stated.keys[field] === truth;
}

function agreement(record: TruthRecord, stated: Stated): number {
  return TRUTH_FIELDS.filter((field) => {
    const value = record.fields[field];
    return value !== undefined && right(stated, field, truthKey(field, value));
  }).length;
}

export interface ContractScore {
  readonly fields: FieldCounts;
  /** Fields whose quote was not on the cited page (MOD-01 holds this at zero for the reference answers). */
  readonly quotesOffPage: number;
  /** Candidates the verifier flagged as conflicting with another. */
  readonly conflicts: number;
}

/** Scores one document's answer: the model's output as it parsed (null when it did not), and the gateway's proposal from it. */
export function scoreContract(truth: ContractTruth, output: ContractTermsOutput | null, proposal: ContractTermsProposal | null): ContractScore {
  const counts = emptyFieldCounts();
  const bump = (field: TruthField, key: keyof Counts) => {
    counts[field] = { ...counts[field], [key]: counts[field][key] + 1 };
  };
  const stated: Stated[] = (output?.candidates ?? []).map((candidate, index) => ({ keys: proposedKeys(candidate), verified: verifiedFields(proposal?.candidates[index]) }));
  const unmatched = new Set(stated.keys());
  for (const record of truth.records) {
    let best: number | null = null;
    let bestAgreement = 0;
    for (const index of unmatched) {
      const agreed = agreement(record, stated[index] as Stated);
      if (agreed > bestAgreement) {
        best = index;
        bestAgreement = agreed;
      }
    }
    const pair = best === null ? undefined : stated[best];
    if (best !== null) {
      unmatched.delete(best);
    }
    for (const field of TRUTH_FIELDS) {
      const value = record.fields[field];
      const says = pair !== undefined && field in pair.keys;
      if (value === undefined) {
        if (says) {
          bump(field, 'fp');
        }
      } else if (pair !== undefined && right(pair, field, truthKey(field, value))) {
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
    for (const field of Object.keys((stated[index] as Stated).keys) as TruthField[]) {
      bump(field, 'fp');
    }
  }
  const reviews = proposal?.candidates ?? [];
  return {
    fields: counts,
    quotesOffPage: reviews.flatMap((review) => review.fields).filter((field) => field.problems.includes('quote_not_on_page') || field.problems.includes('page_missing')).length,
    conflicts: reviews.filter((review) => review.conflictsWith.length > 0).length,
  };
}

/** A document the answer gave nothing for (a failed call, an answer off the schema): every true field missed. */
export function missedContract(truth: ContractTruth): ContractScore {
  return scoreContract(truth, null, null);
}

// ---------------------------------------------------------------------------------------------------
// Narratives

export const NARRATIVE_PROBLEMS = ['call_failed', 'invalid_output', 'verifier_failed', 'fact_missing'] as const;
export type NarrativeProblem = (typeof NARRATIVE_PROBLEMS)[number];

export interface NarrativeCheck {
  readonly problems: readonly NarrativeProblem[];
  /** The verifier's mismatch codes (never the narrative's text). */
  readonly mismatches: readonly string[];
  /** The required facts the narrative does not state. */
  readonly missing: readonly RequiredFact[];
}

/** Whether the narrative states each required fact, as the verifier's own scanner reads it. */
export function missingFacts(narrative: string, required: readonly RequiredFact[]): RequiredFact[] {
  const scan = scanText(readableText(narrative).text);
  const markers = new Set(scan.markers.flatMap((marker) => marker.sources.map(String)));
  return required.filter((fact) => {
    if (fact.kind === 'marker') {
      return !markers.has(fact.value);
    }
    const wanted = fact.kind === 'amount' ? fact.value : decimal(fact.value).toString();
    return !scan.figures.some((figure) => figure.kind === fact.kind && figure.value === wanted);
  });
}

/** One narrative case's check: the gateway's proposal (its verifier report), or the failure that left none. */
export function checkNarrative(required: readonly RequiredFact[], proposal: NarrativeProposal | null, failure: 'call_failed' | 'invalid_output' | null): NarrativeCheck {
  if (failure !== null || proposal === null) {
    return { problems: [failure ?? 'invalid_output'], mismatches: [], missing: [] };
  }
  const problems: NarrativeProblem[] = [];
  if (!proposal.report.passed) {
    problems.push('verifier_failed');
  }
  const missing = missingFacts(proposal.narrative, required);
  if (missing.length > 0) {
    problems.push('fact_missing');
  }
  return { problems, mismatches: [...new Set(proposal.report.mismatches.map((mismatch) => mismatch.code))].sort(), missing };
}
