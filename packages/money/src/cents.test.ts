import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MoneyError,
  ZERO_CENTS,
  addCents,
  cents,
  centsToString,
  compareCents,
  formatCents,
  formatUnroundedUsd,
  formatUsd,
  maxCents,
  minCents,
  negateCents,
  parseAmount,
  parseCents,
  subtractCents,
  sumCents,
} from './cents';

const anyCents = fc.bigInt().map(cents);

describe('cents', () => {
  it('brands a bigint', () => {
    expect(cents(1234n)).toBe(1234n);
    expect(ZERO_CENTS).toBe(0n);
  });

  it('refuses a number that reached it through a cast', () => {
    expect(() => cents(12 as unknown as bigint)).toThrow(MoneyError);
    expect(() => cents((1 / 2) as unknown as bigint)).toThrow(/never a number/);
  });
});

describe('parseAmount', () => {
  it.each([
    ['0', 0n],
    ['0.01', 1n],
    ['0.1', 10n],
    ['12', 1200n],
    ['12.3', 1230n],
    ['12.34', 1234n],
    ['-5.01', -501n],
    ['-0.01', -1n],
    ['.5', 50n],
    ['-.05', -5n],
    ['7.', 700n],
    ['-0', 0n],
    ['-0.00', 0n],
    ['000012.30', 1230n],
    ['123456789012345678.99', 12345678901234567899n],
    ['9007199254740993.01', 900719925474099301n],
  ])('reads %s as %s cents', (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each(['', '-', '.', '-.', '12.345', '0.001', '0.005', '1,000', '1e3', ' 1', '1 ', 'abc', '--1', '+1', '0x10', 'NaN', 'Infinity'])(
    'refuses %j',
    (text) => {
      expect(() => parseAmount(text)).toThrow(MoneyError);
    },
  );

  it('does not echo the input in its error message', () => {
    try {
      parseAmount('123456789.123');
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/amount is not a decimal/);
      expect(String(error)).not.toContain('123456789');
    }
  });
});

describe('parseCents and centsToString', () => {
  it.each([
    ['0', 0n],
    ['1', 1n],
    ['-1', -1n],
    ['248000', 248000n],
    ['-900719925474099399', -900719925474099399n],
  ])('reads %s', (text, expected) => {
    expect(parseCents(text)).toBe(expected);
    expect(centsToString(parseCents(text))).toBe(text);
  });

  it.each(['', '-0', '01', '+1', '1.0', '1.', ' 1', '1e3', '0x1', '- 1'])('refuses the non-canonical %j', (text) => {
    expect(() => parseCents(text)).toThrow(MoneyError);
  });

  it('round-trips every amount (property)', () => {
    fc.assert(
      fc.property(anyCents, (amount) => {
        expect(parseCents(centsToString(amount))).toBe(amount);
      }),
    );
  });
});

describe('formatCents', () => {
  it.each([
    [0n, '0.00'],
    [1n, '0.01'],
    [5n, '0.05'],
    [-5n, '-0.05'],
    [99n, '0.99'],
    [100n, '1.00'],
    [1234n, '12.34'],
    [-120000n, '-1200.00'],
  ])('writes %s cents as %s', (amount, text) => {
    expect(formatCents(cents(amount))).toBe(text);
  });

  it('round-trips every amount through parseAmount (property)', () => {
    fc.assert(
      fc.property(anyCents, (amount) => {
        expect(parseAmount(formatCents(amount))).toBe(amount);
      }),
    );
  });

  it('round-trips every two-place decimal text through formatCents (property)', () => {
    const text = fc
      .tuple(fc.boolean(), fc.bigInt({ min: 0n, max: 10n ** 20n }), fc.integer({ min: 0, max: 99 }))
      .map(([negative, whole, fraction]) => `${negative && (whole > 0n || fraction > 0) ? '-' : ''}${whole.toString()}.${String(fraction).padStart(2, '0')}`);
    fc.assert(
      fc.property(text, (amountText) => {
        expect(formatCents(parseAmount(amountText))).toBe(amountText);
      }),
    );
  });
});

describe('formatUsd', () => {
  it('formats cents as dollars in the practice locale', () => {
    expect(formatUsd(cents(123456n))).toBe('$1,234.56');
    expect(formatUsd(cents(-5n))).toBe('-$0.05');
    expect(formatUsd(ZERO_CENTS)).toBe('$0.00');
  });

  it('follows the locale', () => {
    expect(formatUsd(cents(123456n), 'de-DE')).toBe('1.234,56 $');
    expect(formatUsd(cents(123456n), 'en-IN')).toBe('$1,234.56');
  });

  it('keeps every digit of amounts beyond float precision', () => {
    expect(formatUsd(cents(900719925474099399n))).toBe('$9,007,199,254,740,993.99');
  });
});

describe('formatUnroundedUsd', () => {
  it('formats an unrounded amount in formatUsd’s grouping and sign, its fraction of a cent kept after the cents', () => {
    expect(formatUnroundedUsd('12345678.5')).toBe('$123,456.785');
    expect(formatUnroundedUsd('-150.5')).toBe('-$1.505');
    expect(formatUnroundedUsd('-0.25')).toBe('-$0.0025');
    expect(formatUnroundedUsd('10000.50')).toBe('$100.005');
    expect(formatUnroundedUsd('10000.000')).toBe('$100.00');
    expect(formatUnroundedUsd('-0')).toBe('$0.00');
  });

  it('reads a whole number of cents exactly as formatUsd does', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), (value) => {
        expect(formatUnroundedUsd(value.toString())).toBe(formatUsd(cents(value)));
      }),
    );
  });

  it('refuses anything but cents as decimal text', () => {
    for (const text of ['', '1.', '.5', '1e3', '$1.00', '1,000', ' 1']) {
      expect(() => formatUnroundedUsd(text)).toThrow(MoneyError);
    }
  });

  it.each([
    ['0', '$0.00'],
    ['7', '$0.07'],
    ['100', '$1.00'],
    ['-100', '-$1.00'],
    ['0.5', '$0.005'],
    ['-0.5', '-$0.005'],
    ['-0.0', '$0.00'],
    ['-0.000', '$0.00'],
    ['-100.00', '-$1.00'],
    ['100.10', '$1.001'],
    ['10000.05', '$100.0005'],
    ['10000.050', '$100.0005'],
    ['10000.0050', '$100.00005'],
    ['10000.505', '$100.00505'],
    ['12345678.0050', '$123,456.78005'],
    ['900719925474099399.25', '$9,007,199,254,740,993.9925'],
  ])('writes %s cents as %s: every whole-cent digit read, only the fraction’s trailing zeros dropped', (text, expected) => {
    expect(formatUnroundedUsd(text)).toBe(expected);
  });
});

