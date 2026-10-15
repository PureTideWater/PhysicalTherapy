import { tmpdir } from 'node:os';
import path from 'node:path';

import { readDatabaseUrl } from '@tp/db';

export interface WorkerConfig {
  /** NODE_ENV=production: a deployed worker (staging or production), where no local implementation may run. */
  readonly production: boolean;
  /** The application login practice jobs run as (a member of tp_app), each job in its practice's scope. */
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

/** Reads the worker's settings from the environment. */
export function readWorkerConfig(env: Env = process.env): WorkerConfig {
  const raw = env.WORKER_HEARTBEAT_SECONDS ?? '';
  if (raw !== '' && !/^[1-9]\d{0,5}$/.test(raw)) {
    throw new WorkerConfigError('WORKER_HEARTBEAT_SECONDS must be a whole number of seconds from 1 to 999999');
  }
  const seconds = raw === '' ? DEFAULT_HEARTBEAT_SECONDS : Number.parseInt(raw, 10);
  let databaseUrl: string;
  try {
    databaseUrl = readDatabaseUrl(env);
  } catch (error) {
    throw new WorkerConfigError((error as Error).message);
  }
  return { production: isProduction(env), databaseUrl, queueDatabaseUrl: value(env, 'QUEUE_DATABASE_URL') ?? databaseUrl, heartbeatMs: seconds * 1000 };
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
export interface PlatformConfig {
  /** A login that can SET ROLE to tp_operator; every platform transaction runs as that role. */
  readonly operatorDatabaseUrl: string;
  readonly auditStore: AuditStoreConfig;
  readonly restoreDrill: RestoreDrillConfig;
  /** The support-grant notices: where they are sent from, and the application they link to. */
  readonly mail: MailConfig;
  readonly appOrigin: string;
}

const IN_PRODUCTION = 'when NODE_ENV is production';

/**
 * Platform jobs run only where OPERATOR_DATABASE_URL is set. The audit copy goes to S3 Object Lock
 * (AUDIT_COPY_BUCKET with AUDIT_COPY_LOCK_MODE, the bucket's own mode as the stack outputs it;
 * optionally AUDIT_COPY_KMS_KEY_ID) or, in development, a directory (AUDIT_COPY_DIR). The restore
 * drill restores RDS snapshots (RESTORE_DRILL_MODE=rds with the RESTORE_DRILL_* settings) or, in
 * development, pg_dump and pg_restore on the operator's server (RESTORE_DRILL_WORK_DIR, optionally
 * PG_BIN_DIR and RESTORE_DRILL_ADMIN_URL). The support-grant notices go through SES from MAIL_FROM or,
 * in development, to a local outbox directory (MAIL_OUTBOX_DIR), and link to APP_ORIGIN.
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
    for (const name of ['AUDIT_COPY_DIR', 'MAIL_OUTBOX_DIR', 'RESTORE_DRILL_WORK_DIR', 'RESTORE_DRILL_ADMIN_URL', 'PG_BIN_DIR']) {
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
  return { operatorDatabaseUrl, auditStore, restoreDrill, mail, appOrigin: appOrigin.origin };
}
