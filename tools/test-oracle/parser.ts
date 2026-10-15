/**
 * The parser's side of the 835 oracle (PRD section 18): packages/edi835's reading of a fixture, in
 * the normalized summary format pyx12's reading is put in (tp-oracle-835/1, documented in
 * packages/synth/src/x12/summary.ts), and the comparison of the two readings and verdicts. The summary
 * is built from the parser's typed events only, so it shares no code with oracle.py or with the
 * writer's summary.
 */
import { type Claim, type DateValue, type ParseResult, type Party, type Procedure, type Remittance, type ServiceLine } from '@tp/edi835';

import { jsonDifferences, type OracleResult } from './compare';

type Pair = readonly [string, string];

function casRecord(adjustments: readonly { readonly group: string; readonly reason: string; readonly cents: bigint }[]): Record<string, string> {
  const totals = new Map<string, bigint>();
  for (const adjustment of adjustments) {
    const key = `${adjustment.group}-${adjustment.reason}`;
    totals.set(key, (totals.get(key) ?? 0n) + adjustment.cents);
  }
  return Object.fromEntries([...totals.keys()].sort().map((key) => [key, String(totals.get(key))]));
}

function dates(values: readonly DateValue[]) {
  return values.map((value) => ({ qualifier: value.qualifier, date: value.date, format: value.periodFormat, period: value.period }));
}

function pairs(values: readonly { readonly qualifier: string; readonly value: string }[]): Pair[] {
  return values.map((value) => [value.qualifier, value.value]);
}

function amounts(values: readonly { readonly qualifier: string; readonly cents: bigint }[]): Pair[] {
  return values.map((value) => [value.qualifier, value.cents.toString()]);
}

/** SVC01 or SVC06 as its components joined by ':', trailing empty components dropped. */
export function procedureText(procedure: Procedure): string {
  const components = [procedure.qualifier, procedure.code, ...procedure.modifiers];
  if (procedure.description !== null) {
    components.push(...Array.from({ length: 6 - components.length }, () => ''), procedure.description);
  }
  return components.join(':');
}

function line(serviceLine: ServiceLine) {
  return {
    procedure: procedureText(serviceLine.procedure),
    chargeCents: serviceLine.chargeCents.toString(),
    paidCents: serviceLine.paidCents.toString(),
    revenueCode: serviceLine.revenueCode,
    units: serviceLine.units,
    originalProcedure: serviceLine.originalProcedure === null ? null : procedureText(serviceLine.originalProcedure),
    originalUnits: serviceLine.originalUnits,
    dates: dates(serviceLine.dates),
    cas: casRecord(serviceLine.adjustments),
    refs: pairs(serviceLine.references),
    amounts: amounts(serviceLine.amounts),
    remarks: serviceLine.remarks.map((remark): Pair => [remark.qualifier, remark.code]),
    differenceCents: serviceLine.differenceCents === null ? null : serviceLine.differenceCents.toString(),
  };
}

function claim(item: Claim) {
  return {
    lx: item.headerNumber,
    clp01: item.patientControlNumber,
    clp02: item.status,
    chargeCents: item.chargeCents.toString(),
    paidCents: item.paidCents.toString(),
    patientResponsibilityCents: item.patientResponsibilityCents === null ? null : item.patientResponsibilityCents.toString(),
    clp06: item.filingIndicator,
    clp07: item.payerClaimControlNumber,
    clp08: item.facilityCode,
    clp09: item.frequencyCode,
    cas: casRecord(item.adjustments),
    refs: pairs(item.references),
    dates: dates(item.dates),
    amounts: amounts(item.amounts),
    lines: item.lines.map(line),
    balance: {
      claimDifferenceCents: item.balance.claimDifferenceCents.toString(),
      lineChargeDifferenceCents: item.balance.lineChargeDifferenceCents === null ? null : item.balance.lineChargeDifferenceCents.toString(),
      balanced: item.balance.balanced,
    },
  };
}

