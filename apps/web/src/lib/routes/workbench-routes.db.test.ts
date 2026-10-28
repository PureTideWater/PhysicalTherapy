import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type DatabaseClient, databaseClient, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { WORDS_VERSION, packetReference } from '@tp/packets';
import { EXPORT_NOT_DOWNLOADED } from '@tp/worker/packets';
import { packetExportHandler } from '@tp/worker/runtime';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import { downloadHandler } from '../http/handler';
import type { CookieJar, Download, MutationResult, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import {
  approvePacketVersionAction,
  attestPacketExportAction,
  exportPacketAction,
  packetCsv,
  packetPage,
  packetPdf,
  packetReviewPage,
  packetReviewsPage,
  requestApprovalAction,
  reviewPacketCsv,
  reviewPacketPdf,
  writeVersionAction,
} from './packets';
import { abstractionPage, amendVersionAction, startAbstraction, supersedeVersionAction } from './abstraction';
import { contractsPage, tagContractDocument } from './contracts';
import { REFUSED_FIELD, refusalState } from '../cases/refusals';
import { writeOffReasonsFor } from '../cases/write-off';
import { listContractDocuments } from '../contracts/contract-queries';
import { EXPORT_REFUSAL_TEXT } from '../packets/export-attempts';
import { PACKET_CHECKLIST } from '../packets/review';
import { practiceHome } from './practice';
import { logSubmissionAction, recordResponseAction, submissionsPage } from './submissions';
import { casePage, casesPage, writeOffLineAction } from './triage';
import { addNoteAction, assignCaseAction, openCaseAction, setMaterialityAction } from './workbench';
import { csrfTokenFor } from '../http/csrf';

/**
 * The case workbench, the packet builder and the submissions screens through their routes against
 * PostgreSQL (PRD 5, J8 to J10; PRD 7, Cases, Packet builder, Submissions and responses; PRD 12; test
 * matrix CAS-03 to CAS-15 and CAS-45 to CAS-48; docs/adr/0041, 0044 and 0085). Each practice loads
 * SYNTHETIC CAS fixtures through the parse_835 job, signs off a fixed schedule (97110 at 50.00 per unit),
 * prices the month with the price job and triages it; then its people work it through the screens' routes,
 * and the export job's own code prints the packets (with a stand-in printer where Chromium is not
 * installed). Its window is the contract's own 3,650 days, cited and verified (D17), so the deadline is
 * verified and the export allowed; a reimbursement reviewer under a support grant attests the export before
 * it is submitted (D16). A choice that records a fact is refused empty, and a write-off reason the line's
 * own window contradicts is refused; a response's letter is one a response may carry, never a contract's
 * document, under the document's lock (ADR 0085).
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
/** The internal users of the tests (the reviewers): they sign in with a hardware key. */
const internalUsers = new Set<string>();
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(w.app, { userId, method: internalUsers.has(userId) ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, requestKey: string = randomUUID()): Promise<Outcome<R>> {
  return route.invoke({ cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey, ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null }, services);
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

/** A reimbursement reviewer of the internal organization under a four-hour support grant on the practice (D16). */
async function reviewerOf(target: Practice): Promise<string> {
  const internal = await createOrganization(w.owner, 'internal', `review ${randomUUID().slice(0, 8)}`);
  const id = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, id, 'reviewer');
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'RV-ROUTES', 'SYNTHETIC PACKET REVIEW', now() + interval '4 hours')`, [target.practiceId, id]),
  );
  internalUsers.add(id);
  return id;
}

/** The reviewer downloads both files through the review's routes and attests the version's export there, over the SHA-256 the review shows. */
async function attestThroughRoutes(target: Practice, reviewer: string, caseId: string, versionId: string): Promise<void> {
  ok(await call(reviewPacketPdf, reviewer, { practiceId: target.practiceId, caseId, versionId }));
  ok(await call(reviewPacketCsv, reviewer, { practiceId: target.practiceId, caseId, versionId }));
  const review = ok(await call(packetReviewPage, reviewer, { practiceId: target.practiceId, caseId, versionId })).review;
  ok(
    await call(attestPacketExportAction, reviewer, { practiceId: target.practiceId }, {
      caseId,
      versionId,
      pdfSha256: review.exportSha256 ?? '',
      csvSha256: review.exportCsvSha256 ?? '',
      ...Object.fromEntries(PACKET_CHECKLIST.map((item) => [`confirm_${item.id}`, 'on'])),
    }),
  );
}

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
    { practice_id: target.practiceId, packet_version_id: versionId, words_version: WORDS_VERSION },
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

/** A contract specialist of the internal organization under a four-hour support grant on the practice, as the abstraction queue is worked. */
async function specialistOf(target: Practice): Promise<string> {
  const internal = await createOrganization(w.owner, 'internal', `abstraction ${randomUUID().slice(0, 8)}`);
  const id = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, id, 'contract_specialist');
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'AB-ROUTES', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')`, [target.practiceId, id]),
  );
  internalUsers.add(id);
  return id;
}

/**
 * A document row of the practice as intake leaves it, uploaded by its manager: a clean, stored, top-level payer letter
 * unless told otherwise. Only the row: nothing here reads a document's bytes.
 */
async function documentOf(
  target: Practice,
  fields: { readonly kind?: string; readonly scan?: 'pending' | 'clean'; readonly status?: string; readonly contentType?: string; readonly parentId?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const scan = fields.scan ?? 'clean';
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status, parent_document_id)
       VALUES ($1, $2, $3, $4, 100, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        target.practiceId,
        fields.kind ?? 'payer_letter',
        createHash('sha256').update(`document ${id}`).digest('hex'),
        fields.contentType ?? 'application/pdf',
        target.manager,
        scan,
        scan === 'pending' ? null : new Date(),
        fields.status ?? 'stored',
        fields.parentId ?? null,
      ],
    ),
  );
  return id;
}

