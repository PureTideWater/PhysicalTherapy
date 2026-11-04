import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../../content-files';
import { pnpmOfUserAgent } from '../runtime';
import { reportOf } from '../test-support';
import { CANARY_TESTS } from './vitest.config';
import { EXPECTED_FILE, type Expected, canaryPassed, headCommit, judgeCanary, parseExpected, verdictFile, verdictLines } from './verdict';

/**
 * The mutation canary's verdict (tools/stryker/canary/verdict.ts; test matrix CI-15): every mutant of each case's file
 * held to the statuses expected.json allows, with nothing reported that no case expects. The canary itself runs under
 * Stryker as each shard's first step; these tests hold the judgement and expected.json's shape.
 */

const committed = parseExpected(JSON.parse(readFileSync(path.join(repositoryRoot, EXPECTED_FILE), 'utf8')));

/** A report in which every mutant of every case has its first allowed status, or the given one. */
function reportFor(expected: Expected, status: (file: string, index: number) => string | undefined = () => undefined) {
  return reportOf(
    Object.fromEntries(
      expected.cases.map((item) => {
        // The originals one after another, each occurrence written out, so each mutant sits where its key says.
        const counts = new Map<string, number>();
        const parts: string[] = [];
        for (const mutant of item.mutants) {
          while ((counts.get(mutant.original) ?? 0) < mutant.occurrence) {
            parts.push(mutant.original);
            counts.set(mutant.original, (counts.get(mutant.original) ?? 0) + 1);
          }
        }
        return [
          item.file,
          {
            source: parts.join('\n'),
            mutants: item.mutants.map((mutant, index) => ({
              original: mutant.original,
              occurrence: mutant.occurrence,
              mutator: mutant.mutator,
              replacement: mutant.replacement,
              status: (status(item.file, index) ?? mutant.expect[0]) as never,
            })),
          },
        ];
      }),
    ),
  );
}

describe('the canary’s expected statuses', () => {
  it('hold five cases, each with its file, what it proves and every mutant’s allowed statuses', () => {
    expect(committed.cases.map((item) => [item.case, item.file])).toEqual([
      [1, 'tools/stryker/canary/named.ts'],
      [2, 'tools/stryker/canary/load.ts'],
      [3, 'tools/stryker/canary/lib/index.ts'],
      [4, 'tools/stryker/canary/seeded.ts'],
      [5, 'tools/stryker/canary/prefix.ts'],
    ]);
    // Case 2 allows a load failure as an error or a kill, never a survivor; case 5 expects its prefix mutant to survive.
    const load = committed.cases[1]?.mutants ?? [];
    expect(load.filter((mutant) => mutant.expect.includes('RuntimeError')).length).toBeGreaterThan(0);
    for (const mutant of load) expect(mutant.expect).not.toContain('Survived');
    expect(committed.cases[4]?.mutants.find((mutant) => mutant.mutator === 'AssignmentOperator')?.expect).toEqual(['Survived']);
    expect(committed.cases[3]?.mutants.find((mutant) => mutant.replacement === 'false')?.expect).toEqual(['Killed']);
    // Every case has a test file the canary's vitest configuration runs.
    expect(CANARY_TESTS).toEqual(committed.cases.map((item) => (item.case === 3 ? 'tools/stryker/canary/linked.test.ts' : item.file.replace(/\.ts$/, '.test.ts'))));
  });

  it('refuse a file that is not five numbered cases with mutants', () => {
    expect(() => parseExpected({})).toThrow(`${EXPECTED_FILE}: holds no list of cases`);
    expect(() => parseExpected({ cases: committed.cases.slice(0, 4) })).toThrow('holds 4 cases, not 5');
    expect(() => parseExpected({ cases: [...committed.cases.slice(1), committed.cases[0]] })).toThrow('case 1 is numbered 2');
    expect(() => parseExpected({ cases: committed.cases.map((item, index) => (index === 2 ? { ...item, mutants: [] } : item)) })).toThrow('case 3 expects no mutant');
    expect(() => parseExpected({ cases: committed.cases.map((item, index) => (index === 0 ? { ...item, mutants: [{ ...item.mutants[0], expect: ['Dead'] }] } : item)) })).toThrow('case 1 has a mutant without');
  });
});

