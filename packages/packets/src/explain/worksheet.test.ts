import { type LineFacts, type PricingTrace, indexRelease, parseTrace, price } from '@tp/pricing';
import { contractAgreement, fixedTerms, lineFacts, perVisitTerms, percentTerms, practiceSettings, pricingInput, readRuleRelease, syntheticRelease } from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { CODE_SHAPES, PAYER_COPY_INTERNAL_TERMS, derivedFeeScheduleValues, figureSourceProblems, figureTokenProblems, numberTokens, worksheetSentences } from '../test-support';
import { plainText } from './figures';
import type { Audience, ExplainCitation } from './line';
import { PAYER_CODES } from './words';
import { type Worksheet, type WorksheetLine, feeScheduleWorksheets } from './worksheet';

/**
 * The fee-schedule worksheet (design 4.3, worksheet.test.ts; CAS-33): one per distinct set of records, in a stable
 * order, with the year, locality, setting, RVUs, GPCIs, conversion factor and the calculation's expression; never an
 * amount at 100% for a contract that is not at 100%. Every worksheet the tests build passes the figure checks of
 * design 4.1, each figure read in the trace of the row it names.
 */

const CONTRACT: ExplainCitation = { kind: 'contract', page: 2 };
const REGULATION: ExplainCitation = { kind: 'regulation', reference: '42 CFR 422.214' };

function priced(facts: Partial<LineFacts>, settings = practiceSettings(), release = syntheticRelease()): PricingTrace {
  const [line] = price(pricingInput(release, [lineFacts(facts)], { settings }));
  return parseTrace(JSON.parse(JSON.stringify(line?.trace)));
}

const at110 = contractAgreement({ terms: percentTerms({ percentage: '110' }) });
const row = (n: number, trace: PricingTrace, citation: ExplainCitation = trace.agreement?.outcome === 'MA_NONCONTRACTED' ? REGULATION : CONTRACT): WorksheetLine => ({ row: n, trace, citation });

/** The worksheets, after the figure checks and, for the payer, the payer copy's own scan. */
function sheets(lines: readonly WorksheetLine[], audience: Audience = 'payer', of?: 'rows' | 'line'): Worksheet[] {
  const built = feeScheduleWorksheets(lines, audience, of === undefined ? {} : { of });
  const byRow = new Map(lines.map((line) => [line.row, line]));
  for (const sheet of built) {
    const sentences = worksheetSentences(sheet);
    expect(figureSourceProblems(sentences, (n) => ({ trace: byRow.get(n as number)?.trace, citation: byRow.get(n as number)?.citation }), audience === 'payer')).toEqual([]);
    expect(figureTokenProblems(sentences, lines.flatMap((line) => [line.trace, line.citation]))).toEqual([]);
    for (const sentence of sentences) {
      const text = plainText(sentence);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      if (audience === 'payer') {
        for (const term of [...PAYER_COPY_INTERNAL_TERMS, ...CODE_SHAPES]) expect(term.test(text), `${term.source} in ${text}`).toBe(false);
        for (const segment of sentence.segments) if ('code' in segment) expect(PAYER_CODES as readonly string[]).toContain(segment.code);
      }
    }
  }
  return built;
}

const whole = (sheet: Worksheet) => [
  plainText(sheet.title),
  ...sheet.rows.map(plainText),
  [sheet.headings.part, sheet.headings.rvu, sheet.headings.gpci, sheet.headings.unit].map(plainText).join(' | '),
  ...sheet.parts.map((part) => [plainText(part.name), plainText({ segments: [part.rvu] }), plainText({ segments: [part.gpci] }), plainText({ segments: [part.unit] })].join(' | ')),
  `${plainText(sheet.total.name)} | | | ${plainText({ segments: [sheet.total.unit] })}`,
  ...sheet.formula.map(plainText),
  plainText(sheet.reductions),
  plainText(sheet.check),
];

