import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  type DatabaseClient,
  type DatabasePool,
  LocalKeyProvider,
  type MembershipRole,
  PERSONAS,
  type PracticeCipher,
  databaseClient,
  openPool,
  provisionPracticeKey,
  readDatabaseUrl,
  rolesPermit,
  tenantTables,
} from '@tp/db';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route, RouteRequest, SampleRefs } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import { inviteMember } from './console';
import { ROUTES } from './index';
import { SAMPLE_PAYER_CLAIM_CONTROL_NUMBER } from './remittances';
import { seedContractWorld } from './test-support/contract-world';
import { scratchContentRoot } from './test-support/content-root';
import { loadRouteRelease, seedPricingRun } from './test-support/pricing-world';
import { seedTriage, seedTriageLine } from './test-support/triage-world';
import { seedMonitoring } from './test-support/monitoring-world';
import { seedLedger } from './test-support/ledger-world';
import { seedPacketLine, seedPackets } from './test-support/packet-world';

/**
 * Tests generated from the route registry, for every registered route (test matrix SEC-02 "every
 * table and route", SEC-03, SEC-04, SEC-15; PRD 6 "a user without MFA cannot reach any PHI route";
 * PRD 16 "a test calls each mutation with each role"; docs/adr/0017). A route added to the registry
 * gets all of them with nothing else to write:
 *
 * - no session, an idle session (30 minutes), a session past 12 hours: refused;
 * - a user without MFA: refused; an internal role signed in without a hardware key: refused;
 * - every persona (each customer role of the practice's group, each firm role through a grant, each
 *   internal role, the support engineer, the contract specialist and the reviewer through support
 *   grants): allowed exactly when the persona matrix allows the route's permission and the actor
 *   reaches the practice;
 * - a mutation replayed with its request key: does nothing;
 * - every persona of another practice, aimed at this practice's records or mixing them into its own
 *   request: never answered with any of this practice's records, and nothing of this practice changes;
 * - for practice routes, every internal role: never made a member of the practice's group (not through
 *   the console, not by the owner), so the route stays not found without a support grant (PRD 3).
 */

const adminUrl = readDatabaseUrl();
let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let tables: { table: string; tenantColumn: string }[];
const keys = LocalKeyProvider.random();
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-route-tests-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const content = scratchContentRoot();

beforeAll(async () => {
  database = await createMigratedDatabase(adminUrl);
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRouteRelease(owner);
  app = openPool(database.appUrl, 6);
  const sealer = new Sealer(randomBytes(32));
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
    keys,
    sealer,
    logger: createLogger({ sink: () => undefined }),
    uploads: new LocalUploadTargets('http://localhost:3100', documents, sealer),
    queue: new MemoryQueue(),
    documents,
    contentRoot: content.root,
  });
  tables = await tenantTables(owner);
}, 60_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
  rmSync(documentsDir, { recursive: true, force: true });
  content.remove();
});

class MemoryJar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      this.values.set(name, value);
    }
  }
  get(name: string): string | undefined {
    return this.values.get(name);
  }
  set(name: string, value: string): void {
    this.values.set(name, value);
  }
  delete(name: string): void {
    this.values.delete(name);
  }
}

type Persona =
  | { readonly kind: 'group'; readonly role: MembershipRole }
  | { readonly kind: 'firm'; readonly role: MembershipRole }
  | { readonly kind: 'internal'; readonly role: MembershipRole };

const PERSONA_LIST: readonly Persona[] = [
  ...(['practice_admin', 'billing_manager', 'analyst', 'viewer'] as const).map((role) => ({ kind: 'group' as const, role })),
  ...(['firm_principal', 'firm_analyst', 'billing_manager', 'analyst', 'viewer'] as const).map((role) => ({ kind: 'firm' as const, role })),
  ...(['platform_admin', 'contract_specialist', 'reviewer', 'support'] as const).map((role) => ({ kind: 'internal' as const, role })),
];

const label = (persona: Persona) => `${persona.kind} ${persona.role}`;

interface Actor {
  readonly persona: Persona;
  readonly userId: string;
  /** The roles the actor holds on the world's practice. */
  readonly practiceRoles: readonly MembershipRole[];
  /** The actor's internal roles. */
  readonly platformRoles: readonly MembershipRole[];
}

interface World {
  readonly tenant: TenantWorld;
  readonly refs: Omit<SampleRefs, 'actorDeviceId'>;
  readonly actors: readonly Actor[];
  /** Every ID of the world's records: none may reach an actor of another practice. */
  readonly ids: readonly string[];
}

