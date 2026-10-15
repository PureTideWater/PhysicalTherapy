/**
 * What the parser and loader must produce for an 835 the writer built: computed from the typed model,
 * with segment indexes taken from the rendered segments. Nothing here reads the file's bytes, so a
 * writer mistake shows up as a disagreement with pyx12's reading (tools/test-oracle) or with the
 * summary of the segments (packages/synth's own tests).
 */
import { type Cents, ZERO_CENTS, addCents, cents, centsToString, negateCents, parseCents, subtractCents, sumCents } from '@tp/money';

import { type CalendarDate, dayNumber } from '../core/dates';
import { SYNTH_SENDER_ID } from '../identity';
import { balancingPayment, paymentAmount } from '../x12/build835';
import { casTotal, patientShareTotal } from '../x12/factory';
import { type CasSegment, type Claim, type File835, type ServiceLine } from '../x12/model';
import { type X12Document } from '../x12/segments';
import {
  type AdjustmentExpectation,
  type ClaimExpectation,
  type EdiErrorExpectation,
  type LineExpectation,
  type ObservedAllowedExpectation,
  type ParseExpectation,
  type PlbCategory,
  type PlbExpectation,
  type ReceiptExpectation,
  type TransactionExpectation,
  type UnknownCodeExpectation,
} from './types';

/** The SYNTHETIC release whose code lists the fixtures' code checks use. */
export const CODE_LIST_RELEASE = 900001;
/** Claim adjustment reason codes in release-synth-900001 that are active in 2026 (9001 stopped in 2020). */
export const SYNTHETIC_CARCS: ReadonlySet<string> = new Set(['1', '2', '3', '23', '45']);
/** Remark codes in release-synth-900001. */
export const SYNTHETIC_RARCS: ReadonlySet<string> = new Set(['N901', 'N902', 'MA901']);

interface LineIndex {
  svc: number;
  cas: number[];
  lq: number[];
}
interface ClaimIndex {
  clp: number;
  cas: number[];
  moa?: number;
  lines: LineIndex[];
}
interface TransactionIndex {
  st: number;
  bpr: number;
  se: number;
  claims: ClaimIndex[];
  plb: number[];
}

/** Segment indexes (from 1, across the whole file) of every transaction, claim, line and adjustment. */
function indexDocument(document: X12Document): TransactionIndex[][][] {
  const result: TransactionIndex[][][] = [];
  let index = 0;
  for (const interchange of document.interchanges) {
    const groups: TransactionIndex[][] = [];
    let transaction: TransactionIndex | undefined;
    let claim: ClaimIndex | undefined;
    let line: LineIndex | undefined;
    for (const segment of interchange.segments) {
      index += 1;
      switch (segment.id) {
        case 'GS':
          groups.push([]);
          break;
        case 'ST':
          transaction = { st: index, bpr: 0, se: 0, claims: [], plb: [] };
          groups[groups.length - 1]?.push(transaction);
          claim = undefined;
          line = undefined;
          break;
        case 'BPR':
          if (transaction) {
            transaction.bpr = index;
          }
          break;
        case 'SE':
          if (transaction) {
            transaction.se = index;
          }
          break;
        case 'CLP':
          claim = { clp: index, cas: [], lines: [] };
          transaction?.claims.push(claim);
          line = undefined;
          break;
        case 'SVC':
          line = { svc: index, cas: [], lq: [] };
          claim?.lines.push(line);
          break;
        case 'CAS':
          (line ? line.cas : claim?.cas)?.push(index);
          break;
        case 'MOA':
          if (claim) {
            claim.moa = index;
          }
          break;
        case 'LQ':
          line?.lq.push(index);
          break;
        case 'PLB':
          transaction?.plb.push(index);
          claim = undefined;
          line = undefined;
          break;
        default:
          break;
      }
    }
    result.push(groups);
  }
  return result;
}

