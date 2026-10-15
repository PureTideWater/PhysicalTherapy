import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import type { UnpricedReason } from '@tp/pricing';
import { type RerunReason, type RunCoverage, parseCoverage, rerunReasons } from '@tp/worker/pricing';

/**
 * The Pricing runs, line trace, Claims and lines and Coverage reads of pricing (PRD 7; PRD 5, J7; PRD
 * 8, pricing_run and priced_line). Every read runs in the request's practice scope, under the
 * practice's policies, and every run and priced line returned is an audited read (readWithAudit).
 * Amounts are integer cents as text. A run never changes once complete, so what these show of one is
 * what it priced.
 */

type Scope = PracticeScope<ScopeClient>;

export const RUNS_PER_PAGE = 20;
export const RUN_LINES_PER_PAGE = 50;

function pagesOf(total: number, per: number, page: number): { page: number; pages: number; offset: number } {
  const count = Math.max(1, Math.ceil(total / per));
  const current = Math.min(Math.max(1, page), count);
  return { page: current, pages: count, offset: (current - 1) * per };
}

export type RunStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface RunSummary {
  readonly id: string;
  /** First and last service dates, both included. */
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly engineVersion: string;
  readonly status: RunStatus;
  readonly failureCode: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  /** Who created the run: their email, as the practice's members see it. */
  readonly createdBy: string;
  readonly coverage: RunCoverage | null;
  /** Why a new run of the same period would price differently (complete runs only; MAP-03). */
  readonly rerun: readonly RerunReason[];
}

interface RunRow {
  readonly id: string;
  readonly practice_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly release_no: number;
  readonly engine_version: string;
  readonly status: RunStatus;
  readonly failure_code: string | null;
  readonly created_at: Date;
  readonly completed_at: Date | null;
  readonly email: string | null;
  readonly coverage: unknown;
}

const RUN_COLUMNS = `r.id, r.practice_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, r.engine_version, r.status,
  r.failure_code, r.created_at, r.completed_at, u.email, r.coverage`;

async function summaries(scope: Scope, rows: readonly RunRow[]): Promise<RunSummary[]> {
  const result: RunSummary[] = [];
  for (const row of rows) {
    result.push({
      id: row.id,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      releaseNo: row.release_no,
      engineVersion: row.engine_version,
      status: row.status,
      failureCode: row.failure_code,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      createdBy: row.email ?? 'a member of the practice',
      coverage: row.coverage === null ? null : parseCoverage(row.coverage),
      rerun: row.status === 'complete' ? await rerunReasons(scope.client, { practiceId: row.practice_id, createdAt: row.created_at, releaseNo: row.release_no }) : [],
    });
  }
  return result;
}

