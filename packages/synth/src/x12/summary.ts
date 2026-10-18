/**
 * The normalized 835 summary the oracle compares (format "tp-oracle-835/1"). tools/test-oracle's
 * Python script builds the same summary from pyx12's reading of a file's bytes; this module builds it
 * from the segments the writer produced. The two never share code. Amounts are integer cents as
 * strings, dates ISO, every other value the element text as written.
 *
 * Balance rules (docs/adr/0021), computed the same way on both sides:
 * - claim: CLP03 - every CAS in the claim (claim and line level) - CLP04 = 0;
 * - lines, where present: the SVC02 charges sum to CLP03;
 * - each line with its own CAS, and every line of a claim without claim-level CAS: SVC02 - its CAS - SVC03 = 0;
 * - transaction: claims paid (sum of CLP04) - provider adjustments (sum of PLB amounts) - BPR02 = 0,
 *   BPR02 counted negative when BPR03 is D.
 */
import { type Cents, ZERO_CENTS, addCents, centsToString, negateCents, parseAmount, parseCents, subtractCents, sumCents } from '@tp/money';

import { fromX12Date } from '../core/dates';
import { type Delimiters, type X12Document, type X12Segment, elementValue } from './segments';

export const ORACLE_FORMAT = 'tp-oracle-835/1';

export type Pair = readonly [string, string];

export interface DateSummary {
  readonly qualifier: string;
  /** DTM02 as an ISO date, or null when absent. */
  readonly date: string | null;
  /** DTM05, the period format qualifier, when sent. */
  readonly format: string | null;
  /** DTM06, as written. */
  readonly period: string | null;
}

export interface LineSummary {
  /** SVC01 components joined by ':', trailing empty components dropped. */
  readonly procedure: string;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly revenueCode: string | null;
  readonly units: string | null;
  readonly originalProcedure: string | null;
  readonly originalUnits: string | null;
  readonly dates: readonly DateSummary[];
  /** CAS amounts summed by "GROUP-REASON". */
  readonly cas: Readonly<Record<string, string>>;
  readonly refs: readonly Pair[];
  /** [qualifier, cents]. */
  readonly amounts: readonly Pair[];
  readonly remarks: readonly Pair[];
  /** SVC02 - line CAS - SVC03, or null when the rules do not check this line. */
  readonly differenceCents: string | null;
}

export interface ClaimSummary {
  /** LX01 of the 2000 loop holding the claim. */
  readonly lx: string;
  readonly clp01: string;
  readonly clp02: string;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string | null;
  readonly clp06: string;
  readonly clp07: string;
  readonly clp08: string | null;
  readonly clp09: string | null;
  /** Claim-level CAS amounts summed by "GROUP-REASON". */
  readonly cas: Readonly<Record<string, string>>;
  readonly refs: readonly Pair[];
  readonly dates: readonly DateSummary[];
  readonly amounts: readonly Pair[];
  readonly lines: readonly LineSummary[];
  readonly balance: {
    readonly claimDifferenceCents: string;
    readonly lineChargeDifferenceCents: string | null;
    readonly balanced: boolean;
  };
}

export interface PlbItemSummary {
  readonly provider: string;
  readonly fiscalPeriodDate: string;
  readonly code: string;
  readonly reference: string | null;
  readonly amountCents: string;
}

export interface PartySummary {
  readonly name: string;
  readonly idQualifier: string | null;
  readonly id: string | null;
  readonly refs: readonly Pair[];
}

export interface TransactionSummary {
  readonly st01: string;
  readonly st02: string;
  readonly se01: string;
  readonly se02: string;
  /** Segments from ST to SE, both included, as counted. */
  readonly segmentCount: number;
  readonly bpr: {
    readonly handling: string;
    readonly amountCents: string;
    readonly creditDebit: string;
    readonly method: string;
    readonly format: string | null;
    readonly date: string;
  };
  readonly trn: { readonly trace: string; readonly originator: string; readonly supplemental: string | null };
  readonly currency: string | null;
  /** Header REF (EV, F2). */
  readonly refs: readonly Pair[];
  readonly productionDate: string | null;
  readonly payer: PartySummary;
  readonly payee: PartySummary;
  readonly claims: readonly ClaimSummary[];
  readonly plb: readonly PlbItemSummary[];
  readonly balance: {
    readonly claimsPaidCents: string;
    readonly plbTotalCents: string;
    /** BPR02, negative when BPR03 is D. */
    readonly paymentCents: string;
    readonly differenceCents: string;
    readonly balanced: boolean;
    readonly claimsBalanced: boolean;
  };
}

