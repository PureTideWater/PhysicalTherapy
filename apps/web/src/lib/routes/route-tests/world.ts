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
  type PracticeCipher,
  databaseClient,
  openPool,
  provisionPracticeKey,
  readDatabaseUrl,
  rolesPermit,
  tenantTables,
} from '@tp/db';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll } from 'vitest';

import { DevAuthProvider } from '../../auth/dev-provider';
import { MemoryDevStore } from '../../auth/dev-store';
import { Sealer } from '../../auth/seal';
import { SESSION_COOKIE, openSession } from '../../auth/sessions';
import { csrfTokenFor } from '../../http/csrf';
import { forgetMaintenanceFlag } from '../../http/invoke';
import type { CookieJar, Outcome, Route, RouteRequest, SampleRefs } from '../../http/route';
import { type Services, createServices } from '../../server/services';
import { MemoryQueue } from '../../uploads/queue';
import { LocalUploadTargets } from '../../uploads/targets';
import { SAMPLE_PAYER_CLAIM_CONTROL_NUMBER } from '../remittances';
import { seedBilling } from '../test-support/billing-world';
import { scratchContentRoot } from '../test-support/content-root';
import { seedContractWorld } from '../test-support/contract-world';
import { seedLedger } from '../test-support/ledger-world';
import { seedModelProposals } from '../test-support/model-world';
import { seedMonitoring } from '../test-support/monitoring-world';
import { acceptCurrentTerms, publishSyntheticTerms, seedOnboarding } from '../test-support/onboarding-world';
import { seedPacketCases, seedPacketLine, seedPackets } from '../test-support/packet-world';
import { loadRouteRelease, seedPricingRun } from '../test-support/pricing-world';
import { seedReportDocument } from '../test-support/report-world';
import { seedTriage, seedTriageLine } from '../test-support/triage-world';

/**
 * Test support for the tests generated from the route registry (define.ts) and their snapshot case
 * (snapshot.db.test.ts): one migrated database per test file, the web app's services over it, and synthetic worlds,
 * each a practice with every persona and a record of every kind the routes name. Synthetic data only.
 */

export class MemoryJar implements CookieJar {
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

export type Persona =
  | { readonly kind: 'group'; readonly role: MembershipRole }
  | { readonly kind: 'firm'; readonly role: MembershipRole }
  | { readonly kind: 'internal'; readonly role: MembershipRole };

export const PERSONA_LIST: readonly Persona[] = [
  ...(['practice_admin', 'billing_manager', 'analyst', 'viewer'] as const).map((role) => ({ kind: 'group' as const, role })),
  ...(['firm_principal', 'firm_analyst', 'billing_manager', 'analyst', 'viewer'] as const).map((role) => ({ kind: 'firm' as const, role })),
  ...(['platform_admin', 'contract_specialist', 'reviewer', 'support'] as const).map((role) => ({ kind: 'internal' as const, role })),
];

export const label = (persona: Persona) => `${persona.kind} ${persona.role}`;

export interface Actor {
  readonly persona: Persona;
  readonly userId: string;
  /** The roles the actor holds on the world's practice. */
  readonly practiceRoles: readonly MembershipRole[];
  /** The actor's internal roles. */
  readonly platformRoles: readonly MembershipRole[];
}

export interface World {
  readonly tenant: TenantWorld;
  readonly refs: Omit<SampleRefs, 'actorDeviceId'>;
  readonly actors: readonly Actor[];
  /** Every ID of the world's records: none may reach an actor of another practice. */
  readonly ids: readonly string[];
}

export interface SignedIn {
  readonly token: string;
  readonly deviceId: string;
  readonly sessionId: string;
}

export interface CallOptions {
  /** The CSRF token sent, instead of the session's own (null: none). */
  readonly csrfToken?: string | null;
  /** The browser's Origin header. */
  readonly origin?: string;
}

/** Sample records that belong to no practice: anyone may see them. */
const GLOBAL_REFS: ReadonlySet<string> = new Set(['termsVersionId', 'incidentId']);

/** The people's rows a snapshot covers besides the tenant tables, by the column naming their user. */
const PEOPLE_TABLES = [
  ['membership', 'user_id'],
  ['user', 'id'],
  ['user_device', 'user_id'],
  ['user_session', 'user_id'],
] as const;

/** The digest of a table's rows that a snapshot line carries: the same rows in the same order, the same md5. */
const ROWS_DIGEST = "md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), ''))";

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

/**
 * The snapshot as one statement, built from the tenant tables the catalog names (so a new tenant table joins it with
 * nothing to write): $1 is the practice, $2 its people. It returns exactly the string perTableSnapshot() joins, line for
 * line, and every line is read in the statement's one snapshot, where perTableSnapshot()'s 53 reads each take their
 * own. An ARRAY constructor joins the lines, not concat_ws(), whose arguments PostgreSQL caps at 100.
 */
export function foldedSnapshotSql(tables: readonly { readonly table: string; readonly tenantColumn: string }[]): string {
  const lines = [
    ...tables.map(({ table, tenantColumn }) => ({ table, where: `${identifier(tenantColumn)} = $1` })),
    ...PEOPLE_TABLES.map(([table, column]) => ({ table, where: `${identifier(column)} = ANY ($2::uuid[])` })),
  ].map(({ table, where }) => `${literal(`${table}:`)} || coalesce((SELECT ${ROWS_DIGEST} FROM ${identifier(table)} t WHERE ${where}), '')`);
  return `SELECT array_to_string(ARRAY[\n  ${lines.join(',\n  ')}\n]::text[], E'\\n') AS snapshot`;
}

/** What the persona matrix and the routes to the practice say the actor gets. */
export function expected(route: Route, actor: Actor): Outcome<unknown>['status'] {
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
    case 'organization':
      // The route names the practice's group: its members hold their role there; nobody else is a member.
      if (actor.persona.kind !== 'group') {
        return 'not_found';
      }
      return rolesPermit([actor.persona.role], route.access.permission) ? 'ok' : 'forbidden';
  }
}

