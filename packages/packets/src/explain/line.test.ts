import { cents } from '@tp/money';
import { type IndexedRelease, type LineFacts, type PricingInput, type PricingTrace, indexRelease, parseTrace, price } from '@tp/pricing';
import {
  contractAgreement,
  fixedTerms,
  lesserOfTerms,
  lineFacts,
  mappingRecord,
  perVisitTerms,
  percentTerms,
  practiceSettings,
  pricingInput,
  readRuleRelease,
  syntheticRelease,
  versionRecord,
} from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { CODE_SHAPES, PAYER_COPY_INTERNAL_TERMS, figureSourceProblems, figureTokenProblems, lineSentences } from '../test-support';
import { ExplainShapeError, type Sentence, plainText, say } from './figures';
import { type Audience, type ExplainCitation, type ExplainLineOptions, type LineWords, type StepKind, explainLine, worksheetKeyOf } from './line';
import { PAYER_CODES } from './words';

/**
 * One line's calculation in words (design 4.3, line.test.ts; CAS-30): one `describe` per step kind, each over traces
 * the engine priced from SYNTHETIC releases (never written by hand, but for the shapes the engine cannot write: a
 * malformed year basis), and the audiences' table of design section 3.3. Every line the tests word passes the three
 * figure checks of design 4.1 (wordsOf() below): each figure is its slot's value in its form, no number in the words
 * is outside the trace and the citation, and no text holds a digit.
 */

const R900001 = syntheticRelease(900001);
const CONTRACT: ExplainCitation = { kind: 'contract', page: 2 };
const REGULATION: ExplainCitation = { kind: 'regulation', reference: '42 CFR 422.214' };
const DATE = /\d{4}-\d{2}-\d{2}/;

type Options = Partial<Omit<PricingInput, 'release' | 'claim'>> & { readonly claim?: Partial<PricingInput['claim']>; readonly release?: IndexedRelease };

/** The traces of a claim's lines, as stored and read back (JSON, then parseTrace). */
function traces(lines: readonly LineFacts[], options: Options = {}): PricingTrace[] {
  const { release, ...rest } = options;
  return price(pricingInput(release ?? R900001, lines, rest)).map((line) => parseTrace(JSON.parse(JSON.stringify(line.trace))));
}

function trace(facts: Partial<LineFacts> = {}, options: Options = {}): PricingTrace {
  const [one] = traces([lineFacts(facts)], options);
  return one as PricingTrace;
}

const contract = (terms = fixedTerms(5000n), extra: Parameters<typeof contractAgreement>[0] = {}) => contractAgreement({ terms, ...extra });
const citationOf = (line: PricingTrace): ExplainCitation => (line.agreement?.outcome === 'MA_NONCONTRACTED' ? REGULATION : line.agreement?.outcome === 'CONTRACT_RATE' ? CONTRACT : null);

/** The line's words for an audience, after the figure checks and, for the payer and the viewer, the audience's own. */
function wordsOf(line: PricingTrace, audience: Audience = 'internal', options: ExplainLineOptions = {}, citation: ExplainCitation = citationOf(line)): LineWords {
  const words = explainLine(line, citation, audience, options);
  const sentences = lineSentences(words);
  expect(figureSourceProblems(sentences, () => ({ trace: line, citation }), audience === 'payer')).toEqual([]);
  expect(figureTokenProblems(sentences, [line, citation])).toEqual([]);
  if (audience !== 'internal') {
    for (const sentence of sentences) expect(plainText(sentence), 'no date for the viewer or the payer').not.toMatch(DATE);
  }
  if (audience === 'payer') {
    for (const sentence of sentences) {
      const text = plainText(sentence);
      for (const term of [...PAYER_COPY_INTERNAL_TERMS, ...CODE_SHAPES]) expect(term.test(text), `${term.source} in ${text}`).toBe(false);
      for (const segment of sentence.segments) if ('code' in segment) expect(PAYER_CODES as readonly string[]).toContain(segment.code);
    }
  }
  return words;
}

const text = (sentences: readonly Sentence[]) => sentences.map(plainText).join(' ');
const summaryOf = (line: PricingTrace, audience: Audience = 'internal', options: ExplainLineOptions = {}) => plainText(wordsOf(line, audience, options).summary);
/** A step's words, or undefined when the audience's words leave it out. */
function step(line: PricingTrace, kind: StepKind, audience: Audience = 'internal', options: ExplainLineOptions = {}, citation?: ExplainCitation): string | undefined {
  const found = wordsOf(line, audience, options, citation === undefined ? citationOf(line) : citation).steps.find((item) => item.step === kind);
  return found === undefined ? undefined : text(found.sentences);
}
/** The slots of a step's figures, in order. */
function slots(line: PricingTrace, kind: StepKind | 'summary', audience: Audience = 'internal'): string[] {
  const words = wordsOf(line, audience);
  const sentences = kind === 'summary' ? [words.summary] : (words.steps.find((item) => item.step === kind)?.sentences ?? []);
  return sentences.flatMap((sentence) => sentence.segments.flatMap((segment) => ('figure' in segment ? [segment.source.slot] : [])));
}

const AUDIT_LINE = { units: '2', observedAllowedCents: cents(7000n), agreement: contract() } as const;

describe('the summary', () => {
  it('reads the audit’s own example for a fixed schedule', () => {
    expect(summaryOf(trace(AUDIT_LINE))).toBe('2 units × $50.00 = $100.00 under the contract’s clause on page 2; rounded once to $100.00; observed allowed $70.00; short $30.00.');
    expect(slots(trace(AUDIT_LINE), 'summary')).toEqual(['summary.units', 'summary.unit', 'summary.schedule', 'summary.page', 'summary.rounded', 'summary.observed', 'summary.variance']);
  });

  it('is the same sentence for every audience', () => {
    const line = trace(AUDIT_LINE);
    expect(summaryOf(line, 'viewer')).toBe(summaryOf(line));
    expect(summaryOf(line, 'payer')).toBe(summaryOf(line));
  });

  it('says one unit, and leaves the page out when the rate record is not signed off', () => {
    const line = trace({ ...AUDIT_LINE, units: '1' });
    expect(plainText(explainLine(line, null, 'internal').summary)).toBe('1 unit × $50.00 = $50.00; rounded once to $50.00; observed allowed $70.00; variance -$20.00 (overpaid: recorded, never pursued).');
  });

  it('names each adjustment the trace holds, with the amount after it, and the regulation of a Medicare Advantage line', () => {
    const line = trace({ units: '2', modifiers: ['GP', 'CQ'] });
    expect(summaryOf(line)).toBe(
      '2 units × $21.12 = $42.24 under 42 CFR 422.214; after the multiple procedure payment reduction $36.844; after the assistant reduction $28.36988; after sequestration $27.5187836; rounded once to $27.52; observed allowed $20.00; short $7.52.',
    );
    expect(slots(line, 'summary')).toEqual(['summary.units', 'summary.unit', 'summary.schedule', 'summary.reference', 'summary.after', 'summary.after', 'summary.after', 'summary.rounded', 'summary.observed', 'summary.variance']);
  });

  it('leaves out an adjustment that left the amount unchanged, which its own step words', () => {
    const line = trace({ units: '2', modifiers: ['GP'] });
    const assistant = line.steps.adjustments.find((adjustment) => adjustment.name === 'assistant_reduction');
    expect(assistant?.before_cents).toBe(assistant?.after_cents);
    for (const audience of ['internal', 'payer'] as const) {
      expect(summaryOf(line, audience)).not.toContain('assistant reduction');
      expect(step(line, 'assistant_reduction', audience)).toContain('is unchanged.');
    }
    expect(slots(line, 'summary').filter((slot) => slot === 'summary.after')).toHaveLength(2);
  });

  it('reads no variance at zero', () => {
    expect(summaryOf(trace({ ...AUDIT_LINE, observedAllowedCents: cents(10000n) }))).toBe('2 units × $50.00 = $100.00 under the contract’s clause on page 2; rounded once to $100.00; observed allowed $100.00; no variance.');
  });

  it('reads the lesser of the schedule and the charge', () => {
    const line = trace({ units: '2', chargeCents: cents(9000n), agreement: contract(lesserOfTerms({ fixedCents: 5000n })) });
    expect(summaryOf(line)).toBe('Lesser of the schedule $100.00 and the line charge $90.00: $90.00 under the contract’s clause on page 2; rounded once to $90.00; observed allowed $20.00; short $70.00.');
    expect(slots(line, 'summary').slice(0, 4)).toEqual(['summary.schedule', 'summary.charge', 'summary.base', 'summary.page']);
  });

  it('reads a visit’s amount on the line that carries it, and points the visit’s other line to it', () => {
    const [carrier, other] = traces([lineFacts({ agreement: contract(perVisitTerms(8000n)) }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: contract(perVisitTerms(8000n)) })]);
    expect(summaryOf(carrier as PricingTrace)).toBe('$80.00 once for the visit under the contract’s clause on page 2; rounded once to $80.00; observed allowed $20.00; short $60.00.');
    expect(summaryOf(other as PricingTrace)).toBe('The visit’s amount is carried by claim line 1; this line’s base is $0.00 under the contract’s clause on page 2; rounded once to $0.00; observed allowed $20.00; variance -$20.00 (overpaid: recorded, never pursued).');
    expect(summaryOf(other as PricingTrace, 'payer', { rowsOfClaim: new Map([[1, 3]]) })).toContain('carried by claim line 1 (row 3);');
  });
});

