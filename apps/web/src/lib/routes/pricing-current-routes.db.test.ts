import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { WORDS_VERSION } from '@tp/packets';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { approvePacketVersion, attestPacketExport, downloadPacketExport, writePacketVersion } from '@tp/worker/packets';
import { acceptRun, createRerun } from '@tp/worker/pricing';
import { packetExportHandler } from '@tp/worker/runtime';
import { type Practice, RELEASE, RERUN_RELEASE } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route } from '../http/route';
import { PRICING_BLOCKED_TEXT } from '../packets/pricing';
import { PACKET_CHECKLIST } from '../packets/review';
import { REPORT_RELEASE_WITHDRAWN_TEXT, reportFailureText } from '../reports/queries';
import { type Services, createServices } from '../server/services';
import { RUN_RELEASE_WITHDRAWN } from '../triage/queries';
import { MemoryQueue } from '../uploads/queue';
import { attestPacketExportAction, packetReviewPage } from './packets';
import { practiceHome } from './practice';
import { attestReportAction, generateReportAction, releaseReportAction, reportPage, reviewChecklistPage } from './reports';
import { logSubmissionAction, submissionsPage } from './submissions';
import { casePage, casesPage } from './triage';

/**
 * Whether a packet's pricing is still current, through the screens' routes against PostgreSQL (the best-option
 * audit's item #4, the founder's ruling of 2026-10-18; docs/adr/0061). Each case is a practice of its own whose
 * SYNTHETIC CAS-08 lines (three 97110 x 2, each 30.00 short under a fixed schedule whose window is cited and
 * verified) triage into one case, its packet written by the billing manager, approved by a second, exported by the
 * export job's code and downloaded by a reimbursement reviewer under a support grant; then a re-run of the period is
 * accepted, or the run's rule release withdrawn:
 *
 * - the stale lines leave the actionable figures of the Cases screen, the case page and the dashboard at once, while
 *   the case's stored total stands (nothing refreshes a case until PR 11), and the case page names each line's cause;
 * - the review page shows the lines with their figures then and now, and the attest route refuses with the reason;
 * - a submission of an export already attested and sent is logged, never refused, and flagged, its page showing
 *   the cause beside the figures sent and the pricing now;
 * - no audit report is requested on a withdrawn release, a queued one fails with the reason in words, and a ready one
 *   is neither attested nor released.
 */

let w: TriageWorld;
let services: Services;
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-pricing-current-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
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

