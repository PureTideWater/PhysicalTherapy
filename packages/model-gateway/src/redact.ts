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
 * - a member ID or claim number matches with or without the white space, dashes and invisible characters
 *   a letter puts inside it, and the underscores, periods, slashes and colons next to a letter
 *   ("ZZ 1234567", "ZZ-1234567", "ZZ_1234567", "ZZ/1234567");
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
 * month word is not a name and digits written with its dashes are not a number; a claim's digits
 * written as an amount, after a currency sign and with cents, are not its number. The letter's own
 * square brackets become parentheses, so the only bracketed text sent is a placeholder. Nothing else of
 * the letter changes.
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

/** The years a written year may be: a two-digit year is either century. */
function years(written: string): number[] {
  const value = Number.parseInt(written, 10);
  return written.length === 2 ? [1900 + value, 2000 + value] : written.length === 4 ? [value] : [];
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
 * one that does.
 */
export function datesIn(text: string): DateSpan[] {
  const all: DateSpan[] = [];
  for (const { pattern, read, separated } of DATE_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      all.push({ start: match.index, end: match.index + match[0].length, dates: read(match), separated });
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

/** Letters, and one format character, that a letter shows as a blank (the Hangul fillers, the Mongolian vowel separator): white space here. */
const BLANK = /^[\u115F\u1160\u3164\uFFA0\u180E]$/u;
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

const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|CLAIM_([1-9]\d*))\]/g;

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
}

/**
 * The view of NFKC text: each code point folded, a blank a space, and an invisible character joined into
 * one VANISHED character per run (`join`, the view names and numbers are matched on), dropped (`drop`) or
 * read as a space (`space`). Dates are read on both of the last two, so neither a zero-width space inside
 * a date nor one between a date and a digit hides it.
 */
function viewOf(normal: string, invisible: 'join' | 'drop' | 'space'): View {
  let text = '';
  const from: number[] = [];
  const to: number[] = [];
  let offset = 0;
  for (const codePoint of normal) {
    const start = offset;
    offset += codePoint.length;
    let unit = BLANK.test(codePoint) ? ' ' : IGNORABLE.test(codePoint) ? '' : fold(codePoint);
    if (unit === '') {
      if (invisible === 'drop') {
        continue;
      }
      if (invisible === 'join' && text.endsWith(VANISHED) && to.at(-1) === start) {
        to[to.length - 1] = offset;
        continue;
      }
      unit = invisible === 'join' ? VANISHED : ' ';
    }
    text += unit;
    for (let i = 0; i < unit.length; i += 1) {
      from.push(start);
      to.push(offset);
    }
  }
  return { text, from, to };
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
const NAME_JOINERS = "\\p{Pd}\\u2212\\u2043'\\u2018\\u2019\\u02BC`\\u00B4_\\u00AD";
/** White space, dashes and VANISHED: they join a member ID or claim number anywhere ("." "_" "/" ":" "#" and "(" only next to a letter). */
const NUMBER_JOINERS = '\\s\\p{Pd}\\u2212\\u2043\\u00AD';
/** A line break, and a dash (or VANISHED) before one: a word hyphenated at the end of a line ("Van-⏎tree"). */
const LINE_BREAK = '(?:\\r\\n|[\\n\\r\\u0085\\u2028\\u2029])';
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
  numberNearLetter: `[${NUMBER_JOINERS}._/:#(]*`,
} as const;

/** A gap that is a word hyphenated at a line break, which joins inside a part whatever the pieces' case ("Jo-⏎ann"). */
const HYPHENATED = new RegExp(`^[${NAME_JOINERS}]*${HYPHENATION}[${NAME_JOINERS}]*$`, 'u');

