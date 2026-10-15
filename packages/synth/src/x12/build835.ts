/**
 * The 835 writer: the typed model to segments, in the transaction's segment order, with control
 * numbers and counts computed (ISA13 = IEA02, GS06 = GE02, ST02 = SE02; SE01, GE01 and IEA01 count
 * what they enclose). The sender is always SYNTHSENDER in ISA06 and SYNTH in GS02.
 */
import { type Cents, formatCents, negateCents, subtractCents, sumCents } from '@tp/money';

import { type CalendarDate, toIsaDate, toX12Date } from '../core/dates';
import { SYNTH_GS02, SYNTH_ISA06 } from '../identity';
import {
  type Claim,
  type Contact,
  type File835,
  type FunctionalGroup835,
  type Interchange835,
  type Party,
  type Procedure,
  type Ref,
  type Remittance835,
  type ServiceLine,
  TRANSACTION_VERSION,
} from './model';
import { X12BuildError, type X12Document, type X12Interchange, type X12Segment, seg } from './segments';

/** How amounts are written: "100.00" always, or trimmed the way many payers send them ("100", "80.5", ".5"). */
export type AmountStyle = 'fixed' | 'trimmed';

export interface WriteOptions {
  readonly amountStyle?: AmountStyle;
}

export function formatX12Amount(amount: Cents, style: AmountStyle = 'fixed'): string {
  const fixed = formatCents(amount);
  if (style === 'fixed') {
    return fixed;
  }
  const negative = fixed.startsWith('-');
  let [whole = '', fraction = ''] = (negative ? fixed.slice(1) : fixed).split('.');
  fraction = fraction.replace(/0+$/, '');
  if (whole === '0' && fraction !== '') {
    whole = '';
  }
  const text = fraction === '' ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** The payment a transaction balances to: claims paid minus provider adjustments (docs/adr/0021). */
export function balancingPayment(remittance: Remittance835): Cents {
  const claimsPaid = sumCents(remittance.claimGroups.flatMap((group) => group.claims.map((claim) => claim.paid)));
  const adjustments = sumCents(remittance.providerAdjustments.flatMap((plb) => plb.items.map((item) => item.amount)));
  return subtractCents(claimsPaid, adjustments);
}

/** BPR02 as written: the model's amount, or the balancing amount (its magnitude when BPR03 is D). */
export function paymentAmount(remittance: Remittance835): Cents {
  if (remittance.payment.amount !== undefined) {
    return remittance.payment.amount;
  }
  const balancing = balancingPayment(remittance);
  return remittance.payment.creditDebit === 'D' ? negateCents(balancing) : balancing;
}

class Writer {
  constructor(private readonly style: AmountStyle) {}

  amount(value: Cents | undefined): string | undefined {
    return value === undefined ? undefined : formatX12Amount(value, this.style);
  }

  contact(qualifier: string, contact: Contact): X12Segment {
    if (contact.numbers.length > 3) {
      throw new X12BuildError('a PER segment carries at most three communication numbers');
    }
    const numbers = contact.numbers.flatMap((number) => [number.qualifier, number.value]);
    return seg('PER', qualifier, contact.name, ...numbers);
  }

  party(qualifier: string, party: Party): X12Segment {
    return seg('NM1', qualifier, party.entity, party.last, party.first, party.middle, undefined, party.suffix, party.id?.qualifier, party.id?.value);
  }

  procedure(procedure: Procedure): string[] {
    const modifiers = procedure.modifiers ?? [];
    if (modifiers.length > 4) {
      throw new X12BuildError('a procedure carries at most four modifiers');
    }
    const components = [procedure.qualifier, procedure.code, modifiers[0] ?? '', modifiers[1] ?? '', modifiers[2] ?? '', modifiers[3] ?? ''];
    if (procedure.description !== undefined) {
      components.push(procedure.description);
    }
    return components;
  }

  cas(segments: Claim['adjustments']): X12Segment[] {
    return segments.map((cas) => {
      if (cas.items.length < 1 || cas.items.length > 6) {
        throw new X12BuildError('a CAS segment carries one to six adjustments');
      }
      return seg('CAS', cas.group, ...cas.items.flatMap((item) => [item.reason, this.amount(item.amount), item.quantity]));
    });
  }

  refs(refs: readonly Ref[] | undefined, order: readonly (readonly string[])[]): X12Segment[] {
    const list = [...(refs ?? [])];
    const rank = (ref: Ref) => {
      const index = order.findIndex((group) => group.includes(ref.qualifier));
      if (index < 0) {
        throw new X12BuildError(`REF qualifier ${ref.qualifier} is not used here`);
      }
      return index;
    };
    return list
      .map((ref, index) => ({ ref, index, rank: rank(ref) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ ref }) => seg('REF', ref.qualifier, ref.value));
  }

  line(line: ServiceLine): X12Segment[] {
    const segments: X12Segment[] = [
      seg(
        'SVC',
        this.procedure(line.procedure),
        this.amount(line.charge),
        this.amount(line.paid),
        line.revenueCode,
        line.units,
        line.originalProcedure === undefined ? undefined : this.procedure(line.originalProcedure),
        line.originalUnits,
      ),
    ];
    switch (line.dates.kind) {
      case 'none':
        break;
      case 'single':
        segments.push(seg('DTM', '472', toX12Date(line.dates.date)));
        break;
      case 'period':
        segments.push(seg('DTM', '150', toX12Date(line.dates.from)), seg('DTM', '151', toX12Date(line.dates.to)));
        break;
      case 'rd8':
        segments.push(seg('DTM', '472', undefined, undefined, undefined, 'RD8', `${toX12Date(line.dates.from)}-${toX12Date(line.dates.to)}`));
        break;
    }
    segments.push(...this.cas(line.adjustments));
    segments.push(...this.refs(line.refs, LINE_REF_ORDER));
    segments.push(...(line.amounts ?? []).map((amount) => seg('AMT', amount.qualifier, this.amount(amount.amount))));
    segments.push(...(line.quantities ?? []).map((quantity) => seg('QTY', quantity.qualifier, quantity.value)));
    segments.push(...(line.remarks ?? []).map((remark) => seg('LQ', remark.qualifier, remark.code)));
    return segments;
  }

  claim(claim: Claim): X12Segment[] {
    const segments: X12Segment[] = [
      seg(
        'CLP',
        claim.patientControlNumber,
        claim.status,
        this.amount(claim.charge),
        this.amount(claim.paid),
        this.amount(claim.patientResponsibility),
        claim.filingIndicator,
        claim.payerClaimControlNumber,
        claim.facilityCode,
        claim.frequencyCode,
        undefined,
        claim.drgCode,
        claim.drgWeight,
        claim.dischargeFraction,
      ),
    ];
    segments.push(...this.cas(claim.adjustments));
    segments.push(this.party('QC', claim.patient));
    if (claim.insured) {
      segments.push(this.party('IL', claim.insured));
    }
    if (claim.correctedPatient) {
      segments.push(this.party('74', claim.correctedPatient));
    }
    if (claim.renderingProvider) {
      segments.push(this.party('82', claim.renderingProvider));
    }
    if (claim.inpatient) {
      const mia = claim.inpatient;
      segments.push(seg('MIA', mia.coveredDaysOrVisits, this.amount(mia.ppsOperatingOutlier), undefined, this.amount(mia.drgAmount), mia.remark));
    }
    if (claim.outpatient) {
      const moa = claim.outpatient;
      const remarks = moa.remarks ?? [];
      if (remarks.length > 5) {
        throw new X12BuildError('MOA carries at most five remark codes');
      }
      segments.push(
        seg('MOA', moa.reimbursementRate, this.amount(moa.hcpcsPayable), remarks[0], remarks[1], remarks[2], remarks[3], remarks[4], this.amount(moa.esrdPayment), this.amount(moa.nonPayableProfessional)),
      );
    }
    segments.push(...this.refs(claim.refs, [CLAIM_OTHER_REFS]));
    segments.push(...this.refs(claim.renderingRefs, [CLAIM_RENDERING_REFS]));
    const dates: [string, CalendarDate | undefined][] = [
      ['232', claim.statementFrom],
      ['233', claim.statementTo],
      ['036', claim.coverageExpiration],
      ['050', claim.receivedDate],
    ];
    for (const [qualifier, date] of dates) {
      if (date !== undefined) {
        segments.push(seg('DTM', qualifier, toX12Date(date)));
      }
    }
    segments.push(...(claim.contacts ?? []).map((contact) => this.contact('CX', contact)));
    segments.push(...(claim.amounts ?? []).map((amount) => seg('AMT', amount.qualifier, this.amount(amount.amount))));
    segments.push(...(claim.quantities ?? []).map((quantity) => seg('QTY', quantity.qualifier, quantity.value)));
    for (const line of claim.lines) {
      segments.push(...this.line(line));
    }
    return segments;
  }

  /** The segments between ST and SE. */
  body(remittance: Remittance835): X12Segment[] {
    const payment = remittance.payment;
    const segments: X12Segment[] = [
      seg(
        'BPR',
        payment.handling,
        this.amount(paymentAmount(remittance)),
        payment.creditDebit,
        payment.method,
        payment.format,
        payment.payerAccount?.dfiQualifier,
        payment.payerAccount?.dfiNumber,
        payment.payerAccount?.accountQualifier,
        payment.payerAccount?.accountNumber,
        payment.originatingCompanyId,
        payment.originatingCompanySupplemental,
        payment.payeeAccount?.dfiQualifier,
        payment.payeeAccount?.dfiNumber,
        payment.payeeAccount?.accountQualifier,
        payment.payeeAccount?.accountNumber,
        toX12Date(payment.date),
      ),
      seg('TRN', '1', remittance.trace.number, remittance.trace.originatorId, remittance.trace.supplemental),
    ];
    if (remittance.currency !== undefined) {
      segments.push(seg('CUR', 'PR', remittance.currency));
    }
    if (remittance.receiverId !== undefined) {
      segments.push(seg('REF', 'EV', remittance.receiverId));
    }
    if (remittance.versionId !== undefined) {
      segments.push(seg('REF', 'F2', remittance.versionId));
    }
    if (remittance.productionDate !== undefined) {
      segments.push(seg('DTM', '405', toX12Date(remittance.productionDate)));
    }
    const payer = remittance.payer;
    segments.push(seg('N1', 'PR', payer.name, payer.id?.qualifier, payer.id?.value));
    segments.push(seg('N3', payer.address.line1, payer.address.line2));
    segments.push(seg('N4', payer.address.city, payer.address.state, payer.address.postalCode));
    segments.push(...this.refs(payer.refs, [PAYER_REFS]));
    if (payer.businessContact) {
      segments.push(this.contact('CX', payer.businessContact));
    }
    if (payer.technicalContacts.length === 0) {
      throw new X12BuildError('the payer needs at least one technical contact (PER BL)');
    }
    segments.push(...payer.technicalContacts.map((contact) => this.contact('BL', contact)));
    if (payer.website !== undefined) {
      segments.push(seg('PER', 'IC', undefined, 'UR', payer.website));
    }
    const payee = remittance.payee;
    segments.push(seg('N1', 'PE', payee.name, payee.id.qualifier, payee.id.value));
    if (payee.address) {
      segments.push(seg('N3', payee.address.line1, payee.address.line2));
      segments.push(seg('N4', payee.address.city, payee.address.state, payee.address.postalCode));
    }
    segments.push(...this.refs(payee.refs, [PAYEE_REFS]));
    for (const group of remittance.claimGroups) {
      if (group.claims.length === 0) {
        throw new X12BuildError('an LX loop holds at least one claim');
      }
      segments.push(seg('LX', String(group.headerNumber)));
      for (const claim of group.claims) {
        segments.push(...this.claim(claim));
      }
    }
    for (const plb of remittance.providerAdjustments) {
      if (plb.items.length < 1 || plb.items.length > 6) {
        throw new X12BuildError('a PLB segment carries one to six adjustments');
      }
      segments.push(
        seg(
          'PLB',
          plb.providerId,
          toX12Date(plb.fiscalPeriodDate),
          ...plb.items.flatMap((item) => [item.reference === undefined ? [item.code] : [item.code, item.reference], this.amount(item.amount)]),
        ),
      );
    }
    return segments;
  }
}

const PAYER_REFS = ['2U', 'EO', 'HI', 'NF'];
const PAYEE_REFS = ['0B', 'D3', 'PQ', 'TJ'];
const CLAIM_OTHER_REFS = ['1L', '1W', '28', '6P', '9A', '9C', 'BB', 'CE', 'EA', 'F8', 'G1', 'G3', 'IG', 'SY'];
const CLAIM_RENDERING_REFS = ['0B', '1A', '1B', '1C', '1D', '1G', '1H', '1J', 'D3', 'G2', 'LU'];
/** Line references in the order their groups appear in the 2110 loop. */
const LINE_REF_ORDER = [
  ['1S', 'APC', 'BB', 'E9', 'G1', 'G3', 'LU', 'RB'],
  ['6R'],
  ['0B', '1A', '1B', '1C', '1D', '1G', '1H', '1J', 'D3', 'G2', 'HPI', 'SY', 'TJ'],
  ['0K'],
];

/** The body of one transaction set (between ST and SE). */
export function transactionBody(remittance: Remittance835, options: WriteOptions = {}): X12Segment[] {
  return new Writer(options.amountStyle ?? 'fixed').body(remittance);
}

function isaSegment(interchange: Interchange835): X12Segment {
  if (!/^[A-Z0-9 ]{1,15}$/.test(interchange.receiverId)) {
    throw new X12BuildError('ISA08 is one to fifteen letters, digits or spaces');
  }
  if (!/^\d{4}$/.test(interchange.time)) {
    throw new X12BuildError('ISA10 is HHMM');
  }
  return seg(
    'ISA',
    '00',
    ' '.repeat(10),
    '00',
    ' '.repeat(10),
    'ZZ',
    SYNTH_ISA06,
    'ZZ',
    interchange.receiverId.padEnd(15, ' '),
    toIsaDate(interchange.date),
    interchange.time,
    interchange.delimiters.repetition,
    '00501',
    interchangeControl(interchange.controlNumber),
    '0',
    interchange.usage,
    interchange.delimiters.component,
  );
}

export function interchangeControl(controlNumber: number): string {
  if (!Number.isInteger(controlNumber) || controlNumber < 1 || controlNumber > 999_999_999) {
    throw new X12BuildError('ISA13 is a positive number of up to nine digits');
  }
  return String(controlNumber).padStart(9, '0');
}

function groupSegments(group: FunctionalGroup835, options: WriteOptions): X12Segment[] {
  const segments: X12Segment[] = [seg('GS', 'HP', SYNTH_GS02, group.receiverCode, toX12Date(group.date), group.time, String(group.controlNumber), 'X', TRANSACTION_VERSION)];
  for (const transaction of group.transactions) {
    if (!/^[A-Za-z0-9]{4,9}$/.test(transaction.controlNumber)) {
      throw new X12BuildError('ST02 is four to nine characters');
    }
    const body = transactionBody(transaction.remittance, options);
    segments.push(seg('ST', '835', transaction.controlNumber));
    segments.push(...body);
    segments.push(seg('SE', String(transaction.seCountOverride ?? body.length + 2), transaction.controlNumber));
  }
  segments.push(seg('GE', String(group.transactions.length), String(group.controlNumber)));
  return segments;
}

/** One interchange to segments, envelopes and counts included. */
export function interchangeSegments(interchange: Interchange835, options: WriteOptions = {}): X12Interchange {
  const segments: X12Segment[] = [isaSegment(interchange)];
  for (const group of interchange.groups) {
    segments.push(...groupSegments(group, options));
  }
  segments.push(seg('IEA', String(interchange.groups.length), interchangeControl(interchange.controlNumber)));
  return { delimiters: interchange.delimiters, segments };
}

/** A whole 835 file to its segment document. */
export function documentFor835(file: File835, options: WriteOptions = {}): X12Document {
  return { interchanges: file.interchanges.map((interchange) => interchangeSegments(interchange, options)) };
}
