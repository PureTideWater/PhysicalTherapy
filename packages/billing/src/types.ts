import type { Cents } from '@tp/money';

/**
 * What billing knows about Stripe (PRD 6, Billing: "Stripe customers, subscriptions, invoices, ACH and
 * card"; PRD 15: "Stripe (no PHI: organization names and invoices only)"; docs/adr/0050). The product
 * sends Stripe an organization's name and its opaque ID, and reads back references, statuses, integer
 * cents and dates. Nothing here ever carries a practice's record.
 */

export type PlanInterval = 'monthly' | 'annual';
export const PLAN_INTERVALS: readonly PlanInterval[] = ['monthly', 'annual'];

/** ACH debit (Stripe's us_bank_account) or card. */
export type PaymentMethodKind = 'us_bank_account' | 'card';

export type SubscriptionStatus = 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
export type InvoiceKind = 'subscription' | 'audit' | 'other';

/** A subscription as an event reports it. */
export interface SubscriptionSnapshot {
  readonly subscriptionRef: string;
  readonly customerRef: string;
  readonly priceRef: string;
  readonly plan: PlanInterval;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly canceledAt: Date | null;
}

/** An invoice as an event reports it, in integer cents. */
export interface InvoiceSnapshot {
  readonly invoiceRef: string;
  readonly customerRef: string;
  readonly subscriptionRef: string | null;
  readonly kind: InvoiceKind;
  readonly number: string | null;
  readonly status: InvoiceStatus;
  readonly currency: 'usd';
  readonly amountDueCents: Cents;
  readonly amountPaidCents: Cents;
  readonly amountRemainingCents: Cents;
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;
  readonly dueAt: Date | null;
  readonly paidAt: Date | null;
  readonly attemptCount: number;
  readonly hostedInvoiceUrl: string | null;
}

interface EventBase {
  /** Stripe's event ID: a delivery repeated carries the same one. */
  readonly eventId: string;
  /** Stripe's event type, as sent. */
  readonly type: string;
  /** When Stripe created the event. */
  readonly occurredAt: Date;
}

/** A webhook event, verified and read into what billing keeps. */
export type BillingEvent =
  | (EventBase & { readonly kind: 'subscription'; readonly subscription: SubscriptionSnapshot })
  | (EventBase & { readonly kind: 'invoice'; readonly invoice: InvoiceSnapshot; readonly paymentFailed: boolean })
  | (EventBase & { readonly kind: 'payment_method'; readonly customerRef: string; readonly paymentMethodRef: string })
  | (EventBase & { readonly kind: 'ignored' });

/** The payment method on file for a customer, as the settings screen shows it. */
export interface PaymentMethodSummary {
  readonly paymentMethodRef: string;
  readonly kind: PaymentMethodKind;
  /** The account's or card's last four digits. */
  readonly last4: string;
  /** The bank's name or the card's brand, where Stripe gives one. */
  readonly label: string | null;
}

/** How an invoice's latest payment went, where Stripe says. */
export interface InvoicePaymentDetails {
  readonly methodKind: PaymentMethodKind | null;
  /** The latest failure's code (an ACH return or a card decline), or null. */
  readonly failureCode: string | null;
}

/** What the browser needs to collect a payment method with Stripe Elements. */
export interface SetupIntentResult {
  readonly setupIntentRef: string;
  readonly clientSecret: string;
}

/**
 * Billing's view of Stripe. Every call that creates or changes something takes an idempotency key, so a
 * request repeated (a retried form, a replayed job) creates nothing twice.
 */
export interface BillingProvider {
  readonly kind: 'stripe' | 'local';
  /** The publishable key Stripe Elements runs with; null for the local simulator, which needs none. */
  readonly publishableKey: string | null;
  /** The Stripe customer for an organization: its name and opaque ID, nothing else. */
  createCustomer(input: { readonly organizationId: string; readonly name: string; readonly idempotencyKey: string }): Promise<string>;
  /** A SetupIntent for ACH debit or a card, whose client secret Stripe Elements confirms in the browser. */
  createSetupIntent(input: { readonly customerRef: string; readonly idempotencyKey: string }): Promise<SetupIntentResult>;
  /** Makes a confirmed payment method the customer's default for its invoices. */
  setDefaultPaymentMethod(input: { readonly customerRef: string; readonly paymentMethodRef: string; readonly idempotencyKey: string }): Promise<void>;
  /** The customer's default payment method, or null. */
  paymentMethodOnFile(customerRef: string): Promise<PaymentMethodSummary | null>;
  /** Subscribes the customer to the monthly or annual plan, its invoices charged to the default payment method. */
  createSubscription(input: { readonly customerRef: string; readonly organizationId: string; readonly plan: PlanInterval; readonly idempotencyKey: string }): Promise<string>;
  /** Cancels a subscription at the end of its period. */
  cancelSubscription(input: { readonly subscriptionRef: string; readonly idempotencyKey: string }): Promise<void>;
  /** An audit invoice (PRD 4, Audit v0), finalized and charged to the default payment method. */
  createAuditInvoice(input: { readonly customerRef: string; readonly organizationId: string; readonly idempotencyKey: string }): Promise<string>;
  /** Tries an open invoice's payment again now. */
  payInvoice(input: { readonly invoiceRef: string; readonly idempotencyKey: string }): Promise<void>;
  /** How an invoice's latest payment went (the method and a failure's code). */
  invoicePayment(invoiceRef: string): Promise<InvoicePaymentDetails>;
  /** Verifies a webhook's signature and reads its event; throws WebhookSignatureError otherwise. */
  readWebhook(payload: string, signature: string | null): BillingEvent;
}

/** A webhook whose signature does not verify: refused, and nothing in it is read. */
export class WebhookSignatureError extends Error {
  override readonly name = 'WebhookSignatureError';
}

/** A provider call refused (by Stripe or by the simulator), with a code and never a value. */
export class BillingProviderError extends Error {
  override readonly name = 'BillingProviderError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
