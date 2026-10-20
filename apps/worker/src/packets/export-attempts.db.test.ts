import { randomUUID } from 'node:crypto';

import { type DataKey, type KeyProvider, type PracticeScope, type ScopeClient, readDatabaseUrl, recordAuditEvent, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import type { Practice } from '../price/test-support/pricing-world';
import { DocumentStore, type WrittenDocument } from '../storage/documents';
import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { type PacketExportServices, exportFailureCode, exportPacketVersion, packetExportHandler } from './export';
import { PACKET_EXPORT_FAILURES, PACKET_EXPORT_REFUSALS, type PacketExportRefusal, exportReadiness } from './readiness';
import { EXPORT_REQUEST_REFUSALS, approvePacketVersion, requestPacketExport, writePacketVersion } from './services';
import { PacketWorld } from './test-support/packet-world';

/**
 * The export's refusals and failures, recorded and read back (the best-option audit's item #26, the founder's
 * ruling of 2026-10-18; docs/adr/0061; migration 20261103090000's packet_export_refusal_codes(),
 * packet_export_failure_codes(), audit_event_packet_export_attempt and packet_version_export_attempt()). The
 * codes the database holds are the TypeScript's; every refusal of the export job is one audit event of the
 * version in the job's own name with the first reason as its purpose, and every failed try one too, with its
 * failure's code, written in a transaction of its own (another try follows, or it was the last); no event names
 * anything but codes and IDs; a person writes none, and none names another practice's version or another code;
 * the packet page's reading gives none, in progress, retrying, refused, failed or exported, since the latest
 * request, to the people who draft packets or export PHI and to no one else; and the request refuses at once,
 * queueing nothing, for the reason the job would. Each case is a practice of its own (SYNTHETIC CAS-08 under
 * the fixed 97110 contract, its window cited and verified).
 */

let w: PacketWorld;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
const PLAN = 'CE:SYNPLAN-FIX-ONE';
/** The CAS-08 fixture's identifiers, which no event may carry. */
const KNOWN = ['SYNPCNCAS08001', 'SYNCCNCAS080001', 'SYNCCNCAS080002', 'SYNCCNCAS080003'];
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Setup {
  readonly practice: Practice;
  readonly caseId: string;
  readonly second: string;
}

async function cas08(label: string): Promise<Setup> {
  const practice = await w.practice(label);
  const caseId = await w.caseOf(practice, 'CAS-08/remit.835', PLAN, MARCH);
  return { practice, caseId, second: await w.person(practice, 'billing_manager') };
}

const written = (setup: Setup, basedOn: string | null = null, narrative?: string) =>
  w.as(setup.practice, setup.practice.manager, (scope) =>
    writePacketVersion(scope, w.keys, {
      practiceId: setup.practice.practiceId,
      caseId: setup.caseId,
      basedOnVersionId: basedOn,
      ...(narrative === undefined ? {} : { narrative }),
      promptPayState: null,
      requestId: 'test-write',
    }),
  );

async function approved(setup: Setup, narrative?: string): Promise<string> {
  const version = await written(setup, null, narrative);
  await w.as(setup.practice, setup.second, (scope) =>
    approvePacketVersion(scope, { practiceId: setup.practice.practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: 'test-approve' }),
  );
  return version.versionId;
}

/** The export as the web's route records the request, in the billing manager's name (packet_export_requested). */
const requested = (setup: Setup, versionId: string) =>
  w.as(setup.practice, setup.practice.manager, (scope) =>
    recordAuditEvent(scope, { action: 'packet_export_requested', objectType: 'packet_version', objectId: versionId, practiceId: setup.practice.practiceId, requestId: `test-${randomUUID()}` }),
  );

interface AttemptEvent {
  readonly actor_id: string;
  readonly actor_kind: string;
  readonly action: string;
  readonly object_type: string;
  readonly object_id: string;
  readonly practice_id: string;
  readonly grant_id: string | null;
  readonly purpose: string;
  readonly request_id: string;
}

/** The version's refusal and failure events, oldest first, every column but the time. */
async function attemptEvents(setup: Setup, versionId: string): Promise<AttemptEvent[]> {
  const { rows } = await asOwner(w.owner, [setup.practice.practiceId], () =>
    w.owner.query<AttemptEvent>(
      `SELECT actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id FROM audit_event
        WHERE object_id = $1 AND action IN ('packet_export_refused', 'packet_export_attempt_failed', 'packet_export_failed') ORDER BY at, id`,
      [versionId],
    ),
  );
  for (const row of rows) {
    // Codes and opaque IDs only: nothing a person typed, no identifier of the fixture's.
    for (const code of [row.actor_kind, row.action, row.object_type, row.purpose]) {
      expect(code).toMatch(CODE);
    }
    for (const id of [row.actor_id, row.object_id, row.practice_id, row.request_id, ...(row.grant_id === null ? [] : [row.grant_id])]) {
      expect(id).toMatch(UUID);
    }
    for (const identifier of KNOWN) {
      expect(JSON.stringify(row)).not.toContain(identifier);
    }
  }
  return rows;
}

/** A job's context on the worker's own login, as the worker runs one, on its last attempt or not. */
function context(practice: Practice, lastAttempt: boolean, logs: Record<string, unknown>[] = []): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: (line) => logs.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (work) => withJobScope(w.worker, { jobId, practiceId: practice.practiceId }, work),
    enqueue: () => Promise.resolve(null),
    lastAttempt,
  };
}

