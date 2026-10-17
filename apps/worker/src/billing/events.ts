import { type BillingEvent, type BillingProvider, type InvoicePaymentDetails, type InvoiceSnapshot, type SubscriptionSnapshot } from '@tp/billing';

import { type BillingClient, type BillingPool, billingRows, withBilling } from './scope';

/**
 * Stripe's webhooks, kept (PRD 6, Billing; docs/adr/0050). A verified event is recorded once by its event
 * ID (billing_event): a delivery repeated, by Stripe or by the simulator, finds its ID and changes nothing.
 * Then:
 *
 * - a subscription event writes the subscription as the event reports it, and an invoice event the invoice,
 *   for the organization whose Stripe customer it names; an event older than the one a record already took
 *   (Stripe does not promise order) is stale and changes nothing, and an invoice's status only moves forward;
 * - an invoice's first failed payment starts its dunning clock (first_failed_at, the event's time). A failure
 *   is recorded whether or not the event's snapshot of the invoice is stale: a newer update delivered first
 *   (an open invoice, its attempt counted) must not hide the failure that came before it. An earlier failure
 *   delivered late moves the clock back to it; nothing moves it later. A paid one records how it was paid;
 * - a confirmed setup intent makes its payment method the customer's default (at Stripe, keyed by the event,
 *   so a repeat sets nothing twice);
 * - every other type is recorded and ignored, as is an event for a customer no organization has.
 *
 * Everything runs as tp_billing, so this code reads no PHI table; it records one system audit event per
 * event applied.
 */

export type AppliedOutcome = 'applied' | 'stale' | 'ignored' | 'unknown_customer' | 'duplicate';

export interface AppliedEvent {
  readonly eventId: string;
  readonly outcome: AppliedOutcome;
  readonly organizationId: string | null;
}

function customerOf(event: BillingEvent): string | null {
  switch (event.kind) {
    case 'subscription':
      return event.subscription.customerRef;
    case 'invoice':
      return event.invoice.customerRef;
    case 'payment_method':
      return event.customerRef;
    case 'ignored':
      return null;
  }
}

async function upsertSubscription(client: BillingClient, organizationId: string, subscription: SubscriptionSnapshot, occurredAt: Date): Promise<boolean> {
  const rows = await billingRows<{ id: string }>(
    client,
    `INSERT INTO subscription (organization_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, plan, status, current_period_start, current_period_end,
                               cancel_at_period_end, canceled_at, stripe_event_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       stripe_price_id = EXCLUDED.stripe_price_id, plan = EXCLUDED.plan, status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end, canceled_at = EXCLUDED.canceled_at, stripe_event_at = EXCLUDED.stripe_event_at
     WHERE subscription.stripe_event_at <= EXCLUDED.stripe_event_at
     RETURNING id`,
    [
      organizationId,
      subscription.subscriptionRef,
      subscription.customerRef,
      subscription.priceRef,
      subscription.plan,
      subscription.status,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      subscription.cancelAtPeriodEnd,
      subscription.canceledAt,
      occurredAt,
    ],
  );
  if (rows.length > 0 && ENDED_SUBSCRIPTIONS.has(subscription.status)) {
    // The organization may choose a plan again (account.ts subscribe's claim).
    await client.query("UPDATE subscription_claim SET status = 'ended' WHERE stripe_subscription_id = $1 AND status = 'created'", [subscription.subscriptionRef]);
  }
  return rows.length > 0;
}

/** A subscription in one of these has ended for good. */
const ENDED_SUBSCRIPTIONS: ReadonlySet<string> = new Set(['canceled', 'incomplete_expired']);

/** Status rank: an invoice's status moves forward only (the database refuses the rest). */
const RANK = `CASE $STATUS WHEN 'draft' THEN 0 WHEN 'open' THEN 1 WHEN 'uncollectible' THEN 2 ELSE 3 END`;
const rank = (column: string) => RANK.replace('$STATUS', column);

