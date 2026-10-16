import { bigint, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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

export const NOTIFICATION_KINDS = ['monitoring_run', 'digest', 'recoupment'] as const;
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

export type AuditEventRow = typeof auditEvent.$inferSelect;
export type NotificationRow = typeof notification.$inferSelect;
export type DigestRow = typeof digest.$inferSelect;
export type RestoreDrillRow = typeof restoreDrill.$inferSelect;
