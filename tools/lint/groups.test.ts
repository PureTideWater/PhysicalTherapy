import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir, totalmem } from 'node:os';
import path from 'node:path';

import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import {
  type Host,
  LINT_GROUPS,
  MIN_HEAP_MB,
  RESERVED_MB,
  budgetMb,
  currentHost,
  eslintArgs,
  groupProblems,
  heapFor,
  largestFirst,
  runScheduled,
  startable,
} from './groups';
import { lint, runMeasured } from './run';

/**
 * CI-08, lint in memory-bounded groups (docs/adr/0066 Part 1): the three groups cover every linted file exactly once,
 * the scheduler fits the public and the private runner and always runs at least one group, and any group's warning
 * or error fails the run.
 */

const ESLINT_BIN = path.join(repositoryRoot, 'node_modules/eslint/bin/eslint.js');
const MB = 1024 * 1024;

/** GitHub's public Linux runner: 4 vCPU and 16 GB, about 15.6 GiB as os.totalmem() reports it. */
const PUBLIC_RUNNER: Host = { memoryMb: 15_974, parallelism: 4 };
/** GitHub's private Linux runner: 2 vCPU and 8 GB, about 7.7 GiB reported. */
const PRIVATE_RUNNER: Host = { memoryMb: 7_885, parallelism: 2 };

const byName = (name: string) => {
  const group = LINT_GROUPS.find((candidate) => candidate.name === name);
  if (group === undefined) {
    throw new Error(`no lint group ${name}`);
  }
  return group;
};

/** The groups as the runner plans them on a host: each with its heap, largest first. */
const planned = (host: Host) => largestFirst(LINT_GROUPS.map((group) => ({ name: group.name, heapMb: heapFor(group.nominalHeapMb, host) })));

/** Steps the scheduler as the runner does: start what fits, then finish the named group and start what fits again. */
function steps(host: Host, finishOrder: readonly string[]): string[][] {
  let pending = planned(host);
  const running: { name: string; heapMb: number }[] = [];
  const started: string[][] = [];
  const start = () => {
    const now = startable(pending, running.map((item) => item.heapMb), host);
    pending = pending.filter((item) => !now.includes(item));
    running.push(...now);
    started.push(now.map((item) => item.name));
  };
  start();
  for (const name of finishOrder) {
    const index = running.findIndex((item) => item.name === name);
    expect(index, `${name} is running when it finishes`).toBeGreaterThanOrEqual(0);
    running.splice(index, 1);
    if (pending.length > 0) {
      start();
    }
  }
  expect(pending).toEqual([]);
  return started;
}

