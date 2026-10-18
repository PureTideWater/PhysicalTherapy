import type { Adjustment, Claim, LoadableRemittance, Name, ServiceLine, UnknownCode } from '@tp/edi835';
import type { Cents } from '@tp/money';

/**
 * What the loader writes for one loadable transaction set, worked out from the parser's typed loops
 * before any database is touched (PRD 10, step 9; docs/adr/0027). Pure: the identifiers here are still
 * plaintext, and the loader encrypts and hashes them with the practice's cipher as it writes.
 *
 * - The payer as the remittance names it, for the mapping queue: N103 and N104 when sent, else REF 2U,
 *   else TRN03, each with its qualifier, exactly as sent (a payer whose identifier changes format
 *   between files reaches the queue under both forms; variant V24).
 * - Each claim's plan key: REF CE when sent, else CLP06's filing indicator.
 * - The patient and the insured, each by its patient key: the name as sent (normalized) with the
 *   member ID when one is sent, else the identifier in NM108 and NM109, else the patient control
 *   number. The key names no payer; two people who share a name but carry different member IDs are
 *   never one reference. The member ID is the payer's identifier for the person (NM108 MI, HN, II or
 *   MR; never a Social Security number); the group number is REF 1L, held by the insured, or the
 *   patient when no insured is sent.
 * - A professional line's place of service: CLP08 when the claim's lines are professional (a HCPCS
 *   procedure, no revenue code) and CLP08 is a two-digit code; on an institutional claim CLP08 is the
 *   facility type and the line has no place of service.
 * - Units and quantities stored exactly in numeric(9,3), or the transaction set is refused (held), never
 *   rounded.
 */

export interface PayerIdentity {
  readonly payerIdRaw: string;
  readonly nameRaw: string;
}

export interface PersonIdentity {
  /** The payer-independent patient key; the pseudonym is its keyed hash. */
  readonly key: string;
  readonly lastName: string | null;
  readonly firstName: string | null;
  readonly memberId: string | null;
  readonly groupNumber: string | null;
}

export interface PlannedAdjustment {
  readonly groupCode: string;
  readonly reasonCode: string;
  readonly unknownCode: boolean;
  readonly amountCents: Cents;
  readonly quantity: string | null;
  readonly position: number;
}

export interface PlannedLine {
  readonly lineNo: number;
  readonly procedureQualifier: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly revenueCode: string | null;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
  readonly units: string | null;
  readonly originalUnits: string | null;
  readonly serviceDate: string | null;
  readonly serviceDateTo: string | null;
  /** CLP08 on a professional line (see placeOfService), else null. */
  readonly placeOfService: string | null;
  readonly lineAllowedCents: Cents | null;
  readonly observedAllowedCents: Cents;
  readonly observedAllowedBasis: 'amt_b6' | 'paid_plus_pr';
  readonly observedAllowedAllocated: boolean;
  readonly patientShareCents: Cents;
  readonly renderingNpi: string | null;
  readonly adjustments: readonly PlannedAdjustment[];
}

export interface PlannedClaim {
  /** From 1 within the transaction set. */
  readonly claimNo: number;
  readonly patientControlNumber: string;
  readonly payerClaimControlNumber: string;
  readonly statusCode: string;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
  readonly patientRespCents: Cents | null;
  /** CLP06; null for a claim of an ERA export, which carries none (docs/adr/0060). */
  readonly filingIndicator: string | null;
  readonly facilityType: string | null;
  readonly frequencyCode: string | null;
  readonly planKey: string;
  readonly patient: PersonIdentity;
  readonly insured: PersonIdentity | null;
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  readonly allowedCents: Cents | null;
  /** DTM 050: when the payer received the claim (prompt-pay interest counts from it). */
  readonly receivedOn: string | null;
  /** AMT I: the interest the payer paid on the claim (the recovery ledger records it beside principal). */
  readonly interestCents: Cents | null;
  readonly adjustments: readonly PlannedAdjustment[];
  readonly lines: readonly PlannedLine[];
  /** A reversal (CLP02 22): the claim it reverses when that one is earlier in the same transaction set. */
  readonly reversal: { readonly reversedClaimNo: number | null } | null;
  /** A corrected claim: the payer claim control number it replaces, and the reversal it follows here. */
  readonly correction: { readonly payerClaimControlNumber: string; readonly reversalClaimNo: number | null } | null;
}

export interface PlannedProviderAdjustment {
  readonly position: number;
  readonly providerId: string;
  readonly reasonCode: string;
  readonly reference: string | null;
  readonly amountCents: Cents;
  readonly fiscalPeriodDate: string;
  readonly category: 'recoupment' | 'forward_balance' | 'interest' | 'authorized_return' | 'other';
}

