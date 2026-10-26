import type { DisputeWindowStart, DisputeWindowUnit } from '@tp/contracts';
import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import type { UnpricedReason } from '@tp/pricing';
import {
  ELIGIBLE_RUN,
  IN_EFFECT_SINCE,
  NEWER_BECAUSE,
  type NewerReason,
  OVERLAPPING_FIRST_RUN,
  RERUN_ACCEPTANCE,
  RUN_IN_EFFECT,
  type RerunAcceptance,
  type RerunReason,
  type RunCoverage,
  type SupersededKind,
  parseCoverage,
  rerunBlock,
  rerunReasons,
  supersededKind,
} from '@tp/worker/pricing';

/**
 * The Pricing runs, line trace, Claims and lines and Coverage reads of pricing (PRD 7; PRD 5, J7; PRD
 * 8, pricing_run and priced_line). Every read runs in the request's practice scope, under the
 * practice's policies, and every run and priced line returned is an audited read (readWithAudit).
 * Amounts are integer cents as text. A run never changes once complete, so what these show of one is
 * what it priced.
 *
 * Which run is in effect (docs/adr/0037): a complete first run of its period is, from when it
 * completes; a re-run only once a person accepts it, from then on ("nothing is accepted until a
 * person accepts the new run"). For a period, the run in effect is the eligible run that took effect
 * last; Claims and lines read, for each line, the eligible run that priced it last, and Coverage the
 * eligible run that took effect last.
 *
 * Whether a re-run can still be accepted (combined audit #10; docs/adr/0037, amendment of 2026-10-26;
 * test matrix PRC-25 to PRC-28) is the worker's rule too: a re-run is accepted only while nothing in
 * effect for overlapping service dates is newer than it, and only while no first run of those dates is
 * being priced; only the run in effect for its period is re-run. Every run listed carries where its
 * acceptance stands (RunSummary.acceptance), and a re-run's page reads the runs to name from rerunBlock,
 * the statement acceptRun judges by, so the page and the refusal never disagree.
 */

type Scope = PracticeScope<ScopeClient>;

// The rule of which run is in effect is the worker's (triage and the audit report read it too).
export { ELIGIBLE_RUN, IN_EFFECT_SINCE, RUN_IN_EFFECT };

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
  /** Who created the run: their email, as the practice's members see it, or the monitoring chain (docs/adr/0039). */
  readonly createdBy: string;
  /** Whether the monitoring chain created the run (its job, not a person). */
  readonly monitoring: boolean;
  readonly coverage: RunCoverage | null;
  /** Why a new run of the same period would price differently (complete runs only; MAP-03). */
  readonly rerun: readonly RerunReason[];
  /** The complete run this one prices again, for a re-run. */
  readonly rerunOfId: string | null;
  /** When a person accepted this re-run, and who; null until then (and for a first run). */
  readonly acceptedAt: string | null;
  readonly acceptedBy: string | null;
  /** Whether it is the run in effect for its period. */
  readonly inEffect: boolean;
  /** The content rollback that withdrew the run's release: the run is flagged, never changed. */
  readonly withdrawal: { readonly reinstatedReleaseNo: number; readonly withdrawnAt: string; readonly reason: string } | null;
  /**
   * For a complete re-run nobody has accepted: pinned to a withdrawn release, superseded (something in effect for
   * overlapping service dates is newer, so it can no longer be accepted), waiting while a first run of overlapping
   * dates is being priced, or awaiting a person (PRC-25 to PRC-28). Null for every other run. The worker's
   * RERUN_ACCEPTANCE, in acceptRun's order of refusals, so no badge offers what acceptRun would refuse.
   */
  readonly acceptance: RerunAcceptance | null;
}

export type { NewerReason, RerunAcceptance };

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
  readonly monitoring: boolean;
  readonly coverage: unknown;
  readonly rerun_of_id: string | null;
  readonly accepted_at: Date | null;
  readonly accepted_email: string | null;
  readonly in_effect: boolean;
  readonly reinstated_release_no: number | null;
  readonly withdrawn_at: Date | null;
  readonly withdrawal_reason: string | null;
  readonly acceptance: RerunAcceptance | null;
}

const RUN_COLUMNS = `r.id, r.practice_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, r.engine_version, r.status,
  r.failure_code, r.created_at, r.completed_at, u.email, r.created_by_job_id IS NOT NULL AS monitoring, r.coverage, r.rerun_of_id, r.accepted_at, ua.email AS accepted_email,
  ${RUN_IN_EFFECT('r')} AS in_effect, w.reinstated_release_no, w.withdrawn_at, w.reason AS withdrawal_reason,
  ${RERUN_ACCEPTANCE('r')} AS acceptance`;