/** The error `run` throws, so a test can hold its class, its name and its exact message. */
function refusalOf(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error('the refusal is not an Error', { cause: error });
  }
  throw new Error('expected a refusal, and nothing was thrown');
}

describe('MoneyError', () => {
  it('names itself, so a log line or a caught error reads as a money refusal', () => {
    const error = new MoneyError('a refusal');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MoneyError');
    expect(String(error)).toBe('MoneyError: a refusal');
  });

  it.each([
    ['cents', () => cents(12 as unknown as bigint), 'cents are built from a bigint, never a number'],
    ['parseAmount', () => parseAmount('12.345'), 'amount is not a decimal with at most two places'],
    ['parseCents', () => parseCents('01'), 'cents text is not a canonical integer'],
    ['formatUnroundedUsd', () => formatUnroundedUsd('1.'), 'an unrounded amount is cents as decimal text'],
  ])('%s refuses with a MoneyError and its own message', (_name, run, message) => {
    const error = refusalOf(run);
    expect(error).toBeInstanceOf(MoneyError);
    expect(error.name).toBe('MoneyError');
    expect(error.message).toBe(message);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and negates exactly', () => {
    expect(addCents(cents(150n), cents(-25n))).toBe(125n);
    expect(subtractCents(cents(150n), cents(175n))).toBe(-25n);
    expect(negateCents(cents(42n))).toBe(-42n);
    expect(negateCents(ZERO_CENTS)).toBe(0n);
  });

  it('compares, and picks the smaller or larger amount', () => {
    expect(compareCents(cents(1n), cents(2n))).toBe(-1);
    expect(compareCents(cents(2n), cents(2n))).toBe(0);
    expect(compareCents(cents(3n), cents(2n))).toBe(1);
    expect(minCents(cents(5n), cents(-5n))).toBe(-5n);
    expect(minCents(cents(-5n), cents(5n))).toBe(-5n);
    expect(maxCents(cents(5n), cents(-5n))).toBe(5n);
    expect(maxCents(cents(-5n), cents(5n))).toBe(5n);
  });

  it('sums to zero for no amounts', () => {
    expect(sumCents([])).toBe(0n);
  });

  it('sums exactly and in any order (property)', () => {
    fc.assert(
      fc.property(fc.array(anyCents), (amounts) => {
        const expected = amounts.reduce<bigint>((total, amount) => total + amount, 0n);
        expect(sumCents(amounts)).toBe(expected);
        expect(sumCents([...amounts].reverse())).toBe(expected);
      }),
    );
  });

  it('adds associatively and sums split lists to the same total (property)', () => {
    fc.assert(
      fc.property(anyCents, anyCents, anyCents, fc.array(anyCents), fc.nat(), (a, b, c, amounts, at) => {
        expect(addCents(addCents(a, b), c)).toBe(addCents(a, addCents(b, c)));
        const split = at % (amounts.length + 1);
        expect(addCents(sumCents(amounts.slice(0, split)), sumCents(amounts.slice(split)))).toBe(sumCents(amounts));
      }),
    );
  });

  it('subtracting undoes adding (property)', () => {
    fc.assert(
      fc.property(anyCents, anyCents, (a, b) => {
        expect(subtractCents(addCents(a, b), b)).toBe(a);
        expect(addCents(a, negateCents(a))).toBe(0n);
      }),
    );
  });
});
