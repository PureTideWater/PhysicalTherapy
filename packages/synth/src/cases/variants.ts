/**
 * Seeded 835 variants for the oracle, beyond the test-matrix files: many payers and claims,
 * reversals, every PLB code the plan names, zero checks, mixed payment methods, institutional-style
 * claims with no lines, modifiers, decimal units, service periods, unknown codes, line endings, a BOM,
 * trimmed amounts and every segment the writer supports. Each lives in fixtures/synthetic/variants/.
 */
import { addCents } from '@tp/money';

import { addDays, calendarDate } from '../core/dates';
import { outcomeOf, receiptOf } from '../expected/parse';
import { type EdiErrorExpectation, type OracleRejection, type ParseExpectation, type TransactionExpectation } from '../expected/types';
import { type SynthWorld, dollars, envelopeOf, line, remittance, reversalOf } from '../x12/factory';
import { type AdjustmentGroup, type CasSegment, type Claim, type ClaimStatusCode, type File835, type ProviderAdjustment, type Remittance835 } from '../x12/model';
import { type CaseBuilder, type X12RenderOptions, render835 } from './builder';
import { TIMED_CODES, controlNumber, therapyClaim, therapyLine, traceNumber } from './common';
import { basicsOf } from './par';

export interface VariantDefinition {
  /** V01, V02, ... */
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly build: (b: CaseBuilder) => void;
}

const FISCAL = calendarDate(2026, 12, 31);

function randomClaim(b: CaseBuilder, n: number, plan: string, date = calendarDate(2026, 3, 2), lines = b.world.random.int(1, 4)): Claim {
  return therapyClaim(b.world, {
    caseId: b.info.id,
    n,
    plan,
    lines: Array.from({ length: lines }, () =>
      therapyLine(b.world, { code: b.world.random.pick(TIMED_CODES), units: b.world.random.int(1, 4), date: addDays(date, b.world.random.int(0, 3)), share: b.world.random.pick(['coinsurance', 'copay', 'none', 'coinsurance'] as const) }),
    ),
  });
}

function remitFor(b: CaseBuilder, payerKey: string, claims: Claim[], n: number, extra: Partial<Parameters<typeof remittance>[0]> = {}): Remittance835 {
  const world: SynthWorld = b.world;
  const base = basicsOf(world, payerKey);
  const method = extra.method ?? 'ACH';
  return remittance(
    { payer: base.payer, payee: base.payee, claims, paymentDate: base.paid, trace: traceNumber(b.info.id, n, method), originatorId: world.originatorId(payerKey), ...extra },
    world,
  );
}

function wrap(b: CaseBuilder, remittances: Remittance835[], n = 1, usage: 'T' | 'P' = 'T'): File835 {
  return { interchanges: [envelopeOf(remittances, { isa13: controlNumber(b.info.id, n), date: remittances[0]?.payment.date ?? calendarDate(2026, 4, 1), usage })] };
}

function single(b: CaseBuilder, payerKey: string, claims: Claim[], description: string, options: X12RenderOptions = {}, extra: Partial<Parameters<typeof remittance>[0]> = {}): void {
  b.add835('remit.835', wrap(b, [remitFor(b, payerKey, claims, 1, extra)]), description, options);
}

function plb(items: ProviderAdjustment['items'], providerId = '9900000001'): ProviderAdjustment {
  return { providerId, fiscalPeriodDate: FISCAL, items };
}

/**
 * Six adjustments in one CAS segment (CAS02 to CAS19), the last of them one cent off when `offByOneCent`:
 * the paid amounts stay those of the balanced form, so the claim (and the line) is held by exactly -0.01.
 */
function sixAdjustments(group: AdjustmentGroup, reasons: readonly string[], amounts: readonly string[], offByOneCent: boolean): CasSegment {
  return {
    group,
    items: reasons.map((reason, index) => {
      const amount = dollars(amounts[index] ?? '0.00');
      return { reason, amount: offByOneCent && index === reasons.length - 1 ? addCents(amount, dollars('0.01')) : amount, quantity: index % 2 === 1 ? String(index) : undefined };
    }),
  };
}

/** The first transaction set of a parse expectation held by `error` alone, as a structural hold leaves balance unchecked. */
function heldBy(parse: ParseExpectation, error: EdiErrorExpectation): ParseExpectation {
  const transactions: TransactionExpectation[] = parse.transactions.map((transaction, index) => (index === 0 ? { ...transaction, status: 'held', heldReasons: [error] } : transaction));
  return { ...parse, outcome: outcomeOf(transactions), transactions, receipt: receiptOf(transactions) };
}

/** Segment index (from 1) of the first `id` segment of a rendered single-interchange file. */
function indexOf(file: File835, id: string): number {
  return (render835(file).document.interchanges[0]?.segments.findIndex((segment) => segment.id === id) ?? -1) + 1;
}

/** A file with one value outside the structure's own code set: pyx12 rejects it, the parser holds the set at the value. */
function invalidCode(b: CaseBuilder, path: string, file: File835, description: string, rejection: OracleRejection, at: (parse: ParseExpectation) => EdiErrorExpectation): void {
  b.add835(path, file, description, {}, (parse) => heldBy(parse, at(parse)), { valid: false, rejections: [rejection] });
}

