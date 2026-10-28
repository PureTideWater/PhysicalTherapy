import { BillingEventError, BillingProviderError, type CatalogPrice, type PaymentMethodSummary, type PlanCatalog, type PlanPrice, WebhookSignatureError, planCatalog, suspensionAt } from '@tp/billing';
import { LocalBillingProvider, SIMULATOR_TEST_ROUTING } from '@tp/billing/local';
import { STANDING_ORDER, type StandingKind, standingKind } from '@tp/billing/standing';
import { type ScopeClient, type SuspensionReason, rolesPermit } from '@tp/db/runtime';
import type { Cents } from '@tp/money';
import {
  type BillingServices,
  BillingRefusedError,
  type ConsoleBillingRow,
  type HoldingInvoice,
  type InvoiceView,
  type OrganizationBilling,
  assertManagesBilling,
  consoleBillingStatus,
  issueAuditInvoice,
  organizationBilling,
  payOpenInvoice,
  paymentMethodOnFile,
  receiveWebhook,
  startPaymentMethodSetup,
  subscribe,
} from '@tp/worker/billing';
import { z } from 'zod';

import { organizationRoute, platformRoute, publicRoute, selfRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import type { Services } from '../server/services';
import { opaqueId } from './schemas';

/**
 * Billing (PRD 5, J18: "invoices visible in the organization's settings"; PRD 6, Billing; PRD 7, Settings:
 * billing, and Internal console, Organizations and practices: billing status; docs/adr/0050):
 *
 * - Settings > Billing (/settings/billing): the organizations the person manages billing for, and each one's
 *   page (/settings/billing/<organization>): its payment method (a bank account by ACH, preferred and shown
 *   first, or a card, collected by Stripe Elements, or by the local simulator's form in development;
 *   docs/adr/0073), its plan, its invoices, and its one standing (the record's status and billing's, with what to
 *   do next; accountStanding). Organization routes: the organization's administrator (organization.billing), checked
 *   here and again by the database; no practice is in scope, so nothing here can show PHI.
 * - The webhook (/api/billing/webhook): public, verified by Stripe's signature, recorded once by event ID.
 * - The console's billing status per organization (/console/billing), and an audit invoice issued from it
 *   (billing.manage).
 *
 * What a person asks for happens at Stripe; what Stripe then reports arrives by webhook.
 */

const organizationParams = z.object({ organizationId: opaqueId });

/** Billing's own login (docs/adr/0055): the application's may not switch to tp_billing. */
function billingServices(services: Services): BillingServices {
  return { pool: services.billingPool, provider: services.billing };
}

/** A refusal of the billing workflow or the provider, as the form shows it (a code, never a value). */
async function asInput<T>(field: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BillingRefusedError) {
      throw new InputError([{ field: error.field, message: error.message }]);
    }
    if (error instanceof BillingProviderError) {
      throw new InputError([{ field, message: `the payment provider refused this (${error.code})` }]);
    }
    throw error;
  }
}

/**
 * The mutation's request key (a UUID the form was rendered with, which the wrapper has already checked and
 * claimed): the idempotency key's part, so a request retried after a failure creates nothing twice at Stripe.
 */
function requestKeyOf(request: { readonly input?: unknown }): string {
  const key = (request.input as { readonly requestKey?: unknown } | undefined)?.requestKey;
  if (typeof key !== 'string') {
    throw new InputError([{ field: 'requestKey', message: 'reload the page and try again' }]);
  }
  return key;
}

function simulatorOf(services: Services): LocalBillingProvider {
  if (!(services.billing instanceof LocalBillingProvider)) {
    throw new InputError([{ field: 'input', message: 'only the local billing simulator takes test payment details; Stripe collects real ones in its own form' }]);
  }
  return services.billing;
}

/** A route result carries money as cents text, as every route does (a bigint does not serialize); the page parses it back. */
export type CentsText<T> = { readonly [K in keyof T]: T[K] extends Cents ? string : T[K] };

export type InvoiceRow = CentsText<InvoiceView>;

export interface BillingView extends Omit<OrganizationBilling, 'invoices' | 'holdingInvoice'> {
  readonly invoices: readonly InvoiceRow[];
  readonly holdingInvoice: CentsText<HoldingInvoice> | null;
}

