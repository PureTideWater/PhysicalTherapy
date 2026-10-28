import { assemblePacket } from './assemble';
import type { FigureKind } from './scan';
import type { PacketContentV2 } from './format';
import { IDS, REGULATION, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord } from './test-support';

/**
 * Narratives that state an input's figure in another role, and narratives that state each figure in the role its
 * input holds (test matrix CAS-43 and CAS-44; docs/adr/0086), against SYNTHETIC packets. The base packet is CAS-08's:
 * three lines of 97110 x 2 on three claims for three patients, expected $100.00, allowed $70.00 and paid $56.00 each
 * (a $14.00 patient share), $300.00 expected against $210.00 allowed, a $90.00 shortfall, 6 units, the contract's
 * version 1 cited on page 2 (effective 2026-01-01), rule release 900001, the contract's dispute window of 3650 days
 * cited on page 1, service on 2026-03-05 to 2026-03-07, paid on 2026-04-08, the window ending 2036-04-05, at dispute
 * level 1, as of 2026-10-16. Each other packet changes what its name says.
 *
 * Every misstated narrative fails at exactly one figure, written as `figure`, of kind `kind`; every stated one passes.
 * CAS-44's hand-written forms (`handWritten`) are a person's ways of writing, none drawn from the drafting templates.
 */

export const ROLE_CONTENTS = [
  'base',
  'window10000',
  'page7',
  'page12345',
  'regulation',
  'names',
  'interest',
  'decimalUnits',
  'level2',
  'clause',
  'oneClaim',
  'section4',
  'medicare',
] as const;
export type RoleContent = (typeof ROLE_CONTENTS)[number];

/** The SYNTHETIC packets the examples are written against. */
export function roleContents(): Readonly<Record<RoleContent, PacketContentV2>> {
  const packet = (overrides: Parameters<typeof assemblyInput>[0] = {}) => assemblePacket(assemblyInput(overrides));
  return {
    base: packet(),
    // The reported defect: a window of 10000 days, which its clause states.
    window10000: packet({ deadlineSources: [contractWindowSource({ days: 10000, quote: 'Disputes are raised within 10000 days of the payment date.' })] }),
    page7: packet({ citation: contractCitation({ page: 7 }) }),
    page12345: packet({ citation: contractCitation({ page: 12345 }) }),
    regulation: packet({ citation: REGULATION }),
    names: packet({
      practice: { practice_id: IDS.practice, name: 'SYNTHETIC PT 12345 GROUP 77', npi: null, tax_id_last4: null },
      citation: contractCitation({ contract_title: 'SYNTHETIC AGREEMENT 2025', quote: 'Section 4 covers 12 visits; 97110 is paid 50.00 per unit' }),
    }),
    // Prompt-pay interest: 33 days to pay, due 2026-03-15, paid 24 days late, 215 days unpaid to the version's date,
    // 9% a year, $1.92 a line and $5.76 in all.
    interest: packet({
      interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      lines: [1, 2, 3].map((n) => line(n, { receivedOn: '2026-02-10' })),
    }),
    decimalUnits: packet({ lines: [1, 2, 3].map((n) => line(n, { units: '1.25' })) }),
    level2: packet({ disputeLevel: 2, nextLevelDeadline: { status: 'verified', source: 'contract', endsOn: '2026-12-15', cause: null } }),
    // A clause whose own words give its figures roles none of the record's figures has.
    clause: packet({ citation: contractCitation({ quote: 'A level 2 appeal is raised within 90 days on page 9; 97110 is paid 50.00 per unit up to 12 units, 4 claims a year' }) }),
    oneClaim: packet({ lines: [1, 2, 3].map((n) => line(n, { claimId: '20000000-0000-4000-8000-000000000001', patientKey: '40000000-0000-4000-8000-000000000001' })) }),
    section4: packet({ citation: contractCitation({ quote: 'Section 4 of this agreement pays 97110 at 50.00 per unit' }) }),
    medicare: packet({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percent: '112.5', year_basis: 'LOCKED:2025' }, quote: 'Payer pays 112.5% of the 2025 Medicare fee schedule' }) }),
  };
}

export interface MisstatedExample {
  readonly id: string;
  readonly content: RoleContent;
  readonly narrative: string;
  /** The one figure that fails, as written. */
  readonly figure: string;
  readonly kind: FigureKind;
}

export interface StatedExample {
  readonly id: string;
  readonly content: RoleContent;
  readonly narrative: string;
}

const misstated = (id: string, content: RoleContent, narrative: string, figure: string, kind: FigureKind = 'number'): MisstatedExample => ({ id, content, narrative, figure, kind });

