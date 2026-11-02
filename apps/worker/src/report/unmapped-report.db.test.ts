import { randomUUID } from 'node:crypto';

import { readDatabaseUrl } from '@tp/db';
import { type PracticeScope, type ScopeClient, loadPracticeCipher } from '@tp/db/runtime';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCoverage } from '../price/coverage';
import type { Practice } from '../price/test-support/pricing-world';
import { practiceLedgerSettings } from '../reconcile/ledger';
import { collect } from '../storage/documents';
import { rolledBack } from '../triage/test-support/recorded';
import { TriageWorld } from '../triage/test-support/triage-world';
import { type AuditReportContent, type GatherInput, type ReportBatches, gatherReport } from './content';
import { auditHtml, auditReconciliation, unmappedPlansText } from './html';
import { wholeGatherReport } from './test-support/whole-read';

/**
 * The audit report's plans with no mapping, built from a run the code priced (combined audit #32, docs/adr/0075;
 * PRC-30, MAP-06; review finding F8). MAP-06's SYNTHETIC month holds a plan mapped to a fixed schedule and a plan with
 * none; the run prices it, and gatherReport folds the run's coverage (tp-pricing-coverage/2) into the stored content's
 * coverage.unmapped_plans: the plan count, the sum of the plans' lines and the sum of their billed integer cents. Each
 * figure is checked against the run's stored coverage and against Postgres's own count of the plans' lines, so the
 * mutation that put the plan count in the line count's place (F8's M18), or the plans' or cents' counterparts, fails
 * here. The whole read of 085299bd (test-support/whole-read.ts) folds the same content, at the default batch sizes and
 * in batches of one line, and the printed report says the sentence those figures make.
 */

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const PERIOD = { from: '2026-02-01', to: '2026-02-28' } as const;
/** MAP-06's mapped plan's terms: $50.00 a unit for each code its lines bill. */
const SCHEDULE = { schedule: ['97110', '97112', '97140', '97530'].map((code) => ({ code, amountCents: '5000' })), effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };
const ONE_LINE: ReportBatches = { candidateLines: 1, reportLines: 1, caseLines: 1, csvChunkBytes: 61 };

/** Postgres's own count of a practice's lines by plan over the period, with no mapping row at all (§3.2's unmappedPlanTotals). */
async function unmappedInPostgres(target: Practice): Promise<{ plans: number; lines: number; charge_cents: string }> {
  const { rows } = await asOwner(w.owner, [target.practiceId], () =>
    w.owner.query<{ plans: number; lines: number; charge_cents: string }>(
      `SELECT count(DISTINCT l.payer_plan_key)::int AS plans, count(*)::int AS lines, coalesce(sum(l.charge_cents), 0)::text AS charge_cents
         FROM claim c JOIN service_line l ON l.claim_id = c.id
        WHERE c.practice_id = $1 AND coalesce(l.service_date, c.service_from) BETWEEN $2::date AND $3::date
          AND NOT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.plan_id = l.payer_plan_key)`,
      [target.practiceId, PERIOD.from, PERIOD.to],
    ),
  );
  const [row] = rows;
  if (row === undefined) {
    throw new Error('a count');
  }
  return row;
}

async function runCoverage(runId: string) {
  const { rows } = await w.owner.query<{ coverage: unknown; status: string }>('SELECT coverage, status FROM pricing_run WHERE id = $1', [runId]);
  expect(rows[0]?.status).toBe('complete');
  return parseCoverage(rows[0]?.coverage);
}

/** The streamed and the whole-read content of the run's report, each built in a transaction that is rolled back. */
async function contents(target: Practice, runId: string, batches?: ReportBatches) {
  const auditReportId = randomUUID();
  const input = async (scope: PracticeScope<ScopeClient>, requestId: string): Promise<GatherInput> => ({
    practiceId: target.practiceId,
    auditReportId,
    pricingRunId: runId,
    asOf: '2026-10-17',
    requestId,
    cipher: await loadPracticeCipher(scope, w.keys, target.practiceId),
    ...(batches === undefined ? {} : { batches }),
  });
  const streamed = await rolledBack(w, target.practiceId, async (scope, requestId) => {
    const { content, arena } = await gatherReport(scope, await input(scope, requestId));
    await collect(arena.rows());
    arena.release();
    return { content, html: auditHtml(content, auditReconciliation(content, (await practiceLedgerSettings(scope, target.practiceId)).proofLevel)) };
  });
  const whole = await rolledBack(w, target.practiceId, async (scope, requestId) => (await wholeGatherReport(scope, await input(scope, requestId))).content);
  return { streamed: streamed.result, whole: whole.result };
}

