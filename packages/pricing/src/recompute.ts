import {
  type Cents,
  DEFAULT_ROUNDING,
  type Decimal,
  ROUNDING_RULES,
  type RoundingRule,
  type UnroundedCents,
  decimal,
  parseCents,
  roundToCents,
  subtractCents,
  sumCents,
  unroundedCents,
} from '@tp/money';

import type { UnpricedReason } from './reasons';
import { type PricingTrace, type TraceAdjustment, type TraceContractAdjustment, type TraceTerms, type TraceUnits, parseTrace } from './trace';

/**
 * Recomputes a line's expected amount from its trace alone (PRD 11 step 9: "The trace is enough to
 * recompute the amount without the database, and a test does exactly that"). Written apart from the
 * engine: it imports nothing of `price`, reads only what the trace recorded (the line facts, the
 * terms, the rule values with their record identities, the day's ranking of the multiple procedure
 * reduction) and works the amount out again, its own way:
 *
 * - per unit, for a fee schedule (a percentage of Medicare, or a lesser-of term's percent schedule) each
 *   part is RVU x GPCI x the conversion factor x the percentage (dollars per RVU at a percentage are
 *   cents per RVU), with the practice-expense value of the recorded setting; for a fixed schedule or a
 *   per-visit term, the terms' amount;
 * - the base is the unit amount times the units as billed; for a lesser-of term the smaller of that and
 *   the line's charge; for a per-visit term the visit amount when the line is the lowest-numbered of
 *   its recorded visit, else zero;
 * - the procedure-to-procedure edits recorded are judged again (indicator 1 and a 59 or X modifier on
 *   either line bypass one) and give the review flags;
 * - the multiple procedure reduction re-sorts the recorded ranking itself and cuts every unit of the
 *   line but the day's first by its practice-expense part times the recorded percentage;
 * - the assistant percentage applies when CQ or CO is among the line's modifiers;
 * - sequestration takes its percentage of the amount less the patient share (the sum of the line's PR
 *   adjustments), floored at zero, unless suspended;
 * - the terms' own adjustment pays its percentage of the amount, or holds it to its cap;
 * - the reasons the recorded facts show (the agreement's stop, an unsupported method, a missing
 *   relative value, units above the recorded medically unlikely edit, a timed-units rule of UNKNOWN, a
 *   secondary or reversed claim) are derived again; the rest round once under the rule of the terms,
 *   else the practice, else the engine default;
 * - the fee-schedule step is held to the terms and facts it was computed for: its percentage, year
 *   basis and conversion factor are the terms', its setting the practice's for the line's place of
 *   service, its basis year the service date's (CURRENT) or the locked year, and each rule record it
 *   names has the key the line looks up and a window that covers the service date (CURRENT) or the
 *   basis year (LOCKED); the locality's record is the practice ZIP's, in force on the service date.
 *
 * It returns what it computed and every difference from what the trace recorded. A trace that cannot
 * be recomputed (malformed, or priced without a step its amount needs) raises TraceRecomputeError.
 */

export class TraceRecomputeError extends Error {
  override readonly name = 'TraceRecomputeError';
}

export interface RecomputedAdjustment {
  readonly name: TraceAdjustment['name'];
  readonly beforeCents: UnroundedCents;
  readonly afterCents: UnroundedCents;
}

/** A review flag as the trace records it. */
export interface RecomputedFlag {
  readonly flag: 'NCCI_PTP';
  readonly column1LineNo: number;
}

export type Recomputed =
  | {
      readonly outcome: 'priced';
      readonly expectedAllowedCents: Cents;
      readonly expectedUnroundedCents: UnroundedCents;
      readonly rounding: RoundingRule;
      readonly baseCents: UnroundedCents;
      readonly adjustments: readonly RecomputedAdjustment[];
      readonly reviewFlags: readonly RecomputedFlag[];
      readonly patientShareCents: Cents;
      readonly varianceCents: Cents;
      /** Where the trace's recorded intermediate amounts disagree with this recomputation. */
      readonly differences: readonly string[];
    }
  | { readonly outcome: 'unpriced'; readonly reason: UnpricedReason; readonly differences: readonly string[] };

const HUNDREDTH = decimal('0.01');

/** The flagged Medicare adjustments of step 4, before the terms' own. */
type MedicareAdjustment = Exclude<TraceAdjustment, TraceContractAdjustment>;
const NOTHING = decimal(0n);
const LOCKED = /^LOCKED:(\d{4})$/;

