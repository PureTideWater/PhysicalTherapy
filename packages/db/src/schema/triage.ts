import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { rateRecord } from './contracts';
import { payer, plan } from './documents';
import { pricedLine, pricingRun } from './pricing';
import { serviceLine } from './remittances';
import { practice, user } from './tenancy';

/**
 * Triage, cases and audit reports (Data dictionary, Pricing, triage and cases: anomaly, line_status,
 * case, case_line; PRD 4, Audit v0; PRD 8, The status machine), mirroring
 * migrations/20261019160000_triage_cases_and_audit_reports.sql for typed queries. The SQL is the source
 * of truth for the monotonic stages and explicit reopens, the derived case columns, the write-off and
 * reopen rules, the report's freeze, attestation and release, row-level security and grants; a
 * database test checks that these columns match it. Every table is a PHI table: every query runs
 * inside a scope from src/authz, and the columns marked (enc) hold `enc:v1:` ciphertext under the
 * practice's data key.
 */

export const LINE_STAGE_VALUES = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'] as const;
export const CASE_STATE_VALUES = ['open', 'submitted', 'awaiting_response', 'partially_resolved', 'resolved', 'closed_written_off'] as const;
export const WRITE_OFF_REASON_VALUES = ['window_passed', 'payer_correct_on_review', 'not_worth_pursuit', 'duplicate', 'other'] as const;
export const AUDIT_REPORT_STATUSES = ['queued', 'ready', 'failed'] as const;
export type AuditReportStatus = (typeof AUDIT_REPORT_STATUSES)[number];
export const AUDIT_REPORT_FILES = ['pdf', 'csv'] as const;
export type AuditReportFile = (typeof AUDIT_REPORT_FILES)[number];

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const practiceId = () =>
  uuid('practice_id')
    .notNull()
    .references(() => practice.id);

export const anomaly = pgTable(
  'anomaly',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    pricingRunId: uuid('pricing_run_id')
      .notNull()
      .references(() => pricingRun.id),
    cohortKey: jsonb('cohort_key').$type<Readonly<Record<string, unknown>>>().notNull(),
    cohortSize: integer('cohort_size').notNull(),
    /** Per unit. */
    modalAllowedCents: bigint('modal_allowed_cents', { mode: 'bigint' }).notNull(),
    /** tp-anomaly-stats/1. */
    stats: jsonb('stats').$type<Readonly<Record<string, unknown>>>().notNull(),
    lineIds: uuid('line_ids').array().notNull(),
    reviewedBy: uuid('reviewed_by').references(() => user.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    validationRequestedBy: uuid('validation_requested_by').references(() => user.id),
    validationRequestedAt: timestamp('validation_requested_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('anomaly_once').on(table.pricingRunId, table.cohortKey), index('anomaly_by_run').on(table.practiceId, table.pricingRunId)],
);

export const lineStatus = pgTable(
  'line_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    serviceLineId: uuid('service_line_id')
      .notNull()
      .references(() => serviceLine.id),
    seq: bigint('seq', { mode: 'bigint' }).generatedAlwaysAsIdentity(),
    stage: text('stage', { enum: LINE_STAGE_VALUES }).notNull(),
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
    setBy: uuid('set_by').references(() => user.id),
    /** (enc) A reopen's reason. */
    reason: text('reason'),
    reopenedFrom: text('reopened_from', { enum: LINE_STAGE_VALUES }),
    /** The priced line triage judged the stage from. */
    pricedLineId: uuid('priced_line_id').references(() => pricedLine.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('line_status_by_line').on(table.practiceId, table.serviceLineId, table.seq.desc())],
);

export const caseTable = pgTable(
  'case',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    patternKey: jsonb('pattern_key').$type<Readonly<Record<string, unknown>>>().notNull(),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => payer.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plan.id),
    rateRecordId: uuid('rate_record_id').references(() => rateRecord.id),
    ownerUserId: uuid('owner_user_id').references(() => user.id),
    /** Derived. */
    state: text('state', { enum: CASE_STATE_VALUES }).notNull().default('open'),
    /** Derived. */
    deadlineOn: date('deadline_on'),
    materialityCents: bigint('materiality_cents', { mode: 'bigint' }).notNull(),
    pursuitCostCents: bigint('pursuit_cost_cents', { mode: 'bigint' }),
    /** Derived: the sum of the variance of the lines not written off. */
    actionableCents: bigint('actionable_cents', { mode: 'bigint' }).notNull().default(0n),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('case_by_state').on(table.practiceId, table.state, table.deadlineOn),
    uniqueIndex('case_open_pattern')
      .on(table.practiceId, table.patternKey)
      .where(sql`state = 'open'`),
  ],
);

