/**
 * Deduplication (PRD section 10, step 8), as pure decisions the loader applies with what the
 * practice already holds. First by file hash: the same bytes are a duplicate document and load zero
 * rows. Then by remittance key (sender, payee, ISA13, TRN02, BPR02; the loader adds the practice): the
 * same remittance from a second download or a resent file is linked to the first and loads zero rows.
 * A remittance with a trace the payer already used for this payee (TRN02 and TRN03 equal, the key not)
 * is the same payment when its amount (BPR02) and date (BPR16) are the same too: a file resent with a
 * regenerated envelope (a new ISA13), also linked to the first with zero rows (docs/adr/0031). Any
 * other one loads and is surfaced for review; its BPR16 date says whether it is the rare payer reusing
 * a trace on another day.
 */
import { type EdiError, duplicate } from './errors';
import { type LoadableRemittance, type RemittanceKey } from './types';

/** The text form of a remittance key, for a unique index or a set. */
export function remittanceKeyText(key: RemittanceKey): string {
  return [key.senderId, key.payeeId, key.isa13, key.trn02, key.bpr02Cents.toString()].join('|');
}

export interface KnownDocument {
  readonly id: string;
  readonly sha256: string;
}

/** The earlier document with the same bytes, as an EDI_DUPLICATE for the receipt, or null. */
export function duplicateDocument(sha256: string, known: readonly KnownDocument[]): { readonly duplicateOf: string; readonly error: EdiError } | null {
  const match = known.find((document) => document.sha256 === sha256);
  return match === undefined ? null : { duplicateOf: match.id, error: duplicate({ segmentIndex: 1, segmentId: 'ISA', elementPosition: 0 }, 'document') };
}

export interface KnownRemittance {
  readonly id: string;
  readonly key: RemittanceKey;
  /** TRN03 (the payer's originating company identifier). */
  readonly originatorId: string;
  /** BPR16. */
  readonly paymentDate: string;
}

export type RemittanceDecision =
  | { readonly outcome: 'new' }
  | {
      readonly outcome: 'duplicate_remittance';
      readonly duplicateOf: string;
      /** key: the remittance key itself; same_payment: the same trace, amount and date under another envelope. */
      readonly basis: 'key' | 'same_payment';
      readonly error: EdiError;
    }
  | { readonly outcome: 'review_trace_reused'; readonly sameTraceAs: string; readonly anotherDate: boolean };

/** What loading `remittance` does, given the remittances the practice already holds. */
export function remittanceDecision(remittance: LoadableRemittance, known: readonly KnownRemittance[]): RemittanceDecision {
  const at = { segmentIndex: remittance.trace.segmentIndex, segmentId: 'TRN', elementPosition: 2 };
  const key = remittanceKeyText(remittance.dedupKey);
  const same = known.find((item) => remittanceKeyText(item.key) === key);
  if (same !== undefined) {
    return { outcome: 'duplicate_remittance', duplicateOf: same.id, basis: 'key', error: duplicate(at, 'remittance') };
  }
  const traces = known.filter(
    (item) => item.key.payeeId === remittance.dedupKey.payeeId && item.key.trn02 === remittance.trace.number && item.originatorId === remittance.trace.originatorId,
  );
  const payment = traces.find((item) => item.key.bpr02Cents === remittance.dedupKey.bpr02Cents && item.paymentDate === remittance.payment.date);
  if (payment !== undefined) {
    return { outcome: 'duplicate_remittance', duplicateOf: payment.id, basis: 'same_payment', error: duplicate(at, 'remittance') };
  }
  const [trace] = traces;
  if (trace !== undefined) {
    return { outcome: 'review_trace_reused', sameTraceAs: trace.id, anotherDate: trace.paymentDate !== remittance.payment.date };
  }
  return { outcome: 'new' };
}
