import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type JobContext, intakeHandler, intakeServices, parseHandler, priceHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, MutationResult, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import { coveragePage } from './coverage';
import { mapPlanAction } from './mapping';
import { createPricingRunAction, pricingRunPage, pricingRunsPage } from './pricing';
import { claimsPage, linePage } from './remittances';
import { loadRouteRelease } from './test-support/pricing-world';
import { completeUpload, requestUploads, uploadContent } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * The Pricing runs, line trace, Claims and lines and Coverage screens through their routes (PRD 5, J6
 * and J7; PRD 7; test matrix MAP-01, MAP-03, MAP-04, MAP-05): SYNTHETIC 835s are uploaded and loaded by
 * the worker's jobs, the billing manager maps the plans and creates runs through the action, the price
 * job the action queued executes each run, and the screens are read back as the billing manager (who
 * reads PHI) and as a viewer (who does not). Release 900001 is the SYNTHETIC rule release.
 */

const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-pricing-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let world: TenantWorld;
let manager: string;
let viewer: string;
let practiceId: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRouteRelease(owner);
  app = openPool(database.appUrl, 6);
  const sealer = new Sealer(randomBytes(32));
  queue = new MemoryQueue();
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
    queue,
    documents,
  });
  world = await createTenantWorld(owner, 'pricing routes');
  practiceId = world.practiceId;
  const key = await provisionPracticeKey(keys, practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1, settings = $3 WHERE id = $2', [
    key.dataKeyRef,
    practiceId,
    JSON.stringify({ place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT' }),
  ]);
  // The pricing location (practice_site, PR 6b) the lines price at: ZIP 00011, no ZIP+4, as practice.zip was.
  await owner.query("UPDATE practice_site SET zip = '00011', zip_plus_four = NULL WHERE practice_id = $1", [practiceId]);
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  viewer = await createUser(owner);
  await addMembership(owner, world.organizationId, viewer, 'viewer');
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-baa', $3)`,
      [world.organizationId, practiceId, randomBytes(32).toString('hex')],
    ),
  );
  for (const file of ['MAP-01/remit.835', 'MAP-04/remit.835', 'MAP-05/remit.835']) {
    await send(file);
  }
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
  rmSync(documentsDir, { recursive: true, force: true });
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
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke(
    { cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

function refusedWith(outcome: Outcome<unknown>): string {
  if (outcome.status !== 'invalid') {
    throw new Error(`expected invalid, got ${JSON.stringify(outcome)}`);
  }
  return outcome.issues.map((issue) => `${issue.field}: ${issue.message}`).join(' | ');
}

const P = () => ({ practiceId });

function jobContext(): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: (type, next) => queue.enqueue(type, next),
    lastAttempt: false,
  };
}

/** Runs the queued jobs as the worker would: intake, parse_835 and price. */
async function runQueue(): Promise<void> {
  const jobs = intakeServices({ documents: { kind: 'local', dir: documentsDir }, keys: { kind: 'local', masterKey }, scanWaitMs: 1000 });
  for (let batch = queue.jobs.splice(0); batch.length > 0; batch = queue.jobs.splice(0)) {
    for (const job of batch) {
      if (job.type === 'intake') {
        await intakeHandler(jobs)(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'parse_835') {
        await parseHandler(jobs)(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'price') {
        await priceHandler()(job.payload as { practice_id: string; pricing_run_id: string }, jobContext());
      }
    }
  }
}

/** Uploads a SYNTHETIC 835 through the upload routes, and lets the worker load it. */
async function send(file: string): Promise<void> {
  const bytes = readFileSync(path.join(FIXTURES, file));
  const [document] = ok(await call(requestUploads, manager, P(), { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: bytes.length }] })).documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(
    await uploadContent.invoke(
      {
        cookies: new Jar(await sessionOf(manager)),
        params: { ...P(), documentId: document.documentId },
        input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(manager)), token },
        upload: { contentType: 'application/octet-stream', contentLength: bytes.length, body: Readable.from([bytes]) },
        requestId: `test-${randomUUID()}`,
        userAgent: null,
      },
      services,
    ),
  );
  ok(await call(completeUpload, manager, P(), { documentId: document.documentId }));
  await runQueue();
}

const planOf = async (planKey: string) => ((await owner.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, planKey])).rows[0] ?? { id: '' }).id;
const runFrom = (outcome: Outcome<MutationResult>) => /pricing-runs\/([0-9a-f-]{36})$/.exec(ok(outcome).redirect ?? '')?.[1] ?? '';

let firstRun = '';
let oonMapping = '';

