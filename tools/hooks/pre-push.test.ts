import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { render835 } from '../../packages/synth/src/cases/builder';
import { minimalFile } from '../../packages/synth/src/cases/par';
import { repositoryRoot } from '../content-files';
import { GITLEAKS_INSTALL, PrePushError, advertisedObjects, atLeast, findGitleaks, parsePushUpdates, parseVersion, pinnedGitleaks, plainPatchEnvironment, prePush, revisionsToCheck, scannedCount } from '../pre-push/pre-push';

/**
 * The committed pre-push hook (`.githooks/pre-push`; docs/adr/0063, audit item #20 (e)), run as git runs it: a real
 * `git push` from a scratch clone to a scratch bare repository, with `core.hooksPath` naming this checkout's
 * `.githooks`, and through the launcher `pnpm hooks:install` puts in a clone's own hooks directory. The fixture check and the hook's plumbing run with a stand-in gitleaks that records how it was called;
 * the secret scan runs with the real gitleaks when one is found (GITLEAKS, or `gitleaks` on PATH), and those cases
 * say they are skipped otherwise. Everything lives in the system's temporary directory and holds synthetic text only:
 * the refused interchange is the synthetic one with another sender (SEC-14), and the refused secret is a token shape
 * made at run time, so no secret is written in this file.
 */
const HOOKS = path.join(repositoryRoot, '.githooks');
const ZERO = '0'.repeat(40);
const SYNTHETIC = render835(minimalFile()).text;
const OTHER_SENDER = SYNTHETIC.replace('SYNTHSENDER    ', 'OTHERSENDER    ');
const PUSH_TIMEOUT = 120_000;

const scratchDirs: string[] = [];
afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratch(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `tp-pre-push-${prefix}-`));
  scratchDirs.push(dir);
  return dir;
}

/** The real gitleaks, when this machine has one (GITLEAKS, the pinned one tools/gitleaks/install.sh installed, or PATH). */
const REAL_GITLEAKS = ((): string | null => {
  try {
    return findGitleaks(process.env, repositoryRoot);
  } catch {
    return null;
  }
})();
const SKIP_REASON = REAL_GITLEAKS === null ? ' (skipped: no gitleaks binary here; set GITLEAKS or put gitleaks on PATH)' : '';

/**
 * A gitleaks stand-in: says it is `version`, records every call's arguments, one per line, says it scanned `scanned`
 * commits (as gitleaks does at log level info), then exits `status`.
 */
function stubGitleaks(version = '8.24.3', status = 0, scanned = 1000): { readonly binary: string; readonly calls: () => string[][] } {
  const dir = scratch('stub');
  const log = path.join(dir, 'calls');
  const binary = path.join(dir, 'gitleaks');
  writeFileSync(log, '');
  writeFileSync(
    binary,
    `#!/bin/bash\nif [ "$1" = version ]; then echo "${version}"; exit 0; fi\nprintf '%s\\n' "$@" >> '${log}'\nprintf '%s\\n' '--' >> '${log}'\necho "INF ${String(scanned)} commits scanned." >&2\nexit ${String(status)}\n`,
  );
  chmodSync(binary, 0o755);
  return {
    binary,
    calls: () =>
      readFileSync(log, 'utf8')
        .split('--\n')
        .filter((call) => call !== '')
        .map((call) => call.split('\n').filter((line) => line !== '')),
  };
}

/** A PATH holding only the named commands (links to the real ones): the hook's needs, without gitleaks. */
function pathWith(commands: readonly string[]): string {
  const bin = scratch('bin');
  for (const command of commands) {
    const found = spawnSync('/bin/bash', ['-c', `command -v ${command}`], { encoding: 'utf8' }).stdout.trim();
    expect(found, command).not.toBe('');
    symlinkSync(found, path.join(bin, command));
  }
  return bin;
}

/** What the hook and pnpm's tsx launcher run, gitleaks aside. */
const HOOK_COMMANDS = ['bash', 'sh', 'node', 'git', 'readlink', 'dirname', 'sed', 'uname'];

const GLOBAL_CONFIG = (() => {
  const file = path.join(scratch('config'), 'gitconfig');
  writeFileSync(file, '[user]\n\tname = Synthetic Builder\n\temail = builder@synthetic.test\n[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n');
  return file;
})();

