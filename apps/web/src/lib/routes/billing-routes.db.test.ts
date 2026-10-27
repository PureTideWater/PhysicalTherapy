import { randomBytes, randomUUID } from 'node:crypto';

import { signPayload } from '@tp/billing';
import { LocalBillingProvider, MemorySimulatorStore, SIMULATOR_TEST_ROUTING } from '@tp/billing/local';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { routeHandler } from '../http/handler';
import { practiceRoute } from '../http/invoke';
import type { CookieJar, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import {
  WEBHOOK_MAX_BYTES,
  billingSettingsPage,
  billingWebhook,
  choosePlanAction,
  consoleBillingPage,
  issueAuditInvoiceAction,
  organizationBillingPage,
  payInvoiceAction,
  setupIntentHandler,
  simulateSettlementAction,
  simulatedPaymentMethodAction,
} from './billing';
import { practiceHome } from './practice';
import { pricingRunsPage } from './pricing';
import { requestUploads, uploadsPage } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * Billing's routes against PostgreSQL and the local Stripe test-mode simulator (PRD 5, J18; PRD 6, Billing
 * acceptance: "A test ACH payment completes; a suspended organization can read but not run"; docs/adr/0050).
 * The simulator's events reach the webhook route the way Stripe's do, through the route handler: the body as
 * sent and its Stripe-Signature header. Who may use each route is route-tests/define.ts's; this is what the
 * routes do.
 */

const SECRET = 'whsec_synthetic_billing_routes_test';

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let billingPool: DatabasePool;
let esignPool: DatabasePool;
let services: Services;
let simulator: LocalBillingProvider;
const deliveries: { status: number; body: unknown }[] = [];

const webhook = routeHandler(billingWebhook, () => services, { rawBody: { signatureHeader: 'stripe-signature', maxBytes: WEBHOOK_MAX_BYTES } });

function post(payload: string, signature: string | null): Promise<Response> {
  return webhook(
    new Request('http://localhost:3100/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature === null ? {} : { 'stripe-signature': signature }) },
      body: payload,
    }),
  );
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  billingPool = openPool(database.billingUrl, 4);
  esignPool = openPool(database.esignUrl, 2);
  const sealer = new Sealer(randomBytes(32));
  simulator = new LocalBillingProvider({
    webhookSecret: SECRET,
    store: new MemorySimulatorStore(),
    deliver: async (payload, signature) => {
      const response = await post(payload, signature);
      deliveries.push({ status: response.status, body: await response.json() });
      if (response.status !== 200) {
        throw new Error(`the webhook route answered ${String(response.status)}`);
      }
    },
  });
  services = createServices({
    origin: 'http://localhost:3100',
    pool: app,
    billingPool,
    esignPool,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: () => undefined }),
    billing: simulator,
  });
});