/** What every remittance holds, whatever it was loaded from. */
interface PlannedRemittanceBase {
  /** TRN02, or an ERA export's check or EFT number. */
  readonly trn02: string;
  /** BPR02 as written, never negative; an export's payment unsigned. */
  readonly bpr02Cents: Cents;
  /** BPR03; D when an export's payment is negative (a take-back). */
  readonly creditDebit: 'C' | 'D';
  /** BPR16, or an export's payment date. */
  readonly bpr16Date: string;
  readonly payerName: string;
  readonly payeeId: string;
  readonly productionDate: string | null;
  readonly balanceDiffCents: Cents;
  readonly claimCount: number;
  readonly plbTotalCents: Cents;
}

/** An 835 transaction set, with its whole X12 envelope (remittance_x12_envelope). */
export interface PlannedX12Remittance extends PlannedRemittanceBase {
  readonly provenance: 'x12_835';
  readonly senderId: string;
  readonly receiverId: string;
  readonly isa13: string;
  readonly gs06: string;
  readonly st02: string;
  readonly trn03: string;
  /** BPR04. */
  readonly method: string;
  readonly payeeIdQualifier: string;
}

/**
 * A payment of a vendor ERA export (docs/adr/0060): no envelope is invented for it (remittance_export_has_no_envelope),
 * so it has no receiver, ISA13, GS06, ST02, TRN03 or payee qualifier; its sender and payment method are the export's
 * when its columns hold them.
 */
export interface PlannedExportRemittance extends PlannedRemittanceBase {
  readonly provenance: 'era_export';
  readonly senderId: string | null;
  readonly method: string | null;
}

export type PlannedRemittance = PlannedX12Remittance | PlannedExportRemittance;

/**
 * The typed load model the loader writes (loader.ts), one remittance with its payer, claims, lines and adjustments:
 * made from an 835's typed loops by loadPlan(), or from a vendor ERA export's rows by the normalizer
 * (era/normalize.ts), so pricing, triage and the ledger read one shape whichever it came from.
 */
export interface LoadPlan<R extends PlannedRemittance = PlannedRemittance> {
  readonly remittance: R;
  readonly payer: PayerIdentity;
  readonly claims: readonly PlannedClaim[];
  readonly providerAdjustments: readonly PlannedProviderAdjustment[];
}

/** Where a value the database cannot store exactly was found: the transaction set is held there. */
export interface PlanRefusal {
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
}

export type PlanResult = { readonly kind: 'plan'; readonly plan: LoadPlan<PlannedX12Remittance> } | { readonly kind: 'refused'; readonly at: PlanRefusal };

const MEMBER_ID_QUALIFIERS: ReadonlySet<string> = new Set(['MI', 'HN', 'II', 'MR']);
const INSURED_ID_QUALIFIERS: ReadonlySet<string> = new Set(['MI', 'II']);

