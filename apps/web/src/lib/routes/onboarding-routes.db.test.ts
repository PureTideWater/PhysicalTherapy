import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { MemoryCompliancePlatform, complianceExportSchema } from '@tp/compliance';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl, withActor } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalAgreementDocuments } from '../agreements/documents';
import { ESIGN_SIGNATURE_HEADER, LocalESignature } from '../agreements/esign';
import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import { routeHandler } from '../http/handler';
import { forgetMaintenanceFlag } from '../http/invoke';
import type { CookieJar, Outcome, Route, RouteRequest } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { compliancePage, exportEvidence, recordEvidence, sendEvidence } from './compliance';
import { ATTRIBUTION_COOKIE } from '../http/attribution';
import { DECLINED_REASON_LABELS, convertProspect, prospectsPage, publishTerms, resendInvitationFromConsole, reviewProspect, uploadAgreement } from './console-onboarding';
import { ESIGN_WEBHOOK_MAX_BYTES, acceptTerms, agreementWebhook, requestAudit, termsPage } from './onboarding';
import { practiceHome } from './practice';
import { EMAIL_IN_USE, accessLogPage, agreementsSettingsPage, confirmAgreementsAction, inviteUserAction, proofLevelPage, resendInvitationAction, setProofLevelAction, settingsPage, usersSettingsPage } from './settings';
import { signInWithPassword } from './sign-in';
import { consoleStatusPage, createTicket, maintenancePage, openIncident, setMaintenance, setTicketStatus, statusPage, supportRequestPage, ticketsPage, updateIncident } from './support';

