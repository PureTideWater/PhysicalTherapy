import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { type FactCatalog, canonicalFactId, codeShaped, factCatalog, lookupFact, modifierShaped, rowFacts, summedValue } from './fact-catalog';
import { FACT_CONTENTS } from './fact-contents.test-support';
import { factWords } from './fact-words';
import type { PacketContent } from './format';
import { isFactId } from './placeholders';
import { REGULATION, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord } from './test-support';

/**
 * The facts' catalog (design lane-b-packet-figure-placeholders, section 1; test matrix CAS-55, the render half): every
 * id's source, kind, role, scope and rows; ids unique and canonical; the precedence that gives one set of lines one id;
 * codes and modifiers rendered from the content; the conditional ids; and the values code computes, the stored totals
 * read as stored and a set of rows summed in bigint cents and decimal units.
 */

const ids = (catalog: FactCatalog) => catalog.entries.map((entry) => entry.id);
const value = (catalog: FactCatalog, id: string) => {
  const found = lookupFact(catalog, id);
  return 'found' in found ? found.found.value : found.problem;
};
const of = (content: PacketContent) => factCatalog(content);

describe('the catalog of a packet', () => {
  it('lists each fact once, under an id of the grammar that names itself', () => {
    for (const make of Object.values(FACT_CONTENTS)) {
      const catalog = of(make());
      expect(new Set(ids(catalog)).size).toBe(catalog.entries.length);
      for (const entry of catalog.entries) {
        expect(isFactId(entry.id), entry.id).toBe(true);
        expect(lookupFact(catalog, entry.id)).toEqual({ found: entry });
        expect(Object.hasOwn(factWords().phrases, entry.phrase), entry.phrase).toBe(true);
        expect(entry.model, entry.id).toBe(factWords().modelSubjects.includes(entry.subject));
        expect(entry.id.startsWith(`${entry.subject}.`), entry.id).toBe(true);
        expect([...entry.rows].sort((a, b) => a - b)).toEqual(entry.rows);
        const open = entry.kind === 'date_span' && (entry.value as { readonly to: string | null }).to === null;
        expect(entry.paths.length, entry.id).toBe(entry.kind === 'date_span' && !open ? 2 : 1);
      }
    }
  });

  it('gives each fact the kind and role of its measure', () => {
    for (const make of Object.values(FACT_CONTENTS)) {
      for (const entry of of(make()).entries) {
        const stem = entry.id.replace(/\.\d+$/, '');
        const { otherFacts, lineMeasures } = factWords();
        if (Object.hasOwn(otherFacts, stem)) {
          const other = otherFacts[stem as keyof typeof otherFacts];
          expect([entry.kind, entry.role], entry.id).toEqual([other.kind, other.role]);
        } else {
          const measure = entry.measure.replace(/_each$/, '') as keyof typeof lineMeasures;
          expect([entry.kind, entry.role], entry.id).toEqual([lineMeasures[measure].kind, lineMeasures[measure].role]);
        }
      }
    }
  });

  it('states the base packet’s facts, the pattern’s and codes’ as stored and the sums as code computes them', () => {
    const catalog = of(FACT_CONTENTS.base());
    expect(ids(catalog)).toEqual([
      'packet.as_of',
      'packet.level',
      'citation.version',
      'citation.page',
      'citation.effective',
      'citation.quote',
      'contract.rate',
      'release.no.1',
      'pattern.lines',
      'pattern.claims',
      'pattern.patients',
      'pattern.units',
      'pattern.expected',
      'pattern.allowed',
      'pattern.paid',
      'pattern.variance',
      'pattern.patient_share',
      'pattern.service_dates',
      'pattern.units_each',
      'pattern.expected_each',
      'pattern.allowed_each',
      'pattern.paid_each',
      'pattern.variance_each',
      'pattern.patient_share_each',
      'code.97110',
      ...[1, 2, 3].flatMap((row) => ['units', 'expected', 'allowed', 'paid', 'variance', 'patient_share', 'service_date', 'paid_on', 'window_ends_on', 'code'].map((measure) => `line.${String(row)}.${measure}`)),
      'deadline.ends_on',
      'deadline.window_days',
      'deadline.window_page',
    ]);
    const entry = (id: string) => catalog.byId.get(id);
    expect(entry('pattern.expected')).toMatchObject({ value: '30000', scope: 'total', rows: [1, 2, 3], paths: [['pattern', 'expected_cents']], summed: false, kind: 'amount', role: 'expected' });
    expect(entry('pattern.allowed')).toMatchObject({ value: '21000', paths: [['pattern', 'observed_cents']] });
    expect(entry('pattern.variance')).toMatchObject({ value: '9000', paths: [['pattern', 'variance_cents']] });
    expect(entry('pattern.paid')).toMatchObject({ value: '16800', paths: [['lines', '#', 'paid_cents']], summed: true });
    expect(entry('pattern.patient_share')).toMatchObject({ value: '4200', paths: [['lines', '#', 'calculation', 'patient_share_cents']], summed: true });
    expect(entry('pattern.units')).toMatchObject({ value: '6', kind: 'units', paths: [['pattern', 'units']] });
    expect(entry('pattern.lines')).toMatchObject({ value: 3, kind: 'count', scope: null, paths: [['pattern', 'lines']] });
    expect(entry('pattern.claims')).toMatchObject({ value: 3, paths: [['pattern', 'claims']] });
    expect(entry('pattern.patients')).toMatchObject({ value: 3, paths: [['pattern', 'patients']] });
    expect(entry('pattern.service_dates')).toMatchObject({ value: { from: '2026-03-05', to: '2026-03-07' }, paths: [['pattern', 'first_service_date'], ['pattern', 'last_service_date']], phrase: 'pattern.service_dates' });
    expect(entry('pattern.allowed_each')).toMatchObject({ value: '7000', scope: 'line', rows: [1, 2, 3], paths: [['lines', '#', 'observed_cents']], summed: false });
    expect(entry('pattern.units_each')).toMatchObject({ value: '2', paths: [['lines', '#', 'units']] });
    expect(entry('line.2.paid')).toMatchObject({ value: '5600', scope: 'part', rows: [2], paths: [['lines', 1, 'paid_cents']], summed: false, model: false });
    expect(entry('line.3.service_date')).toMatchObject({ value: '2026-03-07', kind: 'date', paths: [['lines', 2, 'service_date']] });
    expect(entry('line.1.window_ends_on')).toMatchObject({ value: '2036-04-05', role: 'deadline', paths: [['lines', 0, 'window_ends_on']] });
    expect(entry('code.97110')).toMatchObject({ value: '97110', kind: 'code', scope: 'part', rows: [1, 2, 3], paths: [['lines', '#', 'procedure_code']], subject: 'code', measure: 'code', summed: false });
    expect(entry('contract.rate')).toMatchObject({ subject: 'contract', measure: 'rate', value: '5000', scope: 'unit', paths: [['citation', 'parameters', 'amount_cents']], phrase: 'contract.rate.FIXED_SCHEDULE' });
    expect(entry('citation.effective')).toMatchObject({ subject: 'citation', measure: 'effective', value: { from: '2026-01-01', to: null }, paths: [['citation', 'effective_from']], phrase: 'citation.effective.open' });
    expect(entry('citation.page')).toMatchObject({ value: 2, kind: 'page', role: 'citation_page' });
    expect(entry('citation.version')).toMatchObject({ value: 1 });
    expect(entry('release.no.1')).toMatchObject({ value: 900001, paths: [['rule_releases', 0, 'release_no']] });
    expect(entry('packet.level')).toMatchObject({ value: 1, paths: [['dispute_level']] });
    expect(entry('packet.as_of')).toMatchObject({ value: '2026-10-16', paths: [['as_of']] });
    expect(entry('deadline.window_days')).toMatchObject({ value: 3650, paths: [['deadline', 'sources', 0, 'days']] });
    expect(entry('deadline.window_page')).toMatchObject({ value: 1, paths: [['deadline', 'sources', 0, 'page']] });
    expect(entry('deadline.ends_on')).toMatchObject({ value: '2036-04-05' });
  });

  it('reads a code’s totals as stored and sums a claim’s and a set of rows’ in cents and units', () => {
    const catalog = of(FACT_CONTENTS.severalCodes());
    expect(catalog.byId.get('code.97110.variance')).toMatchObject({ value: '9750', rows: [1, 2, 4], paths: [['pattern', 'codes', 2, 'variance_cents']], summed: false });
    expect(catalog.byId.get('code.97110.units')).toMatchObject({ value: '6.5', paths: [['pattern', 'codes', 2, 'units']] });
    expect(catalog.byId.get('code.97110.paid')).toMatchObject({ value: '18200', summed: true, paths: [['lines', '#', 'paid_cents']] });
    expect(catalog.byId.get('code.97110.service_dates')).toMatchObject({ value: { from: '2026-03-02', to: '2026-03-05' }, phrase: 'code.service_dates' });
    expect(catalog.byId.get('code.g0283.service_dates')).toMatchObject({ value: { from: '2026-03-04', to: '2026-03-04' }, phrase: 'code.service_dates.one' });
    expect(catalog.byId.get('claim.5.expected')).toMatchObject({ value: '24000', rows: [5, 6], summed: true, model: false });
    expect(catalog.byId.get('claim.5.units')).toMatchObject({ value: '4' });
    expect(catalog.byId.get('claim.5.lines')).toMatchObject({ value: 2, scope: null });
    expect(value(catalog, 'lines.1+2.units')).toBe('3.5');
    expect(value(catalog, 'lines.1+2+3.expected')).toBe('20000');
    expect(value(catalog, 'lines.2+6.paid')).toBe('4200');
    expect(value(catalog, 'lines.2+3.service_dates')).toEqual({ from: '2026-03-03', to: '2026-03-04' });
    expect(lookupFact(catalog, 'lines.1+5.variance')).toMatchObject({ found: { id: 'lines.1+5.variance', subject: 'lines', scope: 'part', rows: [1, 5], summed: true, model: false, phrase: 'lines.variance' } });
    expect(lookupFact(catalog, 'lines.2+3.service_dates')).toMatchObject({ found: { scope: null, phrase: 'lines.service_dates' } });
    expect(lookupFact(catalog, 'lines.3+6.service_dates')).toMatchObject({ found: { value: { from: '2026-03-04', to: '2026-03-10' } } });
  });

  it('names a code by its content code lowercased, and gives a code of another shape no id', () => {
    const catalog = of(FACT_CONTENTS.severalCodes());
    expect(catalog.byId.get('code.g0283')?.value).toBe('G0283');
    expect(catalog.byId.get('code.0275t')?.value).toBe('0275T');
    expect(ids(catalog).filter((id) => id.includes('9701'))).toEqual([]);
    expect(lookupFact(catalog, 'code.9701')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(catalog, 'line.6.code')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(catalog, 'code.G0283')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(catalog, 'code.97112')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(catalog, 'code.97112.variance')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(catalog, 'code.g0283.rate')).toEqual({ problem: 'unknown_fact' });
    expect(['G0283', '0275T', '97110', '9701', 'g0283', 'G02833', ' G0283', 'G0283 '].map(codeShaped)).toEqual([true, true, true, false, false, false, false, false]);
    expect(['GP', '59', 'XYZ', 'gp', 'G', ' GP', 'GP '].map(modifierShaped)).toEqual([true, true, false, false, false, false, false]);
  });

  it('holds modifiers only where every line of its code or row holds the same ones, each of the shape', () => {
    const several = of(FACT_CONTENTS.severalCodes());
    expect(several.byId.get('code.g0283.modifiers')).toMatchObject({ value: ['GP', 'KX'], paths: [['lines', '#', 'modifiers']] });
    expect(several.byId.get('code.0275t.modifiers')?.value).toEqual(['59']);
    expect(lookupFact(several, 'line.3.modifiers')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.g0283.modifiers' });
    expect(lookupFact(several, 'line.1.modifiers')).toEqual({ problem: 'unknown_fact' });
    const mixed = of(assemblePacket(assemblyInput({ lines: [line(1, { modifiers: ['GP'] }), line(2, { modifiers: ['GP', 'KX'] }), line(3, { modifiers: ['XYZ'] })] })));
    expect(lookupFact(mixed, 'code.97110.modifiers')).toEqual({ problem: 'unknown_fact' });
    expect(mixed.byId.get('line.1.modifiers')).toMatchObject({ value: ['GP'], paths: [['lines', 0, 'modifiers']], phrase: 'line.modifiers' });
    expect(mixed.byId.get('line.2.modifiers')?.value).toEqual(['GP', 'KX']);
    expect(lookupFact(mixed, 'line.3.modifiers')).toEqual({ problem: 'unknown_fact' });
    const alike = of(assemblePacket(assemblyInput({ lines: [line(1, { modifiers: ['GP'] }), line(2, { modifiers: ['GP'] }), line(3, { modifiers: ['GP'] })] })));
    expect(alike.byId.get('code.97110.modifiers')?.value).toEqual(['GP']);
    // A row's own modifiers name one line, the code's every line of it: two sets, two ids.
    expect(alike.byId.get('line.2.modifiers')).toMatchObject({ value: ['GP'], rows: [2] });
    const offShape = of(assemblePacket(assemblyInput({ lines: [line(1, { modifiers: ['GP', 'XYZ'] }), line(2, { modifiers: ['GP', 'XYZ'] }), line(3, { modifiers: ['GP', 'XYZ'] })] })));
    expect(lookupFact(offShape, 'code.97110.modifiers')).toEqual({ problem: 'unknown_fact' });
  });
});

describe('one set of lines, one id', () => {
  // Built in each test, never while the suite is collected, so a mutant of the catalog is tried against the tests that reach it.
  const catalogs = () => [of(FACT_CONTENTS.severalCodes()), of(FACT_CONTENTS.oneCode()), of(FACT_CONTENTS.oneLine())] as const;

  it('names every line by the pattern', () => {
    const [several, , oneLine] = catalogs();
    expect(lookupFact(several, 'lines.1+2+3+4+5+6.expected')).toEqual({ problem: 'fact_not_canonical', canonical: 'pattern.expected' });
    expect(canonicalFactId(several, [6, 5, 4, 3, 2, 1], 'paid')).toBe('pattern.paid');
    expect(canonicalFactId(oneLine, [1], 'variance')).toBe('pattern.variance');
    expect(lookupFact(oneLine, 'line.1.variance')).toEqual({ problem: 'fact_not_canonical', canonical: 'pattern.variance' });
    expect(lookupFact(oneLine, 'line.1.service_date')).toEqual({ problem: 'fact_not_canonical', canonical: 'pattern.service_dates' });
  });

  it('names a code’s lines by the code, and a one-code pattern’s by the pattern', () => {
    const [several, oneCode, oneLine] = catalogs();
    expect(lookupFact(several, 'lines.1+2+4.variance')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.97110.variance' });
    expect(lookupFact(several, 'claim.1.variance')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.97110.variance' });
    expect(lookupFact(several, 'line.3.expected')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.g0283.expected' });
    expect(lookupFact(several, 'line.3.code')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.g0283' });
    expect(lookupFact(several, 'line.5.service_date')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.0275t.service_dates' });
    expect(canonicalFactId(several, [4, 2, 1, 2], 'allowed')).toBe('code.97110.allowed');
    expect(lookupFact(oneCode, 'code.97110.variance')).toEqual({ problem: 'fact_not_canonical', canonical: 'pattern.variance' });
    expect(lookupFact(oneCode, 'code.97110.lines')).toEqual({ problem: 'fact_not_canonical', canonical: 'pattern.lines' });
    expect(ids(oneCode).filter((id) => id.startsWith('code.'))).toEqual(['code.97110']);
    expect(ids(oneLine).filter((id) => id.startsWith('code.'))).toEqual(['code.97110', 'code.97110.modifiers']);
  });

  it('names a claim of two lines or more by its first row, and a one-line claim by its line', () => {
    const [several, oneCode] = catalogs();
    expect(lookupFact(oneCode, 'claim.1.expected')).toMatchObject({ found: { value: '20000', rows: [1, 2] } });
    expect(lookupFact(oneCode, 'claim.2.expected')).toEqual({ problem: 'fact_not_canonical', canonical: 'claim.1.expected' });
    expect(lookupFact(oneCode, 'lines.1+2.expected')).toEqual({ problem: 'fact_not_canonical', canonical: 'claim.1.expected' });
    expect(lookupFact(oneCode, 'claim.3.expected')).toEqual({ problem: 'fact_not_canonical', canonical: 'line.3.expected' });
    expect(lookupFact(several, 'claim.6.paid')).toEqual({ problem: 'fact_not_canonical', canonical: 'claim.5.paid' });
    expect(lookupFact(several, 'claim.3.paid')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.g0283.paid' });
    expect(lookupFact(several, 'claim.3.lines')).toEqual({ problem: 'fact_not_canonical', canonical: 'code.g0283.lines' });
    expect(lookupFact(oneCode, 'claim.3.lines')).toEqual({ problem: 'unknown_fact' });
    expect(canonicalFactId(oneCode, [2, 1], 'units')).toBe('claim.1.units');
    const whole = of(assemblePacket(assemblyInput({ lines: [line(1, { claimId: 'c' }), line(2, { claimId: 'c' })] })));
    expect(ids(whole).filter((id) => id.startsWith('claim.'))).toEqual([]);
    expect(lookupFact(whole, 'claim.1.paid')).toEqual({ problem: 'fact_not_canonical', canonical: 'pattern.paid' });
  });

  it('names one row by its line, and any other set by its rows ascending', () => {
    const [several] = catalogs();
    expect(lookupFact(several, 'lines.4.expected')).toEqual({ problem: 'fact_not_canonical', canonical: 'line.4.expected' });
    expect(lookupFact(several, 'lines.4.service_dates')).toEqual({ problem: 'fact_not_canonical', canonical: 'line.4.service_date' });
    expect(lookupFact(several, 'lines.2+1.units')).toEqual({ problem: 'fact_not_canonical', canonical: 'lines.1+2.units' });
    expect(lookupFact(several, 'lines.1+1+2.units')).toEqual({ problem: 'fact_not_canonical', canonical: 'lines.1+2.units' });
    expect(canonicalFactId(several, [2, 1, 1], 'units')).toBe('lines.1+2.units');
    expect(canonicalFactId(several, [3], 'paid_on' as never)).toBeNull();
    expect(canonicalFactId(several, [], 'paid')).toBeNull();
    expect(canonicalFactId(several, [], 'units')).toBeNull();
    expect(canonicalFactId(several, [7], 'paid')).toBeNull();
    expect(canonicalFactId(several, [0, 1], 'paid')).toBeNull();
    expect(canonicalFactId(several, [1, 2], 'lines')).toBeNull();
    expect(canonicalFactId(several, [1], 'code')).toBe('line.1.code');
    expect(canonicalFactId(several, [1, 2], 'code')).toBeNull();
    expect(canonicalFactId(several, [1, 2, 4], 'code')).toBe('code.97110');
    expect(canonicalFactId(several, [3], 'modifiers')).toBe('code.g0283.modifiers');
    expect(canonicalFactId(several, [1], 'modifiers')).toBeNull();
    expect(canonicalFactId(several, [6], 'code')).toBeNull();
  });

  it('knows no fact of a row, a measure or a subject the content lacks, nor any id outside the grammar', () => {
    const [several] = catalogs();
    for (const id of [
      'line.7.paid',
      'line.0.paid',
      'line.01.paid',
      'line.1.lines',
      'line.1.rate',
      'lines.1+7.paid',
      'lines.1+2.lines',
      'lines.1+2.claims',
      'lines.1+x.paid',
      'lines.1++2.paid',
      'claim.7.paid',
      'claim.1.claims',
      'pattern.rate',
      'pattern.expected_each',
      'pattern.units_each',
      'contract.percent.1',
      'release.no.2',
      'release.no.0',
      'citation.reference',
      'packet.date',
      'nothing',
      'Pattern.paid',
      '',
      `pattern.${'a'.repeat(100)}`,
    ]) {
      expect(lookupFact(several, id), id).toEqual({ problem: 'unknown_fact' });
    }
  });
});

describe('the conditional ids', () => {
  const rate = (citation: Parameters<typeof assemblyInput>[0]) => of(assemblePacket(assemblyInput(citation))).byId.get('contract.rate');

  it('states the contract’s one rate for a fixed schedule, per visit, or a lesser-of rule’s fixed schedule, in whole cents', () => {
    expect(rate({})).toMatchObject({ value: '5000', scope: 'unit', phrase: 'contract.rate.FIXED_SCHEDULE' });
    expect(rate({ citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' } }) })).toMatchObject({ value: '9000', scope: 'visit', phrase: 'contract.rate.PER_VISIT', paths: [['citation', 'parameters', 'amount_cents']] });
    expect(rate({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '6000' } } }) })).toMatchObject({
      value: '6000',
      scope: 'unit',
      phrase: 'contract.rate.LESSER_OF',
      paths: [['citation', 'parameters', 'schedule', 'amount_cents']],
    });
    expect(rate({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percent: '110' } } }) })).toBeUndefined();
    expect(rate({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percent: '110' } }) })).toBeUndefined();
    expect(rate({ citation: contractCitation({ parameters: { amount_cents: '5000.5' } }) })).toBeUndefined();
    expect(rate({ citation: REGULATION })).toBeUndefined();
  });

  it('numbers each percentage, locked year and rule release from one, in content order', () => {
    const catalog = of(FACT_CONTENTS.percent());
    expect(catalog.byId.get('contract.percent.1')).toMatchObject({ value: '112.5', kind: 'percent', paths: [['pattern', 'contract_percentages', 0]] });
    expect(catalog.byId.get('contract.year.1')).toMatchObject({ value: 2025, kind: 'year', paths: [['pattern', 'contract_years', 0]] });
    expect(catalog.byId.get('release.no.2')).toMatchObject({ value: 900002, paths: [['rule_releases', 1, 'release_no']] });
    expect(lookupFact(catalog, 'contract.percent.2')).toEqual({ problem: 'unknown_fact' });
  });

  it('states the regulation by its reference and statement, and a contract by its version, page, dates and clause', () => {
    const regulation = of(FACT_CONTENTS.regulation());
    expect(regulation.byId.get('citation.reference')).toMatchObject({ value: '42 CFR 422.214', kind: 'reference', paths: [['citation', 'reference']] });
    expect(regulation.byId.get('citation.quote')).toMatchObject({ value: REGULATION.statement, paths: [['citation', 'statement']] });
    for (const id of ['citation.version', 'citation.page', 'citation.effective', 'contract.rate']) expect(lookupFact(regulation, id), id).toEqual({ problem: 'unknown_fact' });
    const contract = of(FACT_CONTENTS.perVisit());
    expect(contract.byId.get('citation.effective')).toMatchObject({ value: { from: '2026-01-01', to: '2026-12-31' }, paths: [['citation', 'effective_from'], ['citation', 'effective_to']], phrase: 'citation.effective' });
    expect(contract.byId.get('citation.version')?.value).toBe(3);
    expect(contract.byId.get('citation.page')?.value).toBe(14);
    expect(lookupFact(contract, 'citation.reference')).toEqual({ problem: 'unknown_fact' });
  });

  it('holds no quote with a brace, so a rendered text never holds a token', () => {
    expect(lookupFact(of(assemblePacket(assemblyInput({ citation: contractCitation({ quote: 'pays {{fact:pattern.paid}}' }) }))), 'citation.quote')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(assemblePacket(assemblyInput({ citation: contractCitation({ quote: 'pays {50.00}' }) }))), 'citation.quote')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(assemblePacket(assemblyInput({ citation: contractCitation({ quote: 'pays } 50.00' }) }))), 'citation.quote')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(assemblePacket(assemblyInput({ citation: { ...REGULATION, reference: '42 CFR {422}' } }))), 'citation.reference')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(assemblePacket(assemblyInput({ citation: { ...REGULATION, statement: 'pays {all}' } }))), 'citation.quote')).toEqual({ problem: 'unknown_fact' });
  });

  it('states no first-level window above the first level, and the window’s days and page only where every clause states one', () => {
    const above = of(FACT_CONTENTS.perVisit());
    expect(lookupFact(above, 'line.1.window_ends_on')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(above, 'deadline.window_days')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(above, 'deadline.window_page')).toEqual({ problem: 'unknown_fact' });
    expect(above.byId.get('deadline.ends_on')?.value).toBe('2027-01-15');
    const alike = of(FACT_CONTENTS.lesserOf());
    expect(alike.byId.get('deadline.window_days')?.value).toBe(3650);
    expect(alike.byId.get('deadline.window_page')?.value).toBe(1);
    const different = of(assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ page: 3 }), contractWindowSource({ contract_version_id: 'v2', days: 180, page: 4 })] })));
    expect(lookupFact(different, 'deadline.window_days')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(different, 'deadline.window_page')).toEqual({ problem: 'unknown_fact' });
    const second = of(assemblePacket(assemblyInput({ deadlineSources: [{ kind: 'release_record', release_no: 900001, sha256: 'a'.repeat(64), program: null, level: 'L2' }, contractWindowSource({ days: 90, page: 6 })] })));
    expect(second.byId.get('deadline.window_days')).toMatchObject({ value: 90, paths: [['deadline', 'sources', 0, 'days']] });
    expect(second.byId.get('deadline.window_page')).toMatchObject({ value: 6, paths: [['deadline', 'sources', 0, 'page']] });
    const none = of(assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ days: null })] })));
    expect(lookupFact(none, 'deadline.window_days')).toEqual({ problem: 'unknown_fact' });
    const noDeadline = of(assemblePacket(assemblyInput({ lines: [line(1, { windowEndsOn: null, deadline: { status: 'unverified', source: null, endsOn: null, cause: null } })] })));
    expect(lookupFact(noDeadline, 'deadline.ends_on')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(noDeadline, 'line.1.window_ends_on')).toEqual({ problem: 'unknown_fact' });
  });

  it('states interest only where code computed it above zero', () => {
    const stated = of(FACT_CONTENTS.severalCodes());
    expect(stated.byId.get('interest.total')).toMatchObject({ kind: 'amount', role: 'interest', scope: 'total', rows: [1, 2, 3, 4, 5, 6], paths: [['interest', 'total_cents']] });
    expect(stated.byId.get('interest.rate')).toMatchObject({ value: '9', paths: [['interest', 'annual_rate_percent']] });
    expect(stated.byId.get('interest.days_to_pay')?.value).toBe(33);
    expect(stated.byId.get('interest.release')?.value).toBe(900001);
    const unstated = of(FACT_CONTENTS.regulation());
    for (const id of ['interest.total', 'interest.rate', 'interest.days_to_pay', 'interest.release']) expect(lookupFact(unstated, id), id).toEqual({ problem: 'unknown_fact' });
    const unknownRate = of(assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) }, lines: [line(1, { receivedOn: '2026-02-10' })] })));
    expect(lookupFact(unknownRate, 'interest.rate')).toEqual({ problem: 'unknown_fact' });
  });

  it('states a received date where the line has one, and no patient’s share not on record or in a tp-packet/1 version', () => {
    expect(lookupFact(of(FACT_CONTENTS.base()), 'line.1.received_on')).toEqual({ problem: 'unknown_fact' });
    expect(of(FACT_CONTENTS.severalCodes()).byId.get('line.1.received_on')).toMatchObject({ value: '2026-02-10', role: 'received_date', paths: [['lines', 0, 'received_on']] });
    const v1 = of(FACT_CONTENTS.v1());
    for (const id of ['pattern.patient_share', 'line.1.patient_share', 'pattern.patient_share_each', 'deadline.ends_on', 'lines.1+2.patient_share']) expect(lookupFact(v1, id), id).toEqual({ problem: 'unknown_fact' });
    expect(v1.byId.get('line.1.window_ends_on')?.value).toBe('2036-04-05');
    const share = (patient: string | null) => ({ calculation: { method: 'FIXED_SCHEDULE', release_no: 900001, steps: [], rounding: null, observed_basis: 'paid_plus_pr', patient_share_cents: patient, trace_sha256: 'a'.repeat(64) } });
    const missing = of(assemblePacket(assemblyInput({ lines: [line(1, share(null)), line(2, share('1400')), line(3, share('1400'))] })));
    expect(lookupFact(missing, 'pattern.patient_share')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(missing, 'pattern.patient_share_each')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(missing, 'line.1.patient_share')).toEqual({ problem: 'unknown_fact' });
    expect(missing.byId.get('line.2.patient_share')?.value).toBe('1400');
    expect(value(missing, 'lines.2+3.patient_share')).toBe('2800');
    expect(value(missing, 'lines.1+2.patient_share')).toBe('unknown_fact');
  });

  it('states a value per line only where every line of two or more holds the same one', () => {
    const differ = of(FACT_CONTENTS.oneCode());
    for (const id of ['pattern.expected_each', 'pattern.allowed_each', 'pattern.paid_each', 'pattern.variance_each', 'pattern.units_each', 'pattern.patient_share_each']) expect(lookupFact(differ, id), id).toEqual({ problem: 'unknown_fact' });
    const one = of(FACT_CONTENTS.oneLine());
    expect(ids(one).filter((id) => id.endsWith('_each'))).toEqual([]);
  });
});