/** The text a key is made of: Unicode-normalized, upper case, single spaces, trimmed. */
export function normalizeKeyPart(value: string | null): string {
  return (value ?? '').normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** The person's key from the NM1 alone, or null when it names nobody (no name and no identifier). */
export function personKey(name: Name): string | null {
  const last = normalizeKeyPart(name.lastOrOrganization);
  if (last !== '') {
    return ['name', last, normalizeKeyPart(name.first), normalizeKeyPart(name.middle), normalizeKeyPart(name.suffix)].join('|');
  }
  const id = normalizeKeyPart(name.id);
  return id === '' ? null : ['id', normalizeKeyPart(name.idQualifier), id].join('|');
}

/** Whether numeric(9,3) holds the decimal text exactly: at most six whole digits and three decimals. */
export function fitsNumeric93(text: string): boolean {
  const match = /^-?(\d*)(?:\.(\d*))?$/.exec(text);
  if (match === null || text === '-' || text === '' || text === '.' || text === '-.') {
    return false;
  }
  const whole = (match[1] ?? '').replace(/^0+/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return whole.length <= 6 && fraction.length <= 3;
}

function reference(references: readonly { readonly qualifier: string; readonly value: string }[], qualifier: string): string | null {
  return references.find((item) => item.qualifier === qualifier)?.value ?? null;
}

/** The payer's identifier for the mapping queue, as sent, with its qualifier. */
export function payerIdentity(remittance: LoadableRemittance): PayerIdentity {
  const { payer } = remittance;
  const reported = payer.idQualifier !== null && payer.id !== null ? `${payer.idQualifier}:${payer.id}` : null;
  const payerRef = reference(payer.references, '2U');
  const payerIdRaw = reported ?? (payerRef === null ? `TRN03:${remittance.trace.originatorId}` : `2U:${payerRef}`);
  return { payerIdRaw, nameRaw: payer.name };
}

/** The claim's plan key: REF CE (class of contract), else the claim filing indicator. */
export function planKey(claim: Claim): string {
  return claim.planRef === null ? `CLP06:${claim.filingIndicator}` : `CE:${claim.planRef}`;
}

/** Whether the adjustment's reason code was flagged unknown (an adjustment group outside its set holds the set instead). */
function isUnknown(unknown: readonly UnknownCode[], adjustment: Adjustment): boolean {
  return unknown.some((code) => code.segmentIndex === adjustment.segmentIndex && code.elementPosition === adjustment.elementPosition);
}

function rendering(claim: Claim, line: ServiceLine): string | null {
  const own = reference(line.references, 'HPI');
  if (own !== null) {
    return own;
  }
  const provider = claim.names.find((name) => name.entity === '82' && name.idQualifier === 'XX');
  return provider?.id ?? null;
}

/**
 * The person an NM1 names. A name key carries the member ID when one is sent: a reference holds one
 * member ID, so two people of one name with different member IDs are two references, and neither's
 * member ID is ever stored on the other's (packets carry it).
 */
function person(name: Name | undefined, memberQualifiers: ReadonlySet<string>, groupNumber: string | null, fallbackKey: string | null): PersonIdentity | null {
  const key = name === undefined ? null : personKey(name);
  const chosen = key ?? fallbackKey;
  if (chosen === null) {
    return null;
  }
  const memberId = name !== undefined && name.id !== null && name.idQualifier !== null && memberQualifiers.has(name.idQualifier) ? name.id : null;
  const keyed = memberId !== null && chosen.startsWith('name|') ? `${chosen}|member|${normalizeKeyPart(memberId)}` : chosen;
  return { key: keyed, lastName: name?.lastOrOrganization ?? null, firstName: name?.first ?? null, memberId, groupNumber };
}

const PLACE_OF_SERVICE = /^\d{2}$/;

/**
 * The place of service of a line (PRD 11, line facts): on a professional claim CLP08 carries it, the
 * claim's facility code being the place the services were rendered; a line billed with a revenue code
 * (SVC04, or a revenue code as its procedure) is institutional, where CLP08 is the facility type.
 */
export function placeOfService(claim: Pick<Claim, 'facilityCode'>, line: Pick<ServiceLine, 'procedure' | 'revenueCode'>): string | null {
  const professional = line.procedure.qualifier === 'HC' && line.revenueCode === null;
  return professional && claim.facilityCode !== null && PLACE_OF_SERVICE.test(claim.facilityCode) ? claim.facilityCode : null;
}

class Refused extends Error {
  constructor(readonly at: PlanRefusal) {
    super('a value does not fit its column exactly');
  }
}

function exact(text: string | null, at: PlanRefusal): string | null {
  if (text !== null && !fitsNumeric93(text)) {
    throw new Refused(at);
  }
  return text;
}

function adjustments(list: readonly Adjustment[], unknown: readonly UnknownCode[]): PlannedAdjustment[] {
  return list.map((item) => ({
    groupCode: item.group,
    reasonCode: item.reason,
    unknownCode: isUnknown(unknown, item),
    amountCents: item.cents,
    quantity: exact(item.quantity, { segmentIndex: item.segmentIndex, segmentId: 'CAS', elementPosition: item.elementPosition + 2 }),
    position: item.position,
  }));
}

function plannedLine(claim: Claim, line: ServiceLine, unknown: readonly UnknownCode[]): PlannedLine {
  const at = (elementPosition: number) => ({ segmentIndex: line.segmentIndex, segmentId: 'SVC', elementPosition });
  const observed = line.observedAllowed;
  return {
    lineNo: line.lineNo,
    procedureQualifier: line.procedure.qualifier,
    procedureCode: line.procedure.code,
    modifiers: line.procedure.modifiers,
    revenueCode: line.revenueCode,
    chargeCents: line.chargeCents,
    paidCents: line.paidCents,
    units: exact(line.units, at(5)),
    originalUnits: exact(line.originalUnits, at(7)),
    serviceDate: line.serviceFrom,
    serviceDateTo: line.serviceTo === null || line.serviceTo === line.serviceFrom ? null : line.serviceTo,
    placeOfService: placeOfService(claim, line),
    lineAllowedCents: line.lineAllowedCents,
    observedAllowedCents: observed.cents,
    observedAllowedBasis: observed.basis,
    observedAllowedAllocated: observed.allocatedFromClaim,
    patientShareCents: observed.allocatedFromClaim && observed.allocatedPatientShareCents !== null ? observed.allocatedPatientShareCents : line.patientShareCents,
    renderingNpi: rendering(claim, line),
    adjustments: adjustments(line.adjustments, unknown),
  };
}

function claimNoIn(remittance: LoadableRemittance, position: { readonly interchange: number; readonly group: number; readonly transaction: number; readonly claim: number } | null): number | null {
  if (position === null) {
    return null;
  }
  const own = remittance.position;
  return position.interchange === own.interchange && position.group === own.group && position.transaction === own.transaction ? position.claim + 1 : null;
}

function plannedClaim(remittance: LoadableRemittance, claim: Claim): PlannedClaim {
  const unknown = remittance.unknownCodes;
  const patientName = claim.names.find((name) => name.entity === 'QC');
  const insuredName = claim.names.find((name) => name.entity === 'IL');
  const groupNumber = reference(claim.references, '1L');
  const insured = person(insuredName, INSURED_ID_QUALIFIERS, groupNumber, null);
  const patient = person(patientName, MEMBER_ID_QUALIFIERS, insured === null ? groupNumber : null, ['pcn', normalizeKeyPart(claim.patientControlNumber)].join('|')) as PersonIdentity;
  return {
    claimNo: claim.index + 1,
    patientControlNumber: claim.patientControlNumber,
    payerClaimControlNumber: claim.payerClaimControlNumber,
    statusCode: claim.status,
    chargeCents: claim.chargeCents,
    paidCents: claim.paidCents,
    patientRespCents: claim.patientResponsibilityCents,
    filingIndicator: claim.filingIndicator,
    facilityType: claim.facilityCode,
    frequencyCode: claim.frequencyCode,
    planKey: planKey(claim),
    patient,
    insured,
    serviceFrom: claim.serviceFrom,
    serviceTo: claim.serviceTo,
    allowedCents: claim.allowedCents,
    receivedOn: claim.dates.find((date) => date.qualifier === '050')?.from ?? null,
    interestCents: claim.amounts.find((amount) => amount.qualifier === 'I')?.cents ?? null,
    adjustments: adjustments(claim.adjustments, unknown),
    lines: claim.lines.map((line) => plannedLine(claim, line, unknown)),
    reversal: claim.reversal === null ? null : { reversedClaimNo: claimNoIn(remittance, claim.reversal.reversed) },
    correction: claim.correction === null ? null : { payerClaimControlNumber: claim.correction.payerClaimControlNumber, reversalClaimNo: claimNoIn(remittance, claim.correction.reversal) },
  };
}

/** The rows a loadable transaction set becomes, or where a value cannot be stored exactly. */
export function loadPlan(remittance: LoadableRemittance): PlanResult {
  try {
    const { payment, trace, payee, dedupKey } = remittance;
    if (payee.idQualifier === null) {
      // The 5010 structure requires N103 beside N104, and the parser holds a payee without it.
      throw new Error('a loadable transaction set names its payee with a qualifier');
    }
    const plan: LoadPlan<PlannedX12Remittance> = {
      remittance: {
        provenance: 'x12_835',
        senderId: remittance.senderId,
        receiverId: remittance.receiverId,
        isa13: remittance.interchangeControlNumber,
        gs06: remittance.groupControlNumber,
        st02: remittance.controlNumber,
        trn02: trace.number,
        trn03: trace.originatorId,
        bpr02Cents: payment.amountCents,
        creditDebit: payment.creditDebit === 'D' ? 'D' : 'C',
        method: payment.method,
        bpr16Date: payment.date,
        payerName: remittance.payer.name,
        payeeId: dedupKey.payeeId,
        payeeIdQualifier: payee.idQualifier,
        productionDate: remittance.productionDate,
        balanceDiffCents: remittance.balance.differenceCents,
        claimCount: remittance.claims.length,
        plbTotalCents: remittance.balance.plbTotalCents,
      },
      payer: payerIdentity(remittance),
      claims: remittance.claims.map((claim) => plannedClaim(remittance, claim)),
      providerAdjustments: remittance.providerAdjustments.map((item, index) => ({
        position: index + 1,
        providerId: item.providerId,
        reasonCode: item.code,
        reference: item.reference,
        amountCents: item.cents,
        fiscalPeriodDate: item.fiscalPeriodDate,
        category: item.category,
      })),
    };
    return { kind: 'plan', plan };
  } catch (error) {
    if (error instanceof Refused) {
      return { kind: 'refused', at: error.at };
    }
    throw error;
  }
}
