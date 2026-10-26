/**
 * Invented parties and balanced-by-construction builders for the 835 writer. Every identifier is
 * made up: NPIs start with 99 (real NPIs start with 1 or 2), payer and tax identifiers carry SYN, and
 * names say SYNTH. Amounts are bigint cents; a line's paid amount is its charge minus its
 * adjustments and a claim's paid amount its charge minus every adjustment in it, so a file balances
 * unless a case writes an amount on purpose.
 */
import { type Cents, ZERO_CENTS, addCents, cents, negateCents, subtractCents, sumCents } from '@tp/money';

import { type CalendarDate } from '../core/dates';
import { Random } from '../core/random';
import { DEFAULT_DELIMITERS, type Delimiters, X12BuildError } from './segments';
import {
  type Amount,
  type CasSegment,
  type Claim,
  type ClaimStatusCode,
  type File835,
  type Interchange835,
  type LineDates,
  type Party,
  type Payee,
  type Payer,
  type Procedure,
  type Ref,
  type Remark,
  type Remittance835,
  type ServiceLine,
} from './model';

/** Luhn check digit over the NPI with its 80840 prefix. */
export function npiCheckDigit(nine: string): string {
  const digits = `80840${nine}`.split('').map((digit) => Number.parseInt(digit, 10));
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const fromRight = digits.length - index;
    let value = digits[index] ?? 0;
    if (fromRight % 2 === 1) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }
    sum += value;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * A ten-digit NPI-shaped identifier starting 99, which no real NPI does (real NPIs start with 1 or 2),
 * with a valid check digit: the one rule every generator draws a synthetic NPI by, SynthWorld.npi()'s
 * and the evaluation sets' boilerplate alike, so none can be a real provider's number.
 */
export function syntheticNpi(random: Random): string {
  const nine = `99${random.digits(7)}`;
  return `${nine}${npiCheckDigit(nine)}`;
}

/**
 * A taxpayer identification number written as an EIN (NN-NNNNNNN) under the prefix 00, which the IRS
 * never assigns, so it cannot be a real business's number. For text that states a TIN the way a
 * contract does; the 835's TJ reference keeps its own SynthWorld form.
 */
export function syntheticTin(random: Random): string {
  return `00-${random.digits(7)}`;
}

export class SynthWorld {
  readonly random: Random;
  private counter = 0;

  constructor(seed: string) {
    this.random = new Random(seed);
  }

  /** A ten-digit NPI-shaped identifier starting 99, which no real NPI does, with a valid check digit. */
  npi(): string {
    return syntheticNpi(this.random);
  }

  /** A short sequence-numbered identifier, unique within this world. */
  sequence(prefix: string, width = 4): string {
    this.counter += 1;
    return `${prefix}${String(this.counter).padStart(width, '0')}`;
  }

  payer(key: string): Payer {
    return {
      name: `SYNTHETIC PAYER ${key}`,
      address: { line1: `${String(this.random.int(100, 999))} SYNTHETIC PAYER WAY`, city: 'SYNTHVILLE', state: 'NC', postalCode: '00013' },
      refs: [{ qualifier: '2U', value: `SYNPAYER${key}` }],
      technicalContacts: [{ name: 'SYNTHETIC EDI HELP DESK', numbers: [{ qualifier: 'TE', value: `555555${this.random.digits(4)}` }] }],
    };
  }

  payee(key: string, npi = this.npi()): Payee {
    return {
      name: `SYNTHETIC THERAPY GROUP ${key}`,
      id: { qualifier: 'XX', value: npi },
      address: { line1: `${String(this.random.int(100, 999))} SYNTHETIC CLINIC ROAD`, city: 'SYNTHTOWN', state: 'NC', postalCode: '00011' },
      refs: [{ qualifier: 'TJ', value: `99${this.random.digits(7)}` }],
    };
  }

  patient(): Party {
    const id = this.random.alphanumeric(6);
    return { entity: '1', last: `SYNTHLAST${id}`, first: `SYNTHFIRST${this.random.alphanumeric(3)}`, id: { qualifier: 'MI', value: `SYNMBR${this.random.digits(8)}` } };
  }

  renderingProvider(): Party {
    return { entity: '1', last: `SYNTHPT${this.random.alphanumeric(4)}`, first: 'SYNTHETIC', id: { qualifier: 'XX', value: this.npi() } };
  }

