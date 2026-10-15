import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { calendarDate } from '../core/dates';
import { SYNTH_ISA06 } from '../identity';
import { balancingPayment, documentFor835, formatX12Amount, paymentAmount, transactionBody } from './build835';
import { SynthWorld, claim, dollars, envelopeOf, line, remittance, reversalOf, singleTransactionFile } from './factory';
import { type File835, type Remittance835 } from './model';
import { wrongTransactionDocument } from './other';
import { DEFAULT_DELIMITERS, X12BuildError, checkDelimiters, renderDocument, seg, segmentText } from './segments';
import { SummaryError, summarize835 } from './summary';

const date = calendarDate(2026, 3, 2);

function sample(world = new SynthWorld('x12-test'), overrides: Partial<Parameters<typeof remittance>[0]> = {}): Remittance835 {
  const lines = [
    line({ code: '97110', units: '2', charge: dollars('160.00'), allowed: dollars('110.00'), patientShare: [{ reason: '2', amount: dollars('22.00') }], dates: { kind: 'single', date }, b6: true }),
    line({ code: '97140', modifiers: ['GP', '59'], units: '1', charge: dollars('80.00'), allowed: dollars('60.00'), dates: { kind: 'period', from: date, to: calendarDate(2026, 3, 4) } }),
  ];
  const claim1 = claim({ patientControlNumber: 'SYNPCN1', payerClaimControlNumber: 'SYNCCN1', patient: world.patient(), lines, au: true });
  return remittance({ payer: world.payer('A'), payee: world.payee('01'), claims: [claim1], paymentDate: date, trace: 'SYNEFT1', originatorId: '1SYN00000A', ...overrides }, world);
}

function file(remit: Remittance835, extra: Partial<Parameters<typeof singleTransactionFile>[1]> = {}): File835 {
  return singleTransactionFile(remit, { isa13: 123, date, ...extra });
}

describe('segments', () => {
  it('drops trailing empty elements and components but keeps ISA fixed width', () => {
    expect(segmentText(seg('CLP', 'A', '1', undefined, '', null), DEFAULT_DELIMITERS)).toBe('CLP*A*1');
    expect(segmentText(seg('SVC', ['HC', '97110', '', '', '', ''], '1.00'), DEFAULT_DELIMITERS)).toBe('SVC*HC:97110*1.00');
    const isa = documentFor835(file(sample())).interchanges[0]?.segments[0];
    expect(isa && `${segmentText(isa, DEFAULT_DELIMITERS)}~`).toHaveLength(106);
    expect(isa?.elements[5]).toEqual([SYNTH_ISA06]);
  });

  it('refuses a value holding a delimiter, and ISA11 or ISA16 that are not the separators', () => {
    expect(() => segmentText(seg('NM1', 'QC', '1', 'A*B'), DEFAULT_DELIMITERS)).toThrow(X12BuildError);
    const isa = seg('ISA', '00', '', '', '', '', '', '', '', '', '', '!', '', '', '', '', ':');
    expect(() => segmentText(isa, DEFAULT_DELIMITERS)).toThrow(/ISA11/);
    const isa16 = seg('ISA', '00', '', '', '', '', '', '', '', '', '', '^', '', '', '', '', '>');
    expect(() => segmentText(isa16, DEFAULT_DELIMITERS)).toThrow(/ISA16/);
  });

  it('checks delimiters are four distinct single punctuation characters', () => {
    expect(() => checkDelimiters({ ...DEFAULT_DELIMITERS, element: 'A' })).toThrow(X12BuildError);
    expect(() => checkDelimiters({ ...DEFAULT_DELIMITERS, element: '**' })).toThrow(X12BuildError);
    expect(() => checkDelimiters({ ...DEFAULT_DELIMITERS, component: '*' })).toThrow(/differ/);
  });

  it('renders line endings and a byte-order mark on request', () => {
    const document = documentFor835(file(sample()));
    expect(renderDocument(document, { lineEnding: '\r\n', bom: true })).toMatch(/^\uFEFFISA\*.*~\r\nGS\*/s);
    expect(renderDocument(document, { trailingWhitespace: '\r\n' })).toMatch(/IEA\*1\*\d{9}~\r\n$/);
    expect(() => renderDocument(document, { trailingWhitespace: 'x' })).toThrow(/whitespace/);
  });
});

