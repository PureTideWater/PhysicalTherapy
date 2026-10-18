import { randomBytes, randomUUID } from 'node:crypto';

import { correctMapping } from '@tp/contracts';
import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { type JobContext, monitorHandler, notifyRun, prepareDigest } from '@tp/worker/runtime';
import { acceptRun, createRerun } from '@tp/worker/pricing';
import { type Practice, RELEASE } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { digestPage, markNotificationsReadAction, monthlySummaryCsvRoute, monthlySummaryPage, notificationPreferencesPage, notificationsPage, saveNotificationPreferencesAction } from './monitoring';
import { practiceHome } from './practice';
import { pricingRunsPage } from './pricing';
import { csrfTokenFor } from '../http/csrf';

/**
 * Monitoring's screens against PostgreSQL (PRD 5, J11 and J12; PRD 7, Practice dashboard, Reports and
 * Settings; test matrix JOB-02 and JOB-03; docs/adr/0039): a practice's SYNTHETIC CAS-03 and CAS-05
 * files loaded, priced for March 2026 under signed-off fixed schedules and triaged (sixteen lines in two
 * cases, one below materiality); the chain's notification of the run and February's digest recorded by
 * the worker's own code; then each screen through its route as the people of the practice.
 */

let w: TriageWorld;
let services: Services;
let practice: Practice;
let viewer: string;
let runId: string;
let digestId: string;
let otherDigestId: string;

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
    token = (await openSession(w.app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

function jobContext(target: Practice): JobContext {
  const jobId = randomUUID();
  return { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.app, { jobId, practiceId: target.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false };
}

const P = () => ({ practiceId: practice.practiceId });
const FIXED = { effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

async function recordDigest(target: Practice, period: string, asOf: string): Promise<string> {
  const jobId = randomUUID();
  const prepared = await withJobScope(w.app, { jobId, practiceId: target.practiceId }, (scope) => prepareDigest(scope, target.practiceId, period, asOf));
  await withJobScope(w.app, { jobId, practiceId: target.practiceId }, (scope) => scope.client.query('UPDATE digest SET sent_at = now() WHERE id = $1', [prepared.digestId]));
  return prepared.digestId;
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
  });
  practice = await w.practice('MONITORING ROUTES');
  viewer = await createUser(w.owner);
  await addMembership(w.owner, practice.world.organizationId, viewer, 'viewer');
  await w.load(practice, 'CAS-03/remit.835');
  await w.load(practice, 'CAS-05/remit.835');
  const one = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '5000' }] });
  const two = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
  runId = await w.pricedRun(practice, {
    plans: [
      { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
      { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
    ],
    from: '2026-03-01',
    to: '2026-03-31',
  });
  await w.triage(practice, runId);
  // The chain's notification of the run, and February's digest (counts and totals only), by the worker's own code.
  await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => notifyRun(scope, practice.practiceId, runId));
  digestId = await recordDigest(practice, '2026-02', '2026-03-01');
  const other = await w.practice('MONITORING OTHER');
  otherDigestId = await recordDigest(other, '2026-02', '2026-03-01');
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('the practice dashboard (JOB-02)', () => {
  it('shows the person’s notifications, and a monitoring job that failed three times until one with its key succeeds', async () => {
    const home = ok(await call(practiceHome, practice.manager, P()));
    expect(home.notifications.unread).toBe(2);
    expect(home.notifications.latest.map((item) => item.kind).sort()).toEqual(['digest', 'monitoring_run']);
    expect(home.notifications.latest.find((item) => item.kind === 'monitoring_run')).toMatchObject({ subjectId: runId, periodFrom: '2026-03-01', periodTo: '2026-03-31', counts: { lines: 17, cases: 2 } });
    expect(home.freshness.failedRun).toBeNull();
    // The dashboard's counts and totals: coverage of the run in effect, the cases by state, deadlines in 14 days (none: 2036),
    // follow-ups due (none: nothing is submitted), recovered zero (the ledger holds no entry).
    expect(home.dashboard).toMatchObject({
      coverage: { runId, periodFrom: '2026-03-01', periodTo: '2026-03-31', lines: 17, pricedLines: 17, chargeCents: '255500', pricedChargeCents: '255500' },
      casesByState: [{ state: 'open', cases: 2, actionableCents: '55200' }],
      deadlines: { cases: 0, actionableCents: '0', earliest: null },
      followUps: { due: 0, earliest: null, first: [] },
      recoveredQuarter: { cents: '0' },
    });
    // The headline: three numbers, each its own stage (actionable is the Cases screen's figure; payer
    // approved and recovered the ledger's, which holds no entry), and the stages below it: the one line
    // of the pattern below materiality is validated, its shortfall beside it, never added to actionable.
    expect(home.dashboard.headline).toEqual({
      actionable: { lines: 16, cents: '55200' },
      payerApprovedCents: '0',
      recoveredCents: '0',
      proofLevel: 'posted',
      flagged: { lines: 0 },
      validated: { lines: 1, cents: '300' },
    });
    expect(home.dashboard.queues).toEqual({ heldFiles: 0, plansWaiting: 0, openQuestions: 0, anomaliesToReview: 0, unassignedCases: 2, unmatched: 0 });

    const jobId = randomUUID();
    const key = `monitor:${practice.practiceId}:2026-11-01`;
    await w.owner.query(
      `INSERT INTO job_run (practice_id, job_id, job_type, singleton_key, idempotency_key, attempts, outcome, error_code, started_at, finished_at)
       VALUES ($1, $2, 'monitor', $3, '2026-11-01', 3, 'failed', 'JOB_FAILED', now() - interval '2 minutes', now() - interval '1 minute')`,
      [practice.practiceId, jobId, key],
    );
    expect(ok(await call(practiceHome, viewer, P())).freshness.failedRun).toMatchObject({ jobId, jobType: 'monitor', outcome: 'failed', attempts: 3 });
    // The operator's replay with the same key succeeds: the banner clears.
    await w.owner.query(
      `INSERT INTO job_run (practice_id, job_id, job_type, singleton_key, idempotency_key, attempts, outcome, started_at, finished_at) VALUES ($1, $2, 'monitor', $3, '2026-11-01', 1, 'succeeded', now(), now())`,
      [practice.practiceId, randomUUID(), key],
    );
    expect(ok(await call(practiceHome, viewer, P())).freshness.failedRun).toBeNull();
  });
});

describe('notifications', () => {
  it('lists the person’s own notifications only, and marks only theirs read', async () => {
    const mine = ok(await call(notificationsPage, practice.manager, P()));
    expect(mine.unread).toBe(2);
    expect(mine.notifications.map((item) => [item.kind, item.subjectId]).sort()).toEqual(
      [
        ['digest', digestId],
        ['monitoring_run', runId],
      ].sort(),
    );
    expect(mine.notifications.find((item) => item.kind === 'digest')).toMatchObject({ period: '2026-02', readAt: null });
    ok(await call(markNotificationsReadAction, practice.manager, P(), {}));
    expect(ok(await call(notificationsPage, practice.manager, P())).unread).toBe(0);
    // Marking again changes nothing; the viewer's own are still unread.
    ok(await call(markNotificationsReadAction, practice.manager, P(), {}));
    expect(ok(await call(notificationsPage, viewer, P())).unread).toBe(2);
    const { rows } = await w.owner.query<{ user_id: string; read: boolean }>('SELECT user_id, read_at IS NOT NULL AS read FROM notification WHERE practice_id = $1 AND kind = $2 ORDER BY user_id', [
      practice.practiceId,
      'monitoring_run',
    ]);
    expect(rows).toEqual([practice.world.adminUserId, practice.manager, viewer].sort().map((user) => ({ user_id: user, read: user === practice.manager })));
  });
});

describe('the digest page', () => {
  it('shows the month’s figures with the payers named, and never another practice’s digest', async () => {
    const page = ok(await call(digestPage, viewer, { ...P(), digestId }));
    expect(page.digest).toMatchObject({ id: digestId, period: '2026-02', sentAt: expect.any(String) as unknown });
    // February: nothing was validated in it; coverage counts every line's run in effect.
    expect(page.digest.figures.counts).toMatchObject({ validated_lines: 0, coverage_lines: 17, coverage_priced_lines: 17, contracts_expiring: 0 });
    expect(page.digest.payers).toEqual({});
    expect((await call(digestPage, viewer, { ...P(), digestId: otherDigestId })).status).toBe('not_found');
  });
});

describe('the monthly variance summary (J12)', () => {
  it('counts each line of the month once, at its furthest stage, never adding stages together, by payer and in all', async () => {
    const summary = ok(await call(monthlySummaryPage, viewer, { ...P(), month: '2026-03' })).summary;
    const { rows } = await w.owner.query<{ billed: string; actionable: string; validated: string }>(
      `SELECT sum(l.charge_cents)::text AS billed,
              sum(l.charge_cents) FILTER (WHERE l.procedure_code IN ('97110', '97530') AND l.id IN (SELECT service_line_id FROM case_line))::text AS actionable,
              sum(l.charge_cents) FILTER (WHERE l.id NOT IN (SELECT service_line_id FROM case_line))::text AS validated
         FROM service_line l WHERE l.practice_id = $1`,
      [practice.practiceId],
    );
    const billed = rows[0];
    expect(summary.month).toBe('2026-03');
    expect(summary.total.figures).toEqual({
      flagged: { lines: 0, billedCents: '0', varianceCents: null },
      validated: { lines: 1, billedCents: billed?.validated, varianceCents: '300' },
      actionable: { lines: 16, billedCents: billed?.actionable, varianceCents: '55200' },
      // Payer approved and recovered are counted here; their dollars are the recovery ledger's alone.
      payer_approved: { lines: 0, billedCents: '0', varianceCents: null },
      recovered: { lines: 0, billedCents: '0', varianceCents: null },
      priced: { lines: 0, billedCents: '0', varianceCents: null },
      overpaid: { lines: 0, billedCents: '0', varianceCents: null },
      unpriced: { lines: 0, billedCents: '0', varianceCents: null },
      not_priced: { lines: 0, billedCents: '0', varianceCents: null },
    });
    expect(summary.total.writtenOff).toEqual({ lines: 0, billedCents: '0', varianceCents: '0' });
    expect(summary.byPayer).toHaveLength(1);
    expect(summary.byPayer[0]).toMatchObject({ payerName: 'SYNTHETIC PAYER Q', figures: { actionable: { lines: 16, varianceCents: '55200' }, validated: { lines: 1, varianceCents: '300' } } });
    // The single-user approval gap (CAS-10): none here, a practice with two who approve packets.
    expect(summary.approvedAlone).toEqual([]);

    const empty = ok(await call(monthlySummaryPage, viewer, { ...P(), month: '2025-01' })).summary;
    expect(empty.byPayer).toEqual([]);
    expect(empty.total.figures.actionable).toEqual({ lines: 0, billedCents: '0', varianceCents: '0' });
    // A page with a parameter it cannot read is not found.
    expect((await call(monthlySummaryPage, viewer, { ...P(), month: '2026-13' })).status).toBe('not_found');
    expect(ok(await call(monthlySummaryPage, viewer, P())).digests.map((digest) => digest.id)).toEqual([digestId]);
  });

  it('downloads as CSV: counts and totals by payer and stage, named by the month only', async () => {
    const { download } = ok(await call(monthlySummaryCsvRoute, viewer, { ...P(), month: '2026-03' }));
    expect(download.filename).toBe('monthly-summary-2026-03.csv');
    const lines = download.body.split('\r\n');
    const { rows } = await w.owner.query<{ cents: string }>('SELECT sum(charge_cents)::text AS cents FROM service_line WHERE id IN (SELECT service_line_id FROM case_line) AND practice_id = $1', [practice.practiceId]);
    const billed = BigInt(rows[0]?.cents ?? '0');
    expect(lines[0]).toBe('month,payer,stage,lines,billed,variance');
    expect(lines).toContain(`2026-03,all payers,actionable,16,${String(billed / 100n)}.${String(billed % 100n).padStart(2, '0')},552.00`);
    expect(lines).toContain('2026-03,all payers,flagged,0,0.00,');
    expect(lines).toContain('2026-03,all payers,packets_approved_alone,0,,');
    expect(lines.filter((line) => line.includes('SYNTHETIC PAYER Q'))).toHaveLength(10);
    expect(download.body).not.toMatch(/SYNPCN|SYNCCN|SYNTHLAST|SYNTHFIRST/);
  });
});

describe('runs the monitoring chain created', () => {
  it('say so on the Pricing runs screen, in place of a person', async () => {
    await w.load(practice, 'CAS-04/remit.835');
    await monitorHandler()({ practice_id: practice.practiceId, day: '2026-11-01' }, jobContext(practice));
    const runs = ok(await call(pricingRunsPage, viewer, P())).list.runs;
    expect(runs.map((run) => [run.periodFrom, run.monitoring, run.createdBy])).toEqual(
      expect.arrayContaining([
        ['2026-05-01', true, 'monitoring (the monthly chain, on new files)'],
        // A viewer sees a person's run as a member's, without their address.
        ['2026-03-01', false, 'a member of the practice'],
      ]),
    );
  });
});

describe('notification preferences', () => {
  it('are the person’s own, on until turned off', async () => {
    expect(ok(await call(notificationPreferencesPage, viewer, {}))).toEqual({ preferences: { digestEmail: true, inApp: true }, saved: false });
    expect(ok(await call(saveNotificationPreferencesAction, viewer, {}, { digestEmail: 'on' }))).toMatchObject({ redirect: '/account/notifications?saved=1' });
    expect(ok(await call(notificationPreferencesPage, viewer, { saved: '1' }))).toEqual({ preferences: { digestEmail: true, inApp: false }, saved: true });
    const { rows } = await w.owner.query<{ settings: unknown }>('SELECT settings FROM "user" WHERE id = $1', [viewer]);
    expect(rows[0]?.settings).toEqual({ notifications: { digest_email: true, in_app: false } });
    // Someone else's are untouched.
    expect(ok(await call(notificationPreferencesPage, practice.manager, {})).preferences).toEqual({ digestEmail: true, inApp: true });
  });
});

describe('the monthly summary reads each line’s pricing in effect (PRD 5, J17; docs/adr/0037)', () => {
  it('counts a validated line whose accepted re-run finds no shortfall by how the re-run leaves it, never at its old variance', async () => {
    const target = await w.practice('summary in effect', { case_materiality_cents: '100000' });
    await w.load(target, 'CAS-04/remit.835');
    const first = await w.fixedContract(target, { schedule: [{ code: '97110', amountCents: '5000' }], ...FIXED });
    const may = await w.pricedRun(target, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: first.versionId }], from: '2026-05-01', to: '2026-05-31' });
    await w.triage(target, may);
    const month = { practiceId: target.practiceId, month: '2026-05' };
    expect(ok(await call(monthlySummaryPage, target.manager, month)).summary.total.figures.validated).toEqual({ lines: 3, billedCents: '22500', varianceCents: '6000' });
    // The mapping was wrong: corrected to a contract that pays what the payer paid, then May re-run and accepted.
    const right = await w.fixedContract(target, { schedule: [{ code: '97110', amountCents: '3000' }], ...FIXED });
    const planId = await w.pricing.planOf(target, 'CE:SYNPLAN-FIX-ONE');
    const old = await w.pricing.one<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE plan_id = $1', [planId]);
    await w.as(target, target.manager, (context) => correctMapping(context, { practiceId: target.practiceId, planId, kind: 'contract', contractVersionId: right.versionId, effectiveFrom: '2026-01-01', supersedesId: old.id }));
    const asManager = <T>(run: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, run);
    const rerun = await asManager((scope) => createRerun(scope, { practiceId: target.practiceId, pricingRunId: may, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }));
    await w.pricing.execute(target, rerun.pricingRunId);
    // Before anyone accepts it, the summary still reads the first run.
    expect(ok(await call(monthlySummaryPage, target.manager, month)).summary.total.figures.validated.lines).toBe(3);
    await asManager((scope) => acceptRun(scope, { practiceId: target.practiceId, pricingRunId: rerun.pricingRunId }));
    const figures = ok(await call(monthlySummaryPage, target.manager, month)).summary.total.figures;
    expect(figures.validated).toEqual({ lines: 0, billedCents: '0', varianceCents: '0' });
    expect(figures.priced).toMatchObject({ lines: 3, billedCents: '22500' });
  });
});