export interface CatalogView {
  readonly confirmed: boolean;
  readonly plans: { readonly monthly: CentsText<PlanPrice>; readonly annual: CentsText<PlanPrice> };
  readonly audit: CentsText<CatalogPrice>;
}

/** A row of the console's billing status, with the one standing (standingKind) the console shows and orders by. */
export interface ConsoleBillingView extends CentsText<ConsoleBillingRow> {
  readonly standingKind: StandingKind;
}

function billingView(billing: OrganizationBilling): BillingView {
  return {
    ...billing,
    holdingInvoice: billing.holdingInvoice === null ? null : { ...billing.holdingInvoice, amountRemainingCents: billing.holdingInvoice.amountRemainingCents.toString() },
    invoices: billing.invoices.map((invoice) => ({
      ...invoice,
      amountDueCents: invoice.amountDueCents.toString(),
      amountPaidCents: invoice.amountPaidCents.toString(),
      amountRemainingCents: invoice.amountRemainingCents.toString(),
    })),
  };
}

function catalogView(catalog: PlanCatalog): CatalogView {
  const price = <P extends CatalogPrice>(entry: P): CentsText<P> => ({ ...entry, amountCents: entry.amountCents.toString() }) as CentsText<P>;
  return { confirmed: catalog.confirmed, plans: { monthly: price(catalog.plans.monthly), annual: price(catalog.plans.annual) }, audit: price(catalog.audit) };
}

export interface BilledOrganization {
  readonly organizationId: string;
  readonly name: string;
  readonly kind: 'group' | 'firm';
}

/** The organizations whose billing the person manages (their administrator role in each). */
async function billedOrganizations(client: ScopeClient): Promise<BilledOrganization[]> {
  const { rows } = await client.query<{ organization_id: string; name: string; kind: 'group' | 'firm'; role: string }>(
    `SELECT m.organization_id, o.name, o.kind, m.role FROM app_actor_memberships() m JOIN organization o ON o.id = m.organization_id
      WHERE o.kind IN ('group', 'firm') ORDER BY o.name, o.id`,
  );
  return rows.filter((row) => rolesPermit([row.role], 'organization.billing')).map((row) => ({ organizationId: row.organization_id, name: row.name, kind: row.kind }));
}

export const billingSettingsPage = selfRoute({
  id: 'settings.billing',
  kind: 'page',
  path: '/settings/billing',
  phi: false,
  params: z.object({}),
  handle: async ({ scope }) => ({ organizations: await billedOrganizations(scope.client) }),
  sample: { params: () => ({}) },
});

export interface OrganizationBillingPage {
  readonly billing: BillingView;
  readonly paymentMethod: PaymentMethodSummary | null;
  readonly catalog: CatalogView;
  readonly provider: 'stripe' | 'local';
  readonly publishableKey: string | null;
  readonly standing: AccountStanding;
  readonly testRouting: string;
}

/** A next step as one sentence: its action (a link when it has an address) and the rest of the sentence. */
export interface NextStep {
  readonly action: string;
  readonly href: string | null;
  readonly detail: string;
}

/** Billing's own hold beside a suspension or closure by PaidWhole: an unpaid invoice whose payment failed, and since when. */
export interface BillingHold {
  readonly kind: 'past_due' | 'suspended_nonpayment';
  readonly since: Date | null;
  readonly invoice: CentsText<HoldingInvoice> | null;
}

/**
 * The organization's one standing as its administrator reads it: the badge's label and tone, the alert's title and
 * notice (an alert while runs are stopped, the organization is suspended, or a closed organization still owes an
 * invoice; a status while only past due or closed with nothing owed),
 * the next steps, billing's own hold beside a suspension or closure by PaidWhole, the note above the payment and plan
 * forms while PaidWhole's suspension lasts, and what stands in for the plan form once the organization is closed.
 */
export interface AccountStanding {
  readonly kind: StandingKind;
  readonly label: string;
  readonly tone: 'neutral' | 'danger';
  readonly title: string | null;
  readonly notice: string | null;
  readonly alert: boolean;
  readonly nextSteps: readonly NextStep[];
  readonly billingHold: BillingHold | null;
  readonly formsNote: string | null;
  readonly planRefusal: string | null;
}

/** Where a next step opens a ticket: the support form, on the Billing category (support.ts). */
export const BILLING_TICKET = '/support?from=billing';