  /** TRN03: a ten-character originating company identifier. */
  originatorId(key: string): string {
    return `1SYN${key.padStart(6, '0').slice(-6)}`;
  }
}

export interface LineSpec {
  readonly code: string;
  readonly modifiers?: readonly string[];
  readonly qualifier?: Procedure['qualifier'];
  readonly units?: string;
  readonly charge: Cents;
  /** The allowed amount; the contractual CO-45 adjustment is charge minus allowed. Defaults to the charge. */
  readonly allowed?: Cents;
  /** Patient responsibility by reason (PR-1 deductible, PR-2 coinsurance, PR-3 copay in the synthetic code list). */
  readonly patientShare?: readonly { readonly reason: string; readonly amount: Cents }[];
  /** Further CAS segments, written after the contractual and patient-share ones. */
  readonly extraAdjustments?: readonly CasSegment[];
  /** Replaces every computed adjustment (a denial, or a line with no CAS at all). */
  readonly adjustments?: readonly CasSegment[];
  /** Overrides the paid amount (an unbalanced line, or a line under claim-level CAS only). */
  readonly paid?: Cents;
  readonly dates: LineDates;
  /** Writes AMT B6 with the allowed amount. */
  readonly b6?: boolean | Cents;
  readonly revenueCode?: string;
  readonly originalProcedure?: Procedure;
  readonly originalUnits?: string;
  readonly refs?: readonly Ref[];
  readonly amounts?: readonly Amount[];
  readonly quantities?: ServiceLine['quantities'];
  readonly remarks?: readonly Remark[];
}

export function casTotal(segments: readonly CasSegment[]): Cents {
  return sumCents(segments.flatMap((segment) => segment.items.map((item) => item.amount)));
}

export function patientShareTotal(segments: readonly CasSegment[]): Cents {
  return sumCents(segments.filter((segment) => segment.group === 'PR').flatMap((segment) => segment.items.map((item) => item.amount)));
}

/** A service line whose paid amount is its charge minus its adjustments. */
export function line(spec: LineSpec): ServiceLine {
  const allowed = spec.allowed ?? spec.charge;
  let adjustments: CasSegment[];
  if (spec.adjustments) {
    adjustments = [...spec.adjustments];
  } else {
    adjustments = [];
    const contractual = subtractCents(spec.charge, allowed);
    if (contractual !== 0n) {
      adjustments.push({ group: 'CO', items: [{ reason: '45', amount: contractual }] });
    }
    const share = (spec.patientShare ?? []).filter((item) => item.amount !== 0n);
    if (share.length > 0) {
      adjustments.push({ group: 'PR', items: share.map((item) => ({ reason: item.reason, amount: item.amount })) });
    }
    adjustments.push(...(spec.extraAdjustments ?? []));
  }
  const paid = spec.paid ?? subtractCents(spec.charge, casTotal(adjustments));
  const amounts: Amount[] = [];
  if (spec.b6 !== undefined && spec.b6 !== false) {
    amounts.push({ qualifier: 'B6', amount: spec.b6 === true ? allowed : spec.b6 });
  }
  amounts.push(...(spec.amounts ?? []));
  return {
    procedure: { qualifier: spec.qualifier ?? 'HC', code: spec.code, modifiers: spec.modifiers ?? [] },
    charge: spec.charge,
    paid,
    revenueCode: spec.revenueCode,
    units: spec.units,
    originalProcedure: spec.originalProcedure,
    originalUnits: spec.originalUnits,
    dates: spec.dates,
    adjustments,
    refs: spec.refs,
    amounts,
    quantities: spec.quantities,
    remarks: spec.remarks,
  };
}

export interface ClaimSpec {
  readonly patientControlNumber: string;
  readonly payerClaimControlNumber: string;
  readonly status?: ClaimStatusCode;
  readonly filingIndicator?: string;
  readonly patient: Party;
  readonly insured?: Party;
  readonly correctedPatient?: Party;
  readonly renderingProvider?: Party;
  readonly lines: readonly ServiceLine[];
  /** Claim-level CAS. */
  readonly adjustments?: readonly CasSegment[];
  /** Required when the claim has no lines. */
  readonly charge?: Cents;
  /** Overrides the paid amount (an unbalanced claim). */
  readonly paid?: Cents;
  readonly facilityCode?: string;
  readonly frequencyCode?: string;
  readonly refs?: readonly Ref[];
  readonly renderingRefs?: readonly Ref[];
  readonly receivedDate?: CalendarDate;
  readonly statementFrom?: CalendarDate;
  readonly statementTo?: CalendarDate;
  readonly amounts?: readonly Amount[];
  /** Writes AMT AU with the claim's allowed amount (paid plus patient share). */
  readonly au?: boolean;
  readonly inpatient?: Claim['inpatient'];
  readonly outpatient?: Claim['outpatient'];
  readonly contacts?: Claim['contacts'];
  readonly quantities?: Claim['quantities'];
  readonly drgCode?: string;
  readonly drgWeight?: string;
}

