import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { type KeyProvider, LocalKeyProvider, type ScopeClient, type ScopePool, createKmsKeyProvider, openPool } from '@tp/db/runtime';
import { type Logger, createLogger } from '@tp/observability';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { CognitoAuthProvider } from '../auth/cognito-provider';
import { DevAuthProvider } from '../auth/dev-provider';
import { FileDevStore } from '../auth/dev-store';
import type { AuthProvider } from '../auth/provider';
import { Sealer } from '../auth/seal';
import { SignInFlow } from '../auth/sign-in';
import { type WebConfig, readWebConfig } from './config';

/**
 * What every route handler and server action runs with: the application role's pool, the identity
 * and key providers chosen by the configuration, the cookie sealer, the logger and the sign-in flow.
 * Built once per server process; tests build their own with createServices().
 */
export interface Services {
  readonly origin: string;
  readonly pool: ScopePool<ScopeClient>;
  readonly provider: AuthProvider;
  readonly keys: KeyProvider;
  readonly sealer: Sealer;
  readonly logger: Logger;
  readonly signIn: SignInFlow;
  readonly now: () => Date;
}

/** The local outbox where the development provider "sends" an invitation's temporary password. */
export function devOutbox(directory: string): (email: string, temporaryPassword: string) => Promise<void> {
  return async (email, temporaryPassword) => {
    const outbox = path.join(directory, 'outbox');
    await mkdir(outbox, { recursive: true });
    await writeFile(path.join(outbox, `${String(Date.now())}-${randomUUID()}.json`), `${JSON.stringify({ email, temporaryPassword })}\n`, { mode: 0o600 });
  };
}

function provider(config: WebConfig, sealer: Sealer): AuthProvider {
  if (config.auth.kind === 'cognito') {
    return new CognitoAuthProvider({
      client: new CognitoIdentityProviderClient({ region: config.auth.region }),
      userPoolId: config.auth.userPoolId,
      clientId: config.auth.clientId,
      verifier: CognitoJwtVerifier.create({ userPoolId: config.auth.userPoolId, tokenUse: 'id', clientId: config.auth.clientId }),
    });
  }
  return new DevAuthProvider({
    store: new FileDevStore(path.join(config.auth.directory, 'store.json')),
    sealer: sealer.derive('dev-provider'),
    webauthn: { rpId: config.rpId, rpName: 'Therapy Platform', origin: config.origin },
    deliverInvitation: devOutbox(config.auth.directory),
  });
}

export interface ServiceParts {
  readonly origin: string;
  readonly pool: ScopePool<ScopeClient>;
  readonly provider: AuthProvider;
  readonly keys: KeyProvider;
  readonly sealer: Sealer;
  readonly logger?: Logger;
  readonly now?: () => Date;
}

export function createServices(parts: ServiceParts): Services {
  const logger = parts.logger ?? createLogger();
  return {
    origin: parts.origin,
    pool: parts.pool,
    provider: parts.provider,
    keys: parts.keys,
    sealer: parts.sealer,
    logger,
    signIn: new SignInFlow({ pool: parts.pool, provider: parts.provider, logger }),
    now: parts.now ?? (() => new Date()),
  };
}

export function servicesFromConfig(config: WebConfig): Services {
  const sealer = new Sealer(config.cookieSecret);
  return createServices({
    origin: config.origin,
    pool: openPool(config.databaseUrl, 10),
    provider: provider(config, sealer),
    keys: config.keys.kind === 'kms' ? createKmsKeyProvider(config.keys.keyId) : new LocalKeyProvider(config.keys.masterKey),
    sealer,
  });
}

let cached: Services | undefined;

/** The process's services, built from the environment on first use. */
export function services(): Services {
  cached ??= servicesFromConfig(readWebConfig());
  return cached;
}
