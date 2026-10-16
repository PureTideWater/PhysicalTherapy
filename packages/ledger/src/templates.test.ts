import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EFT_FIELDS, POSTING_FIELDS, REQUIRED_EFT_FIELDS, REQUIRED_POSTING_FIELDS, SYNTHETIC_BANK_EXPORT_V1, SYNTHETIC_PM_EXPORT_V1, type PostingTemplate, exportColumns, procedureCodeOf, readDate, readEftExport, readPostingExport, templateProblems } from './templates';

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');

describe('the built-in templates read packages/synth’s exports (PRD 20, Posting-export templates)', () => {
  it('reads the synthetic posting export: one check-level row (LED-04)', () => {
    const read = readPostingExport(fixture('LED-04/posting-export.csv'), SYNTHETIC_PM_EXPORT_V1);
    expect(read).toMatchObject({
      kind: 'read',
      problems: [],
      rows: [{ rowNo: 1, postedOn: '2026-06-11', checkOrTrace: '880060040002', amountCents: 3000n, payerName: 'SYNTHETIC PAYER L', claimReference: null, procedureCode: null, serviceDate: null, batch: 'SYNBATCH-0401' }],
    });
    expect(read.kind === 'read' && read.rows[0]?.raw).toEqual({ posted_on: '06/11/2026', check_or_trace: '880060040002', amount: '30.00', payer: 'SYNTHETIC PAYER L', procedure_code: '', service_date: '', batch: 'SYNBATCH-0401' });
  });

  it('reads the synthetic bank export: one deposit by trace number (LED-05)', () => {
    expect(readEftExport(fixture('LED-05/eft-export.csv'))).toMatchObject({
      kind: 'read',
      problems: [],
      rows: [{ rowNo: 1, depositedOn: '2026-06-09', trace: 'SYNEFTLED05002', amountCents: 3000n, batchReference: null }],
    });
  });

  it('gives a row repeated in a later export the fingerprint it had, so it is stored once (LED-08)', () => {
    const first = readPostingExport(fixture('LED-08/posting-export.csv'), SYNTHETIC_PM_EXPORT_V1);
    const again = readPostingExport(fixture('LED-08/posting-export-again.csv'), SYNTHETIC_PM_EXPORT_V1);
    if (first.kind !== 'read' || again.kind !== 'read') {
      throw new Error('both exports read');
    }
    expect(again.rows.map((row) => row.fingerprint)).toEqual([first.rows[0]?.fingerprint, expect.any(String)]);
    expect(again.rows[1]?.fingerprint).not.toBe(first.rows[0]?.fingerprint);
  });

  it('tells two identical rows of one export apart by their occurrence', () => {
    const line = '06/11/2026,880060080002,SYNTHETIC PAYER L,,,,30.00,SYNBATCH-0801';
    const read = readPostingExport(`${SYNTHETIC_HEADER}\r\n${line}\r\n${line}\r\n`, SYNTHETIC_PM_EXPORT_V1);
    expect(read.kind === 'read' && new Set(read.rows.map((row) => row.fingerprint)).size).toBe(2);
  });
});

const SYNTHETIC_HEADER = 'Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch';

