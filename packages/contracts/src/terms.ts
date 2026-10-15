import { type Cents, type Decimal, ROUNDING_RULES, type RoundingRule, centsToString, decimal, parseCents, rate } from '@tp/money';
import { z } from 'zod';

import { isIsoDate } from './dates';

/**
 * Typed contract rate records (PRD 9, Contract rate records; Rules reference, Commercial contract
 * methods and Medicare Advantage; Data dictionary, rate_record). A rate record is a pricing term: its
 * scope (codes, modifier sets, places of service, provider types, an effective window), its method
 * with that method's parameters, the Medicare adjustment flags and the timed-units rule, its rounding
 * rule, the windows of its version, and its evidence (document, page, quote, hash).
 *
 * Each jsonb column has a Zod schema for its stored JSON (snake_case keys as the PRD names them; cents
 * as integer text, percentages as numeric(14,6) text), whose output is the typed value (Cents and
 * Decimal from @tp/money). `rateTermsToJson` writes typed terms back. Amounts never pass through a
 * float.
 *
 * Defaults (PRD 20, "Medicare adjustment flags on commercial contracts: off unless the contract says
 * otherwise"; PRD 20, "Timed-units rule per payer: UNKNOWN until minutes are imported"): a commercial
 * record's flags default to off and its timed-units rule to UNKNOWN. A Medicare Advantage
 * non-contracted line prices as Original Medicare would, with every adjustment on
 * (MA_NONCONTRACTED_TERMS).
 */

/** Rate methods a rate record can carry (PRD section 9). */
export const RATE_METHODS = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED'] as const;
export type RateMethod = (typeof RATE_METHODS)[number];

/** Contract version states in lifecycle order; only `signed_off` versions price lines (PRD section 9). */
export const CONTRACT_VERSION_STATES = ['draft', 'proposed', 'approved', 'signed_off', 'superseded'] as const;
export type ContractVersionState = (typeof CONTRACT_VERSION_STATES)[number];

/** Medicare adjustment flags; each defaults to off on a commercial contract (PRD section 9). */
export const ADJUSTMENT_FLAGS = ['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci'] as const;
export type AdjustmentFlag = (typeof ADJUSTMENT_FLAGS)[number];

/** How a contract counts timed units (PRD section 9, `timed_units_rule`). */
export const TIMED_UNITS_RULES = ['MEDICARE_POOLED', 'PER_CODE', 'UNKNOWN'] as const;
export type TimedUnitsRule = (typeof TIMED_UNITS_RULES)[number];

/** The rounding rules a record can name (`rounding`); null means the contract is silent. */
export { ROUNDING_RULES, type RoundingRule };

/**
 * The fields of a rate record a contract specialist approves one by one (PRD 7, Rate record review:
 * "Specialist approves field by field"). The database's rate_record_fields() lists the same five.
 */
export const RATE_RECORD_FIELDS = ['scope', 'method', 'parameters', 'flags', 'rounding'] as const;
export type RateRecordField = (typeof RATE_RECORD_FIELDS)[number];

/** Which conversion factor a percent-of-Medicare record uses (the rule release's applicability). */
export const CONVERSION_FACTORS = ['non_qualifying_apm', 'qualifying_apm'] as const;
export type ConversionFactor = (typeof CONVERSION_FACTORS)[number];

// ---------------------------------------------------------------------------------------------------
// Building blocks

const isoDate = z.string().refine(isIsoDate, 'must be a calendar date (YYYY-MM-DD)');
const procedureCode = z.string().regex(/^[0-9A-Z]{5}$/, 'must be a five-character HCPCS or CPT code');
const modifier = z.string().regex(/^[0-9A-Z]{2}$/, 'must be a two-character modifier');
const placeOfService = z.string().regex(/^\d{2}$/, 'must be a two-digit place of service');
const providerType = z.string().regex(/^[0-9A-Z_]{1,32}$/, 'must be an upper-case provider type code');
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'must be a lower-case UUID');

