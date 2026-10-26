import { DOCUMENT_KINDS, DOCUMENT_STATUSES, HELD_AT_INTAKE } from '@tp/db';
import { ERA_EXPORT_HELD_REASONS, ERA_EXPORT_MAX_BYTES, ZIP_LIMITS } from '@tp/worker/runtime';
import { describe, expect, it } from 'vitest';

import {
  EXPORT_HELD_REASONS,
  EXPORT_MAX_MIB,
  EXPORT_REMEDIES,
  type ExportError,
  type ExportParseSummary,
  type ExportPayment,
  KIND_NAMES,
  type Receipt,
  type X12ParseSummary,
  documentName,
  errorText,
  exportErrorPosition,
  exportErrorText,
  formatBytes,
  receiptState,
  shortId,
  utcMinute,
} from './receipt-labels';

const base: Receipt = {
  documentId: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03',
  parentDocumentId: null,
  kind: 'x12_835',
  format: null,
  sizeBytes: '1200',
  receivedAt: '2026-10-16T12:00:00.000Z',
  status: 'awaiting_upload',
  scanStatus: 'pending',
  sha256: null,
  duplicateOf: null,
  entries: null,
  parse: null,
};

const parsed: X12ParseSummary = {
  source: 'x12_835',
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
    // A workbook uploaded as an export is held: exports are read as CSV only (docs/adr/0059).
    // So is any other file that is not CSV text, so the receipt names both remedies.
    expect(receiptState({ ...base, kind: 'posting_export', status: 'wrong_type' }).detail).toBe(
      'Not a CSV file: posting exports are read as CSV only. If it is a spreadsheet, save it as CSV (comma-separated) and upload it again; otherwise check you chose the right file and kind.',
    );
    expect(receiptState({ ...base, kind: 'eft_export', status: 'wrong_type' })).toMatchObject({
      held: true,
      detail: 'Not a CSV file: EFT exports are read as CSV only. If it is a spreadsheet, save it as CSV (comma-separated) and upload it again; otherwise check you chose the right file and kind.',
    });
    expect(receiptState({ ...base, kind: 'contract', status: 'stored' }).detail).toContain('contract is kept for its review');
    expect([formatBytes(1000), formatBytes(2048), formatBytes(5 * 1024 ** 2), formatBytes(2 * 1024 ** 3), formatBytes(8 * 1024 ** 4)]).toEqual(['1000 bytes', '2.0 KiB', '5.0 MiB', '2.0 GiB', '8192.0 GiB']);
    expect(utcMinute('2026-10-16T12:34:56.000Z')).toBe('2026-10-16 12:34 UTC');
    expect(shortId(base.documentId)).toBe('0b6e2a7c');
  });
});

