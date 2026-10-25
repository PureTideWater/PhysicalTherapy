import { existsSync, globSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';
import { type Host, budgetMb, currentHost, runScheduled } from '../lint/groups';
import { type Measured, appendStepSummary, formatMb, plural, runMeasured } from '../lint/run';

/**
 * `pnpm typecheck` (docs/adr/0066 Part 1): the root's own tsconfig.json and every workspace pnpm-workspace.yaml's globs
 * name, each type-checked as its own `typecheck` script does (`tsc --noEmit`, which every workspace's must be: the
 * runner refuses to start otherwise), plus `--incremental` with its build information under node_modules/.cache/tsc,
 * so a warm run re-checks only what changed. tsc compares each file's hash with the one it recorded, so a stale cache
 * cannot pass a broken commit. The projects start slowest first (apps/web, tools and the worker, whose programs take
 * in most workspace packages' source), as many at once as the cores and the memory admit at about 2 GB each.
 *
 * Why not `incremental` in each tsconfig: tools/engine-freeze/check.ts freezes packages/pricing's manifest and
 * TypeScript settings with the engine, so the flags go on the command line and no workspace file changes.
 */

/** Where each project's build information lives, relative to the repository root (CI caches this directory). */
export const CACHE_DIR = 'node_modules/.cache/tsc';

/** The memory the scheduler sets aside for one tsc (apps/web's, the largest, peaked at 1,928 MB cold). */
export const TSC_PROCESS_MB = 2_048;

/** One tsc program: the root's or a workspace's. */
export interface Project {
  /** Relative to the repository root; "." for the root's own files. */
  readonly dir: string;
  /** Names its build-information file. */
  readonly slug: string;
  /** The tsconfig.json tsc is given, relative to the root. */
  readonly tsconfig: string;
}

/** Directories pnpm never takes a workspace from. */
const NOT_WORKSPACES = new Set(['node_modules', 'bower_components']);

/** Directories the source estimate does not count (installed packages and build output). */
const NOT_SOURCE = new Set([...NOT_WORKSPACES, 'dist', 'cdk.out', 'coverage', 'playwright-report', 'test-results']);

const posix = (file: string) => file.split(path.sep).join('/');
const trimmed = (pattern: string) => pattern.replace(/^\.\//, '').replace(/\/+$/, '');

/**
 * The workspace directories, as pnpm finds them: each directory a pnpm-workspace.yaml glob matches that holds a
 * manifest, none inside node_modules or bower_components, less those a negated glob matches. Sorted; the root is
 * not among them.
 */
export function workspaceDirs(root: string): string[] {
  const manifest = parse(readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')) as { packages?: unknown } | null;
  const patterns = Array.isArray(manifest?.packages) ? manifest.packages.filter((pattern): pattern is string => typeof pattern === 'string') : [];
  if (patterns.length === 0) {
    throw new Error('pnpm-workspace.yaml lists no packages');
  }
  const matched = (pattern: string) =>
    globSync(`${trimmed(pattern)}/package.{json,yaml,json5}`, { cwd: root, exclude: (file: string) => NOT_WORKSPACES.has(path.basename(file)) })
      .map((file) => posix(path.dirname(file)))
      .filter((dir) => dir !== '.' && !dir.split('/').some((part) => NOT_WORKSPACES.has(part)));
  const excluded = new Set(patterns.filter((pattern) => pattern.startsWith('!')).flatMap((pattern) => matched(pattern.slice(1))));
  const dirs = new Set(patterns.filter((pattern) => !pattern.startsWith('!')).flatMap(matched));
  return [...dirs].filter((dir) => !excluded.has(dir)).sort();
}

interface Manifest {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

const readManifest = (root: string, dir: string) => JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8')) as Manifest;

/**
 * Why the runner's check of a workspace would differ from the workspace's own: its typecheck script must be exactly
 * `tsc --noEmit`, beside its own tsconfig.json (tsc would otherwise search the parent directories for one).
 */
export function workspaceProblems(root: string, dirs: readonly string[]): string[] {
  const problems: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(path.join(root, dir, 'package.json'))) {
      problems.push(`${dir}: its manifest is not a package.json, which the runner reads`);
    } else {
      const script = readManifest(root, dir).scripts?.typecheck;
      if (script === undefined) {
        problems.push(`${dir}: it has no typecheck script ("tsc --noEmit")`);
      } else if (script !== 'tsc --noEmit') {
        problems.push(`${dir}: its typecheck script is "${script}", not "tsc --noEmit", so the runner would check it differently`);
      }
    }
    if (!existsSync(path.join(root, dir, 'tsconfig.json'))) {
      problems.push(`${dir}: it has no tsconfig.json`);
    }
  }
  return problems;
}

export function slugOf(dir: string): string {
  return dir === '.' ? 'root' : dir.split('/').join('_');
}

/** The root's project, then each workspace's; refuses two that would share a build-information file. */
export function projectsOf(dirs: readonly string[]): Project[] {
  const projects: Project[] = [{ dir: '.', slug: 'root', tsconfig: 'tsconfig.json' }, ...dirs.map((dir) => ({ dir, slug: slugOf(dir), tsconfig: `${dir}/tsconfig.json` }))];
  const bySlug = new Map<string, string>();
  for (const project of projects) {
    const other = bySlug.get(project.slug);
    if (other !== undefined) {
      throw new Error(`${other} and ${project.dir} share the build-information file ${project.slug}.tsbuildinfo`);
    }
    bySlug.set(project.slug, project.dir);
  }
  return projects;
}

/** tsc's arguments for a project: its own script's check, incremental from the cache, with tsc's run statistics. */
export function tscArgs(project: Project, root: string, pretty: boolean): string[] {
  return [
    '--noEmit',
    '-p',
    project.tsconfig,
    '--incremental',
    '--tsBuildInfoFile',
    path.join(root, CACHE_DIR, `${project.slug}.tsbuildinfo`),
    '--diagnostics',
    ...(pretty ? ['--pretty'] : []),
  ];
}

const SOURCE = /\.(?:ts|tsx|mts|cts)$/;

function countSources(dir: string, recursive: boolean): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && SOURCE.test(entry.name)) {
      count += 1;
    } else if (recursive && entry.isDirectory() && !entry.name.startsWith('.') && !NOT_SOURCE.has(entry.name)) {
      count += countSources(path.join(dir, entry.name), true);
    }
  }
  return count;
}

