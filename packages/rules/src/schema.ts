import { decimal } from '@tp/money';
import { z } from 'zod';

/**
 * The rule record schema (PRD section 9; Data dictionary, Global content). Every global record is
 * one JSON object with the same envelope: record_type, key, value, effective_from, effective_to,
 * source, verification, quotes and notes. Each record type has its own key and value shape, with
 * ranges on every numeric field. Money is integer cents serialized as strings; rates, relative
 * values and indices are decimal strings; counts (days, units) are JSON integers.
 */

/**
 * Global rule record types: the fifteen of the data dictionary's `rule_record.record_type`, plus
 * `denial_category`, the denial-classification lookup the rules reference says is "maintained as a
 * rule record" (docs/adr/0008-rule-records-and-releases.md), and `locality_map_plus_four`, the ZIP+4
 * file's localities of a ZIP that spans more than one (the founder's answer to PR 6b's Q3 (a), 2026-10-21;
 * docs/adr/0064). The database's record-type CHECK takes the new type in PR 6b-2's migration, the
 * first that loads a release holding it.
 */
export const RULE_RECORD_TYPES = [
  'pfs_rvu',
  'pfs_gpci',
  'conversion_factor',
  'mppr_rate',
  'therapy_threshold',
  'assistant_modifier',
  'sequestration',
  'ncci_ptp',
  'ncci_mue',
  'carc',
  'rarc',
  'claim_status_code',
  'state_prompt_pay',
  'dispute_window',
  'locality_map',
  'locality_map_plus_four',
  'denial_category',
] as const;
export type RuleRecordType = (typeof RULE_RECORD_TYPES)[number];

export function isRuleRecordType(value: string): value is RuleRecordType {
  return RULE_RECORD_TYPES.some((type) => type === value);
}

/**
 * Verification levels (PRD section 9): L1 script-checked, L2 read against the source by a person,
 * L3 confirmed by a reimbursement specialist.
 */