function adjustmentsOf(segments: readonly CasSegment[], indexes: readonly number[]): AdjustmentExpectation[] {
  const list: AdjustmentExpectation[] = [];
  segments.forEach((segment, segmentPosition) => {
    for (const item of segment.items) {
      list.push({
        group: segment.group,
        reason: item.reason,
        amountCents: centsToString(item.amount),
        quantity: item.quantity ?? null,
        position: list.length + 1,
        segmentIndex: indexes[segmentPosition] ?? 0,
      });
    }
  });
  return list;
}

function unknownCas(segments: readonly CasSegment[], indexes: readonly number[]): UnknownCodeExpectation[] {
  const unknown: UnknownCodeExpectation[] = [];
  segments.forEach((segment, segmentPosition) => {
    segment.items.forEach((item, itemPosition) => {
      if (!SYNTHETIC_CARCS.has(item.reason)) {
        unknown.push({ list: 'carc', code: item.reason, segmentIndex: indexes[segmentPosition] ?? 0, segmentId: 'CAS', elementPosition: 2 + itemPosition * 3 });
      }
    });
  });
  return unknown;
}

/** Splits `total` over lines in proportion to `weights`; leftover cents go one each to the first lines. */
export function allocateProRata(total: Cents, weights: readonly Cents[]): Cents[] {
  if (weights.length === 0) {
    return [];
  }
  const magnitudes = weights.map((weight): bigint => (weight < 0n ? negateCents(weight) : weight));
  const sum = magnitudes.reduce((a, b) => a + b, 0n);
  const shares = magnitudes.map((weight) => (sum === 0n ? total / BigInt(weights.length) : (total * weight) / sum));
  let remainder = total - shares.reduce((a, b) => a + b, 0n);
  const step = remainder < 0n ? -1n : 1n;
  for (let index = 0; remainder !== 0n; index = (index + 1) % shares.length) {
    shares[index] = (shares[index] ?? 0n) + step;
    remainder -= step;
  }
  return shares.map((share) => cents(share));
}

function lineDates(serviceLine: ServiceLine, claim: Claim): [CalendarDate | null, CalendarDate | null] {
  switch (serviceLine.dates.kind) {
    case 'single':
      return [serviceLine.dates.date, serviceLine.dates.date];
    case 'period':
    case 'rd8':
      return [serviceLine.dates.from, serviceLine.dates.to];
    case 'none':
      return [claim.statementFrom ?? null, claim.statementTo ?? claim.statementFrom ?? null];
  }
}

function b6Of(serviceLine: ServiceLine): Cents | undefined {
  return serviceLine.amounts?.find((amount) => amount.qualifier === 'B6')?.amount;
}

function observedAllowed(claim: Claim): ObservedAllowedExpectation[] {
  const claimShare = patientShareTotal(claim.adjustments);
  const linesCarryShare = claim.lines.some((serviceLine) => serviceLine.adjustments.some((segment) => segment.group === 'PR'));
  const eligible = claim.lines.map((serviceLine, position) => ({ serviceLine, position })).filter(({ serviceLine }) => b6Of(serviceLine) === undefined);
  const allocate = claimShare !== 0n && !linesCarryShare;
  const shares = allocate ? allocateProRata(claimShare, eligible.map(({ serviceLine }) => serviceLine.charge)) : [];
  const shareByPosition = new Map(eligible.map(({ position }, index) => [position, shares[index] ?? ZERO_CENTS]));
  return claim.lines.map((serviceLine, position) => {
    const b6 = b6Of(serviceLine);
    if (b6 !== undefined) {
      return { cents: centsToString(b6), basis: 'amt_b6', allocatedFromClaim: false };
    }
    if (allocate) {
      return { cents: centsToString(addCents(serviceLine.paid, shareByPosition.get(position) ?? ZERO_CENTS)), basis: 'paid_plus_pr', allocatedFromClaim: true };
    }
    return { cents: centsToString(addCents(serviceLine.paid, patientShareTotal(serviceLine.adjustments))), basis: 'paid_plus_pr', allocatedFromClaim: false };
  });
}

