import { BillingEventError, BillingProviderError, type CatalogPrice, type PaymentMethodSummary, type PlanCatalog, type PlanPrice, WebhookSignatureError, planCatalog } from '@tp/billing';
import { LocalBillingProvider, SIMULATOR_TEST_ROUTING } from '@tp/billing/local';
import { type ScopeClient, rolesPermit } from '@tp/db/runtime';
import type { Cents } from '@tp/money';
import {
  type BillingServices,
  BillingRefusedError,
  type ConsoleBillingRow,
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
 *   page (/settings/billing/<organization>): its plan, its payment method (ACH or card, collected by Stripe
 *   Elements, or by the local simulator's form in development), its invoices, its standing and any
 *   suspension. Organization routes: the organization's administrator (organization.billing), checked here
 *   and again by the database; no practice is in scope, so nothing here can show PHI.
 * - The webhook (/api/billing/webhook): public, verified by Stripe's signature, recorded once by event ID.
 * - The console's billing status per organization (/console/billing), and an audit invoice issued from it
 *   (billing.manage).
 *
 * What a person asks for happens at Stripe; what Stripe then reports arrives by webhook.
 */

const organizationParams = z.object({ organizationId: opaqueId });

function billingServices(services: Services): BillingServices {
  return { pool: services.pool, provider: services.billing };
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

export interface BillingView extends Omit<OrganizationBilling, 'invoices'> {
  readonly invoices: readonly InvoiceRow[];
}

export interface CatalogView {
  readonly confirmed: boolean;
  readonly plans: { readonly monthly: CentsText<PlanPrice>; readonly annual: CentsText<PlanPrice> };
  readonly audit: CentsText<CatalogPrice>;
}

export type ConsoleBillingView = CentsText<ConsoleBillingRow>;

function billingView(billing: OrganizationBilling): BillingView {
  return {
    ...billing,
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
  /** Why new runs are refused for the organization's practices, or null. */
  readonly suspension: string | null;
  readonly testRouting: string;
}

/** The standing as a sentence for the page, from the record's status and billing's view. */
export function suspensionNotice(billing: Pick<OrganizationBilling, 'status' | 'standing'>): string | null {
  if (billing.status === 'suspended') {
    return 'A platform administrator has suspended the organization: its data stays readable, and new runs start again once it is reinstated.';
  }
  if (billing.status === 'closed') {
    return 'The organization is closed: its data stays readable, and no new run starts.';
  }
  if (billing.standing === 'suspended') {
    return 'New runs have stopped because an invoice has been unpaid for 30 days since its payment failed. Your data stays readable; runs start again as soon as it is paid.';
  }
  return null;
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
    return {
      billing: billingView(billing),
      paymentMethod: await paymentMethodOnFile(billingServices(services), organizationId),
      catalog: catalogView(planCatalog()),
      provider: services.billing.kind,
      publishableKey: services.billing.publishableKey,
      suspension: suspensionNotice(billing),
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

const digits = (length: number, label: string) => z.string().trim().regex(new RegExp(`^\\d{${String(length)}}$`), label);

/** The local simulator's form: one of its test accounts or cards (never a real number; the simulator refuses any other). */
export const simulatedPaymentMethodAction = organizationRoute({
  id: 'settings.billing.simulate_payment_method',
  kind: 'action',
  path: '/settings/billing/[organizationId]',
  phi: false,
  permission: 'organization.billing',
  params: organizationParams,
  input: z.discriminatedUnion('method', [
    z.object({ method: z.literal('us_bank_account'), routingNumber: digits(9, 'a nine-digit routing number'), accountNumber: z.string().trim().regex(/^\d{4,17}$/, 'an account number') }),
    z.object({ method: z.literal('card'), cardNumber: digits(16, 'a sixteen-digit card number') }),
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
      const applied = await receiveWebhook({ pool: services.pool, provider: services.billing }, { payload: input.payload, signature: input.signature, requestId: request.requestId });
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
  handle: async ({ scope }): Promise<{ readonly organizations: readonly ConsoleBillingView[]; readonly catalog: CatalogView }> => ({
    organizations: (await consoleBillingStatus(scope.client)).map((row) => ({ ...row, openCents: row.openCents.toString() })),
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