/** The first persona of the practice's group the persona matrix lets use the route, if any (a customer). */
export function customerPersona(route: Route): Persona | undefined {
  return PERSONA_LIST.find((persona) => persona.kind === 'group' && expected(route, { persona, userId: '', practiceRoles: [persona.role], platformRoles: [] }) === 'ok');
}

/** The snapshot without the people's sessions and devices, which a request touches (its last-seen time). */
export function tenantRows(digest: string): string {
  return digest
    .split('\n')
    .filter((line) => !line.startsWith('user_session:') && !line.startsWith('user_device:'))
    .join('\n');
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

interface Opened {
  readonly database: MigratedDatabase;
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  readonly billingPool: DatabasePool;
  readonly esignPool: DatabasePool;
  readonly services: Services;
  readonly tables: readonly { readonly table: string; readonly tenantColumn: string }[];
  readonly snapshotSql: string;
  /** The sealed documents' directory, and the content root the services read: this file's own, removed by close(). */
  readonly documentsDir: string;
  readonly documents: DocumentStore;
  readonly content: ReturnType<typeof scratchContentRoot>;
}

/** One test file's database, services and worlds (routeWorldsForThisFile() opens it before the file's tests and closes it after). */
export class RouteWorlds {
  private readonly keys = LocalKeyProvider.random();
  private state: Opened | undefined;

  private get opened(): Opened {
    if (this.state === undefined) {
      throw new Error('the route worlds are used before their beforeAll opened them');
    }
    return this.state;
  }

  /** The database's owner connection (row-level security bypassed): it builds the worlds and reads the snapshots. */
  get owner(): DatabaseClient {
    return this.opened.owner;
  }

  get services(): Services {
    return this.opened.services;
  }

  /** The tenant tables the catalog names (tenantTables()), which every snapshot covers in this order. */
  get tables(): readonly { readonly table: string; readonly tenantColumn: string }[] {
    return this.opened.tables;
  }

  async open(): Promise<void> {
    const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-route-tests-'));
    const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
    const content = scratchContentRoot();
    const removeDirectories = () => {
      rmSync(documentsDir, { recursive: true, force: true });
      content.remove();
    };
    let database: MigratedDatabase;
    try {
      database = await createMigratedDatabase(readDatabaseUrl());
    } catch (error) {
      removeDirectories();
      throw error;
    }
    const owner = databaseClient(database.url);
    const pools: DatabasePool[] = [];
    const pool = (url: string, max: number) => {
      const opened = openPool(url, max);
      pools.push(opened);
      return opened;
    };
    try {
      await owner.connect();
      await loadRouteRelease(owner);
      const app = pool(database.appUrl, 6);
      const billingPool = pool(database.billingUrl, 4);
      const esignPool = pool(database.esignUrl, 2);
      const sealer = new Sealer(randomBytes(32));
      const services = createServices({
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
        keys: this.keys,
        sealer,
        logger: createLogger({ sink: () => undefined }),
        uploads: new LocalUploadTargets('http://localhost:3100', documents, sealer),
        queue: new MemoryQueue(),
        documents,
        contentRoot: content.root,
      });
      const tables = await tenantTables(owner);
      this.state = { database, owner, app, billingPool, esignPool, services, tables, snapshotSql: foldedSnapshotSql(tables), documentsDir, documents, content };
      // The terms of use are in force from the start, so every generated test runs behind the terms gate; each
      // world's people accept them (docs/adr/0053).
      await publishSyntheticTerms(owner, await createUser(owner));
    } catch (error) {
      // Nothing of a half-opened file is left behind: its pools, its connection, its database and its directories.
      this.state = undefined;
      for (const opened of pools) {
        await endPool(opened);
      }
      await owner.end().catch(() => undefined);
      await database.drop();
      removeDirectories();
      throw error;
    }
  }

  async close(): Promise<void> {
    const opened = this.state;
    this.state = undefined;
    if (opened !== undefined) {
      await endPool(opened.app);
      await endPool(opened.billingPool);
      await endPool(opened.esignPool);
      await opened.owner.end();
      await opened.database.drop();
      rmSync(opened.documentsDir, { recursive: true, force: true });
      opened.content.remove();
    }
  }

  private async lockedUser(organizationId: string): Promise<string> {
    const { owner } = this.opened;
    const id = await createUser(owner);
    await addMembership(owner, organizationId, id, 'analyst');
    await owner.query("UPDATE \"user\" SET failed_sign_ins = 10, locked_at = now() WHERE id = $1", [id]);
    return id;
  }

  /**
   * A loaded remittance with one claim, one line and its adjustments, as the 835 loader writes them
   * (identifiers encrypted with the practice's key), for the Remittances and Claims and lines routes.
   */
  private async seedRemittance(practiceId: string, cipher: PracticeCipher, uploader: string): Promise<{ remittanceId: string; claimId: string; serviceLineId: string; payerId: string; planId: string }> {
    const { owner } = this.opened;
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
  async buildWorld(name: string): Promise<World> {
    const { owner, app, billingPool, services, documents } = this.opened;
    const { keys } = this;
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
    const loaded = await this.seedRemittance(tenant.practiceId, key.cipher, tenant.adminUserId);
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
    const regulationLineId = await seedPacketLine({ owner, practiceId: tenant.practiceId, claimId: loaded.claimId, planId: loaded.planId, lineNo: 4, serviceDate: '2026-03-18' });
    const { pricingRunId, rerunId } = await seedPricingRun({ owner, app, practiceId: tenant.practiceId, planId: loaded.planId, signedOffVersionId: contracts.signedOffVersionId, managerId: manager });
    // The packets' own cases, before the audit report's triage (which would take their lines, their windows verified, into its case).
    const packetCases = await seedPacketCases({
      owner,
      practiceId: tenant.practiceId,
      pricingRunId,
      packetLineServiceLineId: packetLineId,
      regulationLineServiceLineId: regulationLineId,
      payerId: loaded.payerId,
      planId: loaded.planId,
      signedOffVersionId: contracts.signedOffVersionId,
      uploaderId: tenant.adminUserId,
    });
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
    const packets = await seedPackets(
      {
        owner,
        app,
        keys,
        documents,
        practiceId: tenant.practiceId,
        caseId: triage.caseId,
        analystId: actors.find((actor) => actor.persona.kind === 'group' && actor.persona.role === 'analyst')?.userId ?? '',
        managerId: manager,
        reviewerId,
      },
      packetCases,
    );
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
    const reportDocument = await seedReportDocument({ app, keys, documents, practiceId: tenant.practiceId, managerId: manager });
    const models = await seedModelProposals({ app, keys, documents, practiceId: tenant.practiceId, specialistId, managerId: manager, draftVersionId: contracts.draftVersionId, contractDocumentId: contracts.contractDocumentId });
    const billing = await seedBilling({ owner, pool: billingPool, provider: services.billing, organizationId: tenant.organizationId });
    const locked = await this.lockedUser(tenant.organizationId);
    const platformAdminId = actors.find((actor) => actor.persona.kind === 'internal' && actor.persona.role === 'platform_admin')?.userId ?? '';
    const onboarding = await seedOnboarding({ owner, organizationId: tenant.organizationId, practiceId: tenant.practiceId, adminUserId: tenant.adminUserId, platformAdminId });
    await acceptCurrentTerms(
      owner,
      actors.map((actor) => actor.userId),
    );
    const termsVersionId = (await owner.query<{ id: string | null }>('SELECT current_terms_version() AS id')).rows[0]?.id ?? '';
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
      ...reportDocument,
      ...models,
      ...billing,
      ...onboarding,
      termsVersionId,
    };
    // The terms of use in force and the status page's incident are everyone's, not the practice's.
    const tenantRefs = Object.entries(refs).flatMap(([key, value]) => (GLOBAL_REFS.has(key) ? [] : [value]));
    return { tenant, refs, actors, ids: [...new Set([...tenantRefs, agreementId, ...actors.map((actor) => actor.userId)])] };
  }

  /** A session the way sign-in opens one: a hardware key for internal roles, TOTP otherwise. */
  async signIn(actor: Actor): Promise<SignedIn> {
    const opened = await openSession(this.opened.app, {
      userId: actor.userId,
      method: actor.persona.kind === 'internal' ? 'webauthn' : 'totp',
      deviceToken: undefined,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0',
      requestId: 'route-test',
    });
    return { token: opened.sessionToken, deviceId: opened.deviceId, sessionId: opened.sessionId };
  }

  /** A session written straight into the tables (for states sign-in never produces). */
  async rawSession(userId: string, method: 'totp' | 'webauthn'): Promise<SignedIn> {
    const { owner } = this.opened;
    const token = randomBytes(32).toString('base64url');
    const device = await owner.query<{ id: string }>("INSERT INTO user_device (user_id, token_sha256, label) VALUES ($1, $2, 'Chrome on Linux') RETURNING id", [userId, sha(randomUUID())]);
    const deviceId = device.rows[0]?.id ?? '';
    const session = await owner.query<{ id: string }>('INSERT INTO user_session (user_id, device_id, token_sha256, mfa_method) VALUES ($1, $2, $3, $4) RETURNING id', [userId, deviceId, sha(token), method]);
    return { token, deviceId, sessionId: session.rows[0]?.id ?? '' };
  }

  call<R>(route: Route<R>, session: SignedIn | undefined, refs: SampleRefs, requestKey: string = randomUUID(), options: CallOptions = {}): Promise<Outcome<R>> {
    const { services } = this.opened;
    const params = route.sample?.params(refs) ?? {};
    const csrfToken = options.csrfToken === undefined ? csrfTokenFor(services.sealer, session?.token) : options.csrfToken;
    const input = route.mutation ? { ...(route.sample?.input?.(refs) ?? {}), requestKey, csrfToken } : route.sample?.input?.(refs);
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
      ...(options.origin === undefined ? {} : { origin: options.origin, fetchSite: 'cross-site' }),
    };
    return route.invoke(request, services);
  }

  async setMaintenance(on: boolean): Promise<void> {
    await this.opened.owner.query(
      `INSERT INTO feature_flag (key, scope, scope_id, value) VALUES ('platform.maintenance', 'global', NULL, $1::jsonb)
       ON CONFLICT ON CONSTRAINT feature_flag_once DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(on)],
    );
    forgetMaintenanceFlag();
  }

  /**
   * A digest of every row of the practice's: tenant tables, its group's members and their devices and sessions, read
   * in one statement (foldedSnapshotSql) prepared once per connection. snapshot.db.test.ts holds it to
   * perTableSnapshot() on every run.
   */
  async snapshot(world: World): Promise<string> {
    const { owner, snapshotSql } = this.opened;
    const { rows } = await owner.query<{ snapshot: string }>({
      name: 'route-tests-snapshot',
      text: snapshotSql,
      values: [world.refs.practiceId, world.actors.map((actor) => actor.userId)],
    });
    const digest = rows[0]?.snapshot;
    if (digest === undefined) {
      throw new Error('the snapshot statement returned no row');
    }
    return digest;
  }

  /** The snapshot as the route tests took it before the fold: one statement per table, each line its table's digest. */
  async perTableSnapshot(world: World): Promise<string> {
    const { owner, tables } = this.opened;
    const parts: string[] = [];
    for (const { table, tenantColumn } of tables) {
      const { rows } = await owner.query<{ h: string }>(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t WHERE ${tenantColumn} = $1`, [world.refs.practiceId]);
      parts.push(`${table}:${rows[0]?.h ?? ''}`);
    }
    const users = world.actors.map((actor) => actor.userId);
    for (const [table, column] of PEOPLE_TABLES) {
      const { rows } = await owner.query<{ h: string }>(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS h FROM "${table}" t WHERE ${column} = ANY ($1::uuid[])`, [users]);
      parts.push(`${table}:${rows[0]?.h ?? ''}`);
    }
    return parts.join('\n');
  }

  /** An open invoice of the world's group whose payment failed 31 days ago (as Stripe's events leave one): the group is suspended. */
  async suspendForNonpayment(world: World): Promise<string> {
    const { rows } = await this.opened.owner.query<{ id: string }>(
      `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents,
         attempt_count, first_failed_at, last_failure_code, stripe_event_at)
       SELECT o.id, $2, o.billing_customer_ref, 'audit', 'open', 'usd', 250000, 0, 250000, 1, now() - interval '31 days', 'insufficient_funds', now() - interval '31 days'
         FROM organization o WHERE o.id = $1 RETURNING id`,
      [world.refs.organizationId, `in_route${randomBytes(6).toString('hex')}`],
    );
    return rows[0]?.id ?? '';
  }
}

/** The file's route worlds: its database migrated and its services started before its tests, all dropped after. */
export function routeWorldsForThisFile(): RouteWorlds {
  const worlds = new RouteWorlds();
  beforeAll(() => worlds.open(), 60_000);
  afterAll(() => worlds.close());
  return worlds;
}