describe('step 1, the agreement', () => {
  it('names the contract’s signed-off rate record and its page, and leaves the page out without one', () => {
    const line = trace(AUDIT_LINE);
    expect(step(line, 'agreement')).toBe('The plan’s mapping names a contract; its signed-off version prices this code by one rate record, cited on page 2.');
    expect(step(line, 'agreement', 'internal', {}, null)).toBe('The plan’s mapping names a contract; its signed-off version prices this code by one rate record.');
    expect(step(line, 'agreement', 'payer')).toBeUndefined();
  });

  it('words a Medicare Advantage line under the regulation, never under a contract', () => {
    expect(step(trace(), 'agreement')).toBe('The plan is mapped as Medicare Advantage with no contract: priced at Original Medicare’s amount under 42 CFR 422.214.');
  });

  it('counts the rate records an ambiguous rate matches (finding m6)', () => {
    const line = trace({ agreement: { outcome: 'AMBIGUOUS_RATE', mapping: mappingRecord({ kind: 'contract' }), version: versionRecord(), rateRecordIds: ['rr-a', 'rr-b', 'rr-c'] } });
    expect(step(line, 'agreement')).toBe('More than one rate record matches. 3 rate records match.');
    expect(slots(line, 'agreement')).toEqual(['agreement.matching']);
  });

  it('refuses a citation that is not the line’s', () => {
    expect(() => explainLine(trace(), CONTRACT, 'internal')).toThrow(ExplainShapeError);
    expect(() => explainLine(trace(AUDIT_LINE), REGULATION, 'internal')).toThrow('a Medicare Advantage non-contracted line, and only one, cites the regulation');
  });
});

describe('step 2, the terms', () => {
  it('words a fixed schedule, its flags off and its timed-units rule', () => {
    expect(step(trace(AUDIT_LINE), 'terms')).toBe(
      'Fixed schedule: $50.00 per unit. Not applied (flag off): the multiple procedure payment reduction, the assistant reduction, sequestration and National Correct Coding Initiative (NCCI) edits. Units as billed; timed units are counted per code.',
    );
    expect(step(trace(AUDIT_LINE), 'terms', 'payer')).toBe('Fixed schedule: $50.00 per unit.');
  });

  it('tells the payer which Medicare reductions the contract applies, and never names a flag or NCCI (finding: payer copy and flags)', () => {
    const flags = { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: false, apply_ncci: true };
    const line = trace({ procedureCode: '97110', modifiers: ['GP', 'CQ'], agreement: contract(percentTerms({ percentage: '110', flags })) });
    expect(wordsOf(line, 'payer').steps.find((item) => item.step === 'terms')?.sentences.map(plainText)).toEqual([
      'Percent of Medicare: 110% of the Medicare physician fee schedule, the records in force on the service date, the practice’s locality, with the conversion factor for clinicians who are not qualifying alternative payment model (APM) participants.',
      'The contract applies these Medicare reductions: the multiple procedure payment reduction and the assistant reduction.',
    ]);
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { flags: { apply_sequestration: true } })) }), 'terms', 'payer')).toBe(
      'Fixed schedule: $50.00 per unit. The contract applies these Medicare reductions: sequestration.',
    );
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { flags: { apply_ncci: true } })) }), 'terms', 'payer')).toBe('Fixed schedule: $50.00 per unit.');
    expect(wordsOf(trace(), 'payer').steps.find((item) => item.step === 'terms')?.sentences).toHaveLength(1);
  });

  it('words a percent of Medicare on the records in force on the service date (CURRENT)', () => {
    const line = trace({ agreement: contract(percentTerms({ percentage: '110', flags: { apply_sequestration: true, timed_units_rule: 'MEDICARE_POOLED' } })) });
    expect(step(line, 'terms')).toBe(
      'Percent of Medicare: 110% of the Medicare physician fee schedule, the records in force on the service date, the practice’s locality, with the conversion factor for clinicians who are not qualifying alternative payment model (APM) participants. Applied, as the rate record’s flags are on: sequestration. Not applied (flag off): the multiple procedure payment reduction, the assistant reduction and National Correct Coding Initiative (NCCI) edits. Units as billed; the contract follows Medicare’s pooled timed-units rule.',
    );
  });

  it('words a year locked by the rate record from the lookup the engine did (LOCKED; finding M4)', () => {
    const line = trace({ agreement: contract(percentTerms({ percentage: '110', yearBasis: 'LOCKED:2025', conversionFactor: 'qualifying_apm' })) }, { release: syntheticRelease(900002) });
    expect(step(line, 'terms', 'payer')).toBe(
      'Percent of Medicare: 110% of the Medicare physician fee schedule, locked to 2025, the latest records in force during that year, the practice’s locality, with the conversion factor for qualifying alternative payment model (APM) participants.',
    );
    expect(step(line, 'fee_schedule')).toBe(
      'Fee schedule: the latest records in force during 2025, the year the rate record locks. Code 97110 at the non-facility rate: place of service 11 is non-facility in the practice’s settings. Locality: practice ZIP 00011 is Medicare carrier 99999, locality 01.',
    );
    expect(step(line, 'fee_schedule', 'payer')).toContain('the year the contract locks.');
  });

  it('refuses a year basis the lookup disagrees with: a malformed LOCKED priced on the service date (finding M4)', () => {
    const line = trace({ agreement: contract(percentTerms({ percentage: '110' })) });
    const schedule = line.steps.fee_schedule as NonNullable<PricingTrace['steps']['fee_schedule']>;
    const malformed = { ...line, terms: { ...line.terms!, percent_of_medicare: { ...line.terms!.percent_of_medicare!, year_basis: 'LOCKED:20x4' } }, steps: { ...line.steps, fee_schedule: { ...schedule, year_basis: 'LOCKED:20x4' } } };
    expect(() => explainLine(malformed, CONTRACT, 'internal')).toThrow('the year basis disagrees with the fee schedule’s lookup');
    const lockedOnTheDate = { ...line, terms: { ...line.terms!, percent_of_medicare: { ...line.terms!.percent_of_medicare!, year_basis: 'LOCKED:2026' } }, steps: { ...line.steps, fee_schedule: { ...schedule, year_basis: 'LOCKED:2026' } } };
    expect(() => explainLine(lockedOnTheDate, CONTRACT, 'payer')).toThrow(ExplainShapeError);
    const labelDiffers = { ...line, terms: { ...line.terms!, percent_of_medicare: { ...line.terms!.percent_of_medicare!, year_basis: 'LOCKED:2026' } } };
    expect(() => explainLine(labelDiffers, CONTRACT, 'internal')).toThrow(ExplainShapeError);
    const latestUnderCurrent = { ...line, steps: { ...line.steps, fee_schedule: { ...schedule, lookup: 'latest_in_basis_year' as const } } };
    expect(() => explainLine(latestUnderCurrent, CONTRACT, 'internal')).toThrow(ExplainShapeError);
  });

  it('words the lesser of the charge and a fixed or a percent schedule', () => {
    expect(step(trace({ agreement: contract(lesserOfTerms({ fixedCents: 5000n })) }), 'terms', 'payer')).toBe('Lesser of the line charge and a fixed schedule of $50.00 per unit.');
    expect(step(trace({ agreement: contract(lesserOfTerms({ percentage: '90' })) }), 'terms', 'payer')).toBe(
      'Lesser of the line charge and 90% of the Medicare physician fee schedule, the records in force on the service date, the practice’s locality, with the conversion factor for clinicians who are not qualifying alternative payment model (APM) participants.',
    );
  });

  it('words a per-visit amount', () => {
    expect(step(trace({ agreement: contract(perVisitTerms(8000n)) }), 'terms', 'payer')).toBe('Per visit: $80.00 per visit.');
  });

  it('words a contract’s own adjustment for the practice', () => {
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { adjustment: { kind: 'PERCENT', percent: '95' } })) }), 'terms')).toContain('The rate record pays 95% of the amount after the Medicare reductions.');
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { adjustment: { kind: 'CAP', capCents: 4000n } })) }), 'terms')).toContain('The rate record caps the line at $40.00.');
  });

  it('words a Medicare Advantage line’s rules as Medicare’s, never a contract’s or a rate record’s (finding M2)', () => {
    const line = trace();
    const words = step(line, 'terms') as string;
    expect(words).toBe(
      'Medicare Advantage, non-contracted: 100% of the Medicare physician fee schedule, the records in force on the service date, the practice’s locality, with Medicare’s reductions, under 42 CFR 422.214. Medicare’s reductions apply to a non-contracted Medicare Advantage line under 42 CFR 422.214: the multiple procedure payment reduction, the assistant reduction, sequestration and National Correct Coding Initiative (NCCI) edits. Units as billed; Medicare’s pooled timed-units rule applies.',
    );
    for (const audience of ['internal', 'viewer'] as const) {
      const sentences = wordsOf(line, audience).steps.find((item) => item.step === 'terms')?.sentences ?? [];
      for (const sentence of sentences.slice(1)) expect(plainText(sentence)).not.toMatch(/\bcontract\b|rate record/);
      expect(step(line, 'rounding', audience)).not.toMatch(/\bcontract\b|rate record/);
    }
  });

  it('words a contract’s named locality, which the engine does not price yet, as the rate record names it (finding m2)', () => {
    const terms = percentTerms({ percentage: '110' });
    const named = { ...terms, parameters: { ...terms.parameters, locality_basis: { kind: 'NAMED' as const, carrier: '99999', locality: '02' } } } as typeof terms;
    const line = trace({ agreement: contract(named) });
    expect(step(line, 'terms')?.split('. ')[0]).toBe(
      'Percent of Medicare: 110% of the Medicare physician fee schedule, carrier 99999 locality 02, as the rate record names it, with the conversion factor for clinicians who are not qualifying alternative payment model (APM) participants',
    );
    expect(step(line, 'outcome')).toBe('Not priced: Unexpected input. The rate record names its own locality, which the engine does not price yet. The line stopped at the method. Remedy: Operator alert.');
  });
});

