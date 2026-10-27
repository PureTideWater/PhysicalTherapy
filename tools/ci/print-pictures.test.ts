import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * tools/ci/print-pictures.sh, which prints the e2e job's pictures into its log as a SHA-256 line and numbered chunks of
 * 8,000 base64 characters (docs/adr/0058; docs/runbooks/ci.md, "Upgrading the browser"), run as a step runs it, on
 * synthetic bytes in a temporary directory. The chunks need GNU base64's -w, as the runner has: on CI (CI set to
 * anything but empty or "false", as tools/test/ci-chromium.ts reads it) every case runs, so a runner without it fails
 * here; elsewhere, where a BSD base64 has no -w, only the cases that print no picture assert anything.
 */

const SCRIPT = path.join(repositoryRoot, 'tools/ci/print-pictures.sh');
const onCi = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';
const gnu = onCi || spawnSync('base64', ['-w', '0'], { input: '' }).status === 0;

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-print-pictures-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** The script over these paths, one per line on its standard input, in a directory of its own, as a step's bash runs it. */
function print(files: Record<string, Buffer | string>, listed: readonly string[]) {
  const dir = mkdtempSync(path.join(scratch, 'run-'));
  for (const [name, bytes] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), bytes);
  }
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', SCRIPT], { cwd: dir, input: listed.map((name) => `${name}\n`).join(''), encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } });
  expect(result.error).toBeUndefined();
  return { status: result.status, lines: result.stdout.split('\n').filter((line) => line !== ''), stderr: result.stderr };
}

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

/** Rebuilds every picture printed, as the procedure says: every chunk of 1/n to n/n, then the SHA-256 printed first. */
function rebuild(lines: readonly string[]): Map<string, Buffer> {
  const pictures = new Map<string, { hex: string; chunks: string[]; total: number }>();
  for (const line of lines) {
    const hash = /^(.+) sha256 ([0-9a-f]{64})$/.exec(line);
    if (hash) {
      pictures.set(hash[1] ?? '', { hex: hash[2] ?? '', chunks: [], total: 0 });
      continue;
    }
    const chunk = /^(.+) (\d+)\/(\d+) ([A-Za-z0-9+/=]+)$/.exec(line);
    const picture = pictures.get(chunk?.[1] ?? '');
    if (!chunk || !picture) throw new Error(`a line the procedure cannot read: ${line.slice(0, 120)}`);
    expect(Number(chunk[2])).toBe(picture.chunks.length + 1);
    picture.total = Number(chunk[3]);
    picture.chunks.push(chunk[4] ?? '');
  }
  return new Map(
    [...pictures].map(([name, { hex, chunks, total }]) => {
      expect(chunks).toHaveLength(total);
      const bytes = Buffer.from(chunks.join(''), 'base64');
      expect(sha(bytes), name).toBe(hex);
      return [name, bytes];
    }),
  );
}

describe('the pictures printed into a CI log (docs/adr/0058)', () => {
  it('prints nothing, and passes, when no path is given or none is a file, a deleted baseline among them', () => {
    expect(print({}, [])).toEqual({ status: 0, lines: [], stderr: '' });
    expect(print({ 'apps/web/test-results/brand': '' }, ['apps/web/e2e/brand.spec.ts-snapshots/header-1280-chromium-linux.png'])).toEqual({ status: 0, lines: [], stderr: '' });
  });

  it('prints each picture’s SHA-256 first, then its base64 in numbered chunks of 8,000 characters that rebuild it byte for byte', () => {
    if (!gnu) return;
    // 12,345 bytes, 16,460 base64 characters: three chunks; and a picture of one chunk beside it.
    const large = Buffer.from(Array.from({ length: 12_345 }, (_, index) => (index * 7) % 256));
    const small = Buffer.from('a small picture');
    const files = { 'apps/web/test-results/brand/header-diff.png': large, 'apps/web/test-results/brand/header-actual.png': small };
    const { status, lines, stderr } = print(files, Object.keys(files));
    expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
    const encoded = large.toString('base64');
    expect(lines).toEqual([
      `apps/web/test-results/brand/header-diff.png sha256 ${sha(large)}`,
      `apps/web/test-results/brand/header-diff.png 1/3 ${encoded.slice(0, 8000)}`,
      `apps/web/test-results/brand/header-diff.png 2/3 ${encoded.slice(8000, 16_000)}`,
      `apps/web/test-results/brand/header-diff.png 3/3 ${encoded.slice(16_000)}`,
      `apps/web/test-results/brand/header-actual.png sha256 ${sha(small)}`,
      `apps/web/test-results/brand/header-actual.png 1/1 ${small.toString('base64')}`,
    ]);
    expect(rebuild(lines)).toEqual(new Map(Object.entries(files)));
  });

  it('keeps a path as given, backslash included, and hashes the bytes, not the name', () => {
    if (!gnu) return;
    const name = 'apps/web/test-results/a\\nb-diff.png';
    const { status, lines } = print({ [name]: 'png' }, [name]);
    expect(status).toBe(0);
    expect(lines).toEqual([`${name} sha256 ${sha('png')}`, `${name} 1/1 ${Buffer.from('png').toString('base64')}`]);
  });

  it('prints a picture of no bytes as its SHA-256 alone, which rebuilds it', () => {
    if (!gnu) return;
    const { lines } = print({ 'empty.png': '' }, ['empty.png']);
    expect(lines).toEqual([`empty.png sha256 ${sha('')}`]);
    expect(rebuild(lines)).toEqual(new Map([['empty.png', Buffer.alloc(0)]]));
  });

  it('fails when a picture cannot be read, rather than print part of it', () => {
    const dir = mkdtempSync(path.join(scratch, 'unreadable-'));
    // A stand-in base64 that fails, first on PATH: the step must not pass over it.
    mkdirSync(path.join(dir, 'bin'));
    writeFileSync(path.join(dir, 'bin/base64'), '#!/usr/bin/env bash\nexit 3\n', { mode: 0o755 });
    writeFileSync(path.join(dir, 'p.png'), 'png');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', SCRIPT], { cwd: dir, input: 'p.png\n', encoding: 'utf8', env: { PATH: `${path.join(dir, 'bin')}:${process.env.PATH ?? '/usr/bin:/bin'}` } });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('p.png 1/');
  });
});
