import type { RuleRecord } from '@tp/rules';
import { describe, expect, it, vi } from 'vitest';

import { price } from './engine';
import { indexRelease } from './release';
import { SYNTHETIC_RELEASES, contractAgreement, keyOf, lineFacts, perVisitTerms, percentTerms, pricingInput, readRuleRelease, ruleRecordLike, syntheticRelease } from './testing';
import type { LinePricing, PricedLine } from './types';

/**
 * The engine's results do not depend on how the JavaScript engine sorts. ECMAScript fixes a sort's result only for a
 * consistent comparator, and leaves the order in which it calls the comparator to the implementation; V8 calls it as
 * (the later element, the earlier one) and reads only whether the result is below zero. A comparator that is right
 * only in V8's order would price alike on Node today and differently on another conforming engine, or a later V8. So
 * each case runs under the native sort and under a stable insertion sort that calls the comparator in one fixed order,
 * either way round, and expects the same lines.
 */

type Compare = (a: unknown, b: unknown) => number;

type Sorting = 'native' | 'earlier first' | 'later first';
const SORTINGS: readonly Sorting[] = ['native', 'earlier first', 'later first'];

/**
 * Runs `run` with Array.prototype.sort as it is (native) or replaced by a stable insertion sort that calls the
 * comparator as (the element that stands earlier, the later one), an order ECMAScript allows and V8 never uses, or as
 * (the later one, the earlier one), V8's order. Both are conforming sorts: for a consistent comparator they give
 * exactly the native result. Every sort the engine and the release index make passes a comparator, so one without is
 * refused rather than given a default order here.
 */
function sorted<T>(sorting: Sorting, run: () => T): T {
  if (sorting === 'native') {
    return run();
  }
  const earlierFirst = sorting === 'earlier first';
  const sort = vi.spyOn(Array.prototype, 'sort').mockImplementation(function insertionSort(this: unknown[], compare?: Compare) {
    if (compare === undefined) {
      throw new Error('this sort takes a comparator');
    }
    for (let next = 1; next < this.length; next += 1) {
      const item = this[next];
      let at = next - 1;
      while (at >= 0 && (earlierFirst ? compare(this[at], item) > 0 : compare(item, this[at]) < 0)) {
        this[at + 1] = this[at];
        at -= 1;
      }
      this[at + 1] = item;
    }
    return this;
  });
  try {
    return run();
  } finally {
    sort.mockRestore();
  }
}

function pricedLine(result: LinePricing | undefined): PricedLine {
  expect(result?.outcome, result?.outcome === 'unpriced' ? `${result.reason} ${String(result.detail)}` : '').toBe('priced');
  return result as PricedLine;
}

const release = syntheticRelease(900001);

describe('pricing under any sort the language allows', () => {
  it.each(SORTINGS)('lists a visit’s lines in line-number order, its lowest line carrying it (sort: %s)', (sorting) => {
    const visit = contractAgreement({ terms: perVisitTerms(8800n, { codes: ['97110', '97112', '97116'] }) });
    const results = sorted(sorting, () =>
      price(
        pricingInput(release, [
          lineFacts({ lineNo: 1, agreement: visit }),
          lineFacts({ lineNo: 2, procedureCode: '97112', agreement: visit }),
          lineFacts({ lineNo: 3, procedureCode: '97116', agreement: visit }),
        ]),
      ).map(pricedLine),
    );
    expect(results.map((line) => line.trace.steps.per_visit?.visit_line_nos)).toEqual([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);
    expect(results.map((line) => [line.trace.steps.per_visit?.carrier_line_no, line.baseCents.toString()])).toEqual([
      [1, '8800'],
      [1, '0'],
      [1, '0'],
    ]);
  });

  describe('the multiple procedure reduction', () => {
    const mppr = contractAgreement({ terms: percentTerms({ codes: ['97110', '97140', '97530'], flags: { apply_mppr: true } }) });
    const ranking = (line: PricedLine | undefined) => {
      const step = line?.trace.steps.adjustments[0];
      return step?.name === 'mppr' ? step.ranking.map((item) => [item.rank, item.line_no, item.unit]) : null;
    };

    it.each(SORTINGS)('keeps the lower line’s unit whole when two lines tie on practice expense (sort: %s)', (sorting) => {
      // Three units of 97110, PE 1349 each: line 1's unit is ranked first and kept whole, line 2's two lose 539.6 each.
      const results = sorted(sorting, () =>
        price(pricingInput(release, [lineFacts({ lineNo: 1, procedureCode: '97110', agreement: mppr }), lineFacts({ lineNo: 2, procedureCode: '97110', units: '2', agreement: mppr })])).map(pricedLine),
      );
      expect(results.map((line) => line.expectedUnroundedCents.toString())).toEqual(['2112', '3144.8']);
      expect(ranking(results[1])).toEqual([
        [1, 1, 1],
        [2, 2, 1],
        [3, 2, 2],
      ]);
    });

    it.each(SORTINGS)('ranks a line’s own units in unit order, behind every unit of higher practice expense (sort: %s)', (sorting) => {
      const results = sorted(sorting, () =>
        price(
          pricingInput(release, [
            lineFacts({ lineNo: 1, procedureCode: '97530', agreement: mppr }),
            lineFacts({ lineNo: 2, procedureCode: '97110', units: '3', agreement: mppr }),
            lineFacts({ lineNo: 3, procedureCode: '97140', units: '2', agreement: mppr }),
          ]),
        ).map(pricedLine),
      );
      expect(results.map(ranking)).toEqual([
        [[1, 1, 1]],
        [
          [1, 1, 1],
          [4, 2, 1],
          [5, 2, 2],
          [6, 2, 3],
        ],
        [
          [1, 1, 1],
          [2, 3, 1],
          [3, 3, 2],
        ],
      ]);
    });
  });

  describe('an indexed release', () => {
    const base = readRuleRelease(SYNTHETIC_RELEASES[900002]);
    const key = { hcpcs: '97110', modifier: '' };
    const rvu97110 = (year: string) => base.records.find((record) => record.record_type === 'pfs_rvu' && keyOf(record).hcpcs === '97110' && record.effective_from.startsWith(year)) as RuleRecord;
    const latest2025 = (records: readonly RuleRecord[]) => indexRelease({ ...base, records }).latestInYear('pfs_rvu', key, 2025);

    it.each(SORTINGS)('orders a key’s records by their start, whatever order the release lists them in (sort: %s)', (sorting) => {
      // A 2025 quarter listed before the year it falls in, and the release listed backwards: the latest start in 2025.
      const quarter = ruleRecordLike(rvu97110('2025'), { effective_from: '2025-07-01', effective_to: '2025-12-31' });
      expect(sorted(sorting, () => latest2025([quarter, ...base.records]))).toBe(quarter);
      expect(sorted(sorting, () => latest2025([...base.records, quarter].reverse()))).toBe(quarter);
      expect(sorted(sorting, () => latest2025([...base.records].reverse()))).toBe(rvu97110('2025'));
    });

    it.each(SORTINGS)('keeps two records of a key that start on one day in the order the release lists them (sort: %s)', (sorting) => {
      // A checked release never holds two such records; the engine still reads the same one under every sort.
      const twin = ruleRecordLike(rvu97110('2025'), {});
      expect(sorted(sorting, () => latest2025([...base.records, twin]))).toBe(twin);
      expect(sorted(sorting, () => latest2025([twin, ...base.records]))).toBe(rvu97110('2025'));
    });
  });
});
