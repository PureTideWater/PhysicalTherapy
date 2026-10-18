import type { FigureCounts, FigureTotals, PracticeScope, ScopeClient } from '@tp/db/runtime';

import { parseCoverage } from '../price/coverage';

/**
 * The monitoring chain's links between steps (PRD 5, J11; docs/adr/0039): which runs the chain created
 * (a run a person created is not chained: its creator triages it from the Cases screen, ADR 0038), and
 * the in-app notification a chained run leaves once it is priced and triaged. Counts and totals only:
 * the run's lines, priced and unpriced, the validated lines and their shortfall (a per-visit line's at
 * most its visit's net), the flagged lines and
 * the cases its lines are in, read from the run's own aggregates; no PHI column is read (JOB-03).
 */

type Scope = PracticeScope<ScopeClient>;

/** Whether the run was created by the monitoring chain (its job), not by a person. */
export async function createdByMonitoring(scope: Scope, practiceId: string, pricingRunId: string): Promise<boolean> {
  const { rows } = await scope.client.query<{ chained: boolean }>('SELECT created_by_job_id IS NOT NULL AS chained FROM pricing_run WHERE id = $1 AND practice_id = $2', [pricingRunId, practiceId]);
  return rows[0]?.chained === true;
}

export interface RunFigures {
  readonly counts: FigureCounts;
  readonly totals: FigureTotals;
}

interface FiguresRow {
  readonly coverage: unknown;
  readonly validated_lines: number;
  readonly validated_cents: string;
  readonly flagged_lines: number;
  readonly cases: number;
}

/** A complete run's figures for its notification, or undefined when the run is not complete. */
export async function runFigures(client: ScopeClient, practiceId: string, pricingRunId: string): Promise<RunFigures | undefined> {
  const { rows } = await client.query<FiguresRow>(
    `SELECT r.coverage,
            (SELECT count(*)::int FROM priced_line p WHERE p.pricing_run_id = r.id AND p.variance_cents > 0 AND priced_line_shortfall_cents(p.id) IS NOT NULL) AS validated_lines,
            (SELECT coalesce(sum(priced_line_shortfall_cents(p.id)), 0)::text FROM priced_line p WHERE p.pricing_run_id = r.id AND p.variance_cents > 0) AS validated_cents,
            (SELECT coalesce(sum(cardinality(a.line_ids)), 0)::int FROM anomaly a WHERE a.pricing_run_id = r.id) AS flagged_lines,
            (SELECT count(DISTINCT cl.case_id)::int FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id WHERE p.pricing_run_id = r.id) AS cases
       FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2 AND r.status = 'complete'`,
    [pricingRunId, practiceId],
  );
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  const coverage = parseCoverage(row.coverage);
  return {
    counts: {
      lines: coverage.lines,
      priced_lines: coverage.priced.lines,
      unpriced_lines: coverage.lines - coverage.priced.lines,
      validated_lines: row.validated_lines,
      flagged_lines: row.flagged_lines,
      cases: row.cases,
    },
    totals: { billed: coverage.charge_cents, priced_billed: coverage.priced.charge_cents, validated_variance: row.validated_cents },
  };
}

/** One of the practice's people the practice's notices go to, with their preferences (the job's scope only). */
export interface Recipient {
  readonly userId: string;
  readonly email: string;
  readonly digestEmail: boolean;
  readonly inApp: boolean;
}

export async function recipients(client: ScopeClient): Promise<Recipient[]> {
  const { rows } = await client.query<{ user_id: string; email: string; digest_email: boolean; in_app: boolean }>('SELECT user_id, email, digest_email, in_app FROM practice_notification_recipients()');
  return rows.map((row) => ({ userId: row.user_id, email: row.email, digestEmail: row.digest_email, inApp: row.in_app }));
}

/**
 * In-app notifications, once per person, kind and subject: a replay inserts nothing (JOB-01). Only the
 * people who reach the practice now and keep in-app notifications on are told.
 */
export async function notify(client: ScopeClient, practiceId: string, kind: 'monitoring_run' | 'digest', subjectId: string, figures: RunFigures, people: readonly Recipient[]): Promise<number> {
  const told = people.filter((person) => person.inApp).map((person) => person.userId);
  if (told.length === 0) {
    return 0;
  }
  const { rowCount } = await client.query(
    `INSERT INTO notification (practice_id, user_id, kind, subject_id, counts, totals_cents)
     SELECT $1, u.id, $2, $3, $4, $5 FROM unnest($6::uuid[]) AS u (id) ORDER BY u.id
     ON CONFLICT (user_id, kind, subject_id) DO NOTHING`,
    [practiceId, kind, subjectId, JSON.stringify(figures.counts), JSON.stringify(figures.totals), told],
  );
  return rowCount ?? 0;
}

/** The notification a chained run leaves once triaged; nothing when the run is not complete. */
export async function notifyRun(scope: Scope, practiceId: string, pricingRunId: string): Promise<number> {
  const figures = await runFigures(scope.client, practiceId, pricingRunId);
  if (figures === undefined) {
    return 0;
  }
  return notify(scope.client, practiceId, 'monitoring_run', pricingRunId, figures, await recipients(scope.client));
}
