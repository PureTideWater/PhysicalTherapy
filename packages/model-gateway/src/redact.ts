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

/** A whole-word, case-blind pattern for a member ID or claim number, however a letter spaces or hyphenates it. */
function identifierPattern(value: string): RegExp | null {
  const characters = [...compactIdentifier(value)];
  if (characters.length < 2) {
    return null;
  }
  return new RegExp(`${BEFORE}${characters.map(escapeRegExp).join('[\\s\\-‐-―]*')}${AFTER}`, 'giu');
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
