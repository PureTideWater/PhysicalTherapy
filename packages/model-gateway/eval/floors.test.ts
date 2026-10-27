import { describe, expect, it } from 'vitest';

import { BASELINE_FIELDS } from '../src/baseline-format';
import { type FieldTally, ZERO_TALLY } from '../src/tally';
import { FLOORS, FLOORS_FORMAT, type Floors, belowFloors, floorPpm, meetsFloor, parseFloors, readFloors, unsetFloors } from './floors';

/** The per-field floors (docs/adr/0070, Part 1). The build never chooses their values: the founder and the specialist do. */

const tally = (counts: Partial<FieldTally>): FieldTally => ({ ...ZERO_TALLY, ...counts });
const every = (value: string | null) => Object.fromEntries(BASELINE_FIELDS.map((field) => [field, value])) as Floors['proposeContractTerms']['recall'];
const floors = (recall: string | null, precision: string | null): Floors => ({ format: FLOORS_FORMAT, note: 'SYNTHETIC', proposeContractTerms: { recall: every(recall), precision: every(precision) } });

describe('the committed floors', () => {
  it('ship with every recall and precision floor unset, so a real provider is neither recorded nor served', () => {
    expect(readFloors()).toEqual(FLOORS);
    expect(Object.values(FLOORS.proposeContractTerms.recall).every((floor) => floor === null)).toBe(true);
    expect(Object.values(FLOORS.proposeContractTerms.precision).every((floor) => floor === null)).toBe(true);
    expect(unsetFloors(FLOORS)).toHaveLength(2 * BASELINE_FIELDS.length);
    expect(Object.keys(FLOORS.proposeContractTerms.recall)).toEqual([...BASELINE_FIELDS]);
  });
});

describe('a floor', () => {
  it('is decimal text in [0, 1] with at most six places, read exactly as parts per million', () => {
    expect(floorPpm('0.95')).toBe(950_000n);
    expect(floorPpm('0.000001')).toBe(1n);
    expect(floorPpm('1')).toBe(1_000_000n);
    expect(floorPpm('1.000')).toBe(1_000_000n);
    expect(floorPpm('0')).toBe(0n);
    for (const text of ['1.01', '0.9999999', '.9', '95%', '0.95 ', '-0.1', '2', '']) {
      expect(() => floorPpm(text), text).toThrow();
      expect(() => parseFloors(floors(text, null)), text).toThrow();
    }
  });

  it('is met when tp × 10^6 ≥ ppm × (tp + fn) for recall and (tp + fp) for precision, exactly at the edge', () => {
    // 19 of 20: recall 0.95 exactly.
    expect(meetsFloor(tally({ tp: 19, missed: 1 }), 'recall', '0.95')).toBe(true);
    expect(meetsFloor(tally({ tp: 19, missed: 1 }), 'recall', '0.950001')).toBe(false);
    // A wrong value counts against both; a junk candidate against precision only.
    expect(meetsFloor(tally({ tp: 19, wrong: 1 }), 'precision', '0.95')).toBe(true);
    expect(meetsFloor(tally({ tp: 18, wrong: 1, extra: 1 }), 'precision', '0.95')).toBe(false);
    expect(meetsFloor(tally({ tp: 18, extra: 1, rejected_extra: 1 }), 'recall', '1')).toBe(true);
    // Nothing to count meets any floor.
    expect(meetsFloor(ZERO_TALLY, 'recall', '1')).toBe(true);
    expect(meetsFloor(tally({ extra: 1 }), 'recall', '1')).toBe(true);
    expect(meetsFloor(tally({ extra: 1 }), 'precision', '0.000001')).toBe(false);
  });

  it('lists every set floor a report falls below, and none that is unset', () => {
    const fields = Object.fromEntries(BASELINE_FIELDS.map((field) => [field, tally({ tp: 9, missed: 1 })])) as Record<(typeof BASELINE_FIELDS)[number], FieldTally>;
    expect(belowFloors(floors('0.9', '1'), fields)).toEqual([]);
    expect(belowFloors(floors(null, null), fields)).toEqual([]);
    const amountLow = { ...fields, amount: tally({ tp: 8, missed: 1, extra: 1 }) };
    expect(belowFloors(floors('0.9', '0.9'), amountLow)).toEqual([
      { field: 'amount', kind: 'recall' },
      { field: 'amount', kind: 'precision' },
    ]);
    expect(unsetFloors(floors('0.9', null))).toEqual(BASELINE_FIELDS.map((field) => ({ field, kind: 'precision' })));
  });
});
