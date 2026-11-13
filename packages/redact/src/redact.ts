/**
 * PHI minimization for a payer letter (PRD 14, PHI minimization: "the gateway sends the minimum text
 * needed, strips names, dates of birth, member IDs and claim numbers by exact match before the call
 * where the task allows it, and never sends more than one patient's material in one call").
 *
 * The patient's names (each whole name, each of its words and each part of a word), dates of birth,
 * member IDs and the claims' numbers are replaced, wherever they appear as whole words, by placeholders:
 * [PATIENT_NAME], [DATE_OF_BIRTH], [MEMBER_ID], and [CLAIM_1], [CLAIM_2] ... for the claims in the order
 * given. The claim placeholders keep the task possible: the model cites a claim by its placeholder, and
 * code maps it back to the claim.
 *
 * "Exact match" is read as the same value however a letter writes it (docs/adr/0054, amendment of
 * 2026-10-27):
 * - every match is found on one folded view of the letter: case folded in full (ß is SS), marks
 *   dropped (José is JOSE), and a run of invisible characters (soft hyphen, zero-width space) one
 *   character that joins inside a word and still ends one;
 * - a member ID or claim number matches with or without the white space, dashes, invisible characters and
 *   other number joiners (NUMBER_JOINERS: "_", "|", "\\", grouping apostrophes and primes, "~", middle dots, bullets, ";")
 *   a letter puts inside it, and the periods, slashes and colons next to a letter
 *   ("ZZ 1234567", "ZZ-1234567", "ZZ_1234567", "ZZ/1234567", "12'345'678");
 * - a name matches with or without the dashes and apostrophes inside it (O’Brien, Smith–Jones), across a
 *   dash at a line break whatever its case ("Van-⏎tree", "Jo-⏎ann"), and with a space only where each
 *   side is a capitalized piece of two letters or more ("Jo Ann", never "in a");
 * - an initial of the patient's name next to a name ("J. Q. Vantree", "Vantree, J.") is a name;
 * - a date of birth matches in every form a letter writes a date: month first or day first, with
 *   slashes, dots, any dash or spaces alone, a two- or four-digit year with or without an apostrophe,
 *   compact (19610303, 03031961, 030361), and the month in words with or without a leading zero, an
 *   ordinal, a comma or slashes (March 03, 1961; 3rd March 1961; 03-MAR-61; Mar 3 ’61; 3/Mar/1961).
 *   Any date a birth label introduces (DOB, date of birth, born) is replaced too, whatever its value, so
 *   a date of birth the records do not hold is not sent either.
 *
 * Every match is found on the letter before anything is replaced, and overlapping matches become one
 * placeholder, so no placeholder is ever rewritten. What the task reads stays: in a date that is not a
 * date of birth, written with a separator (DATE_SEPARATOR) or a month word and with a calendar reading, a
 * month word is not a name, and digits whose own written form is that date are not a number unless an identifier
 * label of their kind ("Claim", "ICN:", "Member ID", "Claim #", "No.") introduces them (IDENTIFIER_LABEL); a claim's digits
 * written as an amount, after a currency sign and with cents, are not its number. The letter's own
 * square brackets become parentheses, so the only bracketed text sent is a placeholder.
 *
 * Social Security numbers and phone numbers are redacted by pattern too, wherever the letter writes them and whoever's
 * they are (the founder's ruling of 2026-11-01, PRD 14; docs/adr/0054, amendment of 2026-11-04): [SSN] and [PHONE], ranked
 * below the call's own identifiers, so a pattern span that is the call's own member ID or claim number keeps the call's
 * placeholder. Amounts, dates, NPIs, TINs, ZIPs, codes and the numbers a word names (a claim's, a reference's) stay. The
 * self-check after redaction also runs a survivor scan written apart from the patterns, so a chain of nine to eleven
 * digits no pattern read refuses the letter; and the one-patient screen is asked about every such number that is not the
 * call's own (redactLetterForScreen). Nothing else of the letter changes.
 */

import { LOOK_ALIKES } from './confusables';

export interface PatientIdentifiers {
  /** The patient's pseudonym (patient_ref.pseudonym): the one patient the call is about. */
  readonly pseudonym: string;
  /** Names as the records hold them ("SMITH, JANE Q", "JANE SMITH"). */
  readonly names: readonly string[];
  /** Dates of birth as ISO dates (none when the records hold none: a labeled one is still replaced). */
  readonly datesOfBirth: readonly string[];
  readonly memberIds: readonly string[];
}

export interface LetterClaim {
  readonly claimId: string;
  /** The patient the claim is for: every claim of a call is the one patient's. */
  readonly patientPseudonym: string;
  /** The claim's numbers (patient and payer claim control numbers) as the records hold them. */
  readonly claimNumbers: readonly string[];
}

export interface Redacted {
  readonly text: string;
  /** Each claim placeholder and the claim it stands for. */
  readonly claims: ReadonlyMap<string, string>;
  /** How many placeholders were written (a count, for tests and logs). */
  readonly replaced: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Common ways a letter writes a date (the forms the tests write; redaction reads every form, below). */
export function dateForms(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    return [];
  }
  const [, year = '', month = '', day = ''] = match;
  const m = String(Number.parseInt(month, 10));
  const d = String(Number.parseInt(day, 10));
  const name = MONTHS[Number.parseInt(month, 10) - 1] ?? '';
  return [iso, `${month}/${day}/${year}`, `${m}/${d}/${year}`, `${month}-${day}-${year}`, `${name} ${d}, ${year}`, `${name.slice(0, 3)} ${d}, ${year}`, `${name.slice(0, 3)}. ${d}, ${year}`, `${d} ${name} ${year}`];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';

/** The letters and digits of an identifier, upper case: what two writings of it share. */
export function compactIdentifier(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// ---------------------------------------------------------------------------------------------------
// Dates

const MONTH_WORD = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const MONTH_INDEX: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ORDINAL = '(?:st|nd|rd|th)?';

/** A month's number from its name or abbreviation. */
const monthOf = (word: string) => MONTH_INDEX[word.toLowerCase().slice(0, 3)] ?? 0;

/**
 * The years a written date may be in: 1900 to 2099, what a date of birth, a date of service or a remittance date can
 * be, and what a two-digit year reads as (either century). Four digits outside it are no year, so a number written like
 * a date ("0023-04-26", a claim number 00230426 with its dashes) reads as no date and is never kept as one (MOD-13,
 * docs/adr/0054 and 0070 Part 3).
 */
export const EARLIEST_WRITTEN_YEAR = 1900;
export const LATEST_WRITTEN_YEAR = 2099;

const plausibleYear = (year: number) => year >= EARLIEST_WRITTEN_YEAR && year <= LATEST_WRITTEN_YEAR;

/** The years a written year may be: a two-digit year is either century; a four-digit one only a plausible year. */
function years(written: string): number[] {
  const value = Number.parseInt(written, 10);
  return written.length === 2 ? [1900 + value, 2000 + value] : written.length === 4 && plausibleYear(value) ? [value] : [];
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Every calendar date the parts can be read as. */
function readings(parts: readonly { readonly year: string; readonly month: number; readonly day: number }[]): string[] {
  work(WORK.dateReadings);
  return parts.flatMap((part) => years(part.year).map((year) => iso(year, part.month, part.day))).filter((date): date is string => date !== null);
}

const num = (text: string | undefined) => Number.parseInt(text ?? '', 10);

/** What separates the numbers of a date: a slash, a backslash, a period, any dash, the minus sign, the hyphen bullet, "_" or "|". */
const DATE_SEPARATOR = '/\\\\.\\p{Pd}\\u2212\\u2043_|';
const SEPARATOR = `\\s*[${DATE_SEPARATOR}]\\s*`;
/** White space inside a line: what a date written with spaces alone has between its numbers. */
const SPACES = '[^\\S\\r\\n\\u0085\\u2028\\u2029]+';
/** An apostrophe, straight or typographic, before a two-digit year ('61, ’61). */
const APOSTROPHE = "'‘’ʼ`´";
const YEAR_APOSTROPHE = `[${APOSTROPHE}]?`;

const yearFirst = (m: RegExpExecArray) => readings([{ year: m[1] ?? '', month: num(m[2]), day: num(m[3]) }]);
const yearLast = (m: RegExpExecArray) => readings([{ year: m[3] ?? '', month: num(m[1]), day: num(m[2]) }, { year: m[3] ?? '', month: num(m[2]), day: num(m[1]) }]);

/**
 * The date patterns a letter writes, each with every reading of its parts (month first and day first
 * alike), and whether a date so written is separated: written with a separator (DATE_SEPARATOR) or a
 * month word. Only a separated date that is not a date of birth stays as written; numbers written with spaces
 * alone, or compact, are read as a date of birth but never kept as another date, since a member ID or
 * claim number is written that way too.
 */
const DATE_PATTERNS: readonly { readonly pattern: RegExp; readonly read: (match: RegExpExecArray) => string[]; readonly separated: boolean }[] = [
  // 1961-03-03, 1961/3/3, 1961.03.03, 1961–03–03
  { pattern: new RegExp(`${BEFORE}(\\d{4})${SEPARATOR}(\\d{1,2})${SEPARATOR}(\\d{1,2})${AFTER}`, 'gu'), read: yearFirst, separated: true },
  // 03/03/1961, 3-3-61, 3.3.1961, 03−03−’61, either order of month and day
  { pattern: new RegExp(`${BEFORE}(\\d{1,2})${SEPARATOR}(\\d{1,2})${SEPARATOR}${YEAR_APOSTROPHE}(\\d{4}|\\d{2})${AFTER}`, 'gu'), read: yearLast, separated: true },
  // 1961 03 03, 03 03 1961, 3 3 61: spaces alone
  { pattern: new RegExp(`${BEFORE}(\\d{4})${SPACES}(\\d{1,2})${SPACES}(\\d{1,2})${AFTER}`, 'gu'), read: yearFirst, separated: false },
  { pattern: new RegExp(`${BEFORE}(\\d{1,2})${SPACES}(\\d{1,2})${SPACES}${YEAR_APOSTROPHE}(\\d{4}|\\d{2})${AFTER}`, 'gu'), read: yearLast, separated: false },
  // 19610303, 03031961, 03/03 written compact with a two-digit year (030361)
  {
    pattern: new RegExp(`${BEFORE}(\\d{8}|\\d{6})${AFTER}`, 'gu'),
    read: (m) => {
      const d = m[1] ?? '';
      if (d.length === 8) {
        return readings([
          { year: d.slice(0, 4), month: num(d.slice(4, 6)), day: num(d.slice(6, 8)) },
          { year: d.slice(4, 8), month: num(d.slice(0, 2)), day: num(d.slice(2, 4)) },
          { year: d.slice(4, 8), month: num(d.slice(2, 4)), day: num(d.slice(0, 2)) },
        ]);
      }
      return readings([
        { year: d.slice(4, 6), month: num(d.slice(0, 2)), day: num(d.slice(2, 4)) },
        { year: d.slice(4, 6), month: num(d.slice(2, 4)), day: num(d.slice(0, 2)) },
      ]);
    },
    separated: false,
  },
  // March 3, 1961; Mar. 03 1961; March 3rd, '61; Mar 3 ’61; Mar/03/1961
  {
    pattern: new RegExp(`${BEFORE}${MONTH_WORD}\\.?[\\s${DATE_SEPARATOR}]*(\\d{1,2})${ORDINAL},?[\\s${DATE_SEPARATOR}]*${YEAR_APOSTROPHE}(\\d{4}|\\d{2})${AFTER}`, 'giu'),
    read: (m) => readings([{ year: m[3] ?? '', month: monthOf(m[1] ?? ''), day: num(m[2]) }]),
    separated: true,
  },
  // 3 March 1961; 3rd of March, 1961; 03-MAR-1961; 3-Mar-61; 3/Mar/1961; 03/Mar/61
  {
    pattern: new RegExp(`${BEFORE}(\\d{1,2})${ORDINAL}(?:\\s+of)?[\\s${DATE_SEPARATOR}]*${MONTH_WORD}\\.?,?[\\s${DATE_SEPARATOR}]*${YEAR_APOSTROPHE}(\\d{4}|\\d{2})${AFTER}`, 'giu'),
    read: (m) => readings([{ year: m[3] ?? '', month: monthOf(m[2] ?? ''), day: num(m[1]) }]),
    separated: true,
  },
];

/** A label that introduces a date of birth, ending where its date begins. */
const BIRTH_LABEL = /(?:\bD\.?\s?O\.?\s?B\b\.?|\bdate\s+of\s+birth\b|\bbirth\s*date\b|\bborn(?:\s+on)?\b|\bbirthday\b)\s*[:#-]?\s*(?:is\s+)?$/iu;

interface DateSpan {
  readonly start: number;
  readonly end: number;
  /** Every calendar date it can be read as (none for numbers shaped like a date that no calendar holds, 12-34-56). */
  readonly dates: readonly string[];
  /** Written with a separator (DATE_SEPARATOR) or a month word: only such a date, with a reading, stays when it is not a date of birth. */
  readonly separated: boolean;
}

/**
 * Every date a letter writes, with each calendar date it can be read as. Where one form holds another,
 * the longer is kept, unless only the shorter has a reading, so numbers that read as no date never hide
 * one that does. Each pattern is tried at the start of every number and month word, past the start of its
 * own last match only, never past its end: a match that overlaps a date ("00.01/01" in "$0.00.01/01/2020",
 * an amount's cents, a full stop and the date's month and day) never takes that date from the pattern
 * (MOD-16 seed 1034253323, where a date of birth after it was missed as well). A pattern matches at most
 * once at a start, so the matches stay linear in the text.
 */
export function datesIn(text: string, everyStart = true): DateSpan[] {
  const all: DateSpan[] = [];
  for (const { pattern, read, separated } of DATE_PATTERNS) {
    const search = new RegExp(pattern.source, pattern.flags);
    for (let match = search.exec(text); match !== null; match = search.exec(text)) {
      all.push({ start: match.index, end: match.index + match[0].length, dates: read(match), separated });
      // Past the whole first code point: with the u flag, an index inside a surrogate pair finds the same match again.
      // Without `everyStart`, past the match's end, as cc3dd7f6 read dates (the survivor scan's barriers of that reading).
      if (everyStart) search.lastIndex = match.index + codePointAt(text, match.index).length;
    }
  }
  // keep a span unless a longer (or equal, earlier-found) span holds it and has a reading or it has none
  const order = all.map((span, i) => ({ span, i })).sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end || a.i - b.i);
  const kept: DateSpan[] = [];
  let maxEndRead = -1;
  let maxEndAny = -1;
  for (const { span } of order) {
    const hidden = span.end <= maxEndRead || (span.dates.length === 0 && span.end <= maxEndAny);
    if (!hidden) kept.push(span);
    maxEndAny = Math.max(maxEndAny, span.end);
    if (span.dates.length > 0) maxEndRead = Math.max(maxEndRead, span.end);
  }
  return kept;
}

// ---------------------------------------------------------------------------------------------------
// The folded view

/**
 * Letters, and one format character, that a letter shows as a blank (the Hangul fillers, the Mongolian vowel separator),
 * the one space separator NFKC leaves as it is (U+1680 OGHAM SPACE MARK) and the braille blank (U+2800): white space here
 * (review findings SEC-3 and SEC-6).
 */
const BLANK = /^[\u115F\u1160\u3164\uFFA0\u180E\u1680\u2800]$/u;
const IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;
const MARKS = /\p{M}/gu;
const WORD_CHARACTER = /^[\p{L}\p{N}]$/u;

/**
 * What a run of invisible characters (default-ignorable code points, or marks with nothing to sit on)
 * becomes in the view names and numbers are matched on: not a letter or digit, so it ends a word
 * ("Dear<ZWSP>Jane"), and in every joiner class, so it still joins inside one ("Van<SHY>tree").
 */
const VANISHED = '\u00AD';

/**
 * What an exact placeholder becomes before a check reads text: a control character that is not a
 * letter, digit, joiner, mark or default-ignorable code point, and that the fold leaves as it is, so no
 * match reaches into or across a placeholder.
 */
export const BARRIER = '\u0001';

/**
 * The letter check's work budget (docs/adr/0054, amendment of 2026-11-12): the most work redactLetterForScreen and
 * holdsIdentifier together may do on one letter. The reader's own readings are linear in a letter's length, but a few
 * of its comparisons are not (matchesIn asks, once per match, whether a list of matches already holds it: a crafted
 * letter of 100,000 characters made 1.25 to 2.5 thousand million such comparisons and took 3 to 8 s of the reader's 3 s),
 * and its dearest linear letters (one digit to a line) took 1.9 to 2.6 s. So the check counts its own work where the
 * work is done (`work`, at the sites WORK names) in one counter for the whole letter (checkWorkSpent), and past the
 * budget the reading stops and the letter is REFUSED: redactLetterForScreen returns no text of the letter at all, only
 * the mark the check refuses (unreadPastTheBudget), and holdsIdentifier answers that an identifier is left. Never a
 * partial reading: a letter is sent only when both ran to their ends within the budget.
 *
 * A count, not a clock: a letter has the same answer on every machine and in every run. The count changes no decision
 * of the reading; the only answer it changes is from sent to refused. Callers with no refusal to give (redactLetter,
 * redactionSpans, the narrative's and the verifier's readings) run no counter and read as before.
 *
 * A comparison of two matches costs four units (WORK.comparison): 2 to 5 ns each on the reference machine, by the
 * letter, and about 13 ns under coverage instrumentation, so a letter is refused after 105 million of them at most. The
 * dearest letter found that is still read takes about 2.3 s there (the ADR records the measurements), inside the
 * reader's 3 s.
 */
export const CHECK_WORK_BUDGET = 420_000_000;

/**
 * What each counted site costs, in the budget's units, fitted to the processor time of the crafted letters of
 * denial-letter.test.ts on Node 24 (docs/adr/0054). A site is a reading the measurement showed as a driver of some
 * letter's time; `character` is what each of the two entries charges for a character of its text, for the passes no
 * site counts.
 */
const WORK = {
  comparison: 4,
  formCharacter: 2,
  identifierCharacter: 3_500,
  mayBe: 30,
  viewCharacter: 30,
  fold: 150,
  digitAcross: 250,
  character: 350,
  letterJoin: 500,
  labelWindow: 550,
  search: 650,
  dateReadings: 850,
  scanLabel: 1_800,
} as const;

/** The work spent on the letter being read, in the budget's units; null where no letter check is running. */
let checkWorkSpent: number | null = null;

/** Thrown by `work` past the budget and caught only by the two entries, which refuse the letter. No letter's text is in it. */
class PastCheckWorkBudget extends Error {
  constructor() {
    super('the letter check is past its work budget');
  }
}

/** Counts `units` of work on the letter being read; past the budget the reading stops there (the entries refuse the letter). */
function work(units: number): void {
  if (checkWorkSpent === null) {
    return;
  }
  checkWorkSpent += units;
  // Written so that a count that is no number (a charge from a list with no length) is past the budget too.
  if (!(checkWorkSpent <= CHECK_WORK_BUDGET)) {
    throw new PastCheckWorkBudget();
  }
}

/**
 * What each of the two entries charges for the call's own identifiers before it reads anything: a pattern is built for
 * each of them at every reading that asks for the forms, whatever the letter's length, so they cost work by their own
 * length, and a call with more of them than the budget holds is refused before one pattern is built (the review of
 * fix round 1, F-1).
 */
function workOfIdentifiers(patient: PatientIdentifiers, claims: readonly LetterClaim[]): number {
  const lengthOf = (sum: number, identifier: string) => sum + identifier.length;
  return WORK.identifierCharacter * (patient.names.reduce(lengthOf, 0) + patient.memberIds.reduce(lengthOf, 0) + claims.reduce((sum, claim) => claim.claimNumbers.reduce(lengthOf, sum), 0));
}

/** list.some(test), with every comparison it makes counted: the answer is `some`'s own. */
function someOf<T>(list: readonly T[], test: (item: T) => boolean): boolean {
  for (let index = 0; index < list.length; index += 1) {
    if (test(list[index] as T)) {
      work(WORK.comparison * (index + 1));
      return true;
    }
  }
  work(WORK.comparison * list.length);
  return false;
}

/**
 * What redactLetterForScreen returns for a letter past the budget: one of the checks' own marks and not one character
 * of the letter, so there is no partly redacted text for any caller to send, and holdsIdentifier refuses it at its
 * first line, as it refuses every text that holds a mark.
 */
const unreadPastTheBudget = BARRIER;

/** The work each redacted letter cost, for the check that follows it (checkWorkOf): the count alone, no text. */
const workOfRedacted = new WeakMap<object, number>();

/**
 * The work redactLetterForScreen spent on the letter it returned, in the budget's units: what the caller hands to
 * holdsIdentifier with that letter's text, so that one budget holds for the whole check. Past the budget for a letter
 * the redaction did not finish.
 */
export function checkWorkOf(redacted: Redacted): number {
  return workOfRedacted.get(redacted) ?? 0;
}

const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_([1-9]\d*))\]/g;

const foldedCodePoints = new Map<string, string>();

/** A code point with its marks dropped and each look-alike letter or digit as the ASCII one it reads as (LOOK_ALIKES), its case kept. */
const asWritten = (codePoint: string): string => {
  const bare = codePoint.normalize('NFD').replace(MARKS, '');
  let read = '';
  for (const each of bare) read += LOOK_ALIKES.get(each) ?? each;
  return read;
};

/**
 * One code point folded: decomposed, its marks dropped, a look-alike of another script read as the ASCII letter or digit
 * it stands for (Cyrillic "А", Greek "Α" and the small capital "ᴀ" are A), its case folded in full (ß and ẞ are SS).
 */
export function fold(codePoint: string): string {
  work(WORK.fold);
  let folded = foldedCodePoints.get(codePoint);
  if (folded === undefined) {
    if (DECIMAL_DIGIT.test(codePoint)) {
      folded = digitValue(codePoint);
    } else {
      // Case first, then the look-alike of the capital (or, where the capital has none, of its small letter): both cases of
      // a letter fold to one thing, as before, whatever each of them looks like ("υ" and "Υ" are both Y).
      const capital = codePoint.normalize('NFD').replace(MARKS, '').toLowerCase().toUpperCase().normalize('NFD').replace(MARKS, '');
      folded = '';
      for (const each of capital) folded += each.charCodeAt(0) < 0x80 ? each : (LOOK_ALIKES.get(each) ?? LOOK_ALIKES.get(each.toLowerCase()) ?? each).toUpperCase();
    }
    foldedCodePoints.set(codePoint, folded);
  }
  return folded;
}

const plainlyFolded = new Map<string, string>();

/**
 * One code point folded as cc3dd7f6 and ef3e8d20 folded every view: decomposed, its marks dropped, its case folded in full,
 * no look-alike read. The Social Security and phone patterns and the survivor scan read this fold: a look-alike is theirs
 * to read as the letter it is ("\u0417\u043E\u044F" holds no digit and ends no label's window, "\u0406\u0421N" is no ICN and keeps no number: the
 * review of the build, B1-3 and B1-14). The look-alike fold is for the call's own identifiers (ruling A').
 */
function foldPlain(codePoint: string): string {
  let folded = plainlyFolded.get(codePoint);
  if (folded === undefined) {
    folded = codePoint.normalize('NFD').replace(MARKS, '').toLowerCase().toUpperCase().normalize('NFD').replace(MARKS, '');
    plainlyFolded.set(codePoint, folded);
  }
  return folded;
}

const codePointAt = (text: string, index: number) => String.fromCodePoint(text.codePointAt(index) ?? 0);

/** The code point that ends just before an index ('' at the start). */
function codePointBefore(text: string, index: number): string {
  if (index <= 0) {
    return '';
  }
  const unit = text.charCodeAt(index - 1);
  return codePointAt(text, index - (unit >= 0xdc00 && unit <= 0xdfff && index >= 2 ? 2 : 1));
}

/** A folded view of NFKC text, and for each of its UTF-16 units the NFKC code point it came from. */
interface View {
  readonly text: string;
  readonly from: readonly number[];
  readonly to: readonly number[];
  /** Whether a code point became nothing (an invisible run, a mark on nothing): when none did, every reading of invisible runs is this one. */
  readonly emptied: boolean;
}

const digitValues = new Map<string, string>();

/**
 * A decimal digit's value as an ASCII digit, whatever its script ("٣", "३" and "3" are 3): its distance from the zero its
 * run of decimal digits starts at (every such run starts at a zero), modulo ten.
 */
function digitValue(codePoint: string): string {
  let value = digitValues.get(codePoint);
  if (value === undefined) {
    const at = codePoint.codePointAt(0) ?? 0;
    let zero = at;
    while (zero > 0 && /^\p{Nd}$/u.test(String.fromCodePoint(zero - 1))) {
      zero -= 1;
    }
    value = String((at - zero) % 10);
    digitValues.set(codePoint, value);
  }
  return value;
}

const DECIMAL_DIGIT = /^\p{Nd}$/u;

/**
 * The view of NFKC text: each code point folded, a blank a space, and an invisible character joined into
 * one VANISHED character per run (`join`, the view names and numbers are matched on), dropped (`drop`) or
 * read as a space (`space`). Dates are read on both of the last two, so neither a zero-width space inside
 * a date nor one between a date and a digit hides it. With `digits`, each decimal digit is its ASCII value
 * (digitValue), one unit for one code point: the view the Social Security and phone patterns and the survivor
 * scan read (docs/adr/0054, amendment of 2026-11-04, R3). With `alike`, another script's look-alike is the ASCII letter or
 * digit it reads as (fold): the views the call's own identifiers are matched on, never the patterns' or the scan's.
 */
function viewOf(normal: string, invisible: 'join' | 'drop' | 'space', digits = false, alike = !digits && ownFold === 'alike'): View {
  if (viewsOfCheck === null) {
    return buildView(normal, invisible, digits, alike);
  }
  const key = `${invisible}${digits ? '#' : ''}${alike ? '~' : ''}`;
  // By kind, then by the text itself: one look-up, whatever the number of views stored (G-1: a list searched from the
  // front, asked once per identifier by numberForm, made N identifiers cost N squared over two comparisons).
  let ofKind = viewsOfCheck.get(key);
  if (ofKind === undefined) {
    ofKind = new Map();
    viewsOfCheck.set(key, ofKind);
  }
  const known = ofKind.get(normal);
  if (known !== undefined && takenAgain(known, true)) {
    return known.view;
  }
  const before = checkWorkSpent;
  const view = buildView(normal, invisible, digits, alike);
  ofKind.set(normal, { view, cost: workSince(before), paid: storeScope });
  return view;
}

/**
 * Which fold the call's own identifiers are being read on. 'plain' is the fold of cc3dd7f6 and ef3e8d20, and what every
 * caller but the letter reader gets. The letter reader reads its own identifiers on both (matchesIn, ownIdentifierGlued):
 * what the plain fold finds is what ef3e8d20 found, and the look-alike fold only adds to it. One fold for both lost
 * refusals ef3e8d20 made, where a look-alike beside a name became a digit to the glued checks ("Zephyra\u3007", "Zephyra
 * \uA76E00-12-3456" in a held letter: the review of the fix round, C1-3 and C1-4).
 */
let ownFold: 'plain' | 'alike' = 'plain';

function onFold<T>(fold: 'plain' | 'alike', read: () => T): T {
  const before = ownFold;
  ownFold = fold;
  try {
    return read();
  } finally {
    ownFold = before;
  }
}

/** Whether NFKC text holds a letter or a digit the look-alike fold reads otherwise than the plain fold does. */
function holdsLookAlike(normal: string): boolean {
  for (const codePoint of normal) {
    if (codePoint.charCodeAt(0) >= 0x80 && fold(codePoint) !== foldPlain(codePoint)) return true;
  }
  return false;
}

const subjectsAlike = new WeakMap<Subject, boolean>();

/** Whether the look-alike reading can find what the plain one does not: a look-alike in the text, or in the call's own identifiers. */
function alikeReads(normal: string, subject: Subject): boolean {
  let own = subjectsAlike.get(subject);
  if (own === undefined) {
    own = [...subject.names, ...subject.memberIds, ...subject.claims.flat()].some((value) => holdsLookAlike(value.normalize('NFKC')));
    subjectsAlike.set(subject, own);
  }
  return own || holdsLookAlike(normal);
}

/**
 * The views built during one check (holdsIdentifier), each text's reading built once however many of the check's readers ask
 * for it (the judge's review round 2: the check built the same four views up to nine times). Null outside a check, and
 * emptied when the check returns, so no letter's text is held past it.
 */
let viewsOfCheck: Map<string, Map<string, { readonly view: View } & Stored>> | null = null;

/**
 * What a stored answer cost to build, in the budget's units (null where it was built with no counter running), and the
 * reading that last paid for it (MOD-23, on the check's work budget). The stores are open over a whole entry now
 * (inOneReading), so that the wider reading takes the views, dates and forms the first reading built and does not
 * build them again; the first reading's count must not fall for that. So a first reading pays for a stored answer as
 * the base's did: for a view or a text's dates, a check (holdsAsFirstRead) once, as with a store of its own, whoever
 * built the answer, and the redaction's first reading every time it asks, as with no store; for the forms every time,
 * in the check too, where the base built them on every call. Only the wider reading (widerMatchesIn) takes a stored
 * answer for nothing, the work it saves being work it does not do.
 */
interface Stored {
  readonly cost: number | null;
  paid: object | null;
}

/** The check that is running (one object per holdsAsFirstRead), null in the redaction: who pays for a stored answer once. */
let storeScope: object | null = null;

/** Whether the wider reading is running (widerMatchesIn). */
let widerReading = false;

/**
 * Whether the wider reading reads as the base of Queues item 34 read it (a97d73e4, MOD-23 alone; asTheBaseRead): none of
 * what MOD-25 widened. Inside a name's part a space, a joiner, a period or U+0085 and no other mark (A-4); where the
 * records write a separator, what joins a number anywhere and that separator, no run of marks (A-5); no piece of a
 * stored number (rule (c)); a name's words as the first reading splits them (rule (b)); each form read on from the end
 * of the match before (R1-1). Only the gate of the two entries sets it (refusedAsTheBaseRead), inside stores of its own.
 */
let baseReading = false;

/**
 * Whether a stored answer is taken again, counting what building it cost (Stored); with `oncePerCheck`, nothing where
 * the check that is running has paid for it. False for an answer built with no counter running when one runs now
 * (redactionSpans' first reading, then the check it asks): its cost is not known, so it is built again and counted.
 */
function takenAgain(stored: Stored, oncePerCheck: boolean): boolean {
  if (widerReading) {
    return true;
  }
  if (stored.cost === null) {
    return checkWorkSpent === null;
  }
  if (oncePerCheck && storeScope !== null && stored.paid === storeScope) {
    return true;
  }
  work(stored.cost);
  stored.paid = storeScope;
  return true;
}

/** The work counted since `before` (a reading of checkWorkSpent): null where no counter runs. */
const workSince = (before: number | null): number | null => (before === null || checkWorkSpent === null ? null : checkWorkSpent - before);

function buildView(normal: string, invisible: 'join' | 'drop' | 'space', digits: boolean, alike: boolean): View {
  work(WORK.viewCharacter * normal.length);
  // The units are collected and joined once, and whether the last one is a VANISHED of its own run is kept beside them:
  // reading the end of a string built by concatenation flattens it, which made a letter of invisible runs quadratic.
  const units: string[] = [];
  const from: number[] = [];
  const to: number[] = [];
  let offset = 0;
  let joining = false;
  let emptied = false;
  for (const codePoint of normal) {
    const start = offset;
    offset += codePoint.length;
    const code = codePoint.charCodeAt(0);
    // ASCII folds to itself in upper case (no ASCII character is a blank, invisible or a digit of another script).
    let unit = code < 0x80 ? (code >= 0x61 && code <= 0x7a ? String.fromCharCode(code - 0x20) : codePoint) : BLANK.test(codePoint) ? ' ' : IGNORABLE.test(codePoint) ? '' : digits && DECIMAL_DIGIT.test(codePoint) ? digitValue(codePoint) : alike ? fold(codePoint) : foldPlain(codePoint);
    if (unit === '') {
      emptied = true;
      if (invisible === 'drop') {
        continue;
      }
      if (invisible === 'join' && joining && to.at(-1) === start) {
        to[to.length - 1] = offset;
        continue;
      }
      unit = invisible === 'join' ? VANISHED : ' ';
      joining = invisible === 'join';
    } else {
      joining = unit.endsWith(VANISHED);
    }
    units.push(unit);
    for (let i = 0; i < unit.length; i += 1) {
      from.push(start);
      to.push(offset);
    }
  }
  return { text: units.join(''), from, to, emptied };
}

interface Range {
  readonly start: number;
  readonly end: number;
}

/** A range of a view as the NFKC range it came from. */
const inNormal = (view: View, start: number, end: number): Range => ({ start: view.from[start] ?? 0, end: view.to[end - 1] ?? 0 });

/** Whether a written code point starts a capitalized word: upper or title case, or a character with no case. */
const capital = (codePoint: string) => codePoint !== codePoint.toLowerCase() || codePoint === codePoint.toUpperCase();

/** The written (NFKC) code point a view position came from. */
const writtenAt = (view: View, normal: string, index: number) => codePointAt(normal, view.from[index] ?? 0);

// ---------------------------------------------------------------------------------------------------
// Forms and the matcher

/** Dashes (with the minus sign and hyphen bullet PDF text writes for a hyphen), apostrophes, the underscore and VANISHED: they join a name anywhere. */
const NAME_JOINERS = "\\p{Pd}\\u2212\\u2043'\\u2018\\u2019\\u02BC\\u02B9\\u02CA`\\u00B4_\\u00AD\\u00B7\\u2027\\u2219\\u22C5\\u2022";
/**
 * What joins a member ID or claim number anywhere ("." "/" ":" "#" and "(" only next to a letter): white space, dashes
 * (with the minus sign, the hyphen bullet, U+02D7 and U+2796), "_", "|", "\\", VANISHED, and since review finding
 * R5-1 the apostrophes of digit grouping ("12'345'678", "12’345’678"), "~", the middle dots and bullets ("1234·5678",
 * "1234•5678"), ";" and the double quotes, and since review finding G4 the primes OCR writes for a grouping apostrophe
 * (U+2032, U+2035, and U+2033 as NFKC writes it, two U+2032) and the modifier-letter primes and acute (U+02B9, U+02CA,
 * apostrophes here as U+02BC is: APOSTROPHE_LETTER). None of these is a date separator (DATE_SEPARATOR) or an amount's
 * punctuation, so a number written with one is never read as a date or an amount.
 */
const NUMBER_JOINERS = "\\s\\p{Pd}\\u2212\\u2043\\u02D7\\u2796_|\\\\\\u00AD'\\u2018\\u2019\\u02BC\\u02B9\\u02CA\\u2032\\u2035`~\\u00B7\\u2027\\u2219\\u22C5\\u30FB\\u2022;\"\\u201C\\u201D";
/**
 * A line break, and a dash (or VANISHED) before one: a word hyphenated at the end of a line ("Van-⏎tree"). A form feed
 * (the page break pdftotext writes) and a vertical tab are line breaks too (review finding SEC-3).
 */
const LINE_BREAK = '(?:\\r\\n|[\\n\\r\\f\\v\\u0085\\u2028\\u2029])';
const HYPHENATION = `[\\p{Pd}\\u2212\\u2043\\u00AD]${SPACES.replace('+', '*')}${LINE_BREAK}${SPACES.replace('+', '*')}`;

const GAP = {
  /** Inside a name's part, near its ends: "Van-tree", "O’Brien", "Vantr-⏎ee". */
  tight: `(?:[${NAME_JOINERS}]|${HYPHENATION})*`,
  /** Inside a name's part, two letters or more from each end: a space or period too, if the pieces it makes pass (spacedPiecesPass). */
  spaced: `[${NAME_JOINERS}\\s.]*`,
  /**
   * Inside a name's part in the letter reader's wider reading (nameForm with `apart`): any run of marks (runOfMarks;
   * Queues item 34, MOD-25, A-4), which holds all of `spaced`, every line break (U+0085 too, which \\s does not hold) and
   * every other mark: "Zephy, ra", "Zephy(ra", "Zephy/ra", "Zephy+ra". No case per mark: each mark left out was a name
   * sent in clear. Read when a form is built, since runOfMarks names marks declared further down the file.
   */
  get apart(): string {
    return baseReading ? `[${NAME_JOINERS}\\s\\u0085.]*` : runOfMarks();
  },
  /** Between the parts the records hold apart: any joiner, white space, a period or a comma. */
  part: `[${NAME_JOINERS}\\s.,]*`,
  number: `[${NUMBER_JOINERS}]*`,
  /** Between two characters of a number of which one is a letter: "SYN.555001", "ZZ_1234567", "ZZ#1234567", "ZZ(1234567)" (never "150.00"). */
  numberNearLetter: `[${NUMBER_JOINERS}./:#(]*`,
  /** Between two digits of a digits-only number after an identifier label: "." and "/" too ("Claim 1955/07/14", "ICN 1234.5678"). */
  labeledNumber: `[${NUMBER_JOINERS}./]*`,
} as const;

/** A gap that is a word hyphenated at a line break, which joins inside a part whatever the pieces' case ("Jo-⏎ann"). */
const HYPHENATED = new RegExp(`^[${NAME_JOINERS}]*${HYPHENATION}[${NAME_JOINERS}]*$`, 'u');

/** A name's words and parts as the records write them: words split by white space, ",", ";" and "/"; parts by dashes, apostrophes, "." and "_". */
const WORD_SPLIT = /[\s,;/]+/u;
const PIECE_SPLIT = /[\p{Pd}−⁃'‘’ʼʹˊ`´._\u00AD]+/u;

/** U+02BC, U+02B9 and U+02CA: letters by class (modifier letters), apostrophes here, in a name and in a number. */
const APOSTROPHE_LETTER = /^[\u02BC\u02B9\u02CA]$/u;

/** The letters and digits of folded text (an APOSTROPHE_LETTER is an apostrophe here). */
const compactFolded = (text: string) => text.replace(/[^\p{L}\p{N}]|[\u02BC\u02B9\u02CA]/gu, '');

/** The call's own identifiers' kinds. */
type OwnKind = 'claim' | 'member' | 'birth' | 'name';
/** What the patterns redact, whoever's it is: a Social Security number, a phone number. */
type PatternKind = 'ssn' | 'phone';
type Kind = OwnKind | PatternKind;

interface Form {
  /** The form's letters and digits, folded. */
  readonly compact: string;
  readonly kind: OwnKind;
  /** For a claim, its number in the call (1 for [CLAIM_1]). */
  readonly claim: number;
  readonly pattern: Writing;
  /** For a name, whether each gap is inside a part (where a space must leave capitalized pieces of two letters or more). */
  readonly insidePart: readonly boolean[];
  /** A number of digits only: only such a number may be a claim's amount, or the digits whose own written form is a whole separated calendar date (writtenAsDate). */
  readonly digitsOnly: boolean;
  /**
   * For a digits-only number, its pattern with "." and "/" joining digits too: taken only after an identifier label
   * (IDENTIFIER_LABEL), where "Claim 1955/07/14" or "ICN 1234.5678" is the number and not a date or an amount.
   */
  readonly labeled: Writing | null;
}

/**
 * A form's pattern as text (Queues item 39): its source as V8 writes it and its flags. No RegExp is built for a form
 * until a place in a view needs one (searchOf), so a call's thousands of identifiers compile only the patterns of those
 * the letter writes. The keys formsBuiltOf deduplicates by, and the cores gluedCoresOf splits, read this same string.
 */
interface Writing {
  readonly source: string;
  readonly flags: string;
}

/**
 * The source V8 gives a RegExp of `text` with flags 'gu' (RegExp.prototype.source; lemma 4): the text itself where it
 * holds no "/" outside a class and no line terminator, which V8 writes as they are; else, and for no text at all, the
 * source of a RegExp built of it.
 */
function sourceOf(text: string): string {
  const built = () => new RegExp(text, 'gu').source;
  if (text === '' || ['\n', '\r', '\u2028', '\u2029'].some((lineBreak) => text.includes(lineBreak))) {
    return built();
  }
  let inClass = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === '\\') {
      i += 1;
    } else if (character === '[') {
      inClass = true;
    } else if (character === ']') {
      inClass = false;
    } else if (character === '/' && !inClass) {
      return built();
    }
  }
  return text;
}

function patternOf(characters: readonly string[], gaps: readonly string[]): Writing {
  return { source: sourceOf(`${BEFORE}${characters.map((character, i) => `${escapeRegExp(character)}${gaps[i] ?? ''}`).join('')}${AFTER}`), flags: 'gu' };
}

/**
 * A run of marks (Queues item 34, MOD-25; docs/adr/0054): any run of characters that are no letter, no digit and none of
 * the checks' three marks (PRIVATE_MARKS: a placeholder, to every check). An APOSTROPHE_LETTER is an apostrophe here, as
 * it is in every number. What the wider reading takes where a boundary is known to stand: no case per mark, since each
 * mark left out was a form sent in clear ("ZZ12345.01", "ZZ12345:01" and "ZZ12345#01" for a number held "ZZ12345/01").
 * A function, since two of the marks are named further down the file.
 *
 * `also` (what the records write at that place, numberForm) is read only where the first class does not take the
 * character: the two alternatives never take the same one, so a run is read one way and in time linear in its length.
 * With a separator of the records in both, a run of it not followed by the rest of the number was tried every way,
 * the time doubling with each character (review 2 of Queues item 34, R2-1: 26 slashes 7 s, 500 no answer).
 */
const runOfMarks = (also = '') => {
  const noMark = `\\p{L}\\p{N}${BARRIER}${NAME_MARK}${OWN_MARK}`;
  return `(?:[^${noMark}]|(?=[${noMark}])[\\u02BC\\u02B9\\u02CA${also}])*`;
};

/**
 * The fewest letters and digits of a piece of a stored number that is read as a number of its kind (piecesOf), and the
 * fewest digits of a digits-only number that the check refuses glued to a letter (Queues item 34, MOD-25; the
 * orchestrator's ruling of 2026-11-12 on the design's first question). One floor for both. Under it a value is read as
 * before: a piece of four characters, and a number of four digits glued to a letter, are sent, the recorded residual
 * of docs/adr/0054 ("Account1234"). Five is the shortest patient control number the reader expects (SCREEN_FLOORS).
 */
const WIDER_NUMBER_FLOOR = 5;

/**
 * A member ID's or claim number's form, compacted from its folded value, or null under two letters or digits. With
 * `asStored` (the letter reader's wider reading, widerMatchesIn), where the records themselves write a separator
 * between two of the number's characters a run of marks joins them (runOfMarks; MOD-25, A-5), beside what joins a number
 * anywhere: a number held "ZZ12345/01" is read written "ZZ12345/01", "ZZ12345.01", "ZZ12345,01", "ZZ12345 : 01" and
 * "ZZ12345#01", and a claim number held "1234/56" with no label before it. Never where the records write nothing:
 * "ZZ123+4501" is no writing of it. What the records write there joins as well, whatever it is (MOD-23).
 */
function numberForm(value: string, kind: 'claim' | 'member', claim: number, asStored = false): Form | null {
  const folded = viewOf(value.normalize('NFKC'), 'join').text;
  const compact = compactFolded(folded);
  const characters = [...compact];
  if (characters.length < 2) {
    return null;
  }
  const letter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
  // What the stored value writes before each of its letters and digits, each character as a class escape.
  const stored: string[] = [];
  if (asStored) {
    let between = '';
    // A letter's square brackets are parentheses by the time it is matched (unbracketed): the stored value's are read so too.
    for (const codePoint of folded.replace(/[[\]]/g, (bracket) => (bracket === '[' ? '(' : ')'))) {
      if (compactFolded(codePoint) === '') {
        between += `\\u{${(codePoint.codePointAt(0) ?? 0).toString(16)}}`;
      } else {
        stored.push(between);
        between = '';
      }
    }
  }
  const gaps = characters.slice(1).map((next, i) => {
    const gap = letter(characters[i]) || letter(next) ? GAP.numberNearLetter : GAP.number;
    const own = stored[i + 1] ?? '';
    if (own === '') {
      return gap;
    }
    return baseReading ? `${gap.slice(0, -2)}${own}]*` : runOfMarks(own);
  });
  const digitsOnly = /^\p{N}+$/u.test(compact);
  return { compact, kind, claim, pattern: patternOf(characters, gaps), insidePart: [], digitsOnly, labeled: digitsOnly ? patternOf(characters, gaps.map(() => GAP.labeledNumber)) : null };
}

/**
 * The pieces of a stored member ID or claim number that are numbers of its kind in the letter reader's wider reading
 * (Queues item 34, MOD-25, rule (c)): each run of its letters and digits that a character of the stored value which is
 * no letter and no digit sets off (a joiner too: "ZZ12345 01", "ZZ12345-01", "ZZ12345/01"), if it holds a digit and
 * WIDER_NUMBER_FLOOR letters and digits or more. None for a value the records hold in one piece. A piece under the
 * floor ("01", "1234") or of letters alone ("ZZ") is no number: the recorded residual.
 */
function piecesOf(value: string): string[] {
  const pieces = viewOf(value.normalize('NFKC'), 'join')
    .text.split(/(?:[^\p{L}\p{N}]|[\u02BC\u02B9\u02CA])+/u)
    .filter((piece) => piece !== '');
  return pieces.length < 2 ? [] : pieces.filter((piece) => [...piece].length >= WIDER_NUMBER_FLOOR && /\p{N}/u.test(piece));
}

/**
 * A stored name's words in the letter reader's wider reading (Queues item 34, MOD-25, rule (b)): split at every
 * character that is no letter, no digit and no joiner the records' split of a word into parts reads (PIECE_SPLIT), as
 * if a space were held there. A name held "JANE+ZEPHYRA", "JANE&ZEPHYRA" or "ZEPHYRA(JANE)" is the words JANE and
 * ZEPHYRA, where the first reading holds one word JANEZEPHYRA and sent "Ms. Zephyra" in clear. Every character
 * WORD_SPLIT splits at is one of these, so each word of the first reading is a word or several here: it only adds.
 */
const WIDER_WORD_SPLIT = /[^\p{L}\p{N}\p{Pd}−⁃'‘’`´._\u00AD]+/u;

/** A name's parts, each compacted from its folded value, grouped by word; with `wider`, the words of the wider reading (WIDER_WORD_SPLIT). */
function nameWords(name: string, wider = false): string[][] {
  return viewOf(name.normalize('NFKC'), 'join')
    .text.split(wider ? WIDER_WORD_SPLIT : WORD_SPLIT)
    .map((word) => word.split(PIECE_SPLIT).map(compactFolded).filter((piece) => piece !== ''))
    .filter((word) => word.length > 0);
}

/**
 * A name form from its parts (the whole name's, a word's, or one part), or null under two letters or digits. With
 * `apart` (the letter reader's wider reading, widerMatchesIn), a space or a period joins anywhere inside a part, whatever
 * the pieces it leaves: "Zephy ra", "Zephy. ra", "Z e p h y r a"; a line break of any kind is such a space (GAP.apart).
 */
function nameForm(parts: readonly string[], apart = false): Form | null {
  const characters: string[] = [];
  const gaps: string[] = [];
  const insidePart: boolean[] = [];
  for (const part of parts) {
    const letters = [...part];
    letters.forEach((letter, i) => {
      if (i === 0 && characters.length > 0) {
        gaps.push(GAP.part);
        insidePart.push(false);
      } else if (i > 0) {
        gaps.push(apart ? GAP.apart : i >= 2 && letters.length - i >= 2 ? GAP.spaced : GAP.tight);
        insidePart.push(true);
      }
      characters.push(letter);
    });
  }
  if (characters.length < 2) {
    return null;
  }
  return { compact: characters.join(''), kind: 'name', claim: 0, pattern: patternOf(characters, gaps), insidePart, digitsOnly: false, labeled: null };
}

/** What is matched: names, member IDs and the claims' numbers, and whether dates of birth and initials are taken too. */
interface Subject {
  readonly names: readonly string[];
  readonly memberIds: readonly string[];
  readonly claims: readonly (readonly string[])[];
  /** The dates of birth to read, or null when no date is a date of birth (the narrative's facts). */
  readonly datesOfBirth: readonly string[] | null;
  readonly initials: boolean;
  /** Whether Social Security and phone numbers are read too, by pattern (the letter's subject only: docs/adr/0054, amendment of 2026-11-04). */
  readonly patterns: boolean;
}

/**
 * A subject's forms (formsBuiltOf), built once per entry (inOneReading) for each subject, fold and width for the wider
 * reading's sake: a form is built from the subject's values and the fold in effect alone, and no reader changes one
 * (each reads a pattern's source and flags and runs a pattern of its own; the list is frozen so that none can). A first
 * reading is charged what building them cost every time it asks, as on the base, which built them on every call
 * (Stored). Outside an entry they are built on every call, as before.
 */
function formsOf(subject: Subject, wider = false): readonly Form[] {
  if (formsOfCheck === null) {
    return formsBuiltOf(subject, wider);
  }
  const key = `${ownFold}${wider ? '+' : ''}${baseReading ? '<' : ''}`;
  let known = formsOfCheck.get(subject);
  if (known === undefined) {
    known = new Map();
    formsOfCheck.set(subject, known);
  }
  const stored = known.get(key);
  if (stored !== undefined && takenAgain(stored, false)) {
    return stored.forms;
  }
  const before = checkWorkSpent;
  const forms = Object.freeze(formsBuiltOf(subject, wider));
  known.set(key, { forms, cost: workSince(before), paid: storeScope });
  return forms;
}

/** As viewsOfCheck, for formsOf: null outside an entry, and dropped when the entry returns. */
let formsOfCheck: Map<Subject, Map<string, { readonly forms: readonly Form[] } & Stored>> | null = null;

/** A subject's forms; with `wider`, only those of the letter reader's wider reading (widerMatchesIn) that the first reading does not read. */
function formsBuiltOf(subject: Subject, wider: boolean): Form[] {
  const forms = new Map<string, Form>();
  const add = (form: Form | null) => {
    if (form !== null) {
      forms.set(`${form.kind}:${String(form.claim)}:${form.pattern.source}`, form);
    }
  };
  // A piece of a stored number (piecesOf) takes its number's placeholder and the first reading's exceptions, as a
  // number of its kind; where two numbers share a piece, the first in the call's order.
  const pieces = new Set<string>();
  const addPieces = (value: string, kind: 'claim' | 'member', claim: number) => {
    for (const piece of wider && !baseReading ? piecesOf(value) : []) {
      const form = numberForm(piece, kind, claim);
      if (form !== null && !pieces.has(form.pattern.source)) {
        pieces.add(form.pattern.source);
        add(form);
      }
    }
  };
  subject.claims.forEach((numbers, index) => {
    for (const number of numbers) {
      add(numberForm(number, 'claim', index + 1, wider));
      addPieces(number, 'claim', index + 1);
    }
  });
  for (const memberId of subject.memberIds) {
    add(numberForm(memberId, 'member', 0, wider));
    addPieces(memberId, 'member', 0);
  }
  for (const name of subject.names) {
    const words = nameWords(name, wider && !baseReading);
    add(nameForm(words.flat(), wider));
    for (const word of words) {
      add(nameForm(word, wider));
      for (const part of word) {
        add(nameForm([part], wider));
      }
    }
  }
  if (!wider) {
    return [...forms.values()];
  }
  // The wider reading reads only the forms that are wider: one whose pattern is the first reading's own finds what it found.
  const first = new Set(formsOf(subject).map((form) => `${form.kind}:${String(form.claim)}:${form.pattern.source}`));
  return [...forms].filter(([key]) => !first.has(key)).map(([, form]) => form);
}

/** The first letter of each part of each name, folded: the initials taken next to a name; with `wider`, of the wider reading's words (nameWords). */
function initialsOf(names: readonly string[], wider = false): Set<string> {
  return new Set(names.flatMap((name) => nameWords(name, wider).flatMap((word) => word.map((part) => [...part][0] ?? ''))).filter((letter) => /^\p{L}$/u.test(letter)));
}

/**
 * Whether a name match's spaces and periods inside a part leave pieces the part can be written in: each
 * piece on either side of one at least two letters long and capitalized as written ("Jo Ann", never "in
 * a" or "to be"). The match's letters and digits are the form's, in order; what lies between two of them
 * is a gap.
 */
function spacedPiecesPass(form: Form, view: View, normal: string, start: number, end: number): boolean {
  const letters: number[] = [];
  const spaced: boolean[] = [];
  let gap = '';
  for (let i = start; i < end; ) {
    const codePoint = codePointAt(view.text, i);
    if (WORD_CHARACTER.test(codePoint) && !APOSTROPHE_LETTER.test(codePoint)) {
      if (letters.length > 0) {
        spaced.push(/[\s.,]/u.test(gap) && !HYPHENATED.test(gap));
      }
      letters.push(i);
      gap = '';
    } else {
      gap += codePoint;
    }
    i += codePoint.length;
  }
  if (!form.insidePart.some((inside, i) => inside && spaced[i] === true)) {
    return true;
  }
  // The pieces: runs of letters between spaced gaps, each [first, last] by letter index.
  const pieces: [number, number][] = [];
  let first = 0;
  spaced.forEach((isSpaced, i) => {
    if (isSpaced) {
      pieces.push([first, i]);
      first = i + 1;
    }
  });
  pieces.push([first, letters.length - 1]);
  const passes = (piece: [number, number] | undefined) => piece !== undefined && piece[1] - piece[0] + 1 >= 2 && capital(writtenAt(view, normal, letters[piece[0]] ?? 0));
  return form.insidePart.every((inside, i) => !inside || spaced[i] !== true || (passes(pieces.find(([, last]) => last === i)) && passes(pieces.find(([from]) => from === i + 1))));
}

/**
 * Whether a claim's digits at an NFKC range are written as an amount: after a currency sign and with
 * cents after them ("$15000.00" for claim 15000). The digits with their cents are then never the claim's
 * own written form, which holds no cents. A member ID is never read as an amount, nor a claim's digits
 * with only one of the two ("$15000", "15000.00" stay the claim's).
 */
const isAmount = (normal: string, range: Range) => /\p{Sc}\s*$/u.test(normal.slice(Math.max(0, range.start - 8), range.start)) && /^[.,]\d{2}(?!\d)/u.test(normal.slice(range.end, range.end + 4));

/**
 * Whether a digits-only number's own written form (its NFKC range alone, read with its invisible
 * characters dropped or as spaces) is a whole calendar date written with a separator: only then may its
 * digits stay as that date. A number inside a date read with a month word, or across an invisible
 * character, is not that date ("Jan 31-2026" for claim 312026, "1999-1<ZWSP>2-31" for claim 19991).
 */
const writtenAsDate = (normal: string, range: Range) =>
  (['drop', 'space'] as const).some((invisible) => {
    const written = viewOf(normal.slice(range.start, range.end), invisible).text;
    return datesIn(written).some((span) => span.separated && span.dates.length > 0 && span.start === 0 && span.end === written.length);
  });

/**
 * A label that introduces a claim number or member ID, ending where its number begins, on the folded view (an
 * invisible character VANISHED) or on NFKC text: a head word ("Claim", "ICN", "PCN", "DCN", "TCN", "Control",
 * "Account", "Acct", "Member", "Subscriber", "Ref") with any of "number", "nbr", "no", "id", "control" and "#" after
 * it ("Claim #", "Claim No.", "Member ID", "Patient control no.", "CLAIM NUMBER IS"); "Reference" only with one of
 * those after it ("Reference number"); "No" alone only written "No.", "No:" or "No#" with a capital N; "ID" alone only
 * written "ID:" or "ID#", or with a qualifier after it ("ID Number:", "ID No.", "ID nbr": review finding
 * security-rlb-sec-3); "number is"; and "Re:". Its end (LABEL_END) may take ":", "#", "=", a dash or the minus sign
 * (review finding phi-label-end-dash: "Member ID – 1234.5678"), "is", "*" (Markdown bold), one ",", "(" and an opening
 * quote ("**Claim:** ", "Claim, ", "ICN (", "Claim: “"; review finding G3). A bare "no", "number", "id", "#" or
 * "reference" is no such label ("The number 2027-03-15", "No 2027-03-15 appeal", "Answer: no. 2027-03-15", "reference:
 * 2027-03-15", "Reference date #2027-03-15": review finding G2): only this label makes a number written as a whole
 * calendar date the identifier, the letter saying what it is (review finding R5-2), as BIRTH_LABEL says a date of birth.
 * Digits joined over "." or "/" that are no whole written date are the number after any label (ANY_IDENTIFIER_LABEL).
 */
const LABEL_SPACE = '[\\s\\u00AD]';
/**
 * A qualifier after a head word or a bare "ID", with its own full stop. A head word joins its qualifiers over its own
 * full stop and over white space and line breaks ("Member.ID", "Claim. No", "Member No.\nID", a wrapped "Claim\nNumber:"),
 * as it always has: such a reading may join over a sentence end ("CLAIM.\nID:"), so the label a line or a sentence begins
 * counts beside it (LINE_OR_SENTENCE_START, labelsBefore), which only ever adds a label (MOD-13, seed 460548619).
 */
const LABEL_QUALIFIER = `(?:\\b(?:number|nbr|no|id|control)\\b\\.?|#)`;
const LABEL_END = `[\\s\\u00AD*]*(?:[:#=\\p{Pd}\\u2212][\\s\\u00AD*]*|,${LABEL_SPACE}*)?(?:is${LABEL_SPACE}+)?(?:[("'\\u201C\\u2018]${LABEL_SPACE}*)?$`;
const LABEL_HEAD =
  `\\b(?:(?<claim>claim|icn|pcn|dcn|tcn|control|account|acct)|(?<member>member|subscriber)|ref)\\b\\.?(?:${LABEL_SPACE}*${LABEL_QUALIFIER})*` +
  `|\\breference(?:${LABEL_SPACE}*${LABEL_QUALIFIER})+` +
  `|\\b(?<no>no)(?=\\.|${LABEL_SPACE}*[:#])\\.?` +
  `|\\bid(?:(?:${LABEL_SPACE}*${LABEL_QUALIFIER})+|(?=${LABEL_SPACE}*[:#]))` +
  `|\\bnumber(?=${LABEL_SPACE}*[:=\\p{Pd}\\u2212]?${LABEL_SPACE}*is${LABEL_SPACE})` +
  `|\\bre(?=${LABEL_SPACE}*:)`;
const IDENTIFIER_LABEL = new RegExp(`(?:${LABEL_HEAD})${LABEL_END}`, 'iu');
/**
 * Where a line or a sentence may begin, at its first letter, past any marks before it ("- ID:", "**ID:**"): after a line
 * break, after "!" or "?" and white space, and after any full stop, with or without white space. An abbreviation's full
 * stop may end a sentence as well as a word's ("acct. ID:", "SUBSCRIBER NBR. No.", "acct. No.", "Acct. Number is",
 * "CLAIM.id:", and "acct．ID:", which NFKC writes "acct.ID:"), so the label after it counts beside the one label it
 * joins ("Acct. No." is a claim's label, and "No." either's: review finding security-rlb-sec-2, and its member labels).
 */
const LINE_OR_SENTENCE_START = new RegExp(`(?:[\\n\\r\\v\\f\\u0085\\u2028\\u2029]|[!?]${LABEL_SPACE}|\\.)[^\\p{L}\\p{N}]*(?=\\p{L})`, 'gu');

/**
 * Any identifier label: IDENTIFIER_LABEL, or a bare "id", "number", "nbr", "no", "num", "identification", "reference"
 * or "#", with any qualifiers after it, so any word before one ("Patient ID", "Policy number", "Insurance ID", "Member's
 * ID", "Member Identification Number", "Policy #", "ID"). After it, digits joined over "." or "/" that are no whole
 * written calendar date are the number (review finding phi-G2-regress-1: "Patient ID 1234.5678"): G2's narrowing keeps
 * a deadline, a whole written date, and so applies to whole written dates alone (IDENTIFIER_LABEL, labelFor).
 */
const ANY_IDENTIFIER_LABEL = new RegExp(`(?:${LABEL_HEAD.replace(/\(\?<\w+>/gu, '(?:')}|(?:\\b(?:id|number|nbr|no|num|identification|reference)\\b\\.?|#)(?:${LABEL_SPACE}*${LABEL_QUALIFIER})*)${LABEL_END}`, 'iu');

/**
 * A label word glued to the number it introduces, with no space ("ICN99887766", "Member ID12345678", and "№99887766",
 * which NFKC writes "No99887766": review finding phi-numero-glued), ending where the number begins: a head word, "id",
 * "nbr", "num", "ref", or "No" with a capital N, a whole word or after a small letter ("ClaimNo99887766" from
 * "Claim№99887766": CAMEL_NO, written "No" after a small letter). The number is then read as after a label of that kind.
 */
const GLUED_LABEL = /(?<![\p{L}\p{N}])(?:(?<claim>claim|icn|pcn|dcn|tcn|acct)|(?<member>member|subscriber)|(?<no>no)|id|nbr|num|ref)$/iu;
const CAMEL_NO = /\p{L}no$/iu;

/** What an identifier label introduces: a claim's number, a member ID, or either ("Ref", "No.", "ID:", "number is", "Re:"). */
type LabelKind = 'claim' | 'member' | 'either';

/** The kind a label match names: a claim's head, a member's, or either ("Ref", "No.", "ID:", "number is", "Re:"). */
const kindOf = (match: RegExpExecArray): LabelKind => (match.groups?.claim !== undefined ? 'claim' : match.groups?.member !== undefined ? 'member' : 'either');

/**
 * The kinds of the identifier labels (IDENTIFIER_LABEL) that end at a position of text, none when no label does: the
 * leftmost label that ends there, and the leftmost one that begins at or after each start of a line or a sentence
 * (LINE_OR_SENTENCE_START) and ends there. A head joins its qualifiers over its own full stop and over a line break (a
 * wrapped "Claim\nNumber:", "Member.ID", "Claim. No"), so that reading may reach over a line's or a sentence's end; the
 * label the next line or sentence holds then counts as well, however many words it is and wherever on that line it
 * begins ("CLAIM.\nID:" is "ID:", MOD-13 seed 460548619; "claim\nID No." is "No.", review finding security-rlb-sec-1).
 * So does the label after any full stop, an abbreviation's too ("acct. ID:", "SUBSCRIBER NBR. No.", "acct. No."), which
 * may end one sentence and begin the next. A label on one line within one sentence and no full stop is otherwise one
 * label ("Claim ID:", "Claim\tID:", "Member ID No."), so G2 holds for it.
 * `written` gives the code point a letter wrote at a position, where "No" must be capitalized ("No. 2027-03-15", never
 * "no.").
 */
function labelsBefore(text: string, at: number, written: (index: number) => string): LabelKind[] {
  const from = Math.max(0, at - 40);
  const before = text.slice(from, at);
  const kinds = new Set<LabelKind>();
  const readFrom = (start: number) => {
    const match = IDENTIFIER_LABEL.exec(before.slice(start));
    if (match !== null && (match.groups?.no === undefined || capital(written(from + start + match.index)))) {
      kinds.add(kindOf(match));
    }
  };
  readFrom(0);
  for (const start of before.matchAll(LINE_OR_SENTENCE_START)) {
    readFrom(start.index + start[0].length);
  }
  return [...kinds];
}

/**
 * The kind of the label word glued to a number (GLUED_LABEL) that ends at a position of text, or null when none does;
 * "No" glued after a small letter ("ClaimNo99887766", CAMEL_NO) is either. `written` is as for labelsBefore.
 */
function gluedLabelBefore(text: string, at: number, written: (index: number) => string): LabelKind | null {
  const from = Math.max(0, at - 40);
  const before = text.slice(from, at);
  const match = GLUED_LABEL.exec(before);
  if (match === null && CAMEL_NO.test(before) && /^\p{Ll}N$/u.test(written(at - 3) + written(at - 2)) && written(at - 1) === 'o') {
    return 'either';
  }
  if (match === null || (match.groups?.no !== undefined && !capital(written(from + match.index)))) {
    return null;
  }
  return kindOf(match);
}

/**
 * Whether an identifier label ends just before a view position that introduces this kind of number: a member label a
 * member ID, a claim label a claim's number (review finding G2: "Member: 2027-03-15" is no claim number), and "Ref",
 * "No.", "ID:", "number is" or "Re:" either; any of the labels that end there (labelsBefore). Only such a label makes a
 * whole written calendar date the number.
 */
function labelFor(view: View, normal: string, start: number, kind: Kind): boolean {
  const labels = labelsBefore(view.text, start, (index) => writtenAt(view, normal, index));
  return labels.includes('either') || labels.some((label) => label === kind);
}

/** Whether any identifier label (ANY_IDENTIFIER_LABEL) ends just before a position of text: after one, digits joined over "." or "/" that are not a whole written calendar date are the number. */
const anyLabelAt = (text: string, start: number) => ANY_IDENTIFIER_LABEL.test(text.slice(Math.max(0, start - 40), start));

interface Found extends Range {
  readonly kind: Kind;
  readonly claim: number;
  /** For a Social Security or phone number that is not the call's own: its compact forms the one-patient screen is offered (whole, core, joined to the token written against it). */
  readonly compacts?: readonly string[];
  /**
   * A match ef3e8d20 did not make that can change what the survivor scan chains: a number a label names only through the
   * call's own identifier or a list number, a member ID or claim number in a form only this reading reads, or a name in a
   * digit-for-letter form. The letter reader applies it only where the letter is not refused without it (appliedMatches).
   */
  readonly fresh?: boolean;
  /**
   * A Social Security or phone pattern's match inside a run that holds one of the call's identifiers glued in a look-alike
   * form and that no match of the call's own covers whole: where a check follows, it is left as written so the check reads
   * the run whole and refuses it (appliedMatches);
   * where none does (redactLetter, redactionSpans), it is applied, as ef3e8d20 applied it (the review of the fix round's
   * delta, D1's note).
   */
  readonly withheld?: boolean;
}

/**
 * Every match in NFKC text, as NFKC ranges, all found on the text as it is before anything is replaced:
 * the dates of birth, the claims' numbers and member IDs, the names and (when asked) the initials next
 * to a name.
 */
/**
 * The dates of NFKC text on both readings of invisible characters: each date of birth (NFKC ranges), and whether an NFKC
 * range lies in another date, a separated date with a calendar reading that is not a date of birth, which stays and holds
 * no name (inOtherDate). A digits-only number of the call's whose own written form is such a date stays only where the
 * date is read past each match's end as well (inDateAsRead), as cc3dd7f6 read dates: where a match with no reading overlaps
 * it ("Paid 0.00. 11-02-2019" for member ID 11022019), the number is redacted as it was there (review PHI1-3, PHI2-5).
 */
/** Whether a range lies in one of the ranges (sorted here; each answer a binary search). */
function within(ranges: Range[]): (range: Range) => boolean {
  ranges.sort((a, b) => a.start - b.start);
  const reach: number[] = [];
  ranges.forEach((each, i) => reach.push(Math.max(reach[i - 1] ?? -1, each.end)));
  return (range: Range) => (reach[firstIndex(ranges, (each) => each.start > range.start) - 1] ?? -1) >= range.end;
}

/** Invisible characters and the digits after them. */
const BIRTH_TAIL = /^[\p{Cf}\p{Default_Ignorable_Code_Point}]+\p{N}+/u;

interface DatesOf {
  readonly births: readonly Range[];
  readonly inOtherDate: (range: Range) => boolean;
  readonly inWholeDate: (range: Range) => boolean;
  readonly inDateAsRead: (range: Range) => boolean;
}

/** The dates of a text (readDatesOf), read once per check for each text and set of dates of birth (viewsOfCheck). */
function datesOf(normal: string, subject: Subject): DatesOf {
  if (datesOfCheck === null) {
    return readDatesOf(normal, subject);
  }
  const key = `${ownFold}${JSON.stringify(subject.datesOfBirth)}`;
  const at = datesOfCheck.findIndex((each) => each.key === key && each.normal === normal);
  const known = datesOfCheck[at];
  if (known !== undefined && takenAgain(known, true)) {
    return known.dates;
  }
  const before = checkWorkSpent;
  const dates = readDatesOf(normal, subject);
  datesOfCheck[known === undefined ? datesOfCheck.length : at] = { normal, key, dates, cost: workSince(before), paid: storeScope };
  return dates;
}

/** As viewsOfCheck, for datesOf: the check reads the dates of its two masked texts, which are one text when no name was redacted. */
let datesOfCheck: ({ readonly normal: string; readonly key: string; readonly dates: DatesOf } & Stored)[] | null = null;

/**
 * Runs one entry's readings of a letter with the check's stores open (viewsOfCheck, datesOfCheck, formsOfCheck), so that
 * the wider reading (widerMatchesIn) takes the views, dates and forms the first reading built of the same text: reading a letter's dates
 * a second time was a third of the time of a letter of dates (MOD-23). A reading inside another shares the outer one's
 * stores; they are emptied when the outermost returns, so no letter's text is held past it. Each store is keyed by
 * everything its answer depends on (the whole text, the fold, the view's kind, the dates of birth; for the forms the
 * subject itself, the fold and the width), so a stored answer
 * is the answer a fresh reading gives; what a first reading is charged for one is as on the base (Stored).
 */
function inOneReading<T>(read: () => T): T {
  if (viewsOfCheck !== null && datesOfCheck !== null && formsOfCheck !== null) {
    return read();
  }
  viewsOfCheck = new Map();
  datesOfCheck = [];
  formsOfCheck = new Map();
  try {
    return read();
  } finally {
    viewsOfCheck = null;
    datesOfCheck = null;
    formsOfCheck = null;
    alikeOfWider = null;
  }
}

function readDatesOf(normal: string, subject: Subject): DatesOf {
  const births: Range[] = [];
  const otherDates: Range[] = [];
  const asRead: Range[] = [];
  const birthDates = new Set(subject.datesOfBirth ?? []);
  const other = (span: DateSpan) => span.separated && span.dates.length > 0;
  for (const invisible of ['drop', 'space'] as const) {
    const view = viewOf(normal, invisible);
    // The dates as cc3dd7f6 read them, past each match's end, and where one of them is the date of birth by its value: a
    // date read only from a start inside it is no second date of birth (below).
    const asMatched = datesIn(view.text, false);
    const matched = new Set(asMatched.map((span) => `${String(span.start)}:${String(span.end)}`));
    const inBirth = new Uint8Array(view.text.length + 1);
    for (const span of asMatched) {
      if (span.dates.some((date) => birthDates.has(date))) inBirth.fill(1, span.start + 1, span.end);
    }
    for (const span of datesIn(view.text)) {
      const range = inNormal(view, span.start, span.end);
      const birth = span.dates.some((date) => birthDates.has(date));
      if (inBirth[span.start] === 1 && !matched.has(`${String(span.start)}:${String(span.end)}`)) {
        // Read only from a start inside the written date of birth, its last numbers with the number after it ("2/01 - 01"
        // of "DOB 1/2/01 - 01/05/2026", born 2001-01-02): the date of birth is the one before it, already taken, and the
        // number after it is the next token's (a date of service, a time, an amount, units), which stays as cc3dd7f6
        // left it (review round 5, F4).
        continue;
      }
      if (subject.datesOfBirth !== null && (birth || BIRTH_LABEL.test(view.text.slice(Math.max(0, span.start - 40), span.start)))) {
        // A date a birth label introduces that reads as no date of birth, read with an invisible character as a space,
        // takes the digits the character joins to it ("DOB 1970-01-0<ZWNJ>1Paid"): the date may go on in them.
        const on = birth ? 0 : (BIRTH_TAIL.exec(normal.slice(range.end, range.end + 64))?.[0].length ?? 0);
        births.push({ start: range.start, end: range.end + on });
      } else if (other(span)) {
        otherDates.push(range);
      }
    }
    for (const span of asMatched.filter(other)) {
      asRead.push(inNormal(view, span.start, span.end));
    }
  }
  const inOtherDate = within(otherDates);
  const inAsRead = within(asRead);
  // A date written whole: two numbers or more (a day and a year). "May 2020" and "June 103" are read as a day and a year run together.
  const inWholeDate = within(otherDates.filter((range) => (normal.slice(range.start, range.end).match(/\p{N}+/gu) ?? []).length >= 2));
  return { births, inOtherDate, inWholeDate, inDateAsRead: (range: Range) => inOtherDate(range) && inAsRead(range) };
}

/**
 * Whether an NFKC range lies in a written form of the date of birth (datePattern), word edges or none: a month's word that is
 * a part of the patient's name, or a number of the call's, is the date's month there ("DOB June 1, 2002Paid" for a patient
 * June), so the date stays whole for the check to read (birthGlued).
 */
function birthFormsIn(normal: string, subject: Subject): (range: Range) => boolean {
  const forms: Range[] = [];
  for (const birth of subject.datesOfBirth ?? []) {
    const pattern = datePattern(birth);
    if (pattern === null || !MONTH_IN.test(normal)) {
      continue;
    }
    for (const invisible of ['drop', 'space'] as const) {
      const view = viewOf(normal, invisible);
      pattern.lastIndex = 0;
      for (let match = pattern.exec(view.text); match !== null; match = pattern.exec(view.text)) {
        forms.push(inNormal(view, match.index, match.index + match[0].length));
        pattern.lastIndex = match.index + 1;
      }
    }
  }
  return within(forms);
}

/** A month's word anywhere: only then can a name lie in a written date of birth. */
const MONTH_IN = new RegExp(MONTH_WORD, 'iu');

// ---------------------------------------------------------------------------------------------------
// One pass over the call's identifiers (Queues item 39, MOD-26; docs/adr/0054)
//
// Every match of a form's writing spells the form's compact, its letters and digits in order and no others, from where
// it starts (lemma 1: no gap matches a letter or digit a compact keeps, the tests' (c)). So one pass of an automaton of
// the forms' compacts over the view's letters and digits finds every place a form can match, and the form's own pattern
// is run, sticky, only there: the first place at or after lastIndex where it matches is the place a global scan finds
// (lemma 2). A form whose compact stands nowhere is not run at all. Nothing here is charged: every work(...) is the
// base's, charge for charge (lemma 3). Nothing is kept past the call that asks.

/** More places than this and a form is read by one global scan, as the base read it: cheaper than a sticky run at each. */
const DENSE_PLACES = 16;

/** A run of the letters and digits a compact keeps (compactFolded), from lastIndex: an APOSTROPHE_LETTER is no such letter. */
const KEPT_RUN = /(?:(?![ʼʹˊ])[\p{L}\p{N}])+/uy;

/** Whether a UTF-16 code unit is an ASCII letter or digit: in ASCII, exactly the code points a compact keeps. */
const asciiKept = (unit: number): boolean => (unit >= 48 && unit <= 57) || (unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122);

/** Whether every code point of `text` is one a compact keeps: compactFolded(text) === text, with no regular expression run over ASCII. */
function allKept(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (!asciiKept(text.charCodeAt(i))) {
      return compactFolded(text) === text;
    }
  }
  return true;
}

/** For each word that stands contiguously in the text's kept letters and digits, every index of the text where it starts, in order. */
function placesOf(text: string, words: readonly string[]): Map<string, number[]> {
  const places = new Map<string, number[]>();
  const distinct = [...new Set(words)];
  if (distinct.length === 0) return places;
  // The automaton (Aho-Corasick): a trie of the words by code point, each node's longest proper suffix that is a node
  // (fail), and the nearest such suffix that ends a word (output).
  const next: Map<string, number>[] = [new Map<string, number>()];
  const ends: number[] = [-1];
  const lengths = distinct.map((word, w) => {
    let node = 0;
    let length = 0;
    for (const codePoint of word) {
      let to = next[node]?.get(codePoint);
      if (to === undefined) {
        to = next.length;
        next.push(new Map());
        ends.push(-1);
        next[node]?.set(codePoint, to);
      }
      node = to;
      length += 1;
    }
    if (node !== 0) ends[node] = w;
    return length;
  });
  const fail = new Array<number>(next.length).fill(0);
  const output = new Array<number>(next.length).fill(-1);
  const queue = [...(next[0]?.values() ?? [])];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head] ?? 0;
    for (const [codePoint, to] of next[node] ?? []) {
      let back = fail[node] ?? 0;
      while (back !== 0 && !(next[back]?.has(codePoint) ?? false)) back = fail[back] ?? 0;
      const suffix = node === 0 ? 0 : (next[back]?.get(codePoint) ?? 0);
      fail[to] = suffix;
      output[to] = (ends[suffix] ?? -1) >= 0 ? suffix : (output[suffix] ?? -1);
      queue.push(to);
    }
  }
  // One pass over the text's kept code points, each with the index where it starts. ASCII is read by its code; a run of
  // kept code points that begins with any other is read by one sticky regular-expression run, and a code point no run
  // begins with is not kept.
  const at: number[] = [];
  let node = 0;
  const step = (codePoint: string, index: number) => {
    at.push(index);
    while (node !== 0 && !(next[node]?.has(codePoint) ?? false)) node = fail[node] ?? 0;
    node = next[node]?.get(codePoint) ?? 0;
    for (let found = (ends[node] ?? -1) >= 0 ? node : (output[node] ?? -1); found >= 0; found = output[found] ?? -1) {
      const w = ends[found] ?? -1;
      const word = distinct[w] ?? '';
      const start = at[at.length - (lengths[w] ?? 0)] ?? 0;
      const list = places.get(word);
      if (list === undefined) places.set(word, [start]);
      else list.push(start);
    }
  };
  for (let i = 0; i < text.length; ) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) {
      if (asciiKept(unit)) step(text[i] ?? '', i);
      i += 1;
      continue;
    }
    KEPT_RUN.lastIndex = i;
    const run = KEPT_RUN.exec(text);
    if (run === null) {
      i += (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
      continue;
    }
    for (const codePoint of run[0]) {
      step(codePoint, i);
      i += codePoint.length;
    }
  }
  return places;
}

/** What a reader asks of a form's pattern: a global RegExp's exec and lastIndex. */
interface Search {
  lastIndex: number;
  exec(text: string): RegExpExecArray | null;
}

/**
 * A form's writing (`source`, global flags) as a search over the view whose places are `places`: the same matches, in
 * the same order, as `new RegExp(source, flags)` run from any lastIndex (lemma 2). Searched whole, as the base did, where
 * the form's compact is not all kept letters and digits (lemma 1(b)) or stands at more than DENSE_PLACES places.
 */
function searchOf(source: string, flags: string, compact: string, places: ReadonlyMap<string, readonly number[]>): Search {
  if (!allKept(compact)) {
    return new RegExp(source, flags);
  }
  const starts = places.get(compact);
  if (starts === undefined) {
    // What never matches: the form's compact stands nowhere in the view (lemma 1).
    return { lastIndex: 0, exec: () => null };
  }
  if (starts.length > DENSE_PLACES) {
    return new RegExp(source, flags);
  }
  let sticky: RegExp | null = null;
  return {
    lastIndex: 0,
    exec(text: string): RegExpExecArray | null {
      let low = 0;
      let high = starts.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if ((starts[middle] ?? 0) < this.lastIndex) low = middle + 1;
        else high = middle;
      }
      for (let i = low; i < starts.length; i += 1) {
        sticky ??= new RegExp(source, `${flags.replace('g', '')}y`);
        sticky.lastIndex = starts[i] ?? 0;
        const match = sticky.exec(text);
        if (match !== null) {
          this.lastIndex = match.index + match[0].length;
          return match;
        }
      }
      this.lastIndex = 0;
      return null;
    },
  };
}

/** Whether a form's whole writing can stand anywhere in the view whose places are `places` (lemma 1): the `.some` sites. */
const mayStand = (form: Form, places: ReadonlyMap<string, readonly number[]>): boolean => !allKept(form.compact) || places.has(form.compact);

function ownMatchesIn(normal: string, subject: Subject, wider = false): Found[] {
  // Each form (a claim number, a member ID, a name, each of its words and parts) is read for over the whole letter.
  const forms = formsOf(subject, wider);
  work(WORK.formCharacter * forms.length * normal.length);
  const { births, inWholeDate, inDateAsRead } = datesOf(normal, subject);
  const inBirthForm = birthFormsIn(normal, subject);
  const found: Found[] = births.map((range) => ({ ...range, kind: 'birth' as const, claim: 0 }));
  const view = viewOf(normal, 'join');
  const names: Range[] = [];
  const places = placesOf(view.text, forms.map((form) => form.compact));
  for (const form of forms) {
    const pattern = searchOf(form.pattern.source, form.pattern.flags, form.compact, places);
    for (let match = pattern.exec(view.text); match !== null; match = pattern.exec(view.text)) {
      const start = match.index;
      const end = start + match[0].length;
      const range = inNormal(view, start, end);
      if (wider && !baseReading) {
        // The wider reading asks at every place, not from the end of the match before: under its gaps (a run of marks,
        // MOD-25 A-4 and A-5) a match can begin at a cut form of the value, cross a mark and end inside the real writing
        // after it ("ZEPHYRA: Z E P H Y R A Z" for ZEPHYRAZ), and a scan that went on from there sent the rest of that
        // writing, which the narrower gaps replaced whole (review 1 of Queues item 34, R1-1). The spans are merged.
        pattern.lastIndex = start + codePointAt(view.text, start).length;
      }
      if (form.kind === 'name') {
        if (!wider && !spacedPiecesPass(form, view, normal, start, end)) {
          // Past the whole first code point: with the u flag, an index inside a surrogate pair finds the same match again.
          pattern.lastIndex = start + codePointAt(view.text, start).length;
          continue;
        }
        if (inWholeDate(range)) {
          continue;
        }
        names.push({ start, end });
      } else if (form.digitsOnly && ((form.kind === 'claim' && isAmount(normal, range)) || (inDateAsRead(range) && writtenAsDate(normal, range) && !labelFor(view, normal, start, form.kind)))) {
        continue;
      }
      found.push({ ...range, kind: form.kind, claim: form.claim });
    }
    if (form.labeled !== null) {
      // After an identifier label, digits joined over "." or "/" are the number too (never an amount: isAmount), and a
      // whole written calendar date only after a label of the number's kind (labelFor).
      const labeled = searchOf(form.labeled.source, form.labeled.flags, form.compact, places);
      for (let match = labeled.exec(view.text); match !== null; match = labeled.exec(view.text)) {
        const range = inNormal(view, match.index, match.index + match[0].length);
        const fits = labelFor(view, normal, match.index, form.kind) || (anyLabelAt(view.text, match.index) && !writtenAsDate(normal, range));
        if (fits && !(form.kind === 'claim' && isAmount(normal, range))) {
          found.push({ ...range, kind: form.kind, claim: form.claim });
        }
      }
    }
    if (form.kind === 'claim' || form.kind === 'member') {
      // A number glued to a label word with no space before it ("ICN99887766", "Member ID12345678", "No99887766" from
      // "№99887766": review finding phi-numero-glued), which BEFORE alone never reads: a letter stands before it. It is
      // read as after a label of that kind, over "." and "/" too for digits alone, a whole written date only after a
      // label of the number's kind.
      for (const source of [form.pattern, form.labeled]) {
        if (source === null) {
          continue;
        }
        const glued = searchOf(`(?<=\\p{L})${source.source.slice(BEFORE.length)}`, source.flags, form.compact, places);
        for (let match = glued.exec(view.text); match !== null; match = glued.exec(view.text)) {
          const range = inNormal(view, match.index, match.index + match[0].length);
          const label = gluedLabelBefore(view.text, match.index, (index) => writtenAt(view, normal, index));
          const fits = label !== null && (label === 'either' || label === form.kind || !(form.digitsOnly && writtenAsDate(normal, range)));
          if (fits && !(form.kind === 'claim' && form.digitsOnly && isAmount(normal, range))) {
            found.push({ ...range, kind: form.kind, claim: form.claim });
          }
        }
      }
    }
  }
  // An initial is taken only next to a name or to an initial taken so: with no name there is none. The wider reading
  // does not ask then (the first reading asks as it always did): on a letter of initials that search is most of a
  // reading's counted work, and it would be done, and charged, once more for nothing.
  if (subject.initials && !(wider && names.length === 0)) {
    for (const initial of initialsNextToNames(view, normal, names, initialsOf(subject.names, wider && !baseReading))) {
      found.push({ ...inNormal(view, initial.start, initial.end), kind: 'name', claim: 0 });
    }
  }
  // A name, member ID or claim number written as a word of a written date of birth is that date's (a member ID "JUNE" in
  // "DOB June 1, 2002Paid"): the date stays whole for the check.
  for (let i = found.length - 1; i >= 0; i -= 1) {
    const match = found[i];
    if (match !== undefined && match.kind !== 'birth' && inBirthForm(match)) found.splice(i, 1);
  }
  return found;
}

/** A name joiner ef3e8d20 did not read: a name written with one is a match it did not make. */
const NEW_NAME_JOINER = /[\u00B7\u2027\u2219\u22C5\u2022]/u;
const NEW_NAME_JOINERS = /[\u00B7\u2027\u2219\u22C5\u2022]/gu;
/**
 * The text as ef3e8d20's reading of the call's own identifiers read it: each name joiner it did not read written as the
 * katakana middle dot, which joins a number as each of them does (the six stand together in every list of ef3e8d20:
 * NUMBER_JOINERS, SHAPE_JOINERS, the scan's joiners) and joins no name.
 */
const asBaseRead = (normal: string) => normal.replace(NEW_NAME_JOINERS, '\u30FB');

/**
 * Every match in NFKC text. For the letter reader (subject.patterns): the call's own identifiers as ef3e8d20 read them (the
 * plain fold); then what only this reading reads, each marked fresh (Found.fresh): a name written with a joiner ef3e8d20
 * did not read, an identifier found on the look-alike fold alone (another script's letters or digits), and the
 * digit-for-letter forms; then the Social Security and phone patterns, read with the settled matches alone as what stands
 * found, so a match ef3e8d20 did not make ends no label's window and is no item of a list ("Claim Zephy\u2219ra, 900123456"
 * keeps no number: the review of the fix round, C1-2). `marked`, where the check gives it, is the same text with the
 * call's own placeholders as OWN_MARK: the patterns read it, so a label reads through a placeholder as it read through the
 * identifier.
 */
function matchesIn(normal: string, subject: Subject, marked: string = normal): Found[] {
  // ef3e8d20's own reading of the call's identifiers: the text with the new name joiners written as it read them.
  const joined = NEW_NAME_JOINER.test(normal);
  const base = ownMatchesIn(joined ? asBaseRead(normal) : normal, subject);
  if (!subject.patterns) {
    // The narrative's check and the packet verifier read a name as ef3e8d20 read it: which stored narratives fail is
    // theirs to change (packages/packets, verifier-identifiers.test.ts pins what the matcher does not read).
    return base;
  }
  // ef3e8d20's own matches stand settled. Whatever the new name joiners add is fresh: the name written with one, and what
  // is read only beside it (an initial next to that name: the review of the fix round's delta, D1-1).
  const plain = joined ? ownMatchesIn(normal, subject) : base;
  const found: Found[] = plain === base ? [...base] : [...base, ...plain.filter((match) => !someOf(base, (known) => known.start === match.start && known.end === match.end && known.kind === match.kind)).map((match) => ({ ...match, fresh: true }))];
  if (alikeReads(normal, subject)) {
    onFold('alike', () => {
      for (const match of ownMatchesIn(normal, subject)) {
        if (someOf(plain, (known) => known.start <= match.start && match.end <= known.end)) continue;
        // A name part of two or three letters written wholly in another script's letters is that script's word ("\u043D\u0430"
        // in a Russian notice is no HA, "\u03BA\u03B1\u03B9" no KAI: the review of the build, B2-7).
        const written = normal.slice(match.start, match.end).normalize('NFD');
        if (match.kind === 'name' && (written.match(/\p{L}/gu) ?? []).length < 4 && !/[A-Za-z]/u.test(written)) continue;
        found.push({ ...match, fresh: true });
      }
    });
  }
  // The call's own identifiers written with a scan's look-alikes, as words of their own (ruling A').
  const tokens = writtenTokens(normal);
  const glued = onFold('alike', () => {
    found.push(...confusedMatchesIn(tokens, subject, normal));
    return confusedGluedIn(tokens, subject);
  });
  // Last, so a bare number's label window ends at every settled match (section 3.4); never inside a run that holds one of
  // the call's identifiers glued in a look-alike form, which the check refuses whole. A run that a match of the call's own
  // covers whole is not left to the check, and the pattern's match is applied as ef3e8d20 applied it: where that own match
  // is applied its placeholder replaces the run, and where it is not (appliedMatches, the settled matches alone) the scan
  // as ef3e8d20 read it refuses the text. Where one member ID ends another, "ZZ76543\uA6EF1" holds 7654321 glued and is
  // ZZ7654321 whole: with the match that begins in its last digit withheld, "ID [MEMBER_ID]" was sent with the date after
  // it as written, which ef3e8d20's redaction replaced.
  const settled = found.filter((match) => match.fresh !== true);
  // Read here, before any pattern's match joins `found`: only the call's own matches cover a run.
  const leftToTheCheck = glued.filter((range) => !someOf(found, (whole) => whole.start <= range.start && range.end <= whole.end));
  for (const match of patternMatchesIn(marked, settled, subject)) {
    const inRun = (match.kind === 'ssn' || match.kind === 'phone') && someOf(leftToTheCheck, (range) => match.start < range.end && range.start < match.end);
    found.push(inRun ? { ...match, withheld: true } : match);
  }
  return found;
}

/**
 * The call's own names, member IDs and claim numbers in the letter reader's wider reading (docs/adr/0054, amendment of
 * 2026-11-11, MOD-23): a name's part with a space or a period anywhere inside it, whatever the pieces it leaves ("Zephy ra",
 * "Zephy. ra", "Z e p h y r a", which the pieces rule of spacedPiecesPass keeps from the first reading so that "in a" is no
 * INA), an initial next to a name read so, and a number with the separators the records themselves hold it with. Read on
 * the plain fold and, where a look-alike stands, on the look-alike fold, as the first reading is (matchesIn, whose rule for
 * a short word of another script this keeps: B2-7). No part of matchesIn: what the first reading finds, the patterns read
 * and the scan chains is as it was, and this reading only adds (redactLetterForScreen, holdsIdentifier).
 */
function widerMatchesIn(normal: string, subject: Subject): Found[] {
  const outer = widerReading;
  widerReading = true;
  try {
    return widerMatchesRead(normal, subject);
  } finally {
    widerReading = outer;
  }
}

/**
 * Whether the wider reading last read a text on the look-alike fold too (alikeReads, which costs WORK.fold for every
 * character outside ASCII): its answer for that text and subject, null outside an entry (inOneReading drops it, so no
 * letter's text is held past one).
 */
let alikeOfWider: { readonly normal: string; readonly subject: Subject; readonly alike: boolean } | null = null;

/** widerMatchesIn's reading; it takes stored views and dates for nothing (Stored), and counts what it does itself. */
function widerMatchesRead(normal: string, subject: Subject): Found[] {
  const read = () => ownMatchesIn(normal, subject, true).filter((match) => match.kind !== 'birth');
  const found = read();
  const alike = alikeReads(normal, subject);
  // Kept for the check's glued reading of this same text (digitsGluedToLetter), which asks nothing twice.
  alikeOfWider = { normal, subject, alike };
  if (alike) {
    onFold('alike', () => {
      for (const match of read()) {
        const written = normal.slice(match.start, match.end).normalize('NFD');
        if (match.kind === 'name' && (written.match(/\p{L}/gu) ?? []).length < 4 && !/[A-Za-z]/u.test(written)) continue;
        found.push(match);
      }
    });
  }
  return found;
}

/**
 * What a letter or digit, as written, may stand for where a scan or an eye takes a digit for a letter or a letter for a
 * digit: itself, and O for 0, l or I for 1, S for 5, B for 8 and E for 3, each way (the orchestrator's ruling A' of
 * 2026-11-07 names the first four pairs; the pinned rows hold the fifth, "VANTR3E"). Never a letter for a letter: "well"
 * is no WEIL and "ella" no ELIA.
 */
function mayBe(written: string): string {
  work(WORK.mayBe);
  switch (written) {
    case 'O':
    case 'o':
      return 'O0';
    case '0':
      return '0O';
    case 'l':
      return 'L1';
    case 'I':
      return 'I1';
    case '1':
      return '1IL';
    case 'S':
    case 's':
      return 'S5';
    case '5':
      return '5S';
    case 'B':
      return 'B8';
    case '8':
      return '8B';
    case 'E':
      return 'E3';
    case '3':
      return '3E';
    default:
      return written.toUpperCase();
  }
}

interface WrittenToken {
  /** Each letter or digit as written (asWritten), one unit each. */
  readonly units: readonly string[];
  /** For a digit of another script that looks like a letter ("\u0667" like V), that letter: the unit is its value, and may be the letter too. */
  readonly alts: readonly (string | undefined)[];
  /** Whether each unit is a look-alike of another script. */
  readonly alike: readonly boolean[];
  /** Whether a unit is a look-alike of another script, read as its ASCII letter or digit. */
  readonly likened: boolean;
  /** Where each unit's code point starts and ends in the NFKC text. */
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

/** The runs of letters and digits of NFKC text as written, look-alikes read as ASCII, invisible characters dropped. */
function writtenTokens(normal: string): WrittenToken[] {
  const tokens: WrittenToken[] = [];
  let units: string[] = [];
  let alts: (string | undefined)[] = [];
  let alike: boolean[] = [];
  let starts: number[] = [];
  let ends: number[] = [];
  let likened = false;
  const close = () => {
    if (units.length > 0) tokens.push({ units, alts, alike, starts, ends, likened });
    units = [];
    alts = [];
    alike = [];
    starts = [];
    ends = [];
    likened = false;
  };
  let offset = 0;
  for (const codePoint of normal) {
    const start = offset;
    offset += codePoint.length;
    const code = codePoint.charCodeAt(0);
    if (code < 0x80) {
      // ASCII: a letter or a digit is itself, anything else ends the run (no regular expression per character).
      if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
        units.push(codePoint);
        alts.push(undefined);
        alike.push(false);
        starts.push(start);
        ends.push(offset);
      } else {
        close();
      }
      continue;
    }
    if (IGNORABLE.test(codePoint) || LONE_MARK.test(codePoint)) continue;
    const digit = DECIMAL_DIGIT.test(codePoint);
    const read = digit ? digitValue(codePoint) : asWritten(codePoint);
    if (read === '' || ![...read].every((unit) => WORD_CHARACTER.test(unit))) {
      close();
      continue;
    }
    const letter = digit ? LOOK_ALIKES.get(codePoint) : undefined;
    // A digit of another script is its value, as every digits view reads it: no look-alike.
    likened ||= !digit && [...read].some((unit) => unit.charCodeAt(0) < 0x80);
    for (const unit of read) {
      units.push(unit);
      alts.push(letter !== undefined && /^[A-Za-z]$/u.test(letter) ? letter.toUpperCase() : undefined);
      alike.push(!digit && unit.charCodeAt(0) < 0x80);
      starts.push(start);
      ends.push(offset);
    }
  }
  close();
  return tokens;
}

/** A combining mark as a code point of its own (NFKC composed it with no letter): dropped, as the views drop it. */
const LONE_MARK = /^\p{M}$/u;

const writtenDigit = (unit: string) => unit.length === 1 && unit >= '0' && unit <= '9';

/** What stands between two pieces of a name written in pieces: one or two of its joiners, or a hyphen at a line's end. */
const NAME_PIECE_GAP = new RegExp(`^(?:[${NAME_JOINERS}]{1,2}|[\\p{Pd}\\u2212][ \\t]{0,16}(?:\\r\\n|[\\n\\r])[ \\t]{0,16})$`, 'u');
/** What stands between two pieces of a member ID or claim number written in pieces: one or two of a number's joiners. */
const NUMBER_PIECE_GAP = new RegExp(`^[${NUMBER_JOINERS}]{1,2}$`, 'u');

/** Two written tokens as one. */
const joinedTokens = (a: WrittenToken, b: WrittenToken): WrittenToken => ({ units: [...a.units, ...b.units], alts: [...a.alts, ...b.alts], alike: [...a.alike, ...b.alike], starts: [...a.starts, ...b.starts], ends: [...a.ends, ...b.ends], likened: a.likened || b.likened });

/**
 * The forms the confusable reading looks for: five letters or digits or more, six for a number of digits alone. A form of
 * four is as often an ordinary token ("11am" for LIAM, "CO13" for COLE, "80th" for BOTH: the review of the build, B2-1).
 */
const confusableOf = (forms: readonly Form[]) => forms.flatMap((form) => { const units = [...form.compact]; return units.length >= (form.digitsOnly ? 6 : 5) ? [{ form, units }] : []; });

/** A date written with no space, a month's word and its day's or year's digits ("MAR13" is no MARIE, "10MAR2026", "JUL1326"): the token is the date. */
const MONTH_DAY_TOKEN = /^(?:[0-9]{1,2})?(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)(?:[0-9]{1,6})?$/iu;
const dateToken = (token: WrittenToken) => MONTH_DAY_TOKEN.test(token.units.join(''));

/**
 * How a window of a written token reads against a form of the same length: 'no' when it is not the form; 'same' when it
 * is the form as written; 'crossed' when every unit may be the form's (mayBe), half of them or more are the form's own, it
 * is not digits alone, and a digit stands for a letter or a letter for a digit in it.
 */
function confusedAs(token: WrittenToken, at: number, units: readonly string[]): 'no' | 'same' | 'crossed' {
  let own = 0;
  let letters = 0;
  let crossed = false;
  for (let i = 0; i < units.length; i += 1) {
    const written = token.units[at + i] ?? '';
    const wanted = units[i] ?? '';
    if (!mayBe(written).includes(wanted) && token.alts[at + i] !== wanted) return 'no';
    if (written.toUpperCase() === wanted) own += 1;
    const digit = writtenDigit(written);
    if (!digit) letters += 1;
    if (digit !== writtenDigit(wanted)) crossed = true;
  }
  if (own === units.length) return 'same';
  return crossed && own * 2 >= units.length && letters > 0 ? 'crossed' : 'no';
}

/**
 * The call's own name parts, member IDs and claim numbers written with a look-alike of the kind a scan makes (a digit for
 * a letter, a letter for a digit, l for I), as a word of their own ("S1MONE", "VANTR3E", "SYNMEMBERO042", "7654321O",
 * "ZZ765432l"): each such word, as a Found range of the form's kind.
 */
function confusedMatchesIn(tokens: readonly WrittenToken[], subject: Subject, normal: string): Found[] {
  const all = formsOf(subject);
  work(WORK.formCharacter * all.length * normal.length);
  const forms = confusableOf(all);
  const found: Found[] = [];
  if (forms.length === 0) return found;
  const longest = Math.max(...forms.map(({ units }) => units.length));
  const match = (token: WrittenToken, pieces: 'one' | 'name' | 'number') => {
    for (const { form, units } of forms) {
      if (units.length !== token.units.length || (pieces !== 'one' && (form.kind === 'name') !== (pieces === 'name'))) continue;
      // The form with a digit for a letter or a letter for a digit; or, as one word, the form itself spelled with another
      // script's look-alikes, whose two cases the fold reads as one letter where they look like two ("Zeph\u03C5ra" with a
      // small upsilon).
      const read = confusedAs(token, 0, units);
      if ((read === 'crossed' && !dateToken(token)) || (pieces === 'one' && read === 'same' && token.likened)) {
        // A match ef3e8d20 did not make: fresh.
        found.push({ start: token.starts[0] ?? 0, end: token.ends[token.ends.length - 1] ?? 0, kind: form.kind, claim: form.claim, fresh: true });
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < tokens.length; i += 1) {
    let merged = tokens[i];
    if (merged === undefined || match(merged, 'one')) continue;
    // Written in pieces, a joiner between them as the identifier's plain pattern reads one ("ZZ 765432l", "SYNCLAIM-OOO1",
    // "VAN-TR3E", a name wrapped after its hyphen): the pieces are read together (the review of the build, B1-11).
    // A piece of a name holds a letter: a word, a joiner and a number are no name ("Week-5" is no WEEKS, "Bill-13" no
    // BILLIE: the review of the fix round, C2-8).
    const lettered = (token: WrittenToken) => token.units.some((unit) => !writtenDigit(unit));
    let [named, numbered] = [lettered(merged), true];
    for (let j = i + 1; j < tokens.length && j <= i + 3 && merged.units.length < longest; j += 1) {
      const next = tokens[j];
      if (next === undefined) break;
      const gap = normal.slice(merged.ends[merged.ends.length - 1] ?? 0, next.starts[0] ?? 0);
      named &&= NAME_PIECE_GAP.test(gap) && lettered(next);
      numbered &&= NUMBER_PIECE_GAP.test(gap);
      if (!named && !numbered) break;
      merged = joinedTokens(merged, next);
      if ((named && match(merged, 'name')) || (numbered && match(merged, 'number'))) {
        i = j;
        break;
      }
    }
  }
  return found;
}

/**
 * The runs of letters and digits that hold one of the call's own identifiers so written inside them, where no boundary
 * can be read: with a digit for a letter or a letter for a digit ("2020S1MONE", "PaidVANTR3E"), or spelled as it is with
 * another script's look-alike among its letters ("150.00\u03BDantree": the review of the build, B1-10). The check refuses the
 * letter for one (confusedGlued), and no pattern takes a part of one first ("ZZ76S432197110" is no "ZZ76S[SSN]").
 */
function confusedGluedIn(tokens: readonly WrittenToken[], subject: Subject): Range[] {
  const forms = confusableOf(formsOf(subject));
  const ranges: Range[] = [];
  if (forms.length === 0) return ranges;
  for (const token of tokens) {
    const glued = forms.some(({ units }) => {
      for (let at = 0; units.length < token.units.length && at + units.length <= token.units.length; at += 1) {
        const read = confusedAs(token, at, units);
        if (read === 'crossed' && !dateToken(token)) return true;
        if (read === 'same' && token.alike.slice(at, at + units.length).some(Boolean)) return true;
      }
      return false;
    });
    if (glued) ranges.push({ start: token.starts[0] ?? 0, end: token.ends[token.ends.length - 1] ?? 0 });
  }
  return ranges;
}

const confusedGlued = (normal: string, subject: Subject): boolean => onFold('alike', () => confusedGluedIn(writtenTokens(normal), subject).length > 0);

/** What may lie between an initial and the name it belongs to: white space, apostrophes, dashes, "_" and VANISHED (after the name, a comma too). */
const INITIAL_GAP = /^[\s'‘’ʼʹˊ`´\p{Pd}−⁃_\u00AD]*$/u;
const INITIAL_GAP_AFTER = /^[\s'‘’ʼʹˊ`´\p{Pd}−⁃_\u00AD]*(?:,[\s\u00AD]*)?$/u;
const GAP_CHARACTER = /^[\s'‘’ʼʹˊ`´\p{Pd}−⁃_\u00AD,]$/u;

/**
 * The initials of the patient's name written next to a name (view ranges), to a fixed point, so
 * "J. Q. Vantree" takes both. An initial is a letter standing alone as a word, the first letter of a
 * part of the name, either
 * - before a name or a taken initial, past an optional "." and only white space, apostrophes or dashes
 *   ("J.Vantree", "J. Q. Vantree", "O’Brien"), or
 * - after one, past an optional comma, when "." follows it or no word written in lower case does
 *   ("Vantree, J.", "Vantree, J Q", never "Vantree, I am").
 * It is capitalized as written, or the name it is next to is written in lower case ("j. vantree").
 */
function initialsNextToNames(view: View, normal: string, names: readonly Range[], letters: ReadonlySet<string>): Range[] {
  const candidates: Range[] = [];
  for (let i = 0; i < view.text.length; ) {
    const codePoint = codePointAt(view.text, i);
    const end = i + codePoint.length;
    if (letters.has(codePoint) && !WORD_CHARACTER.test(codePointBefore(view.text, i)) && (end >= view.text.length || !WORD_CHARACTER.test(codePointAt(view.text, end)))) {
      candidates.push({ start: i, end });
    }
    i = end;
  }
  const written = (range: Range) => normal.slice(view.from[range.start] ?? 0, view.to[range.end - 1] ?? 0);
  const lowerCase = (range: Range) => written(range) === written(range).toLowerCase();
  // A candidate inside a name is part of it, never an initial.
  const depth = new Int32Array(view.text.length + 1);
  for (const name of names) {
    depth[name.start] = (depth[name.start] ?? 0) + 1;
    depth[name.end] = (depth[name.end] ?? 0) - 1;
  }
  for (let i = 1; i < depth.length; i += 1) {
    depth[i] = (depth[i] ?? 0) + (depth[i - 1] ?? 0);
  }
  const runStart = new Int32Array(view.text.length + 1);
  for (let i = 1; i <= view.text.length; i += 1) {
    runStart[i] = GAP_CHARACTER.test(view.text[i - 1] ?? '') ? (runStart[i - 1] ?? 0) : i;
  }
  const known = new Set([...names, ...candidates].map((range) => range.start));
  // The names nearest a position on each side. Where several start (or end) at one place, the shortest is
  // the nearest part, the one whose case the initial is read against ("p. aa, Patient" reads "aa").
  const byStart = [...names].sort((a, b) => a.start - b.start || a.end - b.end);
  const byEnd = [...names].sort((a, b) => a.end - b.end || a.start - b.start);
  const nameFrom = (position: number) => byStart[firstIndex(byStart, (range) => range.start >= position)];
  const nameUpTo = (position: number) => byEnd[firstIndex(byEnd, (range) => range.end > position) - 1];
  // A candidate is decided by the nearest taken range on each side. Only a letter-free gap counts, so a
  // candidate taken changes only its neighbouring candidates: they are looked at again, once each time.
  const taken = new Set<number>();
  const queue = candidates.map((_, index) => index);
  const queued = new Set(queue);
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] ?? 0;
    queued.delete(index);
    const candidate = candidates[index];
    if (candidate === undefined || taken.has(index) || (depth[candidate.start] ?? 0) > 0) {
      continue;
    }
    const cased = (next: Range) => capital(written(candidate)) || lowerCase(next);
    const dotted = view.text[candidate.end] === '.';
    const resume = candidate.end + (dotted ? 1 : 0);
    const after = taken.has(index + 1) ? candidates[index + 1] : undefined;
    const before = taken.has(index - 1) ? candidates[index - 1] : undefined;
    const name = nameFrom(resume);
    const earlier = nameUpTo(candidate.start);
    const following = after !== undefined && after.start >= resume && (name === undefined || after.start < name.start) ? after : name;
    const preceding = before !== undefined && (earlier === undefined || before.end > earlier.end) ? before : earlier;
    const precedes = following !== undefined && INITIAL_GAP.test(view.text.slice(resume, following.start)) && cased(following);
    const gapFrom = preceding === undefined ? 0 : preceding.end + (preceding === before && view.text[preceding.end] === '.' ? 1 : 0);
    const follows = preceding !== undefined && (runStart[candidate.start] ?? 0) <= gapFrom && INITIAL_GAP_AFTER.test(view.text.slice(gapFrom, candidate.start)) && cased(preceding) && (dotted || !beforeLowerCaseWord(view, normal, candidate.end, known));
    if (precedes || follows) {
      taken.add(index);
      for (const neighbour of [index - 1, index + 1]) {
        if (neighbour >= 0 && neighbour < candidates.length && !taken.has(neighbour) && !queued.has(neighbour)) {
          queue.push(neighbour);
          queued.add(neighbour);
        }
      }
    }
  }
  return candidates.filter((_, index) => taken.has(index));
}

/** The first index of a sorted list at which a monotone test holds (the list's length if it never does). */
function firstIndex<T>(list: readonly T[], test: (item: T) => boolean): number {
  work(WORK.search);
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (test(list[middle] as T)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/** Whether the next word after a view position is written in lower case and is neither a name nor a possible initial (known: their starts). */
function beforeLowerCaseWord(view: View, normal: string, position: number, known: ReadonlySet<number>): boolean {
  const space = /[\s\u00AD]*/uy;
  space.lastIndex = position;
  space.exec(view.text);
  const start = space.lastIndex;
  if (start >= view.text.length || !WORD_CHARACTER.test(codePointAt(view.text, start)) || known.has(start)) {
    return false;
  }
  return !capital(writtenAt(view, normal, start));
}

// ---------------------------------------------------------------------------------------------------
// Social Security and phone numbers by pattern (the founder's ruling of 2026-11-01; docs/adr/0054, amendment of 2026-11-04)
//
// A payer letter's Social Security numbers and phone numbers are redacted by pattern, wherever and whoever's they are, as
// [SSN] and [PHONE]: read on the letter's digits view (every decimal digit its value, R3), on both readings of an
// invisible run (VANISHED and a space, R4), in the same one pass and into the same found list as the call's own
// identifiers, which they rank below (a pattern span that is the call's own member ID or claim number takes its
// placeholder: 4.2, R6). Shaped numbers (3-2-4, 3-3-4 and "(AAA) EEE-LLLL", with dashes, periods, spaces, a wrapped line,
// one number joiner or an invisible run between groups) are redacted wherever they stand; a bare nine, ten, "1" and ten
// or a seven-digit local number is decided by the words before it (labels and keep-nouns, R5). The self-check also runs
// an independent survivor scan (survivorLeft), so a chain of nine to eleven digits that no pattern read refuses the
// letter rather than being sent (R7). Every pattern is a fixed sequence of bounded pieces, read once per start.

/** A dash as a pattern reads one: any dash, the minus sign, the hyphen bullet, U+02D7 and U+2796; one or two (R2). */
const PATTERN_DASH = '[\\p{Pd}\\u2212\\u2043\\u02D7\\u2796]{1,2}';
/** A line break with up to 16 spaces or tabs on each side: a PDF's wrapped line, with its indentation (R2a). */
const WRAP = `[ \\t]{0,16}${LINE_BREAK}[ \\t]{0,16}`;
/** Between two digits of a group: an invisible run, or (when a group may wrap) a line break, after an optional dash (R2b). */
const IN_GROUP_WRAP = `(?:\\u00AD|(?:${PATTERN_DASH})?${WRAP})`;
const digitGroup = (length: number, wrap: boolean) => `[0-9](?:${wrap ? IN_GROUP_WRAP : '\\u00AD'}?[0-9]){${String(length - 1)}}`;
/**
 * The number joiners (NUMBER_JOINERS) that are no white space, dash, VANISHED, ";" or double quote: what the call's own
 * number joins over since #75 (an underscore, a bar, a backslash, grouping apostrophes and primes, "~", middle dots and
 * bullets), so one of them between two groups of a shape is read too (step 0, A1). Never "/" (a date's), "," (an amount's
 * and a list's) or ";" (a list's): a chain written with one of those is left to the survivor scan.
 */
const SHAPE_JOINERS = "_|\\\\'\\u2018\\u2019\\u02BC\\u02B9\\u02CA\\u2032\\u2035`~\\u00B7\\u2027\\u2219\\u22C5\\u30FB\\u2022";
/**
 * A gap between two groups of a shape, captured by name so its kind is read: a dash with up to two spaces or a wrapped
 * line on each side, one to three spaces or tabs, a wrapped line, a period, one shape joiner, each with an optional
 * invisible run on either side, or an invisible run alone. A period or a joiner never sits in one match with white space
 * (R1a: "150.00 2026" is an amount and a year).
 */
const shapeGap = (name: string) => `(?<${name}>\\u00AD?(?:(?:[ \\t]{0,2}|${WRAP})${PATTERN_DASH}(?:[ \\t]{0,2}|${WRAP})|[ \\t]{1,3}|${WRAP}|\\.|[${SHAPE_JOINERS}])\\u00AD?|\\u00AD)`;
/**
 * No digit right before or after a match, an invisible run between them included (a VANISHED joins digits, as inside a
 * group): "Claim 12345<ZWSP>900-12-3456" is read on the space reading (R4), where the invisible run is a space. A
 * number that also holds an invisible run inside a group, after a digit and an invisible run, is read on neither: the
 * survivor scan refuses it.
 */
const NO_DIGIT_BEFORE = '(?<![0-9]\\u00AD?)';
const NO_DIGIT_AFTER = '(?!\\u00AD?[0-9])';
/** A HICN's beneficiary suffix: a letter and an optional letter or digit, attached or after one dash, ending a word (3.2.5). */
const HICN_SUFFIX = '(?:[\\p{Pd}\\u2212]?[A-Z][A-Z0-9]?(?![\\p{L}\\p{N}]))?';
/** An extension inside a phone's span: "x123", "ext. 45", "extension 6789", "#12", ", ext: 12" (3.3.2). */
const EXTENSION = '(?:[ \\t]{0,2}[,;]?[ \\t]{0,2}(?:EXT(?:ENSION)?|X|#)[.:]?[ \\t]{0,2}[0-9]{1,6})?';
/** A North American area code: no area code starts with 0 or 1 (3.3). */
const AREA = `[2-9](?:${IN_GROUP_WRAP})?[0-9](?:${IN_GROUP_WRAP})?[0-9]`;
/** A country prefix inside a phone's span: "+1", "+ 1" or "1" as a word of its own (never a HICN's "B1"), then an optional gap. */
const PHONE_PREFIX = `(?<prefix>\\+[ \\t]?1|(?<![\\p{L}\\p{N}])1)${shapeGap('g0')}?`;
/** A mask character of a masked SSN ("XXX-XX-3456", "***-**-3456", "###-##-3456", "___-__-3456"; R12). */
const MASK = '[X*#_\\u2022\\u25CF]';
const MASK_GAP = (name: string) => `(?<${name}>\\u00AD?(?:[ \\t]{0,2}${PATTERN_DASH}[ \\t]{0,2}|[ \\t]{1,3}|\\.)\\u00AD?)`;
/** A bare nine or ten is never one right after a currency sign, beside a decimal point or a comma with a digit (3.5). */
const BARE_GUARD_BEFORE = '(?<!\\p{Sc}[ \\t]?)(?<![0-9][.,])';
const BARE_GUARD_AFTER = '(?![.,][0-9])';

type PatternForm = 'shaped' | 'paren' | 'plus' | 'masked' | 'mask5' | 'nine' | 'ten' | 'local';

interface PatternDefinition {
  readonly pattern: RegExp;
  readonly kind: PatternKind;
  readonly form: PatternForm;
  /** A bare form whose groups may wrap across a line break: taken only after a label, with digit boundaries across a break (R2b, R2c). */
  readonly wrapped: boolean;
}

/** Each pattern, built once at module load; the shaped ones first, then the bare ones (whose label window ends at a shaped match). */
const SHAPED_PATTERNS: readonly PatternDefinition[] = [
  {
    pattern: new RegExp(`${NO_DIGIT_BEFORE}(?<area>${digitGroup(3, true)})${shapeGap('g1')}(?<exchange>${digitGroup(2, true)})${shapeGap('g2')}(?<line>${digitGroup(4, true)})(?<suffix>${HICN_SUFFIX})${NO_DIGIT_AFTER}`, 'gu'),
    kind: 'ssn',
    form: 'shaped',
    wrapped: false,
  },
  {
    pattern: new RegExp(`(?:(?<![\\p{L}\\p{N}])|(?<=SSN))${MASK}{3}${MASK_GAP('g1')}${MASK}{2}${MASK_GAP('g2')}(?<line>${digitGroup(4, true)})${NO_DIGIT_AFTER}`, 'gu'),
    kind: 'ssn',
    form: 'masked',
    wrapped: false,
  },
  {
    pattern: new RegExp(`(?:${PHONE_PREFIX}|${NO_DIGIT_BEFORE})(?<area>${AREA})${shapeGap('g1')}(?<exchange>${digitGroup(3, true)})${shapeGap('g2')}(?<line>${digitGroup(4, true)})(?<extension>${EXTENSION})${NO_DIGIT_AFTER}`, 'gu'),
    kind: 'phone',
    form: 'shaped',
    wrapped: false,
  },
  {
    pattern: new RegExp(`(?:${PHONE_PREFIX})?\\([ \\t]?(?<area>${AREA})[ \\t]?\\)(?:[ \\t]{0,2}|${WRAP})(?:${PATTERN_DASH}[ \\t]{0,2})?(?<exchange>${digitGroup(3, true)})(?:${shapeGap('g2')})?(?<line>${digitGroup(4, true)})(?<extension>${EXTENSION})${NO_DIGIT_AFTER}`, 'gu'),
    kind: 'phone',
    form: 'paren',
    wrapped: false,
  },
  {
    pattern: new RegExp(`\\+[ \\t]?(?:(?<prefix>1)${shapeGap('g0')}?)?(?<line>${digitGroup(10, false)})(?<extension>${EXTENSION})${NO_DIGIT_AFTER}`, 'gu'),
    kind: 'phone',
    form: 'plus',
    wrapped: false,
  },
];

const BARE_PATTERNS: readonly PatternDefinition[] = [
  ...[false, true].map((wrapped) => ({ pattern: new RegExp(`${NO_DIGIT_BEFORE}${BARE_GUARD_BEFORE}(?<line>${digitGroup(9, wrapped)})(?<suffix>${HICN_SUFFIX})${NO_DIGIT_AFTER}${BARE_GUARD_AFTER}`, 'gu'), kind: 'ssn' as const, form: 'nine' as const, wrapped })),
  ...[false, true].map((wrapped) => ({ pattern: new RegExp(`${NO_DIGIT_BEFORE}${BARE_GUARD_BEFORE}(?:(?<![\\p{L}\\p{N}])(?<prefix>1)${shapeGap('g0')}?)?(?<line>${digitGroup(10, wrapped)})(?<extension>${EXTENSION})${NO_DIGIT_AFTER}${BARE_GUARD_AFTER}`, 'gu'), kind: 'phone' as const, form: 'ten' as const, wrapped })),
  { pattern: new RegExp(`(?<![\\p{L}\\p{N}*#_\\u2022\\u25CF])${MASK}{5}(?<line>${digitGroup(4, false)})${NO_DIGIT_AFTER}`, 'gu'), kind: 'ssn', form: 'mask5', wrapped: false },
  { pattern: new RegExp(`(?<=^|[\\s:(\\u00AD])(?<exchange>${digitGroup(3, true)})${shapeGap('g1')}(?<line>${digitGroup(4, true)})(?<extension>${EXTENSION})${NO_DIGIT_AFTER}`, 'gu'), kind: 'phone', form: 'local', wrapped: false },
];

/** White space in a gap (a line break included: U+0085 is one). */
const SPACED = /[\s\u0085]/u;
/** A period or a shape joiner in a gap: never with white space in one match (R1a). */
const TIGHT = new RegExp(`[.${SHAPE_JOINERS}]`, 'u');
const CENTS_AFTER = /^[.,][0-9]{1,2}(?![0-9])/u;
/**
 * An amount's cents glued after a number's last digits: a point and one or two digits, nothing of a longer number after
 * them. A dash or a slash and a second amount with its cents, or a date written with slashes, with points or year first,
 * is a range and no longer number ("900-12-3456150.00-120.00", "900-12-3456150.00-1/2/2020"); a dash and other digits
 * is one ("20260112345.01-05-2026"). A comma there is as often the next field of a row ("20260112345,01/05/2026", "ICN
 * 12345678901,12345678902": the review of the fix round, C2-4).
 */
const CENTS_GLUED = new RegExp(
  `^\\.[0-9]{1,2}(?![0-9]|[.,][0-9]|[/\\p{Pd}\\u2212](?!${[
    // A second amount with its cents.
    '[0-9]+(?:,[0-9]{3})*\\.[0-9]{2}(?![0-9])',
    // A date written with slashes or points, or year first.
    '[0-9]{1,2}/[0-9]{1,2}/(?:[0-9]{4}|[0-9]{2})(?![0-9])',
    '[0-9]{1,2}\\.[0-9]{1,2}\\.(?:19|20)[0-9]{2}(?![0-9])',
    '(?:19|20)[0-9]{2}[/\\p{Pd}\\u2212][0-9]{1,2}[/\\p{Pd}\\u2212][0-9]{1,2}(?![0-9])',
  ].join('|')})[0-9])`,
  'u',
);
/** How far past a number's end CENTS_GLUED reads: the cents, a dash and a second amount. */
const CENTS_REACH = 24;

const CURRENCY_BEFORE = /\p{Sc}[ \t]?$/u;
const DIGIT = /^[0-9]$/u;
const DASH_UNIT = /^[\p{Pd}\u2212\u2043\u02D7\u2796]$/u;

/**
 * The digit across one line break from a view position (R2c), or -1: going back (`before`), indentation, the break,
 * indentation, up to two dashes and a digit; going on, up to two dashes, indentation,
 * the break, indentation and a digit. Read character by character, a fixed number of steps at most.
 */
function digitAcross(text: string, at: number, side: 'before' | 'after'): number {
  work(WORK.digitAcross);
  // Read by UTF-16 code, with no regular expression for ASCII: it runs for every wrapped candidate (review finding corr-ssn-2).
  const step = side === 'before' ? -1 : 1;
  let index = side === 'before' ? at - 1 : at;
  const dash = () => {
    for (let count = 0; count < 2 && dashCode(text.charCodeAt(index), text, index); count += 1) index += step;
  };
  if (side === 'after') dash();
  for (let count = 0; count < 16 && indentCode(text.charCodeAt(index)); count += 1) index += step;
  const code = text.charCodeAt(index);
  if (!breakCode(code)) return -1;
  // CRLF is one break.
  index += code === (side === 'before' ? 0x0a : 0x0d) && text.charCodeAt(index + step) === (side === 'before' ? 0x0d : 0x0a) ? 2 * step : step;
  for (let count = 0; count < 16 && indentCode(text.charCodeAt(index)); count += 1) index += step;
  if (side === 'before') dash();
  const digit = text.charCodeAt(index);
  return digit >= 0x30 && digit <= 0x39 ? index : -1;
}

const indentCode = (code: number) => code === 0x20 || code === 0x09;
const breakCode = (code: number) => code === 0x0a || code === 0x0d || code === 0x0c || code === 0x0b || code === 0x85 || code === 0x2028 || code === 0x2029;
/** DASH_UNIT by code: "-" at once, any other ASCII never, the rest by the class. */
const dashCode = (code: number, text: string, index: number) => (code === 0x2d ? true : code < 0x80 || Number.isNaN(code) ? false : DASH_UNIT.test(text[index] ?? ''));

/** An NPI's check digit: the Luhn check over the 80840 prefix and the first nine digits. */
function npiCheckDigitValid(ten: string): boolean {
  if (!/^[0-9]{10}$/u.test(ten)) {
    return false;
  }
  const payload = `80840${ten.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    let digit = Number.parseInt(payload[payload.length - 1 - i] ?? '0', 10);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10 === Number.parseInt(ten[9] ?? '', 10);
}

// Labels and keep-nouns (section 3.4, R5, step 0's A7 and A8), on the folded (upper-case) view. A word counts when it ends
// within LABEL_REACH characters of the number, inside the label window (labelWindow).
const LABEL_REACH = 24;
const LABEL_WINDOW = 64;
/** Words that say a bare number is a Social Security number: SSN, S.S.N., SS#, SS NO, SOC SEC, SOCIAL SECURITY, HIC, HICN. */
const SSN_LABEL = /(?<![\p{L}\p{N}])(?:S\.?[ \t]?S\.?[ \t]?N|SS[ \t]?#|SS[ \t]?NO|SOC(?:IAL)?\.?[ \t]*SEC(?:URITY)?|HICN?)(?!\p{L})/gu;
/** "Medicare" says a bare nine is a Social Security number (a HICN's base), never a ten (R5d). */
const MEDICARE_LABEL = /(?<![\p{L}\p{N}])MEDICARE(?!\p{L})/gu;
/** Words that say a bare number is a phone number. */
const PHONE_LABEL = /(?<![\p{L}\p{N}])(?:PHONES?|PH|TEL(?:EPHONE)?S?|FAX(?:ES)?|FACSIMILE|CALL(?:ING|ED|S)?|TTY|TDD|TOLL[\p{Pd}\u2212]?[ \t]?FREE|CELL|MOBILE|CONTACT(?:S|ED|ING)?)(?!\p{L})/gu;
/**
 * The Social Security labels glued to the word before them by a lost space ("PatientSSN", "PATIENTSSN",
 * "PatientSocialSecurityNumber"), read by the survivor scan in every letter; never "Assn" or "ISSN". The phone labels are
 * not read so: words end in them ("Fairfax", "smartphone").
 */
const GLUED_LONG_LABEL = /(?<=\p{L})(?:(?<!(?<!\p{L})[AI])S\.?S\.?N\.?|SOC(?:IAL)?\.?[ \t]*SEC(?:URITY)?|HICN)(?:S|[ \t]?(?:NO|NUMBERS?|NBR|NUM))?(?!\p{L})/gu;

/**
 * Where a Social Security label that words end in ("SS#", "SS No", "HIC": "Class#", "Address No", "Graphic") is glued to
 * the word before it and a change of case sets it apart ("PatientSS# 900.12 3456", "PatientHIC"): the scan reads it with a
 * space there. In capitals throughout no boundary can be read, and it stays unread (the review of the build, B1-6).
 */
const CASE_GLUED_LABEL = /(?<=\p{Ll})(?=SS[ \t]?#|SS[ \t]?N[Oo]\b|HIC\b)/gu;
/** SSN_LABEL and PHONE_LABEL glued to the word before them by a lost space ("PaidSSN", "PatientPhone"): read only in a letter whose chain only held barriers hold (survivorIn). */
const GLUED_PERSON_LABELS = [SSN_LABEL, PHONE_LABEL].map((label) => new RegExp(label.source.replace('(?<![\\p{L}\\p{N}])', '(?<!\\p{N})'), 'gu'));
/** Nouns that name a bare number as something that is no person's SSN or phone: a claim's, a reference's, an NPI ... */
const KEEP_NOUN = /(?<![\p{L}\p{N}])(?:CLAIMS?|ICN|DCN|REFERENCE|REF|APPEAL|CASE|NPI|TIN|EIN|TAX[ \t]?ID(?:ENTIFICATION)?|CHECK|EFT|TRACE|CONTROL|INVOICE|AUTHORIZATION|AUTH|ZIP|GROUP)(?!\p{L})/gu;
/**
 * What may stand between a keep-noun and the number it names (R5a, A8): white space, ":", "#", "-" and any dash, ".", "*"
 * (Markdown bold), "=", "(" and the opening quotes, "(S)", and the words NO, NUMBER, NUMBERS, NBR, NUM and ID, in any order;
 * and one "," at most.
 */
const CONNECTORS = /^(?:\(S\)|[\s\u0085\u00AD:#.*=\p{Pd}\u2212(,"'\u201C\u2018]|(?<![\p{L}\p{N}])(?:NO|NUMBERS?|NBR|NUM|ID)(?!\p{L}))*$/u;
/** A full stop, "!" or "?" before white space: a sentence's end, which ends a keep-noun's naming (A7). */
const SENTENCE_END = /[.!?](?=[\s\u0085])/gu;
/** An abbreviation whose own full stop does not end the naming: "Ref. No. 2025550123", "Claim no. 900123456" (A7). */
const ABBREVIATION = /(?<![\p{L}\p{N}])(?:NO|NBR|NUM|REF)$/u;

type Decision = 'keep' | 'ssn' | 'phone' | 'none';

/** Whether a keep-noun names the number after it: nothing but connectors between them, one comma at most, and no sentence end but an abbreviation's (R5a, A7, A8). */
function namesNumber(window: string, noun: RegExpExecArray): boolean {
  const from = noun.index;
  const rest = window.slice(from + noun[0].length);
  if (!CONNECTORS.test(rest) || (rest.match(/,/gu) ?? []).length > 1) {
    return false;
  }
  const named = window.slice(from);
  for (const stop of named.matchAll(SENTENCE_END)) {
    if (stop[0] !== '.' || !ABBREVIATION.test(named.slice(0, stop.index))) {
      return false;
    }
  }
  return true;
}

/**
 * What the words before a bare number say it is (R5): a keep-noun that names it keeps it, and always keeps a Luhn-valid ten
 * named by NPI and a nine named by TIN, EIN or TAX ID; otherwise an SSN or phone label in the window decides, the nearer of
 * the two, over a keep-noun (a phone label never keeps a nine, and an SSN label makes a ten [SSN]); "Medicare" labels a
 * nine only; no word leaves it to the unlabeled rules ('none').
 */
function decideBare(window: string, length: number, digits: string): Decision {
  if (!/\p{L}/u.test(window)) {
    // No word at all (a window of white space and punctuation): nothing names the number.
    return 'none';
  }
  const lastNear = (pattern: RegExp): RegExpExecArray | null => {
    let last: RegExpExecArray | null = null;
    for (const match of window.matchAll(pattern)) {
      if (window.length - (match.index + match[0].length) <= LABEL_REACH) {
        last = match;
      }
    }
    return last;
  };
  const end = (match: RegExpExecArray | null) => (match === null ? -1 : match.index + match[0].length);
  const noun = lastNear(KEEP_NOUN);
  const named = noun !== null && namesNumber(window, noun);
  if (named) {
    if (length === 10 && noun[0] === 'NPI' && npiCheckDigitValid(digits)) {
      return 'keep';
    }
    if (length === 9 && /^(?:TIN|EIN|TAX[ \t]?ID(?:ENTIFICATION)?)$/u.test(noun[0])) {
      return 'keep';
    }
  }
  const ssn = Math.max(end(lastNear(SSN_LABEL)), length === 9 ? end(lastNear(MEDICARE_LABEL)) : -1);
  const phone = end(lastNear(PHONE_LABEL));
  if (ssn >= 0 || phone >= 0) {
    return ssn >= phone || length === 9 ? 'ssn' : 'phone';
  }
  return named ? 'keep' : 'none';
}

/** What the call's own identifier's placeholder becomes for the survivor scan: a BARRIER to every reader but the label window, which reads through it. */
const OWN_MARK = '\u0003';
/** An SSN, phone or Medicare label right before a number: a number word or two, a sign or two or one line break between them too ("Phone #:", "Medicare ID No."), and an opening parenthesis; no other word. */
const LABEL_RIGHT_BEFORE = new RegExp(`(?:${SSN_LABEL.source}|${PHONE_LABEL.source}|${MEDICARE_LABEL.source})\\.?(?:[ \\t]{0,2}(?:NOS?|NUMBERS?|NBR|NUM|ID)\\b\\.?){0,2}[ \\t]{0,2}[:#\\p{Pd}\\u2212]{0,2}[ \\t]{0,2}(?:(?:\\r\\n|[\\n\\r])[ \\t]{0,2})?(?:\\([ \\t]?)?$`, 'u');
/** After a label's own list number: ":" or ")", an ordinal's suffix or a space before it too ("1:", "2)", "1st:", "1 :"). */
const LIST_NUMBER_AFTER = /^(?:ST|ND|RD|TH)?[ \t]?(?:\([^()\r\n]{1,16}\)[ \t]?)?[:)]/u;
/** An SSN or phone label right before its own list number: a number word, a sign or one line break between them too, and an opening parenthesis. */
const PERSON_LABEL_BEFORE = new RegExp(`(?:${SSN_LABEL.source}|${PHONE_LABEL.source})\\.?(?:[ \\t]{0,2}(?:NOS?|NUMBERS?|NBR|NUM)\\b\\.?)?[ \\t]{0,2}[:#\\p{Pd}\\u2212]?[ \\t]{0,2}(?:(?:\\r\\n|[\\n\\r])[ \\t]{0,2})?(?:\\([ \\t]?)?$`, 'u');
/**
 * Whether the digits at [first, end) are a label's own list number ("Phone 1: 555-0100", "Fax No. 2) ...", "Phone (2)
 * 555-0100"): one or two digits right after an SSN or phone label. In parentheses, a space inside them or an ordinal's
 * suffix too, they are one whatever follows ("SSN (2). 150.00 120.00 30.00" is read as ef3e8d20 reads "SSN. 150.00
 * 120.00 30.00"); with none they need their colon or closing parenthesis: a digit and a space are as often the number's
 * own first ("Phone 1 800 555 0199", "Phone #1 800 ..."). The label reads through it, and it is no digit of the number
 * the label names (the scan starts no chain in it: the review of the last round's delta, E2-1).
 */
function listNumberAt(text: string, first: number, end: number): boolean {
  if (end - first > 2) return false;
  const after = text.slice(end, end + 24);
  const opened = /\([ \t]?$/u.test(text.slice(Math.max(0, first - 2), first));
  if (!(opened ? /^(?:ST|ND|RD|TH)?[ \t]?\)/u.test(after) : LIST_NUMBER_AFTER.test(after))) return false;
  return PERSON_LABEL_BEFORE.test(text.slice(Math.max(0, first - 40), first));
}
const LINE_BREAK_CHARACTER = /^[\n\r\f\v\u0085\u2028\u2029]$/u;

/**
 * The label window before a bare number at a view position (3.4): up to LABEL_WINDOW characters back, ending at a
 * position `stops` (the last match already found), a BARRIER, a digit, or a second line break. The survivor scan reads it
 * further (`read`): with `spanned` (its reading of SEC-5's label over the numbers before an amount: review GATEWAY1-2), a
 * digit of a date, an amount or a currency amount (where `spanned` holds) is read through, and so is any other digit until
 * a letter or such a span has been read: the amount's own run of plain numbers ("SSN 9001 2.34 56"), never a number past
 * a word or a span, as a phone word's own is to the amount in "TTY 711. Paid 150.00 2026" and to 120.00 in "TTY
 * 711\n150.00 120.00" (re-review GATEWAY1-1); with `spansOnly` as well, no plain digit is read through (review
 * GATEWAY2-1).
 */
function labelWindow(text: string, start: number, stops: (index: number) => boolean, read: { readonly spanned?: (index: number) => boolean; readonly spansOnly?: boolean; readonly through?: boolean; readonly own?: (index: number) => boolean; readonly skipped?: { any: boolean } } = {}): string {
  work(WORK.labelWindow);
  // `skipped.any` is set where the window read through the call's own identifier or a list number: ef3e8d20's window ended there.
  const { spanned, spansOnly = false, through = false, own, skipped } = read;
  let from = start;
  let breaks = 0;
  // Whether a letter, or a digit where `spanned` holds, has been read since the start: past one, a plain digit ends the window.
  let passed = false;
  // The window as read: the call's own identifier and a label's own list number are read through, each as a space.
  const units: string[] = [];
  while (from > 0 && units.length < LABEL_WINDOW) {
    const index = from - 1;
    const character = text[index] ?? '';
    const digit = DIGIT.test(character);
    const inSpan = digit && spanned !== undefined && spanned(index);
    // The call's own identifier (its placeholder in masked text) between a label and its number: the label reads the text
    // as it reads it with the identifier gone, across the one line break a label reads too ("Call Zephyra at 555-0123",
    // "Phone (Jane Zephyra, home): 555.0123", "SSN (Jane Zephyra, patient): 90012-3456", "Phone Zephyra\n555-0123" as "Call
    // at 555-0123", "Phone (home): 555.0123", "SSN (patient): 90012-3456", "Phone\n555-0123").
    if (through && (character === OWN_MARK || (own !== undefined && own(index)))) {
      if (units[units.length - 1] !== ' ') units.push(' ');
      from = index;
      if (skipped !== undefined) skipped.any = true;
      continue;
    }
    if (through && digit && !inSpan) {
      // A label's own list number is read through (listNumberAt).
      let first = index;
      while (first > 0 && DIGIT.test(text[first - 1] ?? '')) first -= 1;
      if (listNumberAt(text, first, index + 1)) {
        units.push(' ');
        from = first;
        if (skipped !== undefined) skipped.any = true;
        continue;
      }
    }
    if (stops(index) || character === BARRIER || character === OWN_MARK || (digit && !inSpan && (spanned === undefined || passed || spansOnly))) {
      break;
    }
    if (inSpan || (!digit && /\p{L}/u.test(character))) {
      passed = true;
    }
    if (LINE_BREAK_CHARACTER.test(character) && !(character === '\r' && text[index + 1] === '\n')) {
      breaks += 1;
      if (breaks > 1) {
        break;
      }
    }
    units.push(character);
    from = index;
  }
  return units.reverse().join('');
}

const WORD_UNIT = /^[\p{L}\p{N}]$/u;

/** What stands between two numbers of one list: a comma, "and", "or" or "&", or a comma and one of them (review round 2, finding 3). */
const LIST_JOINER = /^[ \t]*(?:,[ \t]*(?:(?:AND|OR|&)[ \t]+)?|(?:AND|OR|&)[ \t]+)$/u;
/** How many numbers back a list is followed to the noun that names it: a bound, so a letter of lists stays linear. */
const LIST_REACH = 16;

/**
 * decideBare, with a list (R5a, review round 2, finding 3): a number whose own words decide nothing ('none') and that
 * follows another number, a match already found or a placeholder, across a list joiner alone ("Claim numbers 900123456 and 900123457",
 * "Reference 2025550123, 2025550124") is kept when the list's first number that its words decide is kept; a label
 * inside the list ("Claim 900123456 and SSN 900551234"), any other word or a sentence end ends the list, and a list
 * after an SSN or phone label is no keep.
 */
function decideNamed(text: string, start: number, stops: (index: number) => boolean, length: number, digits: string, through = false, own?: (index: number) => boolean): Decision {
  // The number's own words, read through the call's own identifier and a label's list number where asked; a list is followed
  // back on the words as they stand.
  const decision = decideBare(labelWindow(text, start, stops, { through, own }), length, digits);
  let at = start;
  for (let hop = 0; decision === 'none' && hop < LIST_REACH; hop += 1) {
    const window = labelWindow(text, at, stops);
    const end = at - window.length;
    if (!LIST_JOINER.test(window)) {
      break;
    }
    // The item before the joiner: a match already found (the call's own claim, "Claim SYNCLAIM0001 and 900123457"), a
    // placeholder (the BARRIER of masked text, where the check reads that claim) or a run of digits, standing as a word.
    const unit = text[end - 1] ?? '';
    const inItem = end > 0 && stops(end - 1) ? stops : unit === BARRIER || unit === OWN_MARK ? (index: number) => text[index] === unit : (index: number) => DIGIT.test(text[index] ?? '');
    if (!inItem(end - 1)) {
      break;
    }
    let from = end - 1;
    while (from > 0 && inItem(from - 1)) from -= 1;
    if (from > 0 && WORD_UNIT.test(text[from - 1] ?? '')) {
      break;
    }
    const item = text.slice(from, end);
    const named = decideBare(labelWindow(text, from, stops), item.length, item);
    if (named !== 'none') {
      return named === 'keep' ? 'keep' : decision;
    }
    at = from;
  }
  return decision;
}

/** The token written against a view range on one side, joined as letterJoins reads it: its start (or end) and compact form. */
function tokenBeside(text: string, start: number, end: number, side: 'before' | 'after'): { readonly at: number; readonly compact: string } | null {
  if (side === 'before') {
    let gap = start;
    while (gap > 0 && start - gap < 8 && !WORD_UNIT.test(text[gap - 1] ?? '')) gap -= 1;
    let token = gap;
    while (token > 0 && gap - token < 40 && WORD_UNIT.test(text[token - 1] ?? '')) token -= 1;
    const left = text.slice(token, gap);
    const between = text.slice(gap, start);
    return left !== '' && (between === '' || letterJoins(between, left, text.slice(start, end))) ? { at: token, compact: compactFolded(left) } : null;
  }
  let gap = end;
  while (gap < text.length && gap - end < 8 && !WORD_UNIT.test(text[gap] ?? '')) gap += 1;
  let token = gap;
  while (token < text.length && token - gap < 40 && WORD_UNIT.test(text[token] ?? '')) token += 1;
  const right = text.slice(gap, token);
  const between = text.slice(end, gap);
  return right !== '' && (between === '' || letterJoins(between, text.slice(start, end), right)) ? { at: token, compact: compactFolded(right) } : null;
}

/** The call's own member IDs and claims' numbers by compact form, the lowest rank winning (a claim before a member, the lowest claim first): what a pattern span that is the call's own takes (4.2). */
function ownNumbers(subject: Subject): Map<string, { readonly kind: 'claim' | 'member'; readonly claim: number }> {
  const own = new Map<string, { readonly kind: 'claim' | 'member'; readonly claim: number }>();
  for (const form of formsOf(subject)) {
    if (form.kind !== 'claim' && form.kind !== 'member') {
      continue;
    }
    const held = own.get(form.compact);
    if (held === undefined || RANK[form.kind] < RANK[held.kind] || (form.kind === 'claim' && held.kind === 'claim' && form.claim < held.claim)) {
      own.set(form.compact, { kind: form.kind, claim: form.claim });
    }
  }
  return own;
}

/** A compact the screen may be offered: a digit, five characters or more (identifierCandidates' own rule). */
const offerable = (compact: string) => /[0-9]/u.test(compact) && compact.length >= 5;

/**
 * Every Social Security and phone number of NFKC text (sections 3, 4.2 and 17), as Found ranges: the call's own kind when
 * the match (whole, its core digits, or joined to the token written against it) is one of the call's own numbers, the
 * range then reaching over that token (R6c); else 'ssn' or 'phone', with the compact forms the one-patient screen is
 * offered (R6a). `found` holds the matches already found (the call's own), where a bare number's label window ends.
 */
function patternMatchesIn(normal: string, found: readonly Found[], subject: Subject): Found[] {
  const own = ownNumbers(subject);
  const covered = new Int32Array(normal.length + 1);
  for (const match of found) {
    covered[match.start] = (covered[match.start] ?? 0) + 1;
    covered[match.end] = (covered[match.end] ?? 0) - 1;
  }
  for (let i = 1; i < covered.length; i += 1) {
    covered[i] = (covered[i] ?? 0) + (covered[i - 1] ?? 0);
  }
  // The call's own matches, as they stood before any pattern match: a label is read through one to its number (labelWindow).
  const ownAt = covered.slice();
  const results: Found[] = [];
  const cover = (range: Range) => {
    for (let i = range.start; i < range.end; i += 1) {
      covered[i] = Math.max(1, covered[i] ?? 0);
    }
  };
  /**
   * Whether a match with a group wrapped across a line break reads into another number (R2c): a match already found
   * runs over its start or its end (it holds part of that number), or a digit lies across a line break on either side
   * that no match already found holds.
   */
  const wrappedAcross = (view: View, start: number, end: number) => {
    const stops = (index: number) => (covered[view.from[index] ?? 0] ?? 0) > 0;
    const range = inNormal(view, start, end);
    const at = (index: number) => (covered[index] ?? 0) > 0;
    if ((range.start > 0 && at(range.start - 1) && at(range.start)) || (at(range.end - 1) && at(range.end))) {
      return true;
    }
    const before = digitAcross(view.text, start, 'before');
    const after = digitAcross(view.text, end, 'after');
    return (before >= 0 && !stops(before)) || (after >= 0 && !stops(after));
  };
  /** The match's readings: whole, its core digits, and joined to the token written against it on either side (R6c). */
  const readingsOf = (view: View, start: number, end: number, core: string) => {
    const whole = compactFolded(view.text.slice(start, end));
    const before = tokenBeside(view.text, start, end, 'before');
    const after = tokenBeside(view.text, start, end, 'after');
    const readings: { readonly compact: string; readonly from: number; readonly to: number }[] = [
      { compact: whole, from: start, to: end },
      { compact: core, from: start, to: end },
    ];
    for (const middle of [whole, core]) {
      if (before !== null) readings.push({ compact: before.compact + middle, from: before.at, to: end });
      if (after !== null) readings.push({ compact: middle + after.compact, from: start, to: after.at });
      if (before !== null && after !== null) readings.push({ compact: before.compact + middle + after.compact, from: before.at, to: after.at });
    }
    return readings;
  };
  /** A match that is the call's own number takes its kind, over the token it is joined to (4.2, R6c): true when it was. */
  // `fresh`: the match was read under a label through the call's own identifier or a list number, so ef3e8d20 did not make
  // it, whoever's number it turns out to be (the review of the fix round's fuzzer, a member ID after "SSN 1:").
  const pushOwn = (view: View, readings: readonly { readonly compact: string; readonly from: number; readonly to: number }[], fresh = false) => {
    const mine = readings.find((reading) => own.has(reading.compact));
    const held = mine === undefined ? undefined : own.get(mine.compact);
    if (mine === undefined || held === undefined) {
      return false;
    }
    const reach = inNormal(view, mine.from, mine.to);
    results.push({ ...reach, kind: held.kind, claim: held.claim, ...(fresh ? { fresh: true } : {}) });
    cover(reach);
    return true;
  };
  const push = (view: View, start: number, end: number, kind: PatternKind, core: string, form: PatternForm, fresh = false) => {
    const readings = readingsOf(view, start, end, core);
    if (pushOwn(view, readings, fresh)) {
      return;
    }
    const range = inNormal(view, start, end);
    const compacts = form === 'masked' || form === 'mask5' ? [] : [...new Set(readings.map((reading) => reading.compact).filter(offerable))];
    results.push({ ...range, kind, claim: 0, compacts, ...(fresh ? { fresh: true } : {}) });
    cover(range);
  };
  // The space reading only where it differs from the join reading: a letter with no invisible run is read once (review finding corr-ssn-2).
  const join = viewOf(normal, 'join', true);
  const views = join.emptied ? [join, viewOf(normal, 'space', true)] : [join];
  for (const view of views) {
    for (const { pattern, kind, form } of SHAPED_PATTERNS) {
      const matcher = new RegExp(pattern.source, pattern.flags);
      for (let match = matcher.exec(view.text); match !== null; match = matcher.exec(view.text)) {
        const start = match.index;
        const end = start + match[0].length;
        const groups = match.groups ?? {};
        const gaps = [groups.g0, groups.g1, groups.g2].filter((gap): gap is string => gap !== undefined);
        const spaced = gaps.some((gap) => SPACED.test(gap));
        const tight = gaps.some((gap) => TIGHT.test(gap) && !SPACED.test(gap));
        const before = view.text.slice(Math.max(0, start - 2), start);
        const rejected =
          (form === 'shaped' && spaced && tight) ||
          (form !== 'masked' && CURRENCY_BEFORE.test(before)) ||
          (form === 'shaped' && spaced && (/[0-9][.,]$/u.test(before) || CENTS_AFTER.test(view.text.slice(end, end + 4)))) ||
          // A group wrapped across a line break takes R2(c)'s boundaries, as a wrapped bare number does, so its first or last
          // group is never another line's number ("555-01 01\\n20\\n    0-555-0100" is no SSN ending in "0120").
          ([groups.area, groups.exchange, groups.line].some((group) => SPACED.test(group ?? '')) && wrappedAcross(view, start, end));
        if (rejected) {
          matcher.lastIndex = start + 1;
          continue;
        }
        const core = [groups.area, groups.exchange, groups.line].join('').replace(/[^0-9]/gu, '');
        push(view, start, end, kind, core, form);
      }
    }
  }
  views.forEach((view, reading) => {
    const stops = (index: number) => (covered[view.from[index] ?? 0] ?? 0) > 0;
    const own = (index: number) => (ownAt[view.from[index] ?? 0] ?? 0) > 0;
    // A group wrapped across a line break is read on the join reading only: on the space reading an invisible run is a
    // space, which would end such a group one digit past a break ("90000\n0000 \n2<ZWSP>00-555-0101").
    for (const { pattern, form, wrapped } of BARE_PATTERNS.filter((definition) => reading === 0 || !definition.wrapped)) {
      const matcher = new RegExp(pattern.source, pattern.flags);
      for (let match = matcher.exec(view.text); match !== null; match = matcher.exec(view.text)) {
        const start = match.index;
        const end = start + match[0].length;
        const groups = match.groups ?? {};
        // A wrapped form that crosses no break, or reads into another number, is no match: known before its label window is read.
        if (wrapped && (!SPACED.test(groups.line ?? '') || wrappedAcross(view, start, end))) {
          matcher.lastIndex = start + 1;
          continue;
        }
        const core = (groups.line ?? '').replace(/[^0-9]/gu, '');
        // The call's own number, however the words before it read, takes its placeholder (4.2).
        if (form !== 'mask5' && form !== 'local' && pushOwn(view, readingsOf(view, start, end, core))) {
          continue;
        }
        const takenAs = (decision: Decision): PatternKind | null => {
          const labeled = decision === 'ssn' || decision === 'phone';
          if (wrapped) {
            // A group wrapped across a line break: only after a label, never across another break on either side (R2b, R2c;
            // wrappedAcross, above: "90000\n0000 \n2\r\n  02-555-0123").
            return labeled ? decision : null;
          }
          if (form === 'nine') {
            return decision === 'keep' ? null : 'ssn';
          }
          if (form === 'ten') {
            const glued = groups.prefix !== undefined && groups.g0 === undefined;
            return decision === 'keep' ? null : labeled ? decision : glued ? null : /^[3-9]/u.test(core) || (core.startsWith('2') && !npiCheckDigitValid(core)) ? 'phone' : null;
          }
          if (form === 'mask5') {
            return decision === 'ssn' ? 'ssn' : null;
          }
          return labeled ? decision : null;
        };
        const plainly = decideNamed(view.text, start, stops, form === 'local' ? 7 : core.length, core);
        let taken = takenAs(plainly);
        // A label read through the call's own identifier or its list number ("Call Zephyra at 555-0123", "Phone 1:
        // 555-0100") takes a number its own words say nothing of and that is not taken without it, never one wrapped across
        // a line break (its other half is as often the next line's amount: "Tel 7: is 802\n8185.55"); a number a noun names
        // stays named. ef3e8d20 did not make this match, so it is marked fresh: the letter reader applies it only in a
        // letter the scan does not refuse without it (appliedMatches), whatever is joined to the number ("Call Zephyra at
        // 555-0123/555-0124" stays refused whole).
        let fresh = false;
        if (taken === null && plainly === 'none' && !wrapped) {
          const through = decideNamed(view.text, start, stops, form === 'local' ? 7 : core.length, core, true, own);
          taken = through === 'ssn' || through === 'phone' ? takenAs(through) : null;
          fresh = taken !== null;
        }
        if (taken === null) {
          matcher.lastIndex = start + 1;
          continue;
        }
        push(view, start, end, taken, core, form, fresh);
      }
    }
  });
  return results;
}

// The survivor scan (R7, with step 0's A2 and A3): written apart from the patterns, so a form the patterns miss is refused.

/**
 * The scan's joiners (one between two groups): one or two dashes, ".", "(", ")", "/", every non-white number joiner (mirrors
 * NUMBER_JOINERS, written here on its own), ";" with no white space after it, and the dash-, slash- and comma-like marks NFKC
 * leaves as they are (U+30FC katakana prolonged sound mark, U+2053 swung dash, U+02C9 modifier macron, U+2215 division slash,
 * U+2044 fraction slash, U+3001 ideographic comma: review finding SEC-6).
 */
const SCAN_JOINER = "[\\p{Pd}\\u2212\\u2043\\u02D7\\u2796]{1,2}|[./()_|\\\\'\\u2018\\u2019\\u02BC\\u02B9\\u02CA\\u2032\\u2035`~\\u00B7\\u2027\\u2219\\u22C5\\u30FB\\u2022\"\\u201C\\u201D\\u30FC\\u2053\\u02C9\\u2215\\u2044\\u3001]|;(?![\\s\\u0085])";
/** White space in a chain's gap: up to sixteen spaces or tabs (a justified or column-aligned PDF line: SEC-2), or one line break (a form feed and a vertical tab are ones: SEC-3) with up to sixteen on each side. */
const SCAN_SPACE = `[ \\t]{0,16}(?:(?:\\r\\n|[\\n\\r\\f\\v\\u0085\\u2028\\u2029])[ \\t]{0,16})?`;
/** What joins two digit groups into one chain: white space (SCAN_SPACE), with at most one joiner. */
const SCAN_GAP = new RegExp(`^${SCAN_SPACE}(?:(?:${SCAN_JOINER})${SCAN_SPACE})?$`, 'u');
/** Under an SSN or phone label a comma joins two groups too ("SSN 900,12 3456"); elsewhere it is an amount's or a list's. */
const SCAN_LABELED_GAP = new RegExp(`^${SCAN_SPACE}(?:(?:${SCAN_JOINER}|,)${SCAN_SPACE})?$`, 'u');
const SCAN_JOINER_CHARACTER = /^[\p{Pd}\u2212\u2043\u02D7\u2796./()_|\\'\u2018\u2019\u02BC\u02B9\u02CA\u2032\u2035`~\u00B7\u2027\u2219\u22C5\u30FB\u2022"\u201C\u201D;\u30FC\u2053\u02C9\u2215\u2044\u3001]$/u;
const SCAN_DASH = /^[\p{Pd}\u2212\u2043\u02D7\u2796]$/u;
const SCAN_DIGIT = /^[0-9]$/u;
const CURRENCY_AMOUNT = /\p{Sc}[ \t]?[0-9][0-9,]*(?:\.[0-9]{1,2})?/gu;
const UNSIGNED_AMOUNT = /(?<![0-9])(?:[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+[.,][0-9]{1,2})(?![0-9])/gu;
/** A money amount as a service-line row writes one: dollars with no leading zero (or 0), comma thousands or none, and cents. */
const MONEY_AMOUNT = /^(?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]*)\.[0-9]{2}$/u;

/** Whether a non-white joiner joins the text at a position to a digit group on its left (A3). */
function joinedLeft(text: string, at: number): boolean {
  let index = at - 1;
  if (!SCAN_JOINER_CHARACTER.test(text[index] ?? '')) {
    return false;
  }
  if (SCAN_DASH.test(text[index] ?? '') && SCAN_DASH.test(text[index - 1] ?? '')) {
    index -= 1;
  }
  return SCAN_DIGIT.test(text[index - 1] ?? '');
}

/** Whether a non-white joiner joins the text at a position to a digit group on its right (A3). */
function joinedRight(text: string, at: number): boolean {
  let index = at;
  if (!SCAN_JOINER_CHARACTER.test(text[index] ?? '')) {
    return false;
  }
  if (SCAN_DASH.test(text[index] ?? '') && SCAN_DASH.test(text[index + 1] ?? '')) {
    index += 1;
  }
  return SCAN_DIGIT.test(text[index + 1] ?? '');
}

/** What a letter is read as in the scan's reading of a date glued to a word: no letter, digit, white space or date separator. */
const WORD_BLANK = '#';
/**
 * Every word glued to a digit: letters after a digit, or a word before one. Each match starts after a digit or at a word's
 * first letter, so a long word is read once, never from each of its letters.
 */
const GLUED_ANY = /(?<=[0-9])\p{L}+|(?<!\p{L})\p{L}+(?=[0-9])/gu;
/** A date's ordinal suffix ("3rd", "4th"): kept by the second glued reading after a day's one or two digits. */
const ORDINAL_SUFFIX = /^(?:st|nd|rd|th)$/iu;

/**
 * A text and its glued readings, where a date glued to a word ("2020-01-01Paid", extracted text that lost its space) is
 * read: datesIn reads no date against a letter. Only a word glued to a digit is blanked (GLUED_ANY), so a month word stays
 * one ("2 January 2020Paid"), and a blank is WORD_BLANK, never a space, so a word between two numbers never reads as the
 * white space of one date (MOD-16 seed 1034253323); each blank is one unit for one, so a span is where it was. The second
 * reading keeps a day's ordinal suffix, glued after one or two digits and to nothing after it ("3rd of March"), and blanks
 * every other glued word, a year's "St" too; the third blanks every glued word, where it differs ("10/15/2026St. Joseph",
 * "2020-01-02nd floor": review GATEWAY1-1). So a range whose second end is a day-first ordinal date glued after its year
 * to such a word is read on the second ("01/01/2020-4th of March, 2020St. Mary": review GATEWAY2-2). A suffix kept after
 * three digits or more would read no date: every ordinal datesIn reads follows a day's one or two digits. The survivor
 * scan reads its barriers on them.
 */
function gluedReadings(text: string): string[] {
  const readings = [text];
  if (/[0-9]\p{L}|\p{L}[0-9]/u.test(text)) {
    const blank = (word: string) => WORD_BLANK.repeat(word.length);
    const day = (word: string, at: number) => {
      const run = /[0-9]+$/u.exec(text.slice(Math.max(0, at - 3), at))?.[0] ?? '';
      return ORDINAL_SUFFIX.test(word) && run.length >= 1 && run.length <= 2 && !/[0-9]/u.test(text[at - run.length - 1] ?? '') && !/[\p{L}\p{N}]/u.test(text[at + word.length] ?? '');
    };
    const ordinalsKept = text.replace(GLUED_ANY, (word: string, at: number) => (day(word, at) ? word : blank(word)));
    const allBlanked = text.replace(GLUED_ANY, blank);
    readings.push(ordinalsKept);
    if (allBlanked !== ordinalsKept) readings.push(allBlanked);
  }
  return readings;
}

/** One or two dashes and nothing else (any dash the scan joins over: SCAN_DASH): what joins the two ends of a range ("10/01/2026-10/15/2026", "150.00-120.00"). */
const RANGE_DASH = /^[\p{Pd}\u2212\u2043\u02D7\u2796]{1,2}$/u;
/** One or two hyphens, dashes or minus signs: what joins a range of one kind that cc3dd7f6's scan read as a barrier too. */
const PLAIN_RANGE_DASH = /^[\p{Pd}\u2212]{1,2}$/u;

/**
 * The spans (dates or amounts, in any order) that stand whole: joined by no non-white joiner to a digit group on either
 * side (A3), or joined only by a dash to another such span, the range as a whole joined to nothing else (a service period
 * "10/01/2026-10/15/2026", "2026-10-01-2026-10-15", amounts "150.00-120.00": review round 2, finding 2; a date and an
 * amount, "01/01/2020-150.00": MOD-16 seed 1034253323). A range whose end is joined to a further group
 * ("10/01/2026-10/15/2026-0123") stands as no barrier, nor does any span in it. A side that is no digit (a month word, a
 * currency sign) is joined to nothing: no group chains into the span's digits over it. Spans may share a start or an end
 * (a date on both readings, an amount with and without its currency sign): a side stands free if any partner there does.
 * Each span comes back with the start of its range's first end (its own start when nothing joins it on the left), where
 * the scan reads an amount's label too (review GATEWAY1-2). With `dash` a range is joined only by those dashes, and without
 * `wordSidesFree` a side that is no digit is joined as cc3dd7f6 joined it (the scan's reading of what cc3dd7f6 read).
 */
function wholeRanges<T extends { readonly start: number; readonly end: number }>(text: string, spans: readonly T[], dash = RANGE_DASH, wordSidesFree = true): (T & { readonly rangeStart: number })[] {
  /**
   * Where a range dash of one or two joins a side to a place where a span that stands free on that side ends (or starts):
   * what is kept for that place, or undefined when no dash joins it to one.
   */
  const toFree = (at: number, side: 'left' | 'right', free: ReadonlyMap<number, number>): number | undefined => {
    for (const width of [1, 2]) {
      const gap = side === 'right' ? text.slice(at, at + width) : text.slice(at - width, at);
      if (!dash.test(gap)) return undefined;
      const kept = free.get(side === 'right' ? at + width : at - width);
      if (kept !== undefined) return kept;
    }
    return undefined;
  };
  // Whether each side stands free: no joiner, or a range dash to a partner whose own side further out stands free. A partner
  // on the left ends before the span starts, so the left sides are settled in order of start and the right sides in
  // reverse order of end, each pass keeping where the spans that stand free on its side end (or start); the left pass
  // keeps, for each such end, the earliest start of a range ending there.
  const rangeStarts = new Array<number | undefined>(spans.length).fill(undefined);
  const rightFree = new Array<boolean>(spans.length).fill(false);
  const freeEnds = new Map<number, number>();
  for (const index of [...spans.keys()].sort((a, b) => (spans[a]?.start ?? 0) - (spans[b]?.start ?? 0))) {
    const span = spans[index];
    if (span === undefined) continue;
    const rangeStart = (wordSidesFree && !SCAN_DIGIT.test(text[span.start] ?? '')) || !joinedLeft(text, span.start) ? span.start : toFree(span.start, 'left', freeEnds);
    rangeStarts[index] = rangeStart;
    if (rangeStart !== undefined) freeEnds.set(span.end, Math.min(rangeStart, freeEnds.get(span.end) ?? rangeStart));
  }
  const freeStarts = new Map<number, number>();
  for (const index of [...spans.keys()].sort((a, b) => (spans[b]?.end ?? 0) - (spans[a]?.end ?? 0))) {
    const span = spans[index];
    if (span === undefined) continue;
    rightFree[index] = (wordSidesFree && !SCAN_DIGIT.test(text[span.end - 1] ?? '')) || !joinedRight(text, span.end) || toFree(span.end, 'right', freeStarts) !== undefined;
    if (rightFree[index]) freeStarts.set(span.start, span.start);
  }
  return spans.flatMap((span, index) => {
    const rangeStart = rangeStarts[index];
    return rangeStart !== undefined && rightFree[index] === true ? [{ ...span, rangeStart }] : [];
  });
}

/**
 * Whether a chain of digit groups that could be a Social Security or phone number survives in a view of masked text:
 * 1. barriers first: every placeholder (the BARRIER), every whole separated date with a reading (not joined on either
 *    side to another group by a joiner: A3; a date glued to a word read with that word as blanks; two such dates or
 *    amounts, or one of each, joined by a dash, a range, are whole: wholeRanges), every amount (a currency sign and its
 *    number; an unsigned amount, comma thousands or one or two decimals, not joined to a group on either side, or an end
 *    of a range), and every bare nine or ten a keep-noun
 *    names, or that R5 keeps (an NPI, a TIN);
 * 2. chains: digit groups joined by SCAN_GAP;
 * 3. a survivor: one to four consecutive groups of a chain holding 9 or 10 digits, or 11 starting with 1 across two or
 *    more groups, unless they are two or more and one has five digits or more (codes, ZIPs, TINs, ICN columns), or the
 *    group is one ten starting 0 or 1, one ten starting 2 that passes the NPI check, or one of eleven digits or more;
 * 4. under a label (scanLabeled: an SSN or phone label the nearest word before the chain's first group): any number of
 *    consecutive groups of two or more holding 9 or 10 digits, or 11 starting with 1, whatever their lengths (review
 *    findings SEC-1, SEC-4, corr-ssn-1: "Phone 202-5550123", "SSN 90012-3456", "SSN 9 0 0 1 2 3 4 5 6"), and an
 *    unsigned amount there is no barrier ("SSN 900.12 3456": SEC-5), the label read over the numbers before the amount
 *    or its range too, and a chain from that amount read under it ("SSN 01/01/2020-900.12 3456": review GATEWAY1-2);
 * 5. read again with the barriers cc3dd7f6 read alone ("kept": a currency amount, and a date or an unsigned amount alone or
 *    in a range of its own kind joined by a hyphen, a dash or the minus sign, the dates read as cc3dd7f6 read them, and
 *    those it read over words no digit touches, with no SSN or phone label in them, barriers of the first reading too): a
 *    chain that survives there is a survivor unless the barriers the range fix added ("held": a range of a date and an
 *    amount or of an amount and a currency amount, a date read only with a glued word blanked, a range joined by another
 *    dash) hold all of it, each standing (rangeStands); where they do, the letter is 'held': sent, but read past them for
 *    an SSN or phone label glued to a word and for the call's identifiers glued to text (ownIdentifierGlued), as
 *    cc3dd7f6 refused it (review round 3 of the range fix; the orchestrator's ruling of 2026-11-07: where a range's end
 *    cannot be told from an identifier's fragment, refuse as cc3dd7f6 did).
 */
function survivorRead(text: string, strict: boolean, departs: { left: boolean }): Survivor {
  const barrier = new Uint8Array(text.length + 1);
  const mark = (start: number, end: number) => {
    for (let i = start; i < end; i += 1) barrier[i] = 1;
  };
  // Where this reading may hold less in a chain than ef3e8d20's held, `departs.left` is set and survivorIn reads the text
  // as ef3e8d20 read it too: a label found by a window that read through the call's own identifier or a list number (a
  // window that reads through nothing is ef3e8d20's own, and one that finds no label found none to ef3e8d20 either: what
  // ef3e8d20 read is its end); a label that only a Social Security label glued after a letter makes, which ef3e8d20 did
  // not read; a long run that is no amount here; a list number that is no digit of a chain here. With `strict` false
  // none of the four is read, and the scan is ef3e8d20's own.
  const skipped = { any: false };
  const never = () => false;
  const decided = { byLong: false };
  const windowLabel = (read: Parameters<typeof labelWindow>[3], start: number, glued: boolean, digitsBlank: boolean): ScanLabel => {
    skipped.any = false;
    decided.byLong = false;
    const window = labelWindow(text, start, never, read);
    const label = scanLabeled(digitsBlank ? window.replace(/[0-9]/gu, ' ') : window, glued, strict, decided);
    if ((label !== null && skipped.any) || decided.byLong) departs.left = true;
    return label;
  };
  const plainRead = { through: strict, skipped };
  const labeled = new Map<string, ScanLabel>();
  const labeledAt = (start: number, glued = false): ScanLabel => {
    const key = `${String(start)}${glued ? 'g' : ''}`;
    let held = labeled.get(key);
    if (held === undefined) {
      held = windowLabel(plainRead, start, glued, false);
      labeled.set(key, held);
    }
    return held;
  };
  // A date glued to a word ("2020-01-01Paid", extracted text that lost its space) is read on the glued readings too
  // (gluedReadings): datesIn reads no date against a letter, and its digits would chain with a group before it (MOD-16,
  // check round 1).
  const datesByReading = gluedReadings(text).map((reading) => datesIn(reading).filter((span) => span.separated && span.dates.length > 0).map((span) => ({ start: span.start, end: span.end, amount: false })));
  const dates = datesByReading.flat();
  const currency = [...text.matchAll(CURRENCY_AMOUNT)].map((match) => ({ start: match.index, end: match.index + match[0].length, amount: false }));
  // A run of nine digits or more before a decimal point is no amount to the strict reading: an SSN or phone with an
  // amount's digits glued to it ("900123456150.00"). ef3e8d20 read it as one, and read a chain from it under its label
  // (survivorIn reads the text that way too).
  const unsigned = [...text.matchAll(UNSIGNED_AMOUNT)];
  const amounts = unsigned.filter((match) => !(strict && /^[0-9]{9,}\./u.test(match[0]))).map((match) => ({ start: match.index, end: match.index + match[0].length, amount: true }));
  if (amounts.length < unsigned.length) departs.left = true;
  // Which barrier holds a digit, for the strict reading of a held letter (heldStrict, below): a currency amount, or a date that stands.
  const currencyAt = new Uint8Array(text.length + 1);
  const dateAt = new Uint8Array(text.length + 1);
  for (const span of currency) {
    mark(span.start, span.end);
    currencyAt.fill(1, span.start, span.end);
  }
  // SEC-5's label for an unsigned amount, read over the numbers before it as well, each digit as a space (so a label glued
  // to a digit is still one): a date, an amount or a range between the label and the amount ends no label's reach
  // ("SSN: 01/01/2020-900.12 3456", "SSN 01/01/2020 900.12 3456": review GATEWAY1-2). A plain number is read over only in
  // the amount's own run, before any word or span: one before them, as a phone word's own ("TTY 711"), ends the read as a
  // digit ends every label window (re-review GATEWAY1-1).
  const spanned = new Uint8Array(text.length + 1);
  for (const span of [...dates, ...currency, ...amounts]) {
    spanned.fill(1, span.start, span.end);
  }
  const spannedAt = (index: number) => spanned[index] === 1;
  const overRead = { spanned: spannedAt, spansOnly: false, through: strict, skipped };
  const overSpansRead = { spanned: spannedAt, spansOnly: true, through: strict, skipped };
  const labeledOver = new Map<string, ScanLabel>();
  const labeledOverNumbers = (start: number, spansOnly = false, glued = false): ScanLabel => {
    const key = `${String(start)}${spansOnly ? 's' : 'n'}${glued ? 'g' : ''}`;
    let held = labeledOver.get(key);
    if (held === undefined) {
      held = windowLabel(spansOnly ? overSpansRead : overRead, start, glued, true);
      labeledOver.set(key, held);
    }
    return held;
  };
  // Dates of both readings and amounts are ranged together: either end of a range may be read on either reading
  // ("01/01/2020-01/02/2020Paid": the first end on the text, the second with the letters as blanks), and a range may
  // join a date to an amount or an amount to one with a currency sign (MOD-16 seed 1034253323). An unsigned amount
  // under an SSN or phone label stays no barrier (SEC-5): the label read before the amount, or before its range's first
  // end, over the numbers between too ("SSN January 1, 2020-900.12 3456", "Phone $45-$97-985.37 8257": review
  // GATEWAY1-2); a chain whose first group starts that amount is read under the label.
  //
  // An amount labeled only over plain numbers of its own run (a money amount, two decimals), where neither labeledAt nor a
  // read over spans alone finds the label, starts a chain under the label too, but it ends a chain that already holds a
  // group of five digits or more with a shorter group just before the amount: a code column and a units column before
  // the amount of a service-line row ("Contact us.⏎97110 1 150.00": review GATEWAY2-1), as the unlabeled rule reads a code
  // column. A five-digit group right before it is no units column ("SSN 90012 34.56", "Line 1 97110 600.50" stay refused).
  const personAmounts = new Set<number>();
  const ownRunAmounts = new Set<number>();
  // Where each barrier's range starts (its own start for a span that stands alone), and where the range ends.
  const rangeOf = new Int32Array(text.length + 1).fill(-1);
  const rangeEnds = new Map<number, number>();
  const rangeSpans = new Map<number, { readonly start: number; readonly end: number; readonly amount: boolean }[]>();
  for (const span of wholeRanges(text, [...dates, ...currency, ...amounts])) {
    if (span.amount && (labeledAt(span.start) === 'person' || labeledOverNumbers(span.start, true) === 'person' || labeledOverNumbers(span.rangeStart, true) === 'person')) {
      personAmounts.add(span.start);
    } else if (span.amount && (labeledOverNumbers(span.start) === 'person' || labeledOverNumbers(span.rangeStart) === 'person')) {
      personAmounts.add(span.start);
      if (MONEY_AMOUNT.test(text.slice(span.start, span.end))) ownRunAmounts.add(span.start);
    } else {
      mark(span.start, span.end);
      if (!span.amount && currencyAt[span.start] !== 1) dateAt.fill(1, span.start, span.end);
      rangeOf.fill(span.rangeStart, span.start, span.end);
      rangeEnds.set(span.rangeStart, Math.max(span.end, rangeEnds.get(span.rangeStart) ?? span.end));
      const spans = rangeSpans.get(span.rangeStart) ?? [];
      spans.push(span);
      rangeSpans.set(span.rangeStart, spans);
    }
  }
  // The barriers cc3dd7f6's scan read too ("kept"): a currency amount, and a date read on the text as written or an unsigned
  // amount that stands alone, or in a range of its own kind joined by a hyphen, a dash or the minus sign. The others the
  // range fix added ("held": a range of a date and an amount, or of an amount and a currency amount, a date read only with
  // a glued word blanked, a range joined by another dash: MOD-16 seed 1034253323) are barriers only where they hold a
  // chain whole and no short group stands beside them: a range's end may be an identifier's head or tail written like a
  // date or an amount ("$10-900.12 3456", "900 12 3456150.00-2020-01-02"), and where it cannot be told, the letter is
  // refused as cc3dd7f6 refused it (the orchestrator's ruling of 2026-11-07).
  const kept = new Uint8Array(text.length + 1);
  const keep = (span: { readonly start: number; readonly end: number }) => {
    for (let i = span.start; i < span.end; i += 1) kept[i] = barrier[i] ?? 0;
  };
  currency.forEach(keep);
  // cc3dd7f6 read the dates past each match's end only, and, once any letter touches a digit, with every letter read as a
  // space: so "12/31 terminated. 26" is a date to it wherever a code has its modifier glued ("97110GP"), and a range
  // ending in it stands. Such a date is a barrier of the full reading as well where it is read with only the words no
  // digit touches as spaces (a glued word stays a blank, never the white space of a date: MOD-16 seed 1034253323) and no
  // SSN, Medicare or phone label stands in it: without it the first pass refused clean letters cc3dd7f6 sends unchanged
  // ("Coverage 10/1/2025-12/31 terminated. 26 units of 97110GP were billed.": review round 5, F6). No chain cc3dd7f6
  // refused crosses one: it was its barrier too. Every other date it read is kept only where the full reading has a
  // barrier, as before: a date read over a label or a glued word may end in the first numbers of a number written after
  // it ("150.00-$10-\nSSN 9.00 12 3456Paid" reads "10-\n 9.00" as a date, "3rd—01|90 0-12-3456" reads "3 —01|90").
  const dated = (reading: string) => wholeRanges(text, datesIn(reading, false).filter((span) => span.separated && span.dates.length > 0), PLAIN_RANGE_DASH, false);
  const place = (span: { readonly start: number; readonly end: number }) => `${String(span.start)}:${String(span.end)}`;
  if (/[0-9]\p{L}|\p{L}[0-9]/u.test(text)) {
    const spaced = (word: string) => ' '.repeat(word.length);
    const overWords = new Set(dated(text.replace(GLUED_ANY, (word) => WORD_BLANK.repeat(word.length)).replace(/\p{L}/gu, spaced)).map(place));
    for (const span of dated(text.replace(/\p{L}/gu, spaced))) {
      if (overWords.has(place(span)) && !LABEL_IN_DATE.test(text.slice(span.start, span.end))) {
        mark(span.start, span.end);
        dateAt.fill(1, span.start, span.end);
      }
      keep(span);
    }
  }
  dated(text).forEach(keep);
  wholeRanges(text, amounts, PLAIN_RANGE_DASH, false).forEach(keep);
  const groups: { readonly start: number; readonly end: number; readonly digits: string; readonly blocked: boolean; readonly kept: boolean; readonly range: number; readonly named: boolean }[] = [];
  for (const match of text.matchAll(/[0-9]+/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    let blocked = false;
    let held = false;
    for (let i = start; i < end; i += 1) {
      blocked ||= barrier[i] === 1;
      held ||= kept[i] === 1;
    }
    let named = false;
    if (!blocked && (match[0].length === 9 || match[0].length === 10)) {
      blocked = decideNamed(text, start, () => false, match[0].length, match[0]) === 'keep';
      held = blocked;
      named = blocked;
    }
    // A label's list number, which the label is read through, is no digit of the number it names: "Telephone call (2) 30.00
    // 60.00" holds eight digits after its label, as "Telephone call 30.00 60.00" does. To ef3e8d20 it was the chain's first
    // group (survivorIn reads the text that way too).
    if (strict && !blocked && listNumberAt(text, start, end)) {
      blocked = true;
      held = true;
      departs.left = true;
    }
    groups.push({ start, end, digits: match[0], blocked, kept: held, range: rangeOf[start] ?? -1, named });
  }
  /**
   * Whether a held range stands as a barrier: each end written as a range's ends are (a date with one separator or a month
   * word, its day and year apart, an amount with cents, a currency amount: "0,900-12-19.85" is no range of an amount and a
   * date, nor "34561 January 2020-150.00" one of January 20, 2020), no SSN or phone label before it ("Re: SSN
   * 01/01/2020-4th of March, 2020Rd.900.12 3456": the label may be the number's after it), and nothing that
   * may be the other part of an identifier whose part the range holds stands beside it, joined to it as a chain joins, or
   * after it glued to it by a word: a short group no barrier holds, an unsigned amount (R1 reads "150.00 1234" as an
   * amount and a number, as it reads "900.12 3456"), or a held range that does not stand on that side ("$10-900.12 3456",
   * "900 12 3456150.00-2020-01-02", "SSN 1st 900.12 34.56-01/03/2020", "01/01/2020-1st Jan 2020th90012-3456"); after it
   * glued by a word, any group no barrier holds.
   */
  const amountAt = new Uint8Array(text.length + 1);
  const amountStarts = new Int32Array(text.length + 1).fill(-1);
  for (const span of amounts) {
    amountAt.fill(1, span.start, span.end);
    amountStarts.fill(span.start, span.start, span.end);
  }
  const standing = new Map<string, boolean>();
  /**
   * Whether, after a word glued to a range's end and what joins a chain ("2020St.⏎555-0123", "2021rd 555-0123"), a run of
   * plain groups starts that is a Social Security or phone number's shape: two to four groups under five digits each,
   * holding nine or ten digits, or three and four (a local number); never after a keep-noun or a code word ("TIN
   * 56-0000465", "Rd. 9 92956", "Row 02 28 2030" stand).
   */
  const personShaped = (from: number, gap: string): boolean => {
    const word = /^\p{L}+\.?/u.exec(gap)?.[0] ?? '';
    if (word === '' || !SCAN_GAP.test(gap.slice(word.length)) || (gap.slice(word.length) === '' && !word.endsWith('.'))) return false;
    if (NOUN_WORD.test(word.replace(/\.$/u, ''))) return false;
    const run: string[] = [];
    for (let k = from; k < groups.length && run.length < 5; k += 1) {
      const current = groups[k];
      if (current === undefined || current.blocked || (k > from && !SCAN_GAP.test(text.slice(groups[k - 1]?.end ?? 0, current.start)))) break;
      run.push(current.digits);
    }
    const digits = run.join('').length;
    return run.length >= 2 && run.length <= 4 && run.every((group) => group.length < 5) && (digits === 9 || digits === 10 || (run.length === 2 && run[0]?.length === 3 && run[1]?.length === 4));
  };
  const sideStands = (range: number, side: 'left' | 'right'): boolean => {
    // Walked from range to range in one direction (a held range beside a held range stands as that one does), each once.
    const walked: string[] = [];
    let at = range;
    let held = standing.get(`${String(at)}${side}`);
    while (held === undefined) {
      walked.push(`${String(at)}${side}`);
      const end = rangeEnds.get(at) ?? at;
      const index = side === 'left' ? firstIndex(groups, (group) => group.start >= at) - 1 : firstIndex(groups, (group) => group.start >= end);
      const neighbor = groups[index];
      const gap = neighbor === undefined ? '' : side === 'left' ? text.slice(neighbor.end, at) : text.slice(end, neighbor.start);
      // After it, a word glued to its end, or a mask's characters ("2020th90012-3456", "150.00XXX-XX-3456").
      const glued = side === 'right' && GLUED_AFTER_RANGE.test(gap);
      if (side === 'right' && neighbor !== undefined && !glued && personShaped(index, gap)) {
        held = false;
      } else if (neighbor === undefined || !(glued || SCAN_LABELED_GAP.test(gap)) || neighbor.range === at) {
        held = true;
      } else if (!neighbor.blocked) {
        held = !glued && neighbor.digits.length >= 5;
      } else if (neighbor.kept) {
        held = glued || amountAt[neighbor.start] !== 1;
      } else if (neighbor.range < 0) {
        held = false;
      } else if (glued) {
        held = true;
      } else {
        at = neighbor.range;
        held = standing.get(`${String(at)}${side}`);
      }
    }
    for (const key of walked) standing.set(key, held);
    return held;
  };
  const written = (span: { readonly start: number; readonly end: number; readonly amount: boolean }) => {
    const token = text.slice(span.start, span.end);
    return span.amount ? /[.,][0-9]{2}$/u.test(token) : /^\p{Sc}/u.test(token) || (new Set(token.match(/[^\p{L}\p{N}\s,]/gu) ?? []).size <= 1 && (token.match(/[0-9]+/gu) ?? []).length >= 2);
  };
  // Settled once per range: a range of many ends holds many groups, and each chain asks for each of its groups' range.
  const stood = new Map<number, boolean>();
  const rangeStands = (range: number): boolean => {
    let stands = stood.get(range);
    if (stands === undefined) {
      stands = (rangeSpans.get(range) ?? []).every(written) && labeledAt(range) !== 'person' && labeledOverNumbers(range) !== 'person' && sideStands(range, 'left') && sideStands(range, 'right');
      stood.set(range, stands);
    }
    return stands;
  };
  const chained = (digits: string) => digits.length === 9 || digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  /**
   * Whether a chain survives where `stands` says which groups are barriers; one that `placed` says lies wholly in barriers
   * of the full reading is no survivor.
   */
  const survives = (stands: (group: (typeof groups)[number]) => boolean, placed: (from: number, to: number) => boolean, glued = false): boolean => {
    for (let first = 0; first < groups.length; first += 1) {
      let digits = '';
      let long = false;
      const start = groups[first]?.start ?? 0;
      // Under a label the chain runs on until it holds more than eleven digits (each group one digit at least, so twelve groups at most).
      const label = (groups[first]?.digits.length ?? 12) < 11 && first + 1 < groups.length ? (labeledAt(start, glued) ?? (personAmounts.has(start) ? 'person' : null)) : null;
      // "Medicare" labels a nine only (R5d), as decideBare reads it.
      const labeledChain = (held: string) => (label === 'medicare' ? held.length === 9 : label !== null && chained(held));
      for (let count = 1; (label !== null || count <= 4) && digits.length <= 11 && first + count <= groups.length; count += 1) {
        const group = groups[first + count - 1];
        const previous = groups[first + count - 2];
        const unitsBefore = ownRunAmounts.has(group?.start ?? -1) && long && (previous?.digits.length ?? 0) < 5;
        if (group === undefined || stands(group) || (count > 1 && (unitsBefore || previous === undefined || !(label === 'person' ? SCAN_LABELED_GAP : SCAN_GAP).test(text.slice(previous.end, group.start))))) {
          break;
        }
        digits += group.digits;
        long ||= group.digits.length >= 5;
        const ten = digits.length === 10 && (/^[01]/u.test(digits) || (digits.startsWith('2') && npiCheckDigitValid(digits)));
        // Under a glued label, a local number too (three digits and four), which the patterns read under a label.
        const survivor =
          count === 1
            ? (digits.length === 9 || digits.length === 10) && !ten
            : labeledChain(digits) || (!long && count <= 4 && chained(digits)) || (glued && label === 'person' && count === 2 && previous?.digits.length === 3 && group.digits.length === 4);
        if (survivor && !placed(first, first + count)) {
          return true;
        }
      }
    }
    return false;
  };
  const heldWhole = (from: number, to: number) => groups.slice(from, to).every((group) => group.blocked && (group.kept || rangeStands(group.range)));
  const glued = strict ? gluedShape(text, groups, (group) => labeledAt(group.start), (group) => scanSsnLabeled(labelWindow(text, group.start, () => false, { through: strict })), currencyAt) : null;
  if (glued === 'structure') {
    return 'survivor';
  }
  if (survives((group) => group.blocked, () => false) || survives((group) => group.kept, heldWhole)) {
    return 'survivor';
  }
  if (!survives((group) => group.kept, () => false)) {
    return null;
  }
  // A chain that held barriers alone hold, in a letter cc3dd7f6 refused for it: an SSN or phone label glued to the word
  // before it by a lost space is read too ("01/01/2020-150.00-PaidSSN 900 12 34.56", which cc3dd7f6 refused only for the
  // range), and the call's identifiers glued to text (ownIdentifierGlued); else the letter is sent.
  const gluedLabel = (start: number) => start >= 0 && (labeledAt(start, true) === 'person' || labeledOverNumbers(start, false, true) === 'person');
  if (survives((group) => group.blocked && !(amountAt[group.start] === 1 && gluedLabel(amountStarts[group.start] ?? -1)), () => false, true)) {
    return 'survivor';
  }
  return strict && (glued === 'shape' || heldStrict({ text, groups, currencyAt, dateAt, amountAt, amountStarts, rangeSpans, rangeEnds, labeledAt })) ? 'survivor' : 'held';
}

/**
 * The survivor scan of a view of masked text (survivorRead). ef3e8d20's reading stands and the strict one only adds, by
 * construction: the strict reading is ef3e8d20's own with refusals added, but in the places survivorRead marks, where it
 * reads a label ef3e8d20 did not or may hold less in a chain than ef3e8d20 held (a label read through the call's own
 * identifier or a list number, or made by a Social Security label glued after a letter, so an amount under it is no
 * barrier; a label's list number, no digit of a chain; a run of nine digits or more before a decimal point, no amount).
 * A text that holds one and that the strict reading does not refuse is read once more as ef3e8d20 read it, and the worse
 * of the two is the answer ("Cell number 1) 7886924.4" holds nine digits after its label
 * to ef3e8d20, "Telephone number 8 1234567893.1" an eleven that starts with 1: both stay refused).
 */
function survivorIn(text: string, strict = true): Survivor {
  const departs = { left: false };
  const read = survivorRead(text, strict, departs);
  if (!strict || !departs.left || read === 'survivor') {
    return read;
  }
  const base = survivorRead(text, false, departs);
  return base === 'survivor' || read === null ? base : read;
}

/**
 * What, after a held range's end, glues the next group to it (survivorIn's sideStands): a word, or a mask's groups with or
 * without a word before them ("2020th90012-3456", "150.00XXX-XX-3456", "150.00PaidXXX-XX-3456", "150.00Paid***-**-3456"),
 * never a word and a gap alone ("Paid ", "Paid-": MOD-16's "Service 01/01/2020-150.00Paid 97110 3 1234.56"). Each mask group
 * is bounded, so a long run of letters is read in linear time.
 */
const GLUED_AFTER_RANGE = /^(?:\p{L}+|\p{L}*\.?[\p{Pd}\u2212 .]?(?:[Xx]{2,5}|[*#_\u2022\u25CF]{1,5})(?:[\p{Pd}\u2212 .]?(?:[Xx]{2,5}|[*#_\u2022\u25CF]{1,5})){0,3}[\p{Pd}\u2212 .]?)$/u;

/** An SSN, Medicare or phone label inside a date cc3dd7f6 read with every letter as a space, glued to a word or not (survivorIn's kept reading). */
const LABEL_IN_DATE = new RegExp([...GLUED_PERSON_LABELS, MEDICARE_LABEL].map((label) => `(?:${label.source.replace('(?<![\\p{L}\\p{N}])', '')})`).join('|'), 'u');

/** What the words before a chain say it is to the scan: a person's number (an SSN or phone label), a nine after "Medicare", or nothing. */
type ScanLabel = 'person' | 'medicare' | null;

/** Codes a letter names that are no person's: what, nearer the chain than an SSN or phone label, leaves it to the unlabeled rules (scanLabeled). */
const SCAN_CODE_NOUN = /(?<![\p{L}\p{N}])(?:CPT|HCPCS|CODES?|MODIFIERS?|REV(?:ENUE)?|ICD(?:[\p{Pd}\u2212 ]?10)?|ZIP)(?!\p{L})/gu;

/** A keep-noun or a code word, the whole word: what names the number after it (survivorIn's person-shaped run). */
const NOUN_WORD = new RegExp(`^(?:${KEEP_NOUN.source}|${SCAN_CODE_NOUN.source})$`, 'u');

/**
 * Whether the words before a chain's first group (a label window) name it a Social Security or phone number for the scan:
 * an SSN, Medicare or phone label within LABEL_REACH whose end is nearer the chain than any keep-noun or code (CPT, ZIP ...);
 * a keep-noun after the label ("Call our office, TIN 12-3456789") or a code ("Please call about CPT 97110 97140") leaves the
 * chain to the unlabeled rules. Written for the scan on its own (R7: independent of R5's decision).
 */
function scanLabeled(window: string, glued = false, long = true, decided?: { byLong: boolean }): ScanLabel {
  work(WORK.scanLabel);
  if (!/\p{L}/u.test(window)) {
    // No word at all: no label (most windows in a column of digits).
    return null;
  }
  const lastEnd = (pattern: RegExp) => {
    let end = -1;
    for (const match of window.matchAll(pattern)) {
      const at = match.index + match[0].length;
      if (window.length - at <= LABEL_REACH) end = at;
    }
    return end;
  };
  const medicare = lastEnd(MEDICARE_LABEL);
  const code = Math.max(lastEnd(KEEP_NOUN), lastEnd(SCAN_CODE_NOUN));
  const labelOf = (person: number): ScanLabel => (person > code && person >= medicare ? 'person' : medicare > code ? 'medicare' : null);
  const person = Math.max(...(glued ? GLUED_PERSON_LABELS : [SSN_LABEL, PHONE_LABEL]).map(lastEnd));
  const label = labelOf(person);
  if (glued || !long) {
    return label;
  }
  // A Social Security label glued after a letter ("PatientSSN", "MemberSocialSecurityNumber"), which ef3e8d20 did not
  // read: `decided.byLong` says where it alone makes the label.
  const longer = labelOf(Math.max(person, lastEnd(GLUED_LONG_LABEL)));
  if (decided !== undefined && longer !== label) decided.byLong = true;
  return longer;
}

/**
 * Whether the scan's person label over a window is a Social Security label and no phone word: the nearer of the two to
 * the chain. A phone word is an ordinary word too ("Fax confirmation number", "Contact us regarding account"); a Social
 * Security label is none, and what follows it is the person's number whatever noun stands between ("SSN on file:",
 * "SSN/Member ID:", "Soc. Sec. Acct. No.": the review of the last round's delta, E1-1).
 */
function scanSsnLabeled(window: string): boolean {
  const lastEnd = (pattern: RegExp) => {
    let end = -1;
    for (const match of window.matchAll(pattern)) {
      const at = match.index + match[0].length;
      if (window.length - at <= LABEL_REACH) end = at;
    }
    return end;
  };
  return Math.max(lastEnd(SSN_LABEL), lastEnd(GLUED_LONG_LABEL)) > lastEnd(PHONE_LABEL);
}

/**
 * What the survivor scan finds: a survivor, the letter refused; a chain that only a range of two kinds holds ('held'), the
 * letter sent where nothing else refuses it; or nothing.
 */
type Survivor = 'survivor' | 'held' | null;

/** What masked text holds (survivorIn) on its digits view with invisible runs dropped or read as spaces (R4, R7): the more of the two. */
const survivorLeft = (text: string, strict = true): Survivor => {
  const drop = viewOf(text, 'drop', true);
  const dropped = survivorIn(drop.text, strict);
  // With no invisible run the two readings are one text: it is scanned once (review finding corr-ssn-2).
  if (dropped === 'survivor' || !drop.emptied) {
    return dropped;
  }
  return survivorIn(viewOf(text, 'space', true).text, strict) ?? dropped;
};

/** A month's word or its abbreviation on folded text. */
const MONTH_FOLDED = '(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';

/**
 * What names a long number as a reference, up to a position: a keep-noun or a reference's noun and its connectors ("ICN
 * 12345678901234.01", "Case No. 123-45-678901-02", "Policy No. 01-23456-78-9012"). No other word does ("Patient #
 * 900-12-3456150.00", "Paid-975-20-18460.00" are refused), and an SSN, phone or Medicare label names no reference:
 * gluedShape asks the scan's label first ("SSN No. 900-12-3456150.00").
 * Between the noun and the number stand its connectors alone: white space, signs, a table's bar or box-drawing line,
 * number words, and a form's blank, a run of three underscores or tildes or more taken whole. No two connectors read the
 * same character, so the search is linear in the text (a run cut into pieces, then a table's corner "+" read two ways,
 * each made it exponential: the reviews of the last three deltas, I1-1, I2-1 and J-5). A "+" is a phone's own sign and
 * no connector ("Provider: +1-202-555-0123150.00", "Provider -+1-202-555-0123150.00").
 */
const NAMED_BEFORE = new RegExp(`(?:${KEEP_NOUN.source}|(?<![\\p{L}\\p{N}])(?:ACCOUNT|ACCT|POLICY|CERTIFICATE|CONTRACT|MEMBER|SUBSCRIBER|TICKET|INQUIRY|TRACKING|GRIEVANCE|CORRESPONDENCE|DOCUMENT|CONFIRMATION|ORDER|(?<!(?<![\\p{L}\\p{N}])ON[ \\t\\p{Pd}]{1,3})FILE|RECORD|REQUEST|TRANSACTION|ENCOUNTER|VISIT|BATCH|LETTER|NOTICE|PLAN|PROVIDER|FACILITY|LOCATION|TCN|CCN|MRN|PCN|NDC|RX|PAYMENT|REFERRAL|RECEIPT|PRECERT(?:IFICATION)?|PRE[\\p{Pd} ]?AUTH(?:ORIZATION)?|CERTIFICATION|SESSION|CUSTOMER|VOUCHER|DOCKET|STATEMENT|REMIT(?:TANCE)?(?:\\s{1,3}ADVICE)?|EMPLOYER|PAYER|LOAN|RECONSIDERATION|REDETERMINATION|COMPLAINT)(?!\\p{L}))(?:\\(S\\)|[\\s\\u0085:#.*=()\\p{Pd}\\u2212|\\u2500-\\u257F,/"\u201C\u201D']|(?<![_~])[_~]{3,}(?![_~])|(?<![\\p{L}\\p{N}])(?:NO|NOS|NUMBERS?|NBR|NUM|ID|IS|LINE|CODE)(?!\\p{L}))*$`, 'u');
/** How far back a reference's noun is looked for: a form's column of spaces between the noun and its number too. */
const NAMED_REACH = 120;
/** An SSN label right before a reference's noun: the noun is the label's own word ("Social Security Account Number"). */
const SSN_LABEL_THEN = new RegExp(`(?:${SSN_LABEL.source})[ \\t]*$`, 'u');
/** What stands between a label's last word and its number. */
const LABEL_TAIL = /[^\p{L}\p{N}]*$/u;
/** What stands between a date's parts written with its month's word: white space (a line break too), a comma, a point, a dash or a slash, four at most. */
const WORD_DATE_GAP = '[\\s,.\\p{Pd}\\u2212/]{0,4}';
/**
 * A date up to its four-digit year, glued before a shape, on the scan's folded text: its month and day in digits with
 * their separators ("01/02/"; with spaces around them it is as often a section's or a list's numbers: "Sec. 2.1. ", "3 -
 * 5 - "); a month in digits and a slash ("01/"); its month's word, the day after it or not ("JAN 1, ", "JAN 1,",
 * "JAN-01-", "JANUARY "); or the day and then the month's word ("1 JANUARY ", "01-JAN-", "01JAN", "1ST OF JANUARY, ", "THE
 * 1ST DAY OF JANUARY, "). A word glued by a lost space before the month's word of a date with its day is read too
 * ("PAIDJAN 1, "), as the scan reads a date glued to a word; a month's word with no day is its own word ("DISMAY ",
 * "CODEC " are none: the review of the last round's delta, G2-6).
 */
const YEAR_GLUED_BEFORE = new RegExp(
  `(?:${[
    '(?<![0-9])(?:0?[1-9]|[12][0-9]|3[01])[/.\\p{Pd}\\u2212](?:0?[1-9]|[12][0-9]|3[01])[/.\\p{Pd}\\u2212]',
    '(?<![0-9/])(?:0?[1-9]|1[0-2])/',
    `(?<!\\p{L})${MONTH_FOLDED}\\.?${WORD_DATE_GAP}`,
    `${MONTH_FOLDED}\\.?${WORD_DATE_GAP}(?:0?[1-9]|[12][0-9]|3[01])(?:ST|ND|RD|TH)?${WORD_DATE_GAP}`,
    `(?<![0-9])(?:0?[1-9]|[12][0-9]|3[01])(?:ST|ND|RD|TH)?${WORD_DATE_GAP}(?:(?:DAY[ \\t]{1,2})?OF[ \\t]{1,2})?${MONTH_FOLDED}\\.?${WORD_DATE_GAP}`,
  ].join('|')})$`,
  'u',
);
/**
 * What joins the parts of a date glued after a bare number: a slash, a point, a dash (the hyphen bullet among them), or a
 * dot written for one. A bar, an underscore, a backslash or a tilde joins the cells of a row and the parts of a file's
 * name as often ("91895853214|3|20260401", "ERA_79790014228_08_2026.pdf": the review of the round before, G2-2), and is
 * read as a date's joiner only where the scan's label for the run is a Social Security label ("SSN: 90012345601_02_2020";
 * a phone word is an ordinary word too: "Fax ERA_79790014228_08_2026.pdf").
 */
const BARE_DATE_JOIN = '[/.\\p{Pd}\\u2212\\u2043\\u2215\\u2044\\u00B7\\u2027\\u2219\\u22C5\\u30FB\\u2022]';
const LABELED_DATE_JOIN = `[${DATE_SEPARATOR}\\u2215\\u2044~\\u00B7\\u2027\\u2219\\u22C5\\u30FB\\u2022]`;
/**
 * After that date, with no label over the run: no digit, or digits that begin another number with a structure of its own,
 * an amount or a second date in any writing ("...01/02/2020150.00", "...20201,250.00", "...202001/31/2020",
 * "...202001-JAN-2020": the review of the last round's delta, H1-3). Digits that only run on are a longer number's
 * ("12345678901/02/20261234"). Under a Social Security label the date is read whatever follows it.
 */
const BARE_DATE_END = '(?:(?![0-9])|(?=[0-9]{1,6}[.,/\\p{Pd}\\u2212][\\p{L}\\p{N}]))';
/** After a nine or a ten, a date that begins with one digit, written with slashes ("20255501239/9/2020"). */
const BARE_SHORT_DATE_AFTER = new RegExp(`^[1-9]/(?:0?[1-9]|[12][0-9]|3[01])/(?:19|20)[0-9]{2}${BARE_DATE_END}`, 'u');
/**
 * A date with a four-digit year glued after a bare nine or ten, the run's last digits its first: its day or month
 * ("94156421006-22-2027" is a nine and "06-22-2027"), its month's word between them too ("90012345601-JAN-2020"), or,
 * written year first, its year ("9001234562020-01-02", "9001234562020-1-5").
 */
const bareDateAfter = (join: string, end: string) =>
  new RegExp(
    `^(?:${[
      `(?:0?[1-9]|[12][0-9]|3[01])${join}(?:0?[1-9]|[12][0-9]|3[01])${join}(?:19|20)[0-9]{2}`,
      `(?:0?[1-9]|[12][0-9]|3[01])${join}?${MONTH_FOLDED}\\.?${join}?(?:19|20)[0-9]{2}`,
      `(?:0?[1-9]|[12][0-9]|3[01])${join}?${MONTH_FOLDED}\\.?(?:${join}|[ ,]){1,2}(?:19|20)[0-9]{2}(?!\\.[0-9]{2}(?![0-9]))`,
      `(?:19|20)[0-9]{2}${join}(?:0?[1-9]|1[0-2])${join}(?:0?[1-9]|[12][0-9]|3[01])`,
    ].join('|')})${end}`,
    'u',
  );
const BARE_DATE_AFTER = bareDateAfter(BARE_DATE_JOIN, BARE_DATE_END);
const LABELED_DATE_AFTER = bareDateAfter(LABELED_DATE_JOIN, '');
/** How far past a bare number's end its glued date is read: the date, and the amount after it. */
const BARE_DATE_REACH = 32;

/**
 * Whether a Social Security or phone number's own shape stands with another number's digits glued to it: three groups
 * joined by joiners with no white space, the middle one of two digits (three for a phone; a slash only for a phone), the
 * first of three digits or more and the last of four or more, one of them longer, no barrier holding them but a currency
 * amount its first. It does where structure says whose the other digits are:
 * - after it: cents after its last group (a range of amounts too), a second shape begun in that group or a date
 *   ("900-12-3456150.00", "900-12-3456150.00-120.00", "202-555-0123202-555-0124", "202-555-012301/02/2020"), the shape
 *   wrapped after a dash too;
 * - before it: a currency amount's digits, four digits or more, an amount's cents, or a two-digit year after its month
 *   and day ("$150.00900-12-3456", "$514451/293-6215", "2020900-12-3456", "01/01/2020900-12-3456", "150.00900-12-3456");
 * unless a reference's noun names the number ("Case No. 123-45-678901-02", "Policy No. 01-23456-78-9012"). Under an SSN,
 * phone or Medicare label the shape that starts at its group's start is the person's number whatever is glued after it ("SSN No. 900-12-345678", "Phone
 * number 202-555-01234567", "Medicare ID 900-12-345678"), in the number's usual writing too, with digits glued after it
 * ("Phone number (202) 555-01234567", "Tel 202 555-0123150.00": the review of the build, B1-8), a point between its
 * first groups only where a date is glued after its last four ("SSN 900.12 345601/01/2020"; "Contact: Billing 250.75
 * 123456" is an amount and a number). A phone with its area code in parentheses is the shape with no label too ("(202)
 * 555-012301/02/2020"). With no structure and no label a longer group is as often a
 * reference's ("Tracking 123-456-78901", "29 CFR 2590.715-2719": the review of the build, B2-3): 'shape', which a held
 * letter alone refuses (the first group three digits, the last longer, and no noun naming it: "900-01-202012th"), as
 * cc3dd7f6 refused every held letter.
 * And a run of eleven digits or more with cents after it ("900123456150.00"), unless named ("ICN 12345678901234.01"); and
 * an amount's cents with a nine or a ten right after them ("150.00900123456"; never a comma between two numbers of a list).
 * A date written year first with digits glued after its day ("2020-01-02150.00") is read as cc3dd7f6 read it.
 */
function gluedShape(text: string, groups: readonly ScanGroup[], labelOf: (group: ScanGroup) => ScanLabel, ssnLabel: (group: ScanGroup) => boolean, currencyAt: Uint8Array): 'structure' | 'shape' | null {
  // Where the reference a group belongs to starts: its digit groups joined with no white space ("01-23456-78-9012"). A
  // letter glued before its digits is no part of it: a lost space glues a word there as often ("Claim for900-12-3456150.00"),
  // so "Claim W2026008123456.01" is named by no noun (recorded: the review of the fix round's delta, D2-1).
  const referenceStart = (start: number): number => {
    let at = start;
    for (let joined = 0; joined < 8; joined += 1) {
      let end = at;
      while (end > 0 && at - end < 2 && TIGHT_JOIN.test(text[end - 1] ?? '')) end -= 1;
      let from = end;
      while (from > 0 && DIGIT.test(text[from - 1] ?? '')) from -= 1;
      if (from === end || end === at) break;
      at = from;
    }
    return at;
  };
  // A reference's noun names the number from its reference's start; never under a Social Security label, whose number it
  // is whatever noun follows the label: the scan's label for the number ("SSN on file: 900-12-345678", "SSN/Member ID:
  // 900-12-3456150.00"), or the label right before the noun, however far the number stands after it ("Social Security
  // Account Number" and a column of spaces, "SSN Account 01-900-12-3456150.00": the review of the last round's delta, G1-3).
  // The label may wrap once and the number may stand on the line under it: one line break at most inside the label and
  // one at most between its last word and the number ("Claim" over "Number: 20260112345.01", "ICN:" over its number).
  // More than that is a heading and no label: a blank line, a rule drawn under the label, a third line ("REMITTANCE
  // ADVICE", a blank line and "900-12-3456150.00": E1-7). Reading those layouts was tried over four rounds and every
  // reading named a number it should not have (H2-4, I2-2, I2-4, J-2 to J-4); the one rule's cost is in ADR 0054.
  const ssnLabeled = (group: ScanGroup) => labelOf(group) === 'person' && ssnLabel(group);
  const named = (group: ScanGroup) => {
    if (ssnLabeled(group)) return false;
    const start = referenceStart(group.start);
    const before = text.slice(Math.max(0, start - NAMED_REACH), start);
    const noun = NAMED_BEFORE.exec(before);
    if (noun === null || SSN_LABEL_THEN.test(before.slice(0, noun.index))) return false;
    const tail = LABEL_TAIL.exec(before)?.[0] ?? '';
    const label = before.slice(noun.index, before.length - tail.length);
    return label.split(LINE_BREAK_IN).length <= 2 && tail.split(LINE_BREAK_IN).length <= 2;
  };
  // A person's label over a shape: an SSN or phone label, or "Medicare" over an SSN's shape (its middle group of two).
  const labeled = (group: ScanGroup, middle = 2) => {
    const label = labelOf(group);
    return label === 'person' || (label === 'medicare' && middle === 2);
  };
  let shape = false;
  for (let i = 0; i < groups.length; i += 1) {
    const [a, b, c] = [groups[i], groups[i + 1], groups[i + 2]];
    if (a === undefined) continue;
    // A currency amount holds its digits, but a shape that starts inside one is no part of it: the amount's digits are the
    // other number's.
    const inCurrency = a.blocked && currencyAt[a.start] === 1;
    if (a.blocked && !inCurrency) continue;
    if (!inCurrency && a.digits.length >= 11 && CENTS_GLUED.test(text.slice(a.end, a.end + CENTS_REACH)) && !named(a)) return 'structure';
    // A date glued after a bare nine or ten ("SSN: 94156421006-22-2027", "92146703003.03.2028"), unless a noun names the run.
    const dateLead = a.digits.length === 11 || a.digits.length === 12 ? 2 : a.digits.length === 13 || a.digits.length === 14 ? 4 : 0;
    const dateText = dateLead > 0 ? text.slice(a.end - dateLead, a.end + BARE_DATE_REACH) : '';
    const dateAfter = dateLead > 0 && (BARE_DATE_AFTER.test(dateText) || (LABELED_DATE_AFTER.test(dateText) && ssnLabeled(a)));
    // A nine or a ten and a date that begins with one digit, written with slashes ("20255501239/9/2020"); with dashes one
    // digit and two groups are as often a reference's own end ("20260112345-01-2026").
    const shortDateAfter = (a.digits.length === 10 || a.digits.length === 11) && BARE_SHORT_DATE_AFTER.test(text.slice(a.end - 1, a.end + BARE_DATE_REACH));
    if (!inCurrency && (dateAfter || shortDateAfter) && !named(a)) return 'structure';
    // An amount's cents and then a nine or a ten with nothing between ("150.00900123456", "$150.002025550123").
    if ((a.digits.length === 11 || a.digits.length === 12) && /(?<![0-9.,])[0-9]{1,6}\.$/u.test(text.slice(Math.max(0, a.start - 9), a.start))) return 'structure';
    if (b === undefined || c === undefined || b.blocked || c.blocked) continue;
    const [g1, g2] = [text.slice(a.end, b.start), text.slice(b.end, c.start)];
    const slashed = g1.includes('/') || g2.includes('/');
    if (!((b.digits.length === 2 && !slashed) || b.digits.length === 3) || a.digits.length < 3 || c.digits.length < 4) continue;
    const head = a.digits.length - 3;
    const tail = c.digits.length - 4;
    if (head === 0 && tail === 0) continue;
    if (!((TIGHT_JOIN.test(g1) || WRAPPED_JOIN.test(g1)) && (TIGHT_JOIN.test(g2) || WRAPPED_JOIN.test(g2)))) {
      // In a number's usual writing (spaces, parentheses), under its label alone, with digits glued after it: "Phone number
      // (202) 555-01234567", "Tel 202 555-0123150.00".
      // Never an amount and a number ("Contact: Billing 250.75 123456", "Medicare rate 110 32.74420": the reviews of the
      // fix round and of the round after, C2-2 and E2-4), but where a date is glued after the number's last four ("SSN
      // 900.12 345601/01/2020"), and where a Social Security label is the number's own label over a point between the
      // second and third groups: what follows that label is no rate ("SSN 900 12.3456150.00": G1-5; under Medicare with
      // the Social Security Act named before it, it is one: "Social Security Act. Medicare rate 110 32.74420", H2-3).
      const dated = DATE_GLUED_AFTER.test(text.slice(c.start + 4, c.start + DATE_AFTER_REACH));
      const pointed = (g1 + g2).includes('.');
      // The label right before the number, no other word between them, is the number's label as a Social Security label
      // is ("Medicare 917 16.2677535.06" against "Medicare rate 110 32.74420": the gate's replay after the round that
      // gave the second back).
      const own = !g1.includes('.') && (ssnLabeled(a) || LABEL_RIGHT_BEFORE.test(text.slice(Math.max(0, a.start - 56), a.start)));
      if (head === 0 && LOOSE_JOIN.test(g1) && LOOSE_JOIN.test(g2) && (b.digits.length === 3 || !pointed || dated || own) && labeled(a, b.digits.length) && !named(a)) return 'structure';
      // A phone with its area code in parentheses is a phone's own shape with no label too: what is glued after it is read
      // as after a shape joined with no white space ("(202) 555-012301/02/2020", "(202) 555-0123150.00").
      // The parentheses may hold a space, a dash or a point or the line's end may follow them, and a space may stand before
      // the last four ("( 202 ) 555-0123", "(202) - 555-0123", "(202) 555 0123": the review of the last round's delta, E1-5).
      const parenthesized = head === 0 && b.digits.length === 3 && /\([ \t]?$/u.test(text.slice(Math.max(0, a.start - 2), a.start)) && PAREN_JOIN.test(g1) && (TIGHT_JOIN.test(g2) || g2 === ' ');
      if (!parenthesized) continue;
    }
    const yearFirst = /^(?:19|20)[0-9]{2}$/u.test(a.digits) && /^(?:0[1-9]|1[0-2])$/u.test(b.digits) && /^(?:0[1-9]|[12][0-9]|3[01])/u.test(c.digits);
    if (yearFirst) continue;
    const [before, after, last] = [groups[i - 1], groups[i + 3], groups[i + 4]];
    // Digits before the shape are another number's where a currency amount holds them, where they are four or more (a year, a
    // whole number: "2020900-12-3456", "01/01/2020900-12-3456", "2025550100900-12-3456"), an amount's cents (two of them, a
    // point joining them to the group before: "150.00900-12-3456") or a two-digit year after its month and day
    // ("01/02/20900-12-3456"); one to three more are as often a reference's own ("29 CFR 2590.715-2719").
    // Digits after it are another number's where the shape starts at its group's start and cents follow them
    // ("900-12-3456150.00"), they begin a second shape ("202-555-0123202-555-0124") or they begin a date
    // ("202-555-012301/02/2020"). A group joined by the reference's own joiner is the reference's ("2026-0115-123-4567",
    // "123-45-67890-01": the review of the fix round, C2-3).
    const joinBefore = before === undefined ? '' : text.slice(before.end, a.start);
    const yearBefore = head === 4 && /^(?:19|20)/u.test(a.digits) && YEAR_GLUED_BEFORE.test(text.slice(Math.max(0, a.start - 40), a.start));
    const headAnothers = head > 0 && (inCurrency || yearBefore || (head === 2 && joinBefore === '.') || (head === 2 && DATE_GLUED_BEFORE.test(text.slice(Math.max(0, a.start - 10), a.start))));
    const second = tail === 3 && after !== undefined && last !== undefined && (after.digits.length === 2 || after.digits.length === 3) && last.digits.length >= 4 && TIGHT_JOIN.test(text.slice(c.end, after.start)) && TIGHT_JOIN.test(text.slice(after.end, last.start));
    const tailAnothers = head === 0 && tail > 0 && (CENTS_GLUED.test(text.slice(c.end, c.end + CENTS_REACH)) || second || DATE_GLUED_AFTER.test(text.slice(c.start + 4, c.start + DATE_AFTER_REACH)));
    // A noun names the whole joined number, from its reference's start ("Policy No. 01-23456-78-9012"), under a label's
    // words too where the noun stands nearer the number ("Medicare Summary Notice 802-45-678901", "Fax confirmation number
    // 802-456-78901": the review of the fix round's delta, D2-3).
    if (named(a)) continue;
    if (labeled(a, b.digits.length) && (head === 0 || headAnothers)) return 'structure';
    if (headAnothers || tailAnothers) return 'structure';
    if (!inCurrency && head === 0) {
      // No structure says whose the digits after it are ("900-01-202012th", "(202) 555-01234"): a held letter refuses it,
      // a line's own numbers written so among them ("Line (001) 420-97110": the reviews of the last two deltas, E2-5 and
      // G1-4, the second the one that decides: the two cannot be told apart).
      shape = true;
    }
  }
  return shape ? 'shape' : null;
}

interface ScanGroup {
  readonly start: number;
  readonly end: number;
  readonly digits: string;
  readonly blocked: boolean;
  readonly kept: boolean;
  readonly range: number;
  readonly named: boolean;
}

interface HeldScan {
  readonly text: string;
  readonly groups: readonly ScanGroup[];
  readonly currencyAt: Uint8Array;
  readonly dateAt: Uint8Array;
  readonly amountAt: Uint8Array;
  readonly amountStarts: Int32Array;
  readonly rangeSpans: ReadonlyMap<number, readonly { readonly start: number; readonly end: number; readonly amount: boolean }[]>;
  readonly rangeEnds: ReadonlyMap<number, number>;
  readonly labeledAt: (start: number, glued?: boolean) => ScanLabel;
}

/** A state's postal abbreviation, or ZIP and its connectors, before a ZIP code: what names a five, or a five and four, as one. */
const STATE = '(?:A[LKZRSAEP]|C[AOT]|D[EC]|D\\.C\\.?|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOTP]|N[EVHJMYCD]|N\\.[YJCHMD]\\.?|O[HKR]|PA|RI|R\\.I\\.?|S[CD]|S\\.[CD]\\.?|T[NX]|UT|V[TA]|W[AVIY]|W\\.V\\.?|PR|GU|VI)';
const STATE_NAME =
  '(?:ALABAMA|ALASKA|ARIZONA|ARKANSAS|CALIFORNIA|COLORADO|CONNECTICUT|DELAWARE|DISTRICT OF COLUMBIA|FLORIDA|GEORGIA|HAWAII|IDAHO|ILLINOIS|INDIANA|IOWA|KANSAS|KENTUCKY|LOUISIANA|MAINE|MARYLAND|MASSACHUSETTS|MICHIGAN|MINNESOTA|MISSISSIPPI|MISSOURI|MONTANA|NEBRASKA|NEVADA|NEW HAMPSHIRE|NEW JERSEY|NEW MEXICO|NEW YORK|NORTH CAROLINA|NORTH DAKOTA|OHIO|OKLAHOMA|OREGON|PENNSYLVANIA|PUERTO RICO|RHODE ISLAND|SOUTH CAROLINA|SOUTH DAKOTA|TENNESSEE|TEXAS|UTAH|VERMONT|VIRGINIA|WASHINGTON|WEST VIRGINIA|WISCONSIN|WYOMING)';
const ZIP_BEFORE = new RegExp(`(?:(?<![\\p{L}\\p{N}])(?:${STATE}|${STATE_NAME})|(?<=[0-9])(?!ND)${STATE}|(?<!\\p{L})ZIP(?:[ \\t]?CODE)?[:#]?)[.,]?(?:[ \\t]{1,3}|[ \\t]{0,2}\\r?\\n[ \\t]{0,2})$`, 'u');
/** A code word, glued to a digit before it or not, and the codes after it up to a position: "CODES 97110 97140 ". */
const CODE_LIST_BEFORE = /(?<!\p{L})(?:CPT(?:[\p{Pd}− ]?4)?|HCPCS|CODES?|MODIFIERS?|REV(?:ENUE)?|ICD(?:[\p{Pd}− ]?10)?)(?:\(S\))?[®™]?[:#]?(?:[ \t]{1,3}[A-Z]?[0-9]{2,5}(?:[\p{Pd}−][A-Z0-9]{2})*,?)*(?:[ \t]{1,3}|[ \t]{0,2}\r?\n[ \t]{0,2})$/u;
const TAX_BEFORE = /(?<!\p{L})(?:F?EIN|TIN|TAX(?:PAYER)?[ \t]?I\.?D\.?(?:ENTIFICATION)?)\)?(?:[ \t]{0,3}(?:NO|NUMBER|NBR|NUM)\b\.?)?(?:[ \t]{0,3}\((?:F?EIN|TIN)\))?[ \t]{0,3}[:#]{0,2}[ \t]{0,3}$/u;
const LINE_BREAK_IN = new RegExp(LINE_BREAK, 'u');
const TIGHT_JOIN = /^[\p{Pd}−⁃˗➖./()_|\\'‘’ʼʹˊ′‵`~·‧∙⋅・•]{1,2}$/u;
/**
 * A date up to its last two digits, glued before a shape: its month and day before a two-digit year ("01/02/" before
 * "20900-12-3456"), or its year and month before its day ("2020-01-" before "02900-12-3456").
 */
const DATE_GLUED_BEFORE = /(?<![0-9])(?:(?:0?[1-9]|[12][0-9]|3[01])[/.\p{Pd}\u2212](?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}[/.\p{Pd}\u2212](?:0?[1-9]|1[0-2]))[/.\p{Pd}\u2212]$/u;
/** A date glued after a shape's last four digits: month, day and year, or year first, with their separators ("01/02/2020", "2020-01-02"). */
const DATE_GLUED_AFTER = new RegExp(
  `^(?:${[
    '(?:0?[1-9]|[12][0-9]|3[01])[/.\\p{Pd}\\u2212](?:0?[1-9]|[12][0-9]|3[01])[/.\\p{Pd}\\u2212](?:(?:19|20)[0-9]{2}|[0-9]{2})',
    '(?:19|20)[0-9]{2}[/.\\p{Pd}\\u2212](?:0?[1-9]|1[0-2])[/.\\p{Pd}\\u2212](?:0?[1-9]|[12][0-9]|3[01])',
    // its month as a word after its day, joined to it as a date's parts are or not at all ("01-JAN-2020", "01JAN20"), a
    // four-digit year after a space or a comma too ("01JAN 2020", "01-JAN, 2020": H1-2), never an amount that begins as
    // a year does, its cents after it ("NOV 2000.00": I2-6; a comma after the year ends the date and no more, "01JAN
    // 2020,150.00": J-1); across a space before it the word begins a date of its own ("802-45-678901 JAN
    // 15, 2026": G2-1), and so do two digits after a space ("01JAN 15")
    `(?:0?[1-9]|[12][0-9]|3[01])[/.\\p{Pd}\\u2212]?${MONTH_FOLDED}\\.?(?:[/.\\p{Pd}\\u2212]?(?:(?:19|20)[0-9]{2}|[0-9]{2})|[/.\\p{Pd}\\u2212 ,]{1,2}(?:19|20)[0-9]{2}(?!\\.[0-9]{2}(?![0-9])))`,
  ].join('|')})(?![0-9])`,
  'u',
);
/** A dash at a line's end and the next line's indentation: a number wrapped after its joiner ("900-12-\n3456150.00"). */
const WRAPPED_JOIN = /^[\p{Pd}−][ \t]{0,16}(?:\r\n|[\n\r])[ \t]{0,16}$/u;
/** What stands between a labeled number's groups in its usual writing: white space, a joiner or a parenthesis, on one line. */
const LOOSE_JOIN = /^(?=.)[ \t]{0,2}[\p{Pd}−./()]{0,2}[ \t]{0,2}$/u;
/** After a phone's area code in parentheses: the closing parenthesis, then spaces, a dash or a point, or the line's end and the next line's indentation. */
const PAREN_JOIN = /^[ \t]?\)(?:[ \t]{0,2}[\p{Pd}\u2212.]?[ \t]{0,2}|[ \t]{0,16}(?:\r\n|[\n\r])[ \t]{0,16})$/u;
/** How far past a number's last four DATE_GLUED_AFTER reads. */
const DATE_AFTER_REACH = 32;
const ROW_GAP = /^[ \t]{1,16}$/u;
/** A row's units written in parentheses: "97110 (2) 150.00". */
const ROW_UNITS_OPEN = /^[ \t]{1,16}\($/u;
const ROW_UNITS_CLOSE = /^\)[ \t]{1,16}$/u;
/** A code's modifiers between it and its units on a row: up to four of two letters or digits ("97110 GP 59 2 150.00"). */
const ROW_MODIFIERS = /^[ \t]{1,16}(?:[A-Z][A-Z0-9][ \t]{1,16}|[0-9][A-Z][ \t]{1,16}){1,4}$/u;
/** What stands between two codes of one list: a space or two, or a comma and one. */
const CODE_LIST_GAP = /^(?:[ \t]{1,3}|,[ \t]{0,2})(?:[A-Z][0-9]{4}(?:[ \t]{1,3}|,[ \t]{0,2}))*$/u;

/**
 * Whether a held letter (survivorIn's 'held': a chain that only the range fix's barriers hold, in a letter cc3dd7f6 refused)
 * holds a number that could be a person's, read with nothing taken on trust but what its structure places (docs/adr/0054,
 * the amendment of co-001/redact-ssn-phone-leaks; the orchestrator's ruling A of 2026-11-07). In a letter with no held
 * range these shapes stay what the scan reads them as (R1's "150.00 1234", a code column, a local number with no label):
 * 1. an amount, with or without a currency sign, a dash and a date as one range holds nothing ("1499.90-07/14/2021St");
 * 2. beside a held range: a number no barrier holds, or one a noun names, joined to its end by a joiner alone ("Ref
 *    5900481017(April 3, 2025-7125.74"); a number no barrier holds before its first end across white space ("34569
 *    01-12-1985-150.00"); a word glued to its end and then a bare nine or ten ("302.23.Ref 5900335398"); and a number of
 *    seven digits or more, one or two letters and a date with nothing between ("2025550122th10-28-2026");
 * 3. chains read again with unsigned amounts and groups of five to seven digits as parts of a chain, twelve groups at
 *    most, after what must stay is placed by its structure (a currency amount; a standing date; a nine or ten that NPI,
 *    TIN or EIN names; a ZIP or ZIP+4 after a state or ZIP; two five-digit codes joined by a dash or a slash; a TIN written
 *    two and seven; the codes of a list a code word begins; a service-line row's code and units before its amount, modifiers
 *    between them too; a code and the next line's count; a code's digits after its one letter): nine or ten digits, eleven
 *    starting with 1, or a local number of three and four, holding one group no barrier holds; under an SSN or phone label,
 *    nine digits or more of groups no barrier holds. A year beside an amount stays ("150.00 2026", "2026 150.00"), and a
 *    local number's shape inside a longer token ("SYN-APL-123-4567") or after a currency amount;
 * 4. a date written two, two and four with dashes and a lone digit across white space beside it ("9 01-12-1985"), never a
 *    time after it.
 */
function heldStrict(scan: HeldScan): boolean {
  const { text, groups, currencyAt, dateAt, amountAt, amountStarts, rangeSpans, rangeEnds, labeledAt } = scan;
  const amountFirstOf = new Map<number, boolean>();
  const amountFirst = (range: number): boolean => {
    if (range < 0) return false;
    let held = amountFirstOf.get(range);
    if (held === undefined) {
      const spans = rangeSpans.get(range) ?? [];
      const firsts = spans.filter((span) => span.start === range);
      held = firsts.length > 0 && firsts.every((span) => span.amount || currencyAt[span.start] === 1) && spans.some((span) => !span.amount && currencyAt[span.start] !== 1);
      amountFirstOf.set(range, held);
    }
    return held;
  };
  const gap = (a: ScanGroup, b: ScanGroup) => text.slice(a.end, b.start);
  const sameAmount = (a: ScanGroup, b: ScanGroup) => amountAt[a.start] === 1 && amountAt[b.start] === 1 && amountStarts[a.start] === amountStarts[b.start];
  // (1) an amount, then a date, as one range holds nothing here
  if (groups.some((group) => group.blocked && amountFirst(group.range))) return true;
  // (2) beside a held range
  for (const [range, end] of rangeEnds) {
    const before = firstIndex(groups, (group) => group.start >= range) - 1;
    const after = firstIndex(groups, (group) => group.start >= end);
    if (groups.slice(before + 1, after).every((group) => group.kept)) continue;
    const left = groups[before];
    const right = groups[after];
    const leftGap = left === undefined ? '' : text.slice(left.end, range);
    const rightGap = right === undefined ? '' : text.slice(end, right.start);
    if (left !== undefined && (!left.blocked || left.named) && /^[^\s\p{L}\p{N}]+$/u.test(leftGap) && SCAN_LABELED_GAP.test(leftGap)) return true;
    if (right !== undefined && (!right.blocked || right.named) && /^[^\s\p{L}\p{N}]+$/u.test(rightGap) && SCAN_LABELED_GAP.test(rightGap)) return true;
    if (left !== undefined && left.range !== range && !left.blocked && SCAN_GAP.test(leftGap)) return true;
    if (right !== undefined && (right.digits.length === 9 || right.digits.length === 10) && /^\.?\p{L}+[.:#]?(?:[ \t]{1,3}(?:NO|NUMBER|NBR|NUM|ID)\b[.:#]?)?[ \t]{0,3}$/u.test(rightGap)) return true;
  }
  // a number, one or two letters and a date, nothing between: "2025550122th10-28-2026"
  for (let i = 0; i + 1 < groups.length; i += 1) {
    const [a, b] = [groups[i], groups[i + 1]];
    if (a !== undefined && b !== undefined && !a.blocked && a.digits.length >= 7 && b.blocked && dateAt[b.start] === 1 && /^\p{L}{1,2}$/u.test(gap(a, b))) return true;
  }
  // what is placed by its structure: never a part of a chain
  const placed = new Uint8Array(groups.length);
  const taxOrNpi = (group: ScanGroup) => group.named && /(?:NPI|TIN|EIN|TAX[ \t]?ID(?:ENTIFICATION)?)[^\p{L}\p{N}]*(?:(?:NO|NUMBER|NBR|NUM|ID)[^\p{L}\p{N}]*)*$/u.test(text.slice(Math.max(0, group.start - 40), group.start));
  let inList = false;
  groups.forEach((group, i) => {
    const next = groups[i + 1];
    const before = text.slice(Math.max(0, group.start - 64), group.start);
    if (currencyAt[group.start] === 1 || (group.blocked && dateAt[group.start] === 1) || taxOrNpi(group)) placed[i] = 1;
    // a code's own digits after its one letter ("N235", "G0283"), and an ICD-10 code's after its point, an amount to the
    // scan ("M54.50")
    if (/(?<!\p{L})\p{L}(?:[0-9]{2}\.)?$/u.test(before)) placed[i] = 1;
    if (group.blocked) {
      inList = false;
      return;
    }
    const length = group.digits.length;
    const nextFree = next !== undefined && !next.blocked ? next : undefined;
    const between = next === undefined ? '' : gap(group, next);
    // a ZIP code after a state or ZIP, with its four
    if (length === 5 && ZIP_BEFORE.test(before)) {
      placed[i] = 1;
      if (nextFree?.digits.length === 4 && /^[\p{Pd}−]$/u.test(between)) placed[i + 1] = 1;
    }
    // two codes joined by a dash or a slash
    if (length === 5 && nextFree?.digits.length === 5 && /^[\p{Pd}−/]$/u.test(between)) {
      placed[i] = 1;
      placed[i + 1] = 1;
    }
    // a TIN written two and seven
    if (length === 2 && nextFree?.digits.length === 7 && /^[\p{Pd}−]$/u.test(between) && TAX_BEFORE.test(before)) {
      placed[i] = 1;
      placed[i + 1] = 1;
    }
    // codes a code word names, the list going on from code to code
    const previous = groups[i - 1];
    if (length <= 5 && (CODE_LIST_BEFORE.test(before) || (inList && previous !== undefined && CODE_LIST_GAP.test(gap(previous, group))))) {
      placed[i] = 1;
      inList = true;
    } else {
      inList = false;
    }
    // a code, its units and an amount on one line: a service-line row
    if (length === 5 && /(?:^|[\s])$/u.test(before)) {
      const units = nextFree !== undefined && nextFree.digits.length <= 2 && (ROW_GAP.test(between) || ROW_MODIFIERS.test(between) || ROW_UNITS_OPEN.test(between)) ? nextFree : undefined;
      const amount = units === undefined ? next : groups[i + 2];
      const toAmount = amount === undefined ? '' : text.slice((units ?? group).end, amount.start);
      if (amount !== undefined && amount.blocked && amountAt[amount.start] === 1 && (ROW_GAP.test(toAmount) || (units !== undefined && ROW_UNITS_CLOSE.test(toAmount)))) {
        placed[i] = 1;
        if (units !== undefined) placed[i + 1] = 1;
      }
      // a code and the next line's count
      if (nextFree !== undefined && nextFree.digits.length <= 4 && LINE_BREAK_IN.test(between) && SCAN_GAP.test(between)) {
        placed[i] = 1;
        placed[i + 1] = 1;
      }
    }
  });
  const chained = (digits: string) => digits.length === 9 || digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  // (4) chains
  for (let first = 0; first < groups.length; first += 1) {
    let digits = '';
    let free = 0;
    const label = labeledAt(groups[first]?.start ?? 0);
    for (let count = 1; count <= 12 && first + count <= groups.length; count += 1) {
      const group = groups[first + count - 1];
      const previous = groups[first + count - 2];
      if (group === undefined || placed[first + count - 1] === 1 || (group.digits.length >= 8 && label === null)) break;
      if (count > 1 && (previous === undefined || !(SCAN_GAP.test(gap(previous, group)) || sameAmount(previous, group)))) break;
      digits += group.digits;
      if (!group.blocked) free += 1;
      const run = groups.slice(first, first + count);
      // under a label the number may be glued to more digits
      if (label !== null && count >= 2 && digits.length >= 9 && !chained(digits) && run.every((each) => !each.blocked)) return true;
      if (digits.length > 11) break;
      const local = count === 2 && run[0]?.digits.length === 3 && run[1]?.digits.length === 4 && !run[0].blocked && !run[1].blocked;
      if (count < 2 || free === 0 || !(chained(digits) || local)) continue;
      const firstGroup = run[0];
      const last = run[run.length - 1];
      if (firstGroup === undefined || last === undefined) continue;
      const before = text.slice(Math.max(0, firstGroup.start - 48), firstGroup.start);
      // an amount and a year, either way round
      if (!last.blocked && /^(?:19|20)[0-9]{2}$/u.test(last.digits) && run.slice(0, -1).every((each) => each.blocked && amountAt[each.start] === 1)) continue;
      if (!firstGroup.blocked && /^(?:19|20)[0-9]{2}$/u.test(firstGroup.digits) && run.slice(1).every((each) => each.blocked && amountAt[each.start] === 1)) continue;
      // a local number's shape inside a longer token, or after a currency amount
      if (local && (/\p{L}[\p{Pd}−]$/u.test(before) || /\p{Sc}[ \t]?[0-9][0-9,]*(?:\.[0-9]{1,2})?[ \t]{1,3}$/u.test(before))) continue;
      return true;
    }
  }
  // (5) a date written two, two and four with a lone digit beside it
  for (let i = 0; i + 3 < groups.length; i += 1) {
    const run = groups.slice(i, i + 4);
    const lengths = run.map((each) => each.digits.length).join(',');
    const gaps = run.slice(1).map((each, k) => gap(run[k] as ScanGroup, each));
    const dash = (each: string | undefined) => /^[\p{Pd}\u2212]{1,2}$/u.test(each ?? '');
    const space = (each: string | undefined) => /^[ \t]{1,3}$/u.test(each ?? '');
    const last = run[3];
    const time = last !== undefined && /^:[0-9]/u.test(text.slice(last.end, last.end + 2));
    if (lengths === '1,2,2,4' && space(gaps[0]) && dash(gaps[1]) && dash(gaps[2]) && run.some((each) => !each.blocked)) return true;
    if (lengths === '2,2,4,1' && dash(gaps[0]) && dash(gaps[1]) && space(gaps[2]) && !time && run.some((each) => !each.blocked)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------
// Redaction

const RANK: Readonly<Record<Kind, number>> = { claim: 0, member: 1, birth: 2, name: 3, ssn: 4, phone: 5 };
const PLACEHOLDERS: Readonly<Record<Exclude<Kind, 'claim'>, string>> = { member: '[MEMBER_ID]', birth: '[DATE_OF_BIRTH]', name: '[PATIENT_NAME]', ssn: '[SSN]', phone: '[PHONE]' };

const isPatternKind = (kind: Kind): kind is PatternKind => kind === 'ssn' || kind === 'phone';

/**
 * Overlapping matches as one span each, its placeholder chosen by kind, never by length: [CLAIM_n] (the
 * lowest n) if any claim's number is in it, else [MEMBER_ID], else [DATE_OF_BIRTH], else
 * [PATIENT_NAME], else [SSN], else [PHONE]. Every placeholder hides the whole span; the claim's is the one
 * the task needs. A match of the call's own inside, and not equal to, a Social Security or phone number that
 * is not the call's lends that span no rank (R6b: the call's short claim 1234 in another patient's 900-55-1234).
 */
function merge(found: readonly Found[]): { readonly start: number; readonly end: number; readonly placeholder: string }[] {
  const spans: Found[] = [];
  let reach: Found | undefined;
  const sorted = [...found].sort((a, b) => a.start - b.start || b.end - a.end).map((match) => {
    if (isPatternKind(match.kind)) {
      if (reach === undefined || match.end > reach.end) {
        reach = match;
      }
      return match;
    }
    return reach !== undefined && reach.start <= match.start && match.end <= reach.end && (reach.start !== match.start || reach.end !== match.end) ? { ...match, kind: reach.kind, claim: 0 } : match;
  });
  for (const match of sorted) {
    const last = spans.at(-1);
    if (last !== undefined && match.start < last.end) {
      const better = RANK[match.kind] < RANK[last.kind] || (match.kind === 'claim' && last.kind === 'claim' && match.claim < last.claim);
      spans[spans.length - 1] = { start: last.start, end: Math.max(last.end, match.end), kind: better ? match.kind : last.kind, claim: better ? match.claim : last.claim };
    } else {
      spans.push(match);
    }
  }
  return spans.map((span) => ({ start: span.start, end: span.end, placeholder: span.kind === 'claim' ? `[CLAIM_${String(span.claim)}]` : PLACEHOLDERS[span.kind] }));
}

const letterSubject = (patient: PatientIdentifiers, claims: readonly LetterClaim[]): Subject => ({
  names: patient.names,
  memberIds: patient.memberIds,
  claims: claims.map((claim) => claim.claimNumbers),
  datesOfBirth: patient.datesOfBirth,
  initials: true,
  patterns: true,
});

/** The identifiers' forms (letters and digits, folded) with their placeholders, longest first, as the matcher reads them. */
export function redactionForms(patient: PatientIdentifiers, claims: readonly LetterClaim[]): { readonly form: string; readonly placeholder: string }[] {
  return formsOf(letterSubject(patient, claims))
    .map((form) => ({ form: form.compact, placeholder: form.kind === 'claim' ? `[CLAIM_${String(form.claim)}]` : PLACEHOLDERS[form.kind] }))
    .sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form) || a.placeholder.localeCompare(b.placeholder));
}

/**
 * The letter as NFKC text with its own square brackets made parentheses, so the only square brackets
 * sent are placeholders: a letter that writes "[CLAIM_1]" itself cannot have it cited as claim 1.
 * Each bracket is one UTF-16 unit, so every position stays where it was.
 */
const unbracketed = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (bracket) => (bracket === '[' ? '(' : ')'));

/**
 * NFKC text with the checks' own marks (BARRIER, NAME_MARK, OWN_MARK) read as the control character each is to every
 * other reader, one for one: a letter's own U+0001 ends no label's window and its own U+0003 is no placeholder of the
 * call's identifier (the review of the build, B1-4). Matches are found on this reading and cut from the text as written.
 */
const unmarked = (normal: string) => normal.replace(PRIVATE_MARKS, '\u0004');

/**
 * The matches the letter reader's redaction applies to NFKC text (redactLetterForScreen, whose text is sent only when
 * holdsIdentifier then finds nothing in it; redactLetter and redactionSpans apply every match). A match ef3e8d20 did not
 * make that can change what the survivor scan chains (Found.fresh) is applied only where the scan as ef3e8d20 read it does
 * not refuse the letter without it (chainLeft, not strict): where it does, ef3e8d20 refused the letter, and it stays
 * refused with those numbers as written, by the check on that same text (the review of the build, B1-1 and B1-5: no test
 * of what stands beside the number, which an invisible character defeats).
 */
function appliedMatches(normal: string, subject: Subject, claims: number): Found[] {
  const found = matchesIn(unmarked(normal), subject).filter((match) => match.withheld !== true);
  if (!found.some((match) => match.fresh === true)) {
    return found;
  }
  const settled = found.filter((match) => match.fresh !== true);
  return chainLeft(written(normal, merge(settled)), subject, claims, false) ? settled : found;
}

/**
 * The letter as NFKC text and the spans redaction replaces in it, in order, each with its placeholder: what redactLetter
 * writes. The first reading runs as on the base, with no counter (this entry has no refusal of its own to give for
 * it). What MOD-23 adds, the wider reading and the first reading's check that decides whether its matches are applied
 * (refusedAsFirstRead), counts its work from nothing on the check's counter: past the budget (CHECK_WORK_BUDGET) the
 * text is that text with the mark the check refuses after its last character (refusedByMarkAfter), and the
 * spans are the first reading's, each where it was. The catch below is this entry's own and holds only its own count.
 * The same text and spans where one of the call's digits-only numbers stands whole and glued to a letter in the letter
 * as written (gluedBeforeRedaction; MOD-25, rule (a)): the check refuses it whatever a placeholder took of the number.
 */
export function redactionSpans(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): { readonly text: string; readonly spans: readonly { readonly start: number; readonly end: number; readonly placeholder: string }[] } {
  const normal = unbracketed(text);
  const subject = letterSubject(patient, claims);
  // The first reading's spans, as before; the wider reading's are added under the rule redactLetterForScreen keeps
  // (redactedForScreen): only to a text the first reading's check does not refuse, so that no placeholder of the wider
  // reading hides what that check read ("Service 01/01/2020-150.00 Paid" for a claim number held "150.00": with the
  // amount replaced the letter is held no more, and a number the held letter is refused for would be sent. Review A-1).
  return inOneReading(() => {
    const found = matchesIn(unmarked(normal), subject);
    const first = merge(found);
    const before = checkWorkSpent;
    checkWorkSpent = 0;
    try {
      const covered = within([...first]);
      const raw = unmarked(normal);
      const wider = widerMatchesIn(raw, subject).filter((match) => !covered(match));
      // Rule (a) on the letter as written, before any placeholder (gluedBeforeRedaction): the first reading's spans, and the
      // mark. Where neither reading replaces anything the text is the letter as written, which the check reads itself.
      if (first.length + wider.length > 0 && gluedBeforeRedaction(raw, subject, first)) {
        return { text: refusedByMarkAfter(normal), spans: first };
      }
      const asFirstWrote = written(normal, first);
      if (wider.length > 0 && refusedAsFirstRead(asFirstWrote, patient, claims)) {
        return { text: normal, spans: first };
      }
      // What the base's whole entry refuses stays refused, with the spans the base wrote (refusedAsTheBaseRead).
      const both = wider.length === 0 ? first : merge([...found, ...wider]);
      const sent = wider.length === 0 ? asFirstWrote : written(normal, both);
      const base = refusedAsTheBaseRead(normal, raw, subject, { found, spans: first, text: asFirstWrote }, wider.length > 0 ? false : undefined, sent, patient, claims);
      if (base !== null) {
        return { text: base.byFirstRead ? normal : refusedByMarkAfter(normal), spans: base.spans };
      }
      return { text: normal, spans: both };
    } catch (error) {
      if (!(error instanceof PastCheckWorkBudget)) {
        throw error;
      }
      // Past the budget the wider reading or its check did not run to its end: the first reading's spans, and the mark.
      return { text: refusedByMarkAfter(normal), spans: first };
    } finally {
      checkWorkSpent = before;
    }
  });
}

/** A span of NFKC text and the placeholder written for it (merge). */
type PlacedSpan = Range & { readonly placeholder: string };

/** NFKC text with the spans replaced by their placeholders (those `replace` takes). */
function written(normal: string, spans: readonly { readonly start: number; readonly end: number; readonly placeholder: string }[]): string {
  let text = '';
  let kept = 0;
  for (const span of spans) {
    text += normal.slice(kept, span.start) + span.placeholder;
    kept = span.end;
  }
  return text + normal.slice(kept);
}

const claimPlaceholders = (claims: readonly LetterClaim[]) => new Map(claims.map((claim, index) => [`[CLAIM_${String(index + 1)}]`, claim.claimId]));

export function redactLetter(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted {
  const { text: normal, spans } = redactionSpans(text, patient, claims);
  return { text: written(normal, spans), claims: claimPlaceholders(claims), replaced: spans.length };
}

/**
 * The letter redacted (as redactLetter), and the runs the one-patient screen asks the practice's records about
 * (docs/adr/0054, amendment of 2026-11-04, section 5 and R6): identifierCandidates of the sent text; identifierCandidates
 * of the letter with only the call's own identifiers replaced and the Social Security and phone numbers left as written,
 * read twice: with every span that takes a placeholder of the call's own replaced, and with the call's own matches alone
 * replaced, so that a number that merges under such a placeholder is offered too ("Member ID: ZZ1980O314", a line break
 * and "555-0123" is sent as "Member ID: [MEMBER_ID]" for member ID ZZ19800314 and offers 5550123, as ef3e8d20 offers it:
 * reviews L-1 and M-1);
 * and the compact form of every Social Security or phone number that is not the call's own, whole, its core digits and
 * joined to the token written against it. The call's own member IDs and claim numbers are never among them.
 * PHI: for the screen only, in memory; never sent, logged, stored, or put in an error or a job payload. Not exported
 * from the package (index.ts), so it is no part of its public type.
 */
export function redactLetterForScreen(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted & { readonly candidates: readonly string[] } {
  const before = checkWorkSpent;
  checkWorkSpent = 0;
  let redacted: Redacted & { readonly candidates: readonly string[] };
  // Past the budget unless the reading ran to its end within it.
  let spent = CHECK_WORK_BUDGET + 1;
  try {
    redacted = redactedForScreen(text, patient, claims);
    spent = checkWorkSpent;
  } catch (error) {
    if (!(error instanceof PastCheckWorkBudget)) {
      throw error;
    }
    redacted = { text: unreadPastTheBudget, claims: claimPlaceholders(claims), replaced: 0, candidates: [] };
  } finally {
    checkWorkSpent = before;
  }
  workOfRedacted.set(redacted, spent);
  return redacted;
}

/**
 * redactLetterForScreen's reading, its work counted by the entry above: the first reading (screenAsFirstRead), then the
 * wider one and the check that decides whether its matches are applied (MOD-23), all on the one counter.
 */
function redactedForScreen(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted & { readonly candidates: readonly string[] } {
  return inOneReading(() => screenAsBothRead(text, patient, claims));
}

/** redactedForScreen's two readings, the first (screenAsFirstRead) and the wider one, inside one entry's stores (inOneReading). */
function screenAsBothRead(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted & { readonly candidates: readonly string[] } {
  work(WORK.character * text.length + workOfIdentifiers(patient, claims));
  const normal = unbracketed(text);
  // The reading is of the letter as NFKC writes it, which can be many times as long as the letter (U+FDFA is eighteen characters).
  if (normal.length > text.length) {
    work(WORK.character * (normal.length - text.length));
  }
  const subject = letterSubject(patient, claims);
  const first = screenAsFirstRead(normal, subject, claims);
  // The wider reading (widerMatchesIn; MOD-23) only adds, and only to a letter the first reading sends. What the first
  // reading's own check refuses, as written or with its CR LF line endings read as line feeds (refusedAsFirstRead), is
  // returned as the first reading wrote it, and the check, which reads no less, refuses it again: no placeholder of the
  // wider reading can hide what that check read in either writing (review A-2: a member ID held "3456150.00" replaced
  // in "No. 900-12-3456150.00" after a CR LF hid the number from the reading with line feeds). In a letter it sends, every span the first
  // reading replaced is replaced (merge only joins and widens spans), and every run it offered the screen is offered.
  const covered = within([...first.spans]);
  const raw = unmarked(normal);
  const wider = widerMatchesIn(raw, subject).filter((match) => !covered(match));
  // Rule (a) of MOD-25 is read here, on the letter as written and before any placeholder is: a digits-only number that
  // stands whole and glued to a letter refuses the letter whatever took a part of it (gluedBeforeRedaction). The first
  // reading's text with the mark the check refuses at its first line: no more of the letter than that reading writes.
  // Where neither reading replaces anything, what is sent to the check is the letter as written: the check reads the
  // rule on that same text and refuses it itself, so the letter is left as it is and nothing is read twice.
  if (first.spans.length + wider.length > 0 && gluedBeforeRedaction(raw, subject, first.spans)) {
    return { text: refusedByMarkAfter(first.text), claims: first.claims, replaced: first.replaced, candidates: first.candidates };
  }
  // Both the wider reading and the check asked again here count their work on this letter's counter, the check as a
  // check of its own is charged (holdsAsFirstRead): past the budget the entry refuses the letter, with no text of it.
  const asFirstWrote = { text: first.text, claims: first.claims, replaced: first.replaced, candidates: first.candidates };
  if (wider.length > 0 && refusedAsFirstRead(first.text, patient, claims)) {
    return asFirstWrote;
  }
  const widened = (spans: readonly PlacedSpan[]) => {
    const sent = written(normal, spans);
    const own = new Set(formsOf(subject).flatMap((form) => (form.kind === 'claim' || form.kind === 'member' ? [form.compact] : [])));
    const candidates = new Set([...first.candidates, ...identifierCandidates(sent).filter((candidate) => !own.has(candidate))]);
    return { text: sent, claims: first.claims, replaced: spans.length, candidates: [...candidates].sort() };
  };
  // What the base's whole entry refuses stays refused (the ruling on finding (C) of Queues item 34's reviews): the letter
  // is returned as the base wrote it, which the check refuses again, and nothing MOD-25 widened replaces what the base's
  // check refused it for ("Fax 7777,7:1111,7777.7" for a member ID held "7,7,7,7,7": the base wrote "Fax
  // [MEMBER_ID]:1111,7777.7" and refused it; with the second writing replaced too, the letter was sent). Asked on a
  // counter and stores of its own (asTheBaseRead): it changes nothing of what this entry counts.
  const both = wider.length === 0 ? first.spans : merge([...first.found, ...wider]);
  const base = refusedAsTheBaseRead(normal, raw, subject, first, wider.length > 0 ? false : undefined, wider.length === 0 ? first.text : written(normal, both), patient, claims);
  if (base !== null) {
    const wrote = base.spans === first.spans ? asFirstWrote : widened(base.spans);
    return base.byFirstRead ? wrote : { ...wrote, text: refusedByMarkAfter(wrote.text) };
  }
  return wider.length === 0 ? asFirstWrote : widened(both);
}

/**
 * A reading as the base of Queues item 34 gave it (baseReading), apart from the entry that asks: on a counter of its own
 * that starts from nothing, with stores of its own, so that the entry's count and stores are, after it, what they were
 * before it. Past the budget on its own counter it throws as any reading does (PastCheckWorkBudget), for the one who
 * asks to catch.
 */
function asTheBaseRead<T>(read: () => T): T {
  return apartFromTheEntry(true, read);
}

/**
 * A reading apart from the entry that asks: on a counter of its own that starts from nothing, with stores of its own,
 * as the base read (`asBase`) or as this reader reads. The entry's count and stores are, after it, what they were.
 */
function apartFromTheEntry<T>(asBase: boolean, read: () => T): T {
  const kept = { viewsOfCheck, datesOfCheck, formsOfCheck, alikeOfWider, storeScope, widerReading, checkWorkSpent, baseReading };
  viewsOfCheck = null;
  datesOfCheck = null;
  formsOfCheck = null;
  alikeOfWider = null;
  storeScope = null;
  widerReading = false;
  checkWorkSpent = 0;
  baseReading = asBase;
  try {
    return inOneReading(read);
  } finally {
    ({ viewsOfCheck, datesOfCheck, formsOfCheck, alikeOfWider, storeScope, widerReading, checkWorkSpent, baseReading } = kept);
  }
}

/**
 * Whether the base's whole entry refuses the letter (a97d73e4: the first reading, MOD-23's wider reading, and the check
 * on the text those wrote), and the spans and text it wrote; null where the base sent it. The rule of the ruling on
 * finding (C): refuse on either reading. A letter refused by the base's whole verdict stays refused, whatever a wider
 * reading can now replace. The blunt rule and no cleverer one: the base's own steps are run again, in order.
 *
 * 1. The base's wider matches on the letter as written, those the first reading's spans do not cover. With none, its
 *    text is the first reading's.
 * 2. Its gate: where the first reading's check refuses the first reading's text, as written or with its CR LF line
 *    endings as line feeds, that text stands (`firstRefused` is false where the entry's own gate, which reads those
 *    two writings and one more, has just answered no).
 * 3. Otherwise its text is the letter with the first reading's matches and those wider ones replaced.
 * 4. Its check of that text in both writings: the first reading's check, then the call's own identifiers left in the
 *    base's wider reading.
 *
 * The first reading's check of step 4 is asked here only where the base's text is not `sent`, the text the entry
 * returns if this answers null: of that very text holdsIdentifier asks the same check in the same writings itself, so
 * the letter is refused there as the base refused it, and asking here would read the letter once more for nothing.
 *
 * `byFirstRead` says the refusal is the first reading's check's, of the text the spans returned write: holdsIdentifier
 * asks that same check of it first, so the text refuses itself and goes back as the base wrote it. Where only the
 * base's wider reading refuses, or this reading passes the budget on its own counter (it counts no more than the base's
 * entry counted on the same steps, and the base counted its first reading besides), the one who asks marks the text
 * (refusedByMarkAfter): this reading's wider forms are not the base's, and nothing is assumed of them.
 *
 * One case needs no mark and gets none: the base's text is `sent` and only its wider reading refuses it here (the
 * first reading's check was not asked of it, above), and this reader's own whole check of `sent`, asked apart from the
 * entry on a count from nothing, refuses it. The answer is then null: the entry returns `sent` as it would have, and
 * holdsIdentifier, which starts from the entry's count and so refuses wherever a count from nothing does, refuses it
 * (a name glued to a number, "RE: Zephyra900-12-3456.": the text goes back as the base wrote it, without the mark).
 *
 * The first reading is not run again: MOD-25 changed nothing of it, so its matches, spans and text are the base's.
 */
function refusedAsTheBaseRead(
  normal: string,
  raw: string,
  subject: Subject,
  first: { readonly found: readonly Found[]; readonly spans: readonly PlacedSpan[]; readonly text: string },
  firstRefused: false | undefined,
  sent: string,
  patient: PatientIdentifiers,
  claims: readonly LetterClaim[],
): { readonly spans: readonly PlacedSpan[]; readonly byFirstRead: boolean } | null {
  let onSent = false;
  const refused = asTheBaseRead(() => {
    let spans = first.spans;
    try {
      const inBothWritings = (text: string, holds: (read: string) => boolean) => {
        const lineFeeds = asLineFeeds(text);
        return holds(text) || (lineFeeds !== text && holds(lineFeeds));
      };
      const firstReadHolds = (read: string) => holdsAsFirstRead(read, patient, claims);
      const covered = within([...first.spans]);
      const wider = widerMatchesIn(raw, subject).filter((match) => !covered(match));
      let text = first.text;
      if (wider.length > 0) {
        if (firstRefused ?? inBothWritings(first.text, firstReadHolds)) {
          return { spans, byFirstRead: true };
        }
        spans = merge([...first.found, ...wider]);
        text = written(normal, spans);
      }
      if (text !== sent && inBothWritings(text, firstReadHolds)) {
        return { spans, byFirstRead: true };
      }
      if (!inBothWritings(text, (read) => widerMatchesIn(masked(read, claims.length), subject).length > 0)) {
        return null;
      }
      onSent = text === sent;
      return { spans, byFirstRead: false };
    } catch (error) {
      if (!(error instanceof PastCheckWorkBudget)) {
        throw error;
      }
      return { spans, byFirstRead: false };
    }
  });
  return onSent && apartFromTheEntry(false, () => holdsIdentifier(sent, patient, claims)) ? null : refused;
}

/** redactLetterForScreen as the first reading alone gives it (matchesIn, appliedMatches), with the matches it applied and their spans. */
function screenAsFirstRead(
  normal: string,
  subject: Subject,
  claims: readonly LetterClaim[],
): Redacted & { readonly candidates: readonly string[]; readonly found: readonly Found[]; readonly spans: readonly PlacedSpan[] } {
  const found = appliedMatches(normal, subject, claims.length);
  const spans = merge(found);
  const sent = written(normal, spans);
  const own = new Set(formsOf(subject).flatMap((form) => (form.kind === 'claim' || form.kind === 'member' ? [form.compact] : [])));
  const candidates = new Set(identifierCandidates(sent));
  const screenText = written(
    normal,
    spans.filter((span) => span.placeholder !== PLACEHOLDERS.ssn && span.placeholder !== PLACEHOLDERS.phone),
  );
  // A pattern's number that merges under one of the call's own placeholders is hidden from that text with it: the screen
  // reads the letter once more with the call's own matches alone replaced, so the number is offered as it is written. A
  // match of the call's own inside a pattern's number, and not the whole of it, is that number's here as it is in merge
  // (R6b): a short claim number that is the number's last four digits stays as written with it (review M-1).
  const numbers = found.filter((match) => isPatternKind(match.kind));
  const inNumber = (match: Found) => someOf(numbers, (number) => number.start <= match.start && match.end <= number.end && (number.start !== match.start || number.end !== match.end));
  const ownText = written(normal, merge(found.filter((match) => !isPatternKind(match.kind) && !inNumber(match))));
  for (const candidate of [...identifierCandidates(screenText), ...(ownText === screenText ? [] : identifierCandidates(ownText)), ...found.flatMap((match) => match.compacts ?? [])]) {
    if (!own.has(candidate)) {
      candidates.add(candidate);
    }
  }
  return { text: sent, claims: claimPlaceholders(claims), replaced: spans.length, candidates: [...candidates].sort(), found, spans };
}

/**
 * NFKC text with each exact placeholder made the BARRIER, so no match reaches into or across one. A
 * claim's placeholder past the call's claims (all of them, for the screen, which knows no call) keeps its
 * digits between two barriers: a letter's own "[CLAIM_7654321]" still holds 7654321 for every check.
 */
const masked = (text: string, claims = 0, name = BARRIER, own = BARRIER) => maskedOf(unmarked(text.normalize('NFKC')), claims, name, own);

/** masked, of NFKC text that holds no mark of the checks but those its caller put there. */
const maskedOf = (normal: string, claims = 0, name = BARRIER, own = BARRIER) =>
  normal.replace(PLACEHOLDER, (placeholder, claim?: string) =>
    placeholder === PLACEHOLDERS.name ? name : placeholder === PLACEHOLDERS.ssn || placeholder === PLACEHOLDERS.phone ? BARRIER : claim === undefined || Number.parseInt(claim, 10) <= claims ? own : `${BARRIER}${claim}${BARRIER}`,
  );

/**
 * The part of the check that reads what the patterns and the identifiers' own patterns did not take: a chain of digits the
 * survivor scan reads as a number, or one of the call's identifiers glued to what stands beside it. With `strict` false it
 * leaves out every refusal co-001/redact-ssn-phone-leaks added (a label read through the call's own identifier or a list
 * number, gluedShape, heldStrict, the masked SSN glued outside a held letter, the digit-for-letter forms glued, the
 * unread date-of-birth writings, a placeholder read as a number): what
 * ef3e8d20 refused, and no less, which is what decides whether a match it did not make is applied (appliedMatches).
 */
function chainLeft(text: string, subject: Subject, claims: number, strict = true): boolean {
  // The text as written, and (strict) with a Social Security label a change of case sets apart read as a word of its own:
  // the worse of the two, so the second reading only adds (as a replacement it lost labels and chains of the first: the
  // review of the fix round, C1-1).
  const apart = strict ? text.replace(CASE_GLUED_LABEL, ' ') : text;
  let survivor = survivorLeft(masked(text, claims, OWN_MARK, OWN_MARK), strict);
  if (survivor !== 'survivor' && apart !== text) {
    survivor = survivorLeft(masked(apart, claims, OWN_MARK, OWN_MARK), strict) ?? survivor;
  }
  if (survivor === 'survivor' || ownIdentifierGlued(masked(text, claims, NAME_MARK), subject, survivor === 'held', strict) || (survivor === 'held' && birthBesideItsPlaceholder(text, subject))) {
    return true;
  }
  // A Social Security or phone number's placeholder is a number to what is glued to it: read once more with a digit in its place.
  if (!strict || !PATTERN_PLACEHOLDER_GLUED.test(text)) {
    return false;
  }
  const numbered = unmarked(text.normalize('NFKC')).replace(PATTERN_PLACEHOLDERS, (placeholder: string, at: number, whole: string) => `${LETTER_BEFORE.test(whole.slice(Math.max(0, at - 16), at)) ? '0' : ''}${BARRIER}${LETTER_AFTER.test(whole.slice(at + placeholder.length, at + placeholder.length + 16)) ? '0' : ''}`);
  return ownIdentifierGlued(maskedOf(numbered, claims, NAME_MARK), subject, survivor === 'held');
}

/**
 * Whether any of the identifiers is still in the text, in any form redaction reads, or a Social Security or phone number
 * by pattern, or a chain of digits the survivor scan reads as one no pattern took (the check after redaction:
 * docs/adr/0054, amendment of 2026-11-04, R7).
 */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[], spent = 0): boolean {
  // A letter that itself writes one of the checks' own three marks is refused: ef3e8d20 read a letter's own mark as its
  // placeholder and refused such letters in places ("Total<U+0002>for45.00 ...": the review of the last round's delta,
  // H1-1); this reading reads it as the control character it is (B1-4), and text that holds one is no text to trust.
  if (text.search(PRIVATE_MARKS) >= 0) {
    return true;
  }
  // The work the redaction of this letter spent comes with it (checkWorkOf): a count that is no count, or one past
  // the budget, refuses the letter before anything is read.
  if (typeof spent !== 'number' || !(spent >= 0 && spent <= CHECK_WORK_BUDGET)) {
    return true;
  }
  const before = checkWorkSpent;
  checkWorkSpent = spent;
  try {
    // The first reading's check, and the call's own identifiers in the wider reading (widerMatchesIn; MOD-23).
    const subject = letterSubject(patient, claims);
    // Then a digits-only number glued to a letter (digitsGluedToLetter; MOD-25), on the text the wider reading read.
    const holds = (read: string) => {
      if (holdsAsFirstRead(read, patient, claims)) {
        return true;
      }
      const scanned = masked(read, claims.length);
      return widerMatchesIn(scanned, subject).length > 0 || digitsGluedToLetter(scanned, subject);
    };
    // A CR LF is one line ending written in two characters, and every reach of a label, a noun or a window is counted in
    // characters: the text is read once more with each CR LF written as a line feed, and the worse answer is taken, so a
    // letter is refused wherever its writing with LF is ("SSN on file. Statement", CR LF and "No. 900-12-3456150.00":
    // review K-1 of co-001/redact-ssn-phone-leaks). The first reading stands, and this one only adds. Every reading
    // here counts its work on the one counter of the letter (work): the second reading is charged as the first is, and
    // a letter whose readings together pass the budget is refused, never read on. A third reading where a line feed
    // still stands right before a CR (asOneLineFeed; MOD-25, A-6), charged in full as the second is.
    return inOneReading(() => {
      const lineFeeds = asLineFeeds(text);
      return holds(text) || (lineFeeds !== text && holds(lineFeeds)) || (lineFeeds.includes('\n\r') && holds(asOneLineFeed(lineFeeds)));
    });
  } catch (error) {
    if (!(error instanceof PastCheckWorkBudget)) {
      throw error;
    }
    // Past the budget the check has not read the whole letter: it answers as it does for an identifier left.
    return true;
  } finally {
    checkWorkSpent = before;
  }
}

/**
 * Whether masked text holds one of the call's member IDs or claim numbers of digits alone, of WIDER_NUMBER_FLOOR digits
 * or more, with a letter right before or right after it (Queues item 34, MOD-25, rule (a); docs/adr/0054): "Fax
 * X76543210 ext 12", "XYZ76543210", "76543210B", "XYZ7654 3210", each sent in clear before, since no reading takes a
 * number with a letter against it unless a label word is. The check's alone: where the number ends cannot be known, so
 * the letter is REFUSED and nothing is redacted. The number is read in every form the readings hold it in: joined as
 * any number is, as the records hold it and with a run of marks there (numberForm), and each piece that is a number
 * of its kind (piecesOf). Only one side is asked: what stands on the other is not read ("XYZ76543210-01" and
 * "XYZ76543210123" are refused), and there is no exception for a date or an amount ("2026-11-15Paid" for a claim
 * number 20261115). A digit right beside the number is another, longer number and stays the recorded residual of the
 * amendment of 2026-10-27 ("976543210", "765432109B"), as does a number under the floor ("Account1234").
 *
 * Read on the plain fold and, where a look-alike stands, on the look-alike fold, as the wider reading is, and in every
 * writing the check reads (holdsIdentifier). It runs as part of the wider reading (widerReading): the view is the one
 * that reading stored of this same text, taken for nothing, so a reading costs WORK.formCharacter for each character
 * and form, and a call with no such number costs nothing at all.
 *
 * With `hidden` (gluedBeforeRedaction, on the letter as written), a place the number stands so is not counted where
 * `hidden` says so of where the text given writes it: every such place is asked, not the first alone.
 */
function digitsGluedToLetter(normal: string, subject: Subject, hidden?: (range: Range) => boolean, alikeKnown?: boolean): boolean {
  const outer = widerReading;
  widerReading = true;
  try {
    if (!mayHoldWiderNumber(subject)) {
      return false;
    }
    const read = () => {
      const numbers = [...formsOf(subject), ...formsOf(subject, true)].filter((form) => (form.kind === 'claim' || form.kind === 'member') && form.digitsOnly && [...form.compact].length >= WIDER_NUMBER_FLOOR);
      const cores = new Set(numbers.flatMap(gluedCoresOf));
      if (cores.size === 0) {
        return false;
      }
      work(WORK.formCharacter * cores.size * normal.length);
      const view = viewOf(normal, 'join');
      const { text } = view;
      // A core is a form's whole writing, so it stands only where the form's compact does (lemma 1): one that stands
      // nowhere is not asked, and every answer is the one asking it gives. The charge above is for every core.
      const places = placesOf(text, numbers.map((form) => form.compact));
      const standing = new Set(numbers.filter((form) => mayStand(form, places)).flatMap(gluedCoresOf));
      if (hidden === undefined) {
        return [...cores].some((core) => standing.has(core) && new RegExp(`(?<=\\p{L})(?:${core})|(?:${core})(?=\\p{L})`, 'u').test(text));
      }
      // Every place the number stands so, each asked for by where it is written: one that is not hidden answers.
      return [...cores].some((core) => {
        if (!standing.has(core)) {
          return false;
        }
        const glued = new RegExp(`(?<=\\p{L})(?:${core})|(?:${core})(?=\\p{L})`, 'gu');
        for (let match = glued.exec(text); match !== null; match = glued.exec(text)) {
          if (!hidden(inNormal(view, match.index, match.index + match[0].length))) {
            return true;
          }
          glued.lastIndex = match.index + 1;
        }
        return false;
      });
    };
    // The look-alike fold where the wider reading read this text on it: its own answer, taken for nothing.
    // Or the answer its caller holds for the same letter in another writing of its line endings (gluedBeforeRedaction).
    const alike = alikeKnown ?? (alikeOfWider !== null && alikeOfWider.normal === normal && alikeOfWider.subject === subject ? alikeOfWider.alike : alikeReads(normal, subject));
    return read() || (alike && onFold('alike', read));
  } finally {
    widerReading = outer;
  }
}

/**
 * The writings of a digits-only form that rule (a) reads glued to a letter (digitsGluedToLetter), each without word
 * edges. Its writing after an identifier label, joined over "." and "/" too (Form.labeled, GAP.labeledNumber), label
 * or none: "Claim No. 7654.3210B" was sent whole, since the first reading takes that writing only where the number
 * stands and rule (a) read the number joined as any number is (review 1 of Queues item 34, R1-2). That writing holds
 * every writing of a form joined as any number is (GAP.number is a part of GAP.labeledNumber), so such a form is read
 * once, as before; a form with the records' own separators (numberForm with `asStored`) is read as it is as well.
 */
function gluedCoresOf(form: Form): string[] {
  const own = coreOf(form);
  if (form.labeled === null) {
    return [own];
  }
  const labeled = form.labeled.source.slice(BEFORE.length, form.labeled.source.length - AFTER.length);
  return labeled.split(GAP.labeledNumber).join(GAP.number) === own ? [labeled] : [labeled, own];
}

/**
 * Whether a call holds a number rule (a) can read: one that may hold WIDER_NUMBER_FLOOR digits or more. A call with none
 * is read no further, and pays nothing: no reading of the letter is asked for it (a digit of another script or a
 * look-alike is a digit only on the folded view, so a stored value is counted by what may fold to a digit: its digits
 * and its characters outside ASCII).
 */
function mayHoldWiderNumber(subject: Subject): boolean {
  const mayHoldDigits = (value: string) => (value.normalize('NFKC').match(/\p{N}|[^\0-\x7F]/gu) ?? []).length >= WIDER_NUMBER_FLOOR;
  return [...subject.memberIds, ...subject.claims.flat()].some(mayHoldDigits);
}

/**
 * Rule (a) read on the letter as it is WRITTEN, before any placeholder is (Queues item 34, MOD-25; the ruling of
 * 2026-11-12 on the generated set's finding): whether one of the call's digits-only numbers stands whole and glued to a
 * letter (digitsGluedToLetter) anywhere but wholly under one placeholder the first reading writes. The check reads rule (a) on the redacted text alone, and a placeholder for a part of the number hid the
 * number from it and left the rest in clear: for a number held "21318-5", "Fax 21318-5B ext" was sent as "Fax
 * [MEMBER_ID]-5B ext" (rule (c)'s placeholder for the piece), and for 8852780545, "Fax X8-852780545 ext" as "Fax
 * X8-[SSN] ext" (the first reading's pattern). Here no placeholder of a part hides it, whichever reading writes it: a
 * pattern's, a piece's, or the first reading's own for a shorter number held beside. The one place not counted is the
 * whole written number under one span of the first reading, whatever its placeholder ("Acct12345" and "Fax X8852780545
 * ext", a label or phone word against it; "Fax X900123456 ext", the whole of it a pattern's): nothing of it is left to
 * send, and the base redacted and sent such letters. Spans are the first reading's merged ones, one placeholder each.
 *
 * Read in each writing the check reads (holdsIdentifier): as written, with each CR LF as a line feed, and where a line
 * feed then stands before a CR with those as one, each place mapped back to where the letter writes it. Each reading
 * is charged on the letter's counter as the check's is (WORK.formCharacter for each character and form); a call with
 * no such number costs nothing. It refuses only: the caller writes the mark the check refuses (refusedByMarkAfter),
 * and asks only for a letter in which some placeholder is written (with none, the check reads the letter as written).
 */
function gluedBeforeRedaction(normal: string, subject: Subject, spans: readonly PlacedSpan[]): boolean {
  if (!mayHoldWiderNumber(subject)) {
    return false;
  }
  const hidden = (range: Range) => someOf(spans, (span) => span.start <= range.start && range.end <= span.end);
  if (digitsGluedToLetter(normal, subject, hidden)) {
    return true;
  }
  if (!normal.includes('\r')) {
    return false;
  }
  // The look-alike answer is the letter's in every writing of its line endings (a CR is no look-alike): asked once,
  // and taken from the wider reading where it read this text (alikeOfWider), as the reading above took it.
  const alike = alikeOfWider !== null && alikeOfWider.normal === normal && alikeOfWider.subject === subject ? alikeOfWider.alike : alikeReads(normal, subject);
  const hiddenIn = (at: readonly number[]) => (range: Range) => hidden({ start: at[range.start] ?? normal.length, end: at[range.end] ?? normal.length });
  const lineFeeds = lineEndingsAsOne(normal, CR_LF);
  if (lineFeeds.text !== normal && digitsGluedToLetter(lineFeeds.text, subject, hiddenIn(lineFeeds.at), alike)) {
    return true;
  }
  if (!lineFeeds.text.includes('\n\r')) {
    return false;
  }
  const oneLineFeed = lineEndingsAsOne(lineFeeds.text, /\n\r+/g);
  return digitsGluedToLetter(oneLineFeed.text, subject, hiddenIn(oneLineFeed.at.map((index) => lineFeeds.at[index] ?? normal.length)), alike);
}

/**
 * A text with each run the pattern matches written as one line feed (asLineFeeds and asOneLineFeed are its two
 * readings), and for each character of that text where it starts in the text given; one index more, the text's end.
 * So a place from `start` up to `end` in the text returned is written from `at[start]` up to `at[end]` in the text given.
 */
function lineEndingsAsOne(text: string, ending: RegExp): { readonly text: string; readonly at: readonly number[] } {
  const at: number[] = [];
  let read = '';
  let kept = 0;
  for (const match of text.matchAll(ending)) {
    for (let index = kept; index < match.index; index += 1) {
      at.push(index);
    }
    at.push(match.index);
    read += `${text.slice(kept, match.index)}\n`;
    kept = match.index + match[0].length;
  }
  for (let index = kept; index <= text.length; index += 1) {
    at.push(index);
  }
  return { text: read + text.slice(kept), at };
}

/**
 * A text with each CR LF written as a line feed, every CR of a run before the line feed with it: "\r\r\n" is one line
 * ending too, a file converted twice (review A-6). A run is read from its first CR alone: asked from each CR of a run
 * that no line feed ends, the pattern read the rest of the run again each time, 100,000 CRs in 8 s and more (review 2
 * of Queues item 34, R2-2). The same runs are found: a match always began at a run's first CR.
 */
const CR_LF = /(?<!\r)\r+\n/g;
const asLineFeeds = (text: string) => text.replace(CR_LF, '\n');

/**
 * A text read with line feeds (asLineFeeds) that still holds a line feed right before a CR, with each line feed and
 * the CRs after it written as one line feed: "\n\r" is a line ending written in two characters too, and "\n\r\r"
 * one (Queues item 34, MOD-25, A-6; review A-6 of item 26: "Account \n\rNo. 900-12-345678" was sent, the CR counted
 * as a character of the reach). A third reading of the check, on such letters only; it only adds.
 */
const asOneLineFeed = (lineFeeds: string) => lineFeeds.replace(/\n\r+/g, '\n');

/**
 * A text the entry refuses and has no other refusal to give for: one the wider reading's work passed the budget on in
 * redactionSpans, or one that holds a digits-only number glued to a letter as it is written (gluedBeforeRedaction). The
 * first reading's text with one of the checks' own marks at its end, which holdsIdentifier refuses at its first line.
 */
const refusedByMarkAfter = (text: string) => `${text}${BARRIER}`;

/**
 * Whether the first reading's check refuses a text in any writing holdsIdentifier reads it in: as written, with its CR
 * LF line endings as line feeds, and where a line feed then still stands before a CR, with those as one line feed
 * (asOneLineFeed). What decides whether the wider reading's matches are applied.
 */
function refusedAsFirstRead(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  const lineFeeds = asLineFeeds(text);
  return (
    holdsAsFirstRead(text, patient, claims) ||
    (lineFeeds !== text && holdsAsFirstRead(lineFeeds, patient, claims)) ||
    (lineFeeds.includes('\n\r') && holdsAsFirstRead(asOneLineFeed(lineFeeds), patient, claims))
  );
}

/**
 * holdsIdentifier as the first reading alone gives it, on the text as it is given (refusedAsFirstRead reads both
 * writings): the base's check, its work counted on the counter of whichever entry runs it (holdsIdentifier, or the
 * redaction's gate through refusedAsFirstRead), each run charged in full as a check of its own is, with stores of its own.
 */
function holdsAsFirstRead(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  // A letter that itself writes one of the checks' own three marks is refused: ef3e8d20 read a letter's own mark as its
  // placeholder and refused such letters in places ("Total<U+0002>for45.00 ...": the review of the last round's delta,
  // H1-1); this reading reads it as the control character it is (B1-4), and text that holds one is no text to trust.
  if (text.search(PRIVATE_MARKS) >= 0) {
    return true;
  }
  const outer = storeScope;
  storeScope = {};
  try {
    work(WORK.character * text.length + workOfIdentifiers(patient, claims));
    const scanned = masked(text, claims.length);
    const subject = letterSubject(patient, claims);
    // The patterns read the same text with the call's own placeholders as OWN_MARK, so a number a label names through a
    // placeholder is found here as redaction found it through the identifier: what redaction left as written, because
    // the letter is refused without it (appliedMatches), is found again and the letter refused.
    if (matchesIn(scanned, subject, masked(text, claims.length, OWN_MARK, OWN_MARK)).length > 0) {
      return true;
    }
    return chainLeft(text, subject, claims.length);
  } finally {
    storeScope = outer;
  }
}

/** A Social Security or phone number's placeholder with a letter against it. */
const PATTERN_PLACEHOLDER_GLUED = /\p{L}[\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}]*\[(?:SSN|PHONE)\]|\[(?:SSN|PHONE)\][\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}]*\p{L}/u;
const LETTER_BEFORE = /\p{L}[\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}]*$/u;
const LETTER_AFTER = /^[\p{Cf}\p{Default_Ignorable_Code_Point}\p{M}]*\p{L}/u;
const PATTERN_PLACEHOLDERS = /\[(?:SSN|PHONE)\]/gu;

/** The patient's name placeholder as the glued check reads it (ownIdentifierGlued): no letter, digit or joiner, kept by the fold. */
const NAME_MARK = '\u0002';

/** The checks' own marks, wherever a letter itself writes one (unmarked). */
const PRIVATE_MARKS = new RegExp(`[${BARRIER}${NAME_MARK}${OWN_MARK}]`, 'gu');

/** What may stand between an initial and the name after it: up to three characters that are no letter, digit or placeholder ("J. ", "O•"). */
const INITIAL_TO_NAME = new RegExp(`^[^\\p{L}\\p{N}${BARRIER}${NAME_MARK}]{0,3}`, 'u');

/**
 * Whether masked text (the patient's name placeholder NAME_MARK) holds one of the call's own identifiers written glued, by a
 * lost space, to what stands beside it, across a boundary no form's pattern reads (redaction reads the call's identifiers
 * at word boundaries only: review round 3 of co-001/redact-range-glued reverted the glued reading of round 2). No boundary
 * can be known there, so the letter is refused (identifier_left, a fixed message with no number) and goes to a person.
 * `held` says the survivor scan found a chain that only the range fix's barriers hold, in a letter cc3dd7f6 refused for the
 * range's own digits (of the gate's 46,956 such letters it refused 46,955; docs/adr/0054): there no boundary is worth
 * reading, and the shapes that are as often a code, a unit or a date's month elsewhere are refused too (heldOwnIdentifier,
 * MASKED_SSN_GLUED and the `held` branches of nameGlued and spacedNameGlued: the judge's review round 1). Everywhere:
 * - a part of the patient's name of four letters or more that is no month's word, folded (so in any case), in a run of
 *   letters a digit touches, where the run sets it apart (from the run's start or a change of case, to the run's end, a
 *   digit or a change of case: "01/01/2020-150.00Zephyra", "Jane0.00-01/02/2020", "Seen JaneSeen0.00") or anywhere in a
 *   run of one case ("2020PAIDZEPHYRATODAY"), never inside a word that goes on in its own case ("2020Billed" for a part BILL,
 *   "0.00Coverage" for VERA); or written with joiners or a space inside as its form reads it ("150.00ZEP HYRA", a month's
 *   word too: "2020-01-02AUGU ST"); none inside another date ("12May2020"); a part of two or three letters or a month's
 *   word is sent as at cc3dd7f6 ("Remark: MA04" for a part MA, "97110XU" for XU, "45min" for MIN, "June1",
 *   "Seen 0.00-$20Al");
 * - letters between a digit and the name's placeholder, only invisible characters between: a part the placeholder cut; and
 *   a part's head glued to a digit before the placeholder past up to three spaces or joiners, where redaction read the rest
 *   of a part written with a space inside as a shorter part, the rest another part ("150.00DANIEL [PATIENT_NAME]" for
 *   DANIELLE LE), never an initial ("45min [PATIENT_NAME]" for MINA ALI), nor an ordinal's suffix that fits the whole
 *   number before it or "am"/"pm" after an hour ("the 4th [PATIENT_NAME]" for THANH ANH, "9am [PATIENT_NAME]" for AMAL AL);
 * - an initial of the name, a letter alone with a digit right before it, past up to three other characters before the
 *   name's placeholder (or a number's that a part of the name is written as), a whole part or another such initial
 *   ("150.00Q Zephyra", "150.00J. [PATIENT_NAME]"); never before another placeholder or a word that only begins like a
 *   part ("Suite 2A, [PHONE]", "Suite 2A, Albany" for AL), nor with a digit after it, where it is a code's letter
 *   ("ZEPHYRA G0283", "MARIA M54.50", "JANE Q ZEPHYRA⏎J3301");
 * - a member ID or claim number of letters with a digit right before or after it, and one of letters and digits inside any
 *   longer token ("Seen 150.00SYNCLAIM0001", "2020PaidZZ7654321", "ZZ12345678" for ZZ1234567); one of digits alone glued
 *   to a digit is another number, as at cc3dd7f6;
 * - a date of birth, in any form datesIn reads, with a letter or a digit right before or after it ("DOB03/14/1980",
 *   "114-Mar-1980-150.00", "3/14/80150.00 - 01/01/2020"), or written compact with a letter beside it; none inside another
 *   date ("13-3-61" for 1961-03-03).
 */
function ownIdentifierGlued(normal: string, subject: Subject, held: boolean, strict = true): boolean {
  // The call's own identifiers, on the fold ef3e8d20 read and (strict), where a look-alike stands, on the look-alike fold
  // too: the reading that decides whether a match ef3e8d20 did not make is applied is ef3e8d20's own, and no more.
  const own = () => {
    const { inOtherDate } = datesOf(normal, subject);
    return (
      numberGlued(normal, subject) ||
      birthGlued(normal, subject, inOtherDate) ||
      nameGlued(normal, subject, inOtherDate, held) ||
      spacedNameGlued(normal, subject, inOtherDate, held) ||
      (held && (heldOwnIdentifier(normal, subject) || (strict && heldBirthUnread(normal, subject))))
    );
  };
  return (
    own() ||
    (strict && subject.patterns && alikeReads(normal, subject) && onFold('alike', own)) ||
    (strict && MASKED_SSN_GLUED.test(viewOf(normal, 'drop', true).text)) ||
    (held && HELD_MASKED_SSN_GLUED.test(viewOf(normal, 'drop', true).text)) ||
    (strict && subject.patterns && confusedGlued(normal, subject))
  );
}

/**
 * A masked SSN glued to what stands before it, read on the folded digits view. In every letter, the mask in an SSN's own
 * shape: three mask characters, a gap the masked pattern reads (a dash with spaces around it too, white space, a period),
 * two, such a gap and four digits, the four on the next line too, glued to a word ("PaidXXX-XX-3456", "PaidXXX - XX -
 * 3456"; after a word that ends in a mask's letter as well, "FaxXXX-XX-3456": the review of the build, B1-7) or to
 * another number's digits where structure says they are another's: a year, a date's end or an amount's cents
 * ("2020***-**-3456", "01/02/2020XXX-XX-3456", "150.00XXX-XX-3456"). A digit or two with no such structure are the
 * masked number's own first digits ("Acct 4XXX-XX-1234"), four mask characters after "#" are an account's
 * ("Acct#XXXX-XX-1234": the review of the fix round, C2-6), and underscores after a word are a form's blank ("Initials___
 * __ 2026": the review of the fix round's delta, D2-7).
 */
const GLUED_MASK = '[X*#\\u2022\\u25CF]';
const GLUED_MASK_GAP = '(?:[ \\t]{0,2}[\\p{Pd}\\u2212][ \\t]{0,2}|[ \\t]{1,3}|\\.)';
const GLUED_MASK_DATE_JOIN = '[/.\\p{Pd}\\u2212]';
/** Another number's digits right before a mask where structure says whose they are: a date's end, an amount's cents, a currency amount. */
const PLACED_BEFORE_MASK = [
  // a year, the rest of its date before it too
  `(?<![0-9])(?:[0-9]{1,2}${GLUED_MASK_DATE_JOIN}[0-9]{1,2}${GLUED_MASK_DATE_JOIN})?(?:19|20)[0-9]{2}`,
  // a date that ends in a two-digit year or, written year first, in its day
  `(?<![0-9])[0-9]{1,2}${GLUED_MASK_DATE_JOIN}[0-9]{1,2}${GLUED_MASK_DATE_JOIN}[0-9]{2}`,
  `(?<![0-9])(?:19|20)[0-9]{2}${GLUED_MASK_DATE_JOIN}[0-9]{1,2}${GLUED_MASK_DATE_JOIN}[0-9]{1,2}`,
  // an amount's cents, and a currency amount's digits
  '[0-9]\\.[0-9]{2}',
  '\\p{Sc}[ \\t]?[0-9][0-9,]*',
].join('|');
/** Before an SSN's own masked shape, three digits or more are another number's too: the masked number shows one or two of its own at most. */
const DIGITS_BEFORE_MASK = `[0-9]{3}|${PLACED_BEFORE_MASK}`;
// A word before the mask, its own final "x" too; or another number's digits, an underscore a mask character after them.
const MASKED_SSN_GLUED = new RegExp(
  `(?:(?!X)\\p{L}\\.?X{0,2}${GLUED_MASK}{3}${GLUED_MASK_GAP}${GLUED_MASK}{2}|(?:${DIGITS_BEFORE_MASK})${MASK}{3}${GLUED_MASK_GAP}${MASK}{2})${GLUED_MASK_GAP}(?:[ \\t]{0,16}(?:\\r\\n|[\\n\\r])[ \\t]{0,16})?[0-9]{4}(?![0-9])`,
  'u',
);
/**
 * In a letter whose chain only held barriers hold (cc3dd7f6 refused it), ef3e8d20's own rule and its mask characters, an
 * underscore among them: the mask glued to a letter, a joiner missing too, or five mask characters and four digits; and
 * the same after another number's digits where structure says whose they are ("2020XXXXX3456", "$150XXXXX3456"). Digits
 * with no such structure are a masked account number's own ("Account 0XXXXX1234", "Loan 12*****1234": the review of the
 * fix round's delta, D2-7), and outside a held letter the five are as often one ("Acct#XXXX1234", "Acct No.XXXXX1234":
 * the review of the build, B2-2).
 */
const HELD_MASKED_SSN_GLUED = new RegExp(`(?:\\p{L}\\.?|${PLACED_BEFORE_MASK})(?:${MASK}{3}[\\p{Pd}\\u2212 .]?${MASK}{2}|${MASK}{5})[\\p{Pd}\\u2212 .]?[0-9]{4}(?![0-9])`, 'u');

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const WORD_GAP = '[\\s\\p{Pd}\\u2212]*';

/** A number under one hundred in words, as a pattern ("SEVENTY-FIVE", "TWELVE"), or null for zero. */
function underHundredInWords(value: number): string | null {
  if (value <= 0) return null;
  if (value < 20) return ONES[value] ?? null;
  const ones = ONES[value % 10] ?? '';
  return `${TENS[Math.floor(value / 10)] ?? ''}${ones === '' ? '' : `${WORD_GAP}${ones}`}`;
}

/** A year from 1900 to 2099 in words, as a pattern: "NINETEEN SEVENTY-FIVE", "NINETEEN HUNDRED AND SEVEN", "NINETEEN OH SEVEN", "TWO THOUSAND AND FIVE", "TWENTY TWELVE". */
function yearInWords(year: number): string | null {
  if (year < 1900 || year > 2099) return null;
  const century = year < 2000 ? 'NINETEEN' : 'TWENTY';
  const rest = year % 100;
  const tail = underHundredInWords(rest);
  const forms: string[] = [];
  if (tail === null) {
    forms.push(year < 2000 ? `NINETEEN${WORD_GAP}HUNDRED` : `TWO${WORD_GAP}THOUSAND`);
  } else {
    forms.push(rest < 10 ? `${century}${WORD_GAP}(?:HUNDRED${WORD_GAP}(?:AND${WORD_GAP})?|OH?${WORD_GAP})${tail}` : `${century}${WORD_GAP}(?:HUNDRED${WORD_GAP}(?:AND${WORD_GAP})?)?${tail}`);
    if (year >= 2000) forms.push(`TWO${WORD_GAP}THOUSAND${WORD_GAP}(?:AND${WORD_GAP})?${tail}`);
  }
  return `(?:${forms.join('|')})`;
}

/**
 * Whether a held letter holds the date of birth in a writing no rule reads (ruling A' of 2026-11-07; cc3dd7f6 refused
 * every held letter), with no boundary asked for, as for every held reading: its month as a Roman numeral with its day and
 * year, the year of two digits too ("14-III-1980", "III/14/1980", "1980-III-14", "14/III/80"); year, month and day with
 * the CJK date characters, the year of two digits or left out too ("1980年3月14日", "80年3月14日", "3月14日"); its year in
 * words; its month's word with its day and no year ("Mar 14th", "14th of March"); and its two-digit year, month and day run together as four or five digits in any order, or as six
 * in an order a date is written in, at the start or the end of a run of digits ("80314", "14380", "202080314",
 * "80031455"), but four digits that read as a year from 1900 to 2099.
 */
function heldBirthUnread(normal: string, subject: Subject): boolean {
  const births = subject.datesOfBirth ?? [];
  if (births.length === 0) return false;
  const text = viewOf(normal, 'drop', true, ownFold === 'alike').text;
  const runs = text.match(/[0-9]{4,}/gu) ?? [];
  for (const birth of births) {
    const [yearText = '', monthText = '', dayText = ''] = birth.split('-');
    const [year, month, day] = [num(yearText), num(monthText), num(dayText)];
    if (!(year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
    const dd = `0?${String(day)}`;
    const mm = `0?${String(month)}`;
    const sep = `[\\s${DATE_SEPARATOR},]{1,3}`;
    const roman = `(?<![A-Z])${ROMAN_MONTHS[month - 1] ?? 'I'}(?![A-Z])`;
    const words = monthWords(month).toUpperCase();
    // With no year after it: a date of another year on the same day of the same month is a date of service, read as written.
    const noYear = `(?![\\s,.${APOSTROPHE}\\p{Pd}\\u2212]{0,3}[0-9]{2})`;
    const yy = yearText.slice(2);
    const anyYear = `(?:${yearText}|${yy})`;
    const gap = '[\\s,.\\p{Pd}\\u2212]{0,3}';
    // The day in digits, an ordinal's suffix on it too, or as an ordinal's word ("14", "14th", "fourteenth").
    const dayDigits = `(?<![0-9])${dd}(?:ST|ND|RD|TH)?(?![0-9])`;
    // The month of May is a verb too ("Visits over 12 may require", "the 12th may require", "You may 1) call us", "5. May
    // include", "Up to 12 may, at our discretion, be approved", "You may" and "12. Appeal" on the next line: the reviews
    // of the build, of the fix round and of its delta, B2-5, C2-5 and D2-6). Before its day it is the month only where the
    // day carries an ordinal's suffix, on the next line too ("May 12th", "May" and "14th" on the next line: E1-8), or, on
    // its own line, ends its phrase ("May 12," "May 12" at a line's end); after its day, only with "of" between them or
    // where a full stop or the text's end follows it ("12th of May", "the 12th May."). A day in words is not read ("the
    // first March payment" is no date of birth): recorded.
    const may = month === 5;
    const phraseEnd = '(?=[ \\t]*(?:[,.;]|$|[\\r\\n]))';
    const sameLine = '[ \\t,.\\p{Pd}\\u2212]{0,3}';
    const monthThenDay = may
      ? `(?<![A-Z])MAY\\.?(?:${sameLine}(?:THE[ \\t]+)?(?<![0-9])${dd}(?:(?:ST|ND|RD|TH)(?![A-Z0-9])|(?![0-9A-Z])${phraseEnd})|${gap}(?:THE\\s+)?(?<![0-9])${dd}(?:ST|ND|RD|TH)(?![A-Z0-9]))${noYear}`
      : `(?<![A-Z])(?:${words})\\.?${gap}(?:THE\\s+)?${dayDigits}${noYear}`;
    const dayThenMonth = may
      ? `${dayDigits}${gap}(?:OF\\s+MAY(?![A-Z])|MAY(?![A-Z])(?=[ \\t]*(?:\\.(?![0-9])|$)))${noYear}`
      : `${dayDigits}${gap}(?:OF\\s+)?(?:${words})(?![A-Z])${noYear}`;
    const patterns = [
      `${dd}${sep}${roman}${sep}${anyYear}(?![0-9])`,
      `${roman}${sep}${dd}${sep}${anyYear}(?![0-9])`,
      `${anyYear}${sep}${roman}${sep}${dd}(?![0-9])`,
      `${anyYear}\\s?年\\s?${mm}\\s?月\\s?${dd}(?![0-9])`,
      `(?<![0-9])${mm}\\s?月\\s?${dd}\\s?日`,
      monthThenDay,
      dayThenMonth,
    ];
    const inWords = yearInWords(year);
    // The year in words within 48 characters after the month's word ("November second, nineteen seventy-five").
    if (inWords !== null) {
      patterns.push(may ? `(?<![A-Z])MAY(?![A-Z])${gap}(?:THE\\s+)?${dayDigits}[^0-9]{0,40}?(?<![A-Z])${inWords}(?![A-Z])` : `(?<![A-Z])(?:${words})(?![A-Z])[^0-9]{0,48}?(?<![A-Z])${inWords}(?![A-Z])`);
    }
    if (new RegExp(patterns.join('|'), 'u').test(text)) return true;
    const pad = (value: number) => String(value).padStart(2, '0');
    const parts = [[yy], [...new Set([String(month), monthText])], [...new Set([String(day), dayText])]];
    // Four or five digits (a part written with one digit), or six with both written with two ("800314", "031480", "140380").
    const compacts = new Set<string>([`${yy}${pad(month)}${pad(day)}`, `${pad(month)}${pad(day)}${yy}`, `${pad(day)}${pad(month)}${yy}`]);
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] as const) {
      for (const first of parts[a] ?? []) for (const second of parts[b] ?? []) for (const third of parts[c] ?? []) {
        const compact = `${first}${second}${third}`;
        if ((compact.length === 4 && !/^(?:19|20)/u.test(compact)) || compact.length === 5) compacts.add(compact);
      }
    }
    for (const run of runs) {
      for (const compact of compacts) {
        if (run.startsWith(compact) || run.endsWith(compact)) return true;
      }
    }
  }
  return false;
}

/** A modifier letter (\p{Lm}): no letter of a name or number for heldOwnIdentifier's stream. */
const MODIFIER_LETTER = /^\p{Lm}$/u;

/**
 * A birth label on the folded view (heldOwnIdentifier), "D/O/B" too (PHIJ2-2), with anything before or after it: a label
 * glued to a range's end or to a word ("150.00DOB", "2020Born", "PaidDOB") or to the date after it ("DOBMar 14th",
 * "DOBIII/14/1980") has no boundary to read, so none is asked for (the judge's review round 3, PHIJ3-2); a word that holds
 * one ("NEWBORN 3", "BORNE BY 2020") refuses only a held letter, which cc3dd7f6 refused. "D O B" written with spaces
 * alone is read between word edges, where "AND OBTAIN" is no label.
 */
const HELD_BIRTH_LABEL = /(?:DOB|D[./]\s?O[./]?\s?B|DO[./]\s?B|(?<!\p{L})D\s?O\s?B(?!\p{L})|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|BORN|BIRTHDAY)/gu;

/** After a birth label, a date redaction did not read: no placeholder first, and a digit or a month's word before any placeholder. */
const UNREAD_BIRTH = new RegExp(`^[\\s:#=.*\\p{Pd}\\u2212]*(?:(?:ON|IS)\\s+)?[^${BARRIER}${NAME_MARK}]*?(?:[0-9]|(?<!\\p{L})${MONTH_WORD.toUpperCase()})`, 'u');

/** A run of digits or a run of letters on a folded view: birthInTokens's tokens (a letter beside a digit ends a run). */
const DATE_TOKEN = /[0-9]+|\p{L}+/gu;

/** An ordinal's suffix at the head of a run of letters: glued to a number, part of it ("14TH"). */
const ORDINAL_HEAD = /^(?:ST|ND|RD|TH)/u;

/** The most characters birthInTokens reads between two parts of a written date ("., '": "Mar., '80, 14"), other than WIDE_DATE_GAP's. */
const DATE_GAP = 4;

/**
 * What datesIn's patterns take between a date's parts, at any length (SEPARATOR's and SPACES's white space has no bound, nor
 * the month-word patterns' run of separators): white space, date separators (DATE_SEPARATOR), commas, full stops, apostrophes
 * and "OF". birthInTokens counts such a gap as none ("80  /  03  /  14", "80     March     14", "80-03-⏎        14": the
 * judge's review round 4, PHIJ4-1).
 */
const WIDE_DATE_GAP = new RegExp(`^(?:[\\s${DATE_SEPARATOR},${APOSTROPHE}]|OF)*$`, 'u');

/**
 * Whether the folded view of a held letter writes a date of birth (its year, month and day as written in ISO) in a form some
 * rule reads, blind to what joins its parts (heldOwnIdentifier; the judge's review round 3, PHIJ3-1). The view is read once
 * as runs of digits and runs of letters (an ordinal's suffix glued to a number is part of it, "OF" between parts is skipped):
 * - three runs in a row, at most four other characters between each, or any number where they are only white space,
 *   separators, commas, full stops, apostrophes and "OF" (WIDE_DATE_GAP: what datesIn takes between a date's parts at any
 *   length; the judge's review round 4, PHIJ4-1), are the year (its four digits or its last two), the month (a number in
 *   any padding, or its word: "MARCH", "MAR", "SEPT") and the day (a number in any padding), in any order, whatever the
 *   characters between ("80_03_14", "80|03|14", "80⁃03⁃14", "1980-14-03", "03/80/14", "14/80/03", "80 March 14",
 *   "14TH OF MARCH '80", "80  /  03  /  14", "14     80     March", "80-03-⏎        14"); a month's word may end a run of
 *   letters before the numbers or begin one after them ("PaidMarch 14 80"), no boundary being readable there;
 * - the month's word beside one run of digits that is the year and the day, either first ("MARCH198014", "Mar8014",
 *   "141980March");
 * - one run of digits that is all three in any order: the four-digit year with the month and the day in any padding (six
 *   to eight digits: "19801403", "196133", "1980314"), or the two-digit year with both padded (six: "801403", "140380").
 * A run of digits inside a longer one is never read ("TIN 198003145"). Linear: each run is compared with the two before it.
 */
function birthInTokens(text: string, year: string, month: string, day: string): boolean {
  const short = year.slice(2);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  const words = monthWords(m).toUpperCase().split('|');
  const months = [...new Set([month, String(m)])];
  const days = [...new Set([day, String(d)])];
  const number = (token: string, value: number) => /^[0-9]{1,2}$/u.test(token) && Number.parseInt(token, 10) === value;
  const isYear = (token: string) => token === year || token === short;
  // The month's word: the whole run, or (first of the parts) a run's end, or (last of them) a run's start.
  const isMonth = (token: string, at: 'first' | 'middle' | 'last') =>
    number(token, m) || words.some((word) => (at === 'first' ? token.endsWith(word) : at === 'last' ? token.startsWith(word) : token === word));
  const monthWord = (token: string, at: 'first' | 'last') => /^\p{L}/u.test(token) && isMonth(token, at);
  const yearDay = new Set(days.flatMap((written) => [`${year}${written}`, `${short}${written}`, `${written}${year}`, `${written}${short}`]));
  const compact = new Set<string>();
  for (const [y, ms, ds] of [
    [year, months, days],
    [short, [month], [day]],
  ] as const) {
    for (const mm of ms) {
      for (const dd of ds) {
        for (const order of [`${y}${mm}${dd}`, `${y}${dd}${mm}`, `${mm}${dd}${y}`, `${dd}${mm}${y}`, `${mm}${y}${dd}`, `${dd}${y}${mm}`]) {
          compact.add(order);
        }
      }
    }
  }
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ] as const;
  const where = ['first', 'middle', 'last'] as const;
  // The last three runs read, each with the count of other characters between it and the run before it.
  const last: { value: string; gap: number }[] = [];
  let end = -1;
  let skipped = 0;
  let digitsEnd = -1;
  for (const token of text.matchAll(DATE_TOKEN)) {
    // An ordinal's suffix glued to a number is part of it, and the letters glued after the suffix begin a run of their own
    // ("198014THMARCH": "198014TH", then "MARCH").
    const suffix = token.index === digitsEnd ? ORDINAL_HEAD.exec(token[0])?.[0] : undefined;
    const value = suffix === undefined ? token[0] : token[0].slice(suffix.length);
    const index = token.index + (suffix?.length ?? 0);
    if (value === '') {
      end = index;
      continue;
    }
    if (value === 'OF') {
      skipped += value.length;
      continue;
    }
    // Each gap is read once, so the whole view is read in time linear in its length.
    const gap = end < 0 ? Number.POSITIVE_INFINITY : WIDE_DATE_GAP.test(text.slice(end, index)) ? 0 : index - end - skipped;
    end = index + value.length;
    skipped = 0;
    digitsEnd = /^[0-9]/u.test(value) ? end : -1;
    last.push({ value, gap });
    if (last.length > 3) {
      last.shift();
    }
    if (digitsEnd >= 0 && compact.has(value)) {
      return true;
    }
    const [one, two, three] = last.length === 3 ? last : [undefined, ...last.slice(-2)];
    if (two !== undefined && three !== undefined && three.gap <= DATE_GAP) {
      if ((monthWord(two.value, 'first') && yearDay.has(three.value)) || (yearDay.has(two.value) && monthWord(three.value, 'last'))) {
        return true;
      }
      if (one !== undefined && two.gap <= DATE_GAP) {
        const runs = [one.value, two.value, three.value];
        if (orders.some(([y, mo, da]) => isYear(runs[y] ?? '') && isMonth(runs[mo] ?? '', where[mo]) && number(runs[da] ?? '', d))) {
          return true;
        }
      }
    }
  }
  return false;
}

/** The run of digits (an ordinal's suffix after them) or of letters that ends a text, then at most DATE_GAP characters that are no letter, digit or bracket. */
const PART_BEFORE = /(?:([0-9]+)(?:ST|ND|RD|TH)?|(\p{L}+))[^\p{L}\p{N}[\]]{0,4}$/u;

/** The run of digits (an ordinal's suffix after them) or of letters that ends a text: the part before a wide gap. */
const PART_ENDING = /(?:([0-9]+)(?:ST|ND|RD|TH)?|(\p{L}+))$/u;

/**
 * At most DATE_GAP characters that are no letter, digit or bracket, or any number of white space, separators, commas, full
 * stops and apostrophes (a wide gap), then the run of digits or of letters that starts there (read at a position: sticky).
 */
const PART_AFTER = new RegExp(`(?:[^\\p{L}\\p{N}[\\]]{0,4}|[\\s${DATE_SEPARATOR},${APOSTROPHE}]*)(?:([0-9]+)|(\\p{L}+))`, 'uy');

/** One character of a wide gap between a date's parts: white space, a separator, a comma, a full stop or an apostrophe. */
const WIDE_DATE_CHARACTER = new RegExp(`^[\\s${DATE_SEPARATOR},${APOSTROPHE}]$`, 'u');

/**
 * Whether a letter whose chain only held barriers hold (cc3dd7f6 refused it for the range's own digits) holds a part of the
 * date of birth beside the date of birth's placeholder, where redaction read only some of a written date as it: its day,
 * month (a number or its word) or year, at most four characters that are no letter or digit between, or any number of white
 * space, separators, commas, full stops and apostrophes ("19, [DATE_OF_BIRTH]" and "19'[DATE_OF_BIRTH]" for "19'February
 * 1941", "[DATE_OF_BIRTH] 19" for "February 1941 19": the judge's review round 3, PHIJ3-1's property; "[DATE_OF_BIRTH]
 * 20" for "May/2009     20", redaction reading "May/2009" as May 20, 2009: round 4's property, PHIJ4-1). cc3dd7f6 sends
 * the same in a letter with no range; here no boundary of the date can be known. Each gap is read once, from the
 * placeholder it touches.
 */
function birthBesideItsPlaceholder(text: string, subject: Subject): boolean {
  const births = (subject.datesOfBirth ?? []).flatMap((birth) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(birth);
    return match === null ? [] : [{ year: match[1] ?? '', month: Number.parseInt(match[2] ?? '', 10), day: Number.parseInt(match[3] ?? '', 10) }];
  });
  if (births.length === 0) {
    return false;
  }
  const upper = text.normalize('NFKC').toUpperCase();
  const isPart = (digits: string | undefined, letters: string | undefined) =>
    births.some(({ year, month, day }) =>
      digits !== undefined
        ? digits === year || digits === year.slice(2) || (digits.length <= 2 && [month, day].includes(Number.parseInt(digits, 10)))
        : letters !== undefined && monthWords(month).toUpperCase().split('|').includes(letters),
    );
  const placeholder = PLACEHOLDERS.birth;
  for (let at = upper.indexOf(placeholder); at !== -1; at = upper.indexOf(placeholder, at + placeholder.length)) {
    // Back over a wide gap before the placeholder, as far as it goes; it ends at the bracket of a placeholder before.
    let from = at;
    while (from > 0 && WIDE_DATE_CHARACTER.test(upper[from - 1] ?? '')) from -= 1;
    const before = PART_BEFORE.exec(upper.slice(Math.max(0, at - 24), at)) ?? PART_ENDING.exec(upper.slice(Math.max(0, from - 24), from));
    PART_AFTER.lastIndex = at + placeholder.length;
    const after = PART_AFTER.exec(upper);
    if ((before !== null && isPart(before[1], before[2])) || (after !== null && isPart(after[1], after[2]))) {
      return true;
    }
  }
  return false;
}

/** A four-digit year standing alone (no digit, and no decimal point and digit, beside it): what a written date of birth's year is. */
const yearAlone = (year: string) => new RegExp(`(?<![0-9]|[0-9][.,])${year}(?![0-9]|[.,][0-9])`, 'gu');

/**
 * Whether masked text whose chain only held barriers hold (a letter cc3dd7f6 refused for the range's own digits) holds one of
 * the call's identifiers written with separators that no form reads, read blind to them (ownIdentifierGlued): the letters
 * and digits alone, folded, hold a member ID or claim number ("ZZ.765.4321", "C2026/000417", "Paid76543210", "Claim
 * 123456780.00" for claim 12345678, "Seen 03-15-61" for member 031561), a part of the name of four letters or more ("Z E
 * P H Y R A", "jo ann"), a name's initials of three parts or more in order ("JQZ", "J.Q.Z."), or a date of birth's eight
 * digits in any order a date is written ("03⏎14⏎1980", "0 3 / 0 3 / 1 9 6 1"), not inside a longer run of digits; or the
 * date of birth's month word and its year stand within 24 characters of each other ("1961 March 3", "MARCH THIRD 1961");
 * or a part of two or three letters written letter by letter or split anywhere ("A L", "Bo b"), or two or more of a
 * name's initials written together as one run of letters in any order ("JZ", "ZJ", "QJZ": the judge's review round 4,
 * PHIJ4-2), or the date of birth in any form redaction reads after a birth label, its year, month and day in any order
 * whatever joins them, at any length where only white space, separators, commas, full stops, apostrophes and "OF" join
 * them, or compact ("80-03-14", "80|03|14", "1980-14-03", "801403", "80 March 14", "80  /  03  /  14": birthInTokens; the
 * judge's review rounds 2 to 4); or a birth label, glued to anything, before a date redaction did not read. No six-digit
 * form is read blind to separators: random digits of a letter's ICNs, TINs and amounts would hold one by chance.
 */
function heldOwnIdentifier(normal: string, subject: Subject): boolean {
  const view = viewOf(normal, 'drop', true, ownFold === 'alike');
  const at: number[] = [];
  let stream = '';
  for (let i = 0; i < view.text.length; ) {
    const codePoint = codePointAt(view.text, i);
    // A modifier letter (the katakana prolonged sound mark, a modifier apostrophe) joins as a separator would.
    if (WORD_CHARACTER.test(codePoint) && !MODIFIER_LETTER.test(codePoint)) {
      stream += codePoint;
      for (let k = 0; k < codePoint.length; k += 1) at.push(i + k);
    }
    i += codePoint.length;
  }
  for (const form of formsOf(subject)) {
    if ((form.kind === 'claim' || form.kind === 'member') && stream.includes(form.compact)) {
      return true;
    }
  }
  // Every run of two letters or more, each as its letters: read against each name's initials below.
  const runs = [...view.text.matchAll(/\p{L}{2,}/gu)].map((run) => [...run[0]]);
  for (const name of subject.names) {
    const parts = nameWords(name).flat();
    if ((parts.length >= 3 && stream.includes(parts.map((part) => [...part][0] ?? '').join(''))) || parts.some((part) => [...part].length >= 4 && stream.includes(part))) {
      return true;
    }
    // A part of two or three letters written letter by letter, or split by a space, a line break, a full stop or a joiner
    // anywhere, or whole: up to three of them between each two of its letters, the part a word of its own ("150.00A L Paid"
    // for AL, "T Y" for TY, "Bo b" for BOB, "An⏎n" for ANN: the judge's review rounds 2 and 4, GATEWAYJ2-3, PHIJ4-2), which
    // no form reads (a space splits a part only two letters or more from each end).
    for (const part of parts) {
      const letters = [...part];
      if (letters.length >= 2 && letters.length <= 3 && new RegExp(`(?<!\\p{L})${letters.map(escapeRegExp).join(`[${NAME_JOINERS}\\s.]{0,3}`)}(?!\\p{L})`, 'u').test(view.text)) {
        return true;
      }
    }
    // Two or more of the name's initials written together as one run of letters, in any order and case ("JZ", "ZJ", "Jz",
    // "QJZ" for JANE Q ZEPHYRA, "SV" for SIMONE VANTREE: the judge's review round 4, PHIJ4-2): each letter of the run counted
    // against the initials', whatever the number of parts. The same glued to another word's letters, at either end or inside
    // ("4thZQ", "Paidzq", "ZQpaid", "BEST" for S T: review round 5, PHI5-1): no boundary says where the word ends and the
    // initials begin, so every stretch of two letters up to the number of parts, anywhere in a run, is counted the same way
    // and the letter is refused, as cc3dd7f6 refused it. Linear in the letter: only stretches made of the initials' own
    // letters are read, in windows no longer than the name has parts.
    const initials = new Map<string, number>();
    for (const part of parts) {
      const first = [...part][0];
      if (first !== undefined) initials.set(first, (initials.get(first) ?? 0) + 1);
    }
    const ofInitials = (run: readonly string[]) => {
      const left = new Map(initials);
      return run.every((letter) => {
        const count = left.get(letter) ?? 0;
        left.set(letter, count - 1);
        return count > 0;
      });
    };
    const initialsWithin = (run: readonly string[]) => {
      let start = 0;
      for (let end = 0; end <= run.length; end += 1) {
        const letter = run[end];
        if (letter !== undefined && initials.has(letter)) continue;
        // run[start, end) is a stretch made only of the initials' letters.
        for (let size = 2; size <= Math.min(parts.length, end - start); size += 1) {
          for (let from = start; from + size <= end; from += 1) {
            if (ofInitials(run.slice(from, from + size))) return true;
          }
        }
        start = end + 1;
      }
      return false;
    };
    if (runs.some(initialsWithin)) {
      return true;
    }
    // Two of the initials with up to three characters that are no letter of a word between them (a space, a hyphen, an
    // apostrophe, a modifier letter such as U+02BC), one of them a letter standing alone and the other at the near end of a
    // word ("Z VPaid", "Z-VDenied", "PaidZ V", "ZʼV": the re-review of round 5, PHI5-2): the pair is read as written
    // together, and the letter refused as cc3dd7f6 refused it. One pass each way, the gap bounded.
    if (initials.size > 0) {
      const set = [...initials.keys()].map(escapeRegExp).join('');
      const word = String.raw`(?!\p{Lm})\p{L}`;
      const gap = String.raw`(?:[^\p{L}\p{N}]|\p{Lm}){1,3}`;
      const pair = (a: string | undefined, b: string | undefined) => a !== undefined && b !== undefined && (a !== b || (initials.get(a) ?? 0) >= 2);
      for (const spaced of [new RegExp(`(?<!${word})([${set}])${gap}([${set}])`, 'gu'), new RegExp(`([${set}])${gap}([${set}])(?!${word})`, 'gu')]) {
        for (const match of view.text.matchAll(spaced)) {
          if (pair(match[1], match[2])) {
            return true;
          }
        }
      }
    }
  }
  const digit = (index: number) => /^[0-9]$/u.test(view.text[index] ?? '');
  // A birth label whose date redaction did not read: what follows it, before any placeholder, holds a digit or a month's
  // word ("DOB 1961/3", "DOB March 3rd, nineteen sixty-one", "DOB 3 Mar sixty-one").
  if ((subject.datesOfBirth ?? []).length > 0) {
    for (const label of view.text.matchAll(HELD_BIRTH_LABEL)) {
      const after = view.text.slice(label.index + label[0].length, label.index + label[0].length + 32);
      if (UNREAD_BIRTH.test(after)) {
        return true;
      }
    }
  }
  for (const birth of subject.datesOfBirth ?? []) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(birth);
    if (match === null) {
      continue;
    }
    const [, year = '', month = '', day = ''] = match;
    // Its year, month and day as numbers or words in any order, whatever stands between, or compact (birthInTokens): every
    // form redaction reads after a birth label as the date it introduces ("80-03-14", "80_03_14", "80|03|14", "1980-14-03",
    // "19801403", "801403", "03/80/14", "80 March 14": the judge's review rounds 2 and 3, PHIJ2-2, PHIJ3-1).
    if (birthInTokens(view.text, year, month, day)) {
      return true;
    }
    for (const form of new Set([`${year}${month}${day}`, `${month}${day}${year}`, `${day}${month}${year}`])) {
      for (let found = stream.indexOf(form); found !== -1; found = stream.indexOf(form, found + 1)) {
        const first = at[found] ?? 0;
        const last = at[found + form.length - 1] ?? 0;
        // Eight digits written together inside a longer number are that number's ("TIN 198003145").
        const together = last - first === form.length - 1;
        if (!together || !(digit(first - 1) || digit(last + 1))) {
          return true;
        }
      }
    }
    // Both lists in the order the text writes them, walked together once (the judge's review round 2, PHIJ2-4: a letter of
    // month words and years far apart was read in time quadratic in its length).
    const months = new RegExp(`(?<!\\p{L})(?:${monthWords(Number.parseInt(month, 10)).toUpperCase()})`, 'gu');
    const words = [...view.text.matchAll(months)].map((word) => word.index);
    let next = 0;
    for (const written of words.length > 0 ? view.text.matchAll(yearAlone(year)) : []) {
      while (next < words.length && (words[next] ?? 0) < written.index - 24) next += 1;
      if (next < words.length && (words[next] ?? 0) <= written.index + 24) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether a part of the patient's name written with joiners or spaces inside it, as its form reads it ("ZEP HYRA",
 * "Zeph-yra"), stands with a digit right before or after it (ownIdentifierGlued): a part of four letters or more, a
 * month's word too (seed 55 of the glued property: "2020-01-02AUGU ST" for AUGUST), or with a held chain any part. The part
 * written whole is nameGlued's ("2020Billed" for BILL is no part).
 */
function spacedNameGlued(normal: string, subject: Subject, inOtherDate: (range: Range) => boolean, held: boolean): boolean {
  const view = viewOf(normal, 'join');
  for (const part of new Set(subject.names.flatMap((name) => nameWords(name).flat()))) {
    const form = nameForm([part]);
    // A month's word written with a joiner or a space inside is no date's month ("2020-01-02AUGU ST" for AUGUST).
    if (form === null || (!held && [...part].length < 4)) {
      continue;
    }
    const core = coreOf(form);
    const pattern = new RegExp(`(?<=\\p{N})(?:${core})|(?:${core})(?=\\p{N})`, 'gu');
    for (let match = pattern.exec(view.text); match !== null; match = pattern.exec(view.text)) {
      const start = match.index;
      const end = start + match[0].length;
      pattern.lastIndex = start + codePointAt(view.text, start).length;
      // A match of letters alone is the part written whole, nameGlued's to read where its run sets it apart.
      if (!/^\p{L}+$/u.test(match[0]) && spacedPiecesPass(form, view, normal, start, end) && !inOtherDate(inNormal(view, start, end))) {
        return true;
      }
    }
  }
  return false;
}

/** A form's pattern without its word edges. */
const coreOf = (form: Form) => form.pattern.source.slice(BEFORE.length, form.pattern.source.length - AFTER.length);

/**
 * Whether the call's member ID or claim number stands glued (ownIdentifierGlued): written whole, or with a part of the
 * patient's name inside it already replaced, where the number holds that part's letters at its end, its start or between
 * ("S MITH\u00AD[PATIENT_NAME]" for a member ID SMITHJONES of AA SMITH-JONES: the number begins glued to a digit, so no
 * boundary reads it, and redaction took "JONES", after a joiner, as the name: review round 5, F1). The rest of the number
 * is read beside the name's placeholder (NAME_MARK), or beside any placeholder where the part is itself one of the call's
 * numbers, with the number's own gaps, and a number of letters alone only with a digit right before or after it.
 */
function numberGlued(normal: string, subject: Subject): boolean {
  const text = viewOf(normal, 'join').text;
  const forms = formsOf(subject).filter((form) => (form.kind === 'claim' || form.kind === 'member') && !form.digitsOnly);
  if (forms.length === 0) {
    return false;
  }
  const numbers = new Set(forms.map((form) => form.compact));
  const places = placesOf(text, forms.map((form) => form.compact));
  const parts = [...new Set(subject.names.flatMap((name) => nameWords(name).flat()))].filter((part) => [...part].length >= 2);
  const marked = text.includes(NAME_MARK) || text.includes(BARRIER);
  const isLetter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
  const spelled = (characters: readonly string[]) => characters.map((character, i) => `${escapeRegExp(character)}${i + 1 < characters.length ? (isLetter(character) || isLetter(characters[i + 1]) ? GAP.numberNearLetter : GAP.number) : ''}`).join('');
  return forms.some((form) => {
    const core = coreOf(form);
    const lettersOnly = !/\p{N}/u.test(form.compact);
    const glued = (source: string) => new RegExp(lettersOnly ? `(?<=\\p{N})(?:${source})|(?:${source})(?=\\p{N})` : source, 'u').test(text);
    // The whole writing stands only where the compact does (lemma 1): where it stands nowhere, it is not asked.
    if (mayStand(form, places) && glued(core)) {
      return true;
    }
    if (!marked) {
      return false;
    }
    return parts.some((part) => {
      if (part.length >= form.compact.length) {
        return false;
      }
      const mark = numbers.has(part) ? `[${NAME_MARK}${BARRIER}]` : NAME_MARK;
      for (let at = form.compact.indexOf(part); at !== -1; at = form.compact.indexOf(part, at + 1)) {
        const before = [...form.compact.slice(0, at)];
        const after = [...form.compact.slice(at + part.length)];
        const source = `${before.length > 0 ? `${spelled(before)}${GAP.numberNearLetter}` : ''}${mark}${after.length > 0 ? `${GAP.numberNearLetter}${spelled(after)}` : ''}`;
        if (glued(source)) {
          return true;
        }
      }
      return false;
    });
  });
}

/** One month's words as datesIn reads them: the name, its first three letters, "sept" for September. */
const monthWords = (month: number) => {
  const name = (MONTHS[month - 1] ?? '').toLowerCase();
  return [...new Set([name, name.slice(0, 3), ...(month === 9 ? ['sept'] : [])])].join('|');
};

/** Every form datesIn reads a date in, of one date (ISO), with no word edges: what birthGlued looks for. */
function datePattern(date: string): RegExp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (match === null) {
    return null;
  }
  const [, y4 = '', mm = '', dd = ''] = match;
  const y2 = y4.slice(2);
  const loose = (padded: string) => (padded.startsWith('0') ? `0?${padded.slice(1)}` : padded);
  const [m, d] = [loose(mm), loose(dd)];
  const year = `${YEAR_APOSTROPHE}(?:${y4}|${y2})`;
  const words = `(?:${monthWords(Number.parseInt(mm, 10))})`;
  const gap = `[\\s${DATE_SEPARATOR}]*`;
  return new RegExp(
    [
      `${y4}${SEPARATOR}${m}${SEPARATOR}${d}`,
      `${y4}${SPACES}${m}${SPACES}${d}`,
      `(?:${m}${SEPARATOR}${d}|${d}${SEPARATOR}${m})${SEPARATOR}${year}`,
      `(?:${m}${SPACES}${d}|${d}${SPACES}${m})${SPACES}${year}`,
      `${y4}${mm}${dd}|${mm}${dd}${y4}|${dd}${mm}${y4}|${mm}${dd}${y2}|${dd}${mm}${y2}`,
      `${words}\\.?${gap}${d}${ORDINAL},?${gap}${year}`,
      `${d}${ORDINAL}(?:\\s+of)?${gap}${words}\\.?,?${gap}${year}`,
    ].join('|'),
    'giu',
  );
}

/** Whether a date of birth stands glued (ownIdentifierGlued), on both readings of invisible characters. */
function birthGlued(normal: string, subject: Subject, inOtherDate: (range: Range) => boolean): boolean {
  for (const birth of subject.datesOfBirth ?? []) {
    const pattern = datePattern(birth);
    if (pattern === null) {
      continue;
    }
    for (const invisible of ['drop', 'space'] as const) {
      const view = viewOf(normal, invisible);
      pattern.lastIndex = 0;
      // Tried at every start, so a form that a longer match there holds is read too ("3/14/80150.00").
      for (let match = pattern.exec(view.text); match !== null; match = pattern.exec(view.text)) {
        const start = match.index;
        const end = start + match[0].length;
        pattern.lastIndex = start + 1;
        const glued = /^\p{N}+$/u.test(match[0]) ? /\p{L}/u : /[\p{L}\p{N}]/u;
        if ((glued.test(codePointBefore(view.text, start)) || glued.test(codePointAt(view.text, end))) && !inOtherDate(inNormal(view, start, end))) {
          return true;
        }
      }
    }
  }
  return false;
}

/** A part of a name that is a month's word: glued to a digit, as often a date's month as the name ("June1", "12thMay"). */
const MONTH_PART = new RegExp(`^${MONTH_WORD}$`, 'iu');

/** A space or joiner, one to three, then the name's placeholder: a part written with a space inside after its head (nameGlued). */
const SPACE_TO_NAME = new RegExp(`^[${NAME_JOINERS}\\s.]{1,3}${NAME_MARK}`, 'u');

/** Where a whole number starts: the text's start, or a character that is no digit, decimal point, comma, slash, currency sign, dash or colon. */
const WHOLE_START = '(?:^|[^\\p{N}.,/$\\p{Pd}−:])';

/** A time written h:mm or h.mm ("10:30", "9.30"). */
const CLOCK = '(?:[01]?[0-9]|2[0-3])[:.][0-5][0-9]';

/** A time written hhmm, four digits on the 24-hour clock ("0930", "1400"). */
const HHMM = '(?:[01][0-9]|2[0-3])[0-5][0-9]';

/**
 * A range's first end and the dash or slash after it, a space allowed on each side: a whole number of one to four digits, an
 * ordinal's suffix or "am"/"pm" after it, or a time h:mm or h.mm, "am"/"pm" after it ("9-", "3rd-", "3rd/", "9am-",
 * "10:00-", "9.30 - "), read where a whole number starts.
 */
const RANGE_START = `(?:[0-9]{1,4}(?:ST|ND|RD|TH|AM|PM)?|${CLOCK}(?:AM|PM)?)\\s?[\\p{Pd}−/]\\s?`;

/** A whole number of one to four digits ending a text, where a whole number starts or after a range's first end ("4", "3rd-4", "1-30"). */
const WHOLE_BEFORE = new RegExp(`${WHOLE_START}(?:${RANGE_START})?([0-9]{1,4})$`, 'u');

/**
 * An hour or a time ending a text: an hour (1 to 12) or a time h:mm or h.mm where a whole number starts or after a range's
 * first end ("9", "10:30", "9.30", "9-10", "9AM-10", "10:00-11:00"); or a time hhmm after a space, "@" or the text's start,
 * alone or as the second end of a range of such times ("0930", "1400-1500"), never after another number's slash ("01/2020").
 */
const HOUR_BEFORE = new RegExp(`(?:${WHOLE_START}(?:${RANGE_START})?(?:1[0-2]|0?[1-9]|${CLOCK})|(?:^|[\\s@])(?:${HHMM}(?:AM|PM)?\\s?[\\p{Pd}−/]\\s?)?${HHMM})$`, 'u');

/**
 * A unit's letters glued after a whole number: time, age, length, weight, dose, angle and the counts a letter bills
 * ("30MIN", "2HRS", "6WKS", "6MO", "45YO", "5IN", "10LBS", "90DEG"; "30MG", "5ML", "8OZ", "3DAYS", "12VISITS", "4UNITS":
 * review round 5, F7).
 */
const UNIT_AFTER_NUMBER = new Set(['MIN', 'MINS', 'HR', 'HRS', 'SEC', 'SECS', 'WK', 'WKS', 'MO', 'MOS', 'YR', 'YRS', 'YO', 'IN', 'FT', 'CM', 'MM', 'KG', 'LB', 'LBS', 'DEG', 'MG', 'ML', 'OZ', 'DAY', 'DAYS', 'VISIT', 'VISITS', 'UNIT', 'UNITS']);

/** A procedure code ending a text, five digits (CPT) or a letter and four digits (HCPCS), after no letter, digit, decimal point, comma, slash, currency sign or dash. */
const CODE_BEFORE = /(?:^|[^\p{L}\p{N}.,/$\p{Pd}−])(?:[0-9]{5}|\p{L}[0-9]{4})$/u;

/**
 * Whether a run of letters (folded) glued to the digits that end `before` is that number's own suffix (nameGlued's head
 * rule, the judge's review rounds 3 and 4, GATEWAYJ3-1, GATEWAYJ4-1): the ordinal suffix that fits a whole number ("1ST",
 * "2ND", "11TH", "23RD", "3RD-4TH"), a unit's letters after a whole number ("30MIN", "1-30MIN"), "AM" or "PM" after an hour
 * or a time ("9AM", "10:30PM", "9-10AM", "9.30AM", "0930AM", "10:00-11:00AM"), or two letters after a procedure code, its
 * modifier ("97110CO", "G0283CO"). A number after a decimal point or a currency sign is an amount's, and its letters stay a
 * head ("150.00ST", "150.00MIN").
 */
function numberSuffix(run: string, before: string): boolean {
  const whole = WHOLE_BEFORE.exec(before)?.[1];
  if (whole !== undefined) {
    const n = Number.parseInt(whole, 10);
    if (run === (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : (['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH')) || UNIT_AFTER_NUMBER.has(run)) {
      return true;
    }
  }
  if (run.length === 2 && CODE_BEFORE.test(before)) {
    return true;
  }
  return (run === 'AM' || run === 'PM') && HOUR_BEFORE.test(before);
}

/** One letter a whole number carries: a unit of time (d, h, m, s, w, y), "x" for times, and F or M after an age ("30D", "3X", "6W", "45F"). */
const LETTER_AFTER_NUMBER = new Set(['D', 'H', 'M', 'S', 'W', 'Y', 'X', 'F']);

/** A token shaped as an ICD-10-CM code that ends a text in a letter: a letter, a digit, a letter or digit, then a dot and one to four letters or digits ("S83.511A", "M54.5A"), after no letter, digit or dot. */
const ICD_LETTER_END = /(?:^|[^\p{L}\p{N}.])[A-Z][0-9][0-9A-Z]\.[0-9A-Z]{0,3}[A-Z]$/u;

/**
 * Whether one letter (folded) glued after the digits that end `before` is that number's own, by the number's structure and
 * never by what the letter may mean (nameGlued's lone-initial rule, review round 5, F5): the last character of a token
 * shaped as an ICD-10-CM code ("S83.511A", its seventh character), or a one-letter unit after a whole number of one to
 * three digits, read where numberSuffix reads a unit ("30d", "3x", "30s", "6w", "45F", "L4-5S"). After an amount's cents, a
 * currency sign or a year's four digits the letter is no unit ("150.00Q", "$30D", "2020D").
 */
function numberLetter(letter: string, before: string): boolean {
  return ICD_LETTER_END.test(`${before}${letter}`.slice(-10)) || (LETTER_AFTER_NUMBER.has(letter) && (WHOLE_BEFORE.exec(before)?.[1]?.length ?? 4) <= 3);
}

/** What may stand between a name's fragment and the name's placeholder before it (nameGlued): INITIAL_TO_NAME read backwards. */
const NAME_TO_FRAGMENT = new RegExp(`[^\\p{L}\\p{N}${BARRIER}${NAME_MARK}]{0,3}$`, 'u');

/** Whether a part of the patient's name or an initial stands glued (ownIdentifierGlued), on the view with invisible characters dropped. */
function nameGlued(normal: string, subject: Subject, inOtherDate: (range: Range) => boolean, held: boolean): boolean {
  const view = viewOf(normal, 'drop');
  const text = view.text;
  const parts = [...new Set(subject.names.flatMap((name) => nameWords(name).flat()))].filter((part) => [...part].length >= 2);
  const longParts = parts.filter((part) => [...part].length >= 4);
  const initials = initialsOf(subject.names);
  // A placeholder other than the name's stands for the name only where a part of it is written as one of the call's member
  // IDs or claim numbers ("CLAIM" for a claim CLAIM), which redaction then writes as that number's placeholder.
  const numbers = new Set(formsOf(subject).flatMap((form) => (form.kind === 'claim' || form.kind === 'member' ? [form.compact] : [])));
  const numberedName = parts.some((part) => numbers.has(part));
  const small = (codePoint: string) => codePoint !== codePoint.toUpperCase() && codePoint === codePoint.toLowerCase();
  const large = (codePoint: string) => codePoint !== codePoint.toLowerCase();
  const caseless = (codePoint: string) => !small(codePoint) && !large(codePoint);
  const isLetter = (index: number) => index < text.length && /^\p{L}$/u.test(codePointAt(text, index));
  const isDigit = (codePoint: string) => /^\p{N}$/u.test(codePoint);
  /** Whether a name part begins at a view position: the whole part, no letter after it, or with a held chain any word that begins with one. */
  const partAt = (at: number) => parts.some((part) => text.startsWith(part, at) && (held || !isLetter(at + part.length)));
  /** Whether the name's placeholder stands at a view position (or a number's that a part of the name is written as, or with a held chain any placeholder). */
  const nameAt = (at: number) => text[at] === NAME_MARK || (text[at] === BARRIER && (held || numberedName));
  for (let i = 0; i < text.length; ) {
    if (!isLetter(i)) {
      i += codePointAt(text, i).length;
      continue;
    }
    const start = i;
    // The run's letters, each where it starts in the view and as the letter wrote it (one written letter may be two units: "ß" is "SS").
    const letters: { readonly at: number; readonly written: string }[] = [];
    while (isLetter(i)) {
      if (i === start || view.from[i] !== view.from[i - 1]) letters.push({ at: i, written: writtenAt(view, normal, i) });
      i += codePointAt(text, i).length;
    }
    const end = i;
    const digitBefore = isDigit(codePointBefore(text, start));
    const digitAfter = isDigit(codePointAt(text, end));
    const glued = digitBefore || digitAfter;
    const run = text.slice(start, end);
    // The name's placeholder past up to three other characters after the run, or before it.
    const nameAfter = text[end + (INITIAL_TO_NAME.exec(text.slice(end, end + 24))?.[0].length ?? 0)] === NAME_MARK;
    const nameBefore = text[start - (NAME_TO_FRAGMENT.exec(text.slice(Math.max(0, start - 24), start))?.[0].length ?? 0) - 1] === NAME_MARK;
    // Letters between a digit and the name's placeholder, invisible characters alone between: a part the placeholder cut
    // ("2020SS<ZWJ>[PATIENT_NAME]" for a part SSN read as an initial N).
    if (glued && (text[end] === NAME_MARK || text[start - 1] === NAME_MARK)) {
      return true;
    }
    // A part's head before the name's placeholder, where redaction read the rest of a part written with a space inside as a
    // shorter part ("150.00DANIEL [PATIENT_NAME]" for DANIELLE LE, "OR [PATIENT_NAME]" for ORLA LA): glued to a digit on its
    // other side, the head of a part of four letters or more whose rest is another part of the name (never an initial: a
    // unit's letters before a name whose rest is one, "45min [PATIENT_NAME]" for MINA ALI, cc3dd7f6 sends as here), the
    // run no month's word, only a space or a joiner between it and the placeholder (the part written with a space inside).
    // A number's own letters are no head, whatever part they begin (numberSuffix): an ordinal's suffix that fits the whole
    // number glued before it ("1st", "4th", "11th", "3rd-4th"; the number after no digit, decimal point, comma, slash,
    // currency sign, dash or colon, or after a range's first end and its dash or slash), a unit's letters after a whole
    // number ("30min", "1-30min"), "am" or "pm" after an hour or a time, a range's second end too ("9am", "10:30pm",
    // "9-10am", "9am-10am", "10:00-11:00am", "9.30am", "0930am"), and a code's modifier ("97110CO") ("on the 4th
    // [PATIENT_NAME]" for THANH ANH, "at 9am [PATIENT_NAME]" and "9-10am [PATIENT_NAME]" for AMAL AL, "30min
    // [PATIENT_NAME]" for MINSEO SEO, "97110CO [PATIENT_NAME]" for COLIN LIN: the judge's review rounds 2 to 4,
    // GATEWAYJ2-2, GATEWAYJ3-1, GATEWAYJ4-1); after an amount the same letters are a head ("150.00ST [PATIENT_NAME]" for
    // STAN AN, "150.00MIN [PATIENT_NAME]" for MINHO HO, fail-safe refusals: cc3dd7f6 sends "ST" and "MIN" in clear there). With a held chain,
    // any run glued so on either side of the placeholder, or the head or tail of any part. A tail after the placeholder
    // glued to a digit is sent elsewhere, as at cc3dd7f6: there it is as often a code after the name ("[PATIENT_NAME]
    // CY2026" for NANCY).
    const head = (part: string) => part.length > run.length && run.length >= 2 && part.startsWith(run);
    const tail = (part: string) => part.length > run.length && run.length >= 2 && part.endsWith(run);
    const restRead = (part: string) => head(part) && parts.includes(part.slice(run.length));
    if (held ? (nameAfter && (digitBefore || parts.some(head))) || (nameBefore && (digitAfter || parts.some(tail))) : digitBefore && !numberSuffix(run, text.slice(Math.max(0, start - 24), start)) && SPACE_TO_NAME.test(text.slice(end, end + 4)) && !MONTH_PART.test(run) && longParts.some(restRead)) {
      return true;
    }
    if (!glued && !held) {
      continue;
    }
    // Where a word begins inside the run, at a change of case: a small letter then a capital ("PaidJane"), or a capital
    // then a capital and a small letter ("PAIDJane").
    const words = new Set<number>([start, end]);
    letters.forEach((letter, k) => {
      const before = letters[k - 1]?.written ?? '';
      const after = letters[k + 1]?.written ?? '';
      if (k > 0 && large(letter.written) && (small(before) || (large(before) && small(after)))) words.add(letter.at);
      // A letter with no case (a modifier letter written for an apostrophe, a letter of a script without case) ends the
      // word before it and begins none with the letter after it: "OʼBrien" (U+02BC), "ʼZephyra", "Zephyraʼs" (review
      // round 5, F1).
      if (k > 0 && caseless(letter.written) !== caseless(before)) words.add(letter.at);
    });
    // A run of one case has no boundary to read inside it.
    const oneCase = !(letters.some((letter) => small(letter.written)) && letters.some((letter) => large(letter.written)));
    for (const part of parts) {
      const long = [...part].length >= 4 && !MONTH_PART.test(part);
      if (!held && !long) {
        continue;
      }
      for (let at = run.indexOf(part); at !== -1; at = run.indexOf(part, at + 1)) {
        const from = start + at;
        const to = from + part.length;
        // With a held chain, any part anywhere (cc3dd7f6 refused the letter: no boundary is worth reading). Elsewhere, in a
        // run a digit touches, a part of four letters or more that is no month's word, set apart in its run (from the run's
        // start or a change of case to the run's end, a digit or a change of case: "Paid 150.00Zephyra", "JaneSeen0.00"),
        // or anywhere in a run of one case ("2020PAIDZEPHYRATODAY"); never inside a word that goes on in its own case
        // ("2020Billed" for BILL, "Coverage01/01/2020" for VERA), nor inside another date.
        if (held || ((oneCase || (words.has(from) && words.has(to))) && !inOtherDate(inNormal(view, from, to)))) {
          return true;
        }
      }
    }
    // An initial at a run's end before the name: past up to three other characters, the name's placeholder (or a number's
    // that a part of the name is written as), a whole part, or another such initial ("150.00J. Q. Zephyra"). Outside a
    // held chain, an initial alone with a digit right before it ("150.00Q Zephyra"), unless the letter is the number's own
    // by its structure (numberLetter: an ICD-10-CM code's last character, a one-letter unit after a whole number:
    // "S83.511A. [PATIENT_NAME]" for ANNA, "30d. [PATIENT_NAME]" for DANA, which cc3dd7f6 sends so); with a held chain, the last letter of
    // any run, unless it is written small at the end of a word that holds a capital ("DEARQ Zephyra", "PaidJ. Zephyra",
    // "JQ Zephyra", but "Dear Zephyra" for an initial R), before another initial too ("DEARJ.Q."), or before a full stop.
    const last = letters.at(-1);
    const alone = letters.length === 1 && digitBefore && !numberLetter(run, text.slice(Math.max(0, start - 24), start));
    const ended = held && last !== undefined && !(small(last.written) && letters.some((letter) => large(letter.written)));
    if (last !== undefined && initials.has(text.slice(last.at, end)) && (alone || ended)) {
      // With a held chain, an initial's full stop marks it one ("DEARQ.", "MsQ.").
      if (ended && text[end] === '.') {
        return true;
      }
      let next = end;
      for (let k = 0; k < 4; k += 1) {
        next += INITIAL_TO_NAME.exec(text.slice(next, next + 24))?.[0].length ?? 0;
        if (nameAt(next) || partAt(next)) {
          return true;
        }
        const initial = codePointAt(text, next);
        if (!initials.has(initial) || isLetter(next + initial.length)) {
          break;
        }
        if (held) {
          return true;
        }
        next += initial.length;
      }
    }
  }
  return false;
}

/** The letters and digits of NFKC text as the matcher compares them: folded, with everything a form's gaps may hold left out. */
const lettersOf = (normal: string) => compactFolded(viewOf(normal, 'join').text);

/**
 * What the narrative's reading matches: the names as names and the numbers (member IDs and claim numbers) as numbers.
 * A narrative's check is told only that a value is a number, so each is read as a member ID, and a number of digits
 * alone as a claim number too: the kind is consulted for those alone (matchesIn), where it decides one thing, that the
 * digits written as a calendar date are the number after a label of that kind ("Claim 2026-03-05", "Member ID
 * 2026-03-05"), a date otherwise. Read as a member ID a number is never an amount. No date is a date of birth, no
 * initial is looked for, and no Social Security or phone number is read by pattern (docs/adr/0054, amendment of
 * 2026-11-04, Scope).
 */
const narrativeSubject = (names: readonly string[], numbers: readonly string[]): Subject => ({
  names,
  memberIds: numbers,
  claims: [numbers.filter((number) => /^\p{N}+$/u.test(lettersOf(number.normalize('NFKC'))))],
  datesOfBirth: null,
  initials: false,
  patterns: false,
});

/**
 * Whether the text holds any of the names (read as names) or numbers (member IDs and claim numbers, read
 * as numbers) in a form redaction reads: the narrative drafter's check of its facts, over the text with the gateway's
 * own placeholders masked. No date there is a date of birth, and no initial is looked for (a whole name or part is).
 * Every form counts here, a part of two letters too: what is checked is sent to a model.
 *
 * It holds wherever the narrative's reading finds (nameOrNumberMatches below, the same reading for a caller that needs
 * where; the packet verifier's), and more (Queues item 34, MOD-25, rule (d); docs/adr/0054). The first reading is
 * asked first and stands; each further reading only adds, and the check holds on any of them:
 *  - the numbers in the letter check's wider reading (widerMatchesIn, with no name given it): a number as the records
 *    hold it, with the mark they hold or a run of marks there ("ZZ12345/01", "ZZ12345+01"), and each piece of one
 *    that is a number by itself ("ZZ12345" of "ZZ12345 01");
 *  - a number of digits alone glued to a letter (digitsGluedToLetter: "Fax X76543210");
 *  - each name the records hold with a mark, as its words of the wider reading (nameWords: JANE and ZEPHYRA of
 *    "JANE+ZEPHYRA"), read as the first reading reads a name: "Ms. Zephyra", "JANE".
 * No name is read written apart (item 26's ruling: "in a" would fail every narrative of a patient INA), so the wider
 * reading is given the numbers alone. What this adds refuses a call before it is made (identifier_in_input); the
 * verifier keeps its reading, so no stored narrative fails for it, and a test holds the check to every match of the
 * verifier's (packages/redact/src/narrative.test.ts). No counter runs here: a narrative's facts are code's own, a few
 * thousand characters.
 */
export function holdsNameOrNumber(text: string, identifiers: { readonly names: readonly string[]; readonly numbers: readonly string[] }): boolean {
  const normal = masked(text);
  const subject = narrativeSubject(identifiers.names, identifiers.numbers);
  // The stored views and the wider reading's answer on the look-alike fold are dropped with the call (inOneReading).
  return inOneReading(() => {
    if (matchesIn(normal, subject).length > 0) {
      return true;
    }
    const numbers: Subject = { ...subject, names: [] };
    if (widerMatchesIn(normal, numbers).length > 0 || digitsGluedToLetter(normal, numbers)) {
      return true;
    }
    const words = identifiers.names.flatMap((name) => {
      const wider = nameWords(name, true);
      return wider.length > nameWords(name).length ? [wider.map((word) => word.join('-')).join(' ')] : [];
    });
    return words.length > 0 && matchesIn(normal, narrativeSubject(words, [])).length > 0;
  });
}

/** Where a text holds a name or a number of the narrative's reading (nameOrNumberMatches). */
export interface NameOrNumberMatch {
  readonly start: number;
  readonly end: number;
}

/**
 * The narrative's reading of a text, match by match: every place it holds one of the names (the whole name, each word
 * and each part of a word) or one of the numbers in a form redaction reads (narrativeSubject above). The packet
 * verifier (@tp/packets, verifier/identifiers.ts) reads a narrative through this.
 *
 * `shortestPart` is the fewest letters at which a part of a name's word counts by itself (a part is what a dash, an
 * apostrophe, a period or an underscore sets off inside a word: IN of HYE-IN). At 2, the default, every form counts,
 * as in holdsNameOrNumber. A caller that fails a text for a match asks for 4, the letter path's own floor for a part
 * read by itself (ownIdentifierGlued): a part of two or three letters is as often a word of the text ("in", "to",
 * "the", "van"). The whole name, each whole word of it and each number count at any length.
 *
 * An identifier is read only if the text holds the letters and digits of one of its forms in order with nothing else
 * between them: no form matches otherwise, since a form's gaps hold no letter or digit. So a case of thousands of
 * identifiers costs a narrative that holds none of them a search each, not a pattern each.
 *
 * The text is read as it is given, which must be NFKC text, and the ranges are that text's own, one for each form that
 * matched (they may overlap, and a number of digits alone is found once for each kind). Nothing is masked here: a
 * caller with placeholders of its own masks them first or drops the matches inside them.
 */
export function nameOrNumberMatches(normal: string, identifiers: { readonly names: readonly string[]; readonly numbers: readonly string[] }, shortestPart = 2): NameOrNumberMatch[] {
  const text = lettersOf(normal);
  const held = (letters: string) => [...letters].length >= 2 && text.includes(letters);
  /** The letters and digits of each whole name, whole word of a name and number that is read. */
  const whole = new Set<string>();
  const names = identifiers.names.filter((name) => {
    const words = nameWords(name);
    const forms = [words.flat().join(''), ...words.map((word) => word.join(''))];
    if (![...forms, ...words.flat()].some(held)) {
      return false;
    }
    forms.forEach((form) => whole.add(form));
    return true;
  });
  const numbers = identifiers.numbers.filter((number) => {
    const letters = lettersOf(number.normalize('NFKC'));
    if (!held(letters)) {
      return false;
    }
    whole.add(letters);
    return true;
  });
  if (names.length === 0 && numbers.length === 0) {
    return [];
  }
  return matchesIn(normal, narrativeSubject(names, numbers))
    .filter((match) => {
      const letters = lettersOf(normal.slice(match.start, match.end));
      return whole.has(letters) || [...letters].length >= shortestPart;
    })
    .map(({ start, end }) => ({ start, end }));
}

/**
 * The runs of text that could be one identifier, as compact identifiers (as compactIdentifier makes
 * them): the letter path's one tokenizer for "which run of a text is an identifier" (the contract screen
 * streams its own, someIdentifierRun below, which joins differently: docs/adr/0070 Part 3, N6). On the
 * NFKC text, a token is a maximal run of letters, digits and marks; a blank (a Hangul filler) is white
 * space, and an invisible character is VANISHED and never part of a token, so "REF<ZWSP>ZZ7654321" gives
 * "ZZ7654321" and the run joined across it. From each token, a run extends over at most maxTokens tokens
 * while `joins` accepts what lies between two of them (given with the two tokens); `keep` decides which
 * runs are returned. `joins` is also given the scanned text, where the run's first token starts in it, where the next
 * token ends and the run so far (compact), so it may read what comes before the run and what the run writes (an
 * identifier label, and whether the run is a whole written calendar date: labeledDigitsJoin).
 */
export function identifierTokenRuns(
  text: string,
  options: { readonly joins: (between: string, left: string, right: string, run: { readonly text: string; readonly start: number; readonly end: number; readonly joined: string }) => boolean; readonly maxTokens: number; readonly keep: (run: string) => boolean },
): string[] {
  // An APOSTROPHE_LETTER, a letter by class, is an apostrophe here, as in the matcher (compactFolded), so "12ʼ345ʼ678" is three tokens a caller may join.
  const scan = text.normalize('NFKC').replace(/[\s\S]/gu, (character) => (BLANK.test(character) ? ' ' : IGNORABLE.test(character) ? VANISHED : APOSTROPHE_LETTER.test(character) ? "'" : character));
  const tokens = [...scan.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
  const runs = new Set<string>();
  for (let start = 0; start < tokens.length; start += 1) {
    let joined = '';
    for (let length = 1; length <= options.maxTokens && start + length <= tokens.length; length += 1) {
      const token = tokens[start + length - 1];
      const before = tokens[start + length - 2];
      if (token === undefined || (length > 1 && (before === undefined || !options.joins(scan.slice(before.end, token.start), before.text, token.text, { text: scan, start: tokens[start]?.start ?? 0, end: token.end, joined })))) {
        break;
      }
      joined += compactIdentifier(token.text);
      if (options.keep(joined)) {
        runs.add(joined);
      }
    }
  }
  return [...runs];
}

/** What may lie between two tokens of one identifier in a letter: the number joiners (NUMBER_JOINERS), and ".", "/", ":", "#" or "(" too. */
const LETTER_GAP = new RegExp(`^[${NUMBER_JOINERS}./:#(]+$`, 'u');
/** What may lie between two digit tokens of a run an identifier label introduces: the number joiners, "." and "/" (the matcher's GAP.labeledNumber). */
const LABELED_GAP = new RegExp(`^[${NUMBER_JOINERS}./]+$`, 'u');

/** What joins two tokens of one identifier in a letter: what joins a number's characters (NUMBER_JOINERS) anywhere, and ".", "/", ":", "#" or "(" next to a letter. */
function letterJoins(between: string, left: string, right: string): boolean {
  work(WORK.letterJoin);
  return LETTER_GAP.test(between) && (!/[./:#(]/u.test(between) || /\p{L}\p{M}*$/u.test(left) || /^\p{L}/u.test(right));
}

/**
 * What joins two tokens of a digits-only identifier an identifier label introduces: the number joiners and "." or "/"
 * between digits, when the run so far and the next token are digits alone and a label ends right before the run, as
 * the matcher reads a digits-only number after a label (GAP.labeledNumber; review finding G1: "ICN 1234.5678",
 * "Claim 1955/07/14", "Member ID: 7654.321"): any label (ANY_IDENTIFIER_LABEL) when the run with the next token is no
 * whole written calendar date ("Patient ID 1234.5678", "Policy number 1234/5678": review finding phi-G2-regress-1), and
 * one of IDENTIFIER_LABEL's, of either kind, when it is ("Claim 1955/07/14", never "ID 2027/03/15").
 */
function labeledDigitsJoin(between: string, _left: string, right: string, run: { readonly text: string; readonly start: number; readonly end: number; readonly joined: string }): boolean {
  if (!LABELED_GAP.test(between) || !/^\p{N}+$/u.test(run.joined) || !/^\p{N}+$/u.test(compactIdentifier(right)) || !anyLabelAt(run.text, run.start)) {
    return false;
  }
  return !writtenAsDate(run.text, { start: run.start, end: run.end }) || labelsBefore(run.text, run.start, (index) => codePointAt(run.text, index)).length > 0;
}

/**
 * The scanned text with a space after each label word glued to the number it introduces (GLUED_LABEL's words before a
 * digit, and "No" or "NO", a whole word or after a small letter, before a run of capitals and digits that holds a
 * digit: "ICN99887766", "Member ID12345678", and "No99887766", "ClaimNo99887766" and "NoZZ12345678" from "№99887766",
 * "Claim№99887766" and "№ZZ12345678"), so the number is a token of its own (review finding phi-numero-glued). The
 * candidates read it beside the text as it is.
 */
const unglued = (scanned: string) =>
  scanned.replace(/(?<![\p{L}\p{N}])(?:claim|icn|pcn|dcn|tcn|acct|member|subscriber|id|nbr|num|ref)(?=\p{N})/giu, '$& ').replace(/(?:(?<![\p{L}\p{N}])N[Oo]|(?<=\p{Ll})No)(?=[\p{Lu}\p{N}]*\p{N})/gu, '$& ');

/**
 * The runs of the redacted text that could be another patient's member ID or claim number: each token
 * with a digit in it, and each run of up to three tokens joined as letterJoins reads it: anywhere over
 * white space, dashes, "_", "|", "\\", invisible characters and the other number joiners (NUMBER_JOINERS:
 * grouping apostrophes and primes, "~", middle dots, bullets, ";", double quotes), next to a letter over ".", "/",
 * ":", "#" or "(" too ("ZZ 1234567", "1234|5678", "12'345'678", "ZZ_7654321", "ZZ/7654321", "ZZ#7654321",
 * "ID:ZZ7654321"), and digits alone over "." or "/" too after an identifier label (labeledDigitsJoin: "ICN 1234.5678",
 * "Patient ID 1234.5678"), read on the text as it is and with each label word glued to its number set apart (unglued:
 * "ICN99887766", "№99887766"), as compact identifiers (letters and digits, upper case) of at least five characters. A placeholder's word is never one, nor part of one; a claim's placeholder keeps its digits
 * (a redacted letter's [CLAIM_n] number its claims, never five digits; a letter's own "[CLAIM_7654321]"
 * offers 7654321).
 */
export function identifierCandidates(text: string): string[] {
  const scanned = masked(text);
  const keep = (run: string) => /\d/.test(run) && run.length >= 5;
  const split = unglued(scanned);
  const readings = split === scanned ? [scanned] : [scanned, split];
  return [...new Set(readings.flatMap((reading) => [...identifierTokenRuns(reading, { joins: letterJoins, maxTokens: 3, keep }), ...identifierTokenRuns(reading, { joins: labeledDigitsJoin, maxTokens: 3, keep })]))].sort();
}

// ---------------------------------------------------------------------------------------------------
// The contract screen's page runs (docs/adr/0070, Part 3)

/**
 * What a stored identifier must be for the contract screen to look for it (combined audit item 120; the design's Q2,
 * as the session ruled it): its compact form (compactIdentifier) at least this long, with a digit in it. A shorter
 * value, or one of letters only, is too likely to be an ordinary word or figure of a contract (a five-digit patient
 * control number equal to a CPT code, a letter-only one equal to "AGREEMENT"), so the screen leaves it out rather
 * than refuse every contract that writes it: a recorded gap (ADR 0070 Part 3), never a page-side shape rule.
 */
export const SCREEN_FLOORS = {
  memberId: { minLength: 6, digit: true },
  payerClaimNumber: { minLength: 6, digit: true },
  patientControlNumber: { minLength: 8, digit: true },
} as const;

export type ScreenIdentifierKind = keyof typeof SCREEN_FLOORS;

/** The shortest run the screen compares: the smallest floor. */
export const SCREEN_MIN_RUN = Math.min(...Object.values(SCREEN_FLOORS).map((floor) => floor.minLength));

/** The longest run the screen compares, whatever the records hold: no identifier of any kind is longer (X12 caps CLP01 at 38 and CLP07 at 50). */
export const SCREEN_MAX_RUN = 80;

/** Whether eight digits are a calendar date written YYYYMMDD or MMDDYYYY, a year from EARLIEST_WRITTEN_YEAR to LATEST_WRITTEN_YEAR (1900 to 2099, the bound a written date has): what the tokenizer makes of "2026-01-01" or "01-01-2026". */
export function isCompactCalendarDate(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) {
    return false;
  }
  const valid = (year: number, month: number, day: number) => plausibleYear(year) && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  const n = (start: number, end: number) => Number.parseInt(digits.slice(start, end), 10);
  return valid(n(0, 4), n(4, 6), n(6, 8)) || valid(n(4, 8), n(0, 2), n(2, 4));
}

/**
 * A stored identifier as the screen keeps it, or null when the screen leaves it out: its compact form, at or above
 * its kind's floor, with a digit (a decimal digit, after NFKC), and not eight digits that are a calendar date. These
 * rules read the stored value only (the design review's M12): the page side has no shape rule, so an NPI, a ZIP+4, a
 * date or a code on a page is refused exactly when it is one of the practice's kept identifiers.
 */
export function screenIdentifier(kind: ScreenIdentifierKind, value: string, floors: Readonly<Record<ScreenIdentifierKind, { readonly minLength: number; readonly digit: boolean }>> = SCREEN_FLOORS, rules: { readonly dropDates: boolean } = { dropDates: true }): string | null {
  const compact = compactIdentifier(value);
  const floor = floors[kind];
  if (compact.length < floor.minLength || (floor.digit && !/\p{Nd}/u.test(compact)) || (rules.dropDates && isCompactCalendarDate(compact))) {
    return null;
  }
  return compact;
}

/**
 * What a page may hold between two letters or digits that is not seen: format characters and default-ignorable code
 * points (a soft hyphen, a zero-width space or joiner, a word joiner, a byte-order mark, a variation selector), which
 * NFKC keeps and compactIdentifier drops. They stay token boundaries (so "ID<zero-width space>ZZ1234567" still holds
 * the token ZZ1234567) and are taken out of the gap between two tokens before it is judged. The Hangul fillers are
 * default-ignorable but letters by class, so a token keeps one and so does compactIdentifier (docs/adr/0070 Part 3,
 * "Not caught"; P15).
 */
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const HOLDS_INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/**
 * Between two tokens, once its invisible characters are taken out, what joins them into one identifier on any page:
 * nothing; one space; one hyphen, dash or minus sign with at most one space on either side; or one dot, slash,
 * underscore or asterisk with no space beside it ("ZZ 123 4567", "ZZ-123-4567", "ZZ - 123", "77−1200", "SYNPCN.12001",
 * "20261234/01", "SYN_PCN_44551"). A dot or slash with a space beside it ends a sentence or separates a list
 * ("Agreement. Section", "PT / OT"), which no identifier is printed as, so it ends the run. (Appendix A.3's
 * `[ ]?[-]?[ ]?` also joined two spaces with no dash between them, which section 5.3 rules out: two spaces are a
 * column gap.) After NFKC every no-break, thin or full-width space is a space.
 */
const JOIN = /^(?:[ ]|[ ]?[\p{Pd}\u2212][ ]?|[./_*])?$/u;

const TOKEN = /[\p{L}\p{N}]+/gu;

/** What upper-casing may add that compactIdentifier drops (a combining mark), so a token compacts exactly as a stored value does. */
const NOT_IDENTIFIER = /[^\p{L}\p{N}]/gu;
const HOLDS_NOT_IDENTIFIER = /[^\p{L}\p{N}]/u;

/** A character outside ASCII: ASCII is its own NFKC form, so only a line holding one is normalized (a copy). */
const NOT_ASCII = /[^\0-\x7F]/;

/** Each maximal run of characters other than letters and digits that has a letter or digit on both sides. */
const INNER_SEPARATOR = /(?<=[\p{L}\p{N}])[^\p{L}\p{N}]+(?=[\p{L}\p{N}])/gu;

/** A value of letters and digits only, which holds no separator (most stored identifiers). */
const LETTERS_AND_DIGITS = /^[\p{L}\p{N}]*$/u;

/** A gap no stored separator may add as a join: a line break, a tab or any white space but a space, or two spaces (a column gap). */
const NEVER_JOINS = /[^\S ]| {2}/u;

/**
 * The separators inside a stored identifier that JOIN does not already accept ("ZZ#7120077" holds "#", "A12:34+5"
 * holds ":" and "+"), each as the tokenizer reads a gap (NFKC, its invisible characters taken out), for the contract
 * screen's set (patient-records.ts screenSet): each one the practice's kept values hold also joins two tokens on its
 * pages, exactly as written, so a kept value written on a page exactly as it is stored is always found. A separator
 * holding a line break, a tab or two spaces is never added: those end a run on every page (a value that holds one is
 * found only when written without it, a recorded gap). Punctuation only: no letter or digit of the value leaves.
 */
export function storedSeparators(value: string): string[] {
  if (LETTERS_AND_DIGITS.test(value)) {
    return [];
  }
  const separators = new Set<string>();
  for (const [separator] of value.normalize('NFKC').replace(INVISIBLE, '').matchAll(INNER_SEPARATOR)) {
    if (!JOIN.test(separator) && !NEVER_JOINS.test(separator)) {
      separators.add(separator);
    }
  }
  return [...separators];
}

/** Whether the gap between two tokens joins them: JOIN, or one of the practice's own separators, with its invisible characters taken out. */
function joinsTokens(gap: string, joins: ReadonlySet<string> | undefined): boolean {
  const visible = HOLDS_INVISIBLE.test(gap) ? gap.replace(INVISIBLE, '') : gap;
  return JOIN.test(visible) || (joins?.has(visible) ?? false);
}

// The runs' hashes: a polynomial hash over a run's UTF-16 code units, modulo 2^32 (Math.imul), so a run's hash comes
// from two prefix hashes in constant time, and a run is built as a string only when a kept identifier has its length
// and hash. A hash says only that a run may be kept; the run itself is then looked up, so a collision costs time,
// never a match.
const HASH_BASE = 0x0100_0193;

/** The polynomial hash of a whole string, as the page side computes it for a run. */
function hashOf(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, HASH_BASE) + text.charCodeAt(index)) | 0;
  }
  return hash;
}

/**
 * A run's key in the index: its hash mixed by murmur3's finalizer, so the table's slots spread (a polynomial hash's low
 * bits follow the characters' low bits), never 0, which marks an empty slot.
 */
function runKey(hash: number): number {
  let key = Math.imul(hash ^ (hash >>> 16), 0x85eb_ca6b);
  key = Math.imul(key ^ (key >>> 13), 0xc2b2_ae35);
  key ^= key >>> 16;
  return key === 0 ? 1 : key;
}

/** The kept identifiers as the tokenizer compares them: their lengths, their first characters by length, and a table of their keys (open addressing). */
export interface RunIndex {
  /** Every kept identifier's length, shortest first. */
  readonly lengths: readonly number[];
  /** By length, 128 bits: which ASCII characters a kept identifier of that length starts with (`firsts[length * 4 + (unit >> 5)]`, bit `unit & 31`). */
  readonly firsts: Uint32Array;
  /** By length, 1 when a kept identifier of that length starts with a character outside ASCII. */
  readonly otherFirsts: Uint8Array;
  /** Each kept identifier's key (runKey), at most half the slots full; 0 is an empty slot. */
  readonly keys: Int32Array;
}

/**
 * The index of a screen set's kept identifiers (compact forms), built once per set (patient-records.ts screenSet), so
 * the page side builds and looks up a run only where a kept identifier has its length, its first character and its
 * hash. It holds those only, never a whole value, and lives inside the check with the set.
 */
export function runIndex(values: Iterable<string>): RunIndex {
  const kept = [...values].filter((value) => value !== '');
  const lengths = new Set<number>();
  const longest = kept.reduce((most, value) => Math.max(most, value.length), 0);
  const firsts = new Uint32Array((longest + 1) * 4);
  const otherFirsts = new Uint8Array(longest + 1);
  let size = 2;
  while (size < 2 * kept.length) {
    size *= 2;
  }
  const keys = new Int32Array(size);
  for (const value of kept) {
    lengths.add(value.length);
    const first = value.charCodeAt(0);
    if (first < 128) {
      firsts[value.length * 4 + (first >> 5)] = (firsts[value.length * 4 + (first >> 5)] ?? 0) | (1 << (first & 31));
    } else {
      otherFirsts[value.length] = 1;
    }
    const key = runKey(hashOf(value));
    let slot = key & (size - 1);
    while (keys[slot] !== 0 && keys[slot] !== key) {
      slot = (slot + 1) & (size - 1);
    }
    keys[slot] = key;
  }
  return Object.freeze({ lengths: [...lengths].sort((a, b) => a - b), firsts, otherFirsts, keys });
}

/** Whether a kept identifier of the length starts with the character: a first, cheap test before the hash. */
function indexStarts(index: RunIndex, length: number, unit: number): boolean {
  return unit < 128 ? (((index.firsts[length * 4 + (unit >> 5)] ?? 0) >>> (unit & 31)) & 1) === 1 : index.otherFirsts[length] === 1;
}

/** Whether the index holds a key (a kept identifier may have that hash). */
function indexHolds(index: RunIndex, key: number): boolean {
  const mask = index.keys.length - 1;
  for (let slot = key & mask; ; slot = (slot + 1) & mask) {
    const found = index.keys[slot];
    if (found === key) {
      return true;
    }
    if (found === 0 || found === undefined) {
      return false;
    }
  }
}

/** Which runs of a page the contract screen compares, and what joins two tokens beside JOIN. */
export interface RunOptions {
  /** The shortest run compared. */
  readonly minLength: number;
  /** The longest run compared: the longest kept identifier, at most SCREEN_MAX_RUN. */
  readonly maxLength: number;
  /** The practice's own separators (storedSeparators of its kept identifiers): each also joins two tokens, exactly as written. */
  readonly joins?: ReadonlySet<string>;
  /** The kept identifiers' index (runIndex): only a run of a kept length and hash is built and given to `accept`. Every run when absent. */
  readonly index?: RunIndex;
}

/**
 * Whether any run of a page that could be a stored identifier is one `accept` takes, for the contract screen
 * (patient-records.ts pagesName). Each run is a compact identifier (letters and digits, upper case, as
 * compactIdentifier makes them):
 *
 * 1. The text is read a line at a time (a run never crosses a line break), each line NFKC-normalized (so a no-break
 *    or full-width space is a space, a full-width digit a digit).
 * 2. A token is a maximal run of letters and digits; every other character is a boundary, so "Member ID:ZZ1234567",
 *    "Claim#9876543210" and "(ZZ1234567)" all hold the identifier as a token, and "ZZ1234567" is never found inside
 *    "AZZ12345678" (whole tokens only: the match is exact).
 * 3. A run extends over the following tokens while the gap between two of them, its invisible characters taken out,
 *    is one JOIN accepts or one of the practice's own separators (options.joins): the ways an identifier is printed in
 *    groups, and every way the practice's own values are written. A newline, a tab, two spaces, two dashes, a dot or
 *    slash beside a space or any other character ends the run, so the fields of a CSV or a workbook (joined by tabs)
 *    never join. A PDF's columns on one line do: pdf.js reads a gap of any width as one space ("97110 59" is one
 *    run), and the false-refusal measurement reads set v2's pages as read, so it counts those joins.
 * 4. Each run's compact concatenation is compared while it is from minLength to maxLength characters long and, with
 *    an index, only when a kept identifier has its length and hash.
 *
 * It streams, and stops at the first run `accept` takes. What it holds is the current line and, for the open run, the
 * last maxLength + 1 positions' token starts, prefix hashes and characters: bounded by maxLength and the longest line,
 * whatever the text's length. For each token it does at most one constant-time check per kept length, and builds a run
 * only on an index hit, so its time is linear in the text. Nothing about a run's shape is judged here (no digit rule,
 * no pattern for a date, an NPI, a ZIP or a code): the stored side's rules (screenIdentifier) decide what is looked for.
 * What this gives up is listed in docs/adr/0070 Part 3, "What it gives up".
 */
export function someIdentifierRun(text: string, options: RunOptions, accept: (run: string) => boolean): boolean {
  const { minLength, maxLength, joins, index } = options;
  const lengths = (index?.lengths ?? Array.from({ length: Math.max(0, maxLength) }, (_, at) => at + 1)).filter((length) => length >= Math.max(1, minLength) && length <= maxLength);
  if (lengths.length === 0) {
    return false;
  }
  // Positions count the compact characters of every token read so far; position p's slot is p & mask, in rings of a
  // power of two above maxLength. A token of the open run starts at p when starts[slot] is p + 1; prefixes[slot] is the
  // hash of every character before p; units holds the character at p. A run reaches at most maxLength positions back,
  // so no slot it reads has been reused.
  let ring = 2;
  while (ring <= maxLength) {
    ring *= 2;
  }
  const mask = ring - 1;
  const starts = new Float64Array(ring);
  const prefixes = new Int32Array(ring);
  const units = new Uint16Array(ring);
  const powers = new Int32Array(maxLength + 1);
  powers[0] = 1;
  for (let length = 1; length <= maxLength; length += 1) {
    powers[length] = Math.imul(powers[length - 1] ?? 0, HASH_BASE);
  }
  const runAt = (start: number, length: number): string => {
    let run = '';
    for (let at = start; at < start + length; at += 1) {
      run += String.fromCharCode(units[at & mask] ?? 0);
    }
    return run;
  };
  const token = new RegExp(TOKEN.source, TOKEN.flags);
  let position = 0;
  let hash = 0;
  let runStart = 0;
  for (let lineStart = 0; lineStart <= text.length; ) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const raw = text.slice(lineStart, lineEnd);
    const line = NOT_ASCII.test(raw) ? raw.normalize('NFKC') : raw;
    lineStart = lineEnd + 1;
    let previousEnd = -1;
    token.lastIndex = 0;
    for (let match = token.exec(line); match !== null; match = token.exec(line)) {
      // A line's first token starts a run; after it, one space, the commonest gap, is judged without building it.
      const oneSpace = match.index === previousEnd + 1 && line.charCodeAt(previousEnd) === 0x20;
      if (previousEnd === -1 || (!oneSpace && !joinsTokens(line.slice(previousEnd, match.index), joins))) {
        runStart = position;
      }
      previousEnd = match.index + match[0].length;
      const upper = match[0].toUpperCase();
      const compact = HOLDS_NOT_IDENTIFIER.test(upper) ? upper.replace(NOT_IDENTIFIER, '') : upper;
      starts[position & mask] = position + 1;
      for (let at = 0; at < compact.length; at += 1) {
        const unit = compact.charCodeAt(at);
        prefixes[position & mask] = hash;
        units[position & mask] = unit;
        hash = (Math.imul(hash, HASH_BASE) + unit) | 0;
        position += 1;
      }
      prefixes[position & mask] = hash;
      // The runs that end with this token, shortest first: each starts `length` positions back, at a token start.
      for (const length of lengths) {
        const start = position - length;
        if (start < runStart) {
          break;
        }
        const slot = start & mask;
        if (starts[slot] !== start + 1) {
          continue;
        }
        if (index !== undefined && (!indexStarts(index, length, units[slot] ?? 0) || !indexHolds(index, runKey((hash - Math.imul(prefixes[slot] ?? 0, powers[length] ?? 0)) | 0)))) {
          continue;
        }
        if (accept(runAt(start, length))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * The UTF-8 bytes of the text as someIdentifierRun reads it: each line that holds a character outside ASCII in its NFKC
 * form, which a compatibility character can make many times longer than the text (U+FDFA, three bytes, is eighteen
 * characters and 33 bytes in NFKC form). The contract request's cap counts it beside the bytes a call sends
 * (functions/contract-terms.ts MAX_REQUEST_BYTES), so the cap bounds what the screen reads as well as what is sent.
 * A line break neither composes nor decomposes with what is beside it, so the text's NFKC form is its lines' forms
 * joined, and ASCII is its own; a character is at least a byte, so the screen reads at most this many characters.
 */
export function screenedBytes(text: string): number {
  return NOT_ASCII.test(text) ? Buffer.byteLength(text.normalize('NFKC'), 'utf8') : text.length;
}

/** Every distinct run of the text someIdentifierRun compares (for the tests and the measurement; the screen itself stops at the first match). */
export function identifierRuns(text: string, options: RunOptions): string[] {
  const runs = new Set<string>();
  someIdentifierRun(text, options, (run) => {
    runs.add(run);
    return false;
  });
  return [...runs];
}

// ---------------------------------------------------------------------------------------------------
// For the tests of Queues item 39 (MOD-26) alone: no reader calls these.

/** The shape of a subject the tests build: as Subject, with no date of birth, initials or patterns. */
interface SubjectForTests {
  readonly names: readonly string[];
  readonly memberIds: readonly string[];
  readonly claims: readonly (readonly string[])[];
}

/**
 * The matcher's parts as the tests of Queues item 39 read them (docs/adr/0054; MOD-26): the gaps a form's writing can
 * hold between two of its letters and digits, the places of a set of words in a text's letters and digits, the source
 * a form keeps for its pattern, and a subject's forms. Synthetic values only; nothing here is read by a reader.
 */
export const matchingForTests = {
  /** Every distinct gap a form's writing can hold, on both readings, with `stored` the class escapes of a stored value's own marks. */
  gapSources(stored: readonly string[] = []): string[] {
    const outer = baseReading;
    const sources = new Set<string>();
    try {
      for (const asBase of [false, true]) {
        baseReading = asBase;
        for (const gap of [GAP.tight, GAP.spaced, GAP.apart, GAP.part, GAP.number, GAP.numberNearLetter, GAP.labeledNumber, runOfMarks()]) {
          sources.add(gap);
        }
        for (const own of stored) {
          sources.add(runOfMarks(own));
          for (const gap of [GAP.number, GAP.numberNearLetter]) {
            sources.add(`${gap.slice(0, -2)}${own}]*`);
          }
        }
      }
    } finally {
      baseReading = outer;
    }
    return [...sources];
  },
  /** Whether a code point is one a form's compact keeps (compactFolded): a letter or a digit, an APOSTROPHE_LETTER not. */
  kept: (codePoint: string): boolean => codePoint !== '' && compactFolded(codePoint) === codePoint,
  /** For each word that stands contiguously in the text's letters and digits, every index of the text where it starts, in order. */
  placesOf,
  /** The source a form keeps for the pattern of `text` (flags 'gu'): V8's own. */
  sourceOf,
  /** A subject's forms on a fold, the first reading's and the wider reading's, built fresh. */
  formsOf(subject: SubjectForTests, fold: 'plain' | 'alike'): readonly Form[] {
    const whole: Subject = { ...subject, datesOfBirth: null, initials: false, patterns: false };
    return onFold(fold, () => [...formsOf(whole), ...formsOf(whole, true)]);
  },
};
