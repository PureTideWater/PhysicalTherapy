import { PASSWORD_CHANGED_SUBJECT, passwordChangedLines } from '@tp/auth-mail';
import { PASSWORD_NOTICE_STALE_CODE } from '@tp/db';
import type { Logger } from '@tp/observability';

import type { MailMessage, MailSender } from '../mail/mail';
import { MAIL_LOG_CODES, PERMANENT_SEND_ERRORS, sendErrorName } from '../mail/streams';
import { type NoticeClient, asOperator } from './support-notices';

/**
 * The password-changed notice (docs/adr/0091; test matrix SGN-16): an account's own address is told when its password was
 * changed by a completed reset. The database writes the notice in the reset's own transaction (the audit_event trigger,
 * migration 20261111090000), so the web is unchanged and nothing about the person rides in pg-boss. This platform job
 * sends it, every minute, as the operator role (tp_operator), which owns nothing and cannot bypass row-level security,
 * every transaction with no practice in scope (a notice names none):
 *
 * 1. The stale sweep first (operator_password_notices_stale()): a notice still pending 24 hours after the change is never
 *    sent; it fails as NoticeStale and comes back once, to be logged PASSWORD_NOTICE_UNDELIVERED for the operator, who
 *    tells the person another way.
 * 2. The due notices (operator_password_notices_due(), IDs only).
 * 3. Each due notice in its own transaction: operator_password_notice_claim() locks the row while it is still pending,
 *    due and under 24 hours old, and is the only reader of the address; the message goes on the transactional stream
 *    (the account's suppression list; it never pauses) with its identity as tags; operator_password_notice_sent() keeps
 *    SES's message ID and commits. The claim's row lock lasts through the send and the record, so a run that races this
 *    one skips the notice: it is sent once. A bounce, suppression or rejection recorded before the record makes the
 *    notice undelivered there, and it is reported (sent_undelivered).
 * 4. A send that throws rolls back, and a new transaction records the attempt (operator_password_notice_failed()): it is
 *    tried again after 1, 5, 15 and 60 minutes, and fails after the fifth try or at once on a permanent SES error, which
 *    is reported. Anything else (SES accepted the message and its record failed) leaves the notice pending and fails the
 *    job; the next run sends it again.
 *
 * Delivery is recorded from SES's events by the mail_events job (platform/mail-events.ts), by message ID; a bounce,
 * suppression or rejection there reports the notice too, once. The reset is never blocked or undone: the send runs in
 * another process, and a failed send changes only the notice's row. Logs carry IDs and codes only: the address is read
 * by the claim and goes only into the message's one recipient, never into a log line, a payload or an error.
 */

export interface PasswordNoticeOptions {
  /** One operator connection; each step its own transaction as tp_operator. */
  readonly client: NoticeClient;
  readonly mail: MailSender;
  /** The support address the email says to write to, from the account's own address (SUPPORT_EMAIL). */
  readonly supportEmail: string;
  /** The job's ID: the audit events' request_id. */
  readonly requestId: string;
  /** Where each notice sent, refused or not delivered is logged, by its ID and its user's. */
  readonly logger?: Logger;
}

export interface PasswordNoticeResult {
  /** Notices past the 24-hour cutoff, failed as NoticeStale in this run (each also counted in `undelivered`). */
  readonly stale: number;
  /** Messages SES accepted. */
  readonly sent: number;
  /** Sends that threw (each tried again later, or failed). */
  readonly failed: number;
  /** Notices this run reported not delivered, each once: stale, failed for good, or bounced before their record. */
  readonly undelivered: number;
}

/** A notice as the stale sweep and the due list return it: IDs only. */
interface NoticeIds {
  readonly notice_id: string;
  readonly user_id: string;
}

interface Claimed {
  readonly user_id: string;
  readonly email: string;
  readonly changed_at: Date;
}

/** How many notices one run sweeps and sends at most; the next run takes the rest. */
export const PASSWORD_NOTICE_RUN = 100;

/** The message: the base's words (@tp/auth-mail), the change's time in UTC, the support route and no link, as the account's own mail. */
export function passwordNoticeMessage(notice: NoticeIds, to: string, changedAt: Date, supportEmail: string): MailMessage {
  return {
    to: [to],
    subject: PASSWORD_CHANGED_SUBJECT,
    lines: passwordChangedLines(changedAt, supportEmail),
    links: [],
    variant: 'account',
    identity: { stream: 'transactional', kind: 'password_changed', subjectId: notice.notice_id, recipientUserId: notice.user_id },
  };
}

/** A send the mail service refused, carried out of the transaction it rolls back. */
export class PasswordNoticeSendFailed extends Error {
  override readonly name = 'PasswordNoticeSendFailed';

