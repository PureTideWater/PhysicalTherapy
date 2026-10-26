import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import * as gateFloors from '../eval/floors';
import { BASELINE_FIELDS } from './baseline-format';
import { COMMITTED_FLOORS } from './evaluated';
import { FLOOR_KINDS, FLOORS_FORMAT, type Floors, belowFloors, floorPpm, meetsFloor, parseFloors, unsetFloors } from './floors-format';
import { type FieldTally, TALLY_KEYS } from './tally';

/**
 * The floors as production reads them (docs/adr/0070, Part 2): the same file, format and arithmetic as the
 * gate's (eval/floors.ts), so a key is served on exactly the floors a record was held to.
 */

const tally = fc.record(Object.fromEntries(TALLY_KEYS.map((key) => [key, fc.integer({ min: 0, max: 2_000 })])) as Record<keyof FieldTally, fc.Arbitrary<number>>);
const floorText = fc.oneof(
  fc.constantFrom('0', '1', '1.000000', '0.5', '0.95', '0.999999', '0.000001'),
  fc.integer({ min: 0, max: 999_999 }).map((ppm) => `0.${String(ppm).padStart(6, '0')}`),
);

describe('the floors production serves on', () => {
  it('are the committed eval/floors.json, read as the gate reads it', () => {
    expect(COMMITTED_FLOORS).toEqual(gateFloors.FLOORS);
    expect(COMMITTED_FLOORS).toEqual(gateFloors.readFloors());
    expect(FLOORS_FORMAT).toBe(gateFloors.FLOORS_FORMAT);
    expect(FLOOR_KINDS).toEqual(gateFloors.FLOOR_KINDS);
    expect(unsetFloors(COMMITTED_FLOORS)).toEqual(gateFloors.unsetFloors(gateFloors.FLOORS));
    expect(unsetFloors(COMMITTED_FLOORS)).toHaveLength(2 * BASELINE_FIELDS.length);
  });

  it('are the one implementation the gate uses, not a copy of it', () => {
    expect(gateFloors.parseFloors).toBe(parseFloors);
    expect(gateFloors.floorPpm).toBe(floorPpm);
    expect(gateFloors.meetsFloor).toBe(meetsFloor);
    expect(gateFloors.belowFloors).toBe(belowFloors);
    expect(gateFloors.unsetFloors).toBe(unsetFloors);
  });

  it('meet a floor exactly, in BigInt, at its edges and on arbitrary tallies (property)', () => {
    const every = (value: string | null) => Object.fromEntries(BASELINE_FIELDS.map((field) => [field, value])) as Floors['proposeContractTerms']['recall'];
    const at = (text: string) => ({ format: FLOORS_FORMAT, note: 'SYNTHETIC', proposeContractTerms: { recall: every(text), precision: every(text) } }) as Floors;
    const nineteenOfTwenty: FieldTally = { tp: 19, wrong: 0, extra: 0, rejected: 0, rejected_right: 0, rejected_extra: 0, missed: 1, widened: 0 };
    expect(meetsFloor(nineteenOfTwenty, 'recall', '0.95')).toBe(true);
    expect(meetsFloor(nineteenOfTwenty, 'recall', '0.950001')).toBe(false);
    expect(belowFloors(at('0.95'), Object.fromEntries(BASELINE_FIELDS.map((field) => [field, nineteenOfTwenty])) as Parameters<typeof belowFloors>[1])).toEqual([]);
    fc.assert(
      fc.property(tally, fc.constantFrom(...FLOOR_KINDS), floorText, (counts, kind, text) => {
        const { tp, wrong, extra, rejected, rejected_extra: rejectedExtra, missed, widened } = counts;
        // A widened scope field is a false negative, as the missed field /1 counted it (src/tally.ts asCounts, review M2).
        const denominator = BigInt(tp + (kind === 'recall' ? wrong + rejected + missed + widened : wrong + extra + rejected + rejectedExtra));
        expect(meetsFloor(counts, kind, text)).toBe(denominator === 0n || BigInt(tp) * 1_000_000n >= floorPpm(text) * denominator);
      }),
      { numRuns: 500 },
    );
  });
});
