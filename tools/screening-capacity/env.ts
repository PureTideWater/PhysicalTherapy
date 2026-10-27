import type { CpuLayout } from './limits';

/**
 * How far the capacity test's containers depart from production's configuration (audit #53 part 1; docs/adr/0062,
 * "Capacity under production limits"), and the environment each is given.
 *
 * The web container runs NODE_ENV=production with the e2e suite's TP_ALLOW_LOCAL_PROVIDERS=e2e, as the e2e suite's
 * production build does. The platform and screening containers (and the weekly real-size test's practice worker) run
 * NODE_ENV=test with MAIL_OUTBOX_DIR, because the worker refuses a local mail outbox in production
 * (apps/worker/src/config.ts) and the test reads the emails from that outbox. A production escape for the worker's mail
 * was rejected: it would put a switch in production's configuration that sends mail nowhere, for a test. The screening consumer (WORKER_JOBS=screening, PR 6b-3) runs on its own login,
 * which switches to tp_screening as production's does, with the declared concurrency; the platform beside it prices no
 * screening.
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
      'isProduction(), called by the six config readers (readWorkerConfig, readPlatformWorkerConfig, readScreeningWorkerConfig, readPlatformConfig, readNotificationConfig, which readScreeningConfig calls for the screening consumer, and readIntakeConfig): which local implementations are refused and which settings are required (S3, RDS, SES, KMS, MAIL_FROM, an https APP_ORIGIN). The platform worker passes its production flag on to the model gateway and models/permitted.ts, which choose a provider with it; the screening consumer passes it to nothing that prices.',
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

/** One way the harness departs from production, and which way it moves the measurement. */
export interface Departure {
  readonly what: string;
  readonly direction: 'harsher' | 'equal or harsher' | 'gentler' | 'none';
}

/**
 * What the layout that ran changes from production (limits.ts, cpuLayout): on the free 4-CPU runner, where both capacity
 * jobs measure (the founder's third ruling of 2026-10-23, "Free: time advisory"), two harsher departures, the CPUs the
 * services share; on eight CPUs or more, none.
 */
export function layoutDepartures(layout: CpuLayout): readonly Departure[] {
  if (layout.kind === 'own') {
    return [
      {
        what: `each service on CPUs of its own, as production has them: Postgres db.t4g.medium’s 2 vCPU on CPUs ${layout.postgres}, the consumer’s 2 on ${layout.consumer}, the web’s half vCPU within CPU ${layout.web}, the platform’s quarter within CPU ${layout.platform}, and the harness and Chromium on ${layout.harness} (the runner’s logical CPUs: which of them are threads of one core is the host’s)`,
        direction: 'none',
      },
    ];
  }
  return [
    { what: 'Postgres gets db.t4g.medium’s 2 vCPU and 4 GiB on the runner’s first two CPUs, which the harness and Chromium share', direction: 'harsher' },
    { what: 'web and platform share the screening consumer’s last CPU (their fractional-vCPU quotas inside it)', direction: 'harsher' },
  ];
}

/** What the harness changes from production whatever the layout, and which way each change moves the measurement. */
export const DEPARTURES: readonly Departure[] = [
  { what: 'one web container takes every upload where production runs two web tasks', direction: 'harsher' },
  { what: 'a 2 ms round trip to Postgres, more than an in-VPC trip plus Multi-AZ’s synchronous commit', direction: 'harsher' },
  { what: 'gp3’s I/O baseline without its burst', direction: 'equal or harsher' },
  {
    what: 'Postgres runs on two full CPUs; db.t4g.medium earns 24 CPU credits an hour (a 20% baseline per vCPU) and bursts on its balance, and RDS runs T4g in Unlimited mode, so a drained balance is billed rather than throttled (AWS’s documentation; not verified by the harness)',
    direction: 'gentler',
  },
  { what: 'mail is a file in an outbox instead of an SES call of about 0.1 s', direction: 'gentler' },
  { what: 'the platform and screening workers run NODE_ENV=test with MAIL_OUTBOX_DIR (NODE_ENV_READS: providers and required settings only)', direction: 'none' },
  { what: 'the web runs NODE_ENV=production with TP_ALLOW_LOCAL_PROVIDERS=e2e (local identity, keys, billing and model providers)', direction: 'none' },
];

