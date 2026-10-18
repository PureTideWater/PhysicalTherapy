/**
 * Parser and loader cases (test matrix PAR-01 to PAR-30): each writes its 835 files and the exact
 * outcome the parser and loader must produce.
 */
import { type Cents, addCents, centsToString, negateCents, subtractCents, sumCents } from '@tp/money';

import { type CalendarDate, addDays, calendarDate } from '../core/dates';
import { sha256 } from '../core/json';
import { type EdiErrorExpectation, type ParseExpectation, type ZipEntryExpectation } from '../expected/types';
import { readZip, writeZip } from '../formats/zip';
import { SynthWorld, dollars, envelopeOf, line, remittance, reversalOf, singleTransactionFile } from '../x12/factory';
import { type Claim, type File835, type Remittance835 } from '../x12/model';
import { wrongTransactionDocument } from '../x12/other';
import { renderDocument, segmentText } from '../x12/segments';
import { type CaseBuilder, type RenderedX12, render835, summarySha256, x12Expectation } from './builder';
import { controlNumber, paymentDateAfter, serviceDate, therapyClaim, therapyLine, traceNumber } from './common';

export const NON_DEFAULT_DELIMITERS = { element: '|', component: '>', repetition: '!', segment: "'" } as const;

export interface Basics {
  payer: ReturnType<SynthWorld['payer']>;
  payee: ReturnType<SynthWorld['payee']>;
  date: CalendarDate;
  paid: CalendarDate;
}

export function basicsOf(world: SynthWorld, payerKey = 'A', payeeKey = '01'): Basics {
  const date = serviceDate(world);
  return { payer: world.payer(payerKey), payee: world.payee(payeeKey), date, paid: paymentDateAfter(world, date) };
}

export function basics(b: CaseBuilder, payerKey = 'A', payeeKey = '01'): Basics {
  return basicsOf(b.world, payerKey, payeeKey);
}

export function remittanceOf(world: SynthWorld, caseId: string, base: Basics, claims: readonly Claim[], n: number, extra: Partial<Parameters<typeof remittance>[0]> = {}): Remittance835 {
  const method = extra.method ?? 'ACH';
  return remittance(
    {
      payer: base.payer,
      payee: base.payee,
      claims,
      paymentDate: base.paid,
      trace: traceNumber(caseId, n, method),
      originatorId: world.originatorId(base.payer.name.slice(-1)),
      productionDate: addDays(base.paid, -1),
      ...extra,
    },
    world,
  );
}

export function oneRemittance(b: CaseBuilder, base: Basics, claims: readonly Claim[], n: number, extra: Partial<Parameters<typeof remittance>[0]> = {}): Remittance835 {
  return remittanceOf(b.world, b.info.id, base, claims, n, extra);
}

export function file(b: CaseBuilder, remittance835: Remittance835, n: number, date: CalendarDate, extra: Partial<Parameters<typeof singleTransactionFile>[1]> = {}): File835 {
  return singleTransactionFile(remittance835, { isa13: controlNumber(b.info.id, n), date, ...extra });
}

/** PAR-01's remittance, rebuilt from PAR-01's seed by PAR-04 and PAR-05 so they can be compared with it. */
function minimalFile(world: SynthWorld = new SynthWorld('tp-synth/PAR-01')): File835 {
  const base = basicsOf(world);
  const claim1 = therapyClaim(world, {
    caseId: 'PAR-01',
    n: 1,
    plan: 'SYNPLAN-COMM-01',
    lines: [therapyLine(world, { code: '97110', units: 2, modifiers: ['GP'], date: base.date, unitCharge: 8000n, allowed: 11000n })],
  });
  return singleTransactionFile(remittanceOf(world, 'PAR-01', base, [claim1], 1), { isa13: controlNumber('PAR-01', 1), date: base.paid });
}

export function par01(b: CaseBuilder): void {
  b.add835('remit.835', minimalFile(b.world), 'One interchange, one transaction, one claim with one line (97110 x 2).');
}

