/**
 * The large tier of the contract evaluation set v2 (test matrix MOD-09; docs/adr/0070 Part 1): L01-L05,
 * 40- and 80-page agreements and exhibits to 60 codes, about 6-8 MB with L03's 80 page images. They are
 * generated when a test needs them, as PAR-29's 10,000-claim file is, into
 * fixtures/synthetic/MOD-09/generated/ (ignored by git), and held to the SHA-256 of every file that
 * MOD-09's committed expected.json records (its `generated` entries), so a generator change that is not
 * regenerated and committed is refused rather than evaluated. Every image is run-length encoded
 * (formats/scan.ts), so the hashes depend on no zlib build.
 *
 * Writing is safe under parallel test workers: each writer writes the whole tier into a fresh
 * temporary directory inside the ignored one and renames each file into place (a rename within one file
 * system is atomic), so no reader ever sees a half-written file, and two writers write the same bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CONTRACT_SET_V2_CASE, LARGE_CONTRACT_DIR, contractSetV2Large } from './contract-set-v2';

export interface LargeContractFile {
  /** Relative to fixtures/synthetic (MOD-09/generated/<id>-<layout>/<name>). */
  readonly path: string;
  readonly sha256: string;
  /** The file's size in bytes. */
  readonly bytes: number;
  readonly description: string;
  readonly data: Uint8Array;
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

let rendered: readonly LargeContractFile[] | null = null;

/** Every file of the large tier, rendered once per process: path, SHA-256, size, description and bytes. */
export function largeContractFacts(): readonly LargeContractFile[] {
  rendered ??= contractSetV2Large().flatMap((item) =>
    item.render().map((file) => {
      const data = typeof file.bytes === 'string' ? new Uint8Array(Buffer.from(file.bytes, 'utf8')) : file.bytes;
      return { path: `${LARGE_CONTRACT_DIR}/${item.dir}/${file.path}`, sha256: sha256(data), bytes: data.length, description: file.description, data };
    }),
  );
  return rendered;
}

/** The hashes MOD-09's committed expected.json pins for the large tier, by path. */
function pinnedHashes(root: string): Map<string, string> {
  const file = path.join(root, CONTRACT_SET_V2_CASE, 'expected.json');
  if (!existsSync(file)) {
    throw new Error(`${CONTRACT_SET_V2_CASE}/expected.json is not there: run pnpm synth --all`);
  }
  const expected = JSON.parse(readFileSync(file, 'utf8')) as { readonly generated?: readonly { readonly path: string; readonly sha256: string }[] };
  const pins = new Map((expected.generated ?? []).filter((entry) => entry.path.startsWith(`${LARGE_CONTRACT_DIR}/`)).map((entry) => [entry.path, entry.sha256]));
  if (pins.size === 0) {
    throw new Error(`${CONTRACT_SET_V2_CASE}/expected.json pins no file of the large tier: run pnpm synth --all`);
  }
  return pins;
}

const onDisk = (target: string) => (existsSync(target) ? sha256(new Uint8Array(readFileSync(target))) : null);

/**
 * Makes the large tier present under `root` (fixtures/synthetic), every file at the hash MOD-09's
 * expected.json pins, and returns the files' absolute paths. Files already there at their pinned hash
 * are left alone; otherwise the tier is generated, each file checked against its pin before it is
 * written, written into a temporary directory and renamed into place, and read back. Throws when the
 * generator writes anything other than what is pinned (run pnpm synth --all and commit the result).
 */
export async function ensureLargeContractTier(root: string): Promise<readonly string[]> {
  const pins = pinnedHashes(root);
  const targets = [...pins.keys()].map((relative) => path.join(root, relative));
  if ([...pins].every(([relative, pinned]) => onDisk(path.join(root, relative)) === pinned)) {
    return targets;
  }
  const facts = largeContractFacts();
  const generatedPaths = new Set(facts.map((file) => file.path));
  if (facts.length !== pins.size || [...pins.keys()].some((relative) => !generatedPaths.has(relative))) {
    throw new Error(`the large tier's generator writes other files than ${CONTRACT_SET_V2_CASE}/expected.json pins: run pnpm synth --all`);
  }
  for (const file of facts) {
    if (pins.get(file.path) !== file.sha256) {
      throw new Error(`${file.path}: the generator no longer writes the bytes ${CONTRACT_SET_V2_CASE}/expected.json pins: run pnpm synth --all`);
    }
  }
  const directory = path.join(root, LARGE_CONTRACT_DIR);
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(path.join(directory, '.writing-'));
  try {
    for (const file of facts) {
      const target = path.join(root, file.path);
      if (onDisk(target) === file.sha256) {
        continue;
      }
      const staged = path.join(temporary, path.basename(path.dirname(file.path)), path.basename(file.path));
      mkdirSync(path.dirname(staged), { recursive: true });
      writeFileSync(staged, file.data);
      mkdirSync(path.dirname(target), { recursive: true });
      renameSync(staged, target);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  for (const [relative, pinned] of pins) {
    if (onDisk(path.join(root, relative)) !== pinned) {
      throw new Error(`${relative}: not at its pinned hash after writing`);
    }
  }
  return Promise.resolve(targets);
}
