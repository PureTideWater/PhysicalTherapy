import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_POSTING_TEMPLATES,
  EFT_FIELDS,
  POSTING_FIELDS,
  REQUIRED_EFT_FIELDS,
  REQUIRED_POSTING_FIELDS,
  SYNTHETIC_BANK_EXPORT_V1,
  SYNTHETIC_PM_EXPORT_V1,
  TEMPLATE_STATUSES,
  VENDOR_POSTING_TEMPLATES,
  type EftTemplate,
  type PostingTemplate,
  exportColumns,
  procedureCodeOf,
  readDate,
  readEftExport,
  readPostingExport,
  templateProblems,
} from './templates';

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

/** What packages/synth's vendor manifest says of a format and the rows its export holds (fixtures/synthetic/emr/<id>/manifest.json). */
interface VendorManifest {
  readonly format: string;
  readonly kind: string;
  readonly status: string;
  readonly layout: { readonly dateFormat: string; readonly markerColumn: string };
  readonly columns: readonly { readonly header: string; readonly field: string }[];
  readonly rows: readonly { readonly postedOn: string; readonly checkOrTrace: string; readonly amountCents: string; readonly payerName: string | null; readonly claimReference: string | null; readonly procedureCode: string | null; readonly serviceDate: string | null; readonly batch: string | null }[];
}

