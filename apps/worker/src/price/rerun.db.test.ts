import { randomUUID } from 'node:crypto';

import { correctMapping } from '@tp/contracts';
import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { canonicalJson } from '@tp/rules';
import { parseTrace, recompute } from '@tp/pricing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RuleReleaseMismatchError, currentReleaseNo, loadRuleRelease, releaseWithdrawals } from './release';
import { RunComparisonError, compareRuns } from './diff';
import { completeRuns, runReleaseImpact } from './impact';
import { RerunRefusedError, acceptRun, createRerun, rerunReasons } from './rerun';
import { type Practice, PricingWorld, RELEASE, RERUN_RELEASE, errorOf } from './test-support/pricing-world';

/**
 * Re-runs, their diffs, their acceptance and a content rollback against PostgreSQL (PRD 5, J6 and J17;
 * PRD 7, Pricing runs; PRD 9, The release pipeline steps 4 and 5; PRD 18, Releases; test matrix PRC-19,
 * MAP-03; docs/adr/0037). SYNTHETIC 835s are loaded by the parse_835 job, plans mapped and contracts
 * signed off through @tp/contracts' services, runs created and re-run in the billing manager's scope
 * and executed by the price job. The cases run in order in one scratch database, because the release
 * in force is global: first under SYNTHETIC release 900001, then under 900004 (900001 with the 97110
 * work RVU raised, the "release 2" of PRC-19), then after 900004 is withdrawn.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const scopeOf = <T>(target: Practice, actorId: string, run: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) =>
  withPracticeScope(w.app, { actorId, practiceIds: [target.practiceId] }, run);
const rerun = (target: Practice, pricingRunId: string, releaseNo: number, actorId = target.manager) =>
  scopeOf(target, actorId, (scope) => createRerun(scope, { practiceId: target.practiceId, pricingRunId, releaseNo, requestId: `test-${randomUUID()}` }));
const accept = (target: Practice, pricingRunId: string, actorId = target.manager) => scopeOf(target, actorId, (scope) => acceptRun(scope, { practiceId: target.practiceId, pricingRunId }));
const compare = (target: Practice, beforeRunId: string, afterRunId: string, filter?: 'all' | 'changed' | 'only_before' | 'only_after') =>
  scopeOf(target, target.manager, (scope) => compareRuns(scope, { practiceId: target.practiceId, beforeRunId, afterRunId, requestId: `test-${randomUUID()}`, filter }));
const asJob = <T>(target: Practice, run: Parameters<typeof withJobScope<typeof w.app, T>>[2]) => withJobScope(w.app, { jobId: randomUUID(), practiceId: target.practiceId }, run);
const reasonsOf = async (target: Practice, runId: string) => {
  const run = await w.one<{ created_at: Date; release_no: number }>('SELECT created_at, release_no FROM pricing_run WHERE id = $1', [runId]);
  return asJob(target, (scope) => rerunReasons(scope.client, { practiceId: target.practiceId, createdAt: run.created_at, releaseNo: run.release_no }));
};

/** The run row and its lines as stored, to show they never change. */
async function snapshot(runId: string): Promise<unknown> {
  const run = await w.one<object>('SELECT * FROM pricing_run WHERE id = $1', [runId]);
  const { rows } = await w.owner.query('SELECT * FROM priced_line WHERE pricing_run_id = $1 ORDER BY service_line_id', [runId]);
  return { run, lines: rows };
}

interface LineRow {
  readonly service_line_id: string;
  readonly procedure_code: string;
  readonly expected_allowed_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly adjustments_applied: unknown;
  readonly trace: unknown;
}

async function linesOf(runId: string): Promise<LineRow[]> {
  const { rows } = await w.owner.query<LineRow>(
    `SELECT p.service_line_id, l.procedure_code, p.expected_allowed_cents::text AS expected_allowed_cents, p.unpriced_reason, p.adjustments_applied, p.trace
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id WHERE p.pricing_run_id = $1 ORDER BY p.service_line_id`,
    [runId],
  );
  return rows;
}

