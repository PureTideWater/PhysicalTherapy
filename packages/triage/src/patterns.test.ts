import { type Cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type CandidateLine, type PatternKey, patternId, planCases } from './patterns';

const SETTINGS = { lineMaterialityCents: 500n as Cents, caseMaterialityCents: 25000n as Cents };
const AS_OF = '2026-10-15';

const PATTERN_ONE: PatternKey = { payer_id: 'payer-1', plan_id: 'plan-1', mapping_kind: 'contract', contract_version_id: 'v-1', rate_record_id: 'rr-1', behavior: 'BELOW_CONTRACT_RATE' };
const PATTERN_TWO: PatternKey = { ...PATTERN_ONE, plan_id: 'plan-2', contract_version_id: 'v-2', rate_record_id: 'rr-2' };

let sequence = 0;
function candidate(variance: bigint, overrides: Partial<CandidateLine> = {}): CandidateLine {
  sequence += 1;
  const id = String(sequence).padStart(4, '0');
  return {
    serviceLineId: `sl-${id}`,
    pricedLineId: `pl-${id}`,
    pattern: PATTERN_ONE,
    varianceCents: variance as Cents,
    windowEndsOn: '2027-01-15',
    deadlineStatus: 'verified',
    claimReversed: false,
    claimSuperseded: false,
    mappingKind: 'contract',
    contractVersionStatus: 'signed_off',
    contractVersionCoversService: true,
    releaseWithdrawn: false,
    writtenOff: false,
    visitVarianceCents: null,
    reviewFlags: [],
    ...overrides,
  };
}