/** An audit event written straight into audit_event on the web's login by a service actor (a random ID) in the practice's scope. */
const webService = (setup: Setup, action: string, purpose: string | null, versionId: string) =>
  withPracticeScope(w.app, { actorId: randomUUID(), practiceIds: [setup.practice.practiceId] }, (scope) =>
    scope.client.query(
      `INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id)
       VALUES (app_actor_id(), 'service', $1, 'packet_version', $2, $3, $4, $5)`,
      [action, versionId, setup.practice.practiceId, purpose, randomUUID()],
    ),
  );

/** The latest attempt as the packet page reads it, as `actorId`. */
const attempt = (setup: Setup, actorId: string, versionId: string) =>
  w.as(setup.practice, actorId, async (scope) => (await scope.client.query<{ state: string; code: string | null; requested_at: Date | null; at: Date | null }>('SELECT * FROM packet_version_export_attempt($1)', [versionId])).rows);

async function errorOf(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal');
}

describe('the codes', () => {
  it('are the same in the database as in TypeScript, in order', async () => {
    const setup = await w.practice('attempt-codes');
    const { rows } = await w.as(setup, setup.manager, (scope) =>
      scope.client.query<{ refusals: string[]; failures: string[] }>('SELECT packet_export_refusal_codes() AS refusals, packet_export_failure_codes() AS failures'),
    );
    expect(rows[0]).toEqual({ refusals: [...PACKET_EXPORT_REFUSALS], failures: [...PACKET_EXPORT_FAILURES] });
    // Every reason the request can give has its words, and each is a rule's, never a value.
    expect(Object.keys(EXPORT_REQUEST_REFUSALS)).toEqual(PACKET_EXPORT_REFUSALS.filter((code) => code !== 'verifier_failed'));
  });

  it('are what a failed try is classed as: the store’s integrity, the renderer, the store, a database rule, anything else', () => {
    expect(exportFailureCode(Object.assign(new Error('x'), { code: '23514' }))).toBe('database_refused');
    expect(exportFailureCode(Object.assign(new Error('x'), { code: '42501' }))).toBe('database_refused');
    expect(exportFailureCode(Object.assign(new Error('x'), { code: '40001' }))).toBe('unexpected');
    expect(exportFailureCode(new TypeError('x'))).toBe('unexpected');
    expect(exportFailureCode('a string')).toBe('unexpected');
  });
});

