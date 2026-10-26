import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type FieldTally, type Stated, TALLY_KEYS, type TrueKeys, ZERO_TALLY, addTally, asCounts, pairRecords, sumTallies, tallyFields, totalTally, wrongVerified } from './tally';

// Synthetic keys only: field names and invented values, no document.
const FIELDS = ['method', 'codes', 'amount', 'flags'] as const;
type Field = (typeof FIELDS)[number];

const tally = (counts: Partial<FieldTally>): FieldTally => ({ ...ZERO_TALLY, ...counts });
const stated = (keys: Stated<Field>['keys'], verified: readonly Field[] = Object.keys(keys) as Field[]): Stated<Field> => ({ keys, verified: new Set(verified) });

/**
 * The scorer as it counted at 6ddd587 (src/permitted.ts scorePermitted, the same rule as eval/score.ts
 * scoreContract), copied here only to hold the tally's derived counts equal to it. Nothing else uses it.
 */
function countsAt6ddd587(truths: readonly TrueKeys<Field>[], candidates: readonly Stated<Field>[]): Record<Field, { tp: number; fp: number; fn: number }> {
  const counts = Object.fromEntries(FIELDS.map((field) => [field, { tp: 0, fp: 0, fn: 0 }])) as Record<Field, { tp: number; fp: number; fn: number }>;
  const bump = (field: Field, key: 'tp' | 'fp' | 'fn') => {
    counts[field] = { ...counts[field], [key]: counts[field][key] + 1 };
  };
  const right = (candidate: Stated<Field>, field: Field, value: string) => candidate.verified.has(field) && candidate.keys[field] === value;
  const unmatched = new Set(candidates.keys());
  for (const truth of truths) {
    let best: number | null = null;
    let bestAgreement = 0;
    for (const index of unmatched) {
      const candidate = candidates[index] as Stated<Field>;
      const agreed = FIELDS.filter((field) => truth[field] !== undefined && right(candidate, field, truth[field] ?? '')).length;
      if (agreed > bestAgreement) {
        best = index;
        bestAgreement = agreed;
      }
    }
    const pair = best === null ? undefined : candidates[best];
    if (best !== null) {
      unmatched.delete(best);
    }
    for (const field of FIELDS) {
      const value = truth[field];
      const says = pair !== undefined && field in pair.keys;
      if (value === undefined) {
        if (says) {
          bump(field, 'fp');
        }
      } else if (pair !== undefined && right(pair, field, value)) {
        bump(field, 'tp');
      } else {
        bump(field, 'fn');
        if (says) {
          bump(field, 'fp');
        }
      }
    }
  }
  for (const index of unmatched) {
    for (const field of Object.keys((candidates[index] as Stated<Field>).keys) as Field[]) {
      bump(field, 'fp');
    }
  }
  return counts;
}

describe('tallyFields', () => {
  const truth: TrueKeys<Field> = { method: 'FIXED_SCHEDULE', codes: '97110', amount: '4310', flags: '[true,false,false,false,"PER_CODE"]' };

  it('counts each row of the table: right, wrong but verified, rejected (right or not) and missed', () => {
    const { tallies, pairs } = tallyFields(FIELDS, [truth], [stated({ method: 'FIXED_SCHEDULE', codes: '97110', amount: '4300', flags: '[true,false,false,false,"PER_CODE"]' }, ['method', 'codes', 'amount'])]);
    expect(pairs).toEqual([0]);
    expect(tallies.method).toEqual(tally({ tp: 1 }));
    expect(tallies.amount).toEqual(tally({ wrong: 1 }));
    expect(tallies.flags).toEqual(tally({ rejected: 1, rejected_right: 1 }));
    const missing = tallyFields(FIELDS, [truth], [stated({ method: 'FIXED_SCHEDULE', codes: '97110', amount: '4300' }, ['method', 'codes'])]).tallies;
    expect(missing.amount).toEqual(tally({ rejected: 1 }));
    expect(missing.flags).toEqual(tally({ missed: 1 }));
  });

  it('counts a field the truth does not state as extra when verified and rejected_extra when not', () => {
    const { tallies } = tallyFields(FIELDS, [{ method: 'PER_VISIT', codes: '97110' }], [stated({ method: 'PER_VISIT', codes: '97110', amount: '9900', flags: 'x' }, ['method', 'codes', 'amount'])]);
    expect(tallies.amount).toEqual(tally({ extra: 1 }));
    expect(tallies.flags).toEqual(tally({ rejected_extra: 1 }));
  });

  it('counts every field of an unpaired candidate extra or rejected_extra, and every field of an unpaired record missed', () => {
    const { tallies, pairs } = tallyFields(FIELDS, [truth], [stated({ method: 'PER_VISIT', amount: '1' }, ['amount'])]);
    expect(pairs).toEqual([null]);
    expect(tallies.method).toEqual(tally({ missed: 1, rejected_extra: 1 }));
    expect(tallies.amount).toEqual(tally({ missed: 1, extra: 1 }));
    expect(tallies.codes).toEqual(tally({ missed: 1 }));
  });

  it('leaves out an unpaired candidate’s field the scorer does not count', () => {
    const keys = { method: 'PER_VISIT', rounding: 'HALF_UP' } as Stated<Field>['keys'];
    const { tallies } = tallyFields(FIELDS, [], [stated(keys)]);
    expect(Object.keys(tallies)).toEqual([...FIELDS]);
    expect(tallies.method).toEqual(tally({ extra: 1 }));
  });
});

