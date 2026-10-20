import { createHash } from 'node:crypto';

import { cents, formatCents } from '@tp/money';
import {
  SCALE_RELEASE_SHAPE,
  type ScaleReleaseShape,
  type SynthScreeningRow,
  type UploadShapeFacts,
  practiceShapeRows,
  smallUploadRows,
  uploadShapeFacts,
  uploadZips,
  worstShapeRows,
} from '@tp/synth';
import { SCREENING_COLUMNS, type ScreeningRow } from '@tp/worker/screening-format';

/**
 * The capacity test's uploads and scenarios (audit #53 part 1; docs/adr/0062, "Capacity under production limits"):
 * the SYNTHETIC rows packages/synth generates as the screening's own rows, as the CSV a prospect uploads (the
 * template's eight columns), and the five scenarios with each upload's ZIP, practice name and address, distinct across
 * scenarios so no screening replaces another. Synthetic data only: invented practices at synthetic.test addresses.
 */

export type UploadShape = 'practice' | 'worst' | 'small';

/** synth's rows as the screening's own (allowed totals as cents). */
export function screeningRows(rows: readonly SynthScreeningRow[]): ScreeningRow[] {
  return rows.map((row) => ({ ...row, modifiers: [...row.modifiers], allowedCents: cents(row.allowedCents) }));
}

/** The practice shape as the screening's rows: the large test's 50,000 (its own test holds the two equal). */
export function practiceShapeUpload(): ScreeningRow[] {
  return screeningRows(practiceShapeRows());
}

export function shapeRows(shape: UploadShape, release: ScaleReleaseShape = SCALE_RELEASE_SHAPE): SynthScreeningRow[] {
  switch (shape) {
    case 'practice':
      return practiceShapeRows();
    case 'worst':
      return worstShapeRows(release);
    case 'small':
      return smallUploadRows();
  }
}

/** A cell as a spreadsheet writes it: quoted when it holds a comma or a quote. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The upload a prospect sends: the template's header and one line per row, CRLF-terminated, allowed totals in dollars. */
export function uploadCsv(rows: readonly SynthScreeningRow[]): Buffer {
  const lines = [
    SCREENING_COLUMNS.join(','),
    ...rows.map((row) =>
      [row.procedureCode, row.modifiers.join(' '), String(row.units), row.placeOfService, row.payerProduct, row.serviceBand, formatCents(cents(row.allowedCents)), String(row.claimCount)].map(csvCell).join(','),
    ),
  ];
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}

/** One upload of a scenario: who sends it and where from. No name or address of a real practice or person. */
export interface UploadSpec {
  readonly id: string;
  readonly shape: UploadShape;
  readonly zip: string;
  readonly practiceName: string;
  readonly contactEmail: string;
  /** Submitted behind the scenario's large uploads (within a second of the last). */
  readonly behind: boolean;
}

export interface ScenarioSpec {
  readonly id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  readonly what: string;
  readonly uploads: readonly UploadSpec[];
  /** Start a fresh platform container (and, for S1, a fresh Postgres) before the scenario. */
  readonly freshPlatform: boolean;
  readonly freshPostgres: boolean;
}

const LETTERS = 'abcdefghij';
/** A practice name of letters only (no digits, which the form refuses in a name), distinct per upload. */
function practiceName(scenario: string, upload: number): string {
  const digits = `${scenario.slice(1)}${String(upload)}`;
  return `Synthetic Capacity Therapy ${[...digits].map((digit) => LETTERS.charAt(Number.parseInt(digit, 10))).join('')}`;
}

/** The five scenarios (the design's §3.4): each upload with its own ZIP in its own locality, name and address. */
export function scenarios(release: ScaleReleaseShape = SCALE_RELEASE_SHAPE): ScenarioSpec[] {
  // Five ZIPs per scenario at most (three large, one small; S1 to S3 use one), each set in distinct localities.
  const zips = uploadZips(release, 5, 4);
  const upload = (scenario: string, index: number, shape: UploadShape, behind = false): UploadSpec => ({
    id: `${scenario}-${String(index + 1)}`,
    shape,
    zip: zips[Number.parseInt(scenario.slice(1), 10) - 1]?.[index] ?? '',
    practiceName: practiceName(scenario, index + 1),
    contactEmail: `capacity.${scenario.toLowerCase()}.upload${String(index + 1)}@capacity-${scenario.toLowerCase()}.synthetic.test`,
    behind,
  });
  return [
    { id: 'S1', what: 'worst shape, one upload alone: fresh Postgres, fresh platform container', uploads: [upload('S1', 0, 'worst')], freshPlatform: true, freshPostgres: true },
    { id: 'S2', what: 'practice shape, one upload alone: fresh platform container', uploads: [upload('S2', 0, 'practice')], freshPlatform: true, freshPostgres: false },
    { id: 'S3', what: 'practice shape again in the same container (shared types held)', uploads: [upload('S3', 0, 'practice')], freshPlatform: false, freshPostgres: false },
    {
      id: 'S4',
      what: 'worst shape, three at once, a small one behind them: fresh platform container',
      uploads: [upload('S4', 0, 'worst'), upload('S4', 1, 'worst'), upload('S4', 2, 'worst'), upload('S4', 3, 'small', true)],
      freshPlatform: true,
      freshPostgres: false,
    },
    {
      id: 'S5',
      what: 'practice shape, three at once, a small one behind them: fresh platform container',
      uploads: [upload('S5', 0, 'practice'), upload('S5', 1, 'practice'), upload('S5', 2, 'practice'), upload('S5', 3, 'small', true)],
      freshPlatform: true,
      freshPostgres: false,
    },
  ];
}

/** What the report records of each shape: its counts against the release, never a row. */
export function shapeFacts(shape: UploadShape, release: ScaleReleaseShape = SCALE_RELEASE_SHAPE): UploadShapeFacts & { readonly sha256: string } {
  const rows = shapeRows(shape, release);
  return { ...uploadShapeFacts(rows, release), sha256: createHash('sha256').update(uploadCsv(rows)).digest('hex') };
}