describe('the worksheet’s words', () => {
  it('lays out a contract at 110% of Medicare, for the payer', () => {
    const [sheet] = sheets([row(1, priced({ units: '2', agreement: at110 }))]);
    expect(whole(sheet as Worksheet)).toEqual([
      'Fee schedule worksheet 1: code 97110, 2026, carrier 99999 locality 01, non-facility',
      'Year: the 2026 records in force on the service date.',
      'Locality: practice ZIP 00011 is Medicare carrier 99999, locality 01.',
      'Setting: non-facility, the practice’s setting for place of service 11.',
      'Conversion factor: $20.0000 per RVU (relative value unit), for clinicians who are not qualifying alternative payment model (APM) participants.',
      'Percentage: 110% of the fee schedule, under the contract’s clause on page 2.',
      'Part | RVU | GPCI (geographic practice cost index) | Per unit at 110%',
      'Work | 0.31 | 1.000 | $6.82',
      'Practice expense (non-facility) | 0.71 | 0.950 | $14.839',
      'Malpractice | 0.11 | 0.650 | $1.573',
      'Per unit | | | $23.232',
      'The calculation: (work RVU × work GPCI + practice-expense RVU × practice-expense GPCI + malpractice RVU × malpractice GPCI) × conversion factor × percentage = amount per unit.',
      'Each part above is its RVU × its GPCI × $20.0000 per RVU × 110%, kept to the fraction of a cent until the one rounding.',
      'Reductions, in order, then the one rounding: as the words of row 1 say.',
      'To check these values, open the Physician Fee Schedule Look-Up Tool of the Centers for Medicare & Medicaid Services (CMS) for 2026, choose carrier 99999 locality 01 and code 97110: its relative values, geographic indices and conversion factor should read as above. CMS shows the full fee-schedule amount, before this contract’s 110% and before any reduction.',
    ]);
  });

  it('words the expression as the engine’s for the practice, and the reductions of the line on its own page', () => {
    const [sheet] = sheets([row(3, priced({ agreement: at110 }))], 'internal', 'line');
    expect(plainText(sheet?.formula[0] as never)).toMatch(/^The engine’s expression: \(work RVU/);
    expect(plainText(sheet?.reductions as never)).toBe('Reductions, in order, then the one rounding: as this line’s words say.');
  });

  it('words a Medicare Advantage line under the regulation, at Original Medicare’s own amount', () => {
    const [sheet] = sheets([row(1, priced({}))]);
    const lines = whole(sheet as Worksheet);
    expect(lines[5]).toBe('Percentage: 100% under 42 CFR 422.214.');
    expect(lines.at(-1)).toBe(
      'To check these values, open the Physician Fee Schedule Look-Up Tool of the Centers for Medicare & Medicaid Services (CMS) for 2026, choose carrier 99999 locality 01 and code 97110: its relative values, geographic indices and conversion factor should read as above. CMS shows the full fee-schedule amount before any reduction; at 100% under 42 CFR 422.214, the amount per unit above is Original Medicare’s own.',
    );
    expect(lines.join(' ')).not.toMatch(/this contract/);
  });

  it('words a ZIP that needs its ZIP+4 by the range that holds it, and the range’s carrier and locality in the title', () => {
    const release = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900006'));
    const [sheet] = sheets([row(1, priced({ agreement: at110 }, practiceSettings({ zip: '00012', zipPlusFour: '5001' }), release))]);
    const lines = whole(sheet as Worksheet);
    expect(lines[0]).toBe('Fee schedule worksheet 1: code 97110, 2026, carrier 99999 locality 02, non-facility');
    expect(lines[2]).toBe('Locality: practice ZIP 00012 needs its ZIP+4: 5001 falls in 5000 to 8999, carrier 99999, locality 02.');
    expect(sheet?.rows[1]?.segments).toContainEqual({ code: 'ZIP+4' });
  });

  it('words a year locked by the contract, for the payer', () => {
    const locked = contractAgreement({ terms: percentTerms({ percentage: '110', yearBasis: 'LOCKED:2025' }) });
    const [sheet] = sheets([row(1, priced({ agreement: locked }, practiceSettings(), syntheticRelease(900002)))]);
    expect(plainText(sheet?.rows[0] as never)).toBe('Year: the latest records in force during 2025, the year the contract locks.');
  });

  it('prints each line’s place of service once, each read in its own row’s trace', () => {
    const settings = practiceSettings({ placeOfServiceSettings: { '11': 'non_facility', '12': 'non_facility', '22': 'facility' } });
    const lines = [row(1, priced({ agreement: at110 }, settings)), row(2, priced({ placeOfService: '12', agreement: at110 }, settings)), row(3, priced({ agreement: at110 }, settings))];
    const [sheet] = sheets(lines);
    expect(plainText(sheet?.rows[2] as never)).toBe('Setting: non-facility, the practice’s setting for place of service 11 and 12.');
    const places = sheet?.rows[2]?.segments.flatMap((segment) => ('figure' in segment ? [segment.source.row] : []));
    expect(places).toEqual([1, 2]);
    expect(plainText(sheet?.reductions as never)).toBe('Reductions, in order, then the one rounding: as the words of row 1, row 2 and row 3 say.');
  });
});

describe('the grouping', () => {
  it('gives two lines of one code, setting, locality and release one worksheet, with both rows', () => {
    const built = sheets([row(1, priced({ agreement: at110 })), row(2, priced({ serviceDate: '2026-04-02', agreement: at110 }))]);
    expect(built).toHaveLength(1);
    expect(built[0]?.lines).toEqual([1, 2]);
  });

  it('gives another setting, code, percentage or citation a worksheet of its own, numbered in the order its first line comes', () => {
    const lines = [
      row(4, priced({ procedureCode: '97140', agreement: contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97140'] }) }) })),
      row(1, priced({ agreement: at110 })),
      row(2, priced({ placeOfService: '22', agreement: at110 })),
      row(3, priced({ agreement: contractAgreement({ terms: percentTerms({ percentage: '90' }) }) })),
      row(5, priced({ agreement: at110 }), { kind: 'contract', page: 7 }),
      row(6, priced({ agreement: at110 })),
    ];
    const built = sheets(lines);
    expect(built.map((sheet) => [sheet.number, sheet.lines])).toEqual([
      [1, [4]],
      [2, [1, 6]],
      [3, [2]],
      [4, [3]],
      [5, [5]],
    ]);
    expect(built.map((sheet) => plainText(sheet.title))).toEqual([
      'Fee schedule worksheet 1: code 97140, 2026, carrier 99999 locality 01, non-facility',
      'Fee schedule worksheet 2: code 97110, 2026, carrier 99999 locality 01, non-facility',
      'Fee schedule worksheet 3: code 97110, 2026, carrier 99999 locality 01, facility',
      'Fee schedule worksheet 4: code 97110, 2026, carrier 99999 locality 01, non-facility',
      'Fee schedule worksheet 5: code 97110, 2026, carrier 99999 locality 01, non-facility',
    ]);
    expect(built[2]?.parts[1]).toMatchObject({ rvu: { figure: '0.21', source: { path: ['steps', 'fee_schedule', 'rvu', 'pe_rvu_facility'] } } });
    expect(JSON.stringify(feeScheduleWorksheets(lines, 'payer'))).toBe(JSON.stringify(feeScheduleWorksheets(lines, 'payer')));
  });

  it('gives none to a fixed schedule, a visit or a line that stopped in the fee schedule', () => {
    expect(sheets([row(1, priced({ agreement: contractAgreement({ terms: fixedTerms(5000n) }) })), row(2, priced({ agreement: contractAgreement({ terms: perVisitTerms(8000n) }) }))])).toEqual([]);
    expect(sheets([row(1, priced({ procedureCode: '97750', agreement: contractAgreement({ terms: percentTerms({ codes: ['97750'] }) }) }))], 'internal')).toEqual([]);
  });
});

describe('never an amount at 100% for a contract that is not at 100% (C7)', () => {
  it.each(['110', '90', '125.5'])('prints, at a percentage of %s, none of the values the trace does not hold but a reader might expect: the full amount, the geographically adjusted RVUs, the total RVU', (percentage) => {
    // derivedFeeScheduleValues() computes them in the test from the trace's own fields.
    const line = priced({ units: '2', agreement: contractAgreement({ terms: percentTerms({ percentage }) }) });
    const [sheet] = sheets([row(1, line)]);
    const derived = derivedFeeScheduleValues(line);
    expect(derived.length).toBeGreaterThan(4);
    const stated = new Set(worksheetSentences(sheet as Worksheet).flatMap((sentence) => numberTokens(plainText(sentence))));
    for (const value of derived) expect(stated.has(value), `${value} is stated`).toBe(false);
  });
});
