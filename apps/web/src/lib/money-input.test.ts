import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DOLLARS_MESSAGE, dollarsField, dollarsForInput } from './money-input';

/**
 * Stored cents to the dollars a person edits, and back (test matrix CAS-39): over every amount a store holds,
 * [0, 999,999,999,999] cents, the dollars a form is pre-filled with read back through the save's field as the same
 * cents, so saving a form unchanged changes nothing.
 */

const MOST = 999_999_999_999;

describe('dollarsForInput and dollarsField (CAS-39)', () => {
  it('are each other’s inverse for every amount a store holds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MOST }), (amount) => {
        expect(dollarsField.parse(dollarsForInput(String(amount)))).toBe(BigInt(amount));
      }),
      { numRuns: 2_000 },
    );
  });

  it('write dollars with two places at the edges, and read them back', () => {
    const edges = [0, 1, 99, 100, 500, 4500, 25000, MOST];
    expect(edges.map((amount) => dollarsForInput(String(amount)))).toEqual(['0.00', '0.01', '0.99', '1.00', '5.00', '45.00', '250.00', '9999999999.99']);
    expect(edges.map((amount) => dollarsField.parse(dollarsForInput(String(amount))))).toEqual(edges.map(BigInt));
  });

  it('read whole dollars, a single cent place and spaces around the figure as dollars', () => {
    expect(['5', '5.0', ' 5.00 ', '250'].map((text) => dollarsField.parse(text))).toEqual([500n, 500n, 500n, 25000n]);
  });

  it('read a leading dollar sign and commas between groups of three', () => {
    expect(['$5', '$ 5.00', '5,000', '$1,250.50', '1,000,000', '9,999,999,999.99'].map((text) => dollarsField.parse(text))).toEqual([500n, 500n, 500000n, 125050n, 100000000n, 999999999999n]);
  });

  it('refuse a third place, a sign, a misplaced comma, eleven whole digits and a blank', () => {
    for (const text of ['5.001', '-5.00', '+5', '5,00', '50,00.00', '1,2345', ',500', '5,000,', '1000,000', '12,345,678,901', '$$5', '5$', '$', '10000000000.00', '', '.50']) {
      expect(dollarsField.safeParse(text).success, text).toBe(false);
    }
    expect(dollarsField.safeParse('5.001').error?.issues[0]?.message).toBe('an amount in dollars, such as 5.00 or 1,250.00');
    expect(DOLLARS_MESSAGE).toBe('an amount in dollars, such as 5.00 or 1,250.00');
  });

  it('refuse what is not canonical cents text, rather than guess a figure', () => {
    for (const text of ['', '05', '5.00', '1e3', ' 500']) {
      expect(() => dollarsForInput(text), text).toThrow();
    }
  });

  it('read back the largest amount a store holds, and refuse a cent more', () => {
    expect(dollarsForInput(String(MOST))).toBe('9999999999.99');
    expect(dollarsField.parse('9999999999.99')).toBe(BigInt(MOST));
    expect(dollarsField.safeParse('10000000000.00').success).toBe(false);
  });
});
