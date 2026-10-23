import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { NOTICE_RECIPIENT_STATES, organization, user } from './tenancy';

/**
 * Billing (Data dictionary, Operations: subscription, invoice, usage_snapshot; PRD 8: "Billing never reads
 * PHI tables"; docs/adr/0050), mirroring migrations/20261029150000_billing.sql for typed queries. These are
 * organization-level records with no practice_id: Stripe's references, statuses, integer cents and dates.
 * The SQL is the source of truth for who reads and writes them (tp_billing writes; an organization's
 * administrators and platform administrators read), the status order and the suspension rule; a database
 * test checks that these columns match it.
 */

export const PLAN_INTERVALS = ['monthly', 'annual'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];
export const SUBSCRIPTION_STATUSES = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const INVOICE_KINDS = ['subscription', 'audit', 'other'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_STATUSES = ['draft', 'open', 'paid', 'void', 'uncollectible'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const PAYMENT_METHOD_KINDS = ['us_bank_account', 'card'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];
/** The dunning notices, in order, and the two endings (docs/adr/0050). */
export const DUNNING_STAGES = ['payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated', 'resolved'] as const;
export type DunningStage = (typeof DUNNING_STAGES)[number];
export const BILLING_EVENT_OUTCOMES = ['received', 'applied', 'stale', 'ignored', 'unknown_customer'] as const;
export type BillingEventOutcome = (typeof BILLING_EVENT_OUTCOMES)[number];
/** billing_standing (a view): an organization's standing from its oldest invoice whose payment failed and is unpaid. */
export const BILLING_STANDINGS = ['good', 'past_due', 'suspended'] as const;
export type BillingStanding = (typeof BILLING_STANDINGS)[number];

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const subscription = pgTable(
  'subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripePriceId: text('stripe_price_id').notNull(),
    plan: text('plan', { enum: PLAN_INTERVALS }).notNull(),
    status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    /** When Stripe created the event the row last took. */
    stripeEventAt: timestamp('stripe_event_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('subscription_by_organization').on(table.organizationId, table.createdAt.desc())],
);

export const invoice = pgTable(
  'invoice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    stripeInvoiceId: text('stripe_invoice_id').notNull().unique(),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripeSubscriptionId: text('stripe_subscription_id'),
    kind: text('kind', { enum: INVOICE_KINDS }).notNull(),
    number: text('number'),
    status: text('status', { enum: INVOICE_STATUSES }).notNull(),
    currency: text('currency').notNull(),
    amountDueCents: bigint('amount_due_cents', { mode: 'bigint' }).notNull(),
    amountPaidCents: bigint('amount_paid_cents', { mode: 'bigint' }).notNull(),
    amountRemainingCents: bigint('amount_remaining_cents', { mode: 'bigint' }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentMethodKind: text('payment_method_kind', { enum: PAYMENT_METHOD_KINDS }),
    attemptCount: integer('attempt_count').notNull().default(0),
    /** The dunning clock: the first failed payment of this invoice. */
    firstFailedAt: timestamp('first_failed_at', { withTimezone: true }),
    lastFailureCode: text('last_failure_code'),
    hostedInvoiceUrl: text('hosted_invoice_url'),
    dunningStage: text('dunning_stage', { enum: DUNNING_STAGES }),
    dunningNotifiedAt: timestamp('dunning_notified_at', { withTimezone: true }),
    stripeEventAt: timestamp('stripe_event_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('invoice_by_organization').on(table.organizationId, table.createdAt.desc())],
);

export const usageSnapshot = pgTable(
  'usage_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    date: date('date').notNull(),
    grantedPractices: integer('granted_practices').notNull(),
    activePractices: integer('active_practices').notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique('usage_snapshot_once').on(table.organizationId, table.date)],
);

export const billingEvent = pgTable(
  'billing_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: text('stripe_event_id').notNull().unique(),
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    organizationId: uuid('organization_id').references(() => organization.id),
    outcome: text('outcome', { enum: BILLING_EVENT_OUTCOMES }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('billing_event_by_organization').on(table.organizationId, table.receivedAt)],
);

/** A subscription claim's states (migrations/20261101090000_billing_review.sql; docs/adr/0055). */
export const SUBSCRIPTION_CLAIM_STATUSES = ['pending', 'created', 'failed', 'ended'] as const;
export type SubscriptionClaimStatus = (typeof SUBSCRIPTION_CLAIM_STATUSES)[number];

/**
 * One subscription being set up or in place per organization, claimed before Stripe is asked (a unique partial
 * index on the organization while pending or created), so two submissions cannot both subscribe.
 */
export const subscriptionClaim = pgTable(
  'subscription_claim',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    plan: text('plan', { enum: PLAN_INTERVALS }).notNull(),
    status: text('status', { enum: SUBSCRIPTION_CLAIM_STATUSES }).notNull().default('pending'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('subscription_claim_by_subscription').on(table.stripeSubscriptionId)],
);

/** The stages a dunning notice goes out for: invoice.dunning_stage's list less resolved, which sends nothing. */
export const DUNNING_NOTICE_STAGES = ['payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated'] as const;
export type DunningNoticeStage = (typeof DUNNING_NOTICE_STAGES)[number];

/**
 * A dunning notice's outbox (audit #76, D10; migration 20261107090000): one row per invoice, stage and billing owner,
 * pending until sent, then its message's state, or failed. Billing's: no role reads or writes it but through the
 * billing definer functions. It follows the invoice, which is never deleted.
 */
export const dunningNoticeRecipient = pgTable(
  'dunning_notice_recipient',
  {
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoice.id),
    stage: text('stage', { enum: DUNNING_NOTICE_STAGES }).notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    sesMessageId: text('ses_message_id').unique(),
    state: text('state', { enum: NOTICE_RECIPIENT_STATES }).notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    failureCode: text('failure_code'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.invoiceId, table.stage, table.userId] }),
    index('dunning_notice_recipient_by_organization').on(table.organizationId, table.invoiceId),
    index('dunning_notice_recipient_pending')
      .on(table.nextAttemptAt)
      .where(sql`state = 'pending'`),
  ],
);

export type SubscriptionRow = typeof subscription.$inferSelect;
export type InvoiceRow = typeof invoice.$inferSelect;
export type UsageSnapshotRow = typeof usageSnapshot.$inferSelect;
export type BillingEventRow = typeof billingEvent.$inferSelect;
export type SubscriptionClaimRow = typeof subscriptionClaim.$inferSelect;
export type DunningNoticeRecipientRow = typeof dunningNoticeRecipient.$inferSelect;
