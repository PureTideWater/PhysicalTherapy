/**
 * One transaction set, segment by segment, into typed loops (PRD section 10, step 5): the header
 * (BPR, TRN, CUR, REF, DTM), 1000A payer (N1, N3, N4, REF, PER), 1000B payee (N1, N3, N4, REF, RDM),
 * 2000 (LX, TS3, TS2), 2100 claims (CLP, CAS, NM1, MIA, MOA, REF, DTM, PER, AMT, QTY), 2110 lines
 * (SVC, DTM, CAS, REF, AMT, QTY, LQ) and PLB, closed by SE. Within a loop the segments may come in any
 * order; the loops come in the structure's order. Required segments, repeats, element values and
 * codes are checked, the claims and the transaction balanced, observed allowed derived per line and
 * reversals linked; anything wrong holds the transaction with its position.
 */
import { type Cents, ZERO_CENTS, addCents, negateCents, subtractCents, sumCents } from '@tp/money';

import { balanceClaim, observedAllowed, patientShare } from './balance';
import { type CodeListProvider } from './code-lists';
import { type EdiError, type Position, controlMismatch, syntaxError, unbalanced } from './errors';
import { SPECS, type SegmentSpec } from './spec';
import { type Segment } from './tokenizer';
import {
  type Address,
  type Adjustment,
  type AmountValue,
  type Claim,
  type ClaimPosition,
  type Contact,
  type DateValue,
  type HeaderNumber,
  type InpatientAdjudication,
  type Name,
  type OutpatientAdjudication,
  type Party,
  type Payment,
  type PlbCategory,
  type PositionedAmount,
  type PositionedQuantity,
  type Procedure,
  type ProviderAdjustment,
  type ProviderSummary,
  type QuantityValue,
  type Reference,
  type Remark,
  type Remittance,
  type ServiceLine,
  type Trace,
  type TransactionPosition,
} from './types';
import { type CheckContext, type Fields, type UnknownCode, checkSegment, flagUnknown, isoDate } from './values';

type Area = 'header' | 'payer' | 'payee' | 'number' | 'claim' | 'line' | 'footer';

/** Where each segment may appear; LX, CLP, SVC and PLB open their loops, N1 the party loops. */
const PLACES: Readonly<Record<string, readonly Area[]>> = {
  BPR: ['header'],
  TRN: ['header'],
  CUR: ['header'],
  REF: ['header', 'payer', 'payee', 'claim', 'line'],
  DTM: ['header', 'claim', 'line'],
  N1: ['header', 'payer'],
  N3: ['payer', 'payee'],
  N4: ['payer', 'payee'],
  PER: ['payer', 'claim'],
  RDM: ['payee'],
  LX: ['payee', 'number', 'claim', 'line'],
  TS3: ['number'],
  TS2: ['number'],
  CLP: ['number', 'claim', 'line'],
  CAS: ['claim', 'line'],
  NM1: ['claim'],
  MIA: ['claim'],
  MOA: ['claim'],
  AMT: ['claim', 'line'],
  QTY: ['claim', 'line'],
  SVC: ['claim', 'line'],
  LQ: ['line'],
  PLB: ['payee', 'number', 'claim', 'line', 'footer'],
};

/** How often a segment may appear in one instance of its loop (absent: no limit the parser enforces). */
const MAX: Readonly<Record<Area, Readonly<Record<string, number>>>> = {
  header: { TRN: 1, CUR: 1, REF: 2, DTM: 1 },
  payer: { N3: 1, N4: 1, REF: 4 },
  payee: { N3: 1, N4: 1, RDM: 1 },
  number: { TS3: 1, TS2: 1 },
  claim: { CAS: 99, 'NM1/QC': 1, 'NM1/IL': 1, 'NM1/74': 1, 'NM1/82': 1, 'NM1/TT': 1, 'NM1/PR': 1, 'NM1/GB': 1, MIA: 1, MOA: 1, REF: 15, DTM: 4, PER: 2, AMT: 13, QTY: 14 },
  line: { DTM: 2, CAS: 99, REF: 24, AMT: 9, QTY: 6, LQ: 99 },
  footer: {},
};

const CLAIM_NAMES = new Set(['QC', 'IL', '74', '82', 'TT', 'PR', 'GB']);
/** Service lines per claim (the 2110 loop repeats up to 999 times). */
const MAX_LINES = 999;

