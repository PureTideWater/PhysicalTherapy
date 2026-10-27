import { type Decimal, decimal, parseCents, roundToCents, unroundedCents } from '@tp/money';
import type { IndexedRelease, PricingTrace, TraceAdjustment } from '@tp/pricing';
import type { RuleRecordType } from '@tp/rules';

/**
 * The adjustment behavior of an underpaid line, detected from its trace (PRD 12, From validated to
 * actionable: lines are grouped into a case by "the same adjustment behavior (for example 'MPPR
 * applied where the contract does not allow it' or 'prior-year conversion factor'), detected from the
 * trace"; test matrix CAS-03). A closed list, each detected by working the line's amount out again from
 * the numbers its trace recorded with one thing changed, and asking whether that explains what the
 * payer allowed to the cent (one cent either way, for the payer's own rounding):
 *
 * - MPPR_NOT_IN_CONTRACT: the term's apply_mppr flag is off, the code is an always-therapy code (the
 *   release names its practice-expense reduction), and the observed allowed is the expected amount with
 *   the practice-expense part of every unit but the day's first, or of every unit, cut by that
 *   reduction;
 * - PRIOR_YEAR_CONVERSION_FACTOR: the line priced from the fee schedule, and the observed allowed is the
 *   expected amount worked out with the conversion factor of the year before the basis year (the same
 *   applicability), the trace's own adjustments applied to it in the trace's order;
 * - BELOW_CONTRACT_RATE: any other shortfall.
 *
 * Nothing here prices a line or changes an amount: the behavior only groups lines (the expected
 * amount, the variance and the case total are the priced line's). The release facts a detector needs
 * and a trace does not carry come in as `BehaviorReferences`, read from the run's release.
 */

export const ADJUSTMENT_BEHAVIORS = ['MPPR_NOT_IN_CONTRACT', 'PRIOR_YEAR_CONVERSION_FACTOR', 'BELOW_CONTRACT_RATE'] as const;
export type AdjustmentBehavior = (typeof ADJUSTMENT_BEHAVIORS)[number];

/** How a pattern's behavior reads in a case and a report. */
export const BEHAVIOR_TEXT: Readonly<Record<AdjustmentBehavior, string>> = {
  MPPR_NOT_IN_CONTRACT: 'Multiple procedure reduction applied where the contract does not allow it',
  PRIOR_YEAR_CONVERSION_FACTOR: 'Paid at the prior year’s conversion factor',
  BELOW_CONTRACT_RATE: 'Paid below the contract rate',
};

export interface BehaviorReferences {
  /** The practice-expense reduction percentage for an always-therapy code on a date; null for any other code. */
  mpprReductionPercent(procedureCode: string, serviceDate: string): Decimal | null;
  /** The conversion factor of a year for an applicability; null when the release has none. */
  conversionFactor(applicability: string, year: number): Decimal | null;
}

/**
 * The record types releaseReferences() reads, and all that triage and the audit report read of a release (audit #31;
 * docs/adr/0071): they load only these, so a real-size release is never held whole for them.
 */
export const BEHAVIOR_RECORD_TYPES = ['mppr_rate', 'conversion_factor'] as const satisfies readonly RuleRecordType[];

/**
 * The references from a run's rule release, read the way the engine reads it: a code's own
 * practice-expense share on the therapy MPPR rate file, or the general reduction when its share is
 * null (none for a code not on the file); a year's conversion factor, the latest in force in that year.
 */
export function releaseReferences(release: IndexedRelease): BehaviorReferences {
  return {
    mpprReductionPercent(procedureCode, serviceDate) {
      const code = release.inForce('mppr_rate', { hcpcs: procedureCode, modifier: '' }, serviceDate);
      if (code === null) {
        return null;
      }
      const share = (code.value as { readonly pe_reduction_percent?: string | null }).pe_reduction_percent ?? null;
      if (share !== null) {
        return decimal(share);
      }
      const general = release.inForce('mppr_rate', { component: 'practice_expense' }, serviceDate);
      return general === null ? null : decimal((general.value as { readonly reduction_percent: string }).reduction_percent);
    },
    conversionFactor(applicability, year) {
      const factor = release.latestInYear('conversion_factor', { applicability }, year);
      return factor === null ? null : decimal(factor.value.conversion_factor);
    },
  };
}

/** The payer's own rounding: a what-if amount within a cent of the observed allowed explains it. */
export const BEHAVIOR_TOLERANCE_CENTS = 1n;

const HUNDRED = decimal(100n);
const ZERO = decimal(0n);

function lesser(a: Decimal, b: Decimal): Decimal {
  return a.lessThan(b) ? a : b;
}

