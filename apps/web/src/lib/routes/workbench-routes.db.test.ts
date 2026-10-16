import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { packetExportHandler } from '@tp/worker/runtime';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Download, MutationResult, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { approvePacketVersionAction, exportPacketAction, packetCsv, packetPage, packetPdf, requestApprovalAction, writeVersionAction } from './packets';
import { practiceHome } from './practice';
import { logSubmissionAction, recordResponseAction, submissionsPage } from './submissions';
import { casePage, casesPage } from './triage';
import { addNoteAction, assignCaseAction, openCaseAction, setMaterialityAction } from './workbench';

/**
 * The case workbench, the packet builder and the submissions screens through their routes against
 * PostgreSQL (PRD 5, J8 to J10; PRD 7, Cases, Packet builder, Submissions and responses; PRD 12; test
 * matrix CAS-03 to CAS-15; docs/adr/0041 and 0044). Each practice loads SYNTHETIC CAS fixtures through
 * the parse_835 job, signs off a fixed schedule (97110 at 50.00 per unit), prices the month with the
 * price job and triages it; then its people work it through the screens' routes, and the export job's
 * own code prints the packets (with a stand-in printer where Chromium is not installed).
 */

let w: TriageWorld;
let services: Services;
let queue: MemoryQueue;
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-workbench-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const CAS08_NARRATIVE = readFileSync(fileURLToPath(new URL('../../../../../fixtures/synthetic/CAS-08/narrative-draft.txt', import.meta.url)), 'utf8').trim();
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;

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

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, requestKey: string = randomUUID()): Promise<Outcome<R>> {
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { requestKey, ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

/** The sentence a refused step shows. */
function refused(outcome: Outcome<unknown>): string {
  if (outcome.status !== 'invalid') {
    throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  }
  return outcome.issues.map((issue) => issue.message).join('; ');
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

async function person(target: Practice, role: 'billing_manager' | 'analyst' | 'viewer'): Promise<string> {
  const id = await createUser(w.owner);
  await addMembership(w.owner, target.world.organizationId, id, role);
  return id;
}

/** A practice whose CAS-08 lines (three 97110 x 2, each 30.00 short) triage into one case. */
async function cas08Case(label: string, settings: object = {}): Promise<{ practice: Practice; caseId: string }> {
  const practice = await w.practice(label, { case_materiality_cents: '1000', ...settings });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
  const outcome = await w.triage(practice, runId);
  if (outcome.outcome !== 'triaged' || outcome.summary.casesOpened !== 1) {
    throw new Error('CAS-08 did not open one case');
  }
  const { rows } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]));
  return { practice, caseId: (rows[0] as { id: string }).id };
}

