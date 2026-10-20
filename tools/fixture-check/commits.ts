import { spawnSync } from 'node:child_process';

import { SyntheticSenderError, assertSyntheticFixture } from '@tp/synth';

import { type FixtureCheck, type FixtureProblem, guardReads } from './check';

/**
 * The fixture check over commits instead of the working tree: the pre-push hook's half of it (`.githooks/pre-push`,
 * docs/adr/0063, audit item #20 (e)). Every file a commit adds or changes, as git stores it in that commit, goes
 * through the writer's own guard (assertSyntheticFixture in packages/synth/src/write.ts) when it is one the guard
 * reads, by the same rules as `pnpm check:fixtures` (check.ts: by name, or by its first bytes). The bytes come from
 * git's object store, never from the working tree, so a commit made with `git commit-tree` from a tree the
 * working tree never held is read as it will be pushed.
 *
 * A merge is read by its combined diff (`git diff-tree -c`): a file that differs from every parent, which is
 * what the merge itself wrote (a resolution, a clean merge of both sides' edits, or a file neither parent had).
 * A file the merge took whole from one parent is that parent's, and is read with the commit that wrote it when
 * that commit is pushed too.
 */

/** A file one of the commits wrote: its repository path, its blob and the first commit (in the order given) that wrote it. */
export interface CommittedFile {
  readonly file: string;
  readonly blob: string;
  readonly commit: string;
}

const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** Regular files only: a symbolic link (120000) or a submodule (160000) holds no bytes the guard reads. */
const REGULAR_MODES = new Set(['100644', '100755']);
/** How much blob content one `git cat-file --batch` call returns at most, so a push of a large history is read in parts. */
const BATCH_BYTES = 64 * 1024 * 1024;
const MAX_BUFFER = 1024 * 1024 * 1024;

function git(root: string, args: readonly string[], input?: string): Buffer {
  const result = spawnSync('git', args, { cwd: root, input, maxBuffer: MAX_BUFFER });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0] ?? ''} failed (exit ${String(result.status)}): ${result.stderr.toString('utf8').trim()}`);
  }
  return result.stdout;
}

/**
 * Parses `git diff-tree --stdin -r -c --root --no-renames -z` output: a commit's name, then for each file a
 * record (`:` once per parent, the modes, the object names and the status) and its path.
 */
export function parseDiffTree(output: string): CommittedFile[] {
  const tokens = output.split('\0');
  const files: CommittedFile[] = [];
  let commit: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    if (token === '') {
      continue;
    }
    if (!token.startsWith(':')) {
      if (!OBJECT_NAME.test(token)) {
        throw new Error('git diff-tree printed a line the fixture check cannot read');
      }
      commit = token;
      continue;
    }
    const path = tokens[index + 1];
    index += 1;
    const parents = /^:+/.exec(token)?.[0].length ?? 0;
    const fields = token.slice(parents).split(' ');
    // parents + 1 modes, parents + 1 object names, the status.
    const mode = fields[parents];
    const blob = fields[2 * parents + 1];
    if (commit === undefined || path === undefined || path === '' || mode === undefined || blob === undefined || fields.length !== 2 * parents + 3) {
      throw new Error('git diff-tree printed a record the fixture check cannot read');
    }
    if (REGULAR_MODES.has(mode) && !/^0+$/.test(blob)) {
      files.push({ file: path, blob, commit });
    }
  }
  return files;
}

/** Every file the commits write, once per path and content (the first commit given that wrote it). */
export function committedFiles(root: string, commits: readonly string[]): CommittedFile[] {
  for (const commit of commits) {
    if (!OBJECT_NAME.test(commit)) {
      throw new Error('a commit to check is not a full object name');
    }
  }
  if (commits.length === 0) {
    return [];
  }
  const output = git(root, ['diff-tree', '--stdin', '-r', '-c', '--root', '--no-renames', '--no-ext-diff', '-z'], `${commits.join('\n')}\n`).toString('utf8');
  const seen = new Set<string>();
  return parseDiffTree(output).filter((entry) => {
    const key = `${entry.blob}\0${entry.file}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** The sizes of the named blobs (`git cat-file --batch-check`). */
function blobSizes(root: string, blobs: readonly string[]): Map<string, number> {
  const sizes = new Map<string, number>();
  const output = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], `${blobs.join('\n')}\n`).toString('utf8');
  for (const line of output.split('\n')) {
    const [name, type, size] = line.split(' ');
    if (name !== undefined && type === 'blob' && size !== undefined) {
      sizes.set(name, Number.parseInt(size, 10));
    }
  }
  return sizes;
}

/** The named blobs' bytes, read in parts of at most BATCH_BYTES (one blob larger than that is a part of its own). */
function* blobContents(root: string, blobs: readonly string[]): Generator<[string, Buffer]> {
  const sizes = blobSizes(root, blobs);
  const missing = blobs.find((blob) => !sizes.has(blob));
  if (missing !== undefined) {
    throw new Error(`blob ${missing} is not in this repository's object store`);
  }
  let part: string[] = [];
  let bytes = 0;
  const parts: string[][] = [];
  for (const blob of blobs) {
    const size = sizes.get(blob) ?? 0;
    if (part.length > 0 && bytes + size > BATCH_BYTES) {
      parts.push(part);
      part = [];
      bytes = 0;
    }
    part.push(blob);
    bytes += size;
  }
  if (part.length > 0) {
    parts.push(part);
  }
  for (const names of parts) {
    const output = git(root, ['cat-file', '--batch'], `${names.join('\n')}\n`);
    let offset = 0;
    for (const name of names) {
      const header = output.indexOf(0x0a, offset);
      const [found, type, size] = output.subarray(offset, header).toString('utf8').split(' ');
      const length = Number.parseInt(size ?? '', 10);
      if (found !== name || type !== 'blob' || !Number.isSafeInteger(length)) {
        throw new Error(`git cat-file did not return blob ${name}`);
      }
      yield [name, output.subarray(header + 1, header + 1 + length)];
      offset = header + 1 + length + 1;
    }
  }
}

/**
 * Checks every file the commits write that the guard reads. Each refusal names the file, its commit and the
 * guard's rule, never a value from the file.
 */
export function checkCommits(root: string, commits: readonly string[]): FixtureCheck {
  const files = committedFiles(root, commits);
  const byBlob = new Map<string, CommittedFile[]>();
  for (const entry of files) {
    byBlob.set(entry.blob, [...(byBlob.get(entry.blob) ?? []), entry]);
  }
  const problems: FixtureProblem[] = [];
  let checked = 0;
  for (const [blob, bytes] of blobContents(root, [...byBlob.keys()])) {
    for (const entry of byBlob.get(blob) ?? []) {
      if (!guardReads(entry.file, bytes.subarray(0, 8))) {
        continue;
      }
      checked += 1;
      try {
        assertSyntheticFixture(bytes, entry.file);
      } catch (error) {
        if (!(error instanceof SyntheticSenderError)) {
          throw error;
        }
        problems.push({ file: entry.file, message: `${error.message} (in commit ${entry.commit.slice(0, 12)})` });
      }
    }
  }
  return { checked, problems };
}
