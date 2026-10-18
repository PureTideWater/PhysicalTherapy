import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Global content tables (Data dictionary, Global content), mirroring
 * migrations/20261015120000_rule_content.sql for typed queries. The SQL migration is the source of
 * truth for constraints, triggers and grants; a database test checks that these columns match it.
 */
export const ruleRelease = pgTable('rule_release', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseNo: integer('release_no').notNull().unique(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  manifestSha256: text('manifest_sha256').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ruleRecord = pgTable(
  'rule_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseNo: integer('release_no')
      .notNull()
      .references(() => ruleRelease.releaseNo),
    recordType: text('record_type').notNull(),
    key: jsonb('key').$type<Record<string, unknown>>().notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    source: jsonb('source').$type<Record<string, unknown>>().notNull(),
    verification: text('verification', { enum: ['L1', 'L2', 'L3'] }).notNull(),
    sha256: text('sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('rule_record_identity').on(table.releaseNo, table.recordType, table.key, table.effectiveFrom),
    index('rule_record_by_type').on(table.releaseNo, table.recordType),
  ],
);

/**
 * A content rollback (migrations/20261019150000_reruns_and_release_withdrawal.sql; PRD 18, Releases): the
 * release in force withdrawn and the newest published release below it in force again. Runs pinned to
 * the withdrawn release are flagged by this row, never changed. Permanent once written.
 */
export const ruleReleaseWithdrawal = pgTable('rule_release_withdrawal', {
  releaseNo: integer('release_no')
    .primaryKey()
    .references(() => ruleRelease.releaseNo),
  reinstatedReleaseNo: integer('reinstated_release_no')
    .notNull()
    .references(() => ruleRelease.releaseNo),
  reason: text('reason').notNull(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Rows as selected. */
export type RuleReleaseRow = typeof ruleRelease.$inferSelect;
export type RuleRecordRow = typeof ruleRecord.$inferSelect;
export type RuleReleaseWithdrawalRow = typeof ruleReleaseWithdrawal.$inferSelect;
