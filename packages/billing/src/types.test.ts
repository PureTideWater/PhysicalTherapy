import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PAYMENT_METHOD_ORDER } from './types';

/**
 * The order of the accepted payment methods (test matrix BIL-02; docs/adr/0073): the bank account first, from a
 * module the browser can import without reaching Stripe's SDK or node:crypto.
 */

describe('PAYMENT_METHOD_ORDER', () => {
  it('offers the bank account (ACH) first and the card second, and nothing else', () => {
    expect(PAYMENT_METHOD_ORDER).toEqual(['us_bank_account', 'card']);
  });

  it('imports nothing but types, so the browser bundle never pulls in the server side of billing', () => {
    const source = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
    const imports = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    expect(imports.every((line) => /^import type \{[^}]*\} from '[^']+';$/.test(line))).toBe(true);
    expect(source).not.toMatch(/^\s*export\s[^;]*\sfrom\s/m);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
