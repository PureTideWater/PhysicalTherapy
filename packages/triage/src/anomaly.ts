import { type Cents, centsToString, cents, decimal, roundToCents, sumCents, unroundedCents } from '@tp/money';

/**
 * Anomaly screening (PRD 12, Anomaly screening (investigatory); PRD 6, Anomaly screening; test matrix
 * CAS-01, CAS-02). For lines that cannot be priced (no agreement yet, no schedule yet) each line is
 * compared with its cohort: the same payer and plan, the same code and modifier set, the same place of
 * service and the same quarter, at least the practice's minimum number of lines (30 by default). The
 * screen reports the modal observed allowed, the distribution, and the lines paid below the mode by
 * more than the practice's anomaly threshold; its output is a count and a dollar range labelled
 * investigatory. It never prices a line, never treats the mode as a contract, and nothing it returns
 * enters a case or a report total: an anomaly's only action is "validate" (obtain the agreement, map
 * the plan, and price).
 *
 * Readings (docs/adr/0038): amounts are compared per unit (a line's observed allowed divided by its
 * units, rounded half up to the cent), since a cohort holds lines of one code with different unit
 * counts; a line is below the mode when the mode times its units, rounded half up, exceeds its
 * observed allowed by more than the threshold; the mode is the most frequent per-unit amount, the
 * lowest one when several are as frequent (the reading that flags fewest lines); the dollar range runs
 * from what the flagged lines fall short of the threshold line (the mode less the threshold) to what
 * they fall short of the mode. A cohort with no line below the mode by more than the threshold is no
 * anomaly.
 */

/** The unpriced reasons whose lines are screened: no agreement or no schedule to price them by yet. */
export const SCREENED_REASONS = [
  'NO_AGREEMENT',
  'NO_MAPPING',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'NO_PFS_VALUE',
  'UNSUPPORTED_METHOD',
  'DATE_OUTSIDE_VERSIONS',
  'UNITS_RULE_UNKNOWN',
] as const;

/** The label every anomaly carries wherever it is shown (PRD 6: "the UI label says investigatory"). */
export const INVESTIGATORY = 'investigatory';

export const ANOMALY_STATS_FORMAT = 'tp-anomaly-stats/1';

/** A line the screen may consider: an unpriced line of a pricing run. */
export interface ScreenedLine {
  readonly serviceLineId: string;
  readonly payerId: string;
  readonly planId: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly placeOfService: string | null;
  /** YYYY-MM-DD. */
  readonly serviceDate: string;
  /** Decimal text, as stored. */
  readonly units: string;
  readonly observedAllowedCents: Cents;
  readonly unpricedReason: string | null;
}

/** What makes a cohort homogeneous (stored as anomaly.cohort_key). */
export interface CohortKey {
  readonly payer_id: string;
  readonly plan_id: string;
  readonly procedure_code: string;
  /** The modifier set, sorted. */
  readonly modifiers: readonly string[];
  readonly place_of_service: string | null;
  /** YYYY-Qn. */
  readonly quarter: string;
}

/** The distribution of a cohort, stored as anomaly.stats; amounts are cents as integer text. */
export interface AnomalyStats {
  readonly format: typeof ANOMALY_STATS_FORMAT;
  readonly label: typeof INVESTIGATORY;
  readonly basis: 'observed_allowed_per_unit';
  readonly lines: number;
  readonly min_cents: string;
  readonly p25_cents: string;
  readonly median_cents: string;
  readonly p75_cents: string;
  readonly max_cents: string;
  readonly modal_cents: string;
  readonly modal_lines: number;
  readonly threshold_cents: string;
  /** Lines whose per-unit amount is below the mode at all. */
  readonly below_mode_lines: number;
  /** Lines short of the mode by more than the threshold: the anomaly's count. */
  readonly flagged_lines: number;
  readonly flagged_observed_cents: string;
  /** The investigatory dollar range of the flagged lines' shortfall. */
  readonly range_low_cents: string;
  readonly range_high_cents: string;
}

export interface AnomalyCohort {
  readonly cohortKey: CohortKey;
  readonly cohortSize: number;
  /** The modal observed allowed per unit. */
  readonly modalAllowedCents: Cents;
  readonly stats: AnomalyStats;
  /** The flagged lines (short of the mode by more than the threshold), sorted. */
  readonly lineIds: readonly string[];
  readonly rangeLowCents: Cents;
  readonly rangeHighCents: Cents;
}

export interface ScreeningSettings {
  readonly anomalyMinimumCohort: number;
  readonly anomalyThresholdCents: Cents;
}

/** The calendar quarter of a date: 2026-05-15 is 2026-Q2. */
export function quarterOf(date: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (match === null) {
    throw new RangeError('a service date is written YYYY-MM-DD');
  }
  const [, year, month] = match as unknown as [string, string, string];
  return `${year}-Q${String(Math.floor((Number.parseInt(month, 10) - 1) / 3) + 1)}`;
}

const UNITS_TEXT = /^\d+(?:\.\d+)?$/;
const ZERO = decimal(0n);

function screenable(line: ScreenedLine): boolean {
  return (SCREENED_REASONS as readonly string[]).includes(line.unpricedReason ?? '') && UNITS_TEXT.test(line.units) && decimal(line.units).greaterThan(ZERO);
}

