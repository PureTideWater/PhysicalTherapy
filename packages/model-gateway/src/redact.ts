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
  return parts.flatMap((part) => years(part.year).map((year) => iso(year, part.month, part.day))).filter((date): date is string => date !== null);
}

const num = (text: string | undefined) => Number.parseInt(text ?? '', 10);

/** What separates the numbers of a date: a slash, a backslash, a period, any dash, the minus sign, the hyphen bullet, "_" or "|". */
const DATE_SEPARATOR = '/\\\\.\\p{Pd}\\u2212\\u2043_|';
const SEPARATOR = `\\s*[${DATE_SEPARATOR}]\\s*`;
/** White space inside a line: what a date written with spaces alone has between its numbers. */
const SPACES = '[^\\S\\r\\n\\u0085\\u2028\\u2029]+';
/** An apostrophe, straight or typographic, before a two-digit year ('61, ’61). */
const YEAR_APOSTROPHE = "['‘’ʼ`´]?";

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
export function datesIn(text: string): DateSpan[] {
  const all: DateSpan[] = [];
  for (const { pattern, read, separated } of DATE_PATTERNS) {
    const search = new RegExp(pattern.source, pattern.flags);
    for (let match = search.exec(text); match !== null; match = search.exec(text)) {
      all.push({ start: match.index, end: match.index + match[0].length, dates: read(match), separated });
      // Past the whole first code point: with the u flag, an index inside a surrogate pair finds the same match again.
      search.lastIndex = match.index + codePointAt(text, match.index).length;
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

const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_([1-9]\d*))\]/g;

const foldedCodePoints = new Map<string, string>();

/** One code point folded: decomposed, its marks dropped, its case folded in full (ß and ẞ are SS). */
export function fold(codePoint: string): string {
  let folded = foldedCodePoints.get(codePoint);
  if (folded === undefined) {
    folded = codePoint.normalize('NFD').replace(MARKS, '').toLowerCase().toUpperCase().normalize('NFD').replace(MARKS, '');
    foldedCodePoints.set(codePoint, folded);
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
 * scan read (docs/adr/0054, amendment of 2026-11-04, R3).
 */
function viewOf(normal: string, invisible: 'join' | 'drop' | 'space', digits = false): View {
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
    let unit = code < 0x80 ? (code >= 0x61 && code <= 0x7a ? String.fromCharCode(code - 0x20) : codePoint) : BLANK.test(codePoint) ? ' ' : IGNORABLE.test(codePoint) ? '' : digits && DECIMAL_DIGIT.test(codePoint) ? digitValue(codePoint) : fold(codePoint);
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
const NAME_JOINERS = "\\p{Pd}\\u2212\\u2043'\\u2018\\u2019\\u02BC\\u02B9\\u02CA`\\u00B4_\\u00AD";
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
  readonly pattern: RegExp;
  /** For a name, whether each gap is inside a part (where a space must leave capitalized pieces of two letters or more). */
  readonly insidePart: readonly boolean[];
  /** A number of digits only: only such a number may be a claim's amount, or the digits whose own written form is a whole separated calendar date (writtenAsDate). */
  readonly digitsOnly: boolean;
  /**
   * For a digits-only number, its pattern with "." and "/" joining digits too: taken only after an identifier label
   * (IDENTIFIER_LABEL), where "Claim 1955/07/14" or "ICN 1234.5678" is the number and not a date or an amount.
   */
  readonly labeled: RegExp | null;
}

function patternOf(characters: readonly string[], gaps: readonly string[]): RegExp {
  return new RegExp(`${BEFORE}${characters.map((character, i) => `${escapeRegExp(character)}${gaps[i] ?? ''}`).join('')}${AFTER}`, 'gu');
}

/** A member ID's or claim number's form, compacted from its folded value, or null under two letters or digits. */
function numberForm(value: string, kind: 'claim' | 'member', claim: number): Form | null {
  const compact = compactFolded(viewOf(value.normalize('NFKC'), 'join').text);
  const characters = [...compact];
  if (characters.length < 2) {
    return null;
  }
  const letter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
  const gaps = characters.slice(1).map((next, i) => (letter(characters[i]) || letter(next) ? GAP.numberNearLetter : GAP.number));
  const digitsOnly = /^\p{N}+$/u.test(compact);
  return { compact, kind, claim, pattern: patternOf(characters, gaps), insidePart: [], digitsOnly, labeled: digitsOnly ? patternOf(characters, gaps.map(() => GAP.labeledNumber)) : null };
}

/** A name's parts, each compacted from its folded value, grouped by word. */
function nameWords(name: string): string[][] {
  return viewOf(name.normalize('NFKC'), 'join')
    .text.split(WORD_SPLIT)
    .map((word) => word.split(PIECE_SPLIT).map(compactFolded).filter((piece) => piece !== ''))
    .filter((word) => word.length > 0);
}

/** A name form from its parts (the whole name's, a word's, or one part), or null under two letters or digits. */
function nameForm(parts: readonly string[]): Form | null {
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
        gaps.push(i >= 2 && letters.length - i >= 2 ? GAP.spaced : GAP.tight);
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

function formsOf(subject: Subject): Form[] {
  const forms = new Map<string, Form>();
  const add = (form: Form | null) => {
    if (form !== null) {
      forms.set(`${form.kind}:${String(form.claim)}:${form.pattern.source}`, form);
    }
  };
  subject.claims.forEach((numbers, index) => {
    for (const number of numbers) {
      add(numberForm(number, 'claim', index + 1));
    }
  });
  for (const memberId of subject.memberIds) {
    add(numberForm(memberId, 'member', 0));
  }
  for (const name of subject.names) {
    const words = nameWords(name);
    add(nameForm(words.flat()));
    for (const word of words) {
      add(nameForm(word));
      for (const part of word) {
        add(nameForm([part]));
      }
    }
  }
  return [...forms.values()];
}

/** The first letter of each part of each name, folded: the initials taken next to a name. */
function initialsOf(names: readonly string[]): Set<string> {
  return new Set(names.flatMap((name) => nameWords(name).flatMap((word) => word.map((part) => [...part][0] ?? ''))).filter((letter) => /^\p{L}$/u.test(letter)));
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
}

/**
 * Every match in NFKC text, as NFKC ranges, all found on the text as it is before anything is replaced:
 * the dates of birth, the claims' numbers and member IDs, the names and (when asked) the initials next
 * to a name.
 */
function matchesIn(normal: string, subject: Subject): Found[] {
  const found: Found[] = [];
  // Dates on both readings of invisible characters. A separated date with a calendar reading that is not a date of birth stays, and holds no name, nor a number whose own written form is that date.
  const otherDates: Range[] = [];
  const births = new Set(subject.datesOfBirth ?? []);
  for (const invisible of ['drop', 'space'] as const) {
    const view = viewOf(normal, invisible);
    for (const span of datesIn(view.text)) {
      const range = inNormal(view, span.start, span.end);
      if (subject.datesOfBirth !== null && (span.dates.some((date) => births.has(date)) || BIRTH_LABEL.test(view.text.slice(Math.max(0, span.start - 40), span.start)))) {
        found.push({ ...range, kind: 'birth', claim: 0 });
      } else if (span.separated && span.dates.length > 0) {
        otherDates.push(range);
      }
    }
  }
  otherDates.sort((a, b) => a.start - b.start);
  const reach: number[] = [];
  otherDates.forEach((date, i) => reach.push(Math.max(reach[i - 1] ?? -1, date.end)));
  const inOtherDate = (range: Range) => (reach[firstIndex(otherDates, (date) => date.start > range.start) - 1] ?? -1) >= range.end;
  const view = viewOf(normal, 'join');
  const names: Range[] = [];
  for (const form of formsOf(subject)) {
    const pattern = new RegExp(form.pattern.source, form.pattern.flags);
    for (let match = pattern.exec(view.text); match !== null; match = pattern.exec(view.text)) {
      const start = match.index;
      const end = start + match[0].length;
      const range = inNormal(view, start, end);
      if (form.kind === 'name') {
        if (!spacedPiecesPass(form, view, normal, start, end)) {
          // Past the whole first code point: with the u flag, an index inside a surrogate pair finds the same match again.
          pattern.lastIndex = start + codePointAt(view.text, start).length;
          continue;
        }
        if (inOtherDate(range)) {
          continue;
        }
        names.push({ start, end });
      } else if (form.digitsOnly && ((form.kind === 'claim' && isAmount(normal, range)) || (inOtherDate(range) && writtenAsDate(normal, range) && !labelFor(view, normal, start, form.kind)))) {
        continue;
      }
      found.push({ ...range, kind: form.kind, claim: form.claim });
    }
    if (form.labeled !== null) {
      // After an identifier label, digits joined over "." or "/" are the number too (never an amount: isAmount), and a
      // whole written calendar date only after a label of the number's kind (labelFor).
      const labeled = new RegExp(form.labeled.source, form.labeled.flags);
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
        const glued = new RegExp(`(?<=\\p{L})${source.source.slice(BEFORE.length)}`, source.flags);
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
  if (subject.initials) {
    for (const initial of initialsNextToNames(view, normal, names, initialsOf(subject.names))) {
      found.push({ ...inNormal(view, initial.start, initial.end), kind: 'name', claim: 0 });
    }
  }
  if (subject.patterns) {
    // Last, so a bare number's label window ends at every match already found (section 3.4).
    found.push(...patternMatchesIn(normal, found, subject));
  }
  return found;
}

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
const CURRENCY_BEFORE = /\p{Sc}[ \t]?$/u;
const DIGIT = /^[0-9]$/u;
const DASH_UNIT = /^[\p{Pd}\u2212\u2043\u02D7\u2796]$/u;

/**
 * The digit across one line break from a view position (R2c), or -1: going back (`before`), indentation, the break,
 * indentation, up to two dashes and a digit; going on, up to two dashes, indentation,
 * the break, indentation and a digit. Read character by character, a fixed number of steps at most.
 */
function digitAcross(text: string, at: number, side: 'before' | 'after'): number {
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

const LINE_BREAK_CHARACTER = /^[\n\r\f\v\u0085\u2028\u2029]$/u;

/**
 * The label window before a bare number at a view position (3.4): up to LABEL_WINDOW characters back, ending at a
 * position `stops` (the last match already found), a BARRIER, a digit, or a second line break.
 */
function labelWindow(text: string, start: number, stops: (index: number) => boolean): string {
  let from = start;
  let breaks = 0;
  while (from > 0 && start - from < LABEL_WINDOW) {
    const index = from - 1;
    const character = text[index] ?? '';
    if (stops(index) || character === BARRIER || DIGIT.test(character)) {
      break;
    }
    if (LINE_BREAK_CHARACTER.test(character) && !(character === '\r' && text[index + 1] === '\n')) {
      breaks += 1;
      if (breaks > 1) {
        break;
      }
    }
    from = index;
  }
  return text.slice(from, start);
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
function decideNamed(text: string, start: number, stops: (index: number) => boolean, length: number, digits: string): Decision {
  const decision = decideBare(labelWindow(text, start, stops), length, digits);
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
    const inItem = end > 0 && stops(end - 1) ? stops : unit === BARRIER ? (index: number) => text[index] === BARRIER : (index: number) => DIGIT.test(text[index] ?? '');
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
  const pushOwn = (view: View, readings: readonly { readonly compact: string; readonly from: number; readonly to: number }[]) => {
    const mine = readings.find((reading) => own.has(reading.compact));
    const held = mine === undefined ? undefined : own.get(mine.compact);
    if (mine === undefined || held === undefined) {
      return false;
    }
    const reach = inNormal(view, mine.from, mine.to);
    results.push({ ...reach, kind: held.kind, claim: held.claim });
    cover(reach);
    return true;
  };
  const push = (view: View, start: number, end: number, kind: PatternKind, core: string, form: PatternForm) => {
    const readings = readingsOf(view, start, end, core);
    if (pushOwn(view, readings)) {
      return;
    }
    const range = inNormal(view, start, end);
    const compacts = form === 'masked' || form === 'mask5' ? [] : [...new Set(readings.map((reading) => reading.compact).filter(offerable))];
    results.push({ ...range, kind, claim: 0, compacts });
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
        const decision = decideNamed(view.text, start, stops, form === 'local' ? 7 : core.length, core);
        const labeled = decision === 'ssn' || decision === 'phone';
        let taken: PatternKind | null;
        if (wrapped) {
          // A group wrapped across a line break: only after a label, never across another break on either side (R2b, R2c;
          // wrappedAcross, above: "90000\n0000 \n2\r\n  02-555-0123").
          taken = labeled ? decision : null;
        } else if (form === 'nine') {
          taken = decision === 'keep' ? null : 'ssn';
        } else if (form === 'ten') {
          const glued = groups.prefix !== undefined && groups.g0 === undefined;
          taken = decision === 'keep' ? null : labeled ? decision : glued ? null : /^[3-9]/u.test(core) || (core.startsWith('2') && !npiCheckDigitValid(core)) ? 'phone' : null;
        } else if (form === 'mask5') {
          taken = decision === 'ssn' ? 'ssn' : null;
        } else {
          taken = labeled ? decision : null;
        }
        if (taken === null) {
          matcher.lastIndex = start + 1;
          continue;
        }
        push(view, start, end, taken, core, form);
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
 * A word glued to a digit on either side, but a date's ordinal suffix ("3rd"): what that reading blanks. Each match starts
 * after a digit or at a word's first letter, so a long word is read once, never from each of its letters.
 */
const GLUED_WORD = /(?<=[0-9])(?!(?:st|nd|rd|th)(?![\p{L}\p{N}]))\p{L}+|(?<!\p{L})\p{L}+(?=[0-9])/giu;

/** One or two dashes and nothing else (any dash the scan joins over: SCAN_DASH): what joins the two ends of a range ("10/01/2026-10/15/2026", "150.00-120.00"). */
const RANGE_DASH = /^[\p{Pd}\u2212\u2043\u02D7\u2796]{1,2}$/u;

/**
 * The spans (dates or amounts, in any order) that stand whole: joined by no non-white joiner to a digit group on either
 * side (A3), or joined only by a dash to another such span, the range as a whole joined to nothing else (a service period
 * "10/01/2026-10/15/2026", "2026-10-01-2026-10-15", amounts "150.00-120.00": review round 2, finding 2; a date and an
 * amount, "01/01/2020-150.00": MOD-16 seed 1034253323). A range whose end is joined to a further group
 * ("10/01/2026-10/15/2026-0123") stands as no barrier, nor does any span in it. A side that is no digit (a month word, a
 * currency sign) is joined to nothing: no group chains into the span's digits over it. Spans may share a start or an end
 * (a date on both readings, an amount with and without its currency sign): a side stands free if any partner there does.
 */
function wholeRanges<T extends { readonly start: number; readonly end: number }>(text: string, spans: readonly T[]): T[] {
  /** Whether a range dash of one or two joins a side to a place where a span that stands free on that side ends (or starts). */
  const toFree = (at: number, side: 'left' | 'right', free: ReadonlySet<number>): boolean => {
    for (const width of [1, 2]) {
      const gap = side === 'right' ? text.slice(at, at + width) : text.slice(at - width, at);
      if (!RANGE_DASH.test(gap)) return false;
      if (free.has(side === 'right' ? at + width : at - width)) return true;
    }
    return false;
  };
  // Whether each side stands free: no joiner, or a range dash to a partner whose own side further out stands free. A partner
  // on the left ends before the span starts, so the left sides are settled in order of start and the right sides in
  // reverse order of end, each pass keeping where the spans that stand free on its side end (or start).
  const leftFree = new Array<boolean>(spans.length).fill(false);
  const rightFree = new Array<boolean>(spans.length).fill(false);
  const freeEnds = new Set<number>();
  for (const index of [...spans.keys()].sort((a, b) => (spans[a]?.start ?? 0) - (spans[b]?.start ?? 0))) {
    const span = spans[index];
    if (span === undefined) continue;
    leftFree[index] = !SCAN_DIGIT.test(text[span.start] ?? '') || !joinedLeft(text, span.start) || toFree(span.start, 'left', freeEnds);
    if (leftFree[index]) freeEnds.add(span.end);
  }
  const freeStarts = new Set<number>();
  for (const index of [...spans.keys()].sort((a, b) => (spans[b]?.end ?? 0) - (spans[a]?.end ?? 0))) {
    const span = spans[index];
    if (span === undefined) continue;
    rightFree[index] = !SCAN_DIGIT.test(text[span.end - 1] ?? '') || !joinedRight(text, span.end) || toFree(span.end, 'right', freeStarts);
    if (rightFree[index]) freeStarts.add(span.start);
  }
  return spans.filter((_, index) => leftFree[index] === true && rightFree[index] === true);
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
 *    unsigned amount there is no barrier ("SSN 900.12 3456": SEC-5).
 */
function survivorIn(text: string): boolean {
  const barrier = new Uint8Array(text.length + 1);
  const mark = (start: number, end: number) => {
    for (let i = start; i < end; i += 1) barrier[i] = 1;
  };
  const labeled = new Map<number, ScanLabel>();
  const labeledAt = (start: number): ScanLabel => {
    let held = labeled.get(start);
    if (held === undefined) {
      held = scanLabeled(labelWindow(text, start, () => false));
      labeled.set(start, held);
    }
    return held;
  };
  // A date glued to a word ("2020-01-01Paid", extracted text that lost its space) is read with that word as blanks too:
  // datesIn reads no date against a letter, and its digits would chain with a group before it (MOD-16, check round 1).
  // Only a word glued to a digit is blanked (GLUED_WORD), so a month word stays one ("2 January 2020Paid"), and a blank
  // is WORD_BLANK, never a space, so a word between two numbers never reads as the white space of one date (MOD-16 seed
  // 1034253323).
  const unglued = /[0-9]\p{L}|\p{L}[0-9]/u.test(text) ? [text, text.replace(GLUED_WORD, (word) => WORD_BLANK.repeat(word.length))] : [text];
  const dates = unglued.flatMap((reading) => datesIn(reading).filter((span) => span.separated && span.dates.length > 0)).map((span) => ({ start: span.start, end: span.end, amount: false }));
  const currency = [...text.matchAll(CURRENCY_AMOUNT)].map((match) => ({ start: match.index, end: match.index + match[0].length, amount: false }));
  const amounts = [...text.matchAll(UNSIGNED_AMOUNT)].map((match) => ({ start: match.index, end: match.index + match[0].length, amount: true }));
  for (const span of currency) {
    mark(span.start, span.end);
  }
  // Dates of both readings and amounts are ranged together: either end of a range may be read on either reading
  // ("01/01/2020-01/02/2020Paid": the first end on the text, the second with the letters as blanks), and a range may
  // join a date to an amount or an amount to one with a currency sign (MOD-16 seed 1034253323). An unsigned amount
  // under an SSN or phone label stays no barrier (SEC-5).
  for (const span of wholeRanges(text, [...dates, ...currency, ...amounts])) {
    if (!span.amount || labeledAt(span.start) !== 'person') {
      mark(span.start, span.end);
    }
  }
  const groups: { readonly start: number; readonly end: number; readonly digits: string; readonly blocked: boolean }[] = [];
  for (const match of text.matchAll(/[0-9]+/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    let blocked = false;
    for (let i = start; i < end && !blocked; i += 1) blocked = barrier[i] === 1;
    if (!blocked && (match[0].length === 9 || match[0].length === 10)) {
      blocked = decideNamed(text, start, () => false, match[0].length, match[0]) === 'keep';
    }
    groups.push({ start, end, digits: match[0], blocked });
  }
  const chained = (digits: string) => digits.length === 9 || digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  for (let first = 0; first < groups.length; first += 1) {
    let digits = '';
    let long = false;
    // Under a label the chain runs on until it holds more than eleven digits (each group one digit at least, so twelve groups at most).
    const label = (groups[first]?.digits.length ?? 12) < 11 && first + 1 < groups.length ? labeledAt(groups[first]?.start ?? 0) : null;
    // "Medicare" labels a nine only (R5d), as decideBare reads it.
    const labeledChain = (held: string) => (label === 'medicare' ? held.length === 9 : label !== null && chained(held));
    for (let count = 1; (label !== null || count <= 4) && digits.length <= 11 && first + count <= groups.length; count += 1) {
      const group = groups[first + count - 1];
      const previous = groups[first + count - 2];
      if (group === undefined || group.blocked || (count > 1 && (previous === undefined || !(label === 'person' ? SCAN_LABELED_GAP : SCAN_GAP).test(text.slice(previous.end, group.start))))) {
        break;
      }
      digits += group.digits;
      long ||= group.digits.length >= 5;
      if (count === 1) {
        const ten = digits.length === 10 && (/^[01]/u.test(digits) || (digits.startsWith('2') && npiCheckDigitValid(digits)));
        if ((digits.length === 9 || digits.length === 10) && !ten) {
          return true;
        }
      } else if (labeledChain(digits) || (!long && count <= 4 && chained(digits))) {
        return true;
      }
    }
  }
  return false;
}

/** What the words before a chain say it is to the scan: a person's number (an SSN or phone label), a nine after "Medicare", or nothing. */
type ScanLabel = 'person' | 'medicare' | null;

/** Codes a letter names that are no person's: what, nearer the chain than an SSN or phone label, leaves it to the unlabeled rules (scanLabeled). */
const SCAN_CODE_NOUN = /(?<![\p{L}\p{N}])(?:CPT|HCPCS|CODES?|MODIFIERS?|REV(?:ENUE)?|ICD(?:[\p{Pd}\u2212 ]?10)?|ZIP)(?!\p{L})/gu;

/**
 * Whether the words before a chain's first group (a label window) name it a Social Security or phone number for the scan:
 * an SSN, Medicare or phone label within LABEL_REACH whose end is nearer the chain than any keep-noun or code (CPT, ZIP ...);
 * a keep-noun after the label ("Call our office, TIN 12-3456789") or a code ("Please call about CPT 97110 97140") leaves the
 * chain to the unlabeled rules. Written for the scan on its own (R7: independent of R5's decision).
 */
function scanLabeled(window: string): ScanLabel {
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
  const person = Math.max(lastEnd(SSN_LABEL), lastEnd(PHONE_LABEL));
  const medicare = lastEnd(MEDICARE_LABEL);
  const code = Math.max(lastEnd(KEEP_NOUN), lastEnd(SCAN_CODE_NOUN));
  return person > code && person >= medicare ? 'person' : medicare > code ? 'medicare' : null;
}

/** Whether masked text holds a survivor (survivorIn) on its digits view with invisible runs dropped or read as spaces (R4, R7). */
const survivorLeft = (text: string) => {
  const drop = viewOf(text, 'drop', true);
  // With no invisible run the two readings are one text: it is scanned once (review finding corr-ssn-2).
  return survivorIn(drop.text) || (drop.emptied && survivorIn(viewOf(text, 'space', true).text));
};

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

/** The letter as NFKC text and the spans redaction replaces in it, in order, each with its placeholder: what redactLetter writes. */
export function redactionSpans(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): { readonly text: string; readonly spans: readonly { readonly start: number; readonly end: number; readonly placeholder: string }[] } {
  const normal = unbracketed(text);
  return { text: normal, spans: merge(matchesIn(normal, letterSubject(patient, claims))) };
}

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
 * of the letter with only the call's own identifiers replaced (the Social Security and phone numbers left as written);
 * and the compact form of every Social Security or phone number that is not the call's own, whole, its core digits and
 * joined to the token written against it. The call's own member IDs and claim numbers are never among them.
 * PHI: for the screen only, in memory; never sent, logged, stored, or put in an error or a job payload. Not exported
 * from the package (index.ts), so it is no part of its public type.
 */
export function redactLetterForScreen(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted & { readonly candidates: readonly string[] } {
  const normal = unbracketed(text);
  const subject = letterSubject(patient, claims);
  const found = matchesIn(normal, subject);
  const spans = merge(found);
  const sent = written(normal, spans);
  const own = new Set(formsOf(subject).flatMap((form) => (form.kind === 'claim' || form.kind === 'member' ? [form.compact] : [])));
  const candidates = new Set(identifierCandidates(sent));
  const screenText = written(
    normal,
    spans.filter((span) => span.placeholder !== PLACEHOLDERS.ssn && span.placeholder !== PLACEHOLDERS.phone),
  );
  for (const candidate of [...identifierCandidates(screenText), ...found.flatMap((match) => match.compacts ?? [])]) {
    if (!own.has(candidate)) {
      candidates.add(candidate);
    }
  }
  return { text: sent, claims: claimPlaceholders(claims), replaced: spans.length, candidates: [...candidates].sort() };
}

/**
 * NFKC text with each exact placeholder made the BARRIER, so no match reaches into or across one. A
 * claim's placeholder past the call's claims (all of them, for the screen, which knows no call) keeps its
 * digits between two barriers: a letter's own "[CLAIM_7654321]" still holds 7654321 for every check.
 */
const masked = (text: string, claims = 0) => text.normalize('NFKC').replace(PLACEHOLDER, (_, claim?: string) => (claim === undefined || Number.parseInt(claim, 10) <= claims ? BARRIER : `${BARRIER}${claim}${BARRIER}`));

/**
 * Whether any of the identifiers is still in the text, in any form redaction reads, or a Social Security or phone number
 * by pattern, or a chain of digits the survivor scan reads as one no pattern took (the check after redaction:
 * docs/adr/0054, amendment of 2026-11-04, R7).
 */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  const scanned = masked(text, claims.length);
  return matchesIn(scanned, letterSubject(patient, claims)).length > 0 || survivorLeft(scanned);
}

/**
 * Whether the text holds any of the names (read as names) or numbers (member IDs and claim numbers, read
 * as numbers) in a form redaction reads: the narrative drafter's check of its facts. No date there is a
 * date of birth, and no initial is looked for (a whole name or part is).
 */
export function holdsNameOrNumber(text: string, identifiers: { readonly names: readonly string[]; readonly numbers: readonly string[] }): boolean {
  return matchesIn(masked(text), { names: identifiers.names, memberIds: identifiers.numbers, claims: [], datesOfBirth: null, initials: false, patterns: false }).length > 0;
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