describe('the 835 writer', () => {
  it('counts and matches control numbers', () => {
    const remit = sample();
    const two: File835 = { interchanges: [envelopeOf([remit, remit], { isa13: 7, gs06: 70, date })] };
    const segments = documentFor835(two).interchanges[0]?.segments ?? [];
    const ids = segments.map((segment) => segment.id);
    expect(ids.filter((id) => id === 'ST')).toHaveLength(2);
    const body = transactionBody(remit).length;
    expect(segments.filter((segment) => segment.id === 'SE').map((segment) => segment.elements)).toEqual([[[String(body + 2)], ['0001']], [[String(body + 2)], ['0002']]]);
    expect(segments.find((segment) => segment.id === 'GE')?.elements).toEqual([['2'], ['70']]);
    expect(segments.find((segment) => segment.id === 'IEA')?.elements).toEqual([['1'], ['000000007']]);
  });

  it('derives BPR02 from claims paid minus provider adjustments, its magnitude on a debit', () => {
    const remit = sample(undefined, { providerAdjustments: [{ providerId: 'P', fiscalPeriodDate: date, items: [{ code: 'WO', amount: dollars('10.00') }, { code: 'L6', amount: dollars('-1.50') }] }] });
    expect(balancingPayment(remit)).toBe(dollars('139.50'));
    expect(paymentAmount(remit)).toBe(dollars('139.50'));
    const debit = { ...remit, payment: { ...remit.payment, creditDebit: 'D' as const } };
    expect(paymentAmount(debit)).toBe(dollars('-139.50'));
    expect(paymentAmount({ ...remit, payment: { ...remit.payment, amount: dollars('1.00') } })).toBe(dollars('1.00'));
  });

  it('writes amounts fixed or trimmed', () => {
    expect([formatX12Amount(dollars('100.00')), formatX12Amount(dollars('100.00'), 'trimmed'), formatX12Amount(dollars('80.50'), 'trimmed'), formatX12Amount(cents(50n), 'trimmed'), formatX12Amount(cents(-5n), 'trimmed'), formatX12Amount(cents(0n), 'trimmed')]).toEqual([
      '100.00',
      '100',
      '80.5',
      '.5',
      '-.05',
      '0',
    ]);
  });

  it('refuses shapes the 835 cannot carry', () => {
    const world = new SynthWorld('refuse');
    const base = sample(world);
    const firstClaim = base.claimGroups[0]?.claims[0];
    if (!firstClaim) {
      throw new Error('no claim');
    }
    const tooManyModifiers = line({ code: '97110', modifiers: ['A1', 'A2', 'A3', 'A4', 'A5'], charge: dollars('1.00'), dates: { kind: 'none' } });
    expect(() => transactionBody({ ...base, claimGroups: [{ headerNumber: 1, claims: [{ ...firstClaim, lines: [tooManyModifiers] }] }] })).toThrow(/four modifiers/);
    const tooManyItems = { group: 'CO' as const, items: Array.from({ length: 7 }, () => ({ reason: '45', amount: dollars('1.00') })) };
    expect(() => transactionBody({ ...base, claimGroups: [{ headerNumber: 1, claims: [{ ...firstClaim, adjustments: [tooManyItems] }] }] })).toThrow(/one to six/);
    expect(() => transactionBody({ ...base, claimGroups: [{ headerNumber: 1, claims: [] }] })).toThrow(/at least one claim/);
    expect(() => transactionBody({ ...base, payer: { ...base.payer, technicalContacts: [] } })).toThrow(/technical contact/);
    expect(() => transactionBody({ ...base, payer: { ...base.payer, refs: [{ qualifier: 'ZZ', value: 'X' }] } })).toThrow(/REF qualifier ZZ/);
    expect(() => transactionBody({ ...base, providerAdjustments: [{ providerId: 'P', fiscalPeriodDate: date, items: [] }] })).toThrow(/PLB/);
    expect(() => documentFor835(file(base, { isa13: 0 }))).toThrow(/ISA13/);
    expect(() => documentFor835({ interchanges: [{ ...envelopeOf([base], { isa13: 1, date }), receiverId: 'lower case' }] })).toThrow(/ISA08/);
    expect(() => documentFor835({ interchanges: [{ ...envelopeOf([base], { isa13: 1, date }), time: '9' }] })).toThrow(/ISA10/);
    expect(() => documentFor835(file(base, { st02: '1' }))).toThrow(/ST02/);
    expect(() => claim({ patientControlNumber: 'P', payerClaimControlNumber: 'C', patient: world.patient(), lines: [] })).toThrow(/charge/);
    expect(() => dollars('1.5')).toThrow(/dollars/);
  });

  it('orders line references by their loop group', () => {
    const remit = sample();
    const firstClaim = remit.claimGroups[0]?.claims[0];
    const withRefs = line({ code: '97110', charge: dollars('1.00'), dates: { kind: 'none' }, refs: [{ qualifier: '0K', value: 'P' }, { qualifier: '6R', value: 'L' }, { qualifier: 'LU', value: 'S' }] });
    const body = transactionBody({ ...remit, claimGroups: [{ headerNumber: 1, claims: [{ ...(firstClaim ?? ({} as never)), lines: [withRefs] }] }] });
    expect(body.filter((segment) => segment.id === 'REF' && ['0K', '6R', 'LU'].includes(segment.elements[0]?.[0] ?? '')).map((segment) => segment.elements[0]?.[0])).toEqual(['LU', '6R', '0K']);
  });

  it('negates every amount of a reversal and keeps its control numbers', () => {
    const original = sample().claimGroups[0]?.claims[0];
    if (!original) {
      throw new Error('no claim');
    }
    const reversal = reversalOf(original);
    expect([reversal.status, reversal.charge, reversal.paid, reversal.payerClaimControlNumber]).toEqual(['22', dollars('-240.00'), dollars('-148.00'), original.payerClaimControlNumber]);
    expect(reversal.lines[0]?.adjustments[0]?.items[0]?.amount).toBe(dollars('-50.00'));
  });

  it('writes non-835 interchanges for the wrong-transaction cases', () => {
    const text = renderDocument(wrongTransactionDocument({ kind: '277', isa13: 5, date, payerName: 'P', providerName: 'Q' }));
    expect(text).toContain('~GS*HN*SYNTH*');
    expect(text).toContain('~ST*277*0001*005010X214~');
    expect(renderDocument(wrongTransactionDocument({ kind: '837', isa13: 6, date, payerName: 'P', providerName: 'Q' }))).toContain('~ST*837*0001*005010X222A1~');
  });
});

