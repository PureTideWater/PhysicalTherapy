import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ParseReport } from '@tp/edi835';
import { parseText } from '@tp/edi835/testing';
import { describe, expect, it } from 'vitest';

import { codeListsOf } from './code-lists';
import { type TransactionResult, documentStatus, parseReportRow, positionKey, resultOf } from './report';

/** The parse report and receipt a document gets (report.ts), from SYNTHETIC fixtures' parser reports. */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');
const reportOf = (relative: string): ParseReport => parseText(readFileSync(path.join(FIXTURES, relative), 'latin1')).report;

const FIRST = positionKey({ interchange: 0, group: 0, transaction: 0 });
const SECOND = positionKey({ interchange: 0, group: 0, transaction: 1 });
const REMITTANCE = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

const loaded = (claims: number, lines: number): TransactionResult => ({ outcome: 'loaded', remittanceId: REMITTANCE, claims, lines, review: null });

describe('the parse report', () => {
  it('counts a loaded document and what each transaction set loaded', () => {
    const row = parseReportRow(reportOf('PAR-02/remit.835'), new Map([
      [FIRST, loaded(1, 2)],
      [SECOND, { outcome: 'loaded', remittanceId: OTHER, claims: 2, lines: 3, review: { remittanceId: REMITTANCE, reason: 'trace_reused_same_date' } }],
    ]));
    expect(row).toMatchObject({ outcome: 'loaded', transactions: 2, held: 0, loadedTransactions: 2, loadedClaims: 3, loadedLines: 5, duplicateTransactions: 0, errors: [], codeListRelease: 900001 });
    expect(row.transactionOutcomes.map((item) => [item.st02, item.outcome, item.remittanceId, item.linkedRemittanceId])).toEqual([
      ['0001', 'loaded', REMITTANCE, null],
      ['0002', 'loaded_for_review', OTHER, REMITTANCE],
    ]);
    expect(documentStatus(row.outcome)).toBe('loaded');
  });

  it('calls a document whose every remittance was already loaded a duplicate, linked to the originals (PAR-07)', () => {
    const row = parseReportRow(reportOf('PAR-07/resent.835'), new Map([[FIRST, { outcome: 'duplicate_remittance', remittanceId: REMITTANCE, documentId: DOCUMENT }]]));
    expect(row).toMatchObject({ outcome: 'duplicate', loadedTransactions: 0, duplicateTransactions: 1 });
    expect(row.transactionOutcomes).toEqual([expect.objectContaining({ outcome: 'duplicate_remittance', remittanceId: null, linkedRemittanceId: REMITTANCE, linkedDocumentId: DOCUMENT, reasons: ['EDI_DUPLICATE'] })]);
    expect(documentStatus(row.outcome)).toBe('duplicate');
  });

  it('holds an unbalanced transaction set with its difference and position, and nothing else (PAR-20)', () => {
    const row = parseReportRow(reportOf('PAR-20/unbalanced-claim.835'), new Map());
    expect(row).toMatchObject({ outcome: 'held', held: 1, loadedTransactions: 0 });
    expect(row.errors).toEqual([{ code: 'EDI_UNBALANCED', scope: 'claim', segmentIndex: 17, segmentId: 'CLP', elementPosition: 4, differenceCents: '-500', transaction: { interchange: 0, group: 0, transaction: 0, st02: '0001' } }]);
    expect(row.transactionOutcomes).toEqual([expect.objectContaining({ outcome: 'held', reasons: ['EDI_UNBALANCED'] })]);
    expect(documentStatus(row.outcome)).toBe('held');
  });

  it('reports a document error once, without the values the parser saw (PAR-24, PAR-25)', () => {
    const notAn835 = parseReportRow(reportOf('PAR-24/claim-status-277.835'), new Map());
    expect(notAn835).toMatchObject({ outcome: 'held', transactions: 0 });
    expect(notAn835.errors).toEqual([{ code: 'EDI_NOT_835', segmentIndex: 3, segmentId: 'ST', elementPosition: 1 }]);
    const truncated = parseReportRow(reportOf('PAR-25/truncated.835'), new Map());
    expect(truncated.outcome).toBe('held');
    expect(truncated.errors.filter((error) => error.code === 'EDI_SYNTAX')).toHaveLength(1);
  });

  it('is partially held when one set loads and another does not, and lists envelope errors (PAR-26)', () => {
    const report = reportOf('PAR-02/remit.835');
    const row = parseReportRow(report, new Map([[FIRST, loaded(1, 1)]]));
    expect(row).toMatchObject({ outcome: 'partially_held', held: 1, loadedTransactions: 1 });
    expect(documentStatus(row.outcome)).toBe('held');
    const mismatch = parseReportRow(reportOf('PAR-26/remit.835'), new Map());
    expect(mismatch.errors).toEqual([expect.objectContaining({ code: 'EDI_CONTROL_MISMATCH', segmentIndex: 41, segmentId: 'SE', elementPosition: 1 })]);
    expect(Object.keys(mismatch.errors[0] ?? {})).not.toContain('found');
  });

  it('lists unknown codes shaped like codes, flags each with its position, and shows nothing else (PAR-21)', () => {
    const report = reportOf('PAR-21/remit.835');
    const row = parseReportRow(report, new Map([[FIRST, loaded(1, 2)]]));
    expect(row.unknownCodes).toEqual(['carc:Z999']);
    expect(row.errors).toEqual([{ code: 'EDI_UNKNOWN_CODE', list: 'carc', segmentIndex: 25, segmentId: 'CAS', elementPosition: 2, transaction: { interchange: 0, group: 0, transaction: 0, st02: '0001' } }]);
    const odd = parseReportRow({ ...report, receipt: { ...report.receipt, unknownCodes: ['carc:SYNTHETIC NAME', 'rarc:N901'] } }, new Map([[FIRST, loaded(1, 2)]]));
    expect(odd.unknownCodes).toEqual(['carc:(not shown)', 'rarc:N901']);
    const structural = parseReportRow({ ...report, receipt: { ...report.receipt, unknownCodes: ['patient_id_qualifier:SYN12345', 'carc:Z999'] } }, new Map([[FIRST, loaded(1, 2)]]));
    expect(structural.unknownCodes).toEqual(['carc:Z999', 'patient_id_qualifier:(not shown)']);
  });

  it('never carries a value read from an NM1 identifier position: a member ID in NM108 holds the set, unshown', () => {
    const text = readFileSync(path.join(FIXTURES, 'PAR-01/remit.835'), 'latin1').replace(/NM1\*QC\*1\*([^*~]*)\*([^*~]*)\*\*\*\*MI\*([^*~]*)~/, 'NM1*QC*1*$1*$2***MI*SYN12345~');
    expect(text).toContain('***MI*SYN12345~');
    const row = parseReportRow(parseText(text).report, new Map());
    expect(row).toMatchObject({ outcome: 'held', unknownCodes: [] });
    expect(row.errors).toEqual([expect.objectContaining({ code: 'EDI_SYNTAX', reason: 'invalid_code', segmentId: 'NM1', elementPosition: 8 })]);
    expect(JSON.stringify(row)).not.toContain('SYN12345');
  });

  it('flags an unknown code at a component of its element', () => {
    const report = reportOf('PAR-21/remit.835');
    const [transaction] = report.transactions;
    const flagged = transaction?.unknownCodes.map((code) => ({ ...code, componentPosition: 2 })) ?? [];
    const row = parseReportRow({ ...report, transactions: [{ ...(transaction as (typeof report.transactions)[number]), unknownCodes: flagged }] }, new Map([[FIRST, loaded(1, 2)]]));
    expect(row.errors).toEqual([expect.objectContaining({ code: 'EDI_UNKNOWN_CODE', componentPosition: 2 })]);
  });

  it('records a code-list release of none when no release was loaded', () => {
    const report = parseText(readFileSync(path.join(FIXTURES, 'PAR-01/remit.835'), 'latin1'), codeListsOf(null, new Map())).report;
    const row = parseReportRow(report, new Map([[FIRST, loaded(1, 1)]]));
    expect(row).toMatchObject({ codeListRelease: null, unknownCodes: ['carc:2', 'carc:45'] });
  });

  it('holds a transaction set the loader refused, with an EDI_SYNTAX at the value’s element', () => {
    expect(resultOf({ kind: 'refused', at: { segmentIndex: 19, segmentId: 'SVC', elementPosition: 5 } })).toEqual({
      outcome: 'held',
      reasons: [expect.objectContaining({ code: 'EDI_SYNTAX', reason: 'invalid_decimal', segmentIndex: 19, segmentId: 'SVC', elementPosition: 5 })],
    });
    expect(resultOf({ kind: 'duplicate', remittanceId: REMITTANCE, documentId: DOCUMENT })).toEqual({ outcome: 'duplicate_remittance', remittanceId: REMITTANCE, documentId: DOCUMENT });
    expect(resultOf({ kind: 'loaded', remittanceId: REMITTANCE, claims: 1, lines: 2, review: null })).toEqual(loaded(1, 2));
    const row = parseReportRow(reportOf('PAR-01/remit.835'), new Map([[FIRST, resultOf({ kind: 'refused', at: { segmentIndex: 19, segmentId: 'SVC', elementPosition: 5 } })]]));
    expect(row).toMatchObject({ outcome: 'held', errors: [expect.objectContaining({ code: 'EDI_SYNTAX', reason: 'invalid_decimal' })] });
  });
});

describe('the code lists from a release', () => {
  it('answers CARC and RARC inside their effective windows, and the structure’s own sets', () => {
    const lists = codeListsOf(900001, new Map([
      ['carc:45', [{ from: '2020-01-01', to: '2026-03-31' }]],
      ['rarc:N901', [{ from: '2020-01-01', to: null }]],
    ]));
    expect(lists.release).toBe(900001);
    expect(lists.has('carc', '45', '2026-03-31')).toBe(true);
    expect(lists.has('carc', '45', '2026-04-01')).toBe(false);
    expect(lists.has('carc', '45', '2019-12-31')).toBe(false);
    expect(lists.has('rarc', 'N901', '2030-01-01')).toBe(true);
    expect(lists.has('carc', 'Z999', '2026-01-01')).toBe(false);
    expect(lists.has('adjustment_group', 'CO', '2026-01-01')).toBe(true);
    expect(lists.has('adjustment_group', 'ZZ', '2026-01-01')).toBe(false);
  });
});
