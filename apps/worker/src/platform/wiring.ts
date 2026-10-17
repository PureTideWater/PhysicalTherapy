import { RDSClient } from '@aws-sdk/client-rds';
import { S3Client } from '@aws-sdk/client-s3';
import { type DatabasePool, openPool } from '@tp/db';

import type { NotificationConfig, PlatformConfig } from '../config';
import type { JobSender } from '../jobs/enqueue';
import { type PlatformHandlers, createPlatformHandlers } from '../jobs/platform';
import { LocalMailSender, type MailSender, sesMailSender } from '../mail/mail';
import { LocalObjectStore } from '../storage/local-object-store';
import type { ObjectStore } from '../storage/object-store';
import { S3ObjectLockStore } from '../storage/s3-object-lock-store';
import { LocalSupportInbox, S3SupportInbox, type SupportInbox } from '../support/inbox';
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
    return new PgDumpRestorer({ sourceUrl: drill.adminUrl, adminUrl: drill.adminUrl, workDir: drill.workDir, ...(drill.binDir === undefined ? {} : { binDir: drill.binDir }) });
  }
  return new RdsSnapshotRestorer({
    client: new RDSClient({}),
    sourceInstanceId: drill.sourceInstanceId,
    scratchInstanceId: drill.scratchInstanceId,
    instanceClass: drill.instanceClass,
    subnetGroupName: drill.subnetGroupName,
    securityGroupIds: drill.securityGroupIds,
  });
}

export function supportInbox(config: Pick<PlatformConfig, 'supportInbox'>): SupportInbox {
  const inbox = config.supportInbox;
  return inbox.kind === 's3' ? new S3SupportInbox({ client: new S3Client({}), bucket: inbox.bucket }) : new LocalSupportInbox(inbox.dir);
}

/** Email as configured; its HTML's header image is served by the application it links to (APP_ORIGIN). */
export function mailSender(config: Pick<NotificationConfig, 'mail' | 'appOrigin'>): MailSender {
  return config.mail.kind === 'ses' ? sesMailSender(config.mail.from, config.appOrigin) : new LocalMailSender(config.mail.dir, config.appOrigin);
}

/** The platform handlers and the operator pool they use (closed by the caller on shutdown); the queue takes the monitoring schedule's jobs. */
export function platformRuntime(config: PlatformConfig, queue?: JobSender): { handlers: PlatformHandlers; operator: DatabasePool } {
  const operator = openPool(config.operatorDatabaseUrl, 2);
  return {
    operator,
    handlers: createPlatformHandlers({
      operator,
      store: auditStore(config),
      restorer: snapshotRestorer(config),
      mail: mailSender(config),
      inbox: supportInbox(config),
      appOrigin: config.appOrigin,
      ...(queue === undefined ? {} : { queue }),
    }),
  };
}
