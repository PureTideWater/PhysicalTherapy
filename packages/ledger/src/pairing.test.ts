import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type PairableLine, pairLines, pairedLine } from './pairing';

const line = (procedureCode: string, serviceDate: string | null, modifiers: readonly string[] = [], units: string | null = '2.000'): PairableLine => ({ procedureCode, modifiers, units, serviceDate });

describe('pairing a claim’s lines with a reprocessing’s (PRD 13, Matching steps 1 and 2)', () => {
  it('pairs two lines of one code and date by their modifiers (97110 and 97110-59)', () => {
    const original = [line('97110', '2026-03-09'), line('97110', '2026-03-09', ['59'])];
    const corrected = [line('97110', '2026-03-09', ['59']), line('97110', '2026-03-09')];
    expect(pairLines(original, corrected)).toEqual([1, 0]);
  });

  it('pairs identical lines by their place among the lines alike, each once', () => {
    const original = [line('97110', '2026-03-09'), line('97110', '2026-03-09')];
    expect(pairLines(original, [line('97110', '2026-03-09'), line('97110', '2026-03-09')])).toEqual([0, 1]);
    expect(pairLines(original, [line('97110', '2026-03-09')])).toEqual([0, null]);
  });

  it('pairs by units, then falls back to code and date when modifiers or units changed', () => {
    const original = [line('97110', '2026-03-09', [], '2.000'), line('97110', '2026-03-09', [], '1.000')];
    expect(pairLines(original, [line('97110', '2026-03-09', [], '1.000'), line('97110', '2026-03-09', [], '2.000')])).toEqual([1, 0]);
    // A reversal that sends negative units, and a reprocessing that changed a modifier.
    expect(pairLines([line('97110', '2026-03-09', ['GP'])], [line('97110', '2026-03-09', ['KX'], '-2.000')])).toEqual([0]);
    // Empty positions are no modifier.
    expect(pairLines([line('97110', '2026-03-09', ['', '59'])], [line('97110', '2026-03-09', ['59'])])).toEqual([0]);
  });

  it('pairs nothing of another code or date', () => {
    expect(pairLines([line('97110', '2026-03-09'), line('97140', null)], [line('97110', '2026-03-10'), line('97140', '2026-03-09')])).toEqual([null, null]);
    expect(pairLines([], [line('97110', '2026-03-09')])).toEqual([]);
  });

  it('finds the paired line of one line', () => {
    const original = [line('97110', '2026-03-09'), line('97110', '2026-03-10')];
    const other = [line('97110', '2026-03-10'), line('97110', '2026-03-09')];
    expect(pairedLine(original, 0, other)).toBe(other[1]);
    expect(pairedLine(original, 1, other)).toBe(other[0]);
    expect(pairedLine(original, 2, other)).toBeUndefined();
    expect(pairedLine(original, 0, [])).toBeUndefined();
  });

  const arbitraryLine = fc.record({
    procedureCode: fc.constantFrom('97110', '97140'),
    modifiers: fc.constantFrom<readonly string[]>([], ['59'], ['GP'], ['', '59']),
    units: fc.constantFrom<string | null>('1.000', '2.000', null),
    serviceDate: fc.constantFrom<string | null>('2026-03-09', '2026-03-10', null),
  });

  it('pairs one to one, only lines of the same code and date, and a claim with itself line for line (property)', () => {
    fc.assert(
      fc.property(fc.array(arbitraryLine, { maxLength: 8 }), fc.array(arbitraryLine, { maxLength: 8 }), (original, other) => {
        const pairs = pairLines(original, other);
        const used = pairs.filter((at): at is number => at !== null);
        expect(new Set(used).size).toBe(used.length);
        pairs.forEach((at, index) => {
          if (at !== null) {
            expect([other[at]?.procedureCode, other[at]?.serviceDate]).toEqual([original[index]?.procedureCode, original[index]?.serviceDate]);
          }
        });
        expect(pairLines(original, original)).toEqual(original.map((_, index) => index));
      }),
    );
  });
});

describe('pairing, by fixed examples', () => {
  it('ignores an empty modifier position when it chooses among lines of one code and date', () => {
    const other = [line('97110', '2026-03-09', ['GP']), line('97110', '2026-03-09', ['59'])];
    expect(pairLines([line('97110', '2026-03-09', ['', '59'])], other)).toEqual([1]);
  });

  it('compares modifiers position by position, never as one run of characters', () => {
    const other = [line('97110', '2026-03-09', ['12', '3']), line('97110', '2026-03-09', ['1', '23'])];
    expect(pairLines([line('97110', '2026-03-09', ['1', '23'])], other)).toEqual([1]);
  });

  it('keeps a line paired by everything it holds out of the second pass, so the fallback pairs only what is left', () => {
    const original = [line('97110', '2026-03-09', ['59']), line('97110', '2026-03-09')];
    expect(pairLines(original, [line('97110', '2026-03-09', ['59']), line('97110', '2026-03-09', ['GP'])])).toEqual([0, 1]);
  });

  it('finds no paired line for an unpaired or absent line, whatever else the array of lines carries', () => {
    const original = [line('97110', '2026-03-09'), line('97140', '2026-03-09')];
    const stray = line('97140', '2026-03-09');
    // An array is an object: properties named "null" and "undefined" are never read as a line.
    const other = Object.assign([line('97110', '2026-03-09')], { null: stray, undefined: stray });
    expect(pairedLine(original, 0, other)).toBe(other[0]);
    expect(pairedLine(original, 1, other)).toBeUndefined();
    expect(pairedLine(original, 2, other)).toBeUndefined();
  });
});