/** Writes the case's packet, has a second billing manager approve it, exports it, has a reviewer attest it and logs its submission by fax: the case awaits the payer's answer. */
async function submitted(practice: Practice, caseId: string): Promise<{ readonly versionId: string; readonly submissionId: string }> {
  const P = { practiceId: practice.practiceId };
  const second = await person(practice, 'billing_manager');
  ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: '', useDraft: 'on' }));
  const version = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version;
  const versionId = version?.id ?? '';
  ok(await call(approvePacketVersionAction, second, P, { caseId, versionId, versionSha256: version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }));
  await runExport(practice, versionId);
  await attestThroughRoutes(practice, await reviewerOf(practice), caseId, versionId);
  ok(await call(logSubmissionAction, practice.manager, P, { caseId, versionId, submittedOn: today(), channel: 'fax', reference: '', followUpOn: '' }));
  const page = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
  return { versionId, submissionId: page.submissions[0]?.submissionId ?? '' };
}

/** A CAS-08 case, submitted, with a SYNTHETIC payer letter on file that no response names yet. */
async function submittedCase(label: string): Promise<{ readonly practice: Practice; readonly caseId: string; readonly versionId: string; readonly submissionId: string; readonly letterId: string }> {
  const { practice, caseId } = await cas08Case(label);
  const letterId = await documentOf(practice);
  return { practice, caseId, letterId, ...(await submitted(practice, caseId)) };
}

/** The refusal of a letter a response may not carry: one sentence, whatever the document is (docs/adr/0085, D4). */
const LETTER_REFUSED = { status: 'invalid', issues: [{ field: 'documentId', message: 'choose the payer’s letter from the list, or upload it here' }] };

/** The refusal of a response's letter as a contract's document, by the tag, amendment and correction handlers (D4). */
const REFUSED_AS_SOURCE = {
  status: 'invalid',
  issues: [{ field: 'documentId', message: 'a payer’s answer to a dispute stays with its case’s response and is not a contract’s document; choose the contract, exhibit or payer’s terms letter instead' }],
};

/** The lock every handler that makes a document a response's evidence or a contract's source takes first (D4). */
const DOCUMENT_USE_LOCK = "SELECT pg_advisory_xact_lock(hashtextextended('document_use:' || $1::text, 0))";

/**
 * Runs `work` as the owner on a connection of its own, in `actorId`'s name, and keeps its transaction open until
 * `commit()`: another tab's work, done but not yet committed. `ready` settles once `work` has run (or rejects with its
 * error).
 */
function held(client: DatabaseClient, target: Practice, actorId: string, work: () => Promise<void>): { readonly ready: Promise<void>; readonly commit: () => Promise<void> } {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let done = (): void => undefined;
  const ran = new Promise<void>((resolve) => {
    done = resolve;
  });
  const transaction = asOwner(
    client,
    [target.practiceId],
    async () => {
      await work();
      done();
      await released;
    },
    actorId,
  );
  return {
    ready: Promise.race([ran, transaction]),
    commit: async () => {
      release();
      await transaction;
    },
  };
}

/**
 * Waits until a transaction asks for the document's lock and is not granted it (pg_locks: one bigint key is classid,
 * its high half, and objid, its low half, with objsubid 1), so the handler is blocked before its check.
 */