async function upsertInvoice(
  client: BillingClient,
  organizationId: string,
  invoice: InvoiceSnapshot,
  occurredAt: Date,
  failed: boolean,
  payment: InvoicePaymentDetails | null,
): Promise<boolean> {
  const failureCode = failed ? (payment?.failureCode ?? 'payment_failed') : null;
  const methodKind = invoice.status === 'paid' ? (payment?.methodKind ?? null) : null;
  const rows = await billingRows<{ id: string }>(
    client,
    `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, stripe_subscription_id, kind, number, status, currency,
                          amount_due_cents, amount_paid_cents, amount_remaining_cents, period_start, period_end, due_at, paid_at,
                          payment_method_kind, attempt_count, first_failed_at, last_failure_code, hosted_invoice_url, stripe_event_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'usd', $8, $9, $10, $11, $12, $13, $14, $15, $16,
             CASE WHEN $17::boolean AND $7 IN ('open', 'uncollectible') THEN $19::timestamptz END, $18, $20, $19)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET
       stripe_subscription_id = EXCLUDED.stripe_subscription_id, kind = EXCLUDED.kind, number = coalesce(EXCLUDED.number, invoice.number),
       status = EXCLUDED.status, amount_due_cents = EXCLUDED.amount_due_cents, amount_paid_cents = EXCLUDED.amount_paid_cents,
       amount_remaining_cents = EXCLUDED.amount_remaining_cents, period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
       due_at = EXCLUDED.due_at, paid_at = EXCLUDED.paid_at,
       payment_method_kind = coalesce(EXCLUDED.payment_method_kind, invoice.payment_method_kind),
       attempt_count = greatest(EXCLUDED.attempt_count, invoice.attempt_count),
       first_failed_at = CASE WHEN invoice.first_failed_at IS NULL OR EXCLUDED.first_failed_at < invoice.first_failed_at THEN coalesce(EXCLUDED.first_failed_at, invoice.first_failed_at)
                              ELSE invoice.first_failed_at END,
       last_failure_code = coalesce(EXCLUDED.last_failure_code, invoice.last_failure_code),
       hosted_invoice_url = coalesce(EXCLUDED.hosted_invoice_url, invoice.hosted_invoice_url),
       stripe_event_at = greatest(EXCLUDED.stripe_event_at, invoice.stripe_event_at)
     WHERE (${rank('EXCLUDED.status')} > ${rank('invoice.status')}
            OR (EXCLUDED.status = invoice.status AND invoice.stripe_event_at <= EXCLUDED.stripe_event_at))
       AND (invoice.status NOT IN ('paid', 'void') OR EXCLUDED.status = invoice.status)
     RETURNING id`,
    [
      organizationId,
      invoice.invoiceRef,
      invoice.customerRef,
      invoice.subscriptionRef,
      invoice.kind,
      invoice.number,
      invoice.status,
      invoice.amountDueCents.toString(),
      invoice.amountPaidCents.toString(),
      invoice.amountRemainingCents.toString(),
      invoice.periodStart,
      invoice.periodEnd,
      invoice.dueAt,
      invoice.paidAt,
      methodKind,
      invoice.attemptCount,
      failed,
      failureCode,
      occurredAt,
      invoice.hostedInvoiceUrl,
    ],
  );
  const snapshot = rows.length > 0;
  if (!failed) {
    return snapshot;
  }
  // The failure itself, apart from the snapshot's staleness: an unpaid invoice's clock starts at its earliest
  // failure, and its failure code is kept when none is recorded yet.
  const recorded = await billingRows<{ id: string }>(
    client,
    `UPDATE invoice SET first_failed_at = CASE WHEN first_failed_at IS NULL OR first_failed_at > $2 THEN $2 ELSE first_failed_at END,
                        last_failure_code = coalesce(last_failure_code, $3),
                        attempt_count = greatest(attempt_count, $4)
      WHERE stripe_invoice_id = $1 AND organization_id = $5 AND status IN ('open', 'uncollectible')
        AND (first_failed_at IS NULL OR first_failed_at > $2 OR last_failure_code IS NULL OR attempt_count < $4)
      RETURNING id`,
    [invoice.invoiceRef, occurredAt, failureCode, invoice.attemptCount, organizationId],
  );
  return snapshot || recorded.length > 0;
}

