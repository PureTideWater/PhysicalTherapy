import { MAIL_STREAM_KINDS, type MailKind, type MailStream } from '@tp/db';

/**
 * The mail streams (audit #76; docs/adr/0065; migration 20261107090000): every message goes through exactly one SES
 * configuration set, one per stream, named `<prefix>-<stream>` (MAIL_STREAM_PREFIX, `tp-<environment>`):
 *
 * - transactional: Cognito's invitations and codes (untagged: kind `cognito`) and the monthly digests;
 * - notices: the support-access (break-glass) notices and dunning, one message per recipient from a recorded outbox;
 * - screening: the free screening's result and failure emails, from its own sender with Reply-To the support address
 *   (the founder's Q12 ruling of 2026-10-21). It alone pauses (the cut-off, Q9), and SES keeps no suppression list for it.
 *
 * Each message has one recipient and carries its identity as SES message tags, never an address: tp_kind, tp_subject
 * (the notice row, digest, invoice or screening run), tp_practice (support notices only) and tp_recipient (the user,
 * customer streams only). Every value is an opaque ID or a code; one that fails MAIL_TAG_VALUE throws before sending.
 * SES returns the tags on each of the message's events, and the platform's mail_events job records them by message
 * (platform/mail-events.ts). The infrastructure holds its alarm codes, set names and simulator addresses equal to these.
 */

/** The tags each message carries (SES message tags; the event's mail.tags). */
export const MAIL_TAGS = { kind: 'tp_kind', subject: 'tp_subject', practice: 'tp_practice', recipient: 'tp_recipient' } as const;

/** SES's own tag on every event: the configuration set the message went through, which names its stream. */
export const CONFIGURATION_SET_TAG = 'ses:configuration-set';

/** A tag value: letters, digits, `_` and `-`, 1 to 64 of them (SES's rule is wider; this one admits no address). */
export const MAIL_TAG_VALUE = /^[A-Za-z0-9_-]{1,64}$/;

/** The configuration sets' common prefix: `tp-` and the environment's name (MAIL_STREAM_PREFIX). */
export const MAIL_STREAM_PREFIX_PATTERN = /^tp-[a-z0-9]+(-[a-z0-9]+)*$/;

/** The prefix a development worker and the tests use when MAIL_STREAM_PREFIX is unset. */
export const DEVELOPMENT_MAIL_STREAM_PREFIX = 'tp-dev';

/** A stream's SES configuration set. */
export function configurationSetName(prefix: string, stream: MailStream): string {
  return `${prefix}-${stream}`;
}

/** SES's mailbox simulator: a probe goes to its success and bounce addresses only (D5 step 2). */
export const MAIL_SIMULATOR_DOMAIN = 'simulator.amazonses.com';
export const MAIL_PROBE_RECIPIENTS = { delivered: `success@${MAIL_SIMULATOR_DOMAIN}`, bounced: `bounce@${MAIL_SIMULATOR_DOMAIN}` } as const;

/**
 * The codes the platform logs for the operator's alarms (infra/lib/mail.ts holds its metric filters equal to these):
 * the screening stream paused, a notice not delivered to every recipient, a notice with no recipient, an invitation not
 * delivered, and a probe that has not come back in 26 hours. MAIL_EVENT_UNREADABLE is a warning the DLQ alarm covers.
 */
export const MAIL_LOG_CODES = {
  streamPaused: 'MAIL_STREAM_PAUSED',
  noticeUndelivered: 'NOTICE_UNDELIVERED',
  noticeUndeliverable: 'NOTICE_UNDELIVERABLE',
  invitationUndelivered: 'INVITATION_UNDELIVERED',
  probeMissed: 'MAIL_PROBE_MISSED',
  eventUnreadable: 'MAIL_EVENT_UNREADABLE',
} as const;

/**
 * SES errors after which a notice is not retried (D10): the message itself is refused, or the account or its sender
 * cannot send. Any other error is tried again after 1, 5, 15 and 60 minutes.
 */
export const PERMANENT_SEND_ERRORS: readonly string[] = ['MessageRejected', 'AccountSuspendedException', 'MailFromDomainNotVerifiedException'];

/** An SES error's name when it is shaped like one (MessageRejected, Throttling), never its message, which can carry an address. */
export function sendErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return /^[A-Za-z]{1,64}$/.test(name) ? name : 'Unrecognized';
}

/** SES's refusal while a configuration set's sending is disabled: the screening stream is paused (D7). */
export const SENDING_PAUSED_ERROR = 'SendingPausedException';

/** Who a message is, as its tags say it: its stream (the configuration set), kind, subject, practice and recipient. */
export interface MailIdentity {
  readonly stream: MailStream;
  readonly kind: MailKind;
  /** The notice row, digest, invoice or screening run (a UUID); none for a probe or Cognito's. */
  readonly subjectId?: string;
  /** The practice a support notice is about (its practice scope when its events are recorded). */
  readonly practiceId?: string;
  /** The customer it goes to (a UUID); never on the screening stream. */
  readonly recipientUserId?: string;
}

export class MailTagError extends Error {
  override readonly name = 'MailTagError';
}

function tagValue(value: string): string {
  if (!MAIL_TAG_VALUE.test(value)) {
    throw new MailTagError('a mail tag holds an opaque ID or a code only; nothing was sent');
  }
  return value;
}

/**
 * The message's SES tags, checked before anything is sent: the kind is its stream's (mail_send_stream_kind), a subject
 * is named exactly when the kind has one (mail_send_subject), a practice only on a support notice, a recipient only on
 * a customer stream, and every value an opaque ID or a code (MAIL_TAG_VALUE). Throws MailTagError otherwise.
 */
export function mailTags(identity: MailIdentity): { readonly Name: string; readonly Value: string }[] {
  if (!MAIL_STREAM_KINDS[identity.stream].includes(identity.kind)) {
    throw new MailTagError('a message’s kind is not one its stream carries; nothing was sent');
  }
  if ((identity.kind === 'probe' || identity.kind === 'cognito') !== (identity.subjectId === undefined)) {
    throw new MailTagError('a message names its subject exactly when its kind has one; nothing was sent');
  }
  if (identity.practiceId !== undefined && identity.kind !== 'support_grant_opened' && identity.kind !== 'support_grant_closed') {
    throw new MailTagError('only a support notice names a practice; nothing was sent');
  }
  if (identity.recipientUserId !== undefined && identity.stream === 'screening') {
    throw new MailTagError('a screening message names no user; nothing was sent');
  }
  const tags: { Name: string; Value: string }[] = [{ Name: MAIL_TAGS.kind, Value: tagValue(identity.kind) }];
  if (identity.subjectId !== undefined) {
    tags.push({ Name: MAIL_TAGS.subject, Value: tagValue(identity.subjectId) });
  }
  if (identity.practiceId !== undefined) {
    tags.push({ Name: MAIL_TAGS.practice, Value: tagValue(identity.practiceId) });
  }
  if (identity.recipientUserId !== undefined) {
    tags.push({ Name: MAIL_TAGS.recipient, Value: tagValue(identity.recipientUserId) });
  }
  return tags;
}