/** Runs the export job's code on the version, as the worker does for the queued packet_export job. */
async function runExport(target: Practice, versionId: string): Promise<void> {
  const jobId = randomUUID();
  await packetExportHandler({ documents, keys: w.keys, pdf: w.pdf })(
    { practice_id: target.practiceId, packet_version_id: versionId },
    { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.app, { jobId, practiceId: target.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
  );
}

async function superuser(sql: string, values: unknown[]): Promise<void> {
  await w.owner.query('BEGIN');
  try {
    await w.owner.query('SET LOCAL session_replication_role = replica');
    await w.owner.query(sql, values);
    await w.owner.query('COMMIT');
  } catch (error) {
    await w.owner.query('ROLLBACK');
    throw error;
  }
}

describe('the Cases workbench (CAS-03, CAS-04, CAS-06)', () => {
  it('opens a held pattern only once the case materiality admits it, with its owner, and lists cases by state, owner and deadline', async () => {
    const practice = await w.practice('WORKBENCH CAS-04');
    const viewer = await person(practice, 'viewer');
    await w.load(practice, 'CAS-04/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    const may = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-05-01', to: '2026-05-31' });
    expect(await w.triage(practice, may)).toMatchObject({ outcome: 'triaged', summary: { casesOpened: 0, heldPatterns: 1 } });
    const P = { practiceId: practice.practiceId };

    // Three 97110 lines each 20.00 short: a 60.00 pattern, below the default case materiality of 250.00.
    const before = ok(await call(casesPage, practice.manager, P));
    expect(before.cases).toEqual([]);
    expect(before.materiality).toEqual({ lineCents: '500', caseCents: '25000' });
    expect(before.waiting.map((pattern) => [pattern.status, pattern.actionableLines, pattern.actionableCents, pattern.behaviorText])).toEqual([['held', 3, '6000', 'Paid below the contract rate']]);
    const key = (before.waiting[0] as (typeof before.waiting)[number]).key;
    const pattern = { ...key, contractVersionId: key.contractVersionId ?? '', rateRecordId: key.rateRecordId ?? '' };
    expect(refused(await call(openCaseAction, practice.manager, P, pattern))).toBe('its actionable lines total 60.00, below the case materiality of 250.00, so it keeps accumulating; lower the case materiality to open it');
    // A viewer reads the list, without the waiting patterns or the forms that change them.
    const viewed = ok(await call(casesPage, viewer, P));
    expect([viewed.canTriage, viewed.waiting]).toEqual([false, []]);
    expect((await call(setMaterialityAction, viewer, P, { lineMateriality: '5.00', caseMateriality: '50.00' })).status).toBe('forbidden');

    // Setting the practice's materiality: the pattern is ready, and opens with its owner.
    expect(ok(await call(setMaterialityAction, practice.manager, P, { lineMateriality: '5.00', caseMateriality: '50.00' })).redirect).toBe(`/p/${practice.practiceId}/cases?notice=materiality`);
    const after = ok(await call(casesPage, practice.manager, P));
    expect(after.materiality).toEqual({ lineCents: '500', caseCents: '5000' });
    expect(after.waiting.map((item) => item.status)).toEqual(['ready']);
    expect(after.workers.map((worker) => worker.userId)).toEqual([practice.manager]);
    expect(refused(await call(openCaseAction, practice.manager, P, { ...pattern, ownerUserId: viewer }))).toBe('a case is assigned to a person who works the practice’s cases now'.replace('’', "'"));
    const opened = ok(await call(openCaseAction, practice.manager, P, { ...pattern, ownerUserId: practice.manager }));
    const caseId = (opened.redirect ?? '').split('/').at(-1) ?? '';
    expect(opened.redirect).toBe(`/p/${practice.practiceId}/cases/${caseId}`);
    // Opening it again goes to the same case.
    expect(ok(await call(openCaseAction, practice.manager, P, pattern)).redirect).toBe(opened.redirect);

    const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ state: string; actionable_cents: string; materiality_cents: string; owner_user_id: string; set_by: string[] }>(
        `SELECT c.state, c.actionable_cents::text, c.materiality_cents::text, c.owner_user_id,
                (SELECT array_agg(DISTINCT s.set_by::text) FROM line_status s JOIN case_line cl ON cl.service_line_id = s.service_line_id WHERE cl.case_id = c.id AND s.stage = 'actionable') AS set_by
           FROM "case" c WHERE c.id = $1`,
        [caseId],
      ),
    );
    expect(rows).toEqual([{ state: 'open', actionable_cents: '6000', materiality_cents: '5000', owner_user_id: practice.manager, set_by: [practice.manager] }]);

    const listed = ok(await call(casesPage, practice.manager, P));
    expect(listed.cases.map((item) => [item.state, item.lines, item.actionableNowCents, item.ownerUserId])).toEqual([['open', 3, '6000', practice.manager]]);
    expect([listed.openCases, listed.actionableCents, listed.waiting]).toEqual([1, '6000', []]);
    expect(ok(await call(casesPage, practice.manager, { ...P, owner: 'mine' })).total).toBe(1);
    expect(ok(await call(casesPage, viewer, { ...P, owner: 'mine' })).total).toBe(0);
    expect(ok(await call(casesPage, practice.manager, { ...P, owner: 'none' })).total).toBe(0);
    expect(ok(await call(casesPage, practice.manager, { ...P, owner: practice.manager })).total).toBe(1);
    expect(ok(await call(casesPage, practice.manager, { ...P, state: 'submitted' })).total).toBe(0);
    // Its windows are ten years long: no deadline within 90 days.
    expect(ok(await call(casesPage, practice.manager, { ...P, deadline: '90' })).total).toBe(0);
    // The person who opened it is named in the timeline.
    const detail = ok(await call(casePage, practice.manager, { ...P, caseId }));
    expect(detail.timeline.find((event) => event.kind === 'opened')).toMatchObject({ by: expect.stringContaining('@') as unknown });
  });

  it('assigns a case to a person who works cases only, and keeps its notes encrypted, their words for the roles that read PHI', async () => {
    const { practice, caseId } = await cas08Case('WORKBENCH NOTES');
    const viewer = await person(practice, 'viewer');
    const analyst = await person(practice, 'analyst');
    const P = { practiceId: practice.practiceId };
    expect(refused(await call(assignCaseAction, practice.manager, P, { caseId, ownerUserId: viewer }))).toBe("a case is assigned to a person who works the practice's cases now");
    expect((await call(assignCaseAction, viewer, P, { caseId, ownerUserId: analyst })).status).toBe('forbidden');
    ok(await call(assignCaseAction, practice.manager, P, { caseId, ownerUserId: analyst }));
    // Assigning the owner it has records nothing more.
    ok(await call(assignCaseAction, practice.manager, P, { caseId, ownerUserId: analyst }));
    ok(await call(addNoteAction, analyst, P, { caseId, text: 'SYNTHETIC note: provider relations asked for the exhibit' }));
    expect((await call(addNoteAction, viewer, P, { caseId, text: 'SYNTHETIC' })).status).toBe('forbidden');

    const { rows } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ kind: string; body: string | null }>('SELECT kind, body FROM case_activity WHERE case_id = $1 ORDER BY created_at, id', [caseId]));
    expect(rows.map((row) => row.kind)).toEqual(['assigned', 'note']);
    expect(rows[1]?.body).toMatch(/^enc:v1:/);
    await expect(asOwner(w.owner, [practice.practiceId], () => w.owner.query("UPDATE case_activity SET kind = 'note' WHERE case_id = $1", [caseId]))).rejects.toMatchObject({ code: '23514' });

    const managed = ok(await call(casePage, practice.manager, { ...P, caseId }));
    expect([managed.case.ownerUserId, managed.case.owner?.includes('@')]).toEqual([analyst, true]);
    expect(managed.activity.map((item) => [item.kind, item.text])).toEqual([
      ['assigned', null],
      ['note', 'SYNTHETIC note: provider relations asked for the exhibit'],
    ]);
    expect(managed.timeline.map((event) => event.kind)).toEqual(expect.arrayContaining(['opened', 'assigned', 'note']));
    const viewed = ok(await call(casePage, viewer, { ...P, caseId }));
    expect(viewed.activity.find((item) => item.kind === 'note')?.text).toBeNull();
    expect(viewed.workers).toEqual([]);
    expect(viewed.ledger).toEqual({ approvedCents: '0', recoveredCents: '0', proofLevel: 'posted' });
  });

  it('shows a line past its window struck through, WINDOW_PASSED, out of the actionable total (J8; CAS-06)', async () => {
    const practice = await w.practice('WORKBENCH WINDOW', { case_materiality_cents: '1000' });
    await w.load(practice, 'CAS-08/remit.835');
    const contract = await w.fixedContract(practice, { ...FIXED, disputeWindowDays: 30 });
    const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    // Judged on a day inside the windows, the case opens; today they have closed.
    await w.triage(practice, runId, '2026-03-20');
    await w.triage(practice, runId);
    const P = { practiceId: practice.practiceId };
    const [item] = ok(await call(casesPage, practice.manager, P)).cases;
    const detail = ok(await call(casePage, practice.manager, { ...P, caseId: item?.id ?? '' }));
    expect(detail.detail.lines.map((line) => [line.actionable, line.windowPassed, line.writtenOffReason, line.writtenOffBy])).toEqual([
      [false, true, 'window_passed', null],
      [false, true, 'window_passed', null],
      [false, true, 'window_passed', null],
    ]);
    expect([detail.case.state, detail.case.actionableNowCents, detail.case.writtenOffCents]).toEqual(['closed_written_off', '0', '9000']);
    expect(detail.timeline.filter((event) => event.kind === 'written_off')).toHaveLength(3);
  });
});

