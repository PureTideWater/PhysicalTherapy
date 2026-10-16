import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DirectorySimulatorStore, LocalBillingProvider, MemorySimulatorStore, SIMULATOR_TEST_ROUTING } from './local';
import { type BillingEvent, BillingProviderError, WebhookSignatureError } from './types';

/**
 * The local Stripe test-mode simulator: the flows dev, the tests and the e2e suite rely on, read back
 * through the webhook verification and the event reader exactly as the webhook route reads them.
 */

const secret = 'whsec_synthetic_simulator';
const GOOD_ACH = { kind: 'us_bank_account' as const, routingNumber: SIMULATOR_TEST_ROUTING, accountNumber: '000123456789' };
const FAILING_ACH = { kind: 'us_bank_account' as const, routingNumber: SIMULATOR_TEST_ROUTING, accountNumber: '000111111116' };
const GOOD_CARD = { kind: 'card' as const, number: '4242424242424242' };
const DECLINED_CARD = { kind: 'card' as const, number: '4000000000000341' };

/** A simulator whose events land, verified and read, in `events`, with a payment method put on file as the webhook processing would. */
function simulator(options: { readonly store?: ConstructorParameters<typeof LocalBillingProvider>[0]['store']; readonly now?: () => Date } = {}) {
  const events: BillingEvent[] = [];
  const billing: LocalBillingProvider = new LocalBillingProvider({
    webhookSecret: secret,
    ...options,
    deliver: async (payload, signature) => {
      const event = billing.readWebhook(payload, signature);
      events.push(event);
      if (event.kind === 'payment_method') {
        await billing.setDefaultPaymentMethod({ customerRef: event.customerRef, paymentMethodRef: event.paymentMethodRef, idempotencyKey: event.eventId });
      }
    },
  });
  return { billing, events };
}

async function customerWith(billing: LocalBillingProvider, details: Parameters<LocalBillingProvider['confirmSetupIntent']>[0]['details'], key = 'org-1') {
  const customer = await billing.createCustomer({ organizationId: key, name: 'Synthetic Group', idempotencyKey: `customer:${key}` });
  const intent = await billing.createSetupIntent({ customerRef: customer, idempotencyKey: `setup:${key}` });
  await billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details, idempotencyKey: `confirm:${key}` });
  return customer;
}

const types = (events: readonly BillingEvent[]) => events.map((event) => event.type);

