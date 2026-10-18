import { tmpdir } from 'node:os';
import path from 'node:path';

import { developmentMasterKey, readDatabaseUrl } from '@tp/db';

export interface WorkerConfig {
  /** NODE_ENV=production: a deployed worker (staging or production), where no local implementation may run. */
  readonly production: boolean;
  /**
   * The worker's own login practice jobs run as (a member of tp_app, marked as a job's by tp_job; tp_worker_login in
   * AWS, tp_worker_dev locally; docs/adr/0061), each job in its practice's scope.
   */
  readonly databaseUrl: string;
  /** pg-boss's own connection; DATABASE_URL unless QUEUE_DATABASE_URL names another login. */
  readonly queueDatabaseUrl: string;
  readonly heartbeatMs: number;
}

/**
 * One beat a minute: the heartbeat alarm counts beats per 60-second period and fires after two empty
 * ones (infra/lib/heartbeat.ts HEARTBEAT_INTERVAL_SECONDS), so a shorter default would alarm only
 * after more than two missed beats.
 */
export const DEFAULT_HEARTBEAT_SECONDS = 60;

export class WorkerConfigError extends Error {
  override readonly name = 'WorkerConfigError';
}

type Env = Readonly<Record<string, string | undefined>>;

function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw === undefined || raw === '' ? undefined : raw;
}

function required(env: Env, name: string, why: string): string {
  const found = value(env, name);
  if (found === undefined) {
    throw new WorkerConfigError(`${name} is required ${why}`);
  }
  return found;
}

function refused(env: Env, name: string, why: string): void {
  if (value(env, name) !== undefined) {
    throw new WorkerConfigError(`${name} is refused ${why}`);
  }
}

function isProduction(env: Env): boolean {
  return value(env, 'NODE_ENV') === 'production';
}

function heartbeatMs(env: Env): number {
  const raw = env.WORKER_HEARTBEAT_SECONDS ?? '';
  if (raw !== '' && !/^[1-9]\d{0,5}$/.test(raw)) {
    throw new WorkerConfigError('WORKER_HEARTBEAT_SECONDS must be a whole number of seconds from 1 to 999999');
  }
  return (raw === '' ? DEFAULT_HEARTBEAT_SECONDS : Number.parseInt(raw, 10)) * 1000;
}

/** Reads the worker's settings from the environment. */
export function readWorkerConfig(env: Env = process.env): WorkerConfig {
  const beat = heartbeatMs(env);
  let databaseUrl: string;
  try {
    databaseUrl = readDatabaseUrl(env);
  } catch (error) {
    throw new WorkerConfigError((error as Error).message);
  }
  return { production: isProduction(env), databaseUrl, queueDatabaseUrl: value(env, 'QUEUE_DATABASE_URL') ?? databaseUrl, heartbeatMs: beat };
}

/**
 * Which jobs this worker works (WORKER_JOBS; docs/adr/0049). Deployed, the practice jobs and the
 * platform jobs run in separate services under separate task roles: `practice` works the practice
 * queues only and refuses the operator login; `platform` works the platform queues only, with the
 * operator login and pg-boss's own login and never the application login. Unset (development and
 * the tests), one worker works both, the platform jobs where OPERATOR_DATABASE_URL is set.
 */
export type WorkerJobs = 'all' | 'practice' | 'platform';

export function readWorkerJobs(env: Env = process.env): WorkerJobs {
  const jobs = value(env, 'WORKER_JOBS');
  if (jobs === undefined) {
    return 'all';
  }
  if (jobs === 'practice') {
    refused(env, 'OPERATOR_DATABASE_URL', 'when WORKER_JOBS is practice (the platform jobs hold the operator login)');
    return jobs;
  }
  if (jobs === 'platform') {
    required(env, 'OPERATOR_DATABASE_URL', 'when WORKER_JOBS is platform');
    refused(env, 'DATABASE_URL', 'when WORKER_JOBS is platform (the practice jobs hold the application login)');
    return jobs;
  }
  throw new WorkerConfigError('WORKER_JOBS is practice or platform');
}

