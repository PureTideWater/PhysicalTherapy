import { identifierForms } from '@tp/packets';

/**
 * PHI minimization for a payer letter (PRD 14, PHI minimization: "the gateway sends the minimum text
 * needed, strips names, dates of birth, member IDs and claim numbers by exact match before the call
 * where the task allows it, and never sends more than one patient's material in one call").
 *
 * The patient's names (each whole name and each of its words, as the packet verifier reads them), dates
 * of birth, member IDs and the claims' numbers are replaced, wherever they appear as whole words and
 * without regard to case, by placeholders: [PATIENT_NAME], [DATE_OF_BIRTH], [MEMBER_ID], and
 * [CLAIM_1], [CLAIM_2] ... for the claims in the order given. The claim placeholders keep the task
 * possible: the model cites a claim by its placeholder, and code maps it back to the claim.
 *
 * "Exact match" is read as the same value however a letter spaces or writes it:
 * - a member ID or claim number matches with or without the spaces and hyphens a letter puts inside it
 *   ("ZZ 1234567", "ZZ-1234567" are "ZZ1234567");
 * - a date of birth matches in every form a letter writes a date: month first or day first, with
 *   slashes, hyphens or dots, a two- or four-digit year, compact (19610303, 03031961, 030361), and the
 *   month in words with or without a leading zero, an ordinal or a comma (March 03, 1961; 3rd March
 *   1961; 03-MAR-61). Any date a birth label introduces (DOB, date of birth, born) is replaced too,
 *   whatever its value, so a date of birth the records do not hold is not sent either.
 *
 * Nothing else of the letter changes.
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
  /** How many identifiers were replaced (a count, for tests and logs). */
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

/**
 * A whole-word, case-blind pattern for a member ID or claim number, however a letter spaces, hyphenates or groups it:
 * between any two of its characters, any run of white space, hyphens, dashes, minus signs, dots, slashes,
 * underscores, asterisks and invisible characters (a soft hyphen, a zero-width space), the separators the contract
 * screen's tokenizer joins too (identifierRuns, below).
 */
function identifierPattern(value: string): RegExp | null {
  const characters = [...compactIdentifier(value)];
  if (characters.length < 2) {
    return null;
  }
  return new RegExp(`${BEFORE}${characters.map(escapeRegExp).join('[\\s\\p{Pd}\\u2212./_*\\p{Cf}\\p{Default_Ignorable_Code_Point}]*')}${AFTER}`, 'giu');
}

/** A whole-word, case-blind pattern for a name form, its spaces matching any run of white space. */
function namePattern(form: string): RegExp {
  return new RegExp(`${BEFORE}${escapeRegExp(form).replace(/\s+/g, '\\s+')}${AFTER}`, 'giu');
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

/** The dates of birth in the text: a date equal to one of the patient's, or any date a birth label introduces. */
function birthDates(text: string, datesOfBirth: readonly string[]): DateSpan[] {
  const births = new Set(datesOfBirth);
  return datesIn(text).filter((span) => span.dates.some((date) => births.has(date)) || BIRTH_LABEL.test(text.slice(Math.max(0, span.start - 40), span.start)));
}

// ---------------------------------------------------------------------------------------------------
// Redaction

/** The identifiers' patterns with their placeholders, longest first, so a whole name goes before its parts. */
export function redactionForms(patient: PatientIdentifiers, claims: readonly LetterClaim[]): { readonly form: string; readonly placeholder: string }[] {
  const forms = [
    ...claims.flatMap((claim, index) => claim.claimNumbers.map((form) => ({ form: form.normalize('NFKC').trim(), placeholder: `[CLAIM_${String(index + 1)}]` }))),
    ...patient.memberIds.map((form) => ({ form: form.normalize('NFKC').trim(), placeholder: '[MEMBER_ID]' })),
    ...identifierForms(patient.names).map((form) => ({ form, placeholder: '[PATIENT_NAME]' })),
  ];
  return forms.filter((entry) => entry.form !== '').sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
}

function patternFor(entry: { readonly form: string; readonly placeholder: string }): RegExp | null {
  return entry.placeholder === '[PATIENT_NAME]' ? namePattern(entry.form) : identifierPattern(entry.form);
}

function replaceAll(text: string, pattern: RegExp, placeholder: string): { readonly text: string; readonly count: number } {
  let count = 0;
  const replaced = text.replace(pattern, () => {
    count += 1;
    return placeholder;
  });
  return { text: replaced, count };
}

/** Replaces the dates of birth, last to first so earlier positions stand. */
function replaceBirthDates(text: string, datesOfBirth: readonly string[]): { readonly text: string; readonly count: number } {
  const spans = birthDates(text, datesOfBirth);
  let replaced = text;
  for (const span of [...spans].reverse()) {
    replaced = `${replaced.slice(0, span.start)}[DATE_OF_BIRTH]${replaced.slice(span.end)}`;
  }
  return { text: replaced, count: spans.length };
}

export function redactLetter(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted {
  // Dates first: a compact date of birth is digits a claim number's pattern could otherwise take apart.
  let { text: redacted, count: replaced } = replaceBirthDates(text.normalize('NFKC'), patient.datesOfBirth);
  for (const entry of redactionForms(patient, claims)) {
    const pattern = patternFor(entry);
    if (pattern !== null) {
      const result = replaceAll(redacted, pattern, entry.placeholder);
      redacted = result.text;
      replaced += result.count;
    }
  }
  return { text: redacted, claims: new Map(claims.map((claim, index) => [`[CLAIM_${String(index + 1)}]`, claim.claimId])), replaced };
}

/** Whether any of the identifiers is still in the text, in any form redaction reads (the check after redaction). */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  const normalizedText = text.normalize('NFKC');
  return birthDates(normalizedText, patient.datesOfBirth).length > 0 || redactionForms(patient, claims).some((entry) => (patternFor(entry)?.test(normalizedText) ?? false));
}

/**
 * The runs of the redacted text that could be another patient's member ID or claim number: each word
 * with a digit in it, and each run of up to three words a letter may have spaced or hyphenated one
 * into ("ZZ 1234567"), as compact identifiers (letters and digits, upper case) of at least five
 * characters. A placeholder is never one.
 */
export function identifierCandidates(text: string): string[] {
  const words = text
    .normalize('NFKC')
    .replace(/\[[A-Z_]+(?:_\d+)?\]/g, ' ')
    .split(/[\s\-‐-―]+/u)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word !== '' && /^[\p{L}\p{N}]+$/u.test(word));
  const candidates = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    for (let length = 1; length <= 3 && start + length <= words.length; length += 1) {
      joined += compactIdentifier(words[start + length - 1] ?? '');
      if (/\d/.test(joined) && joined.length >= 5) {
        candidates.add(joined);
      }
    }
  }
  return [...candidates].sort();
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
 * the token ZZ1234567) and are taken out of the gap between two tokens before it is judged.
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
