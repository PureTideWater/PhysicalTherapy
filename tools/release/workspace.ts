import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { FIRST_SYNTHETIC_RELEASE, RELEASE_NOTES_FILE, type VERIFICATION_LEVELS, isSyntheticReleaseNumber } from '@tp/rules';
import { isRecordFile, listContentFiles, readRecordFile, readRelease } from '@tp/rules/content';

import { type CheckResult, checkContent } from '../verify-content/check';
import { type AssembleResult, assembleRelease } from './assemble';

/**
 * The content workspace as the internal console's Rule releases screen reads it (PRD 7, Internal
 * console: "Drafts, checks, published releases, release notes, affected-run diffs ... Prepare, check";
 * PRD 9, The release pipeline steps 1 to 3; docs/adr/0037): the drafts in content/drafts by file, type
 * and verification level, the releases prepared in content/outgoing with their notes and manifest, the
 * releases published to content/releases, the content checker's result (`pnpm verify-content`), and
 * preparing the next release (`pnpm release:assemble`). Publishing is never here: CI publishes a
 * prepared release on merge, and nothing here writes content/releases.
 */

export type Level = (typeof VERIFICATION_LEVELS)[number];

export interface DraftFile {
  /** Relative to content/drafts. */
  readonly file: string;
  readonly recordTypes: readonly string[];
  readonly records: number;
  readonly levels: Readonly<Record<Level, number>>;
  /** Problems reading the file (the checker says more). */
  readonly problems: number;
}

export interface PreparedRelease {
  readonly release: number;
  readonly records: number;
  readonly manifestSha256: string;
  /** RELEASE.md as prepared. */
  readonly notes: string;
  readonly problems: readonly string[];
}

export interface ContentWorkspace {
  readonly drafts: readonly DraftFile[];
  readonly prepared: readonly PreparedRelease[];
  /** Release numbers under content/releases. */
  readonly published: readonly number[];
}

function numbered(root: string, parent: string): number[] {
  let names: string[];
  try {
    names = readdirSync(path.join(root, parent));
  } catch {
    return [];
  }
  return names
    .filter((name) => /^[1-9]\d*$/.test(name))
    .map((name) => Number.parseInt(name, 10))
    .sort((a, b) => a - b);
}

export function readWorkspace(root: string): ContentWorkspace {
  const draftsDir = path.join(root, 'content/drafts');
  const drafts = listContentFiles(draftsDir)
    .map((file) => file.path)
    .filter(isRecordFile)
    .map((file): DraftFile => {
      const contents = readRecordFile(path.join(draftsDir, file), file);
      const levels: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
      for (const { record } of contents.records) {
        levels[record.verification.level] += 1;
      }
      return { file, recordTypes: [...new Set(contents.records.map(({ record }) => record.record_type))].sort(), records: contents.records.length, levels, problems: contents.problems.length };
    });
  const prepared = numbered(root, 'content/outgoing').map((release): PreparedRelease => {
    const dir = path.join(root, 'content/outgoing', String(release));
    const contents = readRelease(dir);
    const notesPath = path.join(dir, RELEASE_NOTES_FILE);
    return {
      release,
      records: contents.records.length,
      manifestSha256: contents.manifestSha256,
      notes: existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '',
      problems: contents.problems,
    };
  });
  return { drafts, prepared, published: numbered(root, 'content/releases') };
}

/** `pnpm verify-content` over the workspace: the drafts and every prepared and published release. */
export function checkWorkspace(root: string): CheckResult {
  return checkContent(root);
}

/**
 * The next real release number: one above every real release published, prepared or loaded into the
 * database (`loaded`), so a number is used once. SYNTHETIC fixture numbers (900000 and up) are not real
 * releases and never count.
 */
export function nextReleaseNumber(root: string, loaded: readonly number[]): number {
  const real = [...numbered(root, 'content/releases'), ...numbered(root, 'content/outgoing'), ...loaded].filter((number) => !isSyntheticReleaseNumber(number));
  const next = real.length === 0 ? 1 : Math.max(...real) + 1;
  if (next >= FIRST_SYNTHETIC_RELEASE) {
    throw new RangeError(`real release numbers end below ${String(FIRST_SYNTHETIC_RELEASE)}`);
  }
  return next;
}

/** `pnpm release:assemble <n>`: the drafts at L2 or higher into content/outgoing/<n>, refused as the command refuses. */
export function prepareRelease(root: string, release: number, today: string): AssembleResult {
  return assembleRelease({ root, release, today });
}

export { type AssembleResult } from './assemble';
export { type CheckResult } from '../verify-content/check';
export { ReleaseToolError } from './commands';
