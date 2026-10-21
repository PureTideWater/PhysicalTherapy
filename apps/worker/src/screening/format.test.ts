import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SCREENING_PAYER_PRODUCTS as DB_PRODUCTS } from '@tp/db/runtime';
import { cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PHI_KIND_LABELS,
  SCREENING_COLUMNS,
  SCREENING_MAX_CLAIMS,
  SCREENING_MAX_LINE_ALLOWED_CENTS,
  SCREENING_MAX_REASONS,
  SCREENING_MAX_ROWS,
  SCREENING_MAX_ROWS_TEXT,
  SCREENING_MIN_CLAIM_LINES,
  SCREENING_PAYER_PRODUCTS,
  SCREENING_PHI_KINDS,
  SCREENING_REJECTION_CODES,
  SCREENING_STATES,
  type ScreeningRow,
  checkHeaders,
  classifyHeader,
  currentQuarter,
  decodeScreeningRows,
  encodeScreeningRows,
  headerLosesText,
  keptReasons,
  leftOutPlausible,
  normalizeHeader,
  quarterDays,
  rowKey,
  screenTable,
  storableRejections,
} from './format';

/**
 * The screening upload's format (CO-04; test matrix SCR-01, the rejection, in its pure part): which headers are
 * the eight columns and which are refused as patient information, by kind, with the column named by position; the
 * row rules; the canonical rows the form sends and the server decodes; and the lists the migration's CHECKs hold.
 * SCR-07, in its pure part: a row of fewer than 11 claim lines is left out by the browser, which counts its rows,
 * claim lines and dollars, and refused by the server's decode with its row number; 11 is taken.
 */

const NOW = new Date('2026-10-18T12:00:00Z');
const MIGRATION = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/db/migrations/20261104090000_free_screening.sql'), 'utf8');

/** The quoted values of the first IN (...) list after `marker` in the migration. */
function sqlList(marker: string): string[] {
  const start = MIGRATION.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  const open = MIGRATION.indexOf('IN (', start);
  const close = MIGRATION.indexOf(')', open);
  return [...MIGRATION.slice(open, close).matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

const HEADER = ['Procedure Code', 'Modifiers', 'Units', 'POS', 'Payer Product', 'Service Band', 'Allowed Total', 'Claim Count'];

function table(...rows: (readonly string[])[]): string[][] {
  return [HEADER, ...rows.map((row) => [...row])];
}

describe('the lists the migration holds', () => {
  it('keeps the states, products, rejection codes, PHI kinds and columns equal to the CHECKs', () => {
    expect(sqlList('CONSTRAINT screening_prospect_state')).toEqual([...SCREENING_STATES]);
    expect(SCREENING_STATES).toHaveLength(56);
    expect(new Set(SCREENING_STATES).size).toBe(56);
    expect(sqlList('CONSTRAINT screening_result_payer_product')).toEqual([...SCREENING_PAYER_PRODUCTS]);
    expect([...DB_PRODUCTS]).toEqual([...SCREENING_PAYER_PRODUCTS]);
    expect(sqlList("(reason ->> 'code') IN").sort()).toEqual([...SCREENING_REJECTION_CODES].sort());
    expect(sqlList("(reason ->> 'field') IN")).toEqual([...SCREENING_COLUMNS]);
    expect(sqlList("(reason ->> 'phi') IN").sort()).toEqual([...SCREENING_PHI_KINDS].sort());
    expect(Object.keys(PHI_KIND_LABELS).sort()).toEqual([...SCREENING_PHI_KINDS].sort());
    expect(Object.values(PHI_KIND_LABELS).sort()).toEqual(['claim numbers', 'dates of birth', 'dates of service', 'member IDs', 'names']);
  });

  it('holds the claim-line floor as one setting: the database refuses a stored row, and counts the rows left out, by the same number', () => {
    expect(SCREENING_MIN_CLAIM_LINES).toBe(11);
    expect(MIGRATION).toContain(`CONSTRAINT screening_result_claim_count CHECK (claim_count BETWEEN ${String(SCREENING_MIN_CLAIM_LINES)} AND ${String(SCREENING_MAX_CLAIMS)})`);
    expect(MIGRATION).toContain(`CHECK (left_out_claim_lines BETWEEN left_out_rows AND ${String(SCREENING_MIN_CLAIM_LINES - 1)} * left_out_rows)`);
    expect(MIGRATION).toContain(`CHECK (left_out_rows BETWEEN 0 AND ${String(SCREENING_MAX_ROWS)})`);
    expect(MIGRATION).toContain(`CHECK (left_out_allowed_cents BETWEEN 0 AND ${SCREENING_MAX_LINE_ALLOWED_CENTS.toString()}::bigint * left_out_claim_lines)`);
  });

  it('imports nothing but @tp/money, so the browser can run it', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, 'format.ts'), 'utf8');
    expect([...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1])).toEqual(['@tp/money']);
  });
});

