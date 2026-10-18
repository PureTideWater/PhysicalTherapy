/**
 * Test support (`@tp/edi835/testing`): the code lists of the SYNTHETIC rule release the fixtures'
 * code checks are relative to (release 1 cannot be loaded where the repository is built; docs/adr/0021),
 * and a small SYNTHETIC 835 writer for the parser's own tests (packages/synth writes the fixtures).
 * Reads files, so it is not part of the package's pure entry point.
 */
import path from 'node:path';

import { readRelease } from '@tp/rules/content';

import { type EdiErrorExpectation, type ParseExpectation, type TransactionExpectation } from '@tp/synth';

import { type CodeListProvider, releaseCodeLists } from './code-lists';
import { type EdiError } from './errors';
import { type ParseResult, parse835, remittancesOf } from './stream';
import { type Claim, type Party, type Payment, type Remittance, type RemittanceKey, type TransactionOutcome } from './types';

export const SYNTHETIC_RELEASE_DIR = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/rules/release-synth-900001');

/** The code lists of a release directory (by default release-synth-900001); refuses a release that does not verify. */
export function releaseDirectoryCodeLists(dir = SYNTHETIC_RELEASE_DIR): CodeListProvider {
  const release = readRelease(dir);
  if (release.problems.length > 0) {
    throw new Error(`the release in ${dir} does not verify: ${release.problems.join('; ')}`);
  }
  return releaseCodeLists(release.manifest.release, release.records.map((located) => located.record));
}

/**
 * The body (BPR to the last segment before SE) of a balanced SYNTHETIC transaction set: one claim,
 * one line, paid 100.00 of 150.00 with CO-45 30.00 and PR-2 20.00.
 */
export const SYNTHETIC_BODY: readonly string[] = [
  'BPR*C*100.00*C*ACH*CCP*01*999999999*DA*SYNACCT1*1SYN00000A**01*999999998*DA*SYNACCT2*20260406',
  'TRN*1*SYNTRACE0001*1SYN00000A',
  'DTM*405*20260405',
  'N1*PR*SYNTHETIC PAYER A',
  'N3*1 SYNTHETIC WAY',
  'N4*SYNTHVILLE*NC*00013',
  'REF*2U*SYNPAYERA',
  'PER*BL*SYNTHETIC HELP DESK*TE*5555550100',
  'N1*PE*SYNTHETIC THERAPY GROUP*XX*9900000001',
  'N3*2 SYNTHETIC ROAD',
  'N4*SYNTHTOWN*NC*00011',
  'REF*TJ*999999997',
  'LX*1',
  'CLP*SYNPCN0001*1*150.00*100.00*20.00*12*SYNCCN0001*11*1',
  'NM1*QC*1*SYNTHLAST*SYNTHFIRST****MI*SYNMBR0001',
  'SVC*HC:97110:GP*150.00*100.00**2',
  'DTM*472*20260315',
  'CAS*CO*45*30.00',
  'CAS*PR*2*20.00',
];

/** The ISA header of a SYNTHETIC interchange written with * : ^ ~ (106 characters with its terminator). */
export function syntheticIsa(isa13 = '000000001'): string {
  return `ISA*00*          *00*          *ZZ*SYNTHSENDER    *ZZ*SYNTHRECEIVER  *260406*0915*^*00501*${isa13}*0*T*:~`;
}

/**
 * A SYNTHETIC 835 interchange (ISA06 SYNTHSENDER, GS02 SYNTH) with one transaction set per body,
 * every count and control number correct, written with * : ^ ~ and no line breaks.
 */
export function syntheticInterchange(bodies: readonly (readonly string[])[] = [SYNTHETIC_BODY], isa13 = '000000001', gs06 = '1'): string {
  const sets = bodies.flatMap((body, index) => {
    const st02 = String(index + 1).padStart(4, '0');
    return [`ST*835*${st02}`, ...body, `SE*${String(body.length + 2)}*${st02}`];
  });
  const segments = [`GS*HP*SYNTH*SYNTHRCV*20260406*0915*${gs06}*X*005010X221A1`, ...sets, `GE*${String(bodies.length)}*${gs06}`, `IEA*1*${isa13}`];
  return syntheticIsa(isa13) + segments.map((segment) => `${segment}~`).join('');
}

/** Parses text with the SYNTHETIC release's code lists. */
export function parseText(text: string, codeLists: CodeListProvider = releaseDirectoryCodeLists()): ParseResult {
  return parse835(Buffer.from(text, 'utf8'), { codeLists });
}

function errorShape(error: EdiError): EdiErrorExpectation {
  const shape: Record<string, unknown> = { code: error.code, segmentIndex: error.segmentIndex, segmentId: error.segmentId, elementPosition: error.elementPosition };
  if (error.componentPosition !== undefined) {
    shape.componentPosition = error.componentPosition;
  }
  if (error.reason !== undefined) {
    shape.reason = error.reason;
  }
  if (error.scope !== undefined) {
    shape.scope = error.scope;
  }
  if (error.differenceCents !== undefined) {
    shape.differenceCents = error.differenceCents.toString();
  }
  if (error.expected !== undefined) {
    shape.expected = error.expected;
  }
  if (error.found !== undefined) {
    shape.found = error.found;
  }
  return shape as unknown as EdiErrorExpectation;
}

const text = (value: bigint | null): string | null => (value === null ? null : value.toString());

