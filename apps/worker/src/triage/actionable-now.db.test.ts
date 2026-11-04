import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { entriesById, recomputeStatement } from '@tp/ledger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEADLINE_DAYS } from '../digest/view';
import { DIGEST_QUERIES } from '../digest/figures';
import { acceptRun, createRerun } from '../price/rerun';
import { type Practice, RELEASE } from '../price/test-support/pricing-world';
import { type Scope, ledgerEntries } from '../reconcile/ledger';
import { STATEMENT_COLUMNS, storedStatement } from '../reconcile/print';
import { NO_BILLING, NO_TIME_LOG, generateRoiStatement } from '../reconcile/statements';
import { ACTIONABLE_NOW_OF } from './actionable-now';
import { TriageWorld } from './test-support/triage-world';

/**
 * The one actionable figure as the worker reads it (docs/adr/0082; test matrix HOM-01): the ROI statement's figure for
 * the cases still being worked and the digest's cases nearing their deadline read the line predicate, never the case's
 * stored total. SYNTHETIC CAS-08: three 97110 x 2, each 30.00 short under a fixed schedule, triaged into one case; then
 * the period priced again and the re-run accepted, so the case's lines are no longer its pricing in effect.
 */

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;
const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;

type StatementRow = Parameters<typeof storedStatement>[0];

const inJob = <T>(practice: Practice, run: (scope: Scope) => Promise<T>) => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, run);

interface Figures {
  readonly of: { readonly cents: string; readonly lines: string; readonly open_lines: string; readonly moved_on: string; readonly stale: string };
  readonly stored: string;
  readonly digest: { readonly cases: number; readonly cents: string };
  readonly statement: { readonly cents: string; readonly cases: readonly string[]; readonly matches: boolean };
}

/** The case's figure and counts, its stored total, the digest's nearing-deadline figure, and a statement of `period` generated now by the job. */
async function figures(practice: Practice, caseId: string, period: { readonly from: string; readonly to: string }): Promise<Figures> {
  return inJob(practice, async (scope) => {
    const of = (
      await scope.client.query<Figures['of'] & { stored: string; deadline_on: string }>(
        `SELECT a.cents::text, a.lines::text, a.open_lines::text, a.moved_on::text, a.stale::text, c.actionable_cents::text AS stored, c.deadline_on::text
           FROM "case" c CROSS JOIN LATERAL ${ACTIONABLE_NOW_OF('c')} a WHERE c.id = $1`,
        [caseId],
      )
    ).rows[0];
    if (of === undefined) {
      throw new Error('no such case');
    }
    const { stored, deadline_on: deadlineOn, ...counts } = of;
    // The digest's day: the case's deadline within DEADLINE_DAYS of it.
    const digest = (await scope.client.query<Figures['digest']>(DIGEST_QUERIES.deadlines, [practice.practiceId, deadlineOn, DEADLINE_DAYS])).rows[0] ?? { cases: 0, cents: '0' };
    const generated = await generateRoiStatement(scope, { practiceId: practice.practiceId, periodFrom: period.from, periodTo: period.to, requestId: `test-${randomUUID()}` }, { fees: NO_BILLING, pursuitHours: NO_TIME_LOG });
    if (generated === null) {
      throw new Error('the statement was not written');
    }
    const row = (await scope.client.query<StatementRow>(`SELECT ${STATEMENT_COLUMNS} FROM roi_statement s WHERE s.id = $1`, [generated.statementId])).rows[0] as StatementRow;
    const check = recomputeStatement(storedStatement(row), entriesById(await ledgerEntries(scope, practice.practiceId)));
    return {
      of: counts,
      stored,
      digest,
      statement: { cents: generated.statement.actionableOpenCents.toString(), cases: generated.statement.links.actionableOpen, matches: check.matches },
    };
  });
}

describe('the ROI statement and the digest read the line predicate (HOM-01)', () => {
  it('count a case’s lines on its pricing in effect, and none once a re-run takes them out of effect, the stored total kept', async () => {
    const practice = await w.practice('actionable now', { case_materiality_cents: '1000' });
    await w.load(practice, 'CAS-08/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
    const runId = await w.pricing.createRun(practice, MARCH.from, MARCH.to, RELEASE);
    await w.pricing.execute(practice, runId);
    await w.triage(practice, runId);
    const caseId = (await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ id: string }>('SELECT id FROM "case" WHERE practice_id = $1', [practice.practiceId]))).rows[0]?.id ?? '';

    expect(await figures(practice, caseId, { from: '2026-01-01', to: '2026-03-31' })).toEqual({
      of: { cents: '9000', lines: '3', open_lines: '3', moved_on: '0', stale: '0' },
      stored: '9000',
      digest: { cases: 1, cents: '9000' },
      statement: { cents: '9000', cases: [caseId], matches: true },
    });

    const { pricingRunId } = await w.as(practice, practice.manager, ({ scope }) => createRerun(scope, { practiceId: practice.practiceId, pricingRunId: runId, releaseNo: RELEASE, requestId: `test-${randomUUID()}` }));
    await w.pricing.execute(practice, pricingRunId);
    await w.as(practice, practice.manager, ({ scope }) => acceptRun(scope, { practiceId: practice.practiceId, pricingRunId, replacesId: runId, heldByIds: [] }));

    // Priced again: every line is off its pricing in effect, so out of the figure as stale; the case is still being
    // worked, so the statement still names it, at 0.00; the case's stored total stands (Lane A's PR 11 refreshes it).
    expect(await figures(practice, caseId, { from: '2026-04-01', to: '2026-06-30' })).toEqual({
      of: { cents: '0', lines: '0', open_lines: '3', moved_on: '0', stale: '3' },
      stored: '9000',
      digest: { cases: 1, cents: '0' },
      statement: { cents: '0', cases: [caseId], matches: true },
    });
  }, 180_000);
});