describe('each refusal of the export job', () => {
  /** The job refuses `versionId` for `reason`, and the request refuses it for the same reason, queueing nothing. */
  async function refusedFor(setup: Setup, versionId: string, reason: PacketExportRefusal, asOf?: string): Promise<void> {
    const queued: unknown[] = [];
    const queue = { send: (...args: unknown[]) => Promise.resolve(String(queued.push(args))) } as never;
    if (asOf === undefined && reason !== 'verifier_failed') {
      const refusal = await errorOf(w.as(setup.practice, setup.practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: setup.practice.practiceId, versionId, requestId: 'test-request' })));
      expect((refusal as Error).message).toBe(EXPORT_REQUEST_REFUSALS[reason]);
      expect(queued).toHaveLength(0);
    }
    const job = context(setup.practice, false);
    const outcome = await exportPacketVersion(job, w.services, setup.practice.practiceId, versionId, asOf === undefined ? {} : { asOf });
    expect(outcome).toEqual({ outcome: 'not_exportable', reason });
    const events = await attemptEvents(setup, versionId);
    expect(events.at(-1)).toEqual({
      actor_id: job.jobId,
      actor_kind: 'service',
      action: 'packet_export_refused',
      object_type: 'packet_version',
      object_id: versionId,
      practice_id: setup.practice.practiceId,
      grant_id: null,
      purpose: reason,
      request_id: job.jobId,
    });
  }

  it('is one event in the job’s name with its first reason: not approved, then not current', async () => {
    const setup = await cas08('attempt-not-approved');
    const first = await written(setup);
    await refusedFor(setup, first.versionId, 'not_approved');
    expect(await attemptEvents(setup, first.versionId)).toHaveLength(1);
    await written(setup, first.versionId);
    // Both hold now; the event names the first.
    expect(await w.as(setup.practice, setup.practice.manager, (scope) => exportReadiness(scope.client, { practiceId: setup.practice.practiceId, versionId: first.versionId, asOf: w.today() }))).toEqual({
      outcome: 'refused',
      reasons: ['not_approved', 'not_current'],
    });
    await refusedFor(setup, first.versionId, 'not_approved');
    expect((await attemptEvents(setup, first.versionId)).map((event) => event.purpose)).toEqual(['not_approved', 'not_approved']);
  });

  it('names a case changed since the version was written (a line written off)', async () => {
    const setup = await cas08('attempt-case-changed');
    const versionId = await approved(setup);
    // The billing manager writes a line off in their own name, as the case page does.
    await w.as(setup.practice, setup.practice.manager, (scope) =>
      scope.client.query(
        "UPDATE case_line SET written_off_reason = 'not_worth_pursuit', written_off_by = app_actor_id() WHERE id = (SELECT id FROM case_line WHERE case_id = $1 ORDER BY id LIMIT 1)",
        [setup.caseId],
      ),
    );
    await refusedFor(setup, versionId, 'case_changed');
  });

  it('names a line whose window ended before the day, judged on the day the job runs', async () => {
    const setup = await cas08('attempt-window-passed');
    const versionId = await approved(setup);
    // The contract's window is 3,650 days from the remittance: ten years on, it has ended.
    await refusedFor(setup, versionId, 'window_passed', '2036-12-31');
    expect(await w.as(setup.practice, setup.practice.manager, (scope) => exportReadiness(scope.client, { practiceId: setup.practice.practiceId, versionId, asOf: w.today() }))).toEqual({ outcome: 'ready' });
  });

  it('names a deadline not verified (a window cited on no page)', async () => {
    const practice = await w.practice('attempt-deadline');
    const { caseId } = await w.previousImageCase(practice, 'CAS-08/remit.835', PLAN, MARCH);
    const setup: Setup = { practice, caseId, second: await w.person(practice, 'billing_manager') };
    const versionId = await approved(setup);
    await refusedFor(setup, versionId, 'deadline_unverified');
  });

  it('names the verifier failing over what it would print', async () => {
    const setup = await cas08('attempt-verifier');
    const versionId = await approved(setup, 'The payer paid these lines short of the contract [3].');
    // The case's patients renamed on the record (a SYNTHETIC correction) to a word the narrative holds.
    const { rows } = await asOwner(w.owner, [setup.practice.practiceId], () =>
      w.owner.query<{ id: string }>('SELECT DISTINCT c.patient_ref_id AS id FROM case_line cl JOIN service_line sl ON sl.id = cl.service_line_id JOIN claim c ON c.id = sl.claim_id WHERE cl.case_id = $1', [setup.caseId]),
    );
    for (const row of rows) {
      await w.superuser('UPDATE patient_ref SET last_name = $2 WHERE id = $1', [row.id, setup.practice.cipher.encrypt('patient_ref.last_name', 'PAID')]);
    }
    await refusedFor(setup, versionId, 'verifier_failed');
  });
});

