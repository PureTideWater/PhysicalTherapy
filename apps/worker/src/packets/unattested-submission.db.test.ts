import { randomUUID } from 'node:crypto';

import { openPool, readDatabaseUrl, recordAuditEvent, withJobScope, withPracticeScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE, RERUN_RELEASE, errorOf } from '../price/test-support/pricing-world';
import { SENT_WITHOUT_SIGN_OFF_UNCONFIRMED, approvePacketVersion, attestPacketExport, logSubmission, submissionLog, writePacketVersion } from './services';
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
async function exported(label: string, attested: boolean, releaseNo = RELEASE): Promise<Exported> {
  const practice = await w.practice(label);
  await w.triage.load(practice, 'CAS-08/remit.835');
  const contract = await w.triage.fixedContract(practice, FIXED_97110);
  const planId = await w.triage.pricing.planOf(practice, PLAN);
  await w.triage.pricing.mapped(practice, planId, 'contract', '2026-01-01', contract.versionId);
  const runId = await w.triage.pricing.createRun(practice, MARCH.from, MARCH.to, releaseNo);
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
  await w.as(setup.practice, setup.practice.manager, (scope) => acceptRun(scope, { practiceId: setup.practice.practiceId, pricingRunId, replacesId: setup.runId , heldByIds: [] }));
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

  const log = (setup: Exported, sentWithoutSignOff?: boolean) =>
    w.as(setup.practice, setup.practice.manager, (scope) =>
      logSubmission(scope, w.keys, {
        practiceId: setup.practice.practiceId,
        versionId: setup.versionId,
        submittedOn: new Date().toISOString().slice(0, 10),
        channel: 'fax',
        reference: null,
        ...(sentWithoutSignOff === undefined ? {} : { sentWithoutSignOff }),
        requestId: 'test-service',
      }),
    );

  it('logs an export whose pricing went stale after it was made as sent without sign-off only with the person’s confirmation, read against what the database recorded, and refuses one still current before the database', async () => {
    // What the INSERT returned decides: recorded sent without sign-off and not confirmed, the transaction rolls back.
    for (const confirmed of [undefined, false]) {
      expect(await errorOf(log(stale, confirmed))).toMatchObject({ name: 'PacketRuleError', code: '23514', message: SENT_WITHOUT_SIGN_OFF_UNCONFIRMED });
    }
    const { rows: none } = await w.owner.query('SELECT count(*)::int AS n FROM submission WHERE packet_version_id = $1', [stale.versionId]);
    expect(none[0]).toEqual({ n: 0 });
    const logged = await log(stale, true);
    expect(logged.sent).toEqual({ kind: 'unattested', reason: REASON });
    expect(await unattestedEvents(logged.submissionId)).toHaveLength(1);
    const refused = await errorOf(log(current, true));
    expect(refused).toMatchObject({ name: 'PacketRuleError', message: 'a packet is submitted once a reimbursement reviewer has attested its export' });
  }, 120_000);
});

describe('a submission and its record forged in one statement', () => {
  let setup: Exported;
  beforeAll(async () => {
    setup = await exported('unattested-cte', false);
    await staleAfterExport(setup);
  }, 360_000);

  it('is refused whole: a writable CTE that logs the submission and writes its audit event leaves neither', async () => {
    const id = randomUUID();
    const refused = await errorOf(
      w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query(
          `WITH s AS (INSERT INTO submission (id, practice_id, case_id, packet_version_id, submitted_on, channel, reference, submitted_by, follow_up_on, export_sha256, export_csv_sha256)
             SELECT $3::uuid, v.practice_id, $2, v.id, (now() AT TIME ZONE 'UTC')::date, 'payer_portal', NULL, app_actor_id(), NULL, v.export_sha256, v.export_csv_sha256 FROM packet_version v WHERE v.id = $1 RETURNING id, practice_id)
           INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
             SELECT app_actor_id(), 'user', 'submission_logged_unattested', 'submission', s.id, s.practice_id, NULL, $4, 'test-forged' FROM s`,
          [setup.versionId, setup.caseId, id, REASON],
        ),
      ),
    );
    expect(refused).toMatchObject({ code: '23514', message: 'a submission sent without sign-off is recorded once, as it is logged' });
    expect(await unattestedEvents(id)).toEqual([]);
    const { rows } = await w.owner.query('SELECT count(*)::int AS n FROM submission WHERE packet_version_id = $1', [setup.versionId]);
    expect(rows[0]).toEqual({ n: 0 });
  }, 60_000);
});