/** The sentences a refused step shows. */
function refused(outcome: Outcome<unknown>): string {
  if (outcome.status !== 'invalid') {
    throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return outcome.issues.map((issue) => issue.message).join('; ');
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

/** A reimbursement reviewer of the internal organization under a four-hour support grant on the practice (D16). */
async function reviewerOf(target: Practice): Promise<string> {
  const internal = await createOrganization(w.owner, 'internal', `review ${randomUUID().slice(0, 8)}`);
  const id = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, id, 'reviewer');
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'RV-PRICING', 'SYNTHETIC PACKET REVIEW', now() + interval '4 hours')`, [target.practiceId, id]),
  );
  internalUsers.add(id);
  return id;
}

/**
 * A practice whose CAS-08 case's packet is exported and its two files downloaded by the reviewer (not yet attested),
 * priced under `releaseNo`.
 */
async function exportedCase(label: string, releaseNo = RELEASE): Promise<Exported> {
  const practice = await w.practice(label, { case_materiality_cents: '1000' });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, MARCH.from, MARCH.to, releaseNo);
  await w.pricing.execute(practice, runId);
  const triaged = await w.triage(practice, runId);
  if (triaged.outcome !== 'triaged' || triaged.summary.casesOpened !== 1) {
    throw new Error('CAS-08 did not open one case');
  }
  const caseId = (await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]))).rows[0]?.id ?? '';
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
  const hashes = (
    await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ export_sha256: string | null; export_csv_sha256: string | null }>('SELECT export_sha256, export_csv_sha256 FROM packet_version WHERE id = $1', [version.versionId]),
    )
  ).rows[0];
  if (hashes === undefined || hashes.export_sha256 === null || hashes.export_csv_sha256 === null) {
    throw new Error('the packet was not exported');
  }
  const reviewer = await reviewerOf(practice);
  for (const file of ['pdf', 'csv'] as const) {
    await as(practice, reviewer, (scope) => downloadPacketExport(scope, { documents, keys: w.keys }, { practiceId: practice.practiceId, versionId: version.versionId, file, requestId: `test-${randomUUID()}` }));
  }
  return { practice, runId, caseId, versionId: version.versionId, reviewer, pdfSha256: hashes.export_sha256, csvSha256: hashes.export_csv_sha256 };
}

/** The case's run priced again under the same release and accepted: the case's lines are no longer the pricing in effect. */
async function acceptedRerun(setup: Exported): Promise<string> {
  const { practice } = setup;
  const { pricingRunId } = await as(practice, practice.manager, (scope) => createRerun(scope, { practiceId: practice.practiceId, pricingRunId: setup.runId, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }));
  await w.pricing.execute(practice, pricingRunId);
  await as(practice, practice.manager, (scope) => acceptRun(scope, { practiceId: practice.practiceId, pricingRunId, replacesId: setup.runId, heldByIds: [] }));
  return pricingRunId;
}

/** The actionable figures the Cases screen, the case page and the dashboard show, and the case's stored total. */
async function figures(setup: Exported) {
  const { practice } = setup;
  const listed = ok(await call(casesPage, practice.manager, P(practice)));
  const page = ok(await call(casePage, practice.manager, { ...P(practice), caseId: setup.caseId }));
  const home = ok(await call(practiceHome, practice.manager, P(practice)));
  return {
    cases: listed.cases.map((item) => [item.actionableNowCents, item.actionableCents]),
    casePage: page.case.actionableNowCents,
    lines: page.detail.lines.map((line) => line.pricingCheck),
    dashboard: home.dashboard.headline.actionable.cents,
  };
}

const confirmations = () => Object.fromEntries(PACKET_CHECKLIST.map((item) => [`confirm_${item.id}`, 'on']));
const attestThroughRoute = (setup: Exported) =>
  call(attestPacketExportAction, setup.reviewer, P(setup.practice), { caseId: setup.caseId, versionId: setup.versionId, pdfSha256: setup.pdfSha256, csvSha256: setup.csvSha256, ...confirmations() });

describe('a re-run accepted since the packet was exported (audit item #4)', () => {
  it('takes the stale lines out of every actionable figure at once, names their cause on the case page, and keeps the case’s stored total', async () => {
    const setup = await exportedCase('pricing routes: actionable');
    expect(await figures(setup)).toEqual({ cases: [['9000', '9000']], casePage: '9000', lines: ['current', 'current', 'current'], dashboard: '9000' });
    await acceptedRerun(setup);
    expect(await figures(setup)).toEqual({
      cases: [['0', '9000']],
      casePage: '0',
      lines: ['PRICING_NOT_IN_EFFECT', 'PRICING_NOT_IN_EFFECT', 'PRICING_NOT_IN_EFFECT'],
      dashboard: '0',
    });
  }, 180_000);

  it('shows the reviewer the lines with their figures then and now, and refuses the attestation with the reason', async () => {
    const setup = await exportedCase('pricing routes: attestation');
    const params = { ...P(setup.practice), caseId: setup.caseId, versionId: setup.versionId };
    expect(ok(await call(packetReviewPage, setup.reviewer, params)).review.pricingNow).toMatchObject({ status: 'current', lines: [] });
    await acceptedRerun(setup);

    const { pricingNow } = ok(await call(packetReviewPage, setup.reviewer, params)).review;
    expect(pricingNow.status).toBe('PRICING_NOT_IN_EFFECT');
    expect(pricingNow.lines.map((line) => line.row)).toEqual([1, 2, 3]);
    for (const line of pricingNow.lines) {
      // Priced again under the same release and contract: the same figures, on another priced line.
      expect(line).toMatchObject({ check: 'PRICING_NOT_IN_EFFECT', was: { releaseNo: RELEASE, expectedCents: '10000', varianceCents: '3000' }, now: { releaseNo: RELEASE, expectedCents: '10000', varianceCents: '3000', unpricedReason: null } });
      expect(line.now?.pricedLineId).not.toBe(line.was.pricedLineId);
    }
    expect(pricingNow.totals).toEqual({ was: { expectedCents: '30000', varianceCents: '9000' }, now: { expectedCents: '30000', varianceCents: '9000' } });

    // Refused in the route with the reason (and by the database behind it); nothing is attested.
    expect(refused(await attestThroughRoute(setup))).toBe(PRICING_BLOCKED_TEXT.attestation);
    const attested = await asOwner(w.owner, [setup.practice.practiceId], () => w.owner.query<{ attested_by: string | null }>('SELECT attested_by FROM packet_version WHERE id = $1', [setup.versionId]));
    expect(attested.rows[0]?.attested_by).toBeNull();
    // The database refuses it on its own too.
    await expect(
      as(setup.practice, setup.reviewer, (scope) => attestPacketExport(scope, { practiceId: setup.practice.practiceId, versionId: setup.versionId, pdfSha256: setup.pdfSha256, csvSha256: setup.csvSha256, requestId: `test-${randomUUID()}` })),
    ).rejects.toThrow('a packet version whose pricing is no longer current is not attested');
  }, 180_000);

  it('logs a submission that already went to the payer, never refused, and flags it with the cause and the figures sent and now', async () => {
    const setup = await exportedCase('pricing routes: submission');
    ok(await attestThroughRoute(setup));
    await acceptedRerun(setup);
    const params = { ...P(setup.practice), caseId: setup.caseId };

    // Before it is logged, the form says the export's pricing is no longer current.
    const before = ok(await call(submissionsPage, setup.practice.manager, params));
    expect(before.submittable?.pricing.status).toBe('PRICING_NOT_IN_EFFECT');

    const logged = ok(
      await call(logSubmissionAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId: setup.versionId, submittedOn: today(), channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-PRICING', followUpOn: '' }),
    );
    expect(logged.redirect).toBe(`/p/${setup.practice.practiceId}/cases/${setup.caseId}/submissions?notice=logged_flagged`);
    const after = ok(await call(submissionsPage, setup.practice.manager, { ...params, notice: 'logged_flagged' }));
    expect(after.notice).toBe('logged_flagged');
    expect(after.submissions).toHaveLength(1);
    expect(after.submissions[0]?.pricingCheck).toBe('PRICING_NOT_IN_EFFECT');
    expect(after.submissions[0]?.pricing).toMatchObject({ status: 'PRICING_NOT_IN_EFFECT', totals: { was: { expectedCents: '30000', varianceCents: '9000' }, now: { expectedCents: '30000', varianceCents: '9000' } } });
    expect(after.submissions[0]?.pricing?.lines).toHaveLength(3);
  }, 180_000);
});

// Last: the release in force is global, and a withdrawal is permanent.
describe('a rule release withdrawn since the lines were priced (audit item #4)', () => {
  it('drops the actionable figures, refuses a report with the remedy, says why a queued one failed, and refuses a ready one’s attestation and an attested one’s release', async () => {
    await w.pricing.loadRerunRelease();
    const setup = await exportedCase('pricing routes: withdrawn', RERUN_RELEASE);
    const { practice } = setup;
    // Reports of the run, before the withdrawal: one attested, one ready, one queued.
    const attested = await w.requestReport(practice, setup.runId);
    await w.generate(practice, attested);
    const files = async (id: string) => (await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ pdf_sha256: string; csv_sha256: string }>('SELECT pdf_sha256, csv_sha256 FROM audit_report WHERE id = $1', [id]))).rows[0];
    const signReport = async (id: string) =>
      call(attestReportAction, setup.reviewer, P(practice), {
        reportId: id,
        pdfSha256: (await files(id))?.pdf_sha256,
        csvSha256: (await files(id))?.csv_sha256,
        ...Object.fromEntries(['coverage', 'anomalies', 'validated', 'actionable', 'gaps', 'independent'].map((item) => [`confirm_${item}`, 'on'])),
      });
    ok(await signReport(attested));
    const ready = await w.requestReport(practice, setup.runId);
    await w.generate(practice, ready);
    const queued = await w.requestReport(practice, setup.runId);
    expect((await figures(setup)).dashboard).toBe('9000');

    await w.pricing.withdraw(RERUN_RELEASE, 'SYNTHETIC: release 2 content was wrong');

    // The lines stay in effect but are not current: out of every actionable figure, the stored total kept.
    expect(await figures(setup)).toEqual({ cases: [['0', '9000']], casePage: '0', lines: ['RELEASE_WITHDRAWN', 'RELEASE_WITHDRAWN', 'RELEASE_WITHDRAWN'], dashboard: '0' });
    // Not priced again yet: the review shows no figure now.
    const review = ok(await call(packetReviewPage, setup.reviewer, { ...P(practice), caseId: setup.caseId, versionId: setup.versionId })).review;
    expect(review.pricingNow).toMatchObject({ status: 'RELEASE_WITHDRAWN', totals: { now: null } });
    expect(review.pricingNow.lines.map((line) => [line.check, line.now])).toEqual([
      ['RELEASE_WITHDRAWN', null],
      ['RELEASE_WITHDRAWN', null],
      ['RELEASE_WITHDRAWN', null],
    ]);

    // The generate route refuses with the remedy, before the database would.
    expect(refused(await call(generateReportAction, practice.manager, P(practice), { runId: setup.runId }))).toBe(RUN_RELEASE_WITHDRAWN);

    // The queued report fails as release_withdrawn, and its page says why in words.
    expect(await w.generate(practice, queued)).toEqual({ outcome: 'release_withdrawn' });
    const failed = ok(await call(reportPage, practice.manager, { ...P(practice), reportId: queued })).report;
    expect(failed).toMatchObject({ status: 'failed', failureCode: 'release_withdrawn', releaseWithdrawn: true });
    expect(reportFailureText(failed.failureCode)).toMatch(/^Its pricing run’s rule release was withdrawn after the request/);

    // The ready report: kept, flagged, and neither attested nor released.
    expect(ok(await call(reportPage, practice.manager, { ...P(practice), reportId: ready })).report).toMatchObject({ status: 'ready', releaseWithdrawn: true, attestedAt: null });
    expect(ok(await call(reviewChecklistPage, setup.reviewer, { ...P(practice), reportId: ready })).report.releaseWithdrawn).toBe(true);
    expect(refused(await signReport(ready))).toBe(REPORT_RELEASE_WITHDRAWN_TEXT);
    expect(refused(await call(releaseReportAction, practice.manager, P(practice), { reportId: attested }))).toBe(REPORT_RELEASE_WITHDRAWN_TEXT);
    expect(ok(await call(reportPage, practice.manager, { ...P(practice), reportId: attested })).report).toMatchObject({ releaseWithdrawn: true, releasedAt: null });
  }, 240_000);
});
