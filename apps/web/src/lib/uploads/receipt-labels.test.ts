import { DOCUMENT_KINDS, DOCUMENT_STATUSES, HELD_AT_INTAKE } from '@tp/db';
import { ZIP_LIMITS } from '@tp/worker/runtime';
import { describe, expect, it } from 'vitest';

import { KIND_NAMES, type ParseSummary, type Receipt, centsText, errorText, formatBytes, receiptState, shortId, utcMinute } from './receipt-labels';

const base: Receipt = {
  documentId: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03',
  parentDocumentId: null,
  kind: 'x12_835',
  sizeBytes: '1200',
  receivedAt: '2026-10-16T12:00:00.000Z',
  status: 'awaiting_upload',
  scanStatus: 'pending',
  sha256: null,
  duplicateOf: null,
  entries: null,
  parse: null,
};

const parsed: ParseSummary = {
  outcome: 'loaded',
  transactions: 1,
  claims: 2,
  lines: 3,
  reversals: 0,
  held: 0,
  plbTotalCents: '0',
  loaded: { transactions: 1, claims: 2, lines: 3 },
  duplicates: 0,
  unknownCodes: [],
  errors: [],
  transactionOutcomes: [],
};

const ORIGINAL = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';
const transaction = { interchange: 0, group: 0, transaction: 0, segmentIndex: 3, st02: '0001', remittanceId: null, linkedRemittanceId: null, linkedDocumentId: null, claims: 0, lines: 0, reasons: [] };