/** The balance rules of docs/adr/0021, on the model. Each failure is a hold reason with its position. */
function claimHolds(claim: Claim, index: ClaimIndex): EdiErrorExpectation[] {
  const holds: EdiErrorExpectation[] = [];
  const lineCas = sumCents(claim.lines.map((serviceLine) => casTotal(serviceLine.adjustments)));
  const difference = subtractCents(subtractCents(subtractCents(claim.charge, casTotal(claim.adjustments)), lineCas), claim.paid);
  if (difference !== 0n) {
    holds.push({ code: 'EDI_UNBALANCED', scope: 'claim', segmentIndex: index.clp, segmentId: 'CLP', elementPosition: 4, differenceCents: centsToString(difference) });
  }
  if (claim.lines.length > 0) {
    const chargeDifference = subtractCents(sumCents(claim.lines.map((serviceLine) => serviceLine.charge)), claim.charge);
    if (chargeDifference !== 0n) {
      holds.push({ code: 'EDI_UNBALANCED', scope: 'claim_lines', segmentIndex: index.clp, segmentId: 'CLP', elementPosition: 3, differenceCents: centsToString(chargeDifference) });
    }
  }
  claim.lines.forEach((serviceLine, position) => {
    if (serviceLine.adjustments.length === 0 && claim.adjustments.length > 0) {
      return;
    }
    const lineDifference = subtractCents(subtractCents(serviceLine.charge, casTotal(serviceLine.adjustments)), serviceLine.paid);
    if (lineDifference !== 0n) {
      holds.push({ code: 'EDI_UNBALANCED', scope: 'line', segmentIndex: index.lines[position]?.svc ?? 0, segmentId: 'SVC', elementPosition: 3, differenceCents: centsToString(lineDifference) });
    }
  });
  return holds;
}

function plbCategory(code: string): PlbCategory {
  switch (code) {
    case 'WO':
      return 'recoupment';
    case 'FB':
      return 'forward_balance';
    case 'L6':
      return 'interest';
    case '72':
      return 'authorized_return';
    default:
      return 'other';
  }
}

function claimExpectation(claim: Claim, index: ClaimIndex, position: number): { expectation: ClaimExpectation; unknown: UnknownCodeExpectation[] } {
  const unknown = unknownCas(claim.adjustments, index.cas);
  (claim.outpatient?.remarks ?? []).forEach((code, remarkPosition) => {
    if (!SYNTHETIC_RARCS.has(code)) {
      unknown.push({ list: 'rarc', code, segmentIndex: index.moa ?? 0, segmentId: 'MOA', elementPosition: 3 + remarkPosition });
    }
  });
  const observed = observedAllowed(claim);
  const lines = claim.lines.map((serviceLine, linePosition): LineExpectation => {
    const lineIndex = index.lines[linePosition] ?? { svc: 0, cas: [], lq: [] };
    unknown.push(...unknownCas(serviceLine.adjustments, lineIndex.cas));
    (serviceLine.remarks ?? []).forEach((remark, remarkPosition) => {
      if (remark.qualifier === 'HE' && !SYNTHETIC_RARCS.has(remark.code)) {
        unknown.push({ list: 'rarc', code: remark.code, segmentIndex: lineIndex.lq[remarkPosition] ?? 0, segmentId: 'LQ', elementPosition: 2 });
      }
    });
    const [from, to] = lineDates(serviceLine, claim);
    const b6 = b6Of(serviceLine);
    return {
      lineNo: linePosition + 1,
      segmentIndex: lineIndex.svc,
      procedureQualifier: serviceLine.procedure.qualifier,
      procedureCode: serviceLine.procedure.code,
      modifiers: [...(serviceLine.procedure.modifiers ?? [])],
      revenueCode: serviceLine.revenueCode ?? null,
      chargeCents: centsToString(serviceLine.charge),
      paidCents: centsToString(serviceLine.paid),
      units: serviceLine.units ?? null,
      originalUnits: serviceLine.originalUnits ?? null,
      serviceFrom: from,
      serviceTo: to,
      lineAllowedCents: b6 === undefined ? null : centsToString(b6),
      observedAllowed: observed[linePosition] ?? { cents: '0', basis: 'paid_plus_pr', allocatedFromClaim: false },
      patientShareCents: centsToString(patientShareTotal(serviceLine.adjustments)),
      adjustments: adjustmentsOf(serviceLine.adjustments, lineIndex.cas),
    };
  });
  const dates = lines.flatMap((item) => [item.serviceFrom, item.serviceTo]).filter((date): date is string => date !== null);
  const byDay = (a: string, b: string) => dayNumber(a as CalendarDate) - dayNumber(b as CalendarDate);
  const sorted = [...dates].sort(byDay);
  const au = claim.amounts?.find((amount) => amount.qualifier === 'AU')?.amount;
  return {
    expectation: {
      index: position,
      segmentIndex: index.clp,
      patientControlNumber: claim.patientControlNumber,
      payerClaimControlNumber: claim.payerClaimControlNumber,
      status: claim.status,
      chargeCents: centsToString(claim.charge),
      paidCents: centsToString(claim.paid),
      patientResponsibilityCents: claim.patientResponsibility === undefined ? null : centsToString(claim.patientResponsibility),
      filingIndicator: claim.filingIndicator,
      facilityCode: claim.facilityCode ?? null,
      frequencyCode: claim.frequencyCode ?? null,
      planRef: claim.refs?.find((ref) => ref.qualifier === 'CE')?.value ?? null,
      serviceFrom: claim.statementFrom ?? sorted[0] ?? null,
      serviceTo: claim.statementTo ?? sorted[sorted.length - 1] ?? null,
      allowedCents: au === undefined ? null : centsToString(au),
      adjustments: adjustmentsOf(claim.adjustments, index.cas),
      lines,
    },
    unknown,
  };
}

