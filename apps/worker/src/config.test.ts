import { readFileSync } from 'node:fs';
import path from 'node:path';

import { developmentMasterKey } from '@tp/db';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HEARTBEAT_SECONDS,
  WorkerConfigError,
  readIntakeConfig,
  readNotificationConfig,
  readPlatformConfig,
  readPlatformWorkerConfig,
  readWorkerConfig,
  readWorkerJobs,
} from './config';

const DATABASE_URL = 'postgres://u:p@localhost:5432/d';

describe('readWorkerConfig', () => {
  it('defaults the heartbeat to one beat a minute, the interval the alarm counts', () => {
    expect(readWorkerConfig({ DATABASE_URL })).toEqual({ production: false, databaseUrl: DATABASE_URL, queueDatabaseUrl: DATABASE_URL, heartbeatMs: 60_000 });
    expect(readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: '' }).heartbeatMs).toBe(60_000);
    // infra/lib/heartbeat.ts: the alarm fires after two empty HEARTBEAT_INTERVAL_SECONDS periods.
    const infra = readFileSync(path.resolve(import.meta.dirname, '../../../infra/lib/heartbeat.ts'), 'utf8');
    expect(infra).toContain(`export const HEARTBEAT_INTERVAL_SECONDS = ${String(DEFAULT_HEARTBEAT_SECONDS)};`);
  });

  it('reads the heartbeat interval in seconds, production from NODE_ENV and a separate queue login', () => {
    expect(readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: '15' }).heartbeatMs).toBe(15_000);
    expect(readWorkerConfig({ DATABASE_URL, NODE_ENV: 'production', QUEUE_DATABASE_URL: 'postgres://q@localhost/d' })).toMatchObject({
      production: true,
      queueDatabaseUrl: 'postgres://q@localhost/d',
    });
  });

  it.each(['0', '-5', '1.5', '10s', '07', '1000000'])('refuses a heartbeat of %j', (value) => {
    expect(() => readWorkerConfig({ DATABASE_URL, WORKER_HEARTBEAT_SECONDS: value })).toThrow(WorkerConfigError);
  });

  it('requires DATABASE_URL', () => {
    expect(() => readWorkerConfig({})).toThrow(WorkerConfigError);
    expect(() => readWorkerConfig({})).toThrow(/DATABASE_URL is not set/);
  });
});

describe('readWorkerJobs (docs/adr/0049)', () => {
  const OPERATOR = 'postgres://operator@localhost:5432/d';

  it('works every job when unset, as in development and the tests', () => {
    expect(readWorkerJobs({})).toBe('all');
    expect(readWorkerJobs({ WORKER_JOBS: '', DATABASE_URL, OPERATOR_DATABASE_URL: OPERATOR })).toBe('all');
  });

  it('runs the practice jobs without the operator login', () => {
    expect(readWorkerJobs({ WORKER_JOBS: 'practice', DATABASE_URL })).toBe('practice');
    expect(() => readWorkerJobs({ WORKER_JOBS: 'practice', DATABASE_URL, OPERATOR_DATABASE_URL: OPERATOR })).toThrow(/OPERATOR_DATABASE_URL is refused when WORKER_JOBS is practice/);
  });

  it('runs the platform jobs with the operator login and never the application login', () => {
    expect(readWorkerJobs({ WORKER_JOBS: 'platform', OPERATOR_DATABASE_URL: OPERATOR })).toBe('platform');
    expect(() => readWorkerJobs({ WORKER_JOBS: 'platform' })).toThrow(/OPERATOR_DATABASE_URL is required when WORKER_JOBS is platform/);
    expect(() => readWorkerJobs({ WORKER_JOBS: 'platform', OPERATOR_DATABASE_URL: OPERATOR, DATABASE_URL })).toThrow(/DATABASE_URL is refused when WORKER_JOBS is platform/);
  });

  it('refuses any other value', () => {
    expect(() => readWorkerJobs({ WORKER_JOBS: 'both' })).toThrow(WorkerConfigError);
    expect(() => readWorkerJobs({ WORKER_JOBS: 'both' })).toThrow(/WORKER_JOBS is practice or platform/);
  });
});

