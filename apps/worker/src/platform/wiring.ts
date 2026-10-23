import { RDSClient } from '@aws-sdk/client-rds';
import { S3Client } from '@aws-sdk/client-s3';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { SQSClient } from '@aws-sdk/client-sqs';
import { type DatabasePool, openPool } from '@tp/db';

import type { NotificationConfig, PlatformConfig } from '../config';
import type { JobSender } from '../jobs/enqueue';
import { type MailEventsDependencies, type PlatformHandlers, createPlatformHandlers } from '../jobs/platform';
import { type MailSender, configuredMailSender } from '../mail/mail';
import { LocalObjectStore } from '../storage/local-object-store';
import type { ObjectStore } from '../storage/object-store';
import { S3ObjectLockStore } from '../storage/s3-object-lock-store';
import { LocalSupportInbox, S3SupportInbox, type SupportInbox } from '../support/inbox';
import { LocalMailEventSource, MemoryMailControl, SesMailControl, SqsMailEventSource } from './mail-events';
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

/** Email as configured; its HTML's header image is served by the CloudFront static host (STATIC_ASSET_ORIGIN), or left out without one. */
export function mailSender(config: Pick<NotificationConfig, 'mail' | 'staticAssetOrigin'>): MailSender {
  return configuredMailSender(config.mail, config.staticAssetOrigin);
}

/**
 * The mail_events job's sources (docs/adr/0065): the mail-events queue and SES's account and screening set, or, in
 * development, the local sender's events directory and SES's state in memory (the account healthy, the set sending).
 */
export function mailEvents(config: Pick<PlatformConfig, 'mail' | 'mailEvents'>): MailEventsDependencies {
  const events = config.mailEvents;
  const { streamPrefix } = config.mail;
  return events.kind === 'sqs'
    ? {
        source: new SqsMailEventSource({ client: new SQSClient({}), queueUrl: events.queueUrl }),
        control: new SesMailControl({ client: new SESv2Client({}), streamPrefix }),
        streamPrefix,
        probes: events.identitiesVerified,
      }
    : { source: new LocalMailEventSource(events.dir), control: new MemoryMailControl(), streamPrefix, probes: events.identitiesVerified };
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
      mailEvents: mailEvents(config),
      appOrigin: config.appOrigin,
      ...(queue === undefined ? {} : { queue }),
    }),
  };
}