/** CAS-43: a narrative states an input's figure in another role. Each fails at its figure. */
export const MISSTATED: readonly MisstatedExample[] = [
  // The reported defect and its family: the window's five-digit day count, which its clause states.
  misstated('A1 the window clause’s days as visits', 'window10000', 'It affected 10000 visits [3].', '10000'),
  misstated('A2 the window clause’s days as units', 'window10000', 'There were 10000 units [3].', '10000'),
  misstated('A3 the window clause’s days as a procedure code', 'window10000', 'CPT 10000 was billed [1].', '10000', 'code'),
  misstated('A4 the window clause’s days as the code of lines', 'window10000', 'The 10000 lines were short [3].', '10000', 'code'),
  // A date's year in another role.
  misstated('C1 a service year as claims', 'base', 'There were 2026 claims [3].', '2026'),
  misstated('C2 the window’s year as units', 'base', 'There were 2036 units [3].', '2036'),
  misstated('C3 a year as a page', 'base', 'The clause is on page 2026 [1].', '2026'),
  misstated('C4 a year as a release', 'base', 'Release 2026 priced the lines [2].', '2026'),
  misstated('C5 a year in words as claims', 'base', 'There were two thousand twenty-six claims [3].', 'two thousand twenty-six'),
  misstated('C6 a year as each line’s units', 'base', 'Three claims billed 97110 x 2026 [3].', '2026'),
  misstated('C7 a year as visits', 'base', 'It affected 2026 visits [3].', '2026'),
  misstated('C8 a year with no year’s words', 'base', 'The units billed came to 2026 [3].', '2026'),
  misstated('C9 a year after "to"', 'base', 'The count of short lines rose to 2026 [3].', '2026'),
  misstated('C10 the window’s year as a service year', 'base', 'The lines were billed in 2036 [3].', '2036'),
  misstated('C11 a service year as the window’s', 'base', 'The window ends in 2026 [1].', '2026'),
  misstated('C12 the window’s year in words as a payment year', 'base', 'The payer paid in the year two thousand thirty-six [3].', 'two thousand thirty-six'),
  // Releases, versions, levels and pages as counts, and the reverse.
  misstated('D1 a release as units', 'base', 'There were 900001 units [3].', '900001'),
  misstated('D2 a release as a page', 'base', 'The clause is on page 900001 [1].', '900001'),
  misstated('D3 a release as the code of lines', 'base', 'The 900001 lines were short [3].', '900001'),
  misstated('E1 the citation’s page as claims', 'page7', 'There were 7 claims [3].', '7'),
  misstated('E3 units as the dispute level', 'base', 'This is a level 2 appeal [1].', '2'),
  misstated('E4 units as the level in Roman numerals', 'base', 'This is a level II appeal [1].', 'II'),
  misstated('E5 units as the level as an ordinal', 'base', 'This is a second-level appeal [1].', 'second'),
  misstated('E6 units as the level in words', 'base', 'This is a level two appeal [1].', 'two'),
  misstated('E7 units as a version', 'base', 'The contract, version 2, applies [1].', '2'),
  misstated('E8 units as a release', 'base', 'Release 2 priced the lines [2].', '2'),
  misstated('E9 the pattern’s units as a page', 'base', 'The clause is on page 6 [1].', '6'),
  misstated('E10 the dispute level as claims', 'level2', 'There were 2 claims [3].', '2'),
  misstated('E11 the version as lines', 'base', 'There was 1 line [3].', '1'),
  misstated('E12 the lines as a page', 'base', 'Page 3 holds the clause [1].', '3'),
  // Day counts as other numbers, and as one another.
  misstated('F1 the days to pay as lines', 'interest', 'There were 33 lines [3].', '33'),
  misstated('F2 the days to pay as a page', 'interest', 'See page 33 [1].', '33'),
  misstated('F3 the days late as units', 'interest', 'There were 24 units [3].', '24'),
  misstated('F4 the days to pay as the dispute window', 'interest', 'Disputes are raised within 33 days [1].', '33'),
  misstated('F5 the days to pay as the days late', 'interest', 'The payer paid 33 days late [4].', '33'),
  misstated('F6 the window’s days as the days late', 'interest', 'The payer paid 3650 days late [4].', '3650'),
  misstated('F7 the window’s days as days elapsed', 'interest', 'There were 3650 days between service and payment [3].', '3650'),
  misstated('F8 calendar days as business days', 'base', 'Disputes are raised within 3650 business days [1].', '3650'),
  misstated('F9 the window’s days as a code', 'base', 'CPT 3650 was billed [1].', '3650'),
  misstated('F10 the window’s days in words as units', 'base', 'There were three thousand six hundred fifty units [3].', 'three thousand six hundred fifty'),
  misstated('F11 the window’s days as a row', 'base', 'The 3650th line was short [3].', '3650th'),
  // Quoted texts: a figure is repeated only as its text holds it, never in a role of the record's.
  misstated('G1 the regulation’s reference as claims', 'regulation', 'There were 42 claims [3].', '42'),
  misstated('G2 the regulation’s section as units', 'regulation', 'There were 422.214 units [3].', '422.214'),
  misstated('G3 the regulation’s reference as an amount', 'regulation', 'It paid 42.00 [3].', '42.00', 'amount'),
  misstated('G4 the practice’s name as units', 'names', 'There were 77 units [3].', '77'),
  misstated('G5 the practice’s name as a procedure code', 'names', 'CPT 12345 was billed [1].', '12345', 'code'),
  misstated('G6 the practice’s name as lines', 'names', 'There were 12345 lines [3].', '12345'),
  misstated('G7 the contract title’s year as claims', 'names', 'There were 2025 claims [3].', '2025'),
  misstated('G8 the clause’s visits as units', 'names', 'There were 12 units [3].', '12'),
  misstated('G9 the clause’s section as days', 'names', 'The payer had 4 days [1].', '4'),
  misstated('G10 the clause’s level as the dispute level', 'clause', 'This is a level 2 appeal [1].', '2'),
  misstated('G11 the clause’s days as the days late', 'clause', 'The payer paid 90 days late [3].', '90'),
  misstated('G12 the clause’s page as the citation’s', 'clause', 'The clause is on page 9 [1].', '9'),
  misstated('G13 the clause’s units as each line’s', 'clause', 'Each line billed 12 units [3].', '12'),
  misstated('G14 the clause’s claims as the claim count', 'clause', 'There were 4 claims [3].', '4'),
  misstated('G15 the clause’s section beside a word of no meaning', 'section4', 'Of these lines, 4 of them were short [3].', '4'),
  misstated('G16 the practice’s name beside another word', 'names', 'The payer underpaid CPT 12345 [1].', '12345', 'code'),
  // The five-digit code.
  misstated('I1 the citation’s page as a procedure code', 'page12345', 'CPT 12345 was billed [1].', '12345', 'code'),
  misstated('I2 the citation’s page as a code named so', 'page12345', 'Procedure code 12345 was billed [1].', '12345', 'code'),
  misstated('I3 a code as a count of visits', 'base', 'It affected 97110 visits [3].', '97110'),
  misstated('I4 a code as a page', 'base', 'The clause is on page 97110 [1].', '97110'),
  misstated('I5 a code as days', 'base', 'Disputes are raised within 97110 days [1].', '97110'),
  misstated('I6 a code as a count of units', 'base', 'There were 97110 units [3].', '97110'),
  // Amounts, percentages and dates.
  misstated('L1 an amount as units', 'base', 'There were 50.00 units [3].', '50.00'),
  misstated('M1 the interest rate as the contract’s percentage', 'interest', 'The contract pays 9% of the Medicare fee schedule [1].', '9%', 'percent'),
  misstated('M2 the interest rate as a percentage of Medicare', 'interest', 'The contract pays 9% of Medicare [1].', '9%', 'percent'),
  misstated('N1 the expected amount as allowed', 'base', 'The payer allowed $100.00 per line [3].', '$100.00', 'amount'),
  misstated('N2 the allowed amount as the shortfall', 'base', 'The shortfall was $210.00 [3].', '$210.00', 'amount'),
  misstated('N3 the paid amount as allowed', 'base', 'The payer allowed $56.00 per line [3].', '$56.00', 'amount'),
  misstated('N4 the allowed amount as paid', 'base', 'The payer paid $70.00 per line [3].', '$70.00', 'amount'),
  misstated('N5 the expected amount as what is owed', 'base', 'The payer owes $100.00 per line [3].', '$100.00', 'amount'),
  misstated('O1 a service date as the payment date', 'base', 'The payer paid the lines on 2026-03-05 [3].', '2026-03-05', 'date'),
  misstated('O2 the window’s end as a service date', 'base', 'The service date was 2036-04-05 [3].', '2036-04-05', 'date'),
  misstated('O3 the service month as the payment month', 'base', 'The payer paid in March 2026 [3].', 'March 2026', 'month'),
  misstated('O4 the version’s date as a service date', 'base', 'The lines were billed through 2026-10-16 [3].', '2026-10-16', 'date'),
  misstated('O5 the window’s end as the payment date', 'base', 'The payer paid on 2036-04-05 [3].', '2036-04-05', 'date'),
  // Rows, counts with no noun and ordinals.
  misstated('Q1 a row the schedule does not have', 'base', 'The sixth line was short [3].', 'sixth'),
  misstated('Q2 a row past the last', 'base', 'The 4th line was short [3].', '4th'),
  misstated('Q3 a claim the pattern does not have', 'oneClaim', 'The third claim was short [3].', 'third'),
  misstated('Q4 a patient the pattern does not have', 'oneClaim', 'The third patient was underpaid [3].', 'third'),
  misstated('Q5 each line’s units as the pattern’s', 'base', 'Each line billed 6 units [3].', '6'),
  misstated('Q6 the pattern’s units as each line’s', 'base', 'Three claims billed 97110 x 6 [3].', '6'),
  misstated('Q7 a partitive not in the input', 'base', 'Two of the 3 claims were short [3].', 'Two'),
  misstated('S1 a count with no noun', 'base', 'Of these, 2 were short [3].', '2'),
  misstated('S2 an ordinal alone', 'base', 'This is the fifth dispute [3].', 'fifth'),
];

