import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { render835 } from '../../packages/synth/src/cases/builder';
import { minimalFile } from '../../packages/synth/src/cases/par';
import { checkCommits, committedFiles, parseDiffTree } from './commits';

/**
 * The fixture check over commits (the pre-push hook's half; docs/adr/0063): what git stores in the commits, read
 * from its object store, never the working tree. Scratch repositories live in the system's temporary directory and
 * hold only synthetic text; the refused interchange is the synthetic one with another sender, as in SEC-14.
 */
const MARKED = 'Post Date,Check/EFT #,Paid Amount,Payee ID\r\n06/11/2026,880060040002,30.00,SYNTHSENDER\r\n';
const UNMARKED = 'Post Date,Check/EFT #,Paid Amount\r\n06/11/2026,880060040002,30.00\r\n';
const SYNTHETIC = render835(minimalFile()).text;
const OTHER_SENDER = SYNTHETIC.replace('SYNTHSENDER    ', 'OTHERSENDER    ');

let scratch: string | undefined;
afterEach(() => {
  if (scratch !== undefined) {
    rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
  }
});

function repository(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-fixture-commits-'));
  scratch = root;
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  execFileSync('git', ['config', 'user.email', 'builder@synthetic.test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Synthetic Builder'], { cwd: root });
  return root;
}

const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function commit(root: string, files: Readonly<Record<string, string | null>>, message: string): string {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) {
      git(root, 'rm', '-q', file);
      continue;
    }
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
    git(root, 'add', file);
  }
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

