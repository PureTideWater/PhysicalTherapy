import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { BillingProvider } from '@tp/billing';
import { S3Client } from '@aws-sdk/client-s3';
import { DocumentStore, LocalSealedBytes, S3SealedBytes } from '@tp/worker/documents';
import { type KeyProvider, LocalKeyProvider, type ScopeClient, type ScopePool, createKmsKeyProvider, openPool } from '@tp/db/runtime';
import { type CompliancePlatform, FileCompliancePlatform } from '@tp/compliance';
import { type Logger, createLogger } from '@tp/observability';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { type AgreementDocuments, LocalAgreementDocuments, S3AgreementDocuments } from '../agreements/documents';
import { type ESignatureProvider, LocalESignature } from '../agreements/esign';
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
  /**
   * How many proxies in front of the server append to X-Forwarded-For (the load balancer: 1), so the rate limits
   * know the client's address; 0 trusts none (docs/adr/0053).
   */
  readonly trustedProxyHops: number;
  /** The support address (PRD 19, Support): shown on the support, status and maintenance pages. */
  readonly supportEmail: string;
  /** The e-signature vendor's webhook verifier and document source, or null when none is configured (docs/adr/0053). */
  readonly esign: ESignatureProvider | null;
  /** Where uploaded agreements are kept (docs/adr/0053). */
  readonly agreementDocuments: AgreementDocuments;
  /** The compliance platform the evidence export is sent to, or null when none is connected (docs/adr/0053). */
  readonly compliancePlatform: CompliancePlatform | null;
  /** The deployment this server runs in: dev, staging or production. */
  readonly environment: 'dev' | 'staging' | 'production';
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
  readonly trustedProxyHops?: number;
  readonly supportEmail?: string;
  /** Tests give the local e-signature stand-in; otherwise none. */
  readonly esign?: ESignatureProvider | null;
  readonly agreementDocuments?: AgreementDocuments;
  readonly compliancePlatform?: CompliancePlatform | null;
  readonly environment?: 'dev' | 'staging' | 'production';
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
    trustedProxyHops: parts.trustedProxyHops ?? 0,
    supportEmail: parts.supportEmail ?? 'support@synthetic.test',
    esign: parts.esign ?? null,
    agreementDocuments: parts.agreementDocuments ?? new LocalAgreementDocuments(path.join(tmpdir(), `tp-agreements-${randomUUID()}`)),
    compliancePlatform: parts.compliancePlatform === undefined ? new FileCompliancePlatform(path.join(tmpdir(), `tp-compliance-export-${randomUUID()}`)) : parts.compliancePlatform,
    environment: parts.environment ?? 'dev',
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
    trustedProxyHops: config.trustedProxyHops,
    supportEmail: config.supportEmail,
    esign: config.esign.kind === 'local' ? new LocalESignature({ secret: config.esign.secret, directory: config.esign.directory }) : null,
    agreementDocuments:
      documents.kind === 's3' ? new S3AgreementDocuments({ client: new S3Client({}), bucket: documents.bucket, kmsKeyId: documents.kmsKeyId }) : new LocalAgreementDocuments(config.agreementsDir),
    compliancePlatform: config.complianceExportDir === null ? null : new FileCompliancePlatform(config.complianceExportDir),
    environment: config.environment,
  });
}

let cached: Services | undefined;

/** The process's services, built from the environment on first use. */
export function services(): Services {
  cached ??= servicesFromConfig(readWebConfig());
  return cached;
}
