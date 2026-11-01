import { randomUUID } from 'node:crypto';

import { type Cents, cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type CoverageLine, unmappedPlanIds, waitingOnMapping } from './coverage';
import { agreementResolver } from './resolver';
import { mapping } from './testing/records';

const MAPPED = randomUUID();
const UNMAPPED = randomUUID();
const c = (value: bigint): Cents => cents(value);

function coverageLine(planId: string | null, serviceDate: string, charge: bigint, paid: bigint, claimId = randomUUID()): CoverageLine {
  return { planId, serviceDate, claimId, chargeCents: c(charge), paidCents: c(paid) };
}

describe('the plans a run never prices (MAP-01, PRC-30)', () => {
  const mappings = [mapping({ planId: MAPPED, kind: 'no_agreement', effectiveFrom: '2026-03-01' })];

  it('names the plans of the lines that have no mapping at all, sorted, once each; a line naming no plan names none', () => {
    const lines = [
      { planId: MAPPED, serviceDate: '2026-04-01' },
      { planId: UNMAPPED, serviceDate: '2026-04-01' },
      { planId: UNMAPPED, serviceDate: '2026-04-02' },
      { planId: null, serviceDate: '2026-04-02' },
    ];
    expect(unmappedPlanIds(lines, mappings)).toEqual([UNMAPPED]);
    const [first, second] = [randomUUID(), randomUUID()].sort();
    expect(unmappedPlanIds([{ planId: second ?? '', serviceDate: '2026-04-01' }, { planId: first ?? '', serviceDate: '2026-04-01' }], [])).toEqual([first, second]);
    expect(unmappedPlanIds([{ planId: null, serviceDate: '2026-04-02' }], mappings)).toEqual([]);
  });

  it('never names a mapped plan, lines outside the mapping’s window included (MAP-02: those resolve to NO_MAPPING one by one)', () => {
    expect(unmappedPlanIds([{ planId: MAPPED, serviceDate: '2026-01-15' }], mappings)).toEqual([]);
    expect(unmappedPlanIds([], [])).toEqual([]);
  });

  it('names exactly the plans whose every line resolves NO_MAPPING with no mapping record (property)', () => {
    const plans = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const date = fc.integer({ min: 0, max: 365 * 2 }).map((offset) => new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10));
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...plans), date), { minLength: 1, maxLength: 12 }),
        // One mapping per plan at most: the database allows one in force on a date.
        fc.uniqueArray(fc.tuple(fc.constantFrom(...plans), date), { maxLength: 4, selector: ([planId]) => planId }),
        (lineFacts, mappingFacts) => {
          const lines = lineFacts.map(([planId, serviceDate]) => ({ planId, serviceDate }));
          const records = mappingFacts.map(([planId, effectiveFrom]) => mapping({ planId, kind: 'no_agreement', effectiveFrom }));
          const resolver = agreementResolver({ mappings: records, versions: [], rateRecords: [] });
          const outcomes = (planId: string) => lines.filter((line) => line.planId === planId).map((line) => resolver.resolve({ ...line, procedureCode: '97110', modifiers: [], placeOfService: '11' }).outcome);
          const named = unmappedPlanIds(lines, records);
          // Every plan named has every line NO_MAPPING; a plan whose lines all resolve NO_MAPPING but which has a
          // mapping (its dates outside every window, MAP-02) is never named, and every plan with no record is.
          for (const planId of named) {
            expect(outcomes(planId).every((outcome) => outcome === 'NO_MAPPING')).toBe(true);
          }
          const expected = [...new Set(lines.map((line) => line.planId))].filter((planId) => outcomes(planId).every((outcome) => outcome === 'NO_MAPPING') && !records.some((record) => record.planId === planId)).sort();
          expect(named).toEqual(expected);
        },
      ),
    );
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
