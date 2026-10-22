import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease, withdrawRelease } from '@tp/rules/loader';
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
import { acceptPricingRunAction, comparePricingRunsPage, createPricingRunAction, pricingRunPage, pricingRunsPage, rerunPricingRunAction } from './pricing';
import { releasesPage } from './releases';
import { claimsPage } from './remittances';
import { generateReportAction, reportsPage } from './reports';
import { prepareRuleReleaseAction, ruleReleasesPage } from './rule-releases';
import { scratchContentRoot } from './test-support/content-root';
import { loadRouteRelease } from './test-support/pricing-world';
import { casesPage, triageRunAction } from './triage';
import { completeUpload, requestUploads, uploadContent } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * Re-runs under a new release through the screens (PRD 5, J17; PRD 7, Pricing runs and Internal console
 * Rule releases; PRD 9, The release pipeline steps 4 and 5; PRD 18, Releases; test matrix PRC-19;
 * docs/adr/0037): the SYNTHETIC PRC-19 remittance is uploaded and loaded by the worker's jobs, the
 * billing manager maps its plan and runs February under release 900001; release 900004 (the 97110 work
 * RVU raised) is loaded; the release note says what changed and which runs it would change, the
 * re-run's page lists exactly the two 97110 lines with the relative-value record as the cause, nothing
 * reads the re-run until it is accepted, and a content rollback flags the re-run without changing it.
 * The platform administrator's console shows the releases and their affected runs as counts, checks the
 * content and prepares the next release.
 */

const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-rerun-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const content = scratchContentRoot();
const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let world: TenantWorld;
let manager: string;
let viewer: string;
let admin: string;
let practiceId: string;

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
    token = (await openSession(app, { userId, method: userId === admin ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
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

const runFrom = (outcome: Outcome<MutationResult>) => /pricing-runs\/([0-9a-f-]{36})$/.exec(ok(outcome).redirect ?? '')?.[1] ?? '';

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
    contentRoot: content.root,
  });
  world = await createTenantWorld(owner, 'rerun routes');
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
  const internal = await createOrganization(owner, 'internal', 'rerun routes');
  admin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, admin, 'platform_admin');
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-baa', $3)`,
      [world.organizationId, practiceId, randomBytes(32).toString('hex')],
    ),
  );
  await send('PRC-19/remit.835');
}, 120_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
  rmSync(documentsDir, { recursive: true, force: true });
  content.remove();
});

let first = '';
let second = '';

