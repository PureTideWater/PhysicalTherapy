import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MoneyError, formatCents, formatUsd, parseAmount, sumCents } from './cents';

describe('parseAmount', () => {
  it.each([
    ['0', 0n],
    ['12', 1200n],
    ['12.3', 1230n],
    ['12.34', 1234n],
    ['-5.01', -501n],
    ['.5', 50n],
    ['-.05', -5n],
    ['7.', 700n],
    ['-0', 0n],
    ['123456789012345678.99', 12345678901234567899n],
  ])('reads %s as %s cents', (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });

  it.each(['', '-', '.', '12.345', '1,000', '1e3', ' 1', '1 ', 'abc', '--1', '+1', '0x10'])(
    'refuses %j',
    (text) => {
      expect(() => parseAmount(text)).toThrow(MoneyError);
    },
  );

  it('does not echo the input in its error message', () => {
    expect(() => parseAmount('123456789.123')).toThrow(/^amount is not a decimal/);
    try {
      parseAmount('123456789.123');
    } catch (error) {
      expect(String(error)).not.toContain('123456789');
    }
  });
});

describe('formatCents', () => {
  it.each([
    [0n, '0.00'],
    [5n, '0.05'],
    [-5n, '-0.05'],
    [1234n, '12.34'],
    [-120000n, '-1200.00'],
  ])('writes %s cents as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('round-trips every amount through parseAmount (property)', () => {
    fc.assert(
      fc.property(fc.bigInt(), (cents) => {
        expect(parseAmount(formatCents(cents))).toBe(cents);
      }),
    );
  });
});

describe('formatUsd', () => {
  it('formats cents as dollars in the practice locale', () => {
    expect(formatUsd(123456n)).toBe('$1,234.56');
    expect(formatUsd(-5n)).toBe('-$0.05');
  });

  it('keeps every digit of amounts beyond float precision', () => {
    expect(formatUsd(900719925474099399n)).toBe('$9,007,199,254,740,993.99');
  });
});

describe('sumCents', () => {
  it('returns zero for no amounts', () => {
    expect(sumCents([])).toBe(0n);
  });

  it('is exact and order-independent (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt()), (amounts) => {
        const expected = amounts.reduce((total, amount) => total + amount, 0n);
        expect(sumCents(amounts)).toBe(expected);
        expect(sumCents([...amounts].reverse())).toBe(expected);
      }),
    );
  });
});
