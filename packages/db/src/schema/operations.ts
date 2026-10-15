import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Operations tables (Data dictionary, Operations; no PHI by design), mirroring
 * migrations/20261015140500_audit_and_operations.sql. audit_event is append-only for every role.
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

export type AuditEventRow = typeof auditEvent.$inferSelect;
export type RestoreDrillRow = typeof restoreDrill.$inferSelect;