/** Applies one verified event inside a billing transaction; `payment` is what Stripe said of an invoice's payment. */
export async function applyBillingEvent(client: BillingClient, event: BillingEvent, payment: InvoicePaymentDetails | null, requestId: string): Promise<AppliedEvent> {
  const claimed = await billingRows<{ id: string }>(
    client,
    `INSERT INTO billing_event (stripe_event_id, type, occurred_at, outcome) VALUES ($1, $2, $3, 'received')
     ON CONFLICT (stripe_event_id) DO NOTHING RETURNING id`,
    [event.eventId, event.type, event.occurredAt],
  );
  const eventRow = claimed[0]?.id;
  if (eventRow === undefined) {
    return { eventId: event.eventId, outcome: 'duplicate', organizationId: null };
  }
  const customer = customerOf(event);
  const organizationId =
    customer === null ? null : ((await billingRows<{ id: string }>(client, 'SELECT id FROM organization WHERE billing_customer_ref = $1', [customer]))[0]?.id ?? null);
  let outcome: AppliedOutcome;
  if (event.kind === 'ignored') {
    outcome = 'ignored';
  } else if (organizationId === null) {
    outcome = 'unknown_customer';
  } else if (event.kind === 'subscription') {
    outcome = (await upsertSubscription(client, organizationId, event.subscription, event.occurredAt)) ? 'applied' : 'stale';
  } else if (event.kind === 'invoice') {
    outcome = (await upsertInvoice(client, organizationId, event.invoice, event.occurredAt, event.paymentFailed, payment)) ? 'applied' : 'stale';
  } else {
    // The payment method went on file at Stripe before this transaction (keyed by the event).
    outcome = 'applied';
  }
  await client.query('UPDATE billing_event SET outcome = $2, organization_id = $3 WHERE id = $1', [eventRow, outcome, organizationId]);
  await client.query("SELECT billing_record_audit('billing_event_applied', 'billing_event', $1, $2, $3)", [eventRow, outcome, requestId]);
  return { eventId: event.eventId, outcome, organizationId };
}

export interface ReceiveDependencies {
  /** Billing's own login (the webhook route) or the operator's: a login that may SET ROLE tp_billing (docs/adr/0055). */
  readonly pool: BillingPool;
  readonly provider: BillingProvider;
}

/**
 * The webhook route's work: verify the signature and read the event (throws WebhookSignatureError or
 * BillingEventError, and nothing is recorded), ask Stripe what it needs outside the transaction (an
 * invoice's payment; a confirmed method put on file, keyed by the event), then record and apply it once.
 */
export async function receiveWebhook(dependencies: ReceiveDependencies, input: { readonly payload: string; readonly signature: string | null; readonly requestId: string }): Promise<AppliedEvent> {
  const event = dependencies.provider.readWebhook(input.payload, input.signature);
  let payment: InvoicePaymentDetails | null = null;
  if (event.kind === 'invoice' && (event.paymentFailed || event.invoice.status === 'paid')) {
    // Best effort: an invoice is kept without its payment's details rather than not at all.
    payment = await dependencies.provider.invoicePayment(event.invoice.invoiceRef).catch(() => null);
  }
  if (event.kind === 'payment_method') {
    await dependencies.provider.setDefaultPaymentMethod({ customerRef: event.customerRef, paymentMethodRef: event.paymentMethodRef, idempotencyKey: `default-payment-method:${event.eventId}` });
  }
  return withBilling(dependencies.pool, (client) => applyBillingEvent(client, event, payment, input.requestId));
}