/** Cents as integer text in JSON (up to $9,999,999,999.99), Cents once parsed. */
const centsText = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})$/, 'must be whole cents as integer text, at most 12 digits')
  .transform((text): Cents => parseCents(text));

/** A percentage of the Medicare amount as numeric(14,6) text ("110" is 110%), above 0 and at most 1000. */
const percentageText = z
  .string()
  .regex(/^\d{1,4}(\.\d{1,6})?$/, 'must be a percentage with at most six decimal places')
  .transform((text): Decimal => rate(text))
  .refine((value) => value.greaterThan(decimal(0n)) && value.lessThanOrEqualTo(decimal(1000n)), 'must be above 0% and at most 1000%');

function unique<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

// ---------------------------------------------------------------------------------------------------
// scope

/**
 * What a record applies to. Absent lists match anything: no codes means every code (a contract-wide
 * term such as "110% of the Medicare Physician Fee Schedule"), no modifier_sets any modifiers, no
 * places_of_service any place, no provider_types any provider. A modifier set matches a line whose
 * modifiers are exactly that set (order ignored). The optional window [effective_from, effective_to)
 * narrows the version's. A general term and a code exhibit that both match a line are AMBIGUOUS_RATE
 * until the specialist narrows one (no precedence of the specific over the general; ADR 0033).
 */
export const rateScopeSchema = z
  .strictObject({
    codes: z.array(procedureCode).min(1).max(1000).optional(),
    modifier_sets: z.array(z.array(modifier).max(4)).min(1).max(100).optional(),
    places_of_service: z.array(placeOfService).min(1).max(100).optional(),
    provider_types: z.array(providerType).min(1).max(50).optional(),
    effective_from: isoDate.optional(),
    effective_to: isoDate.optional(),
  })
  .superRefine((scope, context) => {
    if (!unique(scope.codes ?? [], (code) => code)) {
      context.addIssue({ code: 'custom', path: ['codes'], message: 'names each code once' });
    }
    const sets = scope.modifier_sets ?? [];
    if (sets.some((set) => !unique(set, (value) => value)) || !unique(sets, (set) => [...set].sort().join(' '))) {
      context.addIssue({ code: 'custom', path: ['modifier_sets'], message: 'names each modifier set once, each modifier once in a set' });
    }
    if (!unique(scope.places_of_service ?? [], (value) => value) || !unique(scope.provider_types ?? [], (value) => value)) {
      context.addIssue({ code: 'custom', path: ['places_of_service'], message: 'names each place of service and provider type once' });
    }
    if (scope.effective_from !== undefined && scope.effective_to !== undefined && scope.effective_to <= scope.effective_from) {
      context.addIssue({ code: 'custom', path: ['effective_to'], message: 'ends after it starts' });
    }
  });
export type RateScope = z.output<typeof rateScopeSchema>;

// ---------------------------------------------------------------------------------------------------
// method and parameters

/** The Medicare fee-schedule year a percent-of-Medicare record uses: the service date's, or a stated year. */
const yearBasis = z.string().regex(/^(CURRENT|LOCKED:(19|20)\d{2})$/, "must be 'CURRENT' or 'LOCKED:<year>'") as z.ZodType<YearBasis>;
export type YearBasis = 'CURRENT' | `LOCKED:${number}`;

/** Whose locality prices the line: the practice's (from its billing ZIP), or one the contract names. */
const localityBasis = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('PRACTICE') }),
  z.strictObject({ kind: z.literal('NAMED'), carrier: z.string().regex(/^\d{5}$/), locality: z.string().regex(/^\d{2}$/) }),
]);

const fixedParameters = z.strictObject({ amount_cents: centsText });
const percentParameters = z.strictObject({
  percentage: percentageText,
  year_basis: yearBasis,
  locality_basis: localityBasis,
  conversion_factor: z.enum(CONVERSION_FACTORS),
});