/** The logins the migration task creates (apps/worker/src/deploy/logins.ts), for the harness's scratch database only. */
export const HARNESS_LOGINS = {
  app: { username: 'tp_app_login', password: 'synthetic-capacity-app' },
  // The worker's own login (docs/adr/0061): the migration task requires it; only the weekly real-size test's practice
  // worker connects as it (tools/release-capacity), as production's worker task does. The platform worker connects as the
  // operator and queue logins, and no practice job runs in the screening's test.
  worker: { username: 'tp_worker_login', password: 'synthetic-capacity-worker' },
  operator: { username: 'tp_operator_login', password: 'synthetic-capacity-operator' },
  queue: { username: 'tp_queue_login', password: 'synthetic-capacity-queue' },
  billing: { username: 'tp_billing_login', password: 'synthetic-capacity-billing' },
  // The screening consumer's login (PR 6b-3): it may SET ROLE tp_screening and holds nothing else.
  screening: { username: 'tp_screening_login', password: 'synthetic-capacity-screening' },
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
    screening: withSuffix(HARNESS_LOGINS.screening),
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
    TP_SCREENING_LOGIN_USERNAME: logins.screening.username,
    TP_SCREENING_LOGIN_PASSWORD: logins.screening.password,
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

/**
 * The platform worker's environment: production's platform settings, with the local outbox and directories (see the
 * module comment). It prices no screening: the platform's jobs no longer include screening_price (PR 6b-3).
 */
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

/**
 * The practice worker's environment (WORKER_JOBS=practice), for the weekly real-size test (tools/release-capacity;
 * audit #31): production's worker task's settings, on the worker's own login and the queue login as production's task
 * holds them (infra/lib/constructs/compute.ts: DATABASE_URL is the worker's login, never the application login, docs/adr/
 * 0061), with the local document store, the local key provider under the harness's master key and the local outbox in
 * place of S3, KMS and SES (see the module comment). The worker refuses the operator and screening logins here.
 */
export function workerEnvironment(databaseUrl: string, origin: string, dirs: HarnessDirectories, masterKey: string, logins: HarnessLogins = HARNESS_LOGINS): Record<string, string> {
  return {
    NODE_ENV: 'test',
    WORKER_JOBS: 'practice',
    DATABASE_URL: loginUrl(databaseUrl, logins.worker),
    QUEUE_DATABASE_URL: loginUrl(databaseUrl, logins.queue),
    DOCUMENTS_DIR: dirs.documents,
    TP_KEY_PROVIDER: 'local',
    TP_LOCAL_MASTER_KEY: masterKey,
    MAIL_OUTBOX_DIR: dirs.outbox,
    MODEL_PROVIDER: 'local',
    MODEL_LOCAL_FIXTURES_DIR: dirs.modelOutputs,
    APP_ORIGIN: origin,
  };
}

/**
 * The screening consumer's environment (WORKER_JOBS=screening; one per task): production's screening settings, the
 * screening and queue logins only, the declared concurrency, and the local outbox (see the module comment). The worker
 * refuses the application and operator logins here (apps/worker/src/config.ts), as production's task holds neither.
 */
export function screeningEnvironment(databaseUrl: string, origin: string, dirs: HarnessDirectories, concurrency: number, logins: HarnessLogins = HARNESS_LOGINS): Record<string, string> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new RangeError('the screening consumer prices 1 to 8 screenings at once');
  }
  return {
    NODE_ENV: 'test',
    WORKER_JOBS: 'screening',
    SCREENING_DATABASE_URL: loginUrl(databaseUrl, logins.screening),
    QUEUE_DATABASE_URL: loginUrl(databaseUrl, logins.queue),
    SCREENING_CONCURRENCY: String(concurrency),
    MAIL_OUTBOX_DIR: dirs.outbox,
    APP_ORIGIN: origin,
  };
}

/** What the web's environment carries of production's screening settings. */
export interface WebScreeningSettings {
  /**
   * The static host the measured image was built for (STATIC_ASSET_ORIGIN, Next's assetPrefix; docs/adr/0055), which
   * production's task sets for the CSP; null for an image built with none. The harness's browser is routed to the web
   * container for it (run.ts).
   */
  readonly staticAssetOrigin?: string | null;
  /** Screenings priced at once in all (desiredCount × concurrency), from which the "sent" page's wait is told. */
  readonly screeningSlots?: number;
}

/** The web's environment: the production build with the e2e suite's local providers, one trusted proxy hop (each upload its own client address). */
export function webEnvironment(
  databaseUrl: string,
  origin: string,
  dirs: HarnessDirectories,
  secrets: { readonly cookieSecret: string; readonly masterKey: string },
  logins: HarnessLogins = HARNESS_LOGINS,
  screening: WebScreeningSettings = {},
): Record<string, string> {
  return {
    ...(screening.staticAssetOrigin === undefined || screening.staticAssetOrigin === null ? {} : { STATIC_ASSET_ORIGIN: screening.staticAssetOrigin }),
    ...(screening.screeningSlots === undefined ? {} : { SCREENING_SLOTS: String(screening.screeningSlots) }),
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