describe('the lint groups', () => {
  it('are apps/web, packages and their complement, "." with the other roots ignored, so coverage is total by construction', () => {
    expect(LINT_GROUPS.map(({ name, target, ignorePatterns }) => ({ name, target, ignorePatterns }))).toEqual([
      { name: 'apps/web', target: 'apps/web', ignorePatterns: [] },
      { name: 'packages', target: 'packages', ignorePatterns: [] },
      { name: '.', target: '.', ignorePatterns: ['apps/web/', 'packages/'] },
    ]);
    expect(groupProblems(LINT_GROUPS)).toEqual([]);
  });

  it('ask for the nominal heaps the measured peaks need (web 4,813 MB, the others about 2,600 MB)', () => {
    expect(LINT_GROUPS.map((group) => group.nominalHeapMb)).toEqual([6_144, 4_096, 4_096]);
  });

  it('refuse a complement that misses a root, ignores a directory no group lints, or roots that overlap', () => {
    const [web, packages, complement] = LINT_GROUPS as [(typeof LINT_GROUPS)[number], (typeof LINT_GROUPS)[number], (typeof LINT_GROUPS)[number]];
    expect(groupProblems([web, packages, { ...complement, ignorePatterns: ['apps/web/'] }])).toEqual([
      'the complement "." must ignore exactly the other groups\' roots (apps/web/, packages/), not (apps/web/)',
    ]);
    expect(groupProblems([web, packages, { ...complement, ignorePatterns: ['apps/web/', 'packages/', 'tools/'] }])).toEqual([
      'the complement "." must ignore exactly the other groups\' roots (apps/web/, packages/), not (apps/web/, packages/, tools/)',
    ]);
    expect(groupProblems([web, { ...packages, name: 'apps', target: 'apps' }, { ...complement, ignorePatterns: ['apps/web/', 'apps/'] }])).toEqual([
      'group roots apps/web and apps overlap, so a file would be linted twice',
    ]);
    expect(groupProblems([web, packages])).toEqual(['exactly one group must be the complement "." (found 0)']);
    expect(groupProblems([web, packages, complement, { ...web, name: 'again' }])).toContain('group roots apps/web and apps/web overlap, so a file would be linted twice');
    expect(groupProblems([{ ...web, target: './apps/web' }, packages, { ...complement, ignorePatterns: ['./apps/web/', 'packages/'] }])).toContain(
      'group root ./apps/web must be a plain relative directory (no ".", "..", leading or trailing "/")',
    );
  });

  it('each run as its own node process with its heap and --max-warnings=0, the complement with an --ignore-pattern per other root', () => {
    expect(eslintArgs(byName('apps/web'), 6_144, '/r/node_modules/eslint/bin/eslint.js')).toEqual([
      '--max-old-space-size=6144',
      '/r/node_modules/eslint/bin/eslint.js',
      'apps/web',
      '--max-warnings=0',
    ]);
    expect(eslintArgs(byName('.'), 4_096, 'eslint.js', ['--fix'])).toEqual([
      '--max-old-space-size=4096',
      'eslint.js',
      '.',
      '--ignore-pattern',
      'apps/web/',
      '--ignore-pattern',
      'packages/',
      '--max-warnings=0',
      '--fix',
    ]);
  });
});