async function lockedUser(organizationId: string): Promise<string> {
  const id = await createUser(owner);
  await addMembership(owner, organizationId, id, 'analyst');
  await owner.query("UPDATE \"user\" SET failed_sign_ins = 10, locked_at = now() WHERE id = $1", [id]);
  return id;
}

/**
 * A loaded remittance with one claim, one line and its adjustments, as the 835 loader writes them
 * (identifiers encrypted with the practice's key), for the Remittances and Claims and lines routes.
 */
async function seedRemittance(practiceId: string, cipher: PracticeCipher, uploader: string): Promise<{ remittanceId: string; claimId: string; serviceLineId: string; payerId: string; planId: string }> {
  return asOwner(
    owner,
    [practiceId],
    async () => {
      const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
      const document = await one(
        "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'x12_835', 1200, 'application/octet-stream', $2, $3, 'clean', now(), 'loaded') RETURNING id",
        [practiceId, uploader, randomBytes(32).toString('hex')],
      );
      const payer = await one("INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, '2U:SYNPAYERROUTE', 'SYNTHETIC PAYER ROUTE') RETURNING id", [practiceId]);
      const plan = await one("INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'CE:SYNPLAN-ROUTE') RETURNING id", [practiceId, payer]);
      const patient = await one('INSERT INTO patient_ref (practice_id, pseudonym, last_name, first_name) VALUES ($1, $2, $3, $4) RETURNING id', [
        practiceId,
        cipher.lookupHash('patient_ref.pseudonym', 'name|SYNTHLASTROUTE|SYNTHFIRSTROUTE||'),
        cipher.encrypt('patient_ref.last_name', 'SYNTHLASTROUTE'),
        cipher.encrypt('patient_ref.first_name', 'SYNTHFIRSTROUTE'),
      ]);
      const remittanceId = await one(
        `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
           payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
         VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', '000000001', '1', '0001', 'SYNEFTROUTE0001', '1SYN00000R', 8800, 'C', 'ACH', '2026-04-06', 'SYNTHETIC PAYER ROUTE', $3, '9900000001', 'XX', 1, 0)
         RETURNING id`,
        [practiceId, document, payer],
      );
      const claimId = await one(
        `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
           charge_cents, paid_cents, patient_resp_cents, filing_indicator, patient_ref_id, service_from, service_to)
         VALUES ($1, $2, 1, $3, $4, $5, '1', 16000, 8800, 2200, '12', $6, '2026-03-15', '2026-03-15') RETURNING id`,
        [
          practiceId,
          remittanceId,
          cipher.encrypt('claim.patient_control_number', 'SYNPCNROUTE0001'),
          cipher.encrypt('claim.payer_claim_control_number', SAMPLE_PAYER_CLAIM_CONTROL_NUMBER),
          cipher.lookupHash('claim.payer_claim_control_number', SAMPLE_PAYER_CLAIM_CONTROL_NUMBER),
          patient,
        ],
      );
      const serviceLineId = await one(
        `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date,
           observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
         VALUES ($1, $2, 1, 'HC', '97110', '{GP}', 16000, 8800, 2, '2026-03-15', 11000, 'paid_plus_pr', 2200, $3) RETURNING id`,
        [practiceId, claimId, plan],
      );
      await owner.query(
        "INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, amount_cents, position) VALUES ($1, $2, $3, 'CO', '45', 5000, 1), ($1, $2, $3, 'PR', '2', 2200, 2)",
        [practiceId, claimId, serviceLineId],
      );
      return { remittanceId, claimId, serviceLineId, payerId: payer, planId: plan };
    },
    uploader,
  );
}

/**
 * A practice with every persona: its group's members, a firm with a grant, the internal roles, and
 * support grants for the support engineer, the contract specialist and the reviewer (docs/adr/0028,
 * 0038); a loaded remittance; contracts at every state the contract screens show; a complete pricing
 * run of the remittance's lines under the signed-off version (docs/adr/0035); and its triage: an
 * anomaly, a case and audit reports (docs/adr/0038).
 */
