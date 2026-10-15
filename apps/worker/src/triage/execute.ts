import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { type Cents, centsToString, parseCents } from '@tp/money';
import { type IndexedRelease, parseTrace } from '@tp/pricing';
import {
  type AnomalyCohort,
  type BehaviorReferences,
  type CandidateLine,
  type PatternKey,
  type ScreenedLine,
  type TriageSettings,
  detectBehavior,
  patternId,
  planCases,
  pursuitCost,
  releaseReferences,
  screenAnomalies,
  triageSettings,
} from '@tp/triage';

import { RUN_IN_EFFECT } from '../price/in-effect';
import { loadRuleRelease } from '../price/release';

/**
 * Triage of the pricing run in effect for its period (PRD 12; PRD 5, J8 and J17; PRD 8, The status
 * machine; test matrix CAS-01 to CAS-05, PRC-14, PRC-15; docs/adr/0037: a complete first run, or a
 * re-run once a person accepts it; never a re-run awaiting acceptance nor a run an accepted re-run
 * replaced, whose numbers did not go through acceptance), on its triage date, in the run's one
 * practice (the job's scope), in one transaction, one practice at a time (an advisory lock), and
 * idempotent: a triage run again finds what it recorded and adds only what has changed since (a window
 * that closed, lines that now carry a pattern across the case materiality).
 *
 * 1. Anomaly screening of the run's lines that cannot be priced (@tp/triage screenAnomalies): one
 *    anomaly per cohort, written once per run; the lines short of the mode are flagged (a stage, a
 *    count, never a dollar claim).
 * 2. The run's lines with positive variance are validated; with the lines validated by earlier runs
 *    whose patterns were below the case materiality (they accumulate), each is judged on the triage
 *    date and grouped by payer pattern: its payer and plan, its rate record and the adjustment behavior
 *    detected from its trace (under its own run's release). A pattern with an open case adds its lines
 *    to it; one at or above the case materiality opens a case with the pursuit-cost estimate the
 *    practice's settings give; a smaller one waits. A line joining a case is actionable, or struck
 *    through (written off, window passed) when its window has closed.
 * 3. Every open case's line whose window closed by the triage date is written off, window passed: it
 *    leaves the case's actionable total and stays visible. The case's totals, deadline and state are
 *    the database's, derived from its lines.
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

interface CandidateRow {
  readonly priced_line_id: string;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly release_no: number;
  readonly variance_cents: string;
  readonly window_ends_on: string | null;
  readonly trace: unknown;
  readonly mapping_kind: string | null;
  readonly contract_version_id: string | null;
  readonly version_status: string | null;
  readonly rate_record_id: string | null;
  readonly payer_id: string;
  readonly plan_id: string;
  readonly reversed: boolean;
  readonly superseded: boolean;
  readonly written_off: boolean;
}

async function lockedRun(client: ScopeClient, practiceId: string, pricingRunId: string): Promise<RunRow | undefined> {
  const { rows } = await client.query<RunRow>(`SELECT r.id, r.status, r.release_no, ${RUN_IN_EFFECT('r')} AS in_effect FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2`, [
    pricingRunId,
    practiceId,
  ]);
  return rows[0];
}

/** The run's lines that cannot be priced, with what screening compares them by. */
async function screenedLines(scope: PracticeScope<ScopeClient>, practiceId: string, pricingRunId: string, requestId: string): Promise<ScreenedLine[]> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'triage', requestId },
    async (client) =>
      (
        await client.query<ScreenRow & { id: string }>(
          `SELECT p.id, p.practice_id, p.service_line_id, p.unpriced_reason, pl.payer_id, pl.id AS plan_id, l.procedure_code, l.modifiers, l.place_of_service,
                  coalesce(l.service_date, c.service_from)::text AS service_date, trim_scale(coalesce(l.units, 1))::text AS units, p.observed_allowed_cents::text
             FROM priced_line p
             JOIN service_line l ON l.id = p.service_line_id
             JOIN claim c ON c.id = l.claim_id
             JOIN plan pl ON pl.id = l.payer_plan_key
            WHERE p.pricing_run_id = $1 AND p.practice_id = $2 AND p.unpriced_reason IS NOT NULL
            ORDER BY p.service_line_id`,
          [pricingRunId, practiceId],
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
 * The validated lines in no case yet: the run's lines with positive variance, and the lines an earlier
 * triage validated (from that run's priced line) whose pattern was held below the case materiality and
 * that this run does not price again.
 */
async function candidateRows(scope: PracticeScope<ScopeClient>, practiceId: string, pricingRunId: string, requestId: string): Promise<CandidateRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'triage', requestId },
    async (client) =>
      (
        await client.query<CandidateRow>(
          `WITH current_stage AS (
             SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.stage, s.priced_line_id
               FROM line_status s WHERE s.practice_id = $1 ORDER BY s.service_line_id, s.seq DESC
           ), candidates AS (
             SELECT p.id AS priced_line_id FROM priced_line p WHERE p.pricing_run_id = $2 AND p.practice_id = $1 AND p.variance_cents > 0
             UNION
             SELECT cs.priced_line_id FROM current_stage cs
              WHERE cs.stage = 'validated' AND cs.priced_line_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM priced_line x WHERE x.pricing_run_id = $2 AND x.service_line_id = cs.service_line_id)
           )
           SELECT p.id AS priced_line_id, p.practice_id, p.service_line_id, r.release_no, p.variance_cents::text, p.window_ends_on::text, p.trace,
                  m.mapping_kind, p.contract_version_id, v.status AS version_status, p.rate_record_id, pl.payer_id, pl.id AS plan_id,
                  (c.claim_status_code = '22' OR EXISTS (SELECT 1 FROM claim x WHERE x.reversal_of_claim_id = c.id)) AS reversed,
                  c.superseded_by_claim_id IS NOT NULL AS superseded,
                  false AS written_off
             FROM candidates
             JOIN priced_line p ON p.id = candidates.priced_line_id
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

/** The behavior references of each release the candidates were priced under, read once each. */
function referencesByRelease(client: ScopeClient): (releaseNo: number) => Promise<BehaviorReferences> {
  const loaded = new Map<number, Promise<IndexedRelease>>();
  return async (releaseNo) => {
    let release = loaded.get(releaseNo);
    if (release === undefined) {
      release = loadRuleRelease(client, releaseNo);
      loaded.set(releaseNo, release);
    }
    return releaseReferences(await release);
  };
}

async function candidateLines(client: ScopeClient, rows: readonly CandidateRow[]): Promise<CandidateLine[]> {
  const references = referencesByRelease(client);
  const lines: CandidateLine[] = [];
  for (const row of rows) {
    const behavior = detectBehavior(parseTrace(row.trace), await references(row.release_no));
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
      claimReversed: row.reversed,
      claimSuperseded: row.superseded,
      mappingKind: row.mapping_kind,
      contractVersionStatus: row.version_status,
      writtenOff: row.written_off,
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

async function openCases(client: ScopeClient, practiceId: string): Promise<Map<string, string>> {
  const { rows } = await client.query<{ id: string; pattern_key: PatternKey }>(`SELECT id, pattern_key FROM "case" WHERE practice_id = $1 AND state = 'open'`, [practiceId]);
  return new Map(rows.map((row) => [patternId(row.pattern_key), row.id]));
}

async function insertCaseLines(client: ScopeClient, practiceId: string, caseId: string, lines: readonly { readonly serviceLineId: string; readonly pricedLineId: string; readonly windowPassed: boolean }[]): Promise<void> {
  await client.query(
    `INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id, written_off_reason)
     SELECT $1, $2, t.service_line_id, t.priced_line_id, CASE WHEN t.window_passed THEN 'window_passed' END
       FROM unnest($3::uuid[], $4::uuid[], $5::boolean[]) AS t (service_line_id, priced_line_id, window_passed)
      ORDER BY t.service_line_id`,
    [practiceId, caseId, lines.map((line) => line.serviceLineId), lines.map((line) => line.pricedLineId), lines.map((line) => line.windowPassed)],
  );
}

async function openCase(client: ScopeClient, practiceId: string, pattern: PatternKey, settings: TriageSettings, pursuit: Cents | null): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO "case" (practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents, pursuit_cost_cents) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [practiceId, JSON.stringify(pattern), pattern.payer_id, pattern.plan_id, pattern.rate_record_id, centsToString(settings.caseMaterialityCents), pursuit === null ? null : centsToString(pursuit)],
  );
  return (rows[0] as { id: string }).id;
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

/** Triage in the transaction's scope (the report job runs it before it reads the run's numbers). */
export async function triageInScope(scope: PracticeScope<ScopeClient>, practiceId: string, pricingRunId: string, requestId: string, asOf: string): Promise<TriageOutcome> {
  const { client } = scope;
  // One triage of a practice at a time, whatever the queue does.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('triage:' || $1::text, 0))", [practiceId]);
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

  const screened = await screenedLines(scope, practiceId, pricingRunId, requestId);
  const anomalies = screenAnomalies(screened, settings);
  const stored = await storeAnomalies(client, practiceId, pricingRunId, anomalies);
  const flagged = anomalies.flatMap((anomaly) => anomaly.lineIds.map((serviceLineId) => ({ serviceLineId, pricedLineId: null })));
  await advanceStages(client, practiceId, 'flagged', flagged);

  const windowsClosed = await closeWindows(client, practiceId, asOf);
  const candidates = await candidateLines(client, await candidateRows(scope, practiceId, pricingRunId, requestId));
  await advanceStages(client, practiceId, 'validated', candidates);
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
      validatedLines: candidates.length,
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
