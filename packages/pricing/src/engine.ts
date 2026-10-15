import type { AgreementTerms, RateRecordTerms, RateWindows } from '@tp/contracts';
import {
  type Cents,
  DEFAULT_ROUNDING,
  type Decimal,
  ROUNDING_RULES,
  type RoundedAmount,
  type RoundingRule,
  centsToString,
  decimal,
  roundOnce,
  subtractCents,
  sumCents,
  unroundedCents,
} from '@tp/money';
import type { RuleRecordOf, RuleRecordType } from '@tp/rules';

import { isIsoDate, yearOf } from './dates';
import { EngineInputError, type EngineErrorDetail, type NoPfsValueDetail, type UnpricedReason } from './reasons';
import type { IndexedRelease } from './release';
import { ENGINE_VERSION, type PricingTrace, TRACE_FORMAT, type TraceAdjustment, type TraceAgreement, type TraceFeeSchedule, type TraceStep, type TraceWindow } from './trace';
import type { AppliedAdjustment, LineFacts, LinePricing, PracticeSettings, PricedLine, PricingInput, PricingTerms, UnpricedLine } from './types';
import { disputeWindow } from './windows';

/**
 * The expected-payment engine, phase one (PRD section 11): Medicare Advantage non-contracted lines
 * and PERCENT_OF_MEDICARE terms, locked to a year or current. Pure: the claim's line facts with each
 * line's resolved agreement, a rule release, practice settings and the triage date in; one result per
 * line out, priced or unpriced, each with its trace. It follows PRD 11 in order:
 *
 * 1. The agreement, as @tp/contracts' resolver gave it: a stop reason, or the terms that price the line.
 * 2. The base amount by method: for the basis year, per unit, (work RVU x work GPCI + PE RVU for the
 *    place of service x PE GPCI + MP RVU x MP GPCI) x the conversion factor the terms name, x the
 *    percentage; kept as its work, practice-expense and malpractice parts.
 * 3. Units as billed.
 * 4. The flagged adjustments, in order: the multiple procedure reduction (per claim and day, the
 *    always-therapy units of lines with apply_mppr on, ranked by practice-expense part, the highest
 *    kept whole), the assistant reduction (CQ or CO: the release's percentage of the amount after the
 *    reduction), sequestration (the release's percentage of the payer's share, the amount less the
 *    patient share, floored at zero). Percentages come from the release, never from code.
 * 5. The patient share is reported, never subtracted; secondary claims stop with SECONDARY_PAYER and
 *    reversed claims with REVERSED_CLAIM.
 * 6. One rounding at the end, under the terms' rule, else the practice default, else HALF_UP_CENT;
 *    the unrounded value is kept.
 * 7 and 8. The variance against observed allowed, and the dispute deadline from the remittance date.
 *
 * Nothing is rounded before step 6; every amount is an exact decimal through @tp/money.
 */

const HUNDRED = decimal(100n);
const ZERO = decimal(0n);
const ONE = decimal(1n);
const ASSISTANT_MODIFIERS = ['CQ', 'CO'] as const;
const PRICED_STATUSES = new Set(['1', '4']);
const SECONDARY_STATUSES = new Set(['2', '3']);
const REVERSAL_STATUS = '22';
const PROCEDURE_CODE = /^[0-9A-Z]{5}$/;
const MODIFIER = /^[0-9A-Z]{2}$/;
const PLACE_OF_SERVICE = /^\d{2}$/;
const ZIP = /^\d{5}$/;
const UNITS_TEXT = /^\d+(?:\.\d+)?$/;
const LOCKED_YEAR = /^LOCKED:(\d{4})$/;

/** The terms a line prices under: a contract rate record's, or the Medicare Advantage non-contracted terms. */
type Terms = AgreementTerms | RateRecordTerms;

interface UnitParts {
  readonly work: Decimal;
  readonly pe: Decimal;
  readonly mp: Decimal;
  readonly total: Decimal;
}

