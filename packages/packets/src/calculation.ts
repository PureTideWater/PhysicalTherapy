import { createHash } from 'node:crypto';

import type { PricingTrace } from '@tp/pricing';

import type { CalculationStep, LineCalculation } from './format';
import { canonicalJson } from './hash';

/**
 * A line's calculation summary for tp-packet/2 (CO-05: "the calculation trace per line"), copied from
 * the line's stored trace (priced_line.trace) and never computed again: the engine computed every
 * amount, and recompute(trace) holds it to them (PRC-16). The steps are the trace's own intermediate
 * amounts in the order they applied: the amount per unit (per visit), the schedule for the units
 * billed, the line charge a lesser-of term compares, the base, then each adjustment's amount after it;
 * then the one rounding with its unrounded amount beside the rounded one. Cents are decimal text as the
 * trace writes them (whole where whole). The trace's SHA-256 is over its canonical JSON (keys sorted),
 * so anyone holding the stored trace can check the summary was copied from it.
 */

export class CalculationError extends Error {
  override readonly name = 'CalculationError';
}

/** The SHA-256 of a stored trace's canonical JSON. */
export function traceSha256(trace: unknown): string {
  return createHash('sha256').update(canonicalJson(trace), 'utf8').digest('hex');
}

/** The calculation summary of a priced line's trace; a trace that priced nothing has none. */
export function lineCalculation(trace: PricingTrace): LineCalculation {
  if (trace.outcome.result !== 'priced' || trace.terms === null || trace.steps.rounding === null) {
    throw new CalculationError('only a priced line has a calculation to summarize');
  }
  const { units, per_visit: perVisit, adjustments, rounding } = trace.steps;
  const steps: CalculationStep[] = [];
  const add = (step: string, amount: string | null | undefined) => {
    if (amount !== null && amount !== undefined) {
      steps.push({ step, amount_cents: amount });
    }
  };
  if (units !== null) {
    add(perVisit === null ? 'unit' : 'visit', units.unit_cents);
    add('schedule', units.schedule_cents);
    add('charge', units.charge_cents);
  }
  add('base', perVisit?.base_cents ?? units?.base_cents ?? null);
  for (const adjustment of adjustments) {
    add(adjustment.name, adjustment.after_cents);
  }
  return {
    method: trace.agreement?.outcome === 'MA_NONCONTRACTED' ? 'MA_NONCONTRACTED' : trace.terms.method,
    release_no: trace.release.number,
    steps,
    rounding: { rule: rounding.rule, unrounded_cents: rounding.unrounded_cents, rounded_cents: rounding.rounded_cents },
    observed_basis: trace.line.observed_allowed_basis,
    patient_share_cents: trace.steps.patient_share_cents,
    trace_sha256: traceSha256(trace),
  };
}
