import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { UNPRICED_REASONS, type UnpricedReason } from '@tp/pricing';
import { COVERAGE_IN_EFFECT } from '@tp/worker/digests';
import { PRICED_IN_EFFECT } from '@tp/worker/pricing';

/**
 * Coverage as the plan defines it (PRD 5, J7: "priced lines and dollars as a share of all"; docs/adr/0039,
 * the digest's coverage: "each line's result in the run in effect, by lines and billed dollars"; docs/adr/
 * 0040: the digest's coverage reads the pricing in effect): every line a run in effect priced counts once,
 * at its result in its pricing in effect (PRICED_IN_EFFECT: the latest run in effect that priced it, of any
 * period), never only the lines of the run that took effect last. A month priced under a "no agreement"
 * mapping adds its lines unpriced beside the months priced under contracts; it does not hide them.
 *
 * The dashboard, Coverage, the coverage report and the Contracts screen read these; the totals are the
 * digest's own statement (COVERAGE_IN_EFFECT), so every screen and the monthly email agree. Counts and
 * integer cents as text only; aggregates, no row of a patient, claim or line.
 */

type Scope = PracticeScope<ScopeClient>;

/** Lines and their billed dollars. */
export interface LineShare {
  readonly lines: number;
  readonly chargeCents: string;
}

export interface CoverageInEffect {
  /** The runs in effect whose priced lines are some line's pricing in effect; 0 before any run takes effect. */
  readonly runs: number;
  /** The first and last service dates those runs cover, or null with no run. */
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  /** Every line priced in effect (the share's whole). */
  readonly of: LineShare;
  /** Those of them priced. */
  readonly priced: LineShare;
  /** Every reason of the closed list, in its order, with the lines its pricing in effect left unpriced for it. */
  readonly reasons: readonly ({ readonly reason: UnpricedReason } & LineShare)[];
}

interface TotalsRow {
  readonly lines: number;
  readonly priced_lines: number;
  readonly billed: string;
  readonly priced_billed: string;
}

const IN_EFFECT = `(${PRICED_IN_EFFECT('$1', 'true')}) latest`;

interface RunsRow {
  readonly runs: number;
  readonly period_from: string | null;
  readonly period_to: string | null;
}

async function runsRow(scope: Scope, practiceId: string): Promise<RunsRow | undefined> {
  return (
    await scope.client.query<RunsRow>(
      `SELECT count(DISTINCT latest.pricing_run_id)::int AS runs, min(r.period_from)::text AS period_from, max(r.period_to)::text AS period_to
         FROM ${IN_EFFECT} JOIN pricing_run r ON r.id = latest.pricing_run_id`,
      [practiceId],
    )
  ).rows[0];
}

/** How many runs in effect hold some line's pricing in effect (0 before any run takes effect). */
export async function runsInEffect(scope: Scope, practiceId: string): Promise<number> {
  return (await runsRow(scope, practiceId))?.runs ?? 0;
}

/** The practice's coverage under the pricing in effect. */
export async function coverageInEffect(scope: Scope, practiceId: string): Promise<CoverageInEffect> {
  const totals = (await scope.client.query<TotalsRow>(COVERAGE_IN_EFFECT, [practiceId])).rows[0];
  const runs = await runsRow(scope, practiceId);
  const { rows: reasons } = await scope.client.query<{ reason: UnpricedReason; lines: number; billed: string }>(
    `SELECT latest.unpriced_reason AS reason, count(*)::int AS lines, coalesce(sum(l.charge_cents), 0)::text AS billed
       FROM ${IN_EFFECT} JOIN service_line l ON l.id = latest.service_line_id
      WHERE latest.unpriced_reason IS NOT NULL
      GROUP BY latest.unpriced_reason`,
    [practiceId],
  );
  const byReason = new Map(reasons.map((row) => [row.reason, row]));
  return {
    runs: runs?.runs ?? 0,
    periodFrom: runs?.period_from ?? null,
    periodTo: runs?.period_to ?? null,
    of: { lines: totals?.lines ?? 0, chargeCents: totals?.billed ?? '0' },
    priced: { lines: totals?.priced_lines ?? 0, chargeCents: totals?.priced_billed ?? '0' },
    reasons: UNPRICED_REASONS.map((reason) => ({ reason, lines: byReason.get(reason)?.lines ?? 0, chargeCents: byReason.get(reason)?.billed ?? '0' })),
  };
}

/** A contract's coverage share: the lines it was to price under the pricing in effect, and those it priced. */
export interface ContractCoverage {
  readonly of: LineShare;
  readonly priced: LineShare;
}

/**
 * Each contract's coverage share (PRD 7, Contracts: "coverage share"), by contract: the lines whose pricing
 * in effect names one of its versions (the version that priced them or was found for them), else whose
 * mapping on the service date names one, and of those the lines priced, by lines and billed dollars. A
 * contract no line in effect names is absent.
 */