/** A platform-only worker's own settings: pg-boss's login (QUEUE_DATABASE_URL, required) and the heartbeat. */
export interface PlatformWorkerConfig {
  readonly production: boolean;
  readonly queueDatabaseUrl: string;
  readonly heartbeatMs: number;
}

export function readPlatformWorkerConfig(env: Env = process.env): PlatformWorkerConfig {
  return {
    production: isProduction(env),
    queueDatabaseUrl: required(env, 'QUEUE_DATABASE_URL', 'when WORKER_JOBS is platform'),
    heartbeatMs: heartbeatMs(env),
  };
}

export type AuditStoreConfig =
  | { readonly kind: 's3'; readonly bucket: string; readonly lockMode: 'COMPLIANCE' | 'GOVERNANCE'; readonly kmsKeyId?: string }
  | { readonly kind: 'local'; readonly dir: string };

export type RestoreDrillConfig =
  | {
      readonly kind: 'rds';
      readonly sourceInstanceId: string;
      readonly scratchInstanceId: string;
      readonly instanceClass: string;
      readonly subnetGroupName: string;
      readonly securityGroupIds: readonly string[];
    }
  | {
      readonly kind: 'local';
      readonly workDir: string;
      readonly binDir?: string;
      /** A login on the server that may CREATE DATABASE and dump every table (a superuser locally). */
      readonly adminUrl: string;
    };

export type MailConfig = { readonly kind: 'ses'; readonly from: string } | { readonly kind: 'local'; readonly dir: string };

/** The platform jobs' settings (docs/adr/0014 and 0017), or null when this worker runs none. */
/** Where mail to the support address waits: SES's bucket, or (development) a directory of .eml files. */
export type SupportInboxConfig = { readonly kind: 's3'; readonly bucket: string } | { readonly kind: 'local'; readonly dir: string };

export interface PlatformConfig {
  /** A login that can SET ROLE to tp_operator; every platform transaction runs as that role. */
  readonly operatorDatabaseUrl: string;
  readonly auditStore: AuditStoreConfig;
  readonly restoreDrill: RestoreDrillConfig;
  readonly supportInbox: SupportInboxConfig;
  /** The support-grant notices: where they are sent from, the application they link to, and the static host of their art. */
  readonly mail: MailConfig;
  readonly appOrigin: string;
  readonly staticAssetOrigin: string | null;
}

const IN_PRODUCTION = 'when NODE_ENV is production';

/**
 * Platform jobs run only where OPERATOR_DATABASE_URL is set. The audit copy goes to S3 Object Lock
 * (AUDIT_COPY_BUCKET with AUDIT_COPY_LOCK_MODE, the bucket's own mode as the stack outputs it;
 * optionally AUDIT_COPY_KMS_KEY_ID) or, in development, a directory (AUDIT_COPY_DIR). The restore
 * drill restores RDS snapshots (RESTORE_DRILL_MODE=rds with the RESTORE_DRILL_* settings) or, in
 * development, pg_dump and pg_restore on the operator's server (RESTORE_DRILL_WORK_DIR, optionally
 * PG_BIN_DIR and RESTORE_DRILL_ADMIN_URL). The support-grant notices go through SES from MAIL_FROM or,
 * in development, to a local outbox directory (MAIL_OUTBOX_DIR), and link to APP_ORIGIN. Support mail is
 * read from the bucket SES writes it to (SUPPORT_MAIL_BUCKET) or, in development, a directory of .eml
 * files (SUPPORT_MAIL_DIR, by default under the system's temporary directory), whose senders nothing
 * verifies.
 *
 * With NODE_ENV=production every local implementation is refused and nothing falls back to one: S3,
 * RDS, SES and an https APP_ORIGIN are required (house rules: local implementations in development and
 * tests only).
 */
