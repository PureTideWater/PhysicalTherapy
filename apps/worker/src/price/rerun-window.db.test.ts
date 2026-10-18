import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { canonicalJson } from '@tp/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compareRuns } from './diff';
import { completeRuns, runReleaseImpact } from './impact';
import { currentReleaseNo, loadRuleRelease } from './release';
import { createRerun } from './rerun';
import { type Practice, PricingWorld, RELEASE, WINDOW_RELEASE } from './test-support/pricing-world';

/**
 * A re-run in which only the dispute windows move (PRD 5, J17: a re-run "lists exactly which lines would
 * change before anyone accepts it"; PRD 9, The release pipeline step 4; PRD 11 step 8: the window decides
 * whether a line is actionable; test matrix PRC-19; docs/adr/0037). A SYNTHETIC 835 is loaded by the
 * parse_835 job, its plan mapped to a signed-off contract silent on disputes, and its month priced under
 * SYNTHETIC release 900001, which has no commercial default window; then release 900003 (900001 with a
 * commercial default dispute window of 4 months from the date of service, and only sequestration and
 * MPPR records otherwise replaced, which a contract with those flags off never reads) is loaded and the
 * run priced again. Every line keeps its expected allowed, reason, adjustments, flags and terms, and
 * gains a window: the dry run, the diff and the database's count list every line, each with the window
 * as what changed and the release's window record as its cause. Its own scratch database, because the
 * release in force is global.
 */

let w: PricingWorld;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const scopeOf = <T>(target: Practice, run: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, run);
const asJob = <T>(target: Practice, run: Parameters<typeof withJobScope<typeof w.app, T>>[2]) => withJobScope(w.app, { jobId: randomUUID(), practiceId: target.practiceId }, run);

interface StoredLine {
  readonly service_line_id: string;
  readonly expected_allowed_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly adjustments_applied: unknown;
  readonly window_ends_on: string | null;
  readonly review_flags: unknown;
  readonly mapping_id: string | null;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
}

async function linesOf(runId: string): Promise<StoredLine[]> {
  const { rows } = await w.owner.query<StoredLine>(
    `SELECT service_line_id, expected_allowed_cents::text AS expected_allowed_cents, unpriced_reason, adjustments_applied, window_ends_on::text AS window_ends_on,
            trace #> '{outcome,review_flags}' AS review_flags, mapping_id, contract_version_id, rate_record_id
       FROM priced_line WHERE pricing_run_id = $1 ORDER BY service_line_id`,
    [runId],
  );
  return rows;
}

/** What the diff compared before the dispute window, the review flags and the terms were added to it. */
const pricesAndReasons = (lines: readonly StoredLine[]) => lines.map((line) => [line.service_line_id, line.expected_allowed_cents, line.unpriced_reason, canonicalJson(line.adjustments_applied)]);

describe('a re-run that moves only the dispute windows', () => {
  it('lists every line whose window moved, with the window as the change and the release window as the cause, in the dry run, the diff and the database', async () => {
    const target = await w.practice('rerun-window');
    await w.load(target, 'MAP-03/remit.835');
    const signed = await w.signedContract(target, '2026-01-01');
    await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-COMM-03'), 'contract', '2026-01-01', signed.versionId);
    const first = await w.createRun(target, '2026-05-01', '2026-05-31');
    await w.execute(target, first);
    const before = await linesOf(first);
    expect(before).toHaveLength(3);
    // Priced, with no window: the contract is silent on disputes and release 900001 has no commercial default.
    for (const line of before) {
      expect(line).toMatchObject({ unpriced_reason: null, window_ends_on: null, review_flags: [], contract_version_id: signed.versionId, rate_record_id: signed.rateRecordId });
    }

    await w.loadWindowRelease();
    expect(await asJob(target, (scope) => currentReleaseNo(scope.client))).toBe(WINDOW_RELEASE);

    // The dry run, in memory, before any re-run exists: every line's window would move.
    const release = await asJob(target, (scope) => loadRuleRelease(scope.client, WINDOW_RELEASE));
    const [complete] = await asJob(target, (scope) => completeRuns(scope, target.practiceId, `test-${randomUUID()}`));
    expect(complete?.id).toBe(first);
    expect(await asJob(target, (scope) => runReleaseImpact(scope, complete as NonNullable<typeof complete>, release, `test-${randomUUID()}`))).toEqual({
      pricingRunId: first,
      practiceId: target.practiceId,
      releaseNo: RELEASE,
      lines: 3,
      changedLines: 3,
    });

    const rerun = (await scopeOf(target, (scope) => createRerun(scope, { practiceId: target.practiceId, pricingRunId: first, releaseNo: WINDOW_RELEASE, requestId: `test-${randomUUID()}` })))
      .pricingRunId;
    await w.execute(target, rerun);
    const after = await linesOf(rerun);
    // Amounts, reasons, adjustments, flags and terms as they were: only the windows moved, to 4 months from the date of service.
    expect(pricesAndReasons(after)).toEqual(pricesAndReasons(before));
    expect(after.map((line) => [line.review_flags, line.mapping_id, line.contract_version_id, line.rate_record_id])).toEqual(
      before.map((line) => [line.review_flags, line.mapping_id, line.contract_version_id, line.rate_record_id]),
    );
    expect(after.map((line) => line.window_ends_on)).toEqual(['2026-09-20', '2026-09-20', '2026-09-20']);

    const diff = await scopeOf(target, (scope) => compareRuns(scope, { practiceId: target.practiceId, beforeRunId: first, afterRunId: rerun, requestId: `test-${randomUUID()}` }));
    expect(diff.summary).toEqual({
      compared: 3,
      changed: 3,
      onlyBefore: 0,
      onlyAfter: 0,
      mappingChanged: 0,
      versionChanged: 0,
      windowChanged: 3,
      reviewFlagsChanged: 0,
      beforeExpectedCents: diff.summary.afterExpectedCents,
      afterExpectedCents: expect.stringMatching(/^[1-9]\d*$/),
    });
    const windowRecord = (
      await w.one<{ sha256: string }>("SELECT sha256 FROM rule_record WHERE release_no = $1 AND record_type = 'dispute_window' AND key = $2::jsonb", [
        WINDOW_RELEASE,
        JSON.stringify({ program: 'commercial_default', window: 'redetermination' }),
      ])
    ).sha256;
    expect(diff.lines.map((line) => line.serviceLineId).sort()).toEqual(before.map((line) => line.service_line_id));
    for (const line of diff.lines) {
      expect(line).toMatchObject({ kind: 'changed', changes: ['window'], before: { windowEndsOn: null, reviewFlags: [] }, after: { windowEndsOn: '2026-09-20', reviewFlags: [] } });
      expect(line.after?.expectedAllowedCents).toBe(line.before?.expectedAllowedCents);
      expect(line.causes).toEqual([
        {
          kind: 'release_record',
          recordType: 'dispute_window',
          key: { program: 'commercial_default', window: 'redetermination' },
          before: null,
          after: { sha256: windowRecord, effectiveFrom: '2026-01-01', effectiveTo: null },
        },
      ]);
    }
    expect(await scopeOf(target, async (scope) => (await scope.client.query<{ n: string }>('SELECT pricing_run_changed_lines($1, $2)::text AS n', [first, rerun])).rows[0]?.n)).toBe('3');
    // A run compared with itself lists nothing.
    expect(await scopeOf(target, async (scope) => (await scope.client.query<{ n: string }>('SELECT pricing_run_changed_lines($1, $1)::text AS n', [rerun])).rows[0]?.n)).toBe('0');
  });
});
