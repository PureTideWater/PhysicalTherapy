import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { type Cents, centsToString, parseCents } from '@tp/money';
import { parseTrace } from '@tp/pricing';
import {
  type AnomalyCohort,
  BEHAVIOR_RECORD_TYPES,
  type BehaviorReferences,
  type CandidateLine,
  type PatternKey,
  type ScreenedLine,
  type TriageSettings,
  detectBehavior,
  judgeLine,
  patternId,
  planCases,
  pursuitCost,
  releaseReferences,
  screenAnomalies,
  triageSettings,
} from '@tp/triage';

import { PRICED_IN_EFFECT, RUN_IN_EFFECT } from '../price/in-effect';
import { type ContentSpans, contentGapsOf, releaseContentSpans, typedRelease } from '../price/release';
import { lineDeadlines } from './deadline';

/**
 * Triage of the pricing run in effect for its period (PRD 12; PRD 5, J8 and J17; PRD 8, The status
 * machine; test matrix CAS-01 to CAS-05, PRC-14, PRC-15; docs/adr/0037: a complete first run, or a
 * re-run once a person accepts it; never a re-run awaiting acceptance nor a run an accepted re-run
 * replaced, whose numbers did not go through acceptance), on its triage date, in the run's one
 * practice (the job's scope), in one transaction, one practice at a time (an advisory lock), and
 * idempotent: a triage run again finds what it recorded and adds only what has changed since (a window
 * that closed, lines that now carry a pattern across the case materiality).
 *
 * Every line is judged from its pricing in effect (PRICED_IN_EFFECT: its priced line in the run in
 * effect that took effect last), never from the priced line an earlier triage validated it on: a line
 * an accepted re-run prices again is judged by the re-run's numbers.
 *
 * 1. Anomaly screening (@tp/triage screenAnomalies) of the practice's lines that cannot be priced in
 *    effect whose service dates fall in the quarters the run's period touches (PRD 12: the cohort is
 *    the quarter's, across the month runs of the monitoring chain): one anomaly per cohort, written
 *    once per run; the lines short of the mode are flagged (a stage, a count, never a dollar claim).
 * 2. The run's lines, and the lines earlier triage validated whose patterns were below the case
 *    materiality (they accumulate), each judged from its pricing in effect on the triage date: a line
 *    whose shortfall is positive (for a per-visit line, its visit's net shortfall at most) is
 *    validated, and grouped by payer pattern: its payer and plan, its rate record and the adjustment
 *    behavior detected from its trace (under its own run's release). A pattern with an open case adds
 *    its lines to it; one at or above the case materiality opens a case with the pursuit-cost estimate
 *    the practice's settings give; a smaller one waits. A line joining a case is actionable, or struck
 *    through (written off, window passed) when its window has closed. A per-visit line and a line with
 *    an NCCI review flag stay validated for a person's review (docs/adr/0040), and so does a line whose trace read
 *    the MPPR or the MUE on a date its release does not load them for (CONTENT_NOT_LOADED; audit #7). The release
 *    is read for its MPPR rates and conversion factors alone (BEHAVIOR_RECORD_TYPES; audit #31), and its spans.
 * 3. Every open case's line whose window closed by the triage date is written off, window passed: it
 *    leaves the case's actionable total and stays visible (the monitoring schedule's daily monitor job
 *    does the same, closePassedWindows). The case's totals, deadline and state are the database's,
 *    derived from its lines.
 *
 * Negative variance never reaches a case: an overpaid line is recorded on its priced line and shown.
 */

export interface TriageJobContext {
  readonly jobId: string;
  readonly logger: Logger;
  transaction<T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>): Promise<T>;
}

export interface TriageOptions {
  /** The triage date; today in UTC unless a test names one. */
  readonly asOf?: string;
}

export interface TriageSummary {
  readonly asOf: string;
  readonly anomalies: number;
  readonly flaggedLines: number;
  readonly validatedLines: number;
  readonly casesOpened: number;
  readonly linesAdded: number;
  readonly heldPatterns: number;
  readonly windowsClosed: number;
}