export interface GroupSummary {
  readonly gs01: string;
  readonly gs02: string;
  readonly gs03: string;
  readonly gs04: string;
  readonly gs06: string;
  readonly gs08: string;
  readonly ge01: string;
  readonly ge02: string;
  readonly transactions: readonly TransactionSummary[];
}

export interface InterchangeSummary {
  /** ISA06 and ISA08 without their padding. */
  readonly isa06: string;
  readonly isa08: string;
  readonly isa09: string;
  readonly isa12: string;
  readonly isa13: string;
  readonly isa15: string;
  readonly delimiters: Delimiters;
  readonly iea01: string;
  readonly iea02: string;
  readonly groups: readonly GroupSummary[];
}

export interface OracleSummary {
  readonly format: typeof ORACLE_FORMAT;
  /** The file starts with a UTF-8 byte-order mark. */
  readonly bom: boolean;
  readonly interchanges: readonly InterchangeSummary[];
}

export class SummaryError extends Error {
  override readonly name = 'SummaryError';
}

const nullable = (text: string): string | null => (text === '' ? null : text);

function cents(text: string): Cents {
  try {
    return parseAmount(text);
  } catch {
    throw new SummaryError(`not an amount: ${text}`);
  }
}

function isoDate(text: string): string {
  return fromX12Date(text);
}

function composite(segment: X12Segment, position: number): string | null {
  const element = segment.elements[position - 1];
  if (element === undefined) {
    return null;
  }
  const parts = [...element];
  while (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts.length === 0 ? null : parts.join(':');
}

function casItems(segment: X12Segment): { key: string; amount: Cents }[] {
  const group = elementValue(segment, 1);
  const items: { key: string; amount: Cents }[] = [];
  for (let position = 2; position <= 17; position += 3) {
    const reason = elementValue(segment, position);
    if (reason === '') {
      continue;
    }
    items.push({ key: `${group}-${reason}`, amount: cents(elementValue(segment, position + 1)) });
  }
  return items;
}

function addCas(target: Map<string, Cents>, segment: X12Segment): Cents {
  let total = ZERO_CENTS;
  for (const item of casItems(segment)) {
    target.set(item.key, addCents(target.get(item.key) ?? ZERO_CENTS, item.amount));
    total = addCents(total, item.amount);
  }
  return total;
}

function casRecord(map: Map<string, Cents>): Record<string, string> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => [key, centsToString(value)]));
}

function dateSummary(segment: X12Segment): DateSummary {
  const date = elementValue(segment, 2);
  return {
    qualifier: elementValue(segment, 1),
    date: date === '' ? null : isoDate(date),
    format: nullable(elementValue(segment, 5)),
    period: nullable(elementValue(segment, 6)),
  };
}

interface LineDraft {
  svc: X12Segment;
  dates: DateSummary[];
  cas: Map<string, Cents>;
  casTotal: Cents;
  casCount: number;
  refs: Pair[];
  amounts: Pair[];
  remarks: Pair[];
}

interface ClaimDraft {
  lx: string;
  clp: X12Segment;
  cas: Map<string, Cents>;
  casTotal: Cents;
  casCount: number;
  refs: Pair[];
  dates: DateSummary[];
  amounts: Pair[];
  lines: LineDraft[];
}

