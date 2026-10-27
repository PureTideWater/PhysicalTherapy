import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { BUILDS, type BrowserRecord, type BuildName, RECORD, listFile, playwrightCore, readRecord, run, sha256, treeLines, treeSha256 } from './browser-build';

/**
 * tools/ci/browser-build.ts, the browser build check (test matrix CI-18; docs/adr/0058), on stand-in builds in a
 * temporary PLAYWRIGHT_BROWSERS_PATH, a stand-in pnpm layout with nothing hoisted, a stand-in browser.json with its
 * file lists, and, for --image, a stand-in `docker` first on PATH that runs the image's commands against a stand-in
 * image's files. No browser, no network and no Docker daemon are needed.
 */

const SCRIPT = path.join(repositoryRoot, 'tools/ci/browser-build.ts');
const REVISION = '9999';
const VERSION = '999.0.1.2';
const PROCEDURE = "A Playwright upgrade needs ADR 0058's baseline procedure: docs/runbooks/ci.md, 'Upgrading the browser'.";
const DIRS: Record<BuildName, { dir: string; binary: string }> = {
  'chromium-headless-shell': { dir: 'chrome-headless-shell-linux64', binary: 'chrome-headless-shell' },
  chromium: { dir: 'chrome-linux64', binary: 'chrome' },
};

// Made before the tests run, not when the file is collected (tools/test/collection.test.ts).
let scratch = '';
beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'tp-browser-build-'));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** The shell form of the tree SHA-256, run by the shell on a revision's folder. */
function shellTree(revisionDir: string, dir: string): string {
  return execFileSync('bash', ['-c', 'cd "$1" && find "$2" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum', 'bash', revisionDir, dir], { encoding: 'utf8' }).split(' ')[0] ?? '';
}

/** A stand-in build: a binary that answers --version, a library, resources in a subdirectory, and Playwright's markers. */
function layBuild(root: string, name: BuildName, revision = REVISION): string {
  const revisionDir = path.join(root, `${BUILDS[name].folder}-${revision}`);
  const { dir, binary } = DIRS[name];
  mkdirSync(path.join(revisionDir, dir, 'resources'), { recursive: true });
  writeFileSync(path.join(revisionDir, dir, binary), `#!/bin/sh\necho "Stand-in ${name} ${VERSION}"\n`);
  chmodSync(path.join(revisionDir, dir, binary), 0o755);
  writeFileSync(path.join(revisionDir, dir, 'libvk_swiftshader.so'), `software GL of ${name}`);
  writeFileSync(path.join(revisionDir, dir, 'resources', 'a.pak'), 'resources');
  writeFileSync(path.join(revisionDir, dir, 'icudtl.dat'), 'icu');
  writeFileSync(path.join(revisionDir, 'INSTALLATION_COMPLETE'), '');
  writeFileSync(path.join(revisionDir, 'DEPENDENCIES_VALIDATED'), '');
  return revisionDir;
}

/** browser.json for the builds as laid, with each build's list written by the shell form beside it. */
function writeRecord(recordDir: string, root: string): string {
  mkdirSync(path.join(recordDir, 'browser-builds'), { recursive: true });
  const builds = Object.fromEntries(
    (Object.keys(BUILDS) as BuildName[]).map((name) => {
      const { dir, binary } = DIRS[name];
      const revisionDir = path.join(root, `${BUILDS[name].folder}-${REVISION}`);
      const lines = execFileSync('bash', ['-c', 'cd "$1" && find "$2" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum', 'bash', revisionDir, dir], { encoding: 'utf8' });
      writeFileSync(path.join(recordDir, 'browser-builds', `${dir}.sha256`), lines);
      return [name, { dir, path: `${dir}/${binary}`, treeSha256: sha256(lines), sha256: sha256(readFileSync(path.join(revisionDir, dir, binary))), zip: `${dir}.zip`, zipSha256: 'a'.repeat(64) }];
    }),
  );
  const file = path.join(recordDir, 'browser.json');
  writeFileSync(file, `${JSON.stringify({ revision: REVISION, browserVersion: VERSION, builds }, null, 2)}\n`);
  return file;
}

