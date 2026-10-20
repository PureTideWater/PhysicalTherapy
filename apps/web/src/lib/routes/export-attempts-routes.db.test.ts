import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { EXPORT_REQUEST_REFUSALS, PacketRuleError, requestPacketExport } from '@tp/worker/packets';
import { packetExportHandler } from '@tp/worker/runtime';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { csrfTokenFor } from '../http/csrf';
import type { CookieJar, Outcome, Route } from '../http/route';
import { EXPORT_REFUSAL_TEXT, type ExportAttempt, exportAttemptWords } from '../packets/export-attempts';
import { BLOCKED_TEXT, DRAFTER_APPROVAL_TEXT } from '../packets/queries';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { approvePacketVersionAction, exportPacketAction, packetPage, writeVersionAction } from './packets';
import { reopenLineAction, writeOffLineAction } from './triage';

/**
 * The export's attempts and the builder's approval panel through the screens' routes against PostgreSQL (the
 * best-option audit's items #26 and #61, the founder's ruling of 2026-10-18; docs/adr/0061). In a practice of its
 * own, the SYNTHETIC CAS-08 lines (three 97110 x 2, each 30.00 short under a fixed schedule whose window is cited
 * and verified) triage into one case, whose packet the billing manager writes and a second billing manager
 * approves:
 *
 * - the drafter's approval panel says who approves (the disabled button's reason), and the builder says what the
 *   export waits for, every reason with its fix;
 * - an export the job would refuse is refused at once through the route, every reason that holds listed with its
 *   fix, nothing queued and nothing recorded as asked; the web's request, the worker's and the job agree on the
 *   reason;
 * - once asked, the builder shows the export in progress; the job's refusal shows with its reason and fix; asked
 *   again after the fix, a failed try shows as retrying, the last as failed, and the next export as exported.
 */

let w: TriageWorld;
let services: Services;
let queue: MemoryQueue;
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-export-attempts-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;

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

/** A refusal's issues, as the export form lists them (field: the reason's code). */
function issues(outcome: Outcome<unknown>): readonly { readonly field: string; readonly message: string }[] {
  if (outcome.status !== 'invalid') {
    throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return outcome.issues;
}

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
  const sealer = new Sealer(randomBytes(32));
  queue = new MemoryQueue();
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
    queue,
    documents,
  });
}, 120_000);

afterAll(async () => {
  await w.close();
  rmSync(documentsDir, { recursive: true, force: true });
});

interface Setup {
  readonly practice: Practice;
  readonly caseId: string;
  /** A second billing manager, who approves. */
  readonly second: string;
}

const P = (target: Practice) => ({ practiceId: target.practiceId });

/** A practice whose CAS-08 lines open one case. */
async function cas08(label: string): Promise<Setup> {
  const practice = await w.practice(label, { case_materiality_cents: '1000' });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, MARCH.from, MARCH.to);
  await w.pricing.execute(practice, runId);
  const triaged = await w.triage(practice, runId);
  if (triaged.outcome !== 'triaged' || triaged.summary.casesOpened !== 1) {
    throw new Error('CAS-08 did not open one case');
  }
  const caseId = (await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]))).rows[0]?.id ?? '';
  const second = await createUser(w.owner);
  await addMembership(w.owner, practice.world.organizationId, second, 'billing_manager');
  return { practice, caseId, second };
}

const builder = async (setup: Setup, actorId = setup.practice.manager) => ok(await call(packetPage, actorId, { ...P(setup.practice), caseId: setup.caseId })).builder;

/** The export job's own code on the queued job, with a stand-in printer, on its last attempt or not. */
async function runJob(setup: Setup, versionId: string, options: { readonly lastAttempt?: boolean; readonly render?: () => Promise<Uint8Array> } = {}): Promise<unknown> {
  const jobId = randomUUID();
  try {
    await packetExportHandler({ documents, keys: w.keys, pdf: { render: options.render ?? (() => Promise.resolve(new TextEncoder().encode(`%PDF-1.7\n% SYNTHETIC ${randomUUID()}\n`))) } })(
      { practice_id: setup.practice.practiceId, packet_version_id: versionId },
      {
        jobId,
        logger: createLogger({ sink: () => undefined }),
        transaction: (work) => withJobScope(w.app, { jobId, practiceId: setup.practice.practiceId }, work),
        enqueue: () => Promise.resolve(null),
        lastAttempt: options.lastAttempt ?? false,
      },
    );
    return undefined;
  } catch (error) {
    return error;
  }
}