/** What every line carries through the steps: its facts, its trace, and what it has resolved to so far. */
interface LineContext {
  readonly facts: LineFacts;
  readonly patientShare: Cents;
  readonly trace: PricingTrace;
  readonly adjustments: AppliedAdjustment[];
  /** The step running now, which a stop names. */
  step: TraceStep;
  identity: PricingTerms | null;
  method: string | null;
}

interface Stopped {
  readonly kind: 'stopped';
  readonly context: LineContext;
  readonly reason: UnpricedReason;
  readonly detail: EngineErrorDetail | NoPfsValueDetail | null;
  readonly step: TraceStep;
}

/** A line priced so far (steps 1 to 3 done); its amount moves through the adjustments. */
interface Working {
  readonly kind: 'working';
  readonly context: LineContext;
  readonly terms: Terms;
  readonly identity: PricingTerms;
  readonly contractWindows: RateWindows | null;
  readonly unit: UnitParts;
  readonly unitCount: number;
  readonly base: Decimal;
  amount: Decimal;
}

interface Finished {
  readonly kind: 'finished';
  readonly work: Working;
  readonly rounded: RoundedAmount;
  readonly window: TraceWindow;
}

/** Prices every line of one claim (the multiple procedure reduction ranks a claim's units per day). */
export function price(input: PricingInput): LinePricing[] {
  const { claim, release, settings, asOf } = input;
  const settingsValid = validSettings(settings) && isIsoDate(asOf);
  const ordered = [...claim.lines].sort((a, b) => a.lineNo - b.lineNo);
  const counts = new Map<number, number>();
  for (const facts of ordered) {
    counts.set(facts.lineNo, (counts.get(facts.lineNo) ?? 0) + 1);
  }
  const first = ordered.map((facts) => {
    const context = newContext(input, facts);
    return attempt(context, () => {
      if (!settingsValid) {
        throw new EngineInputError('invalid_settings');
      }
      if (counts.get(facts.lineNo) !== 1) {
        throw new EngineInputError('duplicate_line_no');
      }
      validateFacts(facts);
      return stepsOneToThree(context, release, settings);
    });
  });
  const reduced = multipleProcedureReduction(first, release);
  const finished = reduced.map((item) => (item.kind === 'stopped' ? item : attempt(item.context, () => stepsFourToEight(item, input))));
  return finished.map((item) => (item.kind === 'stopped' ? unpriced(item) : priced(item)));
}

// ---------------------------------------------------------------------------------------------------
// Lines, stops and checks

function newContext(input: PricingInput, facts: LineFacts): LineContext {
  const { claim, release, settings, asOf } = input;
  const trace: PricingTrace = {
    format: TRACE_FORMAT,
    engine: ENGINE_VERSION,
    release: { number: release.releaseNo, manifest_sha256: release.manifestSha256 },
    as_of: asOf,
    settings: { zip: settings.zip, default_rounding: settings.defaultRounding, place_of_service_settings: { ...settings.placeOfServiceSettings } },
    claim: {
      claim_status_code: claim.claimStatusCode,
      reversed: claim.reversed,
      corrected: claim.corrected,
      remittance_date: claim.remittanceDate,
      payer_plan_key: claim.payerPlanKey,
    },
    line: {
      line_no: facts.lineNo,
      service_line_id: facts.serviceLineId ?? null,
      procedure_code: facts.procedureCode,
      modifiers: [...facts.modifiers],
      units: facts.units,
      service_date: facts.serviceDate,
      place_of_service: facts.placeOfService,
      charge_cents: centsToString(facts.chargeCents),
      observed_allowed_cents: centsToString(facts.observedAllowedCents),
      observed_allowed_basis: facts.observedAllowedBasis,
      patient_share_adjustments: facts.patientShareAdjustments.map((adjustment) => ({
        group_code: adjustment.groupCode,
        reason_code: adjustment.reasonCode,
        amount_cents: centsToString(adjustment.amountCents),
      })),
    },
    agreement: null,
    terms: null,
    steps: { fee_schedule: null, units: null, adjustments: [], patient_share_cents: null, rounding: null, variance_cents: null, window: null },
    // Replaced when the line ends, priced or stopped.
    outcome: { result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'unexpected', step: 'input' },
  };
  return {
    facts,
    patientShare: sumCents(facts.patientShareAdjustments.map((adjustment) => adjustment.amountCents)),
    trace,
    adjustments: [],
    step: 'input',
    identity: null,
    method: null,
  };
}