describe('summedValue', () => {
  it('sums a set of rows in bigint cents and decimal units, and states nothing it cannot sum exactly', () => {
    const content = FACT_CONTENTS.severalCodes();
    expect(summedValue(content, [1, 2, 4], 'expected')).toBe('32500');
    expect(summedValue(content, [1, 2, 3, 4, 5, 6], 'variance')).toBe(content.pattern.variance_cents);
    expect(summedValue(content, [2, 3], 'units')).toBe('2.5');
    expect(summedValue(content, [1, 2], 'lines')).toBe(2);
    expect(summedValue(content, [6, 1], 'service_dates')).toEqual({ from: '2026-03-02', to: '2026-03-10' });
    expect(summedValue(content, [], 'paid')).toBeNull();
    expect(summedValue(content, [], 'units')).toBeNull();
    expect(summedValue(content, [9], 'paid')).toBeNull();
    expect(summedValue(FACT_CONTENTS.v1(), [1, 2], 'patient_share')).toBeNull();
    const large = assemblePacket(assemblyInput({ lines: [line(1, { expectedCents: 900_719_925_474_099_300n as never, observedCents: 1n as never, varianceCents: 900_719_925_474_099_299n as never }), line(2, { expectedCents: 900_719_925_474_099_300n as never, observedCents: 1n as never, varianceCents: 900_719_925_474_099_299n as never })] }));
    expect(summedValue(large, [1, 2], 'expected')).toBe('1801439850948198600');
  });

  it('refuses an amount that is not whole cents', () => {
    const content = FACT_CONTENTS.base();
    const fractional: PacketContent = { ...content, lines: content.lines.map((item, index) => (index === 0 ? { ...item, paid_cents: '5600.5' } : item)) };
    expect(summedValue(fractional, [1, 2], 'paid')).toBeNull();
    expect(summedValue(fractional, [2, 3], 'paid')).toBe('11200');
    expect(lookupFact(of(fractional), 'pattern.paid')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(fractional), 'line.1.paid')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(fractional), 'pattern.paid_each')).toEqual({ problem: 'unknown_fact' });
    const stored: PacketContent = { ...content, pattern: { ...content.pattern, expected_cents: '30000.5', lines: 7 / 2 } };
    expect(lookupFact(of(stored), 'pattern.expected')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(of(stored), 'pattern.lines')).toEqual({ problem: 'unknown_fact' });
  });
});