describe('the packet builder (CAS-08 to CAS-13)', () => {
  it('blocks approval of a narrative with a figure not in the input, refuses the drafter with the reason, and lets a second person approve', async () => {
    const { practice, caseId } = await cas08Case('BUILDER CAS-08');
    const second = await person(practice, 'billing_manager');
    const analyst = await person(practice, 'analyst');
    const P = { practiceId: practice.practiceId };
    const builder = async (userId: string, version?: string) => ok(await call(packetPage, userId, { ...P, caseId, ...(version === undefined ? {} : { version }) }));

    expect((await builder(practice.manager)).builder.version).toBeNull();
    expect(ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: '', useDraft: 'on' })).redirect).toBe(`/p/${practice.practiceId}/cases/${caseId}/packet?notice=written`);
    const first = (await builder(practice.manager)).builder;
    expect(first.version).toMatchObject({ versionNo: 1, current: true, verifier: { passed: true } });
    // The drafter sees the refusal ahead; a second billing manager sees it ready; an analyst does not approve.
    expect(first.approval).toEqual({ status: 'drafter' });
    expect((await builder(second)).builder.approval).toEqual({ status: 'ready', alone: false });
    expect((await builder(analyst)).builder.approval).toEqual({ status: 'not_approver' });
    // Saving what the version already holds writes nothing.
    expect(ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: first.version?.id ?? '', useDraft: 'on' })).redirect).toMatch(/notice=unchanged$/);

    // CAS-08: the narrative with 1234.56 is written with its failing result, and approval is blocked.
    ok(await call(writeVersionAction, analyst, P, { caseId, basedOnVersionId: first.version?.id ?? '', narrative: CAS08_NARRATIVE }));
    const failing = (await builder(second)).builder;
    expect(failing.version).toMatchObject({ versionNo: 2, narrative: CAS08_NARRATIVE, verifier: { passed: false } });
    const flagged = (failing.version?.verifier.mismatches ?? []).filter((item) => item.code === 'figure_not_in_input').map((item) => CAS08_NARRATIVE.slice(item.start, item.end));
    expect(flagged).toEqual(['1234.56']);
    expect(failing.approval).toEqual({ status: 'blocked', reason: 'verifier' });
    expect(refused(await call(approvePacketVersionAction, second, P, { caseId, versionId: failing.version?.id ?? '', versionSha256: failing.version?.contentSha256 ?? '' }))).toBe('a packet version the verifier failed cannot be approved');
    // A stale edit (based on version 1) is refused.
    expect(refused(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: first.version?.id ?? '', narrative: 'The payer paid 97110 short [1].' }))).toBe('another version of the packet was written since this one was opened');

    // Version 3, the code-built draft again, by the packet's drafter: the drafter cannot approve it (CAS-09).
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: failing.version?.id ?? '', useDraft: 'on' }));
    const third = (await builder(practice.manager)).builder;
    expect(third.version).toMatchObject({ versionNo: 3, verifier: { passed: true } });
    expect(third.approval).toEqual({ status: 'drafter' });
    expect(refused(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '' }))).toBe('the person who drafted or last edited a packet cannot approve it');
    expect((await call(approvePacketVersionAction, analyst, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '' })).status).toBe('forbidden');

    // A request for approval, then the second person approves (once; again does nothing).
    ok(await call(requestApprovalAction, analyst, P, { caseId, versionId: third.version?.id ?? '', message: 'SYNTHETIC: ready for you' }));
    ok(await call(requestApprovalAction, analyst, P, { caseId, versionId: third.version?.id ?? '', message: '' }));
    expect((await builder(second)).builder.approvalRequest).toMatchObject({ message: 'SYNTHETIC: ready for you' });
    expect(refused(await call(approvePacketVersionAction, second, P, { caseId, versionId: third.version?.id ?? '', versionSha256: 'a'.repeat(64) }))).toBe('an approval names the hash of the version it approves');
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '' }));
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '' }));
    const approved = (await builder(practice.manager)).builder;
    expect(approved.approval).toMatchObject({ status: 'approved', alone: false });
    expect(approved.versions.map((version) => [version.versionNo, version.verifierPassed, version.approvedAt !== null])).toEqual([
      [3, true, true],
      [2, false, false],
      [1, true, false],
    ]);
    // An earlier version still opens, as it was written.
    expect((await builder(practice.manager, first.version?.id)).builder.version).toMatchObject({ versionNo: 1, current: false });
    expect((await builder(practice.manager)).builder.approvalRequest).not.toBeNull();
  });

  it('exports the approved version through the export job, identifiers only in the files, and the submission log carries its hashes (CAS-11, CAS-12, CAS-13)', async () => {
    const { practice, caseId } = await cas08Case('BUILDER EXPORT');
    const second = await person(practice, 'billing_manager');
    const viewer = await person(practice, 'viewer');
    const P = { practiceId: practice.practiceId };
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: '', useDraft: 'on', promptPayState: 'ZZ' }));
    const page = ok(await call(packetPage, practice.manager, { ...P, caseId }));
    const version = page.builder.version;
    expect(version?.content.interest).toMatchObject({ state: 'ZZ' });
    // On screen the identifiers are placeholders; the canonical ones are nowhere in the page.
    const text = JSON.stringify(page);
    for (const identifier of ['SYNCCNCAS080001', 'SYNPCNCAS08001', 'SYNMBR80014496', 'SYNTHLASTSBGCDE']) {
      expect(text).not.toContain(identifier);
    }
    expect(version?.content.lines[0]?.claim_control_number).toBe('{{claim_control_number:1}}');
    expect(refused(await call(exportPacketAction, practice.manager, P, { caseId, versionId: version?.id ?? '' }))).toBe('an export prints the packet’s current version once it is approved');
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: version?.id ?? '', versionSha256: version?.contentSha256 ?? '' }));
    expect((await call(exportPacketAction, viewer, P, { caseId, versionId: version?.id ?? '' })).status).toBe('forbidden');
    const queuedBefore = queue.jobs.length;
    expect(ok(await call(exportPacketAction, practice.manager, P, { caseId, versionId: version?.id ?? '' })).redirect).toMatch(/notice=export_requested$/);
    expect(queue.jobs.slice(queuedBefore)).toEqual([{ type: 'packet_export', payload: { practice_id: practice.practiceId, packet_version_id: version?.id } }]);
    await runExport(practice, version?.id ?? '');
    expect(ok(await call(exportPacketAction, practice.manager, P, { caseId, versionId: version?.id ?? '' })).redirect).toMatch(/notice=exported$/);
    const exported = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version;
    expect(exported?.exportSha256).toMatch(/^[0-9a-f]{64}$/);

    // The files hold the identifiers, checked against their SHA-256; downloading them is a logged line-level export.
    const pdf = ok<Download<Uint8Array<ArrayBuffer>>>(await call(packetPdf, practice.manager, { ...P, caseId, versionId: version?.id ?? '' }));
    expect(createHash('sha256').update(pdf.download.body).digest('hex')).toBe(exported?.exportSha256);
    expect(pdf.download.filename).toBe(`packet-${version?.id ?? ''}.pdf`);
    const csv = ok<Download<Uint8Array<ArrayBuffer>>>(await call(packetCsv, practice.manager, { ...P, caseId, versionId: version?.id ?? '' }));
    expect(createHash('sha256').update(csv.download.body).digest('hex')).toBe(exported?.exportCsvSha256);
    expect(Buffer.from(csv.download.body).toString('utf8')).toContain('SYNCCNCAS080001');
    expect((await call(packetCsv, viewer, { ...P, caseId, versionId: version?.id ?? '' })).status).toBe('forbidden');
    const { rows: downloads } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE practice_id = $1 AND action = 'packet_export_downloaded' AND purpose = 'line_export'", [practice.practiceId]),
    );
    expect(downloads[0]?.n).toBe(2);

    // The submission log carries the export's SHA-256 (CAS-12); the same submission again logs nothing.
    const submittable = ok(await call(submissionsPage, practice.manager, { ...P, caseId })).submittable;
    expect(submittable).toMatchObject({ versionId: version?.id, exportSha256: exported?.exportSha256, exportCsvSha256: exported?.exportCsvSha256 });
    const submission = { caseId, versionId: version?.id ?? '', submittedOn: today(), channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-9', followUpOn: '' };
    ok(await call(logSubmissionAction, practice.manager, P, submission));
    ok(await call(logSubmissionAction, practice.manager, P, submission));
    expect((await call(logSubmissionAction, viewer, P, submission)).status).toBe('forbidden');
    const log = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(log.submissions.map((item) => [item.exportSha256, item.exportCsvSha256, item.followUpOn, item.followUp, item.reference])).toEqual([
      [exported?.exportSha256, exported?.exportCsvSha256, addDays(today(), 45), 'waiting', 'SYNTHETIC-PORTAL-REF-9'],
    ]);
    // The reference is for the roles that read PHI.
    expect(ok(await call(submissionsPage, viewer, { ...P, caseId })).submissions[0]?.reference).toBeNull();
    const detail = ok(await call(casePage, practice.manager, { ...P, caseId }));
    expect(detail.case.state).toBe('submitted');
    expect(detail.timeline.map((event) => event.kind)).toEqual(expect.arrayContaining(['version_written', 'version_approved', 'version_exported', 'submitted']));

    // CAS-13: an edit after approval is a new version, which clears the approval.
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: version?.id ?? '', useDraft: 'on' }));
    const edited = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder;
    expect(edited.version).toMatchObject({ versionNo: 2, exportSha256: null });
    expect(edited.approval).toEqual({ status: 'drafter' });
  });

  it('makes the only approver of a single-user practice wait 24 hours, shown with its countdown, then approve alone with the audit flag (CAS-10)', async () => {
    const { practice, caseId } = await cas08Case('BUILDER SINGLE USER');
    const P = { practiceId: practice.practiceId };
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: '', useDraft: 'on' }));
    const waiting = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder;
    expect(waiting.approval).toMatchObject({ status: 'waiting' });
    const remaining = waiting.approval?.status === 'waiting' ? waiting.approval.remainingMs : 0;
    expect(remaining).toBeGreaterThan(23 * 3_600_000);
    expect(remaining).toBeLessThanOrEqual(24 * 3_600_000);
    expect(refused(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: waiting.version?.id ?? '', versionSha256: waiting.version?.contentSha256 ?? '' }))).toBe(
      'with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written',
    );
    // A day later (the version's writing moved back, as only a superuser with triggers off can).
    await superuser('UPDATE packet_version SET created_at = created_at - interval \'25 hours\' WHERE id = $1', [waiting.version?.id]);
    expect(ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.approval).toEqual({ status: 'ready', alone: true });
    ok(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: waiting.version?.id ?? '', versionSha256: waiting.version?.contentSha256 ?? '' }));
    const approved = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder;
    expect(approved.approval).toMatchObject({ status: 'approved', alone: true });
    expect(approved.versions[0]).toMatchObject({ approvedAlone: true });
    const timeline = ok(await call(casePage, practice.manager, { ...P, caseId })).timeline;
    expect(timeline.find((event) => event.kind === 'version_approved')).toMatchObject({ approvedAlone: true });
  });
});

