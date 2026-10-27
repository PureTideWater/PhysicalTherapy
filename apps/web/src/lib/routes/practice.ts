import { NOTICE_UNDELIVERED_STATES, type PracticeScope, type ScopeClient, readWithAudit, rolesPermit } from '@tp/db/runtime';
import { z } from 'zod';

import { practiceHold } from '../billing/hold';
import { holdNotice } from '../billing/suspension-words';
import { dashboard } from '../dashboard/queries';
import { practiceRoute } from '../http/invoke';
import { NotFoundError } from '../http/route';
import { type NotificationView, listNotifications, unreadNotifications } from '../monitoring/queries';
import { opaqueId } from './schemas';

/**
 * The practice workspace (PRD 7, Customer workspace). Its home shows data freshness (the last file
 * and the last run, with a banner when a run failed on its last attempt; JOB-02), the practice
 * record, its agreement chain and, for its administrators, the support (break-glass) grants on it
 * with the list of records each one read (PRD 5, J15: the practice administrator's notice links
 * here, and each notice's delivery: sending, sent, delivered to every administrator, not delivered to some, or not sent
 * for want of an administrator; docs/adr/0065, D10), the dashboard's counts and totals (coverage under the pricing in effect, cases by state, deadlines
 * in 14 days, recovered this quarter), and the person's latest in-app notifications from monitoring
 * (docs/adr/0039), and the dashboard's headline and queues (lib/dashboard/queries.ts; docs/adr/0045). Every read of
 * the practice record goes through readWithAudit, so a support engineer's view of it appears in that
 * list.
 */

