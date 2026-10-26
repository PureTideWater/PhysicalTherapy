import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { compareFunctionDirectory, describeDifference, firstDifferingLine, planFunctionDirectory, readFunctionDirectory, sameDirectory, writeFunctionDirectory } from './function-files';
import { FUNCTION_FILE_BANNER } from './functions';
import { functionBaseCommit, functionFilesAtCommit, hasUncommittedInputs, isolatedGitEnv, unifiedDiffs } from './history';
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

/** A file the generator wrote once, as a stale one looks: its banner on the first line. */
const generatedFile = (body: string): string => `${[...FUNCTION_FILE_BANNER, '', body].join('\n')}\n`;

const NO_DIFFERENCE = { absent: false, missing: [], ignored: [], extra: [], differing: [], refused: [], executable: [] };

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
    expect(d).toEqual({
      ...NO_DIFFERENCE,
      missing: ['gate_probe_b.sql'],
      extra: ['gate_probe_stale.sql', 'notes.txt'],
      differing: [{ file: 'gate_probe_a.sql', line: 2, existing: 'SELECT 9;', generated: 'SELECT 1;' }],
    });
    expect(sameDirectory(d)).toBe(false);
    expect(describeDifference(dir, d)).toEqual([
      `missing: ${path.join(dir, 'gate_probe_b.sql')}`,
      `extra: ${path.join(dir, 'gate_probe_stale.sql')} (no function produces it; only the generated *.sql files and README.md belong here)`,
      `extra: ${path.join(dir, 'notes.txt')} (no function produces it; only the generated *.sql files and README.md belong here)`,
      `differs: ${path.join(dir, 'gate_probe_a.sql')}, first at line 2:\n    - SELECT 9;\n    + SELECT 1;`,
    ]);
  });

  it('a missing directory is one line, not one per function (T13)', () => {
    const dir = path.join(tempDir(), 'absent');
    const d = compareFunctionDirectory(dir, expected);
    expect(d).toEqual({ ...NO_DIFFERENCE, absent: true });
    expect(sameDirectory(d)).toBe(false);
    expect(describeDifference(dir, d)).toEqual([`${dir} does not exist; regenerate it (pnpm db:domain-model --out on a freshly migrated database)`]);
  });

  it('refuses an executable bit on any file: git would commit it as mode 100755 (N6)', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    chmodSync(path.join(dir, 'gate_probe_a.sql'), 0o755);
    const d = compareFunctionDirectory(dir, expected);
    expect(d).toEqual({ ...NO_DIFFERENCE, executable: ['gate_probe_a.sql'] });
    expect(describeDifference(dir, d)).toEqual([`executable: ${path.join(dir, 'gate_probe_a.sql')} has an executable bit; the files are mode 100644 (chmod 644, or regenerate)`]);
    // Regenerating sets the mode back, though the content is the same.
    expect(writeFunctionDirectory(dir, expected)).toEqual({ written: ['gate_probe_a.sql'], removed: [] });
    expect(statSync(path.join(dir, 'gate_probe_a.sql')).mode & 0o777).toBe(0o644);
    expect(sameDirectory(compareFunctionDirectory(dir, expected))).toBe(true);
  });

  it('a generated file git ignores is its own category, never "missing" (T8)', () => {
    const { root, git } = repository();
    const dir = path.join(root, 'packages/db/functions');
    writeFunctionDirectory(dir, expected);
    writeFileSync(path.join(root, '.gitignore'), 'gate_probe_b.sql\n');
    git('add', '.gitignore');
    const d = compareFunctionDirectory(dir, expected);
    expect(d).toEqual({ ...NO_DIFFERENCE, ignored: ['gate_probe_b.sql'] });
    expect(describeDifference(dir, d)).toEqual([`ignored by git: ${path.join(dir, 'gate_probe_b.sql')}; it would never be committed (remove the ignore rule that matches it)`]);
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
  it('writes changed files only, removes stale generated *.sql, and leaves the README alone', () => {
    const dir = tempDir();
    expect(writeFunctionDirectory(dir, expected)).toEqual({ written: ['gate_probe_a.sql', 'gate_probe_b.sql'], removed: [] });
    writeFileSync(path.join(dir, 'README.md'), '# hand-written\n');
    writeFileSync(path.join(dir, 'gate_probe_stale.sql'), generatedFile('-- stale'));
    const next = new Map([...expected, ['gate_probe_b.sql', '-- b\nSELECT 3;\n']]);
    expect(writeFunctionDirectory(dir, next)).toEqual({ written: ['gate_probe_b.sql'], removed: ['gate_probe_stale.sql'] });
    expect(readdirSync(dir).sort()).toEqual(['README.md', 'gate_probe_a.sql', 'gate_probe_b.sql']);
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

  it('refuses a functions directory that is itself a symlink, to write, compare or read (N5, T9)', () => {
    const real = tempDir();
    const link = path.join(tempDir(), 'functions');
    symlinkSync(real, link);
    expect(() => writeFunctionDirectory(link, expected)).toThrow(/is a symlink/);
    expect(() => compareFunctionDirectory(link, expected)).toThrow(/is a symlink/);
    expect(readdirSync(real)).toEqual([]);
    writeFileSync(path.join(real, 'gate_probe_a.sql'), '-- a\n');
    expect(() => readFunctionDirectory(link)).toThrow(DomainModelError);
    expect(() => readFunctionDirectory(link)).toThrow(/is a symlink/);
  });

  it('removes a stale *.sql only when its first line is the banner, and refuses the run, changing nothing, when one is not (S3)', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    // A --functions slip: a directory of migrations, or a hand-made file, would otherwise be deleted.
    writeFileSync(path.join(dir, '20260101000000_init.sql'), 'CREATE TABLE gate_probe_important();\n');
    writeFileSync(path.join(dir, 'gate_probe_hand.sql'), `-- hand-made\n${generatedFile('-- banner, but not first')}`);
    writeFileSync(path.join(dir, 'gate_probe_stale.sql'), generatedFile('-- stale'));
    const next = new Map([...expected, ['gate_probe_b.sql', 'changed\n']]);
    expect(() => planFunctionDirectory(dir, next)).toThrow(DomainModelError);
    expect(() => writeFunctionDirectory(dir, next)).toThrow(
      `${dir}: 20260101000000_init.sql, gate_probe_hand.sql are not a generated function file (no banner on the first line, or not a function's name); the writer removes only its own stale files: move them away, or check --functions, and regenerate`,
    );
    expect(readdirSync(dir).sort()).toEqual(['20260101000000_init.sql', 'gate_probe_a.sql', 'gate_probe_b.sql', 'gate_probe_hand.sql', 'gate_probe_stale.sql']);
    expect(readFileSync(path.join(dir, 'gate_probe_b.sql'), 'utf8')).toBe('-- b\nSELECT 2;\n');
    rmSync(path.join(dir, '20260101000000_init.sql'));
    rmSync(path.join(dir, 'gate_probe_hand.sql'));
    expect(planFunctionDirectory(dir, next)).toEqual({ stale: ['gate_probe_stale.sql'] });
    expect(writeFunctionDirectory(dir, next)).toEqual({ written: ['gate_probe_b.sql'], removed: ['gate_probe_stale.sql'] });
  });

  it('refuses any other entry git would commit (a stray file, a directory), changing nothing, as --check reports it', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    writeFileSync(path.join(dir, 'notes.txt'), 'stray\n');
    mkdirSync(path.join(dir, 'subdir'));
    const next = new Map([...expected, ['gate_probe_b.sql', 'changed\n']]);
    expect(() => planFunctionDirectory(dir, next)).toThrow(DomainModelError);
    expect(() => writeFunctionDirectory(dir, next)).toThrow(`${dir}: notes.txt, subdir are neither a generated function file nor README.md; move them away, or check --functions, and regenerate`);
    expect(readFileSync(path.join(dir, 'gate_probe_b.sql'), 'utf8')).toBe('-- b\nSELECT 2;\n');
    expect(compareFunctionDirectory(dir, next)).toMatchObject({ extra: ['notes.txt'], refused: ['subdir'] });
    rmSync(path.join(dir, 'notes.txt'));
    rmSync(path.join(dir, 'subdir'), { recursive: true });
    expect(writeFunctionDirectory(dir, next)).toEqual({ written: ['gate_probe_b.sql'], removed: [] });
  });

  it('a stale file with the banner but a name no function could have is refused too', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'Gate Probe.sql'), generatedFile('-- copied'));
    expect(() => writeFunctionDirectory(dir, expected)).toThrow(/Gate Probe\.sql is not a generated function file/);
    expect(readdirSync(dir)).toEqual(['Gate Probe.sql']);
  });

  it('planning changes nothing, and passes on an absent directory', () => {
    expect(planFunctionDirectory(path.join(tempDir(), 'absent'), expected)).toEqual({ stale: [] });
    const dir = tempDir();
    expect(planFunctionDirectory(dir, expected)).toEqual({ stale: [] });
    expect(readdirSync(dir)).toEqual([]);
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
    writeFunctionDirectory(path.join(root, 'packages/db/functions'), new Map([...expected].map(([name, text]) => [name, generatedFile(text)])));
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

describe('reading the functions directory (--summary-since alone)', () => {
  it('reads the *.sql regular files, and an absent directory as none', () => {
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    writeFileSync(path.join(dir, 'README.md'), '# hand-written\n');
    expect(readFunctionDirectory(dir)).toEqual(expected);
    expect(readFunctionDirectory(path.join(dir, 'absent'))).toEqual(new Map());
  });

  it('refuses a *.sql entry whose name is not a function file, or that is a symlink or a directory, never reading it (N3, T14)', () => {
    for (const bad of ['gate probe.sql', 'Gate.sql', "gate'probe.sql", 'gate\tprobe.sql']) {
      const dir = tempDir();
      writeFunctionDirectory(dir, expected);
      writeFileSync(path.join(dir, bad), '-- stray\n');
      expect(() => readFunctionDirectory(dir), JSON.stringify(bad)).toThrow(DomainModelError);
      expect(() => readFunctionDirectory(dir), JSON.stringify(bad)).toThrow(`${JSON.stringify(bad)} is not a function file's name`);
    }
    const dir = tempDir();
    writeFunctionDirectory(dir, expected);
    const outside = path.join(tempDir(), 'outside.sql');
    writeFileSync(outside, '-- outside\n');
    symlinkSync(outside, path.join(dir, 'gate_probe_link.sql'));
    expect(() => readFunctionDirectory(dir)).toThrow(/gate_probe_link\.sql is a symlink, not a regular file/);
  });
});

describe('the function files at a commit, and their diffs', () => {
  /** A repository whose second commit holds `files` under packages/db/functions; returns its root, the commit and git. */
  function committed(files: ReadonlyMap<string, string>, extra: (dir: string) => void = () => undefined): { readonly root: string; readonly dir: string; readonly head: string; readonly git: (...args: string[]) => string } {
    const { root, git } = repository();
    const dir = path.join(root, 'packages/db/functions');
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of files) writeFileSync(path.join(dir, name), text);
    extra(dir);
    writeFileSync(path.join(root, 'placeholder.txt'), 'x\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'synthetic');
    return { root, dir, head: git('rev-parse', 'HEAD').trim(), git };
  }

  it('reads a base holding only the README as none: the bootstrap line, not every file added (T10)', () => {
    const { root, dir, head } = committed(new Map(), (d) => writeFileSync(path.join(d, 'README.md'), '# only the README\n'));
    expect(functionFilesAtCommit(head, { repoRoot: root, directory: dir })).toBeNull();
  });

  it('refuses a *.sql of mode 100755, or with a name no function file has, never diffing it (N6, N3)', () => {
    const executable = committed(expected, (d) => chmodSync(path.join(d, 'gate_probe_a.sql'), 0o755));
    expect(() => functionFilesAtCommit(executable.head, { repoRoot: executable.root, directory: executable.dir })).toThrow(DomainModelError);
    expect(() => functionFilesAtCommit(executable.head, { repoRoot: executable.root, directory: executable.dir })).toThrow(/gate_probe_a\.sql is mode 100755, not a regular file of mode 100644/);
    const named = committed(new Map([...expected, ['gate probe.sql', '-- stray\n']]));
    expect(() => functionFilesAtCommit(named.head, { repoRoot: named.root, directory: named.dir })).toThrow(/"gate probe\.sql" is not a function file's name/);
  });

  it('a blob the clone lacks is a DomainModelError with the fetch hint, not a crash (N4, T4)', () => {
    const { root, dir, head, git } = committed(expected);
    const oid = git('rev-parse', `${head}:packages/db/functions/gate_probe_a.sql`).trim();
    rmSync(path.join(root, '.git/objects', oid.slice(0, 2), oid.slice(2)));
    expect(() => functionFilesAtCommit(head, { repoRoot: root, directory: dir })).toThrow(DomainModelError);
    expect(() => functionFilesAtCommit(head, { repoRoot: root, directory: dir })).toThrow(/missing.*fetch the full history \(actions\/checkout fetch-depth: 0/);
  });

  it("a git failure is a DomainModelError carrying git's stderr", () => {
    const { root, dir } = committed(expected);
    expect(() => functionFilesAtCommit('0'.repeat(40), { repoRoot: root, directory: dir })).toThrow(DomainModelError);
    expect(() => functionFilesAtCommit('0'.repeat(40), { repoRoot: root, directory: dir })).toThrow(/git ls-tree failed: fatal: /);
  });

  it('compares with the merge base of the ref and HEAD, so later changes on the base are not reversals (T17)', () => {
    const { root, git } = repository();
    writeFileSync(path.join(root, 'f.txt'), '1\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'fork point');
    const fork = git('rev-parse', 'HEAD').trim();
    git('checkout', '--quiet', '-b', 'feature');
    writeFileSync(path.join(root, 'g.txt'), 'feature\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'feature');
    git('checkout', '--quiet', 'main');
    writeFileSync(path.join(root, 'f.txt'), '2\n');
    git('commit', '--quiet', '-am', 'base moves on');
    const main = git('rev-parse', 'HEAD').trim();
    git('checkout', '--quiet', 'feature');
    expect(functionBaseCommit(main, { repoRoot: root })).toBe(fork);
    git('checkout', '--quiet', 'main');
    expect(functionBaseCommit(main, { repoRoot: root })).toBe(main);
    expect(() => functionBaseCommit('--all', { repoRoot: root })).toThrow(DomainModelError);
  });

  it("diffs the same under any of the caller's git configuration: environment, global and attributes (N2, T3)", () => {
    const before = new Map([['gate_probe.sql', ['-- probe', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7', 'line 8', ''].join('\n')]]);
    const after = new Map([['gate_probe.sql', ['-- probe', 'line 1', 'line 2', 'line 3', 'line 4 changed', 'line 5', 'line 6', 'line 7', 'line 8', ''].join('\n')]]);
    const clean = unifiedDiffs(before, after, 'packages/db/functions');
    expect(clean.get('gate_probe.sql')).toContain('@@ -2,7 +2,7 @@\n line 1\n line 2\n line 3\n-line 4\n+line 4 changed\n line 5');
    const home = tempDir();
    writeFileSync(path.join(home, 'attributes'), '*.sql binary\n');
    writeFileSync(path.join(home, 'gitconfig'), `[diff]\n\tcontext = 0\n\talgorithm = histogram\n\tnoprefix = true\n[core]\n\tattributesFile = ${path.join(home, 'attributes')}\n`);
    const saved = { ...process.env };
    try {
      Object.assign(process.env, {
        GIT_CONFIG_GLOBAL: path.join(home, 'gitconfig'),
        GIT_CONFIG_COUNT: '3',
        GIT_CONFIG_KEY_0: 'diff.context',
        GIT_CONFIG_VALUE_0: '0',
        GIT_CONFIG_KEY_1: 'diff.interHunkContext',
        GIT_CONFIG_VALUE_1: '10',
        GIT_CONFIG_KEY_2: 'core.attributesFile',
        GIT_CONFIG_VALUE_2: path.join(home, 'attributes'),
        GIT_EXTERNAL_DIFF: 'false',
      });
      expect(unifiedDiffs(before, after, 'packages/db/functions')).toEqual(clean);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) Reflect.deleteProperty(process.env, key);
      Object.assign(process.env, saved);
    }
    const env = isolatedGitEnv({ PATH: '/bin', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'diff.context', GIT_CONFIG_VALUE_0: '0', GIT_CONFIG_PARAMETERS: "'diff.context'='0'" });
    expect(env).toEqual({ PATH: '/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  });

  it("refuses a name that is not a function file's, never diffing it (N3, T14)", () => {
    for (const bad of ['x y.sql', 'Gate.sql', '../gate.sql', 'gate"probe.sql']) {
      expect(() => unifiedDiffs(new Map(), new Map([[bad, 'x\n']]), 'packages/db/functions'), bad).toThrow(DomainModelError);
    }
  });
});
