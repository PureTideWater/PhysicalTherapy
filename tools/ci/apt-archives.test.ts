import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * tools/ci/apt-archives.sh, the browser jobs' cached system packages (docs/adr/0066, Part 3; V3), run as a job runs it
 * with stand-in `sudo`, `apt-get` and `apt-cache` first on PATH and apt's directories under a temporary root
 * (APT_ARCHIVES_ROOT): a file reaches apt's archive directory only when its SHA-256 is the index's for its exact version.
 */

const SCRIPT = path.join(repositoryRoot, 'tools/ci/apt-archives.sh');

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-apt-archives-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Index stanzas as `apt-cache show` prints them, keyed by the spec the script asks for. */
type Index = Record<string, string>;

/**
 * A runner: a bin directory with the stand-ins, apt's root, the restored directory and the index. The stand-in
 * `apt-cache show <spec>` answers as apt-cache does: the stanza filed under <spec>; no record and exit 0 for a version
 * no index lists of a package it knows; "E: No packages found" and exit 100 for a package it does not know.
 * `apt-get update` succeeds unless APT_UPDATE_FAILS is set; `sudo` runs its command and logs it.
 */
function runner(index: Index, options: { updateFails?: boolean } = {}) {
  const dir = mkdtempSync(path.join(scratch, 'runner-'));
  const bin = path.join(dir, 'bin');
  const root = path.join(dir, 'root');
  const restored = path.join(dir, 'restored');
  const stanzas = path.join(dir, 'index');
  mkdirSync(bin);
  mkdirSync(root);
  mkdirSync(stanzas);
  mkdirSync(path.join(stanzas, 'packages'));
  for (const [spec, stanza] of Object.entries(index)) {
    writeFileSync(path.join(stanzas, encodeURIComponent(spec)), stanza);
    writeFileSync(path.join(stanzas, 'packages', encodeURIComponent(spec.replace(/[:=].*$/, ''))), '');
  }
  const stub = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}`);
    chmodSync(path.join(bin, name), 0o755);
  };
  stub('sudo', `printf '%s\\n' "$*" >> '${dir}/sudo.log'\nexec "$@"\n`);
  stub('apt-get', `printf '%s\\n' "$*" >> '${dir}/apt-get.log'\nif [ "$1" = update ] && [ -n "\${APT_UPDATE_FAILS:-}" ]; then echo "E: Failed to fetch InRelease" >&2; exit 100; fi\nexit 0\n`);
  stub(
    'apt-cache',
    `[ "$1" = show ] || exit 99\nencode() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }\npackage="\${2%%=*}"\npackage="\${package%%:*}"\nif [ -f "${stanzas}/$(encode "$2")" ]; then cat "${stanzas}/$(encode "$2")"; elif [ -f "${stanzas}/packages/$(encode "$package")" ]; then exit 0; else echo "E: No packages found" >&2; exit 100; fi\n`,
  );
  const env = { PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`, APT_ARCHIVES_ROOT: root, ...(options.updateFails === true ? { APT_UPDATE_FAILS: '1' } : {}) };
  const run = (command: string, target: string = restored) => {
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', SCRIPT, command, target], { env, encoding: 'utf8', timeout: 60_000 });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  const archives = path.join(root, 'var/cache/apt/archives');
  const listing = (where: string) => (existsSync(where) ? readdirSync(where).sort() : []);
  return { dir, root, restored, archives, run, listing };
}

/** A .deb's stand-in content and the index stanza that lists it with its SHA-256. */
const deb = (content: string, fields: Record<string, string> = {}) => ({ content, stanza: `${Object.entries({ Package: 'x', ...fields, SHA256: sha(content) }).map(([key, value]) => `${key}: ${value}`).join('\n')}\n\n` });