describe('the fixture check over commits', () => {
  it('reads each file a commit writes as git stores it, not as the working tree holds it', () => {
    const root = repository();
    const first = commit(root, { 'fixtures/synthetic/LED-99/table.csv': MARKED, 'notes/remit.835': SYNTHETIC }, 'synthetic');
    const second = commit(root, { 'docs/table.csv': UNMARKED, 'notes/other.dat': OTHER_SENDER }, 'unmarked');
    // The working tree no longer holds either refused file; the commit still does.
    rmSync(path.join(root, 'docs/table.csv'));
    rmSync(path.join(root, 'notes/other.dat'));
    expect(checkCommits(root, [first]).problems).toEqual([]);
    expect(checkCommits(root, [second, first]).problems.map((problem) => problem.message)).toEqual([
      `docs/table.csv: no column of its header is an identifier column (a tabular fixture carries SYNTHSENDER in an identifier column, such as a payee or sender ID, of every data row) (in commit ${second.slice(0, 12)})`,
      `notes/other.dat: ISA06 is not SYNTHSENDER (in commit ${second.slice(0, 12)})`,
    ]);
    expect(checkCommits(root, [second, first]).checked).toBe(4);
  });

  it('reads an interchange after white space and a PDF packages/synth did not write, whatever their names', () => {
    const root = repository();
    const pushed = commit(root, { 'b.835': `\r\n${OTHER_SENDER}`, 'contract.pdf': '%PDF-1.4\n1 0 obj\n<< /Producer (Some Office Suite) >>\nendobj\n%%EOF\n', 'docs/notes.md': 'notes\n' }, 'copied in');
    const result = checkCommits(root, [pushed]);
    expect(result.checked).toBe(2);
    expect(result.problems.map((problem) => problem.file)).toEqual(['b.835', 'contract.pdf']);
    expect(result.problems[0]?.message).toBe(`b.835: ISA06 is not SYNTHSENDER (in commit ${pushed.slice(0, 12)})`);
  });

  it('finds an interchange header anywhere in a text file a commit writes, in any directory, and lets prose through', () => {
    const root = repository();
    commit(root, { 'README.md': '# scratch\n' }, 'start');
    const pushed = commit(
      root,
      {
        'notes/pasted.txt': `Pasted from the clearinghouse on Monday:\n${OTHER_SENDER}`,
        'docs/remit.md': `# A remittance\n\nSee the file below.\n\n\`\`\`\n${OTHER_SENDER}\n\`\`\`\n`,
        'packages/edi835/src/sample.ts': `export const lines = 1;\nexport const sample = 'x ${OTHER_SENDER.replaceAll('*', '|')}';\n`,
        'docs/x12.md': 'ISA*00 opens an interchange; ISA06 is its sender.\n',
        'docs/example.md': `An example:\n${SYNTHETIC}`,
      },
      'pasted',
    );
    // A later commit that changes a clean file into one with a header is read too.
    const changed = commit(root, { 'docs/x12.md': `The ISA segment opens an interchange:\n${OTHER_SENDER}` }, 'changed');
    const result = checkCommits(root, [changed, pushed]);
    expect(result.problems.map((problem) => problem.message).sort()).toEqual([
      `docs/remit.md: line 6 holds an X12 interchange header whose ISA06 is not SYNTHSENDER (in commit ${pushed.slice(0, 12)})`,
      `docs/x12.md: line 2 holds an X12 interchange header whose ISA06 is not SYNTHSENDER (in commit ${changed.slice(0, 12)})`,
      `notes/pasted.txt: line 2 holds an X12 interchange header whose ISA06 is not SYNTHSENDER (in commit ${pushed.slice(0, 12)})`,
      `packages/edi835/src/sample.ts: line 2 holds an X12 interchange header whose ISA06 is not SYNTHSENDER (in commit ${pushed.slice(0, 12)})`,
    ]);
    // Only docs/x12.md as first written (it starts with ISA) is a file the guard reads; the header search reads every text file.
    expect(result.checked).toBe(1);
    expect(result.searched).toBe(6);
    expect(checkCommits(root, [pushed]).problems.map((problem) => problem.file)).not.toContain('docs/x12.md');
  });

  it('reads a commit no branch holds (git commit-tree), a root commit included', () => {
    const root = repository();
    commit(root, { 'README.md': '# scratch\n' }, 'start');
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: OTHER_SENDER, encoding: 'utf8' }).trim();
    const tree = execFileSync('git', ['mktree'], { cwd: root, input: `100644 blob ${blob}\tsalvaged.835\n`, encoding: 'utf8' }).trim();
    const salvage = git(root, 'commit-tree', tree, '-m', 'salvage');
    expect(committedFiles(root, [salvage])).toEqual([{ file: 'salvaged.835', blob, commit: salvage }]);
    expect(checkCommits(root, [salvage]).problems).toEqual([{ file: 'salvaged.835', message: `salvaged.835: ISA06 is not SYNTHSENDER (in commit ${salvage.slice(0, 12)})` }]);
  });

  it('reads what a merge itself writes, and leaves what it takes whole from a parent to the commit that wrote it', () => {
    const root = repository();
    commit(root, { 'README.md': '# scratch\n' }, 'start');
    git(root, 'checkout', '-q', '-b', 'side');
    const side = commit(root, { 'side/notes.835': OTHER_SENDER }, 'side');
    git(root, 'checkout', '-q', 'main');
    commit(root, { 'main.txt': 'main\n' }, 'main');
    git(root, 'merge', '-q', '--no-ff', '--no-commit', 'side');
    writeFileSync(path.join(root, 'evil.835'), OTHER_SENDER);
    git(root, 'add', 'evil.835');
    git(root, 'commit', '-q', '-m', 'merge');
    const merge = git(root, 'rev-parse', 'HEAD');
    expect(committedFiles(root, [merge]).map((entry) => entry.file)).toEqual(['evil.835']);
    expect(checkCommits(root, [merge, side]).problems.map((problem) => problem.file)).toEqual(['evil.835', 'side/notes.835']);
  });

  it('skips deletions, links and submodules, and reads one path and content once', () => {
    const root = repository();
    const first = commit(root, { 'fixtures/a.csv': MARKED, 'fixtures/b.csv': MARKED }, 'tables');
    symlinkSync('a.csv', path.join(root, 'fixtures/link.csv'));
    git(root, 'add', 'fixtures/link.csv');
    const second = commit(root, { 'fixtures/b.csv': null }, 'link');
    const third = commit(root, { 'fixtures/c.csv': MARKED }, 'copy');
    expect(committedFiles(root, [third, second, first]).map((entry) => entry.file)).toEqual(['fixtures/c.csv', 'fixtures/a.csv', 'fixtures/b.csv']);
    expect(committedFiles(root, [])).toEqual([]);
    expect(() => committedFiles(root, ['HEAD'])).toThrow('a commit to check is not a full object name');
  });

  it('parses diff-tree records for a commit, a root commit and a merge, and refuses output it cannot read', () => {
    const commitName = 'a'.repeat(40);
    const blob = 'b'.repeat(40);
    const zero = '0'.repeat(40);
    expect(parseDiffTree(`${commitName}\0:100644 100644 ${zero} ${blob} M\0a.csv\0:100644 000000 ${blob} ${zero} D\0gone.csv\0`)).toEqual([{ file: 'a.csv', blob, commit: commitName }]);
    expect(parseDiffTree(`${commitName}\0::100644 100644 100755 ${zero} ${zero} ${blob} MM\0merged.dat\0`)).toEqual([{ file: 'merged.dat', blob, commit: commitName }]);
    expect(parseDiffTree(`${commitName}\0:000000 120000 ${zero} ${blob} A\0link\0:000000 160000 ${zero} ${blob} A\0module\0`)).toEqual([]);
    expect(() => parseDiffTree('not a commit\0')).toThrow('git diff-tree printed a line the fixture check cannot read');
    expect(() => parseDiffTree(`:100644 100644 ${zero} ${blob} M\0a.csv\0`)).toThrow('git diff-tree printed a record the fixture check cannot read');
    expect(() => parseDiffTree(`${commitName}\0:100644 ${blob} M\0a.csv\0`)).toThrow('git diff-tree printed a record the fixture check cannot read');
  });
});
