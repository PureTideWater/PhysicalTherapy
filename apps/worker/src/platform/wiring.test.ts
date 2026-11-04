import { describe, expect, it } from 'vitest';

import type { PlatformConfig } from '../config';
import { LocalObjectStore } from '../storage/local-object-store';
import { S3ObjectLockStore } from '../storage/s3-object-lock-store';
import { PgDumpRestorer } from './pg-dump-restorer';
import { RdsSnapshotRestorer } from './rds-restorer';
import { LocalMailSender, SesMailSender } from '../mail/mail';
import { LocalSupportInbox, S3SupportInbox } from '../support/inbox';
import { LocalMailEventSource, MemoryMailControl, SesMailControl, SqsMailEventSource } from './mail-events';
import { auditStore, mailEvents, mailSender, platformRuntime, snapshotRestorer, supportInbox } from './wiring';

const local: PlatformConfig = {
  operatorDatabaseUrl: 'postgres://operator:synthetic@localhost:5432/tp',
  auditStore: { kind: 'local', dir: '/tmp/tp-audit' },
  restoreDrill: { kind: 'local', workDir: '/tmp/tp-drill', binDir: '/usr/lib/postgresql/18/bin', adminUrl: 'postgres://admin:synthetic@localhost:5432/tp' },
  supportInbox: { kind: 'local', dir: '/tmp/tp-support-inbox' },
  mail: { kind: 'local', dir: '/tmp/tp-mail', eventsDir: '/tmp/tp-mail-events', streamPrefix: 'tp-dev' },
  appOrigin: 'http://localhost:3000',
  staticAssetOrigin: null,
  mailEvents: { kind: 'local', dir: '/tmp/tp-mail-events', identitiesVerified: true },
};