describe('LocalBillingProvider (the Stripe test-mode simulator)', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('completes a test ACH payment: processing until it settles, then the invoice is paid and the subscription active', async () => {
    const { billing, events } = simulator();
    expect(billing.kind).toBe('local');
    expect(billing.publishableKey).toBeNull();
    const customer = await customerWith(billing, GOOD_ACH);
    expect(await billing.paymentMethodOnFile(customer)).toMatchObject({ kind: 'us_bank_account', last4: '6789' });
    const subscription = await billing.createSubscription({ customerRef: customer, organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:1' });
    expect(subscription).toMatch(/^sub_sim/);
    expect(types(events)).toEqual(['setup_intent.succeeded', 'customer.subscription.created', 'invoice.created', 'invoice.finalized']);
    const finalized = events[3];
    expect(finalized).toMatchObject({ kind: 'invoice', invoice: { status: 'open', kind: 'subscription', subscriptionRef: subscription, amountDueCents: 50000n, amountPaidCents: 0n } });
    // The debit is in flight: nothing more until it settles.
    expect(await billing.settle()).toBe(1);
    expect(types(events).slice(4)).toEqual(['invoice.paid', 'invoice.payment_succeeded', 'customer.subscription.updated']);
    expect(events[4]).toMatchObject({ kind: 'invoice', paymentFailed: false, invoice: { status: 'paid', amountPaidCents: 50000n, amountRemainingCents: 0n } });
    expect(events[6]).toMatchObject({ kind: 'subscription', subscription: { status: 'active', plan: 'monthly' } });
    const invoiceRef = finalized?.kind === 'invoice' ? finalized.invoice.invoiceRef : '';
    expect(await billing.invoicePayment(invoiceRef)).toEqual({ methodKind: 'us_bank_account', failureCode: null });
    expect(await billing.settle()).toBe(0);
  });

  it('fails a test ACH debit with its return code, retries on the schedule, and pays once a good method is on file', async () => {
    const { billing, events } = simulator();
    const customer = await customerWith(billing, FAILING_ACH);
    await billing.createSubscription({ customerRef: customer, organizationId: 'org-1', plan: 'annual', idempotencyKey: 'subscribe:1' });
    await billing.settle();
    const failed = events.find((event) => event.type === 'invoice.payment_failed');
    expect(failed).toMatchObject({ kind: 'invoice', paymentFailed: true, invoice: { status: 'open', amountDueCents: 540000n, attemptCount: 1 } });
    const invoiceRef = failed?.kind === 'invoice' ? failed.invoice.invoiceRef : '';
    expect(await billing.invoicePayment(invoiceRef)).toEqual({ methodKind: 'us_bank_account', failureCode: 'account_closed' });
    expect(events.at(-1)).toMatchObject({ kind: 'subscription', subscription: { status: 'past_due' } });
    // Day 3: the retry debits the same failing account, which fails when it settles four days later.
    await billing.advance(3);
    await billing.advance(4);
    expect(events.filter((event) => event.type === 'invoice.payment_failed')).toHaveLength(2);
    // The day-7 retry debits the failing account again (it fails on day 11); a good card goes on file and the
    // day-14 retry, the fourth attempt, charges it at once.
    const intent = await billing.createSetupIntent({ customerRef: customer, idempotencyKey: 'setup:card' });
    await billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: GOOD_CARD, idempotencyKey: 'confirm:card' });
    await billing.advance(7);
    expect(events.filter((event) => event.type === 'invoice.payment_failed')).toHaveLength(3);
    expect(events.at(-2)).toMatchObject({ type: 'invoice.payment_succeeded', invoice: { status: 'paid', attemptCount: 4 } });
    expect(events.at(-1)).toMatchObject({ kind: 'subscription', subscription: { status: 'active' } });
    expect(await billing.invoicePayment(invoiceRef)).toEqual({ methodKind: 'card', failureCode: null });
  });

  it('marks the subscription unpaid after the last retry fails, and pays on demand', async () => {
    const { billing, events } = simulator();
    const customer = await customerWith(billing, DECLINED_CARD);
    await billing.createSubscription({ customerRef: customer, organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:1' });
    await billing.advance(14);
    expect(events.filter((event) => event.type === 'invoice.payment_failed')).toHaveLength(4);
    expect(events.at(-1)).toMatchObject({ kind: 'subscription', subscription: { status: 'unpaid' } });
    const open = events.find((event) => event.kind === 'invoice');
    const invoiceRef = open?.kind === 'invoice' ? open.invoice.invoiceRef : '';
    // Paid on demand with the declined card still on file: refused with its code, as Stripe's invoices.pay
    // is, the failure recorded all the same, and the same refusal for the same key.
    const failures = events.filter((event) => event.type === 'invoice.payment_failed').length;
    await expect(billing.payInvoice({ invoiceRef, idempotencyKey: 'pay:declined' })).rejects.toMatchObject({ code: 'card_declined' });
    await expect(billing.payInvoice({ invoiceRef, idempotencyKey: 'pay:declined' })).rejects.toMatchObject({ code: 'card_declined' });
    expect(events.filter((event) => event.type === 'invoice.payment_failed')).toHaveLength(failures + 1);
    const intent = await billing.createSetupIntent({ customerRef: customer, idempotencyKey: 'setup:2' });
    await billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: GOOD_CARD, idempotencyKey: 'confirm:2' });
    await billing.payInvoice({ invoiceRef, idempotencyKey: 'pay:1' });
    expect(events.find((event) => event.type === 'invoice.paid')).toMatchObject({ invoice: { invoiceRef, status: 'paid' } });
    await expect(billing.payInvoice({ invoiceRef, idempotencyKey: 'pay:2' })).rejects.toMatchObject({ code: 'invoice_not_open' });
    await expect(billing.payInvoice({ invoiceRef: 'in_missing', idempotencyKey: 'pay:3' })).rejects.toMatchObject({ code: 'resource_missing' });
  });

  it('renews a subscription at the end of its period, and ends one canceled at period end', async () => {
    const { billing, events } = simulator();
    const customer = await customerWith(billing, GOOD_CARD);
    const subscription = await billing.createSubscription({ customerRef: customer, organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:1' });
    expect(events.filter((event) => event.type === 'invoice.paid')).toHaveLength(1);
    await billing.advance(31);
    expect(events.filter((event) => event.type === 'invoice.paid')).toHaveLength(2);
    await billing.cancelSubscription({ subscriptionRef: subscription, idempotencyKey: 'cancel:1' });
    await billing.cancelSubscription({ subscriptionRef: subscription, idempotencyKey: 'cancel:2' });
    expect(events.filter((event) => event.kind === 'subscription' && event.subscription.cancelAtPeriodEnd)).toHaveLength(1);
    await billing.advance(31);
    expect(events.at(-1)).toMatchObject({ type: 'customer.subscription.deleted', subscription: { status: 'canceled' } });
    expect(events.filter((event) => event.type === 'invoice.paid')).toHaveLength(2);
    await billing.advance(31);
    expect(events.at(-1)?.type).toBe('customer.subscription.deleted');
    await expect(billing.cancelSubscription({ subscriptionRef: 'sub_missing', idempotencyKey: 'cancel:3' })).rejects.toThrow(BillingProviderError);
    await expect(billing.advance(0)).rejects.toMatchObject({ code: 'invalid_days' });
    expect((await billing.simulatedNow()).getTime()).toBeGreaterThan(Date.now() + 90 * 86_400_000);
  });

  it('issues an audit invoice charged to the method on file, and fails one with none on file', async () => {
    const { billing, events } = simulator();
    const customer = await customerWith(billing, GOOD_CARD);
    const invoice = await billing.createAuditInvoice({ customerRef: customer, organizationId: 'org-1', idempotencyKey: 'audit:1' });
    expect(events.find((event) => event.type === 'invoice.paid')).toMatchObject({ invoice: { invoiceRef: invoice, kind: 'audit', subscriptionRef: null, amountPaidCents: 250000n } });
    const bare = await billing.createCustomer({ organizationId: 'org-2', name: 'Another Synthetic Group', idempotencyKey: 'customer:org-2' });
    const unpaid = await billing.createAuditInvoice({ customerRef: bare, organizationId: 'org-2', idempotencyKey: 'audit:2' });
    expect(events.at(-1)).toMatchObject({ type: 'invoice.payment_failed', invoice: { invoiceRef: unpaid, kind: 'audit' } });
    expect(await billing.invoicePayment(unpaid)).toEqual({ methodKind: null, failureCode: 'no_payment_method' });
    expect(await billing.invoicePayment('in_missing')).toEqual({ methodKind: null, failureCode: null });
    await expect(billing.createSubscription({ customerRef: bare, organizationId: 'org-2', plan: 'monthly', idempotencyKey: 'subscribe:2' })).rejects.toMatchObject({ code: 'no_payment_method' });
  });

  it('honors idempotency keys: a repeated call returns the first result and sends nothing again', async () => {
    const { billing, events } = simulator();
    const first = await billing.createCustomer({ organizationId: 'org-1', name: 'Synthetic Group', idempotencyKey: 'customer:org-1' });
    expect(await billing.createCustomer({ organizationId: 'org-1', name: 'Synthetic Group', idempotencyKey: 'customer:org-1' })).toBe(first);
    const intent = await billing.createSetupIntent({ customerRef: first, idempotencyKey: 'setup:1' });
    expect(await billing.createSetupIntent({ customerRef: first, idempotencyKey: 'setup:1' })).toEqual(intent);
    const method = await billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: GOOD_CARD, idempotencyKey: 'confirm:1' });
    expect(await billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: GOOD_CARD, idempotencyKey: 'confirm:again' })).toBe(method);
    const subscription = await billing.createSubscription({ customerRef: first, organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:1' });
    const count = events.length;
    expect(await billing.createSubscription({ customerRef: first, organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:1' })).toBe(subscription);
    expect(events).toHaveLength(count);
  });

  it('accepts only its own test accounts and cards, and only a method that is the customer’s', async () => {
    const { billing } = simulator();
    const customer = await billing.createCustomer({ organizationId: 'org-1', name: 'Synthetic Group', idempotencyKey: 'customer:org-1' });
    const intent = await billing.createSetupIntent({ customerRef: customer, idempotencyKey: 'setup:1' });
    await expect(billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: { ...GOOD_ACH, accountNumber: '123456789012' }, idempotencyKey: 'c1' })).rejects.toMatchObject({
      code: 'invalid_test_payment_method',
    });
    await expect(billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: { ...GOOD_ACH, routingNumber: '021000021' }, idempotencyKey: 'c2' })).rejects.toThrow(BillingProviderError);
    await expect(billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: { kind: 'card', number: '5555555555554444' }, idempotencyKey: 'c3' })).rejects.toThrow(BillingProviderError);
    await expect(billing.confirmSetupIntent({ setupIntentRef: 'seti_missing', details: GOOD_CARD, idempotencyKey: 'c4' })).rejects.toMatchObject({ code: 'resource_missing' });
    await expect(billing.createSetupIntent({ customerRef: 'cus_missing', idempotencyKey: 'setup:2' })).rejects.toMatchObject({ code: 'resource_missing' });
    await expect(billing.setDefaultPaymentMethod({ customerRef: customer, paymentMethodRef: 'pm_missing', idempotencyKey: 'd1' })).rejects.toMatchObject({ code: 'resource_missing' });
    expect(await billing.paymentMethodOnFile(customer)).toBeNull();
    expect(await billing.paymentMethodOnFile('cus_missing')).toBeNull();
  });

  it('signs its events as Stripe does, so a tampered or stale one is refused', async () => {
    const billing = new LocalBillingProvider({ webhookSecret: secret });
    await customerWith(billing, GOOD_CARD);
    const [event] = await billing.pendingEvents();
    expect(event).toBeDefined();
    const { payload, signature } = event as { payload: string; signature: string };
    expect(billing.readWebhook(payload, signature)).toMatchObject({ kind: 'payment_method' });
    expect(() => billing.readWebhook(payload.replace('succeeded', 'canceled'), signature)).toThrow(WebhookSignatureError);
    const later = new LocalBillingProvider({ webhookSecret: secret, now: () => new Date(Date.now() + 3_600_000) });
    expect(() => later.readWebhook(payload, signature)).toThrow(WebhookSignatureError);
    expect(await billing.flush()).toBe(0);
  });

  it('keeps an event whose delivery failed, and delivers it next time', async () => {
    let fail = true;
    const delivered: string[] = [];
    const store = new MemorySimulatorStore();
    const billing = new LocalBillingProvider({
      webhookSecret: secret,
      store,
      deliver: (payload) => {
        if (fail) {
          return Promise.reject(new Error('the webhook route is down'));
        }
        delivered.push(payload);
        return Promise.resolve();
      },
    });
    const customer = await billing.createCustomer({ organizationId: 'org-1', name: 'Synthetic Group', idempotencyKey: 'customer:org-1' });
    const intent = await billing.createSetupIntent({ customerRef: customer, idempotencyKey: 'setup:1' });
    await expect(billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: GOOD_CARD, idempotencyKey: 'confirm:1' })).rejects.toThrow('the webhook route is down');
    expect(await billing.pendingEvents()).toHaveLength(1);
    fail = false;
    expect(await billing.flush()).toBe(1);
    expect(delivered).toHaveLength(1);
    expect(await billing.pendingEvents()).toHaveLength(0);
  });

  it('shares its state through a directory between providers (the web app’s processes and the e2e suite)', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'tp-billing-sim-'));
    directories.push(directory);
    const first = simulator({ store: new DirectorySimulatorStore(directory) });
    const customer = await customerWith(first.billing, GOOD_ACH);
    await first.billing.createSubscription({ customerRef: customer, organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:1' });
    const second = simulator({ store: new DirectorySimulatorStore(directory) });
    expect(await second.billing.paymentMethodOnFile(customer)).toMatchObject({ kind: 'us_bank_account' });
    expect(await second.billing.settle()).toBe(1);
    expect(types(second.events)).toEqual(['invoice.paid', 'invoice.payment_succeeded', 'customer.subscription.updated']);
    // Concurrent changes do not lose each other's.
    await Promise.all([1, 2, 3, 4, 5].map((n) => second.billing.createCustomer({ organizationId: `org-${String(n + 10)}`, name: 'Concurrent', idempotencyKey: `customer:c${String(n)}` })));
    const third = simulator({ store: new DirectorySimulatorStore(directory) });
    const again = await Promise.all([1, 2, 3, 4, 5].map((n) => third.billing.createCustomer({ organizationId: `org-${String(n + 10)}`, name: 'Concurrent', idempotencyKey: `customer:c${String(n)}` })));
    expect(new Set(again).size).toBe(5);
  });
});
