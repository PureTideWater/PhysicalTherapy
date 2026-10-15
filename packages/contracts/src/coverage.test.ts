import { randomUUID } from 'node:crypto';

import { type Cents, cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { type CoverageLine, PricingRefusedError, assertPricingAllowed, unmappedPlanIds, waitingOnMapping } from './coverage';
import { mapping } from './testing/records';

const MAPPED = randomUUID();
const UNMAPPED = randomUUID();
const c = (value: bigint): Cents => cents(value);

function coverageLine(planId: string | null, serviceDate: string, charge: bigint, paid: bigint, claimId = randomUUID()): CoverageLine {
  return { planId, serviceDate, claimId, chargeCents: c(charge), paidCents: c(paid) };
}

describe('the pricing guard (MAP-01)', () => {
  const mappings = [mapping({ planId: MAPPED, kind: 'no_agreement', effectiveFrom: '2026-03-01' })];

  it('refuses a run over lines of a plan that has no mapping at all, naming the plans and counting lines without one', () => {
    const lines = [
      { planId: MAPPED, serviceDate: '2026-04-01' },
      { planId: UNMAPPED, serviceDate: '2026-04-01' },
      { planId: UNMAPPED, serviceDate: '2026-04-02' },
      { planId: null, serviceDate: '2026-04-02' },
    ];
    expect(unmappedPlanIds(lines, mappings)).toEqual([UNMAPPED]);
    let refused: unknown;
    try {
      assertPricingAllowed(lines, mappings);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(PricingRefusedError);
    expect(refused).toMatchObject({ unmappedPlanIds: [UNMAPPED], linesWithoutPlan: 1, message: 'pricing is refused until every plan is mapped: 1 plan(s) have no mapping; 1 line(s) name no plan' });
    expect(() => {
      assertPricingAllowed([{ planId: null, serviceDate: '2026-04-02' }], mappings);
    }).toThrow('1 line(s) name no plan');
  });

  it('lets a run over mapped plans start, lines outside the mapping’s window included (MAP-02: those resolve to NO_MAPPING)', () => {
    expect(() => {
      assertPricingAllowed([{ planId: MAPPED, serviceDate: '2026-01-15' }], mappings);
    }).not.toThrow();
    expect(() => {
      assertPricingAllowed([], []);
    }).not.toThrow();
  });
});

describe('dollars waiting on mappings', () => {
  it('totals, per plan, the lines no mapping covers on their date, largest billed total first', () => {
    const mappings = [mapping({ planId: MAPPED, kind: 'contract', contractVersionId: randomUUID(), effectiveFrom: '2026-03-01' })];
    const claim = randomUUID();
    const waiting = waitingOnMapping(
      [
        coverageLine(MAPPED, '2026-02-27', 10_000n, 6000n, claim),
        coverageLine(MAPPED, '2026-02-28', 5000n, 3000n, claim),
        coverageLine(MAPPED, '2026-03-01', 99_999n, 1n),
        coverageLine(UNMAPPED, '2026-03-01', 20_000n, 0n),
        coverageLine(null, '2026-03-01', 100n, 100n),
      ],
      mappings,
    );
    expect(waiting).toEqual([
      { planId: UNMAPPED, lines: 1, claims: 1, chargeCents: 20_000n, paidCents: 0n },
      { planId: MAPPED, lines: 2, claims: 1, chargeCents: 15_000n, paidCents: 9000n },
      { planId: null, lines: 1, claims: 1, chargeCents: 100n, paidCents: 100n },
    ]);
    expect(waitingOnMapping([coverageLine(MAPPED, '2026-03-02', 1n, 1n)], mappings)).toEqual([]);
  });

  it('orders equal totals by plan', () => {
    const [first, second] = [randomUUID(), randomUUID()].sort();
    const waiting = waitingOnMapping([coverageLine(second ?? '', '2026-03-01', 1n, 0n), coverageLine(first ?? '', '2026-03-01', 1n, 0n)], []);
    expect(waiting.map((plan) => plan.planId)).toEqual([first, second]);
  });
});
