import { randomUUID } from 'node:crypto';

import { correctMapping } from '@tp/contracts';
import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { canonicalJson } from '@tp/rules';
import { parseTrace, recompute } from '@tp/pricing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RuleReleaseMismatchError, currentReleaseNo, loadRuleRelease, releaseWithdrawals } from './release';
import { RunComparisonError, acceptanceHeldBy, compareAcceptance, compareRuns } from './diff';
import type { JobContext } from '../jobs/handlers';
import { executePricingRun, failRun } from './execute';
import { completeRuns, runReleaseImpact } from './impact';
import { PRICED_IN_EFFECT, RERUN_ACCEPTANCE, RERUN_SUPERSEDED, RUN_IN_EFFECT } from './in-effect';
import { RerunRefusedError, acceptRun, createRerun, rerunBlock, rerunReasons } from './rerun';
import { type Practice, PricingWorld, RELEASE, RERUN_RELEASE, errorOf } from './test-support/pricing-world';
import { RunModel } from './test-support/rerun-model';

/**
 * Re-runs, their diffs, their acceptance and a content rollback against PostgreSQL (PRD 5, J6 and J17;
 * PRD 7, Pricing runs; PRD 9, The release pipeline steps 4 and 5; PRD 18, Releases; test matrix PRC-19,
 * MAP-03; docs/adr/0037). SYNTHETIC 835s are loaded by the parse_835 job, plans mapped and contracts
 * signed off through @tp/contracts' services, runs created and re-run in the billing manager's scope
 * and executed by the price job. The cases run in order in one scratch database, because the release
 * in force is global: first under SYNTHETIC release 900001, then under 900004 (900001 with the 97110
 * work RVU raised, the "release 2" of PRC-19), then after 900004 is withdrawn.
 *
 * A re-run is accepted only while nothing in effect for overlapping service dates is newer than it, and
 * only the run in effect is re-run (combined audit #10; test matrix PRC-25 to PRC-28; docs/adr/0037,
 * amendment of 2026-10-26): a late line priced by a newer run, two re-runs accepted in either order and
 * at once, overlapping periods, a first run still being priced, a run pinned to a withdrawn release, and
 * runs that are not in effect. The concurrency cases hold one transaction open while the other waits on
 * the practice's pricing_current lock (the pattern of packets/pricing-race.db.test.ts). The parity case
 * at the end reads every run of the file against the database's pricing_run_in_effect(), and the model
 * case ties rerun-rule.property.test.ts's model to the SQL.
 */

let w: PricingWorld;
/** Every practice of the file, for the parity case at the end. */
const practices: Practice[] = [];
/** Long enough for a step that does not wait to finish; a step that waits is still waiting (packets/pricing-race.db.test.ts). */
const WAIT_MS = 4_000;
const FEBRUARY = { from: '2026-02-01', to: '2026-02-28' } as const;
const QUARTER = { from: '2026-01-01', to: '2026-03-31' } as const;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

/** A practice of this file (PricingWorld.practice), kept for the parity case. */
async function practice(label: string): Promise<Practice> {
  const made = await w.practice(label);
  practices.push(made);
  return made;
}

const scopeOf = <T>(target: Practice, actorId: string, run: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) =>
  withPracticeScope(w.app, { actorId, practiceIds: [target.practiceId] }, run);
const rerun = (target: Practice, pricingRunId: string, releaseNo: number, actorId = target.manager) =>
  scopeOf(target, actorId, (scope) => createRerun(scope, { practiceId: target.practiceId, pricingRunId, releaseNo, requestId: `test-${randomUUID()}` }));
/**
 * Accepts the re-run in place of `replacesId`, the run its diff was shown against, and with the runs of other dates
 * that diff read (`heldByIds`), by default those its page reads now.
 */
const accept = (target: Practice, pricingRunId: string, replacesId: string, actorId = target.manager, heldByIds?: readonly string[]) =>
  scopeOf(target, actorId, async (scope) =>
    acceptRun(scope, { practiceId: target.practiceId, pricingRunId, replacesId, heldByIds: heldByIds ?? (await acceptanceHeldBy(scope.client, target.practiceId, pricingRunId, replacesId)) }),
  );
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

/** A practice with PRC-19's SYNTHETIC 835 loaded (four February lines) and its plan mapped; returns the mapping too. */
async function februaryPractice(label: string): Promise<{ readonly target: Practice; readonly mappingId: string; readonly planId: string }> {
  const target = await practice(label);
  await w.load(target, 'PRC-19/remit.835');
  const planId = await w.planOf(target, 'CE:SYNPLAN-MA-NC');
  return { target, planId, mappingId: await w.mapped(target, planId, 'ma_noncontracted', '2026-01-01') };
}

/** Three later February lines: the SYNTHETIC 835 PRC-19's "lines loaded since" step loads, its plan mapped. */
async function lateLines(target: Practice): Promise<void> {
  await w.load(target, 'MAP-05/remit.835');
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-05'), 'ma_noncontracted', '2026-01-01');
}

/** PRC-19's SYNTHETIC 835 moved to April (its own payment, claims and interchange): lines no February or quarter run prices. */
async function aprilLines(target: Practice): Promise<void> {
  await w.loadVariant(target, 'PRC-19/remit.835', [
    ['DTM*472*202602', 'DTM*472*202604'],
    ['SYNEFTPRC19001', 'SYNEFTPRC19APR'],
    ['SYNPCNPRC19', 'SYNPCNPRCAP'],
    ['SYNCCNPRC19', 'SYNCCNPRCAP'],
    ['40190001', '40190002'],
  ]);
}

/** A first run of the period, created and executed. */
async function priced(target: Practice, period: { readonly from: string; readonly to: string }, releaseNo = RELEASE): Promise<string> {
  const id = await w.createRun(target, period.from, period.to, releaseNo);
  await w.execute(target, id);
  return id;
}

/** A re-run of the run, created and executed. */
async function repriced(target: Practice, of: string, releaseNo = RELEASE): Promise<string> {
  const id = (await rerun(target, of, releaseNo)).pricingRunId;
  await w.execute(target, id);
  return id;
}

const blockOf = (target: Practice, runId: string) => scopeOf(target, target.manager, (scope) => rerunBlock(scope.client, target.practiceId, runId));

/** Whether the run is the run in effect for its period (RUN_IN_EFFECT). */
async function inEffectRun(runId: string): Promise<boolean> {
  return (await w.one<{ in_effect: boolean }>(`SELECT ${RUN_IN_EFFECT('r')} AS in_effect FROM pricing_run r WHERE r.id = $1`, [runId])).in_effect;
}

/** Each service line's pricing in effect (PRICED_IN_EFFECT), as the run it is in, read in the manager's scope. */
async function pricingInEffect(target: Practice): Promise<Record<string, string>> {
  return scopeOf(target, target.manager, async (scope) => {
    const { rows } = await scope.client.query<{ service_line_id: string; pricing_run_id: string }>(`SELECT p.service_line_id, p.pricing_run_id FROM (${PRICED_IN_EFFECT('$1', 'true')}) p`, [target.practiceId]);
    return Object.fromEntries(rows.map((row) => [row.service_line_id, row.pricing_run_id]));
  });
}

/** The service lines a run priced. */
async function serviceLinesOf(runId: string): Promise<string[]> {
  return (await linesOf(runId)).map((line) => line.service_line_id);
}

/** A first run held at running, as a price job leaves it between its two transactions (the trigger allows queued to running). */
async function running(target: Practice, runId: string): Promise<void> {
  await asOwner(w.owner, [target.practiceId], () => w.owner.query("UPDATE pricing_run SET status = 'running' WHERE id = $1", [runId]), target.manager);
}

