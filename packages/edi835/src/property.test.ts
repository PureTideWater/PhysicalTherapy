/**
 * Property tests (PRD section 18): the tokenizer gives back exactly the segments written, whatever the
 * delimiters, line endings and chunk boundaries; random SYNTHETIC 835s written by packages/synth parse
 * to exactly what the writer says they contain, held with the exact difference wherever an amount is
 * off; and the pro-rata allocation always adds up.
 */
import { type Cents, cents, negateCents, sumCents } from '@tp/money';
import {
  type CasSegment,
  type Claim as SynthClaim,
  type Delimiters as SynthDelimiters,
  type ProviderAdjustment as SynthProviderAdjustment,
  SynthWorld,
  calendarDate,
  claim,
  documentFor835,
  expectParse,
  line,
  remittance,
  renderDocument,
  reversalOf,
  singleTransactionFile,
} from '@tp/synth';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { allocateProRata } from './balance';
import { type EdiError } from './errors';
import { parse835 } from './stream';
import { comparable, parseShape, releaseDirectoryCodeLists } from './testing';
import { type Segment, Tokenizer } from './tokenizer';

const codeLists = releaseDirectoryCodeLists();

/** Characters that never occur in the values written (letters, digits, space, '.', '-'), so any four can delimit. */
const DELIMITER_POOL = ['*', '|', '!', '^', '~', ':', '>', '<', '#', '$', '%', '&', '+', ';', '=', '?', '@', '{', '}', '[', ']', '`', "'", '"', '\\', '/', '(', ')', ',', '_'];
const delimiters = fc.shuffledSubarray(DELIMITER_POOL, { minLength: 4, maxLength: 4 }).map(([element, component, repetition, segment]) => ({ element, component, repetition, segment }) as SynthDelimiters);
const lineEnding = fc.constantFrom('' as const, '\n' as const, '\r\n' as const);

function chunked(text: string, cuts: readonly number[]): string[] {
  const points = [...new Set(cuts.map((cut) => cut % (text.length + 1)))].sort((a, b) => a - b);
  return [...points, text.length].map((point, index) => text.slice(index === 0 ? 0 : points[index - 1], point));
}

describe('the tokenizer round trip', () => {
  const value = fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-'.split('')), maxLength: 8 });
  const element = fc.array(fc.array(value, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 2 });
  const id = fc.stringMatching(/^[A-Z][A-Z0-9]{1,2}$/).filter((text) => text !== 'ISA' && text !== 'IEA');
  const segment = fc.record({ id, elements: fc.array(element, { maxLength: 8 }) });

  it('gives back every segment, element, repetition and component written, for any delimiters, line endings and chunks', () => {
    fc.assert(
      fc.property(delimiters, lineEnding, fc.boolean(), fc.array(segment, { minLength: 1, maxLength: 12 }), fc.array(fc.nat(), { maxLength: 6 }), (d, ending, bom, segments, cuts) => {
        const isa = ['ISA', '00', ' '.repeat(10), '00', ' '.repeat(10), 'ZZ', 'SYNTHSENDER    ', 'ZZ', 'SYNTHRECEIVER  ', '260406', '0915', d.repetition, '00501', '000000001', '0', 'T', d.component].join(d.element);
        const raw = segments.map((item) => ({ id: item.id, elements: item.elements.map((repetitions) => repetitions.map((components) => components.join(d.component)).join(d.repetition)) }));
        const lines = [isa, ...raw.map((item) => [item.id, ...item.elements].join(d.element)), ['IEA', '1', '000000001'].join(d.element)];
        const text = (bom ? '﻿' : '') + lines.map((text) => `${text}${d.segment}${ending}`).join('');
        const read: Segment[] = [];
        const errors: EdiError[] = [];
        const tokenizer = new Tokenizer({ segment: (item) => read.push(item), error: (error) => errors.push(error) });
        for (const chunk of chunked(text, cuts)) {
          tokenizer.write(chunk);
        }
        tokenizer.end();
        expect(errors).toEqual([]);
        expect(tokenizer.bom).toBe(bom);
        expect(read.map((item) => item.delimiters)).toEqual(read.map(() => d));
        expect(read.slice(1, -1).map((item) => ({ id: item.id, elements: item.elements }))).toEqual(raw);
        expect(read.map((item) => item.index)).toEqual(lines.map((_text, index) => index + 1));
      }),
    );
  });
});

/** A random therapy line: charge, contractual write-off, patient share by reason, maybe AMT B6. */
const lineShape = fc.record({
  charge: fc.integer({ min: 1, max: 60_000 }),
  contractualShare: fc.integer({ min: 0, max: 100 }),
  shares: fc.array(fc.record({ reason: fc.constantFrom('1', '2', '3'), percent: fc.integer({ min: 0, max: 40 }) }), { maxLength: 2 }),
  b6: fc.boolean(),
  code: fc.constantFrom('97110', '97140', '97530', '97112'),
  units: fc.constantFrom('1', '2', '0.5', '1.25'),
});
const claimShape = fc.record({
  lines: fc.array(lineShape, { maxLength: 3 }),
  claimLevel: fc.option(fc.record({ group: fc.constantFrom('OA', 'PR', 'PI'), reason: fc.constantFrom('23', '1', '45'), amount: fc.integer({ min: -2_000, max: 2_000 }) }), { nil: null }),
  reversal: fc.boolean(),
  paidError: fc.option(fc.integer({ min: -500, max: 500 }).filter((delta) => delta !== 0), { nil: null }),
});
const plbShape = fc.record({ code: fc.constantFrom('WO', 'FB', 'L6', '72', 'CS'), amount: fc.integer({ min: -30_000, max: 30_000 }) });

