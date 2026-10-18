import { bigint, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { prospectRequest } from './onboarding';
import { user } from './tenancy';

/**
 * The free screening layer (Change Order 001, CO-04 and CO-12; reconciliation-001 D18 to D21; docs/adr/0062),
 * mirroring migrations/20261104090000_free_screening.sql for typed queries. None holds PHI and none has a
 * practice_id: a prospect's practice name, state, ZIP and contact address; an upload's hash, row count and
 * rejection reasons (codes, column positions and kinds, never a header or a cell); the place-of-service split a
 * contract specialist approves; a run pinned to a release and a split; and one aggregate row per uploaded row with
 * the engine's figures. Row-level security is forced on every one with the owner's policy only; the application and
 * operator roles reach them through the SECURITY DEFINER functions alone. Every row but the split expires 30 days
 * after its upload.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const expiresAt = () => timestamp('expires_at', { withTimezone: true }).notNull();

/** How long a screening and its result link last. */
export const SCREENING_DAYS = 30;

/** The payer products an upload may declare (D20 a); format.ts in the worker holds the same list. */
export const SCREENING_PAYER_PRODUCTS = ['medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other'] as const;
export type ScreeningPayerProduct = (typeof SCREENING_PAYER_PRODUCTS)[number];
export const SCREENING_UPLOAD_STATUSES = ['accepted', 'rejected'] as const;
export type ScreeningUploadStatus = (typeof SCREENING_UPLOAD_STATUSES)[number];
export const SCREENING_RUN_STATUSES = ['queued', 'pricing', 'complete', 'failed'] as const;
export type ScreeningRunStatus = (typeof SCREENING_RUN_STATUSES)[number];
/**
 * What became of a row: pending until priced; priced or unpriced by the engine; rates_change_in_band when a record
 * the trace names does not cover the whole band; contract_required for MA contracted and commercial rows (never
 * priced as non-contracted); not_screened for medicaid and other rows.
 */
export const SCREENING_DISPOSITIONS = ['pending', 'priced', 'unpriced', 'rates_change_in_band', 'contract_required', 'not_screened'] as const;
export type ScreeningDisposition = (typeof SCREENING_DISPOSITIONS)[number];

export const screeningProspect = pgTable(
  'screening_prospect',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceName: text('practice_name').notNull(),
    state: text('state').notNull(),
    /** Five digits; no ZIP+4 (the engine takes a five-digit ZIP alone, so a ZIP that needs its ZIP+4 is refused). */
    zip: text('zip').notNull(),
    contactEmail: text('contact_email').notNull(),
    createdAt: createdAt(),
    expiresAt: expiresAt(),
  },
  (table) => [index('screening_prospect_by_expiry').on(table.expiresAt)],
);

export const screeningUpload = pgTable(
  'screening_upload',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => screeningProspect.id, { onDelete: 'cascade' }),
    fileSha256: text('file_sha256').notNull(),
    rowCount: integer('row_count').notNull(),
    status: text('status', { enum: SCREENING_UPLOAD_STATUSES }).notNull(),
    /** Codes, column positions, rows, fields and PHI kinds only (screening_rejections_valid()). */
    rejectionReasons: jsonb('rejection_reasons').$type<readonly Readonly<Record<string, string | number>>[]>().notNull(),
    createdAt: createdAt(),
    expiresAt: expiresAt(),
  },
  (table) => [index('screening_upload_by_prospect').on(table.prospectId)],
);

export const screeningPlaceOfServiceSplit = pgTable(
  'screening_place_of_service_split',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    settings: jsonb('settings').$type<Readonly<Record<string, 'facility' | 'non_facility'>>>().notNull(),
    approvedBy: uuid('approved_by')
      .notNull()
      .references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('screening_place_of_service_split_in_force').on(table.approvedAt.desc(), table.id.desc())],
);