export type TriageOutcome =
  | { readonly outcome: 'triaged'; readonly summary: TriageSummary }
  | { readonly outcome: 'not_complete' }
  /** Complete, but not the run in effect for its period: a re-run nobody has accepted, or a run since replaced. */
  | { readonly outcome: 'not_in_effect' }
  | { readonly outcome: 'missing' };

/** Today's date in UTC: the date the windows and the database's write-off rules are judged on. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

interface RunRow {
  readonly id: string;
  readonly status: string;
  readonly release_no: number;
  readonly in_effect: boolean;
  readonly period_from: string;
  readonly period_to: string;
}

interface ScreenRow {
  readonly service_line_id: string;
  readonly practice_id: string;
  readonly unpriced_reason: string;
  readonly payer_id: string;
  readonly plan_id: string;
  readonly procedure_code: string;
  readonly modifiers: readonly string[] | null;
  readonly place_of_service: string | null;
  readonly service_date: string;
  readonly units: string;
  readonly observed_allowed_cents: string;
}

export interface CandidateRow {
  readonly priced_line_id: string;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly release_no: number;
  readonly variance_cents: string;
  readonly window_ends_on: string | null;
  readonly trace: unknown;
  readonly mapping_kind: string | null;
  /** Whether the mapping it priced under is still the plan's mapping in force on its service date (payer_plan_mapping_in_force()). */
  readonly mapping_in_force: boolean;
  readonly contract_version_id: string | null;
  readonly version_status: string | null;
  /** Whether the version still covers the line's service date (true without a version). */
  readonly version_covers_service: boolean;
  /** Whether the run's rule release has a withdrawal. */
  readonly release_withdrawn: boolean;
  readonly rate_record_id: string | null;
  readonly payer_id: string;
  readonly plan_id: string;
  readonly reversed: boolean;
  readonly superseded: boolean;
  readonly written_off: boolean;
  readonly visit_variance_cents: string | null;
  readonly review_flags: readonly { readonly flag: string }[];
}

async function lockedRun(client: ScopeClient, practiceId: string, pricingRunId: string): Promise<RunRow | undefined> {
  const { rows } = await client.query<RunRow>(
    `SELECT r.id, r.status, r.release_no, ${RUN_IN_EFFECT('r')} AS in_effect, r.period_from::text, r.period_to::text FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2`,
    [
    pricingRunId,
    practiceId,
    ],
  );
  return rows[0];
}

/**
 * The lines screening compares: the practice's lines that cannot be priced in effect (their pricing in
 * effect has an unpriced reason) whose service dates fall in a quarter the run's period touches, with
 * what screening compares them by. A quarter's cohort gathers its lines from every month run of it.
 */