describe('readPlatformWorkerConfig', () => {
  it('needs pg-boss\'s own login and reads the heartbeat like any worker', () => {
    expect(readPlatformWorkerConfig({ QUEUE_DATABASE_URL: 'postgres://q@localhost/d', NODE_ENV: 'production', WORKER_HEARTBEAT_SECONDS: '60' })).toEqual({
      production: true,
      queueDatabaseUrl: 'postgres://q@localhost/d',
      heartbeatMs: 60_000,
    });
    expect(readPlatformWorkerConfig({ QUEUE_DATABASE_URL: 'postgres://q@localhost/d' })).toMatchObject({ production: false, heartbeatMs: DEFAULT_HEARTBEAT_SECONDS * 1000 });
    expect(() => readPlatformWorkerConfig({})).toThrow(/QUEUE_DATABASE_URL is required when WORKER_JOBS is platform/);
    expect(() => readPlatformWorkerConfig({ QUEUE_DATABASE_URL: 'postgres://q@localhost/d', WORKER_HEARTBEAT_SECONDS: '0' })).toThrow(WorkerConfigError);
  });
});

describe('readPlatformConfig', () => {
  const OPERATOR_DATABASE_URL = 'postgres://operator@localhost:5432/d';
  const RDS = {
    RESTORE_DRILL_MODE: 'rds',
    RESTORE_DRILL_SOURCE_INSTANCE: 'tp-production',
    RESTORE_DRILL_SCRATCH_INSTANCE: 'tp-production-restore-drill',
    RESTORE_DRILL_INSTANCE_CLASS: 'db.t4g.medium',
    RESTORE_DRILL_SUBNET_GROUP: 'tp-data',
    RESTORE_DRILL_SECURITY_GROUPS: 'sg-a, sg-b,',
  };
  const PRODUCTION = {
    NODE_ENV: 'production',
    OPERATOR_DATABASE_URL,
    AUDIT_COPY_BUCKET: 'tp-production-audit-copies',
    AUDIT_COPY_LOCK_MODE: 'COMPLIANCE',
    MAIL_FROM: 'notices@synthetic.test',
    APP_ORIGIN: 'https://app.synthetic.test',
    SUPPORT_MAIL_BUCKET: 'tp-production-support-mail',
    ...RDS,
  };

  it('runs no platform job without an operator connection', () => {
    expect(readPlatformConfig({})).toBeNull();
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL: ' ' })).toBeNull();
  });

  it('copies to a local directory and drills with pg_dump by default in development', () => {
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: '/var/tp/audit', RESTORE_DRILL_WORK_DIR: '/var/tp/drill', PG_BIN_DIR: '/usr/lib/postgresql/18/bin' })).toEqual({
      operatorDatabaseUrl: OPERATOR_DATABASE_URL,
      auditStore: { kind: 'local', dir: '/var/tp/audit' },
      restoreDrill: { kind: 'local', workDir: '/var/tp/drill', binDir: '/usr/lib/postgresql/18/bin', adminUrl: OPERATOR_DATABASE_URL },
      supportInbox: { kind: 'local', dir: expect.stringContaining('tp-support-inbox') },
      mail: { kind: 'local', dir: expect.stringContaining('tp-mail-outbox') },
      appOrigin: 'http://localhost:3000',
    });
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: 'a', RESTORE_DRILL_ADMIN_URL: 'postgres://admin@localhost/d' })?.restoreDrill).toEqual({
      kind: 'local',
      workDir: expect.stringContaining('tp-restore-drill'),
      adminUrl: 'postgres://admin@localhost/d',
    });
  });

  it('copies to S3 Object Lock in the bucket’s own mode, drills on RDS and sends through SES in production', () => {
    expect(readPlatformConfig({ ...PRODUCTION, AUDIT_COPY_KMS_KEY_ID: 'alias/tp-production' })).toEqual({
      operatorDatabaseUrl: OPERATOR_DATABASE_URL,
      auditStore: { kind: 's3', bucket: 'tp-production-audit-copies', lockMode: 'COMPLIANCE', kmsKeyId: 'alias/tp-production' },
      restoreDrill: {
        kind: 'rds',
        sourceInstanceId: 'tp-production',
        scratchInstanceId: 'tp-production-restore-drill',
        instanceClass: 'db.t4g.medium',
        subnetGroupName: 'tp-data',
        securityGroupIds: ['sg-a', 'sg-b'],
      },
      supportInbox: { kind: 's3', bucket: 'tp-production-support-mail' },
      mail: { kind: 'ses', from: 'notices@synthetic.test' },
      appOrigin: 'https://app.synthetic.test',
    });
    expect(readPlatformConfig({ ...PRODUCTION, AUDIT_COPY_LOCK_MODE: 'GOVERNANCE' })?.auditStore).toEqual({ kind: 's3', bucket: 'tp-production-audit-copies', lockMode: 'GOVERNANCE' });
  });

  it('reads support mail from SUPPORT_MAIL_BUCKET or a directory of .eml files (SUPPORT_MAIL_DIR)', () => {
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: 'a', SUPPORT_MAIL_DIR: '/var/tp/inbox' })?.supportInbox).toEqual({ kind: 'local', dir: '/var/tp/inbox' });
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: 'a', SUPPORT_MAIL_BUCKET: 'mail' })?.supportInbox).toEqual({ kind: 's3', bucket: 'mail' });
  });

  it('sends notices through SES from MAIL_FROM or to MAIL_OUTBOX_DIR, linking to APP_ORIGIN', () => {
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: 'a', MAIL_FROM: 'notices@synthetic.test', APP_ORIGIN: 'https://app.synthetic.test/x' })).toMatchObject({
      mail: { kind: 'ses', from: 'notices@synthetic.test' },
      appOrigin: 'https://app.synthetic.test',
    });
    expect(readPlatformConfig({ OPERATOR_DATABASE_URL, AUDIT_COPY_DIR: 'a', MAIL_OUTBOX_DIR: '/var/tp/mail' })?.mail).toEqual({ kind: 'local', dir: '/var/tp/mail' });
  });

  it.each([
    [{ AUDIT_COPY_DIR: 'a', MAIL_FROM: 'n@synthetic.test', MAIL_OUTBOX_DIR: 'm' }, /at most one of MAIL_FROM and MAIL_OUTBOX_DIR/],
    [{ AUDIT_COPY_DIR: 'a', MAIL_FROM: 'not an address' }, /MAIL_FROM is an email address/],
    [{ AUDIT_COPY_DIR: 'a', SUPPORT_MAIL_BUCKET: 'b', SUPPORT_MAIL_DIR: 'd' }, /at most one of SUPPORT_MAIL_BUCKET and SUPPORT_MAIL_DIR/],
    [{ AUDIT_COPY_DIR: 'a', APP_ORIGIN: 'not a url' }, /APP_ORIGIN is the application's URL/],
    [{ AUDIT_COPY_DIR: 'a', AUDIT_COPY_BUCKET: 'b', AUDIT_COPY_LOCK_MODE: 'GOVERNANCE' }, /exactly one of AUDIT_COPY_BUCKET and AUDIT_COPY_DIR/],
    [{}, /exactly one of AUDIT_COPY_BUCKET and AUDIT_COPY_DIR/],
    [{ AUDIT_COPY_BUCKET: 'b' }, /AUDIT_COPY_LOCK_MODE is required when AUDIT_COPY_BUCKET is set/],
    [{ AUDIT_COPY_BUCKET: 'b', AUDIT_COPY_LOCK_MODE: 'compliance' }, /AUDIT_COPY_LOCK_MODE is COMPLIANCE or GOVERNANCE/],
    [{ AUDIT_COPY_DIR: 'a', RESTORE_DRILL_MODE: 'aurora' }, /RESTORE_DRILL_MODE is rds or local/],
    [{ AUDIT_COPY_DIR: 'a', RESTORE_DRILL_MODE: 'rds' }, /RESTORE_DRILL_SOURCE_INSTANCE is required when RESTORE_DRILL_MODE is rds/],
    [{ AUDIT_COPY_DIR: 'a', ...RDS, RESTORE_DRILL_SCRATCH_INSTANCE: '' }, /RESTORE_DRILL_SCRATCH_INSTANCE is required when RESTORE_DRILL_MODE is rds/],
  ])('refuses %j', (env, message) => {
    expect(() => readPlatformConfig({ OPERATOR_DATABASE_URL, ...env })).toThrow(message);
    expect(() => readPlatformConfig({ OPERATOR_DATABASE_URL, ...env })).toThrow(WorkerConfigError);
  });

  it.each([
    ['the local audit store', { AUDIT_COPY_BUCKET: undefined, AUDIT_COPY_DIR: '/var/tp/audit' }, /AUDIT_COPY_DIR is refused when NODE_ENV is production/],
    ['no audit bucket', { AUDIT_COPY_BUCKET: undefined }, /AUDIT_COPY_BUCKET is required when NODE_ENV is production/],
    ['the local mailer', { MAIL_FROM: undefined, MAIL_OUTBOX_DIR: '/var/tp/mail' }, /MAIL_OUTBOX_DIR is refused when NODE_ENV is production/],
    ['no sender', { MAIL_FROM: undefined }, /MAIL_FROM is required when NODE_ENV is production/],
    ['the local support inbox', { SUPPORT_MAIL_BUCKET: undefined, SUPPORT_MAIL_DIR: '/var/tp/inbox' }, /SUPPORT_MAIL_DIR is refused when NODE_ENV is production/],
    ['no support mail bucket', { SUPPORT_MAIL_BUCKET: undefined }, /SUPPORT_MAIL_BUCKET is required when NODE_ENV is production/],
    ['the pg_dump restorer', { RESTORE_DRILL_MODE: 'local' }, /RESTORE_DRILL_MODE is rds when NODE_ENV is production/],
    ['no drill mode', { RESTORE_DRILL_MODE: undefined }, /RESTORE_DRILL_MODE is required when NODE_ENV is production/],
    ['a local drill setting', { RESTORE_DRILL_WORK_DIR: '/tmp/drill' }, /RESTORE_DRILL_WORK_DIR is refused when NODE_ENV is production/],
    ['a local admin login', { RESTORE_DRILL_ADMIN_URL: 'postgres://admin@localhost/d' }, /RESTORE_DRILL_ADMIN_URL is refused when NODE_ENV is production/],
    ['no origin', { APP_ORIGIN: undefined }, /APP_ORIGIN is required when NODE_ENV is production/],
    ['a plain-http origin', { APP_ORIGIN: 'http://app.synthetic.test' }, /APP_ORIGIN is an https URL when NODE_ENV is production/],
  ])('refuses %s in production', (_name, change, message) => {
    expect(() => readPlatformConfig({ ...PRODUCTION, ...change })).toThrow(message);
  });
});