export const screeningRun = pgTable(
  'screening_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id')
      .notNull()
      .unique()
      .references(() => screeningUpload.id, { onDelete: 'cascade' }),
    /** The release in force at creation; no foreign key, so no DDL touches rule_release. */
    releaseNo: integer('release_no').notNull(),
    releaseManifestSha256: text('release_manifest_sha256').notNull(),
    placeOfServiceSplitId: uuid('place_of_service_split_id')
      .notNull()
      .references(() => screeningPlaceOfServiceSplit.id),
    rowCount: integer('row_count').notNull(),
    status: text('status', { enum: SCREENING_RUN_STATUSES }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    engineVersion: text('engine_version'),
    failureCode: text('failure_code'),
    /** The SHA-256 of the result link's token; the token is never stored. */
    resultTokenSha256: text('result_token_sha256').unique(),
    convertedProspectRequestId: uuid('converted_prospect_request_id').references(() => prospectRequest.id),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    createdAt: createdAt(),
    expiresAt: expiresAt(),
  },
  (table) => [index('screening_run_by_status').on(table.status, table.createdAt)],
);

export const screeningResult = pgTable(
  'screening_result',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => screeningRun.id, { onDelete: 'cascade' }),
    rowNo: integer('row_no').notNull(),
    procedureCode: text('procedure_code').notNull(),
    /** Sorted, distinct, at most four. */
    modifiers: text('modifiers').array().notNull(),
    units: integer('units').notNull(),
    placeOfService: text('place_of_service').notNull(),
    payerProduct: text('payer_product', { enum: SCREENING_PAYER_PRODUCTS }).notNull(),
    /** A calendar quarter, YYYY-Qn. */
    serviceBand: text('service_band').notNull(),
    claimCount: integer('claim_count').notNull(),
    observedAllowedCents: bigint('observed_allowed_cents', { mode: 'bigint' }).notNull(),
    disposition: text('disposition', { enum: SCREENING_DISPOSITIONS }).notNull(),
    /**
     * The engine's amount for one line priced alone, before sequestration (its trace's), rounded once; the unrounded
     * value beside it (numeric without a scale): the figure before the reduction across codes.
     */
    expectedLineCents: bigint('expected_line_cents', { mode: 'bigint' }),
    expectedLineUnrounded: numeric('expected_line_unrounded'),
    /** The line amount times the claim count, in bigint, outside the engine (D19 a). */
    expectedCents: bigint('expected_cents', { mode: 'bigint' }),
    differenceCents: bigint('difference_cents', { mode: 'bigint' }),
    /** For a priced row: the engine's trace ranked its code in the reduction across a visit's codes (mppr in_pool). */
    inReductionPool: boolean('in_reduction_pool'),
    /** For a pooled row only: the engine's amount for the row as a later procedure of a visit, before sequestration, rounded once: the fully reduced figure. */
    reducedLineCents: bigint('reduced_line_cents', { mode: 'bigint' }),
    reducedLineUnrounded: numeric('reduced_line_unrounded'),
    reducedCents: bigint('reduced_cents', { mode: 'bigint' }),
    reducedDifferenceCents: bigint('reduced_difference_cents', { mode: 'bigint' }),
    reducedTraceSha256: text('reduced_trace_sha256'),
    unpricedReason: text('unpriced_reason'),
    unpricedDetail: text('unpriced_detail'),
    traceSha256: text('trace_sha256'),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.rowNo] }),
    unique('screening_result_once').on(table.runId, table.procedureCode, table.modifiers, table.units, table.placeOfService, table.payerProduct, table.serviceBand),
  ],
);

export type ScreeningProspectRow = typeof screeningProspect.$inferSelect;
export type ScreeningUploadRow = typeof screeningUpload.$inferSelect;
export type ScreeningPlaceOfServiceSplitRow = typeof screeningPlaceOfServiceSplit.$inferSelect;
export type ScreeningRunRow = typeof screeningRun.$inferSelect;
export type ScreeningResultRow = typeof screeningResult.$inferSelect;
