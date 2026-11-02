import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, addMembership, asOwner, createMigratedDatabase, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { RerunRefusedError, createRerun } from '@tp/worker/pricing';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type JobContext, intakeHandler, intakeServices, monitorHandler, parseHandler, priceHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, MutationResult, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import { coveragePage } from './coverage';
import { MONTHS_CHANGED, mapPlanAction, mappingPage, planPage, priceAgainAction, priceAgainRefusal, priceWaitingAction } from './mapping';
import { practiceHome } from './practice';
import { NOTHING_MAPPED, acceptPricingRunAction, createPricingRunAction, pricingRunPage, pricingRunsPage } from './pricing';
import { loadRouteRelease } from './test-support/pricing-world';
import { completeUpload, requestUploads, uploadContent } from './uploads';

/**
 * The mapping screens' routes after combined audit #32 (docs/adr/0075; test matrix MAP-06 to MAP-09, PRC-31), against a
 * scratch database: a person's run of a month holding a plan with no mapping (MAP-06), the monitoring a mapping queues
 * only when it completes months and naming exactly those months (D2b, D20; the worker's own monitor job run on the same
 * database), "Price them now", "Price these months again" with its exact rule and no duplicate (D4), the practice's
 * months lock under two people at once (D22), the refusals the form names (MAP-09), and the two figures on Coverage,
 * Pricing runs, the home page and the mapping list (PRC-31). Each case is a practice of its own, its SYNTHETIC 835s
 * uploaded through the upload routes and loaded by the worker: MAP-06's file (February 2026: plan A, SYNPLAN-COMM-06,
 * two claims; plan B, SYNPLAN-UNMAPPED-06, one claim), or a variant of it for another month or plan. Every mapping is
 * "no agreement", so no contract is needed. A suspended practice is refused both new routes by the generated route
 * tests (define.ts, the suspension case over RUN_STARTING_ROUTES). Synthetic data only.
 */

const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-mapping-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const FEBRUARY = { periodFrom: '2026-02-01', periodTo: '2026-02-28' };

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 8);
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

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, through: Services = services): Promise<Outcome<R>> {
  return route.invoke(
    { cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(through.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null },
    through,
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

const redirectOf = (outcome: Outcome<MutationResult>) => ok(outcome).redirect ?? '';

interface Target {
  readonly practiceId: string;
  readonly organizationId: string;
  readonly manager: string;
  /** A second billing manager, for two people at once. */
  readonly other: string;
  readonly viewer: string;
}

/** A practice with its pricing location (ZIP 00011), its settings, a BAA, two billing managers and a viewer. */
async function practice(label: string): Promise<Target> {
  const world = await createTenantWorld(owner, label);
  const { practiceId } = world;
  const key = await provisionPracticeKey(keys, practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1, settings = $3 WHERE id = $2', [
    key.dataKeyRef,
    practiceId,
    JSON.stringify({ place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT' }),
  ]);
  await owner.query("UPDATE practice_site SET zip = '00011', zip_plus_four = NULL WHERE practice_id = $1", [practiceId]);
  const [manager, other, viewer] = [await createUser(owner), await createUser(owner), await createUser(owner)];
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  await addMembership(owner, world.organizationId, other, 'billing_manager');
  await addMembership(owner, world.organizationId, viewer, 'viewer');
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-baa', $3)`,
      [world.organizationId, practiceId, randomBytes(32).toString('hex')],
    ),
  );
  return { practiceId, organizationId: world.organizationId, manager, other, viewer };
}

function jobContext(practiceId: string): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: (type, next) => queue.enqueue(type, next),
    lastAttempt: false,
  };
}

/**
 * Runs the queued jobs as the worker would: intake, parse_835 and price; and, with `monitor`, the monitor jobs a request
 * queued (a mapping's or "Price them now"'s). The monitoring the parse queues for a document is dropped: these cases
 * price months only as the mappings and the person do. Returns the jobs it ran.
 */
