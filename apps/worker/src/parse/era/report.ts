import type { RemittanceProvenance } from '@tp/db/runtime';

import type { ExportPaymentLoad } from '../loader';
import { type ParseReportRow, maskedCode, overall } from '../report';
import type { EraExportHeldReason, EraExportHold, EraExportNormalized } from './normalize';

/**
 * The parse report of an ERA export (PRD 10, step 10; docs/adr/0060), in parse_report's columns: a payment is
 * what a transaction set is to an 835. Pure: the parse job writes the row this builds.
 *
 * - errors: one EXPORT_HELD entry per hold, with its reason, the column by the format's header, the data row and
 *   the payment; never a cell's value.
 * - transaction_outcomes: one entry per payment, in file order: its first row and row count, what it became
 *   (loaded, loaded for review against a remittance of the same payee and trace, a duplicate of a payment the
 *   practice holds from an 835 or an export, or held with its reasons, among them export_payment_other_payer as it
 *   loads, linked to the payment of another payer it matches) and the remittance it loaded or is linked to.
 * - Counts: transactions are the payments; claims, lines and reversals as the rows group; the PLB total zero.
 *   A document held whole reports zeros and its reasons.
 */

export interface ReportedExportError {
  readonly code: 'EXPORT_HELD';
  readonly reason: EraExportHeldReason;
  readonly column: string | null;
  readonly row: number | null;
  readonly payment: number | null;
}

export interface ReportedExportPayment {
  readonly payment: number;
  readonly firstRow: number;
  readonly rows: number;
  readonly outcome: 'loaded' | 'loaded_for_review' | 'duplicate_remittance' | 'held';
  /** The remittance it loaded. */
  readonly remittanceId: string | null;
  /** The remittance it duplicates or is reviewed against, that one's document (a duplicate's) and what it was loaded from. */
  readonly linkedRemittanceId: string | null;
  readonly linkedDocumentId: string | null;
  readonly linkedProvenance: RemittanceProvenance | null;
  readonly reviewReason: 'trace_reused_another_date' | 'trace_reused_same_date' | null;
  readonly claims: number;
  readonly lines: number;
  readonly reasons: readonly EraExportHeldReason[];
}

export type ExportReportRow = ParseReportRow<ReportedExportError, ReportedExportPayment>;

const reported = (hold: EraExportHold): ReportedExportError => ({ code: 'EXPORT_HELD', reason: hold.reason, column: hold.column, row: hold.row, payment: hold.payment });

/** The report row of an export: what the normalizer read, and what loading made of each payment (by its position). */
export function exportReportRow(normalized: EraExportNormalized, results: ReadonlyMap<number, ExportPaymentLoad>, codeListRelease: number | null): ExportReportRow {
  if (normalized.kind === 'held') {
    return {
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
      errors: normalized.reasons.map(reported),
      transactionOutcomes: [],
      codeListRelease,
    };
  }
  const outcomes: ReportedExportPayment[] = [];
  const errors: ReportedExportError[] = [];
  let claims = 0;
  let lines = 0;
  let reversals = 0;
  for (const payment of normalized.payments) {
    const place = { payment: payment.position, firstRow: payment.firstRow, rows: payment.rows };
    if (payment.kind === 'held') {
      claims += payment.claims;
      lines += payment.rows;
      reversals += payment.reversals;
      errors.push(...payment.reasons.map(reported));
      outcomes.push({
        ...place,
        outcome: 'held',
        remittanceId: null,
        linkedRemittanceId: null,
        linkedDocumentId: null,
        linkedProvenance: null,
        reviewReason: null,
        claims: 0,
        lines: 0,
        reasons: [...new Set(payment.reasons.map((hold) => hold.reason))],
      });
      continue;
    }
    claims += payment.plan.claims.length;
    lines += payment.plan.claims.reduce((sum, claim) => sum + claim.lines.length, 0);
    reversals += payment.plan.claims.filter((claim) => claim.reversal !== null).length;
    const result = results.get(payment.position);
    if (result === undefined) {
      throw new Error('a loadable payment has no result');
    }
    if (result.kind === 'held') {
      // Held as it loads: the payment it matches names another payer; the hold names its place, never a value.
      errors.push({ code: 'EXPORT_HELD', reason: result.reason, column: null, row: payment.firstRow, payment: payment.position });
      outcomes.push({
        ...place,
        outcome: 'held',
        remittanceId: null,
        linkedRemittanceId: result.remittanceId,
        linkedDocumentId: result.documentId,
        linkedProvenance: result.provenance,
        reviewReason: null,
        claims: 0,
        lines: 0,
        reasons: [result.reason],
      });
      continue;
    }
    outcomes.push(
      result.kind === 'loaded'
        ? {
            ...place,
            outcome: result.review === null ? 'loaded' : 'loaded_for_review',
            remittanceId: result.remittanceId,
            linkedRemittanceId: result.review?.remittanceId ?? null,
            linkedDocumentId: null,
            linkedProvenance: null,
            reviewReason: result.review?.reason ?? null,
            claims: result.claims,
            lines: result.lines,
            reasons: [],
          }
        : {
            ...place,
            outcome: 'duplicate_remittance',
            remittanceId: null,
            linkedRemittanceId: result.remittanceId,
            linkedDocumentId: result.documentId,
            linkedProvenance: result.provenance,
            reviewReason: null,
            claims: 0,
            lines: 0,
            reasons: [],
          },
    );
  }
  const loaded = outcomes.filter((outcome) => outcome.outcome === 'loaded' || outcome.outcome === 'loaded_for_review');
  return {
    outcome: overall(outcomes, 0),
    transactions: outcomes.length,
    claims,
    lines,
    reversals,
    held: outcomes.filter((outcome) => outcome.outcome === 'held').length,
    plbTotalCents: '0',
    loadedTransactions: loaded.length,
    loadedClaims: loaded.reduce((sum, outcome) => sum + outcome.claims, 0),
    loadedLines: loaded.reduce((sum, outcome) => sum + outcome.lines, 0),
    duplicateTransactions: outcomes.filter((outcome) => outcome.outcome === 'duplicate_remittance').length,
    unknownCodes: [...new Set(normalized.unknownCodes.map(maskedCode))].sort(),
    errors,
    transactionOutcomes: outcomes,
    codeListRelease,
  };
}