export function par02(b: CaseBuilder): void {
  const base = basics(b);
  const first = oneRemittance(b, base, [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date })] })], 1);
  const secondDate = addDays(base.date, 7);
  const second = oneRemittance(
    b,
    base,
    [
      therapyClaim(b.world, { caseId: b.info.id, n: 2, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97140', date: secondDate }), therapyLine(b.world, { code: '97530', date: secondDate })] }),
      therapyClaim(b.world, { caseId: b.info.id, n: 3, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97112', units: 3, date: secondDate, share: 'copay' })] }),
    ],
    2,
    { method: 'CHK' },
  );
  b.add835('remit.835', { interchanges: [envelopeOf([first, second], { isa13: controlNumber(b.info.id, 1), date: base.paid })] }, 'One interchange, one group, two transaction sets (an EFT and a check).');
}

export function par03(b: CaseBuilder): void {
  const base = basics(b);
  const one = oneRemittance(b, base, [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97110', date: base.date })] })], 1);
  const two = oneRemittance(b, base, [therapyClaim(b.world, { caseId: b.info.id, n: 2, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97530', units: 2, date: base.date })] })], 2);
  b.add835(
    'remit.835',
    { interchanges: [envelopeOf([one], { isa13: controlNumber(b.info.id, 1), date: base.paid }), envelopeOf([two], { isa13: controlNumber(b.info.id, 2), date: base.paid })] },
    'Two interchanges in one file, ISA13 differing.',
  );
}

export function par04(b: CaseBuilder): void {
  const source = minimalFile();
  const changed: File835 = { interchanges: source.interchanges.map((interchange) => ({ ...interchange, delimiters: NON_DEFAULT_DELIMITERS })) };
  b.add835('remit.835', changed, "PAR-01's remittance with delimiters | > ! and ' (element, component, repetition, segment).");
  b.scenario({ parsesIdenticallyTo: 'PAR-01/remit.835', delimiters: NON_DEFAULT_DELIMITERS });
}

export function par05(b: CaseBuilder): void {
  b.add835('remit.835', minimalFile(), "PAR-01's remittance with a UTF-8 byte-order mark and CRLF after every segment terminator.", { bom: true, lineEnding: '\r\n' });
  b.scenario({ parsesIdenticallyTo: 'PAR-01/remit.835' });
}

export function routineFile(b: CaseBuilder, n: number, plan = 'SYNPLAN-COMM-01'): File835 {
  const base = basics(b);
  const claims = [1, 2].map((index) =>
    therapyClaim(b.world, {
      caseId: b.info.id,
      n: n * 10 + index,
      plan,
      lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date }), therapyLine(b.world, { code: '97140', date: base.date, share: index === 2 ? 'copay' : 'coinsurance' })],
    }),
  );
  return file(b, oneRemittance(b, base, claims, n), n, base.paid);
}

export function par06(b: CaseBuilder): void {
  b.add835('remit.835', routineFile(b, 1), 'A routine remittance, uploaded twice with the same bytes.');
  b.upload({ step: 1, file: 'remit.835', filename: 'remit.835', outcome: 'loaded', remittancesLoaded: 1, claimsLoaded: 2, receipt: { duplicate: false } });
  b.upload({ step: 2, file: 'remit.835', filename: 'remit.835', outcome: 'duplicate_document', remittancesLoaded: 0, claimsLoaded: 0, linkedTo: 1, receipt: { duplicate: true } });
}

export function par07(b: CaseBuilder): void {
  const remit = routineFile(b, 1);
  b.add835('original.835', remit, 'The remittance as first downloaded: no line breaks.');
  b.add835('resent.835', remit, 'The same remittance resent: a line break after every segment and a different filename, so the bytes and the hash differ.', { lineEnding: '\n' });
  b.upload({ step: 1, file: 'original.835', filename: 'original.835', outcome: 'loaded', remittancesLoaded: 1, claimsLoaded: 2, receipt: { duplicate: false } });
  b.upload({ step: 2, file: 'resent.835', filename: 'ERA-resent-copy.835', outcome: 'duplicate_remittance', remittancesLoaded: 0, claimsLoaded: 0, linkedTo: 1, receipt: { duplicate: true } });
}

export function par08(b: CaseBuilder): void {
  const base = basics(b);
  const patient = b.world.patient();
  const original = therapyClaim(b.world, {
    caseId: b.info.id,
    n: 1,
    patient,
    plan: 'SYNPLAN-COMM-01',
    lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date, unitCharge: 8000n, allowed: 9000n }), therapyLine(b.world, { code: '97140', date: base.date, unitCharge: 7500n, allowed: 4500n })],
  });
  b.add835('original.835', file(b, oneRemittance(b, base, [original], 1), 1, base.paid), 'The original payment of the claim.');
  const later = addDays(base.paid, 35);
  const corrected = therapyClaim(b.world, {
    caseId: b.info.id,
    n: 2,
    patient,
    patientControlNumber: original.patientControlNumber,
    plan: 'SYNPLAN-COMM-01',
    frequencyCode: '7',
    refs: [{ qualifier: 'F8', value: original.payerClaimControlNumber }],
    lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date, unitCharge: 8000n, allowed: 11000n }), therapyLine(b.world, { code: '97140', date: base.date, unitCharge: 7500n, allowed: 5500n })],
  });
  const reprocess = oneRemittance(b, { ...base, paid: later }, [reversalOf(original), corrected], 2);
  b.add835('correction.835', file(b, reprocess, 2, later), 'A later remittance: the reversal (CLP02 22) of the original claim, then the corrected claim (REF F8 names the original).', {}, (parse) =>
    linkClaims(parse, { reversal: 0, correction: 1, original: { file: 'original.835', transaction: 0, claim: 0 } }),
  );
  b.upload({ step: 1, file: 'original.835', filename: 'original.835', outcome: 'loaded', remittancesLoaded: 1, claimsLoaded: 1, receipt: { duplicate: false } });
  b.upload({ step: 2, file: 'correction.835', filename: 'correction.835', outcome: 'loaded', remittancesLoaded: 1, claimsLoaded: 2, receipt: { duplicate: false } });
  b.outcome({
    netView: { claims: [{ file: 'correction.835', transaction: 0, claim: 1 }], paidCents: centsToString(corrected.paid) },
    note: 'The reversal links to the original claim; the corrected claim supersedes it; the net view shows the corrected claim alone.',
  });
}

