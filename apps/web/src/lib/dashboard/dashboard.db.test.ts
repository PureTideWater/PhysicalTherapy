import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { Practice } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACTIONABLE_NOW_LINES } from '../triage/queries';
import { dashboard } from './queries';

/**
 * The home page's Actionable figure and the count beside it (PR #95 review UX-1; PRD 12, the headline), against a scratch
 * database: CAS-08's SYNTHETIC lines (three 97110 x 2, each 30.00 short under a fixed schedule) open one case; a later
 * first run of the same month, as a month priced around a plan with no mapping gets once that plan is mapped, takes the
 * case's lines out of the pricing in effect. The cents and the count share one predicate, so both fall together, and
 * the lines left out are counted beside them. Synthetic data only.
 */

let w: TriageWorld;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 } as const;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;

const home = (practice: Practice) => withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) => dashboard(scope, practice.practiceId, '2026-11-02'));

/** The Cases screen's count of lines its figure sums (ACTIONABLE_NOW_LINES), over the cases still being worked. */
const casesLines = (practice: Practice) =>
  withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, async (scope) =>
    Number(
      (
        await scope.client.query<{ lines: string }>(
          `SELECT coalesce(sum(${ACTIONABLE_NOW_LINES('c')}), 0)::text AS lines FROM "case" c WHERE c.practice_id = $1 AND c.state NOT IN ('resolved', 'closed_written_off')`,
          [practice.practiceId],
        )
      ).rows[0]?.lines ?? '0',
    ),
  );

describe('the home page’s Actionable figure (UX-1)', () => {
  it('UX-1: counts the same lines its cents sum, and counts apart the case lines whose pricing is no longer current', async () => {
    const practice = await w.practice('dashboard-actionable', { case_materiality_cents: '1000' });
    await w.load(practice, 'CAS-08/remit.835');
    const contract = await w.fixedContract(practice, FIXED);
    await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
    const first = await w.pricing.createRun(practice, MARCH.from, MARCH.to);
    await w.pricing.execute(practice, first);
    const triaged = await w.triage(practice, first);
    expect(triaged).toMatchObject({ outcome: 'triaged', summary: { casesOpened: 1 } });

    const before = await home(practice);
    expect(before.headline.actionable).toEqual({ lines: 3, cents: '9000' });
    expect(before.headline.actionable.lines).toBe(await casesLines(practice));
    expect(before.actionableNotCurrent).toEqual({ lines: 0 });

    // A later first run of March goes in effect: the case's priced lines are no longer current (PRICING_NOT_IN_EFFECT).
    const later = await w.pricing.createRun(practice, MARCH.from, MARCH.to);
    await w.pricing.execute(practice, later);
    const after = await home(practice);
    expect(after.headline.actionable).toEqual({ lines: 0, cents: '0' });
    expect(after.headline.actionable.lines).toBe(await casesLines(practice));
    expect(after.actionableNotCurrent).toEqual({ lines: 3 });
  });
});
