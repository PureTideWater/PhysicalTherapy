/**
 * Writes generated cases under fixtures/synthetic and checks the committed fixtures against a fresh
 * generation. Every file is checked by assertSyntheticFixture before anything is written: an X12 file for
 * the synthetic sender (ISA06 SYNTHSENDER, GS02 SYNTH, in every interchange, a byte-order mark or a zip
 * around it included), a CSV, TSV or .xlsx for SYNTHSENDER in an identifier column (docs/adr/0059). Nothing
 * outside a case's own directory is touched: never cms/ or rules/, never a README.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readZip } from './formats/zip';
import { Archive, ArchiveReadError, isZip } from './guard/archive';
import { isPinnedTable, repositoryPath } from './guard/pinned';
import { type Separator, TableReadError, markerProblem, readTable } from './guard/tabular';
import { vendorMarkerColumn } from './guard/vendors';
import { WorkbookReadError, isOpenDocumentSpreadsheet, isWorkbook, workbookSheets } from './guard/xlsx';
import { SYNTH_GS02, SYNTH_ISA06, SYNTH_SENDER_ID } from './identity';
import { type GeneratedCase } from './cases/builder';

export class SyntheticSenderError extends Error {
  override readonly name = 'SyntheticSenderError';
}

const ISA_LENGTH = 106;
const WHITESPACE = /[\r\n\t ]/;

function checkIsa(fields: readonly string[], label: string): void {
  // A header cut inside ISA06 must still be the start of the synthetic sender.
  const sender = fields[6];
  if (sender !== undefined && (fields.length > 7 ? sender !== SYNTH_ISA06 : !SYNTH_ISA06.startsWith(sender))) {
    throw new SyntheticSenderError(`${label}: ISA06 is not ${SYNTH_ISA06.trim()}`);
  }
}

/**
 * Throws unless every interchange in `bytes` has the synthetic sender (and every zip entry too). The file
 * is walked interchange by interchange, as the parser reads it: each ISA's own element separator and
 * terminator split the segments that follow it, so a second interchange with other delimiters is checked
 * too.
 */
export function assertSyntheticX12(bytes: Uint8Array, label: string): void {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    for (const entry of readZip(bytes)) {
      assertSyntheticX12(entry.bytes, `${label}!${entry.name}`);
    }
    return;
  }
  let text = buffer.toString('latin1');
  if (text.startsWith('ï»¿')) {
    text = text.slice(3);
  }
  if (!text.startsWith('ISA')) {
    return;
  }
  let element = '';
  let terminator = '';
  let position = 0;
  while (position < text.length) {
    // No segment begins with whitespace (a blank line, a line break after a terminator).
    while (position < text.length && WHITESPACE.test(text.charAt(position))) {
      position += 1;
    }
    if (text.startsWith('ISA', position)) {
      element = text.charAt(position + 3);
      const header = text.slice(position, position + ISA_LENGTH);
      checkIsa(header.slice(0, ISA_LENGTH - 1).split(element), label);
      if (header.length < ISA_LENGTH) {
        return;
      }
      terminator = header.charAt(ISA_LENGTH - 1);
      position += ISA_LENGTH;
      continue;
    }
    const end = text.indexOf(terminator, position);
    const fields = text.slice(position, end < 0 ? text.length : end).split(element);
    if (fields[0] === 'GS' && fields.length > 2 && fields[2] !== SYNTH_GS02) {
      throw new SyntheticSenderError(`${label}: GS02 is not ${SYNTH_GS02}`);
    }
    position = end < 0 ? text.length : end + 1;
  }
}

/** The tabular fixtures the marker rule reads, by extension, and the separator each is read with. */
const TABULAR: Readonly<Record<string, Separator>> = { '.csv': ',', '.tsv': '\t' };
/** Spreadsheets no fixture may be: binary, macro-enabled, template or OpenDocument workbooks. */
const REFUSED_SPREADSHEETS = new Set(['.xls', '.xlsm', '.xlsb', '.xltx', '.xltm', '.ods', '.fods', '.numbers']);
/** A zip inside a zip is read this many levels deep and no deeper. */
const MAX_ARCHIVE_DEPTH = 3;
const OLE2 = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const utf8 = new TextDecoder('utf-8', { fatal: true });

/** The repository directory writeCases writes; a file's label there is its repository path. */
export const SYNTHETIC_FIXTURES = 'fixtures/synthetic';