export function linkClaims(parse: ParseExpectation, links: { reversal: number; correction: number; original: { file: string; transaction: number; claim: number } }): ParseExpectation {
  return {
    ...parse,
    transactions: parse.transactions.map((transaction) => ({
      ...transaction,
      claims: transaction.claims.map((item) => {
        if (item.index === links.reversal) {
          return { ...item, reversalOf: links.original };
        }
        if (item.index === links.correction) {
          return { ...item, supersedes: links.original };
        }
        return item;
      }),
    })),
  };
}

export function par09(b: CaseBuilder): void {
  const base = basics(b);
  const paidClaim = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date })] });
  const denialLines = [
    line({ code: '97530', units: '2', charge: dollars('180.00'), dates: { kind: 'single', date: base.date }, adjustments: [{ group: 'CO', items: [{ reason: '45', amount: dollars('180.00') }] }], remarks: [{ qualifier: 'HE', code: 'N901' }] }),
    line({ code: '97140', units: '1', charge: dollars('85.00'), dates: { kind: 'single', date: base.date }, adjustments: [{ group: 'CO', items: [{ reason: '45', amount: dollars('85.00') }] }], remarks: [{ qualifier: 'HE', code: 'N902' }] }),
  ];
  const denied = therapyClaim(b.world, { caseId: b.info.id, n: 2, status: '4', plan: 'SYNPLAN-COMM-01', lines: denialLines });
  b.add835('remit.835', file(b, oneRemittance(b, base, [paidClaim, denied], 1), 1, base.paid), 'A paid claim and a denied claim (CLP02 4) paying zero, with CAS on every line.');
}

export function par10(b: CaseBuilder): void {
  const base = basics(b);
  const lines = [
    line({ code: '97110', units: '2', charge: dollars('160.00'), paid: dollars('88.00'), adjustments: [], dates: { kind: 'single', date: base.date } }),
    line({ code: '97530', units: '1', charge: dollars('95.00'), paid: dollars('48.00'), adjustments: [], dates: { kind: 'single', date: base.date } }),
  ];
  const claimLevel = therapyClaim(b.world, {
    caseId: b.info.id,
    n: 1,
    plan: 'SYNPLAN-COMM-01',
    lines,
    adjustments: [
      { group: 'CO', items: [{ reason: '45', amount: dollars('85.00') }] },
      { group: 'PR', items: [{ reason: '2', amount: dollars('34.00') }] },
    ],
  });
  b.add835('remit.835', file(b, oneRemittance(b, base, [claimLevel], 1), 1, base.paid), 'Adjustments at claim level only: the lines carry charge and paid with no CAS; the claim carries CO-45 and PR-2.');
  b.note('Observed allowed: the claim-level PR is allocated to the lines in proportion to their charges, cents truncated and the remainder given one cent at a time to the first lines (docs/adr/0021); each line is flagged allocatedFromClaim.');
}

