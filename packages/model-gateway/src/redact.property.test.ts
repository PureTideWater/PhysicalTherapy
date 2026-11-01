import { identifierForms } from '@tp/packets';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type LetterClaim, type PatientIdentifiers, compactIdentifier, dateForms, datesIn, holdsIdentifier, identifierCandidates, redactLetter, redactionSpans } from './redact';

/**
 * The letter reader's redaction over generated SYNTHETIC letters (test matrix MOD-13, MOD-14; docs/adr/0054, amendment of
 * 2026-10-27). The oracle is the generator, never the matcher: each letter is built from segments, and the generator
 * records which segments it wrote a name, an initial, a member ID, a claim number or a date of birth into. Asserted:
 * - no letter or digit of those segments is sent (each lies inside a replaced span), wherever and however it was written;
 * - every place a claim's number was written is a claim's placeholder, the lowest claim of those it could be;
 * - every placeholder in the output is exact and counted, and the self-check finds nothing;
 * - every letter or digit today's code (a frozen copy, below) replaces is still replaced, except in a date that is not a
 *   date of birth and that this test reads as a calendar date with its separators, or a claim's digits written as an
 *   amount (the two over-redactions the change removes on purpose);
 * - a digits-only number written with a dash or an invisible character is replaced unless the written text is a calendar
 *   date with its separators that is not the date of birth (the generator writes such numbers, and dates' digits as numbers);
 * - text that holds none of the patient's forms is sent unchanged, common phrases, amounts and deadlines included;
 * - the one-patient screen is offered another patient's ID however it is written, digits alone too, and never a
 *   placeholder's word.
 * A fixed number of runs, as the repository's property tests use; no precondition filters a run.
 */

// ---------------------------------------------------------------------------------------------------
// Generated letters

const DESERET = String.fromCodePoint(0x10414, 0x10407, 0x1041d, 0x10400, 0x10421, 0x10407, 0x10413);
/** Name parts that broke the earlier redaction or that a letter writes another way: placeholder words, months, marks, ß, apostrophes, hyphens, an astral script. */
const PARTS = ['CLAIM', 'DATE', 'OF', 'BIRTH', 'MEMBER', 'ID', 'PATIENT', 'NAME', 'JUNE', 'MAY', 'MARCH', 'AUGUST', 'VANTREE', 'ZEPHYRA', 'ORLA', 'JOANN', 'STRAUSS', 'JOSÉ', 'GARCÍA', "O'BRIEN", 'SMITH-JONES', 'INA', 'IVY', 'ANA', DESERET];
const part = fc.oneof(fc.constantFrom(...PARTS), fc.stringMatching(/^[A-Z]{2,8}$/));
const middle = fc.option(fc.oneof(fc.constantFrom('Q', 'J', 'A', 'I'), part), { nil: undefined });

type Style = 'upper' | 'title' | 'lower';
type Variant = 'plain' | 'marks' | 'sharp' | 'typographic' | 'spaced' | 'invisible';

