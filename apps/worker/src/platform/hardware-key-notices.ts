import { HARDWARE_KEY_NOTICE_SUBJECTS, type HardwareKeyNoticeKind, hardwareKeyNoticeLines } from '@tp/auth-mail';
import type { Logger } from '@tp/observability';

import type { MailMessage, MailSender } from '../mail/mail';
import { MAIL_LOG_CODES, PERMANENT_SEND_ERRORS, sendErrorName } from '../mail/streams';
import { type NoticeClient, asOperator } from './support-notices';

/**
 * The hardware-key notices (docs/adr/0095): an account's own address is told when its hardware keys were removed, when
 * registration of a new key was opened, and when the first key after a removal was registered. The database writes
 * each notice in the event's own transaction (migration 20261115090000), so the web queues nothing and nothing about
 * the person rides in pg-boss. This platform job sends them, every minute, as the operator role (tp_operator), every
 * transaction with no practice in scope. It is the password-changed notice's job (platform/password-notices.ts;
 * docs/adr/0091) with the table, the kinds and the words changed, and one branch more:
 *
 * 1. The stale sweep first (operator_key_notices_stale()): a notice still pending 24 hours after its event is never
 *    sent; it fails as NoticeStale and comes back once, to be logged KEY_NOTICE_UNDELIVERED for the operator.
 * 2. The due notices (operator_key_notices_due(), IDs only).
 * 3. Each due notice in its own transaction, for as long as the run has spent under 8 seconds sending:
 *    operator_key_notice_claim() locks the row while it is pending, due and under 24 hours old, and is the only reader
 *    of the address. **An address changed since the removal was requested is never written to:** the claim fails the
 *    notice as AddressChanged in that transaction and returns no address; the job logs it undelivered and commits.
 *    Otherwise the message goes on the transactional stream with its identity as tags and Reply-To the support
 *    address; operator_key_notice_sent() keeps SES's message ID and commits. The claim's row lock lasts through the
 *    send and the record, so a run that races this one skips the notice: it is sent once.
 * 4. A send that throws rolls back, and a new transaction records the try (operator_key_notice_failed()): tried again
 *    after 1, 5, 15 and 60 minutes; failed after the fifth try or at once on a permanent SES error, and reported.
 * 5. An error after SES accepted the message rolls back too and is counted as a try all the same, as RecordFailed, in a
 *    new transaction; then the error is rethrown, so the job's attempt fails and the run ends there. The person is
 *    sent at most five copies. An error before the send (the claim) is rethrown uncounted: nothing went out.
 *
 * Safe to retry and to overlap: every step acts on the row's own state under its lock. Delivery is recorded from SES's
 * events by the mail_events job, by message ID. Logs carry IDs and codes only: the address goes into the message's one
 * recipient and nowhere else.
 */

export interface KeyNoticeOptions {
  /** One operator connection; each step its own transaction as tp_operator. */
  readonly client: NoticeClient;
  readonly mail: MailSender;
  /** The support address the email says to write to, and its Reply-To (SUPPORT_EMAIL). */
  readonly supportEmail: string;
  /** The job's ID: the audit events' request_id. */
  readonly requestId: string;
  readonly logger?: Logger;
  /** The clock the run's 8 seconds of sending are read on, in milliseconds (the real one unless a test sets it). */
  readonly now?: () => number;
}

export interface KeyNoticeResult {
  readonly stale: number;
  /** Messages SES accepted. */
  readonly sent: number;
  /** Sends that threw (each tried again later, or failed). */
  readonly failed: number;
  /** Notices this run reported not delivered, each once: stale, address changed, failed for good, or bounced before their record. */
  readonly undelivered: number;
}

interface NoticeIds {
  readonly notice_id: string;
  readonly user_id: string;
}

/** What the claim returns of a notice it locked. `email` is null exactly when `undelivered` is true (AddressChanged). */
interface Claimed {
  readonly user_id: string;
  readonly email: string | null;
  readonly kind: HardwareKeyNoticeKind;
  readonly event_at: Date;
  readonly undelivered: boolean;
}

export const KEY_NOTICE_RUN = 100;
export const KEY_NOTICE_RUN_MS = 8_000;
export const KEY_NOTICE_RECORD_FAILED = 'RecordFailed';
/** The database's codes for a notice it failed itself (migration 20261115090000). */
export const KEY_NOTICE_STALE_CODE = 'NoticeStale';
export const KEY_NOTICE_ADDRESS_CHANGED_CODE = 'AddressChanged';

/** The message: @tp/auth-mail's words for the kind, as the account's own mail, with no link and Reply-To the support address. */
export function hardwareKeyNoticeMessage(notice: NoticeIds, to: string, kind: HardwareKeyNoticeKind, eventAt: Date, supportEmail: string): MailMessage {
  return {
    to: [to],
    subject: HARDWARE_KEY_NOTICE_SUBJECTS[kind],
    lines: hardwareKeyNoticeLines(kind, eventAt, supportEmail),
    links: [],
    variant: 'account',
    replyTo: supportEmail,
    identity: { stream: 'transactional', kind: 'hardware_keys_removed', subjectId: notice.notice_id, recipientUserId: notice.user_id },
  };
}

/** A send the mail service refused, carried out of the transaction it rolls back. */
export class KeyNoticeSendFailed extends Error {
  override readonly name = 'KeyNoticeSendFailed';