function party(item: Party) {
  return { name: item.name, idQualifier: item.idQualifier, id: item.id, refs: pairs(item.references) };
}

function transaction(remittance: Remittance) {
  const { payment, trace, payer, payee } = remittance;
  if (payment === null || trace === null || payer === null || payee === null) {
    return null;
  }
  return {
    st01: '835',
    st02: remittance.controlNumber,
    se01: remittance.trailer.segmentCount,
    se02: remittance.trailer.controlNumber,
    segmentCount: remittance.segmentCount,
    bpr: { handling: payment.handling, amountCents: payment.amountCents.toString(), creditDebit: payment.creditDebit, method: payment.method, format: payment.format, date: payment.date },
    trn: { trace: trace.number, originator: trace.originatorId, supplemental: trace.supplemental },
    currency: remittance.currency,
    refs: pairs(remittance.references),
    productionDate: remittance.productionDate,
    payer: party(payer),
    payee: party(payee),
    claims: remittance.claims.map(claim),
    plb: remittance.providerAdjustments.map((item) => ({ provider: item.providerId, fiscalPeriodDate: item.fiscalPeriodDate, code: item.code, reference: item.reference, amountCents: item.cents.toString() })),
    balance: {
      claimsPaidCents: remittance.balance.claimsPaidCents.toString(),
      plbTotalCents: remittance.balance.plbTotalCents.toString(),
      paymentCents: remittance.balance.paymentCents.toString(),
      differenceCents: remittance.balance.differenceCents.toString(),
      balanced: remittance.balance.balanced,
      claimsBalanced: remittance.balance.claimsBalanced,
    },
  };
}

interface GroupDraft {
  gs01: string;
  gs02: string;
  gs03: string;
  gs04: string;
  gs06: string;
  gs08: string;
  ge01: string | null;
  ge02: string | null;
  transactions: unknown[];
}

interface InterchangeDraft {
  isa06: string;
  isa08: string;
  isa09: string;
  isa12: string;
  isa13: string;
  isa15: string;
  delimiters: { element: string; component: string; repetition: string; segment: string };
  iea01: string | null;
  iea02: string | null;
  groups: GroupDraft[];
}

/**
 * The parser's reading in the oracle's summary format, or null when the parser could not read the
 * document as a whole 835 (a document error, or a transaction missing BPR, TRN or a party), as pyx12's
 * side gives none then.
 */
export function parserSummary(result: ParseResult): unknown {
  if (result.report.documentErrors.length > 0) {
    return null;
  }
  const interchanges: InterchangeDraft[] = [];
  let complete = true;
  const lastInterchange = (): InterchangeDraft => interchanges[interchanges.length - 1] as InterchangeDraft;
  const lastGroup = (): GroupDraft => lastInterchange().groups[lastInterchange().groups.length - 1] as GroupDraft;
  for (const event of result.events) {
    switch (event.type) {
      case 'interchange': {
        const header = event.interchange;
        interchanges.push({
          isa06: header.senderId,
          isa08: header.receiverId,
          isa09: header.isa09,
          isa12: header.version,
          isa13: header.controlNumber,
          isa15: header.usage,
          delimiters: { ...header.delimiters },
          iea01: null,
          iea02: null,
          groups: [],
        });
        break;
      }
      case 'group': {
        const header = event.group;
        lastInterchange().groups.push({ gs01: header.functionalId, gs02: header.senderCode, gs03: header.receiverCode, gs04: header.date ?? '', gs06: header.controlNumber, gs08: header.version, ge01: null, ge02: null, transactions: [] });
        break;
      }
      case 'transaction': {
        const summary = transaction(event.transaction);
        complete &&= summary !== null;
        lastGroup().transactions.push(summary);
        break;
      }
      case 'group_end':
        lastGroup().ge01 = event.group.transactionCount;
        lastGroup().ge02 = event.group.controlNumber;
        break;
      case 'interchange_end':
        lastInterchange().iea01 = event.interchange.groupCount;
        lastInterchange().iea02 = event.interchange.controlNumber;
        break;
      case 'document_error':
        break;
    }
  }
  return complete ? { format: 'tp-oracle-835/1', bom: result.report.bom, interchanges } : null;
}