/** Parameters per method (Rules reference, Commercial contract methods). */
export const METHOD_PARAMETERS = {
  /** Amount per unit for the scope's codes and modifier sets. */
  FIXED_SCHEDULE: fixedParameters,
  /** A percentage of the Medicare fee schedule for a basis year, a locality basis and a conversion factor. */
  PERCENT_OF_MEDICARE: percentParameters,
  /** The lesser of the schedule (a fixed amount or a percentage of Medicare) and the line's billed charge. */
  LESSER_OF: z.strictObject({
    schedule: z.discriminatedUnion('method', [fixedParameters.extend({ method: z.literal('FIXED_SCHEDULE') }), percentParameters.extend({ method: z.literal('PERCENT_OF_MEDICARE') })]),
    charge_basis: z.literal('LINE_CHARGE'),
  }),
  /** A flat amount once per claim per date across the included codes, which are the scope's codes. */
  PER_VISIT: fixedParameters,
  /** Capitation, bundled episodes, undefined case rates: nothing to price with (UNSUPPORTED_METHOD). */
  UNSUPPORTED: z.strictObject({}),
} as const;

export type FixedScheduleParameters = z.output<typeof fixedParameters>;
export type PercentOfMedicareParameters = z.output<typeof percentParameters>;
export type LesserOfParameters = z.output<(typeof METHOD_PARAMETERS)['LESSER_OF']>;
export type PerVisitParameters = z.output<(typeof METHOD_PARAMETERS)['PER_VISIT']>;
export type LocalityBasis = z.output<typeof localityBasis>;

/** A method and its parameters, discriminated by the method. */
export type RateMethodTerms =
  | { readonly method: 'FIXED_SCHEDULE'; readonly parameters: FixedScheduleParameters }
  | { readonly method: 'PERCENT_OF_MEDICARE'; readonly parameters: PercentOfMedicareParameters }
  | { readonly method: 'LESSER_OF'; readonly parameters: LesserOfParameters }
  | { readonly method: 'PER_VISIT'; readonly parameters: PerVisitParameters }
  | { readonly method: 'UNSUPPORTED'; readonly parameters: Readonly<Record<string, never>> };

// ---------------------------------------------------------------------------------------------------
// flags and rounding

export const rateFlagsSchema = z.strictObject({
  apply_mppr: z.boolean(),
  apply_assistant_reduction: z.boolean(),
  apply_sequestration: z.boolean(),
  apply_ncci: z.boolean(),
  timed_units_rule: z.enum(TIMED_UNITS_RULES),
});
export type RateFlags = z.output<typeof rateFlagsSchema>;

/** A commercial contract incorporates no Medicare adjustment unless it says so (PRD 20). */
export const COMMERCIAL_DEFAULT_FLAGS: RateFlags = Object.freeze({
  apply_mppr: false,
  apply_assistant_reduction: false,
  apply_sequestration: false,
  apply_ncci: false,
  timed_units_rule: 'UNKNOWN',
});

/** Original Medicare's rules, every adjustment on (Rules reference, Medicare Advantage; PRD 11, step 1). */
export const MA_NONCONTRACTED_FLAGS: RateFlags = Object.freeze({
  apply_mppr: true,
  apply_assistant_reduction: true,
  apply_sequestration: true,
  apply_ncci: true,
  timed_units_rule: 'MEDICARE_POOLED',
});

/**
 * Flags as a specialist enters them: any flag left out is off and the timed-units rule UNKNOWN, so a
 * commercial record carries a Medicare adjustment only when the contract says so.
 */
export const rateFlagsInputSchema = z
  .strictObject({
    apply_mppr: z.boolean().default(false),
    apply_assistant_reduction: z.boolean().default(false),
    apply_sequestration: z.boolean().default(false),
    apply_ncci: z.boolean().default(false),
    timed_units_rule: z.enum(TIMED_UNITS_RULES).default('UNKNOWN'),
  })
  .default({ ...COMMERCIAL_DEFAULT_FLAGS });

