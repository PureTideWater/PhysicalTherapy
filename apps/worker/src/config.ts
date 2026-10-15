import { tmpdir } from 'node:os';
import path from 'node:path';

import { readDatabaseUrl } from '@tp/db';

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly heartbeatMs: number;
}

const DEFAULT_HEARTBEAT_SECONDS = 30;

export class WorkerConfigError extends Error {
  override readonly name = 'WorkerConfigError';
}

/** Reads the worker's settings from the environment. */
export function readWorkerConfig(env: Readonly<Record<string, string | undefined>> = process.env): WorkerConfig {
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
  return { databaseUrl, heartbeatMs: seconds * 1000 };
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
      readonly databaseUser: string;
      readonly databasePassword: string;
      readonly databaseName: string;
    }
  | { readonly kind: 'local'; readonly workDir: string; readonly binDir?: string };

/** The platform jobs' settings (docs/adr/0014), or null when this worker runs none. */
export interface PlatformConfig {
  /** A login that can SET ROLE to the owner; locally also CREATE DATABASE (the restore drill). */
  readonly operatorDatabaseUrl: string;
  readonly auditStore: AuditStoreConfig;
  readonly restoreDrill: RestoreDrillConfig;
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

/**
 * Platform jobs run only where OPERATOR_DATABASE_URL is set. The audit copy goes to S3 Object Lock
 * (AUDIT_COPY_BUCKET; AUDIT_COPY_LOCK_MODE, COMPLIANCE unless GOVERNANCE is named; optionally
 * AUDIT_COPY_KMS_KEY_ID) or, in development, a directory
 * (AUDIT_COPY_DIR). The restore drill restores RDS snapshots (RESTORE_DRILL_MODE=rds with the
 * RESTORE_DRILL_* settings) or, by default, pg_dump and pg_restore on the operator's server
 * (RESTORE_DRILL_WORK_DIR, optionally PG_BIN_DIR).
 */
export function readPlatformConfig(env: Env = process.env): PlatformConfig | null {
  const operatorDatabaseUrl = value(env, 'OPERATOR_DATABASE_URL');
  if (operatorDatabaseUrl === undefined) {
    return null;
  }
  const bucket = value(env, 'AUDIT_COPY_BUCKET');
  const dir = value(env, 'AUDIT_COPY_DIR');
  if ((bucket === undefined) === (dir === undefined)) {
    throw new WorkerConfigError('exactly one of AUDIT_COPY_BUCKET and AUDIT_COPY_DIR is set when OPERATOR_DATABASE_URL is');
  }
  const kmsKeyId = value(env, 'AUDIT_COPY_KMS_KEY_ID');
  const lockMode = value(env, 'AUDIT_COPY_LOCK_MODE') ?? 'COMPLIANCE';
  if (lockMode !== 'COMPLIANCE' && lockMode !== 'GOVERNANCE') {
    throw new WorkerConfigError('AUDIT_COPY_LOCK_MODE is COMPLIANCE or GOVERNANCE');
  }
  const auditStore: AuditStoreConfig =
    bucket !== undefined ? { kind: 's3', bucket, lockMode, ...(kmsKeyId === undefined ? {} : { kmsKeyId }) } : { kind: 'local', dir: dir ?? '' };
  const mode = value(env, 'RESTORE_DRILL_MODE') ?? 'local';
  let restoreDrill: RestoreDrillConfig;
  if (mode === 'rds') {
    const why = 'when RESTORE_DRILL_MODE is rds';
    restoreDrill = {
      kind: 'rds',
      sourceInstanceId: required(env, 'RESTORE_DRILL_SOURCE_INSTANCE', why),
      scratchInstanceId: value(env, 'RESTORE_DRILL_SCRATCH_INSTANCE') ?? 'tp-restore-drill',
      instanceClass: required(env, 'RESTORE_DRILL_INSTANCE_CLASS', why),
      subnetGroupName: required(env, 'RESTORE_DRILL_SUBNET_GROUP', why),
      securityGroupIds: required(env, 'RESTORE_DRILL_SECURITY_GROUPS', why)
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
      databaseUser: required(env, 'RESTORE_DRILL_DATABASE_USER', why),
      databasePassword: required(env, 'RESTORE_DRILL_DATABASE_PASSWORD', why),
      databaseName: required(env, 'RESTORE_DRILL_DATABASE_NAME', why),
    };
  } else if (mode === 'local') {
    const binDir = value(env, 'PG_BIN_DIR');
    restoreDrill = { kind: 'local', workDir: value(env, 'RESTORE_DRILL_WORK_DIR') ?? path.join(tmpdir(), 'tp-restore-drill'), ...(binDir === undefined ? {} : { binDir }) };
  } else {
    throw new WorkerConfigError('RESTORE_DRILL_MODE is rds or local');
  }
  return { operatorDatabaseUrl, auditStore, restoreDrill };
}