/** The parser and loader expectation for a well-formed 835 file built from `file`, rendered as `document`. */
export function expectParse(file: File835, document: X12Document): ParseExpectation {
  const indexes = indexDocument(document);
  const transactions: TransactionExpectation[] = [];
  file.interchanges.forEach((interchange, interchangePosition) => {
    interchange.groups.forEach((group, groupPosition) => {
      group.transactions.forEach((transaction, transactionPosition) => {
        const index = indexes[interchangePosition]?.[groupPosition]?.[transactionPosition];
        if (!index) {
          throw new Error('the document does not match the model');
        }
        const remittance = transaction.remittance;
        const claims = remittance.claimGroups.flatMap((claimGroup) => claimGroup.claims);
        const holds: EdiErrorExpectation[] = [];
        const actualCount = index.se - index.st + 1;
        if (transaction.seCountOverride !== undefined && transaction.seCountOverride !== actualCount) {
          holds.push({
            code: 'EDI_CONTROL_MISMATCH',
            segmentIndex: index.se,
            segmentId: 'SE',
            elementPosition: 1,
            expected: String(actualCount),
            found: String(transaction.seCountOverride),
          });
        }
        const unknown: UnknownCodeExpectation[] = [];
        const claimExpectations = claims.map((claim, position) => {
          const claimIndex = index.claims[position] ?? { clp: 0, cas: [], lines: [] };
          holds.push(...claimHolds(claim, claimIndex));
          const built = claimExpectation(claim, claimIndex, position);
          unknown.push(...built.unknown);
          return built.expectation;
        });
        const written = paymentAmount(remittance);
        const payment = remittance.payment.creditDebit === 'D' ? negateCents(written) : written;
        const claimsPaid = sumCents(claims.map((claim) => claim.paid));
        const plbTotal = sumCents(remittance.providerAdjustments.flatMap((plb) => plb.items.map((item) => item.amount)));
        const difference = subtractCents(balancingPayment(remittance), payment);
        if (difference !== 0n) {
          holds.unshift({ code: 'EDI_UNBALANCED', scope: 'transaction', segmentIndex: index.bpr, segmentId: 'BPR', elementPosition: 2, differenceCents: centsToString(difference) });
        }
        const plb: PlbExpectation[] = remittance.providerAdjustments.flatMap((segment, segmentPosition) =>
          segment.items.map((item) => ({
            segmentIndex: index.plb[segmentPosition] ?? 0,
            providerId: segment.providerId,
            fiscalPeriodDate: segment.fiscalPeriodDate,
            code: item.code,
            reference: item.reference ?? null,
            amountCents: centsToString(item.amount),
            category: plbCategory(item.code),
            counted: item.code !== 'FB',
          })),
        );
        transactions.push({
          interchange: interchangePosition,
          group: groupPosition,
          transaction: transactionPosition,
          isa13: String(interchange.controlNumber).padStart(9, '0'),
          gs06: String(group.controlNumber),
          st02: transaction.controlNumber,
          status: holds.length > 0 ? 'held' : 'loaded',
          heldReasons: holds,
          dedupKey: {
            senderId: SYNTH_SENDER_ID,
            payeeId: remittance.payee.id.value,
            isa13: String(interchange.controlNumber).padStart(9, '0'),
            trn02: remittance.trace.number,
            bpr02Cents: centsToString(written),
          },
          bprMethod: remittance.payment.method,
          bprHandling: remittance.payment.handling,
          bpr16Date: remittance.payment.date,
          payerName: remittance.payer.name,
          payerIds: [...(remittance.payer.id ? [[remittance.payer.id.qualifier, remittance.payer.id.value] as const] : []), ...(remittance.payer.refs ?? []).map((ref) => [ref.qualifier, ref.value] as const), ['TRN03', remittance.trace.originatorId] as const],
          balance: {
            claimsPaidCents: centsToString(claimsPaid),
            plbTotalCents: centsToString(plbTotal),
            paymentCents: centsToString(payment),
            differenceCents: centsToString(difference),
            balanced: difference === 0n,
          },
          counts: {
            claims: claims.length,
            lines: claims.reduce((total, claim) => total + claim.lines.length, 0),
            reversals: claims.filter((claim) => claim.status === '22').length,
            plbItems: plb.length,
          },
          claims: claimExpectations,
          plb,
          unknownCodes: unknown,
        });
      });
    });
  });
  return { outcome: outcomeOf(transactions), documentErrors: [], transactions, receipt: receiptOf(transactions) };
}