function keyOf(line: ScreenedLine): CohortKey {
  return {
    payer_id: line.payerId,
    plan_id: line.planId,
    procedure_code: line.procedureCode,
    modifiers: [...new Set(line.modifiers)].sort(),
    place_of_service: line.placeOfService,
    quarter: quarterOf(line.serviceDate),
  };
}

/** A cohort key as one stable string (its fields in a fixed order). */
export function cohortId(key: CohortKey): string {
  return JSON.stringify([key.payer_id, key.plan_id, key.procedure_code, key.modifiers, key.place_of_service, key.quarter]);
}

function perUnit(line: ScreenedLine): Cents {
  return roundToCents(unroundedCents(decimal(line.observedAllowedCents).dividedBy(decimal(line.units))), 'HALF_UP_CENT');
}

function atMode(mode: Cents, units: string): Cents {
  return roundToCents(unroundedCents(decimal(mode).times(decimal(units))), 'HALF_UP_CENT');
}

/** The nearest-rank percentile of sorted values: the value at rank ceil(numerator/denominator x n). */
function percentile(sorted: readonly Cents[], numerator: number, denominator: number): Cents {
  const rank = Math.max(1, Math.floor((numerator * sorted.length + denominator - 1) / denominator));
  return sorted[rank - 1] as Cents;
}

/** The most frequent amount, the lowest of those equally frequent. */
function modeOf(sorted: readonly Cents[]): { readonly mode: Cents; readonly count: number } {
  let best = { mode: sorted[0] as Cents, count: 0 };
  let index = 0;
  while (index < sorted.length) {
    const value = sorted[index] as Cents;
    let end = index;
    while (end < sorted.length && sorted[end] === value) {
      end += 1;
    }
    if (end - index > best.count) {
      best = { mode: value, count: end - index };
    }
    index = end;
  }
  return best;
}

function screenCohort(key: CohortKey, lines: readonly ScreenedLine[], settings: ScreeningSettings): AnomalyCohort | null {
  const amounts = lines.map(perUnit);
  const sorted = [...amounts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const { mode, count } = modeOf(sorted);
  const threshold = settings.anomalyThresholdCents;
  const flagged: { readonly line: ScreenedLine; readonly gap: Cents }[] = [];
  let belowMode = 0;
  lines.forEach((line, index) => {
    if ((amounts[index] as Cents) < mode) {
      belowMode += 1;
    }
    const gap = cents(atMode(mode, line.units) - line.observedAllowedCents);
    if (gap > threshold) {
      flagged.push({ line, gap });
    }
  });
  if (flagged.length === 0) {
    return null;
  }
  const high = sumCents(flagged.map((item) => item.gap));
  const low = sumCents(flagged.map((item) => cents(item.gap - threshold)));
  const observed = sumCents(flagged.map((item) => item.line.observedAllowedCents));
  const text = (value: Cents) => centsToString(value);
  return {
    cohortKey: key,
    cohortSize: lines.length,
    modalAllowedCents: mode,
    lineIds: flagged.map((item) => item.line.serviceLineId).sort(),
    rangeLowCents: low,
    rangeHighCents: high,
    stats: {
      format: ANOMALY_STATS_FORMAT,
      label: INVESTIGATORY,
      basis: 'observed_allowed_per_unit',
      lines: lines.length,
      min_cents: text(sorted[0] as Cents),
      p25_cents: text(percentile(sorted, 1, 4)),
      median_cents: text(percentile(sorted, 1, 2)),
      p75_cents: text(percentile(sorted, 3, 4)),
      max_cents: text(sorted.at(-1) as Cents),
      modal_cents: text(mode),
      modal_lines: count,
      threshold_cents: text(threshold),
      below_mode_lines: belowMode,
      flagged_lines: flagged.length,
      flagged_observed_cents: text(observed),
      range_low_cents: text(low),
      range_high_cents: text(high),
    },
  };
}

/**
 * The anomalies among a run's lines: one per cohort of at least the minimum size with a line short of
 * the mode by more than the threshold, in the order of their cohort keys. Priced lines, lines stopped
 * for other reasons (a secondary payer, a reversed claim, a review, an engine error) and lines without
 * a positive unit count are not screened.
 */
export function screenAnomalies(lines: readonly ScreenedLine[], settings: ScreeningSettings): AnomalyCohort[] {
  const cohorts = new Map<string, { readonly key: CohortKey; readonly lines: ScreenedLine[] }>();
  for (const line of lines.filter(screenable)) {
    const key = keyOf(line);
    const id = cohortId(key);
    const cohort = cohorts.get(id) ?? { key, lines: [] };
    cohort.lines.push(line);
    cohorts.set(id, cohort);
  }
  const anomalies: AnomalyCohort[] = [];
  for (const id of [...cohorts.keys()].sort()) {
    const cohort = cohorts.get(id);
    if (cohort === undefined || cohort.lines.length < settings.anomalyMinimumCohort) {
      continue;
    }
    const found = screenCohort(cohort.key, cohort.lines, settings);
    if (found !== null) {
      anomalies.push(found);
    }
  }
  return anomalies;
}