describe('the verdict', () => {
  it('is 5 of 5 when every mutant has an allowed status', () => {
    const verdict = judgeCanary(reportFor(committed), committed, 'money-ledger');
    expect(verdict.problems).toEqual([]);
    expect(verdict.cases.map((item) => item.asExpected)).toEqual([true, true, true, true, true]);
    expect(verdict).toMatchObject({ format: 'tp-mutation-canary/1', shard: 'money-ledger', total: 5, asExpected: 5 });
    expect(canaryPassed(verdict)).toBe(true);
    expect(verdictLines(verdict).at(-1)).toBe('canary (money-ledger): 5 of 5 cases as expected');
  });

  it('fails a case whose mutant has another status: a load failure survived, a seeded kill missed, a prefix kill made', () => {
    const load = committed.cases[1]?.mutants.findIndex((mutant) => mutant.expect.includes('RuntimeError')) ?? -1;
    const seeded = committed.cases[3]?.mutants.findIndex((mutant) => mutant.replacement === 'false') ?? -1;
    const prefix = committed.cases[4]?.mutants.findIndex((mutant) => mutant.mutator === 'AssignmentOperator') ?? -1;
    const flips: Record<string, [number, string]> = {
      'tools/stryker/canary/load.ts': [load, 'Survived'],
      'tools/stryker/canary/seeded.ts': [seeded, 'Survived'],
      'tools/stryker/canary/prefix.ts': [prefix, 'Killed'],
    };
    const verdict = judgeCanary(
      reportFor(committed, (file, index) => (flips[file]?.[0] === index ? flips[file][1] : undefined)),
      committed,
      'packets-scan',
    );
    expect(verdict.cases.map((item) => item.asExpected)).toEqual([true, false, true, false, false]);
    expect(verdict.asExpected).toBe(2);
    expect(canaryPassed(verdict)).toBe(false);
    expect(verdict.cases[1]?.problems[0]).toMatch(/: Survived, expected RuntimeError or Killed$/);
    expect(verdict.cases[4]?.problems[0]).toMatch(/AssignmentOperator .*: Killed, expected Survived$/);
    expect(verdictLines(verdict)).toContain('canary (packets-scan): 2 of 5 cases as expected');
  });

  it('fails a case with a mutant reported and not expected, or expected and not reported, and a file no case names', () => {
    const report = reportFor(committed);
    const named = report.files['tools/stryker/canary/named.ts'];
    if (named === undefined) throw new Error('no case 1 file');
    const missing = { ...report, files: { ...report.files, 'tools/stryker/canary/named.ts': { ...named, mutants: named.mutants.slice(1) } } };
    expect(judgeCanary(missing, committed).cases[0]?.problems[0]).toMatch(/^expected, not reported: tools\/stryker\/canary\/named\.ts /);
    const extra = { ...report, files: { ...report.files, 'tools/stryker/canary/named.ts': { ...named, mutants: [...named.mutants, { ...named.mutants[0], id: 'extra', replacement: 'other' } as (typeof named.mutants)[number]] } } };
    expect(judgeCanary(extra, committed).cases[0]?.problems[0]).toMatch(/^reported, not expected: /);
    const stray = { ...report, files: { ...report.files, 'tools/stryker/elsewhere.ts': { source: 'x', mutants: [{ ...named.mutants[0], location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } } as (typeof named.mutants)[number]] } } };
    const verdict = judgeCanary(stray, committed);
    expect(verdict.problems).toEqual(['tools/stryker/elsewhere.ts is mutated, but no case names it']);
    expect(verdict.asExpected).toBe(0);
    expect(canaryPassed(verdict)).toBe(false);
  });

  it('is written where the gate reads it', () => {
    expect(verdictFile('money-ledger')).toBe('reports/mutation/money-ledger/canary.json');
    expect(verdictFile(null)).toBe('reports/canary/verdict.json');
  });

  it('names the runtime its shard ran on, as the gate holds the Unicode-bound equivalents to it', () => {
    // pnpm as the verdict reads it, from the user agent pnpm sets for the step (none under a bare vitest).
    expect(judgeCanary(reportFor(committed), committed, 'money-ledger').runtime).toEqual({ node: process.version, unicode: process.versions.unicode, icu: process.versions.icu, pnpm: pnpmOfUserAgent(process.env.npm_config_user_agent) });
    expect(judgeCanary(reportFor(committed), committed, 'money-ledger', { node: 'v24.22.0', unicode: '17.0', icu: '78.3', pnpm: '10.34.8' }).runtime).toEqual({ node: 'v24.22.0', unicode: '17.0', icu: '78.3', pnpm: '10.34.8' });
  });
});