/** The stops the resolver gives, which the trace's agreement outcome names. */
const AGREEMENT_STOPS: Readonly<Record<string, UnpricedReason>> = {
  NO_MAPPING: 'NO_MAPPING',
  NO_AGREEMENT: 'NO_AGREEMENT',
  DATE_OUTSIDE_VERSIONS: 'DATE_OUTSIDE_VERSIONS',
  NO_RATE_FOR_CODE: 'NO_RATE_FOR_CODE',
  AMBIGUOUS_RATE: 'AMBIGUOUS_RATE',
  RESOLUTION_FAILED: 'ENGINE_ERROR',
};

class Comparison {
  readonly differences: string[] = [];

  amount(label: string, recorded: string, computed: Decimal): void {
    if (!decimal(recorded).equals(computed)) {
      this.differences.push(`${label}: the trace records ${recorded}, the recomputation gives ${computed.toString()}`);
    }
  }

  same(label: string, recorded: string, computed: string): void {
    if (recorded !== computed) {
      this.differences.push(`${label}: the trace records ${recorded}, the recomputation gives ${computed}`);
    }
  }
}

/** Recomputes the trace's line. Accepts a stored trace as read back from JSON. */
export function recompute(value: unknown): Recomputed {
  const trace = pricingTrace(value);
  const check = new Comparison();
  const recordedReason = trace.outcome.result === 'unpriced' ? trace.outcome.reason : null;
  const derived = derivedStop(trace);
  if (derived !== null) {
    return unpriced(recordedReason, derived, check);
  }
  const { terms } = trace;
  const unitsStep = trace.steps.units;
  if (terms === null || unitsStep === null) {
    // The line stopped with ENGINE_ERROR before it had an amount: nothing to recompute.
    return stoppedOnTheWay(recordedReason, 'the units', check);
  }

  // Step 2, per unit (per visit).
  const unit = perUnit(trace, terms, check);
  check.amount('unit cents', unitsStep.unit_cents, unit.total);
  const pe = unit.pe;

  // Step 3: units as billed, the base by method, and the procedure-to-procedure edits.
  const units = decimal(trace.line.units);
  if (!units.isInteger() || units.lessThan(decimal(1n))) {
    throw new TraceRecomputeError('the trace records units the engine does not price');
  }
  check.amount('units', unitsStep.units, units);
  check.same('medically unlikely edit checked', String(terms.flags.apply_ncci), String(unitsStep.mue.checked));
  const base = baseOf(trace, terms, unitsStep, unit.total, units, check);
  const reviewFlags = procedureFlags(trace, terms, check);

  // Step 4, in order, each with its flag on.
  const patientShare = sumCents(trace.line.patient_share_adjustments.map((item) => parseCents(item.amount_cents)));
  const recorded = trace.steps.adjustments;
  const adjustments: RecomputedAdjustment[] = [];
  let amount = base;
  const flagged = [
    [terms.flags.apply_mppr, 'mppr'],
    [terms.flags.apply_assistant_reduction, 'assistant_reduction'],
    [terms.flags.apply_sequestration, 'sequestration'],
  ] as const;
  for (const [flag, name] of flagged) {
    if (!flag) {
      continue;
    }
    const entry = recorded.find((item): item is MedicareAdjustment => item.name === name);
    if (entry === undefined) {
      // Stopped with ENGINE_ERROR in this adjustment (a rule record missing): the amount ends here.
      return stoppedOnTheWay(recordedReason, `the ${name} step`, check);
    }
    const before = amount;
    amount = adjusted(entry, trace, before, pe, decimal(patientShare), check);
    check.amount(`${name} before`, entry.before_cents, before);
    check.amount(`${name} after`, entry.after_cents, amount);
    adjustments.push({ name, beforeCents: unroundedCents(before), afterCents: unroundedCents(amount) });
  }
  // Then the terms' own adjustment, which nothing can stop.
  const own = terms.contract_adjustment;
  if (own !== null) {
    const entry = recorded.find((item): item is TraceContractAdjustment => item.name === 'contract_adjustment');
    if (entry === undefined) {
      throw new TraceRecomputeError('the trace records no contract adjustment for terms that define one');
    }
    const before = amount;
    amount = ownAdjustment(own, before);
    check.same('contract adjustment against the terms', adjustmentText(own), entry.kind === 'PERCENT' ? `PERCENT ${String(entry.percent)}` : `CAP ${String(entry.cap_cents)}`);
    check.amount('contract_adjustment before', entry.before_cents, before);
    check.amount('contract_adjustment after', entry.after_cents, amount);
    adjustments.push({ name: 'contract_adjustment', beforeCents: unroundedCents(before), afterCents: unroundedCents(amount) });
  }
  check.same('adjustments recorded', String(recorded.length), String(adjustments.length));

  // Step 5: secondary and reversed claims stop once the amount is worked through.
  const claim = claimStop(trace);
  if (claim !== null) {
    return unpriced(recordedReason, claim, check);
  }
  const roundingStep = trace.steps.rounding;
  const varianceRecorded = trace.steps.variance_cents;
  if (trace.outcome.result === 'unpriced' || roundingStep === null || varianceRecorded === null) {
    // An ENGINE_ERROR after the amount (the dispute window): nothing priced to compare.
    return stoppedOnTheWay(recordedReason, 'the rounding and the variance', check);
  }
  // Step 6: one rounding.
  const rule = terms.rounding ?? roundingRule(trace.settings.default_rounding) ?? DEFAULT_ROUNDING;
  const rounded = roundToCents(unroundedCents(amount), rule);
  const variance = subtractCents(rounded, parseCents(trace.line.observed_allowed_cents));
  check.same('rounding rule', roundingStep.rule, rule);
  check.amount('unrounded cents', roundingStep.unrounded_cents, amount);
  check.amount('variance cents', varianceRecorded, decimal(variance));
  check.amount('expected allowed cents', trace.outcome.expected_allowed_cents, decimal(rounded));
  check.amount('expected unrounded cents', trace.outcome.expected_unrounded_cents, amount);
  check.same(
    'review flags',
    trace.outcome.review_flags.map((flag) => `${flag.flag} ${String(flag.column1_line_no)}`).join(', '),
    reviewFlags.map((flag) => `${flag.flag} ${String(flag.column1LineNo)}`).join(', '),
  );
  return {
    outcome: 'priced',
    expectedAllowedCents: rounded,
    expectedUnroundedCents: unroundedCents(amount),
    rounding: rule,
    baseCents: unroundedCents(base),
    adjustments,
    reviewFlags,
    patientShareCents: patientShare,
    varianceCents: variance,
    differences: check.differences,
  };
}

