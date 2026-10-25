import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { repositoryRoot } from '../content-files';

/**
 * What the screening-capacity gate watches on a pull request (the founder's Q8 of 2026-10-21; docs/runbooks/
 * screening-capacity.md, "What the gate watches"): every file the measured images and the harness run, so no change on
 * the screening's path merges with a green gate and no measurement (the review of 2026-10-22 found next.config.ts's body
 * limit, the web's queue, config and http helpers, the log allowlist, the database pool and the worker's heartbeat and
 * mail wiring left out of a hand-kept list). It is derived, not kept by hand:
 *
 * - the import closure of the entry points below: the worker bundle's main.ts and its pricing thread, the migration and
 *   login tasks the harness runs, the web's screening pages, actions, routes and the proxy and layout every page passes
 *   through, and the harness itself; each relative import and each workspace package's export (@tp/db, @tp/db/runtime,
 *   @tp/worker/jobs and the rest, read from its package.json) followed to its file;
 * - the files no import reaches that change what is measured (WATCHED_FIXED): the Dockerfiles, the web's Next config,
 *   the packages' manifests and the lockfile, the migrations, the settings the harness reads, the fixture release the
 *   scale release is built from, and the workflow.
 *
 * `pnpm exec tsx tools/screening-capacity/watched.ts --write` writes the list to WATCHED_LIST, and a unit test holds the
 * committed list equal to what this derives, so a new import on the path cannot be left unwatched. The workflow's
 * changes job reads the list from the pull request's base and its head (data only: it runs no repository code) and
 * measures when a changed file matches a line of either. A line is a path, or a shell pattern whose `*` also matches
 * across `/`, as a `case` reads it.
 */

/** The committed list the workflow reads. */
export const WATCHED_LIST = 'tools/screening-capacity/watched-paths.txt';

/** The entry points whose imports are watched (relative to the repository root). */
export const SCREENING_ENTRY_POINTS = [
  // The worker image: the bundle's main.ts (every job's handler is imported at its top, so the screening consumer runs
  // them all at start), its pricing thread, and the migration and login tasks the harness runs before the services.
  'apps/worker/src/main.ts',
  'apps/worker/src/screening/thread.ts',
  'packages/db/src/cli/migrate.ts',
  'apps/worker/src/deploy/logins-cli.ts',
  // The web image as the harness drives it: the screening's pages, actions and routes, the health route it waits on,
  // the root layout and error pages around every page, and the proxy every request passes.
  'apps/web/src/app/screening/page.tsx',
  'apps/web/src/app/screening/actions.ts',
  'apps/web/src/app/screening/results/[resultId]/page.tsx',
  'apps/web/src/app/screening/results/[resultId]/actions.ts',
  'apps/web/src/app/screening/results/[resultId]/not-found.tsx',
  'apps/web/src/app/api/screening/opened/route.ts',
  'apps/web/src/app/api/health/route.ts',
  'apps/web/src/app/layout.tsx',
  'apps/web/src/app/error.tsx',
  'apps/web/src/app/global-error.tsx',
  'apps/web/src/app/not-found.tsx',
  'apps/web/src/proxy.ts',
  // The harness: its run, the release load, the oracle and the scale release it builds.
  'tools/screening-capacity/run.ts',
  'tools/screening-capacity/load.ts',
  'tools/screening-capacity/oracle.ts',
  'tools/release/scale.ts',
] as const;

