import { isIsoDate, normalizePageText } from '@tp/contracts';
import { type Cents, parseAmount } from '@tp/money';

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

/** Whether the written value appears, as written, in the quote. An empty value never does. */
export function inQuote(written: string, quote: string): boolean {
  const wanted = normalized(written);
  return wanted !== '' && normalized(quote).includes(wanted);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a code, modifier or place of service appears in the quote as a whole token, without regard to case. */
export function tokenInQuote(token: string, quote: string): boolean {
  return token !== '' && new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(token)}(?![A-Za-z0-9])`, 'i').test(normalized(quote));
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
