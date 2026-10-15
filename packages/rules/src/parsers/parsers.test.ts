import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeSourceText } from '../records';
import { compareConversionFactorPasses } from './conversion-factor';
import { RuleImportError, dateCell, dayBefore, decimalCell, parseDelimited, textLines } from './delimited';
import { PARSERS } from './index';
import { IMPORTABLE_TYPES, type ImportWindow, type ImportableType, type ParsedRow, isImportableType } from './types';

const CMS = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic/cms');
const YEAR: ImportWindow = { year: 2026, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' };

function fixture(file: string): string {
  return decodeSourceText(readFileSync(path.join(CMS, file)));
}

function parse(type: ImportableType, text: string, window: ImportWindow = YEAR) {
  return PARSERS[type].parse(text, window);
}

function byKey(rows: readonly ParsedRow[]): Map<string, ParsedRow> {
  return new Map(rows.map((row) => [Object.values(row.key).join('|'), row]));
}

describe('parseDelimited', () => {
  it('splits CSV rows and keeps each raw row', () => {
    const rows = parseDelimited('a,b,c\r\n1,"two, 2","say ""hi"""\n', ',');
    expect(rows.map((row) => row.cells)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, 2', 'say "hi"'],
    ]);
    expect(rows.map((row) => row.raw)).toEqual(['a,b,c', '1,"two, 2","say ""hi"""']);
    expect(rows.map((row) => row.line)).toEqual([1, 2]);
  });

  it('keeps line breaks inside quotes in one row and counts lines', () => {
    const rows = parseDelimited('x,"one\ntwo"\ny,z', ',');
    expect(rows).toEqual([
      { cells: ['x', 'one\ntwo'], raw: 'x,"one\ntwo"', line: 1 },
      { cells: ['y', 'z'], raw: 'y,z', line: 3 },
    ]);
  });

  it('reads tab-separated text, empty cells and a missing final newline', () => {
    expect(parseDelimited('a\t\tc', '\t')[0]?.cells).toEqual(['a', '', 'c']);
    expect(parseDelimited('', ',')).toEqual([]);
  });

  it('refuses a quote that is never closed', () => {
    expect(() => parseDelimited('a,"b\nc', ',')).toThrow(RuleImportError);
  });

  it('treats a quote inside an unquoted field as text', () => {
    expect(parseDelimited('5" wide,x', ',')[0]?.cells).toEqual(['5" wide', 'x']);
  });
});

