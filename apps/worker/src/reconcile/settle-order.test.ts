import { LEDGER_MATCH_KINDS, LEDGER_MATCH_LEVELS } from '@tp/db';
import { type Cents, ZERO_CENTS, cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { StoredMatch } from './ledger';
import { checkPostedBefore } from './postings';

/**
 * settleMatches' running sum (SUITE-CAP-3 D6; design section 4 and 7; docs/adr/0087). A partial check-level posting's
 * share is what the check's check-level postings ahead of it leave (partialShare), so each standing match's `before` is
 * the sum of the amounts of the check-level postings of its remittance ahead of it in the standing matches' order.
 * Today's settleMatches re-filtered that prefix for every match; checkPostedBefore keeps one running sum per remittance
 * instead. For any standing list (any order, any mix of kinds, levels and remittances, amounts present or not, and sums
 * past what a float holds exactly) both give every match the same `before`, order for order: CAS-49 cannot compare a
 * partial check's entries row for row, since within a pass that order follows random match ids (5.2), so this test is
 * where D6 is held exactly. Synthetic ids only.
 */

const REMITTANCES = ['5b1f6c2e-0d3a-4e7b-9c8d-1a2b3c4d5e01', '6c2a7d3f-1e4b-4f8c-8d9e-2b3c4d5e6f02', '7d3b8e4a-2f5c-4a9d-9eaf-3c4d5e6f7a03'] as const;
/** Amounts reach 10^15 cents, so a sum of a few of them is past 2^53: a float anywhere in the sum would show. */
const AMOUNT = 1_000_000_000_000_000n;

interface Drawn {
  readonly kind: StoredMatch['kind'];
  readonly level: StoredMatch['level'];
  readonly remittance: number;
  /** Absent when settleMatches' amounts read found no row for the match (its amount then counts as zero). */
  readonly amount: bigint | null;
}

const drawn: fc.Arbitrary<Drawn> = fc.record({
  kind: fc.constantFrom(...LEDGER_MATCH_KINDS),
  level: fc.constantFrom(...LEDGER_MATCH_LEVELS, null),
  remittance: fc.nat(REMITTANCES.length - 1),
  amount: fc.option(fc.bigInt(-AMOUNT, AMOUNT), { freq: 8 }),
});

/** A standing list and the amounts settleMatches read for it, each match with an id of its own. */
function standingOf(items: readonly Drawn[]): { readonly standing: StoredMatch[]; readonly amountOf: Map<string, { readonly amount: Cents }> } {
  const standing = items.map(
    (item, index): StoredMatch => ({
      id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      kind: item.kind,
      claimId: null,
      postingRowId: null,
      eftRowId: null,
      providerAdjustmentId: null,
      remittanceId: REMITTANCES[item.remittance] as string,
      serviceLineId: null,
      outcome: null,
      level: item.level,
      allocated: false,
      matchedBy: null,
      standing: true,
    }),
  );
  const amountOf = new Map<string, { readonly amount: Cents }>();
  for (const [index, item] of items.entries()) {
    if (item.amount !== null) {
      amountOf.set((standing[index] as StoredMatch).id, { amount: cents(item.amount) });
    }
  }
  return { standing, amountOf };
}

/** Today's settleMatches, word for word: each match's `before` re-filtered from the prefix of the list ahead of it. */
const prefixBefore = (standing: readonly StoredMatch[], amountOf: ReadonlyMap<string, { readonly amount: Cents }>): Cents[] =>
  standing.map((match, position) =>
    cents(
      standing
        .slice(0, position)
        .filter((other) => other.kind === 'posting' && other.level === 'check' && other.remittanceId === match.remittanceId)
        .reduce((sum, other) => sum + (amountOf.get(other.id)?.amount ?? ZERO_CENTS), 0n),
    ),
  );

describe("settleMatches' running sum of a check's check-level postings (SUITE-CAP-3 D6)", () => {
  it("gives every standing match the same before as today's prefix filter, for any list", () => {
    fc.assert(
      fc.property(fc.array(drawn, { maxLength: 60 }), (items) => {
        const { standing, amountOf } = standingOf(items);
        expect(checkPostedBefore(standing, amountOf)).toEqual(prefixBefore(standing, amountOf));
      }),
      { numRuns: 2_000, seed: 0x5e771e },
    );
  });

  it('follows the order it is given: the same matches in any other order get that order’s before', () => {
    fc.assert(
      fc.property(
        fc.array(drawn, { minLength: 1, maxLength: 40 }).chain((items) => fc.tuple(fc.constant(items), fc.shuffledSubarray([...items.keys()], { minLength: items.length, maxLength: items.length }))),
        ([items, order]) => {
          const { standing, amountOf } = standingOf(items);
          const reordered = order.map((index) => standing[index] as StoredMatch);
          expect(checkPostedBefore(reordered, amountOf)).toEqual(prefixBefore(reordered, amountOf));
        },
      ),
      { numRuns: 1_000, seed: 0x5e771f },
    );
  });

  it("counts only the check-level postings of the match's own remittance ahead of it (a worked list)", () => {
    const { standing, amountOf } = standingOf([
      { kind: 'posting', level: 'check', remittance: 0, amount: 300n },
      { kind: 'deposit', level: 'check', remittance: 0, amount: 900n },
      { kind: 'posting', level: 'claim', remittance: 0, amount: 50n },
      { kind: 'posting', level: 'check', remittance: 1, amount: 700n },
      { kind: 'posting', level: 'check', remittance: 0, amount: 200n },
      { kind: 'posting', level: 'check', remittance: 0, amount: null },
      { kind: 'deposit', level: 'batch', remittance: 0, amount: 100n },
    ]);
    expect(checkPostedBefore(standing, amountOf)).toEqual([0n, 300n, 300n, 0n, 300n, 500n, 500n]);
  });
});
