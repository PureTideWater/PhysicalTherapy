import type { RoundingRule } from '@tp/money';
import type { EngineErrorDetail, NoPfsValueDetail, PricingTrace, UnpricedReason } from '@tp/pricing';

import type { CitedMethod } from '../format';

/**
 * The one vocabulary of a calculation in words (combined audit #38; docs/adr/0072): every code the engine's trace
 * writes that the words name, in words. The line trace page, the packet builder and review, and the payer's PDF and
 * CSV all read these tables, so one code reads one way on every surface. A code of a closed list without its words
 * is refused, never printed as a code or lower-cased into words no scan can tell from prose (ExplainWordsError, the
 * rule the payer's copy kept as PayerCopyWordsError): the tables typed by an engine enum fail `tsc` when a value is
 * added without its words, and the string-typed fields (a method, a timed-units rule, a conversion factor's
 * applicability, an observed basis, a claim status) are checked when read.
 *
 * No entry holds a digit except where it names one of CODES, which the words print as a code segment beside its
 * words (AMT B6, ZIP+4), so no number can hide in the words (words.test.ts). The meanings and remedies of the closed
 * list of unpriced reasons are docs/product/unpriced-reasons.md's, copied word for word and quoted as they stand; a
 * test holds them to the document. Pure and browser-safe.
 */

/** The codes the words name beside their words, each printed as a code segment (set in mono). */
export const CODES = ['AMT B6', 'ZIP+4', 'CQ', 'CO', 'MPPR', 'NCCI', 'MUE', 'RVU', 'GPCI', 'APM', 'CMS'] as const;
export type WordsCode = (typeof CODES)[number];

/**
 * The codes the payer's words may print (finding M3): the ZIP+4, the fee schedule's relative value units and
 * geographic practice cost indices, the therapy-assistant modifiers, the alternative payment model and the Centers
 * for Medicare & Medicaid Services, each written out beside it or at its first use.
 */
export const PAYER_CODES = ['ZIP+4', 'RVU', 'GPCI', 'CQ', 'CO', 'APM', 'CMS'] as const satisfies readonly WordsCode[];

/**
 * A code of a closed list the words have no words for. `list` names the list ("timed-units rule"), never the code:
 * the surfaces say "{list} has no words" and the payer's copy is not printed.
 */
export class ExplainWordsError extends TypeError {
  override readonly name = 'ExplainWordsError';

  constructor(readonly list: string) {
    super(`the words have no entry for a ${list}`);
  }
}

/** A code of a closed list in its words; a code without them is refused. */
export function wordsOf(table: Readonly<Record<string, string>>, code: string, list: string): string {
  const words = Object.hasOwn(table, code) ? table[code] : undefined;
  if (words === undefined) {
    throw new ExplainWordsError(list);
  }
  return words;
}

// ---------------------------------------------------------------------------------------------------
// The packet's calculation summary (the payer's PDF and CSV print these; apps/worker/src/packets/words.ts re-exports them)

/** The calculation's methods in words. */
export const METHOD_TEXT: Readonly<Record<CitedMethod, string>> = {
  FIXED_SCHEDULE: 'Fixed schedule',
  PERCENT_OF_MEDICARE: 'Percent of Medicare',
  LESSER_OF: 'Lesser of',
  PER_VISIT: 'Per visit',
  MA_NONCONTRACTED: 'Medicare Advantage, non-contracted',
};

/** A tp-packet/2 calculation summary's steps (lineCalculation) in words. */
export const STEP_TEXT: Readonly<Record<string, string>> = {
  unit: 'per unit',
  visit: 'per visit',
  schedule: 'schedule',
  charge: 'charge',
  base: 'base',
  mppr: 'MPPR',
  assistant_reduction: 'assistant reduction',
  sequestration: 'sequestration',
  contract_adjustment: 'contract adjustment',
};

/** The rounding rules in words. */
export const ROUNDING_TEXT: Readonly<Record<RoundingRule, string>> = {
  HALF_UP_CENT: 'half up to the cent',
  HALF_EVEN_CENT: 'half even to the cent',
  TRUNCATE: 'truncated to the cent',
};

// ---------------------------------------------------------------------------------------------------
// The trace's codes

type RoundingOrigin = NonNullable<PricingTrace['steps']['rounding']>['origin'];

