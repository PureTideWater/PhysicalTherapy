import { OPERATOR_ROLE, type SupportGrantNoticeKind } from '@tp/db';
import type { Logger } from '@tp/observability';

import type { MailMessage, MailSender } from '../mail/mail';
import { MAIL_LOG_CODES, PERMANENT_SEND_ERRORS, sendErrorName } from '../mail/streams';

/**
 * The practice administrator's notices for support (break-glass) access (PRD 3; PRD 5, J15: "the
 * practice administrator is notified at creation and at expiry with the list of records read";
 * docs/adr/0014, 0017 and 0065). A platform job, every minute, as the operator role (tp_operator), which
 * owns nothing and cannot bypass row-level security, from a recorded outbox (audit #76, D10; SEC-19):
 *
 * 1. Open each due notice (operator_due_support_notices(), IDs only), in a transaction scoped to exactly that notice's
 *    practice: operator_open_support_notice() records the notice and one pending recipient a current administrator. A
 *    practice with no administrator records the notice with no recipient and notice_undelivered, never notice_sent; the
 *    job logs NOTICE_UNDELIVERABLE with the grant's ID and the operator reaches the practice another way.
 * 2. Send each pending recipient (operator_support_notices_pending(), openings first) one message, in its own
 *    transaction scoped to the practice: operator_support_notice_claim() locks the row and gives the address, the
 *    message goes through the notices stream with its identity as tags, and operator_support_notice_sent() keeps SES's
 *    message ID and commits; the notice's first accepted send writes notice_sent. A send that throws rolls back, and a
 *    new transaction records the attempt (operator_support_notice_failed()): it is tried again after 1, 5, 15 and 60
 *    minutes, and fails after the fifth or at once on a permanent SES error. A retry reaches only the recipients still
 *    pending, so no administrator gets a notice twice (but for SES accepting a message whose commit then fails).
 * 3. A recipient not delivered (bounced, suppressed, rejected or failed) reports its notice once: notice_undelivered, an
 *    in-app notification to each administrator, and NOTICE_UNDELIVERED with the grant's ID for the operator. Delivery
 *    itself is recorded from SES's events by the mail_events job, by message ID.
 *
 * The email carries links and counts only, never PHI; the list of records read is on the grant's page in the practice
 * workspace. The application role can write neither the notices nor their audit events (migrations 20261015180000 and
 * 20261107090000), so no request can suppress a notice.
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
  /** Where NOTICE_UNDELIVERABLE and NOTICE_UNDELIVERED are logged, by the grant's ID. */
  readonly logger?: Logger;
}

export interface SupportNoticeResult {
  /** Opening notices recorded in this run. */
  readonly opened: number;
  /** Closing notices recorded in this run. */
  readonly closed: number;
  /** Notices recorded for a practice with no administrator to send them to (notice_undelivered; the operator is told). */
  readonly undeliverable: number;
  /** Messages SES accepted, one an administrator. */
  readonly sent: number;
  /** Sends that threw (each tried again later, or failed). */
  readonly failed: number;
  /** Notices this run found not delivered to every administrator, each reported once. */
  readonly undelivered: number;
}

const OPENED = 'support_grant_opened';

interface DueNotice {
  readonly support_grant_id: string;
  readonly practice_id: string;
  readonly notice: SupportGrantNoticeKind;
}

interface PendingRecipient {
  readonly notice_id: string;
  readonly practice_id: string;
  readonly user_id: string;
  readonly support_grant_id: string;
  readonly notice: SupportGrantNoticeKind;
}

/** How many notices, and recipients, one run handles; the next run takes the rest. */
const AT_MOST = 100;

export function noticeLink(origin: string, practiceId: string, grantId: string): string {
  return `${new URL(origin).origin}/p/${practiceId}/support-access/${grantId}`;
}

/** One administrator's message: fixed sentences, the count of records read on the closing one, and one link. */
export function supportNoticeMessage(recipient: PendingRecipient, to: string, link: string, reads: string): MailMessage {
  const identity = { stream: 'notices', kind: recipient.notice, subjectId: recipient.notice_id, practiceId: recipient.practice_id, recipientUserId: recipient.user_id } as const;
  return recipient.notice === OPENED
    ? {
        to: [to],
        subject: 'Support access opened for your practice',
        lines: [
          'PaidWhole support was given break-glass access to your practice for one support ticket.',
          'It ends on its own four hours after it opened. Every record read under it is logged, and you will be sent the list when it ends.',
          'Review the access:',
        ],
        links: [link],
        identity,
      }
    : {
        to: [to],
        subject: 'Support access to your practice has ended',
        lines: ['The break-glass support access to your practice has ended.', `Records read under it: ${reads}.`, 'The list of records read:'],
        links: [link],
        identity,
      };
}

