import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import {
  CACHE_DIR,
  TSC_PROCESS_MB,
  estimatedCosts,
  parseDiagnostics,
  projectsOf,
  slowestFirst,
  slugOf,
  tscArgs,
  typecheck,
  typecheckConcurrency,
  workspaceDirs,
  workspaceProblems,
} from './run';

/**
 * `pnpm typecheck` (docs/adr/0066 Part 1): the root tsconfig and every workspace pnpm-workspace.yaml names, each with
 * the same check as the workspace's own `tsc --noEmit`, incrementally from node_modules/.cache/tsc, slowest first,
 * as many at once as the cores and memory admit.
 */

const REPO_TSC = createRequire(path.join(repositoryRoot, 'package.json')).resolve('typescript/bin/tsc');

describe('the workspaces', () => {
  it("are exactly pnpm's own, as pnpm-workspace.yaml's globs expand", () => {
    const listed = spawnSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], { cwd: repositoryRoot, encoding: 'utf8' });
    expect(listed.status, listed.stderr).toBe(0);
    const pnpmDirs = (JSON.parse(listed.stdout) as { path: string }[])
      .map((project) => path.relative(repositoryRoot, project.path).split(path.sep).join('/'))
      .filter((dir) => dir !== '')
      .sort();
    expect(pnpmDirs.length).toBeGreaterThanOrEqual(20);
    expect(workspaceDirs(repositoryRoot)).toEqual(pnpmDirs);
  }, 60_000);

  it("each type-check with exactly `tsc --noEmit` and their own tsconfig.json, so the runner's check is theirs", () => {
    const dirs = workspaceDirs(repositoryRoot);
    expect(workspaceProblems(repositoryRoot, dirs)).toEqual([]);
    for (const dir of dirs) {
      const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
      expect(manifest.scripts?.typecheck, dir).toBe('tsc --noEmit');
    }
  });

  it('are the root project and every workspace, each with its own build-information file', () => {
    const projects = projectsOf(workspaceDirs(repositoryRoot));
    expect(projects[0]).toEqual({ dir: '.', slug: 'root', tsconfig: 'tsconfig.json' });
    expect(projects.find((project) => project.dir === 'apps/web')).toEqual({ dir: 'apps/web', slug: 'apps_web', tsconfig: 'apps/web/tsconfig.json' });
    expect(projects.length).toBe(workspaceDirs(repositoryRoot).length + 1);
    expect(new Set(projects.map((project) => project.slug)).size).toBe(projects.length);
  });
});

describe('the tsc command', () => {
  it("is the workspace's own check, incremental, its build information under node_modules/.cache/tsc", () => {
    expect(CACHE_DIR).toBe('node_modules/.cache/tsc');
    expect(tscArgs({ dir: 'apps/web', slug: 'apps_web', tsconfig: 'apps/web/tsconfig.json' }, '/r', false)).toEqual([
      '--noEmit',
      '-p',
      'apps/web/tsconfig.json',
      '--incremental',
      '--tsBuildInfoFile',
      path.join('/r', 'node_modules/.cache/tsc/apps_web.tsbuildinfo'),
      '--diagnostics',
    ]);
    expect(tscArgs({ dir: '.', slug: 'root', tsconfig: 'tsconfig.json' }, '/r', true)).toEqual([
      '--noEmit',
      '-p',
      'tsconfig.json',
      '--incremental',
      '--tsBuildInfoFile',
      path.join('/r', 'node_modules/.cache/tsc/root.tsbuildinfo'),
      '--diagnostics',
      '--pretty',
    ]);
  });

  it('names each project by a slug that cannot collide', () => {
    expect(slugOf('.')).toBe('root');
    expect(slugOf('apps/web')).toBe('apps_web');
    expect(slugOf('infra')).toBe('infra');
    expect(() => projectsOf(['a/b', 'a_b'])).toThrow('a/b and a_b share the build-information file a_b.tsbuildinfo');
  });
});