describe('receipt states', () => {
  it('give every status a stage, a label and a reason in J4’s words, and hold every intake hold', () => {
    for (const status of DOCUMENT_STATUSES) {
      const state = receiptState({ ...base, status });
      expect(state.label.length, status).toBeGreaterThan(0);
      expect(state.detail.length, status).toBeGreaterThan(0);
      expect(['waiting', 'received', 'scanned', 'stored', 'expanded', 'parsed', 'balanced', 'loaded', 'held', 'failed']).toContain(state.stage);
    }
    for (const status of HELD_AT_INTAKE) {
      expect(receiptState({ ...base, status }), status).toMatchObject({ stage: 'held', held: true, settled: true });
    }
    expect(receiptState({ ...base, status: 'received' })).toMatchObject({ stage: 'received', settled: false, retry: 'intake' });
    expect(receiptState({ ...base, status: 'awaiting_upload' })).toMatchObject({ settled: false, retry: 'upload' });
    expect(receiptState({ ...base, status: 'failed' })).toMatchObject({ stage: 'failed', settled: true, retry: 'intake' });
    expect(receiptState({ ...base, status: 'parse_queued' })).toMatchObject({ stage: 'scanned', settled: false, detail: 'The malware scan is clean; queued for parse.' });
    for (const status of ['parsed', 'balanced', 'loaded'] as const) {
      expect(receiptState({ ...base, status }).stage).toBe(status);
    }
  });

  it('say which file a duplicate repeats (PAR-06)', () => {
    expect(receiptState({ ...base, status: 'duplicate', duplicateOf: { documentId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04', receivedAt: '2026-10-15T08:00:00.000Z' } }).detail).toBe(
      'Duplicate of file 9a8b7c6d (received 2026-10-15); nothing loads from it.',
    );
    expect(receiptState({ ...base, status: 'duplicate' }).detail).toContain('Duplicate of an earlier file');
  });

  it('count a zip’s files in its batch receipt (PAR-27), and say a zip is quarantined whole (PAR-28)', () => {
    const entries = { total: 500, byStatus: { parse_queued: 499, held: 0, unsafe_entry: 1 } };
    expect(receiptState({ ...base, status: 'expanded', entries }).detail).toBe('Each file in the zip has its own receipt: 500 files, 499 queued for parse, 1 held.');
    expect(receiptState({ ...base, status: 'expanded', entries: { total: 500, byStatus: { loaded: 499, held: 1 } } })).toMatchObject({ settled: true, detail: 'Each file in the zip has its own receipt: 500 files, 499 loaded, 1 held.' });
    expect(receiptState({ ...base, status: 'expanded', entries })).toMatchObject({ settled: false });
    expect(receiptState({ ...base, status: 'expanded', entries: { total: 500, byStatus: { loaded: 200, scanned: 300 } } }).detail).toBe(
      'Each file in the zip has its own receipt: 500 files, 200 loaded, 300 queued for parse, 0 held.',
    );
    expect(receiptState({ ...base, status: 'scanned', entries: { total: 3, byStatus: { scanned: 1, stored: 1, received: 1 } } }).detail).toBe(
      'Expanding the zip: 3 files, 1 queued for parse, 1 stored, 1 in progress, 0 held so far.',
    );
    expect(receiptState({ ...base, status: 'expanded', entries: { total: 1, byStatus: { scanned: 1 } } }).detail).toContain('1 file, 1 queued');
    expect(receiptState({ ...base, status: 'expanded' }).detail).toContain('0 files');
    expect(receiptState({ ...base, status: 'quarantined', entries: { total: 2, byStatus: { quarantined: 2 } } }).detail).toContain('a file in the zip');
    expect(receiptState({ ...base, status: 'quarantined' }).detail).toContain('it is malware, an executable or a script');
  });

  it('state the zip limits the worker applies', () => {
    expect(receiptState({ ...base, status: 'too_large' }).detail).toContain(`${String(ZIP_LIMITS.maxEntryBytes / 1024 ** 2)} MiB`);
    expect(receiptState({ ...base, status: 'too_large' }).detail).toContain(`${String(ZIP_LIMITS.maxTotalBytes / 1024 ** 3)} GiB`);
    expect(receiptState({ ...base, status: 'too_many_entries' }).detail).toContain(ZIP_LIMITS.maxEntries.toLocaleString('en-US'));
  });

  it('name every kind, and format sizes, dates and IDs for people', () => {
    expect(Object.keys(KIND_NAMES).sort()).toEqual([...DOCUMENT_KINDS].sort());
    expect(receiptState({ ...base, kind: 'contract', status: 'wrong_type' }).detail).toBe('Not a contract: the file is another type of document.');
    expect(receiptState({ ...base, kind: 'contract', status: 'stored' }).detail).toContain('contract is kept for its review');
    expect([formatBytes(1000), formatBytes(2048), formatBytes(5 * 1024 ** 2), formatBytes(2 * 1024 ** 3), formatBytes(8 * 1024 ** 4)]).toEqual(['1000 bytes', '2.0 KiB', '5.0 MiB', '2.0 GiB', '8192.0 GiB']);
    expect(utcMinute('2026-10-16T12:34:56.000Z')).toBe('2026-10-16 12:34 UTC');
    expect(shortId(base.documentId)).toBe('0b6e2a7c');
  });
});

describe('receipts of parsed 835s (PRD 10, step 10)', () => {
  it('say what a loaded document loaded: remittances, claims, lines, reversals, PLB, duplicates, reviews and unknown codes', () => {
    expect(receiptState({ ...base, status: 'loaded', parse: parsed }).detail).toBe('Loaded 1 remittance, 2 claims and 3 lines.');
    const busy: ParseSummary = {
      ...parsed,
      reversals: 1,
      plbTotalCents: '-1050',
      duplicates: 2,
      unknownCodes: ['carc:Z999'],
      loaded: { transactions: 2, claims: 1, lines: 1 },
      transactionOutcomes: [{ ...transaction, outcome: 'loaded_for_review' }],
    };
    expect(receiptState({ ...base, status: 'loaded', parse: busy }).detail).toBe(
      'Loaded 2 remittances, 1 claim and 1 line; 1 reversal linked to its original where loaded; provider adjustments of $-10.50; 2 remittances already loaded from another file; a trace number the payer used before, flagged for review; unknown codes loaded with a flag: carc:Z999.',
    );
    expect(receiptState({ ...base, status: 'loaded' }).detail).toBe('Loaded.');
  });

  it('show a held file’s segment and position, and the difference of an imbalance (milestone 3; PAR-20, PAR-25)', () => {
    const unbalanced: ParseSummary = {
      ...parsed,
      outcome: 'held',
      held: 1,
      loaded: { transactions: 0, claims: 0, lines: 0 },
      errors: [{ code: 'EDI_UNBALANCED', scope: 'transaction', segmentIndex: 4, segmentId: 'BPR', elementPosition: 2, differenceCents: '-100' }],
    };
    expect(receiptState({ ...base, status: 'held', parse: unbalanced })).toMatchObject({
      held: true,
      detail: 'Held: nothing in it loaded. Does not balance by $-1.00 at segment 4 (BPR), element 2. The error report lists every position.',
    });
    const truncated: ParseSummary = { ...unbalanced, errors: [{ code: 'EDI_UNKNOWN_CODE', list: 'carc', segmentIndex: 9, segmentId: 'CAS', elementPosition: 2 }, { code: 'EDI_SYNTAX', reason: 'truncated', segmentIndex: 29, segmentId: 'CLP', elementPosition: 3 }] };
    expect(receiptState({ ...base, status: 'held', parse: truncated }).detail).toContain('Cut short at segment 29 (CLP), element 3.');
    const partly: ParseSummary = { ...unbalanced, outcome: 'partially_held', transactions: 2 };
    expect(receiptState({ ...base, status: 'held', parse: partly }).detail).toMatch(/^Partly held: 1 of 2 transaction sets loaded or already loaded, 1 held\. Does not balance/);
    expect(receiptState({ ...base, status: 'held', parse: { ...unbalanced, errors: [] } }).detail).toBe('Held: nothing in it loaded. The error report lists every position.');
    expect(receiptState({ ...base, status: 'held' }).detail).toContain('download the error report');
  });

  it('link a duplicate remittance to the file it was loaded from (PAR-07)', () => {
    const duplicate: ParseSummary = { ...parsed, outcome: 'duplicate', duplicates: 1, loaded: { transactions: 0, claims: 0, lines: 0 }, transactionOutcomes: [{ ...transaction, outcome: 'duplicate_remittance', linkedDocumentId: ORIGINAL }] };
    expect(receiptState({ ...base, status: 'duplicate', parse: duplicate }).detail).toBe('Duplicate remittance: already loaded from file 9a8b7c6d; nothing loads from it, and it is linked to the original.');
  });

  it('write amounts without a float and positions in words', () => {
    expect(['0', '5', '-5', '100', '-100', '123456', '-1234567'].map(centsText)).toEqual(['0.00', '0.05', '-0.05', '1.00', '-1.00', '1234.56', '-12345.67']);
    expect(errorText({ code: 'EDI_NOT_835', segmentIndex: 3, segmentId: 'ST', elementPosition: 1 })).toBe('Not an 835 at segment 3 (ST), element 1');
    expect(errorText({ code: 'EDI_SYNTAX', reason: 'missing_segment', segmentIndex: 7, segmentId: '', elementPosition: 0 })).toBe('Unreadable at segment 7');
    expect(errorText({ code: 'EDI_UNKNOWN_CODE', segmentIndex: 7, segmentId: 'SVC', elementPosition: 1, componentPosition: 3 })).toBe('An unknown code at segment 7 (SVC), element 1-3');
    expect(errorText({ code: 'EDI_CONTROL_MISMATCH', segmentIndex: 41, segmentId: 'SE', elementPosition: 1 })).toContain('does not match');
    expect(errorText({ code: 'EDI_DUPLICATE', segmentIndex: 5, segmentId: 'TRN', elementPosition: 2 })).toBe('A duplicate at segment 5 (TRN), element 2');
  });
});