describe('step 2, the fee schedule', () => {
  const line = trace({ agreement: contract(percentTerms({ percentage: '110' })) });

  it('names the date for the practice and the service date for the others', () => {
    expect(step(line, 'fee_schedule')).toBe(
      'Fee schedule: the 2026 records in force on 2026-03-10. Code 97110 at the non-facility rate: place of service 11 is non-facility in the practice’s settings. Locality: practice ZIP 00011 is Medicare carrier 99999, locality 01.',
    );
    expect(step(line, 'fee_schedule', 'viewer')).toBe(
      'Fee schedule: the 2026 records in force on the service date. Code 97110 at the non-facility rate: place of service 11 is non-facility in the practice’s settings. Locality: practice ZIP 00011 is Medicare carrier 99999, locality 01.',
    );
  });

  it('points the payer to the line’s worksheet in a packet, as a label', () => {
    expect(step(line, 'fee_schedule', 'payer', { worksheet: 2 })).toBe('See fee schedule worksheet 2.');
    const segments = wordsOf(line, 'payer', { worksheet: 2 }).steps.find((item) => item.step === 'fee_schedule')?.sentences[0]?.segments;
    expect(segments).toContainEqual({ label: '2', of: 'worksheet' });
  });

  it('words a facility setting and a ZIP that needs its ZIP+4', () => {
    expect(step(trace({ placeOfService: '22', agreement: contract(percentTerms()) }), 'fee_schedule', 'viewer')).toContain('Code 97110 at the facility rate: place of service 22 is facility in the practice’s settings.');
    const release = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900006'));
    const split = trace({ agreement: contract(percentTerms()) }, { release, settings: practiceSettings({ zip: '00012', zipPlusFour: '5001' }) });
    expect(step(split, 'fee_schedule', 'viewer')).toContain('Locality: practice ZIP 00012 needs its ZIP+4: 5001 falls in 5000 to 8999, carrier 99999, locality 02.');
    const unsplit = trace({ agreement: contract(percentTerms()) }, { release, settings: practiceSettings({ zip: '00012' }) });
    expect(step(unsplit, 'fee_schedule', 'viewer')).toContain('Locality: practice ZIP 00012 needs its ZIP+4 to name a Medicare locality.');
    expect(step(unsplit, 'outcome', 'viewer')).toBe(
      'Not priced: Unexpected input. The practice ZIP spans more than one Medicare locality and the settings give no ZIP+4. The line stopped at the fee schedule. Remedy: Operator alert.',
    );
  });

  it('has none for a fixed schedule', () => {
    expect(step(trace(AUDIT_LINE), 'fee_schedule')).toBeUndefined();
  });

  it('points only the payer to a worksheet, and only for a complete fee schedule', () => {
    expect(step(line, 'fee_schedule', 'internal', { worksheet: 2 })).toMatch(/^Fee schedule: the 2026 records in force on 2026-03-10\./);
    const schedule = line.steps.fee_schedule!;
    const noRvu = { ...line, steps: { ...line.steps, fee_schedule: { ...schedule, rvu: null } } };
    expect(step(noRvu, 'fee_schedule', 'payer', { worksheet: 2 })).toBe(
      'Fee schedule: the 2026 records in force on the service date. Code 97110 at the non-facility rate: place of service 11 is non-facility in the practice’s settings. Locality: practice ZIP 00011 is Medicare carrier 99999, locality 01.',
    );
  });
});

describe('the worksheet key', () => {
  const line = trace({ agreement: contract(percentTerms({ percentage: '110' })) });
  const schedule = line.steps.fee_schedule!;
  const records = [schedule.rvu!.record.sha256, schedule.locality!.record.sha256];
  const rest = [schedule.gpci!.record.sha256, schedule.conversion_factor!.record.sha256, 'non_facility', '110', 'in_force_on_service_date', '2026', '00011'];

  it('joins the records, the setting, the percentage, the lookup and its year, the ZIP and the citation', () => {
    expect(explainLine(line, CONTRACT, 'internal').worksheetKey).toBe([...records, '', '', ...rest, 'page 2'].join('|'));
    expect(explainLine(line, null, 'internal').worksheetKey).toBe([...records, '', '', ...rest, 'none'].join('|'));
    const ma = trace({ units: '1' });
    expect(explainLine(ma, REGULATION, 'internal').worksheetKey).toMatch(/\|regulation 42 CFR 422\.214$/);
  });

  it('holds the ZIP+4 and its record when the locality needed one', () => {
    const release = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900006'));
    const split = trace({ agreement: contract(percentTerms()) }, { release, settings: practiceSettings({ zip: '00012', zipPlusFour: '5001' }) });
    const plusFour = split.steps.fee_schedule!.locality!.plus_four!;
    expect(explainLine(split, CONTRACT, 'internal').worksheetKey?.split('|').slice(2, 4)).toEqual([plusFour.record.sha256, '5001']);
  });

  it.each(['unit_cents', 'rvu', 'locality', 'gpci', 'conversion_factor', 'setting'] as const)('is null for a fee schedule without its %s', (field) => {
    expect(worksheetKeyOf({ ...line, steps: { ...line.steps, fee_schedule: { ...schedule, [field]: null } } }, CONTRACT)).toBeNull();
  });
});