describe('the memory-bounded scheduler', () => {
  it('budgets the host memory less 2 GiB, and caps each heap at the budget with a floor', () => {
    expect(RESERVED_MB).toBe(2_048);
    expect(budgetMb(PUBLIC_RUNNER)).toBe(13_926);
    expect(budgetMb(PRIVATE_RUNNER)).toBe(5_837);
    expect(budgetMb({ memoryMb: 1_500, parallelism: 1 })).toBe(0);
    expect(heapFor(6_144, PUBLIC_RUNNER)).toBe(6_144);
    expect(heapFor(6_144, PRIVATE_RUNNER)).toBe(5_837);
    expect(heapFor(4_096, PRIVATE_RUNNER)).toBe(4_096);
    expect(heapFor(6_144, { memoryMb: 1_500, parallelism: 1 })).toBe(MIN_HEAP_MB);
  });

  it('orders largest first, keeping the order of equal heaps', () => {
    expect(largestFirst([{ id: 'a', heapMb: 1 }, { id: 'b', heapMb: 3 }, { id: 'c', heapMb: 1 }, { id: 'd', heapMb: 3 }]).map((item) => item.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('on the public 16 GB runner runs web and packages at once, then the complement when packages ends (14,336 MB would not fit)', () => {
    expect(steps(PUBLIC_RUNNER, ['packages', 'apps/web', '.'])).toEqual([['apps/web', 'packages'], ['.']]);
    expect(planned(PUBLIC_RUNNER).map((item) => item.heapMb)).toEqual([6_144, 4_096, 4_096]);
  });

  it('on the private 8 GB runner runs each group alone, web with its heap capped at the 5,837 MB budget', () => {
    expect(planned(PRIVATE_RUNNER).map((item) => item.heapMb)).toEqual([5_837, 4_096, 4_096]);
    expect(steps(PRIVATE_RUNNER, ['apps/web', 'packages', '.'])).toEqual([['apps/web'], ['packages'], ['.']]);
  });

  it('on a host too small for any nominal heap still runs one group at a time, and on one with no budget at all', () => {
    const small: Host = { memoryMb: 4_096, parallelism: 4 };
    expect(planned(small).map((item) => item.heapMb)).toEqual([2_048, 2_048, 2_048]);
    expect(steps(small, ['apps/web', 'packages', '.'])).toEqual([['apps/web'], ['packages'], ['.']]);
    const none: Host = { memoryMb: 1_024, parallelism: 4 };
    expect(planned(none).map((item) => item.heapMb)).toEqual([MIN_HEAP_MB, MIN_HEAP_MB, MIN_HEAP_MB]);
    expect(steps(none, ['apps/web', 'packages', '.'])).toEqual([['apps/web'], ['packages'], ['.']]);
  });

  it('runs no more groups at once than the host has cores, however much memory it has', () => {
    expect(steps({ memoryMb: 65_536, parallelism: 1 }, ['apps/web', 'packages', '.'])).toEqual([['apps/web'], ['packages'], ['.']]);
    expect(steps({ memoryMb: 65_536, parallelism: 2 }, ['packages', 'apps/web', '.'])).toEqual([['apps/web', 'packages'], ['.']]);
    expect(steps({ memoryMb: 65_536, parallelism: 4 }, ['packages', 'apps/web', '.'])).toEqual([['apps/web', 'packages', '.']]);
  });

  it('starts a smaller group beside a running one when a larger one does not fit (first fit, largest first)', () => {
    const host: Host = { memoryMb: 2_048 + 10_000, parallelism: 4 };
    expect(startable([{ heapMb: 6_000 }, { heapMb: 3_000 }], [5_000], host)).toEqual([{ heapMb: 3_000 }]);
  });

  it('runs every item exactly once, within the cores, within the budget unless one runs alone, and never stalls (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ heapMb: fc.integer({ min: 256, max: 8_192 }), ms: fc.integer({ min: 0, max: 3 }) }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 512, max: 32_768 }),
        fc.integer({ min: 1, max: 6 }),
        async (items, memoryMb, parallelism) => {
          const host: Host = { memoryMb, parallelism };
          const budget = budgetMb(host);
          const running = new Set<number>();
          const started: number[] = [];
          const ordered = items.map((item, index) => ({ ...item, index }));
          const results = await runScheduled(ordered, host, async (item) => {
            started.push(item.index);
            running.add(item.index);
            const heaps = [...running].reduce((sum, index) => sum + (ordered[index]?.heapMb ?? 0), 0);
            expect(running.size).toBeLessThanOrEqual(parallelism);
            expect(running.size === 1 || heaps <= budget).toBe(true);
            await new Promise((resolve) => setTimeout(resolve, item.ms));
            running.delete(item.index);
            return item.index * 10;
          });
          expect([...started].sort((a, b) => a - b)).toEqual(ordered.map((item) => item.index));
          expect(results).toEqual(ordered.map((item) => item.index * 10));
        },
      ),
      { numRuns: 60 },
    );
  }, 60_000);

  it('reads the host from the operating system, within any memory limit the process runs under (a container\'s cgroup)', () => {
    const host = currentHost();
    expect(host.parallelism).toBe(availableParallelism());
    const limit = process.constrainedMemory();
    const memory = limit > 0 ? Math.min(totalmem(), limit) : totalmem();
    expect(host.memoryMb).toBe(Math.floor(memory / MB));
  });
});

/** A repository with its own ESLint config, laid out like ours, with two prefixes that must not be taken for a root. */
function fixtureRepository(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-lint-groups-'));
  const layout: Record<string, string> = {
    'eslint.config.mjs': "export default [{ rules: { 'no-debugger': 'warn', 'no-unused-vars': 'error', 'prefer-const': 'error' } }];\n",
    'root.js': 'export const root = 1;\n',
    'apps/web/a.js': 'export const a = 1;\n',
    'apps/web/deep/b.mjs': 'export const b = 1;\n',
    'apps/webby/c.js': 'export const c = 1;\n',
    'apps/worker/d.cjs': 'module.exports = 1;\n',
    'packages/x/e.js': 'export const e = 1;\n',
    'packages-extra/f.js': 'export const f = 1;\n',
    'tools/g.js': 'export const g = 1;\n',
    'docs/readme.md': '# not linted\n',
    ...files,
  };
  for (const [file, text] of Object.entries(layout)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** The files one ESLint invocation lints, relative to the repository, and its exit status. */
function linted(root: string, args: readonly string[]): { files: string[]; status: number | null } {
  const out = path.join(root, '.out.json');
  rmSync(out, { force: true });
  const run = spawnSync(process.execPath, [...args, '--format', 'json', '--output-file', out], { cwd: root, encoding: 'utf8' });
  const results = JSON.parse(readFileSync(out, 'utf8')) as { filePath: string }[];
  rmSync(out);
  return { files: results.map((result) => path.relative(root, result.filePath).split(path.sep).join('/')).sort(), status: run.status };
}

describe('the groups on a repository (the CLI arguments the runner passes)', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lint exactly the files one whole-repository run lints, each file once', () => {
    const root = fixtureRepository();
    made.push(root);
    const whole = linted(root, [ESLINT_BIN, '.', '--max-warnings=0']);
    expect(whole.files).toEqual(['apps/web/a.js', 'apps/web/deep/b.mjs', 'apps/webby/c.js', 'apps/worker/d.cjs', 'eslint.config.mjs', 'packages-extra/f.js', 'packages/x/e.js', 'root.js', 'tools/g.js']);
    const perGroup = LINT_GROUPS.map((group) => ({ name: group.name, ...linted(root, eslintArgs(group, 512, ESLINT_BIN)) }));
    expect(Object.fromEntries(perGroup.map(({ name, files }) => [name, files]))).toEqual({
      'apps/web': ['apps/web/a.js', 'apps/web/deep/b.mjs'],
      packages: ['packages/x/e.js'],
      '.': ['apps/webby/c.js', 'apps/worker/d.cjs', 'eslint.config.mjs', 'packages-extra/f.js', 'root.js', 'tools/g.js'],
    });
    const all = perGroup.flatMap(({ files }) => files);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(whole.files);
    expect(perGroup.map(({ status }) => status)).toEqual([0, 0, 0]);
  }, 60_000);
});