function stop(context: LineContext, reason: UnpricedReason, detail: EngineErrorDetail | NoPfsValueDetail | null = null): Stopped {
  return { kind: 'stopped', context, reason, detail, step: context.step };
}

/** An input or release problem stops the line with ENGINE_ERROR (an operator alert), never a guessed price. */
function engineError(context: LineContext, error: unknown): Stopped {
  return stop(context, 'ENGINE_ERROR', error instanceof EngineInputError ? error.detail : 'unexpected');
}

function attempt<T>(context: LineContext, steps: () => T | Stopped): T | Stopped {
  try {
    return steps();
  } catch (error) {
    return engineError(context, error);
  }
}

function validSettings(settings: PracticeSettings): boolean {
  const rule = settings.defaultRounding;
  return (
    ZIP.test(settings.zip) &&
    (rule === null || ROUNDING_RULES.includes(rule)) &&
    Object.entries(settings.placeOfServiceSettings).every(([place, setting]) => PLACE_OF_SERVICE.test(place) && (setting === 'facility' || setting === 'non_facility'))
  );
}

function validateFacts(facts: LineFacts): void {
  const valid =
    Number.isSafeInteger(facts.lineNo) &&
    facts.lineNo >= 1 &&
    PROCEDURE_CODE.test(facts.procedureCode) &&
    facts.modifiers.length <= 4 &&
    new Set(facts.modifiers).size === facts.modifiers.length &&
    facts.modifiers.every((modifier) => MODIFIER.test(modifier)) &&
    isIsoDate(facts.serviceDate) &&
    (facts.placeOfService === null || PLACE_OF_SERVICE.test(facts.placeOfService)) &&
    (facts.observedAllowedBasis === 'amt_b6' || facts.observedAllowedBasis === 'paid_plus_pr') &&
    facts.patientShareAdjustments.every((adjustment) => adjustment.groupCode === 'PR');
  if (!valid) {
    throw new EngineInputError('invalid_line_facts');
  }
}

// ---------------------------------------------------------------------------------------------------
// Steps 1 to 3

function stepsOneToThree(context: LineContext, release: IndexedRelease, settings: PracticeSettings): Working | Stopped {
  const agreement = resolveTerms(context);
  if (agreement.kind === 'stopped') {
    return agreement;
  }
  const unit = baseAmount(context, agreement.terms, release, settings);
  if (unit.kind === 'stopped') {
    return unit;
  }
  context.step = 'units';
  const text = context.facts.units;
  const units = UNITS_TEXT.test(text) ? decimal(text) : null;
  if (units === null || !units.isInteger() || units.lessThan(ONE)) {
    throw new EngineInputError('units_not_whole');
  }
  const base = unit.parts.total.times(units);
  context.trace.steps.units = { units: units.toString(), timed_units_rule: agreement.terms.flags.timed_units_rule, base_cents: base.toString() };
  return {
    kind: 'working',
    context,
    terms: agreement.terms,
    identity: agreement.identity,
    contractWindows: agreement.contractWindows,
    unit: unit.parts,
    unitCount: Number.parseInt(units.toString(), 10),
    base,
    amount: base,
  };
}

interface Resolved {
  readonly kind: 'resolved';
  readonly terms: Terms;
  readonly identity: PricingTerms;
  readonly contractWindows: RateWindows | null;
}