/** Where the one rounding's rule came from, on a contract line, for the practice's own readers. */
export const ROUNDING_ORIGIN_TEXT: Readonly<Record<RoundingOrigin, string>> = {
  rate_record: 'the rate record’s rule',
  practice_default: 'the practice’s default, as the rate record names no rule',
  engine_default: 'the default rule, as neither the rate record nor the practice names one',
};

/** The same, as the payer reads it: the contract, which the payer holds, in place of the rate record. */
export const PAYER_ROUNDING_ORIGIN_TEXT: Readonly<Record<RoundingOrigin, string>> = {
  rate_record: 'the contract’s rule',
  practice_default: 'the practice’s default, as the contract names no rule',
  engine_default: 'the default rule, as neither the contract nor the practice names one',
};

/**
 * The same on a Medicare Advantage non-contracted line, which has no contract or rate record to name a rule: a trace
 * that says it rounded under a rate record's rule is refused (./line.ts), never worded as one.
 */
export const MEDICARE_ROUNDING_ORIGIN_TEXT: Readonly<Record<Exclude<RoundingOrigin, 'rate_record'>, string>> = {
  practice_default: 'the practice’s default rule',
  engine_default: 'the default rule, as the practice names none',
};

type Setting = NonNullable<NonNullable<PricingTrace['steps']['fee_schedule']>['setting']>;

/** The fee schedule's settings. */
export const SETTING_TEXT: Readonly<Record<Setting, string>> = { facility: 'facility', non_facility: 'non-facility' };

/** A conversion factor's applicability (a string the terms name), written out. */
export const APPLICABILITY_TEXT: Readonly<Record<string, string>> = {
  non_qualifying_apm: 'for clinicians who are not qualifying alternative payment model (APM) participants',
  qualifying_apm: 'for qualifying alternative payment model (APM) participants',
};

/** A contract's timed-units rule (a string the terms name), on a contract line. UNKNOWN stops the line. */
export const TIMED_UNITS_TEXT: Readonly<Record<string, string>> = {
  MEDICARE_POOLED: 'Units as billed; the contract follows Medicare’s pooled timed-units rule.',
  PER_CODE: 'Units as billed; timed units are counted per code.',
  UNKNOWN: 'The timed-units rule is not known for the payer.',
};

/** The timed-units rule on a Medicare Advantage non-contracted line: Medicare's own, never a contract's. */
export const MEDICARE_TIMED_UNITS_TEXT: Readonly<Record<string, string>> = {
  MEDICARE_POOLED: 'Units as billed; Medicare’s pooled timed-units rule applies.',
  PER_CODE: 'Units as billed; timed units are counted per code.',
  UNKNOWN: 'The timed-units rule is not known for the payer.',
};

type FlagName = Exclude<keyof NonNullable<PricingTrace['terms']>['flags'], 'timed_units_rule'>;

/** The adjustments a flag turns on, by flag. */
export const FLAG_TEXT: Readonly<Record<FlagName, string>> = {
  apply_mppr: 'the multiple procedure payment reduction',
  apply_assistant_reduction: 'the assistant reduction',
  apply_sequestration: 'sequestration',
  apply_ncci: 'National Correct Coding Initiative (NCCI) edits',
};

/** The adjustments by the name the trace gives them, as the summary names each. */
export const ADJUSTMENT_TEXT: Readonly<Record<PricingTrace['steps']['adjustments'][number]['name'], string>> = {
  mppr: 'the multiple procedure payment reduction',
  assistant_reduction: 'the assistant reduction',
  sequestration: 'sequestration',
  contract_adjustment: 'the contract’s adjustment',
};

/** How the observed allowed amount was read (a string of the line facts), for the practice's own readers. */
export const OBSERVED_BASIS_TEXT: Readonly<Record<string, string>> = {
  amt_b6: 'the allowed amount the payer states for the line (AMT B6)',
  paid_plus_pr: 'paid plus patient responsibility',
};

/** The same, as the payer reads it: no segment code. */
export const PAYER_OBSERVED_BASIS_TEXT: Readonly<Record<string, string>> = {
  amt_b6: 'the allowed amount the remittance states',
  paid_plus_pr: 'the amount paid plus the patient’s responsibility',
};