  constructor(readonly sendError: unknown) {
    super('the mail service refused a password-changed notice');
  }
}

type SendOutcome = 'sent' | 'skipped' | 'failed' | 'sent_undelivered' | 'failed_undelivered';

/** The operator's alarm line (PASSWORD_NOTICE_UNDELIVERED): the notice, its user and why, by codes alone. */
function logUndelivered(logger: Logger | undefined, notice: NoticeIds, reason: string): void {
  logger?.error('password notice not delivered', {
    password_notice_id: notice.notice_id,
    user_id: notice.user_id,
    undelivered_reason_code: reason,
    error_code: MAIL_LOG_CODES.passwordNoticeUndelivered,
  });
}

/** A refused send, recorded in a new transaction: true when the notice failed for good and was reported. */
async function recordFailure(options: PasswordNoticeOptions, notice: NoticeIds, name: string): Promise<boolean> {
  const { client } = options;
  return asOperator(client, null, async () => {
    const { rows } = await client.query('SELECT operator_password_notice_failed($1, $2, $3, $4) AS undelivered', [notice.notice_id, name, PERMANENT_SEND_ERRORS.includes(name), options.requestId]);
    return (rows[0] as { undelivered: boolean } | undefined)?.undelivered === true;
  });
}

/** One notice: claimed, sent and recorded in one transaction; 'skipped' when another run holds it or it is no longer due. */
async function send(options: PasswordNoticeOptions, notice: NoticeIds): Promise<SendOutcome> {
  const { client, logger } = options;
  try {
    const outcome = await asOperator(client, null, async (): Promise<SendOutcome> => {
      const claimed = (await client.query('SELECT user_id, email, changed_at FROM operator_password_notice_claim($1)', [notice.notice_id])).rows[0] as Claimed | undefined;
      if (claimed === undefined) {
        return 'skipped';
      }
      let messageId: string;
      try {
        ({ messageId } = await options.mail.send(passwordNoticeMessage({ notice_id: notice.notice_id, user_id: claimed.user_id }, claimed.email, claimed.changed_at, options.supportEmail)));
      } catch (error) {
        throw new PasswordNoticeSendFailed(error);
      }
      const { rows } = await client.query('SELECT operator_password_notice_sent($1, $2, $3) AS undelivered', [notice.notice_id, messageId, options.requestId]);
      return (rows[0] as { undelivered: boolean } | undefined)?.undelivered === true ? 'sent_undelivered' : 'sent';
    });
    // Logged once its record has committed.
    if (outcome !== 'skipped') {
      logger?.info('password notice sent', { password_notice_id: notice.notice_id, user_id: notice.user_id });
    }
    return outcome;
  } catch (error) {
    // Anything but a refused send (SES accepted the message and its record failed, say) leaves the notice pending.
    if (!(error instanceof PasswordNoticeSendFailed)) {
      throw error;
    }
    const name = sendErrorName(error.sendError);
    logger?.warn('password notice send failed', { password_notice_id: notice.notice_id, error_code: name });
    if (await recordFailure(options, notice, name)) {
      logUndelivered(logger, notice, name);
      return 'failed_undelivered';
    }
    return 'failed';
  }
}

export async function sendPasswordNotices(options: PasswordNoticeOptions): Promise<PasswordNoticeResult> {
  const { client, logger } = options;
  let sent = 0;
  let failed = 0;
  let undelivered = 0;
  // 1. The stale sweep: a notice it returns was failed and reported in its transaction, and comes back only this once.
  const stale = (await asOperator(client, null, async () => (await client.query('SELECT notice_id, user_id FROM operator_password_notices_stale($1, $2)', [PASSWORD_NOTICE_RUN, options.requestId])).rows)) as NoticeIds[];
  for (const notice of stale) {
    undelivered += 1;
    logUndelivered(logger, notice, PASSWORD_NOTICE_STALE_CODE);
  }
  // 2 to 4. Each due notice, in its own transaction.
  const due = (await asOperator(client, null, async () => (await client.query('SELECT notice_id, user_id FROM operator_password_notices_due($1)', [PASSWORD_NOTICE_RUN])).rows)) as NoticeIds[];
  for (const notice of due) {
    const outcome = await send(options, notice);
    if (outcome === 'sent' || outcome === 'sent_undelivered') {
      sent += 1;
    }
    if (outcome === 'failed' || outcome === 'failed_undelivered') {
      failed += 1;
    }
    if (outcome === 'sent_undelivered') {
      logUndelivered(logger, notice, 'sent_undelivered');
    }
    if (outcome === 'sent_undelivered' || outcome === 'failed_undelivered') {
      undelivered += 1;
    }
  }
  return { stale: stale.length, sent, failed, undelivered };
}
