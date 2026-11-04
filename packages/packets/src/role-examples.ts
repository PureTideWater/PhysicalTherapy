import { cents, decimal } from '@tp/money';

import { assemblePacket } from './assemble';
import type { FigureKind } from './scan';
import type { FigureNeeds } from './verifier/mismatches';
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
  // The converging fix (rule 2): one line, whose value per line is its total.
  'oneLine',
  // The review of the amended rule (PE5-2): line 2 bills 3 units at $150.00 expected, $105.00 allowed, $45.00 short and
  // $84.00 paid, lines 1 and 3 their 2 units at $100.00, $70.00, $30.00 and $56.00 ($350.00, $245.00, $105.00 and 7 units
  // in total); and the base with line 3 serviced on 2026-04-02 (CORR5-1).
  'differing',
  'april',
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
    oneLine: packet({ lines: [line(1)] }),
    differing: packet({ lines: [line(1), line(2, { units: '3', expectedCents: cents(15000n), observedCents: cents(10500n), varianceCents: cents(4500n), paidCents: cents(8400n) }), line(3)] }),
    april: packet({ lines: [line(1), line(2), line(3, { serviceDate: '2026-04-02' })] }),
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
  stated('D1 each line’s units', 'base', 'The lines billed 2 units per line [3].'),
  stated('D2 each line’s units in words', 'base', 'The lines billed two units per line [3].'),
  stated('D3 units and claims', 'base', '2 units per line were billed on 3 claims [3].'),
  stated('D4 the pattern’s units', 'base', 'The 6 units in all were short [3].'),
  stated('D5 units on each of the lines', 'base', 'The payer paid 2 units on each of 3 lines [3].'),
  stated('D6 the units in total', 'base', '6 units in total were billed [3].'),
  stated('D7 a hyphenated unit', 'base', 'Each 2-unit line was short [3].'),
  stated('D8 a label before a colon', 'base', 'Units billed: 2 per line [3].'),
  stated('D9 decimal units', 'decimalUnits', 'The lines billed 1.25 units per line [3].'),
  stated('D10 each line’s units as x', 'base', 'Three claims billed 97110 x 2 [3].'),
  stated('D27 each line’s units as x, joined', 'base', 'Three claims billed 97110 x2 [3].'),
  stated('D11 rows', 'base', 'There are 3 rows in the schedule [3].'),
  stated('D12 a count before a code', 'base', 'There were 3 97110 lines [3].'),
  stated('D13 a partitive', 'base', 'Three of the 3 lines were short [3].'),
  stated('D14 a partitive with no determiner', 'base', 'The payer paid 3 of 3 lines short [3].'),
  stated('D15 all of a count', 'base', 'All 3 lines were short [3].'),
  stated('D16 all of the claims', 'base', 'All three of the claims were short [3].'),
  stated('D17 each of the claims', 'base', 'Each of the three claims was underpaid by $30.00 per line [3].'),
  stated('D18 three of each', 'base', 'Three claims, three patients and three lines are affected [3].'),
  stated('D19 each of the lines', 'base', 'Each of the 3 lines was paid at $56.00 per line [3].'),
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
  stated('E1 a patient’s share after what was paid', 'base', 'The payer paid $56.00 per line after a patient share of $14.00 per line [3].'),
  stated('E2 the noun after an amount', 'base', 'The payer paid nothing toward the difference of $30.00 per line [3].'),
  stated('E3 allowed and paid', 'base', 'The payer allowed $70.00 per line and paid $56.00 per line [3].'),
  stated('E4 a remittance’s date and what it paid', 'base', 'The payer’s remittance of April 8, 2026 paid $56.00 per line [3].'),
  stated('E5 what the contract pays', 'base', 'The contract pays $50.00 per unit for 97110 [1].'),
  stated('E6 the date and what was paid', 'base', 'On April 8, 2026, the payer paid $56.00 for each line [3].'),
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
    ['base', 'Each of the 3 claims was paid short by $30.00 per line [3].'],
    ['base', 'Our contract sets $50.00 per unit for 97110 [1].'],
    ['base', 'At $50.00 a unit, 2 units per line come to $100.00 per line [1, 3].'],
    ['base', 'The payer allowed only $70.00 on each line [3].'],
    ['base', 'It paid $56.00 on each line, after a patient share of $14.00 per line [3].'],
    ['base', 'Each patient’s share was $14.00 per line [3].'],
    ['base', 'The schedule lists 3 lines, all billed as 97110 [3].'],
    ['base', 'All 3 lines were each short by $30.00 per line [3].'],
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
    ['base', 'All told, the remittances allowed $210.00 in total [3].'],
    ['base', 'Under the contract the three lines should have been paid $300.00 in total [3].'],
    ['base', 'That leaves a shortfall of $90.00 across the 3 lines [3].'],
    ['base', 'The difference is $90.00 in total [3].'],
    ['base', 'The payer owes a total of $90.00 as the difference [3].'],
    ['base', 'Each line billed 2 units per line of 97110 [3].'],
    ['base', 'The lines carry 6 units in all [3].'],
    ['base', 'Units billed: 2 per line [3].'],
    ['base', 'Each 2-unit line was paid $56.00 per line [3].'],
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
    ['base', 'Every line was allowed $70.00 per line [3].'],
    ['base', 'For 97110 the contract requires $50.00 per unit [1].'],
    ['base', 'In 2026 the payer paid each line short [3].'],
    ['base', 'The 2026 services were all short [3].'],
    ['base', 'Medicare’s 2026 fee schedule does not apply here [1].'],
    ['base', 'Under its 2026 contract the payer owes more [1].'],
    ['base', '2026 rates apply to these services [1].'],
    ['base', 'The CY 2026 schedule applies [1].'],
    ['base', 'For calendar year 2026 the contract governs [1].'],
    ['base', 'Services in March 2026 were paid in April 2026 [3].'],
    ['base', 'On April 8, 2026 the payer paid $56.00 for each line [3].'],
    ['base', 'The payer allowed $70.00 on each line and paid $56.00 on each line [3].'],
    ['base', 'Each claim line was allowed $70.00 per line [3].'],
    ['base', 'The contract amount is $100.00 per line [1].'],
    ['base', 'Expected payment was $100.00 a line [3].'],
    ['base', 'The payer paid 3 of 3 lines short [3].'],
    ['base', 'Of the 3 claims, all were short [3].'],
    ['base', 'The payer underpaid by $30.00 on each of the three lines [3].'],
    ['base', 'The shortfall comes to $90.00 in all [3].'],
    ['base', 'We ask the payer to pay a balance of $90.00 in total [3].'],
    ['base', 'Please reprocess claims 1 through 3 [3].'],
    ['base', 'Each patient’s line was short by $30.00 per line [3].'],
    ['base', 'The schedule shows a shortfall of $30.00 per line [3].'],
    ['base', 'These 3 lines were billed between March 5 and March 7, 2026 [3].'],
    ['base', 'Each visit was billed as 97110 x 2 [3].'],
    ['base', 'The payer remitted $56.00 per line [3].'],
    ['base', 'The remittance shows $70.00 per line allowed [3].'],
    ['base', 'The 6 units in all were billed at $50.00 each [1, 3].'],
    ['base', 'That is an expected $100.00 per line against an allowed $70.00 per line [3].'],
    ['base', 'The line schedule lists the three 97110 lines [3].'],
    ['base', 'Two units per line were billed [3].'],
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
    ['base', 'A total of 3 lines and 6 units in all are in dispute [3].'],
    ['base', 'The 3 lines total $300.00 in all expected [3].'],
    ['base', 'Expected allowed is $100.00 per line [3].'],
    ['base', 'Allowed is $70.00 per line [3].'],
    ['base', 'Paid is $56.00 per line [3].'],
    ['base', 'Shortfall is $30.00 per line [3].'],
    ['base', 'Shortfall is $90.00 in all [3].'],
    ['base', 'The contract (version 1, page 2) sets the rate [1].'],
    ['base', 'Its rate for 97110 is $50.00 per unit [1].'],
    ['base', 'The three lines were serviced March 5 through March 7 [3].'],
    ['base', 'Service on March 6, 2026 was paid on April 8, 2026 [3].'],
    ['base', 'The lines on rows 2 and 3 were billed on March 6 and March 7 [3].'],
    ['base', 'Claim 3 was billed on 2026-03-07 [3].'],
    ['base', 'The payer should have allowed $100.00 on each line [3].'],
    ['base', 'The contract requires $100.00 per line, but the payer allowed $70.00 per line [1, 3].'],
    ['base', 'It allowed $70.00 per line where $100.00 per line was due [3].'],
    ['base', 'The payer paid $56.00 per line, and the patients owe $14.00 per line [3].'],
    ['base', 'The window ends 2036-04-05 [1].'],
    ['base', 'The payer processed the claims on April 8, 2026 [3].'],
    ['base', 'SYNTHETIC THERAPY GROUP 01 billed the 3 lines [3].'],
    ['interest', 'The state’s prompt-pay rule gives the payer 33 days to pay [4].'],
    ['interest', 'Payment was due on March 15, 2026 [4].'],
    ['interest', 'The payer paid 24 days late [4].'],
    ['interest', 'Interest has accrued for 215 days [4].'],
    ['interest', 'Interest runs at 9% a year [4].'],
    ['interest', 'Interest of $5.76 in all is owed on these lines [4].'],
    ['interest', 'Each line accrues interest of $1.92 per line [4].'],
    ['interest', 'The payer received the claims on February 10, 2026 [4].'],
    ['interest', 'Clean claims must be paid within 33 days [4].'],
    ['interest', 'At 9% per annum, interest totals $5.76 in all [4].'],
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
export type ReviewedMismatch =
  | readonly ['figure_not_in_input', FigureKind, string]
  | readonly ['figure_not_in_input', FigureKind, string, Exclude<FigureNeeds, null>]
  | readonly ['hidden_character', null, string];