/** A claim whose charge is its lines' charges and whose paid amount is the charge minus every adjustment. */
export function claim(spec: ClaimSpec): Claim {
  const adjustments = [...(spec.adjustments ?? [])];
  const lineCharges = sumCents(spec.lines.map((serviceLine) => serviceLine.charge));
  const charge = spec.charge ?? (spec.lines.length > 0 ? lineCharges : undefined);
  if (charge === undefined) {
    throw new X12BuildError('a claim without lines needs its charge');
  }
  const lineAdjustments = spec.lines.flatMap((serviceLine) => serviceLine.adjustments);
  const paid = spec.paid ?? subtractCents(subtractCents(charge, casTotal(adjustments)), casTotal(lineAdjustments));
  const patientResponsibility = addCents(patientShareTotal(adjustments), patientShareTotal(lineAdjustments));
  const amounts: Amount[] = [];
  if (spec.au === true) {
    amounts.push({ qualifier: 'AU', amount: addCents(paid, patientResponsibility) });
  }
  amounts.push(...(spec.amounts ?? []));
  return {
    patientControlNumber: spec.patientControlNumber,
    status: spec.status ?? '1',
    charge,
    paid,
    patientResponsibility,
    filingIndicator: spec.filingIndicator ?? '12',
    payerClaimControlNumber: spec.payerClaimControlNumber,
    facilityCode: spec.facilityCode ?? '11',
    frequencyCode: spec.frequencyCode ?? '1',
    drgCode: spec.drgCode,
    drgWeight: spec.drgWeight,
    adjustments,
    patient: spec.patient,
    insured: spec.insured,
    correctedPatient: spec.correctedPatient,
    renderingProvider: spec.renderingProvider,
    inpatient: spec.inpatient,
    outpatient: spec.outpatient,
    refs: spec.refs,
    renderingRefs: spec.renderingRefs,
    statementFrom: spec.statementFrom,
    statementTo: spec.statementTo,
    receivedDate: spec.receivedDate,
    contacts: spec.contacts,
    amounts,
    quantities: spec.quantities,
    lines: spec.lines,
  };
}

function negateCas(segments: readonly CasSegment[]): CasSegment[] {
  return segments.map((segment) => ({ group: segment.group, items: segment.items.map((item) => ({ ...item, amount: negateCents(item.amount) })) }));
}

function negateAmounts(amounts: readonly Amount[] | undefined): Amount[] | undefined {
  return amounts?.map((amount) => ({ qualifier: amount.qualifier, amount: negateCents(amount.amount) }));
}

/**
 * The reversal of a claim (CLP02 22): every amount negated, the same patient and payer claim control
 * numbers, units as originally paid.
 */
export function reversalOf(original: Claim): Claim {
  return {
    ...original,
    status: '22',
    charge: negateCents(original.charge),
    paid: negateCents(original.paid),
    patientResponsibility: original.patientResponsibility === undefined ? undefined : negateCents(original.patientResponsibility),
    frequencyCode: '8',
    adjustments: negateCas(original.adjustments),
    amounts: negateAmounts(original.amounts),
    lines: original.lines.map((serviceLine) => ({
      ...serviceLine,
      charge: negateCents(serviceLine.charge),
      paid: negateCents(serviceLine.paid),
      adjustments: negateCas(serviceLine.adjustments),
      amounts: negateAmounts(serviceLine.amounts),
    })),
  };
}

export interface RemittanceSpec {
  readonly payer: Payer;
  readonly payee: Payee;
  readonly claims: readonly Claim[];
  /** Claims per LX header number; defaults to one LX holding every claim. */
  readonly claimGroups?: Remittance835['claimGroups'];
  readonly providerAdjustments?: Remittance835['providerAdjustments'];
  readonly method?: Remittance835['payment']['method'];
  readonly handling?: Remittance835['payment']['handling'];
  /** BPR03: D when the net is taken from the provider (BPR02 then carries its magnitude). */
  readonly creditDebit?: 'C' | 'D';
  readonly paymentDate: CalendarDate;
  readonly trace: string;
  readonly originatorId: string;
  /** Overrides BPR02 (an unbalanced transaction). */
  readonly amount?: Cents;
  readonly productionDate?: CalendarDate;
  readonly currency?: string;
  readonly receiverId?: string;
}

