import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.resolve(import.meta.dirname, '../check-releases-immutable.sh');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Synthetic Author',
  GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
  GIT_COMMITTER_NAME: 'Synthetic Author',
  GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

let repo = '';

function git(...args: string[]): string {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: repo, env: gitEnv, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
}

function commitAll(message: string): void {
  git('add', '-A');
  git('commit', '--allow-empty', '-q', '-m', message);
}

function check(base = 'main') {
  const result = spawnSync('bash', [script, base], { cwd: repo, env: gitEnv, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'releases-immutable-'));
  git('init', '-q', '-b', 'main');
  write('README.md', 'synthetic repository\n');
  commitAll('base');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function publishReleaseOne(): void {
  write('content/releases/1/MANIFEST.json', '{"release":1}\n');
  write('content/releases/1/pfs_rvu/records.json', '[]\n');
  commitAll('release 1');
  git('checkout', '-q', '-b', 'feature');
}

describe('check-releases-immutable.sh', () => {
  it('passes when content/releases exists on neither side', () => {
    git('checkout', '-q', '-b', 'feature');
    write('content/drafts/pfs_rvu/2026/records.json', '[]\n');
    commitAll('draft');
    expect(check()).toMatchObject({ status: 0, output: expect.stringContaining('nothing to compare') as string });
  });

  it('passes when every published release is unchanged', () => {
    publishReleaseOne();
    write('content/drafts/next.json', '[]\n');
    commitAll('unrelated change');
    expect(check()).toMatchObject({ status: 0, output: expect.stringContaining('1 published release(s) unchanged') as string });
  });

  it('fails when a pull request adds a release directory by hand', () => {
    publishReleaseOne();
    write('content/releases/2/a.json', '{}\n');
    commitAll('release 2 by hand');
    expect(check()).toMatchObject({ status: 1, output: expect.stringContaining('content/releases/2 is not on main') as string });
  });

  it('fails on a hand-made release when the base has none, committed or untracked', () => {
    git('checkout', '-q', '-b', 'feature');
    write('content/releases/1/MANIFEST.json', '{"release":1}\n');
    expect(check()).toMatchObject({ status: 1, output: expect.stringContaining('content/releases/1 is not on main') as string });
    commitAll('release 1 by hand');
    expect(check().status).toBe(1);
  });

  it('passes the branch the publish workflow commits to, once its base has the release', () => {
    publishReleaseOne();
    expect(check('main').status).toBe(0);
    expect(check('HEAD').status).toBe(0);
  });

  it('fails when a published file is modified', () => {
    publishReleaseOne();
    write('content/releases/1/pfs_rvu/records.json', '[{"changed":true}]\n');
    commitAll('edit a release');
    const result = check();
    expect(result.status).toBe(1);
    expect(result.output).toContain('M\tcontent/releases/1/pfs_rvu/records.json');
  });

  it('fails when a published file is deleted', () => {
    publishReleaseOne();
    git('rm', '-q', 'content/releases/1/pfs_rvu/records.json');
    commitAll('delete from a release');
    expect(check()).toMatchObject({ status: 1, output: expect.stringContaining('D\tcontent/releases/1/pfs_rvu/records.json') as string });
  });

  it('fails when a whole published release is removed', () => {
    publishReleaseOne();
    git('rm', '-q', '-r', 'content/releases');
    commitAll('remove releases');
    expect(check().status).toBe(1);
  });

  it('fails when a file is added to a published release', () => {
    publishReleaseOne();
    write('content/releases/1/extra.json', '{}\n');
    commitAll('add to a release');
    expect(check()).toMatchObject({ status: 1, output: expect.stringContaining('A\tcontent/releases/1/extra.json') as string });
  });

  it('fails on uncommitted and untracked changes too', () => {
    publishReleaseOne();
    write('content/releases/1/untracked.json', '{}\n');
    expect(check()).toMatchObject({ status: 1, output: expect.stringContaining('content/releases/1/untracked.json') as string });
  });

  it('refuses a missing or unknown base ref', () => {
    expect(spawnSync('bash', [script], { cwd: repo, env: gitEnv }).status).toBe(2);
    expect(check('no-such-ref').status).toBe(2);
  });
});