describe('rowFacts', () => {
  it('states each row’s own units, amounts and dates its line does not name canonically, and nothing the catalog lists', () => {
    const one = of(FACT_CONTENTS.oneLine());
    expect(rowFacts(one).map((entry) => entry.id)).toEqual(['line.1.units', 'line.1.expected', 'line.1.allowed', 'line.1.paid', 'line.1.variance', 'line.1.patient_share', 'line.1.service_date']);
    expect(rowFacts(one)[1]).toEqual({
      id: 'line.1.expected',
      subject: 'line',
      measure: 'expected',
      kind: 'amount',
      role: 'expected',
      scope: 'part',
      rows: [1],
      value: '10000',
      paths: [['lines', 0, 'expected_cents']],
      summed: false,
      phrase: 'line.expected',
      model: false,
    });
    const several = of(FACT_CONTENTS.severalCodes());
    expect(rowFacts(several).map((entry) => entry.id)).toEqual([
      ...['units', 'expected', 'allowed', 'paid', 'variance', 'patient_share', 'service_date'].map((measure) => `line.3.${measure}`),
      ...['units', 'expected', 'allowed', 'paid', 'variance', 'patient_share', 'service_date'].map((measure) => `line.5.${measure}`),
    ]);
    expect(rowFacts(of(FACT_CONTENTS.base()))).toEqual([]);
  });
});

