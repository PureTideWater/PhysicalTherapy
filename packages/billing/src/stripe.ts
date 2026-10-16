import Stripe from 'stripe';

import { type PlanCatalog, planCatalog } from './catalog';
import { BillingEventError, INVOICE_KIND_METADATA, ORGANIZATION_METADATA, readStripeEvent } from './events';
import {
  type BillingEvent,
  type BillingProvider,
  BillingProviderError,
  type InvoicePaymentDetails,
  type PaymentMethodKind,
  type PaymentMethodSummary,
  type PlanInterval,
  type SetupIntentResult,
  WebhookSignatureError,
} from './types';

/**
 * The Stripe implementation of BillingProvider, on the official SDK (PRD 6, Billing; PRD 15: "Stripe (no
 * PHI: organization names and invoices only)"; docs/adr/0050):
 *
 * - Customers carry the organization's name and its opaque ID in metadata, nothing else.
 * - Products and prices for the monthly and annual plans and the audit invoice are found by their lookup
 *   keys (config/plans.json) and created once if missing.
 * - Subscriptions charge the customer's default payment method automatically; payment methods are ACH
 *   debit (us_bank_account) or card, collected in the browser by Stripe Elements against a SetupIntent,
 *   so no account or card number ever reaches the product.
 * - Every call that creates or changes something sends an idempotency key, so a retried request creates
 *   nothing twice.
 * - Webhooks are verified by their signature with the SDK (constructEvent, Stripe's default tolerance)
 *   before anything in them is read.
 *
 * The client is injected (tests give a mocked one); production builds it from STRIPE_SECRET_KEY.
 */

/** The SDK resources billing calls; the tests mock exactly these. */
export type StripeApi = Pick<Stripe, 'customers' | 'products' | 'prices' | 'subscriptions' | 'invoices' | 'invoiceItems' | 'invoicePayments' | 'setupIntents' | 'paymentMethods' | 'webhooks'>;

export interface StripeProviderOptions {
  readonly client: StripeApi;
  /** The webhook endpoint's signing secret (whsec_...). */
  readonly webhookSecret: string;
  /** Stripe Elements' publishable key (pk_...). */
  readonly publishableKey: string;
  readonly catalog?: PlanCatalog;
}

/** Builds the SDK client for a secret key; the SDK pins its own API version. */
export function stripeClient(secretKey: string): StripeApi {
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'therapy-platform-billing' } });
}

/** A Stripe error, as a code and a sentence of ours (Stripe's own message may quote what was sent). */
function providerError(error: unknown, action: string): BillingProviderError {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'stripe_error';
  return new BillingProviderError(code, `Stripe refused to ${action}`);
}

async function call<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw providerError(error, action);
  }
}

function summaryOf(method: Stripe.PaymentMethod): PaymentMethodSummary | null {
  if (method.type === 'us_bank_account' && method.us_bank_account !== undefined && method.us_bank_account !== null) {
    return { paymentMethodRef: method.id, kind: 'us_bank_account', last4: method.us_bank_account.last4 ?? '', label: method.us_bank_account.bank_name ?? null };
  }
  if (method.type === 'card' && method.card !== undefined && method.card !== null) {
    return { paymentMethodRef: method.id, kind: 'card', last4: method.card.last4, label: method.card.brand };
  }
  return null;
}

function kindOf(type: string | undefined): PaymentMethodKind | null {
  return type === 'us_bank_account' || type === 'card' ? type : null;
}

export class StripeBillingProvider implements BillingProvider {
  readonly kind = 'stripe' as const;
  readonly publishableKey: string;
  private readonly client: StripeApi;
  private readonly webhookSecret: string;
  private readonly catalog: PlanCatalog;
  private prices: Promise<Readonly<Record<PlanInterval | 'audit', string>>> | undefined;

  constructor(options: StripeProviderOptions) {
    this.client = options.client;
    this.webhookSecret = options.webhookSecret;
    this.publishableKey = options.publishableKey;
    this.catalog = options.catalog ?? planCatalog();
  }