export function par11(b: CaseBuilder): void {
  const base = basics(b);
  const claim1 = therapyClaim(b.world, {
    caseId: b.info.id,
    n: 1,
    plan: 'SYNPLAN-COMM-01',
    lines: [therapyLine(b.world, { code: '97110', units: 3, date: base.date }), therapyLine(b.world, { code: '97112', date: base.date }), therapyLine(b.world, { code: '97530', units: 2, date: base.date, share: 'none' })],
  });
  b.add835('remit.835', file(b, oneRemittance(b, base, [claim1], 1), 1, base.paid), 'Adjustments at line level only (CO-45 and PR-2 on each line); no claim-level CAS.');
}

export function par12(b: CaseBuilder): void {
  const base = basics(b);
  const claim1 = therapyClaim(b.world, {
    caseId: b.info.id,
    n: 1,
    plan: 'SYNPLAN-COMM-01',
    au: true,
    lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date, b6: true }), therapyLine(b.world, { code: '97140', date: base.date, b6: true }), therapyLine(b.world, { code: '97530', date: base.date })],
  });
  b.add835('remit.835', file(b, oneRemittance(b, base, [claim1], 1), 1, base.paid), 'Two lines with AMT B6 (observed allowed basis amt_b6) and one without (paid_plus_pr); AMT AU on the claim.');
}

export function par13(b: CaseBuilder): void {
  const base = basics(b);
  const split = line({
    code: '97110',
    units: '2',
    charge: dollars('170.00'),
    allowed: dollars('120.00'),
    patientShare: [
      { reason: '1', amount: dollars('40.00') },
      { reason: '2', amount: dollars('16.00') },
      { reason: '3', amount: dollars('20.00') },
    ],
    dates: { kind: 'single', date: base.date },
  });
  const separate = line({
    code: '97140',
    units: '1',
    charge: dollars('90.00'),
    dates: { kind: 'single', date: base.date },
    adjustments: [
      { group: 'CO', items: [{ reason: '45', amount: dollars('30.00') }] },
      { group: 'PR', items: [{ reason: '1', amount: dollars('25.00') }] },
      { group: 'PR', items: [{ reason: '3', amount: dollars('15.00') }] },
    ],
  });
  const claim1 = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines: [split, separate] });
  b.add835('remit.835', file(b, oneRemittance(b, base, [claim1], 1), 1, base.paid), 'Patient responsibility split across PR-1, PR-2 and PR-3: three triplets in one CAS on one line, two PR CAS segments on the other.');
  b.outcome({ patientShareCents: { line1: '7600', line2: '4000', claim: '11600' } });
}

export function par14(b: CaseBuilder): void {
  const base = basics(b);
  const claim1 = therapyClaim(b.world, {
    caseId: b.info.id,
    n: 1,
    plan: 'SYNPLAN-COMM-01',
    lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date, unitCharge: 9000n, allowed: 10400n }), therapyLine(b.world, { code: '97530', date: base.date, unitCharge: 9500n, allowed: 5600n })],
  });
  b.add835('remit.835', file(b, oneRemittance(b, base, [claim1], 1), 1, base.paid), 'CO-45 contractual write-offs on both lines.');
  b.note('Milestone 2 asserts the CO-45 adjustments are stored; milestone 5 computes the variance against the expected allowed amount.');
}

export function par15(b: CaseBuilder): void {
  const base = basics(b);
  const secondaryLine = line({
    code: '97110',
    units: '2',
    charge: dollars('160.00'),
    dates: { kind: 'single', date: base.date },
    adjustments: [
      { group: 'CO', items: [{ reason: '45', amount: dollars('50.00') }] },
      { group: 'OA', items: [{ reason: '23', amount: dollars('88.00') }] },
    ],
  });
  const secondary = therapyClaim(b.world, { caseId: b.info.id, n: 1, status: '2', filingIndicator: '12', plan: 'SYNPLAN-SECONDARY-01', lines: [secondaryLine] });
  b.add835('remit.835', file(b, oneRemittance(b, base, [secondary], 1), 1, base.paid), 'A secondary remittance: CLP02 2 with OA-23 for the prior payer and the coinsurance paid.', {}, (parse) => ({
    ...parse,
    pricing: [{ transaction: 0, claim: 0, line: 0, unpricedReason: 'SECONDARY_PAYER', milestone: 5 }],
  }));
  b.note('Milestone 2 asserts claim status 2 and the OA-23 adjustment; milestone 5 leaves the line unpriced with SECONDARY_PAYER.');
}

