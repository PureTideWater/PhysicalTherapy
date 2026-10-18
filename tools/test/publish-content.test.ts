import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.resolve(import.meta.dirname, '../publish-content.sh');

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
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
    cwd: repo,
    env: gitEnv,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function prepare(n: string, files: Record<string, string>, manifestRelease: string = n): void {
  const dir = path.join(repo, 'content', 'outgoing', n);
  const hashes: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
    hashes[file] = createHash('sha256').update(text).digest('hex');
  }
  writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify({ release: Number.parseInt(manifestRelease, 10), files: hashes }));
}

function commitAll(message: string): void {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

function publish() {
  const result = spawnSync('bash', [script], { cwd: repo, env: gitEnv, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'publish-content-'));
  git('init', '-q', '-b', 'main');
  mkdirSync(path.join(repo, 'content', 'outgoing'), { recursive: true });
  writeFileSync(path.join(repo, 'content', 'outgoing', 'README.md'), 'outgoing\n');
  commitAll('base');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('publish-content.sh', () => {
  it('does nothing when no release is waiting', () => {
    expect(publish()).toMatchObject({ status: 0, stdout: '' });
    expect(git('rev-list', '--count', 'HEAD')).toBe('1');
  });

  it('moves, commits and tags each release in numeric order', () => {
    prepare('10', { 'RELEASE.md': '# 10\n' });
    prepare('2', { 'RELEASE.md': '# 2\n', 'carc/2026/records.json': '[]\n' });
    commitAll('prepare releases 2 and 10');
    const result = publish();
    expect(result).toMatchObject({ status: 0, stdout: '2\n10\n' });
    expect(existsSync(path.join(repo, 'content/releases/2/carc/2026/records.json'))).toBe(true);
    expect(existsSync(path.join(repo, 'content/releases/10/MANIFEST.json'))).toBe(true);
    expect(existsSync(path.join(repo, 'content/outgoing/2'))).toBe(false);
    expect(existsSync(path.join(repo, 'content/outgoing/README.md'))).toBe(true);
    expect(git('log', '--format=%s', '-2')).toBe('content: publish release 10\ncontent: publish release 2');
    expect(git('tag', '--list', 'content-release-*').split('\n').sort()).toEqual(['content-release-10', 'content-release-2']);
    expect(git('status', '--porcelain')).toBe('');
  });

  it('refuses a release whose files do not match its manifest, publishing nothing', () => {
    prepare('3', { 'RELEASE.md': '# 3\n' });
    writeFileSync(path.join(repo, 'content/outgoing/3/RELEASE.md'), '# tampered\n');
    commitAll('tampered release');
    const result = publish();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SHA-256 mismatch for RELEASE.md');
    expect(existsSync(path.join(repo, 'content/releases'))).toBe(false);
    expect(git('tag', '--list')).toBe('');
  });

  it('refuses to overwrite a published release', () => {
    mkdirSync(path.join(repo, 'content/releases/4'), { recursive: true });
    writeFileSync(path.join(repo, 'content/releases/4/MANIFEST.json'), '{}');
    prepare('4', { 'RELEASE.md': '# 4\n' });
    commitAll('collide');
    expect(publish()).toMatchObject({ status: 1, stderr: expect.stringContaining('already exists') as string });
  });

  it('refuses a directory that is not a release number', () => {
    prepare('next', { 'RELEASE.md': '# next\n' }, '1');
    commitAll('unnumbered');
    expect(publish()).toMatchObject({ status: 1, stderr: expect.stringContaining('not a numbered release') as string });
  });

  it('refuses a release holding records below L2 or marked synthetic, publishing nothing', () => {
    const record = (level: string, synthetic = false) => ({
      record_type: 'therapy_threshold',
      key: { discipline: 'PT_SLP' },
      verification: { level },
      source: { synthetic },
    });
    prepare('6', {
      'RELEASE.md': '# 6\n',
      'therapy_threshold/2026/records.json': JSON.stringify([record('L2'), record('L1')]),
      'therapy_threshold/2026/records.second-pass.json': JSON.stringify({ records: [] }),
    });
    commitAll('an L1 record');
    const result = publish();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('content/outgoing/6 holds records below L2 or marked synthetic');
    expect(result.stderr).toContain('therapy_threshold {"discipline":"PT_SLP"} L1');
    expect(existsSync(path.join(repo, 'content/releases'))).toBe(false);
    expect(git('tag', '--list')).toBe('');

    rmSync(path.join(repo, 'content/outgoing/6'), { recursive: true });
    prepare('6', { 'RELEASE.md': '# 6\n', 'therapy_threshold/2026/records.json': JSON.stringify([record('L3', true)]) });
    commitAll('a synthetic record');
    expect(publish()).toMatchObject({ status: 1, stderr: expect.stringContaining('L3 SYNTHETIC') as string });
  });

  it('refuses a number reserved for SYNTHETIC fixture releases', () => {
    prepare('900001', { 'RELEASE.md': '# synthetic\n' });
    commitAll('synthetic number');
    expect(publish()).toMatchObject({ status: 1, stderr: expect.stringContaining('reserved for SYNTHETIC fixture releases') as string });
  });

  it('refuses a release number that is already tagged', () => {
    git('tag', '-a', 'content-release-5', '-m', 'existing');
    prepare('5', { 'RELEASE.md': '# 5\n' });
    commitAll('retag');
    expect(publish()).toMatchObject({ status: 1, stderr: expect.stringContaining('already exists') as string });
  });
});
