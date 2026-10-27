import { randomUUID } from 'node:crypto';

import { MAIL_ACCOUNT_SIGNALS, MAIL_STREAMS, MAIL_STREAM_KINDS, type MailAccountSignal, type MailEvent, type MailKind, type MailStream } from '@tp/db';
import { z } from 'zod';

import { CONFIGURATION_SET_TAG, MAIL_SIMULATOR_DOMAIN, MAIL_TAGS, type MailIdentity, configurationSetName } from './streams';

/**
 * The messages the mail-events queue holds (D4, D5; audit #76): SES's events of each message, published by every
 * configuration set to the default EventBridge bus and routed to the queue by the mail-events rule, and the account's
 * two warning alarms' state changes, routed by the mail-account-alarms rule. Each is read with only the fields the
 * record uses: a bounce's diagnosticCode, its recipients' list and a complaint's feedback report are never read, so they
 * cannot reach a log, a payload or the database. A message that does not parse is MailEventUnreadable: the job logs it
 * by its queue ID (MAIL_EVENT_UNREADABLE) and leaves it for the dead-letter queue.
 */

/** SES's event types as the event names them (detail.eventType), and the event operator_record_mail_event() takes. */
const SES_EVENT_TYPES: Readonly<Record<string, MailEvent | null>> = {
  Send: 'send',
  DeliveryDelay: 'delivery_delay',
  Delivery: 'delivery',
  Bounce: 'bounce',
  Complaint: 'complaint',
  Reject: 'reject',
  'Rendering Failure': 'rendering_failure',
  RenderingFailure: 'rendering_failure',
  // Never published by a set (no open or click tracking, no subscription management): read and dropped.
  Open: null,
  Click: null,
  Subscription: null,
};

/** The account metrics whose warning alarms pause the screening (D6 b): bounce rate 2.5%, complaint rate 0.05%. */
export const MAIL_ACCOUNT_ALARM_METRICS: Readonly<Record<string, Exclude<MailAccountSignal, 'enforcement_not_healthy'>>> = {
  'Reputation.BounceRate': 'bounce_rate_alarm',
  'Reputation.ComplaintRate': 'complaint_rate_alarm',
};

/**
 * A Complaint event's only documented subtype (SES's Complaint.ComplaintSubType: "Can either be null or
 * OnAccountSuppressionList. If the value is OnAccountSuppressionList, SES accepted the message, but didn't attempt to
 * send it because it was on the account-level suppression list.").
 */
export const COMPLAINT_ON_ACCOUNT_SUPPRESSION_LIST = 'OnAccountSuppressionList';

const MESSAGE_ID = /^[A-Za-z0-9-]{20,100}$/;
const timestamp = z.iso.datetime({ offset: true });
const tagList = z.array(z.string()).min(1);

const SES_EVENT = z.object({
  source: z.literal('aws.ses'),
  time: timestamp.optional(),
  detail: z.object({
    eventType: z.string(),
    mail: z.object({
      timestamp,
      messageId: z.string().regex(MESSAGE_ID),
      destination: z.array(z.string()).min(1),
      tags: z.record(z.string(), tagList),
    }),
    bounce: z.object({ bounceType: z.string(), bounceSubType: z.string(), timestamp: timestamp.optional() }).optional(),
    complaint: z.object({ complaintSubType: z.string().nullable().optional(), complaintFeedbackType: z.string().optional(), timestamp: timestamp.optional() }).optional(),
    delivery: z.object({ timestamp: timestamp.optional() }).optional(),
    deliveryDelay: z.object({ timestamp: timestamp.optional() }).optional(),
  }),
});

const ALARM_EVENT = z.object({
  source: z.literal('aws.cloudwatch'),
  'detail-type': z.literal('CloudWatch Alarm State Change'),
  detail: z.object({
    state: z.object({ value: z.string() }),
    configuration: z.object({
      metrics: z.array(z.object({ metricStat: z.object({ metric: z.object({ namespace: z.string(), name: z.string() }) }).optional() })).min(1),
    }),
  }),
});

/** One SES event of one message, as operator_record_mail_event() records it. */
export interface MailEventRecord {
  readonly messageId: string;
  readonly stream: MailStream;
  readonly event: MailEvent;
  /** When SES accepted the message (mail.timestamp). */
  readonly mailAt: Date;
  /** When the event happened, where SES says. */
  readonly eventAt: Date | null;
  /** The destination address: read only to resolve a Cognito user and to hash a refused screening address. */
  readonly recipient: string;
  readonly kind: MailKind;
  readonly subjectId: string | null;
  readonly practiceId: string | null;
  readonly recipientUserId: string | null;
  readonly bounceKind: string | null;
  readonly bounceSubtype: string | null;
  readonly complaintType: string | null;
}

