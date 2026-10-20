import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PRICED_IN_EFFECT } from './in-effect';
import { linePricingNow, packetPricingCheck } from './pricing-check';
import { acceptRun, createRerun } from './rerun';
import { type Practice, PricingWorld, RELEASE, RERUN_RELEASE } from './test-support/pricing-world';

/**
 * The database's one check of whether a version's pricing is still current (migration 20261103090000; the
 * best-option audit's item #4; docs/adr/0061), against PostgreSQL as the application role: a service line's pricing
 * in effect (service_line_priced_in_effect()) is exactly PRICED_IN_EFFECT's, through a first run, a re-run nobody
 * has accepted, an accepted re-run and a later first run of the same period; a line no longer in effect, and one
 * priced under a rule release withdrawn since, are not current; and linePricingNow() gives each line's figures
 * then and now. SYNTHETIC 835s (PRC-19: Medicare Advantage non-contracted lines priced from the fee schedule, whose
 * 97110 lines release 900004 prices higher), in one scratch database, in order: the release in force is global.
 */

let w: PricingWorld;
let prc19: Practice;
const FEBRUARY = { from: '2026-02-01', to: '2026-02-28' } as const;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  prc19 = await w.practice('pricing-check-prc-19');
  await w.load(prc19, 'PRC-19/remit.835');
  await w.mapped(prc19, await w.planOf(prc19, 'CE:SYNPLAN-MA-NC'), 'ma_noncontracted', '2026-01-01');
}, 120_000);

afterAll(async () => {
  await w.close();
});

const scopeOf = <T>(target: Practice, run: Parameters<typeof withPracticeScope<typeof w.app, T>>[2]) => withPracticeScope(w.app, { actorId: target.manager, practiceIds: [target.practiceId] }, run);

/** Each service line's pricing in effect, read both ways in the billing manager's scope: the database's function and PRICED_IN_EFFECT. */
async function inEffect(target: Practice): Promise<{ readonly sql: Record<string, string | null>; readonly ts: Record<string, string | null> }> {
  return scopeOf(target, async (scope) => {
    const { rows: sql } = await scope.client.query<{ service_line_id: string; priced: string | null }>(
      'SELECT s.id AS service_line_id, service_line_priced_in_effect(s.id) AS priced FROM service_line s WHERE s.practice_id = $1 ORDER BY s.id',
      [target.practiceId],
    );
    const { rows: ts } = await scope.client.query<{ service_line_id: string; id: string }>(`SELECT q.service_line_id, q.id FROM (${PRICED_IN_EFFECT('$1', 'true')}) q`, [target.practiceId]);
    const fromTs = new Map(ts.map((row) => [row.service_line_id, row.id]));
    return {
      sql: Object.fromEntries(sql.map((row) => [row.service_line_id, row.priced])),
      ts: Object.fromEntries(sql.map((row) => [row.service_line_id, fromTs.get(row.service_line_id) ?? null])),
    };
  });
}

/** A run's priced lines by service line, with their figures as stored. */
async function linesOf(runId: string): Promise<Record<string, { readonly id: string; readonly code: string; readonly expected: string | null; readonly variance: string | null }>> {
  const { rows } = await w.owner.query<{ service_line_id: string; id: string; code: string; expected: string | null; variance: string | null }>(
    `SELECT p.service_line_id, p.id, l.procedure_code AS code, p.expected_allowed_cents::text AS expected, p.variance_cents::text AS variance
       FROM priced_line p JOIN service_line l ON l.id = p.service_line_id WHERE p.pricing_run_id = $1 ORDER BY p.service_line_id`,
    [runId],
  );
  return Object.fromEntries(rows.map((row) => [row.service_line_id, { id: row.id, code: row.code, expected: row.expected, variance: row.variance }]));
}

const byServiceLine = (lines: Awaited<ReturnType<typeof linesOf>>) => Object.fromEntries(Object.entries(lines).map(([serviceLine, line]) => [serviceLine, line.id]));
/** A version's content naming these priced lines, rows from 1. */
const contentOf = (lines: Awaited<ReturnType<typeof linesOf>>) => ({ lines: Object.values(lines).map((line, index) => ({ row: index + 1, priced_line_id: line.id })) });
const lineCheck = (target: Practice, pricedLineId: string) =>
  scopeOf(target, async (scope) => (await scope.client.query<{ check: string }>('SELECT priced_line_pricing_check($1) AS check', [pricedLineId])).rows[0]?.check);
