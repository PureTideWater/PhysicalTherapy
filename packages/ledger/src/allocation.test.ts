import { cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { allocateByWeight, cumulativeShare, partialShare, takeInOrder } from './allocation';
import { LedgerError } from './stages';

describe('pro-rata shares (PRD 13, Matching step 2; LED-09)', () => {
  it('allocates the case share of a partial check-level posting: 30.00 of a 130.00 check, 78.00 posted, is 18.00', () => {
    expect(partialShare(cents(3000n), cents(0n), cents(7800n), cents(13000n))).toBe(1800n);
    // The rest of the check posted later brings the share to exactly 30.00.
    expect(partialShare(cents(3000n), cents(7800n), cents(5200n), cents(13000n))).toBe(1200n);
  });

  it('rounds once, half up', () => {
    expect(cumulativeShare(cents(1n), cents(1n), cents(2n))).toBe(1n);
    expect(cumulativeShare(cents(1n), cents(1n), cents(3n))).toBe(0n);
    expect(cumulativeShare(cents(100n), cents(0n), cents(3n))).toBe(0n);
    expect(cumulativeShare(cents(100n), cents(3n), cents(3n))).toBe(100n);
  });

  it('refuses what is not a share of a check', () => {
    expect(() => cumulativeShare(cents(100n), cents(1n), cents(0n))).toThrow(LedgerError);
    expect(() => cumulativeShare(cents(-1n), cents(1n), cents(10n))).toThrow(LedgerError);
    expect(() => cumulativeShare(cents(1n), cents(-1n), cents(10n))).toThrow(LedgerError);
    expect(() => cumulativeShare(cents(1n), cents(11n), cents(10n))).toThrow(LedgerError);
    expect(() => partialShare(cents(1n), cents(0n), cents(0n), cents(10n))).toThrow(LedgerError);
  });

  it('adds up to exactly the share however the check posts in parts (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000n }), fc.array(fc.bigInt({ min: 1n, max: 1_000_000n }), { minLength: 1, maxLength: 8 }), (share, parts) => {
        const check = parts.reduce((sum, part) => sum + part, 0n);
        let before = 0n;
        let total = 0n;
        for (const part of parts) {
          const piece = partialShare(cents(share), cents(before), cents(part), cents(check));
          expect(piece >= 0n).toBe(true);
          total += piece;
          before += part;
        }
        expect(total).toBe(share);
      }),
    );
  });
});

describe('allocation by weight and in order', () => {
  it('splits by largest remainder, the earlier weight first on a tie', () => {
    expect(allocateByWeight(cents(100n), [cents(1n), cents(1n), cents(1n)])).toEqual([34n, 33n, 33n]);
    expect(allocateByWeight(cents(411n), [cents(3000n)])).toEqual([411n]);
    expect(allocateByWeight(cents(10n), [cents(0n), cents(5n)])).toEqual([0n, 10n]);
    expect(allocateByWeight(cents(2n), [cents(1n), cents(3n)])).toEqual([1n, 1n]);
    expect(allocateByWeight(cents(3n), [cents(1n), cents(3n)])).toEqual([1n, 2n]);
  });

  it('refuses a negative amount, a negative weight or no weight at all', () => {
    expect(() => allocateByWeight(cents(-1n), [cents(1n)])).toThrow(LedgerError);
    expect(() => allocateByWeight(cents(1n), [cents(-1n), cents(2n)])).toThrow(LedgerError);
    expect(() => allocateByWeight(cents(1n), [cents(0n)])).toThrow(LedgerError);
    expect(() => allocateByWeight(cents(1n), [])).toThrow(LedgerError);
  });

  it('adds up exactly, each part within a cent of its share (property)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000n }), fc.array(fc.bigInt({ min: 0n, max: 1_000_000n }), { minLength: 1, maxLength: 8 }), (total, weights) => {
        fc.pre(weights.some((weight) => weight > 0n));
        const parts = allocateByWeight(cents(total), weights.map((weight) => cents(weight)));
        const sum = weights.reduce((acc, weight) => acc + weight, 0n);
        expect(parts.reduce((acc, part) => acc + part, 0n)).toBe(total);
        parts.forEach((part, index) => {
          const exact = total * (weights[index] as bigint);
          expect(part * sum - exact < sum && exact - part * sum < sum).toBe(true);
        });
      }),
    );
  });

  it('takes an amount from capacities in order, never more than each holds', () => {
    expect(takeInOrder(cents(1800n), [cents(3000n)])).toEqual({ parts: [1800n], rest: 0n });
    expect(takeInOrder(cents(4000n), [cents(3000n), cents(500n)])).toEqual({ parts: [3000n, 500n], rest: 500n });
    expect(takeInOrder(cents(0n), [cents(3000n)])).toEqual({ parts: [0n], rest: 0n });
    expect(() => takeInOrder(cents(-1n), [cents(1n)])).toThrow(LedgerError);
    expect(() => takeInOrder(cents(1n), [cents(-1n)])).toThrow(LedgerError);
  });
});

describe('allocation at its edges, by fixed examples (each kill independent of a property’s seed)', () => {
  it('refuses a check of nothing even before anything has posted against it', () => {
    expect(() => cumulativeShare(cents(100n), cents(0n), cents(0n))).toThrow(LedgerError);
  });

  it('gives a leftover cent to the larger remainder, never to a weight of zero: [1n, [0n, 1n, 1n]], the counterexample a property found', () => {
    expect(allocateByWeight(cents(1n), [cents(0n), cents(1n), cents(1n)])).toEqual([0n, 1n, 0n]);
    // 2 over 1:2:4 is 2/7, 4/7 and 8/7: the floors give 1, and the one cent left goes to 4/7's remainder, the largest.
    expect(allocateByWeight(cents(2n), [cents(1n), cents(2n), cents(4n)])).toEqual([0n, 1n, 1n]);
  });

  it('takes nothing from a capacity of zero, and refuses a negative capacity wherever it stands', () => {
    expect(takeInOrder(cents(5n), [cents(0n), cents(10n)])).toEqual({ parts: [0n, 5n], rest: 0n });
    expect(() => takeInOrder(cents(1n), [cents(1n), cents(-1n)])).toThrow(LedgerError);
  });
});