describe('the oracle summary', () => {
  it('sums CAS by group and reason, and computes every balance', () => {
    const summary = summarize835(documentFor835(file(sample())));
    const transaction = summary.interchanges[0]?.groups[0]?.transactions[0];
    expect(transaction?.claims[0]?.lines[0]?.cas).toEqual({ 'CO-45': '5000', 'PR-2': '2200' });
    expect(transaction?.claims[0]?.balance).toEqual({ claimDifferenceCents: '0', lineChargeDifferenceCents: '0', balanced: true });
    expect(transaction?.balance).toMatchObject({ claimsPaidCents: '14800', paymentCents: '14800', differenceCents: '0', balanced: true, claimsBalanced: true });
    expect(transaction?.claims[0]?.lines[1]?.dates).toEqual([
      { qualifier: '150', date: '2026-03-02', format: null, period: null },
      { qualifier: '151', date: '2026-03-04', format: null, period: null },
    ]);
  });

  it('checks lines without CAS only when the claim carries none either, and counts a debit payment negative', () => {
    const world = new SynthWorld('summary');
    const lines = [line({ code: '97110', charge: dollars('100.00'), paid: dollars('70.00'), adjustments: [], dates: { kind: 'none' } })];
    const claimLevel = claim({ patientControlNumber: 'P', payerClaimControlNumber: 'C', patient: world.patient(), lines, adjustments: [{ group: 'CO', items: [{ reason: '45', amount: dollars('30.00') }] }] });
    const remit = remittance({ payer: world.payer('A'), payee: world.payee('01'), claims: [claimLevel], paymentDate: date, trace: 'T', originatorId: '1SYN00000A', amount: dollars('70.00') }, world);
    const debit = { ...remit, payment: { ...remit.payment, creditDebit: 'D' as const } };
    const transaction = summarize835(documentFor835(file(debit))).interchanges[0]?.groups[0]?.transactions[0];
    expect(transaction?.claims[0]?.lines[0]?.differenceCents).toBeNull();
    expect(transaction?.claims[0]?.balance.balanced).toBe(true);
    expect(transaction?.balance).toMatchObject({ paymentCents: '-7000', differenceCents: '14000', balanced: false });
    const noClaimCas = { ...claimLevel, adjustments: [] };
    const unbalanced = summarize835(documentFor835(file({ ...remit, claimGroups: [{ headerNumber: 1, claims: [noClaimCas] }] }))).interchanges[0]?.groups[0]?.transactions[0];
    expect(unbalanced?.claims[0]?.lines[0]?.differenceCents).toBe('3000');
    expect(unbalanced?.claims[0]?.balance).toEqual({ claimDifferenceCents: '3000', lineChargeDifferenceCents: '0', balanced: false });
  });

  it('refuses structures it cannot read', () => {
    const delimiters = DEFAULT_DELIMITERS;
    expect(() => summarize835({ interchanges: [{ delimiters, segments: [seg('GS')] }] })).toThrow(SummaryError);
    expect(() => summarize835({ interchanges: [{ delimiters, segments: [seg('ISA'), seg('GE')] }] })).toThrow(/GE without GS/);
    expect(() => summarize835({ interchanges: [{ delimiters, segments: [seg('ISA'), seg('XX')] }] })).toThrow(/unexpected XX/);
    expect(() => summarize835({ interchanges: [{ delimiters, segments: [seg('ISA'), seg('GS')] }] })).toThrow(/ends with IEA/);
    expect(() => summarize835({ interchanges: [{ delimiters, segments: [seg('ISA'), seg('GS'), seg('ST', '835', '0001'), seg('SE', '2', '0001')] }] })).toThrow(/BPR or TRN/);
    const bad = [seg('ISA'), seg('GS'), seg('ST', '835', '0001'), seg('BPR', 'C', 'x'), seg('TRN', '1', 'T'), seg('SE')];
    expect(() => summarize835({ interchanges: [{ delimiters, segments: bad }] })).toThrow(/not an amount/);
  });
});
