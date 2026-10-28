import { Stack, aws_iam as iam, type aws_kms as kms, type aws_rds as rds, type aws_s3 as s3, type aws_secretsmanager as secretsmanager, type aws_sqs as sqs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { MAIL_SIMULATOR_RECIPIENTS, type MailStream } from '../mail';
import { SUPPORT_MAIL_PREFIX } from './support-mail';

/**
 * The SES control calls the platform's mail_events job makes (apps/worker/src/platform/mail-events.ts; D5): the
 * account's enforcement status, and the screening set's sending read and switched. The switch is granted on the
 * screening set alone, so nothing the platform does can pause the transactional or notices streams.
 */
export const MAIL_RECONCILE_SET_ACTIONS = ['ses:GetConfigurationSet', 'ses:PutConfigurationSetSendingOptions'] as const;

/** The SQS calls the mail_events job makes on the event queue (batch calls are authorized as these). */
export const MAIL_EVENTS_QUEUE_ACTIONS = ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility', 'sqs:GetQueueAttributes'] as const;

/** What the platform's mail needs: the senders, the two identities, the three sets and the event queue (MailStreams). */
export interface OperatorMail {
  readonly mailFromAddress: string;
  readonly screeningMailFromAddress: string;
  readonly mailIdentityArn: string;
  readonly screeningIdentityArn: string;
  readonly configurationSetArns: Readonly<Record<MailStream, string>>;
  readonly eventsQueue: sqs.IQueue;
}

/**
 * The S3 actions the nightly audit copy sends to the audit-copies bucket (apps/worker/src/storage/
 * s3-object-lock-store.ts): HEAD and read back (GetObject, and ListBucket so a missing key answers 404
 * rather than 403), the write-once PUT with its retention date (PutObject, PutObjectRetention), and
 * the retention read on HEAD (GetObjectRetention). Never a delete, a legal hold or a governance bypass.
 */
export const AUDIT_COPY_OBJECT_ACTIONS = ['s3:GetObject', 's3:GetObjectRetention', 's3:PutObject', 's3:PutObjectRetention'] as const;
export const AUDIT_COPY_BUCKET_ACTIONS = ['s3:ListBucket'] as const;

/** The RDS calls the restore drill makes on its scratch instance (apps/worker/src/platform/rds-restorer.ts). */
export const RESTORE_DRILL_INSTANCE_ACTIONS = [
  'rds:AddTagsToResource',
  'rds:DeleteDBInstance',
  'rds:DescribeDBInstances',
  'rds:ModifyDBInstance',
  'rds:RestoreDBInstanceFromDBSnapshot',
] as const;

export interface OperatorRoleProps {
  readonly key: kms.IKey;
  readonly auditCopies: s3.IBucket;
  /** The tp_operator login (docs/adr/0014); the owner login stays with migrations. */
  readonly operatorSecret: secretsmanager.ISecret;
  readonly database: rds.IDatabaseInstance;
  readonly restoreDrillInstanceId: string;
  /** The support inbox SES writes mail to (SupportMail). */
  readonly supportMail: s3.IBucket;
  readonly mail: OperatorMail;
}

/** The S3 calls the support_mail job makes on the support inbox (apps/worker/src/support/inbox.ts): list and read. */
export const SUPPORT_MAIL_OBJECT_ACTIONS = ['s3:GetObject'] as const;
export const SUPPORT_MAIL_BUCKET_ACTIONS = ['s3:ListBucket'] as const;

/**
 * The task role of the platform jobs (the worker with WORKER_JOBS=platform and OPERATOR_DATABASE_URL, the
 * platform service in Compute; docs/adr/0049): the nightly audit copy, the monthly restore drill, the
 * support-access notices and the monitoring schedule (docs/adr/0014, 0017 and 0039). Every permission
 * names its resource.
 *
 * - The operator login's secret (tp_operator: reads the audit log, writes the drill's evidence, calls
 *   the notice functions; owns nothing). Not the owner login, and not the application login.
 * - The audit copies: write once with Object Lock retention and read back; KMS through S3 for that
 *   bucket only.
 * - The restore drill: describe the source instance's automated snapshots, restore the newest to the
 *   one scratch instance, give it a one-time master password, wait for it and delete it, all on that
 *   instance's ARN; KMS grants for the encrypted snapshot only through RDS and only for AWS resources.
 * - SES (docs/adr/0065): the support-access and dunning notices through the notices stream's set and MailFromAddress's
 *   identity, from MailFromAddress alone; the daily probes through every set and both identities, to the mailbox
 *   simulator's two addresses alone (`ses:Recipients`, which must be present); the account's status and both identities read; and the
 *   screening set's sending read and switched, on that set alone (the cut-off pauses only the screening stream). No
 *   statement names `identity/*`.
 * - The mail events queue (D4): receive, delete, extend and count its messages, and decrypt them through SQS alone.
 * - The support inbox (docs/adr/0055): list and read the mail SES wrote under `inbound/`, KMS through S3
 *   for that bucket only; never a write or a delete (its lifecycle rule expires each message).
 */
export class OperatorRole extends Construct {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: OperatorRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const rdsArn = (resource: string) => `arn:${stack.partition}:rds:${stack.region}:${stack.account}:${resource}`;
    const scratch = rdsArn(`db:${props.restoreDrillInstanceId}`);
    const sourceSnapshots = rdsArn(`snapshot:rds:${props.database.instanceIdentifier}-*`);

    this.role = new iam.Role(this, 'Role', {
      description: 'Platform jobs: audit copy, restore drill, notices, mail events, support mail (tp_operator login)',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
      }),
    });

    const statements = [
      new iam.PolicyStatement({
        sid: 'OperatorLogin',
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [props.operatorSecret.secretArn],
      }),
      new iam.PolicyStatement({
        sid: 'OperatorLoginDecrypt',
        actions: ['kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${stack.region}.amazonaws.com`,
            'kms:EncryptionContext:SecretARN': props.operatorSecret.secretArn,
          },
        },
      }),
      new iam.PolicyStatement({
        sid: 'AuditCopyObjects',
        actions: [...AUDIT_COPY_OBJECT_ACTIONS],
        resources: [props.auditCopies.arnForObjects('*')],
      }),
      new iam.PolicyStatement({
        sid: 'AuditCopyBucket',
        actions: [...AUDIT_COPY_BUCKET_ACTIONS],
        resources: [props.auditCopies.bucketArn],
      }),
      new iam.PolicyStatement({
        sid: 'AuditCopyEncryptionThroughS3',
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${stack.region}.amazonaws.com` },
          ArnLike: { 'kms:EncryptionContext:aws:s3:arn': [props.auditCopies.bucketArn, props.auditCopies.arnForObjects('*')] },
        },
      }),
      new iam.PolicyStatement({
        sid: 'RestoreDrillSnapshots',
        actions: ['rds:DescribeDBSnapshots'],
        resources: [rdsArn(`db:${props.database.instanceIdentifier}`), sourceSnapshots],
      }),
      new iam.PolicyStatement({
        sid: 'RestoreDrillRestore',
        actions: ['rds:RestoreDBInstanceFromDBSnapshot'],
        resources: [sourceSnapshots, rdsArn('subgrp:*'), rdsArn('og:*'), rdsArn('pg:*')],
      }),
      new iam.PolicyStatement({
        sid: 'RestoreDrillScratchInstance',
        actions: [...RESTORE_DRILL_INSTANCE_ACTIONS],
        resources: [scratch],
      }),
      new iam.PolicyStatement({
        sid: 'RestoreDrillKeyGrant',
        actions: ['kms:CreateGrant'],
        resources: [props.key.keyArn],
        conditions: {
          StringEquals: { 'kms:ViaService': `rds.${stack.region}.amazonaws.com` },
          Bool: { 'kms:GrantIsForAWSResource': 'true' },
        },
      }),
      new iam.PolicyStatement({
        sid: 'RestoreDrillKeyDescribe',
        actions: ['kms:DescribeKey'],
        resources: [props.key.keyArn],
        conditions: { StringEquals: { 'kms:ViaService': `rds.${stack.region}.amazonaws.com` } },
      }),
      new iam.PolicyStatement({
        sid: 'SupportMailObjects',
        actions: [...SUPPORT_MAIL_OBJECT_ACTIONS],
        resources: [props.supportMail.arnForObjects(`${SUPPORT_MAIL_PREFIX}*`)],
      }),
      new iam.PolicyStatement({
        sid: 'SupportMailBucket',
        actions: [...SUPPORT_MAIL_BUCKET_ACTIONS],
        resources: [props.supportMail.bucketArn],
        conditions: { StringLike: { 's3:prefix': [`${SUPPORT_MAIL_PREFIX}*`] } },
      }),
      new iam.PolicyStatement({
        sid: 'SupportMailDecryptThroughS3',
        actions: ['kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${stack.region}.amazonaws.com` },
          ArnLike: { 'kms:EncryptionContext:aws:s3:arn': [props.supportMail.bucketArn, props.supportMail.arnForObjects('*')] },
        },
      }),
      new iam.PolicyStatement({
        sid: 'NoticeEmail',
        actions: ['ses:SendEmail'],
        resources: [props.mail.mailIdentityArn, props.mail.configurationSetArns.notices],
        conditions: { StringEquals: { 'ses:FromAddress': props.mail.mailFromAddress } },
      }),
      new iam.PolicyStatement({
        sid: 'MailProbes',
        actions: ['ses:SendEmail'],
        resources: [props.mail.mailIdentityArn, props.mail.screeningIdentityArn, ...Object.values(props.mail.configurationSetArns)],
        conditions: {
          'ForAllValues:StringEquals': { 'ses:Recipients': [...MAIL_SIMULATOR_RECIPIENTS] },
          // ForAllValues is true of a request with no value for the key, so a send whose recipients SES does not put in
          // ses:Recipients (raw content without a destination) would pass it: the key must be present as well.
          Null: { 'ses:Recipients': 'false' },
          StringEquals: { 'ses:FromAddress': [props.mail.mailFromAddress, props.mail.screeningMailFromAddress] },
        },
      }),
      new iam.PolicyStatement({
        sid: 'MailReconcileScreeningSet',
        actions: [...MAIL_RECONCILE_SET_ACTIONS],
        resources: [props.mail.configurationSetArns.screening],
      }),
      new iam.PolicyStatement({
        sid: 'MailIdentitiesRead',
        actions: ['ses:GetEmailIdentity'],
        resources: [props.mail.mailIdentityArn, props.mail.screeningIdentityArn],
      }),
      // GetAccount takes no resource.
      new iam.PolicyStatement({
        sid: 'MailAccountRead',
        actions: ['ses:GetAccount'],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        sid: 'MailEventsQueue',
        actions: [...MAIL_EVENTS_QUEUE_ACTIONS],
        resources: [props.mail.eventsQueue.queueArn],
      }),
      new iam.PolicyStatement({
        sid: 'MailEventsDecryptThroughSqs',
        actions: ['kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: { StringEquals: { 'kms:ViaService': `sqs.${stack.region}.amazonaws.com` } },
      }),
    ];
    for (const statement of statements) {
      this.role.addToPolicy(statement);
    }
  }
}
