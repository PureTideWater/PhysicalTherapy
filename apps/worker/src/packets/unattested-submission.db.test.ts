import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, recordAuditEvent, withJobScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE, errorOf } from '../price/test-support/pricing-world';
import { approvePacketVersion, logSubmission, submissionLog, writePacketVersion } from './services';
import { SUBMISSION_LOGGED_UNATTESTED, SUBMISSION_UNATTESTED_WORDS, packetVersionUnattestedReason, submissionSentOf } from './submission-kinds';
import { FIXED_97110, PacketWorld } from './test-support/packet-world';

/**
 * A submission sent without sign-off (the founder's ruling of 2026-10-20; docs/adr/0061; migration 20261103090000):
 * when a version's pricing goes stale after its export and before its attestation, the attestation stays refused, and
 * a submission of that export is still logged, recorded as unattested with its reason (pricing_stale_after_export) and
 * flagged by pricing_check with the cause, with the audit event the database records; the version is never attested
 * after it. Every other submission still needs the attestation: an unattested export still current, an export made
 * before the guard existed, another practice's. The application role writes neither the reason, nor the flag, nor the
 * audit event. The rules are the database's, so each submission is the person's own INSERT in their scope (the
 * submission service's own check is its builder's). Each case is a practice of its own (SYNTHETIC CAS-08 under the
 * fixed 97110 contract, its window cited and verified); a re-run accepted after the export makes its pricing stale.
 */

let w: PacketWorld;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
const PLAN = 'CE:SYNPLAN-FIX-ONE';
const REASON = 'pricing_stale_after_export';

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Exported {
  readonly practice: Practice;
  readonly caseId: string;
  readonly runId: string;
  readonly versionId: string;
}

/** A practice whose one case's packet is written by the billing manager, approved by a second, exported by the job, and attested by the reviewer when `attested`. */
async function exported(label: string, attested: boolean): Promise<Exported> {
  const practice = await w.practice(label);
  await w.triage.load(practice, 'CAS-08/remit.835');
  const contract = await w.triage.fixedContract(practice, FIXED_97110);
  const planId = await w.triage.pricing.planOf(practice, PLAN);
  await w.triage.pricing.mapped(practice, planId, 'contract', '2026-01-01', contract.versionId);
  const runId = await w.triage.pricing.createRun(practice, MARCH.from, MARCH.to);
  await w.triage.pricing.execute(practice, runId);
  const triaged = await w.triage.triage(practice, runId);
  if (triaged.outcome !== 'triaged' || triaged.summary.casesOpened !== 1) {
    throw new Error('the fixture did not open one case');
  }
  const { rows } = await w.as(practice, practice.manager, (scope) => scope.client.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]));
  const caseId = (rows[0] as { id: string }).id;
  const version = await w.as(practice, practice.manager, (scope) =>
    writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: 'test-write' }),
  );
  const second = await w.person(practice, 'billing_manager');
  await w.as(practice, second, (scope) => approvePacketVersion(scope, { practiceId: practice.practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: 'test-approve' }));
  const outcome = await w.export(practice, version.versionId);
  if (outcome.outcome !== 'exported') {
    throw new Error(`not exported: ${JSON.stringify(outcome)}`);
  }
  if (attested) {
    await w.attest(practice, version.versionId);
  }
  return { practice, caseId, runId, versionId: version.versionId };
}

/** The case's run priced again and accepted by the billing manager: the version's lines are no longer the pricing in effect. */
async function staleAfterExport(setup: Exported): Promise<void> {
  const { pricingRunId } = await w.as(setup.practice, setup.practice.manager, (scope) => createRerun(scope, { practiceId: setup.practice.practiceId, pricingRunId: setup.runId, releaseNo: RELEASE, requestId: 'test-rerun' }));
  await w.triage.pricing.execute(setup.practice, pricingRunId);
  await w.as(setup.practice, setup.practice.manager, (scope) => acceptRun(scope, { practiceId: setup.practice.practiceId, pricingRunId }));
}

interface Logged {
  readonly id: string;
  readonly unattested_reason: string | null;
  readonly pricing_check: string | null;
}

/** The person's own INSERT of a submission of the version's export, in `practiceId`'s scope (the billing manager's by default), with the export's own hashes. */
function submit(setup: Exported, actorId = setup.practice.manager, scopeOf: Practice = setup.practice): Promise<Logged> {
  return w.as(scopeOf, actorId, async (scope) => {
    const { rows } = await scope.client.query<{ export_sha256: string; export_csv_sha256: string }>('SELECT export_sha256, export_csv_sha256 FROM packet_version WHERE id = $1', [setup.versionId]);
    const hashes = rows[0] ?? { export_sha256: 'a'.repeat(64), export_csv_sha256: 'b'.repeat(64) };
    const inserted = await scope.client.query<Logged>(
      `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, reference, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
       VALUES ($1, $2, $3, (now() AT TIME ZONE 'UTC')::date, 'payer_portal', NULL, app_actor_id(), NULL, $4, $5)
       RETURNING id, unattested_reason, pricing_check`,
      [scopeOf.practiceId, setup.caseId, setup.versionId, hashes.export_sha256, hashes.export_csv_sha256],
    );
    return inserted.rows[0] as Logged;
  });
}

