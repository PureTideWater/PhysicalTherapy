import { sql } from 'drizzle-orm';
import { type AnyPgColumn, bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { sourceDocument } from './documents';
import { claim, providerAdjustment, remittance, serviceLine } from './remittances';
import { practice, user } from './tenancy';
import { caseTable } from './triage';

/**
 * The recovery ledger and reconciliation (Data dictionary, Ledger and reconciliation: posting_row,
 * eft_row, ledger_entry, roi_statement; PRD 13), mirroring migrations/20261023120000_recovery_ledger.sql
 * for typed queries. The SQL is the source of truth for the append-only entries and their evidence and
 * signs, the standing matches and their one reversal, the statements' checked figures, row-level
 * security and grants; a database test checks that these columns match it. Every table is a PHI table:
 * every query runs inside a scope from src/authz, and the columns marked (enc) hold `enc:v1:` ciphertext
 * under the practice's data key.
 */

export const LEDGER_ENTRY_STAGES = ['approved', 'posted', 'deposited', 'recouped', 'reversed', 'adjusted', 'interest'] as const;
export const LEDGER_EVIDENCE_KINDS = ['claim', 'payer_response', 'posting_row', 'eft_row', 'provider_adjustment', 'ledger_entry'] as const;
export const LEDGER_MATCH_KINDS = ['claim', 'posting', 'deposit', 'recoupment', 'interest'] as const;
export type LedgerMatchKind = (typeof LEDGER_MATCH_KINDS)[number];
export const LEDGER_MATCH_OUTCOMES = ['approved', 'decreased', 'no_change'] as const;
export const LEDGER_MATCH_LEVELS = ['claim', 'check', 'batch'] as const;
export const ROI_PROOF_LEVELS = ['posted', 'deposited'] as const;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const practiceId = () =>
  uuid('practice_id')
    .notNull()
    .references(() => practice.id);

export const postingRow = pgTable(
  'posting_row',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    sourceDocumentId: uuid('source_document_id')
      .notNull()
      .references(() => sourceDocument.id),
    rowNo: integer('row_no').notNull(),
    checkOrTrace: text('check_or_trace').notNull(),
    postedOn: date('posted_on').notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    /** (enc) */
    claimReference: text('claim_reference'),
    procedureCode: text('procedure_code'),
    serviceDate: date('service_date'),
    payerName: text('payer_name'),
    batch: text('batch'),
    raw: jsonb('raw').$type<Readonly<Record<string, string>>>().notNull(),
    template: text('template').notNull(),
    /** The keyed hash of the row and its occurrence in its export. */
    fingerprint: text('fingerprint').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('posting_row_once').on(table.practiceId, table.fingerprint),
    unique('posting_row_position').on(table.sourceDocumentId, table.rowNo),
    index('posting_row_by_check').on(table.practiceId, table.checkOrTrace),
  ],
);

export const eftRow = pgTable(
  'eft_row',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    sourceDocumentId: uuid('source_document_id')
      .notNull()
      .references(() => sourceDocument.id),
    rowNo: integer('row_no').notNull(),
    trace: text('trace').notNull(),
    depositedOn: date('deposited_on').notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    batchReference: text('batch_reference'),
    fingerprint: text('fingerprint').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('eft_row_once').on(table.practiceId, table.fingerprint),
    unique('eft_row_position').on(table.sourceDocumentId, table.rowNo),
    index('eft_row_by_trace').on(table.practiceId, table.trace),
  ],
);

