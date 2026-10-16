import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type Cents, parseCents } from '@tp/money';

import { type PlanCatalog, planCatalog } from './catalog';
import { SIMULATOR_RETRY_DAYS } from './dunning';
import { INVOICE_KIND_METADATA, ORGANIZATION_METADATA, readStripeEvent } from './events';
import { signPayload, verifySignature } from './signature';
import {
  type BillingEvent,
  type BillingProvider,
  BillingProviderError,
  type InvoicePaymentDetails,
  type InvoiceStatus,
  type PaymentMethodKind,
  type PaymentMethodSummary,
  type PlanInterval,
  type SetupIntentResult,
  type SubscriptionStatus,
} from './types';

/**
 * The local implementation of BillingProvider: a simulator of Stripe's test mode for development, the
 * tests and the e2e suite (docs/adr/0050), so nothing outside this machine is called. It keeps customers,
 * payment methods, setup intents, subscriptions and invoices in a store (in memory, or a directory shared
 * by the web app's processes and the e2e suite), and sends the same webhook events Stripe would, in
 * Stripe's shape and signed the way Stripe signs them, to the same verification and processing.
 *
 * What it simulates:
 * - Payment methods are collected by `confirmSetupIntent` (the stand-in for Stripe Elements) from the
 *   simulator's own test values below; only the last four digits and the outcome are kept.
 * - A card payment settles at once. An ACH debit is processing until it settles: `settle()` settles every
 *   pending debit now (the test-mode control), `advance(days)` settles those four days old. A test account
 *   or card that fails returns its failure code and sends invoice.payment_failed.
 * - `advance(days)` moves the simulated clock: a failed invoice is retried on days 3, 7 and 14 after its
 *   first failure with the payment method then on file (the subscription is unpaid after the last), and a
 *   subscription past its period renews with a new invoice, or ends if it was canceled at period end.
 * - Every call that creates something honors its idempotency key, as Stripe does.
 *
 * Subscription statuses follow Stripe's closely but not exactly (incomplete while a first ACH payment is
 * processing, past_due after a failure, unpaid after the last retry); the product's rules read invoices,
 * never the subscription's status, so nothing the product decides depends on the difference.
 */

/** The simulator's test values (routing number 110000000), in the manner of Stripe's test mode. */
export const SIMULATOR_TEST_ROUTING = '110000000';
export const SIMULATOR_TEST_ACCOUNTS: Readonly<Record<string, { readonly settles: boolean; readonly failureCode: string | null }>> = {
  '000123456789': { settles: true, failureCode: null },
  '000111111116': { settles: false, failureCode: 'account_closed' },
  '000222222227': { settles: false, failureCode: 'insufficient_funds' },
};
export const SIMULATOR_TEST_CARDS: Readonly<Record<string, { readonly settles: boolean; readonly failureCode: string | null; readonly brand: string }>> = {
  '4242424242424242': { settles: true, failureCode: null, brand: 'visa' },
  '4000000000000341': { settles: false, failureCode: 'card_declined', brand: 'visa' },
};

/** Days an ACH debit takes to settle when the clock is advanced. */
export const SIMULATOR_ACH_SETTLEMENT_DAYS = 4;

const DAY_MS = 86_400_000;

export type SimulatedPaymentDetails =
  | { readonly kind: 'us_bank_account'; readonly routingNumber: string; readonly accountNumber: string }
  | { readonly kind: 'card'; readonly number: string };

interface SimCustomer {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  defaultPaymentMethod: string | null;
}

interface SimPaymentMethod {
  readonly id: string;
  readonly customer: string;
  readonly kind: PaymentMethodKind;
  readonly last4: string;
  readonly label: string | null;
  readonly settles: boolean;
  readonly failureCode: string | null;
}

interface SimSetupIntent {
  readonly id: string;
  readonly customer: string;
  readonly clientSecret: string;
  paymentMethod: string | null;
}

interface SimSubscription {
  readonly id: string;
  readonly customer: string;
  readonly organizationId: string;
  readonly plan: PlanInterval;
  readonly price: string;
  status: SubscriptionStatus;
  periodStart: number;
  periodEnd: number;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
}

