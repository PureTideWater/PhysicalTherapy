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
 * - a member ID or claim number matches with or without the white space and dashes a letter puts inside
 *   it, and the underscores and periods next to a letter ("ZZ 1234567", "ZZ-1234567", "ZZ_1234567");
 * - a name matches with or without the dashes and apostrophes inside it (O’Brien, Smith–Jones), and with
 *   a space only where each side is a capitalized piece of two letters or more ("Jo Ann", never "in a");
 * - an initial of the patient's name next to a name ("J. Q. Vantree", "Vantree, J.") is a name;
 * - a date of birth matches in every form a letter writes a date: month first or day first, with
 *   slashes, hyphens or dots, a two- or four-digit year, compact (19610303, 03031961, 030361), and the
 *   month in words with or without a leading zero, an ordinal or a comma (March 03, 1961; 3rd March
 *   1961; 03-MAR-61). Any date a birth label introduces (DOB, date of birth, born) is replaced too,
 *   whatever its value, so a date of birth the records do not hold is not sent either.
 *
 * Every match is found on the letter before anything is replaced, and overlapping matches become one
 * placeholder, so no placeholder is ever rewritten. What the task reads stays: a month word in a date
 * that is not a date of birth is not a name, and digits written as an amount, or as a date with its
 * separators, are not a number. Nothing else of the letter changes.
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

/** The date patterns a letter writes, each with every reading of its parts (month first and day first alike). */
const DATE_PATTERNS: readonly { readonly pattern: RegExp; readonly read: (match: RegExpExecArray) => string[] }[] = [
  // 1961-03-03, 1961/3/3, 1961.03.03
  { pattern: new RegExp(`${BEFORE}(\\d{4})\\s*([/.\\-])\\s*(\\d{1,2})\\s*\\2\\s*(\\d{1,2})${AFTER}`, 'gu'), read: (m) => readings([{ year: m[1] ?? '', month: num(m[3]), day: num(m[4]) }]) },
  // 03/03/1961, 3-3-61, 3.3.1961, either order of month and day
  {
    pattern: new RegExp(`${BEFORE}(\\d{1,2})\\s*([/.\\-])\\s*(\\d{1,2})\\s*\\2\\s*(\\d{4}|\\d{2})${AFTER}`, 'gu'),
    read: (m) => readings([{ year: m[4] ?? '', month: num(m[1]), day: num(m[3]) }, { year: m[4] ?? '', month: num(m[3]), day: num(m[1]) }]),
  },
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
  },
  // March 3, 1961; Mar. 03 1961; March 3rd, '61
  {
    pattern: new RegExp(`${BEFORE}${MONTH_WORD}\\.?\\s*(\\d{1,2})${ORDINAL},?\\s*'?(\\d{4}|\\d{2})${AFTER}`, 'giu'),
    read: (m) => readings([{ year: m[3] ?? '', month: monthOf(m[1] ?? ''), day: num(m[2]) }]),
  },
  // 3 March 1961; 3rd of March, 1961; 03-MAR-1961; 3-Mar-61
  {
    pattern: new RegExp(`${BEFORE}(\\d{1,2})${ORDINAL}(?:\\s+of)?[\\s\\-]*${MONTH_WORD}\\.?,?[\\s\\-]*'?(\\d{4}|\\d{2})${AFTER}`, 'giu'),
    read: (m) => readings([{ year: m[3] ?? '', month: monthOf(m[2] ?? ''), day: num(m[1]) }]),
  },
];