describe('receipts of parsed 835s (PRD 10, step 10)', () => {
  it('say what a loaded document loaded: remittances, claims, lines, reversals, PLB, duplicates, reviews and unknown codes', () => {
    expect(receiptState({ ...base, status: 'loaded', parse: parsed }).detail).toBe('Loaded 1 remittance, 2 claims and 3 lines.');
    const busy: X12ParseSummary = {
      ...parsed,
      reversals: 1,
      plbTotalCents: '-1050',
      duplicates: 2,
      unknownCodes: ['carc:Z999'],
      loaded: { transactions: 2, claims: 1, lines: 1 },
      transactionOutcomes: [{ ...transaction, outcome: 'loaded_for_review' }],
    };
    expect(receiptState({ ...base, status: 'loaded', parse: busy }).detail).toBe(
      'Loaded 2 remittances, 1 claim and 1 line; 1 reversal linked to its original where loaded; provider adjustments of -$10.50; 2 remittances already loaded from another file; a trace number the payer used before, flagged for review; unknown codes loaded with a flag: carc:Z999.',
    );
    expect(receiptState({ ...base, status: 'loaded' }).detail).toBe('Loaded.');
  });

  it('say a negative provider adjustment as -$1.00, the sign before the dollar sign, as <Money> shows it on the remittance', () => {
    expect(receiptState({ ...base, status: 'loaded', parse: { ...parsed, plbTotalCents: '-100' } }).detail).toBe('Loaded 1 remittance, 2 claims and 3 lines; provider adjustments of -$1.00.');
    expect(receiptState({ ...base, status: 'loaded', parse: { ...parsed, plbTotalCents: '123456' } }).detail).toBe('Loaded 1 remittance, 2 claims and 3 lines; provider adjustments of $1,234.56.');
  });

  it('show a held file’s segment and position, and the difference of an imbalance (milestone 3; PAR-20, PAR-25)', () => {
    const unbalanced: X12ParseSummary = {
      ...parsed,
      outcome: 'held',
      held: 1,
      loaded: { transactions: 0, claims: 0, lines: 0 },
      errors: [{ code: 'EDI_UNBALANCED', scope: 'transaction', segmentIndex: 4, segmentId: 'BPR', elementPosition: 2, differenceCents: '-100' }],
    };
    expect(receiptState({ ...base, status: 'held', parse: unbalanced })).toMatchObject({
      held: true,
      detail: 'Held: nothing in it loaded. Does not balance by -$1.00 at segment 4 (BPR), element 2. The error report lists every position.',
    });
    const truncated: X12ParseSummary = { ...unbalanced, errors: [{ code: 'EDI_UNKNOWN_CODE', list: 'carc', segmentIndex: 9, segmentId: 'CAS', elementPosition: 2 }, { code: 'EDI_SYNTAX', reason: 'truncated', segmentIndex: 29, segmentId: 'CLP', elementPosition: 3 }] };
    expect(receiptState({ ...base, status: 'held', parse: truncated }).detail).toContain('Cut short at segment 29 (CLP), element 3.');
    const partly: X12ParseSummary = { ...unbalanced, outcome: 'partially_held', transactions: 2 };
    expect(receiptState({ ...base, status: 'held', parse: partly }).detail).toMatch(/^Partly held: 1 of 2 transaction sets loaded or already loaded, 1 held\. Does not balance/);
    expect(receiptState({ ...base, status: 'held', parse: { ...unbalanced, errors: [] } }).detail).toBe('Held: nothing in it loaded. The error report lists every position.');
    expect(receiptState({ ...base, status: 'held' }).detail).toContain('download the error report');
  });

  it('link a duplicate remittance to the file it was loaded from (PAR-07)', () => {
    const duplicate: X12ParseSummary = { ...parsed, outcome: 'duplicate', duplicates: 1, loaded: { transactions: 0, claims: 0, lines: 0 }, transactionOutcomes: [{ ...transaction, outcome: 'duplicate_remittance', linkedDocumentId: ORIGINAL }] };
    expect(receiptState({ ...base, status: 'duplicate', parse: duplicate }).detail).toBe('Duplicate remittance: already loaded from file 9a8b7c6d; nothing loads from it, and it is linked to the original.');
  });

  it('write amounts as US dollars, the sign before the dollar sign, without a float, and positions in words', () => {
    const unbalancedBy = (differenceCents: string) => errorText({ code: 'EDI_UNBALANCED', scope: 'transaction', segmentIndex: 4, segmentId: 'BPR', elementPosition: 2, differenceCents });
    expect(['0', '5', '-5', '100', '-100', '123456', '-1234567'].map((amount) => unbalancedBy(amount).replace(' at segment 4 (BPR), element 2', ''))).toEqual([
      'Does not balance by $0.00',
      'Does not balance by $0.05',
      'Does not balance by -$0.05',
      'Does not balance by $1.00',
      'Does not balance by -$1.00',
      'Does not balance by $1,234.56',
      'Does not balance by -$12,345.67',
    ]);
    expect(errorText({ code: 'EDI_NOT_835', segmentIndex: 3, segmentId: 'ST', elementPosition: 1 })).toBe('Not an 835 at segment 3 (ST), element 1');
    expect(errorText({ code: 'EDI_SYNTAX', reason: 'missing_segment', segmentIndex: 7, segmentId: '', elementPosition: 0 })).toBe('Unreadable at segment 7');
    expect(errorText({ code: 'EDI_UNKNOWN_CODE', segmentIndex: 7, segmentId: 'SVC', elementPosition: 1, componentPosition: 3 })).toBe('An unknown code at segment 7 (SVC), element 1-3');
    expect(errorText({ code: 'EDI_CONTROL_MISMATCH', segmentIndex: 41, segmentId: 'SE', elementPosition: 1 })).toContain('does not match');
    expect(errorText({ code: 'EDI_DUPLICATE', segmentIndex: 5, segmentId: 'TRN', elementPosition: 2 })).toBe('A duplicate at segment 5 (TRN), element 2');
  });
});