function finishClaim(draft: ClaimDraft): ClaimSummary {
  const charge = cents(elementValue(draft.clp, 3));
  const paid = cents(elementValue(draft.clp, 4));
  const lineCas = sumCents(draft.lines.map((line) => line.casTotal));
  const claimDifference = subtractCents(subtractCents(subtractCents(charge, draft.casTotal), lineCas), paid);
  const lineCharges = sumCents(draft.lines.map((line) => cents(elementValue(line.svc, 2))));
  const lineChargeDifference = draft.lines.length === 0 ? null : subtractCents(lineCharges, charge);
  let balanced = claimDifference === 0n && (lineChargeDifference ?? 0n) === 0n;
  const lines = draft.lines.map((line): LineSummary => {
    const checked = line.casCount > 0 || draft.casCount === 0;
    const difference = checked ? subtractCents(subtractCents(cents(elementValue(line.svc, 2)), line.casTotal), cents(elementValue(line.svc, 3))) : null;
    if (difference !== null && difference !== 0n) {
      balanced = false;
    }
    return {
      procedure: composite(line.svc, 1) ?? '',
      chargeCents: centsToString(cents(elementValue(line.svc, 2))),
      paidCents: centsToString(cents(elementValue(line.svc, 3))),
      revenueCode: nullable(elementValue(line.svc, 4)),
      units: nullable(elementValue(line.svc, 5)),
      originalProcedure: composite(line.svc, 6),
      originalUnits: nullable(elementValue(line.svc, 7)),
      dates: line.dates,
      cas: casRecord(line.cas),
      refs: line.refs,
      amounts: line.amounts,
      remarks: line.remarks,
      differenceCents: difference === null ? null : centsToString(difference),
    };
  });
  const responsibility = elementValue(draft.clp, 5);
  return {
    lx: draft.lx,
    clp01: elementValue(draft.clp, 1),
    clp02: elementValue(draft.clp, 2),
    chargeCents: centsToString(charge),
    paidCents: centsToString(paid),
    patientResponsibilityCents: responsibility === '' ? null : centsToString(cents(responsibility)),
    clp06: elementValue(draft.clp, 6),
    clp07: elementValue(draft.clp, 7),
    clp08: nullable(elementValue(draft.clp, 8)),
    clp09: nullable(elementValue(draft.clp, 9)),
    cas: casRecord(draft.cas),
    refs: draft.refs,
    dates: draft.dates,
    amounts: draft.amounts,
    lines,
    balance: {
      claimDifferenceCents: centsToString(claimDifference),
      lineChargeDifferenceCents: lineChargeDifference === null ? null : centsToString(lineChargeDifference),
      balanced,
    },
  };
}

interface TransactionDraft {
  st: X12Segment;
  segmentCount: number;
  bpr?: X12Segment;
  trn?: X12Segment;
  currency: string | null;
  refs: Pair[];
  productionDate: string | null;
  payer: { n1?: X12Segment; refs: Pair[] };
  payee: { n1?: X12Segment; refs: Pair[] };
  claims: ClaimSummary[];
  plb: PlbItemSummary[];
  area: 'header' | 'payer' | 'payee' | 'detail' | 'footer';
  lx: string;
  claim?: ClaimDraft;
  line?: LineDraft;
}

function party(draft: { n1?: X12Segment; refs: Pair[] }): PartySummary {
  if (!draft.n1) {
    throw new SummaryError('a transaction is missing its payer or payee N1');
  }
  return { name: elementValue(draft.n1, 2), idQualifier: nullable(elementValue(draft.n1, 3)), id: nullable(elementValue(draft.n1, 4)), refs: draft.refs };
}

function closeClaim(draft: TransactionDraft): void {
  if (draft.claim) {
    if (draft.line) {
      draft.claim.lines.push(draft.line);
    }
    draft.claims.push(finishClaim(draft.claim));
  }
  draft.claim = undefined;
  draft.line = undefined;
}

