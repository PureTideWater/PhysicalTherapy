import { type Cents, cents, parseCents } from '@tp/money';
import { z } from 'zod';

/**
 * The practice settings triage reads (Data dictionary, practice.settings: "materiality, anomaly
 * threshold, proof level, staff rate"; PRD 12; PRD 20, Materiality defaults and Anomaly cohort
 * minimum). They live in practice.settings beside the pricing settings, under these keys:
 *
 * | Key | Meaning | Default |
 * | --- | --- | --- |
 * | line_materiality_cents | a validated line is actionable at or above this variance | 500 ($5, PRD 20) |
 * | case_materiality_cents | a payer pattern becomes a case at or above this actionable total | 25000 ($250, PRD 20) |
 * | anomaly_minimum_cohort | a cohort smaller than this produces no anomaly | 30 lines (PRD 20) |
 * | anomaly_threshold_cents | a line is below the mode when it is short of it by more than this | 500 (see below) |
 * | staff_rate_cents_per_hour | the staff cost of pursuing a case, per hour | none |
 * | minutes_per_packet | the staff time one packet takes | none |
 * | minutes_per_follow_up | the staff time one follow-up takes | none |
 *
 * Cents are integer text, as every amount in stored JSON. The plan gives no default for the anomaly
 * threshold; this build uses the per-line materiality default ($5), so a line is called short of its
 * cohort's mode only by an amount that would matter if it were priced (docs/adr/0038). The pursuit settings have no default: a practice that has not stated its staff rate and
 * times has no pursuit-cost estimate, and the report says so rather than guessing one. A malformed
 * setting is refused (TriageSettingsError names the key), never replaced by its default.
 */

export interface TriageSettings {
  readonly lineMaterialityCents: Cents;
  readonly caseMaterialityCents: Cents;
  readonly anomalyMinimumCohort: number;
  readonly anomalyThresholdCents: Cents;
  readonly pursuit: PursuitSettings | null;
}

export interface PursuitSettings {
  readonly staffRateCentsPerHour: Cents;
  readonly minutesPerPacket: number;
  readonly minutesPerFollowUp: number;
}

export const DEFAULT_TRIAGE_SETTINGS: TriageSettings = {
  lineMaterialityCents: cents(500n),
  caseMaterialityCents: cents(25000n),
  anomalyMinimumCohort: 30,
  anomalyThresholdCents: cents(500n),
  pursuit: null,
};

export class TriageSettingsError extends Error {
  override readonly name = 'TriageSettingsError';

  constructor(readonly key: string) {
    super(`the practice setting ${key} is malformed`);
  }
}

const centsText = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})$/)
  .transform((text) => parseCents(text));
const minutes = z.number().int().min(0).max(10_000);

const SETTINGS = z.object({
  line_materiality_cents: centsText.optional(),
  case_materiality_cents: centsText.optional(),
  anomaly_minimum_cohort: z.number().int().min(1).max(1_000_000).optional(),
  anomaly_threshold_cents: centsText.optional(),
  staff_rate_cents_per_hour: centsText.optional(),
  minutes_per_packet: minutes.optional(),
  minutes_per_follow_up: minutes.optional(),
});

/** The triage settings of a practice.settings document (any other keys are left to their readers). */
export function triageSettings(stored: unknown): TriageSettings {
  const document = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? stored : {};
  const parsed = SETTINGS.safeParse(document);
  if (!parsed.success) {
    throw new TriageSettingsError(parsed.error.issues[0]?.path.join('.') ?? 'settings');
  }
  const value = parsed.data;
  const rate = value.staff_rate_cents_per_hour;
  const packet = value.minutes_per_packet;
  const followUp = value.minutes_per_follow_up;
  return {
    lineMaterialityCents: value.line_materiality_cents ?? DEFAULT_TRIAGE_SETTINGS.lineMaterialityCents,
    caseMaterialityCents: value.case_materiality_cents ?? DEFAULT_TRIAGE_SETTINGS.caseMaterialityCents,
    anomalyMinimumCohort: value.anomaly_minimum_cohort ?? DEFAULT_TRIAGE_SETTINGS.anomalyMinimumCohort,
    anomalyThresholdCents: value.anomaly_threshold_cents ?? DEFAULT_TRIAGE_SETTINGS.anomalyThresholdCents,
    pursuit: rate === undefined || packet === undefined || followUp === undefined ? null : { staffRateCentsPerHour: rate, minutesPerPacket: packet, minutesPerFollowUp: followUp },
  };
}