describe('a re-run under release 2 through the screens (PRC-19)', () => {
  it('prices February under release 900001, then lists, after release 900004 loads, the runs it would change', async () => {
    const plan = (await owner.query<{ id: string }>("SELECT id FROM plan WHERE practice_id = $1 AND plan_key = 'CE:SYNPLAN-MA-NC'", [practiceId])).rows[0]?.id ?? '';
    ok(await call(mapPlanAction, manager, P(), { planId: plan, kind: 'ma_noncontracted', effectiveFrom: '2026-01-01' }));
    first = runFrom(await call(createPricingRunAction, manager, P(), { fromMonth: '2026-02', releaseNo: '900001' }));
    await runQueue();
    expect(ok(await call(pricingRunsPage, manager, P())).pinnedElsewhere).toBe(0);

    await loadRelease(owner, path.join(FIXTURES, 'rules/release-synth-900004'), { release: 900004, allowSyntheticFixtureForTests: true });
    const runs = ok(await call(pricingRunsPage, viewer, P()));
    expect(runs.release?.releaseNo).toBe(900004);
    expect(runs.pinnedElsewhere).toBe(1);
    expect(runs.list.runs[0]).toMatchObject({ id: first, inEffect: true, rerun: ['release_published'] });

    // The release note: what changed, and the runs it would change.
    const note = ok(await call(releasesPage, manager, { ...P(), check: first }));
    expect(note.note).toMatchObject({ releaseNo: 900004, inForce: true, previous: 900001, changes: [{ recordType: 'pfs_rvu', added: 0, removed: 0, changed: 1 }], recordChangesTotal: 1 });
    expect(note.note?.recordChanges).toEqual([
      { recordType: 'pfs_rvu', key: { hcpcs: '97110', modifier: '' }, effectiveFrom: '2026-01-01', kind: 'changed', fields: [{ field: 'work_rvu', before: '0.31', after: '0.41' }] },
    ]);
    expect(note.otherRuns.map((run) => run.id)).toEqual([first]);
    expect(note.impact).toMatchObject({ pricingRunId: first, lines: 4, changedLines: 2 });
    expect(note.releases.map((release) => [release.releaseNo, release.inForce])).toEqual([
      [900004, true],
      [900001, false],
    ]);
    // A viewer reads the note and the runs, and cannot have one checked or re-run.
    const asViewer = ok(await call(releasesPage, viewer, { ...P(), check: first }));
    expect(asViewer).toMatchObject({ impact: null, canRerun: false });
    expect(asViewer.otherRuns.map((run) => run.id)).toEqual([first]);
    expect((await call(releasesPage, viewer, { ...P(), release: '899999' })).status).toBe('not_found');
    expect(ok(await call(releasesPage, viewer, { ...P(), release: '900001' })).note).toMatchObject({ releaseNo: 900001, inForce: false, previous: null });
  });

  it('re-runs the run, shows exactly the two 97110 lines with the relative value as the cause, and nothing reads the re-run until it is accepted', async () => {
    expect((await call(rerunPricingRunAction, viewer, P(), { runId: first, releaseNo: '900004' })).status).toBe('forbidden');
    expect(refusedWith(await call(rerunPricingRunAction, manager, P(), { runId: first, releaseNo: '900001' }))).toMatch(/^releaseNo: rule-release mismatch/);
    expect(refusedWith(await call(rerunPricingRunAction, manager, P(), { runId: randomUUID(), releaseNo: '900004' }))).toMatch(/^runId: the run to price again is not one of the practice’s runs/);
    second = runFrom(await call(rerunPricingRunAction, manager, P(), { runId: first, releaseNo: '900004' }));
    expect(queue.jobs).toEqual([{ type: 'price', payload: { practice_id: practiceId, pricing_run_id: second } }]);
    expect(ok(await call(pricingRunPage, manager, { ...P(), runId: second })).diff).toBeNull();
    await runQueue();

    const page = ok(await call(pricingRunPage, viewer, { ...P(), runId: second }));
    expect(page.run).toMatchObject({ rerunOfId: first, releaseNo: 900004, acceptedAt: null, inEffect: false });
    expect(page.canRerun).toBe(false);
    expect(page.diff?.summary).toMatchObject({ compared: 4, changed: 2, onlyBefore: 0, onlyAfter: 0 });
    expect(page.diff?.lines.map((line) => [line.procedureCode, line.causes.map((cause) => (cause.kind === 'release_record' ? `${cause.recordType} ${cause.key.hcpcs ?? ''}` : cause.kind))])).toEqual([
      ['97110', ['pfs_rvu 97110']],
      ['97110', ['pfs_rvu 97110']],
    ]);
    const original = ok(await call(pricingRunPage, manager, { ...P(), runId: first }));
    expect(original.reruns.map((run) => run.id)).toEqual([second]);

    const compared = ok(await call(comparePricingRunsPage, viewer, { ...P(), before: first, after: second, lines: 'changed' }));
    expect(compared).toMatchObject({ canAccept: false });
    expect(compared.diff?.lines).toHaveLength(2);
    expect(ok(await call(comparePricingRunsPage, manager, { ...P(), before: first, after: second })).canAccept).toBe(true);
    expect(ok(await call(comparePricingRunsPage, manager, { ...P(), before: second, after: first })).canAccept).toBe(false);
    expect((await call(comparePricingRunsPage, viewer, { ...P(), before: first, after: randomUUID() })).status).toBe('not_found');

    // Until it is accepted, Coverage and Claims and lines read the first run, and triage and reports offer and take only it.
    expect(ok(await call(coveragePage, viewer, P())).run?.id).toBe(first);
    expect(ok(await call(casesPage, manager, P())).runs.map((run) => run.id)).toEqual([first]);
    expect(ok(await call(reportsPage, manager, P())).runs.map((run) => run.id)).toEqual([first]);
    expect(refusedWith(await call(triageRunAction, manager, P(), { runId: second }))).toMatch(/^runId: the pricing run in effect for its period/);
    expect(refusedWith(await call(generateReportAction, manager, P(), { runId: second }))).toMatch(/^runId: the pricing run in effect for its period/);
    const before = ok(await call(claimsPage, manager, { ...P(), view: 'all' })).list.rows.filter((row) => row.procedureCode === '97110');
    expect(before.map((row) => row.pricing?.pricingRunId)).toEqual([first, first]);

    expect((await call(acceptPricingRunAction, viewer, P(), { runId: second })).status).toBe('forbidden');
    expect(refusedWith(await call(acceptPricingRunAction, manager, P(), { runId: first }))).toMatch(/^runId: only a re-run is accepted/);
    ok(await call(acceptPricingRunAction, manager, P(), { runId: second }));
    ok(await call(acceptPricingRunAction, manager, P(), { runId: second }));
    expect(ok(await call(pricingRunPage, manager, { ...P(), runId: second })).run).toMatchObject({ inEffect: true, acceptedAt: expect.any(String) as string });
    expect(ok(await call(pricingRunPage, manager, { ...P(), runId: first })).run.inEffect).toBe(false);
    expect(ok(await call(coveragePage, viewer, P())).run?.id).toBe(second);
    const after = ok(await call(claimsPage, manager, { ...P(), view: 'all' })).list.rows.filter((row) => row.procedureCode === '97110');
    expect(after.map((row) => row.pricing?.pricingRunId)).toEqual([second, second]);
    expect(after.map((row) => BigInt(row.expectedAllowedCents ?? '0') > BigInt(before.find((other) => other.lineId === row.lineId)?.expectedAllowedCents ?? '0'))).toEqual([true, true]);
    expect(ok(await call(pricingRunsPage, manager, P())).pinnedElsewhere).toBe(0);
    // Both requests are recorded; the second changed nothing.
    const { rows } = await owner.query("SELECT 1 FROM audit_event WHERE action = 'pricing_run_accepted' AND object_id = $1", [second]);
    expect(rows).toHaveLength(2);

    // Once accepted, triage and reports offer and take the re-run, and no longer the run it replaced.
    expect(ok(await call(casesPage, manager, P())).runs.map((run) => run.id)).toEqual([second]);
    expect(ok(await call(reportsPage, manager, P())).runs.map((run) => run.id)).toEqual([second]);
    expect(refusedWith(await call(triageRunAction, manager, P(), { runId: first }))).toMatch(/^runId: the pricing run in effect for its period/);
    expect(refusedWith(await call(generateReportAction, manager, P(), { runId: first }))).toMatch(/^runId: the pricing run in effect for its period/);
    queue.jobs.splice(0);
    ok(await call(triageRunAction, manager, P(), { runId: second }));
    const requested = ok(await call(generateReportAction, manager, P(), { runId: second })).objectId;
    expect(queue.jobs.splice(0)).toEqual([
      { type: 'triage', payload: { practice_id: practiceId, pricing_run_id: second } },
      { type: 'audit_report', payload: { practice_id: practiceId, audit_report_id: requested } },
    ]);
  });

  it('flags the re-run when release 900004 is withdrawn, without changing it, and refuses to accept a re-run pinned to it', async () => {
    const pending = runFrom(await call(rerunPricingRunAction, manager, P(), { runId: first, releaseNo: '900004' }));
    await runQueue();
    const before = ok(await call(pricingRunPage, manager, { ...P(), runId: second }));
    await withdrawRelease(owner, { release: 900004, reason: 'SYNTHETIC: the 97110 work RVU was mistyped' });
    const flagged = ok(await call(pricingRunPage, manager, { ...P(), runId: second }));
    expect(flagged.run.withdrawal).toMatchObject({ reinstatedReleaseNo: 900001, reason: 'SYNTHETIC: the 97110 work RVU was mistyped' });
    expect(flagged.run.rerun).toEqual(expect.arrayContaining(['release_withdrawn']));
    expect({ ...flagged.run, withdrawal: null, rerun: [] }).toEqual({ ...before.run, rerun: [] });
    expect(flagged.lines).toEqual(before.lines);
    expect(flagged.release?.releaseNo).toBe(900001);
    expect(ok(await call(pricingRunsPage, manager, P())).pinnedElsewhere).toBe(1);
    expect(refusedWith(await call(acceptPricingRunAction, manager, P(), { runId: pending }))).toMatch(/^runId: the re-run is pinned to a withdrawn rule release/);
    expect(ok(await call(comparePricingRunsPage, manager, { ...P(), before: first, after: pending })).canAccept).toBe(false);
    expect(ok(await call(releasesPage, viewer, { ...P(), release: '900004' })).note).toMatchObject({ inForce: false, withdrawal: { reinstatedReleaseNo: 900001 } });
  });
});