interface SimInvoice {
  readonly id: string;
  readonly customer: string;
  readonly subscription: string | null;
  readonly kind: 'subscription' | 'audit';
  readonly organizationId: string;
  readonly number: string;
  status: InvoiceStatus;
  /** Whole cents, as text. */
  readonly amountDue: string;
  amountPaid: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly created: number;
  paidAt: number | null;
  attemptCount: number;
  firstFailedAt: number | null;
  retriesDone: number;
  lastMethodKind: PaymentMethodKind | null;
  lastFailureCode: string | null;
  /** An ACH debit in flight: its payment method and when it was started (simulated ms). */
  pending: { readonly paymentMethod: string; readonly startedAt: number } | null;
}

interface SignedEvent {
  readonly payload: string;
  readonly signature: string;
}

export interface SimulatorState {
  readonly format: 'tp-billing-simulator/1';
  /** Added to the real clock: what advance() has moved. */
  offsetMs: number;
  sequence: number;
  customers: Record<string, SimCustomer>;
  paymentMethods: Record<string, SimPaymentMethod>;
  setupIntents: Record<string, SimSetupIntent>;
  subscriptions: Record<string, SimSubscription>;
  invoices: Record<string, SimInvoice>;
  /** Results by idempotency key. */
  idempotency: Record<string, string>;
  /** Events not yet delivered, oldest first. */
  outbox: SignedEvent[];
}

export function emptySimulatorState(): SimulatorState {
  return { format: 'tp-billing-simulator/1', offsetMs: 0, sequence: 0, customers: {}, paymentMethods: {}, setupIntents: {}, subscriptions: {}, invoices: {}, idempotency: {}, outbox: [] };
}

/** Where the simulator keeps its state: one change at a time. */
export interface SimulatorStore {
  update<T>(change: (state: SimulatorState) => T): Promise<T>;
}

/** In memory, for the tests: changes run one after another. */
export class MemorySimulatorStore implements SimulatorStore {
  private state = emptySimulatorState();
  private queue: Promise<unknown> = Promise.resolve();