/** The trace's adjustments applied again to another base; the reduction's cuts scale with the base's factor. */
function replay(adjustments: readonly TraceAdjustment[], base: Decimal, scale: Decimal): Decimal {
  let amount = base;
  for (const adjustment of adjustments) {
    switch (adjustment.name) {
      case 'mppr':
        amount = adjustment.reductions.reduce((value, item) => value.minus(decimal(item.cut_cents).times(scale)), amount);
        break;
      case 'assistant_reduction': {
        const [first] = adjustment.records;
        amount = first === undefined ? amount : amount.times(decimal(first.payment_percent)).dividedBy(HUNDRED);
        break;
      }
      case 'sequestration': {
        if (!adjustment.suspended) {
          const payer = amount.minus(decimal(adjustment.patient_share_cents));
          amount = amount.minus((payer.lessThan(ZERO) ? ZERO : payer).times(decimal(adjustment.reduction_percent)).dividedBy(HUNDRED));
        }
        break;
      }
      case 'contract_adjustment':
        // The trace schema gives PERCENT its percent and CAP its cap.
        amount = adjustment.kind === 'PERCENT' ? amount.times(decimal(adjustment.percent as string)).dividedBy(HUNDRED) : lesser(amount, decimal(adjustment.cap_cents as string));
        break;
    }
  }
  return amount;
}

type FeeSchedule = NonNullable<PricingTrace['steps']['fee_schedule']>;

interface Priced {
  readonly trace: PricingTrace;
  readonly schedule: FeeSchedule;
  readonly observed: bigint;
  readonly base: Decimal;
  readonly pe: Decimal;
  readonly units: Decimal;
}

function explains(priced: Priced, amount: Decimal): boolean {
  const rounded = roundToCents(unroundedCents(amount), priced.trace.steps.rounding?.rule ?? 'HALF_UP_CENT');
  const difference = rounded - priced.observed;
  return difference <= BEHAVIOR_TOLERANCE_CENTS && difference >= -BEHAVIOR_TOLERANCE_CENTS;
}

/** The fee-schedule line's numbers the detectors need, or null for any other line. */
function feeScheduleLine(trace: PricingTrace): Priced | null {
  const schedule = trace.steps.fee_schedule;
  const unit = schedule?.unit_cents ?? null;
  const base = trace.steps.units?.base_cents ?? null;
  if (trace.outcome.result !== 'priced' || trace.terms?.method !== 'PERCENT_OF_MEDICARE' || schedule === null || unit === null || base === null || trace.steps.units === null) {
    return null;
  }
  const observed = parseCents(trace.line.observed_allowed_cents);
  if (observed >= parseCents(trace.outcome.expected_allowed_cents)) {
    return null;
  }
  return { trace, schedule, observed, base: decimal(base), pe: decimal(unit.pe), units: decimal(trace.steps.units.units) };
}

function mpprNotInContract(priced: Priced, references: BehaviorReferences): boolean {
  const { trace } = priced;
  if (trace.terms?.flags.apply_mppr !== false || !priced.units.isInteger()) {
    return false;
  }
  const percent = references.mpprReductionPercent(trace.line.procedure_code, trace.line.service_date);
  if (percent === null) {
    return false;
  }
  const cut = priced.pe.times(percent).dividedBy(HUNDRED);
  // Every unit but the day's first (this line holds it), or every unit (another line of the day does).
  for (const reduced of [priced.units.minus(decimal(1n)), priced.units]) {
    if (reduced.greaterThan(ZERO) && explains(priced, replay(trace.steps.adjustments, priced.base.minus(cut.times(reduced)), decimal(1n)))) {
      return true;
    }
  }
  return false;
}

function priorYearConversionFactor(priced: Priced, references: BehaviorReferences): boolean {
  const { schedule } = priced;
  const factor = schedule.conversion_factor;
  if (factor === null) {
    return false;
  }
  const prior = references.conversionFactor(factor.applicability, schedule.basis_year - 1);
  const used = decimal(factor.value);
  if (prior === null || prior.equals(used)) {
    return false;
  }
  const scale = prior.dividedBy(used);
  return explains(priced, replay(priced.trace.steps.adjustments, priced.base.times(scale), scale));
}

/** The behavior of a priced line's shortfall; BELOW_CONTRACT_RATE when no detector explains it, or the line is not underpaid. */
export function detectBehavior(trace: PricingTrace, references: BehaviorReferences): AdjustmentBehavior {
  const priced = feeScheduleLine(trace);
  if (priced === null) {
    return 'BELOW_CONTRACT_RATE';
  }
  if (mpprNotInContract(priced, references)) {
    return 'MPPR_NOT_IN_CONTRACT';
  }
  if (priorYearConversionFactor(priced, references)) {
    return 'PRIOR_YEAR_CONVERSION_FACTOR';
  }
  return 'BELOW_CONTRACT_RATE';
}