export const VARIANTS: readonly VariantDefinition[] = [
  {
    id: 'V01',
    slug: 'many-payers',
    title: 'Five payers, one transaction each, in one interchange',
    build: (b) => {
      const remits = ['A', 'B', 'C', 'D', 'E'].map((key, index) => remitFor(b, key, [randomClaim(b, index * 10 + 1, `SYNPLAN-${key}`), randomClaim(b, index * 10 + 2, `SYNPLAN-${key}`)], index + 1));
      b.add835('remit.835', wrap(b, remits), 'Five transaction sets from five synthetic payers.');
    },
  },
  {
    id: 'V02',
    slug: 'many-claims',
    title: 'Forty-five claims under three LX header numbers',
    build: (b) => {
      const claims = Array.from({ length: 45 }, (_, index) => randomClaim(b, index + 1, 'SYNPLAN-COMM-01', undefined, 1 + (index % 2)));
      const groups = [0, 1, 2].map((group) => ({ headerNumber: group + 1, claims: claims.slice(group * 15, group * 15 + 15) }));
      b.add835('remit.835', wrap(b, [remitFor(b, 'A', claims, 1, { claimGroups: groups })]), 'One check paying forty-five claims grouped under LX 1, 2 and 3.');
    },
  },
  {
    id: 'V03',
    slug: 'reversal-without-correction',
    title: 'A reversal with no corrected claim',
    build: (b) => {
      const original = randomClaim(b, 1, 'SYNPLAN-COMM-01');
      const other = randomClaim(b, 2, 'SYNPLAN-COMM-01');
      single(b, 'A', [reversalOf(original), other], 'A reversal (CLP02 22) of an earlier claim, not followed by a correction, beside a paid claim.');
    },
  },
  {
    id: 'V04',
    slug: 'reversal-and-correction-two-transactions',
    title: 'The original payment and its reversal and correction in one file',
    build: (b) => {
      const original = randomClaim(b, 1, 'SYNPLAN-COMM-01', calendarDate(2026, 2, 9), 2);
      const corrected = therapyClaim(b.world, {
        caseId: b.info.id,
        n: 2,
        patient: original.patient,
        patientControlNumber: original.patientControlNumber,
        plan: 'SYNPLAN-COMM-01',
        frequencyCode: '7',
        refs: [{ qualifier: 'F8', value: original.payerClaimControlNumber }],
        lines: original.lines.map((serviceLine) => line({ code: serviceLine.procedure.code, units: serviceLine.units, charge: serviceLine.charge, dates: serviceLine.dates })),
      });
      b.add835('remit.835', wrap(b, [remitFor(b, 'A', [original], 1), remitFor(b, 'A', [reversalOf(original), corrected], 2)]), 'Transaction 1 pays a claim; transaction 2 reverses it and pays the correction in full.');
    },
  },
  {
    id: 'V05',
    slug: 'plb-wo-several',
    title: 'Several WO recoupments over two PLB segments',
    build: (b) => {
      const claims = [randomClaim(b, 1, 'SYNPLAN-COMM-01', undefined, 3), randomClaim(b, 2, 'SYNPLAN-COMM-01', undefined, 3), randomClaim(b, 3, 'SYNPLAN-COMM-01', undefined, 3)];
      const adjustments = [
        plb([{ code: 'WO', reference: 'SYNCCNPRIOR0501', amount: dollars('12.34') }, { code: 'WO', reference: 'SYNCCNPRIOR0502', amount: dollars('20.00') }]),
        plb([{ code: 'WO', reference: 'SYNCCNPRIOR0503', amount: dollars('7.50') }]),
      ];
      b.add835(
        'remit.835',
        wrap(b, [remitFor(b, 'B', claims, 1, { providerAdjustments: adjustments })]),
        'Three WO recoupments in two PLB segments.',
        {},
        (parse) => ({ ...parse, toleratedByParser: 'two PLB segments in one transaction: the PLB segment repeats; pyx12 counts each as a new footer loop and rejects the second' }),
        { valid: false, rejections: ['segment'] },
      );
    },
  },
  {
    id: 'V06',
    slug: 'plb-fb-both-signs',
    title: 'A forward balance carried and one resolved',
    build: (b) => {
      const claims = [randomClaim(b, 1, 'SYNPLAN-COMM-01', undefined, 3), randomClaim(b, 2, 'SYNPLAN-COMM-01', undefined, 3)];
      single(b, 'B', claims, 'FB 30.00 taking back an earlier balance and FB -12.00 carrying a new one.', {}, { providerAdjustments: [plb([{ code: 'FB', reference: 'SYNFWDBAL0601', amount: dollars('30.00') }, { code: 'FB', reference: 'SYNFWDBAL0602', amount: dollars('-12.00') }])] });
    },
  },
  {
    id: 'V07',
    slug: 'plb-l6-interest',
    title: 'L6 interest with claim-level AMT I',
    build: (b) => {
      const base = randomClaim(b, 1, 'SYNPLAN-COMM-01');
      const withInterest: Claim = { ...base, amounts: [...(base.amounts ?? []), { qualifier: 'I', amount: dollars('4.11') }] };
      single(b, 'C', [withInterest, randomClaim(b, 2, 'SYNPLAN-COMM-01')], 'Interest paid as PLB L6 (negative) with the claim carrying AMT I.', {}, { providerAdjustments: [plb([{ code: 'L6', reference: withInterest.payerClaimControlNumber, amount: dollars('-4.11') }])] });
    },
  },
  {
    id: 'V08',
    slug: 'plb-72-authorized-return',
    title: 'A 72 authorized return',
    build: (b) => {
      single(b, 'C', [randomClaim(b, 1, 'SYNPLAN-COMM-01', undefined, 3), randomClaim(b, 2, 'SYNPLAN-COMM-01', undefined, 3)], 'A PLB 72 authorized return of 15.25.', {}, { providerAdjustments: [plb([{ code: '72', reference: 'SYNRETURN0801', amount: dollars('15.25') }])] });
    },
  },
  {
    id: 'V09',
    slug: 'plb-mixed-codes',
    title: 'WO, FB, L6 and 72 together',
    build: (b) => {
      const claims = Array.from({ length: 5 }, (_, index) => randomClaim(b, index + 1, 'SYNPLAN-COMM-01', undefined, 3));
      const adjustments = [
        plb([
          { code: 'WO', reference: 'SYNCCNPRIOR0901', amount: dollars('25.00') },
          { code: 'FB', reference: 'SYNFWDBAL0901', amount: dollars('10.00') },
          { code: 'L6', amount: dollars('-1.37') },
          { code: '72', reference: 'SYNRETURN0901', amount: dollars('5.00') },
          { code: 'WO', reference: 'SYNCCNPRIOR0902', amount: dollars('2.50') },
          { code: 'FB', reference: 'SYNFWDBAL0902', amount: dollars('-3.00') },
        ]),
      ];
      single(b, 'D', claims, 'A PLB segment with six adjustments: WO, FB, L6, 72, WO and FB.', {}, { providerAdjustments: adjustments });
    },
  },
  {
    id: 'V10',
    slug: 'zero-check-all-denied',
    title: 'A zero check: every claim denied',
    build: (b) => {
      const denied = [1, 2, 3].map((n) => {
        const charge = dollars(`${String(100 + n * 10)}.00`);
        return therapyClaim(b.world, { caseId: b.info.id, n, status: '4', plan: 'SYNPLAN-COMM-01', lines: [line({ code: '97110', units: '2', charge, dates: { kind: 'single', date: calendarDate(2026, 3, 2) }, adjustments: [{ group: 'CO', items: [{ reason: '45', amount: charge }] }] })] });
      });
      single(b, 'D', denied, 'Three denied claims; BPR02 0.00, BPR01 H, BPR04 NON.', {}, { method: 'NON' });
    },
  },
  {
    id: 'V11',
    slug: 'provider-adjustments-only',
    title: 'No claims: a recoupment netted to zero by a forward balance',
    build: (b) => {
      single(b, 'D', [], 'No LX loop at all: PLB WO 40.00 and FB -40.00, BPR02 0.00.', {}, { method: 'NON', providerAdjustments: [plb([{ code: 'WO', reference: 'SYNCCNPRIOR1101', amount: dollars('40.00') }, { code: 'FB', reference: 'SYNFWDBAL1101', amount: dollars('-40.00') }])] });
    },
  },
  {
    id: 'V12',
    slug: 'mixed-payment-methods',
    title: 'ACH, check and non-payment transactions in one file',
    build: (b) => {
      const ach = remitFor(b, 'E', [randomClaim(b, 1, 'SYNPLAN-E')], 1, { method: 'ACH' });
      const check = remitFor(b, 'E', [randomClaim(b, 2, 'SYNPLAN-E')], 2, { method: 'CHK' });
      const deniedCharge = dollars('95.00');
      const denied = therapyClaim(b.world, { caseId: b.info.id, n: 3, status: '4', plan: 'SYNPLAN-E', lines: [line({ code: '97140', units: '1', charge: deniedCharge, dates: { kind: 'single', date: calendarDate(2026, 3, 9) }, adjustments: [{ group: 'CO', items: [{ reason: '45', amount: deniedCharge }] }] })] });
      const none = remitFor(b, 'E', [denied], 3, { method: 'NON' });
      b.add835('remit.835', wrap(b, [ach, check, none]), 'Three transaction sets paid by ACH, by check and not paid (NON).');
    },
  },
  {
    id: 'V13',
    slug: 'wire-and-financial-institution-option',
    title: 'FWT and BOP payment methods',
    build: (b) => {
      b.add835('remit.835', wrap(b, [remitFor(b, 'E', [randomClaim(b, 1, 'SYNPLAN-E')], 1, { method: 'FWT' }), remitFor(b, 'E', [randomClaim(b, 2, 'SYNPLAN-E')], 2, { method: 'BOP' })]), 'A wire transfer (FWT) and a financial institution option (BOP) payment.');
    },
  },
  {
    id: 'V14',
    slug: 'institutional-no-lines',
    title: 'Institutional-style claims with no service lines',
    build: (b) => {
      const claims = [1, 2].map((n) => {
        const charge = dollars(`${String(1200 + n * 150)}.00`);
        const contractual = dollars(`${String(400 + n * 25)}.00`);
        const deductible = dollars('150.00');
        return therapyClaim(b.world, {
          caseId: b.info.id,
          n,
          plan: 'SYNPLAN-INST-01',
          facilityCode: '13',
          frequencyCode: '1',
          charge,
          lines: [],
          adjustments: [{ group: 'CO', items: [{ reason: '45', amount: contractual }] }, { group: 'PR', items: [{ reason: '1', amount: deductible }] }],
          statementFrom: calendarDate(2026, 2, 2),
          statementTo: calendarDate(2026, 2, 27),
          au: true,
          outpatient: { reimbursementRate: '0.85', hcpcsPayable: dollars('610.00'), remarks: ['N901'] },
        });
      });
      single(b, 'F', claims, 'Two institutional-style claims (CLP08 13) with claim-level CAS, MOA and statement dates, and no SVC.');
    },
  },
  {
    id: 'V15',
    slug: 'revenue-code-lines',
    title: 'Lines carrying revenue codes',
    build: (b) => {
      const date = calendarDate(2026, 3, 16);
      const lines = [
        line({ code: '97110', units: '3', charge: dollars('240.00'), allowed: dollars('180.00'), patientShare: [{ reason: '2', amount: dollars('36.00') }], revenueCode: '0420', dates: { kind: 'single', date } }),
        line({ qualifier: 'NU', code: '0420', units: '1', charge: dollars('60.00'), allowed: dollars('45.00'), dates: { kind: 'single', date } }),
      ];
      single(b, 'F', [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-INST-01', facilityCode: '13', lines })], 'A line with a revenue code in SVC04 and a line whose procedure is a revenue code (NU).');
    },
  },
  {
    id: 'V16',
    slug: 'modifier-positions',
    title: 'One, two, three and four modifiers',
    build: (b) => {
      const date = calendarDate(2026, 4, 6);
      const sets = [['GP'], ['GP', '59'], ['GP', '59', 'KX'], ['GP', '59', 'KX', 'CQ']];
      const lines = sets.map((modifiers) => therapyLine(b.world, { code: '97140', modifiers, date }));
      single(b, 'G', [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 'Four 97140 lines with one to four modifiers.');
    },
  },
  {
    id: 'V17',
    slug: 'decimal-units',
    title: 'Fractional and large unit counts',
    build: (b) => {
      const date = calendarDate(2026, 4, 13);
      const units = ['0.5', '1.25', '2.75', '10'];
      const lines = units.map((unit, index) => line({ code: TIMED_CODES[index] ?? '97110', units: unit, charge: dollars(`${String(20 * (index + 1))}.00`), allowed: dollars(`${String(15 * (index + 1))}.00`), dates: { kind: 'single', date }, originalUnits: index === 0 ? '1' : undefined }));
      single(b, 'G', [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 'Units 0.5, 1.25, 2.75 and 10; the first line was billed as 1 (SVC07).');
    },
  },
  {
    id: 'V18',
    slug: 'service-periods',
    title: 'Service periods across a month end',
    build: (b) => {
      const lines = [
        line({ code: '97110', units: '6', charge: dollars('480.00'), allowed: dollars('330.00'), patientShare: [{ reason: '2', amount: dollars('66.00') }], dates: { kind: 'period', from: calendarDate(2026, 3, 27), to: calendarDate(2026, 4, 3) } }),
        line({ code: '97530', units: '2', charge: dollars('190.00'), allowed: dollars('130.00'), dates: { kind: 'period', from: calendarDate(2026, 4, 1), to: calendarDate(2026, 4, 2) } }),
      ];
      single(b, 'H', [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 'DTM 150 and 151 service periods, one crossing a month end.');
    },
  },
  {
    id: 'V19',
    slug: 'unknown-codes',
    title: 'Unknown reason and remark codes at claim and line level',
    build: (b) => {
      const date = calendarDate(2026, 4, 20);
      const lines = [
        line({ code: '97110', units: '2', charge: dollars('160.00'), allowed: dollars('110.00'), extraAdjustments: [{ group: 'OA', items: [{ reason: 'Z900', amount: dollars('5.00') }] }], dates: { kind: 'single', date }, remarks: [{ qualifier: 'HE', code: 'Z9001' }, { qualifier: 'HE', code: 'N901' }] }),
        line({ code: '97140', units: '1', charge: dollars('80.00'), allowed: dollars('60.00'), dates: { kind: 'single', date } }),
      ];
      const claim1 = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines, adjustments: [{ group: 'PI', items: [{ reason: 'Z901', amount: dollars('2.00') }] }], outpatient: { remarks: ['Z9002', 'MA901'] } });
      single(b, 'H', [claim1], 'Unknown CARCs Z900 (line) and Z901 (claim) and unknown remark codes Z9001 (LQ) and Z9002 (MOA), beside known ones.');
    },
  },
  {
    id: 'V20',
    slug: 'crlf-line-endings',
    title: 'CRLF after every segment terminator',
    build: (b) => single(b, 'A', [randomClaim(b, 1, 'SYNPLAN-COMM-01'), randomClaim(b, 2, 'SYNPLAN-COMM-01')], 'Windows line endings, no byte-order mark.', { lineEnding: '\r\n' }),
  },
  {
    id: 'V21',
    slug: 'byte-order-mark',
    title: 'A UTF-8 byte-order mark',
    build: (b) => single(b, 'A', [randomClaim(b, 1, 'SYNPLAN-COMM-01')], 'A byte-order mark before ISA, no line breaks.', { bom: true }),
  },
  {
    id: 'V22',
    slug: 'lf-line-endings',
    title: 'LF after every segment terminator',
    build: (b) => single(b, 'B', [randomClaim(b, 1, 'SYNPLAN-COMM-01'), randomClaim(b, 2, 'SYNPLAN-COMM-01')], 'A line feed after every segment.', { lineEnding: '\n' }),
  },
  {
    id: 'V23',
    slug: 'trimmed-amounts',
    title: 'Amounts written without trailing zeros',
    build: (b) => {
      const date = calendarDate(2026, 5, 4);
      const lines = [
        line({ code: '97110', units: '2', charge: dollars('100.00'), allowed: dollars('80.50'), patientShare: [{ reason: '3', amount: dollars('0.50') }], dates: { kind: 'single', date } }),
        line({ code: '97140', units: '1', charge: dollars('60.00'), allowed: dollars('60.00'), dates: { kind: 'single', date } }),
      ];
      single(b, 'B', [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 'Amounts as "100", "80.5" and ".5".', { amountStyle: 'trimmed' }, { providerAdjustments: [plb([{ code: 'L6', amount: dollars('-0.10') }])] });
    },
  },
  {
    id: 'V24',
    slug: 'payer-id-format-change',
    title: 'One payer whose identifier changes format between files',
    build: (b) => {
      const world = b.world;
      const base = basicsOf(world, 'K');
      const first = remittance({ payer: { ...base.payer, refs: [{ qualifier: '2U', value: '00042' }] }, payee: base.payee, claims: [randomClaim(b, 1, 'SYNPLAN-K')], paymentDate: base.paid, trace: traceNumber(b.info.id, 1), originatorId: world.originatorId('K') }, world);
      const second = remittance({ payer: { ...base.payer, refs: [{ qualifier: '2U', value: '42' }], id: { qualifier: 'XV', value: 'SYNPLANID42' } }, payee: base.payee, claims: [randomClaim(b, 2, 'SYNPLAN-K')], paymentDate: addDays(base.paid, 28), trace: traceNumber(b.info.id, 2), originatorId: world.originatorId('K') }, world);
      b.add835('january.835', { interchanges: [envelopeOf([first], { isa13: controlNumber(b.info.id, 1), date: base.paid })] }, 'The payer sends REF 2U 00042.');
      b.add835('february.835', { interchanges: [envelopeOf([second], { isa13: controlNumber(b.info.id, 2), date: addDays(base.paid, 28) })] }, 'The same payer sends REF 2U 42 and an N1 XV identifier.');
      b.outcome({ payerIdentifiers: 'both raw forms reach the mapping queue as sent; the parser does not merge them' });
    },
  },
  {
    id: 'V25',
    slug: 'trace-reused',
    title: 'A payer reusing a trace number on another day',
    build: (b) => {
      const world = b.world;
      const base = basicsOf(world, 'R');
      const trace = traceNumber(b.info.id, 1);
      const first = remittance({ payer: base.payer, payee: base.payee, claims: [randomClaim(b, 1, 'SYNPLAN-R')], paymentDate: base.paid, trace, originatorId: world.originatorId('R') }, world);
      const later = addDays(base.paid, 14);
      const second = remittance({ payer: base.payer, payee: base.payee, claims: [randomClaim(b, 2, 'SYNPLAN-R')], paymentDate: later, trace, originatorId: world.originatorId('R') }, world);
      b.add835('first.835', { interchanges: [envelopeOf([first], { isa13: controlNumber(b.info.id, 1), date: base.paid })] }, 'A remittance with trace T.');
      b.add835('second.835', { interchanges: [envelopeOf([second], { isa13: controlNumber(b.info.id, 2), date: later })] }, 'Two weeks later, a different remittance with the same trace T (different ISA13, BPR02 and BPR16).');
      b.upload({ step: 1, file: 'first.835', filename: 'first.835', outcome: 'loaded', remittancesLoaded: 1, claimsLoaded: 1, receipt: { duplicate: false } });
      b.upload({ step: 2, file: 'second.835', filename: 'second.835', outcome: 'loaded_for_review', remittancesLoaded: 1, claimsLoaded: 1, linkedTo: 1, receipt: { duplicate: false, review: 'TRN02 already seen for this payer and payee with another BPR16 date' } });
    },
  },
  {
    id: 'V26',
    slug: 'every-segment',
    title: 'Every segment the writer supports',
    build: (b) => {
      const world = b.world;
      const base = basicsOf(world, 'S');
      const date = calendarDate(2026, 5, 11);
      const lines = [
        line({
          code: '97110',
          modifiers: ['GP'],
          units: '2',
          charge: dollars('160.00'),
          allowed: dollars('112.00'),
          patientShare: [{ reason: '2', amount: dollars('22.40') }],
          dates: { kind: 'single', date },
          b6: true,
          originalProcedure: { qualifier: 'HC', code: '97112' },
          originalUnits: '2',
          refs: [{ qualifier: '6R', value: 'SYNLINE0001' }, { qualifier: 'LU', value: 'SYNLOC01' }, { qualifier: 'HPI', value: world.npi() }, { qualifier: '0K', value: 'SYNPOLICY01' }],
          amounts: [{ qualifier: 'KH', amount: dollars('0.00') }],
          quantities: [{ qualifier: 'ZL', value: '1' }],
          remarks: [{ qualifier: 'HE', code: 'N902' }, { qualifier: 'RX', code: 'SYNRX01' }],
        }),
      ];
      const claim1 = therapyClaim(world, {
        caseId: b.info.id,
        n: 1,
        plan: 'SYNPLAN-COMM-01',
        lines,
        insured: { entity: '1', last: 'SYNTHINSURED', first: 'SYNTHETIC', id: { qualifier: 'MI', value: 'SYNMBR00000099' } },
        correctedPatient: { entity: '1', last: 'SYNTHCORRECTED', first: 'SYNTHETIC', id: { qualifier: 'C', value: 'SYNMBR00000098' } },
        renderingRefs: [{ qualifier: '0B', value: 'SYNLIC0001' }],
        refs: [{ qualifier: '1L', value: 'SYNGROUP01' }, { qualifier: 'EA', value: 'SYNMRN0001' }],
        statementFrom: date,
        statementTo: date,
        receivedDate: addDays(date, 3),
        contacts: [{ name: 'SYNTHETIC CLAIMS DESK', numbers: [{ qualifier: 'TE', value: '5555550142' }] }],
        au: true,
        quantities: [{ qualifier: 'CA', value: '1' }],
        inpatient: { coveredDaysOrVisits: '1', remark: 'MA901' },
        outpatient: { reimbursementRate: '0.8', hcpcsPayable: dollars('89.60'), remarks: ['N901'] },
      });
      const remit = remittance(
        {
          payer: { ...base.payer, id: { qualifier: 'XV', value: 'SYNPLANIDS' }, businessContact: { name: 'SYNTHETIC PROVIDER SERVICES', numbers: [{ qualifier: 'TE', value: '5555550111' }] }, technicalContacts: [...base.payer.technicalContacts, { numbers: [{ qualifier: 'EM', value: 'edi@synthetic.invalid' }] }], website: 'WWW.SYNTHETIC.INVALID/PAYER' },
          payee: { ...base.payee, refs: [...(base.payee.refs ?? []), { qualifier: 'PQ', value: 'SYNPAYEE01' }] },
          claims: [claim1],
          paymentDate: addDays(date, 20),
          trace: traceNumber(b.info.id, 1),
          originatorId: world.originatorId('S'),
          productionDate: addDays(date, 19),
          currency: 'USD',
          receiverId: 'SYNRECEIVER01',
        },
        world,
      );
      b.add835('remit.835', wrap(b, [{ ...remit, versionId: 'SYNVERSION1' }]), 'CUR, REF EV and F2, DTM 405, payer XV id, three kinds of PER, payee PQ, NM1 IL, 74 and 82, MIA, MOA, claim REF, DTM 232, 233 and 050, claim PER, AMT and QTY, SVC06 and SVC07, line REF, AMT B6 and KH, LQ HE and RX.');
    },
  },
  {
    id: 'V27',
    slug: 'production-usage-indicator',
    title: 'ISA15 P',
    build: (b) => {
      b.add835('remit.835', wrap(b, [remitFor(b, 'T', [randomClaim(b, 1, 'SYNPLAN-COMM-01')], 1)], 1, 'P'), 'A synthetic file marked as production data (ISA15 P); the sender is still SYNTHSENDER.');
    },
  },
  {
    id: 'V28',
    slug: 'secondary-and-tertiary',
    title: 'Secondary and tertiary claims',
    build: (b) => {
      const date = calendarDate(2026, 5, 18);
      const statuses = ['2', '3'] as const;
      const claims = statuses.map((status, index) =>
        therapyClaim(b.world, {
          caseId: b.info.id,
          n: index + 1,
          status,
          plan: `SYNPLAN-SEC-0${String(index + 1)}`,
          lines: [line({ code: '97110', units: '2', charge: dollars('150.00'), dates: { kind: 'single', date }, adjustments: [{ group: 'CO', items: [{ reason: '45', amount: dollars('40.00') }] }, { group: 'OA', items: [{ reason: '23', amount: dollars('88.00') }] }] })],
        }),
      );
      single(b, 'U', claims, 'A secondary (CLP02 2) and a tertiary (CLP02 3) claim, each with OA-23.');
    },
  },
  {
    id: 'V29',
    slug: 'payer-initiated-and-other-adjustments',
    title: 'PI and OA adjustments and partial denials',
    build: (b) => {
      const date = calendarDate(2026, 5, 25);
      const lines = [
        line({ code: '97530', units: '2', charge: dollars('180.00'), allowed: dollars('120.00'), extraAdjustments: [{ group: 'PI', items: [{ reason: '45', amount: dollars('10.00') }] }], dates: { kind: 'single', date } }),
        line({ code: '97140', units: '1', charge: dollars('80.00'), dates: { kind: 'single', date }, adjustments: [{ group: 'OA', items: [{ reason: '23', amount: dollars('80.00') }] }] }),
      ];
      single(b, 'U', [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 'A PI adjustment beside CO-45, and a line fully adjusted under OA.');
    },
  },
  {
    id: 'V31',
    slug: 'debit-negative-payment',
    title: 'A negative check: recoupments above the claims, debited from the provider',
    build: (b) => {
      const claims = [randomClaim(b, 1, 'SYNPLAN-COMM-01', calendarDate(2026, 6, 1), 1)];
      single(b, 'V', claims, 'PLB WO larger than the claims paid with no forward balance: BPR03 D, BPR02 the magnitude of the negative net.', {}, {
        handling: 'I',
        creditDebit: 'D',
        providerAdjustments: [plb([{ code: 'WO', reference: 'SYNCCNPRIOR3101', amount: dollars('400.00') }])],
      });
    },
  },
  {
    id: 'V32',
    slug: 'cas-six-adjustments',
    title: 'CAS segments carrying all six adjustments, at claim and line level',
    build: (b) => {
      const date = calendarDate(2026, 6, 8);
      for (const offByOneCent of [false, true]) {
        // Claim 1: claim-level CAS with six adjustments (the last an unknown CARC) and a line without CAS.
        const claimCas = sixAdjustments('CO', ['45', '23', '1', '2', '3', 'Z906'], ['20.00', '6.00', '5.00', '4.00', '3.00', '2.00'], offByOneCent);
        const claimLine = line({ code: '97110', units: '2', charge: dollars('200.00'), paid: dollars('160.00'), adjustments: [], dates: { kind: 'single', date } });
        const claim1 = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines: [claimLine], adjustments: [claimCas], paid: dollars('160.00') });
        // Claim 2: a line whose PR CAS carries six adjustments (the last an unknown CARC): its patient share and observed allowed are all six.
        const lineCas = sixAdjustments('PR', ['1', '2', '3', '23', '45', 'Z907'], ['10.00', '9.00', '8.00', '7.00', '6.00', '5.00'], offByOneCent);
        const sharedLine = line({ code: '97140', units: '3', charge: dollars('240.00'), paid: dollars('150.00'), adjustments: [{ group: 'CO', items: [{ reason: '45', amount: dollars('45.00') }] }, lineCas], dates: { kind: 'single', date } });
        const claim2 = therapyClaim(b.world, { caseId: b.info.id, n: 2, plan: 'SYNPLAN-COMM-01', lines: [sharedLine], paid: dollars('150.00') });
        const file = wrap(b, [remitFor(b, 'W', [claim1, claim2], offByOneCent ? 2 : 1)], offByOneCent ? 2 : 1);
        b.add835(
          offByOneCent ? 'off-by-one-cent.835' : 'balanced.835',
          file,
          offByOneCent
            ? 'The same claims with the sixth adjustment of each CAS (CAS17 and CAS18) one cent larger: both claims and the line are held by -0.01.'
            : 'A claim-level CAS and a line-level PR CAS each carrying six reason, amount and quantity triples (CAS02 to CAS19), balanced.',
        );
      }
    },
  },
  {
    id: 'V33',
    slug: 'b6-beside-claim-patient-share',
    title: 'Claim-level patient share with one line carrying AMT B6 and one not',
    build: (b) => {
      const date = calendarDate(2026, 6, 15);
      const lines = [
        line({ code: '97110', units: '2', charge: dollars('100.00'), paid: dollars('60.00'), adjustments: [], b6: dollars('80.00'), dates: { kind: 'single', date } }),
        line({ code: '97140', units: '2', charge: dollars('100.00'), paid: dollars('60.00'), adjustments: [], dates: { kind: 'single', date } }),
      ];
      const claim1 = therapyClaim(b.world, {
        caseId: b.info.id,
        n: 1,
        plan: 'SYNPLAN-COMM-01',
        lines,
        adjustments: [{ group: 'CO', items: [{ reason: '45', amount: dollars('40.00') }] }, { group: 'PR', items: [{ reason: '2', amount: dollars('40.00') }] }],
        au: true,
      });
      single(b, 'W', [claim1], 'CLP 200.00 paid 120.00 with claim-level CO-45 40.00 and PR-2 40.00; line 1 carries AMT B6 80.00, line 2 none: line 2 is allowed 80.00 (its pro-rata share of the PR), never 100.00.');
    },
  },
  {
    id: 'V34',
    slug: 'newline-terminator-blank-line',
    title: 'A line feed as the segment terminator, with a blank line after IEA',
    build: (b) => {
      const newline = { element: '*', component: ':', repetition: '^', segment: '\n' } as const;
      const remit = remitFor(b, 'X', [randomClaim(b, 1, 'SYNPLAN-COMM-01'), randomClaim(b, 2, 'SYNPLAN-COMM-01')], 1);
      const file = (n: number): File835 => ({ interchanges: [envelopeOf([remit], { isa13: controlNumber(b.info.id, n), date: remit.payment.date, delimiters: newline })] });
      b.add835('blank-line.835', file(1), 'ISA106 is a line feed, and one more line feed follows IEA.', { trailingWhitespace: '\n' });
      b.add835('blank-crlf.835', file(2), 'ISA106 is a line feed, and a carriage return and a line feed follow IEA.', { trailingWhitespace: '\r\n' });
    },
  },
  {
    id: 'V35',
    slug: 'invalid-structure-codes',
    title: "Values outside the 835 structure's own code sets",
    build: (b) => {
      const date = calendarDate(2026, 6, 22);
      const base = (n: number, claim = randomClaim(b, n, 'SYNPLAN-COMM-01', date, 1), extra: Partial<Parameters<typeof remittance>[0]> = {}): Remittance835 => remitFor(b, 'Y', [claim], n, extra);
      const fileOf = (remit: Remittance835, n: number): File835 => ({ interchanges: [envelopeOf([remit], { isa13: controlNumber(b.info.id, n), date: remit.payment.date })] });

      // CAS01 XX on the line's contractual adjustment (the patient share keeps PR).
      const casClaim = randomClaim(b, 1, 'SYNPLAN-COMM-01', date, 1);
      const [casLine] = casClaim.lines;
      const badCas: Claim = { ...casClaim, lines: casClaim.lines.map((serviceLine) => ({ ...serviceLine, adjustments: serviceLine.adjustments.map((segment) => (segment.group === 'CO' ? { ...segment, group: 'XX' as AdjustmentGroup } : segment)) })) };
      if (casLine?.adjustments[0]?.group !== 'CO') {
        throw new Error('V35 expects the line to open with CO-45');
      }
      invalidCode(b, 'cas01.835', fileOf(base(1, badCas), 1), 'CAS01 XX, an adjustment group outside CO, OA, PI and PR.', 'segment', (parse) => ({
        code: 'EDI_SYNTAX',
        reason: 'invalid_code',
        segmentIndex: parse.transactions[0]?.claims[0]?.lines[0]?.adjustments[0]?.segmentIndex ?? 0,
        segmentId: 'CAS',
        elementPosition: 1,
      }));

      // CLP02 99, a claim status outside the structure's set.
      const statusClaim: Claim = { ...randomClaim(b, 2, 'SYNPLAN-COMM-01', date, 1), status: '99' as ClaimStatusCode };
      invalidCode(b, 'clp02.835', fileOf(base(2, statusClaim), 2), 'CLP02 99, a claim status the structure does not have.', 'element', (parse) => ({
        code: 'EDI_SYNTAX',
        reason: 'invalid_code',
        segmentIndex: parse.transactions[0]?.claims[0]?.segmentIndex ?? 0,
        segmentId: 'CLP',
        elementPosition: 2,
      }));

      // PLB03-01 ZZ, a provider adjustment reason outside the structure's set.
      const plbRemit = base(3, undefined, { providerAdjustments: [plb([{ code: 'ZZ', reference: 'SYNREF3503', amount: dollars('10.00') }])] });
      invalidCode(b, 'plb03.835', fileOf(plbRemit, 3), 'PLB03-01 ZZ, a provider adjustment reason the structure does not have.', 'element', (parse) => ({
        code: 'EDI_SYNTAX',
        reason: 'invalid_code',
        segmentIndex: parse.transactions[0]?.plb[0]?.segmentIndex ?? 0,
        segmentId: 'PLB',
        elementPosition: 3,
        componentPosition: 1,
      }));

      // BPR04 XYZ, a payment method outside ACH, BOP, CHK, FWT and NON.
      const ach = base(4);
      const methodRemit: Remittance835 = { ...ach, payment: { ...ach.payment, method: 'XYZ' as Remittance835['payment']['method'] } };
      const methodFile = fileOf(methodRemit, 4);
      invalidCode(b, 'bpr04.835', methodFile, 'BPR04 XYZ, a payment method the structure does not have.', 'element', () => ({ code: 'EDI_SYNTAX', reason: 'invalid_code', segmentIndex: indexOf(methodFile, 'BPR'), segmentId: 'BPR', elementPosition: 4 }));
      b.note('Only CARC and RARC (the external lists a rule release carries) load flagged when unknown; a value outside one of the structure\'s own sets holds its transaction set, as pyx12 rejects it.');
    },
  },
  {
    id: 'V30',
    slug: 'eight-transactions',
    title: 'Eight transaction sets of five claims',
    build: (b) => {
      const remits = Array.from({ length: 8 }, (_, t) => remitFor(b, b.world.random.pick(['A', 'B', 'C']), Array.from({ length: 5 }, (_, index) => randomClaim(b, t * 100 + index + 1, 'SYNPLAN-COMM-01', undefined, 1 + (index % 2))), t + 1, { method: t % 3 === 0 ? 'CHK' : 'ACH' }));
      b.add835('remit.835', wrap(b, remits), 'One interchange carrying eight payments of five claims each.');
    },
  },
];