const versionCheck = (target: Practice, content: ReturnType<typeof contentOf>) => scopeOf(target, (scope) => packetPricingCheck(scope.client, content));
const now = (target: Practice, content: ReturnType<typeof contentOf>) =>
  scopeOf(target, (scope) => linePricingNow(scope, { practiceId: target.practiceId, content, requestId: `test-${randomUUID()}` }));
const rerun = (target: Practice, runId: string, releaseNo: number) =>
  scopeOf(target, async (scope) => (await createRerun(scope, { practiceId: target.practiceId, pricingRunId: runId, releaseNo, requestId: `test-${randomUUID()}` })).pricingRunId);
const accept = (target: Practice, runId: string) => scopeOf(target, (scope) => acceptRun(scope, { practiceId: target.practiceId, pricingRunId: runId }));

let first: Awaited<ReturnType<typeof linesOf>>;
let later: Awaited<ReturnType<typeof linesOf>>;
let laterRunId = '';

describe('a service line’s pricing in effect', () => {
  it('is PRICED_IN_EFFECT’s through a first run, an unaccepted re-run, an accepted re-run and a later first run of the period', async () => {
    const runA = await w.createRun(prc19, FEBRUARY.from, FEBRUARY.to);
    await w.execute(prc19, runA);
    first = await linesOf(runA);
    expect(Object.keys(first)).toHaveLength(4);
    let both = await inEffect(prc19);
    expect(both.sql).toEqual(both.ts);
    expect(both.sql).toEqual(byServiceLine(first));
    expect(await versionCheck(prc19, contentOf(first))).toBe('current');

    // A re-run nobody has accepted changes nothing in effect.
    const runB = await rerun(prc19, runA, RELEASE);
    await w.execute(prc19, runB);
    const rerunLines = await linesOf(runB);
    both = await inEffect(prc19);
    expect(both.sql).toEqual(both.ts);
    expect(both.sql).toEqual(byServiceLine(first));
    expect(await versionCheck(prc19, contentOf(rerunLines))).toBe('PRICING_NOT_IN_EFFECT');

    // Accepted, it is the pricing in effect: the first run's lines are no longer current.
    await accept(prc19, runB);
    both = await inEffect(prc19);
    expect(both.sql).toEqual(both.ts);
    expect(both.sql).toEqual(byServiceLine(rerunLines));
    for (const line of Object.values(first)) {
      expect(await lineCheck(prc19, line.id)).toBe('PRICING_NOT_IN_EFFECT');
    }
    expect(await versionCheck(prc19, contentOf(first))).toBe('PRICING_NOT_IN_EFFECT');
    expect(await versionCheck(prc19, contentOf(rerunLines))).toBe('current');

    // A later first run of the same period takes effect after the accepted re-run.
    laterRunId = await w.createRun(prc19, FEBRUARY.from, FEBRUARY.to);
    await w.execute(prc19, laterRunId);
    later = await linesOf(laterRunId);
    both = await inEffect(prc19);
    expect(both.sql).toEqual(both.ts);
    expect(both.sql).toEqual(byServiceLine(later));
    expect(await versionCheck(prc19, contentOf(rerunLines))).toBe('PRICING_NOT_IN_EFFECT');
    expect(await versionCheck(prc19, contentOf(later))).toBe('current');

    // Each line then and now: priced again (under the same release, so the same figures), or still current.
    const stale = await now(prc19, contentOf(first));
    expect(stale.map((line) => line.row)).toEqual([1, 2, 3, 4]);
    for (const [index, line] of Object.values(first).entries()) {
      const again = Object.values(later)[index];
      expect(stale[index]).toEqual({
        row: index + 1,
        check: 'PRICING_NOT_IN_EFFECT',
        was: { pricedLineId: line.id, releaseNo: RELEASE, expectedCents: line.expected, varianceCents: line.variance },
        now: { pricedLineId: again?.id, releaseNo: RELEASE, expectedCents: again?.expected, varianceCents: again?.variance, unpricedReason: null },
      });
    }
    expect((await now(prc19, contentOf(later))).map((line) => [line.check, line.now])).toEqual(Object.values(later).map(() => ['current', null]));
  }, 120_000);

  it('reads another practice’s lines as nothing: not current, no figures', async () => {
    const other = await w.practice('pricing-check-other');
    expect(await versionCheck(other, contentOf(later))).toBe('PRICING_NOT_IN_EFFECT');
    expect(await now(other, contentOf(later))).toEqual(
      Object.values(later).map((line, index) => ({ row: index + 1, check: 'PRICING_NOT_IN_EFFECT', was: { pricedLineId: line.id, releaseNo: null, expectedCents: null, varianceCents: null }, now: null })),
    );
  });
});