const stated = (id: string, content: RoleContent, narrative: string): StatedExample => ({ id, content, narrative });

/** CAS-44: a narrative states each figure in the role its input holds, or as a quoted text holds it. Each passes. */
export const STATED: readonly StatedExample[] = [
  // Day counts, in digits, with commas, in words, joined and with their kind.
  stated('A1 the window’s days', 'window10000', 'Disputes are raised within 10000 days [1].'),
  stated('A2 the window’s days with a comma', 'window10000', 'Disputes are raised within 10,000 days [1].'),
  stated('A3 the window’s days in words', 'window10000', 'Disputes are raised within ten thousand days [1].'),
  stated('A4 the window’s days joined', 'base', 'It is a 3650-day window [1].'),
  stated('A5 the window’s days joined with a comma', 'base', 'It is a 3,650-day window [1].'),
  stated('A6 the window’s days in words, long', 'base', 'The window is three thousand six hundred fifty days [1].'),
  stated('A7 the window’s days, then its end', 'base', 'The payer must respond within 3650 days, by April 5, 2036 [1].'),
  stated('A8 the joined window and its end', 'base', 'The 3650-day window ends April 5, 2036 [1].'),
  stated('A9 the days to pay', 'interest', 'The payer has 33 days to pay [4].'),
  stated('A10 the days late', 'interest', 'The payer paid 24 days late [4].'),
  // Pages, versions, releases and levels.
  stated('B1 the citation’s page', 'page7', 'The clause is on page 7 [1].'),
  stated('B2 a five-digit page', 'page12345', 'The clause is on page 12345 [1].'),
  stated('B3 the version and the window’s page', 'base', 'The contract, version 1, page 1, applies [1].'),
  stated('B4 two pages after one label', 'base', 'Pages 1 and 2 of the contract apply [1].'),
  stated('B5 a release', 'base', 'Release 900001 priced the lines [2].'),
  stated('B6 a first-level appeal', 'base', 'This is a first-level appeal [1].'),
  stated('B7 a first-level appeal and its claims', 'base', 'This first-level appeal covers 3 claims [1].'),
  stated('B8 a version and its effective date', 'base', 'Version 1 (effective January 1, 2026) applies [1].'),
  // Years.
  stated('C1 a service year', 'base', 'The lines were billed in 2026 [3].'),
  stated('C2 a year before its noun', 'base', 'The 2026 fee schedule applies [1].'),
  stated('C3 a possessive’s year', 'base', 'Medicare’s 2026 fee schedule applies [1].'),
  stated('C4 a determiner’s year', 'base', 'Under its 2026 contract the payer owes more [1].'),
  stated('C5 a year at a sentence’s start', 'base', '2026 rates apply [1].'),
  stated('C6 a year after "in" at a sentence’s start', 'base', 'In 2026 the payer paid 3 lines short [3].'),
  stated('C7 a year before a count’s noun', 'base', 'The 2026 claims were short [3].'),
  stated('C8 a year after CY', 'base', 'The CY 2026 schedule applies [1].'),
  stated('C9 a calendar year', 'base', 'For calendar year 2026 the contract applies [1].'),
  stated('C10 a rate’s year', 'base', 'The payer paid at the 2026 rate [1].'),
  // Counts, units and rows.
  stated('D1 each line’s units', 'base', 'Each line billed 2 units [3].'),
  stated('D2 each line’s units in words', 'base', 'Each line billed two units [3].'),
  stated('D3 units and claims', 'base', '2 units were billed on 3 claims [3].'),
  stated('D4 the pattern’s units', 'base', 'The 6 units billed were short [3].'),
  stated('D5 units on each of the lines', 'base', 'The payer paid 2 units on each of 3 lines [3].'),
  stated('D6 the units in total', 'base', 'In total, 6 units were billed [3].'),
  stated('D7 a hyphenated unit', 'base', 'Each 2-unit line was short [3].'),
  stated('D8 a label before a colon', 'base', 'Units billed: 2 per line [3].'),
  stated('D9 decimal units', 'decimalUnits', 'Each line billed 1.25 units [3].'),
  stated('D10 each line’s units as x', 'base', 'Three claims billed 97110 x 2 [3].'),
  stated('D27 each line’s units as x, joined', 'base', 'Three claims billed 97110 x2 [3].'),
  stated('D11 rows', 'base', 'There are 3 rows in the schedule [3].'),
  stated('D12 a count before a code', 'base', 'There were 3 97110 lines [3].'),
  stated('D13 a partitive', 'base', 'Three of the 3 lines were short [3].'),
  stated('D14 a partitive with no determiner', 'base', 'The payer paid 3 of 3 lines short [3].'),
  stated('D15 all of a count', 'base', 'All 3 lines were short [3].'),
  stated('D16 all of the claims', 'base', 'All three of the claims were short [3].'),
  stated('D17 each of the claims', 'base', 'Each of the three claims was underpaid by $30.00 [3].'),
  stated('D18 three of each', 'base', 'Three claims, three patients and three lines are affected [3].'),
  stated('D19 each of the lines', 'base', 'Each of the 3 lines was paid at $56.00 [3].'),
  stated('D20 a row', 'base', 'Line 2 was short [3].'),
  stated('D21 rows in a range', 'base', 'Lines 1 to 3 were short [3].'),
  stated('D22 rows in a list', 'base', 'Rows 1 and 2 were short [3].'),
  stated('D23 claims in a range', 'base', 'Claims 1 through 3 were short [3].'),
  stated('D24 the second line', 'base', 'The second line was short [3].'),
  stated('D25 the first, as prose', 'base', 'The payer first paid the lines short [3].'),
  stated('D26 the code of lines', 'base', 'The 97110 lines were short [3].'),
  // Amounts, percentages and dates.
  stated('E1 a patient’s share after what was paid', 'base', 'The payer paid $56.00 after a $14.00 patient share [3].'),
  stated('E2 the noun after an amount', 'base', 'The payer paid nothing toward the $30.00 difference [3].'),
  stated('E3 allowed and paid', 'base', 'The payer allowed $70.00 and paid $56.00 per line [3].'),
  stated('E4 a remittance’s date and what it paid', 'base', 'The payer’s remittance of April 8, 2026 paid $56.00 per line [3].'),
  stated('E5 what the contract pays', 'base', 'The contract pays $50.00 per unit for 97110 [1].'),
  stated('E6 the date and what was paid', 'base', 'On April 8, 2026, the payer paid $56.00 for each 97110 line [3].'),
  stated('E7 the interest rate a year', 'interest', 'Interest of 9% a year applies [4].'),
  stated('E8 the interest rate per annum', 'interest', 'Interest accrues at 9% per annum [4].'),
  stated('E9 the payment date', 'base', 'The payer paid the lines on April 8, 2026 [3].'),
  stated('E10 service and payment dates', 'base', 'The lines were serviced on 2026-03-05 and paid on 2026-04-08 [3].'),
  stated('E11 payment for services', 'base', 'The payer paid for these services on April 8, 2026 [3].'),
  stated('E12 payment of billed lines', 'base', 'The payer paid the billed lines on April 8, 2026 [3].'),
  stated('E13 a deadline that is due', 'base', 'The appeal is due by April 5, 2036 [1].'),
  stated('E14 the deadline', 'base', 'The deadline is 2036-04-05 [1].'),
  stated('E15 months', 'base', 'Services in March 2026 were paid in April 2026 [3].'),
  stated('E16 a service range', 'base', 'For dates of service March 5 to March 7, 2026, the payer paid short [3].'),
  // Quoted texts, repeated as they hold their figures.
  stated('G1 the regulation’s reference', 'regulation', 'It owes the amount under 42 CFR 422.214 [1].'),
  stated('G2 the practice’s name', 'names', 'SYNTHETIC PT 12345 GROUP 77 billed the lines [1].'),
  stated('G3 the clause’s section and visits', 'names', 'Section 4 covers 12 visits [1].'),
  stated('G4 the clause’s section beside its label', 'section4', 'Section 4 applies to 3 claims [1].'),
  stated('G4b the practice’s name beside its label alone', 'names', 'The practice PT 12345 billed the lines [1].'),
  stated('G5 the clause’s level and days, repeated', 'clause', 'A level 2 appeal is raised within 90 days [1].'),
  stated('G6 the window clause’s days', 'clause', 'Disputes are raised within 3650 days [1].'),
];