describe('random SYNTHETIC 835s', () => {
  it('parse to exactly what the writer says they contain, held with the exact difference and position wherever an amount is off', () => {
    const outcomes = new Set<string>();
    fc.assert(
      fc.property(
        fc.array(claimShape, { minLength: 1, maxLength: 4 }),
        fc.array(plbShape, { maxLength: 3 }),
        fc.option(fc.integer({ min: -900, max: 900 }).filter((delta) => delta !== 0), { nil: null }),
        delimiters,
        lineEnding,
        fc.boolean(),
        fc.boolean(),
        (claims, plb, paymentError, d, ending, bom, balanced) => {
          const world = new SynthWorld('tp-edi835/property');
          const date = calendarDate(2026, 3, 16);
          const written: SynthClaim[] = claims.map((shape, index) => {
            const lines = shape.lines.map((item) => {
              const charge = cents(BigInt(item.charge));
              const contractual = (charge * BigInt(item.contractualShare)) / 100n;
              const allowed = cents(charge - contractual);
              return line({
                code: item.code,
                units: item.units,
                charge,
                allowed,
                patientShare: item.shares.map((share) => ({ reason: share.reason, amount: cents((allowed * BigInt(share.percent)) / 100n) })),
                b6: item.b6,
                dates: { kind: 'single', date },
              });
            });
            const claimLevel: CasSegment[] = shape.claimLevel === null ? [] : [{ group: shape.claimLevel.group, items: [{ reason: shape.claimLevel.reason, amount: cents(BigInt(shape.claimLevel.amount)) }] }];
            const charge = lines.length === 0 ? cents(BigInt(10_000 + index)) : undefined;
            const built = claim({
              patientControlNumber: `SYNPCNPROP${String(index)}`,
              payerClaimControlNumber: `SYNCCNPROP${String(index)}`,
              patient: world.patient(),
              lines,
              adjustments: claimLevel,
              ...(charge === undefined ? {} : { charge }),
            });
            const reversed = shape.reversal ? reversalOf(built) : built;
            return shape.paidError === null || balanced ? reversed : { ...reversed, paid: cents(reversed.paid + BigInt(shape.paidError)) };
          });
          const providerAdjustments: SynthProviderAdjustment[] = plb.length === 0 ? [] : [{ providerId: '9900000001', fiscalPeriodDate: calendarDate(2026, 12, 31), items: plb.map((item) => ({ code: item.code, amount: cents(BigInt(item.amount)) })) }];
          const net = sumCents(written.map((item) => item.paid)) - sumCents(providerAdjustments.flatMap((item) => item.items.map((entry) => entry.amount)));
          const debit = net < 0n;
          const base = remittance({ payer: world.payer('A'), payee: world.payee('01'), claims: written, providerAdjustments, creditDebit: debit ? 'D' : 'C', paymentDate: date, trace: 'SYNTRACEPROP1', originatorId: world.originatorId('A') }, world);
          const amount = cents((debit ? -net : net) + BigInt(paymentError ?? 0));
          const remit = paymentError === null || balanced || amount < 0n ? base : { ...base, payment: { ...base.payment, amount } };
          const file = singleTransactionFile(remit, { isa13: 7, date, delimiters: d });
          const document = documentFor835(file);
          const bytes = Buffer.from(renderDocument(document, { lineEnding: ending, bom }), 'utf8');
          const result = parse835(bytes, { codeLists });
          const expected = expectParse(file, document);
          expect(parseShape(result)).toEqual(comparable(expected));
          expect(result.report.bom).toBe(bom);
          outcomes.add(result.report.outcome);
        },
      ),
      { numRuns: 150 },
    );
    // The runs cover both balanced files and files held for a difference.
    expect([...outcomes].sort()).toEqual(['held', 'loaded']);
  });
});

describe('pro-rata allocation', () => {
  it('always adds up to the total, gives each line its truncated share or one cent more, and allocates a negation exactly negated', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -10_000_000n, max: 10_000_000n }), fc.array(fc.bigInt({ min: -1_000_000n, max: 1_000_000n }), { minLength: 1, maxLength: 8 }), (total, weights) => {
        const shares = allocateProRata(cents(total), weights.map((weight) => cents(weight)));
        expect(sumCents(shares)).toBe(total);
        const magnitudes = weights.map((weight) => (weight < 0n ? -weight : weight));
        const sum = magnitudes.reduce((a, b) => a + b, 0n);
        shares.forEach((share, index) => {
          const base = sum === 0n ? total / BigInt(weights.length) : (total * (magnitudes[index] as bigint)) / sum;
          const step = share - base;
          expect(step === 0n || step === (total < 0n ? -1n : 1n)).toBe(true);
        });
        expect(allocateProRata(negateCents(cents(total)), weights.map((weight) => cents(weight)))).toEqual(shares.map((share): Cents => negateCents(share)));
      }),
    );
  });
});