async function buildWorld(name: string): Promise<World> {
  const tenant = await createTenantWorld(owner, name);
  const actors: Actor[] = [];
  const firmId = await createOrganization(owner, 'firm', `${name} firm`);
  const internalId = await createOrganization(owner, 'internal', `${name} internal`);
  let supportEngineerId = '';
  let specialistId = '';
  let reviewerId = '';
  let memberUserId = '';
  let membershipId = '';
  for (const persona of PERSONA_LIST) {
    const internal = persona.kind === 'internal';
    const userId = persona.kind === 'group' && persona.role === 'practice_admin' ? tenant.adminUserId : await createUser(owner, { hardwareKeyRequired: internal });
    if (userId !== tenant.adminUserId) {
      const membership = await addMembership(owner, persona.kind === 'group' ? tenant.organizationId : persona.kind === 'firm' ? firmId : internalId, userId, persona.role);
      if (persona.kind === 'group' && persona.role === 'viewer') {
        memberUserId = userId;
        membershipId = membership;
      }
    }
    if (persona.kind === 'internal' && persona.role === 'support') {
      supportEngineerId = userId;
    }
    if (persona.kind === 'internal' && persona.role === 'contract_specialist') {
      specialistId = userId;
    }
    if (persona.kind === 'internal' && persona.role === 'reviewer') {
      reviewerId = userId;
    }
    // Under a support grant a support engineer holds support, a contract specialist contract_specialist,
    // a reimbursement reviewer reviewer (docs/adr/0038).
    const granted = persona.kind === 'internal' && (persona.role === 'support' || persona.role === 'contract_specialist' || persona.role === 'reviewer');
    actors.push({
      persona,
      userId,
      practiceRoles: persona.kind === 'internal' ? (granted ? [persona.role] : []) : [persona.role],
      platformRoles: internal ? [persona.role] : [],
    });
  }
  const agreementId = randomUUID();
  const grantId = randomUUID();
  const supportGrantId = randomUUID();
  await asOwner(owner, [tenant.practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now(), 'SYNTHETIC SIGNER', 'agreements/engagement', $4)`,
      [agreementId, firmId, tenant.practiceId, randomBytes(32).toString('hex')],
    );
    await owner.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, '{"roles":["firm_principal","firm_analyst","billing_manager","analyst","viewer"]}', now() + interval '30 days', $4, $5)`,
      [grantId, firmId, tenant.practiceId, tenant.adminUserId, agreementId],
    );
    await owner.query(`INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYN-1', 'SYNTHETIC', now() + interval '4 hours')`, [
      supportGrantId,
      tenant.practiceId,
      supportEngineerId,
    ]);
    await owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SYN-2', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')`, [
      tenant.practiceId,
      specialistId,
    ]);
    await owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SYN-3', 'SYNTHETIC AUDIT REVIEW', now() + interval '4 hours')`, [
      tenant.practiceId,
      reviewerId,
    ]);
    await owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, 'user', 'read', 'practice', $2, $2, $3, 'workspace')", [
      supportEngineerId,
      tenant.practiceId,
      supportGrantId,
    ]);
  });
  // The practice's real data key (the world's is a placeholder), so the upload receiver can seal its
  // bytes; and one upload awaiting its bytes, with a local upload token for it.
  const key = await provisionPracticeKey(keys, tenant.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, tenant.practiceId]);
  const documentId = randomUUID();
  await asOwner(owner, [tenant.practiceId], () =>
    owner.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', 1200, 'application/octet-stream', $3)", [
      documentId,
      tenant.practiceId,
      tenant.adminUserId,
    ]),
  );
  const target = await services.uploads.target({ practiceId: tenant.practiceId, documentId, sizeBytes: 1200, contentType: 'application/octet-stream' }, new Date());
  const uploadToken = new URL(target.url).searchParams.get('token') ?? '';
  const loaded = await seedRemittance(tenant.practiceId, key.cipher, tenant.adminUserId);
  const contracts = await seedContractWorld({
    owner,
    app,
    documents,
    cipher: key.cipher,
    practiceId: tenant.practiceId,
    payerId: loaded.payerId,
    customerId: tenant.adminUserId,
    specialistId,
  });
  const manager = actors.find((actor) => actor.persona.kind === 'group' && actor.persona.role === 'billing_manager')?.userId ?? '';
  const triageLineId = await seedTriageLine({ owner, practiceId: tenant.practiceId, claimId: loaded.claimId, planId: loaded.planId });
  const packetLineId = await seedPacketLine({ owner, practiceId: tenant.practiceId, claimId: loaded.claimId, planId: loaded.planId });
  const { pricingRunId, rerunId } = await seedPricingRun({ owner, app, practiceId: tenant.practiceId, planId: loaded.planId, signedOffVersionId: contracts.signedOffVersionId, managerId: manager });
  const triage = await seedTriage({
    owner,
    app,
    keys,
    documents,
    practiceId: tenant.practiceId,
    pricingRunId,
    flaggedLineId: loaded.serviceLineId,
    caseLineServiceLineId: triageLineId,
    payerId: loaded.payerId,
    planId: loaded.planId,
    signedOffVersionId: contracts.signedOffVersionId,
    managerId: manager,
    reviewerId,
  });
  const packets = await seedPackets({
    owner,
    app,
    keys,
    documents,
    practiceId: tenant.practiceId,
    pricingRunId,
    caseId: triage.caseId,
    packetLineServiceLineId: packetLineId,
    payerId: loaded.payerId,
    planId: loaded.planId,
    signedOffVersionId: contracts.signedOffVersionId,
    analystId: actors.find((actor) => actor.persona.kind === 'group' && actor.persona.role === 'analyst')?.userId ?? '',
    managerId: manager,
    uploaderId: tenant.adminUserId,
  });
  const monitoring = await seedMonitoring({ owner, practiceId: tenant.practiceId, adminUserId: tenant.adminUserId, pricingRunId, payerId: loaded.payerId });
  const ledger = await seedLedger({
    owner,
    app,
    keys,
    documents,
    practiceId: tenant.practiceId,
    cipher: key.cipher,
    uploaderId: tenant.adminUserId,
    managerId: manager,
    payerId: loaded.payerId,
    planId: loaded.planId,
    remittanceId: loaded.remittanceId,
    caseServiceLineId: triageLineId,
  });
  const locked = await lockedUser(tenant.organizationId);
  const refs = {
    practiceId: tenant.practiceId,
    organizationId: tenant.organizationId,
    agreementId: tenant.agreementId,
    adminUserId: tenant.adminUserId,
    memberUserId,
    membershipId,
    lockedUserId: locked,
    firmId,
    grantId,
    supportGrantId,
    supportEngineerId,
    internalOrganizationId: internalId,
    documentId,
    uploadToken,
    ...loaded,
    ...contracts,
    pricingRunId,
    rerunId,
    ...triage,
    ...monitoring,
    ...ledger,
    ...packets,
  };
  return { tenant, refs, actors, ids: [...new Set([...Object.values(refs), agreementId, ...actors.map((actor) => actor.userId)])] };
}

