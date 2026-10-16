import { type PracticeScope, type ScopeClient, readWithAudit, rolesPermit } from '@tp/db/runtime';
import { quarterOf, quarterPeriod } from '@tp/ledger';
import { centsToString } from '@tp/money';
import { practiceLedgerTotals } from '@tp/worker/ledger';
import { followUpsDue } from '@tp/worker/packets';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { NotFoundError } from '../http/route';
import { type NotificationView, listNotifications, unreadNotifications } from '../monitoring/queries';
import { latestRunInEffect } from '../pricing/queries';
import { opaqueId } from './schemas';

/**
 * The practice workspace (PRD 7, Customer workspace). Its home shows data freshness (the last file
 * and the last run, with a banner when a run failed on its last attempt; JOB-02), the practice
 * record, its agreement chain and, for its administrators, the support (break-glass) grants on it
 * with the list of records each one read (PRD 5, J15: the practice administrator's notice links
 * here), the dashboard's counts and totals (coverage of the run in effect, cases by state, deadlines
 * in 14 days, recovered this quarter), and the person's latest in-app notifications from monitoring
 * (docs/adr/0039). Every read of
 * the practice record goes through readWithAudit, so a support engineer's view of it appears in that
 * list.
 */

interface PracticeRecord {
  readonly id: string;
  readonly practiceId: string;
  readonly name: string;
  readonly npi: string | null;
  readonly taxIdLast4: string | null;
  readonly zip: string | null;
  readonly localityCode: string | null;
  readonly status: string;
}

export interface AgreementSummary {
  readonly id: string;
  readonly kind: string;
  readonly version: string;
  readonly signer: string;
  readonly signedAt: Date;
  readonly sha256: string;
  readonly documentRef: string;
}

export interface SupportGrantSummary {
  readonly id: string;
  readonly ticket: string;
  readonly reason: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly notifiedAt: Date | null;
  readonly open: boolean;
}

const SUPPORT_GRANT_COLUMNS = `id, ticket, reason, created_at, expires_at, notified_at, (now() < expires_at AND now() < created_at + interval '4 hours') AS open`;

interface SupportGrantRow {
  readonly id: string;
  readonly ticket: string;
  readonly reason: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly notified_at: Date | null;
  readonly open: boolean;
}