const refuse = (label: string, rule: string) => new SyntheticSenderError(`${label}: ${rule}`);
/** The marker rule, as a refusal states it after what the file lacks. */
const MARKER_RULE = `${SYNTH_SENDER_ID} in an identifier column, such as a payee or sender ID, of every data row`;

function extensionOf(label: string): string {
  return path.posix.extname(label.split('!').at(-1) ?? '').toLowerCase();
}

function assertTable(bytes: Uint8Array, label: string, separator: Separator): void {
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    throw refuse(label, 'a tabular fixture is UTF-8 text');
  }
  let rows: string[][];
  try {
    rows = readTable(text, separator);
  } catch (error) {
    if (!(error instanceof TableReadError)) {
      throw error;
    }
    throw refuse(label, `it cannot be read as ${separator === ',' ? 'CSV' : 'TSV'} (${error.message})`);
  }
  const problem = markerProblem(rows, { markerColumn: vendorMarkerColumn(label) });
  if (problem !== null) {
    throw refuse(label, `${problem} (a tabular fixture carries ${MARKER_RULE})`);
  }
}

function assertWorkbook(archive: Archive, label: string): void {
  const markerColumn = vendorMarkerColumn(label);
  let withData = 0;
  for (const sheet of workbookSheets(archive)) {
    if (sheet.rows.every((row) => row.every((cell) => cell.trim() === ''))) {
      continue;
    }
    withData += 1;
    const problem = markerProblem(sheet.rows, { markerColumn });
    if (problem !== null) {
      throw refuse(`${label}!${sheet.part}`, `${problem} (every sheet of a workbook fixture that holds data carries ${MARKER_RULE})`);
    }
  }
  if (withData === 0) {
    throw refuse(label, `no sheet holds data (a workbook fixture carries ${MARKER_RULE})`);
  }
}

function assertArchive(bytes: Uint8Array, label: string, depth: number): void {
  const extension = extensionOf(label);
  try {
    const archive = new Archive(bytes);
    if (isWorkbook(archive)) {
      if (extension !== '.xlsx') {
        throw refuse(label, 'a workbook fixture is an .xlsx file, and this is a workbook under another name');
      }
      assertWorkbook(archive, label);
      return;
    }
    if (extension === '.xlsx') {
      throw refuse(label, 'an .xlsx fixture is a workbook, and this archive has no workbook part');
    }
    if (isOpenDocumentSpreadsheet(archive)) {
      throw refuse(label, 'an OpenDocument spreadsheet is refused; write a CSV, TSV or .xlsx');
    }
    for (const name of archive.names()) {
      checkFixture(archive.read(name) as Uint8Array, `${label}!${name}`, depth + 1);
    }
  } catch (error) {
    if (error instanceof ArchiveReadError || error instanceof WorkbookReadError) {
      throw refuse(label, `the archive cannot be read by the fixture guard (${error.message})`);
    }
    throw error;
  }
}

function checkFixture(bytes: Uint8Array, label: string, depth: number): void {
  if (depth > MAX_ARCHIVE_DEPTH) {
    throw refuse(label, `archives nest more than ${String(MAX_ARCHIVE_DEPTH)} deep`);
  }
  const extension = extensionOf(label);
  if (REFUSED_SPREADSHEETS.has(extension)) {
    throw refuse(label, `${extension} fixtures are refused; write a CSV, TSV or .xlsx`);
  }
  if (bytes.length >= OLE2.length && OLE2.equals(Buffer.from(bytes.buffer, bytes.byteOffset, OLE2.length))) {
    throw refuse(label, 'a legacy binary Office file (OLE2, such as an .xls) is refused');
  }
  if (isZip(bytes)) {
    assertArchive(bytes, label, depth);
    return;
  }
  if (extension === '.xlsx') {
    throw refuse(label, 'an .xlsx fixture is a workbook, and this is not a zip');
  }
  assertSyntheticX12(bytes, label);
  const separator = TABULAR[extension];
  if (separator !== undefined) {
    assertTable(bytes, label, separator);
  }
}