async function waitingOn(documentId: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const { rows } = await w.owner.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_locks l, (SELECT hashtextextended('document_use:' || $1::text, 0) AS key) k
        WHERE l.locktype = 'advisory' AND NOT l.granted AND l.objsubid = 1
          AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND l.classid = ((k.key >> 32) & 4294967295)::oid AND l.objid = (k.key & 4294967295)::oid`,
      [documentId],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error('no transaction waited for the document’s lock');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
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
    // A refusal of the whole form, which it says as its sentence, not a problem of the pattern's hidden fields.
    const below = await call(openCaseAction, practice.manager, P, pattern);
    expect(below).toEqual({
      status: 'invalid',
      issues: [{ field: REFUSED_FIELD, message: 'its actionable lines total $60.00, below the case materiality of $250.00, so it keeps accumulating; lower the case materiality to open it' }],
    });
    expect(refusalState({ error: 'Fix the fields listed here, then try again.', invalid: true, issues: below.status === 'invalid' ? below.issues : [] })).toEqual({
      error: 'Refused: its actionable lines total $60.00, below the case materiality of $250.00, so it keeps accumulating; lower the case materiality to open it.',
    });
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

  it('offers and accepts “Window passed” only once a line’s window has ended, and refuses a write-off with no reason (CAS-45)', async () => {
    const writeOff = (target: Practice, caseLineId: string, reason: string) => call(writeOffLineAction, target.manager, { practiceId: target.practiceId }, { caseLineId, reason, text: '', confirm: 'on' });
    const writtenOff = async (target: Practice, caseLineId: string) =>
      (
        await asOwner(w.owner, [target.practiceId], () =>
          w.owner.query<{ reason: string | null; by: string | null; events: number }>(
            `SELECT cl.written_off_reason AS reason, cl.written_off_by AS by,
                    (SELECT count(*)::int FROM audit_event a WHERE a.practice_id = cl.practice_id AND a.action = 'case_line_written_off' AND a.object_id = cl.id) AS events
               FROM case_line cl WHERE cl.id = $1`,
            [caseLineId],
          ),
        )
      ).rows[0];

    // As in the WINDOW test, a 30-day window judged on a day inside it opens the case; but no triage has run since, so
    // its lines are still actionable though their windows have ended: "Window passed" is offered, and recorded in the
    // manager's name.
    const ended = await w.practice('WRITE-OFF CAS-45 ENDED', { case_materiality_cents: '1000' });
    await w.load(ended, 'CAS-08/remit.835');
    const contract = await w.fixedContract(ended, { ...FIXED, disputeWindowDays: 30 });
    const runId = await w.pricedRun(ended, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    await w.triage(ended, runId, '2026-03-20');
    const E = { practiceId: ended.practiceId };
    const [endedCase] = ok(await call(casesPage, ended.manager, E)).cases;
    const endedLines = ok(await call(casePage, ended.manager, { ...E, caseId: endedCase?.id ?? '' })).detail.lines;
    expect(endedLines.map((line) => [line.actionable, line.windowPassed, line.writtenOffReason])).toEqual([
      [true, true, null],
      [true, true, null],
      [true, true, null],
    ]);
    const [passed] = endedLines;
    expect(passed === undefined ? [] : writeOffReasonsFor(passed)).toContain('window_passed');
    ok(await writeOff(ended, passed?.id ?? '', 'window_passed'));
    expect(await writtenOff(ended, passed?.id ?? '')).toEqual({ reason: 'window_passed', by: ended.manager, events: 1 });

    // A CAS-08 case triaged today: its windows are open for ten years, so "Window passed" is neither offered nor
    // accepted. It is refused on Reason with the rule, never a date, and nothing is written.
    const { practice, caseId } = await cas08Case('WRITE-OFF CAS-45 OPEN');
    const P = { practiceId: practice.practiceId };
    const [open] = ok(await call(casePage, practice.manager, { ...P, caseId })).detail.lines;
    expect([open?.actionable, open?.windowPassed]).toEqual([true, false]);
    expect(open === undefined ? [] : writeOffReasonsFor(open)).not.toContain('window_passed');
    expect(await writeOff(practice, open?.id ?? '', 'window_passed')).toEqual({
      status: 'invalid',
      issues: [{ field: 'reason', message: 'a line whose dispute window is still open is not written off as “Window passed”; choose the reason that applies' }],
    });
    // A post that left Reason on its empty first option is refused on Reason, with what to choose.
    expect(await writeOff(practice, open?.id ?? '', '')).toEqual({ status: 'invalid', issues: [{ field: 'reason', message: 'choose the reason' }] });
    expect(await writtenOff(practice, open?.id ?? '')).toEqual({ reason: null, by: null, events: 0 });
    const after = ok(await call(casePage, practice.manager, { ...P, caseId }));
    expect(after.detail.lines.find((line) => line.id === open?.id)).toMatchObject({ actionable: true, writtenOffReason: null });
    expect(after.timeline.filter((event) => event.kind === 'written_off')).toEqual([]);
    // A judgment the records do not decide is the person's, on any line.
    ok(await writeOff(practice, open?.id ?? '', 'not_worth_pursuit'));
    expect(await writtenOff(practice, open?.id ?? '')).toEqual({ reason: 'not_worth_pursuit', by: practice.manager, events: 1 });
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
    expect(refused(await call(approvePacketVersionAction, second, P, { caseId, versionId: failing.version?.id ?? '', versionSha256: failing.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }))).toBe('a packet version the verifier failed cannot be approved');
    // A stale edit (based on version 1) is refused.
    expect(refused(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: first.version?.id ?? '', narrative: 'The payer paid 97110 short [1].' }))).toBe('another version of the packet was written since this one was opened');

    // Version 3, the code-built draft again, by the packet's drafter: the drafter cannot approve it (CAS-09).
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: failing.version?.id ?? '', useDraft: 'on' }));
    const third = (await builder(practice.manager)).builder;
    expect(third.version).toMatchObject({ versionNo: 3, verifier: { passed: true } });
    expect(third.approval).toEqual({ status: 'drafter' });
    expect(refused(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }))).toBe('the person who drafted or last edited a packet cannot approve it');
    expect((await call(approvePacketVersionAction, analyst, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION })).status).toBe('forbidden');

    // A request for approval, then the second person approves (once; again does nothing).
    ok(await call(requestApprovalAction, analyst, P, { caseId, versionId: third.version?.id ?? '', message: 'SYNTHETIC: ready for you' }));
    ok(await call(requestApprovalAction, analyst, P, { caseId, versionId: third.version?.id ?? '', message: '' }));
    expect((await builder(second)).builder.approvalRequest).toMatchObject({ message: 'SYNTHETIC: ready for you' });
    expect(refused(await call(approvePacketVersionAction, second, P, { caseId, versionId: third.version?.id ?? '', versionSha256: 'a'.repeat(64), wordsVersion: WORDS_VERSION }))).toBe('an approval names the hash of the version it approves');
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }));
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: third.version?.id ?? '', versionSha256: third.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }));
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
    // Refused at once, before anything is queued, with the reason and its fix (audit item #26).
    expect(refused(await call(exportPacketAction, practice.manager, P, { caseId, versionId: version?.id ?? '', wordsVersion: WORDS_VERSION }))).toBe(EXPORT_REFUSAL_TEXT.not_approved);
    ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: version?.id ?? '', versionSha256: version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }));
    expect((await call(exportPacketAction, viewer, P, { caseId, versionId: version?.id ?? '', wordsVersion: WORDS_VERSION })).status).toBe('forbidden');
    const queuedBefore = queue.jobs.length;
    expect(ok(await call(exportPacketAction, practice.manager, P, { caseId, versionId: version?.id ?? '', wordsVersion: WORDS_VERSION })).redirect).toMatch(/notice=export_requested$/);
    expect(queue.jobs.slice(queuedBefore)).toEqual([{ type: 'packet_export', payload: { practice_id: practice.practiceId, packet_version_id: version?.id, words_version: WORDS_VERSION } }]);
    await runExport(practice, version?.id ?? '');
    expect(ok(await call(exportPacketAction, practice.manager, P, { caseId, versionId: version?.id ?? '', wordsVersion: WORDS_VERSION })).redirect).toMatch(/notice=exported$/);
    const exported = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version;
    expect(exported?.exportSha256).toMatch(/^[0-9a-f]{64}$/);

    // The files hold the identifiers, checked against their SHA-256; downloading them is a logged line-level export.
    const pdf = ok<Download<Uint8Array<ArrayBuffer>>>(await call(packetPdf, practice.manager, { ...P, caseId, versionId: version?.id ?? '' }));
    expect(createHash('sha256').update(pdf.download.body).digest('hex')).toBe(exported?.exportSha256);
    // W2 (audit item #37 part 1, D8): the files are named by the packet's reference, never a record ID.
    const reference = packetReference(exported?.contentSha256 ?? '');
    expect(exported?.reference).toBe(reference);
    expect(pdf.download.filename).toBe(`payment-dispute-${reference}.pdf`);
    const csv = ok<Download<Uint8Array<ArrayBuffer>>>(await call(packetCsv, practice.manager, { ...P, caseId, versionId: version?.id ?? '' }));
    expect(csv.download.filename).toBe(`payment-dispute-${reference}-schedule.csv`);
    for (const name of [pdf.download.filename, csv.download.filename]) {
      expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    }
    expect(createHash('sha256').update(csv.download.body).digest('hex')).toBe(exported?.exportCsvSha256);
    expect(Buffer.from(csv.download.body).toString('utf8')).toContain('SYNCCNCAS080001');
    expect((await call(packetCsv, viewer, { ...P, caseId, versionId: version?.id ?? '' })).status).toBe('forbidden');
    const { rows: downloads } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ action: string; actor_id: string }>("SELECT action, actor_id FROM audit_event WHERE practice_id = $1 AND action LIKE 'packet_export_%downloaded' AND purpose = 'line_export' ORDER BY action", [practice.practiceId]),
    );
    // Each file's download is its own event, in the downloader's name (docs/adr/0061).
    expect(downloads).toEqual([
      { action: 'packet_export_csv_downloaded', actor_id: practice.manager },
      { action: 'packet_export_pdf_downloaded', actor_id: practice.manager },
    ]);

    // The builder shows each line's deadline, verified from the contract's cited window, and the export's verifier report (CO-05).
    expect(exported?.deadlineNow).toBe('verified');
    expect(exported?.content.format === 'tp-packet/2' ? exported.content.deadline : null).toMatchObject({ basis: 'line_windows', status: 'verified', lines_verified: 3, lines: 3, causes: [] });
    expect(exported?.exportVerifier).toMatchObject({ format: 'tp-packet-verifier/2', passed: true });
    expect(exported?.attestation).toBeNull();

    // D16: the submission waits for the reimbursement reviewer's attestation over the export's SHA-256.
    const submittable = ok(await call(submissionsPage, practice.manager, { ...P, caseId })).submittable;
    expect(submittable).toMatchObject({ versionId: version?.id, exportSha256: exported?.exportSha256, exportCsvSha256: exported?.exportCsvSha256, attestedAt: null });
    const submission = { caseId, versionId: version?.id ?? '', submittedOn: today(), channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-9', followUpOn: '' };
    expect(refused(await call(logSubmissionAction, practice.manager, P, submission))).toBe('a packet is submitted once a reimbursement reviewer has attested its export');
    const reviewer = await reviewerOf(practice);
    const reviewParams = { ...P, caseId, versionId: version?.id ?? '' };
    // The billing managers do not attest, nor open the reviewer's pages; the reviewer does.
    expect((await call(packetReviewPage, practice.manager, reviewParams)).status).toBe('forbidden');
    expect((await call(reviewPacketCsv, second, reviewParams)).status).toBe('forbidden');
    const confirmations = Object.fromEntries(PACKET_CHECKLIST.map((item) => [`confirm_${item.id}`, 'on']));
    expect((await call(attestPacketExportAction, second, P, { caseId, versionId: version?.id ?? '', pdfSha256: exported?.exportSha256 ?? '', csvSha256: exported?.exportCsvSha256 ?? '', ...confirmations })).status).toBe('forbidden');
    expect(ok(await call(packetReviewsPage, reviewer, P)).awaiting.map((item) => item.versionId)).toEqual([version?.id]);
    const review = ok(await call(packetReviewPage, reviewer, reviewParams)).review;
    expect(review).toMatchObject({ exportSha256: exported?.exportSha256, exportCsvSha256: exported?.exportCsvSha256, deadlineNow: 'verified', attestation: null, viewerTookPart: false });
    // W4 (audit item #37 part 1): what the payer's copy no longer prints is on the review: the approval's people and time,
    // the audit flag, the regulation's confirmation, the evidence with its SHA-256 and gaps, the releases' manifests, the
    // version's SHA-256 and its reference, and the contact the practice has set now.
    expect(review).toMatchObject({
      writtenBy: expect.stringContaining('@'),
      approvedBy: expect.stringContaining('@'),
      approvedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      approvedAlone: false,
      regulationConfirmation: null,
      contentSha256: exported?.contentSha256,
      reference,
      contactNow: { state: 'set', text: expect.stringContaining('SYNTHETIC BILLING OFFICE') },
    });
    expect(review.content.evidence.every((item) => item.kind === 'rule_release' ? /^[0-9a-f]{64}$/.test(item.sha256 ?? '') : true)).toBe(true);
    expect(review.content.rule_releases.map((release) => release.manifest_sha256)).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/)]);
    expect(review.content.evidence_gaps).toEqual(expect.any(Array));
    // The billing manager's downloads are not the reviewer's: the attest route refuses until the reviewer has downloaded both files (docs/adr/0061).
    expect(review.viewerDownloaded).toEqual({ pdf: false, csv: false });
    const attestNow = async () => call(attestPacketExportAction, reviewer, P, { caseId, versionId: version?.id ?? '', pdfSha256: exported?.exportSha256 ?? '', csvSha256: exported?.exportCsvSha256 ?? '', ...confirmations });
    expect(refused(await attestNow())).toBe(EXPORT_NOT_DOWNLOADED);
    // A HEAD in the reviewer's own session (Next answers it with the route's GET handler) sends no bytes, so it records
    // no download: the download handler refuses it before the route runs, and the attestation is still refused.
    const throughHandler = async (route: typeof reviewPacketPdf, method: 'GET' | 'HEAD') =>
      downloadHandler(route, () => services)(
        new Request(`http://localhost:3100/p/${practice.practiceId}/cases/${caseId}/packet/${version?.id ?? ''}/review/file`, {
          method,
          headers: { cookie: `${SESSION_COOKIE}=${await sessionOf(reviewer)}` },
        }),
        { params: Promise.resolve(reviewParams) },
      );
    const reviewerDownloads = async () =>
      (
        await asOwner(w.owner, [practice.practiceId], () =>
          w.owner.query<{ action: string }>("SELECT action FROM audit_event WHERE object_id = $1 AND actor_id = $2 AND action LIKE 'packet_export_%downloaded' ORDER BY action", [version?.id, reviewer]),
        )
      ).rows.map((row) => row.action);
    for (const route of [reviewPacketPdf, reviewPacketCsv]) {
      const head = await throughHandler(route, 'HEAD');
      expect(head.status).toBe(405);
      expect(head.headers.get('allow')).toBe('GET');
    }
    expect(await reviewerDownloads()).toEqual([]);
    expect(ok(await call(packetReviewPage, reviewer, reviewParams)).review.viewerDownloaded).toEqual({ pdf: false, csv: false });
    expect(refused(await attestNow())).toBe(EXPORT_NOT_DOWNLOADED);
    // The same handler, on a GET in the same session, sends the PDF's bytes and records their download.
    const served = await throughHandler(reviewPacketPdf, 'GET');
    expect(served.status).toBe(200);
    expect(createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex')).toBe(exported?.exportSha256);
    expect(await reviewerDownloads()).toEqual(['packet_export_pdf_downloaded']);
    const reviewedPdf = ok<Download<Uint8Array<ArrayBuffer>>>(await call(reviewPacketPdf, reviewer, reviewParams));
    expect(createHash('sha256').update(reviewedPdf.download.body).digest('hex')).toBe(exported?.exportSha256);
    expect(ok(await call(packetReviewPage, reviewer, reviewParams)).review.viewerDownloaded).toEqual({ pdf: true, csv: false });
    expect(refused(await attestNow())).toBe(EXPORT_NOT_DOWNLOADED);
    const reviewedCsv = ok<Download<Uint8Array<ArrayBuffer>>>(await call(reviewPacketCsv, reviewer, reviewParams));
    expect(createHash('sha256').update(reviewedCsv.download.body).digest('hex')).toBe(exported?.exportCsvSha256);
    expect(ok(await call(packetReviewPage, reviewer, reviewParams)).review.viewerDownloaded).toEqual({ pdf: true, csv: true });
    // Every item is confirmed, over the files the review showed: other files are refused.
    expect((await call(attestPacketExportAction, reviewer, P, { caseId, versionId: version?.id ?? '', pdfSha256: exported?.exportSha256 ?? '', csvSha256: exported?.exportCsvSha256 ?? '' })).status).toBe('invalid');
    // W7 (D10): the server requires each of the seven boxes; a form without any one is refused as invalid input and writes nothing.
    expect(PACKET_CHECKLIST).toHaveLength(7);
    const attestedEvents = async () =>
      (
        await asOwner(w.owner, [practice.practiceId], () =>
          w.owner.query<{ n: number; attested: boolean }>(
            "SELECT (SELECT count(*)::int FROM audit_event WHERE practice_id = $1 AND action = 'packet_export_attested' AND object_id = $2) AS n, (SELECT attested_at IS NOT NULL FROM packet_version WHERE id = $2) AS attested",
            [practice.practiceId, version?.id],
          ),
        )
      ).rows[0];
    for (const item of PACKET_CHECKLIST) {
      const { [`confirm_${item.id}`]: _left, ...others } = confirmations;
      const outcome = await call(attestPacketExportAction, reviewer, P, { caseId, versionId: version?.id ?? '', pdfSha256: exported?.exportSha256 ?? '', csvSha256: exported?.exportCsvSha256 ?? '', ...others });
      expect(outcome.status, item.id).toBe('invalid');
      expect(outcome.status === 'invalid' ? outcome.issues.map((issue) => issue.field) : [], item.id).toEqual([`confirm_${item.id}`]);
      expect(await attestedEvents(), item.id).toEqual({ n: 0, attested: false });
    }
    expect(refused(await call(attestPacketExportAction, reviewer, P, { caseId, versionId: version?.id ?? '', pdfSha256: 'f'.repeat(64), csvSha256: exported?.exportCsvSha256 ?? '', ...confirmations }))).toBe(
      'the files reviewed are not this export’s; open the review again',
    );
    await attestThroughRoutes(practice, reviewer, caseId, version?.id ?? '');
    await attestThroughRoutes(practice, reviewer, caseId, version?.id ?? '');
    expect(ok(await call(packetReviewPage, reviewer, reviewParams)).review.attestation).toMatchObject({ byViewer: true, checklist: PACKET_CHECKLIST.map((item) => item.id) });
    expect(ok(await call(packetReviewsPage, reviewer, P)).awaiting).toEqual([]);
    const { rows: attestations } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE practice_id = $1 AND action = 'packet_export_attested' AND object_id = $2", [practice.practiceId, version?.id]),
    );
    expect(attestations[0]?.n).toBeGreaterThanOrEqual(1);
    expect(ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version?.attestation).toMatchObject({ checklist: PACKET_CHECKLIST.map((item) => item.id) });

    // The submission log carries the export's SHA-256 (CAS-12); the same submission again logs nothing.
    expect(ok(await call(submissionsPage, practice.manager, { ...P, caseId })).submittable?.attestedAt).not.toBeNull();
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
    expect(detail.timeline.map((event) => event.kind)).toEqual(expect.arrayContaining(['version_written', 'version_approved', 'version_exported', 'export_attested', 'submitted']));

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
    expect(refused(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: waiting.version?.id ?? '', versionSha256: waiting.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }))).toBe(
      'with no one else to approve it, a packet is approved by its own writer only 24 hours after the version was written',
    );
    // A day later (the version's writing moved back, as only a superuser with triggers off can).
    await superuser('UPDATE packet_version SET created_at = created_at - interval \'25 hours\' WHERE id = $1', [waiting.version?.id]);
    expect(ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.approval).toEqual({ status: 'ready', alone: true });
    ok(await call(approvePacketVersionAction, practice.manager, P, { caseId, versionId: waiting.version?.id ?? '', versionSha256: waiting.version?.contentSha256 ?? '', wordsVersion: WORDS_VERSION }));
    const approved = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder;
    expect(approved.approval).toMatchObject({ status: 'approved', alone: true });
    expect(approved.versions[0]).toMatchObject({ approvedAlone: true });
    const timeline = ok(await call(casePage, practice.manager, { ...P, caseId })).timeline;
    expect(timeline.find((event) => event.kind === 'version_approved')).toMatchObject({ approvedAlone: true });
  });
});

