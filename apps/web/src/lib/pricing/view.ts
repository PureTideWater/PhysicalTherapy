import { pricingTraceSchema } from '@tp/pricing';

/**
 * How pricing results read on screen (PRD 7; PRD 8, The status machine; PRD 12, From validated to
 * actionable): a line's stage from the run that priced it, priced shares as percentages worked out in
 * integers (never a float on an amount), and a stored trace as the steps of PRD 11 in the engine's own
 * order, each with the rule records and the release it read. Pure: no database.
 */

/** What a line's latest complete run says about it. */
export interface LinePricingResult {
  readonly expectedAllowedCents: string | null;
  readonly varianceCents: string | null;
  readonly unpricedReason: string | null;
}

/**
 * The stage a run gives a line: unpriced with its reason, validated when priced with positive variance
 * (PRD 12: "A priced line with positive variance is validated"), and no stage when priced without a
 * shortfall (an overpayment is recorded and never pursued, PRC-15). Triage (milestone 6) moves lines on
 * from validated; null when no run priced the line.
 */
export function stageOf(result: LinePricingResult | null): 'unpriced' | 'validated' | null {
  if (result === null) {
    return null;
  }
  if (result.unpricedReason !== null) {
    return 'unpriced';
  }
  return BigInt(result.varianceCents ?? '0') > 0n ? 'validated' : null;
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
}

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

function titleOf(key: string): string {
  return TITLES[key] ?? key.replaceAll('_', ' ').replace(/^./, (first) => first.toUpperCase());
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

function step(key: string, value: unknown): TraceStepView {
  const absent = value === undefined || value === null || (Array.isArray(value) && value.length === 0);
  return { key, title: titleOf(key), recorded: absent ? null : JSON.stringify(value, null, 2), records: absent ? [] : recordsIn(value) };
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