/** The practice's default rounding as recorded; a priced line's settings were checked, so anything else is not the engine's trace. */
function roundingRule(text: string | null): RoundingRule | null {
  const rule = ROUNDING_RULES.find((candidate) => candidate === text);
  if (text !== null && rule === undefined) {
    throw new TraceRecomputeError('the trace records a default rounding the engine does not know');
  }
  return rule ?? null;
}

function pricingTrace(value: unknown): PricingTrace {
  try {
    return parseTrace(value);
  } catch {
    throw new TraceRecomputeError('the value is not a pricing trace');
  }
}

function unpriced(recordedReason: UnpricedReason | null, reason: UnpricedReason, check: Comparison): Recomputed {
  check.same('outcome', recordedReason ?? 'priced', reason);
  return { outcome: 'unpriced', reason, differences: check.differences };
}

/** A line that stopped with ENGINE_ERROR part way: its recorded reason stands; a priced trace cannot have stopped. */
function stoppedOnTheWay(recordedReason: UnpricedReason | null, missing: string, check: Comparison): Recomputed {
  if (recordedReason === null) {
    throw new TraceRecomputeError(`a priced trace is missing ${missing}`);
  }
  return { outcome: 'unpriced', reason: recordedReason, differences: check.differences };
}

/** A stop the recorded facts show before any amount: the agreement, the method or the fee schedule. */
function derivedStop(trace: PricingTrace): UnpricedReason | null {
  const agreement = trace.agreement;
  if (agreement === null) {
    // The line's facts or settings were refused before its agreement was read.
    return 'ENGINE_ERROR';
  }
  const stopped = AGREEMENT_STOPS[agreement.outcome];
  if (stopped !== undefined) {
    return stopped;
  }
  if (trace.terms?.method === 'UNSUPPORTED') {
    return 'UNSUPPORTED_METHOD';
  }
  const rvu = trace.steps.fee_schedule?.rvu;
  if (rvu === null) {
    return 'NO_PFS_VALUE';
  }
  const setting = trace.steps.fee_schedule?.setting ?? null;
  if (rvu !== undefined && setting !== null && (setting === 'facility' ? rvu.facility_pe_na : rvu.non_facility_pe_na)) {
    return 'NO_PFS_VALUE';
  }
  const units = trace.steps.units;
  if (units === null) {
    return null;
  }
  // Units above the medically unlikely edit recorded, with apply_ncci on: reviewed, not priced down.
  if (trace.terms?.flags.apply_ncci === true && units.mue.value !== null && decimal(units.units).greaterThan(decimal(BigInt(units.mue.value)))) {
    return 'MUE_EXCEEDED';
  }
  // Units recorded under terms that do not say how timed units are counted: reviewed, not priced.
  return trace.terms?.flags.timed_units_rule === 'UNKNOWN' ? 'UNITS_RULE_UNKNOWN' : null;
}