describe('the lint runner (pnpm lint)', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const run = async (root: string, host: Host, extraArgs: readonly string[] = []) => {
    const out: string[] = [];
    const code = await lint({ root, host, eslintBin: ESLINT_BIN, extraArgs, color: false, write: (text) => out.push(text) });
    return { code, out: out.join('') };
  };

  it("prints each group's file count, peak RSS and duration, and passes a clean repository", async () => {
    const root = fixtureRepository();
    made.push(root);
    const { code, out } = await run(root, { memoryMb: 16_384, parallelism: 2 });
    expect(code).toBe(0);
    expect(out).toMatch(/lint apps\/web: passed, 2 files, 0 errors, 0 warnings, peak RSS [\d,]+ MB \(heap 6,144 MB\), \d+\.\d s/);
    expect(out).toMatch(/lint packages: passed, 1 file, 0 errors, 0 warnings, peak RSS [\d,]+ MB \(heap 4,096 MB\), \d+\.\d s/);
    expect(out).toMatch(/lint \.: passed, 6 files, 0 errors, 0 warnings, peak RSS [\d,]+ MB \(heap 4,096 MB\), \d+\.\d s/);
    expect(out).toContain('lint: passed, 9 files in 3 groups, 0 errors, 0 warnings');
  }, 60_000);

  it("fails the run on any group's warning (--max-warnings=0) and prints the problem", async () => {
    const root = fixtureRepository({ 'packages/x/e.js': 'export const e = 1;\ndebugger;\n' });
    made.push(root);
    const { code, out } = await run(root, { memoryMb: 4_096, parallelism: 1 });
    expect(code).toBe(1);
    expect(out).toMatch(/lint packages: failed, 1 file, 0 errors, 1 warning, /);
    expect(out).toContain('ESLint found too many warnings (maximum: 0).');
    expect(out).toMatch(/packages\/x\/e\.js\n\s+2:1\s+warning\s+Unexpected 'debugger' statement\s+no-debugger/);
    expect(out).toMatch(/lint apps\/web: passed/);
    expect(out).toContain('lint: failed (packages), 9 files in 3 groups, 0 errors, 1 warning');
  }, 60_000);

  it("fails the run on any group's error", async () => {
    const root = fixtureRepository({ 'apps/web/a.js': 'const unused = 1;\n' });
    made.push(root);
    const { code, out } = await run(root, { memoryMb: 16_384, parallelism: 4 });
    expect(code).toBe(1);
    expect(out).toMatch(/lint apps\/web: failed, 2 files, 1 error, 0 warnings, /);
    expect(out).toMatch(/'unused' is assigned a value but never used\s+no-unused-vars/);
  }, 60_000);

  it('fails a group whose ESLint process crashes, with its message', async () => {
    const root = fixtureRepository({ 'eslint.config.mjs': 'throw new Error("broken config");\n' });
    made.push(root);
    const { code, out } = await run(root, { memoryMb: 16_384, parallelism: 4 });
    expect(code).toBe(1);
    expect(out).toMatch(/lint apps\/web: failed \(ESLint exited with 2 and wrote no results\)/);
    expect(out).toContain('broken config');
  }, 60_000);

  it('passes --fix through to every group and refuses any other argument', async () => {
    const root = fixtureRepository({ 'tools/g.js': 'let g = 1;\nexport { g };\n' });
    made.push(root);
    const host: Host = { memoryMb: 16_384, parallelism: 4 };
    const positional = await run(root, host, ['apps/web']);
    expect(positional.code).toBe(2);
    expect(positional.out).toContain('pnpm lint takes no argument but --fix (given: apps/web)');
    expect((await run(root, host, ['--quiet'])).code).toBe(2);
    const unfixed = await run(root, host);
    expect(unfixed.code).toBe(1);
    expect(unfixed.out).toMatch(/'g' is never reassigned\. Use 'const' instead\s+prefer-const/);
    const fixed = await run(root, host, ['--fix']);
    expect(fixed.code).toBe(0);
    expect(readFileSync(path.join(root, 'tools/g.js'), 'utf8')).toBe('const g = 1;\nexport { g };\n');
  }, 60_000);

  it('refuses bulk suppressions, which a group would read as unused for the files it does not lint', async () => {
    const root = fixtureRepository({ 'eslint-suppressions.json': '{}\n' });
    made.push(root);
    const { code, out } = await run(root, { memoryMb: 16_384, parallelism: 4 });
    expect(code).toBe(2);
    expect(out).toContain('eslint-suppressions.json');
  }, 60_000);
});

describe('runMeasured', () => {
  it("reports the child's exit code, output and peak RSS", async () => {
    const result = await runMeasured(['-e', 'const keep = Buffer.alloc(64 * 1024 * 1024, 1); process.stdout.write(String(keep.length)); process.exitCode = 3;'], { cwd: repositoryRoot });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe(String(64 * MB));
    expect(result.peakRssMb).toBeGreaterThanOrEqual(64);
    expect(result.seconds).toBeGreaterThan(0);
  }, 60_000);

  it('reports a child that cannot start', async () => {
    const result = await runMeasured(['/no/such/script.js'], { cwd: repositoryRoot });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Cannot find module');
  }, 60_000);
});
