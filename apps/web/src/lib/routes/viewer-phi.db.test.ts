import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
} from '@tp/db';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route, SampleRefs } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { ROUTES } from './index';
import { SAMPLE_PAYER_CLAIM_CONTROL_NUMBER, claimsPage } from './remittances';
import { scratchContentRoot } from './test-support/content-root';
import { seedContractWorld } from './test-support/contract-world';
import { seedLedger } from './test-support/ledger-world';
import { seedMonitoring } from './test-support/monitoring-world';
import { seedPacketCases, seedPacketLine, seedPackets } from './test-support/packet-world';
import { loadRouteRelease, seedPricingRun } from './test-support/pricing-world';
import { seedReportDocument } from './test-support/report-world';
import { seedTriage, seedTriageLine } from './test-support/triage-world';
import { anomaliesPage, casePage, reviewAnomalyAction } from './triage';

/**
 * What a role that does not read PHI (the viewer: a CFO or owner; also the practice administrator, who
 * holds no phi.read) is answered on every page it can open (PRD 3, Personas: a viewer "reads dashboards,
 * reports, the ledger and ROI statements"; PRD 7, Claims and lines: "PHI columns visible only to PHI
 * roles"; .claude/rules/privacy-and-tenant.md). The screen tour found a viewer's case detail naming each
 * line by its service date although Claims and lines and Reconciliation hide service dates from the
 * viewer; these tests hold every page to what Claims and lines does, on the handler's answer (what the
 * page renders from), not on what the browser shows. Synthetic data only.
 *
 * - The tour's shape: SYNTHETIC CAS-08 loaded through the parse_835 job, signed off, priced and triaged
 *   into one case. The viewer's case detail names its lines by number, with no service date, claim
 *   control number, patient name or member ID anywhere in the answer; the billing manager's carries the
 *   dates and claim numbers. The same for a cohort of the run opened on the Anomalies screen.
 * - Every page of the route registry a viewer can open, on the route tests' world (a remittance, its
 *   claim and lines, contracts, a priced run and its triage, packets and a submission, the recovery
 *   ledger, a digest, reports): none of the world's PHI values (service dates, the patient's name, date
 *   of birth and member ID, the claim control numbers, a submission's reference) and no ciphertext is in
 *   the answer, and each such page is a PHI route (sent private, no-store).
 */

const adminUrl = readDatabaseUrl();
const FIXTURES = fileURLToPath(new URL('../../../../../fixtures/synthetic/', import.meta.url));

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

function testServices(pool: DatabasePool, keys: Services['keys'], documents: DocumentStore, extra: Partial<Parameters<typeof createServices>[0]> = {}): Services {
  const sealer = new Sealer(randomBytes(32));
  return createServices({
    origin: 'http://localhost:3100',
    pool,
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
    queue: new MemoryQueue(),
    documents,
    ...extra,
  });
}