interface PerUnit {
  readonly total: Decimal;
  /** The fee schedule's practice-expense part, which the reduction cuts; zero for a fixed or per-visit amount. */
  readonly pe: Decimal;
}

/** Step 2 again: the fee schedule's amount per unit at the percentage, or the terms' fixed (per-visit) amount. */
function perUnit(trace: PricingTrace, terms: TraceTerms, check: Comparison): PerUnit {
  const schedule = trace.steps.fee_schedule;
  if (terms.method === 'PERCENT_OF_MEDICARE' || terms.lesser_of?.schedule_method === 'PERCENT_OF_MEDICARE') {
    const rvu = schedule?.rvu ?? null;
    const gpci = schedule?.gpci ?? null;
    const factor = schedule?.conversion_factor ?? null;
    const unitCents = schedule?.unit_cents ?? null;
    if (schedule === null || rvu === null || gpci === null || factor === null || unitCents === null) {
      throw new TraceRecomputeError('a fee-schedule trace with units is missing a fee-schedule value');
    }
    // Per unit, at the percentage: cents per RVU are the factor (dollars) times the percentage.
    const centsPerRvu = decimal(factor.value).times(decimal(schedule.percentage));
    const peRvu = schedule.setting === 'facility' ? rvu.pe_rvu_facility : rvu.pe_rvu_non_facility;
    const work = decimal(rvu.work_rvu).times(decimal(gpci.work_gpci)).times(centsPerRvu);
    const pe = decimal(peRvu).times(decimal(gpci.pe_gpci)).times(centsPerRvu);
    const mp = decimal(rvu.mp_rvu).times(decimal(gpci.mp_gpci)).times(centsPerRvu);
    const total = work.plus(pe).plus(mp);
    checkFeeSchedule(trace, check);
    check.amount('unit work cents', unitCents.work, work);
    check.amount('unit practice-expense cents', unitCents.pe, pe);
    check.amount('unit malpractice cents', unitCents.mp, mp);
    check.amount('unit total cents', unitCents.total, total);
    return { total, pe };
  }
  if (terms.fixed_amount_cents === null) {
    throw new TraceRecomputeError(`a ${terms.method} trace records no amount`);
  }
  check.same('fee schedule for a fixed amount', 'none', schedule === null ? 'none' : 'recorded');
  return { total: decimal(parseCents(terms.fixed_amount_cents)), pe: NOTHING };
}

function recordedAmount(value: string | null, what: string): string {
  if (value === null) {
    throw new TraceRecomputeError(`the trace records no ${what}`);
  }
  return value;
}

/** Step 3's base again, by method. */
function baseOf(trace: PricingTrace, terms: TraceTerms, unitsStep: TraceUnits, unitTotal: Decimal, units: Decimal, check: Comparison): Decimal {
  const visit = trace.steps.per_visit;
  if (terms.method === 'PER_VISIT') {
    if (visit === null) {
      throw new TraceRecomputeError('a per-visit trace records no visit');
    }
    const lineNo = trace.line.line_no;
    // The visit's first line is its lowest number, whatever order the lines came in.
    const carrier = visit.visit_line_nos.reduce((lowest, number) => (number < lowest ? number : lowest), lineNo);
    const base = carrier === lineNo ? unitTotal : NOTHING;
    check.same('the line in its visit', 'included', visit.visit_line_nos.includes(lineNo) ? 'included' : 'missing');
    check.same('the line carrying the visit', String(carrier), String(visit.carrier_line_no));
    check.same('the visit date', trace.line.service_date, visit.service_date);
    check.amount('visit amount', visit.amount_cents, unitTotal);
    check.amount('base cents', visit.base_cents, base);
    check.same('units step amounts of a visit', 'none', [unitsStep.schedule_cents, unitsStep.charge_cents, unitsStep.base_cents].every((item) => item === null) ? 'none' : 'recorded');
    return base;
  }
  check.same('per-visit step', 'none', visit === null ? 'none' : 'recorded');
  const schedule = unitTotal.times(units);
  check.amount('schedule cents', recordedAmount(unitsStep.schedule_cents, 'schedule amount'), schedule);
  let base = schedule;
  if (terms.method === 'LESSER_OF') {
    const charge = recordedAmount(unitsStep.charge_cents, 'line charge');
    check.same('charge against the line', trace.line.charge_cents, charge);
    const chargeAmount = decimal(charge);
    base = chargeAmount.lessThan(schedule) ? chargeAmount : schedule;
  } else {
    check.same('charge of a term that does not compare it', 'none', unitsStep.charge_cents === null ? 'none' : 'recorded');
  }
  check.amount('base cents', recordedAmount(unitsStep.base_cents, 'base'), base);
  return base;
}

