import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dockerfilePaths, isImageFile, mergeBase, readTreeAt, readWorkingTree } from './tree';

/**
 * The base check-toolchain compares with: BASE reduced with `git merge-base BASE HEAD`, so a change is judged on what
 * it adds against the commit it left, however far BASE has moved since. Built in a scratch repository, made in beforeAll
 * so that collecting this file without running it (vitest list, a filtered run) leaves no directory behind.
 */
let root = '';
/** Further scratch repositories, each made in the test that uses it. */
const others: string[] = [];
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'check-toolchain-'));
});
afterAll(() => {
  for (const dir of [root, ...others]) if (dir) rmSync(dir, { recursive: true, force: true });
});

function gitIn(dir: string, args: readonly string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function git(...args: string[]): string {
  return gitIn(root, args);
}

function writeIn(dir: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
}

function write(file: string, text: string): void {
  writeIn(root, file, text);
}

/** A new scratch repository on branch `build`, removed after the file's tests. */
function repository(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-toolchain-'));
  others.push(dir);
  gitIn(dir, ['init', '-q', '-b', 'build']);
  return dir;
}

/** Commits everything in `dir` and returns the commit. */
function commitAll(dir: string, message: string): string {
  gitIn(dir, ['add', '-A']);
  gitIn(dir, ['commit', '-q', '-m', message]);
  return gitIn(dir, ['rev-parse', 'HEAD']);
}

/** A synthetic image reference by digest. */
const image = (seed: string) => `synthetic/base:1@sha256:${seed.repeat(64)}`;

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

  it('reads the base’s Dockerfiles, apps/<name>/Dockerfile at that commit, as it reads the checkout’s', () => {
    const dir = repository();
    writeIn(dir, 'README.md', 'synthetic');
    const empty = commitAll(dir, 'no apps yet');
    writeIn(dir, 'apps/web/Dockerfile', `FROM ${image('1')}\n`);
    writeIn(dir, 'apps/worker/Dockerfile', `FROM ${image('2')}\n`);
    writeIn(dir, 'apps/docs/README.md', 'not an image');
    writeIn(dir, 'apps/web/nested/Dockerfile', `FROM ${image('3')}\n`);
    const base = commitAll(dir, 'the base');
    // The change moves the web image and adds an app.
    writeIn(dir, 'apps/web/Dockerfile', `FROM ${image('4')}\n`);
    writeIn(dir, 'apps/api/Dockerfile', `FROM ${image('5')}\n`);
    commitAll(dir, 'the change');

    // Without them every digest would read as new, and every pull request would age both Dockerfiles' (review B1).
    expect(readTreeAt(dir, base).dockerfiles).toEqual({ 'apps/web/Dockerfile': `FROM ${image('1')}\n`, 'apps/worker/Dockerfile': `FROM ${image('2')}\n` });
    expect(readWorkingTree(dir).dockerfiles).toEqual({ 'apps/api/Dockerfile': `FROM ${image('5')}\n`, 'apps/web/Dockerfile': `FROM ${image('4')}\n`, 'apps/worker/Dockerfile': `FROM ${image('2')}\n` });
    expect(readTreeAt(dir, empty).dockerfiles).toEqual({});
  });

  it('holds each tree’s workflows, and the paths of every tracked image file outside the three the image rule reads (S6)', () => {
    const dir = repository();
    writeIn(dir, '.github/workflows/ci.yml', 'name: ci\n');
    writeIn(dir, '.github/workflows/notes.md', 'not a workflow');
    writeIn(dir, '.github/workflows/nested/inner.yml', 'name: not read by GitHub\n');
    writeIn(dir, 'docker-compose.yml', 'services: {}\n');
    writeIn(dir, 'apps/web/Dockerfile', `FROM ${image('1')}\n`);
    writeIn(dir, 'deploy/Dockerfile.dev', `FROM ${image('2')}\n`);
    writeIn(dir, 'compose.yaml', 'services: {}\n');
    const base = commitAll(dir, 'the base');
    writeIn(dir, '.github/workflows/ci.yml', 'name: ci, changed\n');
    writeIn(dir, '.github/workflows/release.yaml', 'name: release\n');
    writeIn(dir, 'tools/img/Containerfile', `FROM ${image('3')}\n`);
    writeIn(dir, 'apps/web/nested/Dockerfile', `FROM ${image('4')}\n`);
    writeIn(dir, 'docker-compose.override.yml', 'services: {}\n');
    writeIn(dir, 'img/web.dockerfile', `FROM ${image('5')}\n`);
    writeIn(dir, 'docs/docker-notes.md', 'not an image file');
    writeIn(dir, 'composer.json', '{}');
    commitAll(dir, 'the change');
    // Not tracked, so not part of the change.
    writeIn(dir, 'scratch/Dockerfile', `FROM ${image('6')}\n`);

    const before = readTreeAt(dir, base);
    expect(before.workflows).toEqual({ '.github/workflows/ci.yml': 'name: ci\n' });
    expect(before.imageFiles).toEqual(['compose.yaml', 'deploy/Dockerfile.dev']);
    const after = readWorkingTree(dir);
    expect(after.workflows).toEqual({ '.github/workflows/ci.yml': 'name: ci, changed\n', '.github/workflows/release.yaml': 'name: release\n' });
    expect(after.imageFiles).toEqual(['apps/web/nested/Dockerfile', 'compose.yaml', 'deploy/Dockerfile.dev', 'docker-compose.override.yml', 'img/web.dockerfile', 'tools/img/Containerfile']);
    // The compose file the rule reads is read as the other files are.
    expect([before.compose, after.compose]).toEqual(['services: {}\n', 'services: {}\n']);
  });

  it('takes as an image file Docker’s own names only, in any case, and no ordinary file whose name merely begins like one (CI-S2)', () => {
    const docker = [
      'Dockerfile',
      'dockerfile',
      'deploy/Dockerfile.dev',
      'tools/img/CONTAINERFILE',
      'tools/img/Containerfile.prod',
      'img/web.Dockerfile',
      'img/web.containerfile',
      'apps/web/nested/Dockerfile',
      'compose.yaml',
      'deploy/compose.yml',
      'Compose.Override.yaml',
      'docker-compose.override.yml',
      'deploy/docker-compose.yml',
      'docker-compose-dev.yaml',
      'compose.prod.yaml',
    ];
    expect(docker.filter((file) => !isImageFile(file))).toEqual([]);
    // dockerfileRule pulled out of check.ts, a runbook, notes, a content file, a Dockerfile's own ignore file, and the two files the image rule reads.
    const ordinary = [
      'tools/check-toolchain/dockerfile.ts',
      'tools/check-toolchain/dockerfile.test.ts',
      'docs/runbooks/dockerfiles.md',
      'docs/containerfile-notes.md',
      'content/compose-email.yml',
      'apps/web/Dockerfile.dockerignore',
      'composer.json',
      'docs/docker-notes.md',
      'apps/web/Dockerfile',
      'docker-compose.yml',
    ];
    expect(ordinary.filter(isImageFile)).toEqual([]);
  });
});