/** A name's words and parts as the records write them: words split by white space, ",", ";" and "/"; parts by dashes, apostrophes, "." and "_". */
const WORD_SPLIT = /[\s,;/]+/u;
const PIECE_SPLIT = /[\p{Pd}−⁃'‘’ʼ`´._\u00AD]+/u;

/** The letters and digits of folded text (U+02BC, a letter by class, is an apostrophe here). */
const compactFolded = (text: string) => text.replace(/[^\p{L}\p{N}]|ʼ/gu, '');

type Kind = 'claim' | 'member' | 'birth' | 'name';

interface Form {
  /** The form's letters and digits, folded. */
  readonly compact: string;
  readonly kind: Kind;
  /** For a claim, its number in the call (1 for [CLAIM_1]). */
  readonly claim: number;
  readonly pattern: RegExp;
  /** For a name, whether each gap is inside a part (where a space must leave capitalized pieces of two letters or more). */
  readonly insidePart: readonly boolean[];
  /** A number of digits only: only such a number may be a claim's amount, or the digits of a date written with its dashes. */
  readonly digitsOnly: boolean;
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
  return { compact, kind, claim, pattern: patternOf(characters, gaps), insidePart: [], digitsOnly: /^\p{N}+$/u.test(compact) };
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
  return { compact: characters.join(''), kind: 'name', claim: 0, pattern: patternOf(characters, gaps), insidePart, digitsOnly: false };
}

/** What is matched: names, member IDs and the claims' numbers, and whether dates of birth and initials are taken too. */
interface Subject {
  readonly names: readonly string[];
  readonly memberIds: readonly string[];
  readonly claims: readonly (readonly string[])[];
  /** The dates of birth to read, or null when no date is a date of birth (the narrative's facts). */
  readonly datesOfBirth: readonly string[] | null;
  readonly initials: boolean;
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
    if (WORD_CHARACTER.test(codePoint) && codePoint !== 'ʼ') {
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

/** A dash in a number's match: the only date separator a number may hold (an invisible character or a space is none). */
const DASHED = /[\p{Pd}−⁃]/u;

interface Found extends Range {
  readonly kind: Kind;
  readonly claim: number;
}

/**
 * Every match in NFKC text, as NFKC ranges, all found on the text as it is before anything is replaced:
 * the dates of birth, the claims' numbers and member IDs, the names and (when asked) the initials next
 * to a name.
 */
function matchesIn(normal: string, subject: Subject): Found[] {
  const found: Found[] = [];
  // Dates on both readings of invisible characters. A separated date with a calendar reading that is not a date of birth stays, and holds no name, nor a number written with its dashes.
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
      } else if (form.digitsOnly && ((form.kind === 'claim' && isAmount(normal, range)) || (inOtherDate(range) && DASHED.test(match[0])))) {
        continue;
      }
      found.push({ ...range, kind: form.kind, claim: form.claim });
    }
  }
  if (subject.initials) {
    for (const initial of initialsNextToNames(view, normal, names, initialsOf(subject.names))) {
      found.push({ ...inNormal(view, initial.start, initial.end), kind: 'name', claim: 0 });
    }
  }
  return found;
}