/** A remittance whose BPR02 is derived (claims paid minus provider adjustments) unless given. */
export function remittance(spec: RemittanceSpec, world: SynthWorld): Remittance835 {
  const method = spec.method ?? 'ACH';
  const claimsPaid = sumCents(spec.claims.map((item) => item.paid));
  const adjustments = sumCents((spec.providerAdjustments ?? []).flatMap((plb) => plb.items.map((item) => item.amount)));
  const net = spec.amount ?? subtractCents(claimsPaid, adjustments);
  const handling = spec.handling ?? (method === 'NON' || net === ZERO_CENTS ? 'H' : method === 'ACH' ? 'C' : 'I');
  const electronic = method === 'ACH' || method === 'FWT' || method === 'BOP';
  return {
    payment: {
      handling,
      amount: spec.amount,
      creditDebit: spec.creditDebit ?? 'C',
      method,
      format: method === 'ACH' ? 'CCP' : undefined,
      payerAccount: electronic ? { dfiQualifier: '01', dfiNumber: `99${world.random.digits(7)}`, accountQualifier: 'DA', accountNumber: `SYNACCT${world.random.digits(6)}` } : undefined,
      originatingCompanyId: electronic ? spec.originatorId : undefined,
      payeeAccount: electronic ? { dfiQualifier: '01', dfiNumber: `99${world.random.digits(7)}`, accountQualifier: 'DA', accountNumber: `SYNACCT${world.random.digits(6)}` } : undefined,
      date: spec.paymentDate,
    },
    trace: { number: spec.trace, originatorId: spec.originatorId },
    currency: spec.currency,
    receiverId: spec.receiverId,
    productionDate: spec.productionDate,
    payer: spec.payer,
    payee: spec.payee,
    claimGroups: spec.claimGroups ?? (spec.claims.length > 0 ? [{ headerNumber: 1, claims: spec.claims }] : []),
    providerAdjustments: spec.providerAdjustments ?? [],
  };
}

export interface EnvelopeSpec {
  readonly isa13: number;
  readonly gs06?: number;
  readonly st02?: string;
  readonly date: CalendarDate;
  readonly time?: string;
  readonly delimiters?: Delimiters;
  readonly usage?: 'T' | 'P';
  readonly receiverId?: string;
  readonly seCountOverride?: number;
}

/** One interchange, one group, one transaction set. */
export function singleTransactionFile(remittance835: Remittance835, envelope: EnvelopeSpec): File835 {
  return { interchanges: [envelopeOf([remittance835], envelope)] };
}

/** One interchange and one group holding the given transaction sets (ST02 0001, 0002, ...). */
export function envelopeOf(remittances: readonly Remittance835[], envelope: EnvelopeSpec): Interchange835 {
  const gs06 = envelope.gs06 ?? envelope.isa13;
  return {
    receiverId: envelope.receiverId ?? 'SYNTHRECEIVER',
    controlNumber: envelope.isa13,
    date: envelope.date,
    time: envelope.time ?? '0915',
    usage: envelope.usage ?? 'T',
    delimiters: envelope.delimiters ?? DEFAULT_DELIMITERS,
    groups: [
      {
        receiverCode: 'SYNTHRCV',
        controlNumber: gs06,
        date: envelope.date,
        time: envelope.time ?? '0915',
        transactions: remittances.map((item, index) => ({
          controlNumber: index === 0 && envelope.st02 !== undefined ? envelope.st02 : String(index + 1).padStart(4, '0'),
          remittance: item,
          seCountOverride: index === 0 ? envelope.seCountOverride : undefined,
        })),
      },
    ],
  };
}

export const dollars = (text: string): Cents => {
  const match = /^(-?)(\d+)(?:\.(\d{2}))?$/.exec(text);
  if (!match) {
    throw new X12BuildError(`dollars() takes "123" or "123.45", not ${text}`);
  }
  const magnitude = BigInt(match[2] ?? '0') * 100n + BigInt(match[3] ?? '0');
  return cents(match[1] === '-' ? -magnitude : magnitude);
};