/** The procedure-to-procedure edits recorded, judged again: each stands unless indicator 1 meets a 59 or X modifier on either line. */
function procedureFlags(trace: PricingTrace, terms: TraceTerms, check: Comparison): RecomputedFlag[] {
  const recorded = trace.steps.ncci_ptp;
  if (!terms.flags.apply_ncci) {
    check.same('procedure-to-procedure edits', 'not checked', recorded === null ? 'not checked' : 'checked');
    return [];
  }
  if (recorded === null) {
    throw new TraceRecomputeError('a trace with apply_ncci on records no procedure-to-procedure edits');
  }
  const { line } = trace;
  const flags: RecomputedFlag[] = [];
  for (const edit of recorded.edits) {
    check.same('edit record key', `${edit.column1_code} ${line.procedure_code}`, `${String(edit.record.key.column1)} ${String(edit.record.key.column2)}`);
    check.same('edit record window', 'covers the service date', covers(edit.record, line.service_date) ? 'covers the service date' : 'does not');
    const distinct = [...line.modifiers, ...edit.column1_modifiers].some((modifier) => modifier === '59' || modifier.charAt(0) === 'X');
    const bypassed = edit.modifier_indicator === '1' && distinct;
    check.same(`edit with line ${String(edit.column1_line_no)} bypassed`, String(edit.bypassed), String(bypassed));
    if (!bypassed) {
      flags.push({ flag: 'NCCI_PTP', column1LineNo: edit.column1_line_no });
    }
  }
  return flags;
}

function adjustmentText(own: NonNullable<TraceTerms['contract_adjustment']>): string {
  return own.kind === 'PERCENT' ? `PERCENT ${own.percent}` : `CAP ${own.cap_cents}`;
}

/** The terms' own adjustment: its percentage of the amount, or the amount held to its cap. */
function ownAdjustment(own: NonNullable<TraceTerms['contract_adjustment']>, before: Decimal): Decimal {
  if (own.kind === 'PERCENT') {
    return before.times(decimal(own.percent)).times(HUNDREDTH);
  }
  const cap = decimal(parseCents(own.cap_cents));
  return before.greaterThan(cap) ? cap : before;
}

/** Secondary and tertiary adjudications, forwarded or not; the statuses that price; the reversal. */
const SECONDARY_CLAIM = ['2', '3', '20', '21'];
const PRICED_CLAIM = ['1', '4', '19'];

function claimStop(trace: PricingTrace): UnpricedReason | null {
  const { claim_status_code: status, reversed, corrected } = trace.claim;
  if (SECONDARY_CLAIM.includes(status)) {
    return 'SECONDARY_PAYER';
  }
  if (status === '22') {
    return 'REVERSED_CLAIM';
  }
  if (!PRICED_CLAIM.includes(status) || (reversed && corrected)) {
    return 'ENGINE_ERROR';
  }
  return reversed ? 'REVERSED_CLAIM' : null;
}

/** Whether a rule window [from, to] (inclusive; null open) covers the day, or touches the year. */
function covers(record: { readonly effective_from: string; readonly effective_to: string | null }, from: string, to: string = from): boolean {
  return record.effective_from <= to && (record.effective_to === null || record.effective_to >= from);
}

