import { readFileSync } from 'node:fs';
import path from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';
import { expressionAllowed, licenseProblems, policySchema } from './check';

const allowed = new Set(['MIT', 'Apache-2.0', 'CC0-1.0']);
const policy = policySchema.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, 'allowlist.json'), 'utf8')));

describe('expressionAllowed', () => {
  it.each([
    ['MIT', true],
    ['GPL-3.0-only', false],
    ['(MIT OR CC0-1.0)', true],
    ['(GPL-3.0-only OR MIT)', true],
    ['MIT AND Apache-2.0', true],
    ['MIT AND GPL-3.0-only', false],
    ['(MIT AND (Apache-2.0 OR GPL-2.0-only))', true],
    ['Apache-2.0+', true],
    ['Unknown', false],
    ['', false],
    ['(MIT', false],
    ['MIT OR', false],
    ['MIT MIT', false],
  ])('%j is %s', (expression, expected) => {
    expect(expressionAllowed(expression, allowed)).toBe(expected);
  });

  it('allows an OR when either side is allowed and an AND only when both are (property)', () => {
    const id = fc.constantFrom('MIT', 'Apache-2.0', 'GPL-3.0-only', 'SSPL-1.0');
    fc.assert(
      fc.property(id, id, (a, b) => {
        expect(expressionAllowed(`(${a} OR ${b})`, allowed)).toBe(allowed.has(a) || allowed.has(b));
        expect(expressionAllowed(`${a} AND ${b}`, allowed)).toBe(allowed.has(a) && allowed.has(b));
      }),
    );
  });
});

describe('licenseProblems', () => {
  const pkg = (name: string) => ({ name, versions: ['1.0.0'] });

  it('passes allowed licenses and named exceptions', () => {
    expect(
      licenseProblems(
        { MIT: [pkg('a')], '(MIT OR CC0-1.0)': [pkg('b')], 'LGPL-3.0-or-later': [pkg('@img/sharp-libvips-linux-x64')] },
        policy,
      ),
    ).toEqual([]);
  });

  it('refuses a license off the list, an exception for another package, and a stale exception', () => {
    // The musl build's exception, as it stood before pnpm 10.34.8 wrote the lockfile's libc fields: stale once
    // `pnpm licenses list` on glibc no longer lists the musl build.
    const withStale = { ...policy, exceptions: [...policy.exceptions, { package: '@img/sharp-libvips-linuxmusl-x64', license: 'LGPL-3.0-or-later', reason: 'libvips for musl, loaded dynamically by sharp' }] };
    expect(licenseProblems({ 'GPL-3.0-only': [pkg('copyleft')], 'LGPL-3.0-or-later': [pkg('other-lib'), pkg('@img/sharp-libvips-linux-x64')] }, withStale)).toEqual([
      'copyleft@1.0.0: GPL-3.0-only is not on the license allowlist (tools/check-licenses/allowlist.json)',
      'other-lib@1.0.0: LGPL-3.0-or-later is not on the license allowlist (tools/check-licenses/allowlist.json)',
      'the exception for @img/sharp-libvips-linuxmusl-x64 (LGPL-3.0-or-later) matches no production dependency; remove it',
    ]);
  });

  it('holds the allowlist to the one libvips exception, the glibc build: the musl build is not listed once the lockfile carries libc (CI-14)', () => {
    expect(policy.exceptions.map((exception) => exception.package)).toEqual(['@img/sharp-libvips-linux-x64']);
  });

  it('requires a reason for every exception', () => {
    expect(() => policySchema.parse({ licenses: ['MIT'], exceptions: [{ package: 'x', license: 'GPL-3.0-only', reason: 'because' }] })).toThrow();
  });
});

/**
 * The tree whose lockfile is judged: CI_TREE when set (a copy such as the merge base's `git archive`, so the rule can be
 * shown failing on the base without checking it out), the repository otherwise.
 */
const tree = process.env.CI_TREE ?? repositoryRoot;

/** A lockfile `packages:` key's package name: `name@version` or `@scope/name@version`. */
function packageName(key: string): string {
  const at = key.indexOf('@', 1);
  return at === -1 ? key : key.slice(0, at);
}

/** A name that marks a build for musl: `linuxmusl` anywhere, or a `-musl` suffix. */
const MUSL_NAME = /linuxmusl|-musl$/;

/** One line per musl-marked lockfile entry that does not carry `libc: [musl]`. */
function muslLibcProblems(lockfileText: string): { readonly checked: number; readonly problems: string[] } {
  const lockfile = parse(lockfileText) as { packages?: Record<string, { libc?: unknown } | null> };
  const problems: string[] = [];
  let checked = 0;
  for (const [key, entry] of Object.entries(lockfile.packages ?? {})) {
    if (!MUSL_NAME.test(packageName(key))) {
      continue;
    }
    checked += 1;
    const libc = entry?.libc;
    if (!(Array.isArray(libc) && libc.length === 1 && libc[0] === 'musl')) {
      problems.push(`${key}: libc is ${JSON.stringify(libc ?? null)}, not [musl]`);
    }
  }
  return { checked, problems };
}

describe('the lockfile’s libc fields', () => {
  it('give every musl build its libc: [musl], so pnpm licenses list leaves it out on glibc (CI-14)', () => {
    const { checked, problems } = muslLibcProblems(readFileSync(path.join(tree, 'pnpm-lock.yaml'), 'utf8'));
    // sharp's, @next/swc's, lightningcss's, rolldown's, tailwind oxide's and @napi-rs/canvas's musl builds, at least.
    expect(checked).toBeGreaterThan(0);
    expect(
      problems,
      'an entry written before pnpm wrote libc fields (10.34.8 writes them on a fresh resolution, not into existing entries): run `pnpm install --lockfile-only --fix-lockfile` under the pnpm packageManager names',
    ).toEqual([]);
  });

  it('read a name that marks musl and an entry without its field', () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      'packages:',
      "  '@img/sharp-libvips-linuxmusl-x64@1.3.4':",
      '    resolution: {integrity: sha512-x}',
      '    cpu: [x64]',
      '    os: [linux]',
      "  '@next/swc-linux-x64-musl@16.4.1':",
      '    resolution: {integrity: sha512-y}',
      '    libc: [musl]',
      '  lightningcss-linux-x64-musl@1.33.0:',
      '    resolution: {integrity: sha512-z}',
      '    libc: [glibc]',
      "  '@img/sharp-linux-x64@0.35.5':",
      '    resolution: {integrity: sha512-w}',
      '  musl-detect@1.0.0:',
      '    resolution: {integrity: sha512-v}',
    ].join('\n');
    expect(muslLibcProblems(lockfile)).toEqual({
      checked: 3,
      problems: ['@img/sharp-libvips-linuxmusl-x64@1.3.4: libc is null, not [musl]', 'lightningcss-linux-x64-musl@1.33.0: libc is ["glibc"], not [musl]'],
    });
    expect(packageName('@scope/name@1.0.0')).toBe('@scope/name');
    expect(packageName('name@1.0.0')).toBe('name');
  });
});
