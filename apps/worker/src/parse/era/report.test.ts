import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CodeListProvider } from '@tp/edi835';
import { inCodeSet } from '@tp/edi835';
import { describe, expect, it } from 'vitest';

import type { ExportPaymentLoad } from '../loader';
import { documentStatus } from '../report';
import { TOO_LARGE } from './load';
import { ERA_EXPORT_HELD_REASONS, normalizeEraExport } from './normalize';
import { exportReportRow } from './report';

/** The parse report of an ERA export (report.ts), from the WebPT Billing fixture's normalized payments. */

const EMR = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/emr');
const bytes = new Uint8Array(readFileSync(path.join(EMR, 'webpt_billing_era_v0', 'era-export.csv')));
const UNKNOWN_CARCS: CodeListProvider = { release: null, has: (list, code) => (list === 'carc' || list === 'rarc' ? false : inCodeSet(list, code)) };
const normalized = normalizeEraExport({ bytes, formatId: 'webpt_billing_era_v0', codeLists: UNKNOWN_CARCS });
const positions = normalized.kind === 'payments' ? normalized.payments.map((payment) => payment.position) : [];

const REMITTANCE = '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60';
const EARLIER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

const loaded = (claims: number, lines: number): ExportPaymentLoad => ({ kind: 'loaded', remittanceId: REMITTANCE, claims, lines, review: null });

describe('the parse report of an ERA export', () => {
  it('counts payments as transactions, with what each loaded, and the PLB total zero', () => {
    const results = new Map<number, ExportPaymentLoad>(positions.map((position) => [position, loaded(1, 2)]));
    const row = exportReportRow(normalized, results, null);
    expect(row).toMatchObject({ outcome: 'loaded', transactions: 7, claims: 9, lines: 17, reversals: 1, held: 0, plbTotalCents: '0', loadedTransactions: 7, loadedClaims: 7, loadedLines: 14, duplicateTransactions: 0, errors: [], codeListRelease: null });
    expect(row.unknownCodes).toEqual(['carc:1', 'carc:2', 'carc:3', 'carc:45']);
    expect(row.transactionOutcomes[0]).toEqual({
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
      lines: 2,
      reasons: [],
    });
    expect(documentStatus(row.outcome)).toBe('loaded');
  });

  it('links a duplicate to the remittance it repeats, its document and its provenance, and a review to the earlier trace', () => {
    const results = new Map<number, ExportPaymentLoad>(positions.map((position) => [position, { kind: 'duplicate', remittanceId: EARLIER, documentId: DOCUMENT, provenance: 'x12_835' }]));
    results.set(2, { kind: 'loaded', remittanceId: REMITTANCE, claims: 1, lines: 2, review: { remittanceId: EARLIER, reason: 'trace_reused_another_date' } });
    const row = exportReportRow(normalized, results, 900001);
    expect(row).toMatchObject({ outcome: 'loaded', duplicateTransactions: 6, loadedTransactions: 1 });
    expect(row.transactionOutcomes[0]).toMatchObject({ outcome: 'duplicate_remittance', remittanceId: null, linkedRemittanceId: EARLIER, linkedDocumentId: DOCUMENT, linkedProvenance: 'x12_835', claims: 0, lines: 0 });
    expect(row.transactionOutcomes[1]).toMatchObject({ outcome: 'loaded_for_review', remittanceId: REMITTANCE, linkedRemittanceId: EARLIER, reviewReason: 'trace_reused_another_date' });
    const all = new Map<number, ExportPaymentLoad>(positions.map((position) => [position, { kind: 'duplicate', remittanceId: EARLIER, documentId: DOCUMENT, provenance: 'era_export' }]));
    expect(exportReportRow(normalized, all, null)).toMatchObject({ outcome: 'duplicate', duplicateTransactions: 7 });
  });

  it('holds a payment with its reasons, the others loading (partially held), and a document held whole with zeros', () => {
    const edited = new TextDecoder().decode(bytes).replace('SYNPLAN-COMM-01,03/15/2026,97110,GP,2,', 'SYNPLAN-COMM-01,03/15/2026,97110,GP,,');
    const partly = normalizeEraExport({ bytes: new TextEncoder().encode(edited), formatId: 'webpt_billing_era_v0', codeLists: UNKNOWN_CARCS });
    const results = new Map<number, ExportPaymentLoad>([2, 3, 4, 5, 6, 7].map((position) => [position, loaded(1, 1)]));
    const row = exportReportRow(partly, results, null);
    expect(row).toMatchObject({ outcome: 'partially_held', transactions: 7, held: 1, loadedTransactions: 6, claims: 9, lines: 17 });
    expect(row.errors).toEqual([{ code: 'EXPORT_HELD', reason: 'export_value_missing', column: 'Units', row: 1, payment: 1 }]);
    expect(row.transactionOutcomes[0]).toMatchObject({ outcome: 'held', remittanceId: null, claims: 0, lines: 0, reasons: ['export_value_missing'] });
    expect(documentStatus(row.outcome)).toBe('held');
    const whole = exportReportRow(TOO_LARGE, new Map(), null);
    expect(whole).toEqual({
      outcome: 'held',
      transactions: 0,
      claims: 0,
      lines: 0,
      reversals: 0,
      held: 0,
      plbTotalCents: '0',
      loadedTransactions: 0,
      loadedClaims: 0,
      loadedLines: 0,
      duplicateTransactions: 0,
      unknownCodes: [],
      errors: [{ code: 'EXPORT_HELD', reason: 'export_too_large', column: null, row: null, payment: null }],
      transactionOutcomes: [],
      codeListRelease: null,
    });
    expect(ERA_EXPORT_HELD_REASONS).toContain(whole.errors[0]?.reason);
  });

  it('refuses a loadable payment without a result rather than report it as anything', () => {
    expect(() => exportReportRow(normalized, new Map(), null)).toThrow(/no result/);
  });
});
