import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { RATE_RECORD_FIELDS } from '@tp/contracts';
import { type DatabaseClient, type DatabasePool, type DatabasePoolClient, LocalKeyProvider, type PracticeCipher, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type JobContext, intakeHandler, intakeServices, parseHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Download, MutationResult, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import {
  abstractionPage,
  abstractionVersionPage,
  addRateRecordAction,
  amendVersionAction,
  approveFieldAction,
  approveVersionAction,
  askQuestionAction,
  citeWindowAction,
  removeRateRecordAction,
  startAbstraction,
  supersedeVersionAction,
  updateVersionAction,
  verifyWindowAction,
  withdrawQuestionAction,
} from './abstraction';
import { createSupportGrant, specialistQueuePage, supportPage } from './console';
import { answerQuestionAction, contractPage, contractsPage, signOffAction, tagContractDocument, versionPage } from './contracts';
import { coveragePage, payerLetter } from './coverage';
import { mapPlanAction, mappingPage, planPage } from './mapping';
import { completeUpload, requestUploads, uploadContent } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * The mapping, coverage, contract and specialist screens end to end through their routes (PRD 5, J5
 * and J6; PRD 7, Payer and plan mapping, Contracts, Rate record review, Coverage and Specialist queue;
 * test matrix MAP-01, MAP-03, MAP-04, CON-01 to CON-04): the SYNTHETIC fixtures MAP-01 and CON-07 are
 * uploaded and loaded by the worker's jobs, the CON-01 contract is uploaded through the same intake,
 * tagged to its payer by the billing manager, abstracted by hand by a contract specialist under a
 * support grant a platform administrator opens, approved field by field, signed off by the billing
 * manager and mapped, and the screens are read back at each step.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-contract-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let world: TenantWorld;
let cipher: PracticeCipher;
let manager: string;
let viewer: string;
let specialist: string;
let outsideSpecialist: string;
let platformAdmin: string;
let practiceId: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
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
    now: () => new Date('2026-10-15T12:00:00Z'),
  });
  world = await createTenantWorld(owner, 'contracts');
  practiceId = world.practiceId;
  const key = await provisionPracticeKey(keys, practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1, npi = $2 WHERE id = $3', [key.dataKeyRef, '9900000011', practiceId]);
  cipher = key.cipher;
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  viewer = await createUser(owner);
  await addMembership(owner, world.organizationId, viewer, 'viewer');
  const internal = await createOrganization(owner, 'internal', 'contracts internal');
  specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  outsideSpecialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, outsideSpecialist, 'contract_specialist');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
  // The BAA, so uploads open (PRD 6: no upload without a BAA).
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-baa', $3)`,
      [world.organizationId, practiceId, randomBytes(32).toString('hex')],
    ),
  );
}, 60_000);

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
    const internal = [specialist, outsideSpecialist, platformAdmin].includes(userId);
    token = (await openSession(app, { userId, method: internal ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
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
  return outcome.issues.map((issue) => issue.message).join(' | ');
}

const P = () => ({ practiceId });

/** The browser's part of an upload, with the bytes. */
async function send(file: string, kind: 'x12_835' | 'contract', contentType: string): Promise<string> {
  const bytes = readFileSync(path.join(FIXTURES, file));
  const [document] = ok(await call(requestUploads, manager, P(), { files: [{ kind, contentType, sizeBytes: bytes.length }] })).documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  const put = await uploadContent.invoke(
    {
      cookies: new Jar(await sessionOf(manager)),
      params: { ...P(), documentId: document.documentId },
      input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(manager)), token },
      upload: { contentType, contentLength: bytes.length, body: Readable.from([bytes]) },
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    services,
  );
  ok(put);
  ok(await call(completeUpload, manager, P(), { documentId: document.documentId }));
  await runQueue();
  return document.documentId;
}

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
      const payload = job.payload as { practice_id: string; document_id: string };
      if (job.type === 'intake') {
        await intakeHandler(jobs)(payload, jobContext());
      } else if (job.type === 'parse_835') {
        await parseHandler(jobs)(payload, jobContext());
      }
    }
  }
}