export interface ReviewedExample {
  /** The finding's id (docs/adr/0086; the review of 2026-11-01) and what the example states. */
  readonly id: string;
  readonly content: RoleContent;
  readonly narrative: string;
  /**
   * Every mismatch, in text order: none for a narrative that passes (CAS-44), the figures it misstates for one that
   * fails (CAS-43), each with what its words must say when that is why it fails (FigureNeeds: `scope`, whether it is
   * per line or in total; `own_words`, its own words instead of "respectively"), else nothing more.
   */
  readonly fails: readonly ReviewedMismatch[];
}

const at = (figure: string, kind: FigureKind = 'number'): ReviewedMismatch => ['figure_not_in_input', kind, figure];
const amount = (figure: string) => at(figure, 'amount');
const date = (figure: string) => at(figure, 'date');
/** An amount whose words say neither per line nor in total, where its role's two differ (rule 2 of docs/adr/0086). */
const unscoped = (figure: string, kind: FigureKind = 'amount'): ReviewedMismatch => ['figure_not_in_input', kind, figure, 'scope'];
/** A figure of a "respectively" list in neither plain form (rule 3 of docs/adr/0086). */
const unread = (figure: string): ReviewedMismatch => ['figure_not_in_input', 'amount', figure, 'own_words'];
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
  reviewed('PE-1 respectively, in the wrong order, a scope between the list and "respectively"', 'base', 'The payer allowed and the contract expected $100.00 and $70.00 per line respectively [3].', unread('$100.00'), unread('$70.00')),
  reviewed('PE-1 respectively, in the wrong order', 'base', 'For each line, the payer allowed and the contract expected $100.00 and $70.00, respectively [3].', amount('$100.00'), amount('$70.00')),
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
  reviewed('CRIT-3 a service date after an amount', 'base', 'The payer paid $56.00 per line on 2026-03-05 [3].', unscoped('$56.00'), date('2026-03-05')),
  reviewed('CRIT-3 the deadline opening the sentence', 'base', 'On 2036-04-05 the payer paid $56.00 per line [3].', date('2036-04-05')),
  reviewed('CRIT-3 the deadline after a count', 'base', 'The payer paid 3 lines on 2036-04-05 [3].', date('2036-04-05')),
  reviewed('CRIT-3 a service date as the deadline after an amount', 'base', 'We dispute $90.00 in total by 2026-03-05 [1].', unscoped('$90.00'), date('2026-03-05')),
  reviewed('CRIT-3 control: one cue', 'base', 'The payer paid on 2026-03-05 [3].', date('2026-03-05')),
  reviewed('CRIT-3 (variant) a service date opening the sentence before a comma', 'base', 'On 2026-03-05, the payer paid $56.00 per line [3].', date('2026-03-05'), unscoped('$56.00')),
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
  reviewed('CORR-6 respectively, in order', 'base', 'The contract expected per line and the payer allowed per line $100.00 and $70.00, respectively [1].'),
  reviewed('CORR-6 respectively, in order, no scope stated', 'base', 'The contract expected and the payer allowed $100.00 and $70.00, respectively [1].', unscoped('$100.00'), unscoped('$70.00')),
  // CORR-D1, CORR-D2 (the review of the fix round): the cues after a "respectively" list, and one scope for the list.
  reviewed('CORR-D1 respectively, the cues after the list, in the wrong order', 'base', '$70.00 and $100.00 were expected and allowed per line, respectively [1].', amount('$70.00'), amount('$100.00')),
  reviewed('CORR-D1 respectively, the cues after the list, in order, "per line" with the second cue alone', 'base', '$100.00 and $70.00 were expected and allowed per line, respectively [1].', unscoped('$100.00')),
  reviewed('CORR-D1 respectively, the cues after the list, in order, a scope with each cue', 'base', '$100.00 and $70.00 were expected per line and allowed per line, respectively [1].'),
  reviewed('CORR-D1 respectively, "the expected and allowed amounts" after the list, in the wrong order', 'base', 'Per line, $70.00 and $100.00 were the expected and allowed amounts, respectively [1].', amount('$70.00'), amount('$100.00')),
  reviewed('CORR-D1 respectively, "the expected and allowed amounts" after the list, in order', 'base', '$100.00 and $70.00 were the expected and allowed amounts per line, respectively [1].'),
  reviewed('CORR-D1 (variant) respectively, the contracted and paid amounts after the list, swapped', 'base', '$56.00 and $100.00 were the contracted and paid amounts per line, respectively [1].', amount('$56.00'), amount('$100.00')),
  reviewed('CORR-D1 (variant) respectively, the contracted and paid amounts after the list, in order', 'base', '$100.00 and $56.00 were the contracted and paid amounts per line, respectively [1].'),
  reviewed('CORR-D2 respectively, a total stated per line after the list', 'base', 'The contract expected and the payer allowed $300.00 and $70.00 per line, respectively [1].', unread('$300.00'), unread('$70.00')),
  reviewed('CORR-D2 respectively, a total stated per line before the list', 'base', 'Per line, the contract expected and the payer allowed $100.00 and $210.00, respectively [1].', unscoped('$100.00'), unscoped('$210.00')),
  reviewed('CORR-D2 respectively, a line’s value stated in total after the list', 'base', 'The expected and allowed amounts were $100.00 and $210.00 in total, respectively [1].', unread('$100.00'), unread('$210.00')),
  reviewed('CORR-D2 respectively, each line’s values, "per line" between the list and "respectively"', 'base', 'The contract expected and the payer allowed $100.00 and $70.00 per line, respectively [1].', unread('$100.00'), unread('$70.00')),
  reviewed('CORR-D2 respectively, the totals, "in total" between the list and "respectively"', 'base', 'The contract expected and the payer allowed $300.00 and $210.00 in total, respectively [1].', unread('$300.00'), unread('$210.00')),
  reviewed('CORR-D2 respectively, each line’s values, "amounts per line" before the list', 'base', 'The expected and allowed amounts per line were $100.00 and $70.00, respectively [1].'),
  reviewed('CORR-D2 respectively, the totals after an opening "In total"', 'base', 'The contract expected in total and the payer allowed in total $300.00 and $210.00, respectively [1].'),
  // NEW-N1, NEW-N2, PE-D2 (round 2 of the review of the fix round): a clause of its own after a "respectively" list states
  // nothing of the list; a scope with each cue is that cue's figure's; an opening "each of the 3 lines" is each line's.
  reviewed('NEW-N1 respectively, a line’s value in a list stated in total, before a clause of its own', 'base', 'In total, the contract expected and the payer allowed $300.00 and $70.00, respectively, which the payer explained for each line [1].', unscoped('$300.00'), unscoped('$70.00')),
  reviewed('NEW-N1 respectively, the totals, before a clause of its own', 'base', 'The contract expected and the payer allowed $300.00 and $210.00, respectively, which the payer explained for each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('NEW-N1 respectively, the totals stated in total, before a clause of its own', 'base', 'In total, the contract expected and the payer allowed $300.00 and $210.00, respectively, which the payer explained for each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('NEW-N1 respectively, each line’s values, before a clause of its own', 'base', 'The contract expected and the payer allowed $100.00 and $70.00, respectively, which the payer explained for each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('NEW-N1 control: one figure before a clause of its own', 'base', 'The payer allowed $210.00, which the payer explained for each line [1].', unscoped('$210.00')),
  reviewed('NEW-N2 respectively, a scope with each cue after the list', 'base', '$300.00 and $70.00 were expected in total and allowed per line, respectively [1].'),
  reviewed('NEW-N2 respectively, a scope with each cue after "respectively"', 'base', '$300.00 and $70.00 were, respectively, expected in total and allowed per line [1].'),
  reviewed('NEW-N2 respectively, per line, then in total, with each cue', 'base', '$100.00 and $210.00 were expected per line and allowed in total, respectively [1].'),
  reviewed('NEW-N2 control: in total with each cue', 'base', '$300.00 and $210.00 were expected in total and allowed in total, respectively [1].'),
  reviewed('NEW-N2 respectively, the scopes with each cue swapped', 'base', '$300.00 and $70.00 were expected per line and allowed in total, respectively [1].', amount('$300.00'), amount('$70.00')),
  reviewed('NEW-N2 respectively, the scopes with each cue after "respectively" swapped', 'base', '$300.00 and $70.00 were, respectively, expected per line and allowed in total [1].', amount('$300.00'), amount('$70.00')),
  reviewed('NEW-N2 respectively, in total, then per line, swapped', 'base', '$100.00 and $210.00 were expected in total and allowed per line, respectively [1].', amount('$100.00'), amount('$210.00')),
  reviewed('PE-D2 a total after "On each of the 3 lines"', 'base', 'On each of the 3 lines, the contract expected $300.00 [1].', unscoped('$300.00')),
  reviewed('PE-D2 a total after "For each of the 3 lines"', 'base', 'For each of the 3 lines, the payer allowed $210.00 [1].', unscoped('$210.00')),
  reviewed('PE-D2 a total after "In each of the 3 lines"', 'base', 'In each of the 3 lines, the payer allowed $210.00 [1].', unscoped('$210.00')),
  reviewed('PE-D2 each line’s value after "On each of the 3 lines"', 'base', 'On each of the 3 lines, the contract expected $100.00 [1].', unscoped('$100.00')),
  reviewed('PE-D2 control: a total stated per line after it', 'base', 'The contract expected $300.00 on each of the 3 lines [1].', amount('$300.00')),
  // R1-NF-1, R1-NF-2, R1-NF-3 (pass 2 of round 2): an opening "each" states only its own clause's figures; a clause after
  // "respectively" that opens with "and", a participle or "with" is no list's; a scope between commas with each cue is its cue's.
  reviewed('R1-NF-2 an opening "For each line", then a total in a clause after "while"', 'base', 'For each line, the payer allowed $70.00, while across the 3 lines it allowed $210.00 [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('R1-NF-2 an opening "For each line", then "the 3 lines together"', 'base', 'For each line, the payer allowed $70.00, while the 3 lines together were allowed $210.00 [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('R1-NF-2 an opening "For each line", then the claim’s total after "and"', 'base', 'For each line, the payer allowed $70.00, and the claim was allowed $210.00 [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('R1-NF-2 an opening "On each of the 3 lines", then the total owed after "so"', 'base', 'On each of the 3 lines, the payer allowed $70.00, so the payer owes $90.00 [1].', unscoped('$70.00'), unscoped('$90.00')),
  reviewed('R1-NF-2 an opening "For each line", then a total stated per line in a clause after "while"', 'base', 'For each line, the payer allowed $70.00, while for each line it allowed $210.00 [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('R1-NF-2 an opening "For each line", a total in its own clause', 'base', 'For each line, the payer allowed $70.00 and the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R1-NF-2 a total after "Each of the 3 lines", its subject', 'base', 'Each of the 3 lines was expected at $300.00 [1].', unscoped('$300.00')),
  reviewed('R1-NF-2 the lines’ units after "Each of the 3 lines", its subject', 'base', 'Each of the 3 lines billed 6 units [1].', unscoped('6', 'number')),
  reviewed('R1-NF-2 control: each line’s value after "Each of the 3 lines"', 'base', 'Each of the 3 lines was expected at $100.00 [1].', unscoped('$100.00')),
  reviewed('R1-NF-1 respectively, the totals, before a clause after "and"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and each line is short [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R1-NF-1 respectively, the totals, before a participle’s clause', 'base', '$300.00 and $210.00 were expected and allowed, respectively, leaving each line short [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R1-NF-1 respectively, the totals, before a clause after "with"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, with each line short [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R1-NF-1 control: "respectively, per line" is the list’s own', 'base', '$300.00 and $210.00 were expected and allowed, respectively, per line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R1-NF-1 control: "respectively, for each line" is the list’s own', 'base', '$100.00 and $70.00 were expected and allowed, respectively, for each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('R1-NF-3 respectively, a scope between commas with each cue', 'base', '$300.00 and $70.00 were expected, in total, and allowed, per line, respectively [1].', unscoped('$300.00'), unscoped('$70.00')),
  reviewed('R1-NF-3 respectively, a scope between commas with each cue, swapped', 'base', '$300.00 and $70.00 were expected, per line, and allowed, in total, respectively [1].', unscoped('$300.00'), unscoped('$70.00')),
  // R2-NEW-R2P2-1, R2-NEW-R2P2-2 (pass 3 of round 2): an opening "each" reaches the clauses coordinated after it unless
  // their own words state a scope or name the lines together; a scope alone after "respectively" and a lead word is the list's.
  reviewed('R2-NEW-R2P2-1 an opening "For each line", then a total after ", and"', 'base', 'For each line, the payer allowed $70.00, and the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "For each line", then a total after ", but"', 'base', 'For each line, the payer allowed $70.00, but the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "For each line", then a total after ", and it"', 'base', 'For each line, the payer allowed $70.00, and it expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "On each of the 3 lines", then a total after ", and"', 'base', 'On each of the 3 lines, the payer allowed $70.00, and the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "On each of the 3 lines", then a total after ", while"', 'base', 'On each of the 3 lines, the payer allowed $70.00, while the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "For each line" with no comma, then a total after ", and"', 'base', 'For each line the payer allowed $70.00, and the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 an opening "Per line", then a total after ", and"', 'base', 'Per line, the payer allowed $70.00, and the contract expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('R2-NEW-R2P2-1 control: each line’s value after ", and"', 'base', 'For each line, the payer allowed $70.00, and the contract expected $100.00 [1].', unscoped('$70.00'), unscoped('$100.00')),
  reviewed('R2-NEW-R2P2-1 control: "Per line", then the total owed after "so"', 'base', 'Per line, the payer allowed $70.00, so the payer owes $90.00 [1].', unscoped('$70.00'), unscoped('$90.00')),
  reviewed('R2-NEW-R2P2-1 control: the total owed after a semicolon', 'base', 'Per line, the payer allowed $70.00; the payer owes $90.00 [1].', unscoped('$70.00'), unscoped('$90.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "being per line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, being per line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "applying to each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, applying to each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "counting each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, counting each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "with each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, with each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "and for each line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and for each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 respectively, the totals, then "nothing per line"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, nothing per line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "being per line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, being per line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "applying to each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, applying to each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "counting each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, counting each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "with each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, with each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "and for each line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, and for each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('R2-NEW-R2P2-2 control: each line’s values, then "nothing per line"', 'base', '$100.00 and $70.00 were expected and allowed, respectively, nothing per line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('CORR-6 a line’s amount, then the same role in total', 'base', 'The payer allowed $70.00 per line and $100.00 in total [1].', amount('$100.00')),
  reviewed('CORR-6 a line’s amount, then the allowed total', 'base', 'The payer allowed $70.00 per line and $210.00 in total [1].'),
  reviewed('CORR-6 the expected amount after "not the contract amount of"', 'base', 'The payer allowed, not the contract amount of $70.00, only $100.00 per line [1].', amount('$70.00')),
  reviewed('CORR-7 a total as each line’s', 'base', 'Each line was expected at $300.00 [1].', unscoped('$300.00')),
  reviewed('CORR-7 the shortfall in total as each line’s', 'base', 'The shortfall on each line is $90.00 [1].', unscoped('$90.00')),
  reviewed('CORR-7 each line’s units as the lines’ total', 'base', 'The 3 lines billed 2 units [1].', unscoped('2', 'number')),
  reviewed('CORR-7 each line’s expected amount', 'base', 'The contract expected $100.00 for each line [1].'),
  reviewed('CORR-7 the lines’ units in total', 'base', 'The 3 lines billed 6 units in total [1].'),
  reviewed('CORR-20 what the payer paid in total', 'base', 'The payer paid $168.00 in total for the 3 lines [1].'),
  reviewed('CORR-20 what the patients owe in total', 'base', 'The patients owe $42.00 in total in coinsurance across the 3 lines [1].'),
  reviewed('CRIT-2 the expected total as the shortfall’s', 'base', 'The shortfall of $30.00 per line comes to $300.00 [3].', amount('$300.00')),
  reviewed('CRIT-2 the expected total as the allowance’s', 'base', 'The payer’s allowance of $70.00 per line comes to $300.00 [3].', amount('$300.00')),
  reviewed('CRIT-2 the shortfall per line and in total', 'base', 'The shortfall of $30.00 per line comes to $90.00 in all [3].'),
  reviewed('CRIT-2 the shortfall per line, then its total with no scope', 'base', 'The shortfall of $30.00 per line comes to $90.00 [3].', unscoped('$90.00')),
  // PE-6, CORR-8 to CORR-13, CORR-15: correct sentences pass.
  reviewed('PE-6, CORR-9 the first 3 claims', 'base', 'The first 3 claims were underpaid [3].'),
  reviewed('PE-6 a locked fee schedule’s year after "paid"', 'medicareNoYear', 'The payer paid less than the 2025 Medicare fee schedule requires [1].'),
  reviewed('CORR-8 the sixth unit, as prose', 'base', 'The sixth unit was not paid [1].'),
  reviewed('CORR-8 (Verifier A) the sixth unit where the lines bill other units', 'decimalUnits', 'The sixth unit was not paid [1].'),
  reviewed('CORR-8 (Verifier B) the fifth unit', 'base', 'The fifth unit was not paid [1].'),
  reviewed('CORR-8 the first unit', 'base', 'The first unit was paid at the contract rate [1].'),
  reviewed('CORR-8 the second appeal', 'base', 'This is the second appeal on these lines [1].'),
  reviewed('CORR-9 the first 3 claims and each one’s shortfall', 'base', 'The first 3 claims were each underpaid [1].'),
  reviewed('CORR-9 a partitive’s part', 'base', '2 of the 3 claims were short [1].'),
  reviewed('CORR-9 a partitive’s part after its whole', 'base', 'Of the 3 claims, 2 were paid on 2026-04-08 [1].'),
  reviewed('CORR-9 a partitive’s part larger than its whole', 'base', '4 of the 3 claims were short [1].', at('4')),
  reviewed('CORR-9 what the patient paid', 'base', 'The patients paid $14.00 per line of the $70.00 per line allowed [1].'),
  reviewed('CORR-9 payment of the balance', 'base', 'We request payment of the total $90.00 balance within 30 days [1].', unscoped('$90.00'), at('30')),
  reviewed('CORR-10 a locked year after "paid"', 'locked2025', 'The payer paid under the 2025 fee schedule [1].'),
  reviewed('CORR-10 a locked year after services and "paid"', 'locked2025', 'These services were paid at 2025 rates [1].'),
  reviewed('CORR-10 control: a locked year', 'locked2025', 'The 2025 fee schedule applies [1].'),
  reviewed('CORR-10 (Verifier B) control: the contract’s locked year', 'locked2025', 'The contract uses the 2025 fee schedule [1].'),
  reviewed('CORR-10 a year the schedule is not locked to', 'locked2025', 'The payer paid under the 2026 fee schedule [1].', at('2026')),
  reviewed('CORR-11 business days to pay, after "requires payment"', 'businessDays', 'The statute requires payment within 15 business days [1].'),
  reviewed('CORR-11 business days to pay, after "must pay"', 'businessDays', 'The payer must pay within 15 business days [1].'),
  reviewed('CORR-12 "appeal" as a verb before claims', 'base', 'We appeal 3 claims that were paid short [1].'),
  // A code names a part of the lines, and a count of units in all is held to it as an amount is (CORR5-3).
  reviewed('CORR-12 "appeal" as a verb before units', 'base', 'We appeal 6 units in all, billed under 97110 [1].', unscoped('6', 'number')),
  reviewed('CORR-13 a comma that starts a clause', 'base', 'Under version 1, 2 of them were short [1].'),
  reviewed('CORR-15 rows in an en-dash range', 'base', 'Lines 1–3 were short [1].'),
  reviewed('CORR-15 rows in a range in words', 'base', 'Lines 1 to 3 were short [1].'),
  // CORR-16: a confusable letter in a cue is a hidden character.
  reviewed('CORR-16 a Cyrillic letter in "allowed"', 'base', 'The payer аllowed $100.00 per line [1].', ['hidden_character', null, 'а']),
  reviewed('CORR-16 control: the Latin letter', 'base', 'The payer allowed $100.00 per line [1].', amount('$100.00')),
  // The payment-engine reviewer's own legitimate probes.
  reviewed('PE probe L4 paid, then allowed', 'base', 'The payer paid $56.00 per line and allowed $70.00 per line [3].'),
  reviewed('PE probe L5 allowed against what the contract requires', 'base', 'The payer allowed $70.00 per line against the $100.00 per line the contract requires [3].'),
  reviewed('PE probe L6 due, then days late', 'interest', 'Payment was due on 2026-03-15, and the payer paid 24 days late [4].'),
  reviewed('PE probe L8 required to pay within', 'interest', 'The payer was required to pay within 33 days [4].'),
  reviewed('PE probe L11 allowed but paid', 'base', 'The payer allowed $70.00 per line but paid only $56.00 per line [3].'),
  reviewed('PE probe L12 paid, less than allowed', 'base', 'The payer paid $56.00 per line, less than the $70.00 per line it allowed [3].'),
  reviewed('PE probe L13 expected and allowed totals', 'base', 'The contract expected $300.00 in total and the payer allowed $210.00 in total [3].'),
  reviewed('PE probe L13 expected and allowed totals, no scope stated', 'base', 'The contract expected $300.00 and the payer allowed $210.00 [3].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('PE probe L15 each of the lines’ units', 'base', 'Each of the 3 lines billed 2 units per line of 97110 [3].'),
  reviewed('PE probe L16 serviced, then paid', 'base', 'The lines, serviced from 2026-03-05 to 2026-03-07, were paid on 2026-04-08 [3].'),
  reviewed('PE probe U6 the allowed amount as paid, after the remittance', 'base', 'The remittance shows the payer paid $70.00 per line [3].', amount('$70.00')),
  reviewed('PE probe U8 the expected amount as paid, after the payer paid the contract rate', 'base', 'The payer paid the contract rate, $100.00, per line [3].', amount('$100.00')),
  reviewed('PE probe V3 the days late as the window', 'interest', 'Interest accrues, and disputes are raised within 24 days [1].', at('24')),
  reviewed('PE probe V4 the days to pay as the window', 'interest', 'The payer had to pay, and disputes are raised, within 33 days [1].', at('33')),
  reviewed('PE probe R3 business days to pay a clean claim', 'businessDays', 'The payer has 15 business days to pay a clean claim [4].'),
  reviewed('PE probe R5 all claims paid on a date, under the year’s contract', 'base', 'The payer paid all 3 claims on April 8, 2026, under the 2026 contract [3].'),
  // The converging fix (docs/adr/0086, the closed rules, rule 1 as amended): a figure's scope is granted only by a
  // scope phrase of the closed list beside it, and by none in a sentence that names a part of the lines (rule 1); a
  // figure with no scope fails where its role's per-line and total values differ (rule 2, `scope`); "respectively" is
  // read in two plain forms alone, and any other list fails (rule 3, `own_words`). Every reproduction of the rounds of
  // fix and recheck is here, read by the amended rule (each expectation below is its verdict, labels kept from the
  // round that raised it, so a "control" that passed under an opening phrase or a clause's scope now fails with
  // `scope`): a false pass fails; a sentence with the right figure and a phrase beside it passes; the rest fail with
  // the plain instruction.
  reviewed('PE-D1 respectively, a count between the list and its cues after it ("on each of the 3 lines")', 'base', '$70.00 and $100.00 on each of the 3 lines were expected and allowed, respectively [1].', unread('$70.00'), unread('$100.00')),
  reviewed('PE-D1 respectively, a count between the list and its cues after it ("for the 3 lines")', 'base', '$210.00 and $300.00 for the 3 lines were expected and allowed, respectively [1].', unread('$210.00'), unread('$300.00')),
  reviewed('PE-D1 respectively, a code between the list and its cues after it', 'base', '$70.00 and $100.00 for 97110 were the expected and allowed amounts, respectively [1].', unread('$70.00'), unread('$100.00')),
  reviewed('PE-D1 control: the count after "respectively", swapped', 'base', '$210.00 and $300.00 were expected and allowed, respectively, for the 3 lines [1].', amount('$210.00'), amount('$300.00')),
  reviewed('PE-D1 respectively, a scope between the list and its cues after it, the whole list’s', 'base', '$100.00 and $70.00 per line were expected and allowed, respectively [1].'),
  reviewed('PE-D3 respectively, "amounts per line" after it, then a clause after a comma', 'base', '$100.00 and $70.00, respectively, were the expected and allowed amounts per line, so the payer paid less [1].'),
  reviewed('PE-D3 control: "amounts per line" after "respectively"', 'base', '$100.00 and $70.00, respectively, were the expected and allowed amounts per line [1].'),
  reviewed('PE-D3 control: "amounts per line", then a semicolon', 'base', '$100.00 and $70.00, respectively, were the expected and allowed amounts per line; the payer paid less [1].'),
  reviewed('R1-NF-3 control: a scope with each cue, a comma after the first', 'base', '$300.00 and $70.00 were expected in total, and allowed per line, respectively [1].'),
  reviewed('R2-NEW-R2P2-2 control: the totals, then "for each line" after "respectively"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, for each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('R2-NEW-R2P2-2 control: the totals, then "each line" after "respectively"', 'base', '$300.00 and $210.00 were expected and allowed, respectively, each line [1].', unscoped('$300.00'), unscoped('$210.00')),
  reviewed('N1 respectively, the totals, then ", and for each line," and the shortfall', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and for each line, the payer owes $30.00 [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N1 respectively, the totals, then ", with each line," and the shortfall', 'base', '$300.00 and $210.00 were expected and allowed, respectively, with each line, the payer owing $30.00 [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N1 respectively, the totals, then ", and per line," and the shortfall', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and per line, the payer owes $30.00 [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N1 respectively, the totals, then ", and for each line," and what is owed', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and for each line, $30.00 is owed [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N1 control: "and for each line" in the shortfall’s own clause', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and for each line the payer owes $30.00 [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N1 control: ", and, for each line," before the shortfall', 'base', '$300.00 and $210.00 were expected and allowed, respectively, and, for each line, the payer owes $30.00 [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N1 the totals in total, then the shortfall in its own clause per line', 'base', 'In total, $300.00 and $210.00 were the expected and allowed amounts, respectively, and for each line the payer owes $30.00 [1].', unscoped('$300.00'), unscoped('$210.00'), unscoped('$30.00')),
  reviewed('N2 an opening "For each line", then a total with "for the claim" after it', 'base', 'For each line, the payer allowed $70.00, and $210.00 for the claim [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('N2 an opening "For each line", then "it allowed" a total "for the claim"', 'base', 'For each line, the payer allowed $70.00, and it allowed $210.00 for the claim [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('N2 an opening "For each line", then a total "on the claim" after "while"', 'base', 'For each line, the payer allowed $70.00, while it allowed $210.00 on the claim [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('N2 control: "for the claim" before the total', 'base', 'For each line, the payer allowed $70.00, and for the claim $210.00 [1].', unscoped('$70.00'), unscoped('$210.00')),
  reviewed('N3 "the claim line" is one line: its value', 'base', 'For each line, the payer allowed $70.00, and the claim line was expected $100.00 [1].', unscoped('$70.00'), unscoped('$100.00')),
  reviewed('N3 "the claim line" is one line: a total stated per line', 'base', 'For each line, the payer allowed $70.00, and the claim line was expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N3 "the claim line expected amount": a total stated per line', 'base', 'For each line, the payer allowed $70.00, and the claim line expected amount was $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N3 control: "each claim line", a total stated per line', 'base', 'For each line, the payer allowed $70.00, and each claim line was expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N4 "per the contract" is no scope: a total under an opening "For each line"', 'base', 'For each line, the payer allowed $70.00, and per the contract it expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N4 "as per the contract" is no scope', 'base', 'For each line, the payer allowed $70.00, and as per the contract it expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N4 "per the fee schedule" is no scope', 'base', 'For each line, the payer allowed $70.00, and per the fee schedule it expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N4 "per its contract" is no scope', 'base', 'For each line, the payer allowed $70.00, but per its contract the payer expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N4 control: "under the contract"', 'base', 'For each line, the payer allowed $70.00, and under the contract it expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('N4 control: "per the contract" between commas after the opening', 'base', 'For each line, per the contract, the payer expected $300.00 [1].', unscoped('$300.00')),
  reviewed('N4 "each was expected", stated per something but not a line nor in total', 'base', 'For each line, the payer allowed $70.00, and each was expected $300.00 [1].', unscoped('$70.00'), unscoped('$300.00')),
  reviewed('rule 3 respectively after figures each with its own cue, not a list', 'base', 'The contract expected $100.00 and the payer allowed $70.00, respectively [1].', unread('$100.00'), unread('$70.00')),
  reviewed('rule 3 respectively with more cues than figures', 'base', '$100.00 and $70.00 were expected, allowed and paid, respectively [1].', unread('$100.00'), unread('$70.00')),
  reviewed('rule 3 respectively after one figure', 'base', 'The payer allowed $70.00, respectively [1].', unread('$70.00')),
  reviewed('rule 3 a scope after "respectively" is no list’s', 'base', 'The contract expected and the payer allowed $100.00 and $70.00, respectively, for each line [1].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('rule 3 the opening scope and "respectively" with its cues before it, swapped', 'base', 'For each line, the contract expected and the payer allowed $70.00 and $100.00, respectively [1].', amount('$70.00'), amount('$100.00')),
  reviewed('rule 3 "amounts in total" after the list’s cues', 'base', '$300.00 and $210.00 were the expected and allowed amounts in total, respectively [1].'),
  reviewed('rule 2 an amount with no scope where per line and in total differ', 'base', 'The payer allowed $210.00 [1].', unscoped('$210.00')),
  reviewed('rule 2 the same amount in total', 'base', 'The payer allowed $210.00 in total [1].'),
  reviewed('rule 2 units with no scope where each line’s and the total differ', 'base', 'The payer underpaid 6 units [1].', unscoped('6', 'number')),
  reviewed('rule 2 an amount with no scope where per line and in total are one', 'oneLine', 'The payer allowed $70.00 [1].'),
  // The review of the converging fix (PE3-1, PE3-2, PE3-3, CORR3-1, CORR3-2), each reproduction and verifier's variant:
  // a figure's clause ends at a subordinator or "nor", and two scopes its words state that differ state none (rule 1);
  // a row's noun alone is no row; rows named by their labels or a part of them are no pattern's total (rule 2, the
  // scope instruction); every figure of a "respectively" list's clause fails in neither plain form, and none of an
  // earlier clause's is the list's (rule 3).
  reviewed('PE3-1 a stated total, then a trailing "after each line" clause', 'base', 'The payer allowed $70.00 in total after each line was reprocessed [3].', amount('$70.00')),
  reviewed('PE3-1 a stated total, then a trailing "once each line" clause', 'base', 'The payer allowed $70.00 in total once each line was reprocessed [3].', amount('$70.00')),
  reviewed('PE3-1 "altogether", then a trailing "until each line" clause', 'base', 'The payer allowed $70.00 altogether until each line was appealed [3].', unscoped('$70.00')),
  reviewed('PE3-1 an opening "In total,", then a trailing "after each line" clause', 'base', 'In total, the payer allowed $70.00 after each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 a coordinated total, then a trailing "after each line" clause', 'base', 'The contract expected $300.00 in total, and the payer allowed $70.00 after each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 "in total for each line": two scopes that differ state none', 'base', 'The payer allowed $70.00 in total for each line [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "after each line" a trailing clause’s', 'base', 'The payer allowed $70.00 after each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "until each line" a trailing clause’s', 'base', 'The payer allowed $70.00 until each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "before each line" a trailing clause’s', 'base', 'The payer allowed $70.00 before each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "once each line" a trailing clause’s', 'base', 'The payer allowed $70.00 once each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "even after each line" a trailing clause’s', 'base', 'The payer allowed $70.00 even after each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "whenever each line" a trailing clause’s', 'base', 'The payer allowed $70.00 whenever each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "despite each line" a trailing clause’s', 'base', 'The payer allowed $70.00 despite each line being reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "unlike each line’s" a trailing clause’s', 'base', 'The payer allowed $70.00 unlike each line’s expected amount [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, "nor did each line" a trailing clause’s', 'base', 'The payer allowed $70.00 nor did each line pass [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, ", nor did each line" a trailing clause’s', 'base', 'The payer allowed $70.00, nor did each line pass [3].', unscoped('$70.00')),
  reviewed('PE3-1 no scope, a fronted "After each line" clause with no comma', 'base', 'After each line was reprocessed the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-1 (verifier variant) no scope, "after every line" a trailing clause’s', 'base', 'The payer allowed $70.00 after every line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 (variant) a stated total, then a trailing "whereby each line" clause', 'base', 'The payer allowed $70.00 in total whereby each line was reprocessed [3].', amount('$70.00')),
  reviewed('PE3-1 (variant) no scope, "till each line" a trailing clause’s', 'base', 'The payer allowed $70.00 till each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE3-1 control: per line, then a trailing "after each line" clause', 'base', 'The payer allowed $70.00 per line after each line was reprocessed [3].'),
  reviewed('PE3-1 control: the total, then a trailing "after each line" clause', 'base', 'The payer allowed $210.00 in total after each line was reprocessed [3].'),
  reviewed('PE3-1 control: an opening "On each of the 3 lines" with no comma', 'base', 'On each of the 3 lines the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-1 respectively, cues before, a scope before the second cue is the second’s', 'base', 'The contract expected in total and per line the payer allowed per line $100.00 and $70.00, respectively [3].', amount('$100.00')),
  reviewed('PE3-1 respectively, cues after, a scope before the second cue is the second’s', 'base', '$100.00 and $70.00 were expected in total and per line allowed, respectively [3].', amount('$100.00'), unscoped('$70.00')),
  reviewed('PE3-1 control: respectively, cues before, the totals and each line’s in order', 'base', 'The contract expected in total and per line the payer allowed $300.00 and $70.00, respectively [3].', unscoped('$70.00')),
  reviewed('PE3-1 control: respectively, cues after, the totals and each line’s in order', 'base', '$300.00 and $70.00 were expected in total and per line allowed, respectively [3].', unscoped('$70.00')),
  reviewed('PE3-1 control: respectively, cues before, each cue per line', 'base', 'The contract expected per line and the payer allowed per line $100.00 and $70.00, respectively [3].'),
  reviewed('PE3-2 "in line with" is no row', 'base', 'The payer allowed $70.00 in line with its policy [3].', unscoped('$70.00')),
  reviewed('PE3-2 an opening "For the claim," and "in line with"', 'base', 'For the claim, the payer allowed $70.00 in line with its policy [3].', unscoped('$70.00')),
  reviewed('PE3-2 an opening "In total," and "the remittance line"', 'base', 'In total, the payer allowed $70.00 on the remittance line [3].', unscoped('$70.00')),
  reviewed('PE3-2 "the bottom line" is no row', 'base', 'The bottom line is the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-2 "the line schedule" is no row, before the figure', 'base', 'The line schedule shows the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-2 "the line schedule" is no row, after the figure', 'base', 'The payer allowed $70.00 according to the line schedule [3].', unscoped('$70.00')),
  reviewed('PE3-2 "after the visit" is no row', 'base', 'The payer allowed $70.00 after the visit [3].', unscoped('$70.00')),
  reviewed('PE3-2 "the patient’s visit" is no row', 'base', 'The patient’s visit was allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-2 the total "per the line schedule": no scope', 'base', 'The payer allowed $210.00 per the line schedule [3].', unscoped('$210.00')),
  reviewed('PE3-2 the total after "The line schedule shows": no scope', 'base', 'The line schedule shows the payer allowed $210.00 [3].', unscoped('$210.00')),
  reviewed('PE3-2 (verifier variant) the total "in line with its policy": no scope', 'base', 'The payer allowed $210.00 in line with its policy [3].', unscoped('$210.00')),
  reviewed('PE3-2 control: "on line 1" is one row', 'base', 'The payer allowed $70.00 on line 1 [3].', unscoped('$70.00')),
  reviewed('PE3-2 control: "Patient 2’s line" is one row', 'base', 'Patient 2’s line was allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-2 control: "the third line" is one row', 'base', 'The payer allowed $70.00 on the third line [3].', unscoped('$70.00')),
  reviewed('PE3-2 control: "the claim line" is one row', 'base', 'The claim line was allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-2 control: "the patient’s line" is one row', 'base', 'The patient’s line was allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE3-3 respectively, a date after the amounts: every figure of the list’s clause', 'base', '$70.00 and $100.00 per line on 2026-04-08 were the expected and allowed amounts, respectively [3].', unread('$70.00'), unread('$100.00'), ['figure_not_in_input', 'date', '2026-04-08', 'own_words']),
  reviewed('PE3-3 (variant) respectively, a date after the amounts, cues with no "amounts"', 'base', '$70.00 and $100.00 per line on 2026-04-08 were expected and allowed, respectively [3].', unread('$70.00'), unread('$100.00'), ['figure_not_in_input', 'date', '2026-04-08', 'own_words']),
  reviewed('PE3-3 (variant) respectively, an amount and a date in one list', 'base', '$100.00 and 2026-04-08 were the expected amount and the payment date, respectively [3].', unread('$100.00'), ['figure_not_in_input', 'date', '2026-04-08', 'own_words']),
  reviewed('CORR3-1 the total "for lines 1 and 2"', 'base', 'The payer allowed $210.00 for lines 1 and 2 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total "across lines 1 and 2"', 'base', 'The payer allowed $210.00 across lines 1 and 2 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total "over lines 1 to 2"', 'base', 'The payer allowed $210.00 over lines 1 to 2 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total for "2 of the 3 lines"', 'base', '2 of the 3 lines were allowed $210.00 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total for "Two of the 3 lines"', 'base', 'Two of the 3 lines were allowed $210.00 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total "On 2 of the 3 lines"', 'base', 'On 2 of the 3 lines the payer allowed $210.00 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total for "Lines 1 to 2"', 'base', 'Lines 1 to 2 were allowed $210.00 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total "across claims 1 and 2"', 'base', 'The payer allowed $210.00 across claims 1 and 2 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 the total "in total" for "Lines 1 and 2"', 'base', 'Lines 1 and 2 were allowed $210.00 in total [3].', unscoped('$210.00')),
  reviewed('CORR3-1 (verifier variant) the total "for lines 1 through 2"', 'base', 'The payer allowed $210.00 for lines 1 through 2 [3].', unscoped('$210.00')),
  reviewed('CORR3-1 (verifier control) the two lines’ own total, "for lines 1 and 2"', 'base', 'The payer allowed $140.00 for lines 1 and 2 [3].', amount('$140.00')),
  reviewed('CORR3-1 control: per line "for lines 1 and 2"', 'base', 'The payer allowed $70.00 per line for lines 1 and 2 [3].', unscoped('$70.00')),
  reviewed('CORR3-1 control: the total "for all 3 lines"', 'base', 'The payer allowed $210.00 for all 3 lines [3].'),
  reviewed('CORR3-1 control: the total "for the 3 lines"', 'base', 'The payer allowed $210.00 for the 3 lines [3].'),
  reviewed('CORR3-2 an earlier clause’s amount after ", and" is no list’s, cues before', 'base', 'The payer paid $56.00 per line, and the contract expected and the payer allowed $100.00 and $70.00, respectively [3].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('CORR3-2 an earlier clause’s amount after ", while" is no list’s, cues after', 'base', 'The payer paid $56.00 per line, while $100.00 and $70.00 were the expected and allowed amounts per line, respectively [3].'),
  reviewed('CORR3-2 control: the list alone, no scope', 'base', 'The contract expected and the payer allowed $100.00 and $70.00, respectively [3].', unscoped('$100.00'), unscoped('$70.00')),
  reviewed('CORR3-2 control: an amount and no clause’s edge before the list: one clause, every figure', 'base', 'The payer paid $56.00 per line and the contract expected $100.00 and $70.00, respectively [3].', unread('$56.00'), unread('$100.00'), unread('$70.00')),
  // The amended rule 1 (2026-11-04; docs/adr/0086): a scope is granted only by a scope phrase beside the figure, from a
  // closed list, and nothing in any other clause lends one; a sentence that names a part of the lines (a count of lines
  // other than the pattern's, "remaining", "other", "first", "last", "some", a partitive, a code, a date of service,
  // a patient, a row) holds every amount in it whose per-line and total values differ to no scope, so it fails.
  reviewed('AMEND adjacency: "per line" right after', 'base', 'The payer allowed $70.00 per line [3].'),
  reviewed('AMEND adjacency: "a line" right after', 'base', 'The contract expected $100.00 a line [3].'),
  reviewed('AMEND adjacency: "for each line" right after', 'base', 'The payer allowed $70.00 for each line [3].'),
  reviewed('AMEND adjacency: "on each of the 3 lines" right after', 'base', 'The contract expected $100.00 on each of the 3 lines [3].'),
  reviewed('AMEND adjacency: "in total" right after', 'base', 'The payer allowed $210.00 in total [3].'),
  reviewed('AMEND adjacency: "in all" right after', 'base', 'The payer allowed $210.00 in all [3].'),
  reviewed('AMEND adjacency: "across the 3 lines" right after', 'base', 'The payer allowed $210.00 across the 3 lines [3].'),
  reviewed('AMEND adjacency: "for all the lines" right after', 'base', 'The payer allowed $210.00 for all the lines [3].'),
  reviewed('AMEND adjacency: "a total of" right before', 'base', 'The payer allowed a total of $210.00 [3].'),
  reviewed('AMEND adjacency: "each line’s" right before', 'base', 'The payer allowed each line’s $70.00 [3].'),
  reviewed('AMEND adjacency: "the per-line" right before', 'base', 'The payer allowed the per-line $70.00 [3].'),
  reviewed('AMEND adjacency: "for the claim" where the pattern has one claim', 'oneClaim', 'The payer allowed $210.00 for the claim [3].'),
  reviewed('AMEND adjacency: a total stated per line fails at it', 'base', 'The payer allowed $210.00 per line [3].', amount('$210.00')),
  reviewed('AMEND adjacency: "for the claim" where the pattern has 3 claims', 'base', 'The payer allowed $210.00 for the claim [3].', unscoped('$210.00')),
  reviewed('AMEND adjacency: "across the 2 lines" of 3', 'base', 'The payer allowed $210.00 across the 2 lines [3].', unscoped('$210.00'), at('2')),
  reviewed('AMEND adjacency: "per line" then "for the 3 lines": two that differ grant none', 'base', 'The payer allowed $70.00 per line for the 3 lines [3].', unscoped('$70.00')),
  reviewed('AMEND not adjacent: an opening "Per line,"', 'base', 'Per line, the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('AMEND not adjacent: an opening "In total,"', 'base', 'In total, the payer allowed $210.00 [3].', unscoped('$210.00')),
  reviewed('AMEND not adjacent: "apiece"', 'base', 'The payer allowed $70.00 apiece [3].', unscoped('$70.00')),
  reviewed('AMEND not adjacent: a scope in another clause', 'base', 'The payer allowed $70.00, which is the amount per line [3].', unscoped('$70.00')),
  reviewed('AMEND part: "on line 1" with "per line"', 'base', 'The payer allowed $70.00 per line on line 1 [3].', unscoped('$70.00')),
  reviewed('AMEND part: a code with "per line"', 'base', 'The payer allowed $70.00 per line for 97110 [3].', unscoped('$70.00')),
  reviewed('AMEND part: a date of service with "per line"', 'base', 'The payer allowed $70.00 per line on 2026-03-05 [3].', unscoped('$70.00'), date('2026-03-05')),
  reviewed('AMEND part: a patient with "per line"', 'base', 'The payer allowed $70.00 per line for Patient 1 [3].', unscoped('$70.00')),
  reviewed('AMEND part: "the patient" of 3 with "per line"', 'base', 'The payer allowed $70.00 per line for the patient [3].', unscoped('$70.00')),
  reviewed('AMEND part: "the first line" with "per line"', 'base', 'The payer allowed $70.00 per line for the first line [3].', unscoped('$70.00')),
  reviewed('AMEND part: "the other lines" with "per line"', 'base', 'The payer allowed $70.00 per line for the other lines [3].', unscoped('$70.00')),
  reviewed('AMEND part: "some lines" with "per line"', 'base', 'The payer allowed $70.00 per line for some lines [3].', unscoped('$70.00')),
  reviewed('AMEND part: "one of the lines" with "per line"', 'base', 'The payer allowed $70.00 per line for one of the lines [3].', unscoped('$70.00')),
  reviewed('AMEND part: "2 lines" of 3 with "in total"', 'base', 'The payer allowed $210.00 in total for 2 lines [3].', unscoped('$210.00'), at('2')),
  reviewed('AMEND part: "the remaining lines" with "in total"', 'base', 'The payer allowed $210.00 in total for the remaining lines [3].', unscoped('$210.00')),
  reviewed('AMEND part: a payment date names no part', 'base', 'The payer allowed $70.00 per line on 2026-04-08 [3].'),
  reviewed('AMEND part: the pattern’s own counts name no part', 'base', 'The 3 lines on 3 claims for 3 patients were allowed $210.00 in total [3].'),
  reviewed('AMEND part: each unit’s rate keeps its scope beside a code', 'base', 'The contract pays $50.00 per unit for 97110 [3].'),
  reviewed('AMEND part: one line, whose value per line is its total, passes beside a code', 'oneLine', 'The payer allowed $70.00 per line for 97110 [3].'),
  reviewed('AMEND respectively: a scope right after each cue, cues after', 'base', '$300.00 and $70.00 were expected in total and allowed per line, respectively [3].'),
  reviewed('AMEND respectively: a scope right after each cue, cues before', 'base', 'The contract expected in total and the payer allowed in total $300.00 and $210.00, respectively [3].'),
  reviewed('AMEND respectively: the whole list’s scope right after the list', 'base', '$300.00 and $210.00 in total were expected and allowed, respectively [3].'),
  reviewed('AMEND respectively: the whole list’s scope right after "amounts"', 'base', '$100.00 and $70.00 were the expected and allowed amounts per line, respectively [3].'),
  reviewed('AMEND respectively: a code in the sentence', 'base', '$100.00 and $70.00 were the expected and allowed amounts per line for 97110, respectively [3].', unread('$100.00'), unread('$70.00')),
  reviewed('PE4-1 a fronted "While each line" clause', 'base', 'While each line was reprocessed the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "Whereas each line" clause', 'base', 'Whereas each line was reprocessed the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "With each line" clause', 'base', 'With each line reprocessed the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "Following each line’s" clause', 'base', 'Following each line’s reprocessing the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "Provided each line" clause', 'base', 'Provided each line was reprocessed the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "By the time each line" clause', 'base', 'By the time each line was reprocessed the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "During the reprocessing of each line" clause', 'base', 'During the reprocessing of each line the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a fronted "Upon each line’s" clause', 'base', 'Upon each line’s reprocessing the payer allowed $70.00 [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "by the time each line"', 'base', 'The payer allowed $70.00 by the time each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "provided each line"', 'base', 'The payer allowed $70.00 provided each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "in case each line"', 'base', 'The payer allowed $70.00 in case each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "with each line"', 'base', 'The payer allowed $70.00 with each line reprocessed [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "following each line’s"', 'base', 'The payer allowed $70.00 following each line’s reprocessing [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "during the reprocessing of each line"', 'base', 'The payer allowed $70.00 during the reprocessing of each line [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "upon each line’s"', 'base', 'The payer allowed $70.00 upon each line’s reprocessing [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "without each line"', 'base', 'The payer allowed $70.00 without each line being reprocessed [3].', unscoped('$70.00')),
  reviewed('PE4-1 a trailing "regardless of each line"', 'base', 'The payer allowed $70.00 regardless of each line [3].', unscoped('$70.00')),
  reviewed('PE4-1 control: a trailing "when each line"', 'base', 'The payer allowed $70.00 when each line was reprocessed [3].', unscoped('$70.00')),
  reviewed('CORR4-1 the total "for the lines of Patient 1 and Patient 2"', 'base', 'The payer allowed $210.00 for the lines of Patient 1 and Patient 2 [3].', unscoped('$210.00')),
  reviewed('CORR4-1 the total "for the claims of Patient 1 and Patient 2"', 'base', 'The payer allowed $210.00 for the claims of Patient 1 and Patient 2 [3].', unscoped('$210.00')),
  reviewed('CORR4-1 the total "for claims of Patient 1 and Patient 2"', 'base', 'The payer allowed $210.00 for claims of Patient 1 and Patient 2 [3].', unscoped('$210.00')),
  reviewed('CORR4-1 the total "across Patient 1’s and Patient 2’s lines"', 'base', 'The payer allowed $210.00 across Patient 1’s and Patient 2’s lines [3].', unscoped('$210.00')),
  reviewed('CORR4-1 the total "in total for Patient 1 and Patient 2"', 'base', 'The payer allowed $210.00 in total for Patient 1 and Patient 2 [3].', unscoped('$210.00')),
  reviewed('CORR4-1 the total "in total for the remaining lines"', 'base', 'The payer allowed $210.00 in total for the remaining lines [3].', unscoped('$210.00')),
  reviewed('CORR4-1 control: the total "for Patient 1 and Patient 2"', 'base', 'The payer allowed $210.00 for Patient 1 and Patient 2 [3].', unscoped('$210.00')),
  reviewed('CORR4-1 control: the total "for the remaining lines"', 'base', 'The payer allowed $210.00 for the remaining lines [3].', unscoped('$210.00')),
  reviewed('PE4-2 "the claim line schedule"', 'base', 'The payer allowed $70.00 on the claim line schedule [3].', unscoped('$70.00')),
  reviewed('PE4-2 "the claim line policy"', 'base', 'The payer allowed $70.00 under the claim line policy [3].', unscoped('$70.00')),
  reviewed('PE4-2 "the patient’s line of credit"', 'base', 'The payer allowed $70.00 on the patient’s line of credit [3].', unscoped('$70.00')),
  // The review of the amended rule (PE5-1, CORR5-1, CORR5-2): the triggers read from the other side. One line's noun
  // with any word before it but "each", "every" or "per", the lines in the plural after any word but the closed few
  // that name them all, a claim or a patient in any place, an exclusion, a quantifier, a month's or a weekday's name.
  ...(
    [
      ['PE5-1 "for the patient"', 'The shortfall for the patient is $90.00 in total [1].', '$90.00'],
      ['PE5-1 "for patient B"', 'The shortfall is $90.00 in total for patient B [1].', '$90.00'],
      ['PE5-1 "for one patient"', 'The shortfall for one patient is $90.00 in total [1].', '$90.00'],
      ['PE5-1 "for both patients"', 'The shortfall for both patients is $90.00 in total [1].', '$90.00'],
      ['PE5-1 "on both lines"', 'The payer allowed $210.00 in total on both lines [1].', '$210.00'],
      ['PE5-1 "for both visits"', 'The payer allowed $210.00 in total for both visits [1].', '$210.00'],
      ['PE5-1 "on a line"', 'The shortfall on a line is $90.00 in total [1].', '$90.00'],
      ['PE5-1 "on a single line"', 'The contract expected $300.00 in total on a single line [1].', '$300.00'],
      ['PE5-1 "excluding a line"', 'The payer allowed $210.00 in total, excluding a line the payer denied [1].', '$210.00'],
      ['PE5-1 "on all lines but one"', 'The contract expected $300.00 in total on all lines but one [1].', '$300.00'],
      ['PE5-1 "on line A"', 'The shortfall on line A is $90.00 in total [1].', '$90.00'],
      ['PE5-1 "on the earliest visit"', 'The shortfall on the earliest visit is $90.00 in total [1].', '$90.00'],
      ['PE5-1 "for the encounter"', 'The contract expected $300.00 in total for the encounter [1].', '$300.00'],
      ['PE5-1 "in early March"', 'The shortfall is $90.00 in total in early March [1].', '$90.00'],
      ['PE5-1 "on the GP lines"', 'The shortfall is $90.00 in total on the GP lines [1].', '$90.00'],
      ['PE5-1 "on most lines"', 'The shortfall is $90.00 in total on most lines [1].', '$90.00'],
      ['PE5-1 (variant) "on either line"', 'The payer allowed $210.00 in total on either line [1].', '$210.00'],
      ['PE5-1 (variant) "for the session"', 'The payer allowed $210.00 in total for the session [1].', '$210.00'],
      ['PE5-1 (variant) "for several lines"', 'The payer allowed $210.00 in total for several lines [1].', '$210.00'],
      ['CORR5-1 "A line"', 'A line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "A visit"', 'A visit was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "A claim"', 'A claim was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "Both lines"', 'Both lines were allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "Another line"', 'Another line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "A single line"', 'A single line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "The rest of the lines"', 'The rest of the lines were allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "Most lines"', 'Most lines were allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "Several lines"', 'Several lines were allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "The final line"', 'The final line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "Either line"', 'Either line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "Her claim"', 'Her claim was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "His visit"', 'His visit was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 a person’s possessive before a line', 'Jane Roe’s line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 "for a visit"', 'The payer allowed $210.00 in total for a visit [3].', '$210.00'],
      ['CORR5-1 "for row B"', 'The payer allowed $210.00 in total for row B [3].', '$210.00'],
      ['CORR5-1 (variant) "Neither line"', 'Neither line was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-1 (variant) "A claim was paid"', 'A claim was paid $168.00 in total [3].', '$168.00'],
      ['CORR5-2 "The patient owes"', 'The patient owes $42.00 in total [3].', '$42.00'],
      ['CORR5-2 "The patient paid"', 'The patient paid $42.00 in total [3].', '$42.00'],
      ['CORR5-2 "The patient was allowed"', 'The patient was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-2 "A patient was allowed"', 'A patient was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-2 "The claims of the patient"', 'The claims of the patient were allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-2 (variant) "A patient owes"', 'A patient owes $42.00 in total [3].', '$42.00'],
      // PE5-3: "per claim", "for each patient" and the like after a total, where the pattern has three of each.
      ['PE5-3 "in total per claim"', 'The contract expected $300.00 in total per claim [1].', '$300.00'],
      ['PE5-3 "in total for each claim"', 'The contract expected $300.00 in total for each claim [1].', '$300.00'],
      ['PE5-3 "in total for every claim"', 'The contract expected $300.00 in total for every claim [1].', '$300.00'],
      ['PE5-3 "in total a claim"', 'The contract expected $300.00 in total a claim [1].', '$300.00'],
      ['PE5-3 "in total per patient"', 'The contract expected $300.00 in total per patient [1].', '$300.00'],
      ['PE5-3 "in total for each patient"', 'The contract expected $300.00 in total for each patient [1].', '$300.00'],
      ['PE5-3 "in all for each patient"', 'The contract expected $300.00 in all for each patient [1].', '$300.00'],
      ['PE5-3 "in total, for each claim"', 'The contract expected $300.00 in total, for each claim [1].', '$300.00'],
      ['PE5-3 "in total; that is per claim"', 'The contract expected $300.00 in total; that is per claim [1].', '$300.00'],
      ['PE5-3 (variant) "in total per member"', 'The contract expected $300.00 in total per member [1].', '$300.00'],
      // CORR5-4, in part: a scope phrase of the closed list beside no figure that states another scope, and "each claim" or "each patient" before a total.
      ['CORR5-4 "On each line" before a total', 'On each line the payer allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-4 "that is per line" after a total', 'The contract expected $300.00 in total; that is per line [1].', '$300.00'],
      ['CORR5-4 "Each claim" before a total', 'Each claim was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-4 "Each patient" before a total', 'Each patient was allowed $210.00 in total [3].', '$210.00'],
      ['CORR5-4 "Every claim" before a total', 'Every claim was paid $168.00 in total [3].', '$168.00'],
    ] as const
  ).map(([id, narrative, figure]) => reviewed(id, 'base', narrative, unscoped(figure))),
  reviewed('CORR5-1 "The April visit"', 'april', 'The April visit was allowed $210.00 in total [3].', unscoped('$210.00')),
  reviewed('CORR5-1 (variant) "The April line"', 'april', 'The April line was allowed $210.00 in total [3].', unscoped('$210.00')),
  reviewed('CORR5-2 "the patient owes" per line, beside another figure', 'base', 'The payer paid $56.00 per line, and the patient owes $14.00 per line [3].', unscoped('$56.00'), unscoped('$14.00')),
  // A trigger only ever fails a figure: one stated per line is held per line as well as with no scope.
  reviewed('CORR5-2 a trigger fails the rate per unit stated per line', 'base', 'Although the patient owes, the contract requires $50.00 per line [1].', amount('$50.00')),
  // CORR5-3: a count of units in all in a sentence that names a part of the lines.
  ...(
    [
      ['CORR5-3 "Line 2" before units in total', 'Line 2 billed 6 units in total [3].'],
      ['CORR5-3 "Claim 1" before units in total', 'Claim 1 billed 6 units in total [3].'],
      ['CORR5-3 "The remaining lines" before units in total', 'The remaining lines billed 6 units in total [3].'],
      ['CORR5-3 a code before units in total', 'For 97110, the lines billed 6 units in total [3].'],
      ['CORR5-3 (variant) "The first line" before units in total', 'The first line billed 6 units in total [3].'],
      ['CORR5-3 (variant) "Each claim" before units in total', 'Each claim billed 6 units in total [3].'],
    ] as const
  ).map(([id, narrative]) => reviewed(id, 'base', narrative, unscoped('6', 'number'))),
  // PE5-2: per line is held only to a value every line holds.
  reviewed('PE5-2 line 2’s expected amount per line', 'differing', 'The contract expected $150.00 per line [1].', amount('$150.00')),
  reviewed('PE5-2 lines 1 and 3’s expected amount on each of the 3 lines', 'differing', 'The contract expected $100.00 on each of the 3 lines [1].', amount('$100.00')),
  reviewed('PE5-2 "each line’s" for lines 1 and 3’s', 'differing', 'The contract expected each line’s $100.00 [1].', amount('$100.00')),
  reviewed('PE5-2 line 2’s shortfall per line', 'differing', 'The shortfall is $45.00 per line [1].', amount('$45.00')),
  reviewed('PE5-2 line 2’s paid amount per line', 'differing', 'The payer paid $84.00 per line [1].', amount('$84.00')),
  reviewed('PE5-2 line 2’s units per line', 'differing', 'The lines billed 3 units per line [1].', at('3')),
  reviewed('PE5-2 a "respectively" list per cue, line 2’s', 'differing', 'The contract expected per line and the payer allowed per line $150.00 and $105.00, respectively [1].', amount('$150.00'), amount('$105.00')),
  reviewed('PE5-2 (variant) lines 1 and 3’s allowed amount for each line', 'differing', 'The payer allowed $70.00 for each line [3].', amount('$70.00')),
  reviewed('PE5-2 (variant) lines 1 and 3’s units per line', 'differing', 'The lines billed 2 units per line [3].', at('2')),
  reviewed('PE5-2 (variant) one line’s value with no scope', 'differing', 'The contract expected $150.00 [1].', unscoped('$150.00')),
  reviewed('PE5-2 (variant) the total with no scope', 'differing', 'The contract expected $350.00 [1].', unscoped('$350.00')),
  reviewed('PE5-2 control: the total in total', 'differing', 'The contract expected $350.00 in total [1].'),
  reviewed('PE5-2 control: the units in total', 'differing', 'The lines billed 7 units in total [1].'),
  // Controls: the lines named as all of them, a noun a line's word qualifies, a patient's share, each line's per line.
  ...(
    [
      ['PE5-1 control: the total', 'The payer allowed $210.00 in total [3].'],
      ['PE5-1 control: per line and in total beside their figures', 'The contract expected $100.00 per line and $300.00 in total [1].'],
      ['PE5-1 control: "across the 3 lines"', 'The payer allowed $210.00 in total across the 3 lines [3].'],
      ['PE5-1 control: "The 3 lines"', 'The 3 lines were allowed $210.00 in total [3].'],
      ['PE5-1 control: "for the service lines"', 'The payer allowed $210.00 in total for the service lines [3].'],
      ['PE5-1 control: "the dates of service"', 'The payer allowed $210.00 in total for the dates of service [3].'],
      ['PE5-1 control: "the lines" after a verb', 'The payer underpaid the lines by $90.00 in total [3].'],
      ['PE5-1 control: an opening phrase that agrees', 'Across the 3 lines, the payer allowed $210.00 in total [3].'],
      ['CORR5-2 control: "The patients owe"', 'The patients owe $42.00 in total [3].'],
      ['CORR5-2 control: "The patient share" per line', 'The patient share is $14.00 per line [3].'],
      ['CORR5-3 control: units in total', 'The lines billed 6 units in total [3].'],
      ['CORR5-3 control: units per line', 'The lines billed 2 units per line [3].'],
      ['CORR5-4 control: "each patient’s share" per line', 'Each patient’s share was $14.00 per line [3].'],
      ['CORR5-4 control: a hyphen’s "per-visit" before a total', 'The contract’s per-visit amount comes to $300.00 in total [1].'],
    ] as const
  ).map(([id, narrative]) => reviewed(id, 'base', narrative)),
  reviewed('PE5-3 control: "per claim" with one claim', 'oneClaim', 'The contract expected $300.00 in total per claim [1].'),
  reviewed('PE5-3 control: "for each patient" with one patient', 'oneClaim', 'The contract expected $300.00 in total for each patient [1].'),
  reviewed('CORR5-2 control: "the patient" with one patient', 'oneClaim', 'The patient owes $42.00 in total [3].'),
];

/**
 * What each amount role's values are stated per, read from the content's fields (a test's oracle, written apart from
 * ./facts.ts, as roleOracle() is): `row|<role>` any one line's values, `line|<role>` the values every line holds (a
 * "per line" figure says each line has it: PE5-2), `total|<role>` the pattern's, each code's and the lines' sums,
 * `unit|expected` the contract's rate. A narrative states an amount with its scope where its role's per-line and total
 * values differ (rule 2 of docs/adr/0086).
 */
export function scopedOracle(content: PacketContentV2): ReadonlyMap<string, ReadonlySet<string>> {
  const held = new Map<string, Set<string>>();
  const whole = (value: string | null | undefined): value is string => value !== null && value !== undefined && /^-?\d+$/.test(value);
  const put = (scope: 'row' | 'line' | 'total' | 'unit', role: string, value: string) => {
    const values = held.get(`${scope}|${role}`) ?? new Set<string>();
    values.add(value);
    held.set(`${scope}|${role}`, values);
  };
  // Each line's values are some line's; what every line holds is held per line too.
  const lines = new Map<string, Set<string>[]>();
  const add = (scope: 'line' | 'total' | 'unit', role: string, value: string | null | undefined, line = -1) => {
    if (scope !== 'line') {
      if (whole(value)) {
        put(scope, role, value);
      }
      return;
    }
    const rows = lines.get(role) ?? [];
    const row = rows[line] ?? new Set<string>();
    if (whole(value)) {
      row.add(value);
      put('row', role, value);
    }
    rows[line] = row;
    lines.set(role, rows);
  };
  const { pattern, citation } = content;
  add('total', 'expected', pattern.expected_cents);
  add('total', 'allowed', pattern.observed_cents);
  add('total', 'variance', pattern.variance_cents);
  for (const code of pattern.codes) {
    add('total', 'expected', code.expected_cents);
    add('total', 'allowed', code.observed_cents);
    add('total', 'variance', code.variance_cents);
    add('unit', 'expected', code.contract_amount_cents);
  }
  content.lines.forEach((item, index) => {
    add('line', 'expected', item.expected_cents, index);
    add('line', 'allowed', item.observed_cents, index);
    add('line', 'variance', item.variance_cents, index);
    add('line', 'paid', item.paid_cents, index);
    add('line', 'patient_share', item.calculation.patient_share_cents, index);
    for (const amount of [...item.calculation.steps.map((step) => step.amount_cents), item.calculation.rounding?.unrounded_cents, item.calculation.rounding?.rounded_cents]) {
      add('line', 'calculation', amount, index);
    }
  });
  const total = (amounts: readonly (string | null)[]) => (amounts.every((item) => item !== null) ? amounts.reduce((sum, item) => sum + BigInt(item ?? '0'), 0n).toString() : null);
  add('total', 'paid', total(content.lines.map((item) => item.paid_cents)));
  add('total', 'patient_share', total(content.lines.map((item) => item.calculation.patient_share_cents)));
  if (citation.kind === 'contract') {
    const { amount_cents: amount } = citation.parameters as { amount_cents?: unknown };
    add('unit', 'expected', typeof amount === 'string' ? amount : null);
  }
  // Interest where code computed it above zero, as roleOracle() holds it.
  (content.interest?.lines ?? []).forEach((item, index) => {
    add('line', 'interest', item.interest_cents !== null && BigInt(item.interest_cents) > 0n ? item.interest_cents : null, index);
  });
  const interestTotal = content.interest?.total_cents ?? null;
  add('total', 'interest', interestTotal !== null && BigInt(interestTotal) > 0n ? interestTotal : null);
  for (const [role, rows] of lines) {
    const [first, ...rest] = rows;
    for (const value of first ?? []) {
      if (rest.every((row) => row.has(value))) {
        put('line', role, value);
      }
    }
  }
  return held;
}

/**
 * The values each role's inputs hold, read from the content's fields by role (a test's oracle, written apart from
 * ./facts.ts so a property does not test the facts against themselves): counts and numbers as plain decimals,
 * amounts as cents, dates ISO, years YYYY, percentages plain decimals. `units` are the units in all (the pattern's
 * and each code's), `line_units` each line's where every line bills the same (PE5-2); amounts are held whatever they are stated per. Every date role is here:
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
  // Each line's units: what every line bills (a "per line" count says each line has it; PE5-2).
  const first = content.lines[0];
  if (first !== undefined && content.lines.every((item) => decimal(item.units).equals(decimal(first.units)))) {
    add('line_units', first.units);
  }
  for (const item of content.lines) {
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
