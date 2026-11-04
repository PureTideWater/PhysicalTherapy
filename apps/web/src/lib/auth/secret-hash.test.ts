import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { ClientSecret, clientSecretValue, secretHash } from './secret-hash';

/**
 * SEC-20 (docs/adr/0088, D1): the hash a confidential client sends with every call that names a user, over the exact
 * username that request sends, and the wrapper that keeps the secret out of every log, error and serialised value.
 * Synthetic client and secret only.
 */

const CLIENT = 'syntheticclient';
const VALUE = 'synthetic-client-secret-0000000000000000000000000000';

describe('the secret hash', () => {
  it('SEC-20: matches the known-answer vectors, over a typed address and over Cognito’s internal name', () => {
    const secret = new ClientSecret(VALUE);
    expect(secretHash(secret, 'person@synthetic.test', CLIENT)).toBe('0fwk9eJaaj4xR5Mx8ooZtDWJmJAKzV+YThxODSt/Tw4=');
    expect(secretHash(secret, '00000000-0000-4000-8000-000000000001', CLIENT)).toBe('SDnRp0ffi0e/TJypz1uFM58gdES/znkYwY5t3Zbn4Y0=');
  });

  it('SEC-20: is over the username exactly as sent: another case, another client or another secret is another hash', () => {
    const secret = new ClientSecret(VALUE);
    const hash = secretHash(secret, 'person@synthetic.test', CLIENT);
    expect(secretHash(secret, 'Person@synthetic.test', CLIENT)).not.toBe(hash);
    expect(secretHash(secret, 'person@synthetic.test', 'otherclient')).not.toBe(hash);
    expect(secretHash(new ClientSecret(`${VALUE}1`), 'person@synthetic.test', CLIENT)).not.toBe(hash);
  });
});

describe('the client secret’s wrapper (review security-N5)', () => {
  it('SEC-21: shows [redacted] to JSON, String and inspect, alone or inside an object, and gives the value only to the call that sends it', () => {
    const secret = new ClientSecret(VALUE);
    expect(JSON.stringify(secret)).toBe('"[redacted]"');
    expect(String(secret)).toBe('[redacted]');
    expect(`${secret}`).toBe('[redacted]');
    expect(inspect(secret)).toBe('[redacted]');
    const holder = { clientId: CLIENT, clientSecret: secret, nested: { secret } };
    for (const shown of [JSON.stringify(holder), inspect(holder, { depth: 10, showHidden: true }), String(Object.values(holder))]) {
      expect(shown).not.toContain(VALUE);
    }
    expect(Object.keys(secret)).toEqual([]);
    expect(clientSecretValue(secret)).toBe(VALUE);
  });

  it('SEC-21: refuses an empty value', () => {
    expect(() => new ClientSecret('')).toThrow('a client secret is never empty');
  });
});