afterAll(async () => {
  await endPool(app);
  await endPool(billingPool);
  await endPool(esignPool);
  await owner.end();
  await database.drop();
});

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(token: string) {
    this.values.set(SESSION_COOKIE, token);
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

const tokens = new Map<string, string>();
async function sessionOf(userId: string, method: 'totp' | 'webauthn' = 'totp'): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(app, { userId, method, deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

async function rows<T>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await owner.query(text, values)).rows as T[];
}

const ACH = { method: 'us_bank_account', routingNumber: SIMULATOR_TEST_ROUTING, accountNumber: '000123456789' };
const DECLINED_CARD = { method: 'card', cardNumber: '4000000000000341' };
const GOOD_CARD = { method: 'card', cardNumber: '4242424242424242' };

/** An open invoice whose payment failed `days` ago, as Stripe's events would have left it. */
async function failedInvoice(world: TenantWorld, days: number, number: string | null = null): Promise<string> {
  const [customer] = await rows<{ ref: string | null }>('SELECT billing_customer_ref AS ref FROM organization WHERE id = $1', [world.organizationId]);
  const ref = customer?.ref ?? `cus_hand${randomBytes(6).toString('hex')}`;
  if (customer?.ref === null) {
    await owner.query('UPDATE organization SET billing_customer_ref = $2 WHERE id = $1', [world.organizationId, ref]);
  }
  const [invoice] = await rows<{ id: string }>(
    `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, number, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents,
       attempt_count, first_failed_at, last_failure_code, stripe_event_at)
     VALUES ($1, $2, $3, $5, 'audit', 'open', 'usd', 250000, 0, 250000, 1, now() - make_interval(days => $4), 'insufficient_funds', now() - make_interval(days => $4)) RETURNING id`,
    [world.organizationId, `in_hand${randomBytes(6).toString('hex')}`, ref, days, number],
  );
  return invoice?.id ?? '';
}

describe('Settings, billing (J18)', () => {
  it('completes a test ACH payment through the routes: the bank account, the monthly plan, the settlement, the paid invoice', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING ROUTES');
    const admin = world.adminUserId;
    expect(ok(await call(billingSettingsPage, admin, {})).organizations).toEqual([{ organizationId: world.organizationId, name: expect.any(String) as string, kind: 'group' }]);

    const before = ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId }));
    expect(before).toMatchObject({
      provider: 'local',
      paymentMethod: null,
      standing: { kind: 'good', label: 'In good standing', notice: null },
      billing: { standing: 'good', holdingInvoice: null, subscription: null, invoices: [] },
      testRouting: SIMULATOR_TEST_ROUTING,
    });
    // A plan needs a payment method first.
    expect(await call(choosePlanAction, admin, { organizationId: world.organizationId }, { plan: 'monthly' })).toMatchObject({ status: 'invalid' });

    expect(ok(await call(simulatedPaymentMethodAction, admin, { organizationId: world.organizationId }, ACH))).toEqual({ objectId: world.organizationId, redirect: `/settings/billing/${world.organizationId}` });
    expect(ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId })).paymentMethod).toMatchObject({ kind: 'us_bank_account', last4: '6789' });
    // Only test values: the simulator refuses any other account.
    expect(await call(simulatedPaymentMethodAction, admin, { organizationId: world.organizationId }, { ...ACH, accountNumber: '000999888777' })).toMatchObject({ status: 'invalid' });

    ok(await call(choosePlanAction, admin, { organizationId: world.organizationId }, { plan: 'monthly' }));
    const pending = ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId }));
    expect(pending.billing.subscription).toMatchObject({ plan: 'monthly' });
    expect(pending.billing.invoices).toMatchObject([{ kind: 'subscription', status: 'open', amountDueCents: pending.catalog.plans.monthly.amountCents, amountPaidCents: '0' }]);
    // One plan at a time.
    expect(await call(choosePlanAction, admin, { organizationId: world.organizationId }, { plan: 'annual' })).toMatchObject({ status: 'invalid', issues: [{ field: 'plan' }] });

    ok(await call(simulateSettlementAction, admin, { organizationId: world.organizationId }, {}));
    const paid = ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId }));
    expect(paid.billing).toMatchObject({ standing: 'good', subscription: { plan: 'monthly', status: 'active' } });
    expect(paid.billing.invoices).toMatchObject([{ status: 'paid', amountPaidCents: paid.catalog.plans.monthly.amountCents, amountRemainingCents: '0', paymentMethodKind: 'us_bank_account', firstFailedAt: null }]);
    // Every event reached the webhook route signed, and was applied there.
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((delivery) => delivery.status === 200)).toBe(true);

    // Each change was audited by its route, on the organization and no practice.
    const audited = await rows<{ action: string; practice_id: string | null }>("SELECT action, practice_id FROM audit_event WHERE action LIKE 'billing_%' AND object_id = $1 ORDER BY at", [world.organizationId]);
    expect(audited.map((row) => row.action)).toEqual(expect.arrayContaining(['billing_payment_method_added', 'billing_plan_chosen', 'billing_simulator_settled']));
    expect(audited.every((row) => row.practice_id === null)).toBe(true);

    // A viewer of the same group neither sees the organization in Settings nor manages its billing.
    const viewer = await createUser(owner);
    await addMembership(owner, world.organizationId, viewer, 'viewer');
    expect(ok(await call(billingSettingsPage, viewer, {})).organizations).toEqual([]);
    expect((await call(organizationBillingPage, viewer, { organizationId: world.organizationId })).status).toBe('forbidden');
    expect((await call(choosePlanAction, viewer, { organizationId: world.organizationId }, { plan: 'annual' })).status).toBe('forbidden');
  });

  it('starts Stripe Elements’ setup with a client secret, and creates one customer however often it is asked', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING ELEMENTS');
    const first = ok(await call(setupIntentHandler, world.adminUserId, { organizationId: world.organizationId }, {}));
    const second = ok(await call(setupIntentHandler, world.adminUserId, { organizationId: world.organizationId }, {}));
    expect(first.clientSecret).toMatch(/^seti_sim\w+_secret_\w+$/);
    expect(second.clientSecret).not.toBe(first.clientSecret);
    const customers = await rows<{ ref: string | null }>('SELECT billing_customer_ref AS ref FROM organization WHERE id = $1', [world.organizationId]);
    expect(customers).toEqual([{ ref: expect.stringMatching(/^cus_sim/) as string }]);
  });

  it('retries a failed audit invoice from Settings once a working card is on file', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING RETRY');
    const platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, await createOrganization(owner, 'internal'), platformAdmin, 'platform_admin');
    tokens.set(platformAdmin, (await openSession(app, { userId: platformAdmin, method: 'webauthn', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken);

    ok(await call(simulatedPaymentMethodAction, world.adminUserId, { organizationId: world.organizationId }, DECLINED_CARD));
    ok(await call(issueAuditInvoiceAction, platformAdmin, {}, { organizationId: world.organizationId }));
    const failed = ok(await call(organizationBillingPage, world.adminUserId, { organizationId: world.organizationId }));
    expect(failed.billing).toMatchObject({ standing: 'past_due', pastDueSince: expect.any(Date) as Date, invoices: [{ kind: 'audit', status: 'open', amountDueCents: failed.catalog.audit.amountCents, lastFailureCode: 'card_declined' }] });
    const invoiceId = failed.billing.invoices[0]?.id ?? '';

    // The console lists it past due, with what is open.
    const console = ok(await call(consoleBillingPage, platformAdmin, {}));
    expect(console.organizations.find((row) => row.organizationId === world.organizationId)).toMatchObject({ standing: 'past_due', openCents: failed.catalog.audit.amountCents });

    // Still declined: the form says so with the provider's code, never a number.
    expect(await call(payInvoiceAction, world.adminUserId, { organizationId: world.organizationId }, { invoiceId })).toMatchObject({ status: 'invalid', issues: [{ field: 'invoiceId' }] });
    ok(await call(simulatedPaymentMethodAction, world.adminUserId, { organizationId: world.organizationId }, GOOD_CARD));
    ok(await call(payInvoiceAction, world.adminUserId, { organizationId: world.organizationId }, { invoiceId }));
    const settled = ok(await call(organizationBillingPage, world.adminUserId, { organizationId: world.organizationId }));
    expect(settled.billing).toMatchObject({ standing: 'good', invoices: [{ id: invoiceId, status: 'paid', paymentMethodKind: 'card' }] });
    // Another organization's invoice is not this one's to pay.
    const other = await createTenantWorld(owner, 'SYNTHETIC BILLING OTHER');
    const foreign = await failedInvoice(other, 1);
    expect(await call(payInvoiceAction, world.adminUserId, { organizationId: world.organizationId }, { invoiceId: foreign })).toMatchObject({ status: 'invalid' });
  });

  it('never refuses a card for the annual plan or an audit, and charges the next invoice to a bank account once one is added (BIL-04; docs/adr/0073)', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING CARD THEN BANK');
    const admin = world.adminUserId;
    const organizationId = world.organizationId;
    const platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, await createOrganization(owner, 'internal'), platformAdmin, 'platform_admin');
    tokens.set(platformAdmin, (await openSession(app, { userId: platformAdmin, method: 'webauthn', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken);

    // Only a card on file: the annual plan is taken and its invoice paid by the card at once.
    ok(await call(simulatedPaymentMethodAction, admin, { organizationId }, GOOD_CARD));
    expect(ok(await call(organizationBillingPage, admin, { organizationId })).paymentMethod).toMatchObject({ kind: 'card', last4: '4242' });
    ok(await call(choosePlanAction, admin, { organizationId }, { plan: 'annual' }));
    const annual = ok(await call(organizationBillingPage, admin, { organizationId }));
    expect(annual.billing).toMatchObject({ standing: 'good', subscription: { plan: 'annual', status: 'active' } });
    expect(annual.billing.invoices).toMatchObject([{ kind: 'subscription', status: 'paid', amountPaidCents: annual.catalog.plans.annual.amountCents, paymentMethodKind: 'card' }]);

    // An audit invoice issued to it is paid by the card too. (Invoices issued within the same second have no
    // order between them, so each is found by what it is.)
    ok(await call(issueAuditInvoiceAction, platformAdmin, {}, { organizationId }));
    const audited = ok(await call(organizationBillingPage, admin, { organizationId }));
    expect(audited.billing.invoices).toHaveLength(2);
    expect(audited.billing.invoices.find((invoice) => invoice.kind === 'audit')).toMatchObject({ status: 'paid', amountPaidCents: audited.catalog.audit.amountCents, paymentMethodKind: 'card' });
    const byCard = audited.billing.invoices.map((invoice) => invoice.id);

    // A bank account added replaces the card on file, and the next invoice is debited from it, not the card.
    ok(await call(simulatedPaymentMethodAction, admin, { organizationId }, ACH));
    expect(ok(await call(organizationBillingPage, admin, { organizationId })).paymentMethod).toMatchObject({ kind: 'us_bank_account', last4: '6789' });
    ok(await call(issueAuditInvoiceAction, platformAdmin, {}, { organizationId }));
    const debiting = ok(await call(organizationBillingPage, admin, { organizationId }));
    expect(debiting.billing.invoices).toHaveLength(3);
    const next = debiting.billing.invoices.find((invoice) => !byCard.includes(invoice.id));
    // The debit has started and the bank has not settled it; the card was not charged.
    expect(next).toMatchObject({ kind: 'audit', status: 'open', amountPaidCents: '0', firstFailedAt: null });
    ok(await call(simulateSettlementAction, admin, { organizationId }, {}));
    const settled = ok(await call(organizationBillingPage, admin, { organizationId }));
    expect(settled.billing).toMatchObject({ standing: 'good' });
    expect(settled.billing.invoices.find((invoice) => invoice.id === next?.id)).toMatchObject({
      kind: 'audit',
      status: 'paid',
      amountPaidCents: settled.catalog.audit.amountCents,
      amountRemainingCents: '0',
      paymentMethodKind: 'us_bank_account',
    });
    // The invoices the card paid stay the card's.
    expect(settled.billing.invoices.filter((invoice) => byCard.includes(invoice.id)).map((invoice) => [invoice.status, invoice.paymentMethodKind])).toEqual([
      ['paid', 'card'],
      ['paid', 'card'],
    ]);
  });
});