describe('reading an export row by row', () => {
  it('reads a line-level row with its claim reference, code and service date, the claim reference left out of raw', () => {
    const read = readPostingExport(`${SYNTHETIC_HEADER}\r\n06/11/2026,880060040002,SYNTHETIC PAYER L,SYNPCN0001,97110,03/09/2026,-70.00,B\r\n`, SYNTHETIC_PM_EXPORT_V1);
    expect(read).toMatchObject({ kind: 'read', rows: [{ claimReference: 'SYNPCN0001', procedureCode: '97110', serviceDate: '2026-03-09', amountCents: -7000n }] });
    expect(read.kind === 'read' && Object.keys(read.rows[0]?.raw ?? {})).not.toContain('claim_reference');
  });

  it('leaves out and counts each row with an unreadable field, never keeping its value', () => {
    const rows = [
      '13/11/2026,1,P,,,,30.00,B',
      '06/11/2026,,P,,,,30.00,B',
      `06/11/2026,${'9'.repeat(65)},P,,,,30.00,B`,
      '06/11/2026,1,P,,,,30.005,B',
      '06/11/2026,1,P,,,02/30/2026,30.00,B',
      '06/11/2026,1,P,,,,30.00,B',
    ];
    const read = readPostingExport(`${SYNTHETIC_HEADER}\n${rows.join('\n')}\n`, SYNTHETIC_PM_EXPORT_V1);
    expect(read).toMatchObject({
      kind: 'read',
      problems: [
        { rowNo: 1, field: 'posted_on' },
        { rowNo: 2, field: 'check_or_trace' },
        { rowNo: 3, field: 'check_or_trace' },
        { rowNo: 4, field: 'amount' },
        { rowNo: 5, field: 'service_date' },
      ],
    });
    expect(read.kind === 'read' && read.rows.map((row) => row.rowNo)).toEqual([6]);
  });

  it('reads a CPT written with its modifiers as its code, keeps the cell in raw, and leaves out a row its table could not hold', () => {
    const rows = [
      '06/11/2026,1,P,SYNPCN0001,97110-GP,03/09/2026,30.00,B',
      '06/11/2026,1,P,SYNPCN0001,97110:59:KX,03/09/2026,30.00,B',
      '06/11/2026,1,P,SYNPCN0001,97110 GP,03/09/2026,30.00,B',
      '06/11/2026,1,P,SYNPCN0001,97110-G,03/09/2026,30.00,B',
      '06/11/2026,1,P,SYNPCN0001,9711O/GP,03/09/2026,30.00,B',
      `06/11/2026,1,${'P'.repeat(201)},,,,30.00,B`,
      `06/11/2026,1,${'P'.repeat(200)},,,,30.00,${'B'.repeat(101)}`,
      `06/11/2026,1,${'P'.repeat(200)},,,,30.00,${'B'.repeat(100)}`,
    ];
    const read = readPostingExport(`${SYNTHETIC_HEADER}\n${rows.join('\n')}\n`, SYNTHETIC_PM_EXPORT_V1);
    expect(read).toMatchObject({
      kind: 'read',
      problems: [
        { rowNo: 4, field: 'procedure_code' },
        { rowNo: 5, field: 'procedure_code' },
        { rowNo: 6, field: 'payer' },
        { rowNo: 7, field: 'batch' },
      ],
    });
    if (read.kind !== 'read') {
      throw new Error('the export reads');
    }
    expect(read.rows.map((row) => [row.rowNo, row.procedureCode])).toEqual([
      [1, '97110'],
      [2, '97110'],
      [3, '97110'],
      [8, null],
    ]);
    expect(read.rows[0]?.raw.procedure_code).toBe('97110-GP');
    // Rows that differ only by modifier are two rows, never one row repeated.
    expect(new Set(read.rows.slice(0, 3).map((row) => row.fingerprint)).size).toBe(3);
    expect([procedureCodeOf('G0283'), procedureCodeOf('97110-GP-59-KX-XU'), procedureCodeOf('97110-GP-59-KX-XU-AB'), procedureCodeOf('')]).toEqual(['G0283', '97110', null, null]);
  });

  it('leaves out a bank row whose batch reference is too long for its table', () => {
    const header = 'Date,Description,Trace Number,Amount,Batch Reference';
    const read = readEftExport(`${header}\n2026-06-09,D,SYNEFT1,30.00,${'B'.repeat(101)}\n2026-06-09,D,SYNEFT2,30.00,${'B'.repeat(100)}\n`);
    expect(read).toMatchObject({ kind: 'read', problems: [{ rowNo: 1, field: 'batch_reference' }], rows: [{ rowNo: 2, trace: 'SYNEFT2' }] });
  });

  it('reads a bank export row by row, with its batch reference', () => {
    const header = 'Date,Description,Trace Number,Amount,Batch Reference';
    const read = readEftExport(`${header}\n2026-06-31,D,T1,1.00,\n2026-06-09,D,,1.00,\n2026-06-09,D,T3,x,\n2026-06-09,D,T4,1.00,BATCH-1\n`);
    expect(read).toMatchObject({
      kind: 'read',
      problems: [
        { rowNo: 1, field: 'deposited_on' },
        { rowNo: 2, field: 'trace' },
        { rowNo: 3, field: 'amount' },
      ],
      rows: [{ rowNo: 4, trace: 'T4', batchReference: 'BATCH-1' }],
    });
  });

  it('refuses a file that is not CSV, is empty, or lacks a column the template names', () => {
    expect(readPostingExport('"open', SYNTHETIC_PM_EXPORT_V1)).toEqual({ kind: 'refused', reason: 'not_csv', missing: [] });
    expect(readEftExport('\r\n')).toEqual({ kind: 'refused', reason: 'empty', missing: [] });
    expect(readPostingExport('Post Date,Paid Amount\n', SYNTHETIC_PM_EXPORT_V1)).toMatchObject({ kind: 'refused', reason: 'missing_columns', missing: ['check_or_trace', 'payer', 'claim_reference', 'procedure_code', 'service_date', 'batch'] });
    expect(readEftExport('Date,Trace Number\n')).toMatchObject({ kind: 'refused', reason: 'missing_columns' });
  });

  it('reads a practice’s own template: its headers in any case and order, ISO dates, short rows', () => {
    const template: PostingTemplate = { id: 'practice', system: 'SYNTHETIC OTHER PM', columns: { posted_on: 'posted', check_or_trace: 'check', amount: 'amt' }, dateFormat: 'YYYY-MM-DD' };
    expect(readPostingExport('AMT, Check ,POSTED\n30.00,880060040002,2026-06-11\n', template)).toMatchObject({
      kind: 'read',
      rows: [{ postedOn: '2026-06-11', checkOrTrace: '880060040002', amountCents: 3000n, payerName: null, batch: null, raw: { posted_on: '2026-06-11', check_or_trace: '880060040002', amount: '30.00' } }],
    });
    expect(readPostingExport('amt,check,posted\n30.00\n', template)).toMatchObject({ kind: 'read', problems: [{ rowNo: 1, field: 'posted_on' }] });
  });
});

