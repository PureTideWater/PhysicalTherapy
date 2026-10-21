import { randomUUID } from 'node:crypto';

import { RATE_RECORD_FIELDS, amendVersion, approveRateRecordField, approveVersion, correctMapping, signOffVersion, supersedeVersion, verifyDisputeWindow } from '@tp/contracts';
import { packetExportKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type LinePricingNow, type PricingCheckCause, linePricingNow, packetPricingCheck } from '../price/pricing-check';
import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE, RERUN_RELEASE, errorOf } from '../price/test-support/pricing-world';
import { PacketRefusedError } from './records';
import { PacketRuleError, approvePacketVersion, logSubmission, requestPacketExport, writePacketVersion } from './services';
import { FIXED_97110, PacketWorld } from './test-support/packet-world';

/**
 * A packet version is approved, exported and attested only while its pricing is current, and a submission is never
 * refused for it (the best-option audit's item #4, the founder's ruling of 2026-10-18; docs/adr/0061; migration
 * 20261103090000): for each way a line's pricing stops being current after the version was written (a re-run
 * accepted since, a correction that superseded its contract version, a back-dated amendment that closed it before
 * the line's date, a correction of the plan's mapping to another contract, a rule release withdrawn since), the approval is refused in SQL, the export in the request, the
 * job and the guard, the attestation in SQL, and writing a version again names the stale line and its cause; a
 * submission of an export already attested is logged and flagged with the cause. Each case is a practice of its own
 * (SYNTHETIC CAS-08 under the fixed 97110 contract, its window cited and verified), at the stage it is checked at.
 */

let w: PacketWorld;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
const PLAN = 'CE:SYNPLAN-FIX-ONE';

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

type Stage = 'written' | 'approved' | 'exported' | 'attested';

interface Staged {
  readonly practice: Practice;
  readonly caseId: string;
  readonly runId: string;
  readonly planId: string;
  readonly mappingId: string;
  readonly contractVersionId: string;
  readonly versionId: string;
  readonly contentSha256: string;
  readonly content: { readonly lines: readonly { readonly row: number; readonly priced_line_id: string }[] };
  /** A second billing manager, who approves. */
  readonly second: string;
}

/** A practice whose one case's packet is at `stage`: written by the billing manager, approved by a second, exported by the job, attested by the reviewer. */
async function staged(label: string, stage: Stage, releaseNo = RELEASE): Promise<Staged> {
  const practice = await w.practice(label);
  await w.triage.load(practice, 'CAS-08/remit.835');
  const contract = await w.triage.fixedContract(practice, FIXED_97110);
  const planId = await w.triage.pricing.planOf(practice, PLAN);
  const mappingId = await w.triage.pricing.mapped(practice, planId, 'contract', '2026-01-01', contract.versionId);
  const runId = await w.triage.pricing.createRun(practice, MARCH.from, MARCH.to, releaseNo);
  await w.triage.pricing.execute(practice, runId);
  const triaged = await w.triage.triage(practice, runId);
  if (triaged.outcome !== 'triaged' || triaged.summary.casesOpened !== 1) {
    throw new Error('the fixture did not open one case');
  }
  const { rows } = await w.as(practice, practice.manager, (scope) => scope.client.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]));
  const caseId = (rows[0] as { id: string }).id;
  const second = await w.person(practice, 'billing_manager');
  const version = await w.as(practice, practice.manager, (scope) =>
    writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: 'test-write' }),
  );
  const setup: Staged = {
    practice,
    caseId,
    runId,
    planId,
    mappingId,
    contractVersionId: contract.versionId,
    versionId: version.versionId,
    contentSha256: version.contentSha256,
    content: { lines: version.content.lines.map((line) => ({ row: line.row, priced_line_id: line.priced_line_id })) },
    second,
  };
  if (stage === 'written') {
    return setup;
  }
  await approve(setup);
  if (stage === 'approved') {
    return setup;
  }
  const exported = await w.export(practice, version.versionId);
  if (exported.outcome !== 'exported') {
    throw new Error(`not exported: ${JSON.stringify(exported)}`);
  }
  if (stage === 'exported') {
    return setup;
  }
  await w.attest(practice, version.versionId);
  return setup;
}