/** The price job's failure of a run, on the worker's login. */
async function failed(target: Practice, runId: string): Promise<void> {
  expect(await w.jobContext(target.practiceId).transaction((scope) => failRun(scope.client, target.practiceId, runId, 'job_failed'))).toBe(true);
}

/** What an acceptance came to: accepted, or the refusal's reason. */
async function outcomeOf(attempt: Promise<unknown>): Promise<string> {
  const error = await errorOf(attempt);
  if (error === undefined) {
    return 'accepted';
  }
  return error instanceof RerunRefusedError ? error.reason : error instanceof Error ? error.message : 'not an error';
}

/**
 * A transaction in the manager's scope that opens, pins its now() and signals `opened`, then waits for `go()` before
 * its work; `settled` tells whether the work has finished (packets/unattested-submission.db.test.ts's hold).
 */
function opening<T>(target: Practice, work: (scope: Parameters<Parameters<typeof withPracticeScope<typeof w.app, T>>[2]>[0]) => Promise<T>) {
  let go!: () => void;
  const gate = new Promise<void>((resolve) => (go = resolve));
  let opened!: () => void;
  const open = new Promise<void>((resolve) => (opened = resolve));
  let settled = false;
  const done = scopeOf(target, target.manager, async (scope) => {
    await scope.client.query('SELECT now()');
    opened();
    await gate;
    return work(scope);
  });
  const result = errorOf(done).finally(() => {
    settled = true;
  });
  return { open, go, result, settled: () => settled };
}

