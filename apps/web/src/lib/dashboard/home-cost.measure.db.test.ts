// SCRATCH (not for commit): the CAS-41 measurement of the home's statement against today's three (F1, F13).
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import type * as ReleaseModule from '../../../../worker/src/price/release';
import { GENERATED_AS_OF, generatedMonth } from '../../../../worker/src/triage/test-support/generated-month';
import { DEADLINE_WINDOW_DAYS, HOME_CASES, dashboard } from './queries';

const pricing = vi.hoisted(() => ({ beforeRefusal: false }));
vi.mock('../../../../worker/src/price/release', async (importOriginal) => {
  const actual = await importOriginal<typeof ReleaseModule>();
  const loaded = [{ from: null, until: null }];
  return { ...actual, releaseContentSpans: async (...args: Parameters<typeof actual.releaseContentSpans>) => (pricing.beforeRefusal ? { mppr_code: loaded, mppr_general: loaded, ncci_mue: loaded } : actual.releaseContentSpans(...args)) };
});
async function contentLoaded<T>(run: () => Promise<T>): Promise<T> {
  pricing.beforeRefusal = true;
  try { return await run(); } finally { pricing.beforeRefusal = false; }
}

const OLD_NOW = (alias: string) => `(SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = ${alias}.id AND x.written_off_reason IS NULL
      AND (SELECT s.stage FROM line_status s WHERE s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable'
      AND priced_line_pricing_check(x.priced_line_id) = 'current')`;
const WORKED = "state NOT IN ('resolved', 'closed_written_off')";
const OLD = {
  headline: `SELECT (SELECT count(*)::int FROM case_line x JOIN "case" k ON k.id = x.case_id
              WHERE x.practice_id = $1 AND k.${WORKED} AND x.written_off_reason IS NULL
                AND (SELECT s.stage FROM line_status s WHERE s.service_line_id = x.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable') AS lines,
            coalesce((SELECT sum(${OLD_NOW('c')}) FROM "case" c WHERE c.practice_id = $1 AND c.${WORKED}), 0)::text AS cents`,
  states: `SELECT c.state, count(*)::int AS cases, coalesce(sum(${OLD_NOW('c')}), 0)::text AS actionable FROM "case" c WHERE c.practice_id = $1 GROUP BY c.state ORDER BY c.state`,
  near: `SELECT count(*)::int AS cases, coalesce(sum(${OLD_NOW('c')}), 0)::text AS actionable, min(c.deadline_on)::text AS earliest
       FROM "case" c WHERE c.practice_id = $1 AND c.${WORKED} AND c.deadline_on <= $2::date + $3::int`,
};

let w: TriageWorld;
beforeAll(async () => { w = await TriageWorld.open(readDatabaseUrl()); }, 120_000);
afterAll(async () => { await w.close(); });

it('measures', async () => {
  const lines = Number(process.env.HOM_LINES ?? '100000');
  const started = Date.now();
  const month = await generatedMonth(w, { label: 'home cost', lines, contentLoaded });
  const built = Date.now() - started;
  const { practiceId, manager } = { practiceId: month.practice.practiceId, manager: month.practice.manager };
  const as = <T>(run: (scope: Parameters<Parameters<typeof withPracticeScope>[2]>[0]) => Promise<T>) => withPracticeScope(w.app, { actorId: manager, practiceIds: [practiceId] }, run);
  const explain = async (text: string, values: unknown[]) => as(async (scope) => {
    const plan = (await scope.client.query<{ 'QUERY PLAN': [{ 'Execution Time': number; Plan: { 'Shared Hit Blocks': number; 'Shared Read Blocks': number } }] }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, values)).rows[0]?.['QUERY PLAN'][0];
    return { ms: plan?.['Execution Time'] ?? NaN, hit: plan?.Plan['Shared Hit Blocks'], read: plan?.Plan['Shared Read Blocks'] };
  });
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
  const runs = 5;
  const result: Record<string, unknown> = { lines: month.lines, cases: month.caseIds.length, builtMs: built, asOf: GENERATED_AS_OF };
  const oldTimes: Record<string, number[]> = { headline: [], states: [], near: [] };
  const newTimes: number[] = [];
  const buffers: Record<string, unknown> = {};
  for (let i = 0; i < runs; i += 1) {
    for (const [name, text] of Object.entries(OLD)) {
      const m = await explain(text, name === 'near' ? [practiceId, GENERATED_AS_OF, DEADLINE_WINDOW_DAYS] : [practiceId]);
      oldTimes[name]?.push(m.ms); buffers[`old.${name}`] = m;
    }
    const m = await explain(HOME_CASES, [practiceId, GENERATED_AS_OF, DEADLINE_WINDOW_DAYS]);
    newTimes.push(m.ms); buffers.new = m;
  }
  const oldSum = median(oldTimes.headline ?? []) + median(oldTimes.states ?? []) + median(oldTimes.near ?? []);
  result.oldMedianMs = Object.fromEntries(Object.entries(oldTimes).map(([k, v]) => [k, median(v)]));
  result.oldSumMs = oldSum;
  result.newMedianMs = median(newTimes);
  result.buffers = buffers;
  // Function calls, counted as the superuser.
  const calls = async (texts: [string, unknown[]][]) => {
    await w.owner.query('BEGIN');
    try {
      await w.owner.query("SET LOCAL track_functions = 'pl'");
      for (const [text, values] of texts) await w.owner.query(text, values);
      return (await w.owner.query<{ n: number }>("SELECT coalesce(pg_stat_get_xact_function_calls('priced_line_pricing_check'::regproc), 0)::int AS n")).rows[0]?.n;
    } finally { await w.owner.query('ROLLBACK'); }
  };
  result.checkCallsOld = await calls([[OLD.headline, [practiceId]], [OLD.states, [practiceId]], [OLD.near, [practiceId, GENERATED_AS_OF, DEADLINE_WINDOW_DAYS]]]);
  result.checkCallsNew = await calls([[HOME_CASES, [practiceId, GENERATED_AS_OF, DEADLINE_WINDOW_DAYS]]]);
  const whole: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const t = performance.now();
    await as((scope) => dashboard(scope, practiceId, GENERATED_AS_OF));
    whole.push(performance.now() - t);
  }
  result.dashboardWholeMs = whole;
  result.sample = await as((scope) => dashboard(scope, practiceId, GENERATED_AS_OF)).then((d) => ({ headline: d.headline.actionable, byState: d.casesByState, deadlines: d.deadlines }));
  writeFileSync(`/tmp/hom-measure/result-${String(lines)}-${randomUUID().slice(0, 4)}.json`, JSON.stringify(result, null, 2));
  expect(result.newMedianMs).toBeDefined();
}, 3_600_000);