describe('step 3, the units and the medically unlikely edit', () => {
  it('words the units, the edit checked and within, and the product', () => {
    expect(step(trace({ units: '2', agreement: contract(fixedTerms(5000n, { flags: { apply_ncci: true } })) }), 'units')).toBe(
      '2 units billed, taken as billed. The medically unlikely edit (MUE) for code 97110 is 7; the units are within it. 2 × $50.00 = $100.00.',
    );
  });

  it('words a code with no edit in force, dated for the practice', () => {
    const line = trace({ procedureCode: '97750', agreement: contract(fixedTerms(5000n, { codes: ['97750'], flags: { apply_ncci: true } })) });
    expect(step(line, 'units')).toBe('1 unit billed, taken as billed. No medically unlikely edit (MUE) is in force for code 97750 on 2026-03-10. 1 × $50.00 = $50.00.');
    expect(step(line, 'units', 'viewer')).toBe('1 unit billed, taken as billed. No medically unlikely edit (MUE) is in force for the code on the service date. 1 × $50.00 = $50.00.');
  });

  it('words the edit not checked, and units above it, which stop the line', () => {
    expect(step(trace(AUDIT_LINE), 'units')).toBe('2 units billed, taken as billed. The medically unlikely edit (MUE) is not checked (flag off). 2 × $50.00 = $100.00.');
    const over = trace({ units: '8', agreement: contract(fixedTerms(5000n, { flags: { apply_ncci: true } })) });
    expect(step(over, 'units')).toBe('8 units billed, taken as billed. The medically unlikely edit (MUE) for code 97110 is 7; the units are above it. 8 × $50.00 = $400.00.');
    expect(summaryOf(over)).toBe('Not priced: Units above the MUE with NCCI on.');
    expect(() => explainLine(over, CONTRACT, 'payer')).toThrow(ExplainShapeError);
  });

  it('words the lesser of, where the schedule wins and where the charge does', () => {
    expect(step(trace({ units: '2', chargeCents: cents(12000n), agreement: contract(lesserOfTerms({ fixedCents: 5000n })) }), 'units')).toContain('Lesser of the schedule $100.00 and the line charge $120.00: $100.00.');
    expect(step(trace({ units: '2', chargeCents: cents(6000n), agreement: contract(lesserOfTerms({ fixedCents: 5000n })) }), 'units')).toContain('Lesser of the schedule $100.00 and the line charge $60.00: $60.00.');
  });

  it('words a per-visit amount, which the units do not multiply', () => {
    expect(step(trace({ agreement: contract(perVisitTerms(8000n)) }), 'units')).toBe('1 unit billed, taken as billed. The medically unlikely edit (MUE) is not checked (flag off). $80.00 per visit; units do not multiply it.');
  });
});

describe('step 3, per visit', () => {
  const [carrier, other] = traces([lineFacts({ agreement: contract(perVisitTerms(8000n)) }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: contract(perVisitTerms(8000n)) })]) as [PricingTrace, PricingTrace];

  it('words the line that carries the visit and the visit’s lines', () => {
    expect(step(carrier, 'per_visit')).toBe('$80.00 once for the visit, carried by this line (claim line 1); the visit’s lines are claim line 1 and claim line 2.');
    expect(step(carrier, 'per_visit', 'payer', { rowsOfClaim: new Map([[2, 5]]) })).toBe('$80.00 once for the visit, carried by this line (claim line 1); the visit’s lines are claim line 1 and claim line 2 (row 5).');
    expect(wordsOf(carrier, 'payer', { rowsOfClaim: new Map([[2, 5]]) }).steps.find((item) => item.step === 'per_visit')?.sentences[0]?.segments).toContainEqual({ label: '5', of: 'row' });
  });

  it('words the visit’s other line', () => {
    expect(step(other, 'per_visit')).toBe('The visit’s $80.00 is carried by claim line 1; this line’s base is $0.00.');
  });

  it('has none for another method', () => {
    expect(step(trace(AUDIT_LINE), 'per_visit')).toBeUndefined();
  });
});

describe('step 3, the NCCI procedure-to-procedure edits', () => {
  const ncci = contract(fixedTerms(5000n, { codes: ['97140', '97530', '97161'], flags: { apply_ncci: true } }));

  it('words the edits off, and none pairing the code', () => {
    expect(step(trace(AUDIT_LINE), 'ncci_ptp')).toBe('National Correct Coding Initiative (NCCI) edits are not checked (flag off).');
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { flags: { apply_ncci: true } })) }), 'ncci_ptp')).toBe('No National Correct Coding Initiative (NCCI) edit pairs this code with another line of the claim on its date.');
  });

  it('words an edit that stands, a review flag that does not change the amount', () => {
    const [, column2] = traces([lineFacts({ procedureCode: '97140', agreement: ncci }), lineFacts({ lineNo: 2, procedureCode: '97530', agreement: ncci })]) as [PricingTrace, PricingTrace];
    expect(step(column2, 'ncci_ptp')).toBe('Claim line 1’s code 97140 is the first-column code of a National Correct Coding Initiative (NCCI) edit with this code: the edit stands. It is a review flag and does not change the amount.');
    expect(step(column2, 'outcome')).toBe('Priced: $50.00 expected, $50.00 before the one rounding. A National Correct Coding Initiative (NCCI) edit stands: a review flag, which does not change the amount.');
    expect(step(column2, 'ncci_ptp', 'payer')).toBeUndefined();
  });

  it('writes NCCI out at the first of two edits and abbreviates it at the second', () => {
    const [, , column2] = traces([
      lineFacts({ procedureCode: '97140', agreement: ncci }),
      lineFacts({ lineNo: 2, procedureCode: '97140', agreement: ncci }),
      lineFacts({ lineNo: 3, procedureCode: '97530', agreement: ncci }),
    ]) as [PricingTrace, PricingTrace, PricingTrace];
    expect(column2.steps.ncci_ptp?.edits).toHaveLength(2);
    const sentences = wordsOf(column2).steps.find((item) => item.step === 'ncci_ptp')?.sentences.map(plainText);
    expect(sentences?.[0]).toContain(' is the first-column code of a National Correct Coding Initiative (NCCI) edit with this code: ');
    expect(sentences?.[1]).toContain(' is the first-column code of an NCCI edit with this code: ');
  });

  it('words an edit bypassed by a modifier on this line or on the first-column line', () => {
    const [, own] = traces([lineFacts({ procedureCode: '97140', agreement: ncci }), lineFacts({ lineNo: 2, procedureCode: '97530', modifiers: ['GP', 'XS'], agreement: ncci })]) as [PricingTrace, PricingTrace];
    expect(step(own, 'ncci_ptp')).toBe('Claim line 1’s code 97140 is the first-column code of a National Correct Coding Initiative (NCCI) edit with this code: bypassed by modifier XS on claim line 2, as the edit’s modifier indicator is 1.');
    const [, other] = traces([lineFacts({ procedureCode: '97140', modifiers: ['59'], agreement: ncci }), lineFacts({ lineNo: 2, procedureCode: '97530', agreement: ncci })]) as [PricingTrace, PricingTrace];
    expect(step(other, 'ncci_ptp')).toBe('Claim line 1’s code 97140 is the first-column code of a National Correct Coding Initiative (NCCI) edit with this code: bypassed by modifier 59 on claim line 1, as the edit’s modifier indicator is 1.');
    expect(slots(other, 'ncci_ptp')).toEqual(['ncci_ptp.column1_line', 'ncci_ptp.column1_code', 'ncci_ptp.column1_modifier', 'ncci_ptp.column1_line', 'ncci_ptp.indicator']);
  });
});