/** A transaction in the manager's scope whose work runs at once and that stays open until `release()`. */
function held(target: Practice, work: (scope: Parameters<Parameters<typeof withPracticeScope<typeof w.app, unknown>>[2]>[0]) => Promise<unknown>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let made!: () => void;
  const ran = new Promise<void>((resolve) => (made = resolve));
  const done = scopeOf(target, target.manager, async (scope) => {
    await work(scope);
    made();
    await gate;
  });
  return { made: ran, release, result: errorOf(done) };
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('MAP-03: a re-run after a mapping is corrected', () => {
  it('prices the same lines again, never changes the first run, lists exactly the changed lines with the mapping and version as causes, and is in effect only once accepted', async () => {
    const target = await practice('rerun-map-03');
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
    expect(diff.summary).toEqual({
      compared: 3,
      changed: 3,
      onlyBefore: 0,
      onlyAfter: 0,
      mappingChanged: 3,
      versionChanged: 3,
      windowChanged: 0,
      reviewFlagsChanged: 0,
      beforeExpectedCents: '0',
      afterExpectedCents: expect.stringMatching(/^[1-9]\d*$/),
    });
    expect(diff.lines).toHaveLength(3);
    for (const line of diff.lines) {
      expect(line.kind).toBe('changed');
      expect(line.changes).toEqual(['expected_allowed', 'unpriced_reason', 'terms']);
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
    await expect(accept(target, created.pricingRunId, first, analyst)).rejects.toThrow(/row-level security/);
    await expect(accept(target, first, first)).rejects.toMatchObject({ name: 'RerunRefusedError', reason: 'not_rerun' });
    const accepted = await accept(target, created.pricingRunId, first);
    expect(accepted).toMatchObject({ pricingRunId: created.pricingRunId, acceptedBy: target.manager, alreadyAccepted: false });
    expect(await accept(target, created.pricingRunId, first)).toEqual({ ...accepted, alreadyAccepted: true });
    // An acceptance already recorded stays as it is, whatever run the request names.
    expect(await accept(target, created.pricingRunId, randomUUID())).toEqual({ ...accepted, alreadyAccepted: true });
    await expect(
      asOwner(w.owner, [target.practiceId], () => w.owner.query('UPDATE pricing_run SET accepted_at = now() WHERE id = $1', [created.pricingRunId]), target.manager),
    ).rejects.toThrow(/never changes once it is complete/);
    expect(await snapshot(first)).toEqual(before);
  });
});

describe('what the database refuses of a re-run', () => {
  it('refuses a re-run of another period, cut-off or practice, of a run not complete, and acceptance of an open run', async () => {
    const target = await practice('rerun-refusals');
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
    const other = await practice('rerun-refusals-other');
    expect(await errorOf(rerun(other, first, RELEASE, other.manager))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_found' });
    expect(await errorOf(accept(other, first, first, other.manager))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_found' });

    // An open re-run is not accepted.
    const queued = await rerun(target, first, RELEASE);
    expect(await errorOf(accept(target, queued.pricingRunId, first))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_complete' });
    await expect(
      asOwner(w.owner, [target.practiceId], () => w.owner.query('UPDATE pricing_run SET accepted_by = $2, accepted_at = now() WHERE id = $1', [queued.pricingRunId, target.manager]), target.manager),
    ).rejects.toThrow(/pricing_run_accepts_complete_reruns|only a complete re-run is accepted/);

    // Two runs are compared only when both are the practice's and complete.
    expect(await errorOf(compare(target, first, queued.pricingRunId))).toMatchObject({ name: 'RunComparisonError', reason: 'not_complete' });
    expect(await errorOf(compare(target, first, randomUUID()))).toBeInstanceOf(RunComparisonError);
  });
});

/** PRC-26's out-of-order case: a re-run under 900001, before release 2 is published (the second re-run follows it). */
const outOfOrder: { target: Practice; first: string; r1: string }[] = [];

describe('PRC-26: two re-runs of one run, the first under release 900001 (its second under 900004 follows PRC-19)', () => {
  it('prices the first re-run of each practice under release 900001', async () => {
    for (const label of ['prc-26-second-first', 'prc-26-first-first']) {
      const { target } = await februaryPractice(label);
      const first = await priced(target, FEBRUARY);
      outOfOrder.push({ target, first, r1: await repriced(target, first) });
    }
  });
});

describe('PRC-26: two re-runs of one run accepted at once', () => {
  /** A first run of February and two re-runs of it, the second priced after the first. */
  async function twoReruns(label: string): Promise<{ readonly target: Practice; readonly first: string; readonly r1: string; readonly r2: string }> {
    const { target } = await februaryPractice(label);
    const first = await priced(target, FEBRUARY);
    const r1 = await repriced(target, first);
    return { target, first, r1, r2: await repriced(target, first) };
  }
  const accepting = (target: Practice, pricingRunId: string, replacesId: string) => (scope: Parameters<Parameters<typeof withPracticeScope<typeof w.app, unknown>>[2]>[0]) =>
    acceptRun(scope, { practiceId: target.practiceId, pricingRunId, replacesId, heldByIds: [] });

  it('(i) refuses the first re-run as superseded once the second is accepted, though its transaction began first', async () => {
    const { target, first, r1, r2 } = await twoReruns('prc-26-at-once-i');
    const b = opening(target, accepting(target, r1, first));
    await b.open;
    const a = held(target, accepting(target, r2, first));
    await a.made;
    b.go();
    await pause(WAIT_MS);
    expect(b.settled()).toBe(false);
    a.release();
    expect(await a.result).toBeUndefined();
    const refused = await b.result;
    expect(refused).toMatchObject({ name: 'RerunRefusedError', reason: 'superseded' });
    expect(refused).not.toMatchObject({ code: '40P01' });
    expect(await inEffectRun(r2)).toBe(true);
  }, 60_000);

  it('(ii) refuses the second re-run as changed_meanwhile when its transaction began before the first was accepted, and accepts it made again', async () => {
    const { target, first, r1, r2 } = await twoReruns('prc-26-at-once-ii');
    const b = opening(target, accepting(target, r2, first));
    await b.open;
    const a = held(target, accepting(target, r1, first));
    await a.made;
    b.go();
    await pause(WAIT_MS);
    expect(b.settled()).toBe(false);
    a.release();
    expect(await a.result).toBeUndefined();
    expect(await b.result).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'changed_meanwhile',
      message: 'was not accepted, because a run of these service dates took effect while it was being accepted; check the page again and accept it if it is still offered',
    });
    expect(await inEffectRun(r1)).toBe(true);
    // Made again from the page that now shows its changes against the first re-run; against the first run, refused.
    expect(await errorOf(accept(target, r2, first))).toMatchObject({ name: 'RerunRefusedError', reason: 'diff_changed' });
    expect((await accept(target, r2, r1)).alreadyAccepted).toBe(false);
    expect(await inEffectRun(r2)).toBe(true);
  }, 60_000);

  it('(iii) accepts the second re-run after the first when its transaction began after the first’s', async () => {
    const { target, first, r1, r2 } = await twoReruns('prc-26-at-once-iii');
    const a = held(target, accepting(target, r1, first));
    await a.made;
    // The person accepting the second saw its changes against the first re-run (what the acceptance then replaces).
    const b = opening(target, accepting(target, r2, r1));
    await b.open;
    b.go();
    await pause(WAIT_MS);
    expect(b.settled()).toBe(false);
    a.release();
    expect(await a.result).toBeUndefined();
    expect(await b.result).toBeUndefined();
    expect(await inEffectRun(r2)).toBe(true);
    expect(await inEffectRun(r1)).toBe(false);
  }, 60_000);

  it('accepts a re-run when only runs that do not count took effect while it waited: a re-run nobody accepted, and a run of other dates', async () => {
    const { target, first, r2 } = await twoReruns('prc-26-meanwhile-others');
    const r3 = (await rerun(target, first, RELEASE)).pricingRunId;
    await aprilLines(target);
    const april = await w.createRun(target, '2026-04-01', '2026-04-30');
    const b = opening(target, accepting(target, r2, first));
    await b.open;
    await w.execute(target, r3);
    await w.execute(target, april);
    b.go();
    expect(await b.result).toBeUndefined();
    expect(await inEffectRun(r2)).toBe(true);
  }, 60_000);

  it('accepts only against the run the person’s diff was shown against (security review F1): a page loaded before another re-run was accepted is refused', async () => {
    const { target, first, r1: one, r2: two } = await twoReruns('prc-26-diff-changed');
    // The page of `two` reads its diff against the first run; then `one` is accepted, which `two` does not supersede.
    expect(await blockOf(target, two)).toEqual({ state: 'acceptable', replacesId: first });
    expect((await accept(target, one, first)).alreadyAccepted).toBe(false);
    expect(await blockOf(target, two)).toEqual({ state: 'acceptable', replacesId: one });
    expect(await errorOf(accept(target, two, first))).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'diff_changed',
      message: 'was not accepted, because the pricing it would replace has changed since its changes were shown; check the changes again and accept it if it is still offered',
    });
    expect(await w.one('SELECT accepted_at FROM pricing_run WHERE id = $1', [two])).toEqual({ accepted_at: null });
    expect(await inEffectRun(one)).toBe(true);
    // Against the run it now replaces, the diff the page shows after its refresh, it is accepted.
    expect((await accept(target, two, one)).alreadyAccepted).toBe(false);
    expect(await inEffectRun(two)).toBe(true);
  });
});

describe('PRC-27: a re-run whose service dates overlap a run of another period, or a run still being priced', () => {
  it('(a) refuses a re-run of January to March once a February run priced after it is in effect, and accepts a second re-run', async () => {
    const { target, planId, mappingId } = await februaryPractice('prc-27-a');
    const quarter = await priced(target, QUARTER);
    const stale = await repriced(target, quarter);
    await w.as(target, target.manager, (context) => correctMapping(context, { practiceId: target.practiceId, planId, kind: 'no_agreement', effectiveFrom: '2026-01-01', supersedesId: mappingId }));
    const february = await priced(target, FEBRUARY);
    const refused = await errorOf(accept(target, stale, quarter));
    expect(refused).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'superseded',
      message: 'can no longer be accepted, because a run of some of these service dates holds newer pricing; re-run the run in effect for these service dates',
    });
    expect(await blockOf(target, stale)).toEqual({ state: 'superseded', originalEligible: true, samePeriodIds: [], otherPeriodIds: [february], inEffectId: quarter });
    // February's lines keep the February run's terms (the corrected mapping), not the stale re-run's.
    const shared = await serviceLinesOf(february);
    expect(Object.fromEntries(shared.map((line) => [line, february]))).toEqual(await pricingInEffect(target));
    expect((await linesOf(february)).every((line) => line.unpriced_reason === 'NO_AGREEMENT')).toBe(true);
    // Re-running the January-to-March run again prices after the February run: it is accepted, and every line it prices reads it.
    const fresh = await repriced(target, quarter);
    expect(await blockOf(target, fresh)).toEqual({ state: 'acceptable', replacesId: quarter });
    expect((await accept(target, fresh, quarter)).alreadyAccepted).toBe(false);
    expect(await pricingInEffect(target)).toEqual(Object.fromEntries((await serviceLinesOf(fresh)).map((line) => [line, fresh])));
  });

  it('(b) accepts a re-run of January to March created after a February run completed, and the February run keeps its own lines', async () => {
    const { target } = await februaryPractice('prc-27-b');
    const quarter = await priced(target, QUARTER);
    await lateLines(target);
    const february = await priced(target, FEBRUARY);
    const again = await repriced(target, quarter);
    expect((await accept(target, again, quarter)).alreadyAccepted).toBe(false);
    const inEffect = await pricingInEffect(target);
    const common = await serviceLinesOf(again);
    const onlyFebruary = (await serviceLinesOf(february)).filter((line) => !common.includes(line));
    expect(onlyFebruary).toHaveLength(3);
    expect(common.map((line) => inEffect[line])).toEqual(common.map(() => again));
    expect(onlyFebruary.map((line) => inEffect[line])).toEqual(onlyFebruary.map(() => february));
  });

  it('(b2) judges by pricing order, not creation order: a February run created after the re-run but priced before it does not refuse it', async () => {
    const { target } = await februaryPractice('prc-27-b2');
    const quarter = await priced(target, QUARTER);
    await lateLines(target);
    const again = (await rerun(target, quarter, RELEASE)).pricingRunId;
    const february = await w.createRun(target, FEBRUARY.from, FEBRUARY.to);
    await w.execute(target, february);
    await w.execute(target, again);
    expect((await accept(target, again, quarter)).alreadyAccepted).toBe(false);
    const inEffect = await pricingInEffect(target);
    const common = await serviceLinesOf(again);
    const onlyFebruary = (await serviceLinesOf(february)).filter((line) => !common.includes(line));
    expect(common.map((line) => inEffect[line])).toEqual(common.map(() => again));
    expect(onlyFebruary.length).toBeGreaterThan(0);
    expect(onlyFebruary.map((line) => inEffect[line])).toEqual(onlyFebruary.map(() => february));
  });

  it('(c) refuses a new re-run while a February first run is queued, accepts the existing re-run, and the queued run then takes effect after it', async () => {
    const { target } = await februaryPractice('prc-27-c');
    const quarter = await priced(target, QUARTER);
    const again = await repriced(target, quarter);
    const february = await w.createRun(target, FEBRUARY.from, FEBRUARY.to);
    expect(await errorOf(rerun(target, quarter, RELEASE))).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'newer_run_pending',
      message: 'is not priced again yet, because a newer run of these service dates is waiting to be priced or being priced; once it finishes, re-run the run in effect',
    });
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: quarter });
    const accepted = await accept(target, again, quarter);
    await w.execute(target, february);
    const since = await w.one<{ completed_at: Date }>('SELECT completed_at FROM pricing_run WHERE id = $1', [february]);
    expect(since.completed_at.getTime()).toBeGreaterThan(accepted.acceptedAt.getTime());
    expect(await inEffectRun(february)).toBe(true);
    expect(await inEffectRun(again)).toBe(true);
    const inEffect = await pricingInEffect(target);
    expect((await serviceLinesOf(february)).map((line) => inEffect[line])).toEqual((await serviceLinesOf(february)).map(() => february));
  });

  it('(d, e) refuses acceptance and a new re-run while a February first run is being priced, and accepts once it fails', async () => {
    const { target } = await februaryPractice('prc-27-d');
    const quarter = await priced(target, QUARTER);
    const again = await repriced(target, quarter);
    const february = await w.createRun(target, FEBRUARY.from, FEBRUARY.to);
    await running(target, february);
    expect(await errorOf(accept(target, again, quarter))).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'newer_run_pending',
      message: 'cannot be accepted yet, because a newer run of these service dates is being priced; wait until it finishes',
    });
    expect(await blockOf(target, again)).toEqual({ state: 'newer_run_pending', runningIds: [february] });
    // (e) Review finding 6: no re-run is created inside the window a running first run leaves.
    expect(await errorOf(rerun(target, quarter, RELEASE))).toMatchObject({ name: 'RerunRefusedError', reason: 'newer_run_pending' });
    expect(await w.one('SELECT accepted_at FROM pricing_run WHERE id = $1', [again])).toEqual({ accepted_at: null });
    await failed(target, february);
    expect((await accept(target, again, quarter)).alreadyAccepted).toBe(false);
  });
});