describe('an export’s columns, for the template mapping screen (PRD 20)', () => {
  it('gives the header row’s columns, trimmed and without blanks', () => {
    expect(exportColumns(fixture('LED-04/posting-export.csv'))).toEqual(['Post Date', 'Check/EFT #', 'Payer', 'Claim Ref', 'CPT', 'DOS', 'Paid Amount', 'Batch']);
    expect(exportColumns(' Date , Amount ,,"Trace, Number"\r\n2026-06-09,30.00,,T1\r\n')).toEqual(['Date', 'Amount', 'Trace, Number']);
  });

  it('gives nothing for a file that is not CSV or has no header', () => {
    expect(exportColumns('"never closed')).toBeNull();
    expect(exportColumns('')).toBeNull();
    expect(exportColumns('\n\n')).toBeNull();
  });
});

describe('templates and dates', () => {
  it('reads dates written either way, and refuses what is not a calendar date', () => {
    expect(readDate('6/9/2026', 'MM/DD/YYYY')).toBe('2026-06-09');
    expect(readDate('2026-06-09', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('02/29/2026', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('2026-06-09', 'YYYY-MM-DD')).toBe('2026-06-09');
    expect(readDate('2026-6-9', 'YYYY-MM-DD')).toBeNull();
    expect(readDate('2026-13-01', 'YYYY-MM-DD')).toBeNull();
  });

  it('checks a template: known fields, headers, the required fields, one field per column, a date format and a system', () => {
    expect(templateProblems(SYNTHETIC_PM_EXPORT_V1, POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual([]);
    expect(templateProblems(SYNTHETIC_BANK_EXPORT_V1, EFT_FIELDS, REQUIRED_EFT_FIELDS)).toEqual([]);
    const bad = {
      id: 'practice',
      system: ' ',
      columns: { posted_on: 'Date', amount: 'date', check_or_trace: '', claim: 'Ref', batch: 'x'.repeat(101), payer: 7 as unknown as string },
      dateFormat: 'DD.MM.YYYY',
    } as unknown as PostingTemplate;
    expect(templateProblems(bad, POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual([
      'the column for check_or_trace is a header of 1 to 100 characters',
      'claim is not a field of the export',
      'the column for batch is a header of 1 to 100 characters',
      'the column for payer is a header of 1 to 100 characters',
      'each column holds one field',
      'dates are written MM/DD/YYYY or YYYY-MM-DD',
      'the template names its system in 1 to 100 characters',
    ]);
    expect(templateProblems({ ...SYNTHETIC_PM_EXPORT_V1, system: 'x'.repeat(101), columns: { posted_on: 'a' } }, POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual([
      'the template names the column for check_or_trace',
      'the template names the column for amount',
      'the template names its system in 1 to 100 characters',
    ]);
  });
});
