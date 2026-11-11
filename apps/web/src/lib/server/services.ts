import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SESv2Client } from '@aws-sdk/client-sesv2';
import { cognitoMessage } from '@tp/auth-mail';
import type { BillingProvider } from '@tp/billing';
import { S3Client } from '@aws-sdk/client-s3';
import { DocumentStore, LocalSealedBytes, S3SealedBytes } from '@tp/worker/documents';
import { type KeyProvider, LocalKeyProvider, type ScopeClient, type ScopePool, createKmsKeyProvider, openPool } from '@tp/db/runtime';
import { type CompliancePlatform, FileCompliancePlatform } from '@tp/compliance';
import { type Logger, createLogger } from '@tp/observability';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { type AgreementDocuments, LocalAgreementDocuments, S3AgreementDocuments } from '../agreements/documents';
import { type ESignatureProvider, LocalESignature } from '../agreements/esign';
import { CognitoAuthProvider, cognitoClients } from '../auth/cognito-provider';
import { CredentialProbe, PROBE_USERNAME } from '../auth/credential-probe';
import { DevAuthProvider } from '../auth/dev-provider';
import { FileDevStore } from '../auth/dev-store';
import type { AuthProvider } from '../auth/provider';
import { Sealer } from '../auth/seal';
import { SignInFlow } from '../auth/sign-in';
import { readBillingConfig } from '../billing/config';
import { billingProvider, memoryBillingProvider } from '../billing/provider';
import type { BillingPool } from '@tp/worker/billing';
import { type AddressCheckServices, localAddressChecks, sesAddressInsights, systemDomainResolver } from '../screening/validation';
import { assumedRoleCredentials } from '../screening/validation-credentials';
import { type JobQueue, PgBossQueue, type RequestQueue } from '../uploads/queue';
import { LocalUploadTargets, S3UploadTargets, type UploadTargets, presigningClient } from '../uploads/targets';
import { type AuthProviderSettings, DEFAULT_MAIL_VALIDATION_DAILY_CAP, DEFAULT_SCREENING_SLOTS, type ScreeningLaunch, type WebConfig, readWebConfig } from './config';
import { WEB_POOL_CONNECTIONS } from './pools';

/**
 * What every route handler and server action runs with: the application role's pool, the identity
 * and key providers chosen by the configuration, the cookie sealer, the logger and the sign-in flow.
 * Built once per server process; tests build their own with createServices().
 */
export interface Services {
  readonly origin: string;
  /** The application role's login: every route's own transaction. It may not switch to billing's or the e-signature role. */
  readonly pool: ScopePool<ScopeClient>;
  /**
   * Billing's own login (docs/adr/0055), which alone may SET ROLE tp_billing: the Stripe webhook and the organization's
   * billing screens, after the person's permission is checked in their own transaction, and nothing else.
   */
  readonly billingPool: BillingPool;
  /** The e-signature webhook's own login, which alone may SET ROLE tp_esign; null when no vendor is configured. */
  readonly esignPool: ScopePool<ScopeClient> | null;
  /**
   * The model gateway's own pool (the application's login; docs/adr/0055): its flag reads, budget holds and
   * model_call rows never wait on the pool whose connection the request's transaction holds.
   */
  readonly modelPool: ScopePool<ScopeClient>;
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
  /** The security address: security.txt's Contact and the disclosure page's address for reports (WebConfig.securityEmail). */
  readonly securityEmail: string;
  /** The e-signature vendor's webhook verifier and document source, or null when none is configured (docs/adr/0053). */
  readonly esign: ESignatureProvider | null;
  /** Where uploaded agreements are kept (docs/adr/0053). */
  readonly agreementDocuments: AgreementDocuments;
  /** The compliance platform the evidence export is sent to, or null when none is connected (docs/adr/0053). */
  readonly compliancePlatform: CompliancePlatform | null;
  /** The deployment this server runs in: dev, staging or production. */
  readonly environment: 'dev' | 'staging' | 'production';
  /** The deploy's word on the screening (decision 13): a production server opens it only for its own tag's launch value. */
  readonly screeningLaunch: ScreeningLaunch;
  /** Screenings the consumer prices at once (WebConfig.screeningSlots). */
  readonly screeningSlots: number;
  /**
   * The screening's address checks (docs/adr/0065, D9): the VPC's DNS and SES's validation under the day's cap on a
   * deployed server, the stand-ins elsewhere (WebConfig.mailValidation).
   */
  readonly addressChecks: AddressCheckServices;
  /**
   * The start-up credential probe (docs/adr/0088, D8): run once, on the process's first services() call, while a
   * client secret is set; the health check answers 503 while it holds a refusal. Skipped otherwise.
   */
  readonly credentialProbe: CredentialProbe;
}

