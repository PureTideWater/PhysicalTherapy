import { cents, negateCents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calendarDate } from '../core/dates';
import { documentFor835 } from '../x12/build835';
import { SynthWorld, claim, dollars, line, remittance, singleTransactionFile } from '../x12/factory';
import { allocateProRata, expectParse, outcomeOf, receiptOf } from './parse';

describe('pro-rata allocation', () => {
  it('always hands out exactly the total, a negated total exactly negated', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -1_000_000n, max: 1_000_000n }), fc.array(fc.bigInt({ min: -100_000n, max: 100_000n }), { minLength: 1, maxLength: 8 }), (total, weights) => {
        const shares = allocateProRata(cents(total), weights.map((weight) => cents(weight)));
        expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(total);
        expect(allocateProRata(cents(-total), weights.map((weight) => cents(weight)))).toEqual(shares.map((share) => negateCents(share)));
      }),
    );
    expect(allocateProRata(cents(3400n), [cents(16000n), cents(9500n)])).toEqual([2134n, 1266n]);
    expect(allocateProRata(cents(5n), [cents(0n), cents(0n)])).toEqual([3n, 2n]);
    expect(allocateProRata(cents(5n), [])).toEqual([]);
  });
});

describe('the parser expectation', () => {
  const world = new SynthWorld('parse-test');
  const date = calendarDate(2026, 3, 2);

  function expectFor(claims: Parameters<typeof remittance>[0]['claims'], amount?: bigint) {
    const remit = remittance({ payer: world.payer('A'), payee: world.payee('01'), claims, paymentDate: date, trace: 'T', originatorId: '1SYN00000A', amount: amount === undefined ? undefined : cents(amount) }, world);
    const file = singleTransactionFile(remit, { isa13: 9, date });
    return expectParse(file, documentFor835(file));
  }

  it('holds a claim whose line charges do not add up to it, and a line that does not balance', () => {
    const lines = [line({ code: '97110', charge: dollars('100.00'), allowed: dollars('80.00'), dates: { kind: 'single', date } })];
    const off = claim({ patientControlNumber: 'P', payerClaimControlNumber: 'C', patient: world.patient(), lines, charge: dollars('110.00'), paid: dollars('70.00') });
    const parse = expectFor([off]);
    expect(parse.outcome).toBe('held');
    expect(parse.transactions[0]?.heldReasons.map((reason) => [reason.scope, reason.segmentId, reason.elementPosition, reason.differenceCents])).toEqual([
      ['claim', 'CLP', 4, '2000'],
      ['claim_lines', 'CLP', 3, '-1000'],
    ]);
    const badLine = { ...lines[0], paid: dollars('75.00') } as (typeof lines)[number];
    const lineHeld = expectFor([claim({ patientControlNumber: 'P', payerClaimControlNumber: 'C', patient: world.patient(), lines: [badLine], paid: dollars('80.00') })]);
    expect(lineHeld.transactions[0]?.heldReasons).toEqual([expect.objectContaining({ scope: 'line', segmentId: 'SVC', elementPosition: 3, differenceCents: '500' })]);
  });

  it('takes line dates from the claim when a line has none, and observed allowed from paid plus PR', () => {
    const lines = [line({ code: '97110', charge: dollars('100.00'), allowed: dollars('80.00'), patientShare: [{ reason: '2', amount: dollars('16.00') }], dates: { kind: 'none' } })];
    const withStatement = claim({ patientControlNumber: 'P', payerClaimControlNumber: 'C', patient: world.patient(), lines, statementFrom: date, outpatient: { remarks: ['N901', 'Z1'] } });
    const parse = expectFor([withStatement]);
    const parsedLine = parse.transactions[0]?.claims[0]?.lines[0];
    expect([parsedLine?.serviceFrom, parsedLine?.serviceTo, parsedLine?.observedAllowed]).toEqual(['2026-03-02', '2026-03-02', { cents: '8000', basis: 'paid_plus_pr', allocatedFromClaim: false }]);
    expect(parse.receipt.unknownCodes).toEqual(['rarc:Z1']);
  });

  it('summarizes outcomes and receipts', () => {
    const loaded = expectFor([]);
    const held = expectFor([], 100n);
    expect(outcomeOf([...loaded.transactions, ...held.transactions])).toBe('partially_held');
    expect(outcomeOf(held.transactions)).toBe('held');
    expect(receiptOf([...loaded.transactions, ...held.transactions])).toMatchObject({ transactions: 2, held: [{ st02: '0001', reasons: ['EDI_UNBALANCED'] }], loaded: { transactions: 1 } });
  });
});