describe('the console’s Rule releases screen', () => {
  it('shows the releases and their affected runs as counts, checks the content and prepares the next release, and is the platform administrators’ alone', async () => {
    expect((await call(ruleReleasesPage, manager, {})).status).toBe('forbidden');
    const page = ok(await call(ruleReleasesPage, admin, { check: '1' }));
    expect(page.releases.map((release) => [release.releaseNo, release.inForce, release.withdrawal?.reinstatedReleaseNo ?? null])).toEqual([
      [900004, false, 900001],
      [900001, true, null],
    ]);
    expect(page.note?.releaseNo).toBe(900001);
    expect(page.runs.filter((row) => row.practiceId === practiceId)).toEqual([
      { releaseNo: 900004, practiceId, name: expect.any(String) as string, runs: 2, runsInEffect: 1, reruns: 2, rerunsAccepted: 1, changedLines: 4 },
      { releaseNo: 900001, practiceId, name: expect.any(String) as string, runs: 1, runsInEffect: 1, reruns: 0, rerunsAccepted: 0, changedLines: 0 },
    ]);
    expect(page.check?.ok).toBe(true);
    expect(page.workspace?.drafts.map((draft) => draft.levels)).toEqual([{ L1: 0, L2: 1, L3: 0 }]);
    expect(page.nextRelease).toBe(1);
    const withdrawn = ok(await call(ruleReleasesPage, admin, { release: '900004' }));
    expect(withdrawn.note).toMatchObject({ releaseNo: 900004, changes: [{ recordType: 'pfs_rvu', changed: 1 }] });
    expect(withdrawn.elsewhere).toEqual([{ practiceId, name: expect.any(String) as string, runsInEffect: 1 }]);

    expect(ok(await call(prepareRuleReleaseAction, admin, {}, {})).redirect).toBe('/console/rule-releases?prepared=1');
    expect(existsSync(path.join(content.root, 'content/outgoing/1/MANIFEST.json'))).toBe(true);
    expect(ok(await call(ruleReleasesPage, admin, { prepared: '1' }))).toMatchObject({ prepared: 1, nextRelease: 2, workspace: { prepared: [{ release: 1, records: 1 }] } });
    expect((await call(prepareRuleReleaseAction, manager, {}, {})).status).toBe('forbidden');
    const { rows } = await owner.query("SELECT 1 FROM audit_event WHERE action = 'rule_release_prepared' AND actor_id = $1", [admin]);
    expect(rows).toHaveLength(1);
    // Never content/releases.
    expect(existsSync(path.join(content.root, 'content/releases'))).toBe(false);
  });

  it('says so when the server has no content checkout', async () => {
    const without = createServices({ ...services, contentRoot: null });
    const session = await sessionOf(admin);
    const page = await ruleReleasesPage.invoke({ cookies: new Jar(session), params: { check: '1' }, requestId: `test-${randomUUID()}`, userAgent: null }, without);
    expect(page).toMatchObject({ status: 'ok', data: { workspace: null, check: null, nextRelease: null } });
    const prepared = await prepareRuleReleaseAction.invoke({ cookies: new Jar(session), params: {}, input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, session) }, requestId: `test-${randomUUID()}`, userAgent: null }, without);
    expect(refusedWith(prepared)).toMatch(/^release: this server has no content checkout/);
  });
});
