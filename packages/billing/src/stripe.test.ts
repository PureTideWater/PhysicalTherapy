import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { parseCatalog } from './catalog';
import { BillingEventError } from './events';
import { PAYMENT_METHOD_ORDER } from './types';
import { type StripeApi, StripeBillingProvider, stripeClient } from './stripe';
import { BillingProviderError, WebhookSignatureError } from './types';

/**
 * The Stripe implementation against a mocked client (no network: the build has no Stripe keys): what each
 * call sends, with its idempotency key, and how webhooks are verified by the SDK itself.
 */

const catalog = parseCatalog({
  format: 'tp-billing-plans/1',
  currency: 'usd',
  confirmed: true,
  source: 'test',
  plans: {
    monthly: { lookup_key: 'tp_monitoring_monthly', name: 'Monitoring, monthly', interval: 'month', amount_cents: '50000' },
    annual: { lookup_key: 'tp_monitoring_annual', name: 'Monitoring, annual', interval: 'year', amount_cents: '540000' },
  },
  audit: { lookup_key: 'tp_audit', name: 'Audit', amount_cents: '250000' },
});

const secret = 'whsec_synthetic_test_secret';
const realWebhooks = new Stripe('sk_test_synthetic_not_a_key').webhooks;

function mockClient() {
  const client = {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test1' }),
      update: vi.fn().mockResolvedValue({ id: 'cus_test1' }),
      retrieve: vi.fn(),
    },
    prices: {
      list: vi.fn().mockResolvedValue({ data: [{ id: 'price_monthly', lookup_key: 'tp_monitoring_monthly', unit_amount: 50000 }, { id: 'price_old_annual', lookup_key: 'tp_monitoring_annual', unit_amount: 1 }] }),
      create: vi.fn().mockImplementation((params: { lookup_key: string }) => Promise.resolve({ id: `price_new_${params.lookup_key}` })),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({ id: 'sub_test1' }),
      update: vi.fn().mockResolvedValue({ id: 'sub_test1' }),
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    },
    invoices: {
      create: vi.fn().mockResolvedValue({ id: 'in_test1' }),
      finalizeInvoice: vi.fn().mockResolvedValue({ id: 'in_test1' }),
      pay: vi.fn().mockResolvedValue({ id: 'in_test1' }),
    },
    invoiceItems: { create: vi.fn().mockResolvedValue({ id: 'ii_test1' }) },
    invoicePayments: { list: vi.fn() },
    setupIntents: { create: vi.fn().mockResolvedValue({ id: 'seti_test1', client_secret: 'seti_test1_secret_abc' }) },
    paymentMethods: { retrieve: vi.fn() },
    webhooks: realWebhooks,
  };
  return client;
}

function provider(client = mockClient()) {
  return { client, billing: new StripeBillingProvider({ client: client as unknown as StripeApi, webhookSecret: secret, publishableKey: 'pk_test_synthetic', catalog }) };
}