/** An empty cache, so no test finds a pinned gitleaks this machine installed unless it names one. */
const EMPTY_CACHE = scratch('cache');

/** The environment a push runs with: no system or personal git configuration, and the gitleaks given (or none). */
function environment(gitleaks: string | null, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: GLOBAL_CONFIG, GIT_CONFIG_NOSYSTEM: '1', XDG_CACHE_HOME: EMPTY_CACHE, ...extra };
  delete env.GITLEAKS;
  if (gitleaks !== null) {
    env.GITLEAKS = gitleaks;
  }
  return env;
}

interface World {
  readonly remote: string;
  readonly work: string;
}

/** A bare repository as `origin` and a clone of it whose hooks are this checkout's. */
function world(): World {
  const dir = scratch('world');
  const remote = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  execFileSync('git', ['init', '-q', '--bare', remote], { env: environment(null) });
  execFileSync('git', ['init', '-q', work], { env: environment(null) });
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'config', 'core.hooksPath', HOOKS);
  return { remote, work };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: environment(null), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(cwd: string, files: Readonly<Record<string, string>>, message: string): string {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), content);
    git(cwd, 'add', file);
  }
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

interface Pushed {
  readonly status: number | null;
  readonly stderr: string;
}

function push(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): Pushed {
  return pushTo(cwd, env, 'origin', ...args);
}

/** A push to the named remote, or to a URL. */
function pushTo(cwd: string, env: NodeJS.ProcessEnv, remote: string, ...args: string[]): Pushed {
  const result = spawnSync('git', ['push', '-q', remote, ...args], { cwd, env, encoding: 'utf8', timeout: PUSH_TIMEOUT });
  return { status: result.status, stderr: result.stderr };
}

/** A git configuration file holding `text` beside the scratch identity, for a push run under a user's own settings. */
function globalConfig(text: string): string {
  const file = path.join(scratch('config'), 'gitconfig');
  writeFileSync(file, `${readFileSync(GLOBAL_CONFIG, 'utf8')}${text}`);
  return file;
}

/** The commit the bare repository's ref names, or null. */
function remoteRef(world: World, ref: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--verify', '-q', ref], { cwd: world.remote, env: environment(null), encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** A GitHub personal-access-token shape, made at run time: gitleaks' github-pat rule refuses it. */
function syntheticToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return ['gh', 'p_'].join('') + [...randomBytes(36)].map((byte) => alphabet[byte % alphabet.length] ?? 'A').join('');
}