/** A label that introduces a date of birth, ending where its date begins. */
const BIRTH_LABEL = /(?:\bD\.?\s?O\.?\s?B\b\.?|\bdate\s+of\s+birth\b|\bbirth\s*date\b|\bborn(?:\s+on)?\b|\bbirthday\b)\s*[:#-]?\s*(?:is\s+)?$/iu;

interface DateSpan {
  readonly start: number;
  readonly end: number;
  readonly dates: readonly string[];
}

/** Every date a letter writes, longest first where two forms overlap, with each calendar date it can be read as. */
export function datesIn(text: string): DateSpan[] {
  const spans: DateSpan[] = [];
  for (const { pattern, read } of DATE_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const span = { start: match.index, end: match.index + match[0].length, dates: read(match) };
      if (!spans.some((other) => other.start <= span.start && span.end <= other.end)) {
        spans.push(span);
      }
    }
  }
  return spans.filter((span) => !spans.some((other) => other !== span && other.start <= span.start && span.end <= other.end && other.end - other.start > span.end - span.start)).sort((a, b) => a.start - b.start);
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

const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|CLAIM_[1-9]\d*)\]/g;

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

const within = (inner: Range, outer: Range) => outer.start <= inner.start && inner.end <= outer.end;

/** Whether a written code point starts a capitalized word: upper or title case, or a character with no case. */
const capital = (codePoint: string) => codePoint !== codePoint.toLowerCase() || codePoint === codePoint.toUpperCase();

/** The written (NFKC) code point a view position came from. */
const writtenAt = (view: View, normal: string, index: number) => codePointAt(normal, view.from[index] ?? 0);

// ---------------------------------------------------------------------------------------------------
// Forms and the matcher

/** Dashes (with the minus sign and hyphen bullet PDF text writes for a hyphen), apostrophes, the underscore and VANISHED: they join a name anywhere. */
const NAME_JOINERS = "\\p{Pd}\\u2212\\u2043'\\u2018\\u2019\\u02BC`\\u00B4_\\u00AD";
/** White space, dashes and VANISHED: they join a member ID or claim number anywhere ("." and "_" only next to a letter). */
const NUMBER_JOINERS = '\\s\\p{Pd}\\u2212\\u2043\\u00AD';

const GAP = {
  /** Inside a name's part, near its ends: "Van-tree", "O’Brien". */
  tight: `[${NAME_JOINERS}]*`,
  /** Inside a name's part, two letters or more from each end: a space or period too, if the pieces it makes pass (spacedPiecesPass). */
  spaced: `[${NAME_JOINERS}\\s.]*`,
  /** Between the parts the records hold apart: any joiner, white space, a period or a comma. */
  part: `[${NAME_JOINERS}\\s.,]*`,
  number: `[${NUMBER_JOINERS}]*`,
  /** Between two characters of a number of which one is a letter: "SYN.555001", "ZZ_1234567" (never "150.00"). */
  numberNearLetter: `[${NUMBER_JOINERS}._]*`,
} as const;

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
  /** A number of digits only: never an amount, and not a date written with its separators. */
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
        spaced.push(/[\s.,]/u.test(gap));
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

