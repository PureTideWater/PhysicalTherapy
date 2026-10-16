import { describe, expect, it } from 'vitest';

import { parseCatalog, planCatalog, requireConfirmedCatalog } from './catalog';
import { BillingEventError, readStripeEvent } from './events';
import { SIGNATURE_TOLERANCE_SECONDS, signPayload, verifySignature } from './signature';
import { WebhookSignatureError } from './types';

const created = 1_772_464_800; // 2026-03-02T15:20:00Z

function event(type: string, object: unknown, id = 'evt_test1') {
  return { id, object: 'event', type, created, livemode: false, data: { object } };
}

const subscription = {
  id: 'sub_test1',
  object: 'subscription',
  customer: 'cus_test1',
  status: 'active',
  cancel_at_period_end: false,
  canceled_at: null,
  items: { data: [{ current_period_start: created, current_period_end: created + 2_678_400, price: { id: 'price_test1', recurring: { interval: 'month' } } }] },
};

const invoice = {
  id: 'in_test1',
  object: 'invoice',
  customer: { id: 'cus_test1', object: 'customer' },
  number: 'ABCD-0001',
  status: 'paid',
  currency: 'usd',
  amount_due: 50000,
  amount_paid: 50000,
  amount_remaining: 0,
  period_start: created,
  period_end: created,
  due_date: null,
  attempt_count: 1,
  hosted_invoice_url: 'https://invoice.stripe.com/i/acct_test/test_abc?s=ap',
  metadata: {},
  status_transitions: { paid_at: created + 60 },
  parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test1' } },
};

