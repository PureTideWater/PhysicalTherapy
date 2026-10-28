import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUDIT_COPY_BUCKET_ACTIONS, AUDIT_COPY_OBJECT_ACTIONS, MAIL_EVENTS_QUEUE_ACTIONS, MAIL_RECONCILE_SET_ACTIONS, RESTORE_DRILL_INSTANCE_ACTIONS } from '../lib/constructs/operator-role';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { MAIL_SIMULATOR_RECIPIENTS, MAIL_STREAMS } from '../lib/mail';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnStatement, actionsOf, getAtt, keyId, logicalIdOf, propertiesOf, resourceById, roleStatements, synthesized } from './synth';

/**
 * The platform jobs' role (docs/adr/0014; PRD 16 Backups and restore: "a monthly restore of the
 * latest snapshot to a scratch instance"; PRD 6 Audit log: "nightly copy to write-once storage";
 * PRD 5 J15): what the audit copy, the restore drill and the support notices need, each on its own
 * resource, and nothing of the application's or the owner's.
 */

/** The S3 commands the audit copy's store sends (apps/worker/src/storage/s3-object-lock-store.ts) and the IAM actions each needs. */
const STORE_COMMAND_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  HeadObjectCommand: ['s3:GetObject', 's3:GetObjectRetention', 's3:ListBucket'],
  PutObjectCommand: ['s3:PutObject', 's3:PutObjectRetention'],
};

/** The RDS commands the restore drill sends (apps/worker/src/platform/rds-restorer.ts) and their IAM actions. */
const RESTORER_COMMAND_ACTIONS: Readonly<Record<string, string>> = {
  DescribeDBSnapshotsCommand: 'rds:DescribeDBSnapshots',
  RestoreDBInstanceFromDBSnapshotCommand: 'rds:RestoreDBInstanceFromDBSnapshot',
  DescribeDBInstancesCommand: 'rds:DescribeDBInstances',
  ModifyDBInstanceCommand: 'rds:ModifyDBInstance',
  DeleteDBInstanceCommand: 'rds:DeleteDBInstance',
};