describe('apt-archives.sh verify', () => {
  it('copies a file whose SHA-256 is the signed index’s for its exact version, reading an epoch’s %3a, and deletes and counts every other', () => {
    const fonts = deb('fonts-liberation 1:2.1.5-3');
    const nss = deb('libnss3 2:3.110-1ubuntu1');
    const gbm = deb('libgbm1 25.0.7-2');
    const index: Index = {
      // An Architecture: all package is asked for by version alone; an epoch's colon is %3a in apt's file name.
      'fonts-liberation=1:2.1.5-3': fonts.stanza,
      'libnss3:amd64=2:3.110-1ubuntu1': nss.stanza,
      // The index lists another file for this version than the one restored: a tampered or replaced file.
      'libgbm1:amd64=25.0.7-2': deb('libgbm1 25.0.7-2, as the archive built it').stanza,
      'libasound2t64:amd64=1.2.14-1': deb('libasound2t64 1.2.14-1').stanza,
    };
    const apt = runner(index);
    mkdirSync(apt.restored);
    writeFileSync(path.join(apt.restored, 'fonts-liberation_1%3a2.1.5-3_all.deb'), fonts.content);
    writeFileSync(path.join(apt.restored, 'libnss3_2%3a3.110-1ubuntu1_amd64.deb'), nss.content);
    writeFileSync(path.join(apt.restored, 'libgbm1_25.0.7-2_amd64.deb'), gbm.content);
    // Truncated: the right name, a different SHA-256.
    writeFileSync(path.join(apt.restored, 'libasound2t64_1.2.14-1_amd64.deb'), 'libasound2t64 1.2');
    // A version the index no longer lists of a package it lists (a security update replaced it): apt-cache prints no
    // record and exits 0.
    writeFileSync(path.join(apt.restored, 'libnss3_2%3a3.98-1build1_amd64.deb'), 'libnss3 2:3.98-1build1');
    // A package the index does not know at all: apt-cache exits 100.
    writeFileSync(path.join(apt.restored, 'libcups2t64_2.4.11-1_amd64.deb'), 'libcups2t64 2.4.11-1');
    // Not apt's file name at all.
    writeFileSync(path.join(apt.restored, 'payload.deb'), 'anything');
    const result = apt.run('verify');
    expect(result.status, result.output).toBe(0);
    expect(apt.listing(apt.archives)).toEqual(['fonts-liberation_1%3a2.1.5-3_all.deb', 'libnss3_2%3a3.110-1ubuntu1_amd64.deb']);
    expect(readFileSync(path.join(apt.archives, 'libnss3_2%3a3.110-1ubuntu1_amd64.deb'), 'utf8')).toBe(nss.content);
    // What was discarded is gone from the restored directory too, so the next save never carries it.
    expect(apt.listing(apt.restored)).toEqual(['fonts-liberation_1%3a2.1.5-3_all.deb', 'libnss3_2%3a3.110-1ubuntu1_amd64.deb']);
    expect(result.output).toContain('apt archives: 2 kept (each the signed index\'s SHA-256 for its version), 5 discarded');
    expect(result.output).toContain(`discarded libgbm1_25.0.7-2_amd64.deb: its SHA-256 ${sha(gbm.content)} is not the index's for libgbm1:amd64=25.0.7-2`);
    expect(result.output).toContain(`discarded libasound2t64_1.2.14-1_amd64.deb: its SHA-256 ${sha('libasound2t64 1.2')} is not the index's for libasound2t64:amd64=1.2.14-1`);
    expect(result.output).toContain('discarded libnss3_2%3a3.98-1build1_amd64.deb: the index lists no libnss3:amd64=2:3.98-1build1');
    expect(result.output).toContain('discarded libcups2t64_2.4.11-1_amd64.deb: the index lists no libcups2t64:amd64=2.4.11-1');
    expect(result.output).toContain("discarded payload.deb: its name is not apt's name_version_arch.deb");
    // The index was fetched fresh before any file was judged, and apt keeps what apt-get downloads from here on.
    expect(readFileSync(path.join(apt.dir, 'apt-get.log'), 'utf8')).toBe('update\n');
    expect(readFileSync(path.join(apt.root, 'etc/apt/apt.conf.d/90paidwhole-keep-archives'), 'utf8')).toBe('APT::Keep-Downloaded-Packages "true";\n');
    const sudo = readFileSync(path.join(apt.dir, 'sudo.log'), 'utf8').split('\n');
    expect(sudo[0]).toBe('apt-get update');
  });

  it('passes with nothing restored (a cold key), and fails when apt itself fails', () => {
    const cold = runner({});
    const result = cold.run('verify');
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('apt archives: 0 kept (each the signed index\'s SHA-256 for its version), 0 discarded');
    const broken = runner({}, { updateFails: true });
    mkdirSync(broken.restored);
    writeFileSync(path.join(broken.restored, 'libgbm1_25.0.7-2_amd64.deb'), 'libgbm1');
    const failed = broken.run('verify');
    expect(failed.status).toBe(100);
    expect(failed.output).toContain('E: Failed to fetch InRelease');
    // Nothing reached apt from an index it could not fetch.
    expect(broken.listing(broken.archives)).toEqual([]);
  });

  it('refuses a missing or unknown command', () => {
    const apt = runner({});
    expect(apt.run('restore').status).toBe(2);
    const none = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });
    expect([none.status, none.stderr]).toEqual([2, 'usage: tools/ci/apt-archives.sh verify|collect <dir>\n']);
  });
});

describe('apt-archives.sh collect', () => {
  it('copies apt’s archive directory’s .deb files into the directory the cache saves, owned by the runner’s user', () => {
    const apt = runner({});
    mkdirSync(path.join(apt.archives, 'partial'), { recursive: true });
    writeFileSync(path.join(apt.archives, 'libgbm1_25.0.7-2_amd64.deb'), 'libgbm1');
    writeFileSync(path.join(apt.archives, 'lock'), '');
    const result = apt.run('collect');
    expect(result.status, result.output).toBe(0);
    expect(apt.listing(apt.restored)).toEqual(['libgbm1_25.0.7-2_amd64.deb']);
    expect(statSync(path.join(apt.restored, 'libgbm1_25.0.7-2_amd64.deb')).uid).toBe(os.userInfo().uid);
    expect(result.output).toContain(`apt archives: 1 collected into ${apt.restored}`);
    expect(result.output).not.toContain('::warning');
  });

  it('warns when there is nothing to collect, and still passes', () => {
    const apt = runner({});
    const result = apt.run('collect');
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("::warning title=apt archives::apt's archive directory holds no .deb");
    expect(result.output).toContain('apt archives: 0 collected');
  });
});