describe('PRC-27: runs that do not count against a re-run', () => {
  it('does not count a run of the month that took effect before the original: two first runs priced out of order', async () => {
    const { target } = await februaryPractice('prc-27-out-of-order');
    const original = await w.createRun(target, FEBRUARY.from, FEBRUARY.to);
    await lateLines(target);
    const later = await w.createRun(target, FEBRUARY.from, FEBRUARY.to);
    await w.execute(target, later);
    await w.execute(target, original);
    expect([await inEffectRun(original), await inEffectRun(later)]).toEqual([true, false]);
    const again = await repriced(target, original);
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: original });
    expect((await accept(target, again, original)).alreadyAccepted).toBe(false);
  });

  it('is not held back by a re-run of overlapping dates being priced: only a first run is waited for', async () => {
    const { target } = await februaryPractice('prc-27-rerun-running');
    const quarter = await priced(target, QUARTER);
    const again = await repriced(target, quarter);
    await running(target, (await rerun(target, quarter, RELEASE)).pricingRunId);
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: quarter });
    expect((await rerun(target, quarter, RELEASE)).rerunOfId).toBe(quarter);
    expect((await accept(target, again, quarter)).alreadyAccepted).toBe(false);
  });
});

describe('PRC-27: what accepting a re-run changes, under overlapping periods (payment-engine review F4)', () => {
  const acceptanceOf = (target: Practice, rerunId: string, replacesId: string) =>
    scopeOf(target, target.manager, (scope) => compareAcceptance(scope, { practiceId: target.practiceId, rerunId, replacesId, requestId: `test-${randomUUID()}`, perPage: 500 }));

  /** Each service line's pricing in effect, as the stored columns the diff compares (DIFFERS), by service line. */
  async function pricedInEffect(target: Practice): Promise<Record<string, string>> {
    return scopeOf(target, target.manager, async (scope) => {
      const { rows } = await scope.client.query<{ service_line_id: string; pricing: string }>(
        `SELECT p.service_line_id, jsonb_build_array(p.expected_allowed_cents::text, p.unpriced_reason, p.adjustments_applied, p.window_ends_on, coalesce(p.trace #> '{outcome,review_flags}', '[]'::jsonb),
                p.mapping_id, p.contract_version_id, p.rate_record_id)::text AS pricing
           FROM (${PRICED_IN_EFFECT('$1', 'true')}) p`,
        [target.practiceId],
      );
      return Object.fromEntries(rows.map((row) => [row.service_line_id, row.pricing]));
    });
  }

  /** Accepts the re-run with the diff its page reads, and expects that diff to list exactly the lines whose pricing in effect then changed. */
  async function expectExact(target: Practice, rerunId: string, replacesId: string, heldBy: readonly string[]) {
    const diff = await acceptanceOf(target, rerunId, replacesId);
    expect(diff.heldBy.map((run) => run.id)).toEqual(heldBy);
    const before = await pricedInEffect(target);
    expect((await accept(target, rerunId, replacesId, target.manager, heldBy)).alreadyAccepted).toBe(false);
    const after = await pricedInEffect(target);
    const moved = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((line) => before[line] !== after[line]).sort();
    expect(diff.lines.map((line) => line.serviceLineId).sort()).toEqual(moved);
    expect(diff.total).toBe(moved.length);
    return diff;
  }

  it('lists nothing for lines a February run already prices as the re-run does, though the re-run differs from the run it replaces there, and names that run', async () => {
    const { target, planId, mappingId } = await februaryPractice('prc-27-f4-nothing');
    const quarter = await priced(target, QUARTER);
    await w.as(target, target.manager, (context) => correctMapping(context, { practiceId: target.practiceId, planId, kind: 'no_agreement', effectiveFrom: '2026-01-01', supersedesId: mappingId }));
    const february = await priced(target, FEBRUARY);
    const again = await repriced(target, quarter);
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: quarter });
    // Against the January-to-March run every line changes (the corrected mapping); in effect, each already reads the February run's same pricing.
    expect((await compare(target, quarter, again)).summary).toMatchObject({ compared: 4, changed: 4 });
    const diff = await acceptanceOf(target, again, quarter);
    expect([diff.before.id, diff.after.id]).toEqual([quarter, again]);
    expect(diff.summary).toMatchObject({ compared: 4, changed: 0, onlyBefore: 0, onlyAfter: 0 });
    // A page read before the February run took effect showed no other run: that acceptance is refused, and nothing changes.
    expect(await errorOf(accept(target, again, quarter, target.manager, []))).toMatchObject({ name: 'RerunRefusedError', reason: 'diff_changed' });
    expect(await inEffectRun(quarter)).toBe(true);
    await expectExact(target, again, quarter, [february]);
  });

  it('lists each line against the pricing in effect it replaces: a February run’s, not the run the re-run prices again', async () => {
    const { target, planId, mappingId } = await februaryPractice('prc-27-f4-sides');
    const quarter = await priced(target, QUARTER);
    const corrected = await w.as(target, target.manager, (context) =>
      correctMapping(context, { practiceId: target.practiceId, planId, kind: 'no_agreement', effectiveFrom: '2026-01-01', supersedesId: mappingId }),
    );
    const february = await priced(target, FEBRUARY);
    await w.as(target, target.manager, (context) =>
      correctMapping(context, { practiceId: target.practiceId, planId, kind: 'ma_noncontracted', effectiveFrom: '2026-01-01', supersedesId: corrected.mappingId }),
    );
    const again = await repriced(target, quarter);
    const diff = await expectExact(target, again, quarter, [february]);
    expect(diff.summary).toMatchObject({ compared: 4, changed: 4 });
    expect(diff.lines.map((line) => [line.before?.pricingRunId, line.before?.unpricedReason, line.after?.pricingRunId, line.after?.unpricedReason])).toEqual(
      diff.lines.map(() => [february, 'NO_AGREEMENT', again, null]),
    );
    expect(diff.lines.every((line) => line.changes.includes('unpriced_reason') && line.causes.some((cause) => cause.kind === 'mapping'))).toBe(true);
  });

  it('is the diff with the replaced run when no other run holds a line', async () => {
    const { target } = await februaryPractice('prc-27-f4-plain');
    const quarter = await priced(target, QUARTER);
    const again = await repriced(target, quarter, RELEASE);
    const diff = await acceptanceOf(target, again, quarter);
    const plain = await scopeOf(target, target.manager, (scope) => compareRuns(scope, { practiceId: target.practiceId, beforeRunId: quarter, afterRunId: again, requestId: `test-${randomUUID()}`, perPage: 500 }));
    expect({ ...diff, heldBy: undefined }).toEqual({ ...plain, heldBy: undefined });
    await expectExact(target, again, quarter, []);
  });
});

