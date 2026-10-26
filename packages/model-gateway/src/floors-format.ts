import { z } from 'zod';

import { BASELINE_FIELDS, type BaselineField } from './baseline-format';
import { type FieldTally, asCounts } from './tally';

/**
 * The floors' format and arithmetic, `tp-model-eval-floors/1` (docs/adr/0070, Parts 1 and 2;
 * eval/floors.json). It lives in src, beside the baseline's format (./baseline-format.ts), because two
 * readers hold a report or an entry to the same floors: the gate (eval/baseline.ts, through eval/floors.ts),
 * which refuses to record a real provider below or without them, and production (./evaluated.ts), which
 * serves contract proposals on a real provider only while every floor is set and the entry meets it, so a
 * floor raised after recording switches the feature off until it is met. src runs in the web app's
 * bundle, so this module reads no file: the committed floors are imported as JSON by ./evaluated.ts.
 *
 * A recall floor bounds what is missed or rejected; a precision floor bounds junk candidates (`extra`,
 * `rejected_extra`). The values are the founder's and the contract specialist's, never the build's:
 * floors.json ships with every floor null, and a null floor is unset, which fails closed for a real
 * provider in the gate and in serving alike.
 *
 * A floor is decimal text, at most six places, in [0, 1] ("0.95", "1"), compared exactly as parts per
 * million in BigInt, never as a float: a recall floor is met when tp × 10^6 ≥ ppm × (tp + fn), a precision
 * floor when tp × 10^6 ≥ ppm × (tp + fp), with fp and fn derived from the field's tally (./tally.ts
 * asCounts). A field with nothing to count (a zero denominator) meets any floor.
 */

export const FLOORS_FORMAT = 'tp-model-eval-floors/1';

export const FLOOR_KINDS = ['recall', 'precision'] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];

/** A floor's text: 0, 1, or a decimal between them, with at most six places. */
const FLOOR = /^(0(\.\d{1,6})?|1(\.0{1,6})?)$/;

const floor = z.string().regex(FLOOR).nullable();
const byField = z.strictObject(Object.fromEntries(BASELINE_FIELDS.map((field) => [field, floor])) as Record<BaselineField, typeof floor>);

export const floorsSchema = z.strictObject({
  format: z.literal(FLOORS_FORMAT),
  note: z.string(),
  proposeContractTerms: z.strictObject({ recall: byField, precision: byField }),
});

export type Floors = z.output<typeof floorsSchema>;

export function parseFloors(value: unknown): Floors {
  return floorsSchema.parse(value);
}

/** A floor's text as parts per million, exactly ("0.95" is 950000n). */
export function floorPpm(text: string): bigint {
  if (!FLOOR.test(text)) {
    throw new Error('a floor is decimal text in [0, 1] with at most six places');
  }
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

export interface FloorRef {
  readonly field: BaselineField;
  readonly kind: FloorKind;
}

/** Every floor that is unset (null), recall floors first, each in field order. */
export function unsetFloors(floors: Floors): FloorRef[] {
  return FLOOR_KINDS.flatMap((kind) => BASELINE_FIELDS.filter((field) => floors.proposeContractTerms[kind][field] === null).map((field) => ({ field, kind })));
}

/** Whether a field's tally meets a floor of the kind: tp × 10^6 ≥ ppm × (tp + fn), or (tp + fp) for precision. */
export function meetsFloor(tally: FieldTally, kind: FloorKind, text: string): boolean {
  const { tp, fp, fn } = asCounts(tally);
  const denominator = BigInt(tp + (kind === 'recall' ? fn : fp));
  return denominator === 0n || BigInt(tp) * 1_000_000n >= floorPpm(text) * denominator;
}

/** Every set floor a report's or an entry's field tallies fall below, recall floors first, each in field order. Unset floors are unsetFloors'. */
export function belowFloors(floors: Floors, fields: Readonly<Record<BaselineField, FieldTally>>): FloorRef[] {
  return FLOOR_KINDS.flatMap((kind) =>
    BASELINE_FIELDS.filter((field) => {
      const text = floors.proposeContractTerms[kind][field];
      return text !== null && !meetsFloor(fields[field], kind, text);
    }).map((field) => ({ field, kind })),
  );
}
