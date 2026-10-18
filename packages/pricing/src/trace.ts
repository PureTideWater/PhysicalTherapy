import { ROUNDING_RULES } from '@tp/money';
import { RULE_RECORD_TYPES } from '@tp/rules';
import { z } from 'zod';

import { ENGINE_ERROR_DETAILS, NO_PFS_VALUE_DETAILS, UNPRICED_REASONS } from './reasons';

/**
 * The trace (PRD 11 step 9): a JSON record, stored in `priced_line.trace`, of every input value the
 * line used, every rule record and release it read (by type, key, window and SHA-256), each step's
 * intermediate amount, and the reason when the line is unpriced. It is enough to recompute the amount
 * without the database: `recompute(trace)` does exactly that, and a test runs it over every golden
 * line. Amounts are cents as decimal text (integer text where whole); percentages, relative values
 * and indices are decimal text as the release wrote them; dates are YYYY-MM-DD.
 */
export const TRACE_FORMAT = 'tp-pricing-trace/2';

/** The engine's version, recorded in every trace and in `pricing_run.engine_version`. */
export const ENGINE_VERSION = 'phase-two/1';

const decimalText = z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be decimal text');
const centsText = z.string().regex(/^(?:0|-?[1-9]\d*)$/, 'must be whole cents as integer text');
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date written YYYY-MM-DD');
const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'must be a SHA-256 in hex');
const rounding = z.enum(ROUNDING_RULES);
const setting = z.enum(['facility', 'non_facility']);

const recordRef = z.strictObject({
  record_type: z.enum(RULE_RECORD_TYPES),
  key: z.record(z.string(), z.string()),
  effective_from: dateText,
  effective_to: dateText.nullable(),
  sha256,
});

const lineFacts = z.strictObject({
  line_no: z.number().int(),
  service_line_id: z.string().nullable(),
  procedure_code: z.string(),
  modifiers: z.array(z.string()),
  units: z.string(),
  service_date: z.string(),
  place_of_service: z.string().nullable(),
  charge_cents: z.string(),
  observed_allowed_cents: z.string(),
  observed_allowed_basis: z.string(),
  patient_share_adjustments: z.array(z.strictObject({ group_code: z.string(), reason_code: z.string(), amount_cents: z.string() })),
});

const claimFacts = z.strictObject({
  claim_status_code: z.string(),
  reversed: z.boolean(),
  corrected: z.boolean(),
  remittance_date: z.string().nullable(),
  payer_plan_key: z.string().nullable(),
});

/** The practice settings as given (verbatim, like the line facts: a line refused for them still has a trace). */
const settings = z.strictObject({
  zip: z.string(),
  default_rounding: z.string().nullable(),
  place_of_service_settings: z.record(z.string(), z.string()),
});

const agreement = z.strictObject({
  outcome: z.enum(['CONTRACT_RATE', 'MA_NONCONTRACTED', 'NO_MAPPING', 'NO_AGREEMENT', 'DATE_OUTSIDE_VERSIONS', 'NO_RATE_FOR_CODE', 'AMBIGUOUS_RATE', 'RESOLUTION_FAILED']),
  mapping_id: z.string().nullable(),
  mapping_kind: z.string().nullable(),
  contract_version_id: z.string().nullable(),
  contract_version_status: z.string().nullable(),
  rate_record_id: z.string().nullable(),
  /** Every matching record when the rate is ambiguous. */
  matching_rate_record_ids: z.array(z.string()),
  /** The version's windows (contracts) or null (Medicare Advantage non-contracted and the stops). */
  windows: z
    .strictObject({
      timely_filing_days: z.number().int().nullable(),
      dispute_window_days: z.number().int().nullable(),
      appeal_levels: z.array(z.strictObject({ level: z.number().int(), days: z.number().int() })),
    })
    .nullable(),
});

const flags = z.strictObject({
  apply_mppr: z.boolean(),
  apply_assistant_reduction: z.boolean(),
  apply_sequestration: z.boolean(),
  apply_ncci: z.boolean(),
  timed_units_rule: z.string(),
});

