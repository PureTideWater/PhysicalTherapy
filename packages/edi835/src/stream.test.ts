import { createHash } from 'node:crypto';

import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { allocateProRata, balanceClaim, observedAllowed } from './balance';
import { type KnownRemittance, duplicateDocument, remittanceDecision } from './dedup';
import { Edi835UsageError } from './errors';
import { type Edi835StreamItem, STREAMING_THRESHOLD_BYTES, parse835, parse835Stream, remittancesOf } from './stream';
import { SYNTHETIC_BODY, parseText, releaseDirectoryCodeLists, syntheticInterchange } from './testing';
import { plbCategory } from './transaction';
import { type Adjustment, isLoadable } from './types';

const codeLists = releaseDirectoryCodeLists();

async function collect(source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>): Promise<Edi835StreamItem[]> {
  const items: Edi835StreamItem[] = [];
  for await (const item of parse835Stream(source, { codeLists })) {
    items.push(item);
  }
  return items;
}

describe('the two ways in', () => {
  const bytes = Buffer.from(syntheticInterchange([SYNTHETIC_BODY, SYNTHETIC_BODY.map((segment) => segment.replace('SYNTRACE0001', 'SYNTRACE0002'))]));

  it('streams the same events as the whole document, from synchronous or asynchronous chunks, with the report last', async () => {
    const whole = parse835(bytes, { codeLists });
    const chunks = Array.from({ length: Math.ceil(bytes.length / 7) }, (_, index) => bytes.subarray(index * 7, index * 7 + 7));
    async function* slowly(): AsyncGenerator<Uint8Array> {
      for (const chunk of chunks) {
        await Promise.resolve();
        yield chunk;
      }
    }
    for (const items of [await collect(chunks), await collect(slowly())]) {
      expect(items.slice(0, -1)).toEqual(whole.events);
      // Only the peak buffer depends on how the bytes were cut.
      expect(items.at(-1)).toEqual({ type: 'report', report: { ...whole.report, memory: { peakTransactionSegments: 21, peakBufferedCharacters: expect.any(Number) } } });
    }
    expect(remittancesOf(whole)).toHaveLength(2);
    expect(whole.report.documentSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(whole.report.bytes).toBe(bytes.length);
  });

  it('refuses a document above the streaming threshold in memory', () => {
    expect(STREAMING_THRESHOLD_BYTES).toBe(52_428_800);
    expect(() => parse835(new Uint8Array(STREAMING_THRESHOLD_BYTES + 1), { codeLists })).toThrow(Edi835UsageError);
  });

  it('decodes a UTF-8 character split across chunks', async () => {
    const text = syntheticInterchange([SYNTHETIC_BODY.map((segment) => segment.replace('SYNTHETIC PAYER A', 'SYNTHETIC PAYER É'))]);
    const encoded = Buffer.from(text, 'utf8');
    const split = encoded.indexOf(0xc3) + 1;
    const items = await collect([encoded.subarray(0, split), encoded.subarray(split)]);
    const transaction = items.find((item) => item.type === 'transaction');
    expect(transaction?.type === 'transaction' ? transaction.transaction.payer?.name : null).toBe('SYNTHETIC PAYER É');
  });
});

describe('provider adjustment categories', () => {
  it('names recoupments, forward balances, interest and authorized returns, and everything else other', () => {
    expect(['WO', 'FB', 'L6', '72', 'CS', 'J1'].map(plbCategory)).toEqual(['recoupment', 'forward_balance', 'interest', 'authorized_return', 'other', 'other']);
    const body = [...SYNTHETIC_BODY.map((segment) => segment.replace('BPR*C*100.00', 'BPR*C*95.00')), 'PLB*9900000001*20261231*CS:SYNADJ*5.00*FB:SYNFWD*3.00*FB:SYNFWD*-3.00'];
    const [remittance] = remittancesOf(parseText(syntheticInterchange([body]), codeLists));
    expect(remittance?.providerAdjustments.map((item) => [item.code, item.category, item.counted, item.cents])).toEqual([
      ['CS', 'other', true, cents(500n)],
      ['FB', 'forward_balance', false, cents(300n)],
      ['FB', 'forward_balance', false, cents(-300n)],
    ]);
    expect(remittance?.loadable).toBe(true);
  });

  it('keeps an empty modifier position inside SVC01 and drops trailing ones', () => {
    const body = SYNTHETIC_BODY.map((segment) => segment.replace('SVC*HC:97110:GP*', 'SVC*HC:97110::59::*'));
    const [remittance] = remittancesOf(parseText(syntheticInterchange([body])));
    expect(remittance?.claims[0]?.lines[0]?.procedure.modifiers).toEqual(['', '59']);
  });
});

describe('balancing and allocation helpers', () => {
  const adjustment = (group: string, amount: bigint): Adjustment => ({ segmentIndex: 1, elementPosition: 2, position: 1, group, reason: '1', cents: cents(amount), quantity: null });

  it('allocates nothing to no lines, evenly over zero charges, and in proportion with the remainder in line order', () => {
    expect(allocateProRata(cents(100n), [])).toEqual([]);
    expect(allocateProRata(cents(100n), [cents(0n), cents(0n), cents(0n)])).toEqual([cents(34n), cents(33n), cents(33n)]);
    expect(allocateProRata(cents(-100n), [cents(-1000n), cents(-2000n)])).toEqual([cents(-34n), cents(-66n)]);
    expect(allocateProRata(cents(2000n), [cents(15000n), cents(2500n)])).toEqual([cents(1715n), cents(285n)]);
  });

  it('balances a claim, its line charges and each line under the rules of docs/adr/0021', () => {
    const balance = balanceClaim({
      chargeCents: cents(300n),
      paidCents: cents(200n),
      adjustments: [adjustment('CO', 40n)],
      lines: [
        { chargeCents: cents(200n), paidCents: cents(150n), adjustments: [adjustment('PR', 50n)], lineAllowedCents: null },
        { chargeCents: cents(100n), paidCents: cents(50n), adjustments: [], lineAllowedCents: null },
      ],
    });
    expect(balance).toEqual({ claimDifferenceCents: cents(10n), lineChargeDifferenceCents: cents(0n), lineDifferences: [cents(0n), null], balanced: false });
    expect(observedAllowed({ chargeCents: cents(100n), paidCents: cents(80n), adjustments: [], lines: [{ chargeCents: cents(100n), paidCents: cents(80n), adjustments: [adjustment('PR', 20n)], lineAllowedCents: null }] })).toEqual([
      { cents: cents(100n), basis: 'paid_plus_pr', allocatedFromClaim: false, allocatedPatientShareCents: null },
    ]);
  });
});

describe('deduplication decisions', () => {
  const remittance = () => {
    const [first] = remittancesOf(parseText(syntheticInterchange()));
    if (first === undefined || !isLoadable(first)) {
      throw new Error('the synthetic interchange loads');
    }
    return first;
  };

  it('finds the earlier document with the same bytes', () => {
    expect(duplicateDocument('abc', [])).toBeNull();
    expect(duplicateDocument('abc', [{ id: 'doc-1', sha256: 'abc' }])).toMatchObject({ duplicateOf: 'doc-1', error: { code: 'EDI_DUPLICATE', segmentIndex: 1, segmentId: 'ISA' } });
  });

  it('links the same remittance, and surfaces a reused trace for review, saying whether the date differs', () => {
    const item = remittance();
    const known = (overrides: Partial<KnownRemittance>): KnownRemittance => ({ id: 'remit-1', key: item.dedupKey, originatorId: item.trace.originatorId, paymentDate: item.payment.date, ...overrides });
    expect(remittanceDecision(item, [])).toEqual({ outcome: 'new' });
    expect(remittanceDecision(item, [known({})])).toMatchObject({ outcome: 'duplicate_remittance', duplicateOf: 'remit-1', error: { segmentIndex: 5, segmentId: 'TRN', elementPosition: 2 } });
    const otherAmount = { ...item.dedupKey, bpr02Cents: cents(1n) };
    expect(remittanceDecision(item, [known({ key: otherAmount })])).toEqual({ outcome: 'review_trace_reused', sameTraceAs: 'remit-1', anotherDate: false });
    expect(remittanceDecision(item, [known({ key: otherAmount, paymentDate: '2026-01-02' })])).toEqual({ outcome: 'review_trace_reused', sameTraceAs: 'remit-1', anotherDate: true });
    expect(remittanceDecision(item, [known({ key: otherAmount, originatorId: '1SYN00000B' })])).toEqual({ outcome: 'new' });
    expect(remittanceDecision(item, [known({ key: { ...otherAmount, payeeId: '9900000009' } })])).toEqual({ outcome: 'new' });
    expect(remittanceDecision(item, [known({ key: { ...otherAmount, trn02: 'SYNOTHER' } })])).toEqual({ outcome: 'new' });
  });
});