describe('the vendor posting templates read packages/synth’s placeholders of their exports (CO-03; docs/adr/0059)', () => {
  const manifest = (id: string) => JSON.parse(fixture(`emr/${id}/manifest.json`)) as VendorManifest;

  it('are built in beside the SYNTHETIC template, each unconfirmed, and usable', () => {
    expect(BUILT_IN_POSTING_TEMPLATES.map((template) => [template.id, template.status])).toEqual([
      ['synthetic_pm_export_v1', 'confirmed'],
      ['webpt_billing_posting_v0', 'unconfirmed'],
      ['prompt_posting_v0', 'unconfirmed'],
      ['spry_posting_v0', 'unconfirmed'],
      ['raintree_posting_v0', 'unconfirmed'],
    ]);
    expect(TEMPLATE_STATUSES).toEqual(['confirmed', 'unconfirmed']);
    for (const template of BUILT_IN_POSTING_TEMPLATES) {
      expect(templateProblems(template, POSTING_FIELDS, REQUIRED_POSTING_FIELDS), template.id).toEqual([]);
      // posting_row.template's CHECK.
      expect(template.id).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });

  it('map each format’s columns to the posting fields as its manifest says, and its marker column to none', () => {
    for (const template of VENDOR_POSTING_TEMPLATES) {
      const read = manifest(template.id);
      expect([read.format, read.kind, read.status, read.layout.dateFormat], template.id).toEqual([template.id, 'posting_export', 'FORMAT_UNCONFIRMED', template.dateFormat]);
      const mapped = Object.fromEntries(read.columns.filter((column) => column.header !== read.layout.markerColumn).map((column) => [column.field, column.header]));
      expect(template.columns, template.id).toEqual(mapped);
      expect(Object.values(template.columns), template.id).not.toContain(read.layout.markerColumn);
    }
  });

  it('read each vendor export by path into the manifest’s rows, amounts in integer cents, nothing left out', () => {
    for (const template of VENDOR_POSTING_TEMPLATES) {
      const read = readPostingExport(fixture(`emr/${template.id}/posting-export.csv`), template);
      if (read.kind !== 'read') {
        throw new Error(`${template.id} reads`);
      }
      expect(read.problems, template.id).toEqual([]);
      expect(
        read.rows.map((row) => ({ postedOn: row.postedOn, checkOrTrace: row.checkOrTrace, amountCents: row.amountCents.toString(), payerName: row.payerName, claimReference: row.claimReference, procedureCode: row.procedureCode, serviceDate: row.serviceDate, batch: row.batch })),
        template.id,
      ).toEqual(manifest(template.id).rows);
      expect(read.rows.every((row) => typeof row.amountCents === 'bigint'), template.id).toBe(true);
    }
  });

  it('read the same rows, with the same fingerprints, as the SYNTHETIC template reads from the source cases', () => {
    const sources = ['LED-04/posting-export.csv', 'LED-08/posting-export-again.csv', 'LED-09/lines-posting-export.csv', 'LED-06/recoupment-posting-export.csv'].map((source) => readPostingExport(fixture(source), SYNTHETIC_PM_EXPORT_V1));
    const synthetic = sources.flatMap((read) => (read.kind === 'read' ? read.rows : []));
    expect(synthetic).toHaveLength(5);
    const fields = (row: (typeof synthetic)[number]) => [row.postedOn, row.checkOrTrace, row.amountCents, row.payerName, row.claimReference, row.procedureCode, row.serviceDate, row.batch];
    for (const template of VENDOR_POSTING_TEMPLATES) {
      const read = readPostingExport(fixture(`emr/${template.id}/posting-export.csv`), template);
      const rows = read.kind === 'read' ? read.rows : [];
      expect(rows.map(fields), template.id).toEqual(synthetic.map(fields));
      // The same posting in a vendor's export is the same posting_row: it is stored, and matched, once.
      expect(rows.map((row) => JSON.parse(row.fingerprint) as unknown), template.id).toEqual(synthetic.map((row) => JSON.parse(row.fingerprint) as unknown));
    }
  });

  it('read the take-back (LED-06’s recoupment) as a negative amount in integer cents under every template, as the SYNTHETIC one does', () => {
    for (const template of [SYNTHETIC_PM_EXPORT_V1, ...VENDOR_POSTING_TEMPLATES]) {
      const read = readPostingExport(fixture(template === SYNTHETIC_PM_EXPORT_V1 ? 'LED-06/recoupment-posting-export.csv' : `emr/${template.id}/posting-export.csv`), template);
      const rows = read.kind === 'read' ? read.rows : [];
      expect(read.kind === 'read' && read.problems, template.id).toEqual([]);
      const negative = rows.filter((row) => row.amountCents < 0n);
      expect(negative.map((row) => [row.postedOn, row.checkOrTrace, row.amountCents, row.claimReference]), template.id).toEqual([['2026-08-05', 'SYNEFTLED06003', -1800n, 'SYNPCNLED06001']]);
    }
  });

  it('do not read another vendor’s export: its columns are missing', () => {
    const [webpt, prompt] = VENDOR_POSTING_TEMPLATES as [PostingTemplate, PostingTemplate];
    expect(readPostingExport(fixture(`emr/${prompt.id}/posting-export.csv`), webpt)).toMatchObject({ kind: 'refused', reason: 'missing_columns' });
  });
});

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
    expect(exportColumns(fixture('LED-04/posting-export.csv'))).toEqual(['Post Date', 'Check/EFT #', 'Payer', 'Claim Ref', 'CPT', 'DOS', 'Paid Amount', 'Batch', 'Payee ID']);
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

describe('templates at their limits: each bound, each anchor and each fingerprint, exactly', () => {
  const practice = (columns: PostingTemplate['columns'], system = 'SYNTHETIC OTHER PM'): PostingTemplate => ({ id: 'practice', system, columns, dateFormat: 'YYYY-MM-DD' });

  it('names the bank export’s required fields, and its built-in template by its ID', () => {
    expect(REQUIRED_EFT_FIELDS).toEqual(['deposited_on', 'trace', 'amount']);
    expect(SYNTHETIC_BANK_EXPORT_V1.id).toBe('synthetic_bank_export_v1');
    const noTrace: EftTemplate = { ...SYNTHETIC_BANK_EXPORT_V1, columns: { deposited_on: 'Date', amount: 'Amount' } };
    expect(templateProblems(noTrace, EFT_FIELDS, REQUIRED_EFT_FIELDS)).toEqual(['the template names the column for trace']);
  });

  it('takes a header and a system of exactly 100 characters, and counts a header of spaces as blank', () => {
    expect(templateProblems(practice({ posted_on: 'p'.repeat(100), check_or_trace: 'Check', amount: 'Amount' }, 's'.repeat(100)), POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual([]);
    expect(templateProblems(practice({ posted_on: 'Date', check_or_trace: '   ', amount: 'Amount' }), POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual(['the column for check_or_trace is a header of 1 to 100 characters']);
  });

  it('counts two headers as one column exactly when a file’s header row would match them as one: trimmed, in lower case', () => {
    expect(templateProblems(practice({ posted_on: 'Date', check_or_trace: ' date ', amount: 'Amount' }), POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual(['each column holds one field']);
    // Upper case would fold "ß" into "SS"; the header row is matched in lower case, where these are two columns.
    const twoColumns = practice({ posted_on: 'Maße', check_or_trace: 'MASSE', amount: 'Amount' });
    expect(templateProblems(twoColumns, POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual([]);
    expect(readPostingExport('Maße,MASSE,Amount\n2026-06-11,880060040002,30.00\n', twoColumns)).toMatchObject({ kind: 'read', problems: [], rows: [{ postedOn: '2026-06-11', checkOrTrace: '880060040002' }] });
  });

  it('counts a header that is not text as a blank one, so a blank and a non-text header are one column', () => {
    expect(templateProblems(practice({ posted_on: 'Date', check_or_trace: '', amount: 7 as unknown as string }), POSTING_FIELDS, REQUIRED_POSTING_FIELDS)).toEqual([
      'the column for check_or_trace is a header of 1 to 100 characters',
      'the column for amount is a header of 1 to 100 characters',
      'each column holds one field',
    ]);
  });

  it('reads a date only from the whole cell, in four-digit years', () => {
    expect(readDate('x6/9/2026', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('106/9/2026', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('6/9/20261', 'MM/DD/YYYY')).toBeNull();
    expect(readDate('6/9/2026', 'MM/DD/YYYY')).toBe('2026-06-09');
    // A calendar date's own expanded-year form, which Date reads, is still not YYYY-MM-DD.
    expect(new Date('+010000-01T00:00:00Z').toISOString().slice(0, 10)).toBe('+010000-01');
    expect(readDate('+010000-01', 'YYYY-MM-DD')).toBeNull();
  });

  it('reads the template’s headers and the row’s cells trimmed, a short row’s missing cells as empty, and keeps only the mapped cells in raw', () => {
    const template = practice({ posted_on: ' posted ', check_or_trace: 'check ', amount: ' amt', payer: 'payer' });
    const read = readPostingExport('posted,check,amt,payer\n 2026-06-11 , 880060040002 , 30.00 \n', template);
    expect(read).toEqual({
      kind: 'read',
      problems: [],
      rows: [
        {
          rowNo: 1,
          postedOn: '2026-06-11',
          checkOrTrace: '880060040002',
          amountCents: 3000n,
          payerName: null,
          claimReference: null,
          procedureCode: null,
          serviceDate: null,
          batch: null,
          raw: { posted_on: '2026-06-11', check_or_trace: '880060040002', amount: '30.00', payer: '' },
          fingerprint: JSON.stringify([JSON.stringify(['posting', '2026-06-11', '880060040002', '3000', null, null, null, null, null]), 0]),
        },
      ],
    });
  });

  it('keeps a check or trace number of up to 64 characters, in a posting export and in a bank export', () => {
    const posting = readPostingExport(`${SYNTHETIC_HEADER}\n06/11/2026,${'9'.repeat(64)},P,,,,30.00,B\n`, SYNTHETIC_PM_EXPORT_V1);
    expect(posting).toMatchObject({ kind: 'read', problems: [], rows: [{ checkOrTrace: '9'.repeat(64) }] });
    const header = 'Date,Description,Trace Number,Amount,Batch Reference';
    const bank = readEftExport(`${header}\n2026-06-09,D,${'T'.repeat(64)},30.00,\n2026-06-09,D,${'T'.repeat(65)},30.00,\n`);
    expect(bank).toMatchObject({ kind: 'read', problems: [{ rowNo: 2, field: 'trace' }], rows: [{ rowNo: 1, trace: 'T'.repeat(64) }] });
    expect(bank.kind === 'read' && bank.rows).toHaveLength(1);
  });

  it('fingerprints a posting row by its canonical text, the code cell as written, and its occurrence counted from zero', () => {
    const line = '06/11/2026,880060040002,SYNTHETIC PAYER L,SYNPCN0001,97110-GP,03/09/2026,30.00,SYNBATCH-0801';
    const read = readPostingExport(`${SYNTHETIC_HEADER}\n${line}\n${line}\n${line}\n`, SYNTHETIC_PM_EXPORT_V1);
    const canonical = JSON.stringify(['posting', '2026-06-11', '880060040002', '3000', 'SYNTHETIC PAYER L', 'SYNPCN0001', '97110-GP', '2026-03-09', 'SYNBATCH-0801']);
    expect(read.kind === 'read' && read.rows.map((row) => row.fingerprint)).toEqual([0, 1, 2].map((occurrence) => JSON.stringify([canonical, occurrence])));
  });

  it('fingerprints a bank row by its canonical text and its occurrence', () => {
    const header = 'Date,Description,Trace Number,Amount,Batch Reference';
    const read = readEftExport(`${header}\n2026-06-09,D,SYNEFT1,30.00,BATCH-1\n2026-06-09,D,SYNEFT1,30.00,BATCH-1\n`);
    const canonical = JSON.stringify(['eft', '2026-06-09', 'SYNEFT1', '3000', 'BATCH-1']);
    expect(read.kind === 'read' && read.rows.map((row) => row.fingerprint)).toEqual([JSON.stringify([canonical, 0]), JSON.stringify([canonical, 1])]);
  });
});