/**
 * Each project's estimated cost: the TypeScript files of its workspace and of every workspace it depends on, at
 * any depth (a program compiles its workspace dependencies' source); the root's own files for the root.
 */
export function estimatedCosts(root: string, dirs: readonly string[]): Map<string, number> {
  const own = new Map(dirs.map((dir) => [dir, countSources(path.join(root, dir), true)]));
  const manifests = new Map(dirs.map((dir) => [dir, readManifest(root, dir)]));
  const byName = new Map([...manifests].flatMap(([dir, manifest]) => (manifest.name === undefined ? [] : [[manifest.name, dir] as const])));
  const dependsOn = (dir: string) => {
    const manifest = manifests.get(dir) ?? {};
    return [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies]
      .flatMap((deps) => Object.entries(deps ?? {}))
      .filter(([, spec]) => spec.startsWith('workspace:'))
      .flatMap(([name]) => {
        const target = byName.get(name);
        return target === undefined ? [] : [target];
      });
  };
  const costs = new Map<string, number>([['.', countSources(root, false)]]);
  for (const dir of dirs) {
    const seen = new Set<string>();
    const visit = (current: string) => {
      if (!seen.has(current)) {
        seen.add(current);
        dependsOn(current).forEach(visit);
      }
    };
    visit(dir);
    costs.set(dir, [...seen].reduce((sum, current) => sum + (own.get(current) ?? 0), 0));
  }
  return costs;
}

/** The projects by estimated cost, highest first; equal costs keep their order. */
export function slowestFirst(projects: readonly Project[], costs: ReadonlyMap<string, number>): Project[] {
  return [...projects].sort((a, b) => (costs.get(b.dir) ?? 0) - (costs.get(a.dir) ?? 0));
}