function claimShape(claim: Claim) {
  return {
    index: claim.index,
    segmentIndex: claim.segmentIndex,
    patientControlNumber: claim.patientControlNumber,
    payerClaimControlNumber: claim.payerClaimControlNumber,
    status: claim.status,
    chargeCents: claim.chargeCents.toString(),
    paidCents: claim.paidCents.toString(),
    patientResponsibilityCents: text(claim.patientResponsibilityCents),
    filingIndicator: claim.filingIndicator,
    facilityCode: claim.facilityCode,
    frequencyCode: claim.frequencyCode,
    planRef: claim.planRef,
    serviceFrom: claim.serviceFrom,
    serviceTo: claim.serviceTo,
    allowedCents: text(claim.allowedCents),
    adjustments: claim.adjustments.map((adjustment) => ({
      group: adjustment.group,
      reason: adjustment.reason,
      amountCents: adjustment.cents.toString(),
      quantity: adjustment.quantity,
      position: adjustment.position,
      segmentIndex: adjustment.segmentIndex,
    })),
    lines: claim.lines.map((line) => ({
      lineNo: line.lineNo,
      segmentIndex: line.segmentIndex,
      procedureQualifier: line.procedure.qualifier,
      procedureCode: line.procedure.code,
      modifiers: line.procedure.modifiers,
      revenueCode: line.revenueCode,
      chargeCents: line.chargeCents.toString(),
      paidCents: line.paidCents.toString(),
      units: line.units,
      originalUnits: line.originalUnits,
      serviceFrom: line.serviceFrom,
      serviceTo: line.serviceTo,
      lineAllowedCents: text(line.lineAllowedCents),
      observedAllowed: { cents: line.observedAllowed.cents.toString(), basis: line.observedAllowed.basis, allocatedFromClaim: line.observedAllowed.allocatedFromClaim },
      patientShareCents: line.patientShareCents.toString(),
      adjustments: line.adjustments.map((adjustment) => ({
        group: adjustment.group,
        reason: adjustment.reason,
        amountCents: adjustment.cents.toString(),
        quantity: adjustment.quantity,
        position: adjustment.position,
        segmentIndex: adjustment.segmentIndex,
      })),
    })),
  };
}

/** A loadable or balance-held transaction set in the expectation's shape (every part present). */
function transactionShape(remittance: Remittance, heldReasons: readonly EdiError[]): TransactionExpectation {
  const payment = remittance.payment as Payment;
  const key = remittance.dedupKey as RemittanceKey;
  return {
    interchange: remittance.position.interchange,
    group: remittance.position.group,
    transaction: remittance.position.transaction,
    isa13: remittance.interchangeControlNumber,
    gs06: remittance.groupControlNumber,
    st02: remittance.controlNumber,
    status: heldReasons.length === 0 ? 'loaded' : 'held',
    heldReasons: heldReasons.map(errorShape),
    dedupKey: { ...key, bpr02Cents: key.bpr02Cents.toString() },
    bprMethod: payment.method,
    bprHandling: payment.handling,
    bpr16Date: payment.date,
    payerName: (remittance.payer as Party).name,
    payerIds: remittance.payerIdentifiers,
    balance: {
      claimsPaidCents: remittance.balance.claimsPaidCents.toString(),
      plbTotalCents: remittance.balance.plbTotalCents.toString(),
      paymentCents: remittance.balance.paymentCents.toString(),
      differenceCents: remittance.balance.differenceCents.toString(),
      balanced: remittance.balance.balanced,
    },
    counts: remittance.counts,
    claims: remittance.claims.map(claimShape),
    plb: remittance.providerAdjustments.map((item) => ({
      segmentIndex: item.segmentIndex,
      providerId: item.providerId,
      fiscalPeriodDate: item.fiscalPeriodDate,
      code: item.code,
      reference: item.reference,
      amountCents: item.cents.toString(),
      category: item.category,
      counted: item.counted,
    })),
    unknownCodes: remittance.unknownCodes.map((code) => ({ list: code.list, code: code.value, segmentIndex: code.segmentIndex, segmentId: code.segmentId, elementPosition: code.elementPosition })),
  };
}

/** The parse in the shape of packages/synth's expected.json `parse` (without the later-milestone `pricing` and the note `toleratedByParser`). */
export function parseShape(result: ParseResult): Omit<ParseExpectation, 'pricing' | 'toleratedByParser'> {
  const { report } = result;
  return {
    outcome: report.outcome,
    documentErrors: report.documentErrors.map(errorShape),
    transactions: remittancesOf(result).map((remittance, index) => transactionShape(remittance, (report.transactions[index] as TransactionOutcome).heldReasons)),
    receipt: { ...report.receipt, plbTotalCents: report.receipt.plbTotalCents.toString() },
  };
}

/** expected.json's parse without the fields the parser does not produce, and without cross-file claim references. */
export function comparable(expected: ParseExpectation): Omit<ParseExpectation, 'pricing' | 'toleratedByParser'> {
  return {
    outcome: expected.outcome,
    documentErrors: expected.documentErrors,
    transactions: expected.transactions.map((transaction) => ({
      ...transaction,
      claims: transaction.claims.map((claim) => {
        const { reversalOf: _reversalOf, supersedes: _supersedes, ...rest } = claim;
        return rest;
      }),
    })),
    receipt: expected.receipt,
  };
}