function finishTransaction(draft: TransactionDraft, se: X12Segment): TransactionSummary {
  closeClaim(draft);
  if (!draft.bpr || !draft.trn) {
    throw new SummaryError('a transaction is missing BPR or TRN');
  }
  const amount = cents(elementValue(draft.bpr, 2));
  const payment = elementValue(draft.bpr, 3) === 'D' ? negateCents(amount) : amount;
  const claimsPaid = sumCents(draft.claims.map((claim) => parseCents(claim.paidCents)));
  const plbTotal = sumCents(draft.plb.map((item) => parseCents(item.amountCents)));
  const difference = subtractCents(subtractCents(claimsPaid, plbTotal), payment);
  return {
    st01: elementValue(draft.st, 1),
    st02: elementValue(draft.st, 2),
    se01: elementValue(se, 1),
    se02: elementValue(se, 2),
    segmentCount: draft.segmentCount,
    bpr: {
      handling: elementValue(draft.bpr, 1),
      amountCents: centsToString(amount),
      creditDebit: elementValue(draft.bpr, 3),
      method: elementValue(draft.bpr, 4),
      format: nullable(elementValue(draft.bpr, 5)),
      date: isoDate(elementValue(draft.bpr, 16)),
    },
    trn: { trace: elementValue(draft.trn, 2), originator: elementValue(draft.trn, 3), supplemental: nullable(elementValue(draft.trn, 4)) },
    currency: draft.currency,
    refs: draft.refs,
    productionDate: draft.productionDate,
    payer: party(draft.payer),
    payee: party(draft.payee),
    claims: draft.claims,
    plb: draft.plb,
    balance: {
      claimsPaidCents: centsToString(claimsPaid),
      plbTotalCents: centsToString(plbTotal),
      paymentCents: centsToString(payment),
      differenceCents: centsToString(difference),
      balanced: difference === 0n,
      claimsBalanced: draft.claims.every((claim) => claim.balance.balanced),
    },
  };
}

function onTransactionSegment(draft: TransactionDraft, segment: X12Segment): void {
  const id = segment.id;
  if (id === 'LX') {
    closeClaim(draft);
    draft.area = 'detail';
    draft.lx = elementValue(segment, 1);
    return;
  }
  if (id === 'PLB') {
    closeClaim(draft);
    draft.area = 'footer';
    for (let position = 3; position <= 13; position += 2) {
      const code = segment.elements[position - 1];
      if (code === undefined || (code[0] ?? '') === '') {
        continue;
      }
      draft.plb.push({
        provider: elementValue(segment, 1),
        fiscalPeriodDate: isoDate(elementValue(segment, 2)),
        code: code[0] ?? '',
        reference: nullable(code[1] ?? ''),
        amountCents: centsToString(cents(elementValue(segment, position + 1))),
      });
    }
    return;
  }
  if (draft.area === 'detail') {
    onDetailSegment(draft, segment);
    return;
  }
  switch (id) {
    case 'BPR':
      draft.bpr = segment;
      return;
    case 'TRN':
      draft.trn = segment;
      return;
    case 'CUR':
      draft.currency = elementValue(segment, 2);
      return;
    case 'DTM':
      if (draft.area === 'header') {
        draft.productionDate = isoDate(elementValue(segment, 2));
      }
      return;
    case 'N1':
      if (elementValue(segment, 1) === 'PR') {
        draft.area = 'payer';
        draft.payer.n1 = segment;
      } else {
        draft.area = 'payee';
        draft.payee.n1 = segment;
      }
      return;
    case 'REF': {
      const pair: Pair = [elementValue(segment, 1), elementValue(segment, 2)];
      if (draft.area === 'header') {
        draft.refs.push(pair);
      } else if (draft.area === 'payer') {
        draft.payer.refs.push(pair);
      } else {
        draft.payee.refs.push(pair);
      }
      return;
    }
    default:
      // N3, N4, PER, RDM: addresses and contacts are not summarized.
      return;
  }
}