  constructor(readonly sendError: unknown) {
    super('the mail service refused a hardware-key notice');
  }
}

type SendOutcome = 'sent' | 'skipped' | 'failed' | 'sent_undelivered' | 'failed_undelivered' | 'address_changed';

/** The operator's alarm line (KEY_NOTICE_UNDELIVERED): the notice, its user and why, by codes alone. */
function logUndelivered(logger: Logger | undefined, notice: NoticeIds, reason: string): void {
  logger?.error('hardware key notice not delivered', {
    hardware_key_notice_id: notice.notice_id,
    user_id: notice.user_id,
    undelivered_reason_code: reason,
    error_code: MAIL_LOG_CODES.keyNoticeUndelivered,
  });
}

/** A try that ended in no recorded send, counted in a new transaction. True when the notice failed for good and was reported. */
async function recordFailure(options: KeyNoticeOptions, notice: NoticeIds, name: string): Promise<boolean> {
  const { client } = options;
  return asOperator(client, null, async () => {
    const { rows } = await client.query('SELECT operator_key_notice_failed($1, $2, $3, $4) AS undelivered', [notice.notice_id, name, PERMANENT_SEND_ERRORS.includes(name), options.requestId]);
    return (rows[0] as { undelivered: boolean } | undefined)?.undelivered === true;
  });
}

async function send(options: KeyNoticeOptions, notice: NoticeIds): Promise<SendOutcome> {
  const { client, logger } = options;
  // Set once SES accepts this try's message: an error from then on is a try that sent a copy.
  const tried = { accepted: false };
  try {
    const outcome = await asOperator(client, null, async (): Promise<SendOutcome> => {
      const claimed = (await client.query('SELECT user_id, email, kind, event_at, undelivered FROM operator_key_notice_claim($1)', [notice.notice_id])).rows[0] as Claimed | undefined;
      if (claimed === undefined) {
        return 'skipped';
      }
      if (claimed.undelivered || claimed.email === null) {
        // The claim failed and reported the notice in this transaction, which commits: nothing is sent to an address
        // that is not the one the removal was requested for.
        return 'address_changed';
      }
      let messageId: string;
      try {
        ({ messageId } = await options.mail.send(hardwareKeyNoticeMessage({ notice_id: notice.notice_id, user_id: claimed.user_id }, claimed.email, claimed.kind, claimed.event_at, options.supportEmail)));
      } catch (error) {
        throw new KeyNoticeSendFailed(error);
      }
      tried.accepted = true;
      const { rows } = await client.query('SELECT operator_key_notice_sent($1, $2, $3) AS undelivered', [notice.notice_id, messageId, options.requestId]);
      return (rows[0] as { undelivered: boolean } | undefined)?.undelivered === true ? 'sent_undelivered' : 'sent';
    });
    // Logged once its record has committed.
    if (outcome === 'sent' || outcome === 'sent_undelivered') {
      logger?.info('hardware key notice sent', { hardware_key_notice_id: notice.notice_id, user_id: notice.user_id });
    }
    return outcome;
  } catch (error) {
    if (error instanceof KeyNoticeSendFailed) {
      const name = sendErrorName(error.sendError);
      logger?.warn('hardware key notice send failed', { hardware_key_notice_id: notice.notice_id, error_code: name });
      if (await recordFailure(options, notice, name)) {
        logUndelivered(logger, notice, name);
        return 'failed_undelivered';
      }
      return 'failed';
    }
    if (tried.accepted) {
      logger?.warn('hardware key notice record failed', { hardware_key_notice_id: notice.notice_id, user_id: notice.user_id, error_code: KEY_NOTICE_RECORD_FAILED });
      let failedForGood: boolean;
      try {
        failedForGood = await recordFailure(options, notice, KEY_NOTICE_RECORD_FAILED);
      } catch {
        // The try could not be recorded either: the first error is the one the job fails with.
        throw error;
      }
      if (failedForGood) {
        logUndelivered(logger, notice, KEY_NOTICE_RECORD_FAILED);
      }
    }
    throw error;
  }
}

export async function sendHardwareKeyNotices(options: KeyNoticeOptions): Promise<KeyNoticeResult> {
  const { client, logger } = options;
  const now = options.now ?? Date.now;
  let sent = 0;
  let failed = 0;
  let undelivered = 0;
  const stale = (await asOperator(client, null, async () => (await client.query('SELECT notice_id, user_id FROM operator_key_notices_stale($1, $2)', [KEY_NOTICE_RUN, options.requestId])).rows)) as NoticeIds[];
  for (const notice of stale) {
    undelivered += 1;
    logUndelivered(logger, notice, KEY_NOTICE_STALE_CODE);
  }
  const due = (await asOperator(client, null, async () => (await client.query('SELECT notice_id, user_id FROM operator_key_notices_due($1)', [KEY_NOTICE_RUN])).rows)) as NoticeIds[];
  const began = now();
  for (const notice of due) {
    if (now() - began >= KEY_NOTICE_RUN_MS) {
      break;
    }
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
    if (outcome === 'address_changed') {
      logUndelivered(logger, notice, KEY_NOTICE_ADDRESS_CHANGED_CODE);
    }
    if (outcome === 'sent_undelivered' || outcome === 'failed_undelivered' || outcome === 'address_changed') {
      undelivered += 1;
    }
  }
  return { stale: stale.length, sent, failed, undelivered };
}
