import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = path.resolve(import.meta.dirname, '../verify-release-manifest.sh');

let outgoing = '';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function release(files: Record<string, string>, manifest?: unknown, name = '7'): string {
  const dir = path.join(outgoing, name);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  const listed = Object.fromEntries(Object.entries(files).map(([file, text]) => [file, sha256(text)]));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest ?? { release: Number.parseInt(name, 10), files: listed }));
  return dir;
}

function verify(dir: string) {
  const result = spawnSync('bash', [script, dir], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const files = { 'RELEASE.md': '# Release 7\n', 'pfs_rvu/2026/records.json': '[]\n' };

beforeEach(() => {
  outgoing = mkdtempSync(path.join(tmpdir(), 'outgoing-'));
});

afterEach(() => {
  rmSync(outgoing, { recursive: true, force: true });
});

describe('verify-release-manifest.sh', () => {
  it('accepts a directory whose files all match the manifest', () => {
    expect(verify(release(files))).toMatchObject({ status: 0, output: expect.stringContaining('matches its manifest (2 files)') as string });
  });

  it('accepts a trailing slash', () => {
    expect(verify(`${release(files)}/`).status).toBe(0);
  });

  it('refuses a changed file', () => {
    const dir = release(files);
    writeFileSync(path.join(dir, 'pfs_rvu/2026/records.json'), '[1]\n');
    expect(verify(dir)).toMatchObject({ status: 1, output: expect.stringContaining('SHA-256 mismatch for pfs_rvu/2026/records.json') as string });
  });

  it('refuses a file the manifest does not list', () => {
    const dir = release(files);
    writeFileSync(path.join(dir, 'stray.json'), '{}\n');
    expect(verify(dir)).toMatchObject({ status: 1, output: expect.stringContaining('> stray.json') as string });
  });

  it('refuses a listed file that is missing', () => {
    const listed = { 'RELEASE.md': sha256(files['RELEASE.md']), 'gone.json': sha256('x') };
    const dir = release({ 'RELEASE.md': files['RELEASE.md'] }, { release: 7, files: listed });
    expect(verify(dir)).toMatchObject({ status: 1, output: expect.stringContaining('< gone.json') as string });
  });

  it('refuses a manifest for another release number', () => {
    const listed = { 'RELEASE.md': sha256(files['RELEASE.md']) };
    expect(verify(release({ 'RELEASE.md': files['RELEASE.md'] }, { release: 8, files: listed })).status).toBe(1);
  });

  it('refuses a directory that is not a release number', () => {
    expect(verify(release(files, undefined, 'draft')).output).toContain('must be a release number');
  });

  it('refuses a missing or malformed manifest', () => {
    const dir = path.join(outgoing, '3');
    mkdirSync(dir);
    expect(verify(dir)).toMatchObject({ status: 1, output: expect.stringContaining('MANIFEST.json is missing') as string });
    writeFileSync(path.join(dir, 'MANIFEST.json'), 'not json');
    expect(verify(dir).status).toBe(1);
    writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify({ release: 3, files: {} }));
    expect(verify(dir).status).toBe(1);
  });

  it('refuses paths that escape the directory and values that are not digests', () => {
    expect(verify(release({ 'a.json': '{}' }, { release: 7, files: { '../a.json': sha256('{}') } })).output).toContain(
      'outside the directory',
    );
    expect(verify(release({ 'b.json': '{}' }, { release: 9, files: { 'b.json': 'abc' } }, '9')).output).toContain(
      'not SHA-256 hex digests',
    );
  });

  it('refuses a symbolic link', () => {
    const dir = release(files);
    symlinkSync('/etc/hostname', path.join(dir, 'link.json'));
    const manifest = { release: 7, files: { ...Object.fromEntries(Object.entries(files).map(([f, t]) => [f, sha256(t)])), 'link.json': sha256('x') } };
    writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest));
    expect(verify(dir)).toMatchObject({ status: 1, output: expect.stringContaining('link.json is a symbolic link') as string });
  });

  it('prints usage without a directory', () => {
    expect(spawnSync('bash', [script]).status).toBe(2);
  });
});