describe('pairRecords', () => {
  it('pairs each record with the candidate that gets most of it right, the first on a tie, each candidate once', () => {
    const records: TrueKeys<Field>[] = [
      { method: 'A', codes: '1', amount: '1' },
      { method: 'A', codes: '1', amount: '2' },
    ];
    const candidates = [stated({ method: 'A' }), stated({ method: 'A', codes: '1', amount: '2' }), stated({ method: 'A', codes: '1' })];
    expect(pairRecords(FIELDS, records, candidates)).toEqual([1, 2]);
    expect(pairRecords(FIELDS, [{ method: 'B' }], candidates)).toEqual([null]);
  });
});

describe('the demonstration (docs/adr/0070, Part 1; audit item #84)', () => {
  // The worked example: a true record of a faithful case; answer 1 copies it but the verifier rejects its
  // flags (a digit of the quote changed); answer 2 copies it with the real flags sentence and apply_mppr
  // flipped, which the verifier passes.
  const truth: TrueKeys<Field> = { method: 'FIXED_SCHEDULE', codes: '97110', amount: '4310', flags: '[true,false,false,false,"PER_CODE"]' };
  const answer1 = stated({ method: 'FIXED_SCHEDULE', codes: '97110', amount: '4310', flags: '[true,false,false,false,"PER_CODE"]' }, ['method', 'codes', 'amount']);
  const answer2 = stated({ method: 'FIXED_SCHEDULE', codes: '97110', amount: '4310', flags: '[false,false,false,false,"PER_CODE"]' });

  it('a rejection and a wrong-but-verified value tally the same under the old tp, fp and fn', () => {
    const one = tallyFields(FIELDS, [truth], [answer1]).tallies.flags;
    const two = tallyFields(FIELDS, [truth], [answer2]).tallies.flags;
    expect(asCounts(one)).toEqual({ tp: 0, fp: 1, fn: 1 });
    expect(asCounts(two)).toEqual(asCounts(one));
    expect(countsAt6ddd587([truth], [answer1]).flags).toEqual(countsAt6ddd587([truth], [answer2]).flags);
  });

  it('and differently under the new counts: only the second is wrong but verified', () => {
    const one = tallyFields(FIELDS, [truth], [answer1]).tallies.flags;
    const two = tallyFields(FIELDS, [truth], [answer2]).tallies.flags;
    expect(one).toEqual(tally({ rejected: 1, rejected_right: 1 }));
    expect(two).toEqual(tally({ wrong: 1 }));
    expect(wrongVerified(one)).toBe(0);
    expect(wrongVerified(two)).toBe(1);
  });
});

describe('the derived counts', () => {
  const value = fc.constantFrom('a', 'b', 'c');
  const truthArb = fc.record({ method: value, codes: value, amount: value, flags: value }, { requiredKeys: [] });
  const keysArb = fc.record({ method: fc.option(value), codes: fc.option(value), amount: fc.option(value), flags: fc.option(value) }, { requiredKeys: [] });
  const statedArb = fc.tuple(keysArb, fc.subarray([...FIELDS])).map(([keys, verified]) => stated(keys, verified));

  it('equal the 6ddd587 scorer’s tp, fp and fn on any records and candidates', () => {
    fc.assert(
      fc.property(fc.array(truthArb, { maxLength: 4 }), fc.array(statedArb, { maxLength: 5 }), (truths, candidates) => {
        const { tallies } = tallyFields(FIELDS, truths, candidates);
        const old = countsAt6ddd587(truths, candidates);
        for (const field of FIELDS) {
          expect(asCounts(tallies[field])).toEqual(old[field]);
          // rejected_right is a part of rejected; every count is a whole number of at least zero.
          expect(tallies[field].rejected_right).toBeLessThanOrEqual(tallies[field].rejected);
          for (const key of TALLY_KEYS) {
            expect(Number.isInteger(tallies[field][key]) && tallies[field][key] >= 0).toBe(true);
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('summing tallies', () => {
  it('adds every count, field by field and in total', () => {
    const a = tally({ tp: 1, wrong: 2, extra: 3, rejected: 4, rejected_right: 1, rejected_extra: 5, missed: 6 });
    expect(addTally(a, a)).toEqual(tally({ tp: 2, wrong: 4, extra: 6, rejected: 8, rejected_right: 2, rejected_extra: 10, missed: 12 }));
    const fields = { method: a, codes: ZERO_TALLY, amount: a, flags: ZERO_TALLY };
    expect(sumTallies(FIELDS, [fields, fields]).amount).toEqual(addTally(a, a));
    expect(totalTally(FIELDS, fields)).toEqual(addTally(a, a));
    expect(sumTallies(FIELDS, []).method).toEqual(ZERO_TALLY);
  });
});