describe('submissions and responses (CAS-14, J10)', () => {
  it('records responses with their documents, reopens a denial only with its window, and surfaces an overdue follow-up on the dashboard', async () => {
    const { practice, caseId } = await cas08Case('SUBMISSIONS');
    const second = await person(practice, 'billing_manager');
    const P = { practiceId: practice.practiceId };
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: '', useDraft: 'on' }));
    const version = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version;
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: version?.id ?? '', versionSha256: version?.contentSha256 ?? '' }));
    await runExport(practice, version?.id ?? '');
    const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ id: string }>(
        `INSERT INTO source_document (practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
         VALUES ($1, 'payer_letter', $2, 100, 'application/pdf', $3, 'clean', now(), 'stored') RETURNING id`,
        [practice.practiceId, createHash('sha256').update(`letter ${practice.practiceId}`).digest('hex'), practice.manager],
      ),
    );
    const documentId = (rows[0] as { id: string }).id;
    ok(await call(logSubmissionAction, practice.manager, P, { caseId, versionId: version?.id ?? '', submittedOn: today(), channel: 'fax', reference: '', followUpOn: '' }));
    const page = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(page.documents.map((document) => document.id)).toEqual([documentId]);
    const submissionId = page.submissions[0]?.submissionId ?? '';
    const response = (input: Record<string, unknown>) => call(recordResponseAction, practice.manager, P, { caseId, submissionId, documentId, receivedOn: today(), ...input });

    expect(ok(await call(practiceHome, practice.manager, P)).dashboard.followUps).toEqual({ due: 0, earliest: null, first: [] });
    expect(refused(await response({ kind: 'accepted' }))).toBe('what the payer accepted, in dollars and cents');
    expect(refused(await response({ kind: 'info_requested', amount: '10.00' }))).toBe('only an accepted or partial response states an amount');
    expect(refused(await response({ kind: 'denied', reopensCase: 'on' }))).toBe('a denial reopens the case for the next level only with its reason');
    // The contract states no appeal levels, so no next window is known and the denial cannot reopen the case.
    expect(refused(await response({ kind: 'denied', denialCategory: 'bundling', reopensCase: 'on' }))).toBe('no next dispute window is known for this case, so the denial cannot reopen it');

    // More information requested: the case awaits a response; the second submission follows up today, so it is due now.
    ok(await response({ kind: 'info_requested', notes: 'SYNTHETIC: the payer wants the exhibit' }));
    ok(await response({ kind: 'info_requested', notes: '' }));
    expect(ok(await call(casePage, practice.manager, { ...P, caseId })).case.state).toBe('awaiting_response');
    ok(await call(logSubmissionAction, practice.manager, P, { caseId, versionId: version?.id ?? '', submittedOn: today(), channel: 'payer_portal', reference: '', followUpOn: today() }));
    const due = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(due.submissions.map((item) => [item.channel, item.followUp, item.responses.map((answer) => answer.kind)])).toEqual([
      ['payer_portal', 'due', []],
      ['fax', 'answered', ['info_requested']],
    ]);
    expect(ok(await call(practiceHome, practice.manager, P)).dashboard.followUps).toEqual({ due: 1, earliest: today(), first: [{ caseId, followUpOn: today() }] });
    expect(ok(await call(casePage, practice.manager, { ...P, caseId })).dispute.latestSubmission).toMatchObject({ followUpDue: true });

    // Accepted, with its amount: the case resolves; nothing reaches the ledger from a response (LED-01).
    const latest = due.submissions[0]?.submissionId ?? '';
    ok(await call(recordResponseAction, practice.manager, P, { caseId, submissionId: latest, documentId, receivedOn: today(), kind: 'accepted', amount: '90.00' }));
    const resolved = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(resolved.submissions[0]?.responses.map((answer) => [answer.kind, answer.amountCents])).toEqual([['accepted', '9000']]);
    expect(resolved.case.state).toBe('resolved');
    expect(ok(await call(practiceHome, practice.manager, P)).dashboard.followUps.due).toBe(0);
    const { rows: entries } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ n: number }>('SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1', [practice.practiceId]));
    expect(entries[0]?.n).toBe(0);
  });
});

