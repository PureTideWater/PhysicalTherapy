import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dollarsField, dollarsForInput } from './money-input';

/**
 * Stored cents to the dollars a person edits, and back (test matrix CAS-39): over every amount a save can store,
 * [0, 99,999,999,999] cents, the dollars a form is pre-filled with read back through the save's field as the same
 * cents, so saving a form unchanged changes nothing.
 */

const MOST = 99_999_999_999;

describe('dollarsForInput and dollarsField (CAS-39)', () => {
  it('are each other’s inverse for every amount a save can store', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MOST }), (amount) => {
        expect(dollarsField.parse(dollarsForInput(String(amount)))).toBe(BigInt(amount));
      }),
      { numRuns: 2_000 },
    );
  });

  it('write dollars with two places at the edges, and read them back', () => {
    const edges = [0, 1, 99, 100, 500, 4500, 25000, MOST];
    expect(edges.map((amount) => dollarsForInput(String(amount)))).toEqual(['0.00', '0.01', '0.99', '1.00', '5.00', '45.00', '250.00', '999999999.99']);
    expect(edges.map((amount) => dollarsField.parse(dollarsForInput(String(amount))))).toEqual(edges.map(BigInt));
  });

  it('read whole dollars, a single cent place and spaces around the figure as dollars', () => {
    expect(['5', '5.0', ' 5.00 ', '250'].map((text) => dollarsField.parse(text))).toEqual([500n, 500n, 500n, 25000n]);
  });

  it('refuse a third place, a sign, a separator, ten whole digits and a blank', () => {
    for (const text of ['5.001', '-5.00', '+5', '1,000.00', '$5.00', '1000000000.00', '', '.50']) {
      expect(dollarsField.safeParse(text).success, text).toBe(false);
    }
    expect(dollarsField.safeParse('5.001').error?.issues[0]?.message).toBe('dollars and cents, such as 5.00');
  });

  it('refuse what is not canonical cents text, rather than guess a figure', () => {
    for (const text of ['', '05', '5.00', '1e3', ' 500']) {
      expect(() => dollarsForInput(text), text).toThrow();
    }
  });

  it('show a stored twelve-digit amount, which only seeding or SQL can store, as dollars the save then refuses (a hand-over to Lane A)', () => {
    expect(dollarsForInput('999999999999')).toBe('9999999999.99');
    expect(dollarsField.safeParse('9999999999.99').success).toBe(false);
  });
});