describe('the pre-push hook, step by step', () => {
  it('reads the lines git hands it, and refuses one it cannot read', () => {
    const sha = 'a'.repeat(40);
    expect(parsePushUpdates(`refs/heads/x ${sha} refs/heads/x ${ZERO}\n\n`)).toEqual([{ localRef: 'refs/heads/x', localObject: sha, remoteRef: 'refs/heads/x', remoteObject: ZERO }]);
    expect(parsePushUpdates('')).toEqual([]);
    for (const line of [`refs/heads/x ${sha} refs/heads/x`, `refs/heads/x HEAD refs/heads/x ${ZERO}`, `refs/heads/x ${sha} refs/heads/x ${ZERO} extra`]) {
      expect(() => parsePushUpdates(line), line).toThrow(PrePushError);
    }
  });

  it('checks what the push sends and the remote lacks: new refs, updates, bare commits; never a deletion', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(40)) as [string, string, string, string];
    const context = { known: ['--remotes=origin'], has: (object: string) => object === b };
    const update = (localObject: string, remoteObject: string) => ({ localRef: 'refs/heads/x', localObject, remoteRef: 'refs/heads/x', remoteObject });
    expect(revisionsToCheck([update(a, ZERO)], context)).toEqual([a, '--not', '--remotes=origin']);
    expect(revisionsToCheck([update(a, b), update(c, b)], context)).toEqual([a, c, '--not', '--remotes=origin', b]);
    // A replaced commit this repository never fetched cannot be named; the remote's known refs still are.
    expect(revisionsToCheck([update(a, c)], context)).toEqual([a, '--not', '--remotes=origin']);
    expect(revisionsToCheck([update(ZERO, b)], context)).toBeNull();
    expect(revisionsToCheck([], context)).toBeNull();
    // A remote with no remote-tracking refs, or a URL: the commits ls-remote named, each once.
    expect(revisionsToCheck([update(a, b)], { known: [b, d], has: () => true })).toEqual([a, '--not', b, d]);
    // A remote that holds nothing yet: everything the sent commits reach is checked.
    expect(revisionsToCheck([update(a, ZERO)], { known: [], has: () => false })).toEqual([a, '--not']);
  });

  it('reads what ls-remote advertises, a tag and its peeled commit alike', () => {
    const [a, b] = ['a', 'b'].map((letter) => letter.repeat(40)) as [string, string];
    expect(advertisedObjects(`${a}\tHEAD\n${a}\trefs/heads/main\n${b}\trefs/tags/v1\n${a}\trefs/tags/v1^{}\n\nwarning: x\n`)).toEqual([a, b]);
    expect(advertisedObjects('')).toEqual([]);
  });

  it('reads how many commits gitleaks scanned, and keeps git from coloring or rewriting the patch it reads', () => {
    expect(scannedCount('\u001b[90m6:48PM\u001b[0m \u001b[32mINF\u001b[0m \u001b[1m3 commits scanned.\u001b[0m\n')).toBe(3);
    expect(scannedCount('INF 1 commits scanned.')).toBe(1);
    expect(scannedCount('INF no leaks found')).toBeNull();
    const env = plainPatchEnvironment({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' });
    expect(env.GIT_CONFIG_KEY_0).toBe('safe.directory');
    expect(env.GIT_CONFIG_KEY_1).toBe('color.ui');
    expect(env.GIT_CONFIG_VALUE_1).toBe('never');
    expect(Number(env.GIT_CONFIG_COUNT)).toBeGreaterThan(2);
    expect(plainPatchEnvironment({}).GIT_CONFIG_KEY_0).toBe('color.ui');
  });

  it('reads tool versions and compares them', () => {
    expect(parseVersion('git version 2.43.0')).toEqual([2, 43, 0]);
    expect(parseVersion('v8.24.3')).toEqual([8, 24, 3]);
    expect(parseVersion('unknown')).toBeNull();
    expect(atLeast([8, 24, 3], [8, 19, 0])).toBe(true);
    expect(atLeast([8, 19, 0], [8, 19, 0])).toBe(true);
    expect(atLeast([8, 18, 9], [8, 19, 0])).toBe(false);
    expect(atLeast([2, 35, 9], [2, 36, 0])).toBe(false);
  });

  it('finds gitleaks through GITLEAKS, the pinned install, or PATH, and says how to install it when there is none', () => {
    const stub = stubGitleaks();
    expect(findGitleaks({ GITLEAKS: stub.binary, PATH: '' })).toBe(stub.binary);
    // The pinned one tools/gitleaks/install.sh keeps in the cache comes before PATH, so a push runs what CI runs.
    const cache = scratch('pinned');
    const pinned = pinnedGitleaks(repositoryRoot, { XDG_CACHE_HOME: cache });
    const version = /^version (\S+)$/m.exec(readFileSync(path.join(repositoryRoot, 'tools/gitleaks/release.txt'), 'utf8'))?.[1];
    expect(pinned).toBe(path.join(cache, 'paidwhole', 'gitleaks', version ?? '?', 'gitleaks'));
    expect(pinnedGitleaks(repositoryRoot, { HOME: '/home/someone' })).toBe(path.join('/home/someone/.cache/paidwhole/gitleaks', version ?? '?', 'gitleaks'));
    expect(pinnedGitleaks(repositoryRoot, {})).toBeNull();
    expect(findGitleaks({ XDG_CACHE_HOME: cache, PATH: path.dirname(stub.binary) }, repositoryRoot)).toBe(stub.binary);
    mkdirSync(path.dirname(pinned ?? ''), { recursive: true });
    copyFileSync(stub.binary, pinned ?? '');
    chmodSync(pinned ?? '', 0o755);
    expect(findGitleaks({ XDG_CACHE_HOME: cache, PATH: path.dirname(stub.binary) }, repositoryRoot)).toBe(pinned);
    expect(findGitleaks({ PATH: `/nonexistent${path.delimiter}${path.dirname(stub.binary)}` })).toBe(stub.binary);
    expect(() => findGitleaks({ PATH: '/nonexistent' })).toThrow(GITLEAKS_INSTALL);
    expect(() => findGitleaks({ GITLEAKS: '/nonexistent/gitleaks' })).toThrow('GITLEAKS is set but does not name an executable file');
    expect(() => findGitleaks({ GITLEAKS: 'gitleaks' })).toThrow('by its absolute path');
    expect(GITLEAKS_INSTALL).toContain('set GITLEAKS to the path of a gitleaks binary');
  });
});