async function runQueue(options: { monitor?: boolean } = {}): Promise<string[]> {
  const ran: string[] = [];
  const jobs = intakeServices({ documents: { kind: 'local', dir: documentsDir }, keys: { kind: 'local', masterKey }, scanWaitMs: 1000 });
  for (let batch = queue.jobs.splice(0); batch.length > 0; batch = queue.jobs.splice(0)) {
    for (const job of batch) {
      const payload = job.payload as { practice_id: string; document_id: string; pricing_run_id: string; request_id?: string };
      if (job.type === 'intake') {
        await intakeHandler(jobs)(payload, jobContext(payload.practice_id));
      } else if (job.type === 'parse_835') {
        await parseHandler(jobs)(payload, jobContext(payload.practice_id));
      } else if (job.type === 'price') {
        await priceHandler()(payload, jobContext(payload.practice_id));
      } else if (job.type === 'monitor' && options.monitor === true && payload.request_id !== undefined) {
        await monitorHandler()(job.payload as never, jobContext(payload.practice_id));
      } else {
        continue;
      }
      ran.push(job.type);
    }
  }
  return ran;
}

/** MAP-06's file, or a variant of it (each pair replaced everywhere: another payment, month or plan). */
function map06(replacements: readonly (readonly [string, string])[] = []): Buffer {
  let text = readFileSync(path.join(FIXTURES, 'MAP-06/remit.835'), 'latin1');
  for (const [from, to] of replacements) {
    text = text.replaceAll(from, to);
  }
  return Buffer.from(text, 'latin1');
}

/** Another payment of MAP-06's claims (new claim numbers), with its plan B named `planB` and its service date `date`. */
const another = (tag: string, planB: string, date = '20260221') =>
  map06([
    ['020060001', `0200${tag}001`],
    ['MAP06', `MA${tag}`],
    ['SYNPLAN-UNMAPPED-06', planB],
    ['20260221', date],
  ]);

/** Uploads a SYNTHETIC 835 through the upload routes as the billing manager, and lets the worker load it. */
async function send(target: Target, bytes: Buffer): Promise<void> {
  const P = { practiceId: target.practiceId };
  const [document] = ok(await call(requestUploads, target.manager, P, { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: bytes.length }] })).documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(
    await uploadContent.invoke(
      {
        cookies: new Jar(await sessionOf(target.manager)),
        params: { ...P, documentId: document.documentId },
        input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(target.manager)), token },
        upload: { contentType: 'application/octet-stream', contentLength: bytes.length, body: Readable.from([bytes]) },
        requestId: `test-${randomUUID()}`,
        userAgent: null,
      },
      services,
    ),
  );
  ok(await call(completeUpload, target.manager, P, { documentId: document.documentId }));
  await runQueue();
}

const planOf = async (target: Target, key: string) =>
  ((await owner.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [target.practiceId, `CE:${key}`])).rows[0] ?? { id: '' }).id;
const mapAs = (target: Target, planId: string, by = target.manager, dates: { readonly effectiveFrom: string; readonly lastDay?: string } = { effectiveFrom: '2026-01-01' }) =>
  call(mapPlanAction, by, { practiceId: target.practiceId }, { planId, kind: 'no_agreement', ...dates });
const monitorJobs = () => queue.jobs.filter((job) => job.type === 'monitor');
const rerunsOf = async (runId: string) => (await owner.query<{ id: string }>('SELECT id FROM pricing_run WHERE rerun_of_id = $1 ORDER BY created_at', [runId])).rows.map((row) => row.id);
const eventsOf = async (action: string, practiceId: string) => (await owner.query('SELECT 1 FROM audit_event WHERE action = $1 AND practice_id = $2', [action, practiceId])).rowCount ?? 0;
const planMonthsLock = (practiceId: string) => owner.query("SELECT pg_advisory_xact_lock(hashtextextended('plan_months:' || $1::uuid::text, 0))", [practiceId]);

/** Holds the practice's months lock on the test's own connection while `start` sends its requests, then releases it and awaits them. */
async function atOnce<T>(practiceId: string, start: () => Promise<T>[]): Promise<T[]> {
  await owner.query('BEGIN');
  await planMonthsLock(practiceId);
  const pending = start();
  // Both requests reach the lock (each on its own pooled connection) before it is released.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await owner.query('COMMIT');
  return Promise.all(pending);
}

describe('before any rule release is in force', () => {
  it('queues nothing on a mapping that completes a month: the monitor prices nothing then (MAP-07)', async () => {
    const target = await practice('mapping no release');
    await send(target, map06());
    queue.jobs.splice(0);
    expect(redirectOf(await mapAs(target, await planOf(target, 'SYNPLAN-COMM-06')))).toMatch(/notice=mapped$/);
    expect(redirectOf(await mapAs(target, await planOf(target, 'SYNPLAN-UNMAPPED-06')))).toMatch(/notice=mapped$/);
    expect(monitorJobs()).toEqual([]);
    const page = ok(await call(mappingPage, target.manager, { practiceId: target.practiceId }));
    expect(page.months.waiting.months).toEqual([]);
    expect(page.months.releaseNo).toBeNull();
  });
});

