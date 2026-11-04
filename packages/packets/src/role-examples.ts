import { decimal } from '@tp/money';

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
  // The review of 2026-11-01 (CAS-43 and CAS-44's REVIEWED examples).
  'promptPay',
  'businessDays',
  'statute',
  'codeList',
  'feeClause',
  'unitClause',
  'termsList',
  'yearClause',
  'windowList',
  'windowColon',
  'medicareInterest',
  'medicareNoYear',
  'locked2025',
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
    // The review's harness PP: claims received 2026-03-10, 33 days to pay.
    promptPay: packet({ interest: { state: 'ZZ', releaseNo: 900003, record: promptPayRecord() }, lines: [1, 2, 3].map((n) => line(n, { receivedOn: '2026-03-10' })) }),
    // A rule that counts 15 business days to pay and states no rate.
    businessDays: packet({ interest: { state: 'ZZ', releaseNo: 900003, record: promptPayRecord({ day_basis: 'business', days_to_pay: 15, annual_rate_percent: null }) }, lines: [1, 2, 3].map((n) => line(n, { receivedOn: '2026-03-10' })) }),
    // A statute whose words give 33 days to pay.
    statute: packet({ interest: { state: 'ZZ', releaseNo: 900003, record: promptPayRecord({ statute: 'Clean claims are paid within 33 days of receipt.' }) }, lines: [1, 2, 3].map((n) => line(n, { receivedOn: '2026-03-10' })) }),
    // Clauses shaped like the fixtures' (a code list), an amount at a colon's end, a list of day counts, a clause's
    // own counts, and window clauses with a list and a colon.
    codeList: packet({ citation: contractCitation({ quote: '97014, 97545, 92508 - 12 Manual services $73.75 per unit' }) }),
    feeClause: packet({ citation: contractCitation({ quote: 'Fee schedule amount for 97110 per unit: $50.00' }) }),
    unitClause: packet({ citation: contractCitation({ quote: '97110: $50.00 per unit.' }) }),
    termsList: packet({ citation: contractCitation({ quote: '97110 is paid 50.00 per unit. Payment terms: 30, 45, 60 days' }) }),
    yearClause: packet({ citation: contractCitation({ quote: '97110 is paid 50.00 per unit up to 12 units, 4 claims a year' }) }),
    windowList: packet({ deadlineSources: [contractWindowSource({ quote: 'Disputes are raised within 3650 days; see sections 4, 24, 90' })] }),
    windowColon: packet({ deadlineSources: [contractWindowSource({ quote: 'Time to dispute: 90 days.' })] }),
    // 112.5% of the 2025 Medicare fee schedule, with prompt-pay interest at 9% a year.
    medicareInterest: packet({
      citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percent: '112.5', year_basis: 'LOCKED:2025' }, quote: 'Payer pays 112.5% of the 2025 Medicare fee schedule' }),
      interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      lines: [1, 2, 3].map((n) => line(n, { receivedOn: '2026-02-10' })),
    }),
    medicareNoYear: packet({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percent: '112.5', year_basis: 'LOCKED:2025' }, quote: 'Payer pays 112.5% of the Medicare fee schedule' }) }),
    // A fixed schedule locked to the 2025 fee schedule.
    locked2025: packet({ citation: contractCitation({ parameters: { amount_cents: '5000', year_basis: 'LOCKED:2025' } }) }),
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
  misstated('Q7 a partitive’s part larger than its whole', 'base', 'Four of the 3 claims were short [3].', 'Four'),
  misstated('S1 a count with no noun', 'base', 'Of these, 2 were short [3].', '2'),
  misstated('S2 an ordinal alone', 'base', 'This line is the fifth [3].', 'fifth'),
  // A count's noun after a year beats the year's lead (the review of 2026-11-01, PE-8 and CORR-2).
  misstated('C13 a service year as claims after "the"', 'base', 'The 2026 claims were short [3].', '2026'),
  misstated('C14 a service year as claims after "the", hand-written', 'base', 'The 2026 claims were all short [3].', '2026'),
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
  stated('C7 a year before a noun that dates the lines', 'base', 'The 2026 services were short [3].'),
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
  stated('D28 a partitive’s part, at most its whole', 'base', 'Two of the 3 claims were short [3].'),
  stated('D29 an ordinal before a noun, as prose', 'base', 'This is the fifth dispute [3].'),
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
    ['base', 'The 2026 services were all short [3].'],
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

/** A mismatch a reviewed example expects, as the verifier reports it: its code, its kind and what it marks, as written. */
export type ReviewedMismatch = readonly ['figure_not_in_input', FigureKind, string] | readonly ['hidden_character', null, string];

export interface ReviewedExample {
  /** The finding's id (docs/adr/0086; the review of 2026-11-01) and what the example states. */
  readonly id: string;
  readonly content: RoleContent;
  readonly narrative: string;
  /** Every mismatch, in text order: none for a narrative that passes (CAS-44), the figures it misstates for one that fails (CAS-43). */
  readonly fails: readonly ReviewedMismatch[];
}

