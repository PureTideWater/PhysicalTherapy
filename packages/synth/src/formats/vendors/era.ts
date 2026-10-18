/**
 * The vendor ERA exports (registry.ts, kind era_export), generated from the case registry's synthetic
 * 835s: one row per service line, with its claim's and its payment's fields repeated, as
 * practice-management systems list remittances. Every value comes from the 835's expectation in the
 * case's expected.json (the parser's reading of the file), so the rows of a payment total its claims
 * paid to the cent, and the payment is the parser's signed payment: BPR02 as written for a credit, and
 * BPR02 negated for a debit (BPR03 D, a take-back), so the rows of a debit total its payment too.
 *
 * The sources are loaded, balanced 835s whose adjustments are all at line level and that carry no PLB:
 * a row has no place for a claim-level adjustment or a provider-level one, so such a file is refused
 * here rather than written short. Adjustments are written as the three totals a remittance screen
 * shows (contractual CO, patient responsibility PR, other OA, PI and CR) and their codes as one list;
 * per line, charge = paid + contractual + patient responsibility + other.
 */
import { type Cents, addCents, centsToString, parseCents, subtractCents, sumCents } from '@tp/money';

import { type GeneratedCase } from '../../cases/builder';
import { findCase } from '../../cases/registry';
import { type AdjustmentExpectation, type ParseExpectation } from '../../expected/types';
import { type EraFormat, FORMAT_MARKER, type VendorEraField } from './registry';
import { VendorFormatError, vendorCsv, writeDate, writeMoney } from './table';

/** One ERA line, amounts in integer cents as text. */
export interface CanonicalEraRow {
  /** The interchange sender (ISA06): SYNTHSENDER. */
  readonly senderId: string;
  readonly payerName: string;
  readonly payeeId: string;
  /** TRN02. */
  readonly trace: string;
  /** BPR16. */
  readonly paymentDate: string;
  /** The signed payment: BPR02, negated when BPR03 is D (a debit). */
  readonly paymentCents: string;
  /** BPR04. */
  readonly paymentMethod: string;
  /** CLP01. */
  readonly patientControlNumber: string;
  /** CLP07. */
  readonly payerClaimNumber: string;
  /** CLP02. */
  readonly claimStatus: string;
  /** REF CE, when sent. */
  readonly plan: string | null;
  readonly serviceDate: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  /** SVC05 as sent. */
  readonly units: string | null;
  readonly chargeCents: string;
  /** AMT B6, when sent. */
  readonly allowedCents: string | null;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string;
  readonly contractualAdjustmentCents: string;
  readonly otherAdjustmentCents: string;
  /** Each line adjustment as group-reason ("CO-45"), in order. */
  readonly adjustmentCodes: readonly string[];
}

/** A source 835: a file of a test-matrix case, relative to its directory. */
export interface EraSource {
  readonly caseId: string;
  readonly file: string;
}

/**
 * The minimal file (PAR-01), a reversal and its correction (PAR-08), a denied zero-pay claim (PAR-09),
 * AMT B6 (PAR-12), patient responsibility split over three reasons (PAR-13) and decimal units with four
 * modifiers (PAR-22).
 */
export const ERA_SOURCES: readonly EraSource[] = [
  { caseId: 'PAR-01', file: 'remit.835' },
  { caseId: 'PAR-08', file: 'original.835' },
  { caseId: 'PAR-08', file: 'correction.835' },
  { caseId: 'PAR-09', file: 'remit.835' },
  { caseId: 'PAR-12', file: 'remit.835' },
  { caseId: 'PAR-13', file: 'remit.835' },
  { caseId: 'PAR-22', file: 'remit.835' },
];

/** One payment of the export, with what its rows total. */
export interface EraCheck {
  readonly caseId: string;
  readonly file: string;
  readonly trace: string;
  readonly paymentCents: string;
  readonly claimsPaidCents: string;
  readonly rows: number;
  readonly paidCents: string;
}

const total = (adjustments: readonly AdjustmentExpectation[], groups: readonly string[]): Cents => sumCents(adjustments.filter((item) => groups.includes(item.group)).map((item) => parseCents(item.amountCents)));

