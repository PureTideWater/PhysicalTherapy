import type { EnvironmentName } from './environments';

/**
 * The mail streams' contract with the stacks (audit #76; docs/adr/0065; the founder's rulings of 2026-10-21, Q1, Q9 to
 * Q12): the three streams and their SES configuration sets, the event types each set publishes, the event queue's
 * retention, the alarms' thresholds and the codes the platform jobs and the web log. The worker (apps/worker/src/mail)
 * and the web (apps/web/src/lib/screening/validation.ts) hold the same names; infra/test/mail-streams.test.ts holds them
 * equal. No alarm, metric or dimension carries an address: the only dimension is a configuration set's name.
 */

/** Every message goes through exactly one stream (D1). Only `screening` is ever paused. */
export const MAIL_STREAMS = ['transactional', 'notices', 'screening'] as const;
export type MailStream = (typeof MAIL_STREAMS)[number];

/** `tp-<env>`: the prefix of every configuration set's name (the worker's MAIL_STREAM_PREFIX). */
export function mailStreamPrefix(environment: EnvironmentName): string {
  return `tp-${environment}`;
}

/** `tp-<env>-<stream>`: a stream's SES configuration set. */
export function configurationSetName(environment: EnvironmentName, stream: MailStream): string {
  return `${mailStreamPrefix(environment)}-${stream}`;
}

/**
 * The SES events each set publishes to the default event bus (D4): never OPEN, CLICK or SUBSCRIPTION, since no set
 * tracks opens or clicks.
 */
export const MAIL_EVENT_TYPES = ['SEND', 'REJECT', 'BOUNCE', 'COMPLAINT', 'DELIVERY', 'DELIVERY_DELAY', 'RENDERING_FAILURE'] as const;

/**
 * The screening's sender (Q12): results@screening.<MailFromAddress's domain>, shown as "PaidWhole", with Reply-To the
 * support address. Derived from MailFromAddress, so the screening's identity is always a subdomain of the main one and
 * the two can never be the same identity (D2).
 */
export const SCREENING_SENDER = { localPart: 'results', subdomain: 'screening', displayName: 'PaidWhole' } as const;

/** Each identity's custom MAIL FROM is `bounce.<identity>` (D2). */
export const MAIL_FROM_SUBDOMAIN = 'bounce';

/** The mailbox simulator addresses the daily probes go to (D5): the only recipients a probe may name. */
export const MAIL_SIMULATOR_RECIPIENTS = ['success@simulator.amazonses.com', 'bounce@simulator.amazonses.com'] as const;

/** The event queue and its dead-letter queue (D4). */
export const MAIL_EVENTS_QUEUE = {
  /** Kept at most 4 days: the queue is the only copy of an address outside SES. */
  retentionDays: 4,
  visibilityTimeoutSeconds: 60,
  /** A message received this many times without being deleted moves to the dead-letter queue. */
  maxReceiveCount: 5,
  /** The dead-letter queue keeps a message 14 days from its first enqueue (SQS's most), for a redrive. */
  deadLetterRetentionDays: 14,
} as const;

/** `tp-<env>-mail-events` and its dead-letter queue. */
export function mailEventsQueueName(environment: EnvironmentName): string {
  return `${mailStreamPrefix(environment)}-mail-events`;
}
export function mailEventsDeadLetterQueueName(environment: EnvironmentName): string {
  return `${mailEventsQueueName(environment)}-dlq`;
}

/** The two EventBridge rules' retries before an event goes to the dead-letter queue: EventBridge's most, 24 hours. */
export const MAIL_EVENTS_RULE_RETRY = { maxEventAgeHours: 24, retryAttempts: 185 } as const;

/**
 * The account's reputation alarms (D6 b): the warnings sit at half of SES's review levels (5% bounces, 0.1% complaints;
 * Q9), reach the event queue and pause the screening stream with `account_rate`; the higher two only alarm.
 */
export const ACCOUNT_REPUTATION_ALARMS = {
  bounceWarning: 0.025,
  bounceHigh: 0.04,
  complaintWarning: 0.0005,
  complaintHigh: 0.0008,
} as const;

/** The sets' own reputation alarms: the screening set's cut-off rates (Q9), and the transactional set's bounces. */
export const SET_REPUTATION_ALARMS = {
  screeningBounce: 0.03,
  screeningComplaint: 0.0008,
  transactionalBounce: 0.02,
} as const;