describe('step 4a, the multiple procedure payment reduction', () => {
  it('words a code outside the pool, unchanged', () => {
    const [line] = traces([lineFacts({ procedureCode: '97161' })]);
    expect(step(line as PricingTrace, 'mppr', 'payer')).toBe('The multiple procedure payment reduction does not apply to this code (it is not an always-therapy code); $59.17 is unchanged.');
  });

  it('words the day’s first unit, kept whole', () => {
    const [, first] = traces([lineFacts({ procedureCode: '97110' }), lineFacts({ lineNo: 2, procedureCode: '97140' })]);
    expect(step(first as PricingTrace, 'mppr')).toBe('This line’s unit holds the highest practice-expense part of the claim’s day ($15.96) and is kept whole; $24.58 is unchanged.');
  });

  it('words one unit reduced, by the code’s own share, the first unit on another line, the day dated for the practice', () => {
    const [reduced] = traces([lineFacts({ procedureCode: '97110' }), lineFacts({ lineNo: 2, procedureCode: '97140' })]);
    expect(step(reduced as PricingTrace, 'mppr')).toBe(
      'Ranked by practice-expense part on the claim’s day (2026-03-10), the first unit is claim line 2’s ($15.96). Each later unit loses 40% of its practice-expense part (the code’s own reduction): unit 1 (rank 2) loses $5.396. $21.12 becomes $15.724.',
    );
    expect(step(reduced as PricingTrace, 'mppr', 'payer', { rowsOfClaim: new Map([[2, 7]]) })).toBe(
      'Ranked by practice-expense part on the claim’s day, the first unit is claim line 2 (row 7)’s ($15.96). Each later unit loses 40% of its practice-expense part (the code’s own reduction): unit 1 (rank 2) loses $5.396. $21.12 becomes $15.724.',
    );
  });

  it('words two units reduced on the line that holds the first, each cut once', () => {
    const line = trace({ units: '3' });
    expect(step(line, 'mppr', 'viewer')).toBe(
      'Ranked by practice-expense part on the claim’s day, the first unit is this line’s ($13.49). Each later unit loses 40% of its practice-expense part (the code’s own reduction): unit 2 (rank 2) loses $5.396; unit 3 (rank 3) loses $5.396. $63.36 becomes $52.568.',
    );
    expect(slots(line, 'mppr')).toEqual(['mppr.service_date', 'mppr.first_pe', 'mppr.percent', 'mppr.cut_unit', 'mppr.cut_rank', 'mppr.cut', 'mppr.cut_unit', 'mppr.cut_rank', 'mppr.cut', 'mppr.before', 'mppr.after']);
  });

  it('words the general practice-expense reduction for a code with no share of its own', () => {
    const [line] = traces([lineFacts({ procedureCode: '97112', units: '2' })], { release: syntheticRelease(900003) });
    expect(step(line as PricingTrace, 'mppr', 'viewer')).toContain('Each later unit loses 45% of its practice-expense part (the general practice-expense reduction): unit 2 (rank 2) loses');
  });

  it('is left out when its flag is off', () => {
    expect(step(trace(AUDIT_LINE), 'mppr')).toBeUndefined();
  });
});

describe('step 4b, the assistant reduction', () => {
  const assistant = (modifiers: string[]) => trace({ procedureCode: '97161', modifiers });

  it('words CQ by the release for the practice and by Medicare for the payer (finding m10)', () => {
    expect(step(assistant(['GP', 'CQ']), 'assistant_reduction')).toBe('Modifier CQ (services by a therapy assistant): the release pays 77% of the amount. $59.17 becomes $45.5609.');
    expect(step(assistant(['GP', 'CQ']), 'assistant_reduction', 'payer')).toBe('Modifier CQ (services by a therapy assistant): Medicare’s assistant percentage is 77% of the amount. $59.17 becomes $45.5609.');
  });

  it('words CO, and CQ and CO together as one reduction', () => {
    expect(step(assistant(['GO', 'CO']), 'assistant_reduction', 'viewer')).toBe('Modifier CO (services by a therapy assistant): the release pays 77% of the amount. $59.17 becomes $45.5609.');
    expect(step(assistant(['CQ', 'CO']), 'assistant_reduction', 'payer')).toBe(
      'Modifiers CQ and CO (services by a therapy assistant): one reduction, as their percentages agree: Medicare’s assistant percentage is 77% of the amount. $59.17 becomes $45.5609.',
    );
  });

  it('words a line with neither, unchanged', () => {
    expect(step(assistant(['GP']), 'assistant_reduction', 'payer')).toBe('No modifier for services by a therapy assistant (CQ or CO) is on the line: no reduction; $59.17 is unchanged.');
  });
});

describe('step 4c, sequestration', () => {
  it('words the cut of the payer’s share', () => {
    const line = trace({ procedureCode: '97161', patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(1000n) }] });
    expect(step(line, 'sequestration', 'payer')).toBe('Sequestration: the payer’s share is $59.17 less the patient share $10.00, which is $49.17; 3% of it, $1.4751, is withheld. $59.17 becomes $57.6949.');
    expect(slots(line, 'sequestration')).toEqual([
      'sequestration.before',
      'sequestration.patient_share',
      'sequestration.payer_share',
      'sequestration.percent',
      'sequestration.cut',
      'sequestration.before',
      'sequestration.after',
    ]);
  });

  it('words a patient share that leaves no payer’s share: nothing withheld, never false arithmetic (finding m1)', () => {
    const line = trace({ procedureCode: '97161', patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '1', amountCents: cents(9000n) }] });
    expect(line.steps.adjustments.find((item) => item.name === 'sequestration')).toMatchObject({ payer_share_cents: '0' });
    expect(step(line, 'sequestration', 'payer')).toBe('Sequestration: the patient share $90.00 leaves no payer’s share, so nothing is withheld; $59.17 is unchanged.');
  });

  it('words a suspended sequestration by the release for the practice and by Medicare for the payer, never as 0%', () => {
    const line = trace({ procedureCode: '97161', serviceDate: '2026-08-10' }, { release: syntheticRelease(900003) });
    expect(step(line, 'sequestration')).toBe('Sequestration is suspended on the service date in the release’s record: no cut. $59.17 is unchanged.');
    expect(step(line, 'sequestration', 'payer')).toBe('Sequestration is suspended on the service date in Medicare’s sequestration record: no cut. $59.17 is unchanged.');
    expect(step(line, 'sequestration')).not.toMatch(/0%/);
  });
});

describe('step 4d, the contract’s adjustment', () => {
  it('words a percentage of the amount', () => {
    const line = trace({ agreement: contract(fixedTerms(5000n, { adjustment: { kind: 'PERCENT', percent: '95' } })) });
    expect(step(line, 'contract_adjustment')).toBe('The rate record pays 95% of the amount: $50.00 becomes $47.50.');
    expect(step(line, 'contract_adjustment', 'payer')).toBe('The contract pays 95% of the amount: $50.00 becomes $47.50.');
  });

  it('words a cap that cuts and a cap the amount is within', () => {
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { adjustment: { kind: 'CAP', capCents: 4000n } })) }), 'contract_adjustment', 'payer')).toBe('The contract caps the line at $40.00: $50.00 becomes $40.00.');
    expect(step(trace({ agreement: contract(fixedTerms(5000n, { adjustment: { kind: 'CAP', capCents: 6000n } })) }), 'contract_adjustment')).toBe('The rate record caps the line at $60.00; $50.00 is within it and unchanged.');
  });

  it('is left out without one', () => {
    expect(step(trace(AUDIT_LINE), 'contract_adjustment')).toBeUndefined();
  });
});