function plbCase(b: CaseBuilder, items: { code: string; reference?: string; amount: Cents }[], description: string, extra: { method?: Remittance835['payment']['method'] } = {}): void {
  const base = basics(b);
  const claims = [1, 2].map((index) =>
    therapyClaim(b.world, { caseId: b.info.id, n: index, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date }), therapyLine(b.world, { code: '97530', date: base.date })] }),
  );
  const plb = [{ providerId: base.payee.id.value, fiscalPeriodDate: calendarDate(2026, 12, 31), items: items.map((item) => ({ ...item, reference: item.reference ?? claims[0]?.payerClaimControlNumber })) }];
  b.add835('remit.835', file(b, oneRemittance(b, base, claims, 1, { providerAdjustments: plb, ...extra }), 1, base.paid), description);
}

export function par16(b: CaseBuilder): void {
  plbCase(b, [{ code: 'WO', reference: 'SYNCCNPRIOR0001', amount: dollars('75.00') }], 'A PLB WO recoupment of 75.00 against an earlier claim; BPR02 is the claims paid minus it.');
}

export function par17(b: CaseBuilder): void {
  plbCase(b, [{ code: 'FB', reference: 'SYNFWDBAL0001', amount: dollars('40.00') }], 'A PLB FB forward balance of 40.00: recorded, balanced, never counted as recovered or recouped.');
}

export function par18(b: CaseBuilder): void {
  plbCase(b, [{ code: 'L6', amount: dollars('-3.42') }], 'A PLB L6 interest payment of 3.42 (negative: it increases the payment).');
}

export function par19(b: CaseBuilder): void {
  const base = basics(b);
  const claims = [1, 2].map((index) => therapyClaim(b.world, { caseId: b.info.id, n: index, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date, unitCharge: 8000n, allowed: 11250n })] }));
  const claimsPaid = sumCents(claims.map((item) => item.paid));
  const forward = subtractCents(dollars('250.00'), claimsPaid);
  const zero = oneRemittance(b, base, claims, 1, {
    method: 'NON',
    providerAdjustments: [
      {
        providerId: base.payee.id.value,
        fiscalPeriodDate: calendarDate(2026, 12, 31),
        items: [
          { code: 'WO', reference: 'SYNCCNPRIOR0019', amount: dollars('250.00') },
          { code: 'FB', reference: 'SYNFWDBAL0019', amount: negateCents(forward) },
        ],
      },
    ],
  });
  b.add835('zero-check.835', file(b, zero, 1, base.paid), 'A recoupment (WO 250.00) larger than the claims paid; the remainder is carried forward (FB) and the check is zero (BPR01 H, BPR04 NON).');
  const claims2 = [3, 4].map((index) => therapyClaim(b.world, { caseId: b.info.id, n: index, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97530', units: 2, date: base.date })] }));
  const smaller = oneRemittance(b, base, claims2, 2, {
    method: 'CHK',
    providerAdjustments: [{ providerId: base.payee.id.value, fiscalPeriodDate: calendarDate(2026, 12, 31), items: [{ code: 'WO', reference: 'SYNCCNPRIOR0020', amount: dollars('120.00') }] }],
  });
  b.add835('reduced-check.835', file(b, smaller, 2, base.paid), 'A recoupment that makes the check smaller than the sum of its claims.');
  b.note('PLB amounts carry the X12 sign: a recoupment is positive and reduces BPR02; the plan\'s "negative PLB" is that reduction (docs/adr/0021).');
}

export function par20(b: CaseBuilder): void {
  const base = basics(b);
  const claims = [1, 2].map((index) => therapyClaim(b.world, { caseId: b.info.id, n: index, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: '97110', units: 2, date: base.date })] }));
  const claimsPaid = sumCents(claims.map((item) => item.paid));
  b.add835('unbalanced-transaction.835', file(b, oneRemittance(b, base, claims, 1, { amount: addCents(claimsPaid, dollars('1.00')) }), 1, base.paid), 'BPR02 is 1.00 more than the claims paid: the transaction is held with a difference of -1.00 at BPR02.');
  const goodLine = therapyLine(b.world, { code: '97140', date: base.date });
  const offClaim = therapyClaim(b.world, { caseId: b.info.id, n: 3, plan: 'SYNPLAN-COMM-01', lines: [goodLine], paid: addCents(goodLine.paid, dollars('5.00')) });
  b.add835('unbalanced-claim.835', file(b, oneRemittance(b, base, [offClaim], 2), 2, base.paid), 'One claim pays 5.00 more than its charge minus its adjustments: held at CLP04 with a difference of -5.00.');
  b.note('A held transaction loads nothing: no remittance, claim, line or adjustment row.');
}