/** How many tsc processes the scheduler runs at once on a host: within its cores and its budget at TSC_PROCESS_MB each, at least one. */
export function typecheckConcurrency(host: Host): number {
  return Math.min(host.parallelism, Math.max(1, Math.floor(budgetMb(host) / TSC_PROCESS_MB)));
}

/** A line of tsc's --diagnostics block ("Check time:       0.36s"). */
const DIAGNOSTIC = /^([A-Z][A-Za-z/ ]*):\s+(\S+)$/;

/** Splits tsc's --diagnostics block off its output: the files and the check time, and everything else as printed. */
export function parseDiagnostics(stdout: string): { output: string; files?: number; checkSeconds?: number } {
  const lines = stdout.split('\n');
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') {
    end -= 1;
  }
  let start = end;
  while (start > 0 && DIAGNOSTIC.test(lines[start - 1] ?? '')) {
    start -= 1;
  }
  if (start === end) {
    return { output: stdout };
  }
  const values = new Map(lines.slice(start, end).map((line) => DIAGNOSTIC.exec(line)?.slice(1, 3) as [string, string]));
  const files = Number.parseInt(values.get('Files') ?? '', 10);
  const check = Number.parseFloat((values.get('Check time') ?? '').replace(/s$/, ''));
  return {
    output: lines
      .slice(0, start)
      .map((line) => `${line}\n`)
      .join(''),
    ...(Number.isFinite(files) ? { files } : {}),
    ...(Number.isFinite(check) ? { checkSeconds: check } : {}),
  };
}

interface Outcome {
  readonly project: Project;
  /** Whether its build information was there when it started. */
  readonly warm: boolean;
  readonly measured: Measured;
  readonly diagnostics: ReturnType<typeof parseDiagnostics>;
  readonly passed: boolean;
}

export interface TypecheckOptions {
  readonly root: string;
  readonly host?: Host;
  /** The tsc a workspace's own script runs: typescript/bin/tsc as the workspace resolves it, unless given. */
  readonly resolveTsc?: (dir: string) => string;
  /** tsc's --pretty, when the output is a terminal unless given. */
  readonly pretty?: boolean;
  readonly write?: (text: string) => void;
}

