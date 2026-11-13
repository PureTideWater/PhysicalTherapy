import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SGN-19 (docs/adr/0095; Queues item 37): nothing in the web asks the identity provider to sign a user out. End
 * membership (both routes), a password reset and a hardware key removal each write their audit event in their own
 * transaction, the database queues one `provider_sign_out` row with it, and the worker's job `provider_sign_outs`
 * sends it. So a committed act always has its row, a rolled-back act has none, and no page waits on the provider.
 * A static scan of every file under apps/web: the provider's sign-out (the SDK's command, the old method of the
 * web's provider and the old after-commit helper) is named nowhere, in code or in a comment. The one allowed mention
 * is a test's assertion that the web's provider has no such method.
 */

const WEB = path.resolve(import.meta.dirname, '../../..');
const SELF = path.relative(WEB, import.meta.filename);

const NAMED = /global[-_ ]?sign[-_ ]?out|signOutAtProvider|provider-sign-out/i;
const ALLOWED = /^\s*expect\(provider\)\.not\.toHaveProperty\('globalSignOut'\);$/;

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      return name === 'node_modules' || name.startsWith('.') ? [] : files(full);
    }
    return /\.(ts|tsx|js|mjs|cjs|json)$/.test(name) ? [full] : [];
  });
}

describe('the web never asks the provider to sign a user out (SGN-19)', () => {
  it('names the provider’s sign-out in no file under apps/web', () => {
    const found = files(WEB).flatMap((file) => {
      const relative = path.relative(WEB, file);
      if (relative === SELF) {
        return [];
      }
      return readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => (NAMED.test(line) && !ALLOWED.test(line) ? [`${relative}:${index + 1}`] : []));
    });
    expect(found).toEqual([]);
  });

  it('scans the sources it means to (the sign-in flow and both End membership routes are among them)', () => {
    const scanned = files(WEB).map((file) => path.relative(WEB, file));
    expect(scanned).toEqual(expect.arrayContaining(['src/lib/auth/sign-in.ts', 'src/lib/auth/cognito-provider.ts', 'src/lib/routes/console.ts', 'src/lib/routes/settings.ts']));
  });
});
