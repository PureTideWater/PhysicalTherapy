import { type LineWords, type Sentence, type StepKind, WORD_TABLES, wordsOf } from '@tp/packets/explain';
import { pricingTraceSchema } from '@tp/pricing';

import { labelOf } from '../copy/words';

/**
 * How pricing results read on screen (PRD 7; PRD 8, The status machine; PRD 12, From validated to
 * actionable): a line's stage from the run that priced it, priced shares as percentages worked out in
 * integers (never a float on an amount), and a stored trace as the steps of PRD 11 in the engine's own
 * order, each in words (@tp/packets/explain; docs/adr/0072) above the rule records and the release it
 * read, as the engine recorded them. Pure: no database.
 */

/** What a line's latest complete run says about it. */
export interface LinePricingResult {
  readonly expectedAllowedCents: string | null;
  readonly varianceCents: string | null;
  readonly unpricedReason: string | null;
}

/** The five line stages (PRD 8) and unpriced: what a status chip says. */
export type LineChipStatus = 'flagged' | 'validated' | 'actionable' | 'payer_approved' | 'recovered' | 'unpriced';

/**
 * A line's status chip (PRD 7, Claims and lines: "status chips for the five stages plus unpriced"; PRD
 * 8, The status machine): the stage it has reached (its latest stage event, which triage and the
 * ledger record), else unpriced when its pricing in effect left it unpriced, else none (priced and
 * not triaged into a stage, or paid at or above what it expects; an overpayment is never pursued,
 * PRC-15). Null as well when no run in effect priced the line.
 */
export function lineStatusOf(stage: string | null, result: LinePricingResult | null): LineChipStatus | null {
  if (stage === 'flagged' || stage === 'validated' || stage === 'actionable' || stage === 'payer_approved' || stage === 'recovered') {
    return stage;
  }
  return result !== null && result.unpricedReason !== null ? 'unpriced' : null;
}

/** A share as a percentage to one decimal place, from integer counts or cents (text or bigint); "0%" of nothing. */
export function shareOf(part: bigint | number | string, whole: bigint | number | string): string {
  const total = BigInt(whole);
  if (total === 0n) {
    return '0%';
  }
  const tenths = (BigInt(part) * 1000n + total / 2n) / total;
  return `${(tenths / 10n).toString()}.${(tenths % 10n).toString()}%`;
}

/** A rule record a step read, by type, key, window and SHA-256. */
export interface TraceRecord {
  readonly recordType: string;
  readonly key: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly sha256: string;
}

export interface TraceStepView {
  /** The trace's own name for the step. */
  readonly key: string;
  readonly title: string;
  /** What the trace recorded for it, as JSON text; null when the line did not reach the step. */
  readonly recorded: string | null;
  /** The rule records the step names, in the order they appear in it. */
  readonly records: readonly TraceRecord[];
  /** A note on how to read what the engine recorded (its names for a date), or null. */
  readonly note: string | null;
}

/**
 * The engine's trace names the payment date (BPR16, the check's issue date or the EFT's effective date) remittance_date,
 * in the claim facts and as the dispute window's start (packages/pricing, frozen until PR 6c). The founder ruled on
 * 2026-10-20 that "the remittance date" is the remittance advice's own date, so the trace's name is read for the reader
 * beside the step that records it (docs/adr/0061, Owner rulings (2026-10-20)).
 */
export const TRACE_REMITTANCE_DATE_NOTE =
  'The engine’s record names this date remittance_date: it is the payment date (BPR16, the check’s issue date or the EFT’s effective date), not the remittance advice’s own date.';

const TITLES: Readonly<Record<string, string>> = {
  release: 'Rule release and engine',
  as_of: 'Triage date',
  settings: 'Practice settings',
  claim: 'Claim facts',
  line: 'Line facts',
  agreement: 'Step 1: the agreement',
  terms: 'Step 2: the terms and method',
  fee_schedule: 'Step 2: the fee schedule',
  units: 'Step 3: units',
  adjustments: 'Step 4: adjustments',
  patient_share_cents: 'Step 5: patient share',
  rounding: 'Step 6: rounding',
  variance_cents: 'Step 7: variance',
  window: 'Step 8: the dispute window',
  outcome: 'Outcome',
};

/** A part's title: its own, else its key as a label, initialisms in capitals ("ncci_ptp" is "NCCI PTP"; lib/copy/words.ts). */
function titleOf(key: string): string {
  return TITLES[key] ?? labelOf(key);
}

function isRecordRef(value: unknown): value is { record_type: string; key: Record<string, unknown>; effective_from: string; effective_to: string | null; sha256: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.record_type === 'string' && typeof candidate.sha256 === 'string' && typeof candidate.effective_from === 'string' && typeof candidate.key === 'object';
}

function recordsIn(value: unknown, found: TraceRecord[] = []): TraceRecord[] {
  if (isRecordRef(value)) {
    found.push({ recordType: value.record_type, key: JSON.stringify(value.key), effectiveFrom: value.effective_from, effectiveTo: value.effective_to, sha256: value.sha256 });
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      recordsIn(item, found);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) {
      recordsIn(item, found);
    }
  }
  return found;
}

/** The trace's top-level parts and its steps, in the order the engine's trace schema defines them. */
export function traceOrder(): { readonly parts: readonly string[]; readonly steps: readonly string[] } {
  const parts = Object.keys(pricingTraceSchema.shape).filter((key) => key !== 'format' && key !== 'engine');
  const steps = Object.keys(pricingTraceSchema.shape.steps.shape);
  return { parts, steps };
}