/** What may lie between an initial and the name it belongs to: white space, apostrophes, dashes, "_" and VANISHED (after the name, a comma too). */
const INITIAL_GAP = /^[\s'‘’ʼ`´\p{Pd}−⁃_\u00AD]*$/u;
const INITIAL_GAP_AFTER = /^[\s'‘’ʼ`´\p{Pd}−⁃_\u00AD]*(?:,[\s\u00AD]*)?$/u;
const GAP_CHARACTER = /^[\s'‘’ʼ`´\p{Pd}−⁃_\u00AD,]$/u;

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
// Redaction

const RANK: Readonly<Record<Kind, number>> = { claim: 0, member: 1, birth: 2, name: 3 };
const PLACEHOLDERS: Readonly<Record<Exclude<Kind, 'claim'>, string>> = { member: '[MEMBER_ID]', birth: '[DATE_OF_BIRTH]', name: '[PATIENT_NAME]' };

/**
 * Overlapping matches as one span each, its placeholder chosen by kind, never by length: [CLAIM_n] (the
 * lowest n) if any claim's number is in it, else [MEMBER_ID], else [DATE_OF_BIRTH], else
 * [PATIENT_NAME]. Every placeholder hides the whole span; the claim's is the one the task needs.
 */
function merge(found: readonly Found[]): { readonly start: number; readonly end: number; readonly placeholder: string }[] {
  const spans: Found[] = [];
  for (const match of [...found].sort((a, b) => a.start - b.start || b.end - a.end)) {
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

export function redactLetter(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted {
  const { text: normal, spans } = redactionSpans(text, patient, claims);
  let redacted = '';
  let kept = 0;
  for (const span of spans) {
    redacted += normal.slice(kept, span.start) + span.placeholder;
    kept = span.end;
  }
  redacted += normal.slice(kept);
  return { text: redacted, claims: new Map(claims.map((claim, index) => [`[CLAIM_${String(index + 1)}]`, claim.claimId])), replaced: spans.length };
}

/**
 * NFKC text with each exact placeholder made the BARRIER, so no match reaches into or across one. A
 * claim's placeholder past the call's claims (all of them, for the screen, which knows no call) keeps its
 * digits between two barriers: a letter's own "[CLAIM_7654321]" still holds 7654321 for every check.
 */
const masked = (text: string, claims = 0) => text.normalize('NFKC').replace(PLACEHOLDER, (_, claim?: string) => (claim === undefined || Number.parseInt(claim, 10) <= claims ? BARRIER : `${BARRIER}${claim}${BARRIER}`));

/** Whether any of the identifiers is still in the text, in any form redaction reads (the check after redaction). */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  return matchesIn(masked(text, claims.length), letterSubject(patient, claims)).length > 0;
}

/**
 * Whether the text holds any of the names (read as names) or numbers (member IDs and claim numbers, read
 * as numbers) in a form redaction reads: the narrative drafter's check of its facts. No date there is a
 * date of birth, and no initial is looked for (a whole name or part is).
 */
export function holdsNameOrNumber(text: string, identifiers: { readonly names: readonly string[]; readonly numbers: readonly string[] }): boolean {
  return matchesIn(masked(text), { names: identifiers.names, memberIds: identifiers.numbers, claims: [], datesOfBirth: null, initials: false }).length > 0;
}

/**
 * The runs of text that could be one identifier, as compact identifiers (as compactIdentifier makes
 * them): the letter path's one tokenizer for "which run of a text is an identifier" (the contract screen
 * streams its own, someIdentifierRun below, which joins differently: docs/adr/0070 Part 3, N6). On the
 * NFKC text, a token is a maximal run of letters, digits and marks; a blank (a Hangul filler) is white
 * space, and an invisible character is VANISHED and never part of a token, so "REF<ZWSP>ZZ7654321" gives
 * "ZZ7654321" and the run joined across it. From each token, a run extends over at most maxTokens tokens
 * while `joins` accepts what lies between two of them (given with the two tokens); `keep` decides which
 * runs are returned.
 */
export function identifierTokenRuns(text: string, options: { readonly joins: (between: string, left: string, right: string) => boolean; readonly maxTokens: number; readonly keep: (run: string) => boolean }): string[] {
  const scan = text.normalize('NFKC').replace(/[\s\S]/gu, (character) => (BLANK.test(character) ? ' ' : IGNORABLE.test(character) ? VANISHED : character));
  const tokens = [...scan.matchAll(/[\p{L}\p{N}\p{M}]+/gu)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
  const runs = new Set<string>();
  for (let start = 0; start < tokens.length; start += 1) {
    let joined = '';
    for (let length = 1; length <= options.maxTokens && start + length <= tokens.length; length += 1) {
      const token = tokens[start + length - 1];
      const before = tokens[start + length - 2];
      if (token === undefined || (length > 1 && (before === undefined || !options.joins(scan.slice(before.end, token.start), before.text, token.text)))) {
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

/** What joins two tokens of one identifier in a letter: white space, dashes and invisible characters, and ".", "_", "/", ":", "#" or "(" next to a letter. */
function letterJoins(between: string, left: string, right: string): boolean {
  return /^[\s\p{Pd}−⁃\u00AD._/:#(]+$/u.test(between) && (!/[._/:#(]/u.test(between) || /\p{L}\p{M}*$/u.test(left) || /^\p{L}/u.test(right));
}

/**
 * The runs of the redacted text that could be another patient's member ID or claim number: each token
 * with a digit in it, and each run of up to three tokens a letter may have spaced, hyphenated or joined
 * with an underscore, a period, a slash, a colon, "#", "(" or an invisible character ("ZZ 1234567",
 * "ZZ_7654321", "ZZ/7654321", "ZZ#7654321", "ID:ZZ7654321"), as compact identifiers (letters and digits,
 * upper case) of at least five characters. A placeholder's word is never one, nor part of one; a claim's placeholder keeps its digits
 * (a redacted letter's [CLAIM_n] number its claims, never five digits; a letter's own "[CLAIM_7654321]"
 * offers 7654321).
 */
export function identifierCandidates(text: string): string[] {
  return identifierTokenRuns(masked(text), { joins: letterJoins, maxTokens: 3, keep: (run) => /\d/.test(run) && run.length >= 5 }).sort();
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

/** Whether eight digits are a calendar date written YYYYMMDD or MMDDYYYY, a year from 1900 to 2099: what the tokenizer makes of "2026-01-01" or "01-01-2026". */
export function isCompactCalendarDate(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) {
    return false;
  }
  const valid = (year: number, month: number, day: number) => year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
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
