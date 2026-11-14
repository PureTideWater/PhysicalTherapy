import { describe, expect, it } from 'vitest';

import { CHECK_WORK_BUDGET, type LetterClaim, type PatientIdentifiers, checkWorkOf, holdsIdentifier, redactLetter, redactLetterForScreen, redactionSpans } from '@tp/redact';

/**
 * Queues item 41 (test matrix MOD-27; docs/adr/0054): a C1 character (U+0080 to U+009F) in a letter's text, which is
 * what a Windows-1252 byte read as Latin-1 becomes (a dash, a quote, a mainframe line ending). Item 40 refuses a
 * letter where one stands between the pieces of anything a reading takes; the reader's entry now reads such a letter
 * with every C1 as a line break, unless the letter with every C1 taken out holds more of the patient's stored
 * identifiers: then a C1 split one of them, and the letter is read as item 40 reads it, which refuses it.
 * SYNTHETIC only: patient ZEPHYRA, SYN- and ZZ-prefixed numbers. A C1 is written as an escape, never as the character.
 */

const REFUSED = null;
const C1 = /[\u0080-\u009f]/g;

/** The path a letter takes (the gateway's): redacted for the screen, then the check on that letter's own count. */
function sentOrRefused(letter: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): string | null {
  const screened = redactLetterForScreen(letter, patient, claims);
  return holdsIdentifier(screened.text, patient, claims, checkWorkOf(screened)) ? REFUSED : screened.text;
}

const JANE: PatientIdentifiers = { pseudonym: 'synthetic-patient-41', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['30072299', 'ZZ7654321'] };
const CLAIMS: LetterClaim[] = [{ claimId: 'synthetic-claim-41-1', patientPseudonym: 'synthetic-patient-41', claimNumbers: ['SYNCLAIM0001'] }];

/** Every C1 character the tests write: a mended dash, the mainframe line ending, and one Windows-1252 leaves undefined. */
const SAMPLE_C1 = ['\u0096', '\u0085', '\u0081', '\u0080', '\u009f'] as const;
const named = (c1: string) => `U+00${c1.charCodeAt(0).toString(16).toUpperCase()}`;

describe('MOD-27, Queues item 41: a C1 character between two numbers is read as a line break, and the letter is sent with every stored value replaced', () => {
  // The three real shapes item 40 refused (its 52 real-shaped refusals): a code range, an amount and then a date on the
  // next line, and a stored number and then a date on the next line.
  const shapes: readonly (readonly [string, (c1: string) => string])[] = [
    ['a code range', (c1) => `Member ID ZZ7654321. Codes 97110${c1}97112 were billed for Jane Zephyra.`],
    ['an amount, then a date', (c1) => `Member ID ZZ7654321. Paid 150.00${c1}01/05/2026 for claim SYNCLAIM0001.`],
    ['a stored number, then a date', (c1) => `Member 30072299${c1}01/05/2026 Paid 150.00 to the provider.`],
  ];
  for (const [shape, write] of shapes) {
    for (const c1 of SAMPLE_C1) {
      it(`${shape} across ${named(c1)} is sent as the letter with a line break there is`, () => {
        const letter = write(c1);
        const sent = sentOrRefused(letter, JANE, CLAIMS);
        expect(sent).not.toBe(REFUSED);
        expect(sent).toBe(sentOrRefused(write('\n'), JANE, CLAIMS));
        expect(sent).toContain('[MEMBER_ID]');
        expect(sent).not.toMatch(/ZZ7654321|30072299|SYNCLAIM0001|Zephyra/u);
        expect(sent).not.toMatch(C1);
      });
    }
  }

  it('redactLetter and redactionSpans write what the screen’s reading writes, each span where it stands in the letter', () => {
    const letter = 'Member 30072299\u009601/05/2026 Paid 150.00 to the provider.';
    const screened = redactLetterForScreen(letter, JANE, CLAIMS);
    expect(redactLetter(letter, JANE, CLAIMS).text).toBe(screened.text);
    const { text, spans } = redactionSpans(letter, JANE, CLAIMS);
    // One code unit for one: a span on the reader's text is the same span on the stored text.
    expect(text).toBe(letter.replace(C1, '\n'));
    expect(spans.map((span) => [letter.slice(span.start, span.end), span.placeholder])).toEqual([['30072299', '[MEMBER_ID]']]);
  });

  it('both readings are charged on the letter’s one count: the breaks reading, and the joined reading on from it', () => {
    const letter = 'Member ID ZZ7654321. Codes 97110\u009697112 were billed for Jane Zephyra.';
    const breaks = checkWorkOf(redactLetterForScreen(letter.replace(C1, '\n'), JANE, CLAIMS));
    const joined = checkWorkOf(redactLetterForScreen(letter.replace(C1, ''), JANE, CLAIMS));
    expect(breaks).toBeGreaterThan(0);
    expect(joined).toBeGreaterThan(0);
    expect(checkWorkOf(redactLetterForScreen(letter, JANE, CLAIMS))).toBe(breaks + joined);
  });
});