/**
 * The pnpm and the commit a shard ran on (docs/adr/0066, Part 7; test matrix CI-29), which its verdict records for the
 * gate: pnpm from the user agent pnpm sets for the step it runs, the commit from .git, read as files, never by running
 * git.
 */
describe('the pnpm and the commit the verdict records', () => {
  it('reads pnpm’s version from the user agent pnpm sets for a step it runs', () => {
    expect(pnpmOfUserAgent('pnpm/10.34.8 npm/? node/v24.22.0 linux x64')).toBe('10.34.8');
    expect(pnpmOfUserAgent('pnpm/11.0.0-rc.1 npm/? node/v24.22.0 darwin arm64')).toBe('11.0.0-rc.1');
  });

  it('gives no pnpm when no user agent names one', () => {
    for (const agent of [undefined, '', 'npm/10.9.2 node/v24.22.0 linux x64 workspaces/false', 'yarn/4.0.0 npm/? node/v24.22.0 linux x64', 'pnpm/10.34.8', ' pnpm/10.34.8 npm/?']) expect(pnpmOfUserAgent(agent), String(agent)).toBe('');
  });

  it('reads the commit checked out from .git: a detached HEAD, a branch’s loose or packed ref, a worktree’s; none when it cannot', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'tp-verdict-'));
    const write = (file: string, text: string) => {
      mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
      writeFileSync(path.join(tmp, file), text);
    };
    const [first, second, third, fourth, fifth] = ['1', '2', '3', '4', '5'].map((digit) => digit.repeat(40)) as [string, string, string, string, string];
    try {
      // A pull request's checkout: the merge commit, detached.
      write('detached/.git/HEAD', `${first}\n`);
      expect(headCommit(path.join(tmp, 'detached'))).toBe(first);
      // A push's checkout (checkout -B <branch>): a branch, its ref loose, which wins over a packed one.
      write('loose/.git/HEAD', 'ref: refs/heads/claude/build-platform\n');
      write('loose/.git/refs/heads/claude/build-platform', `${second}\n`);
      write('loose/.git/packed-refs', `# pack-refs with: peeled fully-peeled sorted \n${third} refs/heads/claude/build-platform\n`);
      expect(headCommit(path.join(tmp, 'loose'))).toBe(second);
      // A packed ref, a peeled tag's line skipped.
      write('packed/.git/HEAD', 'ref: refs/heads/main\n');
      write('packed/.git/packed-refs', `# pack-refs with: peeled fully-peeled sorted \n${fourth} refs/tags/v1\n^${first}\n${third} refs/heads/main\n`);
      expect(headCommit(path.join(tmp, 'packed'))).toBe(third);
      // A linked worktree: .git is a file naming its git directory, whose commondir holds the branches.
      write('main/.git/worktrees/side/HEAD', 'ref: refs/heads/topic\n');
      write('main/.git/worktrees/side/commondir', '../..\n');
      write('main/.git/refs/heads/topic', `${fifth}\n`);
      write('side/.git', `gitdir: ${path.join(tmp, 'main/.git/worktrees/side')}\n`);
      expect(headCommit(path.join(tmp, 'side'))).toBe(fifth);
      // None: no .git, a branch with no commit yet, a HEAD that is neither, a ref that leaves refs/.
      mkdirSync(path.join(tmp, 'none'));
      expect(headCommit(path.join(tmp, 'none'))).toBe('');
      write('unborn/.git/HEAD', 'ref: refs/heads/main\n');
      expect(headCommit(path.join(tmp, 'unborn'))).toBe('');
      write('garbled/.git/HEAD', `${first.slice(1)}\n`);
      expect(headCommit(path.join(tmp, 'garbled'))).toBe('');
      write('escape/.git/HEAD', 'ref: refs/../../outside\n');
      write('escape/outside', `${first}\n`);
      expect(headCommit(path.join(tmp, 'escape'))).toBe('');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    // And this checkout's, as git itself reads it.
    expect(headCommit(repositoryRoot)).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim());
  });
});