describe('the webhook route', () => {
  it('reads the body as sent, refuses what its signature does not cover, and records each event once', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING WEBHOOK');
    ok(await call(setupIntentHandler, world.adminUserId, { organizationId: world.organizationId }, {}));
    const [customer] = await rows<{ ref: string }>('SELECT billing_customer_ref AS ref FROM organization WHERE id = $1', [world.organizationId]);
    const eventId = `evt_hand${randomBytes(8).toString('hex')}`;
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      type: 'invoice.finalized',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `in_hand${randomBytes(6).toString('hex')}`,
          object: 'invoice',
          customer: customer?.ref,
          number: 'HAND-0001',
          status: 'open',
          currency: 'usd',
          amount_due: 250000,
          amount_paid: 0,
          amount_remaining: 250000,
          attempt_count: 0,
          metadata: { tp_kind: 'audit' },
          status_transitions: { paid_at: null },
          parent: null,
        },
      },
    });
    const signature = signPayload(SECRET, payload);
    const recorded = async () => rows<{ outcome: string }>('SELECT outcome FROM billing_event WHERE stripe_event_id = $1', [eventId]);

    // Unsigned, signed with another secret, or altered after signing: a 400, and nothing recorded.
    for (const [body, header] of [
      [payload, null],
      [payload, signPayload('whsec_someone_else_entirely', payload)],
      [payload.replace('250000', '250001'), signature],
    ] as const) {
      const response = await post(body, header);
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(JSON.stringify(await response.json())).not.toContain(customer?.ref ?? 'cus_');
    }
    expect(await recorded()).toEqual([]);

    const first = await post(payload, signature);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: 'applied' });
    const again = await post(payload, signature);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ received: true, outcome: 'duplicate' });
    expect(await recorded()).toEqual([{ outcome: 'applied' }]);
    expect(await rows('SELECT status FROM invoice WHERE organization_id = $1', [world.organizationId])).toEqual([{ status: 'open' }]);

    // A body past the limit is refused as too large, before it is read whole or its signature is checked (docs/adr/0055).
    const big = await post(`{"pad":"${'x'.repeat(WEBHOOK_MAX_BYTES)}"}`, signature);
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ status: 'invalid', issues: [{ field: 'payload', message: 'the body is too large' }] });
    expect(await recorded()).toEqual([{ outcome: 'applied' }]);
  });
});