/** A practice's approved version and the services one failed try fails with. */
async function failing(label: string, services: (setup: Setup, versionId: string) => PacketExportServices): Promise<{ setup: Setup; versionId: string; services: PacketExportServices }> {
  const setup = await cas08(label);
  const versionId = await approved(setup);
  return { setup, versionId, services: services(setup, versionId) };
}

describe('each failed try of the export job', () => {
  /** Runs the handler on the attempt (`last` or not), which rethrows; returns the event it recorded and its log. */
  async function failedTry(setup: Setup, versionId: string, services: PacketExportServices, last: boolean): Promise<{ events: AttemptEvent[]; logs: Record<string, unknown>[]; job: JobContext }> {
    const logs: Record<string, unknown>[] = [];
    const job = context(setup.practice, last, logs);
    await expect(packetExportHandler(services)({ practice_id: setup.practice.practiceId, packet_version_id: versionId }, job)).rejects.toBeInstanceOf(Error);
    return { events: await attemptEvents(setup, versionId), logs, job };
  }

  it('records the renderer’s failure as a retry, then as the last, with its code alone; the log keeps the code', async () => {
    const { setup, versionId, services } = await failing('attempt-render', () => ({ ...w.services, pdf: { render: () => Promise.reject(new Error('SYNTHETIC renderer crash')) } }));
    const retry = await failedTry(setup, versionId, services, false);
    expect(retry.events).toEqual([
      {
        actor_id: retry.job.jobId,
        actor_kind: 'service',
        action: 'packet_export_attempt_failed',
        object_type: 'packet_version',
        object_id: versionId,
        practice_id: setup.practice.practiceId,
        grant_id: null,
        purpose: 'render_failed',
        request_id: retry.job.jobId,
      },
    ]);
    expect(retry.logs.filter((line) => line.msg === 'packet export failed')).toEqual([expect.objectContaining({ error_code: 'PACKET_EXPORT_RENDER_FAILED', packet_version_id: versionId })]);
    expect(JSON.stringify(retry.logs)).not.toContain('SYNTHETIC renderer crash');
    const last = await failedTry(setup, versionId, services, true);
    expect(last.events.map((event) => [event.action, event.purpose])).toEqual([
      ['packet_export_attempt_failed', 'render_failed'],
      ['packet_export_failed', 'render_failed'],
    ]);
    // Nothing was exported.
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ exported_at: Date | null }>('SELECT exported_at FROM packet_version WHERE id = $1', [versionId]));
    expect(rows[0]?.exported_at).toBeNull();
  });

  it('records the store’s failure, and a store that sealed other bytes', async () => {
    class Failing extends DocumentStore {
      override write(): Promise<WrittenDocument> {
        return Promise.reject(new Error('SYNTHETIC store outage'));
      }
    }
    class Lying extends DocumentStore {
      override async write(...args: Parameters<DocumentStore['write']>): Promise<WrittenDocument> {
        return { ...(await super.write(...args)), sha256: 'f'.repeat(64) };
      }
    }
    const store = await failing('attempt-store', () => ({ ...w.services, documents: new Failing(new MemorySealedBytes()) }));
    expect((await failedTry(store.setup, store.versionId, store.services, false)).events.map((event) => event.purpose)).toEqual(['store_failed']);
    const lying = await failing('attempt-mismatch', () => ({ ...w.services, documents: new Lying(new MemorySealedBytes()) }));
    expect((await failedTry(lying.setup, lying.versionId, lying.services, true)).events.map((event) => [event.action, event.purpose])).toEqual([['packet_export_failed', 'store_mismatch']]);
  });

  it('records the database refusing the export’s own UPDATE, and anything else as unexpected', async () => {
    // The contract version leaves sign-off while the PDF prints (a superuser's change, committed meanwhile): the guard refuses the UPDATE.
    const refused = await failing('attempt-database', (setup) => ({
      ...w.services,
      pdf: {
        render: async (html: string) => {
          await w.superuser(`UPDATE contract_version SET status = 'superseded' WHERE practice_id = $1`, [setup.practice.practiceId]);
          return w.services.pdf.render(html);
        },
      },
    }));
    expect((await failedTry(refused.setup, refused.versionId, refused.services, false)).events.map((event) => event.purpose)).toEqual(['database_refused']);
    const keys: KeyProvider = {
      generateDataKey: (): Promise<DataKey> => Promise.reject(new Error('SYNTHETIC key outage')),
      decryptDataKey: (): Promise<Buffer> => Promise.reject(new Error('SYNTHETIC key outage')),
    };
    const unexpected = await failing('attempt-unexpected', () => ({ ...w.services, keys }));
    expect((await failedTry(unexpected.setup, unexpected.versionId, unexpected.services, false)).events.map((event) => event.purpose)).toEqual(['unexpected']);
  });
});