  /** The prices for the two plans and the audit, by lookup key: found, or created once (with their products). */
  ensureCatalog(): Promise<Readonly<Record<PlanInterval | 'audit', string>>> {
    this.prices ??= this.loadCatalog().catch((error: unknown) => {
      this.prices = undefined;
      throw error;
    });
    return this.prices;
  }

  private async loadCatalog(): Promise<Readonly<Record<PlanInterval | 'audit', string>>> {
    const { plans, audit } = this.catalog;
    const wanted = [
      { key: 'monthly' as const, lookupKey: plans.monthly.lookupKey, name: plans.monthly.name, amount: plans.monthly.amountCents, interval: 'month' as const },
      { key: 'annual' as const, lookupKey: plans.annual.lookupKey, name: plans.annual.name, amount: plans.annual.amountCents, interval: 'year' as const },
      { key: 'audit' as const, lookupKey: audit.lookupKey, name: audit.name, amount: audit.amountCents, interval: null },
    ];
    const found = await call('list the plan prices', () => this.client.prices.list({ lookup_keys: wanted.map((entry) => entry.lookupKey), active: true, limit: 10 }));
    const result: Partial<Record<PlanInterval | 'audit', string>> = {};
    for (const entry of wanted) {
      const existing = found.data.find((price) => price.lookup_key === entry.lookupKey);
      // An existing price at another amount is a catalog change: a new price under the key takes it over.
      if (existing !== undefined && existing.unit_amount !== null && BigInt(existing.unit_amount) === entry.amount) {
        result[entry.key] = existing.id;
        continue;
      }
      const created = await call('create a plan price', () =>
        this.client.prices.create(
          {
            currency: 'usd',
            // Whole cents, sent exactly (the SDK's decimal, never a float).
            unit_amount_decimal: Stripe.Decimal.from(entry.amount),
            lookup_key: entry.lookupKey,
            transfer_lookup_key: true,
            product_data: { name: entry.name },
            ...(entry.interval === null ? {} : { recurring: { interval: entry.interval } }),
          },
          { idempotencyKey: `price:${entry.lookupKey}:${entry.amount.toString()}` },
        ),
      );
      result[entry.key] = created.id;
    }
    return result as Record<PlanInterval | 'audit', string>;
  }

  async createCustomer(input: { readonly organizationId: string; readonly name: string; readonly idempotencyKey: string }): Promise<string> {
    const customer = await call('create the customer', () =>
      this.client.customers.create({ name: input.name, metadata: { [ORGANIZATION_METADATA]: input.organizationId } }, { idempotencyKey: input.idempotencyKey }),
    );
    return customer.id;
  }

