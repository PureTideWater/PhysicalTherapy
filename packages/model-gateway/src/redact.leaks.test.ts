import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CHECK_WORK_BUDGET, type LetterClaim, type PatientIdentifiers, checkWorkOf, holdsIdentifier, holdsNameOrNumber, redactLetter, redactLetterForScreen, redactionSpans } from '@tp/redact';

import { timed } from './test-support/time-budget';

/**
 * The leaks co-001/redact-ssn-phone-leaks closes (test matrix MOD-21, MOD-22; docs/adr/0054, the amendment of that change;
 * the orchestrator's rulings A, A' and B of 2026-11-07), each rule on both sides: the shape it now redacts or refuses, and
 * beside it the neighbour that must stay. SYNTHETIC only: patients ZEPHYRA, VANTREE and their like with SYN-prefixed
 * numbers, Social Security twins in the 9xx area (never issued), phone twins NPA-555-01xx.
 *
 * Every expectation is an exact outcome on the path a letter takes (sentOrRefused): the letter is redacted for the screen
 * and the check reads what would be sent; it is REFUSED (never sent), or it is sent as exactly the text written here.
 *
 * Two tiers, as the change's design has them. In every letter, the shapes structure decides (a number glued to an SSN's
 * or a phone's own shape, to an amount's digits or to a mask; a label glued to a word, or read through the call's own
 * identifier or its list number; a placeholder glued to the call's identifier). In a held letter only (one whose digit
 * chain only the range fix's barriers hold: cc3dd7f6 refused every such letter), the shapes no structure decides are
 * refused as cc3dd7f6 refused them, and stay the recorded residuals of ADR 0054 in any other letter: the tests pin both.
 *
 * A look-alike letter is written as an escape in this file, never as the character, so that no reviewer reads a Cyrillic
 * or Greek letter as the Latin one.
 */

const REFUSED = null;

/** What becomes of a letter: REFUSED when the check finds an identifier in what would be sent, else the text sent. */
function sentOrRefused(letter: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): string | null {
  const screened = redactLetterForScreen(letter, patient, claims);
  return holdsIdentifier(screened.text, patient, claims) ? REFUSED : screened.text;
}

/** A row's letter, what becomes of it in words (for the test's name), and its exact outcome. */
type Row = readonly [letter: string, outcome: string, sent: string | null];
const refused = (letter: string): Row => [letter, 'is refused', REFUSED];
const unchanged = (letter: string): Row => [letter, 'is sent unchanged', letter];
const sentAs = (letter: string, sent: string): Row => [letter, `is sent as ${JSON.stringify(sent)}`, sent];

const patientOf = (names: string[], datesOfBirth: string[] = ['1980-03-14'], memberIds: string[] = ['SYNMEMBER0042']): PatientIdentifiers => ({ pseudonym: 'synthetic-patient-21', names, datesOfBirth, memberIds });
const claimsOf = (...numbers: string[]): LetterClaim[] => numbers.map((number, index) => ({ claimId: `synthetic-claim-21-${String(index + 1)}`, patientPseudonym: 'synthetic-patient-21', claimNumbers: [number] }));

/** The patient of most rows: two member IDs, and two claims, so a claim's placeholder is its own. */
const JANE = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042', 'ZZ7654321']);
const JANE_CLAIMS = claimsOf('SYNCLAIM0001', 'C2026000417');

/**
 * Two held letters, each sent unchanged on its own. The first holds a range from a date to an amount glued to the next
 * word; the second is MOD-16's CI counterexample, a service period glued to the next word after an amount and a full stop.
 * cc3dd7f6 refused both for the range's own digits; the range fix sends them, and reads what stands beside them strictly.
 */
const HELD = 'Seen 01/01/2020-150.00Paid in full. ';
const HELD_PERIOD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
const HELD_FRAMES = [HELD, HELD_PERIOD] as const;

/** Synthetic twins: an SSN in the 9xx area, never issued; a phone NPA-555-01xx. */
const ssnTwin = fc.stringMatching(/^9[0-9]{8}$/);
const phoneTwin = fc.tuple(fc.integer({ min: 200, max: 999 }), fc.integer({ min: 0, max: 99 })).map(([area, line]) => `${String(area)}55501${String(line).padStart(2, '0')}`);

/**
 * How many of a written number's digits in a row a sent letter still shows: the longest stretch of its digits, in the
 * order the letter writes them and whatever stands between them, that lies outside every span redaction replaced. The
 * number is where the generator wrote it (`at`, `length`), never where a matcher finds it.
 */
function digitsLeftInARow(letter: string, at: number, length: number, patient: PatientIdentifiers, claims: readonly LetterClaim[]): number {
  const { text, spans } = redactionSpans(letter, patient, claims);
  // The generators write text NFKC leaves as it is, so their offsets are the redacted text's.
  expect(text).toBe(letter);
  let longest = 0;
  let run = 0;
  for (let i = at; i < at + length; i += 1) {
    if (!/[0-9]/u.test(text[i] ?? '')) continue;
    run = spans.some((span) => span.start <= i && i < span.end) ? 0 : run + 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

describe('MOD-21: a Social Security or phone number glued to another number, behind a label, or in a held letter is redacted or refused', () => {
  const expectOutcome = (letter: string, sent: string | null, patient: PatientIdentifiers = JANE, claims: readonly LetterClaim[] = JANE_CLAIMS) => {
    expect(sentOrRefused(letter, patient, claims), JSON.stringify(letter)).toBe(sent);
  };

  // ---------------------------------------------------------------------------------------------------
  // Every letter

  // G1 (a): the number's own shape (three groups joined with no white space, the middle one of two digits, or of three for
  // a phone) with more digits glued after its last group. ef3e8d20 read the longer last group as no shape and sent it.
  it.each([
    refused('900-12-3456150.00'),
    refused('202-555-0123202-555-0124'),
    // A reference's noun names such a number, and the letter keeps it: a case, a ticket, an inquiry.
    unchanged('Case No. 123-45-678901'),
    unchanged('Case No. 2026-11-00042'),
    unchanged('Ticket 802-91-69413'),
    unchanged('Inquiry # 150-98-68279'),
    unchanged('Inquiry No. 150-98-68279'),
    // No other word names a number: cents glued after the shape are another number's (the review of the build, B2-4).
    refused('Patient ID 900-12-3456150.00'),
    // An SSN or phone label names no reference, whatever follows the label's word.
    refused('SSN No. 900-12-3456150.00'),
    refused('SSN# 900-12-3456150.00'),
    refused('Social Security Number 900-12-3456150.00'),
    refused('Phone number 202-555-01234567'),
    refused('Fax No. 202-555-0123150.00'),
    // And a word that ends in "id" is no word and "ID": "Paid", "Medicaid" and "Valid" name nothing.
    refused('Paid-975-20-18460.00.'),
    // With nothing after its longer last group and no label, the number is as often a reference: sent, as at ef3e8d20
    // (the review of the build, B2-3).
    unchanged('Medicaid 900-12-345678'),
    unchanged('Valid 123-45-678901'),
  ])('G1: more digits glued after an SSN’s or a phone’s own shape refuse the letter, unless a reference’s noun names the number: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G1 (b) and (c): digits glued before the shape's first group, where structure says they are another number's: a
  // currency amount's, an amount's cents after its point, or a date's end, its four-digit year after its month and day
  // too; and digits glued on both sides.
  it.each([
    refused('01/01/2020900-12-3456'),
    refused('Seen Jan 1, 2020900-12-3456 today'),
    refused('Seen 1 January 2020900-12-3456 today'),
    refused('June 18, 2026423.435-4454'),
    refused('01/02/20900-12-3456'),
    refused('2020-01-01900-12-3456'),
    refused('Paid 150.00900-12-3456'),
    refused('150.00900-12-3456150.00'),
    // With no date before it a year is as often a reference's own first digits, and so is any longer run and a cell of a
    // row: sent, as at ef3e8d20 (the review of the fix round's delta, D2-1, D2-2 and D2-4).
    unchanged('2020900-12-3456'),
    unchanged('Claim W20260115-12-3456'),
    unchanged('Ref 20260115-12-3456 today'),
    unchanged('NPI|POS|CPT|Units|Billed\n1234567893|11|97110|2|150.00'),
    unchanged('NPI|TIN\n1234567893|12-3456789\n1098765432|98-7654321'),
    unchanged('remit_20260115_01_0001.pdf'),
    unchanged('Line,Group,Billed\n1,00123-456-7890,150.00'),
    unchanged('Total 1,20345-67-8901'),
    // A first group one to three digits longer, with nothing joined before it, is a reference's own.
    unchanged('29 CFR 2590.715-2719'),
    // A date written year first with an amount glued after its day is read as cc3dd7f6 read it.
    unchanged('2020-01-02150.00'),
  ])('G1: another number’s digits glued before an SSN’s or a phone’s own shape refuse the letter; a reference and a year-first date stay: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G1 (b), a currency amount's digits: a shape that starts inside a currency amount is no part of the amount.
  it.each([
    refused('Paid $150.00900-12-3456'),
    refused('Paid $1500900-12-3456'),
    refused('Paid $45202-555-0123'),
    refused('Paid $514451/293-6215'),
    refused('Paid $15900-12-3456'),
    // Set apart from the amount, the number is redacted as before.
    sentAs('Paid $150.00 900-12-3456', 'Paid $150.00 [SSN]'),
    sentAs('Paid $45-900-12-3456', 'Paid $45-[SSN]'),
    // And an amount beside other numbers stays: no SSN's or phone's shape starts inside it.
    unchanged('Total $1,250.00-123-4567'),
    unchanged('Deductible $1000/$250/$5000'),
    unchanged('Paid $1,500.00 on 01-12-2026'),
    // A shape right after the currency sign with cents glued after it is refused as it is with no sign (the review of the
    // build, B2-4).
    refused('Paid $900-12-3456150.00'),
  ])('G1: an SSN’s or a phone’s own shape that starts inside a currency amount refuses the letter; an amount beside other numbers stays: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // The recorded cost of that rule, the safer reading: an amount with no cents glued to a dashed date, and a deductible's
  // three amounts with one currency sign, are a shape that starts inside a currency amount to the reader, so a person reads the letter.
  it.each([refused('Paid $1500-12-2026'), refused('Deductible $1000/250/5000')])('G1, its recorded cost (the safer reading): %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G6: nine digits or more before a decimal point are no amount, so the scan reads the run; eleven or more with cents
  // after them refuse the letter, unless a noun names the run.
  it.each([
    refused('900123456150.00'),
    refused('Paid 2025550123150.00 today'),
    unchanged('ICN 12345678901234.01 line 1'),
    unchanged('Billed 1,234,567.00 today.'),
  ])('G6: an SSN or phone glued to an amount’s digits refuses the letter; an ICN with a line number after a period stays: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G2: a masked SSN glued to a letter or a digit before it that is no mask character. ef3e8d20 refused it only in a held
  // letter and sent it elsewhere.
  it.each([
    refused('PaidXXX-XX-3456'),
    refused('2020***-**-3456'),
    // Five mask characters and four digits are as often a masked account number: refused in a held letter only, as at
    // ef3e8d20 (the review of the build, B2-2).
    unchanged('Seen 2020XXXXX3456'),
    refused(`${HELD}Seen 2020XXXXX3456`),
    // The mask set apart is redacted as before; six mask characters and four digits are a masked account number.
    sentAs('SSN XXX-XX-3456', 'SSN [SSN]'),
    unchanged('Deposited to account XXXXXX1234'),
  ])('G2: a masked SSN glued to the letter or digit before it refuses the letter; a masked account number stays: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G3: a Social Security label glued to the word before it by a lost space is the label to the survivor scan (a refusal,
  // never a redaction). ef3e8d20 read it as no label and sent the amount-shaped number after it.
  it.each([
    refused('PatientSSN 900.12 3456'),
    refused('PATIENTSSN 900.12 3456'),
    refused('PatientSocialSecurityNumber 900.12 3456'),
    // Never "Assn" or "ISSN", whose last letters spell the label.
    unchanged('Medical Assn 150.00 120.00'),
    unchanged('ISSN 2049-3630: 150.00 120.00'),
    // The phone labels are not read glued, since words end in them ("Fairfax"); a phone label glued to a word stays the recorded residual.
    unchanged('PO Box 2113, Fairfax, VA 22038-1234'),
    unchanged('PatientPhone 202 555 01.23'),
  ])('G3: a Social Security label glued to the word before it refuses the letter; "Assn", "ISSN" and "Fairfax" are no label: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G4: a label reads through the call's own identifier, on the number's line, as it reads the line with the identifier
  // gone. The patterns redact through it a number whose own words say nothing; the scan refuses under it. ef3e8d20 ended
  // every label at the identifier's placeholder, and sent the number after it.
  it.each([
    sentAs('Call Zephyra at 555-0123.', 'Call [PATIENT_NAME] at [PHONE].'),
    sentAs('Phone (Jane Zephyra, home): 555.0123', 'Phone ([PATIENT_NAME] [PATIENT_NAME], home): [PHONE]'),
    sentAs('Call Jane Zephyra today at 555-0123', 'Call [PATIENT_NAME] [PATIENT_NAME] today at [PHONE]'),
    sentAs('Call Jane Zephyra at home 555-0123', 'Call [PATIENT_NAME] [PATIENT_NAME] at home [PHONE]'),
    sentAs('Phone Jane Zephyra home 555 0123', 'Phone [PATIENT_NAME] [PATIENT_NAME] home [PHONE]'),
    sentAs('Re: SSN Jane Q1900123456', 'Re: SSN [PATIENT_NAME] Q[SSN]'),
    refused('SSN for Zephyra: 90012-3456'),
    refused('SSN (Jane Zephyra, patient): 90012-3456'),
    refused('Tel: ZZ7654321 - 9001 23456'),
    refused('SSN for Zephyra: 555-0123-150.00 ID 9001 23456'),
    // The scan's read over the numbers before an amount reads through the identifier too.
    refused('Phone Zephyra, Jane: 900 13 9434.00'),
    refused('Phone on file for Zephyra, 760.39-2,673.50.'),
    // An address after "Contact" and the name is refused, as "Contact Springfield, IL 62701-1234" is with no name: the safer reading.
    refused('Contact Jane Zephyra, Springfield, IL 62701-1234'),
    refused('Contact JANE Q ZEPHYRA, Springfield, IL 60744-5994'),
    refused('Contact Springfield, IL 62701-1234'),
    // With the label out of reach behind another number, the address stays, and only the name is replaced.
    sentAs('Contact: Jane Zephyra, 12 Oak St, Springfield, IL 62701-1234', 'Contact: [PATIENT_NAME] [PATIENT_NAME], 12 Oak St, Springfield, IL 62701-1234'),
    // A number a noun names stays named, the label behind the identifier or not.
    sentAs('Phone call with Jane Zephyra regarding claim 230957851', 'Phone call with [PATIENT_NAME] [PATIENT_NAME] regarding claim 230957851'),
    sentAs('Phone call with JANE Q ZEPHYRA regarding claim 230957851', 'Phone call with [PATIENT_NAME] regarding claim 230957851'),
  ])('G4: an SSN or phone label is read through the call’s own identifier to the number on its line; a number a noun names stays: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G5: one or two digits right after an SSN or phone label and before ":" or ")" are the label's list number, read
  // through as the call's identifier is. ef3e8d20 ended the label at the digit ("a digit in a local number's window").
  it.each([
    sentAs('Phone 1: 555-0100', 'Phone 1: [PHONE]'),
    sentAs('Fax No. 2: 555-0100', 'Fax No. 2: [PHONE]'),
    // A list number before ")" is one more group of the chain to the scan: nine digits or more under the label are refused, as before.
    refused('Phone 2) 555 0123 555 0124'),
    refused('TTY 11) 555 0123'),
    refused('Tel 1) 555-0123-631-0896'),
    // And the scan's read over the numbers before an amount reads through the list number.
    refused('TTY 1: Questions? 150.00 120.00 30.00'),
    refused('Fax 1: 15.00 12.00 3.00'),
    // A local number after a list number and ")" is the label's; three digits are no list number; "Line" is no label.
    sentAs('Tel 1) 555-0123', 'Tel 1) [PHONE]'),
    unchanged('Fax 123: 555-0100'),
    unchanged('Line 1: 555-0100'),
  ])('G5: an SSN or phone label is read through its own list number: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // G7: a pattern's placeholder is a number to what is glued to it. ef3e8d20 sent "SSN [SSN]thZephyraPaid", the name glued
  // to what had been a digit, though it refused "0123thZephyraPaid".
  it.each([
    refused('SSN 900-12-3456thZephyraPaid'),
    refused('Call 202-555-0123thZephyraPaid'),
    refused('0123thZephyraPaid'),
    // A placeholder with letters against it that spell no identifier of the call is sent.
    sentAs('SSN 900-12-3456thPaid', 'SSN [SSN]thPaid'),
  ])('G7: the call’s own name glued to an SSN’s or phone’s placeholder refuses the letter, as glued to its digits: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
  });

  // ---------------------------------------------------------------------------------------------------
  // A held letter only

  it.each(HELD_FRAMES)('a held letter stands on its own, and is told from any other by what it refuses: %j', (frame) => {
    expectOutcome(frame, frame);
    // An unlabeled local number is sent in a letter with no held range (the recorded residual), and refused beside one.
    expectOutcome('555-0123', '555-0123');
    expectOutcome(`${frame}555-0123`, REFUSED);
  });

  // The shapes no structure decides: refused in a held letter as cc3dd7f6 refused them, and in a letter with no held range
  // what they were, ADR 0054's recorded residuals (each row's third column is the shape on its own, as the code reads it today).
  it.each([
    // An SSN or phone written like an amount and a number, or with a group of five digits.
    unchanged('900.12 3456'),
    unchanged('900 12 34.56'),
    unchanged('202 555 01.23'),
    unchanged('90012-3456'),
    unchanged('20255 50123'),
    // A local number of three and four with no label.
    unchanged('555-0123'),
    // A date written two, two and four with dashes and a lone digit across white space beside it.
    unchanged('9 01-12-1985'),
    // Nine single digits.
    unchanged('9 0 0 1 2 3 4 5 6'),
    // A number of seven digits or more, one or two letters and a date with nothing between.
    unchanged('2025550122th10-28-2026'),
    // An amount with a currency sign, a dash and a date as one range.
    unchanged('Billed $150.00-01/02/2020 total'),
  ])('a shape no structure decides is refused beside a held range and is what it was in any other letter: %j alone %s', (shape, _outcome, alone) => {
    for (const frame of HELD_FRAMES) {
      expectOutcome(`${frame}${shape}`, REFUSED);
    }
    expectOutcome(shape, alone);
  });

  // A range that is itself one of those shapes makes its own letter a held one: refused with nothing beside it too.
  it.each([
    // An amount, a dash and a date as one range hold nothing; a date and then an amount stands as at ef3e8d20.
    refused('150.00-01/02/2020'),
    refused('Seen 150.00-01/02/2020 billed'),
    unchanged('Seen 01/02/2020-150.00 billed'),
    // A number joined to a held range's end by a joiner alone, a noun naming it or not; set apart by a space it stays.
    refused('Ref 5900481017(April 3, 2025-7125.74'),
    unchanged('Ref 5900481017 (April 3, 2025-7125.74'),
    // A number no barrier holds before a held range's first end across white space.
    refused('Paid 34569 01-12-1985-150.00'),
    // A word glued to a held range's end and then a bare nine or ten; with a space after the range the noun names it again.
    refused('Seen 01/01/2020-302.23.Ref 5900335398'),
    unchanged('Seen 01/01/2020-302.23. Ref 5900335398'),
  ])('a number beside a range that only the range fix holds is refused; set apart from it, it stays: %j %s', (letter, _outcome, sent) => {
    expectOutcome(letter, sent);
    if (sent === REFUSED) {
      for (const frame of HELD_FRAMES) expectOutcome(`${frame}${letter}`, REFUSED);
    }
  });

  // What structure places is never a part of a chain, beside a held range or anywhere: each is sent unchanged after either held letter.
  it.each([
    // A service-line row's code and units before its amounts, modifiers between them too.
    '97110 2 150.00 120.00',
    '97110 GP 2 150.00 120.00 80.00',
    // A ZIP and its four after a state's abbreviation or name.
    'Albany, NY 12207-1234',
    'Springfield, Illinois 62701-1234',
    // Two five-digit codes joined by a dash; a TIN written two and seven; the codes of a list a code word begins.
    '97110-97140',
    'TIN 12-3456789',
    'FEIN 12-3456789',
    'Codes 97110 97140 97530 G0283',
    // A year beside an amount, either way round.
    'Paid 150.00 2026',
    '2026 150.00',
    // A time after a date; a reference whose last groups have a local number's shape; an NPI.
    'Received 11/02/2026 4:36 p.m.',
    'Received 11-02-2026 4:36 p.m.',
    'Our reference is SYN-APL-123-4567',
    'NPI 1234567893',
    // A date and then an amount as one range.
    'Billed 01/02/2020-150.00 total',
  ])('what structure places is sent unchanged beside a held range: %j', (kept) => {
    for (const frame of HELD_FRAMES) {
      expectOutcome(`${frame}${kept}`, `${frame}${kept}`);
    }
    expectOutcome(kept, kept);
  });

  // The recorded cost of keeping "Paid 150.00 2026": an amount and a year stay whatever their digits, so a twin SSN whose
  // last four digits read as a year from 1900 to 2099, written as an amount and a number, is not told from them.
  it('keeps an amount and a year beside a held range whatever their digits (recorded: the cost of what must stay)', () => {
    for (const frame of HELD_FRAMES) {
      expectOutcome(`${frame}Paid 962.50 1933`, `${frame}Paid 962.50 1933`);
      expectOutcome(`${frame}Paid 962.50 3456`, REFUSED);
    }
  });

  /** The shapes of the rows above that write a whole number: what a held letter refuses and any other letter sends. */
  const HELD_SSN_SHAPES: readonly ((digits: string) => string)[] = [
    (digits) => `${digits.slice(0, 3)}.${digits.slice(3, 5)} ${digits.slice(5)}`, // 900.12 3456
    (digits) => `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)}.${digits.slice(7)}`, // 900 12 34.56
    (digits) => `${digits.slice(0, 5)}-${digits.slice(5)}`, // 90012-3456
    (digits) => `${digits.slice(0, 1)} ${digits.slice(1, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`, // 9 01-12-1985
    (digits) => [...digits].join(' '), // 9 0 0 1 2 3 4 5 6
  ];
  const HELD_PHONE_SHAPES: readonly ((digits: string) => string)[] = [
    (digits) => `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)}.${digits.slice(8)}`, // 202 555 01.23
    (digits) => `${digits.slice(0, 5)} ${digits.slice(5)}`, // 20255 50123
    (digits) => `${digits.slice(3, 6)}-${digits.slice(6)}`, // 555-0123
  ];

  it('never sends in clear an SSN or phone twin written in a shape only a held letter refuses, before or after a held range (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          // An SSN whose last four digits read as a year is, written as an amount and a number, an amount and a year: kept (the test above).
          ssn: ssnTwin.filter((digits) => !/^(?:19|20)/u.test(digits.slice(5))),
          phone: phoneTwin,
          isPhone: fc.boolean(),
          shape: fc.nat(1000),
          frame: fc.constantFrom(...HELD_FRAMES),
          numberFirst: fc.boolean(),
          before: fc.constantFrom('', 'Paid ', 'Seen ', 'Ref ', 'Item '),
          after: fc.constantFrom('', '.', ' on file.', ' Paid'),
          between: fc.constantFrom(' ', '\n'),
        }),
        ({ ssn, phone, isPhone, shape, frame, numberFirst, before, after, between }) => {
          const shapes = isPhone ? HELD_PHONE_SHAPES : HELD_SSN_SHAPES;
          const written = (shapes[shape % shapes.length] ?? String)(isPhone ? phone : ssn);
          const number = `${before}${written}${after}`;
          const letter = numberFirst ? `${number}${between}${frame}` : `${frame}${number}`;
          const at = (numberFirst ? 0 : frame.length) + before.length;
          const sent = sentOrRefused(letter, JANE, JANE_CLAIMS);
          // Refused; or, were it sent, with no four of the number's digits in a row left in it.
          if (sent !== REFUSED) {
            expect(digitsLeftInARow(letter, at, written.length, JANE, JANE_CLAIMS), `${JSON.stringify(letter)} -> ${JSON.stringify(sent)}`).toBeLessThan(4);
          }
        },
      ),
      { numRuns: 300 },
    );
  }, 60_000);

  /** Joiners with no white space, as G1 reads a shape's groups joined: a hyphen, a period, an en dash, the minus sign, an underscore. */
  const TIGHT_JOINS = ['-', '.', '\u2013', '\u2212', '_'];
  const shaped = (digits: string, first: string, second: string) => (digits.length === 9 ? `${digits.slice(0, 3)}${first}${digits.slice(3, 5)}${second}${digits.slice(5)}` : `${digits.slice(0, 3)}${first}${digits.slice(3, 6)}${second}${digits.slice(6)}`);
  /** An amount of four digits at most before its cents, with no thousands separator: glued to a shape it lengthens a group by one to four digits. */
  const gluedAmount = fc.tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 0, max: 99 })).map(([whole, cents]) => `${String(whole)}.${String(cents).padStart(2, '0')}`);
  const gluedDate = fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), fc.integer({ min: 2020, max: 2030 }), fc.boolean()).map(([month, day, year, yearFirst]) => {
    const [mm, dd] = [String(month).padStart(2, '0'), String(day).padStart(2, '0')];
    return yearFirst ? `${String(year)}-${mm}-${dd}` : `${mm}/${dd}/${String(year)}`;
  });

  it('refuses, or redacts, an SSN or phone twin in its own shape with an amount, a date or a second number glued to it, in a letter with no held range (property: G1 and G6)', () => {
    fc.assert(
      fc.property(
        fc.record({
          glue: fc.constantFrom('amount after', 'amounts after', 'date after', 'number after', 'amount before', 'date before', 'number before', 'amounts on both sides', 'bare, an amount after', 'bare, amounts after'),
          // A phone's area code in parentheses, a space after it: the shape with no label too.
          parentheses: fc.boolean(),
          twin: fc.oneof(ssnTwin, phoneTwin),
          second: fc.oneof(ssnTwin, phoneTwin),
          first: fc.constantFrom(...TIGHT_JOINS),
          last: fc.constantFrom(...TIGHT_JOINS),
          amount: gluedAmount,
          amountAfter: gluedAmount,
          date: gluedDate,
          // No reference's noun before the number (a noun names it: G1's other side), and no currency sign right before its shape (the amount itself).
          before: fc.constantFrom('', 'Paid ', 'Seen ', 'Billed ', 'Item ', 'Noted '),
          after: fc.constantFrom('', '.', ' today', ' Paid'),
        }),
        ({ glue, parentheses, twin, second, first, last, amount, amountAfter, date, before, after }) => {
          // A period after an SSN's first group and a dash after its second would write an amount and a dash, "993.96-8300":
          // an amount-shaped number, ADR 0054's recorded residual and no shape of G1. The second joiner is then the first again.
          const joined = shaped(twin, first, twin.length === 9 && first === '.' ? first : last);
          const own = glue.startsWith('bare') ? twin : parentheses && twin.length === 10 ? `(${twin.slice(0, 3)}) ${twin.slice(3, 6)}${last}${twin.slice(6)}` : joined;
          const other = shaped(second, '-', '-');
          const [left, right] = {
            'amount after': ['', amount],
            'amounts after': ['', `${amount}-${amountAfter}`],
            'bare, an amount after': ['', amount],
            'bare, amounts after': ['', `${amount}-${amountAfter}`],
            'date after': ['', date],
            'number after': ['', other],
            'amount before': [amount, ''],
            'date before': [date, ''],
            // A bare number glued before the shape is as often a reference's own first digits ("20260115-12-3456"): not read.
            'number before': [other, ''],
            'amounts on both sides': [amount, amountAfter],
          }[glue];
          const letter = `${before}${left ?? ''}${own}${right ?? ''}${after}`;
          const sent = sentOrRefused(letter, JANE, JANE_CLAIMS);
          if (sent !== REFUSED) {
            expect(digitsLeftInARow(letter, before.length + (left ?? '').length, own.length, JANE, JANE_CLAIMS), `${JSON.stringify(letter)} -> ${JSON.stringify(sent)}`).toBeLessThan(4);
          }
        },
      ),
      { numRuns: 300 },
    );
  }, 60_000);

  // ---------------------------------------------------------------------------------------------------
  // The three shapes MOD-16's generator no longer writes (redact.property.test.ts, keptLetter), each on both sides: in a
  // held letter refused; the same content with the range not glued (no held letter) sent unchanged. The patient and the
  // letters are MOD-16's own.

  const MOD16 = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042']);
  const MOD16_CLAIMS = claimsOf('SYNCLAIM0001');
  /** MOD-16's CI counterexample, a held letter, and the same letter with the period set apart from the next word. */
  const GLUED = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00';
  const APART = 'Paid $0,000.00. Service 01/01/2020-01/02/2020 Paid $0,000.00';

  it('MOD-16, change 1: an unlabeled local number is refused in a letter with a held period, and sent in the same letter with the period not glued', () => {
    for (const join of ['. ', '\n', '; ']) {
      expectOutcome(`${GLUED}${join}Hours 8:00-5:00, 555-0100 local`, REFUSED, MOD16, MOD16_CLAIMS);
      expectOutcome(`${APART}${join}Hours 8:00-5:00, 555-0100 local`, `${APART}${join}Hours 8:00-5:00, 555-0100 local`, MOD16, MOD16_CLAIMS);
      // What the generator writes now in a letter with a period or range: the same segment without the number.
      expectOutcome(`${GLUED}${join}Hours 8:00-5:00`, `${GLUED}${join}Hours 8:00-5:00`, MOD16, MOD16_CLAIMS);
    }
    expectOutcome(`Hours 8:00-5:00, 555-0100 local; ${GLUED}`, REFUSED, MOD16, MOD16_CLAIMS);
    expectOutcome(`Hours 8:00-5:00, 555-0100 local; ${APART}`, `Hours 8:00-5:00, 555-0100 local; ${APART}`, MOD16, MOD16_CLAIMS);
    // A range of a date and an amount is held with nothing glued to it.
    expectOutcome('Service 01/01/2020-150.00; Hours 8:00-5:00, 555-0100 local', REFUSED, MOD16, MOD16_CLAIMS);
    expectOutcome('Service 01/01/2020-150.00; Hours 8:00-5:00', 'Service 01/01/2020-150.00; Hours 8:00-5:00', MOD16, MOD16_CLAIMS);
  });

  it.each([
    // A range's own end glued to the word, in a held letter; with a space written, the noun names the number again.
    ['Paid $0,000.00. Service 01/01/2020-11/02/2026Ref. No. 2025550123', 'Paid $0,000.00. Service 01/01/2020-11/02/2026 Ref. No. 2025550123'],
    ['Seen 01/01/2020-150.00NPI 1234567893', 'Seen 01/01/2020-150.00 NPI 1234567893'],
    ['Seen 01/01/2020-150.00check 123456789', 'Seen 01/01/2020-150.00 check 123456789'],
    ['Seen 01/01/2020-150.00Claim number 123456789', 'Seen 01/01/2020-150.00 Claim number 123456789'],
    // A date glued to the word is such an end where only the range fix reads it: one with its month as a word, and a
    // numeric one after an amount's cents and a full stop (MOD-16's generator, global seed 1034253323 of the stress run).
    ['Appeal by November 22, 2022trace 1495606933\nService 03/17/2027-805.80St. Mary', 'Appeal by November 22, 2022 trace 1495606933\nService 03/17/2027-805.80St. Mary'],
    ['Billed March 13, 2029\u20132029-10-01Rd. 9. Amount 02-20-2028Authorization 7128561863', 'Billed March 13, 2029\u20132029-10-01Rd. 9. Amount 02-20-2028 Authorization 7128561863'],
  ])('MOD-16, change 2: a word glued to a range’s end and then a bare nine or ten is refused in a held letter, and sent with a space written: %j', (glued, apart) => {
    expectOutcome(glued, REFUSED, MOD16, MOD16_CLAIMS);
    expectOutcome(apart, apart, MOD16, MOD16_CLAIMS);
  });

  it('MOD-16, change 2: the same word and number glued to a range’s end are sent where no range is held, and a date written year first is no such end', () => {
    for (const letter of ['Service 01/01/2020-01/02/2020NPI 1234567893', 'Appeal by November 22, 2022trace 1495606933', 'Amount 02-20-2028Authorization 7128561863', 'Seen 01/01/2020-150.00. Appeal by 2026-11-01NPI 1234567893']) {
      expectOutcome(letter, letter, MOD16, MOD16_CLAIMS);
    }
  });

  it.each([
    // The date of birth (1980-03-14) with a two-digit year, run together, at the start or the end of a longer run of digits.
    ['ICN 80314567890'],
    ['check 2221180314'],
    ['Billed 20280314\n5'],
    ['ZIP 80314'],
    ['EFT 1438012345'],
    ['Paid 31480.00'],
    ['Seen 38014 units'],
    ['Seen 80143'],
    ['Seen 14803'],
  ])('MOD-16, change 3: a run of digits that begins or ends with the date of birth run together is refused in a held letter, and sent with the period not glued: %j', (kept) => {
    expectOutcome(`${GLUED}. ${kept}`, REFUSED, MOD16, MOD16_CLAIMS);
    expectOutcome(`${APART}. ${kept}`, `${APART}. ${kept}`, MOD16, MOD16_CLAIMS);
  });

  it('MOD-16, change 3: the date of birth’s digits in the middle of a run, and four digits that are no run of its own, stay in a held letter', () => {
    for (const kept of ['ICN 22803144567', 'Seen 8031', 'CA 98031-4567', 'Seen 03/14/2026']) {
      expectOutcome(`${GLUED}. ${kept}`, `${GLUED}. ${kept}`, MOD16, MOD16_CLAIMS);
    }
  });
});

