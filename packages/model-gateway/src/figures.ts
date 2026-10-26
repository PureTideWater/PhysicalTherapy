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

/** Where a figure or a token stands in a quote: [start, end) of the quote as `normalized` reads it. */
export interface QuoteSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * Where a code, modifier or place of service appears in the quote as a whole token, without regard to
 * case: "11" is not a place of service of "11/1/2026", "59" not a modifier of "$59.00", "9711" not a
 * code of "97110". Positions are in the quote as `normalized` reads it.
 */
export function tokenSpans(token: string, quote: string, field: 'codes' | 'modifiers' | 'places_of_service' = 'codes'): QuoteSpan[] {
  if (token === '') {
    return [];
  }
  const text = normalized(quote);
  const hyphenated = field === 'codes' ? 'code' : field === 'modifiers' ? 'modifier' : undefined;
  const spans: QuoteSpan[] = [];
  for (const match of text.matchAll(new RegExp(escapeRegExp(token), 'gi'))) {
    const span = { start: match.index, end: match.index + match[0].length };
    if (standsAlone(text, span.start, span.end, hyphenated === undefined ? {} : { hyphenated })) {
      spans.push(span);
    }
  }
  return spans;
}

/** Whether a code, modifier or place of service appears in the quote as a whole token (tokenSpans finds one). */
export function tokenInQuote(token: string, quote: string, field: 'codes' | 'modifiers' | 'places_of_service' = 'codes'): boolean {
  return tokenSpans(token, quote, field).length > 0;
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
 * Where the quote holds the written value as a whole figure (CLAUDE.md rule 1; PRD 14: "every amount and
 * date must appear in its quote"): none unless the written text is in the quote; otherwise every figure
 * of the field's kind that the quote, read by the packets verifier's own scanner, holds with the value
 * code reads from the written text. "$3" is not in "$32.50" (an amount of 3250 cents), "10%" not in
 * "110%", "1/1/2026" not in "11/1/2026", and a fee-schedule year written inside a date is not a year.
 * Positions are in the quote as `normalized` reads it (the scanner reads it with hidden characters left
 * out, and each figure's span is mapped back).
 */
export function figureSpans(kind: WrittenFigure, written: string, quote: string): QuoteSpan[] {
  const value = readValue(kind, written);
  if (value === null || !inQuote(written, quote)) {
    return [];
  }
  const wanted = SCANNED[kind];
  const readable = readableText(normalized(quote));
  return scanText(readable.text)
    .figures.filter((figure) => figure.kind === wanted && figure.value === value)
    .map((figure) => readable.original(figure.start, figure.end));
}

/** Whether the quote holds the written value as a whole figure (figureSpans finds one). */
export function figureInQuote(kind: WrittenFigure, written: string, quote: string): boolean {
  return figureSpans(kind, written, quote).length > 0;
}

/** A code token of a quote: its text as written and where it stands in the quote as `normalized` reads it. */
export interface CodeToken extends QuoteSpan {
  readonly token: string;
}

/** HCPCS shape: four digits then a digit or a capital letter (CPT, Category II and III), or a capital letter then four digits (Level II). */
const CODE_SHAPE = /(?<![\p{L}\p{N}])(?:\d{4}[0-9A-Z]|[A-Z]\d{4})(?![\p{L}\p{N}])/gu;
/** The scanner's kinds a code token can never stand inside: a figure of one of these is not a code. */
const NOT_CODES: ReadonlySet<FigureKind> = new Set(['amount', 'percent', 'date', 'month', 'month_day']);

/**
 * Every code token of a quote, in order (docs/adr/0070, Part 1: the verifier's row check): a whole token
 * of HCPCS shape, matched with its case as written (never upper-cased, so "Payer", "shall" and "TOTAL"
 * are never codes, as a case-blind match of tokenInQuote would make them), standing alone by
 * standsAlone's boundaries (a code may carry its modifiers, "97110-GP"), and not inside an amount, a
 * percentage or a date the packets scanner reads. A five-digit ZIP code is a code token: the row check
 * then rejects a figure whose nearest token is the ZIP, a visible rejection the specialist resolves.
 */
export function codeTokens(quote: string): CodeToken[] {
  const text = normalized(quote);
  const readable = readableText(text);
  const figures = scanText(readable.text)
    .figures.filter((figure) => NOT_CODES.has(figure.kind))
    .map((figure) => readable.original(figure.start, figure.end));
  const tokens: CodeToken[] = [];
  for (const match of text.matchAll(CODE_SHAPE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (standsAlone(text, start, end, { hyphenated: 'code' }) && !figures.some((figure) => figure.start < end && start < figure.end)) {
      tokens.push({ token: match[0], start, end });
    }
  }
  return tokens;
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
