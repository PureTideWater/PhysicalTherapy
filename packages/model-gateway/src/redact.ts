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
  if (viewsOfCheck === null) {
    return buildView(normal, invisible, digits);
  }
  const key = `${invisible}${digits ? '#' : ''}`;
  const known = viewsOfCheck.find((each) => each.key === key && each.normal === normal);
  if (known !== undefined) {
    return known.view;
  }
  const view = buildView(normal, invisible, digits);
  viewsOfCheck.push({ normal, key, view });
  return view;
}

/**
 * The views built during one check (holdsIdentifier), each text's reading built once however many of the check's readers ask
 * for it (the judge's review round 2: the check built the same four views up to nine times). Null outside a check, and
 * emptied when the check returns, so no letter's text is held past it.
 */
let viewsOfCheck: { readonly normal: string; readonly key: string; readonly view: View }[] | null = null;

function buildView(normal: string, invisible: 'join' | 'drop' | 'space', digits: boolean): View {
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
  const key = JSON.stringify(subject.datesOfBirth);
  const known = datesOfCheck.find((each) => each.key === key && each.normal === normal);
  if (known !== undefined) {
    return known.dates;
  }
  const dates = readDatesOf(normal, subject);
  datesOfCheck.push({ normal, key, dates });
  return dates;
}

/** As viewsOfCheck, for datesOf: the check reads the dates of its two masked texts, which are one text when no name was redacted. */
let datesOfCheck: { readonly normal: string; readonly key: string; readonly dates: DatesOf }[] | null = null;

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

