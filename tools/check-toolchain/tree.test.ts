import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { dockerfilePaths, mergeBase, readTreeAt, readWorkingTree } from './tree';

/**
 * The base check-toolchain compares with: BASE reduced with `git merge-base BASE HEAD`, so a change is judged on what
 * it adds against the commit it left, however far BASE has moved since. Built in a scratch repository.
 */
const root = mkdtempSync(path.join(tmpdir(), 'check-toolchain-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function git(...args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

describe('the trees check-toolchain compares', () => {
  it('takes the base from BASE through git merge-base, and reads each file as that commit holds it', () => {
    git('init', '-q', '-b', 'build');
    write('pnpm-lock.yaml', 'packages:\n  a@1.0.0: {}\n');
    write('package.json', '{"packageManager":"pnpm@10.34.8"}');
    git('add', '.');
    git('commit', '-q', '-m', 'fork point');
    const fork = git('rev-parse', 'HEAD');
    // The build branch moves on after the change left it.
    write('pnpm-lock.yaml', 'packages:\n  a@1.0.0: {}\n  b@1.0.0: {}\n');
    git('commit', '-q', '-am', 'the build branch moves on');
    git('checkout', '-q', '-b', 'change', fork);
    write('pnpm-lock.yaml', 'packages:\n  a@1.0.0: {}\n  c@1.0.0: {}\n');
    write('tools/check-toolchain/trust-exceptions.json', '{"entries":[]}');
    write('apps/web/Dockerfile', 'FROM node\n# packageManager\n');
    write('apps/docs/README.md', 'not an image');
    git('add', '.');
    git('commit', '-q', '-m', 'the change');

    expect(mergeBase(root, 'build')).toBe(fork);
    const base = readTreeAt(root, mergeBase(root, 'build'));
    // The fork point's lockfile, not the moved branch's: the change is judged on c alone.
    expect(base.lockfile).toBe('packages:\n  a@1.0.0: {}\n');
    expect(base.trustExceptions).toBeUndefined();
    const head = readWorkingTree(root);
    expect(head.lockfile).toContain('c@1.0.0');
    expect(head.trustExceptions).toBe('{"entries":[]}');
    expect(head.auditExceptions).toBeUndefined();
    expect(head.dockerfiles).toEqual({ 'apps/web/Dockerfile': 'FROM node\n# packageManager\n' });
    expect(dockerfilePaths(root)).toEqual(['apps/web/Dockerfile']);
  });

  it('fails, naming BASE, when there is no merge base', () => {
    expect(() => mergeBase(root, 'no-such-ref')).toThrow(/^check-toolchain: no merge base between BASE=no-such-ref and HEAD/);
  });
});