const at = (figure: string, kind: FigureKind = 'number'): ReviewedMismatch => ['figure_not_in_input', kind, figure];
const amount = (figure: string) => at(figure, 'amount');
const date = (figure: string) => at(figure, 'date');
const reviewed = (id: string, content: RoleContent, narrative: string, ...fails: ReviewedMismatch[]): ReviewedExample => ({ id, content, narrative, fails });

/**
 * Every reproduction of the review of 2026-11-01 (the PE, CORR and CRIT findings, and each verifier's variant), with
 * the verdict the fix gives it: one role per figure, never the union of the clause's cues; quoted figures only in the
 * quote's own role; a count's noun over a year's lead; per line apart from in total. Those that fail are CAS-43's,
 * those that pass CAS-44's. The model gateway holds a model's draft to the same verdicts (functions/narrative-roles.test.ts).
 */
export const REVIEWED: readonly ReviewedExample[] = [
  // PE-1, CORR-1: an amount takes the nearest cue, never every cue of its clause.
  reviewed('PE-1 the expected amount as allowed, under the contract', 'base', 'Under the contract, the payer allowed $100.00 per line [3].', amount('$100.00')),
  reviewed('PE-1 the paid amount as expected', 'base', 'Although the payer paid, the contract requires $56.00 per line [3].', amount('$56.00')),
  reviewed('PE-1 the expected amount as the shortfall', 'base', 'The contract requires more, so the shortfall is $100.00 per line [3].', amount('$100.00')),
  reviewed('PE-1 the paid amount as the contract’s rate', 'base', 'The remittance shows the contract rate of $56.00 per line [3].', amount('$56.00')),
  reviewed('PE-1 the patient’s share as the shortfall', 'base', 'After the coinsurance, the payer underpaid $14.00 per line [3].', amount('$14.00')),
  reviewed('PE-1 the expected total after two cues and a colon', 'base', 'The contract expected more than the payer allowed: $300.00 in all [3].', amount('$300.00')),
  reviewed('PE-1 respectively, in the wrong order', 'base', 'The payer allowed and the contract expected $100.00 and $70.00 per line respectively [3].', amount('$100.00'), amount('$70.00')),
  reviewed('PE-1 the shortfall as interest', 'interest', 'The payer owes $90.00 in interest [4].', amount('$90.00')),
  reviewed('PE-1 control: one cue', 'base', 'The payer allowed $100.00 per line [3].', amount('$100.00')),
  reviewed('PE-1 (Verifier B) the expected amount as paid, because the contract requires more', 'base', 'Because the contract requires more, the payer paid $100.00 per line [3].', amount('$100.00')),
  reviewed('CORR-1 the expected amount as allowed, two cues', 'base', 'The contract expected and the payer allowed $100.00 [1].', amount('$100.00')),
  reviewed('CORR-1 the expected amount as allowed, under the contract', 'base', 'Under the contract the payer allowed $100.00 per line [1].', amount('$100.00')),
  reviewed('CORR-1 two cues before a colon: held in both', 'base', 'The contract requires more than the payer paid: $56.00 [1].', amount('$56.00')),
  // PE-2: the swaps the base's gateway check caught (and functions/narrative-roles.test.ts runs the base's check).
  reviewed('PE-2 the expected amount as allowed, under the contract, without the comma', 'base', 'Under the contract the payer allowed $100.00 per line [3].', amount('$100.00')),
  reviewed('PE-2 the allowed amount as expected', 'base','The payer allowed less, so the contract requires $70.00 per line [3].', amount('$70.00')),
  reviewed('PE-2 the shortfall as interest owed', 'interest', 'The interest owed is $30.00 per line [4].', amount('$30.00')),
  reviewed('PE-2, PE-8 a service year as claims after "these"', 'base', 'The payer underpaid these 2026 claims [3].', at('2026')),
  reviewed('PE-2, PE-8 a service year as claims after "the"', 'base', 'The payer underpaid the 2026 claims [3].', at('2026')),
  reviewed('PE-2, PE-8 a service year as claims after "for"', 'base', 'The payer owes for 2026 claims [3].', at('2026')),
  reviewed('PE-2, PE-8 the window’s year as claims', 'base', 'The payer underpaid these 2036 claims [3].', at('2036')),
  reviewed('PE-8 (Verifier B) control: a year no date holds', 'base', 'The payer underpaid these 2027 claims [3].', at('2027')),
  reviewed('PE-2, PE-3 the clause’s fee as paid', 'feeClause', 'The payer paid $50.00 per line [3].', amount('$50.00')),
  reviewed('PE-2, PE-3 the clause’s fee as the shortfall', 'feeClause', 'The shortfall is $50.00 per line [3].', amount('$50.00')),
  reviewed('PE-2 the clause’s claims as the claim count', 'yearClause', 'The payer underpaid 4 claims a year [3].', at('4')),
  reviewed('PE-2, PE-3 the window clause’s section as units', 'windowList', 'There were 90 units [3].', at('90')),
  // PE-3, CORR-3, CORR-14, CRIT-1: a quoted figure only in the quote's own role, its clause ending where the quote's does.
  reviewed('PE-3 a listed code as the window’s days', 'codeList', 'Disputes are raised within 97545 days [1].', at('97545')),
  reviewed('PE-3 a listed code as units', 'codeList', 'There were 97545 units [3].', at('97545')),
  reviewed('PE-3 a listed code as a page', 'codeList', 'The clause is on page 97545 [1].', at('97545')),
  reviewed('PE-3 a listed code as a release', 'codeList', 'Release 97545 priced the lines [2].', at('97545')),
  reviewed('PE-3 a listed code as days late', 'codeList', 'The payer paid 97014 days late [3].', at('97014')),
  reviewed('PE-3 (Verifier B) a listed code as claims', 'codeList', 'There were 97545 claims [3].', at('97545')),
  reviewed('PE-3 a listed code repeated as the code it is', 'codeList', 'The clause lists 97545 among its codes [1].'),
  reviewed('PE-3 the window clause’s section as days late', 'windowList', 'The payer paid 24 days late [1].', at('24')),
  reviewed('PE-3 the window clause’s section as a release', 'windowList', 'Release 24 priced the lines [2].', at('24')),
  reviewed('CORR-3 the clause’s rate as allowed', 'unitClause', 'The payer allowed $50.00 per unit [1].', amount('$50.00')),
  reviewed('CORR-3 (Verifier B) the clause’s rate as paid', 'unitClause', 'The payer paid $50.00 per unit [1].', amount('$50.00')),
  reviewed('CORR-3 the window clause’s days as days late', 'windowColon', 'The payer paid 90 days late [1].', at('90')),
  reviewed('CORR-14 the statute’s days to pay as the window', 'statute', 'Disputes are raised within 33 days of receipt [1].', at('33')),
  reviewed('CORR-14 control: without the statute’s words', 'statute', 'Disputes are raised within 33 days [1].', at('33')),
  reviewed('CORR-14 the statute’s days to pay as the statute states them', 'statute', 'Clean claims are paid within 33 days of receipt [4].'),
  reviewed('CRIT-1 a listed day count as days late', 'termsList', 'The payer paid 45 days late [3].', at('45')),
  reviewed('CRIT-1 a listed day count as claims', 'termsList', 'There were 45 claims [3].', at('45')),
  reviewed('CRIT-1 a listed day count as a page', 'termsList', 'The clause is on page 45 [1].', at('45')),
  // PE-4, CORR-4, CRIT-3, CRIT-4: day counts, dates, pages and percentages take one cue, too.
  reviewed('PE-4 the payment date as the deadline', 'base', 'The payment dispute window ends on 2026-04-08 [1].', date('2026-04-08')),
  reviewed('PE-4 (Verifier B) control: the payment date as the deadline, one cue', 'base', 'The dispute window ends on 2026-04-08 [1].', date('2026-04-08')),
  reviewed('PE-4 the payment date as the deadline, a clause between', 'base', 'The window, which opened when the payer paid, ends on April 8, 2026 [1].', date('April 8, 2026')),
  reviewed('PE-4 a service date as the payment date', 'base', 'The services were paid on 2026-03-05 [3].', date('2026-03-05')),
  reviewed('PE-4 the deadline as the payment date, an aside between', 'base', 'The payer paid the lines, with a deadline, on 2036-04-05 [3].', date('2036-04-05')),
  reviewed('PE-4 the window’s days as days late', 'base', 'The payer paid 3650 days late on this dispute [1].', at('3650')),
  reviewed('PE-4 the citation’s page as the window’s', 'base', 'The dispute window clause is on page 2 [1].', at('2')),
  reviewed('PE-4 the dispute window clause on its own page', 'base', 'The dispute window clause is on page 1 [1].'),
  reviewed('PE-4 the days to pay as days late', 'interest', 'The payer paid 33 days late under the prompt pay rule [4].', at('33')),
  reviewed('PE-4 the due date as the deadline', 'interest', 'Payment was due, and the dispute window ends, on 2026-03-15 [1].', date('2026-03-15')),
  reviewed('PE-4 the contract’s percentage as interest', 'medicareInterest', 'Interest runs at 112.5% of the Medicare fee schedule [4].', at('112.5%', 'percent')),
  reviewed('PE-4 the interest rate as the contract’s', 'medicareInterest', 'The contract pays interest at 9% [1].', at('9%', 'percent')),
  reviewed('CORR-4 two day counts swapped, as recorded', 'promptPay', 'The payer paid 3650 days late and we dispute within 187 days [1].', at('3650'), at('187')),
  reviewed('CORR-4 two day counts swapped, with the days late held', 'interest', 'The payer paid 3650 days late and we dispute within 24 days [1].', at('3650'), at('24')),
  reviewed('CORR-4 two day counts each in its own role', 'interest', 'The payer paid 24 days late and we dispute within 3650 days [1].'),
  reviewed('CORR-4 the days to pay after "paid within"', 'promptPay', 'Interest accrues on claims not paid within 33 days [1].'),
  reviewed('CRIT-3 a service date after an amount', 'base', 'The payer paid $56.00 on 2026-03-05 [3].', date('2026-03-05')),
  reviewed('CRIT-3 the deadline opening the sentence', 'base', 'On 2036-04-05 the payer paid $56.00 per line [3].', date('2036-04-05')),
  reviewed('CRIT-3 the deadline after a count', 'base', 'The payer paid 3 lines on 2036-04-05 [3].', date('2036-04-05')),
  reviewed('CRIT-3 a service date as the deadline after an amount', 'base', 'We dispute $90.00 by 2026-03-05 [1].', date('2026-03-05')),
  reviewed('CRIT-3 control: one cue', 'base', 'The payer paid on 2026-03-05 [3].', date('2026-03-05')),
  reviewed('CRIT-3 (variant) a service date opening the sentence before a comma', 'base', 'On 2026-03-05, the payer paid $56.00 per line [3].', date('2026-03-05')),
  reviewed('CRIT-3 (variant) the deadline after what was allowed', 'base', 'The payer allowed $70.00 per line on 2036-04-05 [3].', date('2036-04-05')),
  reviewed('CRIT-3 (variant) the payment date as a service date after an aside', 'base', 'The lines, billed for $100.00 each, were serviced on 2026-04-08 [3].', date('2026-04-08')),
  reviewed('CRIT-3 the payment date after an amount', 'base', 'The payer paid $56.00 per line on 2026-04-08 [3].'),
  reviewed('CRIT-3 the payment date opening the sentence', 'base', 'On April 8, 2026, the payer paid $56.00 per line [3].'),
  reviewed('CRIT-4 the deadline after "days after payment"', 'base', 'The window ends 3650 days after payment, on 2036-04-05 [1].'),
  reviewed('CRIT-4 the deadline after "days after the payment date"', 'base', 'The dispute deadline is 3650 days after the payment date, 2036-04-05 [1].'),
  reviewed('CRIT-4 the deadline after "days of payment"', 'base', 'Disputes are due within 3650 days of payment, by April 5, 2036 [1].'),
  reviewed('CRIT-4 control: payment, then the deadline', 'base', 'Payment was made on 2026-04-08, so the window closes on 2036-04-05 [1].'),
  reviewed('CRIT-4 (variant) the window clause’s words, then the deadline', 'base', 'Disputes are raised within 3650 days of the payment date, by April 5, 2036 [1].'),
  reviewed('CRIT-4 (variant) the deadline in parentheses', 'base', 'Disputes are raised within 3650 days of payment (by 2036-04-05) [1].'),
  reviewed('CRIT-4 (variant) the deadline after "that is"', 'base', 'The window is 3650 days after payment, that is, through April 5, 2036 [1].'),
  reviewed('CRIT-4 (variant) a respond-by deadline after "of payment"', 'base', 'The payer must respond within 3650 days of payment, by April 5, 2036 [1].'),
  reviewed('CRIT-4 (variant) a service date as the deadline', 'base', 'Disputes are raised within 3650 days of the payment date, by 2026-03-05 [1].', date('2026-03-05')),
  reviewed('CRIT-4 (variant) the payment date as the deadline', 'base', 'Disputes are raised within 3650 days of the payment date, by 2026-04-08 [1].', date('2026-04-08')),
  reviewed('PE-4 a deadline, then the window’s days after payment', 'base', 'The dispute is timely: the window ends on April 5, 2036, 3650 days after payment [1].'),
  // PE-8, CORR-2: a count's noun after a year beats the year's lead.
  reviewed('CORR-2 a service year as claims after "The"', 'base', 'The 2026 claims were underpaid [1].', at('2026')),
  reviewed('CORR-2 a service year as claims after "Its"', 'base', 'Its 2026 claims were underpaid [1].', at('2026')),
  reviewed('CORR-2 a service year as claims after "For"', 'base', 'For 2026 claims the payer paid short [1].', at('2026')),
  reviewed('CORR-2 a service year as claims after "This"', 'base', 'This 2026 claims batch was short [1].', at('2026')),
  reviewed('PE-8 a year before services, which date them', 'base', 'The payer underpaid these 2026 services [3].'),
  reviewed('CORR-2, PE-8 (Verifier A) control: no lead', 'base', 'There were 2026 claims [1].', at('2026')),
  // CORR-5's reproduction, the verifier's part (the stored version's display and approval are the fix round's part 2).
  reviewed('CORR-5 what the contract requires as paid, for each line', 'base', 'The payer paid $100.00 for each line [1].', amount('$100.00')),
  // CORR-6, CORR-7, CORR-20, CRIT-2: respectively, per line and in total, and a copula's subject.
  reviewed('CORR-6 respectively, in the wrong order', 'base', 'The contract expected and the payer allowed $70.00 and $100.00, respectively [1].', amount('$70.00'), amount('$100.00')),
  reviewed('CORR-6 respectively, in order', 'base', 'The contract expected and the payer allowed $100.00 and $70.00, respectively [1].'),
  // CORR-D1, CORR-D2 (the review of the fix round): the cues after a "respectively" list, and one scope for the list.
  reviewed('CORR-D1 respectively, the cues after the list, in the wrong order', 'base', '$70.00 and $100.00 were expected and allowed per line, respectively [1].', amount('$70.00'), amount('$100.00')),
  reviewed('CORR-D1 respectively, the cues after the list, in order', 'base', '$100.00 and $70.00 were expected and allowed per line, respectively [1].'),
  reviewed('CORR-D1 respectively, "the expected and allowed amounts" after the list, in the wrong order', 'base', 'Per line, $70.00 and $100.00 were the expected and allowed amounts, respectively [1].', amount('$70.00'), amount('$100.00')),
  reviewed('CORR-D1 respectively, "the expected and allowed amounts" after the list, in order', 'base', 'Per line, $100.00 and $70.00 were the expected and allowed amounts, respectively [1].'),
  reviewed('CORR-D1 (variant) respectively, the contracted and paid amounts after the list, swapped', 'base', '$56.00 and $100.00 were the contracted and paid amounts per line, respectively [1].', amount('$56.00'), amount('$100.00')),
  reviewed('CORR-D1 (variant) respectively, the contracted and paid amounts after the list, in order', 'base', '$100.00 and $56.00 were the contracted and paid amounts per line, respectively [1].'),
  reviewed('CORR-D2 respectively, a total stated per line after the list', 'base', 'The contract expected and the payer allowed $300.00 and $70.00 per line, respectively [1].', amount('$300.00')),
  reviewed('CORR-D2 respectively, a total stated per line before the list', 'base', 'Per line, the contract expected and the payer allowed $100.00 and $210.00, respectively [1].', amount('$210.00')),
  reviewed('CORR-D2 respectively, a line’s value stated in total after the list', 'base', 'The expected and allowed amounts were $100.00 and $210.00 in total, respectively [1].', amount('$100.00')),
  reviewed('CORR-D2 respectively, each line’s values per line', 'base', 'The contract expected and the payer allowed $100.00 and $70.00 per line, respectively [1].'),
  reviewed('CORR-D2 respectively, the totals in total', 'base', 'The contract expected and the payer allowed $300.00 and $210.00 in total, respectively [1].'),
  // NEW-N1, NEW-N2, PE-D2 (round 2 of the review of the fix round): a clause of its own after a "respectively" list states
  // nothing of the list; a scope with each cue is that cue's figure's; an opening "each of the 3 lines" is each line's.
  reviewed('NEW-N1 respectively, a line’s value in a list stated in total, before a clause of its own', 'base', 'In total, the contract expected and the payer allowed $300.00 and $70.00, respectively, which the payer explained for each line [1].', amount('$70.00')),
  reviewed('NEW-N1 respectively, the totals, before a clause of its own', 'base', 'The contract expected and the payer allowed $300.00 and $210.00, respectively, which the payer explained for each line [1].'),
  reviewed('NEW-N1 respectively, the totals stated in total, before a clause of its own', 'base', 'In total, the contract expected and the payer allowed $300.00 and $210.00, respectively, which the payer explained for each line [1].'),
  reviewed('NEW-N1 respectively, each line’s values, before a clause of its own', 'base', 'The contract expected and the payer allowed $100.00 and $70.00, respectively, which the payer explained for each line [1].'),
  reviewed('NEW-N1 control: one figure before a clause of its own', 'base', 'The payer allowed $210.00, which the payer explained for each line [1].'),
  reviewed('NEW-N2 respectively, a scope with each cue after the list', 'base', '$300.00 and $70.00 were expected in total and allowed per line, respectively [1].'),
  reviewed('NEW-N2 respectively, a scope with each cue after "respectively"', 'base', '$300.00 and $70.00 were, respectively, expected in total and allowed per line [1].'),
  reviewed('NEW-N2 respectively, per line, then in total, with each cue', 'base', '$100.00 and $210.00 were expected per line and allowed in total, respectively [1].'),
  reviewed('NEW-N2 control: in total with each cue', 'base', '$300.00 and $210.00 were expected in total and allowed in total, respectively [1].'),
  reviewed('NEW-N2 respectively, the scopes with each cue swapped', 'base', '$300.00 and $70.00 were expected per line and allowed in total, respectively [1].', amount('$300.00'), amount('$70.00')),
  reviewed('NEW-N2 respectively, the scopes with each cue after "respectively" swapped', 'base', '$300.00 and $70.00 were, respectively, expected per line and allowed in total [1].', amount('$300.00'), amount('$70.00')),
  reviewed('NEW-N2 respectively, in total, then per line, swapped', 'base', '$100.00 and $210.00 were expected in total and allowed per line, respectively [1].', amount('$100.00'), amount('$210.00')),
  reviewed('PE-D2 a total after "On each of the 3 lines"', 'base', 'On each of the 3 lines, the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('PE-D2 a total after "For each of the 3 lines"', 'base', 'For each of the 3 lines, the payer allowed $210.00 [1].', amount('$210.00')),
  reviewed('PE-D2 a total after "In each of the 3 lines"', 'base', 'In each of the 3 lines, the payer allowed $210.00 [1].', amount('$210.00')),
  reviewed('PE-D2 each line’s value after "On each of the 3 lines"', 'base', 'On each of the 3 lines, the contract expected $100.00 [1].'),
  reviewed('PE-D2 control: a total stated per line after it', 'base', 'The contract expected $300.00 on each of the 3 lines [1].', amount('$300.00')),
  // R1-NF-1, R1-NF-2, R1-NF-3 (pass 2 of round 2): an opening "each" states only its own clause's figures; a clause after
  // "respectively" that opens with "and", a participle or "with" is no list's; a scope between commas with each cue is its cue's.
  reviewed('R1-NF-2 an opening "For each line", then a total in a clause after "while"', 'base', 'For each line, the payer allowed $70.00, while across the 3 lines it allowed $210.00 [1].'),
  reviewed('R1-NF-2 an opening "For each line", then "the 3 lines together"', 'base', 'For each line, the payer allowed $70.00, while the 3 lines together were allowed $210.00 [1].'),
  reviewed('R1-NF-2 an opening "For each line", then the claim’s total after "and"', 'base', 'For each line, the payer allowed $70.00, and the claim was allowed $210.00 [1].'),
  reviewed('R1-NF-2 an opening "On each of the 3 lines", then the total owed after "so"', 'base', 'On each of the 3 lines, the payer allowed $70.00, so the payer owes $90.00 [1].'),
  reviewed('R1-NF-2 an opening "For each line", then a total stated per line in a clause after "while"', 'base', 'For each line, the payer allowed $70.00, while for each line it allowed $210.00 [1].', amount('$210.00')),
  reviewed('R1-NF-2 an opening "For each line", a total in its own clause', 'base', 'For each line, the payer allowed $70.00 and the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R1-NF-2 a total after "Each of the 3 lines", its subject', 'base', 'Each of the 3 lines was expected at $300.00 [1].', amount('$300.00')),
  reviewed('R1-NF-2 the lines’ units after "Each of the 3 lines", its subject', 'base', 'Each of the 3 lines billed 6 units [1].', at('6')),
  reviewed('R1-NF-2 control: each line’s value after "Each of the 3 lines"', 'base', 'Each of the 3 lines was expected at $100.00 [1].'),
  reviewed('R1-NF-1 respectively, the totals, before a clause after "and"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and each line is short [1].'),
  reviewed('R1-NF-1 respectively, the totals, before a participle’s clause', 'base', '$300.00 and $210.00 were expected and allowed, respectively, leaving each line short [1].'),
  reviewed('R1-NF-1 respectively, the totals, before a clause after "with"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, with each line short [1].'),
  reviewed('R1-NF-1 control: "respectively, per line" is the list’s own', 'base', '$300.00 and $210.00 were expected and allowed, respectively, per line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R1-NF-1 control: "respectively, for each line" is the list’s own', 'base', '$100.00 and $70.00 were expected and allowed, respectively, for each line [1].'),
  reviewed('R1-NF-3 respectively, a scope between commas with each cue', 'base', '$300.00 and $70.00 were expected, in total, and allowed, per line, respectively [1].'),
  reviewed('R1-NF-3 respectively, a scope between commas with each cue, swapped', 'base', '$300.00 and $70.00 were expected, per line, and allowed, in total, respectively [1].', amount('$300.00'), amount('$70.00')),
  // R2-NEW-R2P2-1, R2-NEW-R2P2-2 (pass 3 of round 2): an opening "each" reaches the clauses coordinated after it unless
  // their own words state a scope or name the lines together; a scope alone after "respectively" and a lead word is the list's.
  reviewed('R2-NEW-R2P2-1 an opening "For each line", then a total after ", and"', 'base', 'For each line, the payer allowed $70.00, and the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "For each line", then a total after ", but"', 'base', 'For each line, the payer allowed $70.00, but the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "For each line", then a total after ", and it"', 'base', 'For each line, the payer allowed $70.00, and it expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "On each of the 3 lines", then a total after ", and"', 'base', 'On each of the 3 lines, the payer allowed $70.00, and the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "On each of the 3 lines", then a total after ", while"', 'base', 'On each of the 3 lines, the payer allowed $70.00, while the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "For each line" with no comma, then a total after ", and"', 'base', 'For each line the payer allowed $70.00, and the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "Per line", then a total after ", and"', 'base', 'Per line, the payer allowed $70.00, and the contract expected $300.00 [1].', amount('$300.00')),
  reviewed('R2-NEW-R2P2-1 control: each line’s value after ", and"', 'base', 'For each line, the payer allowed $70.00, and the contract expected $100.00 [1].'),
  reviewed('R2-NEW-R2P2-1 control: "Per line", then the total owed after "so"', 'base', 'Per line, the payer allowed $70.00, so the payer owes $90.00 [1].'),
  reviewed('R2-NEW-R2P2-1 control: the total owed after a semicolon', 'base', 'Per line, the payer allowed $70.00; the payer owes $90.00 [1].'),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "being per line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, being per line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "applying to each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, applying to each line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "counting each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, counting each line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "with each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, with each line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "and for each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and for each line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "nothing per line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, nothing per line [1].', amount('$300.00'), amount('$210.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "being per line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, being per line [1].'),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "applying to each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, applying to each line [1].'),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "counting each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, counting each line [1].'),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "with each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, with each line [1].'),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "and for each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, and for each line [1].'),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "nothing per line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, nothing per line [1].'),
  reviewed('CORR-6 a line’s amount, then the same role in total', 'base', 'The payer allowed $70.00 per line and $100.00 in total [1].', amount('$100.00')),
  reviewed('CORR-6 a line’s amount, then the allowed total', 'base', 'The payer allowed $70.00 per line and $210.00 in total [1].'),
  reviewed('CORR-6 the expected amount after "not the contract amount of"', 'base', 'The payer allowed, not the contract amount of $70.00, only $100.00 [1].', amount('$70.00')),
  reviewed('CORR-7 a total as each line’s', 'base', 'Each line was expected at $300.00 [1].', amount('$300.00')),
  reviewed('CORR-7 the shortfall in total as each line’s', 'base', 'The shortfall on each line is $90.00 [1].', amount('$90.00')),
  reviewed('CORR-7 each line’s units as the lines’ total', 'base', 'The 3 lines billed 2 units [1].', at('2')),
  reviewed('CORR-7 each line’s expected amount', 'base', 'Each line was expected at $100.00 [1].'),
  reviewed('CORR-7 the lines’ units in total', 'base', 'The 3 lines billed 6 units [1].'),
  reviewed('CORR-20 what the payer paid in total', 'base', 'The payer paid $168.00 in total for the 3 lines [1].'),
  reviewed('CORR-20 what the patients owe in total', 'base', 'The patients owe $42.00 in coinsurance across the 3 lines [1].'),
  reviewed('CRIT-2 the expected total as the shortfall’s', 'base', 'The shortfall of $30.00 per line comes to $300.00 [3].', amount('$300.00')),
  reviewed('CRIT-2 the expected total as the allowance’s', 'base', 'The payer’s allowance of $70.00 per line comes to $300.00 [3].', amount('$300.00')),
  reviewed('CRIT-2 the shortfall per line and in total', 'base', 'The shortfall of $30.00 per line comes to $90.00 [3].'),
  // PE-6, CORR-8 to CORR-13, CORR-15: correct sentences pass.
  reviewed('PE-6, CORR-9 the first 3 claims', 'base', 'The first 3 claims were underpaid [3].'),
  reviewed('PE-6 a locked fee schedule’s year after "paid"', 'medicareNoYear', 'The payer paid less than the 2025 Medicare fee schedule requires [1].'),
  reviewed('CORR-8 the sixth unit, as prose', 'base', 'The sixth unit was not paid [1].'),
  reviewed('CORR-8 (Verifier A) the sixth unit where the lines bill other units', 'decimalUnits', 'The sixth unit was not paid [1].'),
  reviewed('CORR-8 (Verifier B) the fifth unit', 'base', 'The fifth unit was not paid [1].'),
  reviewed('CORR-8 the first unit', 'base', 'The first unit was paid at the contract rate [1].'),
  reviewed('CORR-8 the second appeal', 'base', 'This is the second appeal on these lines [1].'),
  reviewed('CORR-9 the first 3 claims and each one’s shortfall', 'base', 'The first 3 claims were each underpaid by $30.00 [1].'),
  reviewed('CORR-9 a partitive’s part', 'base', '2 of the 3 claims were short [1].'),
  reviewed('CORR-9 a partitive’s part after its whole', 'base', 'Of the 3 claims, 2 were paid on 2026-04-08 [1].'),
  reviewed('CORR-9 a partitive’s part larger than its whole', 'base', '4 of the 3 claims were short [1].', at('4')),
  reviewed('CORR-9 what the patient paid', 'base', 'The patient paid $14.00 of the $70.00 allowed [1].'),
  reviewed('CORR-9 payment of the balance', 'base', 'We request payment of the $90.00 balance within 30 days [1].', at('30')),
  reviewed('CORR-10 a locked year after "paid"', 'locked2025', 'The payer paid under the 2025 fee schedule [1].'),
  reviewed('CORR-10 a locked year after services and "paid"', 'locked2025', 'These services were paid at 2025 rates [1].'),
  reviewed('CORR-10 control: a locked year', 'locked2025', 'The 2025 fee schedule applies [1].'),
  reviewed('CORR-10 (Verifier B) control: the contract’s locked year', 'locked2025', 'The contract uses the 2025 fee schedule [1].'),
  reviewed('CORR-10 a year the schedule is not locked to', 'locked2025', 'The payer paid under the 2026 fee schedule [1].', at('2026')),
  reviewed('CORR-11 business days to pay, after "requires payment"', 'businessDays', 'The statute requires payment within 15 business days [1].'),
  reviewed('CORR-11 business days to pay, after "must pay"', 'businessDays', 'The payer must pay within 15 business days [1].'),
  reviewed('CORR-12 "appeal" as a verb before claims', 'base', 'We appeal 3 claims that were paid short [1].'),
  reviewed('CORR-12 "appeal" as a verb before units', 'base', 'We appeal 6 units billed under 97110 [1].'),
  reviewed('CORR-13 a comma that starts a clause', 'base', 'Under version 1, 2 of them were short [1].'),
  reviewed('CORR-15 rows in an en-dash range', 'base', 'Lines 1–3 were short [1].'),
  reviewed('CORR-15 rows in a range in words', 'base', 'Lines 1 to 3 were short [1].'),
  // CORR-16: a confusable letter in a cue is a hidden character.
  reviewed('CORR-16 a Cyrillic letter in "allowed"', 'base', 'The payer аllowed $100.00 per line [1].', ['hidden_character', null, 'а']),
  reviewed('CORR-16 control: the Latin letter', 'base', 'The payer allowed $100.00 per line [1].', amount('$100.00')),
  // The payment-engine reviewer's own legitimate probes.
  reviewed('PE probe L4 paid, then allowed', 'base', 'The payer paid $56.00 and allowed $70.00 per line [3].'),
  reviewed('PE probe L5 allowed against what the contract requires', 'base', 'The payer allowed $70.00 against the $100.00 the contract requires [3].'),
  reviewed('PE probe L6 due, then days late', 'interest', 'Payment was due on 2026-03-15, and the payer paid 24 days late [4].'),
  reviewed('PE probe L8 required to pay within', 'interest', 'The payer was required to pay within 33 days [4].'),
  reviewed('PE probe L11 allowed but paid', 'base', 'The payer allowed $70.00 but paid only $56.00 per line [3].'),
  reviewed('PE probe L12 paid, less than allowed', 'base', 'The payer paid $56.00, less than the $70.00 it allowed [3].'),
  reviewed('PE probe L13 expected and allowed totals', 'base', 'The contract expected $300.00 and the payer allowed $210.00 [3].'),
  reviewed('PE probe L15 each of the lines’ units', 'base', 'Each of the 3 lines billed 2 units of 97110 [3].'),
  reviewed('PE probe L16 serviced, then paid', 'base', 'The lines, serviced from 2026-03-05 to 2026-03-07, were paid on 2026-04-08 [3].'),
  reviewed('PE probe U6 the allowed amount as paid, after the remittance', 'base', 'The remittance shows the payer paid $70.00 per line [3].', amount('$70.00')),
  reviewed('PE probe U8 the expected amount as paid, after the payer paid the contract rate', 'base', 'The payer paid the contract rate, $100.00, per line [3].', amount('$100.00')),
  reviewed('PE probe V3 the days late as the window', 'interest', 'Interest accrues, and disputes are raised within 24 days [1].', at('24')),
  reviewed('PE probe V4 the days to pay as the window', 'interest', 'The payer had to pay, and disputes are raised, within 33 days [1].', at('33')),
  reviewed('PE probe R3 business days to pay a clean claim', 'businessDays', 'The payer has 15 business days to pay a clean claim [4].'),
  reviewed('PE probe R5 all claims paid on a date, under the year’s contract', 'base', 'The payer paid all 3 claims on April 8, 2026, under the 2026 contract [3].'),
];