/** What each pyx12 rejection category requires the parser to have found. */
const REQUIRED_FINDING: Readonly<Record<string, (result: ParseResult) => boolean>> = {
  not_835: (result) => result.report.documentErrors.some((error) => error.code === 'EDI_NOT_835'),
  missing_segment: (result) => result.report.documentErrors.some((error) => error.code === 'EDI_SYNTAX'),
  control_count: (result) => result.report.transactions.some((outcome) => outcome.heldReasons.some((error) => error.code === 'EDI_CONTROL_MISMATCH')),
};

/** Structural findings pyx12 makes too (it neither balances amounts nor checks CARC and RARC against a release). */
const STRUCTURAL = new Set(['EDI_SYNTAX', 'EDI_NOT_835', 'EDI_CONTROL_MISMATCH']);

export interface ParserCheck {
  readonly spec: string;
  /** The parse outcome the fixture's expected.json states, when it states one. */
  readonly parseOutcome?: string;
}

/**
 * Every disagreement between the parser's reading of a file and pyx12's: the summaries (every
 * segment, amount and balance the summary carries, to the cent), and the verdicts. Where pyx12 accepts
 * a file the parser may hold it only for what pyx12 does not check (balance, unknown codes); where pyx12
 * rejects one the parser must find the same kind of problem, unless the fixture declares that the
 * parser reads it (its expected parse outcome is "loaded").
 */
export function parserDisagreements(check: ParserCheck, pyx12: OracleResult, result: ParseResult): string[] {
  const problems: string[] = [];
  const ours = parserSummary(result);
  if (pyx12.summary === null && ours !== null) {
    problems.push(`${check.spec}: the parser read a whole 835 where pyx12 could not`);
  } else if (pyx12.summary !== null && ours === null) {
    problems.push(`${check.spec}: pyx12 read a whole 835 where the parser could not (${result.report.documentErrors.map((error) => error.message).join('; ') || 'a transaction is missing BPR, TRN or a party'})`);
  } else if (pyx12.summary !== null) {
    problems.push(...jsonDifferences(pyx12.summary, ours).map((difference) => `${check.spec}: pyx12 and the parser differ at ${difference.replace('missing from the oracle', 'missing from the parser')}`));
  }
  const structural = [
    ...result.report.documentErrors,
    ...result.report.envelopeErrors,
    ...result.report.transactions.flatMap((outcome) => outcome.heldReasons),
  ].filter((error) => STRUCTURAL.has(error.code));
  if (pyx12.valid && structural.length > 0) {
    problems.push(`${check.spec}: pyx12 accepts it and the parser holds it: ${structural[0]?.message ?? ''}`);
  }
  if (!pyx12.valid) {
    for (const rejection of pyx12.rejections) {
      const finding = REQUIRED_FINDING[rejection];
      if (finding !== undefined && !finding(result)) {
        problems.push(`${check.spec}: pyx12 reports ${rejection} and the parser found nothing of the kind`);
      }
    }
    if (structural.length === 0 && check.parseOutcome !== 'loaded') {
      problems.push(`${check.spec}: pyx12 rejects it (${pyx12.rejections.join(', ')}) and the parser holds nothing, and the fixture does not say the parser reads it`);
    }
  }
  if (check.parseOutcome !== undefined && check.parseOutcome !== result.report.outcome) {
    problems.push(`${check.spec}: the fixture expects the parse outcome ${check.parseOutcome}, the parser's is ${result.report.outcome}`);
  }
  return problems;
}