describe('step 5, the patient share', () => {
  it('words none, and the PR adjustments for the practice, never for the payer', () => {
    expect(step(trace(AUDIT_LINE), 'patient_share')).toBe('Patient share $0.00, reported beside the expected amount and never subtracted from it.');
    const line = trace({
      ...AUDIT_LINE,
      patientShareAdjustments: [
        { groupCode: 'PR', reasonCode: '2', amountCents: cents(1400n) },
        { groupCode: 'PR', reasonCode: '3', amountCents: cents(500n) },
      ],
    });
    expect(step(line, 'patient_share', 'viewer')).toBe('Patient share $19.00, reported beside the expected amount and never subtracted from it. It is the remittance’s patient responsibility adjustments (group PR): reason code 2, $14.00; reason code 3, $5.00. The Adjustments table lists each.');
    expect(step(line, 'patient_share', 'payer')).toBe('Patient share $19.00, reported beside the expected amount and never subtracted from it.');
  });

  it('refuses an adjustment of another group than PR, which it would misname', () => {
    const line = trace({ ...AUDIT_LINE, patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '1', amountCents: cents(500n) }] });
    const other = { ...line, line: { ...line.line, patient_share_adjustments: [{ group_code: 'CO', reason_code: '45', amount_cents: '500' }] } };
    expect(() => explainLine(other, CONTRACT, 'internal')).toThrow('a patient share adjustment is of group PR');
    const mixed = { ...line, line: { ...line.line, patient_share_adjustments: [{ group_code: 'PR', reason_code: '1', amount_cents: '500' }, { group_code: 'CO', reason_code: '45', amount_cents: '500' }] } };
    expect(() => explainLine(mixed, CONTRACT, 'internal')).toThrow('a patient share adjustment is of group PR');
    expect(step(line, 'patient_share', 'payer')).toBe('Patient share $5.00, reported beside the expected amount and never subtracted from it.');
  });
});

describe('step 6, the one rounding', () => {
  it.each([
    ['HALF_UP_CENT', 'half up to the cent', '$23.23'],
    ['HALF_EVEN_CENT', 'half even to the cent', '$23.23'],
    ['TRUNCATE', 'truncated to the cent', '$23.23'],
  ] as const)('words the rate record’s rule %s', (rule, words, rounded) => {
    const line = trace({ units: '1', agreement: contract(percentTerms({ percentage: '110', rounding: rule })) });
    expect(step(line, 'rounding')).toBe(`Rounded once, ${words}, under the rate record’s rule: $23.232 becomes ${rounded}. The unrounded amount is kept beside it.`);
    expect(step(line, 'rounding', 'payer')).toBe(`Rounded once, ${words}, under the contract’s rule: $23.232 becomes ${rounded}. The unrounded amount is kept beside it.`);
  });

  it('words the practice’s default and the engine’s, on a contract line and on a Medicare Advantage line', () => {
    const percent = contract(percentTerms({ percentage: '110' }));
    expect(step(trace({ agreement: percent }), 'rounding', 'viewer')).toBe('Rounded once, half up to the cent, under the practice’s default, as the rate record names no rule: $23.232 becomes $23.23. The unrounded amount is kept beside it.');
    expect(step(trace({ agreement: percent }, { settings: practiceSettings({ defaultRounding: null }) }), 'rounding', 'payer')).toBe(
      'Rounded once, half up to the cent, under the default rule, as neither the contract nor the practice names one: $23.232 becomes $23.23. The unrounded amount is kept beside it.',
    );
    expect(step(trace({ procedureCode: '97161' }, { settings: practiceSettings({ defaultRounding: null }) }), 'rounding')).toBe(
      'Rounded once, half up to the cent, under the default rule, as the practice names none: $57.3949 becomes $57.39. The unrounded amount is kept beside it.',
    );
  });

  it('words an amount already in whole cents as needing no rounding, never as becoming itself', () => {
    expect(step(trace(AUDIT_LINE), 'rounding')).toBe('Rounded once, half up to the cent, under the practice’s default, as the rate record names no rule: $100.00 needed no rounding.');
    expect(step(trace(AUDIT_LINE), 'rounding', 'payer')).toBe('Rounded once, half up to the cent, under the practice’s default, as the contract names no rule: $100.00 needed no rounding.');
  });

  it('refuses a Medicare Advantage line that says it rounded under a rate record’s rule, which such a line has none of', () => {
    const line = trace();
    const rounding = line.steps.rounding as NonNullable<PricingTrace['steps']['rounding']>;
    const claimed = { ...line, steps: { ...line.steps, rounding: { ...rounding, origin: 'rate_record' as const } } };
    for (const audience of ['internal', 'viewer', 'payer'] as const) {
      expect(() => explainLine(claimed, REGULATION, audience)).toThrow('a Medicare Advantage non-contracted line rounds under no rate record’s rule');
    }
  });
});

describe('step 7, observed and the variance', () => {
  it('words a short line, by the basis, for each audience', () => {
    expect(step(trace(AUDIT_LINE), 'observed')).toBe('Observed allowed $70.00, the allowed amount the payer states for the line (AMT B6). Expected $100.00, observed allowed $70.00: short $30.00.');
    expect(step(trace({ ...AUDIT_LINE, observedAllowedBasis: 'paid_plus_pr' }), 'observed', 'payer')).toBe(
      'Observed allowed $70.00, the amount paid plus the patient’s responsibility.',
    );
    expect(step(trace(AUDIT_LINE), 'observed', 'payer')).toBe('Observed allowed $70.00, the allowed amount the remittance states.');
  });

  it('words no variance and an overpaid line, signed as the trace holds it', () => {
    expect(step(trace({ ...AUDIT_LINE, observedAllowedCents: cents(10000n) }), 'observed')).toBe('Observed allowed $100.00, the allowed amount the payer states for the line (AMT B6). Expected $100.00, observed allowed $100.00: no variance.');
    expect(step(trace({ ...AUDIT_LINE, observedAllowedCents: cents(10500n) }), 'observed')).toBe(
      'Observed allowed $105.00, the allowed amount the payer states for the line (AMT B6). Expected $100.00, observed allowed $105.00: variance -$5.00 (overpaid: recorded, never pursued).',
    );
  });
});

describe('step 8, the dispute window', () => {
  it('words a release’s window from the payment date, dated and judged for the practice, its length and start only for the viewer, nothing for the payer', () => {
    const line = trace();
    expect(step(line, 'window')).toBe('Dispute window: 111 days from the payment date 2026-04-01, under the release’s record; it ends on 2026-07-21; on 2026-10-15 it is passed.');
    expect(step(line, 'window', 'viewer')).toBe('Dispute window: 111 days from the payment date, under the release’s record.');
    expect(step(line, 'window', 'payer')).toBeUndefined();
  });

  it('words the contract’s own window, open', () => {
    const line = trace({ agreement: contract(fixedTerms(5000n), { windows: { timely_filing_days: null, dispute_window_days: 180, appeal_levels: [] } }) });
    expect(step(line, 'window')).toBe('Dispute window: 180 days from the payment date 2026-04-01, under the contract; it ends on 2026-09-28; on 2026-10-15 it is passed.');
    const windows = { timely_filing_days: null, dispute_window_days: 180, appeal_levels: [] };
    expect(step(trace({ agreement: contract(fixedTerms(5000n), { windows }) }, { asOf: '2026-05-01' }), 'window')).toBe(
      'Dispute window: 180 days from the payment date 2026-04-01, under the contract; it ends on 2026-09-28; on 2026-05-01 it is open.',
    );
  });

  it('words a window in months from the service date', () => {
    expect(step(trace({ agreement: contract() }, { release: syntheticRelease(900003) }), 'window')).toBe(
      'Dispute window: 4 months from the service date 2026-03-10, under the release’s record; it ends on 2026-07-10; on 2026-10-15 it is passed.',
    );
  });

  it('words a line with no window', () => {
    expect(step(trace(AUDIT_LINE, { claim: { remittanceDate: null } }), 'window')).toBe('No dispute window applies to this line.');
  });

  it('words a window of one day in the singular', () => {
    const windows = { timely_filing_days: null, dispute_window_days: 1, appeal_levels: [] };
    expect(step(trace({ agreement: contract(fixedTerms(5000n), { windows }) }), 'window', 'viewer')).toBe('Dispute window: 1 day from the payment date, under the contract.');
  });

  it('groups a window’s length by thousands (UX finding: counts without a separator)', () => {
    const windows = { timely_filing_days: null, dispute_window_days: 3650, appeal_levels: [] };
    expect(step(trace({ agreement: contract(fixedTerms(5000n), { windows }) }), 'window', 'viewer')).toBe('Dispute window: 3,650 days from the payment date, under the contract.');
  });
});