  async createSetupIntent(input: { readonly customerRef: string; readonly idempotencyKey: string }): Promise<SetupIntentResult> {
    const intent = await call('start collecting a payment method', () =>
      this.client.setupIntents.create(
        {
          customer: input.customerRef,
          allowed_payment_method_types: ['us_bank_account', 'card'],
          usage: 'off_session',
          payment_method_options: { us_bank_account: { verification_method: 'automatic' } },
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    if (intent.client_secret === null) {
      throw new BillingProviderError('no_client_secret', 'Stripe returned a setup intent without its client secret');
    }
    return { setupIntentRef: intent.id, clientSecret: intent.client_secret };
  }

  async setDefaultPaymentMethod(input: { readonly customerRef: string; readonly paymentMethodRef: string; readonly idempotencyKey: string }): Promise<void> {
    await call('set the default payment method', () =>
      this.client.customers.update(input.customerRef, { invoice_settings: { default_payment_method: input.paymentMethodRef } }, { idempotencyKey: input.idempotencyKey }),
    );
  }

  async paymentMethodOnFile(customerRef: string): Promise<PaymentMethodSummary | null> {
    const customer = await call('read the customer', () => this.client.customers.retrieve(customerRef, { expand: ['invoice_settings.default_payment_method'] }));
    if ('deleted' in customer && customer.deleted === true) {
      return null;
    }
    const method = (customer as Stripe.Customer).invoice_settings.default_payment_method;
    if (method === null || typeof method === 'string') {
      return method === null ? null : this.summaryById(method);
    }
    return summaryOf(method);
  }

  private async summaryById(paymentMethodRef: string): Promise<PaymentMethodSummary | null> {
    return summaryOf(await call('read the payment method', () => this.client.paymentMethods.retrieve(paymentMethodRef)));
  }

  async createSubscription(input: { readonly customerRef: string; readonly organizationId: string; readonly plan: PlanInterval; readonly idempotencyKey: string }): Promise<string> {
    const prices = await this.ensureCatalog();
    const subscription = await call('create the subscription', () =>
      this.client.subscriptions.create(
        {
          customer: input.customerRef,
          items: [{ price: prices[input.plan] }],
          collection_method: 'charge_automatically',
          payment_settings: { payment_method_types: ['us_bank_account', 'card'], save_default_payment_method: 'on_subscription' },
          metadata: { [ORGANIZATION_METADATA]: input.organizationId },
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    return subscription.id;
  }

  async cancelSubscription(input: { readonly subscriptionRef: string; readonly idempotencyKey: string }): Promise<void> {
    await call('cancel the subscription', () => this.client.subscriptions.update(input.subscriptionRef, { cancel_at_period_end: true }, { idempotencyKey: input.idempotencyKey }));
  }

  async createAuditInvoice(input: { readonly customerRef: string; readonly organizationId: string; readonly idempotencyKey: string }): Promise<string> {
    const prices = await this.ensureCatalog();
    const metadata = { [ORGANIZATION_METADATA]: input.organizationId, [INVOICE_KIND_METADATA]: 'audit' };
    const invoice = await call('create the audit invoice', () =>
      this.client.invoices.create(
        { customer: input.customerRef, collection_method: 'charge_automatically', auto_advance: true, pending_invoice_items_behavior: 'exclude', metadata },
        { idempotencyKey: `${input.idempotencyKey}:invoice` },
      ),
    );
    await call('add the audit to its invoice', () =>
      this.client.invoiceItems.create({ customer: input.customerRef, invoice: invoice.id, pricing: { price: prices.audit } }, { idempotencyKey: `${input.idempotencyKey}:item` }),
    );
    await call('finalize the audit invoice', () => this.client.invoices.finalizeInvoice(invoice.id, { auto_advance: true }, { idempotencyKey: `${input.idempotencyKey}:finalize` }));
    return invoice.id;
  }

  async payInvoice(input: { readonly invoiceRef: string; readonly idempotencyKey: string }): Promise<void> {
    await call('pay the invoice', () => this.client.invoices.pay(input.invoiceRef, {}, { idempotencyKey: input.idempotencyKey }));
  }

  async invoicePayment(invoiceRef: string): Promise<InvoicePaymentDetails> {
    const payments = await call('read the invoice’s payments', () =>
      this.client.invoicePayments.list({ invoice: invoiceRef, limit: 10, expand: ['data.payment.payment_intent.payment_method'] }),
    );
    const latest = [...payments.data].sort((a, b) => b.created - a.created)[0];
    const intent = latest?.payment.payment_intent;
    if (intent === undefined || typeof intent === 'string') {
      return { methodKind: null, failureCode: null };
    }
    const method = intent.payment_method;
    const methodKind = method === null ? null : typeof method === 'string' ? kindOf(intent.payment_method_types[0]) : kindOf(method.type);
    const failure = intent.last_payment_error;
    const code = failure === null ? null : (failure.decline_code ?? failure.code ?? null);
    return { methodKind, failureCode: code !== null && /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : null };
  }

  readWebhook(payload: string, signature: string | null): BillingEvent {
    let event: Stripe.Event;
    try {
      if (signature === null) {
        throw new WebhookSignatureError('no signature');
      }
      event = this.client.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      throw error instanceof WebhookSignatureError ? error : new WebhookSignatureError('the signature does not verify');
    }
    try {
      return readStripeEvent(event);
    } catch (error) {
      throw error instanceof BillingEventError ? error : new BillingEventError('the event could not be read');
    }
  }
}