describe('MOD-27, Queues item 41: a C1 character inside a stored identifier leaves the letter read as item 40 reads it, refused', () => {
  // A date of birth split by a C1 is no date to the reading with breaks: the joined reading alone finds it.
  const split: readonly (readonly [string, (c1: string) => string])[] = [
    ['a date of birth in digits', (c1) => `Born 03/1${c1}4/1980, seen in clinic.`],
    ['a date of birth in words', (c1) => `Born March 1${c1}4, 1980, seen in clinic.`],
  ];
  for (const [what, write] of split) {
    for (const c1 of SAMPLE_C1) {
      it(`${what} split by ${named(c1)} is refused`, () => {
        expect(sentOrRefused(write(c1), JANE, CLAIMS)).toBe(REFUSED);
      });
    }
  }

  // A number the reader takes across a line break is taken by both readings: sent with the whole of it replaced, or refused.
  const taken: readonly (readonly [string, (c1: string) => string])[] = [
    ['a member ID', (c1) => `Member ID ZZ76${c1}54321 was billed.`],
    ['a digits-only member ID', (c1) => `Member 3007${c1}2299 was billed.`],
    ['a claim number', (c1) => `Claim SYNCLAIM${c1}0001 was denied.`],
    ['a date of birth broken after its slash', (c1) => `Member ID ZZ7654321, born 03/${c1}14/1980.`],
    ['an unlabeled member ID', (c1) => `We reviewed ZZ76${c1}54321 again.`],
    ['an unlabeled digits-only member ID', (c1) => `We reviewed 3007${c1}2299 again.`],
  ];
  for (const [what, write] of taken) {
    for (const c1 of SAMPLE_C1) {
      it(`${what} split by ${named(c1)} is refused or sent with no piece of it`, () => {
        const sent = sentOrRefused(write(c1), JANE, CLAIMS);
        if (sent !== REFUSED) {
          expect(sent).not.toMatch(/ZZ76|54321|3007|2299|SYNCLAIM|0001|1980/u);
        }
      });
    }
  }

  // A name's pieces are each replaced by item 40's own reading of the letter as written: sent, the name hidden.
  for (const c1 of SAMPLE_C1) {
    for (const letter of [`Seen: Jane Zeph${c1}yra, in clinic.`, `Seen: Jane${c1}Zephyra, in clinic.`]) {
      it(`a name split by ${named(c1)} (${JSON.stringify(letter.replace(C1, '?'))}) is refused or sent with no piece of it`, () => {
        const sent = sentOrRefused(letter, JANE, CLAIMS);
        if (sent !== REFUSED) {
          expect(sent).not.toMatch(/Jane|Zeph|yra/iu);
        }
      });
    }
  }

  it('a split identifier beside a code range refuses the whole letter', () => {
    expect(sentOrRefused('Codes 97110\u009697112. Born 03/1\u00964/1980.', JANE, CLAIMS)).toBe(REFUSED);
  });

  it('the unmended reading is charged on from the two before it', () => {
    const letter = 'Born 03/1\u00854/1980, seen in clinic.';
    const breaks = checkWorkOf(redactLetterForScreen(letter.replace(C1, '\n'), JANE, CLAIMS));
    const joined = checkWorkOf(redactLetterForScreen(letter.replace(C1, ''), JANE, CLAIMS));
    expect(checkWorkOf(redactLetterForScreen(letter, JANE, CLAIMS))).toBeGreaterThan(breaks + joined);
  });
});

describe('MOD-27, Queues item 41: the budget is the letter’s one budget, unchanged', () => {
  const prose = (length: number) => 'The claim was paid in part on the date shown. '.repeat(Math.ceil(length / 46)).slice(0, length);

  it('the budget is 420,000,000 units', () => {
    expect(CHECK_WORK_BUDGET).toBe(420_000_000);
  });

  it('a letter whose two readings together pass the budget is refused by the count, with no text of the letter', { timeout: 60_000 }, () => {
    const body = prose(250_000);
    const alone = checkWorkOf(redactLetterForScreen(body, JANE, CLAIMS));
    // Read once, the prose is inside the budget; read twice on one count, it is past it.
    expect(alone).toBeLessThanOrEqual(CHECK_WORK_BUDGET);
    expect(alone * 2).toBeGreaterThan(CHECK_WORK_BUDGET);
    const screened = redactLetterForScreen(`\u0096${body}`, JANE, CLAIMS);
    expect(checkWorkOf(screened)).toBe(CHECK_WORK_BUDGET + 1);
    expect(screened.text).toHaveLength(1);
    expect(holdsIdentifier(screened.text, JANE, CLAIMS, checkWorkOf(screened))).toBe(true);
    // redactLetter has no count to hand on: what it writes for such a letter is refused by the check.
    expect(holdsIdentifier(redactLetter(`\u0096${body}`, JANE, CLAIMS).text, JANE, CLAIMS)).toBe(true);
  });
});

describe('MOD-27, Queues item 41: a letter with no C1 character is read as before', () => {
  it('is sent with its stored values replaced, on one reading’s count', () => {
    const letter = 'Member ID ZZ7654321. Codes 97110-97112 were billed for Jane Zephyra.';
    expect(sentOrRefused(letter, JANE, CLAIMS)).toBe('Member ID [MEMBER_ID]. Codes 97110-97112 were billed for [PATIENT_NAME] [PATIENT_NAME].');
  });
});
