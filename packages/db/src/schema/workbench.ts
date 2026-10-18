import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { packetVersion } from './packets';
import { practice, user } from './tenancy';
import { caseTable } from './triage';

/**
 * The case workbench's own record (PRD 7, Cases: notes and a timeline; assignment; the packet
 * builder's approval request), mirroring migrations/20261024110000_case_workbench.sql for typed
 * queries. The SQL is the source of truth for what may be written and by whom (a case worker's note or
 * assignment, a packet drafter's request for approval of the current version), for the owner an
 * assignment sets on its case, and for the rows never changing; a database test checks that these
 * columns match it. A PHI table: every query runs inside a scope from src/authz, and body holds
 * `enc:v1:` ciphertext under the practice's data key.
 */

export const CASE_ACTIVITY_KINDS = ['note', 'assigned', 'approval_requested'] as const;
export type CaseActivityKind = (typeof CASE_ACTIVITY_KINDS)[number];

export const caseActivity = pgTable(
  'case_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id),
    kind: text('kind', { enum: CASE_ACTIVITY_KINDS }).notNull(),
    /** (enc) A note's words, or an approval request's message. */
    body: text('body'),
    /** An assignment's new owner; null when the case was left unassigned. */
    ownerUserId: uuid('owner_user_id').references(() => user.id),
    packetVersionId: uuid('packet_version_id').references(() => packetVersion.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('case_activity_by_case').on(table.practiceId, table.caseId, table.createdAt)],
);

export type CaseActivityRow = typeof caseActivity.$inferSelect;