describe('the schedule', () => {
  it('starts the slowest first (web, tools and the worker before the small packages)', () => {
    const dirs = workspaceDirs(repositoryRoot);
    const ordered = slowestFirst(projectsOf(dirs), estimatedCosts(repositoryRoot, dirs)).map((project) => project.dir);
    expect(ordered.slice(0, 3).sort()).toEqual(['apps/web', 'apps/worker', 'tools']);
    expect(ordered.indexOf('packages/money')).toBeGreaterThan(ordered.indexOf('packages/pricing'));
  });

  it('runs as many at once as the cores admit, about 2 GB each within the memory less 2 GiB, and at least one', () => {
    expect(TSC_PROCESS_MB).toBe(2_048);
    expect(typecheckConcurrency({ memoryMb: 15_974, parallelism: 4 })).toBe(4);
    expect(typecheckConcurrency({ memoryMb: 7_885, parallelism: 2 })).toBe(2);
    expect(typecheckConcurrency({ memoryMb: 7_885, parallelism: 8 })).toBe(2);
    expect(typecheckConcurrency({ memoryMb: 4_096, parallelism: 4 })).toBe(1);
    expect(typecheckConcurrency({ memoryMb: 1_024, parallelism: 4 })).toBe(1);
  });
});

describe("tsc's diagnostics", () => {
  const block = (check: string) =>
    ['Files:              211', 'Lines:            90234', 'Memory used:    140671K', 'I/O read:         0.02s', 'Parse time:       0.47s', `Check time:       ${check}`, 'Total time:       1.04s'].join('\n');

  it('give the files and the check time, and leave the rest of the output as tsc printed it', () => {
    expect(parseDiagnostics(`${block('0.36s')}\n`)).toEqual({ output: '', files: 211, checkSeconds: 0.36 });
    const errors = "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\n\nFound 1 error in src/a.ts:1\n\n";
    expect(parseDiagnostics(`${errors}${block('0.00s')}\n`)).toEqual({ output: errors, files: 211, checkSeconds: 0 });
  });

  it('leave output with no diagnostics block untouched', () => {
    expect(parseDiagnostics('error TS5058: The specified path does not exist.\n')).toEqual({ output: 'error TS5058: The specified path does not exist.\n' });
  });
});

