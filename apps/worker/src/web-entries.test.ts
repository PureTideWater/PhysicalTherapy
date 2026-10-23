import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The web bundles every @tp/worker entry it imports (apps/web/next.config.ts transpiles @tp/worker), so a module those
 * entries reach must take the database package's running half, @tp/db/runtime, and never its main entry: @tp/db adds
 * the migration runner, which reads the migrations directory from disk, and Next's production build fails on it ("Failed
 * to collect page data"). PR 6b-4 met this when billing's dunning took the mail streams' module (audit #76).
 */

const ROOT = path.resolve(import.meta.dirname, '../../..');
const WORKER_MANIFEST = JSON.parse(readFileSync(path.join(ROOT, 'apps/worker/package.json'), 'utf8')) as { exports: Record<string, string> };
/** A value import or re-export (an `import type` or `export type` statement is erased and left out), or a dynamic import. */
const VALUE_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const DB_MAIN = /^@tp\/db$/;

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function webSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'test-support') {
        webSources(file, found);
      }
    } else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|d)\.tsx?$/.test(entry.name)) {
      found.push(file);
    }
  }
  return found;
}

/** Each module a relative or @tp/worker specifier names, relative to the repository root, or null (any other package). */
function workerModule(specifier: string, from: string): string | null {
  if (specifier.startsWith('.')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => isFile(path.join(ROOT, candidate))) ?? null;
  }
  const entry = /^@tp\/worker(\/.*)?$/.exec(specifier);
  const target = entry === null ? undefined : WORKER_MANIFEST.exports[`.${entry[1] ?? ''}`];
  return target === undefined ? null : path.posix.normalize(path.posix.join('apps/worker', target));
}

/** Every module the web's own sources reach by value through relative and @tp/worker imports, each with its first importer. */
function modulesTheWebReaches(): Map<string, string> {
  const importer = new Map<string, string>();
  const stack = webSources('apps/web/src');
  const seen = new Set(stack);
  for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
    for (const match of readFileSync(path.join(ROOT, file), 'utf8').matchAll(VALUE_IMPORT)) {
      const resolved = workerModule(match[1] ?? match[2] ?? '', file);
      if (resolved !== null && !seen.has(resolved) && !/\.test\.tsx?$/.test(resolved)) {
        seen.add(resolved);
        importer.set(resolved, file);
        stack.push(resolved);
      }
    }
  }
  return importer;
}

describe('the worker entries the web bundles', () => {
  it('reach the database package only through @tp/db/runtime, never its main entry', () => {
    const reached = [...modulesTheWebReaches()].filter(([file]) => file.startsWith('apps/worker/'));
    expect(reached.length).toBeGreaterThan(0);
    const offending = reached
      .filter(([file]) => [...readFileSync(path.join(ROOT, file), 'utf8').matchAll(VALUE_IMPORT)].some((match) => DB_MAIN.test(match[1] ?? match[2] ?? '')))
      .map(([file, from]) => `${file} (imported by ${from})`);
    expect(offending).toEqual([]);
  });
});
