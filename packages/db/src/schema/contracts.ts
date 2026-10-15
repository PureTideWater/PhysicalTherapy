import { sql } from 'drizzle-orm';
import { type AnyPgColumn, date, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { payer, plan, sourceDocument } from './documents';
import { practice, user } from './tenancy';

/**
 * Contracts, versions, rate records, the contract calendar and payer and plan mappings (Data
 * dictionary, Payers, contracts and rates; PRD 9, Contract rate records), mirroring
 * migrations/20261016160000_contracts_and_mapping.sql for typed queries. The SQL is the source of
 * truth for the state machine, the exclusion constraint on version windows, the immutability of
 * approved and signed-off versions, the evidence rule (CON-04), the approval and sign-off permission
 * checks, row-level security and grants; a database test checks that these columns match it. All
 * five are PHI tables: every query runs inside a scope from src/authz. packages/contracts holds the
 * typed shapes of the jsonb columns and validates them.
 */

export const CONTRACT_STATUSES = ['active', 'ended'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** A version's states in lifecycle order; only signed_off versions price lines (PRD 9). */
export const VERSION_STATUSES = ['draft', 'proposed', 'approved', 'signed_off', 'superseded'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const RATE_RECORD_METHODS = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED'] as const;
export const RATE_RECORD_ROUNDINGS = ['HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE'] as const;
/** Who wrote a rate record: the specialist by hand (v0) or a model proposal (v1). */
export const PROPOSERS = ['specialist', 'model'] as const;
export type Proposer = (typeof PROPOSERS)[number];

export const CALENDAR_EVENT_KINDS = ['anniversary', 'notice_deadline', 'fee_schedule_year', 'amendment'] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

/** What a plan is mapped to (PRD 5, J6): a contract version, or one of the "no agreement" kinds. */
export const MAPPING_KINDS = ['contract', 'no_agreement', 'ma_noncontracted', 'government', 'other'] as const;
export type MappingKind = (typeof MAPPING_KINDS)[number];

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const contract = pgTable(
  'contract',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => payer.id),
    title: text('title').notNull(),
    billingEntity: text('billing_entity'),
    status: text('status', { enum: CONTRACT_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('contract_by_payer').on(table.practiceId, table.payerId)],
);

export const contractVersion = pgTable(
  'contract_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contract.id),
    versionNo: integer('version_no').notNull(),
    sourceDocumentIds: uuid('source_document_ids').array().notNull().default(sql`'{}'`),
    /** The window [effectiveFrom, effectiveTo): effectiveTo is exclusive, null while open-ended. */
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    status: text('status', { enum: VERSION_STATUSES }).notNull().default('draft'),
    approvedBy: uuid('approved_by').references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    signedOffBy: uuid('signed_off_by').references(() => user.id),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => contractVersion.id),
    timelyFilingDays: integer('timely_filing_days'),
    disputeWindowDays: integer('dispute_window_days'),
    appealLevels: jsonb('appeal_levels').$type<readonly { readonly level: number; readonly days: number }[]>().notNull().default(sql`'[]'`),
    noticeDays: integer('notice_days'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('contract_version_number_once').on(table.contractId, table.versionNo),
    index('contract_version_by_contract').on(table.practiceId, table.contractId, table.effectiveFrom),
    index('contract_version_by_predecessor')
      .on(table.supersedesId)
      .where(sql`supersedes_id IS NOT NULL`),
  ],
);

export const rateRecord = pgTable(
  'rate_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    contractVersionId: uuid('contract_version_id')
      .notNull()
      .references(() => contractVersion.id),
    scope: jsonb('scope').$type<Readonly<Record<string, unknown>>>().notNull(),
    method: text('method', { enum: RATE_RECORD_METHODS }).notNull(),
    parameters: jsonb('parameters').$type<Readonly<Record<string, unknown>>>().notNull(),
    flags: jsonb('flags').$type<Readonly<Record<string, unknown>>>().notNull(),
    /** Null where the contract is silent: the practice's default rounding applies. */
    rounding: text('rounding', { enum: RATE_RECORD_ROUNDINGS }),
    evidence: jsonb('evidence').$type<Readonly<Record<string, unknown>>>().notNull().default(sql`'{}'`),
    proposedBy: text('proposed_by', { enum: PROPOSERS }).notNull(),
    verifiedBy: uuid('verified_by').references(() => user.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('rate_record_by_version').on(table.practiceId, table.contractVersionId)],
);

export const contractCalendarEvent = pgTable(
  'contract_calendar_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contract.id),
    kind: text('kind', { enum: CALENDAR_EVENT_KINDS }).notNull(),
    onDate: date('on_date').notNull(),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('contract_calendar_event_once').on(table.contractId, table.kind, table.onDate), index('contract_calendar_event_by_date').on(table.practiceId, table.onDate)],
);

export const payerPlanMapping = pgTable(
  'payer_plan_mapping',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id),
    contractVersionId: uuid('contract_version_id').references(() => contractVersion.id),
    mappingKind: text('mapping_kind', { enum: MAPPING_KINDS }).notNull(),
    /** The window [effectiveFrom, effectiveTo): effectiveTo is exclusive, null while open-ended. */
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    mappedBy: uuid('mapped_by')
      .notNull()
      .references(() => user.id),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => payerPlanMapping.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('payer_plan_mapping_by_plan').on(table.practiceId, table.planId, table.effectiveFrom),
    index('payer_plan_mapping_by_predecessor')
      .on(table.supersedesId)
      .where(sql`supersedes_id IS NOT NULL`),
  ],
);

/** What a specialist's question to the practice needs (migration 20261016200000; docs/adr/0030). */
export const QUESTION_TOPICS = ['missing_pages', 'missing_schedule', 'undefined_method', 'scope', 'timed_units', 'windows', 'other'] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];
export const QUESTION_STATUSES = ['open', 'answered', 'withdrawn'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/**
 * A contract specialist's question to the practice about one of its contracts (PRD 7, Contracts and
 * Specialist queue). The question and the answer are encrypted with the practice's data key (free
 * text); a question changes once, when it is answered or withdrawn.
 */
export const contractQuestion = pgTable(
  'contract_question',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contract.id),
    contractVersionId: uuid('contract_version_id').references(() => contractVersion.id),
    sourceDocumentId: uuid('source_document_id').references(() => sourceDocument.id),
    topic: text('topic', { enum: QUESTION_TOPICS }).notNull(),
    /** (enc) */
    question: text('question').notNull(),
    askedBy: uuid('asked_by')
      .notNull()
      .references(() => user.id),
    status: text('status', { enum: QUESTION_STATUSES }).notNull().default('open'),
    /** (enc) */
    answer: text('answer'),
    closedBy: uuid('closed_by').references(() => user.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('contract_question_by_contract').on(table.practiceId, table.contractId, table.status),
    index('contract_question_open')
      .on(table.practiceId, table.createdAt)
      .where(sql`status = 'open'`),
  ],
);

export type ContractRow = typeof contract.$inferSelect;
export type ContractVersionRow = typeof contractVersion.$inferSelect;
export type RateRecordRow = typeof rateRecord.$inferSelect;
export type ContractCalendarEventRow = typeof contractCalendarEvent.$inferSelect;
export type PayerPlanMappingRow = typeof payerPlanMapping.$inferSelect;
export type ContractQuestionRow = typeof contractQuestion.$inferSelect;