describe('the events', () => {
  it('are written by the export job alone, of a packet version of the event’s practice, with one of their codes', async () => {
    const setup = await cas08('attempt-who');
    const versionId = (await written(setup)).versionId;
    const other = await cas08('attempt-who-other');
    const otherVersionId = (await written(other)).versionId;
    const event = (action: string, purpose: string, objectId = versionId, objectType = 'packet_version') => (scope: PracticeScope<ScopeClient>) =>
      recordAuditEvent(scope, { action, objectType, objectId, practiceId: setup.practice.practiceId, purpose, requestId: randomUUID() });
    // A person, whatever their role, writes none.
    for (const action of ['packet_export_refused', 'packet_export_attempt_failed', 'packet_export_failed']) {
      const purpose = action === 'packet_export_refused' ? 'case_changed' : 'unexpected';
      expect(await errorOf(w.as(setup.practice, setup.practice.manager, event(action, purpose)))).toMatchObject({ code: '42501' });
    }
    const job = (run: (scope: PracticeScope<ScopeClient>) => Promise<void>) => withJobScope(w.worker, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, run);
    // The job: of a version of its practice, with one of the action's codes.
    for (const code of PACKET_EXPORT_REFUSALS) {
      await job(event('packet_export_refused', code));
    }
    for (const code of PACKET_EXPORT_FAILURES) {
      await job(event('packet_export_attempt_failed', code));
      await job(event('packet_export_failed', code));
    }
    expect(await errorOf(job(event('packet_export_refused', 'render_failed')))).toMatchObject({ code: '23514' });
    expect(await errorOf(job(event('packet_export_failed', 'case_changed')))).toMatchObject({ code: '23514' });
    expect(await errorOf(job(event('packet_export_refused', 'no_result')))).toMatchObject({ code: '23514' });
    expect(await errorOf(job(event('packet_export_refused', 'case_changed', setup.caseId, 'case')))).toMatchObject({ code: '23514' });
    expect(await errorOf(job(event('packet_export_refused', 'case_changed', otherVersionId)))).toMatchObject({ code: '23514' });
    expect(await attemptEvents(setup, versionId)).toHaveLength(PACKET_EXPORT_REFUSALS.length + 2 * PACKET_EXPORT_FAILURES.length);
    expect(await attemptEvents(other, otherVersionId)).toEqual([]);
    // A service actor on the web's login is not the job: only the worker's own login records an attempt (app_session_is_job()). Written
    // as raw SQL, since recordAuditEvent() refuses a practice outside such an actor's scope before the database is asked.
    expect(await errorOf(webService(setup, 'packet_export_refused', 'case_changed', versionId))).toMatchObject({
      code: '42501',
      message: "a packet export's refusal or failure is recorded by the export job on the worker's own login",
    });
  });

  it('cannot hide a refusal behind a request: a request is a person’s who may export PHI, never the job’s, and the page counts only those', async () => {
    const setup = await cas08('attempt-mask');
    const versionId = await approved(setup);
    const read = async () => (await attempt(setup, setup.practice.manager, versionId)).map((row) => ({ state: row.state, code: row.code }));
    await requested(setup, versionId);
    await exportPacketVersion(context(setup.practice, false), w.services, setup.practice.practiceId, versionId, { asOf: '2036-12-31' });
    expect(await read()).toEqual([{ state: 'refused', code: 'window_passed' }]);
    const request = (scope: PracticeScope<ScopeClient>) =>
      recordAuditEvent(scope, { action: 'packet_export_requested', objectType: 'packet_version', objectId: versionId, practiceId: setup.practice.practiceId, requestId: randomUUID() });
    // The job's login records no request, so it cannot turn its own refusal back into "in progress" (and then "failed").
    expect(await errorOf(withJobScope(w.worker, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, request))).toMatchObject({ code: '42501' });
    // Nor does a service actor on the web's login, nor a person who drafts packets but does not export PHI.
    expect(await errorOf(webService(setup, 'packet_export_requested', null, versionId))).toMatchObject({ code: '42501' });
    const analyst = await w.person(setup.practice, 'analyst');
    expect(await errorOf(w.as(setup.practice, analyst, request))).toMatchObject({ code: '42501' });
    // Nor anyone of another version than a packet version of the event's practice.
    expect(
      await errorOf(
        w.as(setup.practice, setup.practice.manager, (scope) =>
          recordAuditEvent(scope, { action: 'packet_export_requested', objectType: 'case', objectId: setup.caseId, practiceId: setup.practice.practiceId, requestId: randomUUID() }),
        ),
      ),
    ).toMatchObject({ code: '23514' });
    expect(await read()).toEqual([{ state: 'refused', code: 'window_passed' }]);
    // The billing manager asking again is a new attempt.
    await requested(setup, versionId);
    expect(await read()).toEqual([{ state: 'in_progress', code: null }]);
  });
});