describe('the pre-push hook, run by git push', () => {
  it(
    'allows a clean push of a new branch and says what it checked',
    () => {
      const w = world();
      const head = commit(w.work, { 'README.md': '# scratch\n', 'fixtures/synthetic/LED-99/table.csv': 'Paid Amount,Payee ID\r\n30.00,SYNTHSENDER\r\n' }, 'clean');
      const pushed = push(w.work, environment(REAL_GITLEAKS ?? stubGitleaks().binary), 'HEAD:refs/heads/main');
      expect(pushed.status, pushed.stderr).toBe(0);
      expect(pushed.stderr).toContain('pre-push: 1 commit checked: 1 file(s) read by the fixture guard, and gitleaks found no secret.');
      expect(remoteRef(w, 'refs/heads/main')).toBe(head);
    },
    PUSH_TIMEOUT,
  );

  it(
    'refuses an interchange from a sender other than SYNTHSENDER, whatever its name, and sends nothing',
    () => {
      const w = world();
      commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      const refused = commit(w.work, { 'notes/remit.dat': OTHER_SENDER }, 'foreign interchange');
      const pushed = push(w.work, environment(stubGitleaks().binary), 'HEAD:refs/heads/main');
      expect(pushed.status).not.toBe(0);
      expect(pushed.stderr).toContain(`pre-push: fixture check: notes/remit.dat: ISA06 is not SYNTHSENDER (in commit ${refused.slice(0, 12)})`);
      expect(pushed.stderr).toContain('pre-push: this push is refused (2 commits checked).');
      expect(pushed.stderr).not.toContain('OTHERSENDER');
      expect(remoteRef(w, 'refs/heads/main')).toBeNull();
    },
    PUSH_TIMEOUT,
  );

  it(
    'hands gitleaks the repository’s configuration and exactly the commits the remote lacks',
    () => {
      const w = world();
      const first = commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      expect(push(w.work, environment(stubGitleaks().binary), 'HEAD:refs/heads/main').status).toBe(0);
      git(w.work, 'fetch', '-q', 'origin');
      const second = commit(w.work, { 'notes.txt': 'more\n' }, 'more');
      const stub = stubGitleaks();
      const pushed = push(w.work, environment(stub.binary), 'HEAD:refs/heads/main');
      expect(pushed.status, pushed.stderr).toBe(0);
      expect(pushed.stderr).toContain('pre-push: 1 commit checked');
      const [call] = stub.calls();
      expect(call?.slice(0, 2)).toEqual(['git', '--no-banner']);
      const option = (name: string) => call?.[(call.indexOf(name) ?? -2) + 1];
      expect(option('--config')).toBe(path.join(repositoryRoot, '.gitleaks.toml'));
      expect(option('--gitleaks-ignore-path')).toBe(path.join(repositoryRoot, '.gitleaksignore'));
      expect(option('--log-opts')).toBe(`--no-color --no-ext-diff --no-textconv --diff-merges=remerge ${second} --not --remotes=origin ${first}`);
      expect(option('--log-level')).toBe('info');
      expect(call).toContain('--redact');
      expect(call?.at(-1)).toBe(w.work);
    },
    PUSH_TIMEOUT,
  );

  it.skipIf(REAL_GITLEAKS === null)(
    `refuses a secret in a pushed commit, naming the file, the commit and the rule, never the secret${SKIP_REASON}`,
    () => {
      const w = world();
      const token = syntheticToken();
      const leaked = commit(w.work, { 'src/settings.ts': `export const token = '${token}';\n` }, 'a leak');
      const pushed = push(w.work, environment(REAL_GITLEAKS), 'HEAD:refs/heads/main');
      expect(pushed.status).not.toBe(0);
      expect(pushed.stderr).toContain(`pre-push: secret scan: src/settings.ts:1 in commit ${leaked.slice(0, 12)}: gitleaks rule github-pat`);
      expect(pushed.stderr).not.toContain(token);
      expect(remoteRef(w, 'refs/heads/main')).toBeNull();
    },
    PUSH_TIMEOUT,
  );

  it.skipIf(REAL_GITLEAKS === null)(
    `scans only what the remote lacks, and reads what a merge itself writes${SKIP_REASON}`,
    () => {
      const w = world();
      // A secret already on the remote (pushed past the hook) does not stop a clean commit on top of it.
      commit(w.work, { 'old.ts': `export const old = '${syntheticToken()}';\n` }, 'old leak');
      expect(push(w.work, environment(REAL_GITLEAKS), '--no-verify', 'HEAD:refs/heads/main').status).toBe(0);
      git(w.work, 'fetch', '-q', 'origin');
      const clean = commit(w.work, { 'README.md': '# scratch\n' }, 'clean');
      const pushed = push(w.work, environment(REAL_GITLEAKS), 'HEAD:refs/heads/main');
      expect(pushed.status, pushed.stderr).toBe(0);
      expect(pushed.stderr).toContain('pre-push: 1 commit checked');
      // A merge whose resolution adds a secret neither parent holds is refused, by the merge commit.
      git(w.work, 'checkout', '-q', '-b', 'side', clean);
      commit(w.work, { 'side.txt': 'side\n' }, 'side');
      git(w.work, 'checkout', '-q', 'main');
      commit(w.work, { 'main.txt': 'main\n' }, 'main');
      git(w.work, 'merge', '-q', '--no-ff', '--no-commit', 'side');
      writeFileSync(path.join(w.work, 'evil.ts'), `export const evil = '${syntheticToken()}';\n`);
      git(w.work, 'add', 'evil.ts');
      git(w.work, 'commit', '-q', '-m', 'merge');
      const merge = git(w.work, 'rev-parse', 'HEAD');
      const refused = push(w.work, environment(REAL_GITLEAKS), 'HEAD:refs/heads/main');
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain(`pre-push: secret scan: evil.ts:1 in commit ${merge.slice(0, 12)}: gitleaks rule github-pat`);
      expect(refused.stderr).toContain('(3 commits checked)');
      expect(refused.stderr).not.toContain('old.ts');
      expect(remoteRef(w, 'refs/heads/main')).toBe(clean);
    },
    PUSH_TIMEOUT,
  );

  it(
    'checks a bare commit pushed to a salvage branch (git commit-tree), refused or allowed by what it holds',
    () => {
      const w = world();
      const head = commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      expect(push(w.work, environment(stubGitleaks().binary), 'HEAD:refs/heads/main').status).toBe(0);
      git(w.work, 'fetch', '-q', 'origin');
      const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: w.work, input: OTHER_SENDER, encoding: 'utf8' }).trim();
      const tree = execFileSync('git', ['mktree'], { cwd: w.work, input: `100644 blob ${blob}\tsalvaged.835\n`, encoding: 'utf8' }).trim();
      const salvage = git(w.work, 'commit-tree', tree, '-p', head, '-m', 'salvage');
      const refused = push(w.work, environment(stubGitleaks().binary), `${salvage}:refs/heads/salvage/x`);
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain(`pre-push: fixture check: salvaged.835: ISA06 is not SYNTHSENDER (in commit ${salvage.slice(0, 12)})`);
      expect(remoteRef(w, 'refs/heads/salvage/x')).toBeNull();
      const cleanTree = execFileSync('git', ['mktree'], { cwd: w.work, input: `100644 blob ${git(w.work, 'rev-parse', 'HEAD:README.md')}\tREADME.md\n`, encoding: 'utf8' }).trim();
      const cleanSalvage = git(w.work, 'commit-tree', cleanTree, '-p', head, '-m', 'clean salvage');
      const allowed = push(w.work, environment(REAL_GITLEAKS ?? stubGitleaks().binary), `${cleanSalvage}:refs/heads/salvage/y`);
      expect(allowed.status, allowed.stderr).toBe(0);
      expect(allowed.stderr).toContain('pre-push: 1 commit checked');
      expect(remoteRef(w, 'refs/heads/salvage/y')).toBe(cleanSalvage);
    },
    PUSH_TIMEOUT,
  );

  it(
    'runs, through the launcher pnpm hooks:install puts in the clone, the hook of each working tree, and refuses a branch that predates it',
    () => {
      const w = world();
      git(w.work, 'config', '--unset', 'core.hooksPath');
      // `.githooks` in a working tree is this checkout's directory, as a branch that has the hook holds it.
      symlinkSync(HOOKS, path.join(w.work, '.githooks'));
      writeFileSync(path.join(w.work, '.git', 'info', 'exclude'), '.githooks\n');
      const installed = spawnSync('bash', [path.join(repositoryRoot, 'tools/pre-push/install.sh')], { cwd: w.work, env: environment(null), encoding: 'utf8' });
      expect(installed.status, installed.stderr).toBe(0);
      expect(readFileSync(path.join(w.work, '.git/hooks/pre-push'), 'utf8')).toBe(readFileSync(path.join(repositoryRoot, 'tools/pre-push/launcher.sh'), 'utf8'));
      commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      const first = push(w.work, environment(stubGitleaks().binary), 'HEAD:refs/heads/main');
      expect(first.status, first.stderr).toBe(0);
      expect(first.stderr).toContain('pre-push: 1 commit checked');
      // A linked worktree whose branch has the hook: checked like the clone itself.
      const linked = path.join(path.dirname(w.work), 'linked');
      git(w.work, 'worktree', 'add', '-q', '-b', 'linked', linked);
      symlinkSync(HOOKS, path.join(linked, '.githooks'));
      const refusedCommit = commit(linked, { 'linked/remit.835': OTHER_SENDER }, 'foreign interchange');
      const refused = push(linked, environment(stubGitleaks().binary), 'HEAD:refs/heads/linked');
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain(`linked/remit.835: ISA06 is not SYNTHSENDER (in commit ${refusedCommit.slice(0, 12)})`);
      git(linked, 'reset', '-q', '--hard', 'HEAD~1');
      const clean = commit(linked, { 'linked.txt': 'linked\n' }, 'clean');
      const allowed = push(linked, environment(REAL_GITLEAKS ?? stubGitleaks().binary), 'HEAD:refs/heads/linked');
      expect(allowed.status, allowed.stderr).toBe(0);
      expect(remoteRef(w, 'refs/heads/linked')).toBe(clean);
      // A linked worktree on a branch cut before the hook has no .githooks: its push is refused, not let through unchecked.
      const old = path.join(path.dirname(w.work), 'old');
      git(w.work, 'worktree', 'add', '-q', '-b', 'old', old);
      commit(old, { 'old/remit.835': OTHER_SENDER }, 'foreign interchange on an old branch');
      const predates = push(old, environment(stubGitleaks().binary), 'HEAD:refs/heads/old');
      expect(predates.status).not.toBe(0);
      expect(predates.stderr).toContain(`pre-push: ${old} has no .githooks/pre-push: this branch predates the pre-push hook, so this push is refused.`);
      expect(remoteRef(w, 'refs/heads/old')).toBeNull();
    },
    PUSH_TIMEOUT,
  );

  it(
    'refuses a push whose commits gitleaks did not read, when it says it read fewer than the commits that add a line',
    () => {
      const w = world();
      commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      commit(w.work, { 'notes.txt': 'more\n' }, 'more');
      git(w.work, 'commit', '-q', '--allow-empty', '-m', 'empty');
      // Two commits add a line; the empty one has no patch, and gitleaks need not count it.
      expect(push(w.work, environment(stubGitleaks('8.24.3', 0, 2).binary), 'HEAD:refs/heads/main').status).toBe(0);
      commit(w.work, { 'later.txt': 'later\n' }, 'later');
      const unread = push(w.work, environment(stubGitleaks('8.24.3', 0, 0).binary), 'HEAD:refs/heads/main');
      expect(unread.status).not.toBe(0);
      expect(unread.stderr).toContain('pre-push: gitleaks read 0 of the 1 commit that add a line, so this push is refused');
    },
    PUSH_TIMEOUT,
  );

  it.skipIf(REAL_GITLEAKS === null)(
    `still finds a secret when the user's git colors, rewrites or converts the patch gitleaks reads${SKIP_REASON}`,
    () => {
      const settings: readonly (readonly [string, NodeJS.ProcessEnv, readonly string[]])[] = [
        ['color.ui = always in the global configuration', { GIT_CONFIG_GLOBAL: globalConfig('[color]\n\tui = always\n') }, []],
        ['color.diff = always on the command line', {}, ['-c', 'color.diff=always']],
        ['diff.noprefix in the global configuration', { GIT_CONFIG_GLOBAL: globalConfig('[diff]\n\tnoprefix = true\n') }, []],
      ];
      for (const [label, extra, options] of settings) {
        const w = world();
        const token = syntheticToken();
        const leaked = commit(w.work, { 'src/settings.ts': `export const token = '${token}';\n` }, 'a leak');
        const result = spawnSync('git', [...options, 'push', '-q', 'origin', 'HEAD:refs/heads/main'], { cwd: w.work, env: environment(REAL_GITLEAKS, extra), encoding: 'utf8', timeout: PUSH_TIMEOUT });
        expect(result.status, label).not.toBe(0);
        expect(result.stderr, label).toContain(`pre-push: secret scan: src/settings.ts:1 in commit ${leaked.slice(0, 12)}: gitleaks rule github-pat`);
        expect(remoteRef(w, 'refs/heads/main'), label).toBeNull();
      }
      // A textconv driver that hides the text, set in the clone's own attributes and configuration.
      const w = world();
      writeFileSync(path.join(w.work, '.git', 'info', 'attributes'), '*.ts diff=hide\n');
      git(w.work, 'config', 'diff.hide.textconv', 'sh -c "echo hidden" --');
      const leaked = commit(w.work, { 'src/settings.ts': `export const token = '${syntheticToken()}';\n` }, 'a leak');
      const converted = push(w.work, environment(REAL_GITLEAKS), 'HEAD:refs/heads/main');
      expect(converted.status).not.toBe(0);
      expect(converted.stderr).toContain(`pre-push: secret scan: src/settings.ts:1 in commit ${leaked.slice(0, 12)}: gitleaks rule github-pat`);
    },
    PUSH_TIMEOUT * 2,
  );

  it(
    'checks only what a remote added and never fetched, or a URL, lacks: it asks the remote what it has',
    () => {
      const w = world();
      // A file the hook refuses, already on the remote (pushed past the hook), must not stop a clean commit on top.
      commit(w.work, { 'old/remit.835': OTHER_SENDER }, 'published long ago');
      expect(push(w.work, environment(null), '--no-verify', 'HEAD:refs/heads/main').status).toBe(0);
      const copy = path.join(path.dirname(w.remote), 'copy.git');
      execFileSync('git', ['clone', '-q', '--bare', w.remote, copy], { env: environment(null) });
      git(w.work, 'remote', 'add', 'moved', copy);
      commit(w.work, { 'README.md': '# scratch\n' }, 'clean');
      const named = pushTo(w.work, environment(stubGitleaks().binary), 'moved', 'HEAD:refs/heads/next');
      expect(named.status, named.stderr).toBe(0);
      expect(named.stderr).toContain('pre-push: 1 commit checked');
      // The remote now holds `clean` too, so a push by its URL checks only the commit after it.
      const later = commit(w.work, { 'later.txt': 'later\n' }, 'later');
      const url = pushTo(w.work, environment(stubGitleaks().binary), copy, 'HEAD:refs/heads/by-url');
      expect(url.status, url.stderr).toBe(0);
      expect(url.stderr).toContain('pre-push: 1 commit checked');
      expect(git(copy, 'rev-parse', 'refs/heads/by-url')).toBe(later);
      // A remote the hook cannot list is refused, never checked from the first commit.
      const unlisted = prePush({
        root: w.work,
        checkout: repositoryRoot,
        remote: path.join(path.dirname(w.remote), 'missing.git'),
        input: `refs/heads/main ${later} refs/heads/main ${ZERO}\n`,
        env: environment(stubGitleaks().binary),
      });
      expect(unlisted.allowed).toBe(false);
      expect(unlisted.lines.join('\n')).toContain('so this push is refused rather than checked from the first commit: add it as a remote and run git fetch for it, then push again.');
    },
    PUSH_TIMEOUT,
  );

  it(
    'lets a deletion and a push of commits the remote holds through without gitleaks, since they send nothing new',
    () => {
      const w = world();
      const head = commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      expect(push(w.work, environment(stubGitleaks().binary), 'HEAD:refs/heads/main', 'HEAD:refs/heads/spare').status).toBe(0);
      git(w.work, 'fetch', '-q', 'origin');
      const bare = { ...environment(null), PATH: pathWith(HOOK_COMMANDS) };
      const copied = push(w.work, bare, 'HEAD:refs/heads/copy');
      expect(copied.status, copied.stderr).toBe(0);
      expect(copied.stderr).toContain('pre-push: every commit this push sends is already on the remote; nothing to check.');
      const deleted = push(w.work, bare, '--delete', 'spare');
      expect(deleted.status, deleted.stderr).toBe(0);
      expect(deleted.stderr).toContain('pre-push: the push only deletes refs; nothing to check.');
      expect(remoteRef(w, 'refs/heads/spare')).toBeNull();
      expect(remoteRef(w, 'refs/heads/copy')).toBe(head);
    },
    PUSH_TIMEOUT,
  );

  it(
    'fails closed without gitleaks, with one too old for its git scan, with GITLEAKS naming nothing, and when gitleaks errs',
    () => {
      const w = world();
      commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      const missing = push(w.work, { ...environment(null), PATH: pathWith(HOOK_COMMANDS) }, 'HEAD:refs/heads/main');
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain(`pre-push: gitleaks was not found, so this push is refused: the hook scans every commit it sends for secrets. ${GITLEAKS_INSTALL}`);
      const named = push(w.work, environment('/nonexistent/gitleaks'), 'HEAD:refs/heads/main');
      expect(named.stderr).toContain('pre-push: GITLEAKS is set but does not name an executable file by its absolute path, so this push is refused.');
      const old = stubGitleaks('8.18.4');
      const tooOld = push(w.work, environment(old.binary), 'HEAD:refs/heads/main');
      expect(tooOld.stderr).toContain(`pre-push: ${old.binary} is gitleaks 8.18.4; the hook needs 8.19 or later for its git scan, so this push is refused.`);
      const erring = push(w.work, environment(stubGitleaks('8.24.3', 1).binary), 'HEAD:refs/heads/main');
      expect(erring.stderr).toContain('pre-push: gitleaks could not scan the commits (exit 1');
      for (const result of [named, tooOld, erring]) {
        expect(result.status).not.toBe(0);
      }
      expect(remoteRef(w, 'refs/heads/main')).toBeNull();
    },
    PUSH_TIMEOUT,
  );

  it(
    'fails closed in a checkout whose workspace is not installed',
    () => {
      const w = world();
      const hooks = path.join(scratch('uninstalled'), '.githooks');
      mkdirSync(hooks);
      copyFileSync(path.join(HOOKS, 'pre-push'), path.join(hooks, 'pre-push'));
      chmodSync(path.join(hooks, 'pre-push'), 0o755);
      git(w.work, 'config', 'core.hooksPath', hooks);
      commit(w.work, { 'README.md': '# scratch\n' }, 'start');
      const pushed = push(w.work, environment(stubGitleaks().binary), 'HEAD:refs/heads/main');
      expect(pushed.status).not.toBe(0);
      expect(pushed.stderr).toContain(`pre-push: ${path.dirname(hooks)} has no node_modules/.bin/tsx, so this push is refused: run pnpm install there, and push again.`);
    },
    PUSH_TIMEOUT,
  );

  it('is committed executable with its launcher and installers, and the README says how to install it', () => {
    for (const file of ['.githooks/pre-push', 'tools/pre-push/install.sh', 'tools/pre-push/launcher.sh', 'tools/gitleaks/install.sh']) {
      expect(git(repositoryRoot, 'ls-files', '-s', file).split(' ')[0], file).toBe('100755');
    }
    const scripts = (JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['hooks:install']).toBe('bash tools/pre-push/install.sh');
    expect(scripts['gitleaks:install']).toBe('bash tools/gitleaks/install.sh');
    const readme = readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
    expect(readme).toContain('pnpm hooks:install');
    expect(readme).not.toContain('git config core.hooksPath .githooks');
  });
});