describe('cell helpers', () => {
  const row = (...cells: string[]) => ({ cells, raw: cells.join(','), line: 7 });

  it('completes decimals written with a bare point and refuses anything else', () => {
    expect(decimalCell(row('.45'), 0, 'x')).toBe('0.45');
    expect(decimalCell(row('12.'), 0, 'x')).toBe('12');
    expect(decimalCell(row(' 1.000 '), 0, 'x')).toBe('1.000');
    expect(() => decimalCell(row('1e3'), 0, 'x')).toThrow('line 7: x "1e3" is not a decimal');
    expect(() => decimalCell(row(''), 0, 'x')).toThrow(RuleImportError);
    expect(() => decimalCell(row('-1'), 0, 'x')).toThrow(RuleImportError);
  });

  it('reads the three date forms the files use', () => {
    expect(dateCell(row('20260101'), 0, 'd')).toBe('2026-01-01');
    expect(dateCell(row('2026-01-01'), 0, 'd')).toBe('2026-01-01');
    expect(dateCell(row('3/1/2025'), 0, 'd')).toBe('2025-03-01');
    expect(dateCell(row(''), 0, 'd')).toBeNull();
    expect(() => dateCell(row('Jan 1'), 0, 'd')).toThrow(RuleImportError);
  });

  it('finds the day before a date, across months and leap days', () => {
    expect(dayBefore('2026-07-01')).toBe('2026-06-30');
    expect(dayBefore('2024-03-01')).toBe('2024-02-29');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  });

  it('splits fixed-width text into lines', () => {
    expect(textLines('a\r\nb\n').map((line) => [line.raw, line.line])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});

describe('PPRRVU (pfs_rvu)', () => {
  const text = fixture('PPRRVU_SYNTHETIC.csv');

  it('reads every code with its relative values, joining the stacked headings', () => {
    const { rows } = parse('pfs_rvu', text);
    expect(rows).toHaveLength(12);
    const first = rows[0];
    expect(first).toMatchObject({
      key: { hcpcs: '97110', modifier: '' },
      value: {
        status: 'A',
        work_rvu: '0.31',
        pe_rvu_non_facility: '0.71',
        pe_rvu_facility: '0.21',
        mp_rvu: '0.11',
        non_facility_pe_na: false,
        facility_pe_na: false,
        pctc_indicator: '0',
        global_days: 'XXX',
        multiple_procedure_indicator: '5',
      },
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      locator: 'line 5',
    });
    expect(text).toContain(`${first?.quote ?? ''}\r\n`);
    expect(byKey(rows).get('97026|')?.value).toMatchObject({ facility_pe_na: true, pe_rvu_facility: '0.00' });
    expect(byKey(rows).get('G0283|')?.value).toMatchObject({ facility_pe_na: true, multiple_procedure_indicator: '5' });
  });

  it('takes the window it is given', () => {
    const { rows } = parse('pfs_rvu', text, { year: 2026, effectiveFrom: '2026-04-01', effectiveTo: null });
    expect(rows[0]).toMatchObject({ effective_from: '2026-04-01', effective_to: null });
  });

  it('reads headings written on one row too', () => {
    const lines = text.split('\r\n');
    const oneRow = lines[3]?.replace('WORK RVU,PE RVU,NA INDICATOR,PE RVU,NA INDICATOR,MP RVU,TOTAL,TOTAL', 'WORK RVU,NON-FAC PE RVU,NON-FAC NA INDICATOR,FACILITY PE RVU,FACILITY NA INDICATOR,MP RVU,NON-FACILITY TOTAL,FACILITY TOTAL');
    const changed = [lines[0], lines[1], oneRow, ...lines.slice(4)].join('\r\n');
    expect(parse('pfs_rvu', changed).rows).toHaveLength(12);
  });

  it('stops when a heading does not match the documented layout', () => {
    const swapped = text.replace('WORK RVU,PE RVU', 'PE RVU,WORK RVU');
    expect(() => parse('pfs_rvu', swapped)).toThrow(/column 6 is headed .* not the work RVU; the PPRRVU layout may have changed/);
  });

  it.each([
    ['no heading row', 'just,text\n', /no heading row starting with HCPCS/],
    ['a heading but no codes', 'HCPCS,MOD,DESCRIPTION,STATUS CODE,X,WORK RVU,NON-FAC PE RVU,NON-FAC NA INDICATOR,FACILITY PE RVU,FACILITY NA INDICATOR,MP RVU,X,X,PCTC,GLOB DAYS,X,X,X,MULT PROC\n', /no codes/],
  ])('refuses a file with %s', (_name, input, message) => {
    expect(() => parse('pfs_rvu', input)).toThrow(message);
  });

  it.each([
    ['a short code', (line: string) => line.replace(/^97110/, '9711'), /line 5: HCPCS "9711"/],
    ['a bad modifier', (line: string) => line.replace(/^97110,/, '97110,G,'), /line 5: modifier "G"/],
    ['a bad status', (line: string) => line.replace(',A,', ',AA,'), /line 5: status code "AA"/],
    ['a bad RVU', (line: string) => line.replace(',0.31,', ',n/a,'), /line 5: work RVU "n\/a" is not a decimal/],
    ['a bad NA indicator', (line: string) => line.replace(',0.71,,', ',0.71,X,'), /line 5: non-facility NA indicator "X"/],
  ])('refuses a row with %s', (_name, change, message) => {
    const lines = text.split('\r\n');
    lines[4] = change(lines[4] ?? '');
    expect(() => parse('pfs_rvu', lines.join('\r\n'))).toThrow(message);
  });

  it('refuses a code that appears twice', () => {
    const lines = text.split('\r\n');
    expect(() => parse('pfs_rvu', [...lines.slice(0, 5), lines[4], ...lines.slice(5)].join('\r\n'))).toThrow(/line 6: HCPCS 97110 with modifier "" appears twice/);
  });
});

describe('GPCI (pfs_gpci)', () => {
  const text = fixture('GPCI_SYNTHETIC.csv');

  it('reads the locality and ends the table at the footnote', () => {
    const outcome = parse('pfs_gpci', text);
    expect(outcome.rows).toEqual([
      {
        key: { carrier: '99999', locality: '01' },
        value: { state: 'ZZ', locality_name: 'SYNTHETIC LOCALITY ONE', work_gpci: '1.000', pe_gpci: '0.950', mp_gpci: '0.650' },
        effective_from: '2026-01-01',
        effective_to: '2026-12-31',
        quote: '99999,ZZ,01,SYNTHETIC LOCALITY ONE,1.000,0.950,0.650',
        locator: 'line 3',
      },
    ]);
    expect(outcome.notes).toEqual(['notes after the table (from line 4) were not read as localities']);
  });

  it('pads a one-digit locality', () => {
    expect(parse('pfs_gpci', text.replace(',01,', ',1,')).rows[0]?.key).toEqual({ carrier: '99999', locality: '01' });
  });

  it.each([
    ['no heading', 'a,b\n1,2\n', /no header row found/],
    ['no PE column', text.replace('2026 PE GPCI', '2026 PX'), /no practice-expense GPCI column/],
    ['a bad MAC with indices', text.replace('99999,ZZ', '9999,ZZ'), /line 3: MAC "9999"/],
    ['a bad locality', text.replace(',01,', ',A1,'), /line 3: locality "A1"/],
    ['a bad index', text.replace(',0.950,', ',high,'), /line 3: PE GPCI "high" is not a decimal/],
    ['a locality after the notes', `${text}99999,ZZ,02,SYNTHETIC LOCALITY TWO,1.000,1.000,1.000\n`, /line 5: a locality row after the notes/],
    ['a locality twice', text.replace('* SYNTHETIC', '99999,ZZ,01,AGAIN,1,1,1\n* SYNTHETIC'), /line 4: MAC 99999 locality 01 appears twice/],
    ['no localities', text.split('\n').slice(0, 2).join('\n'), /no localities/],
  ])('refuses a file with %s', (_name, input, message) => {
    expect(() => parse('pfs_gpci', input)).toThrow(message);
  });
});

describe('ZIP5 (locality_map)', () => {
  const text = fixture('ZIP5_SYNTHETIC.txt');

  it('reads each ZIP by position', () => {
    const { rows } = parse('locality_map', text);
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      [{ zip: '00011' }, { state: 'ZZ', carrier: '99999', locality: '01', rural_indicator: '', plus_four_required: false }],
      [{ zip: '00012' }, { state: 'ZZ', carrier: '99999', locality: '01', rural_indicator: 'R', plus_four_required: true }],
    ]);
    expect(rows[0]?.quote).toHaveLength(80);
  });

  it('reads a short line without the optional positions', () => {
    expect(parse('locality_map', 'ZZ000119999901\n').rows[0]?.value).toEqual({
      state: 'ZZ',
      carrier: '99999',
      locality: '01',
      rural_indicator: null,
      plus_four_required: null,
    });
  });

  it.each([
    ['a short line', 'ZZ0001199999\n', /line 1: 12 characters is too short/],
    ['letters in the ZIP', 'ZZ0001A9999901\n', /line 1: does not fit the ZIP5 layout/],
    ['a bad rural indicator', 'ZZ000119999901X\n', /rural indicator "X"/],
    ['a bad plus-four flag', 'ZZ000119999901 01   7\n', /plus-four flag "7"/],
    ['a ZIP twice', 'ZZ000119999901\nZZ000119999902\n', /line 2: ZIP 00011 appears twice/],
    ['nothing', '\n\n', /no ZIP codes/],
  ])('refuses %s', (_name, input, message) => {
    expect(() => parse('locality_map', input)).toThrow(message);
  });
});

describe('conversion factors', () => {
  const first = fixture('conversion-factor-SYNTHETIC-pass-1.csv');
  const second = fixture('conversion-factor-SYNTHETIC-pass-2.csv');

  it('reads each factor with its window, citation and final-rule quote', () => {
    const { rows } = parse('conversion_factor', first);
    expect(rows.map((row) => [row.key, row.value, row.effective_from, row.effective_to])).toEqual([
      [{ applicability: 'non_qualifying_apm' }, { conversion_factor: '20.0000', citation: 'SYNTHETIC final rule page 1' }, '2026-01-01', '2026-12-31'],
      [{ applicability: 'qualifying_apm' }, { conversion_factor: '20.1000', citation: 'SYNTHETIC final rule page 1' }, '2026-01-01', '2026-12-31'],
    ]);
    expect(rows[1]?.note).toBe('Final rule (SYNTHETIC final rule page 1): "SYNTHETIC: the conversion factor for qualifying APM participants is $20.1000."');
  });

  it('agrees with its second preparation, and names any difference', () => {
    expect(compareConversionFactorPasses(parse('conversion_factor', first).rows, parse('conversion_factor', second).rows)).toEqual([]);
    const typo = parse('conversion_factor', second.replace('20.1000,2026', '21.1000,2026').replace('is $20.1000', 'is $21.1000')).rows;
    expect(compareConversionFactorPasses(parse('conversion_factor', first).rows, typo)).toEqual([
      'only in the first pass: qualifying_apm 20.1000 from 2026-01-01 to 2026-12-31',
      'only in the second pass: qualifying_apm 21.1000 from 2026-01-01 to 2026-12-31',
    ]);
  });

  it.each([
    ['other headings', first.replace('citation,quote', 'source,quote'), /the headings must be exactly/],
    ['an unknown applicability', first.replace('non_qualifying_apm,', 'everyone,'), /applicability "everyone"/],
    ['a factor missing from its quote', first.replace('is $20.0000', 'is $20.00'), /the quote does not contain the factor 20.0000/],
    ['a start in another year', first.replace('20.0000,2026-01-01', '20.0000,2025-01-01'), /effective_from 2025-01-01 is not in 2026/],
    ['no start', first.replace('20.0000,2026-01-01', '20.0000,'), /effective_from is required/],
    ['no citation', first.replace('SYNTHETIC final rule page 1,"SYNTHETIC: the conversion factor for clinicians', ',"SYNTHETIC: the conversion factor for clinicians'), /citation and the final rule's quote are required/],
    ['no rows', first.split('\n').slice(0, 2).join('\n'), /no conversion factors/],
  ])('refuses a file with %s', (_name, input, message) => {
    expect(() => parse('conversion_factor', input)).toThrow(message);
  });

  it('leaves an open end open', () => {
    expect(parse('conversion_factor', first.replace('2026-01-01,2026-12-31,SYNTHETIC final rule page 1,"SYNTHETIC: the conversion factor for clinicians', '2026-01-01,,SYNTHETIC final rule page 1,"SYNTHETIC: the conversion factor for clinicians')).rows[0]?.effective_to).toBeNull();
  });
});

describe('therapy MPPR rate file (mppr_rate)', () => {
  const text = fixture('MPPR_SYNTHETIC.csv');

  it('reads one record per code, folding repeats', () => {
    const outcome = parse('mppr_rate', text);
    expect(outcome.rows.map((row) => row.key.hcpcs)).toEqual(['97110', '97112', '97116', '97140', '97530', '97026', '97035', 'G0283']);
    expect(outcome.rows[0]).toMatchObject({ key: { hcpcs: '97110', modifier: '' }, value: { pe_reduction_percent: '40' }, locator: 'line 3' });
    expect(outcome.notes).toEqual(['1 row(s) repeated a code already read (for example one row per locality) and were folded into its record']);
  });

  it('reads a file with only a code column as codes under the general reduction', () => {
    const outcome = parse('mppr_rate', 'HCPCS\n97110\n97112\n');
    expect(outcome.rows.map((row) => row.value)).toEqual([{ pe_reduction_percent: null }, { pe_reduction_percent: null }]);
    expect(outcome.notes).toEqual([]);
    expect(parse('mppr_rate', 'CPT,REDUCTION %\n97110,50%\n97112,\n').rows.map((row) => row.value.pe_reduction_percent)).toEqual(['50', null]);
  });

  it.each([
    ['no code column', 'CODE,X\n97110,1\n', /no header row found/],
    ['a bad code', 'HCPCS\n9711\n', /line 2: "9711" is not an HCPCS code/],
    ['a bad modifier', 'HCPCS,MOD\n97110,XYZ\n', /line 2: modifier "XYZ"/],
    ['a bad share', 'HCPCS,PE REDUCTION PERCENT\n97110,half\n', /line 2: reduction share "half"/],
    ['repeats that disagree', 'HCPCS,PE REDUCTION PERCENT\n97110,50\n97110,40\n', /line 3: 97110 has a reduction share that differs from its line 2/],
    ['no codes', 'HCPCS\n\n', /no codes/],
  ])('refuses %s', (_name, input, message) => {
    expect(() => parse('mppr_rate', input)).toThrow(message);
  });
});

describe('NCCI PTP (ncci_ptp)', () => {
  const text = fixture('NCCI_PTP_SYNTHETIC.txt');

  it('reads each edit with its own window, skipping one that never took effect', () => {
    const outcome = parse('ncci_ptp', text);
    const edits = byKey(outcome.rows);
    expect(outcome.rows).toHaveLength(5);
    expect(edits.get('97140|97530')).toMatchObject({
      value: { modifier_indicator: '1', rationale: 'SYNTHETIC rationale', in_existence_prior_to_1996: false },
      effective_from: '2026-01-01',
      effective_to: null,
    });
    expect(edits.get('97164|97110')).toMatchObject({ effective_from: '2026-01-01', effective_to: '2026-06-30', value: { modifier_indicator: '0' } });
    expect(edits.get('97035|97026')).toMatchObject({ effective_from: '1996-01-01', value: { in_existence_prior_to_1996: true, modifier_indicator: '9' } });
    expect(edits.has('97112|97110')).toBe(false);
    expect(outcome.notes).toEqual(['1 edit(s) deleted on or before the effective date never applied and were skipped']);
  });

  it('reads the comma-separated form and a heading continued on the next row', () => {
    const csv = 'Column 1,Column 2,*,Effective,Deletion,Modifier,Rationale\n,,prior to 1996,Date,Date,Indicator,\n97140,97530,,20260101,*,1,x\n';
    expect(parse('ncci_ptp', csv).rows).toHaveLength(1);
  });

  it.each([
    ['no heading', 'a\tb\n', /no header row found/],
    ['the deletion column moved', text.replace('Deletion Date *=no data\tModifier', 'Modifier\tDeletion Date *=no data'), /column 5 is headed .* not the deletion date/],
    ['a bad code', text.replace('97140\t97530', '9714\t97530'), /line 3: column 1 code "9714"/],
    ['a bad prior flag', text.replace('97140\t97530\t\t', '97140\t97530\tY\t'), /line 3: the prior-to-1996 flag "Y"/],
    ['no effective date', text.replace('97140\t97530\t\t20260101', '97140\t97530\t\t'), /line 3: the effective date is required/],
    ['a bad indicator', text.replace('20260101\t*\t1\tSYNTHETIC rationale\n97530', '20260101\t*\t2\tSYNTHETIC rationale\n97530'), /line 3: modifier indicator "2"/],
    ['nothing in effect', 'Column 1\tColumn 2\tx\tEffective\tDeletion\tModifier\n97140\t97530\t\t20260101\t20260101\t1\n', /no edits in effect/],
  ])('refuses %s', (_name, input, message) => {
    expect(() => parse('ncci_ptp', input)).toThrow(message);
  });
});

describe('NCCI MUE (ncci_mue)', () => {
  const text = fixture('NCCI_MUE_SYNTHETIC.csv');

  it('reads each code with its MUE, indicator and the import window', () => {
    const { rows } = parse('ncci_mue', text, { year: 2026, effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31' });
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({
      key: { hcpcs: '97110' },
      value: { mue: 7, adjudication_indicator: '3', rationale: 'SYNTHETIC rationale' },
      effective_from: '2026-10-01',
    });
    expect(byKey(rows).get('97026')?.value).toMatchObject({ mue: 2, adjudication_indicator: '1' });
  });

  it.each([
    ['no MUE heading', 'HCPCS,Value\n97110,1\n', /no header row found/],
    ['no indicator column', text.replace('MUE Adjudication Indicator', 'Indicator'), /no MUE adjudication indicator column/],
    ['a bad value', text.replace('97110,7,', '97110,seven,'), /line 3: MUE value "seven"/],
    ['a bad indicator', text.replace('97110,7,3 SYNTHETIC', '97110,7,4 SYNTHETIC'), /line 3: the adjudication indicator/],
    ['a code twice', text.replace('97112,6', '97110,6'), /line 4: 97110 appears twice/],
    ['no codes', text.split('\n').slice(0, 2).join('\n'), /no codes/],
  ])('refuses %s', (_name, input, message) => {
    expect(() => parse('ncci_mue', input)).toThrow(message);
  });
});

describe('X12 code lists (carc, rarc, claim_status_code)', () => {
  it('reads codes with their dates, descriptions and notes', () => {
    const { rows } = parse('carc', fixture('CARC_SYNTHETIC.csv'));
    const codes = byKey(rows);
    expect(rows).toHaveLength(6);
    expect(codes.get('45')).toMatchObject({
      value: { description: 'SYNTHETIC description for reason 45, with a comma', start_date: '2001-01-01', last_modified: '2025-03-01', stop_date: null, notes: '' },
      effective_from: '2001-01-01',
      effective_to: null,
    });
    expect(codes.get('9001')).toMatchObject({ effective_to: '2020-06-30', value: { notes: 'SYNTHETIC note', stop_date: '2020-06-30' } });
    expect(parse('rarc', fixture('RARC_SYNTHETIC.csv')).rows.map((row) => row.key.code)).toEqual(['N901', 'N902', 'MA901']);
    expect(parse('claim_status_code', fixture('CLAIM_STATUS_SYNTHETIC.csv')).rows).toHaveLength(3);
  });

  it('uses the import start for an export without dates', () => {
    const { rows } = parse('rarc', 'Code,Description\nN901,SYNTHETIC remark\n');
    expect(rows[0]).toMatchObject({ effective_from: '2026-01-01', effective_to: null, value: { start_date: null, notes: '' } });
  });

  it.each([
    ['no Code heading', 'Id,Description\n1,x\n', /no header row found/],
    ['no description column', 'Code,Text\n1,x\n', /no description column/],
    ['a bad code', 'Code,Description\nN-1,x\n', /line 2: "N-1" is not a code/],
    ['a code twice', 'Code,Description\n1,x\n1,y\n', /line 3: code 1 appears twice/],
    ['no description', 'Code,Description\n1,\n', /line 2: code 1 has no description/],
    ['a bad date', 'Code,Description,Start\n1,x,soon\n', /line 2: start date "soon"/],
    ['no codes', 'Code,Description\n', /no codes/],
  ])('refuses %s', (_name, input, message) => {
    expect(() => parse('carc', input)).toThrow(message);
  });
});

describe('every parser', () => {
  it('covers exactly the types loaded from public files', () => {
    expect(Object.keys(PARSERS).sort()).toEqual([...IMPORTABLE_TYPES].sort());
    expect(isImportableType('pfs_rvu')).toBe(true);
    expect(isImportableType('therapy_threshold')).toBe(false);
  });

  it('names its record type, a parser id, a title and the L2 questions', () => {
    for (const [type, parser] of Object.entries(PARSERS)) {
      expect(parser.type).toBe(type);
      expect(parser.parser).toMatch(/^[a-z0-9_]+$/);
      expect(parser.title.length).toBeGreaterThan(10);
      expect(parser.reviewQuestions.length).toBeGreaterThan(0);
    }
  });

  it('quotes rows that appear verbatim in the file', () => {
    const files: Record<ImportableType, string> = {
      pfs_rvu: 'PPRRVU_SYNTHETIC.csv',
      pfs_gpci: 'GPCI_SYNTHETIC.csv',
      locality_map: 'ZIP5_SYNTHETIC.txt',
      conversion_factor: 'conversion-factor-SYNTHETIC-pass-1.csv',
      mppr_rate: 'MPPR_SYNTHETIC.csv',
      ncci_ptp: 'NCCI_PTP_SYNTHETIC.txt',
      ncci_mue: 'NCCI_MUE_SYNTHETIC.csv',
      carc: 'CARC_SYNTHETIC.csv',
      rarc: 'RARC_SYNTHETIC.csv',
      claim_status_code: 'CLAIM_STATUS_SYNTHETIC.csv',
    };
    for (const [type, file] of Object.entries(files) as [ImportableType, string][]) {
      const text = fixture(file);
      for (const row of parse(type, text).rows) {
        expect(text.includes(row.quote), `${type} ${row.locator}`).toBe(true);
      }
    }
  });
});