const day = (date: Date | null): string => (date === null ? '' : date.toISOString().slice(0, 10));
/** An instant as the pages print one (components/format.ts utc): UTC, to the minute. */
const instant = (date: Date): string => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const since = (date: Date | null): string => (date === null ? '' : ` since ${day(date)}`);
const ticket = (detail: string): NextStep => ({ action: 'Open a support ticket', href: BILLING_TICKET, detail });
const pay = (invoice: BillingHold['invoice'], detail: string): NextStep => ({
  action: `Pay ${invoice?.number ?? 'the open invoice'}`,
  href: invoice === null ? null : `#pay-${invoice.id}`,
  detail,
});
const PAYMENT_METHOD: NextStep = { action: 'Update the payment method', href: null, detail: ' above.' };
/** A closed organization's one step, beside its standing and where the plan form was: no path reopens one. */
export const CLOSURE_TICKET: NextStep = ticket(' if you have a question about the closure.');
/** A bank (ACH) payment leaves the invoice open until the bank settles it, so it counts only then (docs/adr/0073). */
const ACH_SETTLES = 'a bank (ACH) payment counts once the bank settles it, usually within a few days';
/** The step to pay what holds a group suspended for nonpayment: every invoice unpaid for 30 days, since paying one moves the hold to the next. */
function restarts(count: number): string {
  return count > 1
    ? ` and the other ${count - 1 === 1 ? 'invoice' : `${String(count - 1)} invoices`} unpaid for 30 days below. Runs restart once all of them are paid: at once by card, or once the bank settles a bank (ACH) payment, usually within a few days.`
    : ' below. A card payment restarts runs at once; a bank (ACH) payment restarts them once the bank settles it, usually within a few days.';
}

/** PaidWhole's stored reason on the billing page (B10's clause, B7's step), read by the organization's own administrators. */
const SUSPENSION_WORDS: Readonly<Record<SuspensionReason, { readonly clause: string; readonly step: string }>> = {
  customer_request: { clause: ' at your request', step: ' when you want the organization reinstated.' },
  security_hold: { clause: ' while it looks into a security concern', step: ' to find out what PaidWhole needs from you.' },
  agreement_ended: { clause: " because the organization's agreement with PaidWhole has ended", step: ' to discuss a new agreement.' },
};

/**
 * The standing from the record's status and billing's (standingKind, @tp/billing/standing), in the customer's words.
 * The record wins: a suspended or closed organization never reads good, and an invoice unpaid beside it is named with
 * what it holds, since reinstating the organization alone restarts nothing while billing still holds it. Closed is
 * final (the console changes no closed status), so nothing promises a reopening, and it reads in the neutral tone
 * unless an invoice is still owed. A firm's unpaid invoice refuses no run before milestone 12 (docs/adr/0050);
 * PaidWhole's suspension or closure of a firm stops its people's new work through its grants (docs/adr/0080), so a firm
 * is told that, and nothing about runs. "Suspended by PaidWhole" carries PaidWhole's stored date (statusSince) when one
 * is stored, and the notice and the ticket's step follow its stored reason (statusReason; design SS-01, B1 to B10);
 * suspendedSince is billing's (30 days after the first failed payment) and never dates PaidWhole's. Runs restart only
 * once every invoice unpaid for 30 days is paid (holdingCount, billing_standing's own predicate).
 */
