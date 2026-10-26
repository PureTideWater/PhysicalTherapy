import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { compareFunctionDirectory, describeDifference, firstDifferingLine, readFunctionDirectory, sameDirectory, writeFunctionDirectory } from './function-files';
import { functionFilesAtCommit, hasUncommittedInputs } from './history';
import { DomainModelError, GENERATOR_INPUTS } from './sources';

/**
 * The functions directory against the generated files (docs/adr/0068; test matrix DBF-04), on temporary
 * directories and repositories: `--out` writes changed files and removes stale `*.sql` only, keeps the README and
 * refuses a symlink; `--check` names each missing, extra and differing file with its first differing line, and a
 * path git ignores is not an entry. And the provenance line's pathspec: the function files are an output, so
 * regenerating them is not an uncommitted input, while a migration edit still is.
 */
const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'function-files-'));
  scratch.push(dir);
  return dir;
}

/** A repository with a commit, its identity given on the command line so no global configuration is needed. */
function repository(): { readonly root: string; readonly git: (...args: string[]) => string } {
  const root = tempDir();
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', root, '-c', 'user.name=Synthetic Tester', '-c', 'user.email=tester@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
  git('init', '--quiet', '--initial-branch=main');
  return { root, git };
}

const expected = new Map([
  ['gate_probe_a.sql', '-- a\nSELECT 1;\n'],
  ['gate_probe_b.sql', '-- b\nSELECT 2;\n'],
]);

describe('DBF-04: comparing the functions directory', () => {
  it('finds nothing when the directory holds exactly the generated files and the README', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    writeFileSync(path.join(dir, 'README.md'), '# hand-written\n');
    const d = compareFunctionDirectory(dir, expected);
    expect(sameDirectory(d)).toBe(true);
    expect(describeDifference(dir, d)).toEqual([]);
  });

  it('names each missing, extra and differing file, the differing one with its first differing line', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'gate_probe_a.sql'), '-- a\nSELECT 9;\n');
    writeFileSync(path.join(dir, 'gate_probe_stale.sql'), '-- stale\n');
    writeFileSync(path.join(dir, 'notes.txt'), 'a stray file\n');
    const d = compareFunctionDirectory(dir, expected);
    expect(d).toEqual({ missing: ['gate_probe_b.sql'], extra: ['gate_probe_stale.sql', 'notes.txt'], differing: [{ file: 'gate_probe_a.sql', line: 2, existing: 'SELECT 9;', generated: 'SELECT 1;' }], refused: [] });
    expect(sameDirectory(d)).toBe(false);
    expect(describeDifference(dir, d)).toEqual([
      `missing: ${path.join(dir, 'gate_probe_b.sql')}`,
      `extra: ${path.join(dir, 'gate_probe_stale.sql')} (no function produces it; only the generated *.sql files and README.md belong here)`,
      `extra: ${path.join(dir, 'notes.txt')} (no function produces it; only the generated *.sql files and README.md belong here)`,
      `differs: ${path.join(dir, 'gate_probe_a.sql')}, first at line 2:\n    - SELECT 9;\n    + SELECT 1;`,
    ]);
  });

  it('a missing directory is every file missing', () => {
    expect(compareFunctionDirectory(path.join(tempDir(), 'absent'), expected).missing).toEqual(['gate_probe_a.sql', 'gate_probe_b.sql']);
  });

  it('refuses a symlink and a directory whatever their names, and never reads through the symlink', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    const outside = path.join(tempDir(), 'outside.sql');
    writeFileSync(outside, '-- b\nSELECT 2;\n');
    rmSync(path.join(dir, 'gate_probe_b.sql'));
    symlinkSync(outside, path.join(dir, 'gate_probe_b.sql'));
    mkdirSync(path.join(dir, 'nested'));
    writeFileSync(path.join(dir, 'nested', 'x.sql'), 'x\n');
    const d = compareFunctionDirectory(dir, expected);
    expect(d.refused).toEqual(['gate_probe_b.sql', 'nested']);
    expect(d.differing).toEqual([]);
    expect(sameDirectory(d)).toBe(false);
  });

  it('a path git ignores is not an entry; the same file not ignored is an extra one', () => {
    const { root, git } = repository();
    const dir = path.join(root, 'packages/db/functions');
    writeFunctionDirectory(dir, expected);
    writeFileSync(path.join(dir, '.DS_Store'), 'finder leftovers');
    expect(compareFunctionDirectory(dir, expected).extra).toEqual(['.DS_Store']);
    writeFileSync(path.join(root, '.gitignore'), '.DS_Store\n');
    git('add', '.gitignore');
    expect(sameDirectory(compareFunctionDirectory(dir, expected))).toBe(true);
  });

  it('firstDifferingLine reports the end of a shorter file', () => {
    expect(firstDifferingLine('a\n', 'a\n')).toBeNull();
    expect(firstDifferingLine('a\n', 'a\nb\n')).toEqual({ line: 2, existing: '', generated: 'b' });
    expect(firstDifferingLine('a', 'a\nb')).toEqual({ line: 2, existing: '(end of file)', generated: 'b' });
  });
});

