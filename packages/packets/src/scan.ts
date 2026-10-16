import { decimal, parseAmount } from '@tp/money';

import { PLACEHOLDER_PATTERN } from './placeholders';

/**
 * Reading a narrative the way the verifier checks it (PRD 12: "the verifier then checks every date,
 * code, unit, amount, count and identifier in the text against the canonical record"; PRD 14,
 * draftPacketNarrative: "a citation marker on every sentence"). Deterministic and conservative: every
 * run of text that holds a digit, and every number written in words from "two" up, is a figure of some
 * kind, so nothing numeric slips past as prose. Figures carry their kind, a canonical value and their
 * position; the narrative's own text never leaves this module in a report.
 *
 * Kinds, in the order they are read (each consumes its text before the next looks):
 * - placeholders {{claim_control_number:3}} and citation markers [1] or [1, 3];
 * - dates: "March 5, 2026", "5 March 2026", "March 2026" (a month), "March 5" (a day of a month),
 *   2026-03-05 and 3/5/2026; an impossible date is an identifier;
 * - percentages: 120%, 120 percent, 9.5 per cent;
 * - amounts: $1,234.56, $50, and a bare number with exactly two decimals (50.00);
 * - procedure codes (97110, G0283, 0001F) with any attached modifiers (97110-GP-59), and modifiers named
 *   as such ("modifier 59", "modifiers GP and KX", "the GP modifier");
 * - digit groups joined by hyphens (58-3-225) are one identifier;
 * - other numbers: 3, 1,200, 2.5, 3rd, x2;
 * - anything else holding a digit is an identifier;
 * - numbers in words (twelve, twenty-one, two hundred and five; "one" and "zero" alone are prose), and
 *   with "percent" after them, percentages.
 */

export type FigureKind = 'amount' | 'percent' | 'date' | 'month' | 'month_day' | 'code' | 'modifier' | 'number' | 'identifier';

export interface Figure {
  readonly kind: FigureKind;
  /**
   * Canonical value: cents as integer text (amount), a plain decimal (percent, number), an ISO date
   * (date), YYYY-MM (month), MM-DD (month_day), the code or modifier, or the identifier as written.
   */
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface PlaceholderToken {
  readonly kind: string;
  readonly row: number;
  readonly start: number;
  readonly end: number;
}

export interface MarkerToken {
  readonly sources: readonly number[];
  readonly start: number;
  readonly end: number;
}

export interface Scan {
  readonly figures: readonly Figure[];
  readonly placeholders: readonly PlaceholderToken[];
  readonly markers: readonly MarkerToken[];
}

export interface Span {
  readonly start: number;
  readonly end: number;
}

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';

export const MARKER_PATTERN = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g;

const pad = (value: number) => String(value).padStart(2, '0');

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** An ISO date from its parts, or null when no such day exists. */
export function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/** A plain decimal's canonical text ("1,200.50" is "1200.5", "007" is "7"). */
export function canonicalNumber(text: string): string {
  return decimal(text.replaceAll(',', '')).toString();
}

const int = (text: string) => Number.parseInt(text, 10);

const UNITS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};
const TEENS: Readonly<Record<string, number>> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Readonly<Record<string, number>> = { thousand: 1000, million: 1_000_000 };
const NUMBER_WORD = `(?:${[...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS), 'hundred', ...Object.keys(SCALES)].join('|')})`;
const NUMBER_WORDS = new RegExp(`\\b${NUMBER_WORD}(?:(?:\\s+and\\s+|\\s*-\\s*|\\s+)${NUMBER_WORD})*\\b(\\s*(?:percent|per\\s+cent)\\b)?`, 'gi');

type WordClass = 'unit' | 'teen' | 'tens' | 'hundred' | 'scale';

function classOf(word: string): WordClass | null {
  if (word in UNITS) {
    return 'unit';
  }
  if (word in TEENS) {
    return 'teen';
  }
  if (word in TENS) {
    return 'tens';
  }
  if (word === 'hundred') {
    return 'hundred';
  }
  return word in SCALES ? 'scale' : null;
}

interface WordNumber {
  readonly value: number;
  readonly words: readonly { readonly word: string; readonly start: number; readonly end: number }[];
}

/**
 * Splits a run of number words into the numbers it writes: "twenty-one" is 21, "two hundred and
 * five" 205, "twelve thousand" 12000; a word the grammar cannot join to the one before starts a new
 * number ("two three" is 2 and 3), and "and" joins only after hundred, thousand or million.
 */
