import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * install-pnpm.sh, the Dockerfiles' pnpm install (security review N1), run with a stand-in npm on PATH: its `pack`
 * writes a synthetic tarball and its `install` records what it was asked to install. No network, no global install.
 * The script installs only a tarball whose sha512 equals packageManager's suffix, and installs nothing otherwise.
 */
const SCRIPT = fileURLToPath(new URL('./install-pnpm.sh', import.meta.url));
const TARBALL = 'synthetic pnpm tarball bytes\n';
const DIGEST = createHash('sha512').update(TARBALL).digest('hex');

let root = '';
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'install-pnpm-'));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** Runs the script on a package.json holding `packageManager`, with an npm whose pack writes `bytes`. */
function install(packageManager: string, bytes: string = TARBALL): { readonly status: number | null; readonly stderr: string; readonly installed: string | null; readonly packed: boolean } {
  const dir = mkdtempSync(path.join(root, 'case-'));
  const bin = path.join(dir, 'bin');
  const log = path.join(dir, 'npm.log');
  mkdirSync(bin);
  writeFileSync(path.join(dir, 'tarball'), bytes);
  writeFileSync(
    path.join(bin, 'npm'),
    [
      '#!/bin/sh',
      `log='${log}'`,
      'case "$1" in',
      // npm pack --silent --pack-destination <dir> pnpm@<version>
      `  pack) echo "pack $*" >> "$log"; version="\${5#pnpm@}"; cp '${path.join(dir, 'tarball')}' "$4/pnpm-\${version}.tgz" ;;`,
      '  install) echo "install $*" >> "$log" ;;',
      '  *) exit 9 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(path.join(bin, 'npm'), 0o755);
  const manifest = path.join(dir, 'package.json');
  writeFileSync(manifest, JSON.stringify({ name: 'synthetic', packageManager }));
  const result = spawnSync('sh', [SCRIPT, manifest], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` } });
  const lines = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  const installLine = lines.find((line) => line.startsWith('install '));
  return { status: result.status, stderr: result.stderr, installed: installLine ?? null, packed: lines.some((line) => line.startsWith('pack ')) };
}

describe('install-pnpm.sh', () => {
  it('installs the packed tarball when its sha512 equals packageManager’s suffix', () => {
    const result = install(`pnpm@10.34.8+sha512.${DIGEST}`);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.installed).toMatch(/^install install --global --no-audit --no-fund \S+\/pnpm-10\.34\.8\.tgz$/);
  });

  it('refuses a tampered tarball and installs nothing', () => {
    const result = install(`pnpm@10.34.8+sha512.${DIGEST}`, `${TARBALL}x`);
    expect(result.status).toBe(1);
    expect(result.installed).toBeNull();
    expect(result.stderr).toContain(`but packageManager names ${DIGEST}; refusing to install it`);
  });

  it('refuses a packageManager without its sha512, or with another digest, before fetching anything', () => {
    for (const packageManager of ['pnpm@10.34.8', `pnpm@10.34.8+sha256.${DIGEST.slice(0, 64)}`, `pnpm@10.34.8+sha512.${DIGEST.slice(1)}`, `pnpm@^10.34.8+sha512.${DIGEST}`, 'yarn@4.0.0']) {
      const result = install(packageManager);
      expect(result.status, packageManager).toBe(1);
      expect(result.packed, packageManager).toBe(false);
      expect(result.stderr, packageManager).toContain('not pnpm@x.y.z+sha512.<128 hex digits>');
    }
  });
});