/** Null where the contract is silent: the practice's default rounding applies (PRD 11, Inputs). */
export const roundingSchema = z.enum(ROUNDING_RULES).nullable();

// ---------------------------------------------------------------------------------------------------
// The terms together

function termsSchema<M extends RateMethod>(method: M, flags: z.ZodType<RateFlags, unknown>) {
  return z.strictObject({
    scope: rateScopeSchema,
    method: z.literal(method),
    parameters: METHOD_PARAMETERS[method],
    flags,
    rounding: roundingSchema,
  });
}

function termsUnion(flags: z.ZodType<RateFlags, unknown>) {
  return z.discriminatedUnion('method', [
    termsSchema('FIXED_SCHEDULE', flags),
    termsSchema('PERCENT_OF_MEDICARE', flags),
    termsSchema('LESSER_OF', flags),
    termsSchema('PER_VISIT', flags),
    termsSchema('UNSUPPORTED', flags),
  ]);
}

/** A rate record's terms as stored: every flag present. */
export const rateTermsSchema = termsUnion(rateFlagsSchema);

/** A rate record's terms as entered: flags default off (PRD 20); rounding defaults to silent. */
export const rateTermsInputSchema = z.preprocess(
  (value) => (typeof value === 'object' && value !== null && !('rounding' in value) ? { ...value, rounding: null } : value),
  termsUnion(rateFlagsInputSchema as z.ZodType<RateFlags, unknown>),
);

/** The pricing terms of one record, typed (cents as Cents, percentages as Decimal). */
export type RateRecordTerms = { readonly scope: RateScope; readonly flags: RateFlags; readonly rounding: RoundingRule | null } & RateMethodTerms;

/** Parses stored or entered terms; throws a ZodError naming the field that fails. */
export function parseRateTerms(value: unknown, entered = false): RateRecordTerms {
  return (entered ? rateTermsInputSchema : rateTermsSchema).parse(value);
}

type Json = string | boolean | null | readonly Json[] | { readonly [key: string]: Json };

function percentJson(parameters: PercentOfMedicareParameters): Record<string, Json> {
  return {
    percentage: parameters.percentage.toString(),
    year_basis: parameters.year_basis,
    locality_basis: { ...parameters.locality_basis },
    conversion_factor: parameters.conversion_factor,
  };
}

function parametersJson(terms: RateMethodTerms): Record<string, Json> {
  switch (terms.method) {
    case 'FIXED_SCHEDULE':
    case 'PER_VISIT':
      return { amount_cents: centsToString(terms.parameters.amount_cents) };
    case 'PERCENT_OF_MEDICARE':
      return percentJson(terms.parameters);
    case 'LESSER_OF': {
      const { schedule } = terms.parameters;
      return {
        schedule: schedule.method === 'FIXED_SCHEDULE' ? { method: schedule.method, amount_cents: centsToString(schedule.amount_cents) } : { method: schedule.method, ...percentJson(schedule) },
        charge_basis: terms.parameters.charge_basis,
      };
    }
    case 'UNSUPPORTED':
      return {};
  }
}

/** The terms as the jsonb columns store them: scope, method, parameters, flags and rounding. */
export function rateTermsToJson(terms: RateRecordTerms): {
  readonly scope: Record<string, Json>;
  readonly method: RateMethod;
  readonly parameters: Record<string, Json>;
  readonly flags: Record<string, Json>;
  readonly rounding: RoundingRule | null;
} {
  const scope: Record<string, Json> = {};
  if (terms.scope.codes !== undefined) {
    scope.codes = [...terms.scope.codes];
  }
  if (terms.scope.modifier_sets !== undefined) {
    scope.modifier_sets = terms.scope.modifier_sets.map((set) => [...set]);
  }
  if (terms.scope.places_of_service !== undefined) {
    scope.places_of_service = [...terms.scope.places_of_service];
  }
  if (terms.scope.provider_types !== undefined) {
    scope.provider_types = [...terms.scope.provider_types];
  }
  if (terms.scope.effective_from !== undefined) {
    scope.effective_from = terms.scope.effective_from;
  }
  if (terms.scope.effective_to !== undefined) {
    scope.effective_to = terms.scope.effective_to;
  }
  return { scope, method: terms.method, parameters: parametersJson(terms), flags: { ...terms.flags }, rounding: terms.rounding };
}