describe('PRC-27: two executions at once (payment-engine review F1)', () => {
  it('stamps a run whose pricing began first but read its inputs last after the run that read first, so the older re-run is refused', async () => {
    const { target, planId, mappingId } = await februaryPractice('prc-27-at-once');
    const quarter = await priced(target, QUARTER);
    const stale = (await rerun(target, quarter, RELEASE)).pricingRunId;
    const february = await w.createRun(target, FEBRUARY.from, FEBRUARY.to);
    // The February run's pricing transaction begins, so its now() is fixed, and waits before the execution lock.
    const job = w.jobContext(target.practiceId);
    let transactions = 0;
    let go!: () => void;
    const gate = new Promise<void>((resolve) => (go = resolve));
    let begun!: () => void;
    const began = new Promise<void>((resolve) => (begun = resolve));
    const gated: JobContext = {
      ...job,
      transaction: (work) => {
        transactions += 1;
        if (transactions !== 2) {
          return job.transaction(work);
        }
        return job.transaction(async (scope) => {
          begun();
          await gate;
          return work(scope);
        });
      },
    };
    const pricing = executePricingRun(gated, target.practiceId, february);
    await began;
    // The re-run's pricing begins later, takes the lock first and completes; then the mapping is corrected.
    await w.execute(target, stale);
    await w.as(target, target.manager, (context) => correctMapping(context, { practiceId: target.practiceId, planId, kind: 'no_agreement', effectiveFrom: '2026-01-01', supersedesId: mappingId }));
    go();
    expect(await pricing).toMatchObject({ outcome: 'complete' });
    // It began again under the lock: its completed_at follows the re-run's, the order the two read their inputs.
    expect(transactions).toBe(3);
    const stamps = await w.one<{ february: Date; stale: Date }>('SELECT (SELECT completed_at FROM pricing_run WHERE id = $1) AS february, (SELECT completed_at FROM pricing_run WHERE id = $2) AS stale', [
      february,
      stale,
    ]);
    expect(stamps.february.getTime()).toBeGreaterThan(stamps.stale.getTime());
    expect((await linesOf(february)).every((line) => line.unpriced_reason === 'NO_AGREEMENT')).toBe(true);
    expect(await errorOf(accept(target, stale, quarter))).toMatchObject({ name: 'RerunRefusedError', reason: 'superseded' });
    expect(await blockOf(target, stale)).toEqual({ state: 'superseded', originalEligible: true, samePeriodIds: [], otherPeriodIds: [february], inEffectId: quarter });
    const shared = await serviceLinesOf(february);
    expect(Object.fromEntries(shared.map((line) => [line, february]))).toEqual(await pricingInEffect(target));
  });
});

describe('PRC-28: re-running a run that is not in effect', () => {
  it('re-runs only the run in effect, and refuses a re-run of a re-run nobody accepted, left from before this rule, as superseded', async () => {
    const { target } = await februaryPractice('prc-28');
    const first = await priced(target, FEBRUARY);
    const replacing = await repriced(target, first);
    const unaccepted = await repriced(target, first);
    expect((await accept(target, replacing, first)).alreadyAccepted).toBe(false);
    // A run an accepted re-run replaced, and a re-run nobody accepted, are not re-run.
    for (const runId of [first, unaccepted]) {
      expect(await errorOf(rerun(target, runId, RELEASE))).toMatchObject({
        name: 'RerunRefusedError',
        reason: 'not_in_effect',
        message: 'is not the run in effect for its service dates, so it is not priced again; re-run the run in effect instead',
      });
    }
    // The run in effect is re-run as before.
    expect((await rerun(target, replacing, RELEASE)).rerunOfId).toBe(replacing);

    // A chain made before this rule, as the owner role (the database still admits it; Lane A's mirror would refuse it).
    const { rows } = await asOwner(
      w.owner,
      [target.practiceId],
      () =>
        w.owner.query<{ id: string }>(
          `INSERT INTO pricing_run (practice_id, period_from, period_to, release_no, engine_version, created_by, rerun_of_id, lines_loaded_by)
           SELECT practice_id, period_from, period_to, release_no, engine_version, created_by, id, coalesce(lines_loaded_by, created_at) FROM pricing_run WHERE id = $1 RETURNING id`,
          [unaccepted],
        ),
      target.manager,
    );
    const legacy = (rows[0] as { id: string }).id;
    await w.execute(target, legacy);
    expect(await errorOf(accept(target, legacy, unaccepted))).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'superseded',
      message: 'can no longer be accepted, because the run it prices again was never in effect; re-run the run in effect for these service dates',
    });
    expect(await blockOf(target, legacy)).toMatchObject({ state: 'superseded', originalEligible: false, inEffectId: replacing });
  });
});

describe('an acceptance outside READ COMMITTED (review finding 7)', () => {
  it('is refused before it reads anything, and nothing changes', async () => {
    const { target } = await februaryPractice('rerun-isolation');
    const first = await priced(target, FEBRUARY);
    const again = await repriced(target, first);
    const refused = await errorOf(
      withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId], oneSnapshot: true }, (scope) => acceptRun(scope, { practiceId: target.practiceId, pricingRunId: again, replacesId: first, heldByIds: [] })),
    );
    expect(refused).toBeInstanceOf(Error);
    expect(refused).not.toBeInstanceOf(RerunRefusedError);
    expect((refused as Error).message).toBe('a re-run is accepted at READ COMMITTED only: an earlier snapshot would read past a change made since');
    expect(await w.one('SELECT accepted_at FROM pricing_run WHERE id = $1', [again])).toEqual({ accepted_at: null });
  });
});

