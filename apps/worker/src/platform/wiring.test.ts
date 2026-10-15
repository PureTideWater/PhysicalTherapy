import { describe, expect, it } from 'vitest';

import type { PlatformConfig } from '../config';
import { LocalObjectStore } from '../storage/local-object-store';
import { S3ObjectLockStore } from '../storage/s3-object-lock-store';
import { PgDumpRestorer } from './pg-dump-restorer';
import { RdsSnapshotRestorer } from './rds-restorer';
import { LocalMailSender, SesMailSender } from '../mail/mail';
import { auditStore, mailSender, platformRuntime, snapshotRestorer } from './wiring';

const local: PlatformConfig = {
  operatorDatabaseUrl: 'postgres://owner:synthetic@localhost:5432/tp',
  auditStore: { kind: 'local', dir: '/tmp/tp-audit' },
  restoreDrill: { kind: 'local', workDir: '/tmp/tp-drill', binDir: '/usr/lib/postgresql/18/bin' },
  mail: { kind: 'local', dir: '/tmp/tp-mail' },
  appOrigin: 'http://localhost:3000',
};

const deployed: PlatformConfig = {
  operatorDatabaseUrl: 'postgres://owner:synthetic@db.internal:5432/tp',
  auditStore: { kind: 's3', bucket: 'audit-copies', lockMode: 'COMPLIANCE', kmsKeyId: 'alias/tp' },
  restoreDrill: {
    kind: 'rds',
    sourceInstanceId: 'tp-production',
    scratchInstanceId: 'tp-restore-drill',
    instanceClass: 'db.t4g.medium',
    subnetGroupName: 'tp-data',
    securityGroupIds: ['sg-a'],
    databaseUser: 'tp_owner_login',
    databasePassword: 'p@ss/word',
    databaseName: 'tp',
  },
  mail: { kind: 'ses', from: 'notices@synthetic.test' },
  appOrigin: 'https://app.synthetic.test',
};

describe('platform wiring', () => {
  it('uses the file system and pg_dump in development', () => {
    expect(auditStore(local)).toBeInstanceOf(LocalObjectStore);
    expect(snapshotRestorer(local)).toBeInstanceOf(PgDumpRestorer);
    expect(snapshotRestorer({ ...local, restoreDrill: { kind: 'local', workDir: '/tmp/x' } })).toBeInstanceOf(PgDumpRestorer);
  });

  it('uses S3 Object Lock and RDS when deployed, reaching the scratch instance over TLS', () => {
    expect(auditStore(deployed)).toBeInstanceOf(S3ObjectLockStore);
    expect(auditStore({ ...deployed, auditStore: { kind: 's3', bucket: 'b', lockMode: 'GOVERNANCE' } })).toBeInstanceOf(S3ObjectLockStore);
    const restorer = snapshotRestorer(deployed);
    expect(restorer).toBeInstanceOf(RdsSnapshotRestorer);
    const url = (restorer as unknown as { options: { databaseUrl: (endpoint: { address: string; port: number }) => string } }).options.databaseUrl({ address: 'drill.internal', port: 5432 });
    const parsed = new URL(url);
    expect([parsed.hostname, parsed.port, parsed.pathname, decodeURIComponent(parsed.username), decodeURIComponent(parsed.password), parsed.searchParams.get('sslmode')]).toEqual([
      'drill.internal',
      '5432',
      '/tp',
      'tp_owner_login',
      'p@ss/word',
      'require',
    ]);
  });

  it('sends notices through SES when deployed and to a local outbox in development', () => {
    expect(mailSender(deployed)).toBeInstanceOf(SesMailSender);
    expect(mailSender(local)).toBeInstanceOf(LocalMailSender);
  });

  it('builds every handler over one small operator pool', async () => {
    const runtime = platformRuntime(local);
    expect(Object.keys(runtime.handlers).sort()).toEqual(['audit_copy', 'restore_drill', 'support_grant_notices']);
    expect(runtime.operator.options.max).toBe(2);
    await runtime.operator.end();
  });
});
