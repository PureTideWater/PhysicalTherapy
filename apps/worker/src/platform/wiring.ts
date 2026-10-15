import { RDSClient } from '@aws-sdk/client-rds';
import { S3Client } from '@aws-sdk/client-s3';
import { type DatabasePool, openPool } from '@tp/db';

import type { PlatformConfig } from '../config';
import { type PlatformHandlers, createPlatformHandlers } from '../jobs/platform';
import { LocalMailSender, type MailSender, sesMailSender } from '../mail/mail';
import { LocalObjectStore } from '../storage/local-object-store';
import type { ObjectStore } from '../storage/object-store';
import { S3ObjectLockStore } from '../storage/s3-object-lock-store';
import { PgDumpRestorer } from './pg-dump-restorer';
import { RdsSnapshotRestorer } from './rds-restorer';
import type { SnapshotRestorer } from './restore-drill';

export function auditStore(config: PlatformConfig): ObjectStore {
  const store = config.auditStore;
  return store.kind === 's3'
    ? new S3ObjectLockStore({ client: new S3Client({}), bucket: store.bucket, lockMode: store.lockMode, ...(store.kmsKeyId === undefined ? {} : { kmsKeyId: store.kmsKeyId }) })
    : new LocalObjectStore(store.dir);
}

export function snapshotRestorer(config: PlatformConfig): SnapshotRestorer {
  const drill = config.restoreDrill;
  if (drill.kind === 'local') {
    return new PgDumpRestorer({ sourceUrl: config.operatorDatabaseUrl, adminUrl: config.operatorDatabaseUrl, workDir: drill.workDir, ...(drill.binDir === undefined ? {} : { binDir: drill.binDir }) });
  }
  return new RdsSnapshotRestorer({
    client: new RDSClient({}),
    sourceInstanceId: drill.sourceInstanceId,
    scratchInstanceId: drill.scratchInstanceId,
    instanceClass: drill.instanceClass,
    subnetGroupName: drill.subnetGroupName,
    securityGroupIds: drill.securityGroupIds,
    databaseUrl: ({ address, port }) => {
      const url = new URL(`postgres://${address}:${String(port)}/`);
      url.username = drill.databaseUser;
      url.password = drill.databasePassword;
      url.pathname = `/${drill.databaseName}`;
      url.searchParams.set('sslmode', 'require');
      return url.toString();
    },
  });
}

export function mailSender(config: PlatformConfig): MailSender {
  return config.mail.kind === 'ses' ? sesMailSender(config.mail.from) : new LocalMailSender(config.mail.dir);
}

/** The platform handlers and the operator pool they use (closed by the caller on shutdown). */
export function platformRuntime(config: PlatformConfig): { handlers: PlatformHandlers; operator: DatabasePool } {
  const operator = openPool(config.operatorDatabaseUrl, 2);
  return {
    operator,
    handlers: createPlatformHandlers({ operator, store: auditStore(config), restorer: snapshotRestorer(config), mail: mailSender(config), appOrigin: config.appOrigin }),
  };
}
