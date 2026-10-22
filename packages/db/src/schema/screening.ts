import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import {
  MARKETING_CHANNELS,
  PAID_CLICKS,
  PROSPECT_SOURCES,
  SCREENING_COUNT_BANDS,
  SCREENING_DIFFERENCE_BANDS,
  SCREENING_OPEN_BANDS,
  prospectRequest,
} from './onboarding';
import { user } from './tenancy';

/**
 * The free screening layer (Change Order 001, CO-04 and CO-12; reconciliation-001 D18 to D21; docs/adr/0062),
 * mirroring migrations/20261104090000_free_screening.sql for typed queries. None holds PHI and none has a
 * practice_id: a prospect's practice name, state, ZIP (with its ZIP+4 only where Medicare's locality list needs it)
 * and contact address; an upload's row count and rejection reasons (codes, column positions and kinds, never a header
 * or a cell), and for an accepted one the SHA-256 of the rows the server accepted (never of the file); the
 * place-of-service split a contract specialist approves (place_of_service_split since migrations/20261105090000, every
 * practice's default too); a run pinned to a release and a split; and one aggregate row per uploaded row with
 * the engine's figures. Row-level security is forced on every one with the owner's policy only; the application and
 * operator roles reach them through the SECURITY DEFINER functions alone. A screening's prospect, upload, run and rows
 * expire 30 days after its upload, and an accepted screening goes sooner when a later one of the same practice
 * replaces it.
 *
 * What outlives a screening (audit #57, the founder's rulings of 2026-10-20): its counts-only outcome
 * (screening_outcome, kept with no end date, unlinked when the screening goes; bands, whole-percent shares, closed
 * codes and flags, never a name, an email, a ZIP, an exact count, a date or a dollar figure); the frozen summary of a
 * converted or consenting prospect's screening (screening_lead and screening_lead_product, 12 months from the upload,
 * one a practice, every claim-line sum 0 or at least 11); and the campaign codes the founder lists
 * (marketing_campaign).
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
    /** Five digits; the ZIP+4, where Medicare needs it, is zipPlusFour. */
    zip: text('zip').notNull(),
    contactEmail: text('contact_email').notNull(),
    /** How the prospect heard of PaidWhole (PROSPECT_SOURCES), or none. */
    source: text('source', { enum: PROSPECT_SOURCES }),
    /** The first-party attribution cookie's campaign codes (pw_first_touch), normalised and shape-checked. */
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    /** Kept only when listed in marketing_campaign as the row is written, 'other' otherwise (a trigger; the founder's ruling of 2026-10-21). */
    utmCampaign: text('utm_campaign'),
    /** The kind of paid click the landing URL carried, from a click-ID parameter's presence (never its value). */
    paidClick: text('paid_click', { enum: PAID_CLICKS }),
    /** The billing firm that referred the practice, as typed and screened. */
    referringFirm: text('referring_firm'),
    /** The SHA-256 of the follow-up consent wording ticked; null is no consent (PR 6e captures it). */
    followupConsentSha256: text('followup_consent_sha256'),
    /** The SHA-256 of the screening terms accepted (audit #51); null until their wording and checkbox land. */
    screeningTermsSha256: text('screening_terms_sha256'),
    createdAt: createdAt(),
    expiresAt: expiresAt(),
    /**
     * The ZIP+4's four digits, kept only when the ZIP's locality_map record in the release in force needs them, and
     * deleted with the prospect (migrations/20261105090000; ADR 0064); null otherwise.
     */
    zipPlusFour: text('zip_plus_four'),
  },
  (table) => [
    index('screening_prospect_by_expiry').on(table.expiresAt),
    // The prospects of one practice, as a new screening finds the one it replaces (screening_replaced()).
    index('screening_prospect_by_contact').on(table.contactEmail),
    index('screening_prospect_by_practice').on(table.zip, sql`screening_practice_key(${table.practiceName})`),
  ],
);