describe('DBF-04: writing the functions directory (--out)', () => {
  it('writes changed files only, removes stale *.sql, and leaves the README and other entries alone', () => {
    const dir = tempDir();
    expect(writeFunctionDirectory(dir, expected)).toEqual({ written: ['gate_probe_a.sql', 'gate_probe_b.sql'], removed: [] });
    writeFileSync(path.join(dir, 'README.md'), '# hand-written\n');
    writeFileSync(path.join(dir, 'gate_probe_stale.sql'), '-- stale\n');
    writeFileSync(path.join(dir, 'notes.txt'), 'kept\n');
    const next = new Map([...expected, ['gate_probe_b.sql', '-- b\nSELECT 3;\n']]);
    expect(writeFunctionDirectory(dir, next)).toEqual({ written: ['gate_probe_b.sql'], removed: ['gate_probe_stale.sql'] });
    expect(readdirSync(dir).sort()).toEqual(['README.md', 'gate_probe_a.sql', 'gate_probe_b.sql', 'notes.txt']);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('# hand-written\n');
    expect(readFileSync(path.join(dir, 'gate_probe_b.sql'), 'utf8')).toBe('-- b\nSELECT 3;\n');
    expect(writeFunctionDirectory(dir, next)).toEqual({ written: [], removed: [] });
    expect(readFunctionDirectory(dir)).toEqual(next);
  });

  it('refuses a symlink where a file is to be written or removed, before changing anything, and never writes through it', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    const outside = path.join(tempDir(), 'target.sql');
    writeFileSync(outside, 'outside\n');
    rmSync(path.join(dir, 'gate_probe_a.sql'));
    symlinkSync(outside, path.join(dir, 'gate_probe_a.sql'));
    symlinkSync(outside, path.join(dir, 'gate_probe_stale.sql'));
    const next = new Map([...expected, ['gate_probe_b.sql', 'changed\n']]);
    expect(() => writeFunctionDirectory(dir, next)).toThrow(DomainModelError);
    expect(() => writeFunctionDirectory(dir, next)).toThrow(/gate_probe_a\.sql, gate_probe_stale\.sql are not a regular file/);
    expect(readFileSync(outside, 'utf8')).toBe('outside\n');
    expect(readFileSync(path.join(dir, 'gate_probe_b.sql'), 'utf8')).toBe('-- b\nSELECT 2;\n');
    expect(lstatSync(path.join(dir, 'gate_probe_stale.sql')).isSymbolicLink()).toBe(true);
  });

  it('refuses a functions directory that is itself a symlink', () => {
    const real = tempDir();
    const link = path.join(tempDir(), 'functions');
    symlinkSync(real, link);
    expect(() => writeFunctionDirectory(link, expected)).toThrow(/is a symlink/);
    expect(() => compareFunctionDirectory(link, expected)).toThrow(/is a symlink/);
    expect(readdirSync(real)).toEqual([]);
  });

  it('creates the directory when it does not exist', () => {
    const dir = path.join(tempDir(), 'packages/db/functions');
    writeFunctionDirectory(dir, expected);
    expect(existsSync(path.join(dir, 'gate_probe_a.sql'))).toBe(true);
  });
});

describe('DBF-04: the provenance line and the function files', () => {
  it('excludes the function files from the inputs, and still flags a migration edit', () => {
    expect(GENERATOR_INPUTS).toContain(':(exclude)packages/db/functions');
    const { root, git } = repository();
    mkdirSync(path.join(root, 'packages/db/migrations'), { recursive: true });
    writeFileSync(path.join(root, 'packages/db/migrations/29991231000000_gate_probe.sql'), 'SELECT 1;\n');
    writeFileSync(path.join(root, 'docs-placeholder.md'), 'x\n');
    writeFunctionDirectory(path.join(root, 'packages/db/functions'), expected);
    git('add', '.');
    git('commit', '--quiet', '-m', 'synthetic');
    expect(hasUncommittedInputs({ repoRoot: root })).toBe(false);
    // Regenerated function files (changed, added, removed) are an output: not an uncommitted input.
    writeFunctionDirectory(path.join(root, 'packages/db/functions'), new Map([['gate_probe_a.sql', 'changed\n'], ['gate_probe_c.sql', 'new\n']]));
    expect(hasUncommittedInputs({ repoRoot: root })).toBe(false);
    // A file outside the inputs is not one either.
    writeFileSync(path.join(root, 'docs-placeholder.md'), 'y\n');
    expect(hasUncommittedInputs({ repoRoot: root })).toBe(false);
    writeFileSync(path.join(root, 'packages/db/migrations/29991231000000_gate_probe.sql'), 'SELECT 2;\n');
    expect(hasUncommittedInputs({ repoRoot: root })).toBe(true);
  });

  it('reads the function files a commit holds, and null when it has none', () => {
    const { root, git } = repository();
    writeFileSync(path.join(root, 'placeholder.txt'), 'x\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'before the function files');
    const bare = git('rev-parse', 'HEAD').trim();
    const dir = path.join(root, 'packages/db/functions');
    writeFunctionDirectory(dir, new Map([...expected, ['gate_probe_bytes.sql', '-- ünïcode and a final line without newline']]));
    writeFileSync(path.join(dir, 'README.md'), '# not a function file\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'the function files');
    const head = git('rev-parse', 'HEAD').trim();
    expect(functionFilesAtCommit(bare, { repoRoot: root, directory: dir })).toBeNull();
    expect(functionFilesAtCommit(head, { repoRoot: root, directory: dir })).toEqual(new Map([...expected, ['gate_probe_bytes.sql', '-- ünïcode and a final line without newline']]));
    expect(() => functionFilesAtCommit('--all', { repoRoot: root, directory: dir })).toThrow(DomainModelError);
  });
});
