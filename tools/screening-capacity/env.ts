/**
 * How far the capacity test's containers depart from production's configuration (audit #53 part 1; docs/adr/0062,
 * "Capacity under production limits"), and the environment each is given.
 *
 * The web container runs NODE_ENV=production with the e2e suite's TP_ALLOW_LOCAL_PROVIDERS=e2e, as the e2e suite's
 * production build does. The platform container runs NODE_ENV=test with MAIL_OUTBOX_DIR, because the worker refuses
 * a local mail outbox in production (apps/worker/src/config.ts) and the test reads the emails from that outbox. A
 * production escape for the worker's mail was rejected: it would put a switch in production's configuration that
 * sends mail nowhere, for a test.
 *
 * NODE_ENV_READS lists every place the code the two images load reads NODE_ENV (apps/worker/src and packages/*\/src,
 * tests aside), what it selects, and why the departure does not change what is measured: each selects a provider or
 * requires a setting; none changes pricing, the queue or the database session. env.test.ts fails on a read not on
 * the list, so a new one is looked at before it can move a measurement.
 */

export interface NodeEnvRead {
  /** Repository-relative file. */
  readonly file: string;
  /** Reads of NODE_ENV in its code (comments aside). */
  readonly reads: number;
  /** What the value selects there. */
  readonly selects: string;
}

export const NODE_ENV_READS: readonly NodeEnvRead[] = [
  {
    file: 'apps/worker/src/config.ts',
    reads: 1,
    selects:
      'isProduction(), called by the five config readers (readWorkerConfig, readPlatformWorkerConfig, readPlatformConfig, readNotificationConfig, readIntakeConfig): which local implementations are refused and which settings are required (S3, RDS, SES, KMS, an https APP_ORIGIN). The platform worker passes its production flag on to the model gateway and models/permitted.ts, which choose a provider with it.',
  },
  {
    file: 'packages/model-gateway/src/config.ts',
    reads: 1,
    selects: 'whether the local model provider is refused (gateway.ts and evaluated.ts receive the flag from here); the screening calls no model.',
  },
  {
    file: 'packages/synth/src/twin/boundary.ts',
    reads: 1,
    selects: 'the twin generator’s production boundary; neither image loads it (the worker and the web app do not depend on @tp/synth).',
  },
];

/** What the harness changes from production, and which way each change moves the measurement. */
export const DEPARTURES: readonly { readonly what: string; readonly direction: 'harsher' | 'equal or harsher' | 'gentler' | 'none' }[] = [
  { what: 'Postgres gets min(2, CPUs less one) CPUs and min(4 GiB, the runner less 3.5 GiB) of memory: fewer than db.t4g.medium on a 2-vCPU runner', direction: 'harsher' },
  { what: 'one web container takes every upload where production runs two web tasks', direction: 'harsher' },
  { what: 'a 2 ms round trip to Postgres, more than an in-VPC trip plus Multi-AZ’s synchronous commit', direction: 'harsher' },
  { what: 'gp3’s I/O baseline without its burst', direction: 'equal or harsher' },
  { what: 'mail is a file in an outbox instead of an SES call of about 0.1 s', direction: 'gentler' },
  { what: 'the platform worker runs NODE_ENV=test with MAIL_OUTBOX_DIR (NODE_ENV_READS: providers and required settings only)', direction: 'none' },
  { what: 'the web runs NODE_ENV=production with TP_ALLOW_LOCAL_PROVIDERS=e2e (local identity, keys, billing and model providers)', direction: 'none' },
];

/** The logins the migration task creates (apps/worker/src/deploy/logins.ts), for the harness's scratch database only. */
export const HARNESS_LOGINS = {
  app: { username: 'tp_app_login', password: 'synthetic-capacity-app' },
  // The worker's own login (docs/adr/0061): the migration task requires it, though no harness service connects as it
  // (the platform worker connects as the operator and queue logins, and no practice job runs in the test).
  worker: { username: 'tp_worker_login', password: 'synthetic-capacity-worker' },
  operator: { username: 'tp_operator_login', password: 'synthetic-capacity-operator' },
  queue: { username: 'tp_queue_login', password: 'synthetic-capacity-queue' },
  billing: { username: 'tp_billing_login', password: 'synthetic-capacity-billing' },
} as const;

export type HarnessLogins = Readonly<Record<keyof typeof HARNESS_LOGINS, { readonly username: string; readonly password: string }>>;

/**
 * The logins with a run's own suffix. Roles belong to the whole server, not to a database: on a server the harness
 * shares (the process runtime), the run's logins carry its suffix and are dropped with its database, so they never meet
 * another run's or another test's roles (apps/worker/src/deploy/logins.db.test.ts does the same). The Docker runtime's
 * Postgres is the harness's own, so its logins keep production's names.
 */