describe('the workbench in another practice', () => {
  it('finds nothing of this practice through its own routes', async () => {
    const { practice, caseId } = await cas08Case('WORKBENCH TENANT A');
    const other = await w.practice('WORKBENCH TENANT B');
    const A = { practiceId: practice.practiceId };
    expect((await call(casePage, other.manager, { ...A, caseId })).status).toBe('not_found');
    expect((await call(packetPage, other.manager, { practiceId: other.practiceId, caseId })).status).toBe('not_found');
    expect((await call(submissionsPage, other.manager, { practiceId: other.practiceId, caseId })).status).toBe('not_found');
    const outcome: Outcome<MutationResult> = await call(addNoteAction, other.manager, { practiceId: other.practiceId }, { caseId, text: 'SYNTHETIC' });
    expect(outcome.status).toBe('not_found');
    const { rows } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ n: number }>('SELECT count(*)::int AS n FROM case_activity WHERE case_id = $1', [caseId]));
    expect(rows[0]?.n).toBe(0);
    await withPracticeScope(w.app, { actorId: other.manager, practiceIds: [other.practiceId] }, async (scope) => {
      expect((await scope.client.query('SELECT 1 FROM practice_people_emails($1, $2::uuid[])', [practice.practiceId, [practice.manager]])).rowCount).toBe(0);
      expect((await scope.client.query('SELECT 1 FROM practice_case_workers($1)', [practice.practiceId])).rowCount).toBe(0);
    });
  });
});