describe('the latest attempt, as the packet page reads it', () => {
  it('is none, in progress, refused, in progress again, retrying, failed and exported, each since the latest request', async () => {
    const setup = await cas08('attempt-states');
    const versionId = await approved(setup);
    const read = async (actorId = setup.practice.manager) => (await attempt(setup, actorId, versionId)).map((row) => ({ state: row.state, code: row.code }));
    expect(await read()).toEqual([{ state: 'none', code: null }]);
    await requested(setup, versionId);
    expect(await read()).toEqual([{ state: 'in_progress', code: null }]);
    const [requestedRow] = await attempt(setup, setup.practice.manager, versionId);
    expect(requestedRow?.requested_at).toBeInstanceOf(Date);
    expect(requestedRow?.at).toBeNull();
    // A job that refuses it (a line's window judged ended).
    await exportPacketVersion(context(setup.practice, false), w.services, setup.practice.practiceId, versionId, { asOf: '2036-12-31' });
    expect(await read()).toEqual([{ state: 'refused', code: 'window_passed' }]);
    // Asked again: what came before the request is not this attempt's.
    await requested(setup, versionId);
    expect(await read()).toEqual([{ state: 'in_progress', code: null }]);
    const broken: PacketExportServices = { ...w.services, pdf: { render: () => Promise.reject(new Error('SYNTHETIC renderer crash')) } };
    await expect(packetExportHandler(broken)({ practice_id: setup.practice.practiceId, packet_version_id: versionId }, context(setup.practice, false))).rejects.toBeInstanceOf(Error);
    expect(await read()).toEqual([{ state: 'retrying', code: 'render_failed' }]);
    await expect(packetExportHandler(broken)({ practice_id: setup.practice.practiceId, packet_version_id: versionId }, context(setup.practice, true))).rejects.toBeInstanceOf(Error);
    expect(await read()).toEqual([{ state: 'failed', code: 'render_failed' }]);
    // Asked again, and printed.
    await requested(setup, versionId);
    await packetExportHandler(w.services)({ practice_id: setup.practice.practiceId, packet_version_id: versionId }, context(setup.practice, false));
    const [exported] = await attempt(setup, setup.practice.manager, versionId);
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ exported_at: Date }>('SELECT exported_at FROM packet_version WHERE id = $1', [versionId]));
    expect(exported).toMatchObject({ state: 'exported', code: null, at: rows[0]?.exported_at });
  });

  it('answers the people who draft packets or export PHI in the practice, and no one else', async () => {
    const setup = await cas08('attempt-readers');
    const versionId = await approved(setup);
    await requested(setup, versionId);
    const analyst = await w.person(setup.practice, 'analyst');
    const viewer = await w.person(setup.practice, 'viewer');
    expect(await attempt(setup, analyst, versionId)).toHaveLength(1);
    expect(await attempt(setup, setup.second, versionId)).toHaveLength(1);
    expect(await attempt(setup, viewer, versionId)).toEqual([]);
    // Another practice's billing manager, in their own scope, reads nothing of this version.
    const other = await w.practice('attempt-readers-other');
    expect(await w.as(other, other.manager, async (scope) => (await scope.client.query('SELECT * FROM packet_version_export_attempt($1)', [versionId])).rows)).toEqual([]);
  });
});