/**
 * CAS-44's hand-written forms: a person's ways of stating the same facts, none drawn from the drafting templates
 * (./draft.ts) or the reference narratives (MOD-03).
 */
export const HAND_WRITTEN: readonly StatedExample[] = (
  [
    ['base', 'The payer underpaid three claims for 97110 [3].'],
    ['base', 'Each of the 3 claims was paid $30.00 short [3].'],
    ['base', 'Our contract sets $50.00 per unit for 97110 [1].'],
    ['base', 'At $50.00 a unit, 2 units come to $100.00 per line [1, 3].'],
    ['base', 'The payer allowed only $70.00 on each line [3].'],
    ['base', 'It paid $56.00 on each line, after a $14.00 patient share [3].'],
    ['base', 'The patient’s share was $14.00 per line [3].'],
    ['base', 'The schedule lists 3 lines, all billed as 97110 [3].'],
    ['base', 'Line 1, line 2 and line 3 were each short by $30.00 [3].'],
    ['base', 'Lines 1 through 3 are the affected lines [3].'],
    ['base', 'Claims 1 to 3 were all underpaid [3].'],
    ['base', 'Rows 1, 2 and 3 of the schedule show the shortfall [3].'],
    ['base', 'The second line was billed on March 6, 2026 [3].'],
    ['base', 'The first claim’s service date is 2026-03-05 [3].'],
    ['base', 'Services ran from March 5 to March 7, 2026 [3].'],
    ['base', 'The remittance dated April 8, 2026 paid every line [3].'],
    ['base', 'Payment arrived on April 8, 2026 [3].'],
    ['base', 'All three lines were paid on 2026-04-08 [3].'],
    ['base', 'The payer paid in April 2026 [3].'],
    ['base', 'In total the remittances allowed $210.00 [3].'],
    ['base', 'Under the contract the three lines should have been paid $300.00 [3].'],
    ['base', 'That leaves a shortfall of $90.00 across the 3 lines [3].'],
    ['base', 'The difference is $90.00 [3].'],
    ['base', 'The payer owes the $90.00 difference [3].'],
    ['base', 'Each line billed 2 units of 97110 [3].'],
    ['base', 'The lines carry 6 units in all [3].'],
    ['base', 'Units billed: 2 per line [3].'],
    ['base', 'Each 2-unit line was paid $56.00 [3].'],
    ['base', 'There are 3 patients in this pattern [3].'],
    ['base', 'The pattern covers 3 claims for 3 patients [3].'],
    ['base', 'Three of the 3 claims fell short [3].'],
    ['base', 'All 3 of the lines fell short [3].'],
    ['base', 'We rely on version 1 of the contract [1].'],
    ['base', 'Version 1 of the contract took effect on January 1, 2026 [1].'],
    ['base', 'The rate is cited on page 2 of the contract [1].'],
    ['base', 'See page 2 for the rate clause [1].'],
    ['base', 'Pages 1 and 2 of the contract apply [1].'],
    ['base', 'The dispute window is cited on page 1 [1].'],
    ['base', 'The contract gives 3650 days to dispute [1].'],
    ['base', 'Disputes may be raised within 3,650 days [1].'],
    ['base', 'It is a 3,650-day window [1].'],
    ['base', 'The window closes on April 5, 2036 [1].'],
    ['base', 'The appeal is due by April 5, 2036 [1].'],
    ['base', 'We must file by 2036-04-05 [1].'],
    ['base', 'This is a first-level appeal [1].'],
    ['base', 'This is the first dispute of these lines [1].'],
    ['base', 'Rule release 900001 priced each line [2].'],
    ['base', 'The lines were priced under release 900001 [2].'],
    ['base', 'The 97110 lines were each short [3].'],
    ['base', 'There were 3 97110 lines [3].'],
    ['base', 'Every 97110 line was allowed $70.00 [3].'],
    ['base', 'For 97110 the contract requires $50.00 per unit [1].'],
    ['base', 'In 2026 the payer paid each line short [3].'],
    ['base', 'The 2026 claims were all short [3].'],
    ['base', 'Medicare’s 2026 fee schedule does not apply here [1].'],
    ['base', 'Under its 2026 contract the payer owes more [1].'],
    ['base', '2026 rates apply to these services [1].'],
    ['base', 'The CY 2026 schedule applies [1].'],
    ['base', 'For calendar year 2026 the contract governs [1].'],
    ['base', 'Services in March 2026 were paid in April 2026 [3].'],
    ['base', 'On April 8, 2026 the payer paid $56.00 for each 97110 line [3].'],
    ['base', 'The payer allowed $70.00 and paid $56.00 per line [3].'],
    ['base', 'Each claim was allowed $70.00 [3].'],
    ['base', 'The contract amount is $100.00 per line [1].'],
    ['base', 'Expected payment was $100.00 a line [3].'],
    ['base', 'The payer paid 3 of 3 lines short [3].'],
    ['base', 'Of the 3 claims, all were short [3].'],
    ['base', 'The payer underpaid by $30.00 on each of the three lines [3].'],
    ['base', 'Altogether the shortfall comes to $90.00 [3].'],
    ['base', 'We ask the payer to pay the $90.00 balance [3].'],
    ['base', 'Please reprocess claims 1 through 3 [3].'],
    ['base', 'Patient 2’s line was short by $30.00 [3].'],
    ['base', 'The schedule’s third row shows $30.00 short [3].'],
    ['base', 'These 3 lines were billed between March 5 and March 7, 2026 [3].'],
    ['base', 'Each visit was billed as 97110 x 2 [3].'],
    ['base', 'The payer remitted $56.00 per line [3].'],
    ['base', 'The remittance shows $70.00 allowed per line [3].'],
    ['base', 'The 6 units were billed at $50.00 each [1, 3].'],
    ['base', 'That is $100.00 expected against $70.00 allowed [3].'],
    ['base', 'The line schedule lists the three 97110 lines [3].'],
    ['base', 'Two units were billed on each line [3].'],
    ['base', 'The payer’s remittance of April 8, 2026 covers 3 claims [3].'],
    ['base', 'The contract’s version 1 governs these 2026 services [1].'],
    ['base', 'Disputes must be raised within 3650 calendar days [1].'],
    ['base', 'The window runs 3650 days from the payment date [1].'],
    ['base', 'We are within the 3650-day window [1].'],
    ['base', 'The contract’s dispute clause is on page 1 [1].'],
    ['base', 'Page 2 holds the rate [1].'],
    ['base', 'On page 2, the contract pays $50.00 per unit for 97110 [1].'],
    ['base', 'The lines’ service dates are 2026-03-05, 2026-03-06 and 2026-03-07 [3].'],
    ['base', 'Version 1, effective 2026-01-01, applies [1].'],
    ['base', 'The three patients were treated in March 2026 [3].'],
    ['base', 'Each patient had one claim [3].'],
    ['base', 'The payer paid each line once, on April 8, 2026 [3].'],
    ['base', 'None of the 3 lines was paid in full [3].'],
    ['base', 'A total of 3 lines and 6 units are in dispute [3].'],
    ['base', 'The 3 lines total $300.00 expected [3].'],
    ['base', 'Expected allowed per line: $100.00 [3].'],
    ['base', 'Allowed per line: $70.00 [3].'],
    ['base', 'Paid per line: $56.00 [3].'],
    ['base', 'Shortfall per line: $30.00 [3].'],
    ['base', 'Shortfall in all: $90.00 [3].'],
    ['base', 'The contract (version 1, page 2) sets the rate [1].'],
    ['base', 'Its rate for 97110 is $50.00 per unit [1].'],
    ['base', 'The three lines were serviced March 5 through March 7 [3].'],
    ['base', 'Service on March 6, 2026 was paid on April 8, 2026 [3].'],
    ['base', 'The lines on rows 2 and 3 were billed on March 6 and March 7 [3].'],
    ['base', 'Claim 3 was billed on 2026-03-07 [3].'],
    ['base', 'The payer should have allowed $100.00 on line 1 [3].'],
    ['base', 'The contract requires $100.00 per line, but the payer allowed $70.00 [1, 3].'],
    ['base', 'It allowed $70.00 where $100.00 was due [3].'],
    ['base', 'The payer paid $56.00, and the patient owes $14.00 [3].'],
    ['base', 'The window ends 2036-04-05 [1].'],
    ['base', 'The payer processed the claims on April 8, 2026 [3].'],
    ['base', 'SYNTHETIC THERAPY GROUP 01 billed the 3 lines [3].'],
    ['interest', 'The state’s prompt-pay rule gives the payer 33 days to pay [4].'],
    ['interest', 'Payment was due on March 15, 2026 [4].'],
    ['interest', 'The payer paid 24 days late [4].'],
    ['interest', 'Interest has accrued for 215 days [4].'],
    ['interest', 'Interest runs at 9% a year [4].'],
    ['interest', 'Interest of $5.76 is owed on these lines [4].'],
    ['interest', 'Each line accrues $1.92 in interest [4].'],
    ['interest', 'The payer received the claims on February 10, 2026 [4].'],
    ['interest', 'Clean claims must be paid within 33 days [4].'],
    ['interest', 'At 9% per annum, interest totals $5.76 [4].'],
    ['interest', 'The claims were received 2026-02-10 and paid 2026-04-08 [4].'],
    ['interest', 'The prompt-pay deadline was 2026-03-15 [4].'],
    ['regulation', 'Under 42 CFR 422.214 the plan owes what Original Medicare would pay [1].'],
    ['regulation', 'Original Medicare would pay $300.00 for these 3 lines [3].'],
    ['regulation', 'Release 900001 holds the Medicare fee schedule that sets the amount [2].'],
    ['medicare', 'The contract pays 112.5% of the 2025 Medicare fee schedule [1].'],
    ['medicare', 'Payment is set at 112.5 percent of Medicare [1].'],
    ['medicare', 'The rates are locked to the 2025 fee schedule [1].'],
    ['medicare', 'Medicare’s 2025 rates, at 112.5%, apply [1].'],
  ] as const
).map(([content, narrative], index) => stated(`H${String(index + 1)}`, content, narrative));

