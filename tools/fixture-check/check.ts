import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { SyntheticSenderError, assertSyntheticFixture, assertSyntheticHeaders, searchableText, startsInterchange } from '@tp/synth';

/**
 * The repository's fixture check (Change Order 001, CO-03: "no file without the SYNTHSENDER marker can enter
 * fixtures"; docs/adr/0059): every file git would commit, tracked or untracked and not ignored, anywhere in the
 * tree, goes through the writer's own guard (assertSyntheticFixture in packages/synth/src/write.ts) when it is
 * one the guard reads. By name, every CSV, TSV and spreadsheet, every .835, .837, .edi, .x12 and .era file, and
 * under fixtures/ and packages/synth/ every .txt, .dat or extensionless file (a table there whatever its name); by
 * content, every X12 interchange (ISA after white space or a UTF-8 or UTF-16 byte-order mark, within the first
 * kilobyte), every zip (an .xlsx among them, read sheet by sheet), every gzip, every OLE2 file (a legacy .xls) and
 * every PDF, which passes only when packages/synth wrote it. An image is not read: no rule can tell a picture of a
 * real document from a synthetic one. And every text file, whatever its name and wherever it is, is searched for an X12
 * interchange header anywhere in it (after a line of other text, mid-line, in a Markdown code block), refused when its
 * ISA06 is not SYNTHSENDER: the rule the edit hook applies to every text a session writes (.claude/hooks/
 * fixture-guard.sh; assertSyntheticHeaders in packages/synth/src/write.ts), so a header pasted after a line of prose in a
 * .md or .txt anywhere is found too, and prose that only names the segment is not. `pnpm test` runs it on the tree
 * (check.test.ts) and CI runs it as a step of its own
 * (`pnpm check:fixtures`) on the commit as it is, before `pnpm synth --all` regenerates the tree; after the
 * generation, CI fails unless fixtures/synthetic is unchanged.
 */

/** Files the guard reads by their name: its tables, the spreadsheets it refuses, and X12 files by their usual names. */
const BY_NAME = /\.(?:csv|tsv|tab|psv|xlsx|xls|xlsm|xlsb|xltx|xltm|ods|fods|numbers|835|837|edi|x12|era)$/i;
/**
 * Under fixtures/ and packages/synth/, text files whose name does not say what they hold (.txt, .dat, no
 * extension): the guard reads one as a table when its lines split as one. Elsewhere in the tree a .txt is prose.
 */
const TEXT_BY_NAME = /^(?:fixtures|packages\/synth)\/(?:.*\/)?(?:[^/.]+|[^/]*\.(?:txt|text|dat|prn|asc))$/i;
/** The first bytes of the files the guard reads by their content besides X12: a zip, OLE2, gzip and a PDF. */
const SIGNATURES = [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.from([0x1f, 0x8b]), Buffer.from('%PDF-', 'latin1')];
/** How much of a file's start is read to decide: an interchange may follow white space or a byte-order mark. */
export const HEAD = 1024;

export interface FixtureProblem {
  /** The file's repository path. */
  readonly file: string;
  /** What the guard refused it for: the file and the rule, never a value from it. */
  readonly message: string;
}

export interface FixtureCheck {
  /** The files the guard read. */
  readonly checked: number;
  /** The text files searched for an X12 interchange header (every file but a binary one). */
  readonly searched: number;
  readonly problems: readonly FixtureProblem[];
}

/** The files git would commit under `root`: tracked, and untracked but not ignored. */
export function committableFiles(root: string): string[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return [...new Set(listed.split('\0').filter((file) => file !== ''))].sort();
}

/** True when the guard reads `file` (a repository path) whose first bytes are `start`. */
export function guardReads(file: string, start: Buffer): boolean {
  return BY_NAME.test(file) || TEXT_BY_NAME.test(file) || SIGNATURES.some((signature) => start.subarray(0, signature.length).equals(signature)) || startsInterchange(start.subarray(0, HEAD));
}

/** What checking one file's bytes found: whether the guard read it, whether its text was searched, and its refusal. */
export interface FileCheck {
  readonly read: boolean;
  readonly searched: boolean;
  /** The guard's refusal, or the header search's when the guard let the file through; null when neither refused it. */
  readonly problem: string | null;
}

function refusal(check: () => unknown): string | null {
  try {
    check();
    return null;
  } catch (error) {
    if (!(error instanceof SyntheticSenderError)) {
      throw error;
    }
    return error.message;
  }
}

/**
 * Checks one file, `bytes` at repository path `file`: the guard when it reads the file, then the header search over
 * its text, unless the guard already refused it (one refusal a file). The tree check and the commits check share it.
 */
export function checkFile(file: string, bytes: Buffer): FileCheck {
  const read = guardReads(file, bytes.subarray(0, HEAD));
  const guarded = read ? refusal(() => assertSyntheticFixture(bytes, file)) : null;
  const text = guarded === null ? searchableText(bytes) : null;
  return { read, searched: text !== null, problem: guarded ?? (text === null ? null : refusal(() => assertSyntheticHeaders(text, file))) };
}

/**
 * Checks every committable file under `root`: the guard over each file it reads, and the header search over every
 * text file. A file git lists that is gone from the working tree (deleted, not yet staged) or is not a regular file (a
 * symbolic link, a submodule) is skipped: git would not commit its bytes from here.
 */
export function checkFixtures(root: string, files: readonly string[] = committableFiles(root)): FixtureCheck {
  const problems: FixtureProblem[] = [];
  let checked = 0;
  let searched = 0;
  for (const file of files) {
    const full = path.join(root, file);
    let regular: boolean;
    try {
      regular = lstatSync(full).isFile();
    } catch {
      continue;
    }
    if (!regular) {
      continue;
    }
    const result = checkFile(file, readFileSync(full));
    checked += result.read ? 1 : 0;
    searched += result.searched ? 1 : 0;
    if (result.problem !== null) {
      problems.push({ file, message: result.problem });
    }
  }
  return { checked, searched, problems };
}