const INVISIBLES = ['\u00AD', '\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
const APOSTROPHES = ['’', '‘', 'ʼ', '`', '´', '', ' '];
const DASHES = ['–', '—', '‐', '−', '⁃', ' ', ''];

const cased = (text: string, style: Style) => {
  if (style === 'upper') return text.toUpperCase();
  const lower = text.toLowerCase();
  return style === 'lower' ? lower : lower.replace(/(^|[\s'’‘ʼ`´\-–—‐−⁃])(\P{M})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
};

/** One name part as a letter writes it (a choice of index picks positions, so the run stays reproducible). */
function writePart(value: string, style: Style, variant: Variant, pick: number): string {
  const codePoints = [...value];
  switch (variant) {
    case 'marks':
      // Marks dropped from an accented part, or an acute added on a plain one.
      return cased(/[^\p{ASCII}]/u.test(value) && value !== DESERET ? value.normalize('NFD').replace(/\p{M}/gu, '') : value.replace(/([AEIOU])/, '$1́'), style);
    case 'sharp':
      return cased(value, style).replace(/ss/giu, 'ß');
    case 'typographic':
      return cased(value, style)
        .replace(/'/g, APOSTROPHES[pick % APOSTROPHES.length] ?? '')
        .replace(/-/g, DASHES[pick % DASHES.length] ?? '');
    case 'spaced': {
      if (style === 'lower' || codePoints.length < 4 || /[^\p{L}]/u.test(value)) return cased(value, style);
      const at = 2 + (pick % (codePoints.length - 3));
      return `${cased(codePoints.slice(0, at).join(''), style)} ${cased(codePoints.slice(at).join(''), style)}`;
    }
    case 'invisible': {
      const written = [...cased(value, style)];
      const at = 1 + (pick % Math.max(1, written.length - 1));
      return [...written.slice(0, at), INVISIBLES[pick % INVISIBLES.length] ?? '', ...written.slice(at)].join('');
    }
    case 'plain':
      return cased(value, style);
  }
}

const NUMBER_JOINERS = [' ', '-', '–', '−', '\u200B', '\u00AD', '\u2060'];
const NEAR_LETTER_JOINERS = ['_', '.', '/', ':'];
const DATE_DASHES = ['-', '–', '−', '‐'];

/**
 * A member ID or claim number as a letter writes it: its case, and up to two joiners (a period, underscore,
 * slash or colon only next to a letter), digits alone too. Dated, six or eight digits are cut where a date's
 * numbers end (2027-03-15, 03–15–2027, 03-15-61), with one dash.
 */
function writeNumber(value: string, lower: boolean, picks: readonly number[], dated = false): string {
  const characters = [...(lower ? value.toLowerCase() : value)];
  if (characters.length < 2) return characters.join('');
  if (dated && /^(\d{6}|\d{8})$/.test(value)) {
    const dash = DATE_DASHES[(picks[0] ?? 0) % DATE_DASHES.length] ?? '-';
    const at = value.length === 8 && (picks[1] ?? 0) % 2 === 0 ? [4, 6] : [2, 4];
    return characters.map((character, i) => `${at.includes(i) ? dash : ''}${character}`).join('');
  }
  const cuts = new Map<number, string>();
  for (const pick of picks) {
    const at = 1 + (pick % (characters.length - 1));
    const nearLetter = /\p{L}/u.test(characters[at - 1] ?? '') || /\p{L}/u.test(characters[at] ?? '');
    const choices = nearLetter ? [...NUMBER_JOINERS, ...NEAR_LETTER_JOINERS] : NUMBER_JOINERS;
    cuts.set(at, choices[pick % choices.length] ?? ' ');
  }
  return characters.map((character, i) => `${cuts.get(i) ?? ''}${character}`).join('');
}

interface Segment {
  readonly text: string;
  /** Kept text, or what the generator wrote into it. */
  readonly secret: 'none' | 'name' | 'member' | 'birth' | 'claim';
  /** For a claim, its number in the call (1 for [CLAIM_1]). */
  readonly claim?: number;
}

interface Case {
  readonly patient: PatientIdentifiers;
  readonly claims: readonly LetterClaim[];
  readonly segments: readonly Segment[];
}

const FILLER = ['The claim was denied because prior authorization was not obtained. ', 'Our reference number is REF-SYN-77. ', 'To appeal, submit a written request by May 30, 2026. ', 'We paid $150.00 of the billed amount. ', 'Records in a timely manner. '];

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The calendar dates written text is, read here on its own and not by the code under test: three numbers
 * with a slash, a period or a dash between each two (year first, or month and day in either order before
 * the year), or a month word with a day and a year. Numbers with spaces alone, compact digits, an invisible
 * character and a date no calendar holds read as none.
 */
function separatedDateReadings(written: string): string[] {
  const valid = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
  };
  const yearsOf = (text: string) => (text.length === 2 ? [1900 + Number.parseInt(text, 10), 2000 + Number.parseInt(text, 10)] : text.length === 4 ? [Number.parseInt(text, 10)] : []);
  const read = (orders: readonly (readonly [string, string, string])[]) => [...new Set(orders.flatMap(([year, month, day]) => yearsOf(year).map((y) => valid(y, Number.parseInt(month, 10), Number.parseInt(day, 10)))).filter((date): date is string => date !== null))];
  const word = (written.match(/[a-z]{3,}/gi) ?? []).find((each) => MONTH_NAMES.includes(each.slice(0, 3).toLowerCase()));
  const numbers = written.match(/\d+/g) ?? [];
  if (/[a-z]/i.test(written)) {
    const month = MONTH_NAMES.indexOf(word?.slice(0, 3).toLowerCase() ?? '') + 1;
    const [day = '', year = ''] = numbers;
    return month === 0 || numbers.length !== 2 || day.length > 2 ? [] : read([[year, String(month), day]]);
  }
  const parts = written.trim().split(/\s*[/.\p{Pd}\u2212\u2043]\s*/u);
  if (parts.length !== 3 || !parts.every((part) => /^\d{1,4}$/.test(part))) return [];
  const [a = '', b = '', c = ''] = parts;
  return a.length === 4 ? read([[a, b, c]]) : read([[c, a, b], [c, b, a]]);
}

const nameShape = fc.record({ first: part, middle, last: part, lastFirst: fc.boolean() });
/** A date's digits as a number: year first or last, compact (20270315, 03152027, 031527). */
const datedNumber = fc.tuple(fc.date({ min: new Date('1990-01-01T00:00:00Z'), max: new Date('2035-12-31T00:00:00Z'), noInvalidDate: true }), fc.nat(2)).map(([date, form]) => {
  const [year = '', month = '', day = ''] = date.toISOString().slice(0, 10).split('-');
  return [`${year}${month}${day}`, `${month}${day}${year}`, `${month}${day}${year.slice(2)}`][form] ?? `${year}${month}${day}`;
});
const number = fc.oneof(fc.stringMatching(/^(ZZ|SYN|YY)[0-9]{5,8}$/), fc.stringMatching(/^[0-9]{6,9}$/), datedNumber);
const writing = fc.record({ style: fc.constantFrom<Style>('upper', 'title', 'lower'), variant: fc.constantFrom<Variant>('plain', 'marks', 'sharp', 'typographic', 'spaced', 'invisible'), pick: fc.nat(1000) });
const slot = fc.record({
  kind: fc.constantFrom('name', 'name', 'name', 'member', 'claim', 'claim', 'birth', 'filler'),
  shape: fc.constantFrom('full', 'lastFirst', 'first', 'last', 'initialLast', 'lastInitial'),
  writing,
  picks: fc.array(fc.nat(1000), { maxLength: 2 }),
  lower: fc.boolean(),
  dated: fc.boolean(),
  index: fc.nat(1000),
});

const letterCase: fc.Arbitrary<Case> = fc
  .record({
    name: nameShape,
    memberIds: fc.array(number, { minLength: 1, maxLength: 2 }),
    claimNumbers: fc.array(number, { minLength: 1, maxLength: 3 }),
    // Numbers equal to a name part, and claims equal to each other.
    memberIsPart: fc.boolean(),
    claimIsPart: fc.boolean(),
    claimsShare: fc.boolean(),
    birth: fc.date({ min: new Date('1930-01-01T00:00:00Z'), max: new Date('2010-12-31T00:00:00Z'), noInvalidDate: true }),
    slots: fc.array(slot, { minLength: 1, maxLength: 9 }),
  })
  .map(({ name, memberIds, claimNumbers, memberIsPart, claimIsPart, claimsShare, birth, slots }): Case => {
    const parts = [name.first, ...(name.middle === undefined ? [] : [name.middle]), name.last];
    const record = name.lastFirst ? `${name.last}, ${[name.first, ...(name.middle === undefined ? [] : [name.middle])].join(' ')}` : parts.join(' ');
    const partCompact = compactIdentifier(name.last);
    const members = memberIsPart ? [partCompact, ...memberIds.slice(1)] : memberIds;
    const numbers = claimNumbers.map((value, i) => (i === 0 && claimIsPart ? partCompact : i === 1 && claimsShare ? (claimNumbers[0] ?? value) : value));
    const dob = birth.toISOString().slice(0, 10);
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: [record], datesOfBirth: [dob], memberIds: members };
    const claims: LetterClaim[] = numbers.map((value, i) => ({ claimId: `synthetic-claim-${String(i + 1)}`, patientPseudonym: 'synthetic-patient-13', claimNumbers: [value] }));
    const segments: Segment[] = [];
    const kept = (text: string) => segments.push({ text, secret: 'none' });
    // A digits-only number written as a calendar date with its dashes, and not the date of birth, may stay (a deadline is read so).
    const numberSegment = (value: string, secret: 'member' | 'claim', written: string, claim?: number): Segment => {
      const readings = separatedDateReadings(written);
      const keptAsDate = /^\d+$/.test(value) && readings.length > 0 && !readings.includes(dob);
      return { text: written, secret: keptAsDate ? 'none' : secret, ...(claim === undefined ? {} : { claim }) };
    };
    for (const { kind, shape, writing: w, picks, lower, dated, index } of slots) {
      if (kind === 'name') {
        const write = (value: string) => writePart(value, w.style, w.variant, w.pick);
        const initial = (value: string) => cased([...value][0] ?? '', w.style === 'lower' ? 'lower' : 'upper');
        const middleText = name.middle === undefined ? '' : ` ${name.middle.length === 1 ? `${cased(name.middle, w.style === 'lower' ? 'lower' : 'upper')}.` : write(name.middle)}`;
        const written = {
          full: `${write(name.first)}${middleText} ${write(name.last)}`,
          lastFirst: `${write(name.last)}, ${write(name.first)}${middleText}`,
          first: write(name.first),
          last: write(name.last),
          initialLast: `${initial(name.first)}.${index % 2 === 0 ? ' ' : ''}${write(name.last)}`,
          lastInitial: `${write(name.last)}, ${initial(name.first)}.`,
        }[shape];
        kept(['Dear ', 'RE: Patient ', 'for ', 'Patient: ', '😀'][index % 5] ?? '');
        segments.push({ text: written, secret: 'name' });
        kept([', ', '.\n', ' was seen. ', '😀 '][index % 4] ?? '');
      } else if (kind === 'member') {
        kept(['Member ID ', 'member ', 'ID:', 'Member\u200B'][index % 4] ?? '');
        const value = members[index % members.length] ?? '';
        segments.push(numberSegment(value, 'member', writeNumber(value, lower, picks, dated)));
        kept([';\n', ' on file. '][index % 2] ?? '');
      } else if (kind === 'claim') {
        const claim = index % numbers.length;
        kept(['Claim ', 'claim number ', 'Claim#'][index % 3] ?? '');
        const value = numbers[claim] ?? '';
        segments.push(numberSegment(value, 'claim', writeNumber(value, lower, picks, dated), claim + 1));
        kept(['; ', ' was denied. '][index % 2] ?? '');
      } else if (kind === 'birth') {
        const forms = dateForms(dob);
        const date = [...(forms[index % forms.length] ?? dob)];
        const at = 1 + (w.pick % (date.length - 1));
        const text = w.variant === 'invisible' ? [...date.slice(0, at), INVISIBLES[w.pick % INVISIBLES.length] ?? '', ...date.slice(at)].join('') : date.join('');
        kept(['DOB ', 'Date of birth: ', 'born ', 'birth date ', 'seen on '][index % 5] ?? '');
        segments.push({ text, secret: 'birth' });
        kept(['. ', ', '][index % 2] ?? '');
      } else {
        kept(FILLER[index % FILLER.length] ?? '');
      }
    }
    return { patient, claims, segments: segments.map((segment) => ({ ...segment, text: segment.text.normalize('NFKC') })) };
  });

/** The letter, and each written letter or digit of a secret segment by its position. */
function assemble(segments: readonly Segment[]): { readonly text: string; readonly secrets: readonly { readonly at: number; readonly secret: Segment['secret']; readonly claim: number }[] } {
  let text = '';
  const secrets: { at: number; secret: Segment['secret']; claim: number }[] = [];
  for (const segment of segments) {
    if (segment.secret !== 'none') {
      for (const match of segment.text.matchAll(/[\p{L}\p{N}]/gu)) {
        secrets.push({ at: text.length + match.index, secret: segment.secret, claim: segment.claim ?? 0 });
      }
    }
    text += segment.text;
  }
  return { text, secrets };
}

const EXACT = /^\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|CLAIM_[1-9]\d*)\]$/;

// ---------------------------------------------------------------------------------------------------
// Today's redaction, frozen as an oracle (packages/model-gateway/src/redact.ts at 085299b), with each replaced
// position tracked back to the NFKC letter

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEGACY_BIRTH_LABEL = /(?:\bD\.?\s?O\.?\s?B\b\.?|\bdate\s+of\s+birth\b|\bbirth\s*date\b|\bborn(?:\s+on)?\b|\bbirthday\b)\s*[:#-]?\s*(?:is\s+)?$/iu;

function legacyBirth(text: string, span: { readonly start: number; readonly dates: readonly string[] }, datesOfBirth: readonly string[]): boolean {
  return span.dates.some((date) => datesOfBirth.includes(date)) || LEGACY_BIRTH_LABEL.test(text.slice(Math.max(0, span.start - 40), span.start));
}

function legacyPattern(form: string, placeholder: string): RegExp | null {
  if (placeholder === '[PATIENT_NAME]') {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(form).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
  }
  const characters = [...form.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')];
  return characters.length < 2 ? null : new RegExp(`(?<![\\p{L}\\p{N}])${characters.map(escapeRegExp).join('[\\s\\-‐-―]*')}(?![\\p{L}\\p{N}])`, 'giu');
}

/** The NFKC positions today's redactLetter replaces (its own placeholders' text, which it may rewrite, aside). */
function legacyReplaced(letter: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Set<number> {
  const normal = letter.normalize('NFKC');
  let units = [...Array(normal.length).keys()].map((at) => ({ unit: normal[at] ?? '', at }));
  const replaced = new Set<number>();
  const current = () => units.map((entry) => entry.unit).join('');
  const replace = (start: number, end: number, placeholder: string) => {
    for (const entry of units.slice(start, end)) {
      if (entry.at >= 0) replaced.add(entry.at);
    }
    units = [...units.slice(0, start), ...[...placeholder].map((unit) => ({ unit, at: -1 })), ...units.slice(end)];
  };
  for (const span of datesIn(normal).filter((span) => legacyBirth(normal, span, patient.datesOfBirth)).reverse()) {
    replace(span.start, span.end, '[DATE_OF_BIRTH]');
  }
  const forms = [
    ...claims.flatMap((claim, index) => claim.claimNumbers.map((form) => ({ form: form.normalize('NFKC').trim(), placeholder: `[CLAIM_${String(index + 1)}]` }))),
    ...patient.memberIds.map((form) => ({ form: form.normalize('NFKC').trim(), placeholder: '[MEMBER_ID]' })),
    ...identifierForms(patient.names).map((form) => ({ form, placeholder: '[PATIENT_NAME]' })),
  ]
    .filter((entry) => entry.form !== '')
    .sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
  for (const { form, placeholder } of forms) {
    const pattern = legacyPattern(form, placeholder);
    if (pattern !== null) {
      for (const match of [...current().matchAll(pattern)].reverse()) {
        replace(match.index, match.index + match[0].length, placeholder);
      }
    }
  }
  return replaced;
}

/**
 * Positions today's code replaced that the change keeps on purpose: inside a date that is not a date of
 * birth and that this test reads as a calendar date with its separators (separatedDateReadings, not the
 * code's own readings), and a claim's digits written as an amount, after a currency sign and with cents
 * (never a member ID's).
 */
function keptOnPurpose(normal: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): (at: number) => boolean {
  const dates = datesIn(normal).filter((span) => !legacyBirth(normal, span, patient.datesOfBirth) && separatedDateReadings(normal.slice(span.start, span.end)).length > 0);
  const claimDigits = new Set(claims.flatMap((claim) => claim.claimNumbers.map(compactIdentifier)));
  const memberDigits = new Set(patient.memberIds.map(compactIdentifier));
  const amounts = [...normal.matchAll(/\p{Sc}\s*(\d+)[.,]\d{2}(?!\d)/gu)]
    .filter((match) => claimDigits.has(match[1] ?? '') && !memberDigits.has(match[1] ?? ''))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
  return (at) => [...dates, ...amounts].some((span) => span.start <= at && at < span.end);
}

// ---------------------------------------------------------------------------------------------------
// MOD-13

describe('MOD-13: every placeholder survives and no identifier survives', () => {
  it('sends no letter or digit the generator wrote an identifier with, keeps every claim’s placeholder, and writes only exact placeholders (property)', () => {
    fc.assert(
      fc.property(letterCase, ({ patient, claims, segments }) => {
        const { text, secrets } = assemble(segments);
        expect(text.normalize('NFKC')).toBe(text);
        const { text: normal, spans } = redactionSpans(text, patient, claims);
        expect(normal).toBe(text);
        const redacted = redactLetter(text, patient, claims);
        // The output is the letter with each span replaced, and nothing else changed.
        let rebuilt = '';
        let kept = 0;
        for (const span of spans) {
          expect(span.start).toBeGreaterThanOrEqual(kept);
          rebuilt += text.slice(kept, span.start) + span.placeholder;
          kept = span.end;
        }
        expect(redacted.text).toBe(rebuilt + text.slice(kept));
        const spanAt = (at: number) => spans.find((span) => span.start <= at && at < span.end);
        for (const secret of secrets) {
          const span = spanAt(secret.at);
          expect(span, `${secret.secret} at ${String(secret.at)} in ${JSON.stringify(text)} -> ${JSON.stringify(redacted.text)}`).toBeDefined();
          if (secret.secret === 'claim') {
            // The claim's placeholder, of this claim or of a lower one its number also is.
            expect(Number.parseInt(/^\[CLAIM_(\d+)\]$/.exec(span?.placeholder ?? '')?.[1] ?? 'none', 10), JSON.stringify(text)).toBeLessThanOrEqual(secret.claim);
          }
        }
        // Every placeholder is exact (the letters hold no bracket of their own) and counted.
        const brackets = redacted.text.match(/\[[^[\]]*\]/g) ?? [];
        expect(brackets.every((bracket) => EXACT.test(bracket))).toBe(true);
        expect(brackets).toHaveLength(redacted.replaced);
        expect(holdsIdentifier(redacted.text, patient, claims)).toBe(false);
      }),
      { numRuns: 400 },
    );
  }, 60_000);

  it('still replaces every letter or digit today’s code replaced, but in a date that is not a date of birth or an amount (property and the design’s section 1 rows)', () => {
    const check = (text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]) => {
      const { text: normal, spans } = redactionSpans(text, patient, claims);
      const kept = keptOnPurpose(normal, patient, claims);
      const missed = [...legacyReplaced(text, patient, claims)].filter((at) => /[\p{L}\p{N}]/u.test(normal[at] ?? '') && !kept(at) && !spans.some((span) => span.start <= at && at < span.end));
      expect(missed, `${JSON.stringify(text)} -> ${JSON.stringify(redactLetter(text, patient, claims).text)}`).toEqual([]);
    };
    const patient = (names: string[]): PatientIdentifiers => ({ pseudonym: 'synthetic-patient-13', names, datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] });
    const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['SYN555001'] }];
    for (const [names, text] of [
      [['CLAIM DATE'], 'Claim SYN555001 for Date, DOB 03/03/1961'],
      [['NAME ID'], 'member ZZ1234567'],
      [['JOSE GARCIA'], 'Dear José García'],
      [["MARY O'BRIEN"], "Ms. O’Brien, Ms. O'Brien"],
      [['ANA SMITH-JONES'], 'Ms. Jones, Smith–Jones, Smith-Jones, Smith Jones'],
      [['JANE VANTREE'], 'Van\u00ADtree, Dear\u200BJane\u200BVantree, Member\u200BZZ1234567, DOB 03/03/1961\u200B2'],
      [['JOANN VANTREE'], 'Jo Ann Vantree'],
      [['STRAUSS'], 'Strauß'],
      [['JANE Q VANTREE'], 'Jane Q. Vantree, J. Vantree'],
      [['JANE VANTREE'], 'ZZ_1234567, SYN.555001, ZZ\u200B1234567, ZZ 1234567, zz-1234567'],
      [['JUNE VANTREE'], 'Dear June, due June 30, 2027; DOB June 3, 1961'],
    ] as const) {
      check(text, patient([...names]), claims);
    }
    fc.assert(
      fc.property(letterCase, ({ patient: who, claims: theirs, segments }) => {
        check(assemble(segments).text, who, theirs);
      }),
      { numRuns: 200 },
    );
  }, 60_000);

  it('sends text that holds none of the patient’s forms unchanged: common phrases, amounts, deadlines and references (property)', () => {
    const PHRASES = ['Records in a timely manner. ', 'This is a request for records. ', 'Resubmit it as a new claim. ', 'It was sent to be reviewed. ', "I'd a question. ", 'We paid $150.00 of the billed amount. ', 'Appeal by 2027-03-15. ', 'Your appeal is due June 30, 2027. ', 'Respond by August 1, 2027. ', 'Our reference is REF-SYN-77. ', 'Dear Provider, I am writing about a claim. ', 'A claim was reviewed. '];
    const names = fc.constantFrom('INA VANTREE', 'ISA ZEPHYRA', 'ASA VANTREE', 'TOBE ZEPHYRA', 'IDA VANTREE', 'JUNE ZEPHYRA', 'AUGUST VANTREE', 'IVY ZEPHYRA', 'ANA VANTREE');
    fc.assert(
      fc.property(names, fc.array(fc.constantFrom(...PHRASES), { minLength: 1, maxLength: 8 }), fc.constantFrom('15000', '20270315', 'SYN555001'), (name, phrases, claimNumber) => {
        const text = phrases.join('');
        const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: [name], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
        const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: [claimNumber] }];
        expect(redactLetter(text, patient, claims)).toMatchObject({ text, replaced: 0 });
        expect(holdsIdentifier(text, patient, claims)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------
// MOD-14

const PLACEHOLDERS = fc.oneof(fc.constantFrom('[PATIENT_NAME]', '[DATE_OF_BIRTH]', '[MEMBER_ID]'), fc.integer({ min: 1, max: 20 }).map((n) => `[CLAIM_${String(n)}]`));

describe('MOD-14: the one-patient screen sees every written form of another patient’s identifier, never a placeholder', () => {
  it('offers another patient’s ID however a letter writes it, in a redacted letter too (property)', () => {
    // With a letter prefix or digits alone; a digits-only ID is spaced, dashed or holds an invisible character, never a "/" or "." (a date's or an amount's writing).
    const otherId = fc.tuple(fc.constantFrom('ZZ', 'YY', 'QQ', 'SYN', ''), fc.stringMatching(/^[0-9]{5,8}$/));
    const context = fc.record({ before: fc.constantFrom('ID:', 'Member ID ', '[', '(', 'also ', '[CLAIM_1] ', 'REF\u200B', 'patient\u3164'), after: fc.constantFrom(']', ')', '.', ' [MEMBER_ID]', '', ';') });
    fc.assert(
      fc.property(otherId, fc.array(fc.nat(1000), { maxLength: 2 }), fc.boolean(), context, ([prefix, digits], picks, lower, { before, after }) => {
        const id = `${prefix}${digits}`;
        const written = writeNumber(id, lower, picks);
        const text = `SYNTHETIC: ${before}${written}${after} for Jane Zephyra, DOB 03/14/1980, member SYNMEMBER0042.`;
        expect(identifierCandidates(text), written).toContain(compactIdentifier(id));
        const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-14', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
        const redacted = redactLetter(text, patient, [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-14', claimNumbers: ['SYNCLAIM0001'] }]).text;
        expect(identifierCandidates(redacted), redacted).toContain(compactIdentifier(id));
      }),
      { numRuns: 300 },
    );
  });

  it('never offers a placeholder or a part of one, however placeholders are joined (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(PLACEHOLDERS, fc.constantFrom('', ' ', '_', '.', '-', '\u200B', '\n')), { minLength: 1, maxLength: 8 }), (pieces) => {
        expect(identifierCandidates(pieces.map(([placeholder, joiner]) => `${placeholder}${joiner}`).join(''))).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });
});