/** Step 1: the agreement the resolver found, or the reason it gave. */
function resolveTerms(context: LineContext): Resolved | Stopped {
  context.step = 'agreement';
  const agreement = context.facts.agreement;
  const trace: TraceAgreement = {
    outcome: agreement.outcome,
    mapping_id: null,
    mapping_kind: null,
    contract_version_id: null,
    contract_version_status: null,
    rate_record_id: null,
    matching_rate_record_ids: [],
    windows: null,
  };
  context.trace.agreement = trace;
  if (agreement.outcome === 'RESOLUTION_FAILED') {
    throw new EngineInputError('agreement_unresolved');
  }
  if (agreement.outcome === 'NO_MAPPING') {
    return stop(context, 'NO_MAPPING');
  }
  const { mapping } = agreement;
  trace.mapping_id = mapping.id;
  trace.mapping_kind = mapping.kind;
  const identity: PricingTerms = { mappingId: mapping.id, mappingKind: mapping.kind, contractVersionId: null, rateRecordId: null };
  context.identity = identity;
  switch (agreement.outcome) {
    case 'NO_AGREEMENT':
    case 'DATE_OUTSIDE_VERSIONS':
      return stop(context, agreement.outcome);
    case 'NO_RATE_FOR_CODE':
    case 'AMBIGUOUS_RATE':
      trace.contract_version_id = agreement.version.id;
      trace.contract_version_status = agreement.version.status;
      trace.matching_rate_record_ids = agreement.outcome === 'AMBIGUOUS_RATE' ? [...agreement.rateRecordIds] : [];
      context.identity = { ...identity, contractVersionId: agreement.version.id };
      return stop(context, agreement.outcome);
    case 'MA_NONCONTRACTED':
      return withTerms(context, agreement.terms, identity, null);
    case 'CONTRACT_RATE': {
      const { version, rate } = agreement;
      const { windows } = rate;
      trace.contract_version_id = version.id;
      trace.contract_version_status = version.status;
      trace.rate_record_id = rate.rateRecordId;
      trace.windows = { timely_filing_days: windows.timely_filing_days, dispute_window_days: windows.dispute_window_days, appeal_levels: windows.appeal_levels.map((level) => ({ ...level })) };
      const priced = { ...identity, contractVersionId: version.id, rateRecordId: rate.rateRecordId };
      context.identity = priced;
      if (version.status !== 'signed_off') {
        throw new EngineInputError('version_not_signed_off');
      }
      return withTerms(context, rate.terms, priced, windows);
    }
  }
}

function withTerms(context: LineContext, terms: Terms, identity: PricingTerms, contractWindows: RateWindows | null): Resolved {
  context.method = terms.method;
  context.trace.terms = {
    method: terms.method,
    percent_of_medicare:
      terms.method === 'PERCENT_OF_MEDICARE'
        ? {
            percentage: terms.parameters.percentage.toString(),
            year_basis: terms.parameters.year_basis,
            locality_basis: { ...terms.parameters.locality_basis },
            conversion_factor: terms.parameters.conversion_factor,
          }
        : null,
    flags: { ...terms.flags },
    rounding: terms.rounding,
  };
  return { kind: 'resolved', terms, identity, contractWindows };
}

type Lookup = <T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>) => RuleRecordOf<T> | null;