describe('headers', () => {
  it('normalizes a header: no byte-order mark, NFKC, trimmed, lower case, # as number, runs of anything else one underscore', () => {
    expect(normalizeHeader('\uFEFFProcedure Code')).toBe('procedure_code');
    expect(normalizeHeader('  ＣＰＴ／ＨＣＰＣＳ  ')).toBe('cpt_hcpcs');
    expect(normalizeHeader('Claim #')).toBe('claim_number');
    expect(normalizeHeader('Claim#')).toBe('claim_number');
    expect(normalizeHeader('D.O.B.')).toBe('d_o_b');
    expect(normalizeHeader('--Allowed  ($) Total--')).toBe('allowed_total');
    // Camel case is split into words, so a run-together header is read by its words.
    expect(normalizeHeader('PatientNo')).toBe('patient_no');
    expect(normalizeHeader('MemberID')).toBe('member_id');
    expect(normalizeHeader('SSNumber')).toBe('ss_number');
    expect(normalizeHeader('SvcDt')).toBe('svc_dt');
    expect(normalizeHeader('CPT/HCPCS')).toBe('cpt_hcpcs');
  });

  it('never reads a header whose normalizing throws letters away as one of the eight columns', () => {
    for (const header of ['allowed (Иван Петров)', 'code 张伟', 'count — Ελένη', 'Código', 'units ü']) {
      expect(headerLosesText(header), header).toBe(true);
      expect(classifyHeader(header), header).toEqual({ kind: 'unknown' });
    }
    for (const header of ['Allowed ($)', '  ＣＰＴ／ＨＣＰＣＳ  ', 'Allowed €', '№', 'Units²']) {
      expect(headerLosesText(header), header).toBe(false);
    }
    // Latin words in such a header are still read for patient information.
    expect(classifyHeader('Patient Иван')).toEqual({ kind: 'phi', phi: 'name' });
  });

  it('takes each column by any of its spellings, in any case and punctuation', () => {
    const spellings: Readonly<Record<string, readonly string[]>> = {
      procedure_code: ['procedure_code', 'Code', 'CPT', 'CPT Code', 'HCPCS', 'hcpcs-code', 'CPT/HCPCS', 'Procedure', 'ProcedureCode'],
      modifiers: ['Modifiers', 'modifier', 'Modifier Set', 'mods'],
      units: ['Units', 'unit', 'Units per line'],
      place_of_service: ['Place of Service', 'POS'],
      payer_product: ['Payer Product', 'product'],
      service_band: ['Service Band', 'Service Date Band', 'service_date_band', 'band', 'Quarter', 'Service Quarter'],
      allowed_total: ['Allowed Total', 'Allowed Amount Total', 'allowed amount', 'Allowed'],
      claim_count: ['Claim Count', 'claims', 'Count'],
    };
    for (const [column, list] of Object.entries(spellings)) {
      for (const spelling of list) {
        expect(classifyHeader(spelling), spelling).toEqual({ kind: 'column', column });
      }
    }
  });

  it('refuses each spelling of patient information by its kind', () => {
    const spellings: Readonly<Record<(typeof SCREENING_PHI_KINDS)[number], readonly string[]>> = {
      claim_number: [
        'claim number',
        'Claim #',
        'claim no',
        'Claim Num',
        'claim id',
        'ClaimID',
        'CLM NO',
        'ICN',
        'pcn',
        'TCN',
        'dcn',
        'ccn',
        'Patient Control Number',
        'claim control number',
        'Payer Claim Control Number',
        'CLP01',
        'clp07',
        'Reference Number',
        'Ref #',
        // By their words: a claim's own word alone or with a reference, and the numbers of a visit or a control.
        'Claim',
        'Clm #',
        'CLM',
        'Claim Ref',
        'Payer Claim #',
        'Payer ICN',
        'Encounter #',
        'Encounter ID',
        'Visit ID',
        'Control #',
        'Pat Ctrl #',
        'Invoice #',
      ],
      member_id: [
        'Member ID',
        'member #',
        'MemberID',
        'mbr id',
        'Member Number',
        'Subscriber ID',
        'insured id',
        'Beneficiary ID',
        'MBI',
        'HICN',
        'hic',
        'Medicare ID',
        'Medicaid ID',
        'Policy Number',
        'policy id',
        'Insurance ID',
        'Patient ID',
        'pt id',
        'Patient Account',
        'Account Number',
        'Acct #',
        'MRN',
        'Medical Record Number',
        'chart number',
        'SSN',
        'Social Security Number',
        // By their words: an ID word after what it identifies, record and account numbers, and a member alone.
        'Member ID #',
        'Member No',
        'Member',
        'Mem ID',
        'Subscriber',
        'Subscriber #',
        'Subscriber No',
        'Sub ID',
        'Insured',
        'Ins ID',
        'Insurance #',
        'MBI #',
        'HIC #',
        'Medicare #',
        'Medicare Number',
        'MRN #',
        'Med Rec #',
        'Patient #',
        'Pat ID',
        'Pt #',
        'PatientNo',
        'Patient Acct',
        'Pt Acct',
        'Account No',
        'Acct No',
        'SS#',
      ],
      date_of_birth: ['DOB', 'D.O.B.', 'Date of Birth', 'birth date', 'Birthdate', 'birthday', 'Patient DOB', 'pt dob', 'Born', 'Age', 'Patient Birth Date', 'Bday', 'B-Day'],
      date_of_service: [
        'DOS',
        'Date of Service',
        'Service Date',
        'svc date',
        'From Date',
        'to date',
        'DOS From',
        'dos to',
        'Thru Date',
        'Visit Date',
        'appointment date',
        'Encounter Date',
        'Admit Date',
        'discharge date',
        'Date',
        'Paid Date',
        'Check Date',
        'svc dt',
        'SvcDt',
        'Remit Date',
      ],
      name: [
        'Name',
        'Patient',
        'Patient Name',
        'pt name',
        'First Name',
        'Last Name',
        'middle name',
        'Full Name',
        'FirstName',
        'lastname',
        'fname',
        'LNAME',
        'Given Name',
        'Surname',
        'Family Name',
        'Member Name',
        'Subscriber Name',
        'Insured Name',
        'Beneficiary Name',
        'Guarantor',
        'Responsible Party',
        // By their words: a person alone, or a person and a part of a name, or a part of a name that is no one else's.
        'Client',
        'Client Name',
        'Patient Last',
        'Patient First',
        'Last',
        'First',
        'Last, First',
        'Patient Name (Last, First)',
        'Beneficiary',
        'Resident',
      ],
    };
    for (const [phi, list] of Object.entries(spellings)) {
      for (const spelling of list) {
        expect(classifyHeader(spelling), spelling).toEqual({ kind: 'phi', phi });
      }
    }
  });

  it('refuses other headers as unknown, not as patient information', () => {
    for (const header of [
      'Payer Name',
      'Provider Name',
      'Practice Name',
      'Rendering Provider Name',
      'Insurance Name',
      'NPI',
      'Payer ID',
      'Provider ID',
      'Charge',
      'Paid',
      'Patient Responsibility',
      'Pt Resp',
      'PT Units',
      'Claim Status',
      'Claims Paid',
      'Notes',
      '',
      'Código',
    ]) {
      expect(classifyHeader(header), header).toEqual({ kind: 'unknown' });
    }
  });

  it('passes the eight columns once each in any order, and names each refused column by its position', () => {
    const passed = checkHeaders(['claims', 'Allowed', 'band', 'product', 'pos', 'units', 'mods', 'cpt']);
    expect(passed).toEqual({
      ok: true,
      positions: { claim_count: 0, allowed_total: 1, service_band: 2, payer_product: 3, place_of_service: 4, units: 5, modifiers: 6, procedure_code: 7 },
    });
    expect(checkHeaders([...HEADER.slice(0, 3), 'Member ID', ...HEADER.slice(3), 'Date of Service'])).toEqual({
      ok: false,
      reasons: [
        { code: 'phi_column', column: 4, phi: 'member_id' },
        { code: 'phi_column', column: 10, phi: 'date_of_service' },
      ],
      total: 2,
    });
    // Patient information first, then a second copy of a column, a column that is not one of the eight, a column missing.
    expect(checkHeaders(['CPT', 'Payer Name', 'Code', ...HEADER.slice(1, 7)])).toEqual({
      ok: false,
      reasons: [
        { code: 'duplicate_column', column: 3, field: 'procedure_code' },
        { code: 'unknown_column', column: 2 },
        { code: 'missing_column', field: 'claim_count' },
      ],
      total: 3,
    });
  });

  it('names a column of patient information however many other problems come before it, and by its real position', () => {
    // A wide billing export: 24 columns that are not the eight, then a date of service and a member ID, then the eight.
    const unknown = Array.from({ length: 24 }, (_, index) => `Export Field ${String(index + 1)}`);
    const wide = checkHeaders([...unknown, 'Date of Service', 'Member ID', ...HEADER]);
    expect(wide.ok).toBe(false);
    if (wide.ok) {
      return;
    }
    expect(wide.reasons).toHaveLength(SCREENING_MAX_REASONS);
    expect(wide.total).toBe(26);
    expect(wide.reasons.slice(0, 2)).toEqual([
      { code: 'phi_column', column: 25, phi: 'date_of_service' },
      { code: 'phi_column', column: 26, phi: 'member_id' },
    ]);
    // Past the 64th column the browser still names the position; what is stored names 1 to 64 only.
    const far = checkHeaders([...HEADER, ...Array.from({ length: 57 }, () => 'Charge'), 'Member ID', ...Array.from({ length: 3 }, () => 'Notes'), 'DOS']);
    expect(far.ok ? [] : far.reasons.slice(0, 2)).toEqual([
      { code: 'phi_column', column: 66, phi: 'member_id' },
      { code: 'phi_column', column: 70, phi: 'date_of_service' },
    ]);
    expect(storableRejections(far.ok ? [] : far.reasons).slice(0, 2)).toEqual([
      { code: 'phi_column', phi: 'member_id' },
      { code: 'phi_column', phi: 'date_of_service' },
    ]);
    expect(storableRejections([{ code: 'phi_column', column: 64, phi: 'name' }])).toEqual([{ code: 'phi_column', column: 64, phi: 'name' }]);
    // Never more than 20 kept, patient information first.
    expect(keptReasons([...Array.from({ length: 25 }, (_, index) => ({ code: 'unknown_column' as const, column: index + 1 })), { code: 'phi_column', column: 26, phi: 'name' }])[0]).toEqual({
      code: 'phi_column',
      column: 26,
      phi: 'name',
    });
  });
});