async function screenedLines(scope: PracticeScope<ScopeClient>, practiceId: string, run: RunRow, requestId: string): Promise<ScreenedLine[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'triage', requestId },
    async (client) =>
      (
        await client.query<ScreenRow & { id: string }>(
          `WITH quarter_lines AS (
             SELECT l.id FROM service_line l JOIN claim c ON c.id = l.claim_id
              WHERE l.practice_id = $1
                AND coalesce(l.service_date, c.service_from) >= date_trunc('quarter', $2::date)::date
                AND coalesce(l.service_date, c.service_from) < (date_trunc('quarter', $3::date) + interval '3 months')::date
           ), in_effect AS (${PRICED_IN_EFFECT('$1', 'p.service_line_id IN (SELECT id FROM quarter_lines)')})
           SELECT p.id, p.practice_id, p.service_line_id, p.unpriced_reason, pl.payer_id, pl.id AS plan_id, l.procedure_code, l.modifiers, l.place_of_service,
                  coalesce(l.service_date, c.service_from)::text AS service_date, trim_scale(coalesce(l.units, 1))::text AS units, p.observed_allowed_cents::text
             FROM in_effect p
             JOIN service_line l ON l.id = p.service_line_id
             JOIN claim c ON c.id = l.claim_id
             JOIN plan pl ON pl.id = l.payer_plan_key
            WHERE p.unpriced_reason IS NOT NULL
            ORDER BY p.service_line_id`,
          [practiceId, run.period_from, run.period_to],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return rows.map((row) => ({
    serviceLineId: row.service_line_id,
    payerId: row.payer_id,
    planId: row.plan_id,
    procedureCode: row.procedure_code,
    modifiers: (row.modifiers ?? []).filter((modifier) => modifier !== ''),
    placeOfService: row.place_of_service,
    serviceDate: row.service_date,
    units: row.units,
    observedAllowedCents: parseCents(row.observed_allowed_cents),
    unpricedReason: row.unpriced_reason,
  }));
}

/**
 * The lines that may be validated and in no case yet, each from its pricing in effect with positive
 * variance: the run's own lines, and the lines an earlier triage validated whose pattern was held below
 * the case materiality (only those when no run is named: the workbench's patterns waiting for a case).
 * A line whose pricing in effect no longer shows a shortfall (an accepted re-run priced it again at
 * what was paid) or that no run in effect prices is left out.
 */
export async function candidateRows(scope: PracticeScope<ScopeClient>, practiceId: string, pricingRunId: string | null, requestId: string): Promise<CandidateRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'triage', requestId },
    async (client) =>
      (
        await client.query<CandidateRow>(
          `WITH current_stage AS (
             SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.stage
               FROM line_status s WHERE s.practice_id = $1 ORDER BY s.service_line_id, s.seq DESC
           ), wanted AS (
             SELECT x.service_line_id FROM priced_line x WHERE x.pricing_run_id = $2 AND x.practice_id = $1
             UNION
             SELECT cs.service_line_id FROM current_stage cs WHERE cs.stage = 'validated'
           ), in_effect AS (${PRICED_IN_EFFECT('$1', 'p.service_line_id IN (SELECT service_line_id FROM wanted)')})
           SELECT p.id AS priced_line_id, p.practice_id, p.service_line_id, r.release_no, p.variance_cents::text, p.window_ends_on::text, p.trace,
                  m.mapping_kind, p.contract_version_id, v.status AS version_status,
                  coalesce(payer_plan_mapping_in_force(l.payer_plan_key, coalesce(l.service_date, c.service_from)) = p.mapping_id, false) AS mapping_in_force,
                  (p.contract_version_id IS NULL OR coalesce(v.effective_from <= coalesce(l.service_date, c.service_from)
                     AND (v.effective_to IS NULL OR coalesce(l.service_date, c.service_from) < v.effective_to), false)) AS version_covers_service,
                  EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no) AS release_withdrawn,
                  p.rate_record_id, pl.payer_id, pl.id AS plan_id,
                  (c.claim_status_code = '22' OR EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)) AS reversed,
                  c.superseded_by_claim_id IS NOT NULL AS superseded,
                  false AS written_off,
                  priced_line_visit_variance_cents(p.id)::text AS visit_variance_cents,
                  coalesce(p.trace #> '{outcome,review_flags}', '[]'::jsonb) AS review_flags
             FROM in_effect p
             JOIN pricing_run r ON r.id = p.pricing_run_id
             JOIN service_line l ON l.id = p.service_line_id
             JOIN claim c ON c.id = l.claim_id
             JOIN plan pl ON pl.id = l.payer_plan_key
             LEFT JOIN payer_plan_mapping m ON m.id = p.mapping_id
             LEFT JOIN contract_version v ON v.id = p.contract_version_id
            WHERE p.variance_cents > 0
              AND NOT EXISTS (SELECT 1 FROM case_line cl WHERE cl.service_line_id = p.service_line_id)
            ORDER BY p.service_line_id`,
          [practiceId, pricingRunId],
        )
      ).rows,
    (row) => ({ objectId: row.priced_line_id, practiceId: row.practice_id }),
  );
}

