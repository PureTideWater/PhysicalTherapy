import { readFileSync } from 'node:fs';
import path from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

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
        { MIT: [pkg('a')], '(MIT OR CC0-1.0)': [pkg('b')], 'LGPL-3.0-or-later': [pkg('@img/sharp-libvips-linux-x64'), pkg('@img/sharp-libvips-linuxmusl-x64')] },
        policy,
      ),
    ).toEqual([]);
  });

  it('refuses a license off the list, an exception for another package, and a stale exception', () => {
    expect(licenseProblems({ 'GPL-3.0-only': [pkg('copyleft')], 'LGPL-3.0-or-later': [pkg('other-lib'), pkg('@img/sharp-libvips-linux-x64')] }, policy)).toEqual([
      'copyleft@1.0.0: GPL-3.0-only is not on the license allowlist (tools/check-licenses/allowlist.json)',
      'other-lib@1.0.0: LGPL-3.0-or-later is not on the license allowlist (tools/check-licenses/allowlist.json)',
      'the exception for @img/sharp-libvips-linuxmusl-x64 (LGPL-3.0-or-later) matches no production dependency; remove it',
    ]);
  });

  it('requires a reason for every exception', () => {
    expect(() => policySchema.parse({ licenses: ['MIT'], exceptions: [{ package: 'x', license: 'GPL-3.0-only', reason: 'because' }] })).toThrow();
  });
});
