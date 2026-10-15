import { describe, expect, it } from 'vitest';

import { WorkerConfigError, readPlatformConfig, readWorkerConfig } from './config';

const DATABASE_URL = 'postgres://u:p@localhost:5432/d';

describe('readWorkerConfig', () => {
  it('defaults the heartbeat to thirty seconds', () => {
    expect(readWorkerConfig({ DATABASE_URL })).toEqual({ databaseUrl: DATABASE_URL, heartbeatMs: 30_000 });
    expect(readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: '' }).heartbeatMs).toBe(30_000);
  });

  it('reads the heartbeat interval in seconds', () => {
    expect(readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: '15' }).heartbeatMs).toBe(15_000);
  });

  it.each(['0', '-5', '1.5', '10s', '07', '1000000'])('refuses a heartbeat of %j', (value) => {
    expect(() => readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: value })).toThrow(WorkerConfigError);
  });

  it('requires DATABASE_URL', () => {
    expect(() => readWorkerConfig({})).toThrow(WorkerConfigError);
    expect(() => readWorkerConfig({})).toThrow(/DATABASE_URL is not set/);
  });
});

describe('readPlatformConfig', () => {
  const OPERATOR_DATABASE_URL = 'postgres://owner@localhost:5432/d';

  it('runs no platform job without an operator connection', () => {
    expect(readPlatformConfig({})).toBeNull();
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL: ' ' })).toBeNull();
  });

  it('copies to a local directory and drills with pg_dump by default', () => {
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: '/var/tp/audit', RESTORE_DRILL_WORK_DIR: '/var/tp/drill', PG_BIN_DIR: '/usr/lib/postgresql/18/bin' })).toEqual({
      operatorDatabaseUrl: OPERATOR_DATABASE_URL,
      auditStore: { kind: 'local', dir: '/var/tp/audit' },
      restoreDrill: { kind: 'local', workDir: '/var/tp/drill', binDir: '/usr/lib/postgresql/18/bin' },
    });
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: 'a' })?.restoreDrill).toEqual({ kind: 'local', workDir: expect.stringContaining('tp-restore-drill') });
  });

  it('copies to S3 Object Lock, COMPLIANCE unless GOVERNANCE is named, and drills on RDS', () => {
    const config = readPlatformConfig({
      OPERATOR_DATABASE_URL,
      AUDIT_COPY_BUCKET: 'tp-production-audit-copies',
      AUDIT_COPY_KMS_KEY_ID: 'alias/tp-production',
      RESTORE_DRILL_MODE: 'rds',
      RESTORE_DRILL_SOURCE_INSTANCE: 'tp-production',
      RESTORE_DRILL_INSTANCE_CLASS: 'db.t4g.medium',
      RESTORE_DRILL_SUBNET_GROUP: 'tp-data',
      RESTORE_DRILL_SECURITY_GROUPS: 'sg-a, sg-b,',
      RESTORE_DRILL_DATABASE_USER: 'tp_owner_login',
      RESTORE_DRILL_DATABASE_PASSWORD: 'synthetic-secret',
      RESTORE_DRILL_DATABASE_NAME: 'tp',
    });
    expect(config).toEqual({
      operatorDatabaseUrl: OPERATOR_DATABASE_URL,
      auditStore: { kind: 's3', bucket: 'tp-production-audit-copies', lockMode: 'COMPLIANCE', kmsKeyId: 'alias/tp-production' },
      restoreDrill: {
        kind: 'rds',
        sourceInstanceId: 'tp-production',
        scratchInstanceId: 'tp-restore-drill',
        instanceClass: 'db.t4g.medium',
        subnetGroupName: 'tp-data',
        securityGroupIds: ['sg-a', 'sg-b'],
        databaseUser: 'tp_owner_login',
        databasePassword: 'synthetic-secret',
        databaseName: 'tp',
      },
    });
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_BUCKET: 'b', AUDIT_COPY_LOCK_MODE: 'GOVERNANCE' })?.auditStore).toEqual({ kind: 's3', bucket: 'b', lockMode: 'GOVERNANCE' });
  });

  it.each([
    [{ AUDIT_COPY_DIR: 'a', AUDIT_COPY_BUCKET: 'b' }, /exactly one of AUDIT_COPY_BUCKET and AUDIT_COPY_DIR/],
    [{}, /exactly one of AUDIT_COPY_BUCKET and AUDIT_COPY_DIR/],
    [{ AUDIT_COPY_BUCKET: 'b', AUDIT_COPY_LOCK_MODE: 'compliance' }, /AUDIT_COPY_LOCK_MODE is COMPLIANCE or GOVERNANCE/],
    [{ AUDIT_COPY_DIR: 'a', RESTORE_DRILL_MODE: 'aurora' }, /RESTORE_DRILL_MODE is rds or local/],
    [{ AUDIT_COPY_DIR: 'a', RESTORE_DRILL_MODE: 'rds' }, /RESTORE_DRILL_SOURCE_INSTANCE is required when RESTORE_DRILL_MODE is rds/],
  ])('refuses %j', (env, message) => {
    expect(() => readPlatformConfig({ OPERATOR_DATABASE_URL, ...env })).toThrow(message);
    expect(() => readPlatformConfig({ OPERATOR_DATABASE_URL, ...env })).toThrow(WorkerConfigError);
  });
});