/** A route that records an upload without the wrapper's check, so only the database's refusal stands in its way. */
const uncheckedUpload = practiceRoute({
  id: 'test.unchecked_upload',
  kind: 'action',
  path: '/p/[practiceId]/test',
  phi: false,
  permission: 'file.upload',
  params: z.object({ practiceId: z.string() }),
  input: z.object({}),
  audit: { action: 'upload_batch_requested', objectType: 'source_document' },
  handle: async ({ scope, practiceId, actor }) => {
    await scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', 10, 'application/octet-stream', $3)", [
      randomUUID(),
      practiceId,
      actor.userId,
    ]);
    return {};
  },
});

describe('a suspended organization (PRD 6: it can read but not run)', () => {
  it('refuses new work with the reason, keeps every screen readable, and starts again once the invoice is paid', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING SUSPENDED');
    const P = { practiceId: world.practiceId };
    const admin = world.adminUserId;
    // Who uploads: the group's billing manager (a practice administrator does not upload files).
    const uploader = await createUser(owner);
    await addMembership(owner, world.organizationId, uploader, 'billing_manager');
    // Twenty-nine days after the failure: past due, still running.
    const invoiceId = await failedInvoice(world, 29);
    expect(ok(await call(practiceHome, admin, P)).suspension).toBeNull();
    expect((await call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] })).status).toBe('ok');

    const suspendedInvoice = await failedInvoice(world, 31, 'SIM-HAND-0031');
    const documents = async () => (await rows<{ n: string }>('SELECT count(*)::text AS n FROM source_document WHERE practice_id = $1', [world.practiceId]))[0]?.n;
    const before = await documents();

    const home = ok(await call(practiceHome, admin, P));
    expect(home.suspension).toMatch(/suspended for nonpayment.*data stays readable/);
    expect(ok(await call(uploadsPage, admin, P)).gate).toEqual({ open: false, reason: expect.stringMatching(/^Uploads are paused: the organization is suspended for nonpayment/) as string });
    expect((await call(pricingRunsPage, admin, P)).status).toBe('ok');
    // The billing page dates the suspension from billing and names the invoice holding it (BIL-05).
    const billingPage = ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId }));
    expect(billingPage.billing.holdingInvoice).toEqual({ id: suspendedInvoice, number: 'SIM-HAND-0031', amountRemainingCents: '250000' });
    expect(billingPage.standing).toMatchObject({
      kind: 'suspended_nonpayment',
      label: expect.stringMatching(/^Suspended for nonpayment since \d{4}-\d{2}-\d{2}$/) as string,
      title: 'New runs have stopped',
      billingHold: null,
      nextSteps: [{ action: 'Pay SIM-HAND-0031', href: `#pay-${suspendedInvoice}` }, { action: 'Open a support ticket', href: '/support?from=billing' }],
    });

    // The wrapper refuses with the database's reason; over HTTP, a 402.
    const refused = await call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] });
    expect(refused).toEqual({ status: 'suspended', reason: expect.stringMatching(/^the organization is suspended for nonpayment/) as string });
    const response = await routeHandler(requestUploads, () => services)(
      new Request(`http://localhost:3100/p/${world.practiceId}/uploads/request`, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${await sessionOf(uploader)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(uploader)), files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] }),
      }),
      { params: Promise.resolve(P) },
    );
    expect(response.status).toBe(402);
    // Past the wrapper, the database refuses the same work, and the outcome is the same.
    expect(await call(uncheckedUpload, uploader, P, {})).toEqual({ status: 'suspended', reason: expect.stringMatching(/^the organization is suspended for nonpayment/) as string });
    expect(await documents()).toBe(before);

    // Paid (here, as Stripe's invoice.paid would leave it): runs start again at once, nothing to reinstate by hand.
    await owner.query("UPDATE invoice SET status = 'paid', paid_at = now(), amount_paid_cents = amount_due_cents, amount_remaining_cents = 0 WHERE id = ANY ($1::uuid[])", [[invoiceId, suspendedInvoice]]);
    expect(ok(await call(practiceHome, admin, P)).suspension).toBeNull();
    expect((await call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] })).status).toBe('ok');
    const reinstated = ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId }));
    expect(reinstated.billing).toMatchObject({ standing: 'good', holdingInvoice: null });
    expect(reinstated.standing).toMatchObject({ kind: 'good', label: 'In good standing', notice: null, nextSteps: [] });
  });

  it('names the invoice holding the organization suspended even when it is older than the newest 24 (BIL-05)', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING OLD HOLD');
    const holding = await failedInvoice(world, 45, 'SIM-HAND-0045');
    await owner.query("UPDATE invoice SET created_at = now() - interval '45 days' WHERE id = $1", [holding]);
    const [customer] = await rows<{ ref: string }>('SELECT billing_customer_ref AS ref FROM organization WHERE id = $1', [world.organizationId]);
    for (let index = 0; index < 24; index += 1) {
      await owner.query(
        `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents, attempt_count, paid_at, stripe_event_at)
         VALUES ($1, $2, $3, 'audit', 'paid', 'usd', 1000, 1000, 0, 1, now(), now())`,
        [world.organizationId, `in_hand${randomBytes(6).toString('hex')}`, customer?.ref],
      );
    }
    const page = ok(await call(organizationBillingPage, world.adminUserId, { organizationId: world.organizationId }));
    expect(page.billing.invoices).toHaveLength(24);
    expect(page.billing.invoices.some((invoice) => invoice.id === holding)).toBe(false);
    expect(page.billing.holdingInvoice).toEqual({ id: holding, number: 'SIM-HAND-0045', amountRemainingCents: '250000' });
    expect(page.standing.nextSteps[0]).toMatchObject({ action: 'Pay SIM-HAND-0045', href: `#pay-${holding}` });
  });

  it('with two invoices unpaid for 30 days, paying the holding one keeps runs refused and the standing names the second (BIL-05)', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING TWO HOLDS');
    const P = { practiceId: world.practiceId };
    const uploader = await createUser(owner);
    await addMembership(owner, world.organizationId, uploader, 'billing_manager');
    const older = await failedInvoice(world, 45, 'SIM-HAND-0045');
    const newer = await failedInvoice(world, 31, 'SIM-HAND-0031');
    const upload = async () => call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] });

    const before = ok(await call(organizationBillingPage, world.adminUserId, { organizationId: world.organizationId }));
    expect(before.billing).toMatchObject({ standing: 'suspended', holdingCount: 2, holdingInvoice: { id: older, number: 'SIM-HAND-0045' } });
    expect(before.standing.notice).toBe('New runs have stopped because 2 invoices have been unpaid for 30 days since their payments failed; your data stays readable.');
    expect(before.standing.nextSteps[0]).toMatchObject({ action: 'Pay SIM-HAND-0045', href: `#pay-${older}`, detail: expect.stringMatching(/^ and the other invoice unpaid for 30 days below\. Runs restart once all of them are paid/) as string });
    expect(JSON.stringify(before.standing)).not.toContain('A card payment restarts runs at once');

    // Paying the holding invoice moves billing's hold to the second, and the database still refuses new work.
    await owner.query("UPDATE invoice SET status = 'paid', paid_at = now(), amount_paid_cents = amount_due_cents, amount_remaining_cents = 0 WHERE id = $1", [older]);
    expect(await upload()).toEqual({ status: 'suspended', reason: expect.stringMatching(/^the organization is suspended for nonpayment/) as string });
    const after = ok(await call(organizationBillingPage, world.adminUserId, { organizationId: world.organizationId }));
    expect(after.billing).toMatchObject({ standing: 'suspended', holdingCount: 1, holdingInvoice: { id: newer, number: 'SIM-HAND-0031' } });
    expect(after.standing).toMatchObject({ kind: 'suspended_nonpayment', nextSteps: [{ action: 'Pay SIM-HAND-0031', href: `#pay-${newer}` }, { action: 'Open a support ticket' }] });
    expect(after.standing.nextSteps[0]?.detail).toMatch(/^ below\. A card payment restarts runs at once/);
  });

  it('refuses new work while a platform administrator holds the organization suspended', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING HELD');
    const uploader = await createUser(owner);
    await addMembership(owner, world.organizationId, uploader, 'billing_manager');
    await owner.query("UPDATE organization SET status = 'suspended' WHERE id = $1", [world.organizationId]);
    const P = { practiceId: world.practiceId };
    expect(await call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] })).toEqual({
      status: 'suspended',
      reason: expect.stringMatching(/^the organization is suspended: its data stays readable/) as string,
    });
    expect((await call(pricingRunsPage, world.adminUserId, P)).status).toBe('ok');

    // Its billing page never reads "In good standing": "Suspended by PaidWhole", the notice, the ticket's link and the
    // note that a plan or payment method does not reinstate it (BIL-05, BIL-06).
    const organizationId = world.organizationId;
    const held = ok(await call(organizationBillingPage, world.adminUserId, { organizationId }));
    expect(held.billing).toMatchObject({ status: 'suspended', standing: 'good', holdingInvoice: null });
    expect(held).not.toHaveProperty('suspension');
    expect(held.standing).toEqual({
      kind: 'suspended_by_paidwhole',
      label: 'Suspended by PaidWhole',
      tone: 'danger',
      title: 'New runs have stopped',
      notice: 'PaidWhole has suspended the organization: new runs have stopped until PaidWhole reinstates it, and its data stays readable. Paying an invoice does not reinstate it.',
      alert: true,
      nextSteps: [{ action: 'Open a support ticket', href: '/support?from=billing', detail: ' to find out why and what reinstates it.' }],
      billingHold: null,
      formsNote: 'Changing the plan or payment method does not reinstate an organization suspended by PaidWhole.',
      planRefusal: null,
    });

    // The console reads it the same way, and lists it before every organization in good standing.
    const platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, await createOrganization(owner, 'internal'), platformAdmin, 'platform_admin');
    tokens.set(platformAdmin, (await openSession(app, { userId: platformAdmin, method: 'webauthn', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken);
    const listed = ok(await call(consoleBillingPage, platformAdmin, {})).organizations;
    const heldAt = listed.findIndex((row) => row.organizationId === organizationId);
    expect(listed[heldAt]).toMatchObject({ status: 'suspended', standing: 'good', standingKind: 'suspended_by_paidwhole' });
    expect(listed.findIndex((row) => row.standingKind === 'good')).toBeGreaterThan(heldAt);

    // Suspended by PaidWhole and an invoice unpaid for 31 days: both holds are named, and paying is the second step,
    // since reinstating alone restarts nothing (the database's refusal then names the invoice).
    const unpaid = await failedInvoice(world, 31, 'SIM-HAND-HELD');
    const both = ok(await call(organizationBillingPage, world.adminUserId, { organizationId }));
    expect(both.standing).toMatchObject({
      kind: 'suspended_by_paidwhole',
      label: 'Suspended by PaidWhole',
      billingHold: { kind: 'suspended_nonpayment', invoice: { id: unpaid, number: 'SIM-HAND-HELD' } },
      nextSteps: [{ action: 'Open a support ticket', href: '/support?from=billing' }, { action: 'Pay SIM-HAND-HELD', href: `#pay-${unpaid}`, detail: ' below.' }],
    });
    expect(both.standing.notice).toMatch(/Paying an invoice does not reinstate it\. An invoice is also unpaid since \d{4}-\d{2}-\d{2}; new runs stay stopped until it is paid as well\.$/);
    await owner.query("UPDATE organization SET status = 'active' WHERE id = $1", [organizationId]);
    expect(await call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] })).toEqual({
      status: 'suspended',
      reason: expect.stringMatching(/^the organization is suspended for nonpayment/) as string,
    });
    expect(ok(await call(organizationBillingPage, world.adminUserId, { organizationId })).standing.kind).toBe('suspended_nonpayment');
  });

  it('refuses a new plan for a closed organization, and says so where the plan form was (BIL-05)', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING CLOSED');
    const organizationId = world.organizationId;
    ok(await call(simulatedPaymentMethodAction, world.adminUserId, { organizationId }, GOOD_CARD));
    await owner.query("UPDATE organization SET status = 'closed' WHERE id = $1", [organizationId]);
    expect(await call(choosePlanAction, world.adminUserId, { organizationId }, { plan: 'monthly' })).toMatchObject({
      status: 'invalid',
      issues: [{ field: 'plan', message: 'a closed organization takes no new plan' }],
    });
    // Refused before Stripe is asked or a claim is taken.
    expect(await rows('SELECT 1 FROM subscription_claim WHERE organization_id = $1', [organizationId])).toEqual([]);
    expect(await rows('SELECT 1 FROM subscription WHERE organization_id = $1', [organizationId])).toEqual([]);
    const page = ok(await call(organizationBillingPage, world.adminUserId, { organizationId }));
    expect(page.standing).toMatchObject({
      kind: 'closed',
      label: 'Closed',
      tone: 'neutral',
      alert: false,
      formsNote: null,
      planRefusal: 'A closed organization takes no new plan.',
      nextSteps: [{ action: 'Open a support ticket', href: '/support?from=billing', detail: ' if you have a question about the closure.' }],
    });
    // An invoice unpaid for 31 days is named as still owed, with no promise that paying it restarts anything.
    const owed = await failedInvoice(world, 31, 'SIM-HAND-CLOSED');
    const closedOwing = ok(await call(organizationBillingPage, world.adminUserId, { organizationId })).standing;
    expect(closedOwing).toMatchObject({ kind: 'closed', tone: 'danger', alert: true, billingHold: { kind: 'suspended_nonpayment', invoice: { id: owed } } });
    expect(closedOwing.notice).toMatch(/^Its data stays readable, and no new run starts\. An invoice is also unpaid since \d{4}-\d{2}-\d{2}; it is still owed\.$/);
    expect(JSON.stringify(closedOwing)).not.toMatch(/reopen/i);
  });
});