/** Step 2: the per-unit amount by method, for the basis year, in work, practice-expense and malpractice parts. */
function baseAmount(context: LineContext, terms: Terms, release: IndexedRelease, settings: PracticeSettings): { readonly kind: 'unit'; readonly parts: UnitParts } | Stopped {
  context.step = 'method';
  if (terms.method === 'UNSUPPORTED') {
    return stop(context, 'UNSUPPORTED_METHOD');
  }
  if (terms.method !== 'PERCENT_OF_MEDICARE') {
    throw new EngineInputError('method_not_in_phase_one');
  }
  const parameters = terms.parameters;
  if (parameters.locality_basis.kind !== 'PRACTICE') {
    throw new EngineInputError('locality_basis_not_in_phase_one');
  }
  context.step = 'fee_schedule';
  const date = context.facts.serviceDate;
  const locked = LOCKED_YEAR.exec(parameters.year_basis);
  const basisYear = locked === null ? yearOf(date) : Number.parseInt(parameters.year_basis.slice('LOCKED:'.length), 10);
  // CURRENT: the records in force on the date of service. LOCKED:<year>: the latest record in force during that year.
  const lookup: Lookup = locked === null ? (type, key) => release.inForce(type, key, date) : (type, key) => release.latestInYear(type, key, basisYear);
  const schedule: TraceFeeSchedule = {
    year_basis: parameters.year_basis,
    basis_year: basisYear,
    lookup: locked === null ? 'in_force_on_service_date' : 'latest_in_basis_year',
    rvu: null,
    setting: null,
    locality: null,
    gpci: null,
    conversion_factor: null,
    percentage: parameters.percentage.toString(),
    unit_cents: null,
  };
  context.trace.steps.fee_schedule = schedule;

  const rvu = lookup('pfs_rvu', { hcpcs: context.facts.procedureCode, modifier: '' });
  if (rvu === null) {
    return stop(context, 'NO_PFS_VALUE', 'no_rvu_in_basis_year');
  }
  const values = rvu.value;
  schedule.rvu = {
    record: release.ref(rvu),
    work_rvu: values.work_rvu,
    pe_rvu_facility: values.pe_rvu_facility,
    pe_rvu_non_facility: values.pe_rvu_non_facility,
    mp_rvu: values.mp_rvu,
    facility_pe_na: values.facility_pe_na,
    non_facility_pe_na: values.non_facility_pe_na,
  };
  const place = context.facts.placeOfService;
  const setting = place === null ? undefined : settings.placeOfServiceSettings[place];
  if (setting === undefined) {
    throw new EngineInputError('place_of_service_unmapped');
  }
  schedule.setting = setting;
  const facility = setting === 'facility';
  if (facility ? values.facility_pe_na : values.non_facility_pe_na) {
    return stop(context, 'NO_PFS_VALUE', 'practice_expense_not_available');
  }
  // The locality follows the service date whatever the basis year (fixtures/golden/QUESTIONS.md, Q07).
  const locality = release.inForce('locality_map', { zip: settings.zip }, date);
  if (locality === null) {
    throw new EngineInputError('no_locality');
  }
  const { carrier, locality: localityNo } = locality.value;
  schedule.locality = { record: release.ref(locality), carrier, locality: localityNo };
  const gpci = lookup('pfs_gpci', { carrier, locality: localityNo });
  if (gpci === null) {
    throw new EngineInputError('no_gpci');
  }
  schedule.gpci = { record: release.ref(gpci), work_gpci: gpci.value.work_gpci, pe_gpci: gpci.value.pe_gpci, mp_gpci: gpci.value.mp_gpci };
  const factor = lookup('conversion_factor', { applicability: parameters.conversion_factor });
  if (factor === null) {
    throw new EngineInputError('no_conversion_factor');
  }
  schedule.conversion_factor = { record: release.ref(factor), applicability: parameters.conversion_factor, value: factor.value.conversion_factor };

  // The factor is dollars per RVU: times 100 is cents per RVU, times the percentage over 100 the contract's share.
  const centsPerRvu = decimal(factor.value.conversion_factor).times(HUNDRED).times(parameters.percentage.dividedBy(HUNDRED));
  const work = decimal(values.work_rvu).times(decimal(gpci.value.work_gpci)).times(centsPerRvu);
  const pe = decimal(facility ? values.pe_rvu_facility : values.pe_rvu_non_facility)
    .times(decimal(gpci.value.pe_gpci))
    .times(centsPerRvu);
  const mp = decimal(values.mp_rvu).times(decimal(gpci.value.mp_gpci)).times(centsPerRvu);
  const total = work.plus(pe).plus(mp);
  schedule.unit_cents = { work: work.toString(), pe: pe.toString(), mp: mp.toString(), total: total.toString() };
  return { kind: 'unit', parts: { work, pe, mp, total } };
}

