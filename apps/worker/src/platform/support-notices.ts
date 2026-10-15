import { OWNER_ROLE } from '@tp/db';

import type { MailMessage, MailSender } from '../mail/mail';

/**
 * The practice administrator's notices for support (break-glass) access (PRD 3; PRD 5, J15: "the
 * practice administrator is notified at creation and at expiry with the list of records read";
 * docs/adr/0017). A platform job, every minute, on the operator connection: for each support grant
 * without its opening notice, and each ended grant without its closing notice, it emails the
 * practice's administrators a link to the grant's page in the practice workspace, where the list of
 * records read is (the email carries links and counts only, never PHI).
 *
 * The opening notice is recorded as an audit event (notice_sent, support_grant_opened); the closing
 * notice sets support_grant.notified_at, which the database lets be set once, and is audited too.
 * Each notice is sent inside its own transaction, so a failure leaves it for the next run.
 */

export interface NoticeClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface SupportNoticeOptions {
  readonly client: NoticeClient;
  readonly mail: MailSender;
  /** The application's origin, for the links. */
  readonly origin: string;
  /** The job's ID: the audit events' request_id. */
  readonly requestId: string;
}

export interface SupportNoticeResult {
  readonly opened: number;
  readonly closed: number;
  /** Notices for a practice with no administrator to send them to (recorded; the operator is told). */
  readonly undeliverable: number;
}

interface DueGrant {
  readonly id: string;
  readonly practice_id: string;
  readonly reads: string;
}

const OPENED = 'support_grant_opened';
const CLOSED = 'support_grant_closed';

const DUE_OPENED = `
  SELECT s.id, s.practice_id, '0' AS reads FROM support_grant s
   WHERE NOT EXISTS (SELECT 1 FROM audit_event e WHERE e.action = 'notice_sent' AND e.object_type = 'support_grant' AND e.object_id = s.id AND e.purpose = '${OPENED}')
   ORDER BY s.created_at, s.id LIMIT 100`;

const DUE_CLOSED = `
  SELECT s.id, s.practice_id, (SELECT count(*) FROM audit_event e WHERE e.grant_id = s.id AND e.action = 'read')::text AS reads FROM support_grant s
   WHERE s.notified_at IS NULL AND (now() >= s.expires_at OR now() >= s.created_at + interval '4 hours')
   ORDER BY s.expires_at, s.id LIMIT 100`;

const ADMINISTRATORS = `
  SELECT DISTINCT u.email FROM practice p
    JOIN membership m ON m.organization_id = p.organization_id
    JOIN "user" u ON u.id = m.user_id
   WHERE p.id = $1 AND m.role = 'practice_admin' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
   ORDER BY u.email`;

export function noticeLink(origin: string, practiceId: string, grantId: string): string {
  return `${new URL(origin).origin}/p/${practiceId}/support-access/${grantId}`;
}

function message(kind: typeof OPENED | typeof CLOSED, to: readonly string[], link: string, reads: string): MailMessage {
  return kind === OPENED
    ? {
        to,
        subject: 'Support access opened for your practice',
        lines: [
          'Company support was given break-glass access to your practice for one support ticket.',
          'It ends on its own four hours after it opened. Every record read under it is logged, and you will be sent the list when it ends.',
          'Review the access:',
        ],
        links: [link],
      }
    : {
        to,
        subject: 'Support access to your practice has ended',
        lines: ['The break-glass support access to your practice has ended.', `Records read under it: ${reads}.`, 'The list of records read:'],
        links: [link],
      };
}

async function owned<T>(client: NoticeClient, practiceId: string | null, run: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', $1, true)", [practiceId === null ? '{}' : `{${practiceId}}`]);
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Sends one notice, in its own transaction; false when another run already sent it. */
async function notify(options: SupportNoticeOptions, kind: typeof OPENED | typeof CLOSED, grant: DueGrant): Promise<'sent' | 'undeliverable' | 'skipped'> {
  const { client } = options;
  return owned(client, grant.practice_id, async () => {
    // One sender per grant and notice at a time; the check repeats under the lock.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${kind}:${grant.id}`]);
    if (kind === CLOSED) {
      const marked = await client.query('UPDATE support_grant SET notified_at = now() WHERE id = $1 AND notified_at IS NULL', [grant.id]);
      if (marked.rowCount !== 1) {
        return 'skipped';
      }
    } else {
      const sent = await client.query("SELECT 1 FROM audit_event WHERE action = 'notice_sent' AND object_type = 'support_grant' AND object_id = $1 AND purpose = $2", [grant.id, OPENED]);
      if (sent.rows.length > 0) {
        return 'skipped';
      }
    }
    const to = ((await client.query(ADMINISTRATORS, [grant.practice_id])).rows as { email: string }[]).map((row) => row.email);
    await client.query(
      "INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id) VALUES ('system', 'notice_sent', 'support_grant', $1, $2, $1, $3, $4)",
      [grant.id, grant.practice_id, kind, options.requestId],
    );
    if (to.length === 0) {
      return 'undeliverable';
    }
    await options.mail.send(message(kind, to, noticeLink(options.origin, grant.practice_id, grant.id), grant.reads));
    return 'sent';
  });
}

export async function sendSupportGrantNotices(options: SupportNoticeOptions): Promise<SupportNoticeResult> {
  const result = { opened: 0, closed: 0, undeliverable: 0 };
  for (const [kind, query] of [
    [OPENED, DUE_OPENED],
    [CLOSED, DUE_CLOSED],
  ] as const) {
    const due = (await owned(options.client, null, async () => (await options.client.query(query)).rows)) as DueGrant[];
    for (const grant of due) {
      const outcome = await notify(options, kind, grant);
      if (outcome === 'undeliverable') {
        result.undeliverable += 1;
      } else if (outcome === 'sent') {
        result[kind === OPENED ? 'opened' : 'closed'] += 1;
      }
    }
  }
  return result;
}
