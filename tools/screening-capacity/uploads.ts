import { createHash } from 'node:crypto';

import { cents, formatCents } from '@tp/money';
import {
  SCALE_RELEASE_SHAPE,
  type ScaleReleaseShape,
  type SynthScreeningRow,
  type UploadShapeFacts,
  practiceShapeRows,
  scalePlusFourRanges,
  scaleZips,
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
 * scenarios so no screening replaces another, each address at a domain of its own, so each upload is its own rate-limit
 * account (a different prospect, as audit #53 intends) and none crosses an account's daily share into the waiting tier
 * (the founder's Q7 of 2026-10-21). S1, S4 and S5 start from a cold Postgres (restarted, the page cache dropped), and
 * S1, S2, S4 and S5 from a fresh consumer (its threads' shared types cold); S4's three worst uploads are worst-shape variants 1 to 3, so they differ from S1's rows and from each other
 * in most of their codes, sharing the release's pooled and corrected codes, which every worst upload prices. S1's
 * second upload (S1-2, the small shape behind S1-1) is sent from a ZIP the release splits across localities, with a
 * ZIP+4 in the next locality's range (PR 6b, docs/adr/0064): its run's keyed read must hold the ZIP's ZIP9 record, and
 * its rows are compared with a whole-release oracle (oracle.ts), since the frozen 3c1b289 pricer takes a five-digit ZIP
 * alone. Synthetic data only: invented practices at synthetic.test addresses.
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

export function shapeRows(shape: UploadShape, release: ScaleReleaseShape = SCALE_RELEASE_SHAPE, variant = 0): SynthScreeningRow[] {
  switch (shape) {
    case 'practice':
      return practiceShapeRows();
    case 'worst':
      return worstShapeRows(release, undefined, undefined, variant);
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
  /** The ZIP+4's four digits, typed after the ZIP as 12345-6789, for a ZIP the release splits across localities; else null. */
  readonly zipPlusFour: string | null;
  readonly practiceName: string;
  readonly contactEmail: string;
  /** Submitted behind the scenario's large uploads, once their runs exist. */
  readonly behind: boolean;
  /** The worst shape's variant (0 for the other shapes). */
  readonly variant: number;
}

export interface ScenarioSpec {
  readonly id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  readonly what: string;
  readonly uploads: readonly UploadSpec[];
  /** Start fresh screening consumer containers before the scenario, so its threads hold no shared types. */
  readonly freshConsumer: boolean;
  /** Restart Postgres and drop the page cache before it (every service starts again after it). */
  readonly freshPostgres: boolean;
}

const LETTERS = 'abcdefghij';
/** A practice name of letters only (no digits, which the form refuses in a name), distinct per upload. */
function practiceName(scenario: string, upload: number): string {
  const digits = `${scenario.slice(1)}${String(upload)}`;
  return `Synthetic Capacity Therapy ${[...digits].map((digit) => LETTERS.charAt(Number.parseInt(digit, 10))).join('')}`;
}

/**
 * The split ZIP S1-2 is sent from: the release's first ZIP whose locality needs its ZIP+4 (never one of the other
 * uploads', which are drawn from the ZIPs that need none), with the first code of its second range, which the ZIP9 file
 * puts in the next locality, so the range, not the ZIP's own record, decides the locality.
 */
export function splitZip(release: ScaleReleaseShape = SCALE_RELEASE_SHAPE): { readonly zip: string; readonly zipPlusFour: string } {
  const zip = scaleZips(release).find((entry) => entry.plusFour);
  const range = zip === undefined ? undefined : scalePlusFourRanges(release, zip)[1];
  if (zip === undefined || range === undefined) {
    throw new RangeError('the release splits no ZIP across localities');
  }
  return { zip: zip.zip, zipPlusFour: range.from };
}

/** The ZIP as a prospect types it: five digits, or ZIP+4 as 12345-6789. */
export function typedZip(upload: Pick<UploadSpec, 'zip' | 'zipPlusFour'>): string {
  return upload.zipPlusFour === null ? upload.zip : `${upload.zip}-${upload.zipPlusFour}`;
}

/**
 * The rate-limit account an upload's address belongs to: its domain (synthetic.test is no free-mail provider, so the
 * screening's limiter keys a business domain; apps/web/src/lib/screening/rate.ts).
 */
export function uploadAccountDomain(upload: Pick<UploadSpec, 'contactEmail'>): string {
  return upload.contactEmail.slice(upload.contactEmail.indexOf('@') + 1);
}

/** The five scenarios (the design's §3.4): each upload with its own ZIP in its own locality, name, address and domain. */
export function scenarios(release: ScaleReleaseShape = SCALE_RELEASE_SHAPE): ScenarioSpec[] {
  // Five ZIPs per scenario at most (three large, one small; S1 to S3 use one), each set in distinct localities.
  const zips = uploadZips(release, 5, 4);
  const upload = (scenario: string, index: number, shape: UploadShape, behind = false, variant = 0): UploadSpec => ({
    id: `${scenario}-${String(index + 1)}`,
    shape,
    zip: zips[Number.parseInt(scenario.slice(1), 10) - 1]?.[index] ?? '',
    zipPlusFour: null,
    practiceName: practiceName(scenario, index + 1),
    // One domain per upload, so one rate-limit account each (the design's §3.4).
    contactEmail: `capacity.${scenario.toLowerCase()}.upload${String(index + 1)}@capacity-${scenario.toLowerCase()}-upload${String(index + 1)}.synthetic.test`,
    behind,
    variant,
  });
  const split = splitZip(release);
  return [
    {
      id: 'S1',
      what: 'worst shape, one upload alone, then a small one behind it from a ZIP split across localities with its ZIP+4: fresh Postgres, fresh consumer',
      uploads: [upload('S1', 0, 'worst'), { ...upload('S1', 1, 'small', true), ...split }],
      freshConsumer: true,
      freshPostgres: true,
    },
    { id: 'S2', what: 'practice shape, one upload alone: fresh consumer', uploads: [upload('S2', 0, 'practice')], freshConsumer: true, freshPostgres: false },
    // The consumer hands a run to its first idle thread, so S3's run goes to the thread that priced S2's.
    { id: 'S3', what: 'practice shape again in the same consumer (shared types held by the thread that priced S2)', uploads: [upload('S3', 0, 'practice')], freshConsumer: false, freshPostgres: false },
    {
      id: 'S4',
      what: 'worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer',
      uploads: [upload('S4', 0, 'worst', false, 1), upload('S4', 1, 'worst', false, 2), upload('S4', 2, 'worst', false, 3), upload('S4', 3, 'small', true)],
      freshConsumer: true,
      freshPostgres: true,
    },
    {
      id: 'S5',
      what: 'practice shape, three at once (three prospects), a small one behind them: fresh Postgres, fresh consumer',
      uploads: [upload('S5', 0, 'practice'), upload('S5', 1, 'practice'), upload('S5', 2, 'practice'), upload('S5', 3, 'small', true)],
      freshConsumer: true,
      freshPostgres: true,
    },
  ];
}

/** What the report records of each shape: its counts against the release, never a row. */
export function shapeFacts(shape: UploadShape, release: ScaleReleaseShape = SCALE_RELEASE_SHAPE, variant = 0): UploadShapeFacts & { readonly sha256: string } {
  const rows = shapeRows(shape, release, variant);
  return { ...uploadShapeFacts(rows, release), sha256: createHash('sha256').update(uploadCsv(rows)).digest('hex') };
}