/**
 * What a signed-in route's handler runs with (ActorContext, PracticeContext; Queues item 25 (a), R4-S2): the services
 * without the application pool, and with the queue as the request's own. A signed-in request's work runs on the one
 * transaction the routes' wrapper opened for it (the scope's client): a second connection from the application pool
 * would be outside that transaction's practice scope and its lock bound, and could starve the pool every practice
 * shares, so a handler has no way to ask for one, by this type and, since the wrapper builds the object without the
 * property (signedInServices), at run time. And a handler's send is queued with the request (RequestQueue), never by
 * itself.
 *
 * The sign-in flow goes with the pool: it is built on it and commits in steps of its own, and only the public sign-in
 * routes use it. Kept, each for its own stated use: billing's and the e-signature vendor's pools (other logins, after
 * the person's permission is checked; docs/adr/0055) and the model gateway's pool (its rows must outlive a request
 * that rolls back and must not wait on the request's connection; docs/adr/0055). Public routes keep Services: they
 * open no scope.
 */
export type SignedInServices = Omit<Services, 'pool' | 'signIn' | 'queue'> & { readonly queue: RequestQueue };

/** Each request's view of a server's services, by the services it was made from (signedInServices). */
const servers = new WeakMap<object, object>();

/**
 * The services as a signed-in handler gets them: every property but the application pool and the sign-in flow, and the
 * request's own queue. A new object for each request, since its queue is the request's; what a server keeps once for
 * all its requests is kept by serverOf, never by this object.
 */
export function signedInServices(services: Services, queue: RequestQueue): SignedInServices {
  const { pool: _pool, signIn: _signIn, queue: _queue, ...kept } = services;
  const mine = Object.freeze({ ...kept, queue });
  servers.set(mine, services);
  return mine;
}

/**
 * The server a set of services belongs to, as the key of what is kept once per server (the cap on model calls in
 * flight, a test's model path, the remembered refusals; models/path.ts, models/contract-proposals.ts): the services a
 * request's view was made from, or the services themselves. A request's view is a new object every time, so a map
 * keyed by the view would start empty for every request: the cap would cap nothing.
 */
export function serverOf(services: object): object {
  return servers.get(services) ?? services;
}

/**
 * The local outbox where the development provider "sends" an invitation: the subject, text and HTML Cognito's
 * CustomMessage trigger sends (@tp/auth-mail, SGN-15), naming this server's sign-in page, so the e2e reads the
 * temporary password from the message's own words. The email and the password fields stay for filtering and the http
 * test. Synthetic accounts only.
 */
