import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseAmount, parseCents, sumCents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { type CaseExpectation } from '../../expected/types';
import { SYNTH_SENDER_ID } from '../../identity';
import { driftFrom } from '../../write';
import { type CanonicalEraRow, ERA_SOURCES, eraRowsOf, vendorEraExport } from './era';
import { EMR_DIR, type EmrManifest, emrFixtureSets, emrWritable, staleEmrDirectories } from './fixtures';
import { type CanonicalPostingRow, POSTING_SOURCES, postingSourceRows, readSyntheticPostingExport, vendorPostingExport } from './posting';
import {
  ERA_FORMATS,
  FIELD_TYPES,
  FORMAT_KINDS,
  POSTING_FORMATS,
  VENDORS,
  VENDOR_FORMATS,
  type VendorFormat,
  findVendorFormat,
  formatProblems,
} from './registry';
import { VendorFormatError, readTable, vendorCsv, writeDate } from './table';

/**
 * The EMR export formats and their fixtures (Change Order 001, CO-03; docs/adr/0059): one placeholder
 * per vendor and kind, every one FORMAT_UNCONFIRMED; generated deterministically from the case
 * registry's synthetic files; committed byte for byte as generated; SYNTHSENDER in each one's marker
 * column; an ERA export's payments totalling their 835s to the cent.
 */

const repository = path.resolve(import.meta.dirname, '../../../../..');
const syntheticRoot = path.join(repository, 'fixtures/synthetic');
const sets = emrFixtureSets();
const text = (bytes: Uint8Array | undefined) => Buffer.from(bytes ?? new Uint8Array()).toString('utf8');
const fileOf = (format: VendorFormat) => sets.find((set) => set.id === format.id)?.files[0];

describe('the vendor format registry', () => {
  it('holds a posting export and an ERA export for each of the four vendors, by ID', () => {
    expect(VENDOR_FORMATS.map((format) => format.id)).toEqual([
      'webpt_billing_posting_v0',
      'webpt_billing_era_v0',
      'prompt_posting_v0',
      'prompt_era_v0',
      'spry_posting_v0',
      'spry_era_v0',
      'raintree_posting_v0',
      'raintree_era_v0',
    ]);
    for (const vendor of VENDORS) {
      expect(VENDOR_FORMATS.filter((format) => format.vendor === vendor).map((format) => format.kind)).toEqual([...FORMAT_KINDS]);
    }
    expect(findVendorFormat('spry_era_v0')).toBe(ERA_FORMATS[2]);
    expect(findVendorFormat('spry_era_v1')).toBeUndefined();
  });

  it('marks every format FORMAT_UNCONFIRMED, with no confirmation and a note that no format description has been received', () => {
    for (const format of VENDOR_FORMATS) {
      expect(format.status, format.id).toBe('FORMAT_UNCONFIRMED');
      expect(format.confirmation, format.id).toBeNull();
      expect(format.note, format.id).toMatch(/^FORMAT_UNCONFIRMED: no format description .* has been received\. /);
      expect(format.note, format.id).toContain('redacted headers only, never a file');
    }
  });

  it('finds no problem in any entry, and every problem in a broken one', () => {
    for (const format of VENDOR_FORMATS) {
      expect(formatProblems(format), format.id).toEqual([]);
    }
    const base = POSTING_FORMATS[0] as (typeof POSTING_FORMATS)[number];
    const [first, second] = base.columns;
    const broken = {
      ...base,
      id: 'WebPT',
      columns: [{ ...first, header: ' Payment Date' }, { ...second, header: 'payment date' }, { header: 'x', field: 'nope', type: 'text' }, { header: 'y', field: 'payer', type: 'text' }, { header: 'z', field: 'payer', type: 'text' }],
      markerColumn: 'Payment Date',
      dateFormat: 'DD.MM.YYYY',
      listSeparator: '""',
      status: 'FORMAT_CONFIRMED',
      note: 'confirmed',
    } as unknown as VendorFormat;
    expect(formatProblems(broken)).toEqual([
      'the ID is <vendor>_posting_v<version> and a template name',
      'each header is 1 to 100 characters with no quote, line break or edge space',
      'each header names one column',
      'each column holds a field of a posting_export',
      'each field is in one column',
      'the amount column is missing',
      'the payee_id column is missing',
      'the marker column is the payee_id column, and its header says ID or identifier',
      'dates are written MM/DD/YYYY or YYYY-MM-DD',
      'a list is separated by one character other than a quote or a line break',
      'a confirmed format names its format description, and an unconfirmed one none',
    ]);
    const era = ERA_FORMATS[0] as (typeof ERA_FORMATS)[number];
    expect(formatProblems({ ...era, status: 'FORMAT_CONFIRMED', confirmation: { receivedOn: '17 Oct', reference: ' ' }, note: 'confirmed' })).toEqual(['a confirmation has the date it was received and the description’s reference']);
    expect(formatProblems({ ...era, note: 'placeholder' })).toEqual(['an unconfirmed format says so in its note']);
    // An ERA export names its payee and its payer: the remittance needs both, and D12's export duplicate key the payee.
    const anonymous = { ...era, columns: era.columns.filter((column) => column.field !== 'payee_id' && column.field !== 'payer_name') };
    expect(formatProblems(anonymous)).toEqual(['the payer_name column is missing', 'the payee_id column is missing']);
    // Confirming a format is data alone.
    expect(formatProblems({ ...era, status: 'FORMAT_CONFIRMED', confirmation: { receivedOn: '2026-11-02', reference: 'SYNTHETIC redacted format description 1' } })).toEqual([]);
  });

  it('types every column by its field, and names an identifier column for the marker', () => {
    for (const format of VENDOR_FORMATS) {
      for (const column of format.columns) {
        expect(column.type, `${format.id} ${column.header}`).toBe(FIELD_TYPES[column.field]);
      }
      expect(format.columns.find((column) => column.header === format.markerColumn)?.type, format.id).toBe('identifier');
    }
  });
});

