import type { ScopeClient } from '@tp/db/runtime';
import { ENGINE_ERROR_DETAILS, type EngineErrorDetail, UNPRICED_REASONS, type UnpricedReason, pagesOperator } from '@tp/pricing';
import { z } from 'zod';

/**
 * A complete run's summary (PRD 5, J7: "The run summary shows coverage (priced lines and dollars as a
 * share of all), the unpriced reasons by count, and variance by payer pattern"; PRD 7, Pricing runs and
 * Coverage), stored once in pricing_run.coverage and read by the screens. Counts and cents only, as
 * integer text for cents: no identifier but the opaque IDs of payers, plans, mappings, versions and
 * rate records. Dollars are billed charges (what Coverage counts waiting on mappings).
 *
 * A payer pattern here is what the run can say from its own results: the payer and plan, the kind of
 * mapping, and the contract version and rate record that priced the lines. Triage (milestone 6) refines
 * it with the adjustment behavior it detects from the traces (PRD 12, From validated to actionable).
 * Underpaid is the sum of positive variances (each a validated discrepancy); overpaid, of negative
 * ones (recorded and shown, never pursued: PRC-15).
 */

export const COVERAGE_FORMAT = 'tp-pricing-coverage/1';

const count = z.number().int().nonnegative();
const centsText = z.string().regex(/^-?(?:0|[1-9]\d*)$/);
const id = z.uuid();

export const runCoverageSchema = z.strictObject({
  format: z.literal(COVERAGE_FORMAT),
  lines: count,
  charge_cents: centsText,
  priced: z.strictObject({ lines: count, charge_cents: centsText }),
  /** Every reason of the closed list, in its order, with its count (zero included). */
  reasons: z.array(z.strictObject({ reason: z.enum(UNPRICED_REASONS), lines: count, charge_cents: centsText })),
  /** ENGINE_ERROR lines by their fixed detail code. */
  engine_errors: z.array(z.strictObject({ detail: z.enum(ENGINE_ERROR_DETAILS), lines: count, pages_operator: z.boolean() })),
  /** The contract versions that priced (or were found for) the run's lines. */
  versions: z.array(z.strictObject({ contract_version_id: id, contract_id: id, version_no: z.number().int().positive(), lines: count })),
  patterns: z.array(
    z.strictObject({
      payer_id: id,
      plan_id: id,
      mapping_kind: z.string(),
      contract_version_id: id.nullable(),
      rate_record_id: id.nullable(),
      lines: count,
      underpaid_lines: count,
      underpaid_cents: centsText,
      overpaid_lines: count,
      overpaid_cents: centsText,
    }),
  ),
});

export type RunCoverage = z.infer<typeof runCoverageSchema>;

/** Reads a stored coverage summary; throws a ZodError naming the field that fails. */
export function parseCoverage(value: unknown): RunCoverage {
  return runCoverageSchema.parse(value);
}

/** How many of the run's lines are engine errors that page the operator (the closed list's remedy). */
export function operatorAlerts(coverage: Pick<RunCoverage, 'engine_errors'>): number {
  return coverage.engine_errors.filter((entry) => entry.pages_operator).reduce((sum, entry) => sum + entry.lines, 0);
}

interface TotalsRow {
  readonly lines: number;
  readonly charge_cents: string;
  readonly priced_lines: number;
  readonly priced_charge_cents: string;
}

interface ReasonRow {
  readonly reason: UnpricedReason;
  readonly lines: number;
  readonly charge_cents: string;
}

interface DetailRow {
  readonly detail: string | null;
  readonly lines: number;
}

interface VersionRow {
  readonly contract_version_id: string;
  readonly contract_id: string;
  readonly version_no: number;
  readonly lines: number;
}

interface PatternRow {
  readonly payer_id: string;
  readonly plan_id: string;
  readonly mapping_kind: string;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly lines: number;
  readonly underpaid_lines: number;
  readonly underpaid_cents: string;
  readonly overpaid_lines: number;
  readonly overpaid_cents: string;
}

/** The parts the database totals, shaped into the stored summary. */
export interface CoverageParts {
  readonly totals: TotalsRow;
  readonly reasons: readonly ReasonRow[];
  readonly details: readonly DetailRow[];
  readonly versions: readonly VersionRow[];
  readonly patterns: readonly PatternRow[];
}

function isDetail(value: string | null): value is EngineErrorDetail {
  return value !== null && (ENGINE_ERROR_DETAILS as readonly string[]).includes(value);
}

