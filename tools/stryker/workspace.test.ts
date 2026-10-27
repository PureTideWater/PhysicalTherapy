import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { workspaceAliases } from '../../vitest.mutation.config';
import { repositoryRoot } from '../content-files';
import { type WorkspacePackage, exportEntries, importTarget, inWorkspaceScope, resolveExport, resolveWorkspaceImport, workspaceDirectories, workspacePackages } from './workspace';

/**
 * The workspace packages and their exports as both readers resolve them (tools/stryker/workspace.ts): the mutation
 * aliases (vitest.mutation.config.ts) and the closures' import graph (tools/screening-capacity/watched.ts), so a
 * closure holds exactly what a mutation run loads.
 */

const pkg = (exports: WorkspacePackage['exports']): WorkspacePackage => ({ name: '@tp/x', dir: 'packages/x', exports });

describe('an export as Node resolves it on import', () => {
  it('takes the import, node or default condition, an array’s first entry that resolves, and null for an excluded subpath', () => {
    expect(importTarget('./a.ts')).toBe('./a.ts');
    expect(importTarget({ types: './a.d.ts', import: './a.ts', default: './a.cjs' })).toBe('./a.ts');
    expect(importTarget({ require: './a.cjs', node: './n.ts' })).toBe('./n.ts');
    expect(importTarget({ browser: './b.ts', default: './d.ts' })).toBe('./d.ts');
    expect(importTarget({ import: { node: './nested.ts' } })).toBe('./nested.ts');
    expect(importTarget([{ browser: './b.ts' }, './second.ts'])).toBe('./second.ts');
    expect(importTarget(null)).toBeUndefined();
    expect(importTarget({ browser: './b.ts' })).toBeUndefined();
  });

  it('reads the `.` sugar of a string, an array or a condition map, and a subpath map as it is', () => {
    expect(exportEntries('./index.ts')).toEqual([['.', './index.ts']]);
    expect(exportEntries(['./index.ts'])).toEqual([['.', './index.ts']]);
    expect(exportEntries({ import: './index.ts' })).toEqual([['.', './index.ts']]);
    expect(exportEntries({ '.': './index.ts', './private/*': null, './assets/*': './assets/*' })).toEqual([['.', './index.ts'], ['./private/*', null], ['./assets/*', './assets/*']]);
    expect(exportEntries(undefined)).toEqual([]);
  });

  it('matches an exact subpath first, then the pattern with the longest text before its *, its * standing for one character or more', () => {
    const x = pkg([['./assets/*', './assets/*'], ['./assets/icons/*', './icons/*.svg'], ['./assets/private/*', null], ['./assets/logo', './logo.svg'], ['./*/docs', './docs/*/index.md']]);
    expect(resolveExport(x, './assets/logo')).toBe('./logo.svg');
    expect(resolveExport(x, './assets/mark.png')).toBe('./assets/mark.png');
    expect(resolveExport(x, './assets/icons/check')).toBe('./icons/check.svg');
    expect(resolveExport(x, './assets/private/key')).toBeNull();
    expect(resolveExport(x, './assets/')).toBeUndefined();
    expect(resolveExport(x, './api/docs')).toBe('./docs/api/index.md');
    expect(resolveExport(x, './nothing')).toBeUndefined();
  });

  it('resolves a specifier to its package’s file, and only a workspace package’s name or scope', () => {
    const packages = [pkg([['.', './src/index.ts'], ['./testing', './src/testing.ts']]), { name: '@tp/x-extra', dir: 'packages/x-extra', exports: [['.', './index.ts']] as const }];
    expect(resolveWorkspaceImport(packages, '@tp/x')?.file).toBe('packages/x/src/index.ts');
    expect(resolveWorkspaceImport(packages, '@tp/x/testing')?.file).toBe('packages/x/src/testing.ts');
    expect(resolveWorkspaceImport(packages, '@tp/x-extra')?.file).toBe('packages/x-extra/index.ts');
    expect(resolveWorkspaceImport(packages, '@tp/x/missing')).toMatchObject({ file: null });
    expect(resolveWorkspaceImport(packages, 'decimal.js')).toBeUndefined();
    expect(inWorkspaceScope(packages, '@tp/elsewhere')).toBe(true);
    expect(inWorkspaceScope(packages, '@aws-sdk/client-kms')).toBe(false);
    expect(inWorkspaceScope(packages, 'vitest')).toBe(false);
  });
});

describe('on this repository', () => {
  it('lists every package of pnpm-workspace.yaml, tools, infra and the canary’s package among them', () => {
    const directories = workspaceDirectories(repositoryRoot);
    for (const directory of ['apps/web', 'apps/worker', 'packages/money', 'packages/brand', 'infra', 'tools', 'tools/stryker/canary/lib']) expect(directories, directory).toContain(directory);
    const names = workspacePackages(repositoryRoot).map((item) => item.name);
    for (const name of ['@tp/tools', '@tp/stryker-canary', '@paidwhole/brand', '@tp/money']) expect(names, name).toContain(name);
  });

  it('resolves every export to the file its mutation alias points at, so a closure and a mutation run agree', () => {
    const packages = workspacePackages(repositoryRoot);
    const aliases = workspaceAliases(repositoryRoot);
    let checked = 0;
    for (const item of packages) {
      for (const [subpath, target] of item.exports) {
        if (target === null) continue;
        // A pattern is checked with a file that exists under it (a nested one, as `*` matches across `/`).
        const sample = subpath.includes('*') ? 'fonts/LICENSES.txt' : '';
        const specifier = `${item.name}${subpath === '.' ? '' : `/${subpath.slice(2).replace('*', sample)}`}`;
        const resolved = resolveWorkspaceImport(packages, specifier)?.file;
        const alias = aliases.find((candidate) => candidate.find.test(specifier));
        expect(alias, specifier).toBeDefined();
        expect(resolved, specifier).toBeTypeOf('string');
        expect(path.join(repositoryRoot, resolved ?? ''), specifier).toBe(specifier.replace(alias?.find ?? /$^/, alias?.replacement ?? ''));
        expect(existsSync(path.join(repositoryRoot, resolved ?? '')), `${specifier} -> ${String(resolved)}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBe(aliases.length);
    expect(resolveWorkspaceImport(packages, '@tp/tools/workspace')?.file).toBe('tools/release/workspace.ts');
    expect(resolveWorkspaceImport(packages, '@tp/stryker-canary')?.file).toBe('tools/stryker/canary/lib/index.ts');
  });
});