describe('the catalog’s edges', () => {
  it('names a code’s alike modifiers over every line of a one-code pattern by the code', () => {
    const alike = of(assemblePacket(assemblyInput({ lines: [line(1, { modifiers: ['GP'] }), line(2, { modifiers: ['GP'] }), line(3, { modifiers: ['GP'] })] })));
    expect(canonicalFactId(alike, [3, 1, 2], 'modifiers')).toBe('code.97110.modifiers');
    expect(canonicalFactId(alike, [1, 2, 3], 'code')).toBe('code.97110');
    const differ = of(assemblePacket(assemblyInput({ lines: [line(1, { modifiers: ['GP'] }), line(2, { modifiers: ['59'] }), line(3, { modifiers: ['GP'] })] })));
    expect(lookupFact(differ, 'code.97110.modifiers')).toEqual({ problem: 'unknown_fact' });
    expect(differ.byId.get('line.2.modifiers')).toEqual({
      id: 'line.2.modifiers',
      subject: 'line',
      measure: 'modifiers',
      kind: 'modifiers',
      role: null,
      scope: 'part',
      rows: [2],
      value: ['59'],
      paths: [['lines', 1, 'modifiers']],
      summed: false,
      phrase: 'line.modifiers',
      model: false,
    });
    expect(differ.byId.get('line.3.code')).toEqual({ id: 'line.3.code', subject: 'line', measure: 'code', kind: 'code', role: null, scope: 'part', rows: [3], value: '97110', paths: [['lines', 2, 'procedure_code']], summed: false, phrase: 'line.code', model: false });
  });

  it('reads each summed measure in each row at its field', () => {
    const catalog = of(FACT_CONTENTS.severalCodes());
    const paths = (id: string) => {
      const found = lookupFact(catalog, id);
      return 'found' in found ? found.found.paths : found.problem;
    };
    expect(paths('lines.1+2.units')).toEqual([['lines', '#', 'units']]);
    expect(paths('lines.1+2.service_dates')).toEqual([['lines', '#', 'service_date'], ['lines', '#', 'service_date']]);
    expect(paths('lines.1+2.patient_share')).toEqual([['lines', '#', 'calculation', 'patient_share_cents']]);
    expect(paths('lines.1+2.allowed')).toEqual([['lines', '#', 'observed_cents']]);
    expect(paths('claim.5.lines')).toEqual([['lines']]);
    expect(paths('claim.5.service_dates')).toEqual([['lines', '#', 'service_date'], ['lines', '#', 'service_date']]);
    expect(paths('line.2.units')).toEqual([['lines', 1, 'units']]);
    expect(paths('line.2.service_date')).toEqual([['lines', 1, 'service_date']]);
    expect(paths('interest.days_to_pay')).toEqual([['interest', 'days_to_pay']]);
    expect(paths('interest.release')).toEqual([['interest', 'release_no']]);
    expect(paths('interest.total')).toEqual([['interest', 'total_cents']]);
    expect(summedValue(FACT_CONTENTS.severalCodes(), [1, 9], 'paid')).toBeNull();
  });

  it('states no code total its summary does not hold in whole cents or whole lines', () => {
    const content = FACT_CONTENTS.severalCodes();
    const codes = content.pattern.codes.map((code) => (code.procedure_code === 'G0283' ? { ...code, expected_cents: '2500.5', lines: 3 / 2, units: '1.0' } : code));
    const catalog = of({ ...content, pattern: { ...content.pattern, codes } });
    expect(lookupFact(catalog, 'code.g0283.expected')).toEqual({ problem: 'unknown_fact' });
    expect(lookupFact(catalog, 'code.g0283.lines')).toEqual({ problem: 'unknown_fact' });
    expect(catalog.byId.get('code.g0283.units')?.value).toBe('1');
    expect(catalog.byId.get('code.g0283.allowed')?.value).toBe('1000');
  });

  it('states interest over the lines it is stated on alone', () => {
    const content = assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() }, lines: [line(1, { receivedOn: '2026-02-10' }), line(2), line(3, { receivedOn: '2026-02-10' })] }));
    expect(of(content).byId.get('interest.total')?.rows).toEqual([1, 3]);
  });

  it('knows no id with anything before or after its grammar’s parts, a row written with a leading zero, or a count of a set of rows', () => {
    const catalog = of(FACT_CONTENTS.severalCodes());
    for (const id of ['xlines.1+2.units', 'lines.1+2.units.x', 'xclaim.5.paid', 'claim.5.paid.x', 'xcode.g0283.paid', 'code.g0283.paid.x', 'xline.1.paid', 'line.1.paid.x', 'claim.05.paid', 'claim.x.paid', 'lines.01+2.units', 'lines.1+2+4.lines', `lines.${'1+'.repeat(45)}2.units`]) {
      expect(lookupFact(catalog, id), id).toEqual({ problem: 'unknown_fact' });
    }
    expect(lookupFact(catalog, `lines.${'1+'.repeat(40)}2.units`)).toEqual({ problem: 'fact_not_canonical', canonical: 'lines.1+2.units' });
    expect(lookupFact(catalog, 'line.1.service_dates')).toEqual({ problem: 'fact_not_canonical', canonical: 'line.1.service_date' });
  });

  it('orders rows as numbers, past nine', () => {
    const lines = Array.from({ length: 11 }, (_unused, index) => line(index + 1, { serviceDate: `2026-03-${String(index + 1).padStart(2, '0')}`, claimId: `claim-${String(index + 1)}`, units: index === 9 ? '3' : '2' }));
    const catalog = of(assemblePacket(assemblyInput({ lines })));
    expect(catalog.byId.get('line.10.units')?.value).toBe('3');
    expect(lookupFact(catalog, 'lines.2+10.units')).toMatchObject({ found: { value: '5', rows: [2, 10] } });
    expect(lookupFact(catalog, 'lines.10+2.units')).toEqual({ problem: 'fact_not_canonical', canonical: 'lines.2+10.units' });
    expect(canonicalFactId(catalog, [10, 2], 'units')).toBe('lines.2+10.units');
    expect(lookupFact(catalog, 'claim.10.units')).toEqual({ problem: 'fact_not_canonical', canonical: 'line.10.units' });
    expect(lookupFact(catalog, 'line.11.paid')).toMatchObject({ found: { rows: [11] } });
    expect(lookupFact(catalog, 'line.12.paid')).toEqual({ problem: 'unknown_fact' });
  });
});
