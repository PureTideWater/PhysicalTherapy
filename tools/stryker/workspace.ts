import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The workspace packages and how a specifier that names one resolves, read once for both of their readers
 * (docs/adr/0066, Part 4): vitest.mutation.config.ts, which aliases every export to the sandbox's files so a test that
 * imports a package by name reaches the copy Stryker mutated, and importClosure (tools/screening-capacity/watched.ts),
 * which follows the same imports to build the mutation workflow's closures (tools/stryker/affected.ts) and the
 * screening-capacity gate's watched list. One reading, so a closure holds exactly the files a mutation run loads.
 *
 * - **The packages** are the directories pnpm-workspace.yaml lists (`dir` and `dir/*` patterns), each with a
 *   package.json and a name.
 * - **An export** is resolved as Node resolves it on import: its `import`, `node` or `default` condition, the first
 *   entry of an array that resolves, and `null` for a subpath it excludes. A subpath pattern (`./assets/*`) matches any
 *   text for its `*`, and the most specific key wins: an exact subpath, then the pattern with the longest text before
 *   its `*`.
 * - **A package without `exports`** resolves no specifier here: nothing aliases it, so a closure that imports one is
 *   refused rather than followed by a guess.
 */

/** An `exports` value: a path, a condition map, a fallback array, or null for an excluded subpath. */
export type ExportTarget = string | null | { readonly [condition: string]: ExportTarget } | readonly ExportTarget[];

/** The conditions an import is resolved under, in the order they are tried. */
export const IMPORT_CONDITIONS = ['import', 'node', 'default'] as const;

export interface WorkspacePackage {
  readonly name: string;
  /** Relative to the repository's root, with forward slashes. */
  readonly dir: string;
  /** Each export subpath (`.`, `./x`, `./assets/*`) and the file it resolves to (relative to `dir`), or null when it is excluded. */
  readonly exports: readonly (readonly [subpath: string, target: string | null])[];
}

/** The package directories pnpm-workspace.yaml lists, as `dir` and `dir/*` patterns, each holding a package.json. */
export function workspaceDirectories(root: string): string[] {
  const text = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  // The list's items, and any comment lines among them.
  const block = /^packages:\r?\n((?:[ \t]+[-#][^\n]*(?:\n|$))+)/m.exec(text)?.[1];
  if (block === undefined) throw new Error('pnpm-workspace.yaml lists no packages');
  const patterns = block
    .split('\n')
    .filter((line) => /^\s*-/.test(line))
    .map((line) => line.replace(/\s#.*$/, '').replace(/^\s*-\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter((pattern) => pattern !== '');
  return patterns
    .flatMap((pattern) => {
      if (/^[^*?!{}[\]]+\/\*$/.test(pattern)) {
        const parent = pattern.slice(0, -2);
        return readdirSync(path.join(root, parent), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${parent}/${entry.name}`)
          .sort();
      }
      if (/[*?!{}[\]]/.test(pattern)) throw new Error(`pnpm-workspace.yaml: the mutation tooling reads "dir" and "dir/*" patterns only, not "${pattern}"`);
      return [pattern];
    })
    .filter((directory) => existsSync(path.join(root, directory, 'package.json')));
}

/** The file an export resolves to on import (the conditions of IMPORT_CONDITIONS, an array's first that resolves), or undefined. */
export function importTarget(target: ExportTarget): string | undefined {
  if (target === null) return undefined;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return (target as readonly ExportTarget[]).map(importTarget).find((found) => found !== undefined);
  const conditions = target as { readonly [condition: string]: ExportTarget };
  for (const condition of IMPORT_CONDITIONS) {
    const found = condition in conditions ? importTarget(conditions[condition] ?? null) : undefined;
    if (found !== undefined) return found;
  }
  return undefined;
}

/** A manifest's `exports` as subpaths and their files: the `.` sugar of a string, an array or a condition map expanded. */
export function exportEntries(exports: ExportTarget | undefined): [string, string | null][] {
  if (exports === undefined || exports === null) return [];
  const map: { readonly [subpath: string]: ExportTarget } =
    typeof exports === 'string' || Array.isArray(exports) || !Object.keys(exports).every((key) => key.startsWith('.')) ? { '.': exports } : (exports as { readonly [subpath: string]: ExportTarget });
  return Object.entries(map).map(([subpath, target]) => [subpath, importTarget(target) ?? null]);
}

/** Every workspace package, in pnpm-workspace.yaml's order. */
export function workspacePackages(root: string): WorkspacePackage[] {
  const found: WorkspacePackage[] = [];
  for (const dir of workspaceDirectories(root)) {
    const manifest = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8')) as { name?: unknown; exports?: ExportTarget };
    if (typeof manifest.name !== 'string' || manifest.name === '') continue;
    found.push({ name: manifest.name, dir, exports: exportEntries(manifest.exports) });
  }
  return found;
}

/**
 * The file a subpath of a package resolves to, relative to the package's directory: an exact subpath first, then the
 * pattern whose text before `*` is longest (then whose whole key is longest), its `*` replaced by what it matched.
 * Null when the most specific match excludes it; undefined when no key matches.
 */
export function resolveExport(pkg: WorkspacePackage, subpath: string): string | null | undefined {
  const exact = pkg.exports.find(([key]) => key === subpath && !key.includes('*'));
  if (exact !== undefined) return exact[1];
  let best: { readonly prefix: string; readonly key: string; readonly target: string | null; readonly matched: string } | undefined;
  for (const [key, target] of pkg.exports) {
    const star = key.indexOf('*');
    if (star === -1 || key.indexOf('*', star + 1) !== -1) continue;
    const [prefix, suffix] = [key.slice(0, star), key.slice(star + 1)];
    // Node's rule: the subpath starts with the text before `*`, ends with the text after it, and is at least as long
    // as the key, so the `*` stands for one character or more.
    if (subpath.length < key.length || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const better = best === undefined || prefix.length > best.prefix.length || (prefix.length === best.prefix.length && key.length > best.key.length);
    if (better) best = { prefix, key, target, matched: subpath.slice(prefix.length, subpath.length - suffix.length) };
  }
  if (best === undefined) return undefined;
  return best.target === null ? null : best.target.replaceAll('*', best.matched);
}

/** A specifier's workspace package and the file it resolves to (relative to the root), when it names a package of `packages`. */
export interface WorkspaceImport {
  readonly pkg: WorkspacePackage;
  /** The resolved file, relative to the repository's root; null when the package exports no file for it. */
  readonly file: string | null;
}

/** Resolves a bare specifier against the workspace packages; undefined when it names none of them (a dependency, a built-in, a relative path). */
export function resolveWorkspaceImport(packages: readonly WorkspacePackage[], specifier: string): WorkspaceImport | undefined {
  const pkg = packages.filter((candidate) => specifier === candidate.name || specifier.startsWith(`${candidate.name}/`)).sort((a, b) => b.name.length - a.name.length)[0];
  if (pkg === undefined) return undefined;
  const target = resolveExport(pkg, `.${specifier.slice(pkg.name.length)}`);
  return { pkg, file: target === null || target === undefined ? null : path.posix.normalize(path.posix.join(pkg.dir, target)) };
}

/** Whether a specifier lies in a scope a workspace package's name uses (`@tp/...`, `@paidwhole/...`): no third-party package is expected there. */
export function inWorkspaceScope(packages: readonly WorkspacePackage[], specifier: string): boolean {
  const scope = /^(@[^/]+)\//.exec(specifier)?.[1];
  return scope !== undefined && packages.some((pkg) => pkg.name.startsWith(`${scope}/`));
}
