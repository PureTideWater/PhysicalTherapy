/**
 * Writes generated cases under fixtures/synthetic and checks the committed fixtures against a fresh
 * generation. Every X12 file is checked for the synthetic sender before it is written (ISA06
 * SYNTHSENDER, GS02 SYNTH, in every interchange, a byte-order mark or a zip around it included), and
 * nothing outside a case's own directory is touched: never cms/ or rules/, never a README.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readZip } from './formats/zip';
import { SYNTH_GS02, SYNTH_ISA06 } from './identity';
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
  for (const generated of cases) {
    for (const file of generated.files) {
      assertSyntheticX12(file.bytes, file.path);
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
