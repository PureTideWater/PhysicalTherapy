import { type Cents, cents } from '@tp/money';
import { z } from 'zod';

import type { BillingEvent, InvoiceKind, InvoiceSnapshot, PlanInterval, SubscriptionSnapshot } from './types';

/**
 * Reads a verified Stripe event into a BillingEvent (docs/adr/0050). The same reader serves the Stripe
 * implementation (the SDK's verified event) and the local simulator (which sends events in Stripe's own
 * shape), so what billing keeps never depends on which one sent it. Only the fields billing keeps are read,
 * each checked: Stripe IDs by their prefixes, amounts as whole non-negative cents (Stripe sends integers;
 * anything else is refused, never rounded), times as Unix seconds. An event of a type billing does not keep,
 * or one it cannot read (a currency other than dollars, a price with another interval), is "ignored": it is
 * recorded and changes nothing.
 */

const stripeId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]{1,250}$`));
const seconds = z.number().int().nonnegative();
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const reference = (prefix: string) => z.union([stripeId(prefix), z.looseObject({ id: stripeId(prefix) }).transform((value) => value.id)]);

const SUBSCRIPTION = z.looseObject({
  id: stripeId('sub'),
  customer: reference('cus'),
  status: z.enum(['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused']),
  cancel_at_period_end: z.boolean(),
  canceled_at: seconds.nullable(),
  items: z.looseObject({
    data: z
      .array(
        z.looseObject({
          current_period_start: seconds.nullish(),
          current_period_end: seconds.nullish(),
          price: z.looseObject({ id: stripeId('price'), recurring: z.looseObject({ interval: z.string() }).nullable() }),
        }),
      )
      .min(1),
  }),
});

const INVOICE = z.looseObject({
  id: stripeId('in'),
  customer: reference('cus').nullable(),
  number: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).nullable(),
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']).nullable(),
  currency: z.string(),
  amount_due: amount,
  amount_paid: amount,
  amount_remaining: amount,
  period_start: seconds.nullish(),
  period_end: seconds.nullish(),
  due_date: seconds.nullish(),
  attempt_count: z.number().int().nonnegative(),
  hosted_invoice_url: z.string().nullish(),
  metadata: z.record(z.string(), z.string()).nullish(),
  status_transitions: z.looseObject({ paid_at: seconds.nullish() }).nullish(),
  parent: z
    .looseObject({ subscription_details: z.looseObject({ subscription: reference('sub') }).nullish() })
    .nullish(),
});

const SETUP_INTENT = z.looseObject({ customer: reference('cus'), payment_method: reference('pm') });

const EVENT = z.looseObject({
  id: stripeId('evt'),
  type: z.string().regex(/^[a-z_]{1,64}(\.[a-z_]{1,64}){0,4}$/),
  created: seconds,
  data: z.looseObject({ object: z.unknown() }),
});

const SUBSCRIPTION_EVENTS = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed']);
const INVOICE_EVENTS = new Set([
  'invoice.created',
  'invoice.finalized',
  'invoice.updated',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'invoice.overdue',
]);

/** The hosted invoice page, kept only where it is Stripe's (the database checks the same). */
const HOSTED_INVOICE = /^https:\/\/[a-z0-9.-]+\.stripe\.com\/[A-Za-z0-9/_.~=?&%-]{1,2000}$/;

/** The metadata key an audit invoice carries, so its kind is known (the invoice has no subscription). */
export const INVOICE_KIND_METADATA = 'tp_kind';
/** The metadata key every customer, subscription and invoice carries: the organization's opaque ID. */
export const ORGANIZATION_METADATA = 'tp_organization_id';

/** The event could not be read: its shape is not Stripe's. */
export class BillingEventError extends Error {
  override readonly name = 'BillingEventError';
}

function at(value: number | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value * 1000);
}

function centsOf(value: number): Cents {
  return cents(BigInt(value));
}

function planOf(interval: string | undefined): PlanInterval | null {
  return interval === 'month' ? 'monthly' : interval === 'year' ? 'annual' : null;
}

function subscriptionOf(object: unknown): SubscriptionSnapshot | null {
  const parsed = SUBSCRIPTION.safeParse(object);
  if (!parsed.success) {
    throw new BillingEventError('a subscription event without a subscription Stripe sends');
  }
  const value = parsed.data;
  const item = value.items.data[0];
  const plan = planOf(item?.price.recurring?.interval);
  if (item === undefined || plan === null) {
    return null;
  }
  return {
    subscriptionRef: value.id,
    customerRef: value.customer,
    priceRef: item.price.id,
    plan,
    status: value.status,
    currentPeriodStart: at(item.current_period_start),
    currentPeriodEnd: at(item.current_period_end),
    cancelAtPeriodEnd: value.cancel_at_period_end,
    canceledAt: at(value.canceled_at),
  };
}

function invoiceOf(object: unknown, occurredAt: Date): InvoiceSnapshot | null {
  const parsed = INVOICE.safeParse(object);
  if (!parsed.success) {
    throw new BillingEventError('an invoice event without an invoice Stripe sends');
  }
  const value = parsed.data;
  if (value.customer === null || value.currency !== 'usd' || value.amount_remaining > value.amount_due) {
    return null;
  }
  const subscriptionRef = value.parent?.subscription_details?.subscription ?? null;
  const kind: InvoiceKind = subscriptionRef !== null ? 'subscription' : value.metadata?.[INVOICE_KIND_METADATA] === 'audit' ? 'audit' : 'other';
  const status = value.status ?? 'draft';
  const paidAt = at(value.status_transitions?.paid_at);
  const hosted = value.hosted_invoice_url;
  return {
    invoiceRef: value.id,
    customerRef: value.customer,
    subscriptionRef,
    kind,
    number: value.number,
    status,
    currency: 'usd',
    amountDueCents: centsOf(value.amount_due),
    amountPaidCents: centsOf(value.amount_paid),
    amountRemainingCents: centsOf(value.amount_remaining),
    periodStart: at(value.period_start),
    periodEnd: at(value.period_end),
    dueAt: at(value.due_date),
    // A paid invoice always has its time (Stripe sets it with the status; the event's own time otherwise).
    paidAt: status === 'paid' ? (paidAt ?? occurredAt) : null,
    attemptCount: value.attempt_count,
    hostedInvoiceUrl: typeof hosted === 'string' && HOSTED_INVOICE.test(hosted) ? hosted : null,
  };
}

/** Reads a verified Stripe event (parsed JSON, or the SDK's event object). */
export function readStripeEvent(event: unknown): BillingEvent {
  const parsed = EVENT.safeParse(event);
  if (!parsed.success) {
    throw new BillingEventError('not a Stripe event');
  }
  const { id: eventId, type, created, data } = parsed.data;
  const base = { eventId, type, occurredAt: new Date(created * 1000) };
  if (SUBSCRIPTION_EVENTS.has(type)) {
    const subscription = subscriptionOf(data.object);
    return subscription === null ? { ...base, kind: 'ignored' } : { ...base, kind: 'subscription', subscription };
  }
  if (INVOICE_EVENTS.has(type)) {
    const invoice = invoiceOf(data.object, base.occurredAt);
    return invoice === null ? { ...base, kind: 'ignored' } : { ...base, kind: 'invoice', invoice, paymentFailed: type === 'invoice.payment_failed' };
  }
  if (type === 'setup_intent.succeeded') {
    const intent = SETUP_INTENT.safeParse(data.object);
    if (!intent.success) {
      throw new BillingEventError('a setup intent event without its customer and payment method');
    }
    return { ...base, kind: 'payment_method', customerRef: intent.data.customer, paymentMethodRef: intent.data.payment_method };
  }
  return { ...base, kind: 'ignored' };
}