describe('rows', () => {
  const ROW = ['97110', 'GP', '2', '11', 'medicare_ffs', '2026-Q1', '1,234.50', '12'];

  it('reads a row: code upper-cased, modifiers sorted and distinct, POS padded, product and band normalized, dollars to integer cents', () => {
    const screened = screenTable(table([' 97110 ', 'gp;59', '002', '2', 'Medicare FFS', 'q3 2026', '$1,234.5', '1,000']), NOW);
    // The header sent is the columns' canonical names, never the text typed.
    expect(screened).toEqual({ ok: true, headers: [...SCREENING_COLUMNS], rowCount: 1, rows: '97110\t59 GP\t2\t02\tmedicare_ffs\t2026-Q3\t123450\t1000', leftOut: { rows: 0, claimLines: 0, allowedCents: 0n } });
    const reordered = screenTable([['Claims', 'Allowed', 'Band', 'Product', 'POS', 'Units', 'Mods', 'CPT'], ['11', '10', '2026-Q1', 'other', '11', '1', '', '97110']], NOW);
    expect(reordered).toMatchObject({ ok: true, headers: ['claim_count', 'allowed_total', 'service_band', 'payer_product', 'place_of_service', 'units', 'modifiers', 'procedure_code'] });
    for (const [typed, band] of [
      ['2026-Q1', '2026-Q1'],
      ['2026 Q2', '2026-Q2'],
      ['2026q3', '2026-Q3'],
      ['Q4 2025', '2025-Q4'],
      ['q1-2026', '2026-Q1'],
    ] as const) {
      const result = screenTable(table([...ROW.slice(0, 5), typed, ...ROW.slice(6)]), NOW);
      expect(result.ok ? result.rows.split('\t')[5] : typed).toBe(band);
    }
    for (const [typed, product] of [
      ['MA-Noncontracted', 'ma_noncontracted'],
      ['ma contracted', 'ma_contracted'],
      ['Commercial', 'commercial'],
      ['MEDICAID', 'medicaid'],
      ['other', 'other'],
    ] as const) {
      const result = screenTable(table([...ROW.slice(0, 4), typed, ...ROW.slice(5)]), NOW);
      expect(result.ok ? result.rows.split('\t')[4] : typed).toBe(product);
    }
    for (const [typed, modifiers] of [
      ['', ''],
      ['GP 59', '59 GP'],
      ['CQ,GP', 'CQ GP'],
      ['GP+KX|59/76', '59 76 GP KX'],
      ['go : kx', 'GO KX'],
    ] as const) {
      const result = screenTable(table([ROW[0] as string, typed, ...ROW.slice(2)]), NOW);
      expect(result.ok ? result.rows.split('\t')[1] : typed).toBe(modifiers);
    }
  });

  it('refuses each value outside its rule, naming the row and the field', () => {
    const refused = (column: number, value: string) => {
      const cells = [...ROW];
      cells[column] = value;
      const result = screenTable(table(cells), NOW);
      return result.ok ? [] : result.reasons;
    };
    const field = (column: number) => SCREENING_COLUMNS[column];
    for (const [column, values] of [
      [0, ['9711', '971100', '97 10', '', 'SYN-1', 'SMITH', 'Jones', 'MARIA', 'A1B2C', 'W1234', '0001X']],
      [1, ['G', 'GPX', 'GP GP', 'GP 59 KX 76 CQ', 'G!']],
      [2, ['0', '1000', '1.5', '2.0', '-1', 'two', '']],
      [3, ['0', '00', '100', '1a', '']],
      [4, ['tricare', 'medicare', '']],
      [6, ['12.345', '1,23', '12,34.00', '-5', '1000000000', '$', 'abc', '']],
      [7, ['0', '100001', '654321', '1000001', '1.5', '1,0000', '']],
    ] as const) {
      for (const value of values) {
        expect(refused(column, value), `${String(field(column))} ${value}`).toEqual([{ code: 'invalid_value', row: 1, field: field(column) }]);
      }
    }
    expect(refused(6, '0')).toEqual([]);
    expect(refused(6, '.5')).toEqual([]);
    expect(refused(7, '100,000')).toEqual([]);
    expect(refused(2, '999')).toEqual([]);
    expect(SCREENING_MAX_CLAIMS).toBe(100_000);
    // Every real code shape: CPT Category I, II (F) and III (T), PLA (U), MAAA (M), and HCPCS Level II (A to V).
    for (const code of ['97110', '0001F', '0042T', '0001U', '0002M', 'G0283', 'A0021', 'V2020', 'j1100']) {
      expect(refused(0, code), code).toEqual([]);
    }
  });

  it('refuses an allowed total above $25,000 a claim line, so an identifier under the allowed total is never read as dollars', () => {
    const row = (allowed: string, claims: string) => {
      const result = screenTable(table([...ROW.slice(0, 6), allowed, claims]), NOW);
      return result.ok ? [] : result.reasons;
    };
    expect(SCREENING_MAX_LINE_ALLOWED_CENTS).toBe(2_500_000n);
    expect(row('123456789', '24')).toEqual([{ code: 'invalid_value', row: 1, field: 'allowed_total' }]);
    expect(row('25,000.01', '1')).toEqual([{ code: 'invalid_value', row: 1, field: 'allowed_total' }]);
    expect(row('275,000.01', '11')).toEqual([{ code: 'invalid_value', row: 1, field: 'allowed_total' }]);
    expect(row('275,000.00', '11')).toEqual([]);
    expect(row('999,999,999.99', '100,000')).toEqual([]);
    expect(row('100', '654321')).toEqual([{ code: 'invalid_value', row: 1, field: 'claim_count' }]);
  });

  it('refuses a band with a day in it as a date-of-service column, a month with "use a quarter", and a quarter not yet started', () => {
    const band = (value: string) => {
      const cells = [...ROW];
      cells[5] = value;
      const result = screenTable(table(cells), NOW);
      return result.ok ? [] : result.reasons;
    };
    for (const day of [
      '2026-01-15',
      '01/15/2026',
      '1/5/26',
      '15.01.2026',
      '20260115',
      '2026-01-15T10:00:00Z',
      'Jan 15, 2026',
      '15 January 2026',
      'Sept 5 2026',
      // As spreadsheets write them: a month's name between hyphens or with no separator, and a serial day number.
      '5-Jan-26',
      '05-Jan-2026',
      '05JAN2026',
      'Jan-05-2026',
      '46027',
    ]) {
      expect(band(day), day).toEqual([{ code: 'band_holds_date', column: 6, row: 1, phi: 'date_of_service' }]);
    }
    for (const month of ['2026-01', 'Jan 2026', '01/2026', 'January', 'Q5 2026', '1999-Q4', '2100-Q1', '12345', '99999']) {
      expect(band(month), month).toEqual([{ code: 'invalid_value', row: 1, field: 'service_band' }]);
    }
    expect(band('2026-Q4')).toEqual([]);
    expect(band('2027-Q1')).toEqual([{ code: 'band_in_future', row: 1, field: 'service_band' }]);
    expect(currentQuarter(NOW)).toBe('2026-Q4');
    expect(currentQuarter(new Date('2027-01-01T00:00:00Z'))).toBe('2027-Q1');
    expect(quarterDays('2026-Q1')).toEqual({ first: '2026-01-01', last: '2026-03-31' });
    expect(quarterDays('2026-Q2')).toEqual({ first: '2026-04-01', last: '2026-06-30' });
    expect(quarterDays('2026-Q3')).toEqual({ first: '2026-07-01', last: '2026-09-30' });
    expect(quarterDays('2026-Q4')).toEqual({ first: '2026-10-01', last: '2026-12-31' });
    expect(() => quarterDays('2026-01')).toThrow(RangeError);
  });

  it('refuses a repeated key, a row of the wrong shape, no rows and too many, keeping at most 20 reasons', () => {
    const repeated = screenTable(table(ROW, ['97112', ...ROW.slice(1)], ['97110', 'GP', '2', '11', 'medicare_ffs', '2026-Q1', '1.00', '1']), NOW);
    expect(repeated).toMatchObject({ ok: false, reasons: [{ code: 'duplicate_row', row: 3, first_row: 1 }] });
    expect(screenTable(table(ROW.slice(0, 7)), NOW)).toMatchObject({ ok: false, reasons: [{ code: 'row_shape', row: 1 }] });
    expect(screenTable([HEADER], NOW)).toEqual({ ok: false, headers: HEADER, reasons: [{ code: 'no_rows' }], total: 1 });
    expect(screenTable([], NOW)).toEqual({ ok: false, headers: [], reasons: [{ code: 'no_rows' }], total: 1 });
    expect(screenTable([HEADER, ...Array.from({ length: SCREENING_MAX_ROWS + 1 }, () => ROW)], NOW)).toEqual({ ok: false, headers: HEADER, reasons: [{ code: 'too_many_rows' }], total: 1 });
    const many = screenTable(table(...Array.from({ length: 30 }, () => ['x', ...ROW.slice(1)])), NOW);
    expect(many.ok ? [] : many.reasons).toHaveLength(SCREENING_MAX_REASONS);
    expect(many.ok ? 0 : many.total).toBe(30);
    // A header with patient information is refused before any row is read.
    expect(screenTable([[...HEADER, 'Patient Name'], [...ROW, 'SYNTHETIC']], NOW)).toEqual({
      ok: false,
      headers: [...HEADER, 'Patient Name'],
      reasons: [{ code: 'phi_column', column: 9, phi: 'name' }],
      total: 1,
    });
  });

  it('names a band holding dates of service however many other problems come before it', () => {
    const bad = Array.from({ length: 25 }, (_, index) => ['x', 'GP', '2', '11', 'medicare_ffs', '2026-Q1', '1.00', String(index + 1)]);
    const dated = ['97110', 'GP', '2', '11', 'medicare_ffs', '2026-02-11', '1.00', '1'];
    const screened = screenTable(table(...bad, dated), NOW);
    expect(screened.ok).toBe(false);
    if (screened.ok) {
      return;
    }
    expect(screened.reasons[0]).toEqual({ code: 'band_holds_date', column: 6, row: 26, phi: 'date_of_service' });
    expect(screened.reasons).toHaveLength(SCREENING_MAX_REASONS);
    expect(screened.total).toBe(26);
  });
});