// ---------------------------------------------------------------------------------------------------
// Step 4: the flagged adjustments

function apply(work: Working, adjustment: TraceAdjustment, before: Decimal, after: Decimal): void {
  work.amount = after;
  work.context.adjustments.push({ name: adjustment.name, beforeCents: unroundedCents(before), afterCents: unroundedCents(after) });
  work.context.trace.steps.adjustments.push(adjustment);
}

interface PoolMember {
  readonly work: Working;
  readonly codeRecord: RuleRecordOf<'mppr_rate'> | null;
  readonly generalRecord: RuleRecordOf<'mppr_rate'> | null;
  readonly percent: Decimal | null;
}

interface RankedUnit {
  readonly work: Working;
  readonly unit: number;
  readonly rank: number;
}

/**
 * Step 4a, per claim and service date: every unit of the day's lines priced so far, with apply_mppr
 * on and an always-therapy code (an mppr_rate record in force), ranked by its practice-expense part,
 * highest first (ties: the lower line number, then the earlier unit). The first unit stays whole;
 * every other unit's practice-expense part is cut by its code's percentage, or by the general
 * practice-expense percentage when the code's share is null. Lines whose terms have the flag off,
 * and lines already unpriced, are neither ranked nor reduced.
 */
function multipleProcedureReduction(items: readonly (Working | Stopped)[], release: IndexedRelease): (Working | Stopped)[] {
  const days = new Map<string, Working[]>();
  for (const item of items) {
    if (item.kind === 'working' && item.terms.flags.apply_mppr) {
      days.set(item.context.facts.serviceDate, [...(days.get(item.context.facts.serviceDate) ?? []), item]);
    }
  }
  const stopped = new Map<Working, Stopped>();
  for (const [date, day] of days) {
    for (const work of day) {
      work.context.step = 'mppr';
    }
    let members: PoolMember[];
    try {
      members = day.map((work) => poolMember(work, release, date));
    } catch (error) {
      // Which units belong to the day's pool is unknown, so none of the day's lines can be reduced.
      for (const work of day) {
        stopped.set(work, engineError(work.context, error));
      }
      continue;
    }
    const units = members
      .filter((member) => member.codeRecord !== null)
      .flatMap((member) => Array.from({ length: member.work.unitCount }, (_, index) => ({ work: member.work, unit: index + 1 })))
      .sort((a, b) => b.work.unit.pe.comparedTo(a.work.unit.pe) || a.work.context.facts.lineNo - b.work.context.facts.lineNo || a.unit - b.unit);
    const ranked: RankedUnit[] = units.map((item, index) => ({ ...item, rank: index + 1 }));
    const ranking = ranked.map((item) => ({ rank: item.rank, line_no: item.work.context.facts.lineNo, unit: item.unit, pe_cents: item.work.unit.pe.toString() }));
    for (const member of members) {
      const { work, codeRecord, percent } = member;
      if (codeRecord !== null && percent === null) {
        stopped.set(work, stop(work.context, 'ENGINE_ERROR', 'no_mppr_rate'));
        continue;
      }
      const cutBy = percent ?? ZERO;
      const reductions = ranked
        .filter((item) => item.work === work && item.rank > 1)
        .map((item) => ({ unit: item.unit, rank: item.rank, cut: work.unit.pe.times(cutBy).dividedBy(HUNDRED) }));
      const before = work.amount;
      const after = reductions.reduce((amount, item) => amount.minus(item.cut), before);
      apply(
        work,
        {
          name: 'mppr',
          before_cents: before.toString(),
          after_cents: after.toString(),
          service_date: date,
          in_pool: codeRecord !== null,
          code_record: codeRecord === null ? null : release.ref(codeRecord),
          general_record: member.generalRecord === null ? null : release.ref(member.generalRecord),
          reduction_percent: percent === null ? null : percent.toString(),
          ranking: codeRecord === null ? [] : ranking,
          reductions: reductions.map((item) => ({ unit: item.unit, rank: item.rank, cut_cents: item.cut.toString() })),
        },
        before,
        after,
      );
    }
  }
  return items.map((item) => (item.kind === 'working' ? (stopped.get(item) ?? item) : item));
}

