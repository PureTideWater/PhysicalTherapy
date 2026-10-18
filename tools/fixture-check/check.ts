import { execFileSync } from 'node:child_process';
import { closeSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';

import { SyntheticSenderError, assertSyntheticFixture } from '@tp/synth';

/**
 * The repository's fixture check (Change Order 001, CO-03: "no file without the SYNTHSENDER marker can enter
 * fixtures"; docs/adr/0059): every file git would commit, tracked or untracked and not ignored, anywhere in the
 * tree, goes through the writer's own guard (assertSyntheticFixture in packages/synth/src/write.ts) when it is
 * one the guard reads. By name, every CSV, TSV and spreadsheet, and under fixtures/ and packages/synth/ every
 * .txt, .dat or extensionless file (a table there whatever its name); by content, every X12 interchange (with
 * or without a byte-order mark), every zip (an .xlsx among them, read sheet by sheet), every gzip and every
 * OLE2 file (a legacy .xls). `pnpm test` runs it on the tree (check.test.ts) and CI runs it as a step of its own
 * (`pnpm check:fixtures`) on the commit as it is, before `pnpm synth --all` regenerates the tree; after the
 * generation, CI fails unless fixtures/synthetic is unchanged.
 */

/** Files the guard reads by their name: its tables and the spreadsheets it refuses. */
const BY_NAME = /\.(?:csv|tsv|tab|psv|xlsx|xls|xlsm|xlsb|xltx|xltm|ods|fods|numbers)$/i;
/**
 * Under fixtures/ and packages/synth/, text files whose name does not say what they hold (.txt, .dat, no
 * extension): the guard reads one as a table when its lines split as one. Elsewhere in the tree a .txt is prose.
 */
const TEXT_BY_NAME = /^(?:fixtures|packages\/synth)\/(?:.*\/)?(?:[^/.]+|[^/]*\.(?:txt|text|dat|prn|asc))$/i;
/** The first bytes of the files the guard reads by their content: X12, a zip, OLE2 and gzip. */
const SIGNATURES = [Buffer.from('ISA'), Buffer.from('\uFEFFISA'), Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.from([0x1f, 0x8b])];
const HEAD = 8;

export interface FixtureProblem {
  /** The file's repository path. */
  readonly file: string;
  /** What the guard refused it for: the file and the rule, never a value from it. */
  readonly message: string;
}

export interface FixtureCheck {
  readonly checked: number;
  readonly problems: readonly FixtureProblem[];
}

/** The files git would commit under `root`: tracked, and untracked but not ignored. */
export function committableFiles(root: string): string[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return [...new Set(listed.split('\0').filter((file) => file !== ''))].sort();
}

function head(file: string): Buffer {
  const descriptor = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(HEAD);
    return buffer.subarray(0, readSync(descriptor, buffer, 0, HEAD, 0));
  } finally {
    closeSync(descriptor);
  }
}

/** True when the guard reads `file` (a repository path) whose first bytes are `start`. */
export function guardReads(file: string, start: Buffer): boolean {
  return BY_NAME.test(file) || TEXT_BY_NAME.test(file) || SIGNATURES.some((signature) => start.subarray(0, signature.length).equals(signature));
}

/**
 * Checks every committable file under `root` that the guard reads. A file git lists that is gone from the
 * working tree (deleted, not yet staged) or is not a regular file (a symbolic link, a submodule) is skipped:
 * git would not commit its bytes from here.
 */
export function checkFixtures(root: string, files: readonly string[] = committableFiles(root)): FixtureCheck {
  const problems: FixtureProblem[] = [];
  let checked = 0;
  for (const file of files) {
    const full = path.join(root, file);
    let regular: boolean;
    try {
      regular = lstatSync(full).isFile();
    } catch {
      continue;
    }
    if (!regular || !guardReads(file, head(full))) {
      continue;
    }
    checked += 1;
    try {
      assertSyntheticFixture(readFileSync(full), file);
    } catch (error) {
      if (!(error instanceof SyntheticSenderError)) {
        throw error;
      }
      problems.push({ file, message: error.message });
    }
  }
  return { checked, problems };
}
