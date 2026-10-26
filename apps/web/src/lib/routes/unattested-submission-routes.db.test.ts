import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RATE_RECORD_FIELDS, amendVersion, approveRateRecordField, approveVersion, signOffVersion, verifyDisputeWindow } from '@tp/contracts';
import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { WORDS_VERSION } from '@tp/packets';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { SUBMISSION_LOGGED_UNATTESTED, approvePacketVersion, downloadPacketExport, writePacketVersion } from '@tp/worker/packets';
import { acceptRun, createRerun } from '@tp/worker/pricing';
import { packetExportHandler } from '@tp/worker/runtime';
import { type Practice, RELEASE } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { eventText } from '../cases/timeline';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route } from '../http/route';
import { PRICING_BLOCKED_TEXT } from '../packets/pricing';
import { PACKET_CHECKLIST } from '../packets/review';
import { STALE_EXPORT_SUBMISSION } from '../packets/unattested';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { attestPacketExportAction, packetReviewPage, packetReviewsPage } from './packets';
import { reconciliationPage } from './reconciliation';
import { logSubmissionAction, submissionsPage } from './submissions';
import { casePage, reopenLineAction, writeOffLineAction } from './triage';

/**
 * A submission sent without sign-off, through the screens' routes against PostgreSQL (the founder's ruling of
 * 2026-10-20; docs/adr/0061; migration 20261103090000). Each case is a practice of its own whose SYNTHETIC CAS-08
 * lines (three 97110 x 2, each 30.00 short under a fixed schedule whose window is cited and verified) triage into one
 * case, its packet written by the billing manager, approved by a second, exported by the export job's code and
 * downloaded by a reimbursement reviewer under a support grant; then, for the stale cases, a re-run of the period is
 * accepted, so the version's pricing went stale after its export:
 *
 * - an export never attested because its pricing went stale after it was made is logged only with the person's
 *   confirmation, then recorded unattested with its reason and flagged with the cause, the database's audit event
 *   written once in their name beside the route's own; the submissions, review, reviewer's list and Reconciliation
 *   pages show it as sent without sign-off, and the version is never attested;
 * - an unattested export still current is refused, the confirmation notwithstanding; another practice cannot reach
 *   the version; the reviewer, who writes nothing, cannot log one;
 * - an attested export whose pricing went stale since is logged as attested, flagged, with no record of a submission
 *   sent without sign-off.
 */