describe('a transaction at REPEATABLE READ (or SERIALIZABLE)', () => {
  let setup: Exported;
  let reviewer: string;
  beforeAll(async () => {
    setup = await exported('unattested-repeatable-read', false);
    reviewer = await w.reviewer(setup.practice);
    await w.download(setup.practice, reviewer, setup.versionId);
  }, 360_000);

  /** A pool whose sessions run at `isolation` (any session may set its own default). */
  const poolAt = (isolation: string) => {
    const url = new URL(w.triage.pricing.database.appUrl);
    url.searchParams.set('options', `-c default_transaction_isolation=${isolation.replace(' ', '\\ ')}`);
    return openPool(url.toString(), 1);
  };

  it('is refused before it reads the pricing: its snapshot, taken before a re-price and a submission sent without sign-off, never attests the version', async () => {
    const pool = poolAt('repeatable read');
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let opened!: () => void;
      const ready = new Promise<void>((resolve) => (opened = resolve));
      // The reviewer's transaction takes its snapshot while the export is still current.
      const attesting = withPracticeScope(pool, { actorId: reviewer, practiceIds: [setup.practice.practiceId] }, async (scope) => {
        const { rows } = await scope.client.query<{ isolation: string; export_sha256: string; export_csv_sha256: string }>(
          "SELECT current_setting('transaction_isolation') AS isolation, export_sha256, export_csv_sha256 FROM packet_version WHERE id = $1",
          [setup.versionId],
        );
        const row = rows[0] as { isolation: string; export_sha256: string; export_csv_sha256: string };
        expect(row.isolation).toBe('repeatable read');
        opened();
        await gate;
        return attestPacketExport(scope, { practiceId: setup.practice.practiceId, versionId: setup.versionId, pdfSha256: row.export_sha256, csvSha256: row.export_csv_sha256, requestId: 'test-repeatable-read' });
      });
      await ready;
      // Meanwhile a re-run is accepted and the billing manager logs the export sent without sign-off.
      await staleAfterExport(setup);
      expect(await submit(setup)).toMatchObject({ unattested_reason: REASON, pricing_check: 'PRICING_NOT_IN_EFFECT' });
      release();
      const refused = await errorOf(attesting);
      expect(refused).toMatchObject({ code: '25000', message: expect.stringMatching(/^whether a packet version's pricing is current is read at READ COMMITTED only/) });
      const { rows } = await w.owner.query('SELECT attested_by FROM packet_version WHERE id = $1', [setup.versionId]);
      expect(rows[0]).toEqual({ attested_by: null });
    } finally {
      await pool.end();
    }
  }, 600_000);

  it('logs no submission and attests nothing at SERIALIZABLE either, and the same step at READ COMMITTED refuses for the submission already sent', async () => {
    const pool = poolAt('serializable');
    try {
      const atSerializable = await errorOf(
        withPracticeScope(pool, { actorId: setup.practice.manager, practiceIds: [setup.practice.practiceId] }, (scope) =>
          scope.client.query(
            `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, export_sha256, export_csv_sha256)
             SELECT v.practice_id, $2, v.id, (now() AT TIME ZONE 'UTC')::date, 'fax', app_actor_id(), v.export_sha256, v.export_csv_sha256 FROM packet_version v WHERE v.id = $1`,
            [setup.versionId, setup.caseId],
          ),
        ),
      );
      expect(atSerializable).toMatchObject({ code: '25000' });
    } finally {
      await pool.end();
    }
    expect((await errorOf(w.attest(setup.practice, setup.versionId)) as Error).message).toBe('a packet version whose export was sent without sign-off is never attested');
  }, 120_000);
});

describe('the worker’s own login, naming a person', () => {
  let setup: Exported;
  beforeAll(async () => {
    setup = await exported('unattested-worker-login', true);
  }, 360_000);

  it('logs no submission, of an attested export as of any other: a submission is a person’s own request', async () => {
    const refused = await errorOf(
      withPracticeScope(w.worker, { actorId: setup.practice.manager, practiceIds: [setup.practice.practiceId] }, (scope) =>
        scope.client.query(
          `INSERT INTO submission (practice_id, case_id, packet_version_id, submitted_on, channel, submitted_by, export_sha256, export_csv_sha256)
           SELECT v.practice_id, $2, v.id, (now() AT TIME ZONE 'UTC')::date, 'payer_portal', app_actor_id(), v.export_sha256, v.export_csv_sha256 FROM packet_version v WHERE v.id = $1`,
          [setup.versionId, setup.caseId],
        ),
      ),
    );
    expect(refused).toMatchObject({ code: '42501', message: 'a submission is logged in the person\'s own request, never on the worker\'s login' });
    // The same INSERT in the person's own request on the web's login is logged.
    expect(await submit(setup)).toMatchObject({ unattested_reason: null });
  }, 60_000);
});

describe('a submission kind read from the database', () => {
  it('is attested for no reason, unattested for the one reason, and refused for any other value', () => {
    expect(submissionSentOf(null)).toEqual({ kind: 'attested' });
    expect(submissionSentOf(REASON)).toEqual({ kind: 'unattested', reason: REASON });
    expect(() => submissionSentOf('reviewer_away')).toThrow(TypeError);
  });
});

// Last: a withdrawal of a rule release is global and permanent (pricing-race.db.test.ts holds each write alone).
describe('a re-price and a withdrawal held open together while a submission of the export not attested is logged', () => {
  it('waits for both, then logs it sent without sign-off with the most severe cause and its event once, and nothing deadlocks', async () => {
    await w.triage.pricing.loadRerunRelease();
    const setup = await exported('unattested-two-writes', false, RERUN_RELEASE);
    const { pricingRunId } = await w.as(setup.practice, setup.practice.manager, (scope) =>
      createRerun(scope, { practiceId: setup.practice.practiceId, pricingRunId: setup.runId, releaseNo: RERUN_RELEASE, requestId: 'test-rerun-two' }),
    );
    await w.triage.pricing.execute(setup.practice, pricingRunId);
    /** A write in a transaction held open until `release()`; `made` resolves once its statements ran. */
    const hold = (run: (gate: Promise<void>, made: () => void) => Promise<void>) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let signal!: () => void;
      const made = new Promise<void>((resolve) => (signal = resolve));
      return { made, release, done: run(gate, signal) };
    };
    const acceptance = hold((gate, made) =>
      w.as(setup.practice, setup.practice.manager, async (scope) => {
        await acceptRun(scope, { practiceId: setup.practice.practiceId, pricingRunId, replacesId: setup.runId , heldByIds: [] });
        made();
        await gate;
      }),
    );
    await acceptance.made;
    const withdrawal = hold(async (gate, made) => {
      await w.owner.query('BEGIN');
      try {
        await w.owner.query('INSERT INTO rule_release_withdrawal (release_no, reinstated_release_no, reason) VALUES ($1, $2, $3)', [RERUN_RELEASE, RELEASE, 'SYNTHETIC: release content was wrong, beside a re-price']);
        made();
        await gate;
        await w.owner.query('COMMIT');
      } catch (error) {
        await w.owner.query('ROLLBACK');
        throw error;
      }
    });
    await withdrawal.made;
    const waiting = (ms: number) => new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), ms));
    // The person's own INSERT of the export they sent: current when it starts, so the database decides once both commit.
    const submitting = submit(setup).then(
      (result) => ({ result, error: undefined }),
      (error: unknown) => ({ result: undefined, error }),
    );
    expect(await Promise.race([submitting.then(() => 'finished' as const), waiting(4_000)])).toBe('waiting');
    withdrawal.release();
    await withdrawal.done;
    // Still waiting: the acceptance holds the practice's lock.
    expect(await Promise.race([submitting.then(() => 'finished' as const), waiting(2_000)])).toBe('waiting');
    acceptance.release();
    await acceptance.done;
    const outcome = await submitting;
    expect(outcome.error).toBeUndefined();
    // PRICING_NOT_IN_EFFECT comes first in the check's order of severity.
    expect(outcome.result).toMatchObject({ unattested_reason: REASON, pricing_check: 'PRICING_NOT_IN_EFFECT' });
    expect(await unattestedEvents(outcome.result?.id ?? '')).toHaveLength(1);
  }, 600_000);
});