const RUN_FROM = `pricing_run r LEFT JOIN "user" u ON u.id = r.created_by LEFT JOIN "user" ua ON ua.id = r.accepted_by
  LEFT JOIN rule_release_withdrawal w ON w.release_no = r.release_no`;

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
      createdBy: row.monitoring ? 'monitoring (the monthly chain, on new files)' : (row.email ?? 'a member of the practice'),
      monitoring: row.monitoring,
      coverage: row.coverage === null ? null : parseCoverage(row.coverage),
      rerun: row.status === 'complete' ? await rerunReasons(scope.client, { practiceId: row.practice_id, createdAt: row.created_at, releaseNo: row.release_no }) : [],
      rerunOfId: row.rerun_of_id,
      acceptedAt: row.accepted_at?.toISOString() ?? null,
      acceptedBy: row.accepted_at === null ? null : (row.accepted_email ?? 'a member of the practice'),
      inEffect: row.in_effect,
      withdrawal:
        row.reinstated_release_no === null || row.withdrawn_at === null
          ? null
          : { reinstatedReleaseNo: row.reinstated_release_no, withdrawnAt: row.withdrawn_at.toISOString(), reason: row.withdrawal_reason ?? '' },
      acceptance: row.acceptance,
    });
  }
  return result;
}

async function readRuns(scope: Scope, requestId: string, where: string, values: unknown[], tail = ''): Promise<RunRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose: 'pricing_runs', requestId },
    async (client) => (await client.query<RunRow>(`SELECT ${RUN_COLUMNS} FROM ${RUN_FROM} WHERE ${where} ${tail}`, values)).rows,
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

/** The practice's run that took effect last (a complete first run, or an accepted re-run), or undefined before one completes. */
export async function latestRunInEffect(scope: Scope, practiceId: string, requestId: string): Promise<RunSummary | undefined> {
  const [row] = await readRuns(scope, requestId, `r.practice_id = $1 AND ${ELIGIBLE_RUN('r')}`, [practiceId], `ORDER BY ${IN_EFFECT_SINCE('r')} DESC, r.id DESC LIMIT 1`);
  return row === undefined ? undefined : (await summaries(scope, [row]))[0];
}

/** The runs that price a run again, newest first. */
export async function rerunsOf(scope: Scope, practiceId: string, runId: string, requestId: string): Promise<RunSummary[]> {
  return summaries(scope, await readRuns(scope, requestId, 'r.practice_id = $1 AND r.rerun_of_id = $2', [practiceId, runId], 'ORDER BY r.created_at DESC, r.id'));
}

/** The runs of the practice with these IDs, in the order given (each an audited read); an ID not found is left out. */
async function runsById(scope: Scope, practiceId: string, ids: readonly string[], requestId: string): Promise<RunSummary[]> {
  if (ids.length === 0) {
    return [];
  }
  const found = await summaries(scope, await readRuns(scope, requestId, 'r.practice_id = $1 AND r.id = ANY ($2::uuid[])', [practiceId, ids]));
  return ids.flatMap((id) => found.filter((run) => run.id === id));
}

/** The run in effect for one exact period of the practice (RUN_IN_EFFECT), or null when none is. */
export async function periodRunInEffect(scope: Scope, practiceId: string, periodFrom: string, periodTo: string, requestId: string): Promise<RunSummary | null> {
  const [row] = await readRuns(scope, requestId, `r.practice_id = $1 AND r.period_from = $2::date AND r.period_to = $3::date AND ${RUN_IN_EFFECT('r')}`, [practiceId, periodFrom, periodTo]);
  return row === undefined ? null : ((await summaries(scope, [row]))[0] ?? null);
}

/**
 * The first runs of periods overlapping a run's that are queued or being priced, oldest first: while any is, the
 * run is not re-run (createRerun refuses newer_run_pending), and the screens name them in the Re-run button's
 * place. The same condition as the worker's NEWER_RUN_PENDING.
 */
export async function pendingFirstRuns(scope: Scope, practiceId: string, runId: string, requestId: string): Promise<RunSummary[]> {
  return summaries(
    scope,
    await readRuns(
      scope,
      requestId,
      `r.practice_id = $1 AND EXISTS (SELECT 1 FROM pricing_run t WHERE t.id = $2 AND t.practice_id = $1 AND ${OVERLAPPING_FIRST_RUN('r', 't', ['queued', 'running'])})`,
      [practiceId, runId],
      'ORDER BY r.created_at, r.id',
    ),
  );
}