/** The claim statuses the engine leaves to a later release (SECONDARY_PAYER), in words (finding m3). */
export const SECONDARY_STATUS_TEXT: Readonly<Record<string, string>> = {
  '2': 'processed as secondary',
  '3': 'processed as tertiary',
  '20': 'processed as secondary and forwarded to another payer',
  '21': 'processed as tertiary and forwarded to another payer',
};

type AgreementOutcome = NonNullable<PricingTrace['agreement']>['outcome'];

/** The agreement step's stops that are not a reason of the closed list (whose meaning is quoted instead). */
export const AGREEMENT_FAILURE_TEXT: Readonly<Record<Extract<AgreementOutcome, 'RESOLUTION_FAILED'>, string>> = {
  RESOLUTION_FAILED: 'The plan’s mapping could not be resolved to one agreement.',
};

/** Where a line stopped (the trace's outcome step). */
export const STOP_STEP_TEXT: Readonly<Record<Extract<PricingTrace['outcome'], { result: 'unpriced' }>['step'], string>> = {
  input: 'reading the line',
  agreement: 'the agreement',
  method: 'the method',
  fee_schedule: 'the fee schedule',
  units: 'the units',
  mppr: 'the multiple procedure payment reduction',
  assistant_reduction: 'the assistant reduction',
  sequestration: 'sequestration',
  claim: 'the claim’s status',
  rounding: 'rounding',
  window: 'the dispute window',
};

type WindowStep = NonNullable<PricingTrace['steps']['window']>;

/** What a dispute window is measured from: the trace's remittance_date is the payment date (BPR16; ADR 0061). */
export const WINDOW_START_TEXT: Readonly<Record<NonNullable<WindowStep['measured_from']>, string>> = {
  remittance_date: 'payment date',
  date_of_service: 'service date',
};

export const WINDOW_SOURCE_TEXT: Readonly<Record<NonNullable<WindowStep['source']>, string>> = {
  contract: 'the contract',
  release: 'the release’s record',
};

export const WINDOW_STATUS_TEXT: Readonly<Record<Exclude<WindowStep['status'], 'NO_WINDOW'>, string>> = {
  OPEN: 'open',
  WINDOW_PASSED: 'passed',
};

/** A window's unit, one and more than one. */
export const WINDOW_UNIT_TEXT: Readonly<Record<NonNullable<WindowStep['unit']>, string>> = { days: 'days', months: 'months' };
export const WINDOW_UNIT_ONE_TEXT: Readonly<Record<NonNullable<WindowStep['unit']>, string>> = { days: 'day', months: 'month' };

/** Why a line is ENGINE_ERROR or NO_PFS_VALUE, for a line ("on the service date"; lib/screening keeps a row's words). */
export const DETAIL_TEXT: Readonly<Record<EngineErrorDetail | NoPfsValueDetail, string>> = {
  agreement_unresolved: 'The agreement could not be resolved to one mapping, version and rate record',
  version_not_signed_off: 'The contract version the mapping names is not signed off',
  mppr_needs_fee_schedule: 'The multiple procedure payment reduction is on for a method with no fee-schedule practice-expense part to reduce',
  locality_basis_not_in_phase_one: 'The rate record names its own locality, which the engine does not price yet',
  place_of_service_unmapped: 'The line’s place of service is not in the practice’s facility settings',
  no_locality: 'The practice ZIP has no Medicare locality on the service date',
  no_gpci: 'No geographic practice cost index is in force for the locality in the basis year',
  no_conversion_factor: 'No conversion factor of the kind the terms name is in force in the basis year',
  units_not_whole: 'The units are not a whole number of at least one',
  units_above_limit: 'More units than one line may carry',
  locality_needs_zip_plus_four: 'The practice ZIP spans more than one Medicare locality and the settings give no ZIP+4',
  no_locality_plus_four: 'The release has no ZIP+4 list of the practice ZIP in force on the service date',
  zip_plus_four_not_in_locality_map: 'Medicare’s ZIP+4 list in force on the service date has no range holding the practice’s ZIP+4',
  no_mppr_rate: 'The code has no reduction share of its own and no general practice-expense reduction is in force on the service date',
  no_assistant_record: 'No assistant reduction record is in force on the service date for the modifier',
  assistant_percentages_differ: 'CQ and CO are both on the line with different percentages',
  no_sequestration_record: 'No sequestration record is in force on the service date',
  claim_status_not_priced: 'The claim’s status has no pricing rule yet',
  claim_status_unknown: 'The claim’s status is not one the remittance format lists',
  reversed_and_corrected: 'The claim is reversed and a correction supersedes it, so the correction is priced instead',
  release_records_overlap: 'Two records of one rule are in force on one date in the release',
  invalid_line_facts: 'The line facts do not have the shape the engine reads',
  duplicate_line_no: 'Two lines of the claim share a line number',
  invalid_settings: 'The practice settings do not have the shape the engine reads',
  unexpected: 'Something else went wrong; an operator looks at the record',
  no_rvu_in_basis_year: 'No relative value for the code in the basis year',
  practice_expense_not_available: 'No practice-expense value for the code in the setting',
};

