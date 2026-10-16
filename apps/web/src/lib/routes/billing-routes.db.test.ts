import { randomBytes, randomUUID } from 'node:crypto';

import { signPayload } from '@tp/billing';
import { LocalBillingProvider, MemorySimulatorStore, SIMULATOR_TEST_ROUTING } from '@tp/billing/local';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
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

/**
 * Billing's routes against PostgreSQL and the local Stripe test-mode simulator (PRD 5, J18; PRD 6, Billing
 * acceptance: "A test ACH payment completes; a suspended organization can read but not run"; docs/adr/0050).
 * The simulator's events reach the webhook route the way Stripe's do, through the route handler: the body as
 * sent and its Stripe-Signature header. Who may use each route is route-tests.db.test.ts's; this is what the
 * routes do.
 */

const SECRET = 'whsec_synthetic_billing_routes_test';

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
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
  await app.end();
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
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
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
async function failedInvoice(world: TenantWorld, days: number): Promise<string> {
  const [customer] = await rows<{ ref: string | null }>('SELECT billing_customer_ref AS ref FROM organization WHERE id = $1', [world.organizationId]);
  const ref = customer?.ref ?? `cus_hand${randomBytes(6).toString('hex')}`;
  if (customer?.ref === null) {
    await owner.query('UPDATE organization SET billing_customer_ref = $2 WHERE id = $1', [world.organizationId, ref]);
  }
  const [invoice] = await rows<{ id: string }>(
    `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents,
       attempt_count, first_failed_at, last_failure_code, stripe_event_at)
     VALUES ($1, $2, $3, 'audit', 'open', 'usd', 250000, 0, 250000, 1, now() - make_interval(days => $4), 'insufficient_funds', now() - make_interval(days => $4)) RETURNING id`,
    [world.organizationId, `in_hand${randomBytes(6).toString('hex')}`, ref, days],
  );
  return invoice?.id ?? '';
}

describe('Settings, billing (J18)', () => {
  it('completes a test ACH payment through the routes: the bank account, the monthly plan, the settlement, the paid invoice', async () => {
    const world = await createTenantWorld(owner, 'SYNTHETIC BILLING ROUTES');
    const admin = world.adminUserId;
    expect(ok(await call(billingSettingsPage, admin, {})).organizations).toEqual([{ organizationId: world.organizationId, name: expect.any(String) as string, kind: 'group' }]);

    const before = ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId }));
    expect(before).toMatchObject({ provider: 'local', paymentMethod: null, suspension: null, billing: { standing: 'good', subscription: null, invoices: [] }, testRouting: SIMULATOR_TEST_ROUTING });
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

    // A body past the limit is refused before it is read.
    const big = await post(`{"pad":"${'x'.repeat(WEBHOOK_MAX_BYTES)}"}`, signature);
    expect(big.status).toBe(400);
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

    const suspendedInvoice = await failedInvoice(world, 31);
    const documents = async () => (await rows<{ n: string }>('SELECT count(*)::text AS n FROM source_document WHERE practice_id = $1', [world.practiceId]))[0]?.n;
    const before = await documents();

    const home = ok(await call(practiceHome, admin, P));
    expect(home.suspension).toMatch(/suspended for nonpayment.*data stays readable/);
    expect(ok(await call(uploadsPage, admin, P)).gate).toEqual({ open: false, reason: expect.stringMatching(/^Uploads are paused: the organization is suspended for nonpayment/) as string });
    expect((await call(pricingRunsPage, admin, P)).status).toBe('ok');
    expect(ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId })).suspension).toMatch(/New runs have stopped/);

    // The wrapper refuses with the database's reason; over HTTP, a 402.
    const refused = await call(requestUploads, uploader, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] });
    expect(refused).toEqual({ status: 'suspended', reason: expect.stringMatching(/^the organization is suspended for nonpayment/) as string });
    const response = await routeHandler(requestUploads, () => services)(
      new Request(`http://localhost:3100/p/${world.practiceId}/uploads/request`, {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${await sessionOf(uploader)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestKey: randomUUID(), files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: 1200 }] }),
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
    expect(ok(await call(organizationBillingPage, admin, { organizationId: world.organizationId })).billing.standing).toBe('good');
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
    expect(ok(await call(organizationBillingPage, world.adminUserId, { organizationId: world.organizationId })).suspension).toMatch(/platform administrator has suspended/);
  });
});