export function accountStanding(
  billing: Pick<BillingView, 'kind' | 'status' | 'standing' | 'pastDueSince' | 'suspendedSince' | 'holdingInvoice' | 'holdingCount' | 'statusReason' | 'statusSince'>,
): AccountStanding {
  const kind = standingKind(billing.status, billing.standing, billing.kind);
  const firm = billing.kind === 'firm';
  const invoice = billing.holdingInvoice;
  const several = billing.holdingCount > 1;
  const stops = billing.pastDueSince === null ? '' : instant(suspensionAt(billing.pastDueSince));
  const quiet = { billingHold: null, formsNote: null, planRefusal: null };
  if (kind === 'good') {
    return { kind, label: 'In good standing', tone: 'neutral', title: null, notice: null, alert: false, nextSteps: [], ...quiet };
  }
  if (kind === 'past_due') {
    const notice = firm
      ? `An invoice is unpaid since its payment failed on ${day(billing.pastDueSince)}.`
      : `New runs stop at ${stops}, 30 days after the failed payment, until the invoice is paid; ${ACH_SETTLES}. Your data stays readable.`;
    return { kind, label: `Past due${since(billing.pastDueSince)}`, tone: 'danger', title: 'A payment failed', notice, alert: false, nextSteps: [PAYMENT_METHOD, pay(invoice, ' below.')], ...quiet };
  }
  if (kind === 'suspended_nonpayment') {
    return {
      kind,
      label: `Suspended for nonpayment${since(billing.suspendedSince)}`,
      tone: 'danger',
      title: 'New runs have stopped',
      notice: several
        ? `New runs have stopped because ${String(billing.holdingCount)} invoices have been unpaid for 30 days since their payments failed; your data stays readable.`
        : 'New runs have stopped because an invoice has been unpaid for 30 days since its payment failed; your data stays readable.',
      alert: true,
      nextSteps: [pay(invoice, restarts(billing.holdingCount)), ticket(' if you have a question about the invoice.')],
      ...quiet,
    };
  }
  // Suspended by PaidWhole or closed, and perhaps held by billing as well.
  const holdKind = billing.standing === 'good' ? null : standingKind('active', billing.standing, billing.kind);
  const billingHold = holdKind === 'past_due' || holdKind === 'suspended_nonpayment' ? { kind: holdKind, since: billing.pastDueSince, invoice } : null;
  const paying = billingHold === null ? [] : [pay(invoice, ' below.')];
  if (kind === 'closed') {
    // Nothing restarts runs for a closed organization, so its unpaid invoice is named as owed, with no clause about runs.
    const owed =
      billingHold === null
        ? ''
        : several
          ? ` ${String(billing.holdingCount)} invoices are also unpaid, the oldest since ${day(billingHold.since)}; they are still owed.`
          : ` An invoice is also unpaid since ${day(billingHold.since)}; it is still owed.`;
    return {
      kind,
      label: 'Closed',
      tone: billingHold === null ? 'neutral' : 'danger',
      title: 'The organization is closed',
      notice: `${firm ? "Your people start no new work through the organization's grants." : 'Its data stays readable, and no new run starts.'}${owed}`,
      alert: billingHold !== null,
      nextSteps: [CLOSURE_TICKET, ...paying],
      billingHold,
      formsNote: null,
      planRefusal: 'A closed organization takes no new plan.',
    };
  }
  const held =
    billingHold === null
      ? ''
      : firm
        ? ` An invoice is also unpaid since ${day(billingHold.since)}.`
        : billingHold.kind === 'suspended_nonpayment'
          ? several
            ? ` ${String(billing.holdingCount)} invoices have also been unpaid for 30 days since their payments failed, the oldest since ${day(billingHold.since)}; new runs stay stopped until all of them are paid as well.`
            : ` An invoice is also unpaid since ${day(billingHold.since)}; new runs stay stopped until it is paid as well.`
          : ` An invoice is also unpaid since ${day(billingHold.since)}; if it is still unpaid at ${stops}, new runs stop then, even if PaidWhole has reinstated the organization; ${ACH_SETTLES}.`;
  const reason = billing.statusReason === null ? null : SUSPENSION_WORDS[billing.statusReason];
  return {
    kind,
    label: `Suspended by PaidWhole${since(billing.statusSince)}`,
    tone: 'danger',
    title: firm ? 'The organization is suspended' : 'New runs have stopped',
    notice: firm
      ? `PaidWhole has suspended the organization${reason?.clause ?? ''}: your people start no new work through its grants at the practices you are granted until PaidWhole reinstates the organization. Every record stays readable, and the practices' own staff carry on.${held}`
      : `PaidWhole has suspended the organization${reason?.clause ?? ''}: new runs have stopped until PaidWhole reinstates it, and its data stays readable. Paying an invoice does not reinstate it.${held}`,
    alert: true,
    nextSteps: [ticket(reason?.step ?? (firm ? ' to find out why.' : ' to find out why and what reinstates it.')), ...paying],
    billingHold,
    formsNote: 'Changing the plan or payment method does not reinstate an organization suspended by PaidWhole.',
    planRefusal: null,
  };
}

