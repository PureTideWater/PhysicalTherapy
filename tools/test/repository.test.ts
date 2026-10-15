import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

function git(...args: string[]): string[] {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.split('\n').filter((line) => line !== '');
}

/** Where source lives; build output and dependencies inside these are expected to be ignored. */
const SOURCE = /^(apps\/[^/]+\/(src|e2e|scripts)\/|packages\/[^/]+\/src\/|infra\/(bin|lib|scripts|test)\/|tools\/(?!node_modules\/))/;

describe('repository hygiene', () => {
  // An unanchored "coverage/" pattern once hid apps/web's Coverage and Reports screens from git.
  it('has no tracked file that an ignore rule matches', () => {
    expect(git('ls-files', '--cached', '--ignored', '--exclude-standard')).toEqual([]);
  });

  it('ignores nothing under a source directory', () => {
    const ignored = git('ls-files', '--others', '--ignored', '--exclude-standard', '--directory');
    expect(ignored.filter((entry) => SOURCE.test(entry))).toEqual([]);
  });
});