export function numbersInWords(words: readonly { readonly word: string; readonly start: number; readonly end: number }[]): WordNumber[] {
  const numbers: WordNumber[] = [];
  let total = 0;
  let current = 0;
  let last: WordClass | null = null;
  let smallestScale = Number.POSITIVE_INFINITY;
  let group: { word: string; start: number; end: number }[] = [];
  const flush = () => {
    if (group.length > 0) {
      numbers.push({ value: total + current, words: group });
    }
    total = 0;
    current = 0;
    last = null;
    smallestScale = Number.POSITIVE_INFINITY;
    group = [];
  };
  for (const entry of words) {
    const word = entry.word.toLowerCase();
    if (word === 'and') {
      if (last !== 'hundred' && last !== 'scale') {
        flush();
      }
      continue;
    }
    const kind = classOf(word);
    if (kind === null) {
      flush();
      continue;
    }
    const joins = (() => {
      switch (kind) {
        case 'unit':
          return last === null || last === 'tens' || last === 'hundred' || last === 'scale';
        case 'teen':
        case 'tens':
          return last === null || last === 'hundred' || last === 'scale';
        case 'hundred':
          return (last === 'unit' || last === 'teen' || last === 'tens') && current > 0 && current < 100;
        case 'scale':
          return last !== null && last !== 'scale' && current > 0 && (SCALES[word] ?? 0) < smallestScale;
      }
    })();
    if (!joins) {
      flush();
    }
    if (kind === 'unit') {
      current += UNITS[word] ?? 0;
    } else if (kind === 'teen') {
      current += TEENS[word] ?? 0;
    } else if (kind === 'tens') {
      current += TENS[word] ?? 0;
    } else if (kind === 'hundred') {
      current = (current === 0 ? 1 : current) * 100;
    } else {
      const scale = SCALES[word] ?? 0;
      total += (current === 0 ? 1 : current) * scale;
      current = 0;
      smallestScale = scale;
    }
    last = kind;
    group.push(entry);
  }
  flush();
  return numbers;
}

class Masked {
  private chars: string[];

  constructor(original: string) {
    this.chars = original.split('');
  }

  get text(): string {
    return this.chars.join('');
  }

  /** Blanks [start, end) so later patterns cannot read it again. */
  take(start: number, end: number): void {
    for (let index = start; index < end; index += 1) {
      this.chars[index] = ' ';
    }
  }
}