/** What no import reaches and still changes what is measured. */
export const WATCHED_FIXED = [
  '.github/workflows/screening-capacity.yml',
  'apps/web/Dockerfile',
  'apps/web/next.config.ts',
  'apps/web/package.json',
  'apps/web/public/*',
  'apps/worker/Dockerfile',
  'apps/worker/build.ts',
  'apps/worker/package.json',
  'fixtures/synthetic/rules/release-synth-900001/*',
  'infra/lib/constructs/compute.ts',
  'infra/lib/constructs/database.ts',
  'infra/lib/environments.ts',
  'infra/lib/screening.ts',
  'package.json',
  'packages/*/package.json',
  'packages/db/migrations/*',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tools/screening-capacity/*',
] as const;

/** An import or re-export's module specifier, or a dynamic import's. */
const IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

interface WorkspacePackage {
  readonly dir: string;
  readonly exports: Readonly<Record<string, string>>;
}

/** Each workspace package by name: its directory and its exports, as package.json gives them. */
function workspacePackages(root: string): Map<string, WorkspacePackage> {
  const found = new Map<string, WorkspacePackage>();
  for (const base of ['apps', 'packages']) {
    const parent = path.join(root, base);
    for (const name of existsSync(parent) ? readdirSync(parent) : []) {
      const manifest = path.join(parent, name, 'package.json');
      if (!existsSync(manifest)) {
        continue;
      }
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; exports?: Record<string, unknown> | string };
      const exports: Record<string, string> = {};
      if (typeof parsed.exports === 'string') {
        exports['.'] = parsed.exports;
      } else {
        for (const [key, value] of Object.entries(parsed.exports ?? {})) {
          const target = typeof value === 'string' ? value : ((value as { import?: string; default?: string } | null)?.import ?? (value as { default?: string } | null)?.default);
          if (typeof target === 'string') {
            exports[key] = target;
          }
        }
      }
      if (parsed.name !== undefined) {
        found.set(parsed.name, { dir: `${base}/${name}`, exports });
      }
    }
  }
  return found;
}

/** A module specifier resolved to a source file of the repository, relative to its root, or null (a dependency, a built-in). */
function resolveSpecifier(root: string, packages: Map<string, WorkspacePackage>, specifier: string, from: string): string | null {
  if (specifier.startsWith('.')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base.endsWith('.js') ? `${base.slice(0, -3)}.ts` : null];
    return candidates.find((candidate): candidate is string => candidate !== null && isFile(path.join(root, candidate))) ?? null;
  }
  const named = /^(@[^/]+\/[^/]+)(\/.*)?$/.exec(specifier);
  const workspace = named?.[1] === undefined ? undefined : packages.get(named[1]);
  if (workspace === undefined) {
    return null;
  }
  const target = workspace.exports[`.${named?.[2] ?? ''}`];
  return target === undefined ? null : path.posix.normalize(path.posix.join(workspace.dir, target));
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Every repository source file the entry points reach through their imports, sorted. Tests are left out unless
 * `includeTests` is set (the mutation workflow's closures, tools/stryker/affected.ts, which follow a package's tests and
 * what they import); the watched list leaves it off.
 */
export function importClosure(entries: readonly string[], root: string = repositoryRoot, options: { readonly includeTests?: boolean } = {}): string[] {
  const packages = workspacePackages(root);
  const seen = new Set<string>();
  const stack = [...entries];
  for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
    if (seen.has(file) || (options.includeTests !== true && /\.test\.tsx?$/.test(file))) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const resolved = resolveSpecifier(root, packages, match[1] ?? match[2] ?? '', file);
      if (resolved !== null && !seen.has(resolved)) {
        stack.push(resolved);
      }
    }
  }
  return [...seen].sort();
}

/**
 * Whether a path matches a line of the list as the workflow reads it: the path itself, or a line with a `*` as a `case`
 * pattern, where `*` matches anything, `/` included (no line with a `*` holds another pattern character; a test holds it).
 */
export function matchesWatched(file: string, line: string): boolean {
  if (file === line) {
    return true;
  }
  return line.includes('*') && new RegExp(`^${line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(file);
}

/** The list as the workflow reads it: the fixed lines, then each file of the closure no fixed line already covers. */
export function watchedPaths(root: string = repositoryRoot): string[] {
  const closure = importClosure(SCREENING_ENTRY_POINTS, root).filter((file) => !WATCHED_FIXED.some((line) => matchesWatched(file, line)));
  return [...WATCHED_FIXED, ...closure];
}

/** The committed file's text: a header, then one line each. */
export function watchedListText(lines: readonly string[]): string {
  return [
    '# The screening-capacity gate measures a pull request that changes a path below (tools/screening-capacity/watched.ts).',
    '# Generated: pnpm exec tsx tools/screening-capacity/watched.ts --write; a unit test holds it equal to what that derives.',
    '# A line is a path, or a shell pattern whose * also matches across /.',
    ...lines,
    '',
  ].join('\n');
}

/** The committed list's lines, comments and blanks left out. */
export function readWatchedList(text: string): string[] {
  return text.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const text = watchedListText(watchedPaths());
  if (process.argv.includes('--write')) {
    writeFileSync(path.join(repositoryRoot, WATCHED_LIST), text);
    process.stdout.write(`${WATCHED_LIST}: ${String(readWatchedList(text).length)} lines\n`);
  } else {
    process.stdout.write(text);
  }
}