function expectTracesRecompute(lines: readonly LineRow[], release: number): void {
  for (const line of lines) {
    expect(parseTrace(line.trace).release.number).toBe(release);
    if (line.unpriced_reason === null) {
      const again = recompute(line.trace);
      expect(again.differences).toEqual([]);
      expect(again.outcome === 'priced' ? again.expectedAllowedCents.toString() : null).toBe(line.expected_allowed_cents);
    }
  }
}

/** The SHA-256 the release stored for a rule's record. */
async function recordSha(release: number, type: string, key: object): Promise<string> {
  return (await w.one<{ sha256: string }>('SELECT sha256 FROM rule_record WHERE release_no = $1 AND record_type = $2 AND key = $3::jsonb', [release, type, JSON.stringify(key)])).sha256;
}

describe('MAP-03: a re-run after a mapping is corrected', () => {
  it('prices the same lines again, never changes the first run, lists exactly the changed lines with the mapping and version as causes, and is in effect only once accepted', async () => {
    const target = await w.practice('rerun-map-03');
    await w.load(target, 'MAP-03/remit.835');
    const planId = await w.planOf(target, 'CE:SYNPLAN-COMM-03');
    const wrong = await w.mapped(target, planId, 'no_agreement', '2026-01-01');
    const first = await w.createRun(target, '2026-05-01', '2026-05-31');
    await w.execute(target, first);
    const before = await snapshot(first);

    const signed = await w.signedContract(target, '2026-01-01');
    const right = (
      await w.as(target, target.manager, (context) =>
        correctMapping(context, { practiceId: target.practiceId, planId, kind: 'contract', contractVersionId: signed.versionId, effectiveFrom: '2026-01-01', supersedesId: wrong }),
      )
    ).mappingId;
    expect(await reasonsOf(target, first)).toEqual(['mapping_changed', 'version_signed_off']);

    const created = await rerun(target, first, RELEASE);
    expect(created).toMatchObject({ rerunOfId: first, releaseNo: RELEASE });
    expect(await w.one('SELECT rerun_of_id, status, accepted_at, lines_loaded_by = (SELECT created_at FROM pricing_run WHERE id = $2) AS same_cut_off FROM pricing_run WHERE id = $1', [created.pricingRunId, first])).toEqual({
      rerun_of_id: first,
      status: 'queued',
      accepted_at: null,
      same_cut_off: true,
    });
    await w.execute(target, created.pricingRunId);
    expect(await snapshot(first)).toEqual(before);

    const diff = await compare(target, first, created.pricingRunId);
    expect(diff.summary).toEqual({ compared: 3, changed: 3, onlyBefore: 0, onlyAfter: 0, mappingChanged: 3, versionChanged: 3, beforeExpectedCents: '0', afterExpectedCents: expect.stringMatching(/^[1-9]\d*$/) });
    expect(diff.lines).toHaveLength(3);
    for (const line of diff.lines) {
      expect(line.kind).toBe('changed');
      expect(line.before).toMatchObject({ unpricedReason: 'NO_AGREEMENT', expectedAllowedCents: null, mappingId: wrong });
      expect(line.after).toMatchObject({ unpricedReason: null, method: 'PERCENT_OF_MEDICARE', mappingId: right, contractVersionId: signed.versionId, rateRecordId: signed.rateRecordId });
      expect(line.causes).toEqual([
        { kind: 'mapping', before: { mappingId: wrong, mappingKind: 'no_agreement' }, after: { mappingId: right, mappingKind: 'contract' } },
        { kind: 'contract_version', before: { contractVersionId: null, rateRecordId: null }, after: { contractVersionId: signed.versionId, rateRecordId: signed.rateRecordId } },
      ]);
    }
    expect((await compare(target, first, created.pricingRunId, 'only_after')).lines).toEqual([]);
    expectTracesRecompute(await linesOf(created.pricingRunId), RELEASE);

    // Accepting: not by a role that cannot map plans (the database refuses it too), once, and never a first run.
    const analyst = await createUser(w.owner);
    await addMembership(w.owner, target.world.organizationId, analyst, 'analyst');
    await expect(accept(target, created.pricingRunId, analyst)).rejects.toThrow(/row-level security/);
    await expect(accept(target, first)).rejects.toMatchObject({ name: 'RerunRefusedError', reason: 'not_rerun' });
    const accepted = await accept(target, created.pricingRunId);
    expect(accepted).toMatchObject({ pricingRunId: created.pricingRunId, acceptedBy: target.manager, alreadyAccepted: false });
    expect(await accept(target, created.pricingRunId)).toEqual({ ...accepted, alreadyAccepted: true });
    await expect(
      asOwner(w.owner, [target.practiceId], () => w.owner.query('UPDATE pricing_run SET accepted_at = now() WHERE id = $1', [created.pricingRunId]), target.manager),
    ).rejects.toThrow(/never changes once it is complete/);
    expect(await snapshot(first)).toEqual(before);
  });
});

