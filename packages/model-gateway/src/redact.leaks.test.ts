import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type LetterClaim, type PatientIdentifiers, holdsIdentifier, redactLetter, redactLetterForScreen, redactionSpans } from './redact';

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
    // The bullet, the bullet operator and the dot operator join a name's pieces too; a full stop does not.
    expect(sentOrRefused('Dear Zeph\u2022yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Zeph\u2219yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear [PATIENT_NAME], your claim');
    expect(sentOrRefused('Dear Zeph.yra, your claim', JANE, JANE_CLAIMS)).toBe('Dear Zeph.yra, your claim');
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
describe('MOD-23 residuals (pinned as sent today; test-matrix MOD-23 closes them)', () => {
  const patient = patientOf(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042']);
  const claims = claimsOf('SYNCLAIM0001');

  it.each([
    ['a part split by a space, its second piece in small letters', 'Dear Zephy ra, your claim', 'Zephy ra'],
    ['a part split by a full stop and a space', 'Dear Zephy. ra, your claim', 'Zephy. ra'],
    ['each letter of the name alone, in small letters after the first', 'Dear Z e p h y r a, your claim', 'Z e p h y r a'],
    ['each letter of the name alone, in capitals', 'Dear Z E P H Y R A, your claim', 'Z E P H Y R A'],
  ])('sends the name written as %s in clear in a letter with no held range, and refuses it in a held letter: %j', (_what, letter, form) => {
    const screened = redactLetterForScreen(letter, patient, claims);
    expect(holdsIdentifier(screened.text, patient, claims)).toBe(false);
    expect(screened.text).toContain(form);
    expect(sentOrRefused(`${HELD}${letter}`, patient, claims)).toBe(REFUSED);
  });

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
  it.each([refused('SSN \u0003\n900.12 3456'), sentAs('Phone \u0003\n555-0123', 'Phone \u0003\n[PHONE]'), refused('SSN \u0001 900.12 3456')])('B1-4: a control character of the checks’ own in a letter is no placeholder: %j %s', (letter, _outcome, sent) => {
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