const deployed: PlatformConfig = {
  operatorDatabaseUrl: 'postgres://operator:synthetic@db.internal:5432/tp',
  auditStore: { kind: 's3', bucket: 'audit-copies', lockMode: 'COMPLIANCE', kmsKeyId: 'alias/tp' },
  restoreDrill: {
    kind: 'rds',
    sourceInstanceId: 'tp-production',
    scratchInstanceId: 'tp-restore-drill',
    instanceClass: 'db.t4g.medium',
    subnetGroupName: 'tp-data',
    securityGroupIds: ['sg-a'],
  },
  supportInbox: { kind: 's3', bucket: 'support-mail' },
  mail: { kind: 'ses', from: 'notices@synthetic.test', screening: { from: 'results@screening.synthetic.test', replyTo: 'support@synthetic.test' }, streamPrefix: 'tp-production' },
  appOrigin: 'https://app.synthetic.test',
  staticAssetOrigin: 'https://static.synthetic.test',
  mailEvents: { kind: 'sqs', queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/tp-production-mail-events', identitiesVerified: false },
};

describe('platform wiring', () => {
  it('uses the file system and pg_dump in development', () => {
    expect(auditStore(local)).toBeInstanceOf(LocalObjectStore);
    const restorer = snapshotRestorer(local);
    expect(restorer).toBeInstanceOf(PgDumpRestorer);
    // The local drill dumps and restores with the admin login, never with the operator role.
    expect((restorer as unknown as { options: { sourceUrl: string; adminUrl: string } }).options).toMatchObject({
      sourceUrl: 'postgres://admin:synthetic@localhost:5432/tp',
      adminUrl: 'postgres://admin:synthetic@localhost:5432/tp',
    });
    expect(snapshotRestorer({ ...local, restoreDrill: { kind: 'local', workDir: '/tmp/x', adminUrl: 'postgres://a@localhost/tp' } })).toBeInstanceOf(PgDumpRestorer);
  });

  it('uses S3 Object Lock and RDS when deployed, with no database password in the configuration', () => {
    expect(auditStore(deployed)).toBeInstanceOf(S3ObjectLockStore);
    expect(auditStore({ ...deployed, auditStore: { kind: 's3', bucket: 'b', lockMode: 'GOVERNANCE' } })).toBeInstanceOf(S3ObjectLockStore);
    const restorer = snapshotRestorer(deployed);
    expect(restorer).toBeInstanceOf(RdsSnapshotRestorer);
    const { client: _client, ...options } = (restorer as unknown as { options: { client: unknown } & Record<string, unknown> }).options;
    expect(options).toEqual({ sourceInstanceId: 'tp-production', scratchInstanceId: 'tp-restore-drill', instanceClass: 'db.t4g.medium', subnetGroupName: 'tp-data', securityGroupIds: ['sg-a'] });
  });

  it('sends notices through SES when deployed and to a local outbox in development, their art from the static host when there is one', () => {
    const ses = mailSender(deployed);
    expect(ses).toBeInstanceOf(SesMailSender);
    const { client: _client, ...options } = (ses as unknown as { options: { client: unknown } & Record<string, unknown> }).options;
    // Each stream's sender: MAIL_FROM on the customer streams, the screening's own with Reply-To the support address (Q12).
    expect(options).toEqual({
      staticOrigin: 'https://static.synthetic.test',
      streamPrefix: 'tp-production',
      senders: {
        transactional: { from: 'notices@synthetic.test' },
        notices: { from: 'notices@synthetic.test' },
        screening: { from: 'results@screening.synthetic.test', replyTo: 'support@synthetic.test' },
      },
    });
    const outbox = mailSender(local);
    expect(outbox).toBeInstanceOf(LocalMailSender);
    expect((outbox as unknown as { staticOrigin: string | null }).staticOrigin).toBeNull();
    expect((outbox as unknown as { options: unknown }).options).toEqual({ eventsDir: '/tmp/tp-mail-events', streamPrefix: 'tp-dev' });
  });

  it('reads SES’s events from the mail-events queue and controls only the screening’s set when deployed, and the local events directory in development', () => {
    const deployedEvents = mailEvents(deployed);
    expect(deployedEvents.source).toBeInstanceOf(SqsMailEventSource);
    expect(deployedEvents.control).toBeInstanceOf(SesMailControl);
    // Phase 1: the identities are not verified yet, so no probe goes.
    expect(deployedEvents).toMatchObject({ streamPrefix: 'tp-production', probes: false });
    const localEvents = mailEvents(local);
    expect(localEvents.source).toBeInstanceOf(LocalMailEventSource);
    expect(localEvents.control).toBeInstanceOf(MemoryMailControl);
    expect(localEvents).toMatchObject({ streamPrefix: 'tp-dev', probes: true });
  });

  it('reads support mail from the bucket SES writes it to when deployed, verifying senders, and from a directory in development', () => {
    const deployedInbox = supportInbox(deployed);
    expect(deployedInbox).toBeInstanceOf(S3SupportInbox);
    expect(deployedInbox.verifiesSenders).toBe(true);
    const localInbox = supportInbox(local);
    expect(localInbox).toBeInstanceOf(LocalSupportInbox);
    expect(localInbox.verifiesSenders).toBe(false);
  });

  it('builds every handler over one small operator pool', async () => {
    const runtime = platformRuntime(local);
    expect(Object.keys(runtime.handlers).sort()).toEqual([
      'audit_copy',
      'billing_dunning',
      'dunning_notices',
      'mail_events',
      'mail_expiry',
      'monitoring_schedule',
      'restore_drill',
      // The screening's pricing is the consumer's since PR 6b-3 (jobs/screening.ts); its expiry stays here.
      'screening_expiry',
      'support_grant_notices',
      'support_mail',
      'usage_snapshot',
    ]);
    expect(runtime.operator.options.max).toBe(2);
    await runtime.operator.end();
    // With the queue, the monitoring schedule queues each practice's jobs; without it, it refuses (platform.test.ts).
    const queued = platformRuntime(local, { send: () => Promise.resolve('job') });
    expect(Object.keys(queued.handlers)).toContain('monitoring_schedule');
    await queued.operator.end();
  });
});
