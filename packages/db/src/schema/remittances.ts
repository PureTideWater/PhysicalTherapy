import { type AnyPgColumn, bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { plan, payer, sourceDocument } from './documents';
import { practice, user } from './tenancy';

/**
 * Remittances, claims and lines (Data dictionary, Documents and remittances), mirroring
 * migrations/20261016120000_remittances.sql for typed queries. The SQL is the source of truth for
 * constraints, triggers, row-level security and grants; a database test checks that these columns
 * match it. Every table is a PHI table: every query runs inside a scope from src/authz, and the
 * columns ending in an (enc) comment hold `enc:v1:` ciphertext under the practice's data key
 * (src/crypto, ENCRYPTED_COLUMNS).
 */

/**
 * Where a remittance came from (migration 20261102090000; docs/adr/0060): an 835 transaction set, with its whole
 * X12 envelope, or a vendor ERA export, with none (no receiver, ISA13, GS06, ST02, TRN03 or payee qualifier; its
 * sender and payment method when its columns hold them). The same as the document kind it was loaded from.
 */
export const REMITTANCE_PROVENANCES = ['x12_835', 'era_export'] as const;
export type RemittanceProvenance = (typeof REMITTANCE_PROVENANCES)[number];

export const REMITTANCE_STATUSES = ['loaded', 'held', 'duplicate'] as const;
export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number];

export const REVIEW_REASONS = ['trace_reused_another_date', 'trace_reused_same_date'] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const OBSERVED_ALLOWED_BASES = ['amt_b6', 'paid_plus_pr'] as const;
export type ObservedAllowedBasisCode = (typeof OBSERVED_ALLOWED_BASES)[number];

export const PROVIDER_ADJUSTMENT_CATEGORIES = ['recoupment', 'forward_balance', 'interest', 'authorized_return', 'other'] as const;
export type ProviderAdjustmentCategory = (typeof PROVIDER_ADJUSTMENT_CATEGORIES)[number];

export const PARSE_OUTCOMES = ['loaded', 'held', 'partially_held', 'duplicate'] as const;
export type ParseOutcome = (typeof PARSE_OUTCOMES)[number];

/** CLP02 of a reversal. */
export const REVERSAL_STATUS_CODE = '22';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const practiceId = () =>
  uuid('practice_id')
    .notNull()
    .references(() => practice.id);

export const patientRef = pgTable(
  'patient_ref',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    pseudonym: text('pseudonym').notNull(),
    /** (enc) */
    lastName: text('last_name'),
    /** (enc) */
    firstName: text('first_name'),
    /** (enc) */
    dob: text('dob'),
    /** (enc) */
    memberId: text('member_id'),
    /** (enc) */
    groupNumber: text('group_number'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('patient_ref_by_pseudonym').on(table.practiceId, table.pseudonym)],
);

export const remittance = pgTable(
  'remittance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    sourceDocumentId: uuid('source_document_id')
      .notNull()
      .references(() => sourceDocument.id),
    senderId: text('sender_id'),
    receiverId: text('receiver_id'),
    isa13: text('isa13'),
    gs06: text('gs06'),
    st02: text('st02'),
    trn02: text('trn02').notNull(),
    trn03: text('trn03'),
    bpr02Cents: bigint('bpr02_cents', { mode: 'bigint' }).notNull(),
    bprCreditDebit: text('bpr_credit_debit', { enum: ['C', 'D'] }).notNull(),
    bprMethod: text('bpr_method'),
    bpr16Date: date('bpr16_date').notNull(),
    payerName: text('payer_name').notNull(),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => payer.id),
    payeeNpi: text('payee_npi').notNull(),
    payeeIdQualifier: text('payee_id_qualifier'),
    productionDate: date('production_date'),
    balanceDiffCents: bigint('balance_diff_cents', { mode: 'bigint' }).notNull().default(0n),
    balanced: boolean('balanced')
      .notNull()
      .generatedAlwaysAs(sql`balance_diff_cents = 0`),
    claimCount: integer('claim_count').notNull(),
    plbTotalCents: bigint('plb_total_cents', { mode: 'bigint' }).notNull(),
    status: text('status', { enum: REMITTANCE_STATUSES }).notNull().default('loaded'),
    heldReason: text('held_reason'),
    reviewReason: text('review_reason', { enum: REVIEW_REASONS }),
    reviewOfRemittanceId: uuid('review_of_remittance_id').references((): AnyPgColumn => remittance.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** x12_835 (every row before migration 20261102090000) or era_export; the envelope fields are an 835's only. */
    provenance: text('provenance', { enum: REMITTANCE_PROVENANCES }).notNull().default('x12_835'),
  },
  (table) => [
    unique('remittance_once').on(table.practiceId, table.senderId, table.isa13, table.trn02, table.bpr02Cents),
    // The export duplicate key (D12 a): payee, trace, the signed payment and its date, over export rows only.
    uniqueIndex('remittance_export_once')
      .on(table.practiceId, table.payeeNpi, table.trn02, table.bprCreditDebit, table.bpr02Cents, table.bpr16Date)
      .where(sql`provenance = 'era_export'`),
    index('remittance_by_trace').on(table.practiceId, table.trn02),
    index('remittance_by_payment_date').on(table.practiceId, table.bpr16Date.desc(), table.id),
    index('remittance_by_payer').on(table.practiceId, table.payerId, table.bpr16Date.desc()),
    index('remittance_by_document').on(table.sourceDocumentId),
  ],
);