/** The summary from its parts: every reason in the closed list's order, details sorted by code. */
export function coverageOf(parts: CoverageParts): RunCoverage {
  const byReason = new Map(parts.reasons.map((row) => [row.reason, row]));
  const details = new Map<EngineErrorDetail, number>();
  for (const row of parts.details) {
    // An ENGINE_ERROR whose detail the trace does not name is the engine's catch-all.
    const detail: EngineErrorDetail = isDetail(row.detail) ? row.detail : 'unexpected';
    details.set(detail, (details.get(detail) ?? 0) + row.lines);
  }
  return {
    format: COVERAGE_FORMAT,
    lines: parts.totals.lines,
    charge_cents: parts.totals.charge_cents,
    priced: { lines: parts.totals.priced_lines, charge_cents: parts.totals.priced_charge_cents },
    reasons: UNPRICED_REASONS.map((reason) => ({ reason, lines: byReason.get(reason)?.lines ?? 0, charge_cents: byReason.get(reason)?.charge_cents ?? '0' })),
    engine_errors: [...details]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([detail, lines]) => ({ detail, lines, pages_operator: pagesOperator(detail) })),
    versions: parts.versions.map((row) => ({ contract_version_id: row.contract_version_id, contract_id: row.contract_id, version_no: row.version_no, lines: row.lines })),
    patterns: parts.patterns.map((row) => ({ ...row })),
  };
}

/** Totals the run's priced lines in the database (inside the run's own transaction, before it completes). */
export async function computeCoverage(client: ScopeClient, pricingRunId: string): Promise<RunCoverage> {
  const totals = await client.query<TotalsRow>(
    `SELECT count(*)::int AS lines, coalesce(sum(l.charge_cents), 0)::text AS charge_cents,
            count(*) FILTER (WHERE p.unpriced_reason IS NULL)::int AS priced_lines,
            coalesce(sum(l.charge_cents) FILTER (WHERE p.unpriced_reason IS NULL), 0)::text AS priced_charge_cents
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id
      WHERE p.pricing_run_id = $1`,
    [pricingRunId],
  );
  const reasons = await client.query<ReasonRow>(
    `SELECT p.unpriced_reason AS reason, count(*)::int AS lines, sum(l.charge_cents)::text AS charge_cents
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id
      WHERE p.pricing_run_id = $1 AND p.unpriced_reason IS NOT NULL
      GROUP BY p.unpriced_reason`,
    [pricingRunId],
  );
  const details = await client.query<DetailRow>(
    `SELECT p.trace -> 'outcome' ->> 'detail' AS detail, count(*)::int AS lines
       FROM priced_line p
      WHERE p.pricing_run_id = $1 AND p.unpriced_reason = 'ENGINE_ERROR'
      GROUP BY 1`,
    [pricingRunId],
  );
  const versions = await client.query<VersionRow>(
    `SELECT p.contract_version_id, v.contract_id, v.version_no, count(*)::int AS lines
       FROM priced_line p JOIN contract_version v ON v.id = p.contract_version_id
      WHERE p.pricing_run_id = $1
      GROUP BY p.contract_version_id, v.contract_id, v.version_no
      ORDER BY v.contract_id, v.version_no`,
    [pricingRunId],
  );
  const patterns = await client.query<PatternRow>(
    `SELECT pl.payer_id, l.payer_plan_key AS plan_id, m.mapping_kind, p.contract_version_id, p.rate_record_id, count(*)::int AS lines,
            count(*) FILTER (WHERE p.variance_cents > 0)::int AS underpaid_lines,
            coalesce(sum(p.variance_cents) FILTER (WHERE p.variance_cents > 0), 0)::text AS underpaid_cents,
            count(*) FILTER (WHERE p.variance_cents < 0)::int AS overpaid_lines,
            coalesce(sum(p.variance_cents) FILTER (WHERE p.variance_cents < 0), 0)::text AS overpaid_cents
       FROM priced_line p
       JOIN service_line l ON l.id = p.service_line_id
       JOIN plan pl ON pl.id = l.payer_plan_key
       JOIN payer_plan_mapping m ON m.id = p.mapping_id
      WHERE p.pricing_run_id = $1 AND p.unpriced_reason IS NULL
      GROUP BY pl.payer_id, l.payer_plan_key, m.mapping_kind, p.contract_version_id, p.rate_record_id
      ORDER BY coalesce(sum(p.variance_cents) FILTER (WHERE p.variance_cents > 0), 0) DESC, pl.payer_id, l.payer_plan_key, m.mapping_kind, p.contract_version_id NULLS FIRST, p.rate_record_id NULLS FIRST`,
    [pricingRunId],
  );
  return coverageOf({
    totals: totals.rows[0] ?? { lines: 0, charge_cents: '0', priced_lines: 0, priced_charge_cents: '0' },
    reasons: reasons.rows,
    details: details.rows,
    versions: versions.rows,
    patterns: patterns.rows,
  });
}