export const screeningUpload = pgTable(
  'screening_upload',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => screeningProspect.id, { onDelete: 'cascade' }),
    /**
     * On an accepted upload, the SHA-256 of its rows as the server accepted them (encodeScreeningRows), computed by
     * submit_screening(); never a hash of the file, which holds the rows the browser left out. Null on a refused one.
     */
    rowsSha256: text('rows_sha256'),
    rowCount: integer('row_count').notNull(),
    status: text('status', { enum: SCREENING_UPLOAD_STATUSES }).notNull(),
    /** Codes, column positions, rows, fields and PHI kinds only (screening_rejections_valid()). */
    rejectionReasons: jsonb('rejection_reasons').$type<readonly Readonly<Record<string, string | number>>[]>().notNull(),
    /**
     * The rows of fewer than 11 claim lines the prospect's browser left out before sending (the CMS small-cell
     * standard), as three numbers for the result to say: how many, their claim lines and their allowed total. Never
     * which rows, and no hash over them; zero on a rejected upload.
     */
    leftOutRows: integer('left_out_rows').notNull().default(0),
    leftOutClaimLines: integer('left_out_claim_lines').notNull().default(0),
    leftOutAllowedCents: bigint('left_out_allowed_cents', { mode: 'bigint' }).notNull().default(0n),
    createdAt: createdAt(),
    expiresAt: expiresAt(),
    /**
     * The Medicare rows the browser left out because their quarter is outside the release's loaded content
     * (rule_release_content_span(); audit #7, the founder's answer to PR 6b's Q6 (a)): how many, their claim lines and
     * their allowed total, counted after the floor's. Never which rows; zero on a rejected upload; never copied to a
     * kept summary or an outcome (migrations/20261105090000).
     */
    outsideContentRows: integer('outside_content_rows').notNull().default(0),
    outsideContentClaimLines: bigint('outside_content_claim_lines', { mode: 'bigint' }).notNull().default(0n),
    outsideContentAllowedCents: bigint('outside_content_allowed_cents', { mode: 'bigint' }).notNull().default(0n),
  },
  (table) => [index('screening_upload_by_prospect').on(table.prospectId)],
);

/**
 * The place-of-service split a contract specialist approves (rate_record.approve), append-only, the latest approval in
 * force: the free screening's split since migrations/20261104090000 and, since migrations/20261105090000 (PR 6b; ADR
 * 0064), every practice's default for a place it has not set, pinned on each pricing run
 * (pricing_run.place_of_service_split_id). Renamed from screening_place_of_service_split; the approval's audit action
 * and object type keep the old names.
 */