/**
 * The values each role's inputs hold, read from the content's fields by role (a test's oracle, written apart from
 * ./facts.ts so a property does not test the facts against themselves): counts and numbers as plain decimals,
 * amounts as cents, dates ISO.
 */
export function roleOracle(content: PacketContentV2): ReadonlyMap<string, ReadonlySet<string>> {
  const held = new Map<string, Set<string>>();
  const add = (role: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) {
      return;
    }
    const values = held.get(role) ?? new Set<string>();
    values.add(String(value));
    held.set(role, values);
  };
  const { pattern, citation, interest } = content;
  const firstLevel = content.deadline.basis === 'line_windows';
  add('level', content.dispute_level);
  add('lines', content.lines.length);
  add('lines', pattern.lines);
  add('claims', pattern.claims);
  add('patients', pattern.patients);
  add('units', pattern.units);
  for (let row = 1; row <= content.lines.length; row += 1) {
    add('row', row);
  }
  for (let row = 1; row <= pattern.claims; row += 1) {
    add('claim_row', row);
  }
  for (let row = 1; row <= pattern.patients; row += 1) {
    add('patient_row', row);
  }
  for (const release of content.rule_releases) {
    add('release', release.release_no);
  }
  add('expected', pattern.expected_cents);
  add('allowed', pattern.observed_cents);
  add('variance', pattern.variance_cents);
  for (const code of pattern.codes) {
    add('lines', code.lines);
    add('units', code.units);
    add('expected', code.expected_cents);
    add('expected', code.contract_amount_cents);
    add('allowed', code.observed_cents);
    add('variance', code.variance_cents);
  }
  for (const item of content.lines) {
    add('units', item.units);
    add('line_units', item.units);
    add('expected', item.expected_cents);
    add('allowed', item.observed_cents);
    add('variance', item.variance_cents);
    add('paid', item.paid_cents);
    add('patient_share', item.calculation.patient_share_cents);
    for (const cents of [...item.calculation.steps.map((step) => step.amount_cents), item.calculation.rounding?.unrounded_cents, item.calculation.rounding?.rounded_cents]) {
      add('calculation', cents !== undefined && /^-?\d+$/.test(cents) ? cents : null);
    }
    add('service_date', item.service_date);
    add('paid_date', item.paid_on);
    add('received_date', item.received_on);
  }
  if (citation.kind === 'contract') {
    add('version', citation.version_no);
    add('citation_page', citation.page);
    add('effective_date', citation.effective_from);
    add('effective_date', citation.effective_to);
    const amount = (citation.parameters as { amount_cents?: unknown }).amount_cents;
    add('expected', typeof amount === 'string' ? amount : null);
  }
  for (const source of firstLevel ? content.deadline.sources : []) {
    if (source.kind === 'contract_window') {
      add('window_page', source.page);
      add('window_days', source.days);
    }
  }
  if (interest !== null) {
    add('release', interest.release_no);
    add('days_to_pay', interest.days_to_pay);
    for (const item of interest.lines) {
      if (item.interest_cents !== null && BigInt(item.interest_cents) > 0n) {
        add('days_late', item.days_late);
        add('days_late', item.days_unpaid);
        add('interest', item.interest_cents);
      }
    }
    if (interest.total_cents !== null && BigInt(interest.total_cents) > 0n) {
      add('interest', interest.total_cents);
    }
  }
  return held;
}