describe('receipts of ERA exports (CO-03; docs/adr/0060)', () => {
  const EXPORT = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a05';
  const REMITTANCE = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c06';
  const webpt = { id: 'webpt_billing_era_v0', name: 'WebPT Billing ERA export', unconfirmed: true };
  const era: Receipt = { ...base, kind: 'era_export', format: webpt, sizeBytes: '3594' };
  const payment: ExportPayment = {
    payment: 1,
    firstRow: 1,
    rows: 1,
    outcome: 'loaded',
    remittanceId: REMITTANCE,
    linkedRemittanceId: null,
    linkedDocumentId: null,
    linkedProvenance: null,
    reviewReason: null,
    claims: 1,
    lines: 1,
    reasons: [],
  };
  const report: ExportParseSummary = {
    source: 'era_export',
    outcome: 'loaded',
    transactions: 7,
    claims: 10,
    lines: 17,
    reversals: 1,
    held: 0,
    plbTotalCents: '0',
    loaded: { transactions: 7, claims: 10, lines: 17 },
    duplicates: 0,
    unknownCodes: [],
    errors: [],
    transactionOutcomes: [payment],
  };
  const hold = (reason: ExportError['reason'], at: Partial<ExportError> = {}): ExportError => ({ code: 'EXPORT_HELD', reason, column: null, row: null, payment: null, ...at });

  it('name the kind and the format, and hold a workbook as not CSV', () => {
    expect(KIND_NAMES.era_export).toBe('ERA export');
    expect(documentName(era)).toBe('WebPT Billing ERA export');
    expect(documentName(base)).toBe('835 remittance');
    expect(receiptState({ ...era, status: 'wrong_type' }).detail).toBe(
      'Not a CSV file: ERA exports are read as CSV only. If it is a spreadsheet, save it as CSV (comma-separated) and upload it again; otherwise check you chose the right file and kind.',
    );
  });

  it('say what a loaded export loaded, as an 835’s receipt does', () => {
    expect(receiptState({ ...era, status: 'loaded', parse: report })).toMatchObject({
      held: false,
      detail: 'Loaded 7 remittances, 10 claims and 17 lines; 1 reversal linked to its original where loaded.',
    });
    const reviewed: ExportParseSummary = { ...report, reversals: 0, transactionOutcomes: [{ ...payment, outcome: 'loaded_for_review', reviewReason: 'trace_reused_another_date', linkedRemittanceId: REMITTANCE }] };
    expect(receiptState({ ...era, status: 'loaded', parse: reviewed }).detail).toBe('Loaded 7 remittances, 10 claims and 17 lines; a trace number the payer used before, flagged for review.');
  });

  it('name an 835 or an export a payment was already loaded from, and link it (D13: export after 835 loads nothing)', () => {
    const fromX12: ExportParseSummary = {
      ...report,
      outcome: 'duplicate',
      reversals: 0,
      duplicates: 1,
      transactions: 1,
      loaded: { transactions: 0, claims: 0, lines: 0 },
      transactionOutcomes: [{ ...payment, outcome: 'duplicate_remittance', remittanceId: null, linkedRemittanceId: REMITTANCE, linkedDocumentId: ORIGINAL, linkedProvenance: 'x12_835', claims: 0, lines: 0 }],
    };
    expect(receiptState({ ...era, status: 'duplicate', parse: fromX12 })).toMatchObject({
      held: true,
      detail: 'Already loaded: its payment was loaded before from 835 file 9a8b7c6d, so nothing loads from it. The payment is linked to the remittance it repeats; the receipt lists it.',
    });
    const both: ExportParseSummary = {
      ...fromX12,
      duplicates: 2,
      transactions: 2,
      transactionOutcomes: [...fromX12.transactionOutcomes, { ...payment, payment: 2, outcome: 'duplicate_remittance', remittanceId: null, linkedRemittanceId: REMITTANCE, linkedDocumentId: EXPORT, linkedProvenance: 'era_export' }],
    };
    expect(receiptState({ ...era, status: 'duplicate', parse: both }).detail).toBe(
      'Already loaded: all 2 of its payments were loaded before from 835 file 9a8b7c6d and ERA export file 5e6f7a8b, so nothing loads from it. Each payment is linked to the remittance it repeats; the receipt lists them.',
    );
    const some: ExportParseSummary = { ...report, reversals: 0, duplicates: 1, loaded: { transactions: 6, claims: 9, lines: 16 }, transactionOutcomes: [payment, ...fromX12.transactionOutcomes] };
    expect(receiptState({ ...era, status: 'loaded', parse: some }).detail).toBe('Loaded 6 remittances, 9 claims and 16 lines; 1 payment already loaded from 835 file 9a8b7c6d, so nothing of it loads again.');
  });

  it('hold an 835 whose payment was first loaded from an export for review, never beside it (D13: 835 after export)', () => {
    const review: X12ParseSummary = {
      ...parsed,
      outcome: 'held',
      held: 1,
      loaded: { transactions: 0, claims: 0, lines: 0 },
      transactionOutcomes: [
        { ...transaction, outcome: 'held_for_review', reviewReason: 'payment_loaded_from_export', linkedRemittanceId: REMITTANCE, linkedDocumentId: EXPORT, linkedProvenance: 'era_export', reasons: [] },
      ],
    };
    const state = receiptState({ ...base, status: 'held', parse: review });
    expect(state).toMatchObject({ held: true, stage: 'held' });
    expect(state.detail).toBe(
      'Held: nothing in it loaded. Held for review: a payment in it was already loaded from ERA export file 5e6f7a8b. The 835 is the payer’s own record, but lines already loaded are never replaced, so nothing of that payment loads beside them. Compare the 835 with the remittance loaded from the export; if they differ, open a support ticket. The error report lists every position.',
    );
    const partly: X12ParseSummary = { ...review, outcome: 'partially_held', transactions: 2, transactionOutcomes: [{ ...transaction, outcome: 'loaded', remittanceId: REMITTANCE }, ...review.transactionOutcomes] };
    expect(receiptState({ ...base, status: 'held', parse: partly }).detail).toMatch(/^Partly held: 1 of 2 transaction sets loaded or already loaded, 1 held\. Held for review: a payment in it was already loaded from ERA export file 5e6f7a8b\./);
  });

  it('hold a whole export, or one payment, with the column by its header and the row by number, and what to do', () => {
    const whole: ExportParseSummary = { ...report, outcome: 'held', transactions: 0, claims: 0, lines: 0, reversals: 0, loaded: { transactions: 0, claims: 0, lines: 0 }, transactionOutcomes: [], errors: [hold('export_column_missing', { column: 'Check Date' })] };
    expect(receiptState({ ...era, status: 'held', parse: whole }).detail).toBe(
      'Held: nothing in it loaded. The column “Check Date” is missing. Export it again with every column of the layout, or check you chose the system the export came from. The error report lists every row and column.',
    );
    const partly: ExportParseSummary = {
      ...report,
      outcome: 'partially_held',
      held: 1,
      loaded: { transactions: 6, claims: 9, lines: 16 },
      errors: [hold('export_value_missing', { column: 'Units', row: 4, payment: 3 })],
      transactionOutcomes: [payment, { ...payment, payment: 3, firstRow: 4, rows: 2, outcome: 'held', remittanceId: null, claims: 0, lines: 0, reasons: ['export_value_missing'] }],
    };
    expect(receiptState({ ...era, status: 'held', parse: partly }).detail).toBe(
      'Partly held: 6 of 7 payments loaded or already loaded, 1 held. Row 4 below the header, payment 3: “Units” is blank. Correct the payment in the system the export came from and export it again, or upload the payer’s 835 for that payment instead. The error report lists every row and column.',
    );
    expect(receiptState({ ...era, status: 'held', parse: { ...whole, errors: [] } }).detail).toBe('Held: nothing in it loaded. The error report lists every row and column.');
  });

  it('word every held reason with its place and a remedy, and never more than the header and the numbers it is given', () => {
    // The worker's closed list and size bound, as the receipt words them.
    expect(EXPORT_HELD_REASONS).toEqual(ERA_EXPORT_HELD_REASONS);
    expect(EXPORT_MAX_MIB * 1024 * 1024).toBe(ERA_EXPORT_MAX_BYTES);
    expect(Object.keys(EXPORT_REMEDIES).sort()).toEqual([...EXPORT_HELD_REASONS].sort());
    const whole = new Set(['export_unreadable', 'export_empty', 'export_too_large', 'export_column_missing', 'export_column_repeated']);
    for (const reason of EXPORT_HELD_REASONS) {
      const error = hold(reason, whole.has(reason) ? { column: 'Paid Amount' } : { column: 'Paid Amount', row: 12, payment: 2 });
      const text = exportErrorText(error);
      expect(text, reason).toMatch(whole.has(reason) ? /^The (file|column “Paid Amount”) / : /^Row 12 below the header, payment 2: [a-z“]/);
      expect(text.endsWith('.'), reason).toBe(true);
      expect(EXPORT_REMEDIES[reason].length, reason).toBeGreaterThan(20);
      // Nothing but the header and the row's and payment's numbers: no other digit and no figure in dollars.
      expect(text.replace('Row 12', '').replace('payment 2', '').replace('4 MiB', '').replace('UTF-8', ''), reason).not.toMatch(/\d|\$/);
    }
    expect(exportErrorText(hold('export_too_large'))).toBe('The file is larger than 4 MiB, the most one ERA export may be.');
    expect(exportErrorText(hold('export_value_missing', { column: 'Check Date', row: 3 }))).toBe('Row 3 below the header: “Check Date” is blank.');
    expect(exportErrorText(hold('export_payment_unbalanced', { payment: 5 }))).toBe('Payment 5: the claims’ paid amounts do not add up to the payment amount, so the payment does not balance.');
    expect(exportErrorPosition(hold('export_payment_unbalanced', { payment: 5 }))).toBe('payment 5');
    expect(exportErrorPosition(hold('export_value_unreadable', { column: 'Check Date', row: 9 }))).toBe('row 9 below the header, column “Check Date”');
  });
});