/**
 * Throws SyntheticSenderError unless `bytes` may be a fixture. `label` is the file's repository path
 * (fixtures/synthetic/LED-04/posting-export.csv) or a name for it; errors name it and the rule broken,
 * never a cell's value.
 *
 * - X12 content goes to assertSyntheticX12, whatever the file is called.
 * - A .csv or .tsv carries SYNTHSENDER in every data row of one identifier column (the column the vendor
 *   format registry names for a file under emr/<format_id>/, else a column whose header says ID): the
 *   marker rule in guard/tabular.ts.
 * - An .xlsx is read with the guard's own bounded reader, and every sheet with data meets the same rule.
 * - .xls, .xlsm, .xlsb, .ods and other spreadsheets, and OLE2 content, are refused.
 * - A zip is read entry by entry (stored or deflated, within the guard's caps), each entry checked as a
 *   file of its own name; a zip it cannot read is refused.
 * - A table listed in guard/pinned-tables.json passes at its path with its exact bytes.
 */
export function assertSyntheticFixture(bytes: Uint8Array, label: string): void {
  if (isPinnedTable(label, bytes)) {
    return;
  }
  checkFixture(bytes, repositoryPath(label), 0);
}

/** Directories under fixtures/synthetic that packages/synth never writes or removes. */
const FOREIGN = new Set(['cms', 'rules', 'variants']);
const CASE_DIR = /^[A-Z]{3}-\d{2}$/;
/** Generated output inside a case directory, ignored by git (PAR-29/generated). */
const IGNORED = 'generated';

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== IGNORED) {
        found.push(...listFiles(full, base));
      }
    } else if (entry.isFile()) {
      found.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

/** The case directories under `root` (fixtures/synthetic) that the registry owns or once owned. */
export function ownedDirectories(root: string): string[] {
  const dirs: string[] = [];
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && !FOREIGN.has(entry.name) && CASE_DIR.test(entry.name)) {
        dirs.push(entry.name);
      }
    }
    const variants = path.join(root, 'variants');
    if (existsSync(variants)) {
      for (const entry of readdirSync(variants, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          dirs.push(`variants/${entry.name}`);
        }
      }
    }
  }
  return dirs.sort();
}

export interface Drift {
  /** Generated files missing on disk or with other bytes. */
  readonly changed: string[];
  /** Files on disk in an owned directory that the generation does not produce. */
  readonly extra: string[];
}

/** Compares a generation with what is on disk under `root`, without writing anything. */
export function driftFrom(root: string, cases: readonly GeneratedCase[], scope: 'all' | 'cases' = 'all'): Drift {
  const changed: string[] = [];
  const expected = new Set<string>();
  for (const generated of cases) {
    for (const file of generated.files) {
      expected.add(file.path);
      const target = path.join(root, file.path);
      if (!existsSync(target) || !Buffer.from(file.bytes).equals(readFileSync(target))) {
        changed.push(file.path);
      }
    }
  }
  const dirs = scope === 'all' ? ownedDirectories(root) : cases.map((generated) => generated.dir);
  const extra = dirs.flatMap((dir) => listFiles(path.join(root, dir)).map((file) => `${dir}/${file}`)).filter((file) => !expected.has(file));
  return { changed: changed.sort(), extra: extra.sort() };
}

export interface WriteResult {
  readonly written: string[];
  readonly unchanged: number;
  readonly removed: string[];
}

/**
 * Writes the cases under `root`, removing stale files in their directories. With scope 'all', case
 * directories the registry no longer has are removed too.
 */
export function writeCases(root: string, cases: readonly GeneratedCase[], scope: 'all' | 'cases'): WriteResult {
  // Every file is checked before any is written. A file's label is the path it has in the repository,
  // which is what guard/pinned-tables.json lists.
  for (const generated of cases) {
    for (const file of generated.files) {
      assertSyntheticFixture(file.bytes, `${SYNTHETIC_FIXTURES}/${file.path}`);
    }
  }
  const drift = driftFrom(root, cases, scope);
  const changed = new Set(drift.changed);
  const written: string[] = [];
  let unchanged = 0;
  for (const generated of cases) {
    for (const file of generated.files) {
      if (!changed.has(file.path)) {
        unchanged += 1;
        continue;
      }
      const target = path.join(root, file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, file.bytes);
      written.push(file.path);
    }
  }
  for (const file of drift.extra) {
    rmSync(path.join(root, file));
  }
  const keep = new Set(cases.map((generated) => generated.dir));
  if (scope === 'all') {
    for (const dir of ownedDirectories(root)) {
      const full = path.join(root, dir);
      if (!keep.has(dir) && statSync(full).isDirectory() && listFiles(full).length === 0) {
        rmSync(full, { recursive: true, force: true });
      }
    }
  }
  return { written, unchanged, removed: drift.extra };
}
