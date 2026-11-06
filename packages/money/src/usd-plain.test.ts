import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cents, formatUsd, formatUsdPlain } from './cents';

/**
 * formatUsdPlain's golden test (design lane-b-packet-figure-placeholders, section 5; test matrix CAS-55): a packet
 * narrative's figures are formatted in code alone, since their rendered text is hashed and compared across time and
 * processes. Each amount below prints as written, and as formatUsd en-US (the runtime's locale data) prints it, so a
 * change in that data fails here rather than refusing a stored version. The amounts cover zero, one cent, each width of
 * whole dollars around a comma's place, an amount past a float's exact integers, and each one negated.
 */
const GOLDEN: readonly (readonly [bigint, string])[] = [
  [0n, '$0.00'],
  [1n, '$0.01'],
  [9n, '$0.09'],
  [10n, '$0.10'],
  [99n, '$0.99'],
  [100n, '$1.00'],
  [105n, '$1.05'],
  [99_999n, '$999.99'],
  [100_000n, '$1,000.00'],
  [123_456n, '$1,234.56'],
  [9_999_999n, '$99,999.99'],
  [10_000_000n, '$100,000.00'],
  [99_999_999n, '$999,999.99'],
  [100_000_000n, '$1,000,000.00'],
  [123_456_789_012n, '$1,234,567,890.12'],
  [900_719_925_474_099_399n, '$9,007,199,254,740,993.99'],
];

describe('formatUsdPlain', () => {
  it('prints each golden amount as written, and as formatUsd en-US prints it', () => {
    for (const [amount, text] of GOLDEN) {
      expect(formatUsdPlain(cents(amount)), String(amount)).toBe(text);
      expect(formatUsd(cents(amount), 'en-US'), `the runtime's locale data moved for ${String(amount)}`).toBe(text);
      if (amount !== 0n) {
        expect(formatUsdPlain(cents(0n - amount)), String(0n - amount)).toBe(`-${text}`);
        expect(formatUsd(cents(0n - amount), 'en-US'), `the runtime's locale data moved for ${String(0n - amount)}`).toBe(`-${text}`);
      }
    }
  });

  it('never prints a negative zero, a leading zero or a group of other than three digits', () => {
    expect(formatUsdPlain(cents(-0n))).toBe('$0.00');
    expect(formatUsdPlain(cents(-1n))).toBe('-$0.01');
    expect(formatUsdPlain(cents(-100_000n))).toBe('-$1,000.00');
  });

  it('equals formatUsd en-US on any amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }), (amount) => {
        expect(formatUsdPlain(cents(amount))).toBe(formatUsd(cents(amount), 'en-US'));
      }),
      { numRuns: 200 },
    );
  });
});
