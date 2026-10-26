import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type Floors, parseFloors } from '../src/floors-format';
import floorsFile from './floors.json' with { type: 'json' };

/**
 * The per-field recall and precision floors for proposeContractTerms (docs/adr/0070, Part 1; the audit's
 * item #84, "floors set by you and the specialist"). The gate's other rules compare a change with what it
 * replaces; a floor is the least a real provider must score at all, so a model that is merely no worse
 * than a poor one is still refused. A recall floor bounds what is missed or rejected; a precision floor
 * bounds junk candidates (`extra`, `rejected_extra`), which no other rule bounds.
 *
 * The values are the founder's and the contract specialist's, never the build's: floors.json ships with
 * every floor null, and a unit test holds it so. A null floor is unset, and a real provider is neither
 * recorded (eval/baseline.ts, `floor_unset`) nor served in production while any floor is unset: the gate
 * fails closed. The local provider, which answers with the reference answers, is never held to floors.
 *
 * The format and the arithmetic (decimal text, at most six places, compared exactly as parts per million
 * in BigInt, never as a float) are ../src/floors-format.ts's, the one implementation that both the gate
 * and production (../src/evaluated.ts) use, so a key is served on exactly the floors a record was held to.
 * This module adds only what reads a file, which src must not (src runs in the web app's bundle).
 */

export {
  FLOORS_FORMAT,
  FLOOR_KINDS,
  type FloorKind,
  type FloorRef,
  type Floors,
  belowFloors,
  floorPpm,
  floorsSchema,
  meetsFloor,
  parseFloors,
  unsetFloors,
} from '../src/floors-format';

export const FLOORS_PATH = path.resolve(import.meta.dirname, 'floors.json');

/** The committed floors (eval/floors.json). */
export const FLOORS: Floors = parseFloors(floorsFile);

/** Floors read from a file (a test's floors file; the CLI's --floors). */
export function readFloors(file: string = FLOORS_PATH): Floors {
  return parseFloors(JSON.parse(readFileSync(file, 'utf8')));
}