/** How many times the version's export was asked for (the route's audit event, recorded only when it queued or found it exported). */
async function requests(setup: Setup, versionId: string): Promise<number> {
  const { rows } = await asOwner(w.owner, [setup.practice.practiceId], () =>
    w.owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE object_id = $1 AND action = 'packet_export_requested'", [versionId]),
  );
  return rows[0]?.n ?? 0;
}

const stateOf = (attempt: ExportAttempt) => ({ state: attempt.state, code: 'code' in attempt ? attempt.code : null });

describe('the builder, through its routes', () => {
  it('shows the drafter why they cannot approve, and what the export waits for, every reason with its fix (items #61, #26)', async () => {
    const setup = await cas08('ATTEMPTS DRAFTER');
    ok(await call(writeVersionAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, basedOnVersionId: '', useDraft: 'on', promptPayState: 'ZZ' }));
    const drafted = await builder(setup);
    expect(drafted.approval).toEqual({ status: 'drafter' });
    expect(DRAFTER_APPROVAL_TEXT).toMatch(/Request approval/);
    // The interest line the write asked for is the version's.
    expect(drafted.version?.content.interest).toMatchObject({ state: 'ZZ' });
    expect(drafted.version?.pricingNow).toMatchObject({ status: 'current', lines: [] });
    expect(drafted.version?.exportReadiness).toEqual({ outcome: 'refused', reasons: ['not_approved'] });
    expect(drafted.version?.exportAttempt).toEqual({ state: 'none' });
    // The second billing manager may approve it; every blocked reason has its words.
    expect((await builder(setup, setup.second)).approval).toEqual({ status: 'ready', alone: false });
    expect(Object.values(BLOCKED_TEXT).every((text) => text.length > 0)).toBe(true);
  });

  it('refuses at once, queueing nothing and recording no request, every reason that holds with its fix; the web, the worker and the job agree (item #26)', async () => {
    const setup = await cas08('ATTEMPTS REFUSED');
    ok(await call(writeVersionAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, basedOnVersionId: '', useDraft: 'on' }));
    const version = (await builder(setup)).version;
    const versionId = version?.id ?? '';
    const queued = queue.jobs.length;
    expect(issues(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId }))).toEqual([{ field: 'not_approved', message: EXPORT_REFUSAL_TEXT.not_approved }]);
    // A line written off since: the case changed too, and both are said.
    const lineId = (await asOwner(w.owner, [setup.practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM case_line WHERE case_id = $1 ORDER BY id LIMIT 1', [setup.caseId]))).rows[0]?.id ?? '';
    ok(await call(writeOffLineAction, setup.practice.manager, P(setup.practice), { caseLineId: lineId, reason: 'not_worth_pursuit', text: '', confirm: 'on' }));
    expect(issues(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId }))).toEqual([
      { field: 'not_approved', message: EXPORT_REFUSAL_TEXT.not_approved },
      { field: 'case_changed', message: EXPORT_REFUSAL_TEXT.case_changed },
    ]);
    expect((await builder(setup)).version?.exportReadiness).toEqual({ outcome: 'refused', reasons: ['not_approved', 'case_changed'] });
    expect(queue.jobs.length).toBe(queued);
    expect(await requests(setup, versionId)).toBe(0);
    // The worker's request refuses for the first reason in its words, and the job records that reason.
    const sender = { send: () => Promise.reject(new Error('nothing is queued')) } as never;
    const worker = await withPracticeScope(w.app, { actorId: setup.practice.manager, practiceIds: [setup.practice.practiceId] }, (scope) =>
      requestPacketExport(scope, sender, { practiceId: setup.practice.practiceId, versionId, requestId: 'test' }).then(
        () => undefined,
        (error: unknown) => error,
      ),
    );
    expect(worker).toBeInstanceOf(PacketRuleError);
    expect((worker as Error).message).toBe(EXPORT_REQUEST_REFUSALS.not_approved);
    expect(await runJob(setup, versionId)).toBeUndefined();
    // Nothing was asked through the page, so the page shows no attempt (the job's refusal answers no request).
    expect((await builder(setup)).version?.exportAttempt).toEqual({ state: 'none' });
  });

  it('shows the export in progress once asked, the job’s refusal with its fix, a failed try, the last failure, and the export (item #26)', async () => {
    const setup = await cas08('ATTEMPTS STATES');
    ok(await call(writeVersionAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, basedOnVersionId: '', useDraft: 'on' }));
    const written = (await builder(setup)).version;
    const versionId = written?.id ?? '';
    ok(await call(approvePacketVersionAction, setup.second, P(setup.practice), { caseId: setup.caseId, versionId, versionSha256: written?.contentSha256 ?? '' }));
    expect((await builder(setup)).version?.exportReadiness).toEqual({ outcome: 'ready' });
    const queued = queue.jobs.length;
    expect(ok(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId })).redirect).toMatch(/notice=export_requested$/);
    expect(queue.jobs.slice(queued)).toEqual([{ type: 'packet_export', payload: { practice_id: setup.practice.practiceId, packet_version_id: versionId } }]);
    const asked = (await builder(setup)).version?.exportAttempt;
    expect(asked?.state).toBe('in_progress');
    expect(exportAttemptWords(asked ?? { state: 'none' }, (iso) => iso)).toMatchObject({ state: 'in_progress', live: true });

    // Before the job runs, a line is written off: the builder says so at once, and the job refuses it with the same reason.
    const lineId = (await asOwner(w.owner, [setup.practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM case_line WHERE case_id = $1 ORDER BY id LIMIT 1', [setup.caseId]))).rows[0]?.id ?? '';
    ok(await call(writeOffLineAction, setup.practice.manager, P(setup.practice), { caseLineId: lineId, reason: 'not_worth_pursuit', text: '', confirm: 'on' }));
    expect((await builder(setup)).version?.exportReadiness).toEqual({ outcome: 'refused', reasons: ['case_changed'] });
    expect(issues(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId }))).toEqual([{ field: 'case_changed', message: EXPORT_REFUSAL_TEXT.case_changed }]);
    expect(await runJob(setup, versionId)).toBeUndefined();
    const refused = (await builder(setup)).version?.exportAttempt ?? { state: 'none' };
    expect(stateOf(refused)).toEqual({ state: 'refused', code: 'case_changed' });
    expect(exportAttemptWords(refused, (iso) => iso)?.text).toContain(EXPORT_REFUSAL_TEXT.case_changed);

    // The line reopened, the export asked again: a failed try shows as retrying, the last as failed, the next export as exported.
    ok(await call(reopenLineAction, setup.practice.manager, P(setup.practice), { caseLineId: lineId, reason: 'SYNTHETIC: written off by mistake' }));
    expect((await builder(setup)).version?.exportReadiness).toEqual({ outcome: 'ready' });
    ok(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId }));
    expect(stateOf((await builder(setup)).version?.exportAttempt ?? { state: 'none' })).toEqual({ state: 'in_progress', code: null });
    const crash = () => Promise.reject(new Error('SYNTHETIC renderer crash'));
    expect(await runJob(setup, versionId, { render: crash })).toBeInstanceOf(Error);
    expect(stateOf((await builder(setup)).version?.exportAttempt ?? { state: 'none' })).toEqual({ state: 'retrying', code: 'render_failed' });
    expect(await runJob(setup, versionId, { render: crash, lastAttempt: true })).toBeInstanceOf(Error);
    const failed = (await builder(setup)).version?.exportAttempt ?? { state: 'none' };
    expect(stateOf(failed)).toEqual({ state: 'failed', code: 'render_failed' });
    expect(exportAttemptWords(failed, (iso) => iso)?.text).toMatch(/the operator was alerted\.$/);
    // The billing manager asks again, and the export is made.
    ok(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId }));
    expect(await runJob(setup, versionId)).toBeUndefined();
    const done = (await builder(setup)).version;
    expect(done?.exportAttempt.state).toBe('exported');
    expect(done?.exportReadiness).toEqual({ outcome: 'exported' });
    expect(done?.exportedAt).not.toBeNull();
    // The analyst, who drafts packets, reads the same; the export asked again is left as it is.
    const analyst = await createUser(w.owner);
    await addMembership(w.owner, setup.practice.world.organizationId, analyst, 'analyst');
    expect((await builder(setup, analyst)).version?.exportAttempt.state).toBe('exported');
    expect(ok(await call(exportPacketAction, setup.practice.manager, P(setup.practice), { caseId: setup.caseId, versionId })).redirect).toMatch(/notice=exported$/);
  });
});