export const VERIFICATION_LEVELS = ['L1', 'L2', 'L3'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

/** Denial categories (Rules reference, Code lists). */
export const DENIAL_CATEGORIES = [
  'authorization',
  'visit_limit',
  'modifier',
  'medical_necessity',
  'timely_filing',
  'bundling',
  'other',
] as const;

/** CMS quarterly releases of the physician fee schedule files: A January, B April, C July, D October. */
export const CMS_QUARTERS = ['A', 'B', 'C', 'D'] as const;
export type CmsQuarterLetter = (typeof CMS_QUARTERS)[number];

/** The CMS quarter a date falls in (January to March is A). */
export function cmsQuarterOf(isoDateText: string): CmsQuarterLetter {
  const month = Number.parseInt(isoDateText.slice(5, 7), 10);
  return CMS_QUARTERS[Math.floor((month - 1) / 3)] ?? 'A';
}

// ---------------------------------------------------------------------------------------------
// Quarterly and undated files (audit #30, docs/adr/0071)

/**
 * Where each record type's window comes from, in one table that names every type, so a new type cannot pass the
 * quarter (C1, C17), one-file (C16) and closed-by-source rules unclassified:
 * - quarterly: a CMS file with no dates of its own that changes every quarter, imported for a window inside one;
 * - annual: the MPPR list, a calendar year's file with no dates of its own (its general reduction is hand-typed);
 * - source_dated: a file whose rows carry their own dates (NCCI PTP, the X12 code lists, the conversion-factor CSV);
 * - hand_typed: typed by a person from a document, with a second transcription.
 */
export type RecordDating = 'quarterly' | 'annual' | 'source_dated' | 'hand_typed';
export const RECORD_DATING = {
  pfs_rvu: 'quarterly',
  pfs_gpci: 'quarterly',
  conversion_factor: 'source_dated',
  mppr_rate: 'annual',
  therapy_threshold: 'hand_typed',
  assistant_modifier: 'hand_typed',
  sequestration: 'hand_typed',
  ncci_ptp: 'source_dated',
  ncci_mue: 'quarterly',
  carc: 'source_dated',
  rarc: 'source_dated',
  claim_status_code: 'source_dated',
  state_prompt_pay: 'hand_typed',
  dispute_window: 'hand_typed',
  locality_map: 'quarterly',
  locality_map_plus_four: 'quarterly',
  denial_category: 'hand_typed',
} as const satisfies Record<RuleRecordType, RecordDating>;
/** The record types RECORD_DATING classifies as `dating`. */
export type RecordTypeDated<D extends RecordDating> = { [T in RuleRecordType]: (typeof RECORD_DATING)[T] extends D ? T : never }[RuleRecordType];

/** The record types of one dating, in RULE_RECORD_TYPES order. */
export function recordTypesDated<D extends RecordDating>(dating: D): readonly RecordTypeDated<D>[] {
  return RULE_RECORD_TYPES.filter((type): type is RecordTypeDated<D> => RECORD_DATING[type] === dating);
}

/** Files with no dates of their own that change every CMS quarter: imported for a window inside one quarter (audit #30, ADR 0071). */
export const QUARTERLY_RECORD_TYPES = recordTypesDated('quarterly');
export type QuarterlyRecordType = RecordTypeDated<'quarterly'>;
/** Files with no dates of their own: the quarterly ones and the annual MPPR list. A window read from one is never open. */
export const UNDATED_RECORD_TYPES: readonly RecordTypeDated<'quarterly' | 'annual'>[] = [...QUARTERLY_RECORD_TYPES, ...recordTypesDated('annual')];

/** A CMS quarter of a year: quarter 1 is January to March. */
export interface CmsQuarter {
  readonly year: number;
  readonly quarter: 1 | 2 | 3 | 4;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The quarter's first and last days. */
export function cmsQuarterWindow(q: CmsQuarter): { readonly from: string; readonly to: string } {
  const year = String(q.year).padStart(4, '0');
  const lastMonth = q.quarter * 3;
  // Day 0 of the month after the quarter is the quarter's last day.
  const lastDay = new Date(Date.UTC(q.year, lastMonth, 0)).getUTCDate();
  return { from: `${year}-${twoDigits(lastMonth - 2)}-01`, to: `${year}-${twoDigits(lastMonth)}-${twoDigits(lastDay)}` };
}

/** The quarter a date falls in. */
export function cmsQuarterOfDate(date: string): CmsQuarter {
  const month = Number.parseInt(date.slice(5, 7), 10);
  return { year: Number.parseInt(date.slice(0, 4), 10), quarter: (Math.floor((month - 1) / 3) + 1) as CmsQuarter['quarter'] };
}

function sameQuarter(a: CmsQuarter, b: CmsQuarter): boolean {
  return a.year === b.year && a.quarter === b.quarter;
}

/** The quarter holding both ends of [from, to] (a whole quarter, or a correction's part of one); null when open or across two quarters. */
export function windowQuarter(from: string, to: string | null): CmsQuarter | null {
  if (to === null || to < from) {
    return null;
  }
  const quarter = cmsQuarterOfDate(from);
  return sameQuarter(quarter, cmsQuarterOfDate(to)) ? quarter : null;
}

/** The quarter when [from, to] is exactly one CMS quarter; null otherwise (an open window included). */
export function exactCmsQuarter(from: string, to: string | null): CmsQuarter | null {
  const quarter = windowQuarter(from, to);
  if (quarter === null) {
    return null;
  }
  const whole = cmsQuarterWindow(quarter);
  return whole.from === from && whole.to === to ? quarter : null;
}

/** Whether [from, to] has an end and lies inside from's calendar year (the per-code MPPR list's rule). */
export function insideOneYear(from: string, to: string | null): boolean {
  return to !== null && to >= from && to.slice(0, 4) === from.slice(0, 4);
}

/**
 * The windows a quarterly import may take for a stated quarter: from on or after the quarter's first day (equal to
 * `effective` when the file states a day), to on or before its last day, from <= to. `missing` when either end is not
 * given; `outside` when the window leaves the quarter or is open; `not_effective_day` when it starts on a day other
 * than the one the file states.
 */
export function quarterWindowProblem(
  stated: CmsQuarter,
  effective: string | null,
  from: string | undefined,
  to: string | null | undefined,
): 'missing' | 'outside' | 'not_effective_day' | null {
  if (from === undefined || to === undefined) {
    return 'missing';
  }
  const whole = cmsQuarterWindow(stated);
  if (to === null || from < whole.from || to > whole.to || from > to) {
    return 'outside';
  }
  return effective !== null && from !== effective ? 'not_effective_day' : null;
}

/** "2026-Q4", the form the screening already shows (apps/worker/src/screening/format.ts). */
export function quarterLabel(q: CmsQuarter): string {
  return `${String(q.year)}-Q${String(q.quarter)}`;
}

const QUARTER_MONTHS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'] as const;

/**
 * "Q4 2026 (Oct–Dec)", the form a person reads (UX baseline UX-167): the console, the content calendar's issues, the
 * Releases page and Coverage. quarterLabel's "2026-Q4" stays the machine form (data attributes, commands, COVERAGE.md).
 */
export function quarterName(q: CmsQuarter): string {
  return `Q${String(q.quarter)} ${String(q.year)} (${QUARTER_MONTHS[q.quarter - 1] ?? ''})`;
}

/** quarterName of a quarterLabel ("2026-Q4" → "Q4 2026 (Oct–Dec)"); any other text is returned as it is. */
export function quarterNameOf(label: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(label);
  return match === null ? label : quarterName({ year: Number.parseInt(match[1] ?? '', 10), quarter: Number.parseInt(match[2] ?? '', 10) as CmsQuarter['quarter'] });
}

// ---------------------------------------------------------------------------------------------
// Primitive fields

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD (no 2026-02-30), from 1900 on. */
export function isIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) {
    return false;
  }
  const [year, month, day] = [match[1], match[2], match[3]].map((part) => Number.parseInt(part ?? '', 10)) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isoDate = z.string().refine(isIsoDate, 'must be a calendar date written YYYY-MM-DD');

const SHA256 = /^[0-9a-f]{64}$/;
export const sha256Hex = z.string().regex(SHA256, 'must be a lowercase hex SHA-256 digest');

/** A repository-relative path with forward slashes that cannot leave the repository. */
export function isRepositoryPath(text: string): boolean {
  if (text === '' || text.startsWith('/') || text.includes('\\') || text.includes('\0')) {
    return false;
  }
  return text.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

const repositoryPath = z.string().refine(isRepositoryPath, 'must be a repository-relative path that stays inside the repository');

const DECIMAL_TEXT = /^\d+(?:\.\d+)?$/;

/** True for decimal text equal to zero ("0", "0.00"); false for anything else, malformed text included. */
function isZeroDecimal(text: string): boolean {
  return DECIMAL_TEXT.test(text) && decimal(text).isZero();
}

interface DecimalRange {
  /** Most digits allowed after the point. */
  readonly places: number;
  readonly min: string;
  readonly max: string;
  /** When true, the value must be strictly greater than `min`. */
  readonly aboveMin?: boolean;
}

/** A non-negative decimal string ("0.45", "33.2875") with a place limit and an inclusive range. */
function decimalText(range: DecimalRange) {
  const min = decimal(range.min);
  const max = decimal(range.max);
  const lowest = `${range.aboveMin === true ? 'above' : 'at least'} ${range.min}`;
  return z
    .string()
    .regex(DECIMAL_TEXT, 'must be a decimal string such as "0.45"')
    // Refinements run even when the pattern fails, so each one passes text the pattern refused.
    .refine((text) => (text.split('.')[1] ?? '').length <= range.places, `must have at most ${String(range.places)} decimal places`)
    .refine((text) => {
      if (!DECIMAL_TEXT.test(text)) {
        return true;
      }
      const value = decimal(text);
      const aboveMin = range.aboveMin === true ? value.greaterThan(min) : value.greaterThanOrEqualTo(min);
      return aboveMin && value.lessThanOrEqualTo(max);
    }, `is out of range: must be ${lowest} and at most ${range.max}`);
}

const CENTS_TEXT = /^(?:0|-?[1-9]\d*)$/;

/** Integer cents serialized as a canonical string ("248000"), within an inclusive range. */
function centsText(min: bigint, max: bigint) {
  return z
    .string()
    .regex(CENTS_TEXT, 'must be integer cents written as a string such as "248000"')
    .refine((text) => {
      if (!CENTS_TEXT.test(text)) {
        return true;
      }
      const value = BigInt(text);
      return value >= min && value <= max;
    }, `is out of range: must be between ${min.toString()} and ${max.toString()} cents`);
}

function integer(min: number, max: number) {
  return z
    .number()
    .int('must be a whole number')
    .refine((value) => value >= min && value <= max, `is out of range: must be between ${String(min)} and ${String(max)}`);
}

export const hcpcsCode = z.string().regex(/^[0-9A-Z]{5}$/, 'must be a five-character HCPCS or CPT code');
const modifierOrNone = z.string().regex(/^(?:[0-9A-Z]{2})?$/, 'must be a two-character modifier, or empty for none');
const carrier = z.string().regex(/^\d{5}$/, 'must be a five-digit carrier (MAC) number');
const locality = z.string().regex(/^\d{2}$/, 'must be a two-digit locality number');
const stateCode = z.string().regex(/^[A-Z]{2}$/, 'must be a two-letter state code');
const zipCode = z.string().regex(/^\d{5}$/, 'must be a five-digit ZIP code');
const PLUS_FOUR = /^\d{4}$/;
const plusFour = z.string().regex(PLUS_FOUR, 'must be the four digits of a ZIP+4');
const ruralIndicator = z.enum(['', 'R', 'B']).nullable();
/** The most ranges one ZIP can need: one per four-digit code. */
const MAX_PLUS_FOUR_RANGES = 10_000;
const listCode = z.string().regex(/^[0-9A-Z]{1,6}$/, 'must be a code of one to six letters or digits');
const text = z.string().min(1, 'must not be empty');

/** The shortest quote the checker accepts, not counting surrounding whitespace. */
export const MIN_QUOTE_LENGTH = 8;

/**
 * A quote from the stored source: at least eight characters besides surrounding whitespace, with a
 * letter or digit among them, so a blank or a lone punctuation mark cannot pass the quote check.
 */
const quote = z
  .string()
  .refine((value) => value.trim().length >= MIN_QUOTE_LENGTH, `must quote at least ${String(MIN_QUOTE_LENGTH)} characters of the source`)
  .refine((value) => /[\p{L}\p{N}]/u.test(value), 'must quote words or numbers, not only spaces and punctuation');

const rvu = decimalText({ places: 4, min: '0', max: '9999' });
const gpciIndex = decimalText({ places: 4, min: '0', max: '5', aboveMin: true });
const percent = decimalText({ places: 4, min: '0', max: '100' });
const positivePercent = decimalText({ places: 4, min: '0', max: '100', aboveMin: true });
/** Therapy thresholds: above zero and at most $100,000. */
const thresholdCents = centsText(1n, 10_000_000n);

// ---------------------------------------------------------------------------------------------
// Key and value per record type

const codeListBody = z.strictObject({
  key: z.strictObject({ code: listCode }),
  value: z.strictObject({
    description: text,
    start_date: isoDate.nullable(),
    last_modified: isoDate.nullable(),
    stop_date: isoDate.nullable(),
    notes: z.string(),
  }),
});

const BODIES = {
  pfs_rvu: z.strictObject({
    key: z.strictObject({ hcpcs: hcpcsCode, modifier: modifierOrNone }),
    value: z.strictObject({
      status: z.string().regex(/^[A-Z]$/, 'must be a one-letter status code'),
      work_rvu: rvu,
      pe_rvu_non_facility: rvu,
      pe_rvu_facility: rvu,
      mp_rvu: rvu,
      non_facility_pe_na: z.boolean(),
      facility_pe_na: z.boolean(),
      pctc_indicator: z.string().regex(/^\d?$/, 'must be one digit or empty'),
      global_days: z.string().regex(/^(?:\d{3}|[A-Z]{3})?$/, 'must be three digits, three letters, or empty'),
      multiple_procedure_indicator: z.string().regex(/^\d?$/, 'must be one digit or empty'),
      /** The fee schedule year and CMS quarterly release (A January, B April, C July, D October) the file belongs to. */
      year: integer(1990, 2100),
      quarter: z.enum(CMS_QUARTERS),
    }),
  }),
  pfs_gpci: z.strictObject({
    key: z.strictObject({ carrier, locality }),
    value: z.strictObject({
      state: z.string().min(1).max(40),
      locality_name: text,
      work_gpci: gpciIndex,
      pe_gpci: gpciIndex,
      mp_gpci: gpciIndex,
    }),
  }),
  conversion_factor: z.strictObject({
    key: z.strictObject({ applicability: z.enum(['qualifying_apm', 'non_qualifying_apm']) }),
    value: z.strictObject({
      conversion_factor: decimalText({ places: 4, min: '0', max: '1000', aboveMin: true }),
      citation: text,
    }),
  }),
  mppr_rate: z.union([
    // One code on the therapy MPPR rate file; a null share means the general reduction applies.
    z.strictObject({
      key: z.strictObject({ hcpcs: hcpcsCode, modifier: modifierOrNone }),
      value: z.strictObject({ pe_reduction_percent: percent.nullable() }),
    }),
    // The general practice-expense reduction for second and later "always therapy" units.
    z.strictObject({
      key: z.strictObject({ component: z.literal('practice_expense') }),
      value: z.strictObject({ reduction_percent: positivePercent, applies_to: text }),
    }),
  ]),
  therapy_threshold: z.strictObject({
    key: z.strictObject({ discipline: z.enum(['PT_SLP', 'OT']) }),
    value: z.strictObject({ kx_threshold_cents: thresholdCents, medical_review_threshold_cents: thresholdCents }),
  }),
  assistant_modifier: z.strictObject({
    key: z.strictObject({ modifier: z.enum(['CQ', 'CO']) }),
    value: z.strictObject({ payment_percent: positivePercent }),
  }),
  sequestration: z
    .strictObject({
      key: z.strictObject({ program: z.literal('medicare') }),
      // A suspension is its own record (suspended true, reduction 0) over the suspended dates, so a
      // date with no sequestration record at all is a gap the engine reports, never a silent 0%.
      value: z.strictObject({ reduction_percent: percent, applies_to: text, suspended: z.boolean() }),
    })
    .refine((body) => (body.value.suspended ? isZeroDecimal(body.value.reduction_percent) : !isZeroDecimal(body.value.reduction_percent)), {
      message: 'is out of range: a suspension reduces by 0, and a reduction in force by more than 0',
      path: ['value', 'reduction_percent'],
    }),
  ncci_ptp: z.strictObject({
    key: z.strictObject({ column1: hcpcsCode, column2: hcpcsCode }),
    value: z.strictObject({
      modifier_indicator: z.enum(['0', '1', '9']),
      rationale: z.string(),
      in_existence_prior_to_1996: z.boolean(),
    }),
  }),
  ncci_mue: z.strictObject({
    key: z.strictObject({ hcpcs: hcpcsCode }),
    value: z.strictObject({ mue: integer(0, 9999), adjudication_indicator: z.enum(['1', '2', '3']), rationale: z.string() }),
  }),
  carc: codeListBody,
  rarc: codeListBody,
  claim_status_code: codeListBody,
  state_prompt_pay: z.strictObject({
    key: z.strictObject({ state: stateCode }),
    value: z.strictObject({
      days_to_pay: integer(1, 365),
      day_basis: z.enum(['calendar', 'business']),
      days_after_requested_information: integer(1, 365).nullable(),
      interest: z.strictObject({ automatic: z.boolean(), accrues_from: text, annual_rate_percent: percent.nullable() }),
      applies_to: text,
      exclusions: z.array(text),
      statute: text,
    }),
  }),
  dispute_window: z
    .strictObject({
      key: z.strictObject({
        program: z.enum(['medicare', 'commercial_default']),
        window: z.enum(['timely_filing', 'redetermination', 'reconsideration']),
      }),
      value: z.strictObject({
        length: integer(1, 3650),
        unit: z.enum(['days', 'months']),
        measured_from: z.enum(['date_of_service', 'remittance_date']).nullable(),
      }),
    })
    .refine((body) => body.value.unit === 'days' || body.value.length <= 120, {
      message: 'is out of range: a window in months must be at most 120',
      path: ['value', 'length'],
    }),
  locality_map: z.strictObject({
    key: z.strictObject({ zip: zipCode }),
    value: z.strictObject({
      state: stateCode,
      carrier,
      locality,
      rural_indicator: ruralIndicator,
      plus_four_required: z.boolean().nullable(),
    }),
  }),
  /**
   * A ZIP whose locality_map record needs its ZIP+4 (plus_four_required): the ZIP+4 file's codes of the ZIP,
   * compressed into ranges of contiguous codes with one carrier, locality and rural indicator (docs/adr/0064).
   * Inclusive bounds, sorted by `from`, never overlapping; a code no range holds is not in the file.
   */
  locality_map_plus_four: z
    .strictObject({
      key: z.strictObject({ zip: zipCode }),
      value: z.strictObject({
        state: stateCode,
        ranges: z
          .array(z.strictObject({ from: plusFour, to: plusFour, carrier, locality, rural_indicator: ruralIndicator }))
          .min(1, 'must hold at least one range')
          .max(MAX_PLUS_FOUR_RANGES, `must hold at most ${String(MAX_PLUS_FOUR_RANGES)} ranges, one per four-digit code`),
      }),
    })
    .superRefine((body, context) => {
      // Four-digit codes compare as text; a bound the pattern refused is left to its own message.
      let previousTo: string | null = null;
      body.value.ranges.forEach((range, index) => {
        if (!PLUS_FOUR.test(range.from) || !PLUS_FOUR.test(range.to)) {
          previousTo = null;
          return;
        }
        if (range.from > range.to) {
          context.addIssue({ code: 'custom', message: `is out of range: a range ends at ${range.to}, before its start ${range.from}`, path: ['value', 'ranges', index, 'to'] });
        }
        if (previousTo !== null && range.from <= previousTo) {
          context.addIssue({
            code: 'custom',
            message: `must start after the range before it ends (${previousTo}): ranges are sorted by their start and never overlap`,
            path: ['value', 'ranges', index, 'from'],
          });
        }
        previousTo = range.to > (previousTo ?? '') ? range.to : previousTo;
      });
    }),
  denial_category: z.strictObject({
    key: z.strictObject({
      group_code: z.enum(['CO', 'PR', 'OA', 'PI']).nullable(),
      carc: listCode,
      rarc: listCode.nullable(),
    }),
    value: z.strictObject({ category: z.enum(DENIAL_CATEGORIES) }),
  }),
} as const satisfies Record<RuleRecordType, z.ZodType<{ key: object; value: object }>>;

// ---------------------------------------------------------------------------------------------
// The envelope

const sourceCommon = {
  title: text,
  /**
   * Where the file was downloaded from. Null is allowed only for SYNTHETIC fixtures and for drafts
   * still at L1 (the plan-sourced hand-typed drafts); a record at L2 or above must name its URL.
   */
  url: z.url({ protocol: /^https?$/ }).nullable(),
  /** The stored copy, relative to the repository root (content/sources/... or fixtures/...). */
  path: repositoryPath,
  retrieved: isoDate,
  /** SHA-256 of the stored file's bytes. */
  sha256: sha256Hex,
  /** Where in the file the record comes from: a line, a page, a table row. */
  locator: text.nullable(),
  /** Invented reference data for tests. A synthetic record's title says SYNTHETIC. */
  synthetic: z.boolean(),
};

export const sourceSchema = z
  .discriminatedUnion('method', [
    z.strictObject({ ...sourceCommon, method: z.literal('parser'), parser: z.string().regex(/^[a-z0-9_]+$/) }),
    z.strictObject({ ...sourceCommon, method: z.literal('hand_typed'), transcribed_by: text, transcribed_on: isoDate }),
  ])
  .refine((source) => !source.synthetic || source.title.includes('SYNTHETIC'), {
    message: 'a synthetic source must say SYNTHETIC in its title',
    path: ['title'],
  });
export type RuleSource = z.infer<typeof sourceSchema>;

export const verificationSchema = z.strictObject({
  level: z.enum(VERIFICATION_LEVELS),
  /** Who checked it: the import script for L1, the person for L2 and L3. */
  by: text,
  on: isoDate,
  /** What a reviewer must answer to raise the level. */
  questions: z.array(text),
});
export type Verification = z.infer<typeof verificationSchema>;

const envelope = z.strictObject({
  record_type: z.enum(RULE_RECORD_TYPES),
  key: z.record(z.string(), z.unknown()),
  value: z.record(z.string(), z.unknown()),
  effective_from: isoDate,
  /** Inclusive; null when the record has no end yet. */
  effective_to: isoDate.nullable(),
  source: sourceSchema,
  verification: verificationSchema,
  /** Text that must appear verbatim in the stored source file. */
  quotes: z.array(quote).min(1, 'must quote the source at least once'),
  notes: z.string(),
});
type Envelope = z.infer<typeof envelope>;

type Body<T extends RuleRecordType> = z.infer<(typeof BODIES)[T]>;
export type RuleRecordOf<T extends RuleRecordType> = Omit<Envelope, 'record_type' | 'key' | 'value'> & { record_type: T } & Body<T>;
export type RuleRecord = { [T in RuleRecordType]: RuleRecordOf<T> }[RuleRecordType];

/** The full rule record schema: the envelope, then the key and value of its record type. */
export const ruleRecordSchema = envelope
  .superRefine((record, context) => {
    const body = BODIES[record.record_type].safeParse({ key: record.key, value: record.value });
    if (!body.success) {
      for (const issue of body.error.issues) {
        context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
      }
    }
    const datesValid = isIsoDate(record.effective_from) && (record.effective_to === null || isIsoDate(record.effective_to));
    if (datesValid && record.effective_to !== null && record.effective_to < record.effective_from) {
      context.addIssue({ code: 'custom', message: 'must not be before effective_from', path: ['effective_to'] });
    }
    if (!record.source.synthetic && record.verification.level !== 'L1' && record.source.url === null) {
      context.addIssue({
        code: 'custom',
        message: 'must name where the source was downloaded from: a record verified to L2 or above cites a public document by its URL',
        path: ['source', 'url'],
      });
    }
    if (record.record_type === 'pfs_rvu' && body.success && isIsoDate(record.effective_from)) {
      const { year, quarter } = record.value as { year: number; quarter: CmsQuarterLetter };
      if (String(year) !== record.effective_from.slice(0, 4) || quarter !== cmsQuarterOf(record.effective_from)) {
        context.addIssue({
          code: 'custom',
          message: `must match effective_from ${record.effective_from} (year ${record.effective_from.slice(0, 4)}, quarter ${cmsQuarterOf(record.effective_from)})`,
          path: ['value', 'quarter'],
        });
      }
    }
  })
  .transform((record) => record as RuleRecord);

/** One issue per line: "value.work_rvu: is out of range: ...". */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.map(String).join('.') : '(record)'}: ${issue.message}`);
}

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly string[] };

export function parseRuleRecord(input: unknown): ParseResult<RuleRecord> {
  const result = ruleRecordSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false, issues: describeIssues(result.error) };
}

// ---------------------------------------------------------------------------------------------
// The second transcription of hand-typed records

/** The fields a person transcribes by hand, which the second pass must reproduce exactly. */
export const TRANSCRIBED_FIELDS = ['key', 'value', 'effective_from', 'effective_to', 'quotes'] as const;

/**
 * A second, independent transcription of the hand-typed records in one record file (the
 * new-rule-record skill: "transcribe twice and diff"), stored beside it as <name>.second-pass.json.
 */
export const secondPassSchema = z.strictObject({
  transcribed_by: text,
  transcribed_on: isoDate,
  records: z
    .array(
      z.strictObject({
        record_type: z.enum(RULE_RECORD_TYPES),
        key: z.record(z.string(), z.unknown()),
        value: z.record(z.string(), z.unknown()),
        effective_from: isoDate,
        effective_to: isoDate.nullable(),
        quotes: z.array(quote).min(1),
      }),
    )
    .min(1, 'must hold at least one record'),
});
export type SecondPass = z.infer<typeof secondPassSchema>;
export type SecondPassRecord = SecondPass['records'][number];