export const ledgerMatch = pgTable(
  'ledger_match',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    kind: text('kind', { enum: LEDGER_MATCH_KINDS }).notNull(),
    claimId: uuid('claim_id').references(() => claim.id),
    postingRowId: uuid('posting_row_id').references(() => postingRow.id),
    eftRowId: uuid('eft_row_id').references(() => eftRow.id),
    providerAdjustmentId: uuid('provider_adjustment_id').references(() => providerAdjustment.id),
    remittanceId: uuid('remittance_id')
      .notNull()
      .references(() => remittance.id),
    serviceLineId: uuid('service_line_id').references(() => serviceLine.id),
    outcome: text('outcome', { enum: LEDGER_MATCH_OUTCOMES }),
    level: text('level', { enum: LEDGER_MATCH_LEVELS }),
    allocated: boolean('allocated').notNull().default(false),
    matchedBy: uuid('matched_by').references(() => user.id),
    matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
    reversedBy: uuid('reversed_by').references(() => user.id),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    /** (enc) */
    reversalReason: text('reversal_reason'),
    evidenceId: uuid('evidence_id')
      .notNull()
      .generatedAlwaysAs(sql`coalesce(posting_row_id, eft_row_id, provider_adjustment_id, claim_id)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('ledger_match_by_remittance').on(table.practiceId, table.remittanceId),
    index('ledger_match_by_line')
      .on(table.practiceId, table.serviceLineId)
      .where(sql`service_line_id IS NOT NULL`),
    uniqueIndex('ledger_match_standing')
      .on(table.kind, table.evidenceId, table.serviceLineId)
      .where(sql`reversed_at IS NULL`),
  ],
);

export const ledgerEntry = pgTable(
  'ledger_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    seq: bigint('seq', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id),
    serviceLineId: uuid('service_line_id').references(() => serviceLine.id),
    stage: text('stage', { enum: LEDGER_ENTRY_STAGES }).notNull(),
    /** Signed. */
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    evidenceKind: text('evidence_kind', { enum: LEDGER_EVIDENCE_KINDS }).notNull(),
    evidenceId: uuid('evidence_id').notNull(),
    matchId: uuid('match_id').references((): AnyPgColumn => ledgerMatch.id),
    allocated: boolean('allocated').notNull().default(false),
    effectiveOn: date('effective_on').notNull(),
    createdBy: uuid('created_by').references(() => user.id),
    /** (enc) */
    reason: text('reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('ledger_entry_by_case').on(table.practiceId, table.caseId, table.stage),
    index('ledger_entry_by_line').on(table.practiceId, table.serviceLineId, table.seq),
    index('ledger_entry_by_date').on(table.practiceId, table.effectiveOn),
  ],
);

/** tp-roi-links/1: the entries each figure sums, and the open cases of actionable. */
export interface RoiLinks {
  readonly recovered: readonly string[];
  readonly interest: readonly string[];
  readonly approved_unposted: readonly string[];
  readonly actionable_open: readonly string[];
}

export const roiStatement = pgTable(
  'roi_statement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    proofLevel: text('proof_level', { enum: ROI_PROOF_LEVELS }).notNull(),
    feesCents: bigint('fees_cents', { mode: 'bigint' }).notNull(),
    recoveredCents: bigint('recovered_cents', { mode: 'bigint' }).notNull(),
    interestCents: bigint('interest_cents', { mode: 'bigint' }).notNull(),
    approvedUnpostedCents: bigint('approved_unposted_cents', { mode: 'bigint' }).notNull(),
    actionableOpenCents: bigint('actionable_open_cents', { mode: 'bigint' }).notNull(),
    pursuitHours: numeric('pursuit_hours', { precision: 9, scale: 2 }).notNull(),
    links: jsonb('links').$type<RoiLinks>().notNull(),
    generatedBy: uuid('generated_by').references(() => user.id),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    documentKey: text('document_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** The SHA-256 of the printed PDF, recorded with its key by the statement job (20261024100000, added last). */
    pdfSha256: text('pdf_sha256'),
  },
  (table) => [index('roi_statement_by_period').on(table.practiceId, table.periodFrom.desc(), table.generatedAt.desc())],
);

/**
 * A statement's printed PDF: an opaque key under the practice and the statement, never a name, a claim
 * number or a date (the database checks the prefix). Each print attempt writes a new object.
 */
export function roiStatementKey(practiceId: string, roiStatementId: string, objectId: string): string {
  return `practices/${practiceId}/reports/${roiStatementId}/${objectId}.pdf`;
}

export type PostingRowRow = typeof postingRow.$inferSelect;
export type EftRowRow = typeof eftRow.$inferSelect;
export type LedgerMatchRow = typeof ledgerMatch.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntry.$inferSelect;
export type RoiStatementRow = typeof roiStatement.$inferSelect;
