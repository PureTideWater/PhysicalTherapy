import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { BillingProvider } from '@tp/billing';
import { S3Client } from '@aws-sdk/client-s3';
import { DocumentStore, LocalSealedBytes, S3SealedBytes } from '@tp/worker/documents';
import { type KeyProvider, LocalKeyProvider, type ScopeClient, type ScopePool, createKmsKeyProvider, openPool } from '@tp/db/runtime';
import { type Logger, createLogger } from '@tp/observability';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { CognitoAuthProvider } from '../auth/cognito-provider';
import { DevAuthProvider } from '../auth/dev-provider';
import { FileDevStore } from '../auth/dev-store';
import type { AuthProvider } from '../auth/provider';
import { Sealer } from '../auth/seal';
import { SignInFlow } from '../auth/sign-in';
import { readBillingConfig } from '../billing/config';
import { billingProvider, memoryBillingProvider } from '../billing/provider';
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
  /**
   * The practices' sealed documents, read in a request to show and cite a contract's pages (opened
   * with the practice's cipher; docs/adr/0018): the same directory the local receiver writes, or the
   * documents bucket.
   */
  readonly documents: DocumentStore;
  /** The checkout the console's Rule releases screen works in; null when the server has none (WebConfig.contentRoot). */
  readonly contentRoot: string | null;
  /** Stripe, or the local test-mode simulator (docs/adr/0050). */
  readonly billing: BillingProvider;
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
  /** Tests that read documents give their own (the store their uploads land in). */
  readonly documents?: DocumentStore;
  /** Tests of the Rule releases screen give a scratch checkout; otherwise none. */
  readonly contentRoot?: string | null;
  /** Tests that bill give their own; otherwise an in-memory simulator delivering its events to the pool. */
  readonly billing?: BillingProvider;
}

/** No queue configured: refuses rather than dropping the job. */
const NO_QUEUE: JobQueue = {
  enqueue: () => Promise.reject(new Error('no job queue is configured for these services')),
};

export function createServices(parts: ServiceParts): Services {
  const logger = parts.logger ?? createLogger();
  const documents = parts.documents ?? new DocumentStore(new LocalSealedBytes(path.join(tmpdir(), `tp-documents-${randomUUID()}`)));
  return {
    origin: parts.origin,
    pool: parts.pool,
    provider: parts.provider,
    keys: parts.keys,
    sealer: parts.sealer,
    logger,
    signIn: new SignInFlow({ pool: parts.pool, provider: parts.provider, logger }),
    now: parts.now ?? (() => new Date()),
    uploads: parts.uploads ?? new LocalUploadTargets(parts.origin, documents, parts.sealer),
    queue: parts.queue ?? NO_QUEUE,
    documents,
    contentRoot: parts.contentRoot ?? null,
    billing: parts.billing ?? memoryBillingProvider(parts.pool),
  };
}

export function servicesFromConfig(config: WebConfig): Services {
  const sealer = new Sealer(config.cookieSecret);
  const logger = createLogger();
  const documents = config.documents;
  const pool = openPool(config.databaseUrl, 10);
  const store = documents.kind === 's3' ? new DocumentStore(new S3SealedBytes({ client: new S3Client({}), bucket: documents.bucket })) : new DocumentStore(new LocalSealedBytes(documents.dir));
  return createServices({
    origin: config.origin,
    pool,
    provider: provider(config, sealer),
    keys: config.keys.kind === 'kms' ? createKmsKeyProvider(config.keys.keyId) : new LocalKeyProvider(config.keys.masterKey),
    sealer,
    logger,
    uploads: documents.kind === 's3' ? new S3UploadTargets({ client: presigningClient(), bucket: documents.bucket, kmsKeyId: documents.kmsKeyId }) : new LocalUploadTargets(config.origin, store, sealer),
    queue: new PgBossQueue(config.queueDatabaseUrl, logger),
    documents: store,
    contentRoot: config.contentRoot,
    billing: billingProvider(readBillingConfig(), pool),
  });
}

let cached: Services | undefined;

/** The process's services, built from the environment on first use. */
export function services(): Services {
  cached ??= servicesFromConfig(readWebConfig());
  return cached;
}
