import { identifierForms } from '@tp/packets';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EARLIEST_WRITTEN_YEAR, LATEST_WRITTEN_YEAR, type LetterClaim, type PatientIdentifiers, compactIdentifier, dateForms, datesIn, holdsIdentifier, identifierCandidates, redactLetter, redactionSpans } from './redact';

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

/**
 * What a letter may write inside a number (redact.ts NUMBER_JOINERS): since review finding R5-1, grouping apostrophes, "~", middle
 * dots, bullets, ";", double quotes, U+02D7 and U+2796 too, and since review finding G4 the primes (U+2032, U+2033, U+2035) and the
 * modifier-letter prime and acute (U+02B9, U+02CA).
 */
const NUMBER_JOINERS = [' ', '-', '–', '−', '_', '|', '\\', '\u200B', '\u00AD', '\u2060', "'", '’', '‘', 'ʼ', '`', '~', '～', '·', '‧', '∙', '⋅', '・', '•', ';', '"', '“', '”', '˗', '➖', '\u2032', '\u2033', '\u2035', '\u02B9', '\u02CA'];
const NEAR_LETTER_JOINERS = ['_', '.', '/', ':'];
const DATE_DASHES = ['-', '–', '−', '‐'];

/**
 * A member ID or claim number as a letter writes it: its case, and up to two joiners (a period, slash or
 * colon only next to a letter; an underscore, a bar, a backslash, an apostrophe, "~", a middle dot, a bullet, ";"
 * or a double quote anywhere), digits alone too. Dated, six or eight digits are cut where a date's
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
 * with a slash, a backslash, a period, a dash, an underscore or a bar between each two (year first, or month and day in either order before
 * the year), or a month word with a day and a year. Numbers with spaces alone, compact digits, an invisible
 * character, a date no calendar holds and a four-digit year outside 1900 to 2099 read as none.
 */