describe('PRC-25 to PRC-28: the property test’s model agrees with the SQL over three hand-built sequences', () => {
  type TieStep =
    | readonly ['load', fixture: 'PRC-19' | 'MAP-05' | 'APRIL']
    | readonly ['first', name: string, period: 'february' | 'quarter' | 'april']
    | readonly ['execute', name: string]
    | readonly ['rerun', name: string, of: string, expected: string]
    | readonly ['accept', name: string, expected: string]
    | readonly ['split'];
  const MONTHS = { february: [1, 1], quarter: [0, 2], april: [3, 3] } as const;
  const PERIODS = { february: FEBRUARY, quarter: QUARTER, april: { from: '2026-04-01', to: '2026-04-30' } } as const;

  /** Plays the steps on the database and on the model, comparing every outcome, every run in effect and every re-run's acceptance. */
  async function tie(label: string, steps: readonly TieStep[]): Promise<void> {
    const target = await practice(label);
    const model = new RunModel();
    const ids = new Map<string, { readonly db: string; readonly model: number }>();
    const idOf = (name: string) => {
      const found = ids.get(name);
      if (found === undefined) {
        throw new Error(`no run named ${name}`);
      }
      return found;
    };
    for (const step of steps) {
      switch (step[0]) {
        case 'load':
          if (step[1] === 'PRC-19') {
            await w.load(target, 'PRC-19/remit.835');
            await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
            model.loadLine(1);
          } else if (step[1] === 'MAP-05') {
            await lateLines(target);
            model.loadLine(1);
          } else {
            await aprilLines(target);
            model.loadLine(3);
          }
          break;
        case 'first': {
          const period = PERIODS[step[2]];
          const db = await w.createRun(target, period.from, period.to);
          const [from, to] = MONTHS[step[2]];
          ids.set(step[1], { db, model: model.createFirstRun(from, to) });
          break;
        }
        case 'execute': {
          const run = idOf(step[1]);
          await w.execute(target, run.db);
          expect(model.price(run.model)).toBe(true);
          break;
        }
        case 'rerun': {
          const of = idOf(step[2]);
          const fromModel = model.createRerun(of.model);
          const attempt = rerun(target, of.db, RELEASE);
          expect(['refused' in fromModel ? fromModel.refused : 'created', (await outcomeOf(attempt)).replace('accepted', 'created')]).toEqual([step[3], step[3]]);
          if ('created' in fromModel) {
            ids.set(step[1], { db: (await attempt).pricingRunId, model: fromModel.created });
          }
          break;
        }
        case 'accept': {
          const run = idOf(step[1]);
          // As from a page read just now: against the run the acceptance replaces, or the original when there is none.
          const block = await blockOf(target, run.db);
          const original = [...ids.values()].find((other) => other.model === model.run(run.model)?.rerunOf);
          const replacesId = block.state === 'acceptable' ? block.replacesId : (original?.db ?? run.db);
          expect([model.accept(run.model), await outcomeOf(accept(target, run.db, replacesId))]).toEqual([step[2], step[2]]);
          break;
        }
        case 'split':
          await w.approveSplit({ '11': 'non_facility', '22': 'facility' });
          model.approveSplit();
          break;
      }
      for (const [name, run] of ids) {
        const modelled = model.run(run.model);
        if (modelled === undefined) {
          throw new Error(`no modelled run ${name}`);
        }
        expect([name, await inEffectRun(run.db)]).toEqual([name, model.runInEffect(modelled)]);
        if (modelled.rerunOf !== null && modelled.status === 'complete' && modelled.acceptedAt === null) {
          expect([name, (await blockOf(target, run.db)).state]).toEqual([name, model.acceptance(modelled)]);
        }
      }
    }
  }

  it('Sequence A: a late line priced by a newer run of the month, then the older re-run', async () => {
    await tie('tie-a', [
      ['load', 'PRC-19'],
      ['first', 'F', 'february'],
      ['execute', 'F'],
      ['rerun', 'R', 'F', 'created'],
      ['execute', 'R'],
      ['load', 'MAP-05'],
      ['first', 'X', 'february'],
      ['rerun', 'R2', 'F', 'newer_run_pending'],
      ['execute', 'X'],
      ['accept', 'R', 'superseded'],
      ['rerun', 'R2', 'F', 'not_in_effect'],
      ['rerun', 'R3', 'X', 'created'],
      ['execute', 'R3'],
      ['accept', 'R3', 'accepted'],
    ]);
  }, 120_000);

  it('Sequence B: two re-runs of one run, accepted in the order they were priced, then in the other', async () => {
    await tie('tie-b', [
      ['load', 'PRC-19'],
      ['first', 'F', 'february'],
      ['execute', 'F'],
      ['rerun', 'R1', 'F', 'created'],
      ['execute', 'R1'],
      ['rerun', 'R2', 'F', 'created'],
      ['execute', 'R2'],
      ['rerun', 'R3', 'F', 'created'],
      ['execute', 'R3'],
      ['accept', 'R1', 'accepted'],
      ['accept', 'R3', 'accepted'],
      ['accept', 'R2', 'superseded'],
      ['rerun', 'R4', 'R1', 'not_in_effect'],
    ]);
  }, 120_000);

  it('Sequence C: a re-run of January to March and a February run priced after it', async () => {
    await tie('tie-c', [
      ['load', 'PRC-19'],
      ['first', 'Q', 'quarter'],
      ['execute', 'Q'],
      ['rerun', 'R', 'Q', 'created'],
      ['execute', 'R'],
      ['load', 'MAP-05'],
      ['first', 'X', 'february'],
      ['execute', 'X'],
      ['accept', 'R', 'superseded'],
      ['rerun', 'R2', 'Q', 'created'],
      ['execute', 'R2'],
      ['accept', 'R2', 'accepted'],
    ]);
  }, 120_000);

  it('Sequence F: runs of service dates that do not overlap, waiting and then priced after the re-run, change nothing for it', async () => {
    await tie('tie-f', [
      ['load', 'PRC-19'],
      ['first', 'F', 'february'],
      ['execute', 'F'],
      ['load', 'APRIL'],
      ['first', 'A', 'april'],
      ['rerun', 'R', 'F', 'created'],
      ['execute', 'R'],
      ['execute', 'A'],
      ['accept', 'R', 'accepted'],
    ]);
  }, 120_000);

  it('Sequence D: a newer run of the month priced before the older re-run, which lacks its late line (the cut-off alone decides)', async () => {
    await tie('tie-d', [
      ['load', 'PRC-19'],
      ['first', 'F', 'february'],
      ['execute', 'F'],
      ['rerun', 'R', 'F', 'created'],
      ['load', 'MAP-05'],
      ['first', 'X', 'february'],
      ['execute', 'X'],
      ['execute', 'R'],
      ['accept', 'R', 'superseded'],
    ]);
  }, 120_000);

  it('Sequence E: a February run pinned to a later place-of-service split, priced before a re-run of January to March (the split alone decides)', async () => {
    await tie('tie-e', [
      ['load', 'PRC-19'],
      ['first', 'Q', 'quarter'],
      ['execute', 'Q'],
      ['rerun', 'R', 'Q', 'created'],
      ['split'],
      ['first', 'X', 'february'],
      ['execute', 'X'],
      ['execute', 'R'],
      ['accept', 'R', 'superseded'],
      ['rerun', 'R2', 'Q', 'created'],
      ['execute', 'R2'],
      ['accept', 'R2', 'accepted'],
    ]);
  }, 120_000);
});

describe('PRC-27: a run pinned to a later place-of-service split (payment-engine review F2)', () => {
  it('refuses a re-run of January to March once a February run pinned to a split approved after it, and priced before it, is in effect', async () => {
    const { target } = await februaryPractice('prc-27-split');
    await w.approveSplit({ '11': 'non_facility', '22': 'facility' });
    const quarter = await priced(target, QUARTER);
    const stale = (await rerun(target, quarter, RELEASE)).pricingRunId;
    await w.approveSplit({ '11': 'non_facility', '21': 'facility' });
    const february = await priced(target, FEBRUARY);
    await w.execute(target, stale);
    // Priced after the February run, under the same release: only the split the February run pinned makes it newer.
    expect(await errorOf(accept(target, stale, quarter))).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'superseded',
      message: 'can no longer be accepted, because a run of some of these service dates holds newer pricing; re-run the run in effect for these service dates',
    });
    expect(await blockOf(target, stale)).toEqual({ state: 'superseded', originalEligible: true, samePeriodIds: [], otherPeriodIds: [february], inEffectId: quarter });
    const shared = await serviceLinesOf(february);
    expect(Object.fromEntries(shared.map((line) => [line, february]))).toEqual(await pricingInEffect(target));
    // A re-run created now pins the later split too: priced after the February run, it is accepted.
    const again = await repriced(target, quarter);
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: quarter });
    expect((await accept(target, again, quarter)).alreadyAccepted).toBe(false);
    expect(await pricingInEffect(target)).toEqual(Object.fromEntries((await serviceLinesOf(again)).map((line) => [line, again])));
  });
});