function poolMember(work: Working, release: IndexedRelease, date: string): PoolMember {
  const codeRecord = release.inForce('mppr_rate', { hcpcs: work.context.facts.procedureCode, modifier: '' }, date);
  if (codeRecord === null) {
    return { work, codeRecord: null, generalRecord: null, percent: null };
  }
  const share = (codeRecord.value as { readonly pe_reduction_percent: string | null }).pe_reduction_percent;
  if (share !== null) {
    return { work, codeRecord, generalRecord: null, percent: decimal(share) };
  }
  const general = release.inForce('mppr_rate', { component: 'practice_expense' }, date);
  const percent = general === null ? null : decimal((general.value as { readonly reduction_percent: string }).reduction_percent);
  return { work, codeRecord, generalRecord: general, percent };
}

/** Step 4b, CQ or CO with the flag on: the release's assistant percentage of the amount after the reduction. */
function assistantReduction(work: Working, release: IndexedRelease): void {
  work.context.step = 'assistant_reduction';
  const { facts } = work.context;
  const present = ASSISTANT_MODIFIERS.filter((modifier) => facts.modifiers.includes(modifier));
  const records = present.map((modifier) => {
    const found = release.inForce('assistant_modifier', { modifier }, facts.serviceDate);
    if (found === null) {
      throw new EngineInputError('no_assistant_record');
    }
    return { modifier, found, percent: decimal(found.value.payment_percent) };
  });
  const before = work.amount;
  let after = before;
  const [first, ...others] = records;
  if (first !== undefined) {
    // CQ and CO together apply once, and only when their percentages agree (QUESTIONS Q19).
    if (others.some((other) => !other.percent.equals(first.percent))) {
      throw new EngineInputError('assistant_percentages_differ');
    }
    after = before.times(first.percent).dividedBy(HUNDRED);
  }
  apply(
    work,
    {
      name: 'assistant_reduction',
      before_cents: before.toString(),
      after_cents: after.toString(),
      modifiers_present: [...present],
      records: records.map((item) => ({ modifier: item.modifier, record: release.ref(item.found), payment_percent: item.percent.toString() })),
    },
    before,
    after,
  );
}

/** Step 4c: the release's sequestration percentage of the payer's share (the amount less the patient share, floored at zero). */
function sequestration(work: Working, release: IndexedRelease): void {
  work.context.step = 'sequestration';
  const found = release.inForce('sequestration', { program: 'medicare' }, work.context.facts.serviceDate);
  if (found === null) {
    throw new EngineInputError('no_sequestration_record');
  }
  const before = work.amount;
  const remaining = before.minus(decimal(work.context.patientShare));
  const payerShare = remaining.lessThan(ZERO) ? ZERO : remaining;
  const percent = decimal(found.value.reduction_percent);
  const cut = found.value.suspended ? ZERO : payerShare.times(percent).dividedBy(HUNDRED);
  const after = before.minus(cut);
  apply(
    work,
    {
      name: 'sequestration',
      before_cents: before.toString(),
      after_cents: after.toString(),
      record: release.ref(found),
      suspended: found.value.suspended,
      reduction_percent: percent.toString(),
      patient_share_cents: centsToString(work.context.patientShare),
      payer_share_cents: payerShare.toString(),
      cut_cents: cut.toString(),
    },
    before,
    after,
  );
}