describe('the canonical rows', () => {
  const row = (overrides: Partial<ScreeningRow> = {}): ScreeningRow => ({
    procedureCode: '97110',
    modifiers: ['CQ', 'GP'],
    units: 2,
    placeOfService: '11',
    payerProduct: 'medicare_ffs',
    serviceBand: '2026-Q1',
    allowedCents: cents(123_450n),
    claimCount: 12,
    ...overrides,
  });

  it('decodes strictly what it encodes', () => {
    const rows = [row(), row({ modifiers: [], payerProduct: 'commercial', allowedCents: cents(0n) })];
    const text = encodeScreeningRows(rows);
    expect(text).toBe('97110\tCQ GP\t2\t11\tmedicare_ffs\t2026-Q1\t123450\t12\n97110\t\t2\t11\tcommercial\t2026-Q1\t0\t12');
    expect(decodeScreeningRows(text, NOW)).toEqual({ ok: true, rows });
    for (const [line, field] of [
      ['97110\tGP CQ\t2\t11\tmedicare_ffs\t2026-Q1\t1\t11', 'modifiers'],
      ['97110\tgp\t2\t11\tmedicare_ffs\t2026-Q1\t1\t11', 'modifiers'],
      ['97110\tGP\t02\t11\tmedicare_ffs\t2026-Q1\t1\t11', 'units'],
      ['97110\tGP\t2\t1\tmedicare_ffs\t2026-Q1\t1\t11', 'place_of_service'],
      ['97110\tGP\t2\t11\tMedicare FFS\t2026-Q1\t1\t11', 'payer_product'],
      ['97110\tGP\t2\t11\tmedicare_ffs\t2026 Q1\t1\t11', 'service_band'],
      ['97110\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t1.00\t11', 'allowed_total'],
      ['97110\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t100000000000\t11', 'allowed_total'],
      ['97110\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t1\t1000001', 'claim_count'],
      ['9711o\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t1\t11', 'procedure_code'],
      ['SMITH\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t1\t11', 'procedure_code'],
      ['MARIA\t\t1\t11\tcommercial\t2026-Q1\t1\t11', 'procedure_code'],
      ['97110\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t12345678900\t24', 'allowed_total'],
      ['97110\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t10000\t654321', 'claim_count'],
    ] as const) {
      expect(decodeScreeningRows(line, NOW), line).toEqual({ ok: false, reasons: [{ code: 'invalid_value', row: 1, field }], total: 1 });
    }
    expect(decodeScreeningRows('', NOW)).toEqual({ ok: false, reasons: [{ code: 'no_rows' }], total: 1 });
    expect(decodeScreeningRows('97110\tGP', NOW)).toEqual({ ok: false, reasons: [{ code: 'row_shape', row: 1 }], total: 1 });
    expect(decodeScreeningRows(`${encodeScreeningRows([row()])}\n${encodeScreeningRows([row()])}`, NOW)).toEqual({ ok: false, reasons: [{ code: 'duplicate_row', row: 2, first_row: 1 }], total: 1 });
    expect(decodeScreeningRows(encodeScreeningRows([row({ serviceBand: '2027-Q1' })]), NOW)).toEqual({ ok: false, reasons: [{ code: 'band_in_future', row: 1, field: 'service_band' }], total: 1 });
    expect(decodeScreeningRows(Array.from({ length: SCREENING_MAX_ROWS + 1 }, () => 'x').join('\n'), NOW)).toEqual({ ok: false, reasons: [{ code: 'too_many_rows' }], total: 1 });
    const many = decodeScreeningRows(Array.from({ length: 30 }, () => 'x').join('\n'), NOW);
    expect(many).toMatchObject({ ok: false, total: 30 });
    expect(many.ok ? [] : many.reasons).toHaveLength(SCREENING_MAX_REASONS);
  });

  it('round-trips any rows the browser can send, within the server’s text bound (property)', () => {
    const modifier = fc.stringMatching(/^[0-9A-Z]{2}$/);
    const arbitraryRow = fc.record({
      procedureCode: fc.oneof(fc.stringMatching(/^[0-9]{4}[0-9FMTU]$/), fc.stringMatching(/^[A-V][0-9]{4}$/)),
      modifiers: fc.uniqueArray(modifier, { maxLength: 4 }).map((list) => [...list].sort()),
      units: fc.integer({ min: 1, max: 999 }),
      placeOfService: fc.integer({ min: 1, max: 99 }).map((place) => String(place).padStart(2, '0')),
      payerProduct: fc.constantFrom(...SCREENING_PAYER_PRODUCTS),
      serviceBand: fc.tuple(fc.integer({ min: 2000, max: 2026 }), fc.integer({ min: 1, max: 4 })).map(([year, quarter]) => `${String(year)}-Q${String(quarter)}`),
      claimCount: fc.integer({ min: SCREENING_MIN_CLAIM_LINES, max: 100_000 }),
      allowedPerLine: fc.bigInt({ min: 0n, max: 2_500_000n }),
    }).map(({ allowedPerLine, ...rest }) => {
      const total = allowedPerLine * BigInt(rest.claimCount);
      return { ...rest, allowedCents: cents(total > 99_999_999_999n ? 99_999_999_999n : total) };
    });
    fc.assert(
      fc.property(fc.uniqueArray(arbitraryRow, { minLength: 1, maxLength: 40, selector: rowKey }), (rows) => {
        const text = encodeScreeningRows(rows);
        expect(text.length).toBeLessThanOrEqual(70 * rows.length);
        expect(decodeScreeningRows(text, NOW)).toEqual({ ok: true, rows });
      }),
    );
    expect(70 * SCREENING_MAX_ROWS).toBeLessThanOrEqual(SCREENING_MAX_ROWS_TEXT);
  });
});