function separatedDateReadings(written: string): string[] {
  const valid = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
  };
  // A four-digit year from 1900 to 2099 only, what a written date's year can be (a claim number written 0023-04-26 is no date).
  const yearsOf = (text: string) => (text.length === 2 ? [1900 + Number.parseInt(text, 10), 2000 + Number.parseInt(text, 10)] : text.length === 4 && Number.parseInt(text, 10) >= 1900 && Number.parseInt(text, 10) <= 2099 ? [Number.parseInt(text, 10)] : []);
  const read = (orders: readonly (readonly [string, string, string])[]) => [...new Set(orders.flatMap(([year, month, day]) => yearsOf(year).map((y) => valid(y, Number.parseInt(month, 10), Number.parseInt(day, 10)))).filter((date): date is string => date !== null))];
  const word = (written.match(/[a-z]{3,}/gi) ?? []).find((each) => MONTH_NAMES.includes(each.slice(0, 3).toLowerCase()));
  const numbers = written.match(/\d+/g) ?? [];
  if (/[a-z]/i.test(written)) {
    const month = MONTH_NAMES.indexOf(word?.slice(0, 3).toLowerCase() ?? '') + 1;
    const [day = '', year = ''] = numbers;
    return month === 0 || numbers.length !== 2 || day.length > 2 ? [] : read([[year, String(month), day]]);
  }
  const parts = written.trim().split(/\s*[/\\.\p{Pd}\u2212\u2043_|]\s*/u);
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
    // A digits-only number written as a calendar date with its separators, not the date of birth and with no identifier
    // label before it, may stay (a deadline is read so); after a label ("Claim", "ID:") it is the number (review finding R5-2).
    const numberSegment = (value: string, secret: 'member' | 'claim', written: string, labeled: boolean, claim?: number): Segment => {
      const readings = separatedDateReadings(written);
      const keptAsDate = !labeled && /^\d+$/.test(value) && readings.length > 0 && !readings.includes(dob);
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
        // Each prefix with whether it is an identifier label of a member ID (the generator's own record, not the code's IDENTIFIER_LABEL):
        // a claim's label or a bare "ID" is none for a whole written date (review finding G2).
        const [prefix, labeled] = ([['Member ID ', true], ['member ', true], ['ID:', true], ['Member\u200B', true], ['seen on ', false], ['Subscriber # ', true], ['**Member:** ', true], ['Claim# ', false], ['ID ', false]] as const)[index % 9] ?? ['', false];
        kept(prefix);
        const value = members[index % members.length] ?? '';
        segments.push(numberSegment(value, 'member', writeNumber(value, lower, picks, dated), labeled));
        kept([';\n', ' on file. '][index % 2] ?? '');
      } else if (kind === 'claim') {
        const claim = index % numbers.length;
        // Since review findings G2 and G3: a label's end may hold "*", one ",", "(" or an opening quote; a member's label, a bare
        // "number" or "No" without its period is none for a claim's whole written date.
        const [prefix, labeled] = (
          [['Claim ', true], ['claim number ', true], ['Claim#', true], ['ICN: ', true], ['Claim No. ', true], ['appeal by ', false], ['ICN (', true], ['**Claim:** ', true], ['Claim, ', true], ['Re: ', true], ['Claim: \u201C', true], ['No. ', true], ['The number ', false], ['No ', false], ['Member: ', false]] as const
        )[index % 15] ?? ['', false];
        kept(prefix);
        const value = numbers[claim] ?? '';
        segments.push(numberSegment(value, 'claim', writeNumber(value, lower, picks, dated), labeled, claim + 1));
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

/**
 * MOD-13's first property: no letter or digit the generator wrote an identifier with is sent, every claim keeps its
 * placeholder, and only exact placeholders are written.
 */
const sendsNoIdentifier = fc.property(letterCase, ({ patient, claims, segments }) => {
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
});

/**
 * The seed on which a claim number written like a date with a year below 1900 ("0000-01-01", "0023-04-26") was kept as
 * a date (MOD-13, 2026-11-01). The generator has changed since (review findings F4-1, R5-1, R5-2), so this seed no longer
 * draws that letter: it now pins only one more fixed run of the property. The original counterexample is pinned on its
 * own below ("0000-01-01", "0023-04-26", with and without a label), whatever the generator draws.
 */
const YEAR_BELOW_1900_SEED = 1162287068;

/**
 * The seed on which a member ID written as a date after a bare "ID:" was sent (MOD-13, 2026-11-04): a name part "CLAIM"
 * ended the sentence before it ("Patient: AA CLAIM.\nID:1990-01-01"), and the label was read as one claim's label over
 * the full stop and the line break, which a member ID written as a date does not count after (G2). It pins one more fixed
 * run of the property, which draws that letter on this generator; the counterexample and its class (every head word
 * ending a sentence, before a bare label of the other kind) are pinned on their own below, whatever the generator draws.
 */
const LABEL_BOUNDARY_SEED = 460548619;

describe('MOD-13: every placeholder survives and no identifier survives', () => {
  it('sends no letter or digit the generator wrote an identifier with, keeps every claim’s placeholder, and writes only exact placeholders (property)', () => {
    fc.assert(sendsNoIdentifier, { numRuns: 400 });
  }, 60_000);

  it(`holds on seed ${String(YEAR_BELOW_1900_SEED)}, where a claim number written like a date with a year below 1900 was first found (a fixed run of the property)`, () => {
    fc.assert(sendsNoIdentifier, { numRuns: 400, seed: YEAR_BELOW_1900_SEED });
  }, 60_000);

  it(`holds on seed ${String(LABEL_BOUNDARY_SEED)}, where a member ID written as a date after a sentence ending in "CLAIM" and a bare "ID:" was sent (a fixed run of the property)`, () => {
    fc.assert(sendsNoIdentifier, { numRuns: 400, seed: LABEL_BOUNDARY_SEED });
  }, 60_000);

  it(`ends a label's head at a sentence end, so a member ID after "CLAIM." and a bare "ID:" is replaced (seed ${String(LABEL_BOUNDARY_SEED)}'s counterexample)`, () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['AA CLAIM'], datesOfBirth: ['1955-07-14'], memberIds: ['19900101'] };
    const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['SYN00000'] }];
    for (const [written, expected] of [
      ['Patient: AA CLAIM.\nID:1990-01-01 on file. Dear AA CLAIM, ', 'Patient: [PATIENT_NAME].\nID:[MEMBER_ID] on file. Dear [PATIENT_NAME], '],
      ['Hi AA CLAIM. ID:1990-01-01 on file.', 'Hi [PATIENT_NAME]. ID:[MEMBER_ID] on file.'],
      // Already replaced before the fix: another name before the sentence end, and the bare label alone.
      ['Hi BB SMITH.\nID:1990-01-01', 'Hi BB SMITH.\nID:[MEMBER_ID]'],
      ['ID:1990-01-01', 'ID:[MEMBER_ID]'],
    ] as const) {
      const redacted = redactLetter(written, patient, claims).text;
      expect(redacted, written).toBe(expected);
      expect(holdsIdentifier(redacted, patient, claims), written).toBe(false);
      expect(identifierCandidates(written), written).toContain('19900101');
    }
  });

  it('reads the label a sentence or a line begins after any head word, for a member ID, a claim number and a patient control number written as a date (MOD-13, seed 460548619)', () => {
    const memberPatient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['19900101'] };
    const claimPatient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['ZZ7654321'] };
    const claimsOf = (value: string): LetterClaim[] => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: [value] }];
    // A claim's head word, then a member's: each ends a sentence or a line before a bare label of the other kind.
    const claimHeads = ['claim', 'CLAIM', 'ICN', 'pcn', 'dcn', 'tcn', 'control', 'Account', 'account', 'claim number', 'Claim ID'];
    const memberHeads = ['member', 'MEMBER', 'subscriber', 'Member ID'];
    // A line break of any kind, a blank line and an indented line too, and a label of more than one word on the next line
    // (review finding security-rlb-sec-1: "claim\nID No." was read only as the claim's joined label).
    const ends = ['. ', '.\n', '. \n', '.\r\n', '\n', '\r\n', '\u2028', '\u2029', '\v', '\n\n', '\n  '];
    const bareLabels = ['ID:', 'ID#', 'No.', 'No: ', 'Number is ', 'ID No. ', 'No. ID: ', 'ID NO. ', 'id no: ', 'ID nbr ', 'ID Number: '];
    const cases: [PatientIdentifiers, LetterClaim[], string, string, string][] = [];
    for (const head of claimHeads) {
      for (const end of ends) {
        for (const label of bareLabels) {
          for (const written of ['1990-01-01', '1990.01.01', '1990/01/01']) {
            cases.push([memberPatient, claimsOf('SYN00000'), `We reviewed the ${head}${end}${label}${written} on file.`, '[MEMBER_ID]', '19900101']);
          }
        }
      }
    }
    for (const head of memberHeads) {
      for (const end of ends) {
        for (const label of [...bareLabels, 'Control: ', 'Claim: ', 'ICN: ']) {
          // A claim number, and a patient control number (a claim's number to the letter), digits alone written as a date.
          for (const [value, written] of [['20260426', '2026-04-26'], ['04262026', '04.26.2026'], ['20260426', '2026/04/26']] as const) {
            cases.push([claimPatient, claimsOf(value), `We reviewed the ${head}${end}${label}${written} on file.`, '[CLAIM_1]', value]);
          }
        }
      }
    }
    for (const [patient, claims, written, placeholder, value] of cases) {
      const redacted = redactLetter(written, patient, claims).text;
      expect(redacted, JSON.stringify(written)).toContain(placeholder);
      expect(redacted, JSON.stringify(written)).not.toMatch(/\d{2}[-./]\d{2}/);
      expect(holdsIdentifier(redacted, patient, claims), JSON.stringify(written)).toBe(false);
      expect(identifierCandidates(written), JSON.stringify(written)).toContain(value);
    }
    // "!", "?", ";" and ":" never joined a head to the next label, and still do not.
    for (const end of ['!\n', '?\n', ';\n', ':\n', '! ', '? ']) {
      expect(redactLetter(`We reviewed the claim${end}ID:1990-01-01 on file.`, memberPatient, claimsOf('SYN00000')).text, end).toBe(`We reviewed the claim${end}ID:[MEMBER_ID] on file.`);
    }
  });

  it("keeps a label on one line within one sentence one label: an abbreviation's own full stop, a wrapped head, and G2 for each (MOD-13, seed 460548619)", () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['19900101'] };
    const claimsOf = (value: string): LetterClaim[] => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: [value] }];
    // One label of a claim: a claim number written as a date after it is the number.
    for (const label of ['Acct. No. ', 'Claim No. ', 'Ref. # ', 'Pt. Acct. # ', 'Acct.#', 'Claim No. ID: ', 'Claim\nNumber: ', 'Patient control no.: ']) {
      expect(redactLetter(`${label}2026-04-26`, patient, claimsOf('20260426')).text, label).toBe(`${label}[CLAIM_1]`);
    }
    // One label of a member: a member ID written as a date after it is the number, a claim number so written is not (G2).
    for (const label of ['Member ID No. ', 'Member ID: ', 'Subscriber No. ']) {
      expect(redactLetter(`${label}1990-01-01`, patient, claimsOf('SYN00000')).text, label).toBe(`${label}[MEMBER_ID]`);
      expect(redactLetter(`${label}2027-03-15`, { ...patient, memberIds: ['ZZ7654321'] }, claimsOf('20270315')).text, label).toBe(`${label}2027-03-15`);
    }
    // One claim's label on one line, abbreviated too, is none for a member ID written as a date (G2), as before.
    for (const label of ['Claim ID: ', 'Acct. ID: ', 'Acct. No. ', 'Claim# ']) {
      expect(redactLetter(`${label}1990-01-01`, patient, claimsOf('SYN00000')).text, label).toBe(`${label}1990-01-01`);
    }
    // An abbreviation's full stop at a line's end ends the head: the next line's label is its own.
    expect(redactLetter('Acct.\nID: 1990-01-01', patient, claimsOf('SYN00000')).text).toBe('Acct.\nID: [MEMBER_ID]');
  });

  it("reads a head word joined to its qualifier over the head's own full stop as one label, as before the fix, so a member ID or claim number written as a date after it is replaced (MOD-13, review finding correctness-rlb-oracle-1)", () => {
    const memberPatient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['19900101'] };
    const claimPatient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['ZZ7654321'] };
    const claimsOf = (value: string): LetterClaim[] => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: [value] }];
    const memberLabels = ['Member.ID', 'MEMBER.ID', 'Subscriber.ID', 'Member. ID', 'Member.No', 'Member.Number', 'Subscriber. No', 'Member No.\nID'];
    const claimLabels = ['Claim.No', 'Claim.ID', 'Claim.Nbr', 'Claim.Number', 'Claim. No', 'Claim. Number', 'ICN.No', 'Account.Number', 'Control.No', 'Claim No.\nNumber'];
    for (const [labels, patient, claims, value, placeholder] of [
      [memberLabels, memberPatient, claimsOf('SYN00000'), '19900101', '[MEMBER_ID]'],
      [claimLabels, claimPatient, claimsOf('20260426'), '20260426', '[CLAIM_1]'],
    ] as const) {
      for (const label of labels) {
        for (const colon of [' ', ': ']) {
          for (const written of [`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`, `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6)}`]) {
            const text = `Dear Jane Vantree, your ${label}${colon}${written} is on file.`;
            const redacted = redactLetter(text, patient, claims).text;
            expect(redacted, JSON.stringify(text)).toBe(`Dear [PATIENT_NAME] [PATIENT_NAME], your ${label}${colon}${placeholder} is on file.`);
            expect(holdsIdentifier(redacted, patient, claims), JSON.stringify(text)).toBe(false);
          }
        }
      }
    }
  });

  it('replaces nothing more after a sentence end that a head word ends: deadlines, dates of service and remittance, amounts, CPT codes and NPIs stay (MOD-13, seed 460548619)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: ['1955-07-14'], memberIds: ['ZZ7654321'] };
    const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['SYN12345678'] }];
    for (const head of ['claim', 'CLAIM', 'member', 'account', 'Acct.', 'Ref.', 'ICN', 'claim number']) {
      for (const end of ['. ', '.\n', '!\n', '?\n', ';\n', ':\n', '\n']) {
        const written = `We reviewed the ${head}${end}Appeal by 2027-03-15. ID: seen 2026-04-26, paid 2026-05-01. No. 97110 billed $150.00 (NPI 1234567893).`;
        expect(redactLetter(written, patient, claims).text, JSON.stringify(written)).toBe(written);
        expect(holdsIdentifier(written, patient, claims), JSON.stringify(written)).toBe(false);
      }
    }
    // A deadline equal to the claim's digits stays after a sentence a head word ends (no label of its kind before it, G2),
    // and the claim's own number stays the call's own placeholder after one.
    const dated: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['20270315'] }];
    expect(redactLetter('We reviewed the member.\nAppeal by 2027-03-15.', patient, dated).text).toBe('We reviewed the member.\nAppeal by 2027-03-15.');
    // A head word joins its qualifier over its own full stop ("Claim. ID" is a claim's label, as "Member.ID" is a member's),
    // so a deadline equal to the claim's digits after one is replaced: an over-redaction accepted, as before the fix, since
    // reading it apart would send a claim number or member ID so written (review finding correctness-rlb-oracle-1).
    expect(redactLetter('We reviewed the claim. ID 2027-03-15 is the deadline.', patient, dated).text).toBe('We reviewed the claim. ID [CLAIM_1] is the deadline.');
    expect(redactLetter('We reviewed the member.\nClaim No. 2027-03-15 was denied.', patient, dated).text).toBe('We reviewed the member.\nClaim No. [CLAIM_1] was denied.');
  });

  it('reads a written date only with a year from 1900 to 2099, so a claim number written like a date is its placeholder and real dates keep their behaviour', () => {
    expect(EARLIEST_WRITTEN_YEAR).toBe(1900);
    expect(LATEST_WRITTEN_YEAR).toBe(2099);
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: ['1955-07-14'], memberIds: ['ZZ1234567'] };
    const claims: LetterClaim[] = [
      { claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['00230426'] },
      { claimId: 'synthetic-claim-2', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['00010203'] },
      { claimId: 'synthetic-claim-3', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['21000426'] },
    ];
    for (const written of ['0023-04-26', '0023/04/26', '0023.04.26', '0001/02/03', '2100-04-26']) {
      expect(datesIn(written).flatMap((span) => span.dates), written).toEqual([]);
    }
    expect(redactLetter('Claim 0023-04-26 was denied.', patient, claims).text).toBe('Claim [CLAIM_1] was denied.');
    // Any dash (a claim's digits join over dashes, never over a slash or a period between digits: docs/adr/0054).
    expect(redactLetter('Claim 0023–04–26 and claim 0001-02-03; claim 2100\u221204\u221226.', patient, claims).text).toBe('Claim [CLAIM_1] and claim [CLAIM_2]; claim [CLAIM_3].');
    expect(holdsIdentifier('Claim 0023-04-26 was denied.', patient, claims)).toBe(true);
    // The seed's own counterexamples, unlabeled too, so the year bound alone (not the identifier label) replaces them.
    const seedClaims: LetterClaim[] = [
      { claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['00000101'] },
      { claimId: 'synthetic-claim-2', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['00230426'] },
    ];
    expect(datesIn('0000-01-01').flatMap((span) => span.dates)).toEqual([]);
    expect(redactLetter('Claim 0000-01-01 was denied.', patient, seedClaims).text).toBe('Claim [CLAIM_1] was denied.');
    expect(redactLetter('Seen 0000-01-01; seen 0023-04-26.', patient, seedClaims).text).toBe('Seen [CLAIM_1]; seen [CLAIM_2].');
    expect(holdsIdentifier('Seen 0000-01-01.', patient, seedClaims)).toBe(true);
    // A date of service, a deadline and a two-digit year still read as dates and stay.
    expect(datesIn('2026-04-26').flatMap((span) => span.dates)).toEqual(['2026-04-26']);
    expect(datesIn('04/26/26').flatMap((span) => span.dates)).toContain('2026-04-26');
    expect(redactLetter('Seen on 2026-04-26; appeal by April 26, 2027; billed 4/26/26.', patient, claims).text).toBe('Seen on 2026-04-26; appeal by April 26, 2027; billed 4/26/26.');
    // A 1950s date of birth is replaced in every form, labeled or not, as before.
    for (const written of [...dateForms('1955-07-14'), '07 14 1955', '19550714', '07141955', '071455']) {
      expect(redactLetter(`Seen ${written}.`, patient, claims).text, written).toBe('Seen [DATE_OF_BIRTH].');
    }
    expect(redactLetter('DOB 0023-04-26.', patient, []).text).toBe('DOB [DATE_OF_BIRTH].');
  });

  it('joins a digits-only number over an underscore, a bar or a backslash as over a dash, and keeps it only as the date its own written form is (review findings F4-1, F4-2)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: ['1955-07-14'], memberIds: ['00230426'] };
    const claimsOf = (...numbers: string[]): LetterClaim[] => numbers.map((value, i) => ({ claimId: `synthetic-claim-${String(i + 1)}`, patientPseudonym: 'synthetic-patient-13', claimNumbers: [value] }));
    // F4-1: digits with "_", "|" or "\\" between them are the number, whether or not they look like a date.
    for (const [written, numbers] of [
      ['Claim 0023_04_26 denied', ['00230426']],
      ['Claim 0023|04|26 denied', ['00230426']],
      ['Claim 0023\\04\\26 denied', ['00230426']],
      ['Claim 1234_5678 denied', ['12345678']],
      ['Claim 1234|5678 denied', ['12345678']],
      ['Claim 1234\\5678 denied', ['12345678']],
    ] as const) {
      expect(redactLetter(written, patient, claimsOf(...numbers)).text, written).toBe('Claim [CLAIM_1] denied');
      expect(holdsIdentifier(written, patient, claimsOf(...numbers)), written).toBe(true);
    }
    for (const written of ['Member 0023_04_26 on file', 'Member 0023|04|26 on file', 'Member 0023\\04\\26 on file', 'Member 0023-04-26 on file']) {
      expect(redactLetter(written, patient, []).text, written).toBe('Member [MEMBER_ID] on file');
    }
    // A real date written with those separators is still a date (a claim number that is itself one, the recorded residual).
    expect(redactLetter('Seen 2026_01_31, 2026|01|31 and 2026\\01\\31.', patient, claimsOf('20260131')).text).toBe('Seen 2026_01_31, 2026|01|31 and 2026\\01\\31.');
    expect(redactLetter('Born 1955_07_14 and 14|07|1955.', patient, []).text).toBe('Born [DATE_OF_BIRTH] and [DATE_OF_BIRTH].');
    // F4-2: a short claim inside a date read with a month word or across an invisible character is not that date.
    expect(redactLetter('Claim Jan 31-2026 denied', patient, claimsOf('312026')).text).toBe('Claim Jan [CLAIM_1] denied');
    expect(redactLetter('Claim Jan-31-2026', patient, claimsOf('312026')).text).toBe('Claim Jan-[CLAIM_1]');
    expect(holdsIdentifier('Claim Jan 31-2026 denied', patient, claimsOf('312026'))).toBe(true);
    expect(holdsIdentifier('Claim 1999-1\u200B2-31', patient, claimsOf('19991'))).toBe(true);
    expect(redactLetter('Claim 1999-1\u200B2-31', patient, claimsOf('19991')).text).not.toContain('1999');
    // The whole date written across the invisible character is still that date.
    expect(redactLetter('Seen 1999-1\u200B2-31.', patient, claimsOf('19991231')).text).toBe('Seen 1999-1\u200B2-31.');
  });

  it('joins a number over grouping apostrophes, "~", middle dots, bullets, ";", double quotes, U+02D7 and U+2796 (review finding R5-1)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: ['1955-07-14'], memberIds: ['ZZ7654321'] };
    const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['12345678'] }];
    for (const written of ["12'345'678", '12’345’678', '12‘345‘678', '12ʼ345ʼ678', '12`345`678', '1234~5678', '1234～5678', '1234·5678', '1234‧5678', '1234∙5678', '1234⋅5678', '1234・5678', '1234•5678', '1234;5678', '1234"5678', '1234“5678', '1234˗5678', '1234➖5678', '1234\u20325678', '1234\u20335678', '1234\u2032 5678', '1234\u20355678', '1234\u02B95678', '1234\u02CA5678', "12\u2032345\u2032678"]) {
      const text = `Claim ${written} denied`;
      expect(redactLetter(text, patient, claims).text, written).toBe('Claim [CLAIM_1] denied');
      expect(holdsIdentifier(text, patient, claims), written).toBe(true);
      expect(identifierCandidates(text), written).toContain('12345678');
    }
    for (const written of ['ZZ~7654321', "ZZ'7654321", 'ZZ’7654321', 'ZZ·7654321', 'ZZ•7654321', 'ZZ;7654321', 'ZZ\u20327654321', 'ZZ\u02B97654321']) {
      expect(redactLetter(`Member ${written} on file`, patient, []).text, written).toBe('Member [MEMBER_ID] on file');
      expect(identifierCandidates(`Member ${written} on file`), written).toContain('ZZ7654321');
    }
    // Still kept apart, as recorded (docs/adr/0054): a comma (an amount's grouping), a period or slash between digits with no label,
    // and the katakana prolonged sound mark (U+30FC), a letter inside Japanese words and names (review finding G4).
    expect(redactLetter('Seen 1234,5678 and 1234.5678 and 1234/5678.', patient, claims).text).toBe('Seen 1234,5678 and 1234.5678 and 1234/5678.');
    expect(redactLetter('Seen 1234\u30FC5678.', patient, claims).text).toBe('Seen 1234\u30FC5678.');
    // A name keeps matching with or without a modifier-letter prime in it, as with an apostrophe ("Ilʹich").
    expect(redactLetter('Dear Ilʹich Vantree and Ilich.', { ...patient, names: ['ILICH VANTREE'] }, []).text).toBe('Dear [PATIENT_NAME] and [PATIENT_NAME].');
  });

  it('replaces a claim number or member ID written as a calendar date when an identifier label introduces it, and keeps an unlabeled date (review finding R5-2)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['03141962'] };
    const claims: LetterClaim[] = [
      { claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['19550714'] },
      { claimId: 'synthetic-claim-2', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['031561'] },
      { claimId: 'synthetic-claim-3', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['20270315'] },
    ];
    for (const [written, expected] of [
      ['Claim 1955-07-14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955–07–14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955_07_14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955|07|14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955\\07\\14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955 - 07 - 14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955-\n07-14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955-07-1\u200B4 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955/07/14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 1955.07.14 denied', 'Claim [CLAIM_1] denied'],
      ['Claim 03-15-61', 'Claim [CLAIM_2]'],
      ['Claim # 1955-07-14', 'Claim # [CLAIM_1]'],
      ['Claim#1955-07-14', 'Claim#[CLAIM_1]'],
      ['Claim No. 1955-07-14', 'Claim No. [CLAIM_1]'],
      ['claim number is 1955-07-14', 'claim number is [CLAIM_1]'],
      ['ICN: 1955-07-14', 'ICN: [CLAIM_1]'],
      ['Claim\u200B1955-07-14', 'Claim\u200B[CLAIM_1]'],
      ['Member ID 03/14/1962', 'Member ID [MEMBER_ID]'],
      ['ID: 03-14-1962', 'ID: [MEMBER_ID]'],
    ] as const) {
      expect(redactLetter(written, patient, claims).text, written).toBe(expected);
      expect(holdsIdentifier(written, patient, claims), written).toBe(true);
    }
    // With no label the date stays, the recorded residual (docs/adr/0054), and a deadline is read as one.
    for (const written of ['Appeal by 2027-03-15.', 'Seen 1955-07-14 and 03-15-61.', 'Seen 03/14/1962.', 'Appeal by 2027/03/15.']) {
      expect(redactLetter(written, patient, claims).text, written).toBe(written);
    }
    // A label never makes an amount a claim's number, nor reaches a date it does not stand right before.
    expect(redactLetter('Claim paid $20270315.00 on 2027-03-15.', patient, claims).text).toBe('Claim paid $20270315.00 on 2027-03-15.');
    expect(redactLetter('Claim reviewed; appeal by 2027-03-15.', patient, claims).text).toBe('Claim reviewed; appeal by 2027-03-15.');
  });

  it('reads a label only as a head word with what follows it, or "No.", "ID:", "number is" and "Re:", and a member’s label only for a member ID (review finding G2), and reads a label’s end through "*", ",", "(" and an opening quote (review finding G3)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['19550714'] };
    const claimsOf = (value: string): LetterClaim[] => [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: [value] }];
    // G2: a deadline equal to the claim's digits stays after ordinary words and after a member's label.
    for (const written of ['The number 2027-03-15 is the deadline', 'No 2027-03-15 appeal accepted', 'Answer: no. 2027-03-15 is late', 'reference: 2027-03-15', 'Reference date #2027-03-15', 'Member: 2027-03-15', 'Member: 2027.03.15', 'Subscriber ID 2027/03/15', 'Number of visits is 2027-03-15', 'ID 2027-03-15']) {
      expect(redactLetter(written, patient, claimsOf('20270315')).text, written).toBe(written);
      expect(holdsIdentifier(written, patient, claimsOf('20270315')), written).toBe(false);
    }
    // And a claim's label is none for a member ID written as a date; the member's own label is.
    expect(redactLetter('Claim# 1955-07-14; Member: 1955-07-14', patient, []).text).toBe('Claim# 1955-07-14; Member: [MEMBER_ID]');
    // "ID" with a qualifier after it introduces a member ID too (review finding security-rlb-sec-3).
    for (const label of ['ID Number: ', 'ID No. ', 'ID No: ', 'ID nbr ', 'The file. ID Number: ']) {
      expect(redactLetter(`${label}1955-07-14`, patient, []).text, label).toBe(`${label}[MEMBER_ID]`);
    }
    // Still the number: a head word with "no", "number" or "id" after it, "No." and "ID:", "number is", and "Reference number".
    for (const [written, value, expected] of [
      ['Claim no 04/26/2026', '04262026', 'Claim no [CLAIM_1]'],
      ['Claim No.: 2026-04-26', '20260426', 'Claim No.: [CLAIM_1]'],
      ['CLAIM NUMBER IS 2026-04-26', '20260426', 'CLAIM NUMBER IS [CLAIM_1]'],
      ['Patient control no.: 2026-04-26', '20260426', 'Patient control no.: [CLAIM_1]'],
      ['No. 2026-04-26', '20260426', 'No. [CLAIM_1]'],
      ['ID: 2026-04-26', '20260426', 'ID: [CLAIM_1]'],
      // "ID" with a qualifier after it, with or without a colon (review finding security-rlb-sec-3).
      ['ID Number: 2026-04-26', '20260426', 'ID Number: [CLAIM_1]'],
      ['ID No. 2026-04-26', '20260426', 'ID No. [CLAIM_1]'],
      ['ID No: 2026-04-26', '20260426', 'ID No: [CLAIM_1]'],
      ['ID nbr 2026-04-26', '20260426', 'ID nbr [CLAIM_1]'],
      ['The file. ID Number: 2026-04-26', '20260426', 'The file. ID Number: [CLAIM_1]'],
      ['The number is 2026-04-26', '20260426', 'The number is [CLAIM_1]'],
      ['Reference number 2026-04-26', '20260426', 'Reference number [CLAIM_1]'],
      // G3: the label's end through an opening quote, "(", Markdown bold, a comma, and "Re:".
      ['Claim: \u201C2026-04-26\u201D', '20260426', 'Claim: \u201C[CLAIM_1]\u201D'],
      ['ICN (2026-04-26)', '20260426', 'ICN ([CLAIM_1])'],
      ['**Claim:** 2026-04-26', '20260426', '**Claim:** [CLAIM_1]'],
      ['Claim, 2026-04-26,', '20260426', 'Claim, [CLAIM_1],'],
      ['Re: 2026-04-26', '20260426', 'Re: [CLAIM_1]'],
      ["Claim '2026.04.26'", '20260426', "Claim '[CLAIM_1]'"],
    ] as const) {
      expect(redactLetter(written, patient, claimsOf(value)).text, written).toBe(expected);
      expect(holdsIdentifier(written, patient, claimsOf(value)), written).toBe(true);
    }
  });

  it('reads digits joined over "." or "/" that are no whole written date as the number after any label, a word before "ID", "number", "no" or "#" too (review finding phi-G2-regress-1)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['12345678'] };
    const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['99887766'] }];
    for (const [written, expected] of [
      ['Patient ID 1234.5678', 'Patient ID [MEMBER_ID]'],
      ['Policy number 1234/5678', 'Policy number [MEMBER_ID]'],
      ["Member's ID 1234.5678", "Member's ID [MEMBER_ID]"],
      ['Member’s ID 1234.5678', 'Member’s ID [MEMBER_ID]'],
      ['Insurance ID 1234/5678', 'Insurance ID [MEMBER_ID]'],
      ['Health plan ID 1234.5678', 'Health plan ID [MEMBER_ID]'],
      ['Medicaid ID 1234.5678', 'Medicaid ID [MEMBER_ID]'],
      ['Insured ID number 1234.5678', 'Insured ID number [MEMBER_ID]'],
      ["Subscriber's ID number 1234.5678", "Subscriber's ID number [MEMBER_ID]"],
      ['Member Identification Number 1234.5678', 'Member Identification Number [MEMBER_ID]'],
      ['Policy # 1234.5678', 'Policy # [MEMBER_ID]'],
      ['ID 1234.5678', 'ID [MEMBER_ID]'],
      ['The number 9988.7766 was denied', 'The number [CLAIM_1] was denied'],
      ['reference: 9988/7766', 'reference: [CLAIM_1]'],
    ] as const) {
      const redacted = redactLetter(written, patient, claims).text;
      expect(redacted, written).toBe(expected);
      expect(holdsIdentifier(written, patient, claims), written).toBe(true);
      expect(holdsIdentifier(redacted, patient, claims), written).toBe(false);
      // Another patient's number written so is offered to the one-patient screen (G1's join, after any label).
      expect(identifierCandidates(written), written).toContain(written.includes('9988') ? '99887766' : '12345678');
    }
    // A whole written calendar date still needs G2's label of the number's kind: a deadline after a bare word stays.
    for (const written of ['ID 2027-03-15', 'ID 2027/03/15', 'Patient ID 2027.03.15', 'Policy # 2027/03/15', 'The number 2027-03-15 is the deadline']) {
      const theirs: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['20270315'] }];
      expect(redactLetter(written, patient, theirs).text, written).toBe(written);
      // Over "." or "/" (over a dash digits alone join anywhere, as before).
      if (!written.includes('-')) {
        expect(identifierCandidates(written), written).not.toContain('20270315');
      }
    }
    // And no label, no join: digits with a period between them stay apart.
    expect(redactLetter('Also 1234.5678 and 9988/7766', patient, claims).text).toBe('Also 1234.5678 and 9988/7766');
    expect(identifierCandidates('Also 1234.5678')).not.toContain('12345678');
  });

  it('reads a number glued to its label, "№" (which NFKC writes "No") among them, as after that label (review finding phi-numero-glued)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['ZZ12345678', '12345678'] };
    const claims: LetterClaim[] = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['20270315', '99887766'] }];
    for (const [written, expected, candidate] of [
      ['Claim №99887766 denied', 'Claim No[CLAIM_1] denied', '99887766'],
      ['Member №12345678', 'Member No[MEMBER_ID]', '12345678'],
      ['Member №ZZ12345678', 'Member No[MEMBER_ID]', 'ZZ12345678'],
      ['Claim№99887766', 'ClaimNo[CLAIM_1]', '99887766'],
      ['ICN99887766 denied', 'ICN[CLAIM_1] denied', '99887766'],
      ['Member ID12345678 on file', 'Member ID[MEMBER_ID] on file', '12345678'],
      ['CLAIM NO99887766', 'CLAIM NO[CLAIM_1]', '99887766'],
      ['ICN9988.7766', 'ICN[CLAIM_1]', '99887766'],
      ['Claim №2027-03-15', 'Claim No[CLAIM_1]', '20270315'],
      ['Claim № 99887766', 'Claim No [CLAIM_1]', '99887766'],
    ] as const) {
      const redacted = redactLetter(written, patient, claims).text;
      expect(redacted, written).toBe(expected);
      expect(holdsIdentifier(written, patient, claims), written).toBe(true);
      expect(holdsIdentifier(redacted, patient, claims), written).toBe(false);
      expect(identifierCandidates(written.normalize('NFKC')), written).toContain(candidate);
    }
    // Only a label word: the patient's digits glued to another word, or a glued word that is no label, stay.
    for (const written of ['Room AB99887766', 'Casino 2027-03-15', 'Nov 2027-03-15']) {
      expect(redactLetter(written, patient, claims).text, written).toBe(written);
    }
  });

  it('reads a label’s end through "=", an en or em dash and the minus sign (review finding phi-label-end-dash)', () => {
    const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-13', names: ['VANTREE, JANE'], datesOfBirth: [], memberIds: ['12345678'] };
    const claims: LetterClaim[] = [
      { claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['20260426'] },
      { claimId: 'synthetic-claim-2', patientPseudonym: 'synthetic-patient-13', claimNumbers: ['99887766'] },
    ];
    for (const [written, expected] of [
      ['Member ID – 1234.5678', 'Member ID – [MEMBER_ID]'],
      ['Member ID — 1234.5678', 'Member ID — [MEMBER_ID]'],
      ['Member ID = 1234.5678', 'Member ID = [MEMBER_ID]'],
      ['Member ID − 1234/5678', 'Member ID − [MEMBER_ID]'],
      ['Claim # – 9988/7766', 'Claim # – [CLAIM_2]'],
      ['Claim — 2026-04-26', 'Claim — [CLAIM_1]'],
      ['The number – is 2026-04-26', 'The number – is [CLAIM_1]'],
    ] as const) {
      const redacted = redactLetter(written, patient, claims).text;
      expect(holdsIdentifier(redacted, patient, claims), written).toBe(false);
      expect(redacted, written).toBe(expected);
      expect(identifierCandidates(written), written).toContain(written.includes('9988') ? '99887766' : written.includes('1234') ? '12345678' : '20260426');
    }
  });

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

  it('offers another patient’s digits-only ID written with "." or "/" between its digits after an identifier label, as the matcher reads it (property; review finding G1)', () => {
    const LABELED_JOINERS = [...NUMBER_JOINERS, '.', '/', '.', '/'];
    const label = fc.constantFrom('Claim ', 'ICN ', 'Member ID: ', 'Claim No. ', 'Subscriber # ', 'ICN (', 'Claim: \u201C', '**Claim:** ', 'Claim, ', 'Re: ', 'No. ', 'ID:', 'claim number is ');
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{5,8}$/), fc.array(fc.nat(1000), { minLength: 1, maxLength: 2 }), label, (digits, picks, before) => {
        const characters = [...digits];
        const cuts = new Map(picks.map((pick) => [1 + (pick % (characters.length - 1)), LABELED_JOINERS[pick % LABELED_JOINERS.length] ?? '.']));
        const written = characters.map((character, i) => `${cuts.get(i) ?? ''}${character}`).join('');
        const text = `SYNTHETIC: ${before}${written} for Jane Zephyra, DOB 03/14/1980, member SYNMEMBER0042.`;
        expect(identifierCandidates(text), text).toContain(digits);
        const patient: PatientIdentifiers = { pseudonym: 'synthetic-patient-14', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
        const redacted = redactLetter(text, patient, [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-14', claimNumbers: ['SYNCLAIM0001'] }]).text;
        expect(identifierCandidates(redacted), redacted).toContain(digits);
      }),
      { numRuns: 300 },
    );
    // The critic's three examples, and the same digits with no label, which the letter path keeps apart (docs/adr/0054).
    expect(identifierCandidates('ICN 1234.5678')).toContain('12345678');
    expect(identifierCandidates('Claim 1955/07/14')).toContain('19550714');
    expect(identifierCandidates('Claim 1955.07.14')).toContain('19550714');
    expect(identifierCandidates('Member ID: 7654.321')).toContain('7654321');
    expect(identifierCandidates('Also 1234.5678 and 1955/07/14')).not.toContain('12345678');
    expect(identifierCandidates('Also 1234.5678 and 1955/07/14')).not.toContain('19550714');
    // Only a run of digits alone joins over "." or "/" after a label, as the matcher reads a digits-only number (the N6 property's seed -1651459486).
    expect(identifierCandidates('see the claim AAAA_8\u200B.2')).not.toContain('AAAA82');
    expect(identifierCandidates('see the claim 4444_8\u200B.2')).toContain('444482');
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