interface PracticeRecord {
  readonly id: string;
  readonly practiceId: string;
  readonly name: string;
  readonly npi: string | null;
  readonly taxIdLast4: string | null;
  /** The pricing location's billing ZIP and ZIP+4 (practice_site, PR 6b; practice.zip is deprecated). */
  readonly zip: string | null;
  readonly zipPlusFour: string | null;
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

/**
 * One support-access notice's delivery (audit #76; docs/adr/0065, D10): sent one message per administrator from a
 * recorded outbox, each recipient's state mirrored from SES's events by message ID. `recipients` is null until the
 * notice is opened (its administrators read), and 0 when the practice had none; the counts are its recipients'.
 */
export interface NoticeDelivery {
  readonly recipients: number | null;
  readonly delivered: number;
  readonly undelivered: number;
  readonly pending: number;
  /** When the first of its messages was handed to SES, or null. */
  readonly sentAt: Date | null;
}

export interface SupportGrantSummary {
  readonly id: string;
  readonly ticket: string;
  readonly reason: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly open: boolean;
  /** The opening notice (at creation) and the closing notice (at expiry), as delivered. */
  readonly notices: { readonly opening: NoticeDelivery; readonly closing: NoticeDelivery };
}

/** A notice not yet opened. */
const UNOPENED: NoticeDelivery = { recipients: null, delivered: 0, undelivered: 0, pending: 0, sentAt: null };

function administrators(count: number): string {
  return count === 1 ? 'administrator' : 'administrators';
}

/**
 * What a support-access notice's delivery reads as, on the practice's page and the console's (D10; the founder's Q12 of
 * 2026-10-21: the recommended wording). A notice reads as delivered only when SES says every administrator's message
 * was; "sent" never claims more than that the message was handed over.
 */
export function noticeStatus(notice: NoticeDelivery, which: 'opening' | 'closing', grantOpen: boolean, time: (at: Date) => string): string {
  if (notice.recipients === null) {
    return which === 'closing' && grantOpen ? 'Sent when access ends' : 'Sending';
  }
  if (notice.recipients === 0) {
    return 'Not sent: the practice had no administrator';
  }
  const total = notice.recipients;
  if (notice.undelivered > 0) {
    return `Not delivered to ${String(notice.undelivered)} of ${String(total)} ${administrators(total)}. PaidWhole has been told.`;
  }
  if (notice.delivered >= total) {
    return `Delivered to ${String(total)} of ${String(total)} ${administrators(total)}`;
  }
  return notice.sentAt === null ? 'Sending' : `Sent ${time(notice.sentAt)}; delivery not yet confirmed`;
}

/** The notices of the given grants, by grant and notice, counted from their recipients' rows (never above recipients). */
async function noticeDeliveries(scope: PracticeScope<ScopeClient>, practiceId: string, grantIds: readonly string[]): Promise<Map<string, SupportGrantSummary['notices']>> {
  const byGrant = new Map<string, { opening: NoticeDelivery; closing: NoticeDelivery }>();
  if (grantIds.length === 0) {
    return byGrant;
  }
  const { rows } = await scope.client.query<{ support_grant_id: string; notice: string; recipients: number; delivered: number; undelivered: number; pending: number; sent_at: Date | null }>(
    `SELECT n.support_grant_id, n.notice, n.recipients,
            count(r.id) FILTER (WHERE r.state IN ('delivered', 'complained'))::integer AS delivered,
            count(r.id) FILTER (WHERE r.state = ANY ($3::text[]))::integer AS undelivered,
            count(r.id) FILTER (WHERE r.state IN ('pending', 'sent', 'delayed'))::integer AS pending,
            min(r.sent_at) AS sent_at
       FROM support_grant_notice n
       LEFT JOIN support_grant_notice_recipient r ON r.notice_id = n.id AND r.practice_id = n.practice_id
      WHERE n.practice_id = $1 AND n.support_grant_id = ANY ($2::uuid[])
      GROUP BY n.id`,
    [practiceId, grantIds, NOTICE_UNDELIVERED_STATES],
  );
  for (const row of rows) {
    const entry = byGrant.get(row.support_grant_id) ?? { opening: UNOPENED, closing: UNOPENED };
    const delivery: NoticeDelivery = { recipients: row.recipients, delivered: row.delivered, undelivered: row.undelivered, pending: row.pending, sentAt: row.sent_at };
    if (row.notice === 'support_grant_opened') {
      entry.opening = delivery;
    } else {
      entry.closing = delivery;
    }
    byGrant.set(row.support_grant_id, entry);
  }
  return byGrant;
}

/** The grants with their notices' delivery. */
async function supportGrants(scope: PracticeScope<ScopeClient>, practiceId: string, rows: readonly SupportGrantRow[]): Promise<SupportGrantSummary[]> {
  const notices = await noticeDeliveries(
    scope,
    practiceId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => supportGrant(row, notices.get(row.id) ?? { opening: UNOPENED, closing: UNOPENED }));
}

const SUPPORT_GRANT_COLUMNS = `id, ticket, reason, created_at, expires_at, (now() < expires_at AND now() < created_at + interval '4 hours') AS open`;

interface SupportGrantRow {
  readonly id: string;
  readonly ticket: string;
  readonly reason: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly open: boolean;
}

/** A practice job's run (job_run), as the dashboard shows it: codes and the job's opaque reference. */
export interface JobRunSummary {
  readonly jobId: string;
  readonly jobType: string;
  readonly outcome: 'running' | 'retrying' | 'succeeded' | 'failed' | 'refused';
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

function supportGrant(row: SupportGrantRow, notices: SupportGrantSummary['notices']): SupportGrantSummary {
  return { id: row.id, ticket: row.ticket, reason: row.reason, createdAt: row.created_at, expiresAt: row.expires_at, open: row.open, notices };
}

export const practiceHome = practiceRoute({
  id: 'practice.home',
  kind: 'page',
  path: '/p/[practiceId]',
  phi: true,
  permission: 'practice.open',
  // The headline's three numbers and the stage counts below them: one snapshot, so a reconcile that commits while the
  // dashboard reads never counts a line at two stages.
  oneSnapshot: true,
  params: z.object({ practiceId: opaqueId }),
  handle: async ({ scope, practiceId, access, request, services }) => {
    const [practice] = await readWithAudit(
      scope,
      { objectType: 'practice', purpose: 'workspace', requestId: request.requestId },
      async (client) =>
        (
          await client.query<PracticeRecord>(
            `SELECT p.id, p.id AS "practiceId", p.name, p.npi, p.tax_id_last4 AS "taxIdLast4", s.zip, s.zip_plus_four AS "zipPlusFour", p.locality_code AS "localityCode", p.status
               FROM practice p LEFT JOIN practice_site s ON s.practice_id = p.id WHERE p.id = $1`,
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
    const grants = administers
      ? await supportGrants(scope, practiceId, (await scope.client.query<SupportGrantRow>(`SELECT ${SUPPORT_GRANT_COLUMNS} FROM support_grant WHERE practice_id = $1 ORDER BY created_at DESC, id LIMIT 20`, [practiceId])).rows)
      : null;
    return {
      practice: { id: practice.id, name: practice.name, npi: practice.npi, taxIdLast4: practice.taxIdLast4, zip: practice.zip, zipPlusFour: practice.zipPlusFour, localityCode: practice.localityCode, status: practice.status },
      agreements: agreements.rows.map(
        (row): AgreementSummary => ({ id: row.id, kind: row.kind, version: row.version, signer: row.signer, signedAt: row.signed_at, sha256: row.sha256, documentRef: row.document_ref }),
      ),
      access: { via: access.via, roles: access.roles },
      supportGrants: grants,
      freshness: await freshness(scope, practiceId),
      /** The hold on new work here for this person, in the notice's words, or null (docs/adr/0050, 0080). */
      hold: await practiceHold(scope, practiceId).then((held) => (held === null ? null : holdNotice(held))),
      dashboard: await dashboard(scope, practiceId, services.now().toISOString().slice(0, 10)),
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
    const [summary] = await supportGrants(scope, practiceId, [grant]);
    return {
      grant: summary as SupportGrantSummary,
      reads: reads.rows.map((row): RecordRead => ({ objectType: row.object_type, objectId: row.object_id, purpose: row.purpose, at: row.at })),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, supportGrantId: refs.supportGrantId }) },
});

export const PRACTICE_ROUTES = [practiceHome, supportAccessPage] as const;