export function outcomeOf(transactions: readonly TransactionExpectation[]): ParseExpectation['outcome'] {
  const held = transactions.filter((transaction) => transaction.status === 'held').length;
  if (held === 0) {
    return 'loaded';
  }
  return held === transactions.length ? 'held' : 'partially_held';
}

export function receiptOf(transactions: readonly TransactionExpectation[]): ReceiptExpectation {
  const loaded = transactions.filter((transaction) => transaction.status === 'loaded');
  const codes = new Set(transactions.flatMap((transaction) => transaction.unknownCodes.map((code) => `${code.list}:${code.code}`)));
  return {
    transactions: transactions.length,
    claims: transactions.reduce((total, transaction) => total + transaction.counts.claims, 0),
    lines: transactions.reduce((total, transaction) => total + transaction.counts.lines, 0),
    reversals: transactions.reduce((total, transaction) => total + transaction.counts.reversals, 0),
    plbTotalCents: centsToString(sumCents(transactions.map((transaction) => parseCents(transaction.balance.plbTotalCents)))),
    held: transactions
      .filter((transaction) => transaction.status === 'held')
      .map((transaction) => ({ st02: transaction.st02, reasons: [...new Set(transaction.heldReasons.map((reason) => reason.code))] })),
    unknownCodes: [...codes].sort(),
    loaded: {
      transactions: loaded.length,
      claims: loaded.reduce((total, transaction) => total + transaction.counts.claims, 0),
      lines: loaded.reduce((total, transaction) => total + transaction.counts.lines, 0),
    },
  };
}
