import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays, calendarDate, dayNumber, daysBetween, fromDayNumber, fromX12Date, parseCalendarDate, toIsaDate, toUsDate, toX12Date } from './dates';
import { canonicalJson, prettyJson, sha256 } from './json';
import { Random, seedFrom } from './random';

describe('calendar dates', () => {
  it('round-trips day numbers and X12 forms', () => {
    fc.assert(
      fc.property(fc.integer({ min: -200_000, max: 200_000 }), (days) => {
        const date = fromDayNumber(days);
        expect(dayNumber(date)).toBe(days);
        expect(fromX12Date(toX12Date(date))).toBe(date);
      }),
    );
  });

  it('adds days across month and leap-year ends, and formats ISA, US and X12 dates', () => {
    expect(addDays(calendarDate(2026, 2, 28), 1)).toBe('2026-03-01');
    expect(addDays(calendarDate(2028, 2, 28), 1)).toBe('2028-02-29');
    expect(daysBetween(calendarDate(2026, 3, 2), calendarDate(2026, 6, 21))).toBe(111);
    expect([toX12Date(calendarDate(2026, 3, 5)), toIsaDate(calendarDate(2026, 3, 5)), toUsDate(calendarDate(2026, 3, 5))]).toEqual(['20260305', '260305', '03/05/2026']);
  });

  it('refuses dates that do not exist', () => {
    expect(() => parseCalendarDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseCalendarDate('2026-2-3')).toThrow(RangeError);
    expect(() => fromX12Date('2026030')).toThrow(RangeError);
  });
});

describe('the seeded generator', () => {
  it('repeats exactly for a seed and differs between seeds', () => {
    const draw = (seed: string) => {
      const random = new Random(seed);
      return [random.next(), random.int(1, 6), String(random.cents(0n, 10_000n)), random.alphanumeric(6), random.digits(4), random.pick(['a', 'b', 'c']), random.chance(50)];
    };
    expect(draw('a')).toEqual(draw('a'));
    expect(draw('a')).not.toEqual(draw('b'));
    expect(seedFrom('PAR-01')).toBe(seedFrom('PAR-01'));
    expect(new Random(7).next()).toBe(new Random(7).next());
  });

  it('stays inside its bounds and refuses bad ones', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 1000 }), fc.string(), (min, span, seed) => {
        const random = new Random(seed);
        const value = random.int(min, min + span);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(min + span);
        const amount = random.cents(BigInt(min), BigInt(min + span));
        expect(amount >= BigInt(min) && amount <= BigInt(min + span)).toBe(true);
      }),
    );
    const random = new Random(1);
    expect(() => random.int(2, 1)).toThrow(RangeError);
    expect(() => random.cents(2n, 1n)).toThrow(RangeError);
    expect(() => random.pick([])).toThrow(RangeError);
  });
});

describe('JSON', () => {
  it('sorts keys in canonical form, drops undefined, and keeps short values on one line when pretty', () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: 'x', e: undefined }] })).toBe('{"a":[{"c":"x","d":null}],"b":1}');
    expect(prettyJson({ a: [1, 2], b: {} })).toBe('{"a":[1,2],"b":{}}\n');
    const long = { list: Array.from({ length: 30 }, (_, index) => `value-${String(index)}`), empty: [], nothing: {} };
    const text = prettyJson({ outer: long, gone: undefined });
    expect(text).toContain('\n  "outer": {\n    "list": [\n      "value-0",\n');
    expect(text).toContain('"empty": []');
    expect(text).not.toContain('gone');
    expect(JSON.parse(text)).toEqual({ outer: long });
    expect(prettyJson([Array.from({ length: 30 }, () => 'abcdef'), []])).toContain('[\n  [\n');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