/** The rows of one 835 expectation, and its payments; refuses what a line row cannot carry. */
export function eraRowsOf(parse: ParseExpectation, label: string): { readonly rows: CanonicalEraRow[]; readonly checks: readonly Omit<EraCheck, 'caseId' | 'file'>[] } {
  if (parse.outcome !== 'loaded' || parse.documentErrors.length > 0) {
    throw new VendorFormatError(`${label}: only a loaded 835 is a source`);
  }
  const rows: CanonicalEraRow[] = [];
  const checks: Omit<EraCheck, 'caseId' | 'file'>[] = [];
  for (const transaction of parse.transactions) {
    if (transaction.plb.length > 0 || !transaction.balance.balanced || transaction.dedupKey.senderId !== FORMAT_MARKER) {
      throw new VendorFormatError(`${label}: a source payment is balanced, synthetic and has no PLB`);
    }
    const before = rows.length;
    for (const claim of transaction.claims) {
      if (claim.adjustments.length > 0 || claim.lines.length === 0) {
        throw new VendorFormatError(`${label}: a source claim has lines and only line-level adjustments`);
      }
      if (centsToString(sumCents(claim.lines.map((line) => parseCents(line.paidCents)))) !== claim.paidCents) {
        throw new VendorFormatError(`${label}: a source claim's lines do not total its payment`);
      }
      for (const line of claim.lines) {
        if (line.serviceFrom === null || (line.serviceTo !== null && line.serviceTo !== line.serviceFrom)) {
          throw new VendorFormatError(`${label}: a source line has one date of service`);
        }
        const contractual = total(line.adjustments, ['CO']);
        const patient = total(line.adjustments, ['PR']);
        const other = total(line.adjustments, ['OA', 'PI', 'CR']);
        const paid = parseCents(line.paidCents);
        if (subtractCents(parseCents(line.chargeCents), addCents(addCents(paid, contractual), addCents(patient, other))) !== 0n) {
          throw new VendorFormatError(`${label}: a source line does not balance`);
        }
        rows.push({
          senderId: transaction.dedupKey.senderId,
          payerName: transaction.payerName,
          payeeId: transaction.dedupKey.payeeId,
          trace: transaction.dedupKey.trn02,
          paymentDate: transaction.bpr16Date,
          paymentCents: transaction.balance.paymentCents,
          paymentMethod: transaction.bprMethod,
          patientControlNumber: claim.patientControlNumber,
          payerClaimNumber: claim.payerClaimControlNumber,
          claimStatus: claim.status,
          plan: claim.planRef,
          serviceDate: line.serviceFrom,
          procedureCode: line.procedureCode,
          modifiers: line.modifiers,
          units: line.units,
          chargeCents: line.chargeCents,
          allowedCents: line.lineAllowedCents,
          paidCents: line.paidCents,
          patientResponsibilityCents: centsToString(patient),
          contractualAdjustmentCents: centsToString(contractual),
          otherAdjustmentCents: centsToString(other),
          adjustmentCodes: line.adjustments.map((item) => `${item.group}-${item.reason}`),
        });
      }
    }
    const paid = centsToString(sumCents(rows.slice(before).map((row) => parseCents(row.paidCents))));
    checks.push({ trace: transaction.dedupKey.trn02, paymentCents: transaction.balance.paymentCents, claimsPaidCents: transaction.balance.claimsPaidCents, rows: rows.length - before, paidCents: paid });
  }
  return { rows, checks };
}

export interface EraSourceRows {
  readonly rows: readonly CanonicalEraRow[];
  readonly checks: readonly EraCheck[];
}

/** Every source 835's rows and payments, generated afresh from the case registry. */
export function eraSourceRows(sources: readonly EraSource[] = ERA_SOURCES): EraSourceRows {
  const rows: CanonicalEraRow[] = [];
  const checks: EraCheck[] = [];
  const generated = new Map<string, GeneratedCase>();
  for (const source of sources) {
    let found = generated.get(source.caseId);
    if (found === undefined) {
      found = findCase(source.caseId)?.generate();
      if (found === undefined) {
        throw new VendorFormatError(`no case ${source.caseId}`);
      }
      generated.set(source.caseId, found);
    }
    const parse = found.expected.files.find((file) => file.path === source.file)?.x12?.parse;
    if (parse === undefined) {
      throw new VendorFormatError(`${source.caseId} generates no 835 ${source.file}`);
    }
    const read = eraRowsOf(parse, `${source.caseId}/${source.file}`);
    rows.push(...read.rows);
    checks.push(...read.checks.map((check) => ({ caseId: source.caseId, file: source.file, ...check })));
  }
  return { rows, checks };
}

function eraCell(format: EraFormat, field: VendorEraField, row: CanonicalEraRow): string {
  switch (field) {
    case 'sender_id':
      return row.senderId;
    case 'payer_name':
      return row.payerName;
    case 'payee_id':
      return row.payeeId;
    case 'trace':
      return row.trace;
    case 'payment_date':
      return writeDate(row.paymentDate, format.dateFormat);
    case 'payment_amount':
      return writeMoney(row.paymentCents);
    case 'payment_method':
      return row.paymentMethod;
    case 'patient_control_number':
      return row.patientControlNumber;
    case 'payer_claim_number':
      return row.payerClaimNumber;
    case 'claim_status':
      return row.claimStatus;
    case 'plan':
      return row.plan ?? '';
    case 'service_date':
      return writeDate(row.serviceDate, format.dateFormat);
    case 'procedure_code':
      return row.procedureCode;
    case 'modifiers':
      return row.modifiers.join(format.listSeparator);
    case 'units':
      return row.units ?? '';
    case 'charge':
      return writeMoney(row.chargeCents);
    case 'allowed':
      return row.allowedCents === null ? '' : writeMoney(row.allowedCents);
    case 'paid':
      return writeMoney(row.paidCents);
    case 'patient_responsibility':
      return writeMoney(row.patientResponsibilityCents);
    case 'contractual_adjustment':
      return writeMoney(row.contractualAdjustmentCents);
    case 'other_adjustment':
      return writeMoney(row.otherAdjustmentCents);
    case 'adjustment_codes':
      return row.adjustmentCodes.join(format.listSeparator);
  }
}

/** The rows written as `format` writes an ERA export. */
export function vendorEraExport(format: EraFormat, rows: readonly CanonicalEraRow[]): Uint8Array {
  return vendorCsv(
    format,
    rows.map((row) => format.columns.map((column) => eraCell(format, column.field, row))),
  );
}