/** PRC-27 (g): a re-run of January to March pinned to release 900001, left queued until a February run under 900004 is priced. */
let laterRelease: { target: Practice; quarter: string; stale: string } | undefined;

describe('PRC-27 (g): a re-run under release 900001 left queued (the February run under 900004 follows PRC-19)', () => {
  it('prices a January-to-March run and creates its re-run under release 900001', async () => {
    const { target } = await februaryPractice('prc-27-g');
    const quarter = await priced(target, QUARTER);
    laterRelease = { target, quarter, stale: (await rerun(target, quarter, RELEASE)).pricingRunId };
  });
});

let prc19: Practice;
let runA = '';
let runB = '';
let pendingRerun = '';

describe('PRC-19: a re-run under release 2 with one changed RVU', () => {
  it('lists exactly the lines whose code release 2 changes, each with the relative-value record as its cause, and changes nothing of the first run', async () => {
    prc19 = await practice('prc-19');
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
    expect(diff.summary).toMatchObject({ compared: 4, changed: 2, onlyBefore: 0, onlyAfter: 0, mappingChanged: 0, versionChanged: 0, windowChanged: 0, reviewFlagsChanged: 0 });
    expect(diff.lines.map((line) => line.serviceLineId).sort()).toEqual(affected);
    expect(diff.lines.map((line) => line.changes)).toEqual([
      ['expected_allowed', 'adjustments'],
      ['expected_allowed', 'adjustments'],
    ]);
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

    // Accepted, the re-run is the run in effect; a second re-run, of it, is left unaccepted for the rollback below.
    // (Only the run in effect is priced again, PRC-28: the first run is no longer re-run once the re-run replaced it.)
    expect((await accept(prc19, runB, runA)).alreadyAccepted).toBe(false);
    expect(await errorOf(rerun(prc19, runA, RERUN_RELEASE))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_in_effect' });
    pendingRerun = (await rerun(prc19, runB, RERUN_RELEASE)).pricingRunId;
    await w.execute(prc19, pendingRerun);
  });

  // Its own practice: in prc-19 a new first run of February would replace the accepted re-run, and after the rollback
  // release 2 is no longer the one in force.
  it('prices the lines loaded since in a new run of the same months under release 2; a re-run did not', async () => {
    const { target } = await februaryPractice('prc-19-fresh');
    const first = await priced(target, FEBRUARY, RERUN_RELEASE);
    await lateLines(target);
    const again = await repriced(target, first, RERUN_RELEASE);
    expect(await linesOf(again)).toHaveLength(4);
    const fresh = await priced(target, FEBRUARY, RERUN_RELEASE);
    expect(await linesOf(fresh)).toHaveLength(7);
  });
});

describe('PRC-25: a late line priced by a newer run of the month, then the older re-run accepted', () => {
  it('is refused as superseded; the late line keeps its pricing in effect, and the newer run is the one to re-run', async () => {
    const { target, planId, mappingId } = await februaryPractice('prc-25');
    const first = await priced(target, FEBRUARY, RERUN_RELEASE);
    const stale = await repriced(target, first, RERUN_RELEASE);
    await lateLines(target);
    const newer = await priced(target, FEBRUARY, RERUN_RELEASE);
    expect(await errorOf(accept(target, stale, first))).toMatchObject({
      name: 'RerunRefusedError',
      reason: 'superseded',
      message: 'can no longer be accepted, because a newer run of these service dates is in effect; the page is updated to name it',
    });
    expect(await w.one('SELECT accepted_at FROM pricing_run WHERE id = $1', [stale])).toEqual({ accepted_at: null });
    // Every line, the late ones too, reads the newer run, which stays in effect.
    const lines = await serviceLinesOf(newer);
    expect(lines).toHaveLength(7);
    expect(await pricingInEffect(target)).toEqual(Object.fromEntries(lines.map((line) => [line, newer])));
    expect(await inEffectRun(newer)).toBe(true);
    expect(await blockOf(target, stale)).toEqual({ state: 'superseded', originalEligible: true, samePeriodIds: [newer], otherPeriodIds: [], inEffectId: newer });
    // The newer run would price nothing differently now: what the page's "nothing more to accept" reads.
    expect(await reasonsOf(target, newer)).toEqual([]);
    expect(await errorOf(rerun(target, first, RERUN_RELEASE))).toMatchObject({ name: 'RerunRefusedError', reason: 'not_in_effect' });

    // After a mapping is corrected, re-running the run in effect is allowed and its acceptance succeeds.
    await w.as(target, target.manager, (context) => correctMapping(context, { practiceId: target.practiceId, planId, kind: 'no_agreement', effectiveFrom: '2026-01-01', supersedesId: mappingId }));
    expect(await reasonsOf(target, newer)).toEqual(['mapping_changed']);
    const again = await repriced(target, newer, RERUN_RELEASE);
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: newer });
    expect((await accept(target, again, newer)).alreadyAccepted).toBe(false);
    expect(await inEffectRun(again)).toBe(true);
  });
});

describe('PRC-27 (g): a run pinned to a later release, priced before the re-run', () => {
  it('refuses the re-run under release 900001 once a February run under 900004, priced before it, is in effect', async () => {
    if (laterRelease === undefined) {
      throw new Error('the re-run under release 900001 was not created');
    }
    const { target, quarter, stale } = laterRelease;
    const february = await priced(target, FEBRUARY, RERUN_RELEASE);
    await w.execute(target, stale);
    // Priced after the February run, with the same split: only the later release makes the February run newer.
    expect(await errorOf(accept(target, stale, quarter))).toMatchObject({ name: 'RerunRefusedError', reason: 'superseded' });
    expect(await blockOf(target, stale)).toEqual({ state: 'superseded', originalEligible: true, samePeriodIds: [], otherPeriodIds: [february], inEffectId: quarter });
    const shared = await serviceLinesOf(february);
    expect(Object.fromEntries(shared.map((line) => [line, february]))).toEqual(await pricingInEffect(target));
    expectTracesRecompute(await linesOf(february), RERUN_RELEASE);
  });
});