interface SignedIn {
  readonly token: string;
  readonly deviceId: string;
  readonly sessionId: string;
}

/** A session the way sign-in opens one: a hardware key for internal roles, TOTP otherwise. */
async function signIn(actor: Actor): Promise<SignedIn> {
  const opened = await openSession(app, {
    userId: actor.userId,
    method: actor.persona.kind === 'internal' ? 'webauthn' : 'totp',
    deviceToken: undefined,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0',
    requestId: 'route-test',
  });
  return { token: opened.sessionToken, deviceId: opened.deviceId, sessionId: opened.sessionId };
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** A session written straight into the tables (for states sign-in never produces). */
async function rawSession(userId: string, method: 'totp' | 'webauthn'): Promise<SignedIn> {
  const token = randomBytes(32).toString('base64url');
  const device = await owner.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux') RETURNING id", [userId, sha(randomUUID())]);
  const deviceId = device.rows[0]?.id ?? '';
  const session = await owner.query<{ id: string }>('INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, $4) RETURNING id', [userId, deviceId, sha(token), method]);
  return { token, deviceId, sessionId: session.rows[0]?.id ?? '' };
}

function call<R>(route: Route<R>, session: SignedIn | undefined, refs: SampleRefs, requestKey: string = randomUUID()): Promise<Outcome<R>> {
  const params = route.sample?.params(refs) ?? {};
  const input = route.mutation ? { ...(route.sample?.input?.(refs) ?? {}), requestKey } : route.sample?.input?.(refs);
  const upload = route.sample?.upload?.(refs);
  const request: RouteRequest = {
    cookies: new MemoryJar(session === undefined ? {} : { [SESSION_COOKIE]: session.token }),
    params,
    input,
    ...(upload === undefined
      ? {}
      : {
          upload: {
            contentType: upload.contentType,
            contentLength: upload.body.length,
            body: Readable.from([upload.body]),
          },
        }),
    requestId: `test-${randomUUID()}`,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0',
  };
  return route.invoke(request, services);
}

/** A digest of every row of the practice's: tenant tables, its group's members and their devices and sessions. */
async function snapshot(world: World): Promise<string> {
  const parts: string[] = [];
  for (const { table, tenantColumn } of tables) {
    const { rows } = await owner.query<{ h: string }>(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t WHERE ${tenantColumn} = $1`, [world.refs.practiceId]);
    parts.push(`${table}:${rows[0]?.h ?? ''}`);
  }
  const users = world.actors.map((actor) => actor.userId);
  for (const [table, column] of [
    ['membership', 'user_id'],
    ['user', 'id'],
    ['user_device', 'user_id'],
    ['user_session', 'user_id'],
  ] as const) {
    const { rows } = await owner.query<{ h: string }>(
      `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t WHERE ${column} = ANY ($1::uuid[])`,
      [users],
    );
    parts.push(`${table}:${rows[0]?.h ?? ''}`);
  }
  return parts.join('\n');
}

/** What the persona matrix and the routes to the practice say the actor gets. */
function expected(route: Route, actor: Actor): Outcome<unknown>['status'] {
  switch (route.access.kind) {
    case 'public':
    case 'self':
      return 'ok';
    case 'platform':
      return rolesPermit(actor.platformRoles, route.access.permission) ? 'ok' : 'forbidden';
    case 'practice':
      if (actor.practiceRoles.length === 0) {
        return 'not_found';
      }
      return rolesPermit(actor.practiceRoles, route.access.permission) ? 'ok' : 'forbidden';
  }
}

const authenticated = ROUTES.filter((route) => route.access.kind !== 'public');
const publicRoutes = ROUTES.filter((route) => route.access.kind === 'public');

it('generates tests for every registered route, and every authenticated route has a sample', () => {
  expect(ROUTES.length).toBeGreaterThan(20);
  expect(authenticated.filter((route) => route.sample === undefined).map((route) => route.id)).toEqual([]);
});

describe.each(authenticated.map((route) => [route.id, route] as const))('%s', (_id, route) => {
  let worldA: World;
  let worldB: World;

  beforeAll(async () => {
    worldA = await buildWorld(`A ${route.id}`);
    worldB = await buildWorld(`B ${route.id}`);
  }, 60_000);

  const refsFor = (world: World, session: SignedIn): SampleRefs => ({ ...world.refs, actorDeviceId: session.deviceId });
  const admin = () => worldA.actors[0] as Actor;

  it('refuses a request without a session', async () => {
    expect(await call(route, undefined, { ...worldA.refs, actorDeviceId: randomUUID() })).toEqual({ status: 'unauthenticated', reason: 'none' });
  });

  it('refuses a session idle for more than 30 minutes, or past 12 hours, on the next request (SEC-15)', async () => {
    const idle = await signIn(admin());
    await owner.query("UPDATE user_session SET last_seen_at = now() - interval '31 minutes' WHERE id = $1", [idle.sessionId]);
    expect(await call(route, idle, refsFor(worldA, idle))).toEqual({ status: 'unauthenticated', reason: 'idle' });
    expect(await call(route, idle, refsFor(worldA, idle))).toEqual({ status: 'unauthenticated', reason: 'ended' });
    const old = await signIn(admin());
    await owner.query("UPDATE user_session SET started_at = now() - interval '12 hours', expires_at = now() WHERE id = $1", [old.sessionId]);
    expect(await call(route, old, refsFor(worldA, old))).toEqual({ status: 'unauthenticated', reason: 'expired' });
  });

  it('refuses a user without MFA (PRD 6: no PHI route without MFA)', async () => {
    const person = await createUser(owner, { mfaEnrolled: false });
    await addMembership(owner, worldA.refs.organizationId, person, 'billing_manager');
    const session = await rawSession(person, 'totp');
    expect(await call(route, session, refsFor(worldA, session))).toEqual({ status: 'mfa_required' });
  });

  it('refuses an internal role signed in without a hardware key', async () => {
    const platformAdmin = worldA.actors.find((actor) => actor.persona.role === 'platform_admin') as Actor;
    const session = await rawSession(platformAdmin.userId, 'totp');
    expect(await call(route, session, refsFor(worldA, session))).toEqual({ status: 'hardware_key_required' });
  });

  it.each(PERSONA_LIST.map((persona) => [label(persona), persona] as const))('answers %s as the persona matrix says', async (_label, persona) => {
    const actor = worldA.actors.find((candidate) => candidate.persona === persona) as Actor;
    const session = await signIn(actor);
    const outcome = await call(route, session, refsFor(worldA, session));
    const want = expected(route, actor);
    expect(outcome.status, `${label(persona)} (${PERSONAS[persona.role].persona})`).toBe(want);
  });

  if (route.mutation) {
    it('does nothing when a mutation is replayed with its request key', async () => {
      // On the other world, which the persona calls above have not touched.
      const allowed = worldB.actors.find((actor) => expected(route, actor) === 'ok') as Actor;
      const session = await signIn(allowed);
      const key = randomUUID();
      const refs = refsFor(worldB, session);
      expect((await call(route, session, refs, key)).status).toBe('ok');
      // The same user and key from a fresh session (the first call may have ended its own).
      expect((await call(route, await signIn(allowed), refs, key)).status).toBe('duplicate');
    });
  }

  it.each(PERSONA_LIST.map((persona) => [label(persona), persona] as const))(
    'gives %s of another practice nothing of this practice, and changes nothing of it',
    async (_label, persona) => {
      const outsider = worldB.actors.find((candidate) => candidate.persona === persona) as Actor;
      // A platform administrator manages every organization by design; that is not a tenant's reach.
      const manages = route.access.kind === 'platform' && expected(route, outsider) === 'ok';
      const deviceOfA = await signIn(admin());
      const before = await snapshot(worldA);
      // Aimed at this practice's records.
      const aimed = await signIn(outsider);
      const atA = await call(route, aimed, refsFor(worldA, deviceOfA));
      // Its own practice, with this practice's records mixed in wherever the route names other records.
      const mixed = await signIn(outsider);
      const ownWithA = await call(route, mixed, { ...refsFor(worldA, deviceOfA), practiceId: worldB.refs.practiceId, organizationId: worldB.refs.organizationId });
      const after = await snapshot(worldA);
      if (manages) {
        return;
      }
      for (const outcome of [atA, ownWithA]) {
        const text = JSON.stringify(outcome);
        expect(
          worldA.ids.filter((id) => text.includes(id)),
          `${label(persona)} saw practice A's records through ${route.id}`,
        ).toEqual([]);
      }
      if (route.access.kind === 'practice') {
        expect(atA.status).toBe('not_found');
      }
      expect(after).toBe(before);
    },
  );
});

