import { OPERATOR_ROLE } from '@tp/db';

import type { MailMessage, MailSender } from '../mail/mail';

/**
 * The practice administrator's notices for support (break-glass) access (PRD 3; PRD 5, J15: "the
 * practice administrator is notified at creation and at expiry with the list of records read";
 * docs/adr/0014 and 0017). A platform job, every minute, as the operator role (tp_operator), which
 * owns nothing and cannot bypass row-level security: it learns which notices are due (IDs only) from
 * operator_due_support_notices(), then handles each notice in its own transaction scoped to exactly
 * that notice's practice, where operator_record_support_notice() records it once and
 * operator_practice_administrator_emails() says where it goes. The email carries links and counts
 * only, never PHI; the list of records read is on the grant's page in the practice workspace.
 *
 * The opening notice is a notice_sent event the system writes; the closing one also sets
 * support_grant.notified_at. The application role can write neither (migration 20261015180000), so
 * no request can suppress a notice. A failed send rolls its transaction back and leaves the notice for
 * the next run.
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

const OPENED = 'support_grant_opened';
const CLOSED = 'support_grant_closed';
type Notice = typeof OPENED | typeof CLOSED;

interface DueNotice {
  readonly support_grant_id: string;
  readonly practice_id: string;
  readonly notice: Notice;
}

/** How many notices of each kind one run handles; the next run takes the rest. */
const AT_MOST = 100;

export function noticeLink(origin: string, practiceId: string, grantId: string): string {
  return `${new URL(origin).origin}/p/${practiceId}/support-access/${grantId}`;
}

function message(kind: Notice, to: readonly string[], link: string, reads: string): MailMessage {
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

/** One transaction as the operator role, with exactly one practice in scope (or none). */
async function asOperator<T>(client: NoticeClient, practiceId: string | null, run: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
    await client.query(
      practiceId === null ? "SELECT set_config('app.practice_ids', '{}', true)" : "SELECT set_config('app.practice_ids', ARRAY[$1::uuid]::text, true)",
      practiceId === null ? [] : [practiceId],
    );
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Handles one notice in its own transaction; 'skipped' when another run already recorded it. */
async function notify(options: SupportNoticeOptions, due: DueNotice): Promise<'sent' | 'undeliverable' | 'skipped'> {
  const { client } = options;
  return asOperator(client, due.practice_id, async () => {
    const recorded = (await client.query('SELECT recorded, reads::text AS reads FROM operator_record_support_notice($1, $2, $3)', [due.support_grant_id, due.notice, options.requestId]))
      .rows[0] as { recorded: boolean; reads: string } | undefined;
    if (recorded?.recorded !== true) {
      return 'skipped';
    }
    const to = ((await client.query('SELECT email FROM operator_practice_administrator_emails($1)', [due.practice_id])).rows as { email: string }[]).map((row) => row.email);
    if (to.length === 0) {
      return 'undeliverable';
    }
    await options.mail.send(message(due.notice, to, noticeLink(options.origin, due.practice_id, due.support_grant_id), recorded.reads));
    return 'sent';
  });
}

export async function sendSupportGrantNotices(options: SupportNoticeOptions): Promise<SupportNoticeResult> {
  const result = { opened: 0, closed: 0, undeliverable: 0 };
  const due = (await asOperator(options.client, null, async () => (await options.client.query('SELECT support_grant_id, practice_id, notice FROM operator_due_support_notices($1)', [AT_MOST])).rows)) as DueNotice[];
  // Opening notices first, so a grant that opened and ended between two runs is told in that order.
  for (const notice of [...due.filter((item) => item.notice === OPENED), ...due.filter((item) => item.notice === CLOSED)]) {
    const outcome = await notify(options, notice);
    if (outcome === 'undeliverable') {
      result.undeliverable += 1;
    } else if (outcome === 'sent') {
      result[notice.notice === OPENED ? 'opened' : 'closed'] += 1;
    }
  }
  return result;
}