const approve = (setup: Staged) =>
  w.as(setup.practice, setup.second, (scope) => approvePacketVersion(scope, { practiceId: setup.practice.practiceId, versionId: setup.versionId, versionSha256: setup.contentSha256, requestId: 'test-approve' }));

const writeAgain = (setup: Staged) =>
  w.as(setup.practice, setup.practice.manager, (scope) =>
    writePacketVersion(scope, w.keys, { practiceId: setup.practice.practiceId, caseId: setup.caseId, basedOnVersionId: setup.versionId, promptPayState: null, requestId: 'test-write-again' }),
  );

const submit = (setup: Staged) =>
  w.as(setup.practice, setup.practice.manager, (scope) =>
    logSubmission(scope, w.keys, { practiceId: setup.practice.practiceId, versionId: setup.versionId, submittedOn: w.today(), channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF-1', followUpOn: null, requestId: 'test-submit' }),
  );

const check = (setup: Staged) => w.as(setup.practice, setup.practice.manager, (scope) => packetPricingCheck(scope.client, setup.content));
const figures = (setup: Staged): Promise<readonly LinePricingNow[]> =>
  w.as(setup.practice, setup.practice.manager, (scope) => linePricingNow(scope, { practiceId: setup.practice.practiceId, content: setup.content, requestId: 'test-pricing-now' }));

/** The export's UPDATE as the job writes it, on the worker's own login in the practice's job scope, rolled back: what the guard alone holds. */
class RolledBack extends Error {}
async function guarded(setup: Staged): Promise<unknown> {
  const attempt = withJobScope(w.worker, { jobId: randomUUID(), practiceId: setup.practice.practiceId }, async (scope) => {
    const { rows } = await scope.client.query<{ packet_id: string }>('SELECT packet_id FROM packet_version WHERE id = $1', [setup.versionId]);
    const packetId = (rows[0] as { packet_id: string }).packet_id;
    await scope.client.query(
      `UPDATE packet_version SET export_pdf_key = $3, export_csv_key = $4, export_sha256 = $5, export_csv_sha256 = $6, export_verifier_report = verifier_report
        WHERE id = $1 AND practice_id = $2`,
      [setup.versionId, setup.practice.practiceId, packetExportKey(setup.practice.practiceId, packetId, randomUUID(), 'pdf'), packetExportKey(setup.practice.practiceId, packetId, randomUUID(), 'csv'), 'a'.repeat(64), 'b'.repeat(64)],
    );
    throw new RolledBack();
  });
  const error = await errorOf(attempt);
  return error instanceof RolledBack ? 'allowed' : error;
}

/** The export request, as the builder's Export button sends it: refused before anything is queued. */
async function requested(setup: Staged): Promise<{ readonly error: unknown; readonly queued: number }> {
  const queued: unknown[] = [];
  const queue = { send: (...args: unknown[]) => Promise.resolve(String(queued.push(args))) } as never;
  const error = await errorOf(w.as(setup.practice, setup.practice.manager, (scope) => requestPacketExport(scope, queue, { practiceId: setup.practice.practiceId, versionId: setup.versionId, requestId: 'test-request' })));
  return { error, queued: queued.length };
}

const submissionCheck = async (setup: Staged, submissionId: string) =>
  (await w.as(setup.practice, setup.practice.manager, (scope) => scope.client.query<{ pricing_check: string | null }>('SELECT pricing_check FROM submission WHERE id = $1', [submissionId]))).rows[0]?.pricing_check;

const CAUSE_WORDS: Readonly<Record<PricingCheckCause, RegExp>> = {
  PRICING_NOT_IN_EFFECT: /priced again since it joined the case/,
  RELEASE_WITHDRAWN: /its rule release was withdrawn since it was priced/,
  MAPPING_NOT_IN_FORCE: /its plan’s mapping was corrected since it was priced/,
  CONTRACT_VERSION_NOT_SIGNED_OFF: /its contract version is no longer signed off/,
  CONTRACT_VERSION_NOT_IN_FORCE: /its contract version no longer covers its service date/,
};

/**
 * Every stage of a case refused in the database once its pricing is no longer current for `cause` (approval, the
 * export guard, the attestation), writing the version again refused with the stale lines and the cause, and the
 * submission of an attested export logged and flagged.
 */
async function expectRefusedAtEveryStage(cases: Readonly<Record<Stage, Staged>>, cause: PricingCheckCause): Promise<void> {
  for (const setup of Object.values(cases)) {
    expect(await check(setup)).toBe(cause);
  }

  // Approval: refused in SQL, and writing the version again names the stale lines and the cause, without promising a refresh.
  const approval = await errorOf(approve(cases.written));
  expect(approval).toBeInstanceOf(PacketRuleError);
  expect((approval as Error).message).toMatch(/^a packet version is approved only while its pricing is current/);
  const rewritten = await errorOf(writeAgain(cases.written));
  expect(rewritten).toBeInstanceOf(PacketRefusedError);
  expect(rewritten).toMatchObject({ reason: 'pricing_changed' });
  expect((rewritten as Error).message).toMatch(/^line 1 of \d+ \(/);
  expect((rewritten as Error).message).toMatch(CAUSE_WORDS[cause]);
  expect((rewritten as Error).message).toMatch(
    /refreshing a case on new pricing is not available yet: write (it|them) off on the case page \((it leaves|they leave) this dispute\), then write, approve and export the packet again without (it|them)$/,
  );
  // No step that never happens: nothing re-judges the case, and a stale line never becomes current again, so waiting is no remedy.
  expect((rewritten as Error).message).not.toMatch(/judged again|\bwait/);

  // The export guard itself refuses the job's own UPDATE.
  const guard = await guarded(cases.approved);
  expect(guard).toMatchObject({ code: '23514' });
  expect((guard as Error).message).toMatch(/^a packet version is exported only while its pricing is current/);

  // The attestation: refused in SQL after the reviewer downloaded both files.
  const attestation = await errorOf(w.attest(cases.exported.practice, cases.exported.versionId));
  expect((attestation as Error).message).toBe('a packet version whose pricing is no longer current is not attested');

  // A submission already sent is logged, never refused, and flagged with the cause.
  const logged = await submit(cases.attested);
  expect(await submissionCheck(cases.attested, logged.submissionId)).toBe(cause);
}

/**
 * The export of an approved version refused before the database is asked: at the request with nothing queued, and by
 * the job with its reason (the readiness both share, apps/worker/src/packets/readiness.ts), the guard still refusing.
 */
async function expectExportRefusedBeforeTheGuard(approved: Staged): Promise<void> {
  const request = await requested(approved);
  expect(request.queued).toBe(0);
  expect(request.error).toBeInstanceOf(PacketRuleError);
  expect(await w.export(approved.practice, approved.versionId)).toEqual({ outcome: 'not_exportable', reason: 'pricing_not_current' });
  expect(await guarded(approved)).toMatchObject({ code: '23514' });
}

async function everyStage(label: string, releaseNo = RELEASE): Promise<Record<Stage, Staged>> {
  return {
    written: await staged(`${label}-written`, 'written', releaseNo),
    approved: await staged(`${label}-approved`, 'approved', releaseNo),
    exported: await staged(`${label}-exported`, 'exported', releaseNo),
    attested: await staged(`${label}-attested`, 'attested', releaseNo),
  };
}

/** The case's run priced again under `releaseNo` and accepted by the billing manager: the pricing in effect is the re-run's. */
async function acceptedRerun(setup: Staged, releaseNo = RELEASE): Promise<string> {
  const { pricingRunId } = await w.as(setup.practice, setup.practice.manager, (scope) => createRerun(scope, { practiceId: setup.practice.practiceId, pricingRunId: setup.runId, releaseNo, requestId: 'test-rerun' }));
  await w.triage.pricing.execute(setup.practice, pricingRunId);
  await w.as(setup.practice, setup.practice.manager, (scope) => acceptRun(scope, { practiceId: setup.practice.practiceId, pricingRunId }));
  return pricingRunId;
}

/** A successor of the case's contract version (a correction, or an amendment from `amendFrom`), verified by the specialist and signed off. */
async function signedSuccessor(setup: Staged, amendFrom: string | null): Promise<string> {
  const { practice } = setup;
  const successor = await w.triage.as(practice, w.specialist, async (context) => {
    const { versionId } =
      amendFrom === null
        ? await supersedeVersion(context, { practiceId: practice.practiceId, versionId: setup.contractVersionId })
        : await amendVersion(context, { practiceId: practice.practiceId, versionId: setup.contractVersionId, effectiveFrom: amendFrom });
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
  await w.triage.as(practice, practice.manager, (context) => signOffVersion(context, { practiceId: practice.practiceId, versionId: successor }));
  return successor;
}

describe('a packet version whose pricing is current', () => {
  it('is approved, exported, attested and submitted, the submission recorded as current; the guard admits its export', async () => {
    const setup = await staged('pricing-current-baseline', 'approved');
    expect(await check(setup)).toBe('current');
    expect(await guarded(setup)).toBe('allowed');
    expect((await figures(setup)).every((line) => line.check === 'current' && line.now === null)).toBe(true);
    expect((await w.export(setup.practice, setup.versionId)).outcome).toBe('exported');
    await w.attest(setup.practice, setup.versionId);
    const logged = await submit(setup);
    expect(await submissionCheck(setup, logged.submissionId)).toBe('current');
  }, 180_000);
});

describe('a re-run accepted since the version was written', () => {
  let cases: Record<Stage, Staged>;
  beforeAll(async () => {
    cases = await everyStage('pricing-rerun');
    for (const setup of Object.values(cases)) {
      await acceptedRerun(setup);
    }
  }, 600_000);

  it('refuses the approval, the guard and the attestation, and flags the submission; the figures now are the re-run’s', async () => {
    // Each line then and now: priced again under the same release and contract, so the same figures on another priced line.
    const lines = await figures(cases.written);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatchObject({ check: 'PRICING_NOT_IN_EFFECT', was: { releaseNo: RELEASE }, now: { releaseNo: RELEASE, unpricedReason: null } });
      expect(line.now?.pricedLineId).not.toBe(line.was.pricedLineId);
      expect([line.now?.expectedCents, line.now?.varianceCents]).toEqual([line.was.expectedCents, line.was.varianceCents]);
    }
    await expectRefusedAtEveryStage(cases, 'PRICING_NOT_IN_EFFECT');
  }, 300_000);

  it('refuses the export at the request and in the job before the guard', async () => {
    await expectExportRefusedBeforeTheGuard(cases.approved);
  }, 120_000);
});

describe('a correction that superseded the contract version since', () => {
  let cases: Record<Stage, Staged>;
  beforeAll(async () => {
    cases = await everyStage('pricing-correction');
    for (const setup of Object.values(cases)) {
      await signedSuccessor(setup, null);
    }
  }, 600_000);

  it('refuses every step in the database and flags the submission; the lines are not priced again yet', async () => {
    expect((await figures(cases.written)).map((line) => [line.check, line.now])).toEqual(cases.written.content.lines.map(() => ['CONTRACT_VERSION_NOT_SIGNED_OFF', null]));
    await expectRefusedAtEveryStage(cases, 'CONTRACT_VERSION_NOT_SIGNED_OFF');
  }, 300_000);

  it('refuses the export at the request and in the job before the guard', async () => {
    await expectExportRefusedBeforeTheGuard(cases.approved);
  }, 120_000);
});

describe('a back-dated amendment that closed the contract version before the lines’ dates', () => {
  let cases: Record<Stage, Staged>;
  beforeAll(async () => {
    cases = await everyStage('pricing-amendment');
    for (const setup of Object.values(cases)) {
      // The March lines' version is closed at February 1 once the amendment is signed off.
      await signedSuccessor(setup, '2026-02-01');
    }
  }, 600_000);

  it('refuses every step in the database and flags the submission, though the version is still signed off', async () => {
    for (const setup of Object.values(cases)) {
      const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query<{ status: string; effective_to: string | null }>('SELECT status, effective_to::text FROM contract_version WHERE id = $1', [setup.contractVersionId]),
      );
      expect(rows[0]).toEqual({ status: 'signed_off', effective_to: '2026-02-01' });
    }
    expect((await figures(cases.written)).map((line) => [line.check, line.now])).toEqual(cases.written.content.lines.map(() => ['CONTRACT_VERSION_NOT_IN_FORCE', null]));
    await expectRefusedAtEveryStage(cases, 'CONTRACT_VERSION_NOT_IN_FORCE');
  }, 300_000);

  it('refuses the export at the request and in the job before the guard', async () => {
    await expectExportRefusedBeforeTheGuard(cases.approved);
  }, 120_000);
});

describe('a correction of the plan’s mapping since the lines were priced (MAP-03)', () => {
  let cases: Record<Stage, Staged>;
  beforeAll(async () => {
    cases = await everyStage('pricing-mapping');
    for (const setup of Object.values(cases)) {
      // The plan mapped from January to another contract that pays what the payer paid: under it nothing is owed.
      const other = await w.triage.fixedContract(setup.practice, { ...FIXED_97110, schedule: [{ code: '97110', amountCents: '2800' }] });
      await w.triage.as(setup.practice, setup.practice.manager, (context) =>
        correctMapping(context, { practiceId: setup.practice.practiceId, planId: setup.planId, kind: 'contract', contractVersionId: other.versionId, effectiveFrom: '2026-01-01', supersedesId: setup.mappingId }),
      );
    }
  }, 600_000);

  it('refuses every step in the database and flags the submission, though the old contract version is still signed off and covers the lines', async () => {
    for (const setup of Object.values(cases)) {
      const { rows } = await w.as(setup.practice, setup.practice.manager, (scope) =>
        scope.client.query<{ status: string; effective_to: string | null }>('SELECT status, effective_to::text FROM contract_version WHERE id = $1', [setup.contractVersionId]),
      );
      expect(rows[0]).toEqual({ status: 'signed_off', effective_to: null });
    }
    expect((await figures(cases.written)).map((line) => [line.check, line.now])).toEqual(cases.written.content.lines.map(() => ['MAPPING_NOT_IN_FORCE', null]));
    await expectRefusedAtEveryStage(cases, 'MAPPING_NOT_IN_FORCE');
  }, 300_000);

  it('refuses the export at the request and in the job before the guard', async () => {
    await expectExportRefusedBeforeTheGuard(cases.approved);
  }, 120_000);
});

// Last: the release in force is global, and a withdrawal is permanent.
describe('a rule release withdrawn since the lines were priced', () => {
  let cases: Record<Stage, Staged>;
  beforeAll(async () => {
    await w.triage.pricing.loadRerunRelease();
    cases = await everyStage('pricing-withdrawn', RERUN_RELEASE);
    await w.triage.pricing.withdraw(RERUN_RELEASE, 'SYNTHETIC: release 2 content was wrong');
  }, 600_000);

  it('refuses every step in the database and flags the submission while the lines stay in effect, not priced again yet', async () => {
    expect((await figures(cases.approved)).map((line) => [line.check, line.was.releaseNo, line.now])).toEqual(cases.approved.content.lines.map(() => ['RELEASE_WITHDRAWN', RERUN_RELEASE, null]));
    await expectRefusedAtEveryStage(cases, 'RELEASE_WITHDRAWN');
  }, 300_000);

  it('refuses the export at the request and in the job before the guard', async () => {
    await expectExportRefusedBeforeTheGuard(cases.approved);
  }, 120_000);
});