async function readRuns(scope: Scope, requestId: string, where: string, values: unknown[], tail = ''): Promise<RunRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose: 'pricing_runs', requestId },
    async (client) => (await client.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM pricing_run r LEFT JOIN "user" u ON u.id = r.created_by WHERE ${where} ${tail}`, values)).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
}

export interface RunPage {
  readonly runs: readonly RunSummary[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** The practice's runs, newest first. */
export async function listRuns(scope: Scope, practiceId: string, page: number, requestId: string): Promise<RunPage> {
  const { rows } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM pricing_run WHERE practice_id = $1', [practiceId]);
  const total = rows[0]?.n ?? 0;
  const at = pagesOf(total, RUNS_PER_PAGE, page);
  const runs = await readRuns(scope, requestId, 'r.practice_id = $1', [practiceId], `ORDER BY r.created_at DESC, r.id LIMIT ${String(RUNS_PER_PAGE)} OFFSET ${String(at.offset)}`);
  return { runs: await summaries(scope, runs), page: at.page, pages: at.pages, total };
}

/** One run of the practice. */
export async function runSummary(scope: Scope, practiceId: string, runId: string, requestId: string): Promise<RunSummary | undefined> {
  const [row] = await readRuns(scope, requestId, 'r.practice_id = $1 AND r.id = $2', [practiceId, runId]);
  return row === undefined ? undefined : (await summaries(scope, [row]))[0];
}

/** The practice's latest complete run, or undefined before the first completes. */
export async function latestCompleteRun(scope: Scope, practiceId: string, requestId: string): Promise<RunSummary | undefined> {
  const [row] = await readRuns(scope, requestId, "r.practice_id = $1 AND r.status = 'complete'", [practiceId], 'ORDER BY r.completed_at DESC, r.id DESC LIMIT 1');
  return row === undefined ? undefined : (await summaries(scope, [row]))[0];
}

export async function runCount(scope: Scope, practiceId: string): Promise<number> {
  const { rows } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM pricing_run WHERE practice_id = $1', [practiceId]);
  return rows[0]?.n ?? 0;
}

/** Names for a run's opaque IDs: its payers, plans and the contract versions it priced under. */
export interface RunNames {
  readonly payers: Readonly<Record<string, string>>;
  readonly plans: Readonly<Record<string, string>>;
  readonly versions: Readonly<Record<string, { readonly contractId: string; readonly title: string; readonly versionNo: number; readonly effectiveFrom: string; readonly effectiveTo: string | null }>>;
}

export async function runNames(scope: Scope, practiceId: string, coverage: RunCoverage | null): Promise<RunNames> {
  if (coverage === null) {
    return { payers: {}, plans: {}, versions: {} };
  }
  const payerIds = [...new Set(coverage.patterns.map((pattern) => pattern.payer_id))];
  const planIds = [...new Set(coverage.patterns.map((pattern) => pattern.plan_id))];
  const versionIds = [...new Set(coverage.versions.map((version) => version.contract_version_id))];
  const payers = await scope.client.query<{ id: string; name: string }>('SELECT id, name_raw AS name FROM payer WHERE practice_id = $1 AND id = ANY ($2::uuid[])', [practiceId, payerIds]);
  const plans = await scope.client.query<{ id: string; key: string }>('SELECT id, plan_key AS key FROM plan WHERE practice_id = $1 AND id = ANY ($2::uuid[])', [practiceId, planIds]);
  const versions = await scope.client.query<{ id: string; contract_id: string; title: string; version_no: number; effective_from: string; effective_to: string | null }>(
    `SELECT v.id, v.contract_id, c.title, v.version_no, v.effective_from::text AS effective_from, v.effective_to::text AS effective_to
       FROM contract_version v JOIN contract c ON c.id = v.contract_id WHERE v.practice_id = $1 AND v.id = ANY ($2::uuid[])`,
    [practiceId, versionIds],
  );
  return {
    payers: Object.fromEntries(payers.rows.map((row) => [row.id, row.name])),
    plans: Object.fromEntries(plans.rows.map((row) => [row.id, row.key])),
    versions: Object.fromEntries(
      versions.rows.map((row) => [row.id, { contractId: row.contract_id, title: row.title, versionNo: row.version_no, effectiveFrom: row.effective_from, effectiveTo: row.effective_to }]),
    ),
  };
}

/** Which of a run's lines to list: all, the priced, the unpriced, or one reason's. */
export type RunLineFilter = 'all' | 'priced' | 'unpriced' | UnpricedReason;

export interface RunLine {
  readonly pricedLineId: string;
  readonly serviceLineId: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string | null;
  readonly method: string | null;
  readonly expectedAllowedCents: string | null;
  readonly observedAllowedCents: string;
  readonly varianceCents: string | null;
  readonly unpricedReason: UnpricedReason | null;
}

export interface RunLinePage {
  readonly lines: readonly RunLine[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

interface RunLineRow {
  readonly id: string;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly procedure_code: string;
  readonly modifiers: string[] | null;
  readonly units: string | null;
  readonly method: string | null;
  readonly expected_allowed_cents: string | null;
  readonly observed_allowed_cents: string;
  readonly variance_cents: string | null;
  readonly unpriced_reason: UnpricedReason | null;
}

/** A page of a run's lines, the largest shortfall first, then the unpriced. */
export async function runLines(scope: Scope, practiceId: string, runId: string, filter: RunLineFilter, page: number, requestId: string): Promise<RunLinePage> {
  const condition =
    filter === 'all' ? 'true' : filter === 'priced' ? 'p.unpriced_reason IS NULL' : filter === 'unpriced' ? 'p.unpriced_reason IS NOT NULL' : 'p.unpriced_reason = $3';
  const values: unknown[] = filter === 'all' || filter === 'priced' || filter === 'unpriced' ? [practiceId, runId] : [practiceId, runId, filter];
  const { rows } = await scope.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM priced_line p WHERE p.practice_id = $1 AND p.pricing_run_id = $2 AND ${condition}`, values);
  const total = rows[0]?.n ?? 0;
  const at = pagesOf(total, RUN_LINES_PER_PAGE, page);
  const found = await readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'pricing_runs', requestId },
    async (client) =>
      (
        await client.query<RunLineRow>(
          `SELECT p.id, p.practice_id, p.service_line_id, l.procedure_code, l.modifiers, trim_scale(l.units)::text AS units, p.method,
                  p.expected_allowed_cents::text AS expected_allowed_cents, p.observed_allowed_cents::text AS observed_allowed_cents,
                  p.variance_cents::text AS variance_cents, p.unpriced_reason
             FROM priced_line p JOIN service_line l ON l.id = p.service_line_id
            WHERE p.practice_id = $1 AND p.pricing_run_id = $2 AND ${condition}
            ORDER BY p.variance_cents DESC NULLS LAST, p.unpriced_reason, p.id
            LIMIT ${String(RUN_LINES_PER_PAGE)} OFFSET ${String(at.offset)}`,
          values,
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return {
    lines: found.map((row) => ({
      pricedLineId: row.id,
      serviceLineId: row.service_line_id,
      procedureCode: row.procedure_code,
      modifiers: (row.modifiers ?? []).filter((modifier) => modifier !== ''),
      units: row.units,
      method: row.method,
      expectedAllowedCents: row.expected_allowed_cents,
      observedAllowedCents: row.observed_allowed_cents,
      varianceCents: row.variance_cents,
      unpricedReason: row.unpriced_reason,
    })),
    page: at.page,
    pages: at.pages,
    total,
  };
}

/** One line as one complete run priced it, with the run it belongs to. */
export interface PricedLineView {
  readonly pricedLineId: string;
  readonly run: { readonly id: string; readonly periodFrom: string; readonly periodTo: string; readonly releaseNo: number; readonly manifestSha256: string; readonly engineVersion: string; readonly completedAt: string };
  readonly mappingId: string | null;
  readonly contractVersionId: string | null;
  readonly rateRecordId: string | null;
  readonly method: string | null;
  readonly expectedAllowedCents: string | null;
  readonly expectedUnrounded: string | null;
  readonly observedAllowedCents: string;
  readonly varianceCents: string | null;
  readonly unpricedReason: UnpricedReason | null;
  readonly adjustmentsApplied: readonly { readonly name: string; readonly before_cents: string; readonly after_cents: string }[];
  readonly windowEndsOn: string | null;
  /** The stored trace (tp-pricing-trace/1), for roles that read PHI; null for the others. */
  readonly trace: unknown;
}

/** A complete run that priced the line, for choosing which run's trace to show. */
export interface LineRunOption {
  readonly runId: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly completedAt: string;
  readonly unpricedReason: UnpricedReason | null;
}

interface PricedLineRow {
  readonly id: string;
  readonly practice_id: string;
  readonly pricing_run_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly release_no: number;
  readonly manifest_sha256: string;
  readonly engine_version: string;
  readonly completed_at: Date;
  readonly mapping_id: string | null;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly method: string | null;
  readonly expected_allowed_cents: string | null;
  readonly expected_unrounded: string | null;
  readonly observed_allowed_cents: string;
  readonly variance_cents: string | null;
  readonly unpriced_reason: UnpricedReason | null;
  readonly adjustments_applied: PricedLineView['adjustmentsApplied'];
  readonly window_ends_on: string | null;
  readonly trace: unknown;
}

/**
 * The line as a complete run priced it: the run asked for, or the latest complete run that priced the
 * line. Undefined when no complete run (or not that run) priced it. The trace is read only for roles
 * that read PHI (it carries the line's service and remittance dates).
 */
export async function pricedLineOf(scope: Scope, practiceId: string, serviceLineId: string, runId: string | null, withTrace: boolean, requestId: string): Promise<PricedLineView | undefined> {
  const [row] = await readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'line_trace', requestId },
    async (client) =>
      (
        await client.query<PricedLineRow>(
          `SELECT p.id, p.practice_id, p.pricing_run_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, rr.manifest_sha256,
                  r.engine_version, r.completed_at, p.mapping_id, p.contract_version_id, p.rate_record_id, p.method,
                  p.expected_allowed_cents::text AS expected_allowed_cents, p.expected_unrounded::text AS expected_unrounded,
                  p.observed_allowed_cents::text AS observed_allowed_cents, p.variance_cents::text AS variance_cents, p.unpriced_reason,
                  p.adjustments_applied, p.window_ends_on::text AS window_ends_on, CASE WHEN $4 THEN p.trace END AS trace
             FROM priced_line p
             JOIN pricing_run r ON r.id = p.pricing_run_id
             JOIN rule_release rr ON rr.release_no = r.release_no
            WHERE p.practice_id = $1 AND p.service_line_id = $2 AND r.status = 'complete' AND ($3::uuid IS NULL OR r.id = $3::uuid)
            ORDER BY r.completed_at DESC, r.id DESC
            LIMIT 1`,
          [practiceId, serviceLineId, runId, withTrace],
        )
      ).rows,
    (found) => ({ objectId: found.id, practiceId: found.practice_id }),
  );
  if (row === undefined) {
    return undefined;
  }
  return {
    pricedLineId: row.id,
    run: {
      id: row.pricing_run_id,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      releaseNo: row.release_no,
      manifestSha256: row.manifest_sha256,
      engineVersion: row.engine_version,
      completedAt: row.completed_at.toISOString(),
    },
    mappingId: row.mapping_id,
    contractVersionId: row.contract_version_id,
    rateRecordId: row.rate_record_id,
    method: row.method,
    expectedAllowedCents: row.expected_allowed_cents,
    expectedUnrounded: row.expected_unrounded,
    observedAllowedCents: row.observed_allowed_cents,
    varianceCents: row.variance_cents,
    unpricedReason: row.unpriced_reason,
    adjustmentsApplied: row.adjustments_applied,
    windowEndsOn: row.window_ends_on,
    trace: row.trace,
  };
}

/** The complete runs that priced the line, newest first. */
export async function lineRuns(scope: Scope, practiceId: string, serviceLineId: string): Promise<LineRunOption[]> {
  const { rows } = await scope.client.query<{ run_id: string; period_from: string; period_to: string; release_no: number; completed_at: Date; unpriced_reason: UnpricedReason | null }>(
    `SELECT r.id AS run_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, r.completed_at, p.unpriced_reason
       FROM priced_line p JOIN pricing_run r ON r.id = p.pricing_run_id
      WHERE p.practice_id = $1 AND p.service_line_id = $2 AND r.status = 'complete'
      ORDER BY r.completed_at DESC, r.id DESC LIMIT 50`,
    [practiceId, serviceLineId],
  );
  return rows.map((row) => ({ runId: row.run_id, periodFrom: row.period_from, periodTo: row.period_to, releaseNo: row.release_no, completedAt: row.completed_at.toISOString(), unpricedReason: row.unpriced_reason }));
}
