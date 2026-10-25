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
 * The native sort, taken before any spy replaces it. A sort called without a comparator uses the language's own order
 * (ECMAScript's SortCompare: undefined last, then by the elements' text), a consistent comparator, so every conforming
 * sort gives exactly this result for it.
 */
const nativeSort: (this: unknown[], compare?: Compare) => unknown[] = Array.prototype.sort;

/**
 * Runs `run` with Array.prototype.sort and Array.prototype.toSorted as they are (native) or replaced by a stable
 * insertion sort that calls the comparator as (the element that stands earlier, the later one), an order ECMAScript
 * allows and V8 never uses, or as (the later one, the earlier one), V8's order. Both are conforming sorts: for a
 * consistent comparator they give exactly the native result (none of the engine's sorts sees an undefined element), and
 * a sort called without one is the native sort, whose order the language fixes. Under either insertion sort the case
 * must have sorted at least once, so it was run under that order and not only the native one; how many sorts the code
 * makes, and which of the two methods, is its own.
 */
function sorted<T>(sorting: Sorting, run: () => T): T {
  if (sorting === 'native') {
    return run();
  }
  const earlierFirst = sorting === 'earlier first';
  const insertionSort = (items: unknown[], compare: Compare | undefined): unknown[] => {
    if (compare === undefined) {
      return nativeSort.call(items);
    }
    for (let next = 1; next < items.length; next += 1) {
      const item = items[next];
      let at = next - 1;
      while (at >= 0 && (earlierFirst ? compare(items[at], item) > 0 : compare(item, items[at]) < 0)) {
        items[at + 1] = items[at];
        at -= 1;
      }
      items[at + 1] = item;
    }
    return items;
  };
  const sort = vi.spyOn(Array.prototype, 'sort').mockImplementation(function inPlace(this: unknown[], compare?: Compare) {
    return insertionSort(this, compare);
  });
  const toSorted = vi.spyOn(Array.prototype, 'toSorted').mockImplementation(function copied(this: unknown[], compare?: Compare) {
    return insertionSort([...this], compare);
  });
  let result: T;
  let sorts: number;
  try {
    result = run();
  } finally {
    sorts = sort.mock.calls.length + toSorted.mock.calls.length;
    sort.mockRestore();
    toSorted.mockRestore();
  }
  // Asserted once both are restored, so nothing the assertion does runs under the insertion sort.
  expect(sorts, `sorts made under the '${sorting}' insertion sort`).toBeGreaterThan(0);
  return result;
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

  it.each(SORTINGS)('lists a visit’s lines in line-number order when another line of the claim has NaN for its number (sort: %s)', (sorting) => {
    // LineFacts.lineNo is a number, and NaN is one. price sorts the claim's lines by number before it checks them, and
    // with NaN among them that comparator is inconsistent, so the order is the sort's own: V8 and both insertion sorts
    // leave 3, NaN, 1 as they are. The NaN line stops at its check; the visit's own sort still lists lines 1 and 3 in
    // order, and line 1 carries the visit.
    // Not asserted: the order of price's results for such a claim, which follows that inconsistent sort. It is the frozen
    // engine's current behaviour, not its rule, and is recorded for Lane A's PR 6c (engine corrections).
    const visit = contractAgreement({ terms: perVisitTerms(8800n, { codes: ['97110', '97112', '97116'] }) });
    const results = sorted(sorting, () =>
      price(
        pricingInput(release, [
          lineFacts({ lineNo: 3, procedureCode: '97116', agreement: visit }),
          lineFacts({ lineNo: Number.NaN, procedureCode: '97110', agreement: visit }),
          lineFacts({ lineNo: 1, procedureCode: '97112', agreement: visit }),
        ]),
      ),
    );
    const line = (lineNo: number) => results.find((result) => Object.is(result.lineNo, lineNo));
    const stopped = line(Number.NaN);
    expect(stopped?.outcome === 'unpriced' ? `${stopped.reason} ${String(stopped.detail)}` : stopped?.outcome).toBe('ENGINE_ERROR invalid_line_facts');
    const visitLines = [pricedLine(line(1)), pricedLine(line(3))];
    expect(visitLines.map((priced) => priced.trace.steps.per_visit?.visit_line_nos)).toEqual([
      [1, 3],
      [1, 3],
    ]);
    expect(visitLines.map((priced) => [priced.trace.steps.per_visit?.carrier_line_no, priced.baseCents.toString()])).toEqual([
      [1, '8800'],
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