/**
 * Customer onboarding, Settings, support, the status page and the evidence checklist against PostgreSQL (PRD 5, J1
 * and J2; PRD 7, Settings; PRD 16; PRD 19, Support; milestone 11; docs/adr/0053). Who may use each route is
 * route-tests.db.test.ts's; this is what the routes do. Synthetic data only.
 */

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let billingPool: DatabasePool;
let esignPool: DatabasePool;
let services: Services;
let world: TenantWorld;
let platformAdmin: string;
let supportEngineer: string;
let internalOrganization: string;
const invitations: { email: string; password: string }[] = [];
const scratch = mkdtempSync(path.join(tmpdir(), 'tp-onboarding-routes-'));
const esign = new LocalESignature({ secret: 'synthetic-esign-secret-for-tests', directory: path.join(scratch, 'esign') });
const platform = new MemoryCompliancePlatform();
const queue = new MemoryQueue();
const clock = new Date();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  billingPool = openPool(database.billingUrl, 4);
  esignPool = openPool(database.esignUrl, 2);
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: 'http://localhost:3100',
    pool: app,
    billingPool,
    esignPool,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: (email, password) => {
        invitations.push({ email, password });
        return Promise.resolve();
      },
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: LocalKeyProvider.random(),
    sealer,
    logger: createLogger({ sink: () => undefined }),
    queue,
    esign,
    agreementDocuments: new LocalAgreementDocuments(path.join(scratch, 'agreements')),
    compliancePlatform: platform,
    supportEmail: 'help@synthetic.test',
    environment: 'dev',
    now: () => clock,
  });
  world = await createTenantWorld(owner, 'onboarding');
  internalOrganization = await createOrganization(owner, 'internal', 'onboarding internal');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internalOrganization, platformAdmin, 'platform_admin');
  supportEngineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internalOrganization, supportEngineer, 'support');
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await endPool(billingPool);
  await endPool(esignPool);
  await owner.end();
  await database.drop();
  rmSync(scratch, { recursive: true, force: true });
});

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(token: string | undefined) {
    if (token !== undefined) {
      this.values.set(SESSION_COOKIE, token);
    }
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
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    const internal = userId === platformAdmin || userId === supportEngineer;
    token = (await openSession(app, { userId, method: internal ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string | null, params: Record<string, unknown>, input?: Record<string, unknown>, extra: Partial<RouteRequest> = {}): Promise<Outcome<R>> {
  const token = userId === null ? undefined : await sessionOf(userId);
  const body = route.mutation ? { csrfToken: csrfTokenFor(services.sealer, token), requestKey: randomUUID(), ...input } : input;
  return route.invoke({ cookies: new Jar(token), params, input: body, requestId: `test-${randomUUID()}`, userAgent: null, ...extra }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

async function newCustomer(role: 'practice_admin' | 'billing_manager' | 'viewer' = 'practice_admin'): Promise<string> {
  const userId = await createUser(owner);
  await addMembership(owner, world.organizationId, userId, role);
  // Customers accept the terms in force, if any are, before anything else (the terms test checks that gate).
  await asOwner(owner, [], () =>
    owner.query("INSERT INTO terms_acceptance (user_id, terms_version_id, request_id) SELECT $1, current_terms_version(), 'test' WHERE current_terms_version() IS NOT NULL", [userId]),
  );
  return userId;
}

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const PDF = new TextEncoder().encode('%PDF-1.4\n% SYNTHETIC SIGNED AGREEMENT\n%%EOF\n');

describe('the audit request (J1)', () => {
  it('keeps a request without patient information, and refuses one that carries an identifier', async () => {
    const sent = await call(requestAudit, null, {}, {
      contactName: 'Synthetic Contact',
      contactEmail: 'Contact@Synthetic.Test',
      organizationName: 'Synthetic Physical Therapy',
      locations: '3',
      payers: 'Synthetic Payer One\nSynthetic Payer Two, Synthetic Payer Three',
      billingArrangement: 'billing_firm',
    });
    expect(sent).toEqual({ status: 'ok', data: { redirect: '/request-audit?sent=1' } });
    const { rows } = await owner.query<{ contact_email: string; payers: string[]; status: string }>("SELECT contact_email, payers, status FROM prospect_request WHERE organization_name = 'Synthetic Physical Therapy'");
    expect(rows).toEqual([{ contact_email: 'contact@synthetic.test', payers: ['Synthetic Payer One', 'Synthetic Payer Two', 'Synthetic Payer Three'], status: 'new' }]);
    const refused = await call(requestAudit, null, {}, {
      contactName: 'Synthetic Contact',
      contactEmail: 'contact@synthetic.test',
      organizationName: 'Clinic for patient born 04/12/1961',
      locations: '1',
      payers: 'Synthetic Payer One',
      billingArrangement: 'in_house',
    });
    expect(refused.status).toBe('invalid');
    expect((await owner.query("SELECT 1 FROM prospect_request WHERE organization_name LIKE 'Clinic for patient%'")).rows).toEqual([]);
  });

  it('counts requests from one address against the public form’s limit, refused ones included', async () => {
    const address = '198.51.100.23';
    const input = { contactName: 'Synthetic Burst', contactEmail: 'burst@synthetic.test', organizationName: 'Synthetic Burst Clinic', locations: '1', payers: 'Synthetic Payer', billingArrangement: 'other' };
    const outcomes = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      outcomes.push((await call(requestAudit, null, {}, input, { clientAddress: address })).status);
    }
    expect(outcomes).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'rate_limited']);
    expect((await call(requestAudit, null, {}, input, { clientAddress: '198.51.100.24' })).status).toBe('ok');
  });

  it('refuses a request posted from another site', async () => {
    expect(await call(requestAudit, null, {}, {}, { origin: 'https://elsewhere.example', fetchSite: 'cross-site' })).toEqual({ status: 'csrf_refused' });
  });

  it('becomes a practice group in the console, once', async () => {
    const page = ok(await call(prospectsPage, platformAdmin, { status: 'new' }));
    const prospect = page.prospects.find((row) => row.organizationName === 'Synthetic Physical Therapy');
    expect(prospect?.billingArrangement).toBe('billing_firm');
    const converted = ok(await call(convertProspect, platformAdmin, {}, { prospectId: prospect?.id }));
    const organizationId = converted.redirect?.split('/').at(-1) ?? '';
    expect((await owner.query<{ kind: string; name: string }>('SELECT kind, name FROM organization WHERE id = $1', [organizationId])).rows).toEqual([{ kind: 'group', name: 'Synthetic Physical Therapy' }]);
    expect((await call(convertProspect, platformAdmin, {}, { prospectId: prospect?.id })).status).toBe('not_found');
  });
});

describe('the audit request’s attribution and the console’s decline reasons (audit #57; the founder’s rulings of 2026-10-20)', () => {
  /** A request from the form, with the attribution cookie the proxy set and the two optional answers. */
  async function requested(organizationName: string, extra: Record<string, unknown> = {}, cookie?: string): Promise<Outcome<unknown>> {
    const jar: CookieJar = { get: (name) => (name === ATTRIBUTION_COOKIE ? cookie : undefined), set: () => undefined, delete: () => undefined };
    return call(
      requestAudit,
      null,
      {},
      { contactName: 'Synthetic Contact', contactEmail: 'attributed@synthetic.test', organizationName, locations: '1', payers: 'Synthetic Payer', billingArrangement: 'mixed', ...extra },
      cookie === undefined ? {} : { cookies: jar },
    );
  }
  const columns = 'SELECT source, utm_source, utm_medium, utm_campaign, paid_click, referring_firm, from_screening, status, declined_reason FROM prospect_request WHERE organization_name = $1';

  it('keeps how the requester heard of us, the cookie’s codes and kind of click, and the referring firm; refuses a source off the list or a firm with an identifier', async () => {
    expect((await requested('Synthetic Attributed Clinic', { heardFrom: 'association', referringFirm: ' Synthetic  Billing Partners ' }, 's=apta&m=newsletter&c=fall-launch&k=paid_search')).status).toBe('ok');
    expect((await owner.query(columns, ['Synthetic Attributed Clinic'])).rows).toEqual([
      { source: 'association', utm_source: 'apta', utm_medium: 'newsletter', utm_campaign: 'fall-launch', paid_click: 'paid_search', referring_firm: 'Synthetic Billing Partners', from_screening: false, status: 'new', declined_reason: null },
    ]);
    // Blank answers are none.
    expect((await requested('Synthetic Blank Clinic', { heardFrom: '', referringFirm: '' })).status).toBe('ok');
    expect((await owner.query(columns, ['Synthetic Blank Clinic'])).rows).toEqual([
      { source: null, utm_source: null, utm_medium: null, utm_campaign: null, paid_click: null, referring_firm: null, from_screening: false, status: 'new', declined_reason: null },
    ]);
    expect((await requested('Synthetic Friend Clinic', { heardFrom: 'friend' })).status).toBe('invalid');
    const firm = await requested('Synthetic Identifier Clinic', { referringFirm: 'Synthetic Billing, born 04/12/1961' });
    expect(firm.status).toBe('invalid');
    expect((await owner.query("SELECT 1 FROM prospect_request WHERE organization_name IN ('Synthetic Friend Clinic', 'Synthetic Identifier Clinic')")).rows).toEqual([]);
  });

  it('declines with a reason from the closed list as the application role, and refuses a decline without one, a contacted request with one, or not_recorded', async () => {
    await requested('Synthetic Declined Clinic');
    await requested('Synthetic Contacted Clinic');
    await requested('Synthetic Previous Image Clinic');
    const page = ok(await call(prospectsPage, platformAdmin, { status: 'new' }));
    expect(page.declinedReasons.map((reason) => reason.value)).toEqual([
      'no_response',
      'not_now',
      'price',
      'too_little_to_recover',
      'chose_other',
      'doing_it_themselves',
      'data_unavailable',
      'compliance_declined',
      'not_a_fit',
      'not_a_prospect',
      'other',
    ]);
    const id = (name: string) => page.prospects.find((row) => row.organizationName === name)?.id;
    const declined = id('Synthetic Declined Clinic');
    expect((await call(reviewProspect, platformAdmin, {}, { prospectId: declined, status: 'declined' })).status).toBe('invalid');
    expect((await call(reviewProspect, platformAdmin, {}, { prospectId: declined, status: 'declined', declinedReason: 'not_recorded' })).status).toBe('invalid');
    expect((await call(reviewProspect, platformAdmin, {}, { prospectId: id('Synthetic Contacted Clinic'), status: 'contacted', declinedReason: 'price' })).status).toBe('invalid');
    expect(ok(await call(reviewProspect, platformAdmin, {}, { prospectId: declined, status: 'declined', declinedReason: 'too_little_to_recover' }))).toEqual({ objectId: declined, redirect: '/console/prospects' });
    expect(ok(await call(reviewProspect, platformAdmin, {}, { prospectId: id('Synthetic Contacted Clinic'), status: 'contacted', declinedReason: '' }))).toMatchObject({ objectId: id('Synthetic Contacted Clinic') });
    expect((await owner.query(columns, ['Synthetic Declined Clinic'])).rows[0]).toMatchObject({ status: 'declined', declined_reason: 'too_little_to_recover' });
    expect((await owner.query(columns, ['Synthetic Contacted Clinic'])).rows[0]).toMatchObject({ status: 'contacted', declined_reason: null });
    // A declined request is done: the route finds nothing to review, and the database keeps its status and reason.
    expect((await call(reviewProspect, platformAdmin, {}, { prospectId: declined, status: 'declined', declinedReason: 'price' })).status).toBe('not_found');
    // The previous image's decline, as the application role with the administrator's actor: no reason, so not_recorded;
    // a change to a declined request's reason is refused by the database's built-in rules alone (no function to execute).
    await withActor(app, platformAdmin, async (scope) => {
      await scope.client.query("UPDATE prospect_request SET status = 'declined', reviewed_by = app_actor_id() WHERE organization_name = 'Synthetic Previous Image Clinic'");
    });
    expect((await owner.query(columns, ['Synthetic Previous Image Clinic'])).rows[0]).toMatchObject({ status: 'declined', declined_reason: 'not_recorded' });
    await expect(
      withActor(app, platformAdmin, (scope) => scope.client.query("UPDATE prospect_request SET declined_reason = 'price', reviewed_by = app_actor_id() WHERE organization_name = 'Synthetic Declined Clinic'")),
    ).rejects.toMatchObject({ code: '23514' });
    // The page names a declined request's reason.
    const declinedPage = ok(await call(prospectsPage, platformAdmin, { status: 'declined' }));
    expect(declinedPage.prospects.find((row) => row.organizationName === 'Synthetic Declined Clinic')?.declinedReason).toBe('too_little_to_recover');
    expect(DECLINED_REASON_LABELS.too_little_to_recover).toBe('Too little to recover');
    // And a request still converts as the application role, with the new CHECKs in place.
    const contacted = id('Synthetic Contacted Clinic');
    expect(ok(await call(convertProspect, platformAdmin, {}, { prospectId: contacted })).redirect).toMatch(/^\/console\/organizations\//);
  });
});

describe('invitations (J2)', () => {
  it('invites a billing manager through the identity provider, with an invitation of seven days the administrator can send again', async () => {
    const admin = world.adminUserId;
    const email = `manager-${randomUUID()}@synthetic.test`;
    ok(await call(inviteUserAction, admin, { organizationId: world.organizationId }, { email, role: 'billing_manager' }));
    expect(invitations.at(-1)?.email).toBe(email);
    const page = ok(await call(usersSettingsPage, admin, { organizationId: world.organizationId }));
    const invitation = page.invitations.find((row) => row.email === email);
    expect(invitation).toMatchObject({ role: 'billing_manager', sends: 1, acceptedAt: null, expired: false });
    expect(Math.round(((invitation?.expiresAt.getTime() ?? 0) - (invitation?.sentAt.getTime() ?? 0)) / 86_400_000)).toBe(7);
    // Lapsed: the temporary password no longer signs in, and says why.
    await owner.query("UPDATE invitation SET sent_at = now() - interval '8 days', expires_at = now() - interval '1 day' WHERE id = $1", [invitation?.id]);
    const password = invitations.at(-1)?.password ?? '';
    const expired = await signInWithPassword.invoke({ cookies: new Jar(undefined), params: {}, input: { email, password }, requestId: `test-${randomUUID()}`, userAgent: null }, services);
    expect(JSON.stringify(expired)).toContain('invitation has expired');
    ok(await call(resendInvitationAction, admin, { organizationId: world.organizationId }, { invitationId: invitation?.id }));
    expect(invitations.at(-1)?.email).toBe(email);
    const again = ok(await call(usersSettingsPage, admin, { organizationId: world.organizationId })).invitations.find((row) => row.id === invitation?.id);
    expect(again).toMatchObject({ sends: 2, expired: false });
    // A platform administrator may send it again too; nobody else outside the organization may.
    ok(await call(resendInvitationFromConsole, platformAdmin, {}, { organizationId: world.organizationId, invitationId: invitation?.id }));
    const viewer = await newCustomer('viewer');
    expect((await call(resendInvitationAction, viewer, { organizationId: world.organizationId }, { invitationId: invitation?.id })).status).toBe('forbidden');
  });
});

describe('inviting an address already in use (docs/adr/0055)', () => {
  it('answers the same for a member here and a person another organization knows, and asks the identity provider nothing', async () => {
    const admin = world.adminUserId;
    const other = await createTenantWorld(owner, 'another tenant');
    const elsewhere = (await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [other.adminUserId])).rows[0]?.email ?? '';
    const here = (await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [admin])).rows[0]?.email ?? '';
    const sent = invitations.length;
    const answers = [];
    for (const email of [elsewhere, here, elsewhere.toUpperCase()]) {
      answers.push(await call(inviteUserAction, admin, { organizationId: world.organizationId }, { email, role: 'viewer' }));
    }
    expect(answers).toEqual(answers.map(() => ({ status: 'invalid', issues: [{ field: 'email', message: EMAIL_IN_USE }] })));
    expect(EMAIL_IN_USE).not.toMatch(/another organization/);
    expect(invitations).toHaveLength(sent);
    // The check is the organization's administrators' alone, and answers yes or no.
    const viewer = await newCustomer('viewer');
    await expect(withActor(app, viewer, (scope) => scope.client.query('SELECT invitation_email_in_use($1, $2)', [world.organizationId, elsewhere]))).rejects.toMatchObject({ code: '42501' });
    await expect(withActor(app, admin, (scope) => scope.client.query('SELECT invitation_email_in_use($1, $2)', [other.organizationId, elsewhere]))).rejects.toMatchObject({ code: '42501' });
    const unknown = await withActor(app, admin, async (scope) => (await scope.client.query<{ used: boolean }>('SELECT invitation_email_in_use($1, $2) AS used', [world.organizationId, `nobody-${randomUUID()}@synthetic.test`])).rows[0]);
    expect(unknown).toEqual({ used: false });
  });
});

describe('the terms of use', () => {
  it('sends a customer to the version in force first, records the acceptance with its version and time, and asks again for a new version', async () => {
    const customer = await newCustomer();
    expect((await owner.query('SELECT 1 FROM terms_version')).rows).toEqual([]);
    // Nothing published yet: nothing to accept.
    expect((await call(practiceHome, customer, { practiceId: world.practiceId })).status).toBe('ok');
    const published = ok(await call(publishTerms, platformAdmin, {}, { version: '2026-10', documentRef: 'terms/2026-10', sha256: sha('terms 2026-10') }));
    expect(await call(practiceHome, customer, { practiceId: world.practiceId })).toEqual({ status: 'terms_required' });
    // Staff work under the workforce policies: never asked.
    expect((await call(termsPage, platformAdmin, {})).status).toBe('ok');
    const page = ok(await call(termsPage, customer, {}));
    expect(page).toMatchObject({ current: { version: '2026-10' }, acceptedCurrentAt: null, internal: false });
    expect((await call(acceptTerms, customer, {}, { termsVersionId: randomUUID() })).status).toBe('invalid');
    ok(await call(acceptTerms, customer, {}, { termsVersionId: published.objectId }));
    expect((await call(practiceHome, customer, { practiceId: world.practiceId })).status).toBe('ok');
    const accepted = await owner.query<{ version: string; accepted_at: Date }>('SELECT t.version, a.accepted_at FROM terms_acceptance a JOIN terms_version t ON t.id = a.terms_version_id WHERE a.user_id = $1', [customer]);
    expect(accepted.rows.map((row) => row.version)).toEqual(['2026-10']);
    expect(accepted.rows[0]?.accepted_at).toBeInstanceOf(Date);
    // A new version: asked again, and the old acceptance stays on record.
    ok(await call(publishTerms, platformAdmin, {}, { version: '2026-11', documentRef: 'terms/2026-11', sha256: sha('terms 2026-11') }));
    expect(await call(practiceHome, customer, { practiceId: world.practiceId })).toEqual({ status: 'terms_required' });
    expect(ok(await call(termsPage, customer, {})).history.map((row) => row.version)).toEqual(['2026-10']);
    expect((await call(publishTerms, platformAdmin, {}, { version: '2026-11', documentRef: 'terms/again', sha256: sha('again') })).status).toBe('invalid');
    // Everyone else in this file accepts the version in force.
    await asOwner(owner, [], () => owner.query("INSERT INTO terms_acceptance (user_id, terms_version_id, request_id) SELECT id, current_terms_version(), 'test' FROM \"user\" ON CONFLICT DO NOTHING"));
  });
});

describe('agreements', () => {
  it('records an e-signed agreement from the vendor’s webhook once, by reference and the signed document’s SHA-256', async () => {
    const handler = routeHandler(agreementWebhook, () => services, { rawBody: { signatureHeader: ESIGN_SIGNATURE_HEADER, maxBytes: ESIGN_WEBHOOK_MAX_BYTES } });
    const event = await esign.complete({ organizationId: world.organizationId, practiceId: world.practiceId, kind: 'engagement', version: '1', signer: 'SYNTHETIC SIGNER', document: PDF, completedAt: clock }, clock);
    const post = (payload: string, signature: string) =>
      handler(new Request('http://localhost:3100/api/agreements/webhook', { method: 'POST', headers: { 'content-type': 'application/json', [ESIGN_SIGNATURE_HEADER]: signature }, body: payload }));
    const first = await post(event.payload, event.signature);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: 'recorded' });
    expect(await (await post(event.payload, event.signature)).json()).toEqual({ received: true, outcome: 'duplicate' });
    const { rows } = await owner.query<{ document_ref: string; sha256: string; signer: string }>("SELECT document_ref, sha256, signer FROM agreement WHERE organization_id = $1 AND kind = 'engagement'", [world.organizationId]);
    expect(rows).toEqual([{ document_ref: `esign:${event.envelopeRef}`, sha256: sha(PDF), signer: 'SYNTHETIC SIGNER' }]);
    // A forged or altered event is not read.
    const forged = await post(event.payload.replace('engagement', 'data_rights'), event.signature);
    expect(forged.status).toBe(400);
    expect((await owner.query("SELECT 1 FROM agreement WHERE organization_id = $1 AND kind = 'data_rights'", [world.organizationId])).rows).toEqual([]);
  });

  it('records an uploaded signed PDF, hashed on the server and kept under an opaque key, and refuses anything else', async () => {
    const upload = (bytes: Uint8Array) => ({ upload: { contentType: 'application/pdf', contentLength: bytes.length, body: Readable.from([bytes]) } });
    const input = { organizationId: world.organizationId, practiceId: world.practiceId, kind: 'terms', version: '1', signer: 'SYNTHETIC SIGNER', signedOn: '2026-10-01' };
    const recorded = ok(await call(uploadAgreement, platformAdmin, {}, input, upload(PDF)));
    const row = (await owner.query<{ document_ref: string; sha256: string }>('SELECT document_ref, sha256 FROM agreement WHERE id = $1', [recorded.objectId])).rows[0];
    expect(row?.sha256).toBe(sha(PDF));
    expect(row?.document_ref).toBe(`upload:agreements/${world.organizationId}/${recorded.objectId ?? ''}.pdf`);
    expect(readFileSync(path.join(scratch, 'agreements', 'agreements', world.organizationId, `${recorded.objectId ?? ''}.pdf`))).toEqual(Buffer.from(PDF));
    expect((await call(uploadAgreement, platformAdmin, {}, { ...input, kind: 'data_rights' }, upload(new TextEncoder().encode('not a pdf')))).status).toBe('invalid');
    expect((await call(uploadAgreement, platformAdmin, {}, { ...input, kind: 'data_rights' })).status).toBe('invalid');
  });

  it('lets the practice administrator confirm the chain only once it is complete, recorded in the audit log', async () => {
    const admin = world.adminUserId;
    const before = ok(await call(agreementsSettingsPage, admin, { practiceId: world.practiceId }));
    expect(before.missing).toEqual(['data_rights']);
    expect((await call(confirmAgreementsAction, admin, { practiceId: world.practiceId }, { confirm: 'on' })).status).toBe('invalid');
    await asOwner(owner, [world.practiceId], () =>
      owner.query("INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'data_rights', '1', now(), 'SYNTHETIC SIGNER', 'agreements/data-rights', $3)", [
        world.organizationId,
        world.practiceId,
        sha('data rights'),
      ]),
    );
    ok(await call(confirmAgreementsAction, admin, { practiceId: world.practiceId }, { confirm: 'on' }));
    const after = ok(await call(agreementsSettingsPage, admin, { practiceId: world.practiceId }));
    expect(after.missing).toEqual([]);
    expect(after.confirmation?.at).toBeInstanceOf(Date);
    const checklist = ok(await call(settingsPage, admin, { practiceId: world.practiceId })).checklist;
    expect(checklist?.find((step) => step.key === 'agreements')?.done).toBe(true);
    expect(checklist?.find((step) => step.key === 'upload')?.done).toBe(false);
  });
});