export const organizationBillingPage = organizationRoute({
  id: 'settings.billing.organization',
  kind: 'page',
  path: '/settings/billing/[organizationId]',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  handle: async ({ scope, organizationId, services }): Promise<OrganizationBillingPage> => {
    const billing = await organizationBilling(scope.client, organizationId);
    if (billing === null) {
      throw new NotFoundError();
    }
    const view = billingView(billing);
    return {
      billing: view,
      paymentMethod: await paymentMethodOnFile(billingServices(services), organizationId),
      catalog: catalogView(planCatalog()),
      provider: services.billing.kind,
      publishableKey: services.billing.publishableKey,
      standing: accountStanding(view),
      testRouting: SIMULATOR_TEST_ROUTING,
    };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }) },
});

/** Stripe Elements' SetupIntent for ACH or a card: its client secret goes to the browser, nothing comes back here. */
export const setupIntentHandler = organizationRoute({
  id: 'settings.billing.setup_intent',
  kind: 'handler',
  method: 'POST',
  path: '/api/billing/[organizationId]/setup-intent',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  input: z.object({}),
  audit: { action: 'billing_payment_method_setup', objectType: 'organization' },
  handle: async ({ scope, organizationId, services, input: _input, request }) => {
    await assertManagesBilling(scope.client, organizationId);
    const intent = await asInput('input', () => startPaymentMethodSetup(billingServices(services), organizationId, requestKeyOf(request)));
    return { objectId: organizationId, clientSecret: intent.clientSecret, publishableKey: services.billing.publishableKey };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: () => ({}) },
});

const digits = (length: number, message: string) => z.string().trim().regex(new RegExp(`^\\d{${String(length)}}$`), message);

/** The local simulator's form: one of its test accounts or cards (never a real number; the simulator refuses any other). */
export const simulatedPaymentMethodAction = organizationRoute({
  id: 'settings.billing.simulate_payment_method',
  kind: 'action',
  path: '/settings/billing/[organizationId]',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  input: z.discriminatedUnion('method', [
    z.object({ method: z.literal('us_bank_account'), routingNumber: digits(9, 'enter the nine digits of the routing number'), accountNumber: z.string().trim().regex(/^\d{4,17}$/, 'enter the account number, 4 to 17 digits') }),
    z.object({ method: z.literal('card'), cardNumber: digits(16, 'enter the sixteen digits of the card number') }),
  ]),
  audit: { action: 'billing_payment_method_added', objectType: 'organization' },
  handle: async ({ scope, organizationId, services, input, request }): Promise<MutationResult> => {
    await assertManagesBilling(scope.client, organizationId);
    const simulator = simulatorOf(services);
    await asInput('method', async () => {
      const key = requestKeyOf(request);
      const intent = await startPaymentMethodSetup(billingServices(services), organizationId, key);
      const details =
        input.method === 'card' ? { kind: 'card' as const, number: input.cardNumber } : { kind: 'us_bank_account' as const, routingNumber: input.routingNumber, accountNumber: input.accountNumber };
      await simulator.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details, idempotencyKey: `confirm:${key}` });
    });
    return { objectId: organizationId, redirect: `/settings/billing/${organizationId}` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: () => ({ method: 'card', cardNumber: '4242424242424242' }) },
});