export const caseLine = pgTable(
  'case_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => caseTable.id),
    serviceLineId: uuid('service_line_id')
      .notNull()
      .references(() => serviceLine.id),
    pricedLineId: uuid('priced_line_id')
      .notNull()
      .references(() => pricedLine.id),
    actionable: boolean('actionable').notNull().default(true),
    writtenOffReason: text('written_off_reason', { enum: WRITE_OFF_REASON_VALUES }),
    /** (enc) */
    writtenOffText: text('written_off_text'),
    writtenOffBy: uuid('written_off_by').references(() => user.id),
    writtenOffAt: timestamp('written_off_at', { withTimezone: true }),
    /** (enc) */
    reopenReason: text('reopen_reason'),
    reopenedBy: uuid('reopened_by').references(() => user.id),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique('case_line_once').on(table.serviceLineId), index('case_line_by_case').on(table.practiceId, table.caseId)],
);

export const auditReport = pgTable(
  'audit_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    pricingRunId: uuid('pricing_run_id')
      .notNull()
      .references(() => pricingRun.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => user.id),
    status: text('status', { enum: AUDIT_REPORT_STATUSES }).notNull().default('queued'),
    asOf: date('as_of'),
    /** tp-audit-report/1. */
    content: jsonb('content').$type<Readonly<Record<string, unknown>>>(),
    pdfKey: text('pdf_key'),
    pdfSha256: text('pdf_sha256'),
    csvKey: text('csv_key'),
    csvSha256: text('csv_sha256'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    attestedBy: uuid('attested_by').references(() => user.id),
    attestedAt: timestamp('attested_at', { withTimezone: true }),
    attestation: jsonb('attestation').$type<Readonly<Record<string, unknown>>>(),
    releasedBy: uuid('released_by').references(() => user.id),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('audit_report_by_practice').on(table.practiceId, table.createdAt.desc(), table.id)],
);

export const auditReportDownload = pgTable(
  'audit_report_download',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: practiceId(),
    auditReportId: uuid('audit_report_id')
      .notNull()
      .references(() => auditReport.id),
    file: text('file', { enum: AUDIT_REPORT_FILES }).notNull(),
    downloadedBy: uuid('downloaded_by')
      .notNull()
      .references(() => user.id),
    downloadedAt: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('audit_report_download_by_report').on(table.practiceId, table.auditReportId, table.downloadedAt.desc())],
);

/**
 * A report's stored file: an opaque key under the practice and the report, never a name, a claim
 * number or a date. Each generation attempt writes new objects (stored objects are written once), so
 * an attempt that fails after writing leaves nothing the next one collides with.
 */
export function auditReportKey(practiceId: string, auditReportId: string, objectId: string, file: AuditReportFile): string {
  return `practices/${practiceId}/reports/${auditReportId}/${objectId}.${file}`;
}

export type AnomalyRow = typeof anomaly.$inferSelect;
export type LineStatusRow = typeof lineStatus.$inferSelect;
export type CaseRow = typeof caseTable.$inferSelect;
export type CaseLineRow = typeof caseLine.$inferSelect;
export type AuditReportRow = typeof auditReport.$inferSelect;
export type AuditReportDownloadRow = typeof auditReportDownload.$inferSelect;