describe('creating a run through the Pricing runs screen', () => {
  it('is refused while a plan of the period is unmapped (MAP-01), and for a release that is not the current one', async () => {
    const ma = await planOf('CE:SYNPLAN-MA-05');
    ok(await call(mapPlanAction, manager, P(), { planId: ma, kind: 'ma_noncontracted', effectiveFrom: '2026-01-01' }));
    expect(refusedWith(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', toMonth: '2026-04', releaseNo: '900001' }))).toMatch(/^fromMonth: pricing is refused until every plan is mapped/);
    expect(refusedWith(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-03', releaseNo: '900001' }))).toMatch(/^fromMonth: pricing is refused until every plan is mapped: 1 plan/);
    expect(refusedWith(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', releaseNo: '900002' }))).toMatch(/^releaseNo: rule-release mismatch: release 900002 was asked for and release 900001 is the one loaded/);
    expect(refusedWith(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-04', toMonth: '2026-02', releaseNo: '900001' }))).toMatch(/^toMonth:/);
    expect(refusedWith(await call(createPricingRunAction, manager, P(), { fromMonth: '2025-01', releaseNo: '900001' }))).toMatch(/^fromMonth: a period that holds at least one service line/);
    expect((await call(createPricingRunAction, viewer, P(), { fromMonth: '2026-02', releaseNo: '900001' })).status).toBe('forbidden');
    expect(queue.jobs).toEqual([]);
    expect((await owner.query('SELECT 1 FROM pricing_run')).rowCount).toBe(0);
  });

  it('records the run queued, pinned to the current release, queues its price job, and the job completes it', async () => {
    // MAP-01's plan mapped only from after its March lines (MAP-02): the plan is mapped, its lines are not.
    ok(await call(mapPlanAction, manager, P(), { planId: await planOf('CE:SYNPLAN-UNMAPPED-01'), kind: 'no_agreement', effectiveFrom: '2026-04-01' }));
    oonMapping = ok(await call(mapPlanAction, manager, P(), { planId: await planOf('CE:SYNPLAN-OON-04'), kind: 'no_agreement', effectiveFrom: '2026-01-01' })).objectId ?? '';
    firstRun = runFrom(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', toMonth: '2026-04', releaseNo: '900001' }));
    expect(queue.jobs).toEqual([{ type: 'price', payload: { practice_id: practiceId, pricing_run_id: firstRun } }]);
    const queued = ok(await call(pricingRunPage, manager, { ...P(), runId: firstRun }));
    expect(queued.run).toMatchObject({ status: 'queued', periodFrom: '2026-02-01', periodTo: '2026-04-30', releaseNo: 900001, coverage: null });
    await runQueue();
    const { rows } = await owner.query<{ action: string }>("SELECT action FROM audit_event WHERE object_id = $1 AND action = 'pricing_run_created'", [firstRun]);
    expect(rows).toHaveLength(1);
  });
});

describe('the screens after a run', () => {
  it('lists the run with its period, release, engine, coverage and variance by payer pattern', async () => {
    const list = ok(await call(pricingRunsPage, viewer, P())).list;
    expect(list.total).toBe(1);
    const [run] = list.runs;
    expect(run).toMatchObject({ id: firstRun, status: 'complete', releaseNo: 900001, rerun: [] });
    expect(run?.coverage).toMatchObject({ lines: 11, priced: { lines: 3 } });
    expect(run?.coverage?.reasons.filter((entry) => entry.lines > 0).map((entry) => [entry.reason, entry.lines])).toEqual([
      ['NO_AGREEMENT', 4],
      ['NO_MAPPING', 4],
    ]);
    expect(run?.coverage?.patterns).toEqual([expect.objectContaining({ mapping_kind: 'ma_noncontracted', lines: 3, contract_version_id: null })]);
    const detail = ok(await call(pricingRunPage, viewer, { ...P(), runId: firstRun, lines: 'NO_AGREEMENT' }));
    expect(detail.lines.total).toBe(4);
    expect(detail.lines.lines.every((line) => line.unpricedReason === 'NO_AGREEMENT' && line.expectedAllowedCents === null)).toBe(true);
    expect(Object.values(detail.names.plans)).toEqual(['CE:SYNPLAN-MA-05']);
    expect(Object.values(detail.names.payers)).toEqual(['SYNTHETIC PAYER M']);
    expect((await call(pricingRunPage, viewer, { ...P(), runId: randomUUID() })).status).toBe('not_found');
  });

  it('shows expected allowed from the run in effect on Claims and lines, and a stage only once triage gives one', async () => {
    const rows = ok(await call(claimsPage, manager, { ...P(), view: 'all' })).list.rows;
    const byPlanLines = (code: string, date: string) => rows.filter((row) => row.procedureCode === code && row.identifiers?.serviceDate === date);
    const [ma] = byPlanLines('97110', '2026-02-16');
    expect(ma?.pricing).toMatchObject({ pricingRunId: firstRun, unpricedReason: null });
    expect(ma?.expectedAllowedCents).toMatch(/^\d+$/);
    // Not triaged: priced, at no stage yet (the chip says so); an unpriced line shows unpriced.
    expect(ma?.status).toBeNull();
    const oon = byPlanLines('97530', '2026-04-21');
    expect(oon.map((row) => [row.status, row.expectedAllowedCents, row.pricing?.unpricedReason])).toEqual([
      ['unpriced', null, 'NO_AGREEMENT'],
      ['unpriced', null, 'NO_AGREEMENT'],
    ]);
    // MAP-01's March lines: no mapping on their date, so unpriced NO_MAPPING and never priced from a guess.
    expect(byPlanLines('97140', '2026-03-12').map((row) => [row.status, row.expectedAllowedCents, row.pricing?.unpricedReason])).toEqual([['unpriced', null, 'NO_MAPPING']]);
    // A line no run has priced (outside every run's period) is not priced yet.
    expect(rows.filter((row) => row.pricing === null && row.lineId !== null)).toEqual([]);
  });

  it('opens the line trace: the amounts for every role, every step in order with its records and release for roles that read PHI', async () => {
    const { rows } = await owner.query<{ id: string }>("SELECT id FROM service_line WHERE practice_id = $1 AND procedure_code = '97110' AND service_date = '2026-02-16'", [practiceId]);
    const lineId = rows[0]?.id ?? '';
    const asManager = ok(await call(linePage, manager, { ...P(), lineId }));
    expect(asManager.pricing).toMatchObject({ run: { id: firstRun, releaseNo: 900001 }, unpricedReason: null, method: 'PERCENT_OF_MEDICARE' });
    expect(asManager.pricing?.run.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asManager.steps.map((item) => item.key).slice(0, 7)).toEqual(['release', 'as_of', 'settings', 'claim', 'line', 'agreement', 'terms']);
    expect(asManager.steps.find((item) => item.key === 'fee_schedule')?.records.map((record) => record.recordType)).toEqual(expect.arrayContaining(['pfs_rvu', 'pfs_gpci', 'conversion_factor']));
    expect(asManager.steps.at(-1)?.key).toBe('outcome');
    expect(asManager.runs.map((run) => run.runId)).toEqual([firstRun]);
    const asViewer = ok(await call(linePage, viewer, { ...P(), lineId }));
    expect(asViewer.pricing?.expectedAllowedCents).toBe(asManager.pricing?.expectedAllowedCents);
    expect(asViewer.pricing?.trace).toBeNull();
    expect(asViewer.steps).toEqual([]);
    expect((await call(linePage, manager, { ...P(), lineId, run: randomUUID() })).status).toBe('not_found');
    const { rows: audited } = await owner.query("SELECT 1 FROM audit_event WHERE object_type = 'priced_line' AND purpose = 'line_trace' AND actor_id = $1", [manager]);
    expect(audited.length).toBeGreaterThan(0);
  });

  it('fills Coverage’s priced shares and unpriced reasons by count from the latest complete run', async () => {
    const coverage = ok(await call(coveragePage, viewer, P()));
    expect(coverage.run).toMatchObject({ id: firstRun, lines: 11, releaseNo: 900001 });
    expect(coverage.priced.lines).toBe(3);
    expect(coverage.pricingRuns).toBe(1);
    expect(coverage.reasons.filter((reason) => reason.lines > 0).map((reason) => [reason.reason, reason.lines, reason.remedy])).toEqual([
      ['NO_MAPPING', 4, 'Map the plan'],
      ['NO_AGREEMENT', 4, 'None; anomaly screening only'],
    ]);
  });
});

describe('MAP-03: a corrected mapping', () => {
  it('leaves the earlier run as it was and offers a new run, which prices under the correction', async () => {
    const before = ok(await call(pricingRunPage, manager, { ...P(), runId: firstRun }));
    ok(await call(mapPlanAction, manager, P(), { planId: await planOf('CE:SYNPLAN-OON-04'), kind: 'ma_noncontracted', effectiveFrom: '2026-01-01', supersedesId: oonMapping }));
    const after = ok(await call(pricingRunPage, manager, { ...P(), runId: firstRun }));
    expect(after.run.rerun).toEqual(['mapping_changed']);
    expect({ ...after.run, rerun: [] }).toEqual({ ...before.run, rerun: [] });
    expect(after.lines).toEqual(before.lines);
    const second = runFrom(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', toMonth: '2026-04', releaseNo: '900001' }));
    await runQueue();
    const run = ok(await call(pricingRunPage, manager, { ...P(), runId: second })).run;
    expect(run.coverage).toMatchObject({ lines: 11, priced: { lines: 7 } });
    const coverage = ok(await call(coveragePage, manager, P()));
    expect(coverage.run?.id).toBe(second);
    expect(coverage.pricingRuns).toBe(2);
  });
});
