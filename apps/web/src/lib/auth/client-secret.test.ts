import { inspect } from 'node:util';

import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { readWebConfig } from '../server/config';
import { type CognitoClient, CognitoAuthProvider } from './cognito-provider';
import { ClientSecret } from './secret-hash';

/**
 * SEC-21 (docs/adr/0088, D1; review security-N5): the client secret is never shown by a serialised configuration or
 * provider, so a log of either, or a server component passing the configuration to a client one (the RSC payload),
 * carries no value. Synthetic values only.
 */

const VALUE = 'synthetic0client0secret0value0000000000000000000000';

/** Every way a value is commonly shown: JSON, the string form, and inspect at any depth, hidden fields included. */
function shownForms(value: unknown): string[] {
  return [JSON.stringify(value, (_key, field: unknown) => (typeof field === 'bigint' ? String(field) : field)) ?? '', inspect(value, { depth: Infinity, showHidden: true, getters: true })];
}

describe('the client secret in the configuration and the provider', () => {
  it('SEC-21: a configuration that holds the secret shows [redacted], never the value', () => {
    const config = readWebConfig({
      DATABASE_URL: 'postgres://tp_app_dev:x@localhost:5432/tp',
      TP_AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_Synthetic',
      COGNITO_CLIENT_ID: 'syntheticclient',
      COGNITO_CLIENT_SECRET: VALUE,
    });
    for (const shown of [...shownForms(config), ...shownForms(config.auth)]) {
      expect(shown).not.toContain(VALUE);
      expect(shown).toContain('[redacted]');
    }
  });

  it('SEC-21: a provider that holds the secret shows [redacted], never the value', () => {
    const client = { send: () => Promise.reject(new Error('unscripted')) } as unknown as CognitoClient;
    const provider = new CognitoAuthProvider({
      client,
      userPoolId: 'us-east-1_Synthetic',
      clientId: 'syntheticclient',
      verifier: { verify: () => Promise.reject(new Error('unscripted')) },
      clientSecret: new ClientSecret(VALUE),
      logger: createLogger({ sink: () => undefined }),
    });
    for (const shown of shownForms(provider)) {
      expect(shown).not.toContain(VALUE);
    }
    expect(inspect(provider, { depth: Infinity })).toContain('[redacted]');
  });
});