describe('StripeBillingProvider', () => {
  it('creates a customer with the organization’s name and opaque ID only, under the idempotency key', async () => {
    const { client, billing } = provider();
    expect(billing.kind).toBe('stripe');
    expect(billing.publishableKey).toBe('pk_test_synthetic');
    expect(await billing.createCustomer({ organizationId: 'org-1', name: 'Synthetic Group', idempotencyKey: 'customer:org-1' })).toBe('cus_test1');
    expect(client.customers.create).toHaveBeenCalledWith({ name: 'Synthetic Group', metadata: { tp_organization_id: 'org-1' } }, { idempotencyKey: 'customer:org-1' });
  });

  it('collects ACH or card through a SetupIntent, and sets the confirmed method as the default', async () => {
    const { client, billing } = provider();
    expect(await billing.createSetupIntent({ customerRef: 'cus_test1', idempotencyKey: 'setup:1' })).toEqual({ setupIntentRef: 'seti_test1', clientSecret: 'seti_test1_secret_abc' });
    expect(client.setupIntents.create).toHaveBeenCalledWith(
      { customer: 'cus_test1', allowed_payment_method_types: ['us_bank_account', 'card'], usage: 'off_session', payment_method_options: { us_bank_account: { verification_method: 'automatic' } } },
      { idempotencyKey: 'setup:1' },
    );
    client.setupIntents.create.mockResolvedValueOnce({ id: 'seti_test2', client_secret: null });
    await expect(billing.createSetupIntent({ customerRef: 'cus_test1', idempotencyKey: 'setup:2' })).rejects.toThrow(BillingProviderError);
    await billing.setDefaultPaymentMethod({ customerRef: 'cus_test1', paymentMethodRef: 'pm_test1', idempotencyKey: 'evt_1' });
    expect(client.customers.update).toHaveBeenCalledWith('cus_test1', { invoice_settings: { default_payment_method: 'pm_test1' } }, { idempotencyKey: 'evt_1' });
    expect(client.subscriptions.update).not.toHaveBeenCalled();
  });

  it('asks Stripe for the bank account first, then the card, from the shared order (BIL-02)', async () => {
    const { client, billing } = provider();
    await billing.createSetupIntent({ customerRef: 'cus_test1', idempotencyKey: 'setup:1' });
    await billing.createSubscription({ customerRef: 'cus_test1', organizationId: 'org-1', plan: 'annual', idempotencyKey: 'subscribe:1' });
    await billing.createAuditInvoice({ customerRef: 'cus_test1', organizationId: 'org-1', idempotencyKey: 'audit:1' });
    const sent = [
      (client.setupIntents.create.mock.calls[0]?.[0] as { allowed_payment_method_types: string[] }).allowed_payment_method_types,
      (client.subscriptions.create.mock.calls[0]?.[0] as { payment_settings: { payment_method_types: string[] } }).payment_settings.payment_method_types,
      (client.invoices.create.mock.calls[0]?.[0] as { payment_settings: { payment_method_types: string[] } }).payment_settings.payment_method_types,
    ];
    for (const types of sent) {
      expect(types).toEqual(['us_bank_account', 'card']);
      // A fresh copy each time, so nothing Stripe's SDK does to a request can reorder the shared constant.
      expect(types).not.toBe(PAYMENT_METHOD_ORDER);
    }
    expect(PAYMENT_METHOD_ORDER).toEqual(['us_bank_account', 'card']);
  });

  it('lets the customer’s default pay every invoice: a new default clears a live subscription’s own (BIL-02)', async () => {
    const { client, billing } = provider();
    client.subscriptions.list
      .mockResolvedValueOnce({
        data: [
          { id: 'sub_card', status: 'active', default_payment_method: 'pm_card' },
          { id: 'sub_plain', status: 'active', default_payment_method: null },
          { id: 'sub_overdue', status: 'past_due', default_payment_method: { id: 'pm_card2' } },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          { id: 'sub_old', status: 'canceled', default_payment_method: 'pm_card' },
          { id: 'sub_expired', status: 'incomplete_expired', default_payment_method: 'pm_card' },
          { id: 'sub_trial', status: 'trialing', default_payment_method: 'pm_card' },
        ],
        has_more: false,
      });
    await billing.setDefaultPaymentMethod({ customerRef: 'cus_test1', paymentMethodRef: 'pm_ach', idempotencyKey: 'evt_2' });
    expect(client.customers.update).toHaveBeenCalledWith('cus_test1', { invoice_settings: { default_payment_method: 'pm_ach' } }, { idempotencyKey: 'evt_2' });
    expect(client.subscriptions.list.mock.calls).toEqual([[{ customer: 'cus_test1', limit: 100 }], [{ customer: 'cus_test1', limit: 100, starting_after: 'sub_overdue' }]]);
    expect(client.subscriptions.update.mock.calls).toEqual([
      ['sub_card', { default_payment_method: '' }, { idempotencyKey: 'evt_2:subscription:sub_card' }],
      ['sub_overdue', { default_payment_method: '' }, { idempotencyKey: 'evt_2:subscription:sub_overdue' }],
      ['sub_trial', { default_payment_method: '' }, { idempotencyKey: 'evt_2:subscription:sub_trial' }],
    ]);
    // A page that says there is more yet carries nothing ends the walk instead of asking again.
    client.subscriptions.list.mockResolvedValueOnce({ data: [], has_more: true });
    await billing.setDefaultPaymentMethod({ customerRef: 'cus_test1', paymentMethodRef: 'pm_ach', idempotencyKey: 'evt_3' });
    expect(client.subscriptions.list).toHaveBeenCalledTimes(3);
    client.subscriptions.list.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'api_connection_error' }));
    await expect(billing.setDefaultPaymentMethod({ customerRef: 'cus_test1', paymentMethodRef: 'pm_ach', idempotencyKey: 'evt_4' })).rejects.toThrow(
      new BillingProviderError('api_connection_error', 'Stripe refused to read the customer’s subscriptions'),
    );
  });

  it('describes the payment method on file: ACH, card, by ID, none or a deleted customer', async () => {
    const { client, billing } = provider();
    client.customers.retrieve.mockResolvedValueOnce({ invoice_settings: { default_payment_method: { id: 'pm_ach', type: 'us_bank_account', us_bank_account: { last4: '6789', bank_name: 'Test Bank' } } } });
    expect(await billing.paymentMethodOnFile('cus_test1')).toEqual({ paymentMethodRef: 'pm_ach', kind: 'us_bank_account', last4: '6789', label: 'Test Bank' });
    expect(client.customers.retrieve).toHaveBeenCalledWith('cus_test1', { expand: ['invoice_settings.default_payment_method'] });
    client.customers.retrieve.mockResolvedValueOnce({ invoice_settings: { default_payment_method: 'pm_card' } });
    client.paymentMethods.retrieve.mockResolvedValueOnce({ id: 'pm_card', type: 'card', card: { last4: '4242', brand: 'visa' } });
    expect(await billing.paymentMethodOnFile('cus_test1')).toEqual({ paymentMethodRef: 'pm_card', kind: 'card', last4: '4242', label: 'visa' });
    client.customers.retrieve.mockResolvedValueOnce({ invoice_settings: { default_payment_method: { id: 'pm_x', type: 'sepa_debit' } } });
    expect(await billing.paymentMethodOnFile('cus_test1')).toBeNull();
    client.customers.retrieve.mockResolvedValueOnce({ invoice_settings: { default_payment_method: { id: 'pm_y', type: 'us_bank_account', us_bank_account: { last4: null, bank_name: null } } } });
    expect(await billing.paymentMethodOnFile('cus_test1')).toEqual({ paymentMethodRef: 'pm_y', kind: 'us_bank_account', last4: '', label: null });
    client.customers.retrieve.mockResolvedValueOnce({ invoice_settings: { default_payment_method: null } });
    expect(await billing.paymentMethodOnFile('cus_test1')).toBeNull();
    client.customers.retrieve.mockResolvedValueOnce({ id: 'cus_test1', deleted: true });
    expect(await billing.paymentMethodOnFile('cus_test1')).toBeNull();
  });

  it('finds the plan prices by lookup key, creates a missing or repriced one once, and subscribes at it', async () => {
    const { client, billing } = provider();
    expect(await billing.createSubscription({ customerRef: 'cus_test1', organizationId: 'org-1', plan: 'annual', idempotencyKey: 'subscribe:1' })).toBe('sub_test1');
    expect(client.prices.list).toHaveBeenCalledWith({ lookup_keys: ['tp_monitoring_monthly', 'tp_monitoring_annual', 'tp_audit'], active: true, limit: 10 });
    // The annual price on file is at another amount and the audit has none: both are created, the monthly found.
    expect(client.prices.create).toHaveBeenCalledTimes(2);
    const [annualParams, annualOptions] = client.prices.create.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(annualParams).toMatchObject({ currency: 'usd', lookup_key: 'tp_monitoring_annual', transfer_lookup_key: true, product_data: { name: 'Monitoring, annual' }, recurring: { interval: 'year' } });
    expect(String(annualParams.unit_amount_decimal)).toBe('540000');
    expect(annualParams).not.toHaveProperty('unit_amount');
    expect(annualOptions).toEqual({ idempotencyKey: 'price:tp_monitoring_annual:540000' });
    expect(client.prices.create.mock.calls[1]?.[0]).not.toHaveProperty('recurring');
    expect(client.subscriptions.create).toHaveBeenCalledWith(
      {
        customer: 'cus_test1',
        items: [{ price: 'price_new_tp_monitoring_annual' }],
        collection_method: 'charge_automatically',
        payment_settings: { payment_method_types: ['us_bank_account', 'card'], save_default_payment_method: 'off' },
        metadata: { tp_organization_id: 'org-1' },
      },
      { idempotencyKey: 'subscribe:1' },
    );
    // The catalog is read once per process.
    await billing.createSubscription({ customerRef: 'cus_test1', organizationId: 'org-1', plan: 'monthly', idempotencyKey: 'subscribe:2' });
    expect(client.prices.list).toHaveBeenCalledTimes(1);
    expect(client.subscriptions.create.mock.calls[1]?.[0]).toMatchObject({ items: [{ price: 'price_monthly' }] });
  });

  it('reads the catalog again after a failure', async () => {
    const { client, billing } = provider();
    client.prices.list.mockRejectedValueOnce(Object.assign(new Error('network'), { code: 'api_connection_error' }));
    await expect(billing.ensureCatalog()).rejects.toMatchObject({ name: 'BillingProviderError', code: 'api_connection_error' });
    await expect(billing.ensureCatalog()).resolves.toMatchObject({ monthly: 'price_monthly' });
  });

  it('cancels at period end and retries an invoice under idempotency keys', async () => {
    const { client, billing } = provider();
    await billing.cancelSubscription({ subscriptionRef: 'sub_test1', idempotencyKey: 'cancel:1' });
    expect(client.subscriptions.update).toHaveBeenCalledWith('sub_test1', { cancel_at_period_end: true }, { idempotencyKey: 'cancel:1' });
    await billing.payInvoice({ invoiceRef: 'in_test1', idempotencyKey: 'pay:1' });
    expect(client.invoices.pay).toHaveBeenCalledWith('in_test1', {}, { idempotencyKey: 'pay:1' });
  });

  it('issues an audit invoice: created, its item added, finalized, each step under its own key', async () => {
    const { client, billing } = provider();
    expect(await billing.createAuditInvoice({ customerRef: 'cus_test1', organizationId: 'org-1', idempotencyKey: 'audit:1' })).toBe('in_test1');
    expect(client.invoices.create).toHaveBeenCalledWith(
      {
        customer: 'cus_test1',
        collection_method: 'charge_automatically',
        auto_advance: true,
        pending_invoice_items_behavior: 'exclude',
        payment_settings: { payment_method_types: ['us_bank_account', 'card'] },
        metadata: { tp_organization_id: 'org-1', tp_kind: 'audit' },
      },
      { idempotencyKey: 'audit:1:invoice' },
    );
    expect(client.invoiceItems.create).toHaveBeenCalledWith({ customer: 'cus_test1', invoice: 'in_test1', pricing: { price: 'price_new_tp_audit' } }, { idempotencyKey: 'audit:1:item' });
    expect(client.invoices.finalizeInvoice).toHaveBeenCalledWith('in_test1', { auto_advance: true }, { idempotencyKey: 'audit:1:finalize' });
  });

  it('reads how an invoice’s latest payment went', async () => {
    const { client, billing } = provider();
    client.invoicePayments.list.mockResolvedValueOnce({
      data: [
        { created: 1, payment: { payment_intent: { payment_method: { type: 'card' }, payment_method_types: ['card'], last_payment_error: null } } },
        { created: 2, payment: { payment_intent: { payment_method: { type: 'us_bank_account' }, payment_method_types: ['us_bank_account'], last_payment_error: { code: 'payment_method_provider_decline', decline_code: 'insufficient_funds' } } } },
      ],
    });
    expect(await billing.invoicePayment('in_test1')).toEqual({ methodKind: 'us_bank_account', failureCode: 'insufficient_funds' });
    expect(client.invoicePayments.list).toHaveBeenCalledWith({ invoice: 'in_test1', limit: 10, expand: ['data.payment.payment_intent.payment_method'] });
    client.invoicePayments.list.mockResolvedValueOnce({ data: [{ created: 1, payment: { payment_intent: { payment_method: 'pm_1', payment_method_types: ['card'], last_payment_error: { code: 'Not A Code' } } } }] });
    expect(await billing.invoicePayment('in_test1')).toEqual({ methodKind: 'card', failureCode: null });
    client.invoicePayments.list.mockResolvedValueOnce({ data: [{ created: 1, payment: { payment_intent: { payment_method: null, payment_method_types: [], last_payment_error: { type: 'card_error' } } } }] });
    expect(await billing.invoicePayment('in_test1')).toEqual({ methodKind: null, failureCode: null });
    client.invoicePayments.list.mockResolvedValueOnce({ data: [{ created: 1, payment: { payment_intent: 'pi_unexpanded' } }] });
    expect(await billing.invoicePayment('in_test1')).toEqual({ methodKind: null, failureCode: null });
    client.invoicePayments.list.mockResolvedValueOnce({ data: [] });
    expect(await billing.invoicePayment('in_test1')).toEqual({ methodKind: null, failureCode: null });
  });

  it('reports a refusal by Stripe’s code, never its message', async () => {
    const { client, billing } = provider();
    client.customers.create.mockRejectedValueOnce(Object.assign(new Error('No such customer: cus_secret'), { code: 'resource_missing' }));
    const refused = billing.createCustomer({ organizationId: 'org-1', name: 'Synthetic Group', idempotencyKey: 'customer:org-1' });
    await expect(refused).rejects.toThrow(new BillingProviderError('resource_missing', 'Stripe refused to create the customer'));
    client.invoices.pay.mockRejectedValueOnce('not an error object');
    await expect(billing.payInvoice({ invoiceRef: 'in_test1', idempotencyKey: 'pay:2' })).rejects.toMatchObject({ code: 'stripe_error' });
  });

  it('verifies webhooks with the SDK before reading them', () => {
    const { billing } = provider();
    const payload = JSON.stringify({ id: 'evt_test1', object: 'event', type: 'customer.created', created: Math.floor(Date.now() / 1000), data: { object: { id: 'cus_test1' } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(billing.readWebhook(payload, header)).toMatchObject({ eventId: 'evt_test1', kind: 'ignored' });
    expect(() => billing.readWebhook(payload, null)).toThrow(WebhookSignatureError);
    expect(() => billing.readWebhook(`${payload} `, header)).toThrow(WebhookSignatureError);
    expect(() => billing.readWebhook(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' }))).toThrow(WebhookSignatureError);
    const stale = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => billing.readWebhook(payload, stale)).toThrow(WebhookSignatureError);
    const strange = JSON.stringify({ id: 'evt_test2', object: 'event', type: 'invoice.paid', created: 1, data: { object: { id: 'in_x' } } });
    expect(() => billing.readWebhook(strange, Stripe.webhooks.generateTestHeaderString({ payload: strange, secret }))).toThrow(BillingEventError);
  });

  it('builds the SDK client from a secret key without calling Stripe', () => {
    const client = stripeClient('sk_test_synthetic_not_a_key');
    expect(typeof client.customers.create).toBe('function');
    expect(typeof client.webhooks.constructEvent).toBe('function');
  });
});