describe('readStripeEvent', () => {
  it('reads a subscription event into its plan, status and period', () => {
    expect(readStripeEvent(event('customer.subscription.updated', subscription))).toEqual({
      eventId: 'evt_test1',
      type: 'customer.subscription.updated',
      occurredAt: new Date(created * 1000),
      kind: 'subscription',
      subscription: {
        subscriptionRef: 'sub_test1',
        customerRef: 'cus_test1',
        priceRef: 'price_test1',
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: new Date(created * 1000),
        currentPeriodEnd: new Date((created + 2_678_400) * 1000),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
    const annual = { ...subscription, canceled_at: created, items: { data: [{ price: { id: 'price_test2', recurring: { interval: 'year' } } }] } };
    expect(readStripeEvent(event('customer.subscription.deleted', annual))).toMatchObject({
      kind: 'subscription',
      subscription: { plan: 'annual', currentPeriodStart: null, currentPeriodEnd: null, canceledAt: new Date(created * 1000) },
    });
  });

  it('ignores a subscription billed at an interval the plans do not have', () => {
    const weekly = { ...subscription, items: { data: [{ price: { id: 'price_test3', recurring: { interval: 'week' } } }] } };
    expect(readStripeEvent(event('customer.subscription.created', weekly))).toMatchObject({ kind: 'ignored' });
    const oneOff = { ...subscription, items: { data: [{ price: { id: 'price_test3', recurring: null } }] } };
    expect(readStripeEvent(event('customer.subscription.created', oneOff))).toMatchObject({ kind: 'ignored' });
  });

  it('reads an invoice in integer cents, with its subscription, kind and payment time', () => {
    const read = readStripeEvent(event('invoice.paid', invoice));
    expect(read).toMatchObject({
      kind: 'invoice',
      paymentFailed: false,
      invoice: {
        invoiceRef: 'in_test1',
        customerRef: 'cus_test1',
        subscriptionRef: 'sub_test1',
        kind: 'subscription',
        number: 'ABCD-0001',
        status: 'paid',
        currency: 'usd',
        amountDueCents: 50000n,
        amountPaidCents: 50000n,
        amountRemainingCents: 0n,
        paidAt: new Date((created + 60) * 1000),
        attemptCount: 1,
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_test/test_abc?s=ap',
      },
    });
  });

  it('reads an audit invoice by its metadata, another one-off as other, and a failed payment as such', () => {
    const audit = { ...invoice, status: 'open', amount_paid: 0, amount_remaining: 50000, status_transitions: null, parent: null, metadata: { tp_kind: 'audit' }, hosted_invoice_url: 'http://elsewhere.example/x' };
    expect(readStripeEvent(event('invoice.payment_failed', audit))).toMatchObject({
      kind: 'invoice',
      paymentFailed: true,
      invoice: { kind: 'audit', subscriptionRef: null, status: 'open', paidAt: null, hostedInvoiceUrl: null },
    });
    expect(readStripeEvent(event('invoice.finalized', { ...audit, metadata: null, status: null }))).toMatchObject({ invoice: { kind: 'other', status: 'draft' } });
    // A paid invoice without its paid time takes the event's.
    expect(readStripeEvent(event('invoice.paid', { ...invoice, status_transitions: { paid_at: null } }))).toMatchObject({ invoice: { paidAt: new Date(created * 1000) } });
  });

  it('ignores an invoice in another currency, without a customer, or with more remaining than due', () => {
    expect(readStripeEvent(event('invoice.paid', { ...invoice, currency: 'eur' }))).toMatchObject({ kind: 'ignored' });
    expect(readStripeEvent(event('invoice.paid', { ...invoice, customer: null }))).toMatchObject({ kind: 'ignored' });
    expect(readStripeEvent(event('invoice.paid', { ...invoice, amount_remaining: 60000 }))).toMatchObject({ kind: 'ignored' });
  });

  it('refuses a fractional or negative amount rather than rounding it', () => {
    expect(() => readStripeEvent(event('invoice.paid', { ...invoice, amount_due: 1001 / 2 }))).toThrow(BillingEventError);
    expect(() => readStripeEvent(event('invoice.paid', { ...invoice, amount_paid: -1 }))).toThrow(BillingEventError);
    expect(() => readStripeEvent(event('customer.subscription.updated', { ...subscription, items: { data: [] } }))).toThrow(BillingEventError);
  });

  it('reads a confirmed setup intent as a payment method to put on file', () => {
    expect(readStripeEvent(event('setup_intent.succeeded', { id: 'seti_test1', customer: 'cus_test1', payment_method: { id: 'pm_test1' } }))).toMatchObject({
      kind: 'payment_method',
      customerRef: 'cus_test1',
      paymentMethodRef: 'pm_test1',
    });
    expect(() => readStripeEvent(event('setup_intent.succeeded', { id: 'seti_test1', customer: 'cus_test1', payment_method: null }))).toThrow(BillingEventError);
  });

  it('ignores every other type, and refuses what is not an event', () => {
    expect(readStripeEvent(event('customer.created', { id: 'cus_test1' }))).toEqual({ eventId: 'evt_test1', type: 'customer.created', occurredAt: new Date(created * 1000), kind: 'ignored' });
    expect(() => readStripeEvent({ id: 'nope', type: 'invoice.paid', created, data: {} })).toThrow(BillingEventError);
    expect(() => readStripeEvent(null)).toThrow(BillingEventError);
  });
});

describe('webhook signatures (Stripe’s scheme, for the local simulator)', () => {
  const secret = 'whsec_synthetic_test_secret';
  const payload = JSON.stringify(event('invoice.paid', invoice));
  const at = new Date('2026-03-02T15:30:00Z');

  it('verifies its own signature within the tolerance', () => {
    const header = signPayload(secret, payload, at);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(() => verifySignature(secret, payload, header, at)).not.toThrow();
    expect(() => verifySignature(secret, payload, header, new Date(at.getTime() + SIGNATURE_TOLERANCE_SECONDS * 1000))).not.toThrow();
    // Several v1 signatures (a rolled secret): one matching is enough.
    expect(() => verifySignature(secret, payload, `${header},v1=${'0'.repeat(64)}`, at)).not.toThrow();
  });

  it('refuses a changed payload, another secret, a stale or future timestamp, and a malformed header', () => {
    const header = signPayload(secret, payload, at);
    expect(() => verifySignature(secret, `${payload} `, header, at)).toThrow(WebhookSignatureError);
    expect(() => verifySignature('whsec_other', payload, header, at)).toThrow(WebhookSignatureError);
    expect(() => verifySignature(secret, payload, header, new Date(at.getTime() + (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000))).toThrow(WebhookSignatureError);
    expect(() => verifySignature(secret, payload, header, new Date(at.getTime() - (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000))).toThrow(WebhookSignatureError);
    expect(() => verifySignature(secret, payload, null, at)).toThrow(WebhookSignatureError);
    expect(() => verifySignature(secret, payload, 'v1=abc', at)).toThrow(WebhookSignatureError);
    expect(() => verifySignature(secret, payload, `t=${String(Math.floor(at.getTime() / 1000))}`, at)).toThrow(WebhookSignatureError);
    expect(() => verifySignature(secret, payload, 'x'.repeat(2000), at)).toThrow(WebhookSignatureError);
  });
});

describe('the plan catalog', () => {
  it('ships synthetic, unconfirmed amounts for the monthly and annual plans and the audit', () => {
    const catalog = planCatalog();
    expect(catalog.confirmed).toBe(false);
    expect(catalog.plans.monthly).toMatchObject({ lookupKey: 'tp_monitoring_monthly', interval: 'month' });
    expect(catalog.plans.annual).toMatchObject({ lookupKey: 'tp_monitoring_annual', interval: 'year' });
    expect(typeof catalog.audit.amountCents).toBe('bigint');
    expect(() => requireConfirmedCatalog(catalog)).toThrow(/not confirmed/);
    expect(() => requireConfirmedCatalog({ ...catalog, confirmed: true })).not.toThrow();
  });

  it('refuses a catalog with an amount that is not whole cents', () => {
    const file = {
      format: 'tp-billing-plans/1',
      currency: 'usd',
      confirmed: true,
      source: 'test',
      plans: { monthly: { lookup_key: 'a', name: 'A', interval: 'month', amount_cents: '100' }, annual: { lookup_key: 'b', name: 'B', interval: 'year', amount_cents: '1000' } },
      audit: { lookup_key: 'c', name: 'C', amount_cents: '10.50' },
    };
    expect(() => parseCatalog(file)).toThrow(/audit\.amount_cents/);
    expect(parseCatalog({ ...file, audit: { ...file.audit, amount_cents: '1050' } }).audit.amountCents).toBe(1050n);
  });
});