export async function contractCoverage(scope: Scope, practiceId: string, contractIds: readonly string[]): Promise<ReadonlyMap<string, ContractCoverage>> {
  if (contractIds.length === 0) {
    return new Map();
  }
  const { rows } = await scope.client.query<TotalsRow & { contract_id: string }>(
    `SELECT v.contract_id, count(*)::int AS lines, (count(*) FILTER (WHERE latest.unpriced_reason IS NULL))::int AS priced_lines,
            coalesce(sum(l.charge_cents), 0)::text AS billed, coalesce(sum(l.charge_cents) FILTER (WHERE latest.unpriced_reason IS NULL), 0)::text AS priced_billed
       FROM ${IN_EFFECT}
       JOIN service_line l ON l.id = latest.service_line_id
       LEFT JOIN payer_plan_mapping m ON m.id = latest.mapping_id
       JOIN contract_version v ON v.id = coalesce(latest.contract_version_id, m.contract_version_id)
      WHERE v.practice_id = $1 AND v.contract_id = ANY ($2::uuid[])
      GROUP BY v.contract_id`,
    [practiceId, contractIds],
  );
  return new Map(rows.map((row) => [row.contract_id, { of: { lines: row.lines, chargeCents: row.billed }, priced: { lines: row.priced_lines, chargeCents: row.priced_billed } }]));
}

/** A fee-schedule period PaidWhole has not loaded: a CMS quarter ("2026-Q4", which Coverage says as "Q4 2026 (Oct–Dec)") for terms priced on the date of service, a year ("2027") for terms locked to one. */
export interface FeeSchedulePeriod {
  readonly kind: 'quarter' | 'year';
  readonly label: string;
}

/**
 * The fee-schedule periods the release in force does not load, with the lines in effect left unpriced for want of them
 * (audit #7 and #59; docs/adr/0071): lines at their pricing in effect unpriced NO_PFS_VALUE because no relative value
 * was found as the engine looked (no_rvu_in_basis_year), judged as the price job's content alert judges them
 * (isLoudContentGap, apps/worker/src/price/release.ts): terms priced on the date of service (in_force_on_service_date)
 * when that date is outside every pfs_rvu window, grouped by its CMS quarter; terms locked to a year
 * (latest_in_basis_year) when no window meets that year, grouped by it. A line whose date is loaded and whose code
 * simply has no relative value is not one: it keeps the reason's own remedy. `rvuLoaded` is the release in force's
 * pfs_rvu windows as a datemultirange literal (lib/releases/content-through.ts). Periods in date order, with their
 * billed dollars in integer cents as text.
 */
export async function feeSchedulePeriodsNotLoaded(
  scope: Scope,
  practiceId: string,
  rvuLoaded: string,
): Promise<{ readonly period: FeeSchedulePeriod; readonly lines: number; readonly chargeCents: string }[]> {
  const { rows } = await scope.client.query<{ kind: 'quarter' | 'year'; year: number; quarter: number | null; lines: number; charge_cents: string }>(
    `WITH gaps AS (
       SELECT l.charge_cents, latest.trace -> 'steps' -> 'fee_schedule' ->> 'lookup' AS lookup,
              (latest.trace -> 'line' ->> 'service_date')::date AS service_date,
              (latest.trace -> 'steps' -> 'fee_schedule' ->> 'basis_year')::int AS basis_year
         FROM ${IN_EFFECT} JOIN service_line l ON l.id = latest.service_line_id
        WHERE latest.unpriced_reason = 'NO_PFS_VALUE' AND latest.trace -> 'outcome' ->> 'detail' = 'no_rvu_in_basis_year'
     ), periods AS (
       SELECT 'quarter' AS kind, extract(year FROM g.service_date)::int AS year, extract(quarter FROM g.service_date)::int AS quarter, g.charge_cents
         FROM gaps g
        WHERE g.lookup = 'in_force_on_service_date' AND NOT ($2::datemultirange @> g.service_date)
       UNION ALL
       SELECT 'year', g.basis_year, NULL, g.charge_cents
         FROM gaps g
        WHERE g.lookup = 'latest_in_basis_year' AND NOT ($2::datemultirange && daterange(make_date(g.basis_year, 1, 1), make_date(g.basis_year, 12, 31), '[]'))
     )
     SELECT kind, year, quarter, count(*)::int AS lines, coalesce(sum(charge_cents), 0)::text AS charge_cents
       FROM periods
      GROUP BY kind, year, quarter
      ORDER BY make_date(year, coalesce(quarter * 3 - 2, 1), 1), kind`,
    [practiceId, rvuLoaded],
  );
  return rows.map((row) => ({
    period: row.kind === 'quarter' ? { kind: 'quarter', label: `${String(row.year)}-Q${String(row.quarter)}` } : { kind: 'year', label: String(row.year) },
    lines: row.lines,
    chargeCents: row.charge_cents,
  }));
}
