import { randomBytes, randomUUID } from 'node:crypto';

import { BillingEventError, WebhookSignatureError, signPayload } from '@tp/billing';
import { LocalBillingProvider, MemorySimulatorStore, SIMULATOR_TEST_ROUTING } from '@tp/billing/local';
import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl, withActor, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, placeholderDataKeyRef } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryMailSender } from '../mail/mail';
import { generateRoiStatement } from '../reconcile/statements';
import { BillingRefusedError, assertManagesBilling, ensureCustomer, issueAuditInvoice, organizationBilling, paymentMethodOnFile, payOpenInvoice, startPaymentMethodSetup, subscribe } from './account';
import { dunningMessage, runDunning } from './dunning';
import { receiveWebhook } from './events';
import { practiceRunRefusal } from './refusal';
import { withBilling } from './scope';
import { recordUsageSnapshots } from './usage';

/**
 * Billing against a real database and the local Stripe test-mode simulator (PRD 6, Billing acceptance: "A
 * test ACH payment completes; a suspended organization can read but not run"; PRD 8: "Billing never reads
 * PHI tables"; docs/adr/0050). Webhooks go through the same verification and processing the webhook route
 * uses, on the application's own login switching to tp_billing.
 */

const SECRET = 'whsec_synthetic_billing_db_test';
const GOOD_ACH = { kind: 'us_bank_account' as const, routingNumber: SIMULATOR_TEST_ROUTING, accountNumber: '000123456789' };
const FAILING_ACH = { kind: 'us_bank_account' as const, routingNumber: SIMULATOR_TEST_ROUTING, accountNumber: '000222222227' };

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let operator: DatabasePool;
let billing: LocalBillingProvider;
const outcomes: string[] = [];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  operator = openPool(database.url, 2);
  billing = new LocalBillingProvider({
    webhookSecret: SECRET,
    store: new MemorySimulatorStore(),
    deliver: async (payload, signature) => {
      outcomes.push((await receiveWebhook({ pool: app, provider: billing }, { payload, signature, requestId: `test-${randomUUID()}` })).outcome);
    },
  });
});

afterAll(async () => {
  await app.end();
  await operator.end();
  await owner.end();
  await database.drop();
});

const services = () => ({ pool: app, provider: billing });

async function one<T>(text: string, values: unknown[] = []): Promise<T> {
  return (await owner.query(text, values)).rows[0] as T;
}

/** A group with a payment method on file through the simulator's Elements stand-in. */
async function customerWithMethod(label: string, details = GOOD_ACH): Promise<TenantWorld> {
  const world = await createTenantWorld(owner, label);
  const intent = await startPaymentMethodSetup(services(), world.organizationId, randomUUID());
  await billing.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details, idempotencyKey: randomUUID() });
  return world;
}

async function customerRef(organizationId: string): Promise<string> {
  return (await one<{ ref: string }>('SELECT billing_customer_ref AS ref FROM organization WHERE id = $1', [organizationId])).ref;
}

/** A Stripe-shaped event, signed now, as Stripe or the simulator would send it. */
function signed(type: string, object: Record<string, unknown>, createdAt: Date = new Date()): { payload: string; signature: string } {
  const payload = JSON.stringify({ id: `evt_hand${randomBytes(8).toString('hex')}`, object: 'event', type, created: Math.floor(createdAt.getTime() / 1000), data: { object } });
  return { payload, signature: signPayload(SECRET, payload) };
}

function invoiceObject(id: string, customer: string, status: string, due: number, paid: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    object: 'invoice',
    customer,
    number: `HAND-${id.slice(-4)}`,
    status,
    currency: 'usd',
    amount_due: due,
    amount_paid: paid,
    amount_remaining: due - paid,
    attempt_count: 1,
    metadata: { tp_kind: 'audit' },
    status_transitions: { paid_at: status === 'paid' ? Math.floor(Date.now() / 1000) : null },
    parent: null,
    ...extra,
  };
}

const receive = (event: { payload: string; signature: string }) => receiveWebhook({ pool: app, provider: billing }, { ...event, requestId: `test-${randomUUID()}` });

