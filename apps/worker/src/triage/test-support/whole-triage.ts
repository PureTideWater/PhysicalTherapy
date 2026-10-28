import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { centsToString, parseCents } from '@tp/money';
import { type AnomalyCohort, type ScreenedLine, judgeLine, planCases, pursuitCost, screenAnomalies, triageSettings } from '@tp/triage';

import { PRICED_IN_EFFECT, RUN_IN_EFFECT } from '../../price/in-effect';
import { type TriageOutcome, candidateLines, candidateRows, insertCaseLines, lockPractice, openCase, openCases } from '../execute';

/**
 * For the tests (CAS-41, SUITE-CAP-1a): triage as it ran before its candidates were read in batches, kept as the
 * reference the batched triage is compared with (docs/adr/0083). The text below is execute.ts's at 085299bd, word for
 * word: the run's candidates read whole (candidateLines(candidateRows(…)): one read, one deadline read, one audit
 * event per row), and each stage advanced by the statement that reads every line's current stage. Only the names
 * changed: triageInScope is wholeTriageInScope, and the shared helpers are imported from execute.ts. Synthetic data
 * only.
 */

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
export async function wholeTriageInScope(scope: PracticeScope<ScopeClient>, practiceId: string, pricingRunId: string, requestId: string, asOf: string): Promise<TriageOutcome> {
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