/** Type-checks the repository; resolves with the exit code (0 passed, 1 a project failed, 2 refused to run). */
export async function typecheck(options: TypecheckOptions): Promise<number> {
  const { root } = options;
  const write = options.write ?? ((text: string) => void process.stdout.write(text));
  let dirs: string[];
  let projects: Project[];
  try {
    dirs = workspaceDirs(root);
    const problems = workspaceProblems(root, dirs);
    if (problems.length > 0) {
      write(`typecheck: refused, because a workspace would be checked differently from its own typecheck script:\n${problems.map((problem) => `- ${problem}\n`).join('')}`);
      return 2;
    }
    projects = slowestFirst(projectsOf(dirs), estimatedCosts(root, dirs));
  } catch (error) {
    write(`typecheck: refused: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  const host = options.host ?? currentHost();
  const pretty = options.pretty ?? process.stdout.isTTY === true;
  const resolveTsc = options.resolveTsc ?? ((dir: string) => createRequire(path.join(root, dir, 'package.json')).resolve('typescript/bin/tsc'));
  mkdirSync(path.join(root, CACHE_DIR), { recursive: true });
  write(
    `typecheck: ${plural(projects.length, 'project')} (the root and ${plural(dirs.length, 'workspace')}), slowest first, ${plural(typecheckConcurrency(host), 'process', 'processes')} at once (about ${formatMb(TSC_PROCESS_MB)} each within a memory budget of ${formatMb(budgetMb(host))}), build information in ${CACHE_DIR}\n`,
  );
  const started = process.hrtime.bigint();
  const outcomes = await runScheduled(
    projects.map((project) => ({ project, heapMb: TSC_PROCESS_MB })),
    host,
    async ({ project }): Promise<Outcome> => {
      const warm = existsSync(path.join(root, CACHE_DIR, `${project.slug}.tsbuildinfo`));
      let tsc: string;
      try {
        tsc = resolveTsc(project.dir);
      } catch {
        const measured: Measured = { code: null, signal: null, stdout: '', stderr: `typescript is not installed for ${project.dir} (pnpm install)\n`, peakRssMb: undefined, seconds: 0 };
        return { project, warm, measured, diagnostics: { output: '' }, passed: false };
      }
      const measured = await runMeasured([tsc, ...tscArgs(project, root, pretty)], { cwd: root });
      return { project, warm, measured, diagnostics: parseDiagnostics(measured.stdout), passed: measured.code === 0 };
    },
    (_, outcome) => {
      write(`${outcomeLine(outcome)}\n`);
      for (const text of [outcome.diagnostics.output, outcome.measured.stderr]) {
        if (text.trim() !== '') {
          write(text.endsWith('\n') ? text : `${text}\n`);
        }
      }
    },
  );
  const wall = Number(process.hrtime.bigint() - started) / 1e9;

  const failed = outcomes.filter((outcome) => !outcome.passed).map((outcome) => outcome.project.dir);
  const warm = outcomes.filter((outcome) => outcome.warm).length;
  const checkSeconds = outcomes.reduce((sum, outcome) => sum + (outcome.diagnostics.checkSeconds ?? 0), 0);
  const verdict = failed.length === 0 ? 'passed' : `failed (${failed.join(', ')})`;
  const cache = `cache: ${String(warm)} of ${String(outcomes.length)} warm (${CACHE_DIR}), ${checkSeconds.toFixed(2)} s of checking in all`;
  write(`typecheck: ${verdict}, ${plural(outcomes.length, 'project')} in ${wall.toFixed(1)} s wall; ${cache}\n`);
  appendStepSummary(
    [
      `### pnpm typecheck: ${verdict}`,
      '',
      '| Project | Time | Cache | Check time | Files | Peak RSS | Result |',
      '|---|---:|---|---:|---:|---:|---|',
      ...outcomes.map(
        (outcome) =>
          `| \`${outcome.project.dir}\` | ${outcome.measured.seconds.toFixed(1)} s | ${outcome.warm ? 'warm' : 'cold'} | ${checkTime(outcome)} | ${outcome.diagnostics.files === undefined ? 'unknown' : String(outcome.diagnostics.files)} | ${formatMb(outcome.measured.peakRssMb)} | ${outcome.passed ? 'passed' : 'failed'} |`,
      ),
      '',
      `${wall.toFixed(1)} s wall, ${plural(typecheckConcurrency(host), 'process', 'processes')} at once; ${cache}.`,
    ].join('\n'),
  );
  return failed.length === 0 ? 0 : 1;
}

function checkTime(outcome: Outcome): string {
  return outcome.diagnostics.checkSeconds === undefined ? 'unknown' : `${outcome.diagnostics.checkSeconds.toFixed(2)} s`;
}

/** "typecheck apps/web: passed in 56.0 s (cold; check 44.92 s; 3,890 files; peak RSS 1,928 MB)". */
function outcomeLine(outcome: Outcome): string {
  const { project, warm, measured, diagnostics } = outcome;
  const ended = measured.signal === null ? '' : `, ended by ${measured.signal}`;
  const files = diagnostics.files === undefined ? '' : `; ${plural(diagnostics.files, 'file')}`;
  return `typecheck ${project.dir}: ${outcome.passed ? 'passed' : 'failed'} in ${measured.seconds.toFixed(1)} s (${warm ? 'warm' : 'cold'}; check ${checkTime(outcome)}${files}; peak RSS ${formatMb(measured.peakRssMb)}${ended})`;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const extra = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  if (extra.length > 0) {
    process.stdout.write(`typecheck: pnpm typecheck takes no argument (given: ${extra.join(' ')}). Run pnpm --filter <workspace> typecheck for one workspace.\n`);
    process.exitCode = 2;
  } else {
    typecheck({ root: repositoryRoot }).then(
      (code) => {
        process.exitCode = code;
      },
      (error: unknown) => {
        process.stderr.write(`typecheck: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
        process.exitCode = 2;
      },
    );
  }
}