describe('the release and the outcome', () => {
  it('names the release and the engine for the practice and the viewer, never for the payer', () => {
    expect(step(trace(AUDIT_LINE), 'release', 'viewer')).toBe('Priced under rule release 900001 by engine phase-two/2.');
    expect(step(trace(AUDIT_LINE), 'release', 'payer')).toBeUndefined();
  });
});

describe('an unpriced line', () => {
  const mapping = mappingRecord({ kind: 'contract' });
  const cases: readonly { readonly reason: string; readonly facts: Partial<LineFacts>; readonly options?: Options; readonly outcome: string }[] = [
    { reason: 'NO_MAPPING', facts: { agreement: { outcome: 'NO_MAPPING' } }, outcome: 'Not priced: The payer and plan have no mapping on the service date. The line stopped at the agreement. Remedy: Map the plan.' },
    { reason: 'NO_AGREEMENT', facts: { agreement: { outcome: 'NO_AGREEMENT', mapping } }, outcome: 'Not priced: Mapped as out of network or no agreement. The line stopped at the agreement. Remedy: None; anomaly screening only.' },
    {
      reason: 'DATE_OUTSIDE_VERSIONS',
      facts: { agreement: { outcome: 'DATE_OUTSIDE_VERSIONS', mapping } },
      outcome: 'Not priced: No signed-off version covers the service date. The line stopped at the agreement. Remedy: Obtain the amendment or confirm the window.',
    },
    {
      reason: 'NO_RATE_FOR_CODE',
      facts: { agreement: { outcome: 'NO_RATE_FOR_CODE', mapping, version: versionRecord() } },
      outcome: 'Not priced: The agreement has no term for the code. The line stopped at the agreement. Remedy: Obtain the exhibit page or confirm exclusion.',
    },
    {
      reason: 'NO_PFS_VALUE',
      facts: { procedureCode: '97750', agreement: contract(percentTerms({ codes: ['97750'] })) },
      outcome: 'Not priced: No RVU for the code in the basis year. No relative value for the code in the basis year. The line stopped at the fee schedule. Remedy: Check the code and year; some codes are carrier-priced.',
    },
    {
      reason: 'NO_PFS_VALUE',
      facts: { procedureCode: '97026', placeOfService: '22', agreement: contract(percentTerms({ codes: ['97026'] })) },
      outcome: 'Not priced: No RVU for the code in the basis year. No practice-expense value for the code in the setting. The line stopped at the fee schedule. Remedy: Check the code and year; some codes are carrier-priced.',
    },
    {
      reason: 'UNITS_RULE_UNKNOWN',
      facts: { agreement: contract(fixedTerms(5000n, { flags: { timed_units_rule: 'UNKNOWN' } })) },
      outcome: 'Not priced: Timed-units rule unknown for the payer. The line stopped at the units. Remedy: Confirm with the contract or import minutes.',
    },
    { reason: 'REVERSED_CLAIM', facts: {}, options: { claim: { claimStatusCode: '22' } }, outcome: 'Not priced: The claim was reversed and not corrected. The line stopped at the claim’s status. Remedy: None.' },
    {
      reason: 'ENGINE_ERROR',
      facts: { units: '1.5' },
      outcome: 'Not priced: Unexpected input. The units are not a whole number of at least one. The line stopped at the units. Remedy: Operator alert.',
    },
    {
      reason: 'ENGINE_ERROR',
      facts: { agreement: { outcome: 'RESOLUTION_FAILED' } },
      outcome: 'Not priced: Unexpected input. The agreement could not be resolved to one mapping, version and rate record. The line stopped at the agreement. Remedy: Operator alert.',
    },
  ];

  it.each(cases)('words $reason: its meaning, its detail, where it stopped and its remedy, the doc’s words quoted', ({ facts, options, outcome }) => {
    const line = trace(facts, options);
    expect(line.outcome.result).toBe('unpriced');
    expect(step(line, 'outcome')).toBe(outcome);
    expect(step(line, 'outcome', 'viewer')).toBe(outcome);
    const quoted = wordsOf(line).steps.find((item) => item.step === 'outcome')?.sentences.flatMap((sentence) => sentence.segments.filter((segment) => 'quoted' in segment));
    expect(quoted?.length).toBe(2);
    expect(quoted?.map((segment) => ('quoted' in segment ? segment.from : null))).toEqual(['unpriced_reasons', 'unpriced_reasons']);
    expect(() => explainLine(line, citationOf(line), 'payer')).toThrow('the payer’s words are of priced lines only');
  });

  it('words a plan mapping that could not be resolved to one agreement', () => {
    expect(step(trace({ agreement: { outcome: 'RESOLUTION_FAILED' } }), 'agreement')).toBe('The plan’s mapping could not be resolved to one agreement.');
  });

  it('reads the steps not reached as such, and leaves out a step that would not have applied', () => {
    const line = trace({ agreement: { outcome: 'NO_MAPPING' } });
    const words = wordsOf(line);
    expect(plainText(words.summary)).toBe('Not priced: The payer and plan have no mapping on the service date.');
    expect(words.steps.map((item) => [item.step, text(item.sentences)])).toEqual([
      ['agreement', 'The payer and plan have no mapping on the service date.'],
      ['terms', 'Not reached.'],
      ['units', 'Not reached.'],
      ['patient_share', 'Not reached.'],
      ['rounding', 'Not reached.'],
      ['observed', 'Observed allowed $20.00, the allowed amount the payer states for the line (AMT B6).'],
      ['window', 'Not reached.'],
      ['release', 'Priced under rule release 900001 by engine phase-two/2.'],
      ['outcome', 'Not priced: The payer and plan have no mapping on the service date. The line stopped at the agreement. Remedy: Map the plan.'],
    ]);
  });

  it('words an unsupported method', () => {
    const terms = { ...fixedTerms(5000n), method: 'UNSUPPORTED', parameters: {} } as unknown as ReturnType<typeof fixedTerms>;
    const line = trace({ agreement: contract(terms) });
    expect(step(line, 'terms')?.split('. ')[0]).toBe('The rate record’s method is one the engine does not price');
    expect(summaryOf(line)).toBe('Not priced: Capitation or undefined case rate.');
  });

  it.each([
    ['2', 'processed as secondary'],
    ['3', 'processed as tertiary'],
    ['20', 'processed as secondary and forwarded to another payer'],
    ['21', 'processed as tertiary and forwarded to another payer'],
  ])('words claim status %s from the trace, never the document’s narrower meaning (finding m3)', (status, words) => {
    const line = trace(AUDIT_LINE, { claim: { claimStatusCode: status } });
    expect(summaryOf(line)).toBe(`Not priced: claim status ${status} (${words}).`);
    expect(step(line, 'outcome')).toBe(`Not priced: claim status ${status} (${words}), which this release does not price. Remedy: Deferred release.`);
    expect(step(line, 'outcome')).not.toContain('Claim status 2 or 3');
  });
});

describe('the flag rule', () => {
  const FLAGS = [
    ['apply_mppr', 'the multiple procedure payment reduction', 'mppr'],
    ['apply_assistant_reduction', 'the assistant reduction', 'assistant_reduction'],
    ['apply_sequestration', 'sequestration', 'sequestration'],
    ['apply_ncci', 'National Correct Coding Initiative (NCCI) edits', 'ncci_ptp'],
  ] as const;

  it.each(FLAGS)('words %s off as not applied, never as the contract’s position, and says nothing of it to the payer', (flag, name, kind) => {
    const on = Object.fromEntries(FLAGS.map(([other]) => [other, other !== flag]));
    const line = trace({ procedureCode: '97110', modifiers: ['GP', 'CQ'], agreement: contract(percentTerms({ percentage: '110', flags: on })) });
    const internal = wordsOf(line);
    const terms = internal.steps.find((item) => item.step === 'terms')?.sentences.map(plainText) ?? [];
    expect(terms).toContain(`Not applied (flag off): ${name}.`);
    for (const sentence of lineSentences(internal).map(plainText)) {
      if (sentence.includes(name) && !sentence.startsWith('Not applied')) expect(sentence, sentence).not.toMatch(/contract/);
    }
    if (kind !== 'ncci_ptp') expect(internal.steps.map((item) => item.step)).not.toContain(kind);
    const payer = lineSentences(wordsOf(line, 'payer')).map(plainText).join(' ');
    expect(payer).not.toContain('flag');
    if (kind !== 'sequestration') expect(payer).not.toContain(name);
    else expect(payer).not.toMatch(/Sequestration/);
  });
});