/** What triage reads of a release: the behavior references (its MPPR rates and conversion factors alone) and the spans of the contents it loads. */
interface ReleaseFacts {
  readonly references: BehaviorReferences;
  readonly spans: ContentSpans;
}

async function readReleaseFacts(client: ScopeClient, releaseNo: number): Promise<ReleaseFacts> {
  return { references: releaseReferences(await typedRelease(client, releaseNo, BEHAVIOR_RECORD_TYPES)), spans: await releaseContentSpans(client, releaseNo) };
}

/** The facts of each release the candidates were priced under, read once each. */
function factsByRelease(client: ScopeClient): (releaseNo: number) => Promise<ReleaseFacts> {
  const loaded = new Map<number, Promise<ReleaseFacts>>();
  return async (releaseNo) => {
    let facts = loaded.get(releaseNo);
    if (facts === undefined) {
      facts = readReleaseFacts(client, releaseNo);
      loaded.set(releaseNo, facts);
    }
    return facts;
  };
}

/**
 * The candidates as @tp/triage judges them: each with its pattern (the adjustment behavior detected from its
 * trace), whether its deadline is verified (lineDeadlines: D17 a, at L2), a line the loader cannot read being
 * unverified, and whether its trace read the MPPR or the MUE on a date its release's spans do not cover (audit #7).
 */
export async function candidateLines(client: ScopeClient, rows: readonly CandidateRow[]): Promise<CandidateLine[]> {
  const releases = factsByRelease(client);
  const deadlines = await lineDeadlines(
    client,
    rows.map((row) => row.priced_line_id),
  );
  const lines: CandidateLine[] = [];
  for (const row of rows) {
    const trace = parseTrace(row.trace);
    const release = await releases(row.release_no);
    const behavior = detectBehavior(trace, release.references);
    const pattern: PatternKey = {
      payer_id: row.payer_id,
      plan_id: row.plan_id,
      mapping_kind: row.mapping_kind ?? 'contract',
      contract_version_id: row.contract_version_id,
      rate_record_id: row.rate_record_id,
      behavior,
    };
    lines.push({
      serviceLineId: row.service_line_id,
      pricedLineId: row.priced_line_id,
      pattern,
      varianceCents: parseCents(row.variance_cents),
      windowEndsOn: row.window_ends_on,
      deadlineStatus: deadlines.get(row.priced_line_id)?.status ?? 'unverified',
      windowRuleComputed: deadlines.get(row.priced_line_id)?.cause !== 'CONTRACT_WINDOW_RULE_NOT_COMPUTED',
      claimReversed: row.reversed,
      claimSuperseded: row.superseded,
      mappingKind: row.mapping_kind,
      mappingInForce: row.mapping_in_force,
      contractVersionStatus: row.version_status,
      contractVersionCoversService: row.version_covers_service,
      releaseWithdrawn: row.release_withdrawn,
      contentNotLoaded: contentGapsOf(trace, release.spans).length > 0,
      writtenOff: row.written_off,
      visitVarianceCents: row.visit_variance_cents === null ? null : parseCents(row.visit_variance_cents),
      reviewFlags: row.review_flags.map((flag) => flag.flag),
    });
  }
  return lines;
}

/** Stage events for lines that are not yet at the stage: forward only, the priced line named. */
async function advanceStages(client: ScopeClient, practiceId: string, stage: 'flagged' | 'validated' | 'actionable', lines: readonly { readonly serviceLineId: string; readonly pricedLineId: string | null }[]): Promise<number> {
  if (lines.length === 0) {
    return 0;
  }
  const { rowCount } = await client.query(
    `WITH wanted AS (
       SELECT t.service_line_id, t.priced_line_id FROM unnest($2::uuid[], $3::uuid[]) AS t (service_line_id, priced_line_id)
     ), current_stage AS (
       SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.stage FROM line_status s
        WHERE s.practice_id = $1 AND s.service_line_id IN (SELECT service_line_id FROM wanted) ORDER BY s.service_line_id, s.seq DESC
     )
     INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id)
     SELECT $1, w.service_line_id, $4, w.priced_line_id FROM wanted w LEFT JOIN current_stage cs ON cs.service_line_id = w.service_line_id
      WHERE cs.stage IS NULL OR line_stage_rank(cs.stage) < line_stage_rank($4)
      ORDER BY w.service_line_id`,
    [practiceId, lines.map((line) => line.serviceLineId), lines.map((line) => line.pricedLineId), stage],
  );
  return rowCount ?? 0;
}