/** Whether digits at an NFKC range are written as an amount: after a currency sign, or with cents after them. */
const isAmount = (normal: string, range: Range) => /\p{Sc}\s*$/u.test(normal.slice(Math.max(0, range.start - 8), range.start)) || /^[.,]\d{2}(?!\d)/u.test(normal.slice(range.end, range.end + 4));

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
  // Dates on both readings of invisible characters. A date that is not a date of birth stays, and holds no name, nor a number written with its separators.
  const otherDates: Range[] = [];
  const births = new Set(subject.datesOfBirth ?? []);
  for (const invisible of ['drop', 'space'] as const) {
    const view = viewOf(normal, invisible);
    for (const span of datesIn(view.text)) {
      const range = inNormal(view, span.start, span.end);
      if (subject.datesOfBirth !== null && (span.dates.some((date) => births.has(date)) || BIRTH_LABEL.test(view.text.slice(Math.max(0, span.start - 40), span.start)))) {
        found.push({ ...range, kind: 'birth', claim: 0 });
      } else {
        otherDates.push(range);
      }
    }
  }
  const inOtherDate = (range: Range) => otherDates.some((date) => within(range, date));
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
      } else if (form.digitsOnly && (isAmount(normal, range) || (inOtherDate(range) && match[0].length > form.compact.length))) {
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
const INITIAL_GAP_AFTER = /^[\s'‘’ʼ`´\p{Pd}−⁃_\u00AD]*,?[\s\u00AD]*$/u;

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
  const taken: Range[] = [...names];
  const isTaken = (range: Range) => taken.some((other) => other.start < range.end && range.start < other.end);
  for (let added = true; added; ) {
    added = false;
    for (const candidate of candidates) {
      if (isTaken(candidate)) {
        continue;
      }
      const cased = (next: Range) => capital(written(candidate)) || lowerCase(next);
      const dotted = view.text[candidate.end] === '.';
      const resume = candidate.end + (dotted ? 1 : 0);
      const following = taken.filter((other) => other.start >= resume).sort((a, b) => a.start - b.start)[0];
      const preceding = taken.filter((other) => other.end <= candidate.start).sort((a, b) => b.end - a.end)[0];
      const precedes = following !== undefined && INITIAL_GAP.test(view.text.slice(resume, following.start)) && cased(following);
      const follows = preceding !== undefined && INITIAL_GAP_AFTER.test(view.text.slice(preceding.end, candidate.start)) && cased(preceding) && (dotted || !beforeLowerCaseWord(view, normal, candidate.end, [...taken, ...candidates]));
      if (precedes || follows) {
        taken.push(candidate);
        added = true;
      }
    }
  }
  return taken.slice(names.length);
}

/** Whether the next word after a view position is written in lower case and is neither a name nor a possible initial. */
function beforeLowerCaseWord(view: View, normal: string, position: number, known: readonly Range[]): boolean {
  const space = /[\s\u00AD]*/uy;
  space.lastIndex = position;
  space.exec(view.text);
  const start = space.lastIndex;
  if (start >= view.text.length || !WORD_CHARACTER.test(codePointAt(view.text, start)) || known.some((range) => range.start === start)) {
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

/** The letter as NFKC text and the spans redaction replaces in it, in order, each with its placeholder: what redactLetter writes. */
export function redactionSpans(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): { readonly text: string; readonly spans: readonly { readonly start: number; readonly end: number; readonly placeholder: string }[] } {
  const normal = text.normalize('NFKC');
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

/** NFKC text with each exact placeholder made the BARRIER, so no match reaches into or across one. */
const masked = (text: string) => text.normalize('NFKC').replace(PLACEHOLDER, BARRIER);

/** Whether any of the identifiers is still in the text, in any form redaction reads (the check after redaction). */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  return matchesIn(masked(text), letterSubject(patient, claims)).length > 0;
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
 * them): the one tokenizer for "which run of a text is an identifier". On the NFKC text, a token is a
 * maximal run of letters, digits and marks; a blank (a Hangul filler) is white space, and an invisible
 * character is VANISHED and never part of a token, so "REF<ZWSP>ZZ7654321" gives "ZZ7654321" and the run
 * joined across it. From each token, a run extends over at most maxTokens tokens while `joins` accepts
 * what lies between two of them (given with the two tokens); `keep` decides which runs are returned.
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

/** What joins two tokens of one identifier in a letter: white space, dashes and invisible characters, and "." or "_" next to a letter. */
function letterJoins(between: string, left: string, right: string): boolean {
  return /^[\s\p{Pd}−⁃\u00AD._]+$/u.test(between) && (!/[._]/u.test(between) || /\p{L}\p{M}*$/u.test(left) || /^\p{L}/u.test(right));
}

/**
 * The runs of the redacted text that could be another patient's member ID or claim number: each token
 * with a digit in it, and each run of up to three tokens a letter may have spaced, hyphenated or joined
 * with an underscore, a period or an invisible character ("ZZ 1234567", "ZZ_7654321", "ID:ZZ7654321"),
 * as compact identifiers (letters and digits, upper case) of at least five characters. An exact
 * placeholder is never one, nor part of one.
 */
export function identifierCandidates(text: string): string[] {
  return identifierTokenRuns(masked(text), { joins: letterJoins, maxTokens: 3, keep: (run) => /\d/.test(run) && run.length >= 5 }).sort();
}