describe('PRC-26: two re-runs of one run, the second priced after the first under release 900004, accepted in either order', () => {
  it('refuses the first after the second as superseded, and accepts the second after the first, which it replaces', async () => {
    const [secondFirst, firstFirst] = outOfOrder;
    if (secondFirst === undefined || firstFirst === undefined) {
      throw new Error('the first re-runs were not priced');
    }
    // Accepting the second, then the first: the month ends on the second, under release 2.
    const r2 = await repriced(secondFirst.target, secondFirst.first, RERUN_RELEASE);
    expect((await accept(secondFirst.target, r2, secondFirst.first)).alreadyAccepted).toBe(false);
    expect(await errorOf(accept(secondFirst.target, secondFirst.r1, secondFirst.first))).toMatchObject({ name: 'RerunRefusedError', reason: 'superseded' });
    expect(await blockOf(secondFirst.target, secondFirst.r1)).toEqual({ state: 'superseded', originalEligible: true, samePeriodIds: [r2], otherPeriodIds: [], inEffectId: r2 });
    const linesTwo = await serviceLinesOf(r2);
    expect(await pricingInEffect(secondFirst.target)).toEqual(Object.fromEntries(linesTwo.map((line) => [line, r2])));
    expectTracesRecompute(await linesOf(r2), RERUN_RELEASE);

    // Accepting the first, then the second: the second replaces the first, and the month ends on it.
    const other = await repriced(firstFirst.target, firstFirst.first, RERUN_RELEASE);
    expect((await accept(firstFirst.target, firstFirst.r1, firstFirst.first)).alreadyAccepted).toBe(false);
    expect(await blockOf(firstFirst.target, other)).toEqual({ state: 'acceptable', replacesId: firstFirst.r1 });
    expect((await accept(firstFirst.target, other, firstFirst.r1)).alreadyAccepted).toBe(false);
    expect(await pricingInEffect(firstFirst.target)).toEqual(Object.fromEntries((await serviceLinesOf(other)).map((line) => [line, other])));
    expect(await inEffectRun(other)).toBe(true);
  });
});

/** PRC-27 (f): a January-to-March run and a February run priced under release 900004, before it is withdrawn. */
let withdrawnOverlap: { target: Practice; quarter: string; february: string } | undefined;

describe('PRC-27 (f): runs under release 900004 before it is withdrawn (the re-run follows the rollback)', () => {
  it('prices a January-to-March run, then a February run, under release 900004', async () => {
    const { target } = await februaryPractice('prc-27-f');
    const quarter = await priced(target, QUARTER, RERUN_RELEASE);
    withdrawnOverlap = { target, quarter, february: await priced(target, FEBRUARY, RERUN_RELEASE) };
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
    expect(await errorOf(accept(prc19, pendingRerun, runB))).toMatchObject({ name: 'RerunRefusedError', reason: 'release_withdrawn' });
    expect(await errorOf(accept(prc19, pendingRerun, runB))).toBeInstanceOf(RerunRefusedError);
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

describe('PRC-27 (f): a run pinned to a withdrawn release is not newer', () => {
  it('accepts a re-run under the reinstated release over a February run pinned to the withdrawn one and priced before it', async () => {
    if (withdrawnOverlap === undefined) {
      throw new Error('the runs under release 900004 were not priced');
    }
    const { target, quarter, february } = withdrawnOverlap;
    const again = await repriced(target, quarter, RELEASE);
    expect(await blockOf(target, again)).toEqual({ state: 'acceptable', replacesId: quarter });
    expect((await accept(target, again, quarter)).alreadyAccepted).toBe(false);
    // The February lines it shares read it, under the reinstated release: what the rollback intends.
    const inEffect = await pricingInEffect(target);
    const shared = (await serviceLinesOf(february)).filter((line) => inEffect[line] !== undefined);
    expect(shared.map((line) => inEffect[line])).toEqual(shared.map(() => again));
    expectTracesRecompute(await linesOf(again), RELEASE);
  });
});

describe('parity with the database (review finding 10): every run of the file, at the end', () => {
  it('reads the run in effect as pricing_run_in_effect() does, finds no re-run newer than its period superseded, and rerunBlock agrees with the run columns', async () => {
    // A re-run newer in pricing than every run of its period, so the second check is not vacuous.
    // A first run of its dates left queued, which does not hold an acceptance back (awaiting, not newer_run_pending).
    const { target } = await februaryPractice('parity');
    await repriced(target, await priced(target, FEBRUARY));
    await w.createRun(target, FEBRUARY.from, FEBRUARY.to);

    const { rows: runs } = await w.owner.query<{ id: string; app: boolean; db: boolean }>(`SELECT r.id, ${RUN_IN_EFFECT('r')} AS app, pricing_run_in_effect(r.id) AS db FROM pricing_run r ORDER BY r.id`);
    expect(runs.length).toBeGreaterThan(40);
    expect(runs.filter((run) => run.app !== run.db)).toEqual([]);

    // Wherever the original is in effect and nothing of another period overlaps, a complete re-run newer in pricing
    // than every run of its period (priced after each, on no older release that is not withdrawn, and on no split
    // approved later, read from the split table itself) is not superseded. Read with the file's practices in scope, as
    // pricing_run_split() answers.
    const { rows: newest } = await asOwner(
      w.owner,
      practices.map((each) => each.practiceId),
      () =>
        w.owner.query<{ id: string; superseded: boolean }>(
          `SELECT rr.id, ${RERUN_SUPERSEDED('rr')} AS superseded
             FROM pricing_run rr JOIN pricing_run orig ON orig.id = rr.rerun_of_id
            WHERE rr.status = 'complete' AND rr.accepted_at IS NULL AND pricing_run_in_effect(orig.id)
              AND NOT EXISTS (SELECT 1 FROM pricing_run y WHERE y.practice_id = rr.practice_id AND y.status = 'complete'
                                 AND y.period_from <= rr.period_to AND y.period_to >= rr.period_from AND (y.period_from, y.period_to) <> (rr.period_from, rr.period_to))
              AND NOT EXISTS (SELECT 1 FROM pricing_run y WHERE y.practice_id = rr.practice_id AND y.id <> rr.id AND y.status = 'complete'
                                 AND (y.period_from, y.period_to) = (rr.period_from, rr.period_to)
                                 AND (y.completed_at >= rr.completed_at OR (y.release_no > rr.release_no AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal wd WHERE wd.release_no = y.release_no))
                                      OR EXISTS (SELECT 1 FROM place_of_service_split ys WHERE ys.id = y.place_of_service_split_id
                                                  AND NOT EXISTS (SELECT 1 FROM place_of_service_split rs WHERE rs.id = rr.place_of_service_split_id AND (rs.approved_at, rs.id) >= (ys.approved_at, ys.id)))))`,
        ),
    );
    expect(newest.length).toBeGreaterThan(0);
    expect(newest.filter((run) => run.superseded)).toEqual([]);

    // The run columns' acceptance (RERUN_ACCEPTANCE), read in each practice's scope as the pages read it, for every
    // complete re-run nobody accepted: release_withdrawn for one pinned to a withdrawn release (acceptRun's first
    // refusal), and otherwise rerunBlock's state (awaiting where it is acceptable).
    const states: Record<string, number> = {};
    for (const each of practices) {
      const rows = await scopeOf(each, each.manager, async (scope) => {
        const { rows: found } = await scope.client.query<{ id: string; acceptance: string; withdrawn: boolean }>(
          `SELECT r.id, ${RERUN_ACCEPTANCE('r')} AS acceptance, EXISTS (SELECT 1 FROM rule_release_withdrawal wd WHERE wd.release_no = r.release_no) AS withdrawn
             FROM pricing_run r WHERE r.practice_id = $1 AND r.rerun_of_id IS NOT NULL AND r.status = 'complete' AND r.accepted_at IS NULL`,
          [each.practiceId],
        );
        return found;
      });
      for (const row of rows) {
        const state = (await blockOf(each, row.id)).state;
        expect([row.id, row.acceptance]).toEqual([row.id, row.withdrawn ? 'release_withdrawn' : state === 'acceptable' ? 'awaiting' : state]);
        states[row.acceptance] = (states[row.acceptance] ?? 0) + 1;
      }
    }
    expect(Object.keys(states).sort()).toEqual(['awaiting', 'release_withdrawn', 'superseded']);
  }, 120_000);
});