describe('what the database refuses of a re-run', () => {
  it('refuses a re-run of another period, cut-off or practice, of a run not complete, and acceptance of an open run', async () => {
    const target = await w.practice('rerun-refusals');
    await w.load(target, 'MAP-03/remit.835');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-COMM-03'), 'no_agreement', '2026-01-01');
    const first = await w.createRun(target, '2026-05-01', '2026-05-31');
    const insert = (columns: string, values: string) =>
      asOwner(
        w.owner,
        [target.practiceId],
        () =>
          w.owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by${columns})
             SELECT practice_id, $2::date, period_to, release_no, engine_version, created_by, id, $3::timestamptz${values} FROM pricing_run WHERE id = $1`,
            [first, '2026-05-01', null],
          ),
        target.manager,
      );
    // The first run is still queued: nothing prices it again yet.
    expect(await errorOf(rerun(target, first, RELEASE))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_complete' });
    await expect(
      asOwner(
        w.owner,
        [target.practiceId],
        () =>
          w.owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by)
             SELECT practice_id, period_from, period_to, release_no, engine_version, created_by, id, created_at FROM pricing_run WHERE id = $1`,
            [first],
          ),
        target.manager,
      ),
    ).rejects.toThrow(/a re-run prices a complete run of its own practice again/);
    await w.execute(target, first);
    await expect(insert('', '')).rejects.toThrow(/pricing_run_rerun_pins_its_lines|re-run prices the period and the lines/);
    await expect(
      asOwner(
        w.owner,
        [target.practiceId],
        () =>
          w.owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by)
             SELECT practice_id, '2026-04-01', period_to, release_no, engine_version, created_by, id, created_at FROM pricing_run WHERE id = $1`,
            [first],
          ),
        target.manager,
      ),
    ).rejects.toThrow(/a re-run prices the period and the lines of the run it prices again/);
    await expect(
      asOwner(
        w.owner,
        [target.practiceId],
        () =>
          w.owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by)
             SELECT practice_id, period_from, period_to, release_no, engine_version, created_by, id, created_at - interval '1 second' FROM pricing_run WHERE id = $1`,
            [first],
          ),
        target.manager,
      ),
    ).rejects.toThrow(/a re-run prices the period and the lines of the run it prices again/);
    await expect(
      asOwner(
        w.owner,
        [target.practiceId],
        () =>
          w.owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by, accepted_by, accepted_at)
             SELECT practice_id, period_from, period_to, release_no, engine_version, created_by, id, created_at, created_by, now() FROM pricing_run WHERE id = $1`,
            [first],
          ),
        target.manager,
      ),
    ).rejects.toThrow(/pricing_run_accepts_complete_reruns|a pricing run starts queued/);

    // Another practice's run is not found, in code and in the database.
    const other = await w.practice('rerun-refusals-other');
    expect(await errorOf(rerun(other, first, RELEASE, other.manager))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_found' });
    expect(await errorOf(accept(other, first, other.manager))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_found' });

    // An open re-run is not accepted.
    const queued = await rerun(target, first, RELEASE);
    expect(await errorOf(accept(target, queued.pricingRunId))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_complete' });
    await expect(
      asOwner(w.owner, [target.practiceId], () => w.owner.query('UPDATE pricing_run SET accepted_by = $2, accepted_at = now() WHERE id = $1', [queued.pricingRunId, target.manager]), target.manager),
    ).rejects.toThrow(/pricing_run_accepts_complete_reruns|only a complete re-run is accepted/);

    // Two runs are compared only when both are the practice's and complete.
    expect(await errorOf(compare(target, first, queued.pricingRunId))).toMatchObject({ name: 'RunComparisonError', reason: 'not_complete' });
    expect(await errorOf(compare(target, first, randomUUID()))).toBeInstanceOf(RunComparisonError);
  });
});

let prc19: Practice;
let runA = '';
let runB = '';
let pendingRerun = '';

describe('PRC-19: a re-run under release 2 with one changed RVU', () => {
  it('lists exactly the lines whose code release 2 changes, each with the relative-value record as its cause, and changes nothing of the first run', async () => {
    prc19 = await w.practice('prc-19');
    await w.load(prc19, 'PRC-19/remit.835');
    await w.mapped(prc19, await w.planOf(prc19, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
    runA = await w.createRun(prc19, '2026-02-01', '2026-02-28');
    await w.execute(prc19, runA);
    const before = await snapshot(runA);
    expect((await linesOf(runA)).map((line) => line.procedure_code).sort()).toEqual(['97110', '97110', '97140', '97530']);

    // Lines loaded after the first run are not the re-run's: it prices exactly the lines the first run priced.
    await w.load(prc19, 'MAP-05/remit.835');
    await w.mapped(prc19, await w.planOf(prc19, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');

    await w.loadRerunRelease();
    expect(await asJob(prc19, (scope) => currentReleaseNo(scope.client))).toBe(RERUN_RELEASE);
    expect(await reasonsOf(prc19, runA)).toEqual(expect.arrayContaining(['release_published']));
    expect(await errorOf(w.createRun(prc19, '2026-02-01', '2026-02-28', RELEASE))).toBeInstanceOf(RuleReleaseMismatchError);
    expect(await errorOf(rerun(prc19, runA, RELEASE))).toBeInstanceOf(RuleReleaseMismatchError);

    // The affected lines, worked out from the two releases alone: the lines on a code whose relative
    // value 900004 changes (every line here is priced from the fee schedule).
    const { rows: changedCodes } = await w.owner.query<{ hcpcs: string }>(
      `SELECT a.key ->> 'hcpcs' AS hcpcs FROM rule_record a JOIN rule_record b ON b.record_type = a.record_type AND b.key = a.key AND b.effective_from = a.effective_from
        WHERE a.release_no = $1 AND b.release_no = $2 AND a.record_type = 'pfs_rvu' AND (a.value <> b.value OR a.effective_to IS DISTINCT FROM b.effective_to)`,
      [RELEASE, RERUN_RELEASE],
    );
    expect(changedCodes.map((row) => row.hcpcs)).toEqual(['97110']);
    const affected = (await linesOf(runA)).filter((line) => line.procedure_code === '97110').map((line) => line.service_line_id).sort();
    expect(affected).toHaveLength(2);

    // The dry run's in-memory count for the run says the same before any re-run exists.
    const release = await asJob(prc19, (scope) => loadRuleRelease(scope.client, RERUN_RELEASE));
    const [complete] = await asJob(prc19, (scope) => completeRuns(scope, prc19.practiceId, `test-${randomUUID()}`));
    expect(complete?.id).toBe(runA);
    expect(await asJob(prc19, (scope) => runReleaseImpact(scope, complete as NonNullable<typeof complete>, release, `test-${randomUUID()}`))).toEqual({
      pricingRunId: runA,
      practiceId: prc19.practiceId,
      releaseNo: RELEASE,
      lines: 4,
      changedLines: 2,
    });

    const created = await rerun(prc19, runA, RERUN_RELEASE);
    runB = created.pricingRunId;
    await w.execute(prc19, runB);
    expect(await snapshot(runA)).toEqual(before);
    const linesB = await linesOf(runB);
    expect(linesB.map((line) => line.service_line_id)).toEqual((await linesOf(runA)).map((line) => line.service_line_id));
    expectTracesRecompute(linesB, RERUN_RELEASE);

    const diff = await compare(prc19, runA, runB);
    expect(diff.summary).toMatchObject({ compared: 4, changed: 2, onlyBefore: 0, onlyAfter: 0, mappingChanged: 0, versionChanged: 0 });
    expect(diff.lines.map((line) => line.serviceLineId).sort()).toEqual(affected);
    const rvu = { before: await recordSha(RELEASE, 'pfs_rvu', { hcpcs: '97110', modifier: '' }), after: await recordSha(RERUN_RELEASE, 'pfs_rvu', { hcpcs: '97110', modifier: '' }) };
    for (const line of diff.lines) {
      expect(line).toMatchObject({ kind: 'changed', procedureCode: '97110' });
      expect(BigInt(line.after?.expectedAllowedCents ?? '0')).toBeGreaterThan(BigInt(line.before?.expectedAllowedCents ?? '0'));
      expect(line.causes).toEqual([
        {
          kind: 'release_record',
          recordType: 'pfs_rvu',
          key: { hcpcs: '97110', modifier: '' },
          before: { sha256: rvu.before, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
          after: { sha256: rvu.after, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
        },
      ]);
    }
    // The lines on the other codes price exactly as before, though their own records were re-sourced.
    const unchanged = (await linesOf(runA)).filter((line) => line.procedure_code !== '97110');
    for (const line of unchanged) {
      const again = linesB.find((other) => other.service_line_id === line.service_line_id);
      expect([again?.expected_allowed_cents, canonicalJson(again?.adjustments_applied)]).toEqual([line.expected_allowed_cents, canonicalJson(line.adjustments_applied)]);
    }
    expect(await scopeOf(prc19, prc19.manager, async (scope) => (await scope.client.query<{ n: string }>('SELECT pricing_run_changed_lines($1, $2)::text AS n', [runA, runB])).rows[0]?.n)).toBe('2');

    // A new run of the same months under release 2 prices the lines loaded since; the re-run did not.
    const fresh = await w.createRun(prc19, '2026-02-01', '2026-02-28', RERUN_RELEASE);
    await w.execute(prc19, fresh);
    expect(await linesOf(fresh)).toHaveLength(7);

    // A second re-run, left unaccepted for the rollback below.
    pendingRerun = (await rerun(prc19, runA, RERUN_RELEASE)).pricingRunId;
    await w.execute(prc19, pendingRerun);
    expect((await accept(prc19, runB)).alreadyAccepted).toBe(false);
  });
});

describe('a content rollback', () => {
  it('flags the runs pinned to the withdrawn release without changing them, and puts the previous release back in force', async () => {
    const before = { a: await snapshot(runA), b: await snapshot(runB), pending: await snapshot(pendingRerun) };
    await expect(w.withdraw(RELEASE)).rejects.toThrow(/release 900001 is not in force \(release 900004 is\)/);
    await expect(w.withdraw(RERUN_RELEASE, 'short')).rejects.toThrow(/one printable line of 8 to 500 characters/);
    await w.withdraw(RERUN_RELEASE, 'SYNTHETIC: the 97110 work RVU was mistyped');

    expect(await asJob(prc19, (scope) => currentReleaseNo(scope.client))).toBe(RELEASE);
    expect(await asJob(prc19, (scope) => releaseWithdrawals(scope.client))).toEqual([
      { releaseNo: RERUN_RELEASE, reinstatedReleaseNo: RELEASE, reason: 'SYNTHETIC: the 97110 work RVU was mistyped', withdrawnAt: expect.any(Date) },
    ]);
    // Nothing of any run changed; the runs pinned to the withdrawn release are flagged.
    expect({ a: await snapshot(runA), b: await snapshot(runB), pending: await snapshot(pendingRerun) }).toEqual(before);
    expect(await reasonsOf(prc19, runB)).toEqual(expect.arrayContaining(['release_withdrawn']));
    expect(await reasonsOf(prc19, runA)).not.toEqual(expect.arrayContaining(['release_withdrawn']));
    expect(await reasonsOf(prc19, runA)).not.toEqual(expect.arrayContaining(['release_published']));

    // Runs pin the release in force again; the withdrawn one is refused, in code and by the database.
    expect(await errorOf(w.createRun(prc19, '2026-02-01', '2026-02-28', RERUN_RELEASE))).toBeInstanceOf(RuleReleaseMismatchError);
    await expect(
      asOwner(
        w.owner,
        [prc19.practiceId],
        () =>
          w.owner.query(
            `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by) SELECT practice_id, period_from, period_to, $2, engine_version, created_by FROM pricing_run WHERE id = $1`,
            [runA, RERUN_RELEASE],
          ),
        prc19.manager,
      ),
    ).rejects.toThrow(/rule-release mismatch/);

    // A re-run pinned to the withdrawn release is never accepted.
    expect(await errorOf(accept(prc19, pendingRerun))).toMatchObject({ name: 'RerunRefusedError', reason: 'release_withdrawn' });
    expect(await errorOf(accept(prc19, pendingRerun))).toBeInstanceOf(RerunRefusedError);
    await expect(
      asOwner(w.owner, [prc19.practiceId], () => w.owner.query('UPDATE pricing_run SET accepted_by = $2, accepted_at = now() WHERE id = $1', [pendingRerun, prc19.manager]), prc19.manager),
    ).rejects.toThrow(/pinned to a withdrawn rule release is never accepted/);

    // Re-running the flagged run under the release in force lists the same two lines, back as they were.
    const back = (await rerun(prc19, runB, RELEASE)).pricingRunId;
    await w.execute(prc19, back);
    const diff = await compare(prc19, runB, back);
    expect(diff.summary).toMatchObject({ compared: 4, changed: 2 });
    expect(diff.lines.map((line) => line.procedureCode)).toEqual(['97110', '97110']);
    expect(diff.lines.flatMap((line) => line.causes.map((cause) => cause.kind))).toEqual(['release_record', 'release_record']);
    expect((await linesOf(back)).map((line) => [line.service_line_id, line.expected_allowed_cents, canonicalJson(line.adjustments_applied)])).toEqual(
      (await linesOf(runA)).map((line) => [line.service_line_id, line.expected_allowed_cents, canonicalJson(line.adjustments_applied)]),
    );

    // A withdrawal is permanent, made only of the release in force, and reinstates an earlier one.
    await expect(w.withdraw(RERUN_RELEASE)).rejects.toThrow(/release 900004 is not in force/);
    await expect(w.withdraw(RELEASE)).rejects.toThrow(/no published release before 900001 is loaded/);
    await expect(w.owner.query("UPDATE rule_release_withdrawal SET reason = 'SYNTHETIC: changed reason' WHERE release_no = $1", [RERUN_RELEASE])).rejects.toThrow(/never changes/);
    await expect(w.owner.query('DELETE FROM rule_release_withdrawal WHERE release_no = $1', [RERUN_RELEASE])).rejects.toThrow(/never changes/);
    await expect(w.owner.query("INSERT INTO rule_release_withdrawal (release_no, reinstated_release_no, reason) VALUES ($1, $1, 'SYNTHETIC: no reason')", [RELEASE])).rejects.toThrow();
    await expect(w.owner.query('TRUNCATE rule_release_withdrawal')).rejects.toThrow(/cannot be truncated/);
    expect(await errorOf(rerun(prc19, runB, RERUN_RELEASE))).toBeInstanceOf(RuleReleaseMismatchError);
  });
});