export function harnessLogins(suffix: string): HarnessLogins {
  if (!/^[a-z0-9]{1,16}$/.test(suffix)) {
    throw new RangeError('a login suffix is 1 to 16 lowercase letters and digits');
  }
  const withSuffix = (login: { readonly username: string; readonly password: string }) => ({ username: `${login.username}_${suffix}`, password: login.password });
  return {
    app: withSuffix(HARNESS_LOGINS.app),
    worker: withSuffix(HARNESS_LOGINS.worker),
    operator: withSuffix(HARNESS_LOGINS.operator),
    queue: withSuffix(HARNESS_LOGINS.queue),
    billing: withSuffix(HARNESS_LOGINS.billing),
  };
}

/** A login's URL on the harness's database. */
export function loginUrl(databaseUrl: string, login: { readonly username: string; readonly password: string }): string {
  const url = new URL(databaseUrl);
  url.username = login.username;
  url.password = login.password;
  return url.toString();
}

/** The migration image's environment for dist/logins.js. */
export function loginsEnvironment(ownerUrl: string, logins: HarnessLogins = HARNESS_LOGINS): Record<string, string> {
  return {
    DATABASE_URL: ownerUrl,
    TP_APP_LOGIN_USERNAME: logins.app.username,
    TP_APP_LOGIN_PASSWORD: logins.app.password,
    TP_WORKER_LOGIN_USERNAME: logins.worker.username,
    TP_WORKER_LOGIN_PASSWORD: logins.worker.password,
    TP_OPERATOR_LOGIN_USERNAME: logins.operator.username,
    TP_OPERATOR_LOGIN_PASSWORD: logins.operator.password,
    TP_QUEUE_LOGIN_USERNAME: logins.queue.username,
    TP_QUEUE_LOGIN_PASSWORD: logins.queue.password,
    TP_BILLING_LOGIN_USERNAME: logins.billing.username,
    TP_BILLING_LOGIN_PASSWORD: logins.billing.password,
  };
}

export interface HarnessDirectories {
  readonly outbox: string;
  readonly auditCopies: string;
  readonly restoreDrill: string;
  readonly supportMail: string;
  readonly devAuth: string;
  readonly documents: string;
  readonly billing: string;
  readonly modelOutputs: string;
  readonly agreements: string;
  readonly compliance: string;
}

/** The platform worker's environment: production's platform settings, with the local outbox and directories (see the module comment). */
export function platformEnvironment(databaseUrl: string, origin: string, dirs: HarnessDirectories, logins: HarnessLogins = HARNESS_LOGINS): Record<string, string> {
  return {
    NODE_ENV: 'test',
    WORKER_JOBS: 'platform',
    OPERATOR_DATABASE_URL: loginUrl(databaseUrl, logins.operator),
    QUEUE_DATABASE_URL: loginUrl(databaseUrl, logins.queue),
    AUDIT_COPY_DIR: dirs.auditCopies,
    RESTORE_DRILL_MODE: 'local',
    RESTORE_DRILL_WORK_DIR: dirs.restoreDrill,
    SUPPORT_MAIL_DIR: dirs.supportMail,
    MAIL_OUTBOX_DIR: dirs.outbox,
    APP_ORIGIN: origin,
  };
}

/** The web's environment: the production build with the e2e suite's local providers, one trusted proxy hop (each upload its own client address). */
export function webEnvironment(
  databaseUrl: string,
  origin: string,
  dirs: HarnessDirectories,
  secrets: { readonly cookieSecret: string; readonly masterKey: string },
  logins: HarnessLogins = HARNESS_LOGINS,
): Record<string, string> {
  return {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: loginUrl(databaseUrl, logins.app),
    BILLING_DATABASE_URL: loginUrl(databaseUrl, logins.billing),
    // No e-signature vendor, as in production today (ESIGN_PROVIDER unset is none there): no e-signature login.
    QUEUE_DATABASE_URL: loginUrl(databaseUrl, logins.queue),
    APP_ORIGIN: origin,
    TP_ALLOW_LOCAL_PROVIDERS: 'e2e',
    TP_AUTH_PROVIDER: 'dev',
    TP_DEV_AUTH_DIR: dirs.devAuth,
    TP_KEY_PROVIDER: 'local',
    TP_LOCAL_MASTER_KEY: secrets.masterKey,
    AUTH_COOKIE_SECRET: secrets.cookieSecret,
    BILLING_PROVIDER: 'local',
    BILLING_LOCAL_DIR: dirs.billing,
    DOCUMENTS_DIR: dirs.documents,
    MODEL_PROVIDER: 'local',
    MODEL_LOCAL_FIXTURES_DIR: dirs.modelOutputs,
    AGREEMENTS_DIR: dirs.agreements,
    COMPLIANCE_EXPORT_DIR: dirs.compliance,
    // Production sits behind the load balancer: one hop, so each upload's browser can be its own client address.
    TRUSTED_PROXY_HOPS: '1',
  };
}