describe('the vendor exports', () => {
  it('generate the same bytes every time', () => {
    const again = emrFixtureSets();
    const digest = (list: typeof sets) => list.flatMap((set) => set.files.map((file) => [file.path, createHash('sha256').update(file.bytes).digest('hex')]));
    expect(digest(again)).toEqual(digest(sets));
  });

  it('carry SYNTHSENDER in the marker column of every row, a header row first, in the format’s line endings and byte-order mark', () => {
    for (const format of VENDOR_FORMATS) {
      const content = text(fileOf(format)?.bytes);
      expect(content.startsWith('﻿'), format.id).toBe(format.bom);
      expect(content.includes('\r\n'), format.id).toBe(format.lineEnding === 'CRLF');
      const [header, ...rows] = readTable(content);
      expect(header, format.id).toEqual(format.columns.map((column) => column.header));
      const marker = header?.indexOf(format.markerColumn) ?? -1;
      expect(marker, format.id).toBeGreaterThanOrEqual(0);
      expect(rows.length, format.id).toBeGreaterThan(0);
      expect(rows.every((row) => row.length === format.columns.length && row[marker] === SYNTH_SENDER_ID), format.id).toBe(true);
    }
  });

  it('write money as plain decimals and dates in the format’s own way, and name only SYNTHETIC payers', () => {
    for (const format of VENDOR_FORMATS) {
      const [, ...rows] = readTable(text(fileOf(format)?.bytes));
      format.columns.forEach((column, index) => {
        const cells = rows.map((row) => row[index] ?? '').filter((cell) => cell !== '');
        if (column.type === 'money') {
          expect(cells.every((cell) => /^-?\d+\.\d{2}$/.test(cell)), `${format.id} ${column.header}`).toBe(true);
        }
        if (column.type === 'date') {
          expect(cells.every((cell) => (format.dateFormat === 'YYYY-MM-DD' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{2}\/\d{2}\/\d{4}$/).test(cell)), `${format.id} ${column.header}`).toBe(true);
        }
        if (column.field === 'payer' || column.field === 'payer_name') {
          expect(cells.every((cell) => cell.startsWith('SYNTHETIC ')), `${format.id} ${column.header}`).toBe(true);
        }
      });
    }
  });

  it('write each posting format’s rows as the source case’s synthetic export holds them (LED-04, LED-08, LED-09, LED-06’s take-back)', () => {
    const sources = postingSourceRows();
    expect(sources.map((source) => [source.source.caseId, source.source.file, source.rows.length])).toEqual([
      ['LED-04', 'posting-export.csv', 1],
      ['LED-08', 'posting-export-again.csv', 2],
      ['LED-09', 'lines-posting-export.csv', 1],
      ['LED-06', 'recoupment-posting-export.csv', 1],
    ]);
    // The committed source files read the same.
    for (const source of POSTING_SOURCES) {
      const committed = readFileSync(path.join(syntheticRoot, source.caseId, source.file));
      expect(readSyntheticPostingExport(new Uint8Array(committed), source.file)).toEqual(sources.find((item) => item.source === source)?.rows);
    }
    const rows = sources.flatMap((source) => source.rows);
    expect(rows[3]).toEqual({ postedOn: '2026-06-11', checkOrTrace: '880060090004', amountCents: '10000', payerName: 'SYNTHETIC PAYER L', claimReference: 'SYNPCNLED09003', procedureCode: '97110', serviceDate: '2026-03-09', batch: 'SYNBATCH-0902' });
    // A take-back: LED-06's recoupment posted as a negative amount, written with a leading minus in every format.
    expect(rows[4]).toEqual({ postedOn: '2026-08-05', checkOrTrace: 'SYNEFTLED06003', amountCents: '-1800', payerName: 'SYNTHETIC PAYER L', claimReference: 'SYNPCNLED06001', procedureCode: null, serviceDate: null, batch: 'SYNBATCH-0602' });
    for (const format of POSTING_FORMATS) {
      const set = sets.find((item) => item.id === format.id);
      expect(set?.manifest.rows, format.id).toEqual(rows);
      expect(set?.manifest.sources, format.id).toEqual([
        { case: 'LED-04', file: 'posting-export.csv', rows: 1 },
        { case: 'LED-08', file: 'posting-export-again.csv', rows: 2 },
        { case: 'LED-09', file: 'lines-posting-export.csv', rows: 1 },
        { case: 'LED-06', file: 'recoupment-posting-export.csv', rows: 1 },
      ]);
      // Read back by the format's own columns: the canonical rows again.
      const [, ...cells] = readTable(text(set?.files[0]?.bytes));
      const at = (row: readonly string[], field: string) => row[format.columns.findIndex((column) => column.field === field)] ?? '';
      const iso = (cell: string) => (cell === '' ? null : format.dateFormat === 'YYYY-MM-DD' ? cell : `${cell.slice(6)}-${cell.slice(0, 2)}-${cell.slice(3, 5)}`);
      const none = (cell: string) => (cell === '' ? null : cell);
      expect(
        cells.map((row): CanonicalPostingRow => ({
          postedOn: iso(at(row, 'posted_on')) ?? '',
          checkOrTrace: at(row, 'check_or_trace'),
          amountCents: parseAmount(at(row, 'amount')).toString(),
          payerName: none(at(row, 'payer')),
          claimReference: none(at(row, 'claim_reference')),
          procedureCode: none(at(row, 'procedure_code')),
          serviceDate: iso(at(row, 'service_date')),
          batch: none(at(row, 'batch')),
        })),
        format.id,
      ).toEqual(rows);
      expect(text(set?.files[0]?.bytes), format.id).toContain(',-18.00,');
    }
  });

  it('refuse a source that is not packages/synth’s own posting export', () => {
    const bytes = (value: string) => new Uint8Array(Buffer.from(value, 'utf8'));
    expect(() => readSyntheticPostingExport(bytes('Post Date,Check/EFT #\r\n06/11/2026,1\r\n'), 'other')).toThrow(/not packages\/synth's posting export/);
    const header = 'Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch,Payee ID';
    expect(() => readSyntheticPostingExport(bytes(`${header}\r\n06/11/2026,1,P,,,,30.00,B,OTHER\r\n`), 'other')).toThrow(/not a synthetic posting row/);
    expect(() => readSyntheticPostingExport(bytes(`${header}\r\n2026-06-11,1,P,,,,30.00,B,SYNTHSENDER\r\n`), 'other')).toThrow(/not MM\/DD\/YYYY/);
    expect(() => postingSourceRows([{ caseId: 'LED-04', file: 'none.csv' }])).toThrow(/generates no none\.csv/);
  });
});

describe('the ERA exports', () => {
  const eraManifest = (format: VendorFormat) => sets.find((set) => set.id === format.id)?.manifest as EmrManifest;

  it('total each payment’s rows to the cent of its 835’s claims paid and BPR02, as the committed expected.json says', () => {
    for (const format of ERA_FORMATS) {
      const manifest = eraManifest(format);
      const rows = manifest.rows as readonly CanonicalEraRow[];
      expect(manifest.checks?.map((check) => `${check.caseId}/${check.file}`), format.id).toEqual(ERA_SOURCES.map((source) => `${source.caseId}/${source.file}`));
      for (const check of manifest.checks ?? []) {
        const expected = JSON.parse(readFileSync(path.join(syntheticRoot, check.caseId, 'expected.json'), 'utf8')) as CaseExpectation;
        const transaction = expected.files.find((file) => file.path === check.file)?.x12?.parse.transactions.find((item) => item.dedupKey.trn02 === check.trace);
        const mine = rows.filter((row) => row.trace === check.trace);
        expect(transaction?.plb, check.trace).toEqual([]);
        expect(sumCents(mine.map((row) => parseCents(row.paidCents))).toString(), check.trace).toBe(transaction?.balance.claimsPaidCents);
        // The payment is the parser's signed payment (BPR02, negated for a debit), not BPR02 as written.
        expect(mine.every((row) => row.paymentCents === transaction?.balance.paymentCents), check.trace).toBe(true);
        expect([check.paidCents, check.claimsPaidCents, check.paymentCents, check.rows]).toEqual([transaction?.balance.claimsPaidCents, transaction?.balance.claimsPaidCents, transaction?.balance.paymentCents, mine.length]);
        expect(mine.length).toBe(transaction?.counts.lines);
      }
      expect(rows).toHaveLength(17);
      // Per line: charge = paid + contractual + patient responsibility + other, and the patient share is the parser's.
      for (const row of rows) {
        expect(parseCents(row.chargeCents)).toBe(parseCents(row.paidCents) + parseCents(row.contractualAdjustmentCents) + parseCents(row.patientResponsibilityCents) + parseCents(row.otherAdjustmentCents));
        expect(row.senderId).toBe(SYNTH_SENDER_ID);
      }
    }
  });

  it('keep what the 835 says of a line: AMT B6, decimal units, four modifiers, a reversal’s negative amounts and a denial’s zero', () => {
    const rows = eraManifest(ERA_FORMATS[0] as VendorFormat).rows as readonly CanonicalEraRow[];
    expect(rows.filter((row) => row.allowedCents !== null).map((row) => [row.trace, row.allowedCents])).toEqual([
      ['SYNEFTPAR12001', '11440'],
      ['SYNEFTPAR12001', '6600'],
    ]);
    expect(rows.find((row) => row.trace === 'SYNEFTPAR22001')).toMatchObject({ modifiers: ['59', 'KX', 'CQ', 'CO'], units: '1.5', adjustmentCodes: ['CO-45', 'PR-2'] });
    expect(rows.filter((row) => row.claimStatus === '22').map((row) => row.paidCents)).toEqual(['-7200', '-3600']);
    expect(rows.filter((row) => row.trace === 'SYNEFTPAR09001').some((row) => row.paidCents === '0')).toBe(true);
    const spry = text(fileOf(ERA_FORMATS[2] as VendorFormat)?.bytes);
    expect(spry).toContain(',59:KX:CQ:CO,1.5,');
    const webpt = text(fileOf(ERA_FORMATS[0] as VendorFormat)?.bytes);
    expect(webpt).toContain(',"59,KX,CQ,CO",1.5,');
  });

  it('refuse a source a line row cannot carry: held, with a PLB, a claim-level adjustment, a line not totalling its claim or not balancing, or a date range', () => {
    const expected = JSON.parse(readFileSync(path.join(syntheticRoot, 'PAR-01/expected.json'), 'utf8')) as CaseExpectation;
    const parse = expected.files[0]?.x12?.parse;
    if (parse === undefined) {
      throw new Error('PAR-01 has an 835');
    }
    const [transaction] = parse.transactions;
    const [claim] = transaction?.claims ?? [];
    const [line] = claim?.lines ?? [];
    if (transaction === undefined || claim === undefined || line === undefined) {
      throw new Error('PAR-01 has a line');
    }
    const withClaim = (changes: object) => ({ ...parse, transactions: [{ ...transaction, claims: [{ ...claim, ...changes }] }] });
    const withLine = (changes: object) => withClaim({ lines: [{ ...line, ...changes }] });
    expect(eraRowsOf(parse, 'ok').rows).toHaveLength(1);
    // A balanced take-back (BPR03 D): BPR02 stays unsigned as written, the parser negates the payment, and the rows
    // carry that signed payment, which their lines total; the Check Amount is negative like its lines.
    const negate = (cents: string) => (-BigInt(cents)).toString();
    const debitLine = { ...line, chargeCents: negate(line.chargeCents), paidCents: negate(line.paidCents), adjustments: line.adjustments.map((item) => ({ ...item, amountCents: negate(item.amountCents) })) };
    const debitBalance = { ...transaction.balance, claimsPaidCents: negate(transaction.balance.claimsPaidCents), paymentCents: negate(transaction.balance.paymentCents) };
    const debit = { ...parse, transactions: [{ ...transaction, balance: debitBalance, claims: [{ ...claim, chargeCents: negate(claim.chargeCents), paidCents: negate(claim.paidCents), lines: [debitLine] }] }] };
    const taken = eraRowsOf(debit, 'debit');
    expect(transaction.dedupKey.bpr02Cents).toBe('8800');
    expect(taken.rows.map((row) => [row.paymentCents, row.paidCents])).toEqual([['-8800', '-8800']]);
    expect(taken.checks).toEqual([{ trace: 'SYNEFTPAR01001', paymentCents: '-8800', claimsPaidCents: '-8800', rows: 1, paidCents: '-8800' }]);
    const takenText = text(vendorEraExport(ERA_FORMATS[0] as (typeof ERA_FORMATS)[number], taken.rows));
    expect(takenText).toContain(',-88.00,');
    expect(takenText).not.toMatch(/,88\.00,/);
    expect(() => eraRowsOf({ ...parse, outcome: 'held' }, 'x')).toThrow(/only a loaded 835/);
    expect(() => eraRowsOf({ ...parse, transactions: [{ ...transaction, plb: [{} as never] }] }, 'x')).toThrow(/no PLB/);
    expect(() => eraRowsOf({ ...parse, transactions: [{ ...transaction, dedupKey: { ...transaction.dedupKey, senderId: 'OTHER' } }] }, 'x')).toThrow(/synthetic/);
    expect(() => eraRowsOf(withClaim({ adjustments: [{}] }), 'x')).toThrow(/line-level adjustments/);
    expect(() => eraRowsOf(withClaim({ lines: [] }), 'x')).toThrow(/has lines/);
    expect(() => eraRowsOf(withClaim({ paidCents: '1' }), 'x')).toThrow(/do not total/);
    expect(() => eraRowsOf(withLine({ serviceTo: '2026-12-31' }), 'x')).toThrow(/one date of service/);
    expect(() => eraRowsOf(withLine({ serviceFrom: null }), 'x')).toThrow(/one date of service/);
    expect(() => eraRowsOf(withLine({ chargeCents: '1' }), 'x')).toThrow(/does not balance/);
  });
});

describe('the committed EMR fixtures', () => {
  it('are byte for byte what pnpm synth --all generates, with no stale file or format directory beside them', () => {
    expect(driftFrom(syntheticRoot, emrWritable(sets), 'cases')).toEqual({ changed: [], extra: [] });
    expect(staleEmrDirectories(syntheticRoot)).toEqual([]);
    expect(readdirSync(path.join(syntheticRoot, EMR_DIR)).sort()).toEqual(VENDOR_FORMATS.map((format) => format.id).sort());
  });

  it('describe themselves in a manifest: format, status, sources, files with their hash, and the canonical rows in cents', () => {
    for (const set of sets) {
      const manifest = JSON.parse(readFileSync(path.join(syntheticRoot, set.dir, 'manifest.json'), 'utf8')) as EmrManifest;
      const format = findVendorFormat(set.id) as VendorFormat;
      expect(manifest).toMatchObject({ format: format.id, kind: format.kind, status: 'FORMAT_UNCONFIRMED', synthetic: true, layout: { markerColumn: format.markerColumn, marker: SYNTH_SENDER_ID } });
      const exported = readFileSync(path.join(syntheticRoot, set.dir, manifest.files[0]?.path ?? ''));
      expect(manifest.files).toEqual([{ path: format.kind === 'posting_export' ? 'posting-export.csv' : 'era-export.csv', sha256: createHash('sha256').update(exported).digest('hex'), bytes: exported.length, rows: manifest.rows.length }]);
      expect(manifest.sources.reduce((count, source) => count + source.rows, 0)).toBe(manifest.rows.length);
    }
  });

  it('list nothing in a stale directory when there is no emr directory at all', () => {
    expect(staleEmrDirectories(path.join(syntheticRoot, 'cms'))).toEqual([]);
  });
});

describe('the table writer and reader', () => {
  it('quote what needs quoting, write the format’s line ending and mark, and refuse a short row', () => {
    const columns = [
      { header: 'A', field: 'payer', type: 'text' },
      { header: 'B', field: 'payee_id', type: 'identifier' },
    ] as const;
    const written = Buffer.from(vendorCsv({ columns, lineEnding: 'LF', bom: true }, [['x, "y"', 'SYNTHSENDER']])).toString('utf8');
    expect(written).toBe('﻿A,B\n"x, ""y""",SYNTHSENDER\n');
    expect(readTable(written)).toEqual([
      ['A', 'B'],
      ['x, "y"', 'SYNTHSENDER'],
    ]);
    expect(readTable('a,b\r\n\r\n"c\r\nd",\r\n')).toEqual([
      ['a', 'b'],
      ['c\r\nd', ''],
    ]);
    expect(readTable('a,""')).toEqual([['a', '']]);
    expect(() => vendorCsv({ columns, lineEnding: 'CRLF', bom: false }, [['one']])).toThrow(VendorFormatError);
    expect(() => readTable('"a"b')).toThrow(/after a closing quote/);
    expect(() => readTable('"a')).toThrow(/inside a quoted cell/);
    expect(() => writeDate('06/11/2026', 'YYYY-MM-DD')).toThrow(/not YYYY-MM-DD/);
    expect(writeDate('2026-06-11', 'MM/DD/YYYY')).toBe('06/11/2026');
  });

  it('write a vendor export with no row as its header alone', () => {
    const format = ERA_FORMATS[1] as (typeof ERA_FORMATS)[number];
    expect(text(vendorEraExport(format, []))).toBe(`${format.columns.map((column) => column.header).join(',')}\n`);
    const posting = POSTING_FORMATS[0] as (typeof POSTING_FORMATS)[number];
    expect(text(vendorPostingExport(posting, []))).toBe(`${posting.columns.map((column) => column.header).join(',')}\r\n`);
  });
});
