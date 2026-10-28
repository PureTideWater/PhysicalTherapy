import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * The web bundles every @tp/worker entry it imports (apps/web/next.config.ts transpiles @tp/worker), so a module those
 * entries reach must take the database package's running half, @tp/db/runtime, and never its main entry: @tp/db adds
 * the migration runner, which reads the migrations directory from disk, and Next's production build fails on it ("Failed
 * to collect page data"). PR 6b-4 met this when billing's dunning took the mail streams' module (audit #76).
 *
 * What the web bundles is what Next's entries reach: every module of the app directory (its pages, layouts, route
 * handlers and error pages) and the modules at the source root beside it (the proxy), followed through their value
 * imports. The walk starts there and not at every web source, so a test-only helper is never read as bundled wherever
 * it lives (the route tests' world.ts, which seeds its worlds through the worker's runtime entry, sits outside a
 * test-support directory), while a module any page, layout, route handler or the proxy reaches, by any path, is.
 */

const REPOSITORY = path.resolve(import.meta.dirname, '../../..');
/** A value import or re-export (an `import type` or `export type` statement is erased and left out), or a dynamic import. */
const VALUE_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const DB_MAIN = /^@tp\/db$/;
const SOURCE = /\.tsx?$/;
const NOT_BUNDLED = /\.(?:test|d)\.tsx?$/;

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Every module under `dir` (relative to `root`), tests and declarations aside. */
function modulesUnder(root: string, dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      modulesUnder(root, file, found);
    } else if (SOURCE.test(entry.name) && !NOT_BUNDLED.test(entry.name)) {
      found.push(file);
    }
  }
  return found;
}

/** Next's entries in the web: every module of apps/web/src/app, and each module at apps/web/src's root (the proxy). */
function webEntries(root: string): string[] {
  const beside = readdirSync(path.join(root, 'apps/web/src'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE.test(entry.name) && !NOT_BUNDLED.test(entry.name))
    .map((entry) => `apps/web/src/${entry.name}`);
  return [...modulesUnder(root, 'apps/web/src/app'), ...beside];
}

/** The module a relative or @tp/worker specifier names, relative to `root`, or null (any other package). */
function workerModule(root: string, exports: Readonly<Record<string, string>>, specifier: string, from: string): string | null {
  if (specifier.startsWith('.')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => isFile(path.join(root, candidate))) ?? null;
  }
  const entry = /^@tp\/worker(\/.*)?$/.exec(specifier);
  const target = entry === null ? undefined : exports[`.${entry[1] ?? ''}`];
  return target === undefined ? null : path.posix.normalize(path.posix.join('apps/worker', target));
}

/** Every module Next's entries reach by value through relative and @tp/worker imports, each with its first importer. */
function modulesTheWebBundles(root: string): Map<string, string> {
  const { exports } = JSON.parse(readFileSync(path.join(root, 'apps/worker/package.json'), 'utf8')) as { exports: Record<string, string> };
  const importer = new Map<string, string>();
  const stack = webEntries(root);
  const seen = new Set(stack);
  for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
    for (const match of readFileSync(path.join(root, file), 'utf8').matchAll(VALUE_IMPORT)) {
      const resolved = workerModule(root, exports, match[1] ?? match[2] ?? '', file);
      if (resolved !== null && !seen.has(resolved) && !NOT_BUNDLED.test(resolved)) {
        seen.add(resolved);
        importer.set(resolved, file);
        stack.push(resolved);
      }
    }
  }
  return importer;
}

/** The worker modules the web bundles, and those of them that import @tp/db's main entry by value, with their importer. */
function readWorkerModules(root: string): { readonly reached: number; readonly offending: string[] } {
  const reached = [...modulesTheWebBundles(root)].filter(([file]) => file.startsWith('apps/worker/'));
  const offending = reached
    .filter(([file]) => [...readFileSync(path.join(root, file), 'utf8').matchAll(VALUE_IMPORT)].some((match) => DB_MAIN.test(match[1] ?? match[2] ?? '')))
    .map(([file, from]) => `${file} (imported by ${from})`);
  return { reached: reached.length, offending };
}

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A small repository of the given files, in a temporary directory removed when the file's tests end. */
function repositoryOf(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-web-entries-'));
  scratch.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

describe('the worker entries the web bundles', () => {
  it('reach the database package only through @tp/db/runtime, never its main entry', () => {
    const { reached, offending } = readWorkerModules(REPOSITORY);
    expect(reached).toBeGreaterThan(0);
    expect(offending).toEqual([]);
  });

  it('names a worker module a page reaches that imports the main entry, by any path, and never one only a test helper reaches', () => {
    const root = repositoryOf({
      'apps/worker/package.json': JSON.stringify({ exports: { './billing': './src/billing/public.ts', './runtime': './src/runtime.ts' } }),
      'apps/worker/src/billing/public.ts': "import { mailer } from '../mail/streams';\nimport type { DatabasePool } from '@tp/db';\nexport const dun = (pool: DatabasePool) => mailer(pool);\n",
      'apps/worker/src/mail/streams.ts': "import { openPool } from '@tp/db';\nexport const mailer = (pool: unknown) => [pool, openPool];\n",
      'apps/worker/src/runtime.ts': "export { migrate } from '@tp/db';\n",
      'apps/web/src/app/billing/page.tsx': "import { dunning } from '../../lib/billing/dunning';\nexport default function Page() { return dunning; }\n",
      'apps/web/src/lib/billing/dunning.ts': "import { dun } from '@tp/worker/billing';\nexport const dunning = dun;\n",
      'apps/web/src/lib/routes/route-tests/world.ts': "import { migrate } from '@tp/worker/runtime';\nexport const world = migrate;\n",
      'apps/web/src/lib/routes/route-tests/world.test.ts': "import { migrate } from '@tp/worker/runtime';\n",
      'apps/web/src/proxy.ts': 'export function proxy() {}\n',
    });
    expect(readWorkerModules(root)).toEqual({ reached: 2, offending: ['apps/worker/src/mail/streams.ts (imported by apps/worker/src/billing/public.ts)'] });
  });

  it('reads the proxy beside the app directory as an entry too', () => {
    const root = repositoryOf({
      'apps/worker/package.json': JSON.stringify({ exports: { './runtime': './src/runtime.ts' } }),
      'apps/worker/src/runtime.ts': "import { openPool } from '@tp/db';\nexport const pool = openPool;\n",
      'apps/web/src/app/page.tsx': 'export default function Page() { return null; }\n',
      'apps/web/src/proxy.ts': "import { pool } from '@tp/worker/runtime';\nexport function proxy() { return pool; }\n",
    });
    expect(readWorkerModules(root)).toEqual({ reached: 1, offending: ['apps/worker/src/runtime.ts (imported by apps/web/src/proxy.ts)'] });
  });
});