describe("MOD-22: the call's own identifiers written with look-alikes or a digit for a letter are redacted or refused", () => {
  /** A second patient for the digit-for-letter rows: a name of plain letters, and a member ID of digits alone. */
  const SIMONE = patientOf(['SIMONE Q VANTREE'], ['1975-11-02'], ['SYNMEMBER0042', '76543210']);
  const SIMONE_CLAIMS = claimsOf('SYNCLAIM0001');

  // ZEPHYRA with Cyrillic IE, ER, EN and A; with Greek zeta, epsilon, rho, eta, upsilon and alpha (its R is Latin: Greek has
  // none that looks like it); and in small capitals.
  const CYRILLIC = 'Z\u0415\u0420\u041DYR\u0410';
  const GREEK = '\u0396\u0395\u03A1\u0397\u03A5R\u0391';
  const SMALL_CAPITALS = '\u1D22\u1D07\u1D18\u029C\u028F\u0280\u1D00';

  it.each([
    ['Cyrillic letters', CYRILLIC],
    ['Greek letters', GREEK],
    ['small capitals', SMALL_CAPITALS],
    ['one Cyrillic small a at its end', 'Zephyr\u0430'],
    ['one Greek small upsilon for its y, which looks like "u" and whose capital looks like "Y"', 'Zeph\u03C5ra'],
  ])('redacts the name written with %s (%j) as a word of its own, in a held letter too, and refuses it glued to a digit', (_what, written) => {
    expect(sentOrRefused(`Dear ${written}, your claim`, JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused(`${HELD}Patient: ${written}`, JANE, JANE_CLAIMS)).toBe(`${HELD}Patient: [PATIENT_NAME]`);
    expect(sentOrRefused(`Seen 2020${written} today`, JANE, JANE_CLAIMS)).toBe(REFUSED);
    expect(sentOrRefused(`Seen ${written}2020 today`, JANE, JANE_CLAIMS)).toBe(REFUSED);
  });

  it('redacts a name’s pieces joined by a middle dot or a hyphenation point as the name', () => {
    expect(sentOrRefused('Dear Zeph\u00B7yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Zeph\u2027yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Ja\u00B7ne Zeph\u2027y\u2027ra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME], your claim');
    // The bullet, the bullet operator and the dot operator join a name's pieces too; a full stop does since MOD-23.
    expect(sentOrRefused('Dear Zeph\u2022yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Zeph\u2219yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Zeph.yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
  });

  it('redacts a name stored in Greek in either case, and written with the Latin letters it looks like: both cases of a letter fold to one thing', () => {
    // "Zephyra Vantri" in Greek small letters with accents, as stored; in the letter, in capitals after "Dear" in Greek.
    const greek = patientOf(['\u0396\u03AD\u03C6\u03C5\u03C1\u03B1 \u0392\u03AC\u03BD\u03C4\u03C1\u03B7']);
    const dear = '\u0391\u03B3\u03B1\u03C0\u03B7\u03C4\u03AE';
    const capitals = '\u0396\u0395\u03A6\u03A5\u03A1\u0391 \u0392\u0391\u039D\u03A4\u03A1\u0397';
    expect(sentOrRefused(`${dear} ${capitals}, your claim`, greek, claimsOf('SYNCLAIM0001'))).toBe(`${dear} [PATIENT_NAME], your claim`);
    expect(sentOrRefused(`${dear} \u0396\u03AD\u03C6\u03C5\u03C1\u03B1 \u0392\u03AC\u03BD\u03C4\u03C1\u03B7, your claim`, greek, claimsOf('SYNCLAIM0001'))).toBe(`${dear} [PATIENT_NAME], your claim`);
    // Latin Z, E, Y, P, A, B, N, T and H with the Greek phi no Latin letter looks like.
    expect(sentOrRefused('Dear ZE\u03A6YPA BANTPH, your claim', greek, claimsOf('SYNCLAIM0001'))).toBe('Dear [PATIENT_NAME], your claim');
  });

  it('redacts the call’s own number written in another script’s digits or with a look-alike letter, and refuses the name glued to another script’s digit', () => {
    // SYNMEMBER0042 with its digits Arabic-Indic, then Devanagari; ZZ7654321 likewise; SYNMEMBER0042 with a Cyrillic DZE for its S.
    expect(sentOrRefused('Member SYNMEMBER\u0660\u0660\u0664\u0662 on file', JANE, JANE_CLAIMS)).toBe('Member [MEMBER_ID] on file');
    expect(sentOrRefused('Member SYNMEMBER\u0966\u0966\u096A\u0968 on file', JANE, JANE_CLAIMS)).toBe('Member [MEMBER_ID] on file');
    expect(sentOrRefused('Member ZZ\u0667\u0666\u0665\u0664\u0663\u0662\u0661 on file', JANE, JANE_CLAIMS)).toBe('Member [MEMBER_ID] on file');
    expect(sentOrRefused('Member ZZ\u096D\u096C\u096B\u096A\u0969\u0968\u0967 on file', JANE, JANE_CLAIMS)).toBe('Member [MEMBER_ID] on file');
    expect(sentOrRefused('Member \u0405YNMEMBER0042 on file', JANE, JANE_CLAIMS)).toBe('Member [MEMBER_ID] on file');
    // The Arabic-Indic digit one looks like "I" to the confusables data and is a digit to the reader: the name glued to a digit.
    expect(sentOrRefused('Seen \u0661ZEPHYRA today', JANE, JANE_CLAIMS)).toBe(REFUSED);
    expect(sentOrRefused('Seen 1ZEPHYRA today', JANE, JANE_CLAIMS)).toBe(REFUSED);
  });

  // A digit for a letter or a letter for a digit, as a scan or an eye takes one for the other: O/0, l/1, I/1, S/5, B/8, E/3.
  it.each([
    ['S1MONE', '[PATIENT_NAME]'],
    ['SIM0NE', '[PATIENT_NAME]'],
    ['5IMONE', '[PATIENT_NAME]'],
    ['Sim0ne', '[PATIENT_NAME]'],
    ['VANTR3E', '[PATIENT_NAME]'],
    ['SYNMEMBERO042', '[MEMBER_ID]'],
    ['SYNMEMB3R0042', '[MEMBER_ID]'],
    ['7654321O', '[MEMBER_ID]'],
    ['765432I0', '[MEMBER_ID]'],
    ['SYNCLA1M0001', '[CLAIM_1]'],
  ])('redacts %s, the call’s own identifier with a digit for a letter or a letter for a digit, as a word of its own: %s', (written, placeholder) => {
    expect(sentOrRefused(`Re: ${written} on file.`, SIMONE, SIMONE_CLAIMS)).toBe(`Re: ${placeholder} on file.`);
    expect(sentOrRefused(`${HELD}Re: ${written} on file.`, SIMONE, SIMONE_CLAIMS)).toBe(`${HELD}Re: ${placeholder} on file.`);
  });

  it.each([
    ['ZZ765432l', '[MEMBER_ID]'],
    ['C2O26000417', '[CLAIM_2]'],
    ['Z3PHYRA', '[PATIENT_NAME]'],
  ])('redacts %s for a patient with two claims, each number as its own placeholder: %s', (written, placeholder) => {
    expect(sentOrRefused(`Re: ${written} on file.`, JANE, JANE_CLAIMS)).toBe(`Re: ${placeholder} on file.`);
  });

  it('redacts both parts of a name written so, and refuses such a form glued inside a longer run of letters and digits', () => {
    expect(sentOrRefused('Patient: S1MONE VANTR3E', SIMONE, SIMONE_CLAIMS)).toBe('Patient: [PATIENT_NAME] [PATIENT_NAME]');
    for (const letter of ['Seen 2020S1MONE today', 'PaidVANTR3E in full', 'Dear S1MONES, your claim', 'Re: SYNMEMBERO042150 on file.']) {
      expect(sentOrRefused(letter, SIMONE, SIMONE_CLAIMS), letter).toBe(REFUSED);
    }
  });

  it('never reads a letter for a letter, digits alone for a name, or a form fewer than half of whose characters are its own', () => {
    // "well" is no WEIL, "ella" no ELIA and "Hello" no HELIO: an l for an I is a letter for a letter.
    expect(sentOrRefused('We hope you are well.', patientOf(['ZEPHYRA WEIL']), claimsOf('SYNCLAIM0001'))).toBe('We hope you are well.');
    expect(sentOrRefused('Dear ella, your claim', patientOf(['ELIA VANTREE']), claimsOf('SYNCLAIM0001'))).toBe('Dear ella, your claim');
    expect(sentOrRefused('Hello, your claim', patientOf(['HELIO VANTREE']), claimsOf('SYNCLAIM0001'))).toBe('Hello, your claim');
    expect(sentOrRefused('Dear SlMONE, your claim', SIMONE, SIMONE_CLAIMS)).toBe('Dear SlMONE, your claim');
    // Four of SIMONE's six letters written as digits: fewer than half are its own.
    expect(sentOrRefused('Dear 51M0N3, your claim', SIMONE, SIMONE_CLAIMS)).toBe('Dear 51M0N3, your claim');
    // A pair beyond the six (A/4) is not read: recorded.
    expect(sentOrRefused('Dear V4NTREE, your claim', SIMONE, SIMONE_CLAIMS)).toBe('Dear V4NTREE, your claim');
  });

  // Codes stay for patients built to be close to them: a form of under four characters is not read so, nor a number of
  // digits alone under six, nor digits alone for a name; and a code of one letter and digits never has half a name's letters.
  it.each([
    ['ELI VANTREE', [], 'Diagnosis E11.9 and E11.65 on file'],
    ['BOB VANTREE', [], 'Paid 808.00 in full, Rev 0808'],
    ['JANE Q ZEPHYRA', ['5510'], 'Diagnosis S5100 on file'],
    ['LEO BOSS', [], 'Seen 8055, paid 8055.00'],
    ['SOBEL VANTREE', [], 'HCPCS S0831 denied'],
    ['JANE Q ZEPHYRA', ['S0810'], 'Code 50810 denied'],
  ] as const)('keeps a code for a patient built to be close to it: %s, claim numbers %j, %j', (name, claimNumbers, letter) => {
    expect(sentOrRefused(letter, patientOf([name]), claimsOf('SYNCLAIM0001', ...claimNumbers))).toBe(letter);
  });

  // Ruling B: a month word that is a name part is a date's month only in a date with two numbers or more (a day and a
  // year). "May 2020" and "June 103" read as a day and a year run together to the date reader: they are the name.
  it.each([
    ['MAY ZEPHYRA', 'Seen May 2020 for therapy', 'Seen [PATIENT_NAME] 2020 for therapy'],
    ['MAY ZEPHYRA', 'Appeal by May 5, 2026.', 'Appeal by May 5, 2026.'],
    ['MAY ZEPHYRA', 'Seen 3 May 2026 for therapy', 'Seen 3 May 2026 for therapy'],
    ['JUNE VANTREE', 'Seen June 103 for therapy', 'Seen [PATIENT_NAME] 103 for therapy'],
    ['JUNE VANTREE', 'Seen 3 June 2026 for therapy', 'Seen 3 June 2026 for therapy'],
    ['JUNE VANTREE', 'Appeal by June 5, 2026.', 'Appeal by June 5, 2026.'],
  ])('ruling B: for %s, %j is sent as %j', (name, letter, sent) => {
    expect(sentOrRefused(letter, patientOf([name], ['1961-03-03'], ['ZZ1234567']), claimsOf('SYNCLAIM0001'))).toBe(sent);
  });

  // The date of birth in writings no rule reads: refused in a held letter, where cc3dd7f6 refused every letter, and in a
  // letter with no held range what they were (recorded: sent).
  it.each([
    ['1980-03-14', 'a Roman-numeral month, day first', '14-III-1980'],
    ['1980-03-14', 'a Roman-numeral month, month first', 'III/14/1980'],
    ['1980-03-14', 'the CJK date characters', '1980\u5E743\u670814\u65E5'],
    ['1975-11-02', 'its year in words after its month’s word', 'November second, nineteen seventy-five'],
    ['1980-03-14', 'its month’s word and its day, no year after them', 'Mar 14th'],
    ['1980-03-14', 'its month’s word, "the" and its day', 'March the 14th'],
    ['1980-03-14', 'its day, "of" and its month’s word', '14th of March'],
    ['1980-03-14', 'its two-digit year, month and day run together', '80314'],
    ['1980-03-14', 'the same at the end of a longer run of digits', '20280314'],
    ['1980-03-14', 'the same at the start of a longer run of digits', 'ICN 80314567890'],
  ])('refuses the date of birth %s written as %s (%j) in a held letter, and sends it as it was in any other', (dateOfBirth, _what, written) => {
    const patient = patientOf(['JANE Q ZEPHYRA'], [dateOfBirth]);
    for (const frame of HELD_FRAMES) {
      expect(sentOrRefused(`${frame}${written}`, patient, claimsOf('SYNCLAIM0001')), frame).toBe(REFUSED);
    }
    expect(sentOrRefused(written, patient, claimsOf('SYNCLAIM0001'))).toBe(written);
  });

  it('redacts a run of nine digits that ends with the date of birth run together as the Social Security number it is to the patterns, held letter or not', () => {
    // The patterns read a bare nine before the check does: its digits, the date of birth's among them, are not sent.
    expect(sentOrRefused(`${HELD}202080314`, JANE, JANE_CLAIMS)).toBe(`${HELD}[SSN]`);
    expect(sentOrRefused('Seen 202080314 on file', JANE, JANE_CLAIMS)).toBe('Seen [SSN] on file');
  });

  it.each([
    ['1980-03-14', 'a date of another year on the same day', 'March 14, 2026'],
    ['1980-03-14', 'a word that ends in its month’s word', 'Lamar 14th'],
    ['2004-05-06', 'a number in words that is no year', 'You must respond within twenty-four hours.'],
    ['2020-02-02', 'four digits that read as a year', '2022'],
  ])('keeps, beside a held range, what is no date of birth %s: %s (%j)', (dateOfBirth, _what, written) => {
    const patient = patientOf(['JANE Q ZEPHYRA'], [dateOfBirth]);
    for (const frame of HELD_FRAMES) {
      expect(sentOrRefused(`${frame}${written}`, patient, claimsOf('SYNCLAIM0001')), frame).toBe(`${frame}${written}`);
    }
  });

  /** One patient for the property: each kind of identifier, a name part of five letters, a member ID of digits alone, two claims. */
  const OWNER = patientOf(['SIMONE BELLO VANTREE'], ['1975-11-02'], ['SYNMEMBER0042', 'ZZ7654321', '76543210']);
  const OWNER_CLAIMS = claimsOf('SYNCLAIM0001', 'C2026000417');
  const OWN: readonly (readonly [string, string])[] = [
    ['SIMONE', '[PATIENT_NAME]'],
    ['BELLO', '[PATIENT_NAME]'],
    ['VANTREE', '[PATIENT_NAME]'],
    ['SYNMEMBER0042', '[MEMBER_ID]'],
    ['ZZ7654321', '[MEMBER_ID]'],
    ['76543210', '[MEMBER_ID]'],
    ['SYNCLAIM0001', '[CLAIM_1]'],
    ['C2026000417', '[CLAIM_2]'],
  ];
  /** The six pairs, as a scan writes one for the other: a digit for a letter, and a letter for a digit (a small l or a capital I for 1). */
  const DIGIT_FOR: Readonly<Record<string, readonly string[]>> = { O: ['0'], I: ['1'], L: ['1'], S: ['5'], B: ['8'], E: ['3'] };
  const LETTER_FOR: Readonly<Record<string, readonly string[]>> = { '0': ['O'], '1': ['I', 'l'], '5': ['S'], '8': ['B'], '3': ['E'] };

  it('never sends in clear an own identifier written with one to three digits for letters or letters for digits: alone it is its placeholder, glued to a word it is refused (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          which: fc.nat(OWN.length - 1),
          count: fc.integer({ min: 1, max: 3 }),
          picks: fc.array(fc.nat(10_000), { minLength: 4, maxLength: 4 }),
          style: fc.constantFrom('upper', 'title', 'lower'),
          glued: fc.constantFrom('alone', 'alone', 'a word before', 'a word after', 'a number before', 'a number after'),
          word: fc.constantFrom('Paid', 'Seen', 'th', 'Ref', 'x', 'CLAIM'),
          number: fc.constantFrom('2020', '7', '150', '00', '97110'),
        }),
        ({ which, count, picks, style, glued, word, number }) => {
          const [value, placeholder] = OWN[which] ?? ['SIMONE', '[PATIENT_NAME]'];
          const letters = [...value];
          // A name is written in any case; a number as it is stored.
          const written = placeholder !== '[PATIENT_NAME]' || style === 'upper' ? [...value] : style === 'lower' ? [...value.toLowerCase()] : [...value].map((letter, i) => (i === 0 ? letter : letter.toLowerCase()));
          // Where a pair applies; at most half of the characters change, so half or more stay the form's own.
          const open = letters.flatMap((letter, i) => (DIGIT_FOR[letter] !== undefined || LETTER_FOR[letter] !== undefined ? [i] : []));
          const changes = Math.min(count, Math.floor(letters.length / 2), open.length);
          for (let change = 0; change < changes; change += 1) {
            const [at] = open.splice((picks[change] ?? 0) % open.length, 1);
            const options = DIGIT_FOR[letters[at ?? 0] ?? ''] ?? LETTER_FOR[letters[at ?? 0] ?? ''] ?? [];
            written[at ?? 0] = options[(picks[3] ?? 0) % options.length] ?? '';
          }
          const token = written.join('');
          // Each change crosses from letter to digit or back, and a letter is left: never the form itself, never digits alone.
          expect(token.toUpperCase()).not.toBe(value);
          expect(token).toMatch(/\p{L}/u);
          const text = { alone: token, 'a word before': `${word}${token}`, 'a word after': `${token}${word}`, 'a number before': `${number}${token}`, 'a number after': `${token}${number}` }[glued];
          const letter = `Re: ${text} on file.`;
          const sent = sentOrRefused(letter, OWNER, OWNER_CLAIMS);
          if (glued === 'alone') {
            expect(sent, letter).toBe(`Re: ${placeholder} on file.`);
          } else if (glued === 'a word before' || glued === 'a word after') {
            expect(sent, letter).toBe(REFUSED);
          } else if (sent !== REFUSED) {
            // Glued to a number, its digits may be taken with the number's as an SSN or phone by the patterns (a redaction):
            // what is sent then never holds the identifier as written.
            expect(sent.includes(token), `${letter} -> ${sent}`).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  }, 60_000);
});

// These forms are sent in clear by cc3dd7f6 and ef3e8d20 too; the kept script
// designs/lane-b-redact-ssn-phone/gate/leaks-scripts/name-forms.mts on claude/build-ops reproduces them on any tree.
describe('MOD-23: a name with a space or a period anywhere inside a part, a number as the records hold it, and a CR LF read as one line ending', () => {
  const patient = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042']);
  const claims = claimsOf('SYNCLAIM0001');

  // The base (f3f5a642) sent each of these in clear in a letter with no held range, and refused the held letter. The
  // wider reading redacts the name; the held letter, which the first reading's check refuses, stays as it was: refused.
  it.each([
    ['a part split by a space, its second piece in small letters', 'Dear Zephy ra, your claim'],
    ['a part split by a full stop and a space', 'Dear Zephy. ra, your claim'],
    ['a part split by a full stop', 'Dear Zeph.yra, your claim'],
    ['each letter of the name alone, in small letters after the first', 'Dear Z e p h y r a, your claim'],
    ['each letter of the name alone, in capitals', 'Dear Z E P H Y R A, your claim'],
    ['each letter of the name alone, a full stop after each', 'Dear Z. e. p. h. y. r. a, your claim'],
    ['its first letter alone', 'Dear Z ephyra, your claim'],
    ['its last letter alone, on the next line', 'Dear Zephyr\r\na, your claim'],
    ['a look-alike letter and a small piece after a space', 'Dear Zеphy ra, your claim'],
  ])('redacts the name written as %s, and refuses it in a held letter as before: %j', (_what, letter) => {
    expect(sentOrRefused(letter, patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
    expect(redactLetter(letter, patient, claims).text).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused(`${HELD}${letter}`, patient, claims)).toBe(REFUSED);
  });

  it('takes an initial beside a name read so, and both parts written so', () => {
    expect(sentOrRefused('Dear J. Zephy ra, your claim', patient, claims)).toBe('Dear [PATIENT_NAME]. [PATIENT_NAME], your claim');
    // Two words of the three the records hold are two names, as "Jane Zephyra" is; all three are the whole name.
    expect(sentOrRefused('Dear Ja ne Zephy ra, your claim', patient, claims)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Jane Zephyra, your claim', patient, claims)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Ja ne Q Zephy ra, your claim', patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
  });

  it('refuses a text that still holds such a form: the check reads what redaction reads', () => {
    expect(holdsIdentifier('Dear [PATIENT_NAME], re Zephy ra', patient, claims)).toBe(true);
    expect(holdsIdentifier('Dear [PATIENT_NAME], re Z e p h y r a', patient, claims)).toBe(true);
    expect(holdsIdentifier('Dear [PATIENT_NAME], your claim', patient, claims)).toBe(false);
  });

  // The cost that stays, recorded in ADR 0054: the words whose letters are a part of the patient's name are replaced
  // wherever a space or a period alone sets them apart. Two words of a letter, never the letter.
  it.each([
    ['INA VANTREE', 'Records in a timely manner.', 'Records [PATIENT_NAME] timely manner.'],
    ['ISA VANTREE', 'This is a request for records.', 'This [PATIENT_NAME] request for records.'],
    ['ASA VANTREE', 'Resubmit it as a new claim.', 'Resubmit it [PATIENT_NAME] new claim.'],
    ['TOBE ZEPHYRA', 'It was sent to be reviewed.', 'It was sent [PATIENT_NAME] reviewed.'],
    ['BOB XU', 'Paid for Bo b today.', 'Paid for [PATIENT_NAME] today.'],
  ])('records the cost: for %s, %j is sent as %j', (name, letter, sent) => {
    expect(sentOrRefused(letter, patientOf([name]), claims)).toBe(sent);
  });

  it('leaves ordinary words whose letters are no part of the name, and a name split by a comma or a slash', () => {
    for (const name of ['NEWMAN VANTREE', 'UNDERWOOD ZEPHYRA', 'ANA VANTREE']) {
      const letter = 'Records in a timely manner. This is a new claim under review. Resubmit it as a new claim.';
      expect(sentOrRefused(letter, patientOf([name]), claims)).toBe(letter);
    }
    // Sent as written until Queues item 34 (MOD-25, A-4), whose run of marks joins inside a part: an accepted cost, a placeholder.
    expect(sentOrRefused('New, man. Under/wood.', patientOf(['NEWMAN UNDERWOOD']), claims)).toBe('[PATIENT_NAME].');
  });

  it('leaves the narrative’s reading as it was: there a part split so is no name', () => {
    const identifiers = { names: ['JANE Q ZEPHYRA', 'INA VANTREE'], numbers: ['ZZ12345/01'] };
    expect(holdsNameOrNumber('The plan paid in a timely manner for Zephy ra.', identifiers)).toBe(false);
    expect(holdsNameOrNumber('The plan paid for Z e p h y r a.', identifiers)).toBe(false);
  });

  // P6: a stored number is read as the records hold it. The base left each of these as written.
  it.each(['/', '.', ',', '+', ' / ', '&', '*'])('redacts a member ID held with %j between two digits, written as held', (separator) => {
    const held = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], [`ZZ12345${separator}01`]);
    expect(sentOrRefused(`The member ZZ12345${separator}01 was paid short.`, held, claims)).toBe('The member [MEMBER_ID] was paid short.');
    expect(sentOrRefused(`Member ID: ZZ12345${separator}01 was paid short.`, held, claims)).toBe('Member ID: [MEMBER_ID] was paid short.');
    expect(sentOrRefused('The member ZZ12345-01 was paid short.', held, claims)).toBe('The member [MEMBER_ID] was paid short.');
    // The separator joins where the records write it, and nowhere else.
    expect(sentOrRefused(`The member ZZ${separator}1234501 was paid short.`, held, claims)).toBe(['/', '.', ' / '].includes(separator) ? 'The member [MEMBER_ID] was paid short.' : `The member ZZ${separator}1234501 was paid short.`);
    expect(holdsIdentifier(`The member ZZ12345${separator}01 was paid short.`, held, claims)).toBe(true);
  });

  it('redacts a claim number of digits held with a period or a slash where no label stands before it, and keeps what is no writing of it', () => {
    expect(sentOrRefused('Paid $1,234.56 for 1234.56 units', patient, claimsOf('1234.56'))).toBe('Paid $1,234.56 for [CLAIM_1] units');
    expect(sentOrRefused('Denied: 1234/56 was a duplicate.', patient, claimsOf('1234/56'))).toBe('Denied: [CLAIM_1] was a duplicate.');
    // An amount after a currency sign and with cents, and a whole written date with no label, stay as the first reading keeps them.
    expect(sentOrRefused('Paid $2026.00 on the claim', patient, claimsOf('2026.00123'))).toBe('Paid $2026.00 on the claim');
    expect(sentOrRefused('Seen 2026/03/05 and paid', patient, claimsOf('2026/03/05'))).toBe('Seen 2026/03/05 and paid');
    // Recorded here until Queues item 34, which closed it (MOD-25, rule (c)): one piece of a number held in two, of five characters or more, is the number's.
    expect(sentOrRefused('The member ZZ12345 was paid', patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345 01']), claims)).toBe('The member [MEMBER_ID] was paid');
  });

  // K-1: every letter of the review's file whose writing with LF is refused is refused with CR LF too.
  it.each([
    'SSN on file. Statement\nNo. 900-12-3456150.00',
    'SSN: see Member\nID Number: 900-12-3456150.00',
    'SSN verified. Provider\nNo. 90012345601/02/2020',
    'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\nNo. 900-12-345678',
    'Dear Jane Zephyra,\nSSN on file. Statement\nNo. 900-12-3456150.00\nThank you.',
    'SSN verified. Account No. \n900-12-3456150.00',
    'SSN verified. Account \nNo. 900-12-345678',
  ])('K-1: refuses %j, and the same letter written with CR LF', (letter) => {
    expect(sentOrRefused(letter, JANE, JANE_CLAIMS)).toBe(REFUSED);
    expect(sentOrRefused(letter.replaceAll('\n', '\r\n'), JANE, JANE_CLAIMS)).toBe(REFUSED);
  });

  it('K-1: sends a CR LF letter that neither writing refuses as it is written, and keeps what it redacts', () => {
    expect(sentOrRefused('Dear Jane Zephyra,\r\nYour claim SYNCLAIM0001 was paid.\r\nThank you.', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME],\r\nYour claim [CLAIM_1] was paid.\r\nThank you.');
    expect(sentOrRefused('SSN of the insured party\r\n900 12 3456', JANE, JANE_CLAIMS)).toBe('SSN of the insured party\r\n[SSN]');
    // One character further the label is out of reach in either writing: the recorded residual, unchanged.
    expect(sentOrRefused('SSN on file.  Statement\r\nNo. 900-12-3456150.00', JANE, JANE_CLAIMS)).toBe('SSN on file.  Statement\r\nNo. 900-12-3456150.00');
  });

  // MOD-23 on the check's work budget (docs/adr/0054, amendment of 2026-11-12, "item 26's readings on the counter"). A
  // wider match is applied only after the first reading's check has read the letter the first reading wrote once more,
  // twice where it holds a CR LF, and the check itself reads a CR LF letter in both writings. Each of those readings
  // counts its work on the letter's one counter (CHECK_WORK_BUDGET), charged as the first is; a letter they take past
  // the budget is refused: by a count, never by a clock, so a letter has one answer on every machine and run.
  describe('the wider reading and the second reading on the check’s work budget', () => {
    const LONG = { timeout: 60_000 };
    const FILL = 'paid in full. ';
    /** A letter of exactly `length` characters: words no reading takes, `middle`, then the name with a part written apart. */
    const padded = (length: number, middle = '') => {
      const tail = `${middle} Dear Zephy ra,`;
      return `${FILL.repeat(Math.ceil(length / FILL.length)).slice(0, length - tail.length)}${tail}`;
    };
    /** The path prepare runs: the redaction, then the check with the work the redaction spent. */
    const screenPath = (letter: string, who: PatientIdentifiers = patient, numbers: readonly LetterClaim[] = claims) => {
      const screened = redactLetterForScreen(letter, who, numbers);
      return holdsIdentifier(screened.text, who, numbers, checkWorkOf(screened)) ? REFUSED : screened.text;
    };
    /** The reading without the screen: redactLetter, then the check from nothing. */
    const letterPath = (letter: string) => {
      const sent = redactLetter(letter, patient, claims).text;
      return holdsIdentifier(sent, patient, claims) ? REFUSED : sent;
    };
    const applied = (letter: string) => `${letter.slice(0, -'Zephy ra,'.length)}[PATIENT_NAME],`;
    /** One digit to a line: the dearest text the reader reads, per character. */
    const DEAR = '5\n'.repeat(100_000);

    it('reads a letter with a name written apart within the budget, and refuses the same letter past it', LONG, () => {
      const within = padded(100_000);
      expect(screenPath(within)).toBe(applied(within));
      expect(letterPath(within)).toBe(applied(within));
      // Twice as long, the redaction (two readings and the check between them) still ends within the budget and applies
      // the wider match; the check, counting on from there, is past it and refuses.
      const over = padded(200_000);
      const screened = redactLetterForScreen(over, patient, claims);
      expect(screened.text).toBe(applied(over));
      expect(checkWorkOf(screened)).toBeLessThanOrEqual(CHECK_WORK_BUDGET);
      expect(holdsIdentifier(screened.text, patient, claims, checkWorkOf(screened))).toBe(true);
      // Three times as long, the redaction itself is past it: not one character of the letter comes back.
      const far = redactLetterForScreen(padded(300_000), patient, claims);
      expect(far).toMatchObject({ text: '\u0001', replaced: 0, candidates: [] });
      expect(checkWorkOf(far)).toBe(CHECK_WORK_BUDGET + 1);
      expect(screenPath(padded(300_000))).toBe(REFUSED);
    });

    it('charges a CR LF letter for both writings the check reads: it is refused at a length its writing with line feeds is read at', LONG, () => {
      const feeds = padded(150_000, '\nThank you.\n');
      expect(screenPath(feeds)).toBe(applied(feeds));
      expect(screenPath(padded(150_000, '\r\nThank you.\r\n'))).toBe(REFUSED);
      const within = padded(100_000, '\r\nThank you.\r\n');
      expect(screenPath(within)).toBe(applied(within));
    });

    it('charges the second reading of a CR LF letter that holds nothing for the wider reading to apply (K-1), as the first is charged', LONG, () => {
      const lines = (ending: string, length: number) => `${`${FILL}${ending}`.repeat(Math.floor(length / (FILL.length + ending.length)))}Dear Jane Zephyra, your claim SYNCLAIM0001 was paid.`;
      const sentOf = (letter: string) => letter.replace('Jane Zephyra', '[PATIENT_NAME] [PATIENT_NAME]').replace('SYNCLAIM0001', '[CLAIM_1]');
      for (const ending of ['\n', '\r\n']) {
        expect(screenPath(lines(ending, 150_000))).toBe(sentOf(lines(ending, 150_000)));
      }
      // At 200,000 characters the letter of line feeds is read, as on the base; with CR LF line endings the check reads
      // it twice, which is past the budget.
      expect(screenPath(lines('\n', 200_000))).toBe(sentOf(lines('\n', 200_000)));
      expect(screenPath(lines('\r\n', 200_000))).toBe(REFUSED);
    });

    it('returns no text of a letter past the budget with the screen, and without it the first reading’s text with the mark the check refuses', LONG, () => {
      // For a patient VAN VANTREE the first reading takes "Van" of "Van tree" and leaves "tree"; the wider reading joins
      // the two. Past the budget the wider match is not applied: without the mark the first reading's text could be
      // sent with "tree" in clear by a check that found nothing else in it. With it the letter is refused.
      const van = patientOf(['VAN VANTREE']);
      expect(screenPath('Dear Van tree, your claim', van)).toBe('Dear [PATIENT_NAME], your claim');
      const over = `${DEAR}Jane Vantree, member SYNMEMBER0042, claim SYNCLAIM0001, born 03/14/1980. Dear Van tree, your claim`;
      expect(redactLetterForScreen(over, van, claims).text).toBe('\u0001');
      expect(screenPath(over, van)).toBe(REFUSED);
      // redactLetter and redactionSpans run the first reading with no counter, as on the base; what MOD-23 adds counts
      // from nothing, and past the budget they write the first reading's text, every span it replaced replaced, and
      // the mark after it.
      const { text, spans } = redactionSpans(over, van, claims);
      expect(redactLetter(over, van, claims).text).toBe(`${DEAR}Jane [PATIENT_NAME], member [MEMBER_ID], claim [CLAIM_1], born [DATE_OF_BIRTH]. Dear [PATIENT_NAME] tree, your claim\u0001`);
      expect(text).toBe(`${over}\u0001`);
      expect(spans.map((span) => span.placeholder)).toEqual(['[PATIENT_NAME]', '[MEMBER_ID]', '[CLAIM_1]', '[DATE_OF_BIRTH]', '[PATIENT_NAME]']);
      for (const count of [undefined, 0, 1]) {
        expect(holdsIdentifier(redactLetter(over, van, claims).text, van, claims, count)).toBe(true);
      }
    });

    // Review C of item 26's first bound (designs/lane-b-redact-item-26/reviews/c-phi on claude/build-ops): no letter the
    // base refuses sent, nothing it redacts shown. Its three other findings as they stand on the counter, recorded for
    // Queues item 34 and pinned here.
    it('C-PHI-1, recorded: a letter the base sends is refused where MOD-23’s readings take it past the budget', LONG, () => {
      // The base reads this letter of 200,000 characters and sends it with the name written apart in clear.
      const letter = `${FILL.repeat(14_284)} Patient Zephy ra was seen.`;
      expect(letter.length).toBeGreaterThan(200_000);
      expect(screenPath(letter)).toBe(REFUSED);
      const shorter = letter.slice(letter.length - 150_000);
      expect(screenPath(shorter)).toBe(`${shorter.slice(0, -'Zephy ra was seen.'.length)}[PATIENT_NAME] was seen.`);
    });

    it('C-PHI-2, recorded: without the screen, the text of a letter refused by the count is the first reading’s with the mark, the name written apart as the letter writes it', LONG, () => {
      const letter = `${DEAR} Patient Zephy ra was seen.`;
      // With the screen no text comes back at all (the base's own refusal past the budget).
      expect(redactLetterForScreen(letter, patient, claims).text).toBe('\u0001');
      // Without it: the first reading reads no name here, so the text is the letter and the mark. Nothing but the check
      // stands between it and a caller, as for every refused letter.
      expect(redactLetter(letter, patient, claims).text).toBe(`${letter}\u0001`);
      expect(redactionSpans(letter, patient, claims)).toEqual({ text: `${letter}\u0001`, spans: [] });
      expect(letterPath(letter)).toBe(REFUSED);
    });

    it('C-PHI-3, recorded: each path counts its own work, so a letter can be refused by the count with the screen and sent without it', LONG, () => {
      // With the screen one budget holds the redaction's first reading, MOD-23's readings and the check. Without it the
      // first reading runs uncounted, as on the base, MOD-23's readings count from nothing, and the check counts from
      // nothing again: this letter is past the budget on the first path and within it on the second, redacted alike.
      const letter = padded(300_000);
      expect(screenPath(letter)).toBe(REFUSED);
      expect(letterPath(letter)).toBe(applied(letter));
    });

    it('gives a letter the same answer and the same count on every run', LONG, () => {
      for (const letter of [padded(100_000), padded(200_000), padded(300_000), padded(150_000, '\r\nThank you.\r\n')]) {
        const once = redactLetterForScreen(letter, patient, claims);
        const held = holdsIdentifier(once.text, patient, claims, checkWorkOf(once));
        for (let run = 0; run < 2; run += 1) {
          const again = redactLetterForScreen(letter, patient, claims);
          expect(again).toEqual(once);
          expect(checkWorkOf(again)).toBe(checkWorkOf(once));
          expect(holdsIdentifier(again.text, patient, claims, checkWorkOf(again))).toBe(held);
        }
      }
    });

    it.each(HELD_FRAMES)('refuses a letter the first reading refuses, within the budget and past it: %j', LONG, (held) => {
      const short = `${held}Dear Zephy ra,`;
      const within = `${held}${padded(100_000 - held.length)}`;
      const over = `${held}${padded(300_000 - held.length)}`;
      for (const letter of [short, within, over, `${over}\r\n`]) {
        expect(screenPath(letter)).toBe(REFUSED);
        expect(sentOrRefused(letter, patient, claims)).toBe(REFUSED);
        expect(letterPath(letter)).toBe(REFUSED);
      }
    });

    it('refuses every letter past the budget that holds a name written apart, whatever else it holds', LONG, () => {
      const pieces = fc.constantFrom('Your claim was denied. ', 'Service 01/02/2026 ', 'Paid $120.00 ', 'CO-45 ', 'Dear Zephyra, ', 'ref SYNCLAIM0001 ', 'Call 555-0100. ', '\r\n', '\n', 'in a ', 'Zeph. yra ', '1 1 11 ');
      fc.assert(
        fc.property(fc.array(pieces, { minLength: 1, maxLength: 12 }), fc.integer({ min: 1, max: 400 }), (parts, extra) => {
          const letter = `${parts.join('')}${padded(300_000 + extra)}`;
          expect(redactLetterForScreen(letter, patient, claims).text).toBe('\u0001');
          expect(screenPath(letter)).toBe(REFUSED);
        }),
        { numRuns: 15 },
      );
    });
  });

  // The review of the build (review A of co-001/redact-item-26). Each finding on both sides: what is closed, and what stays.
  describe('review A', () => {
    /** The reading without the screen: redactLetter, then the check. */
    const letterPath = (letter: string, who: PatientIdentifiers, numbers: readonly LetterClaim[]) => {
      const sent = redactLetter(letter, who, numbers).text;
      return holdsIdentifier(sent, who, numbers) ? REFUSED : sent;
    };
    const chainTail = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00']);

    it.each([
      ['a claim number held as the amount of the held range', patientOf(['TOBE ZEPHYRA'], ['1988-02-29'], ['SYN 0042 77']), claimsOf('150.00'), 'Service 01/01/2020-150.00 Paid\nSSN on file. Statement\n\nNo. 900-12-345678'],
      ['a member ID held as the end of a chain', chainTail, claims, 'SSN on file. Statement\nNo. 900-12-3456150.00'],
      ['the same after a member ID label', chainTail, claims, 'SSN: see Member\nID Number: 900-12-3456150.00. Date of birth: 03/14/1980'],
      ['the name written apart in a held letter', patient, claims, 'Seen 01/01/2020-150.00Paid in full. Dear Zephy ra, your claim'],
    ] as const)('A-1: a wider match is applied only to a letter the first reading sends, with the screen and without it: %s', (_case, who, numbers, letter) => {
      // The base refused each on both paths; with every wider match applied, the path without the screen sent the first
      // with the Social Security twin whole and the second with five of its digits.
      expect(letterPath(letter, who, numbers)).toBe(REFUSED);
      expect(sentOrRefused(letter, who, numbers)).toBe(REFUSED);
      // No span of the wider reading is among the spans: the text is the first reading's.
      expect(redactionSpans(letter, who, numbers).spans.every((span) => span.placeholder === '[DATE_OF_BIRTH]')).toBe(true);
    });

    it('A-1: in a letter the first reading sends, both paths write the same wider placeholders', () => {
      const letter = 'Dear Zephy ra, your claim SYNCLAIM0001 was paid.';
      expect(letterPath(letter, patient, claims)).toBe('Dear [PATIENT_NAME], your claim [CLAIM_1] was paid.');
      expect(sentOrRefused(letter, patient, claims)).toBe('Dear [PATIENT_NAME], your claim [CLAIM_1] was paid.');
    });

    it('A-2: a CR LF letter whose writing with LF the first reading refuses takes no wider placeholder, and is refused', () => {
      // The base sent it whole; with the member ID's wider placeholder applied first, "No. 900-12-[MEMBER_ID]" went out.
      const letter = 'SSN on file. Statement\r\nNo. 900-12-3456150.00';
      expect(sentOrRefused(letter, chainTail, claims)).toBe(REFUSED);
      expect(letterPath(letter, chainTail, claims)).toBe(REFUSED);
      expect(redactLetter(letter, chainTail, claims).text).toBe(letter);
      expect(sentOrRefused(letter.replace('\r\n', '\n'), chainTail, claims)).toBe(REFUSED);
    });

    it('A-2, recorded: redaction reads a letter as it is written, so a CR LF letter can be sent, with nothing of the call shown, where the redaction of its writing with LF is refused', () => {
      const who = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['3456150.00', '12-3456', '345.678']);
      const numbers = claimsOf('56150', '0123', '1/02/2020', '12/3456');
      const letter = 'ZЕPHYRA, Z\r\n\r\n(202) 555-0123\r\nSeen 01/01/2020-150.00Paid in full. \r\nICN\r\n';
      expect(sentOrRefused(letter, who, numbers)).toBe('[PATIENT_NAME], [PATIENT_NAME]\r\n\r\n[PHONE]\r\nSeen 01/01/2020-150.00Paid in full. \r\nICN\r\n');
      expect(sentOrRefused(letter.replaceAll('\r\n', '\n'), who, numbers)).toBe(REFUSED);
    });

    it.each(['Dear Z e p h y r a900-12-3456, your claim', 'Dear Zephy ra202-555-0123.'])('A-3, the recorded cost: %j, the name written apart and glued to a number that is replaced, is refused', (letter) => {
      // The base sent each with the name in clear beside the placeholder. Redaction reads no name with a digit against
      // it; the check reads the placeholder as a barrier and finds the name.
      expect(sentOrRefused(letter, patient, claims)).toBe(REFUSED);
    });

    it.each(['\u0085', '\u0085 ', ' ', '\f', '\n', '\r\n', '\t', ' '])('A-4: a line break or a space of any kind (%j) inside a part joins it', (between) => {
      expect(sentOrRefused(`Dear Zephy${between}ra, your claim`, patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
    });

    it.each([', ', ': ', '; ', '(', '。', '・', '*', '/'])('A-4, recorded here until Queues item 34 closed it (MOD-25): a part split by %j is the name', (between) => {
      expect(sentOrRefused(`Dear Zephy${between}ra, your claim`, patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
    });

    it.each([
      ['ZZ12345]01', 'The member ZZ12345]01 was paid short.', 'The member [MEMBER_ID] was paid short.'],
      ['ZZ12345[01', 'The member ZZ12345[01 was paid short.', 'The member [MEMBER_ID] was paid short.'],
      ['ZZ[12345]01', 'Member ID: ZZ[12345]01 was paid short.', 'Member ID: [MEMBER_ID] was paid short.'],
    ])('A-5: a member ID held %j with a square bracket is read as held (a letter’s brackets are parentheses by then)', (memberId, letter, sent) => {
      expect(sentOrRefused(letter, patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], [memberId]), claims)).toBe(sent);
    });

    it('A-5, recorded here until Queues item 34 closed it (MOD-25): a stored number written with another separator than the records hold is the number', () => {
      const held = patientOf(['JUNE MARCH'], ['1975-06-01'], ['ZZ12345/01']);
      expect(sentOrRefused('The member ZZ12345.01 was paid short.', held, claims)).toBe('The member [MEMBER_ID] was paid short.');
      expect(sentOrRefused('The member ZZ12345,01 was paid short.', held, claims)).toBe('The member [MEMBER_ID] was paid short.');
    });

    it('A-6: every CR before a line feed is that line ending’s; a line feed before a CR is as written, recorded', () => {
      expect(sentOrRefused('SSN verified. Account \nNo. 900-12-345678', JANE, JANE_CLAIMS)).toBe(REFUSED);
      expect(sentOrRefused('SSN verified. Account \r\nNo. 900-12-345678', JANE, JANE_CLAIMS)).toBe(REFUSED);
      expect(sentOrRefused('SSN verified. Account \r\r\nNo. 900-12-345678', JANE, JANE_CLAIMS)).toBe(REFUSED);
      expect(sentOrRefused('SSN verified. Account \n\rNo. 900-12-345678', JANE, JANE_CLAIMS)).toBe('SSN verified. Account \n\rNo. 900-12-345678');
    });
  });

  // Review B of co-001/redact-item-26 (must-stay): what the wider reading costs beyond two ordinary words, each pinned
  // as it is and recorded in docs/adr/0054 for Queues item 34. Every outcome is the safe side: a placeholder or a refusal.
  describe('review B, the recorded costs', () => {
    const named = (...names: string[]) => patientOf(names);

    it.each([
      ['a name of ordinary words apart between a label and a number', named('INA'), claimsOf('SYNCLAIM0001', '15000'), 'Call in\na\n555-0123', 'Call Ina\n555-0123', 'Call [PATIENT_NAME]\n[PHONE]'],
      ['a name letter by letter between a label and a number', patientOf(['JUNE MARCH', 'J VANTREE'], ['1980-03-14'], ['ZZ7654321']), claimsOf('C2026000417', '76543210'), 'Social Security number of V a n t r e e, 555-0123', 'Social Security number of Vantree, 555-0123', 'Social Security number of [PATIENT_NAME], [SSN]'],
    ] as const)('B-1: %s is refused, where the same letter with the name whole is redacted and sent', (_case, who, numbers, apart, whole, sent) => {
      // The patterns are read before the wider placeholder stands; the check reads the label through it to the number.
      expect(sentOrRefused(apart, who, numbers)).toBe(REFUSED);
      expect(sentOrRefused(whole, who, numbers)).toBe(sent);
    });

    it('B-1: a stored number that takes an amount and the digits after it leaves a number the check refuses', () => {
      expect(sentOrRefused('Units 2026.00 123.45 555-0123', patient, claimsOf('2026.00123'))).toBe(REFUSED);
    });

    it.each([
      [['ORA VANTREE'], 'Submit a corrected claim or a written appeal.', 'Submit a corrected claim [PATIENT_NAME] written appeal.'],
      [['MARCHAND VANTREE'], 'The appeal deadline is 31 March and no extension applies.', 'The appeal deadline is 31 [PATIENT_NAME] no extension applies.'],
      [['ANDRE VANTREE'], 'Please correct the claim and re-submit it within 90 days.', 'Please correct the claim [PATIENT_NAME]-submit it within 90 days.'],
      [['INA G VANTREE'], 'The service was reported in a G-code and denied CO-45.', 'The service was reported [PATIENT_NAME] [PATIENT_NAME]-code and denied CO-45.'],
      [['PO VANTREE'], 'Mail to P.O. Box 1234, Springfield.', 'Mail to [PATIENT_NAME]. Box 1234, Springfield.'],
    ] as const)('B-2, B-3: for a patient %j, %j is sent as %j', (names, letter, sent) => {
      expect(sentOrRefused(letter, named(...names), claims)).toBe(sent);
    });

    it('B-4: a number held with a separator is replaced where an amount or a row writes its digits so', () => {
      expect(sentOrRefused('Paid $1234.56 on 03/14/2026.', patient, claimsOf('1234.56'))).toBe('Paid $[CLAIM_1] on 03/14/2026.');
      expect(sentOrRefused('Line 1  97110  2026.00  123.45', patient, claimsOf('2026.00123'))).toBe('Line 1  97110  [CLAIM_1].45');
      expect(sentOrRefused('Plan ZZ12345/01/15/2026 effective.', patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ12345/01']), claims)).toBe('Plan [MEMBER_ID]/15/2026 effective.');
      // The thousands comma is no writing of the stored number, and a number held with no separator reads as before.
      expect(sentOrRefused('Paid $1,234.56 on 03/14/2026.', patient, claimsOf('1234.56'))).toBe('Paid $1,234.56 on 03/14/2026.');
      expect(sentOrRefused('Paid $1234.56 on 03/14/2026.', patient, claimsOf('123456'))).toBe('Paid $1234.56 on 03/14/2026.');
    });
  });

  it('refuses a CR LF letter wherever its writing with LF is refused (property)', () => {
    const piece = fc.constantFrom('SSN on file.', 'SSN verified.', 'Statement', 'Account', 'Provider', 'No.', 'Member', 'ID Number:', 'Phone', 'Tel', 'Claim', 'Paid', '900-12-3456', '900-12-3456150.00', '900 12 3456', '90012345601/02/2020', '5550123', '202-555-0123', '150.00', '01/01/2020-150.00', 'Jane Zephyra', 'Thank you.');
    const gap = fc.constantFrom(' ', '  ', '\n', '\n\n', ' \n', '\n ', '');
    fc.assert(
      fc.property(fc.array(fc.tuple(piece, gap), { minLength: 2, maxLength: 9 }), (parts) => {
        const letter = parts.map(([text, after]) => `${text}${after}`).join('');
        fc.pre(letter.includes('\n'));
        if (sentOrRefused(letter, JANE, JANE_CLAIMS) === REFUSED) {
          expect(sentOrRefused(letter.replaceAll('\n', '\r\n'), JANE, JANE_CLAIMS), JSON.stringify(letter)).toBe(REFUSED);
        }
      }),
      { numRuns: 400 },
    );
  }, 120_000);

  it('never sends a part of the name written with spaces or full stops inside it, whatever the pieces (property)', () => {
    const part = fc.constantFrom('ZEPHYRA', 'JANE', 'VANTREE', 'BOB', 'AL');
    const style = fc.constantFrom('upper', 'lower', 'title', 'mixed');
    const separator = fc.constantFrom(' ', '. ', '.', '  ', '\n', '\r\n', ' . ');
    const frame = fc.constantFrom(['Dear ', ', your claim'], ['', ''], ['RE: ', '\nPaid in full.'], ['Patient (', ') was seen.'], ['Seen 01/02/2020. ', ' paid 150.00']);
    fc.assert(
      fc.property(part, style, separator, fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }), frame, (name, how, between, cuts, [before, after]) => {
        const letters = [...name].map((letter, i) => (how === 'upper' || (how === 'title' && i === 0) || (how === 'mixed' && i % 2 === 1) ? letter : letter.toLowerCase()));
        const form = letters.map((letter, i) => (i > 0 && cuts[i - 1] === true ? `${between}${letter}` : letter)).join('');
        const who = patientOf([`${name} QUILLFEATHER`]);
        const letter = `${before}${form}${after}`;
        const sent = sentOrRefused(letter, who, claims);
        if (sent !== REFUSED) {
          expect(sent, JSON.stringify(letter)).toBe(`${before}[PATIENT_NAME]${after}`);
        }
        const { text, spans } = redactionSpans(letter, who, claims);
        expect(spans.some((span) => span.start <= before.length && before.length + form.length <= span.end), JSON.stringify(text)).toBe(true);
      }),
      { numRuns: 400 },
    );
  }, 120_000);

  // Beside them, the closed cases: a middle dot or a hyphenation point joins a name's pieces, and a part split by a space
  // with both pieces capitalized is the name.
  it('redacts the name written with a part split by a space, both pieces capitalized, alone and in a held letter', () => {
    expect(sentOrRefused('Dear Zephy Ra, your claim', patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused(`${HELD}Dear Zephy Ra, your claim`, patient, claims)).toBe(`${HELD}Dear [PATIENT_NAME], your claim`);
  });

  // A name written with a middle dot or a hyphenation point is a match ef3e8d20 did not make: redacted alone; in a held
  // letter, which ef3e8d20 refused for the name's pieces, it is left as written and the letter stays refused.
  it.each([
    ['a middle dot inside the name', 'Dear Zeph\u00B7yra, your claim'],
    ['a hyphenation point inside the name', 'Dear Zeph\u2027yra, your claim'],
  ])('redacts the name written with %s alone, and refuses the held letter as ef3e8d20 did: %j', (_what, letter) => {
    expect(sentOrRefused(letter, patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused(`${HELD}${letter}`, patient, claims)).toBe(REFUSED);
  });
});

describe('the reviews of the build and of its fix round (docs/adr/0054): each finding on both sides', () => {
  const SIMONE = patientOf(['SIMONE VANTREE'], ['1980-03-14'], ['ZZ7654321']);
  const outcome = (letter: string, patient: PatientIdentifiers = JANE, claims: readonly LetterClaim[] = JANE_CLAIMS) => sentOrRefused(letter, patient, claims);

  // B1-1, B1-5: a match ef3e8d20 did not make is applied only where the letter is not refused without it. Nothing tests
  // what stands beside the number: an invisible character between two numbers changes nothing.
  it.each([
    sentAs('Call Zephyra at 555-0123', 'Call [PATIENT_NAME] at [PHONE]'),
    sentAs('Call Zephyra at 555-0123, 8 a.m. to 5 p.m.', 'Call [PATIENT_NAME] at [PHONE], 8 a.m. to 5 p.m.'),
    refused('Call Zephyra at 555-0123/555-0124'),
    refused('Call Zephyra at 555-0123/​555-0124'),
    refused('Call Zephyra at 555-0123 ​555-0124'),
    refused('Phone 1: 555-0100​/555-0124'),
    refused('ID SYNMEMBERO042 555-0123'),
    sentAs('ID SYNMEMBERO042 on file', 'ID [MEMBER_ID] on file'),
  ])('B1-1, B1-5: a number or an identifier only this reading reads is redacted where ef3e8d20 refused nothing, and left for the refusal where it refused: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-2: a name only this reading reads (look-alike letters, a middle dot) ends no label's window.
  it.each([
    sentAs('Phone ZЕРНYRА\n555-0123', 'Phone [PATIENT_NAME]\n[PHONE]'),
    sentAs('Phone: Zeph·yra\n555-0123', 'Phone: [PATIENT_NAME]\n[PHONE]'),
    sentAs('Phone Zephyra\n555-0123', 'Phone [PATIENT_NAME]\n[PHONE]'),
  ])('B1-2: a label reads through the call’s own identifier across the one line break a label reads: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-3, B1-14: the look-alike fold is for the call's own identifiers. A Cyrillic letter that looks like a digit ends no
  // label's window, and a keep-noun spelled in look-alikes keeps no number.
  it.each([
    sentAs('Phone (Зоя): 555-0123', 'Phone (Зоя): [PHONE]'),
    sentAs('TTY без 555-0123', 'TTY без [PHONE]'),
    sentAs('ІСN 900123456', 'ІСN [SSN]'),
    sentAs('ICN 900123456', 'ICN 900123456'),
  ])('B1-3, B1-14: the patterns and the scan read a look-alike as the letter it is: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-4: the checks' own marks, written in a letter, are the control characters they are.
  it.each([refused('SSN \u0003\n900.12 3456'), refused('Phone \u0003\n555-0123'), refused('SSN \u0001 900.12 3456')])('B1-4, H1-1: a control character of the checks’ own in a letter is no placeholder, and the letter is refused: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-6, B1-7, C2-6: the glued Social Security labels and the masked SSN glued, and what stays.
  it.each([
    refused('PatientHICN 900.12 3456'),
    refused('PatientSS# 900.12 3456'),
    refused('PatientSS No 900.12 3456'),
    refused('PaidXXX - XX - 3456'),
    refused('PaidXXX-XX-\n3456'),
    refused('FaxXXX-XX-3456'),
    unchanged('Deposited to Acct#XXXX1234 on 01/15/2026.'),
    unchanged('Acct#XXXX-XX-1234'),
    unchanged('Signature_____2026'),
  ])('B1-6, B1-7, B2-2, C2-6: a glued Social Security label and a masked SSN glued in its own shape refuse; a masked account number stays: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-8, B2-3, B2-4, B2-6, C2-2, C2-3, C2-4 and the gate's replay: structure decides whose the digits glued to an SSN's or
  // a phone's shape are; a label always does; a reference's noun names; nothing else does.
  it.each([
    refused('Phone number (202) 555-01234567'),
    refused('Tel 202 555-0123150.00'),
    refused('Paid 150.00900123456'),
    refused('Paid $150.002025550123'),
    refused('Paid $150.00900-12-\n3456'),
    refused('Patient # 900-12-3456150.00'),
    refused('Medicare No. 900-12-3456150.00'),
    refused('$900-12-3456150.00'),
    refused('202-555-012301/02/2020'),
    refused('01/02/20900-12-3456'),
    refused('01/01/2020900-12-3456'),
    refused('June 18, 2026423.435-4454'),
    unchanged('Case No. A123-45-678901'),
    unchanged('Confirmation code 802-91-69413'),
    unchanged('Cases 123-45-678901, 123-45-678902'),
    unchanged('Claim # 20260115-12-3456'),
    unchanged('Policy No. 01-23456-78-9012'),
    unchanged('Referral # 123-45-67890-01'),
    unchanged('Claim Number | 2026-0115-123-4567'),
    unchanged('TCN # 2026008123456.01'),
    unchanged('Internal Control Number (ICN): 2026008123456.01'),
    unchanged('ICN 12345678901,12345678902'),
    unchanged('20260112345,01/05/2026,150.00,96.40'),
    unchanged('Contact Information\nMember ID: 1234-567-89012'),
    unchanged('Contact: Billing 250.75 123456'),
    unchanged('Telephone visit 250.00   1234567'),
    unchanged('Contact us about March 7, 2024−671.422026-03-12−March 3, 2023.'),
    // The gate's replay of the fix round: a range of amounts after the cents; a date glued after the usual writing
    // under its label, a point in it too; the area code in parentheses with no label.
    refused('On 900-12-3456150.00-120.00 today'),
    refused('SSN 900123456150.00-120.00'),
    refused('Call 1: 5550123456150.00-120.00Paid'),
    unchanged('On 20260112345.01-05-2026 today'),
    unchanged('Claim 20260112345.50-120.00 today'),
    refused('SSN 900.12 345601/01/2020'),
    refused('SSN: 996.94 936404/18/2024'),
    refused('Phone 962 75.374902–09–2026'),
    refused('Service (555) 012-345601.01.2020'),
    refused('Service (555) 012-3456150.00'),
    unchanged('Claim (123) 456-78901.50 applies'),
    unchanged('Service (555) 012-34567 today'),
    // The gate's replay of the round after it: a date with a four-digit year glued after a bare nine or ten, and a word
    // glued by a lost space before the month's word of a date that ends before the shape.
    refused('SSN: 94156421006\u201322\u20132027'),
    refused('Seen 96104065401-04-2026'),
    refused('On 9001234562020-01-02 today'),
    unchanged('ICN 96104065401-04-2026 today'),
    unchanged('On 12345678901-04-26 today'),
    unchanged('On 20260112345-01-2026 today'),
    refused('PaidJan 1, 2020900\u201312\u20133456-$20.00.'),
    unchanged('Plan 1, 2020900-12-3456 applies'),
  ])('B1-8, B2-3, B2-4, B2-6, C2-2, C2-3, C2-4: digits glued to an SSN’s or a phone’s shape refuse the letter where structure or a label says whose they are; a reference stays: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-9, C2-7 and the gate's replay: a label's list number.
  it.each([
    sentAs('Tel. 1: 555-0100', 'Tel. 1: [PHONE]'),
    sentAs('Phone (1): 555-0100', 'Phone (1): [PHONE]'),
    sentAs('Phone 1 (home): 555-0100', 'Phone 1 (home): [PHONE]'),
    sentAs('Contact 1: 8005550118 Contact 2: 8005550175', 'Contact 1: [PHONE] Contact 2: [PHONE]'),
    // In parentheses right after its label it is a list number whatever follows: the label redacts what it redacts
    // without it and refuses what ef3e8d20 refuses without it ("SSN. 150.00 120.00 30.00", "TTY users call, 2,403.99;
    // Paid 150.00 2026", "Cell is 933.67 4536"): the gate's replay of the fix round.
    sentAs('Phone (2) 555-0100', 'Phone (2) [PHONE]'),
    sentAs('Phone (2), 555-0100', 'Phone (2), [PHONE]'),
    refused('Re: Cell (2) is 933.67 4536.'),
    refused('SSN (2). 150.00 120.00 30.00'),
    refused('TTY users call (2), 2,403.99; Paid 150.00 2026'),
    // No list number: more than a number in the parentheses, or parentheses not right after the label.
    unchanged('Fax (2 pages) 150.00 120.00 30.00'),
    unchanged('Telephone visit (2) 150.00 120.00 30.00'),
    // The recorded cost: what ef3e8d20 refuses after the label, it now refuses after the label's list number too.
    refused('Contact: Springfield, IL 62701-1234'),
    refused('Contact 1: Springfield, IL 62701-1234'),
  ])('B1-9, C2-7: a label is read through its list number, after an abbreviation’s full stop or in parentheses too: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // The review of the fix round's delta, D1-1 (PHI): what is read only beside a name written with a new joiner is a match
  // ef3e8d20 did not make either. ef3e8d20 refuses each letter here (its scan reads the "ph" between the dots as a phone
  // label); the head of the fix round sent the nine digits in clear.
  it.each([
    refused('Ze\u00B7ph\u00B7yra J 900 12 34, 56'),
    refused('Ze\u00B7ph\u00B7yra, J. 900 12 34, 56'),
    refused('Ze\u00B7ph\u00B7yra J 20 25 55 01 23'),
    refused('Ze\u2022ph\u2022yra J. 900,12 3456'),
    refused('Re: Ze\u00B7ph\u00B7yra J\n900 12 34, 56 is on file.'),
    // The controls: with no initial, and with the name written plainly (ef3e8d20 sends it so, its recorded residual).
    refused('Ze\u00B7ph\u00B7yra 900 12 34, 56'),
    sentAs('Zephyra J 900 12 34, 56', '[PATIENT_NAME] [PATIENT_NAME] 900 12 34, 56'),
    sentAs('Dear Zeph\u00B7yra J, hello', 'Dear [PATIENT_NAME] [PATIENT_NAME], hello'),
  ])('D1-1: an initial read only beside a name ef3e8d20 did not read is no settled match: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // The two reviews of the last round's delta, E1 (PHI) and E2 (must-stay), each finding on both sides.
  it.each([
    // E1-1: a Social Security label's number is the person's whatever noun follows the label; a phone word or Medicare
    // yields to a reference's noun (D2-3), and "on file" names nothing.
    refused('SSN/Member ID: 900-12-3456150.00'),
    refused('SSN on file: 900-12-345678'),
    refused('Soc. Sec. Acct. No. 900-12-345678'),
    refused('Social Security\nAccount Number 900-12-345678'),
    refused('Social Security No. on file 900123456150.00'),
    refused('SSN (Member ID): 900-12-3456150.00'),
    refused('Phone on file: 202-555-0123150.00'),
    unchanged('SSN on file. Claim 802-45-678901.50'),
    unchanged('File No. 802-45-678901.50'),
    // E1-7: "advice" names a number only as "remittance advice", and a noun names across one line break at most.
    refused('Seen Please seek advice. 900-12-3456150.00 today.'),
    refused('REMITTANCE ADVICE\n\n900-12-3456150.00 01/02/2020'),
    unchanged('Remittance Advice Number 802-45-678901.50'),
    // E1-2, E2-3: three digits or more before an SSN's masked shape, a currency amount, a date's day.
    refused('Paid $150XXX-XX-3456'),
    refused('CPT 97110XXX-XX-3456'),
    refused('DOS 2020-01-02XXX-XX-3456'),
    refused('Paid 150.00___-__-3456'),
    refused(`${HELD}DOS 2020-01-02XXXXX3456`),
    unchanged('Acct 4XXX-XX-1234'),
    unchanged(`${HELD}Account 0XXXXX1234`),
    // E1-3, E2-2: the date before a year glued to a shape, in more of its writings.
    refused('DOS 01-Jan-2020900-12-3456'),
    refused('Seen Jan 1,2020900-12-3456 today.'),
    refused('Seen January 2020900-12-3456 today.'),
    refused('Seen 01/2020202-555-0123 today.'),
    refused('Seen 01Jan2020202-555-0123 today.'),
    refused('Seen January 1,\n2020900-12-3456 today.'),
    unchanged('Seen 2020900-12-3456 today.'),
    // E1-4: a date after a bare nine or ten with more glued after it, with its month's word, with other joiners; one
    // digit of a date only with slashes.
    refused('SSN: 90012345601/02/2020150.00 ok.'),
    refused('SSN: 9001234562020-01-02150.00 ok.'),
    refused('SSN: 90012345601-Jan-2020 ok.'),
    refused('SSN: 90012345601\u00B702\u00B72020 ok.'),
    refused('Phone 20255501239/9/2020 ok.'),
    unchanged('On 20260112345-01-2026 today'),
    // E1-5: the area code in parentheses, written more loosely. In a held letter the shape with a longer last group is
    // refused with no label too, a line's own numbers among them (E2-5 asked for those back; G1-4 showed they cannot be
    // told from a phone with a digit glued after it).
    refused('Service ( 202 ) 555-0123150.00 on file.'),
    refused('Service (202) - 555-0123150.00 on file.'),
    refused('Service (202)\n555-0123150.00 on file.'),
    refused('Service (202) 555-012301-Jan-2020 on file.'),
    refused(`${HELD}Line (001) 420-97110`),
    refused(`${HELD}Line (001)420-97110`),
    refused(`${HELD}(202) 555-01234`),
    refused(`${HELD}Dept. (202) 555-01231 97110 150.00`),
    unchanged('Line (001) 420-97110'),
    // E2-4: a point between the second and third groups keeps the usual writing an amount and a number.
    unchanged('Medicare rate 110 32.74420'),
    unchanged('Contact: Billing 250 75.123456'),
  ])('E1-1 to E1-5, E1-7, E2-2 to E2-5: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // E2-1: a label's list number is no digit of the number the label names: the line reads as it reads without it.
  it.each([
    'Telephone call (2) 30.00 60.00',
    'Calls (3) 25.00 75.00',
    'Fax (10) 1.00 10.00',
    'Records fee: fax (10) 1.00 10.00, copies (25) 0.25 6.25',
    'Telephone call (2)\n30.00 60.00',
    'SSN (2) 15.00 30.00',
    'Fax 2) 15.00 30.00',
  ])('E2-1: %j is sent unchanged, as the same line is with its list number taken out', (letter) => {
    expect(outcome(letter)).toBe(letter);
    const without = letter.replace(/ ?\(?[0-9]{1,2}\)/u, '');
    expect(outcome(without)).toBe(without);
  });

  // The two reviews of the next delta, G1 (PHI) and G2 (must-stay), each finding on both sides.
  it.each([
    // G1-2: a date written year first after a bare nine or ten, its day or month of one digit.
    refused('Seen 9001234562020-1-5'),
    refused('DOB 20255501232020-12-5.'),
    refused('9001234562020/1/5 Paid'),
    // G1-3: the Social Security label right before the noun makes the noun the label's own word, however far the number
    // stands after it and whatever is glued before its shape.
    refused(`Social Security Account Number:${' '.repeat(14)}900-12-3456150.00`),
    refused(`SSN Member ID${' '.repeat(20)}900-12-3456150.00`),
    refused('SSN Account 01-900-12-3456150.00'),
    refused('Social Security Account Number 01/02/2020900-12-3456'),
    refused('Social Security Claim Number 900-12-3456150.00'),
    refused('SSN Account Code 900-12-3456150.00'),
    // G1-5: under a Social Security label a point between the second and third groups is no rate's.
    refused('SSN 900 12.3456150.00'),
    refused('HICN 900 12.345678'),
    refused('SSN (900) 12.3456150.00'),
    unchanged('Medicare rate 110 32.74425 Jan 15, 2026'),
    // G2-1: a month's word across a space begins a date of its own; glued, it is the date after the number.
    unchanged('802-45-678901 Jan 15, 2026 97110 150.00'),
    unchanged('Web ID 802-456-78901 Sep 30, 2026'),
    unchanged('(001) 420 97116 Jan 15, 2026'),
    unchanged('802-45-678901 may 30 days'),
    unchanged('Lines reviewed:\n724-24-822630 Jan 2026 97535 340.34'),
    refused('Seen 900-12-345601Jan2020 today.'),
    // G2-2: a bar, an underscore, a backslash or a tilde joins a row's cells and a file name's parts; under a Social
    // Security label it joins a date's parts too. After the date, an amount or a second date, never a longer number's digits.
    unchanged('91895853214|3|20260401|97110|238.64'),
    unchanged('ClaimNo|Line|DOS|HCPCS|Billed\n41534035603|1|20260613|97140|464.44'),
    unchanged('See attached ERA_79790014228_08_2026.pdf for details.'),
    unchanged('\\\\fs01\\era\\12345678901\\01\\2026\\remit.pdf'),
    unchanged('12345678901~02~2026'),
    unchanged('Fax ERA_79790014228_08_2026.pdf to the plan.'),
    refused('SSN: 90012345601_02_2020 ok.'),
    refused('SSN: 90012345601\\02\\2020 ok.'),
    refused('SSN: 90012345601/02/202001/31/2020 ok.'),
    unchanged('On 12345678901/02/20261234 today'),
    // G2-3: a label wrapped over two lines is one label; a heading two lines up names nothing. A rule under the label
    // and a blank line after it were read as the label's until the review J; they are the recorded cost since.
    unchanged('Claim\nNumber\n20260112345.01'),
    refused('ICN\n-----------------\n12345678901234.01'),
    refused('Reference Number\n================\n20260112345.01'),
    refused('Claim No. | Reference\n----------|----------\n20260112345.01 | 20260112346'),
    refused('Claim Number:\n\n20260112345.01'),
    refused('Your reference number is\n\n20260112345.01 and it was paid.'),
    unchanged('Remittance\nAdvice No. 20260112345.01'),
    refused(`${HELD}Member ID:\n\n802-45-678901`),
    refused('Claim Number:\n\n\n20260112345.01'),
    refused('STATEMENT\n\n900-12-3456150.00'),
    // G2-4, H2-6: "on file" names nothing as one phrase on one line; "on" at a line's end is no part of a label that
    // begins the next ("File Number:").
    refused('Phone on-file: 202-555-0123150.00'),
    unchanged('Phone on\nfile: 202-555-0123150.00'),
    // G2-6: a section's or a list's numbers, and a word that ends in a month's letters, are no date before a year.
    unchanged('Sec. 2.1. 2026011-22-3333'),
    unchanged('Items 3 - 5 - 2026011-22-3333'),
    unchanged('Dismay 2026011-22-3333'),
    refused('PaidJan 1, 2020900-12-3456'),
    // G2-7: a nine and a date that begins with one digit, with slashes; a noun names the run.
    refused('1234567899/9/2020'),
    unchanged('NPI 1234567893/9/2026'),
  ])('G1-2, G1-3, G1-5, G2-1 to G2-4, G2-6, G2-7: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // The two reviews of the next delta, H1 (PHI) and H2 (must-stay), each finding on both sides.
  it.each([
    // H1-1: a letter that writes one of the checks' own three marks is refused, whatever else it holds.
    refused('Total\u0002for45.00 and 9 0 0 1 2 3 4 5 6'),
    refused('Acct\u0002x9. Front desk 555-0123'),
    refused('SSN 900\u000112 3456'),
    refused('Our office: 555-0123. Paid\u0003'),
    unchanged('Total for45.00 and 9 0 0 1 2 3 4 5 6'),
    unchanged('Our office: 555-0123. Paid\u0004'),
    // H1-2: the month's word glued to the number, its four-digit year after a space or a comma; two digits after a
    // space are as often the day of a date of its own.
    refused('900-12-345601Jan 2020'),
    refused('202-555-012301Jan, 2020'),
    refused('(202) 555-012301-Jan 2020'),
    refused('SSN 900.12 345601Jan 2020'),
    refused('900-12-345601JAN. 2020'),
    unchanged('802-45-678901Jan 15, 2026 97110'),
    // H1-3: after the date that follows a bare nine or ten, another number with a structure of its own in any writing;
    // under a Social Security label, whatever follows.
    refused('90012345601/02/20201,250.00 Paid'),
    refused('90012345601/02/2020150.5 Paid'),
    refused('90012345601/02/2020150.00120.00 Paid'),
    refused('90012345601/02/202001/31/2020150.00 Paid'),
    refused('90012345601/02/202001-Jan-2020 Paid'),
    refused('90012345601/02/20202020-01-31 Paid'),
    refused('SSN: 90012345601/02/20201234 Paid'),
    // H1-4: the hyphen bullet is a dash to a date as to a number.
    refused('90012345601\u204302\u20432020 Paid'),
    // H1-5, H2-4, H2-7: a heading with line breaks before a word on the number's own line names nothing; what ends a
    // label stands on the label's own line; a rule is three of its characters or more, and points are none.
    refused('Statement\n\nNumber: 900-12-3456150.00'),
    refused('STATEMENT\n\n\n\nNo. 900-12-3456150.00'),
    refused('Thank you for your payment.\n\nNo. 900-12-3456150.00'),
    refused('Remittance\n\n\nAdvice 900-12-3456150.00'),
    refused('REMITTANCE ADVICE\n\n#900-12-3456150.00'),
    refused('STATEMENT\n\n: 900-12-3456150.00'),
    refused('STATEMENT\n-  \n900-12-3456150.00'),
    refused('STATEMENT\n...\n900-12-3456150.00'),
    refused('STATEMENT\n--\n802-45-678901.50'),
    // H2-1: a form's blank between a label and its number, on one line. A rule of underscores, tildes or box-drawing
    // lines under the label, a table's corners and bars around it, is the recorded cost since the review J.
    refused('ICN\n_____\n12345678901234.01'),
    refused('Claim Number\n~~~~~~~~~~~~\n20260112345.01'),
    refused('Claim Number\n+------------+\n20260112345.01'),
    refused('Claim Number\n\u2500\u2500\u2500\u2500\u2500\u2500\n20260112345.01'),
    refused('| Claim |\n|-------|\n| 20260112345.01 |'),
    unchanged('Claim Number: ______ 20260112345.01'),
    // H2-3: the Social Security label must be the number's own label: under Medicare with the Act named before it, the
    // writing stays an amount and a number.
    unchanged('under section 1833 of the Social Security Act. Medicare rate 110 32.74420'),
    unchanged('Social Security/Medicare rate 110 32.74420'),
    unchanged('SSN: Medicare rate 110 32.74420'),
    // H2-6: "on" at a line's end before a label that begins the next line.
    unchanged('This notice is based on\nFile Number: 12345678901234.01'),
    unchanged('Auto-pay: ON\nFile No. 802-45-678901.50'),
    // H2-8: the second reading is ef3e8d20's own: it reads no Social Security label glued after a letter.
    unchanged('MemberSSN 8 1234567893.1'),
    unchanged('Assoc. Sec. 8 1234567893.1'),
    refused('Member SSN 8 1234567893.1'),
  ])('H1-1 to H1-5, H2-1, H2-3, H2-4, H2-6 to H2-8: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // The two reviews of the next delta, I1 (PHI) and I2 (must-stay), each finding on both sides, and the gate's replay.
  it.each(['_', '~', '\u2500', '_ ', '-'])('I1-1, I2-1: a long rule of %j between a noun and a number is read in time linear in its length', { timeout: 60_000 }, (mark) => {
    for (const length of [48, 60, 110, 5000]) {
      const letter = `IMPORTANT NOTICE\n${mark.repeat(length)}\nClaim Number: 20260112345.01`;
      const run = timed(1_000, () => outcome(letter));
      expect(run.value).toBe(letter);
      expect(run.ms, `a rule of ${String(length)}: ${run.said}`).toBeLessThan(run.allowedMs);
    }
  });
  it.each([
    // I2-2: what ends a label on a line of its own under it ("#", a table's alignment row, a rule of "#") was read as
    // the label's until the review J; the recorded cost since. On the number's own line it is the number's (H1-5).
    refused('Claim\n#\n20260112345.01'),
    refused('Claim\n#:\n12345678901234.01'),
    refused('| Claim |\n|:------|\n| 20260112345.01 |'),
    refused('Statement\n#########\n802-45-678901.50'),
    refused(`${HELD}Claim\n#\n802-456-78901`),
    refused('REMITTANCE ADVICE\n\n#900-12-3456150.00'),
    // I2-3, I1-2: the month's word after a bare nine or ten with its year after a space or a comma, as after a shape.
    refused('Seq 90012345601Jan 2020'),
    refused('Seq 90012345601Jan, 2020'),
    refused('Seq 202555012301Jan 2020'),
    refused('SSN: 90012345601Jan 2020'),
    // I2-4: a label of three lines and a rule inside a label, read until the review J, are the recorded cost since;
    // never a blank line inside one.
    refused('Member\nID\nNumber\n20260112345.01'),
    refused('Remittance\nAdvice\nNumber\n12345678901234.01'),
    refused('Invoice\n-------\nNo. 20260112345.01'),
    refused('Invoice\n\nNo. 20260112345.01'),
    // I2-5: the line break U+0085. A cell drawn with box lines and a label's own full stop before its rule, read until
    // the review J, are the recorded cost since.
    refused('\u2502 Claim Number \u2502\n\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524\n\u2502 20260112345.01 \u2502'),
    refused('Acct.\n-----\n802-45-678901.50'),
    unchanged('Claim:\u008520260112345.01'),
    // I2-6: an amount that begins as a year does is no year after a month's word.
    unchanged('Row 366-535-16935Nov 2000.00'),
    unchanged('Seq 12345678901Jan 2000.00'),
    // The gate's replay: the label right before the number is the number's own; with another word between them the
    // writing with a point stays an amount and a number.
    refused('1651.90. Medicare 917 16.2677535.06-17-AUG-23'),
    refused('Call 900 77.3283150.00'),
    refused('SSN/Medicare ID 900 12.3456150.00'),
    unchanged('Medicare rate 110 32.74420'),
    unchanged('Contact: Billing 250 75.123456'),
    // A "+" is a phone's own sign and no connector; a table's corner beside a dash was one until the review J (J-5).
    refused('Provider: +1-202-555-0123150.00'),
    refused('Claim + 900-12-3456150.00'),
    refused('+--------------+\n| Claim Number |\n+--------------+\n| 20260112345.01 |'),
  ])('I1-2, I2-2 to I2-6 and the gate\u2019s replay: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // The review of the next delta, J (one reviewer, three lenses), each finding on both sides. The layouts read between a
  // label and its number over the four rounds before (a rule, a blank line, a third line, a mark alone on its line) are
  // read no more: one line break at most inside the label and one at most before the number. What that refuses is ADR
  // 0054's recorded cost.
  it.each([
    // J-3: a line break written CR LF is one line break.
    unchanged('Claim\r\nNumber: 20260112345.01'),
    unchanged('Please refer to claim\r\nnumber 20260112345.01 when you call.'),
    unchanged('Reference\r\nNo. 802-45-678901.50'),
    unchanged('Remittance\r\nAdvice No. 20260112345.01'),
    unchanged('Claim Number:\r\n20260112345.01'),
    unchanged('Claim\r\nNumber:\r\n20260112345.01'),
    unchanged(`${HELD}Member ID:\r\n802-45-678901`),
    refused('Claim Number:\r\n\r\n20260112345.01'),
    refused('Member\r\nID\r\nNumber\r\n20260112345.01'),
    refused('STATEMENT\r\n\r\n900-12-3456150.00'),
    refused(`${HELD}Member ID:\r\n\r\n802-45-678901`),
    // J-2, J-4: a mark, an empty cell or a rule on a line of its own between a heading and the number's line, whatever
    // the number's indentation or its cell's width; a cell beside its label, or under it with no rule, is named.
    refused('STATEMENT\n.\nNo. 900-12-3456150.00'),
    refused("STATEMENT\n'\nNo. 900-12-3456150.00"),
    refused('STATEMENT\n|\nNo. 900-12-3456150.00'),
    refused('| STATEMENT             |\n|                       |\n| No. 900-12-3456150.00 |'),
    refused('STATEMENT\n,\nID: 202-555-0123150.00'),
    refused('Claim\n-----\n         20260112345.01'),
    refused('| Claim          |\n|----------------|\n| 20260112345.01 |'),
    refused('Reference           \n--------------------\n20260112345.01'),
    unchanged('| Claim | 20260112345.01 |'),
    unchanged('| Claim No. |\n| 20260112345.01 |'),
    unchanged('Claim Number\n20260112345.01'),
    unchanged('ICN:\n12345678901234.01'),
    // J-1: after the year that follows a space or a comma, an amount's cents alone make it an amount; a comma ends the
    // date, and a point with one digit or three is no cents.
    refused('900-12-345601Jan 2020,150.00'),
    refused('900-12-345615-Mar, 2021,2022'),
    refused('(202) 555-012301Jan 2020,150.00'),
    refused('202-555-012305MAY 2026,1 unit'),
    refused('Tel 250.75 123401Jan 2020,150.00'),
    refused('SSN: 90012345601Jan 2020,150.00'),
    refused('Seq 90012345601Jan 2020,150.00'),
    refused('Row 366-535-16935Nov 2000.5'),
    unchanged('Row 366-535-169012-September, 2000.00'),
    unchanged('Row 366-535-169012-September., 2000.00'),
    unchanged('Row 366-535-16935Nov 2000.00.'),
    // The label right before the number in its usual writings: two number words, two signs; no other word.
    refused('Phone #: 900 77.3283150.00'),
    refused('Medicare ID No. 900 12.3456150.00'),
    unchanged('Medicare ID No. rate 110 32.74420'),
    // Recorded, sent as ef3e8d20 sends them: the label and a column of blanks, or U+0085, before the writing with a point.
    unchanged('Phone:    900 77.3283150.00'),
    unchanged('Phone\u0085900 77.3283150.00'),
    // J-5: "+" is no connector, beside a dash or not; a blank's underscores cut by a box line are no blank (recorded).
    refused('Provider -+1-202-555-0123150.00'),
    refused('Claim -+- 20260112345.01'),
    refused('Claim __│__ 20260112345.01'),
  ])('J-1 to J-5: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });
  it.each(['-+', '+-', '=+', '_~', '─_', '+ ', '(S)', 'NO ', '# ', '| '])('J-5: %j repeated between a noun and a number is read in time linear in its count', { timeout: 60_000 }, (pair) => {
    for (const count of [24, 28, 50, 2500]) {
      const letter = `Claim ${pair.repeat(count)} Total 20260112345.01`;
      const run = timed(1_000, () => outcome(letter));
      expect(run.value).toBe(REFUSED);
      expect(run.ms, `${String(count)} of them: ${run.said}`).toBeLessThan(run.allowedMs);
    }
  });

  // The review of the last delta, K: no blocking finding. What it recorded is pinned as it is sent today (ADR 0054, the
  // amendment's residuals; K-1 is queued to be closed before any real PHI is processed). K-1: a label's reach is counted
  // in characters and a CR LF counts two, so the Social Security label that owns the number 24 characters on is out of
  // reach at 25: the letter is named by its noun and sent, as ef3e8d20 and cc3dd7f6 send it, where its writing with LF is
  // refused.
  it.each([
    // K-1, closed by MOD-23: the check reads a CR LF as one line ending too, and takes the worse answer.
    refused('SSN on file. Statement\r\nNo. 900-12-3456150.00'),
    refused('SSN on file. Statement\nNo. 900-12-3456150.00'),
    // The label out of reach with a noun between, recorded before this round.
    unchanged('SSN on file.  Statement\nNo. 900-12-3456150.00'),
    // The lesser forms review K recorded.
    unchanged('Phone number is 900 77.3283150.00'),
    unchanged('Phone # : 900 77.3283150.00'),
    unchanged('900-12-345601Jan 2020.12.31'),
  ])('K-1 and review K’s lesser forms, recorded: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // ef3e8d20's reading stands where the strict reading leaves a group out of its chains (the fuzzers on the round after E1
  // and E2, and the review of its delta, G1-1: letters ef3e8d20 refuses were sent). To ef3e8d20 a label's list number is
  // the chain's first group, and a long run before a decimal point an amount it chains under its label: the scan reads
  // the text its way too (survivorIn), and each letter it refuses for that stays refused.
  it.each([
    // G1-1: a number's own first digits written as a list number.
    'Phone (20) 2555 0123',
    'Tel (20) 2555-0123',
    'SSN (9) 00-12-3456',
    'SSN 9) 00 12 3456',
    'Fax 2) 15 00 30 00',
    'Phone (20) 2555 0123 or 202-555-0124',
    'Cell number 1) 7886924.4 ext 12',
    'Tel # 6) 2020/94, 81x12',
    'Contact: 2) 0123 | 9001 2020',
    'Soc. Sec. 11)555-\n0123.',
    'Telephone 11) 900-0/1, 727-35958x12',
    'Telephone number 8 1234567893.1',
    'Telephone 8 1234567893.1,234.56',
  ])('ef3e8d20 refuses %j for a chain the strict reading does not hold: refused', (letter) => {
    expect(outcome(letter)).toBe(REFUSED);
  });
  it.each(['Telephone number 8 1234567893', 'Telephone number 8 1234567893.12', 'Telephone number 8 1234567893 1,234.56'])('%j is sent, as ef3e8d20 sends it', (letter) => {
    expect(outcome(letter)).toBe(letter);
  });

  // E1-6: the list number in parentheses with a space inside them, an ordinal's suffix, a plural label, a line break
  // before it; nine digits with it stay refused, as ef3e8d20 refuses them.
  it.each([
    sentAs('Phone ( 2 ) 555-0100', 'Phone ( 2 ) [PHONE]'),
    sentAs('Phone (2nd) 555-0100', 'Phone (2nd) [PHONE]'),
    sentAs('Phone numbers (2) 555-0100', 'Phone numbers (2) [PHONE]'),
    sentAs('Phone\n(2) 555-0100', 'Phone\n(2) [PHONE]'),
    refused('Phone (12) 555-0100'),
    refused('Call (2) 150.00 120.00 30.00'),
  ])('E1-6: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // E1-8: the month of May at a line's end and its day with an ordinal's suffix on the next, in a held letter.
  it('E1-8: reads May and its day with a suffix across a line break, never a list number there', () => {
    const born = patientOf(['JANE Q ZEPHYRA'], ['1980-05-14']);
    const claims = claimsOf('SYNCLAIM0001');
    expect(outcome(`${HELD}The member turns 46 on May\n14th this year.`, born, claims)).toBe(REFUSED);
    expect(outcome(`${HELD}You may\n14. Appeal within 180 days`, born, claims)).toBe(`${HELD}You may\n14. Appeal within 180 days`);
  });

  // The new name joiners are the letter reader's. The narrative's check, which the packet verifier shares, reads a name as
  // ef3e8d20 read it: which stored narratives fail is the verifier's to change.
  it('reads a name written with a new joiner in a letter, and leaves the narrative’s reading as it was', () => {
    expect(outcome('Dear Zeph\u00B7yra, hello')).toBe('Dear [PATIENT_NAME], hello');
    expect(holdsNameOrNumber('Dear Zeph\u00B7yra, hello', { names: ['JANE Q ZEPHYRA'], numbers: [] })).toBe(false);
    expect(holdsNameOrNumber('Dear Zephyra, hello', { names: ['JANE Q ZEPHYRA'], numbers: [] })).toBe(true);
    expect(holdsNameOrNumber('ID ZZ\u00B77654321', { names: [], numbers: ['ZZ7654321'] })).toBe(true);
  });

  // D1's note: where no check follows, a pattern's match inside a run that holds an identifier glued in a look-alike form
  // is applied, as ef3e8d20 applied it; the letter reader, which a check follows, leaves the run whole and it is refused.
  it.each([
    ['900-12-3456Z3PHYRA', '[SSN]Z3PHYRA'],
    ['Tel 555-0123Z3phyra', 'Tel [PHONE]Z3phyra'],
  ])('D1: redactLetter redacts the number of %j as ef3e8d20 did, and the letter reader refuses the letter', (letter, redacted) => {
    expect(redactLetter(letter, JANE, JANE_CLAIMS).text).toBe(redacted);
    expect(outcome(letter)).toBe(REFUSED);
  });

  // The review of the fix round's delta, D2-1 to D2-5 and D2-7 (must-stay), each on both sides.
  it.each([
    // D2-3: a reference's noun nearer the number than a phone word or "Medicare" names it; with no noun the label holds,
    // and an SSN label right before the noun makes the noun its own word.
    unchanged('Medicare Summary Notice 802-45-678901'),
    unchanged('Medicare Advantage Member ID 802-45-678901'),
    unchanged('Fax confirmation number 802-456-78901.50'),
    unchanged('Contact us regarding account 802-456-789012.'),
    unchanged('This is not a Medicare plan. Policy 802-456-78901.'),
    unchanged('Customer Service\nPhone\nPolicy 802-456-78901'),
    refused('Medicare ID 900-12-345678'),
    refused('Member Phone 202-555-01234567'),
    refused('Social Security Account Number 900-12-345678'),
    refused('SSN Record 900-12-345678'),
    // "Medicare" is a label over an SSN's shape, never over a phone's.
    refused('Medicare 802-45-678901'),
    unchanged('Medicare 802-456-78901'),
    // D2-1: more writings of a noun before its number, and a form's column of spaces between them.
    unchanged('Claim number(s): 802-45-678901.50'),
    unchanged('Remittance Advice Number 802-45-678901.50'),
    unchanged(`Claim Number:${' '.repeat(40)}802-45-678901.50`),
    // Recorded: a letter glued before a reference's digits is no part of it (a lost space glues a word there as often).
    refused('Claim W2026008123456.01'),
    refused('Claim for900-12-3456150.00'),
    // D2-5: in a held letter the noun names the whole joined number too.
    unchanged(`${HELD}Policy No. 01-802-45-678901`),
    unchanged(`${HELD}Tracking # 4-802-456-78901`),
    refused(`${HELD}Web ID 802-456-78901`),
    // D2-7: a digit before the mask is another number's only where structure says so; underscores after a word are a blank.
    unchanged('Acct 4XXX-XX-1234'),
    unchanged('Item 3___ __ 2026'),
    unchanged('Initials___ __ 2026'),
    refused('Seen 01/02/2020XXX-XX-3456 today'),
    refused('Paid 150.00XXX-XX-3456 today'),
    unchanged(`${HELD}Account 0XXXXX1234`),
    unchanged(`${HELD}Loan 12*****1234`),
    refused(`${HELD}Paid___-__-3456`),
  ])('D2-1, D2-3, D2-5, D2-7: a noun nearer than a label names the number; a masked account number’s own digits stay: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-10, B1-11, B1-13, B2-1, C2-8: digit-for-letter forms are of five characters or more, in pieces too; a look-alike
  // form glued inside a longer run refuses; what an ordinary token is stays.
  it('B1-10, B1-11, B1-13: reads a digit-for-letter form written in pieces, another script’s digit that looks like a letter, and a look-alike form glued', () => {
    const claims = claimsOf('SYNCLAIM0001');
    expect(outcome('ID ZZ 765432l', SIMONE, claims)).toBe('ID [MEMBER_ID]');
    expect(outcome('Claim SYNCLAIM-OOO1', SIMONE, claims)).toBe('Claim [CLAIM_1]');
    expect(outcome('Dear VAN-TR3E,', SIMONE, claims)).toBe('Dear [PATIENT_NAME],');
    expect(outcome('Dear Van-\ntr3e,', SIMONE, claims)).toBe('Dear [PATIENT_NAME],');
    expect(outcome('Dear ٧ANTREE,', SIMONE, claims)).toBe('Dear [PATIENT_NAME],');
    expect(outcome('Paid 150.00νantree', SIMONE, claims)).toBe(REFUSED);
    expect(outcome('Re: ZZ76S432197110 on file.', SIMONE, claims)).toBe(REFUSED);
    expect(outcome('900-12-3456́thZephyraPaid')).toBe(REFUSED);
  });

  it.each([
    [['LIAM VANTREE'], 'Our office is open 8am to 11am and 1pm to 5pm. Please call before 11AM Eastern.'],
    [['COLE VANTREE'], 'Adjustment CO13 applied. Adjustment CO131 (claim specific negotiated discount).'],
    [['JANE Q ZEPHYRA'], 'Coverage ends JAN31. Service dates JAN3, JAN10, JAN17'],
    [['OMAR VANTREE'], 'DOS 10MAR2026 97110 GP 2 150.00'],
    [['ANNA LANE'], 'Plan3 benefits apply.'],
    [['ERIC BOTH'], 'the 80th percentile'],
    [['ANNA WEEKS'], 'Plan of care: Week-5 reassessment'],
    [['BILLIE VANTREE'], 'House Bill-13 takes effect 01/01/2027.'],
  ])('B2-1, C2-8: an ordinary token is no digit-for-letter form of a name of four letters, of a month’s word, or of a word and a number: %j %j', (names, letter) => {
    expect(outcome(letter, patientOf(names), claimsOf('SYNCLAIM0001'))).toBe(letter);
  });

  it('records the cost that stays: a plural name and its singular with a 5 glued to it', () => {
    expect(outcome('Plan of care: Week5 reassessment', patientOf(['ANNA WEEKS']), claimsOf('SYNCLAIM0001'))).toBe('Plan of care: [PATIENT_NAME] reassessment');
  });

  // B2-7, C2-1: a short word of another script is no Latin name; a name stored in its own script is the name.
  it('B2-7, C2-1: reads a short name in the patient’s own script, and no short Latin name in another script’s word', () => {
    // "na russkom" for a patient HA; "Dear Ms. Li" for a patient whose name is stored in Cyrillic.
    const notice = 'на русском языке';
    expect(outcome(notice, patientOf(['LINH HA']), claimsOf('SYNCLAIM0001'))).toBe(notice);
    expect(outcome('Dear Linh Ha, Ms. Ha was approved.', patientOf(['LINH HA']), claimsOf('SYNCLAIM0001'))).toBe('Dear [PATIENT_NAME], Ms. [PATIENT_NAME] was approved.');
    expect(outcome('Dear Ms. Ли:', patientOf(['ЗЕФИРА ЛИ']), claimsOf('SYNCLAIM0001'))).toBe('Dear Ms. [PATIENT_NAME]:');
  });

  // C1-1: a Social Security label a change of case sets apart is a second reading, never a replacement.
  it.each([refused('Tel claimSS#b 20255 50123'), refused('Tel caseHICé 20255 50123'), refused('Call Zephyra at 555-0123.\nTel claimSS#b 20255 50123')])('C1-1: the reading with the glued label set apart only adds to the reading as written: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // C1-2: a match ef3e8d20 did not make is no item of a list and ends no label's window; C1-3, C1-4: what ef3e8d20's
  // reading refused stays refused whatever the look-alike fold reads beside the name.
  it.each([
    sentAs('Claim Zephy∙ra, 900123456', 'Claim [PATIENT_NAME], [SSN]'),
    sentAs('Claim Zephyrа, 900123456', 'Claim [PATIENT_NAME], [SSN]'),
    sentAs('Claim Mаrch 14 1980, 900123456', 'Claim [DATE_OF_BIRTH], [SSN]'),
    refused('Mаrch 14, 1980 555 01 23'),
    refused(`${HELD}Zephyra Ꝯ00-12-3456`),
    refused('Zephyra〇'),
    refused('〇Zephyra'),
    refused('Seen Jane Zephyra〇 on 01/02/2020, paid 150.00'),
  ])('C1-2, C1-3, C1-4: the look-alike reading only adds to ef3e8d20’s own: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter), JSON.stringify(letter)).toBe(sent);
  });

  // B1-12, B2-5, B2-8, C2-5: a held letter's date of birth in more writings, never the verb "may" or a day in words; and
  // more of what a held letter places by its structure.
  it('B1-12, B2-5, C2-5: reads the date of birth with a Roman month and a two-digit year and run together as six digits; never the verb "may" or a day in words', () => {
    const born = (date: string) => patientOf(['JANE Q ZEPHYRA'], [date]);
    const claims = claimsOf('SYNCLAIM0001');
    const held = 'Service 01/01/2020-150.00 Paid\n';
    expect(outcome(`${HELD}14/III/80`, born('1980-03-14'), claims)).toBe(REFUSED);
    expect(outcome(`${HELD}ID 80031455`, born('1980-03-14'), claims)).toBe(REFUSED);
    expect(outcome(`${held}Born May 12th`, born('1980-05-12'), claims)).toBe(REFUSED);
    expect(outcome(`${held}the 12th of May`, born('1980-05-12'), claims)).toBe(REFUSED);
    expect(outcome(`${held}Born 12 May.`, born('1980-05-12'), claims)).toBe(REFUSED);
    expect(outcome(`${held}Born May 12, as stated`, born('1980-05-12'), claims)).toBe(REFUSED);
    // D2-6: the verb before punctuation, and at a line's end with a list's number on the next.
    for (const line of [
      'Visits over 12 may require prior authorization.',
      'Visits after the 12th may require prior authorization.',
      'Visits over 12 may\nrequire prior authorization.',
      'You may 12) call us.',
      'Up to 12 may, at our discretion, be approved.',
      'Visits over 12 may; see policy.',
      'Of the 20 visits, 12 may: (a) be denied',
      'You may\n12. Appeal within 180 days',
    ]) {
      expect(outcome(`${held}${line}`, born('1980-05-12'), claims), line).toBe(`${held}${line}`);
    }
    // Recorded: a day written as an ordinal's word is not read.
    expect(outcome(`${held}The first March payment was applied.`, born('1980-03-01'), claims)).toBe(`${held}The first March payment was applied.`);
    expect(outcome(`${HELD}March fourteenth`, born('1980-03-14'), claims)).toBe(`${HELD}March fourteenth`);
  });

  it.each(['Washington, D.C. 20201-0001', 'Springfield, IL, 62701-1234', 'Tax ID #: 12-3456789', 'CPT code(s) 97110 97140', 'M54.50 97110', '97110 (2) 150.00'])('B2-8: a held letter places %j by its structure', (line) => {
    const letter = `Service 01/01/2020-150.00 Paid\n${line}`;
    expect(outcome(letter), JSON.stringify(letter)).toBe(letter);
  });

  // The withheld match (the battery on the last round, its fuzzer's seed 5923): a Social Security or phone pattern's match
  // is left as written inside a run that holds one of the call's identifiers glued in a look-alike form, so the check
  // reads the run whole and refuses it. Where one member ID ends another, the longer one written with a look-alike digit
  // is such a run and is the longer one's own match whole: its placeholder replaces the run, nothing is left for the
  // check, and what the pattern read past the run's end was sent as written ("ID [MEMBER_ID]\n01-02-2020", where ef3e8d20
  // sends "ID ZZ76543\uA6EF[SSN]"). A match is left as written only where no match of the call's own covers the run whole.
  const ENDS = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '7654321']);
  const ENDS_CLAIMS = claimsOf('SYNCLAIM0001', '4455667');
  it.each([
    sentAs('ID ZZ76543\uA6EF1\n01-02-2020', 'ID [MEMBER_ID]'),
    sentAs('Member ID: ZZ76543\uA6EF1 \n01-02-2020', 'Member ID: [MEMBER_ID]'),
    sentAs('Line 3. ID ZZ76543\uA6EF1\n01-02-2020 Zephyra', 'Line 3. ID [MEMBER_ID] [PATIENT_NAME]'),
    // The neighbours that stay, the date sent as ef3e8d20 sends it: the ID as it is stored or with the look-alike as its
    // last digit (no pattern begins inside the ID), and the look-alike with no number right after it.
    sentAs('ID ZZ7654321\n01-02-2020', 'ID [MEMBER_ID]\n01-02-2020'),
    sentAs('ID ZZ765432\u0661\n01-02-2020', 'ID [MEMBER_ID]\n01-02-2020'),
    sentAs('ID ZZ76543\uA6EF1\nPaid 01/02/2020', 'ID [MEMBER_ID]\nPaid 01/02/2020'),
    // A run that no match of the call's own covers whole stays as written, and the letter is refused for it.
    refused('ID 9ZZ76543\uA6EF1\n01-02-2020'),
    refused('ID ZZ76543\uA6EF1X\n01-02-2020'),
    refused('ID ZZ76543\uA6EF12\n01-02-2020'),
  ])('the withheld match, where one member ID ends another: %j %s', (letter, _outcome, sent) => {
    expect(outcome(letter, ENDS, ENDS_CLAIMS), JSON.stringify(letter)).toBe(sent);
  });
  it('the withheld match: with one member ID alone the same letter is sent the same way', () => {
    expect(outcome('ID ZZ76543\uA6EF1\n01-02-2020', patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321']), claimsOf('SYNCLAIM0001'))).toBe('ID [MEMBER_ID]');
  });
  // The same invariant as the property below, for the patient its generator does not draw: whatever the letter reader
  // leaves as written that redactLetter replaces, the check refuses.
  it('refuses every letter in which a match is left as written beside a member ID that ends another, written with look-alikes (property)', () => {
    const id = fc.constantFrom('ZZ76543\uA6EF1', 'ZZ765\uA6EF321', 'ZZ7654\u09E921', '76543\uA6EF1');
    const lead = fc.constantFrom('ID ', 'Member ID: ', 'Call ', '', HELD);
    const gap = fc.constantFrom('\n', ' \n', ' ', '. ', '-', '');
    const tail = fc.constantFrom('01-02-2020', '202-555-0123', '555 0123', '00-12-3456', '900 12 3456', '2025550123');
    fc.assert(
      fc.property(lead, id, gap, tail, fc.constantFrom('', ' Paid', '.', ' Zephyra'), (start, written, between, number, end) => {
        const letter = `${start}${written}${between}${number}${end}`;
        const screened = redactLetterForScreen(letter, ENDS, ENDS_CLAIMS).text;
        if (screened !== redactLetter(letter, ENDS, ENDS_CLAIMS).text) {
          expect(holdsIdentifier(screened, ENDS, ENDS_CLAIMS), JSON.stringify(letter)).toBe(true);
        }
      }),
      { numRuns: 600 },
    );
  });

  // L-1 (the review of that delta): a pattern's number that merges under one of the call's own placeholders is hidden
  // in what is sent, and the one-patient screen is still offered it as it is written, as ef3e8d20 offers it. Before, a
  // merged span hid the number from the screen's reading too: for a patient with one identifier since the look-alike
  // forms were first read, and for one whose identifier ends or begins another once the withheld match was applied.
  it.each([
    ['one member ID', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314'], [['SYNCLAIM0001']], 'Member ID: [MEMBER_ID]\nPaid in full.', '5550123'],
    ['a member ID that ends another', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314', '800314'], [['SYNCLAIM0001']], 'Member ID: [MEMBER_ID]\nPaid in full.', '5550123'],
    ['a claim number that ends another', 'Claim SYN445S667\n555-0123', ['ZZ7654321'], [['SYN4455667', '4455667']], 'Claim [CLAIM_1]', '5550123'],
    ['a member ID that begins another', '7654E210 555-0123', ['7654321', '76543210'], [['SYNCLAIM0001']], '[MEMBER_ID]', '5550123'],
    ['the withheld match’s own letter', 'ID ZZ76543\uA6EF1\n01-02-2020', ['ZZ7654321', '7654321'], [['SYNCLAIM0001']], 'ID [MEMBER_ID]', '01022020'],
    // M-1 (the review of that fix): a piece of the hidden number that is itself a short identifier of the call's own is
    // the number's there, as it is wherever such an identifier stands inside a pattern's number (R6b).
    ['a claim number that is the number’s last piece', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314'], [['0123']], 'Member ID: [MEMBER_ID]\nPaid in full.', '5550123'],
    ['a member ID that is the number’s first piece', 'Member ID: ZZ1980O314\n555-0123\nPaid in full.', ['ZZ19800314', '555'], [['SYNCLAIM0001']], 'Member ID: [MEMBER_ID]\nPaid in full.', '5550123'],
    ['nested member IDs and a short claim number in the number', '7654E210 555-0123', ['7654321', '76543210'], [['0123']], '[MEMBER_ID]', '5550123'],
    ['a short member ID in the number after a claim number that ends another', 'Claim SYN445S667\n555-0123', ['ZZ7654321', '0123'], [['SYN4455667']], 'Claim [CLAIM_1]', '5550123'],
  ] as const)('L-1, %s: %j is sent with the number hidden and the screen is offered it', (_row, letter, memberIds, claimNumbers, sent, offered) => {
    const patient = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], [...memberIds]);
    const claims = claimNumbers.map((numbers, index) => ({ claimId: `synthetic-claim-21-${String(index + 1)}`, patientPseudonym: 'synthetic-patient-21', claimNumbers: [...numbers] }));
    const screened = redactLetterForScreen(letter, patient, claims);
    expect(screened.text).toBe(sent);
    expect(holdsIdentifier(screened.text, patient, claims)).toBe(false);
    expect(screened.candidates).toContain(offered);
    for (const own of [...memberIds, ...claimNumbers.flat()]) {
      expect(screened.candidates).not.toContain(own);
    }
  });

  // N-1, N-2 (the review of M-1's fix), recorded and pinned as offered today: an identifier of the call's own that stands
  // inside a hidden number is the number's in the screen's second reading, so the screen is asked about it joined to what
  // follows, or in another script's digits, where no tree before asked: more asked of the practice's own records, nothing
  // more sent, and never the identifier's own compact form. Every tree asks the same where the number is sent as [PHONE].
  it.each([
    ['joined to what follows', 'ID 77 202-555-0123 88', 'ID [MEMBER_ID] 88', '555012388'],
    ['written with another script’s digit', 'ID 77 202-555-\u0660123', 'ID [MEMBER_ID]', '555\u0660123'],
  ] as const)('N-1, N-2, recorded: a member ID inside a hidden number, %s, is offered to the screen (%j)', (_row, letter, sent, offered) => {
    const patient = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['77202', '5550123']);
    const claims = claimsOf('SYNCLAIM0001');
    const screened = redactLetterForScreen(letter, patient, claims);
    expect(screened.text).toBe(sent);
    expect(holdsIdentifier(screened.text, patient, claims)).toBe(false);
    expect(screened.candidates).toContain(offered);
    expect(screened.candidates).not.toContain('5550123');
    expect(screened.candidates).not.toContain('77202');
  });

  // The invariant behind B1-1 and C1-1: whatever redactLetterForScreen leaves as written that redactLetter replaces, the
  // check refuses.
  it('refuses every letter in which the letter reader left a match as written (property)', () => {
    const label = fc.constantFrom('Phone', 'Tel', 'Call', 'SSN', 'Fax', 'Contact');
    const own = fc.constantFrom(' Zephyra', ' Jane Zephyra', ' ZZ7654321', ' 1:', ' (2):', ' ZЕPHYRA', ' Zeph·yra', ' SYNMEMBERO042', ' VANTR3E', '');
    const number = fc.constantFrom('555-0123', '2025550123', '900-12-3456', '90012-3456', '555 0124', '900 12 34.56', 'XXXXX3456');
    const joiner = fc.constantFrom(' ', ': ', ' at ', '\n', ' - ');
    const between = fc.constantFrom('/', ' ', ', ', '/​', '​/', '\n', ' or ', '-', ' 150.00 ');
    const frame = fc.constantFrom('', HELD, 'Paid $0,000.00. ', 'Re: ');
    fc.assert(
      fc.property(frame, label, own, joiner, number, fc.option(fc.tuple(between, number), { nil: undefined }), fc.constantFrom('', ' Paid', '.', 'x'), (start, word, identifier, gap, first, second, end) => {
        const letter = `${start}${word}${identifier}${gap}${first}${second === undefined ? '' : `${second[0]}${second[1]}`}${end}`;
        const patient = patientOf(['JANE Q ZEPHYRA', 'SIMONE VANTREE'], ['1980-03-14'], ['SYNMEMBER0042', 'ZZ7654321']);
        const screened = redactLetterForScreen(letter, patient, JANE_CLAIMS).text;
        if (screened !== redactLetter(letter, patient, JANE_CLAIMS).text) {
          expect(holdsIdentifier(screened, patient, JANE_CLAIMS), JSON.stringify(letter)).toBe(true);
        }
      }),
      { numRuns: 600 },
    );
  });
});

/**
 * Queues item 34 (test matrix MOD-25): the forms item 26 left in clear, each rule in the letter reader's wider reading
 * or beside it in the check, so that the first reading is as it was and every rule only adds. Each row was sent in clear
 * on a97d73e4. SYNTHETIC only: the twins of the suites above.
 */
describe('MOD-25: a stored number written with other marks than the records hold, one piece of it, and its digits glued to a letter', () => {
  const claims = claimsOf('SYNCLAIM0001');
  const heldAs = (...memberIds: string[]) => patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], memberIds);
  /** The same letter through redactLetter, then the check from nothing: the path with no screen. */
  const letterPath = (letter: string, patient: PatientIdentifiers, numbers: readonly LetterClaim[]) => {
    const sent = redactLetter(letter, patient, numbers).text;
    return holdsIdentifier(sent, patient, numbers) ? REFUSED : sent;
  };

  describe('A-5: where the records write a separator, any run of marks joins', () => {
    it.each(['.', ',', '+', '*', ':', '#', ' / ', '. ', ' - ', '\u3002', '\u30FB', '=', '(', ')', '&', './', ' , ', '\t:\t', '\n/'])('redacts a member ID held "ZZ12345/01" written with %j where the records write the slash', (between) => {
      const held = heldAs('ZZ12345/01');
      const letter = `The member ZZ12345${between}01 was paid short.`;
      expect(sentOrRefused(letter, held, claims)).toBe('The member [MEMBER_ID] was paid short.');
      expect(letterPath(letter, held, claims)).toBe('The member [MEMBER_ID] was paid short.');
      expect(holdsIdentifier(letter, held, claims)).toBe(true);
      // In a held letter the first reading's check refuses, nothing of the wider reading is applied: refused as before.
      // (A joiner is the first reading's own: with " - " or U+30FB the base replaced the number, there too.)
      expect(sentOrRefused(`${HELD}${letter}`, held, claims)).toBe([' - ', '\u30FB'].includes(between) ? `${HELD}The member [MEMBER_ID] was paid short.` : REFUSED);
    });

    it.each(['/', '.', ',', '+', ' / ', '&', '*', ':', '#'])('reads a member ID held with %j between two digits written with any other of them', (separator) => {
      const held = heldAs(`ZZ12345${separator}01`);
      for (const between of ['/', '.', ',', '+', '&', '*', ':', '#', ' . ']) {
        expect(sentOrRefused(`The member ZZ12345${between}01 was paid short.`, held, claims), between).toBe('The member [MEMBER_ID] was paid short.');
      }
    });

    it('joins only where the records write a separator, and never over a letter, a digit or a placeholder', () => {
      // A number neither of whose pieces is one of its own (rule (c): each is under five characters).
      const held = heldAs('ZZ12/3401');
      expect(sentOrRefused('The member ZZ12.3401 was paid short.', held, claims)).toBe('The member [MEMBER_ID] was paid short.');
      // Between two digits where the records hold none: as on the base.
      for (const letter of ['The member ZZ123+401 was paid short.', 'The member ZZ1,23401 was paid short.', 'The member ZZ12/34,01 was paid short.']) {
        expect(sentOrRefused(letter, held, claims), letter).toBe(letter);
      }
      // A letter or a digit in the run: another value.
      for (const letter of ['The member ZZ12x3401 was paid short.', 'The member ZZ12 / 9 / 3401 was paid short.', 'The member ZZ12 or 3401 was paid short.']) {
        expect(sentOrRefused(letter, held, claims), letter).toBe(letter);
      }
      // A placeholder is none of the marks a run joins over: the check reads no number through one.
      expect(holdsIdentifier('The member ZZ12 [PATIENT_NAME] 3401 was paid short.', held, claims)).toBe(false);
      expect(holdsIdentifier('The member ZZ12 . 3401 was paid short.', held, claims)).toBe(true);
      // Where the run holds a digit and a piece is a number of its own, the piece alone is replaced.
      expect(sentOrRefused('The member ZZ12345 / 9 / 01 was paid short.', heldAs('ZZ12345/01'), claims)).toBe('The member [MEMBER_ID] / 9 / 01 was paid short.');
    });

    it('keeps the first reading’s exceptions: an amount after a currency sign, and a whole written date with no label', () => {
      const patient = heldAs('SYNMEMBER0042');
      // The recorded cost: a claim number held "1234/56" replaces "1234.56" where no currency sign stands before it.
      expect(sentOrRefused('Paid $1,234.56 for 1234.56 units', patient, claimsOf('1234/56'))).toBe('Paid $1,234.56 for [CLAIM_1] units');
      // Recorded too: after a currency sign as well, as the base did for a claim number held "1234.56" (isAmount asks for cents after the number).
      expect(sentOrRefused('Paid $1234.56 on the claim', patient, claimsOf('1234/56'))).toBe('Paid $[CLAIM_1] on the claim');
      expect(sentOrRefused('Paid $15,000.00 on the claim', patient, claimsOf('15/000'))).toBe('Paid $15,000.00 on the claim');
      expect(sentOrRefused('Paid for 15,000 on the claim', patient, claimsOf('15/000'))).toBe('Paid for [CLAIM_1] on the claim');
      expect(sentOrRefused('Seen 2026.03.05 and paid', patient, claimsOf('2026/03/05'))).toBe('Seen 2026.03.05 and paid');
      expect(sentOrRefused('Seen 2026-03-05 and paid', patient, claimsOf('2026/03/05'))).toBe('Seen 2026-03-05 and paid');
      expect(sentOrRefused('Claim 2026.03.05 was paid', patient, claimsOf('2026/03/05'))).toBe('Claim [CLAIM_1] was paid');
    });

    it('never sends a stored number written with a run of marks where the records write one, and keeps what the first reading does (property)', () => {
      const mark = fc.constantFrom('/', '.', ',', '+', '*', ':', '#', '&', '=', ' ', '-', '(', ')', '\u3002', '\t', '%', '!', '?', '@', '^', '<', '>', '{', '}');
      const run = fc.array(mark, { minLength: 1, maxLength: 4 }).map((marks) => marks.join(''));
      const frame = fc.constantFrom(['The member ', ' was paid short.'], ['', ''], ['Re: ', '\r\nPaid 150.00'], ['Member ID: ', '.'], ['(', ')'], [HELD, ' Paid']);
      const stored = fc.constantFrom('/', '+', '.', ' ', '*', '#');
      fc.assert(
        fc.property(stored, run, frame, (separator, between, [before, after]) => {
          const held = heldAs(`ZZ12345${separator}01`);
          // The same number held with nothing between: its first reading is the held number's own first reading.
          const plain = heldAs('ZZ1234501');
          const letter = `${before}ZZ12345${between}01${after}`;
          const sent = sentOrRefused(letter, held, claims);
          const first = sentOrRefused(letter, plain, claims);
          if (first === REFUSED) {
            expect(sent, JSON.stringify(letter)).toBe(REFUSED);
          }
          if (sent !== REFUSED) {
            expect(sent, JSON.stringify(letter)).not.toMatch(/12345|ZZ1/u);
            expect(holdsIdentifier(sent, plain, claims), JSON.stringify(letter)).toBe(false);
          }
        }),
        { numRuns: 400 },
      );
    });
  });

  describe('(c): one piece of a stored number, of five characters or more and holding a digit, is a number of its kind', () => {
    it.each([' ', '/', '-', '_', '.', '+', ' / ', '#'])('redacts the piece "ZZ12345" of a member ID held with %j before "01"', (separator) => {
      const held = heldAs(`ZZ12345${separator}01`);
      for (const [letter, sent] of [
        ['The member ZZ12345 was paid short.', 'The member [MEMBER_ID] was paid short.'],
        ['Member ID: ZZ12345', 'Member ID: [MEMBER_ID]'],
        ['Re: zz-12345, paid', 'Re: [MEMBER_ID], paid'],
      ] as const) {
        expect(sentOrRefused(letter, held, claims), letter).toBe(sent);
        expect(letterPath(letter, held, claims), letter).toBe(sent);
        expect(holdsIdentifier(letter, held, claims), letter).toBe(true);
      }
    });

    it('redacts a piece of digits alone, and each piece of five characters or more', () => {
      expect(sentOrRefused('Member ID: 12345', heldAs('12345 01'), claims)).toBe('Member ID: [MEMBER_ID]');
      expect(sentOrRefused('The visit for 12345 was paid.', heldAs('12345 01'), claims)).toBe('The visit for [MEMBER_ID] was paid.');
      const three = heldAs('AB123-45678-XY9ZZ');
      expect(sentOrRefused('See AB123, then 45678, then XY9ZZ.', three, claims)).toBe('See [MEMBER_ID], then [MEMBER_ID], then [MEMBER_ID].');
    });

    it('gives a claim number’s piece that claim’s placeholder, the first in the call’s order where two share it', () => {
      const patient = heldAs('SYNMEMBER0042');
      expect(sentOrRefused('Ref AB12345 was denied.', patient, claimsOf('SYNCLAIM0001', 'AB12345/777'))).toBe('Ref [CLAIM_2] was denied.');
      expect(sentOrRefused('Ref AB12345 was denied.', patient, claimsOf('AB12345/01', 'AB12345/02'))).toBe('Ref [CLAIM_1] was denied.');
      expect(sentOrRefused('Ref AB12345 was denied.', heldAs('AB12345 9'), claimsOf('AB12345/01'))).toBe('Ref [CLAIM_1] was denied.');
    });

    it('keeps the first reading’s exceptions for a piece: an amount, and a whole written date with no label', () => {
      const patient = heldAs('SYNMEMBER0042');
      expect(sentOrRefused('Paid $15000.00 on the claim', patient, claimsOf('15000 77'))).toBe('Paid $15000.00 on the claim');
      // With only one of the two, a currency sign or cents, the digits stay the claim's, as a whole claim number's do.
      expect(sentOrRefused('Paid $15000 on the claim', patient, claimsOf('15000 77'))).toBe('Paid $[CLAIM_1] on the claim');
      expect(sentOrRefused('Seen 2026-11-15 and paid', patient, claimsOf('20261115 000123'))).toBe('Seen 2026-11-15 and paid');
      // The recorded cost: a piece that is a compact date replaces that date written compact.
      expect(sentOrRefused('Seen 20261115 and paid', patient, claimsOf('20261115 000123'))).toBe('Seen [CLAIM_1] and paid');
    });

    it('pins what is left, the recorded residual: a piece under five characters, or of letters alone, is sent as written', () => {
      expect(sentOrRefused('The visit for 1234 was paid.', heldAs('1234 567890'), claims)).toBe('The visit for 1234 was paid.');
      expect(sentOrRefused('Line 01 was paid.', heldAs('ZZ12345 01'), claims)).toBe('Line 01 was paid.');
      expect(sentOrRefused('The Abcdef plan paid.', heldAs('ABCDEF 12345'), claims)).toBe('The Abcdef plan paid.');
      expect(sentOrRefused('The ZZ plan paid.', heldAs('ZZ 12345'), claims)).toBe('The ZZ plan paid.');
      // The floor is the piece's letters and digits: four of them with a joiner are four.
      expect(sentOrRefused('The visit for A-123 was paid.', heldAs('A123 567890'), claims)).toBe('The visit for A-123 was paid.');
    });

    it('never sends a piece of five characters or more that stands whole, and keeps what the first reading does (property)', () => {
      const separator = fc.constantFrom(' ', '/', '-', '.', '+', '_', '  ', ' / ');
      const frame = fc.constantFrom(['The member ', ' was paid short.'], ['', ''], ['Re: ', '\r\nPaid 150.00'], ['Member ID: ', '.'], ['(', ')'], ['ID#', ','], [HELD, ' Paid']);
      const written = fc.constantFrom('ZZ12345', 'zz12345', 'ZZ-12345', 'ZZ 12345', 'Z Z 1 2 3 4 5', '66778', '6-6-7-7-8', '66 778');
      fc.assert(
        fc.property(separator, written, frame, (between, piece, [before, after]) => {
          const held = heldAs(`ZZ12345${between}66778`);
          const plain = heldAs('ZZ1234566778');
          const letter = `${before}${piece}${after}`;
          const sent = sentOrRefused(letter, held, claims);
          if (sentOrRefused(letter, plain, claims) === REFUSED) {
            expect(sent, JSON.stringify(letter)).toBe(REFUSED);
          }
          if (sent !== REFUSED) {
            expect(sent.replace(/Paid 150\.00|01\/01\/2020-150\.00/gu, ''), JSON.stringify(letter)).not.toMatch(/[0-9]/u);
            expect(holdsIdentifier(sent, plain, claims), JSON.stringify(letter)).toBe(false);
          }
        }),
        { numRuns: 400 },
      );
    });
  });

  describe('(a): a member ID or claim number of digits alone, of five digits or more, glued to a letter is refused', () => {
    const digits = heldAs('76543210');

    // Each was sent in clear on a97d73e4: the first reading reads no number with a letter against it, unless a label word is.
    it.each([
      'Fax X76543210 ext 12',
      'Ref XYZ76543210 on file.',
      'Ref 76543210B on file.',
      'Ref XYZ7654 3210 on file.',
      'Fax X7654-3210 ext',
      'Fax 76 54 32 10B ext',
      'Fax X7654\r\n3210 ext',
      'Room AB76543210',
      // The other side is not asked: a joiner and digits, or digits alone, after a number a letter stands before.
      'Ref XYZ76543210-01 on file.',
      'Ref XYZ76543210123 on file.',
      // NFKC writes full-width digits as ASCII; another script's digits are the number's on the folded view.
      'Fax X７６５４３２１０ ext',
      'Fax X٧٦٥٤٣٢١٠ ext',
      // Any letter: another script's, and a modifier letter the first reading takes for one (U+02BC).
      'Fax Х76543210 ext',
      'Fax 中76543210 ext',
      'Fax ʼ76543210 ext',
    ])('refuses %j for a member ID 76543210, and redactLetter leaves it as written for the check to refuse', (letter) => {
      expect(sentOrRefused(letter, digits, claims)).toBe(REFUSED);
      expect(holdsIdentifier(redactLetter(letter, digits, claims).text, digits, claims)).toBe(true);
      // A claim number is read as a member ID is.
      expect(sentOrRefused(letter, heldAs('SYNMEMBER0042'), claimsOf('SYNCLAIM0001', '76543210'))).toBe(REFUSED);
    });

    it('reads the number in each of its wider forms: as the records hold it, with a run of marks there, and each piece', () => {
      for (const letter of ['Fax X7654/3210 ext', 'Fax X7654.3210 ext', 'Fax 7654:3210B ext', 'Fax X76543210 ext', 'Fax X7654 # 3210 ext']) {
        expect(sentOrRefused(letter, heldAs('7654/3210'), claims), letter).toBe(REFUSED);
      }
      for (const letter of ['Fax X76543 ext', 'Fax 21098B ext', 'Fax X7-6-5-4-3 ext']) {
        expect(sentOrRefused(letter, heldAs('76543 21098'), claims), letter).toBe(REFUSED);
      }
      // A piece of digits alone of a number that holds letters is a number of its kind (rule (c)), and is read so here.
      for (const letter of ['Fax XQ7654321 ext', 'Fax 7654321B ext']) {
        expect(sentOrRefused(letter, heldAs('ZZ 7654321'), claims), letter).toBe(REFUSED);
      }
    });

    it('has no date or amount exception: the number’s digits written as a date against a word are refused', () => {
      const patient = heldAs('SYNMEMBER0042');
      expect(sentOrRefused('Seen 2026-11-15Paid in full', patient, claimsOf('20261115'))).toBe(REFUSED);
      expect(sentOrRefused('Seen 20261115Paid in full', patient, claimsOf('20261115'))).toBe(REFUSED);
      // Set apart from the word the date stays, as the first reading keeps it.
      expect(sentOrRefused('Seen 2026-11-15 Paid in full', patient, claimsOf('20261115'))).toBe('Seen 2026-11-15 Paid in full');
    });

    // The floor (WIDER_NUMBER_FLOOR; designs/lane-b-redact-item-34, measure/floor-edges.out): five digits are refused; four are
    // sent, THE RECORDED RESIDUAL of docs/adr/0054: a code is glued to a letter by its own format ("G0283").
    it.each([
      ['12345', 'Account12345 was paid', REFUSED],
      ['12345', 'Fax X12345 ext', REFUSED],
      ['97110', 'Billed 97110GP twice', REFUSED],
      ['012345', 'Billed G012345 twice', REFUSED],
      ['1234', 'Account1234 was paid', 'Account1234 was paid'],
      ['1234', 'Fax X1234 ext', 'Fax X1234 ext'],
      ['0283', 'Billed G0283 twice', 'Billed G0283 twice'],
      ['283', 'Billed G0283B twice', 'Billed G0283B twice'],
      // A label word glued to the number is the first reading's own, at any length: replaced, as on the base.
      ['12345', 'Acct12345 was paid', 'Acct[CLAIM_1] was paid'],
      ['1234', 'Acct1234 was paid', 'Acct[CLAIM_1] was paid'],
    ])('the floor’s edges: for a claim number %s, %j', (number, letter, sent) => {
      expect(sentOrRefused(letter, heldAs('SYNMEMBER0042'), claimsOf(number))).toBe(sent);
    });

    it('pins what is left, recorded: a digit right beside the number is another, longer number and is sent as written', () => {
      for (const letter of ['Ref 976543210 on file.', 'Ref 0076543210 on file.', 'Ref 7654321001 on file.', 'Ref 765432109B on file.', 'Ref B0076543210 on file.']) {
        expect(sentOrRefused(letter, digits, claims), letter).toBe(letter);
      }
    });

    it('leaves what the first reading reads and what is no writing of the number', () => {
      expect(sentOrRefused('Fax 76543210 ext 12', digits, claims)).toBe('Fax [MEMBER_ID] ext 12');
      expect(sentOrRefused('Fax x_76543210 ext', digits, claims)).toBe('Fax x_[MEMBER_ID] ext');
      expect(sentOrRefused('Fax X​76543210 ext', digits, claims)).toBe('Fax X​[MEMBER_ID] ext');
      expect(sentOrRefused('Fax X76543211 ext 12', digits, claims)).toBe('Fax X76543211 ext 12');
      expect(sentOrRefused('Fax X7654 or 3210 ext', digits, claims)).toBe('Fax X7654 or 3210 ext');
      // A number that holds a letter is not this rule's: glued to a word it is as it was.
      const lettered = 'Fax XZ7654321 ext';
      expect(sentOrRefused(lettered, heldAs('76543ZZ'), claims)).toBe(lettered);
    });

    // A call of its own for every run (the number is drawn), so each builds its patterns: no budget, only how long it may hang.
    it('never sends a digits-only number of 5 to 12 digits with a letter against it, however it is joined (property)', { timeout: 60_000 }, () => {
      const number = fc.stringMatching(/^[0-9]{5,12}$/);
      const letterOf = fc.constantFrom('X', 'a', 'Q', 'é', 'Ж', '中', 'I', 'O');
      const joiner = fc.constantFrom('', '', '-', ' ', '_', '\r\n', '\n');
      const frame = fc.constantFrom(['Fax ', ' ext 12'], ['', ''], ['Re: ', '\r\nPaid 150.00'], ['(', ')'], [HELD, ' Paid']);
      fc.assert(
        fc.property(number, fc.option(letterOf, { nil: '' }), fc.option(letterOf, { nil: '' }), joiner, fc.nat(), fc.boolean(), frame, (value, left, right, between, at, asClaim, [before, after]) => {
          fc.pre(left !== '' || right !== '');
          const cut = 1 + (at % (value.length - 1));
          const written = `${value.slice(0, cut)}${between}${value.slice(cut)}`;
          const letter = `${before}${left}${written}${right}${after}`;
          const patient = heldAs(asClaim ? 'SYNMEMBER0042' : value);
          const numbers = asClaim ? claimsOf(value) : claims;
          const sent = sentOrRefused(letter, patient, numbers);
          if (sent !== REFUSED) {
            // Sent only where the first reading replaced the number (a label word against it): never with its digits.
            expect(sent, JSON.stringify(letter)).not.toContain(written);
            expect(sent.replace(/[^0-9]/gu, ''), JSON.stringify(letter)).not.toContain(value);
          }
        }),
        { numRuns: 300 },
      );
    });
  });

  describe('A-4: inside a part of a name, any run of marks joins', () => {
    const patient = heldAs('SYNMEMBER0042');
    const MARKS = [', ', ',', '(', ')', '。', '*', '/', '+', ': ', '; ', '&', '=', '#', '!', '?', '"', '%', '@', '<', '>', '{', '|', '~', '^', '\\', '・', '…', ' / ', '., ', '\n, ', ' * '];

    it.each(MARKS)('redacts a part written with %j inside it', (between) => {
      const letter = `Dear Zephy${between}ra, your claim`;
      expect(sentOrRefused(letter, patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
      expect(letterPath(letter, patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
      expect(holdsIdentifier(letter, patient, claims)).toBe(true);
    });

    it('reads a mark between every two letters, and marks of several kinds in one name', () => {
      expect(sentOrRefused('Dear Z,e,p,h,y,r,a: your claim', patient, claims)).toBe('Dear [PATIENT_NAME]: your claim');
      expect(sentOrRefused('Dear Ze/ph*yr+a and Ja, ne.', patient, claims)).toBe('Dear [PATIENT_NAME] and [PATIENT_NAME].');
    });

    it('joins nothing over a letter, a digit or a placeholder', () => {
      for (const letter of ['Dear Zephy x ra, your claim', 'Dear Zephy 2 ra, your claim']) {
        expect(sentOrRefused(letter, patient, claims), letter).toBe(letter);
      }
      // A placeholder is one of the checks' marks to the check, and no mark of a run: the pieces on its two sides are no name.
      for (const redacted of ['Dear Zephy [PHONE] ra, your claim', 'Dear Zephy [SSN] ra, your claim', 'Dear Zephy [CLAIM_1] ra, your claim', 'Dear Zephy [MEMBER_ID] ra, your claim']) {
        expect(holdsIdentifier(redacted, patient, claims), redacted).toBe(false);
      }
    });

    it('in a held letter, which the first reading’s check refuses or sends on its own reading, shows no more than before', () => {
      for (const between of MARKS) {
        const sent = sentOrRefused(`${HELD}Dear Zephy${between}ra, your claim`, patient, claims);
        expect(sent === REFUSED || sent === `${HELD}Dear [PATIENT_NAME], your claim`, between).toBe(true);
      }
    });

    // The accepted costs (the orchestrator's ruling of 2026-11-12 on the design's third question): each a placeholder, never a leak.
    it.each([
      ['HO VANTREE', 'Pt with h/o low back pain.', 'Pt with [PATIENT_NAME] low back pain.'],
      ['NA VANTREE', 'Modifier: N/A for this line.', 'Modifier: [PATIENT_NAME] for this line.'],
      ['LE VANTREE', 'Strength of L/E reduced.', 'Strength of [PATIENT_NAME] reduced.'],
      ['WO VANTREE', 'Seen w/o referral.', 'Seen [PATIENT_NAME] referral.'],
      ['NEWMAN UNDERWOOD', 'It is new, man. Under/wood.', 'It is [PATIENT_NAME].'],
    ])('the accepted cost, pinned: for a patient %s, %j is sent with a placeholder', (name, letter, sent) => {
      expect(sentOrRefused(letter, patientOf([name]), claims)).toBe(sent);
    });

    it('property: a name’s part written with any run of marks inside it is never sent', () => {
      const mark = fc.constantFrom(...MARKS, ' ', '.', '-', '\r\n', '·', '_');
      fc.assert(
        fc.property(fc.constantFrom('ZEPHYRA', 'Zephyra', 'zephyra'), fc.integer({ min: 1, max: 6 }), fc.array(mark, { minLength: 1, maxLength: 3 }), fc.constantFrom('Dear ', 'Re: ', '(', ''), fc.constantFrom(', your claim', '.', ''), (name, cut, marks, before, after) => {
          const written = `${name.slice(0, cut)}${marks.join('')}${name.slice(cut)}`;
          const sent = sentOrRefused(`${before}${written}${after}`, patient, claims);
          if (sent !== REFUSED) {
            expect(sent, JSON.stringify(written)).toBe(`${before}[PATIENT_NAME]${after}`);
          }
        }),
        { numRuns: 300 },
      );
    });
  });

  describe('(b): a name the records hold with a mark between two words is each of its words', () => {
    const named = (name: string) => patientOf([name]);

    it.each(['+', '&', '*', ':', '(', '=', '#', ' + ', ' & ', '|', '\\', '@', '!'])('reads each word of a name held with %j between two words', (mark) => {
      const patient = named(`JANE${mark}ZEPHYRA`);
      expect(sentOrRefused('Ms. Zephyra was seen.', patient, claims)).toBe('Ms. [PATIENT_NAME] was seen.');
      expect(sentOrRefused('Seen: JANE, twice.', patient, claims)).toBe('Seen: [PATIENT_NAME], twice.');
      expect(sentOrRefused('Dear Jane Zephyra, your claim', patient, claims)).toBe('Dear [PATIENT_NAME], your claim');
      expect(letterPath('Ms. Zephyra was seen.', patient, claims)).toBe('Ms. [PATIENT_NAME] was seen.');
      expect(holdsIdentifier('Ms. Zephyra was seen.', patient, claims)).toBe(true);
    });

    it.each(['ZEPHYRA(JANE)', 'ZEPHYRA*JANE', 'ZEPHYRA:JANE', 'ZEPHYRA [JANE]', 'ZEPHYRA+JANE+Q'])('reads a name held %j written first name first, each word as of the name held with spaces', (name) => {
      expect(sentOrRefused('Dear Jane Zephyra, your claim', named(name), claims)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME], your claim');
      expect(sentOrRefused('Dear Jane Zephyra, your claim', named('ZEPHYRA JANE Q'), claims)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME], your claim');
      expect(sentOrRefused('Dear Zephyra, Jane: your claim', named(name), claims)).toMatch(/^Dear \[PATIENT_NAME\](?:, \[PATIENT_NAME\])?: your claim$/u);
      expect(sentOrRefused('Dear Zephyra, your claim', named(name), claims)).toBe('Dear [PATIENT_NAME], your claim');
    });

    it('takes an initial of a word split so next to the name, as of a word held with a space', () => {
      expect(sentOrRefused('Dear J. Zephyra, your claim', named('JANE+ZEPHYRA'), claims)).toBe(sentOrRefused('Dear J. Zephyra, your claim', named('JANE ZEPHYRA'), claims));
      expect(sentOrRefused('Dear Jane Z., your claim', named('JANE+ZEPHYRA'), claims)).toBe(sentOrRefused('Dear Jane Z., your claim', named('JANE ZEPHYRA'), claims));
      expect(sentOrRefused('Dear Jane Z., your claim', named('JANE+ZEPHYRA'), claims)).not.toContain('Jane');
    });

    it('keeps the parts the records’ own split reads: a dash or an apostrophe splits no word', () => {
      // "VAN-TREE" is one word of two parts on the base and here: each part and the word are read, as before.
      expect(sentOrRefused('Dear Van-tree, your claim', named('JANE+VAN-TREE'), claims)).toBe('Dear [PATIENT_NAME], your claim');
      expect(sentOrRefused('Dear Vantree, your claim', named('JANE+VAN-TREE'), claims)).toBe('Dear [PATIENT_NAME], your claim');
    });

    it('the cost, pinned: what the name held with a space costs today', () => {
      expect(sentOrRefused('Billed to Medicare.', named('ZEPHYRA*MEDICARE'), claims)).toBe(sentOrRefused('Billed to Medicare.', named('ZEPHYRA MEDICARE'), claims));
      expect(sentOrRefused('Billed to Medicare.', named('ZEPHYRA*MEDICARE'), claims)).toBe('Billed to [PATIENT_NAME].');
    });

    it('left, the recorded residual: a name the records glue to a digit or to another word is one word, no split known', () => {
      expect(sentOrRefused('Ms. Zephyra was seen.', named('JANEZEPHYRA'), claims)).toBe('Ms. Zephyra was seen.');
      expect(sentOrRefused('Ms. Zephyra was seen.', named('ZEPHYRA2'), claims)).toBe('Ms. Zephyra was seen.');
    });

    it('counts the wider reading’s initials on the check’s work budget: a crafted letter past it is refused, never sent with the name', () => {
      // For JANE Q VANTREE held with spaces the first reading finds the name and its initials (403.5M of the 420M at 100,008
      // characters, sent). Held with a plus sign only the wider reading does, and the first reading's check is asked once
      // more: 273.0M for the redaction at 62,008 characters, sent; past the budget at 82,008 (the check's count) and at
      // 100,008 (the redaction's own), REFUSED. The base sent each with "Vantree" in clear.
      const letter = (initials: number) => `Vantree${' '.repeat(2_000)}x${' J'.repeat(initials)}`;
      const count = (initials: number) => {
        const screened = redactLetterForScreen(letter(initials), named('JANE+Q+VANTREE'), claims);
        return { work: checkWorkOf(screened), refused: holdsIdentifier(screened.text, named('JANE+Q+VANTREE'), claims, checkWorkOf(screened)), text: screened.text };
      };
      const sent = count(30_000);
      expect(sent.work).toBe(273_019_560);
      expect(sent.refused).toBe(false);
      expect(sent.text.startsWith('[PATIENT_NAME]')).toBe(true);
      expect(sent.text).not.toMatch(/vantree/iu);
      const past = count(49_000);
      expect(past.work).toBeGreaterThan(CHECK_WORK_BUDGET);
      expect(past.refused).toBe(true);
      expect(past.text).not.toMatch(/vantree/iu);
      expect(count(40_000).refused).toBe(true);
    });

    it('in a held letter shows no more than before', () => {
      const sent = sentOrRefused(`${HELD}Ms. Zephyra was seen.`, named('JANE+ZEPHYRA'), claims);
      expect(sent === REFUSED || sent === `${HELD}Ms. [PATIENT_NAME] was seen.`).toBe(true);
    });

    it('property: a word of a name held with a mark between its words is never sent, and the name held with a space is read no less', () => {
      const mark = fc.constantFrom('+', '&', '*', ':', '(', ')', '=', '#', '|', '@', ' + ', '++');
      const word = fc.constantFrom('JANE', 'ZEPHYRA', 'VANTREE', 'QUILLON');
      fc.assert(
        fc.property(fc.uniqueArray(word, { minLength: 2, maxLength: 3 }), fc.array(mark, { minLength: 2, maxLength: 2 }), fc.constantFrom('Dear ', 'Ms. ', ''), fc.constantFrom(', your claim', ' was seen.', ''), fc.boolean(), (words, marks, before, after, upper) => {
          const held = words.map((part, i) => `${part}${i + 1 < words.length ? (marks[i] ?? '+') : ''}`).join('');
          for (const part of words) {
            const written = upper ? part : `${part[0] ?? ''}${part.slice(1).toLowerCase()}`;
            const sent = sentOrRefused(`${before}${written}${after}`, named(held), claims);
            if (sent !== REFUSED) {
              expect(sent, `${held}: ${written}`).toBe(`${before}[PATIENT_NAME]${after}`);
            }
          }
        }),
        { numRuns: 200 },
      );
    });
  });
});
