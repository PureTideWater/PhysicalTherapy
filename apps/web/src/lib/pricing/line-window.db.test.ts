import { randomUUID } from 'node:crypto';

import type { DisputeWindowRule } from '@tp/contracts';
import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { RELEASE } from '@tp/worker/testing';
import { TriageWorld } from '@tp/worker/testing/triage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { notComputedWindowText } from '../contracts/display';
import { type PricedLineView, pricedLineOf } from './queries';

/**
 * The line trace's dispute window against PostgreSQL (the best-option audit's item #5; docs/adr/0061): the engine
 * counts a contract's window only as calendar days after the payment date (BPR16) until PR 6c, so for a window cited
 * in months or business days its date counts the cited length another way. The trace then states the cited rule in
 * words in place of that date; a window cited as the engine counts it keeps its date. Each case is a practice of its
 * own whose SYNTHETIC CAS-08 lines are priced under a fixed schedule whose window is cited by the rule given.
 */

let w: TriageWorld;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;

beforeAll(async () => {
  w = await TriageWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

/** A CAS-08 line as the trace reads it, priced under a contract whose window of `days` is cited by `windowRule` (the computed rule when absent). */
async function tracedUnder(label: string, days: number, windowRule?: DisputeWindowRule): Promise<PricedLineView> {
  const practice = await w.practice(label);
  await w.load(practice, 'CAS-08/remit.835');
  const contract = await w.fixedContract(practice, {
    schedule: [{ code: '97110', amountCents: '5000' }],
    effectiveFrom: '2026-01-01',
    disputeWindowDays: days,
    ...(windowRule === undefined ? {} : { windowRule }),
  });
  await w.pricing.mapped(practice, await w.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE'), 'contract', '2026-01-01', contract.versionId);
  const runId = await w.pricing.createRun(practice, MARCH.from, MARCH.to, RELEASE);
  await w.pricing.execute(practice, runId);
  const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query<{ service_line_id: string }>(
      'SELECT service_line_id FROM priced_line WHERE practice_id = $1 AND pricing_run_id = $2 AND contract_version_id = $3 AND unpriced_reason IS NULL ORDER BY id LIMIT 1',
      [practice.practiceId, runId, contract.versionId],
    ),
  );
  const lineId = rows[0]?.service_line_id;
  if (lineId === undefined) {
    throw new Error('no CAS-08 line priced under the contract');
  }
  const traced = await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    pricedLineOf(scope, practice.practiceId, lineId, runId, false, `test-${randomUUID()}`),
  );
  if (traced === undefined) {
    throw new Error('the trace found no priced line');
  }
  return traced;
}

describe('the line trace’s dispute window', () => {
  it('keeps the engine’s date for a window cited as the engine counts it: calendar days after the payment date', async () => {
    const traced = await tracedUnder('trace window computed', 3650);
    expect(traced.windowRuleNotComputed).toBeNull();
    expect(traced.windowEndsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('states a window cited in months by its rule, not by the engine’s date, which counts the length as days', async () => {
    const traced = await tracedUnder('trace window months', 6, { unit: 'months', measuredFrom: 'remittance_date' });
    expect(traced.windowRuleNotComputed).toEqual({ length: 6, rule: { unit: 'months', measuredFrom: 'remittance_date' } });
    // The run's own date stands (a run never changes): six days after CAS-08's payment date (BPR16 2026-04-08), months early.
    expect(traced.windowEndsOn).toBe('2026-04-14');
    expect(notComputedWindowText(6, { unit: 'months', measuredFrom: 'remittance_date' })).toContain('ends 6 months after the remittance date');
  });

  it('states a window cited in business days by its rule too', async () => {
    const traced = await tracedUnder('trace window business days', 10, { unit: 'business_days', measuredFrom: 'payment_date' });
    expect(traced.windowRuleNotComputed).toEqual({ length: 10, rule: { unit: 'business_days', measuredFrom: 'payment_date' } });
  });
});