function commandsSent(file: string): string[] {
  const source = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src', file), 'utf8');
  return [...new Set([...source.matchAll(/new (\w+Command)\(/g)].map((match) => match[1] ?? ''))].sort();
}

describe('the operator role’s actions match what the worker sends', () => {
  it('covers every S3 command of the audit copy’s store', () => {
    const sent = commandsSent('storage/s3-object-lock-store.ts');
    expect(sent).toEqual(Object.keys(STORE_COMMAND_ACTIONS).sort());
    expect([...AUDIT_COPY_OBJECT_ACTIONS, ...AUDIT_COPY_BUCKET_ACTIONS].sort()).toEqual([...new Set(Object.values(STORE_COMMAND_ACTIONS).flat())].sort());
  });

  it('covers every RDS command of the restore drill', () => {
    const sent = commandsSent('platform/rds-restorer.ts');
    expect(sent).toEqual(Object.keys(RESTORER_COMMAND_ACTIONS).sort());
    // Tags on the restore need AddTagsToResource on the scratch instance too.
    expect([...RESTORE_DRILL_INSTANCE_ACTIONS].sort()).toEqual([...Object.values(RESTORER_COMMAND_ACTIONS).filter((action) => action !== 'rds:DescribeDBSnapshots'), 'rds:AddTagsToResource'].sort());
  });
});

describe.each(ENVIRONMENTS)('%s: operator role', (environment) => {
  const { stack, template } = synthesized(environment);
  const roleId = logicalIdOf(stack, stack.operator.role);
  const statements = roleStatements(template, roleId);
  const bySid = (sid: string) => statements.find((statement) => statement.Sid === sid) as CfnStatement;
  const environmentKey = getAtt(keyId(template), 'Arn');
  const text = JSON.stringify(statements);

  it('is assumed by ECS tasks of this account only', () => {
    expect(propertiesOf(resourceById(template, 'AWS::IAM::Role', roleId)).AssumeRolePolicyDocument).toEqual({
      Version: '2012-10-17',
      Statement: [{ Action: 'sts:AssumeRole', Effect: 'Allow', Principal: { Service: 'ecs-tasks.amazonaws.com' }, Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } } }],
    });
  });

  it('reads the operator login, never the owner or application login', () => {
    expect(bySid('OperatorLogin').Resource).toEqual({ Ref: logicalIdOf(stack, stack.database.operatorSecret) });
    expect(JSON.stringify(bySid('OperatorLoginDecrypt').Condition)).toContain(logicalIdOf(stack, stack.database.operatorSecret));
    expect(text).not.toContain(logicalIdOf(stack, stack.database.ownerSecret));
    expect(text).not.toContain(logicalIdOf(stack, stack.database.appSecret));
  });

  it('writes the audit copies once with their retention and reads them back, and touches no other bucket', () => {
    const audit = logicalIdOf(stack, stack.storage.auditCopies);
    expect(actionsOf(bySid('AuditCopyObjects')).sort()).toEqual([...AUDIT_COPY_OBJECT_ACTIONS].sort());
    expect(JSON.stringify(bySid('AuditCopyObjects').Resource)).toContain(audit);
    expect(actionsOf(bySid('AuditCopyBucket'))).toEqual([...AUDIT_COPY_BUCKET_ACTIONS]);
    expect(bySid('AuditCopyBucket').Resource).toEqual(getAtt(audit, 'Arn'));
    expect(JSON.stringify(bySid('AuditCopyEncryptionThroughS3').Condition)).toContain(audit);
    for (const other of [stack.storage.documents, stack.storage.packets, stack.accountSecurity.trailBucket]) {
      expect(text).not.toContain(logicalIdOf(stack, other));
    }
    expect(statements.flatMap(actionsOf).filter((action) => /Delete(Object|Bucket)|LegalHold|Bypass|PutBucket|\*/.test(action))).toEqual([]);
  });

  it('restores, changes, waits for and deletes only the one scratch instance, from the source’s own snapshots', () => {
    const scratch = JSON.stringify(bySid('RestoreDrillScratchInstance').Resource);
    expect(scratch).toContain(`:db:tp-${environment}-restore-drill`);
    expect(actionsOf(bySid('RestoreDrillScratchInstance')).sort()).toEqual([...RESTORE_DRILL_INSTANCE_ACTIONS].sort());
    const source = logicalIdOf(stack, stack.database.instance);
    expect(JSON.stringify(bySid('RestoreDrillSnapshots').Resource)).toContain(source);
    expect(JSON.stringify(bySid('RestoreDrillSnapshots').Resource)).toContain(':snapshot:rds:');
    expect(JSON.stringify(bySid('RestoreDrillRestore').Resource)).toContain(':snapshot:rds:');
    // No RDS action reaches the production instance itself except describing its snapshots.
    const rdsStatements = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('rds:')));
    for (const statement of rdsStatements.filter((candidate) => candidate.Sid !== 'RestoreDrillSnapshots')) {
      expect(JSON.stringify(statement.Resource), statement.Sid).not.toContain(`:db:",{"Ref":"${source}"`);
    }
  });

  it('lets RDS use the key for the encrypted snapshot only through RDS, for AWS resources', () => {
    expect(bySid('RestoreDrillKeyGrant')).toMatchObject({
      Action: 'kms:CreateGrant',
      Resource: environmentKey,
      Condition: { Bool: { 'kms:GrantIsForAWSResource': 'true' }, StringEquals: { 'kms:ViaService': { 'Fn::Join': ['', ['rds.', { Ref: 'AWS::Region' }, '.amazonaws.com']] } } },
    });
    for (const statement of statements.filter((candidate) => actionsOf(candidate).some((action) => action.startsWith('kms:')))) {
      expect(statement.Condition, statement.Sid).toBeDefined();
      expect(statement.Resource, statement.Sid).toEqual(environmentKey);
    }
  });

  it('sends the notices only through MailFromAddress\'s identity and the notices set, from MailFromAddress (docs/adr/0065)', () => {
    const notices = bySid('NoticeEmail');
    expect(notices).toMatchObject({ Action: 'ses:SendEmail', Condition: { StringEquals: { 'ses:FromAddress': { Ref: PARAMETER_NAMES.mailFromAddress } } } });
    const resource = JSON.stringify(notices.Resource);
    expect(resource).toContain(logicalIdOf(stack, stack.mailStreams.mailIdentity));
    expect(resource).toContain(`configuration-set/tp-${environment}-notices`);
    for (const other of ['transactional', 'screening']) {
      expect(resource).not.toContain(`tp-${environment}-${other}`);
    }
    expect(JSON.stringify(statements)).not.toContain('identity/*');
    expect(statements.every((statement) => statement.Effect === 'Allow')).toBe(true);
  });

  it('sends probes through every set and both identities to the mailbox simulator alone, never without named recipients, from the two senders alone', () => {
    const probes = bySid('MailProbes');
    expect(probes.Action).toBe('ses:SendEmail');
    expect(probes.Condition?.['ForAllValues:StringEquals']).toEqual({ 'ses:Recipients': [...MAIL_SIMULATOR_RECIPIENTS] });
    // ForAllValues holds for a request that carries no recipients at all: the key must be present (review S5).
    expect(probes.Condition?.Null).toEqual({ 'ses:Recipients': 'false' });
    expect(MAIL_SIMULATOR_RECIPIENTS.every((address) => address.endsWith('@simulator.amazonses.com'))).toBe(true);
    expect(JSON.stringify(probes.Condition?.StringEquals)).toContain(PARAMETER_NAMES.mailFromAddress);
    expect(JSON.stringify(probes.Condition?.StringEquals)).toContain('results@screening.');
    const resource = JSON.stringify(probes.Resource);
    for (const stream of MAIL_STREAMS) {
      expect(resource).toContain(`configuration-set/tp-${environment}-${stream}`);
    }
    expect(resource).toContain(logicalIdOf(stack, stack.mailStreams.screeningIdentity));
  });

  it('switches and reads the screening set\'s sending alone, reads the account and both identities, and drains the event queue through SQS (D5)', () => {
    expect(bySid('MailReconcileScreeningSet')).toMatchObject({
      Action: [...MAIL_RECONCILE_SET_ACTIONS],
      Resource: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ses:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, `:configuration-set/tp-${environment}-screening`]] },
    });
    expect(bySid('MailAccountRead')).toEqual({ Sid: 'MailAccountRead', Effect: 'Allow', Action: 'ses:GetAccount', Resource: '*' });
    expect(bySid('MailIdentitiesRead').Action).toBe('ses:GetEmailIdentity');
    expect(bySid('MailEventsQueue')).toMatchObject({ Action: [...MAIL_EVENTS_QUEUE_ACTIONS], Resource: getAtt(logicalIdOf(stack, stack.mailStreams.queue), 'Arn') });
    expect(bySid('MailEventsDecryptThroughSqs')).toMatchObject({
      Action: 'kms:Decrypt',
      Resource: environmentKey,
      Condition: { StringEquals: { 'kms:ViaService': { 'Fn::Join': ['', ['sqs.', { Ref: 'AWS::Region' }, '.amazonaws.com']] } } },
    });
    // GetAccount is the one action that takes no resource.
    expect(statements.filter((statement) => statement.Resource === '*').map((statement) => statement.Sid)).toEqual(['MailAccountRead']);
  });
});

describe('the operator role\'s mail actions match what the mail_events job calls', () => {
  it('covers every SES control command and SQS command the job makes', () => {
    const job = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/platform/mail-events.ts'), 'utf8');
    const commands = [...new Set([...job.matchAll(/new (\w+)Command\(/g)].map((match) => match[1] ?? ''))].sort();
    const granted = [...MAIL_RECONCILE_SET_ACTIONS, ...MAIL_EVENTS_QUEUE_ACTIONS, 'ses:GetAccount', 'ses:GetEmailIdentity'].map((action) => action.split(':')[1]);
    for (const command of commands) {
      // A batch call is authorized as its single action (DeleteMessageBatch as DeleteMessage).
      expect(granted, command).toContain(command.replace(/Batch$/, ''));
    }
  });
});