function matchesIn(normal: string, subject: Subject): Found[] {
  const { births, inWholeDate, inDateAsRead } = datesOf(normal, subject);
  const inBirthForm = birthFormsIn(normal, subject);
  const found: Found[] = births.map((range) => ({ ...range, kind: 'birth' as const, claim: 0 }));
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
  // A name, member ID or claim number written as a word of a written date of birth is that date's (a member ID "JUNE" in
  // "DOB June 1, 2002Paid"): the date stays whole for the check.
  for (let i = found.length - 1; i >= 0; i -= 1) {
    const match = found[i];
    if (match !== undefined && match.kind !== 'birth' && inBirthForm(match)) found.splice(i, 1);
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
/** The labels no word ends in, glued to the word before them by a lost space ("PatientSSN", "PaidPhone", "PATIENTSSN"): read in every letter. */
const GLUED_LONG_LABEL = /(?<=\p{L})(?:SSN|SS#|SOC(?:IAL)?\.?[ \t]*SEC(?:URITY)?|PHONES?|TELEPHONES?|FAX(?:ES)?|FACSIMILE)(?!\p{L})/gu;
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
  const gluedLong = lastNear(GLUED_LONG_LABEL);
  const gluedPhone = gluedLong !== null && /^(?:P|T|F)/u.test(gluedLong[0]);
  const ssn = Math.max(end(lastNear(SSN_LABEL)), length === 9 ? end(lastNear(MEDICARE_LABEL)) : -1, gluedPhone ? -1 : end(gluedLong));
  const phone = Math.max(end(lastNear(PHONE_LABEL)), gluedPhone ? end(gluedLong) : -1);
  if (ssn >= 0 || phone >= 0) {
    return ssn >= phone || length === 9 ? 'ssn' : 'phone';
  }
  return named ? 'keep' : 'none';
}

/** What the call's own identifier's placeholder becomes for the survivor scan: a BARRIER to every reader but the label window, which reads through it. */
const OWN_MARK = '\u0003';
/** After a label's own list number: an ordinal's suffix and a space, or ":", ")" or a full stop with no digit after it. */
const LIST_NUMBER_AFTER = /^[:)]/u;
/** An SSN or phone label right before its own list number. */
const PERSON_LABEL_BEFORE = new RegExp(`(?:${SSN_LABEL.source}|${PHONE_LABEL.source})[ \\t]{0,2}[:#]?[ \\t]{0,2}$`, 'u');
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
function labelWindow(text: string, start: number, stops: (index: number) => boolean, read: { readonly spanned?: (index: number) => boolean; readonly spansOnly?: boolean; readonly own?: (index: number) => boolean } = {}): string {
  const { spanned, spansOnly = false, own } = read;
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
    // The call's own identifier (its placeholder in masked text) between a label and its number, on the number's line.
    if (breaks === 0 && (character === OWN_MARK || (own !== undefined && own(index)))) {
      if (units[units.length - 1] !== ' ') units.push(' ');
      from = index;
      continue;
    }
    if (digit && !inSpan && breaks === 0) {
      // A label's own list number ("Phone 1: 555-0100", "Tel: 1st ..."): one or two digits right after an SSN or phone label.
      let first = index;
      while (first > 0 && DIGIT.test(text[first - 1] ?? '')) first -= 1;
      if (index - first < 2 && LIST_NUMBER_AFTER.test(text.slice(index + 1, index + 6)) && PERSON_LABEL_BEFORE.test(text.slice(Math.max(0, first - 32), first))) {
        units.push(' ');
        from = first;
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
function decideNamed(text: string, start: number, stops: (index: number) => boolean, length: number, digits: string, own?: (index: number) => boolean): Decision {
  const decision = decideBare(labelWindow(text, start, stops, { own }), length, digits);
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
        const decision = decideNamed(view.text, start, stops, form === 'local' ? 7 : core.length, core, own);
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
function survivorIn(text: string): Survivor {
  const barrier = new Uint8Array(text.length + 1);
  const mark = (start: number, end: number) => {
    for (let i = start; i < end; i += 1) barrier[i] = 1;
  };
  const labeled = new Map<string, ScanLabel>();
  const labeledAt = (start: number, glued = false): ScanLabel => {
    const key = `${String(start)}${glued ? 'g' : ''}`;
    let held = labeled.get(key);
    if (held === undefined) {
      held = scanLabeled(labelWindow(text, start, () => false), glued);
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
  // A run of nine digits or more before a decimal point is no amount: an SSN or phone with an amount's digits glued to it ("900123456150.00").
  const amounts = [...text.matchAll(UNSIGNED_AMOUNT)].filter((match) => !/^[0-9]{9,}[.,]/u.test(match[0])).map((match) => ({ start: match.index, end: match.index + match[0].length, amount: true }));
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
  const labeledOver = new Map<string, ScanLabel>();
  const labeledOverNumbers = (start: number, spansOnly = false, glued = false): ScanLabel => {
    const key = `${String(start)}${spansOnly ? 's' : 'n'}${glued ? 'g' : ''}`;
    let held = labeledOver.get(key);
    if (held === undefined) {
      held = scanLabeled(labelWindow(text, start, () => false, { spanned: (index) => spanned[index] === 1, spansOnly }).replace(/[0-9]/gu, ' '), glued);
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
  if (gluedShape(text, groups)) {
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
  return heldStrict({ text, groups, currencyAt, dateAt, amountAt, amountStarts, rangeSpans, rangeEnds, labeledAt }) ? 'survivor' : 'held';
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
function scanLabeled(window: string, glued = false): ScanLabel {
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
  const person = Math.max(...(glued ? GLUED_PERSON_LABELS : [SSN_LABEL, PHONE_LABEL, GLUED_LONG_LABEL]).map(lastEnd));
  const medicare = lastEnd(MEDICARE_LABEL);
  const code = Math.max(lastEnd(KEEP_NOUN), lastEnd(SCAN_CODE_NOUN));
  return person > code && person >= medicare ? 'person' : medicare > code ? 'medicare' : null;
}

/**
 * What the survivor scan finds: a survivor, the letter refused; a chain that only a range of two kinds holds ('held'), the
 * letter sent where nothing else refuses it; or nothing.
 */
type Survivor = 'survivor' | 'held' | null;

/** What masked text holds (survivorIn) on its digits view with invisible runs dropped or read as spaces (R4, R7): the more of the two. */
const survivorLeft = (text: string): Survivor => {
  const drop = viewOf(text, 'drop', true);
  const dropped = survivorIn(drop.text);
  // With no invisible run the two readings are one text: it is scanned once (review finding corr-ssn-2).
  if (dropped === 'survivor' || !drop.emptied) {
    return dropped;
  }
  return survivorIn(viewOf(text, 'space', true).text) ?? dropped;
};

/**
 * Whether a Social Security or phone number's own shape stands with digits glued to an end of it (PROTOTYPE): three groups
 * no barrier holds, joined by joiners alone, three digits or more, two (or three), and four or more, one of the outer
 * groups longer than the shape's ("900-12-3456150.00", "01/01/2020900-12-3456", "202-555-0123202-555-0124"); and a run of
 * eleven digits or more with cents after it ("900123456150.00").
 */
function gluedShape(text: string, groups: readonly ScanGroup[]): boolean {
  for (let i = 0; i < groups.length; i += 1) {
    const [a, b, c] = [groups[i], groups[i + 1], groups[i + 2]];
    if (a === undefined || a.blocked) continue;
    if (a.digits.length >= 11 && CENTS_AFTER.test(text.slice(a.end, a.end + 4))) return true;
    if (b === undefined || c === undefined || b.blocked || c.blocked) continue;
    const [g1, g2] = [text.slice(a.end, b.start), text.slice(b.end, c.start)];
    if (!TIGHT_JOIN.test(g1) || !TIGHT_JOIN.test(g2)) continue;
    const longer = a.digits.length > 3 || c.digits.length > 4;
    const slashed = g1.includes('/') || g2.includes('/');
    // A date written year first with digits glued after its day ("2020-01-02150.00") is read as cc3dd7f6 read it.
    const yearFirst = /^(?:19|20)[0-9]{2}$/u.test(a.digits) && /^(?:0[1-9]|1[0-2])$/u.test(b.digits) && /^(?:0[1-9]|[12][0-9]|3[01])/u.test(c.digits);
    if (longer && !yearFirst && a.digits.length >= 3 && c.digits.length >= 4 && ((b.digits.length === 2 && !slashed) || b.digits.length === 3)) return true;
  }
  return false;
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

/** PROTOTYPE: the last strict reason (debug). */
export let lastStrictReason = '';

/** A state's postal abbreviation, or ZIP and its connectors, before a ZIP code: what names a five, or a five and four, as one. */
const STATE = '(?:A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]|PR|GU|VI)';
const ZIP_BEFORE = new RegExp(`(?:(?<![\\p{L}\\p{N}])${STATE}|(?<=[0-9])(?!ND)${STATE}|(?<!\\p{L})ZIP(?:[ \\t]?CODE)?[:#]?)[ \\t]{1,2}$`, 'u');
/** A code word, glued to a digit before it or not, and the codes after it up to a position: "CODES 97110 97140 ". */
const CODE_LIST_BEFORE = /(?<!\p{L})(?:CPT|HCPCS|CODES?|MODIFIERS?|REV(?:ENUE)?|ICD(?:[\p{Pd}− ]?10)?)[:#]?(?:[ \t]{1,3}[A-Z]?[0-9]{2,5}(?:[\p{Pd}−][A-Z0-9]{2})*,?)*[ \t]{1,3}$/u;
const TAX_BEFORE = /(?<!\p{L})(?:TIN|EIN|TAX[ \t]?ID(?:ENTIFICATION)?)(?:[ \t]{1,3}(?:NO|NUMBER|NBR|NUM)\b\.?)?[:#]?[ \t]{1,3}$/u;
const LINE_BREAK_IN = new RegExp(LINE_BREAK, 'u');
const TIGHT_JOIN = /^[\p{Pd}−⁃˗➖./()_|\\'‘’ʼʹˊ′‵`~·‧∙⋅・•]{1,2}$/u;
const ROW_GAP = /^[ \t]{1,16}$/u;

/**
 * The strict reading of a held letter (survivorIn's 'held'): PROTOTYPE.
 */
function heldStrict(scan: HeldScan): boolean {
  lastStrictReason = strictReason(scan) ?? '';
  return lastStrictReason !== '';
}

function strictReason(scan: HeldScan): string | null {
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
  if (groups.some((group) => group.blocked && amountFirst(group.range))) return 'amount-first';
  // (2) beside a held range
  for (const [range, end] of rangeEnds) {
    const before = firstIndex(groups, (group) => group.start >= range) - 1;
    const after = firstIndex(groups, (group) => group.start >= end);
    if (groups.slice(before + 1, after).every((group) => group.kept)) continue;
    const left = groups[before];
    const right = groups[after];
    const leftGap = left === undefined ? '' : text.slice(left.end, range);
    const rightGap = right === undefined ? '' : text.slice(end, right.start);
    if (left !== undefined && (!left.blocked || left.named) && /^[^\s\p{L}\p{N}]+$/u.test(leftGap) && SCAN_LABELED_GAP.test(leftGap)) return 'tight-left';
    if (right !== undefined && (!right.blocked || right.named) && /^[^\s\p{L}\p{N}]+$/u.test(rightGap) && SCAN_LABELED_GAP.test(rightGap)) return 'tight-right';
    if (left !== undefined && left.range !== range && !left.blocked && SCAN_GAP.test(leftGap)) return 'free-left';
    if (right !== undefined && (right.digits.length === 9 || right.digits.length === 10) && /^\.?\p{L}+[.:#]?(?:[ \t]{1,3}(?:NO|NUMBER|NBR|NUM|ID)\b[.:#]?)?[ \t]{0,3}$/u.test(rightGap)) return 'glued-noun';
  }
  // a number, one or two letters and a date, nothing between: "2025550122th10-28-2026"
  for (let i = 0; i + 1 < groups.length; i += 1) {
    const [a, b] = [groups[i], groups[i + 1]];
    if (a !== undefined && b !== undefined && !a.blocked && a.digits.length >= 7 && b.blocked && dateAt[b.start] === 1 && /^\p{L}{1,2}$/u.test(gap(a, b))) return 'glued-touch';
  }
  // what is placed by its structure: never a part of a chain
  const placed = new Uint8Array(groups.length);
  const taxOrNpi = (group: ScanGroup) => group.named && /(?:NPI|TIN|EIN|TAX[ \t]?ID(?:ENTIFICATION)?)[^\p{L}\p{N}]*(?:(?:NO|NUMBER|NBR|NUM|ID)[^\p{L}\p{N}]*)*$/u.test(text.slice(Math.max(0, group.start - 40), group.start));
  groups.forEach((group, i) => {
    const next = groups[i + 1];
    const before = text.slice(Math.max(0, group.start - 64), group.start);
    if (currencyAt[group.start] === 1 || (group.blocked && dateAt[group.start] === 1) || taxOrNpi(group)) placed[i] = 1;
    if (group.blocked) return;
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
    // codes a code word names
    if (length <= 5 && CODE_LIST_BEFORE.test(before)) placed[i] = 1;
    // a code, its units and an amount on one line: a service-line row
    if (length === 5 && /(?:^|[\s])$/u.test(before)) {
      const units = nextFree !== undefined && nextFree.digits.length <= 2 && ROW_GAP.test(between) ? nextFree : undefined;
      const amount = units === undefined ? next : groups[i + 2];
      const toAmount = amount === undefined ? '' : text.slice((units ?? group).end, amount.start);
      if (amount !== undefined && amount.blocked && amountAt[amount.start] === 1 && ROW_GAP.test(toAmount)) {
        placed[i] = 1;
        if (units !== undefined) placed[i + 1] = 1;
      }
      // a code and the next line's count
      if (nextFree !== undefined && nextFree.digits.length <= 4 && LINE_BREAK_IN.test(between) && SCAN_GAP.test(between)) {
        placed[i] = 1;
        placed[i + 1] = 1;
      }
    }
    // a code's own digits after its one letter ("N235", "G0283")
    if (/(?<!\p{L})\p{L}$/u.test(before)) placed[i] = 1;
  });
  const chained = (digits: string) => digits.length === 9 || digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
  // (3) an SSN's or a phone's own shape with digits glued to an end of it
  for (let i = 0; i + 2 < groups.length; i += 1) {
    const [a, b, c] = [groups[i], groups[i + 1], groups[i + 2]];
    if (a === undefined || b === undefined || c === undefined || placed[i] === 1 || placed[i + 1] === 1 || placed[i + 2] === 1) continue;
    const [g1, g2] = [gap(a, b), gap(b, c)];
    if (!TIGHT_JOIN.test(g1) || !TIGHT_JOIN.test(g2)) continue;
    const longer = a.digits.length > 3 || c.digits.length > 4;
    const slashed = g1.includes('/') || g2.includes('/');
    const yearFirst = /^(?:19|20)[0-9]{2}$/u.test(a.digits) && /^(?:0[1-9]|1[0-2])$/u.test(b.digits) && /^(?:0[1-9]|[12][0-9]|3[01])/u.test(c.digits);
    if (a.digits.length >= 3 && b.digits.length === 2 && c.digits.length >= 4 && longer && !slashed && !yearFirst && !(a.blocked && b.blocked && c.blocked)) return 'embedded-ssn';
    if (a.digits.length >= 3 && b.digits.length === 3 && c.digits.length >= 4 && longer && !(a.blocked && b.blocked && c.blocked)) return 'embedded-phone';
  }
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
      if (label !== null && count >= 2 && digits.length >= 9 && !chained(digits) && run.every((each) => !each.blocked)) return 'labeled-long';
      if (digits.length > 11) break;
      const local = count === 2 && run[0]?.digits.length === 3 && run[1]?.digits.length === 4 && !run[0].blocked && !run[1].blocked;
      if (count < 2 || free === 0 || !(chained(digits) || local)) continue;
      const firstGroup = run[0];
      const last = run[run.length - 1];
      if (firstGroup === undefined || last === undefined) continue;
      const before = text.slice(Math.max(0, firstGroup.start - 48), firstGroup.start);
      // an amount and a year
      if (!last.blocked && /^(?:19|20)[0-9]{2}$/u.test(last.digits) && run.slice(0, -1).every((each) => each.blocked && amountAt[each.start] === 1)) continue;
      // a local number's shape inside a longer token, or after a currency amount
      if (local && (/\p{L}[\p{Pd}−]$/u.test(before) || /\p{Sc}[ \t]?[0-9][0-9,]*(?:\.[0-9]{1,2})?[ \t]{1,3}$/u.test(before))) continue;
      return `chain:${run.map((each) => each.digits.length).join(',')}${local ? ':local' : ''}`;
    }
  }
  // (5) a date written two, two and four with a lone digit beside it
  for (let i = 0; i + 3 < groups.length; i += 1) {
    const run = groups.slice(i, i + 4);
    const lengths = run.map((each) => each.digits.length).join(',');
    const joined = run.slice(1).every((each, k) => SCAN_GAP.test(gap(run[k] as ScanGroup, each)));
    if (joined && (lengths === '1,2,2,4' || lengths === '2,2,4,1') && run.some((each) => !each.blocked)) return 'date-shaped';
  }
  return null;
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
const masked = (text: string, claims = 0, name = BARRIER, own = BARRIER) =>
  text.normalize('NFKC').replace(PLACEHOLDER, (placeholder, claim?: string) =>
    placeholder === PLACEHOLDERS.name ? name : placeholder === PLACEHOLDERS.ssn || placeholder === PLACEHOLDERS.phone ? BARRIER : claim === undefined || Number.parseInt(claim, 10) <= claims ? own : `${BARRIER}${claim}${BARRIER}`,
  );

/**
 * Whether any of the identifiers is still in the text, in any form redaction reads, or a Social Security or phone number
 * by pattern, or a chain of digits the survivor scan reads as one no pattern took (the check after redaction:
 * docs/adr/0054, amendment of 2026-11-04, R7).
 */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  viewsOfCheck = [];
  datesOfCheck = [];
  try {
    const scanned = masked(text, claims.length);
    const subject = letterSubject(patient, claims);
    if (matchesIn(scanned, subject).length > 0) {
      return true;
    }
    const survivor = survivorLeft(masked(text, claims.length, OWN_MARK, OWN_MARK));
    if (survivor === 'survivor' || ownIdentifierGlued(masked(text, claims.length, NAME_MARK), subject, survivor === 'held') || (survivor === 'held' && birthBesideItsPlaceholder(text, subject))) {
      return true;
    }
    // A Social Security or phone number's placeholder is a number to what is glued to it: read once more with a digit in its place.
    return PATTERN_PLACEHOLDER.test(text) && ownIdentifierGlued(masked(text.normalize('NFKC').replace(PATTERN_PLACEHOLDERS, '0'), claims.length, NAME_MARK), subject, survivor === 'held');
  } finally {
    viewsOfCheck = null;
    datesOfCheck = null;
  }
}

const PATTERN_PLACEHOLDER = /\[(?:SSN|PHONE)\]/u;
const PATTERN_PLACEHOLDERS = /\[(?:SSN|PHONE)\]/gu;

/** The patient's name placeholder as the glued check reads it (ownIdentifierGlued): no letter, digit or joiner, kept by the fold. */
const NAME_MARK = '\u0002';

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
function ownIdentifierGlued(normal: string, subject: Subject, held: boolean): boolean {
  const { inOtherDate } = datesOf(normal, subject);
  return (
    numberGlued(normal, subject) ||
    birthGlued(normal, subject, inOtherDate) ||
    nameGlued(normal, subject, inOtherDate, held) ||
    spacedNameGlued(normal, subject, inOtherDate, held) ||
    MASKED_SSN_GLUED.test(viewOf(normal, 'drop', true).text) ||
    (held && heldOwnIdentifier(normal, subject))
  );
}

/**
 * A masked SSN glued to the word before it ("PaidXXX-XX-3456", "Paid***-**-3456"), read on the folded digits view: three
 * mask characters and two, or five, then four digits. In a letter whose chain only held barriers hold (cc3dd7f6 refused
 * it), the letter is refused; elsewhere it is the follow-on leak PR's class (docs/adr/0054).
 */
const MASKED_SSN_GLUED = /[\p{L}0-9]\.?(?:[X*#_\u2022\u25CF]{3}[\p{Pd}\u2212 .]?[X*#_\u2022\u25CF]{2}|[X*#_\u2022\u25CF]{5})[\p{Pd}\u2212 .]?[0-9]{4}(?![0-9])/u;

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
  const view = viewOf(normal, 'drop', true);
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
  const parts = [...new Set(subject.names.flatMap((name) => nameWords(name).flat()))].filter((part) => [...part].length >= 2);
  const marked = text.includes(NAME_MARK) || text.includes(BARRIER);
  const isLetter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
  const spelled = (characters: readonly string[]) => characters.map((character, i) => `${escapeRegExp(character)}${i + 1 < characters.length ? (isLetter(character) || isLetter(characters[i + 1]) ? GAP.numberNearLetter : GAP.number) : ''}`).join('');
  return forms.some((form) => {
    const core = coreOf(form);
    const lettersOnly = !/\p{N}/u.test(form.compact);
    const glued = (source: string) => new RegExp(lettersOnly ? `(?<=\\p{N})(?:${source})|(?:${source})(?=\\p{N})` : source, 'u').test(text);
    if (glued(core)) {
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