describe('a rule release withdrawn since the lines were priced', () => {
  it('leaves a line in effect but not current, not priced again yet, until a run under the release in force is accepted', async () => {
    // Release 2 (900004) prices the 97110 lines higher; its accepted re-run is the pricing in effect.
    await w.loadRerunRelease();
    const runD = await rerun(prc19, laterRunId, RERUN_RELEASE);
    await w.execute(prc19, runD);
    await accept(prc19, runD);
    const underTwo = await linesOf(runD);
    const repriced = await now(prc19, contentOf(later));
    expect(repriced.every((line) => line.check === 'PRICING_NOT_IN_EFFECT' && line.now?.releaseNo === RERUN_RELEASE)).toBe(true);
    const changed = repriced.filter((line) => line.now?.expectedCents !== line.was.expectedCents);
    expect(changed.map((line) => Object.values(later)[line.row - 1]?.code)).toEqual(['97110', '97110']);
    for (const line of changed) {
      expect(BigInt(line.now?.expectedCents ?? '0')).toBeGreaterThan(BigInt(line.was.expectedCents ?? '0'));
    }

    // Its content was wrong: withdrawn, the release in force is 900001 again, and the re-run stays in effect.
    await w.withdraw(RERUN_RELEASE, 'SYNTHETIC: the 97110 work RVU was mistyped');
    const both = await inEffect(prc19);
    expect(both.sql).toEqual(both.ts);
    expect(both.sql).toEqual(byServiceLine(underTwo));
    expect(await scopeOf(prc19, async (scope) => (await scope.client.query<{ d: boolean; l: boolean }>('SELECT pricing_run_release_withdrawn($1) AS d, pricing_run_release_withdrawn($2) AS l', [runD, laterRunId])).rows[0])).toEqual({
      d: true,
      l: false,
    });
    for (const line of Object.values(underTwo)) {
      expect(await lineCheck(prc19, line.id)).toBe('RELEASE_WITHDRAWN');
    }
    expect(await versionCheck(prc19, contentOf(underTwo))).toBe('RELEASE_WITHDRAWN');
    // Not priced again yet: the pricing in effect is the same withdrawn line.
    expect((await now(prc19, contentOf(underTwo))).map((line) => [line.check, line.was.releaseNo, line.now])).toEqual(Object.values(underTwo).map(() => ['RELEASE_WITHDRAWN', RERUN_RELEASE, null]));
    // Across lines, the most severe cause: a line no longer in effect before a withdrawn one.
    const [oneWithdrawn] = Object.values(underTwo);
    const [oneReplaced] = Object.values(later);
    expect(await versionCheck(prc19, { lines: [{ row: 1, priced_line_id: oneWithdrawn?.id ?? '' }, { row: 2, priced_line_id: oneReplaced?.id ?? '' }] })).toBe('PRICING_NOT_IN_EFFECT');

    // Priced again under the release in force and accepted, the lines are current again.
    const back = await rerun(prc19, runD, RELEASE);
    await w.execute(prc19, back);
    await accept(prc19, back);
    const current = await linesOf(back);
    expect(await versionCheck(prc19, contentOf(current))).toBe('current');
    const fixed = await now(prc19, contentOf(underTwo));
    expect(fixed.every((line) => line.check === 'PRICING_NOT_IN_EFFECT' && line.now?.releaseNo === RELEASE)).toBe(true);
    expect(fixed.map((line) => line.now?.expectedCents)).toEqual(Object.values(first).map((line) => line.expected));
  }, 120_000);
});