/** A package as pnpm lays it out: in its store folder, exporting ./package.json, its dependencies linked beside it. */
function storePackage(modules: string, name: string, version: string, dependencies: string[], extra: Record<string, string> = {}): void {
  const folder = path.join(modules, '.pnpm', `${name.replace('/', '+')}@${version}`, 'node_modules');
  mkdirSync(path.join(folder, name), { recursive: true });
  writeFileSync(path.join(folder, name, 'package.json'), JSON.stringify({ name, version, exports: { '.': './index.js', './package.json': './package.json' } }));
  for (const [file, text] of Object.entries(extra)) writeFileSync(path.join(folder, name, file), text);
  for (const dependency of dependencies) {
    symlinkSync(path.join(modules, '.pnpm', `${dependency}@${version}`, 'node_modules', dependency), path.join(folder, dependency));
  }
}

/** A stand-in workspace: apps/web depends on @playwright/test alone; nothing is hoisted to either node_modules. */
function layWorkspace(workspace: string, revision = REVISION, version = VERSION): string {
  const modules = path.join(workspace, 'node_modules');
  const browsersJson = JSON.stringify({ browsers: [{ name: 'chromium', revision, browserVersion: version }, { name: 'chromium-headless-shell', revision, browserVersion: version }, { name: 'firefox', revision: '1', browserVersion: '1.0' }] });
  storePackage(modules, 'playwright-core', '9.9.9', [], { 'browsers.json': browsersJson });
  storePackage(modules, 'playwright', '9.9.9', ['playwright-core']);
  storePackage(modules, '@playwright/test', '9.9.9', ['playwright']);
  const web = path.join(workspace, 'apps/web');
  mkdirSync(path.join(web, 'node_modules/@playwright'), { recursive: true });
  symlinkSync(path.join(modules, '.pnpm/@playwright+test@9.9.9/node_modules/@playwright/test'), path.join(web, 'node_modules/@playwright/test'));
  writeFileSync(path.join(web, 'package.json'), JSON.stringify({ name: '@tp/web', devDependencies: { '@playwright/test': '9.9.9' } }));
  return path.join(web, 'package.json');
}

interface Case {
  readonly dir: string;
  readonly root: string;
  readonly record: string;
  readonly from: string;
}

let current: Case;
beforeEach(() => {
  const dir = mkdtempSync(path.join(scratch, 'case-'));
  const root = path.join(dir, 'ms-playwright');
  for (const name of Object.keys(BUILDS) as BuildName[]) layBuild(root, name);
  current = { dir, root, record: writeRecord(path.join(dir, 'record'), root), from: layWorkspace(path.join(dir, 'workspace')) };
});
afterEach(() => {
  rmSync(current.dir, { recursive: true, force: true });
});

function check(argv: string[] = [], env: NodeJS.ProcessEnv = {}, from = current.from) {
  const out: string[] = [];
  const err: string[] = [];
  const status = run({ argv, env: { PATH: process.env.PATH, PLAYWRIGHT_BROWSERS_PATH: current.root, ...env }, out: (line) => out.push(line), err: (line) => err.push(line), record: current.record, from });
  return { status, out, err };
}

const recorded = (): BrowserRecord => readRecord(current.record);
const shellDir = () => path.join(current.root, `chromium_headless_shell-${REVISION}`, DIRS['chromium-headless-shell'].dir);