/** Terms that apply to every line of an agreement, so they carry no scope. */
export interface AgreementTerms {
  readonly method: 'PERCENT_OF_MEDICARE';
  readonly parameters: PercentOfMedicareParameters;
  readonly flags: RateFlags;
  readonly rounding: RoundingRule | null;
}

/**
 * The terms a Medicare Advantage non-contracted line prices under: as Original Medicare would, 100%
 * of the current year's fee schedule for the practice's locality with the non-qualifying conversion
 * factor, every Medicare adjustment on, and the practice's default rounding (PRD 11, step 1; Rules
 * reference, Medicare Advantage; 42 CFR 422.214), for every code, modifier and place of service.
 */
export const MA_NONCONTRACTED_TERMS: AgreementTerms = Object.freeze({
  method: 'PERCENT_OF_MEDICARE' as const,
  parameters: Object.freeze({ percentage: decimal(100n), year_basis: 'CURRENT' as const, locality_basis: Object.freeze({ kind: 'PRACTICE' as const }), conversion_factor: 'non_qualifying_apm' as const }),
  flags: MA_NONCONTRACTED_FLAGS,
  rounding: null,
});

// ---------------------------------------------------------------------------------------------------
// evidence and windows

/** The page a record is abstracted from: its document, page (from 1), the quoted text and the page's hash. */
export const citationSchema = z.strictObject({
  document_id: uuid,
  page: z.number().int().min(1).max(999_999),
  quote: z
    .string()
    .max(2000)
    .refine((text) => text.trim() !== '', 'must quote the page'),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'must be the SHA-256 of the page text, in hex'),
});
export type Citation = z.output<typeof citationSchema>;

const fieldApproval = z.strictObject({ by: uuid, at: z.string().min(1) });
export type FieldApproval = z.output<typeof fieldApproval>;

/**
 * The evidence column: empty while a record is being abstracted, else its citation; and the field
 * approvals the specialist has given (`approved_fields`).
 */
export const evidenceSchema = z
  .object({
    approved_fields: z.partialRecord(z.enum(RATE_RECORD_FIELDS), fieldApproval).optional(),
  })
  .catchall(z.unknown())
  .transform((value, context) => {
    const { approved_fields: approvals, ...rest } = value;
    if (Object.keys(rest).length === 0) {
      return { citation: null, approvals: approvals ?? {} };
    }
    const citation = citationSchema.safeParse(rest);
    if (!citation.success) {
      for (const issue of citation.error.issues) {
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
      return z.NEVER;
    }
    return { citation: citation.data, approvals: approvals ?? {} };
  });
export type Evidence = z.output<typeof evidenceSchema>;

/** A version's windows (Data dictionary, contract_version): null where the contract is silent. */
export const appealLevelsSchema = z
  .array(z.strictObject({ level: z.number().int().min(1).max(10), days: z.number().int().min(1).max(3650) }))
  .max(10)
  .refine((levels) => levels.every((entry, index) => entry.level === index + 1), 'numbers its levels 1, 2, 3 in order');

export interface RateWindows {
  readonly timely_filing_days: number | null;
  readonly dispute_window_days: number | null;
  readonly appeal_levels: readonly { readonly level: number; readonly days: number }[];
}

export const rateWindowsSchema = z.strictObject({
  timely_filing_days: z.number().int().min(1).max(3650).nullable(),
  dispute_window_days: z.number().int().min(1).max(3650).nullable(),
  appeal_levels: appealLevelsSchema,
});