describe('SCR-07: a row of fewer than 11 claim lines, which can be one patient’s service line', () => {
  const ROW = ['97110', 'GP', '2', '11', 'medicare_ffs', '2026-Q1', '1,234.50', '12'];
  const withClaims = (claims: string, allowed: string, code = '97110') => [code, ...ROW.slice(1, 6), allowed, claims];

  it('is left out by the browser at 10 claim lines and kept at 11, and nothing of the row left out is sent', () => {
    const screened = screenTable(table(withClaims('10', '360.00', '97140'), withClaims('11', '396.00')), NOW);
    expect(screened).toEqual({
      ok: true,
      headers: [...SCREENING_COLUMNS],
      rowCount: 1,
      rows: '97110\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t39600\t11',
      leftOut: { rows: 1, claimLines: 10, allowedCents: 36_000n },
    });
    expect(screened.ok ? screened.rows : '').not.toContain('97140');
    expect(screenTable(table(withClaims('11', '396.00')), NOW)).toMatchObject({ ok: true, rowCount: 1, leftOut: { rows: 0, claimLines: 0, allowedCents: 0n } });
  });

  it('counts the rows, claim lines and dollars it left out, to the cent', () => {
    const screened = screenTable(
      table(withClaims('1', '12.34', '97140'), withClaims('24', '864.00'), withClaims('5', '100.00', '97530'), withClaims('10', '999.99', '97112'), withClaims('1,000', '36,000.00', '97116')),
      NOW,
    );
    expect(screened).toMatchObject({ ok: true, rowCount: 2, leftOut: { rows: 3, claimLines: 16, allowedCents: 111_233n } });
    // The rows kept are the file's rows of 11 claim lines or more, in its order.
    expect(screened.ok ? screened.rows.split('\n').map((line) => line.split('\t')[0]) : []).toEqual(['97110', '97116']);
  });

  it('refuses a file whose every row is left out, saying what was left out, and still refuses a small row holding a date', () => {
    expect(screenTable(table(withClaims('3', '30.00'), withClaims('10', '1.00', '97140')), NOW)).toEqual({
      ok: false,
      headers: HEADER,
      reasons: [{ code: 'too_few_claim_lines' }],
      total: 1,
      leftOut: { rows: 2, claimLines: 13, allowedCents: 3_100n },
    });
    // A row of one claim line is checked like any other before it is left out: a day in its band refuses the file.
    const dated = ['97110', 'GP', '2', '11', 'medicare_ffs', '2026-02-11', '45.00', '1'];
    expect(screenTable(table(dated, withClaims('11', '396.00')), NOW)).toMatchObject({ ok: false, reasons: [{ code: 'band_holds_date', column: 6, row: 1, phi: 'date_of_service' }] });
    // And a small row that repeats a kept row's key is a repeated row, never quietly dropped.
    expect(screenTable(table(withClaims('11', '396.00'), withClaims('2', '72.00')), NOW)).toMatchObject({ ok: false, reasons: [{ code: 'duplicate_row', row: 2, first_row: 1 }] });
  });

  it('is refused by the server at 10 claim lines, by its row number and field alone, and taken at 11', () => {
    const line = (claims: number, code = '97110') => `${code}\tGP\t2\t11\tmedicare_ffs\t2026-Q1\t${String(claims * 3_600)}\t${String(claims)}`;
    expect(decodeScreeningRows(line(10), NOW)).toEqual({ ok: false, reasons: [{ code: 'too_few_claim_lines', row: 1, field: 'claim_count' }], total: 1 });
    expect(decodeScreeningRows(line(11), NOW)).toMatchObject({ ok: true, rows: [{ procedureCode: '97110', claimCount: 11, allowedCents: 39_600n }] });
    const mixed = decodeScreeningRows([line(11), line(1, '97140'), line(40, '97530'), line(10, '97112')].join('\n'), NOW);
    expect(mixed).toEqual({
      ok: false,
      reasons: [
        { code: 'too_few_claim_lines', row: 2, field: 'claim_count' },
        { code: 'too_few_claim_lines', row: 4, field: 'claim_count' },
      ],
      total: 2,
    });
    // Named with the patient information, ahead of any other problem, and storable as it is.
    const crowded = decodeScreeningRows([...Array.from({ length: 25 }, () => 'x'), line(1)].join('\n'), NOW);
    expect(crowded.ok ? null : crowded.reasons[0]).toEqual({ code: 'too_few_claim_lines', row: 26, field: 'claim_count' });
    expect(storableRejections([{ code: 'too_few_claim_lines', row: 2, field: 'claim_count' }])).toEqual([{ code: 'too_few_claim_lines', row: 2, field: 'claim_count' }]);
  });

  it('takes only left-out numbers the browser could have counted', () => {
    const plausible = (rows: number, claimLines: number, allowedCents: bigint, rowCount = 5) => leftOutPlausible({ rows, claimLines, allowedCents: cents(allowedCents) }, rowCount);
    expect(plausible(0, 0, 0n)).toBe(true);
    expect(plausible(1, 1, 0n)).toBe(true);
    expect(plausible(1, 10, 25_000_000n)).toBe(true);
    expect(plausible(3, 16, 111_233n)).toBe(true);
    expect(plausible(0, 1, 0n)).toBe(false);
    expect(plausible(0, 0, 1n)).toBe(false);
    expect(plausible(1, 11, 0n)).toBe(false);
    expect(plausible(2, 1, 0n)).toBe(false);
    expect(plausible(1, 10, 25_000_001n)).toBe(false);
    expect(plausible(-1, 0, 0n)).toBe(false);
    expect(plausible(1, 1, -1n)).toBe(false);
    expect(plausible(1.5, 3, 0n)).toBe(false);
    expect(plausible(SCREENING_MAX_ROWS - 5, SCREENING_MAX_ROWS - 5, 0n)).toBe(true);
    expect(plausible(SCREENING_MAX_ROWS - 4, SCREENING_MAX_ROWS - 4, 0n)).toBe(false);
  });

  it('splits any clean table into the rows sent and the rows left out, every claim line and cent in one or the other (property)', () => {
    const arbitraryRow = fc.record({
      code: fc.stringMatching(/^[0-9]{5}$/),
      claims: fc.integer({ min: 1, max: 40 }),
      dollarsPerLine: fc.integer({ min: 0, max: 250 }),
    });
    fc.assert(
      fc.property(fc.uniqueArray(arbitraryRow, { minLength: 1, maxLength: 30, selector: (row) => row.code }), (rows) => {
        const cells = rows.map((row) => [row.code, 'GP', '1', '11', 'ma_noncontracted', '2026-Q2', String(row.dollarsPerLine * row.claims), String(row.claims)]);
        const screened = screenTable(table(...cells), NOW);
        const small = rows.filter((row) => row.claims < SCREENING_MIN_CLAIM_LINES);
        const kept = rows.filter((row) => row.claims >= SCREENING_MIN_CLAIM_LINES);
        const leftOut = {
          rows: small.length,
          claimLines: small.reduce((sum, row) => sum + row.claims, 0),
          allowedCents: cents(small.reduce((sum, row) => sum + BigInt(row.dollarsPerLine * row.claims) * 100n, 0n)),
        };
        if (kept.length === 0) {
          expect(screened).toMatchObject({ ok: false, reasons: [{ code: 'too_few_claim_lines' }], leftOut });
          return;
        }
        expect(screened).toMatchObject({ ok: true, rowCount: kept.length, leftOut });
        const sent = decodeScreeningRows(screened.ok ? screened.rows : '', NOW);
        expect(sent.ok ? sent.rows.map((row) => [row.procedureCode, row.claimCount]) : null).toEqual(kept.map((row) => [row.code, row.claims]));
        expect(leftOutPlausible(leftOut, kept.length)).toBe(true);
      }),
    );
  });
});