// ---------------------------------------------------------------------------------------------------
// Steps 4b to 8

function stepsFourToEight(work: Working, input: PricingInput): Finished | Stopped {
  const { context, terms } = work;
  if (terms.flags.apply_assistant_reduction) {
    assistantReduction(work, input.release);
  }
  if (terms.flags.apply_sequestration) {
    sequestration(work, input.release);
  }
  // Step 5: the patient share is reported beside the amount; secondary and reversed claims stop here.
  context.step = 'claim';
  context.trace.steps.patient_share_cents = centsToString(context.patientShare);
  const { claimStatusCode, reversed, corrected } = input.claim;
  if (SECONDARY_STATUSES.has(claimStatusCode)) {
    return stop(context, 'SECONDARY_PAYER');
  }
  if (claimStatusCode === REVERSAL_STATUS) {
    return stop(context, 'REVERSED_CLAIM');
  }
  if (!PRICED_STATUSES.has(claimStatusCode)) {
    throw new EngineInputError('claim_status_unknown');
  }
  if (reversed && corrected) {
    throw new EngineInputError('reversed_and_corrected');
  }
  if (reversed) {
    return stop(context, 'REVERSED_CLAIM');
  }
  // Step 6: the one rounding.
  context.step = 'rounding';
  const { settings } = input;
  const rule: RoundingRule = terms.rounding ?? settings.defaultRounding ?? DEFAULT_ROUNDING;
  const origin = terms.rounding !== null ? 'rate_record' : settings.defaultRounding !== null ? 'practice_default' : 'engine_default';
  const rounded = roundOnce(unroundedCents(work.amount), rule);
  context.trace.steps.rounding = { rule, origin, unrounded_cents: rounded.unrounded.toString(), rounded_cents: centsToString(rounded.cents) };
  // Step 8: the dispute deadline, for triage.
  context.step = 'window';
  const window = disputeWindow({
    contractWindows: work.contractWindows,
    remittanceDate: input.claim.remittanceDate,
    serviceDate: context.facts.serviceDate,
    asOf: input.asOf,
    release: input.release,
  });
  return { kind: 'finished', work, rounded, window };
}

// ---------------------------------------------------------------------------------------------------
// Results

function priced(item: Finished): PricedLine {
  const { work, rounded, window } = item;
  const { context } = work;
  // Step 7: the variance against observed allowed.
  const variance = subtractCents(rounded.cents, context.facts.observedAllowedCents);
  context.trace.steps.variance_cents = centsToString(variance);
  context.trace.steps.window = window;
  context.trace.outcome = { result: 'priced', expected_allowed_cents: centsToString(rounded.cents), expected_unrounded_cents: rounded.unrounded.toString() };
  return {
    outcome: 'priced',
    lineNo: context.facts.lineNo,
    method: 'PERCENT_OF_MEDICARE',
    terms: work.identity,
    expectedAllowedCents: rounded.cents,
    expectedUnroundedCents: rounded.unrounded,
    rounding: rounded.rule,
    baseCents: unroundedCents(work.base),
    adjustments: [...context.adjustments],
    patientShareCents: context.patientShare,
    observedAllowedCents: context.facts.observedAllowedCents,
    varianceCents: variance,
    window: { endsOn: window.ends_on, status: window.status },
    trace: context.trace,
  };
}

function unpriced(item: Stopped): UnpricedLine {
  const { context } = item;
  context.trace.outcome = { result: 'unpriced', reason: item.reason, detail: item.detail, step: item.step };
  return {
    outcome: 'unpriced',
    lineNo: context.facts.lineNo,
    reason: item.reason,
    detail: item.detail,
    method: context.method,
    terms: context.identity,
    trace: context.trace,
  };
}