/** SES updates the reputation metrics about every 15 minutes; one period of it is evaluated. */
export const REPUTATION_PERIOD_SECONDS = 900;

/** The event queue's oldest message older than this alarms: the platform's mail_events job is not draining it. */
export const MAIL_EVENTS_OLDEST_LIMIT_SECONDS = 900;
export const MAIL_EVENTS_QUEUE_PERIOD_SECONDS = 300;

/**
 * The codes the platform jobs log as `error_code` that page the operator, each counted by its own metric filter on the
 * platform's log group and alarmed at one in five minutes (D5): the screening stream paused, a notice not delivered to a
 * recipient, a notice with no recipient at all, an invitation not delivered, a probe not back within 26 hours.
 */
export const MAIL_PLATFORM_ALARM_CODES = ['MAIL_STREAM_PAUSED', 'NOTICE_UNDELIVERED', 'NOTICE_UNDELIVERABLE', 'INVITATION_UNDELIVERED', 'MAIL_PROBE_MISSED'] as const;
export type MailPlatformAlarmCode = (typeof MAIL_PLATFORM_ALARM_CODES)[number];
export const MAIL_PLATFORM_ALARM_PERIOD_SECONDS = 300;

/**
 * A probe the platform could not send (review M3). While a stream's probe is due, each minute's mail_events run tries
 * it and, when the send throws, logs MAIL_PROBE_UNSENT and tries again on the next run. Nothing then comes back, but no
 * probe is outstanding either, so MAIL_PROBE_MISSED never fires, and 48 hours after the last probe came back the
 * stream is no longer ready: staging and production close the screening. Counted on the platform's log group and
 * alarmed when each of three five-minute periods has one, so a send that fails once and goes on the next run pages no
 * one, and a send that keeps failing pages within 15 minutes. The probes go a day apart, so that is about a day before
 * readiness lapses.
 */
export const MAIL_PROBE_UNSENT_ALARM = { code: 'MAIL_PROBE_UNSENT', periodSeconds: 300, periods: 3 } as const;

/** The web's code when a day's address validations reach the cap (Q1 (g)): counted and alarmed at one in a day. */
export const MAIL_VALIDATION_CAP_CODE = 'MAIL_VALIDATION_CAP_REACHED';
export const MAIL_VALIDATION_CAP_PERIOD_SECONDS = 86_400;

/**
 * The web's code when AWS refuses the address validation itself (review S3): STS refuses the address-validation
 * account's role (its trust, or MailValidationRoleArn naming the wrong role) or SES refuses the role's call. Every
 * address is then accepted on DNS alone until it is fixed, so it is counted and alarmed at one in five minutes.
 */
export const MAIL_VALIDATION_REFUSED_CODE = 'MAIL_VALIDATION_REFUSED';
export const MAIL_VALIDATION_REFUSED_PERIOD_SECONDS = 300;

/**
 * Codes logged as warnings with no alarm of their own: an unreadable event (it reaches the dead-letter queue, whose
 * alarm covers it), and a DNS check or an address validation that could not answer (the address is accepted).
 */
export const MAIL_WARNING_CODES = ['MAIL_EVENT_UNREADABLE', 'MAIL_DOMAIN_CHECK_UNAVAILABLE', 'MAIL_VALIDATION_UNAVAILABLE'] as const;

/** The metric namespace of every mail metric. */
export const MAIL_NAMESPACE = 'TherapyPlatform/Mail';

/** A log code's metric name: MAIL_STREAM_PAUSED is MailStreamPaused. */
export function mailCodeMetricName(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');
}

/**
 * Address validations a UTC day may make at most (Q1 (g): $0.01 each, at most 1,000 a day in production, 50 in staging;
 * the dev stack's as staging's). Past it, the screening skips the call and logs MAIL_VALIDATION_CAP_CODE.
 */
export const MAIL_VALIDATION_DAILY_CAP: Readonly<Record<EnvironmentName, number>> = { dev: 50, staging: 50, production: 1_000 };

/** The two phases of D2: `false` until both identities read verified, then `true`. */
export const MAIL_IDENTITIES_VERIFIED_VALUES = ['false', 'true'] as const;