describe('the Settings screen', () => {
  it('saves the proof level with the rule stated, and queues the reconcile that applies it', async () => {
    const admin = world.adminUserId;
    const page = ok(await call(proofLevelPage, admin, { practiceId: world.practiceId }));
    expect(page).toMatchObject({ level: 'posted', moving: 0, canSet: true });
    expect(page.rule).toContain('without reopening its case');
    expect((await call(setProofLevelAction, admin, { practiceId: world.practiceId }, { proofLevel: 'deposited' })).status).toBe('invalid');
    ok(await call(setProofLevelAction, admin, { practiceId: world.practiceId }, { proofLevel: 'deposited', confirm: 'on' }));
    expect(ok(await call(proofLevelPage, admin, { practiceId: world.practiceId })).level).toBe('deposited');
    expect(queue.jobs.at(-1)).toEqual({ type: 'reconcile', payload: { practice_id: world.practiceId, day: clock.toISOString().slice(0, 10) } });
    const manager = await newCustomer('billing_manager');
    expect((await call(setProofLevelAction, manager, { practiceId: world.practiceId }, { proofLevel: 'posted', confirm: 'on' })).status).toBe('forbidden');
  });

  it('answers who read an object, newest first, for the practice’s administrators only', async () => {
    const admin = world.adminUserId;
    const claim = randomUUID();
    const reader = await newCustomer('billing_manager');
    await asOwner(owner, [world.practiceId], async () => {
      await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, at) VALUES ($1, 'user', 'read', 'claim', $2, $3, 'workspace', now() - interval '2 minutes')", [
        admin,
        claim,
        world.practiceId,
      ]);
      await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, at) VALUES ($1, 'user', 'read', 'claim', $2, $3, 'workspace', now() - interval '1 minute')", [
        reader,
        claim,
        world.practiceId,
      ]);
      await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose) VALUES ($1, 'user', 'read', 'claim', $2, $3, 'workspace')", [reader, randomUUID(), world.practiceId]);
    });
    const log = ok(await call(accessLogPage, admin, { practiceId: world.practiceId, object_type: 'claim', object_id: claim }));
    const emails = (await owner.query<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE id = ANY ($1::uuid[])', [[admin, reader]])).rows;
    const emailOf = (id: string) => emails.find((row) => row.id === id)?.email;
    expect(log.entries.map((entry) => entry.actor)).toEqual([emailOf(reader), emailOf(admin)]);
    expect(log.entries.every((entry) => entry.objectId === claim && entry.action === 'read')).toBe(true);
    expect((await call(accessLogPage, reader, { practiceId: world.practiceId, object_type: 'claim', object_id: claim })).status).toBe('forbidden');
  });
});