/**
 * Shapes the engine does not write, each made by hand from a trace it priced: the words refuse them by name (an
 * ExplainShapeError or ExplainWordsError the surfaces show as "cannot be put in words"), or word only what the trace
 * holds, rather than failing on a property of nothing or printing a step as reached or not that it was not.
 */
describe('traces the engine does not write', () => {
  const percent = trace({ agreement: contract(percentTerms({ percentage: '110' })) });
  const unpriced = (line: PricingTrace, step: 'input' | 'fee_schedule'): PricingTrace => ({ ...line, outcome: { result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'unexpected', step } });

  it('reads the agreement as not reached for a line that stopped before it, and states no variance for it', () => {
    const line = { ...unpriced(trace(AUDIT_LINE), 'input'), agreement: null };
    const words = explainLine(line, null, 'internal');
    expect(words.steps.find((item) => item.step === 'agreement')).toEqual({ step: 'agreement', sentences: [say('Not reached.')] });
    // Its trace still holds the variance it was priced with; an unpriced line's observed step states only the basis.
    expect(text(words.steps.find((item) => item.step === 'observed')?.sentences ?? [])).toBe('Observed allowed $70.00, the allowed amount the payer states for the line (AMT B6).');
  });

  it('reads the fee schedule as not reached for a percent-of-Medicare line that stopped before it', () => {
    const line = { ...unpriced(percent, 'fee_schedule'), steps: { ...percent.steps, fee_schedule: null } };
    expect(text(explainLine(line, CONTRACT, 'internal').steps.find((item) => item.step === 'fee_schedule')?.sentences ?? [])).toBe('Not reached.');
  });

  it('never reads a step of a priced line as not reached, even one its trace leaves empty', () => {
    const line = { ...trace(AUDIT_LINE), steps: { ...trace(AUDIT_LINE).steps, window: null } };
    const words = explainLine(line, CONTRACT, 'internal');
    expect(words.steps.map((item) => item.step)).not.toContain('window');
    expect(lineSentences(words).map(plainText)).not.toContain('Not reached.');
  });

  it('refuses a priced line without its units or its variance', () => {
    const line = trace(AUDIT_LINE);
    for (const steps of [{ ...line.steps, units: null }, { ...line.steps, variance_cents: null }]) {
      expect(() => explainLine({ ...line, steps }, CONTRACT, 'internal')).toThrow('the calculation cannot be put in words: a priced line has its units and variance');
    }
  });

  it('refuses a fee schedule whose year basis the terms do not state', () => {
    for (const terms of [null, { ...percent.terms!, percent_of_medicare: null }]) {
      expect(() => explainLine({ ...percent, terms }, CONTRACT, 'internal')).toThrow('the year basis disagrees with the fee schedule’s lookup');
    }
  });

  it('refuses a percent-of-Medicare term without its schedule', () => {
    const line = { ...percent, terms: { ...percent.terms!, percent_of_medicare: null }, steps: { ...percent.steps, fee_schedule: null } };
    expect(() => explainLine(line, CONTRACT, 'internal')).toThrow('the calculation cannot be put in words: a percent-of-Medicare term has its schedule');
  });

  it('words a lesser-of term that names no schedule method by its percent-of-Medicare schedule', () => {
    const line = trace({ agreement: contract(lesserOfTerms({ percentage: '110' })) });
    const bare = { ...line, terms: { ...line.terms!, lesser_of: null } };
    expect(step(bare, 'terms', 'payer')).toBe(step(line, 'terms', 'payer'));
    expect(step(bare, 'terms', 'payer')).toMatch(/^Lesser of the line charge and 110% of the Medicare physician fee schedule/);
  });

  it('refuses a claim status it has no words for, naming the list', () => {
    const line = trace(AUDIT_LINE, { claim: { claimStatusCode: '20' } });
    const other = { ...line, claim: { ...line.claim, claim_status_code: '29' } };
    expect(() => explainLine(other, CONTRACT, 'internal')).toThrow(expect.objectContaining({ name: 'ExplainWordsError', list: 'claim status' }));
  });

  it('refuses a bypassed edit with no bypassing modifier on either line', () => {
    const ncci = contract(fixedTerms(5000n, { codes: ['97140', '97530', '97161'], flags: { apply_ncci: true } }));
    const [, own] = traces([lineFacts({ procedureCode: '97140', agreement: ncci }), lineFacts({ lineNo: 2, procedureCode: '97530', modifiers: ['GP', 'XS'], agreement: ncci })]) as [PricingTrace, PricingTrace];
    const none = { ...own, line: { ...own.line, modifiers: ['GP'] } };
    expect(() => explainLine(none, CONTRACT, 'internal')).toThrow('the calculation cannot be put in words: a bypassed edit has a bypassing modifier');
  });

  it('refuses a reduction in the pool that ranks no unit', () => {
    const line = trace({ units: '3' });
    const steps = { ...line.steps, adjustments: line.steps.adjustments.map((adjustment) => (adjustment.name === 'mppr' ? { ...adjustment, ranking: [] } : adjustment)) };
    expect(() => explainLine({ ...line, steps }, REGULATION, 'internal')).toThrow('the calculation cannot be put in words: a reduction in the pool ranks its units');
  });

  it('refuses an assistant modifier it has no words for', () => {
    const line = trace({ units: '2', modifiers: ['GP', 'CQ'] });
    const steps = {
      ...line.steps,
      adjustments: line.steps.adjustments.map((adjustment) =>
        adjustment.name === 'assistant_reduction' ? { ...adjustment, records: adjustment.records.map((record) => ({ ...record, modifier: 'GA' })) } : adjustment,
      ),
    };
    expect(() => explainLine({ ...line, steps }, REGULATION, 'internal')).toThrow(expect.objectContaining({ name: 'ExplainWordsError', list: 'assistant modifier' }));
  });

  it.each(['length', 'unit', 'measured_from', 'source'] as const)('refuses a dispute window without its %s', (field) => {
    const line = trace();
    const window = { ...line.steps.window!, [field]: null };
    expect(() => explainLine({ ...line, steps: { ...line.steps, window } }, REGULATION, 'viewer')).toThrow('the calculation cannot be put in words: a dispute window has its length, unit, start and source');
  });
});

describe('determinism', () => {
  it('gives the same words, byte for byte, for the same trace, citation and audience', () => {
    const line = trace({ units: '3', modifiers: ['GP', 'CQ'] });
    for (const audience of ['internal', 'viewer', 'payer'] as const) {
      expect(JSON.stringify(explainLine(structuredClone(line), REGULATION, audience))).toBe(JSON.stringify(explainLine(line, REGULATION, audience)));
    }
  });
});

describe('the payer’s audience', () => {
  it('words only what the payer reads: no agreement, units, edits, window, release or outcome step', () => {
    const line = trace({ units: '2', modifiers: ['GP', 'CQ'] });
    expect(wordsOf(line, 'payer', { worksheet: 1 }).steps.map((item) => item.step)).toEqual(['terms', 'fee_schedule', 'mppr', 'assistant_reduction', 'sequestration', 'patient_share', 'rounding', 'observed']);
    expect(wordsOf(line, 'viewer').steps.map((item) => item.step)).toEqual([
      'agreement',
      'terms',
      'fee_schedule',
      'units',
      'ncci_ptp',
      'mppr',
      'assistant_reduction',
      'sequestration',
      'patient_share',
      'rounding',
      'observed',
      'window',
      'release',
      'outcome',
    ]);
  });
});