/**
 * The values each role's inputs hold, read from the content's fields by role (a test's oracle, written apart from
 * ./facts.ts so a property does not test the facts against themselves): counts and numbers as plain decimals,
 * amounts as cents, dates ISO, years YYYY, percentages plain decimals. `units` are the units in all (the pattern's
 * and each code's), `line_units` each line's; amounts are held whatever they are stated per. Every date role is here:
 * the deadline (each line's window and deadline at the first level, and the version's), the due date of a line whose
 * interest is stated, the packet's date, and the fee schedule's year (the contract's locked year, or the service
 * years).
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
  // Units in all: the pattern's and each code's (a line's are each line's units).
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
  // What the lines paid, and what the patients owe, in total.
  const total = (amounts: readonly (string | null)[]) => (amounts.every((item) => item !== null) ? amounts.reduce((sum, item) => sum + BigInt(item ?? '0'), 0n).toString() : null);
  add('paid', total(content.lines.map((item) => item.paid_cents)));
  add('patient_share', total(content.lines.map((item) => item.calculation.patient_share_cents)));
  add('as_of_date', content.as_of);
  // The dispute deadline: each line's window and deadline at the first level, and the version's own deadline.
  for (const item of firstLevel ? content.lines : []) {
    add('deadline', item.window_ends_on);
    add('deadline', item.deadline.ends_on);
  }
  add('deadline', content.deadline.ends_on);
  // The fee schedule's year: the contract's locked year, or the service dates' years.
  const basis = citation.kind === 'contract' ? (citation.parameters as { year_basis?: unknown }).year_basis : undefined;
  const locked = typeof basis === 'string' ? /^LOCKED:(\d{4})$/.exec(basis)?.[1] : undefined;
  for (const year of locked === undefined ? content.lines.map((item) => item.service_date.slice(0, 4)) : [locked]) {
    add('schedule_year', year);
  }
  if (citation.kind === 'contract') {
    add('version', citation.version_no);
    add('citation_page', citation.page);
    add('effective_date', citation.effective_from);
    add('effective_date', citation.effective_to);
    const { amount_cents: amount, percent } = citation.parameters as { amount_cents?: unknown; percent?: unknown };
    add('expected', typeof amount === 'string' ? amount : null);
    add('contract_percent', typeof percent === 'string' ? decimal(percent).toString() : null);
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
    add('interest_rate', interest.annual_rate_percent === null ? null : decimal(interest.annual_rate_percent).toString());
    for (const item of interest.lines) {
      add('received_date', item.received_on);
      add('paid_date', item.paid_on);
      if (item.interest_cents !== null && BigInt(item.interest_cents) > 0n) {
        add('due_date', item.due_on);
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
