import {
  Stack,
  aws_cloudtrail as cloudtrail,
  aws_events as events,
  aws_events_targets as targets,
  aws_guardduty as guardduty,
  aws_iam as iam,
  type aws_kms as kms,
  type aws_s3 as s3,
  type aws_sns as sns,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';
import { privateBucket } from './storage';

/** GuardDuty findings at this severity or above reach the operator (4 is the start of Medium). */
export const FINDING_ALERT_SEVERITY = 4;

/** The object GuardDuty writes to prove it can reach the bucket (Malware Protection for S3). */
const VALIDATION_OBJECT = 'malware-protection-resource-validation-object';

/** The EventBridge rules GuardDuty manages for the bucket it scans. */
const MANAGED_RULE_PREFIX = 'DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3';

export interface AccountSecurityProps {
  readonly environmentName: EnvironmentName;
  readonly key: kms.Key;
  /** The bucket whose new objects GuardDuty scans for malware. */
  readonly scannedBucket: s3.IBucket;
  readonly operatorTopic: sns.ITopic;
}

/**
 * Account-level detection (PRD 15, Stack: files, "GuardDuty malware scanning"; PRD 16, threats;
 * PRD 19, monitoring). Each environment is its own account, so each stack owns its trail and its
 * detector.
 *
 * - CloudTrail: one multi-region trail with global service events and log file validation, log
 *   files encrypted under the environment key in a private, TLS-only, versioned bucket.
 * - GuardDuty: a detector with S3 data-event and RDS login-activity monitoring, and Malware
 *   Protection for S3 on the documents bucket, which tags every new object with its scan result
 *   (the application gates parsing on it, milestone 3). Findings of Medium severity or higher go to
 *   the operator topic as a one-line message of finding type, severity and ID.
 */
export class AccountSecurity extends Construct {
  readonly trail: cloudtrail.Trail;
  readonly trailBucket: s3.Bucket;
  readonly detector: guardduty.CfnDetector;
  readonly malwareProtection: guardduty.CfnMalwareProtectionPlan;

  constructor(scope: Construct, id: string, props: AccountSecurityProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const trailName = `tp-${props.environmentName}-account`;

    this.trailBucket = privateBucket(this, 'TrailBucket', props.key);
    const trailArn = `arn:${stack.partition}:cloudtrail:${stack.region}:${stack.account}:trail/${trailName}`;
    const cloudtrailPrincipal = new iam.ServicePrincipal('cloudtrail.amazonaws.com');
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudTrailEncryptLogs',
        principals: [cloudtrailPrincipal],
        actions: ['kms:GenerateDataKey*'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'aws:SourceArn': trailArn },
          StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': `arn:${stack.partition}:cloudtrail:*:${stack.account}:trail/*` },
        },
      }),
    );
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudTrailDescribeKey',
        principals: [cloudtrailPrincipal],
        actions: ['kms:DescribeKey'],
        resources: ['*'],
        conditions: { StringEquals: { 'aws:SourceArn': trailArn } },
      }),
    );
    this.trail = new cloudtrail.Trail(this, 'Trail', {
      trailName,
      bucket: this.trailBucket,
      encryptionKey: props.key,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
      managementEvents: cloudtrail.ReadWriteType.ALL,
      sendToCloudWatchLogs: false,
    });

    this.detector = new guardduty.CfnDetector(this, 'Detector', {
      enable: true,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      features: [
        { name: 'S3_DATA_EVENTS', status: 'ENABLED' },
        { name: 'RDS_LOGIN_EVENTS', status: 'ENABLED' },
      ],
    });

    const scanRole = this.malwareProtectionRole(props);
    this.malwareProtection = new guardduty.CfnMalwareProtectionPlan(this, 'DocumentsMalwareProtection', {
      role: scanRole.roleArn,
      protectedResource: { s3Bucket: { bucketName: props.scannedBucket.bucketName } },
      actions: { tagging: { status: 'ENABLED' } },
    });
    // GuardDuty validates the role's permissions when the plan is created.
    this.malwareProtection.node.addDependency(scanRole);

    new events.Rule(this, 'GuardDutyFindings', {
      description: `GuardDuty findings of severity ${String(FINDING_ALERT_SEVERITY)} or more to the operator`,
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
        detail: { severity: events.Match.greaterThanOrEqual(FINDING_ALERT_SEVERITY) },
      },
      targets: [
        // EventBridge publishes through a role of its own, so neither the topic nor the key has to
        // admit the EventBridge service principal.
        new targets.SnsTopic(props.operatorTopic, {
          authorizeUsingRole: true,
          message: events.RuleTargetInput.fromText(
            [
              `GuardDuty finding ${events.EventField.fromPath('$.detail.type')}`,
              `(severity ${events.EventField.fromPath('$.detail.severity')})`,
              `in ${props.environmentName}: ${events.EventField.fromPath('$.detail.id')}`,
            ].join(' '),
          ),
        }),
      ],
    });
  }

  /** The role GuardDuty assumes to scan the bucket (the policy Malware Protection for S3 requires). */
  private malwareProtectionRole(props: AccountSecurityProps): iam.Role {
    const stack = Stack.of(this);
    const bucket = props.scannedBucket;
    const managedRules = `arn:${stack.partition}:events:${stack.region}:${stack.account}:rule/${MANAGED_RULE_PREFIX}*`;
    const role = new iam.Role(this, 'MalwareProtectionRole', {
      description: 'GuardDuty Malware Protection for S3: scans and tags new documents',
      assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
      }),
    });
    const statements = [
      new iam.PolicyStatement({
        sid: 'ManagedRuleForS3Events',
        actions: ['events:PutRule', 'events:DeleteRule', 'events:PutTargets', 'events:RemoveTargets'],
        resources: [managedRules],
        conditions: { StringLike: { 'events:ManagedBy': 'malware-protection-plan.guardduty.amazonaws.com' } },
      }),
      new iam.PolicyStatement({
        sid: 'MonitorManagedRule',
        actions: ['events:DescribeRule', 'events:ListTargetsByRule'],
        resources: [managedRules],
      }),
      new iam.PolicyStatement({
        sid: 'TagScannedObjects',
        actions: ['s3:PutObjectTagging', 's3:GetObjectTagging', 's3:PutObjectVersionTagging', 's3:GetObjectVersionTagging'],
        resources: [bucket.arnForObjects('*')],
      }),
      new iam.PolicyStatement({
        sid: 'EnableBucketEvents',
        actions: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
        resources: [bucket.bucketArn],
      }),
      new iam.PolicyStatement({
        sid: 'PutValidationObject',
        actions: ['s3:PutObject'],
        resources: [bucket.arnForObjects(VALIDATION_OBJECT)],
      }),
      new iam.PolicyStatement({ sid: 'CheckBucketOwnership', actions: ['s3:ListBucket'], resources: [bucket.bucketArn] }),
      new iam.PolicyStatement({
        sid: 'ReadObjectsToScan',
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [bucket.arnForObjects('*')],
      }),
      new iam.PolicyStatement({
        sid: 'DecryptObjectsToScan',
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: { StringEquals: { 'kms:ViaService': `s3.${stack.region}.amazonaws.com` } },
      }),
    ];
    for (const statement of statements) {
      role.addToPolicy(statement);
    }
    return role;
  }
}