/** Whether a recorded part names the engine's remittance_date (a key, or the window's measured_from value). */
function namesRemittanceDate(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(namesRemittanceDate);
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.entries(value).some(([key, item]) => key === 'remittance_date' || item === 'remittance_date' || namesRemittanceDate(item));
}

function step(key: string, value: unknown): TraceStepView {
  const absent = value === undefined || value === null || (Array.isArray(value) && value.length === 0);
  return {
    key,
    title: titleOf(key),
    recorded: absent ? null : JSON.stringify(value, null, 2),
    records: absent ? [] : recordsIn(value),
    note: !absent && namesRemittanceDate(value) ? TRACE_REMITTANCE_DATE_NOTE : null,
  };
}

/**
 * A stored trace as the steps to show, in order: the release and engine, the triage date, the
 * settings and facts it priced, the agreement, the terms, each step of PRD 11 as the engine recorded it
 * (a step the line never reached shows as not reached), and the outcome. A trace of another shape (a
 * format this screen does not know) shows its parts as stored, in the order they come.
 */
export function traceSteps(trace: unknown): TraceStepView[] {
  if (typeof trace !== 'object' || trace === null) {
    return [];
  }
  const stored = trace as Record<string, unknown>;
  const { parts, steps } = traceOrder();
  const known = new Set([...parts, 'format', 'engine']);
  const views: TraceStepView[] = [];
  for (const key of parts) {
    if (key === 'release') {
      views.push(step('release', { ...(stored.release as object), engine: stored.engine, format: stored.format }));
    } else if (key === 'steps') {
      const recorded = (stored.steps ?? {}) as Record<string, unknown>;
      const stepKeys = [...steps, ...Object.keys(recorded).filter((name) => !steps.includes(name))];
      views.push(...stepKeys.map((name) => step(name, recorded[name])));
    } else {
      views.push(step(key, stored[key]));
    }
  }
  views.push(...Object.keys(stored).filter((key) => !known.has(key)).map((key) => step(key, stored[key])));
  return views;
}

/**
 * The part of the trace each step's words are of, so the words sit under the step's own title: the four adjustments
 * under "Step 4: adjustments", the observed allowed under "Step 7: variance".
 */
export const WORD_STEP_PART: Readonly<Record<StepKind, string>> = {
  agreement: 'agreement',
  terms: 'terms',
  fee_schedule: 'fee_schedule',
  units: 'units',
  per_visit: 'per_visit',
  ncci_ptp: 'ncci_ptp',
  mppr: 'adjustments',
  assistant_reduction: 'adjustments',
  sequestration: 'adjustments',
  contract_adjustment: 'adjustments',
  patient_share: 'patient_share_cents',
  rounding: 'rounding',
  observed: 'variance_cents',
  window: 'window',
  release: 'release',
  outcome: 'outcome',
};

/** One step of the line trace page: its title, its sentences, and, for roles that read PHI, what the engine recorded. */
export interface LineTraceStep {
  readonly key: string;
  readonly title: string;
  readonly sentences: readonly Sentence[];
  /** The step as the engine recorded it (its rule records and JSON), for roles that read PHI; null for the others. */
  readonly recorded: TraceStepView | null;
}

/**
 * The line trace page's steps (design 3.9): each step's words under its title, in the engine's order. For roles that
 * read PHI (`recorded`, from traceSteps) every part of the trace is a step, its words above what the engine recorded
 * (a part with no words, such as the claim facts, shows its record only). For the others (no record) only the steps
 * the words speak to, so a viewer reads the sentences and never the record.
 */
export function lineTraceSteps(words: LineWords | null, recorded: readonly TraceStepView[]): LineTraceStep[] {
  const sentencesOf = (key: string) => (words?.steps ?? []).filter((step) => WORD_STEP_PART[step.step] === key).flatMap((step) => step.sentences);
  if (recorded.length !== 0) {
    return recorded.map((view) => ({ key: view.key, title: view.title, sentences: sentencesOf(view.key), recorded: view }));
  }
  const { parts, steps } = traceOrder();
  return parts
    .flatMap((key) => (key === 'steps' ? steps : [key]))
    .map((key) => ({ key, title: titleOf(key), sentences: sentencesOf(key), recorded: null }))
    .filter((step) => step.sentences.length !== 0);
}

/** The Pricing card's method and adjustments in words, never their codes (design 3.9). */
export interface PricingWords {
  readonly method: string | null;
  readonly adjustments: readonly { readonly name: string; readonly words: string; readonly beforeCents: string; readonly afterCents: string }[];
}

/**
 * A priced line's method ("Percent of Medicare") and adjustments ("The multiple procedure payment reduction") in the
 * calculation's own words; a code they have none for throws ExplainWordsError, which the page shows as a refusal.
 */
export function pricingWords(pricing: {
  readonly method: string | null;
  readonly adjustmentsApplied: readonly { readonly name: string; readonly before_cents: string; readonly after_cents: string }[];
}): PricingWords {
  return {
    method: pricing.method === null ? null : wordsOf(WORD_TABLES.METHOD_TEXT, pricing.method, 'method'),
    adjustments: pricing.adjustmentsApplied.map((item) => {
      const words = wordsOf(WORD_TABLES.ADJUSTMENT_TEXT, item.name, 'adjustment');
      return { name: item.name, words: `${words.charAt(0).toUpperCase()}${words.slice(1)}`, beforeCents: item.before_cents, afterCents: item.after_cents };
    }),
  };
}
