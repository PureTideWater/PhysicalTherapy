import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { screeningProspect } from './screening';
import { practice, user } from './tenancy';

/**
 * Operations tables (Data dictionary, Operations; no PHI by design), mirroring
 * migrations/20261015140500_audit_and_operations.sql and 20261020090000_monitoring_digests_notifications.sql.
 * audit_event is append-only for every role.
 */

export const ACTOR_KINDS = ['user', 'service', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    actorKind: text('actor_kind', { enum: ACTOR_KINDS }).notNull(),
    action: text('action').notNull(),
    objectType: text('object_type').notNull(),
    objectId: uuid('object_id'),
    practiceId: uuid('practice_id'),
    grantId: uuid('grant_id'),
    purpose: text('purpose'),
    requestId: text('request_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_event_by_practice').on(table.practiceId, table.at),
    index('audit_event_by_object').on(table.objectType, table.objectId),
    index('audit_event_by_at').on(table.at),
  ],
);

export const RESTORE_DRILL_OUTCOMES = ['passed', 'failed'] as const;

/** One monthly restore drill's evidence (PRD 16, Backups and restore; test matrix SEC-13). */
export const restoreDrill = pgTable('restore_drill', {
  id: uuid('id').primaryKey().defaultRandom(),
  snapshotRef: text('snapshot_ref').notNull(),
  targetRef: text('target_ref').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  durationMs: bigint('duration_ms', { mode: 'bigint' }).notNull(),
  outcome: text('outcome', { enum: RESTORE_DRILL_OUTCOMES }).notNull(),
  rowCounts: jsonb('row_counts').$type<Readonly<Record<string, number>>>().notNull(),
  catalogProblems: jsonb('catalog_problems').$type<readonly string[]>().notNull(),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Counts and totals only (PRD 8: notification and digest, "no PHI field exists on the table"): counts
 * are JSON integers, totals integer cents as text, each keyed by a code, or one level down by a code or
 * an opaque ID (a payer's). The database's CHECKs (figures_are_counts, figures_are_cents) refuse
 * anything else, so no name or text can be stored (migration 20261020090000).
 */
export type FigureCounts = Readonly<Record<string, number | Readonly<Record<string, number>>>>;
export type FigureTotals = Readonly<Record<string, string | Readonly<Record<string, string>>>>;

/**
 * Every kind the notification_kind_check admits: follow_up (migration 20261027090000) and support_notice_undelivered, a
 * break-glass notice that did not reach every administrator (subject: the support_grant_notice row; migration
 * 20261107090000).
 */
export const NOTIFICATION_KINDS = ['monitoring_run', 'digest', 'recoupment', 'follow_up', 'support_notice_undelivered'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** In-app notifications: one per person, kind and subject (the pricing run or the digest it is about). */
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    kind: text('kind', { enum: NOTIFICATION_KINDS }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    counts: jsonb('counts').$type<FigureCounts>().notNull(),
    totalsCents: jsonb('totals_cents').$type<FigureTotals>().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('notification_once').on(table.userId, table.kind, table.subjectId), index('notification_by_practice').on(table.practiceId, table.userId, table.createdAt.desc(), table.id)],
);

/** The month's email digest: one per practice and calendar month, its figures fixed when recorded, sent once. */
export const digest = pgTable(
  'digest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    /** YYYY-MM, UTC. */
    period: text('period').notNull(),
    counts: jsonb('counts').$type<FigureCounts>().notNull(),
    totalsCents: jsonb('totals_cents').$type<FigureTotals>().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('digest_once').on(table.practiceId, table.period)],
);

/**
 * The mail streams, delivery recorded by message and the screening's cut-off (audit #76; migration
 * 20261107090000; docs/adr/0065). Each SES configuration set is a stream; every message has one recipient and one
 * row, keyed by SES's message ID, holding no address and no hash of one. The only address-derived value kept is the
 * screening refusal list's keyed hash (Q11 (b)). Global tables, the owner's alone: the roles reach them through
 * definer functions.
 */
export const MAIL_STREAMS = ['transactional', 'notices', 'screening'] as const;
export type MailStream = (typeof MAIL_STREAMS)[number];
export const MAIL_KINDS = [
  'cognito',
  'digest',
  'dunning',
  'support_grant_opened',
  'support_grant_closed',
  'screening_result',
  'screening_failed',
  'screening_reminder',
  'screening_withdrawal',
  'probe',
] as const;
export type MailKind = (typeof MAIL_KINDS)[number];
/** The kinds each stream carries (mail_send_stream_kind). */
export const MAIL_STREAM_KINDS: Readonly<Record<MailStream, readonly MailKind[]>> = {
  transactional: ['cognito', 'digest', 'probe'],
  notices: ['support_grant_opened', 'support_grant_closed', 'dunning', 'probe'],
  screening: ['screening_result', 'screening_failed', 'screening_reminder', 'screening_withdrawal', 'probe'],
};
/** A message's state, lowest first; the last four are terminal and equal (a complaint follows a delivery). */
export const MAIL_STATES = ['sent', 'delayed', 'delivered', 'bounced', 'suppressed', 'rejected', 'complained'] as const;
export type MailState = (typeof MAIL_STATES)[number];
/** The SES events operator_record_mail_event() takes (SES's eventType, snake-cased). */
export const MAIL_EVENTS = ['send', 'delivery_delay', 'delivery', 'bounce', 'complaint', 'reject', 'rendering_failure'] as const;
export type MailEvent = (typeof MAIL_EVENTS)[number];
export const MAIL_BOUNCE_KINDS = ['permanent', 'transient', 'undetermined'] as const;
export type MailBounceKind = (typeof MAIL_BOUNCE_KINDS)[number];
/** SES's bounce subtypes, snake-cased; MAIL_SUPPRESSION_SUBTYPES make the state suppressed; any other SES adds is other. */
export const MAIL_BOUNCE_SUBTYPES = [
  'general',
  'no_email',
  'suppressed',
  'on_account_suppression_list',
  'on_configuration_set_suppression_list',
  'mailbox_full',
  'message_too_large',
  'content_rejected',
  'attachment_rejected',
  'undetermined',
  'other',
] as const;
export type MailBounceSubtype = (typeof MAIL_BOUNCE_SUBTYPES)[number];
/**
 * The subtypes of a message SES held back for the account's own suppression list (or a configuration set's override of
 * it) and counts toward neither rate: state suppressed. A bounce from SES's global suppression list (suppressed) counts
 * toward the account's bounce rate as any hard bounce does, so it is bounced (review M2).
 */
export const MAIL_SUPPRESSION_SUBTYPES: readonly MailBounceSubtype[] = ['on_account_suppression_list', 'on_configuration_set_suppression_list'];
/** SES's complaint feedback types, snake-cased; none given is unspecified, an unknown one other. */
export const MAIL_COMPLAINT_TYPES = ['abuse', 'auth_failure', 'fraud', 'not_spam', 'virus', 'other', 'unspecified'] as const;
export type MailComplaintType = (typeof MAIL_COMPLAINT_TYPES)[number];
export const MAIL_PAUSE_REASONS = ['bounce_rate', 'complaint_rate', 'account_rate', 'account_review', 'operator'] as const;
export type MailPauseReason = (typeof MAIL_PAUSE_REASONS)[number];
export const MAIL_RESUME_REASONS = ['cause_fixed', 'false_alarm'] as const;
export type MailResumeReason = (typeof MAIL_RESUME_REASONS)[number];
/** The account's signals (D6 b, c): its warning alarms pause the screening for account_rate, SES's enforcement for account_review. */
export const MAIL_ACCOUNT_SIGNALS = ['bounce_rate_alarm', 'complaint_rate_alarm', 'enforcement_not_healthy'] as const;
export type MailAccountSignal = (typeof MAIL_ACCOUNT_SIGNALS)[number];
/**
 * The screening stream's cut-off (the founder's Q9 of 2026-10-21): over a 7-day window from the last resume, pause when
 * permanent bounces exceed 3% of sends (floor 200) or complaints 0.08% (floor 2,500), in integer arithmetic.
 */
export const MAIL_CUTOFF = { windowDays: 7, bounceBasisPoints: 300, bounceFloor: 200, complaintPer100k: 80, complaintFloor: 2500 } as const;
/** Days a message's row is kept: the screening's, its prospect's 30; the others' 90. */
export const MAIL_SEND_DAYS: Readonly<Record<MailStream, number>> = { transactional: 90, notices: 90, screening: 30 };
/** Days a refused screening address's keyed hash is kept from its latest bounce or complaint (Q11 (b): 12 months). */
export const MAIL_REFUSAL_DAYS = 365;
export const MAIL_REFUSAL_REASONS = ['bounced', 'complained'] as const;
/** The bounce budget (Q10 (a)): a subject with this many live marks, each kept this many days, is refused. */
export const SCREENING_BOUNCE_BUDGET = { marks: 3, days: 7 } as const;
export const SCREENING_BOUNCE_MARK_KINDS = ['client', 'account'] as const;
export type ScreeningBounceMarkKind = (typeof SCREENING_BOUNCE_MARK_KINDS)[number];
/** The screening is ready once its delivered and bounced probes came back within this many hours and since the last resume. */
export const MAIL_PROBE_READY_HOURS = 48;
/**
 * A probe goes daily; a stream is missed when its last proof, the older of its last delivered and bounced probe since the
 * last resume, is this many hours old (review M3): 2 hours after a daily probe sent and lost, 22 before readiness lapses.
 */
export const MAIL_PROBE_MISSED_HOURS = 26;
/**
 * A stream with a probe not back since the last resume is missed this many hours after the first probe sent since then
 * (first_probe_sent_at, which a re-send never moves; the review of 2026-10-27), and a missed stream's probe goes again
 * this often until one comes back.
 */
export const MAIL_PROBE_FIRST_PROOF_HOURS = 1;

/** The pepper of the keyed hash: 32 bytes as hex, made at the migration, read only by mail_recipient_sha256(). */
export const mailRecipientKey = pgTable('mail_recipient_key', {
  id: boolean('id').primaryKey().default(true),
  pepper: text('pepper').notNull(),
});

export const mailStream = pgTable('mail_stream', {
  stream: text('stream', { enum: MAIL_STREAMS }).primaryKey(),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  pausedReason: text('paused_reason', { enum: MAIL_PAUSE_REASONS }),
  /** The platform administrator who paused it by hand; null for the cut-off's pauses. */
  pausedBy: uuid('paused_by').references(() => user.id),
  pauseSends: integer('pause_sends'),
  pauseBounces: integer('pause_bounces'),
  pauseComplaints: integer('pause_complaints'),
  windowStartsAt: timestamp('window_starts_at', { withTimezone: true }).notNull().defaultNow(),
  resumedAt: timestamp('resumed_at', { withTimezone: true }),
  /** When the platform's reconcile read the stream's SES set enabled while open; cleared by a pause, a resume or a read of it disabled. */
  sesEnabledConfirmedAt: timestamp('ses_enabled_confirmed_at', { withTimezone: true }),
  probeSentAt: timestamp('probe_sent_at', { withTimezone: true }),
  /** The first probe sent since the last resume (or ever); a re-send never moves it, and a resume clears it. */
  firstProbeSentAt: timestamp('first_probe_sent_at', { withTimezone: true }),
  probeDeliveredAt: timestamp('probe_delivered_at', { withTimezone: true }),
  probeBouncedAt: timestamp('probe_bounced_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mailSend = pgTable(
  'mail_send',
  {
    sesMessageId: text('ses_message_id').primaryKey(),
    stream: text('stream', { enum: MAIL_STREAMS })
      .notNull()
      .references(() => mailStream.stream),
    kind: text('kind', { enum: MAIL_KINDS }).notNull(),
    /** The notice row, digest, invoice, screening run or lead; null for Cognito's and a probe. */
    subjectId: uuid('subject_id'),
    recipientUserId: uuid('recipient_user_id').references(() => user.id),
    screeningProspectId: uuid('screening_prospect_id').references(() => screeningProspect.id, { onDelete: 'set null' }),
    state: text('state', { enum: MAIL_STATES }).notNull(),
    bounceKind: text('bounce_kind', { enum: MAIL_BOUNCE_KINDS }),
    bounceSubtype: text('bounce_subtype', { enum: MAIL_BOUNCE_SUBTYPES }),
    complaintType: text('complaint_type', { enum: MAIL_COMPLAINT_TYPES }),
    /** SES's mail.timestamp. */
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    undeliveredAt: timestamp('undelivered_at', { withTimezone: true }),
    complainedAt: timestamp('complained_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set by the mail_send_expiry trigger: MAIL_SEND_DAYS after sent_at. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('mail_send_by_stream').on(table.stream, table.sentAt),
    index('mail_send_by_subject')
      .on(table.kind, table.subjectId)
      .where(sql`subject_id IS NOT NULL`),
    index('mail_send_by_prospect')
      .on(table.screeningProspectId)
      .where(sql`screening_prospect_id IS NOT NULL`),
    index('mail_send_undelivered')
      .on(table.stream, table.undeliveredAt)
      .where(sql`undelivered_at IS NOT NULL`),
    index('mail_send_by_expiry').on(table.expiresAt),
  ],
);

/** The keyed hash of a refused screening address (Q11 (b)), kept MAIL_REFUSAL_DAYS, only to refuse a new screening to it. */
export const screeningMailRefusal = pgTable(
  'screening_mail_refusal',
  {
    recipientSha256: text('recipient_sha256').primaryKey(),
    reason: text('reason', { enum: MAIL_REFUSAL_REASONS }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('screening_mail_refusal_by_expiry').on(table.expiresAt)],
);

/** One 7-day mark per subject of a run whose screening message bounced permanently (Q10 (a)). Keyed subjects only. */
export const screeningBounceMark = pgTable(
  'screening_bounce_mark',
  {
    subject: text('subject').notNull(),
    subjectKind: text('subject_kind', { enum: SCREENING_BOUNCE_MARK_KINDS }).notNull(),
    sesMessageId: text('ses_message_id')
      .notNull()
      .references(() => mailSend.sesMessageId, { onDelete: 'cascade' }),
    bouncedAt: timestamp('bounced_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.subjectKind, table.subject, table.sesMessageId] }),
    index('screening_bounce_mark_by_expiry').on(table.expiresAt),
    index('screening_bounce_mark_by_message').on(table.sesMessageId),
  ],
);

export type AuditEventRow = typeof auditEvent.$inferSelect;
export type NotificationRow = typeof notification.$inferSelect;
export type DigestRow = typeof digest.$inferSelect;
export type RestoreDrillRow = typeof restoreDrill.$inferSelect;
export type MailRecipientKeyRow = typeof mailRecipientKey.$inferSelect;
export type MailStreamRow = typeof mailStream.$inferSelect;
export type MailSendRow = typeof mailSend.$inferSelect;
export type ScreeningMailRefusalRow = typeof screeningMailRefusal.$inferSelect;
export type ScreeningBounceMarkRow = typeof screeningBounceMark.$inferSelect;