export type MailQueueEntry =
  | { readonly type: 'event'; readonly record: MailEventRecord }
  | { readonly type: 'account_signal'; readonly signal: Exclude<MailAccountSignal, 'enforcement_not_healthy'> }
  | { readonly type: 'ignored' };

/** A queue message that is not an event this job reads: logged by its queue ID, never its text, and left for the DLQ. */
export class MailEventUnreadable extends Error {
  override readonly name = 'MailEventUnreadable';
}

/** SES's PascalCase codes snake-cased: OnAccountSuppressionList is on_account_suppression_list, not-spam not_spam. */
export function snakeCase(code: string): string {
  return code
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

const uuid = z.uuid();

function oneTag(tags: Readonly<Record<string, readonly string[]>>, name: string): string | null {
  const values = tags[name];
  if (values === undefined) {
    return null;
  }
  if (values.length !== 1) {
    throw new MailEventUnreadable('a mail tag has more than one value');
  }
  return values[0] ?? null;
}

function idTag(tags: Readonly<Record<string, readonly string[]>>, name: string): string | null {
  const value = oneTag(tags, name);
  if (value !== null && !uuid.safeParse(value).success) {
    throw new MailEventUnreadable('a mail tag is not an opaque ID');
  }
  return value;
}

function streamOf(set: string | null, prefix: string): MailStream {
  const stream = MAIL_STREAMS.find((candidate) => configurationSetName(prefix, candidate) === set);
  if (stream === undefined) {
    throw new MailEventUnreadable('a mail event names a configuration set this environment does not have');
  }
  return stream;
}

function at(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

function sesEvent(parsed: z.infer<typeof SES_EVENT>, prefix: string): MailQueueEntry {
  const { detail } = parsed;
  if (!(detail.eventType in SES_EVENT_TYPES)) {
    throw new MailEventUnreadable('a mail event of a type this job does not read');
  }
  const event = SES_EVENT_TYPES[detail.eventType] ?? null;
  if (event === null) {
    return { type: 'ignored' };
  }
  const { tags } = detail.mail;
  const stream = streamOf(oneTag(tags, CONFIGURATION_SET_TAG), prefix);
  const tagged = oneTag(tags, MAIL_TAGS.kind);
  // Cognito tags nothing: its messages on the transactional set are its own kind.
  const kind = tagged ?? (stream === 'transactional' ? 'cognito' : null);
  if (kind === null || !(MAIL_STREAM_KINDS[stream] as readonly string[]).includes(kind)) {
    throw new MailEventUnreadable('a mail event of a kind its stream does not carry');
  }
  const [recipient = ''] = detail.mail.destination;
  let recorded: MailEvent = event;
  let bounceKind: string | null = null;
  let bounceSubtype: string | null = null;
  let complaintType: string | null = null;
  let eventAt: Date | null = at(parsed.time);
  if (event === 'bounce') {
    if (detail.bounce === undefined) {
      throw new MailEventUnreadable('a bounce without its bounce');
    }
    bounceKind = snakeCase(detail.bounce.bounceType);
    bounceSubtype = snakeCase(detail.bounce.bounceSubType);
    eventAt = at(detail.bounce.timestamp) ?? eventAt;
  } else if (event === 'complaint') {
    eventAt = at(detail.complaint?.timestamp) ?? eventAt;
    const subtype = detail.complaint?.complaintSubType ?? null;
    if (subtype === COMPLAINT_ON_ACCOUNT_SUPPRESSION_LIST) {
      // SES accepted the message and never sent it: the address is on the account-level suppression list (for an earlier
      // complaint). It is recorded as the bounce SES gives such an address, suppressed: undelivered for a notice and an
      // invitation, and on the screening stream counted toward nothing, as SES counts it toward neither rate.
      recorded = 'bounce';
      bounceKind = 'permanent';
      bounceSubtype = 'on_account_suppression_list';
    } else if (subtype !== null) {
      // A subtype SES gives no meaning for: whether the message reached anyone is unknown, so it is never read as
      // delivered or as a complaint; it is left for the dead-letter queue, whose alarm brings it to a person.
      throw new MailEventUnreadable('a complaint of a subtype this job does not read');
    } else {
      complaintType = detail.complaint?.complaintFeedbackType === undefined ? null : snakeCase(detail.complaint.complaintFeedbackType);
    }
  } else if (event === 'delivery') {
    eventAt = at(detail.delivery?.timestamp) ?? eventAt;
  } else if (event === 'delivery_delay') {
    eventAt = at(detail.deliveryDelay?.timestamp) ?? eventAt;
  }
  return {
    type: 'event',
    record: {
      messageId: detail.mail.messageId,
      stream,
      event: recorded,
      mailAt: new Date(detail.mail.timestamp),
      eventAt,
      recipient,
      kind: kind as MailKind,
      subjectId: idTag(tags, MAIL_TAGS.subject),
      practiceId: idTag(tags, MAIL_TAGS.practice),
      recipientUserId: idTag(tags, MAIL_TAGS.recipient),
      bounceKind,
      bounceSubtype,
      complaintType,
    },
  };
}

function alarmEvent(parsed: z.infer<typeof ALARM_EVENT>): MailQueueEntry {
  if (parsed.detail.state.value !== 'ALARM') {
    return { type: 'ignored' };
  }
  const names = parsed.detail.configuration.metrics.map((metric) => metric.metricStat?.metric.name);
  const signals = [...new Set(names.map((name) => (name === undefined ? undefined : MAIL_ACCOUNT_ALARM_METRICS[name])))];
  const [signal] = signals;
  if (signals.length !== 1 || signal === undefined || !MAIL_ACCOUNT_SIGNALS.includes(signal)) {
    throw new MailEventUnreadable('an alarm this job does not act on');
  }
  return { type: 'account_signal', signal };
}

/** Reads one queue message's body: an SES event of one message, an account alarm's signal, or one to drop. */
export function parseMailQueueMessage(body: string, streamPrefix: string): MailQueueEntry {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new MailEventUnreadable('a mail event that is not JSON');
  }
  const ses = SES_EVENT.safeParse(json);
  if (ses.success) {
    return sesEvent(ses.data, streamPrefix);
  }
  const alarm = ALARM_EVENT.safeParse(json);
  if (alarm.success) {
    return alarmEvent(alarm.data);
  }
  throw new MailEventUnreadable('a mail event of no shape this job reads');
}

/**
 * What SES's mailbox simulator does with an address, by the local part before any `+` (so bounce+e2e7@ is a bounce):
 * success and any other address are delivered; bounce bounces permanently; complaint is delivered and then reported;
 * suppressionlist bounces as on the account's suppression list. An address off the simulator is delivered.
 */
export function simulatorOutcome(address: string): 'delivered' | 'bounced' | 'complained' | 'suppressed' {
  const at = address.lastIndexOf('@');
  const domain = address.slice(at + 1).toLowerCase();
  const local = address.slice(0, at).split('+')[0]?.toLowerCase() ?? '';
  if (domain !== MAIL_SIMULATOR_DOMAIN) {
    return 'delivered';
  }
  return local === 'bounce' ? 'bounced' : local === 'complaint' ? 'complained' : local === 'suppressionlist' ? 'suppressed' : 'delivered';
}

/**
 * A message's events as SES would publish them to EventBridge, for the local sender's events directory (development
 * and the e2e journeys): Send, then the simulator's outcome. The same parser reads them as it reads the queue's.
 */
export function localMailEvents(message: { readonly messageId: string; readonly to: string; readonly identity: MailIdentity; readonly streamPrefix: string; readonly at: Date }): object[] {
  const time = message.at.toISOString();
  const tags: Record<string, string[]> = { [CONFIGURATION_SET_TAG]: [configurationSetName(message.streamPrefix, message.identity.stream)] };
  if (message.identity.kind !== 'cognito') {
    tags[MAIL_TAGS.kind] = [message.identity.kind];
  }
  for (const [name, value] of [
    [MAIL_TAGS.subject, message.identity.subjectId],
    [MAIL_TAGS.practice, message.identity.practiceId],
    [MAIL_TAGS.recipient, message.identity.recipientUserId],
  ] as const) {
    if (value !== undefined) {
      tags[name] = [value];
    }
  }
  const mail = { timestamp: time, messageId: message.messageId, destination: [message.to], tags };
  const envelope = (detailType: string, detail: object) => ({ version: '0', id: randomUUID(), 'detail-type': detailType, source: 'aws.ses', time, region: 'local', resources: [], detail: { mail, ...detail } });
  const sent = envelope('Email Sent', { eventType: 'Send', send: {} });
  const delivered = envelope('Email Delivered', { eventType: 'Delivery', delivery: { timestamp: time } });
  switch (simulatorOutcome(message.to)) {
    case 'bounced':
      return [sent, envelope('Email Bounced', { eventType: 'Bounce', bounce: { bounceType: 'Permanent', bounceSubType: 'General', timestamp: time } })];
    case 'suppressed':
      return [sent, envelope('Email Bounced', { eventType: 'Bounce', bounce: { bounceType: 'Permanent', bounceSubType: 'OnAccountSuppressionList', timestamp: time } })];
    case 'complained':
      return [sent, delivered, envelope('Email Complaint Received', { eventType: 'Complaint', complaint: { complaintFeedbackType: 'abuse', timestamp: time } })];
    case 'delivered':
      return [sent, delivered];
  }
}
