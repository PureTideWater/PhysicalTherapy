import { sql } from 'drizzle-orm';
import { type AnyPgColumn, bigint, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { contractVersion, payerPlanMapping, rateRecord } from './contracts';
import { serviceLine } from './remittances';
import { ruleRelease } from './rules';
import { placeOfServiceSplit } from './screening';
import { practice, user } from './tenancy';

/**
 * Pricing runs and priced lines (Data dictionary, Pricing, triage and cases; PRD 8; PRD 11), mirroring
 * migrations/20261018090000_pricing_runs.sql, 20261019150000_reruns_and_release_withdrawal.sql, 20261020090000_monitoring_digests_notifications.sql and 20261105090000_pricing_location_and_zip_plus_four.sql for typed queries. The SQL is the source of truth for the
 * run's states, the pinned release (a rule-release mismatch is refused), the immutability of complete
 * runs and of every priced line (triggers for every role), row-level security and grants; a database
 * test checks that these columns match it. Both are PHI tables: every query runs inside a scope from
 * src/authz.
 */

/** queued: created, the price job queued; running: the job took it; complete; failed (with a code). */
export const PRICING_RUN_STATUSES = ['queued', 'running', 'complete', 'failed'] as const;
export type PricingRunStatus = (typeof PRICING_RUN_STATUSES)[number];

/** The unpriced reasons the column accepts: the closed list of docs/product/unpriced-reasons.md. */
export const PRICED_LINE_REASONS = [
  'NO_AGREEMENT',
  'NO_MAPPING',
  'AMBIGUOUS_RATE',
  'NO_RATE_FOR_CODE',
  'NO_PFS_VALUE',
  'UNSUPPORTED_METHOD',
  'SECONDARY_PAYER',
  'MUE_EXCEEDED',
  'UNITS_RULE_UNKNOWN',
  'DATE_OUTSIDE_VERSIONS',
  'REVERSED_CLAIM',
  'ENGINE_ERROR',
] as const;

export const PRICED_LINE_METHODS = ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'UNSUPPORTED'] as const;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const pricingRun = pgTable(
  'pricing_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    /** The first and last service dates the run prices, both included. */
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    releaseNo: integer('release_no')
      .notNull()
      .references(() => ruleRelease.releaseNo),
    engineVersion: text('engine_version').notNull(),
    /** The person who created the run; null for a run the monitoring job created (created_by_job_id). */
    createdBy: uuid('created_by').references(() => user.id),
    status: text('status', { enum: PRICING_RUN_STATUSES }).notNull().default('queued'),
    /** tp-pricing-coverage/1, once complete. */
    coverage: jsonb('coverage').$type<Readonly<Record<string, unknown>>>(),
    failureCode: text('failure_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** The complete run of the practice this one prices again (a re-run; migrations/20261019150000). */
    rerunOfId: uuid('rerun_of_id').references((): AnyPgColumn => pricingRun.id),
    /** A re-run's cut-off: the original's, so the two price the same lines. Null for a first run. */
    linesLoadedBy: timestamp('lines_loaded_by', { withTimezone: true }),
    /** Who accepted a complete re-run, and when; a re-run is in effect only once accepted. */
    acceptedBy: uuid('accepted_by').references(() => user.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** The monitor job that created the run (migrations/20261020090000); exactly one of this and created_by is set. */
    createdByJobId: uuid('created_by_job_id'),
    /**
     * The place-of-service split in force when the run was created, set by the database (pricing_run_rules(), never a
     * caller; migrations/20261105090000; ADR 0064): every place the practice has not set prices with it. Null when no
     * split was approved then, and on every run created before the migration.
     */
    placeOfServiceSplitId: uuid('place_of_service_split_id').references(() => placeOfServiceSplit.id),
  },
  (table) => [
    index('pricing_run_by_period').on(table.practiceId, table.periodFrom, table.periodTo),
    index('pricing_run_by_practice').on(table.practiceId, table.createdAt.desc(), table.id),
    index('pricing_run_complete_by_practice')
      .on(table.practiceId, table.completedAt.desc())
      .where(sql`status = 'complete'`),
    index('pricing_run_reruns')
      .on(table.practiceId, table.rerunOfId)
      .where(sql`rerun_of_id IS NOT NULL`),
  ],
);

export const pricedLine = pgTable(
  'priced_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    pricingRunId: uuid('pricing_run_id')
      .notNull()
      .references(() => pricingRun.id),
    serviceLineId: uuid('service_line_id')
      .notNull()
      .references(() => serviceLine.id),
    mappingId: uuid('mapping_id').references(() => payerPlanMapping.id),
    contractVersionId: uuid('contract_version_id').references(() => contractVersion.id),
    rateRecordId: uuid('rate_record_id').references(() => rateRecord.id),
    method: text('method', { enum: PRICED_LINE_METHODS }),
    expectedAllowedCents: bigint('expected_allowed_cents', { mode: 'bigint' }),
    /** The exact amount before the one rounding: numeric without a scale (docs/adr/0029). */
    expectedUnrounded: numeric('expected_unrounded'),
    observedAllowedCents: bigint('observed_allowed_cents', { mode: 'bigint' }).notNull(),
    varianceCents: bigint('variance_cents', { mode: 'bigint' }),
    unpricedReason: text('unpriced_reason', { enum: PRICED_LINE_REASONS }),
    adjustmentsApplied: jsonb('adjustments_applied').$type<readonly { readonly name: string; readonly before_cents: string; readonly after_cents: string }[]>().notNull().default(sql`'[]'`),
    windowEndsOn: date('window_ends_on'),
    /** tp-pricing-trace/1 (@tp/pricing's pricingTraceSchema). */
    trace: jsonb('trace').$type<Readonly<Record<string, unknown>>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('priced_line_once').on(table.pricingRunId, table.serviceLineId),
    index('priced_line_by_reason').on(table.pricingRunId, table.unpricedReason),
    index('priced_line_underpaid')
      .on(table.practiceId, table.varianceCents.desc())
      .where(sql`variance_cents > 0`),
    index('priced_line_by_service_line').on(table.practiceId, table.serviceLineId),
  ],
);

export type PricingRunRow = typeof pricingRun.$inferSelect;
export type PricedLineRow = typeof pricedLine.$inferSelect;