export function readPlatformConfig(env: Env = process.env): PlatformConfig | null {
  const operatorDatabaseUrl = value(env, 'OPERATOR_DATABASE_URL');
  if (operatorDatabaseUrl === undefined) {
    return null;
  }
  const production = isProduction(env);
  if (production) {
    for (const name of ['AUDIT_COPY_DIR', 'MAIL_OUTBOX_DIR', 'RESTORE_DRILL_WORK_DIR', 'RESTORE_DRILL_ADMIN_URL', 'PG_BIN_DIR', 'SUPPORT_MAIL_DIR']) {
      refused(env, name, `${IN_PRODUCTION} (it selects a local implementation)`);
    }
  }
  const bucket = production ? required(env, 'AUDIT_COPY_BUCKET', IN_PRODUCTION) : value(env, 'AUDIT_COPY_BUCKET');
  const dir = value(env, 'AUDIT_COPY_DIR');
  if ((bucket === undefined) === (dir === undefined)) {
    throw new WorkerConfigError('exactly one of AUDIT_COPY_BUCKET and AUDIT_COPY_DIR is set when OPERATOR_DATABASE_URL is');
  }
  let auditStore: AuditStoreConfig;
  if (bucket !== undefined) {
    // No default: the copies take the bucket's own Object Lock mode (COMPLIANCE in production,
    // GOVERNANCE in staging and dev, docs/adr/0012), which the stack outputs as AuditCopyLockMode.
    const lockMode = required(env, 'AUDIT_COPY_LOCK_MODE', 'when AUDIT_COPY_BUCKET is set');
    if (lockMode !== 'COMPLIANCE' && lockMode !== 'GOVERNANCE') {
      throw new WorkerConfigError('AUDIT_COPY_LOCK_MODE is COMPLIANCE or GOVERNANCE');
    }
    const kmsKeyId = value(env, 'AUDIT_COPY_KMS_KEY_ID');
    auditStore = { kind: 's3', bucket, lockMode, ...(kmsKeyId === undefined ? {} : { kmsKeyId }) };
  } else {
    auditStore = { kind: 'local', dir: dir ?? '' };
  }
  const mode = production ? required(env, 'RESTORE_DRILL_MODE', IN_PRODUCTION) : (value(env, 'RESTORE_DRILL_MODE') ?? 'local');
  let restoreDrill: RestoreDrillConfig;
  if (mode === 'rds') {
    const why = 'when RESTORE_DRILL_MODE is rds';
    restoreDrill = {
      kind: 'rds',
      sourceInstanceId: required(env, 'RESTORE_DRILL_SOURCE_INSTANCE', why),
      scratchInstanceId: required(env, 'RESTORE_DRILL_SCRATCH_INSTANCE', why),
      instanceClass: required(env, 'RESTORE_DRILL_INSTANCE_CLASS', why),
      subnetGroupName: required(env, 'RESTORE_DRILL_SUBNET_GROUP', why),
      securityGroupIds: required(env, 'RESTORE_DRILL_SECURITY_GROUPS', why)
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    };
  } else if (mode === 'local' && !production) {
    const binDir = value(env, 'PG_BIN_DIR');
    restoreDrill = {
      kind: 'local',
      workDir: value(env, 'RESTORE_DRILL_WORK_DIR') ?? path.join(tmpdir(), 'tp-restore-drill'),
      adminUrl: value(env, 'RESTORE_DRILL_ADMIN_URL') ?? operatorDatabaseUrl,
      ...(binDir === undefined ? {} : { binDir }),
    };
  } else {
    throw new WorkerConfigError(production ? `RESTORE_DRILL_MODE is rds ${IN_PRODUCTION}` : 'RESTORE_DRILL_MODE is rds or local');
  }
  const mailBucket = production ? required(env, 'SUPPORT_MAIL_BUCKET', IN_PRODUCTION) : value(env, 'SUPPORT_MAIL_BUCKET');
  const mailDir = value(env, 'SUPPORT_MAIL_DIR');
  if (mailBucket !== undefined && mailDir !== undefined) {
    throw new WorkerConfigError('at most one of SUPPORT_MAIL_BUCKET and SUPPORT_MAIL_DIR is set');
  }
  const supportInbox: SupportInboxConfig = mailBucket !== undefined ? { kind: 's3', bucket: mailBucket } : { kind: 'local', dir: mailDir ?? path.join(tmpdir(), 'tp-support-inbox') };
  return { operatorDatabaseUrl, auditStore, restoreDrill, supportInbox, ...readNotificationConfig(env) };
}

