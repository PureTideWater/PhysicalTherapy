import { RATE_RECORD_FIELDS, approveRateRecordField, approveVersion, correctMapping, signOffVersion, supersedeVersion, verifyDisputeWindow } from '@tp/contracts';
import { readDatabaseUrl } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE, RERUN_RELEASE } from '../price/test-support/pricing-world';
import { approvePacketVersion, logSubmission, writePacketVersion } from './services';
import { FIXED_97110, PacketWorld } from './test-support/packet-world';

/**
 * The one pricing check is serialized with the writes that make pricing stale (the best-option audit's item #4;
 * docs/adr/0061; migration 20261103090000's pricing_current_read_lock() and pricing_current_change_lock()). Each
 * write is made and its transaction held open while the export job, the attestation or the submission reads the
 * pricing: the step waits for it, and once it commits the step reads it and refuses (or, for a submission, flags it),
 * so no stale version is exported or attested in the window two overlapping transactions leave. SYNTHETIC CAS-08
 * under the fixed 97110 contract, its window cited and verified, one practice per case.
 */

let w: PacketWorld;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
const PLAN = 'CE:SYNPLAN-FIX-ONE';
/** Long enough for a step that does not wait to finish; a step that waits is still waiting. */
const WAIT_MS = 4_000;

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Staged {
  readonly practice: Practice;
  readonly runId: string;
  readonly planId: string;
  readonly mappingId: string;
  readonly contractVersionId: string;
  readonly versionId: string;
}

async function staged(label: string, stage: 'approved' | 'exported' | 'attested', releaseNo = RELEASE): Promise<Staged> {
  const practice = await w.practice(label);
  await w.triage.load(practice, 'CAS-08/remit.835');
  const contract = await w.triage.fixedContract(practice, FIXED_97110);
  const planId = await w.triage.pricing.planOf(practice, PLAN);
  const mappingId = await w.triage.pricing.mapped(practice, planId, 'contract', '2026-01-01', contract.versionId);
  const runId = await w.triage.pricing.createRun(practice, MARCH.from, MARCH.to, releaseNo);
  await w.triage.pricing.execute(practice, runId);
  await w.triage.triage(practice, runId);
  const { rows } = await w.as(practice, practice.manager, (scope) => scope.client.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]));
  const caseId = (rows[0] as { id: string }).id;
  const second = await w.person(practice, 'billing_manager');
  const version = await w.as(practice, practice.manager, (scope) =>
    writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: 'race-write' }),
  );
  await w.as(practice, second, (scope) => approvePacketVersion(scope, { practiceId: practice.practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: 'race-approve' }));
  if (stage !== 'approved') {
    expect((await w.export(practice, version.versionId)).outcome).toBe('exported');
  }
  if (stage === 'attested') {
    await w.attest(practice, version.versionId);
  }
  return { practice, runId, planId, mappingId, contractVersionId: contract.versionId, versionId: version.versionId };
}

/** A write made in a transaction held open until `release()`; `made` resolves once its statements ran. */
interface Held {
  readonly made: Promise<void>;
  readonly release: () => void;
  readonly done: Promise<void>;
}

function hold(run: (gate: Promise<void>, made: () => void) => Promise<void>): Held {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let signal!: () => void;
  const made = new Promise<void>((resolve) => (signal = resolve));
  return { made, release, done: run(gate, signal) };
}

/** The re-run of the case's run, priced and complete, accepted in a transaction held open. */
async function heldAcceptance(setup: Staged): Promise<Held> {
  const { pricingRunId } = await w.as(setup.practice, setup.practice.manager, (scope) => createRerun(scope, { practiceId: setup.practice.practiceId, pricingRunId: setup.runId, releaseNo: RELEASE, requestId: 'race-rerun' }));
  await w.triage.pricing.execute(setup.practice, pricingRunId);
  return hold((gate, made) =>
    w.as(setup.practice, setup.practice.manager, async (scope) => {
      await acceptRun(scope, { practiceId: setup.practice.practiceId, pricingRunId });
      made();
      await gate;
    }),
  );
}

/** A correction of the case's contract version, verified and approved, its sign-off (which supersedes the version) held open. */
async function heldCorrection(setup: Staged): Promise<Held> {
  const { practice } = setup;
  const successor = await w.triage.as(practice, w.specialist, async (context) => {
    const { versionId } = await supersedeVersion(context, { practiceId: practice.practiceId, versionId: setup.contractVersionId });
    const { rows } = await context.scope.client.query<{ id: string }>('SELECT id FROM rate_record WHERE contract_version_id = $1', [versionId]);
    for (const row of rows) {
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId: practice.practiceId, rateRecordId: row.id, field });
      }
    }
    await verifyDisputeWindow(context, { practiceId: practice.practiceId, versionId });
    await approveVersion(context, { practiceId: practice.practiceId, versionId });
    return versionId;
  });
  return hold((gate, made) =>
    w.triage.as(practice, practice.manager, async (context) => {
      await signOffVersion(context, { practiceId: practice.practiceId, versionId: successor });
      made();
      await gate;
    }),
  );
}

/** A correction of the plan's mapping to another contract from January (MAP-03), held open. */
async function heldMappingCorrection(setup: Staged): Promise<Held> {
  const other = await w.triage.fixedContract(setup.practice, { ...FIXED_97110, schedule: [{ code: '97110', amountCents: '2800' }] });
  return hold((gate, made) =>
    w.triage.as(setup.practice, setup.practice.manager, async (context) => {
      await correctMapping(context, { practiceId: setup.practice.practiceId, planId: setup.planId, kind: 'contract', contractVersionId: other.versionId, effectiveFrom: '2026-01-01', supersedesId: setup.mappingId });
      made();
      await gate;
    }),
  );
}