export const claim = pgTable(
  'claim',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    remittanceId: uuid('remittance_id')
      .notNull()
      .references(() => remittance.id),
    claimNo: integer('claim_no').notNull(),
    /** (enc) CLP01. */
    patientControlNumber: text('patient_control_number').notNull(),
    /** (enc) CLP07. */
    payerClaimControlNumber: text('payer_claim_control_number').notNull(),
    /** The keyed lookup hash of CLP07. */
    payerClaimControlNumberHash: text('payer_claim_control_number_hash').notNull(),
    claimStatusCode: text('claim_status_code').notNull(),
    chargeCents: bigint('charge_cents', { mode: 'bigint' }).notNull(),
    paidCents: bigint('paid_cents', { mode: 'bigint' }).notNull(),
    patientRespCents: bigint('patient_resp_cents', { mode: 'bigint' }),
    /** CLP06; null only on a claim of an ERA export, which carries none (migration 20261102090000). */
    filingIndicator: text('filing_indicator'),
    facilityType: text('facility_type'),
    frequencyCode: text('frequency_code'),
    patientRefId: uuid('patient_ref_id')
      .notNull()
      .references(() => patientRef.id),
    insuredRefId: uuid('insured_ref_id').references(() => patientRef.id),
    serviceFrom: date('service_from'),
    serviceTo: date('service_to'),
    reversalOfClaimId: uuid('reversal_of_claim_id').references((): AnyPgColumn => claim.id),
    supersededByClaimId: uuid('superseded_by_claim_id').references((): AnyPgColumn => claim.id),
    allowedCents: bigint('allowed_cents', { mode: 'bigint' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** DTM 050: when the payer received the claim, which prompt-pay interest counts from (migration 20261023090000). */
    receivedOn: date('received_on'),
    /** AMT I: the interest the payer paid on the claim (migration 20261023120000). */
    interestCents: bigint('interest_cents', { mode: 'bigint' }),
  },
  (table) => [
    unique('claim_once').on(table.remittanceId, table.claimNo),
    index('claim_by_payer_claim_control_number').on(table.practiceId, table.payerClaimControlNumberHash),
    index('claim_by_patient').on(table.practiceId, table.patientRefId),
    index('claim_by_reversed')
      .on(table.reversalOfClaimId)
      .where(sql`reversal_of_claim_id IS NOT NULL`),
  ],
);

export const serviceLine = pgTable(
  'service_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claim.id),
    lineNo: integer('line_no').notNull(),
    procedureQualifier: text('procedure_qualifier').notNull(),
    procedureCode: text('procedure_code').notNull(),
    modifiers: text('modifiers').array().notNull().default(sql`'{}'`),
    revenueCode: text('revenue_code'),
    chargeCents: bigint('charge_cents', { mode: 'bigint' }).notNull(),
    paidCents: bigint('paid_cents', { mode: 'bigint' }).notNull(),
    units: numeric('units', { precision: 9, scale: 3 }),
    originalUnits: numeric('original_units', { precision: 9, scale: 3 }),
    serviceDate: date('service_date'),
    serviceDateTo: date('service_date_to'),
    placeOfService: text('place_of_service'),
    lineAllowedCents: bigint('line_allowed_cents', { mode: 'bigint' }),
    observedAllowedCents: bigint('observed_allowed_cents', { mode: 'bigint' }).notNull(),
    observedAllowedBasis: text('observed_allowed_basis', { enum: OBSERVED_ALLOWED_BASES }).notNull(),
    observedAllowedAllocated: boolean('observed_allowed_allocated').notNull().default(false),
    patientShareCents: bigint('patient_share_cents', { mode: 'bigint' }).notNull().default(0n),
    renderingNpi: text('rendering_npi'),
    payerPlanKey: uuid('payer_plan_key')
      .notNull()
      .references(() => plan.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('service_line_once').on(table.claimId, table.lineNo),
    index('service_line_by_service_date').on(table.practiceId, table.serviceDate),
    index('service_line_by_plan_and_code').on(table.practiceId, table.payerPlanKey, table.procedureCode),
  ],
);

export const adjustment = pgTable(
  'adjustment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claim.id),
    serviceLineId: uuid('service_line_id').references(() => serviceLine.id),
    groupCode: text('group_code').notNull(),
    reasonCode: text('reason_code').notNull(),
    unknownCode: boolean('unknown_code').notNull().default(false),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    quantity: numeric('quantity', { precision: 9, scale: 3 }),
    position: integer('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('adjustment_once').on(table.claimId, table.serviceLineId, table.position).nullsNotDistinct(),
    index('adjustment_by_claim').on(table.practiceId, table.claimId),
    index('adjustment_by_line')
      .on(table.serviceLineId)
      .where(sql`service_line_id IS NOT NULL`),
  ],
);

export const providerAdjustment = pgTable(
  'provider_adjustment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    remittanceId: uuid('remittance_id')
      .notNull()
      .references(() => remittance.id),
    position: integer('position').notNull(),
    providerId: text('provider_id').notNull(),
    reasonCode: text('reason_code').notNull(),
    reference: text('reference'),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    fiscalPeriodDate: date('fiscal_period_date').notNull(),
    category: text('category', { enum: PROVIDER_ADJUSTMENT_CATEGORIES }).notNull(),
    counted: boolean('counted')
      .notNull()
      .generatedAlwaysAs(sql`category <> 'forward_balance'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('provider_adjustment_once').on(table.remittanceId, table.position), index('provider_adjustment_by_remittance').on(table.practiceId, table.remittanceId)],
);

export const parseReport = pgTable(
  'parse_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    sourceDocumentId: uuid('source_document_id')
      .notNull()
      .references(() => sourceDocument.id),
    outcome: text('outcome', { enum: PARSE_OUTCOMES }).notNull(),
    transactions: integer('transactions').notNull(),
    claims: integer('claims').notNull(),
    lines: integer('lines').notNull(),
    reversals: integer('reversals').notNull(),
    held: integer('held').notNull(),
    plbTotalCents: bigint('plb_total_cents', { mode: 'bigint' }).notNull(),
    loadedTransactions: integer('loaded_transactions').notNull(),
    loadedClaims: integer('loaded_claims').notNull(),
    loadedLines: integer('loaded_lines').notNull(),
    duplicateTransactions: integer('duplicate_transactions').notNull(),
    unknownCodes: text('unknown_codes').array().notNull().default(sql`'{}'`),
    errors: jsonb('errors').$type<readonly unknown[]>().notNull().default(sql`'[]'`),
    transactionOutcomes: jsonb('transaction_outcomes').$type<readonly unknown[]>().notNull().default(sql`'[]'`),
    codeListRelease: integer('code_list_release'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('parse_report_once').on(table.sourceDocumentId), index('parse_report_by_practice').on(table.practiceId, table.createdAt.desc())],
);

export const lineNote = pgTable(
  'line_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    serviceLineId: uuid('service_line_id')
      .notNull()
      .references(() => serviceLine.id),
    /** (enc) */
    note: text('note').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('line_note_by_line').on(table.practiceId, table.serviceLineId, table.createdAt)],
);

export type PatientRefRow = typeof patientRef.$inferSelect;
export type RemittanceRow = typeof remittance.$inferSelect;
export type ClaimRow = typeof claim.$inferSelect;
export type ServiceLineRow = typeof serviceLine.$inferSelect;
export type AdjustmentRow = typeof adjustment.$inferSelect;
export type ProviderAdjustmentRow = typeof providerAdjustment.$inferSelect;
export type ParseReportRow = typeof parseReport.$inferSelect;
export type LineNoteRow = typeof lineNote.$inferSelect;