describe('readNotificationConfig', () => {
  it('sends the practices’ digests the way the platform sends its notices, with or without an operator connection', () => {
    expect(readNotificationConfig({})).toEqual({ mail: { kind: 'local', dir: expect.stringMatching(/tp-mail-outbox$/) as unknown }, appOrigin: 'http://localhost:3000' });
    expect(readNotificationConfig({ MAIL_FROM: 'digests@synthetic.test', APP_ORIGIN: 'https://app.synthetic.test/p' })).toEqual({ mail: { kind: 'ses', from: 'digests@synthetic.test' }, appOrigin: 'https://app.synthetic.test' });
    expect(readNotificationConfig({ NODE_ENV: 'production', MAIL_FROM: 'digests@synthetic.test', APP_ORIGIN: 'https://app.synthetic.test' }).mail).toEqual({ kind: 'ses', from: 'digests@synthetic.test' });
  });

  it.each([
    [{ NODE_ENV: 'production', APP_ORIGIN: 'https://app.synthetic.test' }, /MAIL_FROM is required when NODE_ENV is production/],
    [{ NODE_ENV: 'production', MAIL_FROM: 'd@synthetic.test', MAIL_OUTBOX_DIR: '/var/tp/mail', APP_ORIGIN: 'https://app.synthetic.test' }, /MAIL_OUTBOX_DIR is refused when NODE_ENV is production/],
    [{ NODE_ENV: 'production', MAIL_FROM: 'd@synthetic.test', APP_ORIGIN: 'http://app.synthetic.test' }, /APP_ORIGIN is an https URL when NODE_ENV is production/],
    [{ MAIL_FROM: 'd@synthetic.test', MAIL_OUTBOX_DIR: 'm' }, /at most one of MAIL_FROM and MAIL_OUTBOX_DIR/],
  ])('refuses %j', (env, message) => {
    expect(() => readNotificationConfig(env)).toThrow(message);
  });
});

