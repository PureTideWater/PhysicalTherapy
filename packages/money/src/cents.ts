/**
 * Amounts are integer cents held as a branded bigint. Nothing in this module converts an amount to
 * or from a JavaScript number: text is parsed digit by digit and formatted the same way, and the
 * brand means a plain number or an unchecked bigint cannot be passed where cents are expected.
 */
declare const CENTS: unique symbol;

/** An amount in integer cents. Built by `cents`, `parseAmount`, `parseCents` or the arithmetic here. */
export type Cents = bigint & { readonly [CENTS]: true };

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

/** Brands an integer count of cents. A JavaScript number is refused, at compile time and at runtime. */
export function cents(value: bigint): Cents {
  if (typeof value !== 'bigint') {
    throw new MoneyError('cents are built from a bigint, never a number');
  }
  return value as Cents;
}

export const ZERO_CENTS: Cents = cents(0n);

// An optional minus sign, integer digits, and at most two decimal places. A leading decimal point
// (".5") is accepted because X12 decimal elements suppress leading zeros.
const AMOUNT_PATTERN = /^(-?)(\d*)(?:\.(\d{0,2}))?$/;

/** Parses a decimal dollar amount ("1234.5", "-0.05", ".5") into integer cents. Refuses a third place. */
export function parseAmount(text: string): Cents {
  const match = AMOUNT_PATTERN.exec(text);
  const whole = match?.[2] ?? '';
  const fraction = match?.[3] ?? '';
  if (!match || (whole === '' && fraction === '')) {
    throw new MoneyError('amount is not a decimal with at most two places');
  }
  const magnitude = BigInt(whole === '' ? '0' : whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents(match[1] === '-' ? -magnitude : magnitude);
}

// Canonical integer text: no sign on zero, no leading zeros, no plus sign.
const CENTS_TEXT = /^(?:0|-?[1-9]\d*)$/;

/** Parses cents serialized as an integer string ("248000"), the JSON form of a bigint amount. */
export function parseCents(text: string): Cents {
  if (!CENTS_TEXT.test(text)) {
    throw new MoneyError('cents text is not a canonical integer');
  }
  return cents(BigInt(text));
}

/** Serializes cents as an integer string for JSON ("248000"); `parseCents` reads it back. */
export function centsToString(amount: Cents): string {
  return amount.toString();
}

/** Formats cents as a plain decimal dollar string with exactly two places ("-12.05"). */
export function formatCents(amount: Cents): string {
  const negative = amount < 0n;
  const magnitude = negative ? 0n - amount : amount;
  const whole = magnitude / 100n;
  const fraction = (magnitude % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/** Formats cents as US dollars for display in a locale, without passing through a float. */
export function formatUsd(amount: Cents, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
  return formatter.format(formatCents(amount) as Intl.StringNumericLiteral);
}

// Unrounded cents as decimal text: an optional minus sign, integer digits and an optional fraction of a cent.
const UNROUNDED_CENTS_TEXT = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Formats an unrounded amount, cents as decimal text that may keep a fraction of a cent ("12345678.5"), as US dollars
 * in formatUsd's own form, its whole cents grouped and signed as formatUsd's are, with its fraction of a cent after
 * them: "$123,456.785", "-$1.505"; a whole number of cents reads exactly as formatUsd's. Never through a float.
 */
export function formatUnroundedUsd(text: string): string {
  const match = UNROUNDED_CENTS_TEXT.exec(text);
  if (match === null) {
    throw new MoneyError('an unrounded amount is cents as decimal text');
  }
  const magnitude = BigInt(match[2] ?? '0');
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const negative = match[1] === '-' && (magnitude !== 0n || fraction !== '');
  return `${negative ? '-' : ''}${formatUsd(cents(magnitude))}${fraction}`;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negateCents(amount: Cents): Cents {
  return cents(0n - amount);
}

/** Sums amounts exactly. */
export function sumCents(amounts: Iterable<Cents>): Cents {
  let total = 0n;
  for (const amount of amounts) {
    total += amount;
  }
  return cents(total);
}

/** -1, 0 or 1 as `a` is less than, equal to or greater than `b`. */
export function compareCents(a: Cents, b: Cents): -1 | 0 | 1 {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a >= b ? a : b;
}
