import { type BillingProvider, BillingProviderError, type PaymentMethodSummary, type PlanInterval } from '@tp/billing';
import { type Cents, parseCents } from '@tp/money';

import { type BillingClient, type BillingPool, billingRows, withBilling } from './scope';

/**
 * An organization's billing, for its administrators' Settings screen and the console (PRD 5, J18:
 * "invoices visible in the organization's settings"; PRD 7, Settings: billing; Internal console,
 * Organizations: billing status; docs/adr/0050).
 *
 * Reads run in the person's own transaction as the application role, so the policies decide: an
 * organization's administrators (organization.billing) read its records, platform administrators
 * (billing.manage) every organization's. The changes a person asks for happen at Stripe (a customer, a
 * setup intent, a subscription, a payment); what Stripe then reports arrives by webhook. The one record
 * written here, the organization's customer reference, is written as tp_billing, once.
 */

export class BillingRefusedError extends Error {
  override readonly name = 'BillingRefusedError';
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

interface ReadClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

async function rows<R>(client: ReadClient, text: string, values?: unknown[]): Promise<R[]> {
  return (await client.query(text, values)).rows as R[];
}

export interface SubscriptionView {
  readonly id: string;
  readonly plan: PlanInterval;
  readonly status: string;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
}

export interface InvoiceView {
  readonly id: string;
  readonly number: string | null;
  readonly kind: 'subscription' | 'audit' | 'other';
  readonly status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  readonly amountDueCents: Cents;
  readonly amountPaidCents: Cents;
  readonly amountRemainingCents: Cents;
  readonly periodStart: Date | null;
  readonly periodEnd: Date | null;
  readonly paidAt: Date | null;
  readonly firstFailedAt: Date | null;
  readonly lastFailureCode: string | null;
  readonly paymentMethodKind: 'us_bank_account' | 'card' | null;
  readonly hostedInvoiceUrl: string | null;
  readonly createdAt: Date;
}

/** The invoice that holds billing's standing (billing_standing.invoice_id): the oldest unpaid one whose payment failed. */
export interface HoldingInvoice {
  readonly id: string;
  readonly number: string | null;
  readonly amountRemainingCents: Cents;
}

export interface OrganizationBilling {
  readonly organizationId: string;
  readonly name: string;
  readonly kind: 'group' | 'firm' | 'internal';
  /** The organization's record status: a platform administrator may hold it suspended or closed. */
  readonly status: 'active' | 'suspended' | 'closed';
  readonly hasCustomer: boolean;
  readonly standing: 'good' | 'past_due' | 'suspended';
  readonly pastDueSince: Date | null;
  readonly suspendedSince: Date | null;
  /** The invoice holding the organization past due or suspended for nonpayment, wherever it falls among the invoices; null in good standing. */
  readonly holdingInvoice: HoldingInvoice | null;
  /**
   * How many unpaid invoices have held a payment failure for 30 days (billing_standing's own predicate): runs restart
   * only once every one is paid, since paying the holding invoice moves the hold to the next.
   */
  readonly holdingCount: number;
  readonly subscription: SubscriptionView | null;
  readonly invoices: readonly InvoiceView[];
}

interface OrganizationRow {
  readonly id: string;
  readonly name: string;
  readonly kind: OrganizationBilling['kind'];
  readonly status: OrganizationBilling['status'];
  readonly has_customer: boolean;
  readonly standing: OrganizationBilling['standing'];
  readonly past_due_since: Date | null;
  readonly suspended_since: Date | null;
  readonly holding_invoice_id: string | null;
  readonly holding_number: string | null;
  readonly holding_remaining_cents: string | null;
  readonly holding_count: number;
}

interface InvoiceRow {
  readonly id: string;
  readonly number: string | null;
  readonly kind: InvoiceView['kind'];
  readonly status: InvoiceView['status'];
  readonly amount_due_cents: string;
  readonly amount_paid_cents: string;
  readonly amount_remaining_cents: string;
  readonly period_start: Date | null;
  readonly period_end: Date | null;
  readonly paid_at: Date | null;
  readonly first_failed_at: Date | null;
  readonly last_failure_code: string | null;
  readonly payment_method_kind: InvoiceView['paymentMethodKind'];
  readonly hosted_invoice_url: string | null;
  readonly created_at: Date;
}

/** The current subscription: the newest that has not ended. */
const CURRENT_SUBSCRIPTION = `SELECT id, plan, status, current_period_end, cancel_at_period_end FROM subscription
  WHERE organization_id = $1 AND status NOT IN ('canceled', 'incomplete_expired') ORDER BY created_at DESC, id LIMIT 1`;

/** The organization's billing as the person may read it; null when the policies show them none of it. */
export async function organizationBilling(client: ReadClient, organizationId: string, invoiceLimit = 24): Promise<OrganizationBilling | null> {
  const [organization] = await rows<OrganizationRow>(
    client,
    `SELECT o.id, o.name, o.kind, o.status, o.billing_customer_ref IS NOT NULL AS has_customer, s.standing, s.past_due_since, s.suspended_since,
            h.id AS holding_invoice_id, h.number AS holding_number, h.amount_remaining_cents::text AS holding_remaining_cents,
            (SELECT count(*) FROM invoice i
              WHERE i.organization_id = o.id AND i.status IN ('open', 'uncollectible') AND i.first_failed_at <= now() - interval '30 days')::int AS holding_count
       FROM organization o JOIN billing_standing s ON s.organization_id = o.id
       LEFT JOIN invoice h ON h.id = s.invoice_id
      WHERE o.id = $1`,
    [organizationId],
  );
  if (organization === undefined) {
    return null;
  }
  const [subscription] = await rows<{ id: string; plan: PlanInterval; status: string; current_period_end: Date | null; cancel_at_period_end: boolean }>(client, CURRENT_SUBSCRIPTION, [organizationId]);
  const invoices = await rows<InvoiceRow>(
    client,
    `SELECT id, number, kind, status, amount_due_cents::text AS amount_due_cents, amount_paid_cents::text AS amount_paid_cents,
            amount_remaining_cents::text AS amount_remaining_cents, period_start, period_end, paid_at, first_failed_at, last_failure_code,
            payment_method_kind, hosted_invoice_url, created_at
       FROM invoice WHERE organization_id = $1 AND status <> 'draft' ORDER BY created_at DESC, id LIMIT $2`,
    [organizationId, invoiceLimit],
  );
  return {
    organizationId: organization.id,
    name: organization.name,
    kind: organization.kind,
    status: organization.status,
    hasCustomer: organization.has_customer,
    standing: organization.standing,
    pastDueSince: organization.past_due_since,
    suspendedSince: organization.suspended_since,
    holdingInvoice:
      organization.holding_invoice_id === null
        ? null
        : { id: organization.holding_invoice_id, number: organization.holding_number, amountRemainingCents: parseCents(organization.holding_remaining_cents ?? '0') },
    holdingCount: organization.holding_count,
    subscription:
      subscription === undefined
        ? null
        : { id: subscription.id, plan: subscription.plan, status: subscription.status, currentPeriodEnd: subscription.current_period_end, cancelAtPeriodEnd: subscription.cancel_at_period_end },
    invoices: invoices.map((row) => ({
      id: row.id,
      number: row.number,
      kind: row.kind,
      status: row.status,
      amountDueCents: parseCents(row.amount_due_cents),
      amountPaidCents: parseCents(row.amount_paid_cents),
      amountRemainingCents: parseCents(row.amount_remaining_cents),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      paidAt: row.paid_at,
      firstFailedAt: row.first_failed_at,
      lastFailureCode: row.last_failure_code,
      paymentMethodKind: row.payment_method_kind,
      hostedInvoiceUrl: row.hosted_invoice_url,
      createdAt: row.created_at,
    })),
  };
}

/** The database's own answer: the person in this transaction may manage the organization's billing. */
export async function assertManagesBilling(client: ReadClient, organizationId: string): Promise<void> {
  const [answer] = await rows<{ ok: boolean }>(client, "SELECT app_actor_organization_permitted($1, 'organization.billing') AS ok", [organizationId]);
  if (answer?.ok !== true) {
    throw new BillingRefusedError('organizationId', 'only the organization’s administrator manages its billing');
  }
}

export interface BillingServices {
  /** A pool whose login may SET ROLE tp_billing (billing's own, or the operator's; never the application's, docs/adr/0055). */
  readonly pool: BillingPool;
  readonly provider: BillingProvider;
}

async function customerOf(
  client: BillingClient,
  organizationId: string,
): Promise<{ readonly name: string; readonly kind: string; readonly status: OrganizationBilling['status']; readonly ref: string | null } | undefined> {
  return (
    await billingRows<{ name: string; kind: string; status: OrganizationBilling['status']; ref: string | null }>(
      client,
      'SELECT name, kind, status, billing_customer_ref AS ref FROM organization WHERE id = $1',
      [organizationId],
    )
  )[0];
}

/** The organization's Stripe customer: created once (keyed by the organization), its reference recorded once. */
export async function ensureCustomer(services: BillingServices, organizationId: string): Promise<string> {
  const found = await withBilling(services.pool, (client) => customerOf(client, organizationId));
  if (found === undefined) {
    throw new BillingRefusedError('organizationId', 'no such organization');
  }
  if (found.kind === 'internal') {
    throw new BillingRefusedError('organizationId', 'the company’s own organization is never billed');
  }
  if (found.ref !== null) {
    return found.ref;
  }
  const created = await services.provider.createCustomer({ organizationId, name: found.name, idempotencyKey: `customer:${organizationId}` });
  return withBilling(services.pool, async (client) => {
    await client.query('UPDATE organization SET billing_customer_ref = $2 WHERE id = $1 AND billing_customer_ref IS NULL', [organizationId, created]);
    return (await customerOf(client, organizationId))?.ref ?? created;
  });
}

/** The payment method on file, or null (no customer yet, or none confirmed). */
export async function paymentMethodOnFile(services: BillingServices, organizationId: string): Promise<PaymentMethodSummary | null> {
  const found = await withBilling(services.pool, (client) => customerOf(client, organizationId));
  return found?.ref === null || found === undefined ? null : services.provider.paymentMethodOnFile(found.ref);
}

/** A SetupIntent for ACH or a card, for Stripe Elements (or the simulator's form). */
export async function startPaymentMethodSetup(services: BillingServices, organizationId: string, requestKey: string): Promise<{ readonly setupIntentRef: string; readonly clientSecret: string }> {
  const customer = await ensureCustomer(services, organizationId);
  return services.provider.createSetupIntent({ customerRef: customer, idempotencyKey: `setup:${organizationId}:${requestKey}` });
}

async function currentSubscription(services: BillingServices, organizationId: string): Promise<{ readonly ref: string } | undefined> {
  return withBilling(services.pool, async (client) =>
    (
      await billingRows<{ ref: string }>(
        client,
        `SELECT stripe_subscription_id AS ref FROM subscription WHERE organization_id = $1 AND status NOT IN ('canceled', 'incomplete_expired') ORDER BY created_at DESC LIMIT 1`,
        [organizationId],
      )
    )[0],
  );
}

/** How long a claim may wait on Stripe's answer before it is taken for abandoned (its process gone). */
const ABANDONED_CLAIM = "interval '1 hour'";

/**
 * Subscribes the organization to a plan, charged to the payment method on file; refused while one is current
 * or being set up. The database holds one claim per organization while a subscription is being set up or in
 * place (subscription_claim), taken before Stripe is asked: two submissions made before the first one's
 * webhook arrives (two tabs, a form rendered twice) cannot both subscribe. Stripe's idempotency key is the
 * claim's, so a retry of the same claim never creates a second subscription. The claim ends when the
 * subscription does (events.ts). A closed organization takes no new plan (its open invoices are still paid): read
 * first for the message, and checked again in the claim's own statement, so a closure between the two is not missed.
 */
export async function subscribe(services: BillingServices, organizationId: string, plan: PlanInterval, _requestKey: string): Promise<string> {
  if ((await withBilling(services.pool, (client) => customerOf(client, organizationId)))?.status === 'closed') {
    throw new BillingRefusedError('plan', 'a closed organization takes no new plan');
  }
  if ((await currentSubscription(services, organizationId)) !== undefined) {
    throw new BillingRefusedError('plan', 'the organization already has a plan; cancel it first to choose another');
  }
  const customer = await ensureCustomer(services, organizationId);
  if ((await services.provider.paymentMethodOnFile(customer)) === null) {
    throw new BillingRefusedError('plan', 'add a payment method (ACH or card) before choosing a plan');
  }
  const claim = await withBilling(services.pool, async (client) => {
    await client.query(`UPDATE subscription_claim SET status = 'failed' WHERE organization_id = $1 AND status = 'pending' AND created_at < now() - ${ABANDONED_CLAIM}`, [organizationId]);
    return (
      await billingRows<{ id: string }>(
        client,
        `INSERT INTO subscription_claim (organization_id, plan)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM organization WHERE id = $1 AND status <> 'closed')
         ON CONFLICT DO NOTHING RETURNING id`,
        [organizationId, plan],
      )
    )[0]?.id;
  });
  if (claim === undefined) {
    if ((await withBilling(services.pool, (client) => customerOf(client, organizationId)))?.status === 'closed') {
      throw new BillingRefusedError('plan', 'a closed organization takes no new plan');
    }
    throw new BillingRefusedError('plan', 'a plan is already being set up for the organization, or is in place; reload the page to see it');
  }
  let subscriptionRef: string;
  try {
    subscriptionRef = await services.provider.createSubscription({ customerRef: customer, organizationId, plan, idempotencyKey: `subscribe:${organizationId}:${claim}` });
  } catch (error) {
    await withBilling(services.pool, (client) => client.query("UPDATE subscription_claim SET status = 'failed' WHERE id = $1 AND status = 'pending'", [claim]));
    throw error;
  }
  await withBilling(services.pool, (client) => client.query("UPDATE subscription_claim SET status = 'created', stripe_subscription_id = $2 WHERE id = $1 AND status = 'pending'", [claim, subscriptionRef]));
  return subscriptionRef;
}

/** Cancels the current plan at the end of its period. */
export async function cancelPlan(services: BillingServices, organizationId: string, requestKey: string): Promise<string> {
  const current = await currentSubscription(services, organizationId);
  if (current === undefined) {
    throw new BillingRefusedError('plan', 'the organization has no plan to cancel');
  }
  await services.provider.cancelSubscription({ subscriptionRef: current.ref, idempotencyKey: `cancel:${organizationId}:${requestKey}` });
  return current.ref;
}

/** Tries an open invoice of the organization's again now, with the payment method on file. */
export async function payOpenInvoice(services: BillingServices, organizationId: string, invoiceId: string, requestKey: string): Promise<void> {
  const invoice = await withBilling(services.pool, async (client) =>
    (await billingRows<{ ref: string; status: string }>(client, 'SELECT stripe_invoice_id AS ref, status FROM invoice WHERE id = $1 AND organization_id = $2', [invoiceId, organizationId]))[0],
  );
  if (invoice === undefined) {
    throw new BillingRefusedError('invoiceId', 'no such invoice of this organization');
  }
  if (invoice.status !== 'open' && invoice.status !== 'uncollectible') {
    throw new BillingRefusedError('invoiceId', 'only an unpaid invoice is paid');
  }
  await services.provider.payInvoice({ invoiceRef: invoice.ref, idempotencyKey: `pay:${invoiceId}:${requestKey}` });
}

/** An audit invoice for an organization (a platform administrator, from the console), charged to its method on file. */
export async function issueAuditInvoice(services: BillingServices, organizationId: string, requestKey: string): Promise<string> {
  const customer = await ensureCustomer(services, organizationId);
  if ((await services.provider.paymentMethodOnFile(customer)) === null) {
    throw new BillingRefusedError('organizationId', 'the organization has no payment method on file; its administrator adds one in Settings first');
  }
  return services.provider.createAuditInvoice({ customerRef: customer, organizationId, idempotencyKey: `audit:${organizationId}:${requestKey}` });
}

/** A provider refusal as the person sees it: its code, and our sentence. */
export function refusalMessage(error: unknown): string | null {
  if (error instanceof BillingRefusedError) {
    return error.message;
  }
  if (error instanceof BillingProviderError) {
    return `the payment provider refused this (${error.code})`;
  }
  return null;
}

export interface ConsoleBillingRow {
  readonly organizationId: string;
  readonly name: string;
  readonly kind: 'group' | 'firm';
  readonly status: 'active' | 'suspended' | 'closed';
  readonly standing: 'good' | 'past_due' | 'suspended';
  readonly pastDueSince: Date | null;
  readonly suspendedSince: Date | null;
  readonly plan: PlanInterval | null;
  readonly subscriptionStatus: string | null;
  readonly openCents: Cents;
  readonly grantedPractices: number | null;
  readonly activePractices: number | null;
  readonly snapshotOn: string | null;
}

/** Every group's and firm's billing status, for the console (platform administrators; the policies hold it to them). */
export async function consoleBillingStatus(client: ReadClient): Promise<ConsoleBillingRow[]> {
  const found = await rows<{
    organization_id: string;
    name: string;
    kind: 'group' | 'firm';
    status: ConsoleBillingRow['status'];
    standing: ConsoleBillingRow['standing'];
    past_due_since: Date | null;
    suspended_since: Date | null;
    plan: PlanInterval | null;
    subscription_status: string | null;
    open_cents: string;
    granted_practices: number | null;
    active_practices: number | null;
    snapshot_on: string | null;
  }>(
    client,
    `SELECT o.id AS organization_id, o.name, o.kind, o.status, s.standing, s.past_due_since, s.suspended_since,
            sub.plan, sub.status AS subscription_status,
            (SELECT coalesce(sum(i.amount_remaining_cents), 0) FROM invoice i WHERE i.organization_id = o.id AND i.status IN ('open', 'uncollectible'))::text AS open_cents,
            u.granted_practices, u.active_practices, u.date::text AS snapshot_on
       FROM organization o
       JOIN billing_standing s ON s.organization_id = o.id
       LEFT JOIN LATERAL (SELECT plan, status FROM subscription WHERE organization_id = o.id AND status NOT IN ('canceled', 'incomplete_expired') ORDER BY created_at DESC LIMIT 1) sub ON true
       LEFT JOIN LATERAL (SELECT granted_practices, active_practices, date FROM usage_snapshot WHERE organization_id = o.id ORDER BY date DESC LIMIT 1) u ON true
      WHERE o.kind IN ('group', 'firm')
      ORDER BY CASE s.standing WHEN 'suspended' THEN 0 WHEN 'past_due' THEN 1 ELSE 2 END, o.name, o.id`,
  );
  return found.map((row) => ({
    organizationId: row.organization_id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    standing: row.standing,
    pastDueSince: row.past_due_since,
    suspendedSince: row.suspended_since,
    plan: row.plan,
    subscriptionStatus: row.subscription_status,
    openCents: parseCents(row.open_cents),
    grantedPractices: row.granted_practices,
    activePractices: row.active_practices,
    snapshotOn: row.snapshot_on,
  }));
}