const TRIM_LEADING = /^[\s([{"'“‘<]+/;
const TRIM_TRAILING = /[\s)\]}"'”’>,.;:!?]+$/;

/** Reads every placeholder, citation marker and figure of `text`, in order of position. */
export function scanText(text: string): Scan {
  const masked = new Masked(text);
  const figures: Figure[] = [];
  const placeholders: PlaceholderToken[] = [];
  const markers: MarkerToken[] = [];
  const each = (pattern: RegExp, found: (match: RegExpExecArray) => void) => {
    const source = masked.text;
    for (const match of source.matchAll(pattern)) {
      found(match);
    }
  };
  const figure = (kind: FigureKind, value: string, start: number, end: number) => {
    figures.push({ kind, value, start, end });
    masked.take(start, end);
  };

  each(new RegExp(PLACEHOLDER_PATTERN.source, 'g'), (match) => {
    placeholders.push({ kind: match[1] ?? '', row: int(match[2] ?? '0'), start: match.index, end: match.index + match[0].length });
    masked.take(match.index, match.index + match[0].length);
  });
  each(new RegExp(MARKER_PATTERN.source, 'g'), (match) => {
    markers.push({ sources: (match[1] ?? '').split(',').map((part) => int(part.trim())), start: match.index, end: match.index + match[0].length });
    masked.take(match.index, match.index + match[0].length);
  });

  // Dates written with a month's name.
  each(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'), (match) => {
    const date = isoDate(int(match[3] ?? ''), MONTHS[(match[1] ?? '').toLowerCase()] ?? 0, int(match[2] ?? ''));
    figure(date === null ? 'identifier' : 'date', date ?? match[0], match.index, match.index + match[0].length);
  });
  each(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?,?\\s+(\\d{4})\\b`, 'gi'), (match) => {
    const date = isoDate(int(match[3] ?? ''), MONTHS[(match[2] ?? '').toLowerCase()] ?? 0, int(match[1] ?? ''));
    figure(date === null ? 'identifier' : 'date', date ?? match[0], match.index, match.index + match[0].length);
  });
  each(new RegExp(`\\b${MONTH}\\.?,?\\s+(\\d{4})\\b`, 'gi'), (match) => {
    figure('month', `${match[2] ?? ''}-${pad(MONTHS[(match[1] ?? '').toLowerCase()] ?? 0)}`, match.index, match.index + match[0].length);
  });
  each(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'), (match) => {
    const month = MONTHS[(match[1] ?? '').toLowerCase()] ?? 0;
    const day = int(match[2] ?? '');
    const valid = isoDate(2000, month, day) !== null;
    figure(valid ? 'month_day' : 'identifier', valid ? `${pad(month)}-${pad(day)}` : match[0], match.index, match.index + match[0].length);
  });
  // Dates written in digits.
  each(/(?<![\w./-])(\d{4})-(\d{2})-(\d{2})(?![\w/]|-\d)/g, (match) => {
    const date = isoDate(int(match[1] ?? ''), int(match[2] ?? ''), int(match[3] ?? ''));
    figure(date === null ? 'identifier' : 'date', date ?? match[0], match.index, match.index + match[0].length);
  });
  each(/(?<![\w./-])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\w/]|-\d)/g, (match) => {
    const date = isoDate(int(match[3] ?? ''), int(match[1] ?? ''), int(match[2] ?? ''));
    figure(date === null ? 'identifier' : 'date', date ?? match[0], match.index, match.index + match[0].length);
  });
  // Percentages.
  each(/(?<![\w.,$])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(?:%|percent\b|per\s+cent\b)/gi, (match) => {
    figure('percent', canonicalNumber(`${match[1] ?? ''}${match[2] ?? ''}`), match.index, match.index + match[0].length);
  });
  // Amounts: with a dollar sign, or a bare number with exactly two decimals.
  each(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d|\.\d)/g, (match) => {
    const amount = parseAmount(`${(match[1] ?? '').replaceAll(',', '')}${match[2] === undefined ? '' : `.${match[2]}`}`);
    figure('amount', amount.toString(), match.index, match.index + match[0].length);
  });
  each(/(?<![\w.,$-])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d|\.\d)/g, (match) => {
    figure('amount', parseAmount(`${(match[1] ?? '').replaceAll(',', '')}.${match[2] ?? ''}`).toString(), match.index, match.index + match[0].length);
  });
  // Procedure codes, with any modifiers attached.
  each(/(?<![\w-])(\d{5}|\d{4}[A-Z]|[A-Z]\d{4})((?:-[0-9A-Z]{2})+)?(?![\w-])/g, (match) => {
    const start = match.index;
    const code = match[1] ?? '';
    figures.push({ kind: 'code', value: code, start, end: start + code.length });
    let offset = start + code.length;
    for (const modifier of (match[2] ?? '').split('-').filter((part) => part !== '')) {
      figures.push({ kind: 'modifier', value: modifier, start: offset + 1, end: offset + 3 });
      offset += 3;
    }
    masked.take(start, start + match[0].length);
  });
  // Modifiers named as such.
  each(/\b[Mm]odifiers?\s+([0-9A-Z]{2}(?:(?:\s*,\s*and\s+|\s*,\s*|\s*\/\s*|\s+and\s+|\s+or\s+)[0-9A-Z]{2})*)(?![\w])/g, (match) => {
    const list = match[1] ?? '';
    const listStart = match.index + match[0].length - list.length;
    for (const item of list.matchAll(/(?<![0-9A-Za-z])[0-9A-Z]{2}(?![0-9A-Za-z])/g)) {
      figure('modifier', item[0], listStart + item.index, listStart + item.index + 2);
    }
  });
  each(/(?<![\w-])([0-9A-Z]{2})\s+modifiers?\b/g, (match) => {
    figure('modifier', match[1] ?? '', match.index, match.index + 2);
  });
  // Digit groups joined by hyphens: one identifier (a statute section, a reference).
  each(/(?<![\w.,-])\d+(?:-\d+)+(?![\w-])/g, (match) => {
    figure('identifier', match[0], match.index, match.index + match[0].length);
  });
  // Units written as x2.
  each(/(?<![\w])[x×](\d+)(?![\w]|\.\d)/g, (match) => {
    figure('number', canonicalNumber(match[1] ?? ''), match.index, match.index + match[0].length);
  });
  // Other numbers, and ordinals written in digits.
  each(/(?<![\w.,-])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:st|nd|rd|th)?(?![\w]|\.\d)/g, (match) => {
    figure('number', canonicalNumber(`${match[1] ?? ''}${match[2] ?? ''}`), match.index, match.index + match[0].length);
  });
  // Anything else that holds a digit.
  each(/[^\s]*\d[^\s]*/g, (match) => {
    const leading = TRIM_LEADING.exec(match[0])?.[0].length ?? 0;
    const value = match[0].slice(leading).replace(TRIM_TRAILING, '');
    if (/\d/.test(value)) {
      figure('identifier', value, match.index + leading, match.index + leading + value.length);
    }
  });
  // Numbers in words.
  each(NUMBER_WORDS, (match) => {
    const percent = match[1] !== undefined;
    const body = percent ? match[0].slice(0, match[0].length - (match[1] ?? '').length) : match[0];
    const words = [...body.matchAll(/[A-Za-z]+/g)].map((word) => ({ word: word[0], start: match.index + word.index, end: match.index + word.index + word[0].length }));
    const numbers = numbersInWords(words);
    numbers.forEach((written, index) => {
      const only = written.words.length === 1 ? (written.words[0]?.word.toLowerCase() ?? '') : '';
      const isLast = index === numbers.length - 1;
      if (only === 'one' || only === 'zero') {
        return;
      }
      const start = written.words[0]?.start ?? match.index;
      const end = isLast && percent ? match.index + match[0].length : (written.words.at(-1)?.end ?? start);
      figure(isLast && percent ? 'percent' : 'number', String(written.value), start, end);
    });
  });

  const byPosition = (a: { start: number }, b: { start: number }) => a.start - b.start;
  return { figures: figures.sort(byPosition), placeholders: placeholders.sort(byPosition), markers: markers.sort(byPosition) };
}

/** Words before a period that do not end a sentence. */
const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'no',
  'nos',
  'inc',
  'co',
  'corp',
  'ltd',
  'llc',
  'dr',
  'mr',
  'mrs',
  'ms',
  'st',
  'sec',
  'ch',
  'art',
  'para',
  'pp',
  'cf',
  'u.s',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
]);

/** A sentence's end: its punctuation, any closing quote or bracket, and any citation markers after it. */
const SENTENCE_END = /[.!?]+["')\]”’]*(?:\s*\[\d{1,3}(?:\s*,\s*\d{1,3})*\])*(?=\s|$)/g;

/**
 * Whether a period ends an abbreviation inside a sentence: a listed word or a dotted abbreviation (G.S.,
 * e.g.) followed by a lowercase word or a digit. Followed by a capital, it ends the sentence: the
 * stricter reading, since a sentence wrongly split can only lose a citation, never gain one.
 */
function continuesAfter(text: string, punctuation: number, end: number): boolean {
  if (text[punctuation] !== '.' || !/^\s*[a-z0-9]/.test(text.slice(end))) {
    return false;
  }
  const before = /([A-Za-z.]+)$/.exec(text.slice(0, punctuation))?.[1] ?? '';
  return /^(?:[A-Za-z]\.)+[A-Za-z]$/.test(before) || ABBREVIATIONS.has(before.toLowerCase());
}

/**
 * The narrative's sentences: text up to a terminal mark (with the markers that follow it), and every
 * paragraph's end. A piece holding only markers belongs to the sentence before it; a piece with no
 * letter or digit is not a sentence.
 */
export function sentenceSpans(text: string): Span[] {
  const pieces: Span[] = [];
  let start = 0;
  const cut = (end: number) => {
    if (end > start) {
      pieces.push({ start, end });
    }
    start = end;
  };
  const paragraphs = [...text.matchAll(/\n[ \t]*\n/g)].map((match) => match.index);
  for (const match of text.matchAll(SENTENCE_END)) {
    for (const paragraph of paragraphs.filter((index) => index >= start && index < match.index)) {
      cut(paragraph);
    }
    if (!continuesAfter(text, match.index, match.index + match[0].length)) {
      cut(match.index + match[0].length);
    }
  }
  for (const paragraph of paragraphs.filter((index) => index >= start)) {
    cut(paragraph);
  }
  cut(text.length);
  const sentences: Span[] = [];
  for (const piece of pieces) {
    const body = text.slice(piece.start, piece.end);
    const trimmedStart = piece.start + (body.length - body.trimStart().length);
    const trimmedEnd = piece.end - (body.length - body.trimEnd().length);
    const onlyMarkers = body.replace(new RegExp(MARKER_PATTERN.source, 'g'), '').trim() === '' && /\[/.test(body);
    const previous = sentences.at(-1);
    if (onlyMarkers && previous !== undefined) {
      sentences[sentences.length - 1] = { start: previous.start, end: trimmedEnd };
    } else if (/[A-Za-z0-9]/.test(body.replace(new RegExp(MARKER_PATTERN.source, 'g'), ''))) {
      sentences.push({ start: trimmedStart, end: trimmedEnd });
    }
  }
  return sentences;
}