const sleep = (ms: number) => new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), ms));

/** Runs `step` while `held` is open: it must still be waiting after WAIT_MS; then the write commits and the step finishes. */
async function whileHeld<T>(held: Held, step: () => Promise<T>): Promise<{ readonly result: T | undefined; readonly error: unknown }> {
  await held.made;
  const running = step().then(
    (result) => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error }),
  );
  expect(await Promise.race([running.then(() => 'finished' as const), sleep(WAIT_MS)])).toBe('waiting');
  held.release();
  await held.done;
  return running;
}

async function stateOf(setup: Staged): Promise<{ readonly exported: boolean; readonly attested: boolean; readonly pricing: string }> {
  const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) =>
    scope.client.query<{ exported: boolean; attested: boolean; pricing: string }>(
      'SELECT exported_at IS NOT NULL AS exported, attested_by IS NOT NULL AS attested, packet_version_pricing_check(content) AS pricing FROM packet_version WHERE id = $1',
      [setup.versionId],
    ),
  );
  return rows[0] as { exported: boolean; attested: boolean; pricing: string };
}

const EXPORT_REFUSED = /^a packet version is exported only while its pricing is current/;

describe('the export job waits for a write that makes its pricing stale, then refuses', () => {
  it('for an acceptance of a re-run held open', async () => {
    const setup = await staged('race-export-acceptance', 'approved');
    const outcome = await whileHeld(await heldAcceptance(setup), () => w.export(setup.practice, setup.versionId));
    expect(String((outcome.error as Error | undefined)?.message)).toMatch(EXPORT_REFUSED);
    expect(await stateOf(setup)).toEqual({ exported: false, attested: false, pricing: 'PRICING_NOT_IN_EFFECT' });
  }, 300_000);

  it('for a correction’s sign-off held open, which supersedes the version that priced the lines', async () => {
    const setup = await staged('race-export-correction', 'approved');
    const outcome = await whileHeld(await heldCorrection(setup), () => w.export(setup.practice, setup.versionId));
    expect(String((outcome.error as Error | undefined)?.message)).toMatch(EXPORT_REFUSED);
    expect(await stateOf(setup)).toEqual({ exported: false, attested: false, pricing: 'CONTRACT_VERSION_NOT_SIGNED_OFF' });
  }, 300_000);

  it('for a correction of the plan’s mapping held open', async () => {
    const setup = await staged('race-export-mapping', 'approved');
    const outcome = await whileHeld(await heldMappingCorrection(setup), () => w.export(setup.practice, setup.versionId));
    expect(String((outcome.error as Error | undefined)?.message)).toMatch(EXPORT_REFUSED);
    expect(await stateOf(setup)).toEqual({ exported: false, attested: false, pricing: 'MAPPING_NOT_IN_FORCE' });
  }, 300_000);
});

describe('the attestation and the submission wait for it too', () => {
  it('refuses the attestation once an acceptance held open during it commits', async () => {
    const setup = await staged('race-attest-acceptance', 'exported');
    // The reviewer downloads both files first, so only the pricing can refuse the attestation.
    await w.download(setup.practice, await w.reviewer(setup.practice), setup.versionId);
    const outcome = await whileHeld(await heldAcceptance(setup), () => w.attest(setup.practice, setup.versionId));
    expect(String((outcome.error as Error | undefined)?.message)).toBe('a packet version whose pricing is no longer current is not attested');
    expect(await stateOf(setup)).toEqual({ exported: true, attested: false, pricing: 'PRICING_NOT_IN_EFFECT' });
  }, 300_000);

  it('logs a submission of an attested export, never refused, flagged with the change committed while it was logged', async () => {
    const setup = await staged('race-submit-correction', 'attested');
    const outcome = await whileHeld(await heldCorrection(setup), () =>
      w.as(setup.practice, setup.practice.manager, (scope) =>
        logSubmission(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: setup.versionId, submittedOn: w.today(), channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-7', followUpOn: null, requestId: 'race-submit' }),
      ),
    );
    expect(outcome.error).toBeUndefined();
    const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) =>
      scope.client.query<{ pricing_check: string }>('SELECT pricing_check FROM submission WHERE id = $1', [outcome.result?.submissionId]),
    );
    expect(rows[0]?.pricing_check).toBe('CONTRACT_VERSION_NOT_SIGNED_OFF');
  }, 300_000);
});

// Last: the release in force is global, and a withdrawal is permanent.
describe('a withdrawal of the rule release held open', () => {
  it('makes the export job wait, then refuse', async () => {
    await w.triage.pricing.loadRerunRelease();
    const setup = await staged('race-export-withdrawal', 'approved', RERUN_RELEASE);
    const held = hold(async (gate, made) => {
      await w.owner.query('BEGIN');
      try {
        await w.owner.query('INSERT INTO rule_release_withdrawal (release_no, reinstated_release_no, reason) VALUES ($1, $2, $3)', [RERUN_RELEASE, RELEASE, 'SYNTHETIC: release content was wrong']);
        made();
        await gate;
        await w.owner.query('COMMIT');
      } catch (error) {
        await w.owner.query('ROLLBACK');
        throw error;
      }
    });
    const outcome = await whileHeld(held, () => w.export(setup.practice, setup.versionId));
    expect(String((outcome.error as Error | undefined)?.message)).toMatch(EXPORT_REFUSED);
    expect(await stateOf(setup)).toEqual({ exported: false, attested: false, pricing: 'RELEASE_WITHDRAWN' });
  }, 300_000);
});