export const choosePlanAction = organizationRoute({
  id: 'settings.billing.choose_plan',
  kind: 'action',
  path: '/settings/billing/[organizationId]',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  input: z.object({ plan: z.enum(['monthly', 'annual']) }),
  audit: { action: 'billing_plan_chosen', objectType: 'organization' },
  handle: async ({ scope, organizationId, services, input, request }): Promise<MutationResult> => {
    await assertManagesBilling(scope.client, organizationId);
    await asInput('plan', () => subscribe(billingServices(services), organizationId, input.plan, requestKeyOf(request)));
    return { objectId: organizationId, redirect: `/settings/billing/${organizationId}` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: () => ({ plan: 'monthly' }) },
});

export const payInvoiceAction = organizationRoute({
  id: 'settings.billing.pay_invoice',
  kind: 'action',
  path: '/settings/billing/[organizationId]',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  input: z.object({ invoiceId: opaqueId }),
  audit: { action: 'billing_invoice_payment_retried', objectType: 'invoice' },
  handle: async ({ scope, organizationId, services, input, request }): Promise<MutationResult> => {
    await assertManagesBilling(scope.client, organizationId);
    await asInput('invoiceId', () => payOpenInvoice(billingServices(services), organizationId, input.invoiceId, requestKeyOf(request)));
    return { objectId: input.invoiceId, redirect: `/settings/billing/${organizationId}` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: (refs) => ({ invoiceId: refs.billingInvoiceId }) },
});

/** Test mode only: settles the simulator's ACH debits in flight now, as their test accounts say. */
export const simulateSettlementAction = organizationRoute({
  id: 'settings.billing.simulate_settlement',
  kind: 'action',
  path: '/settings/billing/[organizationId]',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  input: z.object({}),
  audit: { action: 'billing_simulator_settled', objectType: 'organization' },
  handle: async ({ scope, organizationId, services }): Promise<MutationResult> => {
    await assertManagesBilling(scope.client, organizationId);
    await simulatorOf(services).settle();
    return { objectId: organizationId, redirect: `/settings/billing/${organizationId}` };
  },
  sample: { params: (refs) => ({ organizationId: refs.organizationId }), input: () => ({}) },
});

/** The most a webhook body may be. */
export const WEBHOOK_MAX_BYTES = 1_000_000;

/**
 * Stripe's webhook (and the simulator's, over HTTP): public, verified by its signature before anything in
 * it is read, recorded once by its event ID, applied as tp_billing. A signature that does not verify is a
 * 400 and records nothing; a repeated delivery is a 200 that changes nothing.
 */
export const billingWebhook = publicRoute({
  id: 'billing.webhook',
  kind: 'handler',
  method: 'POST',
  path: '/api/billing/webhook',
  rateLimit: 'webhook',
  signedBySender: true,
  phi: false,
  params: z.object({}),
  input: z.object({ payload: z.string().min(1).max(WEBHOOK_MAX_BYTES), signature: z.string().max(2048).nullable() }),
  handle: async ({ input, services, request }) => {
    try {
      const applied = await receiveWebhook(billingServices(services), { payload: input.payload, signature: input.signature, requestId: request.requestId });
      return { received: true, outcome: applied.outcome };
    } catch (error) {
      if (error instanceof WebhookSignatureError || error instanceof BillingEventError) {
        throw new InputError([{ field: 'signature', message: 'the webhook did not verify, so nothing in it was read' }]);
      }
      throw error;
    }
  },
  sample: { params: () => ({}), input: () => ({ payload: '{"id":"evt_unsigned","object":"event","type":"invoice.paid","created":1,"data":{"object":{}}}', signature: 't=1,v1=00' }) },
});

export const consoleBillingPage = platformRoute({
  id: 'console.billing',
  kind: 'page',
  path: '/console/billing',
  phi: false,
  permission: 'billing.manage',
  params: z.object({}),
  // Ordered by the one standing, PaidWhole's suspensions first; within one, as billing ordered them (a stable sort).
  handle: async ({ scope }): Promise<{ readonly organizations: readonly ConsoleBillingView[]; readonly catalog: CatalogView }> => ({
    organizations: (await consoleBillingStatus(scope.client))
      .map((row) => ({ ...row, openCents: row.openCents.toString(), standingKind: standingKind(row.status, row.standing, row.kind) }))
      .sort((a, b) => STANDING_ORDER.indexOf(a.standingKind) - STANDING_ORDER.indexOf(b.standingKind)),
    catalog: catalogView(planCatalog()),
  }),
  sample: { params: () => ({}) },
});

/** An audit invoice (PRD 5, J18: "audit invoices in Stripe"), charged to the organization's method on file. */
export const issueAuditInvoiceAction = platformRoute({
  id: 'console.billing.audit_invoice',
  kind: 'action',
  path: '/console/billing',
  phi: false,
  permission: 'billing.manage',
  params: z.object({}),
  input: z.object({ organizationId: opaqueId }),
  audit: { action: 'billing_audit_invoice_issued', objectType: 'organization' },
  handle: async ({ input, services, request }): Promise<MutationResult> => {
    await asInput('organizationId', () => issueAuditInvoice(billingServices(services), input.organizationId, requestKeyOf(request)));
    return { objectId: input.organizationId, redirect: '/console/billing' };
  },
  sample: { params: () => ({}), input: (refs) => ({ organizationId: refs.organizationId }) },
});

export const BILLING_ROUTES = [
  billingSettingsPage,
  organizationBillingPage,
  setupIntentHandler,
  simulatedPaymentMethodAction,
  choosePlanAction,
  payInvoiceAction,
  simulateSettlementAction,
  billingWebhook,
  consoleBillingPage,
  issueAuditInvoiceAction,
] as const;