/** Where email goes from and the application it links to: the platform's notices and the practices' digests. */
export interface NotificationConfig {
  readonly mail: MailConfig;
  readonly appOrigin: string;
  /**
   * The CloudFront static host that serves the brand art the email header embeds (STATIC_ASSET_ORIGIN, the web
   * image's own; infra/lib/constructs/edge.ts), or null, when the message goes without the art (reconciliation-001, D7).
   */
  readonly staticAssetOrigin: string | null;
}

/** An https origin with no path, as the web app reads the same setting (apps/web/src/lib/http/security-headers.ts). */
export const STATIC_ORIGIN_PATTERN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Email through SES from MAIL_FROM or, in development, to a local outbox directory (MAIL_OUTBOX_DIR,
 * by default under the system's temporary directory), linking to APP_ORIGIN. With NODE_ENV=production
 * SES and an https APP_ORIGIN are required and the outbox refused. The HTML's header embeds the brand's
 * lockup from STATIC_ASSET_ORIGIN, the CloudFront static host (an https origin with no path, which the
 * deployed tasks name); unset, as in a local build, each message goes without the art. The support-grant
 * notices (platform jobs) and the monthly digests (practice jobs, docs/adr/0039) both send this way.
 */
export function readNotificationConfig(env: Env = process.env): NotificationConfig {
  const production = isProduction(env);
  if (production) {
    refused(env, 'MAIL_OUTBOX_DIR', `${IN_PRODUCTION} (it selects a local implementation)`);
  }
  const from = production ? required(env, 'MAIL_FROM', IN_PRODUCTION) : value(env, 'MAIL_FROM');
  const outbox = value(env, 'MAIL_OUTBOX_DIR');
  if (from !== undefined && outbox !== undefined) {
    throw new WorkerConfigError('at most one of MAIL_FROM and MAIL_OUTBOX_DIR is set');
  }
  if (from !== undefined && !/^[^@\s]+@[^@\s]+$/.test(from)) {
    throw new WorkerConfigError('MAIL_FROM is an email address');
  }
  const mail: MailConfig = from !== undefined ? { kind: 'ses', from } : { kind: 'local', dir: outbox ?? path.join(tmpdir(), 'tp-mail-outbox') };
  const origin = production ? required(env, 'APP_ORIGIN', IN_PRODUCTION) : (value(env, 'APP_ORIGIN') ?? 'http://localhost:3000');
  let appOrigin: URL;
  try {
    appOrigin = new URL(origin);
  } catch {
    throw new WorkerConfigError("APP_ORIGIN is the application's URL");
  }
  if (production && appOrigin.protocol !== 'https:') {
    throw new WorkerConfigError(`APP_ORIGIN is an https URL ${IN_PRODUCTION}`);
  }
  const staticAssetOrigin = value(env, 'STATIC_ASSET_ORIGIN') ?? null;
  if (staticAssetOrigin !== null && !STATIC_ORIGIN_PATTERN.test(staticAssetOrigin)) {
    throw new WorkerConfigError('STATIC_ASSET_ORIGIN is an https origin with no path, such as https://static.example.com');
  }
  return { mail, appOrigin: appOrigin.origin, staticAssetOrigin };
}

export type DocumentStoreConfig = { readonly kind: 's3'; readonly bucket: string } | { readonly kind: 'local'; readonly dir: string };

export type KeyProviderConfig = { readonly kind: 'kms'; readonly keyId: string } | { readonly kind: 'local'; readonly masterKey: Buffer };

/** The intake job's settings (docs/adr/0026). */
export interface IntakeConfig {
  /** Where documents live: the documents bucket (with its intake prefix and GuardDuty) or a directory. */
  readonly documents: DocumentStoreConfig;
  /** Opens practices' data keys: KMS, or the local provider under the development (or a given) master key. */
  readonly keys: KeyProviderConfig;
  /** How long one attempt waits for the malware scan's verdict. */
  readonly scanWaitMs: number;
}

const DEFAULT_SCAN_WAIT_SECONDS = 600;

/**
 * Intake: the documents bucket (DOCUMENTS_BUCKET; uploads land under its intake prefix, GuardDuty
 * scans them there) or, in development, a directory (DOCUMENTS_DIR, by default under the system's
 * temporary directory; the web app's local upload receiver writes there too). Practice data keys
 * open through KMS (TP_KEY_PROVIDER=kms with KMS_KEY_ID) or, in development, the local provider under
 * TP_LOCAL_MASTER_KEY or the development master key the web app and the seed use. SCAN_WAIT_SECONDS
 * bounds how long an attempt waits for the scan's verdict. With NODE_ENV=production the bucket and
 * KMS are required and the local settings refused.
 */
export function readIntakeConfig(env: Env = process.env): IntakeConfig {
  const production = isProduction(env);
  if (production) {
    for (const name of ['DOCUMENTS_DIR', 'TP_LOCAL_MASTER_KEY']) {
      refused(env, name, `${IN_PRODUCTION} (it selects a local implementation)`);
    }
  }
  const bucket = production ? required(env, 'DOCUMENTS_BUCKET', IN_PRODUCTION) : value(env, 'DOCUMENTS_BUCKET');
  const dir = value(env, 'DOCUMENTS_DIR');
  if (bucket !== undefined && dir !== undefined) {
    throw new WorkerConfigError('at most one of DOCUMENTS_BUCKET and DOCUMENTS_DIR is set');
  }
  const documents: DocumentStoreConfig = bucket !== undefined ? { kind: 's3', bucket } : { kind: 'local', dir: dir ?? path.join(tmpdir(), 'tp-documents') };
  const provider = production ? required(env, 'TP_KEY_PROVIDER', IN_PRODUCTION) : (value(env, 'TP_KEY_PROVIDER') ?? 'local');
  let keys: KeyProviderConfig;
  if (provider === 'kms') {
    keys = { kind: 'kms', keyId: required(env, 'KMS_KEY_ID', 'when TP_KEY_PROVIDER is kms') };
  } else if (provider === 'local' && !production) {
    const given = value(env, 'TP_LOCAL_MASTER_KEY');
    const masterKey = given === undefined ? developmentMasterKey() : Buffer.from(given, 'base64');
    if (masterKey.length !== 32) {
      throw new WorkerConfigError('TP_LOCAL_MASTER_KEY is a base64-encoded 32-byte key');
    }
    keys = { kind: 'local', masterKey };
  } else {
    throw new WorkerConfigError(production ? `TP_KEY_PROVIDER is kms ${IN_PRODUCTION}` : 'TP_KEY_PROVIDER is kms or local');
  }
  const wait = value(env, 'SCAN_WAIT_SECONDS') ?? String(DEFAULT_SCAN_WAIT_SECONDS);
  if (!/^[1-9]\d{0,4}$/.test(wait)) {
    throw new WorkerConfigError('SCAN_WAIT_SECONDS must be a whole number of seconds from 1 to 99999');
  }
  return { documents, keys, scanWaitMs: Number.parseInt(wait, 10) * 1000 };
}