describe('support', () => {
  it('opens a ticket from a screen in the requester’s name, refuses one carrying an identifier, and lets the desk answer it', async () => {
    const customer = await newCustomer('billing_manager');
    const opened = ok(await call(createTicket, customer, {}, { screen: 'cases', category: 'question', subject: 'Export button', message: 'Where do I export the packet?' }));
    expect(opened.redirect).toMatch(/^\/support\?sent=\d+$/);
    expect(
      (await call(createTicket, customer, {}, { screen: 'cases', category: 'problem', subject: 'Claim question', message: 'Member ID W123456789 was underpaid, DOB 1961-04-12.' })).status,
    ).toBe('invalid');
    // A patient written in words is refused too: the desk reads tickets with no support grant (docs/adr/0055).
    const inWords = await call(createTicket, customer, {}, {
      screen: 'cases',
      category: 'problem',
      subject: 'Underpaid claim',
      message: 'Patient Zephyra Quillon, born March 3 1961, member ZQ4455667 was underpaid on claim CLM55512.',
    });
    expect(inWords.status).toBe('invalid');
    const mine = ok(await call(supportRequestPage, customer, { from: 'cases' }));
    expect(mine).toMatchObject({ from: 'cases', supportEmail: 'help@synthetic.test' });
    expect(mine.tickets.map((ticket) => ticket.subject)).toEqual(['Export button']);
    // Another customer sees none of it.
    expect(ok(await call(supportRequestPage, await newCustomer('viewer'), {})).tickets).toEqual([]);
    const desk = ok(await call(ticketsPage, supportEngineer, { status: 'open' }));
    const ticket = desk.tickets.find((row) => row.id === opened.objectId);
    expect(ticket).toMatchObject({ screen: 'cases', category: 'question', status: 'open' });
    expect(ticket?.requesterEmail).toMatch(/@synthetic\.test$/);
    expect(ticket?.organizations).toEqual(['SYNTHETIC ONBOARDING ORGANIZATION']);
    ok(await call(setTicketStatus, supportEngineer, {}, { ticketId: opened.objectId, status: 'answered' }));
    expect(ok(await call(supportRequestPage, customer, {})).tickets[0]?.status).toBe('answered');
    expect((await call(ticketsPage, customer, {})).status).toBe('forbidden');
  });
});