/**
 * Whether a complete, unaccepted re-run can be accepted now, with the runs to name (docs/adr/0037, amendment of
 * 2026-10-26). acceptable: the run its acceptance replaces, the run in effect for its exact period, which its diff is
 * against, and the first runs of overlapping periods still queued (acceptance does not wait for them; each takes
 * effect after it once priced). superseded: which wording applies (supersededKind, as the worker's refusal chooses
 * it), the runs that supersede it, newest in effect first, with why each is newer (NEWER_BECAUSE: priced after it,
 * pinned to a later release or split, or holding lines loaded later), its original, the run in effect for its exact
 * period (the one to re-run instead) and the first runs pending for that run (while any is, no Re-run button is
 * offered). newer_run_pending: the first runs of overlapping periods being priced, oldest first.
 */
export type RerunAcceptanceView =
  | { readonly state: 'acceptable'; readonly replaces: RunSummary; readonly queued: readonly RunSummary[] }
  | {
      readonly state: 'superseded';
      readonly kind: SupersededKind;
      readonly superseding: readonly RunSummary[];
      /** Why each superseding run is newer than the re-run, by its ID; null when no clause reads (never while it supersedes). */
      readonly newerBy: Readonly<Record<string, NewerReason | null>>;
      readonly original: RunSummary | null;
      readonly inEffect: RunSummary | null;
      readonly inEffectPending: readonly RunSummary[];
    }
  | { readonly state: 'newer_run_pending'; readonly running: readonly RunSummary[] };

/**
 * rerunBlock's answer for a complete, unaccepted re-run, as run summaries for the links (each an audited read). Read
 * in the request's scope, without acceptRun's lock: a page says what holds now, and acceptRun judges again under the
 * lock, so a page read just before a change is refused, never wrongly accepted.
 */
export async function rerunAcceptance(scope: Scope, practiceId: string, run: RunSummary, requestId: string): Promise<RerunAcceptanceView> {
  const block = await rerunBlock(scope.client, practiceId, run.id);
  if (block.state === 'acceptable') {
    const [replaces] = await runsById(scope, practiceId, [block.replacesId], requestId);
    if (replaces === undefined) {
      throw new Error('the run a re-run replaces was not read');
    }
    return { state: 'acceptable', replaces, queued: await pendingFirstRuns(scope, practiceId, run.id, requestId) };
  }
  if (block.state === 'newer_run_pending') {
    return { state: 'newer_run_pending', running: await runsById(scope, practiceId, block.runningIds, requestId) };
  }
  const kind = supersededKind(block);
  const [original] = run.rerunOfId === null ? [] : await runsById(scope, practiceId, [run.rerunOfId], requestId);
  const [inEffect] = block.inEffectId === null ? [] : await runsById(scope, practiceId, [block.inEffectId], requestId);
  const superseding = await runsById(scope, practiceId, kind === 'same_period' ? block.samePeriodIds : block.otherPeriodIds, requestId);
  const { rows } = await scope.client.query<{ id: string; because: NewerReason | null }>(
    `SELECT x.id, ${NEWER_BECAUSE('x', 'r')} AS because FROM pricing_run x JOIN pricing_run r ON r.id = $2 AND r.practice_id = x.practice_id
      WHERE x.practice_id = $1 AND x.id = ANY ($3::uuid[])`,
    [practiceId, run.id, superseding.map((item) => item.id)],
  );
  return {
    state: 'superseded',
    kind,
    superseding,
    newerBy: Object.fromEntries(superseding.map((item) => [item.id, rows.find((row) => row.id === item.id)?.because ?? null])),
    original: original ?? null,
    inEffect: inEffect ?? null,
    inEffectPending: inEffect === undefined ? [] : await pendingFirstRuns(scope, practiceId, inEffect.id, requestId),
  };
}

/** A complete run, for choosing two to compare. */
export interface RunOption {
  readonly id: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly completedAt: string;
  readonly rerunOfId: string | null;
  readonly inEffect: boolean;
}

/** The practice's complete runs (the newest 200), newest first. */
export async function completeRunOptions(scope: Scope, practiceId: string): Promise<RunOption[]> {
  const { rows } = await scope.client.query<{ id: string; period_from: string; period_to: string; release_no: number; completed_at: Date; rerun_of_id: string | null; in_effect: boolean }>(
    `SELECT r.id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, r.completed_at, r.rerun_of_id, ${RUN_IN_EFFECT('r')} AS in_effect
       FROM pricing_run r WHERE r.practice_id = $1 AND r.status = 'complete' ORDER BY r.completed_at DESC, r.id LIMIT 200`,
    [practiceId],
  );
  return rows.map((row) => ({
    id: row.id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    releaseNo: row.release_no,
    completedAt: row.completed_at.toISOString(),
    rerunOfId: row.rerun_of_id,
    inEffect: row.in_effect,
  }));
}