async function storeAnomalies(client: ScopeClient, practiceId: string, pricingRunId: string, anomalies: readonly AnomalyCohort[]): Promise<number> {
  if (anomalies.length === 0) {
    return 0;
  }
  const { rowCount } = await client.query(
    `INSERT INTO anomaly (practice_id, pricing_run_id, cohort_key, cohort_size, modal_allowed_cents, stats, line_ids)
     SELECT $1, $2, a.cohort_key, a.cohort_size, a.modal_allowed_cents, a.stats, a.line_ids
       FROM jsonb_to_recordset($3::jsonb) AS a (cohort_key jsonb, cohort_size integer, modal_allowed_cents bigint, stats jsonb, line_ids uuid[])
     ON CONFLICT (pricing_run_id, cohort_key) DO NOTHING`,
    [
      practiceId,
      pricingRunId,
      JSON.stringify(
        anomalies.map((anomaly) => ({
          cohort_key: anomaly.cohortKey,
          cohort_size: anomaly.cohortSize,
          modal_allowed_cents: centsToString(anomaly.modalAllowedCents),
          stats: anomaly.stats,
          line_ids: anomaly.lineIds,
        })),
      ),
    ],
  );
  return rowCount ?? 0;
}

export async function openCases(client: ScopeClient, practiceId: string): Promise<Map<string, string>> {
  const { rows } = await client.query<{ id: string; pattern_key: PatternKey }>(`SELECT id, pattern_key FROM "case" WHERE practice_id = $1 AND state = 'open'`, [practiceId]);
  return new Map(rows.map((row) => [patternId(row.pattern_key), row.id]));
}

export async function insertCaseLines(client: ScopeClient, practiceId: string, caseId: string, lines: readonly { readonly serviceLineId: string; readonly pricedLineId: string; readonly windowPassed: boolean }[]): Promise<void> {
  await client.query(
    `INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id, written_off_reason)
     SELECT $1, $2, t.service_line_id, t.priced_line_id, CASE WHEN t.window_passed THEN 'window_passed' END
       FROM unnest($3::uuid[], $4::uuid[], $5::boolean[]) AS t (service_line_id, priced_line_id, window_passed)
      ORDER BY t.service_line_id`,
    [practiceId, caseId, lines.map((line) => line.serviceLineId), lines.map((line) => line.pricedLineId), lines.map((line) => line.windowPassed)],
  );
}

export async function openCase(client: ScopeClient, practiceId: string, pattern: PatternKey, settings: TriageSettings, pursuit: Cents | null): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO "case" (practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents, pursuit_cost_cents) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [practiceId, JSON.stringify(pattern), pattern.payer_id, pattern.plan_id, pattern.rate_record_id, centsToString(settings.caseMaterialityCents), pursuit === null ? null : centsToString(pursuit)],
  );
  return (rows[0] as { id: string }).id;
}

/** One triage of a practice at a time, whatever the queue does (and the daily monitor's window closing beside it). */
export async function lockPractice(client: ScopeClient, practiceId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('triage:' || $1::text, 0))", [practiceId]);
}