describe('the status page and maintenance', () => {
  it('shows components and incidents to anyone, as staff wrote them, and names nobody', async () => {
    expect(ok(await call(statusPage, null, {}))).toMatchObject({ overall: 'operational', maintenance: false, incidents: [], supportEmail: 'help@synthetic.test' });
    const opened = ok(await call(openIncident, platformAdmin, {}, { title: 'Slow uploads', impact: 'minor', components: 'uploads,jobs', message: 'Uploads are slower than usual.' }));
    ok(await call(updateIncident, platformAdmin, {}, { incidentId: opened.objectId, status: 'resolved', message: 'Fixed.' }));
    expect((await call(updateIncident, platformAdmin, {}, { incidentId: opened.objectId, status: 'monitoring', message: 'Again.' })).status).toBe('invalid');
    expect((await call(openIncident, platformAdmin, {}, { title: 'Call 919-555-0134', impact: 'minor', components: 'web', message: 'x' })).status).toBe('invalid');
    const page = ok(await call(statusPage, null, {}));
    expect(page.incidents.map((incident) => [incident.title, incident.status, incident.components])).toEqual([['Slow uploads', 'resolved', ['uploads', 'jobs']]]);
    expect(page.incidents[0]?.updates.map((update) => update.message)).toEqual(['Fixed.', 'Uploads are slower than usual.']);
    expect(JSON.stringify(page)).not.toContain(platformAdmin);
    expect((await call(consoleStatusPage, supportEngineer, {})).status).toBe('forbidden');
  });

  it('closes every customer screen while maintenance is on, keeps the console and the maintenance page open, and reopens', async () => {
    const customer = await newCustomer();
    ok(await call(setMaintenance, platformAdmin, {}, { on: 'true' }));
    try {
      expect(await call(practiceHome, customer, { practiceId: world.practiceId })).toEqual({ status: 'maintenance' });
      expect(ok(await call(maintenancePage, null, {})).maintenance).toBe(true);
      expect(ok(await call(statusPage, null, {})).overall).toBe('maintenance');
      expect(ok(await call(consoleStatusPage, platformAdmin, {})).maintenance).toBe(true);
    } finally {
      ok(await call(setMaintenance, platformAdmin, {}, { on: 'false' }));
      forgetMaintenanceFlag();
    }
    expect((await call(practiceHome, customer, { practiceId: world.practiceId })).status).toBe('ok');
  });
});

