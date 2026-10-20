import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { SYNTHETIC_CORRESPONDENCE_CONTACT, correspondenceText, packetReference } from '@tp/packets';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
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
import { canSetCorrespondence } from '../packets/contact';
import { EXPORT_REFUSAL_TEXT } from '../packets/export-attempts';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { REFERENCE_FORMAT, caseByReferencePage } from './packet-reference';
import { approvePacketVersionAction, exportPacketAction, packetPage, writeVersionAction } from './packets';
import { correspondenceSettingsPage, setCorrespondenceContactAction, settingsPage } from './settings';

/**
 * The payer's copy through the web's routes against PostgreSQL (audit item #37 part 1; the founder's rulings of
 * 2026-10-20; docs/adr/0061; test matrix CAS-26 to CAS-28): W1, the export refused before anything is queued while the
 * practice has no correspondence contact, with its remedy, and queued once the administrator sets it; W3, the contact's
 * page and action, set by the practice administrator by ownership alone; W6, a packet found by the reference a payer
 * quotes, only in its own practice. W2, W4 and W7 are in workbench-routes.db.test.ts, W5 in review.test.ts. SYNTHETIC
 * CAS-08 only.
 */

let w: TriageWorld;
let services: Services;
let queue: MemoryQueue;
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-payer-copy-routes-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
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

