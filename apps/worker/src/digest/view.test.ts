import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { type DigestFigures, consistent, coverageSentence, digestSentences, monthName, parseDigestFigures, periodEnded, previousMonth, share, sumByPayer, validatedByPayer } from './view';

const PAYER_A = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const PAYER_B = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';

const figures: DigestFigures = {
  counts: {
    validated_lines: 5,
    validated_payers: 2,
    validated_lines_by_payer: { [PAYER_A]: 2, [PAYER_B]: 3 },
    cases_nearing_deadline: 1,
    recoveries_posted: 0,
    coverage_lines: 8,
    coverage_priced_lines: 6,
    previous_coverage_lines: 4,
    previous_coverage_priced_lines: 1,
    contracts_expiring: 2,
  },
  totals: {
    validated_variance: '123456',
    validated_variance_by_payer: { [PAYER_A]: '100000', [PAYER_B]: '23456' },
    cases_nearing_deadline_actionable: '28000',
    recovered: '0',
    coverage_billed: '90000',
    coverage_priced_billed: '60000',
    previous_coverage_billed: '30000',
    previous_coverage_priced_billed: '10000',
  },
};

describe('the digest’s sentences (counts and dollar totals only)', () => {
  it('reads each figure with its stage, payers by rank in the email and by name in the application', () => {
    expect(digestSentences('2026-10', figures)).toEqual([
      'Monitoring digest for October 2026: counts and dollar totals only.',
      'New validated variance: $1,234.56 on 5 lines across 2 payers.',
      'Payer 1: $1,000.00 validated on 2 lines.',
      'Payer 2: $234.56 validated on 3 lines.',
      'Cases nearing their deadline (within 14 days): 1, actionable $280.00.',
      'Recovered (posted or deposited), net of recoupments and reversals: $0.00 on 0 lines.',
      'Coverage: 6 of 8 lines priced (75.0%); $600.00 of $900.00 billed (66.7%). At the previous digest: 25.0% of lines and 33.3% of billed dollars.',
      'Contracts expiring within 90 days: 2.',
    ]);
    const named = digestSentences('2026-10', figures, (payerId) => (payerId === PAYER_A ? 'SYNTHETIC PAYER A' : undefined));
    expect(named[2]).toBe('SYNTHETIC PAYER A: $1,000.00 validated on 2 lines.');
    expect(named[3]).toBe('Payer 2: $234.56 validated on 3 lines.');
  });

  it('says so when there is no earlier digest, and when there is nothing yet', () => {
    const first: DigestFigures = {
      counts: { ...figures.counts, previous_coverage_lines: undefined, previous_coverage_priced_lines: undefined, validated_lines: 1, validated_payers: 1, validated_lines_by_payer: { [PAYER_A]: 1 }, coverage_lines: 1, coverage_priced_lines: 1 },
      totals: { ...figures.totals, previous_coverage_billed: undefined, previous_coverage_priced_billed: undefined },
    };
    expect(coverageSentence(first)).toMatch(/There is no earlier digest to compare it with\.$/);
    expect(digestSentences('2026-01', first)[1]).toBe('New validated variance: $1,234.56 on 1 line across 1 payer.');
    const empty: DigestFigures = {
      counts: { validated_lines: 0, validated_payers: 0, validated_lines_by_payer: {}, cases_nearing_deadline: 0, recoveries_posted: 0, coverage_lines: 0, coverage_priced_lines: 0, contracts_expiring: 0 },
      totals: { validated_variance: '0', validated_variance_by_payer: {}, cases_nearing_deadline_actionable: '0', recovered: '0', coverage_billed: '0', coverage_priced_billed: '0' },
    };
    expect(coverageSentence(empty)).toBe('Coverage: 0 of 0 lines priced (none); $0.00 of $0.00 billed (none). There is no earlier digest to compare it with.');
    expect(validatedByPayer(empty)).toEqual([]);
    expect(consistent(empty)).toBe(true);
  });

  it('ranks payers by their validated variance, then by ID, and checks the parts add up to the whole', () => {
    expect(validatedByPayer(figures).map((entry) => entry.payerId)).toEqual([PAYER_A, PAYER_B]);
    const tied: DigestFigures = { ...figures, totals: { ...figures.totals, validated_variance_by_payer: { [PAYER_B]: '500', [PAYER_A]: '500' } } };
    expect(validatedByPayer(tied).map((entry) => entry.payerId)).toEqual([PAYER_A, PAYER_B]);
    const unknownLines: DigestFigures = { ...figures, counts: { ...figures.counts, validated_lines_by_payer: {} } };
    expect(validatedByPayer(unknownLines).map((entry) => entry.lines)).toEqual([0, 0]);
    expect(consistent(figures)).toBe(true);
    expect(consistent({ ...figures, totals: { ...figures.totals, validated_variance: '1' } })).toBe(false);
    expect(consistent({ ...figures, counts: { ...figures.counts, validated_lines: 4 } })).toBe(false);
    expect(consistent({ ...figures, counts: { ...figures.counts, validated_payers: 1 } })).toBe(false);
    expect(sumByPayer({})).toBe(0n);
  });

  it('reads stored figures strictly: counts as integers, cents as integer text, payers by opaque ID', () => {
    expect(parseDigestFigures(figures.counts, figures.totals)).toEqual(figures);
    expect(() => parseDigestFigures({ ...figures.counts, patient: 'SYNTHETIC' }, figures.totals)).toThrow(ZodError);
    expect(() => parseDigestFigures(figures.counts, { ...figures.totals, validated_variance: 12.5 })).toThrow(ZodError);
    expect(() => parseDigestFigures({ ...figures.counts, validated_lines_by_payer: { 'SYNTHETIC PAYER': 1 } }, figures.totals)).toThrow(ZodError);
  });
});

describe('months and shares', () => {
  it('names months, knows when one has ended, and finds the month before', () => {
    expect(monthName('2026-01')).toBe('January 2026');
    expect(monthName('2026-12')).toBe('December 2026');
    expect(monthName('2026')).toBe('January 2026');
    expect(periodEnded('2026-10', '2026-10-31')).toBe(false);
    expect(periodEnded('2026-10', '2026-11-01')).toBe(true);
    expect(periodEnded('2026-12', '2027-01-01')).toBe(true);
    expect(previousMonth('2026-11-01')).toBe('2026-10');
    expect(previousMonth('2027-01-15')).toBe('2026-12');
  });

  it('puts a share in tenths of a percent, half up, from integers (property: within half a tenth of the exact share)', () => {
    expect(share(0n, 0n)).toBe('none');
    expect(share(1n, 3n)).toBe('33.3%');
    expect(share(2n, 3n)).toBe('66.7%');
    expect(share(1n, 2000n)).toBe('0.1%');
    expect(share(1n, 2001n)).toBe('0.0%');
    expect(share(5n, 5n)).toBe('100.0%');
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 10n ** 12n }), (whole, raw) => {
        const part = raw % (whole + 1n);
        const [integer, tenth] = share(part, whole).replace('%', '').split('.');
        const tenths = BigInt(integer ?? '0') * 10n + BigInt(tenth ?? '0');
        // |tenths - part * 1000 / whole| <= 1/2, in integers.
        const difference = tenths * whole * 2n - part * 2000n;
        expect(difference <= whole && difference >= -whole).toBe(true);
      }),
    );
  });
});