/** Signs a person in once (TOTP; a hardware key for internal roles) and calls routes as them. */
function caller(pool: DatabasePool, services: Services) {
  const tokens = new Map<string, string>();
  const sessionOf = async (userId: string, method: 'totp' | 'webauthn'): Promise<string> => {
    let token = tokens.get(userId);
    if (token === undefined) {
      token = (await openSession(pool, { userId, method, deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
      tokens.set(userId, token);
    }
    return token;
  };
  return async <R>(route: Route<R>, userId: string, params: Record<string, unknown>, method: 'totp' | 'webauthn' = 'totp', input?: Record<string, unknown>): Promise<Outcome<R>> => {
    const session = await sessionOf(userId, method);
    // A mutation carries its CSRF token and request key, as the form sends them.
    const body = input === undefined ? undefined : { csrfToken: csrfTokenFor(services.sealer, session), requestKey: randomUUID(), ...input };
    return route.invoke({ cookies: new Jar(session), params, input: body, requestId: `test-${randomUUID()}`, userAgent: null }, services);
  };
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

/** The answer as text: the data, with a download's bytes read as text (a CSV, or a PDF's own text). */
function answerText(outcome: Outcome<unknown>): string {
  return JSON.stringify(outcome, (_key, value: unknown) => (value instanceof Uint8Array ? Buffer.from(value).toString('latin1') : typeof value === 'bigint' ? value.toString() : value));
}

/** The PHI values in `text`. */
function phiIn(text: string, phi: readonly string[]): string[] {
  return phi.filter((value) => text.includes(value));
}

/** "20260305" as "2026-03-05". */
const isoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/**
 * The PHI a SYNTHETIC 835 carries, read from its segments: service dates (DTM*472, claim dates DTM*232
 * and 233), the patient's and the insured's names and member IDs (NM1*QC and IL), and the claim control
 * numbers (CLP01 and CLP07).
 */
function phiOf835(text: string): { readonly serviceDates: string[]; readonly claimNumbers: string[]; readonly people: string[] } {
  const serviceDates = new Set<string>();
  const claimNumbers = new Set<string>();
  const people = new Set<string>();
  for (const segment of text.split('~').map((part) => part.trim())) {
    const fields = segment.split('*');
    if (fields[0] === 'DTM' && ['472', '232', '233', '150', '151'].includes(fields[1] ?? '') && fields[2] !== undefined) {
      serviceDates.add(isoDate(fields[2]));
    } else if (fields[0] === 'CLP') {
      for (const value of [fields[1], fields[7]]) {
        if (value !== undefined && value !== '') {
          claimNumbers.add(value);
        }
      }
    } else if (fields[0] === 'NM1' && (fields[1] === 'QC' || fields[1] === 'IL')) {
      for (const value of [fields[3], fields[4], fields[9]]) {
        if (value !== undefined && value !== '') {
          people.add(value);
        }
      }
    }
  }
  return { serviceDates: [...serviceDates], claimNumbers: [...claimNumbers], people: [...people] };
}

// ---------------------------------------------------------------------------------------------------
// The tour's shape: CAS-08 priced and triaged into one case
// ---------------------------------------------------------------------------------------------------

describe('the case detail and the cohort a viewer opens (the screen tour, P1)', () => {
  let w: TriageWorld;
  let services: Services;
  let call: ReturnType<typeof caller>;
  const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-viewer-phi-'));
  const cas08 = phiOf835(readFileSync(path.join(FIXTURES, 'CAS-08/remit.835'), 'utf8'));
  const PHI = [...cas08.serviceDates, ...cas08.claimNumbers, ...cas08.people, 'enc:v1:'];
  let practice: Practice;
  let viewer: string;
  let caseId: string;
  let anomalyId: string;
  let tourRefs: Partial<SampleRefs>;

  beforeAll(async () => {
    w = await TriageWorld.open(adminUrl);
    services = testServices(w.app, w.keys, new DocumentStore(new LocalSealedBytes(documentsDir)));
    call = caller(w.app, services);
    practice = await w.practice('VIEWER PHI CAS-08', { case_materiality_cents: '1000' });
    viewer = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
    await w.load(practice, 'CAS-08/remit.835');
    const contract = await w.fixedContract(practice, { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    const triaged = await w.triage(practice, runId);
    if (triaged.outcome !== 'triaged' || triaged.summary.casesOpened !== 1) {
      throw new Error('CAS-08 did not open one case');
    }
    // A cohort of the run over the case's lines, as anomaly screening writes one.
    ({ caseId, anomalyId } = await asOwner(w.owner, [practice.practiceId], async () => {
      const found = (await w.owner.query<{ id: string; payer_id: string; plan_id: string }>('SELECT id, payer_id, plan_id FROM "case" WHERE practice_id = $1', [practice.practiceId])).rows[0];
      if (found === undefined) {
        throw new Error('no case');
      }
      const lines = (await w.owner.query<{ id: string }>('SELECT service_line_id AS id FROM case_line WHERE case_id = $1', [found.id])).rows.map((row) => row.id);
      const cohortKey = { payer_id: found.payer_id, plan_id: found.plan_id, procedure_code: '97110', modifiers: [], place_of_service: '11', quarter: '2026-Q1' };
      const stats = {
        format: 'tp-anomaly-stats/1',
        label: 'investigatory',
        basis: 'observed_allowed_per_unit',
        lines: 30,
        min_cents: '2800',
        p25_cents: '5000',
        median_cents: '5000',
        p75_cents: '5000',
        max_cents: '5000',
        modal_cents: '5000',
        modal_lines: 27,
        threshold_cents: '500',
        below_mode_lines: 3,
        flagged_lines: 3,
        flagged_observed_cents: '21000',
        range_low_cents: '0',
        range_high_cents: '0',
      };
      const anomaly = await w.owner.query<{ id: string }>(
        'INSERT INTO anomaly (practice_id, pricing_run_id, cohort_key, cohort_size, modal_allowed_cents, stats, line_ids) VALUES ($1, $2, $3, 30, 5000, $4, $5) RETURNING id',
        [practice.practiceId, runId, JSON.stringify(cohortKey), JSON.stringify(stats), lines],
      );
      return { caseId: found.id, anomalyId: (anomaly.rows[0] as { id: string }).id };
    }));
    tourRefs = await asOwner(w.owner, [practice.practiceId], async () => {
      const first = async (sql: string) => ((await w.owner.query<{ id: string }>(sql, [practice.practiceId])).rows[0] as { id: string }).id;
      return {
        practiceId: practice.practiceId,
        organizationId: practice.world.organizationId,
        remittanceId: await first('SELECT id FROM remittance WHERE practice_id = $1 ORDER BY created_at LIMIT 1'),
        documentId: await first("SELECT id FROM source_document WHERE practice_id = $1 AND kind = 'x12_835' ORDER BY created_at LIMIT 1"),
        claimId: await first('SELECT id FROM claim WHERE practice_id = $1 ORDER BY claim_no LIMIT 1'),
        serviceLineId: await first('SELECT service_line_id AS id FROM case_line WHERE practice_id = $1 ORDER BY id LIMIT 1'),
        payerId: await first('SELECT id FROM payer WHERE practice_id = $1 LIMIT 1'),
        planId: await first('SELECT id FROM plan WHERE practice_id = $1 LIMIT 1'),
        signedOffContractId: await first('SELECT id FROM contract WHERE practice_id = $1 LIMIT 1'),
        signedOffVersionId: contract.versionId,
        pricingRunId: runId,
        // The run's own page opens it (the sample names a re-run there), and the submissions screen this case.
        rerunId: runId,
        caseId,
        submittedCaseId: caseId,
        anomalyId,
      };
    });
  }, 180_000);

  afterAll(async () => {
    await w.close();
    rmSync(documentsDir, { recursive: true, force: true });
  });

  it('reads the fixture’s PHI to look for', () => {
    expect(cas08.serviceDates).toEqual(['2026-03-05', '2026-03-06', '2026-03-07']);
    expect(cas08.claimNumbers).toHaveLength(6);
    expect(cas08.people.length).toBeGreaterThanOrEqual(9);
  });

  it('answers a viewer’s case detail with each line by its number: no service date, claim number, name or member ID', async () => {
    const P = { practiceId: practice.practiceId, caseId };
    const outcome = await call(casePage, viewer, P);
    const seen = ok(outcome);
    expect([seen.canReadPhi, seen.detail.totalLines]).toEqual([false, 3]);
    // Each line is named by its place in the schedule, unique on the page: its number inside its claim is 1 on all three claims.
    expect(seen.detail.lines.map((line) => [line.position, line.lineNo, line.serviceDate, line.payerClaimControlNumber])).toEqual([
      [1, 1, null, null],
      [2, 1, null, null],
      [3, 1, null, null],
    ]);
    const timeline = seen.timeline.flatMap((event) => (event.kind === 'stage' ? [event.position] : []));
    expect(new Set(timeline)).toEqual(new Set([1, 2, 3]));
    expect(phiIn(answerText(outcome), PHI), 'PHI in the viewer’s case detail').toEqual([]);
    // The route is a PHI route: the page is sent private, no-store.
    expect(casePage.phi).toBe(true);

    // The billing manager, who reads PHI, sees the lines by their dates and claim numbers.
    const managed = ok(await call(casePage, practice.manager, P));
    expect(managed.detail.lines.map((line) => [line.position, line.serviceDate])).toEqual(cas08.serviceDates.map((date, index) => [index + 1, date]));
    expect(managed.detail.lines.every((line) => line.payerClaimControlNumber?.startsWith('SYNCCNCAS08') === true)).toBe(true);
  });

  it('answers a viewer’s cohort with its flagged lines by code and amounts, never a service date or claim number', async () => {
    const P = { practiceId: practice.practiceId, anomaly: anomalyId };
    const outcome = await call(anomaliesPage, viewer, P);
    const seen = ok(outcome);
    expect(seen.open?.lines.map((line) => [line.procedureCode, line.serviceDate, line.payerClaimControlNumber])).toEqual([
      ['97110', null, null],
      ['97110', null, null],
      ['97110', null, null],
    ]);
    expect(phiIn(answerText(outcome), PHI), 'PHI in the viewer’s Anomalies screen').toEqual([]);
    expect(anomaliesPage.phi).toBe(true);
    const managed = ok(await call(anomaliesPage, practice.manager, P));
    expect(managed.open?.lines.map((line) => line.serviceDate)).toEqual(cas08.serviceDates);
  });

  it('names who reviewed the cohort to a viewer the user directory hides them from by role, never a dash (N3)', async () => {
    const P = { practiceId: practice.practiceId, anomaly: anomalyId };
    ok(await call(reviewAnomalyAction, practice.manager, { practiceId: practice.practiceId }, 'totp', { anomalyId }));
    // The viewer reads no other person's user row: the reviewer is named as a member of the practice.
    const seen = ok(await call(anomaliesPage, viewer, P)).open?.anomaly;
    expect(seen?.reviewedAt).not.toBeNull();
    expect(seen?.reviewedBy).toBe('a member of the practice');
    // The reviewer reads their own row, and sees their own address.
    const own = ok(await call(anomaliesPage, practice.manager, P)).open?.anomaly;
    expect(own?.reviewedBy).toMatch(/@/);
  });

  it('answers the viewer on every other screen the tour opened with none of the 835’s PHI', async () => {
    const answered: string[] = [];
    const leaks: string[] = [];
    for (const route of readsOf('viewer')) {
      // A route that names a record this world does not hold is left to the route tests' world below.
      const outcome = await call(route, viewer, route.sample?.params(tourRefs as SampleRefs) ?? {});
      if (outcome.status !== 'ok') {
        continue;
      }
      answered.push(route.id);
      for (const value of phiIn(answerText(outcome), PHI)) {
        leaks.push(`${route.id}: ${value}`);
      }
    }
    expect(leaks, 'PHI in an answer to the viewer').toEqual([]);
    expect(answered).toEqual(
      expect.arrayContaining([
        'practice.home',
        'practice.uploads',
        'practice.uploads.document',
        'practice.remittances',
        'practice.remittances.remittance',
        'practice.claims',
        'practice.lines.line',
        'practice.coverage',
        'practice.pricing_runs.run',
        'practice.cases',
        'practice.cases.case',
        'practice.cases.submissions',
        'practice.anomalies',
        'practice.reconciliation',
        'practice.reports',
      ]),
    );
  });

  it('holds Claims and lines to the same rule (the pattern the case detail follows)', async () => {
    const P = { practiceId: practice.practiceId };
    const viewed = await call(claimsPage, viewer, P);
    expect(ok(viewed).list.rows.every((row) => row.identifiers === null)).toBe(true);
    expect(phiIn(answerText(viewed), PHI)).toEqual([]);
    const managed = answerText(await call(claimsPage, practice.manager, P));
    expect(cas08.serviceDates.every((date) => managed.includes(date))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// Every page of the registry a viewer can open, on the route tests' world
// ---------------------------------------------------------------------------------------------------

/** The patient of the world's claims, with a date of birth and a member ID the 835 loader would keep encrypted. */
const PATIENT = { last: 'SYNTHLASTVIEWERPHI', first: 'SYNTHFIRSTVIEWERPHI', dob: '1961-07-23', member: 'SYNMBRVIEWERPHI01' } as const;
const WORLD_PHI: readonly string[] = [
  // Service dates: the claim's and its line's, the triage line's (also the adjusted claims'), the packet lines'.
  '2026-03-15',
  '2026-03-16',
  '2026-03-17',
  '2026-03-18',
  PATIENT.last,
  PATIENT.first,
  PATIENT.dob,
  PATIENT.member,
  'SYNPCNROUTE0001',
  SAMPLE_PAYER_CLAIM_CONTROL_NUMBER,
  'SYNCCNROUTE0002',
  'SYNCCNROUTE0003',
  // A submission's reference (the payer's, kept encrypted).
  'SYNTHETIC-PORTAL-REF-ROUTE',
  'enc:v1:',
];

/** A loaded remittance with one claim, one line and its adjustments, as the 835 loader writes them (identifiers encrypted). */
async function seedRemittance(
  owner: DatabaseClient,
  practiceId: string,
  cipher: PracticeCipher,
  uploader: string,
): Promise<{ documentId: string; remittanceId: string; claimId: string; serviceLineId: string; payerId: string; planId: string }> {
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
      const patient = await one('INSERT INTO patient_ref (practice_id, pseudonym, last_name, first_name, dob, member_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [
        practiceId,
        cipher.lookupHash('patient_ref.pseudonym', `name|${PATIENT.last}|${PATIENT.first}||`),
        cipher.encrypt('patient_ref.last_name', PATIENT.last),
        cipher.encrypt('patient_ref.first_name', PATIENT.first),
        cipher.encrypt('patient_ref.dob', PATIENT.dob),
        cipher.encrypt('patient_ref.member_id', PATIENT.member),
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
      return { documentId: document, remittanceId, claimId, serviceLineId, payerId: payer, planId: plan };
    },
    uploader,
  );
}

/** The routes a role reads without changing anything: pages and downloads of a practice (or of its group) the role's permissions admit. */
function readsOf(role: MembershipRole): Route[] {
  return ROUTES.filter((route) => !route.mutation && (route.access.kind === 'practice' || route.access.kind === 'organization') && rolesPermit([role], route.access.permission));
}

describe('every page a role without phi.read can open (the screen tour’s audit)', () => {
  let database: MigratedDatabase;
  let owner: DatabaseClient;
  let app: DatabasePool;
  let billingPool: DatabasePool;
  let services: Services;
  let call: ReturnType<typeof caller>;
  let refs: SampleRefs;
  let people: { readonly admin: string; readonly manager: string; readonly viewer: string };
  const keys = LocalKeyProvider.random();
  const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-viewer-phi-routes-'));
  const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
  const content = scratchContentRoot();

  beforeAll(async () => {
    database = await createMigratedDatabase(adminUrl);
    owner = databaseClient(database.url);
    await owner.connect();
    await loadRouteRelease(owner);
    app = openPool(database.appUrl, 6);
    billingPool = openPool(database.billingUrl, 2);
    services = testServices(app, keys, documents, { contentRoot: content.root, billingPool });
    call = caller(app, services);

    const tenant = await createTenantWorld(owner, 'VIEWER PHI ROUTES');
    const internalId = await createOrganization(owner, 'internal', 'VIEWER PHI internal');
    const member = async (organizationId: string, role: MembershipRole, internal = false) => {
      const id = await createUser(owner, { hardwareKeyRequired: internal });
      await addMembership(owner, organizationId, id, role);
      return id;
    };
    const manager = await member(tenant.organizationId, 'billing_manager');
    const analyst = await member(tenant.organizationId, 'analyst');
    const viewer = await member(tenant.organizationId, 'viewer');
    const specialist = await member(internalId, 'contract_specialist', true);
    const reviewer = await member(internalId, 'reviewer', true);
    const supportEngineerId = await member(internalId, 'support', true);
    // Support grants for the specialist, the reviewer and a support engineer (whose access the administrator reads).
    const supportGrantId = await asOwner(owner, [tenant.practiceId], async () => {
      const ids: string[] = [];
      for (const [index, person] of [specialist, reviewer, supportEngineerId].entries()) {
        const { rows } = await owner.query<{ id: string }>(
          "INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYNTHETIC', now() + interval '4 hours') RETURNING id",
          [tenant.practiceId, person, `SYN-VIEWER-${String(index + 1)}`],
        );
        ids.push((rows[0] as { id: string }).id);
      }
      return ids[2] as string;
    });
    const key = await provisionPracticeKey(keys, tenant.practiceId);
    await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, tenant.practiceId]);
    const practiceId = tenant.practiceId;
    const loaded = await seedRemittance(owner, practiceId, key.cipher, tenant.adminUserId);
    const contracts = await seedContractWorld({ owner, app, documents, cipher: key.cipher, practiceId, payerId: loaded.payerId, customerId: tenant.adminUserId, specialistId: specialist });
    const triageLineId = await seedTriageLine({ owner, practiceId, claimId: loaded.claimId, planId: loaded.planId });
    const packetLineId = await seedPacketLine({ owner, practiceId, claimId: loaded.claimId, planId: loaded.planId });
    const regulationLineId = await seedPacketLine({ owner, practiceId, claimId: loaded.claimId, planId: loaded.planId, lineNo: 4, serviceDate: '2026-03-18' });
    const { pricingRunId, rerunId } = await seedPricingRun({ owner, app, practiceId, planId: loaded.planId, signedOffVersionId: contracts.signedOffVersionId, managerId: manager });
    // The packets' own cases, before the audit report's triage (which would take their lines, their windows verified, into its case).
    const packetCases = await seedPacketCases({
      owner,
      practiceId,
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
      practiceId,
      pricingRunId,
      flaggedLineId: loaded.serviceLineId,
      caseLineServiceLineId: triageLineId,
      payerId: loaded.payerId,
      planId: loaded.planId,
      signedOffVersionId: contracts.signedOffVersionId,
      managerId: manager,
      reviewerId: reviewer,
    });
    const packets = await seedPackets({ owner, app, keys, documents, practiceId, caseId: triage.caseId, analystId: analyst, managerId: manager, reviewerId: reviewer }, packetCases);
    const monitoring = await seedMonitoring({ owner, practiceId, adminUserId: tenant.adminUserId, pricingRunId, payerId: loaded.payerId });
    const ledger = await seedLedger({
      owner,
      app,
      keys,
      documents,
      practiceId,
      cipher: key.cipher,
      uploaderId: tenant.adminUserId,
      managerId: manager,
      payerId: loaded.payerId,
      planId: loaded.planId,
      remittanceId: loaded.remittanceId,
      caseServiceLineId: triageLineId,
    });
    const reportDocument = await seedReportDocument({ app, keys, documents, practiceId, managerId: manager });
    // The uploads screens open the loaded 835's own document.
    // Only the refs the reading routes name; a route that names another is answered "invalid" and fails below.
    refs = {
      practiceId,
      organizationId: tenant.organizationId,
      agreementId: tenant.agreementId,
      adminUserId: tenant.adminUserId,
      memberUserId: viewer,
      internalOrganizationId: internalId,
      supportGrantId,
      supportEngineerId,
      ...loaded,
      ...contracts,
      pricingRunId,
      rerunId,
      ...triage,
      ...monitoring,
      ...ledger,
      ...packets,
      ...reportDocument,
    } as unknown as SampleRefs;
    people = { admin: tenant.adminUserId, manager, viewer };
  }, 180_000);

  afterAll(async () => {
    await app.end();
    await billingPool.end();
    await owner.end();
    await database.drop();
    rmSync(documentsDir, { recursive: true, force: true });
    content.remove();
  });

  it('finds the PHI it looks for in what a role that reads PHI is answered (so a clean answer below means something)', async () => {
    const seen = new Set<string>();
    for (const route of readsOf('billing_manager')) {
      const outcome = await call(route, people.manager, route.sample?.params(refs) ?? {});
      for (const value of phiIn(answerText(outcome), WORLD_PHI)) {
        seen.add(value);
      }
    }
    // The date of birth is kept for the packets' exports only, and no answer carries ciphertext, to anyone.
    expect(WORLD_PHI.filter((value) => !seen.has(value))).toEqual([PATIENT.dob, 'enc:v1:']);
  });

  it.each([
    ['viewer', 'viewer'],
    ['practice administrator', 'practice_admin'],
  ] as const)('answers the %s, who holds no phi.read, on every page and download it can open with none of the PHI and no ciphertext', async (_label, role) => {
    expect(rolesPermit([role], 'phi.read')).toBe(false);
    const userId = role === 'viewer' ? people.viewer : people.admin;
    const routes = readsOf(role);
    // The screens the tour opened as the viewer are among them.
    expect(routes.map((route) => route.id)).toEqual(
      expect.arrayContaining([
        'practice.home',
        'practice.remittances',
        'practice.remittances.remittance',
        'practice.claims',
        'practice.lines.line',
        'practice.coverage',
        'practice.cases',
        'practice.cases.case',
        'practice.cases.submissions',
        'practice.anomalies',
        'practice.reconciliation',
        'practice.reports',
        'practice.reports.report',
        'practice.reports.roi.statement',
        'practice.reports.monthly',
        'practice.digests.digest',
      ]),
    );
    const leaks: string[] = [];
    const refused: string[] = [];
    for (const route of routes) {
      const outcome = await call(route, userId, route.sample?.params(refs) ?? {});
      if (outcome.status !== 'ok') {
        refused.push(`${route.id}: ${outcome.status}`);
        continue;
      }
      for (const value of phiIn(answerText(outcome), WORLD_PHI)) {
        leaks.push(`${route.id}: ${value}`);
      }
    }
    expect(leaks, 'PHI in an answer to a role without phi.read').toEqual([]);
    expect(refused, 'every reading route answers the role on the world’s records').toEqual([]);
    // Each is a PHI route: its responses are sent private, no-store, and its reads are audited.
    expect(routes.filter((route) => route.access.kind === 'practice' && !route.phi).map((route) => route.id)).toEqual([]);
  });
});