/** An internal user of the given role under a four-hour support grant on the practice. */
async function internalOf(target: Practice, role: 'reviewer' | 'support'): Promise<string> {
  const internal = await createOrganization(w.owner, 'internal', `payer copy ${randomUUID().slice(0, 8)}`);
  const id = await createUser(w.owner, { hardwareKeyRequired: true });
  await addMembership(w.owner, internal, id, role);
  await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'PC-ROUTES', 'SYNTHETIC PAYER COPY', now() + interval '4 hours')`, [target.practiceId, id]),
  );
  internalUsers.add(id);
  return id;
}

/** A practice whose CAS-08 lines triage into one case, its version written by the manager and approved by a second billing manager. */
async function approvedCase(label: string, contact: boolean): Promise<{ practice: Practice; caseId: string; versionId: string; contentSha256: string }> {
  const practice = await w.practice(label, { case_materiality_cents: '1000' }, { contact });
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, FIXED);
  const runId = await w.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
  const outcome = await w.triage(practice, runId);
  if (outcome.outcome !== 'triaged' || outcome.summary.casesOpened !== 1) {
    throw new Error('CAS-08 did not open one case');
  }
  const { rows } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]));
  const caseId = (rows[0] as { id: string }).id;
  const P = { practiceId: practice.practiceId };
  ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: '', useDraft: 'on' }));
  const version = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version;
  if (version === null) {
    throw new Error('no version written');
  }
  const second = await createUser(w.owner);
  await addMembership(w.owner, practice.world.organizationId, second, 'billing_manager');
  ok(await call(approvePacketVersionAction, second, P, { caseId, versionId: version.id, versionSha256: version.contentSha256 }));
  return { practice, caseId, versionId: version.id, contentSha256: version.contentSha256 };
}

/** The export job's code on the version, as the worker runs the queued job. */
async function runExport(target: Practice, versionId: string): Promise<void> {
  const jobId = randomUUID();
  await packetExportHandler({ documents, keys: w.keys, pdf: w.pdf })(
    { practice_id: target.practiceId, packet_version_id: versionId },
    { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(w.app, { jobId, practiceId: target.practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
  );
}

const CONTACT_FORM = { name: 'SYNTHETIC BILLING OFFICE', phone: '(919) 555-0100', phone_extension: '12', email: 'disputes@synthetic-practice.test', address_line1: '100 SYNTHETIC WAY', address_line2: 'SUITE 2', address_city: 'RALEIGH', address_state: 'nc', address_zip: '27601' };

describe('W1: no export without a correspondence contact (D7)', () => {
  it('refuses the request with contact_missing and its remedy, queueing nothing, until the practice administrator sets the contact; then queues it', async () => {
    const { practice, caseId, versionId } = await approvedCase('PAYER NO CONTACT', false);
    const P = { practiceId: practice.practiceId };
    const page = ok(await call(packetPage, practice.manager, { ...P, caseId }));
    expect(page.builder.contact).toEqual({ state: 'missing', text: null });
    expect(page.builder.version?.exportReadiness).toEqual({ outcome: 'refused', reasons: ['contact_missing'] });
    expect(page.canSetContact).toBe(false);
    const before = queue.jobs.length;
    const refused = await call(exportPacketAction, practice.manager, P, { caseId, versionId });
    expect(refused).toMatchObject({ status: 'invalid', issues: [{ field: 'contact_missing', message: EXPORT_REFUSAL_TEXT.contact_missing }] });
    expect(EXPORT_REFUSAL_TEXT.contact_missing).toContain('Settings, Correspondence');
    expect(queue.jobs.length).toBe(before);
    ok(await call(setCorrespondenceContactAction, practice.world.adminUserId, P, CONTACT_FORM));
    const ready = ok(await call(packetPage, practice.manager, { ...P, caseId }));
    expect(ready.builder.contact).toEqual({ state: 'set', text: correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT) });
    expect(ready.builder.version?.exportReadiness).toEqual({ outcome: 'ready' });
    expect(ok(await call(exportPacketAction, practice.manager, P, { caseId, versionId })).redirect).toMatch(/notice=export_requested$/);
    expect(queue.jobs.slice(before)).toEqual([{ type: 'packet_export', payload: { practice_id: practice.practiceId, packet_version_id: versionId } }]);
  });
});

describe('W3: the correspondence contact’s page and action (D6)', () => {
  it('is set by the practice administrator by ownership, refused for a billing manager, read-only for them and for an internal user under a support grant, with each field’s refusal', async () => {
    const practice = await w.practice('PAYER CONTACT SETTINGS', {}, { contact: false });
    const P = { practiceId: practice.practiceId };
    const admin = practice.world.adminUserId;
    const support = await internalOf(practice, 'support');
    // The administrator's page is editable; a billing manager's and a support engineer's are read-only.
    expect(ok(await call(correspondenceSettingsPage, admin, P))).toMatchObject({ state: 'missing', stored: null, printed: null, canSet: true });
    expect(ok(await call(correspondenceSettingsPage, practice.manager, P))).toMatchObject({ canSet: false });
    expect(ok(await call(correspondenceSettingsPage, support, P))).toMatchObject({ canSet: false });
    // The overview's checklist names the step.
    expect(ok(await call(settingsPage, admin, P)).checklist?.find((step) => step.key === 'correspondence')).toMatchObject({ done: false, href: `/p/${practice.practiceId}/settings/correspondence` });
    // Each field is refused by its rule, and nothing is written.
    expect(await call(setCorrespondenceContactAction, admin, P, { ...CONTACT_FORM, name: ' ' })).toMatchObject({ status: 'invalid', issues: [{ field: 'name' }] });
    expect(await call(setCorrespondenceContactAction, admin, P, { ...CONTACT_FORM, phone: '555-0100' })).toMatchObject({ status: 'invalid', issues: [{ field: 'phone' }] });
    expect(await call(setCorrespondenceContactAction, admin, P, { ...CONTACT_FORM, address_zip: '' })).toMatchObject({ status: 'invalid', issues: [{ field: 'address_zip' }] });
    expect(await call(setCorrespondenceContactAction, admin, P, { ...CONTACT_FORM, address_state: 'ZZ' })).toMatchObject({ status: 'invalid', issues: [{ field: 'address_state' }] });
    expect(await call(setCorrespondenceContactAction, admin, P, { ...CONTACT_FORM, email: 'disputes at synthetic' })).toMatchObject({ status: 'invalid', issues: [{ field: 'email' }] });
    // A billing manager is refused (403) by the setter's role check, as Postgres would refuse their UPDATE.
    expect((await call(setCorrespondenceContactAction, practice.manager, P, CONTACT_FORM)).status).toBe('forbidden');
    expect((await call(setCorrespondenceContactAction, support, P, CONTACT_FORM)).status).toBe('forbidden');
    expect(ok(await call(correspondenceSettingsPage, admin, P))).toMatchObject({ state: 'missing' });
    // The administrator saves it: the preview prints the payer copy's words, and the overview's step is done.
    expect(ok(await call(setCorrespondenceContactAction, admin, P, CONTACT_FORM)).redirect).toBe(`/p/${practice.practiceId}/settings/correspondence?notice=saved`);
    expect(ok(await call(correspondenceSettingsPage, practice.manager, P))).toMatchObject({ state: 'set', stored: SYNTHETIC_CORRESPONDENCE_CONTACT, printed: correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT) });
    expect(ok(await call(settingsPage, admin, P)).checklist?.find((step) => step.key === 'correspondence')?.done).toBe(true);
    // One event of the setter's, one of the route's, each with the practice's ID and no value.
    const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ action: string; actor_id: string; object_id: string; purpose: string | null }>(
        "SELECT action, actor_id, object_id, purpose FROM audit_event WHERE practice_id = $1 AND action LIKE 'correspondence_contact_%' ORDER BY action",
        [practice.practiceId],
      ),
    );
    expect(rows).toEqual([
      { action: 'correspondence_contact_saved', actor_id: admin, object_id: practice.practiceId, purpose: null },
      { action: 'correspondence_contact_set', actor_id: admin, object_id: practice.practiceId, purpose: null },
    ]);
  });

  it('is editable only by the role practice_admin reached by ownership (the rule pinned at the function)', () => {
    expect(canSetCorrespondence({ roles: ['practice_admin'], via: 'ownership' })).toBe(true);
    expect(canSetCorrespondence({ roles: ['practice_admin', 'viewer'], via: 'ownership' })).toBe(true);
    expect(canSetCorrespondence({ roles: ['practice_admin'], via: 'grant' })).toBe(false);
    expect(canSetCorrespondence({ roles: ['practice_admin'], via: 'support' })).toBe(false);
    expect(canSetCorrespondence({ roles: ['practice_admin'], via: 'job' })).toBe(false);
    for (const role of ['billing_manager', 'analyst', 'viewer', 'firm_principal', 'support', 'reviewer', 'contract_specialist']) {
      expect(canSetCorrespondence({ roles: [role], via: 'ownership' }), role).toBe(false);
    }
  });
});

describe('W6: a packet found by its reference (D5; CAS-28)', () => {
  it('finds the case and version a reference typed in lower case without its hyphen names, lists no other version, finds nothing of another practice, refuses a malformed reference and a role without practice.open', async () => {
    const { practice, caseId, versionId, contentSha256 } = await approvedCase('PAYER REFERENCE', true);
    const P = { practiceId: practice.practiceId };
    await runExport(practice, versionId);
    const reference = packetReference(contentSha256);
    const found = ok(await call(caseByReferencePage, practice.manager, { ...P, reference: reference.toLowerCase().replace('-', '') }));
    expect(found).toMatchObject({ reference, refused: null });
    expect(found.matches).toEqual([{ versionId, packetId: expect.any(String), caseId, versionNo: 1, disputeLevel: 1, approvedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), reference, exported: true, submitted: false }]);
    // A second approved version of the same packet has its own reference: neither lists the other.
    ok(await call(writeVersionAction, practice.manager, P, { caseId, basedOnVersionId: versionId, narrative: 'The payer paid these lines short of the contract [3].' }));
    const second = ok(await call(packetPage, practice.manager, { ...P, caseId })).builder.version;
    const approver = await createUser(w.owner);
    await addMembership(w.owner, practice.world.organizationId, approver, 'billing_manager');
    ok(await call(approvePacketVersionAction, approver, P, { caseId, versionId: second?.id ?? '', versionSha256: second?.contentSha256 ?? '' }));
    const secondReference = packetReference(second?.contentSha256 ?? '');
    expect(secondReference).not.toBe(reference);
    expect(ok(await call(caseByReferencePage, practice.manager, { ...P, reference })).matches.map((match) => match.versionId)).toEqual([versionId]);
    expect(ok(await call(caseByReferencePage, practice.manager, { ...P, reference: secondReference })).matches.map((match) => match.versionId)).toEqual([second?.id]);
    // Another practice's exported version, looked up by its own reference from this practice, is not found (RLS and practice_id).
    const other = await approvedCase('PAYER REFERENCE OTHER', true);
    await runExport(other.practice, other.versionId);
    const otherReference = packetReference(other.contentSha256);
    expect(ok(await call(caseByReferencePage, other.practice.manager, { practiceId: other.practice.practiceId, reference: otherReference })).matches).toHaveLength(1);
    expect(ok(await call(caseByReferencePage, practice.manager, { ...P, reference: otherReference })).matches).toEqual([]);
    expect((await call(caseByReferencePage, practice.manager, { practiceId: other.practice.practiceId, reference: otherReference })).status).not.toBe('ok');
    // A malformed reference is refused with its form; none typed asks for one.
    expect(ok(await call(caseByReferencePage, practice.manager, { ...P, reference: 'SK6CS-K6CSU' }))).toMatchObject({ reference: null, refused: REFERENCE_FORMAT, matches: [] });
    expect(ok(await call(caseByReferencePage, practice.manager, P))).toMatchObject({ asked: null, reference: null, refused: null, matches: [] });
    // A role without practice.open (a reimbursement reviewer under a support grant) is refused.
    const reviewer = await internalOf(practice, 'reviewer');
    expect((await call(caseByReferencePage, reviewer, { ...P, reference })).status).toBe('forbidden');
  });
});