const planOf = async (planKey: string) => ((await owner.query<{ id: string; payer_id: string }>('SELECT id, payer_id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, planKey])).rows[0] ?? { id: '', payer_id: '' });
const redirectOf = (outcome: Outcome<MutationResult>) => ok(outcome).redirect ?? '';
const versionFrom = (redirect: string) => /versions\/([0-9a-f-]{36})/.exec(redirect)?.[1] ?? '';

describe('payer and plan mapping and coverage (MAP-01, MAP-03, MAP-04)', () => {
  let mapPlan: { id: string; payer_id: string };

  it('lists the unmapped plan with its claims and dollars, and shows them waiting on mapping at the top and on Coverage (MAP-01)', async () => {
    await send('MAP-01/remit.835', 'x12_835', 'application/octet-stream');
    mapPlan = await planOf('CE:SYNPLAN-UNMAPPED-01');
    expect(mapPlan.id).not.toBe('');
    const expected = (JSON.parse(readFileSync(path.join(FIXTURES, 'MAP-01/expected.json'), 'utf8')) as { outcome: { coverageWaiting: { lines: number; chargeCents: string; paidCents: string } } }).outcome.coverageWaiting;
    const mapping = ok(await call(mappingPage, viewer, P()));
    const row = mapping.list.plans.find((plan) => plan.id === mapPlan.id);
    expect(row).toMatchObject({ status: 'unmapped', payerName: 'SYNTHETIC PAYER M', planKey: 'CE:SYNPLAN-UNMAPPED-01', current: [] });
    expect(row?.waiting).toEqual({ lines: expected.lines, claims: 2, chargeCents: expected.chargeCents, paidCents: expected.paidCents });
    expect(row?.totals).toEqual(row?.waiting);
    expect(mapping.waiting).toEqual(row?.waiting);
    expect(mapping.canMap).toBe(false);
    const coverage = ok(await call(coveragePage, viewer, P()));
    expect(coverage.waiting).toEqual(row?.waiting);
    expect(coverage.waitingPlans.plans).toEqual([{ planId: mapPlan.id, payerName: 'SYNTHETIC PAYER M', planKey: 'CE:SYNPLAN-UNMAPPED-01', waiting: row?.waiting }]);
    // Pricing is refused on an unmapped plan (the run's own guard), and coverage is zero before any run.
    expect(coverage.readiness).toEqual({ allowed: false, unmappedPlans: 1, linesWithoutPlan: 0 });
    expect(coverage.priced).toEqual({ lines: 0, chargeCents: '0' });
    expect(coverage.lines.lines).toBe(expected.lines);
    expect(coverage.reasons.map((reason) => [reason.reason, reason.lines])).toContainEqual(['NO_MAPPING', 0]);
    const plan = ok(await call(planPage, viewer, { ...P(), planId: mapPlan.id }));
    expect(plan.detail.resolution).toEqual([{ outcome: 'NO_MAPPING', version: null, lines: 4, chargeCents: expected.chargeCents }]);
  });

  it('refuses mapping to a role without mapping.edit, and maps as no agreement for the billing manager (MAP-04)', async () => {
    const input = { planId: mapPlan.id, kind: 'no_agreement', effectiveFrom: '2026-01-01' };
    expect((await call(mapPlanAction, viewer, P(), input)).status).toBe('forbidden');
    expect(refusedWith(await call(mapPlanAction, manager, P(), { ...input, kind: 'contract' }))).toMatch(/signed-off contract version/);
    expect(redirectOf(await call(mapPlanAction, manager, P(), input))).toBe(`/p/${practiceId}/mapping/${mapPlan.id}?notice=mapped`);
    // The same mapping again changes nothing.
    expect(redirectOf(await call(mapPlanAction, manager, P(), input))).toBe(`/p/${practiceId}/mapping/${mapPlan.id}?notice=unchanged`);
    expect((await owner.query('SELECT 1 FROM payer_plan_mapping WHERE plan_id = $1', [mapPlan.id])).rowCount).toBe(1);
    const mapping = ok(await call(mappingPage, manager, P()));
    expect(mapping.list.plans.map((plan) => plan.id)).not.toContain(mapPlan.id);
    expect(mapping.waiting.lines).toBe(0);
    const all = ok(await call(mappingPage, manager, { ...P(), view: 'mapped' }));
    expect(all.list.plans.find((plan) => plan.id === mapPlan.id)).toMatchObject({ status: 'mapped', current: [{ kind: 'no_agreement', effectiveFrom: '2026-01-01', effectiveTo: null }] });
    const coverage = ok(await call(coveragePage, manager, P()));
    expect(coverage.waiting).toEqual({ lines: 0, claims: 0, chargeCents: '0', paidCents: '0' });
    expect(coverage.readiness.allowed).toBe(true);
    const plan = ok(await call(planPage, manager, { ...P(), planId: mapPlan.id }));
    expect(plan.detail.resolution.map((bucket) => [bucket.outcome, bucket.lines])).toEqual([['NO_AGREEMENT', 4]]);
  });

  it('refuses an overlapping mapping with the rule, and corrects a mapping with a new one that leaves the old as it was (MAP-03)', async () => {
    expect(refusedWith(await call(mapPlanAction, manager, P(), { planId: mapPlan.id, kind: 'government', effectiveFrom: '2026-02-01' }))).toMatch(/never overlap/);
    const [first] = (await owner.query('SELECT * FROM payer_plan_mapping WHERE plan_id = $1', [mapPlan.id])).rows as [Record<string, unknown>];
    expect(redirectOf(await call(mapPlanAction, manager, P(), { planId: mapPlan.id, kind: 'other', effectiveFrom: '2026-01-01', supersedesId: first.id }))).toMatch(/notice=corrected$/);
    expect((await owner.query('SELECT * FROM payer_plan_mapping WHERE id = $1', [first.id])).rows[0]).toEqual(first);
    const plan = ok(await call(planPage, manager, { ...P(), planId: mapPlan.id, notice: 'corrected' }));
    expect(plan.notice).toBe('corrected');
    expect(plan.detail.history.map((entry) => [entry.kind, entry.supersededById === null])).toEqual([
      ['no_agreement', false],
      ['other', true],
    ]);
    expect(plan.detail.plan.current.map((mapping) => mapping.kind)).toEqual(['other']);
  });

  it('downloads the request-to-payer letter from its fixed template, with no file name or patient in it', async () => {
    const letter = ok<Download>(await call(payerLetter, viewer, { ...P(), payer: mapPlan.payer_id, codes: '97530, 97110,97110' }));
    expect(letter.download.filename).toBe(`request-to-payer-${mapPlan.payer_id}.txt`);
    expect(letter.download.contentType).toBe('text/plain; charset=utf-8');
    expect(letter.download.body).toContain('To: SYNTHETIC PAYER M, provider contracting (payer identifier 2U:SYNPAYERM)');
    expect(letter.download.body).toContain('Date: 2026-10-15');
    expect(letter.download.body).toContain('    97110\n    97530');
    expect(letter.download.body).toContain('(NPI 9900000011)');
    for (const known of ['SYNTHLASTVBDXXF', 'SYNPCNMAP01001', 'SYNCCNMAP010001', 'SYNMBR55008544']) {
      expect(letter.download.body).not.toContain(known);
    }
    expect(refusedWith(await call(payerLetter, viewer, { ...P(), payer: mapPlan.payer_id, codes: '9711' }))).toMatch(/five letters or digits/);
    expect((await call(payerLetter, viewer, { ...P(), payer: randomUUID() })).status).toBe('not_found');
  });
});

describe('contracts: upload, tag, abstract by hand, approve, sign off, map (J5, CON-01 to CON-04)', () => {
  let commPlan: { id: string; payer_id: string };
  let contractDoc: string;
  let versionId: string;
  let contractId: string;
  let rateRecordId: string;

  it('takes a contract in through the intake flow and lists it to tag to its payer', async () => {
    await send('CON-07/remit.835', 'x12_835', 'application/octet-stream');
    commPlan = await planOf('CE:SYNPLAN-COMM-C');
    contractDoc = await send('CON-01/version-1.pdf', 'contract', 'application/pdf');
    expect((await owner.query<{ status: string }>('SELECT status FROM source_document WHERE id = $1', [contractDoc])).rows[0]?.status).toBe('stored');
    const page = ok(await call(contractsPage, viewer, P()));
    expect(page.untagged.items.map((document) => document.id)).toEqual([contractDoc]);
    expect(page.list.total).toBe(0);
    expect(page.upload.canUpload).toBe(false);
    expect(page.upload.kinds.map((kind) => kind.kind)).toEqual(['contract', 'exhibit', 'payer_letter']);
  });

  it('lets the billing manager tag the document to a new contract with its payer, as a draft version (J5)', async () => {
    const input = { documentId: contractDoc, payerId: commPlan.payer_id, title: 'SYNTHETIC PAYER C AGREEMENT', effectiveFrom: '2026-01-01', lastDay: '2026-12-31' };
    expect((await call(tagContractDocument, viewer, P(), input)).status).toBe('forbidden');
    expect(refusedWith(await call(tagContractDocument, manager, P(), { ...input, title: '' }))).toMatch(/title/);
    const redirect = redirectOf(await call(tagContractDocument, manager, P(), input));
    versionId = versionFrom(redirect);
    expect(redirect).toBe(`/p/${practiceId}/contracts/versions/${versionId}`);
    const page = ok(await call(contractsPage, viewer, P()));
    expect(page.untagged.total).toBe(0);
    const [contract] = page.list.items;
    contractId = contract?.id ?? '';
    expect(contract).toMatchObject({ title: 'SYNTHETIC PAYER C AGREEMENT', payerName: 'SYNTHETIC PAYER C', latestStatus: 'draft', shown: { versionNo: 1, effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', inForce: false } });
  });

  it('keeps every specialist out but one under a support grant, which the console now opens for contract specialists', async () => {
    expect((await call(abstractionPage, specialist, P())).status).toBe('not_found');
    const support = ok(await call(supportPage, platformAdmin, {}));
    expect(support.engineers).toContainEqual({ id: specialist, email: `${specialist}@synthetic.test`, role: 'contract_specialist' });
    ok(await call(createSupportGrant, platformAdmin, {}, { practiceId, userId: specialist, ticket: 'SYN-CON-1', reason: 'SYNTHETIC ABSTRACTION OF A NEW CONTRACT' }));
    const queue = ok(await call(specialistQueuePage, specialist, {}));
    expect(queue.practices.find((practice) => practice.practiceId === practiceId)).toMatchObject({ documentsAwaiting: 1, drafts: 1, proposalsAwaiting: 0, awaitingSignOff: 0, openQuestions: 0 });
    expect(queue.practices.find((practice) => practice.practiceId === practiceId)?.grantEndsAt).not.toBeNull();
    // Counts only: no document, contract or question is named in the console.
    expect(JSON.stringify(queue)).not.toContain(contractDoc);
    expect((await call(specialistQueuePage, platformAdmin, {})).status).toBe('forbidden');
    expect(ok(await call(specialistQueuePage, outsideSpecialist, {})).practices.find((practice) => practice.practiceId === practiceId)?.grantEndsAt).toBeNull();
    expect((await call(abstractionPage, outsideSpecialist, P())).status).toBe('not_found');
    // Under the grant, the specialist holds the contract specialist's role and nothing of the customer's.
    expect(ok(await call(abstractionPage, specialist, P())).documents.items.map((document) => [document.id, document.openVersions.map((version) => version.versionId)])).toEqual([[contractDoc, [versionId]]]);
    expect((await call(contractsPage, specialist, P())).status).toBe('forbidden');
    expect((await call(mappingPage, specialist, P())).status).toBe('forbidden');
  });

  it('enters a rate record by hand only with a quote that is on the cited page (CON-04, CON-05)', async () => {
    const terms = { versionId, method: 'PERCENT_OF_MEDICARE', codes: '97110, 97140, 97530', percentage: '110', yearBasis: 'CURRENT', localityBasis: 'PRACTICE', conversionFactor: 'non_qualifying_apm', documentId: contractDoc };
    expect(refusedWith(await call(addRateRecordAction, specialist, P(), { ...terms, page: '2', quote: '120% of the Medicare Physician Fee Schedule' }))).toMatch(/The quote is not on the cited page/);
    expect(refusedWith(await call(addRateRecordAction, specialist, P(), { ...terms, page: '9', quote: '110% of the Medicare' }))).toMatch(/no such page/);
    expect(refusedWith(await call(addRateRecordAction, specialist, P(), { ...terms, method: 'FIXED_SCHEDULE', amount: '12.345', page: '2', quote: '110%' }))).toMatch(/dollars and cents/);
    expect((await call(addRateRecordAction, manager, P(), { ...terms, page: '2', quote: '110%' })).status).toBe('forbidden');
    const quote = '110% of the Medicare Physician Fee Schedule in effect on the date of service';
    const redirect = redirectOf(await call(addRateRecordAction, specialist, P(), { ...terms, page: '2', quote }));
    rateRecordId = /record=([0-9a-f-]{36})/.exec(redirect)?.[1] ?? '';
    const review = ok(await call(abstractionVersionPage, specialist, { ...P(), versionId, record: rateRecordId })).review;
    expect(review.unresolved).toBe(1);
    const [record] = review.records;
    expect(record).toMatchObject({ id: rateRecordId, codes: ['97110', '97140', '97530'], citation: { documentId: contractDoc, page: 2, quote }, evidence: { resolved: true, problem: null }, verifiedBy: null });
    expect(record?.fields.map((field) => [field.field, field.approvedBy])).toEqual(RATE_RECORD_FIELDS.map((field) => [field, null]));
    expect(record?.fields.find((field) => field.field === 'parameters')?.text).toBe('110% of Medicare: the fee schedule in effect on the date of service, the practice’s locality, the non-qualifying conversion factor');
    expect(record?.fields.find((field) => field.field === 'flags')?.text).toMatch(/^MPPR off, assistant reduction off, sequestration off, NCCI off; timed units unknown/);
    // The cited page, side by side, with the quote marked on it.
    expect(review.cited).toMatchObject({ documentId: contractDoc, page: 2, pageCount: 2, recordId: rateRecordId, quoteFound: true, problem: null });
    expect(review.cited?.segments.filter((segment) => segment.quoted).map((segment) => segment.text)).toEqual([quote]);
  });

  it('blocks the version until every field is approved, then approves it for the practice to sign off', async () => {
    expect(refusedWith(await call(approveVersionAction, specialist, P(), { versionId }))).toMatch(/each of its rate records is verified/);
    // The workflow's own "not found" is the wrapper's not found.
    expect((await call(updateVersionAction, specialist, P(), { versionId: randomUUID(), effectiveFrom: '2026-01-01' })).status).toBe('not_found');
    for (const field of RATE_RECORD_FIELDS) {
      ok(await call(approveFieldAction, specialist, P(), { rateRecordId, versionId, field }));
    }
    const review = ok(await call(versionPage, manager, { ...P(), versionId })).review;
    expect(review.unresolved).toBe(0);
    expect(review.records[0]?.verifiedBy).toBe('the contract specialist');
    // The specialist reads the window from the contract: it continues until amended.
    ok(await call(updateVersionAction, specialist, P(), { versionId, effectiveFrom: '2026-01-01', lastDay: '', timelyFilingDays: '180', disputeWindowDays: '120', noticeDays: '90' }));
    // The dispute window as the contract states it (D17 a): cited from its page in the contract's own words, then
    // verified by the specialist; a quote that is not on the page is refused, and approval waits for the verification.
    const window = { versionId, documentId: contractDoc, page: '1', quote: 'Provider may dispute a payment within 120 days of the remittance date.' };
    expect(refusedWith(await call(citeWindowAction, specialist, P(), { ...window, quote: 'Provider may dispute a payment within 365 days of the remittance date.' }))).toMatch(/The quote is not on the cited page/);
    expect((await call(citeWindowAction, manager, P(), window)).status).toBe('forbidden');
    ok(await call(citeWindowAction, specialist, P(), window));
    expect(ok(await call(versionPage, viewer, { ...P(), versionId })).review.version.disputeWindow).toEqual({ documentId: contractDoc, page: 1, quote: window.quote, verifiedBy: null, verifiedAt: null });
    expect(refusedWith(await call(approveVersionAction, specialist, P(), { versionId }))).toMatch(/cited but not verified against its page/);
    expect((await call(verifyWindowAction, manager, P(), { versionId })).status).toBe('forbidden');
    ok(await call(verifyWindowAction, specialist, P(), { versionId }));
    expect(ok(await call(versionPage, viewer, { ...P(), versionId })).review.version.disputeWindow).toMatchObject({ page: 1, verifiedBy: 'the contract specialist', verifiedAt: expect.any(String) as string });
    ok(await call(approveVersionAction, specialist, P(), { versionId }));
    // CON-03: an approved version never changes.
    expect(refusedWith(await call(updateVersionAction, specialist, P(), { versionId, effectiveFrom: '2026-02-01' }))).toMatch(/never changes/);
    expect(refusedWith(await call(removeRateRecordAction, specialist, P(), { rateRecordId, versionId }))).toMatch(/never changes/);
    expect(ok(await call(versionPage, viewer, { ...P(), versionId })).review.version).toMatchObject({ status: 'approved', effectiveTo: null, timelyFilingDays: 180, disputeWindowDays: 120, noticeDays: 90 });
    // Every record the specialist read is in the practice's access log, under the support grant.
    const reads = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE actor_id = $1 AND action = 'read' AND grant_id IS NOT NULL AND practice_id = $2", [specialist, practiceId]);
    expect(reads.rows[0]?.n).toBeGreaterThan(0);
  });

  it('is signed off by the billing manager, never by a viewer or the specialist, and then is the version pricing uses (J5)', async () => {
    expect((await call(signOffAction, viewer, P(), { versionId })).status).toBe('forbidden');
    expect((await call(signOffAction, specialist, P(), { versionId })).status).toBe('forbidden');
    expect(redirectOf(await call(signOffAction, manager, P(), { versionId }))).toBe(`/p/${practiceId}/contracts/versions/${versionId}?notice=signed_off`);
    // Signed off already: nothing changes.
    expect(redirectOf(await call(signOffAction, manager, P(), { versionId }))).toBe(`/p/${practiceId}/contracts/versions/${versionId}`);
    const version = ok(await call(versionPage, viewer, { ...P(), versionId })).review.version;
    expect(version).toMatchObject({ status: 'signed_off', effectiveFrom: '2026-01-01', effectiveTo: null, signedOffBy: expect.any(String) as string });
    const contracts = ok(await call(contractsPage, viewer, P()));
    expect(contracts.list.items[0]).toMatchObject({ latestStatus: 'signed_off', shown: { versionId, inForce: true }, methods: ['PERCENT_OF_MEDICARE'] });
    // The plan maps to the signed-off version, and its lines resolve to the contract's rate record.
    const plan = ok(await call(planPage, manager, { ...P(), planId: commPlan.id }));
    expect(plan.detail.targets.map((target) => target.versionId)).toEqual([versionId]);
    expect(plan.detail.resolution.map((bucket) => bucket.outcome)).toEqual(['NO_MAPPING']);
    ok(await call(mapPlanAction, manager, P(), { planId: commPlan.id, kind: 'contract', contractVersionId: versionId, effectiveFrom: '2026-01-01' }));
    const mapped = ok(await call(planPage, manager, { ...P(), planId: commPlan.id }));
    expect(mapped.detail.resolution).toEqual([{ outcome: 'CONTRACT_RATE', version: expect.objectContaining({ versionId, versionNo: 1, status: 'signed_off' }) as unknown, lines: 3, chargeCents: '33900' }]);
    expect(ok(await call(contractPage, viewer, { ...P(), contractId })).detail.plans.map((entry) => entry.planId)).toEqual([commPlan.id]);
  });

  it('refuses a version whose window overlaps the signed-off one, with the rule shown (CON-01)', async () => {
    const second = await send('CON-01/version-2.pdf', 'contract', 'application/pdf');
    const outcome = await call(tagContractDocument, manager, P(), { documentId: second, payerId: commPlan.payer_id, contractId, effectiveFrom: '2026-07-01', lastDay: '2027-06-30' });
    expect(refusedWith(outcome)).toBe('versions of one contract never overlap: amend the version in force, or supersede it');
    expect((await owner.query('SELECT count(*)::int AS n FROM contract_version WHERE contract_id = $1', [contractId])).rows[0]).toEqual({ n: 1 });
    // A contract of another payer is refused for this one.
    expect(refusedWith(await call(tagContractDocument, manager, P(), { documentId: second, payerId: (await planOf('CE:SYNPLAN-UNMAPPED-01')).payer_id, contractId, effectiveFrom: '2027-01-01' }))).toMatch(/payer chosen/);
  });

  it('amends the signed-off version with a new draft, which the next document joins, and corrects one with a supersession (CON-02, CON-03)', async () => {
    const amendment = versionFrom(redirectOf(await call(amendVersionAction, specialist, P(), { versionId, effectiveFrom: '2026-07-01' })));
    const draft = ok(await call(abstractionVersionPage, specialist, { ...P(), versionId: amendment })).review;
    expect(draft.version).toMatchObject({ status: 'draft', versionNo: 2, supersedesId: versionId, effectiveFrom: '2026-07-01' });
    expect(draft.records).toHaveLength(1);
    const [second] = ok(await call(contractPage, manager, { ...P(), contractId })).untagged;
    expect(redirectOf(await call(tagContractDocument, manager, P(), { documentId: second?.id, payerId: commPlan.payer_id, contractId }))).toBe(`/p/${practiceId}/contracts/versions/${amendment}`);
    expect(ok(await call(abstractionVersionPage, specialist, { ...P(), versionId: amendment })).review.version.sourceDocumentIds).toEqual([contractDoc, second?.id]);
    ok(await call(removeRateRecordAction, specialist, P(), { rateRecordId: draft.records[0]?.id, versionId: amendment }));
    expect(ok(await call(abstractionVersionPage, specialist, { ...P(), versionId: amendment })).review.records).toEqual([]);
    const correction = versionFrom(redirectOf(await call(supersedeVersionAction, specialist, P(), { versionId })));
    expect(ok(await call(versionPage, viewer, { ...P(), versionId: correction })).review.version).toMatchObject({ versionNo: 3, status: 'draft', effectiveFrom: '2026-01-01', effectiveTo: null });
    // The signed-off version is unchanged by either draft.
    expect(ok(await call(versionPage, viewer, { ...P(), versionId })).review.version).toMatchObject({ status: 'signed_off', effectiveTo: null });
  });

  it('asks the practice a question that shows as what to obtain on Coverage, answered once by the billing manager', async () => {
    const asked = ok(await call(askQuestionAction, specialist, P(), { contractId, versionId, topic: 'missing_schedule', question: 'SYNTHETIC QUESTION: please send exhibit A for 97112' }));
    const questionId = asked.objectId ?? '';
    const stored = (await owner.query<{ question: string; asked_by: string }>('SELECT question, asked_by FROM contract_question WHERE id = $1', [questionId])).rows[0];
    expect(stored?.question).toMatch(/^enc:v1:/);
    expect(stored?.asked_by).toBe(specialist);
    const coverage = ok(await call(coveragePage, viewer, P()));
    expect(coverage.obtain.map((question) => [question.id, question.topic, question.question])).toEqual([[questionId, 'missing_schedule', 'SYNTHETIC QUESTION: please send exhibit A for 97112']]);
    expect(ok(await call(contractsPage, viewer, P())).questions.map((question) => question.id)).toEqual([questionId]);
    expect((await call(answerQuestionAction, viewer, P(), { questionId, answer: 'SYNTHETIC ANSWER' })).status).toBe('forbidden');
    ok(await call(answerQuestionAction, manager, P(), { questionId, answer: 'SYNTHETIC ANSWER: requested from the payer' }));
    ok(await call(answerQuestionAction, manager, P(), { questionId, answer: 'SYNTHETIC ANSWER: requested from the payer' }));
    expect(refusedWith(await call(answerQuestionAction, manager, P(), { questionId, answer: 'SYNTHETIC ANSWER: something else' }))).toMatch(/already answered/);
    expect(refusedWith(await call(withdrawQuestionAction, specialist, P(), { questionId }))).toMatch(/already answered or withdrawn/);
    const [answered] = ok(await call(contractPage, viewer, { ...P(), contractId })).questions;
    expect(answered).toMatchObject({ id: questionId, status: 'answered', answer: 'SYNTHETIC ANSWER: requested from the payer' });
    expect(ok(await call(coveragePage, viewer, P())).obtain).toEqual([]);
    const second = ok(await call(askQuestionAction, specialist, P(), { contractId, topic: 'windows', question: 'SYNTHETIC QUESTION: the appeal window' })).objectId ?? '';
    ok(await call(withdrawQuestionAction, specialist, P(), { questionId: second }));
    expect(ok(await call(abstractionPage, specialist, P())).questions).toEqual([]);
  });

  it('records the contract calendar at sign-off and shows it', async () => {
    const events = (await owner.query<{ kind: string; on_date: string }>('SELECT kind, on_date::text AS on_date FROM contract_calendar_event WHERE contract_id = $1 ORDER BY on_date, kind', [contractId])).rows;
    expect(events).toContainEqual({ kind: 'anniversary', on_date: '2027-01-01' });
    expect(events).toContainEqual({ kind: 'fee_schedule_year', on_date: '2027-01-01' });
    const shown = ok(await call(contractPage, viewer, { ...P(), contractId })).calendar.map((event) => ({ kind: event.kind, on_date: event.onDate }));
    expect(shown).toEqual(events.filter((event) => event.on_date >= '2026-10-15'));
    expect(ok(await call(contractsPage, viewer, P())).calendar.map((event) => event.contractId)).toContain(contractId);
  });

  it('lets the specialist tag an untagged document too, starting its contract', async () => {
    const exhibit = await send('CON-06/exhibit-a.pdf', 'contract', 'application/pdf');
    const redirect = redirectOf(await call(startAbstraction, specialist, P(), { documentId: exhibit, payerId: commPlan.payer_id, title: 'SYNTHETIC PAYER C EXHIBIT AGREEMENT', effectiveFrom: '2027-01-01' }));
    expect(redirect).toMatch(new RegExp(`^/p/${practiceId}/abstraction/versions/[0-9a-f-]{36}$`));
  });
});

describe('the database’s rules for questions and the specialist queue', () => {
  /** One statement as the application role for `actorId`, with `practiceIds` in scope, rolled back. */
  async function asApp<T>(actorId: string, practiceIds: readonly string[], run: (client: DatabasePoolClient) => Promise<T>): Promise<T> {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${practiceIds.join(',')}}`]);
      return await run(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }
  const errorOf = (attempt: Promise<unknown>) =>
    attempt.then(
      () => undefined,
      (error: unknown) => error,
    );
  const contractOf = async () => (await owner.query<{ id: string }>('SELECT id FROM contract WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.id ?? '';
  const encrypted = () => cipher.encrypt('contract_question.question', 'SYNTHETIC QUESTION');

  it('asks a question open, in the asker’s own name, about a contract of the practice', async () => {
    const contractId = await contractOf();
    const insert = 'INSERT INTO contract_question (practice_id, contract_id, topic, question, asked_by) VALUES ($1, $2, $3, $4, $5)';
    // The application cannot write a question's state at all; even the owner cannot ask one closed.
    await asApp(specialist, [practiceId], async (client) => {
      await expect(
        client.query('INSERT INTO contract_question (practice_id, contract_id, topic, question, asked_by, status) VALUES ($1, $2, $3, $4, $5, $6)', [practiceId, contractId, 'scope', encrypted(), specialist, 'answered']),
      ).rejects.toMatchObject({ code: '42501' });
    });
    await expect(
      asOwner(
        owner,
        [practiceId],
        () => owner.query("INSERT INTO contract_question (practice_id, contract_id, topic, question, asked_by, status, answer, closed_by, closed_at) VALUES ($1, $2, 'scope', $3, $4, 'answered', $3, $4, now())", [practiceId, contractId, encrypted(), specialist]),
        specialist,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await asApp(specialist, [practiceId], async (client) => {
      await expect(client.query(insert, [practiceId, contractId, 'scope', encrypted(), manager])).rejects.toMatchObject({ code: '42501' });
    });
    await asApp(specialist, [practiceId], async (client) => {
      await expect(client.query(insert, [practiceId, randomUUID(), 'scope', encrypted(), specialist])).rejects.toMatchObject({ code: '23514' });
    });
    await asApp(specialist, [practiceId], async (client) => {
      await expect(client.query(insert, [practiceId, contractId, 'scope', 'in the clear', specialist])).rejects.toMatchObject({ code: '23514' });
    });
    await asApp(specialist, [practiceId], async (client) => {
      expect((await client.query(insert, [practiceId, contractId, 'scope', encrypted(), specialist])).rowCount).toBe(1);
    });
  });

  it('closes a question once, in the closer’s name and at the time, and never changes it otherwise', async () => {
    const contractId = await contractOf();
    const [question] = (
      await asOwner(owner, [practiceId], () =>
        owner.query<{ id: string }>("INSERT INTO contract_question (practice_id, contract_id, topic, question, asked_by) VALUES ($1, $2, 'other', $3, $4) RETURNING id", [practiceId, contractId, encrypted(), specialist]),
      )
    ).rows;
    const id = question?.id ?? '';
    const answer = cipher.encrypt('contract_question.answer', 'SYNTHETIC ANSWER');
    await asApp(manager, [practiceId], async (client) => {
      expect(await errorOf(client.query("UPDATE contract_question SET status = 'answered', answer = $2, closed_by = $3, closed_at = now() WHERE id = $1", [id, answer, specialist]))).toMatchObject({ code: '23514' });
    });
    await asApp(manager, [practiceId], async (client) => {
      expect(await errorOf(client.query("UPDATE contract_question SET status = 'answered', closed_by = app_actor_id(), closed_at = now() WHERE id = $1", [id]))).toMatchObject({ code: '23514' });
    });
    await asApp(manager, [practiceId], async (client) => {
      expect(await errorOf(client.query('UPDATE contract_question SET question = $2 WHERE id = $1', [id, encrypted()]))).toMatchObject({ code: '42501' });
    });
    await asOwner(owner, [practiceId], () => owner.query("UPDATE contract_question SET status = 'withdrawn', closed_by = app_actor_id(), closed_at = now() WHERE id = $1", [id]), specialist);
    await asApp(manager, [practiceId], async (client) => {
      expect(await errorOf(client.query("UPDATE contract_question SET status = 'answered', answer = $2, closed_by = app_actor_id(), closed_at = now() WHERE id = $1", [id, answer]))).toMatchObject({ code: '23514' });
    });
  });

  it('counts the queue for a specialist or a platform administrator only, and leaves the caller’s scope as it was', async () => {
    await asApp(specialist, [], async (client) => {
      const { rows } = await client.query<{ practice_id: string; documents_awaiting: string }>('SELECT practice_id, documents_awaiting FROM console_contract_queue()');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map((row) => row.practice_id)).toContain(practiceId);
      expect((await client.query<{ scope: string }>("SELECT current_setting('app.practice_ids') AS scope")).rows[0]?.scope).toBe('{}');
      expect((await client.query('SELECT 1 FROM contract_version')).rowCount).toBe(0);
    });
    await asApp(platformAdmin, [], async (client) => {
      expect((await client.query('SELECT 1 FROM console_contract_queue()')).rowCount).toBeGreaterThan(0);
    });
    await asApp(manager, [practiceId], async (client) => {
      expect((await client.query('SELECT 1 FROM console_contract_queue()')).rowCount).toBe(0);
      expect((await client.query<{ scope: string }>("SELECT current_setting('app.practice_ids') AS scope")).rows[0]?.scope).toBe(`{${practiceId}}`);
    });
  });
});