let w: TriageWorld;
let services: Services;
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-unattested-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
const REASON = 'pricing_stale_after_export';
const today = () => new Date().toISOString().slice(0, 10);

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
/** The internal users (the reviewers) sign in with a hardware key. */
const internalUsers = new Set<string>();
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(w.app, { userId, method: internalUsers.has(userId) ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke(
    {
      cookies: new Jar(await sessionOf(userId)),
      params,
      input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input,
      requestId: `test-${randomUUID()}`,
      userAgent: null,
    },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

/** The sentences a refused step shows, each with its field. */
function refused(outcome: Outcome<unknown>): readonly { readonly field: string; readonly message: string }[] {
  if (outcome.status !== 'invalid') {
    throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return outcome.issues.map((issue) => ({ field: issue.field, message: issue.message }));
}

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  const sealer = new Sealer(randomBytes(32));
  services = createServices({
    origin: 'http://localhost:3100',
    pool: w.app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys: w.keys,
    sealer,
    logger: createLogger({ sink: () => undefined }),
    queue: new MemoryQueue(),
    documents,
  });
}, 120_000);

afterAll(async () => {
  await w.close();
  rmSync(documentsDir, { recursive: true, force: true });
});

interface Exported {
  readonly practice: Practice;
  readonly runId: string;
  readonly caseId: string;
  readonly versionId: string;
  readonly reviewer: string;
  readonly pdfSha256: string;
  readonly csvSha256: string;
}

const P = (target: Practice) => ({ practiceId: target.practiceId });
const as = <T>(target: Practice, actorId: string, run: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) => withPracticeScope(w.app, { actorId, practiceIds: [target.practiceId] }, run);
const owner = <T>(target: Practice, sql: string, values: readonly unknown[]) => asOwner(w.owner, [target.practiceId], async () => (await w.owner.query<T & Record<string, unknown>>(sql, [...values])).rows);

/** A reimbursement reviewer of the internal organization under a four-hour support grant on the practice (D16). */
async function reviewerOf(target: Practice): Promise<string> {
  const internal = await createOrganization(w.owner, 'internal', `review ${randomUUID().slice(0, 8)}`);
  const id = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, id, 'reviewer');
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'RV-UNATTESTED', 'SYNTHETIC PACKET REVIEW', now() + interval '4 hours')`, [target.practiceId, id]),
  );
  internalUsers.add(id);
  return id;
}

/** A practice whose CAS-08 case's packet is exported and its two files downloaded by the reviewer (not attested). */
async function exportedCase(label: string): Promise<Exported> {
  const practice = await w.practice(label, { case_materiality_cents: '1000' });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, MARCH.from, MARCH.to, RELEASE);
  await w.pricing.execute(practice, runId);
  const triaged = await w.triage(practice, runId);
  if (triaged.outcome !== 'triaged' || triaged.summary.casesOpened !== 1) {
    throw new Error('CAS-08 did not open one case');
  }
  const caseId = (await owner<{ id: string }>(practice, 'SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]))[0]?.id ?? '';
  const version = await as(practice, practice.manager, (scope) =>
    writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: `test-${randomUUID()}` }),
  );
  const second = await createUser(w.owner);
  await addMembership(w.owner, practice.world.organizationId, second, 'billing_manager');
  await as(practice, second, (scope) => approvePacketVersion(scope, { practiceId: practice.practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: `test-${randomUUID()}` }));
  const jobId = randomUUID();
  await packetExportHandler({ documents, keys: w.keys, pdf: w.pdf })(
    { practice_id: practice.practiceId, packet_version_id: version.versionId, words_version: WORDS_VERSION },
    { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.pricing.worker, { jobId, practiceId: practice.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
  );
  const hashes = (await owner<{ export_sha256: string | null; export_csv_sha256: string | null }>(practice, 'SELECT export_sha256, export_csv_sha256 FROM packet_version WHERE id = $1', [version.versionId]))[0];
  if (hashes === undefined || hashes.export_sha256 === null || hashes.export_csv_sha256 === null) {
    throw new Error('the packet was not exported');
  }
  const reviewer = await reviewerOf(practice);
  for (const file of ['pdf', 'csv'] as const) {
    await as(practice, reviewer, (scope) => downloadPacketExport(scope, { documents, keys: w.keys }, { practiceId: practice.practiceId, versionId: version.versionId, file, requestId: `test-${randomUUID()}` }));
  }
  return { practice, runId, caseId, versionId: version.versionId, reviewer, pdfSha256: hashes.export_sha256, csvSha256: hashes.export_csv_sha256 };
}

/** The case's run priced again under the same release and accepted: the version's lines are no longer the pricing in effect. */
async function acceptedRerun(setup: Exported): Promise<void> {
  const { practice } = setup;
  const { pricingRunId } = await as(practice, practice.manager, (scope) => createRerun(scope, { practiceId: practice.practiceId, pricingRunId: setup.runId, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }));
  await w.pricing.execute(practice, pricingRunId);
  await as(practice, practice.manager, (scope) => acceptRun(scope, { practiceId: practice.practiceId, pricingRunId }));
}

const confirmations = () => Object.fromEntries(PACKET_CHECKLIST.map((item) => [`confirm_${item.id}`, 'on']));
const attestThroughRoute = (setup: Exported) =>
  call(attestPacketExportAction, setup.reviewer, P(setup.practice), { caseId: setup.caseId, versionId: setup.versionId, pdfSha256: setup.pdfSha256, csvSha256: setup.csvSha256, ...confirmations() });
const logThroughRoute = (setup: Exported, actorId: string, extra: Record<string, unknown> = {}, target: Practice = setup.practice) =>
  call(logSubmissionAction, actorId, P(target), { caseId: setup.caseId, versionId: setup.versionId, submittedOn: today(), channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-UNATTESTED', followUpOn: '', ...extra });

/** The version's submissions as stored, read as the owner. */
const stored = (setup: Exported) =>
  owner<{ id: string; unattested_reason: string | null; pricing_check: string | null; submitted_by: string }>(
    setup.practice,
    'SELECT id, unattested_reason, pricing_check, submitted_by FROM submission WHERE packet_version_id = $1 ORDER BY created_at, id',
    [setup.versionId],
  );

/** The audit events of a submission, read as the owner: the route's own and the database's record of one sent without sign-off. */
const events = (setup: Exported, submissionId: string) =>
  owner<{ action: string; actor_id: string | null; purpose: string | null }>(
    setup.practice,
    "SELECT action, actor_id, purpose FROM audit_event WHERE object_type = 'submission' AND object_id = $1 AND action IN ('submission_logged', 'submission_logged_unattested') ORDER BY action, at, id",
    [submissionId],
  );

describe('an export whose pricing went stale after it was made and before its attestation', () => {
  let setup: Exported;
  let other: Exported;
  let viewer: string;
  beforeAll(async () => {
    setup = await exportedCase('unattested routes: stale');
    await acceptedRerun(setup);
    other = await exportedCase('unattested routes: another practice');
    viewer = await createUser(w.owner);
    await addMembership(w.owner, setup.practice.world.organizationId, viewer, 'viewer');
  }, 360_000);

  it('is offered for logging sent without sign-off, while the review refuses its attestation and says why', async () => {
    const page = ok(await call(submissionsPage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId }));
    expect(page.submittable).toMatchObject({ versionId: setup.versionId, attestedAt: null, unattestedReason: REASON, pricing: { status: 'PRICING_NOT_IN_EFFECT' } });
    expect(page.canLog).toBe(true);

    const review = ok(await call(packetReviewPage, setup.reviewer, { ...P(setup.practice), caseId: setup.caseId, versionId: setup.versionId }));
    expect(review).toMatchObject({ unattestedReason: REASON, sentWithoutSignOff: null, review: { attestation: null, pricingNow: { status: 'PRICING_NOT_IN_EFFECT' } } });
    expect(refused(await attestThroughRoute(setup)).map((issue) => issue.message)).toEqual([PRICING_BLOCKED_TEXT.attestation]);
    // Listed for the reviewer until it is logged, marked never attested: never shown as work waiting.
    expect(ok(await call(packetReviewsPage, setup.reviewer, P(setup.practice))).awaiting.map((entry) => [entry.versionId, entry.neverAttested])).toEqual([[setup.versionId, true]]);
  }, 120_000);

  it('is not logged without the person’s confirmation that it went without sign-off, and the reviewer cannot log it', async () => {
    expect(refused(await logThroughRoute(setup, setup.practice.manager))).toEqual([{ field: 'sentWithoutSignOff', message: STALE_EXPORT_SUBMISSION.confirmRequired }]);
    expect(await stored(setup)).toEqual([]);
    // The reviewer is read-only (D16): no submission.log, whatever they confirm.
    expect((await logThroughRoute(setup, setup.reviewer, { sentWithoutSignOff: 'on' })).status).toBe('forbidden');
    expect(await stored(setup)).toEqual([]);
  }, 120_000);

  it('is not reached from another practice', async () => {
    expect((await logThroughRoute(setup, other.practice.manager, { sentWithoutSignOff: 'on' }, other.practice)).status).toBe('not_found');
    expect(await stored(setup)).toEqual([]);
  }, 120_000);

  it('is logged with the confirmation: unattested with its reason, flagged with the cause, audited once in the person’s name, and shown plainly everywhere', async () => {
    const logged = ok(await logThroughRoute(setup, setup.practice.manager, { sentWithoutSignOff: 'on' }));
    expect(logged.redirect).toBe(`/p/${setup.practice.practiceId}/cases/${setup.caseId}/submissions?notice=logged_unattested`);
    const rows = await stored(setup);
    expect(rows).toEqual([{ id: logged.objectId, unattested_reason: REASON, pricing_check: 'PRICING_NOT_IN_EFFECT', submitted_by: setup.practice.manager }]);
    // The route's own event and the database's record, once each, in the person's name; the database's carries the reason.
    const recorded = await events(setup, logged.objectId ?? '');
    expect(recorded.map((event) => [event.action, event.actor_id])).toEqual([
      ['submission_logged', setup.practice.manager],
      [SUBMISSION_LOGGED_UNATTESTED, setup.practice.manager],
    ]);
    expect(recorded.find((event) => event.action === SUBMISSION_LOGGED_UNATTESTED)?.purpose).toBe(REASON);

    // The same submission again records nothing more.
    const again = ok(await logThroughRoute(setup, setup.practice.manager, { sentWithoutSignOff: 'on' }));
    expect(again.objectId).toBe(logged.objectId);
    expect(await stored(setup)).toHaveLength(1);
    expect((await events(setup, logged.objectId ?? '')).filter((event) => event.action === SUBMISSION_LOGGED_UNATTESTED)).toHaveLength(1);

    // The submissions page: logged sent without sign-off, flagged with the cause.
    const page = ok(await call(submissionsPage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId, notice: 'logged_unattested' }));
    expect(page.notice).toBe('logged_unattested');
    expect(page.submissions.map((submission) => [submission.submissionId, submission.sent, submission.pricingCheck])).toEqual([[logged.objectId, { kind: 'unattested', reason: REASON }, 'PRICING_NOT_IN_EFFECT']]);

    // The case page's timeline says so beside the submission, in the founder's words.
    const timeline = ok(await call(casePage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId })).timeline.filter((event) => event.kind === 'submitted');
    expect(timeline.map((event) => eventText(event))).toEqual(['Packet version 1 submitted through the payer portal, dispute level 1; sent without sign-off: pricing went stale after export']);

    // The review: logged so, and never attested.
    const review = ok(await call(packetReviewPage, setup.reviewer, { ...P(setup.practice), caseId: setup.caseId, versionId: setup.versionId }));
    expect(review.sentWithoutSignOff).toEqual({ submittedOn: today(), reason: REASON });
    expect(refused(await attestThroughRoute(setup)).map((issue) => issue.message)).toEqual([PRICING_BLOCKED_TEXT.attestation]);
    expect((await owner<{ attested_by: string | null }>(setup.practice, 'SELECT attested_by FROM packet_version WHERE id = $1', [setup.versionId]))[0]?.attested_by).toBeNull();
    // It leaves the reviewer's list of exports waiting: it is never attested.
    expect(ok(await call(packetReviewsPage, setup.reviewer, P(setup.practice))).awaiting).toEqual([]);

    // Reconciliation lists it, the practice's and the case's, to the viewer too (no PHI in it).
    const expected = {
      submissionId: logged.objectId,
      caseId: setup.caseId,
      versionNo: 1,
      disputeLevel: 1,
      submittedOn: today(),
      channel: 'payer_portal',
      reason: REASON,
      pricingCheck: 'PRICING_NOT_IN_EFFECT',
      latestResponse: null,
    };
    expect(ok(await call(reconciliationPage, setup.practice.manager, P(setup.practice))).unattested).toEqual({ total: 1, items: [expected] });
    expect(ok(await call(reconciliationPage, setup.practice.manager, { ...P(setup.practice), case: setup.caseId })).unattested).toEqual({ total: 1, items: [expected] });
    expect(ok(await call(reconciliationPage, viewer, P(setup.practice))).unattested).toEqual({ total: 1, items: [expected] });
    // Another practice's reconciliation shows none of it.
    expect(ok(await call(reconciliationPage, other.practice.manager, P(other.practice))).unattested).toEqual({ total: 0, items: [] });
  }, 180_000);
});

describe('an export still current and not attested', () => {
  it('is refused, the confirmation notwithstanding: only an export whose pricing went stale after it was made is logged without the attestation', async () => {
    const setup = await exportedCase('unattested routes: current');
    const page = ok(await call(submissionsPage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId }));
    expect(page.submittable).toMatchObject({ attestedAt: null, unattestedReason: null, pricing: { status: 'current' } });
    expect(refused(await logThroughRoute(setup, setup.practice.manager, { sentWithoutSignOff: 'on' })).map((issue) => issue.message)).toEqual([
      'a packet is submitted once a reimbursement reviewer has attested its export',
    ]);
    expect(await stored(setup)).toEqual([]);
  }, 240_000);
});

describe('an attested export whose pricing went stale since', () => {
  it('is logged as an attested export, flagged with the cause, with no record of one sent without sign-off', async () => {
    const setup = await exportedCase('unattested routes: attested');
    ok(await attestThroughRoute(setup));
    await acceptedRerun(setup);
    expect(ok(await call(submissionsPage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId })).submittable).toMatchObject({ unattestedReason: null, pricing: { status: 'PRICING_NOT_IN_EFFECT' } });
    const logged = ok(await logThroughRoute(setup, setup.practice.manager));
    expect(logged.redirect).toBe(`/p/${setup.practice.practiceId}/cases/${setup.caseId}/submissions?notice=logged_flagged`);
    expect(await stored(setup)).toEqual([{ id: logged.objectId, unattested_reason: null, pricing_check: 'PRICING_NOT_IN_EFFECT', submitted_by: setup.practice.manager }]);
    expect((await events(setup, logged.objectId ?? '')).map((event) => event.action)).toEqual(['submission_logged']);
    const page = ok(await call(submissionsPage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId }));
    expect(page.submissions.map((submission) => submission.sent)).toEqual([{ kind: 'attested' }]);
    expect(ok(await call(reconciliationPage, setup.practice.manager, P(setup.practice))).unattested).toEqual({ total: 0, items: [] });
  }, 300_000);
});

/** The case's lines in row order (by service date), as the case page writes them off. */
const caseLines = (setup: Exported) =>
  owner<{ id: string }>(setup.practice, 'SELECT cl.id FROM case_line cl JOIN service_line sl ON sl.id = cl.service_line_id WHERE cl.case_id = $1 ORDER BY sl.service_date, cl.id', [setup.caseId]);
const writeOff = async (setup: Exported, lineIds: readonly string[]) => {
  for (const caseLineId of lineIds) {
    ok(await call(writeOffLineAction, setup.practice.manager, P(setup.practice), { caseLineId, reason: 'other', text: 'SYNTHETIC: its pricing went stale', confirm: 'on' }));
  }
};
const caseState = async (setup: Exported) => (await owner<{ state: string }>(setup.practice, 'SELECT state FROM "case" WHERE id = $1', [setup.caseId]))[0]?.state;
const submissions = (setup: Exported) => call(submissionsPage, setup.practice.manager, { ...P(setup.practice), caseId: setup.caseId });
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

describe('the stale export’s steps followed in the order the pages give them (the founder’s ruling of 2026-10-20)', () => {
  it('every line stale: the export already sent is logged first, then every line written off closes the case, and nothing is left waiting', async () => {
    const setup = await exportedCase('unattested routes: steps in order');
    await acceptedRerun(setup);
    const before = ok(await submissions(setup));
    expect(before).toMatchObject({ closed: false, earlier: [], submittable: { unattestedReason: REASON, versionLines: 3 } });
    // 1. Log it first, as it happened.
    const logged = ok(await logThroughRoute(setup, setup.practice.manager, { sentWithoutSignOff: 'on' }));
    expect(await stored(setup)).toEqual([{ id: logged.objectId, unattested_reason: REASON, pricing_check: 'PRICING_NOT_IN_EFFECT', submitted_by: setup.practice.manager }]);
    // 2. Every line is stale, so no new version can be written; writing them all off closes the case.
    await writeOff(setup, (await caseLines(setup)).map((line) => line.id));
    expect(await caseState(setup)).toBe('closed_written_off');
    // The submission stays logged; the page offers no form on the closed case, and the reviewer has nothing listed.
    const after = ok(await submissions(setup));
    expect(after.closed).toBe(true);
    expect(after.submissions.map((entry) => [entry.submissionId, entry.sent])).toEqual([[logged.objectId, { kind: 'unattested', reason: REASON }]]);
    expect(ok(await call(packetReviewsPage, setup.reviewer, P(setup.practice))).awaiting).toEqual([]);
  }, 360_000);

  it('every line written off before the export already sent was logged: the page says the case takes no submission, and a line reopened logs it', async () => {
    const setup = await exportedCase('unattested routes: written off first');
    await acceptedRerun(setup);
    const lines = (await caseLines(setup)).map((line) => line.id);
    await writeOff(setup, lines);
    expect(await caseState(setup)).toBe('closed_written_off');
    const closed = ok(await submissions(setup));
    expect(closed.closed).toBe(true);
    // The database takes no submission on the closed case (the page shows how to log one instead of a form).
    expect(refused(await logThroughRoute(setup, setup.practice.manager, { sentWithoutSignOff: 'on' })).map((issue) => issue.message)).toEqual(['a case closed written off takes no submission']);
    expect(await stored(setup)).toEqual([]);
    // Nor does the reviewer's list keep the closed case's export: the attestation refuses it.
    expect(ok(await call(packetReviewsPage, setup.reviewer, P(setup.practice))).awaiting).toEqual([]);
    // The remedy the page gives: a line reopened with the reason, then the submission logged.
    ok(await call(reopenLineAction, setup.practice.manager, P(setup.practice), { caseLineId: lines[0] ?? '', reason: 'SYNTHETIC: the export already went to the payer' }));
    const reopened = ok(await submissions(setup));
    expect(reopened).toMatchObject({ closed: false, submittable: { versionId: setup.versionId, unattestedReason: REASON } });
    ok(await logThroughRoute(setup, setup.practice.manager, { sentWithoutSignOff: 'on' }));
    expect((await stored(setup)).map((row) => row.unattested_reason)).toEqual([REASON]);
  }, 360_000);

  it('some lines stale: after they are written off and a new version written, the export already sent is still offered and logged as sent before the edit', async () => {
    const setup = await exportedCase('unattested routes: partly stale');
    // An amendment from March 6 closes the version the lines were priced under after March 5: rows 2 and 3 are stale, row 1 current.
    const { practice } = setup;
    const versionId = (await owner<{ contract_version_id: string }>(practice, 'SELECT DISTINCT contract_version_id FROM priced_line WHERE pricing_run_id = $1', [setup.runId]))[0]?.contract_version_id ?? '';
    const successor = await w.as(practice, w.pricing.specialist, async (context) => {
      const amended = await amendVersion(context, { practiceId: practice.practiceId, versionId, effectiveFrom: '2026-03-06' });
      const { rows } = await context.scope.client.query<{ id: string }>('SELECT id FROM rate_record WHERE contract_version_id = $1', [amended.versionId]);
      for (const row of rows) {
        for (const field of RATE_RECORD_FIELDS) {
          await approveRateRecordField(context, { practiceId: practice.practiceId, rateRecordId: row.id, field });
        }
      }
      await verifyDisputeWindow(context, { practiceId: practice.practiceId, versionId: amended.versionId });
      await approveVersion(context, { practiceId: practice.practiceId, versionId: amended.versionId });
      return amended.versionId;
    });
    await w.as(practice, practice.manager, (context) => signOffVersion(context, { practiceId: practice.practiceId, versionId: successor }));
    const page = ok(await submissions(setup));
    expect(page.submittable).toMatchObject({ unattestedReason: REASON, versionLines: 3, pricing: { status: 'CONTRACT_VERSION_NOT_IN_FORCE' } });
    expect(page.submittable?.pricing.lines.map((line) => [line.row, line.check])).toEqual([
      [2, 'CONTRACT_VERSION_NOT_IN_FORCE'],
      [3, 'CONTRACT_VERSION_NOT_IN_FORCE'],
    ]);
    // The export was made two days ago (as the superuser, with the triggers off: the database never moves an export's time).
    await w.owner.query('BEGIN');
    try {
      await w.owner.query('SET LOCAL session_replication_role = replica');
      await w.owner.query("UPDATE packet_version SET exported_at = exported_at - interval '2 days' WHERE id = $1", [setup.versionId]);
      await w.owner.query('COMMIT');
    } catch (error) {
      await w.owner.query('ROLLBACK');
      throw error;
    }
    // The steps taken first: the stale lines written off, and a new version written on the line left.
    const lines = (await caseLines(setup)).map((line) => line.id);
    await writeOff(setup, lines.slice(1));
    const replacement = await as(practice, practice.manager, (scope) =>
      writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId: setup.caseId, basedOnVersionId: setup.versionId, promptPayState: null, requestId: `test-${randomUUID()}` }),
    );
    expect(replacement.versionId).not.toBe(setup.versionId);
    // The replaced export is still offered, logged only as sent before the edit.
    const offered = ok(await submissions(setup));
    expect(offered.submittable).toBeNull();
    expect(offered.earlier).toMatchObject([{ versionId: setup.versionId, versionNo: 1, unattestedReason: REASON, attested: false, lastDay: yesterday(), replacedOn: today() }]);
    // Dated the day of the edit, it is refused; dated before it, logged sent without sign-off.
    expect(refused(await logThroughRoute(setup, practice.manager, { sentWithoutSignOff: 'on' })).map((issue) => issue.message)).toEqual([
      "a submission sends the packet's current version; one an edit replaced is logged only when it was sent before the edit",
    ]);
    ok(await logThroughRoute(setup, practice.manager, { sentWithoutSignOff: 'on', submittedOn: yesterday() }));
    expect((await stored(setup)).map((row) => [row.unattested_reason, row.pricing_check])).toEqual([[REASON, 'CONTRACT_VERSION_NOT_IN_FORCE']]);
    expect(ok(await submissions(setup)).earlier).toEqual([]);
  }, 360_000);
});