  update<T>(change: (state: SimulatorState) => T): Promise<T> {
    const next = this.queue.then(() => {
      const copy = structuredClone(this.state);
      const result = change(copy);
      this.state = copy;
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/**
 * In a directory (BILLING_LOCAL_DIR), shared by the web app's processes, the worker and the e2e suite:
 * state.json, changed under a lock directory (mkdir is atomic), written to a temporary file and renamed.
 * A lock older than 30 seconds is a crashed process's and is taken over.
 */
export class DirectorySimulatorStore implements SimulatorStore {
  private readonly file: string;
  private readonly lock: string;

  constructor(readonly directory: string) {
    this.file = path.join(directory, 'state.json');
    this.lock = path.join(directory, 'state.lock');
  }

  private async acquire(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (let attempt = 0; ; attempt += 1) {
      try {
        await mkdir(this.lock);
        return;
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) {
          throw error;
        }
        const held = await stat(this.lock).catch(() => null);
        if (held !== null && Date.now() - held.mtimeMs > 30_000) {
          await rm(this.lock, { recursive: true, force: true });
          continue;
        }
        if (attempt > 2000) {
          throw new BillingProviderError('simulator_busy', 'the billing simulator’s state stayed locked');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  async update<T>(change: (state: SimulatorState) => T): Promise<T> {
    await this.acquire();
    try {
      const text = await readFile(this.file, 'utf8').catch((error: unknown) => {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });
      const state = text === null ? emptySimulatorState() : (JSON.parse(text) as SimulatorState);
      const result = change(state);
      const temporary = `${this.file}.${randomBytes(6).toString('hex')}`;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await rename(temporary, this.file);
      return result;
    } finally {
      await rm(this.lock, { recursive: true, force: true });
    }
  }
}

export interface LocalProviderOptions {
  readonly store?: SimulatorStore;
  /** The signing secret the simulator signs its events with, and the webhook route verifies them with. */
  readonly webhookSecret: string;
  /** Where events go once a change is saved: the webhook processing, in the same process (or over HTTP). */
  readonly deliver?: (payload: string, signature: string) => Promise<void>;
  readonly now?: () => Date;
  readonly catalog?: PlanCatalog;
}

function seconds(ms: number): number {
  return Math.floor(ms / 1000);
}

function addMonths(ms: number, months: number): number {
  const date = new Date(ms);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}

/** JSON with bigint cents written as JSON numbers, exactly. */
function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? (JSON as unknown as { rawJSON(text: string): unknown }).rawJSON(item.toString()) : item));
}

export class LocalBillingProvider implements BillingProvider {
  readonly kind = 'local' as const;
  readonly publishableKey = null;
  private readonly store: SimulatorStore;
  private readonly webhookSecret: string;
  private readonly deliverEvent: ((payload: string, signature: string) => Promise<void>) | undefined;
  private readonly now: () => Date;
  private readonly catalog: PlanCatalog;
  private flushing = false;

  constructor(options: LocalProviderOptions) {
    this.store = options.store ?? new MemorySimulatorStore();
    this.webhookSecret = options.webhookSecret;
    this.deliverEvent = options.deliver;
    this.now = options.now ?? (() => new Date());
    this.catalog = options.catalog ?? planCatalog();
  }

  // -------------------------------------------------------------------------------------------------
  // State helpers (inside a change)
  // -------------------------------------------------------------------------------------------------

  private clock(state: SimulatorState): number {
    return this.now().getTime() + state.offsetMs;
  }

  private nextId(state: SimulatorState, prefix: string): string {
    state.sequence += 1;
    return `${prefix}_sim${state.sequence.toString().padStart(8, '0')}${randomBytes(4).toString('hex')}`;
  }

  private emit(state: SimulatorState, type: string, object: Record<string, unknown>): void {
    const event = { id: this.nextId(state, 'evt'), object: 'event', type, created: seconds(this.clock(state)), livemode: false, data: { object } };
    const payload = stringify(event);
    state.outbox.push({ payload, signature: signPayload(this.webhookSecret, payload, this.now()) });
  }

  private subscriptionObject(subscription: SimSubscription): Record<string, unknown> {
    return {
      id: subscription.id,
      object: 'subscription',
      customer: subscription.customer,
      status: subscription.status,
      cancel_at_period_end: subscription.cancelAtPeriodEnd,
      canceled_at: subscription.canceledAt === null ? null : seconds(subscription.canceledAt),
      metadata: { [ORGANIZATION_METADATA]: subscription.organizationId },
      items: {
        object: 'list',
        data: [
          {
            object: 'subscription_item',
            current_period_start: seconds(subscription.periodStart),
            current_period_end: seconds(subscription.periodEnd),
            price: { id: subscription.price, object: 'price', recurring: { interval: subscription.plan === 'monthly' ? 'month' : 'year' } },
          },
        ],
      },
    };
  }

  private invoiceObject(invoice: SimInvoice): Record<string, unknown> {
    const due = parseCents(invoice.amountDue);
    const paid = parseCents(invoice.amountPaid);
    return {
      id: invoice.id,
      object: 'invoice',
      customer: invoice.customer,
      number: invoice.number,
      status: invoice.status,
      currency: 'usd',
      amount_due: due,
      amount_paid: paid,
      amount_remaining: invoice.status === 'void' ? 0n : due - paid,
      period_start: seconds(invoice.periodStart),
      period_end: seconds(invoice.periodEnd),
      due_date: null,
      attempt_count: invoice.attemptCount,
      hosted_invoice_url: null,
      created: seconds(invoice.created),
      metadata: { [ORGANIZATION_METADATA]: invoice.organizationId, ...(invoice.kind === 'audit' ? { [INVOICE_KIND_METADATA]: 'audit' } : {}) },
      status_transitions: { paid_at: invoice.paidAt === null ? null : seconds(invoice.paidAt) },
      parent: invoice.subscription === null ? null : { type: 'subscription_details', subscription_details: { subscription: invoice.subscription, metadata: null } },
    };
  }

  private customer(state: SimulatorState, customerRef: string): SimCustomer {
    const found = state.customers[customerRef];
    if (found === undefined) {
      throw new BillingProviderError('resource_missing', 'no such customer in the billing simulator');
    }
    return found;
  }

  private setSubscriptionStatus(state: SimulatorState, subscriptionRef: string | null, status: SubscriptionStatus): void {
    const subscription = subscriptionRef === null ? undefined : state.subscriptions[subscriptionRef];
    if (subscription !== undefined && subscription.status !== status && subscription.status !== 'canceled') {
      subscription.status = status;
      this.emit(state, 'customer.subscription.updated', this.subscriptionObject(subscription));
    }
  }

  /** The payment's outcome, now (a card) or once it settles (an ACH debit). */
  private finishPayment(state: SimulatorState, invoice: SimInvoice, method: SimPaymentMethod): void {
    const at = this.clock(state);
    invoice.pending = null;
    invoice.lastMethodKind = method.kind;
    if (method.settles) {
      invoice.status = 'paid';
      invoice.amountPaid = invoice.amountDue;
      invoice.paidAt = at;
      invoice.lastFailureCode = null;
      this.emit(state, 'invoice.paid', this.invoiceObject(invoice));
      this.emit(state, 'invoice.payment_succeeded', this.invoiceObject(invoice));
      this.setSubscriptionStatus(state, invoice.subscription, 'active');
      return;
    }
    invoice.firstFailedAt ??= at;
    invoice.lastFailureCode = method.failureCode;
    this.emit(state, 'invoice.payment_failed', this.invoiceObject(invoice));
    this.setSubscriptionStatus(state, invoice.subscription, invoice.retriesDone >= SIMULATOR_RETRY_DAYS.length ? 'unpaid' : 'past_due');
  }

  /** Charges an open invoice to the customer's default payment method. */
  private attempt(state: SimulatorState, invoice: SimInvoice): void {
    if (invoice.status !== 'open' && invoice.status !== 'uncollectible') {
      return;
    }
    if (invoice.pending !== null) {
      return;
    }
    const methodRef = this.customer(state, invoice.customer).defaultPaymentMethod;
    const method = methodRef === null ? undefined : state.paymentMethods[methodRef];
    invoice.attemptCount += 1;
    if (method === undefined) {
      invoice.firstFailedAt ??= this.clock(state);
      invoice.lastMethodKind = null;
      invoice.lastFailureCode = 'no_payment_method';
      this.emit(state, 'invoice.payment_failed', this.invoiceObject(invoice));
      this.setSubscriptionStatus(state, invoice.subscription, 'past_due');
      return;
    }
    if (method.kind === 'us_bank_account') {
      invoice.pending = { paymentMethod: method.id, startedAt: this.clock(state) };
      invoice.lastMethodKind = method.kind;
      return;
    }
    this.finishPayment(state, invoice, method);
  }

  private openInvoice(
    state: SimulatorState,
    input: { customer: string; organizationId: string; subscription: string | null; kind: 'subscription' | 'audit'; amount: Cents; periodStart: number; periodEnd: number },
  ): SimInvoice {
    const count = Object.keys(state.invoices).length + 1;
    const invoice: SimInvoice = {
      id: this.nextId(state, 'in'),
      customer: input.customer,
      subscription: input.subscription,
      kind: input.kind,
      organizationId: input.organizationId,
      number: `SIM-${count.toString().padStart(4, '0')}`,
      status: 'draft',
      amountDue: input.amount.toString(),
      amountPaid: '0',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      created: this.clock(state),
      paidAt: null,
      attemptCount: 0,
      firstFailedAt: null,
      retriesDone: 0,
      lastMethodKind: null,
      lastFailureCode: null,
      pending: null,
    };
    state.invoices[invoice.id] = invoice;
    this.emit(state, 'invoice.created', this.invoiceObject(invoice));
    invoice.status = 'open';
    this.emit(state, 'invoice.finalized', this.invoiceObject(invoice));
    return invoice;
  }

  /** Runs a change once per idempotency key: a repeated key returns the first result and changes nothing. */
  private async once<T extends string | null>(key: string, change: (state: SimulatorState) => T): Promise<T> {
    const result = await this.store.update((state) => {
      const seen = state.idempotency[key];
      if (seen !== undefined) {
        return JSON.parse(seen) as T;
      }
      const value = change(state);
      state.idempotency[key] = JSON.stringify(value);
      return value;
    });
    await this.flush();
    return result;
  }

  private async change<T>(change: (state: SimulatorState) => T): Promise<T> {
    const result = await this.store.update(change);
    await this.flush();
    return result;
  }

  /**
   * Delivers the events waiting, oldest first. Each is taken from the outbox before it is delivered, so
   * the processing it starts (which may call the simulator again) never sees it twice; one whose delivery
   * fails goes back to the front, with those after it, for the next delivery. A delivery already under
   * way in this process delivers whatever its processing adds, so a nested call returns at once.
   */
  async flush(): Promise<number> {
    const deliver = this.deliverEvent;
    if (deliver === undefined || this.flushing) {
      return 0;
    }
    this.flushing = true;
    let delivered = 0;
    try {
      for (;;) {
        const next = await this.store.update((state) => state.outbox.shift() ?? null);
        if (next === null) {
          return delivered;
        }
        try {
          await deliver(next.payload, next.signature);
        } catch (error) {
          await this.store.update((state) => {
            state.outbox.unshift(next);
          });
          throw error;
        }
        delivered += 1;
      }
    } finally {
      this.flushing = false;
    }
  }

  /** The events waiting to be delivered (a provider built without delivery keeps them all). */
  async pendingEvents(): Promise<readonly SignedEvent[]> {
    return this.store.update((state) => [...state.outbox]);
  }

  // -------------------------------------------------------------------------------------------------
  // BillingProvider
  // -------------------------------------------------------------------------------------------------

  createCustomer(input: { readonly organizationId: string; readonly name: string; readonly idempotencyKey: string }): Promise<string> {
    return this.once(input.idempotencyKey, (state) => {
      const id = this.nextId(state, 'cus');
      state.customers[id] = { id, organizationId: input.organizationId, name: input.name, defaultPaymentMethod: null };
      return id;
    });
  }

  async createSetupIntent(input: { readonly customerRef: string; readonly idempotencyKey: string }): Promise<SetupIntentResult> {
    const id = await this.once(input.idempotencyKey, (state) => {
      this.customer(state, input.customerRef);
      const intent = this.nextId(state, 'seti');
      state.setupIntents[intent] = { id: intent, customer: input.customerRef, clientSecret: `${intent}_secret_${randomBytes(12).toString('hex')}`, paymentMethod: null };
      return intent;
    });
    return this.store.update((state) => {
      const intent = state.setupIntents[id];
      if (intent === undefined) {
        throw new BillingProviderError('resource_missing', 'no such setup intent in the billing simulator');
      }
      return { setupIntentRef: intent.id, clientSecret: intent.clientSecret };
    });
  }

  /**
   * The stand-in for Stripe Elements: confirms a setup intent with one of the simulator's test accounts or
   * cards, and sends setup_intent.succeeded. Any other number is refused, so no real one is ever accepted.
   */
  confirmSetupIntent(input: { readonly setupIntentRef: string; readonly details: SimulatedPaymentDetails; readonly idempotencyKey: string }): Promise<string> {
    const { details } = input;
    let outcome: { readonly settles: boolean; readonly failureCode: string | null } | undefined;
    let label: string | null = null;
    let last4 = '';
    if (details.kind === 'us_bank_account') {
      outcome = details.routingNumber === SIMULATOR_TEST_ROUTING ? SIMULATOR_TEST_ACCOUNTS[details.accountNumber] : undefined;
      last4 = details.accountNumber.slice(-4);
      label = 'Simulator test bank';
    } else {
      const card = SIMULATOR_TEST_CARDS[details.number];
      outcome = card;
      last4 = details.number.slice(-4);
      label = card?.brand ?? null;
    }
    if (outcome === undefined) {
      return Promise.reject(new BillingProviderError('invalid_test_payment_method', 'the billing simulator accepts only its own test accounts and cards'));
    }
    const result = outcome;
    return this.once(input.idempotencyKey, (state) => {
      const intent = state.setupIntents[input.setupIntentRef];
      if (intent === undefined) {
        throw new BillingProviderError('resource_missing', 'no such setup intent in the billing simulator');
      }
      if (intent.paymentMethod !== null) {
        return intent.paymentMethod;
      }
      const id = this.nextId(state, 'pm');
      state.paymentMethods[id] = { id, customer: intent.customer, kind: details.kind, last4, label, settles: result.settles, failureCode: result.failureCode };
      intent.paymentMethod = id;
      this.emit(state, 'setup_intent.succeeded', { id: intent.id, object: 'setup_intent', status: 'succeeded', customer: intent.customer, payment_method: id });
      return id;
    });
  }

  async setDefaultPaymentMethod(input: { readonly customerRef: string; readonly paymentMethodRef: string; readonly idempotencyKey: string }): Promise<void> {
    await this.once(input.idempotencyKey, (state) => {
      const customer = this.customer(state, input.customerRef);
      if (state.paymentMethods[input.paymentMethodRef]?.customer !== customer.id) {
        throw new BillingProviderError('resource_missing', 'the payment method is not the customer’s');
      }
      customer.defaultPaymentMethod = input.paymentMethodRef;
      return null;
    });
  }

  paymentMethodOnFile(customerRef: string): Promise<PaymentMethodSummary | null> {
    return this.store.update((state) => {
      const methodRef = state.customers[customerRef]?.defaultPaymentMethod ?? null;
      const method = methodRef === null ? undefined : state.paymentMethods[methodRef];
      return method === undefined ? null : { paymentMethodRef: method.id, kind: method.kind, last4: method.last4, label: method.label };
    });
  }

  createSubscription(input: { readonly customerRef: string; readonly organizationId: string; readonly plan: PlanInterval; readonly idempotencyKey: string }): Promise<string> {
    return this.once(input.idempotencyKey, (state) => {
      const customer = this.customer(state, input.customerRef);
      if (customer.defaultPaymentMethod === null) {
        throw new BillingProviderError('no_payment_method', 'add a payment method before choosing a plan');
      }
      const price = this.catalog.plans[input.plan];
      const start = this.clock(state);
      const subscription: SimSubscription = {
        id: this.nextId(state, 'sub'),
        customer: customer.id,
        organizationId: input.organizationId,
        plan: input.plan,
        price: `price_sim_${price.lookupKey}`,
        status: 'incomplete',
        periodStart: start,
        periodEnd: addMonths(start, input.plan === 'monthly' ? 1 : 12),
        cancelAtPeriodEnd: false,
        canceledAt: null,
      };
      state.subscriptions[subscription.id] = subscription;
      this.emit(state, 'customer.subscription.created', this.subscriptionObject(subscription));
      const invoice = this.openInvoice(state, {
        customer: customer.id,
        organizationId: input.organizationId,
        subscription: subscription.id,
        kind: 'subscription',
        amount: price.amountCents,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
      });
      this.attempt(state, invoice);
      return subscription.id;
    });
  }

  async cancelSubscription(input: { readonly subscriptionRef: string; readonly idempotencyKey: string }): Promise<void> {
    await this.once(input.idempotencyKey, (state) => {
      const subscription = state.subscriptions[input.subscriptionRef];
      if (subscription === undefined) {
        throw new BillingProviderError('resource_missing', 'no such subscription in the billing simulator');
      }
      if (!subscription.cancelAtPeriodEnd && subscription.status !== 'canceled') {
        subscription.cancelAtPeriodEnd = true;
        this.emit(state, 'customer.subscription.updated', this.subscriptionObject(subscription));
      }
      return null;
    });
  }

  createAuditInvoice(input: { readonly customerRef: string; readonly organizationId: string; readonly idempotencyKey: string }): Promise<string> {
    return this.once(input.idempotencyKey, (state) => {
      const customer = this.customer(state, input.customerRef);
      const at = this.clock(state);
      const invoice = this.openInvoice(state, {
        customer: customer.id,
        organizationId: input.organizationId,
        subscription: null,
        kind: 'audit',
        amount: this.catalog.audit.amountCents,
        periodStart: at,
        periodEnd: at,
      });
      this.attempt(state, invoice);
      return invoice.id;
    });
  }

  async payInvoice(input: { readonly invoiceRef: string; readonly idempotencyKey: string }): Promise<void> {
    await this.once(input.idempotencyKey, (state) => {
      const invoice = state.invoices[input.invoiceRef];
      if (invoice === undefined) {
        throw new BillingProviderError('resource_missing', 'no such invoice in the billing simulator');
      }
      if (invoice.status !== 'open' && invoice.status !== 'uncollectible') {
        throw new BillingProviderError('invoice_not_open', 'only an open invoice is paid');
      }
      this.attempt(state, invoice);
      return null;
    });
  }

  invoicePayment(invoiceRef: string): Promise<InvoicePaymentDetails> {
    return this.store.update((state) => {
      const invoice = state.invoices[invoiceRef];
      return invoice === undefined ? { methodKind: null, failureCode: null } : { methodKind: invoice.lastMethodKind, failureCode: invoice.lastFailureCode };
    });
  }

  readWebhook(payload: string, signature: string | null): BillingEvent {
    verifySignature(this.webhookSecret, payload, signature, this.now());
    return readStripeEvent(JSON.parse(payload) as unknown);
  }

  // -------------------------------------------------------------------------------------------------
  // Test-mode controls
  // -------------------------------------------------------------------------------------------------

  /** Settles every ACH debit in flight now, as its test account says (the test-mode control). Returns how many. */
  settle(): Promise<number> {
    return this.change((state) => this.settleWhere(state, () => true));
  }

  private settleWhere(state: SimulatorState, due: (startedAt: number) => boolean): number {
    let settled = 0;
    for (const invoice of Object.values(state.invoices)) {
      const pending = invoice.pending;
      if (pending === null || !due(pending.startedAt)) {
        continue;
      }
      const method = state.paymentMethods[pending.paymentMethod];
      if (method === undefined) {
        invoice.pending = null;
        continue;
      }
      this.finishPayment(state, invoice, method);
      settled += 1;
    }
    return settled;
  }

  /**
   * Moves the simulated clock by whole days: ACH debits four days old settle, failed invoices are retried on
   * their retry days, and subscriptions past their period renew (or end, if canceled at period end).
   */
  advance(days: number): Promise<void> {
    if (!Number.isInteger(days) || days < 1 || days > 400) {
      return Promise.reject(new BillingProviderError('invalid_days', 'the simulated clock moves by 1 to 400 whole days'));
    }
    return this.change((state) => {
      for (let day = 0; day < days; day += 1) {
        state.offsetMs += DAY_MS;
        const now = this.clock(state);
        this.settleWhere(state, (startedAt) => now - startedAt >= SIMULATOR_ACH_SETTLEMENT_DAYS * DAY_MS);
        for (const invoice of Object.values(state.invoices)) {
          const retryDay = SIMULATOR_RETRY_DAYS[invoice.retriesDone];
          if (invoice.status === 'open' && invoice.firstFailedAt !== null && invoice.pending === null && retryDay !== undefined && now - invoice.firstFailedAt >= retryDay * DAY_MS) {
            invoice.retriesDone += 1;
            this.attempt(state, invoice);
          }
        }
        for (const subscription of Object.values(state.subscriptions)) {
          if (subscription.status === 'canceled' || subscription.periodEnd > now) {
            continue;
          }
          if (subscription.cancelAtPeriodEnd) {
            subscription.status = 'canceled';
            subscription.canceledAt = now;
            this.emit(state, 'customer.subscription.deleted', this.subscriptionObject(subscription));
            continue;
          }
          subscription.periodStart = subscription.periodEnd;
          subscription.periodEnd = addMonths(subscription.periodStart, subscription.plan === 'monthly' ? 1 : 12);
          this.emit(state, 'customer.subscription.updated', this.subscriptionObject(subscription));
          const invoice = this.openInvoice(state, {
            customer: subscription.customer,
            organizationId: subscription.organizationId,
            subscription: subscription.id,
            kind: 'subscription',
            amount: this.catalog.plans[subscription.plan].amountCents,
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd,
          });
          this.attempt(state, invoice);
        }
      }
    });
  }

  /** The simulated clock now. */
  simulatedNow(): Promise<Date> {
    return this.store.update((state) => new Date(this.clock(state)));
  }
}