describe('case grouping by payer pattern (PRD 12; CAS-03, CAS-04)', () => {
  it('opens one case per pattern, holding exactly that pattern’s lines (CAS-03)', () => {
    const one = Array.from({ length: 8 }, () => candidate(3500n));
    const two = Array.from({ length: 8 }, () => candidate(3400n, { pattern: PATTERN_TWO }));
    const plan = planCases([...two, ...one], new Map(), SETTINGS, AS_OF);
    expect(plan.created.map((item) => [item.pattern.plan_id, item.lines.length, item.actionableCents])).toEqual([
      ['plan-1', 8, 28000n],
      ['plan-2', 8, 27200n],
    ]);
    expect(plan.created[0]?.lines.map((item) => item.serviceLineId)).toEqual(one.map((item) => item.serviceLineId));
    expect(plan.held).toEqual([]);
  });

  it('does not create a case below the case materiality; the pattern accumulates (CAS-04)', () => {
    const lines = [0, 1, 2].map(() => candidate(2000n));
    const plan = planCases(lines, new Map(), SETTINGS, AS_OF);
    expect(plan.created).toEqual([]);
    expect(plan.held).toEqual([{ pattern: PATTERN_ONE, actionableLines: 3, actionableCents: 6000n }]);
    expect([...plan.waiting.keys()].sort()).toEqual(lines.map((item) => item.serviceLineId));
    // Later lines of the same pattern carry it across.
    const later = Array.from({ length: 10 }, () => candidate(2000n));
    expect(planCases([...lines, ...later], new Map(), SETTINGS, AS_OF).created[0]?.actionableCents).toBe(26000n);
    // At the materiality exactly, a case.
    expect(planCases([candidate(25000n)], new Map(), SETTINGS, AS_OF).created).toHaveLength(1);
  });

  it('adds a pattern’s new lines to its open case, whatever their total', () => {
    const plan = planCases([candidate(800n)], new Map([[patternId(PATTERN_ONE), 'case-1']]), SETTINGS, AS_OF);
    expect(plan.added).toEqual([{ caseId: 'case-1', pattern: PATTERN_ONE, lines: [expect.objectContaining({ varianceCents: 800n, windowPassed: false })], actionableCents: 800n }]);
    expect(plan.created).toEqual([]);
  });

  it('strikes lines whose window passed through in the case and leaves them out of its total (J8)', () => {
    const open = Array.from({ length: 9 }, () => candidate(3000n));
    const passed = candidate(9000n, { windowEndsOn: '2026-09-30' });
    const plan = planCases([...open, passed], new Map(), SETTINGS, AS_OF);
    expect(plan.created[0]?.actionableCents).toBe(27000n);
    expect(plan.created[0]?.lines.find((item) => item.serviceLineId === passed.serviceLineId)?.windowPassed).toBe(true);
    // A pattern of passed windows alone is no case.
    expect(planCases([passed], new Map(), SETTINGS, AS_OF).created).toEqual([]);
  });

  it('keeps a line whose deadline is not verified out of every case, struck or not: it waits with DEADLINE_UNVERIFIED (D17 a)', () => {
    const open = Array.from({ length: 9 }, () => candidate(3000n));
    const unverified = candidate(9000n, { deadlineStatus: 'unverified' });
    const passedUnverified = candidate(9000n, { windowEndsOn: '2026-09-30', deadlineStatus: 'unverified' });
    const plan = planCases([...open, unverified, passedUnverified], new Map(), SETTINGS, AS_OF);
    expect(plan.created[0]?.lines.map((item) => item.serviceLineId)).toEqual(open.map((item) => item.serviceLineId));
    expect(plan.created[0]?.actionableCents).toBe(27000n);
    expect(plan.waiting.get(unverified.serviceLineId)).toEqual(['DEADLINE_UNVERIFIED']);
    expect(plan.waiting.get(passedUnverified.serviceLineId)).toEqual(['WINDOW_PASSED', 'DEADLINE_UNVERIFIED']);
    // A pattern whose deadlines are all unverified opens no case, however large.
    expect(planCases(Array.from({ length: 20 }, () => candidate(30000n, { deadlineStatus: 'unverified' })), new Map(), SETTINGS, AS_OF).created).toEqual([]);
  });

  it('keeps lines below the line materiality, of reversed claims, or never validated out of every case (CAS-05, PRC-15)', () => {
    const big = Array.from({ length: 9 }, () => candidate(3000n));
    const small = candidate(300n);
    const reversed = candidate(5000n, { claimReversed: true });
    const overpaid = candidate(-4000n);
    const plan = planCases([...big, small, reversed, overpaid], new Map(), SETTINGS, AS_OF);
    const inCases = plan.created.flatMap((item) => item.lines.map((entry) => entry.serviceLineId));
    expect(inCases).not.toContain(small.serviceLineId);
    expect(inCases).not.toContain(reversed.serviceLineId);
    expect(inCases).not.toContain(overpaid.serviceLineId);
    expect(plan.waiting.get(small.serviceLineId)).toEqual(['BELOW_LINE_MATERIALITY']);
    expect(plan.waiting.get(reversed.serviceLineId)).toEqual(['CLAIM_REVERSED']);
    expect(plan.waiting.has(overpaid.serviceLineId)).toBe(false);
  });

  it('holds per-visit lines and lines with an NCCI review flag out of every case, for a person’s review (Q41, Q44)', () => {
    const big = Array.from({ length: 9 }, () => candidate(3000n));
    const carrier = candidate(30000n, { visitVarianceCents: 28000n as Cents });
    const spread = candidate(4566n, { visitVarianceCents: -234n as Cents });
    const flagged = candidate(30000n, { reviewFlags: ['NCCI_PTP'] });
    const plan = planCases([...big, carrier, spread, flagged], new Map(), SETTINGS, AS_OF);
    const inCases = plan.created.flatMap((item) => item.lines.map((entry) => entry.serviceLineId));
    expect(inCases).toEqual(big.map((item) => item.serviceLineId));
    expect(plan.created[0]?.actionableCents).toBe(27000n);
    expect(plan.waiting.get(carrier.serviceLineId)).toEqual(['PER_VISIT_REVIEW']);
    expect(plan.waiting.get(flagged.serviceLineId)).toEqual(['NCCI_REVIEW']);
    // A visit paid in full as a whole validates nothing.
    expect(plan.waiting.has(spread.serviceLineId)).toBe(false);
  });

  it('puts every validated actionable line in exactly one case of its own pattern, and each case total is the sum of its actionable lines (property)', () => {
    const patterns = [PATTERN_ONE, PATTERN_TWO, { ...PATTERN_ONE, behavior: 'MPPR_NOT_IN_CONTRACT' as const }];
    const arbitraryLine = fc.record({
      variance: fc.bigInt({ min: -2000n, max: 20_000n }),
      pattern: fc.constantFrom(...patterns),
      window: fc.constantFrom('2026-01-01', '2027-06-30'),
    });
    fc.assert(
      fc.property(fc.array(arbitraryLine, { maxLength: 60 }), (items) => {
        const lines = items.map((item) => candidate(item.variance, { pattern: item.pattern, windowEndsOn: item.window }));
        const plan = planCases(lines, new Map(), SETTINGS, AS_OF);
        const seen = new Set<string>();
        for (const item of plan.created) {
          expect(item.actionableCents).toBeGreaterThanOrEqual(25000n);
          const actionable = item.lines.filter((entry) => !entry.windowPassed);
          expect(item.actionableCents).toBe(actionable.reduce((sum, entry) => sum + entry.varianceCents, 0n));
          for (const entry of item.lines) {
            expect(seen.has(entry.serviceLineId)).toBe(false);
            seen.add(entry.serviceLineId);
            const source = lines.find((candidateLine) => candidateLine.serviceLineId === entry.serviceLineId);
            expect(patternId(source?.pattern as PatternKey)).toBe(patternId(item.pattern));
            expect(entry.varianceCents).toBeGreaterThanOrEqual(500n);
          }
        }
        expect(new Set(plan.created.map((item) => patternId(item.pattern))).size).toBe(plan.created.length);
        for (const item of plan.held) {
          expect(item.actionableCents).toBeLessThan(25000n);
        }
      }),
    );
  });
});