export function devOutbox(directory: string, signInUrl: string): (email: string, temporaryPassword: string) => Promise<void> {
  return async (email, temporaryPassword) => {
    const outbox = path.join(directory, 'outbox');
    await mkdir(outbox, { recursive: true });
    const message = cognitoMessage('CustomMessage_AdminCreateUser', { code: temporaryPassword, username: email, signInUrl });
    const record = { email, temporaryPassword, subject: message.subject, body: message.text, html: message.html };
    await writeFile(path.join(outbox, `${String(Date.now())}-${randomUUID()}.json`), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  };
}

/**
 * The local outbox where the development provider "sends" a password-reset code: a sibling of the invitations' outbox,
 * which e2e/onboarding.spec.ts reads whole as invitations, in the words and frame Cognito's trigger sends (section 2.5's,
 * from @tp/auth-mail). Synthetic accounts only.
 */
export function devResetOutbox(directory: string): (email: string, code: string) => Promise<void> {
  return async (email, code) => {
    const outbox = path.join(directory, 'reset-outbox');
    await mkdir(outbox, { recursive: true });
    const message = cognitoMessage('CustomMessage_ForgotPassword', { code });
    const record = { email, code, subject: message.subject, body: message.text, html: message.html };
    await writeFile(path.join(outbox, `${String(Date.now())}-${randomUUID()}.json`), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  };
}

function provider(config: WebConfig, sealer: Sealer, logger: Logger): AuthProvider {
  if (config.auth.kind === 'cognito') {
    return new CognitoAuthProvider({
      // Two clients (docs/adr/0093, D9): the confirm of a password reset is sent once, never repeated.
      ...cognitoClients(config.auth.region),
      userPoolId: config.auth.userPoolId,
      clientId: config.auth.clientId,
      ...(config.auth.clientSecret === null ? {} : { clientSecret: config.auth.clientSecret }),
      verifier: CognitoJwtVerifier.create({ userPoolId: config.auth.userPoolId, tokenUse: 'id', clientId: config.auth.clientId }),
      logger,
    });
  }
  return new DevAuthProvider({
    store: new FileDevStore(path.join(config.auth.directory, 'store.json')),
    sealer: sealer.derive('dev-provider'),
    webauthn: { rpId: config.rpId, rpName: 'Therapy Platform', origin: config.origin },
    deliverInvitation: devOutbox(config.auth.directory, `${config.origin}/sign-in`),
    deliverResetCode: devResetOutbox(config.auth.directory),
  });
}

export interface ServiceParts {
  readonly origin: string;
  readonly pool: ScopePool<ScopeClient>;
  /** Tests that bill give billing's login (MigratedDatabase.billingUrl); otherwise billing refuses. */
  readonly billingPool?: BillingPool;
  /** Tests of the e-signature webhook give its login (MigratedDatabase.esignUrl); otherwise none. */
  readonly esignPool?: ScopePool<ScopeClient> | null;
  /** The gateway's own pool; tests that make no calls at once may leave it to the request pool. */
  readonly modelPool?: ScopePool<ScopeClient>;
  readonly provider: AuthProvider;
  readonly keys: KeyProvider;
  readonly sealer: Sealer;
  readonly logger?: Logger;
  readonly now?: () => Date;
  /** Tests give the reset request's floor a clock and a wait of their own; otherwise the real clock and a timer. */
  readonly pace?: { readonly now: () => number; readonly sleep: (ms: number) => Promise<void> };
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
  readonly securityEmail?: string;
  /** Tests give the local e-signature stand-in; otherwise none. */
  readonly esign?: ESignatureProvider | null;
  readonly agreementDocuments?: AgreementDocuments;
  readonly compliancePlatform?: CompliancePlatform | null;
  readonly environment?: 'dev' | 'staging' | 'production';
  readonly screeningLaunch?: ScreeningLaunch;
  readonly screeningSlots?: number;
  /** Tests that check addresses give their own; otherwise the stand-ins, which call no one, at the default cap. */
  readonly addressChecks?: AddressCheckServices;
  /** The deployed server's start-up probe; skipped by default. */
  readonly credentialProbe?: CredentialProbe;
}

/** No queue configured: refuses rather than dropping the job. */
const NO_QUEUE: JobQueue = {
  enqueue: () => Promise.reject(new Error('no job queue is configured for these services')),
  enqueueScreeningRun: () => Promise.reject(new Error('no job queue is configured for these services')),
  hold: () => Promise.reject(new Error('no job queue is configured for these services')),
};

/** No billing login configured: refuses rather than falling back to the application's login. */
const NO_BILLING_LOGIN: BillingPool = {
  connect: () => Promise.reject(new Error('no billing login is configured for these services')),
};

export function createServices(parts: ServiceParts): Services {
  const logger = parts.logger ?? createLogger();
  const documents = parts.documents ?? new DocumentStore(new LocalSealedBytes(path.join(tmpdir(), `tp-documents-${randomUUID()}`)));
  const billingPool = parts.billingPool ?? NO_BILLING_LOGIN;
  return {
    origin: parts.origin,
    pool: parts.pool,
    billingPool,
    esignPool: parts.esignPool ?? null,
    modelPool: parts.modelPool ?? parts.pool,
    provider: parts.provider,
    keys: parts.keys,
    sealer: parts.sealer,
    logger,
    signIn: new SignInFlow({ pool: parts.pool, provider: parts.provider, logger, ...(parts.pace === undefined ? {} : { now: parts.pace.now, sleep: parts.pace.sleep }) }),
    now: parts.now ?? (() => new Date()),
    uploads: parts.uploads ?? new LocalUploadTargets(parts.origin, documents, parts.sealer),
    queue: parts.queue ?? NO_QUEUE,
    documents,
    contentRoot: parts.contentRoot ?? null,
    billing: parts.billing ?? memoryBillingProvider(billingPool),
    trustedProxyHops: parts.trustedProxyHops ?? 0,
    supportEmail: parts.supportEmail ?? 'support@synthetic.test',
    securityEmail: parts.securityEmail ?? 'security@synthetic.test',
    esign: parts.esign ?? null,
    agreementDocuments: parts.agreementDocuments ?? new LocalAgreementDocuments(path.join(tmpdir(), `tp-agreements-${randomUUID()}`)),
    compliancePlatform: parts.compliancePlatform === undefined ? new FileCompliancePlatform(path.join(tmpdir(), `tp-compliance-export-${randomUUID()}`)) : parts.compliancePlatform,
    environment: parts.environment ?? 'dev',
    screeningLaunch: parts.screeningLaunch ?? { imageTag: null, value: null },
    screeningSlots: parts.screeningSlots ?? DEFAULT_SCREENING_SLOTS,
    addressChecks: parts.addressChecks ?? localAddressChecks(DEFAULT_MAIL_VALIDATION_DAILY_CAP),
    credentialProbe: parts.credentialProbe ?? CredentialProbe.skipped(),
  };
}

/**
 * The start-up credential probe for these settings (docs/adr/0088, D8): Cognito's probe request when the client has a
 * secret, skipped while it has none (release N) and for the dev provider.
 */
export function credentialProbeOf(auth: AuthProviderSettings, provider: AuthProvider, logger: Logger): CredentialProbe {
  if (auth.kind !== 'cognito' || auth.clientSecret === null || !(provider instanceof CognitoAuthProvider)) {
    return CredentialProbe.skipped();
  }
  return new CredentialProbe(() => provider.probe(PROBE_USERNAME), logger);
}

export function servicesFromConfig(config: WebConfig): Services {
  const sealer = new Sealer(config.cookieSecret);
  const logger = createLogger();
  const documents = config.documents;
  const pool = openPool(config.databaseUrl, WEB_POOL_CONNECTIONS.application);
  const billingPool = openPool(config.billingDatabaseUrl, WEB_POOL_CONNECTIONS.billing);
  const auth = provider(config, sealer, logger);
  const store = documents.kind === 's3' ? new DocumentStore(new S3SealedBytes({ client: new S3Client({}), bucket: documents.bucket })) : new DocumentStore(new LocalSealedBytes(documents.dir));
  return createServices({
    origin: config.origin,
    pool,
    billingPool,
    esignPool: config.esignDatabaseUrl === null ? null : openPool(config.esignDatabaseUrl, WEB_POOL_CONNECTIONS.esign),
    // One connection for each call the process lets be in flight at once, and one to spare (pools.ts).
    modelPool: openPool(config.databaseUrl, WEB_POOL_CONNECTIONS.model),
    provider: auth,
    credentialProbe: credentialProbeOf(config.auth, auth, logger),
    keys: config.keys.kind === 'kms' ? createKmsKeyProvider(config.keys.keyId) : new LocalKeyProvider(config.keys.masterKey),
    sealer,
    logger,
    uploads: documents.kind === 's3' ? new S3UploadTargets({ client: presigningClient(), bucket: documents.bucket, kmsKeyId: documents.kmsKeyId }) : new LocalUploadTargets(config.origin, store, sealer),
    queue: new PgBossQueue(config.queueDatabaseUrl, logger),
    documents: store,
    contentRoot: config.contentRoot,
    billing: billingProvider(readBillingConfig(), billingPool),
    trustedProxyHops: config.trustedProxyHops,
    supportEmail: config.supportEmail,
    securityEmail: config.securityEmail,
    esign: config.esign.kind === 'local' ? new LocalESignature({ secret: config.esign.secret, directory: config.esign.directory }) : null,
    agreementDocuments:
      documents.kind === 's3' ? new S3AgreementDocuments({ client: new S3Client({}), bucket: documents.bucket, kmsKeyId: documents.kmsKeyId }) : new LocalAgreementDocuments(config.agreementsDir),
    compliancePlatform: config.complianceExportDir === null ? null : new FileCompliancePlatform(config.complianceExportDir),
    environment: config.environment,
    screeningLaunch: config.screeningLaunch,
    screeningSlots: config.screeningSlots,
    addressChecks:
      config.mailValidation.kind === 'ses'
        ? {
            resolver: systemDomainResolver(),
            // As the address-validation account's role (docs/adr/0065): never this account's, whose trail would keep the address.
            insights: sesAddressInsights(new SESv2Client(config.mailValidation.roleArn === null ? {} : { credentials: assumedRoleCredentials(config.mailValidation.roleArn) })),
            dailyCap: config.mailValidation.dailyCap,
          }
        : localAddressChecks(config.mailValidation.dailyCap, config.mailValidation.delayMs),
  });
}

let cached: Services | undefined;

/** The process's services, built from the environment on first use, which also starts the credential probe once. */
export function services(): Services {
  if (cached === undefined) {
    cached = servicesFromConfig(readWebConfig());
    void cached.credentialProbe.start();
  }
  return cached;
}