describe('under SYNTHETIC release 900001', () => {
  beforeAll(async () => {
    await loadRouteRelease(owner);
  });

  it('prices a month around a plan with no mapping from the person’s run, then lists it to price again once the plan is mapped, through acceptance (MAP-01, MAP-06, MAP-07, MAP-08, PRC-31)', async () => {
    const target = await practice('mapping whole');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    queue.jobs.splice(0);
    const [a, b] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06')];
    // MAP-01, MAP-06: both plans have no mapping, their lines (the dollars waiting) counted on Coverage, Pricing runs and the home page.
    const unmapped = { plans: 2, lines: 7, chargeCents: '75000' };
    expect(ok(await call(coveragePage, target.viewer, P)).unmappedPlans).toEqual(unmapped);
    expect(ok(await call(pricingRunsPage, target.viewer, P)).unmappedPlans).toEqual(unmapped);
    expect(ok(await call(practiceHome, target.viewer, P)).dashboard.unmappedPlans).toEqual(unmapped);
    // MAP-07: a run would price nothing.
    expect(refusedWith(await call(createPricingRunAction, target.manager, P, { fromMonth: '2026-02', releaseNo: '900001' }))).toBe(`fromMonth: ${NOTHING_MAPPED}`);

    // Plan A mapped: February is mixed, so nothing is queued and the plan's page offers "Price them now".
    expect(redirectOf(await mapAs(target, a))).toBe(`/p/${target.practiceId}/mapping/${a}?notice=mapped`);
    expect(monitorJobs()).toEqual([]);
    const planA = ok(await call(planPage, target.manager, { ...P, planId: a }));
    expect(planA.months.waiting.months.map((month) => [month.periodFrom, month.mappedPlans, month.unmappedPlans])).toEqual([['2026-02-01', 1, 1]]);
    expect(planA.months.waiting.plans).toBe(1);
    expect(planA.canMap).toBe(true);
    expect(ok(await call(mappingPage, target.viewer, P)).canMap).toBe(false);

    // "Price them now": one request-keyed monitor job naming no months, audited; a viewer may not.
    expect((await call(priceWaitingAction, target.viewer, P, { planId: a })).status).toBe('forbidden');
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, { planId: a }))).toBe(`/p/${target.practiceId}/mapping/${a}?notice=pricing_requested`);
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, {}))).toBe(`/p/${target.practiceId}/mapping?notice=pricing_requested`);
    expect(monitorJobs()).toEqual([
      { type: 'monitor', payload: { practice_id: target.practiceId, request_id: expect.any(String) as unknown } },
      { type: 'monitor', payload: { practice_id: target.practiceId, request_id: expect.any(String) as unknown } },
    ]);
    expect(await eventsOf('monitoring_requested', target.practiceId)).toBe(2);
    expect((await call(priceWaitingAction, target.manager, P, { planId: randomUUID() })).status).toBe('not_found');
    queue.jobs.splice(0);

    // MAP-06 through the person's route: the month prices, B's lines unpriced, B named on the run's page.
    const runId = /pricing-runs\/([0-9a-f-]{36})$/.exec(redirectOf(await call(createPricingRunAction, target.manager, P, { fromMonth: '2026-02', releaseNo: '900001' })))?.[1] ?? '';
    expect(queue.jobs).toEqual([{ type: 'price', payload: { practice_id: target.practiceId, pricing_run_id: runId } }]);
    await runQueue();
    const run = ok(await call(pricingRunPage, target.viewer, { ...P, runId }));
    expect(run.run.status).toBe('complete');
    expect(run.run.coverage?.unmapped_plans).toEqual([{ plan_id: b, lines: 3, charge_cents: '30000' }]);
    // The plan with no mapping is named by its key (finding 9); A's lines are NO_AGREEMENT, so no pattern names it.
    expect(Object.values(run.names.plans)).toContain('CE:SYNPLAN-UNMAPPED-06');

    // Plan B mapped: February is covered, so nothing is queued; its lines are now mapped and still NO_MAPPING in effect.
    expect(redirectOf(await mapAs(target, b))).toBe(`/p/${target.practiceId}/mapping/${b}?notice=mapped`);
    expect(monitorJobs()).toEqual([]);
    // UX-3: B is mapped as no agreement, so a re-run only records its lines (NO_AGREEMENT): none of them to price.
    const figure = { lines: 3, chargeCents: '30000', runs: 1, months: 1, linesToPrice: 0, chargeCentsToPrice: '0' };
    const list = ok(await call(mappingPage, target.viewer, P));
    expect(list.mappedNotPriced).toEqual(figure);
    expect(list.unmappedPlans).toEqual({ plans: 0, lines: 0, chargeCents: '0' });
    expect(list.months.priceAgain.map((month) => [month.pricingRunId, month.lines, month.chargeCents, month.linesToPrice, month.state.kind])).toEqual([[runId, 3, '30000', 0, 'ready']]);
    expect(list.months.readyRunIds).toEqual([runId]);
    expect(list.months.releaseNo).toBe(900001);
    expect(ok(await call(coveragePage, target.viewer, P)).mappedNotPriced).toEqual(figure);
    expect(ok(await call(pricingRunsPage, target.viewer, P)).mappedNotPriced).toEqual(figure);
    expect(ok(await call(practiceHome, target.viewer, P)).dashboard.mappedNotPriced).toEqual(figure);
    expect(ok(await call(planPage, target.viewer, { ...P, planId: a })).months.priceAgain).toEqual([]);

    // MAP-09: a viewer may not; the form must send at least one month; a month the page did not show is refused.
    const press = { runIds: runId, releaseNo: '900001' };
    expect((await call(priceAgainAction, target.viewer, P, press)).status).toBe('forbidden');
    expect(refusedWith(await call(priceAgainAction, target.manager, P, { releaseNo: '900001' }))).toMatch(/^runIds:/);
    expect(refusedWith(await call(priceAgainAction, target.manager, P, { runIds: `${runId},${randomUUID()}`, releaseNo: '900001' }))).toBe(`runIds: ${MONTHS_CHANGED}`);
    expect(refusedWith(await call(priceAgainAction, target.manager, P, { ...press, releaseNo: '900002' }))).toMatch(/^releaseNo: rule-release mismatch/);
    expect(await rerunsOf(runId)).toEqual([]);

    // "Price these months again" from plan B's page: one re-run in the person's name, queued, audited on its own.
    expect(redirectOf(await call(priceAgainAction, target.manager, P, { ...press, planId: b }))).toBe(`/p/${target.practiceId}/mapping/${b}?notice=priced_again`);
    const [rerun] = await rerunsOf(runId);
    expect(queue.jobs).toEqual([{ type: 'price', payload: { practice_id: target.practiceId, pricing_run_id: rerun } }]);
    expect((await owner.query<{ created_by: string; created_by_job_id: string | null; accepted_at: Date | null }>('SELECT created_by, created_by_job_id, accepted_at FROM pricing_run WHERE id = $1', [rerun])).rows).toEqual([
      { created_by: target.manager, created_by_job_id: null, accepted_at: null },
    ]);
    expect(await eventsOf('plan_months_priced_again', target.practiceId)).toBe(1);
    expect((await owner.query("SELECT object_id FROM audit_event WHERE action = 'pricing_run_rerun_created' AND practice_id = $1", [target.practiceId])).rows).toEqual([{ object_id: rerun }]);
    // A second press of the same page, by a second person: nothing created, it succeeds and says so (R2-5).
    expect(redirectOf(await call(priceAgainAction, target.other, P, press))).toBe(`/p/${target.practiceId}/mapping?notice=already_pricing`);
    expect(await rerunsOf(runId)).toEqual([rerun]);
    await runQueue();
    expect(ok(await call(planPage, target.viewer, { ...P, planId: b })).months.priceAgain.map((month) => month.state)).toEqual([{ kind: 'to_accept', rerunId: rerun }]);

    // Accepted by hand: the figure falls to zero on every screen. B's lines are now NO_AGREEMENT (a "no agreement" mapping
    // prices nothing), so none waits for triage.
    ok(await call(acceptPricingRunAction, target.manager, P, { runId: rerun, replacesId: runId }));
    const none = { lines: 0, chargeCents: '0', runs: 0, months: 0, linesToPrice: 0, chargeCentsToPrice: '0' };
    expect(ok(await call(mappingPage, target.viewer, P)).mappedNotPriced).toEqual(none);
    expect(ok(await call(coveragePage, target.viewer, P)).mappedNotPriced).toEqual(none);
    expect(ok(await call(pricingRunsPage, target.viewer, P)).mappedNotPriced).toEqual(none);
    expect(ok(await call(practiceHome, target.viewer, P)).dashboard.mappedNotPriced).toEqual(none);
    expect(ok(await call(mappingPage, target.viewer, P)).months).toMatchObject({ priceAgain: [], toTriage: [], readyRunIds: [] });
  });

  it('queues monitoring of exactly the months a mapping completes, which the worker prices as first runs alone (MAP-07: month 1 {A, B}, month 2 {A, C})', async () => {
    const target = await practice('mapping a-b-c');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    await send(target, another('77', 'SYNPLAN-OTHER-06', '20260321'));
    queue.jobs.splice(0);
    const [a, b, c] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06'), await planOf(target, 'SYNPLAN-OTHER-06')];
    const monitor = (months: string[]) => ({ type: 'monitor', payload: { practice_id: target.practiceId, request_id: expect.any(String) as unknown, months } });
    expect(redirectOf(await mapAs(target, a))).toMatch(/notice=mapped$/);
    expect(monitorJobs()).toEqual([]);
    expect(ok(await call(mappingPage, target.viewer, P)).months.waiting.months.map((month) => month.periodFrom)).toEqual(['2026-02-01', '2026-03-01']);
    expect(redirectOf(await mapAs(target, b))).toBe(`/p/${target.practiceId}/mapping/${b}?notice=mapped_pricing`);
    expect(queue.jobs).toEqual([monitor(['2026-02-01'])]);
    expect(await runQueue({ monitor: true })).toEqual(['monitor', 'price']);
    const runs = () =>
      owner
        .query<{ period_from: string; status: string; job: boolean; rerun: boolean }>(
          'SELECT period_from::text, status, created_by_job_id IS NOT NULL AS job, rerun_of_id IS NOT NULL AS rerun FROM pricing_run WHERE practice_id = $1 ORDER BY period_from',
          [target.practiceId],
        )
        .then((result) => result.rows);
    expect(await runs()).toEqual([{ period_from: '2026-02-01', status: 'complete', job: true, rerun: false }]);
    expect(redirectOf(await mapAs(target, c))).toBe(`/p/${target.practiceId}/mapping/${c}?notice=mapped_pricing`);
    expect(queue.jobs).toEqual([monitor(['2026-03-01'])]);
    await runQueue({ monitor: true });
    expect(await runs()).toEqual([
      { period_from: '2026-02-01', status: 'complete', job: true, rerun: false },
      { period_from: '2026-03-01', status: 'complete', job: true, rerun: false },
    ]);
    expect(ok(await call(mappingPage, target.viewer, P)).months).toMatchObject({ priceAgain: [], readyRunIds: [] });
    expect(ok(await call(mappingPage, target.viewer, P)).months.waiting.months).toEqual([]);
    // The same mapping again changes nothing and queues nothing.
    expect(redirectOf(await mapAs(target, c))).toMatch(/notice=unchanged$/);
    expect(monitorJobs()).toEqual([]);
  });

  it('queues nothing for a month held on the billing ZIP, and says Mapped (MAP-07)', async () => {
    const target = await practice('mapping no zip');
    await send(target, map06());
    queue.jobs.splice(0);
    // A practice with no location (one created before PR 6b): the test's superuser, triggers off for the statement.
    await owner.query('BEGIN');
    await owner.query("SET LOCAL session_replication_role = 'replica'");
    await owner.query('DELETE FROM practice_site WHERE practice_id = $1', [target.practiceId]);
    await owner.query('COMMIT');
    expect(redirectOf(await mapAs(target, await planOf(target, 'SYNPLAN-COMM-06')))).toMatch(/notice=mapped$/);
    expect(redirectOf(await mapAs(target, await planOf(target, 'SYNPLAN-UNMAPPED-06')))).toMatch(/notice=mapped$/);
    expect(monitorJobs()).toEqual([]);
  });

  it('queues monitoring exactly once when two people map a month’s last two plans at the same moment (D22)', async () => {
    const target = await practice('mapping at once');
    await send(target, map06());
    await send(target, another('78', 'SYNPLAN-LATE-06'));
    queue.jobs.splice(0);
    const [a, b, c] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06'), await planOf(target, 'SYNPLAN-LATE-06')];
    await mapAs(target, a);
    const redirects = await atOnce(target.practiceId, () => [mapAs(target, b, target.manager), mapAs(target, c, target.other)]);
    expect(redirects.map((outcome) => /notice=(\w+)$/.exec(redirectOf(outcome))?.[1]).sort()).toEqual(['mapped', 'mapped_pricing']);
    expect(monitorJobs()).toHaveLength(1);
    queue.jobs.splice(0);
  });

  it('creates one re-run per month when two people press at once, and refuses what the page did not show (MAP-08, MAP-09)', async () => {
    const target = await practice('mapping press');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    queue.jobs.splice(0);
    const [a, b] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06')];
    await mapAs(target, a);
    const runId = /pricing-runs\/([0-9a-f-]{36})$/.exec(redirectOf(await call(createPricingRunAction, target.manager, P, { fromMonth: '2026-02', releaseNo: '900001' })))?.[1] ?? '';
    await runQueue();
    await mapAs(target, b);
    const press = { runIds: runId, releaseNo: '900001' };

    // Cross-practice: another practice's run is not a month of this page; another practice's plan is not found.
    const elsewhere = await practice('mapping press elsewhere');
    await send(elsewhere, map06());
    queue.jobs.splice(0);
    expect(refusedWith(await call(priceAgainAction, elsewhere.manager, { practiceId: elsewhere.practiceId }, press))).toBe(`runIds: ${MONTHS_CHANGED}`);
    expect((await call(priceAgainAction, target.manager, P, { ...press, planId: await planOf(elsewhere, 'SYNPLAN-UNMAPPED-06') })).status).toBe('not_found');
    expect((await call(priceAgainAction, target.manager, { practiceId: elsewhere.practiceId }, press)).status).toBe('not_found');

    // A failure to queue undoes the whole press.
    const broken: Services = { ...services, queue: { enqueue: () => Promise.reject(new Error('SYNTHETIC queue down')), enqueueScreeningRun: () => Promise.resolve(null) } };
    await call(priceAgainAction, target.manager, P, press, broken).catch((error: unknown) => error);
    expect(await rerunsOf(runId)).toEqual([]);

    // Two presses at once: one re-run in all, both succeed, one rerun event.
    const outcomes = await atOnce(target.practiceId, () => [call(priceAgainAction, target.manager, P, press), call(priceAgainAction, target.other, P, press)]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['ok', 'ok']);
    // R2-5: the press that created the re-run says so; the other says the month was already being priced again.
    expect(outcomes.map((outcome) => /notice=(\w+)$/.exec(redirectOf(outcome as Outcome<MutationResult>))?.[1]).sort()).toEqual(['already_pricing', 'priced_again']);
    const reruns = await rerunsOf(runId);
    expect(reruns).toHaveLength(1);
    expect(await eventsOf('pricing_run_rerun_created', target.practiceId)).toBe(1);
    expect(await eventsOf('plan_months_priced_again', target.practiceId)).toBe(2);
    queue.jobs.splice(0);

    // A re-run that stopped on the billing ZIP with nothing changed since: rerun_failed, refused as months_changed.
    await owner.query('BEGIN');
    await owner.query("SET LOCAL session_replication_role = 'replica'");
    await owner.query("UPDATE pricing_run SET status = 'failed', failure_code = 'location_not_ready' WHERE id = $1", [reruns[0]]);
    await owner.query('COMMIT');
    expect(ok(await call(mappingPage, target.viewer, P)).months.priceAgain.map((month) => month.state.kind)).toEqual(['rerun_failed']);
    expect(refusedWith(await call(priceAgainAction, target.manager, P, press))).toBe(`runIds: ${MONTHS_CHANGED}`);
    expect(await rerunsOf(runId)).toEqual(reruns);

    // A newer first run of the month queued: the month waits, and createRerun's refusal reads after its dates.
    ok(await call(createPricingRunAction, target.manager, P, { fromMonth: '2026-02', releaseNo: '900001' }));
    expect(ok(await call(mappingPage, target.viewer, P)).months.priceAgain.map((month) => month.state.kind)).toEqual(['waiting']);
    expect(refusedWith(await call(priceAgainAction, target.manager, P, press))).toBe(`runIds: ${MONTHS_CHANGED}`);
    const refused = await withPracticeScope(app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
      createRerun(scope, { practiceId: target.practiceId, pricingRunId: runId, releaseNo: 900001, requestId: `test-${randomUUID()}` }),
    ).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(RerunRefusedError);
    const issue = priceAgainRefusal(refused, FEBRUARY)?.issues[0];
    expect(issue?.field).toBe('runIds');
    expect(issue?.message).toMatch(/^2026-02-01 to 2026-02-28: is not priced again yet, because a newer run of these service dates is waiting to be priced or being priced/);
    expect(await rerunsOf(runId)).toEqual(reruns);
    queue.jobs.splice(0);
  });

  // R3N-1 and security F2: a mapping only for later dates completes no month, so it queues nothing and says Mapped.
  it('R3N-1: queues nothing and refuses a run for a month whose plans are mapped only from a later date; the mappings that cover it queue its first run', async () => {
    const target = await practice('mapping later dates');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    queue.jobs.splice(0);
    const [a, b] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06')];
    const june = { effectiveFrom: '2026-06-01' };
    expect(redirectOf(await mapAs(target, a, target.manager, june))).toMatch(/notice=mapped$/);
    expect(redirectOf(await mapAs(target, b, target.manager, june))).toMatch(/notice=mapped$/);
    expect(monitorJobs()).toEqual([]);
    expect(ok(await call(coveragePage, target.viewer, P)).unmappedPlans).toEqual({ plans: 2, lines: 7, chargeCents: '75000' });
    expect(refusedWith(await call(createPricingRunAction, target.manager, P, { fromMonth: '2026-02', releaseNo: '900001' }))).toBe(`fromMonth: ${NOTHING_MAPPED}`);
    const earlier = { effectiveFrom: '2026-01-01', lastDay: '2026-05-31' };
    expect(redirectOf(await mapAs(target, a, target.manager, earlier))).toMatch(/notice=mapped$/);
    expect(redirectOf(await mapAs(target, b, target.manager, earlier))).toBe(`/p/${target.practiceId}/mapping/${b}?notice=mapped_pricing`);
    expect(queue.jobs).toEqual([{ type: 'monitor', payload: { practice_id: target.practiceId, request_id: expect.any(String) as unknown, months: ['2026-02-01'] } }]);
    expect(await runQueue({ monitor: true })).toEqual(['monitor', 'price']);
    expect((await owner.query('SELECT status FROM pricing_run WHERE practice_id = $1', [target.practiceId])).rows).toEqual([{ status: 'complete' }]);
  });

  // Security F1: the worker refuses a suspended practice's monitoring, so the mapping queues none and never says "being priced".
  it('security F1: keeps a mapping made while the practice is suspended, queues nothing, says mapped_held with the reason on the page; once reinstated the month prices', async () => {
    const target = await practice('mapping suspended');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    queue.jobs.splice(0);
    const [a, b] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06')];
    expect(redirectOf(await mapAs(target, a))).toMatch(/notice=mapped$/);
    expect(ok(await call(planPage, target.viewer, { ...P, planId: b })).suspension).toBeNull();
    await owner.query("UPDATE organization SET status = 'suspended' WHERE id = $1", [target.organizationId]);
    expect(redirectOf(await mapAs(target, b))).toBe(`/p/${target.practiceId}/mapping/${b}?notice=mapped_held`);
    expect(monitorJobs()).toEqual([]);
    expect((await owner.query('SELECT 1 FROM payer_plan_mapping WHERE plan_id = $1', [b])).rowCount).toBe(1);
    expect(ok(await call(planPage, target.viewer, { ...P, planId: b })).suspension).toMatch(/^the organization is suspended/);
    expect(ok(await call(mappingPage, target.viewer, P)).suspension).toMatch(/^the organization is suspended/);
    // A correction made while suspended is held the same way.
    const mappingId = (await owner.query<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE plan_id = $1', [b])).rows[0]?.id ?? '';
    expect(redirectOf(await call(mapPlanAction, target.manager, P, { planId: b, kind: 'no_agreement', effectiveFrom: '2026-01-02', supersedesId: mappingId }))).toBe(
      `/p/${target.practiceId}/mapping/${b}?notice=corrected_held`,
    );
    expect(monitorJobs()).toEqual([]);
    expect((await owner.query('SELECT 1 FROM pricing_run WHERE practice_id = $1', [target.practiceId])).rowCount).toBe(0);
    // Reinstated: nothing was lost; "Price them now" prices the month.
    await owner.query("UPDATE organization SET status = 'active' WHERE id = $1", [target.organizationId]);
    expect(ok(await call(planPage, target.viewer, { ...P, planId: b })).suspension).toBeNull();
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, {}))).toBe(`/p/${target.practiceId}/mapping?notice=pricing_requested`);
    expect(await runQueue({ monitor: true })).toEqual(['monitor', 'price']);
    expect((await owner.query('SELECT status FROM pricing_run WHERE practice_id = $1', [target.practiceId])).rows).toEqual([{ status: 'complete' }]);
  });

  // UX-7: a press on the filtered list returns to the same filtered list; a filter that is not valid is dropped.
  it('UX-7: returns a list press to the list with its view and payer kept, before the notice', async () => {
    const target = await practice('mapping filters');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    queue.jobs.splice(0);
    const payer = (await owner.query<{ payer_id: string }>('SELECT payer_id FROM plan WHERE practice_id = $1 LIMIT 1', [target.practiceId])).rows[0]?.payer_id ?? '';
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, { view: 'all', payer }))).toBe(`/p/${target.practiceId}/mapping?view=all&payer=${payer}&notice=pricing_requested`);
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, { view: 'mapped' }))).toBe(`/p/${target.practiceId}/mapping?view=mapped&notice=pricing_requested`);
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, { view: 'nonsense', payer: 'not an id' }))).toBe(`/p/${target.practiceId}/mapping?notice=pricing_requested`);
    // A plan's page has no list filters: it returns to the plan.
    const a = await planOf(target, 'SYNPLAN-COMM-06');
    expect(redirectOf(await call(priceWaitingAction, target.manager, P, { planId: a, view: 'all' }))).toBe(`/p/${target.practiceId}/mapping/${a}?notice=pricing_requested`);
    queue.jobs.splice(0);
  });

  it('refuses as months_changed a press that leaves out a month ready to price again, creating nothing, and prices both once both are sent (MAP-09)', async () => {
    // February and March each hold A and B; each month priced with B unmapped, then B mapped: two months ready.
    const target = await practice('mapping not sent');
    const P = { practiceId: target.practiceId };
    await send(target, map06());
    await send(target, another('79', 'SYNPLAN-UNMAPPED-06', '20260321'));
    queue.jobs.splice(0);
    const [a, b] = [await planOf(target, 'SYNPLAN-COMM-06'), await planOf(target, 'SYNPLAN-UNMAPPED-06')];
    await mapAs(target, a);
    const runOf = async (fromMonth: string) =>
      /pricing-runs\/([0-9a-f-]{36})$/.exec(redirectOf(await call(createPricingRunAction, target.manager, P, { fromMonth, releaseNo: '900001' })))?.[1] ?? '';
    const [february, march] = [await runOf('2026-02'), await runOf('2026-03')];
    await runQueue();
    expect(redirectOf(await mapAs(target, b))).toMatch(/notice=mapped$/);
    expect(ok(await call(mappingPage, target.viewer, P)).months.readyRunIds).toEqual([february, march]);

    // March is ready and the form sent February alone, from the list and from B's page: nothing is created.
    for (const planId of [undefined, b]) {
      expect(refusedWith(await call(priceAgainAction, target.manager, P, { runIds: february, releaseNo: '900001', ...(planId === undefined ? {} : { planId }) }))).toBe(`runIds: ${MONTHS_CHANGED}`);
    }
    expect([...(await rerunsOf(february)), ...(await rerunsOf(march))]).toEqual([]);
    expect(await eventsOf('plan_months_priced_again', target.practiceId)).toBe(0);
    expect(queue.jobs).toEqual([]);

    // Both sent: one re-run of each.
    // UX-7: posted from the list filtered to every plan, it returns there.
    expect(redirectOf(await call(priceAgainAction, target.manager, P, { runIds: `${february},${march}`, releaseNo: '900001', view: 'all' }))).toBe(`/p/${target.practiceId}/mapping?view=all&notice=priced_again`);
    expect([(await rerunsOf(february)).length, (await rerunsOf(march)).length]).toEqual([1, 1]);
    expect(queue.jobs.map((job) => job.type)).toEqual(['price', 'price']);
    queue.jobs.splice(0);
  });
});