const terms = z.strictObject({
  method: z.string(),
  /** The fee schedule a PERCENT_OF_MEDICARE term, or a LESSER_OF term's percent schedule, prices from. */
  percent_of_medicare: z
    .strictObject({
      percentage: decimalText,
      year_basis: z.string(),
      locality_basis: z.union([z.strictObject({ kind: z.literal('PRACTICE') }), z.strictObject({ kind: z.literal('NAMED'), carrier: z.string(), locality: z.string() })]),
      conversion_factor: z.string(),
    })
    .nullable(),
  /** The amount per unit of a FIXED_SCHEDULE term or a LESSER_OF term's fixed schedule, or per visit of a PER_VISIT term. */
  fixed_amount_cents: centsText.nullable(),
  /** Set for LESSER_OF terms: which schedule they compare with the charge, and the charge they compare. */
  lesser_of: z.strictObject({ schedule_method: z.enum(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE']), charge_basis: z.literal('LINE_CHARGE') }).nullable(),
  /** The rate record's own adjustment (PRD 11 step 4), applied after the Medicare ones. */
  contract_adjustment: z
    .discriminatedUnion('kind', [z.strictObject({ kind: z.literal('PERCENT'), percent: decimalText }), z.strictObject({ kind: z.literal('CAP'), cap_cents: centsText })])
    .nullable(),
  flags,
  rounding: rounding.nullable(),
});

/** Step 2: what the fee schedule gave, as far as the line got. */
const feeSchedule = z.strictObject({
  year_basis: z.string(),
  basis_year: z.number().int(),
  /** CURRENT reads the records in force on the service date; LOCKED:<year> the latest in force during the year. */
  lookup: z.enum(['in_force_on_service_date', 'latest_in_basis_year']),
  rvu: z
    .strictObject({ record: recordRef, work_rvu: decimalText, pe_rvu_facility: decimalText, pe_rvu_non_facility: decimalText, mp_rvu: decimalText, facility_pe_na: z.boolean(), non_facility_pe_na: z.boolean() })
    .nullable(),
  setting: setting.nullable(),
  /** The practice ZIP's locality; a ZIP whose record needs its ZIP+4 stops the line (ENGINE_ERROR). */
  locality: z.strictObject({ record: recordRef, carrier: z.string(), locality: z.string(), plus_four_required: z.boolean().nullable() }).nullable(),
  gpci: z.strictObject({ record: recordRef, work_gpci: decimalText, pe_gpci: decimalText, mp_gpci: decimalText }).nullable(),
  conversion_factor: z.strictObject({ record: recordRef, applicability: z.string(), value: decimalText }).nullable(),
  percentage: decimalText,
  /** Per unit, at the record's percentage: the work, practice-expense and malpractice parts and their sum. */
  unit_cents: z.strictObject({ work: decimalText, pe: decimalText, mp: decimalText, total: decimalText }).nullable(),
});

const units = z.strictObject({
  units: decimalText,
  /** Units are taken as billed (PRD 2 point 6); UNKNOWN stops the line with UNITS_RULE_UNKNOWN (PRD 20). */
  timed_units_rule: z.string(),
  /**
   * The medically unlikely edit: checked when apply_ncci is on, against the code's ncci_mue record in force on the
   * service date (none: no limit). Units above the value stop the line with MUE_EXCEEDED, never priced down.
   */
  mue: z.strictObject({ checked: z.boolean(), record: recordRef.nullable(), value: z.number().int().nullable() }),
  /** The amount per unit (per visit for PER_VISIT): the fee schedule's at the percentage, or the fixed amount. */
  unit_cents: decimalText,
  /** The schedule's amount for the units billed; null for PER_VISIT, which units do not multiply. */
  schedule_cents: decimalText.nullable(),
  /** The line charge a LESSER_OF term compares the schedule with; null for the other methods. */
  charge_cents: centsText.nullable(),
  /** The base; null for PER_VISIT, whose base the per-visit step sets. */
  base_cents: decimalText.nullable(),
});

/** PER_VISIT: the visit amount once per claim, date and rate record, carried by the lowest line number of the visit. */
const perVisit = z.strictObject({
  service_date: dateText,
  amount_cents: centsText,
  /** The lines priced so far under the record on the date, this one among them. */
  visit_line_nos: z.array(z.number().int()),
  carrier_line_no: z.number().int(),
  base_cents: decimalText,
});

/**
 * The NCCI procedure-to-procedure edits with this line's code in column 2 and the code of another line of the claim
 * and date in column 1, in that line's order; each stands (a review flag) unless its modifier indicator is 1 and a
 * 59 or X modifier is on either line. Null when apply_ncci is off or the line stopped before the edits.
 */
const procedureToProcedure = z.strictObject({
  edits: z.array(
    z.strictObject({
      column1_line_no: z.number().int(),
      column1_code: z.string(),
      column1_modifiers: z.array(z.string()),
      record: recordRef,
      modifier_indicator: z.string(),
      bypassed: z.boolean(),
    }),
  ),
});

const rankedUnit = z.strictObject({ rank: z.number().int(), line_no: z.number().int(), unit: z.number().int(), pe_cents: decimalText });

const mppr = z.strictObject({
  name: z.literal('mppr'),
  before_cents: decimalText,
  after_cents: decimalText,
  service_date: dateText,
  /** The code has an mppr_rate record in force: an always-therapy code, ranked and reducible. */
  in_pool: z.boolean(),
  code_record: recordRef.nullable(),
  /** The general practice-expense reduction, used when the code's own share is null. */
  general_record: recordRef.nullable(),
  reduction_percent: decimalText.nullable(),
  /**
   * The ranked units the line's amount depends on, highest practice-expense part first: the claim's
   * day's first always-therapy unit (with apply_mppr on), and every unit of this line. Empty when the
   * line is not in the pool.
   */
  ranking: z.array(rankedUnit),
  /** This line's reduced units: each cut is its practice-expense part times the reduction percent. */
  reductions: z.array(z.strictObject({ unit: z.number().int(), rank: z.number().int(), cut_cents: decimalText })),
});

const assistant = z.strictObject({
  name: z.literal('assistant_reduction'),
  before_cents: decimalText,
  after_cents: decimalText,
  /** CQ and CO as present on the line. */
  modifiers_present: z.array(z.string()),
  records: z.array(z.strictObject({ modifier: z.string(), record: recordRef, payment_percent: decimalText })),
});

const sequestration = z.strictObject({
  name: z.literal('sequestration'),
  before_cents: decimalText,
  after_cents: decimalText,
  record: recordRef,
  suspended: z.boolean(),
  reduction_percent: decimalText,
  patient_share_cents: centsText,
  /** The amount less the patient share, floored at zero. */
  payer_share_cents: decimalText,
  cut_cents: decimalText,
});

const contractAdjustment = z.strictObject({
  name: z.literal('contract_adjustment'),
  before_cents: decimalText,
  after_cents: decimalText,
  kind: z.enum(['PERCENT', 'CAP']),
  /** PERCENT: the percentage of the amount paid. */
  percent: decimalText.nullable(),
  /** CAP: the most the line is paid. */
  cap_cents: centsText.nullable(),
});

const roundingStep = z.strictObject({
  rule: rounding,
  origin: z.enum(['rate_record', 'practice_default', 'engine_default']),
  unrounded_cents: decimalText,
  rounded_cents: centsText,
});

const windowStep = z.strictObject({
  source: z.enum(['contract', 'release']).nullable(),
  record: recordRef.nullable(),
  length: z.number().int().nullable(),
  unit: z.enum(['days', 'months']).nullable(),
  measured_from: z.enum(['remittance_date', 'date_of_service']).nullable(),
  from_date: dateText.nullable(),
  ends_on: dateText.nullable(),
  as_of: dateText,
  status: z.enum(['OPEN', 'WINDOW_PASSED', 'NO_WINDOW']),
});

const outcome = z.discriminatedUnion('result', [
  z.strictObject({
    result: z.literal('priced'),
    expected_allowed_cents: centsText,
    expected_unrounded_cents: decimalText,
    /** The review flags reported with the amount (the edits that stand). */
    review_flags: z.array(z.strictObject({ flag: z.literal('NCCI_PTP'), column1_line_no: z.number().int() })),
  }),
  z.strictObject({
    result: z.literal('unpriced'),
    reason: z.enum(UNPRICED_REASONS),
    detail: z.enum([...ENGINE_ERROR_DETAILS, ...NO_PFS_VALUE_DETAILS]).nullable(),
    /** The step that stopped the line. */
    step: z.enum(['input', 'agreement', 'method', 'fee_schedule', 'units', 'mppr', 'assistant_reduction', 'sequestration', 'claim', 'rounding', 'window']),
  }),
]);

export const pricingTraceSchema = z.strictObject({
  format: z.literal(TRACE_FORMAT),
  engine: z.string(),
  release: z.strictObject({ number: z.number().int(), manifest_sha256: z.string() }),
  as_of: z.string(),
  settings,
  claim: claimFacts,
  line: lineFacts,
  agreement: agreement.nullable(),
  terms: terms.nullable(),
  steps: z.strictObject({
    fee_schedule: feeSchedule.nullable(),
    units: units.nullable(),
    per_visit: perVisit.nullable(),
    ncci_ptp: procedureToProcedure.nullable(),
    adjustments: z.array(z.discriminatedUnion('name', [mppr, assistant, sequestration, contractAdjustment])),
    patient_share_cents: centsText.nullable(),
    rounding: roundingStep.nullable(),
    variance_cents: centsText.nullable(),
    window: windowStep.nullable(),
  }),
  outcome,
});

export type PricingTrace = z.infer<typeof pricingTraceSchema>;
export type TraceRecordRef = z.infer<typeof recordRef>;
export type TraceAgreement = z.infer<typeof agreement>;
export type TraceFeeSchedule = z.infer<typeof feeSchedule>;
export type TraceAdjustment = PricingTrace['steps']['adjustments'][number];
export type TraceMppr = z.infer<typeof mppr>;
export type TraceAssistant = z.infer<typeof assistant>;
export type TraceSequestration = z.infer<typeof sequestration>;
export type TraceContractAdjustment = z.infer<typeof contractAdjustment>;
export type TraceTerms = z.infer<typeof terms>;
export type TraceUnits = z.infer<typeof units>;
export type TracePerVisit = z.infer<typeof perVisit>;
export type TraceProcedureToProcedure = z.infer<typeof procedureToProcedure>;
export type TraceWindow = z.infer<typeof windowStep>;
export type TraceOutcome = z.infer<typeof outcome>;
export type TraceStep = Extract<TraceOutcome, { result: 'unpriced' }>['step'];

/** Reads a stored trace (a `priced_line.trace` value); throws a ZodError naming the field that fails. */
export function parseTrace(value: unknown): PricingTrace {
  return pricingTraceSchema.parse(value);
}