/** Open cases' lines whose windows closed before the triage date: written off by triage, window passed. */
async function closeWindows(client: ScopeClient, practiceId: string, asOf: string): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE case_line cl SET written_off_reason = 'window_passed'
       FROM priced_line p, "case" c
      WHERE cl.practice_id = $1 AND p.id = cl.priced_line_id AND c.id = cl.case_id AND c.state = 'open'
        AND cl.written_off_reason IS NULL AND p.window_ends_on < $2::date`,
    [practiceId, asOf],
  );
  return rowCount ?? 0;
}

/**
 * Writes off, window passed, every open case's line whose window closed before `asOf` (PRD 12,
 * Deadlines: "lines whose windows close are struck through and leave the actionable total"), in the
 * practice's job scope: the daily monitor job runs it for every active practice, so a case's total and
 * deadline follow the calendar without a new upload. How many lines it wrote off.
 */
export async function closePassedWindows(scope: PracticeScope<ScopeClient>, practiceId: string, asOf: string): Promise<number> {
  await lockPractice(scope.client, practiceId);
  return closeWindows(scope.client, practiceId, asOf);
}

/** Triage in the transaction's scope (the report job runs it before it reads the run's numbers). */
export async function triageInScope(scope: PracticeScope<ScopeClient>, practiceId: string, pricingRunId: string, requestId: string, asOf: string): Promise<TriageOutcome> {
  const { client } = scope;
  await lockPractice(client, practiceId);
  const run = await lockedRun(client, practiceId, pricingRunId);
  if (run === undefined) {
    return { outcome: 'missing' };
  }
  if (run.status !== 'complete') {
    return { outcome: 'not_complete' };
  }
  if (!run.in_effect) {
    return { outcome: 'not_in_effect' };
  }
  const practice = await client.query<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [practiceId]);
  const settings = triageSettings(practice.rows[0]?.settings ?? {});

  const screened = await screenedLines(scope, practiceId, run, requestId);
  const anomalies = screenAnomalies(screened, settings);
  const stored = await storeAnomalies(client, practiceId, pricingRunId, anomalies);
  const flagged = anomalies.flatMap((anomaly) => anomaly.lineIds.map((serviceLineId) => ({ serviceLineId, pricedLineId: null })));
  await advanceStages(client, practiceId, 'flagged', flagged);

  const windowsClosed = await closeWindows(client, practiceId, asOf);
  const candidates = await candidateLines(client, await candidateRows(scope, practiceId, pricingRunId, requestId));
  // Validated: a positive shortfall (a per-visit line's at most its visit's), whatever else holds.
  const validated = candidates.filter((line) => judgeLine(line, settings.lineMaterialityCents, asOf).validated);
  await advanceStages(client, practiceId, 'validated', validated);
  const plan = planCases(candidates, await openCases(client, practiceId), settings, asOf);
  const pursuit = pursuitCost(settings.pursuit);
  let linesAdded = 0;
  for (const planned of plan.created) {
    const caseId = await openCase(client, practiceId, planned.pattern, settings, pursuit);
    await insertCaseLines(client, practiceId, caseId, planned.lines);
    linesAdded += planned.lines.length;
  }
  for (const planned of plan.added) {
    await insertCaseLines(client, practiceId, planned.caseId, planned.lines);
    linesAdded += planned.lines.length;
  }
  const attached = [...plan.created, ...plan.added].flatMap((planned) => planned.lines.filter((line) => !line.windowPassed));
  await advanceStages(client, practiceId, 'actionable', attached);
  return {
    outcome: 'triaged',
    summary: {
      asOf,
      anomalies: stored,
      flaggedLines: flagged.length,
      validatedLines: validated.length,
      casesOpened: plan.created.length,
      linesAdded,
      heldPatterns: plan.held.length,
      windowsClosed,
    },
  };
}

export async function executeTriage(context: TriageJobContext, practiceId: string, pricingRunId: string, options: TriageOptions = {}): Promise<TriageOutcome> {
  const asOf = options.asOf ?? todayUtc();
  return context.transaction((scope) => triageInScope(scope, practiceId, pricingRunId, context.jobId, asOf));
}