/** The fee-schedule step against the terms, the settings and the line it was computed for. */
function checkFeeSchedule(trace: PricingTrace, check: Comparison): void {
  const schedule = trace.steps.fee_schedule;
  const terms = trace.terms?.percent_of_medicare ?? null;
  if (schedule === null || terms === null) {
    check.same('percent-of-Medicare terms', 'missing', 'present');
    return;
  }
  const { line } = trace;
  check.amount('fee schedule percentage against the terms', terms.percentage, decimal(schedule.percentage));
  check.same('fee schedule year basis against the terms', terms.year_basis, schedule.year_basis);
  const locked = LOCKED.exec(terms.year_basis);
  const basisYear = locked === null ? line.service_date.slice(0, 4) : (locked[1] as string);
  check.same('basis year', basisYear, String(schedule.basis_year));
  check.same('fee schedule lookup', locked === null ? 'in_force_on_service_date' : 'latest_in_basis_year', schedule.lookup);
  const period = locked === null ? ([line.service_date, line.service_date] as const) : ([`${basisYear}-01-01`, `${basisYear}-12-31`] as const);
  const setting = line.place_of_service === null ? undefined : trace.settings.place_of_service_settings[line.place_of_service];
  check.same('setting against the place of service', String(setting), String(schedule.setting));
  const { rvu, gpci, locality, conversion_factor: factor } = schedule;
  if (rvu === null || gpci === null || locality === null || factor === null) {
    check.same('fee schedule records', 'missing', 'present');
    return;
  }
  check.same('relative value record key', `${line.procedure_code} `, `${String(rvu.record.key.hcpcs)} ${String(rvu.record.key.modifier)}`);
  check.same('locality record key', trace.settings.zip, String(locality.record.key.zip));
  check.same('locality ZIP+4', 'not required', locality.plus_four_required === true ? 'required' : 'not required');
  check.same('GPCI record key', `${locality.carrier} ${locality.locality}`, `${String(gpci.record.key.carrier)} ${String(gpci.record.key.locality)}`);
  check.same('conversion factor against the terms', terms.conversion_factor, factor.applicability);
  check.same('conversion factor record key', terms.conversion_factor, String(factor.record.key.applicability));
  check.same('locality record window', 'covers the service date', covers(locality.record, line.service_date) ? 'covers the service date' : 'does not');
  for (const [label, record] of [
    ['relative value', rvu.record],
    ['GPCI', gpci.record],
    ['conversion factor', factor.record],
  ] as const) {
    check.same(`${label} record window`, 'covers the basis', covers(record, ...period) ? 'covers the basis' : 'does not');
  }
}

/** One adjustment, worked out again from what it recorded. */
function adjusted(entry: MedicareAdjustment, trace: PricingTrace, before: Decimal, linePe: Decimal, patientShare: Decimal, check: Comparison): Decimal {
  switch (entry.name) {
    case 'mppr': {
      if (!entry.in_pool) {
        return before;
      }
      if (entry.reduction_percent === null) {
        throw new TraceRecomputeError('an always-therapy line records no reduction percent');
      }
      const percent = decimal(entry.reduction_percent);
      const order = [...entry.ranking].sort((a, b) => decimal(b.pe_cents).comparedTo(decimal(a.pe_cents)) || a.line_no - b.line_no || a.unit - b.unit);
      let after = before;
      check.amount('ranked units of the line', trace.line.units, decimal(BigInt(order.filter((item) => item.line_no === trace.line.line_no).length)));
      order.forEach((item, index) => {
        if (item.line_no === trace.line.line_no) {
          check.amount(`ranked unit ${String(item.unit)} practice-expense cents`, item.pe_cents, linePe);
          after = index === 0 ? after : after.minus(linePe.times(percent).times(HUNDREDTH));
        }
      });
      return after;
    }
    case 'assistant_reduction': {
      const present = trace.line.modifiers.filter((modifier) => modifier === 'CQ' || modifier === 'CO');
      check.same('assistant modifiers', [...entry.records.map((item) => item.modifier)].sort().join(' '), [...present].sort().join(' '));
      const first = entry.records[0];
      return first === undefined ? before : before.times(decimal(first.payment_percent)).times(HUNDREDTH);
    }
    case 'sequestration': {
      check.amount('sequestration patient share', entry.patient_share_cents, patientShare);
      if (entry.suspended) {
        return before;
      }
      const payerShare = before.greaterThan(patientShare) ? before.minus(patientShare) : NOTHING;
      return before.minus(payerShare.times(decimal(entry.reduction_percent)).times(HUNDREDTH));
    }
  }
}