export const placeOfServiceSplit = pgTable(
  'place_of_service_split',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    settings: jsonb('settings').$type<Readonly<Record<string, 'facility' | 'non_facility'>>>().notNull(),
    approvedBy: uuid('approved_by')
      .notNull()
      .references(() => user.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('place_of_service_split_in_force').on(table.approvedAt.desc(), table.id.desc())],
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
      .references(() => placeOfServiceSplit.id),
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
    /** When a person first opened the result: the result page's signal, or the conversion; never the link's GET. */
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
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
    /** 11 to 100,000: a row of fewer claim lines can be one patient's service line, and is never stored. */
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

/** The stage a screening reached, as its outcome keeps it. */
export const SCREENING_OUTCOME_STAGES = ['refused', 'accepted', 'priced', 'failed'] as const;
export type ScreeningOutcomeStage = (typeof SCREENING_OUTCOME_STAGES)[number];

/** How long a converted or consenting prospect's frozen summary is kept, from the upload (the founder's ruling of 2026-10-20). */
export const SCREENING_LEAD_MONTHS = 12;

/**
 * The campaign codes a row may keep: the founder lists campaigns sent to many people; a listed code stays listed. A
 * prospect, a kept summary, an audit request and an outcome keep a link's campaign code only when it is listed here as
 * the row is written, 'other' for any other code (marketing_campaign_listed_only(); the founder's ruling of 2026-10-21).
 */
export const marketingCampaign = pgTable('marketing_campaign', {
  code: text('code').primaryKey(),
  /** What the listing's audit event names. */
  id: uuid('id').notNull().unique().defaultRandom(),
  label: text('label').notNull(),
  addedBy: uuid('added_by')
    .notNull()
    .references(() => user.id),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One counts-only row for every screening, a refused one included, kept with no end date and written by the definer
 * functions alone: bands, whole-percent shares of an allowed total it never holds, closed codes and flags. It links
 * to its screening's upload while that is kept, and is sealed once unlinked. No audit event names one.
 */
export const screeningOutcome = pgTable(
  'screening_outcome',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The live screening's upload while it is kept; null once it expires or is replaced. */
    uploadId: uuid('upload_id')
      .unique()
      .references(() => screeningUpload.id, { onDelete: 'set null' }),
    /** YYYY-MM, UTC. */
    screenedMonth: text('screened_month').notNull(),
    stage: text('stage', { enum: SCREENING_OUTCOME_STAGES }).notNull(),
    source: text('source', { enum: PROSPECT_SOURCES }),
    channel: text('channel', { enum: MARKETING_CHANNELS }).notNull(),
    /** A listed marketing_campaign code at submission, 'other' when not listed, null with no campaign code. */
    campaign: text('campaign'),
    consented: boolean('consented').notNull().default(false),
    rowBand: text('row_band', { enum: SCREENING_COUNT_BANDS }).notNull(),
    leftOutBand: text('left_out_band', { enum: SCREENING_COUNT_BANDS }).notNull().default('none'),
    /** A refused upload's reason codes, distinct and ascending. */
    refusalCodes: text('refusal_codes').array().notNull().default(sql`'{}'::text[]`),
    /** An accepted screening that followed a refused upload of the practice still kept. */
    afterRefusal: boolean('after_refusal').notNull().default(false),
    releaseNo: integer('release_no'),
    engineVersion: text('engine_version'),
    pricedSharePct: smallint('priced_share_pct'),
    contractSharePct: smallint('contract_share_pct'),
    couldNotPriceSharePct: smallint('could_not_price_share_pct'),
    notScreenedSharePct: smallint('not_screened_share_pct'),
    anomalyBand: text('anomaly_band', { enum: SCREENING_COUNT_BANDS }),
    anomalyDifferenceBand: text('anomaly_difference_band', { enum: SCREENING_DIFFERENCE_BANDS }),
    firstOpenBand: text('first_open_band', { enum: SCREENING_OPEN_BANDS }),
    converted: boolean('converted').notNull().default(false),
    superseded: boolean('superseded').notNull().default(false),
  },
  (table) => [index('screening_outcome_by_cohort').on(table.screenedMonth, table.source, table.channel, table.campaign)],
);

/**
 * The frozen summary of a converted or consenting prospect's screening, kept 12 months from the upload, one a practice
 * at a time (a later screening of the practice replaces it at its completion, carrying the request over). Its
 * claim-line sums are over whole rows of at least 11 claim lines; the left-out sums are kept only at 11 or more.
 */
export const screeningLead = pgTable(
  'screening_lead',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id')
      .unique()
      .references(() => screeningUpload.id, { onDelete: 'set null' }),
    practiceName: text('practice_name').notNull(),
    state: text('state').notNull(),
    zip: text('zip').notNull(),
    contactEmail: text('contact_email').notNull(),
    source: text('source', { enum: PROSPECT_SOURCES }),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    /** The prospect's, as kept: a listed code, 'other' or none. */
    utmCampaign: text('utm_campaign'),
    paidClick: text('paid_click', { enum: PAID_CLICKS }),
    referringFirm: text('referring_firm'),
    consentSha256: text('consent_sha256'),
    /** The withdrawal link's token as its SHA-256; consent summaries only (PR 6e). */
    withdrawalTokenSha256: text('withdrawal_token_sha256').unique(),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    prospectRequestId: uuid('prospect_request_id')
      .unique()
      .references(() => prospectRequest.id, { onDelete: 'cascade' }),
    releaseNo: integer('release_no').notNull(),
    releaseManifestSha256: text('release_manifest_sha256').notNull(),
    engineVersion: text('engine_version').notNull(),
    labelsVersion: text('labels_version').notNull(),
    screenedAt: timestamp('screened_at', { withTimezone: true }).notNull(),
    resultFirstOpenedAt: timestamp('result_first_opened_at', { withTimezone: true }),
    rowCount: integer('row_count').notNull(),
    claimLines: bigint('claim_lines', { mode: 'bigint' }).notNull(),
    observedCents: bigint('observed_cents', { mode: 'bigint' }).notNull(),
    anomalyRows: integer('anomaly_rows').notNull(),
    leftOutRows: integer('left_out_rows').notNull(),
    leftOutClaimLines: integer('left_out_claim_lines'),
    leftOutAllowedCents: bigint('left_out_allowed_cents', { mode: 'bigint' }),
    createdAt: createdAt(),
    expiresAt: expiresAt(),
  },
  (table) => [
    index('screening_lead_by_expiry').on(table.expiresAt),
    index('screening_lead_by_contact').on(table.contactEmail),
    index('screening_lead_by_practice').on(table.zip, sql`screening_practice_key(${table.practiceName})`),
  ],
);

/** A kept summary's sums by payer product; differences are computed by a read, never stored. */
export const screeningLeadProduct = pgTable(
  'screening_lead_product',
  {
    leadId: uuid('lead_id')
      .notNull()
      .references(() => screeningLead.id, { onDelete: 'cascade' }),
    payerProduct: text('payer_product', { enum: SCREENING_PAYER_PRODUCTS }).notNull(),
    rowCount: integer('row_count').notNull(),
    claimLines: bigint('claim_lines', { mode: 'bigint' }).notNull(),
    observedCents: bigint('observed_cents', { mode: 'bigint' }).notNull(),
    pricedRows: integer('priced_rows').notNull().default(0),
    pricedClaimLines: bigint('priced_claim_lines', { mode: 'bigint' }).notNull().default(0n),
    pricedObservedCents: bigint('priced_observed_cents', { mode: 'bigint' }).notNull().default(0n),
    /** Before the reduction across codes. */
    expectedCents: bigint('expected_cents', { mode: 'bigint' }).notNull().default(0n),
    /** Fully reduced for pooled rows, the one figure otherwise. */
    lowestCents: bigint('lowest_cents', { mode: 'bigint' }).notNull().default(0n),
    pooledRows: integer('pooled_rows').notNull().default(0),
    anomalyRows: integer('anomaly_rows').notNull().default(0),
    couldNotPriceRows: integer('could_not_price_rows').notNull().default(0),
    couldNotPriceClaimLines: bigint('could_not_price_claim_lines', { mode: 'bigint' }).notNull().default(0n),
    couldNotPriceObservedCents: bigint('could_not_price_observed_cents', { mode: 'bigint' }).notNull().default(0n),
  },
  (table) => [primaryKey({ columns: [table.leadId, table.payerProduct] })],
);

export type ScreeningProspectRow = typeof screeningProspect.$inferSelect;
export type ScreeningUploadRow = typeof screeningUpload.$inferSelect;
export type PlaceOfServiceSplitRow = typeof placeOfServiceSplit.$inferSelect;
export type ScreeningRunRow = typeof screeningRun.$inferSelect;
export type ScreeningResultRow = typeof screeningResult.$inferSelect;
export type MarketingCampaignRow = typeof marketingCampaign.$inferSelect;
export type ScreeningOutcomeRow = typeof screeningOutcome.$inferSelect;
export type ScreeningLeadRow = typeof screeningLead.$inferSelect;
export type ScreeningLeadProductRow = typeof screeningLeadProduct.$inferSelect;