describe('submissions and responses (CAS-14, J10)', () => {
  it('records responses with their documents, reopens a denial only with its window, and surfaces an overdue follow-up on the dashboard', async () => {
    const { practice, caseId, versionId, letterId: documentId } = await submittedCase('SUBMISSIONS');
    const P = { practiceId: practice.practiceId };
    const page = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    // The letter on file is one no response names yet.
    expect(page.letters.unused.map((document) => document.id)).toEqual([documentId]);
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
    // The letter that answered is now listed among this case's earlier responses' letters, no longer unused (CAS-48).
    expect(ok(await call(submissionsPage, practice.manager, { ...P, caseId })).letters).toMatchObject({ unused: [], thisCase: [{ id: documentId }], otherCases: [] });
    expect(ok(await call(casePage, practice.manager, { ...P, caseId })).case.state).toBe('awaiting_response');
    ok(await call(logSubmissionAction, practice.manager, P, { caseId, versionId, submittedOn: today(), channel: 'payer_portal', reference: '', followUpOn: today() }));
    const due = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(due.submissions.map((item) => [item.channel, item.followUp, item.responses.map((answer) => answer.kind)])).toEqual([
      ['payer_portal', 'due', []],
      ['fax', 'answered', ['info_requested']],
    ]);
    // The log names each response's letter, as its receipt names it (UX-007).
    expect(due.submissions[1]?.responses.map((answer) => [answer.documentId, answer.document?.id, answer.document?.kind])).toEqual([[documentId, documentId, 'payer_letter']]);
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

  it('refuses a response or a submission with nothing chosen (CAS-46)', async () => {
    const { practice, caseId, versionId, submissionId, letterId } = await submittedCase('SUBMISSIONS NOTHING CHOSEN');
    const P = { practiceId: practice.practiceId };
    const response = (input: Record<string, unknown>) => call(recordResponseAction, practice.manager, P, { caseId, submissionId, documentId: letterId, receivedOn: today(), kind: 'info_requested', ...input });
    // A post without JavaScript, or a crafted one, that left a choice on its empty first option is refused on that
    // field, with what to choose.
    expect(await response({ kind: '' })).toEqual({ status: 'invalid', issues: [{ field: 'kind', message: 'choose the payer’s answer' }] });
    expect(await response({ documentId: '' })).toEqual({ status: 'invalid', issues: [{ field: 'documentId', message: 'choose the payer’s letter' }] });
    expect(await call(logSubmissionAction, practice.manager, P, { caseId, versionId, submittedOn: today(), channel: '', reference: '', followUpOn: '' })).toEqual({
      status: 'invalid',
      issues: [{ field: 'channel', message: 'choose the channel' }],
    });
    // Nothing was recorded: the one submission, with no response, and the letter still unused.
    const page = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(page.submissions.map((item) => [item.submissionId, item.channel, item.responses])).toEqual([[submissionId, 'fax', []]]);
    expect(page.letters).toMatchObject({ unused: [{ id: letterId }], thisCase: [], otherCases: [] });
    expect(ok(await call(casePage, practice.manager, { ...P, caseId })).case.state).toBe('submitted');
  });

  it('records a response only with a stored letter a response may carry, and keeps that letter apart from the contract documents (CAS-48)', async () => {
    const { practice, caseId, submissionId, letterId } = await submittedCase('SUBMISSIONS LETTER CHECKS');
    const P = { practiceId: practice.practiceId };
    const specialist = await specialistOf(practice);
    const payerId = await w.pricing.payerOf(practice);
    const ids = (documents: { readonly items: readonly { readonly id: string }[] }) => documents.items.map((document) => document.id);
    const sorted = (values: readonly string[]) => [...values].sort();

    // Documents in each state intake leaves them, and of each kind or place a response may not carry.
    const refusedDocuments = {
      pending: await documentOf(practice, { scan: 'pending', status: 'received' }),
      received: await documentOf(practice, { status: 'received' }),
      duplicate: await documentOf(practice, { status: 'duplicate' }),
      zip: await documentOf(practice, { contentType: 'application/zip', status: 'expanded' }),
      remittance: await documentOf(practice, { kind: 'x12_835', contentType: 'application/edi-x12', status: 'loaded' }),
      elsewhere: await documentOf(await w.practice('SUBMISSIONS LETTER CHECKS ELSEWHERE')),
      tagged: await documentOf(practice),
      missing: randomUUID(),
    };
    const entry = await documentOf(practice, { parentId: refusedDocuments.zip });
    ok(await call(tagContractDocument, practice.manager, P, { documentId: refusedDocuments.tagged, payerId, title: 'SYNTHETIC TERMS LETTER AGREEMENT', effectiveFrom: '2026-01-01' }));
    // A, the payer's answer; T, a payer's terms letter no response names.
    const A = await documentOf(practice);
    const T = await documentOf(practice);

    // Only the stored, top-level letters no contract version names are offered, all of them unused.
    const offered = ok(await call(submissionsPage, practice.manager, { ...P, caseId })).letters;
    expect(sorted(offered.unused.map((document) => document.id))).toEqual(sorted([letterId, A, T]));
    expect([offered.thisCase, offered.otherCases]).toEqual([[], []]);

    // Each other document is refused on the letter with one sentence, the same for a document of another practice as
    // for one that does not exist, and nothing is recorded.
    const respond = (documentId: string) => call(recordResponseAction, practice.manager, P, { caseId, submissionId, documentId, receivedOn: today(), kind: 'info_requested' });
    for (const [what, documentId] of Object.entries({ ...refusedDocuments, entry })) {
      expect(await respond(documentId), what).toEqual(LETTER_REFUSED);
    }
    expect(ok(await call(submissionsPage, practice.manager, { ...P, caseId })).submissions[0]?.responses).toEqual([]);

    // Before any response names A, it waits to be tagged and abstracted like T.
    const lists = () =>
      withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) => ({
        untagged: await listContractDocuments(scope, practice.practiceId, 'untagged', 1, `test-${randomUUID()}`),
        awaiting: await listContractDocuments(scope, practice.practiceId, 'awaiting_abstraction', 1, `test-${randomUUID()}`),
      }));
    const before = await lists();
    expect(ids(before.untagged)).toEqual(expect.arrayContaining([A, T]));
    expect(ids(before.awaiting)).toEqual(expect.arrayContaining([A, T]));

    // A response with A, its ID posted upper-cased as a browser may send it, is recorded naming A.
    ok(await respond(A.toUpperCase()));
    const answered = ok(await call(submissionsPage, practice.manager, { ...P, caseId }));
    expect(answered.submissions[0]?.responses.map((answer) => [answer.kind, answer.documentId])).toEqual([['info_requested', A]]);
    expect(sorted(answered.letters.unused.map((document) => document.id))).toEqual(sorted([letterId, T]));
    expect(answered.letters.thisCase.map((document) => document.id)).toEqual([A]);

    // A leaves Documents to tag and Documents awaiting abstraction; T stays in both, on the Contracts page (the
    // manager) and in the specialist's queue as in the lists, totals agreeing.
    const after = await lists();
    for (const list of [after.untagged, after.awaiting]) {
      expect(ids(list)).toContain(T);
      expect(ids(list)).not.toContain(A);
    }
    expect([after.untagged.total, after.awaiting.total]).toEqual([before.untagged.total - 1, before.awaiting.total - 1]);
    const contracts = ok(await call(contractsPage, practice.manager, P));
    expect([ids(contracts.untagged), contracts.untagged.total]).toEqual([ids(after.untagged), after.untagged.total]);
    const queue = ok(await call(abstractionPage, specialist, P));
    expect([ids(queue.documents), queue.documents.total]).toEqual([ids(after.awaiting), after.awaiting.total]);
    // The Contracts panel's payer letter kind is a payer's terms or policy letter.
    expect(contracts.upload.kinds.map((kind) => [kind.kind, kind.label])).toEqual([
      ['contract', 'Contract'],
      ['exhibit', 'Exhibit'],
      ['payer_letter', 'Payer’s terms or policy letter'],
    ]);

    // Tagging A, by the manager or the specialist, or naming it in an amendment or a correction of the signed-off
    // version, is refused on the document with what to choose instead, and changes nothing.
    const counts = async () =>
      (
        await asOwner(w.owner, [practice.practiceId], () =>
          w.owner.query<{ contracts: number; versions: number; naming: number }>(
            `SELECT (SELECT count(*)::int FROM contract WHERE practice_id = $1) AS contracts,
                    (SELECT count(*)::int FROM contract_version WHERE practice_id = $1) AS versions,
                    (SELECT count(*)::int FROM contract_version WHERE practice_id = $1 AND $2::uuid = ANY (source_document_ids)) AS naming`,
            [practice.practiceId, A],
          ),
        )
      ).rows[0];
    const { rows: signed } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ id: string }>("SELECT id FROM contract_version WHERE practice_id = $1 AND status = 'signed_off'", [practice.practiceId]),
    );
    const signedOff = signed[0]?.id ?? '';
    const unchanged = await counts();
    expect(unchanged?.naming).toBe(0);
    const tag = { documentId: A, payerId, title: 'SYNTHETIC ANSWER AS AN AGREEMENT', effectiveFrom: '2027-01-01' };
    expect(await call(tagContractDocument, practice.manager, P, tag)).toEqual(REFUSED_AS_SOURCE);
    expect(await call(startAbstraction, specialist, P, tag)).toEqual(REFUSED_AS_SOURCE);
    expect(await call(amendVersionAction, specialist, P, { versionId: signedOff, effectiveFrom: '2027-01-01', documentId: A })).toEqual(REFUSED_AS_SOURCE);
    expect(await call(supersedeVersionAction, specialist, P, { versionId: signedOff, documentId: A })).toEqual(REFUSED_AS_SOURCE);
    expect(await counts()).toEqual(unchanged);
    // T, which no response names, is still tagged.
    ok(await call(tagContractDocument, practice.manager, P, { ...tag, documentId: T, title: 'SYNTHETIC TERMS LETTER AGREEMENT' }));
  });

  it('lists another case’s response letter in its own group and still records it (CAS-48)', async () => {
    // CAS-03's two payer patterns open two cases in one practice, each submitted.
    const practice = await w.practice('SUBMISSIONS TWO CASES', { case_materiality_cents: '1000' });
    await w.load(practice, 'CAS-03/remit.835');
    const one = await w.fixedContract(practice, FIXED);
    const two = await w.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }] });
    const runId = await w.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
        { key: 'CE:SYNPLAN-FIX-TWO', versionId: two.versionId },
      ],
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(await w.triage(practice, runId)).toMatchObject({ outcome: 'triaged', summary: { casesOpened: 2 } });
    const P = { practiceId: practice.practiceId };
    const [first = '', second = ''] = ok(await call(casesPage, practice.manager, P)).cases.map((item) => item.id);
    const firstSubmission = (await submitted(practice, first)).submissionId;
    const secondSubmission = (await submitted(practice, second)).submissionId;
    const A = await documentOf(practice);
    const T = await documentOf(practice);
    const letters = async (caseId: string) => {
      const { unused, thisCase, otherCases } = ok(await call(submissionsPage, practice.manager, { ...P, caseId })).letters;
      return [unused, thisCase, otherCases].map((group) => group.map((document) => document.id));
    };
    const respond = (caseId: string, submissionId: string) => call(recordResponseAction, practice.manager, P, { caseId, submissionId, documentId: A, receivedOn: today(), kind: 'info_requested' });

    ok(await respond(first, firstSubmission));
    // The first case lists A among its own responses' letters; the second, last, among other cases', not as unused.
    expect(await letters(first)).toEqual([[T], [A], []]);
    expect(await letters(second)).toEqual([[T], [], [A]]);
    // A payer that answers two cases in one letter: the second case's response with A is recorded too.
    ok(await respond(second, secondSubmission));
    const page = ok(await call(submissionsPage, practice.manager, { ...P, caseId: second }));
    expect(page.submissions[0]?.responses.map((answer) => [answer.kind, answer.documentId])).toEqual([['info_requested', A]]);
    expect(await letters(second)).toEqual([[T], [A], []]);
  });

  it('serializes a tag and a response of the same letter (CAS-48)', async () => {
    const { practice, caseId, submissionId } = await submittedCase('SUBMISSIONS LETTER RACE');
    const P = { practiceId: practice.practiceId };
    const payerId = await w.pricing.payerOf(practice);
    const naming = async (documentId: string) =>
      (
        await asOwner(w.owner, [practice.practiceId], () =>
          w.owner.query<{ responses: number; versions: number }>(
            `SELECT (SELECT count(*)::int FROM payer_response WHERE practice_id = $1 AND document_id = $2) AS responses,
                    (SELECT count(*)::int FROM contract_version WHERE practice_id = $1 AND $2::uuid = ANY (source_document_ids)) AS versions`,
            [practice.practiceId, documentId],
          ),
        )
      ).rows[0];
    const other = databaseClient(w.pricing.database.url);
    await other.connect();
    try {
      // A tag of L in another tab: its transaction holds L's lock and has written a draft version naming L, not yet
      // committed. The response, posted with L upper-cased, takes the lock on L's canonical ID and waits for it (the
      // test sees it wait in pg_locks), so it has not checked L yet; once the tag commits, it checks and is refused.
      // Without the lock it would have checked before the commit and recorded the response.
      const L = await documentOf(practice);
      const tag = held(other, practice, practice.manager, async () => {
        await other.query(DOCUMENT_USE_LOCK, [L]);
        const { rows } = await other.query<{ id: string }>("INSERT INTO contract (practice_id, payer_id, title) VALUES ($1, $2, 'SYNTHETIC TERMS LETTER AGREEMENT') RETURNING id", [practice.practiceId, payerId]);
        await other.query("INSERT INTO contract_version (practice_id, contract_id, version_no, source_document_ids, effective_from) VALUES ($1, $2, 1, ARRAY[$3::uuid], '2027-01-01')", [practice.practiceId, rows[0]?.id, L]);
      });
      await tag.ready;
      const responding = call(recordResponseAction, practice.manager, P, { caseId, submissionId, documentId: L.toUpperCase(), receivedOn: today(), kind: 'info_requested' });
      await waitingOn(L);
      await tag.commit();
      expect(await responding).toEqual(LETTER_REFUSED);
      expect(await naming(L)).toEqual({ responses: 0, versions: 1 });

      // The mirror: a response of M holds M's lock and has recorded M, not yet committed; a tag of M waits for the
      // lock, then is refused with what to choose instead, and no version names M.
      const M = await documentOf(practice);
      const response = held(other, practice, practice.manager, async () => {
        await other.query(DOCUMENT_USE_LOCK, [M]);
        await other.query("INSERT INTO payer_response (practice_id, submission_id, kind, document_id, received_on, recorded_by) VALUES ($1, $2, 'info_requested', $3, $4, $5)", [
          practice.practiceId,
          submissionId,
          M,
          today(),
          practice.manager,
        ]);
      });
      await response.ready;
      const tagging = call(tagContractDocument, practice.manager, P, { documentId: M.toUpperCase(), payerId, title: 'SYNTHETIC ANSWER AS AN AGREEMENT', effectiveFrom: '2027-01-01' });
      await waitingOn(M);
      await response.commit();
      expect(await tagging).toEqual(REFUSED_AS_SOURCE);
      expect(await naming(M)).toEqual({ responses: 1, versions: 0 });
    } finally {
      await other.end();
    }
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