/** A practice job's run (job_run), as the dashboard shows it: codes and the job's opaque reference. */
export interface JobRunSummary {
  readonly jobId: string;
  readonly jobType: string;
  readonly outcome: 'running' | 'retrying' | 'succeeded' | 'failed';
  readonly attempts: number;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface Freshness {
  /** When the practice's last file was uploaded. */
  readonly lastFileAt: Date | null;
  /** The practice's most recent job run. */
  readonly lastRun: JobRunSummary | null;
  /**
   * The most recent run that failed on its last attempt and has not succeeded since (a retry of the
   * same job key that succeeded clears it): the dashboard's run-failed banner (test matrix JOB-02).
   */
  readonly failedRun: JobRunSummary | null;
}

const JOB_RUN_COLUMNS = 'job_id, job_type, outcome, attempts, started_at, finished_at';

interface JobRunRow {
  readonly job_id: string;
  readonly job_type: string;
  readonly outcome: JobRunSummary['outcome'];
  readonly attempts: number;
  readonly started_at: Date;
  readonly finished_at: Date | null;
}

function jobRun(row: JobRunRow | undefined): JobRunSummary | null {
  return row === undefined ? null : { jobId: row.job_id, jobType: row.job_type, outcome: row.outcome, attempts: row.attempts, startedAt: row.started_at, finishedAt: row.finished_at };
}

/** Data freshness and the last run's status (PRD 7, Practice dashboard). */
export async function freshness(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<Freshness> {
  const file = await scope.client.query<{ at: Date | null }>('SELECT max(created_at) AS at FROM source_document WHERE practice_id = $1 AND parent_document_id IS NULL', [practiceId]);
  const last = await scope.client.query<JobRunRow>(`SELECT ${JOB_RUN_COLUMNS} FROM job_run WHERE practice_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1`, [practiceId]);
  const failed = await scope.client.query<JobRunRow>(
    `SELECT ${JOB_RUN_COLUMNS} FROM job_run f
      WHERE f.practice_id = $1 AND f.outcome = 'failed'
        AND NOT EXISTS (SELECT 1 FROM job_run s WHERE s.practice_id = f.practice_id AND s.singleton_key = f.singleton_key AND s.outcome = 'succeeded' AND s.started_at > f.started_at)
      ORDER BY f.finished_at DESC, f.id DESC LIMIT 1`,
    [practiceId],
  );
  return { lastFileAt: file.rows[0]?.at ?? null, lastRun: jobRun(last.rows[0]), failedRun: jobRun(failed.rows[0]) };
}

/** How many days ahead the dashboard's deadlines look (PRD 7: "deadlines in 14 days"; the digest's own window). */
export const DEADLINE_WINDOW_DAYS = 14;

export interface Dashboard {
  /** The coverage of the latest run in effect (Coverage's own), or null before any run is in effect. */
  readonly coverage: { readonly runId: string; readonly periodFrom: string; readonly periodTo: string; readonly lines: number; readonly pricedLines: number; readonly chargeCents: string; readonly pricedChargeCents: string } | null;
  /** The practice's cases by state, with each state's actionable total (the cases' own, derived in SQL). */
  readonly casesByState: readonly { readonly state: string; readonly cases: number; readonly actionableCents: string }[];
  /** Open cases whose deadline falls today or within DEADLINE_WINDOW_DAYS, with their actionable total. */
  readonly deadlines: { readonly cases: number; readonly actionableCents: string; readonly earliest: string | null };
  /** Cases whose latest submission has no response and whose follow-up date has come (PRD 7: "overdue follow-ups surface on the dashboard"; CAS-14). */
  readonly followUps: { readonly due: number; readonly earliest: string | null; readonly first: readonly { readonly caseId: string; readonly followUpOn: string }[] };
  /**
   * Recovered this quarter: from the recovery ledger's entries dated in the quarter (the practice's proof
   * level, net of recoupments and reversals; docs/adr/0042), never an estimate and never approved.
   */
  readonly recoveredCents: string;
}

/** The dashboard's counts and totals (PRD 7, Practice dashboard): coverage, open cases by stage, deadlines in 14 days, recovered this quarter. */
export async function dashboard(scope: PracticeScope<ScopeClient>, practiceId: string, today: string, requestId: string): Promise<Dashboard> {
  const latest = await latestRunInEffect(scope, practiceId, requestId);
  const states = await scope.client.query<{ state: string; cases: number; actionable: string }>(
    'SELECT state, count(*)::int AS cases, coalesce(sum(actionable_cents), 0)::text AS actionable FROM "case" WHERE practice_id = $1 GROUP BY state ORDER BY state',
    [practiceId],
  );
  const near = await scope.client.query<{ cases: number; actionable: string; earliest: string | null }>(
    `SELECT count(*)::int AS cases, coalesce(sum(actionable_cents), 0)::text AS actionable, min(deadline_on)::text AS earliest
       FROM "case" WHERE practice_id = $1 AND state = 'open' AND deadline_on BETWEEN $2::date AND $2::date + $3::int`,
    [practiceId, today, DEADLINE_WINDOW_DAYS],
  );
  const coverage = latest?.coverage ?? null;
  return {
    coverage:
      latest === undefined || coverage === null
        ? null
        : { runId: latest.id, periodFrom: latest.periodFrom, periodTo: latest.periodTo, lines: coverage.lines, pricedLines: coverage.priced.lines, chargeCents: coverage.charge_cents, pricedChargeCents: coverage.priced.charge_cents },
    casesByState: states.rows.map((row) => ({ state: row.state, cases: row.cases, actionableCents: row.actionable })),
    deadlines: { cases: near.rows[0]?.cases ?? 0, actionableCents: near.rows[0]?.actionable ?? '0', earliest: near.rows[0]?.earliest ?? null },
    followUps: await followUpsDue(scope, { practiceId, asOf: today }).then((due) => ({
      due: due.length,
      earliest: due[0]?.followUpOn ?? null,
      first: due.slice(0, 5).map((item) => ({ caseId: item.caseId, followUpOn: item.followUpOn })),
    })),
    recoveredCents: centsToString((await practiceLedgerTotals(scope, practiceId, quarterPeriod(quarterOf(today)))).recoveredCents),
  };
}

function supportGrant(row: SupportGrantRow): SupportGrantSummary {
  return { id: row.id, ticket: row.ticket, reason: row.reason, createdAt: row.created_at, expiresAt: row.expires_at, notifiedAt: row.notified_at, open: row.open };
}

export const practiceHome = practiceRoute({
  id: 'practice.home',
  kind: 'page',
  path: '/p/[practiceId]',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId }),
  handle: async ({ scope, practiceId, access, request, services }) => {
    const [practice] = await readWithAudit(
      scope,
      { objectType: 'practice', purpose: 'workspace', requestId: request.requestId },
      async (client) =>
        (
          await client.query<PracticeRecord>(
            'SELECT id, id AS "practiceId", name, npi, tax_id_last4 AS "taxIdLast4", zip, locality_code AS "localityCode", status FROM practice WHERE id = $1',
            [practiceId],
          )
        ).rows,
      (row) => ({ objectId: row.id, practiceId: row.practiceId }),
    );
    if (practice === undefined) {
      throw new NotFoundError();
    }
    const agreements = await scope.client.query<{ id: string; kind: string; version: string; signer: string; signed_at: Date; sha256: string; document_ref: string }>(
      'SELECT id, kind, version, signer, signed_at, sha256, document_ref FROM agreement WHERE practice_id = $1 ORDER BY signed_at DESC, id',
      [practiceId],
    );
    const administers = rolesPermit(access.roles, 'access_log.read');
    const supportGrants = administers
      ? (await scope.client.query<SupportGrantRow>(`SELECT ${SUPPORT_GRANT_COLUMNS} FROM support_grant WHERE practice_id = $1 ORDER BY created_at DESC, id LIMIT 20`, [practiceId])).rows.map(supportGrant)
      : null;
    return {
      practice: { id: practice.id, name: practice.name, npi: practice.npi, taxIdLast4: practice.taxIdLast4, zip: practice.zip, localityCode: practice.localityCode, status: practice.status },
      agreements: agreements.rows.map(
        (row): AgreementSummary => ({ id: row.id, kind: row.kind, version: row.version, signer: row.signer, signedAt: row.signed_at, sha256: row.sha256, documentRef: row.document_ref }),
      ),
      access: { via: access.via, roles: access.roles },
      supportGrants,
      freshness: await freshness(scope, practiceId),
      dashboard: await dashboard(scope, practiceId, services.now().toISOString().slice(0, 10), request.requestId),
      notifications: { unread: await unreadNotifications(scope, practiceId), latest: await listNotifications(scope, practiceId, 3) } satisfies { unread: number; latest: NotificationView[] },
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

export interface RecordRead {
  readonly objectType: string;
  readonly objectId: string | null;
  readonly purpose: string | null;
  readonly at: Date;
}

export const supportAccessPage = practiceRoute({
  id: 'practice.support_access',
  kind: 'page',
  path: '/p/[practiceId]/support-access/[supportGrantId]',
  phi: true,
  permission: 'access_log.read',
  params: z.object({ practiceId: opaqueId, supportGrantId: opaqueId }),
  handle: async ({ scope, params, practiceId }) => {
    const { rows } = await scope.client.query<SupportGrantRow>(`SELECT ${SUPPORT_GRANT_COLUMNS} FROM support_grant WHERE id = $1 AND practice_id = $2`, [params.supportGrantId, practiceId]);
    const [grant] = rows;
    if (grant === undefined) {
      throw new NotFoundError();
    }
    // The practice's access log (audit_event, readable by its administrators inside its scope).
    const reads = await scope.client.query<{ object_type: string; object_id: string | null; purpose: string | null; at: Date }>(
      "SELECT object_type, object_id, purpose, at FROM audit_event WHERE grant_id = $1 AND practice_id = $2 AND action = 'read' ORDER BY at, id",
      [params.supportGrantId, practiceId],
    );
    return {
      grant: supportGrant(grant),
      reads: reads.rows.map((row): RecordRead => ({ objectType: row.object_type, objectId: row.object_id, purpose: row.purpose, at: row.at })),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, supportGrantId: refs.supportGrantId }) },
});

export const PRACTICE_ROUTES = [practiceHome, supportAccessPage] as const;