const INTERNAL_ROLES = ['platform_admin', 'contract_specialist', 'reviewer', 'support'] as const;

describe.each(ROUTES.filter((route) => route.access.kind === 'practice').map((route) => [route.id, route] as const))('%s (internal roles)', (_id, route) => {
  let worldA: World;
  let worldB: World;

  beforeAll(async () => {
    worldA = await buildWorld(`A internal ${route.id}`);
    worldB = await buildWorld(`B internal ${route.id}`);
  }, 60_000);

  it.each(INTERNAL_ROLES)('never makes the internal %s a member of the practice’s group, so the route stays not found', async (role) => {
    // Another world's staff, who hold no support grant on this practice.
    const staff = worldB.actors.find((actor) => actor.persona.kind === 'internal' && actor.persona.role === role) as Actor;
    const inviter = worldA.actors.find((actor) => actor.persona.role === 'platform_admin') as Actor;
    const email = (await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [staff.userId])).rows[0]?.email ?? '';
    const adminSession = await signIn(inviter);
    for (const memberRole of ['practice_admin', 'viewer'] as const) {
      const invited = await inviteMember.invoke(
        {
          cookies: new MemoryJar({ [SESSION_COOKIE]: adminSession.token }),
          params: {},
          input: { requestKey: randomUUID(), organizationId: worldA.refs.organizationId, email, role: memberRole },
          requestId: `test-${randomUUID()}`,
          userAgent: null,
        },
        services,
      );
      expect(invited.status, `${role} invited as ${memberRole}`).toBe('invalid');
    }
    await expect(addMembership(owner, worldA.refs.organizationId, staff.userId, 'practice_admin')).rejects.toMatchObject({ code: '23514' });
    const session = await signIn(staff);
    expect((await call(route, session, { ...worldA.refs, actorDeviceId: session.deviceId })).status).toBe('not_found');
  });
});

describe.each(publicRoutes.map((route) => [route.id, route] as const))('%s (public)', (_id, route) => {
  it('answers without a session and reads or changes no tenant record', async () => {
    const world = await buildWorld(`public ${route.id}`);
    const before = await snapshot(world);
    const outcome = await call(route, undefined, { ...world.refs, actorDeviceId: randomUUID() });
    expect(['ok', 'invalid', 'not_found']).toContain(outcome.status);
    const text = JSON.stringify(outcome);
    expect(world.ids.filter((id) => text.includes(id))).toEqual([]);
    expect(await snapshot(world)).toBe(before);
  });
});
