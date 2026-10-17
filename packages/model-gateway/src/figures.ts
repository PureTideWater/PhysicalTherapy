import { isIsoDate, normalizePageText } from '@tp/contracts';
import { type Cents, parseAmount } from '@tp/money';
import { type FigureKind, canonicalNumber, readableText, scanText } from '@tp/packets';

/**
 * Reading what a model copied from a document. A model never produces an amount, a date or a code
 * (CLAUDE.md, rule 1): it copies the text as the document writes it ("$32.50", "January 1, 2026"),
 * and code here reads that text into a value, or refuses to. Each reader accepts a few plain written
 * forms and nothing it would have to guess at; anything else is unreadable and the field is rejected
 * for a person to enter by hand.
 */

/** Text as quotes and pages compare it: NFKC, whitespace runs as one space, trimmed (@tp/contracts). */
export function normalized(text: string): string {
  return normalizePageText(text);
}

/** Whether the written text appears, as written, in the quote (a plain substring). An empty value never does. */
export function inQuote(written: string, quote: string): boolean {
  const wanted = normalized(written);
  return wanted !== '' && normalized(quote).includes(wanted);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WORD = /[\p{L}\p{N}]/u;
const DIGIT = /\d/;

/**
 * Whether the text at [start, end) stands alone as a whole figure: no letter or digit touches it, no
 * dollar sign, slash or percent sign joins it to a figure beside it, and no decimal point, thousands
 * comma or hyphen joins it to digits on the other side ("10" is not a whole figure of "110", "1.10",
 * "$10", "10/1/2026" or "1,010"). `hyphenated` lets a modifier hang from its code ("97110-59").
 */
export function standsAlone(text: string, start: number, end: number, options: { readonly hyphenated?: 'modifier' | 'code' } = {}): boolean {
  const before = text.charAt(start - 1);
  const after = text.charAt(end);
  const beforeBefore = text.charAt(start - 2);
  const afterAfter = text.slice(end + 1);
  if ((before !== '' && WORD.test(before)) || (after !== '' && WORD.test(after))) {
    return false;
  }
  if (before === '$' || before === '/' || after === '/' || after === '%') {
    return false;
  }
  if (before === '.' && DIGIT.test(beforeBefore)) {
    return false;
  }
  if (after === '.' && /^\d/.test(afterAfter)) {
    return false;
  }
  // A thousands comma joins exactly three digits to the digits before it.
  if (before === ',' && DIGIT.test(beforeBefore) && /^\d{3}$/.test(text.slice(start, end))) {
    return false;
  }
  if (after === ',' && /^\d{3}(?!\d)/.test(afterAfter) && DIGIT.test(text.charAt(end - 1))) {
    return false;
  }
  if (before === '-' && beforeBefore !== '' && WORD.test(beforeBefore)) {
    // A modifier may hang from its code or from the modifier before it (97110-GP-59); nothing else joins.
    const chain = /(?:^|[^\p{L}\p{N}-])[0-9A-Za-z]{5}(?:-[0-9A-Za-z]{2})*$/u.test(text.slice(0, start - 1));
    if (options.hyphenated !== 'modifier' || !chain) {
      return false;
    }
  }
  if (after === '-' && /^[\p{L}\p{N}]/u.test(afterAfter)) {
    // A code may carry its modifiers (97110-GP); a range or a longer identifier joins it to another figure.
    const modifiers = /^[0-9A-Za-z]{2}(?:-[0-9A-Za-z]{2})*(?![\p{L}\p{N}-])/u.test(afterAfter);
    if (options.hyphenated === undefined || !modifiers) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a code, modifier or place of service appears in the quote as a whole token, without regard
 * to case: "11" is not a place of service of "11/1/2026", "59" not a modifier of "$59.00", "9711" not a
 * code of "97110".
 */
export function tokenInQuote(token: string, quote: string, field: 'codes' | 'modifiers' | 'places_of_service' = 'codes'): boolean {
  if (token === '') {
    return false;
  }
  const text = normalized(quote);
  const hyphenated = field === 'codes' ? 'code' : field === 'modifiers' ? 'modifier' : undefined;
  for (const match of text.matchAll(new RegExp(escapeRegExp(token), 'gi'))) {
    if (standsAlone(text, match.index, match.index + match[0].length, hyphenated === undefined ? {} : { hyphenated })) {
      return true;
    }
  }
  return false;
}

/** Whether a written reference (a claim's or the payer's) appears in the quote as a whole word, not as part of a longer figure. */
export function wholeInQuote(written: string, quote: string): boolean {
  const wanted = normalized(written);
  if (wanted === '') {
    return false;
  }
  const text = normalized(quote);
  const pattern = new RegExp(escapeRegExp(wanted), 'giu');
  return [...text.matchAll(pattern)].some((match) => standsAlone(text, match.index, match.index + match[0].length));
}

/** The kinds of figure a model copies for code to read. */
export type WrittenFigure = 'amount' | 'percentage' | 'year' | 'date';

const SCANNED: Readonly<Record<WrittenFigure, FigureKind>> = { amount: 'amount', percentage: 'percent', year: 'number', date: 'date' };

/** What code reads from the written text, as the packets scanner writes a figure's value; null when it reads nothing. */
function readValue(kind: WrittenFigure, written: string): string | null {
  switch (kind) {
    case 'amount': {
      const cents = readAmount(written);
      return cents === null ? null : cents.toString();
    }
    case 'percentage': {
      const percent = readPercent(written);
      return percent === null ? null : canonicalNumber(percent);
    }
    case 'year': {
      const year = readYear(written);
      return year === null ? null : String(year);
    }
    case 'date':
      return readDate(written);
  }
}

/**
 * Whether the quote holds the written value as a whole figure (CLAUDE.md rule 1; PRD 14: "every amount
 * and date must appear in its quote"): the written text is in the quote, and the quote, read by the
 * packets verifier's own scanner, holds a figure of the field's kind whose value is what code reads
 * from the written text. "$3" is not in "$32.50" (an amount of 3250 cents), "10%" not in "110%",
 * "1/1/2026" not in "11/1/2026", and a fee-schedule year written inside a date is not a year.
 */
export function figureInQuote(kind: WrittenFigure, written: string, quote: string): boolean {
  const value = readValue(kind, written);
  if (value === null || !inQuote(written, quote)) {
    return false;
  }
  const wanted = SCANNED[kind];
  return scanText(readableText(normalized(quote)).text).figures.some((figure) => figure.kind === wanted && figure.value === value);
}

const AMOUNT = /^\$?\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)$/;

/** "$1,234.50", "1234.50", "$85" as cents; null for anything else. */
export function readAmount(written: string): Cents | null {
  const match = AMOUNT.exec(normalized(written));
  return match?.[1] === undefined ? null : parseAmount(match[1].replaceAll(',', ''));
}

const PERCENT = /^(\d{1,4}(?:\.\d{1,6})?)\s?(?:%|percent|per cent)?$/i;

/** "110%", "110 percent", "112.5%" as the percentage's decimal text ("110", "112.5"); null for anything else. */
export function readPercent(written: string): string | null {
  return PERCENT.exec(normalized(written))?.[1] ?? null;
}

/** The one four-digit year the text writes (a fee-schedule year), or null for none or more than one. */
export function readYear(written: string): number | null {
  const years = normalized(written).match(/(?<!\d)(?:19|20)\d{2}(?!\d)/g) ?? [];
  return years.length === 1 && years[0] !== undefined ? Number.parseInt(years[0], 10) : null;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAME = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const DATE_FORMS: readonly { readonly pattern: RegExp; readonly parts: (match: RegExpExecArray) => readonly [string, string, string] }[] = [
  { pattern: /^(\d{4})-(\d{2})-(\d{2})$/, parts: (m) => [m[1] ?? '', m[2] ?? '', m[3] ?? ''] },
  { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parts: (m) => [m[3] ?? '', m[1] ?? '', m[2] ?? ''] },
  { pattern: new RegExp(`^${MONTH_NAME}\\s${DAY},?\\s(\\d{4})$`, 'i'), parts: (m) => [m[3] ?? '', monthNumber(m[1]), m[2] ?? ''] },
  { pattern: new RegExp(`^${DAY}\\s${MONTH_NAME},?\\s(\\d{4})$`, 'i'), parts: (m) => [m[3] ?? '', monthNumber(m[2]), m[1] ?? ''] },
];

/** A month's number from its name or abbreviation (the pattern admits only those). */
function monthNumber(name: string | undefined): string {
  return String(MONTHS[(name ?? '').toLowerCase().slice(0, 3)]);
}

/**
 * A calendar date as ISO text from "2026-01-01", "1/1/2026" (month first), "January 1, 2026",
 * "Jan. 1st, 2026" or "1 January 2026"; null for anything else, or a day the calendar does not have.
 */
export function readDate(written: string): string | null {
  const text = normalized(written);
  for (const form of DATE_FORMS) {
    const match = form.pattern.exec(text);
    if (match !== null) {
      const [year, month, day] = form.parts(match);
      const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      return isIsoDate(iso) ? iso : null;
    }
  }
  return null;
}