export function par21(b: CaseBuilder): void {
  const base = basics(b);
  const unknownLine = line({
    code: '97110',
    units: '2',
    charge: dollars('150.00'),
    allowed: dollars('100.00'),
    patientShare: [{ reason: '2', amount: dollars('20.00') }],
    extraAdjustments: [{ group: 'CO', items: [{ reason: 'Z999', amount: dollars('12.50') }] }],
    dates: { kind: 'single', date: base.date },
  });
  const claim1 = therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines: [unknownLine, therapyLine(b.world, { code: '97140', date: base.date })] });
  b.add835('remit.835', file(b, oneRemittance(b, base, [claim1], 1), 1, base.paid), 'A CAS reason code (Z999) that no SYNTHETIC code list holds: loaded, flagged and listed on the receipt.');
}

export function par22(b: CaseBuilder): void {
  const base = basics(b);
  const lines = [
    line({ code: '97110', modifiers: ['59', 'KX', 'CQ', 'CO'], units: '1.5', charge: dollars('120.00'), allowed: dollars('84.00'), patientShare: [{ reason: '2', amount: dollars('16.80') }], dates: { kind: 'single', date: base.date }, originalUnits: '2' }),
    line({ code: '97530', modifiers: ['KX'], units: '0.25', charge: dollars('22.50'), allowed: dollars('15.75'), patientShare: [{ reason: '2', amount: dollars('3.15') }], dates: { kind: 'single', date: base.date } }),
  ];
  b.add835('remit.835', file(b, oneRemittance(b, base, [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 1), 1, base.paid), 'Units 1.5 and 0.25 (SVC05) and a line with four modifiers in SVC01-3 to SVC01-6.');
}

export function par23(b: CaseBuilder): void {
  const base = basics(b);
  const to = addDays(base.date, 4);
  const lines = [
    line({ code: '97110', units: '4', charge: dollars('320.00'), allowed: dollars('220.00'), patientShare: [{ reason: '2', amount: dollars('44.00') }], dates: { kind: 'period', from: base.date, to } }),
    line({ code: '97140', units: '1', charge: dollars('75.00'), allowed: dollars('52.00'), patientShare: [{ reason: '2', amount: dollars('10.40') }], dates: { kind: 'single', date: to } }),
  ];
  const remit1 = oneRemittance(b, base, [therapyClaim(b.world, { caseId: b.info.id, n: 1, plan: 'SYNPLAN-COMM-01', lines })], 1);
  b.add835('range-150-151.835', file(b, remit1, 1, base.paid), 'A service period as the 5010 transaction writes one (DTM 150 and 151) and a single date (DTM 472).');
  const rangeLines = [line({ code: '97110', units: '4', charge: dollars('320.00'), allowed: dollars('220.00'), patientShare: [{ reason: '2', amount: dollars('44.00') }], dates: { kind: 'rd8', from: base.date, to } })];
  const remit2 = oneRemittance(b, base, [therapyClaim(b.world, { caseId: b.info.id, n: 2, plan: 'SYNPLAN-COMM-01', lines: rangeLines })], 2);
  const rendered = render835(file(b, remit2, 2, base.paid));
  const built = x12Expectation(file(b, remit2, 2, base.paid), rendered, false, { valid: false, rejections: ['element'] });
  b.addX12Bytes('range-472-rd8.835', rendered.bytes, 'DTM 472 with the RD8 range qualifier in DTM05 and DTM06, as the test matrix names the case. The parser reads the range; pyx12 rejects the elements the 5010 structure does not use.', {
    ...built,
    parse: { ...built.parse, toleratedByParser: 'DTM 472 carrying RD8 and a CCYYMMDD-CCYYMMDD range in DTM05 and DTM06: read as the service period' },
  });
}

export function par24(b: CaseBuilder): void {
  const date = paymentDateAfter(b.world, serviceDate(b.world));
  for (const kind of ['277', '837'] as const) {
    const document = wrongTransactionDocument({ kind, isa13: controlNumber(b.info.id, kind === '277' ? 1 : 2), date, payerName: 'SYNTHETIC PAYER A', providerName: 'SYNTHETIC THERAPY GROUP 01' });
    const text = renderDocument(document);
    const error: EdiErrorExpectation = { code: 'EDI_NOT_835', segmentIndex: 3, segmentId: 'ST', elementPosition: 1, expected: '835', found: kind };
    b.addX12Bytes(kind === '277' ? 'claim-status-277.835' : 'claim-837.835', new Uint8Array(Buffer.from(text, 'utf8')), `A ${kind} interchange uploaded with an .835 name.`, {
      oracle: { valid: false, rejections: ['not_835'], summary: null },
      parse: heldDocument(error),
    });
  }
  b.note('PAR-24 names the 277; PRD section 10 also lists an 837 uploaded by mistake, so both are here.');
}

export function heldDocument(error: EdiErrorExpectation): ParseExpectation {
  return {
    outcome: 'held',
    documentErrors: [error],
    transactions: [],
    receipt: { transactions: 0, claims: 0, lines: 0, reversals: 0, plbTotalCents: '0', held: [], unknownCodes: [], loaded: { transactions: 0, claims: 0, lines: 0 } },
  };
}

/**
 * The text of a rendered file cut inside segment `index` (from 0, in the first interchange) after
 * `keep` characters of element `element`, and the EDI_SYNTAX error the parser must report: the
 * segment input ended in (its index counting ISA as 1) and the element it was reading.
 */
export function truncateInside(rendered: RenderedX12, index: number, element: number, keep: number): { text: string; error: EdiErrorExpectation } {
  const interchange = rendered.document.interchanges[0];
  const target = interchange?.segments[index];
  if (!interchange || !target) {
    throw new Error('nothing to truncate');
  }
  const delimiters = interchange.delimiters;
  const before = renderDocument({ interchanges: [{ delimiters, segments: interchange.segments.slice(0, index) }] });
  const parts = segmentText(target, delimiters).split(delimiters.element);
  const partial = [...parts.slice(0, element), (parts[element] ?? '').slice(0, keep)].join(delimiters.element);
  return { text: before + partial, error: { code: 'EDI_SYNTAX', segmentIndex: index + 1, segmentId: target.id, elementPosition: element, reason: 'truncated' } };
}

function lastIndexOf(rendered: RenderedX12, id: string): number {
  const segments = rendered.document.interchanges[0]?.segments ?? [];
  return segments.map((segment) => segment.id).lastIndexOf(id);
}

export function par25(b: CaseBuilder): void {
  const rendered = render835(routineFile(b, 1));
  const { text, error } = truncateInside(rendered, lastIndexOf(rendered, 'CLP'), 3, 2);
  b.addX12Bytes('truncated.835', new Uint8Array(Buffer.from(text, 'utf8')), "A remittance cut off inside the last claim's CLP03: no terminator, no SE, GE or IEA.", {
    oracle: { valid: false, rejections: ['missing_segment'], summary: null },
    parse: heldDocument(error),
  });
}

export function par26(b: CaseBuilder): void {
  const source = routineFile(b, 1);
  const rendered = render835(source);
  const count = rendered.document.interchanges[0]?.segments.filter((segment) => segment.id !== 'ISA' && segment.id !== 'GS' && segment.id !== 'GE' && segment.id !== 'IEA').length ?? 0;
  const wrong: File835 = {
    interchanges: source.interchanges.map((interchange) => ({
      ...interchange,
      groups: interchange.groups.map((group) => ({ ...group, transactions: group.transactions.map((transaction) => ({ ...transaction, seCountOverride: count - 1 })) })),
    })),
  };
  const wrongRendered = render835(wrong);
  const built = x12Expectation(wrong, wrongRendered, false, { valid: false, rejections: ['control_count'] });
  b.addX12Bytes('remit.835', wrongRendered.bytes, `SE01 says ${String(count - 1)} segments; the transaction has ${String(count)}.`, built);
}

export function smallRemittance(b: CaseBuilder, n: number, date: CalendarDate): File835 {
  const base: Basics = { payer: b.world.payer('A'), payee: b.world.payee('01'), date, paid: addDays(date, 21) };
  const one = therapyClaim(b.world, { caseId: b.info.id, n, plan: 'SYNPLAN-COMM-01', lines: [therapyLine(b.world, { code: b.world.random.pick(['97110', '97140', '97530']), units: b.world.random.int(1, 3), date })] });
  return file(b, oneRemittance(b, base, [one], n), n, base.paid);
}

export const PAR27_BAD_ENTRY = 137;

export function par27(b: CaseBuilder): void {
  const entries: { name: string; bytes: Uint8Array }[] = [];
  const expectations: ZipEntryExpectation[] = [];
  const start = calendarDate(2026, 1, 5);
  for (let n = 1; n <= 500; n += 1) {
    const name = `remit-${String(n).padStart(3, '0')}.835`;
    const source = smallRemittance(b, n, addDays(start, n % 200));
    const rendered = render835(source);
    if (n === PAR27_BAD_ENTRY) {
      const { text, error } = truncateInside(rendered, lastIndexOf(rendered, 'SVC'), 2, 3);
      const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
      const oracle = { valid: false, rejections: ['missing_segment' as const], summary: null };
      entries.push({ name, bytes });
      expectations.push({ name, sha256: sha256(bytes), bytes: bytes.length, kind: 'x12', outcome: 'held', oracle, x12: { oracle, parse: heldDocument(error) } });
      continue;
    }
    const x12 = x12Expectation(source, rendered, false);
    entries.push({ name, bytes: rendered.bytes });
    const summary = x12.oracle.summary;
    expectations.push({
      name,
      sha256: sha256(rendered.bytes),
      bytes: rendered.bytes.length,
      kind: 'x12',
      outcome: 'parsed',
      oracle: { valid: true, rejections: [], summary: null, summarySha256: summary === null ? undefined : summarySha256(summary) },
      x12: n === 1 ? x12 : undefined,
    });
  }
  const archive = writeZip(entries);
  if (readZip(archive).length !== 500) {
    throw new Error('the PAR-27 archive does not read back');
  }
  b.addFile('batch.zip', archive, 'zip', `Five hundred 835s in one zip; entry ${String(PAR27_BAD_ENTRY)} is cut off halfway.`, {
    zip: { entries: expectations, batch: { entries: 500, parsed: 499, held: 1, quarantined: 0, zipQuarantined: false } },
  });
  b.note('Every entry but the first and the bad one records the SHA-256 of its oracle summary (canonical JSON) instead of the summary itself, to keep this file small.');
}

/** Bytes that begin like an ELF executable: what a renamed program looks like to the sniff. Not a program. */
export function renamedExecutableBytes(): Uint8Array {
  const header = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const filler = Buffer.from('SYNTHETIC renamed-executable fixture: an ELF magic number and filler, never a runnable program.\n'.repeat(8), 'ascii');
  return new Uint8Array(Buffer.concat([header, Buffer.alloc(8), filler]));
}

export function par28(b: CaseBuilder): void {
  const executable = renamedExecutableBytes();
  const valid = smallRemittance(b, 2, calendarDate(2026, 3, 9));
  const rendered = render835(valid);
  const x12 = x12Expectation(valid, rendered, false);
  const archive = writeZip([
    { name: 'remit-001.835', bytes: executable },
    { name: 'remit-002.835', bytes: rendered.bytes },
  ]);
  b.addFile('upload.zip', archive, 'zip', 'A zip holding a renamed executable (remit-001.835 starts with the ELF magic number) beside a valid 835.', {
    zip: {
      entries: [
        { name: 'remit-001.835', sha256: sha256(executable), bytes: executable.length, kind: 'executable', outcome: 'quarantined' },
        { name: 'remit-002.835', sha256: sha256(rendered.bytes), bytes: rendered.bytes.length, kind: 'x12', outcome: 'quarantined', oracle: x12.oracle },
      ],
      batch: { entries: 2, parsed: 0, held: 0, quarantined: 2, zipQuarantined: true },
    },
  });
  b.note('The whole upload is quarantined: the valid 835 beside the executable is not parsed either.');
}

export function par30(b: CaseBuilder): void {
  b.add835('remit.835', routineFile(b, 1), 'One remittance, uploaded twice at the same time.');
  b.upload({ step: 1, file: 'remit.835', filename: 'remit.835', outcome: 'loaded', remittancesLoaded: 1, claimsLoaded: 2, receipt: { duplicate: false } });
  b.upload({ step: 2, file: 'remit.835', filename: 'remit (1).835', concurrentWith: 1, outcome: 'duplicate_document', remittancesLoaded: 0, claimsLoaded: 0, linkedTo: 1, receipt: { duplicate: true } });
  b.outcome({ remittanceRows: 1, note: 'Either upload may finish first; whichever does loads, and the other is the duplicate. Exactly one remittance row exists.' });
}

export { minimalFile };