// ---------------------------------------------------------------------------------------------------
// The closed list of unpriced reasons, word for word (docs/product/unpriced-reasons.md, columns 2 and 3)

/** Each reason's meaning, quoted as the document has it. */
export const UNPRICED_MEANING: Readonly<Record<UnpricedReason, string>> = {
  NO_MAPPING: 'The payer and plan have no mapping on the service date',
  NO_AGREEMENT: 'Mapped as out of network or no agreement',
  AMBIGUOUS_RATE: 'More than one rate record matches',
  NO_RATE_FOR_CODE: 'The agreement has no term for the code',
  NO_PFS_VALUE: 'No RVU for the code in the basis year',
  UNSUPPORTED_METHOD: 'Capitation or undefined case rate',
  SECONDARY_PAYER: 'Claim status 2 or 3',
  MUE_EXCEEDED: 'Units above the MUE with NCCI on',
  UNITS_RULE_UNKNOWN: 'Timed-units rule unknown for the payer',
  DATE_OUTSIDE_VERSIONS: 'No signed-off version covers the service date',
  REVERSED_CLAIM: 'The claim was reversed and not corrected',
  ENGINE_ERROR: 'Unexpected input',
};

/** Each reason's remedy, quoted as the document has it. */
export const UNPRICED_REMEDY: Readonly<Record<UnpricedReason, string>> = {
  NO_MAPPING: 'Map the plan',
  NO_AGREEMENT: 'None; anomaly screening only',
  AMBIGUOUS_RATE: 'Specialist resolves scope',
  NO_RATE_FOR_CODE: 'Obtain the exhibit page or confirm exclusion',
  NO_PFS_VALUE: 'Check the code and year; some codes are carrier-priced',
  UNSUPPORTED_METHOD: 'None; reported',
  SECONDARY_PAYER: 'Deferred release',
  MUE_EXCEEDED: 'Review the claim',
  UNITS_RULE_UNKNOWN: 'Confirm with the contract or import minutes',
  DATE_OUTSIDE_VERSIONS: 'Obtain the amendment or confirm the window',
  REVERSED_CLAIM: 'None',
  ENGINE_ERROR: 'Operator alert',
};

/**
 * Every table, by name, for the words version (../words-version.ts): a change to any entry changes WORDS_VERSION, and
 * version.test.ts fails until the literal in ./version.ts is written again.
 */
export const WORD_TABLES = {
  CODES,
  PAYER_CODES,
  METHOD_TEXT,
  STEP_TEXT,
  ROUNDING_TEXT,
  ROUNDING_ORIGIN_TEXT,
  PAYER_ROUNDING_ORIGIN_TEXT,
  MEDICARE_ROUNDING_ORIGIN_TEXT,
  SETTING_TEXT,
  APPLICABILITY_TEXT,
  TIMED_UNITS_TEXT,
  MEDICARE_TIMED_UNITS_TEXT,
  FLAG_TEXT,
  ADJUSTMENT_TEXT,
  OBSERVED_BASIS_TEXT,
  PAYER_OBSERVED_BASIS_TEXT,
  SECONDARY_STATUS_TEXT,
  AGREEMENT_FAILURE_TEXT,
  STOP_STEP_TEXT,
  WINDOW_START_TEXT,
  WINDOW_SOURCE_TEXT,
  WINDOW_STATUS_TEXT,
  WINDOW_UNIT_TEXT,
  WINDOW_UNIT_ONE_TEXT,
  DETAIL_TEXT,
  UNPRICED_MEANING,
  UNPRICED_REMEDY,
} as const;