const reasonNow = (setup: Exported, scopeOf: Practice = setup.practice) =>
  w.as(scopeOf, scopeOf.manager, (scope) => packetVersionUnattestedReason(scope.client, { practiceId: scopeOf.practiceId, versionId: setup.versionId }));

/** The database's own record of a submission sent without sign-off, read as the superuser. */
async function unattestedEvents(submissionId: string): Promise<readonly Record<string, unknown>[]> {
  const { rows } = await w.owner.query(
    `SELECT actor_id, actor_kind, practice_id, grant_id, purpose, request_id FROM audit_event
      WHERE action = 'submission_logged_unattested' AND object_type = 'submission' AND object_id = $1 ORDER BY at, id`,
    [submissionId],
  );
  return rows as Record<string, unknown>[];
}

const forge = (setup: Exported, actorId: string, submissionId: string, purpose: string = REASON) =>
  w.as(setup.practice, actorId, (scope) =>
    recordAuditEvent(scope, { action: SUBMISSION_LOGGED_UNATTESTED, objectType: 'submission', objectId: submissionId, practiceId: setup.practice.practiceId, purpose, requestId: `test-forge-${randomUUID()}` }),
  );

describe('an export still current and not attested', () => {
  let setup: Exported;
  beforeAll(async () => {
    setup = await exported('unattested-current', false);
  }, 180_000);

  it('is not logged: the attestation is still required, and the application cannot name a reason to pass it', async () => {
    expect(await reasonNow(setup)).toBeNull();
    const refused = await errorOf(submit(setup));
    expect(refused).toMatchObject({ code: '23514', message: 'a packet is submitted once a reimbursement reviewer has attested its export' });
    // The application role cannot write the reason (or the flag) itself: no grant on either column.
    const named = await errorOf(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, follow_up_on, export_sha256, export_csv_sha256, unattested_reason, pricing_check)
           SELECT v.practice_id, $2, v.id, (now() AT TIME ZONE 'UTC')::date, 'payer_portal', app_actor_id(), NULL, v.export_sha256, v.export_csv_sha256, 'pricing_stale_after_export', 'PRICING_NOT_IN_EFFECT'
             FROM packet_version v WHERE v.id = $1`,
          [setup.versionId, setup.caseId],
        ),
      ),
    );
    expect(named).toMatchObject({ code: '42501' });
    const { rows } = await w.owner.query('SELECT count(*)::int AS n FROM submission WHERE packet_version_id = $1', [setup.versionId]);
    expect(rows[0]).toEqual({ n: 0 });
  }, 60_000);
});

describe('an export whose pricing went stale after the export and before its attestation', () => {
  let setup: Exported;
  let other: Exported;
  beforeAll(async () => {
    setup = await exported('unattested-stale', false);
    await staleAfterExport(setup);
    other = await exported('unattested-stale-other', false);
  }, 360_000);

  it('is refused the attestation for its pricing, and offered as sent without sign-off', async () => {
    expect(await reasonNow(setup)).toBe(REASON);
    const attestation = await errorOf(w.attest(setup.practice, setup.versionId));
    expect((attestation as Error).message).toBe('a packet version whose pricing is no longer current is not attested');
    // Another practice cannot see the version, so nothing is offered there.
    expect(await reasonNow(setup, other.practice)).toBeNull();
  }, 60_000);

  it('is logged as sent without sign-off with its reason, flagged with the cause, the database recording the audit event once; the version is never attested after it', async () => {
    const logged = await submit(setup);
    expect(logged).toMatchObject({ unattested_reason: REASON, pricing_check: 'PRICING_NOT_IN_EFFECT' });
    expect(submissionSentOf(logged.unattested_reason)).toEqual({ kind: 'unattested', reason: REASON });
    expect(SUBMISSION_UNATTESTED_WORDS[REASON]).toBe('sent without sign-off: pricing went stale after export');
    // The audit event: the database's, in the submitter's name under their own group's ownership, its purpose the reason.
    expect(await unattestedEvents(logged.id)).toEqual([{ actor_id: setup.practice.manager, actor_kind: 'user', practice_id: setup.practice.practiceId, grant_id: null, purpose: REASON, request_id: null }]);
    // The submission log reads it as sent unattested.
    const log = await w.as(setup.practice, setup.practice.manager, (scope) => submissionLog(scope, w.keys, { practiceId: setup.practice.practiceId, caseId: setup.caseId, requestId: 'test-log' }));
    expect(log.map((entry) => [entry.submissionId, entry.sent])).toEqual([[logged.id, { kind: 'unattested', reason: REASON }]]);
    // No second record, no record in another's name, none on the worker's login.
    expect(await errorOf(forge(setup, setup.practice.manager, logged.id))).toMatchObject({ code: '23514' });
    const colleague = await w.person(setup.practice, 'billing_manager');
    expect(await errorOf(forge(setup, colleague, logged.id))).toMatchObject({ code: '23514' });
    const job = await errorOf(
      withJobScope(w.worker, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, (scope) =>
        recordAuditEvent(scope, { action: SUBMISSION_LOGGED_UNATTESTED, objectType: 'submission', objectId: logged.id, practiceId: setup.practice.practiceId, purpose: REASON, requestId: 'test-job' }),
      ),
    );
    expect(job).toMatchObject({ code: '42501' });
    expect(await unattestedEvents(logged.id)).toHaveLength(1);
    // The packet is never attested.
    const attestation = await errorOf(w.attest(setup.practice, setup.versionId));
    expect((attestation as Error).message).toBe('a packet version whose export was sent without sign-off is never attested');
    const { rows } = await w.owner.query('SELECT attested_by FROM packet_version WHERE id = $1', [setup.versionId]);
    expect(rows[0]).toEqual({ attested_by: null });
  }, 120_000);

  it('is not logged from another practice', async () => {
    const refused = await errorOf(submit(setup, other.practice.manager, other.practice));
    expect(refused).toMatchObject({ code: '23514' });
  }, 60_000);
});

describe('an attested export whose pricing went stale since', () => {
  let setup: Exported;
  beforeAll(async () => {
    setup = await exported('unattested-attested', true);
    await staleAfterExport(setup);
  }, 360_000);

  it('is logged as an attested export, flagged with the cause, with no record of a submission sent without sign-off', async () => {
    expect(await reasonNow(setup)).toBeNull();
    const logged = await submit(setup);
    expect(logged).toMatchObject({ unattested_reason: null, pricing_check: 'PRICING_NOT_IN_EFFECT' });
    expect(submissionSentOf(logged.unattested_reason)).toEqual({ kind: 'attested' });
    expect(await unattestedEvents(logged.id)).toEqual([]);
    // Nor can the application add one.
    expect(await errorOf(forge(setup, setup.practice.manager, logged.id))).toMatchObject({ code: '23514' });
  }, 60_000);
});

describe('an export made before the guard existed, whose pricing is stale now', () => {
  let setup: Exported;
  beforeAll(async () => {
    setup = await exported('unattested-pre-guard', false);
    await staleAfterExport(setup);
    // An export the previous image made carries no export verifier report, so nothing proves its pricing was current when it was made.
    await w.superuser('UPDATE packet_version SET export_verifier_report = NULL WHERE id = $1', [setup.versionId]);
  }, 360_000);

  it('still needs the attestation: nothing proves its pricing went stale after the export', async () => {
    expect(await reasonNow(setup)).toBeNull();
    const refused = await errorOf(submit(setup));
    expect(refused).toMatchObject({ code: '23514', message: 'a packet is submitted once a reimbursement reviewer has attested its export' });
  }, 60_000);
});

describe('the submission service', () => {
  let stale: Exported;
  let current: Exported;
  beforeAll(async () => {
    stale = await exported('unattested-service-stale', false);
    await staleAfterExport(stale);
    current = await exported('unattested-service-current', false);
  }, 360_000);

  const log = (setup: Exported) =>
    w.as(setup.practice, setup.practice.manager, (scope) =>
      logSubmission(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: setup.versionId, submittedOn: new Date().toISOString().slice(0, 10), channel: 'fax', reference: null, requestId: 'test-service' }),
    );

  it('logs an export whose pricing went stale after it was made as sent without sign-off, and refuses one still current before the database', async () => {
    const logged = await log(stale);
    expect(logged.sent).toEqual({ kind: 'unattested', reason: REASON });
    expect(await unattestedEvents(logged.submissionId)).toHaveLength(1);
    const refused = await errorOf(log(current));
    expect(refused).toMatchObject({ name: 'PacketRuleError', message: 'a packet is submitted once a reimbursement reviewer has attested its export' });
  }, 120_000);
});

describe('a submission kind read from the database', () => {
  it('is attested for no reason, unattested for the one reason, and refused for any other value', () => {
    expect(submissionSentOf(null)).toEqual({ kind: 'attested' });
    expect(submissionSentOf(REASON)).toEqual({ kind: 'unattested', reason: REASON });
    expect(() => submissionSentOf('reviewer_away')).toThrow(TypeError);
  });
});