function onDetailSegment(draft: TransactionDraft, segment: X12Segment): void {
  const id = segment.id;
  if (id === 'CLP') {
    closeClaim(draft);
    draft.claim = { lx: draft.lx, clp: segment, cas: new Map(), casTotal: ZERO_CENTS, casCount: 0, refs: [], dates: [], amounts: [], lines: [] };
    return;
  }
  const claim = draft.claim;
  if (!claim) {
    // TS3 and TS2 sit between LX and the first CLP; they are not summarized.
    return;
  }
  if (id === 'SVC') {
    if (draft.line) {
      claim.lines.push(draft.line);
    }
    draft.line = { svc: segment, dates: [], cas: new Map(), casTotal: ZERO_CENTS, casCount: 0, refs: [], amounts: [], remarks: [] };
    return;
  }
  const line = draft.line;
  switch (id) {
    case 'CAS':
      if (line) {
        line.casTotal = addCents(line.casTotal, addCas(line.cas, segment));
        line.casCount += 1;
      } else {
        claim.casTotal = addCents(claim.casTotal, addCas(claim.cas, segment));
        claim.casCount += 1;
      }
      return;
    case 'DTM':
      (line ? line.dates : claim.dates).push(dateSummary(segment));
      return;
    case 'REF':
      (line ? line.refs : claim.refs).push([elementValue(segment, 1), elementValue(segment, 2)]);
      return;
    case 'AMT':
      (line ? line.amounts : claim.amounts).push([elementValue(segment, 1), centsToString(cents(elementValue(segment, 2)))]);
      return;
    case 'LQ':
      if (line) {
        line.remarks.push([elementValue(segment, 1), elementValue(segment, 2)]);
      }
      return;
    default:
      // NM1, MIA, MOA, PER and QTY are not summarized.
      return;
  }
}

/** Summarizes an 835 document the way the oracle does. Throws SummaryError on a structure it cannot read. */
export function summarize835(document: X12Document, bom = false): OracleSummary {
  const interchanges: InterchangeSummary[] = [];
  for (const interchange of document.interchanges) {
    const [isa, ...rest] = interchange.segments;
    if (isa?.id !== 'ISA') {
      throw new SummaryError('an interchange starts with ISA');
    }
    const groups: GroupSummary[] = [];
    let group: { gs: X12Segment; transactions: TransactionSummary[] } | undefined;
    let transaction: TransactionDraft | undefined;
    let iea: X12Segment | undefined;
    for (const segment of rest) {
      if (transaction) {
        transaction.segmentCount += 1;
        if (segment.id === 'SE') {
          group?.transactions.push(finishTransaction(transaction, segment));
          transaction = undefined;
        } else {
          onTransactionSegment(transaction, segment);
        }
        continue;
      }
      switch (segment.id) {
        case 'GS':
          group = { gs: segment, transactions: [] };
          break;
        case 'ST':
          transaction = {
            st: segment,
            segmentCount: 1,
            currency: null,
            refs: [],
            productionDate: null,
            payer: { refs: [] },
            payee: { refs: [] },
            claims: [],
            plb: [],
            area: 'header',
            lx: '',
          };
          break;
        case 'GE':
          if (!group) {
            throw new SummaryError('GE without GS');
          }
          groups.push({
            gs01: elementValue(group.gs, 1),
            gs02: elementValue(group.gs, 2),
            gs03: elementValue(group.gs, 3),
            gs04: isoDate(elementValue(group.gs, 4)),
            gs06: elementValue(group.gs, 6),
            gs08: elementValue(group.gs, 8),
            ge01: elementValue(segment, 1),
            ge02: elementValue(segment, 2),
            transactions: group.transactions,
          });
          group = undefined;
          break;
        case 'IEA':
          iea = segment;
          break;
        default:
          throw new SummaryError(`unexpected ${segment.id} outside a transaction`);
      }
    }
    if (!iea || transaction || group) {
      throw new SummaryError('an interchange ends with IEA after every SE and GE');
    }
    interchanges.push({
      isa06: elementValue(isa, 6).trimEnd(),
      isa08: elementValue(isa, 8).trimEnd(),
      isa09: elementValue(isa, 9),
      isa12: elementValue(isa, 12),
      isa13: elementValue(isa, 13),
      isa15: elementValue(isa, 15),
      delimiters: interchange.delimiters,
      iea01: elementValue(iea, 1),
      iea02: elementValue(iea, 2),
      groups,
    });
  }
  return { format: ORACLE_FORMAT, bom, interchanges };
}