/** The practice's runs in effect, one per period (each an audited read), latest period first. */
export async function runsInEffect(scope: Scope, practiceId: string, requestId: string): Promise<RunSummary[]> {
  return summaries(scope, await readRuns(scope, requestId, `r.practice_id = $1 AND ${RUN_IN_EFFECT('r')}`, [practiceId], 'ORDER BY r.period_from DESC, r.period_to DESC, r.id'));
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
  /**
   * The contract version's cited window when its rule is not the one the engine counts (calendar days after the payment
   * date, contract_window_rule_computed()): its length and rule, so the screen states the rule in words and not the
   * engine's date, which counts the length another way (audit item #5; PR 6c computes it). Null when the rule is the
   * computed one or none is cited.
   */
  readonly windowRuleNotComputed: { readonly length: number; readonly rule: { readonly unit: DisputeWindowUnit; readonly measuredFrom: DisputeWindowStart } } | null;
  /** The stored trace (tp-pricing-trace/2), for roles that read PHI; null for the others. */
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
  /** A re-run no one has accepted yet: not in effect. */
  readonly awaitingAcceptance: boolean;
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
  readonly window_rule_length: number | null;
  readonly window_rule_unit: DisputeWindowUnit | null;
  readonly window_rule_measured_from: DisputeWindowStart | null;
  readonly trace: unknown;
}

/**
 * The line as a complete run priced it: the run asked for, or else the eligible run (a first run or an
 * accepted re-run) that priced it and took effect last. Undefined when no such run (or not that run)
 * priced it. The trace is read only for roles that read PHI (it carries the line's service and
 * payment dates: BPR16, which the engine's trace labels remittance_date).
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
                  p.adjustments_applied, p.window_ends_on::text AS window_ends_on, CASE WHEN $4 THEN p.trace END AS trace,
                  cv.dispute_window_days AS window_rule_length, cv.dispute_window_unit AS window_rule_unit, cv.dispute_window_measured_from AS window_rule_measured_from
             FROM priced_line p
             JOIN pricing_run r ON r.id = p.pricing_run_id
             JOIN rule_release rr ON rr.release_no = r.release_no
             LEFT JOIN contract_version cv ON cv.id = p.contract_version_id AND cv.practice_id = p.practice_id
                   AND cv.dispute_window_unit IS NOT NULL AND cv.dispute_window_days IS NOT NULL
                   AND NOT contract_window_rule_computed(cv.dispute_window_unit, cv.dispute_window_measured_from)
            WHERE p.practice_id = $1 AND p.service_line_id = $2 AND r.status = 'complete' AND ($3::uuid IS NOT NULL OR ${ELIGIBLE_RUN('r')}) AND ($3::uuid IS NULL OR r.id = $3::uuid)
            ORDER BY ${IN_EFFECT_SINCE('r')} DESC, r.id DESC
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
    windowRuleNotComputed:
      row.window_rule_length === null || row.window_rule_unit === null || row.window_rule_measured_from === null
        ? null
        : { length: row.window_rule_length, rule: { unit: row.window_rule_unit, measuredFrom: row.window_rule_measured_from } },
    trace: row.trace,
  };
}

/** The complete runs that priced the line, newest first. */
export async function lineRuns(scope: Scope, practiceId: string, serviceLineId: string): Promise<LineRunOption[]> {
  const { rows } = await scope.client.query<{ run_id: string; period_from: string; period_to: string; release_no: number; completed_at: Date; unpriced_reason: UnpricedReason | null; awaiting: boolean }>(
    `SELECT r.id AS run_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, r.completed_at, p.unpriced_reason,
            NOT ${ELIGIBLE_RUN('r')} AS awaiting
       FROM priced_line p JOIN pricing_run r ON r.id = p.pricing_run_id
      WHERE p.practice_id = $1 AND p.service_line_id = $2 AND r.status = 'complete'
      ORDER BY r.completed_at DESC, r.id DESC LIMIT 50`,
    [practiceId, serviceLineId],
  );
  return rows.map((row) => ({
    runId: row.run_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    releaseNo: row.release_no,
    completedAt: row.completed_at.toISOString(),
    unpricedReason: row.unpriced_reason,
    awaitingAcceptance: row.awaiting,
  }));
}
