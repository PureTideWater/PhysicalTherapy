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
export const TRACE_FORMAT = 'tp-pricing-trace/1';

/** The engine's version, recorded in every trace and in `pricing_run.engine_version`. */
export const ENGINE_VERSION = 'phase-one/1';

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
  /** Set for PERCENT_OF_MEDICARE terms. */
  percent_of_medicare: z
    .strictObject({
      percentage: decimalText,
      year_basis: z.string(),
      locality_basis: z.union([z.strictObject({ kind: z.literal('PRACTICE') }), z.strictObject({ kind: z.literal('NAMED'), carrier: z.string(), locality: z.string() })]),
      conversion_factor: z.string(),
    })
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
  locality: z.strictObject({ record: recordRef, carrier: z.string(), locality: z.string() }).nullable(),
  gpci: z.strictObject({ record: recordRef, work_gpci: decimalText, pe_gpci: decimalText, mp_gpci: decimalText }).nullable(),
  conversion_factor: z.strictObject({ record: recordRef, applicability: z.string(), value: decimalText }).nullable(),
  percentage: decimalText,
  /** Per unit, at the record's percentage: the work, practice-expense and malpractice parts and their sum. */
  unit_cents: z.strictObject({ work: decimalText, pe: decimalText, mp: decimalText, total: decimalText }).nullable(),
});

const units = z.strictObject({
  units: decimalText,
  /** Recorded only: units are taken as billed in phase one (PRD 2 point 6). */
  timed_units_rule: z.string(),
  base_cents: decimalText,
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
  /** Every always-therapy unit of the claim's day, with apply_mppr on, highest practice-expense part first. */
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
  z.strictObject({ result: z.literal('priced'), expected_allowed_cents: centsText, expected_unrounded_cents: decimalText }),
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
    adjustments: z.array(z.discriminatedUnion('name', [mppr, assistant, sequestration])),
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
export type TraceWindow = z.infer<typeof windowStep>;
export type TraceOutcome = z.infer<typeof outcome>;
export type TraceStep = Extract<TraceOutcome, { result: 'unpriced' }>['step'];

/** Reads a stored trace (a `priced_line.trace` value); throws a ZodError naming the field that fails. */
export function parseTrace(value: unknown): PricingTrace {
  return pricingTraceSchema.parse(value);
}
