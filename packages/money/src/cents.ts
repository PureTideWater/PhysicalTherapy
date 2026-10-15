/**
 * Amounts are integer cents held as bigint. Nothing in this module converts an amount to a
 * JavaScript number: text is parsed digit by digit and formatted the same way.
 */
export type Cents = bigint;

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

// An optional minus sign, integer digits, and at most two decimal places. A leading decimal point
// (".5") is accepted because X12 decimal elements suppress leading zeros.
const AMOUNT_PATTERN = /^(-?)(\d*)(?:\.(\d{0,2}))?$/;

/** Parses a decimal amount ("1234.5", "-0.05", ".5") into integer cents. */
export function parseAmount(text: string): Cents {
  const match = AMOUNT_PATTERN.exec(text);
  const whole = match?.[2] ?? '';
  const fraction = match?.[3] ?? '';
  if (!match || (whole === '' && fraction === '')) {
    throw new MoneyError('amount is not a decimal with at most two places');
  }
  const magnitude = BigInt(whole === '' ? '0' : whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return match[1] === '-' ? -magnitude : magnitude;
}

/** Formats cents as a plain decimal string with exactly two places ("-12.05"). */
export function formatCents(cents: Cents): string {
  const negative = cents < 0n;
  const magnitude = negative ? -cents : cents;
  const whole = magnitude / 100n;
  const fraction = (magnitude % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

/** Formats cents as US dollars for display in the given locale, without passing through a float. */
export function formatUsd(cents: Cents, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
  return formatter.format(formatCents(cents) as Intl.StringNumericLiteral);
}

/** Sums amounts exactly. */
export function sumCents(amounts: Iterable<Cents>): Cents {
  let total = 0n;
  for (const amount of amounts) {
    total += amount;
  }
  return total;
}