describe('readIntakeConfig', () => {
  it('keeps documents in a temporary directory and opens keys with the development master key by default', () => {
    expect(readIntakeConfig({})).toEqual({
      documents: { kind: 'local', dir: expect.stringContaining('tp-documents') },
      keys: { kind: 'local', masterKey: developmentMasterKey() },
      scanWaitMs: 600_000,
    });
    const given = Buffer.alloc(32, 9).toString('base64');
    expect(readIntakeConfig({ DOCUMENTS_DIR: '/var/tp/documents', TP_LOCAL_MASTER_KEY: given, SCAN_WAIT_SECONDS: '30' })).toEqual({
      documents: { kind: 'local', dir: '/var/tp/documents' },
      keys: { kind: 'local', masterKey: Buffer.alloc(32, 9) },
      scanWaitMs: 30_000,
    });
  });

  it('uses the documents bucket and KMS, and requires both in production', () => {
    expect(readIntakeConfig({ DOCUMENTS_BUCKET: 'tp-documents', TP_KEY_PROVIDER: 'kms', KMS_KEY_ID: 'alias/tp' })).toEqual({
      documents: { kind: 's3', bucket: 'tp-documents' },
      keys: { kind: 'kms', keyId: 'alias/tp' },
      scanWaitMs: 600_000,
    });
    const production = { NODE_ENV: 'production', DOCUMENTS_BUCKET: 'tp-documents', TP_KEY_PROVIDER: 'kms', KMS_KEY_ID: 'alias/tp' };
    expect(readIntakeConfig(production).documents).toEqual({ kind: 's3', bucket: 'tp-documents' });
    expect(() => readIntakeConfig({ ...production, DOCUMENTS_BUCKET: undefined })).toThrow(/DOCUMENTS_BUCKET is required/);
    expect(() => readIntakeConfig({ ...production, TP_KEY_PROVIDER: undefined })).toThrow(/TP_KEY_PROVIDER is required/);
    expect(() => readIntakeConfig({ ...production, TP_KEY_PROVIDER: 'local' })).toThrow(/TP_KEY_PROVIDER is kms when NODE_ENV is production/);
    expect(() => readIntakeConfig({ ...production, DOCUMENTS_DIR: '/tmp/x' })).toThrow(/DOCUMENTS_DIR is refused/);
    expect(() => readIntakeConfig({ ...production, TP_LOCAL_MASTER_KEY: 'x' })).toThrow(/TP_LOCAL_MASTER_KEY is refused/);
  });

  it('refuses settings that contradict each other or are malformed', () => {
    expect(() => readIntakeConfig({ DOCUMENTS_BUCKET: 'b', DOCUMENTS_DIR: '/d' })).toThrow(WorkerConfigError);
    expect(() => readIntakeConfig({ TP_KEY_PROVIDER: 'kms' })).toThrow(/KMS_KEY_ID is required/);
    expect(() => readIntakeConfig({ TP_KEY_PROVIDER: 'vault' })).toThrow(/TP_KEY_PROVIDER is kms or local/);
    expect(() => readIntakeConfig({ TP_LOCAL_MASTER_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/32-byte key/);
    for (const wait of ['0', '-1', '1.5', '100000']) {
      expect(() => readIntakeConfig({ SCAN_WAIT_SECONDS: wait }), wait).toThrow(/SCAN_WAIT_SECONDS/);
    }
  });
});