describe('billing with the local Stripe test-mode simulator', () => {
  it('completes a test ACH payment: the method on file, the plan, the debit settled and the invoice paid', async () => {
    const world = await customerWithMethod('ach payer');
    expect(await customerRef(world.organizationId)).toMatch(/^cus_sim/);
    expect(await paymentMethodOnFile(services(), world.organizationId)).toMatchObject({ kind: 'us_bank_account', last4: '6789' });
    await subscribe(services(), world.organizationId, 'monthly', randomUUID());
    const open = await one<{ status: string; paid: string; kind: string }>('SELECT status, amount_paid_cents::text AS paid, kind FROM invoice WHERE organization_id = $1', [world.organizationId]);
    expect(open).toEqual({ status: 'open', paid: '0', kind: 'subscription' });
    expect(await one<{ status: string }>('SELECT status FROM subscription WHERE organization_id = $1', [world.organizationId])).toEqual({ status: 'incomplete' });

    expect(await billing.settle()).toBe(1);
    const paid = await one<Record<string, unknown>>(
      `SELECT status, amount_due_cents::text AS due, amount_paid_cents::text AS paid, amount_remaining_cents::text AS remaining, payment_method_kind, paid_at IS NOT NULL AS dated, first_failed_at
         FROM invoice WHERE organization_id = $1`,
      [world.organizationId],
    );
    expect(paid).toEqual({ status: 'paid', due: '50000', paid: '50000', remaining: '0', payment_method_kind: 'us_bank_account', dated: true, first_failed_at: null });
    expect(await one<{ status: string; plan: string }>('SELECT status, plan FROM subscription WHERE organization_id = $1', [world.organizationId])).toEqual({ status: 'active', plan: 'monthly' });

    // The administrator reads it; a viewer of the same group reads no billing record and may not manage it.
    const view = await withActor(app, world.adminUserId, (scope) => organizationBilling(scope.client, world.organizationId));
    expect(view).toMatchObject({ standing: 'good', hasCustomer: true, subscription: { plan: 'monthly', status: 'active' }, invoices: [{ status: 'paid', amountPaidCents: 50000n, paymentMethodKind: 'us_bank_account' }] });
    const viewer = await createUser(owner);
    await addMembership(owner, world.organizationId, viewer, 'viewer');
    expect(await withActor(app, viewer, (scope) => organizationBilling(scope.client, world.organizationId))).toMatchObject({ invoices: [], subscription: null });
    await expect(withActor(app, viewer, (scope) => assertManagesBilling(scope.client, world.organizationId))).rejects.toThrow(BillingRefusedError);
    await expect(withActor(app, world.adminUserId, (scope) => assertManagesBilling(scope.client, world.organizationId))).resolves.toBeUndefined();

    // One plan at a time; a second customer is never created.
    await expect(subscribe(services(), world.organizationId, 'annual', randomUUID())).rejects.toThrow(/already has a plan/);
    const ref = await customerRef(world.organizationId);
    expect(await ensureCustomer(services(), world.organizationId)).toBe(ref);
  });

  it('records each webhook once by its event ID, refuses one whose signature does not verify, and keeps out-of-order events stale', async () => {
    const world = await customerWithMethod('webhooks');
    const customer = await customerRef(world.organizationId);
    const invoiceId = `in_hand${randomBytes(6).toString('hex')}`;
    const finalized = signed('invoice.finalized', invoiceObject(invoiceId, customer, 'open', 250000, 0));
    expect(await receive(finalized)).toMatchObject({ outcome: 'applied', organizationId: world.organizationId });
    expect(await receive(finalized)).toMatchObject({ outcome: 'duplicate' });
    const eventId = (JSON.parse(finalized.payload) as { id: string }).id;
    expect(await one<{ n: string }>('SELECT count(*)::text AS n FROM billing_event WHERE stripe_event_id = $1', [eventId])).toEqual({ n: '1' });
    expect(
      await one<{ n: string }>(
        "SELECT count(*)::text AS n FROM audit_event WHERE action = 'billing_event_applied' AND actor_kind = 'system' AND purpose = 'applied' AND object_id = (SELECT id FROM billing_event WHERE stripe_event_id = $1)",
        [eventId],
      ),
    ).toEqual({ n: '1' });

    const before = await one<{ n: string }>('SELECT count(*)::text AS n FROM billing_event');
    await expect(receive({ ...finalized, payload: finalized.payload.replace('250000', '1') })).rejects.toThrow(WebhookSignatureError);
    await expect(receive({ ...finalized, signature: signPayload('whsec_someone_else', finalized.payload) })).rejects.toThrow(WebhookSignatureError);
    const malformed = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', created: 1, data: { object: { id: 'not_an_invoice' } } });
    await expect(receive({ payload: malformed, signature: signPayload(SECRET, malformed) })).rejects.toThrow(BillingEventError);
    expect(await one<{ n: string }>('SELECT count(*)::text AS n FROM billing_event')).toEqual(before);

    // Paid, then an older "open" update delivered late: stale, and the invoice stays paid.
    expect(await receive(signed('invoice.paid', invoiceObject(invoiceId, customer, 'paid', 250000, 250000)))).toMatchObject({ outcome: 'applied' });
    expect(await receive(signed('invoice.updated', invoiceObject(invoiceId, customer, 'open', 250000, 0), new Date(Date.now() - 60_000)))).toMatchObject({ outcome: 'stale' });
    expect(await one<{ status: string }>('SELECT status FROM invoice WHERE stripe_invoice_id = $1', [invoiceId])).toEqual({ status: 'paid' });

    // A customer no organization has, and a type billing does not keep.
    expect(await receive(signed('invoice.finalized', invoiceObject(`in_hand${randomBytes(6).toString('hex')}`, 'cus_nobody', 'open', 100, 0)))).toMatchObject({ outcome: 'unknown_customer', organizationId: null });
    expect(await receive(signed('charge.refunded', { id: 'ch_1' }))).toMatchObject({ outcome: 'ignored' });
  });

  it('suspends an organization 30 days after a failed payment: new work refused with the reason, data readable, runs again once paid', async () => {
    const world = await customerWithMethod('suspended', FAILING_ACH);
    const customer = await customerRef(world.organizationId);
    // An upload made before the suspension (its zip entries may still land).
    const parentDocument = randomUUID();
    await asOwner(owner, [world.practiceId], () =>
      owner.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', 10, 'application/zip', $3)", [parentDocument, world.practiceId, world.adminUserId]),
    );
    // The simulator's failed debit starts the dunning clock now: past due, not yet suspended.
    await subscribe(services(), world.organizationId, 'monthly', randomUUID());
    await billing.settle();
    expect(await one<Record<string, unknown>>('SELECT standing, past_due_since IS NOT NULL AS dated, suspended_since FROM billing_standing WHERE organization_id = $1', [world.organizationId])).toEqual({
      standing: 'past_due',
      dated: true,
      suspended_since: null,
    });
    expect(await one<{ code: string }>('SELECT last_failure_code AS code FROM invoice WHERE organization_id = $1', [world.organizationId])).toEqual({ code: 'insufficient_funds' });
    const job = randomUUID();
    const refusal = () => withJobScope(app, { jobId: job, practiceId: world.practiceId }, (scope) => practiceRunRefusal(scope.client, world.practiceId));
    expect(await refusal()).toBeNull();

    // An audit invoice whose payment failed 31 days ago (Stripe's event time is the clock).
    const invoiceId = `in_hand${randomBytes(6).toString('hex')}`;
    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    await receive(signed('invoice.payment_failed', invoiceObject(invoiceId, customer, 'open', 250000, 0), longAgo));
    expect(await one<{ standing: string }>('SELECT standing FROM billing_standing WHERE organization_id = $1', [world.organizationId])).toEqual({ standing: 'suspended' });
    const reason = await refusal();
    expect(reason).toMatch(/^the organization is suspended for nonpayment/);

    // The database refuses new work for the practice, whoever asks: an upload, a digest.
    const refusedInsert = (text: string, values: unknown[]) => withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, (scope) => scope.client.query(text, values));
    await expect(
      asOwner(owner, [world.practiceId], () => owner.query("INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, 'x12_835', 10, 'text/plain', $2)", [world.practiceId, world.adminUserId])),
    ).rejects.toMatchObject({ code: '55000', message: reason });
    await expect(refusedInsert("INSERT INTO digest (practice_id, period, counts, totals_cents) VALUES ($1, '2026-09', '{}', '{}')", [world.practiceId])).rejects.toMatchObject({ code: '55000' });
    // A zip's entry of an upload taken before the suspension still lands; reads are never refused.
    await asOwner(owner, [world.practiceId], () =>
      owner.query("INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, status) VALUES ($1, 'x12_835', 10, 'text/plain', $2, $3, 'received')", [
        world.practiceId,
        world.adminUserId,
        parentDocument,
      ]),
    );
    const readable = await withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, async (scope) => (await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM source_document WHERE practice_id = $1', [world.practiceId])).rows[0]);
    expect(readable).toEqual({ n: 2 });

    // Paid: reinstated at once, and new work starts again.
    await receive(signed('invoice.paid', invoiceObject(invoiceId, customer, 'paid', 250000, 250000)));
    expect(await one<{ standing: string }>('SELECT standing FROM billing_standing WHERE organization_id = $1', [world.organizationId])).toEqual({ standing: 'past_due' });
    expect(await refusal()).toBeNull();
    await refusedInsert("INSERT INTO digest (practice_id, period, counts, totals_cents) VALUES ($1, '2026-09', '{}', '{}')", [world.practiceId]);

    // A platform administrator's suspension refuses as well, with its own reason.
    await asOwner(owner, [], () => owner.query("UPDATE organization SET status = 'suspended' WHERE id = $1", [world.organizationId]));
    expect(await refusal()).toMatch(/^the organization is suspended: its data stays readable/);
    await asOwner(owner, [], () => owner.query("UPDATE organization SET status = 'active' WHERE id = $1", [world.organizationId]));
    expect(await refusal()).toBeNull();
    // The refusal is for a practice in the caller's scope only.
    const other = await createTenantWorld(owner, 'outside scope');
    await expect(withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, (scope) => practiceRunRefusal(scope.client, other.practiceId))).rejects.toMatchObject({ code: '42501' });
  });

  it('agrees with the dunning schedule to the day: past due before 30 days, suspended from the 30th', async () => {
    const world = await customerWithMethod('thirty days');
    const customer = await customerRef(world.organizationId);
    await receive(signed('invoice.payment_failed', invoiceObject(`in_hand${randomBytes(6).toString('hex')}`, customer, 'open', 100, 0), new Date(Date.now() - 30 * 86_400_000 + 120_000)));
    expect(await one<{ standing: string }>('SELECT standing FROM billing_standing WHERE organization_id = $1', [world.organizationId])).toEqual({ standing: 'past_due' });
    const world2 = await customerWithMethod('thirty days and a minute');
    await receive(signed('invoice.payment_failed', invoiceObject(`in_hand${randomBytes(6).toString('hex')}`, await customerRef(world2.organizationId), 'open', 100, 0), new Date(Date.now() - 30 * 86_400_000 - 120_000)));
    expect(await one<{ standing: string }>('SELECT standing FROM billing_standing WHERE organization_id = $1', [world2.organizationId])).toEqual({ standing: 'suspended' });
  });

  it('sends the dunning notices on the schedule, once each, and the reinstatement once paid', async () => {
    const world = await customerWithMethod('dunning');
    const customer = await customerRef(world.organizationId);
    const late = `in_hand${randomBytes(6).toString('hex')}`;
    const recent = `in_hand${randomBytes(6).toString('hex')}`;
    await receive(signed('invoice.payment_failed', invoiceObject(late, customer, 'open', 250000, 0), new Date(Date.now() - 31 * 86_400_000)));
    await receive(signed('invoice.payment_failed', invoiceObject(recent, customer, 'open', 1999, 0), new Date(Date.now() - 8 * 86_400_000)));
    const mail = new MemoryMailSender();
    const options = { pool: operator, mail, origin: 'http://localhost:3000', requestId: `job-${randomUUID()}`, now: new Date() };
    const first = await runDunning(options);
    expect(first.notices).toBeGreaterThanOrEqual(2);
    const ours = mail.sent.filter((message) => message.links[0] === `http://localhost:3000/settings/billing/${world.organizationId}`);
    expect(ours.map((message) => message.subject).sort()).toEqual(['An invoice is still unpaid', 'New runs have stopped until an invoice is paid']);
    const adminEmail = (await one<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [world.adminUserId])).email;
    expect(ours.every((message) => message.to.length === 1 && message.to[0] === adminEmail)).toBe(true);
    expect(ours.find((message) => message.subject.startsWith('New runs'))?.body).toContain('$2,500.00');
    expect(await one<Record<string, string>>('SELECT dunning_stage FROM invoice WHERE stripe_invoice_id = $1', [late])).toEqual({ dunning_stage: 'suspended' });
    expect(await one<Record<string, string>>('SELECT dunning_stage FROM invoice WHERE stripe_invoice_id = $1', [recent])).toEqual({ dunning_stage: 'second_notice' });
    expect(await one<{ n: string }>("SELECT count(*)::text AS n FROM audit_event WHERE action = 'billing_suspended' AND object_id = $1", [world.organizationId])).toEqual({ n: '1' });
    // Again the same day: nothing new.
    const sent = mail.sent.length;
    await runDunning({ ...options, requestId: `job-${randomUUID()}` });
    expect(mail.sent.filter((message) => message.links[0]?.endsWith(world.organizationId)).length).toBe(ours.length);
    expect(mail.sent.length).toBeGreaterThanOrEqual(sent);

    // The late one is paid, the recent one still holds the organization past due: reinstated, once.
    await receive(signed('invoice.paid', invoiceObject(late, customer, 'paid', 250000, 250000)));
    await runDunning({ ...options, requestId: `job-${randomUUID()}` });
    expect(mail.sent.filter((message) => message.links[0]?.endsWith(world.organizationId) && message.subject === 'New runs have started again')).toHaveLength(1);
    expect(await one<Record<string, string>>('SELECT dunning_stage FROM invoice WHERE stripe_invoice_id = $1', [late])).toEqual({ dunning_stage: 'reinstated' });
    expect(await one<{ n: string }>("SELECT count(*)::text AS n FROM audit_event WHERE action = 'billing_reinstated' AND object_id = $1", [world.organizationId])).toEqual({ n: '1' });
    await runDunning({ ...options, requestId: `job-${randomUUID()}` });
    expect(mail.sent.filter((message) => message.links[0]?.endsWith(world.organizationId) && message.subject === 'New runs have started again')).toHaveLength(1);
    expect(dunningMessage('payment_failed', ['a@synthetic.test'], { number: null, amount_remaining_cents: '100', first_failed_at: new Date('2026-03-01T00:00:00Z') }, 'http://x/settings/billing/1').lines[0]).toBe(
      'The payment for an invoice ($1.00) failed.',
    );
  });

  it('issues an audit invoice from the console only to an organization with a payment method on file, and pays an open invoice on demand', async () => {
    const world = await customerWithMethod('audit invoice');
    const invoice = await issueAuditInvoice(services(), world.organizationId, randomUUID());
    expect(await one<Record<string, unknown>>('SELECT kind, status, amount_due_cents::text AS due FROM invoice WHERE stripe_invoice_id = $1', [invoice])).toEqual({ kind: 'audit', status: 'open', due: '250000' });
    await billing.settle();
    expect(await one<{ status: string }>('SELECT status FROM invoice WHERE stripe_invoice_id = $1', [invoice])).toEqual({ status: 'paid' });
    const bare = await createTenantWorld(owner, 'no method');
    await expect(issueAuditInvoice(services(), bare.organizationId, randomUUID())).rejects.toThrow(/no payment method on file/);
    await expect(subscribe(services(), bare.organizationId, 'monthly', randomUUID())).rejects.toThrow(/add a payment method/);
    const id = (await one<{ id: string }>('SELECT id FROM invoice WHERE stripe_invoice_id = $1', [invoice])).id;
    await expect(payOpenInvoice(services(), world.organizationId, id, randomUUID())).rejects.toThrow(/only an unpaid invoice/);
    await expect(payOpenInvoice(services(), bare.organizationId, id, randomUUID())).rejects.toThrow(/no such invoice/);
    const internal = await createOrganization(owner, 'internal');
    await expect(ensureCustomer(services(), internal)).rejects.toThrow(/never billed/);
    await expect(ensureCustomer(services(), randomUUID())).rejects.toThrow(/no such organization/);
  });

  it('counts each group’s and firm’s practices nightly, once a day', async () => {
    const world = await createTenantWorld(owner, 'usage group');
    const second = randomUUID();
    await asOwner(owner, [second], () =>
      owner.query('INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, $3, $4)', [second, world.organizationId, 'SYNTHETIC SECOND PRACTICE', placeholderDataKeyRef()]),
    );
    const firm = await createOrganization(owner, 'firm', 'usage firm');
    const agreementId = randomUUID();
    await asOwner(owner, [world.practiceId], async () => {
      await owner.query(
        `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
        [agreementId, firm, world.practiceId, randomBytes(32).toString('hex')],
      );
      await owner.query(`INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id) VALUES ($1, $2, '{"roles":["firm_principal"]}', now() + interval '30 days', $3, $4)`, [
        firm,
        world.practiceId,
        world.adminUserId,
        agreementId,
      ]);
    });
    const day = '2026-10-16';
    const first = await recordUsageSnapshots({ pool: operator, day, requestId: `job-${randomUUID()}` });
    expect(first.recorded).toBe(first.organizations);
    const rows = await owner.query<{ organization_id: string; granted_practices: number; active_practices: number }>(
      'SELECT organization_id, granted_practices, active_practices FROM usage_snapshot WHERE date = $1 AND organization_id = ANY ($2::uuid[]) ORDER BY granted_practices',
      [day, [world.organizationId, firm]],
    );
    expect(rows.rows).toEqual([
      { organization_id: world.organizationId, granted_practices: 0, active_practices: 2 },
      { organization_id: firm, granted_practices: 1, active_practices: 1 },
    ]);
    expect((await recordUsageSnapshots({ pool: operator, day, requestId: `job-${randomUUID()}` })).recorded).toBe(0);
    await expect(recordUsageSnapshots({ pool: operator, day: 'yesterday', requestId: 'job-x' })).rejects.toThrow(/calendar day/);
    // A snapshot is kept as it was taken: billing may not change it, and no one else can either.
    await expect(withBilling(operator, (client) => client.query('UPDATE usage_snapshot SET granted_practices = 9 WHERE organization_id = $1', [firm]))).rejects.toMatchObject({ code: '42501' });
    await expect(owner.query('UPDATE usage_snapshot SET granted_practices = 9 WHERE organization_id = $1', [firm])).rejects.toMatchObject({ code: '23514' });
  });

  it('shares a paid invoice among the group’s practices as the ROI statement’s fees, to the cent', async () => {
    const world = await customerWithMethod('fees');
    const practices = [world.practiceId];
    for (const name of ['SYNTHETIC FEES TWO', 'SYNTHETIC FEES THREE']) {
      const id = randomUUID();
      await asOwner(owner, [id], () => owner.query('INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, $3, $4)', [id, world.organizationId, name, placeholderDataKeyRef()]));
      practices.push(id);
    }
    const customer = await customerRef(world.organizationId);
    // Paid after the three practices exist (Stripe's times are whole seconds).
    const paidAt = Math.ceil(Date.now() / 1000) + 1;
    await receive(signed('invoice.paid', invoiceObject(`in_hand${randomBytes(6).toString('hex')}`, customer, 'paid', 100001, 100001, { status_transitions: { paid_at: paidAt } })));
    const today = new Date().toISOString().slice(0, 10);
    const fees = await Promise.all(
      practices.map((practiceId) =>
        withJobScope(app, { jobId: randomUUID(), practiceId }, async (scope) => (await scope.client.query<{ fees: string }>('SELECT practice_fees_paid($1, $2::date, $2::date)::text AS fees', [practiceId, today])).rows[0]?.fees),
      ),
    );
    expect(fees).toEqual(['33334', '33334', '33333']);
    const outside = await withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, async (scope) => (await scope.client.query<{ fees: string }>("SELECT practice_fees_paid($1, '2020-01-01', '2020-12-31')::text AS fees", [world.practiceId])).rows[0]?.fees);
    expect(outside).toBe('0');
    // The ROI statement takes its fees from them (the milestone 9 seam).
    const generated = await withJobScope(app, { jobId: randomUUID(), practiceId: world.practiceId }, (scope) => generateRoiStatement(scope, { practiceId: world.practiceId, periodFrom: today, periodTo: today, requestId: 'test' }));
    expect(generated?.statement.feesCents).toBe(33334n);
  });
});

describe('billing reads no PHI table (PRD 8)', () => {
  it('gives tp_billing no privilege on any table that holds practice_id or is in the PHI registry', async () => {
    const { rows } = await owner.query<{ table_name: string; privileged: boolean }>(
      `WITH phi AS (
         SELECT table_name::text AS table_name FROM phi_table_registry
         UNION SELECT c.relname::text FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v') AND a.attname = 'practice_id' AND a.attnum > 0 AND NOT a.attisdropped)
       SELECT table_name,
              has_table_privilege('tp_billing', format('public.%I', table_name), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              OR has_any_column_privilege('tp_billing', format('public.%I', table_name), 'SELECT, INSERT, UPDATE, REFERENCES') AS privileged
         FROM phi ORDER BY 1`,
    );
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.filter((row) => row.privileged).map((row) => row.table_name)).toEqual([]);
    // What billing holds: its tables, and four columns and one update of the organization.
    const held = await owner.query<{ table_name: string }>(
      `SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND (has_table_privilege('tp_billing', c.oid, 'SELECT') OR has_any_column_privilege('tp_billing', c.oid, 'SELECT'))
        ORDER BY 1`,
    );
    expect(held.rows.map((row) => row.table_name)).toEqual(['billing_event', 'billing_standing', 'invoice', 'organization', 'subscription', 'usage_snapshot']);
  });

  it('refuses tp_billing a PHI read even inside a practice’s scope', async () => {
    const world = await createTenantWorld(owner, 'no phi for billing');
    await expect(
      withBilling(app, async (client) => {
        await client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${world.practiceId}}`]);
        return client.query('SELECT count(*) FROM claim');
      }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(withBilling(app, (client) => client.query('SELECT name FROM practice LIMIT 1'))).rejects.toMatchObject({ code: '42501' });
    await expect(withBilling(app, (client) => client.query('SELECT email FROM "user" LIMIT 1'))).rejects.toMatchObject({ code: '42501' });
    expect(await withBilling(app, async (client) => (await client.query('SELECT current_user AS role')).rows[0])).toEqual({ role: 'tp_billing' });
  });

  it('lets tp_billing call only billing’s own definer functions, and lets neither login inherit its privileges', async () => {
    const { rows } = await owner.query<{ name: string }>(
      `SELECT p.oid::regprocedure::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('tp_billing', p.oid, 'EXECUTE') ORDER BY 1`,
    );
    expect(rows.map((row) => row.name)).toEqual(['billing_owner_emails(uuid)', 'billing_record_audit(text,text,uuid,text,text)', 'billing_usage_counts()']);
    const members = await owner.query<{ member: string; inherits: boolean; switches: boolean }>(
      `SELECT pg_get_userbyid(m.member) AS member, m.inherit_option AS inherits, m.set_option AS switches FROM pg_auth_members m WHERE m.roleid = 'tp_billing'::regrole ORDER BY 1`,
    );
    expect(members.rows).toEqual([
      { member: 'tp_app', inherits: false, switches: true },
      { member: 'tp_operator', inherits: false, switches: true },
    ]);
    expect((await owner.query<{ usage: boolean }>("SELECT pg_has_role('tp_app_dev', 'tp_billing', 'USAGE') AS usage")).rows[0]).toEqual({ usage: false });
    // The application role itself writes no billing record.
    await expect(withActor(app, randomUUID(), (scope) => scope.client.query("UPDATE invoice SET status = 'paid'"))).rejects.toMatchObject({ code: '42501' });
    expect(outcomes.length).toBeGreaterThan(0);
  });
});