describe('the browser build check (CI-18)', () => {
  it('passes when both builds equal the record in every file, and prints each version and hash', () => {
    const { status, out, err } = check();
    expect(err).toEqual([]);
    expect(status).toBe(0);
    expect(out).toContain(`The headless shell: Stand-in chromium-headless-shell ${VERSION}`);
    expect(out).toContain('The headless shell: equal to browser.json in every file');
    expect(out).toContain('Chromium: equal to browser.json in every file');
    const shell = recorded().builds['chromium-headless-shell'];
    expect(out.some((line) => line.includes(`tree SHA-256 ${shell.treeSha256}, binary SHA-256 ${shell.sha256}`))).toBe(true);
    // No file's line without --list when every build is equal.
    expect(out.filter((line) => line.startsWith('  '))).toEqual([]);
  });

  it('computes the tree SHA-256 exactly as the shell form does, on the same directory', () => {
    const revisionDir = path.join(current.root, `chromium_headless_shell-${REVISION}`);
    writeFileSync(path.join(shellDir(), 'resources', 'Z.pak'), 'upper case sorts first by bytes');
    writeFileSync(path.join(shellDir(), 'resources', 'a b.pak'), 'a space');
    const { lines, others } = treeLines(revisionDir, DIRS['chromium-headless-shell'].dir);
    expect(others).toEqual([]);
    expect(lines).toHaveLength(6);
    expect(treeSha256(lines)).toBe(shellTree(revisionDir, DIRS['chromium-headless-shell'].dir));
  });

  it('fails on a different binary with the message that names both builds and the procedure', () => {
    const binary = path.join(shellDir(), 'chrome-headless-shell');
    writeFileSync(binary, `#!/bin/sh\necho "Stand-in chromium-headless-shell ${VERSION}"\n# another build\n`);
    const { status, err } = check();
    expect(status).toBe(1);
    const record = recorded();
    const shell = record.builds['chromium-headless-shell'];
    const tree = shellTree(path.join(current.root, `chromium_headless_shell-${REVISION}`), shell.dir);
    expect(err).toEqual([
      `The headless shell is ${VERSION} (revision ${REVISION}, tree SHA-256 ${tree}, binary SHA-256 ${sha256(readFileSync(binary))}), and browser.json records ${VERSION} (revision ${REVISION}, tree SHA-256 ${shell.treeSha256}, binary SHA-256 ${shell.sha256}). ${PROCEDURE} 1 files differ from ${path.relative(repositoryRoot, listFile(current.record, shell))}: ${shell.dir}/chrome-headless-shell (changed).`,
    ]);
  });

  it.each([
    ['changed', (dir: string) => writeFileSync(path.join(dir, 'libvk_swiftshader.so'), 'another software GL'), 'libvk_swiftshader.so (changed)'],
    ['added', (dir: string) => writeFileSync(path.join(dir, 'resources', 'extra.pak'), 'more'), 'resources/extra.pak (added)'],
    ['removed', (dir: string) => unlinkSync(path.join(dir, 'icudtl.dat')), 'icudtl.dat (removed)'],
  ])('fails on a %s file beside an equal binary, naming its path', (_how, change, named) => {
    change(shellDir());
    const { status, err } = check();
    expect(status).toBe(1);
    expect(err).toHaveLength(1);
    const shell = recorded().builds['chromium-headless-shell'];
    expect(err[0]).toContain(`binary SHA-256 ${shell.sha256}), and browser.json records`);
    expect(err[0]).toContain(`1 files differ from`);
    expect(err[0]).toContain(`${shell.dir}/${named}`);
  });

  it('on a tree difference names every path that differs, and on any difference prints every file found, as --list does, with no --list (design 3.3.7)', () => {
    const extra = Array.from({ length: 12 }, (_, index) => `resources/extra-${String(index).padStart(2, '0')}.pak`);
    for (const name of extra) writeFileSync(path.join(shellDir(), name), name);
    const { status, out, err } = check();
    expect(status).toBe(1);
    expect(err).toHaveLength(1);
    const shell = recorded().builds['chromium-headless-shell'];
    // Every one of the twelve, not the first ten: one CI run gives everything a new record needs.
    expect(err[0]).toContain(`12 files differ from ${path.relative(repositoryRoot, listFile(current.record, shell))}: ${extra.map((name) => `${shell.dir}/${name} (added)`).join(', ')}.`);
    expect(err[0]).not.toContain('the first ten');
    // The found build's every line, in the shell form's order, so a person can commit it as browser-builds/<dir>.sha256;
    // the equal build's lines are not printed.
    const found = execFileSync('bash', ['-c', 'cd "$1" && find "$2" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum', 'bash', path.join(current.root, `chromium_headless_shell-${REVISION}`), shell.dir], { encoding: 'utf8' }).trim().split('\n');
    expect(found).toHaveLength(16);
    expect(out.filter((line) => line.startsWith('  ')).map((line) => line.trim())).toEqual(found);
    // --list prints the same lines once, not twice, beside the equal build's.
    const listed = check(['--list']).out.filter((line) => line.startsWith('  ')).map((line) => line.trim());
    expect(listed).toEqual([...found, ...readFileSync(listFile(current.record, recorded().builds.chromium), 'utf8').trim().split('\n')]);
  });

  it('does not count Playwright’s markers beside the build', () => {
    const revisionDir = path.join(current.root, `chromium_headless_shell-${REVISION}`);
    writeFileSync(path.join(revisionDir, 'INSTALLATION_COMPLETE'), 'written at another time');
    unlinkSync(path.join(revisionDir, 'DEPENDENCIES_VALIDATED'));
    expect(check().status).toBe(0);
  });

  it('fails on an entry that is not a regular file, which no tree SHA-256 covers', () => {
    symlinkSync('/etc/hostname', path.join(shellDir(), 'resources', 'link.pak'));
    const { status, err } = check();
    expect(status).toBe(1);
    expect(err).toEqual([expect.stringMatching(/^The headless shell's build holds 1 entries that are neither regular files nor directories, which no tree SHA-256 covers: chrome-headless-shell-linux64\/resources\/link\.pak\.$/)]);
    // Every one is named, not the first ten.
    const links = Array.from({ length: 11 }, (_, index) => `resources/link-${String(index).padStart(2, '0')}.pak`);
    for (const name of links) symlinkSync('/etc/hostname', path.join(shellDir(), name));
    const named = [...links, 'resources/link.pak'].map((name) => `chrome-headless-shell-linux64/${name}`).sort();
    expect(check().err).toEqual([`The headless shell's build holds 12 entries that are neither regular files nor directories, which no tree SHA-256 covers: ${named.join(', ')}.`]);
  });

  it('fails when the installed playwright-core pins another revision or version than the record, naming what it found', () => {
    for (const name of Object.keys(BUILDS) as BuildName[]) layBuild(current.root, name, '1194');
    const from = layWorkspace(path.join(current.dir, 'older'), '1194', '141.0.7390.37');
    const { status, out, err } = check([], {}, from);
    expect(status).toBe(1);
    expect(err).toHaveLength(2);
    expect(err[0]).toMatch(new RegExp(`^The headless shell is 141\\.0\\.7390\\.37 \\(revision 1194, tree SHA-256 [0-9a-f]{64}, binary SHA-256 [0-9a-f]{64}\\), and browser.json records ${VERSION.replaceAll('.', '\\.')} \\(revision ${REVISION}, `));
    expect(err[0]).not.toContain('files differ');
    expect(err[1]).toMatch(/^Chromium is 141\.0\.7390\.37 \(revision 1194, /);
    // A new build, as a Playwright upgrade brings: every file of both is printed, the record's next lists.
    expect(out.filter((line) => line.startsWith('  ')).map((line) => line.trim())).toEqual(
      (Object.keys(BUILDS) as BuildName[]).flatMap((name) => treeLines(path.join(current.root, `${BUILDS[name].folder}-1194`), DIRS[name].dir).lines),
    );
    const sameRevision = layWorkspace(path.join(current.dir, 'other-version'), REVISION, '999.0.1.3');
    expect(check([], {}, sameRevision).err[0]).toMatch(/^The headless shell is 999\.0\.1\.3 \(revision 9999, /);
  });

  it('fails when a build is missing', () => {
    rmSync(path.join(current.root, `chromium-${REVISION}`), { recursive: true });
    const { status, err } = check();
    expect(status).toBe(1);
    expect(err).toEqual([expect.stringMatching(new RegExp(`^Chromium is ${VERSION.replaceAll('.', '\\.')} \\(revision ${REVISION}, tree SHA-256 absent \\(no build under .*chromium-${REVISION}\\), binary SHA-256 absent\\), and browser\\.json records`))]);
  });

  it('fails when the record’s file list does not hash to its tree SHA-256', () => {
    const shell = recorded().builds['chromium-headless-shell'];
    writeFileSync(listFile(current.record, shell), `${readFileSync(listFile(current.record, shell), 'utf8')}${'0'.repeat(64)}  ${shell.dir}/forged\n`);
    const { status, err } = check();
    expect(status).toBe(1);
    expect(err).toEqual([expect.stringMatching(/^browser\.json's record of the headless shell is inconsistent: .*chrome-headless-shell-linux64\.sha256 hashes to [0-9a-f]{64}, not browser\.json's treeSha256 [0-9a-f]{64}\.$/)]);
  });

  it('refuses a malformed record and a usage it does not know', () => {
    writeFileSync(current.record, JSON.stringify({ revision: REVISION, browserVersion: VERSION, builds: { chromium: { dir: '../x' } } }));
    const { status, err } = check();
    expect(status).toBe(1);
    expect(err[0]).toMatch(/could not be checked: .*builds\.chromium-headless-shell is missing; builds\.chromium\.dir is not one plain directory name/);
    expect(check(['--image']).status).toBe(2);
    expect(check(['--image', '--list']).status).toBe(2);
    expect(check(['--everything']).err).toEqual(['usage: node tools/ci/browser-build.ts [--image <ref>] [--list]']);
  });

  it('prints every file’s line of each build under --list', () => {
    const { status, out } = check(['--list']);
    expect(status).toBe(0);
    expect(out.filter((line) => line.startsWith('  ')).map((line) => line.trim())).toEqual(
      (Object.keys(BUILDS) as BuildName[]).flatMap((name) => readFileSync(listFile(current.record, recorded().builds[name]), 'utf8').trim().split('\n')),
    );
  });

  it('finds playwright-core through @playwright/test → playwright → playwright-core, with nothing hoisted', () => {
    const workspace = path.join(current.dir, 'workspace');
    expect(() => execFileSync('ls', [path.join(workspace, 'node_modules/playwright-core')], { stdio: 'ignore' })).toThrow();
    expect(() => execFileSync('ls', [path.join(workspace, 'apps/web/node_modules/playwright-core')], { stdio: 'ignore' })).toThrow();
    expect(playwrightCore(current.from)).toBe(path.join(workspace, 'node_modules/.pnpm/playwright-core@9.9.9/node_modules/playwright-core'));
  });

  describe('--image, against a stand-in docker', () => {
    /** A `docker run --rm --entrypoint <cat|sh> <ref> …` that runs in a stand-in image: /app and /ms-playwright. */
    const DOCKER = `#!/usr/bin/env bash
set -eu
[ "$1 $2 $3" = "run --rm --entrypoint" ] || { echo "unexpected: $*" >&2; exit 97; }
entrypoint=$4 ref=$5; shift 5
[ "$ref" = "registry.example/tp-worker:test" ] || { echo "no such image: $ref" >&2; exit 98; }
cd "$IMAGE_ROOT/app"
case "$entrypoint" in
  cat) exec cat "$@" ;;
  sh) PLAYWRIGHT_BROWSERS_PATH="$IMAGE_ROOT/ms-playwright" exec sh "$@" ;;
esac
exit 99
`;

    function image(revision = REVISION): NodeJS.ProcessEnv {
      const imageRoot = path.join(current.dir, 'image');
      const bin = path.join(current.dir, 'bin');
      mkdirSync(path.join(imageRoot, 'app/node_modules/playwright-core'), { recursive: true });
      mkdirSync(bin, { recursive: true });
      writeFileSync(path.join(bin, 'docker'), DOCKER);
      chmodSync(path.join(bin, 'docker'), 0o755);
      writeFileSync(path.join(imageRoot, 'app/node_modules/playwright-core/browsers.json'), JSON.stringify({ browsers: [{ name: 'chromium-headless-shell', revision, browserVersion: VERSION }] }));
      return { PATH: `${bin}:${process.env.PATH ?? ''}`, IMAGE_ROOT: imageRoot };
    }

    beforeEach(() => {
      mkdirSync(path.join(current.dir, 'image', 'ms-playwright'), { recursive: true });
    });

    function copyShell(revision: string) {
      execFileSync('cp', ['-R', path.join(current.root, `chromium_headless_shell-${REVISION}`), path.join(current.dir, 'image', 'ms-playwright', `chromium_headless_shell-${revision}`)]);
    }

    it('checks the image’s headless shell inside the image, with no node_modules, and passes when it equals the record', () => {
      const env = image();
      copyShell(REVISION);
      const { status, out, err } = check(['--image', 'registry.example/tp-worker:test'], env, path.join(current.dir, 'nowhere/package.json'));
      expect(err).toEqual([]);
      expect(status).toBe(0);
      expect(out).toContain(`The headless shell: Stand-in chromium-headless-shell ${VERSION}`);
      expect(out).toContain('The headless shell: equal to browser.json in every file');
      expect(out.some((line) => line.startsWith('Chromium'))).toBe(false);
    });

    it('fails on the image’s build when a file differs, naming the image and the path', () => {
      const env = image();
      copyShell(REVISION);
      writeFileSync(path.join(current.dir, 'image/ms-playwright', `chromium_headless_shell-${REVISION}`, DIRS['chromium-headless-shell'].dir, 'icudtl.dat'), 'other ICU data');
      const { status, out, err } = check(['--image', 'registry.example/tp-worker:test'], env);
      expect(status).toBe(1);
      expect(err).toHaveLength(1);
      expect(err[0]).toContain('chrome-headless-shell-linux64/icudtl.dat (changed)');
      // Every file the image holds, as --list prints it.
      const revisionDir = path.join(current.dir, 'image/ms-playwright', `chromium_headless_shell-${REVISION}`);
      expect(out.filter((line) => line.startsWith('  ')).map((line) => line.trim())).toEqual(treeLines(revisionDir, DIRS['chromium-headless-shell'].dir).lines);
    });

    it('fails when the image pins another revision, and when its build is not there', () => {
      const env = image('1194');
      copyShell('1194');
      expect(check(['--image', 'registry.example/tp-worker:test'], env).err[0]).toMatch(/^The headless shell is .* \(revision 1194, tree SHA-256 [0-9a-f]{64}, /);
      rmSync(path.join(current.dir, 'image/ms-playwright', 'chromium_headless_shell-1194'), { recursive: true });
      expect(check(['--image', 'registry.example/tp-worker:test'], env).err[0]).toMatch(/^The headless shell is .* \(revision 1194, tree SHA-256 absent \(no build under registry\.example\/tp-worker:test: \$PLAYWRIGHT_BROWSERS_PATH\/chromium_headless_shell-1194\), binary SHA-256 absent\)/);
    });
  });
});

describe('the command line and the committed record', () => {
  it('runs under Node 24 directly, importing only Node’s own modules', () => {
    const imports = [...readFileSync(SCRIPT, 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((specifier) => !specifier?.startsWith('node:'))).toEqual([]);
    const result = spawnSync(process.execPath, [SCRIPT, '--nonsense'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toBe('usage: node tools/ci/browser-build.ts [--image <ref>] [--list]\n');
  });

  it('records each build whole: its file list hashes to its tree SHA-256 and lists its binary at its SHA-256', () => {
    const record = readRecord(RECORD);
    expect(record.revision).toMatch(/^\d+$/);
    for (const name of Object.keys(BUILDS) as BuildName[]) {
      const build = record.builds[name];
      const text = readFileSync(listFile(RECORD, build), 'utf8');
      expect(sha256(text), name).toBe(build.treeSha256);
      const lines = text.trim().split('\n');
      expect(lines.every((line) => line.slice(66).startsWith(`${build.dir}/`)), name).toBe(true);
      expect([...lines].sort((left, right) => Buffer.compare(Buffer.from(left.slice(66)), Buffer.from(right.slice(66)))), name).toEqual(lines);
      expect(lines, name).toContain(`${build.sha256}  ${build.path}`);
    }
  });
});