/** A small monorepo of its own: a root project, three workspaces (one depending on another) and two the globs leave out. */
function fixtureMonorepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-typecheck-'));
  const compilerOptions = { strict: true, noEmit: true, types: [], target: 'ES2023', lib: ['ES2023'], module: 'ESNext', moduleResolution: 'Bundler', skipLibCheck: true };
  const manifest = (name: string, extra: Record<string, unknown> = {}) => `${JSON.stringify({ name, private: true, type: 'module', scripts: { typecheck: 'tsc --noEmit' }, ...extra }, null, 2)}\n`;
  const files: Record<string, string> = {
    'package.json': manifest('fixture-root'),
    'pnpm-workspace.yaml': "packages:\n  - 'pkgs/*'\n  - tool\n  - '!pkgs/skipped'\n",
    'tsconfig.json': `${JSON.stringify({ compilerOptions, include: ['*.ts'] })}\n`,
    'root.ts': 'export const root: number = 1;\n',
    'pkgs/one/package.json': manifest('@f/one'),
    'pkgs/one/tsconfig.json': `${JSON.stringify({ compilerOptions, include: ['src'] })}\n`,
    'pkgs/one/src/index.ts': 'export const one: number = 1;\n',
    'pkgs/two/package.json': manifest('@f/two', { dependencies: { '@f/one': 'workspace:*' } }),
    'pkgs/two/tsconfig.json': `${JSON.stringify({ compilerOptions, include: ['src'] })}\n`,
    'pkgs/two/src/a.ts': 'export const a: number = 1;\n',
    'pkgs/two/src/b.ts': 'export const b: number = 2;\n',
    'pkgs/skipped/package.json': manifest('@f/skipped'),
    'pkgs/not-a-package/notes.txt': 'no manifest here\n',
    'pkgs/one/node_modules/nested/package.json': manifest('nested'),
    'tool/package.json': manifest('@f/tool'),
    'tool/tsconfig.json': `${JSON.stringify({ compilerOptions, include: ['*.ts'] })}\n`,
    'tool/x.ts': 'export const x: number = 1;\n',
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('the runner on a monorepo', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const run = async (root: string) => {
    const out: string[] = [];
    const code = await typecheck({ root, host: { memoryMb: 16_384, parallelism: 2 }, resolveTsc: () => REPO_TSC, pretty: false, write: (text) => out.push(text) });
    return { code, out: out.join('') };
  };

  it("expands the globs as pnpm does: matched directories with a package.json, negations and node_modules left out", () => {
    const root = fixtureMonorepo();
    made.push(root);
    expect(workspaceDirs(root)).toEqual(['pkgs/one', 'pkgs/two', 'tool']);
    const costs = estimatedCosts(root, workspaceDirs(root));
    expect(Object.fromEntries(costs)).toEqual({ '.': 1, 'pkgs/one': 1, 'pkgs/two': 3, tool: 1 });
  }, 60_000);

  it("refuses a workspace whose own typecheck is not `tsc --noEmit`, or has none, or has no tsconfig.json", () => {
    const root = fixtureMonorepo();
    made.push(root);
    writeFileSync(path.join(root, 'pkgs/one/package.json'), JSON.stringify({ name: '@f/one', scripts: { typecheck: 'tsc --noEmit -p tsconfig.build.json' } }));
    writeFileSync(path.join(root, 'pkgs/two/package.json'), JSON.stringify({ name: '@f/two', scripts: {} }));
    rmSync(path.join(root, 'tool/tsconfig.json'));
    expect(workspaceProblems(root, workspaceDirs(root))).toEqual([
      'pkgs/one: its typecheck script is "tsc --noEmit -p tsconfig.build.json", not "tsc --noEmit", so the runner would check it differently',
      'pkgs/two: it has no typecheck script ("tsc --noEmit")',
      'tool: it has no tsconfig.json',
    ]);
  }, 60_000);

  it('checks every project cold, then warm from its build information, and fails on a type error a warm cache holds', async () => {
    const root = fixtureMonorepo();
    made.push(root);
    const cold = await run(root);
    expect(cold.code, cold.out).toBe(0);
    for (const dir of ['.', 'pkgs/one', 'pkgs/two', 'tool']) {
      expect(cold.out).toMatch(new RegExp(`typecheck ${dir.replace('.', '\\.')}: passed in \\d+\\.\\d s \\(cold; check \\d+\\.\\d\\d s; [\\d,]+ files; peak RSS [\\d,]+ MB\\)`));
    }
    expect(cold.out).toContain('typecheck: passed, 4 projects');
    expect(cold.out).toContain('cache: 0 of 4 warm');

    const warm = await run(root);
    expect(warm.code, warm.out).toBe(0);
    expect(warm.out).toMatch(/typecheck pkgs\/two: passed in \d+\.\d s \(warm; check 0\.00 s;/);
    expect(warm.out).toContain('cache: 4 of 4 warm');

    writeFileSync(path.join(root, 'pkgs/one/src/index.ts'), "export const one: number = 'one';\n");
    const broken = await run(root);
    expect(broken.code).toBe(1);
    expect(broken.out).toMatch(/typecheck pkgs\/one: failed in \d+\.\d s \(warm;/);
    expect(broken.out).toContain("pkgs/one/src/index.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(broken.out).toContain('typecheck: failed (pkgs/one), 4 projects');

    writeFileSync(path.join(root, 'pkgs/one/src/index.ts'), 'export const one: number = 1;\n');
    expect((await run(root)).code).toBe(0);
  }, 60_000);

  it('refuses before running anything when a workspace would be checked differently', async () => {
    const root = fixtureMonorepo();
    made.push(root);
    writeFileSync(path.join(root, 'tool/package.json'), JSON.stringify({ name: '@f/tool', scripts: { typecheck: 'vue-tsc --noEmit' } }));
    const { code, out } = await run(root);
    expect(code).toBe(2);
    expect(out).toContain('tool: its typecheck script is "vue-tsc --noEmit", not "tsc --noEmit"');
    expect(out).not.toContain('passed in');
  }, 60_000);
});
