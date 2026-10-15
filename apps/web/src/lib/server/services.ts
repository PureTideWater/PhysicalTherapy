import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type KeyProvider, LocalKeyProvider, type ScopeClient, type ScopePool, createKmsKeyProvider, openPool } from '@tp/db/runtime';
import { type Logger, createLogger } from '@tp/observability';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { CognitoAuthProvider } from '../auth/cognito-provider';
import { DevAuthProvider } from '../auth/dev-provider';
import { FileDevStore } from '../auth/dev-store';
import type { AuthProvider } from '../auth/provider';
import { Sealer } from '../auth/seal';
import { SignInFlow } from '../auth/sign-in';
import { type JobQueue, PgBossQueue } from '../uploads/queue';
import { LocalUploadTargets, S3UploadTargets, type UploadTargets, presigningClient } from '../uploads/targets';
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
  /** Where browsers send upload bytes: presigned S3 PUTs, or this server's local receiver. */
  readonly uploads: UploadTargets;
  /** The worker's queue, for the jobs requests start (intake when an upload completes). */
  readonly queue: JobQueue;
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
  /** Tests that upload give their own; otherwise a local receiver in a fresh temporary directory. */
  readonly uploads?: UploadTargets;
  /** Tests that queue give their own; otherwise queueing fails, so nothing is ever dropped silently. */
  readonly queue?: JobQueue;
}

/** No queue configured: refuses rather than dropping the job. */
const NO_QUEUE: JobQueue = {
  enqueue: () => Promise.reject(new Error('no job queue is configured for these services')),
};

function localUploads(origin: string, directory: string, sealer: Sealer): UploadTargets {
  return new LocalUploadTargets(origin, new DocumentStore(new LocalSealedBytes(directory)), sealer);
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
    uploads: parts.uploads ?? localUploads(parts.origin, path.join(tmpdir(), `tp-documents-${randomUUID()}`), parts.sealer),
    queue: parts.queue ?? NO_QUEUE,
  };
}

export function servicesFromConfig(config: WebConfig): Services {
  const sealer = new Sealer(config.cookieSecret);
  const logger = createLogger();
  const documents = config.documents;
  return createServices({
    origin: config.origin,
    pool: openPool(config.databaseUrl, 10),
    provider: provider(config, sealer),
    keys: config.keys.kind === 'kms' ? createKmsKeyProvider(config.keys.keyId) : new LocalKeyProvider(config.keys.masterKey),
    sealer,
    logger,
    uploads: documents.kind === 's3' ? new S3UploadTargets({ client: presigningClient(), bucket: documents.bucket, kmsKeyId: documents.kmsKeyId }) : localUploads(config.origin, documents.dir, sealer),
    queue: new PgBossQueue(config.queueDatabaseUrl, logger),
  });
}

let cached: Services | undefined;

/** The process's services, built from the environment on first use. */
export function services(): Services {
  cached ??= servicesFromConfig(readWebConfig());
  return cached;
}
