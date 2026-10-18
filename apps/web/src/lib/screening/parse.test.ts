import { createHash } from 'node:crypto';

import { decodeScreeningRows } from '@tp/worker/screening-format';
import { describe, expect, it } from 'vitest';

import { reasonMessage } from './messages';
import { MAX_FILE_BYTES, type ScreeningParse, delimiterOf, fileProblem, looksLikeSpreadsheet, parseScreeningBytes, parseScreeningFile, readTable, sha256Hex, utf8Text } from './parse';
import { screeningTemplateCsv } from './template';

/**
 * The screening upload as the browser reads it (CO-04; decision D18 a): the file's own checks, its text as a table,
 * its hash. SYNTHETIC rows of totals, built here; no CSV is committed.
 */

const bytes = (text: string) => new TextEncoder().encode(text);

describe('the file, before its rows', () => {
  it('refuses a spreadsheet by name or declared type with "save as CSV", an empty file and one over 25 MiB', () => {
    for (const name of ['totals.xlsx', 'totals.XLS', 'totals.ods', 'totals.numbers']) {
      expect(fileProblem({ name, type: '', size: 10 }), name).toMatch(/spreadsheet\. Save it as CSV/);
    }
    expect(fileProblem({ name: 'totals', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 10 })).toMatch(/Save it as CSV/);
    expect(fileProblem({ name: 'totals.csv', type: 'text/csv', size: 0 })).toMatch(/empty/);
    expect(fileProblem({ name: 'totals.csv', type: 'text/csv', size: MAX_FILE_BYTES + 1 })).toMatch(/larger than 25 MiB/);
    expect(fileProblem({ name: 'totals.csv', type: 'application/vnd.ms-excel', size: 10 })).toBeNull();
    expect(fileProblem({ name: 'totals.tsv', type: '', size: MAX_FILE_BYTES })).toBeNull();
  });

  it('knows a workbook by its first bytes whatever its name, and reads only UTF-8 text', () => {
    expect(looksLikeSpreadsheet(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(looksLikeSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(true);
    expect(looksLikeSpreadsheet(bytes('procedure_code,units'))).toBe(false);
    expect(utf8Text(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
    expect(utf8Text(bytes('﻿code'))).toBe('﻿code');
  });

  it('hashes the raw bytes with SHA-256, as the server records it', async () => {
    const raw = bytes('﻿procedure_code\r\n97110\r\n');
    expect(await sha256Hex(raw)).toBe(createHash('sha256').update(raw).digest('hex'));
  });
});

describe('the text as a table', () => {
  it('reads CSV with RFC 4180 quotes, CRLF and a byte-order mark, and skips blank lines', () => {
    const table = readTable('﻿a,b,c\r\n"1,5","say ""hi""",x\r\n\r\n,,\r\n"two\nlines",  "q"  ,z\n');
    expect(table).toEqual({ ok: true, delimiter: ',', rows: [['a', 'b', 'c'], ['1,5', 'say "hi"', 'x'], ['two\nlines', 'q', 'z']] });
  });

  it('reads tab-separated text when the header holds tabs and no comma', () => {
    expect(delimiterOf('a\tb\tc\n1,2\t3\t4')).toBe('\t');
    expect(delimiterOf('a,b\tc')).toBe(',');
    expect(delimiterOf('"a,b"\tc')).toBe('\t');
    expect(readTable('a\tb\n"1\t2"\t3')).toEqual({ ok: true, delimiter: '\t', rows: [['a', 'b'], ['1\t2', '3']] });
  });

  it('refuses a quote never closed, and text after a closing quote', () => {
    expect(readTable('a,b\n"1,2')).toEqual({ ok: false, problem: 'unclosed_quote' });
    expect(readTable('a,b\n"1"x,2')).toEqual({ ok: false, problem: 'text_after_quote' });
  });

  it('keeps a last line without its line break, and a row with fewer cells as it is', () => {
    expect(readTable('a,b\n1')).toEqual({ ok: true, delimiter: ',', rows: [['a', 'b'], ['1']] });
    expect(readTable('a,b\n1,""')).toEqual({ ok: true, delimiter: ',', rows: [['a', 'b'], ['1', '']] });
  });
});

/** A day in 2026's fourth quarter: 2026-Q4 is the current quarter, 2027-Q1 is after it. */
const NOW = new Date('2026-10-18T12:00:00Z');
const HEADER = 'procedure_code,modifiers,units,place_of_service,payer_product,service_band,allowed_total,claim_count';
const ROW_A = '97110,GP,1,11,ma_noncontracted,2026-Q1,600.00,40';
const ROW_B = '97140,59 GP,1,11,medicare_ffs,2026-Q2,"2,500.00",50';

function csv(...lines: string[]): Uint8Array {
  return bytes(`${lines.join('\r\n')}\r\n`);
}

async function parse(content: Uint8Array, name = 'totals.csv'): Promise<ScreeningParse> {
  return parseScreeningBytes({ name, type: 'text/csv', size: content.length }, content, NOW);
}

async function messages(content: Uint8Array): Promise<readonly string[]> {
  const result = await parse(content);
  if (result.ok) {
    throw new Error('the file was taken');
  }
  return result.messages;
}

describe('a clean file (CO-04)', () => {
  it('becomes the hash of its bytes, its header cells, its row count and its rows in their canonical form', async () => {
    const content = csv(HEADER, ROW_A, ROW_B);
    const result = await parse(content);
    expect(result).toEqual({
      ok: true,
      fileSha256: createHash('sha256').update(content).digest('hex'),
      headers: HEADER.split(','),
      rowCount: 2,
      rows: ['97110\tGP\t1\t11\tma_noncontracted\t2026-Q1\t60000\t40', '97140\t59 GP\t1\t11\tmedicare_ffs\t2026-Q2\t250000\t50'].join('\n'),
    });
    // What the browser sends is what the server decodes.
    expect(result.ok && decodeScreeningRows(result.rows, NOW).ok).toBe(true);
  });

  it('takes the common spellings of each column, in any order, as CSV or tab-separated text', async () => {
    const header = ['CPT/HCPCS', 'Mods', 'Units', 'POS', 'Product', 'Quarter', 'Allowed Amount', 'Claims'];
    const tsv = bytes(`\uFEFF${header.join('\t')}\n97110\tGP\t1\t11\tmedicare_ffs\tQ1 2026\t$60.00\t1\n`);
    const result = await parse(tsv, 'totals.tsv');
    expect(result.ok && result.rows).toBe('97110\tGP\t1\t11\tmedicare_ffs\t2026-Q1\t6000\t1');
    // The header sent is each column's canonical name, never the text typed.
    expect(result.ok && result.headers).toEqual(['procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count']);
    for (const spelling of [['HCPCS Code', 'Modifier', 'Unit', 'Place of Service', 'Payer Product', 'Service Date Band', 'Allowed Total', 'Claim Count'], ['code', 'modifier_set', 'units_per_line', 'pos', 'product', 'service_quarter', 'allowed', 'count']]) {
      const reordered = [spelling[7], ...spelling.slice(0, 7)] as string[];
      const content = csv(reordered.join(','), '1,97110,GP,1,11,medicare_ffs,2026 Q1,60.00');
      expect((await parse(content)).ok, spelling.join(',')).toBe(true);
    }
  });

  it('takes the template the page builds, once its rows are filled', async () => {
    const result = await parse(bytes(`${screeningTemplateCsv()}${ROW_A}\r\n`));
    expect(result.ok).toBe(true);
  });
});

describe('a file holding patient information (CO-04: refused, the column named, nothing sent)', () => {
  it('refuses a Member ID column, naming its position and its header, and keeps no cell value in the message', async () => {
    const header = HEADER.split(',');
    header.splice(3, 0, 'Member ID');
    const found = await messages(csv(header.join(','), '97110,GP,1,SYNTHMBR0001,11,ma_noncontracted,2026-Q1,600.00,40'));
    expect(found).toEqual(['Column 4 (“Member ID”) holds member IDs; remove it and upload again. A screening takes totals only, never patient information.']);
    expect(found.join(' ')).not.toContain('SYNTHMBR0001');
  });

  it('refuses a date-of-service column by its header, and a date in the quarter column as a date of service', async () => {
    const header = HEADER.replace('service_band', 'Date of Service');
    expect(await messages(csv(header, ROW_A.replace('2026-Q1', '2026-02-03')))).toEqual([
      'Column 6 (“Date of Service”) holds dates of service; remove it and upload again. A screening takes totals only, never patient information.',
      'The file has no service band column; add it.',
    ]);
    const dated = await messages(csv(HEADER, ROW_A.replace('2026-Q1', '02/03/2026')));
    expect(dated).toEqual(['Row 1: column 6 (“service_band”) holds dates of service. A screening takes a calendar quarter only, such as 2026-Q1; remove the dates and upload again.']);
  });

  it.each([
    ['claim numbers', ['Claim Number', 'Claim #', 'claim no', 'ICN', 'Patient Control Number', 'CLP01', 'Ref #', 'Clm #', 'Payer ICN', 'Encounter ID', 'Pat Ctrl #']],
    ['member IDs', ['Member ID', 'Subscriber ID', 'MBI', 'HICN', 'Policy Number', 'Patient ID', 'Account Number', 'MRN', 'SSN', 'Member ID #', 'MRN #', 'Subscriber', 'Medicare #', 'PatientNo', 'SS#']],
    ['dates of birth', ['DOB', 'D.O.B.', 'Date of Birth', 'Birthdate', 'Patient DOB', 'Age', 'Bday']],
    ['dates of service', ['DOS', 'Date of Service', 'Service Date', 'From Date', 'Visit Date', 'Date', 'Paid Date', 'Check Dt']],
    ['names', ['Name', 'Patient', 'Patient Name', 'First Name', 'Last Name', 'Surname', 'Guarantor', 'Responsible Party', 'Client Name', 'Patient Last', 'Patient First']],
  ])('refuses each common header for %s, naming its kind', async (kind, spellings) => {
    for (const spelling of spellings) {
      const found = await messages(csv(`${HEADER},${spelling}`, `${ROW_A},x`));
      expect(found[0], spelling).toBe(`Column 9 (“${spelling}”) holds ${kind}; remove it and upload again. A screening takes totals only, never patient information.`);
    }
  });

  it('refuses a column outside the eight, not as patient information, and only says to remove it', async () => {
    for (const spelling of ['Payer Name', 'Provider Name', 'NPI', 'Charge', 'Paid', 'Patient Responsibility']) {
      expect((await messages(csv(`${HEADER},${spelling}`, `${ROW_A},x`)))[0], spelling).toBe(`Column 9 (“${spelling}”) is not one of the eight screening columns; remove it.`);
    }
  });

  it('names a column of patient information however many other columns come before it, at any position', async () => {
    // A billing export's 22 columns, then a date of service, a member ID and a patient's name, then the eight.
    const exportColumns = ['Clinic', 'Location', 'Provider', 'Provider NPI', 'Referring', 'Payer', 'Payer ID', 'Plan', 'Charge', 'Paid', 'Adjusted', 'Balance'];
    const others = [...exportColumns, ...Array.from({ length: 10 }, (_, index) => `Export Field ${String(index + 1)}`)];
    const header = [...others, 'DOS', 'Member ID', 'Patient Name', ...HEADER.split(',')];
    const found = await messages(csv(header.join(','), [...others.map(() => 'x'), '2026-01-05', 'SYNTHMBR0001', 'SYNTHETIC', ...ROW_A.split(',')].join(',')));
    expect(found).toHaveLength(20);
    expect(found.slice(0, 3)).toEqual([
      'Column 23 (“DOS”) holds dates of service; remove it and upload again. A screening takes totals only, never patient information.',
      'Column 24 (“Member ID”) holds member IDs; remove it and upload again. A screening takes totals only, never patient information.',
      'Column 25 (“Patient Name”) holds names; remove it and upload again. A screening takes totals only, never patient information.',
    ]);
    expect(found.at(-1)).toBe('And 6 more problems like these.');
    expect(found.join(' ')).not.toContain('SYNTHMBR0001');
    // Past the 64th column, by its real position.
    const far = [...HEADER.split(','), ...Array.from({ length: 57 }, () => 'Charge'), 'Member ID'];
    expect((await messages(csv(far.join(','), [...ROW_A.split(','), ...Array.from({ length: 57 }, () => '1'), 'SYNTHMBR0001'].join(','))))[0]).toBe(
      'Column 66 (“Member ID”) holds member IDs; remove it and upload again. A screening takes totals only, never patient information.',
    );
  });

  it('never takes a header whose text is not all Latin letters and digits as one of the eight', async () => {
    const header = HEADER.replace('allowed_total', 'allowed (Иван Петров)');
    const found = await messages(csv(header, ROW_A));
    expect(found).toEqual(['Column 7 (“allowed (Иван Петров)”) is not one of the eight screening columns; remove it.', 'The file has no allowed total column; add it.']);
  });

  it('refuses a name in the code column, and a nine-digit number under the allowed total', async () => {
    for (const code of ['SMITH', 'Jones', 'A1B2C']) {
      expect(await messages(csv(HEADER, ROW_A.replace('97110', code))), code).toEqual(['Row 1, procedure code: it must be a CPT or HCPCS code of five characters, such as 97110 or G0283.']);
    }
    expect(await messages(csv(HEADER, ROW_A.replace('600.00,40', '123456789,24')))).toEqual([
      'Row 1, allowed total: it must be dollars with at most two decimals, such as 1234.56, from 0 to 999,999,999.99 and at most $25,000.00 a claim line.',
    ]);
  });
});

describe('the rows (CO-04)', () => {
  it('names each problem by row and column: a value, a quarter that has not started, a month, a repeated key, a short row', async () => {
    const found = await messages(csv(HEADER, ROW_A, ROW_A.replace('600.00', '1.00'), ROW_B.replace('2026-Q2', '2027-Q1'), ROW_B.replace('2026-Q2', '2026-03'), '97110,GP,1', ROW_A.replace('600.00', '6.001')));
    expect(found).toEqual([
      'Row 2 repeats row 1: the same code, modifiers, units, place of service, payer product and quarter. Add the two into one row.',
      'Row 3, service band: that quarter has not started yet.',
      'Row 4, service band: it must be a calendar quarter, such as 2026-Q1; a month is not taken, so use its quarter.',
      'Row 5 does not have one cell for each column of the header.',
      'Row 6, allowed total: it must be dollars with at most two decimals, such as 1234.56, from 0 to 999,999,999.99 and at most $25,000.00 a claim line.',
    ]);
  });

  it('shows at most 20 problems, the last saying how many more there were, and a band of dates of service first', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => `97110,GP,1,11,medicare_ffs,2026-Q1,x${String(index)},1`);
    const found = await messages(csv(HEADER, ...rows));
    expect(found).toHaveLength(20);
    expect(found.at(-1)).toBe('And 11 more problems like these.');
    const dated = await messages(csv(HEADER, ...rows, ROW_A.replace('2026-Q1', '5-Jan-26')));
    expect(dated[0]).toBe('Row 31: column 6 (“service_band”) holds dates of service. A screening takes a calendar quarter only, such as 2026-Q1; remove the dates and upload again.');
  });

  it('refuses a header with no rows, a file with no header, and more than 50,000 rows', async () => {
    expect(await messages(csv(HEADER))).toEqual(['The file has no rows under its header.']);
    expect(await messages(bytes('\r\n\r\n'))).toEqual(['The file has no rows under its header.']);
    const many = Array.from({ length: 50_001 }, (_, index) => `97110,GP,${String((index % 999) + 1)},${String((Math.floor(index / 999) % 99) + 1)},medicare_ffs,2026-Q1,1.00,1`);
    expect((await messages(csv(HEADER, ...many)))[0]).toMatch(/^The file has more than 50,000 rows/);
  });
});

describe('the file itself', () => {
  it('refuses a workbook, text that is not UTF-8 and a quote never closed', async () => {
    expect(await messages(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toEqual([expect.stringMatching(/spreadsheet\. Save it as CSV/)]);
    expect(await messages(new Uint8Array([0x61, 0xff, 0x62]))).toEqual([expect.stringMatching(/not UTF-8 text/)]);
    expect(await messages(bytes(`${HEADER}\n"97110,GP`))).toEqual([expect.stringMatching(/a quote is never closed/)]);
    expect(await messages(bytes(`${HEADER}\n"97110"x,GP`))).toEqual([expect.stringMatching(/text after its closing quote/)]);
  });

  it('reads a chosen File by its bytes, refusing a spreadsheet by name before reading it', async () => {
    const content = csv(HEADER, ROW_A);
    expect((await parseScreeningFile(new File([content as Uint8Array<ArrayBuffer>], 'totals.csv', { type: 'text/csv' }), NOW)).ok).toBe(true);
    expect(await parseScreeningFile(new File([content as Uint8Array<ArrayBuffer>], 'totals.xlsx'), NOW)).toEqual({ ok: false, messages: [expect.stringMatching(/Save it as CSV/)], reasons: [] });
  });
});

describe('a refusal’s messages', () => {
  it('name a column by its position alone where no header is given (the server’s), never a value', () => {
    expect(reasonMessage({ code: 'phi_column', column: 4, phi: 'member_id' })).toBe('Column 4 holds member IDs; remove it and upload again. A screening takes totals only, never patient information.');
    expect(reasonMessage({ code: 'duplicate_column', column: 3, field: 'units' }, ['a', 'b', 'Unit'])).toBe('Column 3 (“Unit”) is a second units column; keep one.');
    expect(reasonMessage({ code: 'missing_column', field: 'claim_count' })).toBe('The file has no claim count column; add it.');
    expect(reasonMessage({ code: 'row_count_mismatch' })).toMatch(/Choose the file again/);
    expect(reasonMessage({ code: 'invalid_value', row: 12_345, field: 'units' })).toBe('Row 12,345, units: it must be a whole number of units from 1 to 999.');
  });
});