describe('the SOC 2 Type I evidence checklist', () => {
  it('shows nothing a person must do as done until it is recorded, then exports and sends the checklist', async () => {
    const before = ok(await call(compliancePage, platformAdmin, {}));
    expect(before.checklist.controls).toHaveLength(17);
    expect(before.checklist.policies.every((policy) => policy.status === 'awaiting_approval')).toBe(true);
    expect(before.workforce.map((member) => member.userId).sort()).toEqual([platformAdmin, supportEngineer].sort());
    const today = clock.toISOString().slice(0, 10);
    ok(await call(recordEvidence, platformAdmin, {}, { kind: 'policy_approval', policy: 'access-control', occurredOn: today, documentRef: 'records:policies/access-control-0.1', sha256: sha('approval') }));
    ok(await call(recordEvidence, platformAdmin, {}, { kind: 'training_attestation', member: supportEngineer, occurredOn: today, documentRef: 'records:training/2026', sha256: sha('training') }));
    expect((await call(recordEvidence, platformAdmin, {}, { kind: 'training_attestation', member: world.adminUserId, occurredOn: today, documentRef: 'records:x', sha256: sha('x') })).status).toBe('invalid');
    expect((await call(recordEvidence, platformAdmin, {}, { kind: 'access_review', occurredOn: '2099-01-01', documentRef: 'records:x', sha256: sha('x') })).status).toBe('invalid');
    const after = ok(await call(compliancePage, platformAdmin, {}));
    expect(after.checklist.policies.find((policy) => policy.policy.id === 'access-control')?.status).toBe('approved');
    const workforce = after.checklist.controls.find((control) => control.control.id === 'workforce')?.evidence[0];
    expect(workforce).toMatchObject({ status: 'stale', outstanding: [platformAdmin] });
    const download = ok(await call(exportEvidence, platformAdmin, {}));
    expect(download.download.contentType).toBe('application/json; charset=utf-8');
    expect(download.download.filename).toMatch(/^tp-compliance-evidence-\d{14}-[0-9a-f]{12}\.json$/);
    const evidence = complianceExportSchema.parse(JSON.parse(download.download.body));
    expect(evidence.environment).toBe('dev');
    expect(download.download.body).not.toContain(supportEngineer);
    ok(await call(sendEvidence, platformAdmin, {}, {}));
    expect(platform.sent).toHaveLength(1);
    expect((await call(compliancePage, supportEngineer, {})).status).toBe('forbidden');
  });
});