/** Checks the built content's figure against the run's coverage and Postgres's count, and the sentence the PDF prints. */
async function expectUnmappedFigures(target: Practice, runId: string, expected: { readonly plans: number; readonly lines: number }): Promise<AuditReportContent> {
  const coverage = await runCoverage(runId);
  const counted = await unmappedInPostgres(target);
  expect({ plans: counted.plans, lines: counted.lines }).toEqual(expected);
  // The run's stored coverage, plan by plan, adds up to Postgres's count.
  expect(coverage.unmapped_plans).toHaveLength(expected.plans);
  expect(coverage.unmapped_plans.reduce((total, plan) => total + plan.lines, 0)).toBe(expected.lines);
  expect(coverage.unmapped_plans.reduce((total, plan) => total + BigInt(plan.charge_cents), 0n).toString()).toBe(counted.charge_cents);
  for (const batches of [undefined, ONE_LINE]) {
    const { streamed, whole } = await contents(target, runId, batches);
    // F8: plans is the number of plans, lines the sum of their lines (never the plan count), cents the sum of their integer cents.
    expect(streamed.content.coverage.unmapped_plans).toEqual({ plans: expected.plans, lines: expected.lines, charge_cents: counted.charge_cents });
    expect(streamed.content.coverage.unmapped_plans?.charge_cents).toMatch(/^-?\d+$/);
    // The whole read folds the same content in this world too.
    expect(JSON.parse(JSON.stringify(streamed.content))).toEqual(JSON.parse(JSON.stringify(whole)));
    const sentence = unmappedPlansText(streamed.content.coverage.unmapped_plans);
    expect(sentence).toContain(`; ${expected.plans === 1 ? 'its' : 'their'} lines are not priced (${String(expected.lines)} lines, `);
    expect(streamed.html).toContain(`${expected.plans === 1 ? '1 plan' : `${String(expected.plans)} plans`} had no mapping when this run was priced;`);
    expect(streamed.html).toContain(`lines are not priced (${String(expected.lines)} lines, <span class="figure-amount">`);
  }
  return (await contents(target, runId)).streamed.content;
}

describe('the audit report’s plans with no mapping, from a run the code priced (combined audit #32; PRC-30, MAP-06, F8)', () => {
  it('counts the one plan with no mapping, its three lines and their billed cents, a negative charge among them (F8)', async () => {
    const target = await w.practice('report unmapped one plan');
    await w.pricing.load(target, 'MAP-06/remit.835');
    const unmappedPlan = await w.pricing.planOf(target, 'CE:SYNPLAN-UNMAPPED-06');
    // A line's charge has no sign check, so neither has the sum: one of the plan's lines is billed -$7.00 (SYNTHETIC).
    await asOwner(w.owner, [target.practiceId], () =>
      w.owner.query('UPDATE service_line SET charge_cents = -700 WHERE id = (SELECT id FROM service_line WHERE practice_id = $1 AND payer_plan_key = $2 ORDER BY line_no LIMIT 1)', [
        target.practiceId,
        unmappedPlan,
      ]),
    );
    const contract = await w.fixedContract(target, SCHEDULE);
    const runId = await w.pricedRun(target, { plans: [{ key: 'CE:SYNPLAN-COMM-06', versionId: contract.versionId }], from: PERIOD.from, to: PERIOD.to });
    const content = await expectUnmappedFigures(target, runId, { plans: 1, lines: 3 });
    // MAP-06's figures: the plan's $300.00 billed, its first line's $150.00 now -$7.00.
    expect(content.coverage.unmapped_plans?.charge_cents).toBe('14300');
    expect(content.coverage.unmapped_plans?.lines).not.toBe(content.coverage.unmapped_plans?.plans);
  }, 120_000);

  it('counts two plans with no mapping and all their lines, when the mapping was removed after the run was queued (F8)', async () => {
    const target = await w.practice('report unmapped two plans');
    await w.pricing.load(target, 'MAP-06/remit.835');
    const contract = await w.fixedContract(target, SCHEDULE);
    const mappingId = await w.pricing.mapped(target, await w.pricing.planOf(target, 'CE:SYNPLAN-COMM-06'), 'contract', '2026-01-01', contract.versionId);
    const runId = await w.pricing.createRun(target, PERIOD.from, PERIOD.to);
    // As if the run was queued while the plan was mapped, and the mapping was gone when the job ran (removed as the owner).
    await asOwner(w.owner, [target.practiceId], () => w.owner.query('DELETE FROM payer_plan_mapping WHERE id = $1', [mappingId]));
    await w.pricing.execute(target, runId);
    const content = await expectUnmappedFigures(target, runId, { plans: 2, lines: 7 });
    expect(content.coverage.priced_lines).toBe(0);
  }, 120_000);
});