export function plbCategory(code: string): PlbCategory {
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

export interface TransactionContext {
  readonly position: TransactionPosition;
  readonly st: Segment;
  readonly interchangeControlNumber: string;
  readonly groupControlNumber: string;
  readonly senderId: string;
  readonly receiverId: string;
  readonly codeLists: CodeListProvider;
  /** Holds found before the body (a repeated ST02). */
  readonly holds: readonly EdiError[];
}

interface PartyDraft {
  segmentIndex: number;
  entity: 'PR' | 'PE';
  name: string;
  idQualifier: string | null;
  id: string | null;
  addressLines: string[];
  city: Omit<Address, 'lines'> | null;
  references: Reference[];
  contacts: Contact[];
  deliveryMethod: Party['deliveryMethod'];
  sawN3: boolean;
  sawN4: boolean;
  sawTechnicalContact: boolean;
}

interface LineDraft {
  segmentIndex: number;
  procedure: Procedure;
  chargeCents: Cents;
  paidCents: Cents;
  revenueCode: string | null;
  units: string | null;
  originalProcedure: Procedure | null;
  originalUnits: string | null;
  dates: DateValue[];
  adjustments: Adjustment[];
  references: Reference[];
  amounts: AmountValue[];
  quantities: QuantityValue[];
  remarks: Remark[];
}

interface ClaimDraft {
  segmentIndex: number;
  headerNumber: string;
  clp: Fields;
  adjustments: Adjustment[];
  names: Name[];
  inpatient: InpatientAdjudication | null;
  outpatient: OutpatientAdjudication | null;
  references: Reference[];
  dates: DateValue[];
  contacts: Contact[];
  amounts: AmountValue[];
  quantities: QuantityValue[];
  lines: LineDraft[];
  sawPatient: boolean;
}

interface NumberDraft {
  segmentIndex: number;
  number: string;
  summaries: ProviderSummary[];
  claims: number;
}

function procedureOf(components: readonly string[]): Procedure {
  const modifiers = components.slice(2, 6);
  while (modifiers.length > 0 && modifiers[modifiers.length - 1] === '') {
    modifiers.pop();
  }
  const description = components[6] ?? '';
  return { qualifier: components[0] as string, code: components[1] ?? '', modifiers, description: description === '' ? null : description };
}

function positioned(fields: Fields, spec: SegmentSpec): { amounts: PositionedAmount[]; quantities: PositionedQuantity[] } {
  const amounts: PositionedAmount[] = [];
  const quantities: PositionedQuantity[] = [];
  spec.forEach((element, index) => {
    const elementPosition = index + 1;
    const amount = fields.cents(elementPosition);
    const text = fields.text(elementPosition);
    if (amount !== null) {
      amounts.push({ elementPosition, cents: amount });
    } else if (element?.kind === 'decimal' && text !== null) {
      quantities.push({ elementPosition, quantity: text });
    }
  });
  return { amounts, quantities };
}

function remarksOf(fields: Fields, positions: readonly number[]): Remark[] {
  return positions.flatMap((elementPosition) => {
    const code = fields.text(elementPosition);
    return code === null ? [] : [{ segmentIndex: fields.segment.index, elementPosition, qualifier: 'HE', code }];
  });
}

function first<T extends { readonly qualifier: string }>(items: readonly T[], qualifier: string): T | undefined {
  return items.find((item) => item.qualifier === qualifier);
}

/** DTM06 under DTM05 D8 (one date) or RD8 (CCYYMMDD-CCYYMMDD, from not after to), or null when it is not one. */
function rangeOf(format: 'D8' | 'RD8', period: string): [string, string] | null {
  const parts = format === 'RD8' ? period.split('-') : [period, period];
  if (parts.length !== 2) {
    return null;
  }
  const [start, end] = parts as [string, string];
  const from = isoDate(start);
  const to = isoDate(end);
  return from === null || to === null || to < from ? null : [from, to];
}

/** A line's service dates: DTM 472 (a date or an RD8 range), else DTM 150 and 151, else the claim's statement dates. */
function lineDates(dates: readonly DateValue[], statementFrom: string | null, statementTo: string | null): [string | null, string | null] {
  const single = first(dates, '472');
  if (single) {
    return [single.from, single.to];
  }
  const start = first(dates, '150');
  const end = first(dates, '151');
  if (start !== undefined || end !== undefined) {
    const from = start ?? end;
    const to = end ?? start;
    return [(from as DateValue).from, (to as DateValue).to];
  }
  return [statementFrom, statementTo ?? statementFrom];
}

export class TransactionBuilder {
  private area: Area = 'header';
  private readonly holds: EdiError[] = [];
  private readonly flags: UnknownCode[] = [];
  private readonly counts = new Map<string, number>();
  private readonly context: CheckContext;
  private codeDate = '';
  private started = false;
  segmentCount = 1;

  private payment: Payment | null = null;
  private trace: Trace | null = null;
  private currency: string | null = null;
  private readonly references: Reference[] = [];
  private readonly dates: DateValue[] = [];
  private payer: PartyDraft | null = null;
  private payee: PartyDraft | null = null;
  private readonly headerNumbers: HeaderNumber[] = [];
  private number: NumberDraft | null = null;
  private readonly claims: Claim[] = [];
  private claim: ClaimDraft | null = null;
  private line: LineDraft | null = null;
  private readonly plb: ProviderAdjustment[] = [];
  private readonly balanceHolds: EdiError[] = [];

  constructor(private readonly transaction: TransactionContext) {
    const holds = this.holds;
    const flags = this.flags;
    // External code lists are checked on the payment date, known once BPR is read.
    const codeDate = (): string => this.codeDate;
    this.context = {
      codeLists: transaction.codeLists,
      get codeDate() {
        return codeDate();
      },
      sink: { hold: (error) => holds.push(error), flag: (code) => flags.push(code) },
    };
  }

  private hold(error: EdiError): void {
    this.holds.push(error);
  }

  private at(segment: Segment, elementPosition = 0): Position {
    return { segmentIndex: segment.index, segmentId: segment.id, elementPosition };
  }

  /** A required segment `id` is missing where `segment` is (`expected` names it, for N1 with its qualifier). */
  private missing(segment: Segment, id: string, expected = id): void {
    this.hold(syntaxError({ segmentIndex: segment.index, segmentId: id, elementPosition: 0 }, 'missing_segment', { expected, found: segment.id }));
  }

  private check(segment: Segment, key: string): Fields {
    return checkSegment(segment, SPECS[key] as SegmentSpec, this.context);
  }

  /** Counts a segment in its loop instance; false (and a hold) when it repeats too often. */
  private counted(segment: Segment, key: string): boolean {
    const max = MAX[this.area][key];
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    if (max !== undefined && count > max) {
      this.hold(syntaxError(this.at(segment), 'segment_repeats'));
      return false;
    }
    return true;
  }

  private enter(area: Area): void {
    this.area = area;
    this.counts.clear();
  }

  add(segment: Segment): void {
    this.segmentCount += 1;
    const firstSegment = !this.started;
    this.started = true;
    if (firstSegment && segment.id !== 'BPR') {
      this.missing(segment, 'BPR');
    }
    const places = PLACES[segment.id];
    // BPR is the first segment of the transaction set and only there.
    if (places === undefined || !places.includes(this.area) || (segment.id === 'BPR' && !firstSegment)) {
      this.hold(syntaxError(this.at(segment), 'unexpected_segment'));
      return;
    }
    switch (segment.id) {
      case 'N1':
        this.openParty(segment);
        return;
      case 'LX':
        this.openNumber(segment);
        return;
      case 'CLP':
        this.openClaim(segment);
        return;
      case 'SVC':
        this.openLine(segment);
        return;
      case 'PLB':
        this.closeNumber(segment);
        this.enter('footer');
        this.readPlb(this.check(segment, 'footer/PLB'));
        return;
      case 'NM1':
        this.readName(segment);
        return;
      default:
        if (this.counted(segment, segment.id)) {
          this.readSegment(segment, this.check(segment, `${this.area}/${segment.id}`));
        }
    }
  }

  private readSegment(segment: Segment, fields: Fields): void {
    switch (segment.id) {
      case 'BPR':
        this.readPayment(fields);
        return;
      case 'TRN':
        this.trace = { segmentIndex: segment.index, type: fields.raw(1), number: fields.raw(2), originatorId: fields.raw(3), supplemental: fields.text(4) };
        return;
      case 'CUR':
        this.currency = fields.text(2);
        return;
      case 'REF':
        this.references_().push({ segmentIndex: segment.index, qualifier: fields.raw(1), value: fields.raw(2) });
        return;
      case 'DTM':
        this.readDate(fields);
        return;
      case 'N3':
        this.party().sawN3 = true;
        this.party().addressLines.push(...[fields.text(1), fields.text(2)].filter((line): line is string => line !== null));
        return;
      case 'N4':
        this.party().sawN4 = true;
        this.party().city = { city: fields.text(1), state: fields.text(2), postalCode: fields.text(3), country: fields.text(4), countrySubdivision: fields.text(7) };
        return;
      case 'PER':
        this.readContact(fields);
        return;
      case 'RDM':
        this.party().deliveryMethod = { code: fields.raw(1), name: fields.text(2), communication: fields.text(3) };
        return;
      case 'TS3':
      case 'TS2':
        this.readSummary(segment, fields);
        return;
      case 'CAS':
        this.readAdjustments(fields);
        return;
      case 'MIA':
        this.readInpatient(fields);
        return;
      case 'MOA':
        this.readOutpatient(fields);
        return;
      case 'AMT':
        (this.area === 'line' ? (this.line as LineDraft).amounts : (this.claim as ClaimDraft).amounts).push({ segmentIndex: segment.index, qualifier: fields.raw(1), cents: fields.cents(2) ?? ZERO_CENTS });
        return;
      case 'QTY':
        (this.area === 'line' ? (this.line as LineDraft).quantities : (this.claim as ClaimDraft).quantities).push({ segmentIndex: segment.index, qualifier: fields.raw(1), quantity: fields.raw(2) });
        return;
      default:
        this.readRemark(fields);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Header

  private readPayment(fields: Fields): void {
    const creditDebit = fields.raw(3);
    if (creditDebit !== '' && creditDebit !== 'C' && creditDebit !== 'D') {
      this.hold(syntaxError(this.at(fields.segment, 3), 'invalid_code'));
    }
    const amountCents = fields.cents(2) ?? ZERO_CENTS;
    const date = fields.date(16) ?? '';
    this.codeDate = date;
    this.payment = {
      segmentIndex: fields.segment.index,
      handling: fields.raw(1),
      amountCents,
      creditDebit,
      method: fields.raw(4),
      format: fields.text(5),
      senderDfi: { qualifier: fields.text(6), id: fields.text(7), accountQualifier: fields.text(8), account: fields.text(9) },
      originatingCompanyId: fields.text(10),
      originatingCompanySupplementalCode: fields.text(11),
      receiverDfi: { qualifier: fields.text(12), id: fields.text(13), accountQualifier: fields.text(14), account: fields.text(15) },
      date,
      paymentCents: creditDebit === 'D' ? negateCents(amountCents) : amountCents,
    };
  }

  /** DTM: DTM02, or DTM05 (D8 or RD8) with DTM06 (the 5010 structure uses DTM02; RD8 is tolerated, test matrix PAR-23). */
  private readDate(fields: Fields): void {
    const segment = fields.segment;
    const date = fields.date(2);
    const format = fields.text(5);
    const period = fields.text(6) ?? '';
    let range: [string, string] | null = date === null ? null : [date, date];
    if (format !== null) {
      const periodRange = format === 'D8' || format === 'RD8' ? rangeOf(format, period) : null;
      if (format !== 'D8' && format !== 'RD8') {
        this.hold(syntaxError(this.at(segment, 5), 'invalid_code'));
      } else if (periodRange === null) {
        this.hold(syntaxError(this.at(segment, 6), 'invalid_date'));
      } else {
        range = periodRange;
      }
    } else if (fields.raw(2) === '') {
      this.hold(syntaxError(this.at(segment, 2), 'missing_element'));
    }
    if (range === null) {
      return;
    }
    const value: DateValue = { segmentIndex: segment.index, qualifier: fields.raw(1), date, periodFormat: format, period: format === null ? null : period, from: range[0], to: range[1] };
    if (this.area === 'header') {
      this.dates.push(value);
    } else {
      (this.area === 'line' ? (this.line as LineDraft).dates : (this.claim as ClaimDraft).dates).push(value);
    }
  }

  /** Where a REF goes: REF appears in the header, the party loops, a claim or a line only. */
  private references_(): Reference[] {
    if (this.area === 'header') {
      return this.references;
    }
    if (this.area === 'payer' || this.area === 'payee') {
      return this.party().references;
    }
    return this.area === 'claim' ? (this.claim as ClaimDraft).references : (this.line as LineDraft).references;
  }

  // ---------------------------------------------------------------------------------------------
  // 1000A and 1000B

  private party(): PartyDraft {
    return (this.area === 'payer' ? this.payer : this.payee) as PartyDraft;
  }

  private openParty(segment: Segment): void {
    const entity = segment.elements[0] ?? '';
    if (entity !== 'PR' && entity !== 'PE') {
      this.hold(syntaxError(this.at(segment), 'unexpected_segment'));
      return;
    }
    if (entity === 'PR' && this.area === 'payer') {
      this.hold(syntaxError(this.at(segment), 'segment_repeats'));
      return;
    }
    if (this.area === 'header') {
      if (this.trace === null) {
        this.missing(segment, 'TRN');
      }
      if (entity === 'PE') {
        this.missing(segment, 'N1', 'N1 PR');
      }
    } else {
      this.closePayer(segment);
    }
    const fields = this.check(segment, entity === 'PR' ? 'payer/N1' : 'payee/N1');
    const draft: PartyDraft = {
      segmentIndex: segment.index,
      entity,
      name: fields.raw(2),
      idQualifier: fields.text(3),
      id: fields.text(4),
      addressLines: [],
      city: null,
      references: [],
      contacts: [],
      deliveryMethod: null,
      sawN3: false,
      sawN4: false,
      sawTechnicalContact: false,
    };
    if (entity === 'PR') {
      this.payer = draft;
      this.enter('payer');
    } else {
      this.payee = draft;
      this.enter('payee');
    }
  }

  private closePayer(at: Segment): void {
    const payer = this.payer as PartyDraft;
    for (const [seen, id] of [
      [payer.sawN3, 'N3'],
      [payer.sawN4, 'N4'],
      [payer.sawTechnicalContact, 'PER'],
    ] as const) {
      if (!seen) {
        this.missing(at, id);
      }
    }
  }

  private readContact(fields: Fields): void {
    const contact: Contact = {
      segmentIndex: fields.segment.index,
      function: fields.raw(1),
      name: fields.text(2),
      communications: [3, 5, 7].flatMap((position) => {
        const qualifier = fields.text(position);
        return qualifier === null ? [] : [{ qualifier, number: fields.raw(position + 1) }];
      }),
    };
    if (this.area === 'payer') {
      this.party().contacts.push(contact);
      this.party().sawTechnicalContact ||= contact.function === 'BL';
    } else {
      (this.claim as ClaimDraft).contacts.push(contact);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 2000, 2100 and 2110

  private openNumber(segment: Segment): void {
    this.closeNumber(segment);
    this.enter('number');
    const fields = this.check(segment, 'number/LX');
    this.number = { segmentIndex: segment.index, number: fields.raw(1), summaries: [], claims: 0 };
  }

  private readSummary(segment: Segment, fields: Fields): void {
    const values = positioned(fields, SPECS[`number/${segment.id}`] as SegmentSpec);
    const ts3 = segment.id === 'TS3';
    (this.number as NumberDraft).summaries.push({
      segmentIndex: segment.index,
      segmentId: ts3 ? 'TS3' : 'TS2',
      providerId: ts3 ? fields.text(1) : null,
      facilityCode: ts3 ? fields.text(2) : null,
      fiscalPeriodDate: ts3 ? fields.date(3) : null,
      ...values,
    });
  }

  private closeNumber(at: Segment): void {
    this.closeClaim(at);
    const number = this.number;
    if (number !== null) {
      if (number.claims === 0) {
        this.missing(at, 'CLP');
      }
      this.headerNumbers.push({ segmentIndex: number.segmentIndex, number: number.number, summaries: number.summaries });
      this.number = null;
    }
  }

  private openClaim(segment: Segment): void {
    this.closeClaim(segment);
    const number = this.number as NumberDraft;
    number.claims += 1;
    this.enter('claim');
    const clp = this.check(segment, 'claim/CLP');
    this.claim = {
      segmentIndex: segment.index,
      headerNumber: number.number,
      clp,
      adjustments: [],
      names: [],
      inpatient: null,
      outpatient: null,
      references: [],
      dates: [],
      contacts: [],
      amounts: [],
      quantities: [],
      lines: [],
      sawPatient: false,
    };
  }

  private readName(segment: Segment): void {
    const entity = segment.elements[0] ?? '';
    if (!CLAIM_NAMES.has(entity)) {
      this.hold(syntaxError(this.at(segment), 'unexpected_segment'));
      return;
    }
    if (!this.counted(segment, `NM1/${entity}`)) {
      return;
    }
    const fields = this.check(segment, `claim/NM1/${entity}`);
    const claim = this.claim as ClaimDraft;
    claim.sawPatient ||= entity === 'QC';
    claim.names.push({
      segmentIndex: segment.index,
      entity,
      entityType: fields.raw(2),
      lastOrOrganization: fields.text(3),
      first: fields.text(4),
      middle: fields.text(5),
      suffix: fields.text(7),
      idQualifier: fields.text(8),
      id: fields.text(9),
    });
  }

  private readInpatient(fields: Fields): void {
    (this.claim as ClaimDraft).inpatient = { segmentIndex: fields.segment.index, ...positioned(fields, SPECS['claim/MIA'] as SegmentSpec), remarks: remarksOf(fields, [5, 20, 21, 22, 23]) };
  }

  private readOutpatient(fields: Fields): void {
    (this.claim as ClaimDraft).outpatient = {
      segmentIndex: fields.segment.index,
      reimbursementRate: fields.text(1),
      hcpcsPayableCents: fields.cents(2),
      remarks: remarksOf(fields, [3, 4, 5, 6, 7]),
      esrdPaymentCents: fields.cents(8),
      nonpayableProfessionalComponentCents: fields.cents(9),
    };
  }

  private readAdjustments(fields: Fields): void {
    const segment = fields.segment;
    const target = this.area === 'line' ? (this.line as LineDraft).adjustments : (this.claim as ClaimDraft).adjustments;
    for (let reasonPosition = 2; reasonPosition <= 17; reasonPosition += 3) {
      const reason = fields.text(reasonPosition);
      const amountText = fields.text(reasonPosition + 1);
      const quantity = fields.text(reasonPosition + 2);
      if (reason === null) {
        if (reasonPosition > 2 && (amountText !== null || quantity !== null)) {
          this.hold(syntaxError(this.at(segment, reasonPosition), 'missing_element'));
        }
        continue;
      }
      if (amountText === null) {
        if (reasonPosition > 2) {
          this.hold(syntaxError(this.at(segment, reasonPosition + 1), 'missing_element'));
        }
        continue;
      }
      target.push({
        segmentIndex: segment.index,
        elementPosition: reasonPosition,
        position: target.length + 1,
        group: fields.raw(1),
        reason,
        cents: fields.cents(reasonPosition + 1) ?? ZERO_CENTS,
        quantity,
      });
    }
  }

  private openLine(segment: Segment): void {
    this.closeLine();
    if ((this.claim as ClaimDraft).lines.length >= MAX_LINES) {
      this.hold(syntaxError(this.at(segment), 'segment_repeats'));
    }
    this.enter('line');
    const fields = this.check(segment, 'line/SVC');
    const original = fields.text(6);
    this.line = {
      segmentIndex: segment.index,
      procedure: procedureOf(fields.components(1)),
      chargeCents: fields.cents(2) ?? ZERO_CENTS,
      paidCents: fields.cents(3) ?? ZERO_CENTS,
      revenueCode: fields.text(4),
      units: fields.text(5),
      originalProcedure: original === null ? null : procedureOf(fields.components(6)),
      originalUnits: fields.text(7),
      dates: [],
      adjustments: [],
      references: [],
      amounts: [],
      quantities: [],
      remarks: [],
    };
  }

  private readRemark(fields: Fields): void {
    const qualifier = fields.raw(1);
    const code = fields.raw(2);
    if (qualifier === 'HE' && code !== '') {
      flagUnknown(this.context, fields.segment, 'rarc', code, 2);
    }
    (this.line as LineDraft).remarks.push({ segmentIndex: fields.segment.index, elementPosition: 2, qualifier, code });
  }

  private closeLine(): void {
    if (this.line !== null) {
      (this.claim as ClaimDraft).lines.push(this.line);
      this.line = null;
    }
  }

  private closeClaim(at: Segment): void {
    this.closeLine();
    const draft = this.claim;
    if (draft === null) {
      return;
    }
    this.claim = null;
    if (!draft.sawPatient) {
      this.missing(at, 'NM1');
    }
    this.claims.push(this.finishClaim(draft));
  }

  private finishClaim(draft: ClaimDraft): Claim {
    const clp = draft.clp;
    const statementFrom = first(draft.dates, '232')?.from ?? null;
    const statementTo = first(draft.dates, '233')?.to ?? null;
    const lineFigures = draft.lines.map((line) => ({ ...line, lineAllowedCents: first(line.amounts, 'B6')?.cents ?? null }));
    const figures = { chargeCents: clp.cents(3) ?? ZERO_CENTS, paidCents: clp.cents(4) ?? ZERO_CENTS, adjustments: draft.adjustments, lines: lineFigures };
    const balance = balanceClaim(figures);
    const observed = observedAllowed(figures);
    const index = this.claims.length;
    const lines = lineFigures.map((line, position): ServiceLine => {
      const [serviceFrom, serviceTo] = lineDates(line.dates, statementFrom, statementTo);
      return {
        lineNo: position + 1,
        segmentIndex: line.segmentIndex,
        procedure: line.procedure,
        chargeCents: line.chargeCents,
        paidCents: line.paidCents,
        revenueCode: line.revenueCode,
        units: line.units,
        originalProcedure: line.originalProcedure,
        originalUnits: line.originalUnits,
        dates: line.dates,
        adjustments: line.adjustments,
        references: line.references,
        amounts: line.amounts,
        quantities: line.quantities,
        remarks: line.remarks,
        serviceFrom,
        serviceTo,
        lineAllowedCents: line.lineAllowedCents,
        patientShareCents: patientShare(line.adjustments),
        observedAllowed: observed[position] as ServiceLine['observedAllowed'],
        differenceCents: balance.lineDifferences[position] ?? null,
      };
    });
    const lineDays = lines.flatMap((line) => [line.serviceFrom, line.serviceTo]).filter((day): day is string => day !== null).sort();
    const at = (elementPosition: number): Position => ({ segmentIndex: draft.segmentIndex, segmentId: 'CLP', elementPosition });
    if (balance.claimDifferenceCents !== 0n) {
      this.balanceHolds.push(unbalanced(at(4), 'claim', balance.claimDifferenceCents));
    }
    if (balance.lineChargeDifferenceCents !== null && balance.lineChargeDifferenceCents !== 0n) {
      this.balanceHolds.push(unbalanced(at(3), 'claim_lines', balance.lineChargeDifferenceCents));
    }
    lines.forEach((line) => {
      if (line.differenceCents !== null && line.differenceCents !== 0n) {
        this.balanceHolds.push(unbalanced({ segmentIndex: line.segmentIndex, segmentId: 'SVC', elementPosition: 3 }, 'line', line.differenceCents));
      }
    });
    const status = clp.raw(2);
    const payerClaimControlNumber = clp.raw(7);
    const patientControlNumber = clp.raw(1);
    const where = (claim: number): ClaimPosition => ({ ...this.transaction.position, claim });
    const reversed = status === '22' ? this.claims.findIndex((claim) => claim.status !== '22' && claim.payerClaimControlNumber === payerClaimControlNumber) : -1;
    const original = first(draft.references, 'F8')?.value ?? null;
    const previous = this.claims[index - 1];
    const follows = previous !== undefined && previous.status === '22' && previous.patientControlNumber === patientControlNumber ? previous : null;
    const corrects = status === '22' ? null : (original ?? follows?.payerClaimControlNumber ?? null);
    const reversal = corrects === null ? -1 : this.claims.findIndex((claim) => claim.status === '22' && claim.payerClaimControlNumber === corrects);
    return {
      index,
      segmentIndex: draft.segmentIndex,
      headerNumber: draft.headerNumber,
      patientControlNumber,
      status,
      chargeCents: figures.chargeCents,
      paidCents: figures.paidCents,
      patientResponsibilityCents: clp.cents(5),
      filingIndicator: clp.raw(6),
      payerClaimControlNumber,
      facilityCode: clp.text(8),
      frequencyCode: clp.text(9),
      drgCode: clp.text(11),
      drgWeight: clp.text(12),
      dischargeFraction: clp.text(13),
      adjustments: draft.adjustments,
      names: draft.names,
      inpatient: draft.inpatient,
      outpatient: draft.outpatient,
      references: draft.references,
      dates: draft.dates,
      contacts: draft.contacts,
      amounts: draft.amounts,
      quantities: draft.quantities,
      lines,
      statementFrom,
      statementTo,
      serviceFrom: statementFrom ?? lineDays[0] ?? null,
      serviceTo: statementTo ?? lineDays[lineDays.length - 1] ?? null,
      planRef: first(draft.references, 'CE')?.value ?? null,
      allowedCents: first(draft.amounts, 'AU')?.cents ?? null,
      patientShareCents: addCents(patientShare(draft.adjustments), sumCents(lines.map((line) => line.patientShareCents))),
      balance: { claimDifferenceCents: balance.claimDifferenceCents, lineChargeDifferenceCents: balance.lineChargeDifferenceCents, balanced: balance.balanced },
      reversal: status === '22' ? { payerClaimControlNumber, reversed: reversed < 0 ? null : where(reversed) } : null,
      correction: corrects === null ? null : { payerClaimControlNumber: corrects, reversal: reversal < 0 ? null : where(reversal) },
    };
  }

  // ---------------------------------------------------------------------------------------------
  // PLB and SE

  private readPlb(fields: Fields): void {
    const segment = fields.segment;
    for (let position = 3; position <= 13; position += 2) {
      const code = fields.component(position, 1);
      const amount = fields.text(position + 1);
      if (code === null) {
        if (position > 3 && amount !== null) {
          this.hold(syntaxError(this.at(segment, position), 'missing_element'));
        }
        continue;
      }
      if (amount === null) {
        if (position > 3) {
          this.hold(syntaxError(this.at(segment, position + 1), 'missing_element'));
        }
        continue;
      }
      this.plb.push({
        segmentIndex: segment.index,
        elementPosition: position,
        providerId: fields.raw(1),
        fiscalPeriodDate: fields.date(2) ?? '',
        code,
        reference: fields.component(position, 2),
        cents: fields.cents(position + 1) ?? ZERO_CENTS,
        category: plbCategory(code),
        counted: code !== 'FB',
      });
    }
  }

  /** Closes the transaction set at SE: checks what must be there, the trailer and every balance. */
  finish(se: Segment): Remittance {
    this.segmentCount += 1;
    if (!this.started) {
      this.missing(se, 'BPR');
    }
    if (this.area === 'header') {
      if (this.trace === null) {
        this.missing(se, 'TRN');
      }
      this.missing(se, 'N1', 'N1 PR');
    }
    if (this.area === 'payer') {
      this.closePayer(se);
    }
    if (this.area === 'header' || this.area === 'payer') {
      this.missing(se, 'N1', 'N1 PE');
    }
    this.closeNumber(se);
    const trailer = checkSegment(se, SPECS.SE as SegmentSpec, this.context);
    // The envelope refuses an ST without ST02 before the transaction set begins.
    const st02 = this.transaction.st.elements[1] as string;
    const control: EdiError[] = [...this.transaction.holds];
    const counted = String(this.segmentCount);
    if (/^\d+$/.test(trailer.raw(1)) && String(parseInt(trailer.raw(1), 10)) !== counted) {
      control.push(controlMismatch(this.at(se, 1), 'the segment count', counted, trailer.raw(1)));
    }
    if (trailer.raw(2) !== st02) {
      control.push(controlMismatch(this.at(se, 2), 'the control number', st02, trailer.raw(2)));
    }
    const claimsPaidCents = sumCents(this.claims.map((claim) => claim.paidCents));
    const plbTotalCents = sumCents(this.plb.map((item) => item.cents));
    const paymentCents = this.payment?.paymentCents ?? ZERO_CENTS;
    const differenceCents = subtractCents(subtractCents(claimsPaidCents, plbTotalCents), paymentCents);
    const syntax = this.holds.filter((error) => error.code === 'EDI_SYNTAX');
    const balanceHolds: EdiError[] = [];
    if (syntax.length === 0) {
      if (differenceCents !== 0n && this.payment !== null) {
        balanceHolds.push(unbalanced({ segmentIndex: this.payment.segmentIndex, segmentId: 'BPR', elementPosition: 2 }, 'transaction', differenceCents));
      }
    }
    const heldReasons = [...balanceHolds, ...control, ...this.holds, ...(syntax.length === 0 ? this.balanceHolds : [])];
    const payer = this.payer === null ? null : partyOf(this.payer);
    const payee = this.payee === null ? null : partyOf(this.payee);
    const payment = this.payment;
    const trace = this.trace;
    const payerIdentifiers: (readonly [string, string])[] = [];
    if (payer !== null) {
      if (payer.idQualifier !== null && payer.id !== null) {
        payerIdentifiers.push([payer.idQualifier, payer.id]);
      }
      payerIdentifiers.push(...payer.references.map((reference) => [reference.qualifier, reference.value] as const));
    }
    if (trace !== null) {
      payerIdentifiers.push(['TRN03', trace.originatorId]);
    }
    return {
      position: this.transaction.position,
      segmentIndex: this.transaction.st.index,
      controlNumber: st02,
      interchangeControlNumber: this.transaction.interchangeControlNumber,
      groupControlNumber: this.transaction.groupControlNumber,
      senderId: this.transaction.senderId,
      receiverId: this.transaction.receiverId,
      payment,
      trace,
      currency: this.currency,
      references: this.references,
      productionDate: first(this.dates, '405')?.from ?? null,
      dates: this.dates,
      payer,
      payee,
      headerNumbers: this.headerNumbers,
      claims: this.claims,
      providerAdjustments: this.plb,
      trailer: { segmentIndex: se.index, segmentCount: trailer.raw(1), controlNumber: trailer.raw(2) },
      segmentCount: this.segmentCount,
      counts: {
        claims: this.claims.length,
        lines: this.claims.reduce((total, claim) => total + claim.lines.length, 0),
        reversals: this.claims.filter((claim) => claim.status === '22').length,
        plbItems: this.plb.length,
      },
      balance: {
        claimsPaidCents,
        plbTotalCents,
        paymentCents,
        differenceCents,
        balanced: differenceCents === 0n,
        claimsBalanced: this.claims.every((claim) => claim.balance.balanced),
      },
      payerIdentifiers,
      dedupKey:
        payment !== null && trace !== null && payee !== null && payee.id !== null
          ? { senderId: this.transaction.senderId, payeeId: payee.id, isa13: this.transaction.interchangeControlNumber, trn02: trace.number, bpr02Cents: payment.amountCents }
          : null,
      loadable: heldReasons.length === 0,
      heldReasons,
      unknownCodes: this.flags,
    };
  }
}

function partyOf(draft: PartyDraft): Party {
  const hasAddress = draft.addressLines.length > 0 || draft.city !== null;
  return {
    segmentIndex: draft.segmentIndex,
    entity: draft.entity,
    name: draft.name,
    idQualifier: draft.idQualifier,
    id: draft.id,
    address: hasAddress ? { lines: draft.addressLines, city: null, state: null, postalCode: null, country: null, countrySubdivision: null, ...draft.city } : null,
    references: draft.references,
    contacts: draft.contacts,
    deliveryMethod: draft.deliveryMethod,
  };
}
