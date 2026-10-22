import { type Cents, ROUNDING_RULES, centsToString, formatCents, parseAmount, parseCents } from '@tp/money';
import { TriageSettingsError, triageSettings } from '@tp/triage';
import { z } from 'zod';

/**
 * A practice's pricing and triage settings as the internal console edits them (PRD 5, J8: "materiality
 * thresholds (per line and per case) are practice settings with defaults"; PRD 11, Inputs: "default rounding
 * when a contract is silent"; PRD 12, Deadlines and pursuit cost:
 * "the practice's settings (staff rate, minutes per packet, minutes per follow-up)"; docs/adr/0029 and
 * 0038; ADR 0040). Pure: the form's fields to the stored document (cents as integer text, as every
 * amount in stored JSON) and back. Every value is checked here and by the readers that use it
 * (@tp/triage triageSettings, the engine's settings check), so a setting is never stored that a run
 * or triage would refuse. A field left blank returns the setting to its default. The billing ZIP is not here: it
 * is the practice's pricing location (practice_site, PR 6b; docs/adr/0064), set by its own form and setter.
 */

/** The keys the console sets; the database's practice_setting_keys() names the same. */
export const PRACTICE_SETTING_KEYS = [
  'place_of_service_settings',
  'default_rounding',
  'line_materiality_cents',
  'case_materiality_cents',
  'anomaly_minimum_cohort',
  'anomaly_threshold_cents',
  'staff_rate_cents_per_hour',
  'minutes_per_packet',
  'minutes_per_follow_up',
] as const;

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (blank(value) ? undefined : String(value).trim()), schema.optional());

const dollars = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'dollars and cents, such as 5.00')
  .transform((text) => parseAmount(text));
const wholeNumber = (max: number) =>
  z
    .string()
    .regex(/^\d{1,7}$/, 'a whole number')
    .transform((text) => Number.parseInt(text, 10))
    .pipe(z.number().int().min(0).max(max));
const places = z
  .string()
  .transform((text) => text.split(/[\s,]+/).filter((code) => code !== ''))
  .pipe(z.array(z.string().regex(/^\d{2}$/, 'two-digit place-of-service codes, separated by commas')));

export const practiceSettingsInput = z.object({
  facilityPlaces: optional(places),
  nonFacilityPlaces: optional(places),
  defaultRounding: optional(z.enum(ROUNDING_RULES)),
  lineMateriality: optional(dollars),
  caseMateriality: optional(dollars),
  anomalyMinimumCohort: optional(wholeNumber(1_000_000).pipe(z.number().min(1, 'at least 1'))),
  anomalyThreshold: optional(dollars),
  staffRatePerHour: optional(dollars),
  minutesPerPacket: optional(wholeNumber(10_000)),
  minutesPerFollowUp: optional(wholeNumber(10_000)),
});

export type PracticeSettingsInput = z.output<typeof practiceSettingsInput>;

export class PracticeSettingsError extends Error {
  override readonly name = 'PracticeSettingsError';

  constructor(
    readonly field: keyof PracticeSettingsInput,
    message: string,
  ) {
    super(message);
  }
}

/** The stored document: the settings keys the console sets (the rest of practice.settings is left as it is). */
export interface PracticeSettingsDocument {
  readonly settings: Readonly<Record<string, unknown>>;
}

/** The place-of-service split as the engine reads it: each code facility or non-facility, in code order. */
function placeSettings(facility: readonly string[], nonFacility: readonly string[]): Record<string, string> {
  const entries: [string, string][] = [...facility.map((code): [string, string] => [code, 'facility']), ...nonFacility.map((code): [string, string] => [code, 'non_facility'])];
  return Object.fromEntries(entries.sort((left, right) => (left[0] < right[0] ? -1 : 1)));
}

/** The form's values as the stored settings; throws PracticeSettingsError naming the field a value does not fit. */
export function settingsDocument(input: PracticeSettingsInput): PracticeSettingsDocument {
  const facility = input.facilityPlaces ?? [];
  const nonFacility = input.nonFacilityPlaces ?? [];
  const both = facility.find((code) => nonFacility.includes(code));
  if (both !== undefined) {
    throw new PracticeSettingsError('facilityPlaces', `place of service ${both} is listed as both facility and non-facility`);
  }
  const pursuit = [input.staffRatePerHour, input.minutesPerPacket, input.minutesPerFollowUp];
  if (pursuit.some((value) => value !== undefined) && pursuit.some((value) => value === undefined)) {
    throw new PracticeSettingsError('staffRatePerHour', 'the pursuit cost needs the staff rate and both times together, or none of them');
  }
  const cents = (value: Cents | undefined) => (value === undefined ? undefined : centsToString(value));
  const entries: [string, unknown][] = [
    ['place_of_service_settings', facility.length + nonFacility.length === 0 ? undefined : placeSettings(facility, nonFacility)],
    ['default_rounding', input.defaultRounding],
    ['line_materiality_cents', cents(input.lineMateriality)],
    ['case_materiality_cents', cents(input.caseMateriality)],
    ['anomaly_minimum_cohort', input.anomalyMinimumCohort],
    ['anomaly_threshold_cents', cents(input.anomalyThreshold)],
    ['staff_rate_cents_per_hour', cents(input.staffRatePerHour)],
    ['minutes_per_packet', input.minutesPerPacket],
    ['minutes_per_follow_up', input.minutesPerFollowUp],
  ];
  const settings = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
  try {
    // Triage reads the document the way it is stored: anything it would refuse is refused here.
    triageSettings(settings);
  } catch (error) {
    if (error instanceof TriageSettingsError) {
      throw new PracticeSettingsError('lineMateriality', error.message);
    }
    throw error;
  }
  return { settings };
}

/** The form's fields for a practice's stored settings (blank where the default applies). */
export interface PracticeSettingsForm {
  readonly facilityPlaces: string;
  readonly nonFacilityPlaces: string;
  readonly defaultRounding: string;
  readonly lineMateriality: string;
  readonly caseMateriality: string;
  readonly anomalyMinimumCohort: string;
  readonly anomalyThreshold: string;
  readonly staffRatePerHour: string;
  readonly minutesPerPacket: string;
  readonly minutesPerFollowUp: string;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const asDollars = (value: unknown) => (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? formatCents(parseCents(value)) : '');
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '');

export function settingsForm(stored: unknown): PracticeSettingsForm {
  const settings = record(stored);
  const placesOf = (kind: string) =>
    Object.entries(record(settings.place_of_service_settings))
      .filter(([, setting]) => setting === kind)
      .map(([code]) => code)
      .sort()
      .join(', ');
  return {
    facilityPlaces: placesOf('facility'),
    nonFacilityPlaces: placesOf('non_facility'),
    defaultRounding: typeof settings.default_rounding === 'string' ? settings.default_rounding : '',
    lineMateriality: asDollars(settings.line_materiality_cents),
    caseMateriality: asDollars(settings.case_materiality_cents),
    anomalyMinimumCohort: asNumber(settings.anomaly_minimum_cohort),
    anomalyThreshold: asDollars(settings.anomaly_threshold_cents),
    staffRatePerHour: asDollars(settings.staff_rate_cents_per_hour),
    minutesPerPacket: asNumber(settings.minutes_per_packet),
    minutesPerFollowUp: asNumber(settings.minutes_per_follow_up),
  };
}