/** One transaction as the operator role, with exactly one practice in scope (or none). */
export async function asOperator<T>(client: NoticeClient, practiceId: string | null, run: () => Promise<T>): Promise<T> {
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

/** Step 1: records one due notice and its recipients, in its practice's scope. */
async function open(options: SupportNoticeOptions, due: DueNotice): Promise<{ readonly opened: boolean; readonly recipients: number }> {
  const { client } = options;
  return asOperator(client, due.practice_id, async () => {
    const row = (await client.query('SELECT recipients, opened FROM operator_open_support_notice($1, $2, $3)', [due.support_grant_id, due.notice, options.requestId])).rows[0] as
      | { recipients: number; opened: boolean }
      | undefined;
    return { opened: row?.opened === true, recipients: row?.recipients ?? 0 };
  });
}

/** A send the mail service refused, carried out of the transaction it rolls back. */
export class NoticeSendFailed extends Error {
  override readonly name = 'NoticeSendFailed';

  constructor(readonly sendError: unknown) {
    super('the mail service refused a notice');
  }
}

/** A recipient's attempt that threw, recorded in a new transaction: true when it reported its notice undelivered. */
async function recordFailure(options: SupportNoticeOptions, recipient: PendingRecipient, error: unknown): Promise<boolean> {
  const { client } = options;
  const name = sendErrorName(error);
  return asOperator(client, recipient.practice_id, async () => {
    const { rows } = await client.query('SELECT operator_support_notice_failed($1, $2, $3, $4, $5) AS undelivered', [
      recipient.notice_id,
      recipient.user_id,
      name,
      PERMANENT_SEND_ERRORS.includes(name),
      options.requestId,
    ]);
    return (rows[0] as { undelivered: boolean }).undelivered;
  });
}

type SendOutcome = 'sent' | 'skipped' | 'failed' | 'sent_undelivered' | 'failed_undelivered';

/** Step 2: one administrator's message, in its own transaction; 'skipped' when another run holds the row or it is not due. */
async function send(options: SupportNoticeOptions, recipient: PendingRecipient): Promise<SendOutcome> {
  const { client } = options;
  try {
    return await asOperator(client, recipient.practice_id, async (): Promise<SendOutcome> => {
      const claimed = (await client.query('SELECT email, reads::text AS reads FROM operator_support_notice_claim($1, $2)', [recipient.notice_id, recipient.user_id])).rows[0] as
        | { email: string; reads: string }
        | undefined;
      if (claimed === undefined) {
        return 'skipped';
      }
      let messageId: string;
      try {
        ({ messageId } = await options.mail.send(supportNoticeMessage(recipient, claimed.email, noticeLink(options.origin, recipient.practice_id, recipient.support_grant_id), claimed.reads)));
      } catch (error) {
        throw new NoticeSendFailed(error);
      }
      const { rows } = await client.query('SELECT operator_support_notice_sent($1, $2, $3, $4) AS undelivered', [recipient.notice_id, recipient.user_id, messageId, options.requestId]);
      return (rows[0] as { undelivered: boolean }).undelivered ? 'sent_undelivered' : 'sent';
    });
  } catch (error) {
    // Anything but a refused send (SES accepted the message and its record failed, say) leaves the row pending.
    if (!(error instanceof NoticeSendFailed)) {
      throw error;
    }
    return (await recordFailure(options, recipient, error.sendError)) ? 'failed_undelivered' : 'failed';
  }
}

export async function sendSupportGrantNotices(options: SupportNoticeOptions): Promise<SupportNoticeResult> {
  const { client, logger } = options;
  let opened = 0;
  let closed = 0;
  let undeliverable = 0;
  let sent = 0;
  let failed = 0;
  let undelivered = 0;
  const due = (await asOperator(client, null, async () => (await client.query('SELECT support_grant_id, practice_id, notice FROM operator_due_support_notices($1)', [AT_MOST])).rows)) as DueNotice[];
  // Opening notices first, so a grant that opened and ended between two runs is told in that order.
  for (const notice of [...due.filter((item) => item.notice === OPENED), ...due.filter((item) => item.notice !== OPENED)]) {
    const recorded = await open(options, notice);
    if (!recorded.opened) {
      continue;
    }
    if (notice.notice === OPENED) {
      opened += 1;
    } else {
      closed += 1;
    }
    if (recorded.recipients === 0) {
      // A practice with no administrator to tell: the operator follows up (PRD 19, Break-glass access).
      undeliverable += 1;
      logger?.error('support grant notice had no practice administrator to send to', { support_grant_id: notice.support_grant_id, error_code: MAIL_LOG_CODES.noticeUndeliverable });
    }
  }
  const pending = (await asOperator(client, null, async () => (await client.query('SELECT notice_id, practice_id, user_id, support_grant_id, notice FROM operator_support_notices_pending($1)', [AT_MOST])).rows)) as PendingRecipient[];
  for (const recipient of pending) {
    const outcome = await send(options, recipient);
    sent += outcome === 'sent' || outcome === 'sent_undelivered' ? 1 : 0;
    failed += outcome === 'failed' || outcome === 'failed_undelivered' ? 1 : 0;
    if (outcome === 'sent_undelivered' || outcome === 'failed_undelivered') {
      undelivered += 1;
      logger?.error('support-access notice not delivered to every administrator', { support_grant_id: recipient.support_grant_id, error_code: MAIL_LOG_CODES.noticeUndelivered });
    }
  }
  return { opened, closed, undeliverable, sent, failed, undelivered };
}
